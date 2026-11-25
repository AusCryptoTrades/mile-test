import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Cache-Control":"no-store","Vary":"Authorization"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const uuid=(id:unknown)=>typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(!["GET","POST"].includes(req.method))return json({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(auth))return json({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),db=Deno.env.get("SUPABASE_DB_URL");
 if(!url||!key||!db)return json({error:"Service unavailable"},503);
 let actor:string;
 try{const r=await fetch(url+"/auth/v1/user",{headers:{Authorization:auth,apikey:key},signal:AbortSignal.timeout(10000)});if(!r.ok)return json({error:"Invalid session"},401);const u=await r.json();if(!uuid(u?.id))return json({error:"Invalid session"},401);if(u.app_metadata?.mile_role!=="admin")return json({error:"Administrator access required"},403);actor=u.id}catch{return json({error:"Authentication unavailable"},503)}
 const p=new URL(req.url).searchParams,view=p.get("view");
 if(!["announcements","security"].includes(view||""))return json({error:"Unknown view"},400);
 const sql=postgres(db,{max:1,idle_timeout:2,connect_timeout:5});
 try{
  if(req.method==="POST"){
   if(view!=="announcements")return json({error:"Method not allowed"},405);
   let body;try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
   if(body?.action==="draft"){
    const title=typeof body.title==="string"?body.title.trim():"",message=typeof body.body==="string"?body.body.trim():"",kind=body.kind;
    if(title.length<3||title.length>100||message.length<5||message.length>600||!["announcement","release"].includes(kind))return json({error:"Invalid title, message or kind"},400);
    const rows=await sql`with draft as (
      insert into private.mile_admin_announcements(title,body,kind,created_by) values(${title},${message},${kind},${actor}::uuid) returning id,status
     ), audit as (insert into private.mile_admin_audit(actor_id,action,target_id) select ${actor}::uuid,'announcement.draft',id from draft returning id)
     select draft.* from draft,audit`;
    return json({announcement:rows[0]},201);
   }
   if(body?.action!=="publish"||body.confirm!==true||!uuid(body.id))return json({error:"Explicit publication confirmation required"},400);
   // Atomic: lock/update draft once, create recipient notifications, record exact count, and audit. A retry cannot send twice.
   const result=await sql.begin(async tx=>{
    const drafts=await tx`select id,title,body,kind from private.mile_admin_announcements where id=${body.id}::uuid and status='draft' for update`;
    if(!drafts.length)return null;
    const d=drafts[0];
    const [sent]=await tx`with inserted as (insert into public.mile_app_notifications(recipient_id,actor_id,kind,entity_id,message)
      select distinct m.user_id,null::uuid,'announcement',${d.id}::text,${d.title+" — "+d.body} from public.av_members m join auth.users u on u.id=m.user_id returning id) select count(*)::int as recipients from inserted`;
    const [published]=await tx`update private.mile_admin_announcements set status='published',published_at=now(),recipient_count=${sent.recipients} where id=${d.id}::uuid returning id,status,published_at,recipient_count`;
    await tx`insert into private.mile_admin_audit(actor_id,action,target_id,detail) values(${actor}::uuid,'announcement.publish',${d.id}::uuid,jsonb_build_object('recipient_count',${sent.recipients}::int))`;
    return published;
   });
   return result?json({announcement:result}):json({error:"Draft no longer available; refresh before retrying"},409);
  }
  const offset=Number(p.get("offset")??0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:"Invalid offset"},400);
  if(view==="announcements"){
   const rows=await sql`select id,title,body,kind,status,created_at,published_at,recipient_count from private.mile_admin_announcements order by created_at desc,id limit 26 offset ${offset}`;
   const [audience]=await sql`select count(distinct m.user_id)::int as members from public.av_members m join auth.users u on u.id=m.user_id`;
   return json({rows:rows.slice(0,25),has_more:rows.length>25,audience:audience.members});
  }
  const [security]=await sql`select (select count(*)::int from auth.users where raw_app_meta_data->>'mile_role'='admin') as admin_accounts,
  (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity) as public_tables_without_rls,
  (select count(*)::int from private.mile_admin_audit) as recorded_admin_actions`;
  const rows=await sql`select a.id,a.action,a.target_id,a.detail,a.created_at,p.display_name,p.username from private.mile_admin_audit a left join public.mile_profiles p on p.user_id=a.actor_id order by a.created_at desc,a.id limit 26 offset ${offset}`;
  return json({security,rows:rows.slice(0,25),has_more:rows.length>25});
 }catch{return json({error:"Admin release or audit data unavailable"},503)}finally{await sql.end()}
});
