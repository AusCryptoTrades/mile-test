import {createCheckpointStore,createIOSCheckpointStorage} from './checkpoints.mjs';
import {createAppleTransport} from './apple-transport.mjs';
import {importAppleWorkouts} from './apple-import.mjs';

// Staging integration only. Requires an explicitly enabled, separately provisioned
// test backend, a verified session supplier and an installation identifier.
// This module has no automatic execution or production endpoint.
export function createNativeAppleImport({cap,accountId,installationId,activeAccount,session,backend,explicitConsent,fetchImpl}) {
 if(!cap?.isNativePlatform?.()||cap.getPlatform()!=='ios')throw Error('Native iOS required');
 if(backend?.mode!=='isolated-staging'||backend?.enabled!==true)throw Error('Staging import is disabled');
 const url=new URL(backend.url);
 if(url.hostname==='mgixvokjlytjuypzcfzz.supabase.co')throw Error('Production ingestion disabled');
 if(typeof explicitConsent!=='function'||typeof activeAccount!=='function'||typeof session!=='function')throw Error('Explicit account and consent providers required');
 const plugin=cap.Plugins?.MILEHealthKit;
 if(!plugin||!['availability','requestReadAccess','readWorkoutPage'].every(k=>typeof plugin[k]==='function'))throw Error('HealthKit bridge unavailable');
 const storage=createIOSCheckpointStorage(cap);
 const checkpoint=createCheckpointStore({storage,accountId,installationId,activeAccount});
 let running=false,controller=null;
 const assertAccount=()=>{if(activeAccount()!==accountId)throw Error('Account changed')};
 return Object.freeze({
  cancel(){controller?.abort()},
  async run({from,to,maxPages=1000,askPermission=true,details=false}){
   if(running)throw Error('Import already running');
   running=true;controller=new AbortController();
   try{
    assertAccount();
    if(!await explicitConsent(accountId))throw Error('Explicit import consent required');
    const transport=createAppleTransport({baseUrl:backend.url,anonKey:backend.anonKey,session,fetchImpl,signal:controller.signal});
    const consented=async id=>await explicitConsent(id)&&await transport.consented(id);
    if(!await consented(accountId))throw Error('Cloud consent required');
    assertAccount();
    if(!(await plugin.availability()).available)throw Error('HealthKit unavailable');
    assertAccount();
    if(controller.signal.aborted)throw Error('Import cancelled');
    if(askPermission&&!(await plugin.requestReadAccess({details})).requestCompleted)throw Error('Permission request incomplete');
    assertAccount();
    return await importAppleWorkouts({accountId,from,to,maxPages,readPage:args=>plugin.readWorkoutPage({...args,details}),transport:backend.atomic?Object.assign({},transport,{commit:(id,rows,deleted)=>transport.commit(id,rows,deleted,backend.epoch)}):{upsert:transport.upsert},checkpoint,activeAccount,consented,signal:controller.signal});
   }finally{running=false;controller=null}
  }
 });
}
