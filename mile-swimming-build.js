/* Swimming adapter for the existing Build router, athlete profile and Calendar. */
(function(root){
'use strict';
const policy=root.mileSwimmingPlan,workout=root.mileStructuredWorkout;
const legacy={draw:v41Builder,pick:v42PickSport,move:v42Move,regenerate:v42RegenerateWeek,why:mileCoachWhyHtml};
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const sports=['Swimming','Running','Cycling','Strength','HYROX','Triathlon'];
const titles=['Goal & programme','Swimming fitness','Training schedule','Training preferences','Full programme review'];
let draft,reviewKey;
const numeric=value=>value===''||value==null?null:Number(value);
function form(){
 const owner=String(userId||'');
 if(draft?.owner===owner)return draft;
 const stored=state.settings.swimmingProfile??{};
 const shared=root.mileAthleteProfile?.read();
 const experience={beginner:'beginner',regular:'intermediate',experienced:'advanced',competitive:'advanced'}[shared?.athlete?.experience];
 const preference=state.settings.trainingPreferences773?.Swimming||{};
 const available=stored.available??preference.available??[0,2,5];
 draft={goal:'fitness',start:today(),weeks:8,eventDate:'',eventMeters:'',level:experience??'beginner',
  pool:'25m',setting:'pool',gear:[],weeklyMeters:'',longestMeters:'',continuousMeters:'',observedPace:'',
  recovery:'unknown',priority:sports.includes(shared?.primarySport)?shared.primarySport:'Swimming',
  otherSports:(shared?.sports??[]).filter(sport=>sport!=='Swimming').join(', '),available,
  sessions:Math.min(3,available.length),dayMinutes:Object.fromEntries(days.map((_,day)=>[day,day===5?60:40])),
  ...stored,owner,seconds200:stored.benchmark?.seconds200??'',seconds400:stored.benchmark?.seconds400??'',
  benchmarkDate:stored.benchmark?.date??today(),comparable:!!stored.benchmark,interrupted:false,hardDays:[]};
 if(Number(state.checkins?.[today()]?.fatigue)>=7)draft.recovery='poor';
 return draft;
}
function history(){
 return policy.history((state.activities??[]).filter(item=>item.sport==='Swimming'||sportOf(item)==='Swimming')
  .map(item=>({id:item.id,date:activityDate(item),meters:Number(item.distanceKm)*1000})),add(today(),-1));
}
const field=(f,key,label,type='number',attrs='')=>'<label class="field">'+esc(label)+'<input type="'+type+'" '+attrs+' data-m91-field="'+key+'" value="'+esc(f[key]??'')+'"></label>';
const select=(f,key,label,options)=>'<label class="field">'+esc(label)+'<select data-m91-field="'+key+'">'+options.map(([value,name])=>
 '<option value="'+esc(value)+'"'+(String(f[key])===String(value)?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>';
const check=(f,key,label)=>'<label class="m882-check"><input type="checkbox" data-m91-field="'+key+'" '+(f[key]?'checked':'')+'> '+esc(label)+'</label>';
const choices=(f,key,items)=>'<div class="v42-checks">'+items.map(([value,label])=>
 '<label><input type="checkbox" data-m91-list="'+key+'" value="'+esc(value)+'" '+(f[key].includes(value)?'checked':'')+'> '+esc(label)+'</label>').join('')+'</div>';
function inputs(f){
 return {...f,...Object.fromEntries(['weeks','eventMeters','weeklyMeters','longestMeters','continuousMeters','observedPace','sessions'].map(k=>[k,numeric(f[k])])),
  dayMinutes:Object.fromEntries(Object.entries(f.dayMinutes).map(([day,value])=>[day,numeric(value)])),
  benchmark:f.seconds200||f.seconds400?{seconds200:numeric(f.seconds200),seconds400:numeric(f.seconds400),comparable:f.comparable,date:f.benchmarkDate,through:today()}:null,
  commitments:state.workouts.filter(w=>w.sport!=='Swimming'&&w.status!=='skipped'&&v456Visible(w.block)&&policy.iso(w.date))
   .map(w=>({date:w.date,hard:v43Hard(w),minutes:Number(w.plannedMinutes)||0}))};
}
function evaluation(f){
 const config=inputs(f),result=policy.generate(config);
 const end=result.weeks.at(-1)?.sessions.at(-1)?.date;
 const overlap=!!end&&state.workouts.some(w=>w.sport==='Swimming'&&['planned',undefined].includes(w.status)&&
  w.matchId==null&&w.date>=f.start&&w.date<=end&&v456Visible(w.block));
 return {config,result,overlap,key:JSON.stringify([result,overlap])};
}
const stepText=step=>workout.labels[step.intensity]+' · '+workout.durationLabel(step.duration)+
 (workout.targetLabel(step.target)?' · '+workout.targetLabel(step.target):'')+(step.description?' · '+step.description:'');
function condensed(steps){
 const lines=[];
 for(let i=0;i<steps.length;){
  const first=stepText(steps[i]), rest=steps[i+1]?.intensity==='rest'?stepText(steps[i+1]):null;
  let n=1;
  if(rest)while(i+n*2+1<steps.length&&stepText(steps[i+n*2])===first&&stepText(steps[i+n*2+1])===rest)n++;
  if(n>1){lines.push(n+' × ('+first+' / '+rest+')');i+=n*2;}
  else{lines.push(first);i++;}
 }
 return lines;
}
const distanceText=w=>w.meters==null?'Timed session':workout.distance(w.meters);
function sessionMarkup(w){
 if(!w?.swimmingPlanVersion||w.structuredDetail!==w.detail)return null;
 const steps=workout.expand(w.structuredSteps,{sport:'Swimming'});
 if(!steps)return null;
 const time=Number.isInteger(w.estimatedSeconds)?workout.time(w.estimatedSeconds):'';
 return '<p class="muted small">'+esc(distanceText(w))+' · '+esc(w.meters===null?time:'~'+time)+' · '+esc(w.poolMeters===22.86?'25 yd pool':w.poolMeters+' m pool')+
  '</p><details class="mile-coach-why"><summary>Workout steps</summary><ul>'+condensed(steps).map(line=>'<li>'+esc(line)+'</li>').join('')+
  '</ul></details><details class="mile-coach-why"><summary>Session Purpose &amp; Focus</summary><p><strong>Session Purpose</strong> '+esc(w.purpose)+
  '</p><p><strong>Session Focus</strong> '+esc(w.focus)+'</p></details>';
}
function draw(){
 const f=form(),stage=Math.max(0,Math.min(4,v42Step));
 let content='';
 if(stage===0)content='<div class="sport-tiles">'+v41SportNames.map(name=>'<button type="button" class="sport-tile '+(name==='Swimming'?'selected':'')+
  '" onclick="v42PickSport(\''+esc(name)+'\')"><span>'+v41SportIcons[name]+'</span><strong>'+esc(name)+'</strong></button>').join('')+'</div><div class="formgrid">'+
  select(f,'goal','Swimming goal',Object.entries(policy.goals))+field(f,'start','Start date','date')+field(f,'weeks','Programme weeks','number','min="1" max="24"')+
  field(f,'eventDate','Event date (optional)','date')+field(f,'eventMeters','Event swim distance (m, optional)')+'</div>';
 if(stage===1){
  const recent=history();
  content='<div class="m882-history">'+recent.map(item=>'<div><strong>'+item.days+' days</strong><span>'+esc(item.count?
   workout.distance(item.meters)+' · '+item.count+(item.count===1?' swim':' swims'):'No recorded swims')+'</span>'+(item.count?'<small>Longest '+esc(workout.distance(item.longestMeters))+'</small>':'')+'</div>').join('')+
   '</div><p class="muted small">Imported history may be incomplete. Enter a sustainable distance based on your recent swimming.</p><div class="formgrid">'+
   select(f,'level','Swimming experience',[['beginner','Beginner'],['intermediate','Intermediate'],['advanced','Advanced']])+
   field(f,'weeklyMeters','Sustainable weekly distance (m)')+field(f,'longestMeters','Longest recent session (m)')+
   field(f,'continuousMeters','Comfortable continuous distance (m)')+field(f,'observedPace','Recent easy pace (seconds per 100 m, optional)')+
   '</div><details class="mile-coach-why"><summary>Critical Swim Speed (optional)</summary><p>Use recent measured 400 m and 200 m freestyle trials from the same metric pool. Only confident swimmers who can swim 400 m continuously should consider an assessment. Use supervision and a separate well-rested test session. Leave blank for effort-based guidance.</p><div class="formgrid">'+
   field(f,'seconds400','400 m trial (seconds)')+field(f,'seconds200','200 m trial (seconds)')+field(f,'benchmarkDate','Trial date','date')+'</div>'+
   check(f,'comparable','I confirm these are recent, comparable freestyle trials')+'</details>';
 }
 if(stage===2)content='<h4>Available days</h4>'+choices(f,'available',days.map((day,i)=>[i,day.slice(0,3)]))+
  '<div class="formgrid">'+field(f,'sessions','Swims per week','number','min="1" max="6"')+'</div><h4>Maximum minutes by day</h4><div class="formgrid">'+
  days.map((day,i)=>'<label class="field">'+day+'<input type="number" min="6" max="180" data-m91-limit="'+i+'" value="'+esc(f.dayMinutes[i])+'"></label>').join('')+
  '</div><h4>Demanding days from other sports</h4>'+choices(f,'hardDays',days.map((day,i)=>[i,day.slice(0,3)]));
 if(stage===3)content='<div class="formgrid">'+select(f,'pool','Pool length',[['25m','25 metres'],['50m','50 metres'],['25yd','25 yards']])+
  select(f,'setting','Preferred setting',[['pool','Pool'],['open','Open water preparation in the pool']])+
  select(f,'recovery','Current recovery',[['unknown','Unsure'],['good','Recovered and training consistently'],['poor','Fatigued']])+
  select(f,'priority','Primary sport',sports.map(name=>[name,name]))+field(f,'otherSports','Other sports','text','maxlength="100"')+'</div>'+
  check(f,'interrupted','Returning after a swimming interruption')+'<h4>Available equipment</h4>'+choices(f,'gear',[['fins','Fins'],['board','Kickboard'],['buoy','Pull buoy']])+
  '<p class="muted small">This programme schedules pool sessions. Open-water preparation uses pool rehearsals, and any later outdoor swimming needs supervision and a buddy.</p>';
 if(stage===4){
  const {result,overlap,key}=evaluation(f);
  reviewKey=key;
  content=(result.benchmark?'<p>CSS estimate · '+esc(workout.time(Math.round(result.benchmark.secondsPer100m)))+' per 100 m</p>':'')+
   [...result.errors,...result.warnings,...(overlap?['An existing swimming programme overlaps these dates.']:[])].map(msg=>'<p class="muted small">'+esc(msg)+'</p>').join('')+
   result.weeks.map(week=>'<details class="m882-week"><summary>Week '+week.week+' · '+esc(week.phase)+' · '+esc(week.meters===null?'Timed sessions':workout.distance(week.meters))+
    '</summary>'+week.sessions.map(w=>'<section><h4>'+esc(nice(w.date))+' · '+esc(w.name)+'</h4>'+sessionMarkup(w)+'</section>').join('')+'</details>').join('');
 }
 document.getElementById('app').innerHTML='<div class="grid"><section class="card full m882-build m91-build"><div class="row between"><h2>Build your swimming plan</h2>'+
 '<span class="pill">STEP '+(stage+1)+' OF 5</span></div><div class="v42-steps">'+titles.map((_,index)=>'<span'+(index<=stage?' class="on"':'')+'></span>').join('')+
 '</div><h3 tabindex="-1">'+titles[stage]+'</h3>'+content+'<p data-m91-error role="status"></p><div class="row">'+
 (stage?'<button class="btn alt" data-m91-action="back">Back</button>':'')+
 (stage===4?'<button class="btn" data-m91-action="save">Create plan</button>':'<button class="btn" data-m91-action="next">Continue</button>')+'</div></section></div>';
 document.querySelector('.m91-build').addEventListener('click',event=>{
  const action=event.target.closest('[data-m91-action]')?.dataset.m91Action;
  if(action==='save')savePlan();
  else if(action)move(action==='back'?-1:1);
 });
}
function report(message){document.querySelector('[data-m91-error]').textContent=message}
function move(n){
 const f=form();
 if(n>0&&v42Step===0&&(!policy.iso(f.start)||f.start<today()||!Number.isInteger(Number(f.weeks))||Number(f.weeks)<1||Number(f.weeks)>24))
  return report('Choose a start date today or later and 1–24 weeks.');
 v42Step=Math.max(0,Math.min(4,v42Step+n));draw();document.querySelector('.m91-build h3').focus();
}
function savePlan(){
 const f=form(),{config,result,overlap,key}=evaluation(f);
 if(!v4Ready||!userId||String(userId)!==f.owner)return report('Sign in to create a swimming plan.');
 if(!result.ok||overlap)return report(overlap?'An existing swimming programme overlaps these dates.':result.errors.join(' '));
 if(key!==reviewKey){draw();return report('Review the updated programme before saving.');}
 if(!confirm('Create this swimming plan in Calendar?'))return;
 const block=uid(),sessions=result.weeks.flatMap(week=>week.sessions);
 const items=sessions.map(session=>{
  const detail=condensed(session.structuredSteps).join('\n');
  return {...session,id:uid(),block,status:'planned',revision:1,matchId:null,note:'',km:(session.meters??0)/1000,detail,structuredDetail:detail};
 });
 state.blocks.push({id:block,name:'Swimming · '+policy.goals[f.goal],sport:'Swimming',goal:f.goal,level:f.level,start:f.start,end:items.at(-1).date,
  active:true,swimmingPlan:{version:1,pool:f.pool,priority:f.priority,otherSports:f.otherSports,benchmark:result.benchmark,warnings:result.warnings}});
 state.workouts.push(...items);
 const {level,pool,setting,gear,weeklyMeters,longestMeters,continuousMeters,observedPace,available,sessions:frequency,dayMinutes}=config;
 state.settings.swimmingProfile={version:1,level,pool,setting,gear,weeklyMeters,longestMeters,continuousMeters,observedPace,available,sessions:frequency,dayMinutes,
  benchmark:result.benchmark?{...config.benchmark,through:undefined}:null};
 state.activeBlock=block;viewDate=f.start;calendarMonth=f.start.slice(0,7);
 draft=null;reviewKey=null;v42Step=0;save();navigate('calendar');
}
document.addEventListener('input',event=>{
 const el=event.target;if(!el.closest('.m91-build'))return;
 const f=form(),key=el.dataset.m91Field,list=el.dataset.m91List;
 if(key)f[key]=el.type==='checkbox'?el.checked:el.value;
 if(list){
  const value=list==='gear'?el.value:Number(el.value);
  f[list]=el.checked?[...new Set([...f[list],value])]:f[list].filter(item=>item!==value);
 }
 if(el.dataset.m91Limit!=null)f.dayMinutes[el.dataset.m91Limit]=el.value;
});
v41Builder=function(){return v42Sport==='Swimming'?draw():legacy.draw.apply(this,arguments)};
v42PickSport=function(sport){
 if(sport!=='Swimming')return legacy.pick.apply(this,arguments);
 v42Sport=sport;v42Step=0;v42Form={};draft=null;reviewKey=null;draw();
};
v42Move=function(n){return v42Sport==='Swimming'?move(n):legacy.move.apply(this,arguments)};
v42RegenerateWeek=function(id,week){
 if(state.blocks.find(block=>block.id===id)?.swimmingPlan)return notice('Swimming sessions are preserved. Automatic changes are unavailable.');
 return legacy.regenerate.apply(this,arguments);
};
root.mileSwimmingBuild={sessionMarkup,distanceText};
})(globalThis);
