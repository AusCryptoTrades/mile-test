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
