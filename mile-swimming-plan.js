/* Swimming coaching policy for the canonical MILE workout format. */
(function(root){
'use strict';
const structured=root.mileStructuredWorkout||(typeof module!=='undefined'&&require('./mile-running-workout.js'));
const goals={fitness:'General fitness',technique:'Technique',endurance:'Endurance',speed:'Pool speed',open:'Open-water event',triathlon:'Triathlon'};
const levels=['beginner','recreational','intermediate','advanced','competitive'];
const add=(date,days)=>new Date(Date.parse(date)+86400000*days).toISOString().slice(0,10);
const iso=date=>typeof date==='string'&&/^20\d{2}-\d\d-\d\d$/.test(date)&&Number.isFinite(Date.parse(date))&&add(date,0)===date;
const weekday=date=>(new Date(date).getUTCDay()+6)%7;
const daysBetween=(a,b)=>(Date.parse(b)-Date.parse(a))/86400000;
const inRange=(n,lo,hi)=>Number.isFinite(n)&&n>=lo&&n<=hi;
const bands={easy:[18,30,2,3],aerobic:[8,18,3,4],steady:[3,9,4,5],css:[-2,3,6,7],fast:[0,0,7,8]};
function assess({seconds400,seconds200,continuous,level,recovery,unwell,comparable,poolLength,interrupted=false}={}){
 if(![20,25,50].includes(poolLength))return {error:'Use trials from a 20, 25 or 50 m pool so both distances finish at the wall.'};
 if(!levels.includes(level)||level==='beginner'||!inRange(continuous,800,15000)||recovery!=='normal'||unwell||interrupted||!comparable)
  return {error:'Use comparable pool trials only after you can swim 800 m continuously and feel normally recovered.'};
 if(!inRange(seconds400,180,1800)||!inRange(seconds200,85,900)||!inRange(seconds400/seconds200,2,2.65)||seconds400===seconds200*2)
  return {error:'Check the 400 m and 200 m times. The shorter swim should have a faster average pace.'};
 const pace=(seconds400-seconds200)/2;
 return inRange(pace,45,360)?{pace,speed:200/(seconds400-seconds200)}:{error:'These times fall outside the supported CSS range.'};
}

// [repetitions, metres, effort, rest seconds, cue]. Rest occurs between
// repeats; a separate easy swim changes the effort between linked blocks.
const library={
 streamline:['Push and glide','technique',[[6,25,'easy',20,'Push off gently and surface promptly with relaxed breathing.']]],
 breathing:['Relaxed breathing','technique',[[6,25,'easy',20,'Exhale gently into the water and breathe when needed.']]],
 balance:['Body balance','technique',[[4,50,'easy',25,'Keep your eyes down and neck relaxed.']]],
 entry:['Hand entry','technique',[[4,50,'easy',20,'Enter in front of your shoulder.']]],
 catch:['Catch awareness','technique',[[4,50,'easy',25,'Feel steady pressure on the water without forcing the pull.']]],
 rhythm:['Stroke rhythm','technique',[[6,50,'aerobic',20,'Keep your strokes and breathing unhurried.']]],
 count:['Stroke count check','technique',[[4,50,'easy',20,'Count strokes once each length at the same relaxed effort.']]],
 drillMix:['Technique transfer','technique',[[4,25,'easy',20,'Focus on hand entry.'],[4,50,'aerobic',20,'Keep the same entry during normal swimming.']]],
 shortBase:['Short aerobic repeats','aerobic',[[6,50,'aerobic',20]]],
 aerobic100:['Even 100s','aerobic',[[6,100,'aerobic',20]]],
 aerobic200:['Even 200s','aerobic',[[4,200,'aerobic',25]]],
 aerobic300:['Long aerobic repeats','aerobic',[[3,300,'aerobic',30]]],
 broken400:['Broken 400 endurance','aerobic',[[4,100,'aerobic',15],[1,200,'aerobic',0]]],
 longSwim:['Continuous aerobic swim','aerobic',[[1,600,'aerobic',0,'Keep breathing and stroke rhythm comfortable throughout.']]],
 double300:['Two steady loops','aerobic',[[2,300,'steady',35]]],
 negative200:['Build the second half','aerobic',[[3,100,'aerobic',15],[3,100,'steady',20]]],
 progress:['Progressive three blocks','aerobic',[[3,100,'easy',15],[3,100,'aerobic',15],[2,100,'steady',20]]],
 descend:['Faster by block','aerobic',[[3,75,'easy',15],[3,75,'aerobic',15],[3,75,'steady',20]]],
 pyramid:['Even-effort pyramid','aerobic',[[1,50,'aerobic',15],[1,100,'aerobic',20],[1,200,'aerobic',30],[1,100,'aerobic',20],[1,50,'aerobic',0]]],
 ladder:['Ascending endurance ladder','aerobic',[[1,50,'aerobic',15],[1,100,'aerobic',20],[1,150,'aerobic',25],[1,250,'aerobic',0]]],
 reverse:['Descending-distance ladder','aerobic',[[1,300,'aerobic',30],[1,200,'aerobic',25],[1,100,'steady',0]]],
 longFinish:['Endurance with a controlled finish','aerobic',[[1,400,'aerobic',30],[3,100,'steady',20]]],
 cssShort:['First CSS repeats','quality',[[6,75,'css',25]]],
 css100:['CSS 100s','quality',[[6,100,'css',20]]],
 css150:['CSS 150s','quality',[[4,150,'css',25]]],
 css200:['CSS 200s','quality',[[4,200,'css',30]]],
 css300:['Sustained threshold','quality',[[3,300,'css',35]]],
 cssSplit:['Broken threshold with reset','quality',[[3,100,'css',20],[1,100,'easy',30],[3,100,'css',20]]],
 cssLadder:['Threshold ladder','quality',[[1,100,'css',25],[1,200,'css',30],[1,300,'css',35],[1,100,'css',0]]],
 cssContrast:['Threshold then settle','quality',[[3,100,'css',20],[2,150,'aerobic',25]]],
 speedShape:['Short fast freestyle','speed',[[6,25,'fast',45,'Accelerate smoothly and stop increasing effort if your form slips.']]],
 speedFinish:['Speed after easy swimming','speed',[[3,100,'aerobic',20],[5,25,'fast',45]]],
 speedReset:['Fast repeats with an aerobic reset','speed',[[4,25,'fast',45],[1,100,'easy',30],[4,25,'fast',45]]],
 raceGear:['Pool race gearing','speed',[[4,50,'fast',55],[2,100,'steady',25]]],
 sprintEntry:['Controlled accelerations','speed',[[6,25,'fast',55,'Start from a push. Ease off before form deteriorates.']]],
 board:['Easy kick work','gear',[[6,25,'easy',25,'Kick gently using a board if comfortable.']],'board'],
 boardTransfer:['Kick and swim transfer','gear',[[4,25,'easy',25,'Easy kick with a board.'],[4,50,'aerobic',20]],'board'],
 buoy:['Pull buoy rhythm','gear',[[5,100,'aerobic',25,'Use a buoy and keep the pull relaxed.']],'buoy'],
 buoyBuild:['Pull then normal freestyle','gear',[[4,75,'steady',25,'Use a pull buoy.'],[2,100,'aerobic',20,'Swim without the buoy.']],'buoy'],
 fins:['Fins and body position','gear',[[6,50,'easy',25,'Use short fins with a gentle kick.']],'fins'],
 finsTransfer:['Fins then easy freestyle','gear',[[4,50,'easy',25,'Swim with short fins.'],[4,50,'aerobic',20,'Remove the fins and retain the same body line.']],'fins'],
 sighting:['Pool sighting practice','open',[[6,50,'aerobic',25,'Glance briefly towards an end-wall marker, then resume normal breathing.']]],
 sightingLong:['Sighting under steady effort','open',[[3,200,'aerobic',30,'Use occasional brief sighting while keeping regular breathing.']]],
 buoyTurn:['Pool buoy-turn rehearsal','open',[[5,100,'aerobic',25,'Practise a gradual change of direction only in clear water or the assigned lane.']]],
 triPace:['Triathlon pacing','open',[[3,250,'steady',25,'Start controlled and finish with enough reserve to ride.']]],
 triSettle:['Triathlon start then settle','open',[[4,50,'steady',20],[3,150,'aerobic',25,'Return to an even pace with relaxed breathing.']]],
 triBroken:['Broken triathlon swim','open',[[2,400,'aerobic',25,'Use the short break to reset pacing, then repeat.']]],
 recovery:['Easy recovery lengths','recovery',[[4,50,'easy',25]]],
 returnSwim:['Short return-to-water set','recovery',[[6,25,'easy',25,'Take extra rest if you need it and stop if symptoms return.']]],
 easyMixed:['Easy reset and rhythm','recovery',[[4,25,'easy',20],[2,50,'easy',25,'Finish with relaxed breathing.']]],
 easyGlide:['Easy form reset','recovery',[[4,50,'easy',25,'Keep your shoulders relaxed and use an unforced stroke.']]],
 easyLong:['Gentle aerobic reset','recovery',[[2,100,'easy',30,'Keep your effort comfortable enough to stop and talk.']]]
};
const limit=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const floorLength=(meters,length)=>Math.floor(meters/length)*length;
const speedTarget=(effort,css,technique)=>{
 const [fast,slow,lo,hi]=bands[effort];
 if(css&&effort!=='fast'&&!technique)return {kind:'swim_pace',fastSecondsPer100m:Math.max(45,Math.round(css+fast)),slowSecondsPer100m:Math.round(css+slow)};
 return {kind:'rpe',low:lo,high:hi};
};
function startedStep(intensity,duration,target,description){
 return {kind:'step',intensity,duration,target,...(description?{description}:{})};
}
function poolWorkout(key,capMeters,maxMinutes,athlete){
 const recipe=library[key];
 if(!recipe)return null;
 const [name,family,sets,equipment]=recipe,{poolLength:length,css,easyPace}=athlete;
 if(equipment&&!athlete.equipment?.includes(equipment))return null;
 const hard=family==='quality'||family==='speed', technique=family==='technique'||family==='gear';
 const ability=athlete.continuous!=null||athlete.level==='beginner'||athlete.interrupted?
  Math.max(length,floorLength(athlete.continuous??length,length)):Infinity;
 const breaks=athlete.level==='beginner'||athlete.interrupted;
 const warm=Math.min(ability,Math.max(length,Math.ceil((hard?200:Math.min(100,capMeters/5))/length)*length));
 const cool=Math.min(ability,Math.max(length,Math.ceil((hard?100:Math.min(100,capMeters/5))/length)*length));
 if(warm+cool+length>capMeters)return null;
 const swim=(intensity,metres,effort,cue)=>startedStep(intensity,{kind:'distance',meters:metres},speedTarget(effort,css,technique),cue);
 const rest=seconds=>startedStep('rest',{kind:'time',seconds},{kind:'open'},'Rest at the wall. Resume when ready.');
 const estimate=steps=>structured.expand(steps,{sport:'Swimming'}).reduce((sum,step)=>{
  const fallback=(easyPace??(athlete.level==='beginner'?240:180))+({warmup:15,cooldown:15}[step.intensity]??0);
  return sum+(step.duration.kind==='time'?step.duration.seconds:
   Math.ceil(step.duration.meters*(step.target.slowSecondsPer100m??fallback)/100));
 },0);
 const steps=[swim('warmup',warm,'easy'),...(breaks?[rest(25)]:[])];
 const cooldown=[...(breaks?[rest(25)]:[]),swim('cooldown',cool,'easy')];
 let remaining=capMeters-warm-cool, accepted=0;
 for(const [index,[count,metres,effort,pause,cue]] of sets.entries()){
  const distance=Math.min(ability,Math.max(length,floorLength(metres,length)));
  const action=swim(hard&&['css','fast'].includes(effort)?'interval':'active',distance,effort,cue);
  let countFit=Math.min(count,Math.floor(remaining/distance));
  if(hard&&countFit<count)return null;
  while(countFit>0){
   const block=countFit===1?[action]:[countFit>2?{kind:'repeat',count:countFit-1,steps:[action,...(pause?[rest(pause)]:[])]}:action,
    ...(countFit===2&&pause?[rest(pause)]:[]),action];
   if(pause&&index<sets.length-1)block.push(rest(pause));
   if(estimate([...steps,...block,...cooldown])<=maxMinutes*60){
    steps.push(...block);remaining-=countFit*distance;accepted+=countFit;break;
   }
   if(hard)return null;
   countFit--;
  }
  if(!countFit)break;
 }
 if(!accepted)return null;
 // Add useful steady lengths for aerobic sessions when the main set fits.
 if(family==='aerobic'&&remaining>=length&&!breaks){
  const filler=swim('active',Math.min(remaining,ability),'aerobic','Finish with easy, even strokes.');
  while(filler.duration.meters>=length&&estimate([...steps,filler,...cooldown])>maxMinutes*60)filler.duration.meters-=length;
  if(filler.duration.meters>=length)steps.push(filler);
 }
 steps.push(...cooldown);
 const totals=structured.totals(steps,{sport:'Swimming'}),estimatedSeconds=estimate(steps);
 const main=structured.expand(steps,{sport:'Swimming'}).find(step=>step.intensity===(hard?'interval':'active'))?.target;
 return {sport:'Swimming',swimmingPlanVersion:1,kind:key,name,setting:'pool',poolLength:length,equipment,demanding:hard,
  meters:totals.meters,estimatedSeconds,plannedMinutes:Math.ceil(estimatedSeconds/60),structuredSteps:steps,
  purpose:{technique:'Develop one repeatable stroke skill.',aerobic:'Build sustainable swimming volume.',quality:'Practise repeatable threshold effort.',
   speed:'Practise short, controlled faster efforts with generous rest.',gear:'Use equipment to isolate a specific skill.',open:'Practise event skills in the pool.',
   recovery:'Keep load light while maintaining water familiarity.'}[family],
  focus:sets.find(set=>set[4])?.[4]??(hard?'Keep the first and last efforts similar.':'Keep regular breathing and relaxed shoulders.'),
  target:structured.targetLabel(main),paceEstimate:!(css||easyPace)};
}
const waterSafety='Swim with organised supervision and a buddy at an appropriate venue. Check local conditions and use a safe entry and exit. Move this session to a pool if supervision or conditions are unsuitable. Breathe normally.';
function openWorkout(minutes){
 const step=(intensity,seconds,effort)=>startedStep(intensity,{kind:'time',seconds},speedTarget(effort,null,false));
 return {sport:'Swimming',swimmingPlanVersion:1,kind:'supervisedOpen',name:'Supervised open-water skills',setting:'open',demanding:false,
  meters:0,estimatedSeconds:minutes*60,plannedMinutes:minutes,purpose:'Practise calm pacing and sighting in open water.',
  focus:'Stay close to the supervised group. Practise brief sighting without interrupting normal breathing.',
  safety:waterSafety,target:'RPE 3–4/10',structuredSteps:[step('warmup',180,'easy'),step('active',(minutes-6)*60,'aerobic'),step('cooldown',180,'easy')]};
}
const pools={
 fitness:['shortBase','aerobic100','pyramid','negative200','aerobic200','ladder','longSwim'],
 technique:['streamline','breathing','balance','entry','catch','rhythm','count','drillMix','board','boardTransfer','fins','finsTransfer','buoy','buoyBuild'],
 endurance:['aerobic100','aerobic200','double300','broken400','aerobic300','progress','longFinish','reverse','longSwim'],
 speed:['shortBase','pyramid','descend','negative200','aerobic100','progress'],
 open:['sighting','sightingLong','buoyTurn','reverse','broken400','longFinish'],
 triathlon:['triSettle','triPace','triBroken','sighting','longFinish','double300']
};
const hardPools={
 fitness:['cssShort','css100','cssContrast'], technique:[], endurance:['css100','css150','css200','css300','cssLadder','cssSplit'],
 speed:['speedShape','cssShort','speedFinish','speedReset','raceGear','sprintEntry','cssContrast'],
 open:['css100','css200','cssContrast','cssSplit'],triathlon:['css150','css200','cssLadder','cssContrast']
};
const rotate=(items,n)=>items.length?[...items.slice(n%items.length),...items.slice(0,n%items.length)]:[];
function validate(c){
 const errors=[];
 if(!iso(c.start)||!Number.isInteger(c.weeks)||!inRange(c.weeks,1,32))errors.push('Choose a valid start and 1–32 weeks.');
 if(!Object.hasOwn(goals,c.goal)||!levels.includes(c.level)||![20,25,33,50].includes(c.poolLength)||
  !['pool','mixed','open'].includes(c.setting))errors.push('Choose a swimming goal, experience, venue and supported pool length.');
 if(!Array.isArray(c.available)||!c.available.length||new Set(c.available).size!==c.available.length||
  c.available.some(day=>!Number.isInteger(day)||!inRange(day,0,6)||!Number.isInteger(c.dayMinutes?.[day])||!inRange(c.dayMinutes[day],15,180)))
  errors.push('Choose available days with limits of 15–180 minutes.');
 for(const [value,min,max] of [[c.weeklyMeters,100,80000],[c.longestMeters,50,20000],[c.continuous,20,15000],[c.css,45,360],[c.easyPace,55,420],[c.eventMeters,100,25000]])
  if(value!=null&&!inRange(value,min,max))errors.push('Check the supplied distance or pace against the field limits.');
 if(c.eventDate&&(!iso(c.eventDate)||!iso(c.start)||c.eventDate<=c.start))errors.push('Choose an event date after the start.');
 if(c.unwell)errors.push('Pause planning while injured, unwell or experiencing concerning symptoms.');
 return [...new Set(errors)];
}
function generate(c={}){
 if(!c||typeof c!=='object')return {ok:false,errors:['Check swimming inputs.']};
 const errors=validate(c);
 if(errors.length)return {ok:false,errors};
 const level=levels.indexOf(c.level),warnings=new Set(), result=[];
 // An explicitly supplied easy pace estimates pool time only. Unmeasured
 // pace never becomes an intensity target.
 const light=c.interrupted||c.recovery==='poor',known=c.weeklyMeters!=null;
 const athlete={...c,css:!light&&level>0&&(c.continuous??0)>=400?c.css:null};
 if(c.continuous!=null&&c.continuous<c.poolLength)return {ok:false,errors:['Choose a pool where you can comfortably complete one length. Seek supervised instruction if needed.']};
 const eligibleOpen=c.supervised===true&&level>=2&&inRange(c.continuous,800,15000)&&c.recovery==='normal'&&!light;
 if(c.setting!=='pool'&&!eligibleOpen)warnings.add('The plan uses pool alternatives. Open-water sessions require established ability, normal recovery and organised supervision.');
 if(!known)warnings.add('Weekly distance is unconfirmed. Start with short skills sessions and review tolerance before increasing distance.');
 if(light)warnings.add('The plan uses easier sessions after interruption or poor recovery.');
 if(c.eventDate&&daysBetween(c.start,c.eventDate)>c.weeks*7)
  warnings.add('The event falls after this programme. Choose a longer block if you want it to include a taper.');
 if((c.eventDate&&daysBetween(c.start,c.eventDate)<28)||c.eventMeters>Math.max(600,(c.longestMeters??0)*1.25))
  warnings.add('The event may exceed your confirmed preparation. Review the distance, conditions and lead time with a coach.');
 const commitments=(Array.isArray(c.commitments)?c.commitments:[]).filter(item=>item&&iso(item.date));
 const nearHard=date=>commitments.some(item=>(item.hard||item.upperBody)&&Math.abs(daysBetween(item.date,date))<=1);
 let budget=Math.floor((c.weeklyMeters??Math.min(900,300*c.available.length))*(light?.65:1));
 let longest=c.longestMeters??(level===0?300:500),priorHard=null;
 for(let w=0;w<c.weeks;w++){
  const first=add(c.start,7*w), raceIn=c.eventDate?daysBetween(first,c.eventDate):Infinity;
  if(raceIn<=0)break;
  const phase=raceIn<=10?'Taper':w>0&&(w+1)%4===0?'Recovery':w<2?'Base':raceIn<=35||w>=Math.ceil(c.weeks*.6)?'Specific preparation':'Build';
  const otherMinutes=commitments.filter(item=>daysBetween(first,item.date)>=0&&daysBetween(first,item.date)<7)
   .reduce((total,item)=>total+(inRange(item.minutes,0,1440)?item.minutes:0),0);
  const heavy=c.priority!=='Swimming'&&Boolean(c.priority)||otherMinutes>=180;
  const reduced=light||!known||['Taper','Recovery'].includes(phase);
  const days=Array.from({length:7},(_,i)=>add(first,i)).filter(date=>c.available.includes(weekday(date))&&(!c.eventDate||date<c.eventDate));
  const scale=phase==='Taper'?.6:phase==='Recovery'?.74:otherMinutes>=180?.8:1;
  let remainder=floorLength(budget*scale,c.poolLength), hardUsed=false;
  const sessions=[];
  for(const [index,date] of days.entries()){
   const capMinutes=c.dayMinutes[weekday(date)]-commitments.filter(item=>item.date===date&&inRange(item.minutes,0,1440))
    .reduce((total,item)=>total+Math.ceil(item.minutes),0);
   const close=nearHard(date), cap=floorLength(Math.min(remainder, Math.max(c.poolLength*3,remainder/(days.length-index)),
    light?longest*.65:longest+(reduced?0:c.poolLength*2)),c.poolLength);
   if(capMinutes<15||cap<c.poolLength*3)continue;
   const hard=!close&&!heavy&&!reduced&&level>=2&&(c.continuous??0)>=400&&['Build','Specific preparation'].includes(phase)&&!hardUsed&&
    (!priorHard||daysBetween(priorHard,date)>=2)&&(!c.eventDate||daysBetween(date,c.eventDate)>10);
   const pool=light||close||phase==='Recovery'?rotate(['recovery','returnSwim','easyMixed','easyGlide','easyLong'],index):
    !known||level===0?pools.technique.filter(key=>!library[key][3]):pools[c.goal];
   const keys=[...(hard?rotate(hardPools[c.goal],w+index):[]),...rotate(pool,w+index), 'shortBase','returnSwim'];
   let session=null;
   if(eligibleOpen&&!reduced&&!close&&!heavy&&['open','triathlon'].includes(c.goal)&&c.setting!=='pool'&&
    phase==='Specific preparation'&&index===days.length-1&&capMinutes>=15){
    session=openWorkout(Math.min(capMinutes,30));
    // Reserve the equivalent scheduled pool slot to keep weekly demand bounded.
    remainder-=cap;
   } else {
    for(const key of keys){
     session=poolWorkout(key,close?Math.min(cap,400):cap,close?Math.min(capMinutes,25):capMinutes,athlete);
     if(session)break;
    }
    if(session)remainder-=session.meters;
   }
   if(!session)continue;
   if(session.demanding){hardUsed=true;priorHard=date;}
   sessions.push({...session,date,phase,week:w+1});
  }
  const meters=sessions.reduce((total,session)=>total+session.meters,0);
  if(sessions.length)result.push({week:w+1,phase,meters,minutes:sessions.reduce((n,s)=>n+s.plannedMinutes,0),sessions});
  if(sessions.length<days.length)warnings.add('Some sessions could not fit your availability, pool length or other training.');
  if(!reduced&&!heavy&&meters>=budget*.85){
   budget+=Math.min(300,Math.floor(budget*.05));
   longest=Math.max(longest,...sessions.map(item=>item.meters));
  }
 }
 return result.length?{ok:true,weeks:result,warnings:[...warnings]}:{ok:false,errors:['No swim fits your confirmed time and distance. Try more time, fewer days or a shorter pool.']};
}
const api={goals,levels,library,add,iso,assess,validate,generate,poolWorkout,waterSafety};
root.mileSwimmingPlan=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
