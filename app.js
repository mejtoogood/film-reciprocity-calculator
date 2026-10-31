import {BUILTINS,STOPS,corrected,validateFilm,formatTime,formatEV,nearestStop} from './core.mjs';

const $ = id=>document.getElementById(id);
const STORAGE='reciprocity-meter-state-v1';
const builtinIds = new Set(BUILTINS.map(f=>f.id));
const defaults=()=>({customFilms:[], selectedId:BUILTINS[0].id, meteredSeconds:30});
let storageAvailable=true;
let state=defaults(), activePage='calc', editingId=null, importCandidate=null;

function getFilms(){return [...BUILTINS,...state.customFilms]}
function getFilm(){return getFilms().find(f=>f.id===state.selectedId)||BUILTINS[0]}
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
        if(!f.id || builtinIds.has(f.id) || customs.some(x=>x.id===f.id)) continue;
        customs.push(f);
      } catch {}
    }
    state.customFilms=customs;
    state.selectedId=getFilms().some(f=>f.id===raw.selectedId)?raw.selectedId:BUILTINS[0].id;
    state.meteredSeconds=Number(raw.meteredSeconds)>0 && Number.isFinite(Number(raw.meteredSeconds))?Number(raw.meteredSeconds):30;
  }catch{storageAvailable=false}
}
function setStatus(message){$('configStatus').textContent=message}
function newId(){return 'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)}
function addOption(select,id,label){const option=document.createElement('option');option.value=id;option.textContent=label;select.append(option)}
function refillSelectors(){
  for(const select of [$('filmCalc'),$('filmGraph')]){
    select.replaceChildren();
    getFilms().forEach(f=>addOption(select,f.id,f.manufacturer+' '+f.name));
    select.value=state.selectedId;
  }
}
function setFilm(id){
  if(!getFilms().some(f=>f.id===id))return;
  state.selectedId=id;
  safeSave(); render();
}
function setMeter(t){
  if(!(t>0) || !Number.isFinite(t))return;
  state.meteredSeconds=t;
  safeSave();render();
}
function stepMeter(direction){
  const i=nearestStop(state.meteredSeconds);
  let target=i;
  if(direction>0) target=STOPS[i]<=state.meteredSeconds*(1+1e-8)?i+1:i;
  else target=STOPS[i]>=state.meteredSeconds*(1-1e-8)?i-1:i;
  setMeter(STOPS[Math.min(STOPS.length-1,Math.max(0,target))]);
}
function renderCalc(){
  const t=state.meteredSeconds, r=corrected(getFilm(),t);
  if(document.activeElement!==$('meterInput')) $('meterInput').value=Number(t.toPrecision(10));
  const index=nearestStop(t);
  $('tapePrev').textContent=formatTime(STOPS[Math.max(0,index-1)]);
  $('tapeCurrent').textContent=formatTime(t);
  $('tapeNext').textContent=formatTime(STOPS[Math.min(STOPS.length-1,index+1)]);
  $('correctedResult').textContent=r.ok?formatTime(r.seconds):'—';
  $('evResult').textContent=r.ok?formatEV(r.ev):'OUT OF RANGE';
  $('resultNotice').hidden=r.ok;
  $('resultNotice').textContent=r.ok?'':r.reason;
}
function textSVG(x,y,str,anchor='middle'){
 const n=document.createElementNS('http://www.w3.org/2000/svg','text');
 n.setAttribute('x',x);n.setAttribute('y',y);n.setAttribute('text-anchor',anchor);n.setAttribute('class','plot-label');n.textContent=str;return n;
}
function nodeSVG(tag,attrs={}){
 const n=document.createElementNS('http://www.w3.org/2000/svg',tag);
 Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));return n;
}
const bounds={left:45,top:12,width:278,height:218};
let graphBounds={minX:.5,maxX:3600,minY:.5,maxY:3600};
function graphDomain(f,t){
 let minX=.5,maxX=3600;
 if(f.model==='table'){minX=f.pairs[0][0];maxX=f.pairs.at(-1)[0]}
 else {
  if(f.min!=null) minX=Math.max(minX,f.min);
  if(f.max!=null) maxX=Math.min(maxX,f.max);
  if(minX>=maxX) {minX=Math.max(.001,f.t0/10);maxX=Math.max(minX*5,f.max??3600)}
 }
 if(t>0 && f.model==='power' && (!f.max || t<=f.max) && (!f.min || t>=f.min)){
   minX=Math.min(minX,t);maxX=Math.max(maxX,t);
 }
 const ys=[];
 for(let i=0;i<=100;i++){const x=Math.exp(Math.log(minX)+(Math.log(maxX)-Math.log(minX))*i/100);const r=corrected(f,x);if(r.ok) ys.push(r.seconds)}
 const minY=Math.min(minX, ...ys),maxY=Math.max(maxX, ...ys);
 return {minX,maxX,minY,maxY};
}
function renderGraph(){
 const svg=$('plot'), f=getFilm(), t=state.meteredSeconds;
 svg.replaceChildren();
 const b=graphDomain(f,t);graphBounds=b;
 const xScale=x=>bounds.left+Math.log(x/b.minX)/Math.log(b.maxX/b.minX)*bounds.width;
 const yScale=y=>bounds.top+bounds.height-Math.log(y/b.minY)/Math.log(b.maxY/b.minY)*bounds.height;
 const ticks=[.001,.01,.1,.5,1,2,5,10,30,60,120,300,600,1800,3600,7200,14400,28800,86400,172800,604800,8640000];
 const chooseTicks=(lo,hi)=>{
   const items=ticks.filter(v=>v>=lo && v<=hi);
   if(!items.length) return [lo,hi];
   const n=Math.max(1,Math.ceil(items.length/6));
   return items.filter((_,i)=>i%n===0);
 };
 for(const x of chooseTicks(b.minX,b.maxX)){
   const sx=xScale(x);svg.append(nodeSVG('line',{x1:sx,x2:sx,y1:bounds.top,y2:bounds.top+bounds.height,class:'plot-grid'}));
   svg.append(textSVG(sx,247,formatTime(x)));
 }
 for(const y of chooseTicks(b.minY,b.maxY)){
   const sy=yScale(y);svg.append(nodeSVG('line',{x1:bounds.left,x2:bounds.left+bounds.width,y1:sy,y2:sy,class:'plot-grid'}));
   svg.append(textSVG(37,sy+3,formatTime(y),'end'));
 }
 const pathFor=(points)=>{
   return points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2)).join(' ');
 };
 const diag=[];
 for(let i=0;i<=90;i++){const x=Math.exp(Math.log(b.minX)+(Math.log(b.maxX)-Math.log(b.minX))*i/90);if(x>=b.minY && x<=b.maxY)diag.push([xScale(x),yScale(x)])}
 svg.append(nodeSVG('path',{d:pathFor(diag),class:'plot-base'}));
 let curve=[],segments=[];
 for(let i=0;i<=170;i++){
   const x=Math.exp(Math.log(b.minX)+(Math.log(b.maxX)-Math.log(b.minX))*i/170),r=corrected(f,x);
   if(!r.ok){if(curve.length){segments.push(curve);curve=[]}continue}
   curve.push([xScale(x),yScale(r.seconds)]);
 }
 if(curve.length)segments.push(curve);
 segments.forEach(s=>svg.append(nodeSVG('path',{d:pathFor(s),class:'plot-curve'})));
 const cr=corrected(f,t);
 if(cr.ok && t>=b.minX && t<=b.maxX && cr.seconds>=b.minY && cr.seconds<=b.maxY){
   const x=xScale(t),y=yScale(cr.seconds);
   svg.append(nodeSVG('line',{x1:x,x2:x,y1:bounds.top,y2:bounds.top+bounds.height,stroke:'#708fa5','stroke-dasharray':'3 4'}));
   svg.append(nodeSVG('circle',{cx:x,cy:y,r:5.5,class:'plot-point'}));
 }
 svg.append(textSVG(bounds.left+bounds.width/2,264,'METERED EXPOSURE'));
 const ylabel=textSVG(12,bounds.top+bounds.height/2,'CORRECTED');
 ylabel.setAttribute('transform','rotate(-90 12 '+(bounds.top+bounds.height/2)+')');svg.append(ylabel);
}
function tableTimes(t){
 const standard=[.5,1,2,4,8,15,30,60,120,300,600,1200,1800,3600,7200,14400,28800];
 return [...new Set([...standard,t])].sort((a,b)=>a-b);
}
function renderTable(){
 const body=$('referenceBody');body.replaceChildren();
 const f=getFilm(),t=state.meteredSeconds;
 for(const x of tableTimes(t)){
   const r=corrected(f,x);
   const tr=document.createElement('tr');
   tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label','Select '+formatTime(x)+' metered exposure');
   if(Math.abs(Math.log(x/t))<1e-9)tr.classList.add('selected');
   const cells=[formatTime(x),r.ok?formatTime(r.seconds):'—',r.ok?formatEV(r.ev).replace(' EV',''):'—'];
   for(const s of cells){const td=document.createElement('td');td.textContent=s;tr.append(td)}
   tr.addEventListener('click',()=>setMeter(x));
   tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setMeter(x)}});
   body.append(tr);
 }
}
function libraryButton(text,fn,style=''){
 const b=document.createElement('button');b.type='button';b.textContent=text;
 if(style)b.className=style;b.addEventListener('click',fn);return b;
}
function renderLibrary(){
 const lib=$('filmLibrary');lib.replaceChildren();
 getFilms().forEach(f=>{
   const card=document.createElement('div');card.className='film-card'+(f.id===state.selectedId?' is-active':'');
   const name=document.createElement('strong');name.textContent=f.manufacturer+' '+f.name;card.append(name);
   const meta=document.createElement('div');meta.className='meta';
   meta.textContent='ISO '+f.iso+' · '+(f.model==='power'?'Power law (p='+f.p+')':'Tabulated curve')+' · '+(f.builtin?'Built-in':'Custom');
   card.append(meta);
   const actions=document.createElement('div');actions.className='film-card-actions';
   if(f.id!==state.selectedId)actions.append(libraryButton('Select',()=>setFilm(f.id)));
   actions.append(libraryButton('Duplicate',()=>editFilm(f,true)));
   if(!f.builtin){
     actions.append(libraryButton('Edit',()=>editFilm(f,false)));
     actions.append(libraryButton('Delete',()=>deleteFilm(f),'danger'));
   }
   card.append(actions);
   if(f.id===state.selectedId && f.builtin){
     const info=document.createElement('div');info.className='meta';info.textContent='Source: Ilford, December 2023 · threshold 1s (PAN F datasheet differs: ½s)';card.append(info);
   }
   lib.append(card);
 });
}
function deleteFilm(f){
 if(!window.confirm('Delete '+f.manufacturer+' '+f.name+'?'))return;
 state.customFilms=state.customFilms.filter(x=>x.id!==f.id);
 if(state.selectedId===f.id)state.selectedId=BUILTINS[0].id;
 safeSave();refillSelectors();render();setStatus('Film deleted.');
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
 $('fProvenance').value=f?.provenance??'personal';
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
   if(builtinIds.has(f.id))throw Error('Cannot overwrite a built-in profile');
   const oldIndex=state.customFilms.findIndex(x=>x.id===f.id);
   if(oldIndex>=0)state.customFilms[oldIndex]=f;else state.customFilms.push(f);
   state.selectedId=f.id;safeSave();
   $('editor').hidden=true;editingId=null;refillSelectors();render();
   setStatus('Film saved locally.');
 }catch(err){$('formError').textContent=err.message;$('formError').hidden=false}
}
function exportJson(){
 const data={schemaVersion:1,app:'reciprocity-meter',customFilms:state.customFilms,selectedId:state.selectedId,meteredSeconds:state.meteredSeconds};
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
   if(raw?.schemaVersion!==1 || raw.app!=='reciprocity-meter'||!Array.isArray(raw.customFilms)||raw.customFilms.length>200)
     throw Error('Unsupported backup format');
   const incoming=[], seen=new Set();
   for(const item of raw.customFilms){
     const f=validateFilm(item);
     if(!f.id || builtinIds.has(f.id) || seen.has(f.id))throw Error('Invalid or duplicate film ID');
     incoming.push(f);seen.add(f.id);
   }
   const selected=getFilms().some(x=>x.id===raw.selectedId) || incoming.some(x=>x.id===raw.selectedId)?raw.selectedId:BUILTINS[0].id;
   const meter=Number(raw.meteredSeconds);
   if(!Number.isFinite(meter)||meter<=0)throw Error('Invalid metered exposure');
   const collisions=incoming.filter(f=>state.customFilms.some(o=>o.id===f.id)).length;
   importCandidate={customFilms:incoming,selectedId:selected,meteredSeconds:meter};
   $('importSummary').textContent='Import '+incoming.length+' custom film(s), replacing the current custom library ('+state.customFilms.length+' saved). '+collisions+' matching ID(s). Current film and exposure will be restored from the backup.';
   $('importPreview').hidden=false;
 }catch(err){setStatus('Import rejected: '+err.message)}
}
function commitImport(){
 if(!importCandidate)return;
 state={...importCandidate};importCandidate=null;$('importPreview').hidden=true;
 safeSave();refillSelectors();render();setStatus('Backup imported.');
}
function render(){refillSelectors();renderCalc();renderGraph();renderTable();renderLibrary()}
function setPage(page){
 if(!['calc','graph','config'].includes(page))return;
 activePage=page;
 document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+page));
 document.querySelectorAll('.tab').forEach(el=>{
   const yes=el.dataset.page===page;el.classList.toggle('selected',yes);
   if(yes)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
 });
 if(page==='graph')renderGraph();
}
function onPlotPointer(event){
 const rect=$('plot').getBoundingClientRect();
 const x=(event.clientX-rect.left)/rect.width*340;
 const f=getFilm(),b=graphBounds;
 if(x<bounds.left-10||x>bounds.left+bounds.width+10)return;
 const ratio=Math.max(0,Math.min(1,(x-bounds.left)/bounds.width));
 const t=Math.exp(Math.log(b.minX)+ratio*Math.log(b.maxX/b.minX));
 const idx=nearestStop(t),candidate=STOPS[idx];
 const value=f.model==='table'?Math.max(b.minX,Math.min(b.maxX,candidate)):candidate;
 setMeter(value);
}
load();safeSave();
$('filmCalc').addEventListener('change',e=>setFilm(e.target.value));
$('filmGraph').addEventListener('change',e=>setFilm(e.target.value));
$('meterInput').addEventListener('input',e=>{
  const v=Number(e.target.value);
  if(e.target.value.trim()!=='' && Number.isFinite(v)&&v>0) setMeter(v);
});
$('meterInput').addEventListener('blur',()=>{if(!(Number($('meterInput').value)>0))$('meterInput').value=state.meteredSeconds});
$('prevStop').addEventListener('click',()=>stepMeter(-1));$('nextStop').addEventListener('click',()=>stepMeter(1));
let drag=null;
$('tape').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag={x:e.clientX,i:nearestStop(state.meteredSeconds),id:e.pointerId};$('tape').setPointerCapture(e.pointerId)});
$('tape').addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId)return;
 const steps=Math.trunc((drag.x-e.clientX)/27);
 if(!steps)return;
 const i=Math.max(0,Math.min(STOPS.length-1,drag.i+steps));
 if(STOPS[i]!==state.meteredSeconds)setMeter(STOPS[i]);
});
for(const evt of ['pointerup','pointercancel','lostpointercapture'])$('tape').addEventListener(evt,()=>{drag=null});
$('plot').addEventListener('pointerdown',onPlotPointer);
$('plot').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();stepMeter(e.key==='ArrowRight'?1:-1)}});
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
