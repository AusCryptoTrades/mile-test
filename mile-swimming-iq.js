/* Private swim insights use recorded summary fields and the confirmed prescription. */
(function(root){
'use strict';
const workout=root.mileStructuredWorkout||(typeof module!=='undefined'&&require('./mile-running-workout'));
const dayMs=86400000;
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value):NaN;
const paceText=seconds=>Math.floor(Math.round(seconds)/60)+':'+String(Math.round(seconds)%60).padStart(2,'0')+'/100 m';
const pool=value=>[25,50,22.86].includes(value)?value:null;

function matchPrescription(session,activityId){
 if(!session?.swimmingPlanVersion||session.sport!=='Swimming'||activityId==null||!Number.isInteger(session.revision)||
  session.structuredDetail!==session.detail||!pool(session.poolMeters)||
  !workout.expand(session.structuredSteps,{sport:'Swimming'}))return null;
 return {activityId:String(activityId),revision:session.revision,poolMeters:session.poolMeters,
  meters:session.meters??null,steps:JSON.parse(JSON.stringify(session.structuredSteps))};
}
function plannedLink(activity,workouts){
 if(activity.id==null)return null;
 const matches=workouts.filter(w=>w.sport==='Swimming'&&w.matchId!=null&&String(w.matchId)===String(activity.id));
 if(matches.length!==1)return null;
 const plan=matches[0],expected=matchPrescription(plan,activity.id),stored=plan.swimmingMatchPrescription;
 if(!expected||!stored||root.mileTrainingRevisions?.snapshot&&root.mileTrainingRevisions.snapshot(stored)!==root.mileTrainingRevisions.snapshot(expected))return null;
 if(!root.mileTrainingRevisions?.snapshot&&JSON.stringify(stored)!==JSON.stringify(expected))return null;
 return plan;
}
function recentDistance(activity,history){
 const start=day(activity.date),periods=[{days:new Set(),meters:0},{days:new Set(),meters:0}],seen=new Set();
 if(!Number.isFinite(start))return null;
 for(const swim of [activity,...history]){
  const id=String(swim.id),age=(start-day(swim.date))/dayMs;
  if(swim.id==null||seen.has(id)||!positive(swim.meters)||!(age>=0&&age<14))continue;
  seen.add(id);
  const period=periods[age<7?0:1];
  period.days.add(swim.date);period.meters+=swim.meters;
 }
 return periods.every(period=>period.days.size>=2)?periods.map(period=>Math.round(period.meters)):null;
}
function analyse(activity,{workouts=[],history=[],today='',fatigue=null}={}){
 const plan=plannedLink(activity,workouts),length=pool(activity.poolMeters),meters=positive(activity.meters)?activity.meters:null;
 const elapsed=positive(activity.elapsedSeconds)?activity.elapsedSeconds:null;
 const moving=positive(activity.activeSeconds)&&(!elapsed||activity.activeSeconds<=elapsed)?activity.activeSeconds:null;
 const secondsPer100=moving&&meters?moving*100/meters:null;
 const pace=secondsPer100>=40&&secondsPer100<=480?secondsPer100:null;
 const comparable=plan&&(!length||length===plan.poolMeters)&&meters&&positive(plan.meters)&&activity.setting==='pool';
 const load=recentDistance(activity,history);
 const next=workouts.filter(w=>w.sport==='Swimming'&&w.swimmingPlanVersion&&w.status==='planned'&&w.date>today&&w.matchId==null&&
  (!plan||w.block===plan.block)).sort((a,b)=>a.date.localeCompare(b.date))[0];
 const high=Number.isInteger(fatigue)&&fatigue>=7&&fatigue<=10;
 let execution='Review the recorded distance and time. No scheduled prescription is verified for this swim.';
 if(plan)execution=comparable?workout.distance(meters)+' recorded against '+workout.distance(plan.meters)+' prescribed. Individual sets are unverified.':
  'This swim is linked to '+plan.name+'. Comparable pool or set data are unavailable.';
 let trend=load?'You recorded '+workout.distance(load[0])+' in seven days, versus '+workout.distance(load[1])+' in the previous seven.':
  'There are too few recorded swims for a recent distance comparison.';
 if(high)trend='Your latest check-in recorded fatigue of '+fatigue+'/10.';
 let focus='Use a relaxed breathing rhythm and reset your stroke at the wall.';
 if(next?.family==='css')focus='Keep the early threshold repeats controlled and aim to match them late in the set.';
 if(['open-water','triathlon'].includes(next?.family))focus='Settle early and practise the next pool rehearsal with an easy kick.';
 if(next?.family==='speed')focus='Recover fully at the wall before each quick repeat.';
 if(high)focus='Keep the next effort easy until you feel recovered.';
 const adjustment=high&&next?.demanding?'Review '+next.name+' before starting. A revision requires eligible evidence and your approval.':
  'Keep the current plan. No change follows from this swim alone.';
 return {metrics:[meters&&['Distance',workout.distance(meters)],elapsed?['Elapsed',workout.time(Math.round(elapsed))]:positive(activity.recordedSeconds)&&['Recorded time',workout.time(Math.round(activity.recordedSeconds))],
  pace&&['Moving pace',paceText(pace)],length&&['Pool length',length===22.86?'25 yd':length+' m']].filter(Boolean),
  execution,trend,focus,adjustment,high,plan,length,moving,elapsed,comparable,load};
}
function render(host,result,{detailsOpen=false}={}){
 const el=(tag,value,className)=>{
  const node=document.createElement(tag);if(value)node.textContent=value;if(className)node.className=className;return node;
 };
 const brief=el('section',null,'mile35-panel m881-analysis m881-quick');
 brief.append(el('h3','MILE IQ · Swimming analysis'));
 const metrics=el('dl',null,'m881-quick-metrics');
 for(const [label,value] of result.metrics){
  const item=el('div');item.append(el('dt',label),el('dd',value));metrics.append(item);
 }
 const notes=el('div',null,'m881-quick-notes');
 for(const [label,value] of [['Session execution',result.execution],[result.high?'Fatigue & recovery':'Training trend',result.trend],
  ['Next session focus',result.focus],['Programme adjustment',result.adjustment]]){
  const note=el('section');note.append(el('h4',label),el('p',value));notes.append(note);
 }
 brief.append(metrics,notes);
 const detail=el('details',null,'mile35-panel m881-detailed');
 detail.open=detailsOpen;
 detail.append(el('summary','Detailed Analysis'),el('p',result.plan?'Compared with approved prescription revision '+result.plan.revision+'.':
  'Link a scheduled workout to compare its prescribed distance.','muted small'));
 if(result.comparable)detail.append(el('p','Prescribed distance '+workout.distance(result.plan.meters)+'.'));
 if(result.moving)detail.append(el('p','Recorded movement time '+workout.time(Math.round(result.moving))+'.'));
 if(result.moving&&result.elapsed&&result.elapsed-result.moving>=1)detail.append(el('p','Elapsed time outside recorded movement '+
  workout.time(Math.round(result.elapsed-result.moving))+'. It may include pauses or rest.'));
 if(result.load)detail.append(el('p','Distance windows include this swim and omit days without a recorded swim.','muted small'));
 detail.append(el('p','Repeat pace, stroke efficiency and recovery between sets require reliable individual swim lengths and verified alignment.','muted small'));
 host.append(brief,detail);
}
const api={matchPrescription,analyse,render};
root.mileSwimmingIQ=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
