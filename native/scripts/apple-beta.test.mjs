import test from 'node:test';
import assert from 'node:assert/strict';
import {appleActivity,appleImportRange,reconcileAppleActivities} from '../sync/workouts.mjs';
import {watchRun} from '../sync/watch-workouts.mjs';
import {importAppleWorkouts} from '../sync/apple-import.mjs';
import workout from '../../mile-running-workout.js';
const id='00000000-0000-4000-8000-000000000092';
const record={provider_id:id,start_at:'2026-11-18T05:00:00Z',activity_day:'2026-11-18',distance_meters:10000,duration_seconds:3000,sport:'running'};
test('HealthKit windows remain anchored and 180 days are always covered',()=>{
 const now=Date.parse('2026-11-18T05:00:00Z'), range=appleImportRange(now);
 assert.deepEqual(appleImportRange(now+1000),range);
 assert.ok(now-Date.parse(range.from)>=180*86400000);
 assert.ok(Date.parse(range.to)-now<=30*86400000);
});
test('Apple Health units and provider identity stay explicit; absent metrics remain unavailable',()=>{
 const a=appleActivity(record);
 assert.equal(a.id,'apple:'+id);assert.equal(a.distanceKm,10);assert.equal(a.averageHR,null);
 assert.equal(appleActivity({...record,distance_meters:null}).distanceKm,null);
 assert.equal(appleActivity({...record,deleted_at:'now'}),null);
});
test('possible Garmin overlaps are held for review without deleting either source',()=>{
 const g={source:'garmin-developer-api',type:'running',date:record.start_at,durationSeconds:3010,distanceKm:10,name:'A run'};
 assert.equal(reconcileAppleActivities([record],[g]).visible.length,0);
 assert.equal(reconcileAppleActivities([record],[g]).overlaps.length,1);
 assert.equal(reconcileAppleActivities([{...record,overlap_decision:true}],[g]).visible.length,1);
 assert.equal(reconcileAppleActivities([{...record,overlap_decision:false}],[g]).visible.length,0);
 assert.equal(reconcileAppleActivities([record],[{...g,date:'2026-11-19T05:00:00Z'}]).visible.length,1);
});
test('atomic deletions commit before checkpoint, with no cursor change on failure',async()=>{
 const calls=[];
 const input={accountId:'account',activeAccount:()=> 'account',consented:()=>true,from:'2026-11-01T00:00:00Z',to:'2026-11-30T00:00:00Z',
  readPage:async()=>({workouts:[],deletedProviderIds:[id],hasMore:false,nextCursor:'next'}),
  checkpoint:{load:async()=>null,save:async()=>calls.push('save')},
  transport:{commit:async(owner,rows,ids)=>calls.push([owner,rows,ids])}};
 assert.deepEqual(await importAppleWorkouts(input),{pages:1,imported:0,removed:1});
 assert.deepEqual(calls,[['account',[],[id]],'save']);
 calls.length=0;
 await assert.rejects(importAppleWorkouts({...input,transport:{commit:async()=>{throw Error('server unavailable')}}}),/server unavailable/);
 assert.deepEqual(calls,[]);
});
test('WorkoutKit conversion preserves repeat steps and rejects unsupported workouts',()=>{
 const step={kind:'step',intensity:'interval',duration:{kind:'distance',meters:400},target:{kind:'pace',fastSecondsPerKm:240,slowSecondsPerKm:270}};
 const recovery={kind:'step',intensity:'recovery',duration:{kind:'time',seconds:75},target:{kind:'heart_rate',lowBpm:120,highBpm:145}};
 const base={id:'w-92',name:'Intervals',date:'2026-11-29',status:'planned',sport:'Running',runningPlanVersion:1,revision:1,
  detail:'same',structuredDetail:'same',structuredSteps:[{kind:'repeat',count:3,steps:[step,recovery]}]};
 assert.deepEqual(watchRun(base,workout).steps,[step,recovery,step,recovery,step,recovery]);
 for(const changed of [{status:'done'},{structuredDetail:'edited'},{sport:'Cycling'},
  {structuredSteps:[{...recovery,duration:{kind:'heart_rate',direction:'below',bpm:120,fallbackSeconds:90}}]}])
  assert.equal(watchRun({...base,...changed},workout),null);
});

test('transport refuses to accept a non-confirming atomic response',async()=>{
 const {createAppleTransport}=await import('../sync/apple-transport.mjs');
 let response={};
 const transport=createAppleTransport({baseUrl:'https://staging.example',anonKey:'fixture-public',session:()=>({accountId:'a',accessToken:'fixture'}),
  fetchImpl:async()=>({ok:true,json:async()=>response})});
 await assert.rejects(transport.commit('a',[],[],'epoch'),/not confirmed/);
 response={committed:true};
 assert.deepEqual(await transport.commit('a',[],[],'epoch'),response);
});
