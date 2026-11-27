(function (root) {
 'use strict';

 const titles = ['Your profile','Your sports','Your athlete profile','Connect your training','Your privacy'];
 const stages = ['Profile','Sports','Athlete','Connect','Privacy'];
 const sports = ['Running','HYROX','Cycling','Swimming','Strength','Triathlon'];
 const ages = [['','Prefer not to say'],['under18','Under 18'],['18-24','18–24'],['25-34','25–34'],['35-44','35–44'],['45-54','45–54'],['55-64','55–64'],['65plus','65 or older']];
 const levels = [['','Choose later'],['beginner','Just starting'],['regular','Regular'],['experienced','Experienced'],['competitive','Competitive']];
 const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const options = (values, selected) => values.map(([value,label]) =>
  '<option value="'+escape(value)+'"'+(value===selected?' selected':'')+'>'+escape(label)+'</option>').join('');
 const number = (value, factor, precision=100) => value==null||value===''?null:Math.round(Number(value)*factor*precision)/precision;
 const metricDisplay = (value, factor) => typeof value==='number'?number(value,1/factor,factor===1?100:10000):'';
 const status = form => form.querySelector('[data-m89-status]');

 function baselineFields(data={}, units='metric', allowUnits=false) {
  const imperial=units==='imperial';
  return (allowUnits?'<label class="field">Measurement units<select name="units">'+options([['metric','Metric (cm, kg, km)'],['imperial','Imperial (in, lb, mi)']],units)+'</select></label>':'')
   +'<div class="m89-pair"><label class="field">Age range <small>Optional</small><select name="ageBand">'+options(ages,data.ageBand||'')+'</select></label>'
   +'<label class="field">Training experience <small>Optional</small><select name="experience">'+options(levels,data.experience||'')+'</select></label></div>'
   +'<div class="m89-pair"><label class="field"><span data-m89-height>Height ('+(imperial?'in':'cm')+')</span> <small>Optional</small><input type="number" inputmode="decimal" step="any" name="height" value="'+escape(metricDisplay(data.heightCm,imperial?2.54:1))+'"></label>'
   +'<label class="field"><span data-m89-weight>Weight ('+(imperial?'lb':'kg')+')</span> <small>Optional</small><input type="number" inputmode="decimal" step="any" name="weight" value="'+escape(metricDisplay(data.weightKg,imperial?.45359237:1))+'"></label></div>';
 }

 function readBaseline(form, units) {
  const fields=new FormData(form), imperial=units==='imperial';
  const heightCm=number(fields.get('height'),imperial?2.54:1),weightKg=number(fields.get('weight'),imperial?.45359237:1);
  if(heightCm!==null&&!(heightCm>=90&&heightCm<=250))throw Error('Enter a height within 90–250 cm'+(imperial?' (about 35.4–98.4 in)':'')+'.');
  if(weightKg!==null&&!(weightKg>=30&&weightKg<=350))throw Error('Enter a weight within 30–350 kg'+(imperial?' (about 66.1–771.6 lb)':'')+'.');
  return {ageBand:fields.get('ageBand')||null,experience:fields.get('experience')||null,heightCm,weightKg};
 }

 function profileSettings(data, units) {
  return '<section class="card m89-settings"><form data-m89-baseline data-units="'+escape(units)+'"><h3>Private athlete details</h3><p class="muted small">These optional details stay with your training account. They never appear on your social profile.</p>'
   +baselineFields(data,units)+'<button type="submit" class="btn">Save athlete details</button><p role="status" class="small" data-m89-status></p></form></section>';
 }

 function enforcePrimary(form, preferred) {
  const selected=[...form.querySelectorAll('[name="disciplines"]:checked')].map(input=>input.value);
  const primary=form.elements.primary_sport;
  primary.innerHTML=options([['','Select your primary sport'],...selected.map(sport=>[sport,sport])],selected.includes(preferred)?preferred:'');
 }

 async function start(context) {
  const { gate, current, rpc, logout, enter, garmin, connect, upload, icon }=context;
  const snapshot=await rpc('mile_onboarding_state');
  if(current()&&snapshot?.stage===6)return false;
  if(!current()||!snapshot||!Number.isInteger(snapshot.stage)||snapshot.stage<1||snapshot.stage>5)throw Error('Could not load profile setup. Sign in again to retry.');

  let data=snapshot, selected=snapshot.stage, busy=false, garminStatus='unknown', garminOutcome='';
  const drafts=new Map();
  const setStatus=(form,message)=>{status(form).textContent=message;};
  const beginning=() => '<div class="m89-brand" aria-label="MILE"><span>MILE<span>.</span></span><button type="button" class="btn alt sm" data-m89-signout>Sign out</button></div>';

  function fields(stage) {
   const profile=data.profile||{}, draft=drafts.get(stage)||{}, p={...profile,...draft};
   if(stage===1)return '<label class="field">Display name<input name="display_name" autocomplete="name" maxlength="60" required value="'+escape(p.display_name)+'"></label>'
    +'<label class="field">Username<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="24" required value="'+escape(p.username)+'"></label>'
    +'<p class="m89-hint">3–24 letters, numbers or underscores.</p>'
    +'<label class="field">Profile photo <small>Optional</small><input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"></label>'
    +'<p class="m89-hint">'+(profile.avatar_url?'Your current photo is saved. ':'')+'Your avatar can be visible to other athletes.</p>'
    +'<label class="field">Short bio <small>Optional</small><textarea name="bio" rows="2" maxlength="250">'+escape(p.bio)+'</textarea></label>';
   if(stage===2)return '<fieldset><legend>Sporting interests</legend><div class="m89-sports">'+sports.map(sport=>
    '<label><input name="disciplines" type="checkbox" value="'+sport+'"'+(p.disciplines?.includes(sport)?' checked':'')+'>'
    +'<span class="m89-sport-icon" aria-hidden="true">'+icon(sport)+'</span><span>'+sport+'</span></label>').join('')
    +'</div></fieldset><label class="field">Primary sport<select name="primary_sport" required></select></label>';
   if(stage===3)return baselineFields(draft.baseline||data.athlete,draft.units||data.units,true);
   if(stage===4) {
    const copy={authorised:'Garmin Connect is authorised.',expired:'Your previous Garmin authorisation needs attention.',not_connected:'Garmin Connect is available to connect.',unknown:'Checking your connection…',unavailable:'Connection status is unavailable. You can continue setup.'};
    return '<div class="m89-device"><span class="m775-provider-mark" aria-hidden="true">G</span><div><strong>Garmin Connect</strong><p>Import recorded workouts and supported health data you choose to share.</p><p role="status" data-m89-garmin-status>'+copy[garminStatus]+'</p></div></div>'
     +(garminOutcome==='failed'?'<p class="m89-warning">Garmin authorisation failed. You can try again or continue setup.</p>':'')
     +(garminStatus==='authorised'?'':'<button type="button" class="btn alt" data-m89-connect>Connect Garmin</button>');
   }
   return '<fieldset class="m89-privacy"><legend>Who can see your profile?</legend><label><input type="radio" name="visibility" value="private"'+(p.is_private!==false?' checked':'')+'><span><strong>Private</strong><small>You approve follow requests before followers can see your profile and follower-only activities.</small></span></label>'
    +'<label><input type="radio" name="visibility" value="public"'+(p.is_private===false?' checked':'')+'><span><strong>Public</strong><small>Signed-in athletes can find your profile. Each activity keeps its own sharing setting.</small></span></label></fieldset>'
    +'<p class="m89-hint">Activity auto-sharing starts off. Messaging and follower-only sharing are limited to accepted followers. Your measurements, recovery and training history stay in your private training account.</p>';
  }

  function draw() {
   if(!current())return;
   gate.classList.remove('hidden');
   const introduction=[
    'Choose how other athletes will recognise you.',
    'Choose what you train for. Triathlon is available as a profile preference.',
    'Set your units and add optional details for future training guidance.',
    'Bring your recorded training into MILE when you’re ready.',
    'Choose who can see your social profile.'
   ];
   gate.innerHTML='<section class="m89" aria-labelledby="m89-title">'+beginning()
    +'<ol class="m89-progress" aria-label="Setup progress">'+stages.map((title,i)=>
     '<li'+(i+1===selected?' aria-current="step"':'')+(i+1<selected?' data-done':'')+'><span aria-hidden="true">'+(i+1)+'</span>'+title+'</li>').join('')+'</ol>'
    +'<h1 id="m89-title" tabindex="-1">'+titles[selected-1]+'</h1><p class="m89-intro">'+introduction[selected-1]+'</p>'
    +'<form>'+fields(selected)+'<p data-m89-status role="status" class="m89-status"></p>'
    +'<div class="m89-actions"><button type="button" class="btn alt" data-m89-back '+(selected===1?'disabled':'')+'>Back</button>'
    +'<button type="submit" class="btn">'+(selected===4&&garminStatus!=='authorised'?'Skip for now':selected===5?'Finish setup':'Continue')+'</button></div></form></section>';
   const form=gate.querySelector('form'),stage=selected;
   gate.querySelector('#m89-title').focus();
   gate.querySelector('[data-m89-signout]').onclick=logout;
   form.querySelector('[data-m89-back]').onclick=()=>{
    if(busy||stage===1)return;
    remember(form,stage);
    selected--;
    openStage();
   };
   form.onsubmit=event=>{event.preventDefault();submit(form,stage);};
   if(stage===2){
    enforcePrimary(form,drafts.get(2)?.primary_sport||data.profile?.primary_sport);
    form.addEventListener('change',event=>{if(event.target.name==='disciplines')enforcePrimary(form,form.elements.primary_sport.value);});
   }
   if(stage===3){
    let last=form.elements.units.value;
    form.elements.units.onchange=()=>{
     const next=form.elements.units.value,oldMetric=last==='metric',newMetric=next==='metric';
     for(const [name,factor] of [['height',2.54],['weight',.45359237]]){
      const element=form.elements[name];if(element.value)element.value=oldMetric?metricDisplay(Number(element.value),factor):number(element.value,factor);
     }
     form.querySelector('[data-m89-height]').textContent='Height ('+(newMetric?'cm':'in')+')';
     form.querySelector('[data-m89-weight]').textContent='Weight ('+(newMetric?'kg':'lb')+')';
     last=next;
    };
   }
   form.querySelector('[data-m89-connect]')?.addEventListener('click',async event=>{
    if(busy)return;
    const button=event.currentTarget;button.disabled=true;busy=true;
    setStatus(form,'Opening Garmin authorisation…');
    try {await connect();} catch(error) {if(current())setStatus(form,error.message);}
    finally {busy=false;button.disabled=false;}
   });
  }

  function remember(form, stage) {
   const values=new FormData(form);
   if(stage===1)drafts.set(1,{display_name:values.get('display_name'),username:values.get('username'),bio:values.get('bio')});
   if(stage===2)drafts.set(2,{disciplines:values.getAll('disciplines'),primary_sport:values.get('primary_sport')});
   if(stage===3){
    const units=values.get('units');
    try {drafts.set(3,{units,baseline:readBaseline(form,units)});} catch (_) {}
   }
   if(stage===5)drafts.set(5,{is_private:values.get('visibility')==='private'});
  }

  function openStage() {
   draw();
   if(selected!==4)return;
   const params=new URLSearchParams(location.search);
   const outcome=params.get('garmin');
   if(['connected','failed'].includes(outcome)){
    garminOutcome=outcome;
    params.delete('garmin');
    history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
   }
   void garmin().then(outcomeStatus=>{
    if(!current()||selected!==4)return;
    garminStatus=outcomeStatus;
    if(!busy&&gate.querySelector('[data-m89-garmin-status]'))draw();
   });
  }

  function complete(profile) {
   if(!current())return;
   gate.innerHTML='<section class="m89" aria-labelledby="m89-title">'+beginning()
    +'<p class="m89-ready-mark" aria-hidden="true">✓</p><h1 id="m89-title" tabindex="-1">You’re ready, '+escape(profile.display_name)+'.</h1>'
    +'<p class="m89-intro">Your athlete profile and preferences are saved. Your dashboard is ready to explore.</p>'
    +'<button type="button" class="btn" data-m89-enter>Enter MILE</button><p data-m89-status role="status"></p></section>';
   gate.querySelector('#m89-title').focus();
   gate.querySelector('[data-m89-signout]').onclick=logout;
   gate.querySelector('[data-m89-enter]').onclick=enter;
  }

  async function submit(form,stage) {
   if(!current()||busy)return;
   busy=true;
   const buttons=[...form.querySelectorAll('button:not(:disabled)')];
   buttons.forEach(button=>button.disabled=true);
   setStatus(form,'Saving your setup…');
   try {
    const values=new FormData(form);
    let fields={};
    if(stage===1){
     const username=String(values.get('username')||'').trim().toLowerCase();
     if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error('Use 3–24 letters, numbers or underscores in your username.');
     if(!await rpc('mile_onboarding_username',{p_username:username}))throw Error('That username is unavailable.');
     fields={username,display_name:String(values.get('display_name')||'').trim(),bio:values.get('bio')};
     const photo=values.get('photo');if(photo?.size)fields.avatar_url=await upload(photo);
    }
    if(stage===2)fields={disciplines:values.getAll('disciplines'),primary_sport:values.get('primary_sport')};
    if(stage===3)fields={...readBaseline(form,values.get('units')),units:values.get('units')};
    if(stage===5)fields={is_private:values.get('visibility')==='private'};
    data=await rpc('mile_onboarding_save',{p_stage:stage,p_revision:data.revision,p_fields:fields});
    if(!current())return;
    drafts.delete(stage);
    if(data.stage===6){complete(data.profile);return;}
    selected=Math.min(stage+1,data.stage);
    openStage();
   }catch(error) {
    if(!current()||!form.isConnected)return;
    setStatus(form,error.message);
    if(error.status===409&&!form.querySelector('[data-m89-reload]')){
     const retry=document.createElement('button');retry.type='button';retry.dataset.m89Reload='1';retry.className='btn alt sm';retry.textContent='Reload saved progress';
     retry.onclick=async()=>{
      if(busy||!current())return;
      busy=true;retry.disabled=true;
      try{
       data=await rpc('mile_onboarding_state');
       if(!current())return;
       drafts.clear();
       if(data.stage===6){complete(data.profile);return;}
       selected=data.stage;
       openStage();
      }catch(error){if(current())setStatus(form,error.message);}
      finally{busy=false;retry.disabled=false;}
     };
     status(form).after(retry);
    }
   }finally{
    busy=false;buttons.forEach(button=>button.disabled=false);
   }
  }

  openStage();
  return true;
 }

 root.mileOnboarding={start,profileSettings,readBaseline};
})(globalThis);
