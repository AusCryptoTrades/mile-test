const {test,expect}=require('@playwright/test');
test('page headings and navigation remain consistent',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(()=>{v4Ready=true;document.getElementById('v4Gate').classList.add('hidden');render()});
 await expect(page.locator('#mile-fixed-mobile-nav:visible, #nav:visible').first()).toBeVisible({timeout:15000});
 let baseline;
 for(const dest of ['calendar','builder','performance','insights','events','predictor','goals','recovery','settings']){
  await page.evaluate(p=>window.mileV3Go(p),dest);
  await expect(page.locator('body')).not.toHaveClass(/mile-compact-heading/);
  await expect(page.locator('#mile-fixed-mobile-nav:visible, #nav:visible').first()).toBeVisible();
  await expect(page.locator('#mile-fixed-mobile-nav:visible, #nav:visible').first().locator('button')).toHaveCount(5);
  const hero=page.locator('#app > .mile-universal-header');
  await expect(hero).toHaveCount(1);
  await expect(hero).toBeVisible();
  await expect(hero).toHaveCSS('height','116px');
  await expect(hero.locator('h1')).toHaveCSS('font-size','26px');
  const rect=await hero.boundingBox();
  if(!baseline)baseline=rect;
  expect(Math.abs(rect.x-baseline.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(rect.width-baseline.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(rect.y-baseline.y)).toBeLessThanOrEqual(4);
 }
});
test('messages retains bottom navigation',async({page})=>{
 await page.goto('/index.html');
 await page.evaluate(()=>{v4Ready=true;document.getElementById('v4Gate').classList.add('hidden');render()});
 await expect(page.locator('#mile-fixed-mobile-nav:visible, #nav:visible').first()).toBeVisible({timeout:15000});
 await page.evaluate(()=>{navigate('social');if(!window.m36State)throw Error('Social state unavailable');window.m36State.tab='messages';render()});
 await expect(page.locator('#mile-fixed-mobile-nav:visible, #nav:visible').first()).toBeVisible();
 await expect(page.locator('#nav button')).toHaveCount(5);
 await expect(page.locator('body')).toHaveClass(/mile-messages-nav/);
});

test('mobile drawers have no oversized bottom padding and every menu row has an outline',async({page},testInfo)=>{
 test.skip(!testInfo.project.name.startsWith('mobile'),'mobile-only menu geometry');
 await page.goto('/index.html');
 await page.evaluate(()=>{v4Ready=true;document.getElementById('v4Gate').classList.add('hidden');render();window.m36Drawer()});
 const social=page.locator('#m36-drawer');
 await expect(social).toBeVisible();
 const socialMetrics=await social.evaluate(el=>{const cs=getComputedStyle(el);return {paddingBottom:parseFloat(cs.paddingBottom),scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,rows:[...el.querySelectorAll('.m320-drawer-link')].map(b=>({border:getComputedStyle(b).borderTopWidth,bottom:getComputedStyle(b).borderBottomWidth}))}});
 expect(socialMetrics.paddingBottom).toBeLessThan(45);
 expect(socialMetrics.rows.length).toBeGreaterThan(4);
 for(const row of socialMetrics.rows){expect(parseFloat(row.border)).toBeGreaterThanOrEqual(1);expect(parseFloat(row.bottom)).toBeGreaterThanOrEqual(1)}
 await page.evaluate(()=>{window.m36CloseDrawer();window.mileV3ToggleMore()});
 const more=page.locator('#mile-emergency-more.open');
 await expect(more).toBeVisible();
 const moreMetrics=await more.evaluate(el=>({paddingBottom:parseFloat(getComputedStyle(el).paddingBottom),rows:[...el.querySelectorAll('.em-link')].map(b=>({top:getComputedStyle(b).borderTopWidth,bottom:getComputedStyle(b).borderBottomWidth}))}));
 expect(moreMetrics.paddingBottom).toBeLessThan(45);
 expect(moreMetrics.rows.length).toBeGreaterThan(5);
 for(const row of moreMetrics.rows){expect(parseFloat(row.top)).toBeGreaterThanOrEqual(1);expect(parseFloat(row.bottom)).toBeGreaterThanOrEqual(1)}
});
