import { copyFile, mkdir, rm, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

export const assets = Object.freeze([
  'index.html', 'mile-admin-centre.js', 'mile-buttons.css',
  'mile-onboarding.js', 'mile-onboarding.css', 'mile-avatar.js',
  'mile-challenges.html', 'mile-run-tracker.html', 'mile-shared-header.js',
  'mile-sim-sync.js', 'mile-sim.html',
  'mile-79.css', 'mile-85-auth.css', 'mile-873.css', 'mile-device-sync.js',
  'mile-split-share.js', 'mile-86.css', 'mile-86-health-preview.js', 'mile-garmin-plan.js', 'mile-intervals.js', 'mile-intervals.css', 'mile-compact.css', 'mile-design.css', 'mile-running-iq.js', 'mile-running-analysis.js', 'mile-training-revisions.js',
  'mile-running-workout.js', 'mile-running-plan.js', 'mile-running-build.js', 'mile-running-build.css',
  'mile-cycling-plan.js', 'mile-cycling-iq.js', 'mile-cycling-build.js', 'mile-cycling.css',
  'mile-swimming-library.js', 'mile-swimming-plan.js', 'mile-swimming-build.js', 'mile-swimming-iq.js'
]);
export const syncAssets = Object.freeze(['workouts.mjs','apple-import.mjs','apple-transport.mjs','checkpoints.mjs','apple-native.mjs','watch-workouts.mjs','apple-app.mjs']);
const root = fileURLToPath(new URL('../../', import.meta.url));
const dest = path.join(root, 'native', 'www');
export async function stage({stagingKey=process.env.MILE_NATIVE_STAGING_PUBLISHABLE_KEY}={}) {
  const appleHealth=stagingKey!=null;
  const production='https://mgixvokjlytjuypzcfzz.supabase.co';
  const staging='https://fnyfeelynaozxtftrrga.supabase.co';
  const originalIndex=await readFile(path.join(root,'index.html'),'utf8');
  const productionKey=originalIndex.match(/supabaseAnon:'(sb_publishable_[A-Za-z0-9_-]+)'/)?.[1];
  if(appleHealth&&(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(stagingKey)||!productionKey||stagingKey===productionKey))
    throw new Error('Use the MILE Staging publishable key for the Apple Health beta.');
  // Fixed destination and explicit allowlist: never copy repository, SQL, tests or credentials.
  for (const file of assets) {
    const source = path.join(root, file);
    const stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error('Invalid asset: ' + file);
  }
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  const hashes = {};
  const commit = execFileSync('git', ['rev-parse','HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const version = JSON.parse(await readFile(path.join(root,'native/package.json'),'utf8')).version;
  for (const file of assets) {
    if(appleHealth){
      const content=await readFile(path.join(root,file),'utf8');
      await writeFile(path.join(dest,file),content.replaceAll(production,staging).replaceAll(productionKey,stagingKey));
    }else await copyFile(path.join(root, file), path.join(dest, file));
    hashes[file] = createHash('sha256').update(await readFile(path.join(dest,file))).digest('hex');
  }
  await mkdir(path.join(dest,'sync'));
  for (const file of syncAssets) {
    const source=path.join(root,'native','sync',file);
    const stat=await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size===0) throw Error('Invalid sync asset: '+file);
    const relative='sync/'+file;
    await copyFile(source,path.join(dest,relative));
    hashes[relative]=createHash('sha256').update(await readFile(path.join(dest,relative))).digest('hex');
  }
  const runtime = await readFile(path.join(root,'native/runtime.cjs'),'utf8');
  const entry = path.join(dest,'index.html');
  const original = await readFile(entry,'utf8');
  const closing = /<\/body\s*>/i;
  if (!closing.test(original)) throw new Error('Missing body closing tag');
  const identity = 'window.MILE_NATIVE_BUILD='+JSON.stringify({commit,version,appleHealth})+';';
  await writeFile(path.join(dest,'mile-native-runtime.js'),identity+'\n'+runtime);
  const stagingEntry=appleHealth?original.replace('<html','<html data-mile-staging="true"')
    .replace('</head>',`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${staging}; connect-src ${staging}; frame-src 'self'; base-uri 'none'; form-action 'self'"></head>`):original;
  await writeFile(entry,stagingEntry.replace(closing,match=>'<script src="./mile-native-runtime.js"></script>'+
    (appleHealth?'<script type="module" src="./sync/apple-app.mjs"></script>':'')+match));
  for (const name of ['index.html','mile-native-runtime.js']) hashes[name]=createHash('sha256').update(await readFile(path.join(dest,name))).digest('hex');
  await writeFile(path.join(dest, 'mile-build.json'), JSON.stringify({commit,version, assets: hashes}, null, 2)+'\n');
  console.log('Staged ' + (await readdir(dest)).length + ' files for native build ' + commit);
  return dest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stage();
