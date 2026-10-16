import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { AssetWorkQueue, encodedImageSize, fitTextureSize, decodeBudgetedImage, parseGameModel, mobileAssetBudgetEnabled } from '../src/world/MobileAssetBudget.ts';

const assets = ['avatars/male', 'avatars/female', 'band/stage', 'band/bonfire', 'band/vocal', 'band/drummer', 'band/guitarist', 'band/bass-player',
  'venue-scenery/valet', 'venue-scenery/box-office', 'venue-scenery/attendant', 'venue-scenery/temple-statue', 'venue-scenery/moth-arcade'];
const glb = async name => {
  const bytes = await readFile(`src/assets/${name}.glb`);
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length)), binary = bytes.subarray(28 + length);
  return { bytes, json, images: (json.images ?? []).map(image => {
    const view = json.bufferViews[image.bufferView];
    const bytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }) };
};

test('actual embedded PNG/JPEG/WebP dimensions produce a bounded mobile texture inventory', async () => {
  let source = 0, budgeted = 0, images = 0;
  for (const name of assets) {
    for (const bytes of (await glb(name)).images) {
      const size = encodedImageSize(bytes);
      assert.ok(size?.width > 0 && size?.height > 0, `unknown dimensions: ${name}`);
      const fitted = fitTextureSize(size.width, size.height);
      assert.ok(Math.max(fitted.width, fitted.height) <= 1024);
      assert.ok(Math.abs(fitted.width / fitted.height - size.width / size.height) < .01);
      source += size.width * size.height * 4;
      budgeted += fitted.width * fitted.height * 4;
      images++;
    }
  }
  assert.ok(images > 40);
  assert.ok(source > 390 * 1048576, `source images: ${source}`);
  assert.ok(budgeted / source < .3, `${budgeted / source} of original decoded allocation`);
});

test('truncated headers are safe and small/non-square images are never upscaled', () => {
  for (const size of [0, 1, 8, 16]) assert.equal(encodedImageSize(new ArrayBuffer(size)), undefined);
  assert.deepEqual(fitTextureSize(2048, 1024), { width: 1024, height: 512 });
  assert.deepEqual(fitTextureSize(780, 218), { width: 780, height: 218 });
});

test('mobile decode passes bounded dimensions before creating a bitmap, preserving GLTF colour/alpha semantics', async t => {
  const { images } = await glb('venue-scenery/valet');
  let calls = 0;
  const previous = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async (_source, options) => {
    calls++;
    assert.equal(options.resizeWidth, 1024); assert.equal(options.resizeHeight, 1024);
    assert.equal(options.colorSpaceConversion, 'none'); assert.equal(options.premultiplyAlpha, 'none');
    return { width: 1024, height: 1024, close() {} };
  };
  t.after(() => { if (previous) globalThis.createImageBitmap = previous; else delete globalThis.createImageBitmap; });
  await decodeBudgetedImage(new Blob([images[0]]));
  assert.equal(calls, 1, 'no full-resolution intermediate bitmap');
});

test('the mobile work queue serialises jobs and continues after a rejected model', async () => {
  const queue = new AssetWorkQueue(), sequence = [];
  let release;
  const first = queue.run(async () => { sequence.push('first'); await new Promise(resolve => { release = resolve; }); throw new Error('fixture'); });
  const second = queue.run(async () => { sequence.push('second'); return 42; });
  const rejected = assert.rejects(first, /fixture/);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sequence, ['first']); release();
  await rejected; assert.equal(await second, 42); assert.deepEqual(sequence, ['first', 'second']);
});

test('a decoder ignoring resize options closes the original and uses a bounded canvas fallback', async t => {
  const previousBitmap = globalThis.createImageBitmap, previousDocument = globalThis.document;
  let closed = 0, draws = 0, calls = 0;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() { draws++; } }) }) };
  globalThis.createImageBitmap = async source => {
    calls++;
    if (calls === 1) return { width: 2048, height: 2048, close() { closed++; } };
    assert.equal(source.width, 1024); assert.equal(source.height, 1024);
    return { width: source.width, height: source.height, close() {} };
  };
  t.after(() => { globalThis.createImageBitmap = previousBitmap; globalThis.document = previousDocument; });
  const bitmap = await decodeBudgetedImage(new Blob([(await glb('venue-scenery/valet')).images[0]]));
  assert.equal(bitmap.width, 1024); assert.equal(closed, 1); assert.equal(draws, 1);
});

test('desktop parsers remain untouched and coarse-pointer devices enable the mobile budget', async t => {
  let registrations = 0, parses = 0;
  const loader = { register() { registrations++; }, async parseAsync(bytes, path) { parses++; return { bytes, path }; } };
  const bytes = new ArrayBuffer(1);
  assert.deepEqual(await parseGameModel(loader, bytes, false), { bytes, path: '' });
  assert.equal(parses, 1); assert.equal(registrations, 0);
  const previous = globalThis.window;
  globalThis.window = { location: new URL('https://myscheduleltd.com/beta/'), matchMedia: () => ({ matches: true }) };
  t.after(() => { if (previous) globalThis.window = previous; else delete globalThis.window; });
  assert.equal(mobileAssetBudgetEnabled(), true);
  globalThis.window.matchMedia = () => ({ matches: false });
  assert.equal(mobileAssetBudgetEnabled(), false);
});

test('real mobile GLTF parsing preserves geometry, skeleton, UV and material properties with small decoded sources', async t => {
  const previousSelf = globalThis.self, previousBitmap = globalThis.createImageBitmap;
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async (blob, options) => {
    const size = encodedImageSize(await blob.arrayBuffer());
    assert.ok(size); assert.ok(options.resizeWidth <= 1024 && options.resizeHeight <= 1024);
    return { width: options.resizeWidth, height: options.resizeHeight, close() {} };
  };
  t.after(() => { globalThis.self = previousSelf; globalThis.createImageBitmap = previousBitmap; });
  const { bytes, json } = await glb('venue-scenery/attendant');
  const result = await parseGameModel(new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), true);
  let skinned = 0, textured = 0, positionCount = 0;
  result.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (mesh.isSkinnedMesh) { skinned++; assert.ok(mesh.skeleton.bones.length > 10); }
    positionCount += mesh.geometry.getAttribute('position').count;
    assert.ok(mesh.geometry.getAttribute('uv'));
    if (mesh.material.map) {
      textured++;
      assert.equal(mesh.material.map.image.width, 1024);
      assert.equal(mesh.material.normalMap.image.width, 1024);
      assert.equal(mesh.material.map.flipY, false);
      assert.equal(mesh.material.map.colorSpace, 'srgb');
      assert.equal(mesh.material.normalMap.colorSpace, '');
    }
  });
  assert.ok(skinned > 0);
  assert.ok(textured > 0);
  assert.equal(positionCount, json.meshes.flatMap(mesh => mesh.primitives).reduce((sum, p) => sum + json.accessors[p.attributes.POSITION].count, 0));
});
