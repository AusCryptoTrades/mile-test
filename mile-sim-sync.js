/* MILE SIM -> cloud activity and explicit social publishing. Never publishes without a tap. */
(function(){
'use strict';
const HISTORY='mile-sim-history-v1',INTENT='mile-sim-publish-intent-v1';
const api=()=>window.m383SocialApi,uid=()=>window.mileChallengesUserId?.();
const read=()=>{try{return JSON.parse(localStorage.getItem(HISTORY)||'[]').filter(s=>s&&s.finished&&Number.isFinite(s.started)&&Array.isArray(s.stages)&&Array.isArray(s.taps))}catch{return []}};
const key=s=>'mile-sim-'+String(s.started);
function payload(s,visibility){
 const elapsed=Math.max(0,Math.round(((s.ended||s.taps.at(-1))-s.started)/1000));
 const splits=s.stages.slice(0,s.taps.length).map((stage,i)=>({name:String(stage.name).slice(0,80),type:stage.type,seconds:Math.max(0,Math.round((s.taps[i]-(i?s.taps[i-1]:s.started))/1000))}));
 const runs=splits.filter(x=>x.type==='run'),distance_m=runs.length*Number(s.distance||1000);
 const runSeconds=runs.reduce((n,x)=>n+x.seconds,0);
 return {user_id:uid(),source_activity_id:key(s),activity_type:'hyrox',title:'MILE SIM · HYROX',caption:'',activity_at:new Date(s.started).toISOString(),distance_m:distance_m||null,duration_s:elapsed,average_pace_s_km:distance_m&&runSeconds?Math.round(runSeconds/(distance_m/1000)):null,visibility,share_route:false,detail_snapshot:{schema:1,source:'mile-sim',early:!!s.early,run_distance_m:s.distance,roxzone_mode:s.rox,stages:splits,station_seconds:splits.filter(x=>x.type==='station').reduce((n,x)=>n+x.seconds,0),roxzone_seconds:splits.filter(x=>x.type==='rox-in'||x.type==='rox-out').reduce((n,x)=>n+x.seconds,0)}};
}
let busy=false;
async function sync(){
 if(busy||!api()||!uid())return;busy=true;
 try{
  const sessions=read();if(!sessions.length)return;
  const existing=await api()('mile_social_activities','GET',null,'?select=id,source_activity_id,visibility&user_id=eq.'+encodeURIComponent(uid())+'&source_activity_id=like.mile-sim-*');
  const byId=new Map(existing.map(x=>[x.source_activity_id,x]));
  for(const s of sessions){
   const k=key(s),prior=byId.get(k);
   if(!prior){try{const rows=await api()('mile_social_activities','POST',payload(s,'private'));byId.set(k,rows[0]||{source_activity_id:k,visibility:'private'})}catch(err){if(!/duplicate|unique|23505/i.test(err.message))throw err}}
  }
  const intent=localStorage.getItem(INTENT);
  if(intent){
   const s=sessions.find(x=>key(x)===intent);
   if(s){
    const visibility=window.confirm('Publish this HYROX simulation to your MILE Social Feed? Choose OK for public, or Cancel to keep it private.');
    if(visibility){
     await api()('mile_social_activities','PATCH',{visibility:'public'},'?user_id=eq.'+encodeURIComponent(uid())+'&source_activity_id=eq.'+encodeURIComponent(intent));
     localStorage.removeItem(INTENT);
     if(window.m36State){window.m36State.posts=await api()('mile_social_activities','GET',null,'?select=*&order=created_at.desc&limit=80');window.m383Repaint?.();}
     alert('HYROX simulation published to your MILE Social Feed.');
    }else{localStorage.removeItem(INTENT)}
   }
  }
 }catch(err){console.warn('MILE SIM sync pending:',err);window.mileSimSyncError=String(err.message||err)}
 finally{busy=false}
}
window.mileSimSync=sync;
window.addEventListener('storage',e=>{if(e.key===HISTORY||e.key===INTENT)sync()});
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='mile-sim-sync')sync()});
setInterval(sync,4000);setTimeout(sync,1500);
})();
