// Optional running split cards. Existing share styles and data remain unchanged.
(function(root){
 'use strict';
 const isRun=v=>/^(?:running|run|trail[_ -]running|trail[_ -]run|treadmill(?:[_ -]running)?|indoor[_ -]running|virtual[_ -]running|track[_ -]running|road[_ -]running)$/i.test(String(v||'').trim());
 const clock=v=>{const s=Math.max(0,Math.round(Number(v)||0));return (s>=3600?Math.floor(s/3600)+':':'')+(s>=3600?String(Math.floor(s%3600/60)).padStart(2,'0'):Math.floor(s/60))+':'+String(s%60).padStart(2,'0')};
 function normalize(laps,calculated){
  const clean=input=>(Array.isArray(input)?input:[]).map((r,i)=>({index:Number(r.index??r.km??i+1),distance:Number(r.distance),seconds:Number(r.duration??r.seconds)})).filter(r=>Number.isFinite(r.distance)&&r.distance>0&&Number.isFinite(r.seconds)&&r.seconds>0&&Number.isInteger(r.index)&&r.index>=0);
  const recorded=clean(laps);return recorded.length?{source:'laps',rows:recorded}:{source:'splits',rows:clean(calculated)};
 }
 function layout(rows,page=0){const count=Math.max(1,Math.ceil(rows.length/44)),n=Math.max(0,Math.min(count-1,Math.floor(page)||0)),part=rows.slice(n*44,(n+1)*44),columns=part.length>14?2:1,per=Math.max(1,Math.ceil(part.length/columns));return {count,page:n,part,columns,per,rowHeight:Math.min(56,620/per),font:columns===1?34:Math.min(27,Math.floor(620/per)-3)}}
 function extract(raw,samples){
  const d=Array.isArray(raw)?raw[0]:raw;if(!d)return normalize([],[]);
  const data=samples??d.samples??d.points??d.activityDetailsMetrics??d.metrics??d.activityDetailMetrics??[];
  const recorded=root.mileBeta4RecordedLaps?.(d)||[],laps=recorded.length?recorded:(root.mile762?.markerLaps?.(data,d.laps)||[]);
  return normalize(laps,root.mile762?.splits?.(data,1000)||[]);
 }
 function paint(model,data,dark=false,page=0){
  const c=document.createElement('canvas');c.width=1080;c.height=1350;const x=c.getContext('2d');
  const [bg,fg,muted,accent,line]=dark?['#1c2023','#f8faf8','#b7c0bd','#b7f778','#47504d']:['#e8e8e4','#141614','#60645f','#3f6942','#b6b9b2'],L=layout(data.rows,page);
  x.fillStyle=bg;x.fillRect(0,0,1080,1350);
  function text(value,xx,y,size=28,color=fg,weight=700,align='left',max=0,italic=false){x.fillStyle=color;x.font=(italic?'italic ':'')+weight+' '+size+'px Arial,Helvetica,sans-serif';x.textAlign=align;let str=String(value);if(max&&x.measureText(str).width>max){while(str.length>2&&x.measureText(str+'…').width>max)str=str.slice(0,-1);str+='…'}x.fillText(str,xx,y);x.textAlign='left'}
  function rule(xx,y,w,color=line,h=1){x.fillStyle=color;x.fillRect(xx,y,w,h)}
  const km=Number(model.distance_m)/1000,sec=Number(model.duration_s),pace=Number(model.average_pace_s_km)||(km>0&&sec>0?sec/km:0),hr=Number(model.average_hr),allKm=data.rows.every(r=>Math.abs(r.distance-1000)<.1)||data.source==='splits';
  text('MILE.',72,125,105,fg,900,'left',0,true);rule(72,151,360,accent,7);text('RUNNING / SPLITS',1008,110,27,muted,700,'right');
  text(String(model.title||'Running').toUpperCase(),72,222,34,muted,700,'left',936);text(km>0?km.toFixed(2):'—',65,344,136,fg,900,'left',800);text('KM',1008,338,33,muted,700,'right');
  for(const [xx,label,value] of [[72,'TIME',sec>0?clock(sec):'—'],[400,'AVG PACE',pace>0?clock(pace)+'/km':'—'],[755,'AVG HR',hr>0?Math.round(hr)+' bpm':'—']]){text(label,xx,409,23,muted);text(value,xx,455,40,fg,800,'left',300)}
  rule(72,486,936,accent,3);text((allKm?'KM SPLITS':'RECORDED LAPS')+'  /  '+data.rows.length,72,531,29,fg,800,'left',700);if(L.count>1)text('CARD '+(L.page+1)+' / '+L.count,1008,531,24,muted,700,'right');
  const w=L.columns===1?936:446;
  for(let col=0;col<L.columns;col++){
   const xx=72+col*490;const part=L.part.slice(col*L.per,(col+1)*L.per);
   text(allKm?'KM':'LAP / KM',xx,580,23,muted);text('TIME',xx+w*.55,580,23,muted,700,'right');text('PACE /KM',xx+w,580,23,muted,700,'right');rule(xx,594,w);
   part.forEach((r,j)=>{const y=594+(j+1)*L.rowHeight-6;const label=allKm?String(r.index):r.index+' · '+(r.distance/1000).toFixed(2);text(label,xx,y,L.font,fg,700,'left',w*.31);text(clock(r.seconds),xx+w*.55,y,L.font,fg,800,'right',w*.24);text(clock(r.seconds*1000/r.distance),xx+w,y,L.font,fg,700,'right',w*.35);rule(xx,y+8,w)});
  }
  rule(72,1230,936,accent,2);text('MAKE IT LOOK EASY.',72,1282,24,fg,800);
  const date=new Date(model.activity_at||'');text(Number.isFinite(date.getTime())?date.toLocaleDateString('en-AU',{day:'2-digit',month:'2-digit',year:'numeric'}):'',1008,1282,24,muted,700,'right',400);
  return c;
 }
 const names=data=>data?.rows?.length?Array.from({length:layout(data.rows).count},(_,page)=>['Splits Light','Splits Dark'].map(n=>n+(layout(data.rows).count>1?' · '+(page+1)+'/'+layout(data.rows).count:''))).flat():[];
 function preview(model,data,i){return '<img class="mile-card-art" style="padding:0;object-fit:contain" alt="MILE running splits card" src="'+paint(model,data,i%2===1,Math.floor(i/2)).toDataURL('image/png')+'">'}
 async function social(p){
  if(!isRun(p.activity_type)||typeof userId==='undefined'||!userId||String(p.user_id)!==String(userId))return null;
  if(String(p.source_activity_id||'').startsWith('mile-tracker:')&&Array.isArray(p.detail_snapshot?.splits)){
   return normalize(p.detail_snapshot.splits.map((r,i)=>({index:i+1,distance:1000,seconds:Number(r?.seconds??r?.duration??r)})),[]);
  }
  try{
   const owner=userId,auth=typeof token!=='undefined'?token:localStorage.getItem('av-token');if(!auth)return null;
   const response=await fetch('https://mgixvokjlytjuypzcfzz.supabase.co/functions/v1/mile-shared-activity-detail?postId='+encodeURIComponent(p.id),{headers:{Authorization:'Bearer '+auth,Accept:'application/json'},signal:AbortSignal.timeout(8000),cache:'no-store'});
   if(!response.ok||owner!==userId)return null;
   const result=await response.json(),d=result.details;if(!d||owner!==userId)return null;return extract(d.raw_data||d.rawData||d);
  }catch{return null}
 }
 function ownButtons(dialog,a,d,meta){
  if(!isRun(meta.sport))return;
  const data=extract(d);if(!data.rows.length)return;
  const choices=dialog.querySelector('.mile352-choices');if(!choices)return;
  const model={title:meta.title,activity_at:meta.date,distance_m:Number(a.distanceKm)*1000,duration_s:meta.seconds,average_pace_s_km:Number(a.paceMinKm)*60,average_hr:a.averageHR};
  // Keep original controls and add the new options in a second row.
  const row=document.createElement('div');row.className='mile352-choices';row.style.flexWrap='wrap';choices.after(row);
  const photo=dialog.querySelector('.mile352-photo-label');
  names(data).forEach((name,i)=>{
   const b=document.createElement('button');b.type='button';b.textContent=name;b.addEventListener('click',()=>{
    dialog.dataset.style='splits';dialog.querySelectorAll('.mile352-choices button').forEach(x=>x.classList.toggle('active',x===b));if(photo)photo.hidden=true;
    dialog.querySelector('#mile352-preview').src=paint(model,data,i%2===1,Math.floor(i/2)).toDataURL('image/png');
   });row.append(b)
  });
  choices.addEventListener('click',()=>{row.querySelectorAll('button').forEach(x=>x.classList.remove('active'));if(photo)photo.hidden=false});
 }
 root.mileSplitShare={normalize,layout,clock,isRun,extract,paint,names,preview,social,ownButtons};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.mileSplitShare;
})(globalThis);
