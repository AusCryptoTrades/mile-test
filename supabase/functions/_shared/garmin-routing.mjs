const production = 'https://mgixvokjlytjuypzcfzz.supabase.co';
const staging = 'https://fnyfeelynaozxtftrrga.supabase.co';
const app = 'https://app.milefitness.com.au';
const legacy = 'https://auscryptotrades.github.io';

export function garminRouting(projectUrl, betaOrigin) {
 const project = projectUrl?.trim().replace(/\/$/,'');
 const callback = project + '/functions/v1/garmin-oauth-callback';
 if (project === production) {
  return {beta:false,callback,origins:new Set([app,legacy]),fallback:legacy+'/mile-test/',
   prefix:origin=>origin===app?'app.':'legacy.',
   returnTo:state=>state.startsWith('app.')?app+'/':legacy+'/mile-test/'};
 }
 if (project !== staging || typeof betaOrigin !== 'string') return null;
 let preview;
 try { preview = new URL(betaOrigin.trim()); } catch { return null; }
 if (preview.protocol!=='https:' || !preview.hostname.endsWith('.pages.dev') ||
   preview.username || preview.password || preview.port || preview.pathname!=='/' || preview.search || preview.hash) return null;
 return {beta:true,callback,origins:new Set([preview.origin]),fallback:preview.origin+'/',
  prefix:()=> 'beta.',returnTo:state=>state.startsWith('beta.')?preview.origin+'/':null};
}
