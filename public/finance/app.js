const KEY_TRANS = 'financeTransactions';
const KEY_CATS = 'financeCategories';
const KEY_SAVINGS = 'financeSavingsRate';

const SHEETS_ID = '1XDOkxSB0xm8vy8J6eFRkFa4r2tRoKD8m6ArhzhkuwcY';
const SHEETS_TAB = 'Finanzen';
const SHEETS_TAB_CONFIG = 'Config';
const SHEETS_WRITE_URL = 'https://script.google.com/macros/s/AKfycbxRZ3gq53WZLk3223CgFZDVXDlBq4_JKPWZy56W44Gvc_GWL6bc-xM3NPo1jRIpFCenWg/exec';
const SECRET_STORAGE = 'lifeStatsSheetsSecret';

const DEFAULT_CATS = [
  { name: 'Miete/Büro', limit: '800' },
  { name: 'Software', limit: '50' },
  { name: 'Transport', limit: '100' },
  { name: 'Marketing', limit: '10%' },
  { name: 'Privatentnahme', limit: '30%' }
];

let transactions = [];
let categories = [];
let savingsRate = "0"; 
let currentDate = new Date();

// =====================
// Custom UI Modals
// =====================

// Hilfsfunktion für Abfragen (Ja/Nein)
function askConfirm(message, onConfirm) {
    const modal = document.getElementById('updateModal');
    const titleEl = modal.querySelector('h2');
    const descEl = modal.querySelector('.modal-desc');
    const confirmBtn = document.getElementById('confirmUpdate');
    const cancelBtn = document.getElementById('cancelUpdate');

    titleEl.innerText = 'Bestätigung';
    descEl.innerText = message;
    cancelBtn.style.display = 'block'; 
    
    modal.classList.add('open');

    confirmBtn.onclick = async () => {
        modal.classList.remove('open');
        await onConfirm();
    };

    cancelBtn.onclick = () => {
        modal.classList.remove('open');
    };
}

// Hilfsfunktion für einfache Alerts
function showCustomAlert(title, message) {
    const modal = document.getElementById('updateModal');
    const titleEl = modal.querySelector('h2');
    const descEl = modal.querySelector('.modal-desc');
    const confirmBtn = document.getElementById('confirmUpdate');
    const cancelBtn = document.getElementById('cancelUpdate');
    
    titleEl.innerText = title;
    descEl.innerText = message;
    cancelBtn.style.display = 'none'; 
    
    modal.classList.add('open');

    confirmBtn.onclick = () => {
        modal.classList.remove('open');
    };
}

// =====================
// Core App Logic
// =====================

function init() {
  transactions = JSON.parse(localStorage.getItem(KEY_TRANS) || '[]');
  categories = JSON.parse(localStorage.getItem(KEY_CATS) || JSON.stringify(DEFAULT_CATS));
  savingsRate = localStorage.getItem(KEY_SAVINGS) || "10%";
  render();
  bind();
}

function save() {
  localStorage.setItem(KEY_TRANS, JSON.stringify(transactions));
  localStorage.setItem(KEY_CATS, JSON.stringify(categories));
  localStorage.setItem(KEY_SAVINGS, savingsRate);
}

function getSalaryDates() {
  const salaries = transactions
    .filter(t => t.type === 'Einnahme' && t.category === 'Umsatz/Gehalt')
    .map(t => t.date)
    .sort();
  
  if (salaries.length === 0) {
    const d = new Date();
    d.setDate(1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return [`${y}-${m}-${da}`];
  }
  return salaries;
}

function dateToLocalStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function getPeriodRange(viewDate) {
  const salaryDates = getSalaryDates();
  const viewStr = dateToLocalStr(viewDate);
  
  let startIndex = -1;
  for (let i = salaryDates.length - 1; i >= 0; i--) {
    if (viewStr >= salaryDates[i]) {
      startIndex = i;
      break;
    }
  }
  
  if (startIndex === -1) startIndex = 0;
  const startStr = salaryDates[startIndex];
  const startDate = new Date(startStr);
  
  let endDate;
  let isProvisional = false;

  if (startIndex < salaryDates.length - 1) {
    const nextSalary = new Date(salaryDates[startIndex + 1]);
    nextSalary.setDate(nextSalary.getDate() - 1);
    endDate = nextSalary;
  } else {
    const today = new Date();
    today.setHours(0,0,0,0);
    const plannedEnd = new Date(startDate);
    plannedEnd.setMonth(plannedEnd.getMonth() + 1);
    plannedEnd.setDate(plannedEnd.getDate() - 1);
    endDate = (today > plannedEnd) ? today : plannedEnd;
    isProvisional = true;
  }
  
  startDate.setHours(0,0,0,0);
  endDate.setHours(23,59,59,999);
  return { start: startDate, end: endDate, isProvisional, index: startIndex };
}

function jumpPeriod(direction) {
  const salaryDates = getSalaryDates();
  const currentInfo = getPeriodRange(currentDate);
  const idx = currentInfo.index;
  
  if (direction === -1) {
    if (idx > 0) currentDate = new Date(salaryDates[idx - 1]);
    else {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() - 1);
      currentDate = d;
    }
  } else {
    if (idx < salaryDates.length - 1) currentDate = new Date(salaryDates[idx + 1]);
    else {
      const today = new Date();
      if (currentDate < today) currentDate = today;
      else {
        const d = new Date(currentDate);
        d.setMonth(d.getMonth() + 1);
        currentDate = d;
      }
    }
  }
  render();
}

function getPeriodData() {
  const range = getPeriodRange(currentDate);
  return transactions.filter(t => {
    const d = new Date(t.date);
    d.setHours(12,0,0,0);
    return d >= range.start && d <= range.end;
  });
}

// =====================
// Sheets Sync
// =====================

function requestSecret() {
  return new Promise((resolve) => {
    const existing = localStorage.getItem(SECRET_STORAGE);
    if (existing) return resolve(existing);

    const modal = document.getElementById('secretModal');
    const input = document.getElementById('secretInput');
    const saveBtn = document.getElementById('saveSecret');
    const closeBtn = document.getElementById('closeSecret');

    modal.classList.add('open');
    input.focus();

    const onSave = () => {
      const val = input.value.trim();
      if (val) {
        localStorage.setItem(SECRET_STORAGE, val);
        modal.classList.remove('open');
        cleanup();
        resolve(val);
        showCustomAlert('Gespeichert', 'Dein Secret wurde sicher lokal hinterlegt.');
      } else {
        showCustomAlert('Eingabe fehlt', 'Bitte gib ein Secret ein, um fortzufahren.');
      }
    };

    const onClose = () => {
      modal.classList.remove('open');
      cleanup();
      resolve(null);
    };

    function cleanup() {
      saveBtn.removeEventListener('click', onSave);
      closeBtn.removeEventListener('click', onClose);
    }

    saveBtn.addEventListener('click', onSave);
    closeBtn.addEventListener('click', onClose);
  });
}

async function pullFromSheets() {
  const urlTrans = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEETS_TAB)}`;
  try {
    const res = await fetch(urlTrans);
    const txt = await res.text();
    const json = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const newTrans = [];
    (json.table.rows || []).forEach(r => {
      const c = r.c;
      if(!c || !c[0] || !c[3]) return; 
      let dStr = null;
      if(typeof c[0].v === 'string' && c[0].v.startsWith('Date(')){
        const m = c[0].v.match(/Date\((\d+),(\d+),(\d+)\)/);
        if(m) dStr = `${m[1]}-${String(Number(m[2])+1).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
      } else { dStr = String(c[0].v).split('.').reverse().join('-'); }
      
      newTrans.push({
        date: dStr, type: c[1]?.v || 'Ausgabe', category: c[2]?.v || 'Sonstiges', amount: Number(c[3]?.v), note: c[4]?.v || ''
      });
    });
    transactions = newTrans;
  } catch(e) { console.error('Fehler Transaktionen', e); }

  const urlConfig = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEETS_TAB_CONFIG)}`;
  try {
    const res = await fetch(urlConfig);
    const txt = await res.text();
    const json = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const newCats = [];
    (json.table.rows || []).forEach(r => {
      const c = r.c;
      if(c[0] && c[1] && c[0].v !== 'Kategorie') {
        let limitVal = c[1].v;
        if (c[1].f && c[1].f.includes('%')) {
            limitVal = c[1].f; 
        } else if (typeof limitVal === 'number' && limitVal <= 1 && limitVal > 0) {
            limitVal = (limitVal * 100) + '%';
        } else {
            limitVal = String(limitVal);
        }
        newCats.push({ name: c[0].v, limit: limitVal });
      }
    });
    if(newCats.length > 0) categories = newCats;
  } catch(e) {}

  save(); render(); alert('✅ Sync komplett!');
}

async function pushEntry(entry) {
  const secret = await requestSecret();
  if(!secret) return;
  const p = new URLSearchParams();
  p.set('secret', secret); p.set('action', 'addFinanceEntry'); 
  p.set('date', entry.date); p.set('type', entry.type); 
  p.set('category', entry.category); p.set('amount', entry.amount); 
  p.set('note', entry.note);
  await fetch(SHEETS_WRITE_URL, { method:'POST', mode:'no-cors', body:p });
}

async function pushBudgets() {
  const secret = await requestSecret();
  if(!secret) return;
  const p = new URLSearchParams();
  p.set('secret', secret); p.set('action', 'saveBudgets');
  p.set('categories', JSON.stringify(categories));
  try { await fetch(SHEETS_WRITE_URL, { method:'POST', mode:'no-cors', body:p }); return true; } 
  catch(e) { return false; }
}

function exportCSV() {
  const headers = ["Datum", "Typ", "Kategorie", "Betrag", "Notiz"];
  const rows = transactions.map(t => [t.date, t.type, t.category, t.amount, `"${t.note}"`]);
  let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `finance_export.csv`);
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// =====================
// Helpers & Render
// =====================

function calculateVal(inputStr, base) {
  const s = String(inputStr);
  if(s.includes('%')) {
    const pct = parseFloat(s.replace('%', '').replace(',', '.'));
    return (base * pct) / 100;
  }
  return parseFloat(s) || 0;
}

function formatCurrency(num) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(num);
}

function formatDateDisplay(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long' });
}

function formatDateShort(date) {
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

// ... [Keep existing setup code up to render()] ...

function render() {
  // Update Period
  const range = getPeriodRange(currentDate);
  const startStr = formatDateShort(range.start);
  const endStr = formatDateShort(range.end);
  document.getElementById('currentPeriodLabel').innerHTML = range.isProvisional ? `${startStr} – ${endStr} (Prov.)` : `${startStr} – ${endStr}`;

  const data = getPeriodData();
  const income = data.filter(t => t.type === 'Einnahme').reduce((s,t) => s+t.amount, 0);
  const expense = data.filter(t => t.type === 'Ausgabe').reduce((s,t) => s+t.amount, 0);
  const net = income - expense;
  const margin = income > 0 ? ((net / income) * 100).toFixed(1) : 0;

  // KPI
  document.getElementById('kpiIncome').textContent = formatCurrency(income);
  document.getElementById('kpiExpense').textContent = formatCurrency(expense);
  document.getElementById('kpiNet').textContent = formatCurrency(net);
  document.getElementById('kpiMargin').textContent = `${margin}%`;
  document.getElementById('kpiNet').style.color = net >= 0 ? 'var(--accent-green)' : 'var(--text-primary)';

  // Piggy Bank
  const allSavings = transactions.filter(t => t.category === 'Sparschwein' && t.type === 'Ausgabe').reduce((s,t) => s+t.amount, 0);
  const monthSavings = data.filter(t => t.category === 'Sparschwein' && t.type === 'Ausgabe').reduce((s,t) => s+t.amount, 0);
  document.getElementById('piggyTotal').textContent = formatCurrency(allSavings);
  document.getElementById('piggyMonth').textContent = `+${formatCurrency(monthSavings)}`;
  document.getElementById('savingsRateLabel').textContent = `Auto: ${savingsRate}`;

  // Budgets
  const baseForBudgets = Math.max(0, income - monthSavings);
  const list = document.getElementById('budgetList');
  list.innerHTML = categories.map(cat => {
    const spent = data.filter(t => t.type === 'Ausgabe' && t.category === cat.name).reduce((s,t) => s+t.amount, 0);
    const limitVal = calculateVal(cat.limit, baseForBudgets);
    const pct = limitVal > 0 ? Math.min(100, (spent / limitVal) * 100) : 0;
    
    let statusClass = '';
    if(pct >= 100) statusClass = 'danger';
    else if(pct > 80) statusClass = 'warning';

    const limitDisplay = String(cat.limit).includes('%') ? `${limitVal.toFixed(0)} €` : `${cat.limit} €`;

    return `
      <div class="budget-item">
        <div class="b-meta">
          <span>${cat.name}</span>
          <span style="color:var(--text-secondary)">${formatCurrency(spent)} / ${limitDisplay}</span>
        </div>
        <div class="b-track">
          <div class="b-fill ${statusClass}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // Ledger
  const tList = document.getElementById('ledgerList');
  const sorted = data.sort((a,b) => b.date.localeCompare(a.date));
  const groups = {};
  sorted.forEach(t => { if(!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); });

  tList.innerHTML = Object.keys(groups).map(dateKey => {
    const groupItems = groups[dateKey].map(t => {
      let catDisplay = t.category;
      if (t.category === 'Sparschwein') catDisplay = 'Ersparnis';
      return `
      <div class="ledger-item">
        <div style="display:flex; flex-direction:column;">
          <span class="l-cat">${catDisplay}</span>
          <span class="l-note">${t.note || ''}</span>
        </div>
        <span class="l-amount ${t.type === 'Einnahme' ? 'pos' : ''}">
          ${t.type === 'Einnahme' ? '+' : ''}${t.amount.toFixed(2)}
        </span>
      </div>
    `}).join('');
    return `<div class="ledger-date-group"><div class="ledger-date-header">${formatDateDisplay(dateKey)}</div>${groupItems}</div>`;
  }).join('') || '<div style="text-align:center; color:#8E8E93; padding:20px;">Keine Buchungen</div>';
  
  updateCategorySelect();
}
// ... [Rest of logic remains the same] ...

function updateCategorySelect() {
  const type = document.querySelector('.seg-btn.active')?.dataset.type || 'Ausgabe';
  const sel = document.getElementById('category');
  const sourceGroup = document.getElementById('sourceGroup');
  
  if (type === 'Einnahme') {
    sel.innerHTML = `<option value="Umsatz/Gehalt">Umsatz / Gehalt</option><option value="Sonstiges">Sonstiges</option>`;
    sourceGroup.style.display = 'block';
  } else {
    sel.innerHTML = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('') + '<option value="Sonstiges">Sonstiges</option>';
    sourceGroup.style.display = 'none';
  }
}

// =====================
// Bindings
// =====================

function bind() {
  document.getElementById('prevMonth').onclick = () => jumpPeriod(-1);
  document.getElementById('nextMonth').onclick = () => jumpPeriod(1);

  document.getElementById('configSavingsBtn').onclick = () => {
    document.getElementById('newSavingsRate').value = savingsRate;
    document.getElementById('savingsModal').classList.add('open');
  };
  document.getElementById('closeSavings').onclick = () => document.getElementById('savingsModal').classList.remove('open');
  document.getElementById('saveSavings').onclick = () => {
    const val = document.getElementById('newSavingsRate').value;
    if(val) { savingsRate = val.trim(); save(); render(); }
    document.getElementById('savingsModal').classList.remove('open');
  };

  const modal = document.getElementById('addModal');
  document.getElementById('addBtn').onclick = () => {
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    modal.classList.add('open');
  };
  document.getElementById('closeAdd').onclick = () => modal.classList.remove('open');

  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateCategorySelect();
    };
  });


  
  document.getElementById('saveAdd').onclick = async () => {
    const type = document.querySelector('.seg-btn.active').dataset.type;
    const amount = parseFloat(document.getElementById('amount').value.replace(',','.'));
    const category = document.getElementById('category').value;
    let note = document.getElementById('note').value;
    const date = document.getElementById('date').value;
    const source = document.getElementById('source').value;

    if(!amount || !date) {
      showCustomAlert('Eingabe unvollständig', 'Bitte gib sowohl einen Betrag als auch ein Datum an.');
      return;
    }
    if(type === 'Einnahme' && source) note = `${source} | ${note}`;

    const entry = { date, type, category, amount, note };
    transactions.push(entry);
    
    if (type === 'Einnahme' && category === 'Umsatz/Gehalt') {
      const totalIncome = transactions.reduce((s,t) => t.type === 'Einnahme' ? s+t.amount : s, 0) - amount; 
      const totalExpense = transactions.reduce((s,t) => t.type === 'Ausgabe' ? s+t.amount : s, 0);
      const currentBalance = totalIncome - totalExpense;

      if (currentBalance > 0) {
        const sweepEntry = { date, type: 'Ausgabe', category: 'Sparschwein', amount: currentBalance, note: `Auto-Sweep` };
        transactions.push(sweepEntry);
        if(navigator.onLine) pushEntry(sweepEntry).catch(()=>{});
        showCustomAlert('Auto-Sweep', `Dein Restguthaben von ${formatCurrency(currentBalance)} wurde automatisch ins Sparschwein übertragen.`);
      }

      const saveAmount = calculateVal(savingsRate, amount);
      if (saveAmount > 0) {
        const savingsEntry = { date, type: 'Ausgabe', category: 'Sparschwein', amount: saveAmount, note: `Auto-Save (${savingsRate})` };
        transactions.push(savingsEntry);
        if(navigator.onLine) pushEntry(savingsEntry).catch(()=>{});
      }
    }

    save(); render(); modal.classList.remove('open');
    document.getElementById('amount').value = '';
    document.getElementById('note').value = '';
    document.getElementById('source').value = '';

    if(navigator.onLine) await pushEntry(entry);
  };

// --- Push & Sync Bindings mit Modals ---
  
  const syncBtn = document.getElementById('syncBtn');
  const syncModal = document.getElementById('syncConfirmModal');
  const confirmSyncBtn = document.getElementById('confirmSync');
  const cancelSyncBtn = document.getElementById('cancelSync');

  if (syncBtn) {
    syncBtn.onclick = () => syncModal.classList.add('open');
  }
  if (cancelSyncBtn) {
    cancelSyncBtn.onclick = () => syncModal.classList.remove('open');
  }
  if (confirmSyncBtn) {
    confirmSyncBtn.onclick = async () => {
      syncModal.classList.remove('open');
      syncBtn.innerText = '⏳'; 
      await pullFromSheets();
      syncBtn.innerText = '⬇️';
    };
  }

  const pushBtn = document.getElementById('pushBtn');
  const pushModal = document.getElementById('pushConfirmModal');
  const confirmPushBtn = document.getElementById('confirmPush');
  const cancelPushBtn = document.getElementById('cancelPush');

  if (pushBtn) {
    pushBtn.onclick = () => pushModal.classList.add('open');
  }
  if (cancelPushBtn) {
    cancelPushBtn.onclick = () => pushModal.classList.remove('open');
  }
  if (confirmPushBtn) {
    confirmPushBtn.onclick = async () => {
      pushModal.classList.remove('open');
      pushBtn.innerText = '⏳';
      const success = await pushBudgets();
      pushBtn.innerText = '⬆️';
      if (success) {
        showCustomAlert('Erfolg', '✅ Budgets erfolgreich gespeichert!');
      }
    };
  }

  // --- Budget Settings Modal ---
  const bModal = document.getElementById('budgetModal');
  const editBudgetsBtn = document.getElementById('editBudgetsBtn');
  if (editBudgetsBtn) {
    editBudgetsBtn.onclick = () => { 
      renderBudgetSettings(); 
      bModal.classList.add('open'); 
    };
  }
  
  const closeBudget = document.getElementById('closeBudget');
  if (closeBudget) closeBudget.onclick = () => bModal.classList.remove('open');
  
  const openAddCat = document.getElementById('openAddCatModal');
  const catModal = document.getElementById('catModal');
  if (openAddCat) {
    openAddCat.onclick = () => { 
      catModal.classList.add('open'); 
    };
  }
  
  const closeCat = document.getElementById('closeCat');
  if (closeCat) closeCat.onclick = () => catModal.classList.remove('open');
  
  const saveCat = document.getElementById('saveCat');
  if (saveCat) {
    saveCat.onclick = () => {
      const name = document.getElementById('newCatName').value;
      const limit = document.getElementById('newCatLimit').value;
      
      if(name && limit) {
        categories.push({name, limit});
        save(); 
        renderBudgetSettings(); 
        render();
        updateCategorySelect();
        if(navigator.onLine) pushBudgets();
        catModal.classList.remove('open');
        document.getElementById('newCatName').value = '';
        document.getElementById('newCatLimit').value = '';
      } else {
        showCustomAlert('Fehler', 'Bitte Name und Limit eingeben.');
      }
    };
  }
} // Ende der bind() Funktion

// =====================
// Global Render Helpers (Bereinigt)
// =====================

function renderBudgetSettings() {
  const list = document.getElementById('budgetSettingsList');
  if (!list) return;

  // WICHTIG: Nutzt 'updateCategoryData' statt 'updateCategorySelect'
  list.innerHTML = categories.map((c, i) => `
    <div class="set-item">
      <input class="form-input" style="flex:1" value="${c.name}" onchange="updateCategoryData(${i}, 'name', this.value)">
      <input class="form-input" style="width:80px" value="${c.limit}" onchange="updateCategoryData(${i}, 'limit', this.value)">
      <button class="small-btn danger" onclick="deleteCategory(${i})">×</button>
    </div>
  `).join('');
}

// Umbenannt um Konflikt mit dem UI-Update zu vermeiden
window.updateCategoryData = (i, f, v) => { 
  categories[i][f] = v; 
  save(); 
  render(); 
  updateCategorySelect(); // Update auch das Dropdown
  if(navigator.onLine) pushBudgets(); 
};

window.deleteCategory = (i) => { 
  if (confirm('Möchtest du diese Kategorie wirklich löschen?')) {
    categories.splice(i, 1); 
    save(); 
    renderBudgetSettings(); 
    render(); 
    if(typeof updateCategorySelect === 'function') updateCategorySelect();
    if(navigator.onLine) pushBudgets();
  }
};

// App Start
init();