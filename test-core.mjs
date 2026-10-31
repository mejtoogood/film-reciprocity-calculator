import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTINS,corrected,validateFilm,interpolate,parsePairs,formatTime,nearestStop,STOPS,graphRangeFor,GRAPH_RANGES,effectiveFilms,normalizeOrigin,validDeletedIds} from './core.mjs';

test('Ilford manufacturer coefficients and provisional Kodak Gold 200',()=>{
 assert.deepEqual(BUILTINS.map(f=>f.iso),[50,100,400,400,200]);
 assert.deepEqual(BUILTINS.slice(0,4).map(f=>f.p),[1.33,1.26,1.41,1.31]);
 const gold=BUILTINS[4];
 assert.equal(gold.model,'power');
 assert.equal(gold.p,1.3);
 assert.equal(gold.provenance,'user');
 assert.equal(corrected(gold,1).seconds,1);
 assert.ok(Math.abs(corrected(gold,30).seconds-Math.pow(30,1.3))<1e-8);
});

test('Ilford PAN F Plus 50 uses published exponent',()=>{
 const p=BUILTINS[0];
 assert.equal(p.p,1.33);
 assert.equal(corrected(p,.5).seconds,.5);
 assert.equal(corrected(p,1).seconds,1);
 const r=corrected(p,30);
 assert.ok(Math.abs(r.seconds-92.1661123)<.0001);
 assert.ok(Math.abs(r.ev-1.6192739)<.0001);
});
test('power correction validates domain',()=>{
 const f=validateFilm({manufacturer:'Test',name:'Power',iso:100,model:'power',p:1.5,t0:1,min:2,max:60});
 assert.equal(corrected(f,30).ok,true);
 assert.equal(corrected(f,100).ok,false);
});
test('tabulated model log-log interpolates and does not extrapolate',()=>{
 const f=validateFilm({manufacturer:'Test',name:'Table',iso:100,model:'table',pairs:'1,1\n4,8\n16,32'});
 assert.equal(f.pairs.length,3);
 assert.ok(Math.abs(corrected(f,2).seconds-Math.sqrt(8))<1e-12);
 assert.equal(corrected(f,4).seconds,8);
 assert.equal(corrected(f,20).ok,false);
 assert.equal(corrected(f,.5).ok,false);
});
test('rejects invalid tabulated profiles',()=>{
 assert.throws(()=>parsePairs('1,2\nnot valid'));
 assert.throws(()=>validateFilm({manufacturer:'Test',name:'Table',iso:100,model:'table',pairs:'1,1\n1,2'}));
 assert.throws(()=>validateFilm({manufacturer:'Test',name:'Table',iso:100,model:'table',pairs:'1,1\n2,0.5'}));
});
test('field-oriented shutter steps and formatted display',()=>{
 const index=nearestStop(30);
 assert.equal(STOPS[index],30);
 assert.equal(STOPS[index+1],45);
 assert.equal(STOPS[index-1],20);
 assert.equal(formatTime(92.166),'1m 32s');
});

test('graph automatically frames the metered exposure',()=>{
 assert.deepEqual(GRAPH_RANGES,[15,60,300,900,3600]);
 assert.equal(graphRangeFor(1),15);
 assert.equal(graphRangeFor(15),15);
 assert.equal(graphRangeFor(16),60);
 assert.equal(graphRangeFor(30),60);
 assert.equal(graphRangeFor(60),60);
 assert.equal(graphRangeFor(100),300);
 assert.equal(graphRangeFor(300),300);
 assert.equal(graphRangeFor(600),900); // 10m -> 15m
 assert.equal(graphRangeFor(900),900);
 assert.equal(graphRangeFor(901),3600);
 assert.equal(graphRangeFor(3600),3600);
});

test('supplied stock edits override defaults without duplicate entries',()=>{
 const original=BUILTINS.find(x=>x.id==='ilford-pan-f-plus-50');
 const edit=validateFilm({...original,p:1.5});
 const changed=effectiveFilms(BUILTINS,[edit]);
 assert.equal(changed.length,BUILTINS.length);
 assert.equal(changed.filter(x=>x.id===original.id).length,1);
 assert.equal(changed.find(x=>x.id===original.id).p,1.5);
 assert.equal(corrected(changed.find(x=>x.id===original.id),30).seconds,30**1.5);
 assert.equal(BUILTINS.find(x=>x.id===original.id).p,1.33);
 assert.equal(effectiveFilms(BUILTINS,[]).find(x=>x.id===original.id).p,1.33);
});
test('saved edits survive JSON round-trip and user added films are retained',()=>{
 const saved=[
   validateFilm({...BUILTINS[4],p:1.55}),
   validateFilm({id:'custom-example',manufacturer:'Test',name:'Custom',iso:100,model:'power',p:1.4,t0:1})
 ];
 const restored=JSON.parse(JSON.stringify(saved));
 const films=effectiveFilms(BUILTINS,restored);
 assert.equal(films.length,BUILTINS.length+1);
 assert.equal(films.find(f=>f.id==='kodak-gold-200').p,1.55);
 assert.ok(films.some(f=>f.id==='custom-example'));
});

test('metered exposure stop list begins at one second',()=>{
 assert.equal(STOPS[0],1);
 assert.ok(STOPS.every(t=>t>=1));
 assert.equal(nearestStop(1),0);
 assert.equal(STOPS.at(-1),3600);
});
test('data origin has precisely manufacturer and user categories',()=>{
 assert.equal(normalizeOrigin('manufacturer'),'manufacturer');
 assert.equal(normalizeOrigin('user'),'user');
 for(const legacy of ['community-estimate','personal','digitised',undefined,'']) {
   assert.equal(normalizeOrigin(legacy),'user');
 }
 const original=BUILTINS.find(f=>f.id==='kodak-gold-200');
 assert.equal(original.provenance,'user');
 assert.equal(validateFilm({...original,provenance:'digitised'}).provenance,'user');
 assert.equal(validateFilm({...BUILTINS[0]}).provenance,'manufacturer');
});

test('deleting a supplied film persists and never implicitly reinstates it',()=>{
 const deleted=['ilford-pan-f-plus-50','kodak-gold-200'];
 const films=effectiveFilms(BUILTINS,[],deleted);
 assert.equal(films.length,BUILTINS.length-2);
 assert.ok(!films.some(f=>deleted.includes(f.id)));
 assert.deepEqual(effectiveFilms(BUILTINS,[],BUILTINS.map(f=>f.id)),[]);
});
test('deletion overrides user edits of supplied films',()=>{
 const edited=validateFilm({...BUILTINS[0],p:1.7});
 assert.equal(effectiveFilms(BUILTINS,[edited],[])[0].p,1.7);
 assert.ok(!effectiveFilms(BUILTINS,[edited],[edited.id]).some(f=>f.id===edited.id));
});
test('deleted stock IDs validate and survive backups',()=>{
 const deleted=BUILTINS.map(f=>f.id);
 const backup=JSON.parse(JSON.stringify({schemaVersion:2,customFilms:[],deletedFilmIds:deleted}));
 assert.deepEqual(validDeletedIds(backup.deletedFilmIds,BUILTINS),deleted);
 assert.deepEqual(validDeletedIds(['invalid',deleted[0],deleted[0]],BUILTINS),[deleted[0]]);
 assert.deepEqual(validDeletedIds(undefined,BUILTINS),[]);
});
