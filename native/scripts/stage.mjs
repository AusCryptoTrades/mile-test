import { copyFile, mkdir, rm, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

export const assets = Object.freeze([
  'index.html', 'mile-admin-centre.js', 'mile-buttons.css',
  'mile-challenges.html', 'mile-run-tracker.html', 'mile-shared-header.js',
  'mile-sim-sync.js', 'mile-sim.html',
  'mile-79.css', 'mile-85-auth.css', 'mile-873.css', 'mile-device-sync.js',
  'mile-split-share.js', 'mile-86.css', 'mile-86-health-preview.js', 'mile-garmin-plan.js', 'mile-intervals.js', 'mile-intervals.css', 'mile-compact.css'
]);
export const syncAssets = Object.freeze(['workouts.mjs','apple-import.mjs','apple-transport.mjs','checkpoints.mjs','apple-native.mjs']);
const root = fileURLToPath(new URL('../../', import.meta.url));
const dest = path.join(root, 'native', 'www');
export async function stage() {
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
    await copyFile(path.join(root, file), path.join(dest, file));
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
  const identity = 'window.MILE_NATIVE_BUILD='+JSON.stringify({commit,version})+';';
  await writeFile(path.join(dest,'mile-native-runtime.js'),identity+'\n'+runtime);
  await writeFile(entry,original.replace(closing,match=>'<script src="./mile-native-runtime.js"></script>'+match));
  for (const name of ['index.html','mile-native-runtime.js']) hashes[name]=createHash('sha256').update(await readFile(path.join(dest,name))).digest('hex');
  await writeFile(path.join(dest, 'mile-build.json'), JSON.stringify({commit,version, assets: hashes}, null, 2)+'\n');
  console.log('Staged ' + (await readdir(dest)).length + ' files for native build ' + commit);
  return dest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stage();
