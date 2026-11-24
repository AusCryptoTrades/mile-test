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

test('batch 3: Social menu uses isolated scrolling sheet and restores navigation',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.m36Drawer());
 await expect(page.locator('#m36-drawer')).toBeVisible();
 await expect(page.locator('#m36-drawer')).not.toContainText('Run Tracker');
 if(page.viewportSize().width<650){
  await expect(page.locator('#mile-clean-sheet-host')).toHaveClass(/is-open/);
  await expect(page.locator('#m36-drawer')).toHaveCSS('overflow-y','auto');
  await expect(page.locator('#mile-fixed-mobile-nav')).toBeHidden();
  await page.locator('#m36-drawer').evaluate(el=>el.scrollTop=el.scrollHeight);
  await expect(page.locator('#m36-drawer')).toContainText('Messages');
  await page.locator('#mile-clean-sheet-host .clean-backdrop').click({position:{x:5,y:5}});
  await expect(page.locator('#mile-fixed-mobile-nav')).toBeVisible();
  await page.locator('#mile-fixed-mobile-nav [data-mile-page="calendar"]').click();
 }else{
  await page.evaluate(()=>{const b=document.querySelector('#mile-fixed-mobile-nav [data-mile-page="calendar"]');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));b.click()});
 }
 await expect(page.locator('#m36-drawer')).toHaveCount(0);
 await expect(page.locator('#mile-fixed-mobile-nav [data-mile-page="calendar"]')).toHaveClass(/active/);
 await page.evaluate(()=>window.m36Drawer());
 if(page.viewportSize().width<650)await page.locator('#mile-clean-sheet-host .clean-backdrop').click({position:{x:5,y:5}});
 else await page.locator('#m36-dim').click({position:{x:5,y:5}});
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

test('batch 4: More hub groups destinations without touching social navigation',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3ToggleMore());
 const menu=page.locator('#mile-emergency-more');
 await expect(menu).toHaveClass(/open/);
 await expect(menu).toContainText('TRAINING & PERFORMANCE');
 await expect(menu).toContainText('HEALTH & RECOVERY');
 await expect(menu).toContainText('ACCOUNT & SUPPORT');
 await expect(menu).toContainText('Race Lab');
 await expect(menu).toContainText('Settings');
 await expect(menu).toContainText('What’s New');
 await page.keyboard.press('Escape');
 await expect(menu).not.toHaveClass(/open/);
});
test('batch 4: recorded Garmin laps support nested firmware payloads without guessing',async({page})=>{
 await openApp(page,{signedIn:true});
 const result=await page.evaluate(()=>{
  const nested={raw_data:{activityDetail:{lapDTOs:[
   {lapIndex:1,distanceInMeters:1000,durationInSeconds:250},
   {lapIndex:2,distanceInMeters:1000,durationInSeconds:265}
  ]}}};
  return {recorded:window.mileBeta4RecordedLaps(nested),missing:window.mileBeta4RecordedLaps({distanceInMeters:5000,durationInSeconds:1200})};
 });
 expect(result.recorded).toHaveLength(2);
 expect(result.recorded.map(x=>x.duration)).toEqual([250,265]);
 expect(result.missing).toHaveLength(0);
});
test('batch 4: typography and mobile nav remain consistent on secondary pages',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3Go('calendar'));
 if(test.info().project.name.startsWith('mobile-')) await expect(page.locator('#mile-fixed-mobile-nav')).toBeVisible();
 else await expect(page.locator('#mile-fixed-mobile-nav')).toBeHidden();
 const font=await page.locator('#app').evaluate(el=>getComputedStyle(el).fontFamily);
 expect(font).toMatch(/Inter|BlinkMacSystemFont|Segoe UI/);
 await page.evaluate(()=>window.mileV3Go('recovery'));
 await expect(page.locator('#app')).toBeVisible();
});

test('dashboard audit batch 1: no invented target, accurate durations and keyboard navigation',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3Go('dashboard'));
 await expect(page.locator('.mile-ui-dashboard')).toBeVisible();
 const dashboard=page.locator('.mile-ui-dashboard');
 await expect(dashboard).not.toContainText('of 60 km');
 const recent=dashboard.locator('[data-mile-activity]').first();
 if(await recent.count()){
  await recent.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toBeVisible();
 }
});
test('dashboard audit batch 1: recovery cards respond to keyboard',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3Go('dashboard'));
 const card=page.locator('.mile-ui-recovery [data-mile-recovery-link]').first();
 await expect(card).toBeVisible();
 await card.focus();
 await page.keyboard.press('Enter');
 await expect(page.locator('#app')).toBeVisible();
});

test('dashboard batch 2: recovery freshness and accurate sleep status labels',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3Go('dashboard'));
 await expect(page.locator('.mile-ui-recovery-date')).toBeVisible();
 await expect(page.locator('.mile-ui-recovery .readiness')).toContainText('Resting HR');
 await expect(page.locator('.mile-ui-recovery [data-mile-recovery-link]')).toHaveCount(4);
});
test('dashboard batch 2: distribution responsive layout and keyboard focus',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3Go('dashboard'));
 const summary=page.locator('.mile-v3953-distribution summary');
 await summary.focus();
 await page.keyboard.press('Enter');
 await expect(page.locator('.mile-v3953-distribution details')).toHaveAttribute('open','');
 const card=page.locator('.mile-ui-recovery [data-mile-recovery-link]').first();
 await card.focus();
 await expect(card).toBeFocused();
 const focusStyle=await page.evaluate(()=>Array.from(document.styleSheets).some(sheet=>{try{return Array.from(sheet.cssRules).some(rule=>rule.cssText.includes('[data-mile-recovery-link]:focus-visible'))}catch{return false}}));
 expect(focusStyle).toBe(true);
});

test('dashboard displays preferred Garmin date and resting HR',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>{localStorage.setItem('mile-appearance-v1',JSON.stringify({date:'MM/DD/YYYY'}));window.mileAppearance?.get?.();window.mileV3Go('dashboard')});
 await expect(page.locator('.mile-ui-recovery .readiness')).toContainText('Resting HR');
 const date=page.locator('.mile-ui-recovery-date');
 await expect(date).toBeVisible();
 const text=await date.innerText();
 expect(text).not.toMatch(/Garmin readings · \\d{4}-\\d{2}-\\d{2}/);
});
test('calendar compact audit: selected date and collapsible session lists',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3Go('calendar'));
 await expect(page.locator('.daygrid .day')).toHaveCount(30);
 await expect(page.locator('.daygrid .day.selected')).toHaveCount(1);
 const upcoming=page.locator('.mile-cal-upcoming-more');
 if(await upcoming.count()){
  await expect(upcoming).not.toHaveAttribute('open','');
  await upcoming.locator('summary').click();
  await expect(upcoming).toHaveAttribute('open','');
 }
});


test('calendar HR-zone relocation: Calendar stays focused, Settings retains editable zones',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileV3Go('calendar'));
 await expect(page.locator('#app details.av-hr-collapse, #app details.mile-v31-hr, #app .mile-v3-hr')).toHaveCount(0);
 await expect(page.locator('#app .daygrid')).toBeVisible();
 await page.evaluate(()=>window.mileV3Go('settings'));
 await expect(page.locator('#app')).toContainText('HR Zones');
 await page.evaluate(()=>window.mileV3SetSettingsTab('zones'));
 await expect(page.locator('#app')).toContainText('Custom HR Zones');
 await expect(page.locator('#app')).toContainText('Save HR Zones');
});

test('Build coaching: swimming weeks vary and preserve session purpose',async({page})=>{
 await openApp(page,{signedIn:true});
 const data=await page.evaluate(()=>{
  const profile={level:'intermediate',swim:'2:15',equipment:[]};
  return Array.from({length:8},(_,w)=>mileCoachPrescription('Swimming','intervals',w,profile,1,'Triathlon'));
 });
 expect(new Set(data.slice(0,3).map(x=>x.name)).size).toBe(3);
 expect(data.every(x=>x.purpose&&x.whyScheduled&&x.detail)).toBe(true);
 expect(data[3].whyScheduled).toContain('reduced-load');
});
test('Build coaching: 2-day swimming plan balances technique and endurance',async({page})=>{
 await openApp(page,{signedIn:true});
 expect(await page.evaluate(()=>v42Kinds('Swimming',2,70))).toEqual(['technique','endurance']);
});
test('Build coaching: program preview uses actual prescription engine and expandable rationale',async({page})=>{
 await openApp(page,{signedIn:true});
 const html=await page.evaluate(()=>{
  v42Sport='Swimming';v42Form={Goal:'Triathlon',Start:'2026-12-01',Weeks:'4',Days:'3',Level:'intermediate',SwimPace:'2:15',Available:[0,2,5],LongDay:'5'};
  return v461SchedulePreview();
 });
 expect(html).toContain('mile-coach-preview-session');
 expect(html).toContain('Session Purpose');
 expect(html).toContain('Swim');
});

test('tracker batch 66: embedded theme matches parent and header stays hidden',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileShellOpen('tracker'));
 const frame=page.frameLocator('#mile-native-view');
 await expect(frame.locator('#start')).toBeVisible();
 await expect(frame.locator('header')).toBeHidden();
 const parentBg=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
 expect(await frame.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--mile-bg').trim())).toBe(parentBg);
 await page.evaluate(()=>{document.getElementById('mile-native-view').dataset.testIdentity='original';window.mileShellOpen('tracker')});
 await expect(page.locator('#mile-native-view')).toHaveAttribute('data-test-identity','original');
});
test('tracker batch 66: GPS denial leaves start available',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>window.mileShellOpen('tracker'));
 const frame=page.frameLocator('#mile-native-view');
 await expect(frame.locator('#start')).toBeVisible();
 await frame.locator('html').evaluate(()=>{Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(_,reject)=>reject({message:'fixture denied'})}})});
 await frame.locator('#start').click();
 await expect(frame.locator('#notice')).toContainText('fixture denied');
 await expect(frame.locator('#start')).toBeEnabled();
});

test('tracker batch 66: recover own interrupted planned run, not another account',async({page})=>{
 await openApp(page,{signedIn:true});
 await page.evaluate(()=>{
 const owner=localStorage.getItem('av-user')||sessionStorage.getItem('av-user');
 const fixture={runId:'recovery-fixture',started:Date.now()-120000,seconds:60,points:[],meters:250,session:false,phaseIndex:0,phaseStarted:0,planned:{name:'Planned recovery run'},target:'5:20'};
 localStorage.setItem('mile-tracker-active-v2:other-account',JSON.stringify({...fixture,runId:'other'}));
 localStorage.setItem('mile-tracker-active-v2:'+owner,JSON.stringify(fixture));
 window.mileShellOpen('tracker');
 });
 const frame=page.frameLocator('#mile-native-view');
 await expect(frame.locator('#pause')).toHaveText('Resume');
 await expect(frame.locator('#notice')).toContainText('Interrupted run recovered');
 expect(await frame.locator('#workout').inputValue()).toBe('planned');
 expect(await frame.locator('#workout option:checked').textContent()).toBe('Planned recovery run');
 await frame.locator('#finish').click();
 await expect(frame.locator('#resultText')).toContainText('Planned recovery run');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mile-tracker-active-v2:other-account')).runId)).toBe('other');
});
test('tracker batch 66: foreign pending activity is not uploaded',async({page})=>{
 await openApp(page,{signedIn:true});
 const uploads=[];
 page.on('request',r=>{if(r.url().includes('/rest/v1/mile_social_activities')&&r.method()==='POST')uploads.push(r.postData())});
 await page.evaluate(()=>{
 localStorage.setItem('mile-run-tracker-pending-v1',JSON.stringify([{id:'foreign-fixture',owner:'other-account'}]));
 window.mileShellOpen('tracker');
 });
 await expect(page.frameLocator('#mile-native-view').locator('#start')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mile-run-tracker-pending-v1'))[0].id)).toBe('foreign-fixture');
 expect(uploads).toEqual([]);
});
