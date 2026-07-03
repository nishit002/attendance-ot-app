/* Attendance + OT core logic — shared by the browser app and the Node test.
   Works on arrays-of-arrays (AOA) produced by SheetJS `sheet_to_json(ws,{header:1})`.
   No hidden assumptions: every number is traced straight from the sheet cells. */
(function (root) {
  'use strict';

  function txt(v) { return v == null ? '' : String(v).trim(); }

  // "HH:MM" or "HH:MM:SS" -> minutes (seconds ignored, matches the report totals)
  function toMin(v) {
    var s = txt(v);
    if (s.indexOf(':') === -1) return 0;
    var p = s.split(':');
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    if (isNaN(h) || isNaN(m)) return 0;
    return h * 60 + m;
  }
  function hhmm(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return h + ':' + (m < 10 ? '0' + m : m);
  }
  function round2(x) { return Math.round(x * 100) / 100; }

  // ---- Parse the Monthly Status Report (BasicWorkDurationReport sheet) ----
  function parseMonthly(aoa) {
    // 1) locate the day-header row (col0 === 'Days') and map day-number -> column
    var dayRowIdx = -1;
    for (var r = 0; r < aoa.length; r++) {
      if (txt(aoa[r] && aoa[r][0]) === 'Days') { dayRowIdx = r; break; }
    }
    if (dayRowIdx === -1) throw new Error('Could not find the "Days" header row — is this the Monthly Status Report?');
    var days = [], dayCol = {};
    var hdr = aoa[dayRowIdx];
    for (var c = 0; c < hdr.length; c++) {
      var v = txt(hdr[c]);
      if (v && /^[0-9]/.test(v)) {
        var parts = v.split(/\s+/);
        var n = parseInt(parts[0], 10);
        if (!isNaN(n)) { dayCol[n] = c; days.push({ n: n, label: parts[1] || '' }); }
      }
    }
    days.sort(function (a, b) { return a.n - b.n; });

    // 2) walk employee blocks
    var employees = [];
    for (var i = 0; i < aoa.length; i++) {
      if (txt(aoa[i] && aoa[i][0]) !== 'Emp. Code:') continue;
      var row = aoa[i];
      // code = first non-empty after 'Emp. Code:', name = first non-empty after 'Emp. Name:'
      var nameLabelIdx = -1;
      for (var k = 0; k < row.length; k++) { if (txt(row[k]) === 'Emp. Name:') { nameLabelIdx = k; break; } }
      var code = '', name = '';
      for (var a = 1; a < row.length; a++) {
        if (nameLabelIdx !== -1 && a >= nameLabelIdx) break;
        if (txt(row[a]) && txt(row[a]) !== 'Emp. Code:') { code = txt(row[a]); break; }
      }
      if (nameLabelIdx !== -1) {
        for (var b = nameLabelIdx + 1; b < row.length; b++) {
          if (txt(row[b])) { name = txt(row[b]); break; }
        }
      }
      // find Status and Total rows before the next block
      var statusRow = null, totalRow = null;
      for (var j = i + 1; j < aoa.length; j++) {
        var lbl = txt(aoa[j] && aoa[j][0]);
        if (lbl === 'Emp. Code:') break;
        if (lbl === 'Status') statusRow = aoa[j];
        if (lbl === 'Total') totalRow = aoa[j];
      }
      var st = {}, mn = {}, total = 0;
      for (var d = 0; d < days.length; d++) {
        var dn = days[d].n, col = dayCol[dn];
        var s = statusRow ? txt(statusRow[col]) : '';
        var mm = totalRow ? toMin(totalRow[col]) : 0;
        st[dn] = s; mn[dn] = mm; total += mm;
      }
      employees.push({ code: code, name: name, status: st, min: mn, totalMin: total });
    }
    if (!employees.length) throw new Error('No employee blocks found in the Monthly Status Report.');
    return { days: days, employees: employees };
  }

  // Normalize a Daily-report status string to the compact code used in the matrix
  function normStatus(s) {
    s = txt(s);
    var weekly = /weekly/i.test(s);
    var half = /½\s*present/i.test(s);
    var present = /present/i.test(s);
    if (weekly) return half ? 'WO½P' : (present ? 'WOP' : 'WO');
    return half ? '½P' : (present ? 'P' : 'A');
  }

  var MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  var WD = ['S','M','T','W','Th','F','St']; // Sun..Sat, matching the monthly report's letters
  function dayInfoFromDate(s) {
    // "01-Jun-2026" -> { n: 1, label: 'M' }
    s = txt(s);
    var m = s.match(/(\d{1,2})[-\/\s]+([A-Za-z]{3,})[-\/\s]+(\d{4})/);
    if (!m) return null;
    var day = parseInt(m[1], 10), mon = MONTHS[m[2].slice(0, 3).toLowerCase()], yr = parseInt(m[3], 10);
    var label = '';
    if (mon != null) { label = WD[new Date(Date.UTC(yr, mon, day)).getUTCDay()]; }
    return { n: day, label: label };
  }

  // ---- Parse the Daily Attendance Report into the SAME shape as parseMonthly ----
  function parseDaily(aoa) {
    // locate the detail-header columns
    var codeCol = -1, nameCol = -1, totCol = -1, statCol = -1;
    for (var r = 0; r < aoa.length; r++) {
      var row = aoa[r] || [];
      for (var c = 0; c < row.length; c++) {
        var v = txt(row[c]);
        if (v === 'E. Code') codeCol = c;
        if (v === 'Name') nameCol = c;
        if (v === 'Tot. Dur.') totCol = c;
        if (v === 'Status') statCol = c;
      }
      if (codeCol !== -1 && totCol !== -1 && statCol !== -1) break;
    }
    if (codeCol === -1 || totCol === -1 || statCol === -1)
      throw new Error('Could not find the detail header (E. Code / Tot. Dur. / Status) — is this the Daily Attendance Report?');

    var dayMap = {};              // n -> {n,label}
    var empOrder = [], byCode = {}; // code -> {code,name,status:{},min:{}}
    var curDay = null;
    for (var i = 0; i < aoa.length; i++) {
      var rw = aoa[i] || [];
      // date marker row?
      if (txt(rw[0]) === 'Attendance Date :' || /Attendance Date/i.test(txt(rw[1]))) {
        var dv = null;
        for (var k = 0; k < rw.length; k++) {
          var cell = txt(rw[k]);
          if (cell && !/Attendance Date/i.test(cell) && cell !== ':') { if (/\d/.test(cell)) { dv = cell; break; } }
        }
        var di = dv ? dayInfoFromDate(dv) : null;
        if (di) { curDay = di.n; dayMap[di.n] = di; }
        continue;
      }
      var code = txt(rw[codeCol]);
      if (!/^TEMP/i.test(code) || curDay == null) continue;
      if (!byCode[code]) { byCode[code] = { code: code, name: txt(rw[nameCol]), status: {}, min: {} }; empOrder.push(code); }
      byCode[code].status[curDay] = normStatus(rw[statCol]);
      byCode[code].min[curDay] = toMin(rw[totCol]);
    }

    var days = Object.keys(dayMap).map(function (k) { return dayMap[k]; }).sort(function (a, b) { return a.n - b.n; });
    if (!days.length) throw new Error('No attendance dates found in the Daily report.');
    var employees = empOrder.map(function (code) {
      var e = byCode[code], total = 0;
      days.forEach(function (d) { if (e.min[d.n] == null) { e.min[d.n] = 0; e.status[d.n] = e.status[d.n] || ''; } total += e.min[d.n]; });
      e.totalMin = total; return e;
    });
    return { days: days, employees: employees };
  }

  // ---- Parse the Daily Attendance Report for cross-validation (sum of Tot. Dur.) ----
  function parseDailyTotals(aoa) {
    // find the detail header row to locate the "Tot. Dur." and "E. Code" columns
    var codeCol = -1, totCol = -1;
    for (var r = 0; r < aoa.length; r++) {
      var row = aoa[r] || [];
      for (var c = 0; c < row.length; c++) {
        var v = txt(row[c]);
        if (v === 'E. Code') codeCol = c;
        if (v === 'Tot. Dur.') totCol = c;
      }
      if (codeCol !== -1 && totCol !== -1) break;
    }
    if (codeCol === -1 || totCol === -1) return null;
    var totals = {};
    for (var i = 0; i < aoa.length; i++) {
      var rr = aoa[i] || [];
      var code = txt(rr[codeCol]);
      if (/^TEMP/i.test(code)) totals[code] = (totals[code] || 0) + toMin(rr[totCol]);
    }
    return totals;
  }

  // ---- Build summary rows ----
  function buildSummary(parsed, opts) {
    var otThreshMin = opts.otThreshHours * 60;
    var rate = opts.rate;
    var remarks = opts.remarks || {};
    var rows = [];
    parsed.employees.forEach(function (e) {
      var workedDays = 0, otMin = 0;
      parsed.days.forEach(function (d) {
        var m = e.min[d.n];
        if (m > 0) workedDays++;
        if (m > otThreshMin) otMin += (m - otThreshMin);
      });
      var otHrs = round2(otMin / 60);
      var totHrs = round2(e.totalMin / 60);
      rows.push({
        code: e.code, name: e.name, remarks: remarks[e.name] || '',
        workedDays: workedDays, totalHrs: totHrs, otHrs: otHrs,
        rate: rate, amount: round2(otHrs * rate)
      });
    });
    return rows;
  }

  root.AttendanceCore = {
    txt: txt, toMin: toMin, hhmm: hhmm, round2: round2, normStatus: normStatus,
    parseMonthly: parseMonthly, parseDaily: parseDaily,
    parseDailyTotals: parseDailyTotals, buildSummary: buildSummary
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).AttendanceCore;
