export const BUILTINS = Object.freeze([{
  id: 'ilford-pan-f-plus-50', manufacturer: 'Ilford', name: 'PAN F Plus 50',
  iso: 50, model: 'power', p: 1.33, t0: 1, min: null, max: null,
  provenance: 'manufacturer', sourceTitle: 'Film Reciprocity Failure Compensation',
  sourceUrl: 'https://www.ilfordphoto.com/amfile/file/download/file/1964/product/2246/',
  sourceDate: '2023-12',
  notes: '2023 general sheet: no correction at 1 s or less; PAN F Plus datasheet specifies a 1/2 s threshold. The 2023 sheet is used here.',
  builtin: true
}]);

export function positive(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0; }
export function interpolate(profile, t) {
  const pairs = profile.pairs;
  if (t < pairs[0][0] || t > pairs[pairs.length-1][0]) return null;
  for (let i=0; i<pairs.length; i++) if (Math.abs(t-pairs[i][0]) < 1e-10*pairs[i][0]) return pairs[i][1];
  for (let i=1; i<pairs.length; i++) {
    const [x0,y0]=pairs[i-1], [x1,y1]=pairs[i];
    if (t <= x1) {
      const a = (Math.log(t)-Math.log(x0))/(Math.log(x1)-Math.log(x0));
      return Math.exp(Math.log(y0) + a*(Math.log(y1)-Math.log(y0)));
    }
  }
  return null;
}
export function corrected(profile, t) {
  if (!positive(t) || !profile) return {ok:false, reason:'Invalid exposure'};
  if (profile.model === 'power') {
    if (t <= profile.t0) return {ok:true, seconds:t, ev:0};
    if ((profile.min != null && t < profile.min) || (profile.max != null && t > profile.max))
      return {ok:false,reason:'Outside specified data range'};
    const seconds = Math.pow(t, profile.p);
    if (!positive(seconds)) return {ok:false,reason:'Exposure exceeds numeric range'};
    return {ok:true, seconds, ev:Math.log2(seconds/t)};
  }
  if (profile.model === 'table') {
    const seconds = interpolate(profile,t);
    return seconds == null ? {ok:false,reason:'Outside supplied data range'} :
      {ok:true, seconds, ev:Math.log2(seconds/t)};
  }
  return {ok:false, reason:'Unknown model'};
}
export function formatTime(t) {
  if (!positive(t)) return '—';
  if (t < 1) { const inv = 1/t; if (Math.abs(inv-Math.round(inv)) < 0.03 && inv < 20000) return '1/'+Math.round(inv)+'s'; return Number(t.toPrecision(3))+'s'; }
  const total = Math.round(t);
  if (total < 60) return total+'s';
  const h = Math.floor(total/3600), m=Math.floor((total%3600)/60), s=total%60;
  if (h) return h+'h '+String(m).padStart(2,'0')+'m '+String(s).padStart(2,'0')+'s';
  return m+'m '+String(s).padStart(2,'0')+'s';
}
export function formatEV(ev) { return (ev >= 0 ? '+' : '') + ev.toFixed(2) + ' EV'; }
export function parsePairs(text) {
  const lines=String(text).trim().split(/\r?\n/).filter(s=>s.trim() && !s.trim().startsWith('#'));
  return lines.map((line,i)=>{
    const bits=line.trim().split(/[,;\s]+/).filter(Boolean);
    if(bits.length !== 2 || !bits.every(s=>s.trim() && Number.isFinite(Number(s))))
      throw Error('Invalid data pair on line '+(i+1));
    return bits.map(Number);
  });
}
export function validateFilm(raw) {
  if (!raw || typeof raw!=='object') throw Error('Invalid film profile');
  const manufacturer=String(raw.manufacturer??'').trim().slice(0,90);
  const name=String(raw.name??'').trim().slice(0,120);
  const iso=Number(raw.iso);
  if(!manufacturer || !name || !positive(iso) || iso>100000) throw Error('Manufacturer, stock and valid ISO are required');
  const model=raw.model;
  if(model!=='power' && model!=='table') throw Error('Choose a correction model');
  const obj={
    id: String(raw.id??''), manufacturer,name,iso,model,builtin:false,
    provenance: String(raw.provenance??'personal').slice(0,40),
    sourceTitle:String(raw.sourceTitle??'').trim().slice(0,200),
    sourceUrl:String(raw.sourceUrl??'').trim().slice(0,500),
    sourceDate:String(raw.sourceDate??'').trim().slice(0,30),
    notes:String(raw.notes??'').trim().slice(0,1500)
  };
  if(obj.sourceUrl && !/^https?:\/\/\S+$/i.test(obj.sourceUrl)) throw Error('Source URL must use http or https');
  if(model==='power') {
    obj.p=Number(raw.p); obj.t0=Number(raw.t0);
    obj.min=raw.min==null || raw.min==='' ? null : Number(raw.min);
    obj.max=raw.max==null || raw.max==='' ? null : Number(raw.max);
    if(!Number.isFinite(obj.p) || obj.p<1 || obj.p>5) throw Error('Exponent must be between 1 and 5');
    if(!Number.isFinite(obj.t0) || obj.t0<0 || obj.t0>1000000) throw Error('Invalid no-correction threshold');
    if(obj.min!=null && !positive(obj.min)) throw Error('Invalid minimum range');
    if(obj.max!=null && !positive(obj.max)) throw Error('Invalid maximum range');
    if(obj.min!=null && obj.max!=null && obj.min>=obj.max) throw Error('Maximum must exceed minimum');
    if(obj.max!=null && obj.max<=obj.t0) throw Error('Maximum must exceed no-correction threshold');
  } else {
    const pairs = typeof raw.pairs==='string' ? parsePairs(raw.pairs) : raw.pairs;
    if(!Array.isArray(pairs) || pairs.length<2 || pairs.length>500) throw Error('Provide at least two (maximum 500) time pairs');
    let px=0,py=0;
    obj.pairs=pairs.map((pair,i)=>{
      if(!Array.isArray(pair) || pair.length!==2) throw Error('Invalid data pair '+(i+1));
      const x=Number(pair[0]), y=Number(pair[1]);
      if(!positive(x)||!positive(y)||x<=px||y<py) throw Error('Pairs must have increasing metered and non-decreasing corrected times');
      if(y<x) throw Error('Corrected time cannot be shorter than metered time');
      px=x;py=y;
      return [x,y];
    });
  }
  return obj;
}
export function exposureStops() {
  // Familiar fractional shutter speeds, followed by field-friendly long exposures.
  const fastDenominators=[16000,12800,10000,8000,6400,5000,4000,3200,2500,2000,1600,1250,1000,800,640,500,400,320,250,200,160,125,100,80,60,50,40,30,25,20,15,13,10,8,6,5,4,3,2];
  const longTimes=[1,1.5,2,3,4,6,8,10,15,20,30,45,60,90,120,180,240,300,450,600,900,1200,1800,2700,3600,5400,7200,10800,14400,21600,28800,43200,86400];
  return [...new Set([...fastDenominators.map(n=>1/n),...longTimes])].sort((a,b)=>a-b);
}
export const STOPS=exposureStops();
export function nearestStop(t) {
  let best=0, distance=Infinity;
  STOPS.forEach((v,i)=>{const d=Math.abs(Math.log(v/t));if(d<distance){best=i;distance=d}});
  return best;
}
