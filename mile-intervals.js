// Batch 87.5: real recorded intervals, never infer intensity from pace.
(function(root){
'use strict';
const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const get=(o,...ks)=>{for(const k of ks){const v=num(o?.[k]);if(v!==null)return v}return null};
const type=v=>({active:'Run',interval:'Run',run:'Run',running:'Run',recovery:'Recovery',rest:'Rest',warmup:'Warm-up',warm_up:'Warm-up',cooldown:'Cool-down',cool_down:'Cool-down'})[String(v??'').toLowerCase().replace(/[- ]/g,'_')]||null;
const stamp=v=>{const t=v instanceof Date?v.getTime()/1000:num(v);return t!==null&&t>1e11?t/1000:t};
const validHR=v=>typeof v==='number'&&v>0&&v<=250;
function points(raw){return (Array.isArray(raw)?raw:[]).map(p=>({t:stamp(get(p,'startTimeInSeconds','timestamp','time','t','directTimestamp')),d:get(p,'totalDistanceInMeters','distanceInMeters','distance','distanceM','sumDistance','dist'),clock:get(p,'timerDurationInSeconds','clockDurationInSeconds','elapsed'),hr:get(p,'heartRate','heartRateInBeatsPerMinute','hr','directHeartRate')})).filter(p=>p.t!==null).sort((a,b)=>a.t-b.t)}
function at(p,t,key,gap=15){if(t===null)return null;for(let i=0;i<p.length;i++){const x=p[i];if(x.t===t&&x[key]!==null)return x[key];if(x.t>t){const q=p[i-1];if(!q||x.t-q.t>gap||q[key]===null||x[key]===null)return null;return q[key]+(x[key]-q[key])*(t-q.t)/(x.t-q.t)}}return null}
function hrStats(p,start,end){
 if(start===null||end===null||end<=start)return {};
 const samples=p.filter(x=>validHR(x.hr)),first=at(samples,start,'hr',10),last=at(samples,end,'hr',10),seq=[{t:start,hr:first},...samples.filter(x=>x.t>start&&x.t<end),{t:end,hr:last}];
 let coverage=0,area=0;for(let i=1;i<seq.length;i++){const a=seq[i-1],b=seq[i],dt=b.t-a.t;if(dt>0&&dt<=15&&validHR(a.hr)&&validHR(b.hr)){coverage+=dt;area+=dt*(a.hr+b.hr)/2}}
 const hrs=seq.map(x=>x.hr).filter(validHR);
 return {hr:coverage>0&&coverage/(end-start)>=.9?area/coverage:null,max:coverage/(end-start)>=.9&&hrs.length?Math.max(...hrs):null,startHR:validHR(first)?first:null,endHR:validHR(last)?last:null};
}
function normalize(detail,legacy=[]){
 const d=Array.isArray(detail)?detail[0]:detail;if(!d||typeof d!=='object')return [];
 const p=points(d.samples??d.points??d.activityDetailsMetrics??d.metrics??d.activityDetailMetrics??[]),raw=Array.isArray(d.laps)?d.laps:Array.isArray(d.lapMesgs)?d.lapMesgs:[];
 const source=raw.length?raw:legacy;if(!Array.isArray(source)||source.length>1000)return [];
 const rows=source.map((l,i)=>{
  const start=stamp(l.startTimeInSeconds??l.startTime??l.lapStartTime??null),next=stamp(source[i+1]?.startTimeInSeconds??source[i+1]?.startTime??source[i+1]?.lapStartTime??null);
  let seconds=get(l,'durationInSeconds','totalTimerTime','timerDurationInSeconds','clockDurationInSeconds','duration','seconds'),distance=get(l,'distanceInMeters','totalDistance','distance','distanceMeters');
  const end=stamp(l.endTimeInSeconds??l.timestamp??null)??next??(start!==null&&p.length?p.at(-1).t:null);
  if(seconds===null&&start!==null&&end!==null){const a=at(p,start,'clock'),b=at(p,end,'clock');seconds=a!==null&&b!==null&&b>=a?b-a:end-start}
  if(distance===null&&start!==null&&end!==null){const a=at(p,start,'d'),b=at(p,end,'d');distance=a!==null&&b!==null&&b>=a?b-a:null}
  const hrs=hrStats(p,start,end),avg=get(l,'averageHeartRateInBeatsPerMinute','avgHeartRate','averageHR'),max=get(l,'maxHeartRateInBeatsPerMinute','maxHeartRate','maxHR');
  return {lap:i+1,type:type(l.intensity??l.stepType??l.lapType),seconds,distance,hr:validHR(avg)?avg:hrs.hr??null,max:validHR(max)?max:hrs.max??null,endHR:hrs.endHR??null,startHR:hrs.startHR??null,start,end};
 });
 if(!rows.length||rows.some(l=>l.seconds===null||l.seconds<=0||l.seconds>86400||l.distance===null||l.distance<0||l.distance>500000))return [];
 return rows;
}
function expand(steps){let out=[];function walk(xs,depth){if(!Array.isArray(xs)||depth>3)throw Error('Invalid steps');for(const s of xs){if(s.kind==='repeat'){if(!Number.isInteger(s.count)||s.count<2||s.count>50)throw Error('Invalid repeat');for(let i=0;i<s.count;i++)walk(s.steps,depth+1)}else if(s.kind==='step'&&type(s.intensity)){out.push(s);if(out.length>1000)throw Error('Too many steps')}else throw Error('Invalid step')}}try{walk(steps,0);return out}catch{return []}}
function candidate(rows,plan){
 if(!plan||plan.structuredDetail!==plan.detail||!Array.isArray(plan.structuredSteps))return null;
 const steps=expand(plan.structuredSteps);if(!steps.length||steps.length!==rows.length||!steps.some(s=>['Recovery','Rest'].includes(type(s.intensity))))return null;
 if(!steps.every((s,i)=>{const r=rows[i],d=s.duration,t=type(s.intensity);if(r.type&&r.type!==t)return false;if(d?.kind==='time')return Number.isFinite(d.seconds)&&Math.abs(r.seconds-d.seconds)<=Math.max(3,d.seconds*.04);if(d?.kind==='distance')return Number.isFinite(d.meters)&&Math.abs(r.distance-d.meters)<=Math.max(15,d.meters*.04);return false}))return null;return steps;
}
const classify=(rows,steps)=>rows.map((r,i)=>({...r,type:type(steps[i].intensity),target:steps[i].target,planned:steps[i].duration}));
function stats(rows){const seconds=rows.reduce((n,r)=>n+r.seconds,0),distance=rows.reduce((n,r)=>n+r.distance,0),hrs=rows.filter(r=>validHR(r.hr)),maxes=rows.filter(r=>validHR(r.max)),ht=hrs.reduce((n,r)=>n+r.seconds,0);return {seconds,distance,pace:distance>0?seconds*1000/distance:null,hr:ht>0&&hrs.length===rows.length?hrs.reduce((n,r)=>n+r.hr*r.seconds,0)/ht:null,max:maxes.length&&maxes.length===rows.length?Math.max(...maxes.map(r=>r.max)):null,count:rows.length}}
function recoveryDrops(rows){return rows.flatMap((r,i)=>{const p=rows[i-1];return ['Recovery','Rest'].includes(r.type)&&p?.type==='Run'&&r.seconds>=15&&validHR(p.endHR)&&validHR(r.endHR)&&p.end!==null&&r.start!==null&&Math.abs(p.end-r.start)<=2?[{lap:r.lap,drop:p.endHR-r.endHR}]:[]})}
const fmt=s=>s===null||!Number.isFinite(s)?'—':Math.floor(Math.round(s)/60)+':'+String(Math.round(s)%60).padStart(2,'0');
const pace=s=>s===null?'—':fmt(s)+'/km',hr=s=>s===null?'—':Math.round(s)+' bpm';
const row=(k,v)=>'<div class="mile35-datarow"><span>'+k+'</span><strong>'+v+'</strong></div>',cell=(k,v)=>'<div><strong>'+v+'</strong><small>'+k+'</small></div>';
function mount(host,detail,legacy=[],plan=null){
 let rows=normalize(detail,legacy);if(!rows.length)return false;
 const proposed=candidate(rows,plan);let confirmed=false,filter='All',selected=null;
 const wrap=document.createElement('div');wrap.className='m875-intervals';host.replaceChildren(wrap);
 function render(){
  const typed=rows.some(r=>r.type),types=['Run','Recovery','Warm-up','Cool-down','Rest','Unclassified'].filter(t=>rows.some(r=>(r.type||'Unclassified')===t));
  const shown=rows.filter(r=>filter==='All'||(r.type||'Unclassified')===filter),s=stats(shown),runs=rows.filter(r=>r.type==='Run'&&r.distance>0),rs=stats(runs),paces=runs.map(r=>r.seconds*1000/r.distance),fast=paces.length?Math.min(...paces):null,slow=paces.length?Math.max(...paces):null,drops=recoveryDrops(rows),visibleDrops=drops.filter(d=>shown.some(r=>r.lap===d.lap));
  const dropText=d=>d.length?Math.round(d.reduce((n,x)=>n+x.drop,0)/d.length)+' bpm':'Not available';
  let html='<div class="m875-head"><h3>'+(typed?'Intervals':'Splits')+'</h3><small>'+rows.length+' laps</small></div><p class="m875-muted">'+(confirmed?'Athlete-confirmed MILE step alignment':typed?'Recorded step classifications':'Recorded laps · step classifications unavailable')+'</p>';
  if(typed)html+='<div class="m875-seg" role="group" aria-label="Filter step type">'+['All',...types].map(t=>'<button type="button" data-m875-filter="'+t+'" aria-pressed="'+(filter===t)+'">'+t+'</button>').join('')+'</div>';
  else html+='<p class="m875-note">This import does not include verified step types. Showing recorded laps without guessing which were running or recovery.</p>';
  if(proposed&&!confirmed&&!typed)html+='<button type="button" class="m875-confirm" data-m875-confirm>Review matched MILE workout steps</button>';
  html+='<div class="m875-head"><h3>'+(filter==='All'?(typed?'All intervals':'All laps'):filter==='Run'?'Working intervals':filter+' intervals')+'</h3><small>'+shown.length+' laps</small></div><div class="m875-summary">'+cell('Distance',(s.distance/1000).toFixed(2)+' km')+cell('Time',fmt(s.seconds))+cell('Avg pace',pace(s.pace))+cell('Avg HR',hr(s.hr))+cell('Max HR',hr(s.max))+cell('Laps',s.count)+'</div><p class="m875-muted">Pace uses total time ÷ distance. Average HR is duration-weighted; unavailable measurements are not estimated.</p>';
  html+='<div class="m875-tablewrap"><table class="m875-table"><thead><tr><th scope="col">Lap</th>'+(typed?'<th scope="col">Type</th>':'')+'<th scope="col">Time</th><th scope="col">km</th><th scope="col">Pace</th><th scope="col">HR</th></tr></thead><tbody>'+shown.map(r=>'<tr data-m875-lap="'+r.lap+'" class="'+(['Recovery','Rest'].includes(r.type)?'recovery ':'')+(selected===r.lap?'highlight':'')+'"><td>'+r.lap+'</td>'+(typed?'<td>'+(r.type||'Unclassified')+'</td>':'')+'<td>'+fmt(r.seconds)+'</td><td>'+(r.distance/1000).toFixed(2)+'</td><td>'+fmt(r.distance>0?r.seconds*1000/r.distance:null)+'</td><td>'+(validHR(r.hr)?Math.round(r.hr):'—')+'</td></tr>').join('')+'</tbody><tfoot><tr><td colspan="'+(typed?2:1)+'">Total</td><td>'+fmt(s.seconds)+'</td><td>'+(s.distance/1000).toFixed(2)+'</td><td>'+fmt(s.pace)+'</td><td>'+(s.hr===null?'—':Math.round(s.hr))+'</td></tr></tfoot></table></div>';
  if(typed&&(filter==='Recovery'||filter==='Rest'))html+='<section class="m875-analysis"><h3>Recovery analysis</h3>'+row('Recovery time',fmt(s.seconds))+row('Average recovery HR',hr(s.hr))+row('Mean end-of-step HR drop',dropText(visibleDrops))+'<p class="m875-note">HR drop requires actual readings at consecutive work and recovery boundaries; recoveries under 15 seconds are excluded.</p></section>';
  else if(runs.length){html+='<section class="m875-analysis"><div class="m875-head"><h3>Working interval analysis</h3><small>Run only</small></div><div class="m875-summary">'+cell('Working pace',pace(rs.pace))+cell('Fastest rep',pace(fast))+cell('Pace spread',Math.round(slow-fast)+' sec')+'</div><p class="m875-muted">Pace by recorded repetition · higher bar = faster pace</p><div class="m875-chart">'+runs.map((r,i)=>'<button type="button" data-m875-rep="'+r.lap+'" aria-pressed="'+(selected===r.lap)+'" aria-label="Highlight run '+(i+1)+'"><span>'+fmt(paces[i])+'</span><i style="height:'+Math.round(20+70*(slow===fast?1:(slow-paces[i])/(slow-fast)))+'px"></i><small>'+(i+1)+'</small></button>').join('')+'</div>'+row('Working distance',(rs.distance/1000).toFixed(2)+' km')+row('Working time',fmt(rs.seconds))+row('Average working HR',hr(rs.hr))+row('Maximum working HR',hr(rs.max))+row('Mean end-of-step HR drop',dropText(drops))+'</section>'}
  if(confirmed){const work=rows.filter(r=>r.type==='Run');html+='<section class="m875-analysis"><h3>Planned vs completed</h3>'+row('Matched work steps',work.length+' of '+proposed.filter(s=>type(s.intensity)==='Run').length)+(work.every(r=>r.planned?.kind==='time')?row('Working duration',fmt(stats(work).seconds)+' / '+fmt(work.reduce((n,r)=>n+r.planned.seconds,0))):'')+work.map((r,i)=>{const target=r.target,actual=r.distance>0?r.seconds*1000/r.distance:null;return row('Run '+(i+1)+' target',target?.kind==='pace'&&Number.isFinite(target.fastSecondsPerKm)&&Number.isFinite(target.slowSecondsPerKm)?pace(actual)+' / '+fmt(target.fastSecondsPerKm)+'–'+fmt(target.slowSecondsPerKm)+'/km':target?.kind==='heart_rate'&&Number.isFinite(target.lowBpm)&&Number.isFinite(target.highBpm)?hr(r.hr)+' / '+target.lowBpm+'–'+target.highBpm+' bpm':'Open target')}).join('')+'<p class="m875-muted">Athlete-confirmed alignment for this view only; not automatic evidence for MILE IQ.</p></section>'}
  wrap.innerHTML=html;
 }
 wrap.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.m875Filter){filter=b.dataset.m875Filter;selected=null;render()}else if(b.dataset.m875Rep){selected=Number(b.dataset.m875Rep);filter='Run';render();wrap.querySelector('[data-m875-lap="'+selected+'"]')?.scrollIntoView({block:'nearest'})}else if(b.hasAttribute('data-m875-confirm')&&proposed){const list=proposed.map((s,i)=>(i+1)+'. '+type(s.intensity)+' — '+fmt(rows[i].seconds)+', '+(rows[i].distance/1000).toFixed(2)+' km').join('\n');if(root.confirm('Confirm that these recorded laps correspond to the linked MILE workout steps. Labels are not saved or inferred automatically.\n\n'+list)){rows=classify(rows,proposed);confirmed=true;render()}}});
 render();return true;
}
const api={type,normalize,expand,candidate,classify,stats,recoveryDrops,mount};root.mileIntervals=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
