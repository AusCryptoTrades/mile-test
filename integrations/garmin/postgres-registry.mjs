// Server-only Postgres adapter. query(sql, parameters) must return an array of rows.
// Use a least-privileged server connection, never a browser/anon connection.
const transitions=Object.freeze({
 claimed:['creating'],creating:['created','create_uncertain'],
 created:['scheduling'],scheduling:['scheduled','schedule_uncertain'],
 scheduled:['verified']
});
const columns='athlete_id,garmin_identity,session_id,revision,scheduled_date::text as date,payload_sha256,operation_id,state,workout_id::text as workout_id,schedule_id::text as schedule_id';
const map=r=>r?({athleteId:r.athlete_id,garminIdentity:r.garmin_identity,sessionId:r.session_id,revision:r.revision,date:r.date,payloadSha256:r.payload_sha256,operationId:r.operation_id,state:r.state,workoutId:r.workout_id,scheduleId:r.schedule_id}):null;
export function createPostgresPublicationRegistry(query){
 if(typeof query!=='function')throw Error('Server query adapter required');
 return Object.freeze({
  async claim(r){
   const rows=await query('insert into private.mile_garmin_publications (athlete_id,garmin_identity,session_id,revision,scheduled_date,payload_sha256,operation_id) values ($1,$2,$3,$4,$5,$6,$7) on conflict (athlete_id,session_id) do nothing returning '+columns,[r.athleteId,r.garminIdentity,r.sessionId,r.revision,r.date,r.payloadSha256,r.operationId]);
   if(rows.length)return map(rows[0]);
   const existing=await query('select '+columns+' from private.mile_garmin_publications where athlete_id=$1 and session_id=$2',[r.athleteId,r.sessionId]);
   return map(existing[0]);
  },
  async transition(operationId,expected,patch){
   if(!Object.hasOwn(transitions,expected)||!transitions[expected].includes(patch?.state)||Object.keys(patch).some(k=>!['state','workoutId','scheduleId'].includes(k)))throw Error('Invalid publication transition');
   if((patch.state==='created')!==Boolean(patch.workoutId)||(patch.state==='scheduled')!==Boolean(patch.scheduleId))throw Error('Invalid remote ID transition');
   const rows=await query('update private.mile_garmin_publications set state=$3, workout_id=coalesce($4::bigint,workout_id), schedule_id=coalesce($5::bigint,schedule_id),updated_at=now() where operation_id=$1 and state=$2 returning '+columns,[operationId,expected,patch.state,patch.workoutId??null,patch.scheduleId??null]);
   return map(rows[0]);
  }
 });
}
