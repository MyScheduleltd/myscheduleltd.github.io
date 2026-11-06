// Verify active package/data and that stale-output cleanup cannot delete code.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {packageFiles, prunePackageArtifacts} from './moth-package-layout.mjs';
import {UNUSED_MAP_POINTERS, UNUSED_SPRITE_METADATA} from './moth-data-cleanup.mjs';
import {RETIRED_UI_IMAGES} from './moth-retired-ui.mjs';
import {RETIRED_HIGHWAY_LAYERS} from './moth-retired-highway.mjs';
const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/data/level1.json'), 'utf8'));
const snapshot = JSON.parse(await fs.readFile(path.join(root, '.qa/moth/published-snapshot.json'), 'utf8'));
for (const keys of UNUSED_MAP_POINTERS) assert(!Object.hasOwn(keys.reduce((value, key) => value[key], config), 'mapDataSource'));
for (const key of UNUSED_SPRITE_METADATA) assert(!Object.hasOwn(config.sprites, key));
for (const file of [...RETIRED_UI_IMAGES, ...RETIRED_HIGHWAY_LAYERS]) await assert.rejects(fs.access(path.join(root, 'docs/moth', file)));
for (const file of ['moth-asset-additions/assets/memes/level4-meme.png', 'moth-asset-additions/assets/audio/fight-cuts/level6-river-short.m4a', 'scripts/make-meme-standin.py']) await assert.rejects(fs.access(path.join(root, file)));
const checked = await prunePackageArtifacts(path.join(root, 'docs/moth'), packageFiles(snapshot));
assert.deepEqual(checked.removedStaleFiles, [], 'A clean generated package needs no extra pruning');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'moth-prune-'));
try {
  await fs.mkdir(path.join(directory, 'assets/retired'), {recursive: true});
  await fs.writeFile(path.join(directory, 'index.html'), 'active code');
  await fs.writeFile(path.join(directory, 'assets/active.webp'), 'active art');
  await fs.writeFile(path.join(directory, 'assets/retired/old.webp'), 'unused art');
  const expected = new Set(['index.html', 'assets/active.webp']);
  const result = await prunePackageArtifacts(directory, expected);
  assert.deepEqual(result.removedStaleFiles, ['assets/retired/old.webp']);
  assert.equal(await fs.readFile(path.join(directory, 'index.html'), 'utf8'), 'active code');
  assert.equal(await fs.readFile(path.join(directory, 'assets/active.webp'), 'utf8'), 'active art');
  await fs.writeFile(path.join(directory, 'unregistered.js'), 'inspect before removing');
  await assert.rejects(prunePackageArtifacts(directory, expected), /needs inspection/);
  assert.equal(await fs.readFile(path.join(directory, 'unregistered.js'), 'utf8'), 'inspect before removing');
  await fs.unlink(path.join(directory, 'unregistered.js'));
  await fs.writeFile(path.join(directory, 'assets/unregistered.js'), 'inspect nested code too');
  await assert.rejects(prunePackageArtifacts(directory, expected), /needs inspection/);
  assert.equal(await fs.readFile(path.join(directory, 'assets/unregistered.js'), 'utf8'), 'inspect nested code too');
} finally { await fs.rm(directory, {recursive: true, force: true}); }
console.log('PASS cleanup: retired resources and data absent, exact active package, stale asset pruning, unexpected code preserved', JSON.stringify(checked));
