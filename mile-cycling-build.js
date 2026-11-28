/* Cycling adapter for the existing Build navigation, private profile and Calendar. */
(function (root) {
'use strict';
const policy=root.mileCyclingPlan, prescription=root.mileStructuredWorkout;
const legacy={builder:v41Builder,pick:v42PickSport,move:v42Move,regenerate:v42RegenerateWeek,why:mileCoachWhyHtml};
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const sportNames=['Cycling','Running','Swimming','HYROX','Strength','Triathlon'];
const names=values=>values.map(value=>[value,value[0].toUpperCase()+value.slice(1)]);
const number=value=>value===''||value==null?null:Number(value);
const eventGoal=goal=>!['fitness','ftp'].includes(goal);
let draft,reviewKey;
function profile(){
 const saved=state.settings.cyclingProfile;
 return saved&&saved.version===1?saved:{};
}
function history(){
 const end=add(today(),-1),rows=[],seen=new Set();
 for(const a of state.activities||[]){
  if(!(a.sport==='Cycling'||sportOf(a)==='Cycling')||a.id==null)continue;
  const date=activityDate(a), minutes=activityDuration(a),key=String(a.provider||'garmin')+':'+a.id;
  if(!date||date<add(end,-179)||date>end||minutes<=0||minutes>1440||seen.has(key))continue;
  seen.add(key);
  rows.push({date,minutes});
 }
 return [7,28,90,180].map(days=>{
  const recent=rows.filter(row=>row.date>=add(end,1-days));
  return {days,count:recent.length,minutes:Math.round(recent.reduce((n,row)=>n+row.minutes,0)),
   longest:recent.length?Math.round(Math.max(...recent.map(row=>row.minutes))):null};
 });
}
function form(){
 const owner=String(userId||'');
 if(draft?.owner===owner)return draft;
 const saved=profile(), shared=root.mileAthleteProfile?.read(),h=history();
 const settings=state.settings.trainingPreferences773?.Cycling||{};
 const experience={beginner:'beginner',regular:'recreational',experienced:'advanced',competitive:'competitive'}[shared?.athlete?.experience];
 const latest=root.mileCyclingIQ.ftpAt(saved.ftpHistory,today());
 draft={owner,dateText:{},goal:'fitness',weeks:'8',start:today(),name:'',eventDate:'',distanceKm:'',elevation:'',course:'',
  level:saved.level||experience||'beginner',setting:saved.setting||'mixed',surface:saved.surface||'road',
  weeklyMinutes:saved.weeklyMinutes??(h[1].count?Math.round(h[1].minutes/4):''),
  longestMinutes:saved.longestMinutes??h[2].longest??'', powerMeter:!!saved.powerMeter,smartTrainer:!!saved.smartTrainer,
  hrMonitor:!!saved.hrMonitor,cadence:!!saved.cadence, ftp:latest?.watts??'',ftpDate:latest?.date??today(),
  ftpMethod:latest?.method??'Athlete estimate',ftpSource:latest?.source??'manual',ftpConfidence:latest?.confidence??'moderate',
  lthr:saved.lthr??'',maxHr:saved.maxHr??'', hrLow:saved.hrZones?.aerobic?.[0]??'',hrHigh:saved.hrZones?.aerobic?.[1]??'',
  hrRecoveryLow:saved.hrZones?.easy?.[0]??'',hrRecoveryHigh:saved.hrZones?.easy?.[1]??'',
  hrSteadyLow:saved.hrZones?.steady?.[0]??'',hrSteadyHigh:saved.hrZones?.steady?.[1]??'',
  recovery:Number(state.checkins?.[today()]?.fatigue)>=7?'poor':'unknown',interrupted:false,unwell:false,assessment:false,
  available:saved.available??settings.available??[1,3,5],daysLimit:saved.daysLimit??Math.min(3,(settings.available||[1,3,5]).length),
  longDay:saved.longDay??settings.longDay??(settings.available?.includes(5)?5:settings.available?.[0]??5),
  dayMinutes:{0:45,1:45,2:45,3:45,4:45,5:90,6:60,...saved.dayMinutes},hardDays:[],
  priority:sportNames.includes(shared?.primarySport)?shared.primarySport:'Cycling',otherSports:(shared?.sports||[]).filter(sport=>sport!=='Cycling').join(', '),
  sources:{weeklyMinutes:saved.weeklyMinutes!=null?'Saved cycling profile':h[1].count?'Estimate from 28 recorded days · confirm or correct':'Unavailable',
   longestMinutes:saved.longestMinutes!=null?'Saved cycling profile':h[2].count?'Longest recorded ride in 90 days':'Unavailable',
   ftp:latest?(latest.source==='imported'?'Imported FTP':'Saved FTP'):'Unavailable',lthr:saved.lthr?'Saved cycling threshold':'Unavailable',
   maxHr:saved.maxHr?'Saved cycling maximum':'Unavailable'}
 };
 return draft;
}
const source=(f,key)=>Object.hasOwn(f.sources,key)?'<small class="muted" data-m90-source="'+key+'">'+esc(f.sources[key])+'</small>':'';
const field=(f,key,label,type='text',limits='')=>'<label class="field">'+esc(label)+'<input data-m90-field="'+key+'" type="'+type+'" value="'+esc(f[key]??'')+'" '+limits+'>'+source(f,key)+'</label>';
function dateField(f,key,label){
 const text=Object.hasOwn(f.dateText,key)?f.dateText[key]:f[key]?window.milePBDate(f[key]):'';
 return '<div class="field m90-date"><label for="m90-date-'+key+'">'+esc(label)+'</label>'+
  '<div class="m90-date-controls"><input id="m90-date-'+key+'" data-m90-date="'+key+'" type="text" inputmode="numeric" '+
  'maxlength="10" placeholder="DD/MM/YYYY" value="'+esc(text)+'">'+
  '<span class="m90-date-icon" aria-hidden="true">▦</span><input data-m90-picker="'+key+'" type="date" tabindex="-1" '+
  'aria-label="Choose '+esc(label)+' from calendar" value="'+esc(f[key]||'')+'"></div></div>';
}
function dateInput(text){
 const [day,month,year]=text.split('/');
 const date=year+'-'+month+'-'+day;
 return /^\d\d\/\d\d\/\d{4}$/.test(text)&&policy.iso(date)?date:'';
}
const select=(f,key,label,items)=>'<label class="field">'+esc(label)+'<select data-m90-field="'+key+'">'+items.map(([value,text])=>'<option value="'+esc(value)+'"'+(String(f[key])===String(value)?' selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>';
const check=(f,key,label)=>'<label class="m882-check"><input type="checkbox" data-m90-field="'+key+'" '+(f[key]?'checked':'')+'> '+esc(label)+'</label>';
const dayChecks=(f,key)=>'<div class="v42-checks">'+days.map((day,index)=>'<label><input type="checkbox" data-m90-day="'+key+'" value="'+index+'" '+(f[key].includes(index)?'checked':'')+'> '+day.slice(0,3)+'</label>').join('')+'</div>';
function existing(f){
 if(!/^\d{4}-\d\d-\d\d$/.test(f.start)||!Number.isFinite(Date.parse(f.start))||!(Number(f.weeks)>0&&Number(f.weeks)<=32))return [];
 return state.workouts.filter(w=>w.date>=add(f.start,-1)&&w.date<=add(f.start,Number(f.weeks)*7)&&w.status!=='skipped'&&v456Visible(w.block));
}
function config(f){
 const zone={};
 if(f.hrMonitor)for(const [name,low,high] of [['easy',f.hrRecoveryLow,f.hrRecoveryHigh],['aerobic',f.hrLow,f.hrHigh],['steady',f.hrSteadyLow,f.hrSteadyHigh]]){
  if(low!==''||high!=='')zone[name]=[number(low),number(high)];
 }
 const other=existing(f).filter(w=>w.sport!=='Cycling');
 const commitments=other.map(w=>({date:w.date,sport:w.sport,minutes:Number(w.plannedMinutes??w.durationMin)||0,hard:v43Hard(w),lowerBody:['Strength','HYROX'].includes(w.sport)}));
 if(commitments.some(w=>!w.minutes)){
  for(const item of commitments)if(!item.minutes)item.lowerBody=true;
 }
 if(/^\d{4}-\d\d-\d\d$/.test(f.start)&&Number.isFinite(Date.parse(f.start))&&Number(f.weeks)<=32)
  for(let i=-1;i<=Number(f.weeks)*7;i++){
   const date=add(f.start,i);
   if(f.hardDays.includes(policy.dayOf(date)))commitments.push({date,minutes:0,hard:true});
  }
 const activePower=f.powerMeter||f.smartTrainer;
 return {...f,eventDate:eventGoal(f.goal)?f.eventDate:'',weeks:Number(f.weeks),daysLimit:Number(f.daysLimit),longDay:Number(f.longDay),
  weeklyMinutes:number(f.weeklyMinutes),longestMinutes:number(f.longestMinutes),ftp:activePower?number(f.ftp):null,
  lthr:f.hrMonitor?number(f.lthr):null,maxHr:f.hrMonitor?number(f.maxHr):null,distanceKm:eventGoal(f.goal)?number(f.distanceKm):null,elevation:eventGoal(f.goal)?number(f.elevation):null,
  commitments,hrZones:zone,dayMinutes:Object.fromEntries(Object.entries(f.dayMinutes).map(([day,time])=>[day,Number(time)]))};
}
function stepLabel(step){
 return prescription.labels[step.intensity]+' · '+prescription.durationLabel(step.duration)+
  (prescription.targetLabel(step.target)?' · '+prescription.targetLabel(step.target):'')+
  (Array.isArray(step.target?.percentFtp)?' ('+step.target.percentFtp.join('–')+'% FTP)':'')+
  (step.description?' · '+step.description:'');
}
function lines(steps){
 return steps.map(step=>step.kind==='repeat'?step.count+' × ('+lines(step.steps).join(' / ')+')':stepLabel(step));
}
function sessionMarkup(w){
 if(w.sport!=='Cycling'||!w.cyclingPlanVersion||w.structuredDetail!==w.detail)return null;
 const totals=prescription.totals(w.structuredSteps,{sport:'Cycling'});
 if(!totals)return null;
 const steps=prescription.expand(w.structuredSteps,{sport:'Cycling'});
 const main=steps.find(step=>step.intensity==='interval')||steps.filter(step=>step.intensity==='active').sort((a,b)=>(b.duration.seconds??0)-(a.duration.seconds??0))[0];
 const headline=main?prescription.targetLabel(main.target):'';
 const profile=steps.map(step=>
  '<span title="'+esc(stepLabel(step))+'" data-intensity="'+step.intensity+'" style="--seconds:'+step.duration.seconds+'"></span>').join('');
 return '<div class="m90-session"><div class="muted small">'+esc([w.setting==='indoor'?'Indoor':'Outdoor',w.surface,headline,w.equipment].filter(Boolean).join(' · '))+'</div>'+
  '<div class="m90-profile" aria-hidden="true">'+profile+'</div><details class="mile-coach-why"><summary>Workout breakdown</summary>'+
  '<p class="small">'+esc(w.purpose||'')+' '+esc(w.focus||'')+'</p><ol>'+lines(w.structuredSteps).map(text=>'<li>'+esc(text)+'</li>').join('')+'</ol></details></div>';
}
const title=f=>f.name.trim()||'Cycling · '+policy.goals[f.goal];
function evaluation(f){
 const inputs=config(f), result=policy.generate(inputs);
 const overlap=existing(f).some(w=>w.sport==='Cycling'&&w.date>=f.start&&w.date<=add(f.start,Number(f.weeks)*7-1)&&w.status==='planned'&&!w.matchId);
 return {inputs,result,overlap,key:JSON.stringify([inputs,result,overlap])};
}
function preview(f){
 const {result,overlap,key}=evaluation(f);
 reviewKey=key;
 if(!result.ok)return '<p role="alert">'+esc(result.errors.join(' '))+'</p>';
 const weeks=result.weeks.map(week=>'<details class="item m882-week"><summary><strong>Week '+week.week+' · '+esc(week.phase)+'</strong> · '+prescription.time(week.plannedMinutes*60)+'</summary>'+
  week.sessions.map(session=>'<details class="m882-session"><summary><strong>'+esc(window.milePBDate(session.date))+' · '+esc(session.name)+'</strong><span>'+prescription.time(session.plannedMinutes*60)+'</span></summary>'+
   sessionMarkup(session)+'<p><strong>Purpose</strong> '+esc(session.purpose)+'</p><p><strong>Focus</strong> '+esc(session.focus)+'</p></details>').join('')+'</details>').join('');
 const method={power:'Power with effort guidance where appropriate',heart_rate:'Cycling heart rate for sustained work and RPE for shorter efforts',rpe:'Perceived effort'};
 return '<h3>'+esc(title(f))+'</h3><p>'+esc(method[result.method])+'</p>'+
  (overlap?'<p role="alert">An existing cycling plan overlaps these dates. Choose different dates or manage the existing programme.</p>':'')+
  (result.warnings.length?'<ul>'+result.warnings.map(warning=>'<li>'+esc(warning)+'</li>').join('')+'</ul>':'')+weeks;
}
function draw(){
 const f=form(),step=Math.max(0,Math.min(4,v42Step));
 let content='';
 if(step===0)content='<h3>Goal & programme</h3><div class="sport-tiles">'+v41SportNames.map(sport=>'<button type="button" class="sport-tile '+(sport==='Cycling'?'selected':'')+'" onclick="v42PickSport(\''+esc(sport)+'\')"><span>'+v41SportIcons[sport]+'</span><strong>'+esc(sport)+'</strong></button>').join('')+'</div>'+
  '<div class="formgrid">'+select(f,'goal','Cycling goal',Object.entries(policy.goals))+field(f,'weeks','Programme length (weeks)','number','min="1" max="32"')+
  dateField(f,'start','Start date')+(eventGoal(f.goal)?dateField(f,'eventDate','Event date (optional)')+
  field(f,'distanceKm','Event distance (km)','number','min="1" step="any"')+field(f,'elevation','Event elevation gain (m)','number','min="0"')+
  field(f,'course','Course notes','text','maxlength="240"'):'')+field(f,'name','Programme name','text','maxlength="80"')+'</div>';
 if(step===1){
  content='<h3>Athlete & equipment</h3><div class="m882-history">'+history().map(row=>'<div><strong>'+row.days+' days</strong><span>'+
   (row.count?row.count+' recorded · '+row.minutes+' min':'No rides recorded')+'</span></div>').join('')+'</div>'+
   '<div class="formgrid">'+select(f,'level','Cycling experience',names(policy.levels))+select(f,'setting','Riding setting',names(['mixed','indoor','outdoor']))+
   select(f,'surface','Bike type',names(['road','gravel','mountain','stationary']))+field(f,'weeklyMinutes','Confirm sustainable weekly minutes','number','min="15"')+
   field(f,'longestMinutes','Longest recent ride (minutes)','number','min="10"')+
   select(f,'recovery','How recovered do you feel?',[['unknown','Unassessed'],['normal','Normal for me'],['poor','Poor']])+'</div><div class="m90-checks">'+
   check(f,'powerMeter','Power meter')+check(f,'smartTrainer','Smart trainer')+check(f,'hrMonitor','Heart-rate monitor')+check(f,'cadence','Cadence sensor')+'</div>'+
   '<p class="muted small m90-help">You can train without sensors. Effort is rated out of 10. For an easy aerobic ride, keep talking comfortable.</p>'+
   (f.powerMeter||f.smartTrainer?'<div class="formgrid">'+field(f,'ftp','Cycling FTP (watts, optional)','number','min="50" max="600"')+
    dateField(f,'ftpDate','FTP assessment date')+select(f,'ftpConfidence','Confidence',[['low','Provisional estimate'],['moderate','Used for current rides'],['high','Recently confirmed']])+select(f,'ftpMethod','FTP assessment method',[['Athlete estimate','Athlete estimate'],['Sustained benchmark','Sustained benchmark'],['Coach assessment','Coach assessment']])+ '</div><p class="muted small">FTP is a benchmark for sustained cycling power. Leave it blank to train by feel or with heart rate.</p>':'')+
   (f.hrMonitor?'<div class="formgrid">'+
    field(f,'hrLow','Easy-ride heart rate from (bpm)','number')+field(f,'hrHigh','Easy-ride heart rate to (bpm)','number')+
    '</div><details class="item"><summary>Optional heart-rate details</summary><div class="formgrid">'+
    field(f,'lthr','Cycling threshold HR (bpm)','number')+field(f,'maxHr','Cycling maximum HR (bpm)','number')+
    field(f,'hrRecoveryLow','Recovery lower bound (bpm)','number')+field(f,'hrRecoveryHigh','Recovery upper bound (bpm)','number')+
    field(f,'hrSteadyLow','Steady lower bound (bpm)','number')+field(f,'hrSteadyHigh','Steady upper bound (bpm)','number')+
    '</div></details><p class="muted small">Enter a cycling range you already use for easy rides. Leave it blank to train by feel.</p>':'')+
   (f.powerMeter||f.smartTrainer?check(f,'assessment','Consider an optional sustained benchmark if eligible'):'')+
   check(f,'interrupted','Recent training interruption')+check(f,'unwell','Currently injured, unwell or experiencing concerning symptoms')+
   '<button type="button" class="btn alt" data-m90-action="athlete">Save cycling athlete details</button>';
 }
 if(step===2)content='<h3>Training schedule</h3><h3>Available days</h3>'+dayChecks(f,'available')+
  '<div class="formgrid">'+select(f,'longDay','Preferred long ride',days.map((d,i)=>[i,d]))+
  field(f,'daysLimit','Maximum rides per week','number','min="1" max="7"')+'</div><details class="item"><summary>Day-specific time limits</summary><div class="formgrid">'+
  days.map((day,index)=>'<label class="field">'+day+' maximum (min)<input data-m90-limit="'+index+'" type="number" min="15" max="480" value="'+esc(f.dayMinutes[index])+'"></label>').join('')+
  '</div></details><h3>Days with hard training in another sport</h3>'+dayChecks(f,'hardDays')+'<p class="muted small">Mark hard sessions that aren’t in Calendar, such as a long run or heavy leg session.</p>';
 if(step===3)content='<h3>MILE Intelligence</h3><div class="formgrid">'+select(f,'priority','Primary sport',sportNames.map(sport=>[sport,sport]))+
  field(f,'otherSports','Other sports or commitments','text','maxlength="160"')+'</div><p>MILE IQ explains what your ride data shows. In the beta, any workout adjustment needs your approval.</p>';
 if(step===4)content='<h3>Programme review</h3>'+preview(f);
 document.getElementById('app').innerHTML='<div class="grid"><section class="card full m882-build m90-build"><div class="row between"><h2>Build your cycling plan</h2><span class="pill">Step '+(step+1)+' of 5</span></div><div class="v42-steps" aria-hidden="true">'+
  days.slice(0,5).map((_,i)=>'<span class="'+(i<=step?'on':'')+'"></span>').join('')+'</div>'+content+'<div class="m90-action-tray"><p class="small" role="status" data-m90-error></p><div class="row between"><button type="button" class="btn alt" data-m90-action="back" '+(step===0?'disabled hidden':'')+'>‹ Back</button><button type="button" class="btn" data-m90-action="'+(step===4?'save':'next')+'">'+(step===4?'Create training plan':'Continue ›')+'</button></div></div></section></div>';
}
function report(message,error=true){
 const target=document.querySelector('[data-m90-error]');
 if(target){target.textContent=message;target.classList.toggle('m90-form-error',error);}
}
function valid(f,stage){
 if(stage===0&&(!policy.iso(f.start)||eventGoal(f.goal)&&f.dateText.eventDate&&!policy.iso(f.eventDate)))
  return 'Enter dates in DD/MM/YYYY format.';
 if(stage===1&&f.ftp&&f.dateText.ftpDate&&!policy.iso(f.ftpDate))return 'Enter the FTP assessment date in DD/MM/YYYY format.';
 if(stage===0&&(!f.start||f.start<today()||!Number.isInteger(Number(f.weeks))||!(Number(f.weeks)>=1&&Number(f.weeks)<=32)||eventGoal(f.goal)&&f.eventDate&&f.eventDate<=f.start))
  return 'Choose a start date today or later, 1–32 weeks and an event after the start.';
 if(stage===1&&(f.powerMeter||f.smartTrainer)&&f.ftp&&(!f.ftpDate||f.ftpDate>today()||!policy.iso(f.ftpDate)))return 'Enter an FTP assessment date today or earlier.';
 if(stage===1)return policy.validateAthlete(config(f)).join(' ');
 if(stage===2&&(!f.available.includes(Number(f.longDay))||f.available.length<Number(f.daysLimit)))return 'Choose an available long ride day and enough available days.';
 return '';
}
function savePlan(){
 const f=form(), {inputs,result,overlap,key}=evaluation(f);
 if(!v4Ready||!userId||String(userId)!==f.owner)return report('Sign in to create a plan.');
 if(!result.ok)return report(result.errors.join(' '));
 if(overlap)return report('An existing cycling programme overlaps these dates.');
 if(key!==reviewKey){draw();return report('Your schedule changed. Review the updated sessions before creating the plan.');}
 if(!confirm('Create this cycling plan in Calendar?'))return;
 const id=uid(),all=result.weeks.flatMap(week=>week.sessions).map(session=>{
  const detail=lines(session.structuredSteps).join('\n');
  return {...session,id:uid(),block:id,status:'planned',km:0,note:'',matchId:null,detail,structuredDetail:detail,revision:1};
 });
 state.blocks.push({id,name:title(f),sport:'Cycling',start:f.start,end:all.at(-1).date,active:true,goal:f.goal,level:f.level,
  cyclingPlan:{version:1,event:{date:inputs.eventDate,distanceKm:inputs.distanceKm,elevation:inputs.elevation,course:eventGoal(f.goal)?f.course:''},priority:f.priority,otherSports:f.otherSports,baseline:result.baseline,method:result.method,warnings:result.warnings}});
 state.workouts.push(...all);
 rememberAthlete(f,inputs,true);
 state.activeBlock=id;viewDate=f.start;calendarMonth=f.start.slice(0,7);
 draft=null;reviewKey=null;v42Step=0;
 save();navigate('calendar');
}
function rememberAthlete(f,inputs,schedule){
 const existing=profile(),existingHistory=existing.ftpHistory||[];
 const observation=inputs.ftp&&f.ftpDate?{watts:inputs.ftp,date:f.ftpDate,source:f.ftpSource,method:f.ftpMethod,confidence:f.ftpConfidence}:null;
 const ftpHistory=observation?[observation,...existingHistory.filter(x=>x.date!==observation.date)].slice(0,50):existingHistory;
 state.settings.cyclingProfile={...existing,version:1,level:f.level,setting:f.setting,surface:f.surface,weeklyMinutes:inputs.weeklyMinutes,longestMinutes:inputs.longestMinutes,
  powerMeter:f.powerMeter,smartTrainer:f.smartTrainer,hrMonitor:f.hrMonitor,cadence:f.cadence,ftpHistory,
  ...(f.hrMonitor?{lthr:inputs.lthr,maxHr:inputs.maxHr,hrZones:inputs.hrZones}:{}),
  ...(schedule?{available:f.available,daysLimit:inputs.daysLimit,longDay:inputs.longDay,dayMinutes:inputs.dayMinutes}:{})};
}
function saveAthlete(){
 const f=form();
 if(!v4Ready||!userId||String(userId)!==f.owner)return report('Sign in to save cycling athlete details.');
 const inputs=config(f),error=valid({...f,unwell:false},1);
 if(error)return report(error);
 rememberAthlete(f,inputs,false);
 save();
 report('Cycling athlete details saved.',false);
}
function move(n){
 const f=form(),error=n>0?valid(f,v42Step):'';
 if(error)return report(error);
 v42Step=Math.max(0,Math.min(4,v42Step+n));draw();
 const heading=document.querySelector('.m90-build > h3');
 heading.tabIndex=-1;heading.focus({preventScroll:true});
 heading.scrollIntoView({block:'nearest'});
}
document.addEventListener('input',event=>{
 const el=event.target;
 if(!el.closest('.m90-build'))return;
 const f=form(),key=el.dataset.m90Field,day=el.dataset.m90Day;
 const dateKey=el.dataset.m90Date??el.dataset.m90Picker;
 if(dateKey){
  const text=document.getElementById('m90-date-'+dateKey);
  const takingFromPicker=el!==text;
  const picker=takingFromPicker?el:el.parentElement.querySelector('[data-m90-picker]');
  if(takingFromPicker)text.value=el.value?window.milePBDate(el.value):'';
  else if(event.inputType!=='deleteContentBackward'&&text.selectionStart===text.value.length){
   const digits=text.value.replace(/\D/g,'').slice(0,8);
   text.value=[digits.slice(0,2),digits.slice(2,4),digits.slice(4)].filter(Boolean).join('/');
  }
  f.dateText[dateKey]=text.value;
  f[dateKey]=dateInput(text.value);
  if(!takingFromPicker)picker.value=f[dateKey];
  if(dateKey==='ftpDate')f.ftpSource='manual';
 }
 if(key){
  f[key]=el.type==='checkbox'?el.checked:el.value;
  if(Object.hasOwn(f.sources,key)){
   f.sources[key]=el.value?'Athlete entered':'Unavailable';
   el.parentElement.querySelector('[data-m90-source]').textContent=f.sources[key];
  }
  if(key==='ftp'||key==='ftpDate'||key==='ftpMethod'||key==='ftpConfidence')f.ftpSource='manual';
  if(['goal','powerMeter','smartTrainer','hrMonitor'].includes(key)){
   const offset=window.scrollY;
   draw();
   document.querySelector('[data-m90-field="'+key+'"]').focus({preventScroll:true});
   window.scrollTo(0,offset);
  }
 }
 if(day)f[day]=el.checked?[...new Set([...f[day],Number(el.value)])]:f[day].filter(value=>value!==Number(el.value));
 if(el.dataset.m90Limit!=null)f.dayMinutes[el.dataset.m90Limit]=el.value;
});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-m90-action]');
 if(!button||!button.closest('.m90-build'))return;
 if(button.dataset.m90Action==='save')savePlan();
 else if(button.dataset.m90Action==='athlete')saveAthlete();
 else move(button.dataset.m90Action==='next'?1:-1);
});
function setKeyboardOffset(){
 const viewport=window.visualViewport, build=document.querySelector('.m90-build');
 if(!viewport||!build)return;
 const inset=Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop);
 build.style.setProperty('--m90-keyboard-offset',inset+'px');
 build.toggleAttribute('data-m90-keyboard',inset>110&&build.contains(document.activeElement));
}
window.visualViewport?.addEventListener('resize',setKeyboardOffset);
window.visualViewport?.addEventListener('scroll',setKeyboardOffset);
document.addEventListener('focusin',setKeyboardOffset);
document.addEventListener('focusout',()=>requestAnimationFrame(setKeyboardOffset));
v41Builder=function(){return v42Sport==='Cycling'?draw():legacy.builder.apply(this,arguments);};
v42PickSport=function(sport){
 if(sport!=='Cycling')return legacy.pick.apply(this,arguments);
 v42Sport=sport;v42Step=0;v42Form={};draft=null;reviewKey=null;draw();
};
v42Move=function(n){return v42Sport==='Cycling'?move(n):legacy.move.apply(this,arguments);};
v42RegenerateWeek=function(id,week){
 if(state.blocks.find(block=>block.id===id)?.cyclingPlan)return notice('Review cycling suggestions in MILE IQ. Saved rides are preserved.');
 return legacy.regenerate.apply(this,arguments);
};
mileCoachWhyHtml=function(w){
 if(!w.cyclingPlanVersion)return legacy.why(w);
 return '<details class="mile-coach-why"><summary>Session Purpose & Focus</summary><div class="mile-coach-why-body"><strong>Session Purpose</strong><p>'+esc(w.purpose)+'</p><strong>Session Focus</strong><p>'+esc(w.focus)+'</p></div></details>';
};
root.mileCyclingBuild={history,profile,sessionMarkup};
})(globalThis);
