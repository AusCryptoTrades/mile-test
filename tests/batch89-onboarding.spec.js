const {test, expect}=require('@playwright/test');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');
const origin='http://127.0.0.1:4173';
const backend='https://mgixvokjlytjuypzcfzz.supabase.co';
const first='runner@example.test', second='legacy@example.test';
const profile={username:'legacy_runner',display_name:'Legacy athlete',bio:'Preserved bio',primary_sport:'Cycling',disciplines:['Cycling'],is_private:false,auto_share_activities:true};
const fixtureUser=(email,id)=>({id:'89000000-0000-4000-8000-00000000000'+id,email,email_confirmed_at:'2026-11-20T00:00:00Z'});

function fixture({stage=1,member=false,garminStatus='not_connected'}={}){
 const users={
  [first]:{id:fixtureUser(first,1),member,stage,revision:0,profile:null,athlete:{},units:'metric',garminStatus},
  [second]:{id:fixtureUser(second,2),member:true,stage:null,revision:0,profile:{...profile},athlete:{ftp:260},units:'metric',garminStatus:'authorised',
   document:{blocks:[{id:'cycling-plan',name:'Existing cycling plan',sport:'Cycling'}],activeBlock:'cycling-plan',workouts:[{id:'legacy-workout',block:'cycling-plan',sport:'Cycling',date:'2026-12-12',name:'Existing ride',status:'planned'}],settings:{athleteProfile:{ftp:260}}}}
 };
 return {users,posts:[],failNext:false,conflictNext:false,expireNext:false,holdRefresh:null,
  async bind(target){
   await target.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin)return route.continue();
    if(url.origin==='https://connect.garmin.com')return route.fulfill({contentType:'text/html',body:'Garmin fixture authorization'});
    if(url.origin!==backend)return route.abort();
    const offer=(json,status=200)=>route.fulfill({json,status,headers:{'access-control-allow-origin':origin}});
    const token=request.headers().authorization?.replace(/^Bearer fixture:/,'');
    const owner=users[token], method=request.method();
    const body=()=>request.postDataJSON()||{};
    const snapshot=()=>({stage:owner.stage,revision:owner.revision,profile:owner.profile,athlete:owner.athlete,units:owner.units});
    if(url.pathname==='/auth/v1/signup')return offer({user:{email:body().email}});
    if(url.pathname==='/auth/v1/verify'||url.pathname==='/auth/v1/token'){
     const email=body().email||body().refresh_token?.replace('fixture-refresh:','');
     if(!users[email])return offer({msg:'Unknown fixture user'},400);
     if(body().refresh_token&&this.holdRefresh)await this.holdRefresh;
     return offer({access_token:'fixture:'+email,refresh_token:'fixture-refresh:'+email,user:users[email].id});
    }
    if(url.pathname==='/auth/v1/user')return owner?offer(owner.id):offer({},401);
    if(!owner)return offer({},401);
    if(url.pathname==='/rest/v1/av_members')return offer(owner.member?[{user_id:owner.id.id,onboarding_stage:owner.stage}]:[]);
    if(url.pathname==='/rest/v1/rpc/av_join'){
     if(body().invite_code!=='FIXTURE-INVITE')return offer({message:'Invalid or unavailable invitation'},400);
     owner.member=true;return offer(true);
    }
    if(url.pathname==='/rest/v1/rpc/mile_onboarding_state')return offer(snapshot());
    if(url.pathname==='/rest/v1/rpc/mile_onboarding_username')return offer(body().p_username!=='taken_name');
    if(url.pathname==='/rest/v1/rpc/mile_onboarding_save'){
     const {p_stage,p_revision,p_fields}=body();
     this.posts.push({email:token,stage:p_stage,revision:p_revision,fields:p_fields});
     if(this.expireNext){this.expireNext=false;return offer({message:'Session expired'},401);}
     if(this.failNext){this.failNext=false;return route.abort('failed');}
     if(this.conflictNext){this.conflictNext=false;owner.revision++;return offer({message:'Profile setup has changed. Reload your progress'},409);}
     if(p_revision!==owner.revision || p_stage>owner.stage || owner.stage===6)return offer({message:'Profile setup has changed'},409);
     if(p_stage===1)owner.profile={is_private:true,auto_share_activities:false,...owner.profile,...p_fields};
     if(p_stage===2)Object.assign(owner.profile,p_fields);
     if(p_stage===3){
      const {units,...data}=p_fields;
      owner.units=units;owner.athlete=Object.fromEntries(Object.entries(data).filter(([,v])=>v!==null));
      owner.document={blocks:[],workouts:[],goals:[],activities:[],activeBlock:null,settings:{athleteProfile:owner.athlete,preferences776:{appearance:{distance:units==='imperial'?'mi':'km',weight:units==='imperial'?'lb':'kg'}}}};
     }
     if(p_stage===5)Object.assign(owner.profile,p_fields,{is_discoverable:!p_fields.is_private});
     owner.stage=Math.max(owner.stage,p_stage+1);owner.revision++;
     return offer(snapshot());
    }
    if(url.pathname==='/rest/v1/av_training_data'){
     if(method==='POST'){owner.document=body().training_data;return offer([]);}
     return offer(owner.document?[{training_data:owner.document}]:[]);
    }
    if(url.pathname==='/rest/v1/mile_profiles')return offer(owner.profile?[{user_id:owner.id.id,...owner.profile}]:[]);
    if(url.pathname==='/functions/v1/garmin-connection-status')return offer({status:owner.garminStatus});
    if(url.pathname==='/functions/v1/garmin-oauth-start')return offer({authorization_url:'https://connect.garmin.com/fixture'});
    if(url.pathname.startsWith('/storage/v1/object/mile-avatars/')){
     expect(url.pathname).toBe('/storage/v1/object/mile-avatars/'+owner.id.id+'/avatar.jpg');
     expect(request.headers()['content-type']).toBe('image/jpeg');
     return offer({Key:url.pathname});
    }
    return offer([]);
   });
  }
 };
}
async function login(page,email=first){
 await page.goto('/');
 await page.locator('#v4Email').fill(email);
 await page.locator('#v4Password').fill('Synthetic password 89');
 await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
}
const wizard=page=>page.locator('#v4Gate .m89');
async function heading(page,name){await expect(wizard(page).getByRole('heading',{name,exact:true})).toBeVisible();}
async function next(page,name='Continue'){await wizard(page).getByRole('button',{name,exact:true}).click();}
async function shot(page, info, name, selector) {
 const loc=page.locator(selector);
 await expect(loc).toBeVisible();
 const image=await loc.screenshot({animations:'disabled'});
 await info.attach(name,{body:image,contentType:'image/png'});
 if(process.env.MILE_B89_SCREENSHOTS){
  const folder=path.join(process.env.MILE_B89_SCREENSHOTS,info.project.name);
  await mkdir(folder,{recursive:true});
  await require('node:fs/promises').writeFile(path.join(folder,name+'.png'),image);
 }
}

test('Batch 89 registration opens private five-stage setup and saves a unified profile',async({page},info)=>{
 const service=fixture();
 await service.bind(page);
 await page.goto('/');
 await page.getByRole('link',{name:'Create account',exact:true}).click();
 await expect(page.getByRole('link',{name:'Terms',exact:true}).first()).toHaveAttribute('href','https://milefitness.com.au/terms');
 await expect(page.getByRole('link',{name:'Privacy Policy',exact:true})).toHaveAttribute('href','https://milefitness.com.au/privacy');
 await page.locator('#v4Email').fill(first);
 await page.locator('#v4Password').fill('Synthetic password 89');
 await page.locator('#v4Invite').fill('FIXTURE-INVITE');
 await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
 await expect(page.locator('#mile85Code')).toBeVisible();
 expect(service.posts).toHaveLength(0);
 await page.locator('#mile85Code').fill('333333');
 await page.locator('#mile85Verify').click();
 await heading(page,'Your profile');
 await expect(wizard(page).getByLabel('Display name')).toHaveValue('');
 await expect(wizard(page).getByLabel('Username')).toHaveValue('');
 await shot(page,info,'01-profile','#v4Gate .m89');
 await wizard(page).getByLabel('Display name').fill('Morgan Lane');
 await wizard(page).getByLabel('Username').fill('taken_name');
 await next(page);
 await expect(wizard(page).getByRole('status')).toContainText('unavailable');
 await wizard(page).getByLabel('Username').fill('Morgan_Lane');
 await next(page);
 await heading(page,'Your sports');
 await wizard(page).getByLabel('Running',{exact:true}).check();
 await wizard(page).getByLabel('Triathlon',{exact:true}).check();
 await wizard(page).getByLabel('Primary sport').selectOption('Triathlon');
 await shot(page,info,'02-sports','#v4Gate .m89');
 await next(page);
 await heading(page,'Your athlete profile');
 await wizard(page).getByLabel('Height (cm)',{exact:false}).fill('90');
 await wizard(page).getByLabel('Measurement units').selectOption('imperial');
 await expect(wizard(page).getByLabel('Height (in)',{exact:false})).toHaveValue('35.4331');
 expect(await wizard(page).locator('form').evaluate(form=>window.mileOnboarding.readBaseline(form,'imperial').heightCm)).toBe(90);
 await wizard(page).getByLabel('Height (in)',{exact:false}).fill('69');
 await wizard(page).getByLabel('Training experience').selectOption('regular');
 await shot(page,info,'03-athlete','#v4Gate .m89');
 await next(page);
 await heading(page,'Connect your training');
 await expect(wizard(page).getByRole('status').filter({hasText:'available to connect'})).toBeVisible();
 await shot(page,info,'04-connect','#v4Gate .m89');
 await next(page,'Skip for now');
 await heading(page,'Your privacy');
 await expect(wizard(page).getByRole('radio',{name:/^Private/})).toBeChecked();
 await shot(page,info,'05-privacy','#v4Gate .m89');
 await next(page,'Finish setup');
 await heading(page,'You’re ready, Morgan Lane.');
 expect(service.users[first].profile).toMatchObject({username:'morgan_lane',display_name:'Morgan Lane',primary_sport:'Triathlon',is_private:true,auto_share_activities:false});
 expect(service.users[first].document).toMatchObject({workouts:[],blocks:[],settings:{athleteProfile:{heightCm:175.26,experience:'regular'}}});
 await next(page,'Enter MILE');
 await expect(page.locator('#v4Gate')).toBeHidden();
 await expect(page.locator('.mile-ui-hero h1')).toContainText('Morgan');
 await expect.poll(()=>page.evaluate(()=>window.mileAthleteProfile.read()?.primarySport)).toBe('Triathlon');
 await page.evaluate(()=>window.mileV3Go('settings'));
 await page.locator('[data-m771-open="profile"]').click();
 await expect(page.getByRole('heading',{name:'Private athlete details'})).toBeVisible();
 await shot(page,info,'settings-athlete','#app [data-m771-page="profile"]');
 const settings=page.locator('[data-m89-baseline]');
 await settings.getByLabel('Weight (lb)',{exact:false}).fill('165');
 await settings.getByRole('button',{name:'Save athlete details'}).click();
 await expect.poll(()=>service.users[first].document.settings.athleteProfile.weightKg).toBe(74.84);
 await page.evaluate(()=>window.m36Open('profile'));
 await expect(page.getByText('Morgan Lane',{exact:true}).first()).toBeVisible();
 await shot(page,info,'social-profile','#app');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('Batch 89 saves progress across refresh, sign-out and devices with conflict recovery',async({page,browser})=>{
 const service=fixture({member:true});
 await service.bind(page);
 await login(page);
 await heading(page,'Your profile');
 await wizard(page).getByLabel('Display name').fill('Alex River');
 await wizard(page).getByLabel('Username').fill('alex_runner');
 await wizard(page).locator('input[name="photo"]').setInputFiles({
  name:'portrait.png',mimeType:'image/png',
  buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=','base64'),
 });
 service.failNext=true;
 await next(page);
 await expect(wizard(page).getByRole('status')).toContainText(/fetch|network|load failed/i);
 await expect(wizard(page).getByLabel('Display name')).toHaveValue('Alex River');
 await next(page);
 await heading(page,'Your sports');
 expect(service.users[first].profile.avatar_url).toContain('/avatar.jpg');
 await page.reload();
 await heading(page,'Your sports');
 await next(page,'Back');
 await expect(wizard(page).getByLabel('Username')).toHaveValue('alex_runner');
 await next(page);
 await wizard(page).getByLabel('Running',{exact:true}).check();
 await wizard(page).getByLabel('Primary sport').selectOption('Running');
 service.conflictNext=true;
 await next(page);
 await expect(wizard(page).getByRole('status')).toContainText('Reload your progress');
 await next(page,'Reload saved progress');
 await heading(page,'Your sports');
 await wizard(page).getByLabel('Running',{exact:true}).check();
 await wizard(page).getByLabel('Primary sport').selectOption('Running');
 await next(page);
 await heading(page,'Your athlete profile');
 await next(page,'Sign out');
 await expect(page.locator('#v4Email')).toBeVisible();
 await login(page,second);
 await expect(page.locator('#v4Gate')).toBeHidden();
 expect(service.users[second].profile).toEqual(profile);
 expect(service.users[second].document.workouts).toEqual([expect.objectContaining({id:'legacy-workout',name:'Existing ride'})]);
 const device=await browser.newContext();
 try{
  await service.bind(device);
  const other=await device.newPage();
  await login(other);
  await heading(other,'Your athlete profile');
  await other.evaluate(()=>window.m776ApplyAppearance({theme:'light'}));
  await expect(wizard(other).getByLabel('Measurement units')).toBeVisible();
  expect(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }finally{await device.close();}
});

test('Batch 89 resumes Garmin authorisation and reports the verified connection state',async({page})=>{
 const service=fixture({stage:4,member:true});
 service.users[first].profile={...profile};
 await service.bind(page);
 await login(page);
 await heading(page,'Connect your training');
 await next(page,'Connect Garmin');
 await page.waitForURL('https://connect.garmin.com/fixture');
 service.users[first].garminStatus='not_connected';
 await page.goto('/?garmin=failed');
 await heading(page,'Connect your training');
 await expect(wizard(page)).toContainText('Garmin authorisation failed');
 service.users[first].garminStatus='authorised';
 await page.goto('/?garmin=connected');
 await heading(page,'Connect your training');
 await expect(wizard(page)).toContainText('Garmin Connect is authorised');
 await next(page);
 await heading(page,'Your privacy');
 expect(service.posts.at(-1).stage).toBe(4);
});

test('Batch 89 discards an in-flight token refresh when the athlete switches accounts',async({page})=>{
 const service=fixture({member:true});
 await service.bind(page);
 await login(page);
 await heading(page,'Your profile');
 await wizard(page).getByLabel('Display name').fill('Leaving athlete');
 await wizard(page).getByLabel('Username').fill('leaving_athlete');
 service.expireNext=true;
 let release;
 service.holdRefresh=new Promise(resolve=>{release=resolve;});
 const isRefresh=request=>request.url().includes('grant_type=refresh_token');
 try{
  const refreshing=page.waitForRequest(isRefresh);
  await next(page);
  await refreshing;
  await next(page,'Sign out');
  await expect(page.locator('#v4Email')).toBeVisible();
  await page.locator('#v4Email').fill(second);
  await page.locator('#v4Password').fill('Synthetic password 89');
  await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
  await expect(page.locator('#v4Gate')).toBeHidden();
  const finished=page.waitForEvent('requestfinished',isRefresh);
  release();
  await finished;
  await expect.poll(()=>page.evaluate(()=>typeof authRefreshBusy==='undefined'||authRefreshBusy===null)).toBe(true);
  expect(await page.evaluate(()=>localStorage.getItem('av-user'))).toBe(service.users[second].id.id);
  expect(service.posts).toHaveLength(1);
  expect(service.users[first].profile).toBeNull();
 }finally{release();}
});
