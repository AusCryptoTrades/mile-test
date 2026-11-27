import { writeFileSync } from 'node:fs';
import { encodeRunningWorkoutFit } from './running-workout-fit.mjs';

export function controlledRunningCheck({ aboveBpm, belowBpm }) {
 if (!Number.isInteger(aboveBpm) || !Number.isInteger(belowBpm) || aboveBpm < 40 || belowBpm > 220 || aboveBpm >= belowBpm) {
  throw Error('Provide two athlete-confirmed, comfortable thresholds in bpm. Above must be lower than Below.');
 }
 const step = (intensity, description, duration) => ({ kind: 'step', intensity, description, duration, target: { kind: 'open' } });
 return { name: 'MILE step check', sport: 'running', steps: [
  step('warmup', 'Walk easily', { kind: 'time', seconds: 60 }),
  step('active', 'Walk or jog gently', { kind: 'distance', meters: 150 }),
  step('active', 'Continue at an easy effort', { kind: 'time', seconds: 45 }),
  step('recovery', 'Walk or stand. Lap after 90 sec if needed.', { kind: 'heart_rate', direction: 'below', bpm: belowBpm, fallbackSeconds: 90 }),
  step('rest', 'Press lap when ready', { kind: 'lap' }),
  step('active', 'Gentle movement only. Lap after 90 sec if needed.', { kind: 'heart_rate', direction: 'above', bpm: aboveBpm, fallbackSeconds: 90 }),
  step('cooldown', 'Easy walk', { kind: 'time', seconds: 30 }),
 ] };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
 const [output, aboveBpm, belowBpm] = process.argv.slice(2);
 if (!output?.endsWith('.fit')) throw Error('Usage: node integrations/garmin/controlled-running-check.mjs output.fit ABOVE_BPM BELOW_BPM');
 writeFileSync(output, encodeRunningWorkoutFit(controlledRunningCheck({ aboveBpm: Number(aboveBpm), belowBpm: Number(belowBpm) })), { flag: 'wx' });
}
