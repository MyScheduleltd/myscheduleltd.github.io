import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: "export * from './src/world/EnvironmentMaterials'; export * as THREE from 'three'; export {applyWornStyle} from './src/world/WornStyle'; export {batchStaticScenery} from './src/world/StaticBatch';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { THREE, EnvironmentMaterials, tagEnvironmentSurface, excludeEnvironmentObject, environmentAssetsFromUrls, applyWornStyle, batchStaticScenery } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

function pngHeader(width = 2048, height = 2048) {
  const bytes = Buffer.alloc(24); bytes.writeUInt32BE(0x89504e47, 0); bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); return bytes;
}

function installNetwork(t, routes = {}) {
  const oldFetch = globalThis.fetch, oldWindow = globalThis.window, oldBitmap = globalThis.createImageBitmap;
  const requested = [], decoded = [], closed = [];
  globalThis.window = { location: new URL('http://127.0.0.1:4184/'), setTimeout, clearTimeout };
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('blob:')) return oldFetch(url, options);
    requested.push(String(url));
    const result = routes[String(url)];
    if (typeof result === 'function') return result(options);
    return result === false ? new Response('missing', { status: 404 }) : new Response(result ?? pngHeader());
  };
  globalThis.createImageBitmap = async (_blob, options) => {
    decoded.push(options);
    const bitmap = { width: options.resizeWidth, height: options.resizeHeight, close() { closed.push(bitmap); } };
    return bitmap;
  };
  t.after(() => { globalThis.fetch = oldFetch; globalThis.window = oldWindow; globalThis.createImageBitmap = oldBitmap; });
  return { requested, decoded, closed };
}

const urls = {
  color: 'http://127.0.0.1:4184/assets/brick.webp',
  normal: 'http://127.0.0.1:4184/assets/brick-normal.webp',
  roughness: 'http://127.0.0.1:4184/assets/brick-roughness.webp',
};

test('only the six installed tile sets and their optional data maps enter the manifest', () => {
  assert.deepEqual(environmentAssetsFromUrls({
    '../assets/environment/brick.webp': '/brick-A.webp',
    '../assets/environment/brick-normal.webp': '/brick-N.webp',
    '../assets/environment/wood-roughness.webp': '/wood-R.webp',
    '../assets/environment/character.webp': '/character.webp',
    '../assets/environment/stone-normal.png': '/stone.png',
  }), { brick: { color: '/brick-A.webp', normal: '/brick-N.webp' }, wood: { roughness: '/wood-R.webp' } });
});

test('shared tiles use the real mobile queue and retain metre scale, source geometry and PBR surfaces through batching', async t => {
  const network = installNetwork(t), scene = new THREE.Scene(), shared = new THREE.BoxGeometry();
  const originalUV = Array.from(shared.getAttribute('uv').array);
  const source = new THREE.MeshStandardMaterial({ color: 0x8a6050, flatShading: true, emissive: 0x222c32, emissiveIntensity: .2 });
  source.onBeforeCompile = shader => { shader.fragmentShader = 'old cel shader'; };
  const a = tagEnvironmentSurface(new THREE.Mesh(shared, source), 'brick', { metres: 2 });
  const b = tagEnvironmentSurface(new THREE.Mesh(shared, source), 'brick', { metres: 2 });
  a.scale.set(4, 2, 1); a.position.set(10, 3, -4); b.position.x = 20;
  const hiddenConsumer = new THREE.Mesh(shared, source); hiddenConsumer.visible = false;
  scene.add(a, b, hiddenConsumer);
  let sourceGeometryDisposed = 0, sourceMaterialDisposed = 0;
  shared.addEventListener('dispose', () => sourceGeometryDisposed++); source.addEventListener('dispose', () => sourceMaterialDisposed++);
  const library = new EnvironmentMaterials({ assets: { brick: urls }, mobile: true });
  const report = await library.prepare(scene);
  assert.deepEqual(network.requested, [urls.color, urls.normal, urls.roughness]);
  assert.equal(network.decoded.length, 3);
  for (const options of network.decoded) {
    assert.equal(options.resizeWidth, 1024); assert.equal(options.resizeHeight, 1024);
    assert.equal(options.colorSpaceConversion, 'none');
    assert.equal(options.imageOrientation, undefined);
  }
  assert.equal(report.applied, 2); assert.equal(report.materialVariants, 1); assert.equal(report.textures, 3);
  assert.equal(report.decodedBytes, 3 * 1024 * 1024 * 4); assert.equal(report.families.brick.state, 'ready');
  assert.equal(a.material, b.material); assert.equal(a.material.color.getHex(), source.color.getHex());
  assert.equal(a.material.emissive.getHex(), 0x222c32); assert.equal(a.material.emissiveIntensity, .2);
  assert.notEqual(a.material.emissive, source.emissive); assert.notEqual(a.material.onBeforeCompile, source.onBeforeCompile);
  assert.equal(a.material.flatShading, false); assert.equal(a.material.userData.preserveAuthoredSurface, true);
  assert.equal(a.material.map.colorSpace, THREE.SRGBColorSpace); assert.equal(a.material.normalMap.colorSpace, THREE.NoColorSpace);
  assert.equal(a.material.roughnessMap.colorSpace, THREE.NoColorSpace);
  assert.equal(a.material.map.flipY, false); assert.equal(a.material.normalMap.flipY, false);
  assert.equal(a.material.normalScale.x, .28); assert.equal(a.material.normalScale.y, -.28);
  assert.equal(a.material.map.wrapS, THREE.RepeatWrapping); assert.equal(a.material.map.magFilter, THREE.LinearFilter);
  assert.equal(a.material.map.minFilter, THREE.LinearMipmapLinearFilter);
  assert.notEqual(a.geometry, shared); assert.deepEqual(Array.from(shared.getAttribute('uv').array), originalUV);
  assert.equal(hiddenConsumer.geometry, shared); assert.equal(hiddenConsumer.material, source);
  assert.equal(sourceGeometryDisposed, 0); assert.equal(sourceMaterialDisposed, 0);
  const p = a.geometry.getAttribute('position'), uv = a.geometry.getAttribute('uv'), n = a.geometry.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) !== 1) continue;
    assert.ok(Math.abs(uv.getX(i) - (p.getX(i) * 4 + 10) / 2) < 1e-6);
    assert.ok(Math.abs(uv.getY(i) - (p.getZ(i) - 4) / 2) < 1e-6);
  }
  const changedGeometry = a.geometry;
  await library.prepare(scene); assert.equal(a.geometry, changedGeometry); assert.equal(network.requested.length, 3);
  applyWornStyle(scene);
  assert.equal(a.material.flatShading, false); assert.equal(a.material.userData.wornPatched, undefined);
  const batch = batchStaticScenery(scene);
  assert.equal(batch.batchedPieces, 2);
  const merged = scene.getObjectByName('static-batch');
  assert.equal(merged.material, a.material); assert.equal(merged.userData.wornNoMasonry, true);
  assert.equal(merged.material.userData.preserveAuthoredSurface, true);
  library.dispose(); library.dispose(); assert.equal(network.closed.length, 3);
});

test('source emissive colour and intensity remain independent cached material variants', async t => {
  installNetwork(t);
  const scene = new THREE.Scene();
  const sources = [
    new THREE.MeshStandardMaterial({ color: 0x8a6050, emissive: 0x222c32, emissiveIntensity: .2 }),
    new THREE.MeshStandardMaterial({ color: 0x8a6050, emissive: 0x222c32, emissiveIntensity: .2 }),
    new THREE.MeshStandardMaterial({ color: 0x8a6050, emissive: 0x112233, emissiveIntensity: .2 }),
    new THREE.MeshStandardMaterial({ color: 0x8a6050, emissive: 0x222c32, emissiveIntensity: .4 }),
  ];
  const meshes = sources.map(source => tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), source), 'brick'));
  scene.add(...meshes);
  const library = new EnvironmentMaterials({ assets: { brick: urls }, mobile: true });
  const report = await library.prepare(scene);
  assert.equal(report.materialVariants, 3);
  assert.equal(meshes[0].material, meshes[1].material);
  assert.notEqual(meshes[0].material, meshes[2].material); assert.notEqual(meshes[0].material, meshes[3].material);
  meshes.forEach((mesh, i) => {
    assert.equal(mesh.material.emissive.getHex(), sources[i].emissive.getHex());
    assert.equal(mesh.material.emissiveIntensity, sources[i].emissiveIntensity);
  });
  library.dispose();
});

test('desktop tiles use the same image-row orientation and normal convention as budgeted bitmaps', async t => {
  const network = installNetwork(t), loaded = [];
  const oldLoad = THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync = async function (url) {
    assert.ok(String(url).startsWith('blob:'));
    const texture = new THREE.Texture({ width: 1024, height: 1024 }); loaded.push(texture); return texture;
  };
  t.after(() => { THREE.TextureLoader.prototype.loadAsync = oldLoad; });
  const scene = new THREE.Scene(), mesh = tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), 'brick');
  scene.add(mesh);
  const library = new EnvironmentMaterials({ assets: { brick: urls }, mobile: false });
  await library.prepare(scene);
  assert.equal(loaded.length, 3); assert.equal(network.decoded.length, 0);
  assert.ok(loaded.every(texture => texture.flipY === false));
  assert.equal(mesh.material.normalScale.y, -mesh.material.normalScale.x);
  library.dispose();
});

test('explicit tags cannot replace authored GLBs, characters, signs, transparent foliage or carried props', async t => {
  const network = installNetwork(t), scene = new THREE.Scene();
  const add = material => {
    const mesh = tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), material), 'brick'); scene.add(mesh); return mesh;
  };
  const sign = add(new THREE.MeshBasicMaterial());
  const authored = add(new THREE.MeshStandardMaterial()); authored.material.userData.preserveAuthoredSurface = true;
  const foliage = add(new THREE.MeshStandardMaterial({ transparent: true }));
  const carried = add(new THREE.MeshStandardMaterial()); carried.userData.sculptRuntime = {};
  const character = add(new THREE.MeshStandardMaterial()), body = new THREE.Group(); body.name = 'character-body'; scene.add(body); body.add(character);
  const generated = add(new THREE.MeshStandardMaterial()); generated.userData.dynamic = true;
  const excluded = add(new THREE.MeshStandardMaterial()), excludedGroup = excludeEnvironmentObject(new THREE.Group()); scene.add(excludedGroup); excludedGroup.add(excluded);
  const skinned = tagEnvironmentSurface(new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), 'brick'); scene.add(skinned);
  const untagged = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); scene.add(untagged);
  const meshes = [sign, authored, foliage, carried, character, generated, excluded, skinned, untagged];
  const materials = meshes.map(mesh => mesh.material), geometries = meshes.map(mesh => mesh.geometry);
  const library = new EnvironmentMaterials({ assets: { brick: urls }, mobile: true });
  const report = await library.prepare(scene);
  assert.equal(report.applied, 0); assert.equal(report.tagged, 8); assert.equal(report.skipped, 8);
  assert.equal(network.requested.length, 0);
  meshes.forEach((mesh, i) => { assert.equal(mesh.material, materials[i]); assert.equal(mesh.geometry, geometries[i]); });
  library.dispose();
});

test('missing generation and failed optional maps retain usable surfaces and report the precise fallback', async t => {
  const network = installNetwork(t, { [urls.normal]: false }), scene = new THREE.Scene();
  const brick = tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), 'brick');
  const wood = tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), 'wood');
  const oldWood = wood.material, oldWoodGeometry = wood.geometry; scene.add(brick, wood);
  const library = new EnvironmentMaterials({ assets: { brick: urls }, mobile: true });
  const report = await library.prepare(scene);
  assert.equal(report.applied, 1); assert.equal(report.families.brick.state, 'partial');
  assert.equal(report.releasedGeometries, 1); assert.equal(report.releasedMaterials, 1);
  assert.match(report.families.brick.errors[0], /normal:.*404/);
  assert.deepEqual(report.families.brick.maps, ['color', 'roughness']); assert.equal(brick.material.normalMap, null);
  assert.equal(report.families.wood.state, 'missing'); assert.equal(wood.material, oldWood); assert.equal(wood.geometry, oldWoodGeometry);
  assert.equal(network.requested.length, 3);
  // Snapshots are values, so UI inspection cannot change loader state.
  report.families.brick.errors.length = 0; assert.equal(library.snapshot().families.brick.errors.length, 1);
  library.dispose();
});

test('only an explicitly tagged and opted-in venue floor may bypass projector-background protection', async t => {
  installNetwork(t);
  const scene = new THREE.Scene(), meshes = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), i === 3 ? new THREE.MeshBasicMaterial() : new THREE.MeshStandardMaterial());
    mesh.userData.projectorBackground = true;
    if (i !== 1) tagEnvironmentSurface(mesh, 'brick');
    if (i !== 2) mesh.userData.environmentAllowProjectorBackground = true;
    meshes.push(mesh); scene.add(mesh);
  }
  const originals = meshes.map(mesh => mesh.material);
  const library = new EnvironmentMaterials({ assets: { brick: { color: urls.color } }, mobile: true });
  const report = await library.prepare(scene, () => ({ family: 'brick' }));
  assert.equal(report.applied, 1); assert.notEqual(meshes[0].material, originals[0]);
  for (let i = 1; i < meshes.length; i++) assert.equal(meshes[i].material, originals[i]);
  library.dispose();
});

test('a failed base map skips unnecessary data maps and disposal during a download never mutates the world', async t => {
  const network = installNetwork(t, { [urls.color]: false }), scene = new THREE.Scene();
  const mesh = tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), 'brick'); scene.add(mesh);
  const source = mesh.material, sourceGeometry = mesh.geometry;
  const failed = new EnvironmentMaterials({ assets: { brick: urls }, mobile: true });
  assert.equal((await failed.prepare(scene)).families.brick.state, 'failed');
  assert.deepEqual(network.requested, [urls.color]); assert.equal(mesh.material, source); assert.equal(mesh.geometry, sourceGeometry); failed.dispose();
  let release, started;
  const waiting = new Promise(resolve => { started = resolve; });
  globalThis.fetch = async url => {
    assert.equal(String(url), urls.color); started(); return new Promise(resolve => { release = () => resolve(new Response(pngHeader())); });
  };
  const disposed = new EnvironmentMaterials({ assets: { brick: urls }, mobile: true });
  const pending = disposed.prepare(scene); await waiting; disposed.dispose(); release(); await pending;
  assert.equal(mesh.material, source); assert.equal(mesh.geometry, sourceGeometry); assert.equal(disposed.snapshot().textures, 0);
});
