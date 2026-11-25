(function(root){
'use strict';
function backAction(s){
 if(s.workout)return 'protect';
 if(s.overlay)return 'close';
 if(s.drawer)return 'escape';
 if(s.settings)return 'settings';
 if(s.canGoBack)return 'history';
 return 'stay';
}
function attach(win){
 const cap=win.Capacitor;
 if(!cap?.isNativePlatform?.())return false;
 const doc=win.document,app=cap.Plugins?.App;
 doc.documentElement.dataset.mileNative=cap.getPlatform();
 const emit=(name,detail)=>win.dispatchEvent(new CustomEvent(name,{detail}));
 const status=win.MILE_NATIVE_BUILD||{};
 win.mileNative=Object.freeze({platform:cap.getPlatform(),build:status.commit||'unknown',version:status.version||'unknown'});
 if(!app?.addListener)return false;
 const on=(name,fn)=>Promise.resolve(app.addListener(name,fn)).catch(()=>console.warn('MILE native listener unavailable: '+name));
 on('appStateChange',({isActive})=>emit('mile:native-state',{isActive:!!isActive}));
 if(cap.getPlatform()==='android')on('backButton',({canGoBack})=>{
  const frame=doc.getElementById('mile-native-view');
  const visible=el=>!!(el&&el.getClientRects().length&&win.getComputedStyle(el).visibility!=='hidden');
  const overlay=[...doc.querySelectorAll('#mile-admin-centre,#mile-beta-feedback-overlay,#mile35-detail')].find(visible);
  const drawer=[...doc.querySelectorAll('#m36-drawer,#mile-emergency-more.open')].find(visible);
  const settings=doc.querySelector('[data-m771-page]:not([data-m771-page="hub"])');
  const action=backAction({workout:['tracker','sim'].includes(frame?.dataset.view),overlay:!!overlay,drawer:!!drawer,settings:visible(settings),canGoBack});
  if(action==='protect'){emit('mile:native-back-protected',{view:frame.dataset.view});return;}
  if(action==='close'){
   const button=overlay.querySelector('[data-ma-close],[data-beta5-close]')||[...overlay.querySelectorAll('button')].find(b=>/^(back|close|‹ back)$/i.test((b.getAttribute('aria-label')||b.textContent).trim()));
   button?.click();return;
  }
  if(action==='escape'){doc.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return;}
  if(action==='settings'){win.mile771?.open('hub');return;}
  if(action==='history')win.history.back();
 });
 return true;
}
if(typeof module!=='undefined'&&module.exports)module.exports={backAction,attach};
else attach(root);
})(typeof window!=='undefined'?window:globalThis);
