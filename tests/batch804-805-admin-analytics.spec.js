const {test,expect}=require('@playwright/test');
const respond=(r,body,status=200)=>r.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(body)});
async function open(page){
 await page.route('**/functions/v1/mile-admin-overview?*',r=>respond(r,{days:7,metrics:{athletes:4},growth:[],generated_at:'2026-11-25T00:00:00Z'}));
 await page.goto('/index.html');await page.evaluate(()=>{sessionStorage.setItem('av-token','test-admin-token');window.mileBetaIsAdmin=()=>true;window.mileBetaAdmin()});
 await expect(page.locator('#mile-admin-centre .ma-status')).toContainText('Overview data connected');return page.locator('#mile-admin-centre');
}
function payload(days){return {days,usage:{members_with_recorded_events:2,registered_members:4,garmin_activities:days===30?22:11,posts:11,likes:9,comments:7},health:{connection_records:2,expired_token_records:1,webhook_events:297},trend:[{day:'2026-11-24',garmin:1,posts:2},{day:'2026-11-25',garmin:2,posts:0}],webhook_status:[{status:'processed',count:297}],file_status:[],generated_at:'2026-11-25T02:00:00Z'}}
test('80.4 live recorded usage chart and date filters do not imply app visits',async({page})=>{
 await page.route('**/functions/v1/mile-admin-analytics?*',r=>respond(r,payload(Number(new URL(r.request().url()).searchParams.get('days')))));
 const panel=await open(page);await panel.locator('.ma-tabs [data-ma-analytics]').click();
 const insights=panel.locator('[data-ma-insights=analytics]');await expect(insights).toContainText('Members with recorded events');await expect(insights.locator('[data-insight-metric=garmin_activities] .ma-value')).toHaveText('11');
 await expect(insights).toContainText('not currently measured');await expect(insights.locator('svg rect')).toHaveCount(4);
 await panel.locator('[data-insight-days="30"]').click();await expect(insights.locator('[data-insight-metric=garmin_activities] .ma-value')).toHaveText('22');await expect(panel.locator('[data-insight-days="30"]')).toHaveAttribute('aria-pressed','true');
 await insights.getByText('View daily totals').click();await expect(insights.getByText('1 Garmin · 2 posts')).toBeVisible();
 await panel.getByRole('button',{name:'‹ Overview'}).click();await expect(insights).toHaveCount(0);
});
test('80.5 integration health reports processing and missing telemetry accurately',async({page})=>{
 await page.route('**/functions/v1/mile-admin-analytics?*',r=>respond(r,payload(7)));
 const panel=await open(page);await panel.locator('.ma-tabs [data-ma-health]').click();
 const insights=panel.locator('[data-ma-insights=health]');await expect(insights.locator('[data-insight-metric=webhook_events] .ma-value')).toHaveText('297');
 await expect(insights).toContainText('processed');await expect(insights).toContainText('not a disconnect count');await expect(insights).toContainText('No records in this period');await expect(insights).toContainText('Endpoint uptime and client-side errors are not currently measured');
});
test('80.5 authorization denial does not expose analytics',async({page})=>{
 await page.route('**/functions/v1/mile-admin-analytics?*',r=>respond(r,{error:'Administrator access required'},403));
 const panel=await open(page);await panel.locator('.ma-tabs [data-ma-health]').click();
 await expect(panel.locator('.ma-management')).toContainText('Administrator access could not be verified');await expect(panel.locator('[data-insight-metric]')).toHaveCount(0);
});