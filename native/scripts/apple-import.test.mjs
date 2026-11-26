import test from 'node:test';
import assert from 'node:assert/strict';
import {importAppleWorkouts} from '../sync/apple-import.mjs';
import {createAppleTransport} from '../sync/apple-transport.mjs';
const accountId='fixture-a',from='2026-10-01T00:00:00.000Z',to='2026-10-02T00:00:00.000Z';
const raw={provider:'apple_health',providerId:'00000000-0000-4000-8000-000000000011',startAt:from,endAt:'2026-10-01T01:00:00Z',durationSeconds:3600,sport:'running'};
const page=(workouts=[raw],nextCursor='a',hasMore=true,deletedProviderIds=[])=>({workouts,nextCursor,hasMore,deletedProviderIds});
function fixture(){
 let active=accountId,consent=true,cursor=null;const events=[],queue=[page(),page([],'b',false)];
 const options={accountId,from,to,readPage:async()=>queue.shift(),activeAccount:()=>active,consented:async()=>consent,transport:{upsert:async(id,rows)=>{events.push(['write',id,rows])}},checkpoint:{load:async()=>cursor,save:async(id,window,next)=>{cursor=next;events.push(['save',next])}}};
 return {options,events,queue,change:()=>{active='other'},revoke:()=>{consent=false}};
}
test('historical import writes before checkpoint and preserves null distance',async()=>{
 const f=fixture();assert.deepEqual(await importAppleWorkouts(f.options),{pages:2,imported:1});
 assert.equal(f.events[0][0],'write');assert.equal(f.events[0][2][0].distance_meters,null);assert.equal('user_id' in f.events[0][2][0],false);assert.deepEqual(f.events.slice(1),[['save','a'],['save','b']]);
});
test('failed upload never advances checkpoint',async()=>{const f=fixture();f.options.transport.upsert=async()=>{throw Error('offline')};await assert.rejects(importAppleWorkouts(f.options),/offline/);assert.deepEqual(f.events,[])});
test('consent and account changes stop import',async()=>{const f=fixture();f.revoke();await assert.rejects(importAppleWorkouts(f.options),/consent/);const g=fixture();g.options.readPage=async()=>{g.change();return page()};await assert.rejects(importAppleWorkouts(g.options),/account changed/);assert.deepEqual(g.events,[])});
test('repeating cursor and source deletion fail safely',async()=>{const f=fixture();f.queue[1]=page([raw],'a',true);await assert.rejects(importAppleWorkouts(f.options),/cursor did not advance/);assert.equal(f.events.length,2);const g=fixture();g.queue[0]=page([],'a',true,[raw.providerId]);await assert.rejects(importAppleWorkouts(g.options),/reconciliation/);assert.deepEqual(g.events,[])});
test('transport binds token and rejects owner injection',async()=>{
 let owner=accountId;const requests=[];
 const t=createAppleTransport({baseUrl:'https://example.invalid',anonKey:'public-fixture',session:async()=>({accountId:owner,accessToken:'fixture-token'}),fetchImpl:async(url,opts)=>{requests.push([url,opts]);return {ok:true,json:async()=>[{enabled:true}]}}});
 const row={provider:'apple_health',provider_id:raw.providerId};
 await t.upsert(accountId,[row]);assert.equal(requests[0][1].headers.Authorization,'Bearer fixture-token');assert.deepEqual(JSON.parse(requests[0][1].body),[row]);
 await assert.rejects(t.upsert(accountId,[{...row,user_id:'other'}]),/Unexpected/);assert.equal(await t.consented(accountId),true);
 owner='other';await assert.rejects(t.upsert(accountId,[row]),/Session/);assert.equal(requests.length,2);
});
test('transport rejects insecure endpoint and failed response',async()=>{
 assert.throws(()=>createAppleTransport({baseUrl:'http://example.invalid',anonKey:'public'}),/HTTPS/);
 const t=createAppleTransport({baseUrl:'https://example.invalid',anonKey:'public',session:async()=>({accountId,accessToken:'fixture'}),fetchImpl:async()=>({ok:false,status:403})});
 await assert.rejects(t.upsert(accountId,[{provider:'apple_health',provider_id:raw.providerId}]),/403/);
});
