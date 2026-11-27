// Batch 88.2 foundation. Pure deterministic planning; separate from UI, persistence and device publishing.
(function runningEngine(root){
'use strict';
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const validPace=v=>positive(v)&&v>=150&&v<=1200;
const dayList=x=>Array.isArray(x)?[...new Set(x.filter(d=>Number.isInteger(d)&&d>=0&&d<7))].sort((a,b)=>a-b):[];
const diff=(a,b)=>Math.min((a-b+7)%7,(b-a+7)%7);
const unit=100;
const round=n=>Math.floor(n/unit)*unit;
const weights=[.4,.3,.2,.1];
const caps={beginner:.05,intermediate:.07,experienced:.08,advanced:.10};
const goals=['fitness','endurance','first-race','personal-best','5k','10k','half-marathon','marathon','ultra','return'];
const raceKm={'5k':5,'10k':10,'half-marathon':21.0975,marathon:42.195,ultra:null};
const templates={
 easy:{name:'Easy aerobic run',purpose:'Build aerobic fitness with low fatigue.',focus:'Keep breathing conversational; slow down to stay within your easy effort or HR range.'},
 recovery:{name:'Recovery run',purpose:'Maintain gentle aerobic movement without adding a demanding stimulus.',focus:'Keep effort very relaxed; shorten or skip if recovery is poor.'},
 long:{name:'Long aerobic run',purpose:'Develop endurance and durability through sustained aerobic work.',focus:'Start gently, keep effort steady and avoid chasing pace on hills.'},
 progressive:{name:'Progressive long run',purpose:'Practise finishing an endurance session with controlled form.',focus:'Run the opening section easily. Increase effort gently in the final work segment only if you feel comfortable.',reps:1,fraction:.24},
 hills:{name:'Controlled uphill repeats',purpose:'Practise uphill running form at controlled aerobic effort.',focus:'Use a moderate grade, keep the effort repeatable, and jog gently downhill for recovery.',demanding:true,reps:4,fraction:.24},
 strides:{name:'Easy run with relaxed strides',purpose:'Practise quick, relaxed turnover with minimal fast volume.',focus:'Accelerate smoothly, stay relaxed and take full easy recoveries.',reps:4,fraction:.10},
 steady:{name:'Steady aerobic run',purpose:'Build sustained aerobic endurance.',focus:'Keep the effort steady from start to finish.'},
 cruise:{name:'Threshold cruise intervals',purpose:'Improve sustainable running speed and threshold endurance.',focus:'Keep each repetition controlled and consistent; do not chase a faster final repetition.',demanding:true,reps:4,fraction:.48},
 threshold:{name:'Continuous threshold run',purpose:'Develop sustained threshold endurance.',focus:'Finish with control; avoid racing the final segment.',demanding:true,reps:1,fraction:.40},
 vo2:{name:'Controlled fast intervals',purpose:'Develop aerobic power and running economy.',focus:'Maintain smooth mechanics and repeatable effort, not an all-out sprint.',demanding:true,reps:5,fraction:.30},
 fartlek:{name:'Controlled fartlek',purpose:'Practise changing speed while maintaining aerobic control.',focus:'Relax during recoveries and keep faster efforts repeatable.',demanding:true,reps:5,fraction:.30},
 race5:{name:'5K-specific intervals',purpose:'Practise controlled 5K rhythm.',focus:'Use current demonstrated ability, not an aspirational race pace.',demanding:true,reps:5,fraction:.36},
 race10:{name:'10K-specific intervals',purpose:'Develop sustained 10K effort.',focus:'Keep repetitions even and avoid exceeding current fitness.',demanding:true,reps:3,fraction:.45},
 half:{name:'Half marathon rhythm',purpose:'Practise sustained half marathon effort.',focus:'Maintain steady breathing and even rhythm.',demanding:true,reps:2,fraction:.55},
 marathon:{name:'Marathon rhythm',purpose:'Practise controlled marathon effort and pacing.',focus:'Keep effort sustainable; practise fueling when appropriate.',reps:2,fraction:.55},
 ladder:{name:'Distance ladder',purpose:'Practise steady pacing through longer repetitions.',focus:'Start each rung at the prescribed pace and keep recovery easy.',demanding:true,fraction:.42},
 pyramid:{name:'Distance pyramid',purpose:'Practise repeating the same controlled pace as distance changes.',focus:'Keep the shorter repetitions controlled on both sides of the pyramid.',demanding:true,fraction:.42},
 mixed:{name:'Mixed-distance intervals',purpose:'Practise finding target rhythm over several distances.',focus:'Keep the shorter efforts controlled and use the easy recovery each time.',demanding:true,fraction:.44},
 tempo:{name:'Timed tempo intervals',purpose:'Develop sustained aerobic speed using a consistent pace.',focus:'Settle into the target early and maintain the same rhythm throughout.',demanding:true,reps:2,fraction:.42},
 ultra:{name:'Ultra endurance rehearsal',purpose:'Practise sustainable endurance and fueling.',focus:'Use easy effort and practise fueling; walk steep climbs if needed.'},
 taper:{name:'Taper easy run',purpose:'Maintain running rhythm while reducing fatigue.',focus:'Keep it easy; resist adding distance or intensity.'},
 return:{name:'Return-to-running easy session',purpose:'Reintroduce running gradually without demanding intensity.',focus:'Keep effort comfortable, take walk breaks as needed and stop for concerning symptoms.'}
};
// Variants retain the parent effort target and purpose; variation changes repetition structure, not intensity.
const variantFamilies={cruise:[2,3,4,5,6,7,8],threshold:[1,2,3,4],vo2:[3,4,5,6,7,8,10],fartlek:[2,3,4,5,6,7,8,10],race5:[3,4,5,6,7,8,10],race10:[2,3,4,5,6],half:[1,2,3,4,5],marathon:[1,2,3,4,5],hills:[3,4,5,6]};
const usableThreshold=a=>validPace(a.thresholdPace)&&(!validPace(a.easyPace)||a.thresholdPace<a.easyPace)?a.thresholdPace:null;
const estimatePace=a=>Math.max(validPace(a.easyPace)?a.easyPace+35:540,(usableThreshold(a)??0)+60);
function workoutVariant(kind,week,meters){
 const parent=templates[kind],choices=variantFamilies[kind];
 if(!choices)return parent;
 const eligible=choices.filter(n=>meters*parent.fraction/n>=400&&(n===1||meters*.12/(n-1)>=100));
 const reps=eligible.length?eligible[week%eligible.length]:parent.reps;
 return {...parent,reps,name:parent.name+(reps>1?' · '+reps+' reps':'')};
}
function assessFeasibility(goal,base,days,a,targetSeconds){
 const distance=raceKm[goal],reasons=[];
 if(goal==='return')return {status:'review-required',reasons:['Review the walk–run schedule against the duration you already tolerate.']};
 if(!distance)return {status:'review-required',reasons:['Event distance or objective requires individual review.']};
 if(base.km<distance*.5)reasons.push('Recent weekly volume is low relative to event distance.');
 if(distance>=21&&(!positive(a.longestKm)||a.longestKm<distance*.35))reasons.push('Recent long-run evidence is limited relative to event distance.');
 const minimumDays=7*(distance>=42?12:distance>=21?8:4);
 if(days<minimumDays)reasons.push('The preparation window is '+days+' days; the planning guide calls for at least '+minimumDays+' days for this distance.');
 if(positive(targetSeconds)&&a.fiveKSeconds>=750&&a.fiveKSeconds<=6000&&targetSeconds/distance<a.fiveKSeconds/5){
  reasons.push('The goal requires a faster average pace than your recorded 5K benchmark. Review the target time against recent race results.');
 }
 if(base.source!=='four completed weeks')reasons.push('Training history is incomplete.');
 if(reasons.length)reasons.push('Consider a later event, a shorter distance, or a completion goal based on a recent comparable race.');
 return {status:reasons.length?'caution':'review-required',reasons};
}
function baseline(a){
 const h=Array.isArray(a.weeklyKm)?a.weeklyKm.slice(0,4):[];
 const known=h.filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0);
 const manual=typeof a.currentKm==='number'&&Number.isFinite(a.currentKm)&&a.currentKm>=0?a.currentKm:null;
 if(!known.length)return {km:manual,source:manual===null?'missing':'athlete-confirmed',interrupted:a.interrupted===true};
 const sorted=known.slice().sort((x,y)=>x-y),median=sorted[Math.floor((sorted.length-1)/2)];
 let sum=0,w=0;h.forEach((v,i)=>{if(typeof v==='number'&&Number.isFinite(v)&&v>=0){sum+=Math.min(v,median*1.5+2)*weights[i];w+=weights[i]}});
 const interrupted=(h[0]===0||a.interrupted===true);
 let km=sum/w;if(positive(h[0]))km=Math.min(km,h[0]*1.05);if(interrupted)km=Math.min(km,positive(h[0])?h[0]*.7:0);
 if(manual!==null)km=Math.min(km,manual);
 return {km,source:known.length===4?'four completed weeks':'partial completed weeks',interrupted};
}
function chooseDays(avail,n,long,hard){
 const result=avail.includes(long)?[long]:[];
 while(result.length<n){let candidates=avail.filter(d=>!result.includes(d));
 candidates.sort((a,b)=>score(b)-score(a)||a-b);
 function score(d){return (result.length?Math.min(...result.map(x=>diff(d,x))):3)*3-(hard.includes(d)?5:0)-(hard.some(x=>diff(d,x)===1)?1:0)}
 result.push(candidates[0]);}
 return result.sort((a,b)=>a-b);
}
const bpm=x=>Number.isInteger(x)&&x>=30&&x<=250;
function heartRateRange(zone,athlete){
 const low=zone?.lowBpm,high=zone?.highBpm;
 if(!bpm(low)||!bpm(high)||low>=high||(bpm(athlete.maxHR)&&high>athlete.maxHR)||(bpm(athlete.lthr)&&high>=athlete.lthr))return null;
 return {kind:'heart_rate',lowBpm:low,highBpm:high,...(/^Z[1-5]$/.test(zone.zone)?{zone:zone.zone}:{})};
}
const continuous=new Set(['easy','recovery','long','steady','ultra','taper']);
const intervalPatterns={
 ladder:[[200,300,400,600],[200,400,600,800],[300,600,800,1000]],
 pyramid:[[200,400,600,400,200],[300,600,800,600,300]],
 mixed:[[300,600,400,800],[400,800,600,1000],[200,800,300,600]],
};
function intervalWork(kind,template,meters,week,slow){
 const budget=round(meters*template.fraction);
 if(intervalPatterns[kind]){
  const options=intervalPatterns[kind].filter(pattern=>pattern.reduce((sum,value)=>sum+value,0)<=budget);
  return options.length?options[week%options.length].map(meters=>({kind:'distance',meters})):[];
 }
 if(kind==='hills'||kind==='fartlek'||kind==='tempo'){
  const options=kind==='hills'?[40,50,60]:kind==='fartlek'?[45,60,75]:[180,240,300];
  const seconds=Math.min(options[week%options.length],Math.floor(budget*slow/1000/template.reps));
  return seconds>=30?Array.from({length:template.reps},()=>({kind:'time',seconds})):[];
 }
 const metersPerRep=round(budget/template.reps);
 return metersPerRep>=200?Array.from({length:template.reps},()=>({kind:'distance',meters:metersPerRep})):[];
}
function makeSession(kind,m,a,phase,week=0,recoveryMode='distance'){
 const t=workoutVariant(kind,week,m),easy=validPace(a.easyPace)?a.easyPace:null,threshold=usableThreshold(a);
 const slow=estimatePace(a);
 const easyTarget=heartRateRange(a.easyZone,a);
 const confirmedRecovery=heartRateRange(a.recoveryZone,a);
 const recoveryTarget=confirmedRecovery&&(!easyTarget||confirmedRecovery.highBpm<=easyTarget.highBpm)?confirmedRecovery:null;
 const steadyTarget=heartRateRange(a.steadyZone,a);
 const open={kind:'open'};
 const aerobic=easyTarget||open, recovery=recoveryTarget||aerobic;
 const distance=meters=>({kind:'distance',meters}), time=seconds=>({kind:'time',seconds});
 const step=(intensity,description,duration,target)=>({kind:'step',intensity,description,duration,target});
 const timeBudget=meters=>Math.floor(meters*slow/1000);
 const recoveryStep=(work,allowTrigger=true)=>{
  const workSeconds=work.seconds??timeBudget(work.meters);
  const steadyQuality=['cruise','threshold','tempo','half','marathon'].includes(kind);
  const seconds=kind==='strides'?60:steadyQuality?Math.max(60,Math.min(90,Math.ceil(workSeconds/3/15)*15)):
   Math.max(60,Math.min(120,Math.ceil(workSeconds*.5/15)*15));
  if(recoveryMode==='distance'){
   const meters=Math.min(300,Math.max(100,Math.floor(seconds/slow*1000/50)*50));
   return step('recovery','Easy jog between repetitions',distance(meters),recovery);
  }
  const trigger=recoveryTarget?.highBpm??easyTarget?.lowBpm;
  const suitable=allowTrigger&&a.recovery==='normal'&&t.demanding&&bpm(trigger)&&
   (!bpm(a.restingHR)||trigger>=a.restingHR+15)&&(!easyTarget||trigger<=easyTarget.highBpm);
  const duration=recoveryMode==='heart_rate'&&suitable?{kind:'heart_rate',direction:'below',bpm:trigger,fallbackSeconds:seconds}:time(seconds);
  return step('recovery','Walk or jog easily',duration,recovery);
 };
 const distanceBudget=d=>d.meters??Math.ceil((d.seconds??d.fallbackSeconds)*1000/slow);
 const steps=[];
 if(continuous.has(kind)){
  const target=kind==='recovery'?recovery:kind==='steady'?steadyTarget||aerobic:aerobic;
  const duration=m>=1000?distance(m):time(timeBudget(m));
  steps.push(step('active',t.focus,duration,target));
 }else if(m>=4000){
  const work=kind==='strides'?Array.from({length:4},()=>distance(100)):intervalWork(kind,t,m,week,slow);
  const timedWarmup=['hills','fartlek','tempo'].includes(kind);
  // Set the preparation and easy finish independently of the weekly mileage.
  // Cap both by time even when they are expressed in metres.
  const warmLimit=Math.min(2400,round(15*60/slow*1000));
  const coolLimit=Math.min(1400,round(9*60/slow*1000));
  const required=work.map((duration,i)=>({
   duration,rest:i<work.length-1?recoveryStep(duration,kind!=='strides'):null,
  }));
  let workAndRecovery=required.reduce((sum,rep)=>sum+distanceBudget(rep.duration)+(rep.rest?distanceBudget(rep.rest.duration):0),0);
  while(!intervalPatterns[kind]&&kind!=='strides'&&required.length>2&&m-workAndRecovery<1500){
   const last=required.pop();
   workAndRecovery-=distanceBudget(last.duration);
   const prior=required.at(-1);
   workAndRecovery-=distanceBudget(prior.rest.duration);
   prior.rest=null;
  }
  const room=m-workAndRecovery;
  if(required.length&&room>=1500){
   const five=positive(a.fiveKSeconds)&&a.fiveKSeconds>=750&&a.fiveKSeconds<=6000?a.fiveKSeconds/5:null;
   const offsets={cruise:[0,15],threshold:[0,15],tempo:[5,20],race10:[-5,10],half:[10,30],marathon:[25,50],fartlek:[-5,15],ladder:[-5,10],pyramid:[-5,10],mixed:[-5,10],vo2:[-18,-4],race5:[-18,-4]};
   const benchmarkOffsets={cruise:[15,30],threshold:[15,30],tempo:[20,35],race10:[8,23],half:[25,45],marathon:[45,70],fartlek:[8,25],ladder:[5,20],pyramid:[5,20],mixed:[5,20],vo2:[0,15],race5:[0,10]};
   const paceRange=(base,range)=>({kind:'pace',fastSecondsPerKm:Math.max(150,Math.round(base+range[0])),slowSecondsPerKm:Math.min(1800,Math.round(base+range[1]))});
   let quality=kind==='progressive'?steadyTarget||aerobic:kind==='hills'?aerobic:open;
   if(five!==null&&['vo2','race5'].includes(kind))quality=paceRange(five,benchmarkOffsets[kind]);
   else if(threshold!==null&&offsets[kind])quality=paceRange(threshold,offsets[kind]);
   else if(five!==null&&benchmarkOffsets[kind])quality=paceRange(five,benchmarkOffsets[kind]);
   const warm=Math.min(warmLimit,round(room*.64));
   const cool=Math.min(coolLimit,round(room-warm));
   steps.push(step('warmup','Easy running',timedWarmup?time(timeBudget(warm)):distance(warm),aerobic));
   if(kind==='progressive'&&room-warm-cool>0){
    steps.push(step('active','Aerobic endurance before the steady finish',distance(room-warm-cool),aerobic));
   }
   for(const {duration,rest} of required){
    steps.push(step('interval',kind==='strides'?'Relaxed stride':t.name,duration,quality));
    if(rest)steps.push(rest);
   }
   steps.push(step('cooldown','Easy running',timedWarmup&&kind!=='fartlek'?time(timeBudget(cool)):distance(cool),recovery));
  }
 }
 if(!steps.length)return null;
 const fixedMeters=steps.reduce((sum,item)=>sum+(item.duration.meters??0),0);
 const fixedSeconds=steps.reduce((sum,item)=>sum+(item.duration.seconds??0),0);
 const fallbackSeconds=steps.reduce((sum,item)=>sum+(item.duration.fallbackSeconds??0),0);
 const seconds=Math.ceil(fixedMeters*slow/1000+fixedSeconds+fallbackSeconds);
 const timed=steps.some(item=>item.duration.kind!=='distance');
 const meters=timed?Math.min(m,fixedMeters+Math.ceil((fixedSeconds+fallbackSeconds)*1000/slow)):fixedMeters;
 return {name:t.name,kind,phase,meters,km:meters/1000,...(timed?{fixedMeters}:{}),plannedMinutes:Math.ceil(seconds/60),estimatedSeconds:seconds,
  estimatedPaceSeconds:slow,paceEstimateOnly:easy===null,demanding:!!t.demanding,purpose:t.purpose,focus:t.focus,structuredSteps:steps};
}
function buildReturnPlan(input,base,start,available,hard,dayMinutes){
 const {athlete:a,schedule:s,weeks}=input;
 const tooClose=(day,days)=>days.some(other=>diff(day,other)<=1);
 const chosen=[];
 for(const day of available){
  if(chosen.length===s.runs)break;
  if(!tooClose(day,hard)&&!tooClose(day,chosen)&&((dayMinutes[day]??s.weekdayMinutes)>=6))chosen.push(day);
 }
 if(!chosen.length)return {ok:false,errors:['Choose a day with at least six minutes available, away from demanding sport.'],warnings:[],baseline:base,weeks:[]};

 const t=templates.return,offset=(new Date(start).getUTCDay()+6)%7;
 const warnings=['The same easy walk–run prescription repeats across the programme. Review tolerance before adding time or intensity.'];
 if(chosen.length<s.runs)warnings.push('Recovery spacing and duration limits reduced the number of sessions.');
 const step=(intensity,description,seconds)=>({kind:'step',intensity,description,duration:{kind:'time',seconds},
  target:(intensity==='active'?heartRateRange(a.easyZone,a):heartRateRange(a.recoveryZone,a))||{kind:'open'}});
 const plan=Array.from({length:weeks},(_,i)=>{
  const sessions=chosen.map(day=>{
   const durationLimitMinutes=dayMinutes[day]??s.weekdayMinutes;
   const minutes=Math.min(durationLimitMinutes,a.returnMinutes);
   const repeats=Math.floor((minutes-4)/2);
   const structuredSteps=[step('warmup','Warm-up walk',120)];
   for(let rep=0;rep<repeats;rep++){
    structuredSteps.push(step('active','Easy jog',30),step('recovery','Walk recovery',90));
   }
   structuredSteps.push(step('cooldown','Cool-down walk',120));
   const plannedMinutes=structuredSteps.reduce((total,item)=>total+item.duration.seconds,0)/60;
   const date=new Date(start+(i*7+(day-offset+7)%7)*86400000).toISOString().slice(0,10);
   return {name:'Easy walk–run',kind:'return',phase:'Return',meters:null,km:null,
    plannedMinutes,estimatedSeconds:plannedMinutes*60,demanding:false,purpose:t.purpose,focus:t.focus,
    day,date,planWeek:i+1,durationLimitMinutes,structuredSteps};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  return {week:i+1,phase:'Return',meters:null,km:null,plannedMinutes:sessions.reduce((total,item)=>total+item.plannedMinutes,0),sessions};
 });
 return {ok:true,errors:[],warnings,baseline:base,weeks:plan,goal:'return',chosenDays:chosen,
  feasibility:'review-required',feasibilityDetail:assessFeasibility('return',base,0,a),settings:{...input.adaptation},version:1};
}
function generate(input={}){
 const a=input.athlete||{},s=input.schedule||{},goal=input.goal||'fitness',weeks=input.weeks,base=baseline(a),warnings=[];
 const errors=[];
 if(!goals.includes(goal))errors.push('Unknown goal');
 if(!Number.isInteger(weeks)||weeks<1||weeks>52)errors.push('Choose 1–52 weeks');
 const available=dayList(s.available),hard=dayList(s.demandingDays),n=s.runs;
 if(!Number.isInteger(n)||n<1||n>available.length)errors.push('Runs must fit available days');
 if(!positive(s.weekdayMinutes)||(goal!=='return'&&!positive(s.longMinutes)))errors.push('Enter session duration limits');
 const dayMinutes=s.dayMinutes??{};
 if(typeof dayMinutes!=='object'||Array.isArray(dayMinutes)||Object.entries(dayMinutes).some(([day,minutes])=>!/^[0-6]$/.test(day)||!Number.isInteger(minutes)||minutes<1))errors.push('Enter day-specific limits in whole minutes');
 if(goal==='return'){
  if(weeks>4||n>3||input.raceDate||input.targetSeconds)errors.push('Choose up to four weeks and three sessions per week, without a race date or target.');
  if(!Number.isInteger(a.returnMinutes)||a.returnMinutes<6||a.returnMinutes>20)errors.push('Confirm a recent comfortable walk–run duration of 6–20 minutes.');
 }else{
  if(base.km===null||base.km<=0)errors.push('Confirm a positive sustainable starting volume or choose Return to running.');
  if(base.interrupted)errors.push('Choose Return to running after a recent interruption.');
 }
 if(!Object.hasOwn(caps,a.level))errors.push('Choose experience level');
 if(base.km>250)errors.push('High-volume programme requires individual coaching review');
 if(a.injury===true)errors.push('Training progression paused: seek appropriate review before generating');
 if(errors.length)return {ok:false,errors,warnings,baseline:base,weeks:[]};
 const start=input.start,parseDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x?Date.parse(x):null;
 const st=parseDate(start),race=parseDate(input.raceDate);
 if(st===null||(input.raceDate&&(race===null||race<st)))return {ok:false,errors:['Invalid start or race date'],warnings,baseline:base,weeks:[]};
 if(goal==='return')return buildReturnPlan(input,base,st,available,hard,dayMinutes);
 const long=available.includes(s.longDay)?s.longDay:available.find(d=>!hard.includes(d))??available[0];
 if(long!==s.longDay)warnings.push('Preferred long day unavailable; alternative used.');
 const chosen=chooseDays(available,n,long,hard);
 if(hard.length)warnings.push('Demanding concurrent sport days suppress adjacent running quality; review total load.');
 if(!validPace(a.easyPace)){
  const estimate=estimatePace(a);
  const pace=Math.floor(estimate/60)+':'+String(estimate%60).padStart(2,'0');
  warnings.push('Duration estimates use '+pace+'/km as a planning assumption. Easy runs use your confirmed HR range when available.');
 }
 if(validPace(a.thresholdPace)&&usableThreshold(a)===null)warnings.push('Threshold pace is equal to or slower than easy pace. Quality sessions use effort unless a separate reliable benchmark is available.');
 if(!heartRateRange(a.easyZone,a))warnings.push('Add a confirmed easy heart-rate range for bpm guidance on aerobic runs. Until then, keep easy runs conversational.');
 if(input.adaptation?.intervalRecovery==='heart_rate')warnings.push('Heart-rate recovery uses a timed alternative when an eligible bpm threshold is missing or the device cannot use live HR.');
 if(!positive(a.longestKm))warnings.push('No confirmed recent long run; long-session allocation is conservative.');
 if(base.source!=='four completed weeks')warnings.push('Starting volume uses limited or athlete-confirmed history; progression is restricted.');
 if(input.targetSeconds)warnings.push('Target time is not a validated race prediction; no aspirational pace is prescribed.');
 if(goal==='ultra')warnings.push('Ultra distance, terrain and fueling require individual review.');
 if(['first-race','personal-best'].includes(goal))warnings.push('Race distance is not specified; generic endurance programme only.');
 const goalDist=raceKm[goal];
 if(goalDist&&base.km<goalDist*.5)warnings.push('Current volume is low relative to event distance; goal feasibility needs review.');
 const offset=(new Date(st).getUTCDay()+6)%7;
 const ordered=chosen.map(d=>({day:d,offset:(d-offset+7)%7})).sort((a,b)=>a.offset-b.offset);
 const slow=estimatePace(a);
 const plan=[];let buildQualityIndex=0,previous=round(base.km*1000),preRecovery=previous,previousPhase=null,previousLong=positive(a.longestKm)?round(a.longestKm*1000):round(previous*.25);
 const raceWeek=race===null?null:Math.floor((race-st)/604800000);
 const taperAnchor=raceWeek!==null&&raceWeek<weeks?raceWeek:null;
 if(raceWeek!==null&&raceWeek>=weeks)warnings.push('Race is outside programme dates; no race taper scheduled.');
 let ceiling=base.source==='four completed weeks'&&!base.interrupted?caps[a.level]:0;
 const primary=input.adaptation?.priority==null||input.adaptation.priority==='Running';
 if(!primary)warnings.push('Running is secondary; planned mileage is reduced and demanding running sessions are suppressed.');
 if(!primary||hard.length||a.recovery!=='normal'||goal==='return')ceiling=0;
 for(let i=0;i<weeks;i++){
  const untilRace=taperAnchor===null?Infinity:taperAnchor-i;
  if(untilRace<0)break;
  const taper=untilRace<= (['marathon','ultra'].includes(goal)?2:1);
  const phase=taper?'Taper':i%4===3?'Recovery':i<2?'Base':i<Math.ceil(weeks*.65)?'Build':'Specific';
  let target=round(previous*(i===0?(a.recovery==='poor'||!primary?.8:1):taper?(untilRace===0?.6:.8):phase==='Recovery'?.8:1+ceiling));
  // A planned deload is not loss of fitness. Restore at most the last achieved planning ceiling, never add a new peak immediately after recovery.
  if(previousPhase==='Recovery'&&!taper&&phase!=='Recovery'&&a.recovery!=='poor')target=Math.max(target,preRecovery);
  if(i===0&&taper)target=round(target*.7);
  const slots=ordered.filter(o=>race===null||st+(i*7+o.offset)*86400000<race);
  if(!slots.length)break;
  const longSlot=slots.find(o=>o.day===long&&!hard.includes(o.day))||null;
  const qualityAllowed=primary&&base.source==='four completed weeks'&&a.level!=='beginner'&&goal!=='return'&&a.recovery==='normal'&&base.km>=20&&n>=3&&!taper&&phase!=='Recovery'&&phase!=='Base';
  const progressive=qualityAllowed&&phase==='Specific'&&i%3===2&&positive(a.longestKm)&&a.longestKm>=12&&base.km>=35&&longSlot&&!hard.some(d=>diff(d,longSlot.day)<=1);
  const q=qualityAllowed&&!progressive?slots.find(o=>o!==longSlot&&!hard.some(d=>diff(o.day,d)<=1)&&(!longSlot||diff(o.day,longSlot.day)>=2)):null;
  const durationLimits=slots.map(o=>dayMinutes[o.day]??(o===longSlot?s.longMinutes:s.weekdayMinutes));
  const capacity=slots.map((o,j)=>{let max=round(durationLimits[j]*60/slow*1000);
   if(o===longSlot)max=Math.min(max,round(previousLong*(i===0?1:1+Math.min(ceiling,.05))),round(target*(n===1?1:n===2?.55:.40)));
   if(hard.includes(o.day))max=Math.min(max,round(target*.12));
   return Math.max(0,max)});
  const buildCycle=['fartlek','cruise','threshold','hills','strides','ladder','pyramid','mixed','tempo'];
  const buildKind=q&&phase==='Build'?buildCycle[buildQualityIndex++%buildCycle.length]:null;
  const kinds=slots.map(o=>{
   if(taper)return 'taper';
   if(hard.includes(o.day)||a.recovery==='poor')return 'recovery';
   if(o===longSlot)return progressive?'progressive':goal==='ultra'?'ultra':'long';
   if(o!==q)return 'easy';
   if(phase==='Specific')return ({'5k':'race5','10k':'race10','half-marathon':'half',marathon:'marathon',ultra:'steady'})[goal]||'cruise';
   return buildKind;
  });
  const allocations=slots.map(()=>0);
  let remaining=target;
  const priority=slots.map((o,j)=>{
   let kind=kinds[j];
   const pattern=intervalPatterns[kind];
   const patternMin=pattern?Math.ceil(Math.min(...pattern.map(work=>work.reduce((sum,meters)=>sum+meters,0)))/
    templates[kind].fraction/unit)*unit:0;
   const minimum=kind==='progressive'?10000:Math.max(4000,patternMin);
   if(!continuous.has(kind)&&(capacity[j]<minimum||!makeSession(kind,minimum,a,phase,i,input.adaptation?.intervalRecovery))){
    kind=o===longSlot?'long':'easy';
   }
   const continuousRun=continuous.has(kind),increment=continuousRun&&capacity[j]>=1000&&target>=1000?1000:unit;
   const initial=continuousRun?(increment===unit?500:1000):minimum;
   return {j,kind,increment,initial,weight:o===longSlot?2.1:o===q?1.15:hard.includes(o.day)?.5:1};
  });
  // Seed the available days, then allocate attainable increments within the weekly cap.
  // If quality cannot fit, offer that day an easy run using the same conservative limits.
  for(const slot of priority){
   const {j}=slot;
   const reserved=priority.slice(j+1).reduce((sum,next)=>sum+(capacity[next.j]>=Math.min(next.initial,1000)?Math.min(next.initial,1000):0),0);
   if(!continuous.has(slot.kind)&&remaining-reserved<slot.initial){
    slot.kind=slots[j]===longSlot?'long':'easy';slot.increment=1000;slot.initial=1000;
   }
   if(remaining>=slot.initial&&capacity[j]>=slot.initial){allocations[j]=slot.initial;remaining-=slot.initial}
  }
  while(remaining>=unit){
   const candidates=priority.filter(({j,increment})=>allocations[j]>0&&remaining>=increment&&allocations[j]+increment<=capacity[j])
    .sort((x,y)=>allocations[x.j]/x.weight-allocations[y.j]/y.weight||x.j-y.j);
   if(!candidates.length)break;
   const {j,increment}=candidates[0];allocations[j]+=increment;remaining-=increment;
  }
  const daily=slots.map((_,j)=>allocations[j]?makeSession(priority[j].kind,allocations[j],a,phase,i,input.adaptation?.intervalRecovery):null);
  let availableMeters=target-daily.reduce((sum,session)=>sum+(session?.meters??0),0);
  const aerobicSlots=priority.filter(slot=>daily[slot.j]&&continuous.has(slot.kind)&&slot.increment===1000);
  while(availableMeters>=1000){
   const slot=aerobicSlots.filter(({j})=>allocations[j]+1000<=capacity[j])
    .sort((x,y)=>allocations[x.j]/x.weight-allocations[y.j]/y.weight||x.j-y.j)[0];
   if(!slot)break;
   allocations[slot.j]+=1000;
   availableMeters-=1000;
  }
  const sessions=slots.flatMap((o,j)=>{
   const original=daily[j];
   if(!original)return [];
   const session=continuous.has(original.kind)&&allocations[j]!==original.meters&&allocations[j]>=1000?
    makeSession(original.kind,allocations[j],a,phase,i,input.adaptation?.intervalRecovery):original;
   const date=new Date(st+(i*7+o.offset)*86400000).toISOString().slice(0,10);
   return [{...session,date,day:o.day,planWeek:i+1,durationLimitMinutes:durationLimits[j]}];
  });
  const meters=sessions.reduce((x,y)=>x+y.meters,0);
  if(sessions.length<slots.length&&!warnings.includes('Some selected days could not fit within the duration and weekly limits.'))warnings.push('Some selected days could not fit within the duration and weekly limits.');
  if(meters<target&&!warnings.includes('Whole-kilometre steps, workout structure or session limits reduced planned mileage.'))warnings.push('Whole-kilometre steps, workout structure or session limits reduced planned mileage.');
  if(!meters)break;
  plan.push({week:i+1,phase,meters,km:meters/1000,plannedMinutes:sessions.reduce((x,y)=>x+y.plannedMinutes,0),sessions});
  if(phase!=='Recovery')preRecovery=meters;previousPhase=phase;
  previous=meters;const ls=sessions.find(x=>x.day===long&&longSlot);if(ls&&phase!=='Recovery')previousLong=ls.meters;
 }
 if(!plan.length)return {ok:false,errors:['No safe sessions fit these constraints'],warnings,baseline:base,weeks:[]};
 return {ok:true,errors:[],warnings,baseline:base,weeks:plan,goal,chosenDays:chosen,feasibility:'review-required',feasibilityDetail:assessFeasibility(goal,base,race===null?weeks*7:Math.min(weeks*7,(race-st)/86400000),a,input.targetSeconds),settings:{...input.adaptation},version:1};
}
const api={generate,baseline,templates,workoutVariant,assessFeasibility};root.mileRunningPlan=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
