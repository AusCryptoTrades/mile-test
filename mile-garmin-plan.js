// One source for new running workout instructions and watch-ready steps.
// Does not publish or change existing sessions. Exact choices are visible in the written plan.
(function(root){
 function structuredRun(kind,{distanceKm,reps,pace,easyHr,zoneRanges}){
  if(!['easy','long','threshold','speed'].includes(kind))return null;
  const time=seconds=>({kind:'time',seconds}),dist=meters=>({kind:'distance',meters}),open={kind:'open'};
  const step=(intensity,description,duration,target={kind:'open'})=>({kind:'step',intensity,description,duration,target});
  const p=(lo,hi)=>Number.isFinite(pace)&&Math.round(pace+lo)>=120&&Math.round(pace+hi)<=1800?{kind:'pace',fastSecondsPerKm:Math.round(pace+lo),slowSecondsPerKm:Math.round(pace+hi)}:{kind:'open'};
  const format=v=>Math.floor(v/60)+':'+String(v%60).padStart(2,'0');
  const paceText=(t,fallback)=>t.kind==='pace'?format(t.fastSecondsPerKm)+'–'+format(t.slowSecondsPerKm)+'/km':fallback;
  const easy=p(65,105),tempo=p(-5,10),fast=p(-20,-5);
  const zone=(i,ceiling)=>{const row=zoneRanges?.[i],lo=Number(row?.min),hi=Math.min(Number(row?.max),Number.isInteger(ceiling)&&ceiling>=30?ceiling:250);return Number.isInteger(lo)&&Number.isInteger(hi)&&lo>=30&&hi<=250&&lo<hi?{kind:'heart_rate',lowBpm:lo,highBpm:hi}:{kind:'open'}};
  const aerobic=zone(1,easyHr),recovery=zone(0),threshold=zone(3);
  const targetText=(t,fallback)=>t.kind==='heart_rate'?t.lowBpm+'–'+t.highBpm+' bpm':paceText(t,fallback);
  const easyTarget=aerobic.kind==='heart_rate'?aerobic:easy;
  const easyText=targetText(easyTarget,'a conversational effort');
  const hr=aerobic.kind==='heart_rate'?'':' Use the talk test.';
  const steps=[];let detail='';
  if(kind==='easy'||kind==='long'){
   if(!Number.isFinite(distanceKm)||distanceKm<1||distanceKm>200)return null;
   if(kind==='easy')steps.push(step('warmup','Easy walk/jog',time(600),recovery));
   steps.push(step('active',kind==='long'?'Ease into your aerobic effort.':'Conversational aerobic running.',dist(Math.round(distanceKm*1000)),easyTarget));
   steps.push(step('cooldown','Walk; gentle mobility afterwards',time(300)));
   detail=kind==='easy'?'Warm-up: 10 min walk/jog'+(recovery.kind==='heart_rate'?' at '+targetText(recovery,'easy effort'):'')+'. Main: '+distanceKm+' km at '+easyText+'.'+hr+' RPE 3–4. Cooldown: 5 min walk + gentle mobility.':'Main: '+distanceKm+' km total running at '+easyText+'. Ease into your aerobic effort.'+hr+' Cooldown: 5 min walk. RPE 3–4.';
  }else{
   const n=kind==='speed'?reps+1:reps;
   if(!Number.isInteger(n)||n<2||n>50)return null;
   const target=kind==='speed'?fast:tempo.kind==='pace'?tempo:threshold,seconds=kind==='speed'?180:360,cool=kind==='speed'?2000:1500;
   steps.push(step('warmup','Easy running',dist(2000),aerobic));
   if(kind==='speed')steps.push(step('warmup','Running drills; lap when ready',open));
   steps.push({kind:'repeat',count:4,steps:[step('interval','Controlled stride',time(20)),step('recovery','Easy recovery; lap when ready',open)]});
   const work=()=>step('interval',kind==='speed'?'Controlled fast running':'Threshold effort',time(seconds),target);
   const rest=()=>step('recovery','Easy jog',time(120));
   if(n>2)steps.push({kind:'repeat',count:n-1,steps:[work(),rest()]});else steps.push(work(),rest());
   steps.push(work(),step('cooldown','Easy running',dist(cool),recovery));
   detail='Warm-up: 2 km easy'+(kind==='speed'?', drills (lap when ready)':'')+(aerobic.kind==='heart_rate'?' at '+targetText(aerobic,'easy effort'):'')+' + 4 × 20 sec controlled strides with lap-controlled easy recovery. Main: '+n+' × '+seconds/60+' min at '+targetText(target,kind==='speed'?'controlled fast effort (RPE 8)':'comfortably hard effort (RPE 7)')+'; 2 min easy jog between reps. Cooldown: '+cool/1000+' km easy'+(recovery.kind==='heart_rate'?' at '+targetText(recovery,'easy effort'):'')+'. '+(kind==='speed'?'Controlled form, no sprinting. RPE 8/10.':'Build effort gradually. RPE 7/10.');
  }
  return {steps,detail};
 }
 root.mileStructuredRun=structuredRun;
 if(typeof module!=='undefined'&&module.exports)module.exports={structuredRun};
})(globalThis);
