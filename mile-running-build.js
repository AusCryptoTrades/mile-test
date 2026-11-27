/* Batch 88.2 — five-stage running Build integration. Automatic adaptation is not enabled. */
(function runningBuild(root){
'use strict';
if(!root.mileRunningPlan||typeof v41Builder!=='function')return;
const prescription=root.mileRunningWorkout,api=root.mileRunningPlan,legacyBuild=v41Builder,legacyPick=v42PickSport,legacyMove=v42Move,legacyRegen=v42RegenerateWeek,legacyWhy=mileCoachWhyHtml,legacyCard=workoutCard;
const names=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const goals=[['fitness','General running fitness'],['endurance','Running endurance'],['first-race','First race (distance not specified)'],['personal-best','Personal best (distance not specified)'],['5k','5K'],['10k','10K'],['half-marathon','Half marathon'],['marathon','Marathon'],['ultra','Ultra running'],['return','Return to running']];
const levels=[['beginner','Beginner'],['intermediate','Intermediate'],['experienced','Experienced'],['advanced','Advanced']];
const sports=['Running','HYROX','Cycling','Swimming','Strength','Triathlon'];
const settings=[['pace','Adaptive pace'],['volume','Adaptive volume'],['recovery','Recovery integration'],['missed','Missed session management'],['garmin','Garmin workout updates']];
const defaultAdapt=()=>({mode:'automatic',priority:'Running',secondary:'',pace:true,volume:true,recovery:true,missed:true,garmin:true,notifications:'significant',intervalRecovery:'time'});
const num=x=>x!==''&&x!==null&&x!==undefined&&Number.isFinite(Number(x))?Number(x):null;
const parseTime=s=>{if(!s)return null;const p=String(s).trim().split(':');if(p.length<2||p.length>3||p.some(x=>!/^\d+$/.test(x))||p.slice(1).some(x=>Number(x)>=60))return null;return p.reduce((n,x)=>n*60+Number(x),0)||null};
const kmText=m=>m===null?'Distance open':(m/1000).toFixed(1)+' km';
function history(){
 const end=add(today(),-1),rows=[],seen=new Set();
 for(const a of state.activities||[]){
  if(!(a.sport==='Running'||sportOf(a)==='Running')||a.id==null)continue;
  const d=activityDate(a),km=num(a.distanceKm),key=String(a.provider||'garmin')+':'+String(a.id);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||d<add(end,-179)||d>end||km===null||km<=0||seen.has(key))continue;
  seen.add(key);rows.push({d,km,min:activityDuration(a)});
 }
 const summarize=(from,to)=>{const r=rows.filter(x=>x.d>=from&&x.d<=to);return {km:Math.round(r.reduce((s,x)=>s+x.km,0)*10)/10,runs:r.length,longest:r.length?Math.round(Math.max(...r.map(x=>x.km))*10)/10:null}};
 const windows=[7,28,90,180].map(days=>({days,...summarize(add(end,1-days),end)}));
 const weeks=Array.from({length:4},(_,i)=>summarize(add(end,-7*i-6),add(end,-7*i)));
 return {end,windows,weeks};
}
function form(){
 const owner=String(userId||'');
 if(v42Form.running88?.owner===owner)return v42Form.running88;
 const shared=root.mileAthleteProfile?.read(),p=shared?.athlete??v45Profile();
 const pref=state.settings.trainingPreferences773?.Running||{},h=history(),ranges=p.zoneRanges;
 const zone=Array.isArray(ranges)&&ranges[1]?ranges[1]:Array.isArray(p.zoneBounds)&&p.zoneBounds.length===6?{min:p.zoneBounds[1],max:p.zoneBounds[2]}:{};
 const recoveryZone=Array.isArray(ranges)&&ranges[0]?ranges[0]:Array.isArray(p.zoneBounds)&&p.zoneBounds.length===6?{min:p.zoneBounds[0],max:p.zoneBounds[1]}:{};
 const experience={beginner:'beginner',regular:'intermediate',experienced:'experienced',competitive:'advanced'}[p.experience];
 const fatigue=num(state.checkins?.[today()]?.fatigue),highFatigue=Number.isInteger(fatigue)&&fatigue>=7&&fatigue<=10;
 const adapt=defaultAdapt();
 if(sports.includes(shared?.primarySport))adapt.priority=shared.primarySport;
 adapt.secondary=(shared?.sports||[]).filter(sport=>sports.includes(sport)&&sport!==adapt.priority).join(', ');
 const f={owner,goal:'fitness',start:today(),weeks:'8',name:'',raceDate:'',target:'',level:pref.level||experience||'intermediate',volume:pref.volume!==''&&pref.volume!=null?String(pref.volume):h.windows[1].runs?String(Math.round(h.windows[1].km/4*10)/10):'',completeHistory:false,longest:h.windows[2].longest??'',five:p.fiveK||'',threshold:p.threshold||'',easy:'',maxHR:p.maxHR||'',lthr:p.lthr||'',restingHR:'',lowHR:zone.min||'',highHR:zone.max||'',recoveryLowHR:recoveryZone.min||'',recoveryHighHR:recoveryZone.max||'',recovery:highFatigue?'poor':'unknown',interrupted:false,injury:false,available:pref.available||[0,1,2,3,4,5,6],runs:String(pref.sessions||3),longDay:String(pref.longDay??5),weekday:'60',longMinutes:'120',dayMinutes:{},demanding:[],adapt};
 f.sources={
  level:pref.level?'Running preference':experience?'Athlete profile experience':'Default experience selection',
  volume:pref.volume!==''&&pref.volume!=null?'Running preference':h.windows[1].runs?'Imported 28-day total divided by four':'',
  longest:h.windows[2].longest?'Longest imported run in 90 days':'',
  five:p.fiveK?'Saved athlete benchmark':'',threshold:p.threshold?'Saved athlete benchmark':'',easy:'',
  maxHR:p.maxHR?'Saved athlete profile':'',lthr:p.lthr?'Saved athlete profile':'',
  restingHR:'',lowHR:zone.min?'Saved athlete HR zones':'',highHR:zone.max?'Saved athlete HR zones':'',recoveryLowHR:recoveryZone.min?'Saved athlete HR zones':'',recoveryHighHR:recoveryZone.max?'Saved athlete HR zones':'',
  recovery:highFatigue?'Today’s athlete-reported fatigue check-in':'',
 };
 v42Step=0;v42Form.running88=f;return f;
}
const fieldId=k=>({level:'v42Level',volume:'v42Volume',runs:'v42Days',longDay:'v42LongDay'}[k]||'m882-'+k);
const source=(f,k)=>f.sources&&Object.hasOwn(f.sources,k)?'<small class="muted" data-m882-source="'+k+'"'+(f.sources[k]?'':' hidden')+'>'+esc(f.sources[k])+'</small>':'';
const field=(f,k,label,type='text',extra='',attr='data-m882-field')=>'<div class="field"><label for="'+fieldId(k)+'">'+esc(label)+'</label><input id="'+fieldId(k)+'" '+attr+'="'+k+'" type="'+type+'" value="'+esc(f[k]??'')+'" '+extra+'>'+source(f,k)+'</div>';
const select=(f,k,label,options)=>'<div class="field"><label for="'+fieldId(k)+'">'+esc(label)+'</label><select id="'+fieldId(k)+'" data-m882-field="'+k+'">'+options.map(([v,l])=>'<option value="'+esc(v)+'" '+(String(f[k])===String(v)?'selected':'')+'>'+esc(l)+'</option>').join('')+'</select>'+source(f,k)+'</div>';
const check=(f,k,label,attr='data-m882-field')=>'<label class="m882-check"><input type="checkbox" '+attr+'="'+k+'" '+(f[k]?'checked':'')+'> <span>'+esc(label)+'</span></label>';
const days=(f,k)=>'<div class="v42-checks m882-days">'+names.map((d,i)=>'<label><input type="checkbox" data-m882-day="'+k+'" '+(k==='available'?'data-v42-day':'')+' value="'+i+'" '+(f[k].includes(i)?'checked':'')+'> '+d.slice(0,3)+'</label>').join('')+'</div>';
function dayLimits(f){
 return '<details class="item"><summary>Day-specific limits</summary><p class="muted small">Leave a day blank to use the standard or long-run maximum.</p><div class="formgrid">'+names.map((day,index)=>field(f.dayMinutes,index,day+' maximum (min)','number','min="1" step="1"','data-m882-day-limit')).join('')+'</div></details>';
}
const durationOverrides=f=>Object.fromEntries(f.available.filter(day=>f.dayMinutes[day]).map(day=>[day,num(f.dayMinutes[day])]));
function stepGroups(session){
 const steps=prescription.expand(session.structuredSteps);
 if(!steps)return [];
 if(session.kind==='return'){
  const describe=step=>[step.description,prescription.durationLabel(step.duration),prescription.targetLabel(step.target)].filter(Boolean).join(' · ');
  const loops=[];
  for(let index=1;index<steps.length-1;index+=2)loops.push(describe(steps[index])+' + '+describe(steps[index+1]));
  const repeated=loops.every(loop=>loop===loops[0]);
  return [['Warm-up',describe(steps[0])],['Walk–run',repeated?loops.length+' × ('+loops[0]+')':loops.join(' → ')],
   ['Cool-down',describe(steps.at(-1))]];
 }
 return Object.entries(prescription.labels).flatMap(([kind,label])=>{
  const rows=steps.filter(step=>step.intensity===kind);
  const texts=rows.map(step=>[prescription.durationLabel(step.duration),prescription.targetLabel(step.target)].filter(Boolean).join(' · '));
  if(!texts.length)return [];
  return [[label,texts.every(text=>text===texts[0])?(texts.length>1?texts.length+' × ':'')+texts[0]:texts.join(' + ')]];
 });
}
const compactDetail=s=>stepGroups(s).map(([label,value])=>label+': '+value+'.').join(' ');
const sessionDistance=s=>s.fixedMeters!=null?'~'+kmText(s.meters)+' incl. recovery':kmText(s.meters);
function sessionMarkup(w){
 if(w.sport!=='Running'||w.structuredDetail!==w.detail)return null;
 const groups=stepGroups(w);
 if(!groups.length)return null;
 return '<dl class="m882-workout-steps">'+groups.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>';
}
function existing(f){
 const end=add(f.start,Math.max(0,Number(f.weeks)*7-1));
 return state.workouts.filter(w=>w.date>=f.start&&w.date<=end&&w.status!=='skipped'&&v456Visible(w.block));
}
function input(f){
 const h=history(),other=existing(f),dayOf=w=>(new Date(w.date+'T12:00:00Z').getUTCDay()+6)%7;
 const hard=[...new Set([...f.demanding,...other.filter(w=>v43Hard(w)&&Number.isFinite(dayOf(w))).map(dayOf)])];
 const low=num(f.lowHR),high=num(f.highHR),recoveryLow=num(f.recoveryLowHR),recoveryHigh=num(f.recoveryHighHR);
 return {goal:f.goal,start:f.start,weeks:Number(f.weeks),raceDate:f.raceDate||undefined,targetSeconds:parseTime(f.target),athlete:{sources:{...f.sources},level:f.level,currentKm:num(f.volume),weeklyKm:f.completeHistory?h.weeks.map(x=>x.km):undefined,longestKm:num(f.longest),fiveKSeconds:parseTime(f.five),easyPace:parseTime(f.easy),thresholdPace:parseTime(f.threshold),maxHR:num(f.maxHR),lthr:num(f.lthr),restingHR:num(f.restingHR),easyZone:low!==null&&high!==null?{lowBpm:low,highBpm:high}:undefined,recoveryZone:recoveryLow!==null&&recoveryHigh!==null?{lowBpm:recoveryLow,highBpm:recoveryHigh}:undefined,recovery:f.recovery,returnMinutes:num(f.returnMinutes),interrupted:f.interrupted,injury:f.injury},schedule:{available:f.available,runs:Number(f.runs),longDay:Number(f.longDay),weekdayMinutes:num(f.weekday),longMinutes:num(f.longMinutes),dayMinutes:durationOverrides(f),demandingDays:hard},adaptation:{...f.adapt}};
}
function validStage(f,step){
 if(step===0){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(f.start)||f.start<today())return 'Choose a start date today or later.';
  if(!Number.isInteger(Number(f.weeks))||Number(f.weeks)<1||Number(f.weeks)>52)return 'Choose 1–52 weeks.';
  if(f.raceDate&&f.raceDate<f.start)return 'Race date cannot be before the start.';
  if(f.goal==='return'&&(Number(f.weeks)>4||f.raceDate||f.target))return 'Choose 1–4 weeks and leave race date and goal time blank for Return to running.';
  if(f.target&&!parseTime(f.target))return 'Use mm:ss or hh:mm:ss for target time.';
 }
 if(step===1){
  if(f.goal==='return'){
   const minutes=num(f.returnMinutes);
   if(!Number.isInteger(minutes)||minutes<6||minutes>20)return 'Confirm a recent comfortable walk–run duration of 6–20 minutes.';
  }else if(num(f.volume)===null||num(f.volume)<=0)return 'Confirm a positive sustainable weekly volume or choose Return to running.';
  for(const k of ['five','easy','threshold'])if(f[k]&&!parseTime(f[k]))return 'Enter valid mm:ss pace or time values.';
  for(const k of ['maxHR','lthr','restingHR','lowHR','highHR','recoveryLowHR','recoveryHighHR'])if(f[k]!==''&&(!Number.isInteger(num(f[k]))||num(f[k])<30||num(f[k])>250))return 'Check heart-rate values (30–250 bpm).';
  if((f.lowHR==='' )!==(f.highHR==='')||f.lowHR!==''&&num(f.lowHR)>=num(f.highHR))return 'Enter a valid complete easy HR range, or leave both blank.';
  if((f.recoveryLowHR==='')!==(f.recoveryHighHR==='')||f.recoveryLowHR!==''&&num(f.recoveryLowHR)>=num(f.recoveryHighHR))return 'Enter both recovery HR bounds or leave both blank.';
  if(f.recoveryHighHR!==''&&f.highHR!==''&&num(f.recoveryHighHR)>num(f.highHR))return 'The recovery HR range must stay below the easy HR ceiling.';
  if(f.lthr!==''&&Math.max(num(f.highHR),num(f.recoveryHighHR))>=num(f.lthr))return 'Easy and recovery HR must stay below threshold HR.';
  if(f.maxHR!==''&&(Math.max(num(f.highHR),num(f.recoveryHighHR))>num(f.maxHR)||num(f.lthr)>num(f.maxHR)))return 'HR range and threshold HR must not exceed maximum HR.';
  if(f.injury)return 'Current injury or concerning symptoms require individual review before generating a programme.';
  if(f.interrupted&&f.goal!=='return')return 'Choose Return to running after a recent interruption.';
 }
 if(step===2){
  if(f.goal==='return'&&Number(f.runs)>3)return 'Choose up to three walk–run sessions per week.';
  if(!f.available.length||Number(f.runs)>f.available.length)return 'Select enough available days.';
  if(f.goal!=='return'&&!f.available.includes(Number(f.longDay)))return 'Select an available long-run day.';
  if(!(num(f.weekday)>0)||(f.goal!=='return'&&!(num(f.longMinutes)>0)))return 'Enter positive session time limits.';
  if(Object.values(durationOverrides(f)).some(minutes=>!Number.isInteger(minutes)||minutes<1))return 'Enter day-specific limits in whole minutes.';
 }
 return '';
}
function capture(el){
 const f=form(),k=el.dataset.m882Field,day=el.dataset.m882Day,adapt=el.dataset.m882Adapt,limit=el.dataset.m882DayLimit;
 if(limit!==undefined)f.dayMinutes[limit]=el.value;
 if(k){
  f[k]=el.type==='checkbox'?el.checked:el.value;
  if(Object.hasOwn(f.sources,k)){
   f.sources[k]=el.value?'Athlete entered':'';
   const label=el.parentElement.querySelector('[data-m882-source]');if(label){label.textContent=f.sources[k];label.hidden=!f.sources[k]}
  }
 }
 if(day){const d=Number(el.value);f[day]=el.checked?[...new Set([...f[day],d])]:f[day].filter(x=>x!==d)}
 if(adapt)f.adapt[adapt]=el.type==='checkbox'?el.checked:el.value;
}
let previewToken=null;
const previewKey=(f,config,result)=>JSON.stringify([f.owner,config,result,existing(f).map(w=>[w.id,w.date,w.name,w.status,w.km])]);
function review(f){
 const config=input(f),result=api.generate(config);previewToken=previewKey(f,config,result);
 if(!result.ok)return '<div class="item" role="alert">'+result.errors.map(x=>'<p>'+esc(x)+'</p>').join('')+'</div>';
 const collisions=existing(f),overlappingRuns=collisions.some(w=>w.sport==='Running'&&w.status!=='done'&&!w.matchId),byDate=new Map();for(const x of collisions){const arr=byDate.get(x.date)||[];arr.push(x.name);byDate.set(x.date,arr)}
 const isReturn=result.goal==='return';
 const total=isReturn?null:result.weeks.reduce((sum,w)=>sum+w.meters,0),minutes=result.weeks.reduce((sum,w)=>sum+w.plannedMinutes,0),sessions=result.weeks.flatMap(w=>w.sessions);
 const estimatedDistance=sessions.some(session=>session.fixedMeters!=null);
 const summary=isReturn?'~'+Math.round(minutes/60*10)/10+' h total · Easy walk–run effort':('Baseline '+result.baseline.km.toFixed(1)+' km/week ('+esc(result.baseline.source)+') · Estimated '+Math.round(minutes/60*10)/10+' h total');
 const hard=sessions.filter(x=>x.demanding).length,hardM=sessions.flatMap(x=>x.structuredSteps).filter(x=>x.intensity==='interval').reduce((s,x)=>s+(x.duration.meters??0),0);
 return (overlappingRuns?'<p role="alert">An existing visible running programme overlaps this plan. Change dates or manage that plan before creating another running programme.</p>':'')+'<div class="mile873-review-intro"><h3>'+esc(goals.find(g=>g[0]===f.goal)?.[1])+'</h3><div class="mile873-metrics"><div><strong>'+result.weeks.length+'</strong><small>Weeks</small></div><div><strong>'+sessions.length+'</strong><small>Sessions</small></div><div><strong>'+kmText(total)+'</strong><small>'+(estimatedDistance?'Planned distance est.':'Total')+'</small></div></div><p class="muted small">'+summary+(isReturn?'':' · '+hard+' demanding runs · '+Math.round(hardM/total*100)+'% distance in prescribed quality segments (not measured HR distribution).')+'</p></div><p class="muted small"><strong>Goal feasibility:</strong> '+(result.feasibilityDetail?.status==='caution'?'Extra preparation caution.':'Review required.')+' MILE has not validated your target time or race readiness. '+esc([...new Set([...(result.feasibilityDetail?.reasons||[]),...result.warnings])].join(' '))+'</p>'+result.weeks.map(w=>'<details class="item m882-week"><summary><strong>Week '+w.week+' · '+esc(w.phase)+'</strong> · '+kmText(w.meters)+' · ~'+w.plannedMinutes+' min</summary>'+w.sessions.map(s=>'<details class="m882-session"><summary><strong>'+esc(nice(s.date))+' · '+esc(s.name)+'</strong><span>'+sessionDistance(s)+' · ~'+s.plannedMinutes+' min'+'</span></summary>'+sessionMarkup({...s,sport:'Running'})+'<p><strong>Session Purpose:</strong> '+esc(s.purpose)+'</p><p><strong>Session Focus:</strong> '+esc(s.focus)+'</p>'+(byDate.has(s.date)?'<p class="muted small">Other sessions: '+esc(byDate.get(s.date).join(', '))+'</p>':'')+'</details>').join('')+'</details>').join('')+'<p class="muted small">Other programmes remain unchanged. Adaptation preferences are saved for a later release; automatic adjustments and Garmin revisions are not active in this build.</p>';
}
function draw(){
 const f=form(),step=Math.max(0,Math.min(4,v42Step)),h=history();let content='';
 if(step===0)content='<h2>01 · Goal & programme</h2><div class="sport-tiles">'+v41SportNames.map(x=>'<button class="sport-tile '+(x==='Running'?'selected':'')+'" onclick="v42PickSport(\''+esc(x)+'\')"><span style="font-size:22px">'+v41SportIcons[x]+'</span><strong>'+esc(x)+'</strong></button>').join('')+'</div><div class="formgrid">'+select(f,'goal','Running goal',goals)+field(f,'weeks','Programme duration (weeks)','number','min="1" max="52"')+field(f,'start','Start date','date')+field(f,'raceDate','Race date (optional)','date')+field(f,'target','Goal time (optional, hh:mm:ss)','text')+field(f,'name','Programme name (optional)')+'</div>';
 if(step===1)content='<h2>02 · Athlete fitness</h2><p class="muted small">Recorded running history through '+esc(nice(h.end))+'. Totals reflect imported records only; gaps may be missing data.</p><div class="m882-history">'+h.windows.map(x=>'<div><strong>'+x.days+' days</strong>'+(x.runs?'<span>'+x.km+' km · '+x.runs+(x.runs===1?' recorded run':' recorded runs')+'</span><small>Longest: '+x.longest+' km</small>':'<span>No runs recorded</span>')+'</div>').join('')+'</div><div class="formgrid">'+select(f,'level','Experience',levels)+(f.goal==='return'?field(f,'returnMinutes','Recent comfortable walk–run duration (min)','number','min="6" max="20"'):field(f,'volume','Confirm sustainable weekly km','number','min="0" step="0.1"'))+field(f,'longest','Longest recent run (km)','number','min="0" step="0.1"')+field(f,'five','Recent 5K time (mm:ss)')+field(f,'easy','Easy pace (mm:ss/km)')+field(f,'threshold','Threshold pace (mm:ss/km)')+field(f,'maxHR','Maximum HR (optional)','number')+field(f,'lthr','Lactate threshold HR (optional)','number')+field(f,'restingHR','Resting HR (optional)','number')+field(f,'lowHR','Easy HR lower bound','number')+field(f,'highHR','Easy HR upper bound','number')+field(f,'recoveryLowHR','Recovery HR lower bound (optional)','number')+field(f,'recoveryHighHR','Recovery HR upper bound (optional)','number')+select(f,'recovery','Current recovery',[['unknown','Not assessed'],['normal','Normal for me'],['poor','Poor recovery']])+'</div><p class="muted small">Saved athlete-profile benchmarks and preferences are prefilled when available. Imported volume and longest run are estimates you can correct. Blank values remain unknown.</p>'+check(f,'completeHistory','I confirm all four recent 7-day history windows are complete (including any zero-run weeks).')+check(f,'interrupted','Recent significant training interruption')+check(f,'injury','Current injury or concerning symptoms');
 if(step===2)content='<h2>03 · Training schedule</h2><div class="formgrid">'+select(f,'runs','Runs per week',names.map((_,i)=>[i+1,i+1]))+(f.goal==='return'?'':select(f,'longDay','Preferred long run',names.map((n,i)=>[i,n])))+field(f,'weekday','Standard run maximum (min)','number','min="1"')+(f.goal==='return'?'':field(f,'longMinutes','Long-run maximum (min)','number','min="1"'))+'</div><h3>Available days</h3>'+days(f,'available')+dayLimits(f)+'<h3>Demanding other-sport days</h3>'+days(f,'demanding')+'<p class="muted small">Existing visible demanding sessions are also considered. '+existing(f).length+' other scheduled sessions are in this programme period.</p>';
 if(step===3){const a=f.adapt;content='<h2>04 · Training intelligence</h2><p class="muted small">MILE Recommended is selected by default. These preferences are recorded but automatic changes are not yet enabled.</p><div class="formgrid">'+select(a,'mode','Adaptation',[['automatic','MILE Recommended · Automatic'],['manual','Manual review']]).replace('data-m882-field','data-m882-adapt')+select(a,'priority','Primary sport',sports.map(sport=>[sport,sport])).replace('data-m882-field','data-m882-adapt')+select(a,'intervalRecovery','Interval recovery',[['time','Timed recovery'],['heart_rate','Heart rate with timed fallback'],['distance','Distance-based recovery']]).replace('data-m882-field','data-m882-adapt')+field(a,'secondary','Secondary sports / commitments').replace('data-m882-field','data-m882-adapt')+select(a,'notifications','Notifications',[['significant','Significant changes only'],['all','All changes'],['none','No adaptation alerts']]).replace('data-m882-field','data-m882-adapt')+'</div>'+settings.map(([k,l])=>check(a,k,l,'data-m882-adapt')).join('');}
 if(step===4)content='<h2>05 · Full programme review</h2>'+review(f);
 document.getElementById('app').innerHTML='<div class="grid"><section class="card full m882-build"><div class="row between"><div><div class="eyebrow">TRAINING STUDIO</div><h2>Build your running plan</h2></div><span class="pill">STEP '+(step+1)+' OF 5</span></div><div class="v42-steps">'+[0,1,2,3,4].map(i=>'<span class="'+(i<=step?'on':'')+'"></span>').join('')+'</div>'+content+'<p data-m882-error role="status" class="muted small"></p><div class="row between" style="margin-top:16px"><button type="button" class="btn alt" data-m882-action="back" '+(step===0?'disabled':'')+'>‹ Back</button><button type="button" class="btn" data-m882-action="'+(step===4?'save':'next')+'" '+(step===4&&!api.generate(input(f)).ok?'disabled':'')+'>'+(step===4?'Create training plan':'Continue ›')+'</button></div></section><section class="card full"><h2>Existing programmes</h2><div class="list">'+state.blocks.map(x=>'<div class="item row between"><div><strong>'+esc(x.name)+'</strong><div class="muted small">'+esc(x.sport)+' · '+esc(nice(x.start))+' to '+esc(nice(x.end))+'</div></div><button class="btn alt sm" onclick="activateBlock(\''+esc(x.id)+'\')">'+(x.id===state.activeBlock?'Selected':'Select')+'</button></div>').join('')+'</div></section></div>';
}
function report(message){const el=document.querySelector('[data-m882-error]');if(el)el.textContent=message;else notice(message)}
function create(){
 const f=form();if(!v4Ready||!userId||String(userId)!==f.owner)return report('Sign in before saving.');
 for(let i=0;i<3;i++){const error=validStage(f,i);if(error)return report(error)}
 const config=input(f),result=api.generate(config);if(!result.ok)return report(result.errors.join(' '));
 if(previewToken!==previewKey(f,config,result)){draw();return report('Training data changed since your review. Check the updated programme before saving.');}
 const others=existing(f);
 if(others.some(w=>w.sport==='Running'&&w.status!=='done'&&!w.matchId))return report('An existing visible running programme overlaps this plan. Change your programme dates or manage that plan before adding additional running volume.');
 if(!confirm('Create '+result.weeks.reduce((n,w)=>n+w.sessions.length,0)+' running sessions? '+others.length+' existing sessions will be preserved. No workouts will be sent to Garmin automatically.'))return;
 const id=uid(),name=f.name||'Running · '+goals.find(g=>g[0]===f.goal)[1],items=result.weeks.flatMap(w=>w.sessions.map(s=>{const detail=compactDetail(s);return {...s,id:uid(),block:id,sport:'Running',status:'planned',note:'',matchId:null,detail,structuredDetail:detail,runningPlanVersion:2,revision:1,whyScheduled:'Phase: '+s.phase+'.'}}));
 if(!items.length)return report('No sessions to save.');
 state.blocks.push({id,name,sport:'Running',start:f.start,end:add(f.start,Number(f.weeks)*7-1),active:true,goal:f.goal,level:f.level,v42:{weeks:result.weeks.length,days:Number(f.runs),available:result.chosenDays},runningPlan:{version:1,config,baseline:result.baseline,warnings:result.warnings}});
 state.workouts.push(...items);state.activeBlock=id;calendarMonth=f.start.slice(0,7);viewDate=f.start;v42Step=0;v42Form={};save();navigate('builder');if(root.milePlanCreated)root.milePlanCreated(id);else notice('Training plan created');
}
document.addEventListener('input',e=>{if(e.target.closest?.('.m882-build')&&e.target.matches('[data-m882-field],[data-m882-day],[data-m882-adapt],[data-m882-day-limit]'))capture(e.target)});
document.addEventListener('change',e=>{if(e.target.closest?.('.m882-build')&&e.target.matches('[data-m882-field],[data-m882-day],[data-m882-adapt],[data-m882-day-limit]'))capture(e.target)});
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-m882-action]');if(!b||!b.closest('.m882-build'))return;e.preventDefault();const a=b.dataset.m882Action;if(a==='back'){v42Step=Math.max(0,v42Step-1);draw()}else if(a==='next'){const message=validStage(form(),v42Step);if(message)return report(message);v42Step=Math.min(4,v42Step+1);draw()}else if(a==='save'){b.disabled=true;try{create()}finally{if(b.isConnected)b.disabled=false}}});
v42Move=function(n){if(v42Sport!=='Running')return legacyMove.apply(this,arguments);if(n>0){const message=validStage(form(),v42Step);if(message)return report(message)}v42Step=Math.max(0,Math.min(4,v42Step+n));draw()};
v41Builder=function(){return v42Sport==='Running'?draw():legacyBuild.apply(this,arguments)};
v42PickSport=function(sp){if(sp==='Running'){v42Sport=sp;v42Step=0;v42Form={};draw();return}return legacyPick.apply(this,arguments)};
v42RegenerateWeek=function(id,week){const b=state.blocks.find(x=>x.id===id);if(b?.runningPlan)return notice('Personalised running week adjustments are not yet available. Existing sessions are preserved.');return legacyRegen.apply(this,arguments)};
mileCoachWhyHtml=function(w){if(!w.runningPlanVersion)return legacyWhy(w);return '<details class="mile-coach-why"><summary>Session Purpose & Focus</summary><div class="mile-coach-why-body"><strong>Session Purpose</strong><p>'+esc(w.purpose)+'</p><strong>Session Focus</strong><p>'+esc(w.focus)+'</p></div></details>'};
workoutCard=function(w){
 const html=legacyCard.apply(this,arguments);
 if(w.sport!=='Running')return html;
 const summary=w.runningPlanVersion&&Number.isFinite(w.plannedMinutes)?'<div class="v44-session-zone">'+esc(w.fixedMeters!=null?'Estimated':'Planned')+' · ~'+esc(w.plannedMinutes)+' min</div>':'';
 return html.replace(/<div class="v44-session-zone">[^<]*<\/div>/,summary);
};
root.mileRunningBuild={history,compactDetail,sessionMarkup,sessionDistance};
})(globalThis);
