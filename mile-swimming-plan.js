/* Stage 1 pool programming. Benchmark math and product coaching rules are separate. */
(function(root){
'use strict';
const workout=root.mileStructuredWorkout||(typeof module!=='undefined'&&require('./mile-running-workout.js'));
const library=root.mileSwimmingLibrary||(typeof module!=='undefined'&&require('./mile-swimming-library.js'));
const goals={fitness:'General fitness',technique:'Technique',endurance:'Endurance',speed:'Speed',open:'Open-water event',triathlon:'Triathlon'};
const pools={'25m':25,'50m':50,'25yd':22.86};
const levels=['beginner','intermediate','advanced'];
const dayMs=86400000;
const iso=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const add=(d,n)=>new Date(Date.parse(d)+n*dayMs).toISOString().slice(0,10);
const dayOf=d=>(new Date(d).getUTCDay()+6)%7;
const number=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const round=n=>Number(n.toFixed(2));

function css(benchmark={},athlete={}){
 if(!['intermediate','advanced'].includes(athlete.level)||athlete.continuousMeters<400)
  return {ok:false,reason:'CSS trials require confidence swimming 400 m continuously.'};
 if(!benchmark.comparable)return {ok:false,reason:'Confirm recent, comparable 200 m and 400 m freestyle trials in the same measured metric pool.'};
 if(benchmark.through&&(!iso(benchmark.date)||!iso(benchmark.through)||benchmark.date<add(benchmark.through,-56)||benchmark.date>benchmark.through))
  return {ok:false,reason:'Use a trial date within the previous eight weeks.'};
 const {seconds200,seconds400}=benchmark;
 if(!number(seconds200,90,600)||!number(seconds400,180,1250)||seconds400<=2*seconds200||
    seconds400>2.6*seconds200)
  return {ok:false,reason:'Check trial times. The 400 m pace should be slower, with both times from comparable efforts.'};
 return {ok:true,secondsPer100m:(seconds400-seconds200)/2};
}

function history(activities=[],through){
 if(!iso(through))return [];
 const rows=[],seen=new Set();
 for(const activity of activities){
  if(activity?.id==null||!iso(activity.date)||activity.date<add(through,-179)||activity.date>through||!number(activity.meters,1,50000))continue;
  const id=String(activity.id);
  if(seen.has(id))continue;
  seen.add(id);rows.push(activity);
 }
 return [7,28,90,180].map(days=>{
  const recent=rows.filter(row=>row.date>=add(through,1-days));
  return {days,count:recent.length,meters:recent.length?round(recent.reduce((sum,row)=>sum+row.meters,0)):null,
   longestMeters:recent.length?Math.max(...recent.map(row=>row.meters)):null};
 });
}

const effort={
 technique:'Practise the cue at an easy effort', easy:'Easy and relaxed', aerobic:'Comfortable and repeatable',
 steady:'Firm but controlled',css:'Sustained and repeatable',fast:'Quick with good form',build:'Build smoothly within the repeat'
};
// Coaching bands in seconds relative to measured CSS. No target for drills or short speed.
const offsets={easy:[15,28],aerobic:[8,18],steady:[4,10],css:[0,4]};
const pause=seconds=>({kind:'step',intensity:'rest',duration:{kind:'time',seconds},target:{kind:'open'},description:'Rest at the wall'});
function lengthCount(pool,nominal){return Math.max(1,Math.round(nominal/pool));}
function compile(recipe,pool,benchmark,observedPace){
 const steps=[];
 let estimated=0;
 const step=(intensity,nominal,cue)=>{
  const meters=round(lengthCount(pool,nominal)*pool);
  const range=offsets[cue], pace=benchmark?.secondsPer100m;
  const target=range&&pace?{kind:'swim_pace',fastSecondsPer100m:Math.ceil(pace+range[0]),slowSecondsPer100m:Math.ceil(pace+range[1])}:{kind:'open'};
  const estimate=target.slowSecondsPer100m??(pace?pace+35:observedPace?observedPace+25:200);
  estimated+=Math.ceil(meters*estimate/100);
  return {kind:'step',intensity,duration:{kind:'distance',meters},target,description:effort[cue],swimCue:cue};
 };
 const demanding=['speed','css'].includes(recipe.family);
 const short=['foundation','recovery'].includes(recipe.family);
 steps.push(step('warmup',short?25:demanding?200:100,'easy'),pause(20));estimated+=20;
 for(const [index,[meters,cue,reps,rest]] of recipe.blocks.entries()){
  for(let rep=0;rep<reps;rep++){
   steps.push(step(['css','fast','build'].includes(cue)?'interval':'active',meters,cue));
   if(rest&&(rep<reps-1||index<recipe.blocks.length-1)){steps.push(pause(rest));estimated+=rest}
  }
 }
 steps.push(pause(20),step('cooldown',short?25:demanding?100:50,'easy'));estimated+=20;
 const total=workout.totals(steps,{sport:'Swimming'});
 return {kind:recipe.id,name:recipe.name,family:recipe.family,purpose:recipe.purpose,focus:recipe.focus,
  demanding,equipment:recipe.gear??null,poolMeters:pool,meters:round(total.meters),estimatedSeconds:estimated,plannedMinutes:Math.ceil(estimated/60),structuredSteps:steps};
}
function timedFoundation(pool,minutes){
 const repetitions=Math.min(6,Math.floor(minutes));
 const steps=[];
 for(let i=0;i<repetitions;i++){
  steps.push({kind:'step',intensity:i===0?'warmup':i===repetitions-1?'cooldown':'active',
   duration:{kind:'time',seconds:20},target:{kind:'open'},description:'Up to 20 seconds of comfortable movement in supervised shallow water'});
  steps.push(pause(40));
 }
 return {name:'Supervised swim and rest',kind:'timed-foundation',family:'foundation',purpose:'Build comfort with short, repeatable pool efforts.',
  focus:'Stay in standing depth with supervision. End each effort sooner if needed, rest at the wall, and breathe normally.',
  demanding:false,poolMeters:pool,meters:null,estimatedSeconds:repetitions*60,plannedMinutes:repetitions,structuredSteps:steps};
}

function addAerobicLengths(session,budget,minutes,pool,maxLength,pace,level){
 const steps=session.structuredSteps.slice();
 const maxLengths=Math.max(1,Math.floor(Math.min(maxLength,level==='beginner'?50:200)/pool));
 let meters=session.meters,seconds=session.estimatedSeconds;
 while(steps.length<195){
  const lengths=Math.min(maxLengths,Math.floor((budget-meters+.001)/pool),Math.floor((minutes*60-seconds-20)*100/pace/pool));
  if(lengths<1)break;
  const extra=round(lengths*pool);
  steps.splice(-1,0,{kind:'step',intensity:'active',duration:{kind:'distance',meters:extra},target:{kind:'open'},
   description:'Easy aerobic lengths · reset your stroke at the wall',swimCue:'easy'},pause(20));
  meters=round(meters+extra);seconds+=20+Math.ceil(extra*pace/100);
 }
 return {...session,structuredSteps:steps,meters,estimatedSeconds:seconds,plannedMinutes:Math.ceil(seconds/60)};
}
function respectsContinuous(session,max){
 let segment=0;
 for(const step of session.structuredSteps){
  segment=step.duration.kind==='time'?0:segment+step.duration.meters;
  if(segment>max+.001)return false;
 }
 return true;
}

const families={
 fitness:['foundation','aerobic','endurance','technique','progression'],
 technique:['foundation','technique','equipment','aerobic'],
 endurance:['aerobic','endurance','progression','css'],
 speed:['aerobic','technique','speed','css','progression'],
 open:['aerobic','open-water','endurance','progression'],
 triathlon:['aerobic','triathlon','endurance','progression','css']
};
function generate(input={}){
 const {goal,level,start,weeks,pool,weeklyMeters,longestMeters,continuousMeters,eventDate,eventMeters,recovery}=input;
 const poolMeters=pools[pool],errors=[],warnings=[];
 const available=Array.isArray(input.available)?[...new Set(input.available.filter(d=>Number.isInteger(d)&&d>=0&&d<7))]:[];
 const caps=input.dayMinutes??{};
 const hardDays=Array.isArray(input.hardDays)?input.hardDays:[];
 if(!Object.hasOwn(goals,goal)||!levels.includes(level)||!Object.hasOwn(pools,pool))errors.push('Choose a goal, experience level and pool length.');
 if(!iso(start)||!Number.isInteger(weeks)||weeks<1||weeks>24)errors.push('Choose a valid start and 1–24 weeks.');
 if(!available.length||!Number.isInteger(input.sessions)||input.sessions<1||input.sessions>available.length||input.sessions>6||
  available.some(day=>!Number.isInteger(caps[day])||!number(caps[day],6,180)))errors.push('Choose available days, session count and 6–180 minutes for each selected day.');
 if(!number(continuousMeters,0,10000))errors.push('Confirm the distance you can comfortably swim without stopping.');
 if(weeklyMeters!=null&&!number(weeklyMeters,0,60000)||longestMeters!=null&&!number(longestMeters,1,15000))
  errors.push('Check sustainable weekly distance and longest recent swim.');
 if(eventDate&&(!iso(eventDate)||!iso(start)||eventDate<=start))errors.push('Choose an event after the start date.');
 if(eventMeters!=null&&!number(eventMeters,50,20000))errors.push('Enter a target swim distance between 50 m and 20 km.');
 if(input.interrupted&&level!=='beginner')errors.push('Use the supervised foundation option after a training interruption.');
 if(errors.length)return {ok:false,errors,warnings,weeks:[]};
 const benchmark=input.benchmark?css(input.benchmark,{level,continuousMeters}):null;
 if(benchmark&&!benchmark.ok)warnings.push(benchmark.reason);
 const pace=benchmark?.ok?benchmark:null;
 if(!pace)warnings.push('Without valid CSS, effort cues guide swimming. Session duration uses a planning estimate.');
 const timed=level==='beginner'&&(input.interrupted||!weeklyMeters||!longestMeters||continuousMeters<poolMeters);
 if(!timed&&(!weeklyMeters||!longestMeters))return {ok:false,errors:['Confirm sustainable weekly distance and longest recent swim or use beginner foundations.'],warnings,weeks:[]};
 if(recovery==='poor')warnings.push('Use reduced-load sessions until recovery improves. Review your plan before increasing training.');
 if(timed)warnings.push('Foundation sessions use a supervised shallow pool and no distance target. Confirm tolerance before progressing.');
 if(goal==='open'||goal==='triathlon'||input.setting==='open')
  warnings.push('Pool rehearsal only. Open-water training requires a supervised venue or organised group, safe conditions and a buddy. Never train alone or practise breath-holding.');
 const daysToEvent=eventDate?(Date.parse(eventDate)-Date.parse(start))/dayMs:null;
 if((daysToEvent!=null&&daysToEvent<42)||(eventMeters!=null&&(!longestMeters||eventMeters>longestMeters*1.25)))
  warnings.push('The available preparation or recent endurance may be insufficient. Consider a shorter event, later date or individual coaching review.');
 if(daysToEvent!=null&&daysToEvent>weeks*7)warnings.push('The event falls outside this programme. No event taper is scheduled.');
 if((input.priority&&input.priority!=='Swimming')||hardDays.length)warnings.push('Other sports limit demanding swim work and progression.');
 const primary=!input.priority||input.priority==='Swimming';
 const preferredFamilies=input.setting==='open'&&goal==='fitness'?[...families[goal],'open-water']:families[goal];
 const gear=Array.isArray(input.gear)?input.gear:[];
 const recipeList=library.filter(recipe=>!recipe.gear||gear.includes(recipe.gear));
 const observedPace=number(input.observedPace,55,450)?input.observedPace:null;
 const compiled=recipeList.filter(recipe=>!recipe.blocks.some(([meters,cue])=>['fast','build'].includes(cue)&&meters<poolMeters))
  .map(recipe=>compile(recipe,poolMeters,pace,observedPace));
 const result=[],lastUsed=new Map();
 const commitments=Array.isArray(input.commitments)?input.commitments:[];
 const gain=primary&&recovery==='good'&&!hardDays.length&&!commitments.some(item=>item?.hard)?(level==='beginner'?.04:level==='intermediate'?.06:.07):0;
 let previous=weeklyMeters,peak=weeklyMeters,longCap=longestMeters;
 for(let week=0;week<weeks;week++){
  const dates=Array.from({length:7},(_,i)=>add(start,week*7+i)).filter(date=>available.includes(dayOf(date))&&(!eventDate||date<eventDate));
  if(!dates.length)continue;
  const phase=eventDate&&daysToEvent<=weeks*7&&(Date.parse(eventDate)-Date.parse(dates[0]))/dayMs<=10?'Taper':
   week%4===3||recovery==='poor'?'Recovery':week<2?'Base':week<Math.ceil(weeks*.65)?'Build':'Specific';
  const reduced=phase==='Recovery'||phase==='Taper';
  const target=timed?null:recovery==='poor'?weeklyMeters*.7:week===0?weeklyMeters*(reduced?.75:1):reduced?previous*(phase==='Taper'?.75:.8):
   result.at(-1)?.phase==='Recovery'?peak:previous*(1+gain);
  const nearHard=(day,date)=>hardDays.some(other=>[0,1,6].includes((day-other+7)%7))||
   commitments.some(item=>item?.hard&&Math.abs(Date.parse(item.date)-Date.parse(date))<=dayMs);
  let hardPlaced=false,used=0;
  const weekly=[];
  const ranked=dates.map(date=>({date,day:dayOf(date)})).sort((a,b)=>caps[b.day]-caps[a.day]||a.date.localeCompare(b.date));
  const chosen=[];
  while(ranked.length&&chosen.length<input.sessions){
   ranked.sort((a,b)=>spacing(b)-spacing(a)||caps[b.day]-caps[a.day]||a.date.localeCompare(b.date));
   chosen.push(ranked.shift());
  }
  function spacing(slot){
   const distance=chosen.length?Math.min(...chosen.map(item=>Math.abs(Date.parse(item.date)-Date.parse(slot.date))/dayMs)):0;
   return distance-(hardDays.includes(slot.day)?1:0);
  }
  for(const [index,slot] of chosen.entries()){
   const {date,day}=slot;
   const minutes=caps[day], hardDay=hardDays.includes(day)||commitments.some(item=>item?.hard&&item.date===date);
   if(timed&&hardDay&&chosen.length>1)continue;
   let session=timed?timedFoundation(poolMeters,reduced?Math.min(minutes,4):minutes):null;
   if(!timed){
    const quality=!!pace&&!reduced&&phase!=='Base'&&primary&&recovery==='good'&&!nearHard(day,date)&&!hardPlaced&&level!=='beginner';
    const budget=Math.min((target-used)/(chosen.length-index)*(index===0&&chosen.length>1?1.12:1),target-used,longCap);
    const preferred=reduced?(phase==='Taper'?['taper','recovery']:['recovery','foundation']):
     hardDay?['recovery','foundation']:level==='beginner'?['foundation','recovery','technique']:preferredFamilies;
    const eligible=compiled.filter(item=>item.meters<=budget+.001&&item.plannedMinutes<=minutes&&
     (!item.demanding||(quality&&preferred.includes(item.family)&&continuousMeters>=400))&&
     respectsContinuous(item,continuousMeters)&&(!(reduced||hardDay)||preferred.includes(item.family)));
    const ordered=eligible.filter(item=>item.meters>=budget*.45);
    const candidates=ordered.length?ordered:eligible;
    candidates.sort((a,b)=>Number(preferred.includes(b.family))-Number(preferred.includes(a.family))||
     (lastUsed.get(a.kind)??-1000)-(lastUsed.get(b.kind)??-1000)||b.meters-a.meters);
    if(candidates[0])session=addAerobicLengths(candidates[0],budget,minutes,poolMeters,continuousMeters,pace?pace.secondsPer100m+28:observedPace?observedPace+25:200,level);
   }
   if(!session)continue;
   hardPlaced||=session.demanding;
   used+=session.meters??0;
   lastUsed.set(session.kind,week*7+index);
   weekly.push({...session,sport:'Swimming',date,day,phase,swimmingPlanVersion:1});
  }
  if(!weekly.length)break;
  if(!timed&&!reduced){
   peak=used;
   longCap=Math.max(longestMeters,Math.min(longestMeters*1.5,Math.max(...weekly.map(item=>item.meters))*(1+gain)));
  }
  previous=used;
  result.push({week:week+1,phase,sessions:weekly.sort((a,b)=>a.date.localeCompare(b.date)),meters:timed?null:round(used)});
 }
 if(result.length<weeks&&!(eventDate&&eventDate<=add(start,weeks*7)))warnings.push('Some weeks could not fit useful workouts within the confirmed distance or time limits.');
 return {ok:!!result.length,errors:result.length?[]:['No suitable session fits these limits. Check availability or use supervised foundations.'],warnings,weeks:result,benchmark:pace};
}
const api={goals,pools,iso,css,history,generate,library,compile};
root.mileSwimmingPlan=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
