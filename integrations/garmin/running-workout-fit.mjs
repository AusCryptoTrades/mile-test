import { Encoder, Profile } from '@garmin/fitsdk';
import prescription from '../../mile-running-workout.js';

// Garmin FIT workout files specify one completion condition. Timed alternatives
// stay in the MILE plan and can be exported as a deliberate alternative.
export function encodeRunningWorkoutFit(workout, options) {
 return encodeWorkoutFit(workout, 'running', options);
}
export function encodeCyclingWorkoutFit(workout) {
 return encodeWorkoutFit(workout, 'cycling');
}
function encodeWorkoutFit(workout, sport, { useTimedRecovery = false } = {}) {
 const steps = prescription.expand(workout?.steps, { limit: 50, sport: sport === 'cycling' ? 'Cycling' : 'Running' });
 if (!steps || workout?.sport !== sport || typeof workout.name !== 'string' || !workout.name.trim()) {
  throw Error('A '+sport+' workout with at most 50 steps is required.');
 }
 const encoder = new Encoder();
 const messages = Profile.MesgNum;
 encoder.onMesg(messages.FILE_ID, { type: 'workout', manufacturer: 'development', product: 1, timeCreated: new Date() });
 encoder.onMesg(messages.WORKOUT, { sport, numValidSteps: steps.length, wktName: workout.name.trim().slice(0, 32) });
 for (const [messageIndex, step] of steps.entries()) {
  const { duration, target } = step;
  let durationType = 'open', durationValue = 0;
  if (duration.kind === 'time' || (useTimedRecovery && duration.kind === 'heart_rate' && duration.fallbackSeconds)) {
   durationType = 'time';
   durationValue = (duration.seconds ?? duration.fallbackSeconds) * 1000;
  } else if (duration.kind === 'distance') {
   durationType = 'distance';
   durationValue = Math.round(duration.meters * 100);
  } else if (duration.kind === 'heart_rate') {
   durationType = duration.direction === 'above' ? 'hrGreaterThan' : 'hrLessThan';
   durationValue = duration.bpm + 100;
  }
  const data = { messageIndex, intensity: step.intensity, durationType, durationValue, targetType: 'open', targetValue: 0,
    wktStepName: prescription.labels[step.intensity], notes: String(step.description ?? '').slice(0, 100) };
  if (target?.kind === 'heart_rate') {
   const { lowBpm, highBpm } = target;
   if (!Number.isInteger(lowBpm) || !Number.isInteger(highBpm) || lowBpm < 30 || highBpm > 250 || lowBpm > highBpm) throw Error('Invalid heart-rate target');
   Object.assign(data, { targetType: 'heartRate', customTargetValueLow: lowBpm + 100, customTargetValueHigh: highBpm + 100 });
  } else if (target?.kind === 'pace') {
   const { fastSecondsPerKm, slowSecondsPerKm } = target;
   if (!Number.isFinite(fastSecondsPerKm) || !Number.isFinite(slowSecondsPerKm) ||
     fastSecondsPerKm < 120 || slowSecondsPerKm > 1800 || fastSecondsPerKm > slowSecondsPerKm) throw Error('Invalid pace target');
   Object.assign(data, { targetType: 'speed', customTargetValueLow: Math.round(1000000 / slowSecondsPerKm),
    customTargetValueHigh: Math.round(1000000 / fastSecondsPerKm) });
  } else if (target?.kind === 'power') {
   Object.assign(data, { targetType: 'power', customTargetValueLow: target.lowWatts + 1000, customTargetValueHigh: target.highWatts + 1000 });
  } else if (target?.kind === 'rpe') {
   data.notes = (prescription.targetLabel(target)+' · '+data.notes).slice(0, 100);
  } else if (target && target.kind !== 'open') throw Error('Invalid step target');
  encoder.onMesg(messages.WORKOUT_STEP, data);
 }
 return encoder.close();
}
