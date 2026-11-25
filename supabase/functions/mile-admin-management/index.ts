import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, PATCH, OPTIONS","Cache-Control":"no-store","Vary":"Authorization"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const statuses=["new","investigating","fixed","verified"];
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(!["GET","PATCH"].includes(req.method))return json({error:"Method not allowed"},405);
 const authorization=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(authorization))return json({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),db=Deno.env.get("SUPABASE_DB_URL");
 if(!url||!key||!db)return json({error:"Service unavailable"},503);
 try{const r=await fetch(url+"/auth/v1/user",{headers:{Authorization:authorization,apikey:key},signal:AbortSignal.timeout(10000)});if(!r.ok)return json({error:"Invalid session"},401);const user=await r.json();if(!user?.id)return json({error:"Invalid session"},401);if(user.app_metadata?.mile_role!=="admin")return json({error:"Administrator access required"},403)}catch{return json({error:"Authentication unavailable"},503)}
 const params=new URL(req.url).searchParams,view=params.get("view");
 if(!["athletes","feedback"].includes(view||""))return json({error:"Unknown view"},400);
 const sql=postgres(db,{max:1,idle_timeout:2,connect_timeout:5});
 try{
  if(req.method==="PATCH"){
   if(view!=="feedback")return json({error:"Method not allowed"},405);
   let body;try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
   const {id,status,expected_status}=body??{};
   if(typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!statuses.includes(status)||!statuses.includes(expected_status))return json({error:"Invalid report status update"},400);
   const rows=await sql`update public.mile_beta_reports set status=${status},updated_at=now() where id=${id}::uuid and status=${expected_status} returning id,status,updated_at`;
   if(!rows.length)return json({error:"Report changed or no longer exists. Refresh and retry."},409);
   return json({report:rows[0]});
  }
  const offset=Number(params.get("offset")??0),limit=25;
  const search=(params.get("q")||"").trim().slice(0,100).toLowerCase();
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:"Invalid offset"},400);
  if(view==="athletes"){
   const filter=params.get("filter")||"all";
   if(!["all","garmin","no_garmin","premium"].includes(filter))return json({error:"Unknown filter"},400);
   const rows=await sql`with members as (
    select m.user_id,m.joined_at,p.username,p.display_name,p.primary_sport,t.updated_at as last_training_sync,
    exists(select 1 from private.mile_garmin_connections c where c.user_id=m.user_id) as garmin,
    exists(select 1 from public.mile_premium_members pm where pm.user_id=m.user_id and pm.is_active) as premium,
    (select count(*)::int from private.mile_garmin_activities a where a.user_id=m.user_id and a.started_at>=now()-interval '30 days' and a.started_at<=now()) as activities_30d
    from public.av_members m left join public.mile_profiles p on p.user_id=m.user_id left join public.av_training_data t on t.user_id=m.user_id
   ) select * from members where
   (${search}='' or strpos(lower(coalesce(display_name,'')),${search})>0 or strpos(lower(coalesce(username,'')),${search})>0)
   and (${filter}='all' or (${filter}='garmin' and garmin) or (${filter}='no_garmin' and not garmin) or (${filter}='premium' and premium))
   order by joined_at desc nulls last,user_id limit ${limit+1} offset ${offset}`;
   return json({rows:rows.slice(0,limit),has_more:rows.length>limit});
  }
  const kind=params.get("kind")||"all",filter=params.get("status")||"all";
  if(!["all","bug","feedback"].includes(kind)||!["all",...statuses].includes(filter))return json({error:"Unknown filter"},400);
  const rows=await sql`select r.id,r.kind,r.page,r.description,r.status,r.created_at,r.updated_at,r.device_info,r.app_version,p.display_name,p.username
   from public.mile_beta_reports r left join public.mile_profiles p on p.user_id=r.reporter_id
   where (${kind}='all' or r.kind=${kind}) and (${filter}='all' or r.status=${filter})
   and (${search}='' or strpos(lower(coalesce(r.page,'')),${search})>0 or strpos(lower(coalesce(r.description,'')),${search})>0)
   order by r.created_at desc,r.id limit ${limit+1} offset ${offset}`;
  const counts=await sql`select status,count(*)::int as count from public.mile_beta_reports group by status`;
  return json({rows:rows.slice(0,limit),has_more:rows.length>limit,counts});
 }catch{return json({error:"Admin data unavailable"},503)}finally{await sql.end()}
});
