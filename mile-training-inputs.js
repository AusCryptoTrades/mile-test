/* Batch 88.1: normalized planning inputs only. No exercise or load prescription.
 * Pure, deterministic, shared by future preview/generation/regeneration.
 */
(function(root){
 'use strict';
 const sports={Running:'km/week',HYROX:'km/week',Swimming:'m/week',Cycling:'hours/week'};
 function iso(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v}
 function number(v){return v===null||v===undefined||String(v).trim()===''?NaN:Number(v)}
 function normalize(input){
  const errors=[],warnings=[],s=input||{},sport=s.sport,volume=number(s.volume),weeks=number(s.weeks),sessions=number(s.sessions);
  const available=Array.isArray(s.available)?[...new Set(s.available.map(number))].sort((a,b)=>a-b):[];
  if(!Object.hasOwn(sports,sport))errors.push('Unsupported endurance sport');
  if(!Number.isFinite(volume)||volume<0)errors.push('Enter current training volume');
  if(!Number.isInteger(weeks)||weeks<1||weeks>52)errors.push('Invalid programme length');
  if(!available.length||available.some(d=>!Number.isInteger(d)||d<0||d>6))errors.push('Invalid available days');
  if(!Number.isInteger(sessions)||sessions<1||sessions>7||sessions>available.length)errors.push('Invalid weekly session count');
  if(!iso(s.start))errors.push('Invalid start date');
  if(s.raceDate&&(!iso(s.raceDate)||!iso(s.start)||s.raceDate<s.start))errors.push('Invalid race date');
  if(!['beginner','intermediate','advanced'].includes(s.level))errors.push('Invalid experience level');
  const preferred=number(s.longDay);
  if(Number.isInteger(preferred)&&!available.includes(preferred))warnings.push('Preferred long-session day is unavailable');
  let end=null,raceOffset=null;
  if(iso(s.start)&&Number.isInteger(weeks)&&weeks>=1&&weeks<=52){
   const start=Date.parse(s.start+'T00:00:00Z');
   end=new Date(start+(weeks*7-1)*86400000).toISOString().slice(0,10);
   if(iso(s.raceDate)){raceOffset=Math.round((Date.parse(s.raceDate+'T00:00:00Z')-start)/86400000);if(s.raceDate>end)warnings.push('Race falls after programme end')}
  }
  if(errors.length)return {ok:false,errors,warnings};
  return {ok:true,errors,warnings,profile:{schemaVersion:1,sport,volume,volumeUnit:sports[sport],weeks,sessions,available,preferredLongDay:available.includes(preferred)?preferred:null,start:s.start,end,raceDate:s.raceDate||null,raceOffset,level:s.level,goal:String(s.goal||'').trim(),paceBaseline:s.paceBaseline||null,ftp:Number.isFinite(number(s.ftp))&&number(s.ftp)>0?number(s.ftp):null}};
 }
 const api={normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.mileTrainingInputs=api;
})(globalThis);
