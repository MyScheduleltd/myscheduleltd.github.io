import * as THREE from 'three';

/** A large patch avoids repeating a nine-cell stamp every fourteen metres. */
export const LITE_SEA_TILE_METRES = 168;
const TEXTURE_SIZE = 512;
const CELLS_PER_EDGE = 28;
const LIGHT = [99, 164, 199];
const DARK = [16, 52, 74];
let sharedPixels: Uint8Array | undefined;

/**
 * A seeded, seamless cellular atlas, baked once for all world instances. Each
 * neighbouring grid square has its own jittered feature and colour. Sampling
 * only its nine neighbours keeps the one-off bake linear in texture size.
 * Coordinates wrap before looking up a seed, so all four edges join cleanly.
 */
export function createLiteSeaPixels(seed = 73021): Uint8Array {
  const cells = CELLS_PER_EDGE;
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const points = Array.from({ length: cells * cells }, () => ({
    x: .08 + random() * .84,
    y: .08 + random() * .84,
    tint: random(),
  }));
  const pixels = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y++) for (let x = 0; x < TEXTURE_SIZE; x++) {
    const u = (x + .5) * cells / TEXTURE_SIZE, v = (y + .5) * cells / TEXTURE_SIZE;
    const cellX = Math.floor(u), cellY = Math.floor(v);
    let first = Infinity, second = Infinity, tint = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const px = (cellX + dx + cells) % cells, py = (cellY + dy + cells) % cells;
      const point = points[py * cells + px];
      const a = cellX + dx + point.x - u, b = cellY + dy + point.y - v;
      const distance = a * a + b * b;
      if (distance < first) {
        second = first;
        first = distance;
        tint = point.tint;
      } else if (distance < second) second = distance;
    }
    const separation = Math.sqrt(second) - Math.sqrt(first);
    const edge = THREE.MathUtils.smoothstep(separation, .09, .2);
    // Slightly different cell tones break up uniform dark islands without
    // adding texture layers or increasing the number of fragment samples.
    const shade = .9 + tint * .2;
    const offset = (y * TEXTURE_SIZE + x) * 4;
    for (let c = 0; c < 3; c++) {
      pixels[offset + c] = Math.round((LIGHT[c] + (DARK[c] - LIGHT[c]) * edge) * shade);
    }
    pixels[offset + 3] = 255;
  }
  return pixels;
}

/** Cheap lit water for the world and its aerial sign-in preview. */
export function createLiteSeaMaterial(span: number): THREE.MeshLambertMaterial {
  sharedPixels ??= createLiteSeaPixels();
  // Share only CPU pixels: each world owns and disposes its own GPU texture.
  const map = new THREE.DataTexture(sharedPixels, TEXTURE_SIZE, TEXTURE_SIZE);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.repeat.set(span / LITE_SEA_TILE_METRES, span / LITE_SEA_TILE_METRES);
  map.needsUpdate = true;
  const material = new THREE.MeshLambertMaterial({ map });
  const seaTime = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSeaTime = seaTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uSeaTime;\nvoid main() {')
      .replace('#include <map_fragment>', `
        vec2 seaUv = vMapUv + vec2(
          .18 * sin(dot(vMapUv, vec2(.51, 1.21))) + .004 * sin(vMapUv.y * 21.4 + uSeaTime * 1.3),
          .18 * sin(dot(vMapUv, vec2(1.37, -.43))) + .004 * sin(vMapUv.x * 19.1 - uSeaTime * 1.1));
        diffuseColor *= texture2D(map, seaUv);`);
  };
  // A broad, non-repeating warp changes the cell arrangement across patches;
  // the two small crossing waves retain the previous slow surface movement.
  material.customProgramCacheKey = () => 'lite-sea-v2';
  material.userData.seaTime = seaTime;
  return material;
}
