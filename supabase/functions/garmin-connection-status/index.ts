import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, OPTIONS","Cache-Control":"no-store","Vary":"Authorization"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return json({error:"Method not allowed"},405);
 const authorization=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(authorization))return json({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),db=Deno.env.get("SUPABASE_DB_URL");
 if(!url||!key||!db)return json({error:"Service unavailable"},503);
 let user;try{const r=await fetch(url+"/auth/v1/user",{headers:{Authorization:authorization,apikey:key},signal:AbortSignal.timeout(10000)});if(!r.ok)return json({error:"Invalid session"},401);user=await r.json()}catch{return json({error:"Authentication unavailable"},503)}
 if(typeof user?.id!=="string"||!user.id)return json({error:"Authentication required"},401);
 const sql=postgres(db,{max:1,idle_timeout:2,connect_timeout:5});
 try{const rows=await sql`select connected_at,expires_at from private.mile_garmin_connections where user_id=${user.id} order by connected_at desc nulls last limit 1`;const c=rows[0];return json({status:!c?"not_connected":c.expires_at&&new Date(c.expires_at).getTime()<=Date.now()?"expired":"authorised",connected_at:c?.connected_at??null,expires_at:c?.expires_at??null});}catch{return json({error:"Connection status unavailable"},503)}finally{await sql.end()}
});