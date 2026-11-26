import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
const origins=new Set(["https://app.milefitness.com.au","https://auscryptotrades.github.io"]);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://app.milefitness.com.au","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Cache-Control":"no-store","Vary":"Origin, Authorization","Content-Type":"application/json"};
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return json({error:"Origin denied"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(!["GET","POST"].includes(req.method))return json({error:"Method not allowed"},405);
 const authorization=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(authorization))return json({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),db=Deno.env.get("SUPABASE_DB_URL");
 if(!url||!key||!db)return json({error:"Service unavailable"},503);
 try{
 const auth=await fetch(url+"/auth/v1/user",{headers:{Authorization:authorization,apikey:key},signal:AbortSignal.timeout(10000)});
 if(!auth.ok)return json({error:"Invalid session"},401);
 const user=await auth.json();if(!user.id||user.app_metadata?.mile_role!=="admin")return json({error:"Administrator access required"},403);
 }catch{return json({error:"Authentication unavailable"},503)}
 const sql=postgres(db,{max:1,idle_timeout:2,connect_timeout:5});
 try{
 if(req.method==="GET"){
 const raw=new URL(req.url).searchParams.get("offset")||"0";const offset=Number(raw);
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:"Invalid page"},400);
 const rows=await sql`select i.id::text,i.label,i.max_uses,i.used_count,i.enabled,i.created_at,i.expires_at,i.recipient_email,
 (select coalesce(json_agg(x),'[]'::json) from (select m.user_id,m.joined_at from public.av_members m where m.invite_id=i.id order by m.joined_at desc limit 100) x) redemptions
 from public.av_invite_codes i order by i.id desc limit 26 offset ${offset}`;
 return json({rows:rows.slice(0,25),has_more:rows.length>25});
 }
 let body;try{body=await req.json()}catch{return json({error:"Invalid request"},400)}
 if(body?.action==="create"){
 const label=typeof body.label==="string"?body.label.trim():"";const max=body.max_uses;const days=body.days;
 const email=typeof body.recipient_email==="string"?body.recipient_email.trim().toLowerCase():"";
 if(!label||label.length>100||!Number.isInteger(max)||max<1||max>100||!Number.isInteger(days)||days<1||days>365||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return json({error:"Invalid invitation details"},400);
 const code=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,"0")).join("").toUpperCase();
 const [row]=await sql`insert into public.av_invite_codes(code_hash,label,max_uses,used_count,enabled,expires_at,recipient_email) values(extensions.crypt(${code},extensions.gen_salt('bf',10)),${label},${max},0,true,now()+make_interval(days=>${days}::int),${email||null}) returning id::text`;
 return json({id:row.id,code},201);
 }
 if(body?.action==="revoke"&&typeof body.id==="string"&&/^\d{1,18}$/.test(body.id)){
 const rows=await sql`update public.av_invite_codes set enabled=false where id=${body.id}::bigint returning id::text`;
 return rows.length?json({ok:true}):json({error:"Invitation not found"},404);
 }
 return json({error:"Invalid action"},400);
 }catch{return json({error:"Invitation service unavailable"},503)}finally{await sql.end()}
});