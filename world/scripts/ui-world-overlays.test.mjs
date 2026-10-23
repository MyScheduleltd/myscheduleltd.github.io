import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const compiled = await build({ stdin: { contents: "export * from './src/ui/FloatingChat';export * from './src/ui/OverlayPreferences';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const helpers = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const { boundChatRect, readChatRect, installFloatingChat, CHAT_LAYOUT_KEY, readDesktopActions, saveDesktopActions, DESKTOP_ACTIONS_KEY, dropBeatAction, drinkStatusText } = helpers;

test('saved chat geometry stays bounded on desktop, phone, landscape and an on-screen keyboard viewport', () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 402, height: 874 }, { width: 874, height: 402 }, { width: 402, height: 280, top: 110 }, { width: 320, height: 90 }]) {
    for (const rect of [{ left: -900, top: -300, width: 9000, height: 9000 }, { left: 5000, top: 6000, width: 200, height: 200 }]) {
      const result = boundChatRect(rect, viewport);
      assert.ok(result.left >= (viewport.left ?? 0)); assert.ok(result.top >= (viewport.top ?? 0));
      assert.ok(result.left + result.width <= (viewport.left ?? 0) + viewport.width); assert.ok(result.top + result.height <= (viewport.top ?? 0) + viewport.height);
    }
    const stored = { getItem(key) { assert.equal(key, CHAT_LAYOUT_KEY); return JSON.stringify({ left: 60, top: 90, width: 500, height: 450 }); } };
    assert.deepEqual(readChatRect(stored, viewport), boundChatRect({ left: 60, top: 90, width: 500, height: 450 }, viewport));
  }
  const denied = { getItem() { throw Error('denied'); } }; assert.doesNotThrow(() => readChatRect(denied, { width: 402, height: 700 }));
  for (const bad of ['{broken', '{"left":null}', '{"left":"1","top":3,"width":4,"height":5}']) assert.ok(Number.isFinite(readChatRect({ getItem: () => bad }, { width: 402, height: 700 }).width));
});

test('desktop actions are explicitly opted into locally and remain usable when storage is denied', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(readDesktopActions(storage), false); saveDesktopActions(true, storage); assert.deepEqual([...values], [[DESKTOP_ACTIONS_KEY, '1']]);
  assert.equal(readDesktopActions(storage), true); saveDesktopActions(false, storage); assert.equal(readDesktopActions(storage), false);
  assert.equal(readDesktopActions({ getItem() { throw Error('denied'); } }), false);
  assert.doesNotThrow(() => saveDesktopActions(true, { setItem() { throw Error('denied'); } }));
});

test('real chat pointer/keyboard handles save bounded geometry, restore after a temporary keyboard viewport and remove listeners on close', () => {
  const values = new Map(), windowEvents = new Map(), viewportEvents = new Map();
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  globalThis.window = { innerWidth: 1280, innerHeight: 800, visualViewport: { width: 1280, height: 800, offsetLeft: 0, offsetTop: 0, addEventListener: (key, handler) => viewportEvents.set(key, handler), removeEventListener: key => viewportEvents.delete(key) }, addEventListener: (key, handler) => windowEvents.set(key, handler), removeEventListener: key => windowEvents.delete(key) };
  const element = () => ({ dataset: {}, attributes: {}, handlers: new Map(), setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(key, handler) { this.handlers.set(key, handler); }, removeEventListener(key) { this.handlers.delete(key); }, setPointerCapture() {}, remove() { this.removed = true; } });
  const header = element(), handle = element(); globalThis.document = { createElement: () => handle };
  const style = { removeProperty(key) { delete this[key.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())]; } }, classes = new Set();
  const panel = { style, querySelector: () => header, append() {}, classList: { add: key => classes.add(key), remove: key => classes.delete(key) } };
  const dispose = installFloatingChat(panel, false); const originalHeight = parseFloat(style.height); assert.equal(style.maxHeight, 'none', 'the floating viewport solver replaces the legacy phone sheet height cap');
  assert.ok(!handle.textContent, 'the resize grip contains no text that a phone can substitute with an emoji');
  assert.equal(handle.attributes['aria-label'], 'Resize chat window; use arrow keys');
  window.visualViewport.height = 280; viewportEvents.get('resize')(); assert.ok(parseFloat(style.height) <= 256);
  window.visualViewport.height = 800; viewportEvents.get('resize')(); assert.equal(parseFloat(style.height), originalHeight);
  const pointer = (currentTarget, x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, currentTarget, preventDefault() {}, stopPropagation() {} });
  header.handlers.get('pointerdown')(pointer(header, 100, 100)); header.handlers.get('pointermove')(pointer(header, 3000, -1000)); header.handlers.get('pointerup')();
  assert.ok(parseFloat(style.left) + parseFloat(style.width) <= 1280); assert.equal(parseFloat(style.top), 12);
  assert.ok(values.has(CHAT_LAYOUT_KEY));
  handle.handlers.get('keydown')({ key: 'ArrowLeft', shiftKey: true, currentTarget: handle, preventDefault() {}, stopPropagation() {} });
  assert.equal(JSON.parse(values.get(CHAT_LAYOUT_KEY)).width, 530);
  const beforeResize={width:parseFloat(style.width),height:parseFloat(style.height)};
  handle.handlers.get('pointerdown')(pointer(handle,100,100));handle.handlers.get('pointermove')(pointer(handle,120,90));handle.handlers.get('pointerup')();
  assert.equal(parseFloat(style.width),beforeResize.width+20);assert.equal(parseFloat(style.height),beforeResize.height-10);
  assert.equal(JSON.parse(values.get(CHAT_LAYOUT_KEY)).width,beforeResize.width+20,'the drawn grip preserves captured-pointer resize persistence');
  dispose(); assert.equal(header.handlers.size, 0); assert.equal(handle.handlers.size, 0); assert.equal(windowEvents.size, 0); assert.equal(viewportEvents.size, 0); assert.equal(handle.removed, true); assert.equal(style.width, undefined); assert.equal(style.maxHeight, undefined);
});

test('DROP THE BEAT in the PASS menu: says when nothing is on, points outdoors in venues, does nothing when heard, starts the sound otherwise', () => {
  assert.equal(dropBeatAction({ recordOn: false, silentHere: false, audible: false }), 'no-music');
  assert.equal(dropBeatAction({ recordOn: false, silentHere: true, audible: true }), 'no-music', 'no record outranks everything');
  assert.equal(dropBeatAction({ recordOn: true, silentHere: true, audible: false }), 'outdoors-only', 'a theatre, the club, the deck or a film on a phone');
  assert.equal(dropBeatAction({ recordOn: true, silentHere: false, audible: true }), 'already-playing');
  assert.equal(dropBeatAction({ recordOn: true, silentHere: false, audible: false }), 'start');
});

const source = await readFile('src/ui/App.ts', 'utf8'), tree = ts.createSourceFile('App.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'App');
const methods = ['syncDrinkStatus', 'syncMenuCapture', 'hideSeatMenu', 'prepareSeatMenu', 'globalShortcut', 'dropTheBeat', 'jukeboxMessage', 'usesSingleFilmPlayer', 'preparePhoneFilmPlayback', 'stopJukebox', 'renderScreen', 'releaseVenueFilmFrame'].map(name => {
  const method = app.members.find(node => node.name?.getText(tree) === name); assert.ok(method, name); return method.getText(tree);
}).join('\n');
const script = ts.transpileModule(`class OverlayHarness { ${methods} }; globalThis.OverlayHarness=OverlayHarness;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const globals = { URL, drinkStatusText, dropBeatAction, DEFAULT_JUKEBOX_VOLUME: .4, JUKEBOX_VOLUME_KEY: 'jukebox-volume', performance: { now: () => 0 }, window: { location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1', href: 'http://127.0.0.1/beta/' } } };
runInNewContext(script, globals); const { OverlayHarness } = globals;
const fixture = () => {
  const menu = { dataset: { menuOwner: 'npc' }, hidden: false, classList: { remove() {} }, removeAttribute() {} }, badge = { hidden: true, textContent: '' }, pass = { hidden: true }, prompt = { hidden: false };
  const root = { dataset: {}, querySelector: selector => ({ '#seat-menu': menu, '#drink-status': badge, '#festival-pass': pass })[selector] };
  const calls = [], ui = new OverlayHarness(); Object.assign(ui, { root, world: { closeNpcDialogue() { calls.push('close-dialogue'); }, setMenuOpen(value) { calls.push(['menu', value]); } }, language: 'en', drinkCount: 4, jukeboxVolume: .5, audioMuted: false, jukeboxSilenced: false, jukeboxPlayingId: 'song', jukeboxPromptGeneration: 1 });
  return { ui, menu, badge, calls, prompt };
};

test('the actual App keeps drink status separate from transient alerts and releases dialogue camera on close, replacement and Escape', () => {
  const { ui, menu, badge, calls } = fixture(); ui.syncDrinkStatus(); assert.equal(badge.hidden, false); assert.equal(badge.textContent, '4 DRINKS');
  ui.syncDrinkStatus(); assert.equal(badge.textContent, '4 DRINKS'); ui.drinkCount = 0; ui.syncDrinkStatus(); assert.equal(badge.hidden, true);
  ui.syncMenuCapture(); assert.equal(calls.at(-1)[1], true);
  ui.hideSeatMenu(); assert.equal(menu.hidden, true); assert.equal(menu.dataset.menuOwner, undefined); assert.equal(calls.at(-1)[1], false);
  menu.dataset.menuOwner = 'npc'; ui.prepareSeatMenu(menu, 'screening'); assert.equal(menu.dataset.menuOwner, 'screening'); assert.equal(calls.at(-1), 'close-dialogue');
  menu.dataset.menuOwner = 'npc'; menu.hidden = false; let prevented = false;
  ui.globalShortcut({ key: 'Escape', preventDefault() { prevented = true; } }); assert.equal(prevented, true); assert.equal(menu.hidden, true); assert.equal(calls.at(-1)[1], false);
});

test('the actual jukebox message path requires real playing state as well as unmuted volume', () => {
  const { ui, prompt } = fixture(), frameWindow = {}; ui.jukeboxFrame = { contentWindow: frameWindow }; ui.jukeboxReportedDurations = new Map();
  ui.jukeboxMessage({ source: frameWindow, data: JSON.stringify({ event: 'infoDelivery', info: { muted: false, volume: 50, playerState: 3 } }) });
  assert.equal(ui.jukeboxReportedState, 3); assert.equal(ui.jukeboxReportedMuted, false);
  ui.jukeboxMessage({ source: frameWindow, data: JSON.stringify({ event: 'onStateChange', info: 1 }) });
  assert.equal(ui.jukeboxReportedState, 1);
});

test('the actual DROP THE BEAT: no record says so, a venue points outdoors, a heard record is left alone, a muted visitor gets sound', () => {
  globals.window.setTimeout = () => 0; globals.window.localStorage = { setItem() {} };
  const run = (state) => {
    const { ui } = fixture(), calls = [];
    Object.assign(ui, { networkState: { jukebox: { nowPlaying: state.record ? { youtubeId: 'abcdefghijk' } : null } }, audioMuted: Boolean(state.muted), jukeboxVolume: state.volume ?? .5,
      jukeboxSilentHere: Boolean(state.silentHere), jukeboxReportedMuted: state.audible ? false : true, jukeboxReportedVolume: state.audible ? 50 : 0, jukeboxReportedState: state.audible ? 1 : 2,
      setFestivalMuted(muted) { calls.push(['muted', muted]); this.audioMuted = muted; }, syncAudioResumeUi() {}, syncJukebox() { calls.push('sync'); }, closeFestivalPass() { calls.push('close'); },
      showWorldAlert(text) { calls.push(['alert', text]); }, applyJukeboxVolume() { calls.push('apply'); } });
    ui.world = { ...ui.world, audio: { start: () => Promise.resolve() } };
    ui.dropTheBeat(); return { calls, ui };
  };
  assert.deepEqual(run({ record: false }).calls, ['sync', 'close', ['alert', 'THERE IS NO MUSIC CURRENTLY PLAYING IN THE JUKEBOX']]);
  assert.deepEqual(run({ record: true, silentHere: true }).calls, ['sync', 'close', ['alert', 'THE JUKEBOX PLAYS OUTDOORS · STEP OUTSIDE TO HEAR IT']]);
  assert.deepEqual(run({ record: true, audible: true }).calls, ['sync'], 'already heard: nothing happens');
  const quiet = run({ record: true });
  assert.deepEqual(quiet.calls, ['sync', 'close', 'apply'], 'heard nothing: the press starts the sound');
  const muted = run({ record: true, muted: true, volume: 0 });
  assert.deepEqual(muted.calls.slice(0, 2), [['muted', false], 'sync'], 'a muted visitor has the festival sound turned on first');
  assert.equal(muted.ui.jukeboxVolume, .4, 'a jukebox slider left at nothing comes back to its default');
  delete globals.window.setTimeout; delete globals.window.localStorage;
});

test('the actual phone film handoff stops and blanks its record synchronously while desktop retains playback', () => {
 const {ui}=fixture(),events=[];
 globals.window.matchMedia=()=>({matches:true});globals.window.setTimeout=()=>0;globals.window.removeEventListener=()=>{};
 const frame={style:{},contentWindow:{postMessage:message=>events.push(JSON.parse(message).func)},addEventListener(){},remove(){}};
 Object.defineProperty(frame,'src',{set(value){events.push(value);}});ui.jukeboxFrame=frame;
 ui.preparePhoneFilmPlayback();
 assert.deepEqual(events,['stopVideo','mute','about:blank']);assert.equal(ui.jukeboxFrame,undefined);assert.equal(ui.jukeboxSilenced,true);
 const desktop=fixture().ui;globals.window.matchMedia=()=>({matches:false});desktop.jukeboxFrame=frame;desktop.preparePhoneFilmPlayback();
 assert.equal(desktop.jukeboxFrame,frame);assert.equal(desktop.jukeboxSilenced,false);assert.equal(events.length,3);
 delete globals.window.matchMedia;
});

test('actual film-to-film replacement stops and blanks the previous decoder before the next iframe is inserted', () => {
 for(const phone of [false,true]){
  const events=[],ui=new OverlayHarness();globals.window.matchMedia=()=>({matches:phone});
  const old={contentWindow:{postMessage:message=>events.push(JSON.parse(message).func)}};
  Object.defineProperty(old,'src',{set(value){events.push(value);}});
  let frames=[old];
  const frame={querySelectorAll:()=>frames};Object.defineProperty(frame,'innerHTML',{set(value){events.push(value?'insert-next':'clear-old');frames=[];}});
  const screen={classList:{toggle(){}}},actions={querySelector:()=>null};
  const root={querySelector:selector=>({'#venue-screen':screen,'#screen-frame':frame,'#screen-mode':{},'#screen-title':{},'#screen-actions':actions,'.world-shell':{setAttribute(){}}})[selector]};
  Object.assign(ui,{root,language:'en',audioMuted:false,world:{setExternalFilmPlayback(value){events.push(['external',value]);}},
   preparePhoneFilmPlayback(){if(phone)events.push('stop-jukebox');},escapeAttribute:value=>value,filmTitle:film=>film.title});
  ui.renderScreen({title:'Next film',embedUrl:'https://www.youtube.com/embed/abcdefghijk',youtubeId:'abcdefghijk'},'private',12,false);
  assert.deepEqual(events.slice(-4),['stopVideo','about:blank','clear-old','insert-next']);
  if(phone)assert.deepEqual(events.slice(0,2),['stop-jukebox',['external',true]],'both other phone players yield before the new personal film');
 }
 delete globals.window.matchMedia;
});

test('the offering preparation copy matches the notice without any-device or sharing promises',()=>{
 const copy=source.split("[data-arcade-preparation]").at(-1).split('.catch')[0];
 assert.doesNotMatch(copy,/任何裝置都能用|on any device|分享給朋友|share it/i);
 assert.match(copy,/請抄下保存/);assert.match(copy,/keep a copy/);
});
