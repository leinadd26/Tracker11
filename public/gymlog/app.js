// =====================
// KONFIGURATION
// =====================
const DATA_KEY = 'lifeStatsData';
const IMG_KEY = 'gymLogImages_v2'; // date -> array of dataURL strings (lokal)
const MAX_IMAGES_PER_DAY = 8;
const MAX_VIEWER_ZOOM = 2.5; // Hier kannst du den Wert jederzeit ändern
const FILTER_MONTH_KEY = 'gymLogMonthFilter_v2';
const FILTER_WORKOUT_KEY = 'gymLogWorkoutFilter_v1';

// Google Sheets Config (Read & Write)
const SHEETS_ID = '1XDOkxSB0xm8vy8J6eFRkFa4r2tRoKD8m6ArhzhkuwcY'; // Deine ID
const SHEETS_TAB_DATA = 'Daten'; 
const SHEETS_TAB_PHOTOS = 'GymPhotos';
const SHEETS_PHOTOS_RANGE = 'A2:B1000'; // A=Datum, B=URL

// Apps Script URL (für Upload)
const SHEETS_UPLOAD_URL = 'https://script.google.com/macros/s/AKfycbxRZ3gq53WZLk3223CgFZDVXDlBq4_JKPWZy56W44Gvc_GWL6bc-xM3NPo1jRIpFCenWg/exec';
const SHEETS_SECRET_STORAGE = 'lifeStatsSheetsSecret';

// =====================
// STATE
// =====================
let images = {};       // Lokale Bilder: { "YYYY-MM-DD": [dataUrl, ...] }
let sheetImages = {};  // Cloud Bilder: { "YYYY-MM-DD": [url, ...] }

// =====================
// DATA LOADING
// =====================
function loadImages() {
  try {
    const raw = JSON.parse(localStorage.getItem(IMG_KEY) || '{}') || {};
    Object.keys(raw).forEach(date => {
      if (typeof raw[date] === 'string') raw[date] = [raw[date]];
      if (!Array.isArray(raw[date])) raw[date] = [];
    });
    images = raw;
  } catch { images = {}; }
}

function saveImages() {
  localStorage.setItem(IMG_KEY, JSON.stringify(images));
}

function loadStatsData() {
  try { return JSON.parse(localStorage.getItem(DATA_KEY) || '[]') || []; }
  catch { return []; }
}

// Läd ALLE Foto-URLs aus dem Sheet "GymPhotos"
async function fetchAllSheetPhotos() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEETS_TAB_PHOTOS)}&range=${encodeURIComponent(SHEETS_PHOTOS_RANGE)}`;
  
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    // GViz JSONP fixen
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}') + 1;
    const json = JSON.parse(text.slice(jsonStart, jsonEnd));
    
    const rows = json?.table?.rows || [];
    const newSheetImages = {};

    rows.forEach(r => {
      const c = r.c || [];
      if (!c[0] || !c[1]) return;

      // Datum parsen
      let dateStr = null;
      const v = c[0]?.v;
      if (typeof v === 'string' && v.startsWith('Date(')) {
        const m = v.match(/Date\((\d+),(\d+),(\d+)\)/);
        if (m) dateStr = `${m[1]}-${String(Number(m[2])+1).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
      } else if (v) {
        const s = String(v);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) dateStr = s;
        else if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
           const p = s.split('.');
           dateStr = `${p[2]}-${p[1]}-${p[0]}`;
        }
      }

      let imgUrl = c[1]?.v;

      if (dateStr && imgUrl) {
        // Fix für Google Drive Images in <img> Tags
        if (imgUrl.includes('drive.google.com') && imgUrl.includes('id=')) {
            const idMatch = imgUrl.match(/id=([^&]+)/);
            if (idMatch) {
                // thumbnail link trick
                imgUrl = `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
            }
        }
        if (!newSheetImages[dateStr]) newSheetImages[dateStr] = [];
        newSheetImages[dateStr].push(imgUrl);
      }
    });
    
    sheetImages = newSheetImages;
    console.log("Cloud-Bilder geladen:", sheetImages);
    render(); // UI aktualisieren sobald Daten da sind
  } catch (e) {
    console.error("Fehler beim Laden der Sheet-Fotos:", e);
  }
}

// =====================
// UPLOAD LOGIC
// =====================
function getSheetsSecret() {
  let s = localStorage.getItem(SHEETS_SECRET_STORAGE);
  if (!s) {
    s = prompt('Sheets Secret eingeben (wird lokal gespeichert):');
    if (s) localStorage.setItem(SHEETS_SECRET_STORAGE, s);
  }
  return s;
}

async function uploadPhotoToSheets(date, dataUrl) {
  const secret = getSheetsSecret();
  if (!secret) throw new Error('no secret');

  // FormData für Datei-Upload
  // Wir nutzen den Parameter-Trick im Script: imageData als String
  const params = new URLSearchParams();
  params.set('secret', secret);
  params.set('action', 'uploadGymPhoto');
  params.set('date', date);
  params.set('imageData', dataUrl);

  await fetch(SHEETS_UPLOAD_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: params
  });
}

function compressImageToDataURL(file, maxWidth = 900, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// =====================
// HELPERS
// =====================
function ensureArrayForDate(date) {
  if (!images[date]) images[date] = [];
  if (typeof images[date] === 'string') images[date] = [images[date]];
  if (!Array.isArray(images[date])) images[date] = [];
}

function formatDateGerman(yyyyMMdd) {
  const [y, m, d] = yyyyMMdd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('de-DE', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
}

function weightStr(w) {
  if (w === null || w === undefined || Number.isNaN(w)) return '--';
  return `${w} kg`;
}

// Filters
function getMonthFilter() { return localStorage.getItem(FILTER_MONTH_KEY) || 'all'; }
function setMonthFilter(v) { localStorage.setItem(FILTER_MONTH_KEY, v); }
function getWorkoutFilter() { return localStorage.getItem(FILTER_WORKOUT_KEY) || 'all'; }
function setWorkoutFilter(v) { localStorage.setItem(FILTER_WORKOUT_KEY, v); }

function getGymEntriesAll() {
  const all = loadStatsData();
  return all
    .filter(e => e && e.gym === true && e.date)
    .map(e => ({
      date: e.date,
      weight: (e.weight ?? null),
      workout: (e.workout ?? '')
    }));
}

function getAvailableMonths(entries) {
  const set = new Set(entries.map(e => e.date.slice(0, 7)));
  return [...set].sort((a, b) => b.localeCompare(a));
}

function monthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const names = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  return `${names[m - 1]} ${y}`;
}

function applyFilters(entries, monthFilter, workoutFilter) {
  let out = entries;
  if (monthFilter && monthFilter !== 'all') out = out.filter(e => e.date.startsWith(monthFilter));
  if (workoutFilter && workoutFilter !== 'all') out = out.filter(e => (e.workout || '') === workoutFilter);
  return out;
}

function sortEntries(entries, monthFilter) {
  if (monthFilter === 'all') return entries.sort((a, b) => b.date.localeCompare(a.date)); // Neu -> Alt
  return entries.sort((a, b) => a.date.localeCompare(b.date)); // Alt -> Neu
}

// =====================
// VIEWER
// =====================
let zoomScale = 1;
let posX = 0;
let posY = 0;
let lastTap = 0;

function openViewerBySrc(src) {
  if (!src) return;
  let viewer = document.getElementById('imgViewer');
  
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'imgViewer';
    viewer.className = 'viewer';
    viewer.innerHTML = `
      <div class="viewer-inner">
        <button class="viewer-close" type="button">×</button>
        <img class="viewer-img" alt="Preview" draggable="false" />
      </div>
    `;
    document.body.appendChild(viewer);
  }

  const img = viewer.querySelector('.viewer-img');
  img.src = src;
  
  // Reset
  zoomScale = 1;
  posX = 0;
  posY = 0;
  
  img.onload = () => updateImageTransform();
  viewer.classList.add('open');

  function updateImageTransform() {
    const frameW = viewer.clientWidth;
    const frameH = viewer.clientHeight;
    const imgW = img.offsetWidth * zoomScale;
    const imgH = img.offsetHeight * zoomScale;

    // Grenzen berechnen
    const limitX = Math.max(0, (imgW - frameW * 0.95) / 2);
    const limitY = Math.max(0, (imgH - frameH * 0.9) / 2);

    posX = Math.max(-limitX, Math.min(limitX, posX));
    posY = Math.max(-limitY, Math.min(limitY, posY));

    img.style.transform = `translate3d(${Math.round(posX)}px, ${Math.round(posY)}px, 0) scale(${zoomScale})`;
  }

  // Doppeltipp & Schließen
  viewer.onclick = (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      if (zoomScale > 1.1) {
        zoomScale = 1; posX = 0; posY = 0;
      } else {
        zoomScale = MAX_VIEWER_ZOOM;
      }
      requestAnimationFrame(updateImageTransform);
    } else {
      if ((zoomScale <= 1.1 && e.target !== img) || e.target.classList.contains('viewer-close')) {
        viewer.classList.remove('open');
      }
    }
    lastTap = now;
  };

  // Pinch & Pan
  let lastTouchX = 0, lastTouchY = 0, initialDist = 0;
  viewer.ontouchstart = (e) => {
    if (e.touches.length === 1) {
      lastTouchX = e.touches[0].pageX; lastTouchY = e.touches[0].pageY;
    } else if (e.touches.length === 2) {
      initialDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    }
  };

  viewer.ontouchmove = (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && zoomScale > 1.05) {
      posX += e.touches[0].pageX - lastTouchX;
      posY += e.touches[0].pageY - lastTouchY;
      lastTouchX = e.touches[0].pageX; lastTouchY = e.touches[0].pageY;
      requestAnimationFrame(updateImageTransform);
    } else if (e.touches.length === 2) {
      const currentDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      zoomScale = Math.min(Math.max(1, zoomScale * (currentDist / initialDist)), MAX_VIEWER_ZOOM);
      if (zoomScale <= 1.01) { posX = 0; posY = 0; }
      initialDist = currentDist;
      requestAnimationFrame(updateImageTransform);
    }
  };
}

// =====================
// RENDER
// =====================
function renderFilterOptions(months) {
  const monthSel = document.getElementById('monthFilter');
  const workoutSel = document.getElementById('workoutFilter');
  if (!monthSel || !workoutSel) return;

  const currentMonth = getMonthFilter();
  const currentWorkout = getWorkoutFilter();

  monthSel.innerHTML = `<option value="all">Insgesamt</option>` + months.map(m =>
    `<option value="${m}">${monthLabel(m)}</option>`
  ).join('');

  if (currentMonth !== 'all' && !months.includes(currentMonth)) setMonthFilter('all');
  monthSel.value = getMonthFilter();
  workoutSel.value = currentWorkout;
}

function render() {
  loadImages(); // Lokale Bilder laden

  const list = document.getElementById('gymList');
  const empty = document.getElementById('emptyState');

  const allEntriesRaw = getGymEntriesAll();
  const months = getAvailableMonths(allEntriesRaw);
  renderFilterOptions(months);

  const monthFilter = getMonthFilter();
  const workoutFilter = getWorkoutFilter();

  const filtered = applyFilters(allEntriesRaw, monthFilter, workoutFilter);
  const entries = sortEntries(filtered, monthFilter);

  document.getElementById('countAll').textContent = allEntriesRaw.length;
  document.getElementById('countShown').textContent = entries.length;

  if (allEntriesRaw.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    empty.innerHTML = `Keine Gym-Einträge gefunden. Geh in <a href="../stats/index.html">Life Stats</a> und setze „Gym“.`;
    return;
  }

  if (entries.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    empty.innerHTML = `Keine Einträge für diesen Filter.`;
    return;
  }

  empty.style.display = 'none';

  list.innerHTML = entries.map(e => {
    ensureArrayForDate(e.date);
    
    // Daten kombinieren
    const localImgs = images[e.date] || [];
    const remoteImgs = sheetImages[e.date] || [];
    const allImgs = [...localImgs, ...remoteImgs];

    const first = allImgs[0] || ''; 

    return `
      <div class="entry" data-date="${e.date}">
        <button class="entry-head" type="button">
          <img class="thumb" alt="Foto" src="${first}" ${first ? '' : 'style="opacity:0.25"'} />
          <div class="meta">
            <div class="date">${formatDateGerman(e.date)}</div>
            <div class="sub">
              ${e.workout ? `Workout: ${e.workout} • ` : ''}Gewicht: ${weightStr(e.weight)}
              • Bilder: ${allImgs.length}
            </div>
          </div>
          <div class="chev">▼</div>
        </button>

        <div class="entry-body">
          <div class="tiles" data-date="${e.date}">
            ${
              allImgs.length
                ? allImgs.map((src, idx) => {
                    const isLocal = src.startsWith('data:');
                    // Index im lokalen Array finden für Lösch-Button
                    const localIdx = isLocal ? localImgs.indexOf(src) : -1;
                    
                    const deleteBtn = isLocal 
                        ? `<span class="tile-x" data-action="delete-one" data-index="${localIdx}">×</span>` 
                        : `<span class="tile-cloud">☁️</span>`;

                    return `
                      <button class="tile" type="button" data-action="open-any" data-src="${src}">
                        <img src="${src}" alt="Foto" loading="lazy" />
                        ${deleteBtn}
                      </button>
                    `;
                  }).join('')
                : `<div class="tiles-empty">Noch keine Bilder</div>`
            }
          </div>

          <div class="body-row">
            <div class="badge">${formatDateGerman(e.date)}</div>
            <div class="badge">${weightStr(e.weight)}</div>
          </div>

          <div class="actions">
            <label class="upload-btn">
              Aus Fotos wählen
              <input class="file-input" type="file" accept=".jpg,.jpeg,.png,.heic" multiple />
            </label>
            <button class="danger-btn" type="button" data-action="delete-all">Alle lokalen Bilder löschen</button>
          </div>

          <div class="note">
            Bilder werden lokal gespeichert und automatisch in die Cloud geladen.
          </div>
        </div>
      </div>
    `;
  }).join('');

  autoOpenFromQuery();
}

function autoOpenFromQuery() {
  const params = new URLSearchParams(location.search);
  const date = params.get('date');
  if (!date) return;

  const month = date.slice(0, 7);
  setMonthFilter(month);
  const sel = document.getElementById('monthFilter');
  if (sel) sel.value = month;

  const el = document.querySelector(`.entry[data-date="${CSS.escape(date)}"]`);
  if (!el) return;

  document.querySelectorAll('.entry.open').forEach(x => x.classList.remove('open'));
  el.classList.add('open');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });

  history.replaceState({}, '', location.pathname);
}

// =====================
// EVENTS
// =====================
function bind() {
  document.getElementById('reloadBtn').addEventListener('click', () => {
    render();
    if (navigator.vibrate) navigator.vibrate(30);
  });

  const monthSel = document.getElementById('monthFilter');
  if (monthSel) {
    monthSel.addEventListener('change', () => {
      setMonthFilter(monthSel.value);
      render();
    });
  }

  const workoutSel = document.getElementById('workoutFilter');
  if (workoutSel) {
    workoutSel.addEventListener('change', () => {
      setWorkoutFilter(workoutSel.value);
      render();
    });
  }

  // Click Delegation
  document.addEventListener('click', (e) => {
    // Accordion
    const head = e.target.closest('.entry-head');
    if (head) {
      const entry = head.closest('.entry');
      document.querySelectorAll('.entry.open').forEach(el => {
        if (el !== entry) el.classList.remove('open');
      });
      entry.classList.toggle('open');
      return;
    }

    // Alle löschen (lokal)
    const delAll = e.target.closest('button[data-action="delete-all"]');
    if (delAll) {
      const entry = delAll.closest('.entry');
      const date = entry?.dataset?.date;
      if (!date) return;
      if (confirm('Wirklich alle lokalen Bilder für diesen Tag löschen?')) {
        delete images[date];
        saveImages();
        render();
      }
      return;
    }

    // Einzelnes löschen (lokal)
    const delOne = e.target.closest('.tile-x[data-action="delete-one"]');
    if (delOne) {
      const entry = delOne.closest('.entry');
      const date = entry?.dataset?.date;
      const idx = Number(delOne.dataset.index);
      if (!date || idx < 0) return;

      ensureArrayForDate(date);
      images[date].splice(idx, 1);
      saveImages();
      render();
      return;
    }

    // Viewer öffnen (egal ob lokal oder cloud)
    const tile = e.target.closest('.tile[data-action="open-any"]');
    if (tile) {
      const src = tile.dataset.src;
      if (src) openViewerBySrc(src);
      return;
    }
  });

  // UPLOAD
  document.addEventListener('change', async (e) => {
    const input = e.target.closest('.file-input');
    if (!input) return;

    const entryEl = input.closest('.entry');
    const date = entryEl?.dataset?.date;
    const files = Array.from(input.files || []);
    if (!date || !files.length) return;

    loadImages();
    ensureArrayForDate(date);

    const freeSlots = MAX_IMAGES_PER_DAY - images[date].length;
    const toAdd = files.slice(0, Math.max(0, freeSlots));

    if (toAdd.length === 0) {
      alert(`Limit erreicht.`);
      input.value = '';
      return;
    }

    try {
      for (const f of toAdd) {
        const dataUrl = await compressImageToDataURL(f, 900, 0.75);
        
        // 1. Lokal speichern & anzeigen
        images[date].push(dataUrl);
        saveImages();
        render(); // update UI sofort

        // 2. Upload in Hintergrund
        uploadPhotoToSheets(date, dataUrl).then(() => {
            console.log("Upload success");
            // Optional: nach Erfolg neu fetchen, damit es "Cloud" Status bekommt?
            // fetchAllSheetPhotos(); 
        }).catch(err => console.error("Upload fail", err));
      }
    } catch {
      alert('Bilder konnten nicht verarbeitet werden.');
    } finally {
      input.value = '';
    }
  });
}

// =====================
// START
// =====================
render();
bind();
// Beim Start Fotos aus Sheet laden
fetchAllSheetPhotos();

