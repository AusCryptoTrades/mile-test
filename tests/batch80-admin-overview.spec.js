const {test,expect}=require('@playwright/test');
const fakeToken='test-admin-token';
async function open(page,allowed=true){
 await page.goto('/index.html');
 await page.evaluate(({fakeToken,allowed})=>{sessionStorage.setItem('av-token',fakeToken);window.mileBetaIsAdmin=()=>allowed;window.mileBetaAdmin();},{fakeToken,allowed});
}
test('non-admin cannot open the admin overview or request metrics',async({page})=>{
 let requests=0;await page.route('**/functions/v1/mile-admin-overview?*',r=>{requests++;return r.fulfill({status:403,body:'{}'})});
 await open(page,false);await expect(page.locator('#mile-admin-centre')).toHaveCount(0);expect(requests).toBe(0);
});
test('admin overview renders server counts and changes date range without a new page',async({page})=>{
 await page.route('**/functions/v1/mile-admin-overview?*',r=>{const days=Number(new URL(r.request().url()).searchParams.get('days'));return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({days,metrics:{athletes:5,new_athletes:days===7?1:3,garmin_activities:14,open_reports:2},growth:[{day:'2026-11-01',total:2},{day:'2026-11-25',total:5}],generated_at:'2026-11-25T00:00:00Z'})})});
 await open(page);
 const panel=page.locator('#mile-admin-centre');await expect(panel.getByRole('heading',{name:'Admin Centre'})).toBeVisible();
 await expect(panel.locator('[data-metric=athletes] .ma-value')).toHaveText('5');await expect(panel.locator('[data-metric=new_athletes] .ma-value')).toHaveText('1');
 await expect(panel.locator('.ma-chart polyline')).toHaveCount(1);
 await expect(panel.locator('[data-metric=premium_members] .ma-value')).toHaveText('—');
 await panel.getByRole('button',{name:'30 days',exact:true}).click();
 await expect(panel.locator('[data-metric=new_athletes] .ma-value')).toHaveText('3');
 await expect(panel.getByRole('button',{name:'30 days',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await panel.getByRole('button',{name:'‹ Settings'}).click();await expect(panel).toHaveCount(0);
});
test('server denial exposes no metrics or report entry and retry stays available',async({page})=>{
 await page.route('**/functions/v1/mile-admin-overview?*',r=>r.fulfill({status:403,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"error":"Administrator access required"}'}));
 await open(page);const panel=page.locator('#mile-admin-centre');
 await expect(panel.getByRole('status')).toContainText('Administrator access could not be verified');
 await expect(panel.locator('.ma-value')).toHaveCount(0);await expect(panel.locator('[data-ma-reports]')).toBeDisabled();
 await expect(panel.getByRole('button',{name:'Refresh overview'})).toBeEnabled();
});
