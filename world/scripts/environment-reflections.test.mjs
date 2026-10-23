import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: "export * from './src/world/EnvironmentReflections'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { prepareEnvironmentReflections, THREE } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('one bounded PMREM serves imported art while maps, metalness and original world materials stay intact', () => {
  const scene = new THREE.Scene(), renderer = {}, sourceMap = new THREE.Texture(), originalEnvironment = new THREE.Texture();
  const gold = new THREE.MeshStandardMaterial({ color: 0xcda954, metalness: .91, roughness: .33, map: sourceMap, normalMap: new THREE.Texture(), metalnessMap: new THREE.Texture() });
  gold.userData.preserveAuthoredSurface = true;
  const a = new THREE.Mesh(new THREE.BoxGeometry(), gold), b = a.clone();
  a.userData.environmentImported = b.userData.environmentImported = true;
  const outside = new THREE.Mesh(new THREE.BoxGeometry(), gold), avatar = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  scene.environment = originalEnvironment; scene.add(a, b, outside, avatar);
  const target = new THREE.WebGLRenderTarget(336, 128, { type: THREE.HalfFloatType, depthBuffer: false });
  let generated = 0, cubeDisposed = 0, facesDisposed = 0, generatorDisposed = 0, atlasDisposed = 0;
  target.addEventListener('dispose', () => atlasDisposed++);
  const factory = activeRenderer => ({
    fromCubemap(cube) {
      generated++; assert.equal(activeRenderer, renderer); assert.equal(cube.images.length, 6);
      assert.equal(cube.colorSpace, THREE.LinearSRGBColorSpace); assert.equal(cube.generateMipmaps, false);
      cube.addEventListener('dispose', () => cubeDisposed++);
      for (const face of cube.images) {
        face.addEventListener('dispose', () => facesDisposed++);
        assert.equal(face.image.width, 32); assert.equal(face.image.height, 32);
        const values = face.image.data;
        for (let i = 0; i < values.length; i += 4) {
          assert.ok(values[i] > 30 && values[i] < 230, 'neutral low-contrast RGB source');
          assert.equal(values[i + 3], 255);
        }
      }
      return target;
    },
    dispose() { generatorDisposed++; },
  });
  const handle = prepareEnvironmentReflections(renderer, scene, {}, factory);
  assert.equal(prepareEnvironmentReflections(renderer, scene, {}, factory), handle); assert.equal(generated, 1);
  assert.equal(cubeDisposed, 1); assert.equal(facesDisposed, 6); assert.equal(generatorDisposed, 1);
  assert.notEqual(a.material, gold); assert.equal(a.material, b.material); assert.equal(outside.material, gold);
  assert.equal(a.material.envMap, target.texture); assert.equal(a.material.envMapIntensity, .6);
  for (const key of ['map', 'normalMap', 'metalnessMap']) assert.equal(a.material[key], gold[key]);
  assert.equal(a.material.metalness, gold.metalness); assert.equal(a.material.roughness, gold.roughness);
  assert.equal(gold.envMap, null); assert.equal(avatar.material.envMap, null); assert.equal(scene.environment, originalEnvironment);
  assert.equal(handle.report.materials, 1); assert.equal(handle.report.meshes, 2); assert.equal(handle.report.clonedMaterials, 1);
  assert.equal(handle.report.sourceTexels, 6144); assert.equal(handle.report.estimatedBytes, 336 * 128 * 8);
  assert.ok(handle.report.preparationPeakBytes < 1024 * 1024);
  handle.dispose(); handle.dispose(); assert.equal(atlasDisposed, 1);
  assert.equal(a.material, gold); assert.equal(b.material, gold); assert.equal(handle.report.state, 'disposed');
});

test('untagged originals allocate nothing and failed prefiltering releases all temporary sources', () => {
  const scene = new THREE.Scene(), renderer = {};
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const unused = prepareEnvironmentReflections(renderer, scene, {}, () => { throw Error('unused generation'); });
  assert.equal(unused.texture, null); assert.equal(unused.report.estimatedBytes, 0);
  const material = new THREE.MeshStandardMaterial({ metalness: 1 }); material.userData.preserveAuthoredSurface = true;
  const imported = new THREE.Mesh(new THREE.BoxGeometry(), material); imported.userData.environmentImported = true; scene.add(imported);
  let disposed = 0, sourcesDisposed = 0;
  assert.throws(() => prepareEnvironmentReflections(renderer, scene, {}, () => ({
    fromCubemap(cube) {
      cube.addEventListener('dispose', () => sourcesDisposed++);
      cube.images.forEach(face => face.addEventListener('dispose', () => sourcesDisposed++));
      throw Error('GPU preparation failed');
    }, dispose() { disposed++; },
  })), /GPU preparation failed/);
  assert.equal(disposed, 1); assert.equal(sourcesDisposed, 7); assert.equal(material.envMap, null);
});
