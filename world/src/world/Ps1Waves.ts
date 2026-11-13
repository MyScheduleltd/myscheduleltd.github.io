/**
 * The PS1 woodblock sea's real waves.
 *
 * The owner, 2026-11-11: "too flat, please make it more 3D and has depth and
 * volume". Their picks were real waves with shading, about waist height out at
 * sea, and swimmers riding them. Then, 2026-11-12: "messy, and lack of
 * physical logic". Their picks were one swell bending to the shore, a calm
 * harbour, and foam only on the biggest crests.
 *
 * So the sea behaves as a sea does:
 * - Out at sea, one long swell rolls in from the south-south-west (towards
 *   +z, onto the main beach), with a second, shorter swell a little off its
 *   line and some small chop on top. Slow groups make some stretches run
 *   higher than others.
 * - Over the shelving sand the swell dies away, and rollers take over. Their
 *   crests follow the depth contours, so they lie parallel to every beach and
 *   march in to break as surf (`ps1Rollers`, keyed to the water's depth).
 * - The walled harbour has neither.
 *
 * Built from sines only, so the GPU and the CPU (which floats swimmers on it)
 * agree. The same table drives the shader (`PS1_WAVES_GLSL`) and `ps1Waves`.
 * No imports, so Node tests can load it.
 */
/** Units of rise per unit of ps1Waves: crests about a metre (two units, an avatar's waist) over the troughs. */
export const PS1_WAVE_HEIGHT = .8;
/** The rollers' height over the shallows, in the same units. */
export const PS1_ROLLER_HEIGHT = .38;

/** [direction of travel (radians), length, weight, chop] for each train. Chop fades out from far away. */
// Spaced well apart (the owner, 2026-11-12: "the current is too dense").
const TRAINS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1.29, 64, 1, 0], [1.72, 41, .45, 0],
  [.66, 17, .15, 1], [2.25, 13, .11, 1], [1.0, 22, .13, 1],
];
/** Centring and stretching to about -1..1, measured over the sea. */
const MEAN = -.15, SPREAD = 1.6;
const TOTAL = TRAINS.reduce((sum, [, , weight]) => sum + weight, 0);
/** Phase speed: slower than real water, as a print's waves are stately. */
const speed = (length: number) => .35 * Math.sqrt(length);
/** The rollers: one every ROLLER_DEPTH of depth, moving shoreward at ROLLER_RATE a second. */
export const ROLLER_DEPTH = 3, ROLLER_RATE = .26;

const glslNumber = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(+n.toFixed(5)));

export const PS1_WAVES_GLSL = /* glsl */ `
  // A crest sharpened and a trough broadened, from a sine (-1..1).
  float ps1Crest(float s) { return 2.0 * pow(s * .5 + .5, 2.2) - 1.0; }
  // The open sea's waves at a point, mostly -1..1 (Ps1Waves.ts). \`chop\` 0..1
  // fades the small chop out, for a view from far off.
  float ps1Waves(vec2 p, float t, float chop) {
    // A slow bend, so the long crests curve gently.
    p += 4.0 * vec2(sin(p.y * .023 + .4), sin(p.x * .019 + 1.9));
    float groups = .6 + .4 * (sin(p.x * .017 + p.y * .011 + 1.1) + sin(p.y * .021 - p.x * .006 + 2.3)) * .5;
    float h = 0.0;
    ${TRAINS.map(([angle, length, weight, isChop], i) => {
      const k = 2 * Math.PI / length, dx = Math.cos(angle) * k, dz = Math.sin(angle) * k, w = speed(length) * k;
      return `h += ${glslNumber(weight)}${isChop ? ' * chop' : ''} * ps1Crest(sin(p.x * ${glslNumber(dx)} + p.y * ${glslNumber(dz)} - t * ${glslNumber(w)} + ${glslNumber(i * 1.7)}));`;
    }).join('\n    ')}
    return (groups * h / ${glslNumber(TOTAL)} - ${glslNumber(MEAN)}) * ${glslNumber(SPREAD)};
  }
  // The rollers over the shallows: 0 between them, 1 on a crest; they lie
  // along the depth contours and move shoreward.
  float ps1Rollers(float depth, float t) {
    float f = fract(depth / ${glslNumber(ROLLER_DEPTH)} + t * ${glslNumber(ROLLER_RATE)});
    return smoothstep(.5, .82, f) * (1.0 - smoothstep(.84, .97, f));
  }
  // Where the rollers stand: only over the beaches' shallows (under four deep,
// which keeps them off the harbour channel's cut walls), not in the harbour.
  float ps1RollerReach(float depth, float open) {
    return smoothstep(.3, 1.2, depth) * (1.0 - smoothstep(2.4, 3.8, depth)) * open;
  }
`;

const crest = (s: number) => 2 * Math.pow(s * .5 + .5, 2.2) - 1;
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** `ps1Waves` on the CPU, with the chop in: -1..1, before the calm near the shore and PS1_WAVE_HEIGHT. */
export function ps1Waves(x: number, z: number, t: number, chop = 1): number {
  const bx = x + 4 * Math.sin(z * .023 + .4), bz = z + 4 * Math.sin(x * .019 + 1.9);
  x = bx; z = bz;
  const groups = .6 + .4 * (Math.sin(x * .017 + z * .011 + 1.1) + Math.sin(z * .021 - x * .006 + 2.3)) * .5;
  let h = 0;
  TRAINS.forEach(([angle, length, weight, isChop], i) => {
    const k = 2 * Math.PI / length;
    h += weight * (isChop ? chop : 1) * crest(Math.sin(x * Math.cos(angle) * k + z * Math.sin(angle) * k - t * speed(length) * k + i * 1.7));
  });
  return (groups * h / TOTAL - MEAN) * SPREAD;
}

/** `ps1Rollers` on the CPU. */
export function ps1Rollers(depth: number, t: number): number {
  const v = depth / ROLLER_DEPTH + t * ROLLER_RATE, f = v - Math.floor(v);
  return smoothstep(.5, .82, f) * (1 - smoothstep(.84, .97, f));
}
export function ps1RollerReach(depth: number, open: number): number {
  return smoothstep(.3, 1.2, depth) * (1 - smoothstep(2.4, 3.8, depth)) * open;
}

/** The island's outline the waves calm towards, and its harbour. */
export interface Ps1SeaBounds { west: number; east: number; north: number; south: number; harbourHalf: number; harbourSouth: number; harbourNorth: number }

/**
 * How open the water is at a point, 0..1 (0 inside the walled harbour, which
 * is calm; `harbourNorth` is where its walls end), and how much of the open
 * sea's swell stands there: none in the shallows, full where the water is
 * about eight deep. `depth` is the water's depth there.
 *
 * The harbour's cut runs straight out to sea at four deep, a flat channel
 * the shallows rule calmed into a long dead strip (the owner, 2026-11-12:
 * "lack of physical logic"). Out past the coast the swell is judged on the
 * depth the open sea would have that far out instead.
 */
export function ps1SeaOpenness(x: number, z: number, depth: number, b: Ps1SeaBounds): { waves: number; open: number } {
  // Sheltered water fades out gradually past the walls, so there is no seam.
  const open = z < b.harbourSouth - 8 ? 1 : Math.max(smoothstep(b.harbourHalf, b.harbourHalf + 20, Math.abs(x)), smoothstep(b.harbourNorth - 4, b.harbourNorth + 18, z));
  const outside = Math.max(b.west - x, x - b.east, b.south - z, z - b.north, 0);
  // And the cut's channel in front of the harbour mouth, flat at four deep,
  // takes the swell as the open sea does, calming only into the harbour
  // itself: left flat, it read as a dead "entry way" (2026-11-12).
  const channel = smoothstep(b.harbourNorth - 6, b.harbourNorth + 10, z) * (1 - smoothstep(b.harbourHalf + 2, b.harbourHalf + 10, Math.abs(x)));
  const waves = smoothstep(3, 8, Math.max(depth, outside * .3, 9 * channel)) * open;
  return { waves, open };
}

/** The height of the sea's surface over SEA_Y at a point (a swimmer floats on it). */
export function ps1SeaHeight(x: number, z: number, t: number, depth: number, b: Ps1SeaBounds): number {
  const { waves, open } = ps1SeaOpenness(x, z, depth, b);
  return ps1Waves(x, z, t) * waves * PS1_WAVE_HEIGHT + ps1Rollers(depth, t) * ps1RollerReach(depth, open) * PS1_ROLLER_HEIGHT;
}
