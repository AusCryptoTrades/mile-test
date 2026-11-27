// Provider-neutral planned running workout -> Garmin Training API V2.
// Pure transformation only. No network calls, credentials or publishing.
const intensities=Object.freeze({warmup:'WARMUP',active:'ACTIVE',interval:'INTERVAL',recovery:'RECOVERY',rest:'REST',cooldown:'COOLDOWN'});
const provider='MILE Training';
const integer=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error('Invalid '+label);return v};
const number=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+label);return v};
const object=(x)=>x&&typeof x==='object'&&!Array.isArray(x);
function exactKeys(x,allowed){if(!object(x)||Object.keys(x).some(k=>!allowed.includes(k)))throw Error('Unexpected field')}
function text(v,max,label,required=false){if(v==null&&!required)return '';if(typeof v!=='string'||v.length>max||required&&!v.trim())throw Error('Invalid '+label);return v.trim()}
export function buildGarminRunningWorkout(plan){
 exactKeys(plan,['name','description','sport','steps']);
 if(plan.sport!=='running')throw Error('Only running supported');
 let order=0,expanded=0;
 function mapSteps(steps,depth=0,multiplier=1){
  if(!Array.isArray(steps)||!steps.length||depth>2)throw Error('Invalid workout steps');
  return steps.map(step=>{
   if(++order>100)throw Error('Too many workout steps');
   const stepOrder=order;
   if(step?.kind==='repeat'){
    exactKeys(step,['kind','count','steps']);
    const count=integer(step.count,2,50,'repeat count');
    return {type:'WorkoutRepeatStep',stepOrder,repeatType:'REPEAT_UNTIL_STEPS_CMPLT',repeatValue:count,skipLastRestStep:false,steps:mapSteps(step.steps,depth+1,multiplier*count)};
   }
   exactKeys(step,['kind','intensity','description','duration','target']);
   if(step.kind!=='step'||!Object.hasOwn(intensities,step.intensity))throw Error('Invalid step intensity');
   expanded+=multiplier;if(expanded>1000)throw Error('Too many expanded steps');
   const d=step.duration,t=step.target??{kind:'open'};
   if(!object(d)||!object(t))throw Error('Invalid duration or target');
   let durationType,durationValue=null,durationValueType=null;
   if(d.kind==='time'){exactKeys(d,['kind','seconds']);durationType='TIME';durationValue=integer(d.seconds,1,86400,'duration')}
   else if(d.kind==='distance'){exactKeys(d,['kind','meters']);durationType='DISTANCE';durationValue=number(d.meters,1,200000,'distance');durationValueType='METER'}
   else if(d.kind==='open'||d.kind==='lap'){exactKeys(d,['kind']);durationType='OPEN'}
   else if(d.kind==='heart_rate')throw Error('Heart-rate step completion requires a FIT workout. Use timed recovery for Garmin Connect sync.');
   else throw Error('Unsupported duration');
   let targetType,targetValue=null,targetValueLow=null,targetValueHigh=null;
   if(t.kind==='open'){exactKeys(t,['kind']);targetType='OPEN'}
   else if(t.kind==='pace'){exactKeys(t,['kind','fastSecondsPerKm','slowSecondsPerKm']);const fast=number(t.fastSecondsPerKm,120,1800,'fast pace'),slow=number(t.slowSecondsPerKm,120,1800,'slow pace');if(fast>slow)throw Error('Reversed pace range');targetType='PACE';targetValueLow=1000/slow;targetValueHigh=1000/fast}
   else if(t.kind==='heart_rate'){exactKeys(t,['kind','lowBpm','highBpm','zone']);if(t.zone!==undefined&&!/^Z[1-5]$/.test(t.zone))throw Error('Invalid HR zone label');targetType='HEART_RATE';targetValueLow=integer(t.lowBpm,30,250,'low HR');targetValueHigh=integer(t.highBpm,30,250,'high HR');if(targetValueLow>targetValueHigh)throw Error('Reversed HR range')}
   else throw Error('Unsupported target');
   return {type:'WorkoutStep',stepOrder,intensity:intensities[step.intensity],description:text(step.description,512,'step description'),durationType,durationValue,durationValueType,targetType,targetValue,targetValueLow,targetValueHigh,targetValueType:null,secondaryTargetType:null,secondaryTargetValue:null,secondaryTargetValueLow:null,secondaryTargetValueHigh:null,secondaryTargetValueType:null};
  });
 }
 const name=text(plan.name,64,'workout name',true),description=text(plan.description,1024,'workout description');
 return {workoutName:name,description,sport:'RUNNING',workoutProvider:provider,workoutSourceId:provider,poolLength:null,poolLengthUnit:null,isSessionTransitionEnabled:false,segments:[{segmentOrder:1,sport:'RUNNING',poolLength:null,poolLengthUnit:null,steps:mapSteps(plan.steps)}]};
}
