/**
 * Production-format, disposable-service QA. Run only when the two local
 * services have been prepared by the owner of the release work:
 *
 *   PLAYWRIGHT_PACKAGE_JSON=/path/to/playwright/package.json CHROMIUM_EXECUTABLE=/path/to/chrome node scripts/verify-loading-weather.mjs
 *
 * Optional checks: --hold-audio holds the new wind file until the world is
 * waiting behind its sound-loading screen; --muted verifies silent entry and
 * later unmute; --stress adds 24 rapid changes, a 30-second mixed-fade snow
 * run and a completed-melt clock jump. --profile=chrome-desktop or
 * --profile=webkit-iphone16pro selects one browser, still in both quality modes.
 *
 * No production requests, accounts or weather writes are permitted. Browser
 * emulation reports timing evidence; it is not a physical iPhone benchmark.
 * `--self-test` verifies the audit instrumentation/safety guards without
 * opening a browser or contacting either service.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const UI_PORT = '4196';
const API_PORT = '8796';
const API = `http://127.0.0.1:${API_PORT}`;
const DEFAULT_OUT = 'art/weather-actions-20261024/release-qa/loading-weather';
const SAMPLE_MS = 6_000;
const CAMERA_MODES = ['follow', 'isometric', 'first-person'];
const VIEWS = [
  ['gate', 'gate'], ['square', 'square'], ['palace', 'palace'],
  ['drive-in', 'drive'], ['shore', 'shore'], ['club', 'clubfloor'],
  ['rooftop', 'roof'], ['temple', 'temple'],
];
const OUTFITS = ['#18191b', '#191a1c', '#1a1b1d', '#1b1c1e', '#28191b', '#291a1c', '#2a1b1d', '#2b1c1e'];
const FIXED_FILE = /(?:\/(?:assets|src\/assets)\/|\.(?:js|mjs|css|glb|gltf|bin|ktx2?|png|jpe?g|webp|avif|gif|svg|woff2?|ttf|otf|mp3|wav|ogg|m4a)(?:$))/i;

export function networkAllowed(value) {
  const url = new URL(value);
  if (['data:', 'blob:'].includes(url.protocol)) return true;
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
    && [UI_PORT, API_PORT].includes(url.port) && !url.username && !url.password;
}

function validateBase(value) {
  const url = new URL(value);
  assert.ok(networkAllowed(value) && url.port === UI_PORT && url.pathname === '/'
    && !url.search && !url.hash, `UI must be HTTP loopback :${UI_PORT}, with no path, query or credentials.`);
  return url.origin;
}

function requestLabel(value) {
  const url = new URL(value);
  return url.protocol === 'blob:' || url.protocol === 'data:' ? `${url.protocol}[local data]` : url.origin + url.pathname;
}

/** Runs in the page before any application script. No THREE wrappers or
 * reported program counts are used as a substitute for the real GL calls. */
export function installGLAudit() {
  const ids = new WeakMap(), wrappers = new WeakSet();
  const audit = {
    compileShader: 0, linkProgram: 0, contexts: [], contextLost: [], contextRestored: [],
    afterAdmission: [], baselineAt: null, rejections: [],
  };
  window.__loadingWeatherGLAudit = audit;
  const context = (gl, canvas, kind) => {
    let entry = ids.get(gl);
    if (entry) return entry;
    entry = { id: audit.contexts.length + 1, kind: kind ?? 'webgl', at: performance.now(), compileShader: 0, linkProgram: 0,
      canvas: canvas ? `${canvas.id ?? ''} ${typeof canvas.className === 'string' ? canvas.className : ''}`.trim() : '' };
    ids.set(gl, entry); audit.contexts.push(entry);
    canvas?.addEventListener('webglcontextlost', () => audit.contextLost.push({ id: entry.id, at: performance.now() }));
    canvas?.addEventListener('webglcontextrestored', () => audit.contextRestored.push({ id: entry.id, at: performance.now() }));
    return entry;
  };
  for (const Constructor of [globalThis.HTMLCanvasElement, globalThis.OffscreenCanvas]) {
    if (!Constructor?.prototype?.getContext) continue;
    const original = Constructor.prototype.getContext;
    Constructor.prototype.getContext = function (kind, ...options) {
      const gl = Reflect.apply(original, this, [kind, ...options]);
      if (gl && ['webgl', 'experimental-webgl', 'webgl2'].includes(kind)) context(gl, this, kind);
      return gl;
    };
  }
  for (const Constructor of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!Constructor?.prototype) continue;
    for (const name of ['compileShader', 'linkProgram']) {
      const original = Constructor.prototype[name];
      // Some engines inherit WebGL1's methods on WebGL2. Do not wrap such an
      // inherited wrapper a second time and invent twice as many driver calls.
      if (typeof original !== 'function' || wrappers.has(original)) continue;
      const wrapped = function (...args) {
        const entry = context(this, this.canvas);
        audit[name]++; entry[name]++;
        if (audit.baselineAt !== null) audit.afterAdmission.push({ kind: name, context: entry.id,
          at: performance.now(), stack: new Error().stack });
        return Reflect.apply(original, this, args);
      };
      wrappers.add(wrapped); Constructor.prototype[name] = wrapped;
    }
  }
  window.addEventListener('unhandledrejection', event => audit.rejections.push({
    at: performance.now(), url: location.href,
    reason: String(event.reason?.stack ?? event.reason?.message ?? event.reason),
  }));
}

/** Observe real native decode completion and context construction. This does
 * not substitute an application-ready flag for a finished audio decode. */
export function installAudioAudit() {
  const audit = { contexts: [], decodes: [], pending: 0, baselineAt: null, afterAdmission: [] };
  window.__loadingWeatherAudioAudit = audit;
  const wrappers = new WeakSet();
  for (const Constructor of [globalThis.BaseAudioContext, globalThis.AudioContext, globalThis.OfflineAudioContext]) {
    const original = Constructor?.prototype?.decodeAudioData;
    if (typeof original !== 'function' || wrappers.has(original)) continue;
    const wrapped = function (...args) {
      const record = { startedAt: performance.now(), bytes: args[0]?.byteLength, status: 'pending' };
      audit.decodes.push(record); audit.pending++;
      if (audit.baselineAt !== null) audit.afterAdmission.push({ kind: 'decode', at: record.startedAt });
      const done = (status, buffer) => {
        record.status = status; record.finishedAt = performance.now(); audit.pending--;
        if (buffer) { record.channels = buffer.numberOfChannels; record.samples = buffer.length; }
      };
      try {
        return Reflect.apply(original, this, args).then(buffer => { done('fulfilled', buffer); return buffer; },
          error => { done('rejected'); throw error; });
      } catch (error) { done('threw'); throw error; }
    };
    wrappers.add(wrapped); Constructor.prototype.decodeAudioData = wrapped;
  }
  for (const name of ['AudioContext', 'OfflineAudioContext']) {
    const Constructor = globalThis[name];
    if (typeof Constructor !== 'function') continue;
    globalThis[name] = new Proxy(Constructor, { construct(target, args, newTarget) {
      const context = Reflect.construct(target, args, newTarget);
      const record = { kind: name, at: performance.now() }; audit.contexts.push(record);
      if (audit.baselineAt !== null) audit.afterAdmission.push({ kind: name, at: record.at });
      return context;
    } });
  }
}

async function selfTest() {
  for (const url of [`http://127.0.0.1:${UI_PORT}/assets/world.js`, `http://localhost:${API_PORT}/api/admin/weather`, 'data:text/plain,test', 'blob:http://127.0.0.1:4196/fake']) assert.ok(networkAllowed(url), url);
  for (const url of ['https://myscheduleltd.com/', 'https://myschedule-festival.onrender.com/api/join', 'http://127.0.0.1:8787/api/admin/weather', 'http://127.0.0.1:4197/', 'https://127.0.0.1:4196/', 'http://localhost.evil.test:8796/', 'http://user:pass@127.0.0.1:8796/']) assert.equal(networkAllowed(url), false, url);
  assert.equal(validateBase('http://127.0.0.1:4196'), 'http://127.0.0.1:4196');
  for (const base of ['http://127.0.0.1:8796', 'http://127.0.0.1:4196/production', 'http://127.0.0.1:4196/?api=remote']) assert.throws(() => validateBase(base));
  let nativeCompiles = 0, nativeLinks = 0, tick = 1;
  class GL { compileShader() { nativeCompiles++; } linkProgram() { nativeLinks++; } }
  class GL2 extends GL {}
  class Canvas {
    listeners = {}; id = 'self-test'; className = 'canvas';
    constructor(gl) { this.gl = gl; gl.canvas = this; }
    getContext(kind) { return kind === '2d' ? null : this.gl; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
  }
  const window = { addEventListener() {} };
  runInNewContext(`(${installGLAudit.toString()})()`, {
    window, HTMLCanvasElement: Canvas, WebGLRenderingContext: GL, WebGL2RenderingContext: GL2,
    performance: { now: () => tick++ }, location: { href: 'http://127.0.0.1:4196/' },
  });
  const one = new Canvas(new GL()), two = new Canvas(new GL2());
  const gl1 = one.getContext('webgl'), gl2 = two.getContext('webgl2');
  assert.equal(one.getContext('webgl'), gl1); gl1.compileShader({}); gl1.linkProgram({});
  const audit = window.__loadingWeatherGLAudit; audit.baselineAt = tick;
  gl2.compileShader({}); gl2.linkProgram({}); two.listeners.webglcontextlost();
  assert.equal(audit.contexts.length, 2); assert.equal(audit.compileShader, nativeCompiles);
  assert.equal(audit.linkProgram, nativeLinks); assert.equal(audit.compileShader, 2);
  assert.equal(audit.afterAdmission.length, 2); assert.equal(audit.contextLost.length, 1);
  assert.ok(audit.afterAdmission.every(event => event.context === 2));
  class AudioBase { decodeAudioData() { return Promise.resolve({ numberOfChannels: 1, length: 48 }); } }
  class LiveAudio extends AudioBase {}
  class OfflineAudio extends AudioBase {}
  const audioWindow = {};
  const audioSandbox = { window: audioWindow, BaseAudioContext: AudioBase, AudioContext: LiveAudio,
    OfflineAudioContext: OfflineAudio, performance: { now: () => tick++ } };
  runInNewContext(`(${installAudioAudit.toString()})()`, audioSandbox);
  const offline = new audioSandbox.OfflineAudioContext();
  await offline.decodeAudioData(new ArrayBuffer(8));
  const sound = audioWindow.__loadingWeatherAudioAudit;
  assert.equal(sound.contexts.length, 1); assert.equal(sound.decodes.length, 1);
  assert.equal(sound.pending, 0); assert.equal(sound.decodes[0].status, 'fulfilled');
  sound.baselineAt = tick;
  const realtime = new audioSandbox.AudioContext(); await realtime.decodeAudioData(new ArrayBuffer(16));
  assert.equal(sound.contexts.length, 2); assert.equal(sound.decodes.length, 2);
  assert.deepEqual([...sound.afterAdmission.map(event => event.kind)], ['AudioContext', 'decode']);
  console.log('QA safety and actual GL/audio-call instrumentation self-test passed; no browsers or network were used.');
}

async function main() {
  const stress = process.argv.includes('--stress');
  const muted = process.argv.includes('--muted');
  const holdAudio = process.argv.includes('--hold-audio');
  const selectedProfile = process.argv.find(value => value.startsWith('--profile='))?.slice('--profile='.length);
  assert.ok(!selectedProfile || ['chrome-desktop', 'webkit-iphone16pro'].includes(selectedProfile), 'Unknown browser profile');
  const positional = process.argv.slice(2).filter(value => !value.startsWith('--'));
  const base = validateBase(positional[0] ?? `http://127.0.0.1:${UI_PORT}`);
  const out = resolve(positional[1] ?? DEFAULT_OUT);
  await mkdir(out, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(), base, api: API, physicalDevice: false,
    testDescription: 'Serial native GL/audio calls + loading barrier + weather resource/timing QA on a local production build and disposable API only.',
    timingLimitations: 'Mac headless browser / iPhone emulation; frame timing is measured, not a physical-device FPS guarantee.',
    weatherSampling: 'Six-second real play samples include the production fades. Clear stops precipitation and retains the real 15-minute snow melt tail; mixtures/coverage and submitted draws are reported.',
    samplesMs: SAMPLE_MS, stress, mutedEntry: muted, heldWindDownload: holdAudio, runs: [],
  };
  const writeReport = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const fetchLocal = async (url, options = {}) => {
    assert.ok(networkAllowed(url), 'Node requests also obey the local-only rule.');
    const response = await fetch(url, { ...options, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    assert.ok(response.ok, `Local HTTP ${response.status}: ${requestLabel(url)}`);
    return response;
  };
  const staff = async schedule => (await fetchLocal(API + '/api/admin/weather', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-festival-admin-key': 'weather-local-review' },
    body: JSON.stringify({ schedule }),
  })).json();
  let browser, context, page;
  try {
    const html = await (await fetchLocal(base + '/')).text();
    assert.ok(!html.includes('/@vite/client') && /\bassets\/[^"'\s]+\.js/.test(html), 'Use a built dist site, not the Vite development transform server.');
    report.productionEntry = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(match => match[1]);
    // Use the project's Playwright, or an explicitly selected external runtime.
    const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || import.meta.url);
    const { chromium, webkit, devices } = require('playwright');
    const phone = devices['iPhone 16 Pro'];
    assert.ok(phone, 'The bundled Playwright runtime must provide the requested iPhone 16 Pro emulation.');
    for (const profile of [
      { name: 'chrome-desktop', engine: chromium, options: { viewport: { width: 1440, height: 1000 } },
        launch: { headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) }, flakes: 960 },
      { name: 'webkit-iphone16pro', engine: webkit, options: phone, launch: { headless: true }, flakes: 420 },
    ]) for (const quality of ['normal', 'lite']) {
      if (selectedProfile && profile.name !== selectedProfile) continue;
      const run = { profile: profile.name, quality, startedAt: new Date().toISOString(), assertions: [], errors: [], shaderErrors: [],
        consoleErrors: [], lateAssets: [], blockedRequests: [], localRequestFailures: [], localHttpErrors: [], apiPaths: [], stages: [], timings: [] };
      report.runs.push(run);
      let admitted = false, auditing = true;
      let releaseWind = () => {};
      const started = performance.now();
      const check = (condition, label) => { assert.ok(condition, label); run.assertions.push(label); };
      const log = message => console.log(`[${profile.name}/${quality}] ${message}`);
      try {
        log('starting ordinary sign-in'); await staff([]);
        browser = await profile.engine.launch(profile.launch);
        context = await browser.newContext({ ...profile.options, serviceWorkers: 'block' });
        await context.addInitScript(installGLAudit);
        await context.addInitScript(installAudioAudit);
        let releaseSettings, markSettingsHeld;
        const settingsBarrier = new Promise(resolve => { releaseSettings = resolve; });
        const settingsHeld = new Promise(resolve => { markSettingsHeld = resolve; });
        const windBarrier = new Promise(resolve => { releaseWind = resolve; });
        await context.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          if (!networkAllowed(url.href)) {
            run.blockedRequests.push({ url: requestLabel(url.href), method: request.method(), resource: request.resourceType() });
            return route.abort('blockedbyclient');
          }
          if (url.origin === API && url.pathname === '/api/config') {
            const response = await route.fetch({ maxRedirects: 0 });
            markSettingsHeld();
            await settingsBarrier;
            return route.fulfill({ response });
          }
          if (holdAudio && /\/weather-snow-wind-[^/]+\.mp3$/.test(url.pathname)) {
            run.windRequestHeld = true;
            await windBarrier;
          }
          return route.continue();
        });
        // The current app uses HTTP SSE. Close any unexpected WebSocket
        // instead of leaving a second networking transport outside the guard.
        if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => {
          run.blockedRequests.push({ url: requestLabel(socket.url()), method: 'WEBSOCKET', resource: 'websocket' });
          socket.close();
        });
        page = await context.newPage(); page.setDefaultTimeout(15_000);
        page.on('crash', () => run.errors.push({ kind: 'page-crash', message: 'Browser content process crashed.' }));
        page.on('pageerror', error => { if (auditing) run.errors.push({ kind: 'pageerror', message: String(error.stack ?? error) }); });
        page.on('console', message => {
          if (!auditing) return;
          const text = message.text();
          if (/THREE\.WebGLProgram|VALIDATE_STATUS|shader error|Error compiling/i.test(text)) run.shaderErrors.push(text);
          if (message.type() === 'error') run.consoleErrors.push({ text, location: message.location() });
        });
        page.on('request', request => {
          const url = new URL(request.url());
          if (networkAllowed(url.href) && url.pathname.startsWith('/api/')) run.apiPaths.push({ origin: url.origin, path: url.pathname, method: request.method() });
          if (admitted && networkAllowed(url.href) && FIXED_FILE.test(url.pathname)) run.lateAssets.push({ url: requestLabel(url.href), resource: request.resourceType() });
        });
        page.on('requestfailed', request => {
          if (auditing && networkAllowed(request.url()) && !['blob:', 'data:'].includes(new URL(request.url()).protocol)) {
            run.localRequestFailures.push({ url: requestLabel(request.url()), error: request.failure()?.errorText, afterAdmission: admitted });
          }
        });
        page.on('response', response => {
          if (auditing && response.status() >= 400 && networkAllowed(response.url())) run.localHttpErrors.push({ url: requestLabel(response.url()), status: response.status() });
        });

        const snapshot = async label => page.evaluate(label => {
          const w = window.__islandWorld, gl = window.__loadingWeatherGLAudit, info = w.renderer.info;
          const geometries = new Set(), materials = new Set(), buffers = new Set();
          const precipitation = {};
          w.weather.root.traverse(object => {
            if (object.geometry) {
              geometries.add(object.geometry.uuid);
              for (const attribute of [...Object.values(object.geometry.attributes), object.geometry.index].filter(Boolean)) buffers.add(attribute.array.buffer);
              if (['ink-rain-streaks', 'paper-snow-flakes'].includes(object.name)) {
                const position = object.geometry.attributes.position;
                const count = Math.min(position.count, object.geometry.drawRange.count);
                let finite = true;
                for (let index = 0; index < count * position.itemSize; index++) finite &&= Number.isFinite(position.array[index]);
                precipitation[object.name] = { count, visible: object.visible, finite };
              }
            }
            for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material.uuid);
          });
          return { label, atMs: performance.now(), cameraMode: w.cameraMode, position: w.player.position.toArray(), state: w.playerState,
            remoteVisitorIds: [...w.remoteAvatars.keys()],
            gl: { compileShader: gl.compileShader, linkProgram: gl.linkProgram, contexts: gl.contexts.length, lost: gl.contextLost.length },
            renderer: { textures: info.memory.textures, geometries: info.memory.geometries, programs: info.programs.length, ...info.render },
            weatherResources: { geometries: [...geometries].sort(), materials: [...materials].sort(),
              bufferBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0), buffers: buffers.size }, precipitation,
            weather: w.weather.snapshot(), timings: w.frameTimings.snapshot(),
            perf: window.__festivalPerf(), audio: window.__festivalAudio(), fireworks: w.fireworksReviewSnapshot(),
            allSoundsReady: w.audio.worldSoundsReady(),
            nativeAudio: { contexts: window.__loadingWeatherAudioAudit.contexts.length,
              pending: window.__loadingWeatherAudioAudit.pending, decodes: window.__loadingWeatherAudioAudit.decodes.length },
          };
        }, label);
        const frames = async (count = 2) => page.evaluate(count => new Promise(resolve => {
          const next = () => { if (--count <= 0) resolve(); else requestAnimationFrame(next); };
          requestAnimationFrame(next);
        }), count);
        const stage = async label => { const state = await snapshot(label); run.stages.push(state); return state; };

        await page.goto(base + '/?era=ps2&island&review=perf&cycleMinute=12', { waitUntil: 'domcontentloaded' });
        const attendeeId = `Load${profile.name.startsWith('chrome') ? 'C' : 'W'}${quality[0]}-${Date.now() % 100000}`;
        await page.locator('#festival-id').fill(attendeeId);
        await page.evaluate(() => { window.__qaTypedGateInput = document.querySelector('#festival-id'); });
        await Promise.race([settingsHeld, new Promise((_, reject) => setTimeout(() => reject(Error('Missing local public settings request')), 15_000))]);
        const settingsResponse = page.waitForResponse(response => response.url() === API + '/api/config');
        releaseSettings(); await settingsResponse;
        await page.waitForFunction(() => document.querySelector('#festival-id') !== window.__qaTypedGateInput);
        check(await page.locator('#festival-id').inputValue() === attendeeId, 'a delayed public-settings redraw preserves the name already typed into sign-in');
        await page.evaluate(() => { delete window.__qaTypedGateInput; });
        await page.locator(`[data-graphics="${quality}"]`).click();
        await page.locator(`button[data-audio="${muted ? 'muted' : 'sound'}"]`).click();
        if (holdAudio) {
          await page.waitForFunction(() => /PREPARING THE SOUND|正在準備音效/.test(document.querySelector('[data-gate-entry-label]')?.textContent ?? ''),
            null, { timeout: 90_000 });
          await page.waitForTimeout(1000);
          check(run.windRequestHeld && await page.evaluate(() => window.__islandWorld.admitting === true
            && Boolean(document.querySelector('.gate--entering')) && !window.__islandWorld.audio.worldSoundsReady()
            && !window.__festivalAudio().bedsReady.includes('snowWind')),
          'a deliberately delayed wind SFX keeps the sign-in animation covering the world until its download/decode completes');
          releaseWind();
        }
        await page.waitForFunction(() => window.__islandWorld?.admitting === false && window.__festivalPerf?.().drawCalls > 0
          && !document.querySelector('.gate--handoff') && !document.querySelector('.gate--entering'), null, { timeout: 90_000 });
        await frames();
        await page.evaluate(() => {
          window.__loadingWeatherGLAudit.baselineAt = performance.now();
          window.__loadingWeatherAudioAudit.baselineAt = performance.now();
        });
        admitted = true;
        run.admissionMs = Math.round(performance.now() - started);
        run.baseline = await stage('gate-handoff-complete');
        check(run.baseline.perf.mode === quality, 'requested quality is active after ordinary sign-in');
        check(run.baseline.audio.avatarReady === 7, 'all seven fixed avatar cues loaded during sign-in');
        check(run.baseline.allSoundsReady && run.baseline.nativeAudio.pending === 0
          && run.baseline.nativeAudio.decodes === 20 && run.baseline.audio.cuesReady === 2
          && run.baseline.audio.fireworks.ready === 3 && run.baseline.audio.weather.snowStepsReady === 2,
        'all 20 fixed SFX finish actual native decoding before the sign-in animation releases input');
        check(run.baseline.audio.muted === muted, 'the requested initial audio mode is retained');
        if (muted) {
          await page.evaluate(() => window.__islandWorld.audio.setMuted(false));
          await frames(2);
          check(await page.evaluate(() => !window.__festivalAudio().muted && window.__islandWorld.audio.worldSoundsReady()),
            'unmuting after silent entry uses already-decoded fixed sounds');
        }
        check(['day', 'night', 'ocean', 'rain', 'snow', 'snowWind'].every(key => run.baseline.audio.bedsReady.includes(key)), 'all landscape, weather and new snow-wind beds decode during sign-in');
        check(run.apiPaths.some(request => request.origin.endsWith(':' + API_PORT) && request.path !== '/api/config'), 'the world actually joined the disposable local API');
        check(run.baseline.gl.linkProgram > 0 && run.baseline.gl.compileShader > 0, 'instrumentation observed actual driver compilation/linking before admission');
        check(run.blockedRequests.every(request => !/\/api\//.test(new URL(request.url).pathname)), 'no attempted production/nonlocal API calls');
        log(`gate handed over in ${(run.admissionMs / 1000).toFixed(1)}s; traversing 24 world/camera combinations`);

        for (const [name, view] of VIEWS) for (const cameraMode of CAMERA_MODES) {
          await page.evaluate(({ view, cameraMode }) => {
            const w = window.__islandWorld; w.setAerialReview(); w.forceStand();
            w.focusCoastalForReview(view); w.cameraMode = cameraMode;
          }, { view, cameraMode });
          await frames(2);
          const state = await stage(`${name}/${cameraMode}`);
          check(state.position.every(Number.isFinite) && state.cameraMode === cameraMode, `${name}: ${cameraMode} produces a finite live view`);
        }
        await page.evaluate(() => { const w = window.__islandWorld; w.focusCoastalForReview('square'); w.cameraMode = 'follow'; window.__qaSavedPalette = { ...w.palette }; });
        for (const top of OUTFITS) {
          await page.evaluate(top => {
            const w = window.__islandWorld;
            w.setAvatarPalette({ ...window.__qaSavedPalette, top, shirt: '#25232b', shoes: '#c5beae', swimwear: '#375d76' });
          }, top);
          await frames(2); await stage(`wardrobe/${top}`);
          await page.evaluate(() => {
            const w = window.__islandWorld;
            window.__qaChairReads = 0;
            window.__qaChairAllReads = 0;
            window.__qaChairSupport = w.player.userData.supportImportedSeat;
            w.player.userData.supportImportedSeat = function (...args) {
              window.__qaInChairSupport = true;
              try { return Reflect.apply(window.__qaChairSupport, this, args); }
              finally { window.__qaInChairSupport = false; }
            };
            window.__qaChairMethods = w.player.userData.importedAvatar.meshes.map(mesh => {
              const original = mesh.applyBoneTransform;
              mesh.applyBoneTransform = function (...args) {
                window.__qaChairAllReads++;
                if (window.__qaInChairSupport) window.__qaChairReads++;
                return Reflect.apply(original, this, args);
              };
              return { mesh, original };
            });
          });
          try {
            for (let chair = 1; chair <= 6; chair++) {
              await page.evaluate(id => { window.__qaChairReads = 0; window.__qaChairAllReads = 0; window.__islandWorld.focusRelaxationForReview(id, true); }, `BEACH-CHAIR-${chair}`);
              await frames(3);
              const pose = await page.evaluate(() => {
                const w = window.__islandWorld;
                return { reads: window.__qaChairReads, pose: w.relaxationPose(), hip: w.playerRig.leftLeg.rotation.x,
                  knee: w.playerRig.leftKnee.rotation.x, bodyZ: w.playerRig.visualRoot.position.z, existingSoleReads: window.__qaChairAllReads - window.__qaChairReads };
              });
              (run.chairContacts ??= []).push({top, chair, ...pose});
              check(pose.pose === 'chair-sit' && pose.reads === 0 && Math.abs(pose.hip + Math.PI / 2 + .3) < 1e-6
                && pose.knee <= 1.300001 && pose.bodyZ === 0,
              `${top}: original beach chair ${chair} uses the accepted angle-only pose and gate-prepared contact with zero seat-contact vertex reads`);
            }
          } finally {
            await page.evaluate(() => {
              for (const { mesh, original } of window.__qaChairMethods ?? []) mesh.applyBoneTransform = original;
              window.__islandWorld.player.userData.supportImportedSeat = window.__qaChairSupport;
              delete window.__qaChairMethods; delete window.__qaChairReads; delete window.__qaChairAllReads;
              delete window.__qaChairSupport; delete window.__qaInChairSupport;
              window.__islandWorld.forceStand();
            });
          }
        }
        for (const top of [OUTFITS[0], OUTFITS[4]]) {
          await page.evaluate(top => {
            const w = window.__islandWorld; w.setAvatarPalette({ ...window.__qaSavedPalette, top });
            w.player.position.set(0, -1.5, -100); w.setSwimming(true);
          }, top);
          await frames(2);
          const swim = await stage(`swimming/${top}`);
          check(swim.state === 'swimming', `the ${top === OUTFITS[0] ? 'male' : 'female'} body reaches the real swim state`);
          await page.evaluate(() => { const w = window.__islandWorld; w.setSwimming(false); w.focusCoastalForReview('square'); });
        }
        await page.evaluate(() => { const w = window.__islandWorld; w.setAvatarPalette(window.__qaSavedPalette); w.startFireworks(); });
        // The first launch trail alone does not draw the water-glint material.
        // Observe the real first burst, including that second draw, before
        // asserting that sign-in prepared the entire fireworks path.
        await page.waitForFunction(() => {
          const show = window.__islandWorld.fireworksReviewSnapshot();
          return show.bursts > 0 && show.particles > 0 && show.reflections > 0 && show.drawCalls === 2;
        }, null, { timeout: 8_000 });
        await frames(2);
        run.firstFireworks = await stage('first-fireworks');
        check(run.firstFireworks.fireworks.particles <= (quality === 'normal' ? 2048 : 1024), 'the first real burst and water glints retain the approved fireworks budget');
        await page.evaluate(() => window.__islandWorld.stopFireworks());
        run.drinks = await page.evaluate(() => window.__islandWorld.reviewDrinks(3));
        await frames(3);
        run.thirdDrink = await stage('first-third-drink-effect');
        check(run.drinks.drinks === 3, 'three drinks use the real production drinking path');
        check(await page.evaluate(() => window.__islandWorld.doubleVision?.material?.uniforms.opacity.value > 0), 'the third drink actually drew the gate-prepared double-vision effect');
        await page.evaluate(() => { const w = window.__islandWorld; w.soberUp(); w.focusCoastalForReview('square'); w.cameraMode = 'follow'; });
        await frames(2);
        run.exercisedBaseline = await stage('fixed-features-exercised');

        const setWeather = async type => {
          const now = Date.now();
          await staff(type === 'clear' ? [] : [{ type, startsAt: now - (type === 'snow' ? 610_000 : 60_000), endsAt: now + 3_600_000 }]);
          await page.waitForFunction(type => window.__islandWorld.weather.current().type === type, type, { timeout: 10_000 });
        };
        const sample = async (type, duration, repeat = false) => {
          await setWeather(type);
          await page.evaluate(() => window.__islandWorld.frameTimings.reset());
          const from = performance.now(); await page.waitForTimeout(duration);
          const state = await stage(`${repeat ? 'repeat-' : ''}${type}-${duration}ms`);
          state.sampleWallMs = Math.round(performance.now() - from); run.timings.push(state);
          const timing = state.timings;
          check(timing.frames > 0 && ['fps', 'gapP95Ms', 'gapMaxMs', 'workP95Ms', 'workMaxMs', 'lifetimeGapMaxMs', 'over100Ms'].every(key => Number.isFinite(timing[key]) && timing[key] >= 0), `${state.label}: live frames and finite measured work`);
          check(state.weather.maximumSettledDepth === .12 && state.weather.settledDepth >= 0 && state.weather.settledDepth <= .1200001, `${state.label}: settled snow respects the approved 0.12 cap`);
          check(state.weather.snowfall.flakes === profile.flakes && state.weather.snowfall.depthBands === 3, `${state.label}: the accepted strong snowfall keeps its device budget`);
          check(state.weather.groundTriangles > 0 && state.weather.groundTriangles <= 100_000 && state.weather.seatCaps <= 46 && state.weather.extraLights === 0, `${state.label}: adaptive ground/caps/lights remain bounded`);
          const statueSnow = state.weather.authoredSurfaces.sources.find(source => source.id === 'square-statue');
          const plinthSnow = state.weather.authoredSurfaces.sources.filter(source => source.id.startsWith('square-statue-plinth-'));
          check(state.weather.authoredSurfaces.sources.length === 99 && statueSnow?.sourceTriangles > 0 && statueSnow.topTriangles > 0
            && plinthSnow.length === 3 && plinthSnow.every(source => source.topTriangles === source.sourceTriangles)
            && state.weather.authoredSurfaces.triangles > 0 && state.weather.authoredSurfaces.triangles <= 40_000,
          `${state.label}: all 99 authored surfaces, including the final statue and complete plinth tiers, are prepared and bounded`);
          check(state.weatherResources.bufferBytes <= 5 * 1024 * 1024 && state.weatherResources.bufferBytes === run.baseline.weatherResources.bufferBytes,
            `${state.label}: the complete weather geometry retains the gate's bounded buffer allocation`);
          check(Object.values(state.precipitation).every(value => value.finite), `${state.label}: every exposed rain/snow position is finite`);
          check(state.weatherResources.geometries.join(',') === run.baseline.weatherResources.geometries.join(',')
            && state.weatherResources.materials.join(',') === run.baseline.weatherResources.materials.join(','), `${state.label}: weather reuses its exact gate-prepared geometry/material objects`);
          if (type === 'snow') check(state.weather.snowCoverage === 1, `${state.label}: the measured snowfall includes full accumulation`);
          if (type === 'snow' && !repeat) check(state.audio.levels.day === 0 && state.audio.levels.night === 0
            && state.audio.levels.ocean === 0 && state.audio.levels.snow > 0 && state.audio.levels.snowWind > 0,
            `${state.label}: snowfall replaces landscape ambience with the preloaded winter and wind layers`);
          if (type === 'snow') check(state.precipitation['paper-snow-flakes'].count === profile.flakes && state.precipitation['paper-snow-flakes'].visible,
            `${state.label}: all accepted flakes are actually submitted for drawing`);
          if (type === 'rain') check(state.precipitation['ink-rain-streaks'].count === (profile.flakes === 420 ? 440 : 1280) && state.precipitation['ink-rain-streaks'].visible,
            `${state.label}: the real rain draw respects the device segment budget`);
          if (!repeat) log(`${type}: ${timing.frames} frames, work p95 ${timing.workP95Ms}ms, gap p95 ${timing.gapP95Ms}ms (emulated)`);
          return state;
        };
        await sample('clear', SAMPLE_MS);
        const rain = await sample('rain', SAMPLE_MS);
        const snow = await sample('snow', SAMPLE_MS);
        let repeatReference = snow;
        await page.evaluate(() => {
          const audio = window.__islandWorld.audio;
          for (const cue of ['step-left', 'step-right', 'snow-brush', 'punch', 'eat', 'drink']) audio.playAvatarSound(cue);
          audio.playInterfaceSound('click'); audio.playInterfaceSound('hover');
        });
        if (stress) {
          log('stress: 24 rapid weather changes, then 30 seconds of mixed-fade/settled snow');
          run.weatherStress = [];
          for (let index = 0; index < 24; index++) {
            await setWeather(['clear', 'rain', 'snow'][index % 3]);
            await page.evaluate(index => {
              const w = window.__islandWorld; w.focusCoastalForReview(['square', 'shore', 'temple', 'palace'][index % 4]);
              w.cameraMode = ['follow', 'isometric', 'first-person'][index % 3];
            }, index);
            await page.waitForTimeout(300);
            const state = await stage(`rapid-weather-${index}`); run.weatherStress.push(state);
            check(state.weatherResources.bufferBytes === run.baseline.weatherResources.bufferBytes
              && state.weatherResources.geometries.join(',') === run.baseline.weatherResources.geometries.join(',')
              && state.weatherResources.materials.join(',') === run.baseline.weatherResources.materials.join(','),
            `rapid weather change ${index} retains the same gate-prepared buffers, geometry and materials`);
          }
          await page.evaluate(() => { const w = window.__islandWorld; w.focusCoastalForReview('square'); w.cameraMode = 'isometric'; });
          repeatReference = await sample('snow', 30_000);
          await page.evaluate(() => {
            const weather = window.__islandWorld.weather; window.__qaOriginalWeatherOffset = weather.offset;
            weather.offset += 3_600_000 + 16 * 60_000;
          });
          await frames(3);
          const melted = await stage('after-full-snow-melt-clock-jump');
          check(melted.weather.snowCoverage === 0 && melted.weather.settledDepth === 0
            && melted.weatherResources.bufferBytes === run.baseline.weatherResources.bufferBytes,
          'completed snowfall/melt changes coverage without rebuilding the prepared weather resources');
          await page.evaluate(() => {
            window.__islandWorld.weather.offset = window.__qaOriginalWeatherOffset; delete window.__qaOriginalWeatherOffset;
          });
        }
        await sample('clear', 1000, true);
        const repeatedSnow = await sample('snow', 1000, true);
        // A long stress run can legitimately expire disconnected test visitors.
        // Compare this adjacent repeat against the snow directly before it;
        // exact weather resource identities remain checked at every transition.
        run.repeatReference = repeatReference.label;
        check(repeatedSnow.renderer.geometries <= repeatReference.renderer.geometries && repeatedSnow.renderer.textures <= repeatReference.renderer.textures,
          'the adjacent clear→snow repeat causes no renderer allocation growth (departed visitors may release resources)');
        check(snow.renderer.geometries <= rain.renderer.geometries && snow.renderer.textures <= rain.renderer.textures,
          'changing rain to full snow causes no renderer geometry/texture growth');
        run.final = await stage('final-snow');
        run.glAudit = await page.evaluate(() => window.__loadingWeatherGLAudit);
        run.audioAudit = await page.evaluate(() => window.__loadingWeatherAudioAudit);
        run.expectedBlockedConsoleErrors = run.consoleErrors.filter(message => {
          const url = message.location.url;
          return url && !networkAllowed(url) && /Failed to load|blocked|cancelled|canceled|Load failed/i.test(message.text);
        });
        run.unexpectedConsoleErrors = run.consoleErrors.filter(message => !run.expectedBlockedConsoleErrors.includes(message));
        check(run.glAudit.afterAdmission.length === 0 && run.final.gl.linkProgram === run.baseline.gl.linkProgram
          && run.final.gl.compileShader === run.baseline.gl.compileShader, 'all first locations/cameras/wardrobe/swimming/fireworks/drinks/weather reuse gate-linked driver programs');
        check(run.final.gl.contexts === run.baseline.gl.contexts, 'play creates no additional WebGL context');
        check(run.audioAudit.afterAdmission.length === 0 && run.audioAudit.pending === 0
          && run.final.nativeAudio.contexts === run.baseline.nativeAudio.contexts
          && run.audioAudit.decodes.every(decode => decode.status === 'fulfilled'),
        'first actions, unmute and repeated weather cause no native audio decoding or new audio contexts after admission');
        check(!run.glAudit.contextLost.some(event => event.at >= run.glAudit.baselineAt), 'no context is lost after the completed gate handoff');
        check(run.lateAssets.length === 0, 'no fixed files download after the sign-in loading animation');
        check(run.localHttpErrors.length === 0 && run.localRequestFailures.length === 0, 'all local assets and API traffic complete without HTTP/network errors');
        check(run.errors.length === 0 && run.shaderErrors.length === 0 && run.glAudit.rejections.length === 0
          && run.unexpectedConsoleErrors.length === 0, 'no page/shader errors, unhandled rejections or unexpected console errors');
        check(run.blockedRequests.every(request => !/\/api\//.test(new URL(request.url).pathname)), 'no nonlocal API traffic was attempted during play');
        run.passed = true; log(`PASS: ${run.assertions.length} assertions; no late fixed files or driver compiles/links`);
      } catch (error) {
        run.failure = String(error.stack ?? error);
        if (page && !page.isClosed()) {
          try {
            run.failureState = await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 5000),
              perf: window.__festivalPerf?.(), weather: window.__festivalWeather?.(), gl: window.__loadingWeatherGLAudit }));
            run.failureScreenshot = `${profile.name}-${quality}-failure.png`;
            await page.screenshot({ path: join(out, run.failureScreenshot), timeout: 10_000 });
          } catch (captureError) { run.captureFailure = String(captureError); }
        }
        log('FAILED; evidence saved to ' + join(out, 'report.json')); throw error;
      } finally {
        releaseWind();
        auditing = false; run.elapsedMs = Math.round(performance.now() - started);
        if (context) { await context.close(); context = undefined; page = undefined; }
        if (browser) { await browser.close(); browser = undefined; }
        await writeReport();
      }
    }
  } catch (error) {
    report.failure = String(error.stack ?? error); process.exitCode = 1;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    try {
      await staff([]);
      const config = await (await fetchLocal(API + '/api/config')).json();
      report.localWeatherScheduleCleared = config.weather.schedule.every(period => period.endsAt <= Date.now());
      assert.ok(report.localWeatherScheduleCleared, 'Final cleanup leaves no current/future precipitation schedule. Completed snow correctly keeps its bounded melt tail.');
    } catch (error) { report.cleanupFailure = String(error); process.exitCode = 1; }
    report.finishedAt = new Date().toISOString();
    report.elapsedMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
    await writeReport();
    console.log(JSON.stringify({ report: join(out, 'report.json'), elapsedMs: report.elapsedMs,
      runs: report.runs.map(run => ({ profile: run.profile, quality: run.quality, passed: run.passed ?? false,
        assertions: run.assertions.length, lateAssets: run.lateAssets.length, errors: run.errors.length,
        compileCallsAfterAdmission: run.glAudit?.afterAdmission.length, timings: run.timings.map(state => ({ weather: state.label, ...state.timings })) })),
      failure: report.failure, cleanupFailure: report.cleanupFailure, localWeatherScheduleCleared: report.localWeatherScheduleCleared,
    }, null, 2));
  }
}

if (process.argv.includes('--self-test')) await selfTest();
else await main();
