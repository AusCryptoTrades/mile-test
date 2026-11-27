// Batch 88.1: read-only, deterministic running analysis foundation.
// No inferred workout identity, medical claims, plan mutation or external AI.
(function(root){
'use strict';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const positive=v=>{const n=finite(v);return n!==null&&n>0?n:null};
const validHR=n=>n!==null&&n>=30&&n<=250;
const validZones=b=>Array.isArray(b)&&b.length===6&&b.every((v,i)=>Number.isInteger(v)&&v>=30&&v<=250&&(!i||v>b[i-1]));
const time=t=>{const n=finite(t);return n===null?null:n>1e11?n/1000:n};
function zoneDistribution(points,bounds){
 if(!validZones(bounds))return null;
 const rows=(Array.isArray(points)?points:[]).map(p=>({t:time(p.t),hr:finite(p.hr)})).filter(p=>p.t!==null).sort((a,b)=>a.t-b.t);
 if(rows.length<2)return null;
 const span=rows.at(-1).t-rows[0].t;if(span<=0)return null;
 // Integrate linear HR between adjacent valid samples; do not bridge gaps.
 const seconds=Array(5).fill(0);let outside=0,coverage=0;
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i],dt=b.t-a.t;
  if(dt<=0||dt>15||!validHR(a.hr)||!validHR(b.hr))continue;
  coverage+=dt;const cuts=[0,1];
  if(a.hr!==b.hr)for(const edge of bounds){const f=(edge-a.hr)/(b.hr-a.hr);if(f>0&&f<1)cuts.push(f)}
  cuts.sort((x,y)=>x-y);
  for(let j=1;j<cuts.length;j++){
   const lo=cuts[j-1],hi=cuts[j],hr=a.hr+(b.hr-a.hr)*(lo+hi)/2;
   const z=bounds.slice(0,5).findIndex((v,k)=>hr>=v&&(k===4?hr<=bounds[k+1]:hr<bounds[k+1]));
   if(z<0)outside+=dt*(hi-lo);else seconds[z]+=dt*(hi-lo);
  }
 }
 if(coverage<60||coverage/span<.9)return null;
 return {seconds,outside,coverage,span,percent:seconds.map(v=>100*v/coverage),outsidePercent:100*outside/coverage};
}
function linkedWorkout(activity,workouts){
 if(activity?.id==null)return null;
 const matches=(Array.isArray(workouts)?workouts:[]).filter(w=>w.sport==='Running'&&w.matchId!=null&&String(w.matchId)===String(activity.id));
 return matches.length===1?matches[0]:null;
}
function analyse(activity,{workouts=[],points=[],bounds=null}={}){
 const distance=positive(activity?.distanceKm),duration=positive(activity?.durationMin),hr=finite(activity?.averageHR);
 const match=linkedWorkout(activity,workouts),zones=zoneDistribution(points,bounds);
 return {kind:match?'linked':'unlinked',name:match?String(match.name||'Scheduled run'):null,
  plannedKm:match?positive(match.km):null,distanceKm:distance,durationMin:duration,
  pace:distance&&duration?duration*60/distance:null,averageHR:validHR(hr)?hr:null,zones,advanced:root.mileRunningAnalysis?.analyse({...activity,distanceKm:distance,durationMin:duration},{plans:workouts,zoneDistribution:zones})||null};
}
const fmtPace=n=>{if(n===null||!Number.isFinite(n))return 'Unavailable';const s=Math.round(n);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+'/km'};
function render(host,result){
 const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
 const section=(title)=>{const e=el('section',undefined,'mile35-panel m881-analysis');e.append(el('h3',title));host.append(e);return e};
 const row=(p,k,v)=>{const e=el('div',undefined,'mile35-datarow');e.append(el('span',k),el('strong',v));p.append(e)};
 let p=section('MILE IQ · Running analysis');
 p.append(el('p',result.kind==='linked'?'Linked session: '+result.name:'No scheduled session linked. This activity still contributes to your recorded training history.','muted small'));
 row(p,'Recorded distance',result.distanceKm===null?'Unavailable':result.distanceKm.toFixed(2)+' km');
 row(p,'Recorded duration',result.durationMin===null?'Unavailable':Math.round(result.durationMin)+' min');
 row(p,'Average pace (duration / distance)',fmtPace(result.pace));
 row(p,'Average HR',result.averageHR===null?'Unavailable':Math.round(result.averageHR)+' bpm');
 if(result.kind==='linked'){
  p=section('Planned vs actual');row(p,'Planned distance estimate',result.plannedKm===null?'Unavailable':result.plannedKm+' km');
  row(p,'Actual distance',result.distanceKm===null?'Unavailable':result.distanceKm.toFixed(2)+' km');
  p.append(el('p','Main-set adherence is not yet assessed. The stored plan distance may exclude warm-up or recovery.','muted small'));
 }
 p=section('Recorded heart rate distribution');
 if(!result.zones){p.append(el('p','Unavailable: configured HR zones and sufficiently complete timestamped HR samples are required.','muted small'))}
 else{
  const z=result.zones;
  p.append(el('p','Based on covered sample time, using your current saved zones; not moving-time or main-set adherence.','muted small'));
  z.percent.forEach((v,i)=>row(p,'Zone '+(i+1),v.toFixed(1)+'%'));
  row(p,'Outside configured zones',z.outsidePercent.toFixed(1)+'%');
  row(p,'Sample-span coverage',(100*z.coverage/z.span).toFixed(1)+'%');
 }
 if(result.advanced){
  const a=result.advanced;
  p=section(a.kind==='planned'?'Session execution':'Training contribution');
  if(a.kind==='planned'){
   row(p,'Planned distance',a.plannedDistance===null?'Unavailable':a.plannedDistance.toFixed(2)+' km');
   row(p,'Distance completed',a.totalDistanceRatio===null?'Unavailable':Math.round(a.totalDistanceRatio*100)+'%');
   row(p,'Main-set execution',a.execution==='insufficient-evidence'?'Not assessed — verified step alignment required':a.execution);
  }else{
   row(p,'Recorded stimulus',a.classification.replaceAll('-',' '));
   p.append(el('p',a.recovery,'muted small'));
  }
  p.append(el('p',a.stimulus,'muted small'));
  for(const note of [...(a.good||[]),...(a.improve||[]),...(a.cautions||[])])p.append(el('p',note,'muted small'));
  p.append(el('p',a.programmeImpact,'muted small'));
 }
 p=section('Training context');p.append(el('p','This is a descriptive analysis. No workout targets or future sessions have been changed.','muted small'));
}
const api={analyse,linkedWorkout,zoneDistribution,validZones,fmtPace,render};
root.mileRunningIQ=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
