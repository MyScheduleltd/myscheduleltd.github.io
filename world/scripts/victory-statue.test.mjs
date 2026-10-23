import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const compiled = await build({ stdin: { contents: "export * from './src/world/VictoryStatue';export {VenueSceneryAssets} from './src/world/VenueSceneryAssets';export {createGanganStatue} from './src/world/GanganStatue';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', loader: { '.png': 'dataurl' } });
const { THREE, GLTFLoader, createVictoryStatue, disposeVictoryStatue, victorySupportBounds, VICTORY_STATUE_HEIGHT, VICTORY_PLINTH_TOP, VenueSceneryAssets } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const file = 'src/assets/venue-scenery/temple-statue.glb', bytes = await readFile(file), hash = createHash('sha256').update(bytes).digest('hex');
async function portrait() {
  const length = bytes.readUInt32LE(12), document = JSON.parse(bytes.subarray(20, 20 + length));
  // Preserve all mesh/skin buffers exactly; pixel decoding belongs to browser QA.
  document.materials = document.materials.map(material => ({ ...material, pbrMetallicRoughness: { ...material.pbrMetallicRoughness, baseColorTexture: undefined, metallicRoughnessTexture: undefined }, normalTexture: undefined, emissiveTexture: undefined, occlusionTexture: undefined }));
  delete document.images; delete document.textures;
  const json = Buffer.from(JSON.stringify(document)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const header = Buffer.from(bytes.subarray(0, 20)), binary = bytes.subarray(20 + length);
  header.writeUInt32LE(20 + padded.length + binary.length, 8); header.writeUInt32LE(padded.length, 12);
  const clean = Buffer.concat([header, padded, binary]);
  return (await new GLTFLoader().parseAsync(clean.buffer.slice(clean.byteOffset, clean.byteOffset + clean.byteLength), '')).scene;
}
const joint = (model, name) => model.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const direction = (model, from, to) => joint(model, to).sub(joint(model, from)).normalize();

test('the exact temple portrait face, hair and beard are reused without changing the seated source', async () => {
  const source = await portrait(); source.updateMatrixWorld(true);
  const originalBones = new Map(), originalMeshes = [];
  source.traverse(node => { if (node.isBone) originalBones.set(node.name, node.matrixWorld.toArray()); if (node.isMesh) originalMeshes.push({ node, geometry: node.geometry, material: node.material, bytes: new Uint8Array(node.geometry.attributes.position.array.buffer).slice() }); });
  const victory = createVictoryStatue(source); victory.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    const sign = side === 'Left' ? 1 : -1, shoulder = joint(victory, `${side}Arm`), hand = joint(victory, `${side}Hand`);
    assert.ok(hand.y > joint(victory, 'Head').y, `${side} hand must be above the face`);
    assert.ok((hand.x - shoulder.x) * sign > 1, `${side} V silhouette must reach outward`);
    assert.ok(direction(victory, `${side}Arm`, `${side}ForeArm`).y > .7);
  }
  for (const [name, matrix] of originalBones) assert.deepEqual(source.getObjectByName(name).matrixWorld.toArray(), matrix);
  for (const original of originalMeshes) assert.deepEqual(new Uint8Array(original.geometry.attributes.position.array.buffer), original.bytes);
  const head = victory.getObjectByName('Exact temple portrait head'), original = originalMeshes[0];
  assert.notEqual(head.geometry, original.geometry); assert.equal(head.material, original.material);
  const ids = head.userData.sourceVertexIds, selected = head.userData.sourceTriangleIndices, sourceIndices = original.geometry.index.array;
  assert.ok(selected.length / 3 > 100 && selected.length / 3 < 935);
  assert.deepEqual(Array.from(head.geometry.index.array, i => ids[i]), selected, 'portrait keeps the selected source triangles');
  const sourceTriangles = new Set(Array.from({length:sourceIndices.length/3}, (_,i) => Array.from(sourceIndices.slice(i*3,i*3+3)).join(',')));
  for (let i=0;i<selected.length;i+=3) assert.ok(sourceTriangles.has(selected.slice(i,i+3).join(',')));
  for (let i=0;i<ids.length;i++) {
    assert.equal(head.geometry.attributes.uv.getX(i), original.geometry.attributes.uv.getX(ids[i]));
    assert.equal(head.geometry.attributes.uv.getY(i), original.geometry.attributes.uv.getY(ids[i]));
  }
  // Every extracted head edge retains one shared uniform scale: no portrait morph.
  original.node.skeleton.update(); const a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3(), d=new THREE.Vector3(); let scale;
  for(let i=1;i<ids.length;i++) {
    original.node.getVertexPosition(ids[0],a).applyMatrix4(original.node.matrixWorld); original.node.getVertexPosition(ids[i],b).applyMatrix4(original.node.matrixWorld);
    c.fromBufferAttribute(head.geometry.attributes.position,0);d.fromBufferAttribute(head.geometry.attributes.position,i);
    const ratio=c.distanceTo(d)/a.distanceTo(b); if(scale===undefined) scale=ratio; else assert.ok(Math.abs(ratio-scale)<1e-5);
  }
  assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), hash);
});

function geometricEdges(geometry) {
  const positions=geometry.attributes.position, indices=geometry.index.array, edges=new Map(), point=i=>[positions.getX(i),positions.getY(i),positions.getZ(i)].map(x=>Math.round(x*1e5)).join(',');
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<indices.length;i+=3) {
    const tri=Array.from(indices.slice(i,i+3));a.fromBufferAttribute(positions,tri[0]);b.fromBufferAttribute(positions,tri[1]);c.fromBufferAttribute(positions,tri[2]);
    if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-14) continue;
    for(let j=0;j<3;j++){const key=[point(tri[j]),point(tri[(j+1)%3])].sort().join('|');edges.set(key,(edges.get(key)??0)+1);}
  }
  return edges;
}

test('closed authored runner geometry removes seated-robe webbing, remains lightweight and disposes only owned buffers', async () => {
  const source=await portrait(), victory=createVictoryStatue(source); let draws=0,triangles=0,owned=0; const counts=new Map();
  victory.traverse(mesh=>{if(!mesh.isMesh)return;draws++;triangles+=mesh.geometry.index.count/3;assert.ok(!mesh.isSkinnedMesh);
    mesh.geometry.addEventListener('dispose',()=>counts.set(mesh.geometry,(counts.get(mesh.geometry)??0)+1));
    if(mesh.userData.victoryOwnedMaterial){owned++;assert.ok(mesh.material.userData.preserveAuthoredSurface);assert.ok(!mesh.material.map);for(const count of geometricEdges(mesh.geometry).values()) assert.equal(count,2,'each nondegenerate body surface must be closed');mesh.material.addEventListener('dispose',()=>counts.set(mesh.material,(counts.get(mesh.material)??0)+1));}
  });
  assert.equal(draws,3);assert.equal(owned,2);assert.ok(triangles<5000);
  let sourceDisposed=0;source.traverse(mesh=>{if(mesh.isMesh)mesh.material.addEventListener('dispose',()=>sourceDisposed++);});
  disposeVictoryStatue(victory);disposeVictoryStatue(victory);
  assert.equal(counts.size,5);for(const count of counts.values()) assert.equal(count,1);assert.equal(sourceDisposed,0);
});

test('one real foot supports the posed body at the plinth while the other knee lifts forward; bounds remain inside the existing projector volume', async () => {
  const victory = createVictoryStatue(await portrait()), bounds = new THREE.Box3().setFromObject(victory), support = victorySupportBounds(victory);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).y - VICTORY_STATUE_HEIGHT) < 1e-6);
  assert.ok(Math.abs(support.min.y) < 1e-6); const centre = support.getCenter(new THREE.Vector3()); assert.ok(Math.abs(centre.x) < 1e-6 && Math.abs(centre.z) < 1e-6);
  assert.ok(direction(victory, 'RightUpLeg', 'RightLeg').y < -.99); assert.ok(direction(victory, 'RightLeg', 'RightFoot').y < -.99);
  assert.ok(direction(victory, 'LeftUpLeg', 'LeftLeg').z > .8); assert.ok(direction(victory, 'LeftLeg', 'LeftFoot').y < -.7);
  assert.ok(joint(victory, 'LeftLeg').y > joint(victory, 'RightLeg').y + 1);
  const front = direction(victory, 'Head', 'headfront'); assert.ok(front.z > .2 && Math.abs(front.x) < 1e-6, 'portrait must face +Z toward the gate');
  assert.ok(bounds.max.y + VICTORY_PLINTH_TOP <= 9.8 + 1e-6); assert.ok(bounds.min.y >= -.04);
  assert.ok(bounds.min.x >= -3.8 && bounds.max.x <= 3.8, 'extended arms must stay within the 7.6 projector width'); assert.ok(bounds.max.z - bounds.min.z <= 7.2);
});

test('the venue asset cache supplies separate seated and victory copies, and pending disposal cannot attach a late portrait', async () => {
  const source = await portrait(), assets = new VenueSceneryAssets(), square = new THREE.Group(), temple = new THREE.Group(); let loads = 0;
  assets.load = async kind => { assert.equal(kind, 'statue'); loads++; return source; };
  await Promise.all([assets.attach('statue', temple, 3.7), assets.attachVictoryStatue(square)]); await assets.ready();
  assert.equal(loads, 2, 'both attachments request the same cache key; real load() deduplicates it');
  assert.equal(square.children.length, 1); assert.equal(temple.children.length, 1); assert.notEqual(square.children[0], temple.children[0]);
  const box = new THREE.Box3().setFromObject(square); assert.ok(Math.abs(victorySupportBounds(square.children[0]).min.y - VICTORY_PLINTH_TOP) < 1e-6); assert.ok(box.max.y < 9.8);
  const templePose = temple.children[0].getObjectByName('LeftArm').quaternion.clone(); createVictoryStatue(source); assert.ok(templePose.equals(temple.children[0].getObjectByName('LeftArm').quaternion));
  let ownedDisposed=0,sourceDisposed=0; square.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.victoryOwnedGeometry)mesh.geometry.addEventListener('dispose',()=>ownedDisposed++);});source.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.addEventListener('dispose',()=>sourceDisposed++);});
  assets.dispose();assets.dispose();assert.equal(ownedDisposed,3);assert.equal(sourceDisposed,0,'mock loader retains its source; owned runner disposal must not release it');
  let release; const pending = new VenueSceneryAssets(), parent = new THREE.Group(); pending.load = () => new Promise(resolve => { release = resolve; });
  const attachment = pending.attachVictoryStatue(parent); pending.dispose(); release(source); await attachment; assert.equal(parent.children.length, 0);
});

test('a generated replacement retires the code fallback and a slower temple download never resurrects it', async () => {
  const source=await portrait(),assets=new VenueSceneryAssets(),parent=new THREE.Group();assets.load=async()=>source;await assets.attachVictoryStatue(parent);
  let released=0,shared=0;parent.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.victoryOwnedGeometry)mesh.geometry.addEventListener('dispose',()=>released++);});source.traverse(mesh=>{if(mesh.isMesh)mesh.material.addEventListener('dispose',()=>shared++);});
  parent.visible=false;assets.discardVictoryStatue(parent);assets.discardVictoryStatue(parent);assert.equal(parent.children.length,0);assert.equal(assets.reviewSnapshot().instances.length,0);assert.equal(released,3);assert.equal(shared,0);assets.dispose();assert.equal(released,3);
  let release;const pending=new VenueSceneryAssets(),hidden=new THREE.Group();pending.load=()=>new Promise(resolve=>{release=resolve;});const attachment=pending.attachVictoryStatue(hidden);hidden.visible=false;pending.discardVictoryStatue(hidden);release(source);await attachment;assert.equal(hidden.children.length,0);assert.equal(pending.reviewSnapshot().instances.length,0);pending.dispose();
});
