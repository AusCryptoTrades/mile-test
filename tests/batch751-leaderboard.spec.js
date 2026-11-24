const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('let lbRequest=0;'),end=html.indexOf('function leaderboardView(){',start);
function harness(api,now='2026-11-22T13:30:00Z'){
 const S={tab:'leaderboard',leaderboardScope:'friends',leaderboardWeek:0};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}}
 const ctx=vm.createContext({S,userId:'me',token:'test',api,paint(){},Date:Clock,Intl});
 vm.runInContext(html.slice(start,end)+'\nthis.load=loadLeaderboard;this.week=lbWeek;',ctx);
 return {S,ctx};
}
test('leaderboard requests only server scores and uses Melbourne week',async()=>{
 const calls=[],payload={entries:[{user_id:'me',points:95,sessions:3}],audit:[]};
 const {S,ctx}=harness(async(...args)=>{calls.push(args);return payload});
 expect(ctx.week().label).toBe('23 Nov – 29 Nov');
 await ctx.load();
 expect(calls).toEqual([['rpc/mile_weekly_leaderboard','POST',{p_week:0,p_scope:'friends'}]]);
 expect(S.leaderboardResult).toEqual(payload);
 S.leaderboardScope='global';S.leaderboardWeek=-1;await ctx.load();
 expect(calls[1]).toEqual(['rpc/mile_weekly_leaderboard','POST',{p_week:-1,p_scope:'global'}]);
 expect(S.leaderboardLoading).toBe(false);
});
test('stale scope responses cannot overwrite current ranking',async()=>{
 const pending=[];
 const {S,ctx}=harness(()=>new Promise(resolve=>pending.push(resolve)));
 const first=ctx.load();S.leaderboardScope='global';const second=ctx.load();
 pending[1]({entries:[{user_id:'new'}],audit:[]});await second;
 pending[0]({entries:[{user_id:'old'}],audit:[]});await first;
 expect(S.leaderboardResult.entries[0].user_id).toBe('new');
});
test('invalid or failed server response never falls back to private client activities',async()=>{
 const {S,ctx}=harness(async()=>({unexpected:true}));
 await ctx.load();expect(S.leaderboardResult).toBeNull();
 expect(S.leaderboardError).toBe('Invalid leaderboard response');
 expect(S.leaderboardLoading).toBe(false);
 expect(html).not.toContain('S.leaderboardOwnAll=ownGarmin');
 expect(html).toContain('S.leaderboardScope=b.dataset.mileLbScope;loadLeaderboard()');
});
