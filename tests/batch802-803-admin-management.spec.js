const {test,expect}=require('@playwright/test');
async function open(page){
 await page.route('**/functions/v1/mile-admin-overview?*',r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({days:7,metrics:{athletes:2},growth:[],generated_at:'2026-11-25T00:00:00Z'})}));
 await page.goto('/index.html');await page.evaluate(()=>{sessionStorage.setItem('av-token','test-admin-token');window.mileBetaIsAdmin=()=>true;window.mileBetaAdmin()});
 await expect(page.locator('#mile-admin-centre .ma-status')).toContainText('Overview data connected');
 return page.locator('#mile-admin-centre');
}
const response=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,PATCH,OPTIONS'},body:JSON.stringify(body)});
test('80.2 athlete management searches and filters server records',async({page})=>{
 let query;
 await page.route('**/functions/v1/mile-admin-management?*',r=>{query=new URL(r.request().url()).searchParams;const rows=query.get('q')==='missing'?[]:[{display_name:'Test athlete',username:'runner',garmin:true,premium:false,activities_30d:6,primary_sport:'Running'}];return response(r,{rows,has_more:false})});
 const panel=await open(page);await panel.getByRole('button',{name:'Athlete Management'}).click();
 await expect(panel.locator('[data-ma-list=athletes]')).toContainText('Test athlete');await expect(panel.locator('[data-ma-list=athletes]')).toContainText('Garmin activities (30 days): 6');
 await panel.getByLabel('Athlete filter').selectOption('garmin');await expect.poll(()=>query?.get('filter')).toBe('garmin');
 await panel.getByLabel('Search name or username').fill('missing');await panel.getByRole('button',{name:'Search',exact:true}).click();
 await expect(panel.locator('.ma-management')).toContainText('No matching records');await expect(panel.locator('[data-ma-list=athletes] article')).toHaveCount(0);
 await panel.getByRole('button',{name:'‹ Overview'}).click();await expect(panel.locator('.ma-management form')).toHaveCount(0);
});
test('80.3 feedback uses explicit save, server confirmation and refresh',async({page})=>{
 let status='new',patch;
 await page.route('**/functions/v1/mile-admin-management?*',async r=>{
  if(r.request().method()==='OPTIONS')return response(r,{});
  if(r.request().method()==='PATCH'){patch=r.request().postDataJSON();status=patch.status;return response(r,{report:{status}})}
  return response(r,{rows:[{id:'00000000-0000-4000-8000-000000000001',kind:'bug',page:'Calendar',description:'Calendar layout issue',status}],counts:[{status,count:1}],has_more:false});
 });
 const panel=await open(page);await panel.getByRole('button',{name:'Beta reports & feedback'}).click();
 await expect(panel.locator('[data-ma-list=feedback]')).toContainText('Calendar layout issue');
 const select=panel.getByLabel('Update report status');await expect(select).toHaveValue('new');
 await select.selectOption('investigating');expect(patch).toBeUndefined();
 await panel.getByRole('button',{name:'Save status'}).click();
 await expect.poll(()=>patch?.expected_status).toBe('new');await expect.poll(()=>status).toBe('investigating');
 await expect(panel.locator('.ma-management')).toContainText('Investigating: 1');
 await expect(select).toHaveValue('investigating');
});
test('80.3 server denial keeps private records hidden',async({page})=>{
 await page.route('**/functions/v1/mile-admin-management?*',r=>response(r,{error:'Administrator access required'},403));
 const panel=await open(page);await panel.getByRole('button',{name:'Beta reports & feedback'}).click();
 await expect(panel.locator('.ma-management')).toContainText('Administrator access could not be verified');
 await expect(panel.locator('[data-ma-list=feedback] article')).toHaveCount(0);
});
