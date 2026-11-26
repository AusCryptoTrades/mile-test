// Request-local only: never share identity/permission evidence between athletes,
// access tokens, requests, or long-running jobs. Failed reads are not cached.
export function requestCheck(read,{ttlMs=5000,now=Date.now}={}){
 let value,expires=0,pending=null,hasValue=false;
 return async()=>{
  if(hasValue&&now()<expires)return value;
  if(pending)return pending;
  pending=(async()=>{try{value=await read();hasValue=true;expires=now()+ttlMs;return value}finally{pending=null}})();
  return pending;
 };
}
export function retryDelaySeconds(header,now=Date.now()){
 const raw=String(header??'').trim();
 let seconds=raw&&/^\d+$/.test(raw)?Number(raw):raw?(Date.parse(raw)-now)/1000:NaN;
 // A missing or invalid Retry-After is treated conservatively as one minute.
 return Number.isFinite(seconds)?Math.max(1,Math.ceil(seconds)):60;
}
