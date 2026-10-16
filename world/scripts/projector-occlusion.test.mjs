import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build } from 'esbuild';

const output = await build({
  stdin: { contents: "export { FestivalWorld, projectorApertureMaterial } from './src/world/FestivalWorld'; export { createWorldRenderer } from './src/world/WorldRenderer'; export { RooftopBand } from './src/world/RooftopBand'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'expose-material-for-test', setup(builder) {
    builder.onLoad({ filter: /FestivalWorld\.ts$/ }, async ({ path }) => ({
      contents: await readFile(path, 'utf8') + '\nexport { projectorApertureMaterial };', loader: 'ts', resolveDir: dirname(path),
    }));
  } }],
});
const { FestivalWorld, projectorApertureMaterial, createWorldRenderer, RooftopBand, THREE } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

test('desktop and lite worlds each create one alpha context while preserving graphics and XR settings', () => {
  for (const normalGraphics of [true, false]) {
    const canvas = {}, clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1_000_000);
    const allocations = [], values = {};
    const renderer = createWorldRenderer({
      canvas, normalGraphics, pixelRatio: normalGraphics ? 1.25 : 1,
      checkShaderErrors: false, inactiveClipPlane: clipPlane,
    }, parameters => {
      allocations.push(parameters);
      return {
        debug: {}, shadowMap: {}, setPixelRatio(value) { values.pixelRatio = value; },
        xr: {
          setReferenceSpaceType(value) { values.space = value; },
          setFramebufferScaleFactor(value) { values.xrScale = value; },
          setFoveation(value) { values.foveation = value; },
        },
      };
    });
    assert.equal(allocations.length, 1);
    assert.deepEqual(allocations[0], { canvas, alpha: true, antialias: normalGraphics, powerPreference: 'high-performance' });
    assert.equal(renderer.shadowMap.enabled, normalGraphics);
    assert.equal(renderer.shadowMap.type, THREE.PCFSoftShadowMap);
    assert.equal(values.pixelRatio, normalGraphics ? 1.25 : 1);
    assert.equal(renderer.xr.enabled, true);
    assert.deepEqual([values.space, values.xrScale, values.foveation], ['local-floor', .78, .7]);
    assert.deepEqual(renderer.clippingPlanes, [clipPlane]);
    for (const point of [new THREE.Vector3(0, -200, 0), new THREE.Vector3(0, 200, 0)]) {
      assert.ok(clipPlane.distanceToPoint(point) > 0, 'the idle plane clips part of the world');
    }
  }
});

test('the asynchronously loaded band fire joins the same main and projector light set before it becomes visible', async () => {
  const originalLoad = RooftopBand.prototype.load, savedDocument = globalThis.document;
  globalThis.document = { createElement() { return { getContext() { return { fillRect() {} }; } }; } };
  let finishLoad;
  // Keep the real FestivalWorld -> RooftopBand callback and buildFire path;
  // delay only file delivery until the initial world-light traversal is over.
  RooftopBand.prototype.load = function () {
    return new Promise(resolve => { finishLoad = () => {
      const anchor = new THREE.Group(); this.group.add(anchor);
      this.buildFire(anchor); resolve();
    }; });
  };
  try {
    const world = Object.create(FestivalWorld.prototype);
    const scene = new THREE.Scene(), lampRegistrations = [];
    const sun = new THREE.DirectionalLight(); scene.add(sun);
    Object.assign(world, {
      scene, colliders: [],
      dayNight: { addLampLight(light, intensity) {
        assert.equal(light.parent, null, 'the late light was visible before its render layers were registered');
        lampRegistrations.push({ light, intensity });
      } },
    });
    world.createRooftopBand();
    scene.traverse(object => { if (object.isLight) object.layers.enable(2); });
    const lightIds = layer => {
      const result = [];
      scene.traverseVisible(object => { if (object.isLight && object.layers.isEnabled(layer)) result.push(object.uuid); });
      return result.sort();
    };
    assert.deepEqual(lightIds(0), lightIds(2));
    finishLoad(); await Promise.resolve();
    assert.equal(lampRegistrations.length, 1);
    assert.equal(lampRegistrations[0].intensity, 16);
    assert.equal(lightIds(0).length, 2, 'the bonfire light was not actually mounted');
    assert.deepEqual(lightIds(0), lightIds(2), 'late band loading changed only the main shader light count');
  } finally { RooftopBand.prototype.load = originalLoad; globalThis.document = savedDocument; }
});

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
  const inactivePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1_000_000);
  const idleClipping = [inactivePlane];
  const renderer = {
    autoClear: true, shadowMap: { enabled: true, autoUpdate: true, needsUpdate: true }, clippingPlanes: idleClipping, info: { render: { calls: 1 } },
    setScissorTest(value) { events.push(['scissorTest', value]); },
    setScissor(...value) { events.push(['scissor', ...value]); },
    clear(...value) { events.push(['clear', ...value]); },
    render(rendered, cam) {
      events.push(['render', rendered === scene ? 'avatars' : 'aperture', cam.layers.mask, this.autoClear]);
      if (rendered === scene) {
        assert.equal(visible.visible, true); assert.equal(hidden.visible, false);
        assert.equal(this.clippingPlanes.length, 1, 'first screening introduced a new clip-plane shader variant');
        assert.equal(this.shadowMap.enabled, true, 'first screening introduced an unshadowed shader variant');
        assert.equal(this.shadowMap.autoUpdate, false, 'foreground repeats the main shadow-map renders');
        assert.equal(this.shadowMap.needsUpdate, false, 'pending updates repeat the main shadow-map renders');
      }
    },
  };
  Object.assign(world, {
    scene, camera, renderer, conservesMobileGpu: true,
    projectors: new Map(['rooftop', 'club'].map(key => [key, { aperture: new THREE.Mesh() }])),
    projectorApertureScene: new THREE.Scene(), projectorClipPlane: new THREE.Plane(),
    foregroundAvatarEntries: () => [{ id: 'DJ', group: visible }, { id: 'hidden', group: hidden }],
    avatarIntersectsProjector: () => true,
  });
  return { world, events, visible, hidden, background, renderer, idleClipping };
}

test('single-context DJ redraw retains booth depth across both projectors', () => {
  const f = fixture();
  const scissors = new Map(['rooftop', 'club'].map(key => [key, { x: 10, y: 20, width: 200, height: 300 }]));
  f.world.compositeProjectorAvatars(['rooftop', 'club'], scissors);
  assert.equal(f.events.filter(([kind]) => kind === 'clear').length, 0, 'world depth was erased before drawing the DJ');
  const renders = f.events.filter(([kind]) => kind === 'render');
  assert.deepEqual(renders.map(([, pass]) => pass), ['aperture', 'avatars', 'avatars']);
  assert.ok(renders.every(([, , , autoClear]) => autoClear === false));
  assert.deepEqual(f.world.lastSingleContextAvatarIds, ['DJ']);
  assert.equal(f.visible.visible, true); assert.equal(f.hidden.visible, false);
  assert.equal(f.world.scene.background, f.background);
  assert.equal(f.renderer.autoClear, true); assert.equal(f.renderer.shadowMap.enabled, true);
  assert.equal(f.renderer.clippingPlanes, f.idleClipping); assert.equal(f.world.camera.layers.mask, 1);
  assert.equal(f.renderer.shadowMap.autoUpdate, true); assert.equal(f.renderer.shadowMap.needsUpdate, true);
  assert.ok([...f.world.projectors.values()].every(p => !p.aperture.visible));
});

test('compositor restores scene and avatar state if a redraw fails', () => {
  const f = fixture(); f.renderer.render = scene => { if (scene === f.world.scene) throw new Error('render failed'); };
  assert.throws(() => f.world.compositeProjectorAvatars(['rooftop'], new Map([['rooftop', { x: 0, y: 0, width: 1, height: 1 }]])), /render failed/);
  assert.equal(f.visible.visible, true); assert.equal(f.hidden.visible, false);
  assert.equal(f.world.scene.background, f.background); assert.equal(f.renderer.autoClear, true);
  assert.equal(f.renderer.shadowMap.enabled, true); assert.equal(f.renderer.clippingPlanes, f.idleClipping);
  assert.equal(f.renderer.shadowMap.autoUpdate, true); assert.equal(f.renderer.shadowMap.needsUpdate, true);
  assert.equal(f.world.camera.layers.mask, 1);
  assert.ok([...f.world.projectors.values()].every(p => !p.aperture.visible));
});

test('scenes without video skip all projector passes on desktop and mobile', () => {
  for (const mobile of [true, false]) {
    const f = fixture(); f.world.conservesMobileGpu = mobile;
    f.world.compositeProjectorAvatars([], new Map());
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.world.lastSingleContextAvatarIds, []);
    assert.ok([...f.world.projectors.values()].every(p => !p.aperture.visible));
  }
});

test('desktop and mobile redraw only avatars intersecting the active screen, with the same world depth', () => {
  for (const mobile of [true, false]) {
    const f = fixture(); f.world.conservesMobileGpu = mobile;
    const outsider = new THREE.Group();
    const entries = f.world.foregroundAvatarEntries;
    f.world.foregroundAvatarEntries = () => [...entries(), { id: 'outside', group: outsider }];
    f.world.avatarIntersectsProjector = group => group !== outsider;
    f.world.compositeProjectorAvatars(['club'], new Map([['club', { x: 2, y: 3, width: 100, height: 90 }]]));
    assert.deepEqual(f.world.lastSingleContextAvatarIds, ['DJ']);
    assert.equal(f.events.filter(([kind]) => kind === 'clear').length, 0);
    assert.deepEqual(f.events.filter(([kind]) => kind === 'render').map(([, pass]) => pass), ['aperture', 'avatars']);
    assert.equal(outsider.visible, true, 'the ordinary world visibility was not restored');
  }
});

test('programme refreshes retain an unchanged poster texture and replace changed titles, source states or video maps', () => {
  const savedDocument = globalThis.document;
  let canvases = 0, disposed = 0;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas'); canvases += 1;
      return { getContext() { return {
        fillRect() {}, strokeRect() {}, fillText() {},
        measureText(text) { return { width: text.length * 20 }; },
      }; } };
    },
  };
  try {
    const world = Object.create(FestivalWorld.prototype);
    const projector = { xrPoster: new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()) };
    Object.assign(world, {
      projectors: new Map([['shore', projector]]), privateOwns: () => false,
      stopImmersiveVideo() {}, projectorVenue: () => undefined, releaseProjector() {},
    });
    const film = { id: 'same-film', title: 'A FILM', youtubeId: 'id', embedUrl: 'https://www.youtube.com/embed/id' };
    world.setPublicScreening('shore', film, 0);
    const first = projector.xrPoster.material.map;
    first.addEventListener('dispose', () => { disposed += 1; });
    for (let index = 0; index < 50; index += 1) world.setPublicScreening('shore', film, index);
    assert.equal(canvases, 1, 'unchanged schedule updates allocated 1024px posters');
    assert.equal(projector.xrPoster.material.map, first);
    world.setPublicScreening('shore', { ...film, title: 'A NEW TITLE' }, 51);
    assert.equal(canvases, 2); assert.equal(disposed, 1);
    world.setPublicScreening('shore', { ...film, title: 'A NEW TITLE', immersiveUrl: 'https://example.test/film.mp4' }, 52);
    assert.equal(canvases, 3, 'direct-video availability changed without updating the fallback message');
    projector.xrPoster.material.map = new THREE.Texture();
    world.refreshXrPoster('shore');
    assert.equal(canvases, 4, 'the title cache accidentally retained a video map');
    projector.xrPoster.material.map = null;
    world.refreshXrPoster('shore');
    assert.equal(canvases, 5, 'stopping an immersive film left the fallback empty');
  } finally { globalThis.document = savedDocument; }
});
