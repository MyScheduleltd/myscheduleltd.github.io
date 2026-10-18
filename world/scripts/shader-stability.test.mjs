import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Freezes on iPhone came from shaders compiled in the middle of play
// (WebKit probe, 2026-10-18). These pin the two causes that were fixed.
const bundle = await build({
  stdin: {
    contents: "export { DayNightCycle } from './src/world/DayNightCycle'; export { warmByDrawing } from './src/world/SceneWarmup'; export * as THREE from 'three';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { DayNightCycle, warmByDrawing, THREE } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

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
  for (let minute = 0; minute < 60; minute += 0.5) {
    cycle.update(Date.UTC(2026, 9, 18, 0, 0) + minute * 60_000);
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
