const {test,expect}=require('@playwright/test');
test('Challenges V2 loads without authentication and shows clear backend status',async({page})=>{
 await page.goto('/mile-challenges.html');
 await expect(page.getByRole('heading',{name:/CHALLENGES/})).toBeVisible();
 await expect(page.getByText(/Sign in to MILE/)).toBeVisible();
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await expect(page.getByRole('heading',{name:'CREATE CHALLENGE'})).toBeVisible();
 await expect(page.locator('#metricSelect option')).toHaveCount(4);
});
test('Challenge creator exposes supported metrics and does not allow unsupported private mode',async({page})=>{
 await page.goto('/mile-challenges.html');
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await page.locator('#sportSelect').selectOption('HYROX');
 await expect(page.locator('#metricSelect option')).toHaveCount(2);
 await expect(page.locator('select[name=visibility] option')).toHaveCount(1);
 await expect(page.locator('select[name=eligibility] option')).toHaveCount(1);
});
