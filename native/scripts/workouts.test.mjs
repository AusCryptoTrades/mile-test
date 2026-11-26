import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWorkout,sourceKey,upsertWorkouts,duplicateCandidates,historicalWindows,commitPage} from '../sync/workouts.mjs';
const raw={provider:'apple_health',providerId:'a',startAt:'2026-11-01T10:00:00+11:00',endAt:'2026-11-01T11:00:00+11:00',durationSeconds:3600,distanceMeters:10000,sport:'Running'};
test('normalizes offsets and preserves missing distance',()=>{
 const row=normalizeWorkout({...raw,distanceMeters:undefined},'athlete-a');
 assert.equal(row.startAt,'2026-10-31T23:00:00.000Z');assert.equal(row.distanceMeters,null);assert.equal(row.sport,'running');
 assert.throws(()=>normalizeWorkout({...raw,startAt:'2026-11-01'},'athlete-a'));
 assert.throws(()=>normalizeWorkout({...raw,durationSeconds:-1},'athlete-a'));
});
test('replayed records upsert idempotently and other accounts are rejected',()=>{
 const a=normalizeWorkout(raw,'athlete-a'),b=normalizeWorkout({...raw,distanceMeters:10001},'athlete-a');
 assert.equal(sourceKey(a),sourceKey(b));assert.deepEqual(upsertWorkouts([a],[b],'athlete-a'),[b]);
 assert.throws(()=>upsertWorkouts([a],[normalizeWorkout(raw,'athlete-b')],'athlete-a'));
});
test('cross-provider matches are reversible candidates, not deletions',()=>{
 const a=normalizeWorkout(raw,'athlete-a'),b=normalizeWorkout({...raw,provider:'garmin'},'athlete-a'),c=normalizeWorkout({...raw,provider:'coros',distanceMeters:null},'athlete-a');
 const rows=[a,b,c];assert.deepEqual(duplicateCandidates(rows),[[sourceKey(a),sourceKey(b)]]);assert.equal(rows.length,3);
});
test('historical windows cover entire range without overlap',()=>{
 const windows=historicalWindows('2026-01-01T00:00:00Z','2026-04-01T00:00:00Z');
 assert.equal(windows.length,3);assert.equal(windows[0].to,windows[1].from);assert.equal(windows[1].to,windows[2].from);assert.equal(windows[2].to,'2026-04-01T00:00:00.000Z');
});
test('checkpoint advances only after successful write',async()=>{
 const events=[];await commitPage({records:[],nextCursor:'next',write:async()=>events.push('write'),checkpoint:async()=>events.push('checkpoint')});assert.deepEqual(events,['write','checkpoint']);
 await assert.rejects(commitPage({records:[],nextCursor:'next',write:async()=>{throw Error('offline')},checkpoint:async()=>events.push('bad')}));assert.equal(events.includes('bad'),false);
});
