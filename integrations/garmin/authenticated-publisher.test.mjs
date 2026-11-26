import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthenticatedPublisher} from './authenticated-publisher.mjs';
function fixture(){
 const id='10000000-0000-4000-8000-000000000001',sessionId='20000000-0000-4000-8000-000000000002';
 const user={id,emailConfirmed:true,isAnonymous:false};
 const session={id:sessionId,date:'2026-12-01',sport:'Running',status:'planned',name:'MILE fixture',detail:'10 min easy',structuredDetail:'10 min easy',structuredSteps:[{kind:'step',intensity:'active',duration:{kind:'time',seconds:600}}]};
 const row={user_id:id,training_data:{workouts:[session]}},connection={athleteId:id,garminIdentity:'provider-1'};
 let record=null,creates=0,schedules=0;
 const registry={async claim(r){if(!record)record={...r};return {...record}},async transition(id,state,patch){if(record.operationId!==id||record.state!==state)return null;record={...record,...patch};return {...record}}};
 const garmin={identity:async()=> 'provider-1',permissions:async()=>['WORKOUT_IMPORT'],async create(){creates++;return {workoutId:123}},async schedule(){schedules++;return {scheduleId:456}},getWorkout:async()=>({workoutId:123}),getSchedule:async()=>({scheduleId:456,workoutId:123,date:session.date})};
 const deps={authenticate:async()=>user,isMember:async()=>true,loadTrainingData:async()=>row,loadConnection:async()=>connection,garmin,registry,localDate:async()=> '2026-11-26'};
 return {user,session,row,connection,deps,sessionId,counts:()=>[creates,schedules],app:createAuthenticatedPublisher(deps)};
}
test('preview writes nothing; explicit matching approval publishes once',async()=>{
 const f=fixture(),p=await f.app.preview(f.sessionId);
 assert.deepEqual(f.counts(),[0,0]);assert.equal(p.garminWrites,false);
 const request={sessionId:f.sessionId,approvedFingerprint:p.fingerprint,confirmed:true};
 assert.equal((await f.app.publish(request)).state,'verified');
 assert.equal((await f.app.publish(request)).state,'verified');assert.deepEqual(f.counts(),[1,1]);
});
test('rejects foreign owner, unconfirmed identity and missing permission before writes',async()=>{
 let f=fixture();f.row.user_id='other';await assert.rejects(f.app.preview(f.sessionId),/unavailable/);
 f=fixture();f.user.emailConfirmed=false;await assert.rejects(f.app.preview(f.sessionId),/membership/);
 f=fixture();f.connection.garminIdentity='other';await assert.rejects(f.app.preview(f.sessionId),/identity mismatch/);
 f=fixture();f.deps.garmin.permissions=async()=>[];await assert.rejects(f.app.preview(f.sessionId),/permission missing/);
 assert.deepEqual(f.counts(),[0,0]);
});
test('rejects changed date, changed instructions, missing approval and stale session',async()=>{
 let f=fixture(),p=await f.app.preview(f.sessionId);
 await assert.rejects(f.app.publish({sessionId:f.sessionId,approvedFingerprint:p.fingerprint,confirmed:false}),/approval required/);
 f.session.date='2026-12-02';await assert.rejects(f.app.publish({sessionId:f.sessionId,approvedFingerprint:p.fingerprint,confirmed:true}),/Preview changed/);
 f.session.detail='Changed';await assert.rejects(f.app.preview(f.sessionId),/review required/);
 f=fixture();f.session.date='2026-11-01';await assert.rejects(f.app.preview(f.sessionId),/local date/);
 assert.deepEqual(f.counts(),[0,0]);
});
