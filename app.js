/* App logic for the Attendance & OT tool (web page + Chrome extension).
   Smart upload:
     • Daily Attendance Report  -> monthly attendance matrix + cumulative OT summary
     • Monthly Status Report      -> same (alt data source / cross-check)
     • an already-generated OT summary (edited by the admin) -> recomputed / updated file
   Runs entirely client-side. */
const C = window.AttendanceCore;
let remarksMap = {};   // { employeeName: "Pantry" } — typed by the user at runtime, never hardcoded

const STATUS_FILL = { 'P':'FFC6EFCE','A':'FFFFC7CE','WO':'FFD9D9D9','½P':'FFFFEB9C','WOP':'FFBDD7EE','WO½P':'FFBDD7EE' };
const HEADER_FILL = 'FF305496', HEADER_FONT = 'FFFFFFFF', GRAND_FILL = 'FFFFFF00';
const THIN = { style:'thin', color:{argb:'FFB0B0B0'} };
const BORDER = { top:THIN,left:THIN,right:THIN,bottom:THIN };

let store = { daily:null, monthly:null, summary:null, period:null };
function primary(){ return store.daily || store.monthly; }         // attendance data source
function mode(){ return primary() ? 'generate' : (store.summary ? 'update' : 'none'); }

// ---------- element refs ----------
const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const banner = document.getElementById('banner');
const goBtn = document.getElementById('go');
const preview = document.getElementById('preview');

drop.onclick = () => fileInput.click();
['dragover','dragenter'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('hot'); }));
['dragleave','drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('hot'); }));
drop.addEventListener('drop', ev => handleFiles(ev.dataTransfer.files));
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

function readAOA(sheet){ return XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:false}); }

function detectPeriod(aoa){
  for(const row of aoa){ for(const cell of (row||[])){
    const s = C.txt(cell);
    const m = s.match(/([A-Za-z]{3}\s+\d{1,2}\s+\d{4})\s+To\s+([A-Za-z]{3}\s+\d{1,2}\s+\d{4})/);
    if(m) return m[0].replace(/\s+/g,' ');
  }}
  return null;
}

// ---------- smart upload ----------
function handleFiles(files){
  [...files].forEach(f => {
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const wb = XLSX.read(e.target.result, { type:'array' });
        const names = wb.SheetNames;
        const dailyName   = names.find(n=>/DailyAttendance/i.test(n));
        const monthlyName = names.find(n=>/BasicWorkDuration/i.test(n));
        const summaryName = names.find(n=>/Employee Summary/i.test(n));

        if (dailyName){
          const aoa = readAOA(wb.Sheets[dailyName]);
          store.daily = C.parseDaily(aoa);
          store.period = detectPeriod(aoa) || store.period;
          addChip(f.name,'daily');
        } else if (monthlyName){
          const aoa = readAOA(wb.Sheets[monthlyName]);
          store.monthly = C.parseMonthly(aoa);
          store.period = detectPeriod(aoa) || store.period;
          addChip(f.name,'monthly');
        } else if (summaryName){
          const aoa = readAOA(wb.Sheets[summaryName]);
          store.summary = C.parseSummarySheet(aoa);
          store.period = detectPeriod(aoa) || store.period;
          addChip(f.name,'summary');
        } else {
          // unknown sheet names — sniff the content: daily -> monthly -> summary
          let done=false;
          for(const nm of names){
            const aoa=readAOA(wb.Sheets[nm]);
            try{ store.daily=C.parseDaily(aoa); store.period=detectPeriod(aoa)||store.period; addChip(f.name,'daily'); done=true; break; }catch(_){}
            try{ store.monthly=C.parseMonthly(aoa); store.period=detectPeriod(aoa)||store.period; addChip(f.name,'monthly'); done=true; break; }catch(_){}
            try{ store.summary=C.parseSummarySheet(aoa); store.period=detectPeriod(aoa)||store.period; addChip(f.name,'summary'); done=true; break; }catch(_){}
          }
          if(!done){ addChip(f.name,'unknown'); showBanner('err','<b>Unrecognized file.</b> Upload the <b>Daily Attendance Report</b>, or a previously generated <b>OT summary</b> to update.'); }
        }
        refreshReady();
      }catch(err){ showBanner('err','<b>Could not read '+f.name+':</b> '+err.message); }
    };
    reader.readAsArrayBuffer(f);
  });
}

function addChip(name,type){
  const div = document.createElement('div'); div.className='file';
  const label = {monthly:'MONTHLY',daily:'DAILY',summary:'OT FILE'}[type] || '?';
  div.innerHTML = `<span class="tag ${type}">${label}</span><span class="nm">${name}</span>`;
  const rm = document.createElement('button'); rm.className='rm'; rm.textContent='×';
  rm.onclick = ()=>{ store[type]=null; div.remove(); refreshReady(); };
  div.appendChild(rm); fileList.appendChild(div);
}

function refreshReady(){
  const m = mode();
  const remarksCard = document.getElementById('remarksCard');
  if(m==='generate'){ goBtn.disabled=false; goBtn.textContent='Generate attendance + cumulative OT'; renderRemarks(); }
  else if(m==='update'){ goBtn.disabled=false; goBtn.textContent='Recompute & download updated OT'; remarksCard.style.display='none'; }
  else { goBtn.disabled=true; goBtn.textContent='Upload a file to begin'; remarksCard.style.display='none'; }
}

function renderRemarks(){
  const card=document.getElementById('remarksCard'), list=document.getElementById('remarksList');
  const workers=primary().employees.filter(e=>e.totalMin>0);
  if(!workers.length){ card.style.display='none'; return; }
  card.style.display='block'; list.innerHTML='';
  workers.forEach(e=>{
    const row=document.createElement('div'); row.className='file';
    const nm=document.createElement('span'); nm.className='nm'; nm.textContent=e.name+'  ['+e.code+']';
    const inp=document.createElement('input'); inp.type='text'; inp.placeholder='remark (optional)';
    inp.value=remarksMap[e.name]||''; inp.style.cssText='flex:0 0 200px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;font-family:inherit;font-size:14px';
    inp.oninput=()=>{ remarksMap[e.name]=inp.value.trim(); };
    row.appendChild(nm); row.appendChild(inp); list.appendChild(row);
  });
}

function showBanner(kind,html){ banner.className='banner show '+kind; banner.innerHTML=html; }

function download(wb, filename){
  return wb.xlsx.writeBuffer().then(buf=>{
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
  });
}
function stamp(){ return (store.period||'').replace(/[^A-Za-z0-9]+/g,'_') || 'output'; }

// ---------- generate / update ----------
goBtn.onclick = async () => {
  const m = mode(); if(m==='none') return;
  const label = goBtn.textContent; goBtn.disabled=true; goBtn.textContent='Building…';
  try{
    const otThresh = parseFloat(document.getElementById('otThresh').value)||0;
    const rate = parseFloat(document.getElementById('rate').value)||0;
    const dropZero = document.getElementById('dropZero').checked;

    if(m==='update'){
      // Smart update: recompute totals of an edited summary and re-emit the cumulative OT file.
      const res = C.recomputeSummary(store.summary);
      const wb = new ExcelJS.Workbook();
      buildSummarySheet(wb.addWorksheet('Employee Summary'), res.rows, res.grand, {period:store.period, updated:true, otThresh});
      await download(wb, 'Cumulative_OT_'+stamp()+'_updated.xlsx');
      showBanner('ok', `<b>✓ Updated.</b> Recomputed ${res.rows.length} rows — new cumulative OT grand total <b>₹${res.grand.toLocaleString('en-IN',{minimumFractionDigits:2})}</b>. Downloaded below.`);
      renderPreview(res.rows, res.grand);
      goBtn.disabled=false; goBtn.textContent=label; return;
    }

    // Generate path (from daily / monthly attendance data)
    const parsed = primary();
    const summary = C.buildSummary(parsed,{otThreshHours:otThresh, rate:rate, remarks:remarksMap});

    let notes=[], recon=null;
    if(store.daily && store.monthly){
      const other=(parsed===store.daily)?store.monthly:store.daily;
      const oMap={}; other.employees.forEach(e=>oMap[e.code]=e.totalMin);
      let ok=true,worst=0;
      parsed.employees.forEach(e=>{const om=oMap[e.code]||0;const d=Math.abs(e.totalMin-om);if(d>0){ok=false;worst=Math.max(worst,d);}});
      recon= ok?'ok':worst;
    }
    const zero=parsed.employees.filter(e=>e.totalMin===0);
    const byName={}; parsed.employees.forEach(e=>{(byName[e.name]=byName[e.name]||[]).push(e.code);});
    const dups=Object.entries(byName).filter(([n,cs])=>cs.length>1);
    if(zero.length) notes.push(`${zero.length} employee(s) have <b>0 hours all month</b> (${zero.map(e=>e.name+' ['+e.code+']').join(', ')}). ${dropZero?'Excluded from summary; still in the attendance matrix.':'Included as-is.'}`);
    dups.forEach(([n,cs])=> notes.push(`<b>${n}</b> appears under multiple codes: ${cs.join(', ')} — verify these aren't double-counted.`));

    let bhtml='';
    if(recon==='ok') bhtml+='<b>✓ Cross-check passed.</b> Daily and Monthly reports reconcile exactly (0-minute difference).<br>';
    else if(recon!==null) bhtml+=`<b>⚠ Cross-check:</b> largest gap ${recon} min between the two files — review before payroll.<br>`;
    bhtml+='<b>Tip:</b> edit the downloaded OT sheet if needed (fix hours, add a flat amount), then drop it back here to get the updated cumulative total.';
    if(notes.length) bhtml+='<br><b>Please review:</b><ul><li>'+notes.join('</li><li>')+'</li></ul>';
    showBanner(notes.length?'warn':'ok', bhtml);

    const summaryRows = summary.filter(row => !(dropZero && row.totalHrs===0));
    const grand = C.round2(summaryRows.reduce((s,r)=>s+(r.amount||0),0));
    const wb = await buildWorkbook(parsed, summaryRows, grand, {otThresh, rate, dropZero, period:store.period});
    await download(wb, 'Attendance_OT_'+stamp()+'.xlsx');
    renderPreview(summaryRows, grand);
  }catch(err){ showBanner('err','<b>Failed:</b> '+err.message); }
  goBtn.disabled=false; goBtn.textContent=label;
};

function styleHeader(cell){ cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:HEADER_FILL}};
  cell.font={bold:true,color:{argb:HEADER_FONT},size:10}; cell.alignment={horizontal:'center',vertical:'middle',wrapText:true}; cell.border=BORDER; }

// Shared: render the OT summary sheet (used by both generate and update paths).
// grand = sum of row.amount (so flat manual amounts are respected).
function buildSummarySheet(ws2, rows, grand, opt){
  const periodTxt = opt.period ? ' ('+opt.period+')' : '';
  ws2.mergeCells('A1:I1');
  const t2=ws2.getCell('A1'); t2.value=(opt.updated?'Cumulative OT — Updated':'Employee Monthly Summary — Total Hours & OT')+periodTxt; t2.font={bold:true,size:13};
  ws2.mergeCells('A2:I2');
  const nt=ws2.getCell('A2');
  nt.value=opt.updated
    ? 'Recomputed from your edited sheet: Total Amount = OT Hrs × Per-hr costing (rows with a flat manual amount are kept as-is).'
    : `OT = hours worked beyond ${opt.otThresh}:00/day (summed).  Total Amount = OT Hrs × Per-hr costing.`;
  nt.font={italic:true,size:9,color:{argb:'FF808080'}};
  const heads=['S. No','E. Code','Name','Remarks','Worked Days','Total Worked Hrs','Total OT Hrs','Per hr costing','Total Amount'];
  const HR=4; heads.forEach((h,c)=>{ ws2.getCell(HR,c+1).value=h; styleHeader(ws2.getCell(HR,c+1)); });
  let rr=HR+1, sno=1;
  rows.forEach(row=>{
    const vals=[sno,row.code,row.name,row.remarks||'',row.workedDays,row.totalHrs,
      (row.otHrs==null?'':row.otHrs),(row.rate==null?'':row.rate),(row.amount==null?'':row.amount)];
    vals.forEach((v,c)=>{ const cc=ws2.getCell(rr,c+1); cc.value=v; cc.border=BORDER;
      cc.alignment={horizontal:(c===2?'left':'center'),vertical:'middle'}; });
    ws2.getCell(rr,6).numFmt='0.00'; ws2.getCell(rr,7).numFmt='0.00'; ws2.getCell(rr,9).numFmt='#,##0.00';
    sno++; rr++;
  });
  const g1=ws2.getCell(rr,8); g1.value='Grand Total'; g1.font={bold:true}; g1.alignment={horizontal:'right'}; g1.border=BORDER;
  const g2=ws2.getCell(rr,9); g2.value=C.round2(grand); g2.font={bold:true}; g2.numFmt='#,##0.00';
  g2.fill={type:'pattern',pattern:'solid',fgColor:{argb:GRAND_FILL}}; g2.border=BORDER;
  const widths=[6,11,18,12,12,16,14,13,14]; widths.forEach((w,c)=> ws2.getColumn(c+1).width=w);
  ws2.views=[{state:'frozen',ySplit:4}];
}

async function buildWorkbook(parsed, summaryRows, grand, opt){
  const wb = new ExcelJS.Workbook();
  const periodTxt = opt.period ? ' ('+opt.period+')' : '';

  // ===== Sheet 1: Daily Attendance (monthly present/absent matrix) =====
  const ws = wb.addWorksheet('Daily Attendance');
  const nCols = 3 + parsed.days.length + 1;
  ws.mergeCells(1,1,1,nCols);
  const t = ws.getCell(1,1); t.value='Daily Attendance — Present/Absent by Day'+periodTxt; t.font={bold:true,size:13};
  const H=3;
  ws.getCell(H,1).value='S.No'; ws.getCell(H,2).value='E. Code'; ws.getCell(H,3).value='Name';
  parsed.days.forEach((d,k)=>{ ws.getCell(H,4+k).value=d.n+(d.label?'\n'+d.label:''); });
  ws.getCell(H,4+parsed.days.length).value='Present Days';
  for(let c=1;c<=nCols;c++) styleHeader(ws.getCell(H,c));
  let r=H+1;
  parsed.employees.forEach((e,idx)=>{
    ws.getCell(r,1).value=idx+1; ws.getCell(r,2).value=e.code; ws.getCell(r,3).value=e.name;
    let worked=0;
    parsed.days.forEach((d,k)=>{
      const st=e.status[d.n]; const cell=ws.getCell(r,4+k);
      cell.value=st; cell.alignment={horizontal:'center',vertical:'middle'};
      if(STATUS_FILL[st]) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:STATUS_FILL[st]}};
      if(e.min[d.n]>0) worked++;
    });
    ws.getCell(r,4+parsed.days.length).value=worked;
    for(let c=1;c<=nCols;c++){ const cc=ws.getCell(r,c); cc.border=BORDER;
      if(c!==3) cc.alignment=Object.assign({horizontal:'center',vertical:'middle'},cc.alignment); }
    r++;
  });
  const lr=r+1; ws.getCell(lr,3).value='Legend:'; ws.getCell(lr,3).font={bold:true};
  const legend=[['P','Present'],['A','Absent'],['WO','Weekly Off'],['½P','Half Day'],['WOP','Worked on Weekly Off'],['WO½P','Half day on Weekly Off']];
  legend.forEach(([code,desc],k)=>{ const cc=ws.getCell(lr+1+k,3); cc.value=code; cc.alignment={horizontal:'center'}; cc.border=BORDER;
    if(STATUS_FILL[code]) cc.fill={type:'pattern',pattern:'solid',fgColor:{argb:STATUS_FILL[code]}};
    ws.getCell(lr+1+k,4).value=desc; });
  ws.views=[{state:'frozen',xSplit:3,ySplit:3}];
  ws.getColumn(1).width=6; ws.getColumn(2).width=11; ws.getColumn(3).width=18;
  parsed.days.forEach((d,k)=> ws.getColumn(4+k).width=5);
  ws.getColumn(4+parsed.days.length).width=8;

  // ===== Sheet 2: Employee Summary (cumulative OT) =====
  buildSummarySheet(wb.addWorksheet('Employee Summary'), summaryRows, grand, opt);
  return wb;
}

function renderPreview(rows, grand){
  let html='<tr><th>S.No</th><th>Name</th><th>Remarks</th><th>OT Hrs</th><th>Rate</th><th>Amount ₹</th></tr>';
  rows.forEach((r,i)=>{
    html+=`<tr><td>${i+1}</td><td>${r.name||''}</td><td>${r.remarks||''}</td><td class="num">${r.otHrs==null?'':(+r.otHrs).toFixed(2)}</td><td class="num">${r.rate==null?'':r.rate}</td><td class="num">${r.amount==null?'':(+r.amount).toFixed(2)}</td></tr>`; });
  html+=`<tr><td colspan="5" style="text-align:right">Grand Total</td><td class="num">${(+grand).toFixed(2)}</td></tr>`;
  preview.innerHTML=html; preview.classList.add('show');
}
document.getElementById('ver').textContent='v2.0';
