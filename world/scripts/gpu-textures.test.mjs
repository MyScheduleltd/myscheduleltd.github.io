import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { build } from 'esbuild';
import { loadConfigFromFile } from 'vite';

const compiled = await build({
  stdin: { contents: "export * from './src/world/GpuTextureRuntime'; export * from './src/world/EnvironmentMaterials'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { THREE, GpuTextureRuntime, gpuTexturesEnabled, gpuTextureAllocation, EnvironmentMaterials, environmentAssetsFromUrls, tagEnvironmentSurface } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

function texture(format = THREE.RGBA_ASTC_4x4_Format) {
  return new THREE.CompressedTexture([
    { data: new Uint8Array(64), width: 8, height: 8 },
    { data: new Uint8Array(16), width: 4, height: 4 },
    { data: new Uint8Array(16), width: 2, height: 2 },
    { data: new Uint8Array(16), width: 1, height: 1 },
  ], 8, 8, format);
}

function fakeLoader() {
  const calls = { limits: [], support: 0, paths: [], parses: [], disposals: 0, creator: undefined };
  const loader = {
    workerConfig: undefined,
    transcoderBinary: new ArrayBuffer(8),
    workerPool: { setWorkerCreator: creator => { calls.creator = creator; } },
    setWorkerLimit(limit) { calls.limits.push(limit); return this; },
    detectSupport(renderer) { calls.support++; this.workerConfig = renderer.support ?? { astcSupported: true }; return this; },
    setTranscoderPath(path) { calls.paths.push(path); return this; },
    init: async () => undefined,
    parse(bytes, resolve, reject) { calls.parses.push({ bytes, resolve, reject }); },
    dispose() { calls.disposals++; },
  };
  return { calls, loader };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

function fakeWorker() {
  const handlers = new Map(), messages = [];
  return {
    messages, addEventListener: (name, listener) => handlers.set(name, listener),
    postMessage: (message, transfer) => messages.push({ message, transfer }),
    terminate() {}, emit: (name, event = {}) => handlers.get(name)?.(event),
  };
}

test('released festival defaults to compression and supports explicit raster recovery', () => {
  for (const hostname of ['localhost.attacker.example', '127.0.0.2', 'example.com']) {
    assert.equal(gpuTexturesEnabled({ hostname, search: '?gpuTextures=compressed' }), false);
  }
  for (const hostname of ['myscheduleltd.com', 'www.myscheduleltd.com', 'localhost', '127.0.0.1']) {
    assert.equal(gpuTexturesEnabled({ hostname, search: '' }), true);
    assert.equal(gpuTexturesEnabled({ hostname, search: '?gpuTextures=raster' }), false);
    assert.equal(gpuTexturesEnabled({ hostname, search: '?gpuTextures=compressed' }), true);
  }
});

test('only installed eligible compressed maps replace their matching raster roles', () => {
  const files = {
    '../environment/compressed/stone.ktx2': '/stone-C.ktx2',
    '../environment/compressed/stone-normal.ktx2': '/stone-N.ktx2',
    '../environment/stone.webp': '/stone.webp',
    '../environment/stone-normal.webp': '/stone-normal.webp',
    '../environment/stone-roughness.webp': '/stone-roughness.webp',
    '../environment/brick.webp': '/brick.webp',
    '../environment/compressed/temple-trim.ktx2': '/forbidden-atlas.ktx2',
    '../environment/wood.ktx2': '/outside-compressed-folder.ktx2',
  };
  const raster = { stone: { color: '/stone.webp', normal: '/stone-normal.webp', roughness: '/stone-roughness.webp' }, brick: { color: '/brick.webp' } };
  assert.deepEqual(environmentAssetsFromUrls(files), raster);
  assert.deepEqual(environmentAssetsFromUrls(files, true), {
    ...raster, stone: { color: '/stone-C.ktx2', normal: '/stone-N.ktx2', roughness: '/stone-roughness.webp' },
  });
});

test('one worker drains all overlapping leases before disposal and retains upload data', async () => {
  const fake = fakeLoader(), runtime = new GpuTextureRuntime({}, () => fake.loader, '/assets/basis/');
  const a = runtime.acquire(), b = runtime.acquire({});
  const first = a.decode(new ArrayBuffer(8)), second = b.decode(new ArrayBuffer(9));
  await settle();
  assert.deepEqual(fake.calls.limits, [1]); assert.deepEqual(fake.calls.paths, ['/assets/basis/']);
  assert.equal(fake.calls.parses.length, 2); assert.equal(runtime.snapshot().pending, 2);
  a.release(); a.release(); b.release();
  assert.equal(fake.calls.disposals, 0);
  await assert.rejects(a.decode(new ArrayBuffer(1)), /lease released/);
  const compressed = texture(), rgba = texture(THREE.RGBAFormat);
  fake.calls.parses[0].resolve(compressed); await first;
  assert.equal(fake.calls.disposals, 0);
  fake.calls.parses[1].resolve(rgba); await second;
  assert.equal(fake.calls.disposals, 1);
  assert.equal(compressed.generateMipmaps, false); assert.equal(compressed.mipmaps[0].data.byteLength, 64);
  const report = runtime.snapshot();
  assert.equal(report.disposed, true); assert.equal(report.pending, 0); assert.equal(report.activeLeases, 0);
  assert.equal(report.transcodes, 2); assert.equal(report.compressedTextures, 1); assert.equal(report.rgbaFallbacks, 1);
  assert.equal(report.compressedMipBytes, 112); assert.equal(report.retainedMipBytes, 224);
  assert.deepEqual(report.textures.map(item => item.format), ['ASTC_4x4', 'RGBA']);
  report.textures[0].mipBytes = -1;
  assert.equal(runtime.snapshot().textures[0].mipBytes, 112, 'report callers cannot mutate recorded allocation');
  assert.throws(() => runtime.acquire(), /disposed/);
});

test('failed parses settle deferred teardown; incompatible renderer capabilities do not change a running pool', async () => {
  const fake = fakeLoader(), runtime = new GpuTextureRuntime({}, () => fake.loader, '/assets/basis/');
  const lease = runtime.acquire();
  assert.throws(() => runtime.acquire({ support: { astcSupported: false } }), /different GPU texture formats/);
  assert.deepEqual(fake.loader.workerConfig, { astcSupported: true });
  const failed = lease.decode(new ArrayBuffer(8)); await settle(); lease.release();
  fake.calls.parses[0].reject(new Error('invalid KTX2'));
  await assert.rejects(failed, /invalid KTX2/);
  assert.equal(fake.calls.disposals, 1); assert.equal(runtime.snapshot().pending, 0);
});

test('the static worker receives copied WASM; a worker error rejects every queued decode and disposes late results', async () => {
  const fake = fakeLoader(), worker = fakeWorker(), urls = [];
  const runtime = new GpuTextureRuntime({}, () => fake.loader, '/assets/basis/', {
    workerFactory: url => { urls.push(url); return worker; },
  });
  const a = runtime.acquire(), b = runtime.acquire();
  const first = a.decode(new ArrayBuffer(1)), second = b.decode(new ArrayBuffer(2));
  const outcomes = Promise.allSettled([first, second]); await settle();
  fake.calls.creator();
  assert.deepEqual(urls, ['/assets/basis/basis_worker.js']);
  assert.equal(worker.messages[0].message.type, 'init');
  assert.notEqual(worker.messages[0].message.transcoderBinary, fake.loader.transcoderBinary);
  assert.equal(worker.messages[0].transfer[0], worker.messages[0].message.transcoderBinary);
  let prevented = false;
  worker.emit('error', { message: 'blocked worker', preventDefault: () => { prevented = true; } });
  const results = await outcomes;
  assert.ok(results.every(result => result.status === 'rejected' && /blocked worker/.test(result.reason.message)));
  assert.equal(prevented, true); assert.equal(fake.calls.disposals, 1);
  assert.equal(runtime.snapshot().disposed, true); assert.equal(runtime.snapshot().pending, 0);
  const late = texture(); let lateDisposals = 0; late.addEventListener('dispose', () => lateDisposals++);
  fake.calls.parses[0].resolve(late); assert.equal(lateDisposals, 1);
  assert.equal(runtime.snapshot().transcodes, 0);
  a.release(); b.release(); assert.equal(fake.calls.disposals, 1);
});

test('unreadable worker messages reject pending work rather than freezing admission', async () => {
  const fake = fakeLoader(), worker = fakeWorker();
  const runtime = new GpuTextureRuntime({}, () => fake.loader, '/assets/basis/', { workerFactory: () => worker });
  const lease = runtime.acquire(), pending = lease.decode(new ArrayBuffer(1));
  const rejected = assert.rejects(pending, /unreadable message/); await settle();
  fake.calls.creator(); worker.emit('messageerror'); await rejected;
  assert.equal(fake.calls.disposals, 1); lease.release();
});

test('decode deadlines cover stalled initialization and still clean up its late completion', async () => {
  const fake = fakeLoader(); let finish;
  fake.loader.init = () => new Promise(resolve => { finish = resolve; });
  const runtime = new GpuTextureRuntime({}, () => fake.loader, '/assets/basis/', { decodeTimeoutMs: 10 });
  const lease = runtime.acquire();
  await assert.rejects(lease.decode(new ArrayBuffer(1)), /decode exceeded/);
  assert.equal(runtime.snapshot().disposed, true); assert.equal(runtime.snapshot().pending, 0);
  assert.equal(fake.calls.disposals, 0, 'initialization may still create a blob URL; defer final cleanup');
  finish(); await settle();
  assert.equal(fake.calls.disposals, 1); assert.equal(fake.calls.parses.length, 0);
  lease.release();
});

test('a stalled decoder has a bounded deadline even when its worker emits no error', async () => {
  const fake = fakeLoader();
  const runtime = new GpuTextureRuntime({}, () => fake.loader, '/assets/basis/', { decodeTimeoutMs: 10 });
  const lease = runtime.acquire();
  await assert.rejects(lease.decode(new ArrayBuffer(1)), /decode exceeded/);
  assert.equal(fake.calls.disposals, 1); assert.equal(runtime.snapshot().pending, 0); lease.release();
});

test('RGBA fallback is measured as uncompressed even when wrapped in a CompressedTexture', () => {
  const rgba = texture(THREE.RGBAFormat);
  assert.equal(rgba.isCompressedTexture, true);
  assert.deepEqual(gpuTextureAllocation(rgba), { width: 8, height: 8, format: 'RGBA', compressed: false, mipLevels: 4, mipBytes: 112 });
});

function localNetwork(t) {
  const previous = { fetch: globalThis.fetch, window: globalThis.window, createImageBitmap: globalThis.createImageBitmap };
  const requested = [];
  globalThis.window = { location: new URL('http://localhost:4186/'), setTimeout, clearTimeout };
  globalThis.fetch = async url => { requested.push(String(url)); return new Response(new Uint8Array([1, 2, 3])); };
  globalThis.createImageBitmap = () => assert.fail('compressed maps must not decode a full RGBA bitmap');
  t.after(() => Object.assign(globalThis, previous));
  return requested;
}

test('real environment preparation keeps colour spaces, UVs, PBR and baked mips without image decoding', async t => {
  const requested = localNetwork(t), maps = [], scene = new THREE.Scene();
  const source = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: .7, emissive: 0x111111 });
  const mesh = tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), source), 'stone');
  scene.add(mesh);
  const urls = { color: 'http://localhost:4186/stone.ktx2', normal: 'http://localhost:4186/stone-normal.ktx2', roughness: 'http://localhost:4186/stone-roughness.ktx2' };
  const library = new EnvironmentMaterials({ mobile: true, assets: { stone: urls } });
  library.useGpuTextures({ decode: async bytes => { assert.equal(bytes.byteLength, 3); const map = texture(); maps.push(map); return map; } });
  const report = await library.prepare(scene);
  assert.deepEqual(requested, Object.values(urls)); assert.equal(report.decodedBytes, 0); assert.equal(report.encodedBytes, 9);
  assert.equal(report.families.stone.state, 'ready'); assert.equal(report.textures, 3);
  assert.equal(mesh.material.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(mesh.material.normalMap.colorSpace, THREE.NoColorSpace); assert.equal(mesh.material.roughnessMap.colorSpace, THREE.NoColorSpace);
  for (const map of maps) {
    assert.equal(map.flipY, false); assert.equal(map.wrapS, THREE.RepeatWrapping); assert.equal(map.wrapT, THREE.RepeatWrapping);
    assert.equal(map.generateMipmaps, false); assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(map.magFilter, THREE.LinearFilter); assert.equal(map.mipmaps.length, 4);
  }
  assert.equal(mesh.material.normalScale.y, -mesh.material.normalScale.x);
  assert.equal(mesh.material.emissive.getHex(), source.emissive.getHex());
  let disposed = 0; for (const map of maps) map.addEventListener('dispose', () => disposed++);
  library.dispose(); library.dispose(); assert.equal(disposed, 3);
  assert.equal(maps[0].mipmaps[0].data.byteLength, 64, 'disposal must not erase CPU data before a final context restore');
});

test('a rejected compressed decode falls back to original maps with their colour spaces', async t => {
  const requested = localNetwork(t), scene = new THREE.Scene();
  globalThis.createImageBitmap = async () => ({ width: 8, height: 8, close() {} });
  const mesh = tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), 'stone');
  scene.add(mesh);
  const roles = ['color', 'normal', 'roughness'];
  const assets = Object.fromEntries(roles.map(role => [role, `http://localhost:4186/stone-${role}.ktx2`]));
  const fallbackAssets = Object.fromEntries(roles.map(role => [role, `http://localhost:4186/stone-${role}.webp`]));
  const library = new EnvironmentMaterials({ mobile: true, assets: { stone: assets }, fallbackAssets: { stone: fallbackAssets } });
  library.useGpuTextures({ decode: async () => { throw Error('blocked decoder'); } });
  const report = await library.prepare(scene);
  assert.equal(report.textures, 3);
  assert.equal(report.families.stone.state, 'partial');
  assert.deepEqual(report.families.stone.maps, roles);
  assert.equal(report.families.stone.errors.length, 3);
  for (const role of roles) assert.ok(requested.includes(fallbackAssets[role]));
  assert.equal(mesh.material.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(mesh.material.normalMap.colorSpace, THREE.NoColorSpace);
  assert.equal(mesh.material.roughnessMap.colorSpace, THREE.NoColorSpace);
  assert.equal(mesh.material.map.generateMipmaps, true);
  assert.equal(report.decodedBytes, 3 * 8 * 8 * 4);
  library.dispose();
});

test('closing during a transcode disposes the late texture and never applies it to the world', async t => {
  localNetwork(t); const scene = new THREE.Scene(), source = new THREE.MeshStandardMaterial();
  const mesh = tagEnvironmentSurface(new THREE.Mesh(new THREE.BoxGeometry(), source), 'stone'); scene.add(mesh);
  const library = new EnvironmentMaterials({ assets: { stone: { color: 'http://localhost:4186/stone.ktx2' } } });
  let finish, entered;
  const started = new Promise(resolve => { entered = resolve; });
  library.useGpuTextures({ decode: () => new Promise(resolve => { finish = resolve; entered(); }) });
  const pending = library.prepare(scene); await started; library.dispose();
  const late = texture(); let disposals = 0; late.addEventListener('dispose', () => disposals++); finish(late);
  await pending;
  assert.equal(mesh.material, source); assert.equal(disposals, 1);
});

test('the actual Vite plugins emit pinned local transcoder bytes and hash only the intended executable assets', async () => {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'test' }, 'vite.config.ts');
  assert.ok(loaded);
  const transcoder = loaded.config.plugins.find(plugin => plugin.name === 'festival-basis-transcoder');
  const integrity = loaded.config.plugins.find(plugin => plugin.name === 'festival-asset-integrity');
  const emitted = [];
  transcoder.configResolved({ command: 'serve' });
  transcoder.buildStart.call({ emitFile: () => assert.fail('development must serve rather than emit build assets') });
  transcoder.configResolved({ command: 'build' });
  transcoder.buildStart.call({ emitFile: file => { emitted.push(file); return file.fileName; } });
  assert.deepEqual(emitted.map(file => file.fileName), ['assets/basis/basis_transcoder.js', 'assets/basis/basis_transcoder.wasm', 'assets/basis/basis_worker.js']);
  assert.ok(emitted.every(file => file.source.byteLength > 1000));
  const bundle = Object.fromEntries(emitted.map(file => [file.fileName, { type: 'asset', source: file.source }]));
  bundle['assets/stone-pilot.ktx2'] = { type: 'asset', source: Buffer.from('ktx2-test') };
  bundle['assets/unrelated.js'] = { type: 'asset', source: 'do not mirror code' };
  let manifest;
  integrity.generateBundle.call({ emitFile: file => { manifest = JSON.parse(file.source); } }, {}, bundle);
  assert.deepEqual(Object.keys(manifest).sort(), ['basis_transcoder.js', 'basis_transcoder.wasm', 'basis_worker.js', 'stone-pilot.ktx2']);
  for (const file of emitted) assert.equal(manifest[file.fileName.split('/').pop()], `sha256-${createHash('sha256').update(file.source).digest('base64')}`);
  const handlers = [];
  transcoder.configureServer({ middlewares: { use: handler => handlers.push(handler) } });
  let contentType, body;
  handlers[0]({ url: '/assets/basis/basis_transcoder.wasm' }, { setHeader: (_name, value) => { contentType = value; }, end: value => { body = value; } }, () => assert.fail('known transcoder route fell through'));
  assert.equal(contentType, 'application/wasm'); assert.equal(body.byteLength, emitted[1].source.byteLength);
  const headers = {};
  handlers[0]({ url: '/assets/basis/basis_worker.js' }, { setHeader: (name, value) => { headers[name] = value; }, end: value => { body = value; } }, () => assert.fail('static worker route fell through'));
  assert.equal(Buffer.compare(body, emitted[2].source), 0);
  assert.match(headers['Content-Security-Policy'], /worker-src 'self'/);
  assert.match(headers['Content-Security-Policy'], /script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'/);
  assert.equal(headers['Content-Type'], 'application/javascript');
  const preview = [];
  transcoder.configurePreviewServer({ middlewares: { use: handler => preview.push(handler) } });
  let next = false;
  preview[0]({ url: '/assets/basis/basis_worker.js' }, { setHeader: (name, value) => { headers[name] = value; } }, () => { next = true; });
  assert.equal(next, true, 'preview adds the worker policy and serves the actual built bytes');
  assert.match(headers['Content-Security-Policy'], /worker-src 'self'/);
  let unrelated = false;
  handlers[0]({ url: '/assets/not-basis.js' }, {}, () => { unrelated = true; }); assert.equal(unrelated, true);
});

test('pinned Basis bindings fail under inherited no-eval policy but the independent static worker transcodes successfully', async () => {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'test' }, 'vite.config.ts');
  const transcoder = loaded.config.plugins.find(plugin => plugin.name === 'festival-basis-transcoder');
  const emitted = []; transcoder.configResolved({ command: 'build' });
  transcoder.buildStart.call({ emitFile: file => emitted.push(file) });
  const source = emitted.find(file => file.fileName.endsWith('basis_worker.js')).source.toString('utf8');
  const wasmBinary = new Uint8Array(emitted.find(file => file.fileName.endsWith('.wasm')).source);
  const silent = { log() {}, warn() {}, error() {} };
  const globals = { console: silent, WebAssembly, TextDecoder, TextEncoder, setTimeout, clearTimeout, wasmBinary, importScripts() {} };
  const blocked = createContext({ ...globals, self: { location: { href: 'blob:http://localhost/test' }, addEventListener() {} } }, { codeGeneration: { strings: false, wasm: true } });
  runInContext(source, blocked);
  await assert.rejects(runInContext('BASIS({wasmBinary})', blocked), /Code generation from strings disallowed/);
  let receive, post, deadline;
  const posted = new Promise((resolve, reject) => { post = resolve; deadline = setTimeout(() => reject(new Error('static Basis CPU transcode stalled')), 5000); });
  const independent = createContext({ ...globals, self: {
    location: { href: 'http://localhost/assets/basis/basis_worker.js' },
    addEventListener: (_name, listener) => { receive = listener; }, postMessage: post,
  } }, { codeGeneration: { strings: true, wasm: true } });
  runInContext(source, independent);
  const config = { astcSupported: true, astcHDRSupported: false, etc1Supported: false, etc2Supported: false, dxtSupported: false, bptcSupported: false, pvrtcSupported: false };
  receive({ data: { type: 'init', config, transcoderBinary: wasmBinary.buffer } });
  const bytes = await readFile('src/assets/environment/compressed/stone.ktx2');
  receive({ data: { type: 'transcode', id: 1, buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } });
  const result = await posted; clearTimeout(deadline);
  assert.equal(result.type, 'transcode'); assert.equal(result.data.format, THREE.RGBA_ASTC_4x4_Format);
  assert.ok(result.data.faces[0].mipmaps.length > 1); assert.ok(result.data.faces[0].mipmaps[0].data.byteLength > 0);
});
