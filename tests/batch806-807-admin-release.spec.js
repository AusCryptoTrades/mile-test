const {test,expect}=require('@playwright/test');
const response=(r,body,status=200)=>r.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'},body:JSON.stringify(body)});
async function open(page){
 await page.route('**/functions/v1/mile-admin-overview?*',r=>response(r,{days:7,metrics:{athletes:4},growth:[],generated_at:'2026-11-25T00:00:00Z'}));
 await page.goto('/index.html');await page.evaluate(()=>{sessionStorage.setItem('av-token','test-admin-token');window.mileBetaIsAdmin=()=>true;window.mileBetaAdmin()});
 await expect(page.locator('#mile-admin-centre .ma-status')).toContainText('Overview data connected');return page.locator('#mile-admin-centre');
}
test('80.6 draft creation does not publish; cancel and explicit confirmation control publishing',async({page})=>{
 let records=[],posts=[];const id='00000000-0000-4000-8000-000000000006';
 await page.route('**/functions/v1/mile-admin-release?*',r=>{
  if(r.request().method()==='OPTIONS')return response(r,{});
  if(r.request().method()==='POST'){
   const p=r.request().postDataJSON();posts.push(p);
   if(p.action==='draft'){records=[{id,title:p.title,body:p.body,kind:p.kind,status:'draft'}];return response(r,{announcement:records[0]},201)}
   records=[{...records[0],status:'published',recipient_count:4}];return response(r,{announcement:records[0]});
  }return response(r,{rows:records,audience:4,has_more:false});
 });
 const panel=await open(page);await panel.getByRole('button',{name:'Announcements & Releases'}).click();
 await expect(panel.locator('[data-ma-release=announcements]')).toContainText('Current audience: 4');
 await panel.getByLabel('Announcement title').fill('Release 80');await panel.getByLabel('Announcement message').fill('New admin centre available');await panel.getByRole('button',{name:'Save draft'}).click();
 const publish=panel.getByRole('button',{name:'Publish to athletes'});await expect(publish).toBeVisible();expect(posts.map(x=>x.action)).toEqual(['draft']);
 page.once('dialog',d=>d.dismiss());await publish.click();expect(posts).toHaveLength(1);
 page.once('dialog',d=>d.accept());await publish.click();await expect(panel.locator('[data-ma-release=announcements]')).toContainText('4 recipient notifications created');expect(posts[1]).toEqual({action:'publish',id,confirm:true});await expect(publish).toHaveCount(0);
});
test('80.7 security audit shows server results without overstating coverage',async({page})=>{
 await page.route('**/functions/v1/mile-admin-release?*',r=>response(r,{security:{admin_accounts:1,public_tables_without_rls:0,recorded_admin_actions:1},rows:[{action:'feedback.status',target_id:'report-1',detail:{from:'new',to:'fixed'},display_name:'Test admin'}],has_more:false}));
 const panel=await open(page);await panel.getByRole('button',{name:'Security & Audit Logs'}).click();const audit=panel.locator('[data-ma-release=security]');
 await expect(audit).toContainText('feedback.status');await expect(audit).toContainText('not a complete historical security audit');await audit.getByText('Change details').click();await expect(audit.getByText('{"from":"new","to":"fixed"}')).toBeVisible();
});
test('80.6 denied release endpoint disables creation and hides announcements',async({page})=>{
 await page.route('**/functions/v1/mile-admin-release?*',r=>response(r,{error:'Administrator access required'},403));
 const panel=await open(page);await panel.getByRole('button',{name:'Announcements & Releases'}).click();
 await expect(panel.locator('.ma-management')).toContainText('Administrator access could not be verified');await expect(panel.getByRole('button',{name:'Save draft'})).toBeDisabled();await expect(panel.locator('[data-ma-release] article')).toHaveCount(0);
});