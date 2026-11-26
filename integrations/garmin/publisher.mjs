// Server-worker contract. Never run in a browser with client-supplied ownership.
import {buildGarminRunningWorkout} from './training-payload.mjs';
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=256;
const remoteId=v=>{const s=String(v??'');if(!/^[1-9][0-9]{0,14}$/.test(s))throw Error('Unrecognized Garmin ID');return s};
const dateValid=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
// Dependencies are trusted server adapters. authorize must resolve a server-owned
// canonical session and current consent; Garmin identity must come from GET /user/id.
// Registry.claim is atomic; transition is compare-and-set scoped to operation_id.
export async function publishRunningSession({sessionId,authorize,garmin,registry}){
 if(!identifier(sessionId))throw Error('Invalid session');
 const a=await authorize(sessionId);
 if(!a?.consented||!identifier(a.athleteId)||!identifier(a.garminIdentity)||a.sessionId!==sessionId||!Number.isSafeInteger(a.revision)||a.revision<1||!dateValid(a.date))throw Error('Publishing not authorized');
 const identity=async()=>{const result=await garmin.identity();if(result!==a.garminIdentity)throw Error('Garmin account changed')};
 const recheck=async()=>{const current=await authorize(sessionId);if(!current?.consented||current.athleteId!==a.athleteId||current.garminIdentity!==a.garminIdentity||current.sessionId!==sessionId||current.revision!==a.revision||current.date!==a.date||await hash(buildGarminRunningWorkout(current.workout))!==fingerprint)throw Error('Authorization or session changed');await identity();if(!(await garmin.permissions()).includes('WORKOUT_IMPORT'))throw Error('Workout permission missing')};
 const payload=buildGarminRunningWorkout(a.workout),fingerprint=await hash(payload);
 await recheck();
 const key={athleteId:a.athleteId,garminIdentity:a.garminIdentity,sessionId};
 let record=await registry.claim({...key,revision:a.revision,date:a.date,payloadSha256:fingerprint,operationId:crypto.randomUUID(),state:'claimed'});
 if(!record||record.athleteId!==key.athleteId||record.garminIdentity!==key.garminIdentity||record.sessionId!==key.sessionId||record.revision!==a.revision||record.date!==a.date||record.payloadSha256!==fingerprint)throw Error('Existing publication requires reconciliation');
 const move=async(state,patch)=>{const next=await registry.transition(record.operationId,state,patch);if(!next)throw Error('Publication already in progress');record=next};
 // Never replay a POST after an ambiguous result or interruption.
 if(record.state==='claimed'){
  await recheck();await move('claimed',{state:'creating'});
  let id;try{id=remoteId((await garmin.create(payload))?.workoutId)}catch{await move('creating',{state:'create_uncertain'});return record}
  await move('creating',{state:'created',workoutId:id});
 }
 if(record.state==='created'){
  await recheck();await move('created',{state:'scheduling'});
  let id;try{id=remoteId((await garmin.schedule(record.workoutId,a.date))?.scheduleId)}catch{await move('scheduling',{state:'schedule_uncertain'});return record}
  await move('scheduling',{state:'scheduled',scheduleId:id});
 }
 if(record.state==='scheduled'){
  await recheck();
  const [w,s]=await Promise.all([garmin.getWorkout(record.workoutId),garmin.getSchedule(record.scheduleId)]);
  if(String(w?.workoutId)===record.workoutId&&String(s?.scheduleId)===record.scheduleId&&String(s?.workoutId)===record.workoutId&&s.date===a.date)await move('scheduled',{state:'verified'});
 }
 // verified = API readback only. No assertion of Connect or watch delivery.
 return record;
}
