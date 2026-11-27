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
 steady:{name:'Controlled steady run',purpose:'Build sustained aerobic endurance above easy effort.',focus:'Stay controlled, never force the pace.',reps:1,fraction:.55},
 cruise:{name:'Threshold cruise intervals',purpose:'Improve sustainable running speed and threshold endurance.',focus:'Keep each repetition controlled and consistent; do not chase a faster final repetition.',demanding:true,reps:4,fraction:.48},
 threshold:{name:'Continuous threshold run',purpose:'Develop sustained threshold endurance.',focus:'Finish with control; avoid racing the final segment.',demanding:true,reps:1,fraction:.40},
 vo2:{name:'Controlled fast intervals',purpose:'Develop aerobic power and running economy.',focus:'Maintain smooth mechanics and repeatable effort, not an all-out sprint.',demanding:true,reps:5,fraction:.30},
 fartlek:{name:'Controlled fartlek',purpose:'Practise changing speed while maintaining aerobic control.',focus:'Relax during recoveries and keep faster efforts repeatable.',demanding:true,reps:5,fraction:.30},
 race5:{name:'5K-specific intervals',purpose:'Practise controlled 5K rhythm.',focus:'Use current demonstrated ability, not an aspirational race pace.',demanding:true,reps:5,fraction:.36},
 race10:{name:'10K-specific intervals',purpose:'Develop sustained 10K effort.',focus:'Keep repetitions even and avoid exceeding current fitness.',demanding:true,reps:3,fraction:.45},
 half:{name:'Half marathon rhythm',purpose:'Practise sustained half marathon effort.',focus:'Maintain steady breathing and even rhythm.',demanding:true,reps:2,fraction:.55},
 marathon:{name:'Marathon rhythm',purpose:'Practise controlled marathon effort and pacing.',focus:'Keep effort sustainable; practise fueling when appropriate.',reps:2,fraction:.55},
 ultra:{name:'Ultra endurance rehearsal',purpose:'Practise sustainable endurance and fueling.',focus:'Use easy effort and practise fueling; walk steep climbs if needed.'},
 taper:{name:'Taper easy run',purpose:'Maintain running rhythm while reducing fatigue.',focus:'Keep it easy; resist adding distance or intensity.'},
 return:{name:'Return-to-running easy session',purpose:'Reintroduce running gradually without demanding intensity.',focus:'Keep effort comfortable, take walk breaks as needed and stop for concerning symptoms.'}
};
// Variants retain the parent effort target and purpose; variation changes repetition structure, not intensity.
const variantFamilies={cruise:[2,3,4,5,6,7,8],threshold:[1,2,3,4],vo2:[3,4,5,6,7,8,10],fartlek:[2,3,4,5,6,7,8,10],race5:[3,4,5,6,7,8,10],race10:[2,3,4,5,6],half:[1,2,3,4,5],marathon:[1,2,3,4,5],steady:[1,2,3,4],hills:[3,4,5,6]};
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
 return {kind:'heart_rate',lowBpm:low,highBpm:high};
}
function makeSession(kind,m,a,phase,week=0,recoveryMode='distance'){
 const t=workoutVariant(kind,week,m),easy=validPace(a.easyPace)?a.easyPace:null,threshold=usableThreshold(a);
 const slow=estimatePace(a);
 const easyTarget=heartRateRange(a.easyZone,a);
 const confirmedRecovery=heartRateRange(a.recoveryZone,a);
 const recoveryTarget=confirmedRecovery&&(!easyTarget||confirmedRecovery.highBpm<=easyTarget.highBpm)?confirmedRecovery:null;
 const open={kind:'open'};
 const aerobic=(kind==='recovery'?recoveryTarget:null)||easyTarget||open;
 const recovery=recoveryTarget||easyTarget||open;
 const five=positive(a.fiveKSeconds)&&a.fiveKSeconds>=750&&a.fiveKSeconds<=6000?a.fiveKSeconds/5:null;
 const offsets={cruise:[0,15],threshold:[0,15],race10:[-5,10],half:[10,30],marathon:[25,50],fartlek:[-5,15]};
 const benchmarkOffsets={cruise:[15,30],threshold:[15,30],race10:[8,23],half:[25,45],marathon:[45,70],fartlek:[8,25],vo2:[0,15],race5:[0,10]};
 const paceRange=(base,range)=>({kind:'pace',fastSecondsPerKm:Math.max(150,Math.round(base+range[0])),slowSecondsPerKm:Math.min(1800,Math.round(base+range[1]))});
 let quality=kind==='steady'||kind==='progressive'||kind==='hills'?aerobic:open;
 if(threshold!==null&&offsets[kind])quality=paceRange(threshold,offsets[kind]);
 else if(five!==null&&benchmarkOffsets[kind])quality=paceRange(five,benchmarkOffsets[kind]);
 else if(threshold!==null&&['vo2','race5'].includes(kind))quality=paceRange(threshold,[-18,-4]);
 const step=(intensity,description,meters,target)=>({kind:'step',intensity,description,duration:{kind:'distance',meters},target});
 const recover=meters=>{
  const limit=Math.min(120,Math.floor(meters*slow/1000));
  const duration=()=>({kind:'time',seconds:limit});
  if(!['time','heart_rate'].includes(recoveryMode)||limit<30)return step('recovery','Easy jog between repetitions',meters,recovery);
  const trigger=recoveryTarget?.highBpm??easyTarget?.lowBpm;
  const suitable=a.recovery==='normal'&&t.demanding&&bpm(trigger)&&limit>=60&&
   (!bpm(a.restingHR)||trigger>=a.restingHR+15)&&(!easyTarget||trigger<=easyTarget.highBpm);
  return {kind:'step',intensity:'recovery',description:'Walk or jog easily',target:recovery,
   duration:recoveryMode==='heart_rate'&&suitable?{kind:'heart_rate',direction:'below',bpm:trigger,fallbackSeconds:limit}:duration()};
 };
 let steps=[];
 if(kind==='strides'&&m>=4000){
  steps.push(step('warmup','Easy running before strides',m-1400,aerobic));
  for(let i=0;i<4;i++){
   steps.push(step('interval','Relaxed stride '+(i+1)+' of 4',100,{kind:'open'}));
   if(i<3)steps.push(step('recovery','Easy jog or walk between strides',200,recovery));
  }
  steps.push(step('cooldown','Easy running',400,aerobic));
 }else if(t.reps&&m>=4000){
  let reps=t.reps,work=round(m*t.fraction/reps),rest=reps>1?Math.min(300,round(m*.12/(reps-1))):0;
  if(work>=200&&(reps===1||rest>=100)){
   let remainder=m-work*reps-rest*(reps-1),warm=round(remainder*(kind==='progressive'?.88:.55));
   steps.push(step('warmup','Easy running',warm,aerobic));
   for(let i=0;i<reps;i++){steps.push(step('interval',t.name+' · repetition '+(i+1)+' of '+reps,work,quality));if(i<reps-1)steps.push(recover(rest));}
   steps.push(step('cooldown','Easy running',remainder-warm,aerobic));
  }
 }
 if(!steps.length){if(t.reps)return makeSession('easy',m,a,phase);
 const warm=Math.max(100,round(m*.15)),cool=Math.max(100,round(m*.1));
 steps.push(step('warmup','Ease into the run',warm,aerobic));
 steps.push(step('active',t.focus,m-warm-cool,aerobic));
 steps.push(step('cooldown','Relaxed running',cool,aerobic));}
 const fixedMeters=steps.reduce((sum,item)=>sum+(item.duration.meters??0),0);
 const seconds=Math.ceil(fixedMeters*slow/1000+steps.reduce((sum,item)=>sum+(item.duration.seconds??item.duration.fallbackSeconds??0),0));
 return {name:t.name,kind,phase,meters:m,km:m/1000,...(fixedMeters!==m?{fixedMeters}:{}),plannedMinutes:Math.ceil(seconds/60),estimatedSeconds:seconds,
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
 const plan=[];let previous=round(base.km*1000),preRecovery=previous,previousPhase=null,previousLong=positive(a.longestKm)?round(a.longestKm*1000):round(previous*.25);
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
  const allocations=slots.map(()=>0);
  // First allocate an achievable minimum, then apportion remainder by weighted deficit.
  let remaining=Math.min(target,capacity.reduce((x,y)=>x+y,0));
  const priority=slots.map((o,j)=>({j,weight:o===longSlot?2.1:o===q?1.15:hard.includes(o.day)?.5:1}));
  for(const {j} of priority){if(remaining>=500&&capacity[j]>=500){allocations[j]=500;remaining-=500}}
  while(remaining>=unit){
   const candidates=priority.filter(({j})=>allocations[j]>=500&&allocations[j]+unit<=capacity[j]).sort((x,y)=>allocations[x.j]/x.weight-allocations[y.j]/y.weight||x.j-y.j);
   if(!candidates.length)break;allocations[candidates[0].j]+=unit;remaining-=unit;
  }
  const sessions=slots.flatMap((o,j)=>{
   const m=allocations[j];if(!m)return [];
   let kind=taper?'taper':goal==='return'?'return':hard.includes(o.day)||a.recovery==='poor'?'recovery':o===longSlot?(goal==='ultra'?'ultra':'long'):'easy';
   if(o===longSlot&&progressive&&m>=10000)kind='progressive';
   if(o===q){kind=phase==='Specific'?({'5k':'race5','10k':'race10','half-marathon':'half',marathon:'marathon',ultra:'steady'}[goal]||'cruise'):['fartlek','cruise','threshold','hills','strides'][i%5];}
   const date=new Date(st+(i*7+o.offset)*86400000).toISOString().slice(0,10);
   return [{...makeSession(kind,m,a,phase,i,input.adaptation?.intervalRecovery),date,day:o.day,planWeek:i+1,durationLimitMinutes:durationLimits[j]}];
  });
  const meters=sessions.reduce((x,y)=>x+y.meters,0);
  if(sessions.length<slots.length&&!warnings.includes('Some selected days could not fit a minimum 500 m session.'))warnings.push('Some selected days could not fit a minimum 500 m session.');
  if(meters<target&&!warnings.includes('Duration, long-run or concurrent-sport limits reduced planned mileage.'))warnings.push('Duration, long-run or concurrent-sport limits reduced planned mileage.');
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
