const {test,expect}=require('@playwright/test');
test('MILE starts without a blank page or JavaScript page errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 const diagnostic=await page.evaluate(()=>({title:document.title,bodyText:document.body?.innerText?.slice(0,250)||'',bodyRect:document.body?.getBoundingClientRect().toJSON(),visibleNodes:[...document.querySelectorAll('button,input,h1,h2,main,header')].filter(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'}).length}));
 console.log('MILE startup diagnostic',JSON.stringify(diagnostic));
 expect(diagnostic.title).toContain('MILE');
 expect(diagnostic.visibleNodes,'No visible interactive or heading elements: inspect screenshot and authentication/bootstrap').toBeGreaterThan(0);
 expect(errors,'Uncaught page errors').toEqual([]);
});
test('Activity Details mobile header and Back button stay on-screen and clickable',async({page,isMobile})=>{
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  const overlay=document.createElement('div');overlay.id='mile35-detail';overlay.className='mile35-backdrop';
  overlay.innerHTML='<div class="mile35-view"><div class="mile35-top"><button type="button" class="mile35-back" data-mile35-close>‹ Back</button><div class="mile35-logo">MILE.</div></div><div class="mile35-hero"><h1>Activity Details</h1></div></div>';
  document.body.append(overlay);
 });
 const back=page.locator('#mile35-detail .mile35-back');await expect(back).toBeVisible();
 const bounds=await back.boundingBox();expect(bounds).not.toBeNull();
 const viewport=page.viewportSize();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);
 expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width+1);
 expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height+1);
 const hit=await back.evaluate(el=>{const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return top===el||el.contains(top)});
 expect(hit).toBe(true);
});
test('Activity chart containers do not overflow phone viewport',async({page})=>{
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  const el=document.createElement('div');el.id='mile35-detail';el.className='mile35-backdrop';
  el.innerHTML='<div class="mile35-view"><section class="mile35-panel"><div class="mile355-chart"><svg viewBox="0 0 720 300"><text x="70" y="267">0:00</text><text x="694" y="267" text-anchor="end">45:00</text></svg></div></section></div>';
  document.body.append(el);
 });
 const dims=await page.locator('#mile35-detail .mile355-chart').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,viewport:innerWidth}));
 expect(dims.left).toBeGreaterThanOrEqual(-1);expect(dims.right).toBeLessThanOrEqual(dims.viewport+1);
});
