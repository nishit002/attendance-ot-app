// Verifies the ExcelJS generation path (same lib the browser uses) end-to-end.
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const C = require('./attendance.js');

const DL = '/Users/nishitkumar/Downloads';
const readAOA = (file, sheet) => {
  const wb = XLSX.readFile(path.join(DL, file));
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header:1, defval:null, raw:false });
};
const DEFAULT_REMARKS = { 'Arvind Kumar':'Pantry','Rai Singh':'Pantry','Babita':'HK','Mazammel Haque':'HK','Sagar Chauhan':'HK','Deepak Pandey':'Security' };
const STATUS_FILL = { 'P':'FFC6EFCE','A':'FFFFC7CE','WO':'FFD9D9D9','½P':'FFFFEB9C','WOP':'FFBDD7EE','WO½P':'FFBDD7EE' };
const HEADER_FILL='FF305496', GRAND_FILL='FFFFFF00';
const THIN={style:'thin',color:{argb:'FFB0B0B0'}}, BORDER={top:THIN,left:THIN,right:THIN,bottom:THIN};
const styleHeader=c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:HEADER_FILL}};c.font={bold:true,color:{argb:'FFFFFFFF'},size:10};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.border=BORDER;};

const parsed = C.parseMonthly(readAOA('Monthly Status Report.xls','BasicWorkDurationReport'));
const summary = C.buildSummary(parsed,{otThreshHours:9,rate:50,remarks:DEFAULT_REMARKS});
const opt={otThresh:9,rate:50,dropZero:true,period:'Jun 01 2026 To Jun 30 2026'};

(async()=>{
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet('Daily Attendance');
  const nCols=3+parsed.days.length+1; ws.mergeCells(1,1,1,nCols);
  ws.getCell(1,1).value='Daily Attendance — Present/Absent by Day ('+opt.period+')'; ws.getCell(1,1).font={bold:true,size:13};
  const H=3; ws.getCell(H,1).value='S.No';ws.getCell(H,2).value='E. Code';ws.getCell(H,3).value='Name';
  parsed.days.forEach((d,k)=>ws.getCell(H,4+k).value=d.n+(d.label?'\n'+d.label:''));
  ws.getCell(H,4+parsed.days.length).value='Present Days';
  for(let c=1;c<=nCols;c++)styleHeader(ws.getCell(H,c));
  let r=H+1;
  parsed.employees.forEach((e,idx)=>{
    ws.getCell(r,1).value=idx+1;ws.getCell(r,2).value=e.code;ws.getCell(r,3).value=e.name;let worked=0;
    parsed.days.forEach((d,k)=>{const st=e.status[d.n];const cell=ws.getCell(r,4+k);cell.value=st;
      if(STATUS_FILL[st])cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:STATUS_FILL[st]}};if(e.min[d.n]>0)worked++;});
    ws.getCell(r,4+parsed.days.length).value=worked;
    for(let c=1;c<=nCols;c++)ws.getCell(r,c).border=BORDER;r++;
  });
  ws.views=[{state:'frozen',xSplit:3,ySplit:3}];
  const ws2=wb.addWorksheet('Employee Summary');
  const heads=['S. No','E. Code','Name','Remarks','Worked Days','Total Worked Hrs','Total OT Hrs (>9/day)','Per hr costing','Total Amount'];
  const HR=4;heads.forEach((h,c)=>{ws2.getCell(HR,c+1).value=h;styleHeader(ws2.getCell(HR,c+1));});
  const rows=summary.filter(row=>!(opt.dropZero&&row.totalHrs===0));let rr=HR+1,sno=1,grand=0;
  rows.forEach(row=>{grand+=row.amount;[sno,row.code,row.name,row.remarks,row.workedDays,row.totalHrs,row.otHrs,row.rate,row.amount].forEach((v,c)=>{const cc=ws2.getCell(rr,c+1);cc.value=v;cc.border=BORDER;});
    ws2.getCell(rr,9).numFmt='#,##0.00';sno++;rr++;});
  ws2.getCell(rr,8).value='Grand Total';ws2.getCell(rr,8).font={bold:true};
  const g2=ws2.getCell(rr,9);g2.value=C.round2(grand);g2.font={bold:true};g2.numFmt='#,##0.00';g2.fill={type:'pattern',pattern:'solid',fgColor:{argb:GRAND_FILL}};

  const out=path.join(__dirname,'_test_output.xlsx');
  await wb.xlsx.writeFile(out);

  // ---- read back and verify ----
  const check=new ExcelJS.Workbook(); await check.xlsx.readFile(out);
  const d1=check.getWorksheet('Daily Attendance'); const s2=check.getWorksheet('Employee Summary');
  const grandCell=s2.getCell(rr,9);
  const arvStatusCell=d1.getCell(5,4); // first day of Arvind (row5 = idx2? actually TEMP001 is row4)
  console.log('OUTPUT written:',out);
  console.log('Daily sheet dims:',d1.rowCount,'rows');
  console.log('Grand total cell value:',grandCell.value,' fill:',grandCell.fill&&grandCell.fill.fgColor&&grandCell.fill.fgColor.argb);
  // find a colored P/A cell
  let sampleFill=null,sampleVal=null;
  d1.getRow(5).eachCell(c=>{ if(c.fill&&c.fill.fgColor&&!sampleFill){sampleFill=c.fill.fgColor.argb;sampleVal=c.value;} });
  console.log('Sample daily cell value=',sampleVal,'fill=',sampleFill);
  console.log('Header fill:',d1.getCell(3,1).fill.fgColor.argb);
  console.log('EXPECT grand=13820, header FF305496, grand FFFFFF00');
})();
