import { auth, db, collection, addDoc, getDocs, doc, deleteDoc, query, where, orderBy, getDoc, updateDoc } from './firebase.js';
import { showToast, showLoader, hideLoader, formatCurrency, currentUser, generateId } from './app.js';

const listSection = document.getElementById('listSection');
const makeSection = document.getElementById('makeSection');
const btnToggleView = document.getElementById('btnToggleView');
const pageTitle = document.getElementById('pageTitle');
const toggleIcon = document.getElementById('toggleIcon');
const loanList = document.getElementById('loanList');
const loanForm = document.getElementById('loanForm');
const repayModal = document.getElementById('repayModal');
const closeRepayModal = document.getElementById('closeRepayModal');
const repayForm = document.getElementById('repayForm');

let isMakeMode = false;
let editingId = null;
let loans = [];

// Initialize
auth.onAuthStateChanged(async user => {
    if (user) {
        showLoader();
        try {
            await loadLoans();
        } catch (e) {
            console.error("Data loading error", e);
            showToast("Failed to load loans", true);
        }
        hideLoader();
    }
});

function toggleMode(forceMake = null) {
    if (forceMake !== null) isMakeMode = forceMake;
    else isMakeMode = !isMakeMode;

    if (isMakeMode) {
        listSection.classList.remove('active-section');
        makeSection.classList.add('active-section');
        btnToggleView.innerHTML = '<i class="fas fa-list"></i>';
        pageTitle.textContent = editingId ? 'Update Loan Record' : 'Record New Loan';
        document.getElementById('btnSaveLoan').textContent = editingId ? 'Update Loan' : 'Save Loan Record';

        if (!editingId) {
            loanForm.reset();
            document.getElementById('lDate').valueAsDate = new Date();
        }
    } else {
        editingId = null;
        makeSection.classList.remove('active-section');
        listSection.classList.add('active-section');
        btnToggleView.innerHTML = '<i class="fas fa-plus"></i>';
        pageTitle.textContent = 'Family & Friends Loans';
    }
}

btnToggleView.addEventListener('click', () => toggleMode());
document.getElementById('fabAdd').addEventListener('click', () => toggleMode(true));

async function loadLoans() {
    const q = query(collection(db, "loans"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    loans = [];
    snap.forEach(doc => {
        loans.push({ id: doc.id, ...doc.data() });
    });
    // Sort by date (desc)
    loans.sort((a, b) => new Date(b.date) - new Date(a.date));

    updateSummary();
    renderLoans(loans);
}

function updateSummary() {
    let totalGiven = 0;
    let totalReturned = 0;

    loans.forEach(l => {
        totalGiven += parseFloat(l.amount) || 0;
        totalReturned += parseFloat(l.returned) || 0;
    });

    document.getElementById('lblTotalGiven').textContent = formatCurrency(totalGiven);
    document.getElementById('lblTotalReturned').textContent = formatCurrency(totalReturned);
    document.getElementById('lblTotalBalance').textContent = formatCurrency(totalGiven - totalReturned);
}

function renderLoans(data) {
    loanList.innerHTML = '';
    if (data.length === 0) {
        loanList.innerHTML = '<div class="text-center text-muted p-4"><i class="fas fa-handshake fa-3x mb-3"></i><p>No loan records found.</p></div>';
        return;
    }

    data.forEach(l => {
        const balance = (parseFloat(l.amount) || 0) - (parseFloat(l.returned) || 0);
        const statusClass = balance <= 0 ? 'status-paid' : 'status-pending';
        const statusText = balance <= 0 ? 'PAID' : 'PENDING';

        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div class="list-item-content">
                <h4 class="text-secondary mb-1">${l.name} <span class="text-muted fs-6" style="float:right">${l.date}</span></h4>
                <p class="mb-1">Amount Given: <span class="font-weight-bold">${formatCurrency(l.amount)}</span></p>
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                  <div>
                    <p class="mb-0 small">Returned: ${formatCurrency(l.returned)}</p>
                    <p class="mb-0 font-weight-bold" style="color:var(--danger-color); font-size:1rem;">Pending: ${formatCurrency(balance)}</p>
                  </div>
                  <div style="text-align:right;">
                    <div class="loan-status ${statusClass} mb-2">${statusText}</div>
                    ${balance > 0 ? `<button class="return-btn" onclick="openRepayModal('${l.id}')"><i class="fas fa-reply-all"></i> Return Money</button>` : ''}
                  </div>
                </div>
            </div>
            <div class="list-item-actions ml-2" style="display: flex; flex-direction: column; gap: 5px;">
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-sm btn-outline" onclick="editLoan('${l.id}')" title="Edit"><i class="fas fa-edit text-info"></i></button>
                    <button class="btn btn-sm btn-outline" onclick="openHistoryModal('${l.id}')" title="History"><i class="fas fa-history text-secondary"></i></button>
                    <button class="btn btn-sm btn-outline" onclick="downloadLoan('${l.id}')" title="Download Statement"><i class="fas fa-file-pdf text-danger"></i></button>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-sm btn-outline" onclick="shareLoan('${l.id}')" title="WhatsApp Share"><i class="fab fa-whatsapp text-success"></i></button>
                    <button class="btn btn-sm btn-outline text-danger border-0" onclick="deleteLoan('${l.id}')" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        loanList.appendChild(div);
    });
}

// Search
document.getElementById('searchInput').addEventListener('input', (e) => {
    const v = e.target.value.toLowerCase();
    const f = loans.filter(l =>
        l.name.toLowerCase().includes(v) || (l.description && l.description.toLowerCase().includes(v))
    );
    renderLoans(f);
});

// Save Loan
loanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const docData = {
        userId: currentUser.uid,
        date: document.getElementById('lDate').value,
        name: document.getElementById('lName').value.trim(),
        amount: parseFloat(document.getElementById('lAmount').value) || 0,
        returned: parseFloat(document.getElementById('lReturned').value) || 0,
        description: document.getElementById('lDescription').value.trim(),
        createdAt: new Date().toISOString()
    };

    showLoader();
    try {
        if (editingId) {
            await updateDoc(doc(db, "loans", editingId), docData);
            showToast("Record Updated!");
        } else {
            await addDoc(collection(db, "loans"), docData);
            showToast("Loan Record Saved!");
        }
        editingId = null;
        loadLoans();
        toggleMode(false);
    } catch (err) {
        showToast("Error saving record", true);
    } finally { hideLoader(); }
});

// Repayment Modal
window.openRepayModal = (id) => {
    const l = loans.find(x => x.id === id);
    if (!l) return;

    document.getElementById('repayLoanId').value = id;
    document.getElementById('repayName').textContent = l.name;
    const balance = (parseFloat(l.amount) || 0) - (parseFloat(l.returned) || 0);
    document.getElementById('repayBalance').textContent = `Pending Balance: ${formatCurrency(balance)}`;
    document.getElementById('repayAmount').value = 0;
    document.getElementById('repayDate').valueAsDate = new Date();

    repayModal.style.display = 'flex';
};

closeRepayModal.onclick = () => repayModal.style.display = 'none';

repayForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('repayLoanId').value;
    const returnAmount = parseFloat(document.getElementById('repayAmount').value) || 0;
    const returnDate = document.getElementById('repayDate').value;

    if (returnAmount <= 0) { showToast("Enter a valid amount", true); return; }

    const l = loans.find(x => x.id === id);
    if (!l) return;

    const newReturned = (parseFloat(l.returned) || 0) + returnAmount;
    const history = l.history || [];
    history.push({ amount: returnAmount, date: returnDate });

    showLoader();
    try {
        await updateDoc(doc(db, "loans", id), {
            returned: newReturned,
            history: history,
            updatedAt: new Date().toISOString()
        });
        showToast("Return Updated!");
        repayModal.style.display = 'none';
        loadLoans();
    } catch (err) {
        showToast("Error updating status", true);
    } finally { hideLoader(); }
});

// Delete
window.deleteLoan = async (id) => {
    if (confirm("Delete this loan record?")) {
        showLoader();
        try {
            await deleteDoc(doc(db, "loans", id));
            showToast("Record Deleted");
            loadLoans();
        } catch (e) { showToast("Error deleting", true); } finally { hideLoader(); }
    }
};

window.editLoan = (id) => {
    const l = loans.find(x => x.id === id);
    if (!l) return;

    editingId = id;
    toggleMode(true);

    document.getElementById('lDate').value = l.date;
    document.getElementById('lName').value = l.name;
    document.getElementById('lAmount').value = l.amount;
    document.getElementById('lReturned').value = l.returned || 0;
    document.getElementById('lDescription').value = l.description || '';
};

window.shareLoan = (id) => {
    const l = loans.find(x => x.id === id);
    if (!l) return;

    const balance = (parseFloat(l.amount) || 0) - (parseFloat(l.returned) || 0);
    const bName = businessData ? businessData.name : '';
    const emojiStatus = balance <= 0 ? '✅ PAID' : '⌛ PENDING';

    const msg = `Hello ${l.name},\n\nHere is your Loan Account Statement:\n\nInitial Loan: ${formatCurrency(l.amount)}\nReturned: ${formatCurrency(l.returned)}\nBalance Pending: ${formatCurrency(balance)}\nStatus: ${emojiStatus}\n\nThank you! ${bName ? '\n- ' + bName : ''}`;

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

window.downloadLoan = (id) => {
    const l = loans.find(x => x.id === id);
    if (!l) return;

    const balance = (parseFloat(l.amount) || 0) - (parseFloat(l.returned) || 0);
    const bName = businessData ? businessData.name : 'Team7 System Solution';

    const html = `
        <div style="padding: 40px; font-family: Arial, sans-serif; border: 1px solid #ddd; max-width: 800px; margin: auto; background: #fff;">
            <h1 style="color: #e91e63; text-align: center; margin-bottom: 5px;">LOAN ACCOUNT STATEMENT</h1>
            <p style="text-align: center; color: #888; font-size: 0.9rem;">Produced by ${bName}</p>
            <hr>
            <div style="display: flex; justify-content: space-between; margin-top: 30px;">
                <div>
                   <h3 style="margin-bottom: 5px;">BORROWER: ${l.name}</h3>
                   <p style="margin: 0;">Loan Date: ${l.date}</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; color: #666;">Generated on: ${new Date().toLocaleDateString()}</p>
                </div>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 40px; page-break-inside: avoid; break-inside: avoid;">
                <thead>
                    <tr style="background: #f3f3f3;">
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">TRANSACTION DETAILS</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">AMOUNT (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">Total Loan Principal Given</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">${formatCurrency(l.amount)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">Total Amount Returned to Owner</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: right; color: #27ae60;">- ${formatCurrency(l.returned)}</td>
                    </tr>
                    <tr style="font-weight: bold; font-size: 1.1rem; background: #fffcf0;">
                        <td style="padding: 20px 12px; border: 1px solid #ddd; text-align: left; text-transform: uppercase;">Outstanding Balance</td>
                        <td style="padding: 20px 12px; border: 1px solid #ddd; text-align: right; color: ${balance > 0 ? '#e74c3c' : '#27ae60'};">${formatCurrency(balance)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="margin-top: 50px; padding: 20px; background: #f9f9f9; border-radius: 8px; page-break-inside: avoid; break-inside: avoid;">
                <h4 style="margin: 0 0 10px 0;">Notes / Remarks:</h4>
                <p style="margin: 0; color: #555;">${l.description || 'No additional remarks.'}</p>
            </div>
            
            <div style="margin-top: 60px; text-align: center; color: #999; font-size: 0.8rem; border-top: 1px solid #eee; padding-top: 10px; page-break-inside: avoid; break-inside: avoid;">
                <p>This is a computer-generated summary for internal use and verification purposes only.</p>
                <p>&copy; ${new Date().getFullYear()} ${bName}</p>
            </div>
        </div>
    `;

    html2pdf().from(html).set({
        margin: 10,
        filename: `Loan_Statement_${l.name}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    }).save();
};

window.openHistoryModal = (id) => {
    const l = loans.find(x => x.id === id);
    if (!l) return;

    document.getElementById('historyName').textContent = `Loan to ${l.name}`;
    const hList = document.getElementById('historyList');
    hList.innerHTML = '';

    const history = l.history || [];
    if (history.length === 0) {
        hList.innerHTML = '<div class="text-center text-muted p-3">No repayment history yet.</div>';
    } else {
        history.forEach(h => {
            const div = document.createElement('div');
            div.className = 'd-flex justify-content-between p-2 border-bottom';
            div.innerHTML = `
                <span>${h.date}</span>
                <span class="font-weight-bold text-success">+ ${formatCurrency(h.amount)}</span>
            `;
            hList.appendChild(div);
        });
    }

    document.getElementById('repayHistoryModal').style.display = 'flex';
};

document.getElementById('closeHistoryModal').onclick = () => document.getElementById('repayHistoryModal').style.display = 'none';
document.getElementById('btnHistoryClose').onclick = () => document.getElementById('repayHistoryModal').style.display = 'none';

window.onclick = (event) => {
    if (event.target == repayModal) repayModal.style.display = "none";
    if (event.target == document.getElementById('repayHistoryModal')) document.getElementById('repayHistoryModal').style.display = "none";
};
