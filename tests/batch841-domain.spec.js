const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const fn=html.slice(html.indexOf('async function mileGarminCheckAfterLogin(){'),html.indexOf('async function v4Connect(){'));
async function check(status,{prior='',outcome='',changeUser=false}={}){
 const values=new Map(prior?[['mile-garmin-onboarding-u',prior]]:[]),shown=[],notices=[];
 const ctx=vm.createContext({URLSearchParams,AbortSignal,location:{search:outcome?'?garmin='+outcome:'',pathname:'/',hash:''},history:{replaceState(){}},userId:'u',token:'t',localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},sbHeaders:()=>({}),MILE_GARMIN_FUNCTIONS:'https://example.invalid/',notice:x=>notices.push(x),v4Show:x=>shown.push(x),fetch:async()=>{if(changeUser)ctx.userId='other';if(status==='offline')throw Error('offline');return {ok:true,json:async()=>({status})}}});
 await vm.runInContext(fn+'\nmileGarminCheckAfterLogin()',ctx);return {shown,notices,values}
}
test('841 connected user on fresh domain skips Garmin onboarding',async()=>{const r=await check('authorised');expect(r.shown).toEqual([]);expect(r.values.get('mile-garmin-onboarding-u')).toBe('server-authorised')});
test('841 genuine new user sees onboarding and skipped user does not',async()=>{expect((await check('not_connected')).shown).toEqual(['connect']);expect((await check('not_connected',{prior:'skipped'})).shown).toEqual([])});
test('841 callback flag cannot falsely verify connection',async()=>{expect((await check('not_connected',{outcome:'connected'})).shown).toEqual(['connect'])});
test('841 offline or expired status does not force reconnect',async()=>{for(const s of ['offline','expired'])expect((await check(s)).shown).toEqual([])});
test('841 stale response cannot modify another session',async()=>{const r=await check('authorised',{changeUser:true});expect(r.values.size).toBe(0)});
test('841 backend state binds only approved destinations and preserves legacy',()=>{const a=fs.readFileSync('supabase/functions/garmin-oauth-start/index.ts','utf8'),b=fs.readFileSync('supabase/functions/garmin-oauth-callback/index.ts','utf8');expect(a).toContain('"https://app.milefitness.com.au"');expect(a).toContain('sha256(state)');expect(a).toContain('"app." : "legacy."');expect(b).toContain('delete from private.mile_garmin_oauth_states');expect(b.indexOf('target = state.startsWith')).toBeGreaterThan(b.indexOf('rows.length !== 1'));expect(b).toContain('target === "https://app.milefitness.com.au/" ? target : TEST_APP');expect(b).toContain('return redirect("connected", target)')});
