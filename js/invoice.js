import { auth, db, collection, addDoc, getDocs, doc, deleteDoc, query, where, orderBy, getDoc, updateDoc } from './firebase.js';
import { showToast, showLoader, hideLoader, formatCurrency, currentUser, generateId, businessData } from './app.js';

const listSection = document.getElementById('listSection');
const makeSection = document.getElementById('makeSection');
const btnToggleView = document.getElementById('btnToggleView');
const pageTitle = document.getElementById('pageTitle');
const toggleIcon = document.getElementById('toggleIcon');
const iNumber = document.getElementById('iNumber');
const iDate = document.getElementById('iDate');
const poNumber = document.getElementById('poNumber');
const dueDate = document.getElementById('dueDate');
const amountPaid = document.getElementById('amountPaid');
const customerSelect = document.getElementById('customerSelect');
const itemsContainer = document.getElementById('itemsContainer');
const btnAddItemRow = document.getElementById('btnAddItemRow');
const invoiceList = document.getElementById('invoiceList');

let isMakeMode = false;
let editingId = null;
let products = [];
let customers = [];
let invoices = [];

// Initialize
auth.onAuthStateChanged(async user => {
    if(user) {
        showLoader();
        try {
            await Promise.all([
                loadCustomers(),
                loadProducts(),
                loadInvoices()
            ]);
        } catch (e) {
            console.error("Data loading error", e);
            showToast("Failed to load some data", true);
        }
        hideLoader();

        const urlParams = new URLSearchParams(window.location.search);
        if(urlParams.get('action') === 'make') toggleMode(true);
        else toggleMode(false);

        // Populate from quotation if ID provided
        const qId = urlParams.get('quotationId');
        if (qId) {
            showLoader();
            try {
                const qSnap = await getDoc(doc(db, "quotations", qId));
                if (qSnap.exists()) {
                    const qData = qSnap.data();
                    toggleMode(true);
                    
                    // Fill basic info
                    customerSelect.value = qData.customerId;
                    customerSelect.dispatchEvent(new Event('change'));
                    
                    if (qData.isGstEnabled !== undefined) {
                        document.getElementById('chkEnableGst').checked = qData.isGstEnabled;
                    }
                    if (qData.otherCharges !== undefined) {
                        document.getElementById('otherCharges').value = qData.otherCharges;
                    }
                    if (qData.terms) {
                        document.getElementById('iTerms').value = qData.terms;
                    }

                    // Fill items
                    itemsContainer.innerHTML = '';
                    if (qData.items && qData.items.length > 0) {
                        for (const item of qData.items) {
                            const rowId = `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                            const div = document.createElement('div');
                            div.className = 'product-row list-item';
                            div.id = rowId;
                            
                            let options = '<option value="">Select Item</option>';
                            products.forEach(p => {
                                const selected = p.id === item.productId ? 'selected' : '';
                                options += `<option value="${p.id}" data-price="${p.sellingPrice}" data-gst="${p.gstRate}" data-desc="${p.description || ''}" data-unit="${p.unit || 'Nos'}" ${selected}>${p.name}</option>`;
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
                        }
                    }
                    calculateTotals();
                }
            } catch (e) {
                console.error("Error loading quotation", e);
                showToast("Failed to load quotation details", true);
            }
            hideLoader();
        }

        // Load default terms
        try {
            const snap = await getDoc(doc(db, "doc_settings", user.uid));
            if(snap.exists() && snap.data().invoice) {
                const termsEl = document.getElementById('iTerms');
                if(termsEl) termsEl.value = snap.data().invoice;
            }
        } catch(e) { console.warn("Error loading terms", e); }
    }
});

function toggleMode(forceMake = null) {
    if (forceMake !== null) isMakeMode = forceMake;
    else isMakeMode = !isMakeMode;
    
    if(isMakeMode) {
        listSection.classList.remove('active-section');
        makeSection.classList.add('active-section');
        btnToggleView.innerHTML = '<i class="fas fa-list"></i>';
        pageTitle.textContent = editingId ? 'Edit Invoice' : 'Make Invoice';
        
        if (!editingId) {
            iNumber.value = generateId('INV-');
            iDate.valueAsDate = new Date();
            itemsContainer.innerHTML = '';
            addItemRow();
        }
    } else {
        editingId = null;
        makeSection.classList.remove('active-section');
        listSection.classList.add('active-section');
        btnToggleView.innerHTML = '<i class="fas fa-plus"></i>';
        pageTitle.textContent = 'Invoices';
    }
}

btnToggleView.addEventListener('click', () => toggleMode());
document.getElementById('fabAdd').addEventListener('click', () => {
    editingId = null;
    toggleMode(true);
});

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
    if(!e.target.value) { box.style.display = 'none'; return; }
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
    snap.forEach(d => { products.push({ id: d.id, ...d.data() }); });
    products.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
}

function addItemRow() {
    const rowId = `row_${Date.now()}`;
    const div = document.createElement('div');
    div.className = 'product-row list-item';
    div.id = rowId;
    
    let options = '<option value="">Select Item</option>';
    products.forEach(p => {
        options += `<option value="${p.id}" data-price="${p.sellingPrice}" data-gst="${p.gstRate}" data-desc="${p.description || ''}" data-unit="${p.unit || 'Nos'}">${p.name}</option>`;
    });

    div.innerHTML = `
        <div>
            <label class="d-md-none">Product</label>
            <select class="form-control item-select" required onchange="itemSelected('${rowId}')">${options}</select>
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

window.itemSelected = (rowId) => {
    const row = document.getElementById(rowId);
    const select = row.querySelector('.item-select');
    const option = select.options[select.selectedIndex];
    if(option.value) {
        row.querySelector('.item-price').value = option.dataset.price;
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

window.calculateReturn = () => {
    const total = parseFloat(document.getElementById('lblGrandTotal').textContent.replace(/[^\d.]/g, '')) || 0;
    const given = parseFloat(document.getElementById('calcAmountGiven').value) || 0;
    const amountReturn = Math.max(0, given - total);
    document.getElementById('lblReturnAmount').textContent = formatCurrency(amountReturn);
};

window.updateFamilyFriendsMode = () => {
    const isMode = document.getElementById('chkFamilyFriends').checked;
    document.getElementById('familyFriendsNote').style.display = isMode ? 'block' : 'none';
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
    
    // Recalculate return if any value entered
    if(document.getElementById('calcAmountGiven').value) {
        calculateReturn();
    }
};

// Save logic
document.getElementById('invoiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!customerSelect.value) { showToast("Please select a customer", true); return; }
    
    const rows = document.querySelectorAll('.product-row');
    if(rows.length === 0) { showToast("Add at least one item", true); return; }

    const items = [];
    let hasEmpty = false;
    let subTotal = 0;
    let totalTax = 0;
    const gstEnabled = document.getElementById('chkEnableGst').checked;

    rows.forEach(row => {
        const sel = row.querySelector('.item-select');
        if(!sel.value) {
            hasEmpty = true;
            return;
        }
        
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const gstRate = parseFloat(sel.options[sel.selectedIndex].dataset.gst) || 0;
        const name = sel.options[sel.selectedIndex].text.trim();
        const desc = sel.options[sel.selectedIndex].dataset.desc || '';
        const unit = sel.options[sel.selectedIndex].dataset.unit || 'Nos';
        
        const total = price * qty;
        subTotal += total;
        if(gstEnabled) {
            totalTax += (total * gstRate) / 100;
        }
        
        items.push({ 
            productId: sel.value, 
            name: name, 
            description: desc,
            unit: unit,
            price: price, 
            qty: qty, 
            gstRate: gstRate, 
            total: total 
        });
    });

    if(hasEmpty) { showToast("Select products for all rows", true); return; }

    const otherCharges = parseFloat(document.getElementById('otherCharges').value) || 0;
    const grandTotal = subTotal + totalTax + otherCharges;
    const customer = customers.find(c => c.id === customerSelect.value);
    if(!customer) {
        showToast("Selected customer not found in database", true);
        return;
    }
    const paid = parseFloat(document.getElementById('amountPaid').value) || 0;

    const docData = {
        userId: currentUser.uid,
        invoiceNo: iNumber.value,
        date: iDate.value,
        dueDate: dueDate.value,
        poNumber: poNumber.value,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '',
        customerCompany: customer.company || '',
        items: items,
        subTotal: subTotal,
        totalTax: totalTax,
        otherCharges: otherCharges,
        grandTotal: grandTotal,
        amountPaid: paid,
        balance: grandTotal - paid,
        isGstEnabled: gstEnabled,
        isFamilyFriends: document.getElementById('chkFamilyFriends').checked,
        terms: document.getElementById('iTerms').value,
        createdAt: new Date().toISOString()
    };

    showLoader();
    try {
        if (editingId) {
            await updateDoc(doc(db, "invoices", editingId), docData);
            showToast("Invoice Updated!");
        } else {
            docData.userId = currentUser.uid;
            docData.createdAt = new Date().toISOString();
            await addDoc(collection(db, "invoices"), docData);
            showToast("Invoice Created!");
        }
        loadInvoices();
        generatePDF({ ...docData, ... (editingId ? {} : {createdAt: docData.updatedAt}) }, customer, true);
        
        document.getElementById('invoiceForm').reset();
        itemsContainer.innerHTML = '';
        document.getElementById('customerDetailsBox').style.display = 'none';
        document.getElementById('chkFamilyFriends').checked = false;
        document.getElementById('familyFriendsNote').style.display = 'none';
        document.getElementById('lblReturnAmount').textContent = formatCurrency(0);
        document.getElementById('calcAmountGiven').value = '';
        editingId = null;
        toggleMode(false);
    } catch(err) {
        console.error("Error saving invoice", err);
        showToast("Error saving invoice: " + err.message, true);
    } finally {
        hideLoader();
    }
});

// List Logic
async function loadInvoices() {
    const q = query(collection(db, "invoices"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    invoices = [];
    snap.forEach(doc => { invoices.push({ id: doc.id, ...doc.data() }); });
    filterAndSortInvoices();
}

function renderInvoices(data) {
    invoiceList.innerHTML = '';
    if(data.length === 0) {
        invoiceList.innerHTML = '<div class="text-center text-muted p-4"><i class="fas fa-receipt fa-3x mb-3"></i><p>No invoices found.</p></div>';
        return;
    }

    data.forEach(inv => {
        let status = inv.balance <= 0 ? '<span class="text-success text-sm pl-2">Paid</span>' : `<span class="text-danger text-sm pl-2">Due: ${formatCurrency(inv.balance)}</span>`;
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div class="list-item-content">
                <h4 class="text-primary mb-1">${inv.invoiceNo} <span class="text-muted fs-6" style="float:right">${inv.date}</span></h4>
                <p class="font-weight-bold mb-1">${inv.customerName}</p>
                <p>
                    <span style="font-weight:600;font-size:1.1rem">${formatCurrency(inv.grandTotal)}</span>
                    ${status}
                </p>
            </div>
            <div class="list-item-actions ml-2" style="flex-direction:column; align-items:flex-end;">
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <button class="btn btn-sm btn-outline" onclick="window.editInv('${inv.id}')"><i class="fas fa-edit text-info"></i></button>
                    <button class="btn btn-sm btn-outline" onclick="downloadInv('${inv.id}')"><i class="fas fa-file-pdf text-danger"></i></button>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-sm btn-outline" onclick="shareWa('${inv.id}')"><i class="fab fa-whatsapp text-success"></i></button>
                    <button class="btn btn-sm btn-outline text-danger border-0" onclick="deleteInv('${inv.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        invoiceList.appendChild(div);
    });
}

function filterAndSortInvoices() {
    let result = [...invoices];
    
    // 1. Search Query Filter
    const searchVal = document.getElementById('searchInput').value.toLowerCase();
    if(searchVal) {
        result = result.filter(q => 
            q.invoiceNo.toLowerCase().includes(searchVal) || 
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
    
    renderInvoices(result);
}

document.getElementById('searchInput').addEventListener('input', filterAndSortInvoices);
document.getElementById('filterStartDate').addEventListener('change', filterAndSortInvoices);
document.getElementById('filterEndDate').addEventListener('change', filterAndSortInvoices);
document.getElementById('sortOption').addEventListener('change', filterAndSortInvoices);

document.getElementById('btnClearDateFilter').addEventListener('click', () => {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    filterAndSortInvoices();
});

// External Functions
window.deleteInv = async (id) => {
    if(confirm("Delete this invoice?")) {
        showLoader();
        try {
            await deleteDoc(doc(db, "invoices", id));
            showToast("Invoice deleted");
            loadInvoices();
        } catch(e) {
            showToast("Error deleting", true);
        } finally { hideLoader(); }
    }
};

window.downloadInv = (id) => {
    const q = invoices.find(x => x.id === id);
    const c = customers.find(x => x.id === q.customerId);
    generatePDF(q, c, false);
};

window.shareWa = (id) => {
    const q = invoices.find(x => x.id === id);
    if (!q) return;
    
    // Sanitize phone: remove any non-digit characters
    const cleanPhone = (q.customerPhone || '').replace(/\D/g, '');
    
    const bName = businessData ? businessData.name : '';
    const msg = `Hello ${q.customerName},\n\nHere is your Invoice No: ${q.invoiceNo}\nDate: ${q.date}\nAmount: ${formatCurrency(q.grandTotal)}\nDue: ${formatCurrency(q.balance)}\n\nThank you! ${bName ? '\n- ' + bName : ''}`;
    
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

window.editInv = (id) => {
    const inv = invoices.find(x => x.id === id);
    if (!inv) return;
    
    editingId = id;
    toggleMode(true);
    
    // Fill basic info
    iNumber.value = inv.invoiceNo;
    iDate.value = inv.date;
    poNumber.value = inv.poNumber || '';
    dueDate.value = inv.dueDate || '';
    amountPaid.value = inv.amountPaid || 0;
    
    customerSelect.value = inv.customerId;
    customerSelect.dispatchEvent(new Event('change'));
    
    if (inv.isGstEnabled !== undefined) {
        document.getElementById('chkEnableGst').checked = inv.isGstEnabled;
    }
    if (inv.otherCharges !== undefined) {
        document.getElementById('otherCharges').value = inv.otherCharges;
    }
    if (inv.terms) {
        document.getElementById('iTerms').value = inv.terms;
    }
    
    // Restore calculator and mode
    document.getElementById('chkFamilyFriends').checked = inv.isFamilyFriends || false;
    window.updateFamilyFriendsMode();
    document.getElementById('calcAmountGiven').value = '';
    document.getElementById('lblReturnAmount').textContent = formatCurrency(0);

    // Fill items
    itemsContainer.innerHTML = '';
    if (inv.items && inv.items.length > 0) {
        inv.items.forEach(item => {
            const rowId = `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const div = document.createElement('div');
            div.className = 'product-row list-item';
            div.id = rowId;
            
            let options = '<option value="">Select Item</option>';
            products.forEach(p => {
                const selected = p.id === item.productId ? 'selected' : '';
                options += `<option value="${p.id}" data-price="${p.sellingPrice}" data-gst="${p.gstRate}" data-desc="${p.description || ''}" data-unit="${p.unit || 'Nos'}" ${selected}>${p.name}</option>`;
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
        headerLogoHtml = `<img src="${businessData.logoUrl}" crossorigin="anonymous" style="max-height: 60px; max-width: 200px; margin-bottom: 10px; display: block;">`;
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
        // Mock QR Code placeholder for UPI
        qrHtml = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(bzName)}" crossorigin="anonymous" style="width:70px;height:70px;">`;
    } else {
        qrHtml = `<div style="width:70px;height:70px;background:#f3f3f3;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:8px;color:#999;">QR Code</div>`;
    }
    
    if (businessData && businessData.signature) {
        signHtml = `<img src="${businessData.signature}" crossorigin="anonymous" style="max-height: 40px;">`;
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
                        <h1 style="margin:0; font-size:24px; color:#333; letter-spacing: 1px;">INVOICE</h1>
                    </td>
                </tr>
            </table>
            
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px; text-align: left;">
                <tr>
                    <td valign="top" width="100%" colspan="3">
                        ${qData.isFamilyFriends ? `<div style="display:inline-block; margin-bottom:10px; padding:3px 10px; background:rgba(233, 30, 99, 0.05); border:1px solid #e91e63; color:#e91e63; border-radius:4px; font-weight:bold; font-size:10px;">♥ FAMILY & FRIENDS TRANSACTION</div>` : ''}
                    </td>
                </tr>
                <tr>
                    <td valign="top" width="35%">
                        <strong style="font-size: 9px;">BILL TO</strong>
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
                            <tr><td align="right" style="padding-right:10px;">Invoice#</td><td align="right">${qData.invoiceNo}</td></tr>
                            <tr><td align="right" style="padding-right:10px;">Invoice Date:</td><td align="right">${qData.date}</td></tr>
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
                            ${(qData.amountPaid && qData.amountPaid > 0) ? `
                            <tr>
                                <td style="padding: 6px 0; text-align: left; color: #28a745;">AMOUNT PAID</td>
                                <td style="text-align: right; padding: 6px 0; color: #28a745;">-₹${qData.amountPaid.toFixed(2)}</td>
                            </tr>
                            <tr style="font-weight: bold;">
                                <td style="padding: 6px 0; text-align: left; color: #dc3545;">BALANCE DUE</td>
                                <td style="text-align: right; padding: 6px 0; color: #dc3545;">₹${(qData.grandTotal - qData.amountPaid).toFixed(2)}</td>
                            </tr>
                            ` : ''}
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

    html2pdf().set({
      margin:       0,
      filename:     `Invoice_${qData.invoiceNo}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'] }
    }).from(layoutHtml).save().then(() => {
        // done
    });
}
