import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: "export * from './src/world/EnvironmentMaterials'; export * as THREE from 'three'; export {applyWornStyle} from './src/world/WornStyle'; export {batchStaticScenery} from './src/world/StaticBatch';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { THREE, EnvironmentMaterials, tagEnvironmentSurface, excludeEnvironmentObject, applyWornStyle, batchStaticScenery } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

// The PS1 look's drawn tiles (Ps1Surfaces) stand in as tiny shared textures.
function drawnTiles() {
  const tiles = new Map(), asked = [];
  const drawnTile = family => {
    asked.push(family);
    if (!tiles.has(family)) tiles.set(family, new THREE.DataTexture(new Uint8Array(4), 1, 1));
    return tiles.get(family);
  };
  return { drawnTile, tiles, asked };
}

test('shared drawn tiles keep metre scale, source geometry and authored values through batching', async () => {
  const { drawnTile, tiles, asked } = drawnTiles(), scene = new THREE.Scene(), shared = new THREE.BoxGeometry();
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
  const library = new EnvironmentMaterials({ drawnTile });
  const report = await library.prepare(scene);
  assert.deepEqual(asked, ['brick'], 'one tile per family, asked for once');
  assert.equal(report.applied, 2); assert.equal(report.materialVariants, 1); assert.equal(report.textures, 1);
  assert.equal(report.families.brick.state, 'ready'); assert.equal(report.families.wood.state, 'unused');
  assert.equal(a.material, b.material); assert.equal(a.material.map, tiles.get('brick'));
  assert.equal(a.material.color.getHex(), source.color.getHex());
  assert.equal(a.material.emissive.getHex(), 0x222c32); assert.equal(a.material.emissiveIntensity, .2);
  assert.notEqual(a.material.emissive, source.emissive); assert.notEqual(a.material.onBeforeCompile, source.onBeforeCompile);
  assert.equal(a.material.flatShading, false); assert.equal(a.material.userData.preserveAuthoredSurface, true);
  assert.equal(a.material.normalMap, null); assert.equal(a.material.roughnessMap, null);
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
  await library.prepare(scene); assert.equal(a.geometry, changedGeometry); assert.deepEqual(asked, ['brick']);
  applyWornStyle(scene);
  assert.equal(a.material.flatShading, false); assert.equal(a.material.userData.wornPatched, undefined);
  const batch = batchStaticScenery(scene);
  assert.equal(batch.batchedPieces, 2);
  const merged = scene.getObjectByName('static-batch');
  assert.equal(merged.material, a.material); assert.equal(merged.userData.wornNoMasonry, true);
  assert.equal(merged.material.userData.preserveAuthoredSurface, true);
  let disposedMaterials = 0; a.material.addEventListener('dispose', () => disposedMaterials++);
  let disposedTiles = 0; tiles.get('brick').addEventListener('dispose', () => disposedTiles++);
  library.dispose(); library.dispose();
  assert.equal(disposedMaterials, 1); assert.equal(disposedTiles, 0, 'drawn tiles are shared across worlds');
});

test('source emissive colour and intensity remain independent cached material variants', async () => {
  const scene = new THREE.Scene();
  const sources = [
    new THREE.MeshStandardMaterial({ color: 0x8a6050, emissive: 0x222c32, emissiveIntensity: .2 }),
    new THREE.MeshStandardMaterial({ color: 0x8a6050, emissive: 0x222c32, emissiveIntensity: .2 }),
    new THREE.MeshStandardMaterial({ color: 0x8a6050, emissive: 0x112233, emissiveIntensity: .2 }),
    new THREE.MeshStandardMaterial({ color: 0x8a6050, emissive: 0x222c32, emissiveIntensity: .4 }),
  ];
  const meshes = sources.map(source => tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), source), 'brick'));
  scene.add(...meshes);
  const library = new EnvironmentMaterials(drawnTiles());
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

test('only the explicit overhead cutaway role survives tile replacement and stays separate through style and batching',async()=>{
  const {drawnTile,asked}=drawnTiles(),scene=new THREE.Scene(),meshes=[];
  for(let i=0;i<4;i++){
    const source=new THREE.MeshStandardMaterial({color:0x4b4440});
    source.defines={WORN_STYLE:'',UNRELATED_SOURCE_PATCH:'',...(i<2?{CUTAWAY_OVERHEAD:''}:{})};
    const mesh=tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(21,.3,.25),source),'wood');
    mesh.position.set(0,9.91,i*3);mesh.userData.wornNoMasonry=true;meshes.push(mesh);scene.add(mesh);
  }
  const library=new EnvironmentMaterials({drawnTile});
  const report=await library.prepare(scene);assert.equal(report.materialVariants,2);assert.deepEqual(asked,['wood'],'the variants still share one tile');
  assert.equal(meshes[0].material,meshes[1].material);assert.equal(meshes[2].material,meshes[3].material);assert.notEqual(meshes[0].material,meshes[2].material);
  for(const [i,mesh]of meshes.entries()){
    assert.equal(mesh.material.defines?.CUTAWAY_OVERHEAD,i<2?'':undefined);
    assert.equal(mesh.material.defines?.WORN_STYLE,undefined);assert.equal(mesh.material.defines?.UNRELATED_SOURCE_PATCH,undefined);
  }
  applyWornStyle(scene);batchStaticScenery(scene);
  const batches=scene.children.filter(o=>o.isMesh);assert.equal(batches.length,2);
  assert.equal(batches.filter(o=>o.material.defines?.CUTAWAY_OVERHEAD!==undefined).length,1);
  assert.ok(batches.every(o=>o.geometry.attributes.position.count>0&&o.material.map));
  library.dispose();
});

test('explicit tags cannot replace authored GLBs, characters, signs, transparent foliage or carried props', async () => {
  const { drawnTile, asked } = drawnTiles(), scene = new THREE.Scene();
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
  const library = new EnvironmentMaterials({ drawnTile });
  const report = await library.prepare(scene);
  assert.equal(report.applied, 0); assert.equal(report.tagged, 8); assert.equal(report.skipped, 8);
  assert.equal(asked.length, 0, 'no tile is drawn for surfaces that are all refused');
  meshes.forEach((mesh, i) => { assert.equal(mesh.material, materials[i]); assert.equal(mesh.geometry, geometries[i]); });
  library.dispose();
});

test('only an explicitly tagged and opted-in venue floor may bypass projector-background protection', async () => {
  const scene = new THREE.Scene(), meshes = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), i === 3 ? new THREE.MeshBasicMaterial() : new THREE.MeshStandardMaterial());
    mesh.userData.projectorBackground = true;
    if (i !== 1) tagEnvironmentSurface(mesh, 'brick');
    if (i !== 2) mesh.userData.environmentAllowProjectorBackground = true;
    meshes.push(mesh); scene.add(mesh);
  }
  const originals = meshes.map(mesh => mesh.material);
  const library = new EnvironmentMaterials(drawnTiles());
  const report = await library.prepare(scene, () => ({ family: 'brick' }));
  assert.equal(report.applied, 1); assert.notEqual(meshes[0].material, originals[0]);
  for (let i = 1; i < meshes.length; i++) assert.equal(meshes[i].material, originals[i]);
  library.dispose();
});

test('a disposed library never mutates the world', async () => {
  const scene = new THREE.Scene();
  const mesh = tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), 'brick'); scene.add(mesh);
  const source = mesh.material, sourceGeometry = mesh.geometry;
  const library = new EnvironmentMaterials(drawnTiles());
  library.dispose();
  const report = await library.prepare(scene);
  assert.equal(report.applied, 0); assert.equal(mesh.material, source); assert.equal(mesh.geometry, sourceGeometry);
});
