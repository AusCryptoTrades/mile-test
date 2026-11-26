import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeAppleImport} from '../sync/apple-native.mjs';
const accountId='fixture-account',from='2026-10-01T00:00:00.000Z',to='2026-10-02T00:00:00.000Z';
const raw={provider:'apple_health',providerId:'00000000-0000-4000-8000-000000000011',startAt:from,endAt:'2026-10-01T01:00:00Z',durationSeconds:3600,sport:'running'};
function fixture(){
 let active=accountId,consent=true,cloudConsent=true,failUpload=false;
 const map=new Map(),events=[];
 const plugin={
  availability:async()=>({available:true}),
  requestReadAccess:async()=>{events.push('permission');return {requestCompleted:true}},
  readWorkoutPage:async({cursor})=>{events.push(['read',cursor]);return cursor?{workouts:[],deletedProviderIds:[],nextCursor:'b',hasMore:false}:{workouts:[raw],deletedProviderIds:[],nextCursor:'a',hasMore:true}},
  checkpointGet:async({key})=>({value:map.get(key)??null}),
  checkpointSet:async({key,value})=>{events.push(['checkpoint',value]);map.set(key,value)},
  checkpointRemove:async({key})=>{map.delete(key)}
 };
 const options={cap:{isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:{MILEHealthKit:plugin}},accountId,installationId:'fixture-device',activeAccount:()=>active,session:async()=>({accountId:active,accessToken:'fixture-token'}),backend:{mode:'isolated-staging',enabled:true,url:'https://example.invalid',anonKey:'public-fixture'},explicitConsent:async()=>consent,fetchImpl:async(url,opts)=>{
  assert.equal(opts.headers.Authorization,'Bearer fixture-token');
  if(opts.method==='POST'){events.push(['upload',JSON.parse(opts.body)]);return {ok:!failUpload,status:failUpload?503:201}}
  return {ok:true,json:async()=>[{enabled:cloudConsent}]};
 }};
 return {options,events,map,plugin,change:()=>{active='other'},revoke:()=>{consent=false},revokeCloud:()=>{cloudConsent=false},fail:()=>{failUpload=true}};
}
test('native assembly executes a consented import and resumes from durable cursor',async()=>{
 const f=fixture();assert.deepEqual(await createNativeAppleImport(f.options).run({from,to}),{pages:2,imported:1});
 const upload=f.events.find(x=>Array.isArray(x)&&x[0]==='upload');
 assert.equal(upload[1][0].provider_id,raw.providerId);assert.equal('user_id' in upload[1][0],false);
 assert.ok(f.events.indexOf(upload)<f.events.findIndex(x=>Array.isArray(x)&&x[0]==='checkpoint'));
 assert.equal(f.map.size,1);assert.deepEqual(await createNativeAppleImport(f.options).run({from,to}),{pages:1,imported:0});
});
test('native assembly rejects production, web, and disabled staging',()=>{
 const f=fixture();assert.throws(()=>createNativeAppleImport({...f.options,backend:{...f.options.backend,url:'https://mgixvokjlytjuypzcfzz.supabase.co'}}),/Production/);
 assert.throws(()=>createNativeAppleImport({...f.options,backend:{...f.options.backend,enabled:false}}),/disabled/);
 assert.throws(()=>createNativeAppleImport({...f.options,cap:{isNativePlatform:()=>false}}),/Native iOS/);
});
test('both consent gates precede permission and health reads',async()=>{
 const f=fixture();f.revoke();await assert.rejects(createNativeAppleImport(f.options).run({from,to}),/consent/);assert.deepEqual(f.events,[]);
 const g=fixture();g.revokeCloud();await assert.rejects(createNativeAppleImport(g.options).run({from,to}),/Cloud consent/);assert.deepEqual(g.events,[]);
});
test('upload failure and account switch do not save checkpoint',async()=>{
 const f=fixture();f.fail();await assert.rejects(createNativeAppleImport(f.options).run({from,to}),/503/);assert.equal(f.map.size,0);
 const g=fixture();g.plugin.readWorkoutPage=async()=>{g.change();return {workouts:[raw],deletedProviderIds:[],nextCursor:'a',hasMore:true}};
 await assert.rejects(createNativeAppleImport(g.options).run({from,to}),/account changed/i);assert.equal(g.map.size,0);assert.equal(g.events.some(x=>Array.isArray(x)&&x[0]==='upload'),false);
});
test('single-flight and cancellation stop duplicate imports',async()=>{
 const f=fixture();let resume;const gate=new Promise(r=>{resume=r});
 f.plugin.readWorkoutPage=async()=>{await gate;return {workouts:[raw],deletedProviderIds:[],nextCursor:'a',hasMore:true}};
 const importer=createNativeAppleImport(f.options);const running=importer.run({from,to});
 await assert.rejects(importer.run({from,to}),/already running/);importer.cancel();resume();
 await assert.rejects(running,/cancelled|Session unavailable/);assert.equal(f.map.size,0);
});
