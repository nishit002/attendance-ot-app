# Attendance & OT Sheet Generator

A zero-server web app that turns a biometric **Monthly Status Report** (`.xls`) into a
clean, **colored** Attendance + Overtime workbook — computed entirely in the browser.
Nothing is uploaded anywhere; the file never leaves your device.

## Live app
👉 **https://nishit002.github.io/attendance-ot-app/**

## What it does
1. Upload the **Monthly Status Report.xls** (sheet `BasicWorkDurationReport`). Optionally
   also drop the **Daily Attendance Report.xls** to enable an automatic cross-check.
2. Set the two salary-linked inputs: **OT threshold** (hours/day, default 9) and
   **per-hour costing** (default ₹50).
3. Click generate → a two-sheet `.xlsx` downloads:
   - **Daily Attendance** — every employee × each day, color-coded
     (green = Present, red = Absent, grey = Weekly Off, amber = Half day, blue = Worked-on-off).
   - **Employee Summary** — Worked Days, Total Worked Hrs, Total OT Hrs, per-hr costing,
     Total Amount, and a Grand Total.

## Accuracy — how it's kept honest
- Every figure is read straight from the report cells; nothing is estimated.
- Daily totals in the monthly report use **Tot. Dur.** (includes hours worked on weekly-offs).
- When both files are uploaded, the app reconciles the monthly totals against the daily
  report and shows a pass/fail banner (verified to 0-minute difference on the reference data).
- It flags employees with **0 hours all month** and any **duplicate employee codes** so
  payroll can review before paying.
- **OT = Σ max(0, daily_hours − threshold)** across the month.

## Re-verify the logic yourself
```bash
npm install
node test.js        # parses the real files, prints reconciliation + summary
node gen_test.js    # builds the xlsx and reads back colors + grand total
```

## Tech
Static HTML + JS. [SheetJS](https://sheetjs.com/) reads the `.xls`,
[ExcelJS](https://github.com/exceljs/exceljs) writes the colored `.xlsx`.
Both libraries are vendored under `lib/` so the app has no runtime CDN dependency.
