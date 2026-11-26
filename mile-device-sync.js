// Manual Device Sync beta. Explicit preview/consent; never publish on page load.
(function(root){
 'use strict';
 const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 const eligible=(w,from,to)=>!!w&&validId(w.id)&&w.sport==='Running'&&w.status==='planned'&&!w.matchId&&typeof w.date==='string'&&w.date>=from&&w.date<=to&&Array.isArray(w.structuredSteps)&&w.structuredSteps.length>0&&w.structuredDetail===w.detail;
 const clock=s=>Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0');
 const describeStep=s=>{
  if(s.type==='WorkoutRepeatStep')return s.repeatValue+' × repeat';
  const duration=s.durationType==='TIME'?clock(s.durationValue):s.durationType==='DISTANCE'?(s.durationValue/1000)+' km':'Lap to continue';
  const target=s.targetType==='PACE'?' · '+clock(1000/s.targetValueHigh)+'–'+clock(1000/s.targetValueLow)+'/km':s.targetType==='HEART_RATE'?' · '+s.targetValueLow+'–'+s.targetValueHigh+' bpm':'';
  return String(s.intensity||'Step').toLowerCase().replace(/^./,c=>c.toUpperCase())+' · '+duration+target;
 };
 if(typeof module!=='undefined'&&module.exports)module.exports={eligible,describeStep};
 if(typeof document==='undefined')return;
 root.mileDeviceSyncButton=function(w){
  if(!eligible(w,today(),add(today(),14)))return '';
  return '<button type="button" class="btn alt sm" data-mile-device-sync="'+w.id+'">Sync to Garmin</button>';
 };
 const style=document.createElement('style');
 style.textContent='.mile-device-sync-dialog{background:var(--panel,#171717);color:var(--text,#f5f5f5);border:1px solid var(--line,#444);border-radius:15px;padding:20px;width:min(92vw,460px);max-height:85dvh;overflow:auto;box-sizing:border-box;font:inherit}.mile-device-sync-dialog::backdrop{background:#0009}.mile-device-sync-dialog h2{font-size:21px;margin:0 0 8px}.mile-device-sync-dialog p{font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.mile-device-sync-dialog ul{padding-left:20px;font-size:13px;line-height:1.6}.mile-device-sync-dialog .mile-sync-buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.mile-device-sync-dialog .btn{min-height:44px}.mile-device-sync-dialog .mile-sync-status{padding:12px;border:1px solid var(--line,#444);border-radius:8px;margin-top:10px}';
 document.head.append(style);
 const current=()=>typeof userId!=='undefined'&&typeof token!=='undefined'&&userId&&token?{id:userId,token}:null;
 async function request(owner,action,sessionId,extra={}){
  if(current()?.id!==owner.id)throw Error('Session changed. Sign in again.');
  const active=current();
  const response=await fetch(state.settings.supabaseUrl+'/functions/v1/mile-garmin-device-sync',{method:'POST',headers:sbHeaders(),cache:'no-store',signal:AbortSignal.timeout(action==='publish_session'?120000:60000),body:JSON.stringify({action,sessionId,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,...extra})});
  if(current()?.id!==owner.id||current()?.token!==active.token)throw Error('Session changed. Check sync status before trying again.');
  const d=await response.json();
  if(!response.ok)throw Error(typeof d.error==='string'?d.error:'Garmin sync unavailable.');
  return d;
 }
 function open(id){
  const owner=current(),w=state.workouts.find(x=>x.id===id);
  if(!owner||!eligible(w,today(),add(today(),14)))return notice('Sign in and choose a new structured running session within 14 days.');
  document.querySelector('.mile-device-sync-dialog')?.remove();
  const dialog=document.createElement('dialog');dialog.className='mile-device-sync-dialog';
  dialog.innerHTML='<h2>Device Sync</h2><p data-sync-title></p><div class="mile-sync-status" role="status" aria-live="polite" data-sync-status>Checking Garmin…</div><div data-sync-preview></div><div class="mile-sync-buttons"><button type="button" class="btn" data-sync-send hidden disabled>Send to Garmin</button><button type="button" class="btn alt" data-sync-check>Check status</button><button type="button" class="btn alt" data-sync-close>Close</button></div>';
  document.body.append(dialog);
  if(typeof dialog.showModal!=='function'){dialog.remove();return notice('Open MILE in an up-to-date browser for Device Sync.')}
  dialog.showModal();
  const q=s=>dialog.querySelector(s),title=q('[data-sync-title]'),status=q('[data-sync-status]'),preview=q('[data-sync-preview]'),send=q('[data-sync-send]'),check=q('[data-sync-check]'),close=q('[data-sync-close]');
  title.textContent=w.name+' · '+nice(w.date)+' · Garmin Connect';
  let approval=null,busy=false,attempted=false;
  const alive=()=>dialog.isConnected&&dialog.open&&current()?.id===owner.id;
  const clear=()=>{approval=null;send.disabled=true;send.hidden=true;preview.replaceChildren()};
  const setBusy=v=>{busy=v;check.disabled=v;close.disabled=v;send.disabled=v||!approval};
  const say=t=>{status.textContent=t};
  function displayState(d){
   clear();
   if(d.calendarMatch===true){say('Garmin calendar entry confirmed. Sync your watch and check its training calendar. Do not resend.');return}
   if(d.publicationState==='not_published'){say(attempted?'No publication record found yet. Do not resend after an uncertain attempt. Contact MILE support.':'Not published.');return}
   if(d.publicationState==='verified'||d.publicationState==='scheduled'||d.publicationState==='delivery_confirmed'){say('Garmin API accepted this workout. Calendar visibility is not yet confirmed. Check Garmin Connect. Do not resend.');return}
   say('Publication status: '+String(d.publicationState||'unknown').replaceAll('_',' ')+'. Do not resend. Check Garmin Connect or contact MILE support.');
  }
  function appendSteps(parent,steps){
   const ul=document.createElement('ul');
   for(const step of steps||[]){const li=document.createElement('li');li.textContent=describeStep(step);if(step.type==='WorkoutRepeatStep')appendSteps(li,step.steps);ul.append(li)}
   parent.append(ul);
  }
  async function load(allowPreview){
   if(busy||!alive())return;clear();setBusy(true);say('Checking your saved session and Garmin connection…');
   try{
    const existing=await request(owner,'status_session',id);if(!alive())return;
    displayState(existing);
    if(existing.publicationState!=='not_published'||!allowPreview||attempted)return;
    if(typeof avCloudQueue!=='undefined')await avCloudQueue;
    if(!alive())return;
    const d=await request(owner,'preview_session',id);if(!alive())return;
    const local=state.workouts.find(x=>x.id===id);
    if(!eligible(local,today(),add(today(),14))||d.date!==local.date||d.payload?.workoutName!==String(local.name).trim()||d.payload?.description!==String(local.detail).slice(0,1024).trim()||d.publishingEnabled!==true||typeof d.fingerprint!=='string')throw Error('Your cloud session differs from this screen. Refresh MILE after saving before syncing.');
    const steps=d.payload?.segments?.flatMap(x=>x.steps||[]);if(!Array.isArray(steps)||!steps.length)throw Error('No structured steps available.');
    approval=d.fingerprint;
    const p=document.createElement('p');p.textContent=d.payload.description;preview.append(p);appendSteps(preview,steps);
    const note=document.createElement('p');note.textContent='This sends one planned session to your Garmin calendar. Editing or moving it in MILE will not update Garmin during this beta.';preview.append(note);
    say('Ready to send · '+d.date);send.hidden=false;
   }catch(e){if(alive())say(e instanceof Error?e.message:'Unable to check Garmin.')}
   finally{if(alive())setBusy(false)}
  }
  send.addEventListener('click',async()=>{
   if(busy||!alive()||!approval||attempted)return;
   const fingerprint=approval;attempted=true;clear();setBusy(true);say('Sending once and checking Garmin. Do not resend.');
   try{const d=await request(owner,'publish_session',id,{confirmed:true,approvedFingerprint:fingerprint});if(alive())displayState(d)}
   catch(e){if(alive())say((e instanceof Error?e.message:'Publication outcome uncertain.')+' Check status; do not resend.')}
   finally{if(alive())setBusy(false)}
  });
  check.addEventListener('click',()=>load(!attempted));
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  load(true);
 }
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-mile-device-sync]');if(!b)return;e.preventDefault();e.stopPropagation();open(b.dataset.mileDeviceSync)},true);
})(globalThis);
