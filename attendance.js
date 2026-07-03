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
    txt: txt, toMin: toMin, hhmm: hhmm, round2: round2,
    parseMonthly: parseMonthly, parseDailyTotals: parseDailyTotals, buildSummary: buildSummary
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).AttendanceCore;
