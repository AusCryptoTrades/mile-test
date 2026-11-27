const { test, expect } = require('@playwright/test');
test('More menu opens, closes and does not lock the app', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForLoadState('domcontentloaded');
  // App may require an authenticated account. Never count a skipped interaction as a pass.
  const more = page.locator('#nav button').filter({ hasText: 'More' }).first();
  await expect(more, 'Navigation More button must be available to test').toBeVisible({timeout:15000});
  await more.click();
  const panel = page.locator('#mile-emergency-more');
  await expect(panel, 'More panel should open').toBeVisible();
  await expect(panel.locator('[data-dest="insights"]')).toBeVisible();
  await panel.locator('[data-close]').click();
  await expect(panel).toBeHidden();
  await more.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await more.click();
  await expect(panel).toBeVisible();
  await page.locator('#nav button').first().click();
  await expect(panel).toBeHidden();
  await expect(page.locator('#mile-v3953-scrim')).toHaveCount(0);
  await expect(page.locator('#nav button').first()).toBeEnabled();
});
