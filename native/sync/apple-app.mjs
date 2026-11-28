import {createNativeAppleImport} from './apple-native.mjs';
import {createAppleTransport} from './apple-transport.mjs';
import {appleImportRange,reconcileAppleActivities} from './workouts.mjs';
import {watchRun} from './watch-workouts.mjs';

const staging='https://fnyfeelynaozxtftrrga.supabase.co';
export function attachAppleHealth(win){
 const cap=win.Capacitor,plugin=cap?.Plugins?.MILEHealthKit, app=win.mileAppleAppContext;
 if(win.MILE_NATIVE_BUILD?.appleHealth!==true||!cap?.isNativePlatform?.()||cap.getPlatform()!=='ios'||!plugin||!app)return;
 const {document:doc}=win;
 let owner=null, rows=[], consent=null, importer=null, busy=false, recovery=null, status='', permission=false, background=false, seenCounter=null;
 let generation=0;
 const context=()=>{
  const session=app.session();
  return session?.url===staging&&session.accountId&&session.accessToken?session:null;
 };
 const current=()=>context()?.accountId;
 const transport=()=>{
  const session=context();
  if(!session)throw Error('Sign into the MILE staging app.');
  return createAppleTransport({baseUrl:staging,anonKey:session.anonKey,session:context});
 };
 const reset=()=>{
  generation++;
  importer?.cancel();importer=null;owner=null;rows=[];consent=null;busy=false;recovery=null;status='';permission=false;background=false;seenCounter=null;
  void plugin.observeWorkouts?.({enabled:false,resetPermission:true}).catch(()=>{});
 };
 const adopt=()=>{const id=current();if(owner&&owner!==id)reset();owner=id??null;return owner};
 const projected=()=>owner&&owner===current()?reconcileAppleActivities(rows,app.garmin()):{visible:[],overlaps:[]};
 const put=(tag,value)=>{const el=doc.createElement(tag);el.textContent=value;return el};
 function show(panel){
  if(!panel.isConnected)return;
  const token=generation;
  panel.replaceChildren(put('h3','Apple Health'));
  panel.append(put('p','Import recorded workouts into your private MILE account. You choose what Apple Health shares.'));
  const message=put('p',status||(consent?.enabled?'Workout import is enabled.':'Choose whether to import workouts.'));
  message.className='muted small';message.setAttribute('role','status');panel.append(message);
  if(consent?.last_import_at)panel.append(put('p','Last successful sync · '+new Date(consent.last_import_at).toLocaleString()));
  const button=(label,fn)=>{
   const el=put('button',label);el.type='button';el.className='btn alt sm';el.disabled=busy;
   el.addEventListener('click',()=>{if(token===generation)void fn()});return el;
  };
  const actions=doc.createElement('div');actions.className='row';
  actions.append(button(consent?.enabled?'Sync workouts':'Connect Apple Health',()=>sync(false)));
  if(consent?.enabled){
   actions.append(button('Choose optional health data',()=>sync(true)),
    button(background?'Pause automatic refresh':'Refresh when returning to MILE',toggleBackground),
    button('Disconnect and delete imports',disconnect));
   panel.append(put('p','Optional heart rate may sync to MILE. Routes, running dynamics, sleep and recovery readings stay on this device.'));
  }
  panel.append(actions);
  if(recovery){
   const section=doc.createElement('details');section.append(put('summary','Apple Health recovery observations'));
   const labels={restingHR:'Resting heart rate',hrvSDNN:'HRV (SDNN)',vo2Max:'VO₂ max'};
   const units={restingHR:'bpm',hrvSDNN:'ms',vo2Max:'mL/kg/min'};
   for(const [key,label] of Object.entries(labels)){
    const reading=recovery[key];
    if(Number.isFinite(reading?.value)&&reading.date) section.append(put('p',label+' · '+reading.value.toFixed(1)+' '+units[key]+' · '+new Date(reading.date).toLocaleDateString()));
   }
   if(Number.isFinite(recovery.sleepMinutes24h))section.append(put('p','Recorded sleep in the last 24 hours · '+Math.round(recovery.sleepMinutes24h)+' min'));
   section.append(put('p','Apple observations use their own measurements and are kept separate from Garmin recovery scores.'));
   panel.append(section);
  }
  for(const {activity,garminName} of projected().overlaps.slice(0,20)){
   const item=doc.createElement('section');
   item.append(put('p','Possible duplicate · '+new Date(activity.date).toLocaleString()+' · '+garminName),
    button('Use Garmin record',()=>review(activity.id,false)),button('These were separate workouts',()=>review(activity.id,true)));
   panel.append(item);
  }
  if(projected().overlaps.length>20)panel.append(put('p','Review the first 20 possible duplicates to see the remaining candidates.'));
 }
 const render=()=>{for(const panel of doc.querySelectorAll('[data-mile-apple-panel]'))show(panel)};
 function mount(){
  for(const panel of doc.querySelectorAll('[data-mile-apple-panel]:not([data-apple-mounted])')){
   if(!context())continue;
   panel.dataset.appleMounted='true';show(panel);
  }
 }
 const observer=new MutationObserver(mount);observer.observe(doc.body,{childList:true,subtree:true});
 async function refresh(){
  const id=adopt();
  if(!id||busy)return;
  const nonce=generation;
  try{
   const client=transport(), next=await client.status(id);
   const history=next?.enabled?await client.history(id):[];
   if(nonce!==generation||current()!==id)return;
   consent=next;rows=history;
   render();app.changed();
  }catch{if(nonce===generation&&current()===id){status='Apple Health cloud status is unavailable.';render();}}
 }
 async function sync(details,automatic=false){
  const id=adopt();
  if(!id||busy)return;
  if(!automatic&&!consent?.enabled&&!win.confirm('Allow MILE to import Apple Health workouts to your private MILE account?'))return;
  if(details&&!win.confirm('Read optional workout and recovery data? Only average workout heart rate is uploaded.'))return;
  const nonce=generation;
  busy=true;status='Reading Apple Health and syncing…';render();
  try{
   const session=context(),client=transport();
   const next=automatic?await client.status(id):await client.setConsent(id,true);
   if(!next?.enabled||!next.epoch||current()!==id||nonce!==generation)throw Error('Apple Health consent is unavailable.');
   consent=next;
   const range=appleImportRange();
   const install=await plugin.installation({account:id,epoch:next.epoch,from:range.from});
   const change=await plugin.changeCounter();
   if(current()!==id||nonce!==generation)throw Error('Account changed.');
   importer=createNativeAppleImport({cap,accountId:id,installationId:install.id+':'+next.epoch,activeAccount:current,
    session:context,explicitConsent:()=>generation===nonce&&current()===id&&consent?.enabled===true,
    backend:{mode:'isolated-staging',enabled:true,url:staging,anonKey:session.anonKey,epoch:next.epoch,atomic:true}});
   const result=await importer.run({...range,from:install.from??range.from,details,askPermission:!automatic});
   if(nonce!==generation||current()!==id)return;
   permission=true;seenCounter=change.counter;
   if(details)recovery=await plugin.readRecovery().catch(()=>null);
   if(nonce!==generation||current()!==id){recovery=null;return;}
   status=result.imported||result.removed?'Health workout changes synced.':
    'No workout changes returned. Apple Health may have no new data or permission may be limited.';
  }catch(error){if(nonce===generation&&current()===id)status=error.message||'Apple Health sync could not finish.'}
  finally{
   if(nonce===generation&&current()===id){busy=false;importer=null;render();await refresh();}
  }
 }
 async function toggleBackground(){
  if(!permission){status='Sync once to request Health access on this device.';render();return;}
  const nonce=generation;
  try{
   const result=await plugin.observeWorkouts({enabled:!background});
   if(generation!==nonce)return;
   background=result.enabled===true;
   status=background?'Health changes will be checked when you return to MILE.':'Automatic refresh is paused.';
  }catch{if(nonce===generation)status='Apple Health change alerts are unavailable.'}
  render();
 }
 async function disconnect(){
  const id=current();if(!id||busy||!win.confirm('Disconnect Apple Health and delete imported Apple workouts from MILE?'))return;
  const nonce=generation;
  busy=true;render();
  try{
   await transport().setConsent(id,false);
   if(nonce!==generation||current()!==id)return;
   reset();adopt();status='Apple imports deleted from MILE. Manage device permissions in Apple Health.';
   app.changed();render();
  }catch{if(nonce===generation&&current()===id){status='Could not disconnect. Try again.';busy=false;render();}}
 }
 async function review(activityId,separate){
  const id=current(),nonce=generation;if(!id||busy)return;
  busy=true;render();
  try{await transport().reviewOverlap(id,activityId.slice(6),separate);}
  catch{if(nonce===generation&&current()===id)status='Could not save the duplicate review.'}
  finally{if(nonce===generation&&current()===id){busy=false;await refresh();}}
 }
 async function checkChanges(){
  if(!background||!permission||!consent?.enabled||busy||doc.visibilityState!=='visible')return;
  const nonce=generation;
  try{const {counter}=await plugin.changeCounter();if(nonce===generation&&counter!==seenCounter)await sync(false,true);}catch{}
 }
 plugin.addListener?.('workoutChanged',()=>void checkChanges());
 win.addEventListener('mile:native-state',event=>{if(event.detail.isActive)void checkChanges();});
 async function schedule(id){
  const session=context();
  const workout=watchRun(app.workout(id),win.mileStructuredWorkout);
  if(!session||!workout||!win.confirm('Schedule this exact running workout on Apple Watch for '+workout.date+'?'))return;
  try{
   const result=await plugin.scheduleRun({account:session.accountId,workout});
   if(current()===session.accountId)app.message(result.status==='alreadyScheduled'?'A schedule already exists for this session.':
    'Scheduled on iPhone. Check the Apple Watch Workout app after syncing.');
  }catch(error){if(current()===session.accountId)app.message(error.message||'Apple Watch scheduling unavailable.');}
 }
 win.mileAppleHealth=Object.freeze({refresh,reset,activities:()=>projected().visible,mount,schedule,watchRun,
  renderDetail,
  async detail(id){
   const before=generation,account=current();
   if(!account||!permission||!projected().visible.some(activity=>activity.id===id))return {};
   const detail=await plugin.readWorkoutDetail({id:id.slice(6)}).catch(()=>({}));
   return before===generation&&account===current()?detail:{};
  }});
 app.changed();mount();void refresh();
}
function renderDetail(element,detail,showRoute){
 const doc=element.ownerDocument;
 const add=(tag,text)=>{
  const node=doc.createElement(tag);node.textContent=text;element.append(node);
 };
 element.replaceChildren();
 if(showRoute){
  add('h3','Private Apple Health route');
  const points=(detail.route??[]).filter(row=>Array.isArray(row)&&row.length===2&&row.every(Number.isFinite)&&Math.abs(row[0])<=90&&Math.abs(row[1])<=180);
  if(points.length<2){add('p','No route was shared. Choose optional health data in Connected devices to request access.');return;}
  const lat=points.map(row=>row[0]),lon=points.map(row=>row[1]);
  const minLat=Math.min(...lat),south=Math.max(...lat)-minLat||1;
  const minLon=Math.min(...lon),west=Math.max(...lon)-minLon||1;
  const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg'),line=doc.createElementNS(ns,'polyline');
  svg.setAttribute('viewBox','0 0 320 180');svg.setAttribute('role','img');svg.setAttribute('aria-label','Recorded route outline');
  line.setAttribute('points',points.map(([y,x])=>[10+(x-minLon)/west*300,170-(y-minLat)/south*160].join(',')).join(' '));
  line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','3');
  svg.append(line);element.append(svg);
  add('p','Route outline stays on this device.');return;
 }
 add('h3','Apple Health recorded details');
 const metrics=[['strideMeters','Stride length','m'],['groundContactMilliseconds','Ground contact','ms'],
  ['oscillationMeters','Vertical oscillation','m'],['averagePowerWatts','Average running power','W']];
 let count=0;
 for(const [key,label,unit] of metrics)if(Number.isFinite(detail[key])&&detail[key]>0){add('p',label+' · '+detail[key].toFixed(2)+' '+unit);count++;}
 if(Array.isArray(detail.lapSeconds)&&detail.lapSeconds.length){
  add('p','Recorded lap times');
  const list=doc.createElement('ol');
  for(const seconds of detail.lapSeconds.filter(value=>Number.isFinite(value)&&value>0)){
   const item=doc.createElement('li');item.textContent=Math.round(seconds)+' s';list.append(item);
  }
  element.append(list);count++;
 }
 if(!count)add('p','No optional workout details were shared.');
}

if(typeof window!=='undefined')attachAppleHealth(window);
