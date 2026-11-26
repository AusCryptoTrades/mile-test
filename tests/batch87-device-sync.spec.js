const {test,expect}=require('@playwright/test');
const id='e87b0000-0000-4000-8000-000000000001';
const id2='e87b0000-0000-4000-8000-000000000002';
const id3='e87b0000-0000-4000-8000-000000000003';
const detail='Warm-up: 2 min. Main: 6 min easy. Cooldown: 2 min.';
async function fixture(page,mode='single',failure=false){
 const calls=[],submitted=new Set();let allowRecovery=false,limited=false;
 await page.goto('/mile-device-sync.js');
 await page.setContent('<!doctype html><html><head></head><body><div id="fixture"></div></body></html>');
 await page.evaluate(({id,id2,id3,detail})=>{
  window.userId='athlete-fixture';window.token='test-only';window.today=()=> '2026-11-27';window.add=()=> '2026-12-11';window.nice=d=>d;window.notice=()=>{};window.navigate=()=>{};
  window.sbHeaders=()=>({'Content-Type':'application/json'});
  const w={block:'plan-1',sport:'Running',status:'planned',name:'Easy run',detail,structuredDetail:detail,structuredSteps:[{kind:'step'}]};
  window.state={settings:{supabaseUrl:location.origin},blocks:[{id:'plan-1',name:'Running endurance',sport:'Running',v42:{weeks:4,days:3}}],workouts:[{...w,id,date:'2026-11-28'},{...w,id:id2,date:'2026-11-29'},{...w,id:id3,date:'2026-12-22'}]};
 },{id,id2,id3,detail});
 await page.route('**/functions/v1/mile-garmin-device-sync',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  if(body.action==='publish_session'&&failure==='rate'&&!limited){limited=true;await route.fulfill({status:429,json:{error:'Rate limited',rateLimited:true,retryAfterSeconds:1,retrySafe:true,publicationState:'not_published'}});return}
  if(body.action==='publish_session'&&failure===true&&!allowRecovery){submitted.add(body.sessionId);await route.fulfill({status:409,json:{error:'Publication outcome requires verification'}});return}
  const date=body.sessionId===id?'2026-11-28':'2026-11-29';
  let json;
  if(body.action==='status_session'){const n=calls.filter(c=>c.action==='status_session'&&c.sessionId===body.sessionId).length;if(failure===true&&submitted.has(body.sessionId)&&n>=3)allowRecovery=true;json=submitted.has(body.sessionId)?{publicationState:'scheduled',calendarMatch:failure!==true||allowRecovery}:{publicationState:'not_published'};}
  else if(body.action==='preview_session')json={date,payload:{workoutName:'Easy run',description:detail,segments:[{steps:[{type:'WorkoutStep',intensity:'ACTIVE',durationType:'TIME',durationValue:360,targetType:'OPEN'}]}]},fingerprint:'a'.repeat(64),publishingEnabled:true};
  else{submitted.add(body.sessionId);json={publicationState:'scheduled',calendarMatch:true}}
  await route.fulfill({json});
 });
 await page.addScriptTag({path:'mile-device-sync.js'});
 if(mode==='created')await page.evaluate(()=>milePlanCreated('plan-1'));
 else await page.evaluate(mode=>document.getElementById('fixture').innerHTML=mode==='plan'?mileDevicePlanButton(state.blocks[0]):mileDeviceSyncButton(state.workouts[0]),mode);
 return calls;
}
test('manual device sync previews once and publishes only after consent',async({page})=>{
 const calls=await fixture(page);
 await page.getByRole('button',{name:'Sync to Device',exact:true}).click();
 expect(calls).toHaveLength(0);
 await expect(page.getByRole('button',{name:/Apple Watch/})).toBeDisabled();
 await page.getByRole('button',{name:/Garmin Connect/}).click();
 await expect(page.getByRole('heading',{name:'Ready to sync'})).toBeVisible();
 expect(calls.map(c=>c.action)).toEqual(['status_session','preview_session']);
 await page.getByRole('button',{name:'Sync workout',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Workout synced.'})).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session')).toHaveLength(1);
 expect(calls.find(c=>c.action==='publish_session')).toMatchObject({sessionId:id,confirmed:true,approvedFingerprint:'a'.repeat(64)});
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Sync to Device',exact:true}).click();
 await page.getByRole('button',{name:/Garmin Connect/}).click();
 await expect(page.getByRole('heading',{name:'Device sync status'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Sync workout',exact:true})).toHaveCount(0);
 expect(calls.filter(c=>c.action==='publish_session')).toHaveLength(1);
});
test('programme sync reviews only eligible upcoming sessions and sends each once',async({page})=>{
 const calls=await fixture(page,'plan');
 await page.getByRole('button',{name:'Sync to Device',exact:true}).click();
 await page.getByRole('button',{name:/Garmin Connect/}).click();
 await expect(page.getByRole('button',{name:'Sync 2 workouts'})).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session')).toHaveLength(0);
 await page.getByRole('button',{name:'Sync 2 workouts'}).click();
 await expect(page.getByRole('heading',{name:'Training synced.'})).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session').map(c=>c.sessionId)).toEqual([id,id2]);
 expect(calls.some(c=>c.sessionId===id3)).toBeFalsy();
});
test('uncertain submission stops later writes and supports read-only status',async({page})=>{
 const calls=await fixture(page,'plan',true);
 await page.getByRole('button',{name:'Sync to Device',exact:true}).click();
 await page.getByRole('button',{name:/Garmin Connect/}).click();
 await page.getByRole('button',{name:'Sync 2 workouts'}).click();
 await expect(page.getByRole('heading',{name:'Sync submitted.'})).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session').map(c=>c.sessionId)).toEqual([id]);
 await page.getByRole('button',{name:'Check Garmin'}).click();
 await expect(page.getByRole('button',{name:'Review remaining workouts'})).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session')).toHaveLength(1);
 await page.getByRole('button',{name:'Review remaining workouts'}).click();
 await page.getByRole('button',{name:'Sync remaining workouts'}).click();
 await expect(page.getByRole('heading',{name:'Training synced.'})).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session').map(c=>c.sessionId)).toEqual([id,id2]);
});
test('created plan shows success and optional device sync without publishing automatically',async({page})=>{
 const calls=await fixture(page,'created');
 await expect(page.getByRole('heading',{name:'You’re ready to train.'})).toBeVisible();
 expect(calls).toHaveLength(0);
 await page.getByRole('button',{name:'Sync to Device',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sync to Device'})).toBeVisible();
 expect(calls).toHaveLength(0);
});

test('rate limit before creation pauses without immediate readback or duplicate writes',async({page})=>{
 const calls=await fixture(page,'plan','rate');
 await page.getByRole('button',{name:'Sync to Device',exact:true}).click();
 await page.getByRole('button',{name:/Garmin Connect/}).click();
 await page.getByRole('button',{name:'Sync 2 workouts'}).click();
 await expect(page.getByRole('button',{name:'Review remaining workouts'})).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session').map(c=>c.sessionId)).toEqual([id]);
 expect(calls.at(-1).action).toBe('publish_session');
 await page.waitForTimeout(1100);
 await page.getByRole('button',{name:'Review remaining workouts'}).click();
 await page.getByRole('button',{name:'Sync remaining workouts'}).click();
 await expect(page.getByRole('heading',{name:'Training synced.'})).toBeVisible();
 expect(calls.filter(c=>c.action==='publish_session').map(c=>c.sessionId)).toEqual([id,id,id2]);
});
