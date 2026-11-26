// Batch 87 isolated read-only adapter. Existing production push is untouched.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import {createAuthenticatedPublisher} from "./authenticated-publisher.mjs";
import {createPostgresPublicationRegistry} from "./postgres-registry.mjs";
import {buildGarminRunningWorkout} from "./training-payload.mjs";
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
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body) }),
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
const validDate=(s:any)=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const fixture={sport:"running",name:"MILE TEST - 28 NOV",description:"Controlled delivery test; no actual run required.",steps:[{kind:"step",intensity:"warmup",duration:{kind:"time",seconds:120}},{kind:"step",intensity:"active",duration:{kind:"time",seconds:360}},{kind:"step",intensity:"cooldown",duration:{kind:"time",seconds:120}}]};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"POST required"},405);
 if(!DB_URL||!SUPABASE_URL||!ANON_KEY||!CLIENT_ID||!CLIENT_SECRET)return reply({error:"Configuration unavailable"},503);
 const auth=req.headers.get("Authorization")??"";
 if(!/^Bearer\s+\S+$/i.test(auth))return reply({error:"Authentication required"},401);
 let input:any;try{input=await req.json()}catch{return reply({error:"Invalid JSON"},400)}
 if(!["connection","date_readback","preview_controlled","preview_session"].includes(input?.action))return reply({error:"Publishing disabled"},403);
 if(input.action==="date_readback"&&!validDate(input.date))return reply({error:"Valid date required"},400);
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
  if(!await isMember(userId))return reply({error:"MILE membership required"},403);
  const loadConnection=async(id:string)=>{
   if(id!==userId)return null;
   const rows=await sql`select garmin_user_id from private.mile_garmin_connections where user_id=${id}`;
   return rows.length===1?{athleteId:id,garminIdentity:rows[0].garmin_user_id}:null;
  };
  const connection=await loadConnection(userId);if(!connection)return reply({error:"Garmin not connected"},409);
  const token=await getToken(sql,userId);
  const identity=async()=>{const v=await garminRequest(GARMIN_USER_ID_URL,token);if(!v.ok||!v.data?.userId)throw Error("GARMIN_IDENTITY_UNAVAILABLE");return String(v.data.userId)};
  const permissions=async()=>{const v=await garminRequest(PERMISSIONS_URL,token);if(!v.ok||!Array.isArray(v.data?.permissions))throw Error("GARMIN_PERMISSIONS_UNAVAILABLE");return v.data.permissions};
  const liveIdentity=await identity(),granted=(await permissions()).includes("WORKOUT_IMPORT"),bound=!!connection.garminIdentity,match=bound?connection.garminIdentity===liveIdentity:null;
  const common={identityBound:bound,identityMatches:match,workoutImport:granted,garminWrites:false,connectVisibility:"unverified",watchVisibility:"unverified"};
  if(input.action==="connection")return reply(common);
  if(match===false||!granted)return reply({...common,error:"Account identity or permission requires review"},409);
  if(input.action==="date_readback"){
   const url=new URL("https://apis.garmin.com/training-api/schedule");url.searchParams.set("startDate",input.date);url.searchParams.set("endDate",input.date);
   const res=await garminRequest(url.toString(),token);
   const items=Array.isArray(res.data)?res.data:Array.isArray(res.data?.schedules)?res.data.schedules:Array.isArray(res.data?.workoutSchedules)?res.data.workoutSchedules:null;
   return reply({...common,date:input.date,garminStatus:res.status,readbackOk:res.ok,entryCount:res.ok&&items?items.length:null},res.ok?200:502);
  }
  if(input.action==="preview_controlled")return reply({...common,date:"2026-11-28",payload:buildGarminRunningWorkout(fixture),publishingEnabled:false});
  const blocked=async()=>{throw Error("Publishing disabled")};
  const garmin={identity,permissions,create:blocked,schedule:blocked,getWorkout:blocked,getSchedule:blocked};
  const registry=createPostgresPublicationRegistry((q:string,params:any[])=>sql.unsafe(q,params));
  // Controlled preview currently uses Melbourne; universal release requires athlete timezone.
  const localDate=async()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Melbourne",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const app=createAuthenticatedPublisher({authenticate,isMember,loadConnection,garmin,registry,localDate,loadTrainingData:async(id:string)=>{
   if(id!==userId)return null;
   const rows=await sql`select user_id,training_data from public.av_training_data where user_id=${id}`;
   return rows.length===1?rows[0]:null;
  }});
  return reply({...common,...await app.preview(input.sessionId),publishingEnabled:false});
 }catch(e){
  const msg=e instanceof Error?e.message:"";
  if(msg==="AUTH_REQUIRED")return reply({error:"Confirmed MILE session required"},401);
  if(["NOT_CONNECTED","RECONNECT_REQUIRED"].includes(msg))return reply({error:"Reconnect Garmin"},409);
  return reply({error:"Diagnostic or preview could not complete",garminWrites:false},409);
 }finally{await sql.end()}
});
