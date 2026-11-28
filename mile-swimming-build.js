/* Adapter for the existing Build and Calendar using the private athlete document. */
(function(root){
'use strict';
const policy=root.mileSwimmingPlan, structured=root.mileStructuredWorkout;
const legacy={builder:v41Builder,pick:v42PickSport,move:v42Move,why:mileCoachWhyHtml};
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const sports=['Swimming','Running','Cycling','HYROX','Strength','Triathlon'];
const kit={board:'Kickboard',buoy:'Pull buoy',fins:'Short fins'};
const toNumber=value=>value===''||value==null?null:Number(value);
const dateText=value=>root.milePBDate(value);
const profile=()=>state.settings.swimmingProfile?.version===1?state.settings.swimmingProfile:{};
let draft,reviewKey;

function history(){
 const end=add(today(),-1),seen=new Set(),rows=[];
 for(const activity of state.activities||[]){
  if(activity.id==null||sportOf(activity)!=='Swimming'&&activity.sport!=='Swimming')continue;
  const id=String(activity.id),date=activityDate(activity),meters=Math.round(Number(activity.distanceKm)*1000);
  if(seen.has(id)||!policy.iso(date)||date>end||date<add(end,-179)||!Number.isFinite(meters)||meters<=0||meters>50000)continue;
  seen.add(id);rows.push({date,meters});
 }
 return [7,28,90,180].map(days=>{
  const recent=rows.filter(item=>item.date>=add(end,1-days));
  return {days,meters:recent.reduce((sum,item)=>sum+item.meters,0),count:recent.length,longest:Math.max(0,...recent.map(item=>item.meters))};
 });
}
function form(){
 const owner=String(userId||'');
 if(draft?.owner===owner)return draft;
 const saved=profile(),shared=root.mileAthleteProfile?.read(),records=history();
 const experience={beginner:'beginner',regular:'recreational',experienced:'advanced',competitive:'competitive'}[shared?.athlete?.experience];
 const availability=state.settings.trainingPreferences773?.Swimming?.available;
 draft={owner,goal:'fitness',start:today(),weeks:'8',eventDate:'',eventMeters:'', name:'',level:saved.level||experience||'beginner',
  weeklyMeters:saved.weeklyMeters??(records[1].count?Math.round(records[1].meters/4):''),
  longestMeters:saved.longestMeters??(records[2].longest||''),continuous:saved.continuous??'',poolLength:saved.poolLength??25,
  setting:saved.setting??'pool',equipment:Array.isArray(saved.equipment)?saved.equipment:[],available:saved.available??availability??[0,2,5],
  dayMinutes:{0:45,1:45,2:45,3:45,4:45,5:60,6:60,...saved.dayMinutes},
  css:saved.css?.poolLength===saved.poolLength&&saved.css?.date>=add(today(),-90)?saved.css.pace:'',
  cssSource:saved.css?.source??'Athlete entered',easyPace:saved.easyPace??'', priority:sports.includes(shared?.primarySport)?shared.primarySport:'Swimming',
  seconds400:'',seconds200:'',comparable:false,showAssessment:false,supervised:false,unwell:false,interrupted:false,recovery:'unknown',otherDays:[],
  volumeHint:saved.weeklyMeters!=null?'Saved profile':records[1].count?'Estimate from 28 recorded days. Confirm or correct.':'Unavailable',
  longestHint:saved.longestMeters!=null?'Saved profile':records[2].count?'Longest recorded swim in 90 days. Confirm or correct.':'Unavailable'};
 return draft;
}
const input=(f,key,label,type='number',constraints='')=>'<label class="field">'+esc(label)+
 '<input data-m91-field="'+key+'" type="'+type+'" value="'+esc(f[key]??'')+'" '+constraints+'></label>';
const select=(f,key,label,options)=>'<label class="field">'+esc(label)+'<select data-m91-field="'+key+'">'+options.map(([id,title])=>
 '<option value="'+esc(id)+'"'+(String(f[key])===String(id)?' selected':'')+'>'+esc(title)+'</option>').join('')+'</select></label>';
const check=(f,key,label)=>'<label class="m882-check"><input data-m91-field="'+key+'" type="checkbox"'+(f[key]?' checked':'')+'> '+esc(label)+'</label>';
const list=(f,key,options)=>'<div class="v42-checks">'+options.map(([id,title])=>'<label><input data-m91-list="'+key+'" type="checkbox" value="'+esc(id)+'"'+
 (f[key].includes(id)?' checked':'')+'> '+esc(title)+'</label>').join('')+'</div>';
const namePairs=items=>items.map(item=>[item,item[0].toUpperCase()+item.slice(1)]);
function relevant(f){
 if(!policy.iso(f.start)||!Number.isInteger(Number(f.weeks))||Number(f.weeks)<1||Number(f.weeks)>32)return [];
 const end=add(f.start,Number(f.weeks)*7);
 return state.workouts.filter(w=>w.date>=add(f.start,-1)&&w.date<=end&&w.status!=='skipped'&&v456Visible(w.block));
}
function config(f){
 const commitments=relevant(f).filter(w=>w.sport!=='Swimming').map(w=>({date:w.date,minutes:Number(w.plannedMinutes??w.durationMin)||0,
  hard:w.demanding??v43Hard(w),upperBody:['Strength','HYROX'].includes(w.sport)}));
 if(policy.iso(f.start)&&Number.isInteger(Number(f.weeks))&&Number(f.weeks)<=32)
  for(let n=-1;n<=Number(f.weeks)*7;n++){
   const date=add(f.start,n);
   if(f.otherDays.includes((new Date(date+'T12:00Z').getUTCDay()+6)%7))commitments.push({date,hard:true});
  }
 return {...f,weeks:Number(f.weeks),poolLength:Number(f.poolLength),eventMeters:toNumber(f.eventMeters),
  continuous:toNumber(f.continuous),weeklyMeters:toNumber(f.weeklyMeters),longestMeters:toNumber(f.longestMeters),
  css:toNumber(f.css),easyPace:toNumber(f.easyPace),commitments};
}
function lines(steps){
 return steps.map(step=>step.kind==='repeat'?step.count+' × ('+lines(step.steps).join(' / ')+')':[
  structured.labels[step.intensity],structured.durationLabel(step.duration),structured.targetLabel(step.target),step.description
 ].filter(Boolean).join(' · '));
}
function summary(w){
 return w.setting==='open'?structured.time(w.estimatedSeconds)+' · Open water':structured.distance(w.meters)+' · ~'+structured.time(w.plannedMinutes*60);
}
function sessionMarkup(w,draftSession=false){
 if(w.sport!=='Swimming'||w.swimmingPlanVersion!==1||!draftSession&&w.detail!==w.structuredDetail)return null;
 if(!structured.totals(w.structuredSteps,{sport:'Swimming'}))return null;
 return '<div class="m91-session"><p class="muted small">'+esc([
  w.setting==='open'?'Supervised open water':w.poolLength+' m pool',w.target,kit[w.equipment],w.paceEstimate?'Duration is a planning estimate':''
 ].filter(Boolean).join(' · '))+'</p><details class="mile-coach-why"><summary>Swim breakdown</summary>'+
 '<div class="mile-coach-why-body"><p>'+esc(w.purpose)+'</p><p>'+esc(w.focus)+'</p>'+
 (w.safety?'<p>'+esc(w.safety)+'</p>':'')+
 '<ol>'+lines(w.structuredSteps).map(text=>'<li>'+esc(text)+'</li>').join('')+'</ol></div></details></div>';
}
function evaluate(f){
 const settings=config(f),plan=policy.generate(settings);
 const overlap=relevant(f).some(w=>w.sport==='Swimming'&&w.date>=f.start&&w.status==='planned'&&!w.matchId);
 return {settings,plan,overlap,key:JSON.stringify([plan,overlap,settings.commitments])};
}
function review(f){
 const {plan,overlap,key}=evaluate(f);
 reviewKey=key;
 if(!plan.ok)return '<p role="alert">'+esc(plan.errors.join(' '))+'</p>';
 return (overlap?'<p role="alert">An existing swimming programme overlaps this schedule.</p>':'')+
  (plan.warnings.length?'<ul>'+plan.warnings.map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul>':'')+
  plan.weeks.map(w=>'<details class="item m882-week"><summary><strong>Week '+w.week+' · '+esc(w.phase)+'</strong> · '+
   (w.meters?esc(structured.distance(w.meters))+' pool · ':'')+w.minutes+' min total</summary>'+
   w.sessions.map(s=>'<details class="m882-session"><summary><strong>'+esc(dateText(s.date))+' · '+esc(s.name)+'</strong><span>'+
    esc(summary(s))+'</span></summary>'+sessionMarkup(s,true)+'</details>').join('')+'</details>').join('');
}
function draw(){
 const f=form(),step=v42Step;
 const available=days.map((day,index)=>[index,day.slice(0,3)]);
 const weeks=input(f,'weeks','Programme length (weeks)','number','min="1" max="32"');
 let content='';
 if(step===0)content='<h3>Goal & programme</h3><div class="sport-tiles">'+v41SportNames.map(sport=>
  '<button type="button" class="sport-tile '+(sport==='Swimming'?'selected':'')+'" onclick="v42PickSport(\''+esc(sport)+'\')"><span>'+
  v41SportIcons[sport]+'</span><strong>'+esc(sport)+'</strong></button>').join('')+'</div>'+
  '<div class="formgrid">'+select(f,'goal','Swimming goal',Object.entries(policy.goals))+weeks+
  input(f,'start','Start date','date')+input(f,'name','Programme name (optional)','text','maxlength="80"')+
  input(f,'eventDate','Event date (optional)','date')+input(f,'eventMeters','Event distance (metres, optional)')+'</div>';
 if(step===1)content='<h3>Athlete & equipment</h3><div class="m882-history">'+history().map(w=>'<div><strong>'+w.days+
  ' days</strong><span>'+(!w.count?'No swims recorded':w.count+' recorded · '+structured.distance(w.meters))+'</span></div>').join('')+'</div>'+
  '<p class="muted small">Weekly distance · '+esc(f.volumeHint)+'<br>Longest swim · '+esc(f.longestHint)+'</p>'+
  '<div class="formgrid">'+select(f,'level','Swimming experience',namePairs(policy.levels))+
  input(f,'continuous','Comfortable continuous distance (m)')+input(f,'weeklyMeters','Sustainable weekly distance (m)')+
  input(f,'longestMeters','Longest recent swim (m)')+select(f,'poolLength','Pool length',[[20,'20 m'],[25,'25 m'],[33,'33 m'],[50,'50 m']])+
  select(f,'setting','Training venue',[['pool','Pool'],['mixed','Pool and open water'],['open','Prefer open water']])+
  select(f,'recovery','How recovered do you feel?',[['unknown','Unassessed'],['normal','Normal for me'],['poor','Poor']])+'</div>'+
  '<p class="muted small">Choose a pool where you can comfortably swim one length. If you cannot, start with supervised instruction.</p>'+
  list(f,'equipment',Object.entries(kit))+(f.setting!=='pool'?check(f,'supervised','I have access to organised supervision and a buddy'):'')+
  check(f,'interrupted','Recent training interruption')+check(f,'unwell','Injured, unwell or experiencing concerning symptoms')+
  '<details class="item"'+(f.showAssessment?' open':'')+'><summary>Optional pace and CSS</summary><p class="muted small">CSS estimates sustainable freestyle speed from two comparable pool trials. Comfortable effort is enough to start.</p>'+
  '<div class="formgrid">'+input(f,'easyPace','Recent easy pace (seconds per 100 m)')+input(f,'css','Current measured CSS (seconds per 100 m)')+'</div>'+
  (f.css?'<p class="muted small">'+esc(f.cssSource)+'</p>':'')+
  '<p class="muted small">Only attempt these trials if you can comfortably swim 800 m continuously and feel normally recovered. Use supervised pool trials on separate days. Swim 400 m and 200 m at your fastest evenly paced effort, using the same pool length, freestyle and a push start.</p>'+
  '<div class="formgrid">'+input(f,'seconds400','400 m trial (seconds)')+input(f,'seconds200','200 m trial (seconds)')+'</div>'+
  check(f,'comparable','I completed both comparable trials recently')+'<button class="btn alt" type="button" data-m91-action="css">Calculate CSS</button></details>';
 if(step===2)content='<h3>Training schedule</h3><p class="muted small">Choose days and set the maximum time available for swimming.</p>'+
  list(f,'available',available)+'<details class="item"><summary>Day-specific time limits</summary><div class="formgrid">'+days.map((d,i)=>
  '<label class="field">'+d+' maximum (min)<input type="number" min="15" max="180" data-m91-limit="'+i+'" value="'+esc(f.dayMinutes[i])+'"></label>').join('')+'</div></details>'+
  '<h4>Hard days in another sport</h4>'+list(f,'otherDays',available);
 if(step===3)content='<h3>MILE Intelligence</h3>'+select(f,'priority','Primary sport',sports.map(sport=>[sport,sport]))+
  '<p class="muted small">Your plan accounts for other Calendar training and the hard days you marked. Review the plan before adding it to Calendar.</p>';
 if(step===4)content='<h3>Programme review</h3>'+review(f);
 document.getElementById('app').innerHTML='<div class="grid"><section class="card full m882-build m91-build"><div class="row between"><h2>Build your swimming plan</h2>'+
  '<span class="pill">Step '+(step+1)+' of 5</span></div><div class="v42-steps" aria-hidden="true">'+Array.from({length:5},(_,i)=>
  '<span class="'+(i<=step?'on':'')+'"></span>').join('')+'</div>'+content+
  '<div class="m91-actions"><p data-m91-status role="status"></p><div class="row between">'+(step?
  '<button type="button" class="btn alt" data-m91-action="back">‹ Back</button>':'')+
  '<button type="button" class="btn" data-m91-action="'+(step===4?'save':'next')+'">'+(step===4?'Create training plan':'Continue ›')+'</button></div></div></section></div>';
}
function status(message){
 document.querySelector('[data-m91-status]').textContent=message;
}
function savePlan(){
 const f=form(),{settings,plan,overlap,key}=evaluate(f);
 if(!v4Ready||!userId||String(userId)!==f.owner)return status('Sign in to create a plan.');
 if(!plan.ok||overlap)return status(overlap?'Choose different dates or manage the existing programme.':plan.errors.join(' '));
 if(key!==reviewKey){draw();return status('Your schedule changed. Review the updated plan.');}
 if(!confirm('Create this swimming plan in Calendar?'))return;
 const id=uid(),sessions=plan.weeks.flatMap(week=>week.sessions).map(session=>{
  const detail=lines(session.structuredSteps).join('\n');
  return {...session,id:uid(),block:id,status:'planned',km:session.meters/1000,note:'',matchId:null,detail,structuredDetail:detail,revision:1};
 });
 state.blocks.push({id,name:f.name.trim()||'Swimming · '+policy.goals[f.goal],sport:'Swimming',start:f.start,end:sessions.at(-1).date,
  active:true,goal:f.goal,swimmingPlan:{version:1,event:{date:f.eventDate,meters:settings.eventMeters},priority:f.priority,warnings:plan.warnings}});
 const previous=profile().css;
 const css=settings.css?(previous?.pace===settings.css&&previous?.poolLength===settings.poolLength&&previous?.source===f.cssSource?previous:
  {pace:settings.css,poolLength:settings.poolLength,date:today(),source:f.cssSource}):null;
 state.settings.swimmingProfile={version:1,level:f.level,setting:f.setting,poolLength:settings.poolLength,weeklyMeters:settings.weeklyMeters,
  longestMeters:settings.longestMeters,continuous:settings.continuous,available:f.available,dayMinutes:f.dayMinutes,equipment:f.equipment,css,easyPace:settings.easyPace};
 state.workouts.push(...sessions);
 state.activeBlock=id;viewDate=f.start;calendarMonth=f.start.slice(0,7);
 draft=null;reviewKey=null;v42Step=0;
 save();navigate('calendar');
}
function move(change){
 const f=form(),candidate=config(f);
 if(change>0&&f.start<today())return status('Choose a start date today or later.');
 if(change>0&&v42Step>0){
  const errors=policy.validate(candidate);
  if(errors.length)return status(errors.join(' '));
 }
 if(change>0&&v42Step===0&&(!policy.iso(f.start)||!Number.isInteger(candidate.weeks)||candidate.weeks<1||candidate.weeks>32||
  f.eventDate&&f.eventDate<=f.start))return status('Choose valid dates and a programme of 1–32 weeks.');
 v42Step=Math.max(0,Math.min(4,v42Step+change));draw();
 const heading=document.querySelector('.m91-build > h3');
 heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'nearest'});
}
document.addEventListener('input',e=>{
 const el=e.target;
 if(!el.closest('.m91-build'))return;
 const f=form(),key=el.dataset.m91Field,k=el.dataset.m91List;
 if(key){
  f[key]=el.type==='checkbox'?el.checked:el.value;
  if(key==='css')f.cssSource='Athlete entered';
  if(key==='poolLength'){f.css='';f.cssSource='Athlete entered';f.comparable=false;f.seconds400='';f.seconds200='';}
  if(['setting','poolLength'].includes(key)){
   f.showAssessment=Boolean(el.closest('.m91-build').querySelector('details[open]'));
   draw();document.querySelector('[data-m91-field="'+key+'"]').focus({preventScroll:true});
  }
 }
 if(k){
  const value=k==='equipment'?el.value:Number(el.value);
  f[k]=el.checked?[...new Set([...f[k],value])]:f[k].filter(x=>x!==value);
 }
 if(el.dataset.m91Limit!=null)f.dayMinutes[el.dataset.m91Limit]=Number(el.value);
});
document.addEventListener('click',e=>{
 const action=e.target.closest('.m91-build [data-m91-action]')?.dataset.m91Action;
 if(!action)return;
 if(action==='save')savePlan();
 else if(action==='css'){
  const f=form(),result=policy.assess({...config(f),seconds400:toNumber(f.seconds400),seconds200:toNumber(f.seconds200)});
  if(result.error)return status(result.error);
  f.css=result.pace;f.cssSource='Calculated from 400 m and 200 m trials';f.showAssessment=true;
  draw();status('Estimated CSS is '+result.pace+' seconds per 100 m.');
 }else move(action==='back'?-1:1);
});
v41Builder=function(){return v42Sport==='Swimming'?draw():legacy.builder.apply(this,arguments);};
v42PickSport=function(sport){
 if(sport!=='Swimming')return legacy.pick.apply(this,arguments);
 v42Sport=sport;v42Step=0;v42Form={};draft=null;reviewKey=null;draw();
};
v42Move=function(change){return v42Sport==='Swimming'?move(change):legacy.move.apply(this,arguments);};
mileCoachWhyHtml=function(w){return w.swimmingPlanVersion===1?'':legacy.why(w);};
root.mileSwimmingBuild={history,profile,summary,sessionMarkup};
})(globalThis);
