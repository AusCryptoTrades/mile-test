import test from 'node:test';
import assert from 'node:assert/strict';
import {publishRunningSession} from './publisher.mjs';
import {createPostgresPublicationRegistry} from './postgres-registry.mjs';
function fixture(){
 const sessionId='session-1',athleteId='athlete-1',garminIdentity='garmin-1';
 const a={sessionId,athleteId,garminIdentity,revision:1,date:'2026-12-01',consented:true,workout:{name:'MILE test fixture',sport:'running',steps:[{kind:'step',intensity:'active',duration:{kind:'time',seconds:600}}]}};
 let row=null,creates=0,schedules=0;
 const registry={async claim(r){if(!row)row={...r};return {...row}},async transition(id,expected,patch){if(row.operationId!==id||row.state!==expected)return null;row={...row,...patch};return {...row}}};
 const garmin={identity:async()=>garminIdentity,permissions:async()=>['WORKOUT_IMPORT'],async create(){creates++;return {workoutId:123}},async schedule(){schedules++;return {scheduleId:456}},getWorkout:async()=>({workoutId:123}),getSchedule:async()=>({scheduleId:456,workoutId:123,date:a.date})};
 const args={sessionId,authorize:async()=>structuredClone(a),garmin,registry};
 return {a,args,garmin,registry,counts:()=>[creates,schedules],row:()=>row};
}
test('verified readback and repeat call do not create duplicates',async()=>{
 const f=fixture();let r=await publishRunningSession(f.args);assert.equal(r.state,'verified');assert.deepEqual(f.counts(),[1,1]);
 r=await publishRunningSession(f.args);assert.equal(r.state,'verified');assert.deepEqual(f.counts(),[1,1]);
});
test('concurrent requests issue at most one create and schedule',async()=>{
 const f=fixture();await Promise.allSettled([publishRunningSession(f.args),publishRunningSession(f.args)]);assert.deepEqual(f.counts(),[1,1]);
});
test('uncertain create is never retried',async()=>{
 const f=fixture();let n=0;f.garmin.create=async()=>{n++;throw Error('timeout')};
 assert.equal((await publishRunningSession(f.args)).state,'create_uncertain');
 assert.equal((await publishRunningSession(f.args)).state,'create_uncertain');assert.equal(n,1);
});
test('uncertain schedule does not repeat create or schedule',async()=>{
 const f=fixture();let n=0;f.garmin.schedule=async()=>{n++;throw Error('timeout')};
 assert.equal((await publishRunningSession(f.args)).state,'schedule_uncertain');
 assert.equal((await publishRunningSession(f.args)).state,'schedule_uncertain');assert.equal(n,1);assert.equal(f.counts()[0],1);
});
test('identity, consent, permission and session revision are enforced',async()=>{
 let f=fixture();f.a.consented=false;await assert.rejects(publishRunningSession(f.args),/not authorized/);assert.deepEqual(f.counts(),[0,0]);
 f=fixture();f.garmin.identity=async()=> 'other';await assert.rejects(publishRunningSession(f.args),/account changed/);assert.deepEqual(f.counts(),[0,0]);
 f=fixture();f.garmin.permissions=async()=>[];await assert.rejects(publishRunningSession(f.args),/permission missing/);
 f=fixture();await publishRunningSession(f.args);f.a.revision=2;await assert.rejects(publishRunningSession(f.args),/reconciliation/);assert.deepEqual(f.counts(),[1,1]);
});
test('API schedule mismatch remains scheduled, not verified or delivered',async()=>{
 const f=fixture();f.garmin.getSchedule=async()=>({scheduleId:456,workoutId:999,date:f.a.date});
 assert.equal((await publishRunningSession(f.args)).state,'scheduled');
});
test('Postgres adapter uses parameter binding and rejects invalid transitions',async()=>{
 const queries=[];const adapter=createPostgresPublicationRegistry(async(sql,params)=>{queries.push({sql,params});return []});
 const f=fixture();await adapter.claim({...f.a,payloadSha256:'a'.repeat(64),operationId:'op'});
 assert.equal(queries.length,2);assert.match(queries[0].sql,/on conflict \(athlete_id,session_id\) do nothing/);
 assert.equal(queries[0].params[0],f.a.athleteId);assert.equal(queries[1].params[1],f.a.sessionId);
 await assert.rejects(adapter.transition('op','creating',{state:'verified'}),/Invalid/);
 await assert.rejects(adapter.transition('op','creating',{state:'created'}),/remote ID/);
 await adapter.transition('op','creating',{state:'created',workoutId:'123'});
 assert.match(queries[2].sql,/where operation_id=\$1 and state=\$2/);
});

test('schedule response missing ID reconciles via calendar without another POST',async()=>{
 const f=fixture();let n=0;
 f.garmin.schedule=async()=>{n++;return {}};
 f.garmin.findSchedule=async()=>({scheduleId:456,workoutId:123,date:f.a.date});
 assert.equal((await publishRunningSession(f.args)).state,'verified');
 assert.equal((await publishRunningSession(f.args)).state,'verified');
 assert.equal(n,1);assert.equal(f.counts()[0],1);
});
test('ambiguous calendar matching never silently marks delivery or retries writes',async()=>{
 const f=fixture();let n=0;
 f.garmin.schedule=async()=>{n++;throw Error('timeout')};
 f.garmin.findSchedule=async()=>({scheduleId:456,workoutId:999,date:f.a.date});
 assert.equal((await publishRunningSession(f.args)).state,'schedule_uncertain');
 f.garmin.findSchedule=async()=>({workoutId:123,date:f.a.date});
 assert.equal((await publishRunningSession(f.args)).state,'schedule_uncertain');
 assert.equal(n,1);assert.equal(f.counts()[0],1);
});
