import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// A recording stand-in for Web Audio: every node, every gain target, every
// source started. Nothing here plays; it is the levels that are under test.
let now = 1_000;
Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
const fetched = [];
let coarsePointer = false;
globalThis.window = {
  location: { hostname: '127.0.0.1', href: 'http://127.0.0.1:4183/' },
  matchMedia: () => ({ matches: coarsePointer }),
};
const fileOf = new WeakMap();
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  const bytes = new ArrayBuffer(16);
  fileOf.set(bytes, String(url));
  return { ok: true, status: 200, body: null, headers: new Map(), arrayBuffer: async () => bytes };
};
class Param {
  constructor(value) { this.value = value; this.target = value; }
  setTargetAtTime(value) { this.target = value; }
}
class AudioNode { connect(node) { this.output = node; return node; } disconnect() { this.output = undefined; } }
class Gain extends AudioNode { gain = new Param(1); }
class Filter extends AudioNode { type = ''; Q = new Param(1); frequency = new Param(350); }
class Source extends AudioNode {
  constructor(context) { super(); this.context = context; this.loop = false; this.loopStart = 0; this.loopEnd = 0; this.playbackRate = new Param(1); }
  start(when = 0, offset = 0) { this.started = { when, offset }; this.context.started.push(this); }
  stop() { this.stopped = true; }
}
const decoded = (url) => {
  const name = url.split('/').pop();
  const duration = /^weather-/.test(name) ? 17 : /snow-brush/.test(name) ? .52 : /punch/.test(name) ? .415 : /step-snow/.test(name) ? .48 : /night|ocean/.test(name) ? 46 : /day/.test(name) ? 61 : /skate/.test(name) ? 6.4 : .08;
  return { url, duration, numberOfChannels: /^weather-|step-snow|snow-brush|punch|-mono/.test(name) ? 1 : 2, length: Math.round(duration * 48_000) };
};
let decodeAudio = url => Promise.resolve(decoded(url));
globalThis.OfflineAudioContext = class { decodeAudioData(bytes) { return decodeAudio(fileOf.get(bytes)); } };
const contexts = [];
globalThis.AudioContext = class {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.started = []; contexts.push(this); }
  createGain() { return new Gain(); }
  createBiquadFilter() { return new Filter(); }
  createBufferSource() { return new Source(this); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
};

const source = new URL('../src/world/AmbientAudio.ts', import.meta.url);
const bundle = await build({
  stdin: {
    contents: "export * from './src/world/AmbientAudio'; export * from './src/ui/InterfaceSounds'; export { nightAmountAt } from './src/world/DayNightCycle'; export { distanceToWater, setIslandTerrain, ISLAND_COVE } from './src/world/CoastalTerrain'; export { plantedFoot } from './src/world/CoastalPose';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  // The asset URLs resolve against the module's own file, as Vite resolves them.
  define: { 'import.meta.url': JSON.stringify(pathToFileURL(source.pathname).href) },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { AmbientAudio, installInterfaceSounds, nightAmountAt, distanceToWater, setIslandTerrain, ISLAND_COVE, plantedFoot } =
  await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const graph = (context) => {
  const bySource = (name) => context.started.find((s) => s.buffer?.url?.includes(name));
  return { bySource };
};

test('recorded fireworks load lazily, obey ambient/master mute, and keep at most three live voices', async () => {
  const audio = new AmbientAudio();
  await audio.start(false);
  audio.setAmbientMix({ night: 1, ocean: 0, outdoors: 1 });
  audio.playFireworkCue('peony');
  assert.equal(audio.snapshot().fireworks.played, 0, 'no stale sound queued before decoding');
  await audio.prepareFireworks();
  assert.equal(audio.snapshot().fireworks.ready, 3);
  const context = contexts.at(-1);
  for (const pattern of ['willow', 'ring', 'peony', 'comet']) audio.playFireworkCue(pattern);
  assert.equal(audio.snapshot().fireworks.playing, 3);
  assert.equal(audio.snapshot().fireworks.played, 4);
  const voices = context.started.filter(source => /fireworks-/.test(source.buffer?.url));
  assert.equal(voices.length, 4);
  assert.equal(voices[0].stopped, true, 'oldest voice is removed at the limit');
  assert.equal(voices[1].output.type, 'lowpass', 'same outdoor muffle and ambient bus as the recording beds');
  audio.setMuted(true); audio.playFireworkCue('willow');
  audio.setMuted(false); audio.setAmbientVolume(0); audio.playFireworkCue('willow');
  audio.setAmbientVolume(.3); audio.setMasterVolume(0); audio.playFireworkCue('willow');
  assert.equal(audio.snapshot().fireworks.played, 4);
  audio.stopFireworks();
  assert.equal(audio.snapshot().fireworks.playing, 0);
  assert.ok(voices.every(source => source.stopped));
  audio.setMasterVolume(.7); audio.setAmbientMix(undefined); audio.playFireworkCue('ring');
  assert.equal(audio.snapshot().fireworks.played, 4, 'cannot play after leaving the world');
});

test('night follows the light: day until sunset, night through blue hour, day again over dawn', () => {
  for (const minute of [5, 12, 20, 24.9]) assert.equal(nightAmountAt(minute), 0, `minute ${minute}`);
  for (const minute of [35, 45, 59.9]) assert.equal(nightAmountAt(minute), 1, `minute ${minute}`);
  assert.equal(nightAmountAt(30), 0.5);
  assert.equal(nightAmountAt(2.5), 0.5);
  assert.equal(nightAmountAt(0), 1, 'midnight carries on from the end of the cycle');
  let previous = -1;
  for (let minute = 25; minute <= 35; minute += 0.5) {
    assert.ok(nightAmountAt(minute) >= previous, 'dusk never turns back toward day');
    previous = nightAmountAt(minute);
  }
});

test('the sea is close at the landing and far from the middle of the island', () => {
  setIslandTerrain(true);
  try {
    assert.equal(distanceToWater(0, ISLAND_COVE.z + 10), 0, 'in the harbour');
    assert.ok(distanceToWater(0, ISLAND_COVE.z - 6) <= 8, 'just inside the gate, by the landing');
    assert.ok(distanceToWater(0, 3) > 36, 'MY SQUARE is inland');
  } finally {
    setIslandTerrain(false);
  }
});

test('the beds loop inside their padding, start silent, and follow the mix', async () => {
  fetched.length = 0;
  const audio = new AmbientAudio();
  await audio.start(false);
  const context = contexts.at(-1);
  await audio.preloadWorldSounds();
  assert.ok(audio.worldSoundsReady());
  assert.deepEqual(fetched.map((url) => url.split('/').pop()).sort(), [
    'ambience-day.mp3', 'ambience-night.mp3', 'ambience-ocean.mp3',
    'avatar-drink.wav', 'avatar-eat-popcorn.wav', 'avatar-punch.wav', 'avatar-skate.mp3', 'avatar-snow-brush.wav', 'avatar-step-left.wav', 'avatar-step-right.wav',
    'avatar-step-snow-left.wav', 'avatar-step-snow-right.wav',
    // The fireworks' bursts load with the world, so a show never waits on a download.
    'fireworks-peony.mp3', 'fireworks-ring.mp3', 'fireworks-willow.mp3',
    'ui-click.wav', 'ui-hover.wav',
    'weather-rain-mono.mp3', 'weather-snow-mono.mp3',
  ]);
  const { bySource } = graph(context);
  const day = bySource('ambience-day'), night = bySource('ambience-night'), ocean = bySource('ambience-ocean');
  for (const [bed, end] of [[day, 60.5], [night, 45.5], [ocean, 45.5]]) {
    assert.equal(bed.loop, true);
    assert.equal(bed.loopStart, 0.5);
    assert.equal(bed.loopEnd, end);
    assert.ok(bed.started.offset >= 0.5 && bed.started.offset <= end, 'starts somewhere inside the loop');
    assert.equal(bed.output.gain.target, 0, 'silent until the world says where the visitor is');
  }

  audio.setAmbientMix({ night: 0, ocean: 0, outdoors: 1 });
  assert.equal(day.output.gain.target, 0.9);
  assert.equal(night.output.gain.target, 0);
  assert.equal(ocean.output.gain.target, 0);

  audio.setAmbientMix({ night: 0.5, ocean: 0, outdoors: 1 });
  const dayLevel = day.output.gain.target / 0.9, nightLevel = night.output.gain.target / 0.8;
  assert.ok(Math.abs(dayLevel ** 2 + nightLevel ** 2 - 1) < 1e-9, 'equal power through dusk');

  audio.setAmbientMix({ night: 1, ocean: 1, outdoors: 1 });
  assert.ok(day.output.gain.target < 1e-9);
  assert.equal(ocean.output.gain.target, 1.1);
  assert.ok(Math.abs(night.output.gain.target - 0.8 * 0.7) < 1e-9, 'waves cover some of the land at the water');

  const muffle = day.output.output, walls = muffle.output;
  assert.equal(walls.gain.target, 1);
  assert.ok(muffle.frequency.target > 19_000, 'open air outdoors');
  audio.setAmbientMix({ night: 0, ocean: 0, outdoors: 0.1 });
  assert.equal(walls.gain.target, 0.1, 'indoors dials the outside down');
  assert.ok(muffle.frequency.target < 1_000, 'and muffles it');
  assert.equal(night.output.output, muffle, 'every bed goes through the walls');
  assert.equal(ocean.output.output, muffle);

  audio.setAmbientMix(undefined);
  for (const bed of [day, night, ocean]) assert.equal(bed.output.gain.target, 0, 'leaving the world fades the beds out');
});

test('phones decode mono copies of the beds', async () => {
  fetched.length = 0;
  coarsePointer = true;
  try {
    const audio = new AmbientAudio();
    await audio.preloadWorldSounds();
    assert.deepEqual(fetched.map((url) => url.split('/').pop()).filter((name) => name.startsWith('ambience')).sort(), ['ambience-day-mono.mp3', 'ambience-night-mono.mp3', 'ambience-ocean-mono.mp3']);
  } finally {
    coarsePointer = false;
  }
});

test('one failed sound cannot release admission while another fixed sound is still decoding, and retries only request missing buffers', async () => {
  const original = decodeAudio;
  try {
    for (const [failed, delayed] of [
      ['ambience-day.mp3', 'avatar-drink.wav'],
      ['fireworks-willow.mp3', 'fireworks-ring.mp3'],
      ['ui-click.wav', 'ui-hover.wav'],
      ['avatar-punch.wav', 'avatar-snow-brush.wav'],
    ]) {
      fetched.length = 0;
      let finish, done = false;
      decodeAudio = url => url.endsWith(failed) ? Promise.reject(new Error('Unavailable test sound'))
        : url.endsWith(delayed) ? new Promise(resolve => { finish = () => resolve(decoded(url)); })
          : original(url);
      const audio = new AmbientAudio(), first = audio.preloadWorldSounds();
      first.then(() => { done = true; });
      await settle();
      assert.equal(typeof finish, 'function', 'the delayed sound is actually being decoded');
      assert.equal(done, false, `${failed}: a different failure must not abandon pending fixed sounds`);
      assert.equal(audio.worldSoundsReady(), false);
      assert.equal(audio.preloadWorldSounds(), first, 'another ask shares the entire unsettled batch');
      const files = fetched.map(url => url.split('/').pop());
      assert.equal(files.length, 19);
      assert.equal(new Set(files).size, 19, 'no duplicated interface, firework, weather, action or world downloads');
      finish(); await first;
      assert.equal(done, true);
      assert.equal(audio.worldSoundsReady(), false, 'missing optional buffers are not reported ready');
      const beforeRetry = fetched.length;
      decodeAudio = original;
      await audio.preloadWorldSounds();
      assert.equal(audio.worldSoundsReady(), true);
      assert.deepEqual(fetched.slice(beforeRetry).map(url => url.split('/').pop()), [failed]);
    }
  } finally { decodeAudio = original; }
});

test('stalled native audio decoding has a bounded wait and cannot install its late buffer after admission', async () => {
  const originalDecode = decodeAudio, originalTimer = globalThis.setTimeout;
  let finish;
  // Exercise the production deadline quickly without changing download limits.
  globalThis.setTimeout = (callback, duration, ...args) => originalTimer(callback, duration === 30_000 ? 10 : duration, ...args);
  try {
    decodeAudio = url => url.endsWith('ui-hover.wav') ? new Promise(resolve => { finish = () => resolve(decoded(url)); }) : originalDecode(url);
    const audio = new AmbientAudio();
    await audio.preloadWorldSounds();
    assert.equal(audio.worldSoundsReady(), false);
    assert.equal(audio.snapshot().cuesReady, 1);
    finish(); await settle();
    assert.equal(audio.snapshot().cuesReady, 1, 'timed-out decode is never installed after the loading barrier');
    decodeAudio = originalDecode;
    await audio.preloadWorldSounds();
    assert.equal(audio.worldSoundsReady(), true, 'a fresh attempt can still recover the missing sound');
  } finally { decodeAudio = originalDecode; globalThis.setTimeout = originalTimer; }
});

test('interface sounds: their own volume, silent when muted, a hover never starts sound', async () => {
  const audio = new AmbientAudio();
  await audio.loadInterfaceSounds();
  const before = contexts.length;
  audio.playInterfaceSound('click');
  assert.equal(contexts.length, before, 'nothing to play through before a gesture');

  audio.setMuted(false);
  audio.unlock();
  const context = contexts.at(-1);
  context.state = 'suspended';
  audio.playInterfaceSound('hover');
  assert.equal(context.started.length, 0, 'a hover is not a gesture, so it cannot wake sound');
  audio.playInterfaceSound('click');
  assert.equal(context.started.length, 1, 'a click is, so it plays as sound wakes');
  context.state = 'running';

  now += 100;
  audio.playInterfaceSound('hover');
  audio.playInterfaceSound('hover');
  assert.equal(context.started.length, 2, 'a sweep across a menu is spaced out');

  const ui = context.started[0].output;
  audio.setInterfaceVolume(0.25);
  assert.equal(ui.gain.target, 0.25);
  assert.deepEqual(audio.volumes(), { master: 0.7, ambient: 0.28, screening: 0.85, ui: 0.25, avatar: 0.6 });

  now += 100;
  audio.setMuted(true);
  audio.playInterfaceSound('click');
  assert.equal(context.started.length, 2, 'muted means the menus too');
});

test('a foot sounds each time it is planted, left on whole cycles and right between', () => {
  const T = Math.PI * 2;
  assert.equal(plantedFoot(0.9 * T, 1.05 * T), 'left');
  assert.equal(plantedFoot(1.4 * T, 1.55 * T), 'right');
  assert.equal(plantedFoot(1.1 * T, 1.3 * T), undefined, 'mid-stride');
  assert.equal(plantedFoot(1.05 * T, 0.95 * T), 'left', 'backing up still plants the same foot');
  assert.equal(plantedFoot(1.6 * T, 1.45 * T), 'right');
  assert.equal(plantedFoot(-0.05 * T, 0.02 * T), 'left', 'either side of zero');
  assert.equal(plantedFoot(0.2 * T, 3.4 * T), undefined, 'a jump across the map is not a step');
});

test("the avatar's sounds: steps vary a little, bites and sips land late, the board glides, own volume", async () => {
  fetched.length = 0;
  const audio = new AmbientAudio();
  await audio.start(false);
  const context = contexts.at(-1);
  await audio.preloadWorldSounds();
  const skate = context.started.find((s) => s.buffer?.url?.includes('avatar-skate'));
  assert.equal(skate.loop, true);
  assert.equal(skate.loopStart, 0.5);
  assert.equal(skate.loopEnd, 5.9);
  assert.equal(skate.output.gain.value, 0, 'the board is silent until it rolls');
  audio.setSkating(true);
  assert.equal(skate.output.gain.target, 0.75);
  audio.setSkating(false);
  assert.equal(skate.output.gain.target, 0);
  const day = context.started.find((s) => s.buffer?.url?.includes('ambience-day'));
  const master = day.output.output.output.output.output;
  assert.equal(skate.output.output.output, master, 'never muffled: board, avatar channel, master');

  const played = () => context.started.filter((s) => /avatar-(step|eat|drink)/.test(s.buffer?.url ?? ''));
  for (const r of [0, 1]) {
    audio.random = () => r;
    audio.playAvatarSound('step-left');
  }
  const [low, high] = played();
  assert.ok(Math.abs(low.playbackRate.value - 0.97) < 1e-9 && Math.abs(high.playbackRate.value - 1.03) < 1e-9, 'within ±3% pitch');
  assert.ok(high.output.gain.value < low.output.gain.value, 'and a little in level');

  context.currentTime = 10;
  audio.playAvatarSound('drink', 0.45);
  audio.playAvatarSound('eat', 0.6);
  const [, , drink, eat] = played();
  assert.equal(drink.started.when, 10.45);
  assert.equal(eat.started.when, 10.6);
  assert.equal(drink.playbackRate.value, 1, 'only the steps vary');

  audio.setAvatarVolume(0.2);
  assert.equal(audio.volumes().avatar, 0.2);
  assert.equal(eat.output.output.gain.target, 0.2, 'its own slider');

  const before = played().length;
  context.state = 'suspended';
  audio.playAvatarSound('step-right');
  context.state = 'running';
  audio.setMuted(true);
  audio.playAvatarSound('step-right');
  assert.equal(played().length, before, 'never late and never while muted');
});

test('recorded brushing and punch cues preload at admission and use only the existing character/master graph', async()=>{
  fetched.length=0;
  const contextsBefore=contexts.length,audio=new AmbientAudio();await audio.start(false);
  const context=contexts.at(-1),startedBefore=context.started.length;
  audio.playAvatarSound('snow-brush');audio.playAvatarSound('punch');
  assert.equal(context.started.length,startedBefore,'actions before decoding are dropped rather than queued');
  assert.equal(fetched.length,0,'pressing an action can never start a late download');
  await audio.preloadWorldSounds();const fetches=fetched.length;
  assert.equal(audio.worldSoundsReady(),true);assert.equal(audio.snapshot().avatarReady,7);
  audio.setAmbientMix({night:0,ocean:0,outdoors:.1,snow:1,snowFootsteps:true});
  context.currentTime=12;
  audio.playAvatarSound('snow-brush');audio.playAvatarSound('punch',.02);
  const [brush,punch]=context.started.slice(-2);
  assert.ok(brush.buffer.url.endsWith('avatar-snow-brush.wav'));assert.ok(punch.buffer.url.endsWith('avatar-punch.wav'));
  assert.equal(brush.buffer.duration,.52);assert.equal(punch.buffer.duration,.415);
  assert.equal(brush.started.when,12);assert.equal(punch.started.when,12.02);
  assert.equal(brush.playbackRate.value,1);assert.equal(punch.playbackRate.value,1);
  assert.equal(brush.output.gain.value,.75);assert.equal(punch.output.gain.value,.9);
  const brushLevel=brush.output,character=brushLevel.output,master=character.output;
  assert.equal(punch.output.output,character);assert.equal(master.output,context.destination,'no outdoors lowpass on character actions');
  audio.setAvatarVolume(.25);audio.setMasterVolume(.5);
  assert.equal(character.gain.target,.25);assert.equal(master.gain.target,.5);
  audio.setAvatarVolume(0);assert.equal(character.gain.target,0);
  audio.setAvatarVolume(.25);audio.setMasterVolume(0);assert.equal(master.gain.target,0);
  audio.setMasterVolume(.5);audio.setMuted(true);
  const played=context.started.length;audio.playAvatarSound('snow-brush');audio.playAvatarSound('punch');
  audio.setMuted(false);context.state='suspended';audio.playAvatarSound('snow-brush');audio.playAvatarSound('punch');
  assert.equal(context.started.length,played,'muted or suspended actions never queue a stale impact');
  assert.equal(fetched.length,fetches);assert.equal(contexts.length,contextsBefore+1);
  brush.onended();assert.equal(brush.output,undefined);assert.equal(brushLevel.output,undefined);
  audio.dispose();assert.equal(audio.snapshot().avatarReady,0);
});

// The smallest DOM the listener needs: elements that know whether they are a
// control, a disabled one, or inside something inert.
class Element {
  constructor({ control = true, disabled = false, inert = false, select = false } = {}) { Object.assign(this, { control, disabled, inert, select }); }
  closest(selector) {
    if (selector === '[inert], [hidden]') return this.inert ? this : null;
    if (this.select) return selector.includes('select') ? this : null;
    return this.control ? this : null;
  }
  matches() { return this.disabled; }
}
globalThis.Element = Element;
globalThis.HTMLElement = Element;
globalThis.HTMLSelectElement = class extends Element { constructor() { super({ select: true }); } };

test('the menus click and hover from one delegated listener', async () => {
  const listeners = {};
  const root = {
    addEventListener: (type, listener) => { (listeners[type] ??= []).push(listener); },
    removeEventListener: (type, listener) => { listeners[type] = listeners[type].filter((l) => l !== listener); },
  };
  const fire = (type, event) => { for (const listener of listeners[type] ?? []) listener(event); };
  const played = [];
  let unlocked = 0;
  const audio = { playInterfaceSound: (kind) => played.push(kind), unlock: () => { unlocked++; } };
  const remove = installInterfaceSounds(audio, root);

  const button = new Element(), other = new Element(), blank = new Element({ control: false });
  fire('pointerover', { pointerType: 'mouse', target: button });
  fire('pointerover', { pointerType: 'mouse', target: button });
  assert.deepEqual(played, ['hover'], 'once per control entered, not per child crossed');
  fire('pointerover', { pointerType: 'mouse', target: other });
  fire('pointerover', { pointerType: 'mouse', target: blank });
  fire('pointerover', { pointerType: 'mouse', target: other });
  assert.deepEqual(played, ['hover', 'hover', 'hover']);
  fire('pointerover', { pointerType: 'touch', target: button });
  assert.equal(played.length, 3, 'a tap has no hover');
  fire('pointerover', { pointerType: 'mouse', target: new Element({ disabled: true }) });
  fire('pointerover', { pointerType: 'mouse', target: new Element({ inert: true }) });
  assert.equal(played.length, 3, 'disabled and inert controls stay quiet');

  played.length = 0;
  fire('pointerdown', { target: button });
  assert.equal(unlocked, 1, 'every gesture offers to start sound');
  fire('click', { target: button });
  fire('click', { target: blank });
  assert.deepEqual(played, ['click']);
  fire('focusin', { target: other });
  assert.deepEqual(played, ['click'], 'focus that follows a press is the press');

  now += 1_000;
  fire('focusin', { target: button });
  assert.deepEqual(played, ['click', 'hover'], 'a keyboard or controller walking the menu');
  fire('change', { target: new globalThis.HTMLSelectElement() });
  assert.deepEqual(played, ['click', 'hover', 'click'], 'choosing from a list box');

  remove();
  fire('click', { target: button });
  assert.equal(played.length, 3);
  await settle();
});

test('weather is fully preloaded into the existing graph, crossfades with land beds and passes through the same walls and volume controls', async () => {
  fetched.length = 0;
  const audio = new AmbientAudio();
  const contextCount = contexts.length;
  await audio.preloadWorldSounds();
  assert.equal(contexts.length, contextCount, 'the sign-in decode uses the existing offline decoder, never another running AudioContext');
  await audio.start(false);
  const context = contexts.at(-1), before = fetched.length;
  const { bySource } = graph(context);
  const rain = bySource('weather-rain'), snow = bySource('weather-snow'), day = bySource('ambience-day');
  for (const bed of [rain, snow]) {
    assert.equal(bed.buffer.numberOfChannels, 1); assert.equal(bed.loopStart, .5); assert.equal(bed.loopEnd, 16.5);
    assert.equal(bed.output.gain.target, 0); assert.equal(bed.output.output, day.output.output, 'weather uses the same low-pass/walls chain');
  }
  audio.setAmbientMix({ night: 0, ocean: 0, outdoors: 1, rain: 1 });
  assert.equal(rain.output.gain.target, .85); assert.equal(snow.output.gain.target, 0);
  assert.ok(Math.abs(day.output.gain.target - .9 * .58) < 1e-9, 'rain gently covers the promenade');
  audio.setAmbientMix({ night: 0, ocean: 0, outdoors: .1, snow: 1, snowFootsteps: true });
  assert.equal(rain.output.gain.target, 0); assert.equal(snow.output.gain.target, .65);
  assert.equal(snow.output.output.output.gain.target, .1); assert.ok(snow.output.output.frequency.target < 1000);
  const sharedAmbient = snow.output.output.output.output;
  audio.setAmbientVolume(.19); assert.equal(sharedAmbient.gain.target, .19);
  audio.setMuted(true); assert.equal(sharedAmbient.output.gain.target, 0, 'master mute reaches the weather');
  audio.setMuted(false); audio.setAmbientMix({ night: 1, ocean: 0, outdoors: 1, rain: 1, snow: 1 });
  assert.equal(rain.output.gain.target, .425); assert.equal(snow.output.gain.target, .325, 'overlapping weather weights cannot double full beds');
  audio.setAmbientMix(undefined);
  assert.equal(rain.output.gain.target, 0); assert.equal(snow.output.gain.target, 0);
  assert.equal(fetched.length, before, 'weather changes never request another asset');
  assert.equal(contexts.length, contextCount + 1, 'one gesture creates only the original shared playback context');
  assert.ok(audio.snapshot().weather.decodedBytes < 8 * 1048576);
});

test('snow plants replace only footsteps on snow and retain the character slider, pitch variation and suspension behavior', async () => {
  const audio = new AmbientAudio(); await audio.start(false); await audio.preloadWorldSounds();
  const context = contexts.at(-1), count = fetched.length;
  audio.random = () => 0;
  audio.setAmbientMix({ night: 0, ocean: 0, outdoors: 1, snow: 1, snowFootsteps: true });
  audio.playAvatarSound('step-left'); audio.playAvatarSound('step-right'); audio.playAvatarSound('drink');
  const last = context.started.slice(-3);
  assert.ok(last[0].buffer.url.endsWith('avatar-step-snow-left.wav'));
  assert.ok(last[1].buffer.url.endsWith('avatar-step-snow-right.wav'));
  assert.ok(last[2].buffer.url.endsWith('avatar-drink.wav'));
  assert.equal(last[0].playbackRate.value, .97);
  audio.setAvatarVolume(.24); assert.equal(last[0].output.output.gain.target, .24);
  audio.setAmbientMix({ night: 0, ocean: 0, outdoors: .1, snow: 1, snowFootsteps: false });
  audio.playAvatarSound('step-left'); assert.ok(context.started.at(-1).buffer.url.endsWith('avatar-step-left.wav'));
  context.state = 'suspended'; const played = context.started.length; audio.playAvatarSound('step-right'); assert.equal(context.started.length, played);
  assert.equal(fetched.length, count);
});

test('weather decoding is serial, drains before admission, and retries only failed weather buffers', async () => {
  const original = decodeAudio;
  let releaseSnow, completed = false;
  const weatherDecodeOrder = [];
  decodeAudio = url => {
    if (/^weather-|step-snow/.test(url.split('/').pop())) weatherDecodeOrder.push(url.split('/').pop());
    if (url.endsWith('weather-rain-mono.mp3')) return Promise.reject(Error('optional rain unavailable'));
    if (url.endsWith('weather-snow-mono.mp3')) return new Promise(resolve => { releaseSnow = () => resolve(decoded(url)); });
    return original(url);
  };
  try {
    const audio = new AmbientAudio(), first = audio.preloadWorldSounds(); first.then(() => { completed = true; });
    await settle(); assert.equal(completed, false); assert.equal(audio.preloadWorldSounds(), first);
    assert.deepEqual(weatherDecodeOrder, ['weather-rain-mono.mp3', 'weather-snow-mono.mp3']);
    releaseSnow(); await first;
    assert.equal(completed, true); assert.equal(audio.snapshot().weather.snowStepsReady, 2);
    assert.equal(audio.worldSoundsReady(), false);
    const beforeRetry = fetched.length; decodeAudio = original; await audio.preloadWorldSounds();
    assert.equal(audio.worldSoundsReady(), true);
    assert.deepEqual(fetched.slice(beforeRetry).map(url => url.split('/').pop()), ['weather-rain-mono.mp3']);
  } finally { decodeAudio = original; }
});

test('terminal audio disposal clears weather/native buffers and prevents late decodes from reinstalling or reopening a graph', async () => {
  const original = decodeAudio;
  let release;
  decodeAudio = url => url.endsWith('weather-rain-mono.mp3') ? new Promise(resolve => { release = () => resolve(decoded(url)); }) : original(url);
  try {
    const audio = new AmbientAudio(); await audio.start(false);
    const context = contexts.at(-1), loading = audio.preloadWorldSounds(); await settle();
    assert.equal(typeof release, 'function'); audio.dispose(); release(); await loading;
    assert.equal(context.state, 'closed'); assert.equal(audio.worldSoundsReady(), false);
    const state = audio.snapshot(); assert.deepEqual(state.bedsReady, []); assert.equal(state.avatarReady, 0); assert.equal(state.weather.snowStepsReady, 0);
    assert.ok(context.started.filter(source => source.loop).every(source => source.stopped));
    const before = fetched.length, contextsBefore = contexts.length;
    await audio.preloadWorldSounds(); audio.unlock(); await audio.start(false); audio.dispose();
    assert.equal(fetched.length, before); assert.equal(contexts.length, contextsBefore);
  } finally { decodeAudio = original; }
});
