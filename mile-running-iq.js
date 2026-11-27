// Batch 88.1: read-only, deterministic running analysis foundation.
// No inferred workout identity, medical claims, plan mutation or external AI.
(function(root){
'use strict';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const positive=v=>{const n=finite(v);return n!==null&&n>0?n:null};
const validHR=n=>n!==null&&n>=30&&n<=250;
const validZones=b=>Array.isArray(b)&&b.length===6&&b.every((v,i)=>Number.isInteger(v)&&v>=30&&v<=250&&(!i||v>b[i-1]));
const time=t=>{const n=finite(t);return n===null?null:n>1e11?n/1000:n};
function zoneDistribution(points,bounds){
 if(!validZones(bounds))return null;
 const rows=(Array.isArray(points)?points:[]).map(p=>({t:time(p.t),hr:finite(p.hr)})).filter(p=>p.t!==null).sort((a,b)=>a.t-b.t);
 if(rows.length<2)return null;
 const span=rows.at(-1).t-rows[0].t;if(span<=0)return null;
 // Integrate linear HR between adjacent valid samples; do not bridge gaps.
 const seconds=Array(5).fill(0);let outside=0,coverage=0;
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i],dt=b.t-a.t;
  if(dt<=0||dt>15||!validHR(a.hr)||!validHR(b.hr))continue;
  coverage+=dt;const cuts=[0,1];
  if(a.hr!==b.hr)for(const edge of bounds){const f=(edge-a.hr)/(b.hr-a.hr);if(f>0&&f<1)cuts.push(f)}
  cuts.sort((x,y)=>x-y);
  for(let j=1;j<cuts.length;j++){
   const lo=cuts[j-1],hi=cuts[j],hr=a.hr+(b.hr-a.hr)*(lo+hi)/2;
   const z=bounds.slice(0,5).findIndex((v,k)=>hr>=v&&(k===4?hr<=bounds[k+1]:hr<bounds[k+1]));
   if(z<0)outside+=dt*(hi-lo);else seconds[z]+=dt*(hi-lo);
  }
 }
 if(coverage<60||coverage/span<.9)return null;
 return {seconds,outside,coverage,span,percent:seconds.map(v=>100*v/coverage),outsidePercent:100*outside/coverage};
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
 return {earlyBpm:Math.round(early.hr),lateBpm:Math.round(late.hr),changeBpm:Math.round(late.hr-early.hr)};
}
function linkedWorkout(activity,workouts){
 if(activity?.id==null)return null;
 const matches=(Array.isArray(workouts)?workouts:[]).filter(w=>w.sport==='Running'&&w.matchId!=null&&String(w.matchId)===String(activity.id));
 return matches.length===1?matches[0]:null;
}
function reviewRecommendation(activity,analysis,workouts,match,review,actualWeekKm,possibleMatch){
 if(!review||!analysis)return null;
 const {today,earliest,weekStart,weekEnd,blocks,activeBlock,fatigue}=review;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(activity.date)||activity.date<earliest||activity.date>today){
  return {detected:'Activity outside the current review window',evidence:'Current recommendations use runs recorded today or in the previous two days.',reason:'Recent runs are more relevant to upcoming sessions.',moreEvidence:true};
 }
 const currentBlocks=blocks.filter(b=>b.sport==='Running'&&b.calendarVisible!==false&&b.runningPlan&&b.start<=today&&today<=b.end);
 const programme=match?currentBlocks.find(b=>b.id===match.block):currentBlocks.find(b=>b.id===activeBlock)||(currentBlocks.length===1?currentBlocks[0]:null);
 if(!programme)return {detected:'No current personalised running programme selected',evidence:'This activity is available in your running history.',reason:'Select or build a current running programme to review its upcoming sessions.',moreEvidence:null};

 const sessions=workouts.filter(w=>w.block===programme.id&&w.sport==='Running'&&programme.start<=w.date&&w.date<=programme.end);
 const scheduledWeek=sessions.filter(w=>weekStart<=w.date&&w.date<=weekEnd);
 const plannedWeekKm=scheduledWeek.length&&scheduledWeek.every(w=>positive(w.km)!==null)?scheduledWeek.reduce((sum,w)=>sum+Number(w.km),0):null;
 const reportedFatigue=finite(fatigue),poorRecovery=Number.isInteger(reportedFatigue)&&reportedFatigue>=7&&reportedFatigue<=10;
 const evidenceVerified=Boolean(analysis.zones&&analysis.durationMin&&analysis.zones.coverage>=analysis.durationMin*60*.8);
 const proposal=root.mileRunningAnalysis.propose({
  id:analysis.activityId,kind:analysis.kind,classification:possibleMatch?null:analysis.classification,evidenceVerified,evidence:analysis.adaptationEvidence,
 },{today,sessions,settings:programme.runningPlan.config?.adaptation,recovery:poorRecovery?'poor':null,plannedWeekKm,actualWeekKm});
 if(possibleMatch&&evidenceVerified&&analysis.classification==='higher-intensity'&&proposal.rule==='insufficient-evidence'){
  return {detected:'Scheduled match unresolved',evidence:'Recorded heart rate suggests demanding training. This run also resembles a scheduled session.',reason:'Confirm the match before treating this activity as additional demanding training.',moreEvidence:true};
 }
 const upcoming=sessions.find(w=>String(w.id)===proposal.changes[0]?.sessionId);
 let detected='Comparable trend unavailable';
 let evidence=evidenceVerified?'Recorded heart-rate samples support a description of this run. Comparable sessions are needed for a progression review.':'Verified step alignment or sufficiently complete recorded heart-rate data is needed before evaluating a comparable training trend.';
 switch(proposal.rule){
  case 'recovery-review':
   detected='High self-reported fatigue';
   evidence=`Today’s recovery check-in reports ${reportedFatigue}/10 fatigue.`;
   break;
  case 'unplanned-load-review':
   detected='Additional demanding run';
   evidence=`${(analysis.zones.percent[3]+analysis.zones.percent[4]).toFixed(0)}% of covered recorded heart-rate time was in Zones 4 and 5.`;
   break;
  case 'additional-mileage-review':
   detected='Recorded running distance above the weekly plan';
   evidence=`${actualWeekKm.toFixed(1)} km recorded this week against ${plannedWeekKm.toFixed(1)} km scheduled in ${programme.name||'your running programme'}.`;
   break;
  case 'settings-missing':
   detected='Adaptation preferences unavailable';
   evidence='This programme has no confirmed adaptation preferences.';
   break;
 }
 return {
  detected,evidence,reason:proposal.reason,upcoming:upcoming?{name:upcoming.name||'Scheduled run',date:upcoming.date}:null,
  moreEvidence:proposal.rule==='settings-missing'?null:proposal.rule==='insufficient-evidence'||proposal.rule==='trend-not-established',
 };
}
function analyse(activity,{workouts=[],points=[],bounds=null,review=null,matchSessions=null,lapEvidence=null}={}){
 const distance=positive(activity?.distanceKm),duration=positive(activity?.durationMin),hr=finite(activity?.averageHR);
 const match=linkedWorkout(activity,workouts),zones=zoneDistribution(points,bounds);
 // Verified alignment must be supplied separately from the raw activity data.
 const advanced=root.mileRunningAnalysis?.analyse({...activity,distanceKm:distance,durationMin:duration},{plans:workouts,zoneDistribution:zones,lapEvidence})||null;
 // Imported summaries have no verified Garmin publication identity.
 const matchReview=!match&&matchSessions?root.mileRunningAnalysis?.reconcile(
  {id:activity.id,date:activity.date,sport:'Running',distanceKm:distance,durationMin:duration},matchSessions,[]
 ):null;
 const actualWeekKm=review?review.currentRuns.filter(x=>review.weekStart<=x.date&&x.date<=review.today&&positive(x.distanceKm)!==null).reduce((sum,x)=>sum+Number(x.distanceKm),0):null;
 return {kind:match?'linked':'unlinked',name:match?String(match.name||'Scheduled run'):null,
  purpose:match?.purpose||null,
  prescriptionRevision:Number.isSafeInteger(match?.revision)&&match.revision>=1?match.revision:null,
  heartRateChange:['easy','recovery','long'].includes(match?.kind)?steadyHeartRateChange(points,duration):null,
  plannedKm:match?positive(match.km):null,distanceKm:distance,durationMin:duration,
  pace:distance&&duration?duration*60/distance:null,averageHR:validHR(hr)?hr:null,zones,advanced,
  recommendation:reviewRecommendation(activity,advanced,workouts,match,review,actualWeekKm,Boolean(matchReview?.evidence?.length)),
  matchReview:matchReview?.evidence??null,
  recordedWeekKm:review&&review.weekStart<=activity?.date&&activity.date<=review.today&&distance!==null?actualWeekKm:null};
}
const fmtPace=n=>{if(n===null||!Number.isFinite(n))return 'Unavailable';const s=Math.round(n);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+'/km'};
function fmtDuration(seconds){
 if(!Number.isFinite(seconds))return 'Unavailable';
 const total=Math.round(seconds),minutes=Math.floor(total/60),remainder=total%60;
 if(!minutes)return remainder+' s';
 return minutes+' min'+(remainder?' '+remainder+' s':'');
}
function render(host,result){
 const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
 const section=(title)=>{const e=el('section',undefined,'mile35-panel m881-analysis');e.append(el('h3',title));host.append(e);return e};
 const row=(p,k,v)=>{const e=el('div',undefined,'mile35-datarow');e.append(el('span',k),el('strong',v));p.append(e)};
 let p=section('MILE IQ · Running analysis');
 p.append(el('p',result.kind==='linked'?'Linked session: '+result.name:'No scheduled session linked. This activity still contributes to your recorded training history.','muted small'));
 row(p,'Recorded distance',result.distanceKm===null?'Unavailable':result.distanceKm.toFixed(2)+' km');
 row(p,'Recorded duration',fmtDuration(result.durationMin===null?null:result.durationMin*60));
 row(p,'Average pace (duration / distance)',fmtPace(result.pace));
 row(p,'Average HR',result.averageHR===null?'Unavailable':Math.round(result.averageHR)+' bpm');
 if(result.kind==='linked'&&!result.advanced){
  p=section('Planned vs actual');row(p,'Planned distance estimate',result.plannedKm===null?'Unavailable':result.plannedKm+' km');
  row(p,'Actual distance',result.distanceKm===null?'Unavailable':result.distanceKm.toFixed(2)+' km');
  p.append(el('p','Main-set adherence is not yet assessed. The stored plan distance may exclude warm-up or recovery.','muted small'));
 }
 p=section('Recorded heart rate distribution');
 if(!result.zones){p.append(el('p','Unavailable: configured HR zones and sufficiently complete timestamped HR samples are required.','muted small'))}
 else{
  const z=result.zones;
  p.append(el('p','Based on covered sample time, using your current saved zones; not moving-time or main-set adherence.','muted small'));
  z.percent.forEach((v,i)=>row(p,'Zone '+(i+1),v.toFixed(1)+'%'));
  row(p,'Outside configured zones',z.outsidePercent.toFixed(1)+'%');
  row(p,'Sample-span coverage',(100*z.coverage/z.span).toFixed(1)+'%');
 }
 if(result.advanced){
  const a=result.advanced;
  p=section(a.kind==='planned'?'Session execution':'Training contribution');
  if(a.kind==='planned'){
   if(result.prescriptionRevision!==null)row(p,'Linked MILE workout revision',String(result.prescriptionRevision));
   if(result.purpose)p.append(el('p',result.purpose,'small'));
   row(p,a.plannedDistanceSource==='structured-distance'?'Planned distance':'Planned distance estimate',a.plannedDistance===null?'Unavailable':a.plannedDistance.toFixed(2)+' km');
   row(p,a.plannedDurationSource==='structured-time'?'Planned duration':'Planned duration estimate',fmtDuration(a.plannedDuration===null?null:a.plannedDuration*60));
   row(p,'Recorded duration',fmtDuration(a.durationMin===null?null:a.durationMin*60));
   row(p,'Distance completed',a.totalDistanceRatio===null?'Unavailable':Math.round(a.totalDistanceRatio*100)+'%');
   const execution=a.execution!=='insufficient-evidence'?a.execution.replaceAll('-',' '):a.steps?'Target execution unavailable':'Verified step alignment required';
   row(p,'Main-set execution',execution);
   if(result.heartRateChange){
    const hr=result.heartRateChange;
    row(p,'Heart rate at similar recorded speed',hr.earlyBpm+' → '+hr.lateBpm+' bpm');
    p.append(el('p','Comparison omits the first and last five minutes. Terrain, conditions and sensor quality can affect heart rate. This comparison does not change the plan.','muted small'));
   }
   if(a.workPace!==null)row(p,'Recorded pace on steps with pace targets',fmtPace(a.workPace));
   if(a.intervalPaceSpread!==null)row(p,'Pace spread between repetitions',Math.round(a.intervalPaceSpread)+' s/km');
   const labels={active:'Work step',interval:'Repetition',recovery:'Recovery'};
   const steps=a.steps?.filter(step=>Object.hasOwn(labels,step.intensity))||[];
   if(steps.length){
    const details=el('details'),counts={active:0,interval:0,recovery:0};
    const summary=el('summary','Verified work and recovery steps');
    summary.style.minHeight='44px';
    summary.style.paddingBlock='10px';
    summary.style.cursor='pointer';
    details.append(summary);
    for(const step of steps){
     details.append(el('h4',labels[step.intensity]+' '+(++counts[step.intensity])));
     const planned=step.durationKind==='distance'?Math.round(step.planned)+' m':step.durationKind==='time'?fmtDuration(step.planned):'Open';
     row(details,'Planned step',planned);
     row(details,'Recorded step',Math.round(step.meters)+' m · '+fmtDuration(step.seconds));
     if(step.target?.kind==='pace'){
      const {fastSecondsPerKm,slowSecondsPerKm}=step.target;
      row(details,'Planned pace',fastSecondsPerKm===slowSecondsPerKm?fmtPace(fastSecondsPerKm):fmtPace(fastSecondsPerKm)+'–'+fmtPace(slowSecondsPerKm));
      if(step.pace!==null)row(details,'Recorded pace',fmtPace(step.pace));
     }
     if(step.averageHR!==null)row(details,'Recorded average HR',Math.round(step.averageHR)+' bpm');
    }
    p.append(details);
   }
  }else{
   row(p,'Recorded stimulus',a.classification.replaceAll('-',' '));
   if(result.recordedWeekKm!==null)row(p,'Running distance recorded this week',result.recordedWeekKm.toFixed(1)+' km');
   p.append(el('p',a.recovery,'muted small'));
  }
  p.append(el('p',a.stimulus,'muted small'));
  for(const note of [...(a.good||[]),...(a.improve||[]),...(a.cautions||[])])p.append(el('p',note,'muted small'));
 }
 if(result.matchReview){
  p=section('Possible scheduled matches');
  if(result.matchReview.length){
   p.append(el('p',result.matchReview.length>1?'Several scheduled runs are similar. Athlete confirmation is required to link one.':'A scheduled run is similar. Athlete confirmation is required to link it.','muted small'));
   for(const candidate of result.matchReview){
    const comparison=[
     candidate.distance!==null?candidate.distance.toFixed(2)+' km planned':null,
     candidate.duration!==null?(candidate.durationEstimated?'~':'')+Math.round(candidate.duration)+' min planned':null,
    ].filter(Boolean);
    row(p,candidate.name,comparison.join(' · '));
   }
  }else p.append(el('p','No comparable scheduled runs on this date.','muted small'));
 }
 const review=result.recommendation;
 p=section(review?'Adaptation review':'Training context');
 if(review){
  p.append(el('h4',review.detected),el('p',review.evidence,'small'),el('p',review.reason,'muted small'));
  if(review.upcoming)row(p,'Upcoming session to review',`${review.upcoming.name} · ${review.upcoming.date}`);
  if(review.moreEvidence!==null)row(p,'Additional evidence',review.moreEvidence?'Required':'Review can start now');
 }
 p.append(el('p','No workout targets or future sessions have been changed.','muted small'));
}
const api={analyse,linkedWorkout,zoneDistribution,validZones,fmtPace,render};
root.mileRunningIQ=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
