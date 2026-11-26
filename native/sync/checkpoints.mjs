// Persistent, account- and installation-scoped opaque HealthKit cursors.
// A native secure storage adapter is mandatory; no localStorage fallback.
export function createCheckpointStore({storage,accountId,installationId,activeAccount}){
 if(!storage||!['get','set','remove'].every(k=>typeof storage[k]==='function'))throw Error('Secure storage required');
 if(!accountId||!installationId||typeof activeAccount!=='function')throw Error('Checkpoint scope required');
 const prefix='mile.healthkit.v1:'+encodeURIComponent(accountId)+':'+encodeURIComponent(installationId)+':';
 const guard=id=>{if(id!==accountId||activeAccount()!==accountId)throw Error('Checkpoint account changed')};
 const key=(id,w)=>{guard(id);if(!w||!Number.isFinite(Date.parse(w.from))||!Number.isFinite(Date.parse(w.to))||Date.parse(w.from)>=Date.parse(w.to))throw Error('Invalid checkpoint window');return prefix+encodeURIComponent(w.from)+':'+encodeURIComponent(w.to)};
 return Object.freeze({
  async load(id,w){const k=key(id,w);const value=await storage.get(k);guard(id);if(value==null)return null;if(typeof value!=='string'||!value||value.length>8192)throw Error('Invalid stored checkpoint');return value},
  async save(id,w,cursor){const k=key(id,w);if(typeof cursor!=='string'||!cursor||cursor.length>8192)throw Error('Invalid checkpoint');await storage.set(k,cursor);guard(id)},
  async remove(id,w){await storage.remove(key(id,w));guard(id)}
 });
}
