import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Freezes on iPhone came from shaders compiled in the middle of play
// (WebKit probe, 2026-10-18). These pin the two causes that were fixed.
const bundle = await build({
  stdin: {
    contents: "export { DayNightCycle } from './src/world/DayNightCycle'; export { compileScenePrograms, warmByDrawing } from './src/world/SceneWarmup'; export { applyWornStyle } from './src/world/WornStyle'; export * as THREE from 'three';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { DayNightCycle, compileScenePrograms, warmByDrawing, applyWornStyle, THREE } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('admission waits for live programs but finishes if a visitor material is disposed between readiness polls', async () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const leaves = new THREE.MeshStandardMaterial(), stays = new THREE.MeshStandardMaterial();
  const properties = new WeakMap();
  let checks = 0, ready = false, complete = false;
  const renderer = {
    compile(root, cam, target) {
      assert.equal(root, scene); assert.equal(cam, camera); assert.equal(target, scene);
      properties.set(leaves, { currentProgram: { isReady: () => false } });
      properties.set(stays, { currentProgram: { isReady() { checks++; return ready; } } });
      leaves.addEventListener('dispose', () => properties.delete(leaves));
      return new Set([leaves, stays]);
    },
    properties: { get: material => properties.get(material) ?? {} },
  };
  const compiled = compileScenePrograms(renderer, scene, camera, scene).then(() => { complete = true; });
  leaves.dispose();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(complete, false, 'a removed visitor cannot bypass the remaining live shader');
  assert.ok(checks >= 2, 'live shader readiness is polled after a browser task');
  ready = true; await compiled;
  assert.equal(complete, true, 'no uncaught timer or unresolved admission after removal');
});

test('admission checks a replacement shader and resolves when renderer disposal removes all programs', async () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), material = new THREE.MeshBasicMaterial();
  let current = { currentProgram: { isReady: () => false } }, replacementChecks = 0;
  const renderer = { compile: () => new Set([material]), properties: { get: () => current } };
  const pending = compileScenePrograms(renderer, scene, camera, scene);
  current = { currentProgram: { isReady() { replacementChecks++; return replacementChecks > 1; } } };
  await pending; assert.ok(replacementChecks >= 2, 'the replacement stays pending until it is ready');
  current = { currentProgram: { isReady: () => false } };
  const stopped = compileScenePrograms(renderer, scene, camera, scene);
  current = {}; await stopped;
});

test('shader compilation and readiness failures reject admission instead of escaping a timer', async () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), material = new THREE.MeshBasicMaterial();
  await assert.rejects(compileScenePrograms({ compile() { throw Error('compile failed'); } }, scene, camera, scene), /compile failed/);
  let checks = 0;
  const renderer = {
    compile: () => new Set([material]),
    properties: { get: () => ({ currentProgram: { isReady() { if (++checks > 1) throw Error('driver failed'); return false; } } }) },
  };
  await assert.rejects(compileScenePrograms(renderer, scene, camera, scene), /driver failed/);
});

test('the authored sky gradient survives the real worn-style traversal while ordinary world shaders retain their dither', () => {
  const paint = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: (_x, _y, width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) },
  { get: (target, key) => key in target ? target[key] : () => {} });
  globalThis.document ??= { createElement: () => ({ width: 1, height: 1, getContext: () => paint }) };
  const scene = new THREE.Scene(), cycle = new DayNightCycle(scene);
  const wallMaterial = new THREE.MeshStandardMaterial(), wall = new THREE.Mesh(new THREE.BoxGeometry(), wallMaterial);
  scene.add(wall);
  const sky = cycle.atmosphere.dome.material;
  const originalFragment = sky.fragmentShader, originalUniforms = Object.keys(sky.uniforms);
  assert.ok(applyWornStyle(scene) > 0);
  applyWornStyle(scene); // Late scenery calls the pass again after warm-up.
  const skyShader = { uniforms: { ...sky.uniforms }, vertexShader: sky.vertexShader, fragmentShader: sky.fragmentShader };
  sky.onBeforeCompile(skyShader, {});
  assert.equal(sky.defines.WORN_STYLE, undefined, 'the custom sky never opts into built-in worn shader patches');
  assert.equal(sky.userData.wornPatched, undefined);
  assert.equal(skyShader.fragmentShader, originalFragment);
  assert.deepEqual(Object.keys(skyShader.uniforms), originalUniforms);
  assert.match(skyShader.fragmentShader, /#include <colorspace_fragment>/, 'authored linear colours still receive output colour conversion');
  assert.ok(['horizon', 'middle', 'zenith', 'glow', 'sunDirection', 'glowStrength'].every((key) => key in skyShader.uniforms));
  assert.doesNotMatch(skyShader.fragmentShader, /uWornSteps|uWornAmount/);
  const worldShader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  wallMaterial.onBeforeCompile(worldShader, {});
  assert.equal(wallMaterial.defines.WORN_STYLE, '');
  assert.match(worldShader.fragmentShader, /uniform float uWornSteps/);
  assert.match(worldShader.fragmentShader, /float wornSteps = max\(uWornSteps/);
  assert.ok(worldShader.uniforms.uWornSteps && worldShader.uniforms.uWornAmount, 'ordinary geometry retains the shared world style');
});

test('the number of shadowed lights never changes over the day, so no lit shader recompiles at sunrise or sunset', () => {
  // The sky and halos paint canvases; any 2D context that accepts the calls will do.
  const pixels = (w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  const made = { createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: (x, y, w, h) => pixels(w, h), createImageData: (w, h) => pixels(w, h) };
  const paint = new Proxy({}, { get: (target, key) => key in target ? target[key] : made[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  globalThis.document ??= { createElement: () => ({ width: 1, height: 1, getContext: () => paint }) };
  const scene = new THREE.Scene();
  const cycle = new DayNightCycle(scene);
  cycle.setShadowsEnabled(true);
  const seen = new Set();
  const updating = { sun: new Set(), moon: new Set() };
  for (let hour = 0; hour < 24; hour += 0.25) {
    cycle.update(Date.UTC(2026, 9, 18, 0, 0) + hour * 3_600_000);
    seen.add(`${cycle.directionalLight.castShadow}/${cycle.moonLight.castShadow}`);
    updating.sun.add(cycle.directionalLight.shadow.autoUpdate);
    updating.moon.add(cycle.moonLight.shadow.autoUpdate);
  }
  assert.deepEqual([...seen], ['true/true'], 'both always cast');
  assert.deepEqual([...updating.sun].sort(), [false, true], 'the sun stops drawing its shadow map while set');
  assert.deepEqual([...updating.moon].sort(), [false, true], 'and the moon while down');
  cycle.setShadowsEnabled(false);
  cycle.update();
  assert.equal(cycle.directionalLight.castShadow || cycle.moonLight.castShadow, false, '精簡 has none at all');
});

test('the warm-up draws one of every kind of object, hidden ones included, and leaves lights and visibility as they were', async () => {
  const scene = new THREE.Scene();
  const lamp = new THREE.PointLight(); scene.add(lamp);
  const unlitLamp = new THREE.PointLight(); unlitLamp.visible = false; scene.add(unlitLamp);
  const hiddenRoom = new THREE.Group(); hiddenRoom.visible = false; scene.add(hiddenRoom);
  const roomLight = new THREE.SpotLight(); hiddenRoom.add(roomLight);
  const shared = new THREE.MeshStandardMaterial();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const crate2 = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const statue = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  statue.visible = false;
  const prop = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(crate, crate2, statue); hiddenRoom.add(prop);
  const drawn = new Set();
  let shadowRequests = 0;
  const renderer = {
    shadowMap: { set needsUpdate(value) { if (value) shadowRequests++; } },
    info: { programs: [] },
    render(root) {
      const lights = [];
      root.traverseVisible((object) => { if (object.isMesh) drawn.add(object); if (object.isLight) lights.push(object); });
      assert.deepEqual(lights, [lamp], 'only the lights that were lit, never the ones in a room it opened up');
      root.traverse((object) => { if (object.isMesh && object.visible) assert.equal(object.frustumCulled, false, 'drawn wherever the camera points'); });
    },
  };
  const report = await warmByDrawing(renderer, scene, new THREE.PerspectiveCamera(), undefined, 2);
  assert.equal(report.kinds, 3, 'the two crates share one draw');
  assert.ok(drawn.has(statue) && drawn.has(prop), 'hidden objects, and objects in hidden groups, are drawn');
  assert.ok(drawn.has(crate) !== drawn.has(crate2), 'one of each kind');
  assert.equal(shadowRequests, 2, 'with the shadow pass, every batch');
  assert.equal(statue.visible, false); assert.equal(hiddenRoom.visible, false); assert.equal(unlitLamp.visible, false);
  assert.equal(roomLight.visible, true, 'a light inside a hidden room is left exactly as it was');
  assert.equal(crate.frustumCulled, true);
});
