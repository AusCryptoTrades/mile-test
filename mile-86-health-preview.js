
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-m86-health-access]');if(!button||button.disabled)return;
 const card=button.closest('.m775-card'),status=card.querySelector('[data-m86-health-status]');
 const cap=window.Capacitor;
 if(!cap?.isNativePlatform?.()||cap.getPlatform()!=='ios')return;
 const owner=window.m76CurrentUser?.();if(!owner)return;
 const active=()=>card.isConnected&&window.m76CurrentUser?.()===owner;
 button.disabled=true;
 try{
  const plugin=cap.Plugins?.MILEHealthKit;
  if(!plugin)throw Error('Bridge unavailable');
  const result=await plugin.availability();
  if(!active())return;
  if(!result.available){status.textContent='HealthKit unavailable on this device';return;}
  const permission=await plugin.requestReadAccess();
  if(active())status.textContent=permission.requestCompleted?'Permission request completed — import not enabled':'Permission request incomplete';
 }catch{if(active())status.textContent='Health access could not be requested';}
 finally{if(active())button.disabled=false;}
});

