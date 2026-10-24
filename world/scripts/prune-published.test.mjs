import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, symlink, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createPrunePlan, reachableAssets, validateDeployments, RETENTION_MS, applyPrunePlan } from './prune-published.mjs';

const now = Date.parse('2026-10-24T12:00:00Z');
const page = entry => `<script type="module" src="./assets/${entry}"></script>`;
const file = text => ({ text, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') });
const fixture = () => new Map([
  ['main-newENTRY.js', file('import "./world-newWORLD.js"')],
  ['world-newWORLD.js', file('const tile = new URL("stone-newCOLOR.ktx2", import.meta.url);')],
  ['stone-newCOLOR.ktx2', file('new compressed art')],
  ['main-oldENTRY.js', file('import "./world-oldWORLD.js"')],
  ['world-oldWORLD.js', file('const tile = new URL("stone-oldCOLOR.webp", import.meta.url);')],
  ['stone-oldCOLOR.webp', file('old art')],
  ['basis/basis_transcoder.js', file('decoder glue')],
  ['basis/basis_transcoder.wasm', file('decoder wasm')],
  ['basis/basis_worker.js', file('worker code')],
  ['asset-integrity.json', file('{"unknown-OFFLINE1.webp":"unused manifest key"}')],
  ['unknown-OFFLINE1.webp', file('unclassified asset')],
  ['notes.txt', file('keep unknown un-hashed file')],
]);
const entries = () => [{ entry: 'main-newENTRY.js', page: page('main-newENTRY.js') }, { entry: 'main-oldENTRY.js', page: page('main-oldENTRY.js') }];
const records = superseded => [
  { entry: 'main-oldENTRY.js', deployedAt: '2026-10-20T00:00:00Z' },
  { entry: 'main-newENTRY.js', deployedAt: new Date(superseded).toISOString() },
];

test('active KTX2 and all nested runtime Basis files survive; only proven obsolete hashes expire', () => {
  const plan = createPrunePlan({ files: fixture(), entries: entries(), deployments: records(now - RETENTION_MS), now });
  assert.deepEqual(plan.removals.map(file => file.path).sort(), ['main-oldENTRY.js', 'stone-oldCOLOR.webp', 'world-oldWORLD.js']);
  assert.ok(plan.retained.some(file => file.path === 'stone-newCOLOR.ktx2'));
  for (const name of ['basis/basis_transcoder.js', 'basis/basis_transcoder.wasm', 'basis/basis_worker.js', 'asset-integrity.json']) assert.ok(plan.retained.some(file => file.path === name));
  assert.ok(plan.retained.some(file => file.path === 'unknown-OFFLINE1.webp'));
});

test('retention begins at the next successful deployment, never the old commit or file date', () => {
  const plan = createPrunePlan({ files: fixture(), entries: entries(), deployments: records(now - RETENTION_MS + 1), now });
  assert.equal(plan.removals.length, 0);
  assert.equal(plan.entries[1].retainUntil, new Date(now + 1).toISOString());
});

test('missing records and the last deployed entry fail closed even when new disk build exists', () => {
  assert.equal(createPrunePlan({ files: fixture(), entries: entries(), now }).removals.length, 0);
  assert.equal(createPrunePlan({ files: fixture(), entries: entries(), deployments: records(now).slice(0, 1), now }).removals.length, 0);
});

test('rollback to an earlier entry uses its most recent deployment for retention', () => {
  const deployments = [...records(now - 3 * RETENTION_MS), { entry: 'main-oldENTRY.js', deployedAt: new Date(now - 3600000).toISOString() }];
  const plan = createPrunePlan({ files: fixture(), entries: entries(), deployments, now });
  assert.equal(plan.removals.length, 0);
});

test('nested duplicate basenames resolve exact paths without leaking into other directories', () => {
  const files = new Map([
    ['main-newENTRY.js', file('import "./nested/child-newCHILD.js";')],
    ['nested/child-newCHILD.js', file('const map = new URL("image-newIMAGE.webp", import.meta.url);')],
    ['nested/image-newIMAGE.webp', file('selected')],
    ['other/image-newIMAGE.webp', file('unrelated')],
  ]);
  const graph = reachableAssets(page('main-newENTRY.js'), files);
  assert.ok(graph.seen.has('nested/image-newIMAGE.webp'));
  assert.ok(!graph.seen.has('other/image-newIMAGE.webp'));
});

test('absolute beta paths, CSS urls and query strings retain their exact dependencies', () => {
  const files = new Map([
    ['main-newENTRY.js', file('import "/beta/assets/style-newSTYLE.css";')],
    ['style-newSTYLE.css', file('main { background-image: url(./nested/image-newIMAGE.webp?v=2); }')],
    ['nested/image-newIMAGE.webp', file('selected')],
  ]);
  const graph = reachableAssets(page('main-newENTRY.js'), files);
  assert.equal(graph.seen.size, 3);
  assert.equal(graph.missing.size, 0);
});

test('missing active hashed imports abort planning instead of approving a broken build', () => {
  const files = fixture(); files.delete('stone-newCOLOR.ktx2');
  assert.throws(() => createPrunePlan({ files, entries: entries(), now }), /missing hashed dependencies/);
});

test('deployment records require successful timestamp shape and reject future or malformed entries', () => {
  for (const records of [null, [{ entry: '../../file.js', deployedAt: '2026-10-20T00:00:00Z' }], [{ entry: 'main-newENTRY.js', deployedAt: '2026-10-20' }], [{ entry: 'main-newENTRY.js', deployedAt: '2026-10-25T00:00:00Z' }]]) {
    assert.throws(() => validateDeployments(records, now));
  }
});

test('apply validates all content hashes before deleting any target', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'festival-prune-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'old-OLDHASH1.js'), 'first');
  await writeFile(path.join(root, 'old-OLDHASH2.js'), 'changed');
  const plan = { removals: [{ path: 'old-OLDHASH1.js', ...file('first') }, { path: 'old-OLDHASH2.js', ...file('second') }] };
  await assert.rejects(applyPrunePlan(root, plan), /changed since audit/);
  assert.equal(await readFile(path.join(root, 'old-OLDHASH1.js'), 'utf8'), 'first');
});

test('apply only unlinks audited regular files; rejects traversal and symlink parents', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'festival-prune-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'actual'));
  await writeFile(path.join(root, 'actual/old-OLDHASH1.js'), 'first');
  await symlink('actual', path.join(root, 'nested'));
  await assert.rejects(applyPrunePlan(root, { removals: [{ path: '../old-OLDHASH1.js', ...file('first') }] }), /Invalid deletion target/);
  await assert.rejects(applyPrunePlan(root, { removals: [{ path: 'nested/old-OLDHASH1.js', ...file('first') }] }), /symlink parent/);
  await applyPrunePlan(root, { removals: [{ path: 'actual/old-OLDHASH1.js', ...file('first') }] });
  await assert.rejects(readFile(path.join(root, 'actual/old-OLDHASH1.js')), /ENOENT/);
});

test('real published graph reaches every current integrity asset including nested Basis decoder', async () => {
  // This checks the actual Vite output. The quote scanner must survive large
  // embedded HTML/template strings without losing later import/new URL paths.
  const { readdir } = await import('node:fs/promises');
  const folder = new URL('../../docs/beta/assets/', import.meta.url);
  const files = new Map();
  async function scan(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await scan(new URL(`${entry.name}/`, directory), `${relative}/`);
      else files.set(relative, file(await readFile(new URL(entry.name, directory), 'utf8')));
    }
  }
  await scan(folder);
  const page = await readFile(new URL('../../docs/beta/index.html', import.meta.url), 'utf8');
  const graph = reachableAssets(page, files);
  assert.equal(graph.missing.size, 0);
  const integrity = JSON.parse(files.get('asset-integrity.json').text);
  for (const name of Object.keys(integrity)) {
    const key = [...files.keys()].find(key => path.posix.basename(key) === name);
    assert.ok(key && graph.seen.has(key), `active asset must survive pruning: ${name}`);
  }
});

test('a missing runtime-composed Basis dependency aborts the active compressed build', () => {
  const files = fixture();
  files.set('world-newWORLD.js', file('new URL("./assets/basis/", window.location.href);'));
  files.delete('basis/basis_transcoder.wasm');
  assert.throws(() => createPrunePlan({ files, entries: entries(), now }), /basis_transcoder\.wasm/);
});
