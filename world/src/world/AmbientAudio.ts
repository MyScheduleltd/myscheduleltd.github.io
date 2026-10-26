import { fetchAsset } from './AssetMirror';
import { requestWithDeadline } from '../network/RequestDeadline';

/**
 * The festival's own sounds: three recorded beds under the world and the click
 * and hover of its menus (owner, 2026-10-17). They replace a filtered-noise
 * hum that stood in for the outdoors until there were recordings.
 *
 * - day: a quiet seaside promenade, people walking and talking;
 * - night: a quiet rural evening, which takes over as the light goes;
 * - ocean: waves on a beach, which rise as the visitor nears the water.
 * - weather: short mono rain/winter beds, with a separate quiet snow-gust layer.
 *
 * Each bed is a loop cut from the owner's master with an equal-power crossfade
 * baked into its head, padded with half a second of its own tail before and
 * head after (build: `tools/build-sfx.py`, 2026-10-17). Looping between the
 * pads stays seamless even when a decoder shifts the start by its encoder
 * delay, which MP3 decoders do not agree about.
 *
 * Phones get mono copies. A decoded bed is 32-bit samples at the context's
 * rate, so the three in stereo hold about 55 MB; in mono, half that.
 *
 * Every bed runs through one low-pass and gain, which is what "indoors" is: the
 * outside dialled down and muffled, as if heard through the walls.
 *
 * The visitor's own avatar has a channel of its own, 角色音效 (owner,
 * 2026-10-17): footsteps on each foot plant, a crunch for popcorn, a sip for a
 * drink, a snow brush, a recorded punch impact, and the board rolling while it rides. Only the visitor's own body
 * sounds, and it is never muffled: walls are around it, not between it and the
 * visitor.
 */

export type InterfaceSound = 'click' | 'hover';
export type AvatarSound = 'step-left' | 'step-right' | 'eat' | 'drink' | 'snow-brush' | 'punch';

/** Where the visitor is, as far as the beds care. Each 0–1. */
export interface AmbientMix {
  /** 0 by day, 1 by night, and in between through dusk and dawn. */
  night: number;
  /** 1 at the water's edge, on the landing or in the sea; 0 inland. */
  ocean: number;
  /** How much of the outside reaches the visitor: 1 outdoors, low indoors. */
  outdoors: number;
  /** Existing ambient bus, muffled by the same walls; 0–1 crossfade weights. */
  rain?: number;
  snow?: number;
  /** The visitor is actually walking on snow, rather than indoors/under cover. */
  snowFootsteps?: boolean;
}

type BedKey = 'day' | 'night' | 'ocean' | 'rain' | 'snow' | 'snowWind';
type StepKey = 'step-left' | 'step-right';
const WEATHER_BEDS: readonly BedKey[] = ['rain', 'snow', 'snowWind'];
const LAND_BEDS: readonly BedKey[] = ['day', 'night', 'ocean'];
const STEP_KEYS: readonly StepKey[] = ['step-left', 'step-right'];

interface Bed {
  loopStart: number;
  loopEnd: number;
  /** Balance between the beds; the files themselves are all at −24 dBFS RMS. */
  level: number;
}

const BEDS: Record<BedKey, Bed> = {
  day: { loopStart: 0.5, loopEnd: 60.5, level: 0.9 },
  night: { loopStart: 0.5, loopEnd: 45.5, level: 0.8 },
  ocean: { loopStart: 0.5, loopEnd: 45.5, level: 1.1 },
  rain: { loopStart: 0.5, loopEnd: 16.5, level: .85 },
  snow: { loopStart: 0.5, loopEnd: 16.5, level: .65 },
  snowWind: { loopStart: 0.5, loopEnd: 6.5, level: .32 },
};

/**
 * Resolved when asked for, not when this module loads: the node test bundles
 * evaluate the world from a `data:` URL, against which these cannot resolve.
 */
const bedFile = (key: BedKey, mono: boolean): string => ({
  day: mono ? new URL('../assets/audio/ambience-day-mono.mp3', import.meta.url) : new URL('../assets/audio/ambience-day.mp3', import.meta.url),
  night: mono ? new URL('../assets/audio/ambience-night-mono.mp3', import.meta.url) : new URL('../assets/audio/ambience-night.mp3', import.meta.url),
  ocean: mono ? new URL('../assets/audio/ambience-ocean-mono.mp3', import.meta.url) : new URL('../assets/audio/ambience-ocean.mp3', import.meta.url),
  // Weather stays mono. Wind adds only a seven-second padded buffer, keeping
  // all weather/action additions together below eight MiB at48kHz.
  rain: new URL('../assets/audio/weather-rain-mono.mp3', import.meta.url),
  snow: new URL('../assets/audio/weather-snow-mono.mp3', import.meta.url),
  snowWind: new URL('../assets/audio/weather-snow-wind-mono.mp3', import.meta.url),
})[key].href;
const snowStepFile = (key: StepKey): string => (key === 'step-left'
  ? new URL('../assets/audio/avatar-step-snow-left.wav', import.meta.url)
  : new URL('../assets/audio/avatar-step-snow-right.wav', import.meta.url)).href;

const cueFile = (kind: InterfaceSound): string => (kind === 'click'
  ? new URL('../assets/audio/ui-click.wav', import.meta.url)
  : new URL('../assets/audio/ui-hover.wav', import.meta.url)).href;

const CUE_KINDS: readonly InterfaceSound[] = ['click', 'hover'];
const FIREWORK_KINDS = ['willow', 'peony', 'ring'] as const;
/** Downloads already have a no-progress deadline; native decoding needs one too. */
const AUDIO_DECODE_WAIT_MS = 30_000;

const avatarFile = (kind: AvatarSound): string => ({
  'step-left': new URL('../assets/audio/avatar-step-left.wav', import.meta.url),
  'step-right': new URL('../assets/audio/avatar-step-right.wav', import.meta.url),
  eat: new URL('../assets/audio/avatar-eat-popcorn.wav', import.meta.url),
  drink: new URL('../assets/audio/avatar-drink.wav', import.meta.url),
  'snow-brush': new URL('../assets/audio/avatar-snow-brush.wav', import.meta.url),
  punch: new URL('../assets/audio/avatar-punch.wav', import.meta.url),
})[kind].href;
const skateFile = (): string => new URL('../assets/audio/avatar-skate.mp3', import.meta.url).href;
const fireworkFile = (kind: string): string => ({
  willow: new URL('../assets/audio/fireworks-willow.mp3', import.meta.url),
  peony: new URL('../assets/audio/fireworks-peony.mp3', import.meta.url),
  ring: new URL('../assets/audio/fireworks-ring.mp3', import.meta.url),
})[kind as 'willow' | 'peony' | 'ring'].href;

const AVATAR_KINDS: readonly AvatarSound[] = ['step-left', 'step-right', 'eat', 'drink', 'snow-brush', 'punch'];
/** Balance within the avatar's channel; the one-shots share one loudness. */
const AVATAR_LEVEL: Record<AvatarSound, number> = { 'step-left': 0.5, 'step-right': 0.5, eat: 0.9, drink: 0.9, 'snow-brush': .75, punch: .9 };
/** The board's loop, cut like the beds (tools/build-sfx.py). */
const SKATE = { loopStart: 0.5, loopEnd: 5.9, level: 0.75 } as const;
/** Each step a shade different, so a long walk is not one sample repeating (owner chose ±3%). */
const STEP_PITCH_SPREAD = 0.03;
const STEP_LEVEL_SPREAD = 0.15;
/** Crunch transients sit beneath ordinary footsteps on the same avatar bus. */
const SNOW_STEP_LEVEL = 0.5;

/** One sound per this many milliseconds: a label and its control, or a fast sweep across a menu. */
const CUE_SPACING: Record<InterfaceSound, number> = { click: 30, hover: 45 };

/** Seconds for a level to get most of the way to where it is going. */
const BED_GLIDE = 1.2;
const DOOR_GLIDE = 0.45;

/** Same test as the mobile texture budget, without pulling its loader code into the page. */
const phone = (): boolean => {
  try { return window.matchMedia('(pointer: coarse) and (hover: none)').matches; } catch { return false; }
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

let decoder: BaseAudioContext | undefined;
/**
 * Decoding needs a context but not a running one, and not a gesture: an
 * offline context decodes on the sign-in page before anybody has clicked. The
 * buffers it makes play in any context.
 */
function decoderContext(fallback?: AudioContext): BaseAudioContext | undefined {
  if (decoder) return decoder;
  try { decoder = new OfflineAudioContext(2, 1, 48_000); } catch { decoder = fallback; }
  return decoder;
}

async function decode(url: string, fallback?: AudioContext): Promise<AudioBuffer> {
  const bytes = await fetchAsset(url);
  const context = decoderContext(fallback);
  if (!context) throw new Error('Audio decoding is unavailable.');
  // Native decoding cannot be cancelled. A late result after this deadline
  // is ignored, rather than being installed into a world already admitted.
  return requestWithDeadline(() => context.decodeAudioData(bytes), AUDIO_DECODE_WAIT_MS, 'Sound decoding');
}

export class AmbientAudio {
  onStateChange?: () => void;
  private context?: AudioContext;
  private master?: GainNode;
  private ambient?: GainNode;
  private outdoors?: GainNode;
  private muffle?: BiquadFilterNode;
  private screening?: GainNode;
  private ui?: GainNode;
  private readonly bedGains = new Map<BedKey, GainNode>();
  private readonly bedBuffers = new Map<BedKey, AudioBuffer>();
  private readonly bedSources = new Map<BedKey, AudioBufferSourceNode>();
  private readonly cueBuffers = new Map<InterfaceSound, AudioBuffer>();
  private readonly cueAt = new Map<InterfaceSound, number>();
  private readonly avatarBuffers = new Map<AvatarSound, AudioBuffer>();
  private readonly snowStepBuffers = new Map<StepKey, AudioBuffer>();
  private avatar?: GainNode;
  private skateGain?: GainNode;
  private skateBuffer?: AudioBuffer;
  private skateSource?: AudioBufferSourceNode;
  private skating = false;
  private avatarPlayed = 0;
  private readonly fireworkBuffers = new Map<string, AudioBuffer>();
  private readonly fireworkVoices = new Set<AudioBufferSourceNode>();
  private fireworksLoading?: Promise<void>;
  private fireworksPlayed = 0;
  private readonly targets = new Map<AudioParam, number>();
  private bedsLoading?: Promise<void>;
  private cuesLoading?: Promise<void>;
  private mix?: AmbientMix;
  private cuesPlayed = 0;
  private muted = true;
  private masterVolume = 0.7;
  private ambientVolume = 0.28;
  private screeningVolume = 0.85;
  private uiVolume = 0.6;
  private avatarVolume = 0.6;
  private disposed = false;
  /** Stands in for Math.random, so tests can pin the step variation. */
  random: () => number = Math.random;

  async start(muted: boolean): Promise<void> {
    if (this.disposed) return;
    this.muted = muted;
    if (!this.context) this.createGraph();
    this.applyVolumes();
    await this.context?.resume();
  }

  /**
   * Called from every gesture until sound is running: browsers only let a
   * page start audio from inside one, and a menu click is usually the first.
   */
  unlock(): void {
    if (this.disposed) return;
    if (!this.context) {
      try { this.createGraph(); } catch { return; }
    }
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
    if (!muted) void this.resume().catch(() => {});
  }

  needsResume(): boolean {
    return !this.context || this.context.state !== 'running';
  }

  async resume(): Promise<void> {
    if (this.context && this.context.state !== 'running' && this.context.state !== 'closed') await this.context.resume();
  }

  setMasterVolume(value: number): void {
    this.masterVolume = clamp01(value);
    this.applyVolumes();
  }

  setAmbientVolume(value: number): void {
    this.ambientVolume = clamp01(value);
    this.applyVolumes();
  }

  setScreeningVolume(value: number): void {
    this.screeningVolume = clamp01(value);
    this.applyVolumes();
  }

  setInterfaceVolume(value: number): void {
    this.uiVolume = clamp01(value);
    this.applyVolumes();
  }

  setAvatarVolume(value: number): void {
    this.avatarVolume = clamp01(value);
    this.applyVolumes();
  }

  /** What the sound panel's sliders should show when it is drawn again. */
  volumes(): { master: number; ambient: number; screening: number; ui: number; avatar: number } {
    return { master: this.masterVolume, ambient: this.ambientVolume, screening: this.screeningVolume, ui: this.uiVolume, avatar: this.avatarVolume };
  }

  /** The two menu sounds: small enough to fetch with the sign-in page itself. */
  loadInterfaceSounds(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.cuesLoading ??= Promise.allSettled(CUE_KINDS.map(async (kind) => {
      if (this.cueBuffers.has(kind)) return;
      const buffer = await decode(cueFile(kind), this.context);
      if (!this.disposed) this.cueBuffers.set(kind, buffer);
    })).then(results => {
      if (results.some(result => result.status === 'rejected')) this.cuesLoading = undefined;
    });
    return this.cuesLoading;
  }

  /**
   * The landscape/weather beds and the avatar's sounds, fetched and decoded while the
   * entry is loading so nobody waits for them in the world. Each loop starts,
   * silent, as soon as it is ready; the world decides what is heard.
   */
  preloadWorldSounds(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const mono = phone();
    this.bedsLoading ??= Promise.allSettled([
      ...LAND_BEDS.map(async (key) => {
        if (this.bedBuffers.has(key)) return;
        const buffer = await decode(bedFile(key, mono), this.context);
        if (this.disposed) return;
        this.bedBuffers.set(key, buffer);
        this.startBed(key);
      }),
      // The short weather additions decode serially, rather than creating
      // more native decode peaks together. They still join this barrier.
      (async () => {
        const jobs: Array<() => Promise<void>> = [
          ...WEATHER_BEDS.map(key => async () => {
            if (this.bedBuffers.has(key)) return;
            const buffer = await decode(bedFile(key, true), this.context);
            if (this.disposed) return;
            this.bedBuffers.set(key, buffer); this.startBed(key);
          }),
          ...STEP_KEYS.map(key => async () => {
            if (this.snowStepBuffers.has(key)) return;
            const buffer = await decode(snowStepFile(key), this.context);
            if (!this.disposed) this.snowStepBuffers.set(key, buffer);
          }),
        ];
        // An optional missing rain bed must not skip the snow/footstep jobs.
        for (const job of jobs) {
          if (this.disposed) break;
          try { await job(); } catch { /* settled missing buffers retry at the gate */ }
        }
      })(),
      ...AVATAR_KINDS.map(async (kind) => {
        if (this.avatarBuffers.has(kind)) return;
        const buffer = await decode(avatarFile(kind), this.context);
        if (!this.disposed) this.avatarBuffers.set(kind, buffer);
      }),
      (async () => {
        if (!this.skateBuffer) {
          const buffer = await decode(skateFile(), this.context);
          if (this.disposed) return;
          this.skateBuffer = buffer;
        }
        this.startSkate();
      })(),
      // The fireworks' three short bursts too (46 KB), so a show never starts
      // with a download (owner, 2026-10-23: everything loads at the gate).
      this.prepareFireworks(),
      this.loadInterfaceSounds(),
    ]).then(() => {
      // Failed sounds remain optional. Drain every other requested sound
      // before admission continues or a retry can duplicate pending work.
      if (!this.worldSoundsReady()) this.bedsLoading = undefined;
    });
    return this.bedsLoading;
  }

  worldSoundsReady(): boolean {
    return this.bedBuffers.size === Object.keys(BEDS).length
      && this.avatarBuffers.size === AVATAR_KINDS.length && Boolean(this.skateBuffer)
      && this.snowStepBuffers.size === STEP_KEYS.length
      && this.fireworkBuffers.size === FIREWORK_KINDS.length && this.cueBuffers.size === CUE_KINDS.length;
  }

  /** Small burst excerpts from the owner's recording, never the 31 MB master; loaded with the world's sounds. */
  prepareFireworks(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.fireworksLoading ??= Promise.allSettled(FIREWORK_KINDS.map(async kind => {
      if (this.fireworkBuffers.has(kind)) return;
      const buffer = await decode(fireworkFile(kind), this.context);
      if (!this.disposed) this.fireworkBuffers.set(kind, buffer);
    })).then(results => {
      if (results.some(result => result.status === 'rejected')) this.fireworksLoading = undefined;
    });
    return this.fireworksLoading;
  }

  /** Scored visual bursts request sounds now; late loads never queue stale bangs. */
  playFireworkCue(pattern: string): void {
    const context = this.context, buffer = this.fireworkBuffers.get(pattern === 'comet' ? 'ring' : pattern);
    if (!context || context.state !== 'running' || !buffer || !this.muffle || this.muted
      || this.masterVolume <= 0 || this.ambientVolume <= 0 || !this.mix) return;
    if (this.fireworkVoices.size >= 3) {
      const oldest = this.fireworkVoices.values().next().value;
      if (oldest) { this.fireworkVoices.delete(oldest); oldest.stop(); oldest.disconnect(); }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.muffle); // The existing ambient slider, master mute and walls apply.
    source.onended = () => { this.fireworkVoices.delete(source); source.disconnect(); };
    this.fireworkVoices.add(source);
    source.start();
    this.fireworksPlayed++;
  }

  stopFireworks(): void {
    for (const source of this.fireworkVoices) { source.stop(); source.disconnect(); }
    this.fireworkVoices.clear();
  }

  /**
   * One of the avatar's own sounds, `delay` seconds from now so it can land on
   * the moment the animation reaches it. Never queued behind a suspended
   * context: a footstep that plays a second late is worse than none.
   */
  playAvatarSound(kind: AvatarSound, delay = 0): void {
    const context = this.context;
    const step = kind === 'step-left' || kind === 'step-right';
    const snowBuffer = step && this.mix?.snowFootsteps ? this.snowStepBuffers.get(kind) : undefined;
    const buffer = snowBuffer ?? this.avatarBuffers.get(kind);
    if (!context || context.state !== 'running' || !buffer || !this.avatar || this.muted) return;
    const source = context.createBufferSource();
    const level = context.createGain();
    source.buffer = buffer;
    if (step) source.playbackRate.value = 1 + (this.random() * 2 - 1) * STEP_PITCH_SPREAD;
    level.gain.value = AVATAR_LEVEL[kind] * (snowBuffer ? SNOW_STEP_LEVEL : 1) * (step ? 1 - this.random() * STEP_LEVEL_SPREAD : 1);
    source.connect(level);
    level.connect(this.avatar);
    source.onended = () => { source.disconnect(); level.disconnect(); };
    source.start(context.currentTime + Math.max(0, delay));
    this.avatarPlayed++;
  }

  /** The board rolls while the avatar rides it: in quickly, out a little slower. */
  setSkating(on: boolean): void {
    this.skating = on;
    this.glide(this.skateGain?.gain, on ? SKATE.level : 0, on ? 0.08 : 0.18);
  }

  /** The world's report of where the visitor is. `undefined` fades the beds out. */
  setAmbientMix(mix: AmbientMix | undefined): void {
    this.mix = mix && { night: clamp01(mix.night), ocean: clamp01(mix.ocean), outdoors: clamp01(mix.outdoors),
      ...(mix.rain === undefined ? {} : { rain: clamp01(mix.rain) }),
      ...(mix.snow === undefined ? {} : { snow: clamp01(mix.snow) }),
      ...(mix.snowFootsteps === undefined ? {} : { snowFootsteps: mix.snowFootsteps === true }),
    };
    this.applyMix();
  }

  playInterfaceSound(kind: InterfaceSound): void {
    const context = this.context;
    const buffer = this.cueBuffers.get(kind);
    if (!context || !buffer || !this.ui || this.muted || this.masterVolume <= 0 || this.uiVolume <= 0) return;
    // A hover cannot start sound, so it never queues behind a suspended one.
    if (context.state !== 'running' && kind === 'hover') return;
    if (context.state === 'closed') return;
    const now = performance.now();
    if (now - (this.cueAt.get(kind) ?? -Infinity) < CUE_SPACING[kind]) return;
    this.cueAt.set(kind, now);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ui);
    source.onended = () => source.disconnect();
    source.start();
    this.cuesPlayed++;
  }

  /** What is playing and at what level, for loopback review only. */
  snapshot(): Record<string, unknown> {
    const level = (param?: AudioParam) => (param ? Math.round((this.targets.get(param) ?? param.value) * 1000) / 1000 : undefined);
    return {
      state: this.context?.state ?? 'none',
      muted: this.muted,
      volumes: this.volumes(),
      cuesReady: this.cueBuffers.size,
      cuesPlayed: this.cuesPlayed,
      avatarReady: this.avatarBuffers.size + (this.skateBuffer ? 1 : 0),
      avatarPlayed: this.avatarPlayed,
      fireworks: { ready: this.fireworkBuffers.size, playing: this.fireworkVoices.size, played: this.fireworksPlayed, maxVoices: 3 },
      skating: this.skating,
      skateLevel: level(this.skateGain?.gain),
      bedsReady: [...this.bedBuffers.keys()],
      bedsPlaying: [...this.bedSources.keys()],
      bedChannels: Object.fromEntries([...this.bedBuffers].map(([key, buffer]) => [key, buffer.numberOfChannels])),
      weather: { snowStepsReady: this.snowStepBuffers.size, footstepSurface: this.mix?.snowFootsteps ? 'snow' : 'default',
        decodedBytes: [...WEATHER_BEDS.map(key => this.bedBuffers.get(key)), ...this.snowStepBuffers.values()]
          .reduce((bytes, buffer) => bytes + (buffer?.length ?? 0) * (buffer?.numberOfChannels ?? 0) * 4, 0) },
      mix: this.mix,
      levels: {
        day: level(this.bedGains.get('day')?.gain),
        night: level(this.bedGains.get('night')?.gain),
        ocean: level(this.bedGains.get('ocean')?.gain),
        rain: level(this.bedGains.get('rain')?.gain),
        snow: level(this.bedGains.get('snow')?.gain),
        snowWind: level(this.bedGains.get('snowWind')?.gain),
        outdoors: level(this.outdoors?.gain),
        muffleHz: Math.round(level(this.muffle?.frequency) ?? 0),
      },
    };
  }

  private createGraph(): void {
    const context = new AudioContext();
    this.context = context;
    context.onstatechange = () => this.onStateChange?.();
    this.master = context.createGain();
    this.ambient = context.createGain();
    this.outdoors = context.createGain();
    this.muffle = context.createBiquadFilter();
    this.screening = context.createGain();
    this.ui = context.createGain();
    this.avatar = context.createGain();
    this.skateGain = context.createGain();
    this.skateGain.gain.value = 0;
    this.skateGain.connect(this.avatar);

    this.muffle.type = 'lowpass';
    this.muffle.Q.value = 0.5;
    this.muffle.frequency.value = this.muffleFrequency(1);
    this.outdoors.gain.value = 1;
    for (const key of Object.keys(BEDS) as BedKey[]) {
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(this.muffle);
      this.bedGains.set(key, gain);
    }
    this.muffle.connect(this.outdoors);
    this.outdoors.connect(this.ambient);
    this.ambient.connect(this.master);
    this.screening.connect(this.master);
    this.ui.connect(this.master);
    this.avatar.connect(this.master);
    this.master.connect(context.destination);

    for (const key of this.bedBuffers.keys()) this.startBed(key);
    this.startSkate();
    this.applyVolumes();
    this.applyMix();
  }

  private startBed(key: BedKey): void {
    const context = this.context;
    const buffer = this.bedBuffers.get(key);
    const gain = this.bedGains.get(key);
    if (!context || !buffer || !gain || this.bedSources.has(key)) return;
    const bed = BEDS[key];
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = bed.loopStart;
    source.loopEnd = Math.min(bed.loopEnd, buffer.duration);
    source.connect(gain);
    // Somewhere in the loop rather than its first second, so the same opening
    // phrase is not what every visit begins with.
    source.start(0, bed.loopStart + Math.random() * (source.loopEnd - bed.loopStart));
    this.bedSources.set(key, source);
  }

  private startSkate(): void {
    const context = this.context;
    if (!context || !this.skateBuffer || !this.skateGain || this.skateSource) return;
    const source = context.createBufferSource();
    source.buffer = this.skateBuffer;
    source.loop = true;
    source.loopStart = SKATE.loopStart;
    source.loopEnd = Math.min(SKATE.loopEnd, this.skateBuffer.duration);
    source.connect(this.skateGain);
    source.start(0, SKATE.loopStart);
    this.skateSource = source;
  }

  /** An exponential approach, rescheduled only when the target has actually moved. */
  private glide(param: AudioParam | undefined, value: number, seconds: number): void {
    if (!param || !this.context) return;
    const previous = this.targets.get(param);
    if (previous === value || (value !== 0 && previous !== undefined && Math.abs(previous - value) < 1e-3)) return;
    this.targets.set(param, value);
    param.setTargetAtTime(value, this.context.currentTime, seconds);
  }

  private muffleFrequency(outdoors: number): number {
    // Logarithmic, from a wall's worth of muffling up to open air.
    return 650 * Math.pow(20_000 / 650, outdoors);
  }

  private applyMix(): void {
    if (!this.context) return;
    const mix = this.mix;
    const night = mix?.night ?? 0;
    const ocean = mix?.ocean ?? 0;
    // Equal power through dusk and dawn, so the hand-over neither dips nor swells.
    const day = Math.cos(night * Math.PI / 2);
    const dark = Math.sin(night * Math.PI / 2);
    // At the water's edge the waves cover some of the promenade.
    const weatherTotal = Math.max(1, (mix?.rain ?? 0) + (mix?.snow ?? 0));
    const rain = (mix?.rain ?? 0) / weatherTotal, snow = (mix?.snow ?? 0) / weatherTotal;
    // Snow replaces the ordinary outdoors instead of layering winter on top
    // of promenade voices, night wildlife and ocean surf. Equal-power weights
    // carry both directions through the existing slow gain glide. Snap only
    // the inaudible end of the visual weather ease to a true zero target.
    const ordinary = snow >= .999 ? 0 : Math.cos(snow * Math.PI / 2);
    const winter = snow >= .999 ? 1 : Math.sin(snow * Math.PI / 2);
    const land = (1 - 0.3 * ocean) * (1 - .42 * rain) * ordinary;
    const on = mix ? 1 : 0;
    this.glide(this.bedGains.get('day')?.gain, on * day * land * BEDS.day.level, BED_GLIDE);
    this.glide(this.bedGains.get('night')?.gain, on * dark * land * BEDS.night.level, BED_GLIDE);
    this.glide(this.bedGains.get('ocean')?.gain, on * ocean * ordinary * BEDS.ocean.level, BED_GLIDE);
    this.glide(this.bedGains.get('rain')?.gain, on * rain * BEDS.rain.level, BED_GLIDE);
    this.glide(this.bedGains.get('snow')?.gain, on * winter * BEDS.snow.level, BED_GLIDE);
    this.glide(this.bedGains.get('snowWind')?.gain, on * winter * BEDS.snowWind.level, BED_GLIDE);
    const outdoors = mix?.outdoors ?? 1;
    this.glide(this.outdoors?.gain, outdoors, DOOR_GLIDE);
    this.glide(this.muffle?.frequency, this.muffleFrequency(outdoors), DOOR_GLIDE);
  }

  private applyVolumes(): void {
    if (!this.context || !this.master || !this.ambient || !this.screening || !this.ui) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, now, 0.08);
    this.ambient.gain.setTargetAtTime(this.ambientVolume, now, 0.08);
    this.screening.gain.setTargetAtTime(this.screeningVolume, now, 0.08);
    this.ui.gain.setTargetAtTime(this.uiVolume, now, 0.03);
    this.avatar?.gain.setTargetAtTime(this.avatarVolume, now, 0.03);
  }

  /** Terminal page teardown, not an ordinary indoor/hidden transition. Beds
   * otherwise retain their graph/buffers and simply crossfade or suspend. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mix = undefined;
    this.stopFireworks();
    for (const source of this.bedSources.values()) { try { source.stop(); } catch { /* already stopped */ } source.disconnect(); }
    this.bedSources.clear(); this.bedBuffers.clear(); this.snowStepBuffers.clear();
    try { this.skateSource?.stop(); } catch { /* already stopped */ }
    this.skateSource?.disconnect(); this.skateSource = undefined; this.skateBuffer = undefined;
    this.avatarBuffers.clear(); this.cueBuffers.clear(); this.fireworkBuffers.clear(); this.targets.clear();
    for (const node of [...this.bedGains.values(), this.master, this.ambient, this.outdoors, this.muffle, this.screening, this.ui, this.avatar, this.skateGain]) node?.disconnect();
    this.bedGains.clear(); this.bedsLoading = this.cuesLoading = this.fireworksLoading = undefined;
    const context = this.context; this.context = undefined;
    if (context) { context.onstatechange = null; void context.close().catch(() => {}); }
  }
}
