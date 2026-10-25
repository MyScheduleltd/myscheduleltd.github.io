import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Use the production methods and Three's actual resources without opening a
// browser/GL context. The renderer records program identity and owned disposal.
const bundle = await build({
  stdin: { contents: "export { FestivalWorld } from './src/world/FestivalWorld'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false,
});
const { FestivalWorld, THREE } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const noop = () => {};

function fixture(autoClear = true) {
  const world = Object.create(FestivalWorld.prototype), programs = new Set(), compiled = [], drawn = [], copied = [];
  const properties = new WeakMap(); let width = 800, height = 600, level = 0, failDraw = false, pending = false;
  const renderer = {
    autoClear, setAnimationLoop: noop, dispose: noop,
    properties: { get: material => properties.get(material) ?? {} },
    compile(scene, camera, target) {
      assert.equal(target, scene);
      scene.traverse(object => {
        if (!object.material) return;
        programs.add(object.material); compiled.push(object.material);
        properties.set(object.material, { currentProgram: { isReady: () => !pending } });
        object.material.addEventListener('dispose', () => properties.delete(object.material));
      });
      return new Set(compiled);
    },
    render(scene, camera) {
      assert.equal(this.autoClear, false, 'a postprocess never clears the festival underneath it');
      scene.traverse(object => { if (object.material) assert.ok(programs.has(object.material), 'first action must reuse a gate-prepared material/program'); });
      drawn.push({ scene, camera });
      if (failDraw) throw new Error('Test driver draw failure');
    },
    copyFramebufferToTexture(texture) { copied.push(texture); },
    getDrawingBufferSize(size) { return size.set(width, height); },
  };
  Object.assign(world, {
    renderer, preview: false, disposed: false, doubleVisionSize: new THREE.Vector2(), drunkPhase: 1,
    drinkLevel: () => level, applyDrunkScreen: noop,
  });
  return { world, renderer, compiled, drawn, copied, programs,
    drinks(value) { level = value; }, resize(w, h) { width = w; height = h; },
    fail(value) { failDraw = value; }, pending(value) { pending = value; } };
}

function countDisposal(resource) {
  const result = { count: 0 }; resource.addEventListener('dispose', () => result.count++); return result;
}

test('gate prepares one tiny retained effect; the first third drink and viewport changes reuse its shader and quad', async () => {
  const f = fixture(); await f.world.prepareDoubleVision();
  const view = f.world.doubleVision, material = view.material, quad = view.quad, initialTexture = view.texture;
  const initialDisposed = countDisposal(initialTexture);
  assert.deepEqual([initialTexture.image.width, initialTexture.image.height], [1, 1], 'only four RGBA bytes of frame copy before use');
  assert.equal(material.uniforms.opacity.value, 0); assert.equal(f.compiled.length, 1); assert.equal(f.drawn.length, 1);
  assert.equal(f.renderer.autoClear, true);
  f.world.drawDoubleVision(); f.drinks(2); f.world.drawDoubleVision();
  assert.equal(view.texture, initialTexture); assert.equal(f.copied.length, 0, 'sober frames allocate/copy nothing');
  f.drinks(3); f.world.drawDoubleVision();
  assert.equal(f.world.doubleVision, view); assert.equal(view.material, material); assert.equal(view.quad, quad);
  assert.equal(f.compiled.length, 1); assert.equal(f.programs.size, 1); assert.equal(initialDisposed.count, 1);
  assert.deepEqual([view.texture.image.width, view.texture.image.height], [800, 600]);
  assert.equal(view.material.uniforms.map.value, view.texture); assert.ok(view.material.uniforms.opacity.value > 0);
  const liveTexture = view.texture, liveDisposed = countDisposal(liveTexture);
  f.world.drawDoubleVision(); assert.equal(view.texture, liveTexture, 'same viewport retains its generated image');
  f.resize(1200, 900); f.world.drawDoubleVision();
  assert.equal(liveDisposed.count, 1); assert.notEqual(view.texture, liveTexture);
  assert.equal(view.material, material); assert.equal(view.quad, quad); assert.equal(f.programs.size, 1);
  assert.deepEqual([view.texture.image.width, view.texture.image.height], [1200, 900]);
  f.world.disposeDoubleVision();
});

test('the admission barrier actually waits for the effect shader and its real driver draw', async () => {
  const f = fixture(); f.pending(true);
  let completed = false;
  const preparing = f.world.prepareDoubleVision().then(() => { completed = true; });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(completed, false); assert.equal(f.drawn.length, 0);
  f.pending(false); await preparing;
  assert.equal(f.drawn.length, 1); assert.equal(completed, true);
  f.world.disposeDoubleVision();
});

test('postprocess warmup and in-play driver failures both restore the previous renderer clear state', async () => {
  for (const autoClear of [true, false]) {
    const f = fixture(autoClear); f.fail(true);
    await assert.rejects(f.world.prepareDoubleVision(), /driver draw failure/);
    assert.equal(f.renderer.autoClear, autoClear);
    f.fail(false); await f.world.prepareDoubleVision(); f.drinks(3); f.fail(true);
    assert.throws(() => f.world.drawDoubleVision(), /driver draw failure/);
    assert.equal(f.renderer.autoClear, autoClear);
    f.world.disposeDoubleVision();
  }
});

function supplyStopDependencies(world) {
  Object.assign(world, {
    scene: new THREE.Scene(), neonFrames: [], npcs: [], projectors: new Map(),
    closeNpcDialogue: noop, stopArcadeGame: noop, stopPhoneOrientation: noop, releaseHeadCoupledView: noop,
    venueSceneryAssets: { dispose: noop }, environmentMaterials: { dispose: noop },
    audio: { setAmbientMix: noop, setSkating: noop, stopFireworks: noop },
    gamepad: { stop: noop }, headTracking: { release: noop }, canvas: { removeEventListener: noop },
  });
}

test('real World.stop releases every owned effect resource once and an interrupted warmup never draws after teardown', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = { removeEventListener: noop, clearInterval: noop };
  globalThis.document = { removeEventListener: noop };
  try {
    for (const interrupted of [false, true]) {
      const f = fixture(); supplyStopDependencies(f.world); f.pending(interrupted);
      const preparing = f.world.prepareDoubleVision();
      if (!interrupted) { await preparing; f.drinks(3); f.world.drawDoubleVision(); }
      const view = f.world.doubleVision, drawsBeforeStop = f.drawn.length;
      const released = [view.texture, view.material, view.quad.geometry].map(countDisposal);
      const retained = new THREE.MeshStandardMaterial(), retainedDisposed = countDisposal(retained);
      f.world.warmAvatarMaterials = new Set([retained]);
      f.world.stop(); f.world.stop(); await preparing;
      assert.equal(f.world.doubleVision, undefined); assert.equal(view.scene.children.length, 0);
      assert.deepEqual(released.map(item => item.count), [1, 1, 1]);
      assert.equal(retainedDisposed.count, 1, 'World.stop also releases retained gate program owners once');
      assert.equal(f.world.warmAvatarMaterials, undefined);
      await f.world.prepareDoubleVision(); f.world.drawDoubleVision();
      assert.equal(f.drawn.length, drawsBeforeStop, 'disposed worlds cannot recreate or draw the effect');
      assert.equal(f.world.doubleVision, undefined);
    }
  } finally { globalThis.window = oldWindow; globalThis.document = oldDocument; }
});

test('immersive headsets and an unprepared world cannot create a late fixed effect during an action', async () => {
  const cold = fixture(); cold.drinks(3); cold.world.drawDoubleVision();
  assert.equal(cold.world.doubleVision, undefined); assert.equal(cold.compiled.length, 0);
  const f = fixture(); await f.world.prepareDoubleVision(); f.drinks(6);
  f.world.xrActive = true; f.world.xrSimulated = false; f.world.drawDoubleVision();
  assert.equal(f.copied.length, 0); assert.equal(f.world.doubleVision.texture.image.width, 1);
  f.world.disposeDoubleVision();
});

test('local and shared fireworks use the prepared audio only, even when optional gate sounds were unavailable', () => {
  const world = Object.create(FestivalWorld.prototype), shows = [], temple = []; let stopped = 0;
  Object.assign(world, {
    audio: { stopFireworks() { stopped++; }, prepareFireworks() { throw new Error('An action retried a fixed sound download'); } },
    fireworksShow: { start(...args) { shows.push(args); } },
    templeFireworks: { start(...args) { temple.push(args); }, stop: noop },
  });
  world.startFireworks(); world.startFireworks(125_000);
  assert.equal(stopped, 2); assert.equal(shows.length, 2);
  world.syncDonationCelebration({ id: 'fresh', startedAt: 10_000, durationMs: 24_000 }, 11_000);
  world.syncDonationCelebration({ id: 'fresh', startedAt: 10_000, durationMs: 24_000 }, 12_000);
  assert.equal(temple.length, 1, 'repeated shared state does not replay its celebration');
});

test('real player contact blobs remain visible scenery but never become depth casters across wardrobe and graphics changes', () => {
  const world = Object.create(FestivalWorld.prototype), silhouettes = [];
  Object.assign(world, {
    player: new THREE.Group(), originalPlayerIdle: new THREE.Group(), carriedProp: new THREE.Group(), scene: new THREE.Scene(),
    playerShadow: new THREE.Mesh(new THREE.CircleGeometry(.55, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .3 })),
    outfit: 'festival', graphicsMode: 'normal',
    createAvatarRig(parent) {
      const silhouette = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
      parent.add(silhouette); silhouettes.push(silhouette); return {};
    },
    populatePopcornProp: noop, positionPopcornProp: noop,
  });
  const palette = { skin: '#dfb590', hair: '#3b3633', top: '#18191b', bottoms: '#44464a', swimwear: '#577467' };
  world.createPlayer(palette);
  const blobs = [world.playerShadow, ...world.originalPlayerIdle.children.filter(object => object.userData.avatarContactShadow)];
  assert.equal(blobs.length, 2, 'the actual player setup marks the local and idle contact circles');
  for (const graphics of ['normal', 'lite', 'normal']) for (const top of ['#18191b', '#191a1c', '#1a1b1d', '#1b1c1e', '#28191b', '#291a1c', '#2a1b1d', '#2b1c1e']) {
    world.graphicsMode = graphics; world.setAvatarPalette({ ...palette, top });
    for (const blob of blobs) blob.castShadow = true; // An old or generic body traversal must be corrected.
    world.castShadows(world.player); world.castShadows(world.originalPlayerIdle);
    assert.ok(blobs.every(blob => !blob.castShadow && blob.visible && blob.userData.projectorBackground));
    assert.ok(blobs.every(blob => blob.material.opacity === .3 && blob.material.transparent), 'the painted contact treatment stays unchanged');
    assert.ok(silhouettes.every(mesh => mesh.castShadow === (graphics === 'normal')), 'the body still casts its ordinary detailed shadow in Normal');
  }
});
