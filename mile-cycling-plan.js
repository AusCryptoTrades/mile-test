/* MILE Intelligence cycling policy. Uses the shared structured workout format. */
(function (root) {
'use strict';
const workout = root.mileStructuredWorkout || (typeof module !== 'undefined' && require('./mile-running-workout.js'));
const levels = ['beginner','recreational','intermediate','advanced','competitive'];
const goals = {
 fitness:'General fitness', endurance:'Endurance', ftp:'FTP improvement', climbing:'Climbing',
 distance:'Target distance', fondo:'Gran Fondo', road:'Road racing', gravel:'Gravel racing',
 tt:'Time trial', triathlon:'Triathlon preparation'
};
const surfaces = ['road','gravel','mountain','stationary'];
const absolute = (value,min,max) => Number.isFinite(value) && value >= min && value <= max;
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const iso = date => typeof date === 'string' && /^\d{4}-\d\d-\d\d$/.test(date) &&
 !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
const add = (date,days) => new Date(Date.parse(date)+86400000*days).toISOString().slice(0,10);
const dayOf = date => (new Date(date).getUTCDay()+6)%7;
const separation = (a,b) => Math.abs(Date.parse(a)-Date.parse(b))/86400000;
const validFtp = watts => Number.isInteger(watts) && absolute(watts,50,600);
const zoneCeilings = [55,75,90,105,120,150];
function powerZone(watts,ftp) {
 if(!absolute(watts,0,2500)||!validFtp(ftp))return null;
 const index=zoneCeilings.findIndex(ceiling=>watts*100<=ftp*ceiling);
 return index===-1?7:index+1;
}
function powerZones(ftp) {
 if(!validFtp(ftp))return [];
 return [...zoneCeilings,Infinity].map((ceiling,index)=>({
  zone:index+1, lowWatts:index===0?0:Math.floor(ftp*zoneCeilings[index-1]/100)+1,
  highWatts:Number.isFinite(ceiling)?Math.floor(ftp*ceiling/100):null
 }));
}

// Internal coaching bands. Sweet spot overlaps tempo and threshold.
const bands = {
 easy:{power:[45,55],rpe:[1,2]}, aerobic:{power:[56,72],rpe:[2,4]},
 steady:{power:[76,85],rpe:[4,5]}, sweet:{power:[88,94],rpe:[5,6]},
 threshold:{power:[95,102],rpe:[6,8]}, vo2:{power:[106,116],rpe:[8,9]},
 anaerobic:{power:[120,135],rpe:[8,9]}, sprint:{rpe:[8,9]}, benchmark:{rpe:[7,8]}
};

const library = {
 recovery:['Recovery spin','Low-stress movement','Keep pressure on the pedals light.'],
 endurance:['Aerobic endurance','Build repeatable aerobic time','Ride at an effort that allows conversation.'],
 long:['Long endurance ride','Build durability for longer rides','Hold an even effort and practise your event-day routine.'],
 progressive:['Progressive endurance','Practise pacing late in a ride','Finish a little firmer while staying controlled.'],
 tempo:['Tempo blocks','Develop sustained subthreshold work','Use smooth pacing across both blocks.',8,5,2,'steady',3],
 sweet:['Sweet spot blocks','Practise long controlled work near threshold','Finish each effort with room for one more.',10,6,2,'sweet',4],
 sustained:['Sustained threshold','Practise sustained race-like pacing','Build into one steady effort.',12,14,1,'threshold',0],
 threshold:['Threshold intervals','Accumulate controlled threshold work','Keep the first and last block similar.',10,6,3,'threshold',3],
 overunder:['Over-unders','Practise controlled changes near threshold','Ease slightly between surges while continuing to pedal.',12,4,3,'over-under',3],
 vo2:['Aerobic power intervals','Practise repeatable high aerobic effort','Keep each effort repeatable and recover easily.',12,3,4,'vo2',3],
 micro:['Short aerobic intervals','Practise fast changes in aerobic demand','Use repeatable efforts and give heart rate time to respond.',10,.5,10,'vo2',.5],
 anaerobic:['Short race surges','Practise brief accelerations with recovery','Choose a safe stretch and finish each acceleration smoothly.',12,.5,5,'anaerobic',3],
 sprint:['Neuromuscular accelerations','Practise a quick, controlled acceleration','Use open space or a stable trainer and take full recovery.',12,.1,5,'sprint',3],
 climb:['Climbing preparation','Practise steady power or effort on a climb','Use gearing that allows comfortable pedalling.',10,5,3,'sweet',3],
 cadence:['Cadence skills','Practise smooth pedalling at different cadences','Explore slightly quicker pedalling without adding resistance.',7,1,4,'aerobic',2],
 road:['Race changes of pace','Practise a surge and settle into a sustainable effort','Practise the surge in a safe setting before returning to a steady pace.',12,4,3,'over-under',4],
 tt:['Time-trial blocks','Practise even effort in your event position','Use a position you can hold comfortably.',10,9,2,'threshold',4],
 gravel:['Gravel endurance','Build endurance on the expected surface','Use a familiar route and manage effort over loose ground.'],
 indoor:['Trainer endurance','Build aerobic time indoors','Use airflow and take water breaks as needed.'],
 brick:['Multisport-compatible ride','Build cycling endurance alongside the rest of your training','Finish with enough reserve for your other sport.'],
 warmSkills:['Starting and shifting','Learn basic riding skills at an easy effort','Practise starting and changing gears on quiet ground or a stationary bike.'],
 evenPacing:['Even-effort ride','Build a feel for repeatable aerobic pacing','Keep breathing similar from the first main segment to the last.'],
 longPacing:['Long ride with pacing checks','Hold a repeatable effort over changing terrain','Stay comfortable on the flats and ease back on hills.'],
 fondoFuel:['Gran Fondo endurance rehearsal','Practise fuelling and pacing for a long event','Use familiar food and equipment. Record what was easy to carry and tolerate.'],
 gravelSteady:['Gravel terrain transitions','Keep effort steady as the surface changes','Choose familiar sections of loose and firm ground. Ease off on technical sections.'],
 climbingEndurance:['Rolling climbing endurance','Practise controlling aerobic effort on gradients','Shift early and use an easier gear before the steepest part.'],
 trainerControl:['Indoor position and pacing','Improve aerobic pacing on a trainer','Alternate hand positions when comfortable and keep the effort even.'],
 triEasy:['Triathlon pacing rehearsal','Practise an even ride that preserves running reserve','Use your event setup if familiar. There is no extra running in this session.'],
 tempoIntro:['Introductory tempo','Learn the difference between conversational and steady work','Hold a controlled effort you can repeat without straining.',8,4,2,'steady',3],
 tempoCruise:['Long tempo blocks','Develop sustained work below threshold','Settle into each block and aim for even effort.',10,9,2,'steady',4],
 tempoRise:['Tempo staircase','Practise lifting effort gradually','Settle at each new effort before increasing it.',10,[[3,'aerobic'],[4,'steady'],[3,'sweet']],2,null,4],
 sweetLong:['Extended sweet spot','Build repeatable near-threshold work with a reset','Use a flat route or trainer and keep each block controlled.',12,10,2,'sweet',4],
 sweetDensity:['Short-rest sweet spot','Practise steady work with less rest between efforts','Back off if the early efforts stop feeling repeatable.',12,5,4,'sweet',2],
 thresholdCruise:['Long threshold repeats','Accumulate sustained work for longer racing efforts','Choose a safe uninterrupted stretch and pace the first repeat carefully.',14,9,2,'threshold',5],
 thresholdLadder:['Threshold ladder','Practise adjusting to changing work duration','Keep the target consistent as duration changes.',12,[[3,'threshold'],[2,'easy','recovery'],[5,'threshold'],[3,'easy','recovery'],[7,'threshold']],1,null,0],
 thresholdFloat:['Threshold with aerobic floats','Practise easing off between threshold efforts while still pedalling','Use the float to regain control before lifting the effort.',12,[[4,'threshold'],[2,'aerobic','recovery'],[4,'threshold']],2,null,5],
 overunderLong:['Extended over-unders','Settle below threshold after each short increase','Regain steady breathing during each lower segment.',14,[[3,'sweet'],[1,'threshold'],[3,'sweet'],[1,'threshold']],2,null,5],
 vo2Short:['Short aerobic repeats','Introduce high aerobic efforts with ample recovery','Keep the first repeat well within what you can reproduce.',12,2,4,'vo2',3],
 vo2Long:['Long aerobic power efforts','Build repeatable high aerobic work for experienced riders','Ease back if the last effort cannot match the first.',15,4,4,'vo2',4],
 microSets:['Short interval clusters','Practise short repeats with longer resets between groups','Stop the set if efforts are no longer repeatable.',12,[[.5,'vo2'],[.5,'easy','recovery'],[.5,'vo2'],[.5,'easy','recovery'],[.5,'vo2'],[.5,'easy','recovery'],[.5,'vo2']],3,null,4],
 sprintSkill:['Acceleration skills','Practise a few low-volume accelerations with ample recovery','Roll into each acceleration in a controllable gear. Skip it if space is limited.',12,.15,4,'sprint',4],
 sprintRolling:['Rolling starts and recovery','Practise accelerations from a moving start','Stay controlled and wait until fully recovered before the next effort.',15,.2,5,'sprint',4],
 roadSettle:['Race surge and settle','Practise returning to tempo after an acceleration','Focus on settling quickly after each controlled surge.',12,[[.5,'anaerobic'],[4,'steady']],3,null,5],
 roadFinish:['Late-race changes of pace','Practise pace changes after endurance riding','Rehearse the changes on safe roads or indoors.',18,[[4,'aerobic'],[1,'vo2'],[2,'sweet']],3,null,4],
 shortRace:['Repeat race accelerations','Practise separate anaerobic surges with generous recovery','Keep surges repeatable and leave room to ride home easily.',15,.75,4,'anaerobic',5],
 climbSustain:['Sustained climbing blocks','Practise steady effort over a longer climb','Choose a gradient and gear that allow comfortable pedalling.',12,10,2,'sweet',4],
 climbCrest:['Climb and ride over the crest','Practise steady effort through a change of gradient','Avoid a sharp increase in effort on the approach to the crest.',12,[[4,'sweet'],[1,'threshold'],[2,'aerobic']],3,null,4],
 ttPosition:['Time-trial position rehearsal','Practise holding your event position under controlled load','Take short breaks from the position if needed.',10,7,3,'steady',3],
 ttPacing:['Time-trial pacing ladder','Rehearse a controlled start and finishing pace','Start below race effort and lift only while your position stays comfortable.',12,[[6,'steady'],[8,'sweet'],[5,'threshold']],1,null,0],
 triPacing:['Triathlon steady blocks','Practise sustained effort with a reserve for the run','Use event position and take fluids at familiar intervals.',10,10,2,'steady',4],
 cadenceChange:['Cadence transitions','Switch cadence smoothly without changing effort','Use two comfortable cadences and keep resistance light.',8,[[1,'aerobic'],[1,'aerobic']],4,null,1],
 assessment:['Controlled sustained benchmark','Record a repeatable cycling power benchmark','Use a familiar setup and record conditions and effort. Review it before entering an FTP.',12,20,1,'benchmark',0]
};

function target(band,profile,seconds) {
 const range=bands[band];
 if(profile.method==='power'&&range.power)return {kind:'power',lowWatts:Math.round(range.power[0]*profile.ftp/100),
  highWatts:Math.round(range.power[1]*profile.ftp/100),percentFtp:range.power.slice()};
 // Use athlete-confirmed cycling ranges only. HR lags short efforts.
 if(profile.method==='heart_rate'&&seconds>=180&&['easy','aerobic','steady'].includes(band)){
  const zone=profile.hrZones?.[band];
  if(zone)return {kind:'heart_rate',lowBpm:zone[0],highBpm:zone[1]};
 }
 return {kind:'rpe',low:range.rpe[0],high:range.rpe[1]};
}
function ride(kind,mins,profile) {
 const [name,purpose,focus,warm,work,reps,band,rest]=library[kind];
 const make=(intensity,seconds,effort)=>({kind:'step',intensity,duration:{kind:'time',seconds},target:target(effort,profile,seconds)});
 const seconds=mins*60,structuredSteps=[];
 const technique=['cadence','cadenceChange','tempoIntro','ttPosition'].includes(kind);
 const cool=(reps&&!technique?8:5)*60;
 if(reps){
  const specification=Array.isArray(work)?work:band==='over-under'?[[1,'threshold'],[3,'steady']]:[[work,band]];
  const effort=specification.map(([minutes,effortBand,intensity],index)=>{
   const step=make(intensity??(effortBand==='aerobic'?'active':'interval'),Math.round(minutes*60),effortBand);
   if(kind==='cadenceChange')step.description=index===0?'Pedal at your usual comfortable cadence.':'Pedal a little quicker at the same effort.';
   if(kind==='cadence')step.description='Pedal a little quicker without adding resistance.';
   return step;
  });
  const effortSeconds=effort.reduce((sum,step)=>sum+step.duration.seconds,0);
  const needed=warm*60+cool+reps*effortSeconds+(reps-1)*rest*60;
  if(seconds<needed||kind==='assessment'&&!profile.assessment)return null;
  structuredSteps.push(make('warmup',warm*60,'aerobic'));
  const restStep=rest?make('recovery',rest*60,'easy'):null;
  if(reps>2)structuredSteps.push({kind:'repeat',count:reps-1,steps:restStep?[...effort,restStep]:effort});
  else if(reps===2)structuredSteps.push(...effort,...(restStep?[restStep]:[]));
  structuredSteps.push(...effort);
  if(seconds>needed)structuredSteps.push(make('active',seconds-needed,'aerobic'));
  structuredSteps.push(make('cooldown',cool,'easy'));
 }else{
  structuredSteps.push(make('warmup',5*60,'easy'));
  const split={progressive:[10,'steady'],longPacing:[15,'aerobic'],fondoFuel:[20,'aerobic'],
   gravelSteady:[10,'aerobic'],trainerControl:[10,'aerobic'],triEasy:[10,'aerobic']}[kind];
  if(split&&mins>=split[0]+20)structuredSteps.push(make('active',seconds-(split[0]+10)*60,'aerobic'),
   make('active',split[0]*60,split[1]));
  else structuredSteps.push(make('active',seconds-10*60,kind==='recovery'?'easy':'aerobic'));
  structuredSteps.push(make('cooldown',cool,'easy'));
 }
 const totals=workout.totals(structuredSteps,{sport:'Cycling'});
 if(!totals||totals.seconds!==seconds)return null;
 return {sport:'Cycling',kind,name,purpose,focus:focus+(kind==='cadence'&&profile.cadence?' Compare comfort at your normal cadence and slightly above it.':''),
  demanding:!!reps&&!technique&&!['tempo','tempoCruise','triPacing'].includes(kind),plannedMinutes:mins,structuredSteps,method:profile.method,
  equipment:profile.method==='power'?'Power meter or smart trainer':profile.method==='heart_rate'?'Heart-rate monitor for sustained targets':'Perceived effort',
  cyclingPlanVersion:1};
}
function phaseFor(week,weeks,event,weekStart) {
 if(event){
  const days=(Date.parse(event)-Date.parse(weekStart))/86400000;
  if(days<=10)return 'Taper';
  if(days<=20)return 'Peak';
  if(days<=35)return 'Specific preparation';
 }
 if(week>0&&(week+1)%4===0)return 'Recovery';
 return week<2?'Base':week>=Math.ceil(weeks*.6)?'Specific preparation':'Build';
}
// Rotation varies the dose and cue structure while retaining the goal’s demands.
const choices = {
 fitness:['tempo','tempoCruise','sweet','sweetDensity','thresholdLadder'],
 endurance:['tempoCruise','sweetLong','tempoRise','sweetDensity','overunderLong','vo2Short'],
 ftp:['sweet','threshold','vo2','sustained','overunder','micro','sweetDensity','thresholdLadder',
  'thresholdCruise','thresholdFloat','vo2Short','vo2Long','microSets','tempoRise'],
 climbing:['climb','climbSustain','climbCrest','thresholdCruise','vo2Short','sweetLong'],
 distance:['tempo','tempoCruise','sweetLong','tempoRise','climb'],
 fondo:['tempoCruise','climbSustain','climbCrest','overunderLong','sweetLong','sweetDensity'],
 road:['road','roadSettle','micro','vo2','anaerobic','sprint','threshold','roadFinish',
  'microSets','shortRace','sprintSkill','sprintRolling','vo2Long','overunderLong'],
 gravel:['tempoCruise','climb','climbSustain','overunder','roadSettle','thresholdFloat'],
 tt:['ttPosition','tt','sustained','ttPacing','thresholdCruise','thresholdFloat','overunderLong'],
 triathlon:['triPacing','ttPosition','sweetLong','tempoCruise','ttPacing']
};
const specific = {
 climbing:['climbCrest','climbSustain','climb'],fondo:['climbSustain','sweetLong','climbCrest'],
 road:['roadSettle','roadFinish','shortRace','sprintRolling','road'],gravel:['roadSettle','climbSustain','tempoCruise'],
 tt:['ttPacing','tt','sustained','ttPosition'],triathlon:['triPacing','ttPosition','tempoCruise']
};
const advancedOnly=new Set(['anaerobic','sprint','micro','microSets','sprintSkill','sprintRolling',
 'shortRace','roadFinish','roadSettle','vo2Long','thresholdFloat','overunderLong']);
function rideCandidates(profile,{light,highLoad,nearHard,canWork,index,week,mins,phase,eventSoon,levelIndex}){
 const {goal,setting}=profile;
 if(nearHard||profile.returning)return ['recovery'];
 if(light&&phase==='Recovery')return index===0?['endurance']:['recovery','endurance'];
 if(light&&phase==='Taper')return ['endurance','recovery'];
 if(index===0){
  if(levelIndex===0&&week<2)return [week===0?'warmSkills':'evenPacing','endurance'];
  if(goal==='gravel'&&setting!=='indoor')return [week%2?'gravelSteady':'gravel','long'];
  if(goal==='fondo'&&mins>=60)return [week%2?'fondoFuel':'longPacing','long'];
  if(goal==='climbing'&&setting!=='indoor')return ['climbingEndurance','long'];
  if(goal==='triathlon')return [week%2?'triEasy':'brick','endurance'];
  if(highLoad)return [week%2?'brick':'evenPacing','endurance'];
  return [mins>=45?(week%3?'long':'longPacing'):'evenPacing','endurance'];
 }
 if(canWork){
  const group=phase==='Specific preparation'&&specific[goal]&&week%3!==0?specific[goal]:choices[goal];
  const offset=(week+levelIndex)%group.length;
  const rotated=[...group.slice(offset),...group.slice(0,offset)];
  const eligible=rotated.filter(kind=>(levelIndex>=3||!advancedOnly.has(kind))&&
   (!eventSoon||['tempo','tempoCruise','ttPosition','triPacing'].includes(kind)));
  return [...eligible,'tempoIntro','endurance'];
 }
 if(!light&&!highLoad&&!eventSoon&&!['Base','Peak'].includes(phase)&&levelIndex===1&&
  week%3===1&&mins>=25&&profile.weeklyMinutes>=120)return ['tempoIntro','endurance'];
 if(levelIndex===0||!profile.known)return [week%2?'evenPacing':'endurance'];
 if(setting==='indoor')return [week%3?'indoor':'trainerControl'];
 if(highLoad||eventSoon)return ['endurance'];
 return [(['cadence','cadenceChange','evenPacing','progressive'])[(week+index-1)%4],'endurance'];
}
function validateAthlete({weeklyMinutes,longestMinutes,ftp,lthr,maxHr,hrZones,unwell}) {
 const errors=[];
 if((weeklyMinutes!=null&&!absolute(weeklyMinutes,15,2400))||(longestMinutes!=null&&!absolute(longestMinutes,10,720)))
  errors.push('Check your current weekly minutes and recent longest ride.');
 if(ftp!=null&&!validFtp(ftp))errors.push('Enter an FTP from 50 to 600 W, or leave it blank.');
 if([lthr,maxHr].some(value=>value!=null&&(!Number.isInteger(value)||!absolute(value,60,250)))||(lthr&&maxHr&&lthr>=maxHr))
  errors.push('Check cycling threshold and maximum heart rate.');
 const sortedZones=Object.values(hrZones||{}).filter(Array.isArray).sort((a,b)=>a[0]-b[0]);
 if(sortedZones.length!==Object.keys(hrZones||{}).length||sortedZones.some((zone,index)=>
   zone.length!==2||zone.some(value=>!Number.isInteger(value)||!absolute(value,40,250))||zone[0]>zone[1]||
   (maxHr&&zone[1]>maxHr)||(lthr&&zone[1]>lthr)||(index>0&&sortedZones[index-1][1]>=zone[0])))
  errors.push('Check your cycling heart-rate ranges for completeness and overlap.');
 if(unwell)errors.push('Pause programming while injured, unwell or experiencing concerning symptoms.');
 return errors;
}
function validate(config) {
 const {start,weeks,goal,level,available,daysLimit,longDay,eventDate,distanceKm,elevation}=config;
 const errors=validateAthlete(config);
 if(!iso(start)||!Number.isInteger(weeks)||weeks<1||weeks>32)errors.push('Choose a valid start and 1–32 weeks.');
 if(!Object.hasOwn(goals,goal)||!levels.includes(level))errors.push('Choose a cycling goal and experience.');
 if(!Array.isArray(available)||!available.length||available.some(day=>!Number.isInteger(day)||day<0||day>6)||
    !available.includes(longDay)||!Number.isInteger(daysLimit)||daysLimit<1||daysLimit>available.length||
    available.some(day=>!Number.isInteger(config.dayMinutes?.[day])||!absolute(config.dayMinutes[day],15,480)))
  errors.push('Choose available days, a preferred long ride day and limits of 15–480 minutes.');
 if(eventDate&&(!iso(eventDate)||eventDate<=start)||distanceKm!=null&&!absolute(distanceKm,1,1000)||elevation!=null&&!absolute(elevation,0,20000))
  errors.push('Check the event date, distance and elevation.');
 if(!['indoor','outdoor','mixed'].includes(config.setting)||!surfaces.includes(config.surface))errors.push('Choose a riding setting and bike type.');
 return errors;
}
function generate(config={}) {
 if(!config||typeof config!=='object')return {ok:false,errors:['Choose valid cycling inputs.']};
 const errors=validate(config);
 if(errors.length)return {ok:false,errors};
 const {start,weeks,goal,level,eventDate,priority,available,longDay,dayMinutes,daysLimit}=config;
 const cautions=new Set(),levelIndex=levels.indexOf(level);
 const commitments=(Array.isArray(config.commitments)?config.commitments:[]).filter(x=>x&&iso(x.date));
 const hard=commitments.filter(x=>x.hard||x.lowerBody);
 const returning=config.interrupted||config.recovery==='poor', known=config.weeklyMinutes!=null;
 const reliablePower=(config.powerMeter||config.smartTrainer)&&validFtp(config.ftp)&&['manual','imported'].includes(config.ftpSource)&&config.ftpConfidence!=='low'&&
  (!config.ftpDate||iso(config.ftpDate)&&config.ftpDate<=start&&separation(start,config.ftpDate)<=180);
 const method=reliablePower?'power':config.hrMonitor&&config.hrZones?.aerobic?'heart_rate':'rpe';
 const profile={...config,method,known,returning,assessment:config.assessment&&(config.powerMeter||config.smartTrainer)&&levelIndex>=2&&!returning&&known&&config.recovery==='normal'};
 let baseline=Math.floor(config.weeklyMinutes??Math.min(75,daysLimit*25));
 if(!known)cautions.add('Weekly cycling capacity is unconfirmed. Start with short, conversational rides and review tolerance before progressing.');
 if(returning){baseline=Math.min(90,Math.floor(baseline*.65));cautions.add('Recent interruption or poor recovery favours a lighter block. Review how you feel before progressing.');}
 if(config.assessment&&!profile.assessment)cautions.add('The optional benchmark needs established training, normal recovery and a power meter or smart trainer.');
 if(eventDate&&separation(eventDate,start)<28)cautions.add('Preparation time is short. Review event feasibility before committing.');
 if((config.distanceKm>=100||config.elevation>=1600)&&((config.longestMinutes??0)<120||dayMinutes[longDay]<120))
  cautions.add('Long or hilly event demands exceed the confirmed endurance preparation. Review the course, time available and event goal.');
 if(method!=='power'&&(config.powerMeter||config.smartTrainer))cautions.add('Power targets require a valid cycling FTP. You can start without one.');
 if(config.setting==='indoor'&&['gravel','road','climbing'].includes(goal))cautions.add('Indoor sessions cover effort demands. Practise handling and terrain separately when conditions allow.');
 let load=Math.max(15,baseline), lastLong=Math.max(15,Math.min(config.longestMinutes??30,dayMinutes[longDay]));
 let previousHard=null, usedBenchmark=false, demandingCount=0;
 const result=[];
 for(let week=0;week<weeks;week++){
  const first=add(start,week*7), last=add(first,6);
  if(eventDate&&first>=eventDate)break;
  const weekPhase=phaseFor(week,weeks,eventDate,first);
  const busy=commitments.filter(item=>item.date>=first&&item.date<=last);
  const otherMinutes=busy.reduce((n,item)=>n+(absolute(item.minutes,0,1440)?item.minutes:0),0);
  const highLoad=otherMinutes>=load||priority&&priority!=='Cycling';
  const days=Array.from({length:7},(_,i)=>add(first,i)).filter(d=>available.includes(dayOf(d))&&(!eventDate||d<eventDate));
  const nearHard=date=>hard.some(item=>separation(item.date,date)<=1);
  const caps=new Map(days.map(date=>[date,Math.min(nearHard(date)?30:480,Math.max(0,dayMinutes[dayOf(date)]-busy.filter(x=>x.date===date)
   .reduce((sum,x)=>sum+(absolute(x.minutes,0,1440)?Math.ceil(x.minutes):0),0)))]));
  const selected=days.filter(date=>caps.get(date)>=15).sort((a,b)=>
   Number(nearHard(a))-Number(nearHard(b))||
   Number(dayOf(b)===longDay)-Number(dayOf(a)===longDay)||
   caps.get(b)-caps.get(a)||a.localeCompare(b)).slice(0,daysLimit);
  const longDate=selected[0];
  const light=weekPhase==='Recovery'||weekPhase==='Taper'||returning||!known;
  const phaseScale=weekPhase==='Taper'?.58:weekPhase==='Recovery'?.72:weekPhase==='Peak'?.85:1;
  const scale=otherMinutes>=load?Math.min(.8,phaseScale):phaseScale;
  const budget=Math.min(Math.floor(load*scale),selected.reduce((sum,d)=>sum+caps.get(d),0));
  let remaining=budget;
  const sessions=[];
  for(const [index,date] of selected.entries()){
   const slots=selected.length-index;
   if(remaining<15)break;
   const durationCap=index===0?Math.min(lastLong+(light?0:8),caps.get(date)):caps.get(date);
   const longShare=!light&&weekPhase==='Specific preparation'&&(config.distanceKm>=80||config.elevation>=1200)?.52:.44;
   const nominal=slots===1?remaining:index===0?Math.max(Math.floor(budget*longShare),Math.floor(remaining/slots)):Math.floor(remaining/slots);
   const mins=Math.min(remaining,durationCap,Math.max(15,nominal));
   const closeToHard=nearHard(date);
   const eventSoon=eventDate&&separation(eventDate,date)<=11;
   const canWork=!light&&!highLoad&&levelIndex>=2&&index>0&&!['Base','Peak'].includes(weekPhase)&&
    !closeToHard&&separation(longDate,date)>=2&&(!previousHard||separation(previousHard,date)>=2)&&
    !sessions.some(session=>session.demanding||session.structuredSteps.some(step=>step.intensity==='interval'));
   const candidates=rideCandidates(profile,{light,highLoad,nearHard:closeToHard,canWork,index,week,mins,phase:weekPhase,eventSoon,levelIndex});
   if(canWork&&profile.assessment&&!usedBenchmark&&weekPhase==='Build')candidates.unshift('assessment');
   const planned=candidates.reduce((session,kind)=>session??ride(kind,mins,profile),null);
   if(!planned)continue;
   const setting=config.setting==='mixed'?(index===0?'outdoor':profile.smartTrainer?'indoor':'outdoor'):config.setting;
   if(planned.kind==='assessment')usedBenchmark=true;
   if(planned.demanding){previousHard=date;demandingCount++;}
   sessions.push({...planned,date,phase:weekPhase,week:week+1,setting,surface:config.surface});
   remaining-=mins;
  }
  const total=sessions.reduce((n,item)=>n+item.plannedMinutes,0);
  if(total<budget||selected.length<daysLimit||selected.some(nearHard))cautions.add('Available time or other sessions limit the scheduled cycling volume.');
  if(sessions.length)result.push({week:week+1,phase:weekPhase,plannedMinutes:total,sessions:sessions.sort((a,b)=>a.date.localeCompare(b.date))});
  if(!light&&!highLoad&&weekPhase!=='Peak'&&total>=.9*load){
   const increment=Math.min(12,Math.floor(load*.06),Math.max(0,total+Math.min(12,Math.floor(total*.08))-load));
   load+=increment;
   const longest=sessions.find(item=>item.date===longDate&&!nearHard(item.date));
   if(longest)lastLong=Math.max(lastLong,longest.plannedMinutes);
  }
 }
 if(!result.length)return {ok:false,errors:['There is insufficient available time before the event or around existing commitments.']};
 if(profile.assessment&&!usedBenchmark)cautions.add('No suitable benchmark slot fits the current dates and time limits.');
 return {ok:true,weeks:result,baseline,method,demandingCount,warnings:[...cautions]};
}
const api={levels,goals,library,ride,powerZone,powerZones,validFtp,validateAthlete,generate,add,dayOf,iso};
root.mileCyclingPlan=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
