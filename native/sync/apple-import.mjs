import {normalizeWorkout,historicalWindows} from './workouts.mjs';

// Prototype only: callers supply an authenticated, account-bound transport.
// Never enable uploads merely because a HealthKit permission dialog completed.
export async function importAppleWorkouts({accountId,from,to,readPage,transport,checkpoint,activeAccount,consented,signal,maxPages=1000}) {
  if(typeof accountId!=='string'||!accountId.trim()||!Number.isInteger(maxPages)||maxPages<1||maxPages>10000)throw Error('Invalid import configuration');
  const assertActive=async()=>{
    if(signal?.aborted||activeAccount()!==accountId)throw Error('Import cancelled or account changed');
    if(!await consented(accountId))throw Error('Explicit import consent required');
    if(signal?.aborted||activeAccount()!==accountId)throw Error('Import cancelled or account changed');
  };
  const windows=historicalWindows(from,to);
  let pages=0,imported=0,removed=0;
  for(const window of windows){
    let cursor=await checkpoint.load(accountId,window)??null;
    const seen=new Set();
    for(;;){
      await assertActive();
      if(++pages>maxPages)throw Error('Page limit reached; resume from checkpoint');
      const page=await readPage({...window,...(cursor?{cursor}:{})});
      await assertActive();
      if(!Array.isArray(page?.workouts)||page.workouts.length>200||!Array.isArray(page.deletedProviderIds)||page.deletedProviderIds.length>200||typeof page.hasMore!=='boolean'||typeof page.nextCursor!=='string'||!page.nextCursor||page.nextCursor.length>8192)throw Error('Invalid provider page');
      if(page.hasMore&&(page.nextCursor===cursor||seen.has(page.nextCursor)))throw Error('Provider cursor did not advance');
      const rows=page.workouts.map(raw=>{
        if(raw.provider!=='apple_health')throw Error('Unexpected provider');
        const row=normalizeWorkout(raw,accountId);
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.providerId))throw Error('Invalid provider identifier');
        if(row.startAt<window.from||row.startAt>=window.to||row.durationSeconds>2592000||(row.distanceMeters!==null&&row.distanceMeters>10000000))throw Error('Record outside accepted bounds');
        return {provider:'apple_health',provider_id:row.providerId,start_at:row.startAt,end_at:row.endAt,duration_seconds:row.durationSeconds,distance_meters:row.distanceMeters,sport:row.sport,
          ...(typeof raw.averageHR==='number'&&raw.averageHR>=20&&raw.averageHR<=250?{average_hr:raw.averageHR}:{}),
          ...(typeof raw.activityDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.activityDay)?{activity_day:raw.activityDay}:{})};
      });
      const deleted=page.deletedProviderIds.map(id=>{if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid deleted identifier');return id});
      if(transport.commit)await transport.commit(accountId,rows,deleted);
      else if(deleted.length)throw Error('Source deletion requires reconciliation');
      // The transport must capture the original session, reject session changes,
      // and resolve only after the database has acknowledged a durable write.
      if(!transport.commit&&rows.length)await transport.upsert(accountId,rows);
      await assertActive();
      await checkpoint.save(accountId,window,page.nextCursor);
      imported+=rows.length;removed+=deleted.length;
      if(!page.hasMore)break;
      seen.add(page.nextCursor);cursor=page.nextCursor;
    }
  }
  return {pages,imported,...(transport.commit?{removed}:{})};
}
