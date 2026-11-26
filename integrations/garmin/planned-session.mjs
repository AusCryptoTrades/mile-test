import {buildGarminRunningWorkout} from './training-payload.mjs';
// Existing plans contain human-readable instructions, not canonical steps.
// Never silently convert a range, strides/drills, recovery or estimated km into a watch prescription.
// Athlete/coach reviews and supplies explicit step selections before a session becomes publishable.
export function preparePlannedRunningSession(session, reviewedSteps){
 if(!session||session.sport!=='Running'||session.status!=='planned'||typeof session.id!=='string'||!session.id||typeof session.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(session.date)||!Number.isFinite(Date.parse(session.date))||new Date(session.date+'T00:00:00Z').toISOString().slice(0,10)!==session.date)throw Error('A valid planned running session is required');
 const generated=session.structuredDetail===session.detail&&Array.isArray(session.structuredSteps)?session.structuredSteps:null;
 if(reviewedSteps===undefined&&generated)reviewedSteps=generated;
 if(!Array.isArray(reviewedSteps)||!reviewedSteps.length)return {status:'review_required',sessionId:session.id,date:session.date,instructions:String(session.detail??''),reason:'Existing session instructions require explicit structured steps'};
 const workout={sport:'running',name:String(session.name??'').trim(),description:String(session.detail??'').slice(0,1024),steps:structuredClone(reviewedSteps)};
 const payload=buildGarminRunningWorkout(workout);
 return {status:'preview_ready',sessionId:session.id,date:session.date,workout,payload};
}
