import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckpointStore,createIOSCheckpointStorage} from '../sync/checkpoints.mjs';
const window={from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z'};
test('native checkpoint store persists across instances and isolates accounts/installations',async()=>{
 const map=new Map();let owner='a';
 const cap={isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:{MILEHealthKit:{
 checkpointGet:async({key})=>({value:map.get(key)??null}),
 checkpointSet:async({key,value})=>{map.set(key,value)},
 checkpointRemove:async({key})=>{map.delete(key)}
 }}};
 const storage=createIOSCheckpointStorage(cap);
 const make=(id='a',installationId='one')=>createCheckpointStore({storage,accountId:id,installationId,activeAccount:()=>owner});
 await make().save('a',window,'opaque');
 assert.equal(await make().load('a',window),'opaque');
 assert.equal(await make('a','two').load('a',window),null);
 owner='b';await assert.rejects(make().load('a',window),/account changed/);
 assert.equal(await make('b').load('b',window),null);
 owner='a';await make().remove('a',window);assert.equal(await make().load('a',window),null);
});
test('checkpoint storage fails closed outside native iOS and propagates failures',async()=>{
 assert.throws(()=>createIOSCheckpointStorage({isNativePlatform:()=>false}),/Native iOS/);
 const store=createCheckpointStore({storage:{get:async()=>null,set:async()=>{throw Error('locked')},remove:async()=>{}},accountId:'a',installationId:'one',activeAccount:()=> 'a'});
 await assert.rejects(store.save('a',window,'opaque'),/locked/);
 await assert.rejects(store.save('a',window,''),/Invalid checkpoint/);
});
