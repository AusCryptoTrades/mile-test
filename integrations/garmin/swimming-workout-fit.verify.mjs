import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Decoder,Stream} from '@garmin/fitsdk';
import {encodeSwimmingWorkoutFit} from './running-workout-fit.mjs';
import {buildGarminRunningWorkout} from './training-payload.mjs';
import plan from '../../mile-swimming-plan.js';

test('official FIT SDK round-trips pool metres, course units, distance and timed rest',()=>{
 for(const poolMeters of [22.86,25,50]){
  const session=plan.compile(plan.library.find(recipe=>recipe.id==='css-100'),poolMeters,{secondsPer100m:100});
  const bytes=encodeSwimmingWorkoutFit({sport:'swimming',name:session.name,poolMeters,steps:session.structuredSteps});
  const decoder=new Decoder(Stream.fromByteArray(Array.from(bytes)));
  assert.equal(decoder.checkIntegrity(),true);
  const {messages,errors}=decoder.read();
  assert.deepEqual(errors,[]);
  const [course]=messages.workoutMesgs,steps=messages.workoutStepMesgs;
  assert.equal(course.sport,'swimming');
  assert.equal(course.subSport,'lapSwimming');
  assert.equal(course.poolLength,poolMeters);
  assert.equal(course.poolLengthUnit,poolMeters===22.86?'statute':'metric');
  assert.equal(course.numValidSteps,steps.length);
  assert.equal(steps[0].durationDistance,session.structuredSteps[0].duration.meters);
  assert.equal(steps[1].durationTime,20);
  assert.equal(steps[2].targetType,'open');
  assert.match(steps[2].notes,/1:40–1:44\/100 m/);
 }
});

test('swimming FIT rejects partial lengths and the Training API publisher remains Running-only',()=>{
 const swim={sport:'swimming',name:'Fixture swim',poolMeters:25,steps:[{
  kind:'step',intensity:'active',duration:{kind:'distance',meters:49},target:{kind:'open'}
 }]};
 assert.throws(()=>encodeSwimmingWorkoutFit(swim),/whole pool lengths/);
 assert.throws(()=>buildGarminRunningWorkout({sport:swim.sport,name:swim.name,steps:swim.steps,description:''}),/running/i);
});
