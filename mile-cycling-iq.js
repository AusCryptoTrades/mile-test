/* Private Cycling Analysis. Observations and recommendations have no write path. */
(function (root) {
'use strict';
const plan=root.mileCyclingPlan||(typeof module!=='undefined'&&require('./mile-cycling-plan.js'));
const prescription=root.mileStructuredWorkout;
const within=(value,low,high)=>Number.isFinite(value)&&value>=low&&value<=high;
const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length;

function providerSamples(rows) {
 return (Array.isArray(rows)?rows:[]).filter(sample=>sample&&typeof sample==='object').map(sample=>{
  const time=sample.timestamp??sample.startTimeInSeconds??sample.directTimestamp??sample.t;
  return {
   t:typeof time==='string'&&!/^\d+(?:\.\d+)?$/.test(time)?Date.parse(time)/1000:
    time==null||time===''?null:Number(time)/(Number(time)>1e11?1000:1),
   watts:sample.powerInWatts??sample.directPower??sample.power??null,
   bpm:sample.heartRateInBeatsPerMinute??sample.heartRate??sample.directHeartRate??null,
   cadence:sample.bikeCadenceInRPM??sample.cadenceInRevolutionsPerMinute??sample.directBikeCadence??null,
   paused:sample.paused===true||sample.isPaused===true
  };
 });
}
function perSecond(rows) {
 const ordered=(Array.isArray(rows)?rows:[]).filter(row=>Number.isFinite(row?.t)).slice(0,120000)
  .map(row=>({...row,t:Math.floor(row.t)})).sort((a,b)=>a.t-b.t);
 if(ordered.length<2||ordered.at(-1).t-ordered[0].t>86400)return [];
 const seconds=[];
 for(let index=0;index<ordered.length-1;index++){
  const row=ordered[index], interval=ordered[index+1].t-row.t;
  if(interval===0)continue;
  const valid=interval<=3&&!row.paused&&!ordered[index+1].paused;
  for(let second=0;second<interval;second++)seconds.push({
   offset:row.t-ordered[0].t+second, paused:row.paused,
   watts:valid&&within(row.watts,0,2500)?row.watts:null,
   bpm:valid&&within(row.bpm,35,250)?row.bpm:null,
   cadence:valid&&within(row.cadence,0,230)?row.cadence:null
  });
 }
 return seconds;
}
function measurement(seconds,name,minimum=30) {
 const active=seconds.filter(row=>!row.paused);
 const values=active.map(row=>row[name]).filter(value=>value!==null);
 return values.length>=minimum&&values.length>=.9*active.length?average(values):null;
}
function rollingPower(seconds) {
 const windows=[];
 let queue=[],sum=0;
 for(const {watts} of seconds){
  if(watts===null){queue=[];sum=0;continue;}
  queue.push(watts);
  sum+=watts;
  if(queue.length>30)sum-=queue.shift();
  if(queue.length===30)windows.push((sum/30)**4);
 }
 const active=seconds.filter(row=>!row.paused).length;
 return active>=300&&windows.length>=.8*(active-29)?average(windows)**.25:null;
}
function observedPower(seconds) {
 const durations=[5,60,300,1200];
 return durations.flatMap(duration=>{
  let best=null,sum=0,valid=0;
  for(let i=0;i<seconds.length;i++){
   const value=seconds[i].watts;
   if(value===null){valid=0;sum=0;continue;}
   valid++;
   sum+=value;
   if(valid>duration)sum-=seconds[i-duration].watts;
   if(valid>=duration)best=Math.max(best??0,sum/duration);
  }
  return best===null?[]:[{duration,watts:best}];
 });
}
function chartSeries(seconds) {
 if(!seconds.length)return [];
 const width=Math.max(15,Math.ceil(seconds.length/120));
 const bars=[];
 for(let i=0;i<seconds.length;i+=width){
  const chunk=seconds.slice(i,i+width),valid=chunk.map(row=>row.watts).filter(value=>value!==null);
  bars.push(valid.length>=.8*chunk.length?average(valid):null);
 }
 return bars;
}
function distribution(seconds,name,classify) {
 const active=seconds.filter(row=>!row.paused);
 const values=active.map(row=>row[name]).filter(value=>value!==null);
 if(values.length<60||values.length<.9*active.length)return null;
 const counts={};
 for(const value of values){
  const zone=classify(value)??'Outside saved ranges';
  counts[zone]=(counts[zone]||0)+1;
 }
 return counts;
}
function decoupling(seconds,{normalizedPower,averagePower,indoor,steady}){
 if(!indoor||!steady||!normalizedPower||!averagePower||normalizedPower/averagePower>1.06||seconds.length<1800)return null;
 const middle=seconds.slice(300,-300);
 if(middle.some(row=>row.paused||row.watts===null||row.bpm===null||row.watts===0))return null;
 const mean=average(middle.map(row=>row.watts));
 const cv=Math.sqrt(average(middle.map(row=>(row.watts-mean)**2)))/mean;
 if(cv>.12)return null;
 const half=Math.floor(middle.length/2);
 const efficiency=part=>average(part.map(row=>row.watts))/average(part.map(row=>row.bpm));
 const first=efficiency(middle.slice(0,half)),last=efficiency(middle.slice(half));
 return first>0?100*(1-last/first):null;
}
function ftpAt(history,date) {
 return (Array.isArray(history)?history:[]).filter(row=>row&&plan.iso(row.date)&&row.date<=date&&plan.validFtp(row.watts)&&
  ['manual','imported'].includes(row.source)&&row.confidence!=='low').sort((a,b)=>b.date.localeCompare(a.date))[0]??null;
}
function recommendation(workout,checkins,today) {
 if(!plan.iso(today)||!workout?.demanding||workout.sport!=='Cycling'||workout.status!=='planned'||workout.matchId||!workout.cyclingPlanVersion)return null;
 const high=Object.entries(checkins||{}).filter(([date,entry])=>date>=plan.add(today,-6)&&date<=today&&within(Number(entry?.fatigue),7,10));
 if(high.length<2||!within(workout.plannedMinutes,15,480))return null;
 const mins=Math.max(15,Math.min(30,workout.plannedMinutes));
 return {
  before:workout.name+' · '+workout.plannedMinutes+' min',
  after:'Easy recovery spin · '+mins+' min · RPE 1–2/10',
  reason:'You reported high fatigue on '+high.length+' days this week. Consider an easy ride or rest, then review how you feel.'
 };
}
function analyse(activity,{samples=[],history=[],ftpHistory=[],hrZones={},workouts=[],today=activity.date,checkins={}}={}){
 const seconds=perSecond(samples),ftp=ftpAt(ftpHistory,activity.date);
 const activeSeconds=seconds.filter(row=>!row.paused).length;
 const activeWatts=measurement(seconds,'watts'),reportedWatts=within(activity.averageWatts,0,2500)?activity.averageWatts:null;
 const averagePower=activeWatts??reportedWatts;
 const normalizedPower=activeWatts!==null?rollingPower(seconds):null;
 const duration=within(activity.activeSeconds,1,86400)?activity.activeSeconds:null;
 const reliableDuration=duration!==null&&Math.abs(duration-activeSeconds)<=Math.max(5,.05*duration);
 const intensityFactor=normalizedPower!==null&&ftp?normalizedPower/ftp.watts:null;
 const stress=intensityFactor!==null&&reliableDuration?duration/3600*intensityFactor**2*100:null;
 const variabilityIndex=normalizedPower!==null&&activeWatts>0?normalizedPower/activeWatts:null;
 const matches=workouts.filter(item=>item.sport==='Cycling'&&item.matchId!=null&&String(item.matchId)===String(activity.id));
 const linked=matches.length===1?matches[0]:null;
 const powerZones=ftp?distribution(seconds,'watts',value=>plan.powerZone(value,ftp.watts)):null;
 const hrZonesMeasured=Object.keys(hrZones).length?distribution(seconds,'bpm',value=>Object.entries(hrZones)
  .find(([,bounds])=>Array.isArray(bounds)&&within(value,bounds[0],bounds[1]))?.[0]):null;
 const cadence=measurement(seconds,'cadence');
 const indoor=activity.setting==='indoor',steady=linked?['endurance','indoor','long','brick','recovery'].includes(linked.kind):activity.steady===true;
 const drift=decoupling(seconds,{normalizedPower,averagePower:activeWatts,indoor,steady});
 const next=workouts.filter(item=>item.sport==='Cycling'&&item.status==='planned'&&!item.matchId&&item.date>today)
  .sort((a,b)=>a.date.localeCompare(b.date))[0];
 const proposed=today&&next?recommendation(next,checkins,today):null;
 const hasDate=plan.iso(activity.date);
 const recent=hasDate?[0,7].map(offset=>history.filter(row=>row.date>=plan.add(activity.date,-offset-6)&&row.date<=plan.add(activity.date,-offset))
  .reduce((sum,row)=>sum+(within(row.minutes,0,1440)?row.minutes:0),0)):null;
 const total=linked?.structuredDetail===linked?.detail?prescription.totals(linked?.structuredSteps,{sport:'Cycling'}):null;
 const plannedMinutes=total?.allTime?total.seconds/60:null;
 return {observed:activeWatts!==null?observedPower(seconds):[],series:activeWatts!==null?chartSeries(seconds):[],averagePower,averagePowerSource:activeWatts!==null?'samples':reportedWatts!==null?'provider summary':null,
  normalizedPower,intensityFactor,stress,variabilityIndex,powerZones,hrZonesMeasured,cadence,drift,ftp,activeSeconds,duration,recent,
  averageHR:measurement(seconds,'bpm')??(within(activity.averageHR,35,250)?activity.averageHR:null),
  elevation:within(activity.elevation,0,20000)?activity.elevation:null,indoor,linked,plannedMinutes,next,proposed,
  comparison:linked?(plannedMinutes!==null&&duration!==null?'Recorded '+Math.round(duration/60)+' min against '+plannedMinutes+' min planned.':'Linked ride. A timed comparison needs recorded duration and structured steps.'):
   'Unplanned ride or no confirmed link. Review the recorded performance.',
  workoutContext:indoor?'Indoor cycling':activity.setting==='outdoor'?'Outdoor cycling':'Cycling'};
}
function render(host,result,{detailsOpen=false}={}) {
 const time=seconds=>prescription.time(Math.round(seconds));
 const metric=(name,value)=>({name,value});
 const items=[result.duration&&metric('Moving time',time(result.duration)),
  result.averagePower!==null&&metric('Average power',Math.round(result.averagePower)+' W'),
  result.averagePower===null&&result.averageHR!==null&&metric('Average HR',Math.round(result.averageHR)+' bpm'),
  result.normalizedPower!==null&&metric('Normalised power',Math.round(result.normalizedPower)+' W'),
  result.indoor&&result.cadence!==null&&metric('Average cadence',Math.round(result.cadence)+' rpm'),
  !result.indoor&&result.elevation!==null&&metric('Elevation gain',Math.round(result.elevation)+' m')].filter(Boolean).slice(0,4);
 const element=(tag,text,style)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(style)node.className=style;return node;};
 const body=element('section',null,'mile35-panel');
 body.append(element('h3','MILE IQ · '+result.workoutContext));
 const metrics=element('div',null,'mile35-metrics');
 for(const item of items){
  const cell=element('div',null,'mile35-metric');
  cell.append(element('strong',item.value),element('span',item.name));
  metrics.append(cell);
 }
 body.append(metrics);
 if(!items.length)body.append(element('p','Recorded measurements are unavailable for this ride.','muted small'));
 const section=(title,text)=>body.append(element('h4',title),element('p',text,'small'));
 section('Session execution',result.comparison);
 if(result.recent?.some(Boolean))section('Recent cycling',Math.round(result.recent[0])+' min recorded over seven days, compared with '+Math.round(result.recent[1])+' min in the preceding seven days.');
 section('Next session focus',result.next?.focus||'Review how the ride felt before planning the next effort.');
 section('Programme review',result.proposed?
  result.proposed.reason+' '+result.proposed.before+' → '+result.proposed.after+'. Review this suggestion before making changes.':
  'Continue reviewing your training and recovery. A single ride is insufficient evidence for a programme change.');
 host.append(body);
 const details=element('details',null,'mile35-panel m881-detailed');
 details.open=detailsOpen;
 details.append(element('summary','Detailed Analysis'));
 const add=(name,value)=>{const row=element('div',null,'mile35-datarow');row.append(element('span',name),element('strong',value));details.append(row);};
 if(result.series.some(value=>value!==null)){
  const chart=element('div',null,'m90-power-series');
  chart.setAttribute('role','img');
  chart.setAttribute('aria-label','Recorded power over time. Blanks are unrecorded.');
  const peak=Math.max(1,...result.series.filter(value=>value!==null));
  for(const value of result.series){
   const bar=element('span');
   if(value!==null){bar.style.height=Math.max(2,100*value/peak)+'%';bar.title=Math.round(value)+' W';}
   chart.append(bar);
  }
  details.append(element('h4','Recorded power'),chart);
 }
 for(const best of result.observed)add('Best observed '+time(best.duration),Math.round(best.watts)+' W');
 if(result.ftp)add('FTP at ride date',result.ftp.watts+' W · '+result.ftp.source);
 if(result.intensityFactor!==null)add('Intensity factor',result.intensityFactor.toFixed(2));
 if(result.stress!==null)add('Power-based training stress estimate',String(Math.round(result.stress)));
 if(result.variabilityIndex!==null)add('Variability index',result.variabilityIndex.toFixed(2));
 if(result.drift!==null)add('Power-to-HR decoupling',result.drift.toFixed(1)+'%');
 for(const [zone,seconds] of Object.entries(result.powerZones||{}))add('Power zone '+zone,time(seconds));
 for(const [zone,seconds] of Object.entries(result.hrZonesMeasured||{}))add('Heart rate · '+zone,time(seconds));
 details.append(element('p','Power calculations require recorded samples with sufficient coverage. Power-based stress also needs a dated FTP and moving time. Interval execution requires verified step alignment.','muted small'));
 host.append(details);
}
const api={providerSamples,perSecond,rollingPower,ftpAt,analyse,recommendation,render};
root.mileCyclingIQ=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
