const { test, expect } = require('@playwright/test');

const activity = {
  id: '123456789', name: 'Fixture morning run', sport: 'Running',
  date: '2026-11-18T07:00:00', distanceKm: 2, durationSeconds: 620, averageHR: 145,
};
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'runner@example.test', email_confirmed_at: '2026-11-19T12:00:00Z' };
const samples = Array.from({ length: 11 }, (_, i) => ({
  timestamp: 1739343600000 + i * 62000,
  distanceInMeters: i * 200,
  heartRateInBeatsPerMinute: 130 + i * 2,
  speedMetersPerSecond: 3.2 + (i % 3) / 10,
  movingDurationInSeconds: i * 62,
}));

async function openApp(page, { signedIn = false, laps = true, syncStore = null, intervalFixture = null } = {}) {
  const origin = 'http://127.0.0.1:4173';
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


test('88.2 real Build reviews exact personalised sessions and saves Calendar steps without touching existing history',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const syncStore={};await openApp(page,{signedIn:true,syncStore});
 await page.evaluate(()=>{state.workouts=[];window.mileV3Go('builder');v42PickSport('Running')});
 const build=page.locator('.m882-build');
 await expect(build).toContainText('STEP 1 OF 5');
 await build.locator('#m882-goal').selectOption('10k');
 await build.locator('#m882-start').fill('2026-11-30');
 await build.locator('#m882-weeks').fill('8');
 const next=()=>build.locator('[data-m882-action="next"]').click();
 await next();await expect(build).toContainText('STEP 2 OF 5');
 await expect(build).toContainText('180 days');
 await build.locator('#v42Level').selectOption('experienced');
 await build.locator('#v42Volume').fill('50');
 await build.locator('#m882-longest').fill('30');
 await build.locator('#m882-five').fill('19:59');
 await build.locator('#m882-easy').fill('5:20');
 await build.locator('#m882-threshold').fill('4:19');
 await next();await expect(build).toContainText('STEP 3 OF 5');
 await build.locator('#v42Days').selectOption('5');
 for(const d of ['2','4'])await build.locator('[data-m882-day="available"][value="'+d+'"]').uncheck();
 await build.locator('#m882-weekday').fill('60');
 await build.locator('#m882-longMinutes').fill('180');
 await build.locator('[data-m882-day="demanding"][value="6"]').check();
 await next();await expect(build).toContainText('STEP 4 OF 5');
 await expect(build.locator('#m882-mode')).toHaveValue('automatic');
 await expect(build.locator('[data-m882-adapt="pace"]')).toBeChecked();
 await next();await expect(build).toContainText('STEP 5 OF 5');
 await expect(build.locator('.m882-week').first()).toContainText('50.0 km');
 await build.locator('.m882-week').first().locator('summary').first().click();
 await build.locator('.m882-session').first().locator('summary').click();
 await expect(build.locator('.m882-session').first()).toContainText('Session Focus');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 page.once('dialog',d=>d.accept());
 await build.locator('[data-m882-action="save"]').click();
 await expect.poll(()=>page.evaluate(()=>state.blocks.some(b=>b.runningPlan?.version===1))).toBe(true);
 const saved=await page.evaluate(()=>{const b=state.blocks.find(x=>x.runningPlan?.version===1);const w=state.workouts.filter(x=>x.block===b.id&&x.planWeek===1);return {total:w.reduce((sum,x)=>sum+x.meters,0),steps:w.every(x=>x.structuredSteps.reduce((sum,s)=>sum+s.duration.meters,0)===x.meters&&x.structuredDetail===x.detail),focus:w.every(x=>!!x.focus),dates:w.map(x=>x.date),id:w[0].id}});
 expect(saved.total).toBe(50000);expect(saved.steps).toBe(true);expect(saved.focus).toBe(true);
 expect(saved.dates).toEqual(['2026-11-30','2026-12-01','2026-12-03','2026-12-05','2026-12-06']);
 await expect.poll(()=>syncStore.data?.workouts?.some(w=>w.id===saved.id)).toBe(true);
 await expect(page.getByRole('heading',{name:'You’re ready to train.'})).toBeVisible();
 await page.getByRole('button',{name:'View Calendar',exact:true}).click();
 await page.evaluate(()=>{viewDate='2026-11-30';calendarMonth='2026-11';render()});
 await expect(page.getByText('Session Purpose & Focus',{exact:true}).first()).toBeVisible();
 await page.getByText('Session Purpose & Focus',{exact:true}).first().click();
 await expect(page.getByText('Session Focus',{exact:true}).first()).toBeVisible();
 expect(errors).toEqual([]);
});
