const {test,expect}=require('@playwright/test');
const api=require('../mile-running-analysis.js');
const checks=function tests(api){
 const assert=(x,m)=>{if(!x)throw Error(m)};
 const step=(intensity,meters,target={kind:'open'})=>({kind:'step',intensity,duration:{kind:'distance',meters},target});
 const activity={id:'a',distanceKm:8,durationMin:42},plan={id:'p',matchId:'a',sport:'Running',name:'Cruise',kind:'cruise',detail:'x',structuredDetail:'x',structuredSteps:[step('warmup',2000),step('interval',2000,{kind:'pace',fastSecondsPerKm:250,slowSecondsPerKm:270}),step('recovery',500),step('interval',2000,{kind:'pace',fastSecondsPerKm:250,slowSecondsPerKm:270}),step('cooldown',1500)]};
 const evidence={verified:true,source:'provider-step-ids',rows:[{stepIndex:0,meters:2000,seconds:650},{stepIndex:1,meters:2000,seconds:520},{stepIndex:2,meters:500,seconds:190},{stepIndex:3,meters:2000,seconds:530},{stepIndex:4,meters:1500,seconds:510}]};
 const a=api.analyse(activity,{plans:[plan],lapEvidence:evidence});assert(a.kind==='planned'&&a.plannedDistance===8,'exact planned distance');assert(a.execution==='on-target','planned execution');assert(a.intervalPaceSpread===5,'interval spread');
 assert(api.analyse(activity,{plans:[plan,plan],lapEvidence:evidence}).kind==='unplanned','ambiguous links');
 assert(api.analyse(activity,{plans:[{...plan,structuredDetail:'changed'}],lapEvidence:evidence}).steps===null,'edited plan');
 assert(api.analyse(activity,{plans:[plan],lapEvidence:{...evidence,verified:false}}).execution==='insufficient-evidence','unverified laps');
 assert(api.analyse(activity,{plans:[plan],lapEvidence:evidence,context:{heat:true}}).steps===null,'context caution');
 const faster={...evidence,rows:evidence.rows.map((r,i)=>i===1?{...r,seconds:450}:r)};
 assert(api.analyse(activity,{plans:[plan],lapEvidence:faster}).execution==='above-target','faster not better');
 const incomplete={...evidence,rows:evidence.rows.map((r,i)=>i===1?{...r,meters:1200}:r)};
 assert(api.analyse(activity,{plans:[plan],lapEvidence:incomplete}).execution==='incomplete','incomplete interval');
 assert(api.analyse(activity,{plans:[plan],lapEvidence:incomplete}).intervalPaceSpread===null,'do not compare an incomplete interval');
 const varied={...plan,structuredSteps:plan.structuredSteps.map((s,i)=>i===3?{...s,target:{...s.target,slowSecondsPerKm:280}}:s)};
 assert(api.analyse(activity,{plans:[varied],lapEvidence:evidence}).intervalPaceSpread===null,'do not compare different prescriptions');
 const zones={seconds:[0,400,800,900,300],outside:0,coverage:2400,span:2400};
 assert(api.analyse(activity,{zoneDistribution:zones}).classification==='higher-intensity','unplanned high intensity');
 assert(api.analyse(activity,{zoneDistribution:zones}).adherence===null,'unplanned no adherence');
 assert(api.analyse(activity,{zoneDistribution:{...zones,span:4000}}).classification==='unclassified','insufficient coverage');
 assert(api.analyse(activity,{zoneDistribution:{seconds:[0,0,0,300,0],outside:0,coverage:300,span:300}}).classification==='unclassified','full coverage of a short fragment cannot describe the whole run');
 assert(api.analyse(activity,{zoneDistribution:zones,context:{sensorError:true}}).zones===null,'sensor error');
 assert(api.analyse({id:'b'},{plans:[plan]}).distanceKm===null,'missing data');
 const settings={mode:'automatic',pace:true,volume:true,recovery:true,missed:true},sessions=[{id:'completed',sport:'Running',status:'done',date:'2026-12-01',targetRpe:7},{id:'linked',sport:'Running',status:'planned',date:'2026-12-01',matchId:'a',targetRpe:7},{id:'past',sport:'Running',status:'planned',date:'2026-11-20',targetRpe:7},{id:'next',sport:'Running',status:'planned',date:'2026-12-02',targetRpe:7}];
 const ctx={today:'2026-11-27',settings,sessions};
 assert(api.propose({id:'m',kind:'missed',sessionType:'easy'},ctx).rule==='no-mileage-debt','no debt');
 assert(api.propose({id:'a',kind:'unplanned',classification:'higher-intensity',evidenceVerified:true},ctx).changes[0].sessionId==='next','only future editable session');
 assert(api.propose({id:'a'},{...ctx,processedIds:['a']}).rule==='duplicate','dedup');
 assert(api.propose({id:'a'},{...ctx,injury:true}).rule==='injury-hold','injury hold');
 assert(api.propose({id:'a'},{...ctx,recovery:'poor'}).rule==='recovery-review','recovery review');
 assert(api.propose({id:'a'},{...ctx,plannedWeekKm:50,actualWeekKm:60}).rule==='additional-mileage-review','load review');
 const ev={id:'3',verified:true,comparableKey:'threshold-cruise',date:'2026-11-27',outcome:'threshold-success'};
 assert(api.propose({id:'a',evidence:ev},ctx).rule==='trend-not-established','one event');
 const history=[{...ev,id:'1',date:'2026-11-17'},{...ev,id:'2',date:'2026-11-22'}];
 const before=JSON.stringify(sessions);
 assert(api.propose({id:'a',evidence:ev},{...ctx,history}).rule==='threshold-progression-review','repeat success');
 assert(api.propose({id:'a',evidence:ev},{...ctx,history:[{...ev,id:'1'},{...ev,id:'2'}]}).rule==='trend-not-established','same date duplicates');
 assert(JSON.stringify(sessions)===before,'immutable input');
 assert(api.propose({id:'a',evidence:ev},{...ctx,history}).requiresApproval,'review before changes');
 return 24;
};
test('Batch 88.3 verified planned and unplanned analysis and review rules',()=>checks(api));

test('Garmin revision matching never guesses or overwrites completed sessions',()=>{
 const a={id:'a',sport:'Running',date:'2026-11-27',distanceKm:5,providerWorkoutId:'1987265',workoutRevision:2};
 const p={id:'p',sport:'Running',date:a.date,status:'planned',km:5,revision:2};
 const d={verified:true,providerWorkoutId:'1987265',revision:2,sessionId:'p'};
 const cases=[[[p],[],'review'],[[p],[d],'verified-link'],[[p],[d,d],'review'],[[{...p,status:'completed'}],[d],'review'],[[{...p,revision:1}],[d],'review'],[[p,{...p,id:'q'}],[],'review'],[[],[],'unplanned'],[[p],[{...d,verified:false}],'review']];
 for(const [plans,deliveries,status] of cases)if(api.reconcile(a,plans,deliveries).status!==status)throw Error('Expected '+status);
});

test('duplicate Garmin imports preserve the existing activity link',()=>{
 const activity={id:'123456789',sport:'Running',date:'2026-11-27',distanceKm:5,providerWorkoutId:'1987265',workoutRevision:2};
 const plan={id:'new',sport:'Running',date:activity.date,status:'planned',km:5,revision:2};
 const delivery={verified:true,providerWorkoutId:'1987265',revision:2,sessionId:plan.id};
 const existing={...plan,id:'previous',status:'done',matchId:123456789};
 expect(api.reconcile(activity,[existing,plan],[delivery])).toEqual({status:'already-linked',sessionId:'previous',candidates:[]});
 expect(api.reconcile(activity,[existing,{...existing,id:'collision'},plan],[delivery])).toEqual({status:'review',candidates:['previous','collision']});
 expect(api.reconcile({...activity,providerWorkoutId:''},[plan],[{...delivery,providerWorkoutId:''}]).status).toBe('review');
 expect(api.reconcile({...activity,workoutRevision:'2'},[plan],[delivery]).status).toBe('review');
});

test('Garmin candidate evidence uses only comparable recorded totals and eligible sessions',()=>{
 const activity={id:'123456789',sport:'Running',date:'2026-11-27',durationMin:30};
 const session={id:'a',sport:'Running',status:'planned',date:activity.date,km:4,detail:'x',structuredDetail:'x',
  structuredSteps:[{kind:'step',intensity:'active',duration:{kind:'time',seconds:1800}}]};
 const options=[session,{...session,id:'completed',completedAt:activity.date},{...session,id:'duplicate'},
  {...session,id:'duplicate',status:'done'},{...session,id:'estimate',structuredSteps:null,plannedMinutes:31},
  {...session,id:'distant-duration',structuredSteps:null,plannedMinutes:5}];
 const review=api.reconcile(activity,options,[]);
 expect(review.candidates).toEqual(['a','estimate']);
 expect(review.evidence).toEqual([
  expect.objectContaining({id:'a',distance:null,duration:30,durationEstimated:false}),
  expect.objectContaining({id:'estimate',distance:null,duration:31,durationEstimated:true}),
 ]);
 expect(api.reconcile({...activity,durationMin:null},options,[]).status).toBe('unplanned');
});

test('revision preparation preserves original and rejects unsafe or duplicate changes',()=>{
 const session={id:'p',ownerId:'u',sport:'Running',status:'planned',date:'2026-12-01',revision:1,kind:'easy',meters:5000,km:5,estimatedSeconds:1800,plannedMinutes:30,detail:'x',structuredDetail:'x',structuredSteps:[{kind:'step',intensity:'active',duration:{kind:'distance',meters:5000},target:{kind:'open'}}]};
 const req={ownerId:'u',sessionId:'p',expectedRevision:1,eventId:'e',approvedByAthlete:true,operation:'reduce-distance',factor:.9},ctx={ownerId:'u',today:'2026-11-27'};
 const before=JSON.stringify(session),r=api.prepareRevision(session,req,ctx);
 if(!r.ok||r.next.meters!==4500||r.next.revision!==2||r.history.before.meters!==5000||JSON.stringify(session)!==before)throw Error('revision integrity');
 for(const [a,b,c] of [[{...session,status:'done'},req,ctx],[session,{...req,expectedRevision:0},ctx],[session,req,{...ctx,ownerId:'other'}],[session,req,{...ctx,processedIds:['e']}],[session,{...req,approvedByAthlete:false},ctx],[{...session,matchId:'activity'},req,ctx],[{...session,kind:'cruise'},req,ctx],[session,{...req,factor:.5},ctx]])if(api.prepareRevision(a,b,c).ok)throw Error('unsafe revision accepted');
});

test('mixed time, distance and HR steps keep prescribed amounts distinct from recorded totals',()=>{
 const {analyse}=require('../mile-running-analysis.js');
 const step=(intensity,duration,target)=>({kind:'step',intensity,duration,target:target||{kind:'open'}});
 const steps=[
  step('warmup',{kind:'time',seconds:600}),
  step('interval',{kind:'distance',meters:800},{kind:'pace',fastSecondsPerKm:245,slowSecondsPerKm:260}),
  step('recovery',{kind:'heart_rate',direction:'below',bpm:125,fallbackSeconds:90},{kind:'heart_rate',lowBpm:110,highBpm:125,zone:'Z1'}),
  step('cooldown',{kind:'distance',meters:1000}),
 ];
 const workout={id:'mixed',sport:'Running',matchId:'real-distance-shape',name:'Mixed steps',km:3.6,plannedMinutes:24,
  detail:'mixed',structuredDetail:'mixed',structuredSteps:steps};
 const recorded={id:'real-distance-shape',distanceKm:3.4567,durationMin:24.25};
 const rows=[
  {stepIndex:0,meters:1300,seconds:600},{stepIndex:1,meters:802.5,seconds:201},
  {stepIndex:2,meters:206.7,seconds:75,averageHR:125},{stepIndex:3,meters:1147.5,seconds:579},
 ];
 const result=analyse(recorded,{plans:[workout],lapEvidence:{verified:true,source:'provider-step-ids',rows}});
 expect(result).toMatchObject({distanceKm:3.4567,durationMin:24.25,plannedDistance:3.6,
  prescribedMeters:1800,prescribedSeconds:600,totalDistanceRatio:null,totalDurationRatio:null});
 expect(result.recoverySteps[0]).toMatchObject({durationKind:'heart_rate',duration:{direction:'below',bpm:125},
  completionRatio:null,meters:206.7,averageHR:125});
 expect(recorded.distanceKm).toBe(3.4567);
});
