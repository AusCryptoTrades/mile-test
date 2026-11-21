const {test,expect}=require('@playwright/test');
for(const [route,view] of [['mile-run-tracker.html','tracker'],['mile-challenges.html','challenges']]){
 test('standalone '+route+' redirects into the real MILE shell',async({page})=>{
  await page.goto('/'+route);
  await expect.poll(()=>new URL(page.url()).searchParams.get('mileView')).toBe(view);
  expect(new URL(page.url()).pathname).toMatch(/index.html$/);
 });
}
test('run tracker shell navigation to Home and Track is wired',async({page})=>{
 await page.goto('/index.html?mileView=tracker');
 await page.waitForTimeout(800);
 if(await page.locator('#v4Gate').isVisible())test.skip(true,'Signed-in beta session required');
 await expect(page.locator('#mile-native-view')).toBeVisible();
 await page.locator('#mile-fixed-mobile-nav [data-mile-page="dashboard"]').click();
 await expect(page.locator('#mile-native-view')).toHaveCount(0);
 expect(new URL(page.url()).searchParams.has('mileView')).toBe(false);
 await page.locator('#mile-fixed-mobile-nav [data-mile-page="track"]').click();
 await expect(page.locator('#mile-native-view')).toBeVisible();
});
test('tracker does not show metrics before Begin Run',async({page})=>{
 await page.goto('/mile-run-tracker.html?embedded=1');
 await expect(page.locator('#liveRun')).toBeHidden();
 await expect(page.locator('#start')).toBeVisible();
});
