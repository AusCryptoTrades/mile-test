(function(root){
'use strict';
function createBridge(win,makeVault){
 const keys=['av-token','av-refresh','av-user'];const map=new Map();let vault;let generation=0;let ready=false;
 const get=k=>map.get(k)||null;
 const set=(k,v)=>{if(!keys.includes(k))throw Error('Invalid session key');if(!ready)throw Error('Secure session not initialized');map.set(k,String(v));};
 const remove=k=>map.delete(k);
 const snapshot=()=>({accessToken:get(keys[0]),refreshToken:get(keys[1]),userId:get(keys[2])});
 const scrub=()=>{for(const k of keys){win.localStorage.removeItem(k);win.sessionStorage.removeItem(k)}};
 const init=async()=>{scrub();vault=makeVault(win.Capacitor);try{const s=await vault.restore();map.set(keys[0],s.accessToken);map.set(keys[1],s.refreshToken);map.set(keys[2],s.userId)}catch(e){map.clear()}ready=true};
 const persist=async()=>{if(!ready||!vault)throw Error('Secure session unavailable');const s=snapshot();try{await vault.save(s)}catch(e){map.clear();throw Error('Could not securely save session')}};
 const clear=async()=>{generation++;map.clear();scrub();if(!vault)throw Error('Secure session unavailable');try{await vault.clear()}catch(e){throw Error('Could not confirm secure session removal')}};
 return Object.freeze({getItem:get,setItem:set,removeItem:remove,init,persist,clear,epoch:()=>generation});
}
if(typeof module!=='undefined'&&module.exports)module.exports={createBridge};
else if(root.parent!==root){root.mileSession=root.parent.mileSession;}
else root.mileSession=createBridge(root,root.mileCreateSessionVault);
})(typeof window!=='undefined'?window:globalThis);
