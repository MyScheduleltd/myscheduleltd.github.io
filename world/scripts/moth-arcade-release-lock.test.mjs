import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
import { ARCADE_UNLOCK_AT, arcadeIsLocked, externalArcadeRequired } from '../src/world/ArcadeRules.ts';
import { ARCADE_PREVIEW_END } from '../server/arcade-preview.mjs';

// Keep the real cabinet, GLTF decoder, UVs and material lifecycle. Only network
// transport and canvas painting need substitutes in this non-WebGL fixture.
const asset = await readFile('src/assets/venue-scenery/moth-arcade.glb');
const bytes = () => asset.buffer.slice(asset.byteOffset, asset.byteOffset + asset.byteLength);
let transport = () => Promise.resolve(bytes());
globalThis.__arcadeLockAsset = () => transport();
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const header = new DataView(await blob.arrayBuffer());
  return { width: header.getUint32(16), height: header.getUint32(20), close() {} };
};
const canvases = [];
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  const labels = [];
  const context = new Proxy({ fillText: text => labels.push(text) }, {
    get: (target, key) => key in target ? target[key] : () => {},
  });
  const canvas = { width: 0, height: 0, labels, getContext: () => context };
  canvases.push(canvas); return canvas;
} };
const bundle = await build({
  stdin: { contents: "export { MothArcadeCabinet } from './src/world/MothArcade'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
  define: { 'import.meta.url': JSON.stringify('http://127.0.0.1:4173/src/world/MothArcade.ts') },
  plugins: [{ name: 'cabinet-lock-transport', setup(builder) {
    builder.onResolve({ filter: /^\.\/AssetMirror$/ }, () => ({ path: 'asset', namespace: 'lock-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'lock-test' }, () => ({ contents: 'export const fetchAsset = () => globalThis.__arcadeLockAsset();' }));
  } }],
});
const { MothArcadeCabinet, THREE } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('the cabinet and preview server unlock at exactly midnight on 16 November 2026 in Taiwan', () => {
  assert.equal(ARCADE_UNLOCK_AT, Date.parse('2026-11-16T00:00:00+08:00'));
  assert.equal(ARCADE_PREVIEW_END, ARCADE_UNLOCK_AT, 'the server must enforce the same extended preview deadline');
  assert.equal(new Date(ARCADE_UNLOCK_AT).toISOString(), '2026-11-15T16:00:00.000Z');
  assert.equal(arcadeIsLocked(ARCADE_UNLOCK_AT - 1), true);
  assert.equal(arcadeIsLocked(ARCADE_UNLOCK_AT), false);
  assert.equal(arcadeIsLocked(ARCADE_UNLOCK_AT + 1), false);
  assert.equal(arcadeIsLocked(Date.parse('2026-10-16T12:00:00+08:00')), true);
  assert.equal(arcadeIsLocked(Date.parse('2026-11-02T00:00:00+08:00')), true, 'the old release date remains locked');
  assert.equal(arcadeIsLocked(Date.parse('2026-11-15T23:59:59.999+08:00')), true);
  assert.equal(arcadeIsLocked(Date.parse('2027-01-01T00:00:00Z')), false);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(ARCADE_UNLOCK_AT);
  const parts = Object.fromEntries(date.map(part => [part.type, part.value]));
  assert.deepEqual([parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second], ['2026', '11', '16', '00', '00', '00']);
});

test('late cabinet load paints only the latest lock language, upright on its real CRT', async () => {
  let release;
  transport = () => new Promise(resolve => { release = resolve; });
  const cabinet = new MothArcadeCabinet(20, 0, 12);
  const before = canvases.length;
  cabinet.setLocked(true, 'en'); cabinet.setLocked(true, 'zh-TW');
  assert.equal(canvases.length, before, 'do not allocate canvas textures before the CRT exists');
  release(bytes()); await cabinet.ready;
  assert.equal(cabinet.status, 'ready');
  assert.equal(canvases.length, before + 1);
  const screen = cabinet.screen, map = screen.material.map;
  assert.equal(screen.material.type, 'MeshBasicMaterial');
  assert.equal(screen.layers.mask & 1, 1, 'standby notice is visible in the ordinary world render');
  assert.equal(screen.layers.mask & 2, 0, 'retain the authored live-game foreground exclusion');
  assert.equal(screen.material.toneMapped, false, 'the notice remains legible in night lighting');
  assert.equal(map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(map.flipY, true, 'canvas top must remain the top of the local screen');
  assert.ok(map.image.labels.includes('遊戲 COMING SOON'));
  assert.ok(map.image.labels.includes('2026.11.16  00:00'));
  assert.ok(map.image.labels.includes('台灣時間（UTC+8）'));
  assert.equal(map.image.labels.includes('CURRENTLY LOCKED'), false, 'a late GLB must not resurrect an old locale');
  const position = screen.geometry.getAttribute('position'), uv = screen.geometry.getAttribute('uv');
  screen.geometry.computeBoundingBox(); const { min, max } = screen.geometry.boundingBox;
  for (let i = 0; i < position.count; i++) {
    assert.ok(Math.abs(uv.getX(i) - (position.getX(i) - min.x) / (max.x - min.x)) < 1e-7);
    assert.ok(Math.abs(uv.getY(i) - (position.getY(i) - min.y) / (max.y - min.y)) < 1e-7);
  }
  for (let i = 0; i < 100; i++) cabinet.setLocked(true, 'zh-TW');
  assert.equal(canvases.length, before + 1, 'per-frame clock checks must reuse the same artwork and GPU texture');
  assert.equal(screen.material.map, map);
  cabinet.dispose();
});

test('unlock restores the original CRT and releases its notice; disposal is idempotent', async () => {
  transport = () => Promise.resolve(bytes());
  const cabinet = new MothArcadeCabinet(0, 0, 0); await cabinet.ready;
  const screen = cabinet.screen, authored = screen.material, authoredUv = screen.geometry.getAttribute('uv');
  let authoredDisposals = 0; authored.addEventListener('dispose', () => authoredDisposals++);
  cabinet.setLocked(true, 'en');
  const notice = screen.material, texture = notice.map;
  let noticeDisposals = 0, textureDisposals = 0;
  notice.addEventListener('dispose', () => noticeDisposals++);
  texture.addEventListener('dispose', () => textureDisposals++);
  assert.ok(texture.image.labels.includes('CURRENTLY LOCKED'));
  cabinet.setLocked(false, 'en');
  assert.equal(screen.material, authored);
  assert.equal(screen.geometry.getAttribute('uv'), authoredUv);
  assert.equal(screen.layers.mask & 1, 1); assert.equal(screen.layers.mask & 2, 0);
  assert.equal(noticeDisposals, 1); assert.equal(textureDisposals, 1);
  assert.equal(authoredDisposals, 0, 'unlock keeps the actual standby screen alive for future play');
  cabinet.dispose(); cabinet.dispose(); cabinet.setLocked(true, 'en');
  assert.equal(authoredDisposals, 1);
  assert.equal(noticeDisposals, 1); assert.equal(textureDisposals, 1);
});

test('a release that occurs while cabinet bytes are pending never paints a stale lock notice', async () => {
  let release;
  transport = () => new Promise(resolve => { release = resolve; });
  const cabinet = new MothArcadeCabinet(0, 0, 0), before = canvases.length;
  cabinet.setLocked(true, 'en'); cabinet.setLocked(false, 'en');
  release(bytes()); await cabinet.ready;
  assert.equal(cabinet.status, 'ready'); assert.equal(canvases.length, before);
  assert.equal(cabinet.screen.material.name, 'MOTH standby black');
  assert.equal(cabinet.screen.geometry.getAttribute('uv'), undefined);
  cabinet.dispose();
});

test('leaving before the GLB loads cannot attach a stale locked model or leak its geometry', async () => {
  let release;
  transport = () => new Promise(resolve => { release = resolve; });
  const cabinet = new MothArcadeCabinet(0, 0, 0), before = canvases.length;
  cabinet.setLocked(true, 'en'); cabinet.dispose();
  const dispose = THREE.BufferGeometry.prototype.dispose;
  let disposed = 0;
  THREE.BufferGeometry.prototype.dispose = function() { disposed++; return dispose.call(this); };
  try { release(bytes()); await cabinet.ready; } finally { THREE.BufferGeometry.prototype.dispose = dispose; }
  assert.ok(disposed > 10, 'all late model geometry must be released');
  assert.equal(cabinet.root.children.length, 0);
  assert.equal(canvases.length, before, 'disposed cabinets must never allocate the lock artwork');
  assert.equal(cabinet.screen, undefined);
});

// Extract real App methods through the TypeScript AST so guards are exercised
// in their original order rather than duplicated in an imitation controller.
const appSource = await readFile('src/ui/App.ts', 'utf8');
const appTree = ts.createSourceFile('App.ts', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const appClass = appTree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'App');
const methodNames = new Set(['openArcadeGame', 'syncArcadeRelease', 'showArcadeReleaseNotice', 'arcadePreviewActive', 'syncArcadePreviewButtons']);
const methods = appClass.members.filter(node => node.name && methodNames.has(node.name.getText(appTree)));
assert.equal(methods.length, methodNames.size);
const noticeSource=await readFile('src/ui/ArcadePreviewNotice.ts','utf8');
const noticeTree=ts.createSourceFile('ArcadePreviewNotice.ts',noticeSource,ts.ScriptTarget.Latest,true);
const noticeFunction=noticeTree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='createArcadePreviewNotice').getText(noticeTree).replace(/^export /,'');
const appCode = ts.transpileModule(`${noticeFunction}\nclass ArcadeReleaseFixture { ${methods.map(node => node.getText(appTree)).join('\n')} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText + '\nArcadeReleaseFixture;';

class ReleaseDialog extends EventTarget {
  button = new EventTarget();
  attributes = {}; open = false; removed = false;
  setAttribute(name, value) { this.attributes[name] = value; }
  nodes=new Map();
  querySelector(selector) { if(selector==='[data-arcade-preview-close]')return this.button;if(!this.nodes.has(selector)){const node=new EventTarget();Object.assign(node,{value:'',replaceChildren(){},append(){}});this.nodes.set(selector,node);}return this.nodes.get(selector); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  remove() { this.removed = true; }
  getBoundingClientRect() { return { left: 20, top: 20, right: 300, bottom: 300 }; }
}
function releaseApp({ now = ARCADE_UNLOCK_AT - 5_000, offset = 0, mobile = false, language = 'zh-TW' } = {}) {
  const clock = { now }, timers = new Map(), dialogs = [], calls = { urls: [], starts: [], lockViews: [], popups: [], locks: [], alerts: [], menuCaptures: 0, gameCloses: 0, mediaChecks: 0 };
  let timerId = 0;
  const window = {
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    matchMedia(query) { calls.mediaChecks++; return { matches: query === '(pointer: coarse)' ? mobile : !mobile }; },
  };
  const document = { createElement(tag) { assert.equal(tag, 'dialog'); const dialog = new ReleaseDialog(); dialogs.push(dialog); return dialog; } };
  const App = runInNewContext(appCode, {
    Date: class extends Date { static now() { return clock.now; } },
    window, document, ARCADE_UNLOCK_AT, arcadeIsLocked, externalArcadeRequired,
    arcadeGameUrl(embedded = true) { calls.urls.push(embedded); return embedded ? 'embedded-live-game' : 'standalone-live-game'; },
  });
  const app = new App();
  app.serverClockOffset = offset; app.language = language; app.vrActive = false; app.audioMuted = false;
  app.arcadePlaying = false; app.arcadeLockedViewing = false;
  app.arcadePreview={state:{unlocked:false,released:false,codes:[]},status:()=>new Promise(()=>{})};
  const fullscreen = { hidden: false };
  const shell = { dataset: {} }, hud = { style: {}, hidden: true, setAttribute() {}, querySelector: () => fullscreen }, css = { removeAttribute() {} };
  app.root = {
    querySelector(selector) { return selector === '.world-shell' ? shell : selector === '#moth-arcade-hud' ? hud : selector === '#world-css3d' ? css : null; },
    append(node) { node.parent = this; },
    querySelectorAll(){return [];},
  };
  app.world = {
    setArcadeLocked(...args) { calls.locks.push(args); },
    startArcadeGame(url) { calls.starts.push(url); return true; },
    startArcadeLockedView(...args) { calls.lockViews.push(args); return true; },
    audio: { setMuted() {} }, setPublicScreenMuted() {},
  };
  app.closePanel = app.closeFestivalPass = app.applyJukeboxVolume = () => {};
  app.syncMenuCapture = () => calls.menuCaptures++;
  app.showWorldAlert = message => calls.alerts.push(message);
  app.openLinkAndLeaveVr = (...args) => calls.popups.push(args);
  app.usesVrSimulation = () => false; app.confirmedLeavingVr = () => true;
  app.closeArcadeGame = () => { app.arcadePlaying = false; app.arcadeLockedViewing = false; calls.gameCloses++; };
  const fireTimer = () => {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id); timer.callback();
  };
  return { app, clock, timers, dialogs, calls, fireTimer, shell, hud, fullscreen };
}

test('mobile E keeps its availability dialog without any game URL, iframe or popup', () => {
    const fixture = releaseApp({ mobile: true });
    fixture.app.openArcadeGame(); fixture.app.openArcadeGame();
    assert.deepEqual(fixture.calls.urls, []); assert.deepEqual(fixture.calls.starts, []); assert.deepEqual(fixture.calls.popups, []);
    assert.deepEqual(fixture.calls.lockViews, [], 'phones never enter the cabinet camera');
    assert.equal(fixture.dialogs.length, 1, 'repeated E presses cannot stack modal notices');
    const dialog = fixture.dialogs[0];
    assert.equal(dialog.open, true); assert.match(dialog.innerHTML, /提前解鎖 M\.O\.T\.H 遊戲機/);assert.match(dialog.innerHTML,/影展裡的 M\.O\.T\.H 遊戲機/,'says which game the code unlocks');assert.doesNotMatch(dialog.innerHTML,/捐款/,'an offering, not a donation');assert.match(dialog.innerHTML,/data-arcade-code-form/);
    assert.match(dialog.innerHTML,/2026 年 11 月 16 日 00:00（台灣時間）/);
    assert.equal(fixture.app.arcadeNotice, dialog);
    assert.deepEqual(fixture.calls.locks.at(-1), [true, 'zh-TW']);
    dialog.button.dispatchEvent(new Event('click'));
    assert.equal(dialog.open, false); assert.equal(dialog.removed, true); assert.equal(fixture.app.arcadeNotice, undefined);
});

test('locked desktop E opens the actual cabinet view with Exit and no popup or live game', () => {
  const fixture = releaseApp();
  fixture.app.openArcadeGame(); fixture.app.openArcadeGame();
  assert.equal(fixture.calls.lockViews.length, 1, 'repeated Play cannot stack camera views');
  assert.deepEqual(fixture.calls.urls, []); assert.deepEqual(fixture.calls.starts, []); assert.deepEqual(fixture.calls.popups, []);
  assert.equal(fixture.dialogs.length, 0, 'desktop lock belongs to the physical CRT, not a page dialog');
  assert.equal(fixture.app.arcadePlaying, true); assert.equal(fixture.app.arcadeLockedViewing, true);
  assert.equal(fixture.shell.dataset.arcadeLocked, 'true');
  assert.equal(fixture.hud.hidden, false); assert.equal(fixture.fullscreen.hidden, true);
  const layout = fixture.calls.lockViews[0][1];
  layout({ x: 30, y: 40, width: 600, height: 500, exitX: 330, exitY: 490 });
  assert.equal(fixture.hud.style.left, '330px'); assert.equal(fixture.hud.style.top, '490px');
  assert.equal(fixture.hud.style.maxWidth, '576px');
  fixture.app.syncArcadeRelease();
  assert.equal(fixture.calls.gameCloses, 0, 'clock refreshes must not eject a locked camera visit');
});

test('the English mobile notice keeps the cabinet locked on the old release date and shows November 16', () => {
  const fixture = releaseApp({ mobile: true, language: 'en', now: Date.parse('2026-11-02T00:00:00+08:00') });
  fixture.app.openArcadeGame();
  assert.equal(fixture.dialogs.length, 1);
  assert.match(fixture.dialogs[0].innerHTML, /November 16, 2026, 00:00 Taiwan time/);
  assert.deepEqual(fixture.calls.urls, []);
  assert.deepEqual(fixture.calls.starts, []);
  assert.deepEqual(fixture.calls.popups, []);
});

test('a desktop viewer sees the same cabinet unlock into the live game at the exact deadline', () => {
  const fixture = releaseApp({ now: ARCADE_UNLOCK_AT - 1 });
  fixture.app.openArcadeGame();
  assert.equal(fixture.app.arcadeLockedViewing, true);
  fixture.clock.now = ARCADE_UNLOCK_AT; fixture.fireTimer();
  assert.equal(fixture.calls.gameCloses, 1); assert.equal(fixture.calls.lockViews.length, 1);
  assert.deepEqual(fixture.calls.urls, [true]); assert.deepEqual(fixture.calls.starts, ['embedded-live-game']);
  assert.equal(fixture.app.arcadePlaying, true); assert.equal(fixture.app.arcadeLockedViewing, false);
  assert.equal(fixture.fullscreen.hidden, false); assert.equal(fixture.shell.dataset.arcadeLocked, 'false');
  assert.deepEqual(fixture.calls.popups, []); assert.equal(fixture.timers.size, 0);
});

test('a failed locked cabinet start leaves the world controls and popup untouched', () => {
  const fixture = releaseApp(); fixture.app.world.startArcadeLockedView = () => false;
  fixture.app.openArcadeGame();
  assert.equal(fixture.app.arcadePlaying, false); assert.equal(fixture.app.arcadeLockedViewing, false);
  assert.equal(fixture.hud.hidden, true); assert.equal(fixture.dialogs.length, 0);
  assert.deepEqual(fixture.calls.urls, []);
});

test('release timer uses the festival clock and automatically unlocks the physical screen and open notice', () => {
  const fixture = releaseApp({ now: ARCADE_UNLOCK_AT - 35_000, offset: 30_000, mobile: true, language: 'en' });
  fixture.app.openArcadeGame();
  assert.equal(fixture.timers.size, 1); assert.equal([...fixture.timers.values()][0].delay, 5_000);
  const dialog = fixture.dialogs[0]; assert.match(dialog.innerHTML, /00:00 Taiwan time/);
  fixture.app.syncArcadeRelease();
  assert.equal(fixture.timers.size, 1, 'service-clock refreshes replace rather than accumulate timers');
  fixture.clock.now += 5_000; fixture.fireTimer();
  assert.deepEqual(fixture.calls.locks.at(-1), [false, 'en']);
  assert.equal(fixture.timers.size, 0); assert.equal(dialog.open, false); assert.equal(dialog.removed, true);
  assert.equal(fixture.app.arcadeNotice, undefined); assert.match(fixture.calls.alerts[0], /NOW AVAILABLE/);
  fixture.app.openArcadeGame();
  assert.deepEqual(fixture.calls.urls, [false]); assert.deepEqual(fixture.calls.popups, [['standalone-live-game', 'M.O.T.H']]);
  assert.equal(fixture.calls.starts.length, 0, 'mobile returns to its existing external game route after unlock');
});

test('desktop can launch at the exact release instant, and a delayed background timer still rechecks the clock', () => {
  const fixture = releaseApp({ now: ARCADE_UNLOCK_AT - 1 });
  assert.equal(fixture.app.syncArcadeRelease(), true);
  fixture.clock.now = ARCADE_UNLOCK_AT + 120_000;
  fixture.fireTimer();
  assert.deepEqual(fixture.calls.locks.at(-1), [false, 'zh-TW']); assert.equal(fixture.timers.size, 0);
  fixture.clock.now = ARCADE_UNLOCK_AT;
  fixture.app.openArcadeGame();
  assert.deepEqual(fixture.calls.urls, [true]); assert.deepEqual(fixture.calls.starts, ['embedded-live-game']);
  assert.deepEqual(fixture.calls.popups, []); assert.equal(fixture.app.arcadePlaying, true);
});

test('a correction to an earlier service clock re-locks an existing game and safely caps long timers', () => {
  const fixture = releaseApp({ now: ARCADE_UNLOCK_AT, offset: 0 });
  fixture.app.openArcadeGame(); assert.equal(fixture.app.arcadePlaying, true);
  fixture.app.serverClockOffset = -60_000;
  assert.equal(fixture.app.syncArcadeRelease(), true); assert.equal(fixture.calls.gameCloses, 1);
  assert.equal(fixture.app.arcadePlaying, false); assert.equal([...fixture.timers.values()][0].delay, 60_000);
  fixture.clock.now = ARCADE_UNLOCK_AT - 3_000_000_000; fixture.app.serverClockOffset = 0;
  fixture.app.syncArcadeRelease(); assert.equal(fixture.timers.size, 1);
  assert.equal([...fixture.timers.values()][0].delay, 2_147_483_647, 'avoid the browser timer overflow that would otherwise busy-loop');
});

test('the world independently refuses a locked session and forwards state to the physical cabinet', async () => {
  const source = await readFile('src/world/FestivalWorld.ts', 'utf8');
  const tree = ts.createSourceFile('FestivalWorld.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const worldClass = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'FestivalWorld');
  const names = new Set(['setArcadeLocked', 'startArcadeGame', 'beginArcadeView']);
  const members = worldClass.members.filter(node => node.name && names.has(node.name.getText(tree)));
  assert.equal(members.length, names.size);
  const code = ts.transpileModule(`class WorldReleaseFixture { ${members.map(node => node.getText(tree)).join('\n')} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText + '\nWorldReleaseFixture;';
  let created = 0, mounted = 0, stopped = 0;
  const World = runInNewContext(code, { MothArcadeSession: class {
    constructor() { created++; } mount() { mounted++; }
  } });
  const world = new World(), locks = [];
  world.arcadeCabinet = { screen: {}, setLocked: (...args) => locks.push(args) };
  world.stopArcadeGame = () => { stopped++; world.arcadeSession = undefined; world.arcadeView = undefined; };
  world.setArcadeLocked(true, 'en');
  assert.deepEqual(locks.at(-1), [true, 'en']);
  assert.equal(world.startArcadeGame('blocked', () => {}), false);
  assert.equal(created, 0); assert.equal(mounted, 0, 'no caller can create a game iframe through the world while it is locked');
  world.setArcadeLocked(false, 'zh-TW');
  world.keys = new Set(['KeyW']); world.cameraPointerReset = () => {}; world.setMovementVector = () => {};
  world.player = { visible: true };
  world.cssRenderer = { domElement: {} }; world.conservesMobileGpu = false;
  assert.equal(world.startArcadeGame('allowed', () => {}), true);
  assert.equal(created, 1); assert.equal(mounted, 1); assert.equal(world.keys.size, 0);
  world.setArcadeLocked(true, 'zh-TW');
  assert.equal(stopped, 1); assert.equal(world.arcadeSession, undefined);
});


test('only a verified browser entitlement unlocks before release and redemption preserves the next manual Play gesture',()=>{
 const desktop=releaseApp();desktop.app.openArcadeGame();assert.equal(desktop.app.arcadeLockedViewing,true);
 desktop.app.arcadePreview.state.unlocked=true;desktop.app.syncArcadeRelease();
 assert.equal(desktop.calls.gameCloses,1);assert.deepEqual(desktop.calls.starts,[],'redemption itself cannot launch a game');
 desktop.app.openArcadeGame();assert.deepEqual(desktop.calls.starts,['embedded-live-game']);
 const mobile=releaseApp({mobile:true});mobile.app.arcadePreview.state.unlocked=true;mobile.app.syncArcadeRelease();
 assert.deepEqual(mobile.calls.popups,[]);mobile.app.openArcadeGame();assert.deepEqual(mobile.calls.popups,[['standalone-live-game','M.O.T.H']]);
 const other=releaseApp();other.app.openArcadeGame();assert.equal(other.app.arcadeLockedViewing,true,'another browser retains its locked entry');
});
