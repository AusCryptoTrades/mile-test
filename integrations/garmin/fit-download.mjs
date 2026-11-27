import {notification,readBounded} from './fit-contract.mjs';
// Garmin OAuth2PKCE §4: use an unexpired user access token for API requests.
export async function downloadFit(n,token,fetcher=fetch){
 const validated=notification(n);
 if(!validated)throw Error('FIT_CALLBACK_INVALID');
 if(typeof token!=='string'||!token||/\s/.test(token))throw Error('FIT_AUTH_REQUIRED');
 const res=await fetcher(validated.url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/octet-stream',Authorization:'Bearer '+token}});
 if(res.status===410)throw Error('FIT_URL_CONSUMED');
 if(!res.ok)throw Error('FIT_HTTP_'+res.status);
 return readBounded(res);
}
export async function getFitAccessToken(sql,owner,identity,credentials,fetcher=fetch){
 return sql.begin(async tx=>{
  await tx.unsafe("select pg_advisory_xact_lock(hashtext('mile_garmin_refresh'),hashtext($1))",[owner]);
  const rows=await tx.unsafe("select access_token,refresh_token,expires_at from private.mile_garmin_connections where user_id=$1 and garmin_user_id=$2 for update",[owner,identity]);
  if(rows.length!==1)throw Error('FIT_AUTH_REQUIRED');
  const row=rows[0];
  if(typeof row.access_token==='string'&&row.access_token&&new Date(row.expires_at).getTime()>Date.now()+60000)return row.access_token;
  if(!row.refresh_token||!credentials?.id||!credentials?.secret)throw Error('FIT_AUTH_REQUIRED');
  const res=await fetcher('https://diauth.garmin.com/di-oauth2-service/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+btoa(credentials.id+':'+credentials.secret),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:row.refresh_token}).toString()});
  if(!res.ok)throw Error('FIT_TOKEN_REFRESH_FAILED');
  const t=await res.json();
  if(typeof t.access_token!=='string'||!t.access_token||typeof t.refresh_token!=='string'||!t.refresh_token||!Number.isFinite(Number(t.expires_in))||Number(t.expires_in)<=0)throw Error('FIT_TOKEN_REFRESH_FAILED');
  const expiry=new Date(Date.now()+Math.max(1,Number(t.expires_in)-600)*1000).toISOString();
  const updated=await tx.unsafe("update private.mile_garmin_connections set access_token=$1,refresh_token=$2,token_type=$3,scope=$4,expires_at=$5,updated_at=now() where user_id=$6 and garmin_user_id=$7 returning user_id",[t.access_token,t.refresh_token,String(t.token_type??'Bearer'),String(t.scope??''),expiry,owner,identity]);
  if(updated.length!==1)throw Error('FIT_AUTH_REQUIRED');
  return t.access_token;
 });
}
