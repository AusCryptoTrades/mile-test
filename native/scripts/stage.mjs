import { copyFile, mkdir, rm, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

export const assets = Object.freeze([
  'index.html', 'mile-admin-centre.js', 'mile-buttons.css',
  'mile-challenges.html', 'mile-run-tracker.html', 'mile-shared-header.js',
  'mile-sim-sync.js', 'mile-sim.html'
]);
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
  for (const file of assets) {
    await copyFile(path.join(root, file), path.join(dest, file));
    hashes[file] = createHash('sha256').update(await readFile(path.join(dest,file))).digest('hex');
  }
  const commit = execFileSync('git', ['rev-parse','HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  await writeFile(path.join(dest, 'mile-build.json'), JSON.stringify({commit, assets: hashes}, null, 2)+'\n');
  console.log('Staged ' + (await readdir(dest)).length + ' files for native build ' + commit);
  return dest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stage();
