const {test,expect}=require('@playwright/test');
test('HYROX SIM no-Roxzone advances and saves splits',async({page})=>{
 await page.goto('/mile-sim.html');
 await expect(page.getByText('Train like race day.')).toBeVisible();
 await page.getByRole('button',{name:'START SIM'}).click();
 await expect(page.locator('#stage')).toHaveText('Run 1');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('SkiErg');
 await page.reload();
 await page.getByRole('button',{name:'Resume session'}).click();
 await expect(page.locator('#stage')).toHaveText('SkiErg');
 await page.getByRole('button',{name:'Undo last tap'}).click();
 await expect(page.locator('#stage')).toHaveText('Run 1');
});
test('HYROX SIM Roxzone stages are separately tracked',async({page})=>{
 await page.goto('/mile-sim.html');
 await page.getByText('Separate Roxzone entry and exit').click();
 await page.getByRole('button',{name:'START SIM'}).click();
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('Enter Roxzone 1');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('SkiErg');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('Exit Roxzone 1');
 await page.locator('#tap').click();
 await expect(page.locator('#stage')).toHaveText('Run 2');
});