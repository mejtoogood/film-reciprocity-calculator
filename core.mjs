export const BUILTINS = Object.freeze([
  {
    "id": "ilford-pan-f-plus-50",
    "manufacturer": "Ilford",
    "name": "PAN F Plus 50",
    "iso": 50,
    "model": "power",
    "p": 1.33,
    "t0": 1,
    "min": null,
    "max": null,
    "provenance": "manufacturer",
    "sourceTitle": "Ilford Film Reciprocity Failure Compensation",
    "sourceUrl": "https://www.ilfordphoto.com/wp/wp-content/uploads/2024/05/Reciprocity-Failure-Compensation-v2.pdf",
    "sourceDate": "2023-12",
    "notes": "Ilford's general compensation sheet uses a 1s threshold; the PAN F Plus datasheet describes a 1/2s threshold. This calculator uses the December 2023 sheet.",
    "builtin": true
  },
  {
    "id": "ilford-delta-100",
    "manufacturer": "Ilford",
    "name": "Delta 100 Professional",
    "iso": 100,
    "model": "power",
    "p": 1.26,
    "t0": 1,
    "min": null,
    "max": null,
    "provenance": "manufacturer",
    "sourceTitle": "Ilford Film Reciprocity Failure Compensation",
    "sourceUrl": "https://www.ilfordphoto.com/wp/wp-content/uploads/2024/05/Reciprocity-Failure-Compensation-v2.pdf",
    "sourceDate": "2023-12",
    "notes": "",
    "builtin": true
  },
  {
    "id": "ilford-delta-400",
    "manufacturer": "Ilford",
    "name": "Delta 400 Professional",
    "iso": 400,
    "model": "power",
    "p": 1.41,
    "t0": 1,
    "min": null,
    "max": null,
    "provenance": "manufacturer",
    "sourceTitle": "Ilford Film Reciprocity Failure Compensation",
    "sourceUrl": "https://www.ilfordphoto.com/wp/wp-content/uploads/2024/05/Reciprocity-Failure-Compensation-v2.pdf",
    "sourceDate": "2023-12",
    "notes": "",
    "builtin": true
  },
  {
    "id": "ilford-hp5-plus-400",
    "manufacturer": "Ilford",
    "name": "HP5 Plus 400",
    "iso": 400,
    "model": "power",
    "p": 1.31,
    "t0": 1,
    "min": null,
    "max": null,
    "provenance": "manufacturer",
    "sourceTitle": "Ilford Film Reciprocity Failure Compensation",
    "sourceUrl": "https://www.ilfordphoto.com/wp/wp-content/uploads/2024/05/Reciprocity-Failure-Compensation-v2.pdf",
    "sourceDate": "2023-12",
    "notes": "",
    "builtin": true
  },
  {
    "id": "kodak-gold-200",
    "manufacturer": "Kodak",
    "name": "Gold 200",
    "iso": 200,
    "model": "power",
    "p": 1.3,
    "t0": 1,
    "min": null,
    "max": null,
    "provenance": "user",
    "sourceTitle": "Kodak GOLD 200 E-7022 (threshold only, not the exponent)",
    "sourceUrl": "https://www.kodakprofessional.com/sites/default/files/wysiwyg/E7022-1.pdf",
    "sourceDate": "2022-03",
    "notes": "Provisional p=1.3 estimate requested by user. Kodak's datasheet supports no correction through 1s but does NOT publish this exponent. Test critical long exposures.",
    "builtin": true
  }
]);

export function positive(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0; }
// Old saved profiles may say "personal", "digitised" or "community-estimate".
// All non-manufacturer data originates with the user under the simplified scheme.
export function normalizeOrigin(origin) {
  return origin === 'manufacturer' ? 'manufacturer' : 'user';
}
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
    return seconds == null ? {ok:false,reason:profile.noBeyond && t>profile.noBeyond ? 'Kodak publishes no correction data above 1s' : 'Outside supplied data range'} :
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
    provenance: normalizeOrigin(raw.provenance),
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
  // Reciprocity field tool: minimum 1 second; keep longer Bulb times.
  return [1,1.5,2,3,4,6,8,10,15,20,30,45,60,90,120,180,240,300,450,600,900,1200,1800,2700,3600];
}
export const STOPS=exposureStops();
export function adjacentStops(t) {
  return {
    previous: t <= STOPS[0] ? null : STOPS.slice().reverse().find(v => v < t*(1-1e-10)) ?? null,
    next: t >= STOPS.at(-1) ? null : STOPS.find(v => v > t*(1+1e-10)) ?? null
  };
}
export function nearestStop(t) {
  let best=0, distance=Infinity;
  STOPS.forEach((v,i)=>{const d=Math.abs(Math.log(v/t));if(d<distance){best=i;distance=d}});
  return best;
}

// Smallest supported horizontal graph view containing a given metered exposure.
export const GRAPH_RANGES=Object.freeze([15,60,300,900,3600]);
export function graphRangeFor(t) {
  if(!positive(t)) return 60;
  return GRAPH_RANGES.find(range=>t<=range)||GRAPH_RANGES.at(-1);
}

/** Compose the supplied defaults with locally saved edits and user-added profiles.
 *  An edited supplied stock retains its stable ID; the original remains available for Reset.
 */
export function effectiveFilms(defaults, saved, deletedIds = []) {
  const hidden = new Set(deletedIds);
  const savedById = new Map(saved.map(f => [f.id, f]));
  const defaultIds = new Set(defaults.map(f => f.id));
  return [
    ...defaults.filter(base => !hidden.has(base.id)).map(base => savedById.get(base.id) ?? base),
    ...saved.filter(f => !hidden.has(f.id) && !defaultIds.has(f.id))
  ];
}
export function validDeletedIds(ids, defaults) {
  const known = new Set(defaults.map(f => f.id));
  return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && known.has(id)))] : [];
}
