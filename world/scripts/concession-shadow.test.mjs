import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: "export * from './src/world/ConcessionShadow';export {createCoastalPopcorn} from './src/world/CoastalProps';export {batchStaticScenery} from './src/world/StaticBatch';export * from './src/world/PlanetCurve';export * as THREE from 'three';", loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { THREE, createConcessionContactShadow, CONCESSION_CONTACT_SHADOW, createCoastalPopcorn, batchStaticScenery, installPlanetCurve, PLANET } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const source = await readFile('src/world/FestivalWorld.ts', 'utf8');
const body = /private createConcession\(\): void \{([\s\S]*?)\n  \}/.exec(source)?.[1];
assert.ok(body);
const create = new Function('THREE', 'material', 'concessionPosition', 'createTextTexture', 'createCoastalPopcorn', 'createConcessionContactShadow', 'AVATAR_GROUND_Y', `return function() {${body}};`)(THREE, color => new THREE.MeshStandardMaterial({ color }), new THREE.Vector3(-20, 0, -25), () => new THREE.Texture(), createCoastalPopcorn, createConcessionContactShadow, .28);
function fixture(mode) {
  const scene = new THREE.Scene();
  const owner = { scene, graphicsMode: mode,
    mesh(size, at, material, parent = scene) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
      mesh.scale.set(...size); mesh.position.set(...at); mesh.castShadow = false; mesh.receiveShadow = mode === 'normal'; parent.add(mesh); return mesh;
    },
    mountNeonFrame() {}, addCollider() {}, registerSnowSurface(id,object){ return object; }, groundHeightAt: () => .28,
  };
  create.call(owner); scene.updateMatrixWorld(true); return scene;
}

test('the actual popcorn constructor opts in only its two large masses before batching, in both quality modes', () => {
  for (const mode of ['normal', 'lite']) {
    const scene = fixture(mode), booth = scene.getObjectByName('Popcorn concession');
    const masses = [];
    booth.traverse(object => { if (object.isMesh && Math.max(...object.scale.toArray()) >= 1.5 && object.material.isMeshStandardMaterial) masses.push(object); });
    const casters = masses.filter(object => object.castShadow);
    assert.equal(casters.length, 2, mode);
    assert.deepEqual(casters.map(mesh => mesh.scale.toArray()).sort(), [[3.2, 2.25, 2.6], [3.8, .22, 3.1]].sort());
    assert.ok(casters.every(mesh => mesh.receiveShadow));
    const before = new Map(casters.map(mesh => [mesh.material.color.getHex(), new THREE.Box3().setFromObject(mesh)]));
    batchStaticScenery(scene); scene.updateMatrixWorld(true);
    for (const [color, bounds] of before) {
      const matching = [];
      scene.traverse(mesh => { if (mesh.isMesh && mesh.material.color?.getHex() === color && mesh.castShadow) matching.push(mesh); });
      assert.ok(matching.length > 0, 'the booth silhouette must remain a caster after static batching');
      assert.ok(matching.some(mesh => new THREE.Box3().setFromObject(mesh).expandByScalar(.00001).containsBox(bounds)), 'batch Float32 storage preserves the original silhouette within ten micrometres');
    }
    const contact=scene.getObjectByName('Popcorn booth ground contact');
    assert.equal(contact.material.transparent, true);
    assert.ok(Math.abs(contact.getWorldPosition(new THREE.Vector3()).y-.025)<1e-8, 'groundHeightAt includes the avatar-root offset, which a ground decal must remove');
  }
});

test('one texture-free contact skirt is ground aligned, remains unbatched and shares its tiny geometry/material across visits', () => {
  const a = createConcessionContactShadow(-.68), b = createConcessionContactShadow(0);
  assert.equal(a.geometry, b.geometry); assert.equal(a.material, b.material);
  assert.equal(a.geometry.index.count / 3, 8); assert.equal(a.material.map, null);
  assert.equal(a.material.depthWrite, false); assert.equal(a.castShadow, false);
  assert.ok(Math.abs(a.position.y - (-.68 + CONCESSION_CONTACT_SHADOW.lift)) < 1e-8);
  assert.equal(a.rotation.x, -Math.PI / 2);
  assert.equal(a.userData.filmGrainExclude, true); assert.equal(a.material.userData.filmGrainExclude, true);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  a.material.onBeforeCompile(shader, {});
  assert.match(shader.fragmentShader, /CONCESSION_CONTACT_SHADOW_V1/);
  assert.match(shader.fragmentShader, /smoothstep/);
  assert.match(shader.vertexShader, /#include <project_vertex>/, 'the built-in planet projection must remain');
  assert.ok(!shader.vertexShader.includes('PLANET_FLAT'));
  installPlanetCurve(320);
  const curved = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  a.material.onBeforeCompile(curved, {});
  assert.equal(curved.uniforms.planetCentre, PLANET.centre); assert.equal(curved.uniforms.planetRadius, PLANET.radiusUniform);
});
