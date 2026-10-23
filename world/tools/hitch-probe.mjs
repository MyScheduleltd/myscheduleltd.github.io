// Freezes and hitches in WebKit — Safari's engine — on an iPhone-sized screen
// (2026-10-18). Where tools/frame-cost-probe.mjs measures steady frame cost in
// Chrome, this plays the moments a phone visitor reported freezing (right
// after entering, moving between areas, a crowd arriving, walking into a
// screen) and attributes every slow frame to what the main thread was doing:
// shader compile/link, texture and buffer uploads, avatar building, screen
// mounting, the main draw, or the rest of the frame.
//
// Needs Playwright with its WebKit (npm i playwright; npx playwright install webkit),
// a production build pointed at a disposable local service, served locally:
//   VITE_FESTIVAL_SERVER_URL=http://127.0.0.1:8792 vite build --outDir <dir> && vite preview --outDir <dir> --port 4185
//   NODE_PATH=<playwright>/node_modules node tools/hitch-probe.mjs http://127.0.0.1:4185 http://127.0.0.1:8792 LABEL
// Env: MODE=normal|lite, OUT=dir, CROWD=19 (bots that join mid-run), STEPS=comma list.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { webkit, devices } = createRequire(import.meta.url)('playwright');

const [base, service, label = 'run'] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base ?? '') || !/^http:\/\/127\.0\.0\.1:\d+$/.test(service ?? '')) throw Error('Loopback client and service only');
const mode = process.env.MODE ?? 'normal';
const out = process.env.OUT ?? '.'; mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// COLD=1: start from an empty shader cache, as a first visit (or the first
// visit after a release) does. Only Playwright's own WebKit cache is cleared.
if (process.env.COLD) {
  const caches = execFileSync('getconf', ['DARWIN_USER_CACHE_DIR'], { encoding: 'utf8' }).trim();
  rmSync(join(caches, 'com.apple.WebKit.GPU+org.webkit.Playwright'), { recursive: true, force: true });
}
const browser = await webkit.launch({ headless: true });
const device=process.env.DEVICE??'iPhone 15 Pro';
if(!devices[device])throw Error(`Unknown browser device profile: ${device}`);
const context = await browser.newContext({ ...devices[device] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });

// Installed before any page script. Every animation frame — the sign-in
// page's, the loading animation's and the world's — is timed, along with the
// WebGL entry points that block the main thread, by category.
await page.addInitScript(() => {
  const cost = { compile: 0, texture: 0, buffer: 0, calls: 0, links: 0 };
  const rec = { frames: [], label: 'gate', phase: {} };
  window.__glCost = cost;
  window.__hitch = rec;
  const wrap = (proto, name, bucket) => {
    const original = proto[name];
    if (!original) return;
    proto[name] = function (...args) {
      if (name === 'linkProgram') cost.links++;
      const t = performance.now();
      try { return original.apply(this, args); } finally { cost[bucket] += performance.now() - t; cost.calls++; }
    };
  };
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    for (const n of ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'useProgram']) wrap(proto, n, 'compile');
    for (const n of ['texImage2D', 'texSubImage2D', 'compressedTexImage2D', 'texStorage2D', 'generateMipmap', 'texImage3D', 'texSubImage3D', 'copyTexSubImage2D']) wrap(proto, n, 'texture');
    for (const n of ['bufferData', 'bufferSubData']) wrap(proto, n, 'buffer');
  }
  const raf = window.requestAnimationFrame.bind(window);
  let last = 0;
  const known = new Set();
  window.requestAnimationFrame = (callback) => raf((t) => {
    const start = performance.now();
    const before = { ...cost };
    rec.phase = {};
    try { callback(t); } finally {
      const end = performance.now();
      const w = window.__islandWorld;
      const stage = rec.label === 'loading' ? `loading ${document.querySelector('[data-gate-entry] [role="progressbar"]')?.getAttribute('aria-valuenow') ?? ''}` : rec.label;
      if (end - start > 4 || rec.label !== 'gate') rec.frames.push({
        label: rec.label, stage, at: Math.round(start), gap: last ? Math.round((start - last) * 10) / 10 : 0, js: Math.round((end - start) * 10) / 10,
        compile: Math.round((cost.compile - before.compile) * 10) / 10, texture: Math.round((cost.texture - before.texture) * 10) / 10,
        buffer: Math.round((cost.buffer - before.buffer) * 10) / 10, links: cost.links - before.links, programs: w?.renderer?.info.programs?.length ?? 0,
        phase: Object.fromEntries(Object.entries(rec.phase).filter(([, v]) => v > 2).map(([k, v]) => [k, Math.round(v * 10) / 10])),
        visitors: w?.remoteAvatars?.size ?? 0, projector: w?.mountedProjectorVenue ?? '',
        // The shared YouTube player: none yet, still starting, or answering
        // (and where its muted first film under the loading view has got to).
        player: w?.screenPlayer?.iframe ? (w.screenPlayer.ready ? `ready${w.screenPlayer.firstFilm ? ' ' + w.screenPlayer.firstFilm : ''}` : 'starting') : '',
        // What the new programs are: material type and the start of three's cache key.
        made: (w?.renderer?.info.programs ?? []).filter((p) => !known.has(p.id) && known.add(p.id)).map((p) => `${p.name}`).slice(0, 40),
      });
      last = start;
    }
  });
});

await page.goto(`${base}/?era=ps2&island&review=perf&cycleMinute=12`);
await page.waitForSelector('#festival-id', { timeout: 60_000 });
await sleep(1500);
await page.fill('#festival-id', 'Probe' + Math.floor(Math.random() * 900 + 100));
await page.click(`[data-graphics=${mode}]`);
const enteredAt = Date.now();
await page.evaluate(() => { window.__hitch.label = 'loading'; });
await page.click('button[data-audio="sound"]');
await page.waitForFunction(() => typeof window.__festivalPerf === 'function' && !!window.__islandWorld, null, { timeout: 120_000 });
// The world's expensive calls, attributed inside whichever frame they run in.
await page.evaluate(() => {
  const w = window.__islandWorld, rec = window.__hitch;
  const timed = (name) => {
    const original = w[name];
    if (typeof original !== 'function') return;
    w[name] = function (...args) {
      const t = performance.now();
      try { return original.apply(this, args); } finally { rec.phase[name] = (rec.phase[name] ?? 0) + performance.now() - t; }
    };
  };
  for (const n of ['flushRemoteVisitor', 'createRemoteAvatar', 'setRemoteVisitors', 'updateProjectorMounts', 'setPublicScreening', 'releaseProjector',
    'updateNpcs', 'updateRemoteAvatars', 'cullAvatars', 'updateCamera', 'updatePlayer', 'updateLampPool', 'updateLampBudget', 'updateWaterLayers', 'updateStylizedWater', 'drawDoubleVision']) timed(n);
  const R = w.renderer, draw = R.render.bind(R);
  R.render = (scene, camera) => { const t = performance.now(); try { return draw(scene, camera); } finally { rec.phase.draw = (rec.phase.draw ?? 0) + performance.now() - t; } };
});
await page.waitForFunction(() => !document.querySelector('.gate--handoff, .gate--entering, #gate-form'), null, { timeout: 120_000 });
const admission = Date.now() - enteredAt;
await page.evaluate(() => { window.__hitch.label = 'entry'; });
console.log('warm-up:', JSON.stringify(await page.evaluate(() => window.__festivalPerf()?.warmup ?? null)));
await sleep(3_000);
const step = (name) => page.evaluate((n) => { window.__hitch.label = n; }, name);
const press = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };

const steps = (process.env.STEPS ?? 'settle,crowd,square,palace,shore,drive-in,club,rooftop,temple,walk').split(',');
let bots;
for (const s of steps) {
  await step(s);
  if (s === 'settle') { await sleep(8_000); continue; }
  if (s === 'crowd') {
    bots = spawn(process.execPath, [new URL('./crowd-presence-bots.mjs', import.meta.url).pathname, service, String(process.env.CROWD ?? 19), '240'], { stdio: 'ignore' });
    await sleep(15_000); continue;
  }
  if (s === 'walk') {
    await page.evaluate(() => window.__islandWorld.fastTravel('square'));
    for (const key of ['w', 'a', 's', 'd', 'w']) await press(key, 2_500);
    continue;
  }
  if (s === 'club') {
    await page.evaluate(() => window.__islandWorld.fastTravel('club'));
    await sleep(1_500);
    await press('a', 6_000);
    await sleep(3_000);
    continue;
  }
  await page.evaluate((n) => window.__islandWorld.fastTravel(n), s);
  await sleep(1_500);
  await press('w', 2_500);
  await sleep(3_500);
}
bots?.kill();

const frames = await page.evaluate(() => window.__hitch.frames);
const summary = {};
for (const f of frames) {
  const s = (summary[f.label] ??= { frames: 0, gaps: [], hitch50: 0, hitch100: 0, worst: [] });
  s.frames++; s.gaps.push(f.gap);
  if (f.gap > 50) s.hitch50++;
  if (f.gap > 100) s.hitch100++;
  s.worst.push(f);
}
const pct = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))] ?? 0; };
const table = Object.entries(summary).map(([name, s]) => ({
  step: name, frames: s.frames, p50: pct(s.gaps, .5), p95: pct(s.gaps, .95), max: Math.max(...s.gaps), over50: s.hitch50, over100: s.hitch100,
}));
console.log(`${label}: mode ${mode}, admission ${admission} ms, errors ${errors.length}`);
console.table(table);
const worst = [...frames].sort((a, b) => b.js - a.js).slice(0, 15);
console.log('Slowest frames (main-thread ms):');
for (const f of worst) console.log(`  ${f.label.padEnd(9)} js ${String(f.js).padStart(6)}  gap ${String(f.gap).padStart(6)}  compile ${f.compile} (${f.links} links, ${f.programs} programs) texture ${f.texture} buffer ${f.buffer}  ${JSON.stringify(f.phase)}  visitors ${f.visitors} ${f.projector}${f.made?.length ? '\n      new: ' + [...new Set(f.made)].map((n) => `${n} x${f.made.filter((m) => m === n).length}`).join(', ') : ''}`);
writeFileSync(join(out, `hitch-${label}.json`), JSON.stringify({ label, device, mode, admission, errors, table, frames }, null, 1));
if (errors.length) console.log('errors:', errors.slice(0, 5));
await browser.close();
