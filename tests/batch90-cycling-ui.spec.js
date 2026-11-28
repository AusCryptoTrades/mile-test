const {test,expect}=require('@playwright/test');
const reviewImage=require('./overnight-review-image');
const user={id:'00000000-0000-4000-8000-000000000091',email:'cyclist@example.test',email_confirmed_at:'2026-11-19T12:00:00Z'};
const activity={id:'900013',name:'Fixture trainer ride',type:'indoor_cycling',sport:'Cycling',date:'2026-11-18T07:00:00',distanceKm:25,
  durationSeconds:3600,movingDurationInSeconds:3600,averageHR:132,source:'garmin-developer-api'};
const samples=Array.from({length:3601},(_,i)=>({timestamp:1794985200+i,powerInWatts:200,
  heartRateInBeatsPerMinute:132,bikeCadenceInRPM:88,movingDurationInSeconds:i}));
async function signIn(page,origin,{workouts=[],blocks=[]}={}){
 const backend='https://mgixvokjlytjuypzcfzz.supabase.co';
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin)return route.continue();
  if(url.origin!==backend)return route.abort();
  let json=[];
  if(url.pathname==='/auth/v1/token')json={access_token:'fixture-token',refresh_token:'fixture-refresh',user};
  else if(url.pathname==='/auth/v1/user')json=user;
  else if(url.pathname==='/functions/v1/garmin-connection-status')json={status:'not_connected'};
  else if(url.pathname==='/rest/v1/av_members')json=[{user_id:user.id}];
  else if(url.pathname==='/rest/v1/av_training_data'&&route.request().method()==='GET')json=[{training_data:{activities:[activity],workouts,blocks,settings:{cyclingProfile:{
   version:1,ftpHistory:[{date:'2026-11-01',watts:250,source:'manual',method:'Coach assessment',confidence:'high'}]
  }}}}];
  else if(url.pathname==='/functions/v1/garmin-data-read'&&url.searchParams.get('activityId')===activity.id)json={details:{raw_data:{samples,summary:{startTimeInSeconds:1794985200,elapsedDurationInSeconds:3600,movingDurationInSeconds:3600}}}};
  return route.fulfill({json,headers:{'access-control-allow-origin':origin}});
 });
 await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
 await page.goto('/');
 await page.locator('#v4Email').fill(user.email);
 await page.locator('#v4Password').fill('fixture-password');
 await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
 await page.locator('#v4Gate [onclick*="v4SkipGarmin"]').click({timeout:10000});
 await expect(page.locator('#v4Gate')).toBeHidden();
}
test('cycling Build carries one timed workout through review and Calendar in every theme',async({page,baseURL},info)=>{
 await signIn(page,baseURL);
 await page.evaluate(()=>window.mileV3Go('builder'));
 await page.locator('.sport-tile').filter({hasText:/^\s*.*Cycling$/}).first().click();
 const build=page.locator('.m90-build');
 const next=build.getByRole('button',{name:'Continue ›'});
 const themes=['forest','graphite','midnight','mono','light','sand','ice'];
 for(const theme of themes){
  await page.evaluate(value=>window.m395ThemeSet(value),theme);
  await expect(page.locator('html')).toHaveAttribute('data-m395-theme',theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.evaluate(()=>window.m395ThemeSet('mono'));
 await expect(build.getByRole('heading',{name:'Build your cycling plan'})).toBeVisible();
 await build.getByLabel('Programme length (weeks)').fill('4');
 await build.getByLabel('Cycling goal').selectOption('endurance');
 await next.click();
 await expect(build.getByLabel('Confirm sustainable weekly minutes')).toHaveValue('15');
 await expect(build.getByLabel('Cycling FTP (watts, optional)')).toHaveCount(0);
 await expect(build.getByText(/You can train without sensors/)).toBeVisible();
 const stageAction=build.locator('[data-m90-action="next"]');
 expect((await stageAction.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await expect(stageAction).toBeInViewport();
 await build.getByLabel('Cycling experience').selectOption('intermediate');
 await build.getByLabel('Confirm sustainable weekly minutes').fill('170');
 await build.getByLabel('Longest recent ride (minutes)').fill('60');
 await build.getByLabel('Power meter',{exact:true}).check();
 await expect(build.getByLabel('Cycling FTP (watts, optional)')).toHaveValue('250');
 await build.getByRole('button',{name:'Save cycling athlete details'}).click();
 await expect(build.getByRole('status')).toContainText('Cycling athlete details saved');
 await reviewImage(info,'cycling-assessment',build);
 await next.click();
 await build.getByRole('heading',{name:'Training schedule'}).waitFor();
 await next.click();
 await build.getByRole('heading',{name:'MILE Intelligence'}).waitFor();
 await next.click();
 await expect(build.getByRole('heading',{name:'Programme review'})).toBeVisible();
 const firstWeek=build.locator('.m882-week').first();
 await firstWeek.locator('summary').first().click();
 await firstWeek.locator('.m882-session > summary').first().click();
 await expect(firstWeek.getByText(/ W · Power meter or smart trainer/).first()).toBeVisible();
 await reviewImage(info,'cycling-review',build);
 page.once('dialog',dialog=>dialog.accept());
 await build.getByRole('button',{name:'Create training plan'}).click();
 await expect(page.locator('#app .mile-universal-header')).toContainText('Calendar');
 const saved=await page.evaluate(()=>state.workouts.filter(w=>w.cyclingPlanVersion).map(w=>({id:w.id,date:w.date,name:w.name,minutes:w.plannedMinutes,
  seconds:window.mileStructuredWorkout.totals(w.structuredSteps,{sport:'Cycling'}).seconds,detail:w.detail,canonical:w.structuredDetail})));
 expect(saved.length).toBeGreaterThan(3);
 expect(saved.every(w=>w.seconds===60*w.minutes&&w.detail===w.canonical)).toBe(true);
 await page.evaluate(date=>{viewDate=date;calendarMonth=date.slice(0,7);render();},saved[0].date);
 const planned=page.locator('#app summary').filter({hasText:/^Planned sessions/}).first();
 await planned.click();
 const sessions=page.locator('details.mile-cal-session').filter({hasText:saved[0].name});
 if(await sessions.count())await sessions.first().locator('summary').first().click();
 await expect(page.getByText(saved[0].name,{exact:true}).first()).toBeVisible();
 const section=page.locator('#app').getByText('Workout breakdown',{exact:true}).first();
 await expect(section).toBeVisible();
 await section.click();
 await expect(page.locator('#app .m90-session li').first()).toContainText(/ W/);
 await expect(page.getByRole('button',{name:'Start run',exact:true})).toHaveCount(0);
 for(const theme of themes){
  await page.evaluate(value=>window.m395ThemeSet(value),theme);
  await expect(page.locator('html')).toHaveAttribute('data-m395-theme',theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await reviewImage(info,'cycling-calendar',page.locator('#app'));
});

test('cycling MILE IQ uses owned samples and discloses unplanned analysis',async({page,baseURL},info)=>{
 await signIn(page,baseURL);
 await page.evaluate(async id=>window.mile35OpenActivity(id),activity.id);
 const panel=page.locator('#mile35-detail');
 await panel.getByRole('button',{name:'Analysis',exact:true}).click();
 await expect(panel.getByRole('heading',{name:'MILE IQ · Indoor cycling'})).toBeVisible();
 await expect(panel.getByText('Normalised power',{exact:true})).toBeVisible();
 await expect(panel.getByText('200 W',{exact:true}).first()).toBeVisible();
 await expect(panel.getByText(/Unplanned ride or no confirmed link/)).toBeVisible();
 await expect(panel.locator('.m881-detailed')).not.toHaveAttribute('open','');
 await panel.getByText('Detailed Analysis',{exact:true}).click();
 await expect(panel.getByText('Power-based training stress estimate',{exact:true})).toBeVisible();
 await expect(panel.getByText('64',{exact:true})).toBeVisible();
 await reviewImage(info,'cycling-analysis',panel);
});

test('Calendar confirms one cycling match before MILE IQ compares timed cues',async({page,baseURL},info)=>{
 const target={kind:'power',lowWatts:185,highWatts:215};
 const step=(intensity,seconds)=>({kind:'step',intensity,duration:{kind:'time',seconds},target});
 const block={id:'fixture-cycling-block',sport:'Cycling'};
 const workout={id:'fixture-cycling-ride',name:'Trainer repeats',sport:'Cycling',date:'2026-11-18',
  block:block.id,plannedMinutes:60,revision:1,cyclingPlanVersion:1,status:'planned',detail:'Fixture structured workout',
  structuredDetail:'Fixture structured workout',structuredSteps:[step('warmup',600),step('interval',600),
   step('recovery',300),step('interval',600),step('active',1200),step('cooldown',300)]};
 await signIn(page,baseURL,{workouts:[workout],blocks:[block]});
 await page.evaluate(()=>window.mileV3Go('calendar'));
 await page.evaluate(()=>chooseMatch('900013'));
 const modal=page.locator('#modalRoot');
 await expect(modal.getByText('Cycling · 1 h planned')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>state.workouts[0].matchId??null)).toBeNull();
 await modal.getByRole('button',{name:'Confirm link'}).click();
 await expect.poll(()=>page.evaluate(()=>state.workouts[0].cyclingMatchPrescription?.activityId)).toBe(activity.id);
 await page.evaluate(id=>window.mile35OpenActivity(id),activity.id);
 const panel=page.locator('#mile35-detail');
 await panel.getByRole('button',{name:'Analysis',exact:true}).click();
 await expect(panel.getByText('Power targets',{exact:true})).toBeVisible();
 await expect(panel.getByText(/2\/2 fully measured work cues averaged within target/)).toBeVisible();
 await panel.getByText('Detailed Analysis',{exact:true}).click();
 await expect(panel.getByText('Work cues · planned clock',{exact:true})).toBeVisible();
 await expect(panel.getByText(/Device step transitions are unavailable/)).toBeVisible();
 await reviewImage(info,'cycling-matched-intervals',panel);
});
