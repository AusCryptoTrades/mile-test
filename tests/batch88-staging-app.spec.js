const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const reviewImage = require('./overnight-review-image');

const staging = 'https://fnyfeelynaozxtftrrga.supabase.co';

async function withStagingApp(info, exercise) {
  const port = 4300 + info.workerIndex;
  const origin = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.resolve(__dirname, '../scripts/serve-running-staging.mjs')], {
    env: { ...process.env, MILE_STAGING_PORT: String(port), MILE_STAGING_PUBLISHABLE_KEY: 'sb_publishable_fixture_key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const outcome = await Promise.race([
      once(server.stdout, 'data').then(([chunk]) => String(chunk)),
      once(server, 'exit').then(([code]) => 'Staging server exited with ' + code),
    ]);
    expect(outcome).toContain(origin);
    await exercise(origin);
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
}

test('isolated running staging app routes sign-in and embedded assets to staging', async ({ page, request }, info) => {
  await withStagingApp(info, async origin => {
    const signIn = await request.get(origin);
    expect(signIn.headers()['content-security-policy']).toContain('connect-src ' + staging);
    expect(signIn.headers()['cache-control']).toBe('no-store');
    const tracker = await request.get(origin + '/mile-run-tracker.html?embedded=1');
    expect(await tracker.text()).toContain(staging);
    expect(await tracker.text()).not.toContain('mgixvokjlytjuypzcfzz');
    expect((await request.get(origin + '/package.json')).status()).toBe(404);

    const requests = [];
    await page.route('**/auth/v1/token?*', route => {
      requests.push({ url: route.request().url(), key: route.request().headers().apikey });
      return route.fulfill({ status: 401, json: { msg: 'Synthetic sign-in rejection' } });
    });
    await page.goto(origin);
    await page.locator('#v4Email').fill('staging-fixture@example.test');
    await page.locator('#v4Password').fill('staging-fixture-password');
    await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
    await expect(page.locator('#v4Error')).toContainText('Synthetic sign-in rejection');
    expect(requests).toEqual([{ url: staging + '/auth/v1/token?grant_type=password', key: 'sb_publishable_fixture_key' }]);
  });
});

test('staging Analysis requires explicit approval of the exact server revision', async ({ page }, info) => {
  await withStagingApp(info, async origin => {
    const user = { id:'00000000-0000-4000-8000-000000000001', email:'staging-fixture@example.test', email_confirmed_at:'2026-11-20T12:00:00Z' };
    const calls = [];
    const id = '00000000-0000-4000-8000-000000000012';
    const before = { name:'Fixture easy run', date:'2026-11-28', km:5, plannedMinutes:30, detail:'Easy effort for 5 km.' };
    const after = { ...before, km:4.5, plannedMinutes:27, detail:'Easy effort for 4.5 km.' };
    let approval = 0;
    await page.route(staging + '/**', async route => {
      const request = route.request(), url = new URL(request.url());
      let json = [], status = 200;
      if (url.pathname === '/auth/v1/token') json = { access_token:'fixture-auth-token', user };
      else if (url.pathname === '/auth/v1/user') json = user;
      else if (url.pathname === '/rest/v1/av_members') json = [{user_id:user.id}];
      else if (url.pathname === '/functions/v1/garmin-connection-status') json = {status:'not_connected'};
      else if (url.pathname === '/rest/v1/av_training_data') {
        expect(request.method()).toBe('GET');
        json = [{ training_data:{ activities:[{
          id:'123456789', sport:'Running', name:'Fixture recovery activity', date:'2026-11-26', distanceKm:3, durationSeconds:1200,
        }] }}];
      } else if (url.pathname.startsWith('/rest/v1/rpc/mile_') && url.pathname.endsWith('_training_revision')) {
        expect(request.headers().authorization).toBe('Bearer fixture-auth-token');
        calls.push([url.pathname.split('/').at(-1), request.postDataJSON()]);
        if (url.pathname.endsWith('/mile_review_training_revision')) {
          json = { id, status:'review', before, after, evidence:{source:'athlete-checkin',date:'2026-11-27',fatigue:8} };
        } else if (++approval === 1) {
          status = 409;
          json = {code:'PT409'};
        } else json = {status:'applied',workoutId:'fixture-workout',revision:2};
      }
      await route.fulfill({ status, json, headers:{'access-control-allow-origin':origin} });
    });
    await page.clock.setFixedTime(new Date('2026-11-27T12:00:00Z'));
    await page.goto(origin);
    await page.locator('#v4Email').fill(user.email);
    await page.locator('#v4Password').fill('staging-fixture-password');
    await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
    await page.locator('#v4Gate [onclick*="v4SkipGarmin"]').click();
    await page.getByRole('button',{name:/Fixture recovery activity/i}).click();
    await page.getByRole('button',{name:'Analysis',exact:true}).click();
    const panel=page.locator('.mile35-panel').filter({has:page.getByRole('heading',{name:'Workout revision',exact:true})});
    await expect(panel.getByRole('button',{name:'Approve this revision'})).toHaveCount(0);
    expect(calls).toEqual([]);

    const review=panel.getByRole('button',{name:'Review recovery adjustment'});
    await review.click();
    await expect(panel).toContainText('8/10 fatigue');
    await expect(panel.locator('.m881-revision-preview > div').first()).toHaveText('Current5 km~30 min');
    await expect(panel.locator('.m881-revision-preview > div').last()).toHaveText('Proposed4.5 km~27 min');
    await reviewImage(info,'04-adaptation-proposal',panel);
    expect(calls).toEqual([['mile_review_training_revision',{p_sport:'Running'}]]);
    const approve=panel.getByRole('button',{name:'Approve this revision'});
    await approve.click();
    await expect(approve).toBeDisabled();
    await expect(panel.getByRole('status')).toContainText('Evidence or workout changed');
    expect(calls.at(-1)).toEqual(['mile_approve_training_revision',{p_proposal_id:id,p_approved:true}]);

    await review.click();
    await approve.click();
    await expect(panel.getByRole('status')).toContainText('Revision saved');
    expect(calls.map(([method])=>method)).toEqual([
      'mile_review_training_revision','mile_approve_training_revision',
      'mile_review_training_revision','mile_approve_training_revision',
    ]);

    await page.locator('#mile35-detail').getByRole('button',{name:/Back/}).click();
    await page.evaluate(()=>window.mileV3Go('settings'));
    await page.locator('[data-m771-open="connections"]').click();
    const download = page.waitForEvent('download');
    await page.getByRole('button',{name:'Download beta report',exact:true}).click();
    const report=JSON.parse(await readFile(await (await download).path(),'utf8'));
    expect(Object.keys(report).sort()).toEqual(['build','checkpoints','schema']);
    expect(report.build).toMatch(/^[a-f0-9]{40}$/);
    expect(report.checkpoints).toEqual(['analysis-opened','proposal-reviewed','proposal-approved']);
  });
});


test('portable beta export contains only the staging app and keeps reset redirects origin-relative', async()=>{
 const temp = await mkdtemp(path.join(tmpdir(),'mile-beta-export-'));
 try{
  const target=path.join(temp,'preview');
  const task=spawn(process.execPath,[path.resolve(__dirname,'../scripts/serve-running-staging.mjs'),'--output',target],{
   env:{...process.env,MILE_STAGING_PUBLISHABLE_KEY:'sb_publishable_fixture_key'},stdio:'ignore',
  });
  const [code]=await once(task,'exit');
  expect(code).toBe(0);
  const files=await readdir(target);
  expect(files).toContain('_headers');
  expect(files).toContain('mile-running-beta.js');
  for(const file of files){
   expect(file).toMatch(/^(index\.html|_headers|mile-[a-z0-9.-]+\.(html|js|css))$/);
   const asset=await readFile(path.join(target,file),'utf8');
   expect(asset).not.toContain('mgixvokjlytjuypzcfzz');
   expect(asset).not.toContain('https://app.milefitness.com.au');
  }
  expect(await readFile(path.join(target,'_headers'),'utf8')).toContain('connect-src '+staging);
  expect(await readFile(path.join(target,'mile-reset-password.html'),'utf8')).toContain("new URL('/mile-reset-password.html', location.origin).href");
 }finally{await rm(temp,{recursive:true,force:true})}
});
