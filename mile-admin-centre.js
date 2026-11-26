/* Batch 80.1: permanent admin overview. Data is authorised by the server. */
(() => {
 'use strict';
 const base='https://mgixvokjlytjuypzcfzz.supabase.co';
 const key='sb_publishable_gIQO8rNBD9kKQpQdky0-7w_2A55HzO8';
 const token=()=>localStorage.getItem('av-token')||sessionStorage.getItem('av-token');
 const css=document.createElement('style');
 css.textContent=`
 #mile-admin-centre{position:fixed;inset:0;z-index:2147483638;background:var(--bg,#101414);color:var(--mile-ink,var(--text,#eee));overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scroll-behavior:auto!important;font:inherit;padding:env(safe-area-inset-top,0px) 10px calc(16px + env(safe-area-inset-bottom,0px));box-sizing:border-box}
 #mile-admin-centre *{box-sizing:border-box}
 #mile-admin-centre .ma-shell{max-width:850px;margin:auto;padding:9px 0 16px}
 #mile-admin-centre .ma-header{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px}
 #mile-admin-centre .ma-brand{font-weight:900;letter-spacing:-.05em;font-size:22px}
 #mile-admin-centre .ma-eyebrow{font-size:10px;letter-spacing:.15em;font-weight:800;opacity:.7}
 #mile-admin-centre h1{font-size:22px;margin:3px 0 4px;letter-spacing:-.035em}
 #mile-admin-centre h2{font-size:14px;margin:0 0 7px}
 #mile-admin-centre .ma-sub{font-size:11px;opacity:.78;line-height:1.3}
 #mile-admin-centre button{font:inherit;color:inherit;background:var(--mile-surface-raised,var(--panel2,#252b2b));border:1px solid var(--mile-stroke,var(--line,#495050));border-radius:9px;cursor:pointer;padding:5px 9px;min-height:36px;font-size:12px}
 #mile-admin-centre button[aria-pressed=true]{border-color:var(--mile-accent,var(--orange,#b9f576));box-shadow:inset 0 -2px var(--mile-accent,var(--orange,#b9f576));font-weight:750}
 #mile-admin-centre .ma-range{display:flex;gap:6px;flex-wrap:wrap}
 #mile-admin-centre .ma-status{display:flex;align-items:center;gap:6px;font-size:11px;margin:8px 0}
 #mile-admin-centre .ma-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none}
 #mile-admin-centre .ma-status[data-state=ready] .ma-dot{background:#55b87a}
 #mile-admin-centre .ma-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:7px 0}
 #mile-admin-centre .ma-card{border:1px solid var(--mile-stroke,var(--line,#495050));background:var(--mile-surface,var(--panel,#1a2020));border-radius:9px;padding:8px;min-width:0}
 #mile-admin-centre .ma-value{font-size:19px;line-height:1.15;font-weight:800;font-variant-numeric:tabular-nums;margin:0;letter-spacing:-.035em}
 #mile-admin-centre .ma-label{font-size:11px;font-weight:700;min-width:0;overflow-wrap:anywhere}
 #mile-admin-centre .ma-section{margin:8px 0}
 #mile-admin-centre .ma-chart{width:100%;height:78px;display:block;overflow:visible}
 #mile-admin-centre .ma-chart-labels{display:flex;justify-content:space-between;font-size:11px;opacity:.75}
 #mile-admin-centre .ma-toolbar{display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-top:9px}
 #mile-admin-centre .ma-module{display:flex;width:100%;justify-content:space-between;align-items:center;text-align:left}

 #mile-admin-centre .ma-management{margin-top:8px;overflow-anchor:none;scroll-margin-top:8px}
 #mile-admin-centre .ma-management:empty{display:none}
 #mile-admin-centre .ma-management:not(:empty){min-height:calc(100vh - 38px);min-height:calc(100dvh - 38px)}
 #mile-admin-centre .ma-management>.ma-toolbar:first-child{margin-top:0;min-height:36px}
 #mile-admin-centre .ma-grid>.ma-card,#mile-admin-centre .ma-insight-grid>.ma-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:3px 5px;min-height:48px}
 #mile-admin-centre .ma-grid .ma-sub,#mile-admin-centre .ma-insight-grid .ma-sub{grid-column:1/-1}
 #mile-admin-centre .ma-grid .ma-value,#mile-admin-centre .ma-insight-grid .ma-value{text-align:right;overflow-wrap:anywhere;max-width:100%}
 #mile-admin-centre .ma-module{margin:4px 0;min-height:38px}
 #mile-admin-centre .ma-management input,#mile-admin-centre .ma-management select{background:var(--mile-surface-raised,var(--panel2,#252b2b));color:inherit;border:1px solid var(--mile-stroke,var(--line,#495050));border-radius:9px;padding:6px 8px;min-height:36px;font:inherit;font-size:16px;min-width:0;max-width:100%}
 #mile-admin-centre .ma-controls{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0}
 #mile-admin-centre .ma-controls input{flex:1 1 150px}
 #mile-admin-centre .ma-controls select{flex:1 1 110px}
 #mile-admin-centre .ma-item{margin:5px 0;overflow-wrap:anywhere}
 #mile-admin-centre .ma-item p{white-space:pre-wrap;margin:6px 0}
 #mile-admin-centre .ma-item details{margin:5px 0;font-size:12px}
 #mile-admin-centre .ma-item summary{cursor:pointer}
 #mile-admin-centre .ma-pagination{display:flex;align-items:center;justify-content:space-between;gap:6px}
 #mile-admin-centre [hidden]{display:none!important}

 #mile-admin-centre .ma-insight-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:6px 0}
 #mile-admin-centre .ma-insight-grid .ma-value{font-size:19px}
 #mile-admin-centre .ma-trend-chart{display:block;width:100%;height:112px}
 #mile-admin-centre .ma-legend{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;margin:5px 0}
 #mile-admin-centre .ma-legend span::before{content:"";display:inline-block;width:9px;height:9px;margin-right:5px;background:currentColor;border-radius:2px}
 #mile-admin-centre .ma-legend .ma-garmin{color:var(--mile-accent,var(--orange,#b9f576))}
 #mile-admin-centre .ma-status-row{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--mile-stroke,var(--line,#495050));font-size:12px;overflow-wrap:anywhere}
 @media(min-width:650px){#mile-admin-centre .ma-insight-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
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
 let root,controller,managementController,session,days=7,oldOverflow='',returnFocus,overviewScroll=0;
 const close=()=>{controller?.abort();managementController?.abort();if(root){root.remove();document.body.style.overflow=oldOverflow;root=null;const target=returnFocus?.isConnected&&returnFocus.getClientRects().length?returnFocus:document.querySelector('#mile-fixed-mobile-nav [data-mile-page="more"]:not([hidden])');target?.focus?.({preventScroll:true})}session=null;returnFocus=null};
 const node=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
 function status(text,state){if(!root)return;const line=root.querySelector('.ma-status');line.dataset.state=state;root.querySelectorAll('[data-ma-reports],[data-ma-athletes],[data-ma-analytics],[data-ma-health],[data-ma-announcements],[data-ma-security],[data-ma-invitations]').forEach(b=>b.disabled=state!=='ready');line.querySelector('.ma-status-text').textContent=text;}
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

 function enterModule(holder,heading){heading.tabIndex=-1;heading.focus({preventScroll:true});const top=root.scrollTop+holder.getBoundingClientRect().top-root.getBoundingClientRect().top-8;root.scrollTop=Math.max(0,top)}
 function exitModule(holder,selector){managementController?.abort();const current=root,saved=overviewScroll;if(!current)return;holder.replaceChildren();const button=current.querySelector(selector);const restore=()=>{if(root!==current||holder.childElementCount)return;current.scrollTop=Math.max(0,Math.min(saved,current.scrollHeight-current.clientHeight))};restore();button?.focus({preventScroll:true});restore();requestAnimationFrame(restore)}
 const formatDate=value=>{if(!value)return 'Not recorded';const d=new Date(value);return Number.isNaN(d.getTime())?'Not recorded':d.toLocaleString()};
 const mgmtUrl=base+'/functions/v1/mile-admin-management';
 function optionSelect(items,label){const el=node('select');el.setAttribute('aria-label',label);for(const [val,txt] of items){const opt=node('option','',txt);opt.value=val;el.append(opt)}return el}
 function openManagement(view){
  if(!root||root.querySelector('.ma-status').dataset.state!=='ready')return;
  const holder=root.querySelector('.ma-management');if(!holder.childElementCount)overviewScroll=root.scrollTop;holder.replaceChildren();
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
  back.addEventListener('click',()=>{exitModule(holder,view==='athletes'?'[data-ma-athletes]':'[data-ma-reports]')});
  form.addEventListener('submit',e=>{e.preventDefault();offset=0;get()});filter.addEventListener('change',()=>{offset=0;get()});kind.addEventListener('change',()=>{offset=0;get()});prev.addEventListener('click',()=>{offset=Math.max(0,offset-25);get()});next.addEventListener('click',()=>{offset+=25;get()});
  get();enterModule(holder,title);
 }

 function openInsights(view){
  if(!root||root.querySelector('.ma-status').dataset.state!=='ready')return;
  managementController?.abort();const holder=root.querySelector('.ma-management');if(!holder.childElementCount)overviewScroll=root.scrollTop;holder.replaceChildren();
  const current=root,credential=session,usage=view==='analytics';let selected=days;
  const heading=node('div','ma-toolbar'),title=node('h2','',usage?'Usage Analytics':'Integrations & System Health'),back=node('button','','‹ Overview');back.type='button';heading.append(title,back);holder.append(heading);
  const filters=node('div','ma-range');filters.setAttribute('aria-label','Analytics date range');
  const body=node('div');body.dataset.maInsights=view;const statusLine=node('p','ma-sub');statusLine.setAttribute('role','status');const refresh=node('button','','Refresh data');refresh.type='button';
  const alive=()=>root===current&&credential===token()&&holder.isConnected&&holder.contains(body);
  for(const n of [7,30,90]){const button=node('button','',n+' days');button.type='button';button.dataset.insightDays=n;button.addEventListener('click',()=>{selected=n;get()});filters.append(button)}
  holder.append(filters,statusLine,body,refresh);
  function cards(values,items){const grid=node('div','ma-insight-grid');for(const [id,label,description] of items){const card=node('div','ma-card');card.dataset.insightMetric=id;const val=values?.[id];card.append(node('div','ma-label',label),node('div','ma-value',Number.isFinite(val)?val.toLocaleString():'—'),node('div','ma-sub',description));grid.append(card)}body.append(grid)}
  function trendChart(points){
   const section=node('section','ma-card ma-section');section.append(node('h2','','Daily recorded activity'));
   const legend=node('div','ma-legend');legend.append(node('span','ma-garmin','Garmin activities'),node('span','','Social posts'));section.append(legend);
   if(!Array.isArray(points)||!points.length){section.append(node('p','ma-sub','No trend records available'));body.append(section);return}
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('class','ma-trend-chart');svg.setAttribute('viewBox','0 0 320 160');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');svg.setAttribute('aria-label','Daily Garmin activities and social posts');
   const max=Math.max(1,...points.flatMap(p=>[p.garmin,p.posts]).filter(Number.isFinite)),step=304/points.length,w=Math.max(.5,step*.36);
   for(let i=0;i<points.length;i++){const p=points[i];for(const [j,key] of ['garmin','posts'].entries()){const value=Number.isFinite(p[key])&&p[key]>=0?p[key]:0;const bar=document.createElementNS(ns,'rect');bar.setAttribute('x',8+i*step+j*w);bar.setAttribute('y',150-138*value/max);bar.setAttribute('width',w);bar.setAttribute('height',138*value/max);bar.setAttribute('fill',j?'currentColor':'var(--mile-accent,var(--orange,currentColor))');const t=document.createElementNS(ns,'title');t.textContent=p.day+': '+value+' '+key;bar.append(t);svg.append(bar)}}
   section.append(svg);const labels=node('div','ma-chart-labels');labels.append(node('span','',points[0].day),node('span','',points.at(-1).day));section.append(labels);
   const detail=node('details'),summary=node('summary','','View daily totals');detail.append(summary);for(const p of points){const row=node('div','ma-status-row');row.append(node('span','',p.day),node('span','',p.garmin+' Garmin · '+p.posts+' posts'));detail.append(row)}section.append(detail);body.append(section)
  }
  function statusGroup(title,rows){const section=node('section','ma-card ma-section');section.append(node('h2','',title));if(!Array.isArray(rows)||!rows.length)section.append(node('p','ma-sub','No records in this period'));else for(const r of rows){const row=node('div','ma-status-row');row.append(node('span','',r.status),node('strong','',Number.isFinite(r.count)?r.count.toLocaleString():'—'));section.append(row)}body.append(section)}
  async function get(){
   if(!alive())return;managementController?.abort();const request=new AbortController();managementController=request;
   const requested=selected;body.replaceChildren();statusLine.textContent='Loading live data…';filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.insightDays)===requested)));
   try{const r=await fetch(base+'/functions/v1/mile-admin-analytics?days='+requested,{headers:{apikey:key,Authorization:'Bearer '+credential},signal:request.signal,cache:'no-store'});if(!alive()||request.signal.aborted)return;
    if(!r.ok){statusLine.textContent=r.status===401||r.status===403?'Administrator access could not be verified':'Data unavailable — refresh to retry';return}
    const data=await r.json();if(!alive()||request.signal.aborted)return;if(data.days!==requested||!data.usage||!data.health)throw Error('Invalid analytics response');
    if(usage){
     body.append(node('p','ma-sub','Recorded events are an activity proxy, not unique app visits or retention. Some events are generated by Garmin automatically.'));
     cards(data.usage,[['members_with_recorded_events','Members with recorded events','Distinct registered members in period'],['registered_members','Registered members','Current total'],['garmin_activities','Garmin activities','In selected period'],['posts','Social posts','In selected period'],['likes','Activity likes','In selected period'],['comments','Activity comments','In selected period'],['messages','Messages','Non-deleted in selected period'],['challenge_entries','Challenge entries','Created in selected period'],['accounts_with_latest_sync','Training sync','Accounts with latest update in period']]);
     trendChart(data.trend);const gaps=node('section','ma-card ma-section');gaps.append(node('h2','','App engagement'),node('p','ma-sub','Page views, session duration, feature visits and cohort retention are not currently measured. No values have been estimated.'));body.append(gaps);
    }else{
     cards(data.health,[['connection_records','Garmin connections','Accounts with a stored connection'],['expired_token_records','Past token expiry','May require refresh; not a disconnect count'],['unknown_expiry_records','Unknown expiry','Stored tokens without expiry'],['webhook_events','Webhook events','Received in selected period'],['activity_files','Activity files','Received in selected period']]);
     const timestamps=node('section','ma-card ma-section');timestamps.append(node('h2','','Latest recorded events'));for(const [label,value] of [['Garmin webhook',data.health.last_webhook],['Garmin activity received',data.health.last_activity_received],['Training sync',data.health.last_training_sync]]){const row=node('div','ma-status-row');row.append(node('span','',label),node('strong','',formatDate(value)));timestamps.append(row)}body.append(timestamps);
     statusGroup('Webhook processing status',data.webhook_status);statusGroup('Activity file processing status',data.file_status);
     body.append(node('p','ma-sub','Database records only. Endpoint uptime and client-side errors are not currently measured.'));
    }statusLine.textContent='Live data · UTC calendar days · '+formatDate(data.generated_at);
   }catch{if(alive()&&!request.signal.aborted)statusLine.textContent='Data unavailable — refresh to retry'}
  }
  back.addEventListener('click',()=>{exitModule(holder,usage?'[data-ma-analytics]':'[data-ma-health]')});refresh.addEventListener('click',get);get();enterModule(holder,title)
 }

 function openRelease(view){
  if(!root||root.querySelector('.ma-status').dataset.state!=='ready')return;
  managementController?.abort();const holder=root.querySelector('.ma-management');if(!holder.childElementCount)overviewScroll=root.scrollTop;holder.replaceChildren();
  const current=root,credential=session,announcements=view==='announcements';let offset=0,busy=false,audience=null;
  const heading=node('div','ma-toolbar'),title=node('h2','',announcements?'Announcements & Releases':'Security & Audit Logs'),back=node('button','','‹ Overview');back.type='button';heading.append(title,back);holder.append(heading);
  const statusLine=node('p','ma-sub');statusLine.setAttribute('role','status');const body=node('div');body.dataset.maRelease=view;
  const form=node('form','ma-card ma-section'),fields=node('div','ma-controls'),subject=node('input'),message=node('textarea'),kind=optionSelect([['announcement','Announcement'],['release','Release notes']],'Announcement type');
  subject.required=true;subject.minLength=3;subject.maxLength=100;subject.placeholder='Announcement title';subject.setAttribute('aria-label','Announcement title');
  message.required=true;message.minLength=5;message.maxLength=600;message.placeholder='Message to athletes';message.setAttribute('aria-label','Announcement message');message.rows=4;message.style.width='100%';message.style.cssText+=';background:var(--panel2);color:inherit;border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit';
  const save=node('button','','Save draft');save.type='submit';save.disabled=true;fields.append(kind,subject);form.append(node('h2','','Create announcement'),node('p','ma-sub','Drafts are private until you explicitly publish. Publication creates an in-app notification for each current beta member.'),fields,message,save);
  const refresh=node('button','','Refresh data');refresh.type='button';
  const pagination=node('div','ma-pagination'),prev=node('button','','‹ Previous'),next=node('button','','Next ›'),pageLabel=node('span','ma-sub');prev.type=next.type='button';pagination.append(prev,pageLabel,next);
  if(announcements)holder.append(form);holder.append(statusLine,body,pagination,refresh);
  const alive=()=>root===current&&credential===token()&&holder.isConnected&&holder.contains(body);
  const endpoint=base+'/functions/v1/mile-admin-release?view='+view;
  const headers=()=>({apikey:key,Authorization:'Bearer '+credential,'Content-Type':'application/json'});
  async function mutate(payload){
   if(!alive()||busy)return false;busy=true;save.disabled=true;refresh.disabled=true;
   body.querySelectorAll('button').forEach(b=>b.disabled=true);statusLine.textContent='Saving…';
   try{const r=await fetch(endpoint,{method:'POST',headers:headers(),body:JSON.stringify(payload)});if(!alive())return false;if(!r.ok){statusLine.textContent=r.status===409?'Draft changed — refresh before retrying':'Action not confirmed — refresh before retrying';return false}
    const data=await r.json();if(!alive())return false;
    if(!data.announcement?.id||data.announcement.status!==(payload.action==='draft'?'draft':'published'))throw Error('Action not confirmed');
    if(payload.action==='draft'){subject.value='';message.value='';offset=0}
    await get();return true;
   }catch{if(alive())statusLine.textContent='Action not confirmed — refresh before retrying';return false}
   finally{busy=false;if(alive()){refresh.disabled=false;save.disabled=audience===null;body.querySelectorAll('button').forEach(b=>b.disabled=false)}}
  }
  async function get(){
   if(!alive())return;managementController?.abort();const request=new AbortController();managementController=request;
   body.replaceChildren();audience=null;save.disabled=true;prev.disabled=next.disabled=true;statusLine.textContent='Loading…';
   try{const r=await fetch(endpoint+'&offset='+offset,{headers:headers(),signal:request.signal,cache:'no-store'});if(!alive()||request.signal.aborted)return;
    if(!r.ok){statusLine.textContent=r.status===401||r.status===403?'Administrator access could not be verified':'Data unavailable — refresh to retry';return}
    const data=await r.json();if(!alive()||request.signal.aborted)return;if(!Array.isArray(data.rows))throw Error('Invalid response');
    if(announcements){
     audience=Number.isFinite(data.audience)?data.audience:null;save.disabled=audience===null;
     body.append(node('p','ma-sub',audience===null?'Current audience unavailable':'Current audience: '+audience+' registered members (recalculated at publication)'));
     for(const row of data.rows){const card=node('article','ma-card ma-item');card.append(node('strong','',row.title),node('div','ma-sub',(row.kind==='release'?'Release notes':'Announcement')+' · '+row.status+' · '+formatDate(row.created_at)),node('p','',row.body));
      if(row.status==='published')card.append(node('div','ma-sub','Published: '+formatDate(row.published_at)+' · '+(Number.isFinite(row.recipient_count)?row.recipient_count:'—')+' recipient notifications created'));
      else if(row.status==='draft'&&audience!==null){const publish=node('button','','Publish to athletes');publish.type='button';publish.addEventListener('click',()=>{if(confirm('Publish "'+row.title+'" to all current registered beta members? This creates in-app notifications and cannot be undone.'))mutate({action:'publish',id:row.id,confirm:true})});card.append(publish)}
      body.append(card)}
    }else{
     const grid=node('div','ma-insight-grid');for(const [key,label] of [['admin_accounts','Admin accounts'],['public_tables_without_rls','Public tables without RLS'],['recorded_admin_actions','Recorded admin actions']]){const card=node('div','ma-card');card.append(node('div','ma-label',label),node('div','ma-value',Number.isFinite(data.security?.[key])?data.security[key]:'—'));grid.append(card)}body.append(grid);
     body.append(node('p','ma-sub','Audit coverage starts with actions performed through the new endpoints. This is not a complete historical security audit. Account deletion, role changes and suspension are not enabled.'));
     for(const row of data.rows){const card=node('article','ma-card ma-item');card.append(node('strong','',row.action),node('div','ma-sub',(row.display_name||row.username||'Administrator')+' · '+formatDate(row.created_at)),node('div','ma-sub','Target: '+(row.target_id||'Not recorded')));
      if(row.detail&&typeof row.detail==='object'){const details=node('details'),summary=node('summary','','Change details');details.append(summary,node('p','',JSON.stringify(row.detail)));card.append(details)}body.append(card)}
    }
    if(!data.rows.length)body.append(node('p','ma-sub','No records yet'));
    pageLabel.textContent='Page '+(Math.floor(offset/25)+1);prev.disabled=offset===0;next.disabled=!data.has_more;statusLine.textContent='Live data connected';
   }catch{if(alive()&&!request.signal.aborted)statusLine.textContent='Data unavailable — refresh to retry'}
  }
  form.addEventListener('submit',e=>{e.preventDefault();if(!save.disabled)mutate({action:'draft',title:subject.value,body:message.value,kind:kind.value})});
  back.addEventListener('click',()=>{exitModule(holder,announcements?'[data-ma-announcements]':'[data-ma-security]')});
  refresh.addEventListener('click',()=>{if(!busy)get()});prev.addEventListener('click',()=>{if(!busy){offset=Math.max(0,offset-25);get()}});next.addEventListener('click',()=>{if(!busy){offset+=25;get()}});
  get();enterModule(holder,title)
 }
 function openInvitations(){
 if(!root||root.querySelector('.ma-status').dataset.state!=='ready')return;
 const holder=root.querySelector('.ma-management');overviewScroll=root.scrollTop;managementController?.abort();const request=new AbortController();managementController=request;holder.replaceChildren();
 const current=root,credential=session;const alive=()=>root===current&&credential===token()&&!request.signal.aborted;
 const heading=node('h2','','Invitation Management'),back=node('button','','‹ Back'),bar=node('div','ma-toolbar');bar.append(heading,back);holder.append(bar);
 const form=node('form','ma-card'),fields=node('div','ma-controls'),label=node('input'),max=node('input'),daysInput=node('input'),email=node('input');
 label.placeholder='Invitation label';label.required=true;label.maxLength=100;label.setAttribute('aria-label','Invitation label');
 max.type='number';max.min=1;max.max=100;max.value=1;max.required=true;max.setAttribute('aria-label','Maximum uses');
 daysInput.type='number';daysInput.min=1;daysInput.max=365;daysInput.value=30;daysInput.required=true;daysInput.setAttribute('aria-label','Expiry days');
 email.type='email';email.placeholder='Recipient email (optional)';email.setAttribute('aria-label','Recipient email');
 fields.append(label,max,daysInput,email);const create=node('button','','Generate invitation');create.type='submit';form.append(node('p','ma-sub','Maximum uses · expiry in days · optional verified email restriction'),fields,create);holder.append(form);
 const statusLine=node('p','ma-sub');statusLine.setAttribute('role','status');const secret=node('div','ma-card');secret.hidden=true;const list=node('div');const prev=node('button','','Previous'),next=node('button','','Next'),refresh=node('button','','Refresh');holder.append(statusLine,secret,list,prev,next,refresh);let offset=0,busy=false;
 const call=async(body)=>{const res=await fetch(base+'/functions/v1/mile-admin-invitations'+(body?'':'?offset='+offset),{method:body?'POST':'GET',headers:{apikey:key,Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:request.signal});if(!res.ok)throw Error('Invitation service unavailable');return res.json()};
 async function load(){if(!alive())return;statusLine.textContent='Loading invitations…';try{const data=await call();if(!alive())return;list.replaceChildren();for(const row of data.rows){const card=node('div','ma-card ma-item');const state=!row.enabled?'Revoked':row.expires_at&&Date.parse(row.expires_at)<=Date.now()?'Expired':row.used_count>=row.max_uses?'Used':'Active';card.append(node('strong','',row.label||'Invitation'),node('p','ma-sub',state+' · '+row.used_count+'/'+row.max_uses+' uses · Expires '+(row.expires_at?formatDate(row.expires_at):'Never')));if(row.recipient_email)card.append(node('p','ma-sub',row.recipient_email));const details=node('details'),summary=node('summary','','Redemption history');details.append(summary);for(const item of row.redemptions||[])details.append(node('p','ma-sub',item.user_id+' · '+formatDate(item.joined_at)));card.append(details);if(row.enabled){const revoke=node('button','','Revoke');revoke.addEventListener('click',async()=>{if(busy||!confirm('Revoke this invitation? Existing members are unaffected.'))return;busy=true;try{await call({action:'revoke',id:row.id});await load()}catch{if(alive())statusLine.textContent='Unable to revoke invitation'}finally{busy=false}});card.append(revoke)}list.append(card)}if(!data.rows.length)list.append(node('p','ma-sub','No invitations on this page'));prev.disabled=offset===0;next.disabled=!data.has_more;statusLine.textContent='Live invitations'}catch{if(alive())statusLine.textContent='Invitation service unavailable — retry'}} 
 form.addEventListener('submit',async(e)=>{e.preventDefault();if(busy||!alive())return;busy=true;create.disabled=true;secret.hidden=true;secret.replaceChildren();try{const data=await call({action:'create',label:label.value,max_uses:Number(max.value),days:Number(daysInput.value),recipient_email:email.value});if(!alive())return;const code=node('p','',data.code),copy=node('button','','Copy code');copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(data.code);copy.textContent='Copied'}catch{copy.textContent='Select and copy code manually'}});const link='https://app.milefitness.com.au/#invite='+encodeURIComponent(data.code);const linkField=node('input');linkField.type='text';linkField.readOnly=true;linkField.value=link;linkField.setAttribute('aria-label','Invitation link');const copyLink=node('button','','Copy invitation link');copyLink.type='button';copyLink.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link);copyLink.textContent='Link copied'}catch{linkField.focus();linkField.select();copyLink.textContent='Select and copy link manually'}});secret.append(node('strong','','Save this code now — shown once'),code,copy,node('p','ma-sub','Share this link to prefill the invitation code on registration.'),linkField,copyLink);secret.hidden=false;offset=0;await load()}catch{if(alive())statusLine.textContent='Unable to create invitation'}finally{busy=false;create.disabled=false}});
 back.addEventListener('click',()=>{secret.replaceChildren();exitModule(holder,'[data-ma-invitations]')});prev.addEventListener('click',()=>{if(!busy){offset=Math.max(0,offset-25);load()}});next.addEventListener('click',()=>{if(!busy){offset+=25;load()}});refresh.addEventListener('click',()=>{if(!busy)load()});enterModule(holder,heading);load();
 }
 window.mileBetaAdmin=function(){
  if(!window.mileBetaIsAdmin?.()||!token())return;
  if(root){root.focus({preventScroll:true});return}
  session=token();returnFocus=document.activeElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  root=node('section');root.id='mile-admin-centre';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','ma-title');root.tabIndex=-1;
  root.innerHTML='<div class="ma-shell"><header class="ma-header"><span class="ma-brand">MILE.</span><button data-ma-close>‹ Back</button></header><div class="ma-eyebrow">ADMINISTRATION</div><h1 id="ma-title">Admin Centre</h1><div class="ma-sub">Monitor your MILE platform.</div><div class="ma-status" role="status"><span class="ma-dot"></span><span class="ma-status-text">Loading live overview</span></div><div class="ma-toolbar"><h2 style="margin:0">Overview</h2><div class="ma-range" aria-label="Date range"><button data-days="7">Last 7 days</button><button data-days="30">30 days</button><button data-days="90">90 days</button></div></div><div class="ma-grid"></div><section class="ma-card ma-section"><h2>Athlete growth</h2><div class="ma-growth-summary ma-sub"></div><svg class="ma-chart" viewBox="0 0 300 112" preserveAspectRatio="none" role="img" aria-label="Cumulative registered athletes over selected period"></svg><div class="ma-chart-labels"></div></section><section class="ma-card ma-section"><h2>System health</h2><div class="ma-health ma-sub"></div><div class="ma-freshness ma-sub"></div><button data-ma-refresh style="margin-top:6px">Refresh overview</button></section><section class="ma-section"><h2>Management</h2><button class="ma-module" data-ma-athletes>Athlete Management <span>›</span></button><button class="ma-module" data-ma-invitations>Invitation Management <span>›</span></button><button class="ma-module" data-ma-reports>Beta reports &amp; feedback <span>›</span></button><button class="ma-module" data-ma-analytics>Usage Analytics <span>›</span></button><button class="ma-module" data-ma-health>Integrations &amp; System Health <span>›</span></button><button class="ma-module" data-ma-announcements>Announcements &amp; Releases <span>›</span></button><button class="ma-module" data-ma-security>Security &amp; Audit Logs <span>›</span></button><section class="ma-management" aria-label="Management details"></section></section></div>';
  root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ma-close')){close();return}if(b.dataset.days){days=Number(b.dataset.days);load();return}if(b.hasAttribute('data-ma-refresh'))load();if(b.hasAttribute('data-ma-athletes')&&!b.disabled)openManagement('athletes');if(b.hasAttribute('data-ma-invitations')&&!b.disabled)openInvitations();if(b.hasAttribute('data-ma-reports')&&!b.disabled)openManagement('feedback');if(b.hasAttribute('data-ma-analytics')&&!b.disabled)openInsights('analytics');if(b.hasAttribute('data-ma-health')&&!b.disabled)openInsights('health');if(b.hasAttribute('data-ma-announcements')&&!b.disabled)openRelease('announcements');if(b.hasAttribute('data-ma-security')&&!b.disabled)openRelease('security')});
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('mile-beta-feedback-overlay'))close();if(e.key==='Tab'){const list=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary')].filter(el=>el.getClientRects().length);if(!list.length)return;if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus()}}});
  document.body.append(root);root.querySelector('[data-ma-close]').focus();load();
 };
 window.addEventListener('storage',()=>{if(root&&session!==token())close()});
 document.addEventListener('visibilitychange',()=>{if(root&&!document.hidden){if(session!==token()||!window.mileBetaIsAdmin?.()){close();return}if(!root.querySelector('.ma-management')?.childElementCount)load()}});
})();
