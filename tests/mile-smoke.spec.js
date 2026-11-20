const { test, expect } = require('@playwright/test');

const activity = {
  id: '123456789', name: 'Fixture morning run', sport: 'Running',
  date: '2026-11-18T07:00:00', distanceKm: 2, durationSeconds: 620, averageHR: 145,
};
const user = { id: '00000000-0000-4000-8000-000000000001' };
const samples = Array.from({ length: 11 }, (_, i) => ({
  timestamp: 1739343600000 + i * 62000,
  distanceInMeters: i * 200,
  heartRateInBeatsPerMinute: 130 + i * 2,
  speedMetersPerSecond: 3.2 + (i % 3) / 10,
  movingDurationInSeconds: i * 62,
}));

async function openApp(page, { signedIn = false, laps = true } = {}) {
  const origin = 'http://127.0.0.1:4173';
  const backend = 'https://mgixvokjlytjuypzcfzz.supabase.co';
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    // Every external request stays inside this simulated backend.
    if (url.origin !== backend) return route.abort();
    let json;
    if (url.pathname === '/auth/v1/token' && signedIn) {
      json = { access_token: 'fixture-auth-token', refresh_token: 'fixture-refresh-token', user };
    } else if (url.pathname === '/rest/v1/av_members') {
      json = [{ user_id: user.id }];
    } else if (url.pathname === '/rest/v1/av_training_data') {
      json = [{ training_data: { activities: [activity] } }];
    } else if (url.pathname === '/functions/v1/garmin-data-read' &&
               url.searchParams.get('activityId') === activity.id) {
      json = { details: { raw_data: laps ? {
        samples,
        lapDTOs: [{ distanceInMeters: 1000, durationInSeconds: 305 }],
      } : { samples: [], lapDTOs: [] } } };
    } else if (url.pathname === '/rest/v1/mile_social_activities') {
      json = [{
        id: 'fixture-social-post', user_id: user.id, title: 'Fixture social run',
        activity_type: 'running', distance_m: 2750, duration_s: 850,
        activity_at: activity.date, visibility: 'private',
      }];
    } else if (url.pathname.startsWith('/rest/v1/')) {
      json = [];
    } else {
      return route.abort();
    }
    await route.fulfill({ json, headers: { 'access-control-allow-origin': origin } });
  });
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#mileSplash')).toHaveCount(0);
  if (!signedIn) return;
  await page.locator('#v4Email').fill('runner@example.test');
  await page.locator('#v4Password').fill('fixture-password');
  await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
}

async function openActivity(page) {
  await page.getByRole('button', { name: /fixture morning run/i }).click();
  const detail = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: activity.name }) });
  await expect(detail).toBeVisible();
  return detail;
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  test.info().milePageErrors = errors;
});

test.afterEach(async () => {
  expect(test.info().milePageErrors).toEqual([]);
});

test('sign-in screen renders and validates required fields', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
  await expect(page.locator('#v4Error')).toHaveText('Enter your email and password.');
});

test('real Activity Details shows recorded laps and in-bounds charts and closes via Back', async ({ page, isMobile }, info) => {
  await openApp(page, { signedIn: true });
  const detail = await openActivity(page);
  await detail.getByRole('button', { name: 'Splits', exact: true }).click();
  await expect(detail.getByText('Lap 1 · 1.00 km')).toBeVisible();
  await expect(detail.getByText('5:05 · 5:05/km')).toBeVisible();
  await detail.getByRole('button', { name: 'Charts', exact: true }).click();
  const charts = detail.locator('.mile355-chart svg');
  await expect(charts).toHaveCount(2);
  for (const chart of await charts.all()) {
    await expect(chart).toBeVisible();
    const labels = await chart.locator('text').evaluateAll(nodes => nodes.map(node => {
      const bounds = node.getBoundingClientRect();
      const plot = node.ownerSVGElement.getBoundingClientRect();
      return {
        label: node.textContent,
        clipped: bounds.width <= 0 || bounds.left < Math.max(0, plot.left) - 1 ||
          bounds.right > Math.min(innerWidth, plot.right) + 1,
      };
    }));
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.filter(label => label.clipped)).toEqual([]);
  }
  if (isMobile) {
    const header = await detail.locator('.mile35-hero').boundingBox();
    expect(header.height).toBeLessThan(page.viewportSize().height * 0.3);
  }
  await info.attach('activity-charts', { body: await page.screenshot(), contentType: 'image/png' });
  const back = detail.getByRole('button', { name: /back/i });
  const bounds = await back.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height);
  await back.click();
  await expect(detail).toHaveCount(0);
});

test('real Activity Details reports absent splits without guessing', async ({ page }) => {
  await openApp(page, { signedIn: true, laps: false });
  const detail = await openActivity(page);
  await detail.getByRole('button', { name: 'Splits', exact: true }).click();
  await expect(detail.getByText(/no guessed splits/i)).toBeVisible();
  await expect(detail.getByText(/recorded Garmin laps \(may include/i)).toHaveCount(0);
});

test('activity card generates a decoded PNG preview', async ({ page }, info) => {
  await openApp(page, { signedIn: true });
  const detail = await openActivity(page);
  await detail.getByRole('button', { name: 'Create a shareable activity image' }).click();
  const preview = page.getByRole('img', { name: 'MILE share card preview' });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('src', /^data:image\/png;base64,iVBORw0KGgo/);
  await expect.poll(() => preview.evaluate(image => image.naturalWidth)).toBe(1080);
  await expect.poll(() => preview.evaluate(image => image.naturalHeight)).toBe(1350);
  await info.attach('share-preview', { body: await preview.screenshot(), contentType: 'image/png' });
});

test('calendar highlights the selected day', async ({ page }) => {
  await openApp(page, { signedIn: true });
  await page.getByRole('button', { name: /calendar/i }).click();
  const day = page.getByRole('button', { name: /^18\b/ });
  await day.click();
  await expect(day).toHaveClass(/\bselected\b/);
  await expect(day).toHaveCSS('outline-style', 'solid');
  const nextDay = page.getByRole('button', { name: /^19\b/ });
  await nextDay.click();
  await expect(nextDay).toHaveClass(/\bselected\b/);
  await expect(day).not.toHaveClass(/\bselected\b/);
});

test('Social Feed displays the recorded distance in kilometres', async ({ page }) => {
  await openApp(page, { signedIn: true });
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('button', { name: /social feed/i }).click();
  const post = page.getByRole('article').filter({ hasText: 'Fixture social run' });
  await expect(post).toContainText('2.75 km');
});
