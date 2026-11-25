import test from 'node:test';
import assert from 'node:assert/strict';
import runtime from '../runtime.cjs';
test('native back never removes tracker or SIM even if browser can go back',()=>{
 assert.equal(runtime.backAction({workout:true,canGoBack:true,overlay:true}),'protect');
});
test('native back prioritises visible UI over history',()=>{
 for(const [input,expected] of [[{overlay:true,drawer:true},'close'],[{drawer:true,settings:true},'escape'],[{settings:true,canGoBack:true},'settings'],[{canGoBack:true},'history'],[{},'stay']])assert.equal(runtime.backAction(input),expected);
});
test('ordinary browser is untouched',()=>assert.equal(runtime.attach({Capacitor:{isNativePlatform:()=>false}}),false));
