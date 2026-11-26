const {test,expect}=require('@playwright/test');
const respond=(r,body)=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(body)});
test('81 compact admin metric layout and stable management navigation',async({page})=>{
 await page.route('**/functions/v1/mile-admin-overview?*',r=>respond(r,{days:7,metrics:{athletes:4,garmin_activities:297},growth:[],generated_at:'2026-11-25T00:00:00Z'}));
 let release;const gate=new Promise(resolve=>{release=resolve});
 await page.route('**/functions/v1/mile-admin-management?*',async r=>{await gate;await respond(r,{rows:[{display_name:'Test athlete',username:'runner',activities_30d:6}],has_more:false})});
 await page.goto('/index.html');
 await page.evaluate(()=>{sessionStorage.setItem('av-token','test-admin-token');window.mileBetaIsAdmin=()=>true;window.mileBetaAdmin()});
 const panel=page.locator('#mile-admin-centre');await expect(panel.locator('.ma-status')).toContainText('Overview data connected');
 const value=panel.locator('[data-metric=athletes] .ma-value');await expect(value).toHaveCSS('font-size','19px');
 const card=panel.locator('[data-metric=athletes]');expect(await card.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(85);
 await expect(panel.locator('.ma-chart')).toHaveCSS('height','78px');
 const button=panel.locator('.ma-tabs [data-ma-athletes]');await button.scrollIntoViewIfNeeded();
 // Snapshot the real click position, after browser actionability/focus scrolling.
 await button.evaluate(el=>el.addEventListener('click',()=>{window.m81BeforeClick=el.closest('#mile-admin-centre').scrollTop},{capture:true,once:true}));
 await button.click();
 const before=await page.evaluate(()=>window.m81BeforeClick);
 expect(Number.isFinite(before)).toBe(true);
 const heading=panel.getByRole('heading',{name:'Athlete Management'});await expect(heading).toBeVisible();
 await expect(heading).toBeFocused();expect(await panel.getByLabel('Search name or username').evaluate(el=>el!==document.activeElement)).toBe(true);
 const top=await heading.evaluate(el=>el.getBoundingClientRect().top);release();
 await expect(panel.locator('[data-ma-list=athletes]')).toContainText('Test athlete');
 expect(Math.abs(await heading.evaluate(el=>el.getBoundingClientRect().top)-top)).toBeLessThanOrEqual(4);
 expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await panel.getByRole('button',{name:'‹ Overview'}).click();await expect(panel.locator('[data-ma-overview]')).toBeFocused();
 await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeLessThanOrEqual(8);await expect(panel.locator('.ma-overview')).toBeVisible();
 await expect(button).toBeInViewport();
});
