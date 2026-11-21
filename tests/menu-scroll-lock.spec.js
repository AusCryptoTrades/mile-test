const {test,expect}=require('@playwright/test');
test('More menu locks background scrolling and restores position',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{document.body.style.minHeight='3000px';window.scrollTo(0,420);window.mileV3ToggleMore()});
 await expect(page.locator('#mile-emergency-more')).toHaveClass(/open/);
 await expect(page.locator('body')).toHaveClass(/mile-menu-scroll-locked/);
 const top=await page.evaluate(()=>document.body.style.top);
 expect(top).toMatch(/-\d+px/);
 await page.locator('#mile-emergency-more [data-close]').click();
 await expect(page.locator('body')).not.toHaveClass(/mile-menu-scroll-locked/);
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThanOrEqual(400);
});
test('Social drawer locks background while allowing drawer scroll',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{document.body.style.minHeight='3000px';window.scrollTo(0,300);window.m36Drawer()});
 await expect(page.locator('#m36-drawer')).toBeVisible();
 await expect(page.locator('body')).toHaveClass(/mile-menu-scroll-locked/);
 await expect(page.locator('#m36-drawer')).toHaveCSS('overflow-y','auto');
 await page.evaluate(()=>window.m36CloseDrawer());
 await expect(page.locator('body')).not.toHaveClass(/mile-menu-scroll-locked/);
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThanOrEqual(280);
});