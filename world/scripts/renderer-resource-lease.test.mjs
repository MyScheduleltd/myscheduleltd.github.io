import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The installed Three internals allocate real geometry/attribute ownership,
// with CPU-only GL counters. No browser or additional WebGL context is opened.
const output = await build({ stdin: { contents: `
 export {RendererResourceLease} from './src/world/RendererResourceLease';
 export {FestivalWorld} from './src/world/FestivalWorld';
 export {WebGLAttributes} from 'three/src/renderers/webgl/WebGLAttributes.js';
 export {WebGLGeometries} from 'three/src/renderers/webgl/WebGLGeometries.js';
 export {WebGLObjects} from 'three/src/renderers/webgl/WebGLObjects.js';
 export * as THREE from 'three';`, resolveDir: process.cwd(), loader: 'ts' },
 bundle: true, platform: 'node', format: 'esm', write: false, loader: { '.png': 'dataurl' } });
const { RendererResourceLease, FestivalWorld, WebGLAttributes, WebGLGeometries, WebGLObjects, THREE } =
 await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

function fixture() {
 const counts = { buffersCreated: 0, buffersDeleted: 0, texturesCreated: 0, texturesDeleted: 0, materialsReleased: 0, rendererDisposed: 0 };
 const gl = { ARRAY_BUFFER: 1, FLOAT: 2,
  createBuffer() { counts.buffersCreated++; return {}; }, bindBuffer() {}, bufferData() {},
  deleteBuffer() { counts.buffersDeleted++; },
 };
 let attributes, info, objects, textures, materials, disposeTexture, disposeMaterial;
 const recreate = () => {
  attributes = WebGLAttributes(gl); info = { memory: { geometries: 0 }, render: { frame: 0 } };
  const geometries = WebGLGeometries(gl, attributes, info, { releaseStatesOfGeometry() {} });
  objects = WebGLObjects(gl, geometries, attributes, info); textures = new Set(); materials = new Set();
  const ownTextures = textures, ownMaterials = materials;
  const ownTexture = event => { event.target.removeEventListener('dispose', ownTexture); if (ownTextures.delete(event.target)) counts.texturesDeleted++; };
  const ownMaterial = event => { event.target.removeEventListener('dispose', ownMaterial); if (ownMaterials.delete(event.target)) counts.materialsReleased++; };
  disposeTexture = ownTexture; disposeMaterial = ownMaterial;
 };
 recreate();
 const prepareMaterial = material => { if (!materials.has(material)) { materials.add(material); material.addEventListener('dispose', disposeMaterial); } };
 const renderer = {
  domElement: new EventTarget(),
  viewport: new THREE.Vector4(0, 0, 800, 600), scissor: new THREE.Vector4(0, 0, 800, 600), scissorTest: false,
  getViewport(v) { return v.copy(this.viewport); }, getScissor(v) { return v.copy(this.scissor); }, getScissorTest() { return this.scissorTest; },
  setViewport(...args) { if (args.length === 1) this.viewport.copy(args[0]); else this.viewport.set(...args); },
  setScissor(...args) { if (args.length === 1) this.scissor.copy(args[0]); else this.scissor.set(...args); }, setScissorTest(value) { this.scissorTest = value; },
  render(scene) {
   info.render.frame++;
   scene.traverseVisible(object => { if (!object.isMesh) return; objects.update(object); prepareMaterial(object.material); if (object.material.map) this.initTexture(object.material.map); });
   if (this.failDraw) throw Error('interrupted admission draw');
  },
  compile(scene) { const result = new Set(); scene.traverse(object => { if (object.material) { prepareMaterial(object.material); result.add(object.material); } }); return result; },
  initTexture(texture) { if (!textures.has(texture)) { textures.add(texture); counts.texturesCreated++; texture.addEventListener('dispose', disposeTexture); } },
  // This is the geometry-related action taken by Three WebGLRenderer.dispose.
  // It clears update scheduling, but not source callbacks or attribute buffers.
  dispose() { counts.rendererDisposed++; objects.dispose(); }, setAnimationLoop() {},
 };
 return { renderer, counts, get attributes() { return attributes; }, get info() { return info; },
  get disposeTexture() { return disposeTexture; }, get disposeMaterial() { return disposeMaterial; },
  get textures() { return textures; }, get materials() { return materials; },
  restoreContext() { recreate(); renderer.domElement.dispatchEvent(new Event('webglcontextrestored')); },
 };
}
function art() {
 const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
 const texture = new THREE.Texture(), material = new THREE.MeshBasicMaterial({ map: texture });
 const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
 return { geometry, texture, material, scene };
}
const listenerCount = resource => resource._listeners?.dispose?.length ?? 0;

test('installed Three retains a stopped renderer geometry owner unless its callbacks are explicitly released', () => {
 const shared = art(), renderers = Array.from({ length: 3 }, fixture);
 for (const f of renderers) { f.renderer.render(shared.scene); f.renderer.dispose(); }
 assert.equal(listenerCount(shared.geometry), 3);
 assert.ok(renderers.every(f => f.counts.buffersCreated === 1 && f.counts.buffersDeleted === 0));
 shared.geometry.dispose(); shared.texture.dispose(); shared.material.dispose();
 assert.equal(listenerCount(shared.geometry), 0);
 assert.ok(renderers.every(f => f.counts.buffersDeleted === 1));
});

test('repeated leased renderer lifetimes release their buffers and textures while retaining reusable source art', () => {
 const shared = art(), source = shared.geometry.attributes.position.array, events = [];
 for (const resource of [shared.geometry, shared.material, shared.texture]) resource.addEventListener('dispose', () => events.push(resource));
 for (let entry = 0; entry < 4; entry++) {
  const f = fixture(), original = { render: f.renderer.render, compile: f.renderer.compile, initTexture: f.renderer.initTexture };
  const lease = new RendererResourceLease(f.renderer), dispatcher = THREE.EventDispatcher.prototype.addEventListener;
  f.renderer.render(shared.scene); const compiled = f.renderer.compile(shared.scene); f.renderer.initTexture(shared.texture);
  assert.equal(compiled.has(shared.material), true, 'compile return values are preserved');
  assert.equal(THREE.EventDispatcher.prototype.addEventListener, dispatcher, 'no global patch remains between driver calls');
  for (let frame = 0; frame < 100; frame++) f.renderer.render(shared.scene);
  assert.equal(lease.resources.registrations.size, 3, 'held frames never accumulate registrations or scan extra resources');
  lease.dispose(); lease.dispose(); f.renderer.dispose();
  assert.equal(f.counts.buffersCreated, f.counts.buffersDeleted);
  assert.equal(f.counts.texturesCreated, f.counts.texturesDeleted);
  assert.equal(lease.resources.registrations.size, 0);
  for (const name of Object.keys(original)) assert.equal(f.renderer[name], original[name]);
  for (const resource of [shared.geometry, shared.material, shared.texture]) assert.equal(listenerCount(resource), 1, 'only the owner custom callback remains');
  assert.equal(shared.geometry.attributes.position.array, source);
 }
 assert.deepEqual(events, [], 'shared CPU resources never dispatch global disposal');
});

test('retiring one renderer preserves every callback, buffer and texture belonging to another live renderer', () => {
 const shared = art(), a = fixture(), b = fixture(), lease = new RendererResourceLease(a.renderer);
 b.renderer.render(shared.scene); a.renderer.render(shared.scene);
 const activeBuffer = b.attributes.get(shared.geometry.attributes.position).buffer;
 const activeTextureCount = b.counts.texturesCreated;
 lease.dispose(); a.renderer.dispose();
 assert.equal(listenerCount(shared.geometry), 1);
 assert.equal(shared.texture.hasEventListener('dispose', b.disposeTexture), true);
 assert.equal(shared.material.hasEventListener('dispose', b.disposeMaterial), true);
 assert.equal(b.counts.buffersDeleted, 0); assert.equal(b.counts.texturesDeleted, 0);
 b.renderer.render(shared.scene);
 assert.equal(b.attributes.get(shared.geometry.attributes.position).buffer, activeBuffer);
 assert.equal(b.counts.texturesCreated, activeTextureCount, 'another renderer does not re-upload shared maps');
 shared.geometry.dispose(); shared.texture.dispose(); shared.material.dispose(); b.renderer.dispose();
});

test('normally disposed visitors leave no lease records and a driver failure always restores the event dispatcher', () => {
 const f = fixture(), lease = new RendererResourceLease(f.renderer), dispatcher = THREE.EventDispatcher.prototype.addEventListener;
 for (let visitor = 0; visitor < 40; visitor++) {
  const body = art(); f.renderer.render(body.scene);
  body.geometry.dispose(); body.material.dispose(); body.texture.dispose();
  assert.equal(lease.resources.registrations.size, 0, 'departed visitors are not retained until world teardown');
  assert.equal(lease.resources.cleanup.size, 0);
 }
 const interrupted = art(); f.renderer.failDraw = true;
 assert.throws(() => f.renderer.render(interrupted.scene), /interrupted admission/);
 assert.equal(THREE.EventDispatcher.prototype.addEventListener, dispatcher);
 lease.dispose(); f.renderer.dispose();
 assert.equal(f.counts.buffersCreated, f.counts.buffersDeleted);
 assert.equal(f.counts.texturesCreated, f.counts.texturesDeleted);
 assert.equal(listenerCount(interrupted.geometry), 0);
});

test('context restoration discovers swapped callback identities and still preserves another active renderer', () => {
 const shared = art(), a = fixture(), b = fixture(), lease = new RendererResourceLease(a.renderer);
 b.renderer.render(shared.scene); a.renderer.render(shared.scene);
 const otherBuffer = b.attributes.get(shared.geometry.attributes.position).buffer;
 const oldTextureCallback = a.disposeTexture;
 for (let recovery = 0; recovery < 3; recovery++) {
  const creates = a.counts.buffersCreated;
  a.restoreContext();
  assert.equal(a.counts.buffersCreated, creates, 'restoration itself does no scene scan or driver work');
  a.renderer.compile(shared.scene); a.renderer.initTexture(shared.texture); a.renderer.render(shared.scene);
  assert.notEqual(a.disposeTexture, oldTextureCallback, 'fixture mirrors Three initGLContext callback replacement');
  assert.equal(shared.texture.hasEventListener('dispose', a.disposeTexture), true);
 }
 lease.dispose(); a.renderer.dispose();
 assert.equal(a.counts.buffersCreated, a.counts.buffersDeleted, 'every captured geometry generation retires');
 assert.equal(a.counts.texturesCreated, a.counts.texturesDeleted);
 assert.equal(listenerCount(shared.geometry), 1);
 assert.equal(shared.texture.hasEventListener('dispose', b.disposeTexture), true);
 b.renderer.render(shared.scene);
 assert.equal(b.attributes.get(shared.geometry.attributes.position).buffer, otherBuffer);
 assert.equal(b.counts.buffersDeleted, 0); assert.equal(b.counts.texturesDeleted, 0);
 a.restoreContext(); assert.equal(lease.refreshPending, false, 'the restore listener is removed at stop');
 shared.geometry.dispose(); shared.material.dispose(); shared.texture.dispose(); b.renderer.dispose();
});

test('a failed restored-context probe keeps callback discovery pending for a successful driver retry', () => {
 const shared = art(), f = fixture(), lease = new RendererResourceLease(f.renderer);
 f.renderer.render(shared.scene); f.restoreContext(); f.renderer.failDraw = true;
 const render = f.renderer.render, dispatcher = THREE.EventDispatcher.prototype.addEventListener;
 assert.throws(() => f.renderer.render(shared.scene), /interrupted admission/);
 assert.equal(f.renderer.render, render, 'failed probe puts the wrapped driver back');
 assert.equal(THREE.EventDispatcher.prototype.addEventListener, dispatcher);
 assert.equal(lease.refreshPending, true);
 f.renderer.failDraw = false; f.renderer.render(shared.scene);
 assert.equal(lease.refreshPending, false);
 lease.dispose(); f.renderer.dispose();
 assert.equal(f.counts.buffersCreated, f.counts.buffersDeleted);
 assert.equal(f.counts.texturesCreated, f.counts.texturesDeleted);
 assert.equal(listenerCount(shared.geometry), 0); assert.equal(listenerCount(shared.texture), 0);
});

test('actual World.stop releases an interrupted world lease before disposing its renderer exactly once', () => {
 const savedWindow = globalThis.window, savedDocument = globalThis.document, noop = () => {};
 globalThis.window = { removeEventListener: noop, clearInterval: noop }; globalThis.document = { removeEventListener: noop };
 try {
  const shared = art(), f = fixture(), lease = new RendererResourceLease(f.renderer);
  f.renderer.render(shared.scene);
  const dispose = f.renderer.dispose;
  f.renderer.dispose = () => { assert.equal(f.counts.buffersCreated, f.counts.buffersDeleted, 'buffers release before renderer properties go away'); dispose.call(f.renderer); };
  const world = Object.create(FestivalWorld.prototype);
  Object.assign(world, { renderer: f.renderer, rendererResourceLease: lease, preview: false, disposed: false,
   scene: shared.scene, neonFrames: [], npcs: [], projectors: new Map(),
   closeNpcDialogue: noop, stopArcadeGame: noop, stopPhoneOrientation: noop, releaseHeadCoupledView: noop, applyDrunkScreen: noop,
   venueSceneryAssets: { dispose: noop }, environmentMaterials: { dispose: noop },
   audio: { setAmbientMix: noop, setSkating: noop, stopFireworks: noop },
   gamepad: { stop: noop }, headTracking: { release: noop }, canvas: { removeEventListener: noop },
  });
  world.stop(); world.stop();
  assert.equal(world.rendererResourceLease, undefined); assert.equal(f.counts.rendererDisposed, 1);
  assert.equal(listenerCount(shared.geometry), 0); assert.equal(listenerCount(shared.texture), 0);
  assert.equal(f.counts.texturesCreated, f.counts.texturesDeleted);
 } finally { globalThis.window = savedWindow; globalThis.document = savedDocument; }
});
