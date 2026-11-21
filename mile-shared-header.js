/* MILE shared standalone-page header. Used by Challenges and Run Tracker. */
(function(){
'use strict';
const style=document.createElement('style');style.id='mile-shared-header-styles';style.textContent=`
html{scroll-padding-top:12px}
body.mile-standalone-page{padding-top:calc(env(safe-area-inset-top, 0px) + 18px)!important}
.mile-shared-header{box-sizing:border-box!important;width:100%!important;display:flex!important;justify-content:space-between!important;align-items:center!important;gap:12px!important;background:#222!important;border:1px solid #555!important;border-radius:24px!important;padding:15px 18px!important;min-height:92px!important;margin:0 0 28px!important;position:relative!important;z-index:1!important}
.mile-shared-brand{display:flex!important;flex-direction:column!important;gap:7px!important;align-items:flex-start!important;min-width:0!important;flex:1!important}
.mile-shared-brand .mile-shared-tagline{color:#f4f4f4!important;font-size:10px!important;font-weight:800!important;letter-spacing:4px!important;white-space:nowrap!important}
.mile-shared-brand .mile-shared-logo{color:#fff!important;font-size:39px!important;font-weight:950!important;line-height:1!important;letter-spacing:-2.5px!important;font-style:italic!important}
.mile-shared-actions{display:flex!important;align-items:center!important;gap:9px!important;flex:0 0 auto!important}
.mile-shared-actions button{box-sizing:border-box!important;border:0!important;border-radius:14px!important;background:#fff!important;color:#0a0a0a!important;font-size:13px!important;font-weight:800!important;line-height:1.2!important;padding:13px 16px!important;min-height:44px!important;white-space:nowrap!important;cursor:pointer!important}
.mile-shared-actions button.mile-shared-avatar{border-radius:50%!important;border:3px solid #fff!important;width:56px!important;height:56px!important;min-height:56px!important;padding:2px!important;background:#333!important;color:#fff!important;overflow:hidden!important;display:grid!important;place-items:center!important}
.mile-shared-avatar img{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:50%!important}
@media(max-width:600px){
.mile-shared-header{padding:12px!important;min-height:77px!important;border-radius:19px!important;margin-bottom:24px!important}
.mile-shared-brand .mile-shared-tagline{display:none!important}
.mile-shared-brand .mile-shared-logo{font-size:30px!important}
.mile-shared-actions{gap:7px!important}
.mile-shared-actions button{font-size:11px!important;padding:11px 12px!important;min-height:42px!important;border-radius:11px!important}
.mile-shared-actions button.mile-shared-avatar{width:45px!important;height:45px!important;min-height:45px!important}
.mile-shared-actions .mile-shared-whats-new{display:none!important}
}
`;document.head.appendChild(style);document.body.classList.add('mile-standalone-page');
const header=document.querySelector('header.mile-top,header.mile-unified-head');
if(!header)return;
header.className='mile-shared-header';
header.innerHTML='<div class="mile-shared-brand"><span class="mile-shared-tagline">MAKE IT LOOK EASY.</span><strong class="mile-shared-logo">MILE.</strong></div><div class="mile-shared-actions"><button type="button" class="mile-shared-whats-new">✦ &nbsp;What\'s New</button><button type="button" class="mile-shared-signout">Sign out</button><button type="button" class="mile-shared-avatar" aria-label="Open MILE profile"><span>M</span></button></div>';
header.querySelector('.mile-shared-whats-new').onclick=()=>{sessionStorage.setItem('mile-standalone-show-whats-new','1');location.href='./index.html'};
header.querySelector('.mile-shared-signout').onclick=()=>{if(!confirm('Sign out of MILE?'))return;for(const key of ['av-token','av-refresh','av-user']){localStorage.removeItem(key);sessionStorage.removeItem(key)}location.href='./index.html'};
header.querySelector('.mile-shared-avatar').onclick=()=>{sessionStorage.setItem('mile-challenge-nav-target','profile');location.href='./index.html'};
const userId=localStorage.getItem('av-user')||sessionStorage.getItem('av-user');
if(!userId)return;
const settings=(()=>{try{return JSON.parse(localStorage.getItem('av-training-v2')||'{}').settings||{}}catch(_){return {}}})();
const token=localStorage.getItem('av-token')||sessionStorage.getItem('av-token');
if(!token)return;
const base=settings.supabaseUrl||'https://mgixvokjlytjuypzcfzz.supabase.co';
const key=settings.supabaseAnon||'sb_publishable_gIQO8rNBD9kKQpQdky0-7w_2A55HzO8';
fetch(base+'/rest/v1/mile_social_profiles?user_id=eq.'+encodeURIComponent(userId)+'&select=avatar_url,display_name,username&limit=1',{headers:{apikey:key,Authorization:'Bearer '+token}}).then(r=>r.ok?r.json():[]).then(rows=>{const profile=rows[0];if(!profile)return;const avatar=header.querySelector('.mile-shared-avatar');const label=(profile.display_name||profile.username||'M').trim().charAt(0).toUpperCase();avatar.replaceChildren();if(profile.avatar_url&&/^https:\/\//.test(profile.avatar_url)){const img=document.createElement('img');img.src=profile.avatar_url;img.alt='Profile';img.onerror=()=>avatar.textContent=label;avatar.appendChild(img)}else avatar.textContent=label}).catch(()=>{});
})();