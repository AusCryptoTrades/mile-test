const {test,expect}=require('@playwright/test');
test('HYROX SIM no-Roxzone advances and saves splits',async({page})=>{
 await page.goto('/mile-sim.html');
 await expect(page.getByText('Train like race day.')).toBeVisible();
 await page.getByRole('button',{name:'START SIM'}).click();
 await expect(page.locator('#stage')).toHaveText('Run 1');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('SkiErg');
 await page.reload();
 await page.getByRole('button',{name:'Resume session'}).click();
 await expect(page.locator('#stage')).toHaveText('SkiErg');
 await page.getByRole('button',{name:'Undo last tap'}).click();
 await expect(page.locator('#stage')).toHaveText('Run 1');
});
test('HYROX SIM Roxzone stages are separately tracked',async({page})=>{
 await page.goto('/mile-sim.html');
 await page.getByText('Separate Roxzone entry and exit').click();
 await page.getByRole('button',{name:'START SIM'}).click();
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('Enter Roxzone 1');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('SkiErg');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('Exit Roxzone 1');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('Run 2');
});
test('SIM uses in-app page heading and respects iPhone safe area',async({page},testInfo)=>{
 await page.goto('/mile-sim.html');
 await expect(page.locator('#setup .page-title')).toHaveText('MILE SIM');
 await expect(page.locator('.top a')).toHaveText('← Back to Race Lab');
 await expect(page.locator('.top .brand')).toHaveCount(0);
 const metrics=await page.evaluate(()=>{
  const header=document.querySelector('.top').getBoundingClientRect();
  const title=document.querySelector('.page-title').getBoundingClientRect();
  return {headerTop:header.top,titleTop:title.top,headerBottom:header.bottom,width:document.documentElement.scrollWidth,viewport:innerWidth};
 });
 expect(metrics.headerTop).toBeGreaterThanOrEqual(18);
 expect(metrics.titleTop).toBeGreaterThan(metrics.headerBottom);
 expect(metrics.width).toBeLessThanOrEqual(metrics.viewport+1);
});
