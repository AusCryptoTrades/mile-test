const {test,expect}=require('@playwright/test');
const email='runner@example.test';
const identity={id:'00000000-0000-4000-8000-000000000001',email};
async function setup(page){
 const calls={verify:[],resend:0,member:0,training:0};
 let verified=false;
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url());
  if(u.origin==='http://127.0.0.1:4173')return r.continue();
  if(u.hostname!=='mgixvokjlytjuypzcfzz.supabase.co')return r.abort();
  const reply=(json,status=200)=>r.fulfill({status,json,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  if(u.pathname==='/auth/v1/token')return reply({error_code:'email_not_confirmed',message:'Email not confirmed'},400);
  if(u.pathname==='/auth/v1/verify'){
   const body=r.request().postDataJSON();calls.verify.push(body);
   if(body.token==='111111')return reply({error_code:'otp_expired',message:'Expired'},403);
   if(body.token==='222222')return reply({access_token:'fixture-session',user:identity});
   if(body.token!=='333333')return reply({message:'Invalid code'},403);
   verified=true;return reply({access_token:'fixture-session',user:{...identity,email_confirmed_at:'2026-11-20T00:00:00Z'}});
  }
  if(u.pathname==='/auth/v1/resend'){calls.resend++;return reply({});}
  if(u.pathname==='/auth/v1/user')return reply({...identity,email_confirmed_at:verified?'2026-11-20T00:00:00Z':null});
  if(u.pathname==='/rest/v1/av_members'){calls.member++;return reply([{user_id:identity.id}]);}
  if(u.pathname==='/rest/v1/av_training_data'){calls.training++;return reply([]);}
  if(u.pathname==='/functions/v1/garmin-connection-status')return reply({status:'not_connected'});
  if(u.pathname.startsWith('/rest/v1/'))return reply([]);
  return r.abort();
 });
 await page.goto('/');
 await page.evaluate(email=>window.eval('mile85OpenVerify('+JSON.stringify(email)+')'),email);
 await expect(page.locator('#mile85Code')).toBeVisible();
 return calls;
}
async function submit(page,code){await page.locator('#mile85Code').fill(code);await page.locator('#mile85Verify').click();}
test('85 OTP rejects incorrect, expired and unconfirmed verification responses',async({page})=>{
 const calls=await setup(page);
 for(const code of ['000000','111111','222222']){
  await submit(page,code);
  await expect(page.locator('#v4Error')).toContainText('Verification failed');
  await expect(page.locator('#mile85Code')).toBeEnabled();
  expect(calls.member).toBe(0);expect(calls.training).toBe(0);
  expect(await page.evaluate(()=>sessionStorage.getItem('av-token'))).toBeNull();
 }
 expect(calls.verify.map(x=>x.token)).toEqual(['000000','111111','222222']);
 expect(calls.verify.every(x=>x.email===email&&x.type==='email')).toBe(true);
});
test('85 OTP resend locks repeated requests',async({page})=>{
 const calls=await setup(page);
 await page.locator('#mile85Resend').click();
 await expect(page.locator('#mile85Resend')).toBeDisabled();
 await expect(page.locator('#v4Error')).toContainText('Check your inbox');
 expect(calls.resend).toBe(1);
 expect(calls.member).toBe(0);
});
test('85 OTP confirmed response permits authoritative account check',async({page})=>{
 const calls=await setup(page);
 await submit(page,'333333');
 await expect.poll(()=>calls.member).toBeGreaterThan(0);
 await expect.poll(()=>calls.training).toBeGreaterThan(0);
 expect(calls.verify).toEqual([{email,token:'333333',type:'email'}]);
});
