// --- KONFIGURATION ---
var SHEET_NAME_DATA = 'Daten';
var SHEET_NAME_ROUTINEN = 'Routinen';
var SECRET = 'Dzamb2604:'; // Dein Secret (ggf. anpassen falls geändert)

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// --- GET ANFRAGEN (Routing) ---
function doGet(e) {
  var p = e.parameter || {};
  var action = String(p.action || '');

  // Offene Route ohne Auth
  if (!action) return json({ ok: true, message: 'LifeStats API läuft' });

  // Auth-Check für alle Aktionen
  if (p.secret !== SECRET) return json({ ok: false, error: 'unauthorized' });

  if (action === 'getRoutines')  return handleGetRoutines(p);
  if (action === 'logRoutine')   return handleLogRoutine(p);
  if (action === 'getAllData')    return handleGetAllData(p);

  return json({ ok: false, error: 'unknown GET action: ' + action });
}

// --- ROUTINEN: ALLE DATEN LESEN ---
function handleGetRoutines(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_ROUTINEN);
  if (!sheet) return json({ ok: false, error: 'Sheet "Routinen" nicht gefunden' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return json({ ok: false, error: 'Keine Daten im Sheet' });

  var headers = data[0]; // Row 1: [empty, empty, Staubsaugen, Handtuch, ...]
  var dateStr = String(p.date || ''); // DD.MM.YYYY from frontend

  var todayRow = null;
  var todayValues = [];
  var allValues = [];

  for (var i = 1; i < data.length; i++) {
    var cellDate = data[i][0];
    var formatted = formatRoutineDate(cellDate);

    var rowData = [formatted, String(data[i][1] || '')];
    for (var j = 2; j < data[i].length; j++) {
      rowData.push(data[i][j]);
    }
    allValues.push(rowData);

    if (formatted === dateStr) {
      todayRow = i + 1; // 1-based sheet row
      todayValues = rowData;
    }
  }

  // String-ify headers for clean transport
  var cleanHeaders = [];
  for (var h = 0; h < headers.length; h++) {
    cleanHeaders.push(String(headers[h] || ''));
  }

  return json({
    ok: true,
    headers: cleanHeaders,
    values: todayValues,
    allValues: allValues,
    todayRow: todayRow
  });
}

// --- ROUTINEN: AUFGABE LOGGEN ---
function handleLogRoutine(p) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_ROUTINEN);
    if (!sheet) return json({ ok: false, error: 'Sheet "Routinen" nicht gefunden' });

    var dateStr = String(p.date || '');   // DD.MM.YYYY
    var taskName = String(p.task || '');
    var status = String(p.status || '');  // Erledigt | Offen | Neu | Entfernt

    if (!dateStr || !taskName) return json({ ok: false, error: 'date und task erforderlich' });

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Heute-Zeile finden
    var todayRowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (formatRoutineDate(data[i][0]) === dateStr) {
        todayRowIndex = i + 1; // 1-based
        break;
      }
    }
    if (todayRowIndex === -1) return json({ ok: false, error: 'Datum nicht gefunden: ' + dateStr });

    // Spalte finden
    var colIndex = -1;
    var isFixed = false;
    var taskLower = taskName.trim().toLowerCase();

    // 1) Feste Spalten C-F (Index 2-5) prüfen
    for (var c = 2; c <= 5; c++) {
      if (String(headers[c] || '').trim().toLowerCase() === taskLower) {
        colIndex = c + 1; // 1-based
        isFixed = true;
        break;
      }
    }

    // 2) Eigene Spalten G-P (Index 6-15) durchsuchen - existierender Task
    if (colIndex === -1) {
      for (var c = 6; c <= 15; c++) {
        var cellVal = String(data[todayRowIndex - 1][c] || '').trim();
        var cleanVal = cellVal.replace(' \u2705', '').replace('\u2705', '').trim();
        if (cleanVal && cleanVal.toLowerCase() === taskLower) {
          colIndex = c + 1;
          break;
        }
      }
    }

    // 3) Fuer neue/offene Tasks: erste freie Eigene-Spalte nehmen
    if (colIndex === -1 && status !== 'Entfernt') {
      for (var c = 6; c <= 15; c++) {
        var cellVal = String(data[todayRowIndex - 1][c] || '').trim();
        if (!cellVal || cellVal.match(/^Eigene\s*#\d+$/i)) {
          colIndex = c + 1;
          break;
        }
      }
    }

    // Nichts gefunden bei Entfernt = schon weg, OK
    if (colIndex === -1 && status === 'Entfernt') {
      return json({ ok: true, type: 'already_removed' });
    }

    if (colIndex === -1) return json({ ok: false, error: 'Kein Platz - alle 10 Eigene Felder belegt' });

    // Wert schreiben
    if (isFixed) {
      // Feste Spalten: TRUE/FALSE Checkbox
      var isDone = (status === 'Erledigt');
      sheet.getRange(todayRowIndex, colIndex).setValue(isDone);
    } else {
      // Eigene Spalten
      if (status === 'Erledigt') {
        sheet.getRange(todayRowIndex, colIndex).setValue(taskName.trim() + ' \u2705');
      } else if (status === 'Entfernt' || status === 'Offen') {
        // Entfernen oder Unchecken: Zelle leeren
        sheet.getRange(todayRowIndex, colIndex).setValue('');
      } else if (status === 'Neu') {
        // Neuer Task: Name ohne Checkmark schreiben
        sheet.getRange(todayRowIndex, colIndex).setValue(taskName.trim());
      }
    }

    return json({ ok: true, type: isFixed ? 'fixed' : 'custom', col: colIndex, status: status });

  } catch (err) {
    return json({ ok: false, error: 'Fehler: ' + String(err) });
  } finally {
    lock.releaseLock();
  }
}

// --- ALLE DATEN FÜR PULL (Life Stats + Finance) ---
function handleGetAllData(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = { lifeStats: [], financeConfig: [] };

  var dataSheet = ss.getSheetByName(SHEET_NAME_DATA);
  if (dataSheet && dataSheet.getLastRow() > 1) {
    var allData = dataSheet.getDataRange().getValues();
    for (var i = 1; i < allData.length; i++) {
      result.lifeStats.push({
        date: normalizeDateString(String(allData[i][0] || '')),
        screen: allData[i][1] || '',
        morning: allData[i][2] || false,
        evening: allData[i][3] || false,
        fap: allData[i][5] || false,
        gym: allData[i][6] || false,
        weight: allData[i][7] || '',
        steps: allData[i][8] || '',
        workout: allData[i][11] || ''
      });
    }
  }

  return json({ ok: true, data: result });
}

// --- HELPER: Routinen-Datum formatieren ---
// Sheets speichert Daten als Date-Objekt oder String (MM/DD/YYYY)
// Frontend erwartet DD.MM.YYYY
function formatRoutineDate(cellDate) {
  if (cellDate instanceof Date) {
    var d = cellDate.getDate();
    var m = cellDate.getMonth() + 1;
    var y = cellDate.getFullYear();
    return String(d).padStart(2, '0') + '.' + String(m).padStart(2, '0') + '.' + y;
  }
  var str = String(cellDate || '');
  // MM/DD/YYYY -> DD.MM.YYYY
  var match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return String(match[2]).padStart(2, '0') + '.' + String(match[1]).padStart(2, '0') + '.' + match[3];
  }
  // DD.MM.YYYY already? return as-is
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) return str;
  return str;
}

// --- POST ANFRAGEN ---
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); 

    var p;
    try {
      // Das hier funktioniert jetzt, weil app.js JSON.stringify sendet
      p = JSON.parse(e.postData.contents);
    } catch(err) {
      return json({ ok: false, error: "Ungültiges JSON Format" });
    }

    if (p.secret !== SECRET) return json({ ok: false, error: 'unauthorized' });

    var action = String(p.action || '');
    
    if (action === 'updateDay') {
      return handleUpdateDay(p);
    } else if (action === 'pushAllData') { // Falls du mal "Export" drückst
      return handlePushAllData(p);
    }

    return json({ ok: false, error: 'unknown action' });

  } catch (err) {
    return json({ ok: false, error: "Systemfehler: " + String(err) });
  } finally {
    lock.releaseLock();
  }
}

// --- LOGIK: UPDATE SINGLE DAY ---
function handleUpdateDay(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_DATA);
  if (!sheet) return json({ ok: false, error: "Sheet fehlt" });

  var dateStr = normalizeDateString(p.date);
  var row = findRowByDate(sheet, dateStr);
  
  // Wenn Datum nicht existiert, neue Zeile am Ende
  if (!row) {
    sheet.appendRow([dateStr]);
    row = sheet.getLastRow();
  }

  // SPALTEN-MAPPING (Passend zu deiner app.js Lese-Logik)
  // A(1)=Date, B(2)=Screen, C(3)=Morning, D(4)=Evening, F(6)=Fap, G(7)=Gym, H(8)=Weight, I(9)=Steps, L(12)=Workout
  
  setCell(sheet, row, 2, toNumberOrBlank(p.screen)); // B: Screen
  setCell(sheet, row, 3, p.morning);                 // C: Morning
  setCell(sheet, row, 4, p.evening);                 // D: Evening
  // Spalte 5 (E) wird von app.js übersprungen, wir lassen sie leer oder nutzen sie später
  setCell(sheet, row, 6, p.fap);                     // F: Fap
  setCell(sheet, row, 7, p.gym);                     // G: Gym
  setCell(sheet, row, 8, toNumberOrBlank(p.weight)); // H: Weight
  setCell(sheet, row, 9, toIntOrBlank(p.steps));     // I: Steps
  setCell(sheet, row, 12, String(p.workout || ''));  // L: Workout

  return json({ ok: true });
}

// --- LOGIK: PUSH ALL (Cloud Export) ---
function handlePushAllData(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_DATA);
  if (!sheet) return json({ ok: false, error: "Sheet fehlt" });

  // Header passend zum Layout
  var headers = ["Date", "Screen", "Morning", "Evening", "", "Fap", "Gym", "Weight", "Steps", "", "", "Workout"];
  
  sheet.clearContents();
  sheet.appendRow(headers);

  if (p.lifeStats && p.lifeStats.length > 0) {
    var rows = p.lifeStats.map(function(d) {
      // Array mit 12 Plätzen bauen
      var r = new Array(12).fill("");
      r[0] = d.date;
      r[1] = d.screen || "";
      r[2] = d.morning || false;
      r[3] = d.evening || false;
      // r[4] bleibt leer
      r[5] = d.fap || false;
      r[6] = d.gym || false;
      r[7] = d.weight || "";
      r[8] = d.steps || "";
      // r[9], r[10] leer
      r[11] = d.workout || "";
      return r;
    });
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 12).setValues(rows);
    }
  }
  return json({ ok: true, message: "Full sync done" });
}

// --- HELPERS ---

function findRowByDate(sheet, dateStr) {
  if (!sheet) return null;
  var data = sheet.getRange("A:A").getValues(); // Hole ganze Spalte A
  
  // Wichtig: Wir suchen String vs String
  for (var i = 1; i < data.length; i++) {
    var cellVal = data[i][0];
    if (!cellVal) continue;
    
    var rowDateStr = "";
    if (cellVal instanceof Date) {
      rowDateStr = Utilities.formatDate(cellVal, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      rowDateStr = normalizeDateString(String(cellVal));
    }
    
    if (rowDateStr === dateStr) return i + 1; // +1 weil Array 0-basiert, Sheet 1-basiert
  }
  return null;
}

function normalizeDateString(s) {
  if (!s) return null;
  // Wandelt 01.01.2023 in 2023-01-01 um
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    var parts = s.split('.');
    return parts[2] + '-' + parts[1] + '-' + parts[0];
  }
  // Schneidet Uhrzeit ab falls vorhanden (2023-01-01T00:00...)
  if (s.indexOf('T') > -1) return s.split('T')[0];
  return s; 
}

function toNumberOrBlank(v) { 
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(String(v).replace(',', '.')); 
  return isFinite(n) ? n : ''; 
}

function toIntOrBlank(v) { 
  if (v === '' || v === null || v === undefined) return '';
  var n = parseInt(String(v).replace(/\./g, ''), 10); 
  return isFinite(n) ? n : ''; 
}

function setCell(sheet, row, col, value) { 
  sheet.getRange(row, col).setValue(value); 
}
