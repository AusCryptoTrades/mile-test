import {test} from 'node:test';
import assert from 'node:assert/strict';
import adapter from '../../mile-session.js';

const {createSession}=adapter;
const keys=['av-token','av-user','av-refresh'];
function storage(){
 const entries=new Map(keys.map(key=>[key,'legacy']));
 return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
}
const login=(name,refresh='refresh-'+name)=>({access_token:'access-'+name,refresh_token:refresh,user:{id:name}});
function fixture(){
 let record=null;
 const plugin={
  readSession:async()=>({session:record}),
  writeSession:async value=>{record=value},
  clearSession:async()=>{record=null}
 };
 const window={localStorage:storage(),sessionStorage:storage(),
  Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:{MILEHealthKit:plugin}}};
 return {window,plugin,record:()=>record};
}

test('the iOS vault removes legacy credentials and restores only the current Keychain session',async()=>{
 const {window,record}=fixture();
 const session=createSession(window,{native:true});
 assert.equal(await session.restore(),null);
 await session.save(login('first'));
 assert.equal(session.read('av-user'),'first');
 await session.save(login('first','rotated'));
 assert.equal((await createSession(window,{native:true}).restore()).refreshToken,'rotated');
 await session.save(login('second'));
 assert.deepEqual(record(),{accessToken:'access-second',refreshToken:'refresh-second',userId:'second'});
 for(const store of [window.localStorage,window.sessionStorage])
  for(const key of keys)assert.equal(store.getItem(key),null);
});

test('logout invalidates an in-flight session write and blocks restore if Keychain deletion failed',async()=>{
 const {window,plugin,record}=fixture();
 let enter,release;
 const started=new Promise(resolve=>{enter=resolve});
 const originalWrite=plugin.writeSession;
 plugin.writeSession=async data=>{await new Promise(resolve=>{release=resolve;enter()});await originalWrite(data)};
 const session=createSession(window,{native:true});
 const write=session.save(login('first'));
 await started;
 const originalClear=plugin.clearSession;
 plugin.clearSession=async()=>{throw Error('locked')};
 const clear=session.clear();
 release();
 assert.equal(await write,false);
 await assert.rejects(clear,/locked/);
 assert.equal(session.read('av-token'),null);
 assert.equal(record().userId,'first');
 plugin.clearSession=originalClear;
 assert.equal(await createSession(window,{native:true}).restore(),null);
 assert.equal(record(),null);
});

test('native frames use the parent and web retains existing browser storage',async()=>{
 const {window}=fixture();
 const web=createSession(window);
 await web.save(login('web'));
 assert.equal(window.localStorage.getItem('av-user'),'web');
 const child={...window,Capacitor:null,parent:{mileEmbeddedSession:{read:(key,frame)=>frame===child&&key==='av-user'?'native':null}}};
 const native=createSession(child,{native:true});
 assert.equal(native.read('av-user'),'native');
 assert.equal(native.read('av-refresh'),null);
 assert.equal(await native.restore(),null);
 await assert.rejects(native.save(login('frame')),/main app/);
});
