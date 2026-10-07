import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fetchAsset } from './AssetMirror';

/**
 * The band on the roof over the pop-up shop. While the jukebox has a record on
 * they play it on their stage, facing the beach; while it has none they sit
 * round a bonfire in the corner of the same roof. They are not visitors or
 * residents: nobody lists them, greets them or collides with them.
 *
 * Everything was generated on Higgsfield and animated in Blender
 * (scripts/prepare-band.py); the game only places the sets, plays the clips
 * and walks the four of them between their seats and their marks.
 */
export const BAND_MEMBERS = ['vocal', 'bass-player', 'guitarist', 'drummer'] as const;
export type BandMember = typeof BAND_MEMBERS[number];
type Clip = 'walk' | 'sit' | 'play';
type State = 'seated' | 'playing' | 'walking' | 'rising' | 'sitting';

// Resolved when loading, as the avatars' are: Vite turns each literal into an
// asset URL, and nothing is fetched until the band is wanted.
const urls = (): Record<BandMember | 'stage' | 'bonfire', string> => ({
  vocal: new URL('../assets/band/vocal.glb', import.meta.url).href,
  'bass-player': new URL('../assets/band/bass-player.glb', import.meta.url).href,
  guitarist: new URL('../assets/band/guitarist.glb', import.meta.url).href,
  drummer: new URL('../assets/band/drummer.glb', import.meta.url).href,
  stage: new URL('../assets/band/stage.glb', import.meta.url).href,
  bonfire: new URL('../assets/band/bonfire.glb', import.meta.url).href,
});
type BandFile = BandMember | 'stage' | 'bonfire';
const BAND_FILES: BandFile[] = ['stage', 'bonfire', 'vocal', 'drummer', 'guitarist', 'bass-player'];
const fetched = new Map<BandFile, Promise<ArrayBuffer>>();

/**
 * One download per file, shared by the gate's prefetch and the world's own
 * load, whichever asks first. A visitor who enters before the prefetch has
 * begun must not start a second copy of the band (it did: 8.5 MB twice).
 * A failure is forgotten, so the next ask fetches afresh.
 */
function bandBytes(name: BandFile): Promise<ArrayBuffer> {
  const known = fetched.get(name);
  if (known) return known;
  const bytes = fetchAsset(urls()[name]);
  bytes.catch(() => { if (fetched.get(name) === bytes) fetched.delete(name); });
  fetched.set(name, bytes);
  return bytes;
}

/**
 * Start fetching the band while the visitor is still at the gate, so it is
 * on the roof when the world opens instead of a minute after (the owner,
 * 2026-10-07). Called once the world's own files are in. Safe to call more
 * than once, and after the world has started loading the band itself.
 */
export function prefetchBand(): void {
  for (const name of BAND_FILES) {
    if (!used.has(name)) void bandBytes(name).catch(() => undefined);
  }
}

/** Files the world has already built the band from: never fetched again by a late prefetch. */
const used = new Set<BandFile>();

/** Metres in the band's files to units here: the visitors' own factor. */
export const BAND_SCALE = 3.42 / 1.7;
/** Walking pace the walk clip was made for: two steps of ~0.48 m a second. */
const WALK_SPEED = .96 * BAND_SCALE;
const FADE = .45;

export interface BandPlacement { x: number; y: number; z: number; yaw: number }

interface Musician {
  name: BandMember;
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<Clip, THREE.AnimationAction>;
  current: Clip;
  /** Carried while playing: the guitar, the bass, the sticks. */
  carried: THREE.Object3D[];
  state: State;
  path: THREE.Vector3[];
  /** Where it goes when the path ends, and which way it faces there. */
  goal: 'mark' | 'seat';
  wait: number;
  transition?: { from: THREE.Vector3; to: THREE.Vector3; time: number };
  seat: { at: THREE.Vector3; yaw: number };
  mark: { at: THREE.Vector3; yaw: number };
}

const yawOf = (o: THREE.Object3D) => {
  const q = o.getWorldQuaternion(new THREE.Quaternion());
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return Math.atan2(f.x, f.z);
};

export class RooftopBand {
  readonly group = new THREE.Group();
  private musicians: Musician[] = [];
  private resting: THREE.Object3D[] = [];
  private flames?: THREE.Group;
  private light?: THREE.PointLight;
  private playing = false;
  private clock = 0;
  private loaded = false;
  private recovery = new Map<BandMember, { at: number; running: boolean; load: () => Promise<void> }>();

  constructor(private stageAt: BandPlacement, private fireAt: BandPlacement, private onLight?: (light: THREE.PointLight) => void) {
    this.group.name = 'rooftop-band';
  }

  get ready(): boolean { return this.loaded && this.musicians.length === BAND_MEMBERS.length; }
  get isPlaying(): boolean { return this.playing; }

  /** Fetch and place everything; tests hand the files in as bytes instead. */
  async load(files?: Partial<Record<BandMember | 'stage' | 'bonfire', ArrayBuffer>>): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const get = async (name: BandMember | 'stage' | 'bonfire') => {
      const data = files?.[name];
      if (data) return loader.parseAsync(data, '');
      const gltf = await loader.parseAsync(await bandBytes(name), '');
      // Built: the 8.5 MB of bytes need not be kept as well.
      used.add(name);
      fetched.delete(name);
      return gltf;
    };
    // The set first, then each musician as their own file arrives. Waiting
    // for all six left the roof empty for minutes on a slow connection
    // (the owner, 2026-10-01: "where is the band?"), and one failed file
    // lost the whole band.
    const retry = async (name: BandMember | 'stage' | 'bonfire') => {
      let failure: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { return await get(name); } catch (error) { failure = error; }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
      }
      throw failure;
    };
    const pending = BAND_MEMBERS.map(name => retry(name).then(gltf => ({ gltf }), error => ({ error })));
    const [stage, bonfire] = await Promise.all([retry('stage'), retry('bonfire')]);
    const place = (scene: THREE.Object3D, at: BandPlacement) => {
      scene.scale.setScalar(BAND_SCALE);
      scene.position.set(at.x, at.y, at.z);
      scene.rotation.y = at.yaw;
      this.group.add(scene);
      scene.updateMatrixWorld(true);
    };
    place(stage.scene, this.stageAt);
    place(bonfire.scene, this.fireAt);
    for (const scene of [stage.scene, bonfire.scene]) scene.traverse(o => {
      if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
      if (o.name.startsWith('rest-')) this.resting.push(o);
    });
    this.buildFire(bonfire.scene.getObjectByName('fire')!);
    this.group.updateMatrixWorld(true);
    const spot = (scene: THREE.Object3D, name: string) => {
      const node = scene.getObjectByName(name)!;
      return { at: this.group.worldToLocal(node.getWorldPosition(new THREE.Vector3())), yaw: yawOf(node) - this.group.rotation.y };
    };
    this.loaded = true;
    // Who sits where, so that all four can leave together and no two routes
    // cross (the owner, October 3: "start walking to their position all
    // together ... so they don't overlap"). The bench further from the stage
    // goes round the back: the drummer on its rear seat takes the outer lane
    // to the riser, the guitarist the inner one down the fire's side of the
    // stage. The nearer bench goes round the front: the bassist on its front
    // seat takes the outer lane across to the far side, the vocalist the inner
    // one to the mic.
    const seats = BAND_MEMBERS.map(n => spot(bonfire.scene, 'seat-' + n));
    const local = (v: THREE.Vector3) => this.stageFrame(v);
    const byBench = [...seats].sort((a, b) => Math.abs(local(b.at).x) - Math.abs(local(a.at).x));
    const far = byBench.slice(0, 2).sort((a, b) => local(b.at).y - local(a.at).y);
    const near = byBench.slice(2).sort((a, b) => local(b.at).y - local(a.at).y);
    const seatOf: Record<BandMember, { at: THREE.Vector3; yaw: number }> = {
      drummer: far[0], guitarist: far[1], vocal: near[0], 'bass-player': near[1],
    };
    const join = (gltf: Awaited<ReturnType<typeof get>>, name: BandMember) => {
      const root = new THREE.Group();
      root.name = `band-${name}`;
      const model = gltf.scene;
      model.scale.setScalar(BAND_SCALE);
      root.add(model);
      // Culled against a sphere that holds every pose (1.7 m tall, arms out,
      // the drummer's reach): skinned bounds are measured once, at rest.
      model.traverse(o => {
        if (o instanceof THREE.SkinnedMesh) o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .9, 0), 1.5);
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      const carried: THREE.Object3D[] = [];
      model.traverse(o => { if (o.name.startsWith('prop-')) carried.push(o); });
      const mixer = new THREE.AnimationMixer(model);
      const clip = (n: Clip) => {
        const found = gltf.animations.find(a => a.name === n)!;
        const action = mixer.clipAction(found);
        action.setLoop(THREE.LoopRepeat, Infinity);
        return action;
      };
      const musician: Musician = {
        name, root, mixer, actions: { walk: clip('walk'), sit: clip('sit'), play: clip('play') }, current: 'sit', carried,
        state: 'seated', path: [], goal: 'seat', wait: 0,
        seat: seatOf[name], mark: spot(stage.scene, 'mark-' + name),
      };
      this.group.add(root);
      this.musicians.push(musician);
      // Whatever was asked for while it loaded.
      this.settle(musician, this.playing ? 'mark' : 'seat');
    };
    await Promise.all(pending.map(async (p, i) => {
      const result = await p;
      if ('gltf' in result) join(result.gltf, BAND_MEMBERS[i]);
      else {
        const name = BAND_MEMBERS[i];
        console.warn(`The ${name} did not load; it will retry`, result.error instanceof Error ? result.error.message : String(result.error));
        this.recovery.set(name, { at: this.clock + 15, running: false, load: async () => join(await retry(name), name) });
      }
    }));
  }

  /** The jukebox has a record on (true) or none (false). */
  setPlaying(on: boolean): void {
    if (on === this.playing) return;
    this.playing = on;
    if (!this.loaded) return;
    this.musicians.forEach(m => {
      // Finish the reserved journey before reversing. Replacing a partial
      // route can draw a diagonal through a bench or another seated member.
      if (['walking', 'rising', 'sitting'].includes(m.state)) return;
      m.goal = on ? 'mark' : 'seat';
      if ((on && m.state === 'playing') || (!on && m.state === 'seated')) { m.path = []; return; }
      // All together, on the same beat.
      m.wait = .2;
      m.transition = undefined;
      m.actions.walk.paused = false;
      m.path = this.route(m, on ? 'mark' : 'seat');
    });
  }

  /** Stand a musician at its seat or its mark at once, in the right clip. */
  private settle(m: Musician, where: 'seat' | 'mark'): void {
    const spot = where === 'seat' ? m.seat : m.mark;
    m.root.position.copy(spot.at);
    m.root.rotation.y = spot.yaw;
    m.state = where === 'seat' ? 'seated' : 'playing';
    m.goal = where;
    m.path = [];
    this.show(m, where === 'mark');
    this.use(m, where === 'seat' ? 'sit' : 'play', 0);
    const requested = this.playing ? 'mark' : 'seat';
    if (where !== requested) {
      m.goal = requested;
      m.path = this.route(m, requested);
      m.wait = .2;
    }
  }

  /** A world point (in the band's group) in the stage's own frame, as stagePoint takes it. */
  private stageFrame(v: THREE.Vector3): { x: number; y: number } {
    const c = Math.cos(this.stageAt.yaw), s = Math.sin(this.stageAt.yaw);
    const dx = v.x - this.stageAt.x, dz = v.z - this.stageAt.z;
    const gx = dx * c - dz * s, gz = dx * s + dz * c;
    return { x: gx / BAND_SCALE, y: -gz / BAND_SCALE };
  }

  /** A point given in the stage's own frame (the files' metres; -y is the audience). */
  private stagePoint(x: number, y: number, height = this.stageAt.y): THREE.Vector3 {
    const c = Math.cos(this.stageAt.yaw), s = Math.sin(this.stageAt.yaw);
    const gx = x * BAND_SCALE, gz = -y * BAND_SCALE;
    return new THREE.Vector3(this.stageAt.x + gx * c + gz * s, height, this.stageAt.z - gx * s + gz * c);
  }

  /**
   * The way between seat and mark, each on a lane of its own (see the seats
   * in load): up off the seat to the front of the bench, along the bench, out
   * on its lane and in to the mark. The lanes are nested, so no route crosses
   * another, and as the four go together at one pace, the two from each bench
   * keep their distance in single file until their lanes part. Back to the
   * fire the same way, reversed.
   */
  private route(m: Musician, to: 'seat' | 'mark'): THREE.Vector3[] {
    const seat = m.seat;
    const approach = seat.at.clone().addScaledVector(new THREE.Vector3(Math.sin(seat.yaw), 0, Math.cos(seat.yaw)), .57 * BAND_SCALE);
    // Which side of the stage the fire is on, in the stage's frame.
    const fire = new THREE.Vector3(this.fireAt.x, this.stageAt.y, this.fireAt.z);
    const fireSide = this.stagePoint(-1, 0).distanceTo(fire) < this.stagePoint(1, 0).distanceTo(fire) ? -1 : 1;
    const column = this.stageFrame(approach).x, mark = this.stageFrame(m.mark.at);
    const P = (x: number, y: number) => this.stagePoint(x, y);
    const lane: THREE.Vector3[] = {
      // Behind the riser, inside the deck's wall, and up onto it.
      drummer: [P(column, 2.95), P(0, 2.95)],
      // Behind the benches, then down the fire's side of the stage, past the amp.
      guitarist: [P(column, 2.62), P(4.25 * fireSide, 2.62), P(4.25 * fireSide, mark.y)],
      // In front, then in beside the mic stand rather than through it.
      vocal: [P(column, -1.4), P(.65 * fireSide, -1.4), P(.65 * fireSide, mark.y)],
      // Furthest out in front, inside the roof's edge, across to the far side.
      'bass-player': [P(column, -1.95), P(mark.x, -1.95)],
    }[m.name];
    const here = m.root.position.clone();
    return to === 'mark'
      ? [here, ...(m.state === 'seated' ? [approach] : []), ...lane, m.mark.at.clone()]
      : [here, ...lane.reverse(), approach];
  }

  private show(m: Musician, playing: boolean): void {
    for (const o of m.carried) o.visible = playing;
    const own = m.name === 'guitarist' ? 'rest-guitar' : m.name === 'bass-player' ? 'rest-bass' : '';
    for (const r of this.resting) if (r.name === own) r.visible = !playing;
  }

  private use(m: Musician, clip: Clip, fade = FADE): void {
    if (m.current === clip && m.actions[clip].isRunning()) return;
    const next = m.actions[clip];
    next.reset();
    // The band plays together: every 'play' runs on the band's one clock.
    if (clip === 'play') next.time = this.clock % next.getClip().duration;
    if (clip === 'sit') next.time = Math.random() * next.getClip().duration;
    next.play();
    const last = m.actions[m.current];
    if (fade > 0 && last !== next) next.crossFadeFrom(last, fade, false);
    else if (last !== next) last.stop();
    m.current = clip;
  }

  update(delta: number, elapsed: number): void {
    if (!this.loaded) return;
    const dt = Math.min(delta, .1);
    this.clock += dt;
    for (const [name, task] of this.recovery) {
      if (task.running || this.clock < task.at) continue;
      task.running = true;
      void task.load().then(() => this.recovery.delete(name), error => {
        task.running = false; task.at = this.clock + 30;
        console.warn(`The ${name} is still unavailable; it will retry`, error instanceof Error ? error.message : String(error));
      });
    }
    // Everyone with somewhere to go goes at once: the routes are laid so they
    // never cross (see route), where they used to queue one at a time.
    for (const m of this.musicians) {
      if (m.path.length) {
        if (m.transition) {
          const tr = m.transition;
          tr.time = Math.min(1, tr.time + dt / .85);
          const ease = tr.time * tr.time * (3 - 2 * tr.time);
          m.root.position.lerpVectors(tr.from, tr.to, ease);
          if (tr.time >= 1) {
            m.transition = undefined;
            m.actions.walk.paused = false;
            if (m.state === 'sitting') this.settle(m, 'seat');
            else { m.state = 'walking'; m.path.shift(); }
          }
        } else if (m.wait > 0) m.wait -= dt;
        else {
          if (m.state !== 'walking') {
            this.show(m, false);
            if (m.state === 'seated' && m.goal === 'mark') {
              m.state = 'rising';
              this.use(m, 'walk', .85);
              m.actions.walk.paused = true;
              m.transition = { from: m.root.position.clone(), to: m.path[1].clone(), time: 0 };
            } else {
              m.state = 'walking';
              this.use(m, 'walk');
            }
          }
          if (m.state === 'walking') this.walk(m, dt);
        }
      }
      m.mixer.update(dt);
    }
    this.flicker(elapsed);
  }

  private walk(m: Musician, dt: number): void {
    let step = WALK_SPEED * dt;
    while (step > 0 && m.path.length > 1) {
      const next = m.path[1];
      const to = next.clone().sub(m.root.position);
      const flat = Math.hypot(to.x, to.z);
      if (flat < 1e-4) { m.path.shift(); continue; }
      const move = Math.min(step, flat);
      m.root.position.addScaledVector(to, move / Math.max(flat, 1e-6));
      const want = Math.atan2(to.x, to.z);
      m.root.rotation.y += Math.atan2(Math.sin(want - m.root.rotation.y), Math.cos(want - m.root.rotation.y)) * Math.min(1, dt * 8);
      step -= move;
      if (move >= flat - 1e-6) m.path.shift();
    }
    if (m.path.length <= 1) {
      if (m.goal === 'seat') {
        m.state = 'sitting';
        m.root.rotation.y = m.seat.yaw;
        m.transition = { from: m.root.position.clone(), to: m.seat.at.clone(), time: 0 };
        // Retain one waypoint so this person holds the reservation while sitting.
        m.path = [m.seat.at.clone()];
        this.use(m, 'sit', .85);
      } else this.settle(m, 'mark');
    }
  }

  /** Low flames of crossed cards over the logs, and the light they throw. */
  private buildFire(anchor: THREE.Object3D): void {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // A blocky flame, in keeping with everything else: stepped bands.
      const bands = ['#fff1a8', '#ffd05a', '#ff9a2a', '#f0561a', '#b82a10'];
      for (let y = 0; y < 64; y += 4) {
        const t = y / 64, half = Math.round((1 - t) ** .7 * 14 + (t > .75 ? -2 : 0));
        ctx.fillStyle = bands[Math.min(4, Math.floor((1 - t) * 5.2))];
        if (half > 0) ctx.fillRect(16 - half, y, half * 2, 4);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .3, side: THREE.DoubleSide, depthWrite: false });
    const flames = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(.42, .62), material);
      card.position.y = .31;
      card.rotation.y = i * Math.PI / 3;
      flames.add(card);
    }
    anchor.add(flames);
    this.flames = flames;
    const light = new THREE.PointLight(0xff8a3c, 18, 14, 1.6);
    light.position.set(0, .5, 0);
    anchor.add(light);
    this.light = light;
    this.onLight?.(light);
  }

  private flicker(elapsed: number): void {
    if (!this.flames) return;
    this.flames.children.forEach((card, i) => {
      const s = 1 + .12 * Math.sin(elapsed * (9 + i * 2.3) + i) + .06 * Math.sin(elapsed * 23 + i * 5);
      card.scale.set(1 + .05 * Math.sin(elapsed * 7 + i), s, 1);
    });
    // The day-night cycle sets the light's intensity every frame before this
    // runs; the fire only wavers it.
    if (this.light) this.light.intensity *= .85 + .15 * Math.sin(elapsed * 11) * Math.sin(elapsed * 4.3);
  }

  /** For tests and review: where each musician is and what it is doing. */
  snapshot(): Array<{ name: BandMember; state: State; clip: Clip; x: number; y: number; z: number; carrying: boolean }> {
    return this.musicians.map(m => ({
      name: m.name, state: m.state, clip: m.current, x: m.root.position.x, y: m.root.position.y, z: m.root.position.z,
      carrying: m.carried.some(o => o.visible),
    }));
  }
}
