import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: "export * from './src/world/EnvironmentArchitecture'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { applyEnvironmentArchitecture, THREE } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('architectural detail stays bounded, static and clear of protected NIMA and basement ceiling volumes', () => {
  const scene = new THREE.Scene(), report = applyEnvironmentArchitecture(scene);
  const triangleCount = scene.children.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count / 3, 0);
  assert.equal(report.triangles, triangleCount);
  assert.ok(triangleCount > 3000 && triangleCount <= 15000);
  assert.ok(report.materials <= 6 && report.meshes <= 24);
  assert.ok(Object.values(report.byArea).every(count => count > 0));
  const protectedDeck = new THREE.Box3(new THREE.Vector3(19, 7, 17), new THREE.Vector3(61, 19, 46));
  for (const mesh of scene.children) {
    assert.ok(mesh.isMesh && !mesh.children.length && !mesh.material.transparent && !mesh.castShadow);
    assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
    assert.ok(mesh.layers.isEnabled(1), 'opaque joinery must participate in video foreground occlusion');
    assert.ok(!mesh.geometry.boundingBox.intersectsBox(protectedDeck), mesh.name);
    assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
    if (mesh.userData.environmentArea === 'basement') assert.ok(mesh.geometry.boundingBox.max.y < 9, 'leave the ceiling and beat-light volume alone');
  }
  assert.equal(applyEnvironmentArchitecture(scene), report);
  assert.equal(scene.children.length, report.meshes, 'repeating startup must not duplicate decoration');
});

test('caller apertures and lower triangle budgets are enforced before batching', () => {
  const clearScene = new THREE.Scene();
  const exclusion = new THREE.Box3(new THREE.Vector3(-1000, -1000, -1000), new THREE.Vector3(1000, 1000, 1000));
  const refused = applyEnvironmentArchitecture(clearScene, { keepClear: [exclusion] });
  assert.equal(refused.triangles, 0); assert.equal(clearScene.children.length, 0);
  assert.ok(refused.refused > 100);
  const scene = new THREE.Scene(), report = applyEnvironmentArchitecture(scene, { maxTriangles: 100, houses: false });
  assert.ok(report.triangles <= 100 && report.triangles > 0);
  assert.equal(report.byArea.houses, 0);
  const hard = applyEnvironmentArchitecture(new THREE.Scene(), { maxTriangles: 100000 });
  assert.equal(hard.budget, 15000);
});

test('a bevel is closed geometry with outward normals, without degenerate faces', () => {
  const scene = new THREE.Scene(), report = applyEnvironmentArchitecture(scene, { maxTriangles: 44 });
  assert.equal(report.pieces, 1); assert.equal(report.triangles, 44);
  const geometry = scene.children[0].geometry, positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const centre = geometry.boundingBox.getCenter(new THREE.Vector3()), edges = new Map();
  const key = v => v.toArray().map(value => value.toFixed(5)).join(',');
  for (let index = 0; index < positions.count; index += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, index), b = new THREE.Vector3().fromBufferAttribute(positions, index + 1), c = new THREE.Vector3().fromBufferAttribute(positions, index + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert.ok(normal.lengthSq() > 1e-12);
    assert.ok(normal.dot(a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(centre)) > 0);
    assert.ok(normal.normalize().dot(new THREE.Vector3().fromBufferAttribute(normals, index)) > .999);
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const edge = [key(from), key(to)].sort().join('|'); edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(count => count === 2), 'every edge belongs to exactly two solid faces');
});

test('warehouse accents and window reveals end clear of the original projecting brick piers', () => {
  const scene = new THREE.Scene();
  // Original CoastalScenery facade members. Their front faces project beyond
  // the shallow cream accents, so a Z overlap hides/cuts a panel in gameplay.
  const piers = [.5, 7, 13.5, 34, 41.5].map(z => new THREE.Box3(
    new THREE.Vector3(-19.62, -.4, z - .225), new THREE.Vector3(-19.36, 9, z + .225),
  ));
  const report = applyEnvironmentArchitecture(scene);
  let lowStoneTriangles = 0, lowMetalTriangles = 0;
  for (const mesh of scene.children.filter(mesh => mesh.userData.environmentArea === 'basement')) {
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 3) {
      const triangle = new THREE.Box3().setFromPoints([0, 1, 2].map(c => new THREE.Vector3().fromBufferAttribute(positions, i + c)));
      for (const pier of piers) assert.equal(triangle.intersectsBox(pier), false, `${mesh.name} enters an original brick pier`);
      if (triangle.max.x > -19.8 && triangle.min.x < -19.3 && triangle.min.y >= 0 && triangle.max.y < 1) {
        // A visible 0.06 end reveal survives float storage/planet subdivision.
        for (const pier of piers) {
          const endGap = Math.max(pier.min.z - triangle.max.z, triangle.min.z - pier.max.z);
          assert.ok(endGap >= .05999, `base accent needs an intentional end gap: ${endGap}`);
        }
        if (mesh.name.endsWith('stone')) lowStoneTriangles++;
        if (mesh.name.endsWith('metal')) lowMetalTriangles++;
      }
    }
  }
  assert.equal(lowStoneTriangles, 4 * 44, 'four useful closed stone runs survive; tiny clipped offcuts do not');
  assert.equal(lowMetalTriangles, 4 * 12, 'dark caps stay paired with the four stone runs');
  assert.equal(report.triangles, 7040, 'bay-fitting changes positions/dimensions, not the existing geometry budget');
  assert.equal(report.pieces, 232);
});
