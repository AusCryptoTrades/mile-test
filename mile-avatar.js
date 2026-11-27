/* Read MILE-owned avatar objects with the signed-in viewer's Storage permissions. */
(function (root) {
 'use strict';
 const pathPattern=/^\/storage\/v1\/object\/(?:public|authenticated)\/mile-avatars\/([a-f0-9-]{36}\/(?:avatar|cover)\.jpg)$/;
 const nodes=new Map();
 const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 let session=()=>null;

 function parse(value) {
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url:null;}
  catch (_) {return null;}
 }
 function markup(value,alt='') {
  const url=parse(value);
  if(!url)return '';
  const attribute=pathPattern.test(url.pathname)?'data-mile-avatar':'src';
  return '<img '+attribute+'="'+escape(url.href)+'" alt="'+escape(alt)+'">';
 }
 function clear(image) {
  const entry=nodes.get(image);
  if(!entry)return;
  entry.controller.abort();
  if(entry.objectUrl)URL.revokeObjectURL(entry.objectUrl);
  image.removeAttribute('src');image.hidden=true;
  nodes.delete(image);
 }
 async function load(image) {
  const value=image.dataset.mileAvatar, active=session(), url=parse(value), base=parse(active?.base)?.origin;
  const path=url&&pathPattern.exec(url.pathname);
  if(!path||!active?.owner||!active.headers?.Authorization||url.origin!==base)return;
  const cached=nodes.get(image);
  if(cached?.value===value&&cached.owner===active.owner)return;
  clear(image);
  const entry={value,owner:active.owner,controller:new AbortController()};
  nodes.set(image,entry);
  image.hidden=true;
  try {
   const response=await fetch(base+'/storage/v1/object/authenticated/mile-avatars/'+path[1]+url.search,{
    headers:active.headers,cache:'no-store',credentials:'omit',redirect:'error',signal:entry.controller.signal
   });
   if(!response.ok)return;
   const blob=await response.blob();
   if(blob.type!=='image/jpeg'||!image.isConnected||nodes.get(image)!==entry||session()?.owner!==active.owner)return;
   entry.objectUrl=URL.createObjectURL(blob);
   image.src=entry.objectUrl;image.hidden=false;
  }catch (_) {}
 }
 function scan(node) {
  if(node.matches?.('img[data-mile-avatar]'))void load(node);
  for(const image of node.querySelectorAll?.('img[data-mile-avatar]')||[])void load(image);
 }
 function set(image,value) {
  const url=parse(value);
  if(!url)return;
  if(pathPattern.test(url.pathname)){
   if(image.dataset.mileAvatar!==url.href){
    clear(image);
    image.removeAttribute('src');image.hidden=true;
    image.dataset.mileAvatar=url.href;
   }
   void load(image);
  }else{
   clear(image);delete image.dataset.mileAvatar;
   if(image.getAttribute('src')!==url.href)image.src=url.href;
   image.hidden=false;
  }
 }
 new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes')scan(record.target);
   for(const node of record.addedNodes)scan(node);
   for(const node of record.removedNodes){
    if(node.matches?.('img[data-mile-avatar]')&&!node.isConnected)clear(node);
    for(const image of node.querySelectorAll?.('img[data-mile-avatar]')||[])if(!image.isConnected)clear(image);
   }
  }
 }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-mile-avatar']});

 root.mileAvatar={markup,set,configure(getSession){session=getSession;scan(document);},reset(){for(const image of nodes.keys())clear(image);}};
})(globalThis);
