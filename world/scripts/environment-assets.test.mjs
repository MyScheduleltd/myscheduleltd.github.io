import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: "export * from './src/world/EnvironmentAssets'; export * as THREE from 'three'; export {applyWornStyle} from './src/world/WornStyle'; export {batchStaticScenery,STATIC_PROP_NAMES} from './src/world/StaticBatch';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { THREE, EnvironmentAssets, ENVIRONMENT_ASSET_ROOT, fitEnvironmentModel, environmentModelAssetsFromUrls, applyWornStyle, batchStaticScenery, STATIC_PROP_NAMES } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
test('phones select lighter hero files deterministically while desktop keeps full detail',()=>{
  const files={'../assets/environment/statue-mobile.glb':'/statue-phone.glb','../assets/environment/statue.glb':'/statue-full.glb','../assets/environment/street-lamp.glb':'/lamp.glb'};
  assert.deepEqual(environmentModelAssetsFromUrls(files,true),{statue:'/statue-phone.glb','street-lamp':'/lamp.glb'});
  assert.deepEqual(environmentModelAssetsFromUrls(files,false),{statue:'/statue-full.glb','street-lamp':'/lamp.glb'});
});
const fitSource = () => {
  const source = new THREE.Group(), geometry = new THREE.BoxGeometry(2, 4, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); mesh.position.set(5, -3, 8); source.add(mesh);
  return { source, mesh, geometry };
};

test('only installed environment GLB model names enter the runtime manifest', () => {
  assert.deepEqual(environmentModelAssetsFromUrls({
    '../assets/environment/street-lamp.glb': '/lamp-A.glb',
    '../assets/environment/pamphlet-stand.glb': '/pamphlet-B.glb',
    '../assets/environment/cinema-pilaster.glb': '/pilaster-C.glb',
    '../assets/environment/statue.glb': '/statue-D.glb',
    '../assets/environment/drive-in-car.glb': '/car-E.glb',
    '../assets/environment/brick.webp': '/brick.webp',
    '../assets/environment/avatar.glb': '/avatar.glb',
  }), { 'street-lamp': '/lamp-A.glb', 'pamphlet-stand': '/pamphlet-B.glb', 'cinema-pilaster': '/pilaster-C.glb', statue: '/statue-D.glb', 'drive-in-car':'/car-E.glb' });
});

test('uniform fitting measures the chosen facing, honors all maxima and anchors the feet without changing source geometry', () => {
  const { source, mesh, geometry } = fitSource(), positions = Array.from(geometry.getAttribute('position').array);
  const fit = fitEnvironmentModel(source, { yaw: Math.PI / 2, height: 8, maxWidth: 1.5, maxDepth: 3, maxHeight: 7 });
  near(fit.size.x, 1.5); near(fit.size.y, 6); near(fit.size.z, 3);
  near(fit.scale.x, 1.5); near(fit.scale.y, 1.5); near(fit.scale.z, 1.5);
  near(fit.bounds.min.y, 0); near(fit.bounds.min.x + fit.bounds.max.x, 0); near(fit.bounds.min.z + fit.bounds.max.z, 0);
  assert.deepEqual(mesh.position.toArray(), [5, -3, 8]); assert.deepEqual(Array.from(geometry.getAttribute('position').array), positions);
  assert.equal(fit.model.children[0].geometry, geometry); assert.equal(fit.model.children[0].material, mesh.material);
});

test('explicit exactSize fits the yawed bounds, including non-quarter turns, while invalid fits are rejected', () => {
  const { source } = fitSource();
  const fitted = fitEnvironmentModel(source, { yaw: .63, exactSize: [2.05, 1.9, 1.12] });
  fitted.size.toArray().forEach((value, i) => near(value, [2.05, 1.9, 1.12][i])); near(fitted.bounds.min.y, 0);
  for (const options of [{ height: 0 }, { maxWidth: -1 }, { maxDepth: NaN }, { yaw: Infinity }, { exactSize: [2, 0, 3] }]) assert.throws(() => fitEnvironmentModel(source, options), /finite|positive/);
  assert.throws(() => fitEnvironmentModel(new THREE.Group()), /positive/);
});

function fixtureGlb(animated = false) {
  const positions = new Float32Array([-1, 0, -.5, 1, 0, .5, 0, 2, 0]), times = new Float32Array([0, 1, 2]);
  const image = Buffer.alloc(24); image.writeUInt32BE(0x89504e47, 0); image.writeUInt32BE(0x0d0a1a0a, 4); image.writeUInt32BE(1, 16); image.writeUInt32BE(1, 20);
  const binary = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(times.buffer), image]);
  const doc = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [3, -2, 4] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: .63, metallicFactor: .12 } }],
    images: [{ bufferView: 2, mimeType: 'image/png' }], textures: [{ source: 0 }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 12 }, { buffer: 0, byteOffset: 48, byteLength: image.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, -.5], max: [1, 2, .5] }, { bufferView: 1, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [2] }],
    ...(animated ? { animations: [{ samplers: [{ input: 1, output: 0 }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }] } : {}),
  };
  const json = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const header = Buffer.alloc(20), chunk = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  chunk.writeUInt32LE(binary.length, 0); chunk.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, chunk, binary]);
}

function network(t, bytes = fixtureGlb()) {
  const oldFetch = globalThis.fetch, oldWindow = globalThis.window, oldSelf = globalThis.self, oldBitmap = globalThis.createImageBitmap;
  const requests = [], closed = [];
  globalThis.window = { location: new URL('http://127.0.0.1:4184/'), setTimeout, clearTimeout };
  globalThis.self = globalThis;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('blob:')) return oldFetch(url, options);
    requests.push(String(url)); return bytes === false ? new Response('missing', { status: 404 }) : new Response(bytes);
  };
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() { closed.push(this); } });
  t.after(() => { globalThis.fetch = oldFetch; globalThis.window = oldWindow; globalThis.self = oldSelf; globalThis.createImageBitmap = oldBitmap; });
  return { requests, closed };
}

const url = 'http://127.0.0.1:4184/assets/street-lamp.glb';
const findMesh = root => { let found; root.traverse(object => { if (object.isMesh) found = object; }); return found; };

test('real GLTF loading is shared across placements, preserves PBR and enters static batching', async t => {
  const { requests } = network(t), scene = new THREE.Scene();
  const fallbackA = new THREE.Object3D(), fallbackB = new THREE.Object3D();
  const assets = new EnvironmentAssets({ assets: { 'street-lamp': url }, mobile: true });
  const first = assets.attach('street-lamp', scene, { height: 5.35, maxWidth: .84, maxDepth: .84, fallback: [fallbackA] });
  const second = assets.attach('street-lamp', scene, { exactSize: [.84, 5.35, .84], castShadow: true, fallback: [fallbackB] });
  assert.equal(fallbackA.visible, true); assert.equal(fallbackB.visible, true);
  await assets.ready(); assert.equal(await first, true); assert.equal(await second, true); assert.deepEqual(requests, [url]);
  assert.equal(fallbackA.visible, false); assert.equal(fallbackB.visible, false);
  const a = findMesh(scene.children[0]), b = findMesh(scene.children[1]);
  assert.equal(a.geometry, b.geometry); assert.equal(a.material, b.material);
  near(a.material.roughness, .63); near(a.material.metalness, .12);
  assert.equal(a.material.userData.preserveAuthoredSurface, true); assert.equal(a.userData.dynamic, undefined);
  assert.ok(a.layers.mask & 2); assert.ok(b.layers.mask & 2); assert.equal(a.castShadow, false); assert.equal(b.castShadow, true);
  const before = a.material.roughness; applyWornStyle(scene); assert.equal(a.material.roughness, before); assert.equal(a.material.userData.wornPatched, undefined);
  assert.ok(STATIC_PROP_NAMES.has(ENVIRONMENT_ASSET_ROOT));
  // Matching shadow roles can merge despite each instance's fitted wrapper.
  b.castShadow = false; assert.equal(batchStaticScenery(scene).batchedPieces, 2);
  const report = assets.snapshot(); assert.equal(report.sources['street-lamp'].triangles, 1); assert.equal(report.instances.length, 2);
  report.errors['street-lamp'] = ['changed']; assert.equal(assets.snapshot().errors['street-lamp'], undefined);
  assets.dispose();
});

test('the victory statue uses real flat face shading and the temple matte response without altering other models', async t => {
  network(t); const scene = new THREE.Scene();
  const assets = new EnvironmentAssets({ assets: { 'victory-statue': url } });
  await assets.attach('victory-statue', scene, { height: 7.3, maxWidth: 7.6 });
  const mesh = findMesh(scene);
  assert.equal(mesh.material.flatShading, true);
  near(mesh.material.roughness, .8); near(mesh.material.metalness, 0);
  assert.equal(mesh.material.userData.victoryBlockySurface, true);
  assert.equal(mesh.material.isMeshStandardMaterial, true, 'scene light and shadow response remains enabled');
  assets.dispose();
});

test('fit/load failures retain fallback; animated models are rejected before replacing scenery', async t => {
  network(t, fixtureGlb(true));
  const scene = new THREE.Scene(), fallback = new THREE.Object3D();
  const assets = new EnvironmentAssets({ assets: { 'street-lamp': url }, mobile: true });
  assert.equal(await assets.attach('street-lamp', scene, { height: 4, fallback: [fallback] }), false);
  assert.equal(fallback.visible, true); assert.equal(scene.children.length, 0);
  assert.match(assets.snapshot().errors['street-lamp'][0], /must not contain animation/); assets.dispose();
});

test('unique shared resources are released once, and a disposed loader cannot place later downloads', async t => {
  const { closed } = network(t), scene = new THREE.Scene();
  const assets = new EnvironmentAssets({ assets: { 'street-lamp': url }, mobile: true });
  await Promise.all([assets.attach('street-lamp', scene), assets.attach('street-lamp', scene)]);
  const mesh = findMesh(scene.children[0]), counts = { geometry: 0, material: 0, texture: 0 };
  mesh.geometry.addEventListener('dispose', () => counts.geometry++); mesh.material.addEventListener('dispose', () => counts.material++); mesh.material.map.addEventListener('dispose', () => counts.texture++);
  assets.dispose(); assets.dispose(); assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 }); assert.equal(closed.length, 1); assert.equal(scene.children.length, 0);
  let release, started; const requested = new Promise(resolve => { started = resolve; });
  globalThis.fetch = async () => { started(); return new Promise(resolve => { release = () => resolve(new Response(fixtureGlb())); }); };
  const disposed = new EnvironmentAssets({ assets: { 'street-lamp': url }, mobile: true }), fallback = new THREE.Object3D();
  const pending = disposed.attach('street-lamp', scene, { fallback: [fallback] }); await requested; disposed.dispose(); release();
  assert.equal(await pending, false); assert.equal(fallback.visible, true); assert.equal(scene.children.length, 0);
});

test('missing files and invalid dimensions are reported without hiding the fallback', async t => {
  network(t);
  const scene = new THREE.Scene(), fallback = new THREE.Object3D();
  const absent = new EnvironmentAssets({ assets: {}, mobile: true });
  assert.equal(await absent.attach('statue', scene, { fallback: [fallback] }), false); assert.equal(fallback.visible, true);
  assert.match(absent.snapshot().errors.statue[0], /No statue\.glb installed/); absent.dispose();
  const invalid = new EnvironmentAssets({ assets: { 'street-lamp': url }, mobile: true });
  assert.equal(await invalid.attach('street-lamp', scene, { height: -2, fallback: [fallback] }), false); assert.equal(fallback.visible, true); assert.equal(scene.children.length, 0);
  assert.equal(await invalid.attach('street-lamp', scene, { fallback: [scene] }), false); assert.equal(scene.visible, true);
  invalid.dispose();
});
