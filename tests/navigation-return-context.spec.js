const {test,expect}=require('@playwright/test');
test('navigation return context is installed',async({page})=>{
 await page.goto('/index.html');
 await expect.poll(()=>page.evaluate(()=>typeof window.mileShowWhatsNewFromCurrent)).toBe('function');
 await expect.poll(()=>page.evaluate(()=>typeof window.m397CloseWhatsNew)).toBe('function');
});
test('tracker entry keeps setup hidden before run',async({page})=>{
 await page.goto('/mile-run-tracker.html?embedded=1');
 await expect(page.locator('#start')).toBeVisible();
 await expect(page.locator('#liveRun')).toBeHidden();
});
