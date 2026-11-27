// Manual Device Sync beta. Explicit preview/consent; never publish on page load.
(function(root){
 'use strict';
 const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 const hasHeartRateEnd=steps=>steps.some(step=>step?.duration?.kind==='heart_rate'||
  (Array.isArray(step?.steps)&&hasHeartRateEnd(step.steps)));
 const eligible=(w,from,to)=>!!w&&validId(w.id)&&w.sport==='Running'&&w.status==='planned'&&!w.matchId&&typeof w.date==='string'&&w.date>=from&&w.date<=to&&Array.isArray(w.structuredSteps)&&w.structuredSteps.length>0&&w.structuredDetail===w.detail&&!hasHeartRateEnd(w.structuredSteps);
 const clock=s=>{const n=Math.round(s);return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')};
 const describeStep=s=>{
  if(s.type==='WorkoutRepeatStep')return s.repeatValue+' × repeat';
  const duration=s.durationType==='TIME'?clock(s.durationValue):s.durationType==='DISTANCE'?(s.durationValue/1000)+' km':'Lap to continue';
  const target=s.targetType==='PACE'?' · '+clock(1000/s.targetValueHigh)+'–'+clock(1000/s.targetValueLow)+'/km':s.targetType==='HEART_RATE'?' · '+s.targetValueLow+'–'+s.targetValueHigh+' bpm':'';
  return String(s.intensity||'Step').toLowerCase().replace(/^./,c=>c.toUpperCase())+' · '+duration+target;
 };

 // Pure helpers also exercised in the contract suite.
 const planSessions=(workouts,block,from,to)=>workouts.filter(w=>w.block===block&&eligible(w,from,to)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const resultKind=d=>d.calendarMatch===true?'confirmed':d.publicationState==='not_published'?'new':'pending';
 const compareTargets=(steps,actual)=>{
  if(!Array.isArray(actual)||!Array.isArray(steps))return 'unverified';
  const flat=steps.flatMap(function walk(s){return Array.isArray(s.steps)?s.steps.flatMap(walk):[s]});
  if(!flat.some(s=>['PACE','HEART_RATE'].includes(s.targetType)))return 'open';
  if(flat.length!==actual.length)return 'mismatch';
  const equal=(a,b)=>a==null?b==null:Number.isFinite(Number(b))&&b!=null&&Math.abs(Number(a)-Number(b))<.01;
  return flat.every((s,i)=>s.targetType===actual[i]?.targetType&&equal(s.targetValueLow,actual[i]?.targetValueLow)&&equal(s.targetValueHigh,actual[i]?.targetValueHigh))?'verified':'mismatch';
 };
 if(typeof module!=='undefined'&&module.exports)module.exports={eligible,describeStep,planSessions,resultKind,compareTargets};
 if(typeof document==='undefined')return;
 const qid=id=>/^[a-zA-Z0-9_.:-]{1,128}$/.test(String(id));
 root.mileDeviceSyncButton=w=>w?.sport==='Running'&&w.status==='planned'&&Array.isArray(w.structuredSteps)&&hasHeartRateEnd(w.structuredSteps)
  ?'<span class="muted small m882-device-note">Use timed recovery for Garmin Connect sync.</span>':eligible(w,today(),add(today(),14))?'<button type="button" class="btn alt sm" data-mile-device-sync="'+w.id+'">Sync to Device</button>':'';
 root.mileDevicePlanButton=block=>block?.sport==='Running'&&qid(block.id)?'<button type="button" class="btn alt sm" data-mile-device-plan="'+block.id+'">Sync to Device</button>':'';
 const style=document.createElement('style');
 style.textContent=
 '.mile-device-sync-dialog{background:var(--panel,#171717);color:var(--orange,#f5f5f5);border:1px solid var(--line,#444);border-radius:20px;padding:22px;width:min(92vw,460px);max-height:84dvh;overflow:auto;box-sizing:border-box;font:inherit;box-shadow:0 20px 60px #0005}.mile-device-sync-dialog::backdrop{background:#000a;backdrop-filter:blur(3px)}.mile-device-sync-dialog h2{font-size:23px;line-height:1.15;letter-spacing:-.6px;margin:9px 0}.mile-device-sync-dialog p{font-size:13px;line-height:1.5;margin:6px 0;color:var(--muted,#bbb);white-space:pre-wrap;overflow-wrap:anywhere}.mile-device-sync-dialog .mile-sync-kicker{font-size:10px;letter-spacing:1.9px;font-weight:800;color:var(--muted,#aaa)}.mile-sync-hero{text-align:center;margin:5px 0 19px}.mile-sync-mark{display:grid;place-items:center;margin:0 auto 14px;width:58px;height:58px;border-radius:50%;border:1px solid var(--line,#555);font-size:30px;font-weight:800}.mile-sync-mark.ok{background:#16372b;color:#92e8b3;border-color:#315b48;animation:mileSyncPop .35s ease-out both}.mile-sync-mark.spin{border:3px solid var(--line,#444);border-top-color:var(--orange,#fff);animation:mileSyncSpin .9s linear infinite}.mile-sync-mark svg{width:29px;height:29px}.mile-sync-actions{display:grid;gap:8px;margin-top:18px}.mile-sync-actions .btn{min-height:44px;margin:0!important;width:100%;font-size:13px!important}.mile-sync-actions [hidden],.mile-device-sync-dialog [hidden]{display:none!important}.mile-sync-provider,.mile-sync-entry{border:1px solid var(--line,#444);border-radius:11px;padding:12px;margin:8px 0;display:flex;align-items:center;gap:12px}.mile-sync-provider{width:100%;text-align:left;background:transparent;color:inherit;box-sizing:border-box;cursor:pointer}.mile-sync-provider[disabled]{opacity:.45;cursor:default}.mile-sync-provider strong,.mile-sync-entry strong{font-size:14px}.mile-sync-provider small,.mile-sync-entry small{display:block;color:var(--muted,#bbb);font-size:11px;margin-top:3px}.mile-sync-provider svg{width:24px;height:24px;flex:none}.mile-sync-provider .mile-sync-provider-copy{flex:1}.mile-sync-entry{display:block;padding:10px 12px}.mile-sync-entry summary{font-size:13px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:9px}.mile-sync-entry summary:after{content:"+";color:var(--muted,#aaa)}.mile-sync-entry[open] summary:after{content:"−"}.mile-sync-entry ul{font-size:12px;line-height:1.55;padding-left:16px}.mile-sync-progress{height:4px;background:var(--line,#444);border-radius:5px;overflow:hidden;margin:12px 0}.mile-sync-progress>i{display:block;height:100%;background:var(--orange,#fff);transition:width .3s ease}.mile-sync-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;text-align:center;border-block:1px solid var(--line,#444);padding:14px 0;margin:14px 0}.mile-sync-stats strong{font-size:22px;display:block}.mile-sync-stats small{font-size:11px;color:var(--muted,#aaa)}.mile-sync-scope{display:flex;gap:9px;align-items:center;font-size:13px;margin:13px 0}.mile-sync-scope input{width:auto!important;min-height:0!important;accent-color:var(--orange,#fff)}@keyframes mileSyncSpin{to{transform:rotate(360deg)}}@keyframes mileSyncPop{from{transform:scale(.75);opacity:0}to{transform:scale(1);opacity:1}}@media(prefers-reduced-motion:reduce){.mile-sync-mark.ok,.mile-sync-mark.spin{animation:none}.mile-sync-progress>i{transition:none}}';
 style.textContent+='.mile-device-sync-dialog:focus{outline:none}.mile-device-sync-dialog:focus-visible{outline:none}.mile-device-sync-dialog button:focus-visible,.mile-device-sync-dialog summary:focus-visible{outline:2px solid var(--orange,#fff);outline-offset:2px}.mile-sync-list{border-top:1px solid var(--line,#444);padding:10px 0}.mile-sync-list>summary{font-size:13px;font-weight:700;cursor:pointer;padding:6px 0}.mile-sync-list p{padding:5px 0;border-bottom:1px solid var(--line,#444)}';document.head.append(style);
 const current=()=>typeof userId!=='undefined'&&typeof token!=='undefined'&&userId&&token?{id:userId,token}:null;
 const watch='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="5" width="12" height="14" rx="3"/><path d="M9 5V2h6v3M9 19v3h6v-3M12 9v3l2 1"/></svg>';
 const tick='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
 function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
 function appendSteps(parent,steps){const ul=el('ul');for(const step of steps||[]){const li=el('li','',describeStep(step));if(step.type==='WorkoutRepeatStep')appendSteps(li,step.steps);ul.append(li)}parent.append(ul)}
 function makeDialog(){
  const old=document.querySelector('.mile-device-sync-dialog');if(old?.dataset.busy==='true')return null;if(old){old.close();old.remove()}
  const d=el('dialog','mile-device-sync-dialog');d.setAttribute('aria-label','Device Sync');d.tabIndex=-1;document.body.append(d);
  if(typeof d.showModal!=='function'){d.remove();notice('Open MILE in an up-to-date browser for Device Sync.');return null}
  d.showModal();d.addEventListener('cancel',e=>{if(d.dataset.busy==='true')e.preventDefault()});d.addEventListener('close',()=>d.remove(),{once:true});return d;
 }
 function hero(d,heading,description,kind='watch',kicker='DEVICE SYNC'){
  d.replaceChildren();const h=el('div','mile-sync-hero');h.append(el('div','mile-sync-kicker','MILE. / '+kicker));
  const mark=el('div','mile-sync-mark '+(kind==='success'?'ok':kind==='loading'?'spin':''));
  if(kind==='success')mark.innerHTML=tick;else if(kind==='watch')mark.innerHTML=watch;else if(kind==='warning')mark.textContent='!';
  mark.setAttribute('aria-hidden','true');h.append(mark,el('h2','',heading),el('p','',description));h.setAttribute('aria-live','polite');d.append(h);
 }
 function actions(d,items){const a=el('div','mile-sync-actions');for(const item of items){const b=el('button','btn '+(item.primary?'':'alt'),item.label);b.type='button';b.disabled=!!item.disabled;b.addEventListener('click',item.run);a.append(b)}d.append(a)}
 function stat(d,values){const g=el('div','mile-sync-stats');for(const [v,t] of values){const n=el('div');n.append(el('strong','',String(v)),el('small','',t));g.append(n)}d.append(g)}
 function progress(d,done,total){const p=el('div','mile-sync-progress'),bar=el('i');bar.style.width=(total?100*done/total:0)+'%';p.append(bar);d.append(p);const label=el('p','',done+' of '+total+' sessions checked');label.setAttribute('role','status');d.append(label);return(n,txt)=>{bar.style.width=(total?100*n/total:0)+'%';label.textContent=txt}}
 function provider(d,name,desc,enabled,run){const b=el('button','mile-sync-provider');b.type='button';b.disabled=!enabled;const ico=el('span');ico.innerHTML=watch;const copy=el('span','mile-sync-provider-copy');copy.append(el('strong','',name),el('small','',desc));b.append(ico,copy,el('span','',enabled?'›':''));if(enabled)b.addEventListener('click',run);d.append(b)}
 async function request(owner,action,sessionId,extra={}){
  if(current()?.id!==owner.id)throw Error('Your MILE session has changed. Sign in again.');
  const active=current();
  const response=await fetch(state.settings.supabaseUrl+'/functions/v1/mile-garmin-device-sync',{method:'POST',headers:sbHeaders(),cache:'no-store',signal:AbortSignal.timeout(action==='publish_session'?120000:60000),body:JSON.stringify({action,sessionId,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,...extra})});
  if(current()?.id!==owner.id||current()?.token!==active.token)throw Error('Your session changed. Check the sync status.');
  const d=await response.json();if(d.rateLimited===true||response.status===429){const e=Error('Garmin requested a short pause.');e.rateLimited=true;e.retryAfterSeconds=Number.isFinite(Number(d.retryAfterSeconds))?Math.max(1,Number(d.retryAfterSeconds)):60;e.retrySafe=d.retrySafe===true;e.result=d;throw e}if(!response.ok)throw Error(typeof d.error==='string'?d.error:'Garmin is temporarily unavailable.');return d;
 }
 const snapshot=w=>JSON.stringify([w.id,w.block,w.date,w.name,w.detail,w.structuredSteps,w.structuredDetail,w.status,w.matchId,w.revision]);
 const inWindow=w=>eligible(w,today(),add(today(),14));
 function open({id,block}){
  const owner=current();if(!owner)return notice('Sign in to sync your device.');
  const d=makeDialog();if(!d)return;
  const alive=()=>d.isConnected&&d.open&&current()?.id===owner.id;
  const busy=v=>{d.dataset.busy=String(v)};
  const get=wId=>state.workouts.find(w=>w.id===wId);
  const candidates=()=>block?planSessions(state.workouts,block,today(),add(today(),14)):[get(id)].filter(inWindow);
  const title=block?state.blocks.find(b=>b.id===block)?.name||'Training plan':get(id)?.name||'Workout';
  let scope=block?'upcoming':'single',attempted=new Set(),checkedIds=[],recovering=false,retryAt=0;
  function limit(e){retryAt=Math.max(retryAt,Date.now()+Math.ceil(e.retryAfterSeconds||60)*1000);recovering=true}
  function cooled(){if(Date.now()>=retryAt)return true;notice('Garmin is taking a short break. Try again in '+Math.ceil((retryAt-Date.now())/1000)+' seconds.');return false}
  function pause(){busy(false);hero(d,'Sync paused','Garmin has temporarily limited requests. Your previously synced workouts are safe.','warning');d.append(el('p','','Try again after '+Math.max(1,Math.ceil((retryAt-Date.now())/1000))+' seconds. MILE will recheck existing sessions before sending more.'));actions(d,[{label:'Review remaining workouts',primary:true,run:()=>{if(cooled())prepare()}},{label:'Done',run:()=>d.close()}])}
  function choose(){
   hero(d,'Sync to Device','Choose your training device.');
   const list=candidates();
   if(!list.length){d.append(el('p','','No eligible running workouts in the next 14 days. Create a structured running plan to get started.'));actions(d,[{label:'Done',primary:true,run:()=>d.close()}]);return}
   d.append(el('p','',title+' · '+list.length+' eligible '+(list.length===1?'session':'sessions')));
   if(block){
    for(const [value,label] of [['single','Next eligible session'],['upcoming','Upcoming sessions (next 14 days)']]){
     const row=el('label','mile-sync-scope'),input=el('input');input.type='radio';input.name='mile-device-scope';input.value=value;input.checked=scope===value;input.addEventListener('change',()=>{if(input.checked)scope=value});row.append(input,document.createTextNode(label));d.append(row)
    }
   }
   provider(d,'Garmin Connect','Check connection and preview',true,prepare);
   provider(d,'Apple Watch','Coming soon',false);provider(d,'COROS','Coming soon',false);
   actions(d,[{label:'Cancel',run:()=>d.close()}]);
  }
  async function prepare(){
   if(!alive()||d.dataset.busy==='true'||!cooled())return;
   let list=candidates();if(scope==='single')list=list.slice(0,1);
   if(!list.length)return choose();
   checkedIds=list.map(w=>w.id);busy(true);hero(d,'Preparing your workouts','Checking Garmin and your saved training plan.','loading');
   const update=progress(d,0,list.length),ready=[],previous=[],unavailable=[];
   try{
    if(typeof avCloudQueue!=='undefined')await avCloudQueue;
    if(typeof avCloudError!=='undefined'&&avCloudError)throw Error('Your plan has not finished saving to the cloud. Please try again after saving.');
    for(let i=0;i<list.length;i++){
     if(!alive())return;const w=get(list[i].id);update(i,'Checking '+(i+1)+' of '+list.length+' · '+list[i].name);
     if(!inWindow(w)||(block&&w.block!==block)){unavailable.push({name:list[i].name,reason:'Session changed'});continue}
     try{
      const status=await request(owner,'status_session',w.id);
      if(resultKind(status)!=='new'||attempted.has(w.id)){previous.push({id:w.id,name:w.name,date:w.date,kind:resultKind(status)==='confirmed'?'confirmed':'pending'});continue}
      const before=snapshot(w),p=await request(owner,'preview_session',w.id);
      if(!alive())return;const local=get(w.id);
      if(!inWindow(local)||snapshot(local)!==before||p.date!==local.date||p.payload?.workoutName!==String(local.name).trim()||p.payload?.description!==String(local.detail).slice(0,1024).trim()||p.publishingEnabled!==true||typeof p.fingerprint!=='string')throw Error('Session changed. Save your plan before syncing.');
      const steps=p.payload?.segments?.flatMap(x=>x.steps||[]);if(!steps?.length)throw Error('No structured steps available.');
      ready.push({id:w.id,name:w.name,date:w.date,km:w.km,steps,fingerprint:p.fingerprint,snapshot:before});
     }catch(e){if(e?.rateLimited){limit(e);pause();return}unavailable.push({name:w.name,reason:e instanceof Error?e.message:'Unable to prepare'});if(i===0&&!ready.length&&!previous.length&&/reconnect|permission|membership|Garmin not connected|account changed/i.test(unavailable[0].reason))break}
    }
    if(!alive())return;
    busy(false);review(ready,previous,unavailable,list.length);
   }catch(e){if(alive()){busy(false);hero(d,'Unable to prepare',e instanceof Error?e.message:'Try again later.','warning');actions(d,[{label:'Try again',primary:true,run:choose},{label:'Close',run:()=>d.close()}])}}
   finally{if(alive())busy(false)}
  }
  function review(ready,previous,unavailable,total){
   const pending=previous.some(w=>w.kind==='pending');hero(d,ready.length&&!pending?'Ready to sync':'Device sync status',pending?'Check previously submitted workouts before sending more.':ready.length?'Review the workouts to send to Garmin Connect.':'No new workouts are ready to send.',ready.length&&!pending?'watch':'warning');
   if(previous.length||unavailable.length||total!==ready.length)stat(d,[[ready.length,'Ready'],[previous.length,'Already sent / pending'],[total-ready.length-previous.length,'Unavailable']]);
   for(const w of ready){const entry=el('details','mile-sync-entry');const summary=el('summary','',w.name+' · '+nice(w.date));entry.append(summary);appendSteps(entry,w.steps);d.append(entry)}
   if(unavailable.length){const details=el('details','mile-sync-entry');details.append(el('summary','',unavailable.length+' unavailable'));for(const u of unavailable)details.append(el('p','',u.name+': '+u.reason));d.append(details)}
   if(previous.length)d.append(el('p','','Previously submitted sessions are skipped to prevent duplicates.'));
   d.append(el('p','','Changes in MILE won’t update Garmin automatically during this beta.'));
   actions(d,[...(ready.length&&!pending?[{label:recovering?'Sync remaining workouts':ready.length===1?'Sync workout':'Sync '+ready.length+' workouts',primary:true,run:()=>publish(ready,previous,unavailable,total)}]:[]),{label:'Check status',run:()=>checkStatus(checkedIds)},{label:'Close',run:()=>d.close()}]);
  }
  async function publish(ready,previous,unavailable,total){
   if(!alive()||d.dataset.busy==='true'||!cooled())return;busy(true);hero(d,ready.length===1?'Syncing your workout':'Syncing your training plan','Sending your sessions to Garmin Connect.','loading');
   const update=progress(d,0,ready.length),results=[];let stopped=false;
   for(let i=0;i<ready.length;i++){
    if(!alive())return;const w=ready[i];update(i,(i+1)+' of '+ready.length+' · '+w.name);
    if(stopped||attempted.has(w.id)){results.push({...w,kind:'not_sent'});continue}
    if(!inWindow(get(w.id))||snapshot(get(w.id))!==w.snapshot){results.push({...w,kind:'not_sent'});continue}
    attempted.add(w.id);
    try{
     const result=await request(owner,'publish_session',w.id,{confirmed:true,approvedFingerprint:w.fingerprint});
     let confirmed=resultKind(result)==='confirmed',readback=result.targetReadback;if(!confirmed){try{const recheck=await request(owner,'status_session',w.id);confirmed=resultKind(recheck)==='confirmed';readback=recheck.targetReadback??readback}catch(e){if(e?.rateLimited)limit(e)}}results.push({...w,kind:confirmed?'confirmed':'pending',targets:compareTargets(w.steps,readback)});if(!confirmed||Date.now()<retryAt)stopped=true;
    }catch(e){if(e?.rateLimited){limit(e);if(e.retrySafe)attempted.delete(w.id);const confirmed=e.result?.calendarMatch===true;results.push({...w,kind:confirmed?'confirmed':e.retrySafe?'not_sent':'pending',targets:compareTargets(w.steps,e.result?.targetReadback)});stopped=true}else{let confirmed=false,readback=null;try{const recheck=await request(owner,'status_session',w.id);confirmed=resultKind(recheck)==='confirmed';readback=recheck.targetReadback}catch(err){if(err?.rateLimited)limit(err)}results.push({...w,kind:confirmed?'confirmed':'pending',targets:compareTargets(w.steps,readback)});if(!confirmed||Date.now()<retryAt)stopped=true}}
    if(alive())update(i+1,(i+1)+' of '+ready.length+' processed');
   }
   if(!alive())return;busy(false);finish(results,previous,unavailable,total);
  }
  function finish(results,previous=[],unavailable=[],total=results.length+previous.length+unavailable.length){
   const confirmed=results.filter(w=>w.kind==='confirmed').length+previous.filter(w=>w.kind==='confirmed').length;
   if(results.some(w=>w.kind==='confirmed'))root.mileRunningBeta?.mark('garmin-published');
   const pending=results.filter(w=>w.kind==='pending').length+previous.filter(w=>w.kind!=='confirmed').length;
   const notSent=Math.max(0,total-confirmed-pending);
   const all=confirmed>0&&pending===0&&notSent===0;
   hero(d,all?(total===1?'Workout synced.':'Training synced.'):confirmed?'Sync partially complete.':pending?'Sync submitted.':'No new workouts synced.',all?'Your training is ready in Garmin Connect.':pending?'Some sessions are awaiting confirmation. Check Garmin before syncing again.':'Review your sessions and check the connection.',all?'success':'warning');
   if(total!==1||!all)stat(d,[[confirmed,'Confirmed'],[pending,'Pending'],[notSent,'Not sent']]);if(Date.now()<retryAt)d.append(el('p','','Garmin requested a pause. Check again after '+Math.ceil((retryAt-Date.now())/1000)+' seconds. Previously confirmed workouts will not be resent.'));
   for(const [kind,label] of [['confirmed','Synced'],['pending','Awaiting confirmation'],['not_sent','Not sent']]){const rows=[...results,...previous].filter(w=>w.kind===kind);if(!rows.length)continue;const group=el('details','mile-sync-list');group.append(el('summary','',label+' · '+rows.length));for(const w of rows){const label=w.targets==='verified'?' · Targets verified':w.targets==='mismatch'?' · Target mismatch':w.targets==='unverified'?' · Targets not verified':'';group.append(el('p','',w.name+(w.date?' · '+nice(w.date):'')+label));}d.append(group)}
   if(results.some(w=>w.targets==='mismatch'))d.append(el('p','','Garmin returned different workout targets. Review the affected session before training.'));else if(results.some(w=>w.targets==='unverified'))d.append(el('p','','Garmin target readback is not yet confirmed. Check your watch before training.'));d.append(el('p','','Sync your compatible watch to receive your workouts.'));
   if(all&&typeof navigator.vibrate==='function')try{navigator.vibrate(25)}catch{}
   actions(d,[...(!all?[{label:'Check Garmin',primary:pending>0,run:()=>checkStatus(checkedIds)}]:[]),...(notSent>0&&pending===0&&block?[{label:'Review remaining workouts',primary:true,run:()=>{recovering=true;prepare()}}]:[]),{label:'Done',primary:all,run:()=>d.close()}]);
  }
  async function checkStatus(ids){
   if(!alive()||d.dataset.busy==='true'||!cooled())return;busy(true);hero(d,'Checking sync','Looking for your sessions in Garmin Connect.','loading');const update=progress(d,0,ids.length),results=[];
   for(let i=0;i<ids.length;i++){if(!alive())return;const w=get(ids[i]),name=w?.name||'Workout',date=w?.date;try{const r=await request(owner,'status_session',ids[i]);const k=resultKind(r);results.push({id:ids[i],name,date,kind:k==='new'?(attempted.has(ids[i])?'pending':'not_sent'):k})}catch(e){if(e?.rateLimited){limit(e);pause();return}results.push({id:ids[i],name,date,kind:'pending'})}update(i+1,(i+1)+' of '+ids.length+' checked')}
   if(alive()){busy(false);finish(results,[],[],ids.length)}
  }
  choose();
 }
 root.mileReviewCreate=()=>{
  if(v42Step!==3)return;
  v42Capture();const p=v42Form,sp=v42Sport,start=p.Start||today(),weeks=Number(p.Weeks)||8,days=Number(p.Days)||3;
  const existing=state.workouts.filter(w=>v456Visible(w.block)&&w.date>=start&&w.date<=add(start,weeks*7-1));
  const d=makeDialog();if(!d)return;
  hero(d,'Create training plan?',existing.length?'Your new plan will be added alongside '+existing.length+' existing sessions. MILE will flag potential clashes.':'Your new plan will be added to your MILE Calendar.','watch','BUILD');
  stat(d,[[weeks,'Weeks'],[weeks*days,'Sessions'],[days,'Per week']]);
  d.append(el('p','','Existing plans and completed workouts will stay in place.'));
  actions(d,[{label:'Create plan',primary:true,run:()=>{d.close();root.mileBuildApproved=true;try{v42Generate()}finally{root.mileBuildApproved=false}}},{label:'Back',run:()=>d.close()}]);
 };
 root.milePlanCreated=async(blockId)=>{
  const owner=current();if(!owner)return;const block=state.blocks.find(b=>b.id===blockId);if(!block)return;
  const d=makeDialog();if(!d)return;
  hero(d,'Saving your plan','Adding your workouts to your MILE Calendar.','loading','BUILD');d.dataset.busy='true';
  if(typeof avCloudQueue!=='undefined')await avCloudQueue;
  if(!d.isConnected||current()?.id!==owner.id){d.close();return}
  d.dataset.busy='false';
  const saved=typeof avCloudError==='undefined'||!avCloudError;
  const sessions=state.workouts.filter(w=>w.block===blockId);
  hero(d,saved?'You’re ready to train.':'Plan saved on this device.',saved?'Your training plan is ready in MILE.':'Cloud save is not confirmed. Reconnect and save before syncing. ',saved?'success':'warning','BUILD');
  stat(d,[[block.v42?.weeks||'—','Weeks'],[sessions.length,'Sessions'],[block.v42?.days||'—','Per week']]);
  const eligibleNow=planSessions(sessions,blockId,today(),add(today(),14)).length;
  if(saved&&eligibleNow)d.append(el('p','','Send your upcoming workouts to your connected training device.'));
  actions(d,[...(saved&&eligibleNow?[{label:'Sync to Device',primary:true,run:()=>{d.close();open({block:blockId})}}]:[]),{label:'View Calendar',primary:!saved||!eligibleNow,run:()=>{d.close();navigate('calendar')}},{label:'Done',run:()=>d.close()}]);
 };
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-mile-device-sync],[data-mile-device-plan]');if(!b)return;e.preventDefault();e.stopPropagation();open(b.dataset.mileDevicePlan?{block:b.dataset.mileDevicePlan}:{id:b.dataset.mileDeviceSync})},true);
})(globalThis);
