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
