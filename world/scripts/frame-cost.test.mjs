import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const output = await build({
  stdin: { contents: "export { lightEarlyOutChunk, installLightEarlyOut } from './src/world/LightLoop'; export { shareShadowDepthMaterials, ShadowCasterCulling } from './src/world/ShadowCasters'; export { STATIC_PROP_NAMES, batchStaticScenery } from './src/world/StaticBatch'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { lightEarlyOutChunk, installLightEarlyOut, shareShadowDepthMaterials, ShadowCasterCulling, STATIC_PROP_NAMES, batchStaticScenery, THREE } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

// three.js's own loop unroller (WebGLProgram.js): the patched chunk must still
// unroll into one block per light, or every lit material fails to compile.
const unrollLoopPattern = /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;
const balanced = (text) => [...text].reduce((depth, c) => depth < 0 ? depth : depth + (c === '{') - (c === '}'), 0) === 0;

test('each point, spot and directional light skips its lighting work where it contributes exactly zero', () => {
  const original = THREE.ShaderChunk.lights_fragment_begin;
  const patched = lightEarlyOutChunk(original);
  assert.ok(patched, 'the chunk matches the three.js release this was written against');
  // Light counts are numbers by the time three.js unrolls (replaceLightNums).
  const loops = [...patched.replace(/i < NUM_\w+;/g, 'i < 2;').matchAll(unrollLoopPattern)].map(match => match[3]);
  const lit = loops.filter(body => body.includes('RE_Direct('));
  assert.equal(lit.length, 3);
  for (const body of lit) {
    assert.ok(balanced(body), 'the guard closes inside its own loop');
    const guard = body.indexOf('if ( directLight.');
    assert.ok(guard > 0 && guard < body.indexOf('RE_Direct('), 'the lighting call sits inside the guard');
    // Shadow and spot-map lookups are inside it too: they only scale a colour
    // that is already zero.
    for (const lookup of ['getShadow(', 'getPointShadow(', 'texture2D(']) {
      if (body.includes(lookup)) assert.ok(body.indexOf(lookup) > guard);
    }
  }
  assert.match(lit[0], /if \( directLight\.visible \)/);
  assert.match(lit[1], /if \( directLight\.visible \)/);
  assert.match(lit[2], /if \( directLight\.color != vec3\( 0\.0 \) \)/);
  // Nothing else in the chunk moved.
  const stripped = patched.replace(/^\/\* light-early-out \*\/\n/, '')
    .replace(/\n\t\tif \( [^)]+\)? \) \{/g, '').replace(/\n\t\t\}(?=\n+\t\}\n\t#pragma unroll_loop_end)/g, '');
  assert.equal(stripped, original);
});

test('the light patch is idempotent and leaves an unfamiliar chunk alone', () => {
  const once = lightEarlyOutChunk(THREE.ShaderChunk.lights_fragment_begin);
  assert.equal(lightEarlyOutChunk(once), once);
  assert.equal(lightEarlyOutChunk('void main() {}'), undefined);
  const before = THREE.ShaderChunk.lights_fragment_begin;
  assert.equal(installLightEarlyOut(), true);
  assert.equal(installLightEarlyOut(), true);
  assert.equal(THREE.ShaderChunk.lights_fragment_begin, lightEarlyOutChunk(before));
});

test('skinned and morphing casters get one depth material per kind, never a shared one that changes kind', () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const box = () => new THREE.BoxGeometry();
  const skinnedA = new THREE.SkinnedMesh(box(), material), skinnedB = new THREE.SkinnedMesh(box(), material);
  const morphing = new THREE.Mesh(box(), material);
  morphing.geometry.morphAttributes.position = [morphing.geometry.getAttribute('position').clone()];
  const plain = new THREE.Mesh(box(), material);
  const cutOut = new THREE.SkinnedMesh(box(), new THREE.MeshStandardMaterial({ map: new THREE.Texture(), alphaTest: .5 }));
  const ownDepth = new THREE.MeshDepthMaterial();
  const custom = new THREE.SkinnedMesh(box(), material); custom.customDepthMaterial = ownDepth;
  const notCasting = new THREE.SkinnedMesh(box(), material);
  for (const mesh of [skinnedA, skinnedB, morphing, plain, cutOut, custom]) mesh.castShadow = true;
  scene.add(skinnedA, skinnedB, morphing, plain, cutOut, custom, notCasting);
  assert.equal(shareShadowDepthMaterials(scene), 3);
  assert.ok(skinnedA.customDepthMaterial?.isMeshDepthMaterial);
  assert.equal(skinnedA.customDepthMaterial, skinnedB.customDepthMaterial, 'one per kind');
  assert.notEqual(morphing.customDepthMaterial, skinnedA.customDepthMaterial);
  // three.js's own shadow depth material, exactly (WebGLShadowMap.js).
  assert.equal(skinnedA.customDepthMaterial.depthPacking, THREE.RGBADepthPacking);
  assert.equal(plain.customDepthMaterial, undefined, 'plain meshes stay on three.js\'s shared material');
  assert.equal(cutOut.customDepthMaterial, undefined, 'cut-outs keep three.js\'s per-material variant');
  assert.equal(custom.customDepthMaterial, ownDepth);
  assert.equal(notCasting.customDepthMaterial, undefined);
  assert.equal(shareShadowDepthMaterials(scene), 0, 'idempotent');
});

// The flat map: no planet curve, the floor is a plane.
function shadowScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1.6, .1, 300);
  camera.position.set(0, 2, 10); camera.lookAt(0, 1, 0);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true; sun.position.set(0, 30, -10); sun.target.position.set(0, 0, 0);
  scene.add(camera, sun, sun.target);
  const caster = (x, y, z, parent = scene) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.castShadow = true; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  return { scene, camera, sun, caster };
}

test('a caster whose shadow cannot reach the view sits out one draw and is put back', () => {
  const { scene, camera, caster } = shadowScene();
  const inView = caster(0, 1, 0);
  const behind = caster(0, 1, 80);           // shadow falls further behind the camera
  const offSide = caster(-120, 1, 0);        // far outside the left of the frame
  const hidden = caster(0, 1, 90); hidden.visible = false;
  scene.updateMatrixWorld(true);
  const culling = new ShadowCasterCulling();
  assert.equal(culling.hide(scene, camera, 0), 2);
  assert.equal(inView.castShadow, true);
  assert.equal(behind.castShadow, false);
  assert.equal(offSide.castShadow, false);
  assert.equal(hidden.castShadow, true, 'hidden meshes are not drawn and are left alone');
  culling.restore();
  assert.equal(behind.castShadow, true);
  assert.equal(offSide.castShadow, true);
  // A second hide without a restore restores first: nothing is left switched off.
  culling.hide(scene, camera, 0); culling.hide(scene, camera, 0); culling.restore();
  assert.ok([inView, behind, offSide, hidden].every(mesh => mesh.castShadow));
});

test('casters are kept when their shadow can fall into view, near a lamp shadow, or on the visitor', () => {
  const { scene, camera, sun, caster } = shadowScene();
  // Low sun from behind the camera: a shadow cast from behind lands in front.
  sun.position.set(0, 6, 60);
  const castsForward = caster(0, 1, 30);
  const lamp = new THREE.SpotLight(0xffffff, 1, 20);
  lamp.castShadow = true; lamp.position.set(0, 6, -150); scene.add(lamp);
  const nearLamp = caster(4, 1, -150);
  const player = new THREE.Group(); player.position.set(0, 0, 400); scene.add(player);
  const own = caster(0, 1, 0, player);
  scene.updateMatrixWorld(true);
  const culling = new ShadowCasterCulling();
  culling.hide(scene, camera, 0, player);
  assert.equal(castsForward.castShadow, true);
  assert.equal(nearLamp.castShadow, true);
  assert.equal(own.castShadow, true);
  culling.restore();
});

test('without a sun or moon shadow nothing is left out', () => {
  const { scene, camera, sun, caster } = shadowScene();
  sun.castShadow = false;
  const behind = caster(0, 1, 80);
  scene.updateMatrixWorld(true);
  assert.equal(new ShadowCasterCulling().hide(scene, camera, 0), 0);
  assert.equal(behind.castShadow, true);
});

test('the popcorn stall and the jukebox are merged as static scenery under the names the world gives them', async () => {
  assert.ok(STATIC_PROP_NAMES.has('Popcorn concession'));
  assert.ok(STATIC_PROP_NAMES.has('Jukebox cabinet'));
  const source = await readFile(new URL('../src/world/FestivalWorld.ts', import.meta.url), 'utf8');
  assert.match(source, /booth\.name = 'Popcorn concession';/);
  assert.match(source, /cabinet\.name = 'Jukebox cabinet';/);
  const scene = new THREE.Scene();
  const stall = new THREE.Group(); stall.name = 'Popcorn concession'; stall.position.set(-20, 0, -25);
  const carton = new THREE.Group(); stall.add(carton);
  const cream = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 18; i++) {
    const kernel = new THREE.Mesh(new THREE.IcosahedronGeometry(.08, 0), cream);
    kernel.castShadow = true; kernel.position.set(i * .01, 3, 0); carton.add(kernel);
  }
  scene.add(stall);
  const report = batchStaticScenery(scene);
  assert.equal(report.batchedPieces, 18);
  const batch = scene.getObjectByName('static-batch');
  assert.equal(batch.castShadow, true);
  assert.ok(Math.abs(batch.geometry.boundingSphere.center.x + 20) < .2, 'baked where the stall stands');
});
