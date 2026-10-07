import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

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
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const route = routes[String(url)];
    if (route === undefined) return new Response('missing', { status: 404 });
    if (route instanceof Error) throw route;
    return typeof route === 'object' && 'json' in route
      ? new Response(JSON.stringify(route.json), { status: 200 })
      : new Response(route, { status: 200 });
  };
  fresh += 1;
  const mirror = await import(`../src/world/AssetMirror.ts?visit=${fresh}`);
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
