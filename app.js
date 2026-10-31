import {BUILTINS,STOPS,corrected,validateFilm,formatTime,formatEV,graphRangeFor,GRAPH_RANGES,effectiveFilms,validDeletedIds,meterChoice} from './core.mjs?v=1.3.1';

const $ = id=>document.getElementById(id);
const STORAGE='reciprocity-meter-state-v1';
const builtinIds = new Set(BUILTINS.map(f=>f.id));
const METER_MAX=3600, METER_MIN=1;
const defaults=()=>({customFilms:[],deletedFilmIds:[],selectedId:BUILTINS[0].id,meteredSeconds:30,meterMode:'preset',graphRange:graphRangeFor(30)});
let storageAvailable=true;
let state=defaults(), activePage='graph', editingId=null, importCandidate=null;

function getFilms(){return effectiveFilms(BUILTINS,state.customFilms,state.deletedFilmIds)}
function getFilm(){return getFilms().find(f=>f.id===state.selectedId)||null}
function reconcileSelection(){
  const films=getFilms();
  if(!films.some(f=>f.id===state.selectedId))state.selectedId=films[0]?.id??null;
}
function safeSave(){
  try{localStorage.setItem(STORAGE,JSON.stringify(state));storageAvailable=true}
  catch{storageAvailable=false}
}
function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(!raw || !Array.isArray(raw.customFilms)) return;
    const customs=[];
    for (const entry of raw.customFilms) {
      try {
        const f=validateFilm(entry);
        if(!f.id || customs.some(x=>x.id===f.id)) continue;
        customs.push(f);
      } catch {}
    }
    state.customFilms=customs;
    state.deletedFilmIds=validDeletedIds(raw.deletedFilmIds,BUILTINS);
    state.selectedId=raw.selectedId??null;
    reconcileSelection();
    // Migrate older fractional-second readings to the new 1-second field minimum.
    const savedTime=Number(raw.meteredSeconds);
    state.meteredSeconds=Number.isFinite(savedTime)&&savedTime>0
      ? Math.max(METER_MIN,Math.min(METER_MAX,savedTime)) : 30;
    state.meterMode=meterChoice(state.meteredSeconds,raw.meterMode??'preset')==='custom'?'custom':'preset';
    // Ignore old saved view choices so the first Graph visit shows the selected time.
    state.graphRange=graphRangeFor(state.meteredSeconds);
  }catch{storageAvailable=false}
}
function setStatus(message){$('configStatus').textContent=message}
function newId(){return 'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)}
function addOption(select,id,label){const option=document.createElement('option');option.value=id;option.textContent=label;select.append(option)}
function refillSelectors(){
  for(const select of [$('filmCalc'),$('filmGraph')]){
    select.replaceChildren();
    const films=getFilms();
    if(!films.length)addOption(select,'','No films — add in Config');
    else films.forEach(f=>addOption(select,f.id,f.manufacturer+' '+f.name));
    select.value=state.selectedId??'';
    select.disabled=!films.length;
  }
}
function setFilm(id){
  if(!getFilms().some(f=>f.id===id))return;
  state.selectedId=id;
  // A changed stock should never strand the current point off the graph.
  state.graphRange=graphRangeFor(state.meteredSeconds);
  safeSave(); render();
}
function setMeter(t, mode='custom'){
  if(!getFilm())return;
  if(!Number.isFinite(t) || t<METER_MIN || t>METER_MAX)return;
  const nextMode=meterChoice(t,mode)==='custom'?'custom':'preset';
  if(state.meteredSeconds===t && state.meterMode===nextMode)return;
  state.meteredSeconds=t;
  state.meterMode=nextMode;
  if(activePage!=='graph' || t>state.graphRange)state.graphRange=graphRangeFor(t);
  safeSave();renderCalc();renderGraph();renderTable();
}
function renderCalc(){
  const film=getFilm(),t=state.meteredSeconds,r=film?corrected(film,t):null;
  if(document.activeElement!==$('meterInput')) $('meterInput').value=Number(t.toPrecision(10));
  $('meterInput').disabled=!film;
  $('meterPreset').disabled=!film;
  $('meterPreset').value=meterChoice(t,state.meterMode);
  $('correctedResult').textContent=r?.ok?formatTime(r.seconds):'—';
  $('evResult').textContent=r?.ok?formatEV(r.ev):r?'OUT OF RANGE':'';
  $('resultNotice').hidden=!!r?.ok;
  $('resultNotice').textContent=!film?'Add a film in Config':!r.ok?r.reason:'';
}
function textSVG(x,y,str,anchor='middle'){
 const n=document.createElementNS('http://www.w3.org/2000/svg','text');
 n.setAttribute('x',x);n.setAttribute('y',y);n.setAttribute('text-anchor',anchor);n.setAttribute('class','plot-label');n.textContent=str;return n;
}
function nodeSVG(tag,attrs={}){
 const n=document.createElementNS('http://www.w3.org/2000/svg',tag);
 Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));return n;
}
// Plot on LINEAR time axes. A power-law reciprocity correction is a straight
// line on log/log axes, which hid the curvature that matters in field use.
const bounds={left:54,top:34,width:284,height:190};
let graphRange=60;
let draggingPlot=null;
function axisTime(seconds){
  if(seconds<0.001) return seconds.toPrecision(1)+'s';
  if(seconds<1) return Number(seconds.toFixed(2))+'s';
  if(seconds<60) return Number(seconds.toFixed(seconds<10?1:0))+'s';
  if(seconds<3600){
    const min=Math.floor(seconds/60),rem=Math.round(seconds-min*60);
    if(rem===0)return min+'m';
    if(min===0)return rem+'s';
    return min+'m'+String(rem).padStart(2,'0')+'s';
  }
  const hours=Math.floor(seconds/3600),mins=Math.round((seconds-hours*3600)/60);
  return mins?hours+'h'+mins+'m':hours+'h';
}
// Use human-friendly, whole time increments rather than decimal steps such as 1000s.
function graphYStep(y){
 const target=Math.max(y,0.000001)/5;
 const nice=[0.05,0.1,0.2,0.25,0.5,1,2,5,10,15,20,30,60,120,300,600,900,1200,1800,3600,7200,10800,14400,21600,28800,43200,86400,172800,259200,432000,604800];
 const found=nice.find(v=>v>=target);
 if(found)return found;
 const power=Math.pow(10,Math.floor(Math.log10(target)));
 return [1,2,5,10].map(v=>v*power).find(v=>v>=target)||10*power;
}
function graphXStep(max){
 return ({1:0.25,15:5,60:15,300:60,900:300,3600:900})[max] || graphYStep(max);
}
function renderGraph(){
 const svg=$('plot'), f=getFilm(),t=state.meteredSeconds;
 graphRange=GRAPH_RANGES.includes(state.graphRange)?state.graphRange:graphRangeFor(t);
 $('graphRange').value=String(graphRange);
 svg.replaceChildren();
 if(!f){
   $('graphReadout').textContent='Add a film in Config';
   return;
 }
 const yCandidates=[graphRange];
 for(let i=0;i<=140;i++){
   const x=Math.max(METER_MIN,graphRange*i/140);
   const r=corrected(f,x);
   if(r.ok)yCandidates.push(r.seconds);
 }
 const yPeak=Math.max(...yCandidates);
 const step=graphYStep(yPeak);
 const maxY=Math.ceil(yPeak/step)*step;
 const sx=x=>bounds.left+(x/graphRange)*bounds.width;
 const sy=y=>bounds.top+bounds.height-(y/maxY)*bounds.height;
 const addLine=(x1,y1,x2,y2,style='plot-grid')=>svg.append(nodeSVG('line',{x1,y1,x2,y2,class:style}));
 // Four or five uncluttered tick labels, with a dedicated margin for y labels.
 const xStep=graphXStep(graphRange);
 for(let i=0;i<=Math.round(graphRange/xStep);i++){
   const x=i*xStep,xx=sx(x);
   addLine(xx,bounds.top,xx,bounds.top+bounds.height);
   svg.append(textSVG(xx,241,axisTime(x)));
 }
 const tickCount=Math.round(maxY/step);
 for(let i=0;i<=tickCount;i++){
   const y=i*step, yy=sy(y);
   addLine(bounds.left,yy,bounds.left+bounds.width,yy);
   svg.append(textSVG(bounds.left-10,yy+4,axisTime(y),'end'));
 }
 svg.append(textSVG(bounds.left,16,'CORRECTED','start'));
 svg.append(textSVG(bounds.left+bounds.width/2,268,'METERED EXPOSURE'));
 const sample=(fn,cls)=>{
   let segments=[],points=[];
   for(let i=0;i<=240;i++){
     const x=Math.max(METER_MIN,graphRange*i/240);
     const y=fn(x);
     if(y==null || !Number.isFinite(y) || y>maxY){
       if(points.length>1)segments.push(points);
       points=[];continue;
     }
     points.push([sx(x),sy(y)]);
   }
   if(points.length>1)segments.push(points);
   for(const segment of segments){
     svg.append(nodeSVG('path',{class:cls,d:segment.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2)).join(' ')}));
   }
 };
 sample(x=>x,'plot-base');
 sample(x=>{const r=corrected(f,x);return r.ok?r.seconds:null},'plot-curve');
 const cr=corrected(f,t);
 if(cr.ok && t<=graphRange && cr.seconds<=maxY){
   const x=sx(t),y=sy(cr.seconds);
   addLine(x,bounds.top,x,bounds.top+bounds.height,'plot-selected-line');
   svg.append(nodeSVG('circle',{cx:x,cy:y,r:5.5,class:'plot-point'}));
 }
 $('graphReadout').textContent=cr.ok
   ?axisTime(t)+' metered  →  '+axisTime(cr.seconds)+' corrected  ·  '+formatEV(cr.ev)
   :axisTime(t)+' metered  ·  NO CORRECTION DATA';
}
function onPlotPointer(event){
 const svg=$('plot');
 const rect=svg.getBoundingClientRect();
 const local=(event.clientX-rect.left)*360/rect.width;
 const ratio=Math.min(1,Math.max(0,(local-bounds.left)/bounds.width));
 let t=Math.max(METER_MIN,Math.min(METER_MAX,graphRange*ratio));
 if(t>=10)t=Math.round(t);else if(t>=1)t=Math.round(t*10)/10;
 else t=Number(t.toPrecision(2));
 t=Math.max(METER_MIN,Math.min(METER_MAX,t));
 setMeter(t);
}
function tableTimes(t){
 const standard=[1,2,4,8,15,30,60,120,300,600,900,1800,3600];
 return [...new Set([...standard,t])].sort((a,b)=>a-b);
}
function renderTable(){
 const body=$('referenceBody');body.replaceChildren();
 const f=getFilm(),t=state.meteredSeconds;
 if(!f)return;
 for(const x of tableTimes(t)){
   const r=corrected(f,x);
   const tr=document.createElement('tr');
   if(Math.abs(Math.log(x/t))<1e-9)tr.classList.add('selected');
   const cells=[formatTime(x),r.ok?formatTime(r.seconds):'—',r.ok?formatEV(r.ev).replace(' EV',''):'—'];
   for(const s of cells){const td=document.createElement('td');td.textContent=s;tr.append(td)}
   body.append(tr);
 }
}
function libraryButton(text,fn,style=''){
 const b=document.createElement('button');b.type='button';b.textContent=text;
 if(style)b.className=style;b.addEventListener('click',fn);return b;
}
function renderLibrary(){
 const lib=$('filmLibrary');lib.replaceChildren();
 if(!getFilms().length){
   const empty=document.createElement('div');
   empty.className='meta';
   empty.textContent='No films. Use Add film to create one.';
   lib.append(empty);
 }
 getFilms().forEach(f=>{
   const card=document.createElement('div');
   card.className='film-card'+(f.id===state.selectedId?' is-active':'');
   const name=document.createElement('strong');
   name.textContent=f.manufacturer+' '+f.name;
   card.append(name);
   const meta=document.createElement('div');
   meta.className='meta';
   meta.textContent='ISO '+f.iso+' · '+(f.model==='power'?'Power law (p='+f.p+')':'Tabulated curve');
   card.append(meta);
   // The source row is separate from the action bar and always precedes it.
   const source=document.createElement('div');
   source.className='film-card-source';
   const origin=document.createElement('span');
   origin.textContent='Data origin: '+(f.provenance==='manufacturer'?'Manufacturer':'User');
   source.append(origin);
   if(f.sourceUrl){
     const link=document.createElement('a');
     link.textContent='Source';
     link.href=f.sourceUrl;
     link.target='_blank';
     link.rel='noopener noreferrer';
     source.append(link);
   }
   card.append(source);

   const actions=document.createElement('div');
   actions.className='film-card-actions';
   if(f.id!==state.selectedId)actions.append(libraryButton('Select',()=>setFilm(f.id)));
   actions.append(libraryButton('Edit',()=>editFilm(f,false)));
   actions.append(libraryButton('Duplicate',()=>editFilm(f,true)));
   actions.append(libraryButton('Delete',()=>deleteFilm(f),'danger'));
   card.append(actions);
   lib.append(card);
 });
}
function deleteFilm(f){
 if(!window.confirm('Delete '+f.manufacturer+' '+f.name+'?'))return;
 state.customFilms=state.customFilms.filter(x=>x.id!==f.id);
 if(builtinIds.has(f.id) && !state.deletedFilmIds.includes(f.id))
   state.deletedFilmIds.push(f.id);
 if(editingId===f.id){$('editor').hidden=true;editingId=null}
 reconcileSelection();
 safeSave();render();setStatus('Film deleted.');
}
function editFilm(f,duplicate){
 editingId=duplicate?null:f?.id??null;
 $('editor').hidden=false;
 $('editorHeading').textContent=duplicate?'DUPLICATE FILM':editingId?'EDIT FILM':'ADD FILM';
 $('formError').hidden=true;
 $('fManufacturer').value=f?.manufacturer??'';
 $('fName').value=f?(duplicate?f.name+' copy':f.name):'';
 $('fIso').value=f?.iso??'100';
 $('fModel').value=f?.model??'power';
 $('fExponent').value=f?.p??1.33;
 $('fThreshold').value=f?.t0??1;
 $('fMin').value=f?.min??'';
 $('fMax').value=f?.max??'';
 $('fPairs').value=f?.pairs?.map(p=>p.join(',')).join('\n')??'';
 $('fProvenance').value=f?.provenance==='manufacturer'?'manufacturer':'user';
 $('fDate').value=f?.sourceDate??'';
 $('fSource').value=f?.sourceTitle??'';
 $('fUrl').value=f?.sourceUrl??'';
 $('fNotes').value=f?.notes??'';
 toggleModel();
 $('editor').scrollIntoView({block:'start',behavior:'smooth'});
}
function toggleModel(){const power=$('fModel').value==='power';$('powerFields').hidden=!power;$('tableFields').hidden=power}
function saveFilm(event){
 event.preventDefault();
 const raw={
   id:editingId||newId(),
   manufacturer:$('fManufacturer').value,name:$('fName').value,iso:$('fIso').value,
   model:$('fModel').value,p:$('fExponent').value,t0:$('fThreshold').value,
   min:$('fMin').value,max:$('fMax').value,pairs:$('fPairs').value,
   provenance:$('fProvenance').value,sourceDate:$('fDate').value,
   sourceTitle:$('fSource').value,sourceUrl:$('fUrl').value,notes:$('fNotes').value
 };
 try{
   const f=validateFilm(raw);
   const oldIndex=state.customFilms.findIndex(x=>x.id===f.id);
   if(oldIndex>=0)state.customFilms[oldIndex]=f;else state.customFilms.push(f);
   state.deletedFilmIds=state.deletedFilmIds.filter(id=>id!==f.id);
   state.selectedId=f.id;safeSave();
   $('editor').hidden=true;editingId=null;refillSelectors();render();
   setStatus('Film saved locally.');
 }catch(err){$('formError').textContent=err.message;$('formError').hidden=false}
}
function exportJson(){
 const data={schemaVersion:2,app:'reciprocity-meter',customFilms:state.customFilms,deletedFilmIds:state.deletedFilmIds,selectedId:state.selectedId,meteredSeconds:state.meteredSeconds,meterMode:state.meterMode,graphRange:state.graphRange};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const href=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=href;a.download='reciprocity-meter-backup.json';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(href),1500);
 setStatus('Backup exported.');
}
async function prepareImport(event){
 importCandidate=null;$('importPreview').hidden=true;
 const file=event.target.files?.[0];event.target.value='';
 if(!file)return;
 try{
   if(file.size>2e6)throw Error('Import file is too large');
   const raw=JSON.parse(await file.text());
   if(![1,2].includes(raw?.schemaVersion) || raw.app!=='reciprocity-meter'||!Array.isArray(raw.customFilms)||raw.customFilms.length>200)
     throw Error('Unsupported backup format');
   const incoming=[], seen=new Set();
   for(const item of raw.customFilms){
     const f=validateFilm(item);
     if(!f.id || seen.has(f.id))throw Error('Invalid or duplicate film ID');
     incoming.push(f);seen.add(f.id);
   }
   const deletedFilmIds=raw.schemaVersion===2?validDeletedIds(raw.deletedFilmIds,BUILTINS):[];
   const available=effectiveFilms(BUILTINS,incoming,deletedFilmIds);
   const selected=available.some(x=>x.id===raw.selectedId)?raw.selectedId:available[0]?.id??null;
   const meter=Number(raw.meteredSeconds);
   if(!Number.isFinite(meter)||meter<=0||meter>METER_MAX)throw Error('Invalid metered exposure');
   const collisions=incoming.filter(f=>state.customFilms.some(o=>o.id===f.id)).length;
   const restoredMeter=Math.max(1,meter);
   const meterMode=meterChoice(restoredMeter,raw.meterMode??'preset')==='custom'?'custom':'preset';
   importCandidate={customFilms:incoming,deletedFilmIds,selectedId:selected,meteredSeconds:restoredMeter,meterMode,graphRange:graphRangeFor(restoredMeter)};
   $('importSummary').textContent='Import '+incoming.length+' saved profile(s) and '+deletedFilmIds.length+' deleted supplied film(s), replacing the current library. '+collisions+' matching saved ID(s).';
   $('importPreview').hidden=false;
 }catch(err){setStatus('Import rejected: '+err.message)}
}
function commitImport(){
 if(!importCandidate)return;
 state={...defaults(),...importCandidate};importCandidate=null;$('importPreview').hidden=true;
 reconcileSelection();
 safeSave();refillSelectors();render();setStatus('Backup imported.');
}
function render(){refillSelectors();renderCalc();renderGraph();renderTable();renderLibrary()}
function setPage(page){
 if(!['calc','graph','config'].includes(page))return;
 const previousPage=activePage;
 activePage=page;
 document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+page));
 document.querySelectorAll('.tab').forEach(el=>{
   const yes=el.dataset.page===page;el.classList.toggle('selected',yes);
   if(yes)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
 });
 if(page==='graph'){
   if(previousPage!=='graph'){
     state.graphRange=graphRangeFor(state.meteredSeconds);
     safeSave();
   }
   renderGraph();
 }
}
// Populate preset list once, including a permanently available Custom option.
STOPS.forEach(t=>addOption($('meterPreset'),String(t),formatTime(t)));
addOption($('meterPreset'),'custom','Custom');
load();safeSave();
$('filmCalc').addEventListener('change',e=>setFilm(e.target.value));
$('filmGraph').addEventListener('change',e=>setFilm(e.target.value));
$('meterInput').addEventListener('input',e=>{
  const v=Number(e.target.value);
  if(e.target.value.trim()!=='' && Number.isFinite(v)&&v>=METER_MIN && v<=METER_MAX)
    setMeter(v,'custom');
});
$('meterInput').addEventListener('blur',()=>{
  if(!(Number($('meterInput').value)>=METER_MIN && Number($('meterInput').value)<=METER_MAX))
    $('meterInput').value=state.meteredSeconds;
});
$('meterPreset').addEventListener('change',e=>{
  const selection=e.target.value;
  if(selection==='custom'){
    setMeter(state.meteredSeconds,'custom');
    $('meterInput').focus();
    return;
  }
  const value=Number(selection);
  if(STOPS.includes(value))setMeter(value,'preset');
});
$('plot').addEventListener('pointerdown',e=>{
 if(!getFilm())return;
 if(e.pointerType==='mouse' && e.button!==0)return;
 draggingPlot=e.pointerId;
 $('plot').setPointerCapture(e.pointerId);
 onPlotPointer(e);
});
$('plot').addEventListener('pointermove',e=>{
 if(draggingPlot===e.pointerId)onPlotPointer(e);
});
for(const evt of ['pointerup','pointercancel','lostpointercapture'])$('plot').addEventListener(evt,e=>{
 if(draggingPlot===e.pointerId)draggingPlot=null;
});
$('graphRange').addEventListener('change',e=>{
 const next=Number(e.target.value);
 if(!GRAPH_RANGES.includes(next))return;
 state.graphRange=next;
 safeSave();renderGraph();
});
$('plot').addEventListener('keydown',e=>{
 if(!getFilm())return;
 if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
   e.preventDefault();
   const step=state.graphRange/100;
   const next=Math.min(METER_MAX,Math.max(METER_MIN,Number((state.meteredSeconds+(e.key==='ArrowRight'?step:-step)).toPrecision(5))));
   setMeter(next,'custom');
 }
});
document.querySelectorAll('.tab').forEach(el=>el.addEventListener('click',()=>setPage(el.dataset.page)));
$('addFilm').addEventListener('click',()=>editFilm(null,false));
$('cancelEdit').addEventListener('click',()=>{$('editor').hidden=true;editingId=null});
$('fModel').addEventListener('change',toggleModel);
$('filmForm').addEventListener('submit',saveFilm);
$('exportJson').addEventListener('click',exportJson);
$('importJson').addEventListener('change',prepareImport);
$('acceptImport').addEventListener('click',commitImport);
$('cancelImport').addEventListener('click',()=>{importCandidate=null;$('importPreview').hidden=true});
const block=e=>{if(e.cancelable)e.preventDefault()};
['gesturestart','gesturechange','gestureend','dblclick'].forEach(e=>document.addEventListener(e,block,{passive:false}));
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
if(!storageAvailable)setStatus('Browser storage is unavailable; export a backup to preserve edits.');
render();
