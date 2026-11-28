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
 const cool=5*60;
 if(reps){
  const needed=warm*60+cool+(work+rest)*60*reps-rest*60;
  if(seconds<needed)return null;
  if(kind==='assessment'&&!profile.assessment)return null;
  structuredSteps.push(make('warmup',warm*60,'aerobic'));
  const restStep=rest?make('recovery',rest*60,'easy'):null;
  const effort=band==='over-under'?[make('interval',60,'threshold'),make('interval',180,'steady')]:[make('interval',Math.round(work*60),band)];
  if(reps>2)structuredSteps.push({kind:'repeat',count:reps-1,steps:[...effort,restStep]});
  else if(reps===2)structuredSteps.push(...effort,restStep);
  structuredSteps.push(...effort);
  if(seconds>needed)structuredSteps.push(make('active',seconds-needed,'aerobic'));
  structuredSteps.push(make('cooldown',cool,'easy'));
 }else{
  structuredSteps.push(make('warmup',5*60,'easy'));
  if(kind==='progressive'&&mins>=30)structuredSteps.push(make('active',seconds-20*60,'aerobic'),make('active',10*60,'steady'));
  else structuredSteps.push(make('active',seconds-10*60,kind==='recovery'?'easy':'aerobic'));
  structuredSteps.push(make('cooldown',cool,'easy'));
 }
 const totals=workout.totals(structuredSteps,{sport:'Cycling'});
 if(!totals||totals.seconds!==seconds)return null;
 return {sport:'Cycling',kind,name,purpose,focus:focus+(kind==='cadence'&&profile.cadence?' Compare comfort at your normal cadence and slightly above it.':''),
  demanding:!!reps&&!['cadence','tempo'].includes(kind),plannedMinutes:mins,structuredSteps,method:profile.method,
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
const choices = {
 fitness:['tempo','sweet','threshold'],endurance:['tempo','sweet','overunder'],
 ftp:['sweet','threshold','vo2','sustained','overunder','micro'],climbing:['climb','threshold','vo2'],
 distance:['tempo','sweet','climb'],fondo:['tempo','climb','overunder','sweet'],
 road:['road','micro','vo2','anaerobic','sprint','threshold'],gravel:['tempo','climb','overunder','road'],
 tt:['tt','sustained','threshold','overunder'],triathlon:['tempo','sweet','tt']
};
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
 const profile={...config,method,assessment:config.assessment&&(config.powerMeter||config.smartTrainer)&&levelIndex>=2&&!returning&&known&&config.recovery==='normal'};
 let baseline=Math.floor(config.weeklyMinutes??Math.min(75,daysLimit*25));
 if(!known)cautions.add('Weekly cycling capacity is unconfirmed. Start with short, easy sessions and review tolerance before progressing.');
 if(returning){baseline=Math.min(90,Math.floor(baseline*.65));cautions.add('Recent interruption or poor recovery favours a lighter, easy block.');}
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
  const caps=new Map(days.map(date=>[date,Math.min(hard.some(item=>item.date===date)?30:480,Math.max(0,dayMinutes[dayOf(date)]-busy.filter(x=>x.date===date)
   .reduce((sum,x)=>sum+(absolute(x.minutes,0,1440)?Math.ceil(x.minutes):0),0)))]));
  const selected=days.filter(date=>caps.get(date)>=15).sort((a,b)=>
   Number(dayOf(b)===longDay)-Number(dayOf(a)===longDay)||
   Number(hard.some(w=>separation(w.date,a)<=1))-Number(hard.some(w=>separation(w.date,b)<=1))||
   caps.get(b)-caps.get(a)||a.localeCompare(b)).slice(0,daysLimit);
  const longDate=selected[0];
  const light=weekPhase==='Recovery'||weekPhase==='Taper'||returning||!known;
  const scale=weekPhase==='Taper'?.58:weekPhase==='Recovery'?.72:weekPhase==='Peak'?.85:1;
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
   let kind=light||hard.some(item=>item.date===date)?'recovery':index===0?
    (goal==='gravel'?'gravel':goal==='triathlon'||highLoad?'brick':mins>=45?'long':'endurance'):
    (config.setting==='indoor'?'indoor':week%3===1?'cadence':week%3===2?'progressive':'endurance');
   const eligible=!light&&!highLoad&&levelIndex>=2&&index>0&&weekPhase!=='Base'&&
    !hard.some(item=>separation(item.date,date)<=1)&&separation(longDate,date)>=2&&
    (!previousHard||separation(previousHard,date)>=2)&&!sessions.some(session=>session.demanding);
   if(eligible){
    const pool=choices[goal];
    kind=profile.assessment&&!usedBenchmark&&weekPhase==='Build'&&mins>=37?'assessment':pool[(week+levelIndex)%pool.length];
    if(levelIndex<3&&['anaerobic','sprint','micro'].includes(kind))kind='tempo';
   }
   const planned=ride(kind,mins,profile)||ride('endurance',mins,profile);
   const setting=config.setting==='mixed'?(index===0?'outdoor':profile.smartTrainer?'indoor':'outdoor'):config.setting;
   if(planned.kind==='assessment')usedBenchmark=true;
   if(planned.demanding){previousHard=date;demandingCount++;}
   sessions.push({...planned,date,phase:weekPhase,week:week+1,setting,surface:config.surface});
   remaining-=mins;
  }
  const total=sessions.reduce((n,item)=>n+item.plannedMinutes,0);
  if(total<budget||selected.length<daysLimit)cautions.add('Available time or other sessions limit the scheduled cycling volume.');
  if(sessions.length)result.push({week:week+1,phase:weekPhase,plannedMinutes:total,sessions:sessions.sort((a,b)=>a.date.localeCompare(b.date))});
  if(!light&&!highLoad&&total>=.9*load){
   load+=Math.min(12,Math.floor(load*.06));
   lastLong=sessions.find(item=>item.date===longDate)?.plannedMinutes??lastLong;
  }
 }
 if(!result.length)return {ok:false,errors:['There is insufficient available time before the event or around existing commitments.']};
 if(profile.assessment&&!usedBenchmark)cautions.add('No suitable benchmark slot fits the current dates and time limits.');
 return {ok:true,weeks:result,baseline,method,demandingCount,warnings:[...cautions]};
}
const api={levels,goals,library,powerZone,powerZones,validFtp,validateAthlete,generate,add,dayOf,iso};
root.mileCyclingPlan=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
