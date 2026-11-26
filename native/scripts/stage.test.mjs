import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assets, syncAssets, stage } from './stage.mjs';

test('native bundle includes only approved assets and verifiable build manifest', async () => {
  const dest = await stage();
  assert.deepEqual((await readdir(dest)).sort(), [...assets, 'mile-build.json','mile-native-runtime.js','sync'].sort());
  const manifest = JSON.parse(await readFile(path.join(dest, 'mile-build.json'), 'utf8'));
  assert.equal(manifest.version,JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version);
  assert.match(await readFile(path.join(dest,'index.html'),'utf8'), /<script src="\.\/mile-native-runtime\.js"><\/script>/);
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.deepEqual((await readdir(path.join(dest,'sync'))).sort(),[...syncAssets].sort());
  for (const file of [...assets,'mile-native-runtime.js',...syncAssets.map(name=>'sync/'+name)]) {
    assert.equal(createHash('sha256').update(await readFile(path.join(dest, file))).digest('hex'), manifest.assets[file]);
  }
  assert.match(await readFile(path.join(dest,'index.html'),'utf8'), /<html\b/i);
  for (const name of ['mile-run-tracker.html','mile-sim.html','mile-challenges.html','mile-79.css','mile-85-auth.css','mile-873.css','mile-device-sync.js','mile-split-share.js','mile-86.css','mile-86-health-preview.js','mile-garmin-plan.js']) assert.ok(assets.includes(name));
  const html = await readFile(path.join(dest,'index.html'),'utf8');
  for (const match of html.matchAll(/(?:src|href)=["']\.\/([^"'?#]+)(?:[?#][^"']*)?["']/g)) {
    assert.ok([...assets,'mile-native-runtime.js'].includes(match[1]), 'Missing staged local dependency: '+match[1]);
  }
});
