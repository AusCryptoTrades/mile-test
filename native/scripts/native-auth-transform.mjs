// Staged native assets only. Web build remains byte-for-byte unchanged.
export function migrateNativeAuth(name,source){
 const replace=(from,to)=>{if(!source.includes(from))throw Error('Native auth migration anchor missing: '+name+' '+from.slice(0,65));source=source.replace(from,()=>to)};
 if(name==='index.html'){
  replace('v4SetSession(d);await v4AfterLogin();','v4SetSession(d);await window.mileSession.persist();await v4AfterLogin();');
  replace("const hasSession=!!(token&&userId);","v4ShowRestoring();try{await window.mileSession.init();token=window.mileSession.getItem('av-token')||'';userId=window.mileSession.getItem('av-user')||'';}catch(e){v4Show('login');v4SetError('Secure session storage unavailable.');return;}const hasSession=!!(token&&userId);");
  replace("if(authRefreshBusy)return authRefreshBusy;authRefreshBusy=(async()=>{","if(authRefreshBusy)return authRefreshBusy;const sessionEpoch=window.mileSession.epoch();authRefreshBusy=(async()=>{");
  replace("let d=await r.json();token=d.access_token;userId=d.user?.id||userId;","let d=await r.json();if(sessionEpoch!==window.mileSession.epoch())return false;token=d.access_token;userId=d.user?.id||userId;");
  replace("localStorage.setItem('av-refresh',d.refresh_token);render();return true","if(d.refresh_token)localStorage.setItem('av-refresh',d.refresh_token);await window.mileSession.persist();render();return true");
  replace("catch(e){token='';userId='';sessionStorage.removeItem('av-token');","catch(e){if(sessionEpoch!==window.mileSession.epoch())return false;await window.mileSession.clear().catch(()=>{});token='';userId='';sessionStorage.removeItem('av-token');");
  replace("Sign out anyway?'))return;token='';userId='';v4Ready=false;","Sign out anyway?'))return;try{await window.mileSession.clear()}catch(e){notice(e.message);return}token='';userId='';v4Ready=false;");
  replace(" v4SetSession(d);await window.mileSession.persist();await v4AfterLogin();"," v4SetSession(d);try{await window.mileSession.persist()}catch(e){token='';userId='';throw e}await v4AfterLogin();");
 }
 if(name==='mile-run-tracker.html'){
  replace("const store=localStorage.getItem('av-user')===run.owner?localStorage:sessionStorage;store.setItem('av-token',token);if(session.refresh_token)store.setItem('av-refresh',session.refresh_token);","window.mileSession.setItem('av-token',token);if(session.refresh_token)window.mileSession.setItem('av-refresh',session.refresh_token);await window.mileSession.persist();");
  replace("onclick=()=>{if(confirm('Sign out of MILE?')){localStorage.removeItem('av-token');","onclick=async()=>{if(confirm('Sign out of MILE?')){await window.mileSession.clear();localStorage.removeItem('av-token');");
 }
 if(name==='mile-challenges.html'){
  replace("if(next.refresh_token)localStorage.setItem('av-refresh',next.refresh_token);return challengeRequest","if(next.refresh_token)localStorage.setItem('av-refresh',next.refresh_token);await window.mileSession.persist();return challengeRequest");
 }
 if(name==='mile-shared-header.js'){
  replace("onclick=()=>{if(!confirm('Sign out of MILE?'))return;for(const key of ['av-token','av-refresh','av-user']){localStorage.removeItem(key);sessionStorage.removeItem(key)}","onclick=async()=>{if(!confirm('Sign out of MILE?'))return;await window.mileSession.clear();");
 }
 source=source.replace(/(?:localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem)\s*\(\s*(['"])av-(token|refresh|user)\2/g,(_,method,q,key)=>"window.mileSession."+method+"("+q+"av-"+key+q);
 if(name.endsWith('.html')){
  if(!/<head(?:\s[^>]*)?>/i.test(source))throw Error('Missing head '+name);
  source=source.replace(/<head(?:\s[^>]*)?>/i,m=>m+'<script src="./mile-native-session.js"></script>');
 }
 return source;
}
