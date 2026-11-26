import test from 'node:test';
import assert from 'node:assert/strict';
import {requestCheck,retryDelaySeconds} from './request-checks.mjs';
test('repeated permission checks reuse a fresh request-local result and expire',async()=>{
 let t=0,n=0;
 const a=requestCheck(async()=>++n,{now:()=>t,ttlMs:5000});
 assert.deepEqual(await Promise.all([a(),a(),a()]),[1,1,1]);
 t=4999;assert.equal(await a(),1);
 t=5000;assert.equal(await a(),2);
 const b=requestCheck(async()=>++n,{now:()=>t});
 assert.equal(await b(),3);
});
test('failed reads are not cached',async()=>{
 let n=0;const read=requestCheck(async()=>{if(++n===1)throw Error('429');return ['WORKOUT_IMPORT']});
 await assert.rejects(read(),/429/);assert.deepEqual(await read(),['WORKOUT_IMPORT']);
});
test('Retry-After accepts numeric seconds and dates; invalid values default to one minute',()=>{
 assert.equal(retryDelaySeconds('17'),17);
 assert.equal(retryDelaySeconds(null),60);
 assert.equal(retryDelaySeconds('invalid'),60);
 assert.equal(retryDelaySeconds('Thu, 26 Nov 2026 19:02:00 GMT',Date.parse('2026-11-26T19:01:30Z')),30);
});