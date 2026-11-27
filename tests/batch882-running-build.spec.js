const { test, expect } = require('@playwright/test');

const activity = {
  id: '123456789', name: 'Fixture morning run', sport: 'Running',
  date: '2026-11-10T07:00:00', distanceKm: 2, durationSeconds: 620, averageHR: 145,
};
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'runner@example.test', email_confirmed_at: '2026-11-19T12:00:00Z' };
const samples = Array.from({ length: 11 }, (_, i) => ({
  timestamp: 1739343600000 + i * 62000,
  distanceInMeters: i * 200,
  heartRateInBeatsPerMinute: 130 + i * 2,
  speedMetersPerSecond: 3.2 + (i % 3) / 10,
  movingDurationInSeconds: i * 62,
}));

async function openApp(page, { origin, signedIn = false, laps = true, syncStore = null, intervalFixture = null }) {
  const backend = 'https://mgixvokjlytjuypzcfzz.supabase.co';
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    // Every external request stays inside this simulated backend.
    if (url.origin !== backend) return route.abort();
    let json;
    if (url.pathname === '/auth/v1/token' && signedIn) {
      json = { access_token: 'fixture-auth-token', refresh_token: 'fixture-refresh-token', user };
    } else if (url.pathname === '/auth/v1/user' && signedIn) {
      json = user;
    } else if (url.pathname === '/functions/v1/garmin-connection-status') {
      json = { status: 'not_connected' };
    } else if (url.pathname === '/rest/v1/av_members') {
      json = [{ user_id: user.id }];
    } else if (url.pathname === '/rest/v1/av_training_data') {
      if(syncStore&&route.request().method()==='POST'){const payload=route.request().postDataJSON();syncStore.data=payload.training_data;syncStore.updated_at=payload.updated_at;json=[];}else json=[{training_data:syncStore?.data||{activities:[activity]},updated_at:syncStore?.updated_at}];
    } else if (url.pathname === '/functions/v1/garmin-data-read' &&
               url.searchParams.get('activityId') === activity.id) {
      json = { details: { raw_data: intervalFixture || (laps ? {
        samples,
        lapDTOs: [{ distanceInMeters: 1000, durationInSeconds: 305 }],
      } : { samples: [], lapDTOs: [] }) } };
    } else if (url.pathname === '/rest/v1/mile_social_activities') {
      json = [{
        id: 'fixture-social-post', user_id: user.id, title: 'Fixture social run',
        activity_type: 'running', distance_m: 2750, duration_s: 850,
        activity_at: activity.date, visibility: 'private',
      }];
    } else if (url.pathname.startsWith('/rest/v1/')) {
      json = [];
    } else {
      return route.abort();
    }
    await route.fulfill({ json, headers: { 'access-control-allow-origin': origin } });
  });
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#mileSplash')).toHaveCount(0);
  if (!signedIn) return;
  await page.locator('#v4Email').fill('runner@example.test');
  await page.locator('#v4Password').fill('fixture-password');
  await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
  await page.locator('#v4Gate [onclick*="v4SkipGarmin"]').click({timeout: 8000});
  await expect(page.locator('#v4Gate')).toBeHidden();
}


test('88.2 Build saves the reviewed plan and Calendar starts the same structured Tracker workout',async({page,baseURL})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const syncStore={};await openApp(page,{origin:new URL(baseURL).origin,signedIn:true,syncStore});
 await page.evaluate(()=>{state.workouts=[{id:'fixture-completed-run',block:state.activeBlock,date:'2026-11-10',sport:'Running',name:'Historical run',detail:'Recorded workout',km:6,status:'done',matchId:'123456789',note:'Do not change'}];window.mileV3Go('builder');v42PickSport('Running')});
 const original=await page.evaluate(()=>JSON.stringify(state.workouts.find(w=>w.id==='fixture-completed-run')));
 const build=page.locator('.m882-build');
 await expect(build).toContainText('STEP 1 OF 5');
 await build.locator('#m882-goal').selectOption('10k');
 await build.locator('#m882-start').fill('2026-11-30');
 await build.locator('#m882-weeks').fill('8');
 const next=()=>build.locator('[data-m882-action="next"]').click();
 await next();await expect(build).toContainText('STEP 2 OF 5');
 await expect(build.locator('.m882-history').getByText('180 days',{exact:true})).toBeVisible();
 await expect(build.locator('.m882-history').getByText('No runs recorded',{exact:true})).toHaveCount(1);
 await build.locator('#v42Level').selectOption('experienced');
 await build.locator('#v42Volume').fill('50');
 await build.locator('#m882-longest').fill('30');
 await build.locator('#m882-five').fill('19:59');
 await build.locator('#m882-easy').fill('5:20');
 await build.locator('#m882-threshold').fill('4:19');
 await build.locator('#m882-maxHR').fill('180');
 await build.locator('#m882-lthr').fill('161');
 await build.locator('#m882-lowHR').fill('120');
 await build.locator('#m882-highHR').fill('142');
 await next();await expect(build).toContainText('STEP 3 OF 5');
 await build.locator('#v42Days').selectOption('5');
 for(const d of ['2','4'])await build.locator('[data-m882-day="available"][value="'+d+'"]').uncheck();
 await build.locator('#m882-weekday').fill('60');
 await build.locator('#m882-longMinutes').fill('180');
 await build.getByText('Day-specific limits',{exact:true}).click();
 const tuesday=build.getByLabel('Tuesday maximum (min)',{exact:true});
 await tuesday.fill('0');
 await next();
 await expect(build.getByRole('status')).toHaveText('Enter day-specific limits in whole minutes.');
 await tuesday.fill('35');
 await build.getByLabel('Saturday maximum (min)',{exact:true}).fill('170');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await build.locator('[data-m882-day="demanding"][value="6"]').check();
 await next();await expect(build).toContainText('STEP 4 OF 5');
 await expect(build.locator('#m882-mode')).toHaveValue('automatic');
 await expect(build.locator('[data-m882-adapt="pace"]')).toBeChecked();
 await build.locator('#m882-secondary').fill('HYROX on Sundays');
 await expect(build.locator('#m882-notifications')).toHaveValue('significant');
 await next();await expect(build).toContainText('STEP 5 OF 5');
 await expect(build.locator('.m882-week').first()).toContainText('50.0 km');
 await build.locator('.m882-week').first().locator('summary').first().click();
 await expect(build.locator('.m882-week').first().locator('.m882-session').nth(1).locator('summary')).toContainText('~35 min');
 await build.locator('.m882-session').first().locator('summary').click();
 await expect(build.locator('.m882-session').first()).toContainText('Session Focus');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 page.once('dialog',d=>d.accept());
 await build.locator('[data-m882-action="save"]').click();
 await expect.poll(()=>page.evaluate(()=>state.blocks.some(b=>b.runningPlan?.version===1))).toBe(true);
 const saved=await page.evaluate(()=>{
  const block=state.blocks.find(x=>x.runningPlan?.version===1);
  const all=state.workouts.filter(x=>x.block===block.id);
  const week=all.filter(x=>x.planWeek===1);
  return {
   total:week.reduce((sum,x)=>sum+x.meters,0),
   steps:week.every(x=>x.structuredSteps.reduce((sum,s)=>sum+s.duration.meters,0)===x.meters&&x.structuredDetail===x.detail),
   focus:week.every(x=>!!x.focus),dates:week.map(x=>x.date),id:week[0].id,first:week[0],
   overrides:block.runningPlan.config.schedule.dayMinutes,
   dayLimits:week.map(x=>x.durationLimitMinutes),
   allSessionsFit:all.every(x=>x.plannedMinutes<=x.durationLimitMinutes),
  };
 });
 expect(await page.evaluate(()=>JSON.stringify(state.workouts.find(w=>w.id==='fixture-completed-run')))).toBe(original);
 expect(saved.total).toBe(50000);expect(saved.steps).toBe(true);expect(saved.focus).toBe(true);
 expect(saved.dates).toEqual(['2026-11-30','2026-12-01','2026-12-03','2026-12-05','2026-12-06']);
 expect(saved.overrides).toEqual({1:35,5:170});
 expect(saved.dayLimits).toEqual([60,35,60,170,60]);
 expect(saved.allSessionsFit).toBe(true);
 await expect.poll(()=>syncStore.data?.workouts?.some(w=>w.id===saved.id)).toBe(true);
 expect(syncStore.data.blocks.find(block=>block.runningPlan?.version===1).runningPlan.config.schedule.dayMinutes).toEqual(saved.overrides);
 await expect(page.getByRole('heading',{name:'You’re ready to train.'})).toBeVisible();
 await page.getByRole('button',{name:'View Calendar',exact:true}).click();
 const startDate=page.locator('#app .daygrid .day').filter({has:page.getByText('30',{exact:true})});
 await expect(startDate).toHaveClass(/\bselected\b/);
 const sessions=page.locator('#app details.mile-v3-details').filter({has:page.getByText('Planned sessions (1)',{exact:true})});
 await sessions.locator(':scope > summary').click();
 const workout=sessions.locator('.item').filter({has:page.getByRole('heading',{name:saved.first.name,exact:true})});
 await expect(workout.locator('.v44-session-zone')).toHaveText(`RPE ${saved.first.targetRpe} · ~${saved.first.plannedMinutes} min estimated`);
 await workout.getByText('Session Purpose & Focus',{exact:true}).click();
 await expect(workout.getByText(saved.first.purpose,{exact:true})).toBeVisible();
 await expect(workout.getByText(saved.first.focus,{exact:true})).toBeVisible();
 await workout.getByRole('button',{name:'Start run',exact:true}).click();
 const tracker=page.frameLocator('#mile-native-view');
 await expect(tracker.locator('#workout')).toHaveValue('planned');
 await tracker.locator('html').evaluate(()=>{
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
   getCurrentPosition:resolve=>resolve({coords:{latitude:-38,longitude:145,accuracy:5},timestamp:Date.now()}),
   watchPosition:()=>1,clearWatch:()=>{},
  }});
 });
 await tracker.locator('#start').click();
 expect(saved.first.structuredSteps.length).toBeGreaterThan(1);
 for(const [index,step] of saved.first.structuredSteps.entries()){
  await expect(tracker.locator('#countdown')).toHaveText(`${(step.duration.meters/1000).toFixed(2)} km`);
  await expect(tracker.locator('#blockInfo')).toContainText(`Block ${index+1} / ${saved.first.structuredSteps.length}`);
  await expect(tracker.locator('#blockInfo')).toContainText('HR target 120–142 bpm');
  await tracker.locator('#nextBlock').click();
 }
 await expect(tracker.locator('#phase')).toHaveText('WORKOUT COMPLETE');
 await tracker.locator('#finish').click();
 await expect(tracker.locator('#resultText')).toContainText(saved.first.name);
 expect(errors).toEqual([]);
});
