import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: "export * from './src/world/DriveInLicensePlates';export {batchStaticScenery} from './src/world/StaticBatch';export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { THREE, applyDriveInLicensePlates, DRIVE_IN_PLATE_MOUNTS, batchStaticScenery } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

function canvasFixture(t) {
  const previous = globalThis.document, digits = [], canvases = [];
  globalThis.document = { createElement(type) {
    assert.equal(type, 'canvas'); const canvas = { width: 0, height: 0, getContext() { return { fillRect() {}, fillText(text) { digits.push(text); } }; } };
    canvases.push(canvas); return canvas;
  } };
  t.after(() => { globalThis.document = previous; });
  return { digits, canvases };
}
function car(number, imported = true) {
  const root = new THREE.Group(); root.name = 'Drive Thru 88 convertible'; root.userData.driveInSeatNumber = number;
  // A marker for the already-attached imported model. It is not a collider,
  // does not carry a fake source plate and contributes no rendered triangles.
  if (imported) {
    const marker = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    marker.userData.environmentImported = true; root.add(marker);
  }
  return root;
}

test('six large rear numbers share one bounded atlas and remain distinct after real static batching', t => {
  const { digits, canvases } = canvasFixture(t), scene = new THREE.Scene(), roots = [];
  // Back row (farther from the -Z screen) is 1–3; front row is 4–6. Traverse
  // front first to prove metadata, rather than traversal, supplies the numbers.
  for (let row = 0; row < 2; row++) for (let column = 0; column < 3; column++) {
    const root = car(row * 3 + column + 1); root.position.set((column - 1) * 7.2, -.7, -30.5 - row * 8.76); roots.push(root);
  }
  scene.add(...roots.slice(3), ...roots.slice(0, 3));
  const before = roots.map(root => root.position.toArray()), handle = applyDriveInLicensePlates(scene);
  assert.equal(handle.report.cars, 6); assert.equal(handle.report.importedCars, 6); assert.equal(handle.report.triangles, 84);
  assert.deepEqual(handle.report.numbers, [4, 5, 6, 1, 2, 3]); assert.deepEqual(digits, ['1', '2', '3', '4', '5', '6']);
  assert.equal(canvases.length, 1); assert.equal(canvases[0].width, 512); assert.equal(canvases[0].height, 128);
  assert.ok(handle.report.estimatedTextureBytesWithMips < 350000);
  const numberFaces = roots.map(root => root.getObjectByName(`Rear license number ${root.userData.driveInSeatNumber}`));
  assert.equal(new Set(numberFaces.map(face => face.material)).size, 1); assert.equal(new Set(numberFaces.map(face => face.material.map)).size, 1);
  assert.equal(new Set(numberFaces.map(face => Array.from(face.geometry.attributes.uv.array).join(','))).size, 6);
  for (const face of numberFaces) {
    assert.equal(face.material.transparent, false); assert.equal(face.material.userData.preserveAuthoredSurface, true);
    assert.ok(face.layers.isEnabled(1)); assert.equal(face.castShadow, false);
    assert.ok(face.geometry.attributes.normal.getZ(0) > .99, 'printed face points to rear +Z');
    const uv = face.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) assert.ok(uv.getX(i) > 0 && uv.getX(i) < 1 && uv.getY(i) > 0 && uv.getY(i) < 1);
  }
  assert.equal(applyDriveInLicensePlates(scene), handle); assert.deepEqual(roots.map(root => root.position.toArray()), before);
  const texture = numberFaces[0].material.map; let released = 0; texture.addEventListener('dispose', () => released++);
  const batch = batchStaticScenery(scene); assert.equal(batch.batches, 2); assert.equal(batch.batchedPieces, 12);
  const faceBatch = scene.children.find(mesh => mesh.isMesh && mesh.material === numberFaces[0].material);
  assert.equal(faceBatch.geometry.index, null); assert.equal(faceBatch.geometry.attributes.position.count / 3, 12);
  const uvRegions = new Set(); const p = faceBatch.geometry.attributes.position, uv = faceBatch.geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) uvRegions.add(`${Math.floor(uv.getX(i) * 4)},${Math.floor((1 - uv.getY(i)) * 2)}`);
  assert.equal(uvRegions.size, 6, 'batching must preserve six numeral atlas cells');
  handle.dispose(); handle.dispose(); assert.equal(released, 1); assert.equal(texture.image, null);
});

test('the opaque imported cover hides the complete retained source lettering region within the car envelope', t => {
  canvasFixture(t); const scene = new THREE.Scene(), root = car(1); scene.add(root); applyDriveInLicensePlates(scene); scene.updateMatrixWorld(true);
  // Audited fitted rear fascia: source plate is centred behind this region at
  // z≈2.72–2.73; the low bumper reaches z2.88. Rays must hit our opaque cover
  // before reaching any point of the old number/white field.
  const group = root.getObjectByName('Drive-in rear number 1');
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.max.z < 2.88); assert.ok(bounds.min.y > 0 && bounds.max.y < 2.05);
  for (const x of [-.90, -.45, 0, .45, .90]) for (const y of [.82, .92, 1.05, 1.22, 1.25]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 4), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(group, true)[0]; assert.ok(hit, `old plate remains uncovered at ${x},${y}`);
    assert.ok(hit.point.z > 2.73); assert.equal(hit.object.material.transparent, false);
  }
  const local = DRIVE_IN_PLATE_MOUNTS.imported; assert.ok(local.faceZ > local.frameZ + .03, 'no coplanar number/housing faces');
});

test('fallback mounts keep approved numbers while invalid or duplicate metadata never silently renumbers cars', t => {
  canvasFixture(t); const scene = new THREE.Scene(), fallback = car(2, false), invalid = car(7), duplicate = car(2);
  scene.add(fallback, invalid, duplicate);
  const handle = applyDriveInLicensePlates(scene); assert.equal(handle.report.fallbackCars, 1); assert.equal(handle.report.invalidNumbers, 1);
  assert.deepEqual(handle.report.duplicateNumbers, [2]); assert.deepEqual(handle.report.numbers, [2]);
  assert.equal(fallback.getObjectByName('Rear license number 2').position.z, DRIVE_IN_PLATE_MOUNTS.fallback.faceZ);
  handle.dispose(); assert.equal(fallback.getObjectByName('Rear license number 2'), undefined);
  const comparison = applyDriveInLicensePlates(scene, { skipFallbacks: true });
  assert.equal(comparison.report.skippedFallbacks, 1); assert.equal(comparison.report.importedCars, 1);
  assert.deepEqual(comparison.report.numbers, [2]); comparison.dispose();
});
