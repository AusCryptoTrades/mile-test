const {test,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const cycling=require('../mile-cycling-plan.js');
const structured=require('../mile-running-workout.js');
const iq=require('../mile-cycling-iq.js');
const {base,profiles}=require('./fixtures/batch90-cyclists.cjs');

function verify(result,config){
 const sessions=result.weeks.flatMap(week=>week.sessions);
 const demanding=sessions.filter(session=>session.demanding);
 assert.equal(new Set(sessions.map(s=>s.date)).size,sessions.length);
 assert.equal(result.demandingCount,demanding.length);
 for(const [i,week] of result.weeks.entries()){
  assert.ok(week.sessions.length<=config.daysLimit);
  assert.ok(week.sessions.filter(s=>s.demanding).length<=1);
  assert.equal(week.sessions.reduce((n,s)=>n+s.plannedMinutes,0),week.plannedMinutes);
  if(['Taper','Recovery','Base'].includes(week.phase)||config.interrupted||config.level==='beginner'||config.recovery==='poor'||config.priority!=='Cycling')
   assert.ok(week.sessions.every(s=>!s.demanding));
  if(i&&result.weeks[i-1].phase==='Taper')assert.equal(week.phase,'Taper');
 }
 for(const session of sessions){
  const day=cycling.dayOf(session.date);
  assert.ok(config.available.includes(day));
  assert.ok(session.plannedMinutes<=config.dayMinutes[day]);
  assert.ok(session.structuredSteps.length>0);
  assert.deepEqual(structured.totals(session.structuredSteps,{sport:'Cycling'}),{meters:0,seconds:session.plannedMinutes*60,allDistance:false,allTime:true});
  if(config.eventDate)assert.ok(session.date<config.eventDate);
  if(session.demanding){
   assert.ok(!(config.commitments||[]).some(w=>(w.hard||w.lowerBody)&&Math.abs(Date.parse(w.date)-Date.parse(session.date))<=86400000));
   assert.ok(!demanding.some(w=>w!==session&&Math.abs(Date.parse(w.date)-Date.parse(session.date))<=86400000));
  }
 }
}

test('cycling power zones use exact integer watt boundaries and preserve Running validation',()=>{
 for(const ftp of [50,137,200,257,600]){
  const zones=cycling.powerZones(ftp);
  expect(zones).toHaveLength(7);
  for(const zone of zones){
   expect(cycling.powerZone(zone.lowWatts,ftp)).toBe(zone.zone);
   if(zone.highWatts!==null){
    expect(cycling.powerZone(zone.highWatts,ftp)).toBe(zone.zone);
    expect(cycling.powerZone(zone.highWatts+1,ftp)).toBe(zone.zone+1);
   }
  }
 }
 const power={kind:'step',intensity:'interval',duration:{kind:'time',seconds:60},target:{kind:'power',lowWatts:195,highWatts:210}};
 expect(structured.expand([power])).toBeNull();
 expect(structured.totals([power],{sport:'Cycling'}).seconds).toBe(60);
 expect(cycling.powerZones(null)).toEqual([]);
});

test('34 materially different cyclist profiles and 1,088 boundary scenarios preserve schedule and arithmetic',({})=>{
 test.setTimeout(120000);
 expect(profiles).toHaveLength(34);
 let scenarios=0,accepted=0,rejected=0;
 const kinds=new Set();
 for(const {name,config} of profiles){
  const result=cycling.generate(config);
  if(/conflicting threshold|injury pauses/i.test(name))expect(result.ok,name).toBe(false);
  else {
   expect(result.ok,name).toBe(true);
   verify(result,config);
  }
  for(let variation=0;variation<32;variation++){
   const candidate={...config,weeks:1+variation%12,
    dayMinutes:Object.fromEntries(Object.entries(config.dayMinutes).map(([day,c])=>[day,c+(variation%4)*11])),
    weeklyMinutes:config.weeklyMinutes==null?null:config.weeklyMinutes+variation%8*5};
   if(variation%11===10)candidate.available=[];
   if(variation%13===12)candidate.ftp=2000;
   const generated=cycling.generate(candidate);
   scenarios++;
   if(!generated.ok){rejected++;expect(generated.errors.length).toBeGreaterThan(0);continue;}
   accepted++;
   verify(generated,candidate);
   for(const w of generated.weeks)for(const s of w.sessions)kinds.add(s.kind);
  }
 }
 expect(scenarios).toBe(1088);
 expect(accepted).toBeGreaterThan(800);
 expect(rejected).toBeGreaterThan(100);
 expect(kinds.size).toBeGreaterThanOrEqual(12);
});

test('load, recovery, event and sensor gates change planning without assigning estimates to FTP',()=>{
 const trained=cycling.generate({...base,level:'advanced',goal:'ftp',weeks:12});
 expect(trained.method).toBe('power');
 expect(trained.demandingCount).toBeGreaterThan(0);
 expect(trained.weeks.filter(x=>x.phase==='Recovery').every(w=>w.plannedMinutes<trained.baseline)).toBe(true);
 const hr=cycling.generate({...base,ftp:null,powerMeter:false,hrMonitor:true,hrZones:{aerobic:[112,137]},goal:'ftp'});
 expect(hr.method).toBe('heart_rate');
 const steps=hr.weeks.flatMap(w=>w.sessions.flatMap(s=>structured.expand(s.structuredSteps,{sport:'Cycling'})));
 expect(steps.some(s=>s.target.kind==='heart_rate')).toBe(true);
 expect(steps.filter(s=>s.duration.seconds<180).every(s=>s.target.kind!=='heart_rate')).toBe(true);
 expect(cycling.generate({...base,ftpConfidence:'low'}).method).toBe('rpe');
 expect(cycling.generate({...base,ftpDate:'2025-11-23'}).method).toBe('rpe');
 expect(cycling.generate({...base,eventDate:'2026-11-24',available:[5],longDay:5,daysLimit:1}).ok).toBe(false);
 expect(cycling.generate({...base,start:'2026-02-30'}).ok).toBe(false);
});

const recording=(seconds,watts=200)=>Array.from({length:seconds+1},(_,t)=>({t,watts,bpm:125,cadence:90}));
const ride={id:'explicit-id',date:'2026-11-30',activeSeconds:3600,setting:'indoor',steady:true};
const ftp={date:'2026-11-01',watts:250,source:'manual',confidence:'moderate'};
test('NP uses a full 30 second fourth-power rolling mean, with power-based IF and stress',()=>{
 const samples=recording(3600);
 const power=iq.analyse(ride,{samples,ftpHistory:[ftp,{...ftp,date:'2026-12-01',watts:300}]});
 expect(power.normalizedPower).toBeCloseTo(200,8);
 expect(power.intensityFactor).toBeCloseTo(.8,8);
 expect(power.stress).toBeCloseTo(64,8);
 expect(power.variabilityIndex).toBeCloseTo(1,8);
 expect(power.drift).toBeCloseTo(0,8);
 expect(power.powerZones).toEqual({3:3600});
 const varying=[...Array(150).fill(100),...Array(150).fill(300)];
 const powers=varying.map(watts=>({watts,paused:false}));
 const expected=(varying.slice(29).reduce((sum,_,i)=>sum+(varying.slice(i,i+30).reduce((a,b)=>a+b,0)/30)**4,0)/271)**.25;
 expect(iq.rollingPower(powers)).toBeCloseTo(expected,8);
});

test('dropout, pauses, irregular sampling and coasting stay distinct',()=>{
 const source=recording(600).filter(x=>x.t%2===0);
 source[2].watts=0;
 const seconds=iq.perSecond(source);
 expect(seconds[4].watts).toBe(0);
 expect(seconds[5].watts).toBe(0);
 expect(iq.analyse({...ride,activeSeconds:600},{samples:source,ftpHistory:[ftp]}).stress).not.toBeNull();
 const bad=recording(600).filter(x=>x.t<100||x.t>500);
 const metrics=iq.analyse({...ride,averageWatts:150,activeSeconds:600},{samples:bad,ftpHistory:[ftp]});
 expect(metrics.averagePower).toBe(150);
 expect(metrics.averagePowerSource).toBe('provider summary');
 expect(metrics.normalizedPower).toBeNull();
 expect(metrics.stress).toBeNull();
 expect(metrics.drift).toBeNull();
 const paused=recording(3600);
 for(let t=1600;t<1710;t++)paused[t].paused=true;
 expect(iq.analyse(ride,{samples:paused,ftpHistory:[ftp]}).drift).toBeNull();
 expect(iq.analyse(ride,{samples:recording(90),ftpHistory:[ftp]}).normalizedPower).toBeNull();
 expect(iq.analyse({...ride,activeSeconds:3700},{samples:recording(3600),ftpHistory:[]}).stress).toBeNull();
});

test('cycling IQ requires an explicit unique link and leaves the plan read-only',()=>{
 const planned={id:'next',sport:'Cycling',name:'Threshold',date:'2026-12-01',status:'planned',plannedMinutes:45,demanding:true,cyclingPlanVersion:1};
 const previous={...planned,id:'old',date:ride.date,matchId:ride.id,structuredSteps:[{kind:'step',intensity:'active',duration:{kind:'time',seconds:2700}}],detail:'a',structuredDetail:'a',status:'done'};
 const checkins={'2026-11-29':{fatigue:7},'2026-11-30':{fatigue:8}};
 const frozen=JSON.stringify([planned,previous,checkins]);
 expect(iq.analyse(ride,{workouts:[planned],checkins}).comparison).toContain('Unplanned ride');
 expect(iq.analyse(ride,{workouts:[previous,{...previous,id:'duplicate'}]}).linked).toBeNull();
 const result=iq.analyse(ride,{workouts:[previous,planned],checkins});
 expect(result.comparison).toBe('Recorded 60 min against 45 min planned.');
 expect(result.next).toEqual(planned);
 expect(result.intervals).toBeNull();
 expect(JSON.stringify([planned,previous,checkins])).toBe(frozen);
});

test('8, 12, 16 and 24-week blocks preserve coaching limits through the final session',()=>{
 const valid=profiles.filter(({config})=>!config.unwell&&!(config.lthr>=config.maxHr&&config.maxHr));
 const durations=[8,12,16,24];
 const checked=new Set();
 for(const {name,config} of valid)for(const weeks of durations){
  // Keep each scenario's course and event demands. Fixed-duration blocks
  // set race day after the final planned week, including a full taper.
  const programme={...config,weeks,eventDate:config.eventDate?cycling.add(config.start,weeks*7):undefined};
  const result=cycling.generate(programme);
  assert.equal(result.ok,true,name);
  assert.equal(result.weeks.length,weeks,name);
  verify(result,programme);
  checked.add(name+weeks);
  const novel=new Set();
  let previousLoadingWeek=null;
  for(const week of result.weeks){
   const light=['Recovery','Taper','Peak','Base'].includes(week.phase);
   let demanding=0;
   let hardSeconds=0;
   for(const session of week.sessions){
    novel.add(session.kind);
    const expanded=structured.expand(session.structuredSteps,{sport:'Cycling'});
    const first=expanded[0],last=expanded.at(-1);
    assert.equal(first.intensity,'warmup');
    assert.equal(last.intensity,'cooldown');
    assert.ok(first.duration.seconds>=300&&last.duration.seconds>=300);
    if(session.demanding){
     demanding++;
     assert.ok(first.duration.seconds>=8*60&&last.duration.seconds>=8*60,session.kind);
     hardSeconds+=expanded.filter(step=>step.intensity==='interval').reduce((sum,step)=>sum+step.duration.seconds,0);
    }
    if(session.kind==='assessment')assert.ok(config.assessment&&config.recovery==='normal');
    for(const commitment of config.commitments){
     if(Math.abs(Date.parse(commitment.date)-Date.parse(session.date))<=86400000&&(commitment.hard||commitment.lowerBody)){
      assert.equal(session.kind,'recovery',name);
      assert.ok(session.plannedMinutes<=30,name);
     }
    }
    if(programme.eventDate&&session.date>=cycling.add(programme.eventDate,-10))assert.ok(!session.demanding,name);
   }
   assert.ok(demanding<=1,name);
   assert.ok(hardSeconds<=.40*week.plannedMinutes*60,name);
   if(light)assert.equal(demanding,0,name);
   if(['Recovery','Taper'].includes(week.phase)&&previousLoadingWeek&&config.commitments.length===0)
    assert.ok(week.plannedMinutes<=previousLoadingWeek.plannedMinutes,name);
   if(['Build','Specific preparation','Base'].includes(week.phase)&&config.commitments.length===0){
    if(previousLoadingWeek)assert.ok(week.plannedMinutes<=previousLoadingWeek.plannedMinutes+12,name);
    previousLoadingWeek=week;
   }
  }
  if(programme.eventDate)assert.equal(result.weeks.at(-1).phase,'Taper',name);
  if(config.weeklyMinutes>=100&&!config.interrupted&&config.recovery!=='poor')assert.ok(novel.size>=2,name);
 }
 expect(checked.size).toBe(128);
});

test('52 named library prescriptions are timed and use purpose-led differences',()=>{
 const patterns=new Set();
 for(const [kind,recipe] of Object.entries(cycling.library)){
  const workout=cycling.ride(kind,90,{method:'rpe',assessment:true});
  assert.ok(workout,kind);
  assert.ok(recipe[1].length>10&&recipe[2].length>10,kind);
  const expanded=structured.expand(workout.structuredSteps,{sport:'Cycling'});
  assert.equal(expanded.reduce((sum,step)=>sum+step.duration.seconds,0),5400,kind);
  patterns.add(JSON.stringify(expanded));
 }
 expect(Object.keys(cycling.library)).toHaveLength(52);
 expect(patterns.size).toBeGreaterThanOrEqual(39);
 const newcomer=cycling.generate(profiles[0].config);
 const main=newcomer.weeks[0].sessions.flatMap(ride=>ride.structuredSteps.filter(step=>step.intensity==='active'));
 expect(main.every(step=>step.target.kind==='rpe'&&step.target.low===2&&step.target.high===4)).toBe(true);
 const returner=cycling.generate({...profiles[0].config,interrupted:true});
 expect(returner.weeks[0].sessions.every(ride=>ride.kind==='recovery')).toBe(true);
});

function cueFixture(kind='power'){
 const target=kind==='power'?{kind:'power',lowWatts:185,highWatts:215}:{kind:'heart_rate',lowBpm:120,highBpm:140};
 const step=(intensity,seconds)=>({kind:'step',intensity,duration:{kind:'time',seconds},target});
 const workout={id:'cue-fixture',sport:'Cycling',matchId:ride.id,cyclingPlanVersion:1,revision:1,
  detail:'canonical',structuredDetail:'canonical',structuredSteps:[step('warmup',90),
   {kind:'repeat',count:2,steps:[step('interval',120),step('recovery',30)]},
   step('interval',120),step('cooldown',60)]};
 workout.cyclingMatchPrescription=iq.matchPrescription(workout,ride.id);
 return workout;
}

test('cycling cue windows retain zero watts, skip explicit pauses and label incomplete efforts',()=>{
 const planned=cueFixture(),start=1794985200;
 const samples=recording(370).map(({t,...row})=>({...row,t:start+t}));
 for(let i=150;i<180;i++)samples[i].paused=true;
 for(let i=95;i<100;i++)samples[i].watts=0;
 for(let i=350;i<370;i++)samples[i].watts=null;
 const activity={...ride,startSeconds:start,activeSeconds:340,elapsedSeconds:370};
 const result=iq.analyse(activity,{samples,workouts:[planned]});
 expect(result.intervals.map(cue=>cue.recorded)).toEqual([120,100,0]);
 expect(result.intervals[0].observed.coasting).toBe(5);
 expect(result.intervals[0].observed.inRange).toBeLessThan(1);
 expect(result.intervals[1].observed).toBeNull();
 expect(result.measured).toHaveLength(1);
 const unknown=samples.map(({paused,...sample})=>sample);
 expect(iq.analyse(activity,{samples:unknown,workouts:[planned]}).intervals).toBeNull();
 expect(iq.analyse({...activity,startSeconds:start-30},{samples,workouts:[planned]}).intervals).toBeNull();
 expect(iq.analyse(activity,{samples,workouts:[planned,{...planned,id:'clone'}]}).intervals).toBeNull();
 expect(iq.analyse(activity,{samples,workouts:[{...planned,revision:2}]}).intervals).toBeNull();
 expect(iq.analyse(activity,{samples,workouts:[{...planned,structuredDetail:'edited'}]}).intervals).toBeNull();
});

test('heart rate cue analysis excludes the first minute and suppresses low coverage',()=>{
 const planned=cueFixture('heart_rate'),start=1794985200;
 const samples=recording(570).map(({t,...row})=>({...row,t:start+t,
  bpm:t<150?95:t>=300&&t<365?null:132}));
 const result=iq.analyse({...ride,startSeconds:start,activeSeconds:570,elapsedSeconds:570},{samples,workouts:[planned]});
 expect(result.intervals[0].observed).toMatchObject({average:132,inRange:1});
 expect(result.intervals[1].observed).toBeNull();
 expect(result.intervals[2].observed.average).toBe(132);
});
