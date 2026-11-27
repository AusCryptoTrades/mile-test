const { test, expect } = require('@playwright/test');
const reviewImage = require('./overnight-review-image');

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

async function routeGarmin(page, { activities = () => [], plans = {}, read = () => ({ activities: [], health: [] }) } = {}) {
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
      json = [{ training_data: { activities: activities(athlete), workouts: [], ...plans } }];
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


test('private Analysis presents ambiguous Garmin candidates for confirmation and leaves unmatched runs unplanned', async ({ page }, info) => {
  const day = '2026-11-26';
  const base = { sport: 'Running', block: 'main', date: day, status: 'planned', km: 5, plannedMinutes: 31 };
  const plans = {
    activeBlock: 'main',
    settings: { athleteProfile: { zoneBounds: [100, 120, 140, 155, 170, 190] } },
    blocks: [
      { id: 'main', name: 'Running programme', sport: 'Running', start: '2026-11-23', end: '2026-11-29',
        runningPlan: { config: { adaptation: { mode: 'manual', recovery: true } } } },
      { id: 'hidden', name: 'Hidden programme', calendarVisible: false },
    ],
    workouts: [
      { ...base, id: 'future', name: 'Upcoming intervals', date: '2026-11-28', targetRpe: 7 },
      { ...base, id: 'easy', name: 'Morning aerobic run' },
      { ...base, id: 'steady', name: 'Steady run', km: 5.4, plannedMinutes: 29 },
      { ...base, id: 'slow', name: 'Duration outlier', plannedMinutes: 90 },
      { ...base, id: 'distance', name: 'Distance outlier', km: 20 },
      { ...base, id: 'hidden-run', name: 'Hidden session', block: 'hidden' },
      { ...base, id: 'done', name: 'Completed session', status: 'done' },
      { ...base, id: 'matched', name: 'Previously matched run', matchId: 'different-activity' },
      { ...base, id: 'foreign-run', name: 'Foreign session', ownerId: athletes[1].id },
      { ...base, id: 'different-sport', name: 'Cycling session', sport: 'Cycling' },
      { ...base, id: 'different-day', name: 'Different day', date: '2026-11-25' },
    ],
  };
  await routeGarmin(page, {
    plans,
    read(_athlete, activityId) {
      if (activityId) {
        const start = new Date(day+'T07:00:00Z').getTime();
        return { detail: { samples: Array.from({ length: 361 }, (_, i) => ({ timestamp: start + i * 5000, heartRate: 175 })) } };
      }
      return { health: [], activities: [
        { garmin_activity_id: '783649251', activity_name: 'Ambiguous Garmin run', activity_type: 'RUNNING', started_at: day+'T07:00:00Z', duration_seconds: 1800, distance_metres: 5000, raw_data: { startTimeLocal: day+'T07:00:00' } },
        { garmin_activity_id: '975312468', activity_name: 'Unmatched Garmin run', activity_type: 'RUNNING', started_at: day+'T08:00:00Z', duration_seconds: 1800, distance_metres: 9000, raw_data: { startTimeLocal: day+'T08:00:00' } },
      ] };
    },
  });
  const writes = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && /\/av_training_data|\/rest\/v1\/rpc\//.test(request.url())) writes.push(request.postDataJSON());
  });
  await page.clock.setFixedTime(new Date(day+'T12:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#mileSplash')).toHaveCount(0);
  await signIn(page, athletes[0]);

  async function openReview(activity) {
    await page.getByRole('button', { name: new RegExp(activity) }).click();
    const detail = page.locator('#mile35-detail');
    await detail.getByRole('button', { name: 'Analysis', exact: true }).click();
    await expect(detail).toContainText('No scheduled session linked');
    return detail.locator('section').filter({ has: page.getByRole('heading', { name: 'Possible scheduled matches', exact: true }) });
  }
  const ambiguous = await openReview('Ambiguous Garmin run');
  await expect(ambiguous).toContainText('Several scheduled runs are similar. Athlete confirmation is required');
  await expect(ambiguous.locator('.mile35-datarow')).toHaveText([
    'Morning aerobic run5.00 km planned · ~31 min planned',
    'Steady run5.40 km planned · ~29 min planned',
  ]);
  await expect(ambiguous.getByRole('button')).toHaveText(['Link to Morning aerobic run','Link to Steady run']);
  const detail = page.locator('#mile35-detail');
  await expect(detail.getByRole('heading', { name: 'Scheduled match unresolved' })).toBeVisible();
  await expect(detail).toContainText('Running distance recorded this week14.0 km');
  await expect(detail.getByRole('heading', { name: 'Additional demanding run' })).toHaveCount(0);
  await reviewImage(info,'03-running-match-review',ambiguous);
  await detail.getByRole('button', { name: /Back/ }).click();

  const unmatched = await openReview('Unmatched Garmin run');
  await expect(unmatched).toContainText('No comparable scheduled runs on this date.');
  await expect(unmatched.locator('.mile35-datarow')).toHaveCount(0);
  await expect(detail.getByRole('heading', { name: 'Additional demanding run' })).toBeVisible();
  await expect(detail).toContainText('Upcoming intervals · 2026-11-28');
  expect(await page.evaluate(()=>confirmMatch('done','783649251'))).toBe(false);
  expect(await page.evaluate(()=>confirmMatch('foreign-run','783649251'))).toBe(false);
  expect(writes).toEqual([]);
  await detail.getByRole('button', { name: /Back/ }).click();
  const choices = await openReview('Ambiguous Garmin run');
  await choices.getByRole('button', { name: 'Link to Morning aerobic run', exact: true }).click();
  await expect(detail).toContainText('Linked session: Morning aerobic run');
  await expect.poll(()=>writes.length).toBe(1);
  const saved=writes[0].training_data.workouts;
  expect(saved.find(w=>w.id==='easy')).toMatchObject({status:'done',matchId:'783649251'});
  expect(saved.find(w=>w.id==='steady')).toMatchObject({status:'planned'});
  expect(await page.evaluate(()=>confirmMatch('steady','783649251'))).toBe(false);
  expect(writes).toHaveLength(1);
});

test('Garmin replay preserves recorded totals and never replaces a separate source', async ({ page }) => {
  const existing = { id:'24681357', name:'Independent tracker run', sport:'Running', source:'MILE', date:'2026-11-26', distanceKm:3 };
  const original = { garmin_activity_id:athletes[0].activity, activity_name:'Recorded Garmin run',
    activity_type:'RUNNING', started_at:'2026-11-26T07:00:00Z', distance_metres:8000, duration_seconds:2400 };
  await routeGarmin(page,{
    activities:()=>[existing],
    read:()=>({health:[],activities:[
      original,
      {...original,distance_metres:null,duration_seconds:null},
      {...original,garmin_activity_id:existing.id,activity_name:'Source collision'},
      {...original,garmin_activity_id:'24680000',started_at:null,raw_data:{startTimeInSeconds:'invalid'}},
    ]}),
  });
  await page.goto('/');
  await signIn(page,athletes[0]);
  await expect.poll(()=>page.evaluate(()=>state.activities.length)).toBe(2);
  await page.evaluate(()=>window.mileLoadGarminData(true));
  const rows=await page.evaluate(()=>state.activities.map(({id,name,distanceKm,durationMin,source})=>({id,name,distanceKm,durationMin,source})));
  expect(rows).toEqual([
    {id:existing.id,name:existing.name,distanceKm:3,source:'MILE'},
    {id:athletes[0].activity,name:original.activity_name,distanceKm:8,durationMin:40,source:'garmin-developer-api'},
  ]);
});
