const {test,expect}=require('@playwright/test');
const id='e87b0000-0000-4000-8000-000000000001';
const detail='Warm-up: 2 min. Main: 6 min easy. Cooldown: 2 min.';
test('manual device sync previews once and publishes only after consent',async({page})=>{
 const calls=[];
 await page.goto('/mile-device-sync.js');
 await page.setContent('<!doctype html><html><head></head><body><div id="fixture"></div></body></html>');
 await page.evaluate(({id,detail})=>{
  window.userId='athlete-fixture';window.token='test-only';window.today=()=> '2026-11-27';window.add=()=> '2026-12-11';window.nice=d=>d;window.notice=()=>{};
  window.sbHeaders=()=>({'Content-Type':'application/json'});
  window.state={settings:{supabaseUrl:location.origin},workouts:[{id,sport:'Running',status:'planned',date:'2026-11-28',name:'Easy run',detail,structuredDetail:detail,structuredSteps:[{kind:'step'}]}]};
 },{id,detail});
 await page.route('**/functions/v1/mile-garmin-device-sync',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  const json=body.action==='status_session'?(calls.some(c=>c.action==='publish_session')?{publicationState:'scheduled',calendarMatch:true}:{publicationState:'not_published'}):body.action==='preview_session'?{date:'2026-11-28',payload:{workoutName:'Easy run',description:detail,segments:[{steps:[{type:'WorkoutStep',intensity:'ACTIVE',durationType:'TIME',durationValue:360,targetType:'OPEN'}]}]},fingerprint:'a'.repeat(64),publishingEnabled:true}:{publicationState:'scheduled',calendarMatch:true};
  await route.fulfill({json});
 });
 await page.addScriptTag({path:'mile-device-sync.js'});
 await page.evaluate(()=>document.getElementById('fixture').innerHTML=mileDeviceSyncButton(state.workouts[0]));
 await page.getByRole('button',{name:'Sync to Garmin',exact:true}).click();
 await expect(page.getByText('Ready to send · 2026-11-28')).toBeVisible();
 expect(calls.map(c=>c.action)).toEqual(['status_session','preview_session']);
 await page.getByRole('button',{name:'Send to Garmin',exact:true}).click();
 await expect(page.getByText(/Garmin calendar entry confirmed/)).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session')).toHaveLength(1);
 expect(calls.find(c=>c.action==='publish_session')).toMatchObject({sessionId:id,confirmed:true,approvedFingerprint:'a'.repeat(64)});
 await page.getByRole('button',{name:'Check status'}).click();
 await expect(page.getByText(/Garmin calendar entry confirmed/)).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session')).toHaveLength(1);
 await expect(page.getByRole('button',{name:'Send to Garmin',exact:true})).toBeHidden();
});
