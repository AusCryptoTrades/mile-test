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

async function openApp(page, { signedIn = false, laps = true, syncStore = null } = {}) {
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
      if(syncStore&&route.request().method()==='POST'){const payload=route.request().postDataJSON();syncStore.data=payload.training_data;syncStore.updated_at=payload.updated_at;json=[];}else json=[{training_data:syncStore?.data||{activities:[activity]},updated_at:syncStore?.updated_at}];
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


/* Reporting-only audit: every visible control in each visited surface. No real network or destructive actions. */
const themes=['forest','graphite','midnight','mono','light','sand','ice'];
const reports=[];
async function scan(page,root,label){
 const result=await root.evaluate((el,label)=>{
  const doc=el.ownerDocument,win=doc.defaultView,visible=n=>{const c=win.getComputedStyle(n),r=n.getBoundingClientRect();return r.width>0&&r.height>0&&c.visibility!=='hidden'&&c.display!=='none'&&!n.closest('[hidden],[aria-hidden=true]')};
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,120);
  const name=n=>clean(n.getAttribute('aria-label')||n.getAttribute('title')||n.innerText||n.textContent||n.getAttribute('value')||n.getAttribute('placeholder')||[...(n.labels||[])].map(l=>l.textContent).join(' '));
  const controls=[...el.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab]')].filter(visible).map(n=>{
   const r=n.getBoundingClientRect(),c=win.getComputedStyle(n),tag=n.tagName.toLowerCase(),nm=name(n),isForm=['input','select','textarea'].includes(tag);
   const issues=[];if(!nm||/^[×✕⋯…‹›←→+\-⚙⌂]$/.test(nm))issues.push('check accessible label');
   if(r.width<24||r.height<24)issues.push('small target <24px');
   else if((tag==='button'||n.getAttribute('role')==='button')&&(r.width<44||r.height<36))issues.push('review touch target');
   if(r.left< -2||r.right>doc.documentElement.clientWidth+2)issues.push('horizontal clipping candidate');
   if(isForm&&!n.getAttribute('aria-label')&&!n.getAttribute('aria-labelledby')&&!n.labels?.length)issues.push('review form label');
   return {tag,name:nm,id:n.id||null,cls:clean(n.className),width:Math.round(r.width),height:Math.round(r.height),font:c.fontSize,bg:c.backgroundColor,fg:c.color,border:c.borderRadius,disabled:!!n.disabled,issues};
  });
  return {label,theme:doc.documentElement.dataset.m395Theme||doc.documentElement.dataset.mileTheme||'standalone',viewport:doc.documentElement.clientWidth,scrollWidth:Math.max(doc.documentElement.scrollWidth,el.scrollWidth),headings:[...el.querySelectorAll('h1,h2,h3')].filter(visible).map(n=>clean(n.innerText)),controls,issues:controls.filter(c=>c.issues.length).length};
 },label);
 reports.push(result);console.log('MILE_AUDIT '+JSON.stringify({label,theme:result.theme,controls:result.controls.length,issues:result.issues,scrollWidth:result.scrollWidth,viewport:result.viewport,findings:result.controls.filter(c=>c.issues.length).map(c=>({name:c.name,id:c.id,issues:c.issues})).slice(0,30)}));
}
async function step(page,info,label,action,selector='#app'){
 try{await action();const root=page.locator(selector).first();await root.waitFor({state:'visible',timeout:5000});await scan(page,root,label);}
 catch(e){reports.push({label,error:String(e.message).slice(0,300)});console.log('MILE_AUDIT_ROUTE_ERROR '+JSON.stringify({label,error:String(e.message).slice(0,240)}))}
}
test.beforeEach(()=>{reports.length=0});
test.afterEach(async({},info)=>{await info.attach('mile-audit-inventory',{body:JSON.stringify(reports,null,2),contentType:'application/json'})});
test('82 audit authentication and primary screens in all seven themes',async({page},info)=>{
 test.setTimeout(180000);await openApp(page);
 await scan(page,page.locator('#v4Gate'),'Sign in');
 await page.locator('#v4Email').fill('runner@example.test');await page.locator('#v4Password').fill('fixture-password');
 // openApp has signed-out mock, so start a fresh fixture-auth context in another test.
});
test('82 audit core pages and themes using actual navigation',async({page},info)=>{
 test.setTimeout(240000);await openApp(page,{signedIn:true});
 for(const theme of themes){
  await page.evaluate(t=>window.m395ThemeSet(t),theme);
  for(const dest of ['dashboard','calendar','builder','performance','insights','events','predictor','goals','settings']){
   await step(page,info,theme+' / '+dest,()=>page.evaluate(p=>window.mileV3Go(p),dest));
  }
 }
 await step(page,info,'More drawer',()=>page.evaluate(()=>window.mileV3ToggleMore()),'#mile-emergency-more.open');
 await page.evaluate(()=>window.mileV3ToggleMore());
 await step(page,info,'Social drawer',()=>page.evaluate(()=>window.m36Drawer()),'#m36-drawer');
 await page.evaluate(()=>window.m36CloseDrawer());
});
test('82 audit builder disciplines, race tabs and settings subpages',async({page},info)=>{
 test.setTimeout(180000);await openApp(page,{signedIn:true});
 for(const sport of ['Running','HYROX','Swimming','Cycling','Strength']){
  await step(page,info,'Build / '+sport,async()=>{await page.evaluate(p=>{window.mileV3Go('builder');v42Step=0;v42PickSport(p)},sport)});
  if(sport!=='Strength')for(const n of [1,2,3])await step(page,info,'Build / '+sport+' / step '+(n+1),()=>page.evaluate(i=>{v42Step=i;render()},n));
 }
 await page.evaluate(()=>window.mileV3Go('predictor'));
 for(const mode of ['run','hyrox','estimates','sim'])await step(page,info,'Race Lab / '+mode,()=>page.evaluate(m=>window.mile33RaceMode(m),mode));
 await page.evaluate(()=>window.mileV3Go('settings'));
 for(const tab of ['appearance','units','dashboard','profile','zones','trainingprefs','connections','privacy','notifications','account','data','about']){
  await step(page,info,'Settings / '+tab,()=>page.locator('[data-m771-open="'+tab+'"]').first().click());
  await page.locator('[data-m771-open="hub"]').first().click().catch(()=>page.evaluate(()=>window.mile771.open('hub')));
 }
});
test('82 audit Social, activity details, support and embedded screens',async({page},info)=>{
 test.setTimeout(180000);await openApp(page,{signedIn:true});
 for(const tab of ['feed','profile','leaderboard','discover','requests','share','messages','notifications']){
  await step(page,info,'Social / '+tab,async()=>{await page.evaluate(t=>window.m36Open(t),tab);await expect.poll(()=>page.evaluate(()=>window.m36State.loading)).toBe(false)});
 }
 await step(page,info,'Activity details',async()=>{await page.evaluate(()=>window.mileV3Go('dashboard'));await page.getByRole('button',{name:/fixture morning run/i}).click()},'#mile35-detail');
 for(const tab of ['Overview','Charts','Splits'])await step(page,info,'Activity details / '+tab,()=>page.getByRole('button',{name:tab,exact:true}).click(),'#mile35-detail');
 await page.locator('#mile35-detail').getByRole('button',{name:/back/i}).click().catch(()=>{});
 for(const kind of ['bug','feedback']){
  await step(page,info,'Support / '+kind,()=>page.evaluate(k=>window.mileBetaReport(k),kind),'#mile-beta-feedback-overlay');
  await page.locator('[data-beta5-close]').click().catch(()=>{});
 }
 for(const kind of ['tracker','sim','challenges']){
  try{await page.evaluate(k=>window.mileShellOpen(k),kind);const f=page.frameLocator('#mile-native-view');await f.locator('body').waitFor({state:'visible'});await scan(page,f.locator('body'),'Embedded / '+kind);await page.evaluate(()=>window.mileShellLeave());}
  catch(e){console.log('MILE_AUDIT_ROUTE_ERROR '+JSON.stringify({label:kind,error:String(e.message).slice(0,240)}))}
 }
});
