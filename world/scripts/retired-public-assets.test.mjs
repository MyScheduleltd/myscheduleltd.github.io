import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const script = name => readFile(new URL(`docs/js/${name}.js`, root), 'utf8');
async function siteData() {
  const source = await script('allData');
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
}

test('archived public portraits are absent; all remaining live site data matches its pre-cleanup baseline', async () => {
  const manifest = JSON.parse(await readFile(new URL('world/art/cleanup-20261024/retired-portraits-manifest.json', root), 'utf8'));
  assert.equal(manifest.files.length, 12);
  assert.equal(manifest.bytesRemovedFromPublication, 118391458);
  for (const image of manifest.files) await assert.rejects(access(new URL(image.publishedPath, root)), { code: 'ENOENT' });
  const data = await siteData();
  assert.ok(!Object.hasOwn(data, 'memberData'));
  assert.deepEqual(Object.keys(data), manifest.remainingSiteDataKeys);
  assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'), manifest.remainingSiteDataSha256);
});

async function mountScript(name, phone) {
  const rendered = [];
  const handlers = [];
  const $ = selector => {
    if (typeof selector === 'function') { selector(); return; }
    return {
      append: html => rendered.push({ selector, html }),
      on: (...args) => handlers.push({ selector, args }),
      innerHeight: () => 32,
      css: () => {},
      length: rendered.filter(item => selector === '.aboutVideos3 .iframe-videos' && item.selector === '.aboutVideos3').length,
    };
  };
  const body = (await script(name)).replace(/^import data from '\.\/allData\.js';\s*/, '');
  const context = { $, data: await siteData(), window: { innerWidth: phone ? 390 : 1440,
    matchMedia: () => ({ matches: phone, addEventListener: () => {} }) },
    youtube_parser: value => new URL(value).pathname.split('/').pop() };
  vm.runInNewContext(body, context, { filename: `docs/js/${name}.js` });
  return { rendered, handlers };
}

test('ABOUT still mounts two desktop films or three phone films, with its film modal action intact', async () => {
  for (const phone of [false, true]) {
    const { rendered, handlers } = await mountScript('about', phone);
    assert.equal(rendered.length, phone ? 3 : 2);
    assert.ok(rendered.every(item => item.html.includes('<iframe') && !item.html.includes('<img')));
    assert.equal(handlers.length, 1);
    assert.equal(handlers[0].selector, '.videos-wrapper');
    assert.equal(handlers[0].args[0], 'click');
  }
});

test('CONTACT keeps its background film and neither consumer needs dormant member data', async () => {
  const { rendered } = await mountScript('contact', true);
  assert.equal(rendered.length, 1);
  assert.ok(rendered[0].html.includes('<iframe'));
  for (const name of ['about', 'contact', 'allData']) assert.doesNotMatch(await script(name), /memberData|assets\/member\//);
});
