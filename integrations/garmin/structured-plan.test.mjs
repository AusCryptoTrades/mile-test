import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildGarminRunningWorkout} from './training-payload.mjs';
import {preparePlannedRunningSession} from './planned-session.mjs';
const {structuredRun}=createRequire(import.meta.url)('../../mile-garmin-plan.js');
const input={distanceKm:9,reps:4,pace:260,easyHr:145};
function flatten(steps){return steps.flatMap(s=>s.kind==='repeat'?Array.from({length:s.count},()=>flatten(s.steps)).flat():[s])}
test('all four generated running sessions compile to official Garmin payload',()=>{
 for(const k of ['easy','long','threshold','speed']){
  const a=structuredRun(k,input);assert.ok(a.detail);assert.ok(a.steps.length);
  assert.ok(buildGarminRunningWorkout({name:'Fixture '+k,sport:'running',description:a.detail,steps:a.steps}).segments[0].steps.length);
 }
});
test('intervals exclude recovery after final main effort and retain exact pace',()=>{
 const a=structuredRun('threshold',input),flat=flatten(a.steps);
 assert.equal(flat.filter(s=>s.intensity==='interval'&&s.duration.seconds===360).length,4);
 assert.equal(flat.filter(s=>s.intensity==='recovery'&&s.duration.seconds===120).length,3);
 assert.equal(flat.find(s=>s.duration.seconds===360).target.fastSecondsPerKm,255);
 assert.equal(flat.find(s=>s.duration.seconds===360).target.slowSecondsPerKm,270);
 assert.equal(flat.filter(s=>s.intensity==='interval'&&s.duration.seconds===20).length,4);
});
test('long run preserves total distance and no missing target is invented',()=>{
 const a=structuredRun('long',input);assert.equal(a.steps[0].duration.meters,9000);assert.equal(a.steps[0].target.kind,'pace');
 const b=structuredRun('easy',{...input,pace:null});assert.equal(b.steps.find(s=>s.intensity==='active').target.kind,'open');
 assert.equal(structuredRun('stations',input),null);
});
test('generated session is ready, edited prose and historical sessions require review',()=>{
 const a=structuredRun('easy',input),session={id:'fixture',date:'2026-12-01',sport:'Running',status:'planned',name:'Easy aerobic run',detail:a.detail,structuredDetail:a.detail,structuredSteps:a.steps};
 assert.equal(preparePlannedRunningSession(session).status,'preview_ready');
 assert.equal(preparePlannedRunningSession({...session,detail:'Edited session'}).status,'review_required');
});

test('configured aerobic range becomes a real HR target, including explicit ceiling',()=>{
 const zones=[{min:90,max:107},{min:108,max:125},{min:126,max:143},{min:144,max:161},{min:162,max:180}];
 for(const kind of ['easy','long']){
  const a=structuredRun(kind,{...input,pace:null,easyHr:123,zoneRanges:zones});
  const p=buildGarminRunningWorkout({name:kind,sport:'running',description:a.detail,steps:a.steps});
  const main=p.segments[0].steps.find(s=>s.intensity==='ACTIVE');
  assert.equal(main.targetType,'HEART_RATE');assert.equal(main.targetValueLow,108);assert.equal(main.targetValueHigh,123);
  assert.match(a.detail,/108–123 bpm/);
 }
 const a=structuredRun('threshold',{...input,pace:null,zoneRanges:zones});
 assert.deepEqual(flatten(a.steps).find(s=>s.duration.seconds===360).target,{kind:'heart_rate',lowBpm:144,highBpm:161});
 const b=structuredRun('threshold',{...input,zoneRanges:zones});
 assert.equal(flatten(b.steps).find(s=>s.duration.seconds===360).target.kind,'pace');
 const speed=structuredRun('speed',{...input,pace:null,zoneRanges:zones});
 assert.equal(flatten(speed.steps).find(s=>s.duration.seconds===180).target.kind,'open');
});
