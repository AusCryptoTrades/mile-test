import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGarminRunningWorkout} from './training-payload.mjs';
const step=(intensity,duration,target)=>({kind:'step',intensity,duration,...(target?{target}:{})});
const plan=steps=>({name:'Synthetic MILE fixture',sport:'running',steps});
test('distance, pace, time and repeats preserve structured session',()=>{
 const result=buildGarminRunningWorkout(plan([
 step('warmup',{kind:'time',seconds:600}),
 {kind:'repeat',count:4,steps:[step('interval',{kind:'distance',meters:1000},{kind:'pace',fastSecondsPerKm:255,slowSecondsPerKm:265}),step('recovery',{kind:'time',seconds:120})]},
 step('cooldown',{kind:'time',seconds:600})]));
 const [warmup,repeat,cooldown]=result.segments[0].steps;
 assert.equal(result.workoutProvider,result.workoutSourceId);
 assert.equal(warmup.durationValue,600);assert.equal(repeat.repeatValue,4);
 assert.equal(repeat.steps[0].durationValueType,'METER');
 assert.equal(repeat.steps[0].targetValueLow,1000/265);
 assert.equal(repeat.steps[0].targetValueHigh,1000/255);
 assert.equal(repeat.skipLastRestStep,false);
 assert.deepEqual([warmup.stepOrder,repeat.stepOrder,...repeat.steps.map(s=>s.stepOrder),cooldown.stepOrder],[1,2,3,4,5]);
});
test('heart-rate range and open duration retain semantics',()=>{
 const r=buildGarminRunningWorkout(plan([step('active',{kind:'open'},{kind:'heart_rate',lowBpm:120,highBpm:145})])).segments[0].steps[0];
 assert.equal(r.durationValue,null);assert.equal(r.targetType,'HEART_RATE');assert.equal(r.targetValueLow,120);assert.equal(r.targetValueHigh,145);
});
test('reject incorrect sport, owner injection, inverted ranges and nonnumeric units',()=>{
 assert.throws(()=>buildGarminRunningWorkout({...plan([]),sport:'swimming'}),/running/);
 assert.throws(()=>buildGarminRunningWorkout({...plan([]),userId:'other'}),/Unexpected/);
 assert.throws(()=>buildGarminRunningWorkout(plan([step('active',{kind:'time',seconds:'600'})])),/duration/);
 assert.throws(()=>buildGarminRunningWorkout(plan([step('active',{kind:'time',seconds:600},{kind:'pace',fastSecondsPerKm:270,slowSecondsPerKm:250})])),/Reversed/);
 assert.throws(()=>buildGarminRunningWorkout(plan([step('active',{kind:'time',seconds:600},{kind:'heart_rate',lowBpm:160,highBpm:140})])),/Reversed/);
});
test('reject excessive steps, nested repeats and unsupported targets',()=>{
 const s=step('active',{kind:'time',seconds:60});
 assert.throws(()=>buildGarminRunningWorkout(plan(Array.from({length:101},()=>s))),/Too many/);
 assert.throws(()=>buildGarminRunningWorkout(plan([{kind:'repeat',count:50,steps:[{kind:'repeat',count:50,steps:[s]}]}])),/Too many expanded/);
 assert.throws(()=>buildGarminRunningWorkout(plan([step('active',{kind:'time',seconds:60},{kind:'power',watts:300})])),/Unsupported/);
});
test('a manual lap round-trips through the established JSON mapping while HR completion stays out of it',()=>{
 const lap=buildGarminRunningWorkout(plan([step('recovery',{kind:'lap'})])).segments[0].steps[0];
 assert.equal(lap.durationType,'OPEN');
 assert.equal(lap.durationValue,null);
 for(const direction of ['below','above'])
  assert.throws(()=>buildGarminRunningWorkout(plan([step('recovery',{kind:'heart_rate',direction,bpm:125,fallbackSeconds:90})])),/Use timed recovery/);
});
