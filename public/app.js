// --- INITIALISIERUNG ---
document.addEventListener('DOMContentLoaded', () => {
    updateGreeting();
    setupTodoLogic();
    setupModalLogic();
    setupSwipeToDelete();
    cleanUpOldDoneTodos();
    loadScheduledTasksOffline();
    loadLocalTodos();
    loadRoutinesFromSheets();
    updateProgress();
});

// =============================================================
//  GLOBALE VARIABLEN & KONSTANTEN
// =============================================================
const LOCAL_TODOS_KEY = 'local_todos_v2';
let fullSheetData = [];
let sheetHeaders = [];
let isUserTyping = false;

// Anchor-Samstag (bekannter Samstag fuer biweekly-Berechnung)
const ANCHOR_SATURDAY = new Date(2026, 0, 24); // 24. Jan 2026 = Samstag

// =============================================================
//  HILFSFUNKTIONEN: DATUM
// =============================================================
function getToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function getTodayKey() {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
}

function parseDateString(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return 0;
    const parts = dateStr.split('.');
    if (parts.length !== 3) return 0;
    const d = new Date(parts[2], parts[1] - 1, parts[0]);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function getMostRecentSaturday(fromDate) {
    const d = new Date(fromDate);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = d.getDay(); // 0=So, 6=Sa
    const daysSinceSat = (dayOfWeek + 1) % 7; // Sa=0, So=1, Mo=2 ...
    d.setDate(d.getDate() - daysSinceSat);
    return d;
}

// =============================================================
//  SCHEDULING: WANN ERSCHEINT WELCHE AUFGABE?
// =============================================================

/** Gibt das Trigger-Datum (Beginn der aktuellen Periode) zurueck */
function getScheduleTrigger(taskName) {
    const today = getToday();
    const name = taskName.toLowerCase().trim();

    // Staubsaugen & Handtuch: jeden Samstag
    if (name.includes('staubsaugen') || name.includes('handtuch')) {
        return getMostRecentSaturday(today);
    }
    // Bettwaesche: jeden zweiten Samstag (ab Anchor)
    if (name.includes('bettw\u00e4sche')) {
        const anchor = new Date(ANCHOR_SATURDAY);
        anchor.setHours(0, 0, 0, 0);
        const msPerDay = 86400000;
        const daysSince = Math.floor((today.getTime() - anchor.getTime()) / msPerDay);
        const period = Math.floor(daysSince / 14);
        return new Date(anchor.getTime() + period * 14 * msPerDay);
    }
    // Klinge: jeden 1. des Monats
    if (name.includes('klinge')) {
        return new Date(today.getFullYear(), today.getMonth(), 1);
    }
    return null; // Kein fester Plan (benutzerdefiniert)
}

/** Findet das letzte Erledigt-Datum einer Aufgabe im Sheet-Verlauf */
function findLastExecutionDate(taskName) {
    if (!fullSheetData || !sheetHeaders || fullSheetData.length === 0) return 0;
    const cleanName = taskName.trim().toLowerCase();
    let latestTs = 0;

    for (let row = fullSheetData.length - 1; row >= 0; row--) {
        const rowData = fullSheetData[row];
        const rowDateTs = parseDateString(rowData[0]);
        if (rowDateTs <= latestTs) continue; // Schon neueres gefunden

        // Feste Spalten (C-F = Index 2-5)
        for (let i = 2; i <= 5; i++) {
            if (sheetHeaders[i] && sheetHeaders[i].trim().toLowerCase() === cleanName) {
                if (rowData[i] === true || rowData[i] === 'TRUE' || rowData[i] === 'true') {
                    latestTs = Math.max(latestTs, rowDateTs);
                }
            }
        }
        // Eigene Spalten (G-P = Index 6-15)
        for (let i = 6; i <= 15; i++) {
            const cellContent = String(rowData[i] || '').toLowerCase();
            if (cellContent.includes(cleanName) && cellContent.includes('\u2705')) {
                latestTs = Math.max(latestTs, rowDateTs);
            }
        }
    }
    return latestTs;
}

/**
 * Soll eine geplante Aufgabe heute angezeigt werden?
 * Rueckgabe: { show: boolean, done: boolean }
 *
 * Logik:
 * - Trigger-Datum bestimmt, wann die Aufgabe faellig wird
 * - Wenn Aufgabe in dieser Periode erledigt wurde:
 *     - Heute erledigt -> zeigen (als gecheckt)
 *     - Vor heute erledigt -> verstecken (naechsten Tag verschwindet sie)
 * - Nicht erledigt -> zeigen (als offen)
 */
function shouldShowScheduledTask(taskName) {
    const trigger = getScheduleTrigger(taskName);
    if (!trigger) return { show: false, done: false };

    const today = getToday();
    if (today.getTime() < trigger.getTime()) return { show: false, done: false };

    const lastDone = findLastExecutionDate(taskName);

    if (lastDone >= trigger.getTime()) {
        // In dieser Periode erledigt
        if (lastDone === today.getTime()) {
            return { show: true, done: true }; // Heute erledigt -> zeigen
        }
        return { show: false, done: false }; // Vor heute erledigt -> weg
    }

    // Noch nicht erledigt in dieser Periode
    return { show: true, done: false };
}

// =============================================================
//  LOKALE TODO-PERSISTENZ (benutzerdefinierte Aufgaben)
// =============================================================

function getLocalTodos() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_TODOS_KEY)) || [];
    } catch { return []; }
}

function saveLocalTodos(todos) {
    localStorage.setItem(LOCAL_TODOS_KEY, JSON.stringify(todos));
}

function saveLocalTodo(text) {
    const todos = getLocalTodos();
    if (!todos.find(t => t.text === text)) {
        todos.push({ text, done: false, doneDate: null, created: getTodayKey() });
        saveLocalTodos(todos);
    }
}

function updateLocalTodoDone(text, isDone) {
    const todos = getLocalTodos();
    const todo = todos.find(t => t.text === text);
    if (todo) {
        todo.done = isDone;
        todo.doneDate = isDone ? getTodayKey() : null;
        saveLocalTodos(todos);
    }
}

function removeLocalTodo(text) {
    const todos = getLocalTodos().filter(t => t.text !== text);
    saveLocalTodos(todos);
}

/** Entferne benutzerdefinierte Todos die gestern (oder frueher) gecheckt wurden */
function cleanUpOldDoneTodos() {
    const todayKey = getTodayKey();
    const todos = getLocalTodos();
    const cleaned = todos.filter(t => {
        if (t.done && t.doneDate && t.doneDate !== todayKey) return false; // Gestern erledigt -> weg
        return true;
    });
    saveLocalTodos(cleaned);
}

function loadLocalTodos() {
    const todoList = document.getElementById('todoList');
    const inputWrapper = document.getElementById('inputWrapper');
    const todos = getLocalTodos();

    todos.forEach(t => {
        // Nicht laden wenn es ein geplanter Task ist (wird ueber Sheets/Schedule geladen)
        if (isScheduledTaskName(t.text)) return;
        addTodoItem(t.text, todoList, inputWrapper, false, t.done);
    });
    updateProgress();
}

function isScheduledTaskName(text) {
    const name = text.toLowerCase().trim();
    return name.includes('staubsaugen') || name.includes('handtuch') ||
           name.includes('bettw\u00e4sche') || name.includes('klinge');
}

// =============================================================
//  GEPLANTE TASKS OFFLINE LADEN (ohne Sheets)
// =============================================================

function loadScheduledTasksOffline() {
    const todoList = document.getElementById('todoList');
    const inputWrapper = document.getElementById('inputWrapper');
    const fixedTasks = ['Staubsaugen', 'Handtuch', 'Bettw\u00e4sche', 'Klinge'];

    fixedTasks.forEach(task => {
        const result = shouldShowScheduledTask(task);
        if (result.show) {
            addTodoItem(task, todoList, inputWrapper, true, result.done);
        }
    });
    updateProgress();
}

// =============================================================
//  PROGRESS TRACKING
// =============================================================

function updateProgress() {
    const todoList = document.getElementById('todoList');
    const items = todoList.querySelectorAll('.todo-item:not(.input-wrapper)');
    const total = items.length;
    const done = todoList.querySelectorAll('.todo-item.is-done:not(.input-wrapper)').length;
    const pending = total - done;

    const countEl = document.getElementById('todoCount');
    const doneCountEl = document.getElementById('todoDoneCount');
    const progressFill = document.getElementById('todoProgressFill');
    const progressBar = document.getElementById('todoProgressBar');
    const emptyState = document.getElementById('todoEmpty');

    if (countEl) {
        countEl.textContent = pending === 0 && total > 0
            ? 'Fertig!'
            : `${pending} ${pending === 1 ? 'Aufgabe' : 'Aufgaben'}`;
    }

    if (doneCountEl) {
        if (done > 0) {
            doneCountEl.textContent = `${done} erledigt`;
            doneCountEl.classList.add('visible');
        } else {
            doneCountEl.classList.remove('visible');
        }
    }

    if (progressFill && progressBar) {
        if (total > 0) {
            const pct = (done / total) * 100;
            progressFill.style.width = pct + '%';
            progressBar.style.opacity = '1';
            progressFill.classList.toggle('all-done', pct >= 100);
        } else {
            progressFill.style.width = '0%';
            progressBar.style.opacity = '0.3';
            progressFill.classList.remove('all-done');
        }
    }

    if (emptyState) {
        if (total === 0 || (pending === 0 && total > 0)) {
            emptyState.classList.add('visible');
            emptyState.querySelector('.todo-empty-text').textContent =
                total === 0 ? 'Keine Aufgaben' : 'Alles erledigt!';
            emptyState.querySelector('.todo-empty-icon').innerHTML =
                total === 0 ? '+' : '&#10003;';
            emptyState.querySelector('.todo-empty-icon').style.background =
                total === 0 ? '#8E8E93' : '#34C759';
        } else {
            emptyState.classList.remove('visible');
        }
    }

    updateBtnVisibilityGlobal();
}

// =============================================================
//  UI KOMPONENTEN
// =============================================================

function setupTodoLogic() {
    const todoInput = document.getElementById('newTodoInput');
    const todoList = document.getElementById('todoList');
    const inputWrapper = document.getElementById('inputWrapper');

    if (todoInput) {
        todoInput.addEventListener('focus', () => { isUserTyping = true; });
        todoInput.addEventListener('blur', () => { isUserTyping = false; });
        todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && todoInput.value.trim() !== '') {
                const text = todoInput.value.trim();
                addTodoItem(text, todoList, inputWrapper, false, false, true);
                saveLocalTodo(text);
                syncToGoogleSheets(text, 'add');
                todoInput.value = '';
                updateProgress();
            }
        });
    }

    // Checkbox-Klicks
    todoList.addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
            const item = e.target.closest('.todo-item');
            if (!item || item.classList.contains('input-wrapper')) return;
            const text = item.querySelector('.todo-text').textContent;
            const isDone = e.target.checked;
            item.classList.toggle('is-done', isDone);

            const isRoutine = item.dataset.routine === 'true';
            if (!isRoutine) {
                updateLocalTodoDone(text, isDone);
            }

            syncToGoogleSheets(text, isDone ? 'done' : 'undone');

            // Erledigte nach unten sortieren
            if (isDone) {
                setTimeout(() => {
                    const inputW = document.getElementById('inputWrapper');
                    const allItems = Array.from(todoList.querySelectorAll('.todo-item:not(.input-wrapper)'));
                    const pendingItems = allItems.filter(i => !i.classList.contains('is-done'));
                    const doneItems = allItems.filter(i => i.classList.contains('is-done'));
                    pendingItems.forEach(i => todoList.insertBefore(i, inputW));
                    doneItems.forEach(i => todoList.insertBefore(i, inputW));
                    todoList.appendChild(inputW);
                }, 300);
            }

            updateProgress();
        }
    });

    // Toggle-Button
    const toggleBtn = document.getElementById('toggleDoneBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isHiding = todoList.classList.toggle('hide-done');
            toggleBtn.classList.toggle('hiding-done', isHiding);
            updateProgress();
        });
    }
}

function updateBtnVisibilityGlobal() {
    const todoList = document.getElementById('todoList');
    const toggleBtn = document.getElementById('toggleDoneBtn');
    if (!toggleBtn || !todoList) return;
    const hasDone = todoList.querySelector('.todo-item.is-done:not(.input-wrapper)');
    toggleBtn.classList.toggle('visible', !!hasDone);
}

function addTodoItem(text, list, wrapper, isRoutine = false, startChecked = false, animate = false) {
    // Duplikat-Check
    const existing = Array.from(list.querySelectorAll('.todo-text')).find(el => el.textContent === text);
    if (existing) {
        const item = existing.closest('.todo-item');
        const cb = item.querySelector('input');
        if (cb.checked !== startChecked) {
            cb.checked = startChecked;
            item.classList.toggle('is-done', startChecked);
        }
        return;
    }

    const label = document.createElement('label');
    label.className = 'todo-item';
    if (startChecked) label.classList.add('is-done');
    if (isRoutine) label.setAttribute('data-routine', 'true');

    label.innerHTML = `
        <div class="delete-bg">Entfernen</div>
        <input type="checkbox" ${startChecked ? 'checked' : ''}>
        <span class="checkmark"></span>
        <span class="todo-text">${text}</span>
    `;

    if (animate) {
        label.style.opacity = '0';
        label.style.transform = 'translateY(-8px)';
    }

    // Offene vor erledigte, alle vor input-wrapper
    if (startChecked) {
        list.insertBefore(label, wrapper);
    } else {
        const firstDone = list.querySelector('.todo-item.is-done:not(.input-wrapper)');
        if (firstDone) {
            list.insertBefore(label, firstDone);
        } else {
            list.insertBefore(label, wrapper);
        }
    }

    if (animate) {
        requestAnimationFrame(() => {
            label.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            label.style.opacity = '1';
            label.style.transform = 'translateY(0)';
        });
    }
}

// =============================================================
//  SWIPE TO DELETE
// =============================================================

function setupSwipeToDelete() {
    const todoList = document.getElementById('todoList');
    let startX = 0;
    let currentItem = null;

    todoList.addEventListener('touchstart', (e) => {
        const item = e.target.closest('.todo-item:not(.input-wrapper)');
        if (!item) return;
        startX = e.touches[0].clientX;
        currentItem = item;
    }, { passive: true });

    todoList.addEventListener('touchmove', (e) => {
        if (!currentItem) return;
        const deltaX = e.touches[0].clientX - startX;
        if (deltaX < -15) {
            const offset = Math.max(deltaX, -100);
            currentItem.style.transform = `translateX(${offset}px)`;
            currentItem.style.transition = 'none';
            currentItem.classList.toggle('swiping', deltaX < -40);
        }
    }, { passive: true });

    todoList.addEventListener('touchend', () => {
        if (!currentItem) return;
        const item = currentItem;
        const isSwiped = item.classList.contains('swiping');

        if (isSwiped) {
            item.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
            item.style.transform = 'translateX(-120%)';
            item.style.opacity = '0';
            setTimeout(() => {
                const text = item.querySelector('.todo-text')?.textContent;
                if (text) {
                    removeLocalTodo(text);
                    syncToGoogleSheets(text, 'remove');
                }
                item.remove();
                updateProgress();
            }, 250);
        } else {
            item.style.transition = 'transform 0.2s ease';
            item.style.transform = 'translateX(0)';
            item.classList.remove('swiping');
        }

        currentItem = null;
    }, { passive: true });
}

// =============================================================
//  DATEN-SYNC MIT GOOGLE SHEETS
// =============================================================

async function loadRoutinesFromSheets() {
    if (isUserTyping) return;
    const scriptURL = localStorage.getItem('lifeStatsSheetsSecret');
    if (!scriptURL) return;

    try {
        const url = `${scriptURL}?action=getRoutines&secret=Dzamb2604:&date=${getTodayKey()}&t=${Date.now()}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.ok) {
            fullSheetData = data.allValues || [];
            sheetHeaders = data.headers || [];
            applyRoutineData(data.values, data.headers);
        }
    } catch (e) {
        console.error('Sync-Fehler:', e);
    }
}

function applyRoutineData(values, headers) {
    const todoList = document.getElementById('todoList');
    const inputWrapper = document.getElementById('inputWrapper');
    if (!todoList || !inputWrapper) return;

    // Bestehende Routine-Items entfernen (werden neu aufgebaut)
    todoList.querySelectorAll('.todo-item[data-routine="true"]').forEach(item => item.remove());

    // 1) Geplante Aufgaben (C-F = Index 2-5: Staubsaugen, Handtuch, Bettwaesche, Klinge)
    for (let i = 2; i <= 5; i++) {
        const taskName = (headers[i] || '').trim();
        if (!taskName) continue;
        const result = shouldShowScheduledTask(taskName);
        if (result.show) {
            addTodoItem(taskName, todoList, inputWrapper, true, result.done);
        }
    }

    // 2) Eigene Tasks aus Sheets (G-P = Index 6-15) - nur heutige Zeile
    if (values && values.length > 0) {
        for (let i = 6; i <= 15; i++) {
            const cellContent = String(values[i] || '').trim();
            if (!cellContent || /^Eigene\s*#\d+$/i.test(cellContent)) continue;
            const isDone = cellContent.includes('\u2705');
            const taskName = cellContent.replace(/\s*\u2705/g, '').trim();
            if (taskName) {
                addTodoItem(taskName, todoList, inputWrapper, true, isDone);
            }
        }
    }

    updateProgress();
}

/**
 * Sync eine Aufgabe an Google Sheets.
 * action: 'add' | 'done' | 'undone' | 'remove'
 */
async function syncToGoogleSheets(taskName, action) {
    const scriptURL = localStorage.getItem('lifeStatsSheetsSecret');
    if (!scriptURL) return;

    // Status-Mapping fuer Apps Script
    let status = 'Offen';
    if (action === 'done') status = 'Erledigt';
    else if (action === 'undone') status = 'Offen';
    else if (action === 'remove') status = 'Entfernt';
    else if (action === 'add') status = 'Neu';

    const params = new URLSearchParams({
        action: 'logRoutine',
        secret: 'Dzamb2604:',
        date: getTodayKey(),
        task: taskName,
        status: status,
        t: Date.now()
    });

    try {
        const res = await fetch(`${scriptURL}?${params.toString()}`);
        const data = await res.json();
        if (data && data.ok) {
            // Nach erfolgreichem Sync die Daten aktualisieren
            setTimeout(loadRoutinesFromSheets, 500);
        }
    } catch (err) {
        console.warn('Sync Fehler:', err);
    }
}

// =============================================================
//  GREETING, MODAL & AUTO-REFRESH
// =============================================================

function updateGreeting() {
    const hour = new Date().getHours();
    const greetingEl = document.getElementById('greeting');
    const body = document.body;

    body.classList.remove('time-morning', 'time-day', 'time-evening', 'time-night');

    if (hour >= 5 && hour < 12) {
        if (greetingEl) greetingEl.textContent = 'Guten Morgen';
        body.classList.add('time-morning');
    } else if (hour >= 12 && hour < 18) {
        if (greetingEl) greetingEl.textContent = 'Guten Tag';
        body.classList.add('time-day');
    } else if (hour >= 18 && hour < 22) {
        if (greetingEl) greetingEl.textContent = 'Guten Abend';
        body.classList.add('time-evening');
    } else {
        if (greetingEl) greetingEl.textContent = 'Gute Nacht';
        body.classList.add('time-night');
    }
}

function setupModalLogic() {
    const modal = document.getElementById('secretModal');
    const input = document.getElementById('secretInput');
    const btnOpen = document.getElementById('secretBtn');

    btnOpen?.addEventListener('click', () => {
        input.value = localStorage.getItem('lifeStatsSheetsSecret') || '';
        modal.classList.add('open');
    });

    document.getElementById('saveSecretBtn')?.addEventListener('click', () => {
        localStorage.setItem('lifeStatsSheetsSecret', input.value.trim());
        modal.classList.remove('open');
        loadRoutinesFromSheets();
    });

    document.getElementById('closeSecretBtn')?.addEventListener('click', () => {
        modal.classList.remove('open');
    });

    document.getElementById('deleteSecretBtn')?.addEventListener('click', () => {
        localStorage.removeItem('lifeStatsSheetsSecret');
        modal.classList.remove('open');
    });
}

// Auto-Sync alle 15 Sekunden
setInterval(loadRoutinesFromSheets, 15000);

// Refresh-Button
document.getElementById('refreshBtn')?.addEventListener('click', function () {
    this.style.transition = 'transform 0.5s ease';
    this.style.transform = 'rotate(360deg)';
    loadRoutinesFromSheets();
    setTimeout(() => { this.style.transform = 'rotate(0deg)'; }, 500);
});
