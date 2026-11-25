import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, OPTIONS","Cache-Control":"no-store","Vary":"Authorization"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return json({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(auth))return json({error:"Authentication required"},401);
 const days=Number(new URL(req.url).searchParams.get("days")??7);
 if(![7,30,90].includes(days))return json({error:"Unsupported date range"},400);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),db=Deno.env.get("SUPABASE_DB_URL");
 if(!url||!key||!db)return json({error:"Service unavailable"},503);
 try{const r=await fetch(url+"/auth/v1/user",{headers:{Authorization:auth,apikey:key},signal:AbortSignal.timeout(10000)});if(!r.ok)return json({error:"Invalid session"},401);const u=await r.json();if(typeof u?.id!=="string")return json({error:"Invalid session"},401);if(u.app_metadata?.mile_role!=="admin")return json({error:"Administrator access required"},403)}catch{return json({error:"Authentication unavailable"},503)}
 const sql=postgres(db,{max:1,idle_timeout:2,connect_timeout:5});
 try{
 const [usage]=await sql`with p as (select (date_trunc('day',now() at time zone 'UTC')-make_interval(days=>${days}::int-1)) at time zone 'UTC' as start_at, now() as end_at),
 recorded as (
 select user_id from private.mile_garmin_activities,p where started_at between start_at and end_at
 union select user_id from public.mile_social_activities,p where created_at between start_at and end_at and social_deleted is not true
 union select user_id from public.mile_activity_likes,p where created_at between start_at and end_at
 union select user_id from public.mile_activity_comments,p where created_at between start_at and end_at
 union select sender_id from public.mile_messages,p where created_at between start_at and end_at and deleted_at is null
 union select user_id from public.av_training_data,p where updated_at between start_at and end_at
 )
 select (select count(*)::int from recorded join public.av_members using(user_id)) as members_with_recorded_events,
 (select count(*)::int from public.av_members) as registered_members,
 (select count(*)::int from private.mile_garmin_activities,p where started_at between start_at and end_at) as garmin_activities,
 (select count(*)::int from public.mile_social_activities,p where created_at between start_at and end_at and social_deleted is not true) as posts,
 (select count(*)::int from public.mile_activity_likes,p where created_at between start_at and end_at) as likes,
 (select count(*)::int from public.mile_activity_comments,p where created_at between start_at and end_at) as comments,
 (select count(*)::int from public.mile_messages,p where created_at between start_at and end_at and deleted_at is null) as messages,
 (select count(*)::int from public.mile_challenge_entries,p where created_at between start_at and end_at) as challenge_entries,
 (select count(*)::int from public.av_training_data,p where updated_at between start_at and end_at) as accounts_with_latest_sync`;
 const trend=await sql`with dates as (select generate_series((now() at time zone 'UTC')::date-${days}::int+1,(now() at time zone 'UTC')::date,interval '1 day')::date as day)
 select to_char(day,'YYYY-MM-DD') as day,
 (select count(*)::int from private.mile_garmin_activities where started_at >= day::timestamp at time zone 'UTC' and started_at < (day+1)::timestamp at time zone 'UTC' and started_at<=now()) as garmin,
 (select count(*)::int from public.mile_social_activities where created_at >= day::timestamp at time zone 'UTC' and created_at < (day+1)::timestamp at time zone 'UTC' and created_at<=now() and social_deleted is not true) as posts
 from dates order by day`;
 const [health]=await sql`with p as (select (date_trunc('day',now() at time zone 'UTC')-make_interval(days=>${days}::int-1)) at time zone 'UTC' as start_at, now() as end_at)
 select (select count(distinct user_id)::int from private.mile_garmin_connections) as connection_records,
 (select count(*)::int from private.mile_garmin_connections where expires_at<=now()) as expired_token_records,
 (select count(*)::int from private.mile_garmin_connections where expires_at is null) as unknown_expiry_records,
 (select count(*)::int from private.mile_garmin_webhook_events,p where received_at between start_at and end_at) as webhook_events,
 (select max(received_at) from private.mile_garmin_webhook_events) as last_webhook,
 (select max(received_at) from private.mile_garmin_activities) as last_activity_received,
 (select max(updated_at) from public.av_training_data) as last_training_sync,
 (select count(*)::int from private.mile_garmin_activity_files,p where received_at between start_at and end_at) as activity_files`;
 const webhook_status=await sql`select coalesce(status,'unknown') as status,count(*)::int as count from private.mile_garmin_webhook_events where received_at>=((date_trunc('day',now() at time zone 'UTC')-make_interval(days=>${days}::int-1)) at time zone 'UTC') and received_at<=now() group by status order by status`;
 const file_status=await sql`select coalesce(processing_status,'unknown') as status,count(*)::int as count from private.mile_garmin_activity_files where received_at>=((date_trunc('day',now() at time zone 'UTC')-make_interval(days=>${days}::int-1)) at time zone 'UTC') and received_at<=now() group by processing_status order by processing_status`;
 return json({days,timezone:"UTC",usage,trend,health,webhook_status,file_status,generated_at:new Date().toISOString()});
 }catch{return json({error:"Analytics unavailable"},503)}finally{await sql.end()}
});
