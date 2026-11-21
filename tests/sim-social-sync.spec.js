const {test,expect}=require('@playwright/test');
test('SIM results expose explicit Social Feed action',async({page})=>{
 await page.goto('/mile-sim.html');
 await expect(page.locator('#publishSim')).toHaveCount(1);
 await expect(page.locator('#publishSim')).toBeHidden();
});
test('prior completed SIM is recovered and publish action becomes available',async({page})=>{
 await page.addInitScript(()=>{
 const started=Date.now()-3600000;
 const stages=[{name:'Run 1',type:'run'},{name:'SkiErg',type:'station'}];
 const saved={started,ended:started+600000,distance:1000,rox:'none',stages,taps:[started+300000,started+600000],finished:true};
 localStorage.setItem('mile-sim-v1',JSON.stringify(saved));
 localStorage.setItem('mile-sim-history-v1',JSON.stringify([saved]));
 });
 await page.goto('/mile-sim.html');
 await expect(page.locator('#results')).toBeVisible();
 await expect(page.locator('#publishSim')).toBeVisible();
 await page.locator('#publishSim').click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('mile-sim-publish-intent-v1'))).toContain('mile-sim-');
});
test('authenticated app includes SIM cloud sync module',async({page})=>{
 await page.goto('/index.html');
 await expect.poll(()=>page.evaluate(()=>typeof window.mileSimSync)).toBe('function');
});

test('SIM sync saves privately and explicit publish updates the same record',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(async()=>{
  const started=Date.now()-3700000;
  const s={started,ended:started+600000,distance:1000,rox:'none',stages:[{name:'Run 1',type:'run'},{name:'SkiErg',type:'station'}],taps:[started+300000,started+600000],finished:true};
  localStorage.setItem('mile-sim-history-v1',JSON.stringify([s]));
  window.__simCalls=[];
  window.mileChallengesUserId=()=> '00000000-0000-4000-8000-000000000001';
  window.m383SocialApi=async(table,method,payload)=>{
   window.__simCalls.push({method,payload});
   if(method==='GET')return [];
   if(method==='POST')return [{id:'11111111-1111-4111-8111-111111111111'}];
   return [];
  };
  await window.mileSimSync();
 });
 await expect.poll(()=>page.evaluate(()=>window.__simCalls.find(x=>x.method==='POST')?.payload.visibility)).toBe('private');
 await expect.poll(()=>page.evaluate(()=>window.__simCalls.find(x=>x.method==='POST')?.payload.detail_snapshot.stages.length)).toBe(2);
});
