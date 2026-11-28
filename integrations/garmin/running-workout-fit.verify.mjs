import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Decoder, Stream } from '@garmin/fitsdk';
import { encodeRunningWorkoutFit } from './running-workout-fit.mjs';
import { controlledRunningCheck } from './controlled-running-check.mjs';

const workout = controlledRunningCheck({ aboveBpm: 85, belowBpm: 130 });
function read(bytes) {
 const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
 assert.equal(decoder.checkIntegrity(), true);
 const { messages, errors } = decoder.read();
 assert.deepEqual(errors, []);
 assert.equal(messages.workoutMesgs[0].numValidSteps, workout.steps.length);
 return messages.workoutStepMesgs;
}

test('distance, time, both absolute bpm directions and manual lap round-trip through the Garmin FIT SDK', () => {
 const steps = read(encodeRunningWorkoutFit(workout));
 assert.deepEqual(steps.map(s => s.durationType), ['time','distance','time','hrLessThan','open','hrGreaterThan','time']);
 assert.equal(steps[1].durationDistance, 150);
 assert.equal(steps[2].durationTime, 45);
 assert.equal(steps[3].durationHr, 230);
 assert.equal(steps[5].durationHr, 185);
});

test('the explicit timed FIT alternative preserves distance and manual lap', () => {
 const steps = read(encodeRunningWorkoutFit(workout, { useTimedRecovery: true }));
 assert.deepEqual(steps.map(s => s.durationType), ['time','distance','time','time','open','time','time']);
 assert.equal(steps[3].durationTime, 90);
 assert.equal(steps[5].durationTime, 90);
 assert.throws(() => controlledRunningCheck({ aboveBpm: 155, belowBpm: 100 }));
});

test('FIT recovery and intensity targets are separate fields', () => {
 const plan = structuredClone(workout);
 plan.steps[3].target = { kind: 'heart_rate', lowBpm: 105, highBpm: 130 };
 plan.steps[2].target = { kind: 'pace', fastSecondsPerKm: 240, slowSecondsPerKm: 260 };
 const steps = read(encodeRunningWorkoutFit(plan));
 assert.equal(steps[3].durationHr, 230);
 assert.equal(steps[3].targetType, 'heartRate');
 assert.equal(steps[3].customTargetHeartRateLow, 205);
 assert.equal(steps[3].customTargetHeartRateHigh, 230);
 assert.equal(steps[2].targetType, 'speed');
 assert.equal(steps[2].customTargetSpeedLow, 3.846);
});
