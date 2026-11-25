import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assets, stage } from './stage.mjs';

test('native bundle includes only approved assets and verifiable build manifest', async () => {
  const dest = await stage();
  assert.deepEqual((await readdir(dest)).sort(), [...assets, 'mile-build.json','mile-native-runtime.js','mile-native-session.js'].sort());
  const manifest = JSON.parse(await readFile(path.join(dest, 'mile-build.json'), 'utf8'));
  assert.equal(manifest.version,JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version);
  assert.match(await readFile(path.join(dest,'index.html'),'utf8'), /<script src="\.\/mile-native-runtime\.js"><\/script>/);
  assert.match(await readFile(path.join(dest,'index.html'),'utf8'), /<script src="\.\/mile-native-session\.js"><\/script>/);
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  for (const file of [...assets,'mile-native-runtime.js','mile-native-session.js']) {
    assert.equal(createHash('sha256').update(await readFile(path.join(dest, file))).digest('hex'), manifest.assets[file]);
  }
  assert.match(await readFile(path.join(dest,'index.html'),'utf8'), /<html\b/i);
  for (const name of ['mile-run-tracker.html','mile-sim.html','mile-challenges.html']) assert.ok(assets.includes(name));
});
