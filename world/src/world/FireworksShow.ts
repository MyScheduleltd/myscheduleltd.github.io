import * as THREE from 'three';

export type FireworkPattern = 'willow' | 'peony' | 'ring' | 'comet';
export type FireworkQuality = 'normal' | 'lite';
export const FIREWORK_PALETTE = Object.freeze({ amber: 0xffbc50, cyan: 0x58eced, vermilion: 0xff5036 });
export const FIREWORK_BUDGET = Object.freeze({ normal: 2048, lite: 1024, shells: 4, rocketTrail: 8 });
type FireworkColour = keyof typeof FIREWORK_PALETTE;

export interface FireworkScoreEvent {
  /** Launch time in seconds from the start of this browser's celebration. */
  at: number;
  pattern: FireworkPattern;
  colour: FireworkColour;
  x: number;
  y: number;
  z: number;
  flight: number;
  seed: number;
}
export interface FireworkCue {
  kind: 'launch' | 'burst';
  pattern: FireworkPattern;
  at: number;
  position: readonly [number, number, number];
}
export interface FireworksShowOptions { quality?: FireworkQuality; seaY: number; onCue?: (cue: FireworkCue) => void; score?: 'festival' | 'temple'; }

/** A repeatable score: breathing room, colour dialogue, then a symmetrical 20 s finale. */
export function createFireworkScore(durationMs = 125_000): readonly FireworkScoreEvent[] {
  const duration = Math.max(120, Number.isFinite(durationMs) ? durationMs / 1000 : 125), finale = duration - 20;
  const score: FireworkScoreEvent[] = [];
  const add = (at: number, pattern: FireworkPattern, colour: FireworkColour, x: number, y = 23, z = -96) => {
    score.push({ at, pattern, colour, x, y: pattern === 'comet' ? 1.3 : y, z,
      flight: pattern === 'comet' ? 0 : 1.6 + (y - 20) * .035, seed: score.length });
  };
  add(0, 'willow', 'amber', 0, 24);
  add(6, 'ring', 'cyan', -17, 22); add(11, 'peony', 'vermilion', 17, 23);
  add(16, 'peony', 'amber', 0, 26);
  for (let at = 22, phrase = 0; at < finale - 7; at += 11, phrase++) {
    add(at, 'willow', 'amber', phrase % 2 ? 16 : -16, 25);
    add(at + 3.6, 'ring', 'cyan', phrase % 2 ? -16 : 16, 22);
    add(at + 6.8, 'peony', 'vermilion', -11, 24);
    add(at + 7.25, 'peony', 'amber', 11, 24);
  }
  add(finale, 'comet', 'amber', -23); add(finale + .18, 'comet', 'amber', 23);
  add(finale + 3, 'ring', 'cyan', -16, 24); add(finale + 3.15, 'ring', 'cyan', 16, 24);
  add(finale + 6.3, 'willow', 'amber', 0, 27);
  add(finale + 9, 'peony', 'vermilion', -19, 22); add(finale + 9.2, 'peony', 'vermilion', 19, 22);
  add(finale + 12, 'comet', 'amber', -26); add(finale + 12.12, 'comet', 'cyan', 26);
  add(finale + 14.6, 'ring', 'cyan', 0, 27);
  add(finale + 16.2, 'peony', 'vermilion', -22, 22); add(finale + 16.3, 'peony', 'cyan', 22, 22);
  add(finale + 17.2, 'willow', 'amber', 0, 28);
  return score.sort((a, b) => a.at - b.at);
}

interface Shell { event?: FireworkScoreEvent; born: number; life: number; rays: number; velocity: Float32Array; colour: THREE.Color; }
interface Rocket { event?: FireworkScoreEvent; }
const lifetime = (pattern: FireworkPattern) => pattern === 'willow' ? 5.1 : pattern === 'comet' ? 3.8 : pattern === 'ring' ? 3.35 : 3.8;
const PARAMETERS: Readonly<Record<FireworkPattern, readonly [number, number, number]>> = {
  willow: [.28, 1.55, .105], ring: [.72, 1.1, .065], comet: [.13, 3.4, .085], peony: [.82, 2.15, .065],
};

/**
 * Two persistent draws, no lights, textures or per-frame object creation.
 * Rays have analytic curved trails, rather than unrelated random points. The
 * built-in Points shader keeps the world's planet projection and XR cameras.
 */
export class FireworksShow {
  readonly root = new THREE.Group();
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly glints: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly position = new Float32Array(FIREWORK_BUDGET.normal * 3);
  private readonly colour = new Float32Array(FIREWORK_BUDGET.normal * 3);
  private readonly alpha = new Float32Array(FIREWORK_BUDGET.normal);
  private readonly size = new Float32Array(FIREWORK_BUDGET.normal);
  private readonly glintPosition = new Float32Array(4 * 8 * 6 * 3);
  private readonly glintColour = new Float32Array(4 * 8 * 6 * 4);
  private readonly pointAttributes: THREE.BufferAttribute[];
  private readonly glintAttributes: THREE.BufferAttribute[];
  private readonly rocketColour = new THREE.Color();
  private readonly shells: Shell[] = Array.from({ length: 4 }, () => ({ born: 0, life: 0, rays: 0, velocity: new Float32Array(72 * 3), colour: new THREE.Color() }));
  private readonly rockets: Rocket[] = Array.from({ length: 4 }, () => ({}));
  private quality: FireworkQuality;
  private score: readonly FireworkScoreEvent[] = [];
  private cursor = 0;
  private startedAt = 0;
  private durationMs = 0;
  private now = 0;
  private pointCount = 0;
  private glintCount = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, private readonly options: FireworksShowOptions) {
    this.quality = options.quality ?? 'normal';
    this.root.name = 'choreographed-fireworks';
    this.root.userData.projectorBackground = true;
    this.root.userData.environmentExclude = true;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colour, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('sparkAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('sparkScale', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.pointAttributes = Object.values(geometry.attributes) as THREE.BufferAttribute[];
    geometry.setDrawRange(0, 0);
    const material = new THREE.PointsMaterial({ size: .6, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, toneMapped: false, fog: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float sparkAlpha; attribute float sparkScale; varying float vSparkAlpha;\n' + shader.vertexShader;
      // Three's size attenuation is disabled for orthographic cameras. Keep
      // sparks a readable pixel size there instead of sub-pixel disappearing.
      shader.vertexShader = shader.vertexShader.replace('gl_PointSize = size;',
        'vSparkAlpha = sparkAlpha; gl_PointSize = size * sparkScale * (isPerspectiveMatrix(projectionMatrix) ? 1. : 4.);');
      shader.fragmentShader = 'varying float vSparkAlpha;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        float sparkRadius = length(gl_PointCoord - vec2(.5)) * 2.;
        if (sparkRadius > 1.) discard;
        diffuseColor.a *= vSparkAlpha * pow(1. - sparkRadius, 1.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), pow(max(0., 1. - sparkRadius * 2.5), 2.) * .6);
        #include <alphatest_fragment>`);
    };
    material.customProgramCacheKey = () => 'festival-firework-trails-v1';
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'firework-shells-and-comet-trails'; this.points.frustumCulled = false;
    this.points.userData.projectorBackground = true;
    const reflection = new THREE.BufferGeometry();
    reflection.setAttribute('position', new THREE.BufferAttribute(this.glintPosition, 3).setUsage(THREE.DynamicDrawUsage));
    reflection.setAttribute('color', new THREE.BufferAttribute(this.glintColour, 4).setUsage(THREE.DynamicDrawUsage));
    this.glintAttributes = Object.values(reflection.attributes) as THREE.BufferAttribute[];
    reflection.setDrawRange(0, 0);
    this.glints = new THREE.Mesh(reflection, new THREE.MeshBasicMaterial({ vertexColors: true,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.glints.name = 'firework-batched-water-glints'; this.glints.frustumCulled = false;
    this.glints.renderOrder = 5; this.glints.userData.projectorBackground = true;
    this.root.add(this.points, this.glints); this.root.visible = false; scene.add(this.root);
  }

  start(now: number, durationMs = 125_000): void {
    if (this.disposed) return;
    this.stop(); this.startedAt = now; this.now = now;
    this.durationMs = this.options.score === 'temple' ? 24_000 : Math.max(120_000, Number.isFinite(durationMs) ? durationMs : 125_000);
    this.score = this.options.score === 'temple'
      ? createFireworkScore().map(event => ({ ...event, at: event.at * 18 / 125,
        flight: Math.min(.95, event.flight), x: event.x * .42, y: event.y * .72 }))
      : createFireworkScore(this.durationMs);
    this.root.visible = true;
  }

  setQuality(quality: FireworkQuality): void {
    this.quality = quality;
    if (quality === 'lite') {
      // Retain the newest three complete silhouettes when changing mid-show.
      const active = this.shells.filter(shell => shell.event).sort((a, b) => b.born - a.born);
      for (let i = 3; i < active.length; i++) active[i].event = undefined;
    }
  }

  private cue(kind: FireworkCue['kind'], event: FireworkScoreEvent, seconds: number): void {
    const at = this.startedAt + seconds * 1000;
    if (this.now - at <= 300) this.options.onCue?.({ kind, pattern: event.pattern, at, position: [event.x, kind === 'launch' ? .8 : event.y, event.z] });
  }

  private burst(event: FireworkScoreEvent): void {
    let shell = this.shells[0];
    const maxShells = this.quality === 'normal' ? 4 : 3;
    for (let i = 0; i < maxShells; i++) {
      const candidate = this.shells[i];
      if (!candidate.event) { shell = candidate; break; }
      if (candidate.born < shell.born) shell = candidate;
    }
    shell.event = event; shell.born = event.at + event.flight; shell.life = lifetime(event.pattern);
    shell.rays = event.pattern === 'comet' ? 13 : 72;
    shell.colour.setHex(FIREWORK_PALETTE[event.colour]);
    const phase = event.seed * 2.399963;
    for (let i = 0; i < shell.rays; i++) {
      const offset = i * 3, theta = i / shell.rays * Math.PI * 2 + phase;
      if (event.pattern === 'ring') {
        const speed = i % 2 ? 6.8 : 7.35;
        shell.velocity[offset] = Math.cos(theta) * speed;
        shell.velocity[offset + 1] = Math.sin(theta) * speed;
        shell.velocity[offset + 2] = Math.cos(theta) * 2.1;
      } else if (event.pattern === 'comet') {
        const fan = (i / (shell.rays - 1) - .5) * 1.25;
        shell.velocity[offset] = Math.sin(fan) * 15;
        shell.velocity[offset + 1] = Math.cos(fan) * 15;
        shell.velocity[offset + 2] = (i % 3 - 1) * .65;
      } else {
        const vertical = 1 - 2 * (i + .5) / shell.rays;
        const radius = Math.sqrt(1 - vertical * vertical), angle = i * 2.399963 + phase;
        const speed = event.pattern === 'willow' ? 6.8 : 8.2;
        shell.velocity[offset] = Math.cos(angle) * radius * speed;
        shell.velocity[offset + 1] = vertical * speed * (event.pattern === 'willow' ? .78 : 1) + (event.pattern === 'willow' ? 1.5 : 0);
        shell.velocity[offset + 2] = Math.sin(angle) * radius * speed * .7;
      }
    }
    this.cue('burst', event, shell.born);
  }

  private point(x: number, y: number, z: number, colour: THREE.Color, alpha: number, size: number): void {
    if (this.pointCount >= FIREWORK_BUDGET[this.quality]) return;
    const index = this.pointCount++, offset = index * 3;
    this.position[offset] = x; this.position[offset + 1] = y; this.position[offset + 2] = z;
    this.colour[offset] = colour.r; this.colour[offset + 1] = colour.g; this.colour[offset + 2] = colour.b;
    this.alpha[index] = alpha; this.size[index] = size;
  }

  update(_delta: number, now: number): void {
    if (this.disposed || !this.durationMs) return;
    this.now = now;
    if (!this.root.visible && this.cursor >= this.score.length) return;
    const time = Math.max(0, (now - this.startedAt) / 1000);
    this.pointCount = 0; this.glintCount = 0;
    for (const shell of this.shells) if (shell.event && time - shell.born >= shell.life) shell.event = undefined;
    while (this.cursor < this.score.length && this.score[this.cursor].at <= time) {
      const event = this.score[this.cursor++], burstTime = event.at + event.flight;
      if (time >= burstTime + lifetime(event.pattern)) continue;
      this.cue('launch', event, event.at);
      if (time >= burstTime) this.burst(event);
      else {
        let rocket = this.rockets.find(candidate => !candidate.event);
        if (!rocket) rocket = this.rockets[0];
        rocket.event = event;
      }
    }
    const rocketColour = this.rocketColour;
    for (const rocket of this.rockets) {
      const event = rocket.event; if (!event) continue;
      if (time >= event.at + event.flight) {
        if (time < event.at + event.flight + lifetime(event.pattern)) this.burst(event);
        rocket.event = undefined; continue;
      }
      rocketColour.setHex(FIREWORK_PALETTE[event.colour]);
      for (let j = 0; j < FIREWORK_BUDGET.rocketTrail; j++) {
        const age = time - event.at - j * .032; if (age < 0) continue;
        const t = Math.min(1, age / event.flight), y = .8 + (event.y - .8) * (1 - (1 - t) ** 1.35);
        this.point(event.x + Math.sin(t * Math.PI) * .4, y, event.z, rocketColour, (1 - j / 9) * .9, j ? .55 : 1.2);
      }
    }
    for (const shell of this.shells) {
      const event = shell.event; if (!event) continue;
      const age = time - shell.born; if (age < 0 || age >= shell.life) continue;
      shell.colour.setHex(FIREWORK_PALETTE[event.colour]);
      const [drag, gravity, lag] = PARAMETERS[event.pattern];
      const rays = Math.min(shell.rays, this.quality === 'normal' ? 72 : 48);
      const segments = event.pattern === 'comet' ? (this.quality === 'normal' ? 12 : 10) : this.quality === 'normal' ? 7 : 6;
      const fade = Math.pow(1 - age / shell.life, event.pattern === 'willow' ? .65 : .85);
      for (let ray = 0; ray < rays; ray++) {
        const offset = Math.floor(ray * shell.rays / rays) * 3;
        for (let j = 0; j < segments; j++) {
          const t = age - j * lag; if (t < 0) continue;
          const distance = (1 - Math.exp(-drag * t)) / drag;
          const trailFade = Math.pow(1 - j / segments, 1.2);
          this.point(event.x + shell.velocity[offset] * distance,
            event.y + shell.velocity[offset + 1] * distance - .5 * gravity * t * t,
            event.z + shell.velocity[offset + 2] * distance, shell.colour,
            fade * trailFade * Math.min(1, age * 9 + .2), j ? .65 + trailFade * .2 : 1.15);
        }
      }
      if (this.options.score !== 'temple') this.reflection(shell, age, fade);
    }
    this.points.geometry.setDrawRange(0, this.pointCount);
    this.glints.geometry.setDrawRange(0, this.glintCount);
    for (const attribute of this.pointAttributes) {
      attribute.clearUpdateRanges(); attribute.addUpdateRange(0, this.pointCount * attribute.itemSize); attribute.needsUpdate = true;
    }
    for (const attribute of this.glintAttributes) {
      attribute.clearUpdateRanges(); attribute.addUpdateRange(0, this.glintCount * attribute.itemSize); attribute.needsUpdate = true;
    }
    this.root.visible = this.pointCount > 0;
  }

  private reflection(shell: Shell, age: number, fade: number): void {
    const event = shell.event!;
    for (let row = 0; row < 8; row++) {
      const z = Math.min(-74.5, event.z + 13 + row * 1.1), centre = event.x * .82 + Math.sin(row * 2.2 + age * 1.4) * .45;
      const width = (1.8 - row * .14) * (1 + Math.sin(row * 2.1 + age * 2.5) * .18);
      for (let vertex = 0; vertex < 6; vertex++) {
        const right = vertex === 1 || vertex === 2 || vertex === 4, far = vertex === 2 || vertex === 4 || vertex === 5;
        const index = this.glintCount++, position = index * 3, colour = index * 4;
        this.glintPosition[position] = centre + (right ? width : -width);
        this.glintPosition[position + 1] = this.options.seaY + .018;
        this.glintPosition[position + 2] = z + (far ? .24 : 0);
        this.glintColour[colour] = shell.colour.r; this.glintColour[colour + 1] = shell.colour.g; this.glintColour[colour + 2] = shell.colour.b;
        this.glintColour[colour + 3] = fade * fade * .23 * (1 - row / 11);
      }
    }
  }

  snapshot(): { active: boolean; rockets: number; bursts: number; particles: number; lights: number; reflections: number; reflectionHeights: number[]; phase: string; patterns: FireworkPattern[]; budget: number; drawCalls: number } {
    const bursts = this.shells.filter(shell => shell.event), rockets = this.rockets.filter(rocket => rocket.event).length;
    const elapsed = this.now - this.startedAt;
    const reflections = this.options.score === 'temple' ? [] : bursts;
    return { active: this.durationMs > 0 && elapsed < this.durationMs, rockets, bursts: bursts.length,
      particles: this.pointCount, lights: 0, reflections: reflections.length,
      reflectionHeights: reflections.map(() => this.options.seaY + .018),
      phase: !this.durationMs ? 'off' : elapsed >= this.durationMs ? 'afterglow' : this.options.score === 'temple' ? 'temple-tribute'
        : elapsed >= this.durationMs - 20_000 ? 'finale' : elapsed < 22_000 ? 'overture' : 'colour-dialogue',
      patterns: bursts.map(shell => shell.event!.pattern), budget: FIREWORK_BUDGET[this.quality], drawCalls: (this.pointCount ? 1 : 0) + (this.glintCount ? 1 : 0) };
  }

  stop(): void {
    for (const shell of this.shells) shell.event = undefined;
    for (const rocket of this.rockets) rocket.event = undefined;
    this.score = []; this.cursor = 0; this.durationMs = 0; this.pointCount = 0; this.glintCount = 0;
    this.points.geometry.setDrawRange(0, 0); this.glints.geometry.setDrawRange(0, 0); this.root.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop(); this.disposed = true; this.root.removeFromParent();
    this.points.geometry.dispose(); this.points.material.dispose(); this.glints.geometry.dispose(); this.glints.material.dispose();
    this.root.clear();
  }
}
