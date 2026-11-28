/* Shared interpretation of stored structured workouts. Legacy "open" durations are manual laps. */
(function(root){
'use strict';
const labels={warmup:'Warm-up',active:'Main set',interval:'Work',recovery:'Recovery',rest:'Rest',cooldown:'Cool-down'};
const bpm=value=>Number.isInteger(value)&&value>=30&&value<=250;
const pace=value=>{const rounded=Math.round(value);return Math.floor(rounded/60)+':'+String(rounded%60).padStart(2,'0')};
const zoneNames={Z1:'Recovery',Z2:'Easy aerobic',Z3:'Steady',Z4:'Threshold',Z5:'High intensity'};
const time=value=>{
 if(value<3600)return Number.isInteger(value/60)?value/60+' min':value+' sec';
 const hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),seconds=value%60;
 return hours+' h'+(minutes?' '+minutes+' min':'')+(seconds?' '+seconds+' sec':'');
};
const distance=meters=>meters>=1000?Number((meters/1000).toFixed(3))+' km':Number(meters.toFixed(2))+' m';
function isDuration(value){
 if(!value)return false;
 if(value.kind==='distance')return Number.isFinite(value.meters)&&value.meters>=1&&value.meters<=200000;
 if(value.kind==='time')return Number.isInteger(value.seconds)&&value.seconds>=1&&value.seconds<=86400;
 if(value.kind==='lap'||value.kind==='open')return true;
 return value.kind==='heart_rate'&&['above','below'].includes(value.direction)&&bpm(value.bpm)&&
  (value.fallbackSeconds===undefined||Number.isInteger(value.fallbackSeconds)&&value.fallbackSeconds>=60&&value.fallbackSeconds<=180);
}
function isTarget(target,sport){
 if(!target||target.kind==='open')return true;
 if(target.kind==='heart_rate')return bpm(target.lowBpm)&&bpm(target.highBpm)&&target.lowBpm<=target.highBpm&&
  (target.zone===undefined||Object.hasOwn(zoneNames,target.zone));
 if(sport==='Swimming'&&target.kind==='swim_pace')return Number.isInteger(target.fastSecondsPer100m)&&
  Number.isInteger(target.slowSecondsPer100m)&&target.fastSecondsPer100m>=45&&target.slowSecondsPer100m<=420&&
  target.fastSecondsPer100m<=target.slowSecondsPer100m;
 if(sport==='Cycling'||sport==='Swimming'){
  if(sport==='Cycling'&&target.kind==='power')return Number.isInteger(target.lowWatts)&&Number.isInteger(target.highWatts)&&target.lowWatts>=1&&target.lowWatts<=target.highWatts&&target.highWatts<=2500;
  return target.kind==='rpe'&&Number.isInteger(target.low)&&Number.isInteger(target.high)&&target.low>=1&&target.low<=target.high&&target.high<=10;
 }
 return target.kind==='pace'&&Number.isFinite(target.fastSecondsPerKm)&&Number.isFinite(target.slowSecondsPerKm)&&
  target.fastSecondsPerKm>=120&&target.fastSecondsPerKm<=target.slowSecondsPerKm&&target.slowSecondsPerKm<=1800;
}
function expand(steps,{limit=200,depth=0,sport='Running'}={}){
 if(!Array.isArray(steps)||!steps.length||depth>2)return null;
 const expanded=[];
 for(const step of steps){
  if(step?.kind==='repeat'){
   if(!Number.isInteger(step.count)||step.count<2||step.count>50)return null;
   const repetitions=expand(step.steps,{limit,depth:depth+1,sport});
   if(!repetitions||expanded.length+repetitions.length*step.count>limit)return null;
   for(let i=0;i<step.count;i++)expanded.push(...repetitions);
  }else {
   if(step?.kind!=='step'||!Object.hasOwn(labels,step.intensity)||!isDuration(step.duration)||!isTarget(step.target,sport)||expanded.length===limit)return null;
   expanded.push(step);
  }
 }
 return expanded;
}
function totals(steps,options){
 const expanded=expand(steps,options);
 if(!expanded)return null;
 const meters=expanded.reduce((sum,step)=>sum+(step.duration.meters??0),0);
 const seconds=expanded.reduce((sum,step)=>sum+(step.duration.seconds??0),0);
 return {meters,seconds,allDistance:expanded.every(step=>step.duration.kind==='distance'),
  allTime:expanded.every(step=>step.duration.kind==='time')};
}
function durationLabel(duration){
 if(duration.kind==='time')return time(duration.seconds);
 if(duration.kind==='distance')return distance(duration.meters);
 if(duration.kind==='heart_rate')return 'HR '+duration.direction+' '+duration.bpm+' bpm'+(duration.fallbackSeconds?' · '+time(duration.fallbackSeconds)+' fallback':'');
 return 'Press lap when ready';
}
function targetLabel(target){
 if(target?.kind==='swim_pace')return pace(target.fastSecondsPer100m)+'–'+pace(target.slowSecondsPer100m)+'/100 m';
 if(target?.kind==='power')return target.lowWatts+'–'+target.highWatts+' W';
 if(target?.kind==='rpe')return 'RPE '+target.low+'–'+target.high+'/10';
 if(target?.kind==='heart_rate')return (Object.hasOwn(zoneNames,target.zone)?target.zone+' '+zoneNames[target.zone]+' · ':'')+target.lowBpm+'–'+target.highBpm+' bpm';
 if(target?.kind==='pace')return pace(target.fastSecondsPerKm)+'–'+pace(target.slowSecondsPerKm)+'/km';
 return '';
}
function demanding(workout){
 if(typeof workout?.demanding==='boolean')return workout.demanding;
 // Preserve the interpretation of saved legacy workouts when used in adaptation review.
 return ['hills','cruise','threshold','vo2','fartlek','race5','race10','half','ladder','pyramid','mixed','tempo'].includes(workout?.kind)||Number(workout?.targetRpe)>=6;
}
function recoveryFinish(duration,elapsed){
 // MILE browser Tracker has no live HR. A timed alternative is used when available.
 return duration.fallbackSeconds!==undefined&&elapsed>=duration.fallbackSeconds;
}
const api={labels,expand,isDuration,durationLabel,targetLabel,distance,time,totals,demanding,recoveryFinish};
root.mileStructuredWorkout=api;
root.mileRunningWorkout=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
