const { test, expect } = require('@playwright/test');

const activity = {
  id: '123456789', name: 'Fixture morning run', sport: 'Running',
  date: '2026-11-18T07:00:00', distanceKm: 2, durationSeconds: 620, averageHR: 145,
};
const user = { id: '00000000-0000-4000-8000-000000000001' };
const samples = Array.from({ length: 11 }, (_, i) => ({
  timestamp: 1739343600000 + i * 62000,
  distanceInMeters: i * 200,
  heartRateInBeatsPerMinute: 130 + i * 2,
  speedMetersPerSecond: 3.2 + (i % 3) / 10,
  movingDurationInSeconds: i * 62,
}));

async function openApp(page, { signedIn = false, laps = true } = {}) {
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
    } else if (url.pathname === '/rest/v1/av_members') {
      json = [{ user_id: user.id }];
    } else if (url.pathname === '/rest/v1/av_training_data') {
      json = [{ training_data: { activities: [activity] } }];
    } else if (url.pathname === '/functions/v1/garmin-data-read' &&
               url.searchParams.get('activityId') === activity.id) {
      json = { details: { raw_data: laps ? {
        samples,
        lapDTOs: [{ distanceInMeters: 1000, durationInSeconds: 305 }],
      } : { samples: [], lapDTOs: [] } } };
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
  await page.getByRole('button', { name: 'Skip for now' }).click();
}

async function openActivity(page) {
  await page.getByRole('button', { name: /fixture morning run/i }).click();
  const detail = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: activity.name }) });
  await expect(detail).toBeVisible();
  return detail;
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  test.info().milePageErrors = errors;
});

test.afterEach(async () => {
  expect(test.info().milePageErrors).toEqual([]);
});

test('sign-in screen renders and validates required fields', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
  await expect(page.locator('#v4Error')).toHaveText('Enter your email and password.');
});

test('mobile sign-in stays within the viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout regression');
  await openApp(page);
  const gate = page.locator('#v4Gate');
  await expect(gate).toBeVisible();
  const dimensions = await gate.evaluate(el => ({
    contentWidth: el.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    gateWidth: el.getBoundingClientRect().width,
  }));
  expect(dimensions.gateWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
});

test('real Activity Details shows recorded laps and in-bounds charts and closes via Back', async ({ page, isMobile }, info) => {
  await openApp(page, { signedIn: true });
  const detail = await openActivity(page);
  await detail.getByRole('button', { name: 'Splits', exact: true }).click();
  await expect(detail.getByText('Lap 1 · 1.00 km')).toBeVisible();
  await expect(detail.getByText('5:05 · 5:05/km')).toBeVisible();
  await detail.getByRole('button', { name: 'Charts', exact: true }).click();
  const charts = detail.locator('.mile355-chart svg');
  await expect(charts).toHaveCount(2);
  for (const chart of await charts.all()) {
    await expect(chart).toBeVisible();
    const labels = await chart.locator('text').evaluateAll(nodes => nodes.map(node => {
      const bounds = node.getBoundingClientRect();
      const plot = node.ownerSVGElement.getBoundingClientRect();
      return {
        label: node.textContent,
        clipped: bounds.width <= 0 || bounds.left < Math.max(0, plot.left) - 1 ||
          bounds.right > Math.min(innerWidth, plot.right) + 1,
      };
    }));
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.filter(label => label.clipped)).toEqual([]);
  }
  if (isMobile) {
    const header = await detail.locator('.mile35-hero').boundingBox();
    expect(header.height).toBeLessThan(page.viewportSize().height * 0.3);
  }
  await info.attach('activity-charts', { body: await page.screenshot(), contentType: 'image/png' });
  const back = detail.getByRole('button', { name: /back/i });
  const bounds = await back.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height);
  await back.click();
  await expect(detail).toHaveCount(0);
});

test('real Activity Details reports absent splits without guessing', async ({ page }) => {
  await openApp(page, { signedIn: true, laps: false });
  const detail = await openActivity(page);
  await detail.getByRole('button', { name: 'Splits', exact: true }).click();
  await expect(detail.getByText(/no guessed splits/i)).toBeVisible();
  await expect(detail.getByText(/recorded Garmin laps \(may include/i)).toHaveCount(0);
});

test('activity card generates a decoded PNG preview', async ({ page }, info) => {
  await openApp(page, { signedIn: true });
  const detail = await openActivity(page);
  await detail.getByRole('button', { name: 'Create a shareable activity image' }).click();
  const preview = page.getByRole('img', { name: 'MILE share card preview' });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('src', /^data:image\/png;base64,iVBORw0KGgo/);
  await expect.poll(() => preview.evaluate(image => image.naturalWidth)).toBe(1080);
  await expect.poll(() => preview.evaluate(image => image.naturalHeight)).toBe(1350);
  await info.attach('share-preview', { body: await preview.screenshot(), contentType: 'image/png' });
});

test('calendar highlights the selected day', async ({ page }) => {
  await openApp(page, { signedIn: true });
  await page.getByRole('button', { name: /calendar/i }).click();
  const day = page.getByRole('button', { name: /^18\b/ });
  await day.click();
  await expect(day).toHaveClass(/\bselected\b/);
  await expect(day).toHaveCSS('outline-style', 'solid');
  const nextDay = page.getByRole('button', { name: /^19\b/ });
  await nextDay.click();
  await expect(nextDay).toHaveClass(/\bselected\b/);
  await expect(day).not.toHaveClass(/\bselected\b/);
});

test('Social Feed displays the recorded distance in kilometres', async ({ page }) => {
  await openApp(page, { signedIn: true });
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('button', { name: /social feed/i }).click();
  const post = page.getByRole('article').filter({ hasText: 'Fixture social run' });
  await expect(post).toContainText('2.75 km');
});

test('four activity share designs swipe and export the selected PNG', async ({ page }) => {
  await openApp(page, { signedIn: true });
  await page.evaluate(() => {
    window.m398SocialPosts = [{ id: 'share-fixture', title: 'Treadmill Running', distance_m: 10000, duration_s: 3201, average_hr: 127, activity_at: '2026-11-19T12:00:00Z' }];
    const button = document.createElement('button');
    button.dataset.m396Share = 'share-fixture';
    button.textContent = 'Fixture share';
    document.body.append(button);
    button.click();
  });
  const modal = page.locator('#m396-share-overlay');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.mile-card-choice')).toHaveCount(4);
  await expect(modal).toContainText('Editorial Pro');
  await expect(modal).toContainText('Performance Pro');
  await modal.locator('.mile-card-track').evaluate(el => { el.scrollLeft = (el.clientWidth + 12) * 2; el.dispatchEvent(new Event('scroll')); });
  await expect(modal.locator('.mile-card-dots')).toContainText('●');
  await expect(modal.locator('[data-m396-export]')).toBeVisible();
  await modal.locator('[data-m396-close]').first().click();
  await expect(modal).toHaveCount(0);
});

test('HYROX SIM share offers monochrome simple and detailed split cards', async ({ page }) => {
  await openApp(page, { signedIn: true });
  await page.evaluate(() => {
    window.m398SocialPosts = [{id:'sim-fixture',source_activity_id:'mile-sim-test',title:'MILE SIM · HYROX',distance_m:8000,duration_s:3678,activity_at:'2026-11-22T08:00:00Z',detail_snapshot:{source:'mile-sim',stages:Array.from({length:16},(_,i)=>({name:i%2?'Station '+(i+1)/2:'Run '+(i/2+1),seconds:200+i}))}}];
    const b=document.createElement('button');b.dataset.m396Share='sim-fixture';document.body.append(b);b.click();
  });
  const modal=page.locator('#m396-share-overlay');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.mile-card-choice')).toHaveCount(4);
  await expect(modal).toContainText('Simple White');
  await expect(modal).toContainText('Simple Black');
  await expect(modal).toContainText('Detailed White');
  await expect(modal).toContainText('Detailed Black');
  await expect(modal).toContainText('HYROX SIM');
  await expect(modal).toContainText('Run 8');
  await expect(modal).toContainText('Station 8');
  await expect(modal).toContainText('1:01:18');
});

test('tracker embedded navigation', async ({ page }) => {
 await openApp(page, { signedIn: true });
 await page.evaluate(() => window.mileShellOpen('tracker'));
 await expect(page.locator('#mile-native-view')).toBeVisible();
 await expect(page.locator('#mile-fixed-mobile-nav [data-mile-page="track"]')).toHaveClass(/active/);
 await expect(page.frameLocator('#mile-native-view').locator('.mile-tracker-hero')).toContainText('RUN TRACKER');
 await page.evaluate(() => window.mileShellNavigate('profile'));
 await expect(page.locator('#mile-native-view')).toHaveCount(0);
});

test('comment threads render like and reply controls', async ({page}) => {
 await openApp(page,{signedIn:true});
 await page.evaluate(() => {
  const s=window.m36State;
  s.comments=[{id:'comment-root',activity_id:'fixture-social-post',user_id:'00000000-0000-4000-8000-000000000001',body:'Great workout!',parent_comment_id:null},{id:'comment-child',activity_id:'fixture-social-post',user_id:'00000000-0000-4000-8000-000000000001',body:'Thank you!',parent_comment_id:'comment-root'}];
  s.commentLikes=[{comment_id:'comment-root',user_id:'00000000-0000-4000-8000-000000000001'}];
  window.m36Open('feed');
 });
 await expect(page.locator('[data-m36-comments="fixture-social-post"]')).toBeVisible();
 await expect.poll(() => page.evaluate(() => window.m36State.loading)).toBe(false);
 await page.evaluate(() => {const s=window.m36State;s.comments=[{id:'comment-root',activity_id:'fixture-social-post',user_id:'00000000-0000-4000-8000-000000000001',body:'Great workout!',parent_comment_id:null},{id:'comment-child',activity_id:'fixture-social-post',user_id:'00000000-0000-4000-8000-000000000001',body:'Thank you!',parent_comment_id:'comment-root'}];s.commentLikes=[{comment_id:'comment-root',user_id:'00000000-0000-4000-8000-000000000001'}];window.m383Repaint();});
 await page.locator('[data-m36-comments="fixture-social-post"]').click();
 await expect(page.locator('#m400-comment-comment-root')).toContainText('Great workout!');
 await expect(page.locator('#m400-comment-comment-child')).toContainText('Thank you!');
 await expect(page.locator('#m400-comment-comment-root [data-m400-like]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#m400-comment-comment-root [data-m400-reply]').click();
 await expect(page.locator('[data-m400-indicator="fixture-social-post"]')).toContainText('Replying to');
 await page.locator('[data-m400-cancel="fixture-social-post"]').click();
 await expect(page.locator('[data-m400-indicator="fixture-social-post"]')).toBeHidden();
 await page.locator('#m400-comment-comment-root [data-m400-like]').click();
 await expect(page.locator('#m400-comment-comment-root [data-m400-like]')).toHaveAttribute('aria-pressed','false');
});

test('compact comments expand inline, use theme hearts and keep composer in card',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.m36Open('feed'));
 await expect(page.locator('[data-m36-comments="fixture-social-post"]')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.m36State.loading)).toBe(false);
 await page.evaluate(()=>{
  const s=window.m36State,uid='00000000-0000-4000-8000-000000000001';
  s.comments=[1,2,3,4].map(n=>({id:'compact-'+n,activity_id:'fixture-social-post',user_id:uid,body:'Compact comment '+n,parent_comment_id:null,created_at:new Date().toISOString()}));
  s.commentLikes=[{comment_id:'compact-1',user_id:uid}];window.m383Repaint();
 });
 await page.locator('[data-m36-comments="fixture-social-post"]').click();
 await expect(page.locator('.m401-comment')).toHaveCount(2);
 await expect(page.locator('.m401-heart[aria-pressed="true"]')).toHaveCount(1);
 await expect(page.locator('.m401-composer textarea')).toBeVisible();
 await page.locator('[data-m401-expand="fixture-social-post"]').click();
 await expect(page.locator('.m401-comment')).toHaveCount(4);
 await page.locator('[data-m401-expand="fixture-social-post"]').click();
 await expect(page.locator('.m401-comment')).toHaveCount(2);
});

test('structured tracker shows workout details and editable target pace',async({page})=>{
 await page.goto('/mile-run-tracker.html?embedded=1&workout=threshold');
 await expect(page.locator('#structuredTargets')).toBeVisible();
 await expect(page.locator('.tracker-target-grid')).toContainText('RECOVERY');
 await expect(page.locator('#paceTargetField')).toBeHidden();
 await page.locator('#editTargets').click();
 await expect(page.locator('#paceTargetField')).toBeVisible();
 await page.locator('#workout').selectOption('free');
 await expect(page.locator('#structuredTargets')).toBeHidden();
 await expect(page.locator('#paceTargetField')).toBeVisible();
});
test('social comment action controls have transparent backgrounds',async({page})=>{
 await openApp(page,{signedIn:true});await page.evaluate(()=>window.m36Open('feed'));
 await expect(page.locator('[data-m36-comments="fixture-social-post"]')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.m36State.loading)).toBe(false);
 await page.evaluate(()=>{const s=window.m36State;s.comments=[{id:'batch-comment',activity_id:'fixture-social-post',user_id:'00000000-0000-4000-8000-000000000001',body:'UI check',parent_comment_id:null}];window.m383Repaint()});
 await page.locator('[data-m36-comments="fixture-social-post"]').click();
 for(const selector of ['.m401-actions [data-m400-reply]','.m401-actions [data-m313-comment-menu]','.m401-heart']){
  const background=await page.locator(selector).first().evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(background).toBe('rgba(0, 0, 0, 0)');
 }
});

test('Events and PBs are grouped under their own add controls',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3Go('events'));
 await expect(page.locator('.mile-b1-events-page')).toBeVisible();
 const sections=page.locator('.mile-b1-section');
 await expect(sections).toHaveCount(2);
 await expect(sections.nth(0)).toContainText('Add an event');
 await expect(sections.nth(1)).toContainText('Add a personal best');
 await expect(page.getByRole('heading',{name:'Race calendar'})).toHaveCount(0);
 await sections.nth(0).locator('.mile-b1-add').click();
 await expect(page.locator('#mile-b1-event-form')).toHaveAttribute('open','');
 await page.locator('#m32EventName').fill('HYROX Melbourne');
 await page.locator('#m32EventDate').fill('2026-12-09');
 await page.locator('#m32EventSport').selectOption('HYROX');
 await page.locator('#m32EventDistance').fill('Mixed Doubles');
 await page.getByRole('button',{name:'Save event'}).click();
 await expect(page.locator('.mile-b1-event')).toContainText('HYROX Melbourne');
 await expect(page.locator('.mile-b1-event')).toContainText('HYROX');
 await expect(page.locator('.mile-b1-event')).toContainText('Mixed Doubles');
 await page.locator('.mile-b1-event .mile-b1-menu summary').click();
 await page.getByRole('button',{name:'Edit event / result'}).click();
 await expect(page.locator('#m32EventName')).toHaveValue('HYROX Melbourne');
 await page.locator('#m32EventResult').fill('59:30');
 await page.getByRole('button',{name:'Save changes'}).click();
 await expect(page.locator('.mile-b1-event')).toContainText('59:30');
 await expect(page.locator('.mile-b1-section').nth(0).locator('.mile-b1-add')).toBeVisible();
});
test('Race Lab keeps SIM promotion and adds permanent SIM tab',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3Go('predictor'));
 await expect(page.locator('.mile-v33-tabs')).toContainText('MILE SIM');
 await expect(page.getByText('NEW / LIVE TRAINING TOOL')).toBeVisible();
 await page.locator('.mile-v33-tabs button').filter({hasText:'MILE SIM'}).click();
 await expect(page.locator('.mile-b1-sim-panel')).toBeVisible();
 await expect(page.locator('a[href="./mile-sim.html"]')).toHaveCount(2);
});

test('Batch 1: compact comment controls have transparent backgrounds',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.m36Open('feed'));
 await expect(page.locator('[data-m36-comments="fixture-social-post"]')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.m36State.loading)).toBe(false);
 await page.evaluate(()=>{const s=window.m36State;s.comments=[{id:'batch-comment',activity_id:'fixture-social-post',user_id:'00000000-0000-4000-8000-000000000001',body:'Looks great',parent_comment_id:null}];window.m383Repaint()});
 await page.locator('[data-m36-comments="fixture-social-post"]').click();
 const reply=page.locator('#m400-comment-batch-comment [data-m400-reply]');
 await expect(reply).toBeVisible();
 const bg=await reply.evaluate(el=>getComputedStyle(el).backgroundColor);
 expect(bg).toBe('rgba(0, 0, 0, 0)');
 await expect(page.locator('.m401-composer textarea')).toBeVisible();
});
test('Batch 1: run tracker shows structured session and free-run target',async({page})=>{
 await page.goto('/mile-run-tracker.html');
 await expect(page.locator('#workout')).toBeVisible();
 await page.locator('#workout').selectOption('threshold');
 await expect(page.locator('#structuredTargets')).toBeVisible();
 await expect(page.locator('#structuredTargets')).toContainText('RECOVERY');
 await expect(page.locator('#paceTargetField')).toBeHidden();
 await page.locator('#editTargets').click();
 await expect(page.locator('#paceTargetField')).toBeVisible();
 await page.locator('#workout').selectOption('free');
 await expect(page.locator('#structuredTargets')).toBeHidden();
 await expect(page.locator('#paceTargetField')).toBeVisible();
});

test('beta recovery: sleep trend uses integer scores, HRV and VO2 appear on dashboard',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>{
   const d=new Date().toLocaleDateString('en-CA');
   state.recoveryDays=[{date:d,sleepHours:7.733,sleepScore:84,hrvMs:51,vo2Max:49,bodyBattery:71,restingHR:45,batteryCharged:62,batteryDrained:37}];
   window.mileV3Go('dashboard');
 });
 await expect(page.locator('.mile-ui-dashboard')).toContainText('Sleep Score');
 await expect(page.locator('.mile-ui-dashboard')).toContainText('HRV');
 await expect(page.locator('.mile-ui-dashboard')).toContainText('51 ms');
 await expect(page.locator('.mile-ui-dashboard')).toContainText('Body Battery');
 await expect(page.locator('.mile-ui-dashboard')).toContainText('71/100');
 await expect(page.locator('.mile-ui-dashboard')).toContainText('VO₂ Max');
 await page.evaluate(()=>window.mileV3Go('recovery'));
 await expect(page.locator('#recoveryTrends')).toContainText('Sleep score');
 await expect(page.locator('#recoveryTrends')).toContainText('84');
 await expect(page.locator('#recoveryTrends')).not.toContainText('7.7');
});
test('beta recovery: missing VO2 stays blank rather than inventing an estimate',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>{state.recoveryDays=[{date:new Date().toLocaleDateString('en-CA'),sleepScore:76,hrvMs:48}];window.mileV3Go('dashboard')});
 await expect(page.locator('.mile-ui-dashboard')).toContainText('VO₂ Max');
 await expect(page.locator('.mile-ui-dashboard')).toContainText('—');
});

test('batch 3: Social menu has no duplicate Tracker and closes on bottom navigation',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.m36Drawer());
 await expect(page.locator('#m36-drawer')).toBeVisible();
 await expect(page.locator('#m36-drawer')).not.toContainText('Run Tracker');
 await page.locator('#mile-fixed-mobile-nav [data-mile-page="calendar"]').click();
 await expect(page.locator('#m36-drawer')).toHaveCount(0);
 await expect(page.locator('#mile-fixed-mobile-nav [data-mile-page="calendar"]')).toHaveClass(/active/);
 await page.evaluate(()=>window.m36Drawer());
 await page.locator('#m36-dim').click({position:{x:5,y:5}});
 await expect(page.locator('#m36-drawer')).toHaveCount(0);
});
test('batch 3: one home Sleep Score and persistent theme on Home',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.m395ThemeSet('ice'));
 await page.evaluate(()=>window.mileV3Go('dashboard'));
 await expect(page.locator('.mile-ui-dashboard .mile-ui-recovery .sleep-score')).toHaveCount(1);
 await expect(page.locator('.mile-ui-dashboard .mile-ui-recovery .sleep')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.m395Theme)).toBe('ice');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mile-appearance-v1')).theme)).toBe('ice');
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.m395Theme)).toBe('ice');
});
test('batch 3: recovery trend values have room above tallest bars',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>{
  const d=new Date().toLocaleDateString('en-CA');
  state.recoveryDays=[{date:d,sleepScore:99,restingHR:87,bodyBattery:100,stress:95}];
  window.mileV3Go('recovery');
 });
 const charts=page.locator('#recoveryTrends .mile-recovery-chart');
 await expect(charts).toHaveCount(4);
 const heights=await charts.locator('.mile-recovery-bar:not(.missing)').evaluateAll(els=>els.map(x=>parseFloat(x.style.height)));
 expect(heights.length).toBeGreaterThan(0);
 expect(Math.max(...heights)).toBeLessThanOrEqual(80);
 await expect(page.locator('#recoveryTrends')).toContainText('99');
 await expect(page.locator('#recoveryTrends')).toContainText('100');
});
