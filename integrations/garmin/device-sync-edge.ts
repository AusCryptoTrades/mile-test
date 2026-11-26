// Batch 87.2 invited-member device sync. Separate from the controlled admin test.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import {createAuthenticatedPublisher} from "./authenticated-publisher.mjs";
import {createPostgresPublicationRegistry} from "./postgres-registry.mjs";
const DB_URL = Deno.env.get("SUPABASE_DB_URL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const CLIENT_ID = Deno.env.get("GARMIN_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GARMIN_CLIENT_SECRET");

const TOKEN_URL =
  "https://diauth.garmin.com/di-oauth2-service/oauth/token";

const PERMISSIONS_URL =
  "https://apis.garmin.com/partner-gateway/rest/user/permissions";

const WORKOUT_URL =
  "https://apis.garmin.com/workoutportal/workout/v2";

const SCHEDULE_URL =
  "https://apis.garmin.com/training-api/schedule/";

const WORKOUT_READ_URL =
  "https://apis.garmin.com/training-api/workout/v2/";

const GARMIN_USER_ID_URL =
  "https://apis.garmin.com/partner-gateway/rest/user/id";

const GARMIN_SCHEDULE_READ_URL =
  "https://apis.garmin.com/training-api/schedule/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function reply(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });
}

function basicAuth(id: string, secret: string): string {
  const bytes = new TextEncoder().encode(`${id}:${secret}`);
  let binary = "";

  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }

  return `Basic ${btoa(binary)}`;
}
async function garminRequest(
  url: string,
  token: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
) {
  if(method==="POST" && ![WORKOUT_URL,SCHEDULE_URL].includes(url))throw Error("Write route blocked");
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(method==="POST"?{"Content-Type":"application/json"}:{}),
    },
    ...(method==="POST"?{body:JSON.stringify(body)}:{}),
    signal: AbortSignal.timeout(20000),
  });

  const raw = await response.text();

  let parsed: any = null;

  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // Non-JSON response.
  }

  return {
    status: response.status,
    ok: response.ok,
    data: parsed,
  };
}
async function getToken(sql:any,userId:string){
 if(!CLIENT_ID||!CLIENT_SECRET)throw Error("CONFIG_UNAVAILABLE");
    return await sql.begin(async (tx) => {
      await tx`
        SELECT pg_advisory_xact_lock(
          hashtext('mile_garmin_refresh'),
          hashtext(${userId})
        )
      `;

      const rows = await tx`
        SELECT access_token, refresh_token, expires_at
        FROM private.mile_garmin_connections
        WHERE user_id = ${userId}
        LIMIT 1
      `;

      if (rows.length !== 1) {
        throw new Error("NOT_CONNECTED");
      }

      const row = rows[0];

      if (
        row.access_token &&
        row.expires_at &&
        new Date(row.expires_at).getTime() >
          Date.now() + 60000
      ) {
        return String(row.access_token);
      }

      if (!row.refresh_token) {
        throw new Error("RECONNECT_REQUIRED");
      }

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: String(row.refresh_token),
      });

      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuth(
            CLIENT_ID,
            CLIENT_SECRET,
          ),
          "Content-Type":
            "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 400 ||
            response.status === 401
            ? "RECONNECT_REQUIRED"
            : "TOKEN_REFRESH_FAILED",
        );
      }

      const t = await response.json();

      if (
        typeof t.access_token !== "string" ||
        !t.access_token ||
        typeof t.refresh_token !== "string" ||
        !t.refresh_token ||
        !Number.isFinite(Number(t.expires_in)) ||
        Number(t.expires_in) <= 0
      ) {
        throw new Error("TOKEN_REFRESH_FAILED");
      }

      const expiresAt = new Date(
        Date.now() +
          Math.max(1, Number(t.expires_in) - 600) *
            1000,
      );

      await tx`
        UPDATE private.mile_garmin_connections
        SET
          access_token = ${t.access_token},
          refresh_token = ${t.refresh_token},
          token_type = ${String(t.token_type ?? "Bearer")},
          scope = ${String(t.scope ?? "")},
          expires_at = ${expiresAt.toISOString()},
          updated_at = now()
        WHERE user_id = ${userId}
      `;

      return String(t.access_token);
    });
}

const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const remoteId=(v:unknown)=>/^[1-9][0-9]{0,14}$/.test(String(v??""));
const controlledId="87b00000-0000-4000-8000-000000000028";
const errorMessages=new Set(["Planned session unavailable","Structured session review required","Future or current local date required","A valid planned running session is required","Verified Garmin connection required","Garmin identity mismatch","Workout permission missing","Preview changed","Existing publication requires reconciliation","Publication already in progress","Explicit preview approval required","Session or approval changed","Authorization or session changed"]);
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"POST required"},405);
 if(!DB_URL||!SUPABASE_URL||!ANON_KEY||!CLIENT_ID||!CLIENT_SECRET)return reply({error:"Configuration unavailable"},503);
 const auth=req.headers.get("Authorization")??"";
 if(!/^Bearer\\s+\\S+$/i.test(auth))return reply({error:"Authentication required"},401);
 let input:any;try{input=await req.json()}catch{return reply({error:"Invalid JSON"},400)}
 if(!["status_session","preview_session","publish_session"].includes(input?.action)||!uuid(input.sessionId)||input.sessionId===controlledId)return reply({error:"Valid planned session required"},400);
 const sessionId=input.sessionId;
 let today:string;
 try{
  if(typeof input.timeZone!=="string"||input.timeZone.length>100)throw Error();
  today=new Intl.DateTimeFormat("en-CA",{timeZone:input.timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(today))throw Error();
 }catch{return reply({error:"Valid athlete timezone required"},400)}
 const horizon=new Date(today+"T00:00:00Z");horizon.setUTCDate(horizon.getUTCDate()+14);const lastDate=horizon.toISOString().slice(0,10);
 const sql=postgres(DB_URL,{max:2,idle_timeout:2,connect_timeout:5});
 try{
  const authenticate=async()=>{
   const r=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{Authorization:auth,apikey:ANON_KEY},signal:AbortSignal.timeout(10000),cache:"no-store"});
   if(!r.ok)throw Error("AUTH_REQUIRED");
   const u=await r.json();if(typeof u.id!=="string"||!u.email_confirmed_at||u.is_anonymous)throw Error("AUTH_REQUIRED");
   return {id:u.id,emailConfirmed:true,isAnonymous:false};
  };
  const user=await authenticate(),userId=user.id;
  const isMember=async(id:string)=>id===userId&&(await sql`select 1 from public.av_members where user_id=${id} limit 1`).length===1;
  if(!await isMember(userId))return reply({error:"MILE beta membership required"},403);
  const loadConnection=async(id:string)=>{
   if(id!==userId)return null;
   const rows=await sql`select garmin_user_id from private.mile_garmin_connections where user_id=${id}`;
   return rows.length===1?{athleteId:id,garminIdentity:rows[0].garmin_user_id}:null;
  };
  const connection=await loadConnection(userId);
  if(!connection?.garminIdentity)return reply({error:"Reconnect Garmin to verify your account identity"},409);
  const token=await getToken(sql,userId);
  const checked=async(url:string,method:"GET"|"POST"="GET",body?:unknown)=>{const r=await garminRequest(url,token,method,body);if(!r.ok)throw Error("Garmin request failed: "+r.status);return r.data};
  const identity=async()=>{const v=await checked(GARMIN_USER_ID_URL);if(!v?.userId)throw Error("GARMIN_IDENTITY_UNAVAILABLE");return String(v.userId)};
  const permissions=async()=>{const v=await checked(PERMISSIONS_URL);if(!Array.isArray(v?.permissions))throw Error("GARMIN_PERMISSIONS_UNAVAILABLE");return v.permissions};
  if(await identity()!==connection.garminIdentity)return reply({error:"Garmin account changed; reconnect before syncing"},409);
  if(!(await permissions()).includes("WORKOUT_IMPORT"))return reply({error:"Reconnect Garmin and approve workout import"},403);
  const findSchedule=async(id:string,date:string)=>{
   if(!remoteId(id))throw Error("Invalid workout ID");
   const url=new URL("https://apis.garmin.com/training-api/schedule");url.searchParams.set("startDate",date);url.searchParams.set("endDate",date);
   const d=await checked(url.toString());
   const items=Array.isArray(d)?d:Array.isArray(d?.schedules)?d.schedules:Array.isArray(d?.workoutSchedules)?d.workoutSchedules:null;
   if(!items)throw Error("Unknown Garmin calendar response");
   const matches=items.filter((x:any)=>String(x?.workoutId)===String(id)&&x?.date===date);
   if(matches.length!==1)return null;
   const x=matches[0];return {workoutId:String(x.workoutId),date:x.date,scheduleId:remoteId(x.scheduleId)?String(x.scheduleId):null};
  };
  const registry=createPostgresPublicationRegistry((q:string,params:any[])=>sql.unsafe(q,params));
  const getRecord=async()=>{
   const rows=await sql`select operation_id,state,scheduled_date::text as date,workout_id::text as workout_id,schedule_id::text as schedule_id,garmin_identity from private.mile_garmin_publications where athlete_id=${userId} and session_id=${sessionId}`;
   return rows[0]??null;
  };
  const summarize=async()=>{
   let record=await getRecord();if(!record)return {publicationState:"not_published",calendarMatch:null};
   if(record.garmin_identity!==connection.garminIdentity)return {publicationState:"account_changed",calendarMatch:null};
   let calendarMatch=null;
   if(record.workout_id&&["schedule_uncertain","scheduled","verified","delivery_confirmed"].includes(record.state)){
    try{
     const found=await findSchedule(record.workout_id,record.date);
     calendarMatch=!!found;
     if(found&&remoteId(found.scheduleId)&&record.state==="schedule_uncertain"){
      await registry.transition(record.operation_id,"schedule_uncertain",{state:"scheduled",scheduleId:found.scheduleId});
      record=await getRecord();
     }
    }catch{/* no retries or false confirmation */}
   }
   return {publicationState:record.state,date:record.date,workoutId:record.workout_id,scheduleId:record.schedule_id,calendarMatch,watchVisibility:"unverified"};
  };
  if(input.action==="status_session")return reply(await summarize());
  const garmin={identity,permissions,create:async(payload:unknown)=>checked(WORKOUT_URL,"POST",payload),schedule:async(id:string,date:string)=>{
   if(!remoteId(id)||date<today||date>lastDate)throw Error("Outside beta sync window");
   return checked(SCHEDULE_URL,"POST",{workoutId:Number(id),date});
  },findSchedule,getWorkout:async(id:string)=>checked(WORKOUT_READ_URL+encodeURIComponent(id)),getSchedule:async(id:string)=>checked(GARMIN_SCHEDULE_READ_URL+encodeURIComponent(id))};
  const app=createAuthenticatedPublisher({authenticate,isMember,loadConnection,garmin,registry,localDate:async()=>today,loadTrainingData:async(id:string)=>{
   if(id!==userId)return null;
   const rows=await sql`select user_id,training_data from public.av_training_data where user_id=${id}`;
   if(rows.length!==1)return null;
   const row=rows[0],workouts=row.training_data?.workouts;
   if(!Array.isArray(workouts))return null;
   // Only canonical sessions due in the next 14 days; never mutate the saved plan.
   return {user_id:row.user_id,training_data:{workouts:workouts.filter((w:any)=>w?.date>=today&&w.date<=lastDate)}};
  }});
  const existing=await getRecord();
  // In this manual beta, a previously started operation is never resumed by a new push.
  // Its outcome is read-only; automatic changes and retry policies are a later release.
  if(existing)return reply({error:"A publication already exists. Check Garmin sync status; do not resend.",...await summarize()},409);
  if(input.action==="preview_session")return reply({...await app.preview(sessionId),publishingEnabled:true});
  if(input.confirmed!==true||typeof input.approvedFingerprint!=="string")return reply({error:"Explicit preview approval required"},400);
  const record=await app.publish({sessionId,approvedFingerprint:input.approvedFingerprint,confirmed:true});
  return reply({...await summarize(),publicationState:record.state==="schedule_uncertain"?(await getRecord())?.state??record.state:record.state});
 }catch(e){
  const msg=e instanceof Error?e.message:"";
  if(msg==="AUTH_REQUIRED")return reply({error:"Confirmed MILE session required"},401);
  if(["NOT_CONNECTED","RECONNECT_REQUIRED"].includes(msg))return reply({error:"Reconnect Garmin"},409);
  return reply({error:errorMessages.has(msg)?msg:input.action==="publish_session"?"Publication outcome requires verification. Check sync status; do not resend.":"Garmin sync unavailable. Check the saved session and connection."},409);
 }finally{await sql.end()}
});
