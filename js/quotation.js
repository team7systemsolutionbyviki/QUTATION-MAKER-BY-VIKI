import { auth, db, collection, addDoc, getDocs, doc, deleteDoc, query, where, orderBy, getDoc, updateDoc } from './firebase.js';
import { showToast, showLoader, hideLoader, formatCurrency, currentUser, generateId, businessData } from './app.js';

const listSection = document.getElementById('listSection');
const makeSection = document.getElementById('makeSection');
const btnToggleView = document.getElementById('btnToggleView');
const pageTitle = document.getElementById('pageTitle');
const toggleIcon = document.getElementById('toggleIcon');
const qNumber = document.getElementById('qNumber');
const qDate = document.getElementById('qDate');
const customerSelect = document.getElementById('customerSelect');
const itemsContainer = document.getElementById('itemsContainer');
const btnAddItemRow = document.getElementById('btnAddItemRow');
const quotationList = document.getElementById('quotationList');

let isMakeMode = false;
let editingId = null;
let products = [];
let customers = [];
let quotations = [];

// Initialize
auth.onAuthStateChanged(async user => {
    if(user) {
        showLoader();
        try {
            await Promise.all([
                loadCustomers(),
                loadProducts(),
                loadQuotations()
            ]);
        } catch (e) {
            console.error("Data loading error", e);
            showToast("Failed to load some data", true);
        }
        hideLoader();

        // check url params
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        if(action === 'make') {
            toggleMode(true);
        } else {
            toggleMode(false);
        }

        // Load default terms
        try {
            const snap = await getDoc(doc(db, "doc_settings", user.uid));
            if(snap.exists() && snap.data().quotation) {
                const termsEl = document.getElementById('qTerms');
                if(termsEl) termsEl.value = snap.data().quotation;
            }
        } catch(e) { console.warn("Error loading terms", e); }
    }
});

function toggleMode(forceMake = null) {
    if (forceMake !== null) {
        isMakeMode = forceMake;
    } else {
        isMakeMode = !isMakeMode;
    }
    
    if(isMakeMode) {
        listSection.classList.remove('active-section');
        makeSection.classList.add('active-section');
        btnToggleView.innerHTML = '<i class="fas fa-list"></i>';
        pageTitle.textContent = editingId ? 'Edit Quotation' : 'Make Quotation';
        
        if (!editingId) {
            // initialize new form
            qNumber.value = generateId('QT-');
            qDate.valueAsDate = new Date();
            itemsContainer.innerHTML = '';
            addItemRow();
        }
    } else {
        editingId = null;
        makeSection.classList.remove('active-section');
        listSection.classList.add('active-section');
        btnToggleView.innerHTML = '<i class="fas fa-plus"></i>';
        pageTitle.textContent = 'Quotations';
    }
}

btnToggleView.addEventListener('click', () => toggleMode());
document.getElementById('fabAdd').addEventListener('click', () => {
    editingId = null;
    toggleMode(true);
});

// Load Support Data
async function loadCustomers() {
    const q = query(collection(db, "customers"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    customers = [];
    snap.forEach(doc => {
        customers.push({ id: doc.id, ...doc.data() });
    });
    customers.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    
    customerSelect.innerHTML = '<option value="">-- Choose Customer --</option>';
    customers.forEach(c => {
        let opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} ${c.company ? '- ' + c.company : ''}`;
        customerSelect.appendChild(opt);
    });
}

customerSelect.addEventListener('change', (e) => {
    const box = document.getElementById('customerDetailsBox');
    if(!e.target.value) {
        box.style.display = 'none';
        return;
    }
    const c = customers.find(x => x.id === e.target.value);
    if(c) {
        box.style.display = 'block';
        document.getElementById('cdName').textContent = c.name + (c.company ? ` (${c.company})` : '');
        document.getElementById('cdPhone').textContent = c.phone || '';
        document.getElementById('cdAddress').textContent = c.address || '';
        document.getElementById('cdGST').textContent = c.gst ? `GST: ${c.gst}` : '';
    }
});

async function loadProducts() {
    const q = query(collection(db, "products"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    products = [];
    snap.forEach(doc => {
        products.push({ id: doc.id, ...doc.data() });
    });
    products.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
}

// Item Rows Logic
function addItemRow() {
    const rowId = `row_${Date.now()}`;
    const div = document.createElement('div');
    div.className = 'product-row list-item';
    div.id = rowId;
    
    let options = '<option value="">Select Item</option>';
    products.forEach(p => {
        options += `<option value="${p.id}" data-price="${p.sellingPrice}" data-gst="${p.gstRate}">${p.name}</option>`;
    });

    div.innerHTML = `
        <div>
            <label class="d-md-none">Product</label>
            <select class="form-control item-select" required onchange="itemSelected('${rowId}')">
                ${options}
            </select>
        </div>
        <div>
            <label class="d-md-none">Price/Unit</label>
            <input type="number" step="0.01" class="form-control item-price" oninput="calculateTotals()" required readonly>
        </div>
        <div>
            <label class="d-md-none">Qty</label>
            <input type="number" step="1" value="1" class="form-control item-qty" oninput="calculateTotals()" required>
        </div>
        <div>
            <label class="d-md-none">Total</label>
            <input type="number" class="form-control item-total" readonly>
        </div>
        <div>
            <button type="button" class="btn btn-sm btn-danger mt-md-4" onclick="removeRow('${rowId}')"><i class="fas fa-times"></i></button>
        </div>
    `;
    itemsContainer.appendChild(div);
}

btnAddItemRow.addEventListener('click', addItemRow);

document.getElementById('btnRefreshProducts').addEventListener('click', async () => {
    showLoader();
    try {
        await loadProducts();
        
        // Update all existing dropdowns with the new products list while preserving selected values
        const selects = document.querySelectorAll('.item-select');
        selects.forEach(select => {
            const selectedVal = select.value;
            let options = '<option value="">Select Item</option>';
            products.forEach(p => {
                const selected = p.id === selectedVal ? 'selected' : '';
                options += `<option value="${p.id}" data-price="${p.sellingPrice}" data-gst="${p.gstRate}" ${selected}>${p.name}</option>`;
            });
            select.innerHTML = options;
        });
        showToast("Products list refreshed!");
    } catch (e) {
        console.error("Error refreshing products", e);
        showToast("Failed to refresh products", true);
    } finally {
        hideLoader();
    }
});

window.itemSelected = (rowId) => {
    const row = document.getElementById(rowId);
    const select = row.querySelector('.item-select');
    const option = select.options[select.selectedIndex];
    if(option.value) {
        row.querySelector('.item-price').value = option.dataset.price;
        // make it editable if selected
        row.querySelector('.item-price').readOnly = false;
    } else {
        row.querySelector('.item-price').value = '';
        row.querySelector('.item-price').readOnly = true;
    }
    calculateTotals();
};

window.removeRow = (rowId) => {
    document.getElementById(rowId).remove();
    calculateTotals();
};

window.calculateTotals = () => {
    let subTotal = 0;
    let totalTax = 0;
    const gstEnabled = document.getElementById('chkEnableGst').checked;

    const rows = document.querySelectorAll('.product-row');
    rows.forEach(row => {
        const select = row.querySelector('.item-select');
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        
        let rowTotal = price * qty;
        row.querySelector('.item-total').value = rowTotal.toFixed(2);
        
        subTotal += rowTotal;

        if(select.selectedIndex > 0 && gstEnabled) {
            const gstRate = parseFloat(select.options[select.selectedIndex].dataset.gst) || 0;
            totalTax += (rowTotal * gstRate) / 100;
        }
    });

    const otherCharges = parseFloat(document.getElementById('otherCharges').value) || 0;
    const grandTotal = subTotal + totalTax + otherCharges;

    document.getElementById('lblSubtotal').textContent = formatCurrency(subTotal);
    document.getElementById('lblTax').textContent = formatCurrency(totalTax);
    document.getElementById('lblTax').parentElement.style.display = gstEnabled ? 'block' : 'none';
    document.getElementById('lblOther').textContent = formatCurrency(otherCharges);
    document.getElementById('lblGrandTotal').textContent = formatCurrency(grandTotal);
};

// Save logic
document.getElementById('quotationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!customerSelect.value) { showToast("Please select a customer", true); return; }
    
    const rows = document.querySelectorAll('.product-row');
    if(rows.length === 0) { showToast("Add at least one item", true); return; }

    const items = [];
    let hasEmpty = false;
    let subTotal = 0, totalTax = 0;

    const gstEnabled = document.getElementById('chkEnableGst').checked;

    rows.forEach(row => {
        const sel = row.querySelector('.item-select');
        if(!sel.value) hasEmpty = true;
        
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const gstRate = parseFloat(sel.options[sel.selectedIndex].dataset.gst) || 0;
        const name = sel.options[sel.selectedIndex].text.trim();
        
        const total = price * qty;
        subTotal += total;
        if(gstEnabled) {
            totalTax += (total * gstRate) / 100;
        }
        
        items.push({
            productId: sel.value,
            name: name,
            price: price,
            qty: qty,
            gstRate: gstRate,
            total: total
        });
    });

    if(hasEmpty) { showToast("Please select products for all rows", true); return; }

    const otherCharges = parseFloat(document.getElementById('otherCharges').value) || 0;
    const grandTotal = subTotal + totalTax + otherCharges;
    const customer = customers.find(c => c.id === customerSelect.value);
    if(!customer) {
        showToast("Selected customer not found in database", true);
        return;
    }

    const docData = {
        quotationNo: qNumber.value,
        date: qDate.value,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '',
        customerCompany: customer.company || '',
        items: items,
        subTotal: subTotal,
        totalTax: totalTax,
        otherCharges: otherCharges,
        grandTotal: grandTotal,
        isGstEnabled: gstEnabled,
        terms: document.getElementById('qTerms').value,
        updatedAt: new Date().toISOString()
    };

    showLoader();
    try {
        if (editingId) {
            await updateDoc(doc(db, "quotations", editingId), docData);
            showToast("Quotation Updated!");
        } else {
            docData.userId = currentUser.uid;
            docData.createdAt = new Date().toISOString();
            await addDoc(collection(db, "quotations"), docData);
            showToast("Quotation Created!");
        }
        loadQuotations();
        
        // Generate PDF and redirect or show list
        generatePDF({ ...docData, ... (editingId ? {} : {createdAt: docData.updatedAt}) }, customer, true);
        
        document.getElementById('quotationForm').reset();
        itemsContainer.innerHTML = '';
        document.getElementById('customerDetailsBox').style.display = 'none';
        editingId = null;
        toggleMode(false);
        
    } catch(err) {
        console.error("Error saving quotation", err);
        showToast("Error saving quotation: " + err.message, true);
    } finally {
        hideLoader();
    }
});

// List Logic
async function loadQuotations() {
    const q = query(collection(db, "quotations"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    quotations = [];
    snap.forEach(doc => { quotations.push({ id: doc.id, ...doc.data() }); });
    filterAndSortQuotations();
}

function renderQuotations(data) {
    quotationList.innerHTML = '';
    if(data.length === 0) {
        quotationList.innerHTML = '<div class="text-center text-muted p-4"><i class="fas fa-file-invoice fa-3x mb-3"></i><p>No quotations found.</p></div>';
        return;
    }

    data.forEach(q => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div class="list-item-content">
                <h4 class="text-primary mb-1">${q.quotationNo} <span class="text-muted fs-6" style="float:right">${q.date}</span></h4>
                <p class="font-weight-bold mb-1">${q.customerName} ${q.customerCompany ? `- ${q.customerCompany}` : ''}</p>
                <p>
                    <span class="text-success" style="font-weight:600;font-size:1.1rem">${formatCurrency(q.grandTotal)}</span>
                </p>
            </div>
            <div class="list-item-actions ml-2" style="flex-direction:column; align-items:flex-end;">
                <button class="btn btn-sm btn-outline mb-2 text-primary border-primary" onclick="window.makeInvoice('${q.id}')"><i class="fas fa-file-invoice-dollar"></i> Create Invoice</button>
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-sm btn-outline mb-2" onclick="window.editQ('${q.id}')"><i class="fas fa-edit text-info"></i></button>
                    <button class="btn btn-sm btn-outline mb-2" onclick="downloadQ('${q.id}')"><i class="fas fa-file-pdf text-danger"></i></button>
                    <button class="btn btn-sm btn-outline mb-2" onclick="shareWa('${q.id}')"><i class="fab fa-whatsapp text-success"></i></button>
                    <button class="btn btn-sm btn-outline text-danger border-0" onclick="deleteQ('${q.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        quotationList.appendChild(div);
    });
}

function filterAndSortQuotations() {
    let result = [...quotations];
    
    // 1. Search Query Filter
    const searchVal = document.getElementById('searchInput').value.toLowerCase();
    if(searchVal) {
        result = result.filter(q => 
            q.quotationNo.toLowerCase().includes(searchVal) || 
            q.customerName.toLowerCase().includes(searchVal) ||
            (q.customerCompany && q.customerCompany.toLowerCase().includes(searchVal))
        );
    }
    
    // 2. Date Range Filter
    const startVal = document.getElementById('filterStartDate').value;
    const endVal = document.getElementById('filterEndDate').value;
    if(startVal) {
        result = result.filter(q => q.date >= startVal);
    }
    if(endVal) {
        result = result.filter(q => q.date <= endVal);
    }
    
    // 3. Sort
    const sortVal = document.getElementById('sortOption').value;
    if(sortVal === 'dateDesc') {
        result.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
    } else if(sortVal === 'dateAsc') {
        result.sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));
    } else if(sortVal === 'amountDesc') {
        result.sort((a, b) => (b.grandTotal || 0) - (a.grandTotal || 0));
    } else if(sortVal === 'amountAsc') {
        result.sort((a, b) => (a.grandTotal || 0) - (b.grandTotal || 0));
    } else if(sortVal === 'nameAsc') {
        result.sort((a, b) => (a.customerName || '').localeCompare(b.customerName || ''));
    } else if(sortVal === 'nameDesc') {
        result.sort((a, b) => (b.customerName || '').localeCompare(a.customerName || ''));
    }
    
    renderQuotations(result);
}

document.getElementById('searchInput').addEventListener('input', filterAndSortQuotations);
document.getElementById('filterStartDate').addEventListener('change', filterAndSortQuotations);
document.getElementById('filterEndDate').addEventListener('change', filterAndSortQuotations);
document.getElementById('sortOption').addEventListener('change', filterAndSortQuotations);

document.getElementById('btnClearDateFilter').addEventListener('click', () => {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    filterAndSortQuotations();
});

// External Functions
window.deleteQ = async (id) => {
    if(confirm("Delete this quotation?")) {
        showLoader();
        try {
            await deleteDoc(doc(db, "quotations", id));
            showToast("Quotation deleted");
            loadQuotations();
        } catch(e) {
            showToast("Error deleting", true);
        } finally {
            hideLoader();
        }
    }
};

window.downloadQ = (id) => {
    const q = quotations.find(x => x.id === id);
    const c = customers.find(x => x.id === q.customerId);
    generatePDF(q, c, false);
};

window.shareWa = (id) => {
    const q = quotations.find(x => x.id === id);
    if (!q) return;

    // Sanitize phone: remove any non-digit characters
    const cleanPhone = (q.customerPhone || '').replace(/\D/g, '');

    const bName = businessData ? businessData.name : '';
    const msg = `Hello ${q.customerName},\n\nHere is your Quotation No: ${q.quotationNo}\nDate: ${q.date}\nAmount: ${formatCurrency(q.grandTotal)}\n\nThank you for business with ${bName || 'us'}.`;
    
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

window.makeInvoice = (id) => {
    window.location.href = `invoice.html?quotationId=${id}`;
};

window.editQ = (id) => {
    const q = quotations.find(x => x.id === id);
    if (!q) return;
    
    editingId = id;
    toggleMode(true);
    
    // Fill basic info
    qNumber.value = q.quotationNo;
    qDate.value = q.date;
    customerSelect.value = q.customerId;
    customerSelect.dispatchEvent(new Event('change'));
    
    if (q.isGstEnabled !== undefined) {
        document.getElementById('chkEnableGst').checked = q.isGstEnabled;
    }
    if (q.otherCharges !== undefined) {
        document.getElementById('otherCharges').value = q.otherCharges;
    }
    if (q.terms) {
        document.getElementById('qTerms').value = q.terms;
    }

    // Fill items
    itemsContainer.innerHTML = '';
    if (q.items && q.items.length > 0) {
        q.items.forEach(item => {
            const rowId = `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const div = document.createElement('div');
            div.className = 'product-row list-item';
            div.id = rowId;
            
            let options = '<option value="">Select Item</option>';
            products.forEach(p => {
                const selected = p.id === item.productId ? 'selected' : '';
                options += `<option value="${p.id}" data-price="${p.sellingPrice}" data-gst="${p.gstRate}" ${selected}>${p.name}</option>`;
            });

            div.innerHTML = `
                <div>
                    <label class="d-md-none">Product</label>
                    <select class="form-control item-select" required onchange="itemSelected('${rowId}')">${options}</select>
                </div>
                <div>
                    <label class="d-md-none">Price/Unit</label>
                    <input type="number" step="0.01" class="form-control item-price" value="${item.price}" oninput="calculateTotals()" required>
                </div>
                <div>
                    <label class="d-md-none">Qty</label>
                    <input type="number" step="1" value="${item.qty}" class="form-control item-qty" oninput="calculateTotals()" required>
                </div>
                <div>
                    <label class="d-md-none">Total</label>
                    <input type="number" class="form-control item-total" value="${item.total.toFixed(2)}" readonly>
                </div>
                <div>
                    <button type="button" class="btn btn-sm btn-danger mt-md-4" onclick="removeRow('${rowId}')"><i class="fas fa-times"></i></button>
                </div>
            `;
            itemsContainer.appendChild(div);
        });
    }
    calculateTotals();
};

const numberToWords = (num) => {
    num = Math.floor(num);
    const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
    const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
    if (num === 0) return 'Zero Rupees Only/-';
    if (num.toString().length > 9) return num + ' Rupees Only/-';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return; let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str.trim() + ' Rupees Only/-';
};

// PDF Generation using html2pdf
function generatePDF(qData, cData, autoOpen = false) {
    const template = document.getElementById('pdfTemplate');
    template.style.display = 'block';
    
    // Header
    let bzName = businessData ? businessData.name : 'Your Business Name';
    let bzOwner = businessData && businessData.owner ? businessData.owner : '';
    let bzAddress = businessData && businessData.address ? businessData.address : '';
    let bzPhone = businessData && businessData.phone ? businessData.phone : '';
    let bzEmail = businessData && businessData.email ? businessData.email : '';
    
    let headerLogoHtml = '';
    if(businessData && businessData.logoUrl) {
        headerLogoHtml = `<img src="${businessData.logoUrl}" style="max-height: 60px; max-width: 200px; margin-bottom: 10px; display: block;">`;
    }
    
    let itemsHtml = '';
    qData.items.forEach((it, i) => {
        itemsHtml += `<tr style="border-bottom: 1px solid #ddd; page-break-inside: avoid; break-inside: avoid;">
            <td style="padding: 10px 5px; vertical-align: top;">${i+1}</td>
            <td style="padding: 10px 5px; vertical-align: top;">
                <strong style="font-size: 11px;">${String(it.name).replace(/\s*\(GST\s*\d+(\.\d+)?%\)/i, '').trim()}</strong>
                <div style="font-size: 10px; color: #444; margin-top: 2px;">${it.description || ''}</div>
            </td>
            <td style="padding: 10px 5px; text-align: right; vertical-align: top;">
                ${it.qty}<br><span style="font-size: 9px;">${it.unit || 'Nos'}</span>
            </td>
            <td style="padding: 10px 5px; text-align: right; vertical-align: top;">₹${it.price.toFixed(2)}</td>
            <td style="padding: 10px 5px; text-align: right; vertical-align: top;">₹${it.total.toFixed(2)}</td>
        </tr>`;
    });
    
    let amountWords = numberToWords(qData.grandTotal);
    let upiId = 'N/A';
    let qrHtml = '';
    let signHtml = '';
    
    if (businessData && businessData.upi) {
        upiId = businessData.upi;
        qrHtml = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(bzName)}" crossorigin="anonymous" style="width:70px;height:70px;">`;
    } else {
        qrHtml = `<div style="width:70px;height:70px;background:#f3f3f3;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:8px;color:#999;">QR Code</div>`;
    }
    
    if (businessData && businessData.signature) {
        signHtml = `<img src="${businessData.signature}" style="max-height: 40px;">`;
    } else {
        signHtml = `<div style="height:40px;"></div>`;
    }

    const layoutHtml = `
        <div id="pdfPrintableForm" style="width: 794px; background:#fff; padding: 40px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #000; box-sizing: border-box; text-align: left;">
            
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px; text-align: left;">
                <tr>
                    <td valign="top" width="60%">
                        ${headerLogoHtml}
                        <h2 style="margin:0; font-size:16px;">${bzName.toUpperCase()}</h2>
                        <div style="margin-top:2px;">${bzOwner}</div>
                        <div style="margin-top:2px; max-width:250px;">${bzAddress}</div>
                        <div style="margin-top:2px;">${bzPhone} ${bzEmail}</div>
                    </td>
                    <td valign="top" width="40%" align="right">
                        <h1 style="margin:0; font-size:24px; color:#333; letter-spacing: 1px;">QUOTATION</h1>
                    </td>
                </tr>
            </table>
            
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px; text-align: left;">
                <tr>
                    <td valign="top" width="35%">
                        <strong style="font-size: 9px;">QUOTATION TO</strong>
                        <div style="font-weight: bold; margin-top:3px; font-size:11px;">${qData.customerName}</div>
                        <div style="margin-top:2px;">${cData ? cData.address || '' : ''}</div>
                        <div style="margin-top:2px;">${qData.customerPhone}</div>
                    </td>
                    <td valign="top" width="35%">
                        <strong style="font-size: 9px;">SHIP TO</strong>
                        <div style="font-weight: bold; margin-top:3px; font-size:11px;">${qData.customerName}</div>
                    </td>
                    <td valign="top" width="30%" align="right">
                        <table width="100%" cellpadding="2" cellspacing="0" style="font-size: 10px; font-weight: bold; text-align: right;">
                            <tr><td align="right" style="padding-right:10px;">Quotation#</td><td align="right">${qData.quotationNo}</td></tr>
                            <tr><td align="right" style="padding-right:10px;">Quotation Date:</td><td align="right">${qData.date}</td></tr>
                        </table>
                    </td>
                </tr>
            </table>
            
            <div style="margin-bottom: 15px; border-top: 2px solid #000; border-bottom: 2px solid #000;">
                <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: left;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 6px 5px; width: 5%;">#</th>
                            <th style="text-align: left; padding: 6px 5px; width: 45%;">DESCRIPTION</th>
                            <th style="text-align: right; padding: 6px 5px; width: 15%;">QTY</th>
                            <th style="text-align: right; padding: 6px 5px; width: 15%;">PRICE</th>
                            <th style="text-align: right; padding: 6px 5px; width: 20%;">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody style="border-top: 1px solid #000; border-bottom: 1px solid #000;">
                        ${itemsHtml}
                    </tbody>
                </table>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 40px; text-align: left; page-break-inside: avoid; break-inside: avoid;">
                <tr>
                    <td valign="top" width="60%">
                        <strong style="font-size: 9px;">AMOUNT IN WORDS:</strong>
                        <div style="margin-top: 3px;">${amountWords}</div>
                    </td>
                    <td valign="top" width="40%">
                        <table style="width: 100%; font-size: 11px; text-align: right;">
                            ${qData.isGstEnabled !== false ? `
                            <tr>
                                <td style="padding: 4px 0; text-align: left; color:#555;">Subtotal</td>
                                <td style="text-align: right; padding: 4px 0;">₹${(qData.subTotal || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 0; text-align: left; color:#555;">GST</td>
                                <td style="text-align: right; padding: 4px 0;">₹${(qData.totalTax || 0).toFixed(2)}</td>
                            </tr>
                            ${(qData.otherCharges > 0) ? `
                            <tr>
                                <td style="padding: 4px 0; text-align: left; color:#555;">Other Charges</td>
                                <td style="text-align: right; padding: 4px 0;">₹${qData.otherCharges.toFixed(2)}</td>
                            </tr>
                            ` : ''}
                            ` : `
                            ${(qData.otherCharges > 0) ? `
                            <tr>
                                <td style="padding: 4px 0; text-align: left; color:#555;">Other Charges</td>
                                <td style="text-align: right; padding: 4px 0;">₹${qData.otherCharges.toFixed(2)}</td>
                            </tr>
                            ` : ''}
                            `}
                            <tr style="border-top: 2px solid #000; border-bottom: 2px solid #000; font-weight: bold;">
                                <td style="padding: 6px 0; text-align: left;">GRAND TOTAL</td>
                                <td style="text-align: right; padding: 6px 0;">₹${qData.grandTotal.toFixed(2)}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="text-align: left; page-break-inside: avoid; break-inside: avoid;">
                <tr>
                    <td valign="top" width="50%">
                        <strong style="font-size: 9px;">Payment Instructions</strong>
                        <div style="margin-top: 3px;">UPI ID: ${upiId}</div>
                        <div style="margin-top: 5px;">
                            ${qrHtml}
                        </div>
                    </td>
                    <td valign="bottom" width="50%" align="right">
                        <div style="font-weight: bold; font-size: 11px;">For, ${bzName.toUpperCase()}</div>
                        <div style="margin-top: 10px; min-height:40px;">
                            ${signHtml}
                        </div>
                        <div style="font-size: 8px; margin-top: 5px; color:#555;">AUTHORIZED SIGNATURE</div>
                    </td>
                </tr>
            </table>
            
            ${qData.terms ? `<div style="margin-top:30px; border-top:1px dashed #ccc; padding-top:10px; page-break-inside: avoid; break-inside: avoid;"><strong style="font-size:9px;">Terms & Conditions:</strong><br><span style="font-size:9px; white-space:pre-line;">${qData.terms}</span></div>` : ''}
        </div>
    `;

    var opt = {
      margin:       0,
      filename:     `Quotation_${qData.quotationNo}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    html2pdf().set(opt).from(layoutHtml).save().then(() => {
        if(autoOpen) {
            // done
        }
    });
}
