// Read-only Garmin delivery diagnosis. Session and provider identity come from
// trusted server adapters; no token, response body, or remote owner ID is returned.
const id=v=>typeof v==='string'&&/^[1-9][0-9]{0,14}$/.test(v);
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export async function diagnoseGarminDelivery({authenticate,connection,garmin,workoutId,scheduleId,date}){
 if(!id(workoutId)||!id(scheduleId)||!validDate(date))throw Error('Invalid diagnostic identifiers');
 const athlete=await authenticate();
 if(!athlete?.id||!athlete.emailConfirmed||athlete.isAnonymous)throw Error('Authentication required');
 const linked=await connection(athlete.id);
 if(!linked||linked.athleteId!==athlete.id)throw Error('Garmin not connected');
 const identity=await garmin.identity(linked);
 if(typeof identity!=='string'||!identity)throw Error('Garmin identity unavailable');
 if(linked.garminIdentity&&linked.garminIdentity!==identity)throw Error('Garmin account changed');
 const permissions=await garmin.permissions(linked);
 if(!Array.isArray(permissions)||!permissions.includes('WORKOUT_IMPORT'))return {status:'permission_missing',identityBound:!!linked.garminIdentity,garminWrites:false};
 const checks=await Promise.allSettled([garmin.getWorkout(linked,workoutId),garmin.getSchedule(linked,scheduleId),garmin.listSchedules(linked,date,date)]);
 const read=i=>checks[i].status==='fulfilled'?checks[i].value:null;
 const w=read(0),s=read(1),range=read(2);
 const entries=Array.isArray(range)?range:Array.isArray(range?.schedules)?range.schedules:Array.isArray(range?.workoutSchedules)?range.workoutSchedules:null;
 const scheduleKey=o=>String(o?.scheduleId??o?.workoutScheduleId??o?.scheduledWorkoutId??'');
 const workoutMatches=String(w?.workoutId??'')===workoutId;
 const scheduleMatches=scheduleKey(s)===scheduleId&&String(s?.workoutId??'')===workoutId&&s?.date===date;
 const rangeMatches=entries===null?null:entries.some(e=>scheduleKey(e)===scheduleId&&String(e?.workoutId??'')===workoutId&&e?.date===date);
 const latest=await authenticate();
 if(latest?.id!==athlete.id||!latest.emailConfirmed||latest.isAnonymous)throw Error('Session changed');
 return {status:workoutMatches&&scheduleMatches&&rangeMatches===true?'api_verified':'inconclusive',identityBound:!!linked.garminIdentity,workoutMatches,scheduleMatches,rangeMatches,garminWrites:false,connectVisibility:'unverified',watchVisibility:'unverified'};
}
