import * as THREE from 'three';
import { PS1_SWELL_GLSL, PS1_SWELL_HEIGHT } from './Ps1Swell.ts';

/** A large patch avoids repeating a nine-cell stamp every fourteen metres. */
export const LITE_SEA_TILE_METRES = 168;

const TEXTURE_SIZE = 512;
/** The PS1 look's caustic sea, in the owner's reference blues (2026-11-09). */
const CAUSTIC_DEEP = [11, 58, 116];
const CAUSTIC_MID = [24, 104, 173];
const CAUSTIC_LINE = [205, 239, 253];
let sharedPixels: Uint8Array | undefined;

/**
 * The PS1 look's light-setting sea texture, after the owner's caustic
 * references (2026-11-09): a net of rounded, glowing light lines over blue
 * cells that darken towards their middles, and a finer, fainter net crossing
 * it. Seamless and seeded like the cells above: every lookup wraps, and the
 * warp that bends the lines repeats a whole number of times across the tile.
 */
export function createCausticPixels(seed = 41077): Uint8Array {
  const n = TEXTURE_SIZE, tau = Math.PI * 2;
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  /**
   * The 一般 caustic sea's own field (StylizedWater PS1_SEA), baked for the
   * sign-in globe (the owner, 2026-11-10: make it like the 一般 sea): the
   * distance to the nearest cell point, and how far it sits above a smooth
   * minimum (k .38): a thin rounded border, brightest where three cells meet.
   */
  const net = (cells: number, bend: number) => {
    const points = Array.from({ length: cells * cells }, () => [.1 + random() * .8, .1 + random() * .8]);
    const phase = [random(), random(), random(), random()].map(p => p * tau);
    const wrap = (i: number) => ((i % cells) + cells) % cells;
    const k = .38;
    return (x: number, y: number): [number, number] => {
      const s = x / n, t = y / n;
      const u = s * cells + bend * (Math.sin(t * tau * 3 + phase[0]) + .45 * Math.sin(t * tau * 8 + phase[1]));
      const v = t * cells + bend * (Math.sin(s * tau * 4 + phase[2]) + .45 * Math.sin(s * tau * 7 + phase[3]));
      const cellX = Math.floor(u), cellY = Math.floor(v);
      let nearest = Infinity, smooth = 8;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const point = points[wrap(cellY + dy) * cells + wrap(cellX + dx)];
        const d = Math.hypot(cellX + dx + point[0] - u, cellY + dy + point[1] - v);
        nearest = Math.min(nearest, d);
        const h = Math.max(k - Math.abs(smooth - d), 0) / k;
        smooth = Math.min(smooth, d) - h * h * h * k / 6;
      }
      return [nearest, nearest - smooth];
    };
  };
  // The 一般 sea's scales over a 168 m tile (.17 and .29 a metre): 28 and 48
  // cells. Its busy stretches, where the fine net leads, follow a seamless
  // slow field across the tile.
  const phase = [random(), random(), random()].map(p => p * tau);
  const busy = (s: number, t: number) => THREE.MathUtils.smoothstep(.5 + .5 * Math.sin(s * tau * 2 + phase[0] + 1.3 * Math.sin(t * tau + phase[1])) * Math.sin(t * tau * 3 + phase[2]), .3, .75);
  const broad = net(28, .25), fine = net(48, .3);
  const { smoothstep } = THREE.MathUtils;
  const mixC = (a: readonly number[], b: readonly number[], f: number) => a.map((v, i) => v + (b[i] - v) * f);
  const pixels = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const lively = busy(x / n, y / n);
    const [middle, e1] = broad(x, y), [, e2] = fine(x, y);
    // The shader's thresholds, a touch wider so a line is at least a texel.
    const line1 = smoothstep(e1, .044, .062) * (1 - .55 * lively), glow1 = smoothstep(e1, .028, .06) * (1 - .5 * lively);
    const line2 = smoothstep(e2, .05, .066) * (.55 + 1.05 * lively);
    const body = Math.min(1, Math.max(0, .25 + .35 * .5 + .4 * smoothstep(middle, .08, .55)));
    let colour = mixC(CAUSTIC_DEEP, CAUSTIC_MID, body);
    colour = mixC(colour, mixC(CAUSTIC_MID, CAUSTIC_LINE, .5), Math.min(1, Math.max(glow1 * .3, line2 * .35)));
    colour = mixC(colour, CAUSTIC_LINE, line1 * .9);
    const o = (y * n + x) * 4;
    for (let c = 0; c < 3; c++) pixels[o + c] = Math.round(colour[c]);
    pixels[o + 3] = 255;
  }
  return pixels;
}

/**
 * Value noise for the PS1 phone sea: random, so its calm stretches and the
 * warp that hides the tile never line up into the bands sines make.
 */
const SEA_NOISE_GLSL = `
float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float seaNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), f.x), mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/** The mean colour of a baked sea, for blending calm stretches towards it in the shader. */
function meanColour(pixels: Uint8Array): [number, number, number] {
  const sum = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += pixels[i + c];
  const count = pixels.length / 4;
  return sum.map(v => v / count / 255) as [number, number, number];
}

/** Cheap lit water for the world and its aerial sign-in preview. */
export function createLiteSeaMaterial(span: number, tileMetres = LITE_SEA_TILE_METRES): THREE.MeshLambertMaterial {
  sharedPixels ??= createCausticPixels();
  // Share only CPU pixels: each world owns and disposes its own GPU texture.
  const map = new THREE.DataTexture(sharedPixels, TEXTURE_SIZE, TEXTURE_SIZE);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.repeat.set(span / tileMetres, span / tileMetres);
  map.needsUpdate = true;
  // The PS1 look rolls the same swell as the cel-shaded sea, flat-shaded so
  // each facet catches the sun on its own slope.
  const material = new THREE.MeshLambertMaterial({ map, flatShading: true });
  const seaTime = { value: 0 }, seaGlow = { value: 0 };
  // In display colour as sampled (the map is sRGB, decoded to linear by the sampler).
  const seaMean = { value: new THREE.Color().setRGB(...meanColour(sharedPixels), THREE.SRGBColorSpace) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSeaTime = seaTime;
    shader.uniforms.uSeaGlow = seaGlow;
    shader.uniforms.uSeaMean = seaMean;
    if (shader.vertexShader) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uSeaTime;\n' + PS1_SWELL_GLSL)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n'
          + 'vec3 seaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n'
          + 'transformed.y += ps1Swell(seaWorld.xz, uSeaTime) * ' + PS1_SWELL_HEIGHT.toFixed(2) + ';');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uSeaTime;\nuniform float uSeaGlow;\nuniform vec3 uSeaMean;\n' + SEA_NOISE_GLSL + 'void main() {')
      .replace('#include <map_fragment>', `
        vec2 seaUv = vMapUv + vec2(
          .18 * sin(dot(vMapUv, vec2(.51, 1.21))) + .004 * sin(vMapUv.y * 21.4 + uSeaTime * 1.3) + .3 * (seaNoise(vMapUv * .6) - .5),
          .18 * sin(dot(vMapUv, vec2(1.37, -.43))) + .004 * sin(vMapUv.x * 19.1 - uSeaTime * 1.1) + .3 * (seaNoise(vMapUv * .6 + 7.3) - .5));
        vec4 seaTexel = texture2D(map, seaUv);
        // The tile must never show as a pattern from the sign-in globe (the
        // owner, 2026-11-10: "too uniform"): calm stretches drift across the
        // sea at periods unrelated to the tile, flattening its net towards
        // the water's mean colour.
        // Calm stretches, gently: the net fades a little, never to a smudge.
        float seaCalm = smoothstep(.55, .8, seaNoise(vMapUv * .8 + 2.1) * .65 + seaNoise(vMapUv * 2.3 - 4.7) * .35);
        seaTexel.rgb = mix(seaTexel.rgb, uSeaMean, seaCalm * .25);
        diffuseColor *= seaTexel;
        // PS1 nights (the owner, 2026-11-09: "glow more under the moon"): the
        // water between the caustic lines darkens, and the lines give off
        // their own moonlit light (emissive, below).
        float seaLine = smoothstep(.25, .7, dot(seaTexel.rgb, vec3(.3, .5, .2)));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(.34, .4, .5), uSeaGlow * (1.0 - seaLine));`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uSeaGlow * seaLine * vec3(.42, .62, .85);`);
  };
  // A broad, non-repeating warp changes the cell arrangement across patches;
  // the two small crossing waves retain the previous slow surface movement.
  material.customProgramCacheKey = () => 'lite-sea-ps1-caustic-v4';
  material.userData.seaTime = seaTime;
  material.userData.seaGlow = seaGlow;
  return material;
}
