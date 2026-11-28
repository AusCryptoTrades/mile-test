import test from 'node:test';
import assert from 'node:assert/strict';
import { garminRouting } from '../../supabase/functions/_shared/garmin-routing.mjs';

const staging='https://fnyfeelynaozxtftrrga.supabase.co';
const production='https://mgixvokjlytjuypzcfzz.supabase.co';
test('Garmin beta uses only the approved staging callback and preview return origin',()=>{
 const preview='https://controlled-beta.example.pages.dev';
 const config=garminRouting(staging,preview);
 assert.equal(config.callback,staging+'/functions/v1/garmin-oauth-callback');
 assert.equal(config.prefix(preview),'beta.');
 assert.deepEqual([...config.origins],[preview]);
 assert.equal(config.returnTo('beta.fixture'),preview+'/');
 assert.equal(config.returnTo('app.fixture'),null);
 for(const denied of [undefined,'http://beta.pages.dev','https://beta.pages.dev@other.example',
  'https://beta.pages.dev/redirect','https://beta.pages.dev?ref=x','https://app.milefitness.com.au']) {
  assert.equal(garminRouting(staging,denied),null);
 }
});
test('production preserves its existing routing and never accepts a beta origin',()=>{
 const config=garminRouting(production,'https://controlled-beta.example.pages.dev');
 assert.equal(config.callback,production+'/functions/v1/garmin-oauth-callback');
 assert.deepEqual([...config.origins],['https://app.milefitness.com.au','https://auscryptotrades.github.io']);
 assert.equal(config.returnTo('app.fixture'),'https://app.milefitness.com.au/');
 assert.equal(config.returnTo('legacy.fixture'),'https://auscryptotrades.github.io/mile-test/');
 assert.equal(garminRouting('https://other.supabase.co','https://controlled-beta.example.pages.dev'),null);
});

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

function betaHandler(kind, member=true){
 const preview='https://approved-preview.mile-beta.pages.dev';
 const variables={SUPABASE_URL:staging,SUPABASE_ANON_KEY:'fixture',SUPABASE_DB_URL:'fixture',
  GARMIN_CLIENT_ID:'fixture',GARMIN_CLIENT_SECRET:'fixture',MILE_GARMIN_BETA_ORIGIN:preview};
 const source=readFileSync(new URL('../../supabase/functions/garmin-oauth-'+kind+'/index.ts',import.meta.url),'utf8')
  .replace(/^import .+;$/gm,'');
 let handler,providerCalls=0,states=0;
 const sql=async(parts)=>{
  if(parts[0].includes('from public.av_members'))return member?[{}]:[];
  if(parts[0].includes('insert into private.mile_garmin_oauth_states')){states++;return []}
  throw Error('Unexpected SQL');
 };
 sql.end=async()=>{};
 runInNewContext(stripTypeScriptTypes(source),{
  Deno:{env:{get:name=>variables[name]},serve:fn=>{handler=fn}},
  URL, Request, Response, Headers, URLSearchParams, TextEncoder, Uint8Array, crypto, btoa, garminRouting,
  postgres:()=>sql, createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'fixture',email_confirmed_at:'fixture'}}})}}),
  fetch:()=>{providerCalls++;throw Error('Unexpected provider request')},
 });
 return {handler,preview,states:()=>states,providerCalls:()=>providerCalls};
}
test('staging OAuth checks membership before creating a scoped pending authorization', async()=>{
 const request=origin=>new Request(staging+'/functions/v1/garmin-oauth-start',{
  method:'POST',headers:{origin,Authorization:'Bearer fixture'},
 });
 const denied=betaHandler('start',false);
 assert.equal((await denied.handler(request(denied.preview))).status,403);
 assert.equal(denied.states(),0);
 const allowed=betaHandler('start');
 assert.equal((await allowed.handler(request('https://app.milefitness.com.au'))).status,403);
 assert.equal(allowed.states(),0);
 const response=await allowed.handler(request(allowed.preview));
 assert.equal(response.status,200);
 const url=new URL((await response.json()).authorization_url);
 assert.equal(url.searchParams.get('redirect_uri'),staging+'/functions/v1/garmin-oauth-callback');
 assert.match(url.searchParams.get('state'),/^beta\./);
 assert.equal(allowed.states(),1);
});
test('staging rejects a production-state prefix and never returns to production', async()=>{
 const {handler,preview,providerCalls}=betaHandler('callback');
 const response=await handler(new Request(staging+'/functions/v1/garmin-oauth-callback?state=app.fixture&code=fixture&return=https://app.milefitness.com.au'));
 assert.equal(response.status,303);
 assert.equal(response.headers.get('location'),preview+'/?garmin=failed');
 assert.equal(providerCalls(),0);
});
