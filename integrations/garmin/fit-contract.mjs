// Garmin Activity API 2.1 §6.4. Pure, testable contract; no network or secrets.
const MAX_BYTES=10*1024*1024;
const allowed=new Set(['active','interval','rest','recovery','warmup','cooldown']);
const finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const epoch=x=>x instanceof Date&&Number.isFinite(x.getTime())?x.getTime()/1000:null;
export function notification(n){
 if(!n||typeof n!=='object'||typeof n.userId!=='string'||n.userId.length<1||n.userId.length>128||!/^\d{5,20}$/.test(String(n.activityId))||typeof n.summaryId!=='string'||!n.summaryId||n.summaryId.length>128||n.fileType!=='FIT'||String(n.activityType).toUpperCase()!=='RUNNING'||!finite(n.startTimeInSeconds,946684800,4102444800))return null;
 if(typeof n.callbackURL!=='string'||n.callbackURL.length>4096)return null;
 let u;try{u=new URL(n.callbackURL)}catch{return null}
 if(u.origin!=='https://apis.garmin.com'||u.username||u.password||u.hash||u.pathname!=='/wellness-api/rest/activityFile')return null;
 if([...u.searchParams.keys()].length!==2||u.searchParams.getAll('id').length!==1||u.searchParams.getAll('token').length!==1||!u.searchParams.get('id')||!u.searchParams.get('token'))return null;
 return {garminUserId:n.userId,activityId:String(n.activityId),summaryId:n.summaryId,start:n.startTimeInSeconds,url:u.href};
}
export async function readBounded(response,max=MAX_BYTES){
 if(!response.ok||!response.body)throw Error('FIT_FETCH_FAILED');
 const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))throw Error('FIT_TOO_LARGE');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('FIT_TOO_LARGE')}chunks.push(value)}}finally{reader.releaseLock()}
 if(size<14)throw Error('FIT_TOO_SMALL');const out=new Uint8Array(size);let off=0;for(const x of chunks){out.set(x,off);off+=x.byteLength}return out;
}
export function normalizedLaps(messages,expectedStart){
 const sessions=messages?.sessionMesgs,laps=messages?.lapMesgs,ids=messages?.fileIdMesgs;
 if(!Array.isArray(ids)||ids.length!==1||ids[0].type!=='activity'||!Array.isArray(sessions)||sessions.length!==1||sessions[0].sport!=='running'||!Array.isArray(laps)||!laps.length||laps.length>1000)throw Error('FIT_NOT_SINGLE_RUNNING_ACTIVITY');
 const s=sessions[0],start=epoch(s.startTime),finish=epoch(s.timestamp);
 if(!finite(expectedStart,946684800,4102444800)||start===null||finish===null||Math.abs(start-expectedStart)>5||finish<=start||finish-start>604800)throw Error('FIT_ACTIVITY_MISMATCH');
 const steps=new Map(),dups=new Set();
 for(const w of messages.workoutStepMesgs||[]){if(!Number.isInteger(w.messageIndex)||w.messageIndex<0||w.messageIndex>1000)continue;if(steps.has(w.messageIndex))dups.add(w.messageIndex);else steps.set(w.messageIndex,w.intensity)}
 const label=v=>allowed.has(v)?v:null;
 let last=start;
 const rows=laps.map(l=>{
  const a=epoch(l.startTime),b=epoch(l.timestamp);
  if(a===null||b===null||a<last-1||a<start-1||b<=a||b>finish+1||!finite(l.totalTimerTime,.01,86400)||l.totalTimerTime>b-a+2||!finite(l.totalDistance,0,500000))throw Error('FIT_INVALID_LAP');
  last=b;
  const index=Number.isInteger(l.wktStepIndex)&&l.wktStepIndex>=0&&l.wktStepIndex<=1000?l.wktStepIndex:null;
  const step=index!==null&&!dups.has(index)?label(steps.get(index)):null,lap=label(l.intensity);
  // Ordinary active laps are not structured workout evidence. A conflicting explicit label remains unknown.
  const structured=index!==null||Boolean(lap&&lap!=='active');
  const compatible=step===lap||['active','interval'].includes(step)&&['active','interval'].includes(lap)||['rest','recovery'].includes(step)&&['rest','recovery'].includes(lap);
  const intensity=structured?(step&&lap&&!compatible?null:step||lap):null;
  return {startTimeInSeconds:a,endTimeInSeconds:b,durationInSeconds:l.totalTimerTime,distanceInMeters:l.totalDistance,intensity,workoutStepIndex:index,averageHeartRateInBeatsPerMinute:finite(l.avgHeartRate,1,250)?l.avgHeartRate:null,maxHeartRateInBeatsPerMinute:finite(l.maxHeartRate,1,250)?l.maxHeartRate:null};
 });
 if(Number.isInteger(s.numLaps)&&s.numLaps!==rows.length)throw Error('FIT_INCOMPLETE_LAPS');
 const total=rows.reduce((n,l)=>n+l.distanceInMeters,0),time=rows.reduce((n,l)=>n+l.durationInSeconds,0);
 if(!finite(s.totalDistance,0,500000)||Math.abs(total-s.totalDistance)>Math.max(20,s.totalDistance*.02)||!finite(s.totalTimerTime,.01,604800)||Math.abs(time-s.totalTimerTime)>Math.max(3,s.totalTimerTime*.02))throw Error('FIT_INCOMPLETE_LAPS');
 return rows;
}
export {MAX_BYTES};
