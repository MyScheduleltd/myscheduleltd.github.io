import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: "export * from './src/world/TempleArchitecture'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { applyTempleArchitecture, TEMPLE_ARCHITECTURE_LAYOUT: L, THREE } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('temple joinery is bounded static construction, with every protected volume left empty', () => {
  const scene = new THREE.Scene();
  const sentinel = new THREE.Object3D(); sentinel.name = 'Existing temple deity'; scene.add(sentinel);
  const handle = applyTempleArchitecture(scene), { report } = handle;
  const meshes = scene.children.filter(mesh => mesh.userData.templeArchitecture);
  assert.equal(report.meshes, 6); assert.equal(report.materials, 6);
  assert.ok(report.triangles >= 4000 && report.triangles <= 6500, `source budget ${report.triangles}`);
  assert.ok(report.triangles <= L.maxTriangles);
  assert.ok(Object.values(report.byFeature).every(triangles => triangles > 0));
  assert.equal(Object.values(report.byFeature).reduce((a, b) => a + b), report.triangles);
  assert.equal(report.atlasPanels, 0);
  const volume = bounds => new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
  const clear = Object.entries(report.clearances).map(([name, bounds]) => [name, volume(bounds)]);
  let triangles = 0, bytes = 0;
  for (const mesh of meshes) {
    assert.ok(mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial);
    assert.equal(mesh.children.length, 0); assert.equal(mesh.castShadow, false);
    assert.equal(mesh.material.transparent, false); assert.ok(mesh.layers.isEnabled(1));
    assert.equal(mesh.userData.dynamic, undefined);
    const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal');
    triangles += positions.count / 3;
    assert.equal(mesh.geometry.getAttribute('uv').count, positions.count);
    assert.ok(Array.from(positions.array).every(Number.isFinite));
    assert.ok(Array.from(normals.array).every(Number.isFinite));
    for (const attribute of Object.values(mesh.geometry.attributes)) bytes += attribute.array.byteLength;
    for (let i = 0; i < positions.count; i += 3) {
      const points = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, i + offset));
      const face = new THREE.Box3().setFromPoints(points);
      const edge = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
      assert.ok(edge.lengthSq() > 1e-12, `${mesh.name} has a zero-area face`);
      for (const [name, bounds] of clear) assert.equal(face.intersectsBox(bounds), false, `${mesh.name} touches ${name}`);
    }
    // The original two-tier roof reaches X72.5..109.5 / Z−17.5..25.5.
    // Relief adds under 0.1 at an edge and no new large silhouette or mass.
    assert.ok(mesh.geometry.boundingBox.min.x > 72.35 && mesh.geometry.boundingBox.max.x < 109.65);
    assert.ok(mesh.geometry.boundingBox.min.z > -17.65 && mesh.geometry.boundingBox.max.z < 25.65);
  }
  assert.equal(triangles, report.triangles); assert.equal(bytes, report.geometryBytes);
  assert.equal(scene.children.filter(o => o.isLight).length, 0);
  assert.equal(scene.getObjectByName('Existing temple deity'), sentinel);
  assert.equal(applyTempleArchitecture(scene), handle, 'repeated admission must not duplicate joinery');
  assert.equal(scene.children.length, report.meshes + 1);
  handle.dispose(); assert.deepEqual(scene.children, [sentinel]);
});

test('a supplied four-band atlas remains shared, repeats at its native aspect, and is caller-owned', () => {
  const scene = new THREE.Scene(), atlas = new THREE.MeshStandardMaterial();
  let atlasDisposals = 0; atlas.addEventListener('dispose', () => atlasDisposals++);
  const handle = applyTempleArchitecture(scene, { decorativeMaterial: atlas });
  const mesh = scene.children.find(mesh => mesh.material === atlas);
  assert.ok(mesh); assert.equal(handle.report.atlasPanels, 4);
  assert.equal(handle.report.materials, 6); assert.equal(handle.report.meshes, 6);
  assert.equal(mesh.userData.environmentImported, true);
  assert.equal(mesh.userData.environmentSurface, undefined, 'authored atlas must not become a generic tile');
  assert.equal(atlas.userData.preserveAuthoredSurface, true);
  assert.equal(atlas.userData.islandPaletteApplied, true);
  const uv = mesh.geometry.getAttribute('uv'), positions = mesh.geometry.getAttribute('position');
  assert.equal(positions.count, 4 * 6, 'only four opaque frieze faces use the atlas');
  for (let panel = 0; panel < 4; panel++) {
    const us = [], vs = [];
    for (let vertex = panel * 6; vertex < (panel + 1) * 6; vertex++) { us.push(uv.getX(vertex)); vs.push(uv.getY(vertex)); }
    const repeat = panel < 2 ? 10.5 / (1.1 * 4) : 27.2 / (.9 * 4);
    assert.ok(Math.abs(Math.max(...us) - repeat) < 1e-5);
    assert.equal(Math.min(...us), 0);
    assert.ok(Math.min(...vs) > (panel < 2 ? .75 : .50));
    assert.ok(Math.max(...vs) < (panel < 2 ? 1 : .75));
  }
  const geometries = scene.children.map(mesh => mesh.geometry), ownedMaterials = scene.children.filter(mesh => mesh.material !== atlas).map(mesh => mesh.material);
  let geometryDisposals = 0, materialDisposals = 0;
  geometries.forEach(g => g.addEventListener('dispose', () => geometryDisposals++));
  ownedMaterials.forEach(m => m.addEventListener('dispose', () => materialDisposals++));
  handle.dispose(); handle.dispose();
  assert.equal(geometryDisposals, 6); assert.equal(materialDisposals, 5); assert.equal(atlasDisposals, 0);
  assert.equal(scene.children.length, 0);
  assert.equal(scene.userData.templeArchitectureReport, undefined);
  const second = applyTempleArchitecture(scene, { decorativeMaterial: atlas });
  assert.notEqual(second, handle); second.dispose();
});

test('the local dressing plan matches createTemple and does not duplicate the earlier portal and bracket shoes', () => {
  const source = readFileSync('src/world/FestivalWorld.ts', 'utf8');
  assert.match(source, /const TEMPLE = \{\s*minX: 76,\s*maxX: 106,\s*minZ: -14,\s*maxZ: 22,/);
  assert.match(source, /const wallHeight = 10\.5;/); assert.match(source, /const doorHeight = 7\.2;/);
  assert.match(source, /tier\('temple-roof-lower',t\.podium \+ wallHeight \+ 0\.5, 7, 7, 0\.9\)/);
  assert.match(source, /tier\('temple-roof-upper',t\.podium \+ wallHeight \+ 4\.1, 1\.5, 1\.5, 0\.8\)/);
  const scene = new THREE.Scene(), { report } = applyTempleArchitecture(scene);
  const legacyWestShoes = [-10, -3, 11, 18].map(z => new THREE.Box3(
    new THREE.Vector3(75.0, L.floorY + 9.48, z - .21), new THREE.Vector3(75.76, L.floorY + 9.96, z + .21),
  ));
  for (const mesh of scene.children) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 3) {
      const face = new THREE.Box3().setFromPoints([0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, i + offset)));
      for (const shoe of legacyWestShoes) assert.equal(face.intersectsBox(shoe), false, mesh.name);
    }
  }
  assert.ok(report.byFeature.brackets > 500);
});
