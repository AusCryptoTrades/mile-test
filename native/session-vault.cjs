/* Native session vault contract. Not wired into legacy login until all token paths are migrated. */
'use strict';
function createSessionVault(cap){
 if(!cap?.isNativePlatform?.()) throw new Error('Native session vault requires a native platform');
 const plugin=cap.Plugins?.SecureStoragePlugin;
 if(!plugin?.get||!plugin?.set||!plugin?.remove)throw new Error('Native secure storage unavailable');
 const key='mile.auth.session.v1';
 let queue=Promise.resolve();
 const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result};
 const validate=s=>{if(!s||typeof s.accessToken!=='string'||!s.accessToken||typeof s.refreshToken!=='string'||!s.refreshToken||typeof s.userId!=='string'||!s.userId)throw new Error('Invalid session');return {accessToken:s.accessToken,refreshToken:s.refreshToken,userId:s.userId}};
 return Object.freeze({
  save:s=>{const value=JSON.stringify(validate(s));return serial(()=>plugin.set({key,value}));},
  restore:()=>serial(async()=>{const r=await plugin.get({key});return validate(JSON.parse(r.value));}),
  clear:()=>serial(()=>plugin.remove({key}))
 });
}
if(typeof module!=='undefined'&&module.exports)module.exports={createSessionVault};
else window.mileCreateSessionVault=createSessionVault;
