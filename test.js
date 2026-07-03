const XLSX = require('xlsx');
const path = require('path');
const Core = require('./attendance.js');

const DL = '/Users/nishitkumar/Downloads';
function aoa(file, sheet) {
  const wb = XLSX.readFile(path.join(DL, file));
  const ws = sheet ? wb.Sheets[sheet] : wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
}

const monthly = Core.parseMonthly(aoa('Monthly Status Report.xls', 'BasicWorkDurationReport'));
const daily = Core.parseDailyTotals(aoa('Daily Attendance Report.xls', 'DailyAttendance_DetailedReport'));

const remarks = { 'Arvind Kumar': 'Pantry', 'Rai Singh': 'Pantry', 'Babita': 'HK',
  'Mazammel Haque': 'HK', 'Sagar Chauhan': 'HK', 'Deepak Pandey': 'Security' };
const rows = Core.buildSummary(monthly, { otThreshHours: 9, rate: 50, remarks });

console.log('Days parsed:', monthly.days.length, '| Employees:', monthly.employees.length);
console.log('\nReconciliation (Monthly total vs Daily Tot.Dur.):');
let allOk = true;
monthly.employees.forEach(e => {
  const dm = daily[e.code] || 0;
  const diff = e.totalMin - dm;
  if (diff !== 0) allOk = false;
  if (diff !== 0) console.log('  MISMATCH', e.code, e.name, 'diff(min)=', diff);
});
console.log(allOk ? '  ✓ All employees reconcile exactly (0 min diff)' : '  ✗ Differences found');

console.log('\nSummary (workers with hours > 0):');
let grand = 0;
rows.filter(r => r.totalHrs > 0).forEach(r => {
  grand += r.amount;
  console.log(`  ${r.name.padEnd(16)} ${r.remarks.padEnd(9)} days=${String(r.workedDays).padStart(2)} worked=${r.totalHrs.toFixed(2).padStart(7)} OT=${r.otHrs.toFixed(2).padStart(6)} amt=${r.amount.toFixed(2).padStart(8)}`);
});
console.log('  GRAND TOTAL =', grand.toFixed(2));
console.log('\nExpected from verified Python build: grand=13820.00');
