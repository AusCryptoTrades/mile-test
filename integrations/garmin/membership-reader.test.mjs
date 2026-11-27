import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const athlete = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const source = await readFile(new URL('../../supabase/functions/garmin-data-read/index.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;$/gm, ''));

function reader({ confirmed, member }) {
  let handle;
  const reads = [];
  const sql = async (text, ...parameters) => {
    const query = text.join('?').replace(/\s+/g, ' ').trim();
    reads.push({ query, parameters });
    if (query.includes('public.av_members')) return member ? [{ member: 1 }] : [];
    if (query.includes('private.mile_garmin_activities')) return [{ garmin_activity_id: '87654321' }];
    return [];
  };
  sql.end = async () => {};
  runInNewContext(code, {
    Request, Response, URL, AbortSignal, console,
    Deno: { env: { get: () => 'fixture-config' }, serve: callback => { handle = callback; } },
    fetch: async () => Response.json({ id: athlete, email_confirmed_at: confirmed ? '2026-11-26' : null }),
    postgres: () => sql,
    withFitLaps: async () => null,
  });
  return { reads, detail: () => handle(new Request('https://example.test/?activityId=87654321&user_id=' + other, {
    headers: { authorization: 'Bearer synthetic-token' },
  })) };
}

test('Garmin reader blocks unconfirmed accounts before looking up any records', async () => {
  const app = reader({ confirmed: false, member: true });
  assert.equal((await app.detail()).status, 403);
  assert.deepEqual(app.reads, []);
});

test('Garmin reader blocks revoked or missing membership before fetching activity data', async () => {
  const app = reader({ confirmed: true, member: false });
  assert.equal((await app.detail()).status, 403);
  assert.equal(app.reads.length, 1);
  assert.deepEqual(app.reads[0].parameters, [athlete]);
});

test('Garmin reader binds membership and activity lookup to authenticated owner', async () => {
  const app = reader({ confirmed: true, member: true });
  assert.equal((await app.detail()).status, 200);
  assert.equal(app.reads.length, 3);
  for (const read of app.reads) assert.equal(read.parameters[0], athlete);
  assert.ok(app.reads.slice(1).every(read => read.parameters[1] === '87654321'));
});
