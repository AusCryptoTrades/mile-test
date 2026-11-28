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

  let stderr='';
  server.stderr.on('data', chunk=>{stderr+=String(chunk)});
  try {
    const outcome = await Promise.race([
      once(server.stdout, 'data').then(([chunk]) => String(chunk)),
      once(server, 'close').then(([code]) => 'Staging server exited with ' + code + '\n' + stderr),
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
    const panel=page.locator('.mile35-panel').filter({has:page.getByRole('heading',{name:'MILE Intelligence · Workout adjustment',exact:true})});
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
   env:{...process.env,MILE_STAGING_PUBLISHABLE_KEY:'sb_publishable_fixture_key'},stdio:['ignore','ignore','pipe'],
  });
  let stderr='';
  task.stderr.on('data', chunk=>{stderr+=String(chunk)});
  const [code]=await once(task,'close');
  expect(code,stderr).toBe(0);
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

test('staging cycling Analysis keeps a workout until explicit approval and displays private history',async({page},info)=>{
 await withStagingApp(info,async origin=>{
  const owner={id:'00000000-0000-4000-8000-000000000091',email:'cycling@example.test',email_confirmed_at:'2026-11-20T12:00:00Z'};
  const ride={id:'900091',name:'Cycling consent fixture',sport:'Cycling',type:'indoor_cycling',date:'2026-11-26',durationSeconds:1800};
  const block={id:'cycle-block',sport:'Cycling'};
  const before={id:'cycle-ride',name:'Threshold repeats',sport:'Cycling',date:'2026-11-29',status:'planned',
   block:block.id,plannedMinutes:45,revision:1, cyclingPlanVersion:1};
  const after={...before,name:'Easy recovery spin',plannedMinutes:30,revision:2,revisionSource:'cycling-recovery-v1'};
  const id='00000000-0000-4000-8000-000000000044';
  const calls=[];
  let applied=false;
  await page.route(staging+'/**',async route=>{
   const request=route.request(),pathname=new URL(request.url()).pathname;
   let json=[];
   if(pathname==='/auth/v1/token')json={access_token:'fixture-athlete',user:owner};
   else if(pathname==='/auth/v1/user')json=owner;
   else if(pathname==='/rest/v1/av_members')json=[{user_id:owner.id}];
   else if(pathname==='/functions/v1/garmin-connection-status')json={status:'not_connected'};
   else if(pathname==='/rest/v1/av_training_data'){
    expect(request.method()).toBe('GET');
    json=[{training_data:{activities:[ride],workouts:[before],blocks:[block],activeBlock:block.id}}];
   }else if(pathname.startsWith('/rest/v1/rpc/')){
    const rpc=pathname.split('/').at(-1);
    calls.push([rpc,request.postDataJSON()]);
    expect(request.headers().authorization).toBe('Bearer fixture-athlete');
    if(rpc==='mile_review_training_revision')json={status:'review',id,before,after,
     evidence:{checkins:[{date:'2026-11-27',fatigue:8},{date:'2026-11-26',fatigue:9}]}};
    else if(rpc==='mile_approve_training_revision'){applied=true;json={status:'applied',workout:after,revision:2};}
    else if(rpc==='mile_cycling_revision_history'&&applied)json=[{before,after}];
   }
   await route.fulfill({json,headers:{'access-control-allow-origin':origin}});
  });
  await page.clock.setFixedTime(new Date('2026-11-27T12:00:00Z'));
  await page.goto(origin);
  await page.locator('#v4Email').fill(owner.email);
  await page.locator('#v4Password').fill('fixture-password');
  await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
  await page.locator('#v4Gate [onclick*="v4SkipGarmin"]').click();
  await page.evaluate(id=>window.mile35OpenActivity(id),ride.id);
  const overlay=page.locator('#mile35-detail');
  await overlay.getByRole('button',{name:'Analysis',exact:true}).click();
  const review=overlay.getByRole('button',{name:'Review recovery adjustment'});
  expect(calls).toEqual([]);
  await review.click();
  const consent=overlay.locator('.m881-revision');
  await expect(consent).toContainText('Threshold repeats · 29/11/2026');
  await expect(consent.locator('.m881-revision-preview')).toContainText('30 min');
  await reviewImage(info,'cycling-consent-preview',consent);
  await consent.getByRole('button',{name:'Keep current ride'}).click();
  await expect(consent.getByRole('status')).toContainText('current ride was kept');
  expect(calls).toEqual([['mile_review_training_revision',{p_sport:'Cycling'}]]);
  await review.click();
  await consent.getByRole('button',{name:'Approve this revision'}).click();
  await expect(consent.getByRole('status')).toContainText('Revision saved to Calendar');
  await expect.poll(()=>page.evaluate(id=>state.workouts.find(w=>w.id===id)?.revision,before.id)).toBe(2);
  expect(calls.at(-1)).toEqual(['mile_approve_training_revision',{p_proposal_id:id,p_approved:true}]);
  await overlay.getByText('Approved cycling revisions',{exact:true}).click();
  await expect(overlay.getByText(/Threshold repeats \(45 min\) → Easy recovery spin \(30 min\)/)).toBeVisible();
 });
});
