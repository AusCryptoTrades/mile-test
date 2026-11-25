/* Batch 80.1: permanent admin overview. Data is authorised by the server. */
(() => {
 'use strict';
 const legacyReports=window.mileBetaAdmin;
 const base='https://mgixvokjlytjuypzcfzz.supabase.co';
 const key='sb_publishable_gIQO8rNBD9kKQpQdky0-7w_2A55HzO8';
 const token=()=>localStorage.getItem('av-token')||sessionStorage.getItem('av-token');
 const css=document.createElement('style');
 css.textContent=`
 #mile-admin-centre{position:fixed;inset:0;z-index:2147483638;background:var(--bg,#101414);color:var(--mile-ink,var(--text,#eee));overflow:auto;overscroll-behavior:contain;font:inherit;padding:env(safe-area-inset-top,0px) 16px calc(24px + env(safe-area-inset-bottom,0px));box-sizing:border-box}
 #mile-admin-centre *{box-sizing:border-box}
 #mile-admin-centre .ma-shell{max-width:850px;margin:auto;padding:16px 0 32px}
 #mile-admin-centre .ma-header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:18px}
 #mile-admin-centre .ma-brand{font-weight:900;letter-spacing:-.05em;font-size:27px}
 #mile-admin-centre .ma-eyebrow{font-size:10px;letter-spacing:.15em;font-weight:800;opacity:.7}
 #mile-admin-centre h1{font-size:27px;margin:5px 0 8px;letter-spacing:-.035em}
 #mile-admin-centre h2{font-size:15px;margin:0 0 12px}
 #mile-admin-centre .ma-sub{font-size:12px;opacity:.7;line-height:1.5}
 #mile-admin-centre button{font:inherit;color:inherit;background:var(--mile-surface-raised,var(--panel2,#252b2b));border:1px solid var(--mile-stroke,var(--line,#495050));border-radius:9px;cursor:pointer;padding:8px 12px;min-height:40px}
 #mile-admin-centre button[aria-pressed=true]{border-color:var(--mile-accent,var(--orange,#b9f576));box-shadow:inset 0 -2px var(--mile-accent,var(--orange,#b9f576));font-weight:750}
 #mile-admin-centre .ma-range{display:flex;gap:6px;flex-wrap:wrap}
 #mile-admin-centre .ma-status{display:flex;align-items:center;gap:7px;font-size:12px;margin:14px 0}
 #mile-admin-centre .ma-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none}
 #mile-admin-centre .ma-status[data-state=ready] .ma-dot{background:#55b87a}
 #mile-admin-centre .ma-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0}
 #mile-admin-centre .ma-card{border:1px solid var(--mile-stroke,var(--line,#495050));background:var(--mile-surface,var(--panel,#1a2020));border-radius:12px;padding:12px;min-width:0}
 #mile-admin-centre .ma-value{font-size:26px;font-weight:850;font-variant-numeric:tabular-nums;margin:5px 0;letter-spacing:-.035em}
 #mile-admin-centre .ma-label{font-size:12px;font-weight:700}
 #mile-admin-centre .ma-section{margin:14px 0}
 #mile-admin-centre .ma-chart{width:100%;height:112px;display:block;overflow:visible}
 #mile-admin-centre .ma-chart-labels{display:flex;justify-content:space-between;font-size:11px;opacity:.75}
 #mile-admin-centre .ma-toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:22px}
 #mile-admin-centre .ma-module{display:flex;width:100%;justify-content:space-between;align-items:center;text-align:left}

 #mile-admin-centre .ma-management{margin-top:14px}
 #mile-admin-centre .ma-module{margin:6px 0}
 #mile-admin-centre .ma-management input,#mile-admin-centre .ma-management select{background:var(--mile-surface-raised,var(--panel2,#252b2b));color:inherit;border:1px solid var(--mile-stroke,var(--line,#495050));border-radius:9px;padding:9px;min-height:42px;font:inherit;min-width:0;max-width:100%}
 #mile-admin-centre .ma-controls{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}
 #mile-admin-centre .ma-controls input{flex:1 1 150px}
 #mile-admin-centre .ma-controls select{flex:1 1 110px}
 #mile-admin-centre .ma-item{margin:8px 0;overflow-wrap:anywhere}
 #mile-admin-centre .ma-item p{white-space:pre-wrap;margin:10px 0}
 #mile-admin-centre .ma-item details{margin:9px 0;font-size:12px}
 #mile-admin-centre .ma-item summary{cursor:pointer}
 #mile-admin-centre .ma-pagination{display:flex;align-items:center;justify-content:space-between;gap:6px}
 #mile-admin-centre [hidden]{display:none!important}
 @media(min-width:650px){#mile-admin-centre .ma-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
 `;
 document.head.append(css);
 const modules=[
 ['athletes','Athletes','Registered beta members',false],
 ['new_athletes','New athletes','Joined in selected period',true],
 ['garmin_activities','Training','Garmin activities in period',true],
 ['saved_blocks','Programmes','Saved training blocks',false],
 ['garmin_connections','Garmin','Accounts with connection records',false],
 ['social_posts','Social','Posts created in period',true],
 ['messages','Messages','Non-deleted messages in period',true],
 ['active_challenges','Challenges','Currently active',false],
 ['open_reports','Feedback','New or investigating',false],
 ['reports_received','Reports received','Submitted in period',true],
 ['accounts_with_training_sync','Training sync','Accounts updated in period',true],
 ['premium_members','Membership','Active premium memberships',false]
 ];
 let root,controller,managementController,session,days=7,oldOverflow='',returnFocus;
 const close=()=>{controller?.abort();managementController?.abort();if(root){root.remove();document.body.style.overflow=oldOverflow;root=null;returnFocus?.focus?.()}session=null};
 const node=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
 function status(text,state){if(!root)return;const line=root.querySelector('.ma-status');line.dataset.state=state;root.querySelectorAll('[data-ma-reports],[data-ma-athletes]').forEach(b=>b.disabled=state!=='ready');line.querySelector('.ma-status-text').textContent=text;}
 function display(data){
  const grid=root.querySelector('.ma-grid');grid.replaceChildren();
  for(const [id,label,desc] of modules){const card=node('div','ma-card');card.dataset.metric=id;const v=data.metrics?.[id];card.append(node('div','ma-label',label),node('div','ma-value',typeof v==='number'&&Number.isFinite(v)?v.toLocaleString():'—'),node('div','ma-sub',desc));grid.append(card)}
  const growth=Array.isArray(data.growth)?data.growth.filter(p=>typeof p.day==='string'&&Number.isFinite(p.total)):[];
  const plot=root.querySelector('.ma-chart');plot.replaceChildren();
  if(growth.length){
   const max=Math.max(1,...growth.map(p=>p.total));const ns='http://www.w3.org/2000/svg';
   const path=document.createElementNS(ns,'polyline');path.setAttribute('points',growth.map((p,i)=>[8+i*284/Math.max(1,growth.length-1),104-94*p.total/max].join(',')).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','var(--mile-accent,var(--orange,currentColor))');path.setAttribute('stroke-width','2.5');path.setAttribute('vector-effect','non-scaling-stroke');path.setAttribute('stroke-linejoin','round');plot.append(path);
   root.querySelector('.ma-chart-labels').replaceChildren(node('span','',growth[0].day),node('span','',growth.at(-1).day));root.querySelector('.ma-growth-summary').textContent='Registered members at period end: '+growth.at(-1).total.toLocaleString();
  }else{root.querySelector('.ma-growth-summary').textContent='Growth data unavailable';root.querySelector('.ma-chart-labels').replaceChildren()}
  const webhook=data.metrics?.last_garmin_webhook_at;const d=webhook?new Date(webhook):null;
  root.querySelector('.ma-health').textContent=d&&!isNaN(d.getTime())?'Last Garmin webhook: '+d.toLocaleString():'No Garmin webhook recorded';
  root.querySelector('.ma-freshness').textContent='Date range: UTC calendar days · updated '+new Date(data.generated_at).toLocaleTimeString();
 }
 async function load(){
  if(!root)return;managementController?.abort();root.querySelector('.ma-management')?.replaceChildren();controller?.abort();const request=new AbortController();controller=request;
  const current=root,credential=session,selected=days;
  root.querySelector('.ma-grid').replaceChildren();root.querySelector('.ma-chart').replaceChildren();root.querySelector('.ma-chart-labels').replaceChildren();root.querySelector('.ma-growth-summary').textContent='Loading athlete growth…';root.querySelector('.ma-health').textContent='Checking latest Garmin webhook…';root.querySelector('.ma-freshness').textContent='';status('Loading live overview','loading');
  root.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.days)===days)));
  try{
   const r=await fetch(base+'/functions/v1/mile-admin-overview?days='+selected,{headers:{apikey:key,Authorization:'Bearer '+credential},signal:request.signal,cache:'no-store'});
   if(root!==current||request.signal.aborted||credential!==token()){if(root===current&&credential!==token())close();return}
   if(!r.ok){status(r.status===401||r.status===403?'Administrator access could not be verified':'Live overview unavailable — retry','error');return}
   const data=await r.json();
   if(root!==current||request.signal.aborted||credential!==token())return;
   if(data.days!==selected||!data.metrics||!Array.isArray(data.growth))throw Error('Invalid overview');
   display(data);status('Overview data connected','ready');
  }catch(e){if(root===current&&!request.signal.aborted)status('Live overview unavailable — retry','error')}
 }

 const formatDate=value=>{if(!value)return 'Not recorded';const d=new Date(value);return Number.isNaN(d.getTime())?'Not recorded':d.toLocaleString()};
 const mgmtUrl=base+'/functions/v1/mile-admin-management';
 function optionSelect(items,label){const el=node('select');el.setAttribute('aria-label',label);for(const [val,txt] of items){const opt=node('option','',txt);opt.value=val;el.append(opt)}return el}
 function openManagement(view){
  if(!root||root.querySelector('.ma-status').dataset.state!=='ready')return;
  const holder=root.querySelector('.ma-management');holder.replaceChildren();
  const current=root,credential=session;
  const alive=()=>root===current&&credential===token()&&holder.isConnected&&holder.contains(form);
  const title=node('h2','',view==='athletes'?'Athlete Management':'Feedback Centre');
  const heading=node('div','ma-toolbar');heading.append(title);const back=node('button','','‹ Overview');back.type='button';heading.append(back);holder.append(heading);
  const form=node('form','ma-controls'),search=node('input');search.type='search';search.maxLength=100;search.placeholder=view==='athletes'?'Search name or username':'Search reports';search.setAttribute('aria-label',search.placeholder);
  const filter=view==='athletes'?optionSelect([['all','All athletes'],['garmin','Garmin linked'],['no_garmin','No Garmin record'],['premium','Premium']],'Athlete filter'):optionSelect([['all','All statuses'],['new','New'],['investigating','Investigating'],['fixed','Fixed'],['verified','Verified']],'Report status');
  const kind=optionSelect([['all','All reports'],['bug','Bugs'],['feedback','Feedback']],'Report type');const submit=node('button','','Search');submit.type='submit';
  form.append(search,filter);if(view==='feedback')form.append(kind);form.append(submit);holder.append(form);
  const message=node('p','ma-sub');message.setAttribute('role','status');const counts=node('p','ma-sub');const list=node('div');list.dataset.maList=view;
  const pagination=node('div','ma-pagination'),prev=node('button','','‹ Previous'),next=node('button','','Next ›'),pageLabel=node('span','ma-sub');prev.type=next.type='button';pagination.append(prev,pageLabel,next);
  holder.append(message,counts,list,pagination);let offset=0;
  const headers=()=>({apikey:key,Authorization:'Bearer '+credential,'Content-Type':'application/json'});
  async function get(){
   if(!alive())return;managementController?.abort();const request=new AbortController();managementController=request;
   const params=new URLSearchParams({view,offset:String(offset),q:search.value});if(view==='athletes')params.set('filter',filter.value);else{params.set('status',filter.value);params.set('kind',kind.value)}
   list.replaceChildren();counts.textContent='';message.textContent='Loading…';prev.disabled=next.disabled=true;
   try{
    const r=await fetch(mgmtUrl+'?'+params,{headers:headers(),signal:request.signal,cache:'no-store'});if(!alive()||request.signal.aborted)return;
    if(!r.ok){message.textContent=r.status===401||r.status===403?'Administrator access could not be verified':'Unable to load records. Search to retry.';return}
    const data=await r.json();if(!alive()||request.signal.aborted)return;if(!Array.isArray(data.rows))throw Error('Invalid response');
    message.textContent=data.rows.length?data.rows.length+' records on this page':'No matching records';
    if(view==='feedback'&&Array.isArray(data.counts))counts.textContent=['new','investigating','fixed','verified'].map(k=>k[0].toUpperCase()+k.slice(1)+': '+(data.counts.find(c=>c.status===k)?.count??0)).join(' · ');
    pageLabel.textContent='Page '+(Math.floor(offset/25)+1);prev.disabled=offset===0;next.disabled=!data.has_more;
    for(const row of data.rows){const card=node('article','ma-card ma-item');
     if(view==='athletes'){
      card.append(node('strong','',row.display_name||row.username||'Profile not created'),node('div','ma-sub',row.username?'@'+row.username:'No username'),node('div','ma-sub','Joined: '+formatDate(row.joined_at)),node('div','ma-sub','Sport: '+(row.primary_sport||'Not set')),node('div','ma-sub','Garmin: '+(row.garmin?'Connection recorded':'No connection record')+' · '+(row.premium?'Premium':'No active premium membership')),node('div','ma-sub','Garmin activities (30 days): '+(Number.isFinite(row.activities_30d)?row.activities_30d:'—')),node('div','ma-sub','Last training sync: '+formatDate(row.last_training_sync)));
     }else{
      card.append(node('strong','',(row.kind==='bug'?'Bug':'Feedback')+' · '+(row.page||'Other')),node('div','ma-sub','Submitted: '+formatDate(row.created_at)+' · '+(row.display_name||row.username||'No profile')),node('p','',row.description||'No description'));
      const details=node('details'),summary=node('summary','','Technical details');details.append(summary,node('div','ma-sub','Version: '+(row.app_version||'Not recorded')),node('div','ma-sub','Device: '+(row.device_info||'Not recorded')),node('div','ma-sub','Updated: '+formatDate(row.updated_at)));card.append(details);
      const controls=node('div','ma-controls'),select=optionSelect([['new','New'],['investigating','Investigating'],['fixed','Fixed'],['verified','Verified']],'Update report status');select.value=row.status;const save=node('button','','Save status');save.type='button';save.disabled=true;const result=node('div','ma-sub');result.setAttribute('aria-live','polite');controls.append(select,save);card.append(controls,result);
      select.addEventListener('change',()=>{save.disabled=select.value===row.status});
      save.addEventListener('click',async()=>{
       if(!alive()||save.disabled||!card.isConnected)return;save.disabled=select.disabled=true;result.textContent='Saving…';
       try{const res=await fetch(mgmtUrl+'?view=feedback',{method:'PATCH',headers:headers(),body:JSON.stringify({id:row.id,status:select.value,expected_status:row.status})});if(!alive()||!card.isConnected)return;
        if(!res.ok){result.textContent=res.status===409?'Report changed — search to reload.':'Status was not saved.';return}
        const data=await res.json();if(!alive()||!card.isConnected)return;if(data.report?.status!==select.value)throw Error('Status not confirmed');row.status=data.report.status;result.textContent='Status saved';await get();
       }catch{if(alive()&&card.isConnected)result.textContent='Status was not saved.'}finally{if(alive()&&card.isConnected){select.disabled=false;save.disabled=select.value===row.status}}
      });
     }list.append(card)}
   }catch{if(alive()&&!request.signal.aborted)message.textContent='Unable to load records. Search to retry.'}
  }
  back.addEventListener('click',()=>{managementController?.abort();holder.replaceChildren();root?.querySelector(view==='athletes'?'[data-ma-athletes]':'[data-ma-reports]')?.focus()});
  form.addEventListener('submit',e=>{e.preventDefault();offset=0;get()});filter.addEventListener('change',()=>{offset=0;get()});kind.addEventListener('change',()=>{offset=0;get()});prev.addEventListener('click',()=>{offset=Math.max(0,offset-25);get()});next.addEventListener('click',()=>{offset+=25;get()});
  get();search.focus();holder.scrollIntoView({block:'start'});
 }
 window.mileBetaAdmin=function(){
  if(!window.mileBetaIsAdmin?.()||!token())return;
  if(root){root.focus();return}
  session=token();returnFocus=document.activeElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  root=node('section');root.id='mile-admin-centre';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','ma-title');root.tabIndex=-1;
  root.innerHTML='<div class="ma-shell"><header class="ma-header"><span class="ma-brand">MILE.</span><button data-ma-close>‹ Settings</button></header><div class="ma-eyebrow">ADMINISTRATION</div><h1 id="ma-title">Admin Centre</h1><div class="ma-sub">Monitor your MILE platform.</div><div class="ma-status" role="status"><span class="ma-dot"></span><span class="ma-status-text">Loading live overview</span></div><div class="ma-toolbar"><h2 style="margin:0">Overview</h2><div class="ma-range" aria-label="Date range"><button data-days="7">Last 7 days</button><button data-days="30">30 days</button><button data-days="90">90 days</button></div></div><div class="ma-grid"></div><section class="ma-card ma-section"><h2>Athlete growth</h2><div class="ma-growth-summary ma-sub"></div><svg class="ma-chart" viewBox="0 0 300 112" preserveAspectRatio="none" role="img" aria-label="Cumulative registered athletes over selected period"></svg><div class="ma-chart-labels"></div></section><section class="ma-card ma-section"><h2>System health</h2><div class="ma-health ma-sub"></div><div class="ma-freshness ma-sub"></div><button data-ma-refresh style="margin-top:12px">Refresh overview</button></section><section class="ma-section"><h2>Management</h2><button class="ma-module" data-ma-athletes>Athlete Management <span>›</span></button><button class="ma-module" data-ma-reports>Beta reports &amp; feedback <span>›</span></button><section class="ma-management" aria-label="Management details"></section></section></div>';
  root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ma-close')){close();window.mileV3Go?.('settings');return}if(b.dataset.days){days=Number(b.dataset.days);load();return}if(b.hasAttribute('data-ma-refresh'))load();if(b.hasAttribute('data-ma-athletes')&&!b.disabled)openManagement('athletes');if(b.hasAttribute('data-ma-reports')&&!b.disabled)openManagement('feedback')});
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('mile-beta-feedback-overlay'))close();if(e.key==='Tab'){const list=[...root.querySelectorAll('button')];if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus()}}});
  document.body.append(root);root.querySelector('[data-ma-close]').focus();load();
 };
 window.addEventListener('storage',()=>{if(root&&session!==token())close()});
 document.addEventListener('visibilitychange',()=>{if(root&&!document.hidden){if(session!==token())close();else load()}});
})();
