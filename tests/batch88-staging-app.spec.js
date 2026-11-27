const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');

test('isolated running staging app routes sign-in and embedded assets to staging', async ({ page, request }, info) => {
  const port = 4300 + info.workerIndex;
  const origin = 'http://127.0.0.1:' + port;
  const staging = 'https://fnyfeelynaozxtftrrga.supabase.co';
  const server = spawn(process.execPath, [path.resolve(__dirname, '../scripts/serve-running-staging.mjs')], {
    env: { ...process.env, MILE_STAGING_PORT: String(port), MILE_STAGING_PUBLISHABLE_KEY: 'sb_publishable_fixture_key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const outcome = await Promise.race([
      once(server.stdout, 'data').then(([chunk]) => String(chunk)),
      once(server, 'exit').then(([code]) => 'Staging server exited with ' + code),
    ]);
    expect(outcome).toContain(origin);
    const signIn = await request.get(origin);
    expect(signIn.headers()['content-security-policy']).toContain('connect-src ' + staging);
    expect(signIn.headers()['cache-control']).toBe('no-store');
    const tracker = await request.get(origin + '/mile-run-tracker.html?embedded=1');
    expect(await tracker.text()).toContain(staging);
    expect(await tracker.text()).not.toContain('mgixvokjlytjuypzcfzz');
    expect((await request.get(origin + '/package.json')).status()).toBe(404);

    const requests = [];
    await page.route('**/auth/v1/token?*', route => {
      requests.push({ url: route.request().url(), key: route.request().headers().apikey });
      return route.fulfill({ status: 401, json: { msg: 'Synthetic sign-in rejection' } });
    });
    await page.goto(origin);
    await page.locator('#v4Email').fill('staging-fixture@example.test');
    await page.locator('#v4Password').fill('staging-fixture-password');
    await page.locator('#v4Gate button[onclick*="v4Authenticate"]').click();
    await expect(page.locator('#v4Error')).toContainText('Synthetic sign-in rejection');
    expect(requests).toEqual([{ url: staging + '/auth/v1/token?grant_type=password', key: 'sb_publishable_fixture_key' }]);
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
});
