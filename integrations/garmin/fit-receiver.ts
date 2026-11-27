// Isolated Activity Files endpoint. Deploy only after schema, tests and drain scheduling.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import * as sdk from "npm:@garmin/fitsdk@21.222.0";
import {Buffer} from "node:buffer";
import {notification,readBounded} from "./fit-contract.mjs";
import {decodeActivity} from "./fit-decoder.mjs";
import {downloadFit,getFitAccessToken} from "./fit-download.mjs";
const DB=Deno.env.get("SUPABASE_DB_URL"),SECRET=Deno.env.get("MILE_GARMIN_WEBHOOK_SECRET");
const BASE=Deno.env.get("SUPABASE_URL"),ANON=Deno.env.get("SUPABASE_ANON_KEY");
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"GET, OPTIONS","Cache-Control":"no-store","Vary":"Authorization"};
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
const enc=new TextEncoder(),dec=new TextDecoder();
const digest=(s:string)=>crypto.subtle.digest("SHA-256",enc.encode(s));
async function authorized(path:string){
 if(!SECRET)return false;
 const prefix=path.startsWith("/functions/v1/garmin-fit-files/")?"/functions/v1/garmin-fit-files/":path.startsWith("/garmin-fit-files/")?"/garmin-fit-files/":null;
 if(!prefix)return false;
 const value=path.slice(prefix.length).replace(/\/drain$/,"");
 const a=new Uint8Array(await digest(value)),b=new Uint8Array(await digest(SECRET));let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
async function key(){return crypto.subtle.importKey("raw",await digest("MILE FIT queue v1:"+SECRET),"AES-GCM",false,["encrypt","decrypt"])}
const aad=(owner:string,id:string)=>enc.encode(owner+":"+id);
async function seal(value:string,owner:string,id:string){const iv=crypto.getRandomValues(new Uint8Array(12));const out=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad(owner,id)},await key(),enc.encode(value)));return Buffer.concat([iv,out]).toString("base64")}
async function unseal(value:string,owner:string,id:string){const b=Buffer.from(value,"base64");return dec.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:b.subarray(0,12),additionalData:aad(owner,id)},await key(),b.subarray(12)))}
const client=()=>postgres(DB!,{max:1,idle_timeout:2,connect_timeout:5});
async function enqueue(items:unknown[]){
 const sql=client();
 try{return await sql.begin(async tx=>{
  let accepted=0;
  for(const item of items){
   const n=notification(item);if(!n)continue;
   const owners=await tx.unsafe("select user_id from private.mile_garmin_connections where garmin_user_id=$1 limit 2",[n.garminUserId]);
   if(owners.length!==1)continue;
   const owner=String(owners[0].user_id),encrypted=await seal(n.url,owner,n.activityId);
   const rows=await tx.unsafe("insert into private.mile_fit_jobs(user_id,activity_id,garmin_user_id,summary_id,start_epoch,encrypted_callback) values($1,$2,$3,$4,$5,$6) on conflict(user_id,activity_id) do update set encrypted_callback=excluded.encrypted_callback,state='pending',received_at=now(),claim_id=null,claimed_at=null,error_code=null where mile_fit_jobs.state='rejected' and mile_fit_jobs.error_code='RETRY_AUTHORIZED' and mile_fit_jobs.garmin_user_id=excluded.garmin_user_id and mile_fit_jobs.start_epoch=excluded.start_epoch and mile_fit_jobs.raw_fit is null returning activity_id",[owner,n.activityId,n.garminUserId,n.summaryId,n.start,encrypted]);
   accepted+=rows.length;
  }return accepted;
 })}finally{await sql.end()}
}
async function claim(sql:ReturnType<typeof client>){
 return await sql.begin(async tx=>{
  await tx.unsafe("select pg_advisory_xact_lock(875131)");
  await tx.unsafe("update private.mile_fit_jobs j set state='rejected',encrypted_callback=null,raw_fit=null,laps=null,claim_id=null,error_code='CONNECTION_REVOKED' where not exists (select 1 from private.mile_garmin_connections c where c.user_id=j.user_id and c.garmin_user_id=j.garmin_user_id) and j.state not in ('rejected','expired','uncertain')");

  await tx.unsafe("update private.mile_fit_jobs set state='expired',encrypted_callback=null,error_code='URL_EXPIRED' where state='pending' and received_at<now()-interval '23 hours'");
  await tx.unsafe("update private.mile_fit_jobs set state='uncertain',encrypted_callback=null,error_code='DOWNLOAD_INTERRUPTED' where state='downloading' and claimed_at<now()-interval '5 minutes'");
  await tx.unsafe("update private.mile_fit_jobs set state='downloaded',claim_id=null where state='decoding' and claimed_at<now()-interval '5 minutes' and raw_fit is not null");
  await tx.unsafe("update private.mile_fit_jobs set raw_fit=null,state='rejected',error_code='RAW_RETENTION_EXPIRED' where raw_fit is not null and received_at<now()-interval '24 hours' and (state<>'decoding' or claimed_at<now()-interval '5 minutes')");
  const limit=await tx.unsafe("select count(*)::int as count from private.mile_fit_jobs where download_claimed_at>now()-interval '1 minute'");
  const rows=await tx.unsafe("select j.* from private.mile_fit_jobs j join private.mile_garmin_connections c on c.user_id=j.user_id and c.garmin_user_id=j.garmin_user_id where j.state='downloaded' or (j.state='pending' and $1::boolean) order by case when j.state='downloaded' then 0 else 1 end,j.received_at limit 1 for update of j skip locked",[limit[0].count<45]);
  const j=rows[0];if(!j)return null;
  const mode=j.state==='downloaded'?'decoding':'downloading',id=crypto.randomUUID();
  await tx.unsafe("update private.mile_fit_jobs set state=$1,claim_id=$2,claimed_at=now(),download_claimed_at=case when $1='downloading' then now() else download_claimed_at end where user_id=$3 and activity_id=$4",[mode,id,j.user_id,j.activity_id]);
  return {...j,state:mode,claim_id:id};
 });
}
async function processOne(){
 const sql=client();
 try{
  const j=await claim(sql);if(!j)return false;
  const owner=String(j.user_id),activity=String(j.activity_id),claimId=String(j.claim_id);
  try{
   if(j.state==='downloading'){
    const url=await unseal(j.encrypted_callback,owner,activity);
    const n=notification({userId:j.garmin_user_id,activityId:activity,summaryId:j.summary_id,startTimeInSeconds:Number(j.start_epoch),fileType:"FIT",activityType:"RUNNING",callbackURL:url});
    if(!n)throw Error("FIT_CALLBACK_INVALID");
    const token=await getFitAccessToken(sql,owner,j.garmin_user_id,{id:Deno.env.get("GARMIN_CLIENT_ID"),secret:Deno.env.get("GARMIN_CLIENT_SECRET")});
    const bytes=await downloadFit({userId:j.garmin_user_id,activityId:activity,summaryId:j.summary_id,startTimeInSeconds:Number(j.start_epoch),fileType:"FIT",activityType:"RUNNING",callbackURL:url},token);
    await sql.unsafe("update private.mile_fit_jobs set raw_fit=$1,encrypted_callback=null,state='downloaded',claim_id=null,error_code=null where user_id=$2 and activity_id=$3 and claim_id=$4 and state='downloading'",[Buffer.from(bytes),owner,activity,claimId]);
   }else{
    const laps=decodeActivity(new Uint8Array(j.raw_fit),Number(j.start_epoch),sdk);
    const summaries=await sql.unsafe("select duration_seconds,distance_metres from private.mile_garmin_activities where user_id=$1 and garmin_activity_id=$2 and abs(extract(epoch from started_at)-$3::bigint)<=5",[owner,activity,j.start_epoch]);
    if(summaries.length!==1)throw Error("FIT_SUMMARY_NOT_READY");
    const expectedSeconds=Number(summaries[0].duration_seconds),expectedDistance=Number(summaries[0].distance_metres);
    const actualSeconds=laps.reduce((n,l)=>n+l.durationInSeconds,0),actualDistance=laps.reduce((n,l)=>n+l.distanceInMeters,0);
    if(!Number.isFinite(expectedSeconds)||expectedSeconds<=0||!Number.isFinite(expectedDistance)||expectedDistance<0||Math.abs(actualSeconds-expectedSeconds)>Math.max(5,expectedSeconds*.02)||Math.abs(actualDistance-expectedDistance)>Math.max(30,expectedDistance*.02))throw Error("FIT_SUMMARY_MISMATCH");
    await sql.unsafe("update private.mile_fit_jobs set laps=$1::jsonb,raw_fit=null,encrypted_callback=null,state='ready',claim_id=null,error_code=null where user_id=$2 and activity_id=$3 and claim_id=$4 and state='decoding'",[JSON.stringify(laps),owner,activity,claimId]);
   }
  }catch(e){
   const allowed=new Set(["FIT_SUMMARY_NOT_READY","FIT_SUMMARY_MISMATCH","FIT_AUTH_REQUIRED","FIT_TOKEN_REFRESH_FAILED","FIT_URL_CONSUMED","FIT_FETCH_FAILED","FIT_TOO_LARGE","FIT_TOO_SMALL","FIT_CALLBACK_INVALID","FIT_SIZE_INVALID","FIT_INTEGRITY_INVALID","FIT_DECODE_FAILED","FIT_NOT_SINGLE_RUNNING_ACTIVITY","FIT_ACTIVITY_MISMATCH","FIT_INVALID_LAP","FIT_INCOMPLETE_LAPS"]);
   const code=e instanceof Error&&(allowed.has(e.message)||/^FIT_HTTP_[1-5][0-9]{2}$/.test(e.message))?e.message:"FIT_PROCESS_FAILED";
   await sql.unsafe("update private.mile_fit_jobs set state='rejected',encrypted_callback=null,error_code=$1,claim_id=null where user_id=$2 and activity_id=$3 and claim_id=$4",[code,owner,activity,claimId]);
  }return true;
 }finally{await sql.end()}
}
async function drain(max=4){let processed=0;for(let i=0;i<max;i++){if(!await processOne())break;processed++}return processed}
async function control(schedulerToken?:string){
 const sql=client();
 try{
  const rows=await sql.unsafe("select enabled from private.mile_fit_control where id=1");
  if(rows.length!==1)throw Error("FIT_CONTROL_UNAVAILABLE");
  let authenticated=false;
  if(typeof schedulerToken==="string"&&/^[a-f0-9]{64}$/.test(schedulerToken)){
   const consumed=await sql.unsafe("delete from private.mile_fit_drain_tickets where token_hash=sha256(convert_to($1,'UTF8')) and expires_at>clock_timestamp() returning token_hash",[schedulerToken]);
   authenticated=consumed.length===1;
  }
  return {enabled:rows[0].enabled===true,authenticated};
 }finally{await sql.end()}
}
async function boundedJson(req:Request){
 const max=262144,len=req.headers.get("content-length");
 if(len!==null&&(!/^\d+$/.test(len)||Number(len)>max))throw Error("FIT_BODY_LIMIT");
 if(!req.body)throw Error("FIT_BAD_JSON");
 const reader=req.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error("FIT_BODY_LIMIT")}chunks.push(value)}}finally{reader.releaseLock()}
 try{return JSON.parse(dec.decode(Buffer.concat(chunks)))}catch{throw Error("FIT_BAD_JSON")}
}
async function ownerRead(req:Request){
 if(!BASE||!ANON)return response({error:"Not configured"},503);
 const auth=req.headers.get("Authorization")||"";if(!/^Bearer\s+\S+$/i.test(auth))return response({error:"Authentication required"},401);
 const id=new URL(req.url).searchParams.get("activityId");if(!id||!/^\d{5,20}$/.test(id))return response({error:"Invalid activity ID"},400);
 const res=await fetch(BASE+"/auth/v1/user",{headers:{Authorization:auth,apikey:ANON},signal:AbortSignal.timeout(8000)});
 if(!res.ok)return response({error:"Invalid session"},401);
 const owner=(await res.json()).id;if(typeof owner!=="string"||!/^[0-9a-f-]{36}$/i.test(owner))return response({error:"Invalid session"},401);
 const sql=client();try{
  const rows=await sql.unsafe("select j.laps from private.mile_fit_jobs j join private.mile_garmin_activities a on a.user_id=j.user_id and a.garmin_activity_id=j.activity_id join private.mile_garmin_connections c on c.user_id=j.user_id and c.garmin_user_id=j.garmin_user_id where j.user_id=$1 and j.activity_id=$2 and j.state='ready' and abs(extract(epoch from a.started_at)-j.start_epoch)<=5 limit 1",[owner,id]);
  return rows.length?response({source:"garmin-fit",activityId:id,laps:rows[0].laps}):response({error:"FIT intervals not available"},404);
 }finally{await sql.end()}
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(!DB||!SECRET)return response({error:"Not configured"},503);
 const path=new URL(req.url).pathname;
 try{
  if(req.method==="GET")return await ownerRead(req);
  if(req.method!=="POST")return response({error:"Method not allowed"},405);
  if(path==="/functions/v1/garmin-fit-files/drain"||path==="/garmin-fit-files/drain"){
   const status=await control(req.headers.get("x-mile-fit-drain")||"");
   if(!status.authenticated)return response({error:"Unauthorized"},401);
   const processed=status.enabled?await drain(4):0;
   return response({success:true,enabled:status.enabled,processed});
  }
  if(!await authorized(path))return response({error:"Unauthorized"},401);
  if(!(await control()).enabled)return response({error:"FIT delivery not activated"},503);
  if(!(req.headers.get("content-type")||"").includes("application/json"))return response({error:"Expected JSON"},415);
  let data;try{data=await boundedJson(req)}catch(e){return response({error:e instanceof Error&&e.message==="FIT_BODY_LIMIT"?"Too large":"Invalid JSON"},e instanceof Error&&e.message==="FIT_BODY_LIMIT"?413:400)}
  if(!Array.isArray(data?.activityFiles)||data.activityFiles.length>50)return response({error:"Invalid notification"},400);
  const accepted=await enqueue(data.activityFiles);
  EdgeRuntime.waitUntil(drain(4).catch(()=>console.error("FIT queue processing unavailable")));return response({success:true,accepted});
 }catch{return response({error:"FIT service unavailable"},503)}
});
