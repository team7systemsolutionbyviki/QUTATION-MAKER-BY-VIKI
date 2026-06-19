import { auth, db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy } from './firebase.js';
import { showToast, showLoader, hideLoader, formatCurrency, currentUser } from './app.js';

let products = [];
const productListEl = document.getElementById('productList');
const searchInput = document.getElementById('searchInput');
const fabAddProduct = document.getElementById('fabAddProduct');
const modal = document.getElementById('productModal');
const closeProductModal = document.getElementById('closeProductModal');
const productForm = document.getElementById('productForm');
const btnSync = document.getElementById('btnSync');

auth.onAuthStateChanged(user => {
    if(user) {
        loadProducts();
        
        const urlParams = new URLSearchParams(window.location.search);
        if(urlParams.get('action') === 'add') {
            fabAddProduct.click();
        }
    }
});

async function loadProducts() {
    showLoader();
    try {
        const q = query(
            collection(db, "products"), 
            where("userId", "==", currentUser.uid)
        );
        const snap = await getDocs(q);
        
        products = [];
        snap.forEach(d => products.push({ id: d.id, ...d.data() }));

        // Manually sort to avoid Firebase composite index requirement error
        products.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        
        renderProducts(products);
    } catch(error) {
        console.error("Error loading products", error);
        showToast("Failed to load products", true);
    } finally {
        hideLoader();
    }
}

function renderProducts(data) {
    productListEl.innerHTML = '';
    if(data.length === 0) {
        productListEl.innerHTML = '<div class="text-center text-muted p-4"><i class="fas fa-box-open fa-3x mb-3"></i><p>No products found.</p></div>';
        return;
    }
    
    data.forEach(prod => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div class="list-item-content">
                <h4 style="margin-bottom:5px;">${prod.name} ${prod.hsn ? `<span class="text-muted fs-6">(HSN: ${prod.hsn})</span>` : ''}</h4>
                <p class="mb-1">
                    <span class="badge" style="background:#f3f3f3; color:#555; padding:3px 8px; border-radius:4px; font-weight:bold; margin-right:5px;">${prod.type === 'service' ? 'Service' : 'Product'}</span>
                    <span class="text-success font-weight-bold" style="font-weight:600;">Price: ${formatCurrency(prod.sellingPrice)}</span> 
                    <small>| Unit: ${prod.unit} | GST: ${prod.gstRate}%</small>
                </p>
                ${prod.type === 'product' ? `<p class="mb-1" style="font-weight:bold; color: ${prod.stock <= 5 ? '#dc3545' : '#8B4513'};">Stock: ${prod.stock || 0} ${prod.unit}</p>` : ''}
                ${prod.description ? `<p><small class="text-muted">${prod.description}</small></p>` : ''}
            </div>
            <div class="list-item-actions">
                <button class="action-btn edit" onclick="editProduct('${prod.id}')"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete" onclick="deleteProduct('${prod.id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
        productListEl.appendChild(div);
    });
}

// Search
searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const filtered = products.filter(p => 
        (p.name && p.name.toLowerCase().includes(val)) || 
        (p.hsn && p.hsn.toLowerCase().includes(val))
    );
    renderProducts(filtered);
});

// Modal Actions
fabAddProduct.addEventListener('click', () => {
    productForm.reset();
    document.getElementById('productId').value = '';
    document.getElementById('modalTitle').textContent = 'Add Product';
    document.getElementById('productUnit').value = 'pcs';
    document.getElementById('productType').value = 'product';
    document.getElementById('productStock').value = '0';
    document.getElementById('productStock').disabled = false;
    document.getElementById('gstRate').value = '0';
    modal.style.display = 'flex';
});

document.getElementById('productType').addEventListener('change', (e) => {
    const stockEl = document.getElementById('productStock');
    if(e.target.value === 'service') {
        stockEl.value = '0';
        stockEl.disabled = true;
    } else {
        stockEl.disabled = false;
    }
});

closeProductModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

btnSync.addEventListener('click', loadProducts);

// Save form
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!currentUser || !currentUser.uid) {
        showToast("Session expired, please refresh", true);
        return;
    }

    const id = document.getElementById('productId').value;
    const data = {
        userId: currentUser.uid,
        name: document.getElementById('productName').value.trim(),
        description: document.getElementById('productDesc').value.trim(),
        hsn: document.getElementById('hsnCode').value.trim(),
        unit: document.getElementById('productUnit').value,
        type: document.getElementById('productType').value,
        stock: parseFloat(document.getElementById('productStock').value) || 0,
        purchasePrice: parseFloat(document.getElementById('purchasePrice').value) || 0,
        sellingPrice: parseFloat(document.getElementById('sellingPrice').value) || 0,
        gstRate: parseInt(document.getElementById('gstRate').value) || 0,
        updatedAt: new Date().toISOString()
    };
    
    showLoader();
    try {
        if(id) {
            await updateDoc(doc(db, "products", id), data);
            showToast("Product updated successfully");
        } else {
            data.createdAt = new Date().toISOString();
            await addDoc(collection(db, "products"), data);
            showToast("Product added successfully");
        }
        modal.style.display = 'none';
        loadProducts();
    } catch(error) {
        console.error("Error saving product", error);
        showToast("Error saving product: " + error.message, true);
    } finally {
        hideLoader();
    }
});

window.editProduct = (id) => {
    const prod = products.find(p => p.id === id);
    if(prod) {
        document.getElementById('productId').value = prod.id;
        document.getElementById('productName').value = prod.name || '';
        document.getElementById('productDesc').value = prod.description || '';
        document.getElementById('hsnCode').value = prod.hsn || '';
        document.getElementById('productUnit').value = prod.unit || 'pcs';
        document.getElementById('purchasePrice').value = prod.purchasePrice || '';
        document.getElementById('sellingPrice').value = prod.sellingPrice || '';
        document.getElementById('gstRate').value = prod.gstRate || '0';
        document.getElementById('productType').value = prod.type || 'product';
        document.getElementById('productStock').value = prod.stock || 0;
        document.getElementById('productStock').disabled = (prod.type === 'service');
        
        document.getElementById('modalTitle').textContent = 'Edit Product';
        modal.style.display = 'flex';
    }
};

window.deleteProduct = async (id) => {
    if(confirm("Are you sure you want to delete this product?")) {
        showLoader();
        try {
            await deleteDoc(doc(db, "products", id));
            showToast("Product deleted");
            loadProducts();
        } catch(error) {
            console.error("Error deleting", error);
            showToast("Error deleting product", true);
        } finally {
            hideLoader();
        }
    }
};

// --- EXCEL EXPORT & IMPORT ---
document.getElementById('btnExportExcel').addEventListener('click', () => {
    let data;
    if(products.length === 0) {
        showToast("Exporting Sample Template...");
        data = [{
            "S.No": 1,
            "Product Name": "Sample Product",
            "Description": "Hardware Component",
            "HSN Code": "123456",
            "Unit": "pcs",
            "Purchase Price": 150.00,
            "Selling Price": 299.00,
            "GST Rate (%)": 18
        }];
    } else {
        data = products.map((p, i) => ({
            "S.No": i + 1,
            "Product Name": p.name || "",
            "Description": p.description || "",
            "HSN Code": p.hsn || "",
            "Unit": p.unit || "pcs",
            "Type": p.type || "product",
            "Stock": p.stock || 0,
            "Purchase Price": p.purchasePrice || 0,
            "Selling Price": p.sellingPrice || 0,
            "GST Rate (%)": p.gstRate || 0
        }));
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
    XLSX.writeFile(workbook, "Products_Template.xlsx");
});

document.getElementById('importExcelInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;

    showLoader();
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if(json.length === 0) {
            showToast("Excel file is empty", true);
            hideLoader();
            return;
        }

        let addedCount = 0;
        for (const row of json) {
            // Mapping generic column names back to product keys
            const name = row["Product Name"] || row["Name"] || row["name"] || "";
            if(!name.trim()) continue; // Name is required

            const docData = {
                userId: currentUser.uid,
                name: name.trim(),
                description: String(row["Description"] || row["Desc"] || ""),
                hsn: String(row["HSN Code"] || row["HSN"] || ""),
                unit: String(row["Unit"] || "pcs"),
                type: String(row["Type"] || "product").toLowerCase(),
                stock: parseFloat(row["Stock"] || 0),
                purchasePrice: parseFloat(row["Purchase Price"] || row["purchase"] || 0),
                sellingPrice: parseFloat(row["Selling Price"] || row["selling"] || row["Price"] || 0),
                gstRate: parseFloat(row["GST Rate (%)"] || row["GST"] || row["gst"] || 0),
                createdAt: new Date().toISOString()
            };

            await addDoc(collection(db, "products"), docData);
            addedCount++;
        }
        
        showToast(`Successfully imported ${addedCount} products!`);
        e.target.value = ''; // reset file input
        loadProducts();
    } catch (err) {
        console.error(err);
        showToast("Failed to import Excel file", true);
    } finally {
        hideLoader();
    }
});
