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
 easy:{name:'Easy aerobic run',purpose:'Build aerobic fitness with low fatigue.',focus:'Keep breathing conversational; slow down to stay within your easy effort or HR range.',rpe:3},
 recovery:{name:'Recovery run',purpose:'Maintain gentle aerobic movement without adding a demanding stimulus.',focus:'Keep effort very relaxed; shorten or skip if recovery is poor.',rpe:2},
 long:{name:'Long aerobic run',purpose:'Develop endurance and durability through sustained aerobic work.',focus:'Start gently, keep effort steady and avoid chasing pace on hills.',rpe:4},
 steady:{name:'Controlled steady run',purpose:'Build sustained aerobic endurance above easy effort.',focus:'Stay controlled, never force the pace.',rpe:5,reps:1,fraction:.55},
 cruise:{name:'Threshold cruise intervals',purpose:'Improve sustainable running speed and threshold endurance.',focus:'Keep each repetition controlled and consistent; do not chase a faster final repetition.',rpe:7,reps:4,fraction:.48},
 threshold:{name:'Continuous threshold run',purpose:'Develop sustained threshold endurance.',focus:'Finish with control; avoid racing the final segment.',rpe:7,reps:1,fraction:.40},
 vo2:{name:'Controlled fast intervals',purpose:'Develop aerobic power and running economy.',focus:'Maintain smooth mechanics and repeatable effort, not an all-out sprint.',rpe:8,reps:5,fraction:.30},
 fartlek:{name:'Controlled fartlek',purpose:'Practise changing speed while maintaining aerobic control.',focus:'Relax during recoveries and keep faster efforts repeatable.',rpe:6,reps:5,fraction:.30},
 race5:{name:'5K-specific intervals',purpose:'Practise controlled 5K rhythm.',focus:'Use current demonstrated ability, not an aspirational race pace.',rpe:8,reps:5,fraction:.36},
 race10:{name:'10K-specific intervals',purpose:'Develop sustained 10K effort.',focus:'Keep repetitions even and avoid exceeding current fitness.',rpe:7,reps:3,fraction:.45},
 half:{name:'Half marathon rhythm',purpose:'Practise sustained half marathon effort.',focus:'Maintain steady breathing and even rhythm.',rpe:6,reps:2,fraction:.55},
 marathon:{name:'Marathon rhythm',purpose:'Practise controlled marathon effort and pacing.',focus:'Keep effort sustainable; practise fueling when appropriate.',rpe:5,reps:2,fraction:.55},
 ultra:{name:'Ultra endurance rehearsal',purpose:'Practise sustainable endurance and fueling.',focus:'Use easy effort and practise fueling; walk steep climbs if needed.',rpe:4},
 taper:{name:'Taper easy run',purpose:'Maintain running rhythm while reducing fatigue.',focus:'Keep it easy; resist adding distance or intensity.',rpe:3},
 return:{name:'Return-to-running easy session',purpose:'Reintroduce running gradually without demanding intensity.',focus:'Keep effort comfortable, take walk breaks as needed and stop for concerning symptoms.',rpe:2}
};
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
function makeSession(kind,m,a,phase){
 const t=templates[kind];let easy=validPace(a.easyPace)?a.easyPace:null,threshold=validPace(a.thresholdPace)?a.thresholdPace:null;
 const slow=easy===null?540:Math.max(easy+35,threshold===null?0:threshold+45);
 const aerobic=a.easyZone&&Number.isInteger(a.easyZone.lowBpm)&&Number.isInteger(a.easyZone.highBpm)&&a.easyZone.lowBpm>=30&&a.easyZone.highBpm<=250&&a.easyZone.lowBpm<a.easyZone.highBpm?{kind:'heart_rate',lowBpm:a.easyZone.lowBpm,highBpm:a.easyZone.highBpm}:easy!==null?{kind:'pace',fastSecondsPerKm:Math.max(150,easy-10),slowSecondsPerKm:Math.min(1800,easy+35)}:{kind:'open'};
 let quality={kind:'open'};
 const five=positive(a.fiveKSeconds)&&a.fiveKSeconds>=750&&a.fiveKSeconds<=6000?a.fiveKSeconds/5:null;
 if(five!==null&&['vo2','race5'].includes(kind))quality={kind:'pace',fastSecondsPerKm:Math.round(five),slowSecondsPerKm:Math.round(five+15)};
 if(threshold!==null&&['cruise','threshold','race10','half','marathon','steady'].includes(kind)){
 const offsets={cruise:[0,15],threshold:[0,15],race10:[-5,10],half:[10,30],marathon:[25,50],steady:[30,60]}[kind];
 quality={kind:'pace',fastSecondsPerKm:Math.max(150,threshold+offsets[0]),slowSecondsPerKm:threshold+offsets[1]};
 }
 const step=(intensity,description,meters,target)=>({kind:'step',intensity,description,duration:{kind:'distance',meters},target});
 let steps=[];
 if(t.reps&&m>=4000){
  let reps=t.reps,work=round(m*t.fraction/reps),rest=reps>1?Math.min(300,round(m*.12/(reps-1))):0;
  if(work>=200&&(reps===1||rest>=100)){
   let remainder=m-work*reps-rest*(reps-1),warm=round(remainder*.55);
   steps.push(step('warmup','Easy running',warm,aerobic));
   for(let i=0;i<reps;i++){steps.push(step('interval',t.name+' · repetition '+(i+1)+' of '+reps,work,quality));if(i<reps-1)steps.push(step('recovery','Easy jog between repetitions',rest,aerobic));}
   steps.push(step('cooldown','Easy running',remainder-warm,aerobic));
  }
 }
 if(!steps.length){if(t.reps)return makeSession('easy',m,a,phase);
 const warm=round(m*.15),cool=round(m*.1);
 if(warm>=100)steps.push(step('warmup','Ease into the run',warm,aerobic));
 steps.push(step('active',t.focus,m-warm-cool,aerobic));
 if(cool>=100)steps.push(step('cooldown','Relaxed running',cool,aerobic));}
 const seconds=Math.ceil(m*slow/1000);
 return {name:t.name,kind,phase,meters:m,km:m/1000,plannedMinutes:Math.ceil(seconds/60),estimatedSeconds:seconds,estimatedPaceSeconds:slow,paceEstimateOnly:easy===null,targetRpe:t.rpe,purpose:t.purpose,focus:t.focus,structuredSteps:steps};
}
function generate(input={}){
 const a=input.athlete||{},s=input.schedule||{},goal=input.goal||'fitness',weeks=input.weeks,base=baseline(a),warnings=[];
 const errors=[];
 if(!goals.includes(goal))errors.push('Unknown goal');
 if(!Number.isInteger(weeks)||weeks<1||weeks>52)errors.push('Choose 1–52 weeks');
 const available=dayList(s.available),hard=dayList(s.demandingDays),n=s.runs;
 if(!Number.isInteger(n)||n<1||n>available.length)errors.push('Runs must fit available days');
 if(!positive(s.weekdayMinutes)||!positive(s.longMinutes))errors.push('Enter session duration limits');
 if(base.km===null||base.km<=0)errors.push('Confirm a positive sustainable starting volume before generating; zero or interrupted history requires a separately reviewed return plan');
 if(!Object.hasOwn(caps,a.level))errors.push('Choose experience level');
 if(base.interrupted)errors.push('Recent interruption requires a separately reviewed return plan before mileage progression');
 if(base.km>250)errors.push('High-volume programme requires individual coaching review');
 if(a.injury===true)errors.push('Training progression paused: seek appropriate review before generating');
 if(errors.length)return {ok:false,errors,warnings,baseline:base,weeks:[]};
 const start=input.start,parseDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x?Date.parse(x):null;
 const st=parseDate(start),race=parseDate(input.raceDate);
 if(st===null||(input.raceDate&&(race===null||race<st)))return {ok:false,errors:['Invalid start or race date'],warnings,baseline:base,weeks:[]};
 const long=available.includes(s.longDay)?s.longDay:available.find(d=>!hard.includes(d))??available[0];
 if(long!==s.longDay)warnings.push('Preferred long day unavailable; alternative used.');
 const chosen=chooseDays(available,n,long,hard);
 if(hard.length)warnings.push('Demanding concurrent sport days suppress adjacent running quality; review total load.');
 if(!validPace(a.easyPace))warnings.push('Duration estimates use 9:00/km as a planning assumption only; targets remain effort-based unless a valid HR range is supplied.');
 if(!positive(a.longestKm))warnings.push('No confirmed recent long run; long-session allocation is conservative.');
 if(base.source!=='four completed weeks')warnings.push('Starting volume uses limited or athlete-confirmed history; progression is restricted.');
 if(input.targetSeconds)warnings.push('Target time is not a validated race prediction; no aspirational pace is prescribed.');
 if(goal==='ultra')warnings.push('Ultra distance, terrain and fueling require individual review.');
 if(['first-race','personal-best'].includes(goal))warnings.push('Race distance is not specified; generic endurance programme only.');
 const goalDist=raceKm[goal];
 if(goalDist&&base.km<goalDist*.5)warnings.push('Current volume is low relative to event distance; goal feasibility needs review.');
 const offset=(new Date(st).getUTCDay()+6)%7;
 const ordered=chosen.map(d=>({day:d,offset:(d-offset+7)%7})).sort((a,b)=>a.offset-b.offset);
 const slow=validPace(a.easyPace)?Math.max(a.easyPace+35,validPace(a.thresholdPace)?a.thresholdPace+45:0):540;
 const plan=[];let previous=round(base.km*1000),preRecovery=previous,previousPhase=null,previousLong=positive(a.longestKm)?round(a.longestKm*1000):round(previous*.25);
 const raceWeek=race===null?null:Math.floor((race-st)/604800000);
 if(raceWeek!==null&&raceWeek>=weeks)warnings.push('Race is outside programme dates; no race taper scheduled.');
 let ceiling=base.source==='four completed weeks'&&!base.interrupted?caps[a.level]:0;
 const primary=input.adaptation?.priority==null||input.adaptation.priority==='Running';
 if(!primary)warnings.push('Running is secondary; planned mileage is reduced and demanding running sessions are suppressed.');
 if(!primary||hard.length||a.recovery==='poor'||goal==='return')ceiling=0;
 for(let i=0;i<weeks;i++){
  const untilRace=raceWeek===null?Infinity:raceWeek-i;
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
  const qualityAllowed=primary&&base.source==='four completed weeks'&&a.level!=='beginner'&&goal!=='return'&&a.recovery!=='poor'&&base.km>=20&&n>=3&&!taper&&phase!=='Recovery'&&phase!=='Base';
  const q=qualityAllowed?slots.find(o=>o!==longSlot&&!hard.some(d=>diff(o.day,d)<=1)&&(!longSlot||diff(o.day,longSlot.day)>=2)):null;
  const capacity=slots.map(o=>{let max=round((o===longSlot?s.longMinutes:s.weekdayMinutes)*60/slow*1000);
   if(o===longSlot)max=Math.min(max,round(previousLong*(i===0?1:1+Math.min(ceiling,.05))),round(target*(n<=2?.55:.40)));
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
   if(o===q){kind=phase==='Specific'?({'5k':'race5','10k':'race10','half-marathon':'half',marathon:'marathon',ultra:'steady'}[goal]||'cruise'):(i%3===0?'fartlek':i%3===1?'cruise':'threshold');}
   const date=new Date(st+(i*7+o.offset)*86400000).toISOString().slice(0,10);
   return [{...makeSession(kind,m,a,phase),date,day:o.day,planWeek:i+1,durationLimitMinutes:o===longSlot?s.longMinutes:s.weekdayMinutes}];
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
 return {ok:true,errors:[],warnings,baseline:base,weeks:plan,goal,chosenDays:chosen,feasibility:'review-required',settings:{...input.adaptation},version:1};
}
const api={generate,baseline,templates};root.mileRunningPlan=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
