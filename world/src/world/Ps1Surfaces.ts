import * as THREE from 'three';

/**
 * The PS1 restyle's surface tiles (the owner, 2026-11-09: "PS1 low-poly with
 * chunky pixel textures", a retro Taipei film district). One 64-pixel tile per
 * environment family, drawn here rather than downloaded: nothing to fetch on a
 * phone, identical on every load, and seamless in both directions.
 *
 * Tiles are near-neutral and carry pattern and value only; each surface's own
 * colour still comes from its material, as with the photographic tiles they
 * replace. Each tile's average brightness matches the tile it replaces, so a
 * wall keeps its colour and only gains its pattern. The contrast is several
 * times the old tiles', which read as flat paint at this resolution.
 *
 * - brick: chunky running bond with a lit top course and a shaded bottom one
 * - ceramic: 二丁掛-style façade tiles, the long glazed bricks of Taipei walls
 * - plaster: mottled render with rain streaks and hairline cracks
 * - asphalt: coarse aggregate, a crack and a patched repair
 * - wood: planks with grain, seams and the odd knot
 * - stone: square paving slabs with terrazzo speckle
 */
export const PS1_SURFACE_KINDS = ['plaster', 'brick', 'ceramic', 'asphalt', 'wood', 'stone'] as const;
export type Ps1SurfaceKind = typeof PS1_SURFACE_KINDS[number];
export const PS1_TILE = 64;
/** The average grey of the photographic tile each replaces (sRGB, 0–255). */
export const PS1_SURFACE_MEANS: Record<Ps1SurfaceKind, number> = {
  // A step lighter all round for the sunny street (the owner, 2026-11-11).
  plaster: 224, brick: 182, ceramic: 214, asphalt: 152, wood: 162, stone: 200,
};
/** The older canvas tiles (CoastalSurfaces.pixelSurface) were lighter; their materials were tuned to that. */
export const PS1_CANVAS_TILE_MEANS: Record<'plaster' | 'brick' | 'ceramic' | 'asphalt', number> = {
  plaster: 234, brick: 228, ceramic: 230, asphalt: 216,
};

const N = PS1_TILE;
const wrap = (value: number) => ((value % N) + N) % N;

/** Small, fast, seeded; the same tile every load. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise on a lattice of `cell` pixels, -1 to 1. */
function noise(x: number, y: number, cell: number, seed: number): number {
  const period = N / cell;
  const gx = x / cell, gy = y / cell;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => hash(((i % period) + period) % period, ((j % period) + period) % period, seed) * 2 - 1;
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** A crooked line of darkened pixels that may run over the edge and back. */
function crack(values: Float32Array, rand: () => number, length: number, depth: number): void {
  let x = Math.floor(rand() * N), y = Math.floor(rand() * N);
  let dx = rand() < .5 ? 1 : 0, dy = dx ? 0 : 1;
  for (let step = 0; step < length; step++) {
    values[wrap(y) * N + wrap(x)] -= depth;
    if (rand() < .35) { const turn = dx; dx = dy; dy = turn; }
    x += dx || (rand() < .5 ? 0 : 1); y += dy || (rand() < .5 ? 0 : 1);
  }
}

function draw(kind: Ps1SurfaceKind): Float32Array {
  const values = new Float32Array(N * N);
  const seed = PS1_SURFACE_KINDS.indexOf(kind) * 7919 + 17;
  const rand = random(seed);
  const set = (fn: (x: number, y: number) => number) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) values[y * N + x] = fn(x, y);
  };
  switch (kind) {
    case 'brick': {
      // Courses eight pixels tall, bricks sixteen long, half-bond.
      set((x, y) => {
        const course = Math.floor(y / 8), row = y % 8;
        const shifted = wrap(x + (course % 2) * 8), brick = Math.floor(shifted / 16);
        if (row === 7 || shifted % 16 === 0) return 120 + hash(x, y, seed + 3) * 14;
        const face = (hash(brick, course, seed) - .5) * 40 + (hash(x, y, seed + 1) - .5) * 14;
        const relief = row === 0 ? 14 : row === 6 ? -12 : 0;
        // A few chipped corners show the mortar behind.
        const chip = (shifted % 16 === 1 || shifted % 16 === 15) && (row === 0 || row === 6) && hash(brick, course, seed + 9) > .72;
        return chip ? 128 : 182 + face + relief;
      });
      break;
    }
    case 'ceramic': {
      // The small square mosaic tile of Showa shopfronts and apartment blocks
      // (the owner's Japanese street references, 2026-11-11): a grid of
      // four-pixel tiles on light grout, each its own shade, a glint top left.
      set((x, y) => {
        const tx = x >> 2, ty = y >> 2;
        if (x % 4 === 3 || y % 4 === 3) return 214 + hash(x, y, seed + 5) * 8;
        const face = (hash(tx, ty, seed) - .5) * 30;
        const glint = x % 4 === 0 && y % 4 === 0 ? 14 : x % 4 === 2 && y % 4 === 2 ? -6 : 0;
        return 196 + face + glint;
      });
      break;
    }
    case 'plaster': {
      set((x, y) => 212 + noise(x, y, 16, seed) * 18 + noise(x, y, 4, seed + 1) * 9 + (hash(x, y, seed + 2) - .5) * 10);
      // A few faint rain streaks: clean render in the sunny street, not soot.
      for (let streak = 0; streak < 3; streak++) {
        const x = Math.floor(rand() * N), start = Math.floor(rand() * N), length = 14 + Math.floor(rand() * 30), width = rand() < .4 ? 2 : 1;
        for (let step = 0; step < length; step++) for (let w = 0; w < width; w++) values[wrap(start + step) * N + wrap(x + w)] -= 16 * (1 - step / length);
      }
      crack(values, rand, 16, 42);
      break;
    }
    case 'asphalt': {
      set((x, y) => {
        const grain = hash(x, y, seed);
        const stone = grain > .965 ? 34 : grain < .035 ? -34 : 0;
        return 150 + noise(x, y, 8, seed + 1) * 8 + (hash(x >> 1, y >> 1, seed + 2) - .5) * 18 + (grain - .5) * 12 + stone;
      });
      // A patched repair, a shade darker with a hard edge.
      const px = Math.floor(rand() * N), py = Math.floor(rand() * N);
      for (let y = 0; y < 11; y++) for (let x = 0; x < 15; x++) values[wrap(py + y) * N + wrap(px + x)] -= x === 0 || y === 0 || x === 14 || y === 10 ? 18 : 10;
      crack(values, rand, 26, 46);
      break;
    }
    case 'wood': {
      // Planks eight pixels wide along U, butt joints at random places.
      const joints = Array.from({ length: 8 }, () => Math.floor(rand() * N));
      set((x, y) => {
        const plank = Math.floor(y / 8), row = y % 8;
        if (row === 7) return 96 + hash(x, y, seed) * 10;
        if (wrap(x - joints[plank]) === 0) return 104;
        const grain = Math.sin((x / N) * Math.PI * 2 * (2 + plank % 3) + plank * 1.7 + row * .9) * 14;
        return 158 + (hash(plank, 0, seed + 4) - .5) * 30 + grain + (hash(x, y, seed + 1) - .5) * 8 + (row === 0 ? 10 : 0);
      });
      for (let knot = 0; knot < 3; knot++) {
        const kx = Math.floor(rand() * N), ky = Math.floor(rand() * 8) * 8 + 3;
        for (const [ox, oy, depth] of [[0, 0, 46], [1, 0, 34], [-1, 0, 34], [0, 1, 24], [0, -1, 24]]) values[wrap(ky + oy) * N + wrap(kx + ox)] -= depth;
      }
      break;
    }
    case 'stone': {
      // Square paving slabs, sixteen pixels a side, with terrazzo speckle.
      set((x, y) => {
        if (x % 16 === 15 || y % 16 === 15) return 140 + hash(x, y, seed) * 10;
        const slab = (hash(x >> 4, y >> 4, seed + 1) - .5) * 26;
        const speck = hash(x, y, seed + 2);
        const fleck = speck > .94 ? 26 : speck < .06 ? -24 : 0;
        const edge = x % 16 === 0 || y % 16 === 0 ? 8 : x % 16 === 14 || y % 16 === 14 ? -8 : 0;
        return 192 + slab + fleck + edge + noise(x, y, 8, seed + 3) * 6;
      });
      for (let stain = 0; stain < 2; stain++) {
        const sx = Math.floor(rand() * N), sy = Math.floor(rand() * N), radius = 4 + rand() * 4;
        for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) if (x * x + y * y < radius * radius) values[wrap(sy + y) * N + wrap(sx + x)] -= 14;
      }
      crack(values, rand, 10, 40);
      break;
    }
  }
  return values;
}

/**
 * The tile's pixels, RGBA, rows top to bottom. Values are pulled to the
 * replaced tile's average and stepped to eight-level bands, which is what makes
 * the pattern read as drawn pixels rather than photographic noise.
 */
export function ps1SurfacePixels(kind: Ps1SurfaceKind, mean = PS1_SURFACE_MEANS[kind]): Uint8ClampedArray {
  const values = draw(kind);
  let sum = 0;
  for (const value of values) sum += value;
  const shift = mean - sum / values.length;
  const pixels = new Uint8ClampedArray(N * N * 4);
  for (let i = 0; i < values.length; i++) {
    const v = Math.round((values[i] + shift) / 8) * 8;
    // A faintly warm grey, as aged paint and concrete are.
    pixels[i * 4] = v + 2;
    pixels[i * 4 + 1] = v;
    pixels[i * 4 + 2] = v - 5;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

const textures = new Map<string, THREE.DataTexture>();

/**
 * Shared across every material and every world on the page. Nearest pixels up
 * close, mipmapped with a nearest pick at a distance, so the tiles stay chunky
 * without shimmering in a 360-line picture.
 */
export function ps1SurfaceTexture(kind: Ps1SurfaceKind, mean = PS1_SURFACE_MEANS[kind]): THREE.DataTexture {
  const key = `${kind}:${mean}`;
  let texture = textures.get(key);
  if (!texture) {
    texture = new THREE.DataTexture(ps1SurfacePixels(kind, mean), N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.name = `PS1 ${kind}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.flipY = false;
    texture.needsUpdate = true;
    textures.set(key, texture);
  }
  return texture;
}
