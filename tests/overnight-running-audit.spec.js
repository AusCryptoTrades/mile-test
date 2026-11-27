const { test, expect } = require('@playwright/test');
const { generate } = require('../mile-running-plan.js');
const prescription = require('../mile-running-workout.js');
const continuous = new Set(['easy','recovery','long','steady','ultra','taper']);

const athlete = { level: 'experienced', weeklyKm: [50, 50, 50, 50], currentKm: 50,
  longestKm: 30, fiveKSeconds: 1199, thresholdPace: 259, easyPace: 320,
  maxHR: 180, lthr: 161, easyZone: { lowBpm: 120, highBpm: 145 }, recovery: 'normal' };
const schedule = { available: [0, 1, 3, 5, 6], runs: 5, longDay: 5,
  weekdayMinutes: 60, longMinutes: 180, demandingDays: [] };
const walkRun = { level: 'beginner', currentKm: 0, returnMinutes: 8, interrupted: true };
const monday = '2026-11-30';
const cases = [
  ['Complete beginner', {goal:'return',weeks:3}, walkRun, {runs:2}, 'return'],
  ['Limited walk–run tolerance', {goal:'return',weeks:2}, {...walkRun,returnMinutes:6}, {runs:2,dayMinutes:{0:5}}, 'return'],
  ['Long break', {goal:'return',weeks:4}, {...walkRun,returnMinutes:14}, {runs:3,demandingDays:[6]}, 'return'],
  ['Zero running history', {}, {level:'beginner',weeklyKm:[0,0,0,0]}, {runs:2}, 'reject'],
  ['Low-volume recreational runner', {}, {level:'beginner',weeklyKm:[7,6,7,6],longestKm:4,recovery:'unknown'}, {runs:2}, 'flat'],
  ['One run per week', {}, {level:'intermediate',weeklyKm:[9,9,9,9],longestKm:9,recovery:'normal'}, {available:[5],runs:1}, 'single'],
  ['Two runs per week', {}, {level:'intermediate',weeklyKm:[16,15,15,14],longestKm:9,recovery:'normal'}, {available:[1,5],runs:2}, 'endurance'],
  ['Three runs per week', {}, {level:'intermediate',weeklyKm:[28,25,24,24],longestKm:14,recovery:'normal'}, {available:[1,3,5],runs:3}, 'endurance'],
  ['Six runs per week', {}, {...athlete,weeklyKm:[60,55,54,52],currentKm:60}, {available:[0,1,2,3,5,6],runs:6}, 'endurance'],
  ['Experienced high-volume runner', {}, {...athlete,currentKm:105,weeklyKm:[105,102,100,99],longestKm:34}, {weekdayMinutes:90}, 'endurance'],
  ['First 5K', {goal:'5k',raceDate:'2027-01-31'}, {level:'beginner',currentKm:10,longestKm:4}, {runs:3}, 'caution'],
  ['First 10K', {goal:'10k',raceDate:'2027-02-02',weeks:10}, {level:'intermediate',currentKm:18,longestKm:8}, {runs:3}, 'caution'],
  ['First half marathon', {goal:'half-marathon',raceDate:'2027-02-02',weeks:10}, {level:'intermediate',currentKm:22,longestKm:7}, {runs:3}, 'caution'],
  ['First marathon', {goal:'marathon',raceDate:'2027-03-14',weeks:15}, {level:'intermediate',currentKm:28,longestKm:14}, {runs:4}, 'caution'],
  ['Competitive 5K', {goal:'5k',weeks:14,raceDate:'2027-02-28'}, {...athlete,level:'advanced',fiveKSeconds:960}, {}, 'race'],
  ['Competitive marathon', {goal:'marathon',weeks:18,raceDate:'2027-03-28'}, {...athlete,level:'advanced',currentKm:100,weeklyKm:[100,96,92,88],longestKm:33}, {weekdayMinutes:95}, 'race'],
  ['Unrealistic target', {goal:'marathon',weeks:16,targetSeconds:7800}, athlete, {}, 'caution'],
  ['Little preparation time', {goal:'half-marathon',weeks:8,raceDate:'2026-12-13'}, athlete, {}, 'caution'],
  ['Constrained weekdays', {}, athlete, {dayMinutes:{0:12,1:24,3:15,5:65}}, 'endurance'],
  ['Running and HYROX', {goal:'10k',weeks:12}, athlete, {demandingDays:[6]}, 'hybrid'],
  ['Running and Cycling', {adaptation:{priority:'Cycling'}}, athlete, {demandingDays:[0,5]}, 'flat'],
  ['Significant fatigue', {}, {...athlete,recovery:'poor'}, {}, 'flat'],
  ['Recovery unknown', {}, {...athlete,recovery:'unknown'}, {}, 'flat'],
  ['Calendar entry invalid', {raceDate:'2027-02-30'}, athlete, {}, 'reject'],
  ['Inconsistent pace entries', {}, {...athlete,thresholdPace:480,fiveKSeconds:undefined}, {}, 'effort'],
  ['Poor return tolerance', {goal:'return',weeks:2}, {...walkRun,returnMinutes:5}, {runs:2}, 'reject'],
  ['Current injury reported', {}, {...athlete,injury:true}, {}, 'reject'],
];

test('audits 27 synthetic Running profiles week by week', async ({}, info) => {
  const summary = [];
  const auditPhases = new Set();
  const auditKinds = new Set();
  for (const [name, plan, profile, preferences, rule] of cases) {
    const input = {goal:'10k',start:monday,weeks:10,athlete:profile,
      schedule:{...schedule,...preferences},...plan};
    const result = generate(input);
    expect(result.ok,name).toBe(rule!=='reject');
    if (!result.ok) { summary.push({name,errors:result.errors}); continue; }
    expect(result.weeks.length,name).toBeGreaterThan(0);
    if (rule==='caution') expect(result.feasibilityDetail.reasons.join(' '),name).toContain('later event');
    const first = result.weeks[0];
    for (const [index, week] of result.weeks.entries()) {
      auditPhases.add(week.phase);
      expect(week.plannedMinutes,name).toBe(week.sessions.reduce((sum,s)=>sum+s.plannedMinutes,0));
      expect(week.sessions.length,name).toBeLessThanOrEqual(input.schedule.runs);
      if (rule==='single'&&week.phase!=='Recovery') expect(week.meters,name).toBeGreaterThanOrEqual(8500);
      if (rule==='return') expect(week.meters,name).toBeNull();
      else expect(week.meters,name).toBe(week.sessions.reduce((sum,s)=>sum+s.meters,0));
      if (rule==='flat'||rule==='hybrid') expect(week.meters,name).toBeLessThanOrEqual(first.meters);
      if (index&&week.phase==='Recovery'&&rule!=='return') expect(week.meters,name).toBeLessThanOrEqual(result.weeks[index-1].meters*.8);
      for (const session of week.sessions) {
        auditKinds.add(session.kind);
        expect(input.schedule.available,name).toContain(session.day);
        expect(session.plannedMinutes,name).toBeLessThanOrEqual(session.durationLimitMinutes);
        expect(session.purpose,name).toBeTruthy();
        expect(session.focus,name).toBeTruthy();
        if(continuous.has(session.kind)){
          expect(session.structuredSteps,name).toHaveLength(1);
          expect(session.structuredSteps[0].intensity,name).toBe('active');
          if(session.structuredSteps[0].duration.kind==='distance')expect(session.meters%1000,name).toBe(0);
        }else{
          expect(session.structuredSteps[0].intensity,name).toBe('warmup');
          expect(session.structuredSteps.at(-1).intensity,name).toBe('cooldown');
        }
        if (input.raceDate) expect(Date.parse(session.date),name).toBeLessThan(Date.parse(input.raceDate));
        const demanding = input.schedule.demandingDays;
        if (session.demanding||session.kind==='progressive'||session.kind==='strides')
          expect(demanding.some(day=>[0,1,6].includes((day-session.day+7)%7)),name).toBe(false);
        if (rule==='flat'||week.phase==='Recovery'||week.phase==='Taper')
          expect(session.demanding,name).toBe(false);
        if (rule==='hybrid'&&session.day===6) expect(session.kind,name).toBe('recovery');
        if (rule==='effort') expect(session.structuredSteps.every(s=>s.target.kind!=='pace'),name).toBe(true);
        expect(session,name).not.toHaveProperty('targetRpe');
        if(profile.easyZone&&['easy','recovery','long','taper','ultra','progressive','steady'].includes(session.kind))
          expect(session.structuredSteps.every(s=>s.target.kind==='heart_rate'),name).toBe(true);
        const totals=prescription.totals(session.structuredSteps);
        if(totals.allDistance)expect(totals.meters,name).toBe(session.meters);
        else if(totals.allTime)expect(totals.seconds,name).toBe(session.estimatedSeconds);
        if(session.fixedMeters!==undefined)expect(session.fixedMeters,name).toBe(totals.meters);
        if(session.estimatedPaceSeconds)expect(session.estimatedSeconds,name).toBeLessThanOrEqual(Math.ceil(session.meters*session.estimatedPaceSeconds/1000));
      }
    }
    summary.push({name, weeks:result.weeks.map(({week,phase,km,plannedMinutes,sessions})=>
      ({week,phase,km,plannedMinutes,sessions:sessions.map(s=>({date:s.date,kind:s.kind,km:s.km,minutes:s.plannedMinutes}))}))});
  }
  for (const phase of ['Return','Base','Build','Specific','Recovery','Taper']) expect(auditPhases).toContain(phase);
  for (const kind of ['hills','strides','progressive','race5','marathon','return']) expect(auditKinds).toContain(kind);
  await info.attach('synthetic-running-audit',{body:JSON.stringify(summary,null,2),contentType:'application/json'});
});
