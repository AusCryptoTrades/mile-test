const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const code='0123456789ABCDEF0123456789ABCDEF';
test.beforeEach(async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4173'?route.continue():route.abort());
});
test('847 link opens registration, prefills code, scrubs fragment and survives reload',async({page})=>{
 await page.goto('/#invite='+code.toLowerCase());
 await expect(page.locator('#v4Gate h2')).toHaveText('Start your MILE.');
 await expect(page.locator('#v4Invite')).toHaveValue(code);
 expect(new URL(page.url()).hash).toBe('');
 expect(await page.evaluate(()=>localStorage.getItem('mile-invite-link-draft'))).toBeNull();
 expect(await page.evaluate(()=>sessionStorage.getItem('av-v4-pending-invite'))).toBeNull();
 await page.reload();
 await expect(page.locator('#v4Invite')).toHaveValue(code);
 await page.locator('#v4Gate').getByText('Sign in',{exact:true}).click();
 await expect(page.locator('#v4Gate h2')).toHaveText('Welcome back.');
 await page.locator('#v4Gate').getByText('Create account',{exact:true}).click();
 await expect(page.locator('#v4Invite')).toHaveValue(code);
});
test('847 invalid link does not populate registration or persist',async({page})=>{
 await page.goto('/#invite=invalid');
 await expect(page.locator('#v4Gate h2')).toHaveText('Welcome back.');
 expect(new URL(page.url()).hash).toBe('');
 expect(await page.evaluate(()=>sessionStorage.getItem('mile-invite-link-draft'))).toBeNull();
 await page.locator('#v4Gate').getByText('Create account',{exact:true}).click();
 await expect(page.locator('#v4Invite')).toHaveValue('');
});
test('847 admin shares only production fragment URL with copy fallback',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../mile-admin-centre.js'),'utf8');
 expect(s).toContain("https://app.milefitness.com.au/#invite='+encodeURIComponent(data.code)");
 expect(s).toContain("navigator.clipboard.writeText(link)");
 expect(s).toContain("linkField.readOnly=true");
 expect(s).toContain("linkField.select()");
});
