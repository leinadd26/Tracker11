// =====================
// Routinen (Basiszeiten)
// =====================
const routines = {
  morning: [
    ["Aufstehen & Trinken", "06:00"],
    ["Badezimmer", "06:05"],
    ["Anziehen & Packen", "06:30"],
    ["Tag planen", "06:40"],
    ["Bibel & Gebet", "06:45"],
    ["Frühstück", "07:00"]
  ],
  evening: [
    ["Bad / Duschen", "20:00"],
    ["Schlafbereit", "20:30"],
    ["Bibel lesen", "20:45"],
    ["Schlafen", "21:30"]
  ]
};

// ===== Keys & Config =====
const SLEEP_KEY = 'routineSleepDurationMin';
const SCHEDULE_KEY = 'routineSchedule';
const DEFAULT_SLEEP_MIN = 8 * 60 + 30;

// ===== DOM =====
const actionEl = document.getElementById("action");
const timeEl = document.getElementById("newTime");
const sleepDurationEl = document.getElementById("sleepDuration");
const sleepHintEl = document.getElementById("sleepHint");

const containerEl = document.getElementById("routineListContainer"); // NEU
const wakeTimeEl = document.getElementById("wakeTime");
const sleepTimeEl = document.getElementById("sleepTime");

const confirmBtn = document.getElementById("confirmBtn");
const successMessage = document.getElementById("successMessage");
const confirmText = confirmBtn.querySelector('.confirm-text');

// ===== State =====
let currentShift = 0;
let currentMorningShift = 0;
let currentEveningShift = 0;
let sleepDurationMin = DEFAULT_SLEEP_MIN;

// =====================
// Helpers
// =====================
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  m = (m + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}

function durationToStr(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}Std ${String(m).padStart(2, '0')}min`;
}

function parseDurationFromTimeInput(val) {
  if (!val) return DEFAULT_SLEEP_MIN;
  const [h, m] = val.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return DEFAULT_SLEEP_MIN;
  return (h * 60 + m);
}

function durationToTimeInput(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// =====================
// Kernlogik: Shifts (Unverändert)
// =====================
function computeShifts(anchorType, anchorIndex, newTimeVal) {
  const originalTime = routines[anchorType][anchorIndex][1];
  const shift = timeToMinutes(newTimeVal) - timeToMinutes(originalTime);

  let morningShift = shift;
  let eveningShift = shift;

  let wake = timeToMinutes(routines.morning[0][1]) + morningShift;
  let sleep = timeToMinutes(routines.evening[routines.evening.length - 1][1]) + eveningShift;

  wake = (wake + 1440) % 1440;
  sleep = (sleep + 1440) % 1440;

  let currentDur = (wake - sleep + 1440) % 1440;
  const delta = sleepDurationMin - currentDur;

  if (delta !== 0) {
    if (anchorType === 'morning') {
      eveningShift -= delta;
    } else {
      morningShift += delta;
    }
  }

  return { morningShift, eveningShift, baseShift: shift };
}

// =====================
// HTML Generator (NEU: Erstellt Divs statt Text)
// =====================
function generateRoutineHTML(routine, shift) {
  let html = '';
  
  routine.forEach((item, i) => {
    const startMinutes = timeToMinutes(item[1]) + shift;
    const isSleep = item[0] === "Schlafen";
    
    let timeStr = minutesToTime(startMinutes);
    
    if (!isSleep) {
      const nextItemIndex = i + 1;
      let endMinutes;
      if (nextItemIndex < routine.length) {
        endMinutes = timeToMinutes(routine[nextItemIndex][1]) + shift;
      } else {
        endMinutes = startMinutes + 15;
      }
      timeStr = `${minutesToTime(startMinutes)} – ${minutesToTime(endMinutes)}`;
    }

    html += `
      <div class="routine-row">
        <span class="r-time">${timeStr}</span>
        <span class="r-name ${isSleep ? 'sleep-row' : ''}">${item[0]}</span>
      </div>
    `;
  });
  
  return html;
}

// =====================
// UI Updates
// =====================
function updateWakeSleepUI(morningShift, eveningShift) {
  const wakeMinutes = timeToMinutes(routines.morning[0][1]) + morningShift;
  const sleepMinutes = timeToMinutes(routines.evening[routines.evening.length - 1][1]) + eveningShift;

  wakeTimeEl.textContent = minutesToTime(wakeMinutes);
  sleepTimeEl.textContent = minutesToTime(sleepMinutes);
}

function updateRoutineText() {
  const actionValue = actionEl.value;
  const newTimeVal = timeEl.value;

  if (!newTimeVal) return;

  const [routineType, indexStr] = actionValue.split("-");
  const index = parseInt(indexStr, 10);

  const shifts = computeShifts(routineType, index, newTimeVal);
  currentShift = shifts.baseShift;
  currentMorningShift = shifts.morningShift;
  currentEveningShift = shifts.eveningShift;

  updateWakeSleepUI(currentMorningShift, currentEveningShift);

  // HTML Bauen
  let html = "";

  if (routineType === "morning") {
    html += `<div class="section-title">🌙 Gestern Abend</div>`;
    html += generateRoutineHTML(routines.evening, currentEveningShift);
    
    html += `<div class="section-title">☀️ Heute Morgen</div>`;
    html += generateRoutineHTML(routines.morning, currentMorningShift);
    
    html += `<div class="section-title">🌙 Heute Abend</div>`;
    html += generateRoutineHTML(routines.evening, currentEveningShift);
  } else {
    html += `<div class="section-title">🌙 Heute Abend</div>`;
    html += generateRoutineHTML(routines.evening, currentEveningShift);
    
    html += `<div class="section-title">☀️ Morgen Früh</div>`;
    html += generateRoutineHTML(routines.morning, currentMorningShift);
  }

  containerEl.innerHTML = html;

  // Reset Button state
  confirmBtn.classList.remove('success');
  if(confirmText) confirmText.textContent = 'Plan Übernehmen';
  successMessage.classList.remove('show');
}

// =====================
// Confirm Logic
// =====================
// =====================
// Confirm Logic (UPDATE: Speichert jetzt auch Anker und Zeit)
// =====================
function confirmRoutine() {
  const wakeMinutes = (timeToMinutes(routines.morning[0][1]) + currentMorningShift + 1440) % 1440;
  const sleepMinutes = (timeToMinutes(routines.evening[routines.evening.length - 1][1]) + currentEveningShift + 1440) % 1440;

  const wakeTime = minutesToTime(wakeMinutes);
  const sleepTime = minutesToTime(sleepMinutes);

  const scheduleData = {
    wakeTime,
    sleepTime,
    // NEU: Speichere die gewählte Einstellung
    selectedAction: actionEl.value,
    selectedTime: timeEl.value,
    sleepDurationMin,
    updatedAt: Date.now()
  };

  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(scheduleData));
  localStorage.setItem(SLEEP_KEY, String(sleepDurationMin));

  // Feedback Styling
  confirmBtn.classList.add('success');
  if(confirmText) confirmText.textContent = 'Gespeichert';
  successMessage.classList.add('show');

  setTimeout(() => {
    confirmBtn.classList.remove('success');
    if(confirmText) confirmText.textContent = 'Plan Übernehmen';
    successMessage.classList.remove('show');
  }, 2500);
}

// =====================
// Init (UPDATE: Lädt Anker und Zeit zurück in die Inputs)
// =====================
function loadSavedSettings() {
  const savedSleep = localStorage.getItem(SLEEP_KEY);
  if (savedSleep) {
    const n = parseInt(savedSleep, 10);
    if (Number.isFinite(n) && n > 0 && n < 24 * 60) sleepDurationMin = n;
  }

  sleepDurationEl.value = durationToTimeInput(sleepDurationMin);
  sleepHintEl.textContent = `Ziel: ${durationToStr(sleepDurationMin)}`;

  const savedSchedule = localStorage.getItem(SCHEDULE_KEY);
  if (savedSchedule) {
    try {
      const s = JSON.parse(savedSchedule);
      if (s.wakeTime) wakeTimeEl.textContent = s.wakeTime;
      if (s.sleepTime) sleepTimeEl.textContent = s.sleepTime;
      
      // NEU: Werte in die Inputs zurückschreiben
      if (s.selectedAction) actionEl.value = s.selectedAction;
      if (s.selectedTime) timeEl.value = s.selectedTime;
    } catch (e) {
        console.error("Fehler beim Laden:", e);
    }
  }
}

// Events
actionEl.addEventListener("change", updateRoutineText);
timeEl.addEventListener("input", updateRoutineText);
timeEl.addEventListener("change", updateRoutineText);

const updateSleep = () => {
  sleepDurationMin = parseDurationFromTimeInput(sleepDurationEl.value);
  sleepHintEl.textContent = `Ziel: ${durationToStr(sleepDurationMin)}`;
  localStorage.setItem(SLEEP_KEY, String(sleepDurationMin));
  updateRoutineText();
};
sleepDurationEl.addEventListener("input", updateSleep);
sleepDurationEl.addEventListener("change", updateSleep);

confirmBtn.addEventListener("click", confirmRoutine);

// Start
loadSavedSettings();
updateRoutineText();


// --- PULL EVERYTHING FEATURE ---
const pullBtn = document.getElementById('pullAllBtn');
const pullModal = document.getElementById('pullModal');
const pullList = document.getElementById('pullList');
const closePullBtn = document.getElementById('closePullBtn');
const confirmPullBtn = document.getElementById('confirmPullBtn');

// Temporärer Speicher für die geladenen Daten
let fetchedCloudData = null;

// 1. Modal öffnen & Daten laden
pullBtn?.addEventListener('click', async () => {
  const secret = localStorage.getItem('lifeStatsSheetsSecret');
  if (!secret) {
    alert("Bitte erst Secret Key hinterlegen (Schlüssel-Icon).");
    return;
  }

  pullModal.classList.add('open');
  pullList.innerHTML = '<div style="padding:20px; text-align:center;">Verbinde zu Google Sheets... ☁️</div>';
  confirmPullBtn.disabled = true;

  try {
    // URL anpassen falls nötig (deine Script URL)
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxRZ3gq53WZLk3223CgFZDVXDlBq4_JKPWZy56W44Gvc_GWL6bc-xM3NPo1jRIpFCenWg/exec'; 
    
    const response = await fetch(`${SCRIPT_URL}?action=getAllData&secret=${encodeURIComponent(secret)}`);
    const json = await response.json();

    if (!json.ok) throw new Error(json.error || 'Fehler beim Laden');

    fetchedCloudData = json.data;
    renderPullOptions(fetchedCloudData);
    confirmPullBtn.disabled = false;

  } catch (err) {
    pullList.innerHTML = `<div style="color:red; text-align:center;">Fehler: ${err.message}</div>`;
  }
});

// 2. Optionen anzeigen (Checkboxen)
function renderPullOptions(data) {
  let html = '';

  // Check: Life Stats
  if (data.lifeStats && Array.isArray(data.lifeStats)) {
    html += createPullItem('lifeStatsData', '📊 Life Stats', `${data.lifeStats.length} Tage gefunden`, true);
  }

  // Check: Finance Config
  if (data.financeConfig && Array.isArray(data.financeConfig)) {
    html += createPullItem('financeCategories', '💰 Finanz-Budgets', `${data.financeConfig.length} Kategorien`, true);
  }

  // Hier kannst du weitere Checks für Routinen etc. hinzufügen, 
  // sobald du sie im GAS Script (Schritt 1) definiert hast.

  if (html === '') {
    html = '<div style="text-align:center;">Keine kompatiblen Daten gefunden.</div>';
  }

  pullList.innerHTML = html;
}

function createPullItem(storageKey, title, details, checked) {
  return `
    <label class="glass-card" style="display: flex; align-items: center; gap: 15px; padding: 15px; cursor: pointer; margin:0;">
      <input type="checkbox" class="pull-checkbox" data-key="${storageKey}" ${checked ? 'checked' : ''} style="width: 20px; height: 20px;">
      <div>
        <div style="font-weight: 600;">${title}</div>
        <div style="font-size: 12px; color: #888;">${details}</div>
      </div>
    </label>
  `;
}

// 3. Überschreiben bestätigen
confirmPullBtn?.addEventListener('click', () => {
  if (!fetchedCloudData) return;

  const checkboxes = document.querySelectorAll('.pull-checkbox:checked');
  let count = 0;

  checkboxes.forEach(cb => {
    const key = cb.dataset.key;
    
    // Mapping: Welcher Key im Cloud-Objekt gehört zu welchem LocalStorage Key?
    if (key === 'lifeStatsData') {
      localStorage.setItem('lifeStatsData', JSON.stringify(fetchedCloudData.lifeStats));
    } else if (key === 'financeCategories') {
      localStorage.setItem('financeCategories', JSON.stringify(fetchedCloudData.financeConfig));
    }
    
    count++;
  });

  alert(`✅ ${count} Bereiche erfolgreich aktualisiert!`);
  pullModal.classList.remove('open');
  location.reload(); // Seite neu laden damit Änderungen sichtbar werden
});

// Schließen
closePullBtn?.addEventListener('click', () => {
  pullModal.classList.remove('open');
});

const pushBtn = document.getElementById('pushAllBtn');

pushBtn?.addEventListener('click', async () => {
    const secret = localStorage.getItem('lifeStatsSheetsSecret');
    if (!secret) return alert("Kein Secret gefunden!");

    // Bestätigung, da das Sheet überschrieben wird
    if (!confirm("Möchtest du alle lokalen Daten in die Cloud (Google Sheets) hochladen? Das überschreibt den aktuellen Stand im Sheet!")) {
        return;
    }

    // 1. Daten aus LocalStorage sammeln
    const localLifeStats = JSON.parse(localStorage.getItem('lifeStatsData') || '[]');
    const localFinance = JSON.parse(localStorage.getItem('financeCategories') || '[]');

    const payload = {
        action: 'pushAllData',
        secret: secret,
        lifeStats: localLifeStats,
        finance: localFinance
    };

    try {
        pushBtn.textContent = '⏳...';
        pushBtn.style.opacity = '0.5';

        const SCRIPT_URL = 'DEINE_APPS_SCRIPT_URL'; // Gleiche URL wie beim Pull

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const res = await response.json();
        if (res.ok) {
            alert("✅ Cloud-Backup erfolgreich erstellt!");
        } else {
            throw new Error("Server-Fehler");
        }
    } catch (err) {
        alert("❌ Fehler beim Upload: " + err.message);
    } finally {
        pushBtn.textContent = '⬆️';
        pushBtn.style.opacity = '1';
    }
});