import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build } from 'esbuild';

const output = await build({
  stdin: { contents: "export { FestivalWorld, projectorApertureMaterial } from './src/world/FestivalWorld'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'expose-material-for-test', setup(builder) {
    builder.onLoad({ filter: /FestivalWorld\.ts$/ }, async ({ path }) => ({
      contents: await readFile(path, 'utf8') + '\nexport { projectorApertureMaterial };', loader: 'ts', resolveDir: dirname(path),
    }));
  } }],
});
const { FestivalWorld, projectorApertureMaterial, THREE } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

test('the video aperture retains closer world surfaces without changing their depth', () => {
  assert.equal(projectorApertureMaterial.depthTest, true);
  assert.equal(projectorApertureMaterial.depthWrite, false);
  assert.equal(projectorApertureMaterial.blending, THREE.NoBlending);
  assert.equal(projectorApertureMaterial.opacity, 0);
});

function fixture() {
  const world = Object.create(FestivalWorld.prototype);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.background = new THREE.Color(0x123456);
  const background = scene.background;
  const visible = new THREE.Group(), hidden = new THREE.Group(); hidden.visible = false;
  const events = [];
  const renderer = {
    autoClear: true, shadowMap: { enabled: true }, clippingPlanes: [], info: { render: { calls: 1 } },
    setScissorTest(value) { events.push(['scissorTest', value]); },
    setScissor(...value) { events.push(['scissor', ...value]); },
    clear(...value) { events.push(['clear', ...value]); },
    render(rendered, cam) {
      events.push(['render', rendered === scene ? 'avatars' : 'aperture', cam.layers.mask, this.autoClear]);
      if (rendered === scene) { assert.equal(visible.visible, true); assert.equal(hidden.visible, false); }
    },
  };
  Object.assign(world, {
    scene, camera, renderer, conservesMobileGpu: true,
    projectors: new Map(['rooftop', 'club'].map(key => [key, { aperture: new THREE.Mesh() }])),
    projectorApertureScene: new THREE.Scene(), projectorClipPlane: new THREE.Plane(),
    foregroundAvatarEntries: () => [{ id: 'DJ', group: visible }, { id: 'hidden', group: hidden }],
    avatarIntersectsProjector: () => true,
  });
  return { world, events, visible, hidden, background, renderer };
}

test('single-context DJ redraw retains booth depth across both projectors', () => {
  const f = fixture();
  const scissors = new Map(['rooftop', 'club'].map(key => [key, { x: 10, y: 20, width: 200, height: 300 }]));
  f.world.compositeMobileAvatars(['rooftop', 'club'], scissors);
  assert.equal(f.events.filter(([kind]) => kind === 'clear').length, 0, 'world depth was erased before drawing the DJ');
  const renders = f.events.filter(([kind]) => kind === 'render');
  assert.deepEqual(renders.map(([, pass]) => pass), ['aperture', 'avatars', 'avatars']);
  assert.ok(renders.every(([, , , autoClear]) => autoClear === false));
  assert.deepEqual(f.world.lastSingleContextAvatarIds, ['DJ']);
  assert.equal(f.visible.visible, true); assert.equal(f.hidden.visible, false);
  assert.equal(f.world.scene.background, f.background);
  assert.equal(f.renderer.autoClear, true); assert.equal(f.renderer.shadowMap.enabled, true);
  assert.deepEqual(f.renderer.clippingPlanes, []); assert.equal(f.world.camera.layers.mask, 1);
  assert.ok([...f.world.projectors.values()].every(p => !p.aperture.visible));
});

test('compositor restores scene and avatar state if a redraw fails', () => {
  const f = fixture(); f.renderer.render = scene => { if (scene === f.world.scene) throw new Error('render failed'); };
  assert.throws(() => f.world.compositeMobileAvatars(['rooftop'], new Map([['rooftop', { x: 0, y: 0, width: 1, height: 1 }]])), /render failed/);
  assert.equal(f.visible.visible, true); assert.equal(f.hidden.visible, false);
  assert.equal(f.world.scene.background, f.background); assert.equal(f.renderer.autoClear, true);
  assert.equal(f.renderer.shadowMap.enabled, true); assert.deepEqual(f.renderer.clippingPlanes, []);
  assert.equal(f.world.camera.layers.mask, 1);
  assert.ok([...f.world.projectors.values()].every(p => !p.aperture.visible));
});

test('the two-context path and scenes without video skip the single-context passes', () => {
  for (const singleContext of [true, false]) {
    const f = fixture(); f.world.conservesMobileGpu = singleContext;
    f.world.compositeMobileAvatars(singleContext ? [] : ['club'], new Map());
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.world.lastSingleContextAvatarIds, []);
    assert.ok([...f.world.projectors.values()].every(p => !p.aperture.visible));
  }
});
