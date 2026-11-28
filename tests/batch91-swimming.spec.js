const {test,expect}=require('@playwright/test');
const swim=require('../mile-swimming-plan');
const workout=require('../mile-running-workout');
const start='2026-12-07';
const base={start,weeks:12,goal:'endurance',level:'advanced',pool:'25m',weeklyMeters:3900,longestMeters:1900,
 continuousMeters:900,available:[0,2,5],sessions:3,dayMinutes:{0:65,2:55,5:80},recovery:'good',
 benchmark:{seconds200:180,seconds400:380,comparable:true}};
test('CSS mathematics, protocol and athlete eligibility are independent of the coaching bands',()=>{
 expect(swim.css(base.benchmark,base)).toEqual({ok:true,secondsPer100m:100});
 for(const update of [{seconds400:360},{comparable:false},{seconds400:490},{seconds200:null}])
  expect(swim.css({...base.benchmark,...update},base).ok).toBe(false);
 for(const update of [{level:'beginner'},{continuousMeters:399}])
  expect(swim.css(base.benchmark,{...base,...update}).ok).toBe(false);
 const plan=swim.generate(base);
 expect(plan.weeks.flatMap(w=>w.sessions).flatMap(s=>s.structuredSteps).some(step=>step.target.kind==='swim_pace')).toBe(true);
 expect(swim.generate({...base,benchmark:null,observedPace:110}).weeks.flatMap(w=>w.sessions)
  .flatMap(s=>s.structuredSteps).every(step=>step.target.kind==='open')).toBe(true);
});

test('swim history deduplicates recorded activities and leaves unavailable windows empty',()=>{
 const result=swim.history([{id:1,date:'2026-12-01',meters:700},{id:'1',date:'2026-12-01',meters:700},
  {id:2,date:'2026-09-20',meters:1100},{id:3,date:'2026-12-10',meters:3000}], '2026-12-06');
 expect(result.map(item=>[item.count,item.meters,item.longestMeters])).toEqual([[1,700,700],[1,700,700],[2,1800,1100],[2,1800,1100]]);
 expect(swim.history([], '2026-12-06').every(item=>item.meters===null)).toBe(true);
});

test('53 library recipes retain different work structures, rest and pool lengths',()=>{
 expect(swim.library.length).toBeGreaterThanOrEqual(50);
 expect(new Set(swim.library.map(s=>s.id)).size).toBe(swim.library.length);
 const actual=new Set(swim.library.map(s=>JSON.stringify([s.family,s.blocks])));
 expect(actual.size).toBe(swim.library.length);
 for(const pool of Object.values(swim.pools)){
  for(const recipe of swim.library){
   const s=swim.compile(recipe,pool,{secondsPer100m:101});
   const totals=workout.totals(s.structuredSteps,{sport:'Swimming'});
   expect(totals.meters).toBeCloseTo(s.meters,2);
   expect(s.estimatedSeconds).toBeGreaterThan(totals.seconds);
   for(const step of s.structuredSteps)if(step.duration.kind==='distance')
    expect(step.duration.meters/pool).toBeCloseTo(Math.round(step.duration.meters/pool),4);
  }
 }
 const s=swim.compile(swim.library[0],25,{secondsPer100m:100});
 expect(workout.expand(s.structuredSteps,{sport:'Cycling'})).toBeNull();
});

test('audits 36 complete 12-week programmes across all goals, experience levels and limits',()=>{
 const used=new Set();let total=0;
 for(const goal of Object.keys(swim.goals))for(const level of ['beginner','intermediate','advanced'])for(let variant=0;variant<2;variant++){
  const profile={...base,goal,level,pool:variant?'25yd':goal==='speed'?'50m':'25m',gear:variant?['fins','buoy','board']:[],
   weeklyMeters:level==='beginner'?1400:variant?6400:3900,longestMeters:level==='beginner'?650:variant?3000:1900,
   continuousMeters:level==='beginner'?75:900,available:variant?[1,3,6]:base.available,sessions:variant?2:3,
   dayMinutes:variant?{1:70,3:65,6:85}:base.dayMinutes,hardDays:variant?[3]:[],
   priority:variant&&goal==='triathlon'?'Running':'Swimming'};
  const label=[goal,level,variant].join('/');
  const plan=swim.generate(profile);
  expect(plan.ok,label).toBe(true);
  expect(plan.weeks.length,label).toBe(12);
  expect(plan).toEqual(swim.generate(profile));
  expect(plan.weeks[0].meters,label).toBeLessThanOrEqual(profile.weeklyMeters+.01);
  for(const [index,week] of plan.weeks.entries()){
   total+=week.sessions.length;
   expect(week.sessions.length,label).toBeLessThanOrEqual(profile.sessions);
   expect(week.meters,label).toBeCloseTo(week.sessions.reduce((sum,item)=>sum+item.meters,0),2);
   if(index){
    const prev=plan.weeks[index-1];
    const limit=week.phase==='Recovery'?prev.meters*.8:prev.phase==='Recovery'?plan.weeks[index-2].meters:
      prev.meters*(variant?1:level==='beginner'?1.04:level==='intermediate'?1.06:1.07);
    expect(week.meters,label).toBeLessThanOrEqual(limit+.02);
   }
   expect(week.sessions.filter(s=>s.demanding).length,label).toBeLessThanOrEqual(1);
   for(const s of week.sessions){
    used.add(s.kind);
    expect(profile.available,label).toContain(s.day);
    expect(s.plannedMinutes,label).toBeLessThanOrEqual(profile.dayMinutes[s.day]);
    expect(s.purpose&&s.focus,label).toBeTruthy();
    expect(workout.totals(s.structuredSteps,{sport:'Swimming'}).meters,label).toBeCloseTo(s.meters,2);
    if(level==='beginner'||profile.priority!=='Swimming'||week.phase==='Recovery'||profile.hardDays.some(day=>[0,1,6].includes((s.day-day+7)%7)))
     expect(s.demanding,label).toBe(false);
    if(!variant)expect(swim.library.find(recipe=>recipe.id===s.kind)?.gear,label).toBeUndefined();
   }
  }
 }
 expect(used.size).toBeGreaterThanOrEqual(34);
 expect(total).toBeGreaterThan(900);
});

test('constrained, returning, fatigued and event athletes keep safety boundaries',()=>{
 const timed=swim.generate({...base,level:'beginner',weeklyMeters:null,longestMeters:null,continuousMeters:0});
 expect(timed.weeks[0].meters).toBeNull();
 const first=timed.weeks[0].sessions[0];
 expect(workout.totals(first.structuredSteps,{sport:'Swimming'}).seconds).toBe(first.estimatedSeconds);
 expect(first.focus).toContain('standing depth');
 const event=swim.generate({...base,goal:'open',eventDate:'2027-01-17',eventMeters:4000});
 expect(event.warnings.join(' ')).toContain('Never train alone');
 expect(event.warnings.join(' ')).toContain('preparation or recent endurance');
 expect(event.weeks.at(-1).phase).toBe('Taper');
 for(const s of event.weeks.flatMap(w=>w.sessions)) expect(s.date<'2027-01-17').toBe(true);
 const fatigued=swim.generate({...base,recovery:'poor'});
 expect(fatigued.weeks.every(w=>w.phase==='Recovery'&&w.meters<=2730)).toBe(true);
 expect(swim.generate({...base,interrupted:true}).ok).toBe(false);
 expect(swim.generate({...base,start:'2026-02-30'}).ok).toBe(false);
 expect(swim.generate({...base,dayMinutes:{0:5,2:65,5:65}}).ok).toBe(false);
});
