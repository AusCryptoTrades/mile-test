const { test, expect } = require('@playwright/test');
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
    if(s.demanding)assert(!hard.some(d=>Math.min((d-s.day+7)%7,(s.day-d+7)%7)<=1),'hard conflict');
   }
  }
 }
 assert(!api.generate({...example,athlete:{...example.athlete,weeklyKm:[0,50,50,50]}}).ok,'interruption');
 assert(!api.generate({...example,athlete:{...example.athlete,injury:true}}).ok,'injury pause');
 return {scenarios:1000,successful,exampleKm:e.weeks.map(x=>x.km),exampleFirstWeek:e.weeks[0].sessions.map(x=>[x.name,x.km,x.plannedMinutes])};
};
test('Batch 88.2 deterministic running engine: 1000 scenarios',()=>{scenarios(engine)});


const completeAthlete = {
  level: 'experienced', weeklyKm: [60, 50, 40, 30], longestKm: 30,
  easyPace: 320, thresholdPace: 259, recovery: 'normal',
};
const planInput = {
  goal: '10k', start: '2026-11-30', weeks: 8,
  schedule: { available: [0, 1, 3, 5, 6], runs: 5, longDay: 5, weekdayMinutes: 100, longMinutes: 180 },
};

test('uses the weighted baseline and distinguishes unavailable and recorded zero-volume weeks', () => {
  const complete = engine.generate({ ...planInput, athlete: completeAthlete });
  expect(complete.baseline).toMatchObject({ source: 'four completed weeks', interrupted: false });
  expect(complete.baseline.km).toBeCloseTo(50, 8);
  expect(complete.weeks[0].meters).toBe(50000);

  const partial = engine.generate({
    ...planInput, athlete: { level: 'beginner', weeklyKm: [null, 35, null, 25], recovery: 'normal' },
  });
  expect(partial.baseline).toMatchObject({ source: 'partial completed weeks', interrupted: false });
  expect(partial.baseline.km).toBeCloseTo(32.5, 8);
  expect(partial.weeks.length).toBeGreaterThan(0);
  for (const week of partial.weeks) {
    expect(week.meters).toBeLessThanOrEqual(32500);
    for (const session of week.sessions) {
      expect(session.structuredSteps.every(step => step.target.kind === 'open')).toBe(true);
    }
  }

  const missing = engine.generate({ ...planInput, athlete: { level: 'beginner' } });
  expect(missing.ok).toBe(false);
  expect(missing.baseline.km).toBeNull();
  const interrupted = engine.generate({ ...planInput, athlete: { ...completeAthlete, weeklyKm: [0, 50, 50, 50] } });
  expect(interrupted.ok).toBe(false);
  expect(interrupted.baseline).toEqual({ km: 0, source: 'four completed weeks', interrupted: true });
});

for (const [level, ceiling] of Object.entries({ beginner: 0.05, intermediate: 0.07, experienced: 0.08, advanced: 0.10 })) {
  test(`constrains ${level} loading and restores at most the pre-recovery volume`, () => {
    const result = engine.generate({ ...planInput, athlete: { ...completeAthlete, level } });
    expect(result.ok).toBe(true);
    expect(result.weeks.filter(week => week.phase === 'Recovery').map(week => week.week)).toEqual([4, 8]);
    expect(result.weeks[1].meters).toBeGreaterThan(result.weeks[0].meters);
    for (let index = 1; index < result.weeks.length; index++) {
      const week = result.weeks[index];
      const previous = result.weeks[index - 1];
      if (week.phase === 'Recovery') {
        expect(week.meters).toBeLessThanOrEqual(previous.meters * 0.8);
        expect(week.sessions.every(session => !session.demanding)).toBe(true);
      } else if (previous.phase === 'Recovery') {
        expect(week.meters).toBeLessThanOrEqual(result.weeks[index - 2].meters);
      } else {
        expect(week.meters - previous.meters).toBeLessThanOrEqual(Math.ceil(previous.meters * ceiling));
      }
    }
  });
}

test('reduces load approaching a dated race and ends the schedule before race day', () => {
  const raceDate = '2027-01-23';
  const result = engine.generate({ ...planInput, weeks: 10, raceDate, athlete: completeAthlete });
  expect(result.ok).toBe(true);
  expect(result.weeks).toHaveLength(8);
  const [beforeTaper, taper, raceWeek] = result.weeks.slice(-3);
  expect([taper.phase, raceWeek.phase]).toEqual(['Taper', 'Taper']);
  expect(taper.meters).toBeLessThanOrEqual(beforeTaper.meters * 0.8);
  expect(raceWeek.meters).toBeLessThanOrEqual(taper.meters * 0.6);
  for (const run of [...taper.sessions, ...raceWeek.sessions]) {
    expect(run.date < raceDate).toBe(true);
    expect(run.demanding).toBe(false);
  }
});


test('per-day caps override both regular and long-run defaults', () => {
  const schedule = { ...planInput.schedule, dayMinutes: { 1: 35, 5: 75 } };
  const result = engine.generate({ ...planInput, schedule, athlete: completeAthlete });
  expect(result.ok).toBe(true);
  const expected = { 0: 100, 1: 35, 3: 100, 5: 75, 6: 100 };
  for (const week of result.weeks) {
    expect(week.sessions.map(run => run.day)).toEqual([0, 1, 3, 5, 6]);
    for (const run of week.sessions) {
      expect(run.durationLimitMinutes).toBe(expected[run.day]);
      expect(run.plannedMinutes).toBeLessThanOrEqual(expected[run.day]);
    }
  }
  const invalid = engine.generate({ ...planInput, schedule: { ...schedule, dayMinutes: { 1: 0 } }, athlete: completeAthlete });
  expect(invalid.ok).toBe(false);
  expect(invalid.errors).toContain('Enter day-specific limits in whole minutes');
});

test('race feasibility uses the actual dated runway and demonstrated pace', () => {
  const athlete = { ...completeAthlete, fiveKSeconds: 1200 };
  const result = engine.generate({ ...planInput, goal: 'marathon', weeks: 12, raceDate: '2027-02-16', athlete, targetSeconds: 9900 });
  expect(result.ok).toBe(true);
  expect(result.feasibilityDetail.status).toBe('caution');
  expect(result.feasibilityDetail.reasons).toEqual(expect.arrayContaining([
    expect.stringContaining('78 days'),
    expect.stringContaining('faster average pace than your recorded 5K'),
  ]));
  const noBenchmark = engine.generate({ ...planInput, athlete: completeAthlete, targetSeconds: 2000 });
  expect(noBenchmark.feasibilityDetail.reasons.join(' ')).not.toContain('5K benchmark');
});

test('a confirmed walk–run return is timed, non-progressive and respects recovery days', () => {
  const input = {
    ...planInput, goal: 'return', weeks: 3,
    athlete: { level: 'beginner', currentKm: 0, interrupted: true, returnMinutes: 12 },
    schedule: { ...planInput.schedule, runs: 3, demandingDays: [6], dayMinutes: { 1: 7 } },
  };
  const result = engine.generate(input);
  expect(result.ok).toBe(true);
  expect(result.chosenDays).toEqual([1, 3]);
  expect(result.weeks).toHaveLength(3);
  for (const week of result.weeks) {
    expect(week.km).toBeNull();
    expect(week.sessions.map(session => session.plannedMinutes)).toEqual([6, 12]);
    for (const session of week.sessions) {
      expect(session.structuredSteps.reduce((sum, step) => sum + step.duration.seconds, 0)).toBe(session.estimatedSeconds);
      expect(session.meters).toBeNull();
      expect(session.structuredSteps.every(step => step.target.kind === 'open')).toBe(true);
    }
  }
  expect(engine.generate({ ...input, athlete: { ...input.athlete, injury: true } }).ok).toBe(false);
  expect(engine.generate({ ...input, athlete: { ...input.athlete, returnMinutes: undefined } }).ok).toBe(false);
  expect(engine.generate({ ...input, goal: 'fitness' }).ok).toBe(false);
});


test('running targets and step endings use independently confirmed HR and pace', () => {
 const run = require('../mile-running-workout.js');
 const input = {goal:'10k',start:'2026-11-30',weeks:18,
  athlete:{level:'experienced',weeklyKm:[55,55,55,55],longestKm:24,maxHR:180,lthr:161,restingHR:55,
   easyPace:320,thresholdPace:259,fiveKSeconds:1199,recovery:'normal',easyZone:{lowBpm:120,highBpm:145},recoveryZone:{lowBpm:106,highBpm:122}},
  schedule:{available:[0,1,3,5,6],runs:5,longDay:5,weekdayMinutes:60,longMinutes:180},
  adaptation:{intervalRecovery:'heart_rate'}};
 const generateSessions = value => engine.generate(value).weeks.flatMap(w=>w.sessions);
 const sessions = generateSessions(input);
 const steps = sessions.flatMap(s=>s.structuredSteps);
 expect(sessions.filter(s=>['easy','long','steady','progressive'].includes(s.kind)).every(s=>
  s.structuredSteps.every(step=>step.target.kind==='heart_rate'))).toBe(true);
 expect(sessions.filter(s=>['cruise','threshold','race10','fartlek'].includes(s.kind)).every(s=>
  s.structuredSteps.filter(step=>step.intensity==='interval').every(step=>step.target.kind==='pace'))).toBe(true);
 expect(sessions.every(s=>!Object.hasOwn(s,'targetRpe')&&s.plannedMinutes<=s.durationLimitMinutes)).toBe(true);
 const recovered=steps.filter(s=>s.duration.kind==='heart_rate');
 expect(recovered.length).toBeGreaterThan(0);
 expect(recovered.every(s=>s.intensity==='recovery'&&s.duration.direction==='below'&&s.duration.bpm===122&&
  !run.recoveryFinish(s.duration,s.duration.fallbackSeconds-1)&&run.recoveryFinish(s.duration,s.duration.fallbackSeconds))).toBe(true);
 for(const session of sessions.filter(s=>s.fixedMeters!=null)){
  const fixed=session.structuredSteps.reduce((sum,s)=>sum+(s.duration.meters??0),0);
  const timed=session.structuredSteps.reduce((sum,s)=>sum+(s.duration.seconds??s.duration.fallbackSeconds??0),0);
  expect(session.fixedMeters).toBe(fixed);
  expect(session.estimatedSeconds).toBe(Math.ceil(fixed*session.estimatedPaceSeconds/1000+timed));
 }
 const uncertain=generateSessions({...input,athlete:{...input.athlete,easyZone:undefined,recoveryZone:undefined}});
 expect(uncertain.flatMap(s=>s.structuredSteps).some(s=>s.duration.kind==='time')).toBe(true);
 expect(uncertain.flatMap(s=>s.structuredSteps).some(s=>s.duration.kind==='heart_rate')).toBe(false);
});
