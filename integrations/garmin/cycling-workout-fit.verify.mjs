import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Decoder,Stream} from '@garmin/fitsdk';
import {encodeCyclingWorkoutFit,encodeRunningWorkoutFit} from './running-workout-fit.mjs';
import {buildGarminRunningWorkout} from './training-payload.mjs';
const steps=[
 {kind:'step',intensity:'warmup',duration:{kind:'time',seconds:600},target:{kind:'heart_rate',lowBpm:110,highBpm:130}},
 {kind:'repeat',count:2,steps:[
  {kind:'step',intensity:'interval',duration:{kind:'distance',meters:5000},target:{kind:'power',lowWatts:210,highWatts:228}},
  {kind:'step',intensity:'recovery',duration:{kind:'time',seconds:180},target:{kind:'rpe',low:1,high:2}}
 ]},
 {kind:'step',intensity:'cooldown',duration:{kind:'lap'},target:{kind:'open'}}
];
const ride={sport:'cycling',name:'Synthetic cycling workout',steps};

test('FIT cycling time, distance, repeat, absolute power and HR survive SDK round-trip',()=>{
 const decoder=new Decoder(Stream.fromByteArray(Array.from(encodeCyclingWorkoutFit(ride))));
 assert.equal(decoder.checkIntegrity(),true);
 const {messages,errors}=decoder.read();
 assert.deepEqual(errors,[]);
 assert.equal(messages.workoutMesgs[0].sport,'cycling');
 const steps=messages.workoutStepMesgs;
 assert.equal(steps.length,6);
 assert.equal(steps[0].durationTime,600);
 assert.equal(steps[0].targetType,'heartRate');
 assert.equal(steps[0].customTargetHeartRateLow,210);
 assert.equal(steps[1].durationDistance,5000);
 assert.equal(steps[1].targetType,'power');
 assert.equal(steps[1].customTargetPowerLow,1210);
 assert.equal(steps[1].customTargetPowerHigh,1228);
 assert.equal(steps[2].targetType,'open');
 assert.match(steps[2].notes,/RPE/);
 assert.equal(steps[5].durationType,'open');
});
test('the verified Running FIT and Training API routes reject cycling workouts',()=>{
 assert.throws(()=>encodeRunningWorkoutFit(ride),/running workout/);
 assert.throws(()=>buildGarminRunningWorkout({...ride,description:''}),/running/i);
});
