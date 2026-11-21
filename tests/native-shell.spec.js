const {test,expect}=require('@playwright/test');
test('tracker is mounted under original MILE header and navigation',async({page})=>{
 await page.goto('/index.html?mileView=tracker');
 await page.waitForTimeout(1200);
 // The app may require a signed-in beta session before showing the shell.
 const gate=page.locator('#v4Gate');
 if(await gate.isVisible())test.skip(true,'Signed-in MILE session required for native shell');
 await expect(page.locator('.shell > header.top')).toBeVisible();
 await expect(page.locator('#mile-native-view')).toBeVisible();
 await expect(page.locator('#mile-fixed-mobile-nav, #nav').first()).toBeAttached();
 const tracker=page.frameLocator('#mile-native-view');
 await expect(tracker.locator('#start')).toBeVisible();
 await expect(tracker.locator('#liveRun')).toBeHidden();
});
test('standalone tracker hides live metrics until run starts',async({page})=>{
 await page.goto('/mile-run-tracker.html');
 await expect(page.locator('#start')).toBeVisible();
 await expect(page.locator('#liveRun')).toBeHidden();
});
test('embedded challenge and tracker do not duplicate main header',async({page})=>{
 for(const route of ['mile-challenges.html','mile-run-tracker.html']){
  await page.goto('/'+route+'?embedded=1');
  await expect(page.locator('header.mile-standalone-main-header')).toBeHidden();
 }
});
