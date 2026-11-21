const {test,expect}=require('@playwright/test');
test('page headings and navigation remain consistent',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(()=>{v4Ready=true;document.getElementById('v4Gate').classList.add('hidden');render()});
 await expect(page.locator('#nav')).toBeVisible({timeout:15000});
 for(const dest of ['insights','events','predictor','goals','recovery','settings']){
  await page.evaluate(p=>window.mileV3Go(p),dest);
  await expect(page.locator('body')).toHaveClass(/mile-compact-heading/);
  await expect(page.locator('#nav')).toBeVisible();
  await expect(page.locator('#nav button.active')).toHaveCount(1);
  const hero=page.locator('#app .mile-v32-hero,#app .mile-v33-hero,#app .mile35-hero,#app .m395-hero,#app .mile-v32-banner,#app .mile-v33-banner,#app .m395-page-hero').first();
  if(await hero.count())await expect(hero).toHaveCSS('min-height','0px');
 }
});
test('messages retains bottom navigation',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(()=>{v4Ready=true;document.getElementById('v4Gate').classList.add('hidden');render()});
 await expect(page.locator('#nav')).toBeVisible({timeout:15000});
 await page.evaluate(()=>{navigate('social');if(!window.m36State)throw Error('Social state unavailable');window.m36State.tab='messages';render()});
 await expect(page.locator('#nav')).toBeVisible();
 await expect(page.locator('#nav button')).toHaveCount(5);
 await expect(page.locator('body')).toHaveClass(/mile-messages-nav/);
});
