/* MILE shared standalone-page header. Used by Challenges and Run Tracker. */
(function(){
'use strict';
const style=document.createElement('style');style.id='mile-shared-header-styles';style.textContent=`
/* Ported from the main MILE .shell>.top header, retaining its class structure. */
html{scroll-padding-top:12px}
body.mile-standalone-page{box-sizing:border-box!important;padding-top:calc(env(safe-area-inset-top,0px) + 12px)!important}
body.mile-standalone-page>.top.mile-standalone-main-header{box-sizing:border-box!important;width:100%!important;max-width:1160px!important;margin:0 auto 22px!important;background:#222!important;border:1px solid #555!important;border-radius:24px!important;padding:15px 18px!important;min-height:92px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;position:relative!important;z-index:2!important;color:#fff!important}
.mile-standalone-main-header .mile-header-identity{min-width:0!important;display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:7px!important}
.mile-standalone-main-header .eyebrow{font-size:10px!important;letter-spacing:4px!important;color:#fff!important;font-weight:800!important;white-space:nowrap!important;line-height:1.2!important}
.mile-standalone-main-header .brand{font-size:39px!important;line-height:1!important;letter-spacing:-2.5px!important;font-style:italic!important;font-weight:950!important;color:#fff!important}
.mile-standalone-main-header .row{display:flex!important;align-items:center!important;gap:9px!important;flex-wrap:nowrap!important;flex-shrink:0!important}
.mile-standalone-main-header .row button{box-sizing:border-box!important;border:0!important;border-radius:14px!important;background:#fff!important;color:#0a0a0a!important;font-size:13px!important;font-weight:800!important;line-height:1.2!important;padding:13px 16px!important;min-height:44px!important;white-space:nowrap!important;cursor:pointer!important}
.mile-standalone-main-header .row .m36-head{border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;overflow:visible!important;display:grid!important;place-items:center!important;min-height:56px!important;width:56px!important;flex:0 0 56px!important}
.mile-standalone-main-header .row .m36-avatar{box-sizing:border-box!important;width:56px!important;height:56px!important;border:3px solid #fff!important;border-radius:50%!important;padding:2px!important;background:#333!important;overflow:hidden!important;color:#fff!important;display:grid!important;place-items:center!important}
.mile-standalone-main-header .m36-avatar img{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:50%!important}
@media(max-width:600px){
body.mile-standalone-page>.top.mile-standalone-main-header{padding:12px!important;min-height:77px!important;border-radius:19px!important}
.mile-standalone-main-header .eyebrow{font-size:7px!important;letter-spacing:1.4px!important}
.mile-standalone-main-header .brand{font-size:29px!important}
.mile-standalone-main-header .row{gap:7px!important}
.mile-standalone-main-header .row button{font-size:10px!important;padding:10px 8px!important;min-height:42px!important;border-radius:11px!important}
.mile-standalone-main-header .row .m36-head{width:42px!important;min-height:42px!important;flex-basis:42px!important}
.mile-standalone-main-header .row .m36-avatar{width:42px!important;height:42px!important}
}
`;document.head.appendChild(style);document.body.classList.add('mile-standalone-page');
const header=document.querySelector('header.mile-top,header.mile-unified-head');
if(!header)return;
header.className='top mile-standalone-main-header';
header.innerHTML='<div class="mile-header-identity"><div class="eyebrow">MAKE IT LOOK EASY.</div><div class="brand">MILE.</div></div><div class="row"><button type="button" class="m396-whats-new mile-header-news">✦ &nbsp;What\\'s New</button><button type="button" class="btn alt sm mile-header-signout">Sign out</button><button type="button" class="m36-head mile-header-profile" aria-label="Open MILE profile"><span class="m36-avatar">M</span></button></div>';
header.querySelector('.mile-header-news').onclick=()=>{sessionStorage.setItem('mile-standalone-show-whats-new','1');location.href='./index.html'};
header.querySelector('.mile-header-signout').onclick=()=>{if(!confirm('Sign out of MILE?'))return;for(const key of ['av-token','av-refresh','av-user']){localStorage.removeItem(key);sessionStorage.removeItem(key)}location.href='./index.html'};
header.querySelector('.mile-header-profile').onclick=()=>{sessionStorage.setItem('mile-challenge-nav-target','profile');location.href='./index.html'};
const userId=localStorage.getItem('av-user')||sessionStorage.getItem('av-user');
if(!userId)return;
const settings=(()=>{try{return JSON.parse(localStorage.getItem('av-training-v2')||'{}').settings||{}}catch(_){return {}}})();
const token=localStorage.getItem('av-token')||sessionStorage.getItem('av-token');
if(!token)return;
const base=settings.supabaseUrl||'https://mgixvokjlytjuypzcfzz.supabase.co';
const key=settings.supabaseAnon||'sb_publishable_gIQO8rNBD9kKQpQdky0-7w_2A55HzO8';
fetch(base+'/rest/v1/mile_profiles?user_id=eq.'+encodeURIComponent(userId)+'&select=avatar_url,display_name,username&limit=1',{headers:{apikey:key,Authorization:'Bearer '+token}}).then(r=>r.ok?r.json():[]).then(rows=>{const profile=rows[0];if(!profile)return;const avatar=header.querySelector('.mile-header-profile .m36-avatar');const label=(profile.display_name||profile.username||'M').trim().charAt(0).toUpperCase();avatar.replaceChildren();if(profile.avatar_url&&/^https:\/\//.test(profile.avatar_url)){const img=document.createElement('img');img.src=profile.avatar_url;img.alt='Profile';img.onerror=()=>avatar.textContent=label;avatar.appendChild(img)}else avatar.textContent=label}).catch(()=>{});
})();