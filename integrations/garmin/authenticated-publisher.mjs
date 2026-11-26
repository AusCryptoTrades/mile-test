// Server-only self-service authorization bridge. No caller-supplied athlete,
// tokens, dates, payload or provider identity can authorize a publication.
import {preparePlannedRunningSession} from './planned-session.mjs';
import {publishRunningSession} from './publisher.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v)))),b=>b.toString(16).padStart(2,'0')).join('');
// authenticate must verify the actual session with Supabase Auth; membership,
// training data and connection loaders must query by that verified athlete ID.
// garmin is a request-scoped server adapter bound to that same athlete.
export function createAuthenticatedPublisher({authenticate,isMember,loadTrainingData,loadConnection,garmin,registry,localDate}){
 async function resolve(sessionId){
  if(!uuid(sessionId))throw Error('Invalid session ID');
  const user=await authenticate();
  if(!uuid(user?.id)||!user.emailConfirmed||user.isAnonymous||!await isMember(user.id))throw Error('Confirmed MILE membership required');
  const row=await loadTrainingData(user.id);
  if(row?.user_id!==user.id||!Array.isArray(row.training_data?.workouts))throw Error('Training data unavailable');
  const matches=row.training_data.workouts.filter(w=>w?.id===sessionId);
  if(matches.length!==1||matches[0].matchId)throw Error('Planned session unavailable');
  const session=matches[0],prepared=preparePlannedRunningSession(session);
  if(prepared.status!=='preview_ready')throw Error('Structured session review required');
  const today=await localDate(user.id);
  if(typeof today!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(today)||prepared.date<today)throw Error('Future or current local date required');
  const linked=await loadConnection(user.id);
  if(linked?.athleteId!==user.id||typeof linked.garminIdentity!=='string'||!linked.garminIdentity)throw Error('Verified Garmin connection required');
  if(await garmin.identity()!==linked.garminIdentity)throw Error('Garmin identity mismatch');
  if(!(await garmin.permissions()).includes('WORKOUT_IMPORT'))throw Error('Workout permission missing');
  const revision=session.revision??1;
  if(!Number.isSafeInteger(revision)||revision<1)throw Error('Invalid revision');
  const fingerprint=await digest([user.id,linked.garminIdentity,sessionId,revision,prepared.date,prepared.payload]);
  return {athleteId:user.id,garminIdentity:linked.garminIdentity,sessionId,revision,date:prepared.date,workout:prepared.workout,payload:prepared.payload,fingerprint};
 }
 return Object.freeze({
  async preview(sessionId){
   const a=await resolve(sessionId);
   return {sessionId:a.sessionId,date:a.date,payload:a.payload,fingerprint:a.fingerprint,garminWrites:false};
  },
  async publish({sessionId,approvedFingerprint,confirmed}){
   if(confirmed!==true||typeof approvedFingerprint!=='string'||!/^[0-9a-f]{64}$/.test(approvedFingerprint))throw Error('Explicit preview approval required');
   const first=await resolve(sessionId);
   if(first.fingerprint!==approvedFingerprint)throw Error('Preview changed');
   return publishRunningSession({sessionId,garmin,registry,authorize:async id=>{
    const current=await resolve(id);
    if(current.athleteId!==first.athleteId||current.fingerprint!==approvedFingerprint)throw Error('Session or approval changed');
    return {...current,consented:true};
   }});
  }
 });
}
