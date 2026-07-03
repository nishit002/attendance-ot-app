# Attendance & OT Sheet Generator

A zero-server web app that turns a biometric **Monthly Status Report** (`.xls`) into a
clean, **colored** Attendance + Overtime workbook — computed entirely in the browser.
Nothing is uploaded anywhere; the file never leaves your device.

## Two ways to use it
- **Web app:** 👉 **https://nishit002.github.io/attendance-ot-app/**
- **Chrome extension:** open `chrome://extensions`, turn on **Developer mode**, click
  **Load unpacked**, and select the [`extension/`](extension/) folder. Click the toolbar
  icon to open the tool in a tab. (Same code, fully offline, nothing uploaded.)

## Smart upload
The tool detects what you drop and does the right thing — no mode switch needed:

1. **Daily Attendance Report.xls** → generates a two-sheet workbook:
   a colored **monthly attendance matrix** + a **cumulative OT summary** (all employees
   consolidated into a grand total). Optionally also drop the **Monthly Status Report.xls**
   for an automatic 0-minute cross-check.
2. **A generated OT summary** (after the admin edits it — fixes someone's hours, changes a
   rate, or adds a flat manual amount like Security ₹3000) → drop it back and the tool
   **recomputes every row and the grand total**, downloading the updated cumulative file.
   Rule: `Total Amount = OT Hrs × Per-hr costing`; rows with a flat manual amount are kept as-is.

Set the two salary-linked inputs before generating: **OT threshold** (hours/day, default 9)
and **per-hour costing** (default ₹50). Optionally type a remark (Pantry/HK/Security) per person.

The generated workbook has two sheets:
   - **Daily Attendance** — every employee × each day, color-coded
     (green = Present, red = Absent, grey = Weekly Off, amber = Half day, blue = Worked-on-off).
   - **Employee Summary** — Worked Days, Total Worked Hrs, Total OT Hrs, per-hr costing,
     Total Amount, and a Grand Total.

## Accuracy — how it's kept honest
- Every figure is read straight from the report cells; nothing is estimated.
- Hours use **Tot. Dur.** (includes hours worked on weekly-offs, which the report logs
  separately in the OT column).
- The Daily parser was verified to reproduce the biometric system's own Monthly report
  **exactly** — every daily status code and every employee total match to 0 minutes,
  grand total ₹13,820 on the reference data.
- When both files are uploaded, the app reconciles them and shows a pass/fail banner.
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
