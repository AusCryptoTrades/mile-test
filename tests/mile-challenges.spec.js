const {test,expect}=require('@playwright/test');
test('Challenges V2 loads without authentication and shows clear backend status',async({page})=>{
 await page.goto('/mile-challenges.html');
 await expect(page.getByRole('heading',{name:/CHALLENGES/})).toBeVisible();
 await expect(page.getByText(/Sign in to MILE/)).toBeVisible();
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await expect(page.getByRole('heading',{name:/CREATE A CHALLENGE/})).toBeVisible();
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

test('sport filter labels remain single-line and selectable on narrow screens',async({page})=>{
 await page.setViewportSize({width:320,height:740});
 await page.goto('/mile-challenges.html');
 const chips=page.locator('.filters button');
 await expect(chips).toHaveText(['All','Running','Cycling','Swimming']);
 const sizes=await chips.evaluateAll(nodes=>nodes.map(n=>({label:n.textContent,wrap:getComputedStyle(n).whiteSpace,overflow:n.scrollWidth>n.clientWidth+1,height:n.getBoundingClientRect().height})));
 expect(sizes.every(x=>x.wrap==='nowrap'&&!x.overflow&&x.height<=46)).toBe(true);
 await page.getByRole('button',{name:'Swimming',exact:true}).click();
 await expect(page.getByRole('button',{name:'Swimming',exact:true})).toHaveClass('active');
 await expect(page.getByRole('button',{name:'All',exact:true})).not.toHaveClass('active');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
