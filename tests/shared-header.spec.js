const {test,expect}=require('@playwright/test');
for(const route of ['mile-challenges.html','mile-run-tracker.html']){
 test(route+' uses the exact shared MILE header and iPhone safe area',async({page})=>{
  await page.goto('/'+route);
  const header=page.locator('header.mile-standalone-main-header');
  await expect(header).toBeVisible();
  await expect(header.locator('.brand')).toHaveText('MILE.');\n  await expect(header.locator('.eyebrow')).toHaveText('MAKE IT LOOK EASY.');\n  await expect(header.locator('.mile-header-news')).toBeVisible();
  await expect(header.locator('.mile-header-signout')).toBeVisible();
  await expect(header.locator('.mile-header-profile')).toBeVisible();
  await expect(header).toHaveCSS('background-color','rgb(34, 34, 34)');
  const rect=await header.boundingBox();
  expect(rect).toBeTruthy();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x+rect.width).toBeLessThanOrEqual(page.viewportSize().width+1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  expect(overflow).toBe(false);
 });
}
test('challenges navigation stays visible on mobile',async({page})=>{
 await page.goto('/mile-challenges.html');
 const nav=page.locator('#mile-challenge-bottom-nav');
 await expect(nav).toBeVisible();
 await expect(nav.locator('button')).toHaveCount(5);
 await expect(nav.locator('[data-go="tracker"]')).toBeVisible();
});
test('tracker remains operable after shared header loads',async({page})=>{
 await page.goto('/mile-run-tracker.html');
 await expect(page.locator('#workout')).toBeVisible();
 await expect(page.locator('#start')).toBeVisible();
 await expect(page.locator('#home')).toHaveCount(0);
});
