// Provider-neutral, local-only normalization and reconciliation primitives.
// No network, persistence or account credentials. Callers must enforce ownership.
export function normalizeWorkout(raw, accountId) {
  if(typeof accountId!=='string'||!accountId.trim())throw new Error('Account required');
  if(!['apple_health','garmin','coros'].includes(raw?.provider))throw new Error('Unknown provider');
  if(typeof raw.providerId!=='string'||!raw.providerId.trim())throw new Error('Provider ID required');
  const parse=value=>{if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('Invalid timestamp');return new Date(value).toISOString()};
  const startAt=parse(raw.startAt),endAt=parse(raw.endAt);
  if(Date.parse(endAt)<Date.parse(startAt))throw new Error('Invalid interval');
  const metric=(value,required=false)=>{if(value==null&&!required)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('Invalid metric');return value};
  const durationSeconds=metric(raw.durationSeconds,true),distanceMeters=metric(raw.distanceMeters);
  const sport=typeof raw.sport==='string'&&raw.sport.trim()?raw.sport.trim().toLowerCase():null;
  return {accountId,provider:raw.provider,providerId:raw.providerId,startAt,endAt,durationSeconds,distanceMeters,sport};
}
export function sourceKey(row){return JSON.stringify([row.accountId,row.provider,row.providerId])}
export function upsertWorkouts(existing,incoming,accountId){
  const map=new Map();
  for(const row of [...existing,...incoming]){
    if(row.accountId!==accountId)throw new Error('Account mismatch');
    map.set(sourceKey(row),row);
  }
  return [...map.values()];
}
// Candidate links only; never merge or delete source records automatically.
export function duplicateCandidates(rows){
  const result=[];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const a=rows[i],b=rows[j];
    if(a.accountId!==b.accountId||a.provider===b.provider||!a.sport||a.sport!==b.sport)continue;
    if(Math.abs(Date.parse(a.startAt)-Date.parse(b.startAt))>60_000)continue;
    if(Math.abs(a.durationSeconds-b.durationSeconds)>Math.max(30,Math.max(a.durationSeconds,b.durationSeconds)*.03))continue;
    if(a.distanceMeters==null||b.distanceMeters==null||Math.abs(a.distanceMeters-b.distanceMeters)>Math.max(50,Math.max(a.distanceMeters,b.distanceMeters)*.03))continue;
    result.push([sourceKey(a),sourceKey(b)]);
  }
  return result;
}
// Half-open UTC windows: callers must implement paginated source queries.
export function historicalWindows(from,to,maxDays=30){
  if(!Number.isInteger(maxDays)||maxDays<1||maxDays>30)throw new Error('Invalid window size');
  const a=Date.parse(from),b=Date.parse(to);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)throw new Error('Invalid date range');
  const result=[];for(let start=a;start<b;){const end=Math.min(b,start+maxDays*86400000);result.push({from:new Date(start).toISOString(),to:new Date(end).toISOString()});start=end;}
  return result;
}
// Persist the complete page before advancing the caller-owned checkpoint.
// Repeated writes must use idempotent source keys.
export async function commitPage({records,nextCursor,write,checkpoint}){
  await write(records);
  await checkpoint(nextCursor);
}
