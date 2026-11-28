const {test,expect}=require('@playwright/test');
const screenshot=require('./overnight-review-image');
test('swimming assessment and reviewed structured swim reach Calendar',async({page,baseURL},info)=>{
 const user={id:'00000000-0000-4000-8000-000000000191',email:'swimmer@example.test',email_confirmed_at:'2026-11-19T12:00:00Z'};
 const backend='https://mgixvokjlytjuypzcfzz.supabase.co';
 const recorded={id:'synthetic-swim',sport:'Swimming',type:'lap_swimming',date:'2026-11-18',distanceKm:1.2,durationSeconds:1600};
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===baseURL)return route.continue();
  if(url.origin!==backend)return route.abort();
  let json=[];
  if(url.pathname==='/auth/v1/token')json={access_token:'fixture-token',user};
  else if(url.pathname==='/auth/v1/user')json=user;
  else if(url.pathname==='/rest/v1/av_members')json=[{user_id:user.id}];
  else if(url.pathname==='/functions/v1/garmin-connection-status')json={status:'not_connected'};
  else if(url.pathname==='/rest/v1/av_training_data'&&route.request().method()==='GET')json=[{training_data:{activities:[recorded]}}];
  return route.fulfill({json,headers:{'access-control-allow-origin':baseURL}});
 });
 await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
 await page.goto('/');
 await page.locator('#v4Email').fill(user.email);
 await page.locator('#v4Password').fill('fixture-password');
 await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
 await page.locator('#v4Gate [onclick*="v4SkipGarmin"]').click();
 await page.evaluate(()=>window.mileV3Go('builder'));
 await page.locator('.sport-tile').filter({hasText:/Swimming$/}).first().click();
 const build=page.locator('.m91-build'),next=build.getByRole('button',{name:'Continue ›'});
 await build.getByLabel('Swimming goal').selectOption('endurance');
 await next.click();
 await expect(build.getByText('7 days',{exact:true})).toBeVisible();
 await expect(build.getByLabel('Sustainable weekly distance (m)')).toHaveValue('300');
 await build.getByLabel('Sustainable weekly distance (m)').fill('3300');
 await build.getByLabel('Swimming experience').selectOption('intermediate');
 await build.getByLabel('Comfortable continuous distance (m)').fill('1100');
 await build.getByLabel('How recovered do you feel?').selectOption('normal');
 await build.getByText('Optional pace and CSS',{exact:true}).click();
 await build.getByLabel('400 m trial (seconds)').fill('420');
 await build.getByLabel('200 m trial (seconds)').fill('200');
 await build.getByLabel('I completed both comparable trials recently').check();
 await build.getByRole('button',{name:'Calculate CSS',exact:true}).click();
 await expect(build.getByRole('status')).toContainText('110 seconds per 100 m');
 await next.click();
 await next.click();
 await next.click();
 const first=build.locator('.m882-week').first();
 await first.locator('summary').first().click();
 await first.locator('.m882-session > summary').first().click();
 await expect(first.getByText('Swim breakdown',{exact:true}).first()).toBeVisible();
 for(const theme of ['forest','graphite','midnight','mono','light','sand','ice']){
  await page.evaluate(value=>window.m395ThemeSet(value),theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await screenshot(info,'batch91-swimming-review',build);
 page.once('dialog',dialog=>dialog.accept());
 await build.getByRole('button',{name:'Create training plan'}).click();
 await expect(page.locator('#app .mile-universal-header')).toContainText('Calendar');
 const entry=await page.evaluate(()=>{
  const w=state.workouts.find(item=>item.swimmingPlanVersion===1);
  viewDate=w.date;calendarMonth=w.date.slice(0,7);render();
  return {name:w.name,meters:w.meters,expected:window.mileStructuredWorkout.totals(w.structuredSteps,{sport:'Swimming'}).meters,
   css:state.settings.swimmingProfile.css.pace};
 });
 expect(entry.meters).toBe(entry.expected);
 expect(entry.css).toBe(110);
 await page.locator('#app summary').filter({hasText:/^Planned sessions/}).first().click();
 const sessions=page.locator('details.mile-cal-session').filter({hasText:entry.name});
 if(await sessions.count())await sessions.first().locator('summary').first().click();
 await expect(page.locator('#app .m91-session').first()).toBeVisible();
});
