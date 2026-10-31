import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTINS,corrected,validateFilm,interpolate,parsePairs,formatTime,nearestStop,STOPS} from './core.mjs';

test('Ilford manufacturer coefficients and provisional Kodak Gold 200',()=>{
 assert.deepEqual(BUILTINS.map(f=>f.iso),[50,100,400,400,200]);
 assert.deepEqual(BUILTINS.slice(0,4).map(f=>f.p),[1.33,1.26,1.41,1.31]);
 const gold=BUILTINS[4];
 assert.equal(gold.model,'power');
 assert.equal(gold.p,1.3);
 assert.equal(gold.provenance,'community-estimate');
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
