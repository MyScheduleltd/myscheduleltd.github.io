import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/world/AssetMirror.ts'], bundle: true, write: false, format: 'esm' });

// The heavy files come from jsDelivr first and GitHub Pages second
// (src/world/AssetMirror.ts). What matters is that nothing unchecked is ever
// used, and that every failure of the mirror ends at the site's own copy.

const SITE = 'https://myscheduleltd.com/beta/';
const FILE = 'https://myscheduleltd.com/beta/assets/guitarist-CtIfyK1n.glb';
const MIRROR = 'https://cdn.jsdelivr.net/gh/MyScheduleltd/myscheduleltd.github.io@main/docs/beta/assets/guitarist-CtIfyK1n.glb';
const MANIFEST = 'https://myscheduleltd.com/beta/assets/asset-integrity.json';

const bytes = (text) => new TextEncoder().encode(text).buffer;
const hashOf = (text) => `sha256-${createHash('sha256').update(text).digest('base64')}`;
const text = (buffer) => new TextDecoder().decode(buffer);

let fresh = 0;
/** A new copy of the module (its memory of a failed mirror is per visit), on a stubbed network. */
async function visit(routes, href = SITE) {
  const asked = [];
  const here = new URL(href);
  globalThis.window = { location: here, setTimeout, clearTimeout };
  globalThis.fetch = async (url, options) => {
    asked.push(String(url));
    const route = routes[String(url)];
    if (route === undefined) return new Response('missing', { status: 404 });
    if (route instanceof Error) throw route;
    if (typeof route === 'function') return route(options);
    return typeof route === 'object' && 'json' in route
      ? new Response(JSON.stringify(route.json), { status: 200 })
      : new Response(route, { status: 200 });
  };
  fresh += 1;
  const mirror = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text + `\n// visit ${fresh}`).toString('base64')}`);
  return { mirror, asked };
}

test('a file the mirror has, and whose hash matches, never touches the site', async () => {
  const { mirror, asked } = await visit({
    [MANIFEST]: { json: { 'guitarist-CtIfyK1n.glb': hashOf('the real guitar') } },
    [MIRROR]: 'the real guitar',
  });
  assert.equal(text(await mirror.fetchAsset(FILE)), 'the real guitar');
  assert.deepEqual(asked, [MANIFEST, MIRROR]);
});

test('a copy that does not match the published hash is thrown away', async () => {
  const { mirror, asked } = await visit({
    [MANIFEST]: { json: { 'guitarist-CtIfyK1n.glb': hashOf('the real guitar') } },
    [MIRROR]: 'something else entirely',
    [FILE]: 'the real guitar',
  });
  assert.equal(text(await mirror.fetchAsset(FILE)), 'the real guitar');
  assert.equal(asked.at(-1), FILE, 'the site\'s own copy was used');
});

test('a file the mirror does not have yet comes from the site, and the mirror stays in use', async () => {
  const other = FILE.replace('guitarist-CtIfyK1n', 'drummer-UXXp3zjH');
  const { mirror, asked } = await visit({
    [MANIFEST]: { json: { 'guitarist-CtIfyK1n.glb': hashOf('new guitar'), 'drummer-UXXp3zjH.glb': hashOf('drums') } },
    [FILE]: 'new guitar',
    [MIRROR.replace('guitarist-CtIfyK1n', 'drummer-UXXp3zjH')]: 'drums',
  });
  assert.equal(text(await mirror.fetchAsset(FILE)), 'new guitar');
  assert.equal(text(await mirror.fetchAsset(other)), 'drums');
  assert.ok(asked.includes(MIRROR.replace('guitarist-CtIfyK1n', 'drummer-UXXp3zjH')), 'a 404 is about one file, not the mirror');
});

test('a mirror that cannot be reached is left alone for the rest of the visit', async () => {
  const other = FILE.replace('guitarist-CtIfyK1n', 'drummer-UXXp3zjH');
  const { mirror, asked } = await visit({
    [MANIFEST]: { json: { 'guitarist-CtIfyK1n.glb': hashOf('guitar'), 'drummer-UXXp3zjH.glb': hashOf('drums') } },
    [MIRROR]: new TypeError('network down'),
    [FILE]: 'guitar',
    [other]: 'drums',
  });
  assert.equal(text(await mirror.fetchAsset(FILE)), 'guitar');
  assert.equal(text(await mirror.fetchAsset(other)), 'drums');
  assert.ok(!asked.some((url) => url.includes('drummer') && url.includes('jsdelivr')), 'the mirror was not asked again');
});

test('a file with no published hash, or no list at all, is never taken from the mirror', async () => {
  const { mirror, asked } = await visit({ [MIRROR]: 'unverifiable', [FILE]: 'the real guitar' });
  assert.equal(text(await mirror.fetchAsset(FILE)), 'the real guitar');
  assert.ok(!asked.includes(MIRROR));
});

test('anywhere but the published site, the mirror is not used at all', async () => {
  const local = 'http://127.0.0.1:5173/assets/guitarist.glb';
  const { mirror, asked } = await visit({ [local]: 'local guitar' }, 'http://127.0.0.1:5173/');
  assert.equal(mirror.mirrorUrl(local), undefined);
  assert.equal(text(await mirror.fetchAsset(local)), 'local guitar');
  assert.deepEqual(asked, [local]);
  // And a file on another host is not rewritten into this repository's mirror.
  assert.equal(mirror.mirrorUrl('https://example.com/beta/assets/x.glb', new URL(SITE)), undefined);
  assert.equal(mirror.mirrorUrl(FILE, new URL('https://myscheduleltd.com/beta/ps2/')), MIRROR);
});

test('the site\'s own copy failing is reported, not swallowed', async () => {
  const { mirror } = await visit({});
  await assert.rejects(() => mirror.fetchAsset(FILE), /guitarist-CtIfyK1n\.glb: 404/);
});

test('a mirror body stalled after successful headers is cancelled and falls back to the site', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  let headers;
  const started = new Promise(resolve => { headers = resolve; });
  const { mirror, asked } = await visit({
    [MANIFEST]: { json: { 'guitarist-CtIfyK1n.glb': hashOf('guitar') } },
    [MIRROR]: options => {
      signal = options.signal;
      headers();
      return { ok: true, arrayBuffer: () => new Promise(() => {}) };
    },
    [FILE]: 'guitar',
  });
  const download = mirror.fetchAsset(FILE);
  await started;
  await Promise.resolve();
  t.mock.timers.tick(20_001);
  assert.equal(text(await download), 'guitar');
  assert.equal(signal.aborted, true);
  assert.equal(asked.at(-1), FILE);
});

test('a stalled integrity body stops holding the model download and uses the site', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  let headers;
  const started = new Promise(resolve => { headers = resolve; });
  const { mirror, asked } = await visit({
    [MANIFEST]: options => {
      signal = options.signal;
      headers();
      return { ok: true, json: () => new Promise(() => {}) };
    },
    [FILE]: 'guitar',
  });
  const download = mirror.fetchAsset(FILE);
  await started;
  t.mock.timers.tick(10_001);
  assert.equal(text(await download), 'guitar');
  assert.equal(signal.aborted, true);
  assert.ok(!asked.includes(MIRROR), 'no mirror asset without a verified hash');
});

test('a stalled site model rejects so entry can display a retry instead of waiting forever', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const { mirror } = await visit({
    [FILE]: options => {
      signal = options.signal;
      return { ok: true, arrayBuffer: () => new Promise(() => {}) };
    },
  }, 'http://localhost/');
  const failed = assert.rejects(mirror.fetchAsset(FILE), /download timed out/);
  t.mock.timers.tick(60_001);
  await failed;
  assert.equal(signal.aborted, true);
});

test('a slow model stays usable while chunks arrive and reports progress', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let stream;
  let askedForBody;
  const started = new Promise(resolve => { askedForBody = resolve; });
  const { mirror } = await visit({
    [FILE]: () => new Response(new ReadableStream({ start(controller) { stream = controller; askedForBody(); } })),
  }, 'http://localhost/');
  const progress = [];
  const stop = mirror.watchAssetDownloads(value => progress.push(value.received));
  const download = mirror.fetchAsset(FILE);
  await started;
  await Promise.resolve();
  for (const chunk of ['one', 'two', 'three']) {
    // Total transfer exceeds the old 60-second limit, but never stalls.
    t.mock.timers.tick(40_000);
    stream.enqueue(new TextEncoder().encode(chunk));
    await Promise.resolve();
    await Promise.resolve();
  }
  stream.close();
  assert.equal(text(await download), 'onetwothree');
  assert.deepEqual(progress, [3, 6, 11]);
  stop();
});

test('download progress uses a byte total only when it describes decoded data', async () => {
  for (const compressed of [false, true]) {
    const { mirror } = await visit({
      [FILE]: () => new Response('model bytes', { headers: {
        'content-length': compressed ? '4' : '11',
        ...(compressed ? { 'content-encoding': 'gzip' } : {}),
      } }),
    }, 'http://localhost/');
    const progress = [];
    const stop = mirror.watchAssetDownloads(value => progress.push(value));
    await mirror.fetchAsset(FILE);
    stop();
    assert.equal(progress.at(-1).received, 11);
    assert.equal(progress.at(-1).total, compressed ? undefined : 11);
  }
});
