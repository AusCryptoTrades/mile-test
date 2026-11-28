const {test,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const swim=require('../mile-swimming-plan.js');
const workout=require('../mile-running-workout.js');

const baseline={start:'2026-11-23',weeks:8,goal:'endurance',level:'intermediate',poolLength:25,setting:'pool',
 available:[0,2,5],dayMinutes:{0:55,2:65,5:85},weeklyMeters:3900,longestMeters:1600,continuous:1200,css:107,
 easyPace:125,recovery:'normal',priority:'Swimming',equipment:['board','buoy','fins']};
test('CSS math and the maximal assessment eligibility gates',()=>{
 const input={...baseline,seconds400:420,seconds200:200,comparable:true};
 expect(swim.assess(input)).toEqual({pace:110,speed:200/220});
 for(const changed of [{unwell:true},{level:'beginner'},{recovery:'poor'},{interrupted:true},{comparable:false},
  {continuous:600},{seconds200:215},{seconds200:50},{poolLength:33}]){
  expect(swim.assess({...input,...changed})).toHaveProperty('error');
 }
});

function verify(plan,c){
 const dates=new Set();
 for(const week of plan.weeks){
  assert.equal(week.meters,week.sessions.reduce((n,s)=>n+s.meters,0));
  assert.ok(week.sessions.filter(s=>s.demanding).length<=1);
  for(const s of week.sessions){
   assert.ok(!dates.has(s.date));dates.add(s.date);
   const day=(new Date(s.date).getUTCDay()+6)%7;
   assert.ok(c.available.includes(day));
   assert.ok(s.estimatedSeconds<=60*c.dayMinutes[day]);
   if(c.eventDate)assert.ok(s.date<c.eventDate);
   const steps=workout.expand(s.structuredSteps,{sport:'Swimming'});
   assert.ok(steps&&steps.length>=3);
   assert.equal(steps[0].intensity,'warmup');
   assert.equal(steps.at(-1).intensity,'cooldown');
   assert.equal(workout.totals(s.structuredSteps,{sport:'Swimming'}).meters,s.meters);
   if(s.setting==='open'){
    assert.ok(c.supervised&&c.setting!=='pool'&&s.safety.includes('buddy'));
    assert.equal(workout.totals(s.structuredSteps,{sport:'Swimming'}).seconds,s.estimatedSeconds);
   }else{
    assert.ok(steps.every(step=>step.duration.kind==='distance'?step.duration.meters%c.poolLength===0:step.intensity==='rest'));
    assert.equal(workout.expand(s.structuredSteps)!==null,steps.every(step=>!['rpe','swim_pace'].includes(step.target.kind)));
   }
   if(c.level==='beginner'||c.recovery==='poor'||c.interrupted){
    assert.ok(!s.demanding&&s.setting==='pool');
    if(c.level==='beginner')assert.ok(steps.filter(step=>step.duration.kind==='distance').every(step=>step.duration.meters<=(c.continuous??c.poolLength)));
   }
   if(week.phase==='Taper'||week.phase==='Recovery'||c.priority!=='Swimming')assert.ok(!s.demanding);
   for(const item of c.commitments??[])if(item.hard&&Math.abs(Date.parse(s.date)-Date.parse(item.date))<=86400000){
    assert.ok(!s.demanding&&s.setting==='pool'&&s.meters<=400);
   }
  }
 }
}
test('36 swimmer profiles exercise 108 complete programmes across three durations',()=>{
 const variants=new Set();
 let complete=0;
 const goals=Object.keys(swim.goals),levels=['beginner','recreational','competitive'];
 for(const [goalIndex,goal] of goals.entries())for(const [levelIndex,level] of levels.entries())for(const multisport of [false,true]){
  const poolLength=[20,25,33,50][(goalIndex+levelIndex+Number(multisport))%4];
  const c={...baseline,goal,level,poolLength,priority:multisport?'Running':'Swimming',
   continuous:level==='beginner'?poolLength:multisport?800:1600,weeklyMeters:level==='beginner'?450:3800,
   longestMeters:level==='beginner'?200:1700,css:level==='beginner'?null:107,
   setting:goal==='open'||goal==='triathlon'?'mixed':'pool',supervised:!multisport,commitments:multisport?
    Array.from({length:16},(_,i)=>({date:swim.add(baseline.start,7*i+3),minutes:70,hard:true})):[]};
  for(const weeks of [8,12,16]){
   const input={...c,weeks,eventDate:c.setting==='mixed'?swim.add(c.start,weeks*7):'',eventMeters:c.setting==='mixed'?1800:null};
   const output=swim.generate(input);
   assert.equal(output.ok,true,JSON.stringify(input));
   assert.equal(output.weeks.length,weeks);
   verify(output,input);
   output.weeks.flatMap(w=>w.sessions).forEach(s=>variants.add(s.kind));
   complete++;
  }
 }
 expect(complete).toBe(108);
 expect(variants.size).toBeGreaterThanOrEqual(30);
});

test('all pool recipes validate and time calculations include wall rests',()=>{
 const signatures=new Set();
 for(const key of Object.keys(swim.library)){
  const s=swim.poolWorkout(key,1900,120,baseline);
  assert.ok(s,key);
  const steps=workout.expand(s.structuredSteps,{sport:'Swimming'});
  const seconds=steps.reduce((total,step)=>total+(step.duration.kind==='time'?step.duration.seconds:
   Math.ceil(step.duration.meters*(step.target.slowSecondsPer100m??(baseline.easyPace+
    (['warmup','cooldown'].includes(step.intensity)?15:0)))/100)),0);
  assert.equal(seconds,s.estimatedSeconds,key);
  signatures.add(JSON.stringify(steps));
 }
 expect(Object.keys(swim.library)).toHaveLength(52);
 expect(signatures.size).toBeGreaterThanOrEqual(48);
 expect(swim.poolWorkout('buoy',1900,120,{...baseline,equipment:[]})).toBeNull();
 expect(swim.poolWorkout('css200',1400,15,baseline)).toBeNull();
});
test('reject unsafe inputs, preserve short novice repeats and cap unsupported open water',()=>{
 expect(swim.generate({...baseline,unwell:true}).ok).toBe(false);
 expect(swim.generate({...baseline,available:[]}).ok).toBe(false);
 expect(swim.generate({...baseline,poolLength:50,continuous:25}).ok).toBe(false);
 expect(swim.generate({...baseline,css:12}).ok).toBe(false);
 const novice={...baseline,weeklyMeters:null,css:null,level:'beginner',continuous:25,setting:'open',goal:'open',
  supervised:true,eventDate:'2026-12-01',eventMeters:5000};
 const fallback=swim.generate(novice);
 expect(fallback.warnings.join(' ')).toMatch(/organised supervision.*event may exceed/);
 verify(fallback,novice);
 const experienced={...baseline,goal:'open',setting:'mixed',supervised:true,eventDate:'2027-01-25',weeks:9};
 const withSupervision=swim.generate(experienced);
 expect(withSupervision.weeks.some(w=>w.sessions.some(s=>s.setting==='open'))).toBe(true);
 expect(swim.generate({...experienced,supervised:false}).weeks.some(w=>w.sessions.some(s=>s.setting==='open'))).toBe(false);
});
