const {test,expect}=require('@playwright/test');
const reviewImage=require('./overnight-review-image');
const stage='https://fnyfeelynaozxtftrrga.supabase.co';
const owner='00000000-0000-4000-8000-000000000091';
const activity='00000000-0000-4000-8000-000000000092';
const date='2026-11-27';
const run={id:'scheduled-apple-run',name:'Aerobic practice',sport:'Running',date,status:'planned',km:10,plannedMinutes:50,
 runningPlanVersion:3,revision:1,kind:'easy',detail:'10 km',structuredDetail:'10 km',
 structuredSteps:[{kind:'step',intensity:'active',duration:{kind:'distance',meters:10000},target:{kind:'open'}}]};
test('native Apple Health imports privately, creates a verified match and deletes the cloud copy',async({page,baseURL},info)=>{
 let connected=false,rows=[],requests=[];
 const watch={...run,id:'scheduled-watch',date:'2026-11-29',name:'Tomorrow Watch run'};
 const user={id:owner,email:'apple@example.test',email_confirmed_at:'2026-11-19T00:00:00Z'};
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===baseURL)return route.continue();
  if(url.origin!==stage)return route.abort();
  let json=[];
  if(url.pathname==='/auth/v1/token')json={access_token:'fixture-token',refresh_token:'fixture-refresh',user};
  else if(url.pathname==='/auth/v1/user')json=user;
  else if(url.pathname==='/functions/v1/garmin-connection-status')json={status:'not_connected'};
  else if(url.pathname==='/rest/v1/av_members')json=[{user_id:owner}];
  else if(url.pathname==='/rest/v1/av_training_data'&&route.request().method()==='GET')json=[{training_data:{activities:[],workouts:[run,watch],blocks:[],settings:{}}}];
  else if(url.pathname==='/rest/v1/mile_device_consents')json=connected?[{enabled:true,epoch:owner,last_import_at:date+'T12:00:00Z'}]:[];
  else if(url.pathname==='/rest/v1/mile_device_workouts')json=rows;
  else if(url.pathname==='/rest/v1/rpc/mile_set_apple_health_consent'){
   connected=route.request().postDataJSON().p_enabled;
   if(!connected)rows=[];
   json={enabled:connected,epoch:owner};
  }else if(url.pathname==='/rest/v1/rpc/mile_commit_apple_health_page'){
   const {p_rows,p_deleted}=route.request().postDataJSON();
   requests.push({p_rows,p_deleted});
   if(p_rows.length)rows=p_rows;
   json={committed:true};
  }else if(url.pathname==='/rest/v1/rpc/mile_confirm_running_match'){
   const p=route.request().postDataJSON();
   requests.push(p);
   json={version:p.p_expected_version+1,action:'link',workout:{...p.p_expected_workout,matchId:p.p_activity_id,status:'done'}};
  }
  return route.fulfill({json,headers:{'access-control-allow-origin':baseURL}});
 });
 await page.clock.setFixedTime(new Date('2026-11-28T12:00:00Z'));
 await page.addInitScript(({stage,activity,date})=>{
  localStorage.setItem('av-training-v2',JSON.stringify({settings:{supabaseUrl:stage,supabaseAnon:'public-fixture'}}));
  window.MILE_NATIVE_BUILD={appleHealth:true};
  const checkpoints=new Map();
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:{MILEHealthKit:{
   installation:async()=>({id:'synthetic-device'}), changeCounter:async()=>({counter:1}), availability:async()=>({available:true}),
   requestReadAccess:async()=>({requestCompleted:true}),
   readWorkoutPage:async({from,to,cursor})=>{
    const startAt=date+'T09:00:00.000Z';
    return {workouts:!cursor&&from<=startAt&&startAt<to?[{provider:'apple_health',providerId:activity,startAt,
     endAt:date+'T09:50:00Z',durationSeconds:3000,distanceMeters:10000,activityDay:date,sport:'running'}]:[],
     deletedProviderIds:[],nextCursor:'fixture-anchor',hasMore:false};
   },
   checkpointGet:async({key})=>({value:checkpoints.get(key)??null}),
   checkpointSet:async({key,value})=>checkpoints.set(key,value),
   checkpointRemove:async({key})=>checkpoints.delete(key),
   scheduleRun:async payload=>{window.mockWatchRun=payload;return {status:'scheduledOnPhone'};},
   observeWorkouts:async()=>({enabled:false}),readWorkoutDetail:async()=>({}),addListener:()=>{}
  }}};
 },{stage,activity,date});
 await page.goto('/');
 await page.locator('#v4Email').fill(user.email);
 await page.locator('#v4Password').fill('fixture-password');
 await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
 await page.locator('#v4Gate [onclick*="v4SkipGarmin"]').click();
 await expect(page.locator('#v4Gate')).toBeHidden();
 await page.evaluate(()=>import('/native/sync/apple-app.mjs'));
 await page.evaluate(()=>window.mile771.open('connections'));
 const panel=page.locator('[data-mile-apple-panel]');
 for(const theme of ['forest','graphite','midnight','mono','light','sand','ice']){
  await page.evaluate(value=>window.m395ThemeSet(value),theme);
  await expect(page.locator('html')).toHaveAttribute('data-m395-theme',theme);
  expect(await panel.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
 }
 await page.evaluate(()=>window.m395ThemeSet('mono'));
 page.once('dialog',dialog=>dialog.accept());
 await panel.getByRole('button',{name:'Connect Apple Health'}).click();
 await expect(panel).toContainText('Last saved import');
 expect(requests.flatMap(p=>p.p_rows??[])).toHaveLength(1);
 expect(Object.keys(requests.flatMap(p=>p.p_rows??[])[0])).not.toContain('user_id');
 await reviewImage(info,'apple-health-connected',panel);
 await page.evaluate(id=>window.mile35OpenActivity('apple:'+id),activity);
 const details=page.locator('#mile35-detail');
 await details.getByRole('button',{name:'Analysis',exact:true}).click();
 await expect(details.getByRole('heading',{name:'MILE IQ · Running analysis'})).toBeVisible();
 await expect(details.getByRole('button',{name:'Create a shareable activity image'})).toHaveCount(0);
 await details.getByRole('button',{name:'Link to Aerobic practice'}).click();
 await expect(details).toContainText('Linked session: Aerobic practice');
 expect(requests.find(x=>x.p_activity_id)?.p_activity_id).toBe('apple:'+activity);
 await reviewImage(info,'apple-health-running-iq',details.locator('.m881-quick'));
 await details.getByRole('button',{name:/Back/}).click();
 page.once('dialog',dialog=>dialog.accept());
 await panel.getByRole('button',{name:'Disconnect and delete imports'}).click();
 await expect(panel).toContainText('Apple imports deleted from MILE');
 expect(await page.evaluate(()=>mileAllActivities().some(a=>a.source==='apple_health'))).toBe(false);
 await page.evaluate(date=>{window.mileV3Go('calendar');viewDate=date;calendarMonth=date.slice(0,7);render();},watch.date);
 const planned=page.locator('#app summary').filter({hasText:/^Planned sessions/}).first();
 if(await planned.count())await planned.click();
 const card=page.locator('details.mile-cal-session').filter({hasText:watch.name}).first();
 if(await card.count())await card.locator('summary').first().click();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Schedule on Apple Watch'}).click();
 const sent=await page.evaluate(()=>window.mockWatchRun);
 expect(sent.workout.steps).toEqual(watch.structuredSteps);
 expect(sent.workout.revision).toBe(1);
 await expect(page.locator('#toast')).toContainText('Scheduled on iPhone');

});
