/* Staging-only evidence. Record fixed checkpoints in memory and export them on request. */
(function(root){
 'use strict';
 if(document.documentElement.dataset.mileStaging!=='true')return;
 const checkpoints=new Set(['plan-reviewed','plan-created','calendar-opened','garmin-published','garmin-imported',
  'match-confirmed','analysis-opened','proposal-reviewed','proposal-approved']);
 const events=new Set();
 const active=()=>typeof v4Ready!=='undefined'&&v4Ready&&typeof userId!=='undefined'&&userId;
 let session=null;
 function mark(event){
  const owner=active();
  if(!owner||!checkpoints.has(event))return;
  if(owner!==session){events.clear();session=owner}
  events.add(event);
 }
 function reset(){events.clear();session=null}
 function button(){
  if(!active())return '';
  return '<button class="btn alt sm" type="button" data-mile-beta-report>Download beta report</button>';
 }
 function download(){
  if(!active())return;
  const report={schema:1,build:document.querySelector('meta[name="mile-beta-build"]')?.content||'local',
   checkpoints:session===active()?[...events]:[]};
  const file=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=file;link.download='mile-beta-report.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(file),1000);
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-mile-beta-report]'))download()});
 root.mileRunningBeta={mark,reset,button};
})(globalThis);
