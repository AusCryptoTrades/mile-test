const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
test('Batch 76 distinguishes profile hiding from audience privacy and deletion',()=>{
 expect(html).toContain('hidden_from_profile:hidden');
 expect(html).toContain('x.hidden_from_profile!==true');
 expect(html).toContain('social_deleted:true,visibility:\'private\',hidden_from_profile:true');
 expect(html).toContain('if(p.social_deleted===true)return false');
 expect(html).toContain('<option value="public">Anyone</option>');
 expect(html).toContain('Activity update was not saved');
});
test('Batch 76 social headers and profile tab restoration are wired',()=>{
 expect(html).toContain("feed:['Social Feed','Training from your community']");
 expect(html).toContain("S.m76ProfileTab=prev.profileTab||'activity'");
 expect(html).toContain('data-m76-options');
 expect(html).toContain("window.m36State.m76ProfileTab=tab");
 expect(html).toContain("CSS.escape(S.m76ProfileTab)");
});
test('Batch 76 sport classification supports indoor cardio and HIIT',()=>{
 const start=html.indexOf('function m388Category('),end=html.indexOf('\n',start);
 const ctx=vm.createContext({});
 vm.runInContext(html.slice(start,end)+'\nthis.category=m388Category;',ctx);
 expect(ctx.category('INDOOR_CARDIO')).toBe('cardio');
 expect(ctx.category('HIIT')).toBe('cardio');
 expect(ctx.category('TREADMILL_RUNNING')).toBe('running');
});
