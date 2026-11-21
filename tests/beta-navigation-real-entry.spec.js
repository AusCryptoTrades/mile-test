const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.goto('/index.html');await expect.poll(()=>page.evaluate(()=>typeof window.mileShellOpen)).toBe('function')});
test('Challenge drawer entry opens inside existing document, without login splash or redirect',async({page})=>{
 const original=page.url();await page.evaluate(()=>{const b=document.createElement('button');b.dataset.mileChallengesLink='';b.id='test-challenge-entry';document.body.append(b);b.click()});
 await expect(page.locator('#mile-native-view[data-view="challenges"]')).toHaveCount(1);
 await expect.poll(()=>new URL(page.url()).searchParams.get('mileView')).toBe('challenges');
 expect(new URL(page.url()).pathname).toBe(new URL(original).pathname);
 await expect(page.locator('#mile-native-view')).toHaveAttribute('src',/mile-challenges\.html\?embedded=1/);
});
test('Track opens in-place without a second full page navigation',async({page})=>{
 const original=page.url();await page.evaluate(()=>window.mileOpenRunTracker());
 await expect(page.locator('#mile-native-view[data-view="tracker"]')).toHaveCount(1);
 await expect.poll(()=>new URL(page.url()).searchParams.get('mileView')).toBe('tracker');
 expect(new URL(page.url()).pathname).toBe(new URL(original).pathname);
 await expect(page.locator('#mile-native-view')).toHaveAttribute('src',/mile-run-tracker\.html\?embedded=1/);
});
test('switching from Tracker to Challenges preserves shared shell',async({page})=>{
 await page.evaluate(()=>window.mileOpenRunTracker());
 await expect(page.locator('#mile-native-view[data-view="tracker"]')).toHaveCount(1);
 await page.evaluate(()=>window.mileOpenChallenges());
 await expect(page.locator('#mile-native-view[data-view="challenges"]')).toHaveCount(1);
 await expect(page.locator('#mile-native-view')).toHaveCount(1);
});
test('logo navigates to Home from Challenges',async({page})=>{
 await page.evaluate(()=>window.mileOpenChallenges());
 await expect(page.locator('#mile-native-view[data-view="challenges"]')).toHaveCount(1);
 await page.locator('.top .brand').first().click();
 await expect(page.locator('#mile-native-view')).toHaveCount(0);
 await expect.poll(()=>new URL(page.url()).searchParams.has('mileView')).toBe(false);
});
