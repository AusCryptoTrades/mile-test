const {test,expect}=require('@playwright/test');
test('HYROX SIM no-Roxzone advances and saves splits',async({page})=>{
 await page.goto('/mile-sim.html');
 await expect(page.getByText('Train like race day.')).toBeVisible();
 await page.getByRole('button',{name:'START SIM'}).click();
 await expect(page.locator('#stage')).toHaveText('Run 1 · 1000 m');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('SkiErg · 1000 m');
 await page.reload();
 await page.getByRole('button',{name:'Resume session'}).click();
 await expect(page.locator('#stage')).toHaveText('SkiErg · 1000 m');
 await page.getByRole('button',{name:'Undo last tap'}).click();
 await expect(page.locator('#stage')).toHaveText('Run 1 · 1000 m');
});
test('HYROX SIM Roxzone stages are separately tracked',async({page})=>{
 await page.goto('/mile-sim.html');
 await page.getByText('Separate Roxzone entry and exit').click();
 await page.getByRole('button',{name:'START SIM'}).click();
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('Enter Roxzone 1');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('SkiErg · 1000 m');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('Exit Roxzone 1');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('Run 2 · 1000 m');
});
test('SIM uses in-app page heading and respects iPhone safe area',async({page},testInfo)=>{
 await page.goto('/mile-sim.html');
 await expect(page.locator('#setup .page-title')).toHaveText('MILE SIM');
 await expect(page.locator('#backToRaceLab')).toContainText('Back');
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

test('SIM back button confirms exit and returns to Race Lab deep link',async({page})=>{
 await page.goto('/mile-sim.html');
 await page.locator('#start').click();
 await page.locator('#backToRaceLab').click();
 await expect(page.locator('#leaveModal')).toHaveClass(/open/);
 await page.locator('#stay').click();
 await expect(page.locator('#leaveModal')).not.toHaveClass(/open/);
 await page.locator('#backToRaceLab').click();
 const navigation=page.waitForRequest(request=>request.isNavigationRequest()&&request.url().includes('milePage=predictor'));
 await page.locator('#leave').click();
 await navigation;
 await expect(page).toHaveURL(/index\.html$/);
});
test('SIM split review edits an existing split',async({page})=>{
 await page.goto('/mile-sim.html');
 await page.locator('#start').click();
 await page.locator('#tap').click();
 await page.locator('#reviewBtn').click();
 await expect(page.locator('#review')).toBeVisible();
 page.once('dialog',dialog=>dialog.accept('04:30'));
 await page.locator('#reviewSplits button').first().click();
 await expect(page.locator('#reviewSplits')).toContainText('04:30');
 await page.locator('#reviewDone').click();
 await expect(page.locator('#live')).toBeVisible();
});

test('SIM half and custom presets persist configured distances and volumes',async({page})=>{
 await page.goto('/mile-sim.html');
 await page.locator('#preset').selectOption('half');
 await expect(page.locator('#distance')).toHaveValue('500');
 await page.getByText('Station volumes',{exact:true}).click();
 await expect(page.locator('#volume0')).toHaveValue('500');
 await expect(page.locator('#volume7')).toHaveValue('50');
 await page.locator('#preset').selectOption('full');
 await expect(page.locator('#distance')).toHaveValue('1000');
 await expect(page.locator('#volume0')).toHaveValue('1000');
 await page.locator('#distance').fill('750');
 await page.locator('#volume0').fill('600');
 await expect(page.locator('#preset')).toHaveValue('custom');
 await page.locator('#start').click();
 await expect(page.locator('#stage')).toHaveText('Run 1 · 750 m');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('SkiErg · 600 m');
 await page.reload();
 await page.locator('#resumeBtn').click();
 await expect(page.locator('#stage')).toHaveText('SkiErg · 600 m');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mile-sim-v1')));
 expect(saved.distance).toBe(750);
 expect(saved.stages[1].volume).toBe(600);
 expect(saved.taps).toHaveLength(1);
});

test('SIM follows every saved appearance theme',async({page})=>{
 const themes={forest:'rgb(9, 37, 26)',graphite:'rgb(23, 25, 28)',midnight:'rgb(10, 20, 42)',mono:'rgb(8, 8, 8)',light:'rgb(243, 246, 242)',sand:'rgb(241, 231, 214)',ice:'rgb(239, 248, 252)'};
 await page.goto('/mile-sim.html');
 for(const [theme,bg] of Object.entries(themes)){
  await page.evaluate(t=>localStorage.setItem('mile-appearance-v1',JSON.stringify({theme:t})),theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-m395-theme',theme);
  await expect(page.locator('body')).toHaveCSS('background-color',bg);
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 }
});
