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
 expect(result.text).toContain('No workout targets or future sessions have been changed');
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
 expect(result.unplanned).toContain('Training contribution');expect(result.unplanned).not.toContain('Distance completed');expect(result.ambiguous).toContain('Training contribution');
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
 const execution=verified.locator('section').filter({has:page.getByRole('heading',{name:'Session execution',exact:true})});
 await expect(execution).toContainText('Planned duration estimate32 min');
 await expect(execution).toContainText('Recorded duration30 min 45 s');
 await expect(execution).toContainText('Pace spread between repetitions9 s/km');
 await expect(unverified).toContainText('Verified step alignment required');
 await expect(unverified.locator('details')).toHaveCount(0);
 await expect(unverified).not.toContainText('Pace spread between repetitions');
 const disclosure=execution.getByText('Verified work and recovery steps',{exact:true});
 expect((await disclosure.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await disclosure.click();
 const steps=execution.locator('details');
 await expect(steps.getByRole('heading')).toHaveText(['Repetition 1','Recovery 1','Repetition 2']);
 await expect(steps.locator('.mile35-datarow')).toHaveText([
  'Planned step1000 m','Recorded step1000 m · 4 min 11 s','Planned pace4:05/km–4:25/km','Recorded pace4:11/km',
  'Planned step1 min','Recorded step140 m · 1 min 7 s','Recorded average HR141 bpm',
  'Planned step1000 m','Recorded step1000 m · 4 min 20 s','Planned pace4:05/km–4:25/km','Recorded pace4:20/km',
 ]);
 expect(await steps.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
