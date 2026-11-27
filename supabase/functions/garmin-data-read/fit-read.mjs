// Read only verified, owner-bound FIT laps. Existing Garmin details remain authoritative for samples.
export const FIT_LAPS_QUERY="select j.laps from private.mile_fit_jobs j join private.mile_garmin_activities a on a.user_id=j.user_id and a.garmin_activity_id=j.activity_id join private.mile_garmin_connections c on c.user_id=j.user_id and c.garmin_user_id=j.garmin_user_id where j.user_id=$1 and j.activity_id=$2 and j.state='ready' and abs(extract(epoch from a.started_at)-j.start_epoch)<=5 limit 1";
export async function withFitLaps(sql,owner,activityId,raw){
 if(typeof owner!=='string'||!/^[0-9a-f-]{36}$/i.test(owner)||!/^\d{5,20}$/.test(String(activityId)))return raw;
 try{
  const rows=await sql.unsafe(FIT_LAPS_QUERY,[owner,String(activityId)]);
  const laps=rows[0]?.laps;
  if(!Array.isArray(laps)||!laps.length||laps.length>1000)return raw;
  const clean=laps.map(l=>({
    startTimeInSeconds:l.startTimeInSeconds,endTimeInSeconds:l.endTimeInSeconds,
    durationInSeconds:l.durationInSeconds,distanceInMeters:l.distanceInMeters,
    intensity:['active','interval','recovery','rest','warmup','cooldown'].includes(l.intensity)?l.intensity:null,
    workoutStepIndex:Number.isInteger(l.workoutStepIndex)?l.workoutStepIndex:null,
    averageHeartRateInBeatsPerMinute:typeof l.averageHeartRateInBeatsPerMinute==='number'?l.averageHeartRateInBeatsPerMinute:null,
    maxHeartRateInBeatsPerMinute:typeof l.maxHeartRateInBeatsPerMinute==='number'?l.maxHeartRateInBeatsPerMinute:null
  }));
  if(clean.some(l=>![l.startTimeInSeconds,l.endTimeInSeconds,l.durationInSeconds,l.distanceInMeters].every(Number.isFinite)||l.durationInSeconds<=0||l.distanceInMeters<0||l.endTimeInSeconds<=l.startTimeInSeconds))return raw;
  return {...(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}),laps:clean,lapSource:'garmin-fit'};
 }catch{
  // Fail open to existing authorized detail, never to another user's data.
  return raw;
 }
}
