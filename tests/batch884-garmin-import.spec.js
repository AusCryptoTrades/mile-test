const { test, expect } = require('@playwright/test');

const athletes = [
  { id: '00000000-0000-4000-8000-000000000001', email: 'first@example.test', activity: '123456789' },
  { id: '00000000-0000-4000-8000-000000000002', email: 'second@example.test', activity: '987654321' },
];
const verifiedUser = ({ id, email }) => ({ id, email, email_confirmed_at: '2026-11-25T12:00:00Z' });

async function signIn(page, athlete) {
  const gate = page.locator('#v4Gate');
  await gate.locator('#v4Email').fill(athlete.email);
  await gate.locator('#v4Password').fill('fixture-password');
  await gate.locator('button[onclick*="v4Authenticate"]').click();
  await expect(gate).toBeHidden();
}

async function signOut(page) {
  await page.evaluate(() => window.mileV3Go('settings'));
  await page.locator('[data-m771-open="account"]').first().click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-m771-action="logout"]').click();
  await expect(page.locator('#v4Gate')).toBeVisible();
}

async function routeGarmin(page, { activities = () => [], read = () => ({ activities: [], health: [] }) } = {}) {
  const origin = new URL(test.info().project.use.baseURL).origin;
  const backend = 'https://mgixvokjlytjuypzcfzz.supabase.co';
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== backend) return route.abort();

    let json;
    const athlete = athletes.find(a => request.headers().authorization === 'Bearer ' + a.id);
    if (url.pathname === '/auth/v1/token') {
      const signInAthlete = athletes.find(a => a.email === request.postDataJSON().email);
      json = { access_token: signInAthlete.id, user: verifiedUser(signInAthlete) };
    } else if (url.pathname === '/auth/v1/user') {
      json = verifiedUser(athlete);
    } else if (url.pathname === '/rest/v1/av_members') {
      json = [{ user_id: athlete.id }];
    } else if (url.pathname === '/rest/v1/av_training_data') {
      json = [{ training_data: { activities: activities(athlete), workouts: [] } }];
    } else if (url.pathname === '/functions/v1/garmin-connection-status') {
      json = { status: 'authorised' };
    } else if (url.pathname === '/functions/v1/garmin-data-read') {
      json = await read(athlete, url.searchParams.get('activityId'));
    } else if (url.pathname.startsWith('/rest/v1/')) {
      json = [];
    } else {
      return route.abort();
    }
    await route.fulfill({ json, headers: { 'access-control-allow-origin': origin } });
  });
}

test('a pending Garmin import stays with its signed-in athlete and repeat imports stay unique', async ({ page }) => {
  const calls = [];
  let releaseFirst;
  const pendingFirst = new Promise(resolve => { releaseFirst = resolve; });

  await routeGarmin(page, {
    async read(athlete) {
      calls.push(athlete.id);
      if (athlete === athletes[0]) await pendingFirst;
      const row = {
        garmin_activity_id: athlete.activity, activity_name: athlete.email + ' morning run',
        activity_type: 'RUNNING', started_at: '2026-11-26T07:00:00Z',
        duration_seconds: 1800, distance_metres: 5000,
      };
      return { activities: [row, row], health: [], latest_import: '2026-11-26T07:35:00Z' };
    },
  });

  try {
    await page.clock.setFixedTime(new Date('2026-11-26T12:00:00Z'));
    await page.goto('/');
    await expect(page.locator('#mileSplash')).toHaveCount(0);
    await page.evaluate(first => {
      const load = window.mileLoadGarminData;
      window.mileLoadGarminData = force => {
        const result = load(force);
        if (!window.firstRead && localStorage.getItem('av-user') === first) window.firstRead = result;
        return result;
      };
    }, athletes[0].id);
    await signIn(page, athletes[0]);
    await expect.poll(() => calls).toContain(athletes[0].id);
    await signOut(page);
    await signIn(page, athletes[1]);
    await page.evaluate(() => window.mileLoadGarminData(true));
    await expect.poll(() => calls).toContain(athletes[1].id);
    await page.evaluate(() => window.mileLoadGarminData(true));

    releaseFirst();
    await page.evaluate(() => window.firstRead);
    const summaries = await page.evaluate(ids => ids.map(id => {
      const data = JSON.parse(localStorage.getItem('av-training-v4-' + id));
      return data.activities.map(activity => activity.id);
    }), athletes.map(athlete => athlete.id));
    expect(summaries).toEqual([[], [athletes[1].activity]]);
    expect(calls.filter(id => id === athletes[1].id)).toHaveLength(2);
  } finally {
    releaseFirst();
  }
});

test('private Garmin details are fetched again after switching athletes', async ({ page }) => {
  const id = '24681357';
  const detailReaders = [];
  await routeGarmin(page, {
    activities: athlete => [{
      id, name: athlete.email + ' private run', type: 'RUNNING',
      date: '2026-11-26T07:00:00Z', distanceKm: 2, durationMin: 10,
    }],
    read(athlete, activityId) {
      if (activityId !== id) return { activities: [], health: [] };
      detailReaders.push(athlete.id);
      return { details: { raw_data: { lapDTOs: [{
        lapIndex: 1, distanceInMeters: 1000,
        durationInSeconds: athlete === athletes[0] ? 181 : 362,
      }] } } };
    },
  });
  await page.clock.setFixedTime(new Date('2026-11-26T12:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#mileSplash')).toHaveCount(0);

  for (const [index, athlete] of athletes.entries()) {
    await signIn(page, athlete);
    await page.evaluate(() => window.mileV3Go('dashboard'));
    await page.getByRole('button', { name: new RegExp(athlete.email + ' private run') }).click();
    const detail = page.locator('#mile35-detail');
    await detail.getByRole('button', { name: 'Splits', exact: true }).click();
    await expect(detail.locator('.m875-table tbody tr').first().getByRole('cell').nth(1))
      .toHaveText(index === 0 ? '3:01' : '6:02');
    await detail.getByRole('button', { name: /Back/ }).click();
    if (index === 0) await signOut(page);
  }
  expect(detailReaders).toEqual(athletes.map(athlete => athlete.id));
});
