import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const previewWorlds = [], loads = [];
let loadModel = () => Promise.resolve();
globalThis.__gatePreviewTestWorlds = previewWorlds;
globalThis.__gatePreviewTestLoad = (...args) => { loads.push(args); return loadModel(...args); };
const bundle = await build({ entryPoints: ['src/world/GatePreview.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'preview-boundary', setup(builder) {
    builder.onResolve({ filter: /\/FestivalWorld$/ }, () => ({ path: 'world', namespace: 'preview-test' }));
    builder.onResolve({ filter: /\/ImportedAvatar$/ }, () => ({ path: 'avatars', namespace: 'preview-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'preview-test' }, ({ path }) => ({ contents: path === 'world' ? `
      export class FestivalWorld {
        constructor(options) { this.options=options; this.frames=[]; this.palettes=[]; this.stopped=0; globalThis.__gatePreviewTestWorlds.push(this); }
        renderGatePreview(frame) { if(this.shouldFail) throw new Error('preview draw failed'); this.frames.push(frame); this.options.canvas.width=Math.round(frame.width*frame.pixelRatio); this.options.canvas.height=Math.round(frame.height*frame.pixelRatio); this.options.canvas.lastPaint=this.frames.length; return {position:[1,2,3],fov:46}; }
        setAvatarPalette(palette) { this.palettes.push(palette); }
        cancelGateEntry() { this.cancelled=(this.cancelled??0)+1; }
        stop() { this.stopped++; }
      }` : 'export const loadOwnAvatar = (...args) => globalThis.__gatePreviewTestLoad(...args);' }));
  }}],
});
const { GatePreview } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const mathBundle = await build({ stdin: { contents: `export * from './src/world/GatePreviewLayout'; export { PreviewResourceLease } from './src/world/PreviewResourceLease'; export * as THREE from 'three'; export { PLANET, setPlanetCentre, planetBendPoint } from './src/world/PlanetCurve'; export { ISLAND } from './src/world/CoastalTerrain';`, loader: 'ts', resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm' });
const { gateAvatarScissor, gateAvatarViewport, fitGateAerialCamera, fitGateAvatarCamera, blendGateEntryCamera, PreviewResourceLease, THREE, PLANET, setPlanetCentre, planetBendPoint, ISLAND } =
  await import(`data:text/javascript;base64,${Buffer.from(mathBundle.outputFiles[0].text).toString('base64')}`);

class Element extends EventTarget {
  isConnected = true;
  children = [];
  attributes = {};
  style = {};
  captured = new Set();
  listeners = new Set();
  constructor(rect = { x: 0, y: 0, width: 1280, height: 720 }) { super(); this.rect = rect; }
  addEventListener(type, listener, options) { super.addEventListener(type, listener, options); this.listeners.add(listener); }
  removeEventListener(type, listener, options) { super.removeEventListener(type, listener, options); this.listeners.delete(listener); }
  prepend(element) { element.remove(); this.children.unshift(element); element.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined; }
  replaceWith(element) { const parent=this.parent,index=parent?.children.indexOf(this);if(parent&&index>=0){element.remove();parent.children[index]=element;element.parent=parent;this.parent=undefined;} }
  getContext(kind) { if(kind!=='2d'||captureFailure==='unavailable')return null;return {drawImage:(source)=>{if(captureFailure==='throws')throw Error('snapshot failed');assert.ok(source.lastPaint,'snapshot must read the fresh drawing buffer synchronously, before the browser clears it');this.copiedPaint=source.lastPaint;this.copiedSource=source;}}; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getBoundingClientRect() { return { ...this.rect }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  focus() { this.focused = true; }
}
let captureFailure;
const documentMock = new Element();
documentMock.hidden = false;
documentMock.createElement = () => new Element();
globalThis.document = documentMock;
const media = new EventTarget();
media.matches = false;
const motion = new EventTarget(); motion.matches = false;
globalThis.window = { matchMedia: query => query.includes('prefers-reduced-motion') ? motion : media, devicePixelRatio: 2 };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
let nextRaf = 0;
let clockNow = 0;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clockNow } });
const pendingFrames = new Map();
globalThis.requestAnimationFrame = callback => { pendingFrames.set(++nextRaf, callback); return nextRaf; };
globalThis.cancelAnimationFrame = id => pendingFrames.delete(id);
const step = now => { clockNow = now; const callbacks = [...pendingFrames.values()]; pendingFrames.clear(); callbacks.forEach(callback => callback(now));for(const world of previewWorlds)world.options.canvas.lastPaint=undefined; };
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
const palette = { skin: '#e6bd9d', hair: '#443332', top: '#18191b', bottoms: '#535644', swimwear: '#18191b' };
const pointer = (type, values) => { const event = new Event(type, { cancelable: true }); Object.assign(event, values); return event; };
const gateIslandProbes = () => {
  const points = [];
  for (const x of [ISLAND.west, (ISLAND.west + ISLAND.east) / 2, ISLAND.east]) {
    for (const z of [ISLAND.south, (ISLAND.south + ISLAND.north) / 2, ISLAND.north]) {
      points.push(planetBendPoint(new THREE.Vector3(x, 15, z)));
    }
  }
  return points;
};
const host = () => new Element();
const avatarRegion = () => new Element({ x: 700, y: 100, width: 450, height: 580 });

function reset() { clockNow = 0; previewWorlds.length = 0; loads.length = 0; loadModel = () => Promise.resolve(); captureFailure=undefined;media.matches = false; motion.matches = false; documentMock.hidden = false; pendingFrames.clear(); }

test('mobile finishes the full flight, copies the just-rendered frame in 2D, and releases its GPU before permitting the real world', async()=>{
 reset();media.matches=true;
 const target=host(),controller=new GatePreview({palette});controller.mount(target,avatarRegion());await flush();step(1000);
 const world=previewWorlds[0],original=target.children[0];
 controller.beginEntry();controller.setEntryProgress(.45);step(1050);
 const before=world.frames.at(-1).entry;
 let result;const freeze=controller.freezeEntryForWorld();freeze.then(value=>{assert.equal(world.stopped,1,'GPU owner stops before resolving admission');result=value;});
 assert.equal(controller.freezeEntryForWorld(),freeze,'concurrent asks share the same terminal handoff');
 for(let now=1100;now<1500;now+=50)step(now);
 assert.equal(result,undefined,'the original full flight remains animated, rather than snapping to its endpoint');
 for(let now=1500;now<3000&&pendingFrames.size;now+=50)step(now);
 assert.equal(await freeze,true);assert.ok(before<1);assert.equal(world.frames.at(-1).entry,1);
 const snapshot=target.children[0];assert.notEqual(snapshot,original);assert.equal(snapshot.className,'gate__world');
 assert.equal(snapshot.copiedSource,original);assert.equal(snapshot.copiedPaint,world.frames.length);
 assert.deepEqual([snapshot.width,snapshot.height],[original.width,original.height]);
 assert.equal(world.stopped,1);assert.equal(pendingFrames.size,0);
 controller.setPalette({...palette,hair:'#123456'});controller.mount(host(),avatarRegion());media.dispatchEvent(new Event('change'));
 assert.equal(previewWorlds.length,1,'retired preview cannot recreate a GPU through redraw/resize/late appearance');
 assert.equal(await controller.freezeEntryForWorld(),true,'the retained snapshot is idempotent');
 controller.dispose();controller.dispose();assert.equal(target.children.length,0);assert.deepEqual([snapshot.width,snapshot.height],[1,1]);
});

test('hidden, disposed, failed or uncapturable entrance handoffs settle safely after releasing the preview',async()=>{
 for(const outcome of ['hidden-before','hidden-during','dispose','draw-failed','no-2d','capture-failed']){
  reset();media.matches=true;motion.matches=true;
  const target=host(),controller=new GatePreview({palette});controller.mount(target,avatarRegion());await flush();step(1000);
  const world=previewWorlds[0];controller.beginEntry();
  if(outcome==='hidden-before')documentMock.hidden=true;
  const freeze=controller.freezeEntryForWorld();
  if(outcome==='hidden-during'){documentMock.hidden=true;documentMock.dispatchEvent(new Event('visibilitychange'));}
  if(outcome==='dispose')controller.dispose();
  if(outcome==='draw-failed')world.shouldFail=true;
  if(outcome==='no-2d')captureFailure='unavailable';
  if(outcome==='capture-failed')captureFailure='throws';
  step(1100);
  assert.equal(await freeze,false,outcome);assert.equal(world.stopped,1,outcome+' releases the GPU before admission can proceed');
  assert.equal(pendingFrames.size,0);assert.equal(target.children.length,0);controller.dispose();
 }
});

test('gate uses one input-free world across redraws and applies the latest appearance without rebuilding', async () => {
  reset();
  let ready = 0;
  const controller = new GatePreview({ palette, onReady: () => ready++ });
  const firstHost = host(), firstRegion = avatarRegion();
  controller.mount(firstHost, firstRegion);
  await flush(); step(1000);
  assert.equal(previewWorlds.length, 1);
  const world = previewWorlds[0], canvas = firstHost.children[0];
  assert.equal(world.options.preview, true);
  assert.equal(world.options.previewAvatar, false, 'the scenic context starts before character bytes');
  assert.equal(canvas.className, 'gate__world');
  assert.equal(world.frames.length, 1);
  assert.equal(world.frames[0].pixelRatio, 1.25);
  assert.deepEqual(world.frames[0].avatar, { x: 700, y: 100, width: 450, height: 520 });
  controller.setPalette({ ...palette, cap: '#aa2233', top: '#291a1c' });
  await flush();
  const secondHost = host(), secondRegion = avatarRegion();
  controller.mount(secondHost, secondRegion);
  assert.equal(secondHost.children[0], canvas, 'language changes retain the same GPU context and canvas');
  assert.equal(firstHost.children.length, 0);
  assert.equal(previewWorlds.length, 1);
  assert.equal(firstRegion.listeners.size, 0, 'redrawn regions do not retain drag listeners');
  assert.equal(world.palettes.at(-1).cap, '#aa2233');
  assert.equal(world.palettes.at(-1).top, '#291a1c');
  step(1050);
  assert.ok(ready >= 1);
  controller.dispose(); controller.dispose();
  assert.equal(world.stopped, 1);
  assert.equal(secondRegion.listeners.size, 0);
  assert.equal(secondHost.children.length, 0);
  assert.equal(pendingFrames.size, 0);
});

test('dragging and keyboard rotation affect the same preview and release capture when rebound', async () => {
  reset();
  const controller = new GatePreview({ palette });
  const region = avatarRegion();
  controller.mount(host(), region); await flush(); step(1000);
  const world = previewWorlds[0], initial = world.frames.at(-1).yaw;
  region.dispatchEvent(pointer('pointerdown', { button: 0, pointerId: 7, clientX: 800 }));
  region.dispatchEvent(pointer('pointermove', { pointerId: 7, clientX: 900 }));
  step(1050);
  assert.ok(Math.abs(world.frames.at(-1).yaw - initial - .9) < 1e-9);
  const keyboard = pointer('keydown', { key: 'ArrowRight' });
  region.dispatchEvent(keyboard); step(1100);
  assert.equal(keyboard.defaultPrevented, true);
  assert.ok(Math.abs(world.frames.at(-1).yaw - initial - 1.05) < 1e-9);
  controller.mount(host(), avatarRegion());
  assert.equal(region.captured.size, 0);
  controller.dispose();
});

test('mobile keeps the live backdrop, omits the avatar and observes the cheaper render budget', async () => {
  reset(); media.matches = true;
  const controller = new GatePreview({ palette });
  controller.mount(host(), avatarRegion()); await flush(); step(1000);
  const world = previewWorlds[0];
  assert.equal(loads.length, 0, 'the mobile preview does not fetch character bodies');
  assert.equal(world.options.previewAvatar, false);
  assert.equal(world.frames[0].avatar, undefined);
  assert.equal(world.frames[0].pixelRatio, .8);
  step(1050); assert.equal(world.frames.length, 1, 'mobile does not render at 20 or 30 fps');
  step(1100); assert.equal(world.frames.length, 2);
  controller.dispose();
});

test('resizing a mobile gate to desktop waits for avatar bytes and retains its existing world', async () => {
  reset(); media.matches = true;
  const controller = new GatePreview({ palette });
  controller.mount(host(), avatarRegion()); await flush(); step(1000);
  const world = previewWorlds[0];
  let resolve;
  loadModel = () => new Promise(done => { resolve = done; });
  media.matches = false;
  media.dispatchEvent(new Event('change'));
  step(1100);
  assert.equal(world.frames.at(-1).avatar, undefined, 'no premature imported-avatar construction');
  resolve(); await flush(); step(1200);
  assert.ok(world.frames.at(-1).avatar);
  assert.equal(previewWorlds.length, 1, 'the mobile world and its WebGL context are retained');
  controller.dispose();
});

test('hidden tabs pause the loop, while disposal cancels pending character initialization', async () => {
  reset();
  const controller = new GatePreview({ palette });
  controller.mount(host(), avatarRegion()); await flush(); step(1000);
  documentMock.hidden = true;
  documentMock.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pendingFrames.size, 0);
  documentMock.hidden = false;
  documentMock.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pendingFrames.size, 1);
  controller.dispose();
  let resolve;
  loadModel = () => new Promise(done => { resolve = done; });
  const late = new GatePreview({ palette });
  late.mount(host(), avatarRegion()); late.dispose();
  resolve(); await flush();
  assert.equal(previewWorlds.length, 2, 'the next gate creates its aerial world without waiting for a body');
  assert.equal(previewWorlds[1].stopped, 1, 'late body bytes cannot resurrect the disposed aerial world');
  assert.equal(pendingFrames.size, 0);
});

test('preview readiness requires an actual aerial paint but never waits for the avatar download', async () => {
  reset();
  let finishBody;
  loadModel = () => new Promise(resolve => { finishBody = resolve; });
  let readyCalls = 0;
  const controller = new GatePreview({ palette, onReady: () => readyCalls++ });
  controller.mount(host(), avatarRegion());
  assert.equal(previewWorlds.length, 1);
  let readiness;
  const ready = controller.ready().then(value => { readiness = value; });
  step(1000); await flush();
  assert.equal(previewWorlds[0].frames[0].avatar, undefined);
  assert.equal(readiness, undefined, 'a submitted draw is not yet a painted frame');
  assert.equal(readyCalls, 0);
  step(1050); await ready;
  assert.equal(readiness, true);
  assert.equal(readyCalls, 1);
  finishBody(); await flush(); step(1100);
  assert.ok(previewWorlds[0].frames.at(-1).avatar);
  controller.dispose();
});

test('unpaintable or retired preview readiness fails open without leaving pending admission', async () => {
  for (const outcome of ['hidden', 'failed', 'dispose']) {
    reset();
    const controller = new GatePreview({ palette });
    controller.mount(host(), avatarRegion());
    const ready = controller.ready();
    if (outcome === 'hidden') { documentMock.hidden = true; documentMock.dispatchEvent(new Event('visibilitychange')); }
    if (outcome === 'failed') { previewWorlds[0].shouldFail = true; step(1000); }
    if (outcome === 'dispose') controller.dispose();
    assert.equal(await ready, false);
    controller.dispose();
    assert.equal(await controller.ready(), false);
    assert.equal(pendingFrames.size, 0);
  }
});

test('cached entry remains observable for 1.2 seconds and holds its rate at actual loading progress', async () => {
  reset();
  const samples = [];
  const controller = new GatePreview({ palette, onEntryFrame: frame => samples.push(frame) });
  controller.mount(host(), avatarRegion()); await flush(); step(1000);
  controller.beginEntry(); controller.setEntryProgress(.8);
  step(1050);
  assert.ok(samples[0].progress <= .05, 'the first rendered camera step does not consume most of the flight');
  assert.deepEqual(samples[0].camera, { position: [1, 2, 3], fov: 46 });
  for (let time = 1100; time <= 1600; time += 50) step(time);
  assert.ok(Math.abs(samples.at(-1).progress - .5) < 1e-9, 'the camera is still in flight after the 480ms form exit');
  for (let time = 1650; time <= 2100; time += 50) step(time);
  assert.equal(samples.at(-1).progress, .8, 'completed camera work cannot outrun the supplied loading target');
  controller.setEntryProgress(1);
  step(2150); step(2200);
  assert.ok(samples.at(-1).progress < 1, 'the remaining journey is observable even with cached assets');
  step(2250); step(2300); step(2350);
  assert.equal(samples.at(-1).progress, 1);
  assert.ok(samples.at(-1).elapsedMs >= 1200);
  controller.dispose();
});

test('the studio avatar slides for 480ms with a stable full-size viewport and a separate visible crop', async () => {
  reset();
  const controller = new GatePreview({ palette });
  controller.mount(host(), avatarRegion()); await flush(); step(1000);
  const world = previewWorlds[0];
  controller.beginEntry(); controller.setEntryProgress(.8);
  for (const now of [1100, 1200, 1350, 1450]) {
    step(now);
    const frame = world.frames.at(-1);
    assert.ok(frame.avatar, `avatar stays visible through ${now - 1000}ms of its exit`);
    assert.equal(frame.avatarViewport.width, 450, 'cropping cannot shrink the model projection');
    assert.equal(frame.avatarViewport.height, 520);
    assert.equal(frame.avatarViewport.x, 700 + 582 * ((now - 1000) / 480));
    assert.ok(frame.avatar.width <= frame.avatarViewport.width);
  }
  assert.ok(world.frames.at(-1).avatar.width < 40, 'the final sliver is clipped rather than rescaled');
  step(1500);
  assert.equal(world.frames.at(-1).avatar, undefined);
  controller.dispose();
});

test('entry camera progress follows real loading work and completes only after its final painted frame', async () => {
  reset();
  const controller = new GatePreview({ palette });
  controller.mount(host(), avatarRegion()); await flush(); step(1000);
  const world = previewWorlds[0];
  controller.beginEntry(); controller.setEntryProgress(.3);
  await flush();
  for (let time = 1050; time <= 3050; time += 50) step(time);
  assert.ok(world.frames.at(-1).entry > .29 && world.frames.at(-1).entry <= .3);
  assert.equal(world.frames.at(-1).avatar, undefined, 'studio avatar retires as the physical entrance avatar arrives');
  const held = world.frames.at(-1).entry;
  for (let time = 3100; time <= 4100; time += 50) step(time);
  assert.equal(world.frames.at(-1).entry, held, 'elapsed time alone never fabricates load progress');
  controller.setEntryProgress(.1); step(4150);
  assert.equal(world.frames.at(-1).entryTarget, .3, 'out-of-order network progress cannot reverse the camera');
  let completed = false;
  const finished = controller.awaitEntryComplete().then(() => { completed = true; });
  await flush(); assert.equal(completed, false);
  controller.setEntryProgress(1);
  for (let time = 4200; time <= 6200; time += 50) step(time);
  await flush(); await finished;
  assert.equal(completed, true);
  assert.equal(world.frames.at(-1).entry, 1);
  assert.equal(world.frames.at(-1).entryAvatarReady, true);
  controller.dispose();
});

test('entry snapshots DOMRect prototype getters before translating its studio viewport', async () => {
  reset();
  const region = avatarRegion();
  const rect = Object.create(Object.fromEntries(Object.entries(region.rect).map(([key, value]) => [key, value])));
  region.getBoundingClientRect = () => rect;
  assert.equal(Object.keys(rect).length, 0, 'browser rectangle values need not be own enumerable properties');
  const controller = new GatePreview({ palette });
  controller.mount(host(), region); await flush(); step(1000);
  controller.beginEntry(); controller.setEntryProgress(.8); await flush(); step(1100);
  const frame = previewWorlds[0].frames.at(-1);
  assert.equal(frame.avatarViewport.width, region.rect.width);
  assert.equal(frame.avatarViewport.height, region.rect.height - 60);
  assert.ok(Object.values(frame.avatarViewport).every(Number.isFinite));
  controller.dispose();
});

test('an entry stage waits for real work and its eased camera frame to paint before construction continues', async () => {
  reset();
  const controller = new GatePreview({ palette });
  controller.mount(host(), avatarRegion()); await flush(); step(1000);
  const world = previewWorlds[0];
  controller.beginEntry(); controller.setEntryProgress(.5);
  let resumed = false;
  const stage = controller.awaitEntryProgress(.8).then(() => { resumed = true; });
  for (let time = 1050; time <= 2050; time += 50) step(time);
  await flush();
  assert.equal(resumed, false);
  assert.equal(world.frames.at(-1).entryTarget, .5, 'waiting for an animation stage cannot fabricate a completed load stage');
  controller.setEntryProgress(.8);
  let time = 2100;
  do { step(time); time += 50; } while (world.frames.at(-1).entry < .79);
  await flush(); assert.equal(resumed, false, 'reaching the camera threshold still waits for the painted frame');
  step(time); await stage;
  assert.equal(resumed, true);
  assert.equal(world.frames.at(-1).entryTarget, .8);
  controller.dispose();
});

test('stage waiters finish safely on cancellation, hiding, reduced motion, failed draw and disposal', async () => {
  for (const outcome of ['cancel', 'hide', 'reduced', 'failed', 'dispose']) {
    reset();
    const controller = new GatePreview({ palette });
    controller.mount(host(), avatarRegion()); await flush(); step(1000);
    controller.beginEntry(); controller.setEntryProgress(.1);
    if (outcome === 'reduced') motion.matches = true;
    const stage = controller.awaitEntryProgress(.8);
    if (outcome === 'cancel') controller.cancelEntry();
    if (outcome === 'hide') {
      documentMock.hidden = true;
      documentMock.dispatchEvent(new Event('visibilitychange'));
    }
    if (outcome === 'failed') { previewWorlds[0].shouldFail = true; step(1050); }
    if (outcome === 'dispose') controller.dispose();
    await stage;
    controller.dispose();
    await controller.awaitEntryProgress(.8);
  }
});

test('cancelled entry restores the same gate and reduced motion reaches the supplied stage directly', async () => {
  reset(); motion.matches = true;
  const controller = new GatePreview({ palette });
  controller.mount(host(), avatarRegion()); await flush(); step(1000);
  const world = previewWorlds[0];
  controller.beginEntry(); controller.setEntryProgress(.7); step(1050);
  assert.equal(world.frames.at(-1).entry, .7);
  const cancelled = controller.awaitEntryComplete();
  controller.cancelEntry(); await cancelled; step(1100);
  assert.equal(world.cancelled, 1);
  assert.equal(world.frames.at(-1).entry, undefined);
  assert.ok(world.frames.at(-1).avatar);
  assert.equal(previewWorlds.length, 1, 'retry preserves the original context and editable avatar');
  controller.beginEntry(); controller.setEntryProgress(1);
  let completed = false;
  void controller.awaitEntryComplete().then(() => { completed = true; });
  step(1150); await flush();
  assert.equal(completed, false, 'a reduced-motion final frame still paints before teardown');
  step(1200); await flush();
  assert.equal(completed, true);
  controller.dispose();
});

test('completed hidden-tab entry resolves without waiting for a suspended animation frame', async () => {
  reset();
  const controller = new GatePreview({ palette });
  controller.mount(host(), avatarRegion()); await flush(); step(1000);
  controller.beginEntry(); controller.setEntryProgress(.5);
  let completed = false;
  const finished = controller.awaitEntryComplete().then(() => { completed = true; });
  documentMock.hidden = true;
  documentMock.dispatchEvent(new Event('visibilitychange'));
  await flush(); assert.equal(completed, false, 'backgrounding does not pretend unfinished loading is complete');
  controller.setEntryProgress(1);
  await finished;
  assert.equal(completed, true);
  assert.equal(pendingFrames.size, 0);
  controller.dispose();

  reset(); motion.matches = true;
  const painted = new GatePreview({ palette });
  painted.mount(host(), avatarRegion()); await flush(); step(2000);
  painted.beginEntry(); painted.setEntryProgress(1); step(2050);
  const pendingPaint = painted.awaitEntryComplete();
  documentMock.hidden = true;
  documentMock.dispatchEvent(new Event('visibilitychange'));
  await pendingPaint;
  assert.equal(pendingFrames.size, 0, 'visibility change cancels an unreachable final-paint callback');
  painted.dispose();
});

test('entry camera preserves exact aerial and actual-follow endpoints across desktop and portrait', () => {
  for (const aspect of [16 / 9, 390 / 844]) {
    const from = { position: new THREE.Vector3(220, 480, 620), target: new THREE.Vector3(1.5, -320, 14), fov: 46, near: 1, far: 2200 };
    const to = { position: new THREE.Vector3(1.2, 4.1, 101.2), target: new THREE.Vector3(1.2, .68, 91.3), fov: aspect < 1 ? 74 : 58, near: .1, far: 300 };
    const camera = new THREE.PerspectiveCamera(46, aspect, 1, 2200);
    blendGateEntryCamera(camera, from, to, 0);
    assert.ok(camera.position.distanceTo(from.position) < 1e-12);
    assert.equal(camera.fov, 46);
    blendGateEntryCamera(camera, from, to, .25);
    const travelled = camera.position.distanceTo(from.position) / from.position.distanceTo(to.position);
    assert.ok(travelled > .1 && travelled < .25, 'the camera does not front-load its approach while the form still covers it');
    let previousDistance = Infinity;
    for (let frame = 0; frame <= 100; frame++) {
      blendGateEntryCamera(camera, from, to, frame / 100);
      const distance = camera.position.distanceTo(to.position);
      assert.ok(distance <= previousDistance + 1e-9, 'camera approaches the actual entrance monotonically');
      assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
      previousDistance = distance;
    }
    assert.ok(camera.position.distanceTo(to.position) < 1e-12);
    assert.equal(camera.fov, to.fov); assert.equal(camera.near, .1); assert.equal(camera.far, 300);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    assert.ok(forward.dot(to.target.clone().sub(to.position).normalize()) > 1 - 1e-12);
  }
});

test('world preview camera includes the complete curved island at desktop and portrait aspect ratios', () => {
  PLANET.on = true; PLANET.radius = 320; PLANET.radiusUniform.value = 320;
  setPlanetCentre(1.5, 14);
  for (const aspect of [16 / 9, 4 / 3, 390 / 844]) for (const elapsed of [0, 120, 1000]) {
    const camera = new THREE.PerspectiveCamera(46, aspect, 1, 2000);
    fitGateAerialCamera(camera, aspect, elapsed);
    for (const point of gateIslandProbes()) {
      const ndc = point.clone().project(camera);
      assert.ok(Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z > -1 && ndc.z < 1, `${aspect}: ${ndc.toArray()}`);
    }
    const centre = new THREE.Vector3(1.5, -320, 14);
    for (let latitude = -Math.PI / 2; latitude <= Math.PI / 2; latitude += Math.PI / 12) {
      for (let longitude = 0; longitude < Math.PI * 2; longitude += Math.PI / 12) {
        const point = new THREE.Vector3(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude))
          .multiplyScalar(320).add(centre).project(camera);
        assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z > -1 && point.z < 1,
          `complete ground sphere clipped at aspect ${aspect}: ${point.toArray()}`);
      }
    }
    assert.ok(camera.position.y > 200, 'bird\'s-eye view remains above the whole island');
  }
  PLANET.on = false;
});

test('avatar scissor clips to the visible viewport and portrait column framing retains head and feet', () => {
  assert.deepEqual(gateAvatarViewport({ x: 20, y: 30, width: 100, height: 200 }, { x: 90, y: 0, width: 80, height: 100 }),
    { x: 70, y: 130, width: 80, height: 100 }, 'the full projection retains its original bounds while the crop below is smaller');
  assert.deepEqual(gateAvatarScissor({ x: 20, y: 30, width: 100, height: 200 }, { x: 90, y: 0, width: 80, height: 100 }),
    { x: 70, y: 130, width: 30, height: 70 });
  assert.equal(gateAvatarScissor({ x: 0, y: 0, width: 100, height: 100 }, { x: 101, y: 0, width: 200, height: 100 }), undefined);
  for (const [width, height] of [[450, 580], [230, 380], [1000, 400]]) {
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 30);
    fitGateAvatarCamera(camera, width, height);
    for (const x of [-1, 1]) for (const y of [-.25, 3.7]) {
      const ndc = new THREE.Vector3(x, y, 0).project(camera);
      assert.ok(Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1);
    }
  }
});


test('preview listener lease keeps active-renderer and custom callbacks on shared geometry, material and texture', () => {
  const calls = [];
  const listener = owner => function sameName(event) { calls.push(`${owner}:${event.target.type ?? 'resource'}`); };
  const oldGeometry = listener('preview-geometry'), oldMaterial = listener('preview-material'), oldTexture = listener('preview-texture');
  const active = listener('active-game'), custom = listener('custom'), customDuringDraw = listener('custom-during-draw');
  const initialViewport = new THREE.Vector4(5, 6, 1280, 720), initialScissor = new THREE.Vector4(8, 9, 80, 90);
  const renderer = {
    viewport: initialViewport.clone(), scissor: initialScissor.clone(), scissorTest: false,
    getViewport(target) { return target.copy(this.viewport); }, getScissor(target) { return target.copy(this.scissor); },
    getScissorTest() { return this.scissorTest; }, setScissorTest(value) { this.scissorTest = value; },
    setViewport(...args) { if (args.length === 1) this.viewport.copy(args[0]); else this.viewport.set(...args); },
    setScissor(...args) { if (args.length === 1) this.scissor.copy(args[0]); else this.scissor.set(...args); },
    render(scene) {
      const mesh = scene.children[0];
      mesh.geometry.addEventListener('dispose', oldGeometry);
      mesh.material.addEventListener('dispose', oldMaterial);
      mesh.material.map.addEventListener('dispose', oldTexture);
    },
  };
  const lease = PreviewResourceLease.forRenderer(renderer);
  assert.equal(calls.length, 3, 'private probe resources immediately dispose after recording exact identities');
  assert.deepEqual(renderer.viewport, initialViewport); assert.deepEqual(renderer.scissor, initialScissor);
  assert.equal(renderer.scissorTest, false);
  calls.length = 0;
  const geometry = new THREE.BufferGeometry(), material = new THREE.MeshBasicMaterial(), texture = new THREE.Texture();
  for (const resource of [geometry, material, texture]) { resource.addEventListener('dispose', active); resource.addEventListener('dispose', custom); }
  lease.capture(() => {
    geometry.addEventListener('dispose', oldGeometry);
    material.addEventListener('dispose', oldMaterial);
    texture.addEventListener('dispose', oldTexture);
    for (const resource of [geometry, material, texture]) resource.addEventListener('dispose', customDuringDraw);
  });
  lease.dispose(); lease.dispose();
  assert.equal(calls.length, 0, 'retiring preview never dispatches resource disposal into the active renderer');
  for (const [resource, old] of [[geometry, oldGeometry], [material, oldMaterial], [texture, oldTexture]]) {
    assert.equal(resource.hasEventListener('dispose', old), false);
    assert.equal(resource.hasEventListener('dispose', active), true);
    assert.equal(resource.hasEventListener('dispose', custom), true);
    assert.equal(resource.hasEventListener('dispose', customDuringDraw), true);
    resource.dispose();
  }
  assert.equal(calls.length, 9);
  assert.ok(calls.every(call => !call.startsWith('preview-')));
});

test('listener capture restores Three event dispatch after a failed frame and preserves unrelated registrations', () => {
  const geometry = new THREE.BufferGeometry();
  const owned = () => {}, custom = () => {};
  const lease = new PreviewResourceLease([owned]);
  const original = THREE.EventDispatcher.prototype.addEventListener;
  assert.throws(() => lease.capture(() => {
    geometry.addEventListener('dispose', owned);
    geometry.addEventListener('dispose', custom);
    throw new Error('draw failed');
  }), /draw failed/);
  assert.equal(THREE.EventDispatcher.prototype.addEventListener, original);
  lease.dispose();
  assert.equal(geometry.hasEventListener('dispose', owned), false);
  assert.equal(geometry.hasEventListener('dispose', custom), true);
});
