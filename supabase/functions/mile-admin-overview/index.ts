import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, OPTIONS","Cache-Control":"no-store","Vary":"Authorization"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return json({error:"Method not allowed"},405);
 const authorization=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(authorization))return json({error:"Authentication required"},401);
 const days=Number(new URL(req.url).searchParams.get("days")??7);
 if(![7,30,90].includes(days))return json({error:"Unsupported date range"},400);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),db=Deno.env.get("SUPABASE_DB_URL");
 if(!url||!key||!db)return json({error:"Service unavailable"},503);
 // Do not trust a role supplied by the client or an unverified decoded JWT.
 try {
  const r=await fetch(url+"/auth/v1/user",{headers:{Authorization:authorization,apikey:key},signal:AbortSignal.timeout(10000)});
  if(!r.ok)return json({error:"Invalid session"},401);
  const user=await r.json();
  if(typeof user?.id!=="string"||!user.id)return json({error:"Invalid session"},401);
  if(user.app_metadata?.mile_role!=="admin")return json({error:"Administrator access required"},403);
 }catch{return json({error:"Authentication unavailable"},503)}
 const sql=postgres(db,{max:1,idle_timeout:2,connect_timeout:5});
 try{
  // The range is UTC calendar days including today. Counts never expose individual messages, routes, tokens or health records.
  const [metrics]=await sql`with period as (
   select (date_trunc('day',now() at time zone 'UTC')-make_interval(days=>${days}::int-1)) at time zone 'UTC' as start_at, now() as end_at
  ) select
   (select count(*)::int from public.av_members) as athletes,
   (select count(*)::int from public.av_members,period where joined_at>=start_at and joined_at<=end_at) as new_athletes,
   (select count(*)::int from private.mile_garmin_activities,period where started_at>=start_at and started_at<=end_at) as garmin_activities,
   (select count(distinct user_id)::int from private.mile_garmin_connections) as garmin_connections,
   (select coalesce(sum(case when jsonb_typeof(training_data->'blocks')='array' then jsonb_array_length(training_data->'blocks') else 0 end),0)::int from public.av_training_data) as saved_blocks,
   (select count(*)::int from public.mile_beta_reports where status in ('new','investigating')) as open_reports,
   (select count(*)::int from public.mile_beta_reports,period where created_at>=start_at and created_at<=end_at) as reports_received,
   (select count(*)::int from public.mile_social_activities,period where created_at>=start_at and created_at<=end_at and social_deleted is not true) as social_posts,
   (select count(*)::int from public.mile_messages,period where created_at>=start_at and created_at<=end_at and deleted_at is null) as messages,
   (select count(*)::int from public.mile_challenges where starts_at<=now() and ends_at>now()) as active_challenges,
   (select count(*)::int from public.mile_premium_members where is_active is true) as premium_members,
   (select max(received_at) from private.mile_garmin_webhook_events) as last_garmin_webhook_at,
   (select count(*)::int from public.av_training_data,period where updated_at>=start_at and updated_at<=end_at) as accounts_with_training_sync,
   (select start_at from period) as range_start,
   (select end_at from period) as range_end`;
  const growth=await sql`with dates as (
   select generate_series((now() at time zone 'UTC')::date-${days}::int+1,(now() at time zone 'UTC')::date,interval '1 day')::date as day
  ) select to_char(day,'YYYY-MM-DD') as day,
   (select count(*)::int from public.av_members where joined_at < ((day+1)::timestamp at time zone 'UTC') and joined_at<=now()) as total,
   (select count(*)::int from public.av_members where joined_at >= (day::timestamp at time zone 'UTC') and joined_at < ((day+1)::timestamp at time zone 'UTC') and joined_at<=now()) as joined
   from dates order by day`;
  return json({days,timezone:"UTC",metrics,growth,generated_at:new Date().toISOString()});
 }catch{return json({error:"Overview metrics unavailable"},503)}finally{await sql.end()}
});
