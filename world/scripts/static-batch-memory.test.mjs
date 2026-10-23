import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticScenery } from '../src/world/StaticBatch.ts';

test('batching releases replaced GPU resources while keeping visible and hidden consumers', () => {
  const scene = new THREE.Scene();
  const shared = new THREE.BoxGeometry();
  const unique = new THREE.BoxGeometry();
  const first = new THREE.MeshBasicMaterial({ color: 0x123456 });
  const twin = first.clone();
  const texture = new THREE.Texture(); first.map = twin.map = texture;
  const a = new THREE.Mesh(unique, first), b = new THREE.Mesh(shared, twin);
  b.position.x = 3;
  scene.add(a, b);
  const hidden = new THREE.Mesh(shared, new THREE.MeshBasicMaterial());
  hidden.visible = false; scene.add(hidden);
  const disposed = [];
  for (const [name, resource] of Object.entries({ unique, shared, first, twin, texture })) {
    resource.addEventListener('dispose', () => disposed.push(name));
  }
  const report = batchStaticScenery(scene);
  assert.equal(report.batchedPieces, 2);
  assert.equal(report.releasedGeometries, 1);
  assert.equal(report.releasedMaterials, 1);
  assert.deepEqual(disposed.sort(), ['twin', 'unique']);
  const batch = scene.getObjectByName('static-batch');
  assert.equal(batch.material, first);
  assert.equal(batch.geometry.getAttribute('position').count, 72);
  assert.equal(batch.geometry.boundingBox.max.x, 3.5);
  assert.equal(hidden.geometry, shared);
  assert.equal(texture.image, null, 'shared maps are never disposed by batching');
});

test('a second batch pass releases nothing still referenced by the world', () => {
  const scene = new THREE.Scene(), material = new THREE.MeshBasicMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), material));
  assert.equal(batchStaticScenery(scene).releasedGeometries, 2);
  const report = batchStaticScenery(scene);
  assert.equal(report.releasedGeometries, 0);
  assert.equal(report.releasedMaterials, 0);
  assert.equal(report.batchedPieces, 0);
});

test('hidden fallback ancestors keep visible descendants out of batches without changing their restore state', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const statue = new THREE.Group(); statue.name = 'gangan-statue'; scene.add(statue);
  const fallbackBody = new THREE.Group(); fallbackBody.visible = false; statue.add(fallbackBody);
  const hiddenRoot = new THREE.Group(); hiddenRoot.name = 'Festival pamphlet rack'; hiddenRoot.visible = false; scene.add(hiddenRoot);
  const hiddenLeaves = [];
  for (const parent of [fallbackBody, hiddenRoot]) {
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.x = 10 + i; parent.add(mesh); hiddenLeaves.push(mesh);
    }
  }
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.x = i * 2; statue.add(mesh);
  }
  let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
  const report = batchStaticScenery(scene), merged = scene.getObjectByName('static-batch');
  assert.equal(report.batchedPieces, 2); assert.equal(report.batches, 1);
  assert.equal(merged.geometry.getAttribute('position').count, 72);
  assert.ok(merged.geometry.boundingBox.max.x < 3, 'hidden fallback geometry entered the visible batch');
  assert.equal(fallbackBody.children.length, 2); assert.equal(hiddenRoot.children.length, 2);
  assert.equal(fallbackBody.visible, false); assert.equal(hiddenRoot.visible, false);
  for (const mesh of hiddenLeaves) { assert.equal(mesh.visible, true); assert.equal(mesh.geometry, geometry); }
  assert.equal(disposed, 0, 'hidden consumers retain their shared source geometry');
  fallbackBody.visible = true; hiddenRoot.visible = true;
  assert.ok(hiddenLeaves.every(mesh => mesh.visible && mesh.parent.visible), 'restoring the original parent must still restore the original leaves');
});
