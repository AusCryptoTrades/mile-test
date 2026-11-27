/* Shared interpretation of the stored Running workout. Legacy "open" durations are manual laps. */
(function(root){
'use strict';
const labels={warmup:'Warm-up',active:'Main set',interval:'Work',recovery:'Recovery',rest:'Rest',cooldown:'Cool-down'};
const bpm=value=>Number.isInteger(value)&&value>=30&&value<=250;
const pace=value=>{const rounded=Math.round(value);return Math.floor(rounded/60)+':'+String(rounded%60).padStart(2,'0')};
const time=value=>Number.isInteger(value/60)?value/60+' min':value+' sec';
function isDuration(value){
 if(!value)return false;
 if(value.kind==='distance')return Number.isFinite(value.meters)&&value.meters>=1&&value.meters<=200000;
 if(value.kind==='time')return Number.isInteger(value.seconds)&&value.seconds>=1&&value.seconds<=86400;
 if(value.kind==='lap'||value.kind==='open')return true;
 return value.kind==='heart_rate'&&['above','below'].includes(value.direction)&&bpm(value.bpm)&&
  (value.fallbackSeconds===undefined||Number.isInteger(value.fallbackSeconds)&&value.fallbackSeconds>=60&&value.fallbackSeconds<=180);
}
function isTarget(target){
 if(!target||target.kind==='open')return true;
 if(target.kind==='heart_rate')return bpm(target.lowBpm)&&bpm(target.highBpm)&&target.lowBpm<=target.highBpm;
 return target.kind==='pace'&&Number.isFinite(target.fastSecondsPerKm)&&Number.isFinite(target.slowSecondsPerKm)&&
  target.fastSecondsPerKm>=120&&target.fastSecondsPerKm<=target.slowSecondsPerKm&&target.slowSecondsPerKm<=1800;
}
function expand(steps,{limit=200,depth=0}={}){
 if(!Array.isArray(steps)||!steps.length||depth>2)return null;
 const expanded=[];
 for(const step of steps){
  if(step?.kind==='repeat'){
   if(!Number.isInteger(step.count)||step.count<2||step.count>50)return null;
   const repetitions=expand(step.steps,{limit,depth:depth+1});
   if(!repetitions||expanded.length+repetitions.length*step.count>limit)return null;
   for(let i=0;i<step.count;i++)expanded.push(...repetitions);
  }else {
   if(step?.kind!=='step'||!Object.hasOwn(labels,step.intensity)||!isDuration(step.duration)||!isTarget(step.target)||expanded.length===limit)return null;
   expanded.push(step);
  }
 }
 return expanded;
}
function durationLabel(duration){
 if(duration.kind==='time')return time(duration.seconds);
 if(duration.kind==='distance')return duration.meters>=1000?duration.meters/1000+' km':duration.meters+' m';
 if(duration.kind==='heart_rate')return 'HR '+duration.direction+' '+duration.bpm+' bpm'+(duration.fallbackSeconds?' · '+time(duration.fallbackSeconds)+' fallback':'');
 return 'Press lap when ready';
}
function targetLabel(target){
 if(target?.kind==='heart_rate')return target.lowBpm+'–'+target.highBpm+' bpm';
 if(target?.kind==='pace')return pace(target.fastSecondsPerKm)+'–'+pace(target.slowSecondsPerKm)+'/km';
 return '';
}
function demanding(workout){
 if(typeof workout?.demanding==='boolean')return workout.demanding;
 // Preserve the interpretation of saved legacy workouts when used in adaptation review.
 return ['hills','cruise','threshold','vo2','fartlek','race5','race10','half'].includes(workout?.kind)||Number(workout?.targetRpe)>=6;
}
function recoveryFinish(duration,elapsed){
 // MILE browser Tracker has no live HR. A timed alternative is used when available.
 return duration.fallbackSeconds!==undefined&&elapsed>=duration.fallbackSeconds;
}
const api={labels,expand,isDuration,durationLabel,targetLabel,demanding,recoveryFinish};
root.mileRunningWorkout=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
