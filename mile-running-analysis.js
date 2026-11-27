// Batch 88.3: pure analysis and review proposals; not connected to production persistence.
(function runningAnalysis(root){
'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const pos=v=>finite(v)!==null&&v>0?v:null;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?Date.parse(v):null;
const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
const paceTarget=t=>t?.kind==='pace'&&pos(t.fastSecondsPerKm)&&pos(t.slowSecondsPerKm)&&t.fastSecondsPerKm>=120&&t.slowSecondsPerKm<=1800&&t.fastSecondsPerKm<=t.slowSecondsPerKm;
const hrTarget=t=>t?.kind==='heart_rate'&&Number.isInteger(t.lowBpm)&&Number.isInteger(t.highBpm)&&t.lowBpm>=30&&t.highBpm<=250&&t.lowBpm<t.highBpm;
function expand(steps,depth=0){
 if(!Array.isArray(steps)||!steps.length||depth>2)return null;
 let out=[];
 for(const x of steps){
  if(x?.kind==='repeat'){
   if(!Number.isInteger(x.count)||x.count<2||x.count>50)return null;
   const nested=expand(x.steps,depth+1);if(!nested||nested.length*x.count+out.length>200)return null;
   for(let i=0;i<x.count;i++)out.push(...nested);
  }else if(x?.kind==='step'&&['warmup','active','interval','recovery','cooldown'].includes(x.intensity)&&((x.duration?.kind==='distance'&&pos(x.duration.meters))||(x.duration?.kind==='time'&&pos(x.duration.seconds))||x.duration?.kind==='open'))out.push(x);
  else return null;
  if(out.length>200)return null;
 }
 return out;
}
function uniqueMatch(activity,plans){
 if(activity?.id==null||!Array.isArray(plans))return null;
 const matches=plans.filter(w=>w?.sport==='Running'&&same(w.matchId,activity.id));
 return matches.length===1?matches[0]:null;
}
function validatedDistribution(d){
 if(!d||!Array.isArray(d.seconds)||d.seconds.length!==5||!d.seconds.every(x=>finite(x)!==null&&x>=0)||pos(d.coverage)===null||pos(d.span)===null||d.coverage<60||d.coverage/d.span<.9||d.coverage>d.span||finite(d.outside)===null||d.outside<0)return null;
 if(Math.abs(d.seconds.reduce((x,y)=>x+y,0)+d.outside-d.coverage)>Math.max(1,d.coverage*.005))return null;
 return {seconds:d.seconds.slice(),coverage:d.coverage,span:d.span,percent:d.seconds.map(x=>x/d.coverage*100),outsidePercent:d.outside/d.coverage*100};
}
function align(steps,evidence){
 // Caller must establish explicit step/lap alignment; a similar distance alone is not proof.
 if(!steps||!evidence||evidence.verified!==true||!['provider-step-ids','confirmed-step-alignment'].includes(evidence.source)||!Array.isArray(evidence.rows)||evidence.rows.length!==steps.length)return null;
 const rows=evidence.rows;
 if(!rows.every((r,i)=>r&&r.stepIndex===i&&finite(r.meters)!==null&&r.meters>=0&&pos(r.seconds)&&(!r.intensity||r.intensity===steps[i].intensity)))return null;
 return steps.map((s,i)=>{
  const r=rows[i],pace=r.meters>0?r.seconds*1000/r.meters:null;
  const target=s.target||{},quantity=s.duration.kind==='distance'?r.meters:s.duration.kind==='time'?r.seconds:null,planned=s.duration.kind==='distance'?s.duration.meters:s.duration.kind==='time'?s.duration.seconds:null;
  const ratio=quantity!==null&&planned!==null?quantity/planned:null;
  let paceStatus=null;if(paceTarget(target)&&pace!==null)paceStatus=pace<target.fastSecondsPerKm?'faster':pace>target.slowSecondsPerKm?'slower':'within';
  const h=finite(r.averageHR),hrStatus=hrTarget(target)&&h!==null&&h>=30&&h<=250?h<target.lowBpm?'below':h>target.highBpm?'above':'within':null;
  return {index:i,intensity:s.intensity,planned,quantity,completionRatio:ratio,pace,paceStatus,averageHR:h!==null&&h>=30&&h<=250?h:null,hrStatus,seconds:r.seconds,meters:r.meters,target:paceTarget(target)||hrTarget(target)?{...target}:null};
 });
}
function analyse(activity,opts={}){
 const distance=pos(activity?.distanceKm),duration=pos(activity?.durationMin),id=activity?.id==null?null:String(activity.id);
 const matched=uniqueMatch(activity,opts.plans),zones=validatedDistribution(opts.zoneDistribution),context=opts.context||{};
 const confounded=Boolean(context.heat||context.hilly||context.treadmill||context.sensorError||context.incompleteLaps);
 const cautions=[];if(context.heat)cautions.push('Heat may affect pace and heart rate.');if(context.hilly)cautions.push('Hills may affect pace and heart rate.');if(context.treadmill)cautions.push('Treadmill distance and pace can differ from outdoor measurements.');if(context.sensorError)cautions.push('Sensor quality is flagged.');if(context.incompleteLaps)cautions.push('Lap information is incomplete.');
 const base={activityId:id,kind:matched?'planned':'unplanned',distanceKm:distance,durationMin:duration,averagePace:distance&&duration?duration*60/distance:null,zones:context.sensorError?null:zones,cautions,trainingLoad:duration&&finite(opts.sessionRpe)!==null&&opts.sessionRpe>=1&&opts.sessionRpe<=10?{method:'athlete-reported RPE × minutes',value:Math.round(duration*opts.sessionRpe)}:null};
 if(!matched){
  let classification='unclassified',stimulus='Insufficient recorded evidence to classify this run.';
  if(!confounded&&zones&&duration>=20&&zones.coverage>=duration*60*.8){
   const high=zones.percent[3]+zones.percent[4],easy=zones.percent[0]+zones.percent[1];
   if(zones.outsidePercent<=10&&high>=25){classification='higher-intensity';stimulus='Substantial recorded time in upper configured HR zones suggests a demanding contribution.'}
   else if(zones.outsidePercent<=10&&easy>=75){classification='predominantly-aerobic';stimulus='Most recorded time was in the lower configured HR zones.'}
   else if(zones.outsidePercent<=10){classification='mixed';stimulus='Recorded HR time spans multiple configured zones.'}
  }
  return {...base,classification,stimulus,adherence:null,recovery:classification==='higher-intensity'?'Review recovery and upcoming demanding sessions.':'Consider duration and recent total load; recovery cannot be established from this activity alone.',programmeImpact:'No programme change made.'};
 }
 const steps=matched.structuredDetail===matched.detail?expand(matched.structuredSteps):null;
 const distanceExact=steps&&steps.every(x=>x.duration.kind==='distance')?steps.reduce((n,x)=>n+x.duration.meters,0)/1000:null;
 const durationExact=steps&&steps.every(x=>x.duration.kind==='time')?steps.reduce((n,x)=>n+x.duration.seconds,0)/60:null;
 const plannedDistance=distanceExact??pos(matched.km),plannedDuration=durationExact??pos(matched.plannedMinutes);
 const aligned=confounded?null:align(steps,opts.lapEvidence);
 const main=aligned?.filter(x=>x.intensity==='active'||x.intensity==='interval')||[],recovery=aligned?.filter(x=>x.intensity==='recovery')||[];
 const comparable=main.filter(x=>x.paceStatus!==null),complete=main.filter(x=>x.completionRatio!==null);
 const hrComparable=main.filter(x=>x.hrStatus!==null);
 const workPace=comparable.length&&comparable.every(x=>x.meters>0)?comparable.reduce((n,x)=>n+x.seconds,0)*1000/comparable.reduce((n,x)=>n+x.meters,0):null;
 const workPaces=comparable.map(x=>x.pace),spread=workPaces.length>=2?Math.max(...workPaces)-Math.min(...workPaces):null;
 const totalDistanceRatio=plannedDistance&&distance?distance/plannedDistance:null,totalDurationRatio=plannedDuration&&duration?duration/plannedDuration:null;
 let execution='insufficient-evidence',stimulus='Main-set execution and intended physiological stimulus cannot be established from available evidence.',good=[],improve=[];
 if(confounded)improve.push('Review context before interpreting performance; no adaptation evidence generated.');
 else if(aligned&&main.length&&complete.length===main.length){
  const completed=complete.every(x=>x.completionRatio>=.95&&x.completionRatio<=1.10);
  const paceMet=comparable.length===main.length&&comparable.every(x=>x.paceStatus==='within');
  const hrMet=hrComparable.length===main.length&&hrComparable.every(x=>x.hrStatus==='within');
  if(completed&&(paceMet||hrMet)){
   execution='on-target';stimulus='Verified main-set quantities and available target measurements were consistent with the prescription; physiological adaptation is not proven.';
   good.push('Completed comparable main-set steps within prescribed quantities and targets.');
  }else if(complete.some(x=>x.completionRatio<.9)){
   execution='incomplete';improve.push('Some verified main-set steps were shorter than prescribed.');
  }else if(comparable.some(x=>x.paceStatus==='faster')||hrComparable.some(x=>x.hrStatus==='above')){
   execution='above-target';improve.push('Some verified work exceeded the prescribed pace or average HR range. Faster is not automatically better.');
  }else if(comparable.some(x=>x.paceStatus==='slower')||hrComparable.some(x=>x.hrStatus==='below')){
   execution='below-target';improve.push('Some verified steps were below the target; consider effort, recovery and context.');
  }
 }
 const sessionType=matched.kind||'unknown';
 // Adaptation evidence is intentionally more restrictive than descriptive comparison.
 const evidence=null; // A future authenticated integration must establish comparable repeated conditions.
 return {...base,planId:matched.id,sessionName:matched.name||'Scheduled run',sessionType,plannedDistance,plannedDistanceSource:distanceExact!==null?'structured-distance':'stored-estimate',plannedDuration,plannedDurationSource:durationExact!==null?'structured-time':'stored-estimate',totalDistanceRatio,totalDurationRatio,execution,stimulus,good,improve,steps:aligned,workPace,intervalPaceSpread:spread,mainPaceCounts:comparable.length?{within:comparable.filter(x=>x.paceStatus==='within').length,faster:comparable.filter(x=>x.paceStatus==='faster').length,slower:comparable.filter(x=>x.paceStatus==='slower').length}:null,mainAverageHRCounts:hrComparable.length?{within:hrComparable.filter(x=>x.hrStatus==='within').length,above:hrComparable.filter(x=>x.hrStatus==='above').length,below:hrComparable.filter(x=>x.hrStatus==='below').length}:null,recoverySteps:recovery.length?recovery:null,adaptationEvidence:evidence,programmeImpact:'No programme change made.'};
}
function propose(event,ctx={}){
 const today=date(ctx.today),id=event?.id==null?'':String(event.id),settings=ctx.settings||{};
 const response=(rule,reason,details={})=>({eventId:id,rule,reason,action:'review-only',requiresApproval:true,changes:[],...details});
 if(today===null||!id)return response('invalid','A valid event and local date are required.');
 if(Array.isArray(ctx.processedIds)&&ctx.processedIds.map(String).includes(id))return response('duplicate','Event already evaluated.',{action:'none',requiresApproval:false});
 if(settings.mode!=='automatic'&&settings.mode!=='manual')return response('settings-missing','Adaptation settings are not confirmed.');
 const future=(Array.isArray(ctx.sessions)?ctx.sessions:[]).filter(w=>w?.sport==='Running'&&w.status==='planned'&&w.matchId==null&&w.id!=null&&date(w.date)!==null&&date(w.date)>today).sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
 const hard=future.find(w=>finite(w.targetRpe)!==null&&w.targetRpe>=6),next=future[0];
 const hold=(rule,reason,w)=>response(rule,reason,w?{changes:[{sessionId:String(w.id),operation:'review-session'}]}:{});
 if(ctx.injury===true)return hold('injury-hold','Current symptoms require individual review. Do not progress or reschedule demanding training.',next);
 if(event.kind==='missed'){
  if(settings.missed!==true)return response('missed-disabled','Missed-session management is disabled.',{action:'none',requiresApproval:false});
  if(event.sessionType==='easy'||event.sessionType==='recovery')return response('no-mileage-debt','Missed easy or recovery mileage is not added to future sessions.',{action:'none',requiresApproval:false});
  return hold('missed-quality-review','Review recovery and schedule before considering a missed key session; do not automatically reschedule it.',hard);
 }
 if(settings.recovery===true&&ctx.recovery==='poor')return hold('recovery-review','Poor reported recovery warrants reviewing the next demanding session.',hard||next);
 if(event.kind==='unplanned'&&event.classification==='higher-intensity'&&event.evidenceVerified===true)return hold('unplanned-load-review','An additional demanding run may change recovery needs. Review the next demanding session.',hard||next);
 if(settings.volume===true&&pos(ctx.plannedWeekKm)&&pos(ctx.actualWeekKm)&&ctx.actualWeekKm>ctx.plannedWeekKm*1.15)return hold('additional-mileage-review','Recorded weekly mileage exceeds the planned amount by more than the provisional 15% review threshold. Do not increase volume.',next);
 // Only explicit, comparable evidence from the same protocol and within 14 local days can trigger trend review.
 const evidence=event.evidence;
 if(!evidence||evidence.verified!==true||!evidence.comparableKey||date(evidence.date)===null||date(evidence.date)>today||today-date(evidence.date)>13*86400000)return response('insufficient-evidence','No verified comparable trend. Preserve current targets.',{action:'none',requiresApproval:false});
 const records=[...(Array.isArray(ctx.history)?ctx.history:[]),evidence].filter(x=>x?.verified===true&&x.comparableKey===evidence.comparableKey&&x.outcome===evidence.outcome&&x.id!=null&&date(x.date)!==null&&date(x.date)<=today&&today-date(x.date)<=13*86400000);
 const unique=[...new Map(records.map(x=>[String(x.id),x])).values()];
 // Distinct days prevent a duplicate recording or multiple segments of one session inflating the trend.
 const days=new Set(unique.map(x=>x.date));
 if(days.size<3)return response('trend-not-established','Fewer than three comparable sessions on separate days in 14 days. Do not recalibrate fitness.',{action:'none',requiresApproval:false});
 if(evidence.outcome==='threshold-success'&&settings.pace===true)return hold('threshold-progression-review','Three comparable successful threshold sessions support review of a small pace progression, not a permanent automatic recalibration.',hard);
 if(evidence.outcome==='easy-hr-elevated'&&settings.pace===true)return hold('easy-hr-review','Repeated elevated easy-run HR warrants review of easy effort, conditions and recovery. Preserve existing HR boundaries.',next);
 if(evidence.outcome==='interval-incomplete')return hold('interval-review','Repeated incomplete comparable intervals warrant review of intensity or volume.',hard||next);
 return response('no-change','No applicable coaching rule.',{action:'none',requiresApproval:false});
}
// Candidate selection is advisory; only an explicit verified provider delivery link can match automatically.
function reconcile(activity,plans,deliveries){
 if(!activity||activity.id==null||activity.sport!=='Running'||date(activity.date)===null)return {status:'invalid',candidates:[]};
 const sessions=Array.isArray(plans)?plans:[];
 const existing=sessions.filter(p=>same(p?.matchId,activity.id));
 if(existing.length===1&&existing[0].id!=null)return {status:'already-linked',sessionId:existing[0].id,candidates:[]};
 if(existing.length)return {status:'review',candidates:existing.flatMap(p=>p.id==null?[]:[p.id])};
 const eligible=sessions.filter(p=>p?.sport==='Running'&&p.id!=null&&p.date===activity.date&&p.status==='planned'&&p.matchId==null);
 // The publication registry stores positive decimal Garmin workout IDs and integer revisions.
 const providerId=String(activity.providerWorkoutId??'');
 const revision=activity.workoutRevision;
 const links=/^[1-9][0-9]{0,14}$/.test(providerId)&&Number.isSafeInteger(revision)&&revision>=1
  ? (Array.isArray(deliveries)?deliveries:[]).filter(d=>d?.verified===true&&same(d.providerWorkoutId,providerId)&&d.revision===revision)
  : [];
 const linked=eligible.filter(p=>p.revision===revision&&links.some(d=>same(d.sessionId,p.id)));
 if(links.length===1&&linked.length===1)return {status:'verified-link',sessionId:linked[0].id,candidates:[linked[0].id]};
 if(links.length)return {status:'review',candidates:linked.map(p=>p.id)};
 const candidates=eligible.filter(p=>pos(p.km)&&pos(activity.distanceKm)&&Math.abs(p.km-activity.distanceKm)/p.km<=.25).map(p=>p.id);
 return {status:candidates.length?'review':'unplanned',candidates};
}
// Pure revision preparation. Persistence must use an authenticated owner-scoped atomic compare-and-swap.
function prepareRevision(session,request,ctx={}){
 const reject=reason=>({ok:false,reason});
 if(!ctx.ownerId||!session||!same(session.ownerId,ctx.ownerId)||!same(request?.ownerId,ctx.ownerId))return reject('owner-mismatch');
 if(session.sport!=='Running'||session.status!=='planned'||session.matchId!=null||date(session.date)===null||date(ctx.today)===null||date(session.date)<=date(ctx.today))return reject('protected-session');
 if(!Number.isInteger(session.revision)||session.revision<1||session.revision!==request.expectedRevision||!same(session.id,request.sessionId))return reject('stale-revision');
 if(!request.eventId||!request.approvedByAthlete||request.operation!=='reduce-distance')return reject('approval-required');
 if((ctx.processedIds||[]).map(String).includes(String(request.eventId)))return reject('duplicate-event');
 if(!['easy','recovery','long','taper','return','ultra'].includes(session.kind))return reject('quality-review-required');
 const steps=session.structuredDetail===session.detail?expand(session.structuredSteps):null;
 if(!steps||!steps.every(s=>s.duration.kind==='distance'&&['warmup','active','cooldown'].includes(s.intensity)))return reject('unsupported-structure');
 const oldMeters=steps.reduce((n,s)=>n+s.duration.meters,0),factor=request.factor;
 if(!pos(factor)||factor<.8||factor>=1||!pos(session.estimatedSeconds)||!pos(session.plannedMinutes)||session.meters!==oldMeters||Math.abs(session.km*1000-oldMeters)>1)return reject('invalid-reduction');
 const revised=steps.map(s=>({...s,duration:{kind:'distance',meters:Math.floor(s.duration.meters*factor/100)*100}}));
 if(revised.some(s=>s.duration.meters<100))return reject('minimum-step');
 const meters=revised.reduce((n,s)=>n+s.duration.meters,0);
 if(meters<oldMeters*.8||meters>=oldMeters)return reject('reduction-limit');
 const detail=revised.map(s=>s.intensity+': '+(s.duration.meters/1000).toFixed(1)+' km').join(' · ');
 const next={...session,revision:session.revision+1,meters,km:meters/1000,estimatedSeconds:Math.ceil(session.estimatedSeconds*meters/oldMeters),plannedMinutes:Math.ceil(session.estimatedSeconds*meters/oldMeters/60),structuredSteps:revised,detail,structuredDetail:detail};
 return {ok:true,next,history:{ownerId:ctx.ownerId,sessionId:session.id,eventId:String(request.eventId),fromRevision:session.revision,toRevision:next.revision,before:JSON.parse(JSON.stringify(session)),after:JSON.parse(JSON.stringify(next)),reason:'Athlete-approved aerobic distance reduction'},requiresAtomicPersistence:true,garminAction:'review-republish'};
}
const api={analyse,propose,expand,uniqueMatch,validatedDistribution,align,reconcile,prepareRevision};root.mileRunningAnalysis=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
