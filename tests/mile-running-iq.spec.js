const {test,expect}=require('@playwright/test');
const iq=require('../mile-running-iq.js');
const bounds=[100,120,140,155,170,190];
const points=Array.from({length:13},(_,i)=>({t:i*5,hr:130}));
test('88.1 unlinked run has no invented plan targets',()=>{
 const r=iq.analyse({id:'a',distanceKm:10,durationMin:52,averageHR:152},{points,bounds,workouts:[{id:'w',sport:'Running',km:10,date:'2026-11-30'}]});
 expect(r.kind).toBe('unlinked');expect(r.plannedKm).toBeNull();expect(r.pace).toBe(312);expect(r.zones.percent).toEqual([0,100,0,0,0]);
});
test('88.1 only unique explicit running link enables planned comparison',()=>{
 const a={id:123,distanceKm:8,durationMin:44};
 const w={sport:'Running',name:'Easy run',matchId:'123',km:8};
 expect(iq.analyse(a,{workouts:[w]}).kind).toBe('linked');
 expect(iq.analyse(a,{workouts:[w,{...w}]}).kind).toBe('unlinked');
 expect(iq.analyse(a,{workouts:[{...w,sport:'HYROX'}]}).kind).toBe('unlinked');
});
test('88.1 missing and gapped HR are unavailable, not zero or estimated',()=>{
 expect(iq.zoneDistribution(points,null)).toBeNull();
 expect(iq.zoneDistribution([{t:0,hr:130},{t:600,hr:130}],bounds)).toBeNull();
 expect(iq.zoneDistribution(points.map(p=>({...p,hr:null})),bounds)).toBeNull();
 const r=iq.analyse({id:'x',distanceKm:null,durationMin:null,averageHR:null});
 expect(r.distanceKm).toBeNull();expect(r.pace).toBeNull();expect(r.averageHR).toBeNull();
});
test('88.1 interpolates zone crossings and retains outside-zone time',()=>{
 const z=iq.zoneDistribution(Array.from({length:13},(_,i)=>({t:i*5,hr:100+i*10})),bounds);
 expect(z.percent.reduce((a,b)=>a+b,0)+z.outsidePercent).toBeCloseTo(100);
 expect(z.outsidePercent).toBeCloseTo(25);
 expect(z.coverage).toBe(60);
});
test('88.1 analysis is read-only and UI does not invent adherence',async({page})=>{
 await page.goto('/index.html');
 await page.addScriptTag({path:require.resolve('../mile-running-iq.js')});
 const result=await page.evaluate(()=>{
  const activity=Object.freeze({id:'a',distanceKm:8,durationMin:44});
  const plan=Object.freeze({sport:'Running',matchId:'a',name:'Easy run',km:8});
  const host=document.createElement('div');host.id='test-analysis';document.body.append(host);
  window.mileRunningIQ.render(host,window.mileRunningIQ.analyse(activity,{workouts:[plan]}));
  return {text:host.textContent,plan:JSON.stringify(plan)};
 });
 expect(result.text).toContain('Linked session: Easy run');
 expect(result.text).toContain('Verified step alignment required');
 expect(result.text).toContain('Keep the current plan.');
 expect(JSON.parse(result.plan).km).toBe(8);
});

test('88.3 planned and unplanned analysis render distinct evidence-gated sections',async({page})=>{
 await page.goto('/index.html');
 await page.addScriptTag({path:require.resolve('../mile-running-analysis.js')});
 await page.addScriptTag({path:require.resolve('../mile-running-iq.js')});
 const result=await page.evaluate(()=>{
 const a=Object.freeze({id:'a',distanceKm:5,durationMin:30});
 const p=Object.freeze({id:'p',sport:'Running',matchId:'a',km:5,name:'Easy'});
 const render=workouts=>{const host=document.createElement('div');window.mileRunningIQ.render(host,window.mileRunningIQ.analyse(a,{workouts}));return host.textContent};
 return {planned:render([p]),unplanned:render([]),ambiguous:render([p,p])};
 });
 expect(result.planned).toContain('Session execution');expect(result.planned).toContain('100%');expect(result.planned).toContain('Verified step alignment required');
 expect(result.unplanned).toContain('No scheduled session linked.');expect(result.unplanned).not.toContain('Distance completed');expect(result.ambiguous).toContain('No scheduled session linked.');
});

test('88.3 verified repetitions show planned and recorded pace and recorded recovery',async({page})=>{
 await page.route('https://**/*',route=>route.abort());
 await page.goto('/index.html');
 await expect(page.locator('#mileSplash')).toHaveCount(0);
 // Isolate the renderer from the signed-out app's full-screen gate.
 await page.locator('#v4Gate').evaluate(gate=>gate.remove());
 await page.evaluate(()=>{
  const makeStep=(intensity,duration,target={kind:'open'})=>({kind:'step',intensity,duration,target});
  const distance=meters=>({kind:'distance',meters});
  const pace={kind:'pace',fastSecondsPerKm:245,slowSecondsPerKm:265};
  const plan={
   id:'p',sport:'Running',matchId:'a',name:'Cruise intervals',km:5.14,plannedMinutes:32,
   detail:'Intervals',structuredDetail:'Intervals',structuredSteps:[
    makeStep('warmup',distance(1000)),makeStep('interval',distance(1000),pace),
    makeStep('recovery',{kind:'time',seconds:60}),makeStep('interval',distance(1000),pace),
    makeStep('cooldown',distance(2000)),
   ],
  };
  const lapEvidence={verified:true,source:'provider-step-ids',rows:[
   {stepIndex:0,seconds:360,meters:1000},{stepIndex:1,seconds:251,meters:1000},
   {stepIndex:2,seconds:67,meters:140,averageHR:141},{stepIndex:3,seconds:260,meters:1000},
   {stepIndex:4,seconds:907,meters:2000},
  ]};
  const activity={id:'a',distanceKm:5.14,durationMin:30.75,lapEvidence};
  for(const [id,options] of [
   ['unverified',{workouts:[plan]}],
   ['verified',{workouts:[plan],lapEvidence}],
  ]){
   const host=document.createElement('div');
   host.id=id;host.className='m881-analysis-host';document.body.append(host);
   window.mileRunningIQ.render(host,window.mileRunningIQ.analyse(activity,options));
  }
 });
 const verified=page.locator('#verified'),unverified=page.locator('#unverified');
 const quick=verified.locator('.m881-quick');
 await expect(quick.locator('h4')).toHaveText(['Session execution','Performance trend','Next session focus','Programme adjustment']);
 await expect(quick.locator('dl>div')).toHaveCount(3);
 await expect(quick).toContainText('2 of 2 measured work steps were in the pace range.');
 await expect(quick).toContainText('within 9 s/km');
 expect((await quick.innerText()).split(/\s+/).length).toBeLessThanOrEqual(105);
 const detail=verified.locator('details');
 const evidence=detail.getByRole('heading',{name:'Session evidence'});
 await expect(evidence).toBeHidden();
 const disclosure=detail.locator('summary');
 expect((await disclosure.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await disclosure.press('Enter');
 await expect(evidence).toBeVisible();
 await expect(detail).toContainText('Planned duration estimate32 min');
 await expect(quick).toContainText('30 min 45 s');
 await expect(detail).toContainText('Pace spread between repetitions9 s/km');
 await expect(unverified.locator('.m881-quick')).toContainText('Verified step data are needed');
 await expect(unverified).not.toContainText('Pace spread between repetitions');
 const steps=detail.locator('section').filter({has:page.getByRole('heading',{name:'Verified work and recovery steps',exact:true})});
 await expect(steps.getByRole('heading',{level:4})).toHaveText(['Repetition 1','Recovery 1','Repetition 2']);
 await expect(steps.locator('.mile35-datarow')).toHaveText([
  'Planned step1000 m','Recorded step1000 m · 4 min 11 s','Planned pace4:05/km–4:25/km','Recorded pace4:11/km',
  'Planned step1 min','Recorded step140 m · 1 min 7 s','Recorded average HR141 bpm',
  'Planned step1000 m','Recorded step1000 m · 4 min 20 s','Planned pace4:05/km–4:25/km','Recorded pace4:20/km',
 ]);
 expect(await steps.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});

test('steady heart-rate comparison uses recorded time and speed and never drives adaptation', () => {
 const run={id:'steady',distanceKm:9,durationMin:50};
 const workout={id:'easy',matchId:'steady',sport:'Running',kind:'easy',revision:3};
 const samples=Array.from({length:601},(_,i)=>({t:i*5,dist:i*15,hr:i<300?135:145}));
 const result=iq.analyse(run,{workouts:[workout],points:samples,bounds});
 expect(result.prescriptionRevision).toBe(3);
 expect(result.heartRateChange).toEqual({earlyBpm:135,lateBpm:145,changeBpm:10,earlyPace:333,latePace:333,efficiencyChange:-7});
 expect(iq.analyse(run,{points:samples,bounds}).heartRateChange).toBeNull();
 expect(iq.analyse(run,{points:samples.filter((_,i)=>i<300||i>390),workouts:[workout]}).heartRateChange).toBeNull();
 const faster=samples.map((p,i)=>({...p,dist:i<=300?p.dist:4500+(i-300)*23}));
 expect(iq.analyse(run,{points:faster,workouts:[workout]}).heartRateChange).toBeNull();
 expect(iq.analyse({...run,heat:true},{points:samples,workouts:[workout]}).heartRateChange).toBeNull();
});


test('an aerobic brief compares only same-source, comparable runs on separate days',()=>{
 const run={id:'current',date:'2026-11-24',source:'garmin-developer-api',distanceKm:8,durationMin:44,averageHR:147};
 const history=[{id:'one',date:'2026-11-03',averageHR:138},{id:'two',date:'2026-11-09',averageHR:142},
  {id:'three',date:'2026-11-18',averageHR:140},{id:'duplicate',date:'2026-11-18',averageHR:205},
  {id:'faster',date:'2026-11-20',durationMin:31,averageHR:200},{id:'other-source',date:'2026-11-21',source:'MILE',averageHR:220},
  {id:'indoors',date:'2026-11-22',type:'TREADMILL_RUNNING',averageHR:210},
 ].map(entry=>({...run,...entry}));
 const workouts=[run,...history].map(entry=>({id:'plan-'+entry.id,sport:'Running',kind:'easy',matchId:entry.id}));
 const result=iq.analyse(run,{workouts,history});
 expect(result.historicalHR).toEqual({count:3,medianBpm:140,currentBpm:147,differenceBpm:7});
 expect(iq.brief(result).trend).toContain('7 bpm higher than your recent median');
 expect(iq.brief(result).adjustment).toBe('Keep the current plan.');
 expect(iq.analyse({...run,type:'treadmill_running'},{workouts,history}).historicalHR).toBeNull();
 expect(iq.analyse(run,{workouts,history:history.slice(0,2)}).historicalHR).toBeNull();
});

test('continuous HR execution needs a reliable full-session trace and a single prescribed range',()=>{
 const run={id:'easy',distanceKm:8,durationMin:40};
 const workout={sport:'Running',matchId:'easy',kind:'easy',detail:'same',structuredDetail:'same',
  structuredSteps:[{kind:'step',intensity:'active',duration:{kind:'distance',meters:8000},
   target:{kind:'heart_rate',lowBpm:115,highBpm:140}}]};
 const samples=Array.from({length:481},(_,i)=>({t:i*5,hr:i<160?145:125,dist:i*16.67}));
 const result=iq.analyse(run,{workouts:[workout],points:samples});
 expect(result.aerobicRange.percent).toBe(67);
 expect(iq.brief(result).metrics).toContainEqual(['In HR range','67%']);
 expect(iq.brief(result).execution).toContain('above the prescribed range for 33%');
 const low=samples.map((point,i)=>({...point,hr:i<160?105:125}));
 expect(iq.brief(iq.analyse(run,{workouts:[workout],points:low})).execution).toContain('below the prescribed range for 33%');
 expect(iq.analyse(run,{workouts:[workout],points:samples.slice(0,30)}).aerobicRange).toBeNull();
 expect(iq.analyse({...run,sensorError:true},{workouts:[workout],points:samples}).aerobicRange).toBeNull();
});

test('cumulative load uses distinct records through the run and omits incomplete comparison weeks',()=>{
 const run={id:'today',date:'2026-11-24',distanceKm:8,durationMin:44};
 const history=[{id:'earlier',date:'2026-11-21',distanceKm:10},{id:'past-a',date:'2026-11-17',distanceKm:7},
  {id:'past-b',date:'2026-11-13',distanceKm:6},{id:'future',date:'2026-11-25',distanceKm:99},
  {id:'today',date:run.date,distanceKm:80},{id:'past-a',date:'2026-11-17',distanceKm:70},
  {id:'invalid',date:'2026-11-00',distanceKm:8}];
 const result=iq.analyse(run,{history});
 expect(result.recentLoad).toEqual({currentKm:18,previousKm:13});
 expect(iq.brief(result).trend).toContain('18.0 km over seven days, versus 13.0 km');
 expect(iq.brief(result).adjustment).toBe('Keep the current plan.');
 expect(iq.analyse(run,{history:history.filter(item=>item.id!=='past-b')}).recentLoad).toBeNull();
 expect(iq.analyse(run,{history:[...history,{id:'incomplete',date:'2026-11-16',distanceKm:null}]}).recentLoad).toBeNull();
});

test('session focus follows the next kind and incomplete recovery needs verified steps',()=>{
 const activity={id:'r',date:'2026-11-20',distanceKm:5,durationMin:26};
 const base=iq.analyse(activity);
 for(const [kind,focus] of [
  ['recovery','Keep the recovery run relaxed'],['long','Start the long run gently'],
  ['easy','Keep the run conversational'],['threshold','Settle into the threshold pace range'],
  ['race10','Find the prescribed race rhythm'],['vo2','Start the first rep within'],
 ]){
  const result={...base,recommendation:{...base.recommendation,next:{kind,demanding:kind==='vo2'}}};
  expect(iq.brief(result).focus).toContain(focus);
 }
 const step=(intensity,duration,target={kind:'open'})=>({kind:'step',intensity,duration,target});
 const work=step('interval',{kind:'distance',meters:800},{kind:'pace',fastSecondsPerKm:235,slowSecondsPerKm:255});
 const plan={sport:'Running',matchId:activity.id,kind:'vo2',structuredSteps:[work,step('recovery',{kind:'time',seconds:90}),work]};
 const lapEvidence={source:'provider-step-ids',verified:true,rows:[{stepIndex:0,meters:800,seconds:170},
  {stepIndex:1,meters:110,seconds:62},{stepIndex:2,meters:800,seconds:199}]};
 const brief=iq.brief(iq.analyse(activity,{workouts:[plan],lapEvidence}));
 expect(brief.execution).toBe('1 of 2 measured work steps were in the pace range. The rest were faster.');
 expect(brief.trend).toBe('The timed recovery ended 28 seconds early.');
 expect(brief.focus).toContain('Take the full recovery');
 expect(iq.brief(iq.analyse(activity,{workouts:[plan],lapEvidence:{...lapEvidence,verified:false}})).trend).not.toContain('seconds early');
});
