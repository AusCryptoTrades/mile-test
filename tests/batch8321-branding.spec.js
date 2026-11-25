const {test,expect}=require('@playwright/test');
test('new visitor defaults to Black / White and saved themes survive reload',async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4173'?route.continue():route.abort());
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-m395-theme','mono');
 await page.evaluate(()=>window.m395ThemeSet('midnight'));
 await expect(page.locator('html')).toHaveAttribute('data-m395-theme','midnight');
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-m395-theme','midnight');
 await page.evaluate(()=>window.m776ApplyAppearance({theme:'sand'}));
 await expect(page.locator('html')).toHaveAttribute('data-m395-theme','sand');
});
