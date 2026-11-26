// One source for new running workout instructions and watch-ready steps.
// Does not publish or change existing sessions. Exact choices are visible in the written plan.
(function(root){
 function structuredRun(kind,{distanceKm,reps,pace,easyHr}){
  if(!['easy','long','threshold','speed'].includes(kind))return null;
  const time=seconds=>({kind:'time',seconds}),dist=meters=>({kind:'distance',meters}),open={kind:'open'};
  const step=(intensity,description,duration,target={kind:'open'})=>({kind:'step',intensity,description,duration,target});
  const p=(lo,hi)=>Number.isFinite(pace)&&Math.round(pace+lo)>=120&&Math.round(pace+hi)<=1800?{kind:'pace',fastSecondsPerKm:Math.round(pace+lo),slowSecondsPerKm:Math.round(pace+hi)}:{kind:'open'};
  const format=v=>Math.floor(v/60)+':'+String(v%60).padStart(2,'0');
  const paceText=(t,fallback)=>t.kind==='pace'?format(t.fastSecondsPerKm)+'–'+format(t.slowSecondsPerKm)+'/km':fallback;
  const easy=p(65,105),tempo=p(-5,10),fast=p(-20,-5);
  const hr=Number.isFinite(easyHr)&&easyHr>=30&&easyHr<=250?' Keep HR mostly below '+easyHr+' bpm.':' Use the talk test.';
  const easyText=paceText(easy,'conversational / RPE 3–4');
  const steps=[];let detail='';
  if(kind==='easy'||kind==='long'){
   if(!Number.isFinite(distanceKm)||distanceKm<1||distanceKm>200)return null;
   if(kind==='easy')steps.push(step('warmup','Easy walk/jog',time(600)));
   steps.push(step('active',kind==='long'?'First 10 min very easy; then settle into conversational effort.'+hr:'Conversational aerobic running.'+hr,dist(Math.round(distanceKm*1000)),kind==='long'?{kind:'open'}:easy));
   steps.push(step('cooldown','Walk; gentle mobility afterwards',time(300)));
   detail=kind==='easy'?'Warm-up: 10 min walk/jog. Main: '+distanceKm+' km at '+easyText+'.'+hr+' RPE 3–4. Cooldown: 5 min walk + gentle mobility.':'Warm-up: first 10 min very easy within the run. Main: '+distanceKm+' km total running; then settle at '+easyText+' after warm-up; use pace as guidance, not a watch alert.'+hr+' Cooldown: 5 min walk. RPE 3–4.';
  }else{
   const n=kind==='speed'?reps+1:reps;
   if(!Number.isInteger(n)||n<2||n>50)return null;
   const target=kind==='speed'?fast:tempo,seconds=kind==='speed'?180:360,cool=kind==='speed'?2000:1500;
   steps.push(step('warmup','Easy running',dist(2000)));
   if(kind==='speed')steps.push(step('warmup','Running drills; lap when ready',open));
   steps.push({kind:'repeat',count:4,steps:[step('interval','Controlled stride',time(20)),step('recovery','Easy recovery; lap when ready',open)]});
   const work=()=>step('interval',kind==='speed'?'Controlled fast running':'Threshold effort',time(seconds),target);
   const rest=()=>step('recovery','Easy jog',time(120));
   if(n>2)steps.push({kind:'repeat',count:n-1,steps:[work(),rest()]});else steps.push(work(),rest());
   steps.push(work(),step('cooldown','Easy running',dist(cool)));
   detail='Warm-up: 2 km easy'+(kind==='speed'?', drills (lap when ready)':'')+' + 4 × 20 sec controlled strides with lap-controlled easy recovery. Main: '+n+' × '+seconds/60+' min at '+paceText(target,kind==='speed'?'controlled fast / RPE 8':'comfortably hard / RPE 7')+'; 2 min easy jog between reps. Cooldown: '+cool/1000+' km easy. '+(kind==='speed'?'Controlled form, no sprinting. RPE 8/10.':'Build HR gradually; do not chase HR in short reps. RPE 7/10.');
  }
  return {steps,detail};
 }
 root.mileStructuredRun=structuredRun;
 if(typeof module!=='undefined'&&module.exports)module.exports={structuredRun};
})(globalThis);
