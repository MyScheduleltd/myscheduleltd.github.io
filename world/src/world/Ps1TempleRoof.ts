import * as THREE from 'three';

/**
 * The PS1 temple's roof, as the agreed district concept has it (the owner,
 * 2026-11-09: "Temple roof"): a Taiwanese double-eave roof. The upper tier is
 * a steep hip roof with its ridge along the front; the lower tier is a skirt
 * that rises from the eaves to the hall's connector. Every eave corner sweeps
 * up, the silhouette these roofs are known by.
 *
 * Geometry only, in the tier's local frame (eave line at y 0), closed with a
 * fascia and a soffit like coastalRoof, so the snow and collision code that
 * already reads the tiers keeps working on the same registered meshes.
 */
type V = [number, number, number];

export interface TempleRoofOptions {
  /** How far the four eave corners sweep up. */
  kick: number;
  /** Skirt: the inner outline it rises to (width, depth). Hip: omitted. */
  inner?: [number, number];
  /** Hip: half the ridge's length, along Z. */
  ridgeHalf?: number;
  /** Texels per world unit run, for the tile rows. */
  metres?: number;
}

/** Corners sweep up and out a little; mid-edges stay on the eave line. */
function rim(width: number, depth: number, kick: number): { corners: V[]; mids: V[] } {
  const w = width / 2, d = depth / 2, out = kick * .45;
  return {
    corners: [[-w - out, kick, -d - out], [w + out, kick, -d - out], [w + out, kick, d + out], [-w - out, kick, d + out]],
    mids: [[0, 0, -d], [w, 0, 0], [0, 0, d], [-w, 0, 0]],
  };
}

export function templeRoofGeometry(width: number, depth: number, rise: number, options: TempleRoofOptions): THREE.BufferGeometry {
  const { corners, mids } = rim(width, depth, options.kick);
  const metres = options.metres ?? 2;
  const positions: number[] = [], uvs: number[] = [];
  const up = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  /** A roof triangle, wound to face up, its tile rows running down the slope. */
  const roofTri = (p: V, q: V, r: V) => {
    a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]); b.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
    up.crossVectors(a, b);
    const tri = up.y < 0 ? [p, r, q] : [p, q, r];
    const alongZ = Math.abs(up.x) >= Math.abs(up.z);
    for (const v of tri) { positions.push(...v); uvs.push(alongZ ? v[2] / metres : v[0] / metres, alongZ ? v[0] / metres : v[2] / metres); }
  };
  /** A fascia or soffit triangle, wound to face away from the centre (or down). */
  const closeTri = (p: V, q: V, r: V, facing: 'out' | 'down') => {
    a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]); b.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
    up.crossVectors(a, b);
    const centre = [(p[0] + q[0] + r[0]) / 3, 0, (p[2] + q[2] + r[2]) / 3];
    const flip = facing === 'down' ? up.y > 0 : up.x * centre[0] + up.z * centre[2] < 0;
    const tri = flip ? [p, r, q] : [p, q, r];
    for (const v of tri) { positions.push(...v); uvs.push((v[0] + v[2]) / metres, v[1] / metres); }
  };
  // Eave ring in order round the roof: corner, mid, corner, mid...
  const ring: V[] = [corners[0], mids[0], corners[1], mids[1], corners[2], mids[2], corners[3], mids[3]];
  if (options.inner) {
    const [iw, id] = options.inner.map(n => n / 2);
    const inner: V[] = [[-iw, rise, -id], [0, rise, -id], [iw, rise, -id], [iw, rise, 0], [iw, rise, id], [0, rise, id], [-iw, rise, id], [-iw, rise, 0]];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      roofTri(ring[i], ring[j], inner[i]); roofTri(ring[j], inner[j], inner[i]);
    }
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8, lowI: V = [ring[i][0], -.55, ring[i][2]], lowJ: V = [ring[j][0], -.55, ring[j][2]];
      closeTri(ring[i], ring[j], lowI, 'out'); closeTri(ring[j], lowJ, lowI, 'out');
      const innerLowI: V = [inner[i][0], -.55, inner[i][2]], innerLowJ: V = [inner[j][0], -.55, inner[j][2]];
      closeTri(lowI, lowJ, innerLowI, 'down'); closeTri(lowJ, innerLowJ, innerLowI, 'down');
    }
  } else {
    const r = options.ridgeHalf ?? depth * .2;
    const ridgeA: V = [0, rise, -r], ridgeB: V = [0, rise, r];
    // Front (-X) and back (+X): long faces up to the ridge. Ends (±Z): hips to its tips.
    roofTri(corners[3], mids[3], ridgeB); roofTri(mids[3], ridgeA, ridgeB); roofTri(mids[3], corners[0], ridgeA);
    roofTri(corners[1], mids[1], ridgeA); roofTri(mids[1], ridgeB, ridgeA); roofTri(mids[1], corners[2], ridgeB);
    roofTri(corners[0], mids[0], ridgeA); roofTri(mids[0], corners[1], ridgeA);
    roofTri(corners[2], mids[2], ridgeB); roofTri(mids[2], corners[3], ridgeB);
    const low = ring.map(v => [v[0], -.55, v[2]] as V);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      closeTri(ring[i], ring[j], low[i], 'out'); closeTri(ring[j], low[j], low[i], 'out');
      closeTri(low[i], low[j], [0, -.55, 0], 'down');
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** The eave corners and ridge ends of a hip tier, for ridge pieces (local frame). */
export function templeRoofLines(width: number, depth: number, rise: number, kick: number, ridgeHalf: number): { corners: V[]; ridge: [V, V] } {
  return { corners: rim(width, depth, kick).corners, ridge: [[0, rise, -ridgeHalf], [0, rise, ridgeHalf]] };
}

let roofTexture: THREE.DataTexture | undefined;

/** Rows of round-backed tiles (筒瓦) with a darker channel between, and course lines. */
export function templeRoofTile(): THREE.DataTexture {
  if (roofTexture) return roofTexture;
  const n = 32, pixels = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const col = x % 4, course = y % 8;
    let v = col === 0 ? 120 : col === 1 ? 236 : col === 2 ? 206 : 160;
    if (course === 7) v -= 46;
    else if (course === 0) v += 10;
    v += ((x * 7 + y * 13) % 5) * 3;
    const i = (y * n + x) * 4;
    pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v - 4; pixels[i + 3] = 255;
  }
  roofTexture = new THREE.DataTexture(pixels, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  roofTexture.name = 'PS1 temple roof tile';
  roofTexture.colorSpace = THREE.SRGBColorSpace;
  roofTexture.wrapS = roofTexture.wrapT = THREE.RepeatWrapping;
  roofTexture.magFilter = THREE.NearestFilter;
  roofTexture.minFilter = THREE.NearestMipmapLinearFilter;
  roofTexture.generateMipmaps = true;
  roofTexture.needsUpdate = true;
  return roofTexture;
}
