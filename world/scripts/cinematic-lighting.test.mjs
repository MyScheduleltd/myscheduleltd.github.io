import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled = await build({ stdin: { contents: "export * from './src/world/DayNightCycle';export * from './src/world/SolarClock';export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { THREE, DayNightCycle, CINEMATIC_LIGHTING, solarOrbitAtHour } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const pixels = (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
const paint = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), getImageData: (_x, _y, w, h) => pixels(w, h) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => paint }) };
const atHour = hour => Date.UTC(2026, 9, 21) + hour * 3_600_000;
const luminance = colour => colour.r * .2126 + colour.g * .7152 + colour.b * .0722;

test('midnight has a warm shaping key over cool shadows, with bounded fill/exposure and a readable phone bounce floor', () => {
  const cycle = new DayNightCycle(new THREE.Scene(), undefined, { timeZone: 'UTC' }), state = cycle.update(atHour(0));
  assert.ok(cycle.moonLight.color.r > cycle.moonLight.color.b * 1.5);
  assert.ok(cycle.hemisphereLight.color.b > cycle.hemisphereLight.color.r * 1.5);
  assert.ok(cycle.hemisphereLight.groundColor.b > cycle.hemisphereLight.groundColor.r);
  assert.ok(cycle.hemisphereLight.intensity >= .75 && cycle.hemisphereLight.intensity <= .9);
  assert.ok(cycle.moonLight.intensity > cycle.hemisphereLight.intensity * 1.8);
  assert.ok(state.exposure >= 1.2 && state.exposure <= 1.3);
  const normalFill = cycle.hemisphereLight.intensity;
  cycle.setAmbientLift(.85); cycle.update(atHour(0));
  assert.ok(cycle.hemisphereLight.intensity > normalFill && cycle.hemisphereLight.intensity <= 1.05);
  assert.ok(luminance(cycle.hemisphereLight.groundColor) * cycle.hemisphereLight.intensity * state.exposure > .07,
    'linear bounce proxy protects visibility; browser QA still judges actual road pixels');
  cycle.setAmbientLift(100); cycle.update(atHour(0));
  assert.ok(cycle.hemisphereLight.intensity <= normalFill + CINEMATIC_LIGHTING.mobileFillAddition);
  cycle.setAmbientLift(NaN); cycle.update(atHour(0)); assert.equal(cycle.hemisphereLight.intensity, normalFill);
});

test('the actual clock/orbits and constant light/shadow counts survive a whole civil day; local lamp anchors and colours are unchanged', () => {
  const scene = new THREE.Scene(), cycle = new DayNightCycle(scene, undefined, { timeZone: 'UTC' });
  const lamp = new THREE.PointLight(0xffb75c), emitter = new THREE.MeshStandardMaterial({ emissive: 0xffb75c });
  lamp.position.set(14, 6.2, -33); scene.add(lamp); cycle.addLampLight(lamp, 18); cycle.addLampMaterial(emitter);
  const source = lamp.position.clone(), colour = lamp.color.clone(), emission = emitter.emissive.clone();
  let lightCount = 0; scene.traverse(object => { if (object.isLight) lightCount++; }); assert.equal(lightCount, 4);
  const shadowCounts = new Set(), values = [];
  for (let hour = 0; hour <= 24; hour += .125) {
    const state = cycle.update(atHour(hour)), expectedSun = solarOrbitAtHour(hour % 24);
    assert.equal(state.clockSource, 'time-zone'); assert.ok(Math.abs(state.localHour - hour % 24) < 1e-8);
    assert.ok(cycle.sunObject.position.distanceTo(new THREE.Vector3(expectedSun.x, expectedSun.y, expectedSun.z)) < 1e-7);
    assert.ok(cycle.directionalLight.position.distanceTo(cycle.sunObject.position.clone().multiplyScalar(.48)) < 1e-7);
    assert.deepEqual(lamp.position.toArray(), source.toArray()); assert.equal(lamp.color.getHex(), colour.getHex()); assert.equal(emitter.emissive.getHex(), emission.getHex());
    assert.ok(lamp.intensity >= 0 && lamp.intensity <= 18 * 1.57); assert.equal(lamp.intensity, emitter.emissiveIntensity * 18);
    shadowCounts.add(`${cycle.directionalLight.castShadow}/${cycle.moonLight.castShadow}`);
    let current = 0; scene.traverse(object => { if (object.isLight) current++; }); assert.equal(current, lightCount);
    const value = [cycle.hemisphereLight.intensity, state.exposure, lamp.intensity]; assert.ok(value.every(Number.isFinite)); values.push(value);
  }
  assert.deepEqual([...shadowCounts], ['true/true']);
  for (let i = 1; i < values.length; i++) { assert.ok(Math.abs(values[i][0] - values[i - 1][0]) < .04); assert.ok(Math.abs(values[i][1] - values[i - 1][1]) < .04); }
  cycle.setShadowsEnabled(false); cycle.update(atHour(0)); assert.equal(cycle.directionalLight.castShadow, false); assert.equal(cycle.moonLight.castShadow, false);
});

test('phone fill does not flatten daylight, and the sunrise seam retains continuous colour and brightness', () => {
  const day = new DayNightCycle(new THREE.Scene(), 15); day.update(); const fill = day.hemisphereLight.intensity;
  day.setAmbientLift(.85); day.update(); assert.equal(day.hemisphereLight.intensity, fill);
  const before = new DayNightCycle(new THREE.Scene(), 59.999), after = new DayNightCycle(new THREE.Scene(), 0);
  const a = before.update(), b = after.update();
  assert.ok(Math.abs(a.exposure - b.exposure) < .001);
  assert.ok(Math.abs(before.hemisphereLight.intensity - after.hemisphereLight.intensity) < .001);
  assert.ok(before.scene.background.distanceTo ? before.scene.background.distanceTo(after.scene.background) < .001 : before.scene.background.clone().sub(after.scene.background).toArray().every(value => Math.abs(value) < .001));
});
