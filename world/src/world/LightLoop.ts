import * as THREE from 'three';

/**
 * Lamps skip the pixels they cannot reach.
 *
 * three.js runs the whole lighting model for every light on every lit pixel:
 * a lamp eighty units away, whose own range ends at twenty, still costs each
 * pixel at the gate a full specular and diffuse evaluation that multiplies out
 * to exactly zero. The light count is held constant on purpose (changing it
 * recompiles every shader), so on 一般 that was seventeen lamps per pixel, and
 * it was the largest single cost of the frame: 28 ms of GPU time at the gate
 * on an M2, 11 ms with the lamps off (2026-10-17).
 *
 * The shader already knows when a light contributes nothing: three.js sets
 * `directLight.visible` false outside a point or spot light's range and cone,
 * where its colour is exactly zero. Wrapping the per-light work in that test
 * adds nothing that was not already zero, so the picture is the same pixel for
 * pixel; pixels out of every lamp's reach, which is most of the screen, stop
 * paying for them. A directional light skips the same way when its colour is
 * exactly zero (the moon by day), which also spares the sun's shadow lookups
 * once it has set.
 *
 * Patches the shared chunk, so it must run before the first program compiles.
 * Idempotent; leaves the chunk alone if three.js has changed its shape.
 */
const CHUNK = 'lights_fragment_begin';
const DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const LOOPS: Array<[info: string, reaches: string]> = [
  ['getPointLightInfo( pointLight, geometryPosition, directLight );', 'directLight.visible'],
  ['getSpotLightInfo( spotLight, geometryPosition, directLight );', 'directLight.visible'],
  ['getDirectionalLightInfo( directionalLight, directLight );', 'directLight.color != vec3( 0.0 )'],
];
const MARK = '/* light-early-out */';

export function lightEarlyOutChunk(chunk: string): string | undefined {
  if (chunk.includes(MARK)) return chunk;
  let out = chunk;
  for (const [info, reaches] of LOOPS) {
    const at = out.indexOf(info);
    const direct = at < 0 ? -1 : out.indexOf(DIRECT, at);
    // Each loop holds exactly one lighting call; anything else is a chunk this
    // was not written against.
    if (at < 0 || direct < 0 || out.indexOf(info, at + 1) >= 0) return undefined;
    const end = direct + DIRECT.length;
    out = `${out.slice(0, at + info.length)}\n\t\tif ( ${reaches} ) {${out.slice(at + info.length, end)}\n\t\t}${out.slice(end)}`;
  }
  return `${MARK}\n${out}`;
}

export function installLightEarlyOut(): boolean {
  const chunks = THREE.ShaderChunk as Record<string, string>;
  const patched = lightEarlyOutChunk(chunks[CHUNK]);
  if (!patched) return false;
  chunks[CHUNK] = patched;
  return true;
}
