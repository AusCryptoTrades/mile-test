import test from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '@garmin/fitsdk';
import {decodeActivity} from './fit-decoder.mjs';
const start=1795730000,dt=n=>new Date((start+n)*1000);
function fixture(){
 const {Encoder,Profile}=sdk,e=new Encoder(),m=Profile.MesgNum;
 e.onMesg(m.FILE_ID,{type:'activity',manufacturer:'development',product:1,timeCreated:dt(0)});
 e.onMesg(m.WORKOUT_STEP,{messageIndex:0,intensity:'active'});
 e.onMesg(m.WORKOUT_STEP,{messageIndex:1,intensity:'recovery'});
 e.onMesg(m.LAP,{messageIndex:0,startTime:dt(0),timestamp:dt(180),totalTimerTime:180,totalElapsedTime:180,totalDistance:600,wktStepIndex:0,avgHeartRate:160,maxHeartRate:175});
 e.onMesg(m.LAP,{messageIndex:1,startTime:dt(180),timestamp:dt(240),totalTimerTime:60,totalElapsedTime:60,totalDistance:0,wktStepIndex:1,avgHeartRate:140});
 e.onMesg(m.SESSION,{messageIndex:0,sport:'running',startTime:dt(0),timestamp:dt(240),totalTimerTime:240,totalElapsedTime:240,totalDistance:600,firstLapIndex:0,numLaps:2});
 return e.close();
}
test('official SDK binary round-trip preserves step indexes and stationary recovery',()=>{const rows=decodeActivity(fixture(),start,sdk);assert.deepEqual(rows.map(x=>x.intensity),['active','recovery']);assert.deepEqual(rows.map(x=>x.distanceInMeters),[600,0]);assert.deepEqual(rows.map(x=>x.durationInSeconds),[180,60]);assert.equal(rows[0].maxHeartRateInBeatsPerMinute,175)});
test('official SDK rejects corrupt CRC and mismatched activity',()=>{const bytes=fixture();assert.throws(()=>decodeActivity(bytes,start+120,sdk),/FIT_ACTIVITY_MISMATCH/);bytes[bytes.length-1]^=0xff;assert.throws(()=>decodeActivity(bytes,start,sdk),/FIT_INTEGRITY_INVALID/)});
