// =====================
// Google Sheets CONFIG
// =====================
const SHEETS_ID = '1XDOkxSB0xm8vy8J6eFRkFa4r2tRoKD8m6ArhzhkuwcY';
const SHEETS_TAB = 'Daten';
const SHEETS_RANGE = 'A2:L366';
const SHEETS_WRITE_URL = 'https://script.google.com/macros/s/AKfycbxRZ3gq53WZLk3223CgFZDVXDlBq4_JKPWZy56W44Gvc_GWL6bc-xM3NPo1jRIpFCenWg/exec';
const SHEETS_SECRET_KEY = 'lifeStatsSheetsSecret';

// =====================
// CONFIG: Ranks / Level
// =====================
const SCREEN_RANKS = [
  { name: 'UNREAL', maxAvg: 1.5, class: 'champion' },
  { name: 'CHAMPION', maxAvg: 2.5, class: 'champion' },
  { name: 'ELITE', maxAvg: 3.0, class: 'diamond' },
  { name: 'DIAMANT', maxAvg: 3.5, class: 'diamond' },
  { name: 'PLATIN', maxAvg: 4.0, class: 'silver' },
  { name: 'GOLD', maxAvg: 5.0, class: 'gold' },
  { name: 'SILBER', maxAvg: 6.0, class: 'silver' },
  { name: 'BRONZE', maxAvg: 7.0, class: 'bronze' },
  { name: 'UNRANKED', maxAvg: Infinity, class: 'bronze' }
];

const MIN_ENTRIES_TO_SYNC = 10;

function isMeaningfulEntry(e) {
  if (!e) return false;
  return (
    (e.screen !== null && e.screen !== undefined) ||
    (e.steps !== null && e.steps !== undefined && e.steps !== 0) ||
    (e.weight !== null && e.weight !== undefined && e.weight !== 0) ||
    e.morning === true ||
    e.evening === true ||
    e.fap === true ||
    e.gym === true
  );
}

function countMeaningfulEntries() {
  return data.filter(isMeaningfulEntry).length;
}

function canSyncToSheets() {
  return countMeaningfulEntries() >= MIN_ENTRIES_TO_SYNC;
}

function updateSyncLockUI() {
  const saveBtn = document.getElementById('saveEntry');
  const pushBtn = document.getElementById('pushTodayBtn');
  const status = document.getElementById('syncStatus');

  const n = countMeaningfulEntries();
  const locked = n < MIN_ENTRIES_TO_SYNC;

  if (pushBtn) pushBtn.disabled = locked;

  if (saveBtn) {
    saveBtn.dataset.locked = locked ? 'true' : 'false';
    saveBtn.textContent = locked
      ? `💾 Lokal (${n}/${MIN_ENTRIES_TO_SYNC})`
      : `💾 Speichern`;
  }

  if (status) {
    status.textContent = locked
      ? `🔒 Sync gesperrt: ${n}/${MIN_ENTRIES_TO_SYNC}`
      : ``;
  }
}

const RANK_IMAGE_MAP = {
  'BRONZE': 'Bronze.png',
  'SILBER': 'Silber.png',
  'GOLD': 'Gold.png',
  'PLATIN': 'Platin.png',
  'DIAMANT': 'Diamant.png',
  'ELITE': 'Elite.png',
  'CHAMPION': 'Champion.png',
  'UNREAL': 'Unreal.png',
  'UNRANKED': 'Unranked.png'
};

const LEVELS = [
  { level: 1, xpRequired: 100 },
  { level: 2, xpRequired: 300 },
  { level: 3, xpRequired: 750 },
  { level: 4, xpRequired: 1500 },
  { level: 5, xpRequired: 2500 },
  { level: 6, xpRequired: 3800 },
  { level: 7, xpRequired: 5000 },
  { level: 8, xpRequired: 6200 },
  { level: 9, xpRequired: 6800 },
  { level: 10, xpRequired: 7150 }
];

const BOSS_DAMAGE_PER_ROUTINE = 100 / 14;

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAYS_FULL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

// =====================
// STATE
// =====================
let data = [];
let currentView = 'avg';
let currentMonth = 'total';

// =====================
// Helpers
// =====================
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function parseDate(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d);
}
function getToday() { return formatDate(new Date()); }
function formatDateShort(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getDate()}.${d.getMonth()+1}`;
}

function formatHoursHM(hours) {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '--';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
function timeStrToHours(t) {
  if (!t) return null;
  const [hh,mm] = t.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh + mm/60;
}
function hoursToTimeStr(hours) {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '';
  const totalMinutes = Math.round(hours*60);
  const hh = Math.floor(totalMinutes/60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}
function getRankImageSrc(rankName) {
  // Pfad ggf. anpassen
  const file = RANK_IMAGE_MAP[rankName] || RANK_IMAGE_MAP.UNRANKED;
  return `../FortniteRanks/${file}`;
}

// =====================
// Helpers: Week & Boss
// =====================
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}
function getSunday(date) {
  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}
function getFirstMondayOfYear(year) {
  const jan1 = new Date(year, 0, 1);
  let m = getMonday(jan1);
  if (m.getFullYear() < year) m.setDate(m.getDate() + 7);
  return m;
}
function getLastMondayOfYear(year) {
  const dec31 = new Date(year, 11, 31);
  return getMonday(dec31);
}
function getWeeklyRoutinePoints(mondayDate) {
  const sunday = new Date(mondayDate);
  sunday.setDate(mondayDate.getDate() + 6);
  const mondayStr = formatDate(mondayDate);
  const sundayStr = formatDate(sunday);
  const weekData = data.filter(d => d.date >= mondayStr && d.date <= sundayStr);
  return weekData.reduce((acc, d) => acc + (d.morning?1:0) + (d.evening?1:0), 0);
}
function getBossYearStats(year) {
  const firstMon = getFirstMondayOfYear(year);
  const lastMon = getLastMondayOfYear(year);
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const possible = Math.floor((lastMon - firstMon) / oneWeek) + 1;
  let defeated = 0;
  for (let i = 0; i < possible; i++) {
    const monday = new Date(firstMon);
    monday.setDate(firstMon.getDate() + i * 7);
    if (getWeeklyRoutinePoints(monday) >= 14) defeated++;
  }
  return { defeated, possible };
}
function getDaysUntilMonday() {
  const day = new Date().getDay();
  if (day === 0) return 1;
  if (day === 1) return 7;
  return 8 - day;
}

// =====================
// LocalStorage & Sheets
// =====================
function loadData() {
  const saved = localStorage.getItem('lifeStatsData');
  if (saved) { data = JSON.parse(saved); return; }
  data = [];
  saveData();
}
function saveData() { localStorage.setItem('lifeStatsData', JSON.stringify(data)); }

async function pullFromSheets() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEETS_TAB)}&range=${encodeURIComponent(SHEETS_RANGE)}`;
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const rows = (json && json.table && json.table.rows) ? json.table.rows : [];
  const newData = [];

  function cellVal(c) { return (c && c.v != null) ? c.v : null; }
  function cellBool(c) { const v = cellVal(c); return v === true || v === 'TRUE' || v === 1; }
  function parseMaybeNumber(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const n = Number(String(v).replace(/[^\d,.-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  function parseDateCell(v) {
    if (!v) return null;
    if (typeof v === 'string' && v.startsWith('Date(')) {
      const m = v.match(/Date\((\d+),(\d+),(\d+)\)/);
      if (m) return `${m[1]}-${String(Number(m[2])+1).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(String(v))) {
      const p = String(v).split('.'); return `${p[2]}-${p[1]}-${p[0]}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return v;
    return null;
  }

  for (const r of rows) {
    const c = r.c || [];
    const dateStr = parseDateCell(cellVal(c[0]));
    if (!dateStr) continue;

    const screen = parseMaybeNumber(cellVal(c[1]));
    const morning = cellBool(c[2]);
    const evening = cellBool(c[3]);
    const fap = cellBool(c[5]);
    const gym = cellBool(c[6]);
    const weight = parseMaybeNumber(cellVal(c[7]));
    const steps = parseMaybeNumber(cellVal(c[8]));
    const workout = cellVal(c[11]) ? String(cellVal(c[11])) : '';

    if (screen!=null || morning || evening || fap || gym || weight!=null || steps!=null || workout!=='') {
      newData.push({ date: dateStr, screen, morning, evening, fap, gym, weight, steps, workout });
    }
  }
  newData.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  data = newData;
  saveData();
}

function getSheetsSecret() {
  let s = localStorage.getItem(SHEETS_SECRET_KEY);
  if (!s) {
    s = prompt('Sheets Secret (wird lokal gespeichert):');
    if (s) localStorage.setItem(SHEETS_SECRET_KEY, s);
  }
  return s;
}

async function pushEntryToSheets(entry) {
  const secret = getSheetsSecret();
  if (!secret) throw new Error('No secret');
  
  // Wir erstellen ein echtes JSON Objekt
  const payload = {
    secret: secret,
    action: 'updateDay',
    date: entry.date,
    screen: (entry.screen == null) ? '' : entry.screen,
    weight: (entry.weight == null) ? '' : entry.weight,
    steps: (entry.steps == null) ? '' : entry.steps,
    morning: entry.morning, // bool wird direkt übergeben
    evening: entry.evening,
    fap: entry.fap,
    gym: entry.gym,
    workout: entry.workout ?? ''
  };

  // WICHTIG: Body als Stringify senden, damit Google Script JSON.parse nutzen kann
  await fetch(SHEETS_WRITE_URL, { 
    method: 'POST', 
    mode: 'no-cors', 
    body: JSON.stringify(payload) 
  });
}

function setStatus(msg) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = msg;
}

// =====================
// Logic & Calcs
// =====================
function getAverageScreentime14Days() {
  const today = new Date();
  const from = new Date();
  from.setDate(today.getDate() - 14);
  const filtered = data.filter(d => {
    const dt = parseDate(d.date);
    return dt > from && dt <= today && d.screen != null && d.screen > 0;
  });
  if (filtered.length === 0) return 0;
  return filtered.reduce((a,d) => a + d.screen, 0) / filtered.length;
}
function getScreenRank(avg) {
  for (const r of SCREEN_RANKS) if (avg < r.maxAvg) return r;
  return SCREEN_RANKS[SCREEN_RANKS.length - 1];
}
function getTotalXP() {
  return data.reduce((acc,d) => acc + ((d.morning?1:0) + (d.evening?1:0)) * 10, 0);
}
function getStreak() {
  const todayStr = getToday();
  const sorted = data.filter(d => d.date <= todayStr).sort((a,b)=> parseDate(b.date)-parseDate(a.date));
  let streak = 0;
  for (const day of sorted) {
    if ((day.morning?1:0) + (day.evening?1:0) === 0) break;
    streak++;
  }
  return streak;
}
function getCurrentLevel() {
  const xp = getTotalXP();
  if (xp < 100) return 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) if (xp >= LEVELS[i].xpRequired) return LEVELS[i].level;
  return 1;
}
function getXPToNextLevel() {
  const xp = getTotalXP();
  const lvl = getCurrentLevel();
  if (lvl >= 10) return 0;
  const next = LEVELS.find(l => l.level === lvl + 1);
  return next ? next.xpRequired - xp : 0;
}
function getLevelProgress() {
  const xp = getTotalXP();
  const lvl = getCurrentLevel();
  if (lvl === 0) return (xp / 100) * 100;
  if (lvl >= 10) return 100;
  const curr = LEVELS.find(l => l.level === lvl)?.xpRequired || 0;
  const next = LEVELS.find(l => l.level === lvl + 1)?.xpRequired || curr;
  return ((xp - curr) / (next - curr)) * 100;
}
function getWeeklyBossData() {
  const today = new Date();
  const monday = getMonday(today);
  const sunday = getSunday(today);
  const mondayStr = formatDate(monday);
  const sundayStr = formatDate(sunday);
  const weekData = data.filter(d => d.date >= mondayStr && d.date <= sundayStr);
  const weeklyPoints = weekData.reduce((acc,d)=> acc + (d.morning?1:0) + (d.evening?1:0), 0);
  const hp = Math.max(0, 100 - weeklyPoints * BOSS_DAMAGE_PER_ROUTINE);
  return { weekNum: getWeekNumber(today), hp: Math.round(hp), routinesLeft: Math.ceil(hp / BOSS_DAMAGE_PER_ROUTINE), daysUntilReset: getDaysUntilMonday(), defeated: hp <= 0 };
}
function getCurrentWeekDays() {
  const now = new Date();
  const todayStr = formatDate(now);
  const monday = getMonday(now);
  const result = [];
  for (let i=0;i<7;i++){
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = formatDate(date);
    const dayData = data.find(d => d.date === dateStr) || null;
    result.push({
      date, dateStr,
      dayName: DAYS[date.getDay()],
      dayNum: date.getDate(),
      data: dayData,
      isFuture: dateStr > todayStr,
      isToday: dateStr === todayStr
    });
  }
  return result;
}
function getLast14DaysScreen() {
  const today = new Date();
  const out = [];
  for (let i=0;i<14;i++){
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = formatDate(d);
    const row = data.find(x => x.date === ds);
    out.push({ date: ds, screen: row?.screen ?? null });
  }
  return out.reverse();
}
function getLast14DaysXP() {
  const today = new Date();
  const out = [];
  for (let i=0;i<14;i++){
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = formatDate(d);
    const row = data.find(x => x.date === ds);
    const xp = row ? ((row.morning?1:0) + (row.evening?1:0))*10 : 0;
    out.push({ date: ds, xp, morning: row?.morning, evening: row?.evening });
  }
  return out.reverse();
}
function getTodayData() {
  const today = getToday();
  return data.find(d => d.date === today) || { date: today, screen:null, morning:false, evening:false, fap:false, gym:false, weight:null, steps:null };
}

// =====================
// Stats Aggregation
// =====================
function getMonthlyStats(year, month) {
  const start = formatDate(new Date(year, month, 1));
  const end = formatDate(new Date(year, month + 1, 0));
  const monthData = data.filter(d => d.date >= start && d.date <= end);
  const gymDays = monthData.filter(d => d.gym === true);
  const fapDays = monthData.filter(d => d.fap === true);
  const stepsData = monthData.filter(d => d.steps != null && d.steps > 0);
  const totalSteps = stepsData.reduce((s,d)=> s + d.steps, 0);
  const avgSteps = stepsData.length ? Math.round(totalSteps / stepsData.length) : 0;
  const weights = monthData.filter(d => d.weight != null && d.weight > 0).sort((a,b)=>parseDate(a.date)-parseDate(b.date));
  const startW = weights.length ? weights[0].weight : null;
  const endW = weights.length ? weights[weights.length-1].weight : null;
  const diff = (startW != null && endW != null) ? (endW - startW) : null;
  return {
    gym: { count: gymDays.length, days: gymDays },
    fap: { count: fapDays.length, days: fapDays },
    steps: { total: totalSteps, avg: avgSteps, days: stepsData },
    weight: { start: startW, end: endW, diff, days: weights }
  };
}

function getTotalStats() {
  const gymDays = data.filter(d => d.gym === true);
  const fapDays = data.filter(d => d.fap === true);
  const stepsData = data.filter(d => d.steps != null && d.steps > 0);
  const totalSteps = stepsData.reduce((s,d)=> s + d.steps, 0);
  const avgSteps = stepsData.length ? Math.round(totalSteps / stepsData.length) : 0;
  const monthsWithData = new Set(data.map(d => d.date.substring(0,7)));
  const monthCount = monthsWithData.size || 1;
  const weights = data.filter(d => d.weight != null && d.weight > 0).sort((a,b)=>parseDate(a.date)-parseDate(b.date));
  const startW = weights.length ? weights[0].weight : null;
  const endW = weights.length ? weights[weights.length-1].weight : null;
  return {
    gym: { count: gymDays.length, avgPerMonth: (gymDays.length / monthCount).toFixed(1), days: gymDays },
    fap: { count: fapDays.length, avgPerMonth: (fapDays.length / monthCount).toFixed(1), days: fapDays },
    steps: { total: totalSteps, avg: avgSteps, days: stepsData },
    weight: { start: startW, end: endW, days: weights }
  };
}

function populateMonthDropdown() {
  const select = document.getElementById('monthSelect');
  if (!select) return;
  while (select.options.length > 1) select.remove(1);
  const months = new Set(data.map(d => d.date.substring(0,7)));
  const sorted = [...months].sort().reverse();
  for (const m of sorted) {
    const [y, mo] = m.split('-').map(Number);
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `${MONTHS[mo-1]} ${y}`;
    select.appendChild(opt);
  }
}

// =====================
// RENDER UI
// =====================
function renderAll() {
  renderToday();
  renderScreentime();
  renderRoutine();
  renderBoss();
  renderWeek();
  renderStats();
  updateSyncLockUI();
}

function renderToday() {
  const t = getTodayData();
  const m = document.getElementById('todayMorning');
  const e = document.getElementById('todayEvening');
  const g = document.getElementById('todayGym');
  const f = document.getElementById('todayFap');
  const s = document.getElementById('todayScreen');
  const st = document.getElementById('todaySteps');

  if (m) { m.textContent = t.morning ? '✓' : '○'; m.className = `today-status ${t.morning ? 'done' : 'pending'}`; }
  if (e) { e.textContent = t.evening ? '✓' : '○'; e.className = `today-status ${t.evening ? 'done' : 'pending'}`; }
  if (g) { g.textContent = t.gym ? '✓' : '○'; g.className = `today-status ${t.gym ? 'done' : 'pending'}`; }
  if (f) { f.textContent = t.fap ? '✓' : '○'; f.className = `today-status ${t.fap ? 'bad' : 'pending'}`; }
  if (s) { s.textContent = formatHoursHM(t.screen); }
  if (st) { st.textContent = (t.steps != null) ? Number(t.steps).toLocaleString('de-DE') : '--'; }
}

function renderScreentime() {
  const avg = getAverageScreentime14Days();
  const rank = getScreenRank(avg);
  const rankEl = document.getElementById('screenRank');
  const iconEl = document.getElementById('screenRankIcon');
  const avgEl = document.getElementById('screenAvg');
  const progEl = document.getElementById('screenProgress');
  const nextEl = document.getElementById('screenNext');
  const reqEl = document.getElementById('screenRequirements');
  const dailyEl = document.getElementById('screenDaily');

  if (rankEl) { rankEl.textContent = rank.name; rankEl.className = `rank-badge ${rank.class}`; }
  if (iconEl) { iconEl.src = getRankImageSrc(rank.name); }
  if (avgEl) { avgEl.textContent = `${formatHoursHM(avg)} avg`; }

  if (progEl && nextEl) {
    const idx = SCREEN_RANKS.findIndex(r => r.name === rank.name);
    if (idx > 0) {
      const nextRank = SCREEN_RANKS[idx - 1];
      const progress = ((rank.maxAvg - avg) / (rank.maxAvg - nextRank.maxAvg)) * 100;
      progEl.style.width = `${Math.max(0, Math.min(100, progress))}%`;
      nextEl.textContent = `Next: < ${formatHoursHM(nextRank.maxAvg)}`;
    } else {
      progEl.style.width = '100%';
      nextEl.textContent = 'Max Rank';
    }
  }

  if (reqEl) {
    reqEl.innerHTML = SCREEN_RANKS.slice(0,-1).map(r => {
      const achieved = avg < r.maxAvg;
      return `<div class="requirement-item ${achieved?'achieved':'locked'}"><span class="requirement-status">${achieved?'✅':'🔒'}</span><span class="requirement-name">${r.name}</span><span class="requirement-value">< ${formatHoursHM(r.maxAvg)}</span></div>`;
    }).join('');
  }
  if (dailyEl) {
    dailyEl.innerHTML = getLast14DaysScreen().map(d => `<div class="daily-item"><span class="daily-date">${formatDateShort(d.date)}</span><span class="daily-value">${d.screen?formatHoursHM(d.screen):'--'}</span></div>`).join('');
  }
}

function renderRoutine() {
  const level = getCurrentLevel();
  const xp = getTotalXP();
  const streak = getStreak();
  const xpToNext = getXPToNextLevel();
  const progress = getLevelProgress();

  const levelEl = document.getElementById('routineLevel');
  const streakEl = document.getElementById('streakDays');
  const xpEl = document.getElementById('totalPoints');
  const progEl = document.getElementById('levelProgress');
  const nextEl = document.getElementById('levelNext');
  const reqEl = document.getElementById('levelRequirements');
  const dailyEl = document.getElementById('levelDaily');

  if (levelEl) levelEl.textContent = level;
  if (streakEl) streakEl.textContent = streak;
  if (xpEl) xpEl.textContent = xp;
  if (progEl) progEl.style.width = `${Math.min(100, progress)}%`;
  if (nextEl) nextEl.textContent = level>=10 ? 'Max Level' : `+${xpToNext} XP`;

  if (reqEl) {
    reqEl.innerHTML = LEVELS.map(l => {
      const achieved = xp >= l.xpRequired;
      const current = l.level === level;
      return `<div class="requirement-item ${achieved?'achieved':'locked'} ${current?'current':''}"><span class="requirement-status">${achieved?'✅':'🔒'}</span><span class="requirement-name">Lvl ${l.level}</span><span class="requirement-value">${l.xpRequired} XP</span></div>`;
    }).join('');
  }
  if (dailyEl) {
    dailyEl.innerHTML = getLast14DaysXP().map(d => `<div class="daily-item"><span class="daily-date">${formatDateShort(d.date)}</span><span style="flex:1">${d.morning?'☀️':'○'} ${d.evening?'🌙':'○'}</span><span class="daily-value">+${d.xp}</span></div>`).join('');
  }
}

function renderBoss() {
  const boss = getWeeklyBossData();
  const weekEl = document.getElementById('bossWeek');
  const hpEl = document.getElementById('bossHp');
  const hpText = document.getElementById('bossHpText');
  const info = document.getElementById('bossInfo');
  const yearEl = document.getElementById('bossYear');

  if (weekEl) weekEl.textContent = `KW ${boss.weekNum}`;
  if (hpEl) hpEl.style.width = `${boss.hp}%`;
  if (hpText) hpText.textContent = `${boss.hp}%`;
  if (info) info.textContent = boss.defeated ? '🏆 Boss besiegt!' : `⚔️ ${boss.routinesLeft} Left`;

  if (yearEl) {
    const ys = getBossYearStats(new Date().getFullYear());
    yearEl.textContent = `Jahr: ${ys.defeated}/${ys.possible}`;
  }
}

function renderWeek() {
  const week = getCurrentWeekDays();
  const grid = document.getElementById('weekGrid');
  const detail = document.getElementById('weekDetailList');

  if (grid) {
    grid.innerHTML = week.map(day => {
      let cls = 'missed', icon = '✗';
      if (day.isFuture) { cls='future'; icon='·'; }
      else if (day.data) {
        const pts = (day.data.morning?1:0) + (day.data.evening?1:0);
        if (pts===2) { cls='perfect'; icon='✓✓'; }
        else if (pts===1) { cls='partial'; icon='✓'; }
      } else if (day.isToday) { icon='○'; }
      return `<div class="week-day ${cls}${day.isToday?' today':''}"><span class="week-day-name">${day.dayName}</span><span class="week-day-num">${day.dayNum}</span><span class="week-day-status">${icon}</span></div>`;
    }).join('');
  }
  if (detail) {
    detail.innerHTML = week.map(day => {
      const m = day.data?.morning === true;
      const e = day.data?.evening === true;
      const pts = day.isFuture ? null : (m?1:0)+(e?1:0);
      const cls = day.isFuture ? 'future' : (pts===2?'perfect':(pts===1?'partial':'missed'));
      return `<div class="week-detail-item ${cls}"><div class="week-detail-date"><span class="week-detail-day">${DAYS_FULL[day.date.getDay()]}</span> <span class="week-detail-num">${day.dayNum}.${day.date.getMonth()+1}</span></div><div class="week-detail-routines"><span class="routine-badge ${m?'done':'missed'}">☀️</span> <span class="routine-badge ${e?'done':'missed'}">🌙</span></div><span class="week-detail-points">${day.isFuture?'-':`${pts}/2`}</span></div>`;
    }).join('');
  }
}

function renderStats() {
  const isTotal = currentMonth === 'total';
  const isAvg = currentView === 'avg';
  const stats = isTotal ? getTotalStats() : (() => {
    const [y,m] = currentMonth.split('-').map(Number);
    return getMonthlyStats(y, m-1);
  })();

  // DOM Elements
  const elGym = document.getElementById('statGym');
  const lbGym = document.getElementById('labelGym');
  const elFap = document.getElementById('statFap');
  const lbFap = document.getElementById('labelFap');
  const elSteps = document.getElementById('statSteps');
  const lbSteps = document.getElementById('labelSteps');
  const elWeight = document.getElementById('weightDisplay');
  const lbWeight = document.getElementById('labelWeight');

  // Gym
  if (elGym) elGym.textContent = isTotal ? (isAvg ? `${stats.gym.avgPerMonth}/Mo` : stats.gym.count) : stats.gym.count;
  if (lbGym) lbGym.textContent = isTotal ? (isAvg ? 'Gym Ø' : 'Gym Total') : 'Gym Tage';

  // Fap
  if (elFap) elFap.textContent = isTotal ? (isAvg ? `${stats.fap.avgPerMonth}/Mo` : stats.fap.count) : stats.fap.count;
  if (lbFap) lbFap.textContent = isTotal ? (isAvg ? 'Fap Ø' : 'Fap Total') : 'Fap Tage';

  // Steps
  if (elSteps) elSteps.textContent = isAvg
    ? (stats.steps.avg > 1000 ? `${(stats.steps.avg/1000).toFixed(1)}k` : (stats.steps.avg || '--'))
    : (stats.steps.total ? stats.steps.total.toLocaleString('de-DE') : '--');
  if (lbSteps) lbSteps.textContent = isAvg ? 'Schritte Ø' : 'Schritte Σ';

  // Weight (Formatted for simple text span)
  if (elWeight) {
    if (isTotal) {
      if (stats.weight.start && stats.weight.end) {
        elWeight.textContent = `${stats.weight.start} ➝ ${stats.weight.end}`;
      } else {
        elWeight.textContent = stats.weight.end || '--';
      }
      if (lbWeight) lbWeight.textContent = 'Start ➝ Ende';
    } else {
      const diff = stats.weight.diff;
      elWeight.textContent = (diff == null) ? '--' : `${diff>0?'+':''}${diff} kg`;
      if (lbWeight) lbWeight.textContent = 'Differenz';
    }
  }

  // Lists
  const gymList = document.getElementById('gymDaily');
  if (gymList) gymList.innerHTML = stats.gym.days.length ? stats.gym.days.map(d => `<div class="daily-item"><span class="daily-date">${formatDateShort(d.date)}</span><span class="daily-value good">Gym</span></div>`).join('') : '';
  
  const fapList = document.getElementById('fapDaily');
  if (fapList) fapList.innerHTML = stats.fap.days.length ? stats.fap.days.map(d => `<div class="daily-item"><span class="daily-date">${formatDateShort(d.date)}</span><span class="daily-value bad">Fap</span></div>`).join('') : '';

  const stepsList = document.getElementById('stepsDaily');
  if (stepsList) stepsList.innerHTML = stats.steps.days.length ? stats.steps.days.map(d => `<div class="daily-item"><span class="daily-date">${formatDateShort(d.date)}</span><span class="daily-value neutral">${d.steps}</span></div>`).join('') : '';

  const weightList = document.getElementById('weightDaily');
  if (weightList) weightList.innerHTML = stats.weight.days.length ? stats.weight.days.map(d => `<div class="daily-item"><span class="daily-date">${formatDateShort(d.date)}</span><span class="daily-value">${d.weight} kg</span></div>`).join('') : '';
}

// =====================
// Binding
// =====================
function bindEvents() {
  if (window.__eventsBound) return;
  window.__eventsBound = true;

  // Click on Headers to expand
  document.addEventListener('click', (e) => {
    const header = e.target.closest('.card-header, .stat-header');
    if (!header) return;
    let wrapper = header.closest('.expandable');
    if (!wrapper) wrapper = header.closest('.stat-card'); // fallback
    if (wrapper && wrapper.classList.contains('expandable')) {
      wrapper.classList.toggle('open');
    }
  });

  // Entry Toggles
  ['toggleMorning', 'toggleEvening', 'toggleGym', 'toggleFap'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = () => btn.dataset.active = (btn.dataset.active !== 'true').toString();
  });

  // View Toggle (Avg / Sum)
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      renderStats();
    };
  });

  // Month Select
  const ms = document.getElementById('monthSelect');
  if (ms) ms.onchange = () => { currentMonth = ms.value; renderStats(); };

  // Save
  const saveBtn = document.getElementById('saveEntry');
  if (saveBtn) saveBtn.onclick = saveEntry;

  // Date Change (Prefill)
  const dIn = document.getElementById('entryDate');
  if (dIn) dIn.onchange = () => {
    const d = data.find(x => x.date === dIn.value);
    const s = document.getElementById('entryScreen');
    const st = document.getElementById('entrySteps');
    const w = document.getElementById('entryWeight');
    const wo = document.getElementById('entryWorkout');
    if (s) s.value = d && d.screen ? hoursToTimeStr(d.screen) : '';
    if (st) st.value = d && d.steps ? d.steps : '';
    if (w) w.value = d && d.weight ? d.weight : '';
    if (wo) wo.value = d && d.workout ? d.workout : 'Pause';
    
    document.getElementById('toggleMorning').dataset.active = (d?.morning===true).toString();
    document.getElementById('toggleEvening').dataset.active = (d?.evening===true).toString();
    document.getElementById('toggleGym').dataset.active = (d?.gym===true).toString();
    document.getElementById('toggleFap').dataset.active = (d?.fap===true).toString();
  };

  // Sync Buttons
  const pull = document.getElementById('pullSheetsBtn');
  if (pull) pull.onclick = async () => {
    setStatus('Lade...'); await pullFromSheets(); populateMonthDropdown(); setTodayDate(); renderAll(); setStatus('✅ Fertig'); setTimeout(()=>setStatus(''),2000);
  };
  const push = document.getElementById('pushTodayBtn');
  if (push) push.onclick = async () => {
    if (!canSyncToSheets()) { setStatus(`Gesperrt: ${countMeaningfulEntries()}/${MIN_ENTRIES_TO_SYNC}`); return; }
    const dateVal = document.getElementById('entryDate').value;
    const entry = data.find(d => d.date === dateVal);
    if (!entry) return;
    setStatus('Sende...'); await pushEntryToSheets(entry); setStatus('✅ Gesendet'); setTimeout(()=>setStatus(''),2000);
  };
  const rKey = document.getElementById('resetSecretBtn');
  if (rKey) rKey.onclick = () => { localStorage.removeItem(SHEETS_SECRET_KEY); setStatus('Key gelöscht'); };
  const rData = document.getElementById('resetData');
  if (rData) rData.onclick = () => { if(confirm('Alles löschen?')) { localStorage.removeItem('lifeStatsData'); location.reload(); } };
}

function setTodayDate() {
  const t = getTodayData();
  const dIn = document.getElementById('entryDate');
  if (dIn) dIn.value = t.date;
  const s = document.getElementById('entryScreen');
  if (s) s.value = t.screen ? hoursToTimeStr(t.screen) : '';
  const st = document.getElementById('entrySteps');
  if (st) st.value = t.steps || '';
  const w = document.getElementById('entryWeight');
  if (w) w.value = t.weight || '';
  const wo = document.getElementById('entryWorkout');
  if (wo) wo.value = t.workout || 'Pause';

  document.getElementById('toggleMorning').dataset.active = (t.morning===true).toString();
  document.getElementById('toggleEvening').dataset.active = (t.evening===true).toString();
  document.getElementById('toggleGym').dataset.active = (t.gym===true).toString();
  document.getElementById('toggleFap').dataset.active = (t.fap===true).toString();
}

async function saveEntry() {
  const dateVal = document.getElementById('entryDate').value;
  if (!dateVal) return;
  const sVal = document.getElementById('entryScreen').value;
  const stVal = document.getElementById('entrySteps').value;
  const wVal = document.getElementById('entryWeight').value;
  const woVal = document.getElementById('entryWorkout').value;

  const m = document.getElementById('toggleMorning').dataset.active === 'true';
  const e = document.getElementById('toggleEvening').dataset.active === 'true';
  const g = document.getElementById('toggleGym').dataset.active === 'true';
  const f = document.getElementById('toggleFap').dataset.active === 'true';

  if (g && (!woVal || woVal === 'Pause')) {
    alert('Bitte Workout (Upper/Lower) wählen!');
    return;
  }

  let entry = data.find(d => d.date === dateVal);
  if (!entry) { entry = { date: dateVal }; data.push(entry); }

  entry.screen = sVal ? timeStrToHours(sVal) : null;
  entry.steps = stVal ? parseInt(stVal.replace(/\D/g,'')) : null;
  entry.weight = wVal ? parseFloat(wVal.replace(',','.')) : null;
  entry.morning = m;
  entry.evening = e;
  entry.gym = g;
  entry.fap = f;
  entry.workout = woVal;

  data.sort((a,b)=> parseDate(a.date) - parseDate(b.date));
  saveData();
  populateMonthDropdown();
  renderAll();

  if (canSyncToSheets()) {
    setStatus('Speichere Cloud...');
    try { await pushEntryToSheets(entry); setStatus('✅ Cloud Sync OK'); } 
    catch { setStatus('⚠️ Nur lokal'); }
  } else {
    setStatus(`💾 Lokal (${countMeaningfulEntries()}/${MIN_ENTRIES_TO_SYNC})`);
  }
  setTimeout(()=>setStatus(''),2500);
}

// Start
(function() {
  loadData();
  populateMonthDropdown();
  setTodayDate();
  renderAll();
  bindEvents();
})();

