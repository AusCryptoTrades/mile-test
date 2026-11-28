/* Web credentials stay compatible. The protected iOS build persists them only in Keychain. */
(function(root){
'use strict';
const keys={accessToken:'av-token',refreshToken:'av-refresh',userId:'av-user'};
const disabled='mile.native.session-disabled';
function createSession(win,{native=false}={}){
 const {localStorage:local,sessionStorage:transient}=win;
 let value=null,version=0,queue=Promise.resolve();
 const run=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next};
 const eraseLegacy=()=>{for(const key of Object.values(keys)){local.removeItem(key);transient.removeItem(key)}};
 const valid=data=>data&&Object.keys(keys).every(key=>typeof data[key]==='string'&&data[key].length>0);
 const plugin=()=>{
  const bridge=win.Capacitor?.Plugins?.MILEHealthKit;
  if(!win.Capacitor?.isNativePlatform?.()||win.Capacitor?.getPlatform()!=='ios'||
      !['readSession','writeSession','clearSession'].every(key=>typeof bridge?.[key]==='function'))
   throw Error('Secure session storage is unavailable. Unlock this iPhone and try again.');
  return bridge;
 };
 if(native)eraseLegacy();
 function read(key){
  const field=Object.keys(keys).find(name=>keys[name]===key);
  if(!field)return null;
  if(native){
   if(win.parent&&win.parent!==win)return win.parent.mileEmbeddedSession?.read(key,win)??null;
   return value?.[field]??null;
  }
  return local.getItem(key)||transient.getItem(key);
 }
 async function restore(){
  if(!native||win.parent&&win.parent!==win)return null;
  const captured=version;
  return run(async()=>{
   if(local.getItem(disabled)==='1'){await plugin().clearSession();return null;}
   const result=await plugin().readSession();
   if(result?.session!==null&&!valid(result?.session))throw Error('Secure session could not be restored. Sign in again.');
   if(captured!==version)return null;
   value=result.session;
   return value;
  });
 }
 async function save(data){
  if(native&&win.parent&&win.parent!==win)throw Error('Use the main app to sign in.');
  const next={accessToken:data.access_token,userId:data.user?.id,refreshToken:data.refresh_token??(data.user?.id===read('av-user')?read('av-refresh'):null)};
  if(!native){
   for(const [name,key] of Object.entries(keys))if(next[name]){local.setItem(key,next[name]);transient.setItem(key,next[name]);}
   return true;
  }
  if(!valid(next))throw Error('The sign-in service returned an incomplete session.');
  const captured=++version;
  return run(async()=>{
   if(captured!==version)return false;
   // If the app exits before a replacement reaches Keychain, do not restore the previous account.
   local.setItem(disabled,'1');
   await plugin().writeSession(next);
   if(captured!==version)return false;
   value=next;
   local.removeItem(disabled);
   return true;
  });
 }
 function clear(){
  if(native&&win.parent&&win.parent!==win)return win.parent.mileEmbeddedSession?.signOut(win)??Promise.resolve(false);
  version++;value=null;
  if(native){
   let failure;
   try{local.setItem(disabled,'1');eraseLegacy();}catch(error){failure=error;}
   return run(async()=>{await plugin().clearSession();if(failure)throw failure;});
  }
  eraseLegacy();return Promise.resolve();
 }
 return Object.freeze({native,read,restore,save,clear});
}
if(typeof module!=='undefined'&&module.exports)module.exports={createSession};
else root.mileSession=createSession(root,{native:root.document.documentElement.dataset.mileNativeSession==='true'});
})(globalThis);
