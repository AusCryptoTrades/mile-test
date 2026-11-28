// Pure adapter for the canonical Running workout. Never manufacture device steps.
export function watchRun(workout,canonical){
 if(!workout?.runningPlanVersion||workout.sport!=='Running'||workout.status!=='planned'||workout.matchId!=null||
  workout.structuredDetail!==workout.detail||!workout.id||!Number.isInteger(workout.revision)||workout.revision<1||
  !/^\d{4}-\d\d-\d\d$/.test(workout.date))return null;
 const steps=canonical.expand(workout.structuredSteps,{sport:'Running',limit:50});
 if(!steps||steps.some(step=>!['distance','time'].includes(step.duration.kind)))return null;
 if(steps.some((step,i)=>step.intensity==='warmup'&&i!==0||step.intensity==='cooldown'&&i!==steps.length-1))return null;
 if(!steps.some(step=>['active','interval','recovery','rest'].includes(step.intensity)))return null;
 return {id:String(workout.id),name:workout.name,date:workout.date,revision:workout.revision,steps};
}
