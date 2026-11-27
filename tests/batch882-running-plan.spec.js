const {test}=require('@playwright/test');
const engine=require('../mile-running-plan.js');
const scenarios=function scenarios(api){
 const assert=(condition,msg)=>{if(!condition)throw Error(msg)};
 const example={goal:'10k',weeks:8,start:'2026-11-30',athlete:{level:'experienced',weeklyKm:[50,50,50,50],currentKm:50,longestKm:30,easyPace:320,thresholdPace:259,easyZone:{lowBpm:120,highBpm:145}},schedule:{available:[0,1,3,5,6],runs:5,longDay:5,weekdayMinutes:60,longMinutes:180,demandingDays:[6]}};
 let e=api.generate(example);assert(e.ok,'example generated');assert(e.weeks[0].meters===50000,'baseline 50k');assert(JSON.stringify(e)===JSON.stringify(api.generate(example)),'deterministic');
 const levels=['beginner','intermediate','experienced','advanced'],goals=['5k','10k','half-marathon','marathon','ultra','fitness','return'];
 let successful=0;
 for(let i=0;i<1000;i++){
  const km=5+i%76,days=[0,1,2,3,4,5,6].filter(d=>(d+i)%5!==0),n=1+i%days.length,hard=i%3===0?[6]:[];
  const input={goal:goals[i%goals.length],start:'2026-11-30',weeks:8,athlete:{level:levels[i%4],weeklyKm:[km,km,km,km],longestKm:km*.4,easyPace:i%6?280+i%120:undefined,thresholdPace:250},schedule:{available:days,runs:n,longDay:5,weekdayMinutes:20+i%70,longMinutes:60+i%120,demandingDays:hard}};
  const result=api.generate(input);if(!result.ok){assert(result.errors.length>0,'explicit errors');continue}successful++;
  assert(JSON.stringify(result)===JSON.stringify(api.generate(input)),'determinism '+i);
  for(const w of result.weeks){
   assert(w.meters===w.sessions.reduce((x,y)=>x+y.meters,0),'weekly distance');
   assert(w.sessions.length<=n,'frequency');
   for(const s of w.sessions){
    assert(days.includes(s.day),'availability');
    assert(s.meters===s.structuredSteps.reduce((x,y)=>x+y.duration.meters,0),'step reconciliation');
    assert(s.structuredSteps.every(x=>x.duration.meters>0),'positive steps');
    assert(s.plannedMinutes<=s.durationLimitMinutes,'actual slot duration envelope');
    if(s.targetRpe>=6)assert(!hard.some(d=>Math.min((d-s.day+7)%7,(s.day-d+7)%7)<=1),'hard conflict');
   }
  }
 }
 assert(!api.generate({...example,athlete:{...example.athlete,weeklyKm:[0,50,50,50]}}).ok,'interruption');
 assert(!api.generate({...example,athlete:{...example.athlete,injury:true}}).ok,'injury pause');
 return {scenarios:1000,successful,exampleKm:e.weeks.map(x=>x.km),exampleFirstWeek:e.weeks[0].sessions.map(x=>[x.name,x.km,x.plannedMinutes])};
};
test('Batch 88.2 deterministic running engine: 1000 scenarios',()=>{scenarios(engine)});
