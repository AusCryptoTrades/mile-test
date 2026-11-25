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
 let root,controller,session,days=7,oldOverflow='',returnFocus;
 const close=()=>{controller?.abort();if(root){root.remove();document.body.style.overflow=oldOverflow;root=null;returnFocus?.focus?.()}session=null};
 const node=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
 function status(text,state){if(!root)return;const line=root.querySelector('.ma-status');line.dataset.state=state;line.querySelector('.ma-status-text').textContent=text;}
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
  if(!root)return;controller?.abort();const request=new AbortController();controller=request;
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
 window.mileBetaAdmin=function(){
  if(!window.mileBetaIsAdmin?.()||!token())return;
  if(root){root.focus();return}
  session=token();returnFocus=document.activeElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  root=node('section');root.id='mile-admin-centre';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','ma-title');root.tabIndex=-1;
  root.innerHTML='<div class="ma-shell"><header class="ma-header"><span class="ma-brand">MILE.</span><button data-ma-close>‹ Settings</button></header><div class="ma-eyebrow">ADMINISTRATION</div><h1 id="ma-title">Admin Centre</h1><div class="ma-sub">Monitor your MILE platform.</div><div class="ma-status" role="status"><span class="ma-dot"></span><span class="ma-status-text">Loading live overview</span></div><div class="ma-toolbar"><h2 style="margin:0">Overview</h2><div class="ma-range" aria-label="Date range"><button data-days="7">Last 7 days</button><button data-days="30">30 days</button><button data-days="90">90 days</button></div></div><div class="ma-grid"></div><section class="ma-card ma-section"><h2>Athlete growth</h2><div class="ma-growth-summary ma-sub"></div><svg class="ma-chart" viewBox="0 0 300 112" preserveAspectRatio="none" role="img" aria-label="Cumulative registered athletes over selected period"></svg><div class="ma-chart-labels"></div></section><section class="ma-card ma-section"><h2>System health</h2><div class="ma-health ma-sub"></div><div class="ma-freshness ma-sub"></div><button data-ma-refresh style="margin-top:12px">Refresh overview</button></section><section class="ma-section"><h2>Management</h2><button class="ma-module" data-ma-reports>Beta reports &amp; feedback <span>›</span></button></section></div>';
  root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ma-close')){close();window.mileV3Go?.('settings');return}if(b.dataset.days){days=Number(b.dataset.days);load();return}if(b.hasAttribute('data-ma-refresh'))load();if(b.hasAttribute('data-ma-reports'))legacyReports?.()});
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('mile-beta-feedback-overlay'))close();if(e.key==='Tab'){const list=[...root.querySelectorAll('button')];if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus()}}});
  document.body.append(root);root.querySelector('[data-ma-close]').focus();load();
 };
 window.addEventListener('storage',()=>{if(root&&session!==token())close()});
 document.addEventListener('visibilitychange',()=>{if(root&&!document.hidden){if(session!==token())close();else load()}});
})();
