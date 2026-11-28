// Staging-only authenticated transport. No live app wiring.
// The session supplier must return the current verified account and access token.
// Postgres derives ownership from auth.uid(); never send an owner in the payload.
export function createAppleTransport({baseUrl,anonKey,session,fetchImpl=fetch,signal}) {
 const url=new URL(baseUrl);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Invalid HTTPS backend URL');
 if(typeof anonKey!=='string'||!anonKey)throw Error('Missing public API key');
 if(anonKey.startsWith('sb_secret_'))throw Error('Secret keys prohibited');
 const verify=async accountId=>{
  const s=await session();
  if(signal?.aborted||!s||s.accountId!==accountId||typeof s.accessToken!=='string'||!s.accessToken)throw Error('Session unavailable or changed');
  return s.accessToken;
 };
 const request=async(accountId,path,options={})=>{
  const token=await verify(accountId);
  const response=await fetchImpl(url.origin+path,{...options,redirect:'error',cache:'no-store',signal,headers:{apikey:anonKey,Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers}});
  if(!response.ok)throw Error('Device sync request failed ('+response.status+')');
  await verify(accountId);
  return response;
 };
 const rpc=async (accountId,name,body)=>await (await request(accountId,'/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)})).json();
 return Object.freeze({
  commit(accountId,rows,deleted,epoch){
   return rpc(accountId,'mile_commit_apple_health_page',{p_epoch:epoch,p_rows:rows,p_deleted:deleted});
  },
  setConsent(accountId,enabled){return rpc(accountId,'mile_set_apple_health_consent',{p_enabled:enabled})},
  reviewOverlap(accountId,id,separate){
   return rpc(accountId,'mile_review_apple_health_overlap',{p_workout:id,p_separate:separate});
  },
  async status(accountId){
   const res=await request(accountId,'/rest/v1/mile_device_consents?provider=eq.apple_health&select=enabled,epoch,last_import_at');
   const rows=await res.json();await verify(accountId);
   return Array.isArray(rows)&&rows.length===1?rows[0]:null;
  },
  async history(accountId){
   const rows=[];
   for(let offset=0;;offset+=500){
    const res=await request(accountId,'/rest/v1/mile_device_workouts?provider=eq.apple_health&order=start_at.desc,provider_id&limit=500&offset='+offset);
    const page=await res.json();await verify(accountId);
    if(!Array.isArray(page)||page.length>500)throw Error('Workout history unavailable');
    rows.push(...page);
    if(page.length<500)return rows;
   }
  },
  async upsert(accountId,rows){
   if(!Array.isArray(rows)||rows.length>200)throw Error('Invalid workout batch');
   const allowed=new Set(['provider','provider_id','start_at','end_at','duration_seconds','distance_meters','sport']);
   for(const row of rows)if(!row||row.provider!=='apple_health'||Object.keys(row).some(k=>!allowed.has(k)))throw Error('Unexpected workout field');
   if(!rows.length)return;
   await request(accountId,'/rest/v1/mile_device_workouts?on_conflict=user_id,provider,provider_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});
  },
  async consented(accountId){
   const response=await request(accountId,'/rest/v1/mile_device_consents?provider=eq.apple_health&select=enabled');
   const rows=await response.json();
   await verify(accountId);
   return Array.isArray(rows)&&rows.length===1&&rows[0].enabled===true;
  }
 });
}
