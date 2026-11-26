import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePlannedRunningSession} from './planned-session.mjs';
import {diagnoseGarminDelivery} from './delivery-diagnostic.mjs';
const session={id:'fixture',date:'2026-12-01',name:'Threshold cruise intervals',sport:'Running',status:'planned',detail:'Warm-up: 2 km easy + 4 strides. Main: 4 × 6 min; 2 min jog. Cooldown: 1.5–2 km.',km:9};
test('legacy plan requires review and never guesses steps or distance',()=>{
 const p=preparePlannedRunningSession(session);assert.equal(p.status,'review_required');assert.equal(p.instructions,session.detail);assert.equal(p.payload,undefined);
 const q=preparePlannedRunningSession(session,[{kind:'step',intensity:'warmup',duration:{kind:'distance',meters:2000}}]);
 assert.equal(q.status,'preview_ready');assert.equal(q.payload.segments[0].steps[0].durationValue,2000);assert.equal(q.sessionId,session.id);
 assert.throws(()=>preparePlannedRunningSession({...session,status:'done'},[]),/planned running/);
 assert.throws(()=>preparePlannedRunningSession({...session,date:'2026-02-31'},[]),/valid/);
});
function fixture(){
 const calls=[];const user={id:'fixture-athlete',emailConfirmed:true,isAnonymous:false};const link={athleteId:user.id,garminIdentity:'fixture-provider'};
 const garmin={identity:async()=>{calls.push('identity');return 'fixture-provider'},permissions:async()=>{calls.push('permissions');return ['WORKOUT_IMPORT']},getWorkout:async()=>{calls.push('getWorkout');return {workoutId:123,ownerId:'private-owner'}},getSchedule:async()=>{calls.push('getSchedule');return {workoutScheduleId:456,workoutId:123,date:session.date}},listSchedules:async()=>{calls.push('listSchedules');return [{scheduledWorkoutId:456,workoutId:123,date:session.date}]}};
 return {user,link,calls,garmin,args:{authenticate:async()=>user,connection:async(id)=>{assert.equal(id,user.id);return link},garmin,workoutId:'123',scheduleId:'456',date:session.date}};
}
test('authenticated delivery diagnosis distinguishes API record from UI and redacts IDs',async()=>{
 const f=fixture(),r=await diagnoseGarminDelivery(f.args);
 assert.equal(r.status,'api_verified');assert.equal(r.connectVisibility,'unverified');assert.equal(r.watchVisibility,'unverified');assert.equal(r.garminWrites,false);
 assert.deepEqual(f.calls,['identity','permissions','getWorkout','getSchedule','listSchedules']);
 assert.ok(!JSON.stringify(r).includes('private-owner'));
});
test('missing permission, wrong identity and anonymous sessions fail closed',async()=>{
 let f=fixture();f.garmin.permissions=async()=>[];assert.equal((await diagnoseGarminDelivery(f.args)).status,'permission_missing');assert.deepEqual(f.calls,['identity']);
 f=fixture();f.link.garminIdentity='different';await assert.rejects(diagnoseGarminDelivery(f.args),/account changed/);
 f=fixture();f.user.isAnonymous=true;await assert.rejects(diagnoseGarminDelivery(f.args),/Authentication/);assert.equal(f.calls.length,0);
});
test('missing or inconsistent remote records never prove delivery',async()=>{
 const f=fixture();f.garmin.listSchedules=async()=>({unexpected:true});let r=await diagnoseGarminDelivery(f.args);assert.equal(r.status,'inconclusive');assert.equal(r.rangeMatches,null);
 f.garmin.getSchedule=async()=>{throw Error('network')};r=await diagnoseGarminDelivery(f.args);assert.equal(r.scheduleMatches,false);
});
