// Batch 88.1: read-only, deterministic running analysis foundation.
// No inferred workout identity, medical claims, plan mutation or external AI.
(function(root){
'use strict';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const positive=v=>{const n=finite(v);return n!==null&&n>0?n:null};
const validHR=n=>n!==null&&n>=30&&n<=250;
const validZones=b=>Array.isArray(b)&&b.length===6&&b.every((v,i)=>Number.isInteger(v)&&v>=30&&v<=250&&(!i||v>b[i-1]));
const time=t=>{const n=finite(t);return n===null?null:n>1e11?n/1000:n};
function integrateHeartRate(points,bounds){
 const rows=(Array.isArray(points)?points:[]).map(p=>({t:time(p.t),hr:finite(p.hr)})).filter(p=>p.t!==null).sort((a,b)=>a.t-b.t);
 if(rows.length<2)return null;
 const span=rows.at(-1).t-rows[0].t;if(span<=0)return null;
 // Integrate linear HR between adjacent valid samples; do not bridge gaps.
 const seconds=Array(bounds.length-1).fill(0);let below=0,above=0,coverage=0;
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i],dt=b.t-a.t;
  if(dt<=0||dt>15||!validHR(a.hr)||!validHR(b.hr))continue;
  coverage+=dt;const cuts=[0,1];
  if(a.hr!==b.hr)for(const edge of bounds){const f=(edge-a.hr)/(b.hr-a.hr);if(f>0&&f<1)cuts.push(f)}
  cuts.sort((x,y)=>x-y);
  for(let j=1;j<cuts.length;j++){
   const lo=cuts[j-1],hi=cuts[j],hr=a.hr+(b.hr-a.hr)*(lo+hi)/2;
   const z=bounds.slice(0,-1).findIndex((v,k)=>hr>=v&&(k===bounds.length-2?hr<=bounds[k+1]:hr<bounds[k+1]));
   const weight=dt*(hi-lo);
   if(z>=0)seconds[z]+=weight;
   else if(hr<bounds[0])below+=weight;
   else above+=weight;
  }
 }
 if(coverage<60||coverage/span<.9)return null;
 return {seconds,outside:below+above,coverage,span,percent:seconds.map(v=>100*v/coverage),
  outsidePercent:100*(below+above)/coverage,belowPercent:100*below/coverage,abovePercent:100*above/coverage};
}
function zoneDistribution(points,bounds){return validZones(bounds)?integrateHeartRate(points,bounds):null}
const aerobicKinds=new Set(['easy','recovery','long','steady','ultra','taper']);
const thresholdKinds=new Set(['cruise','threshold','tempo']);
const raceKinds=new Set(['race5','race10','half','marathon']);
const coaching=root.mileRunningAnalysis||(typeof module!=='undefined'?require('./mile-running-analysis.js'):null);
const prescription=root.mileRunningWorkout||(typeof module!=='undefined'?require('./mile-running-workout.js'):null);
function sessionContext(activity){
 const gain=finite(activity?.totalElevationGainInMeters??activity?.elevationGain),km=positive(activity?.distanceKm);
 const metadata=[activity?.type,activity?.activityType,activity?.subSport].filter(v=>typeof v==='string').join(' ');
 return {hilly:gain!==null&&km!==null&&gain/km>18,treadmill:/treadmill|indoor/i.test(metadata),heat:activity?.heat===true,
  sensorError:activity?.sensorError===true};
}
function aerobicRange(match,points,duration,context){
 if(!match||!aerobicKinds.has(match.kind)||match.structuredDetail!==match.detail||duration===null||context.sensorError)return null;
 const steps=prescription?.expand(match.structuredSteps);
 if(steps?.length!==1||steps[0].intensity!=='active'||steps[0].target?.kind!=='heart_rate')return null;
 const {lowBpm,highBpm}=steps[0].target;
 if(highBpm<=lowBpm)return null;
 const result=integrateHeartRate(points,[lowBpm,highBpm]);
 if(!result||result.coverage<duration*60*.8||result.span>duration*60*1.1)return null;
 return {percent:Math.round(result.percent[0]),above:Math.round(result.abovePercent),below:Math.round(result.belowPercent),target:steps[0].target};
}
function historicalHeartRate(activity,match,workouts,history,context){
 const day=activityDay(activity.date),km=positive(activity.distanceKm),duration=positive(activity.durationMin);
 const hr=finite(activity.averageHR);
 if(!match||!aerobicKinds.has(match.kind)||!['garmin-developer-api','MILE'].includes(activity.source)||
  !km||!duration||duration<20||!validHR(hr)||!Number.isFinite(day)||Object.values(context).some(Boolean))return null;
 const pace=duration/km;
 const comparables=new Map(),seen=new Set([String(activity.id)]);
 const linked=new Map();
 for(const workout of workouts){
  if(workout?.sport!=='Running'||workout.matchId==null)continue;
  const id=String(workout.matchId);
  linked.set(id,linked.has(id)?null:workout.kind);
 }
 for(const run of [...history].filter(run=>run&&typeof run.date==='string').sort((a,b)=>b.date.localeCompare(a.date))){
  const id=String(run.id),age=(day-activityDay(run.date))/86400000,length=positive(run.distanceKm);
  const minutes=positive(run.durationMin),heartRate=finite(run.averageHR);
  if(run.id==null||seen.has(id)||run.source!==activity.source||linked.get(id)!==match.kind||
   !Number.isFinite(activityDay(run.date))||!(age>=1&&age<=42)||comparables.has(run.date)||!length||!minutes||!validHR(heartRate)||
   Math.abs(minutes/duration-1)>.2||Math.abs(minutes/length/pace-1)>.05||
   Object.values(sessionContext(run)).some(Boolean))continue;
  comparables.set(run.date,heartRate);seen.add(id);
  if(comparables.size===8)break;
 }
 if(comparables.size<3)return null;
 const measures=[...comparables.values()].sort((a,b)=>a-b),middle=Math.floor(measures.length/2);
 const median=measures.length%2?measures[middle]:(measures[middle-1]+measures[middle])/2;
 return {count:measures.length,medianBpm:Math.round(median),currentBpm:Math.round(hr),differenceBpm:Math.round(hr-median)};
}
function steadyHeartRateChange(points, durationMin){
 if(durationMin===null||durationMin<30||!Array.isArray(points))return null;
 const rows=points.map(p=>({t:time(p.t),hr:finite(p.hr),dist:finite(p.dist)})).filter(p=>p.t!==null).sort((a,b)=>a.t-b.t);
 if(rows.length<2)return null;
 const first=rows[0].t,last=rows.at(-1).t,span=last-first;
 if(span<durationMin*60*.9||span>durationMin*60*1.1)return null;
 const start=first+300,end=last-300,middle=(start+end)/2;
 const halves=[[start,middle],[middle,end]].map(([from,to])=>{
  let seconds=0,totalHR=0,totalSpeed=0,speedSquared=0;
  for(let i=1;i<rows.length;i++){
   const a=rows[i-1],b=rows[i],dt=b.t-a.t,lo=Math.max(from,a.t),hi=Math.min(to,b.t);
   if(hi<=lo||dt<=0||dt>15||!validHR(a.hr)||!validHR(b.hr)||a.dist===null||b.dist===null)continue;
   const speed=(b.dist-a.dist)/dt;
   if(speed<1.3||speed>7)continue;
   const weight=hi-lo;
   seconds+=weight;
   totalHR+=weight*(a.hr+(b.hr-a.hr)*((lo+hi)/2-a.t)/dt);
   totalSpeed+=weight*speed;
   speedSquared+=weight*speed*speed;
  }
  if(seconds<(to-from)*.95)return null;
  const speed=totalSpeed/seconds;
  const variation=Math.sqrt(Math.max(0,speedSquared/seconds-speed*speed))/speed;
  return variation<=.12?{speed,hr:totalHR/seconds}:null;
 });
 const [early,late]=halves;
 if(!early||!late||Math.abs(late.speed-early.speed)/early.speed>.05)return null;
 return {earlyBpm:Math.round(early.hr),lateBpm:Math.round(late.hr),changeBpm:Math.round(late.hr-early.hr),
  earlyPace:Math.round(1000/early.speed),latePace:Math.round(1000/late.speed),
  efficiencyChange:Math.round(100*((late.speed/late.hr)/(early.speed/early.hr)-1))};
}
const activityDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&
 new Date(value).toISOString().slice(0,10)===value?Date.parse(value):NaN;
function runningLoad(activity,history,review){
 const day=activityDay(activity.date);
 if(!Number.isFinite(day)||(review&&day>activityDay(review.today)))return null;
 const runs=Array.isArray(review?.currentRuns)?review.currentRuns:Array.isArray(history)?history:[];
 const seen=new Set(),current={km:0,days:new Set(),missing:false},previous={km:0,days:new Set(),missing:false};
 let weekKm=null,missingWeekDistance=false;
 for(const run of [activity,...runs]){
  const id=run?.id,km=positive(run?.distanceKm),age=(day-activityDay(run?.date))/86400000;
  if(id==null||seen.has(String(id))||!Number.isFinite(age))continue;
  seen.add(String(id));
  if(review&&review.weekStart<=run.date&&run.date<=review.today){
   if(km===null)missingWeekDistance=true;
   else weekKm=(weekKm??0)+km;
  }
  if(age<0||age>=14)continue;
  const period=age<7?current:previous;
  if(km===null){period.missing=true;continue}
  period.km+=km;period.days.add(run.date);
 }
 return {weekKm,reviewWeekKm:missingWeekDistance?null:weekKm,
  recent:!current.missing&&!previous.missing&&current.days.size>=2&&previous.days.size>=2?
   {currentKm:current.km,previousKm:previous.km}:null};
}
function linkedWorkout(activity,workouts){
 if(activity?.id==null)return null;
 const matches=(Array.isArray(workouts)?workouts:[]).filter(w=>w.sport==='Running'&&w.matchId!=null&&String(w.matchId)===String(activity.id));
 return matches.length===1?matches[0]:null;
}
function reviewRecommendation(activity,analysis,workouts,match,review,actualWeekKm,possibleMatch){
 const fallback={headline:'Keep the current plan.',next:null,rule:null};
 if(!review||!analysis)return fallback;
 const {today,earliest,weekStart,weekEnd,blocks,activeBlock,fatigue}=review;
 const currentBlocks=blocks.filter(b=>b.sport==='Running'&&b.calendarVisible!==false&&b.runningPlan&&b.start<=today&&today<=b.end);
 const programme=match?currentBlocks.find(b=>b.id===match.block):currentBlocks.find(b=>b.id===activeBlock)||(currentBlocks.length===1?currentBlocks[0]:null);
 if(!programme)return {...fallback,headline:'No active running plan to adjust.'};
 const sessions=workouts.filter(w=>w.block===programme.id&&w.sport==='Running'&&programme.start<=w.date&&w.date<=programme.end);
 const next=sessions.filter(w=>w.status==='planned'&&w.matchId==null&&w.date>today).sort((a,b)=>a.date.localeCompare(b.date))[0]??null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(activity.date)||activity.date<earliest||activity.date>today){
  return {...fallback,next,headline:'Keep the current plan. This run is outside the recent review window.'};
 }
 const scheduledWeek=sessions.filter(w=>weekStart<=w.date&&w.date<=weekEnd&&w.status!=='skipped');
 const plannedWeekKm=scheduledWeek.length&&scheduledWeek.every(w=>positive(w.km)!==null)?scheduledWeek.reduce((sum,w)=>sum+Number(w.km),0):null;
 const reportedFatigue=finite(fatigue),poorRecovery=Number.isInteger(reportedFatigue)&&reportedFatigue>=7&&reportedFatigue<=10;
 const evidenceVerified=Boolean(analysis.zones&&analysis.durationMin&&analysis.zones.coverage>=analysis.durationMin*60*.8);
 const proposal=coaching.propose({
  id:analysis.activityId,kind:analysis.kind,classification:possibleMatch?null:analysis.classification,evidenceVerified,evidence:analysis.adaptationEvidence,
 },{today,sessions,settings:programme.runningPlan.config?.adaptation,recovery:poorRecovery?'poor':null,plannedWeekKm,actualWeekKm});
 const upcoming=sessions.find(w=>String(w.id)===proposal.changes[0]?.sessionId);
 const target=upcoming?.name||'your next run';
 switch(proposal.rule){
  case 'recovery-review':
   return {rule:proposal.rule,next,headline:`Review ${target} before starting. Your check-in recorded fatigue of ${reportedFatigue}/10.`};
  case 'unplanned-load-review':
   return {rule:proposal.rule,next,headline:`Review ${target} for enough recovery after this additional demanding run.`};
  case 'additional-mileage-review':
   return {rule:proposal.rule,next,headline:`Keep volume steady. This week is at ${actualWeekKm.toFixed(1)} km against ${plannedWeekKm.toFixed(1)} km planned.`};
  case 'settings-missing':
   return {...fallback,next,headline:'Keep the current plan and confirm your adaptation preferences.'};
  default:
   return possibleMatch?{...fallback,next,headline:'Confirm the scheduled match before changing the plan.'}:{...fallback,next};
 }
}
function analyse(activity,{workouts=[],points=[],bounds=null,review=null,matchSessions=null,lapEvidence=null,history=[]}={}){
 const distance=positive(activity?.distanceKm),duration=positive(activity?.durationMin),hr=finite(activity?.averageHR);
 const normalised={...activity,distanceKm:distance,durationMin:duration};
 const context=sessionContext(normalised);
 const match=linkedWorkout(activity,workouts),zones=context.sensorError?null:zoneDistribution(points,bounds);
 // A lap or elapsed time by itself does not establish correspondence with the prescription.
 const advanced=coaching?.analyse(normalised,{plans:workouts,zoneDistribution:zones,lapEvidence,context})||null;
 const matchReview=!match&&matchSessions?coaching?.reconcile(
  {id:activity.id,date:activity.date,sport:'Running',distanceKm:distance,durationMin:duration},matchSessions,[]
 ):null;
 const load=runningLoad(normalised,history,review);
 return {kind:match?'linked':'unlinked',name:match?String(match.name||'Scheduled run'):null,sessionKind:match?.kind??null,
  purpose:match?.purpose||null,
  prescriptionRevision:Number.isSafeInteger(match?.revision)&&match.revision>=1?match.revision:null,
  heartRateChange:aerobicKinds.has(match?.kind)&&!Object.values(context).some(Boolean)?steadyHeartRateChange(points,duration):null,
  aerobicRange:aerobicRange(match,points,duration,context),
  historicalHR:historicalHeartRate(normalised,match,workouts,history,context),
  plannedKm:match?positive(match.km):null,distanceKm:distance,durationMin:duration,
  pace:distance&&duration?duration*60/distance:null,averageHR:validHR(hr)&&!context.sensorError?hr:null,zones,advanced,
  recommendation:reviewRecommendation(activity,advanced,workouts,match,review,load?.reviewWeekKm??null,Boolean(matchReview?.evidence?.length)),
  matchReview:matchReview?.evidence??null,
  recordedWeekKm:review&&review.weekStart<=activity?.date&&activity.date<=review.today?load?.weekKm??null:null,
  recentLoad:load?.recent??null};
}
const fmtPace=n=>{if(n===null||!Number.isFinite(n))return 'Unavailable';const s=Math.round(n);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+'/km'};
function fmtDuration(seconds){
 if(!Number.isFinite(seconds))return 'Unavailable';
 const total=Math.round(seconds),minutes=Math.floor(total/60),remainder=total%60;
 if(total>=3600)return root.mileRunningWorkout?.time(total)||Math.floor(total/3600)+' h '+(minutes%60)+' min';
 if(!minutes)return remainder+' s';
 return minutes+' min'+(remainder?' '+remainder+' s':'');
}
function brief(result){
 const a=result.advanced,range=result.aerobicRange,drift=result.heartRateChange,history=result.historicalHR;
 const review=result.recommendation,next=review.next,load=result.recentLoad,paceCounts=a?.mainPaceCounts;
 const paceCount=paceCounts?paceCounts.within+paceCounts.faster+paceCounts.slower:0;
 const quality=result.kind==='linked'&&result.sessionKind!==null&&!aerobicKinds.has(result.sessionKind);
 let execution='There isn’t enough reliable heart-rate data to assess intensity.';
 if(result.kind==='linked'){
  if(range)execution=range.above>=20?`Heart rate was above the prescribed range for ${range.above}% of the sampled run.`:
   range.below>=20?`Heart rate was below the prescribed range for ${range.below}% of the sampled run.`:
   'Heart rate stayed near the intended effort for most of the run.';
  else if(a?.execution==='incomplete'){
   const short=a.steps.filter(step=>['active','interval'].includes(step.intensity)&&step.completionRatio!==null&&step.completionRatio<.9).length;
   execution=short===1?'One work step ended early.':`${short} work steps ended early.`;
  }else if(paceCount){
   const {within,faster,slower}=paceCounts;
   execution=paceCount===1?(within?'The work segment was in the prescribed pace range.':
    faster?'The work segment was faster than prescribed.':'The work segment was slower than prescribed.'):
    `${within} of ${paceCount} measured work steps were in the pace range.${faster&&slower?' The others varied in both directions.':
     faster?' The rest were faster.':slower?' The rest were slower.':''}`;
  }else execution={
   'on-target':'The recorded work matched the prescribed distance or time and target.',
   'above-target':'Heart rate was above target in part of the recorded work.',
   'below-target':'Some recorded work stayed below the target.',
  }[a?.execution]||'Verified step data are needed to assess execution.';
 }else if(a?.classification==='higher-intensity'){
  execution=`You recorded ${Math.round((a.zones.seconds[3]+a.zones.seconds[4])/60)} min in your two highest heart-rate zones.`;
 }else if(a?.classification==='predominantly-aerobic'){
  execution=`${Math.round(a.zones.percent[0]+a.zones.percent[1])}% of sampled time was in your two lowest heart-rate zones.`;
 }
 else if(a?.classification==='mixed')execution='Recorded heart rate covered a mix of easy and harder zones.';

 let trendHeading='Performance trend';
 let trend='There isn’t enough comparable data to establish a trend.';
 const fatigue=review.rule==='recovery-review';
 const timedRecoveries=a?.recoverySteps?.filter(step=>step.durationKind==='time')??[];
 const shortRecoveries=timedRecoveries.filter(step=>step.seconds+5<step.planned).length;
 if(fatigue){trendHeading='Fatigue & recovery';trend='Your fatigue check-in favours a conservative next session.'}
 else if(drift&&drift.changeBpm>=5){
  trend=`Heart rate rose ${drift.changeBpm} bpm at a similar speed later in the run. Conditions can contribute to that change.`;
 }else if(history){
  const difference=history.differenceBpm;
  trend=Math.abs(difference)<3?`Heart rate was close to your typical reading across ${history.count} comparable runs.`:
   `Heart rate was ${Math.abs(difference)} bpm ${difference>0?'higher':'lower'} than your recent median at a similar pace. Conditions may differ.`;
 }else if(shortRecoveries){
  trendHeading='Fatigue & recovery';trend=timedRecoveries.length===1?
   `The timed recovery ended ${Math.round(timedRecoveries[0].planned-timedRecoveries[0].seconds)} seconds early.`:
   `${shortRecoveries} of ${timedRecoveries.length} timed recoveries were shorter than planned.`;
 }else if(a?.intervalPaceSpread!=null){
  trend=`Comparable reps were within ${Math.round(a.intervalPaceSpread)} s/km of one another.`;
 }else if(load&&Math.abs(load.currentKm-load.previousKm)>=Math.max(2,load.previousKm*.2)){
  trend=`Recorded distance was ${load.currentKm.toFixed(1)} km over seven days, versus ${load.previousKm.toFixed(1)} km in the previous seven.`;
 }else if(a?.classification==='higher-intensity'||timedRecoveries.length){
  trendHeading='Fatigue & recovery';trend=timedRecoveries.length?'You took the prescribed recovery time between work steps.':'Leave time to recover before another demanding session.';
 }
 const focusKind=next?.kind??result.sessionKind;
 let focus='Start gently and settle into an effort suited to the session.';
 if(fatigue)focus='Check how you feel before adding faster work.';
 else if(a?.classification==='higher-intensity')focus='Start gently and see how your legs feel before building speed.';
 else if(focusKind==='recovery')focus='Keep the recovery run relaxed. Let pace drop on hills to stay within the easy effort.';
 else if(['long','progressive','ultra'].includes(focusKind))focus='Start the long run gently and keep the early effort steady so you can finish in control.';
 else if(raceKinds.has(focusKind))focus='Find the prescribed race rhythm early and keep it steady through the last effort.';
 else if(thresholdKinds.has(focusKind))focus='Settle into the threshold pace range early and finish at the same controlled effort.';
 else if(aerobicKinds.has(focusKind))focus=drift?.changeBpm>=5||range?.above>=20?
  'Open more gently and ease back when heart rate starts to climb.':'Keep the run conversational and use your prescribed HR range if available.';
 else if((next&&prescription.demanding(next))||quality)focus=shortRecoveries?
  'Take the full recovery, then aim for the same controlled effort on each rep.':'Start the first rep within the prescribed pace range and aim to repeat it.';
 const metrics=[
  result.distanceKm!==null?['Distance',result.distanceKm+' km']:null,
  result.durationMin!==null?['Time',fmtDuration(result.durationMin*60)]:null,
  range?['In HR range',range.percent+'%']:a?.workPace!=null?['Work pace',fmtPace(a.workPace)]:result.pace!==null?['Avg pace',fmtPace(result.pace)]:null,
  result.averageHR!==null?['Avg HR',Math.round(result.averageHR)+' bpm']:null,
 ].filter(Boolean);
 return {metrics,execution,trendHeading,trend,focus,adjustment:review.headline};
}
function render(host,result,{confirmMatch,renderCharts,detailsOpen=false}={}){
 const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
 const section=(title,parent=host)=>{const e=el('section',undefined,'mile35-panel m881-analysis');e.append(el('h3',title));parent.append(e);return e};
 const row=(p,k,v)=>{const e=el('div',undefined,'mile35-datarow');e.append(el('span',k),el('strong',v));p.append(e)};
 const quick=brief(result);
 const summary=section('MILE IQ · Running analysis');
 summary.classList.add('m881-quick');
 summary.append(el('p',result.kind==='linked'?'Linked session: '+result.name:'No scheduled session linked.','muted small'));
 const metrics=el('dl',undefined,'m881-quick-metrics');
 for(const [label,value] of quick.metrics){
  const item=el('div');
  item.append(el('dt',label),el('dd',value));
  metrics.append(item);
 }
 if(quick.metrics.length)summary.append(metrics);
 const notes=el('div',undefined,'m881-quick-notes');
 for(const [heading,note] of [
  ['Session execution',quick.execution],[quick.trendHeading,quick.trend],
  ['Next session focus',quick.focus],['Programme adjustment',quick.adjustment],
 ]){
  const part=el('section');part.append(el('h4',heading),el('p',note));notes.append(part);
 }
 summary.append(notes);
 if(result.matchReview){
  const p=section('Possible scheduled matches');
  if(result.matchReview.length){
   p.append(el('p','Choose the session you completed.','muted small'));
   for(const candidate of result.matchReview){
    const comparison=[
     candidate.distance!==null?root.mileRunningWorkout.distance(candidate.distance*1000):null,
     candidate.duration!==null?(candidate.durationEstimated?'~':'')+root.mileRunningWorkout.time(Math.round(candidate.duration)*60):null,
    ].filter(Boolean);
    const card=el('div',undefined,'m881-match-card');
    row(card,candidate.name,comparison.join(' · '));
    p.append(card);
    if(confirmMatch){
     const button=el('button','Link','btn alt sm');
     button.setAttribute('aria-label','Link to '+candidate.name);
     button.type='button';
     button.classList.add('m881-match-link');
     button.addEventListener('click',async ()=>{
      const controls=[...card.parentElement.querySelectorAll('.m881-match-link')];
      controls.forEach(control=>control.disabled=true);
      try{await confirmMatch(candidate.id)}
      finally{controls.forEach(control=>control.disabled=false)}
     });
     card.append(button);
    }
   }
  }else p.append(el('p','No comparable scheduled runs on this date.','muted small'));
 }
 const details=el('details',undefined,'mile35-panel m881-detailed');
 details.append(el('summary','Detailed Analysis'));
 host.append(details);
 const a=result.advanced,breakdown=section('Session evidence',details);
 if(result.purpose)breakdown.append(el('p',result.purpose,'small'));
 if(result.prescriptionRevision!==null)row(breakdown,'Linked MILE workout revision',String(result.prescriptionRevision));
 if(result.kind==='linked'){
  const plannedDistance=a?.plannedDistance??result.plannedKm;
  if(plannedDistance!==null)row(breakdown,a?.plannedDistanceSource==='structured-distance'?'Planned distance':'Planned distance estimate',prescription.distance(plannedDistance*1000));
  if(a?.plannedDuration!=null)row(breakdown,a.plannedDurationSource==='structured-time'?'Planned duration':'Planned duration estimate',fmtDuration(a.plannedDuration*60));
  if(a?.prescribedMeters>0)row(breakdown,'Distance in prescribed steps',prescription.distance(a.prescribedMeters));
  if(a?.prescribedSeconds>0)row(breakdown,'Time in prescribed steps',fmtDuration(a.prescribedSeconds));
  if(a?.totalDistanceRatio!=null)row(breakdown,'Distance completed',Math.round(a.totalDistanceRatio*100)+'%');
  if(!a?.steps&&!result.aerobicRange)breakdown.append(el('p','Verified step alignment required to compare individual steps.','muted small'));
 }
 if(result.recordedWeekKm!==null)row(breakdown,'Running distance recorded this week',result.recordedWeekKm.toFixed(1)+' km');
 if(a?.intervalPaceSpread!=null)row(breakdown,'Pace spread between repetitions',Math.round(a.intervalPaceSpread)+' s/km');
 if(a?.cautions.length)breakdown.append(el('p',a.cautions.join(' '),'muted small'));
 if(result.aerobicRange){
  row(breakdown,'Prescribed heart rate',prescription.targetLabel(result.aerobicRange.target));
  row(breakdown,'Recorded HR in range',result.aerobicRange.percent+'%');
  row(breakdown,'Below / above prescribed HR',result.aerobicRange.below+'% / '+result.aerobicRange.above+'%');
 }
 if(result.recentLoad){
  const {currentKm,previousKm}=result.recentLoad;
  row(breakdown,'Seven days through this run',currentKm.toFixed(1)+' km recorded');
  row(breakdown,'Previous seven days',previousKm.toFixed(1)+' km recorded');
 }
 const hr=section('Recorded heart rate distribution',details);
 if(!result.zones)hr.append(el('p','Heart-rate zones need saved ranges and enough recorded samples.','muted small'));
 else {
  const z=result.zones;
  z.percent.forEach((value,index)=>row(hr,'Zone '+(index+1),value.toFixed(1)+'%'));
  row(hr,'Outside configured zones',z.outsidePercent.toFixed(1)+'%');
  row(hr,'Sample-span coverage',(100*z.coverage/z.span).toFixed(1)+'%');
 }
 if(result.heartRateChange||result.historicalHR){
  const trend=section('Heart rate at comparable pace',details);
  if(result.heartRateChange){
   const {earlyBpm,lateBpm,earlyPace,latePace,efficiencyChange}=result.heartRateChange;
   row(trend,'Early to late in this run',earlyBpm+' → '+lateBpm+' bpm');
   row(trend,'Early to late pace',fmtPace(earlyPace)+' → '+fmtPace(latePace));
   row(trend,'Change in speed per heartbeat',(efficiencyChange>0?'+':'')+efficiencyChange+'%');
   trend.append(el('p','Compares steady segments and excludes the first and last five minutes. Terrain and conditions can affect the result.','muted small'));
  }
  if(result.historicalHR){
   const {currentBpm,medianBpm,count}=result.historicalHR;
   row(trend,'This run and recent median',currentBpm+' vs '+medianBpm+' bpm');
   trend.append(el('p',count+' runs of the same kind, similar pace and duration, in the previous six weeks. Terrain, conditions and sensor quality may differ.','muted small'));
  }
 }
 const labels={active:'Work step',interval:'Repetition',recovery:'Recovery'};
 const aligned=a?.steps?.filter(step=>Object.hasOwn(labels,step.intensity))||[];
 if(aligned.length){
  const steps=section('Verified work and recovery steps',details),counts={active:0,interval:0,recovery:0};
  for(const step of aligned){
   steps.append(el('h4',labels[step.intensity]+' '+(++counts[step.intensity])));
   const planned=step.durationKind==='distance'?Math.round(step.planned)+' m':step.durationKind==='time'?fmtDuration(step.planned):prescription.durationLabel(step.duration);
   row(steps,'Planned step',planned);
   row(steps,'Recorded step',step.meters+' m · '+fmtDuration(step.seconds));
   if(step.target?.kind==='pace'){
    const {fastSecondsPerKm,slowSecondsPerKm}=step.target;
    row(steps,'Planned pace',fastSecondsPerKm===slowSecondsPerKm?fmtPace(fastSecondsPerKm):fmtPace(fastSecondsPerKm)+'–'+fmtPace(slowSecondsPerKm));
    if(step.pace!==null)row(steps,'Recorded pace',fmtPace(step.pace));
   }
   if(step.target?.kind==='heart_rate')row(steps,'Target heart rate',prescription.targetLabel(step.target));
   if(step.durationKind==='heart_rate')steps.append(el('p','Recorded average HR does not confirm when the step ended.','muted small'));
   if(step.averageHR!==null)row(steps,'Recorded average HR',Math.round(step.averageHR)+' bpm');
  }
 }
 if(renderCharts){
  const charts=el('div',undefined,'m881-detailed-charts');
  details.append(charts);
  const mount=()=>{
   if(details.open&&!charts.dataset.mounted){charts.dataset.mounted='true';renderCharts(charts)}
  };
  details.addEventListener('toggle',mount);
  details.open=detailsOpen;
  mount();
 }
 details.open=detailsOpen;
}
const api={analyse,linkedWorkout,zoneDistribution,validZones,fmtPace,brief,render};
root.mileRunningIQ=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
