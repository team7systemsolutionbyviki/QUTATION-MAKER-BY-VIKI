import { auth, db, collection, getDocs, query, where, orderBy } from './firebase.js';
import { showToast, showLoader, hideLoader, formatCurrency, currentUser, businessData } from './app.js';

const startDateEl = document.getElementById('startDate');
const endDateEl = document.getElementById('endDate');
const btnGenerate = document.getElementById('btnGenerate');
const btnThisMonth = document.getElementById('btnThisMonth');
const btnAllTime = document.getElementById('btnAllTime');
const btnExportExcel = document.getElementById('btnExportExcel');
const btnDownloadExcel = document.getElementById('btnDownloadExcel');
const btnDownloadPDF = document.getElementById('btnDownloadPDF');

const totalSalesEl = document.getElementById('totalSales');
const totalQuotesEl = document.getElementById('totalQuotes');
const totalCreditEl = document.getElementById('totalCredit');
const totalReceiptsEl = document.getElementById('totalReceipts');
const totalTotalExpensesEl = document.getElementById('totalTotalExpenses');
const reportTableBody = document.getElementById('reportTableBody');
const expenseReportTableBody = document.getElementById('expenseReportTableBody');

let reportData = []; // To hold the combined logs for exporting
let expenseData = []; // To hold the expense logs for exporting

auth.onAuthStateChanged(user => {
    if(user) {
        setThisMonth();
        generateReport();
    }
});

function setThisMonth() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // adjust to YYYY-MM-DD local
    const yyyy = firstDay.getFullYear();
    const mm = String(firstDay.getMonth() + 1).padStart(2, '0');
    const dd = String(firstDay.getDate()).padStart(2, '0');
    
    const tyyyy = today.getFullYear();
    const tmm = String(today.getMonth() + 1).padStart(2, '0');
    const tdd = String(today.getDate()).padStart(2, '0');

    startDateEl.value = `${yyyy}-${mm}-01`;
    endDateEl.value = `${tyyyy}-${tmm}-${tdd}`;
}

btnThisMonth.addEventListener('click', () => {
    setThisMonth();
    generateReport();
});

btnAllTime.addEventListener('click', () => {
    startDateEl.value = '2000-01-01';
    
    const today = new Date();
    const tyyyy = today.getFullYear();
    const tmm = String(today.getMonth() + 1).padStart(2, '0');
    const tdd = String(today.getDate()).padStart(2, '0');
    endDateEl.value = `${tyyyy}-${tmm}-${tdd}`;
    
    generateReport();
});

btnGenerate.addEventListener('click', generateReport);

async function generateReport() {
    if(!startDateEl.value || !endDateEl.value) {
        showToast("Please select a valid date range.", true);
        return;
    }

    showLoader();
    try {
        const start = startDateEl.value;
        const end = endDateEl.value;
        
        reportData = [];
        expenseData = [];
        let r_sales = 0;
        let r_quotes = 0;
        let r_credit = 0;
        let r_receipts = 0;
        let r_expenses = 0;

        // 1. Fetch Invoices
        const invQ = query(collection(db, "invoices"), where("userId", "==", currentUser.uid));
        const invSnap = await getDocs(invQ);
        const invoices = [];
        invSnap.forEach(d => invoices.push(d.data()));

        // 2. Fetch Quotations
        const qQ = query(collection(db, "quotations"), where("userId", "==", currentUser.uid));
        const qSnap = await getDocs(qQ);
        const quotes = [];
        qSnap.forEach(d => quotes.push(d.data()));

        // 3. Fetch Receipts
        const recQ = query(collection(db, "receipts"), where("userId", "==", currentUser.uid));
        const recSnap = await getDocs(recQ);
        const receipts = [];
        recSnap.forEach(d => receipts.push(d.data()));

        // 4. Fetch Expenses
        const expQ = query(collection(db, "expenses"), where("userId", "==", currentUser.uid));
        const expSnap = await getDocs(expQ);
        const expenses = [];
        expSnap.forEach(d => expenses.push(d.data()));
        
        // --- PROCESS INVOICES ---
        invoices.forEach(inv => {
            const rowDate = inv.date;
            if(rowDate >= start && rowDate <= end) {
                const total = inv.grandTotal || 0;
                r_sales += total;
                
                const paid = inv.amountPaid || 0;
                if(inv.paymentMode === 'Credit' || paid < total) {
                    const balance = total - paid;
                    r_credit += balance;
                }
                
                reportData.push({
                    type: "Invoice",
                    date: rowDate,
                    ref: inv.invoiceNo,
                    customer: inv.customerName,
                    amount: total
                });
            }
        });

        // --- PROCESS QUOTES ---
        quotes.forEach(q => {
            const rowDate = q.date;
            if(rowDate >= start && rowDate <= end) {
                r_quotes++;
            }
        });

        // --- PROCESS RECEIPTS ---
        receipts.forEach(r => {
            const rowDate = r.date;
            if(rowDate >= start && rowDate <= end) {
                const amount = r.amount || 0;
                r_receipts += amount;
            }
        });

        // --- PROCESS EXPENSES ---
        expenses.forEach(ex => {
            const rowDate = ex.date;
            if(rowDate >= start && rowDate <= end) {
                const amount = ex.amount || 0;
                r_expenses += amount;
                expenseData.push({
                    date: rowDate,
                    category: ex.category || 'Other',
                    title: ex.title || 'No Title',
                    amount: amount
                });
            }
        });

        // Update UI Summary
        totalSalesEl.textContent = formatCurrency(r_sales);
        totalQuotesEl.textContent = r_quotes;
        totalCreditEl.textContent = formatCurrency(r_credit);
        totalReceiptsEl.textContent = formatCurrency(r_receipts);
        totalTotalExpensesEl.textContent = formatCurrency(r_expenses);

        sortAndRenderTables();

    } catch(err) {
        console.error("Error generating report", err);
        showToast("Error generating report", true);
    } finally {
        hideLoader();
    }
}

// Export handlers
const exportExcelHandler = () => {
    if(reportData.length === 0 && expenseData.length === 0) {
        showToast("No data to export for this date range.", true);
        return;
    }

    const workbook = XLSX.utils.book_new();

    if(reportData.length > 0) {
        const sData = reportData.map((r, i) => ({
            "S.No": i + 1,
            "Date": r.date,
            "Record Type": r.type,
            "Reference Number": r.ref,
            "Customer Name": r.customer,
            "Total Amount": r.amount
        }));
        const sWS = XLSX.utils.json_to_sheet(sData);
        XLSX.utils.book_append_sheet(workbook, sWS, "Sales Report");
    }

    if(expenseData.length > 0) {
        const eData = expenseData.map((r, i) => ({
            "S.No": i + 1,
            "Date": r.date,
            "Category": r.category,
            "Description": r.title,
            "Amount": r.amount
        }));
        const eWS = XLSX.utils.json_to_sheet(eData);
        XLSX.utils.book_append_sheet(workbook, eWS, "Expenses Report");
    }

    XLSX.writeFile(workbook, `Business_Report_${startDateEl.value}_to_${endDateEl.value}.xlsx`);
};

function downloadPDFReport() {
    if(reportData.length === 0 && expenseData.length === 0) {
        showToast("No data to export for this date range.", true);
        return;
    }

    // Business info
    let bzName = businessData ? businessData.name : 'Your Business Name';
    let bzOwner = businessData && businessData.owner ? businessData.owner : '';
    let bzAddress = businessData && businessData.address ? businessData.address : '';
    let bzPhone = businessData && businessData.phone ? businessData.phone : '';
    let bzEmail = businessData && businessData.email ? businessData.email : '';

    let headerLogoHtml = '';
    if(businessData && businessData.logoUrl) {
        headerLogoHtml = `<img src="${businessData.logoUrl}" crossorigin="anonymous" style="max-height: 60px; max-width: 200px; margin-bottom: 10px; display: block;">`;
    }

    // Summary calculations
    let totalSales = document.getElementById('totalSales').textContent;
    let totalQuotes = document.getElementById('totalQuotes').textContent;
    let totalCredit = document.getElementById('totalCredit').textContent;
    let totalReceipts = document.getElementById('totalReceipts').textContent;
    let totalExpenses = document.getElementById('totalTotalExpenses').textContent;

    // Sales Table rows
    let salesRowsHtml = '';
    if(reportData.length === 0) {
        salesRowsHtml = `<tr><td colspan="4" style="text-align: center; padding: 10px; color: #777;">No sales records found.</td></tr>`;
    } else {
        reportData.forEach((row, i) => {
            salesRowsHtml += `
                <tr style="border-bottom: 1px solid #eee; page-break-inside: avoid; break-inside: avoid;">
                    <td style="padding: 8px 5px;">${row.date}</td>
                    <td style="padding: 8px 5px;"><strong>${row.ref}</strong></td>
                    <td style="padding: 8px 5px;">${row.customer}</td>
                    <td style="padding: 8px 5px; text-align: right; font-weight: bold; color: #27ae60;">₹${row.amount.toFixed(2)}</td>
                </tr>
            `;
        });
    }

    // Expense Table rows
    let expenseRowsHtml = '';
    if(expenseData.length === 0) {
        expenseRowsHtml = `<tr><td colspan="4" style="text-align: center; padding: 10px; color: #777;">No expense records found.</td></tr>`;
    } else {
        expenseData.forEach((row, i) => {
            expenseRowsHtml += `
                <tr style="border-bottom: 1px solid #eee; page-break-inside: avoid; break-inside: avoid;">
                    <td style="padding: 8px 5px;">${row.date}</td>
                    <td style="padding: 8px 5px;"><strong>${row.category}</strong></td>
                    <td style="padding: 8px 5px;">${row.title}</td>
                    <td style="padding: 8px 5px; text-align: right; font-weight: bold; color: #e74c3c;">₹${row.amount.toFixed(2)}</td>
                </tr>
            `;
        });
    }

    const layoutHtml = `
        <div id="pdfPrintableForm" style="width: 794px; background:#fff; padding: 40px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #000; box-sizing: border-box; text-align: left;">
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; text-align: left;">
                <tr>
                    <td valign="top" width="60%">
                        ${headerLogoHtml}
                        <h2 style="margin:0; font-size:16px;">${bzName.toUpperCase()}</h2>
                        <div style="margin-top:2px;">${bzOwner}</div>
                        <div style="margin-top:2px; max-width:250px;">${bzAddress}</div>
                        <div style="margin-top:2px;">${bzPhone} ${bzEmail}</div>
                    </td>
                    <td valign="top" width="40%" align="right">
                        <h1 style="margin:0; font-size:20px; color:#333; letter-spacing: 1px;">BUSINESS REPORT</h1>
                        <div style="margin-top:5px; font-weight: bold; color: #555;">Period: ${startDateEl.value} to ${endDateEl.value}</div>
                        <div style="margin-top:5px; color:#888;">Generated on: ${new Date().toLocaleDateString()}</div>
                    </td>
                </tr>
            </table>

            <!-- SUMMARY GRID -->
            <h3 style="font-size: 13px; border-left: 3px solid #3498db; padding-left: 8px; margin-bottom: 12px; margin-top: 20px;">Financial Summary</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px; text-align: center; border-collapse: collapse;">
                <tr>
                    <td width="20%" style="padding: 10px; border: 1px solid #ddd; background: #fcfdfd;">
                        <div style="font-weight: bold; color: #666; font-size: 9px; text-transform: uppercase;">Total Sales (Inv)</div>
                        <div style="font-size: 13px; font-weight: bold; margin-top: 5px; color: #27ae60;">${totalSales}</div>
                    </td>
                    <td width="20%" style="padding: 10px; border: 1px solid #ddd; background: #fcfdfd;">
                        <div style="font-weight: bold; color: #666; font-size: 9px; text-transform: uppercase;">Quotes Issued</div>
                        <div style="font-size: 13px; font-weight: bold; margin-top: 5px; color: #3498db;">${totalQuotes}</div>
                    </td>
                    <td width="20%" style="padding: 10px; border: 1px solid #ddd; background: #fcfdfd;">
                        <div style="font-weight: bold; color: #666; font-size: 9px; text-transform: uppercase;">Credits Generated</div>
                        <div style="font-size: 13px; font-weight: bold; margin-top: 5px; color: #f39c12;">${totalCredit}</div>
                    </td>
                    <td width="20%" style="padding: 10px; border: 1px solid #ddd; background: #fcfdfd;">
                        <div style="font-weight: bold; color: #666; font-size: 9px; text-transform: uppercase;">Total Receipts</div>
                        <div style="font-size: 13px; font-weight: bold; margin-top: 5px; color: #27ae60;">${totalReceipts}</div>
                    </td>
                    <td width="20%" style="padding: 10px; border: 1px solid #ddd; background: #fcfdfd;">
                        <div style="font-weight: bold; color: #666; font-size: 9px; text-transform: uppercase;">Total Expenses</div>
                        <div style="font-size: 13px; font-weight: bold; margin-top: 5px; color: #e74c3c;">${totalExpenses}</div>
                    </td>
                </tr>
            </table>

            <!-- SALES LOGS -->
            <h3 style="font-size: 13px; border-left: 3px solid #27ae60; padding-left: 8px; margin-bottom: 12px; margin-top: 25px;">Invoice Logs (Sales)</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px; text-align: left; border-collapse: collapse;">
                <thead>
                    <tr style="background:#f1f3f5; font-weight: bold; border-bottom: 2px solid #ddd;">
                        <th style="padding: 8px 5px; width: 15%;">Date</th>
                        <th style="padding: 8px 5px; width: 25%;">Invoice / Ref No</th>
                        <th style="padding: 8px 5px; width: 40%;">Customer</th>
                        <th style="padding: 8px 5px; text-align: right; width: 20%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${salesRowsHtml}
                </tbody>
            </table>

            <!-- EXPENSE LOGS -->
            <h3 style="font-size: 13px; border-left: 3px solid #8B4513; padding-left: 8px; margin-bottom: 12px; margin-top: 25px; color: #8B4513;">Expense Logs</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px; text-align: left; border-collapse: collapse;">
                <thead>
                    <tr style="background:#fdf4f0; font-weight: bold; border-bottom: 2px solid #8B4513;">
                        <th style="padding: 8px 5px; width: 15%;">Date</th>
                        <th style="padding: 8px 5px; width: 25%;">Category</th>
                        <th style="padding: 8px 5px; width: 40%;">Description</th>
                        <th style="padding: 8px 5px; text-align: right; width: 20%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${expenseRowsHtml}
                </tbody>
            </table>

            <div style="margin-top: 50px; text-align: center; color: #999; font-size: 8px; border-top: 1px solid #eee; padding-top: 10px;">
                <p>This is a computer-generated Business Performance Report.</p>
                <p>&copy; ${new Date().getFullYear()} ${bzName}</p>
            </div>
        </div>
    `;

    var opt = {
      margin:       10,
      filename:     `Business_Report_${startDateEl.value}_to_${endDateEl.value}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    html2pdf().set(opt).from(layoutHtml).save().then(() => {
        // success
    });
}

function sortAndRenderTables() {
    const sortVal = document.getElementById('reportSortOption').value;
    
    // Sort reportData
    if (sortVal === 'dateDesc') {
        reportData.sort((a, b) => b.date.localeCompare(a.date));
    } else if (sortVal === 'dateAsc') {
        reportData.sort((a, b) => a.date.localeCompare(b.date));
    } else if (sortVal === 'amountDesc') {
        reportData.sort((a, b) => b.amount - a.amount);
    } else if (sortVal === 'amountAsc') {
        reportData.sort((a, b) => a.amount - b.amount);
    }
    
    // Sort expenseData
    if (sortVal === 'dateDesc') {
        expenseData.sort((a, b) => b.date.localeCompare(a.date));
    } else if (sortVal === 'dateAsc') {
        expenseData.sort((a, b) => a.date.localeCompare(b.date));
    } else if (sortVal === 'amountDesc') {
        expenseData.sort((a, b) => b.amount - a.amount);
    } else if (sortVal === 'amountAsc') {
        expenseData.sort((a, b) => a.amount - b.amount);
    }
    
    // Render Sales Table
    reportTableBody.innerHTML = '';
    if(reportData.length === 0) {
        reportTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-4">No sales found in this date range.</td></tr>';
    } else {
        reportData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="white-space:nowrap;">${row.date}</td>
                <td><span class="badge" style="background:var(--primary-color);color:white;font-size:10px;padding:3px 5px;margin-right:5px;">${row.type}</span> <strong>${row.ref}</strong></td>
                <td>${row.customer}</td>
                <td style="text-align: right; font-weight: 600;" class="text-success">${formatCurrency(row.amount)}</td>
            `;
            reportTableBody.appendChild(tr);
        });
    }

    // Render Expenses Table
    expenseReportTableBody.innerHTML = '';
    if(expenseData.length === 0) {
        expenseReportTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-4">No expenses found in this date range.</td></tr>';
    } else {
        expenseData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="white-space:nowrap;">${row.date}</td>
                <td><span class="badge" style="background:#8B4513;color:white;font-size:10px;padding:3px 5px;margin-right:5px;">${row.category}</span></td>
                <td>${row.title}</td>
                <td style="text-align: right; font-weight: 600; color: #dc3545;">${formatCurrency(row.amount)}</td>
            `;
            expenseReportTableBody.appendChild(tr);
        });
    }
}

btnExportExcel.addEventListener('click', exportExcelHandler);
if(btnDownloadExcel) btnDownloadExcel.addEventListener('click', exportExcelHandler);
if(btnDownloadPDF) btnDownloadPDF.addEventListener('click', downloadPDFReport);
document.getElementById('reportSortOption').addEventListener('change', sortAndRenderTables);
