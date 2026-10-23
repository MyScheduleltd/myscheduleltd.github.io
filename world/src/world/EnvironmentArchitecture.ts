import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INLAND_HOUSES, TEMPLE_GRADE } from './CoastalTerrain';

type Surface = 'stone' | 'plaster' | 'ceramic' | 'wood' | 'metal' | 'bronze';
type Area = 'palace' | 'shore' | 'drive-in' | 'basement' | 'shop' | 'temple' | 'houses';
type XYZ = readonly [number, number, number];

export interface EnvironmentArchitectureOptions {
  /** CSS3D apertures and any other protected world-space volumes. */
  keepClear?: readonly THREE.Box3[];
  houses?: boolean;
  /** A lower budget is useful for experiments; the hard ceiling is 15,000. */
  maxTriangles?: number;
}

export interface EnvironmentArchitectureReport {
  pieces: number;
  triangles: number;
  meshes: number;
  materials: number;
  refused: number;
  budget: number;
  byArea: Record<Area, number>;
}

const REPORT_KEY = 'environmentArchitectureReport';
const HARD_TRIANGLE_LIMIT = 15_000;

/** A closed chamfered solid: 6 faces, 12 bevel strips and 8 corner triangles. */
export function chamferedBox(size: XYZ, bevel: number): THREE.BufferGeometry {
  const half = size.map(value => value / 2);
  const inset = Math.min(bevel, ...half.map(value => value * .45));
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const point = (coordinates: number[]) => new THREE.Vector3(...coordinates as [number, number, number]);
  const face = (vertices: THREE.Vector3[], outward: THREE.Vector3) => {
    const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    if (normal.dot(outward) < 0) { vertices.reverse(); normal.negate(); }
    const axis = Math.abs(normal.x) > .5 ? 0 : Math.abs(normal.y) > .5 ? 1 : 2;
    for (let index = 1; index < vertices.length - 1; index++) {
      for (const vertex of [vertices[0], vertices[index], vertices[index + 1]]) {
        positions.push(vertex.x, vertex.y, vertex.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(axis === 0 ? vertex.z : vertex.x, axis === 1 ? vertex.z : vertex.y);
      }
    }
  };
  for (let axis = 0; axis < 3; axis++) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    for (const sign of [-1, 1]) {
      const vertices = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sa, sb]) => {
        const v = [0, 0, 0]; v[axis] = sign * half[axis];
        v[a] = sa * (half[a] - inset); v[b] = sb * (half[b] - inset); return point(v);
      });
      const outward = new THREE.Vector3(); outward.setComponent(axis, sign); face(vertices, outward);
    }
  }
  for (let free = 0; free < 3; free++) {
    const a = (free + 1) % 3, b = (free + 2) % 3;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const vertices = [[0, -1], [0, 1], [1, 1], [1, -1]].map(([side, sf]) => {
        const v = [0, 0, 0]; v[free] = sf * (half[free] - inset);
        v[a] = sa * (half[a] - (side ? inset : 0));
        v[b] = sb * (half[b] - (side ? 0 : inset)); return point(v);
      });
      const outward = new THREE.Vector3(); outward.setComponent(a, sa); outward.setComponent(b, sb); face(vertices, outward);
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const signs = [sx, sy, sz];
    const vertices = [0, 1, 2].map(axis => point(half.map((h, i) => signs[i] * (h - (i === axis ? 0 : inset)))));
    face(vertices, new THREE.Vector3(sx, sy, sz));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

const box = (center: XYZ, size: XYZ) => new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...center), new THREE.Vector3(...size));

/** End a shallow horizontal accent before a projecting facade member. Keeping
 * tiny offcuts would turn a single panel into unrelated cream flecks, so only
 * useful runs survive. The generated solid remains closed; no mesh clipping.
 */
function facadeRuns(from: number, to: number, projections: readonly (readonly [number, number])[], gap = .06): Array<readonly [number, number]> {
  let runs: Array<readonly [number, number]> = [[from, to]];
  for (const [start, end] of projections) {
    const low = start - gap, high = end + gap;
    runs = runs.flatMap(([a, b]) => {
      if (high <= a || low >= b) return [[a, b] as const];
      const remaining: Array<readonly [number, number]> = [[a, Math.min(b, low)], [Math.max(a, high), b]];
      return remaining.filter(([x, y]) => y - x >= .6);
    });
  }
  return runs;
}

/**
 * Architectural joinery for the approved festival plan. Run once after the
 * world/scenery builders and any legacy dressing, before planet subdivision
 * and static batching. No building, floor, entrance, collider or light changes.
 * Shallow trim stays against existing walls; overhead detail starts above the
 * walking envelope. The NIMA deck and the basement ceiling are excluded.
 */
export function applyEnvironmentArchitecture(
  scene: THREE.Scene,
  options: EnvironmentArchitectureOptions = {},
): EnvironmentArchitectureReport {
  const previous = scene.userData[REPORT_KEY] as EnvironmentArchitectureReport | undefined;
  if (previous) return previous;
  const requested = options.maxTriangles ?? HARD_TRIANGLE_LIMIT;
  const budget = Number.isFinite(requested) ? Math.max(0, Math.min(HARD_TRIANGLE_LIMIT, Math.floor(requested))) : HARD_TRIANGLE_LIMIT;
  const report: EnvironmentArchitectureReport = {
    pieces: 0, triangles: 0, meshes: 0, materials: 0, refused: 0, budget,
    byArea: { palace: 0, shore: 0, 'drive-in': 0, basement: 0, shop: 0, temple: 0, houses: 0 },
  };
  // Picture rectangles are protected even when the caller does not supply the
  // CSS3D volumes. These are the final relocated positions, not authoring offsets.
  const clear = [
    box([-35, 5.7, -48.2], [15.6, 8.8, 1.2]),
    box([35, 6.1, -35.7], [17.2, 9.7, 1.2]),
    box([0, 5.25, -45.7], [16.9, 9.5, 1.2]),
    box([-68, 6.5, 41.5], [17.4, 10.8, 1.2]),
    // No additions to the deck, its screen, furniture or stair approach.
    box([40, 13, 31.5], [42, 12, 29]),
    ...(options.keepClear ?? []).map(bounds => bounds.clone()),
  ];
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some(material => material instanceof THREE.MeshBasicMaterial && material.map)) return;
    const bounds = new THREE.Box3().setFromObject(mesh), size = bounds.getSize(new THREE.Vector3());
    // A mapped sky dome must not turn into a world-sized exclusion box.
    if (!bounds.isEmpty() && Math.max(size.x, size.y, size.z) < 50) clear.push(bounds.expandByScalar(.12));
  });
  const palette: Record<Surface, THREE.MeshStandardMaterial> = {
    stone: new THREE.MeshStandardMaterial({ color: 0xafa68e, roughness: .85, metalness: .02 }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xb7ad94, roughness: .92 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0x4b6b61, roughness: .54, metalness: .08 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x74523b, roughness: .79 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x434e4d, roughness: .56, metalness: .62 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x977c4c, roughness: .48, metalness: .72 }),
  };
  for (const [surface, material] of Object.entries(palette)) {
    material.name = `Environment architecture ${surface}`;
    material.userData.environmentArchitecture = true;
    if (surface === 'metal' || surface === 'bronze') material.userData.preserveAuthoredSurface = true;
  }
  const batches = new Map<string, { area: Area; surface: Surface; geometries: THREE.BufferGeometry[] }>();
  const put = (area: Area, surface: Surface, size: XYZ, at: XYZ, bevel = .035, rotation = 0) => {
    const geometry = bevel > 0 ? chamferedBox(size, bevel) : new THREE.BoxGeometry(...size).toNonIndexed();
    geometry.rotateY(rotation); geometry.translate(...at); geometry.computeBoundingBox();
    const triangles = geometry.attributes.position.count / 3;
    if (report.triangles + triangles > budget || clear.some(bounds => bounds.intersectsBox(geometry.boundingBox!))) {
      geometry.dispose(); report.refused++; return;
    }
    const key = `${area}:${surface}`, batch = batches.get(key) ?? { area, surface, geometries: [] };
    batch.geometries.push(geometry); batches.set(key, batch);
    report.pieces++; report.triangles += triangles; report.byArea[area] += triangles;
  };
  const strip = (area: Area, surface: Surface, size: XYZ, at: XYZ) => put(area, surface, size, at, 0);

  // The Palace: stepped Art Deco crown, chamfered pier collars and shallow
  // auditorium wall panels. Nothing crosses the name, entrance or film.
  for (const x of [-45, -25]) {
    for (const [y, h] of [[1.84, .12], [6.08, .16], [8.08, .18]] as const)
      put('palace', 'stone', [y < 3 ? 1.44 : 1.5, h, y < 3 ? 2.24 : 2.3], [x, y, -31.7], .04);
    for (const dx of [-.38, 0, .38]) strip('palace', 'bronze', [.065, 3.6, .04], [x + dx, 4.04, -30.62]);
  }
  for (const [x, width, top] of [[-44.4, 3.2, 11.4], [-35, 15.6, 11.8], [-25.6, 3.2, 11.4]] as const) {
    put('palace', 'stone', [width + .42, .16, 1.56], [x, top + .35, -31.6]);
    strip('palace', 'bronze', [width + .30, .055, .065], [x, top + .15, -30.83]);
  }
  for (const x of [-46.055, -23.945]) for (const z of [-34.8, -40.3, -45.8]) {
    put('palace', 'stone', [.12, 4.5, 4.65], [x, 4.6, z]);
    strip('palace', 'bronze', [.14, .075, 4.5], [x, 2.43, z]);
    strip('palace', 'bronze', [.14, .075, 4.5], [x, 6.77, z]);
  }
  for (const x of [-44.93, -25.07]) for (const z of [-35.8, -41, -46.1]) {
    put('palace', 'wood', [.09, 2.25, 3.9], [x, 3.3, z], .02);
    for (const dz of [-1.7, 0, 1.7]) strip('palace', 'bronze', [.11, 2.1, .045], [x, 3.3, z + dz]);
  }
  for (let x = -43.5; x <= -26.4; x += 3.4) strip('palace', 'metal', [.055, .06, 15.7], [x, 10.49, -40.75]);

  // Shore / Drive-In: mechanically credible collars and folded perimeter
  // flashings. Their display rectangles remain the existing open apertures.
  for (const [area, centerX, z, postX, top] of [
    ['shore', 35, -36, 9, 11.26], ['drive-in', 0, -46, 8.8, 10.91],
  ] as const) {
    for (const side of [-1, 1]) {
      const x = centerX + side * postX;
      for (const y of [3.2, top - .7]) put(area, 'metal', [.86, .28, .86], [x, y, z], .06);
      strip(area, 'bronze', [.08, 6.1, .045], [x + side * .39, 6.6, z + .40]);
      // A rear service seam lives on the support, behind the screen, rather
      // than an invented duct crossing its picture or standing in an aisle.
      put(area, 'metal', [.24, 1.1, .12], [x, 3.8, z - .44], .03);
    }
    put(area, 'metal', [postX * 2 + .7, .18, .8], [centerX, top, z], .04);
    strip(area, 'bronze', [postX * 2 + .5, .045, .06], [centerX, top + .08, z + .40]);
  }

  // Warehouse facade: recessed-looking reveals and drip edges augment the
  // existing high steel windows. All detail follows their structural bays.
  for (const z of [3.75, 10.5, 37.75]) {
    for (const dz of [-2.28, 2.28]) put('basement', 'metal', [.14, 2.36, .13], [-19.31, 7.25, z + dz], .025);
    put('basement', 'stone', [.36, .14, 4.88], [-19.32, 8.47, z], .035);
    put('basement', 'metal', [.18, .10, 4.9], [-19.30, 6.07, z], .025);
  }
  // Socketed column shoes remain inside existing column collider margins. The
  // screen wall and bare ceiling receive no additional objects.
  for (const z of [1, 41]) for (const x of [-88, -78, -58, -48, -38, -28])
    put('basement', 'metal', [.74, .18, .94], [x, -.88, z], .04);
  // CoastalScenery's brick piers project from the wall at these centres,
  // each .45 wide along Z. A full 2.8-unit accent formerly continued behind
  // them: the pier cut through its cream face and left a short floating stub.
  // Seat both the stone panel and dark cap in the same clear structural bay.
  const warehousePiers = [.5, 7, 13.5, 34, 41.5].map(z => [z - .225, z + .225] as const);
  for (const z of [2.5, 14.2, 32.5, 40.5]) {
    for (const [from, to] of facadeRuns(z - 1.4, z + 1.4, warehousePiers)) {
      const length = to - from, centre = (from + to) / 2;
      put('basement', 'stone', [.13, .45, length], [-19.59, .42, centre], .035);
      strip('basement', 'metal', [.15, .055, length - .1], [-19.58, .68, centre]);
    }
  }

  // The shop frontage stays below its existing slab. The open stock/counter
  // area, west stair and every NIMA deck surface are left as built.
  for (const x of [23, 57]) {
    for (const y of [1.0, 5.8]) put('shop', 'ceramic', [.74, .20, .79], [x, y, 7.7], .035);
    for (const dx of [-.21, .21]) strip('shop', 'bronze', [.035, 4.4, .045], [x + dx, 3.4, 7.35]);
  }
  put('shop', 'metal', [34.6, .16, .18], [40, 6.62, 7.9]);
  for (const x of [26, 33, 47, 54]) put('shop', 'metal', [.65, .10, .68], [x, 6.47, 7.83], .03);
  for (const x of [22.44, 57.56]) for (const z of [10.3, 15.9]) {
    strip('shop', 'bronze', [.035, .07, 4.9], [x, 1.05, z]);
    strip('shop', 'bronze', [.035, .07, 4.9], [x, 5.87, z]);
  }

  // Temple: refined timber portal and lacquer joinery retain the Chinese
  // hall's massing, roof silhouette, open west entrance and deity identity.
  const floor = TEMPLE_GRADE + 1.2;
  for (const z of [.12, 7.88]) {
    put('temple', 'wood', [.20, 6.1, .26], [75.49, floor + 3.05, z], .04);
    put('temple', 'bronze', [.22, .18, .34], [75.51, floor + .30, z], .035);
  }
  put('temple', 'wood', [.20, .22, 7.95], [75.49, floor + 6.38, 4], .035);
  for (const z of [-14.50, 22.50]) {
    put('temple', 'stone', [29.8, .42, .14], [91, floor + .40, z], .04);
    for (const x of [81, 91, 101]) {
      put('temple', 'wood', [7.2, .13, .16], [x, floor + 3.0, z], .025);
      put('temple', 'wood', [7.2, .13, .16], [x, floor + 7.1, z], .025);
      for (const dx of [-3.5, 3.5]) strip('temple', 'bronze', [.07, 4.1, .18], [x + dx, floor + 5.05, z]);
    }
  }
  // End-grain bracket shoes sit against the high wall/eave, with no hanging
  // decorations in the doorway or around the temple's floating name sign.
  for (const z of [-10, -3, 11, 18]) {
    put('temple', 'wood', [.75, .48, .36], [75.38, floor + 9.72, z], .06);
    put('temple', 'bronze', [.12, .18, .42], [75.0, floor + 9.75, z], .025);
  }

  if (options.houses !== false) for (const [x, z, width, depth, height, base] of INLAND_HOUSES) {
    const front = z - depth / 2, roof = base + height + .4;
    // A fine roof edge has a bevel and a dark underside rather than another
    // full solid placed over the building or its existing balcony.
    for (const side of [-1, 1]) {
      put('houses', 'stone', [width + .84, .12, .14], [x, roof + .02, z + side * (depth / 2 + .34)], .025);
      put('houses', 'stone', [.14, .12, depth + .54], [x + side * (width / 2 + .34), roof + .02, z], .025);
    }
    for (const dx of [-width * .3, width * .3]) {
      for (const side of [-1, 1]) put('houses', 'metal', [.10, 2.27, .11], [x + dx + side * 1.31, base + 5.1, front - .21], .02);
      put('houses', 'stone', [2.84, .14, .20], [x + dx, base + 6.28, front - .23], .035);
      strip('houses', 'bronze', [2.7, .045, .08], [x + dx, base + 4.03, front - .63]);
    }
    const seams = Math.floor(width / 4);
    for (let index = 1; index < seams; index++) strip('houses', 'metal', [.045, .045, depth - .3], [x - width / 2 + width * index / seams, roof + .023, z]);
  }

  const used = new Set<THREE.Material>();
  for (const { area, surface, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(part => part.dispose());
    if (!geometry) throw new Error('Environment architecture geometry attributes disagree');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const material = palette[surface], mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Environment architecture · ${area} · ${surface}`;
    mesh.receiveShadow = true;
    // Each leaf is eligible for the existing static batcher and foreground
    // occlusion pass; no per-frame traversal or animation is introduced.
    mesh.layers.enable(1);
    mesh.userData.environmentArchitecture = true;
    mesh.userData.environmentArea = area;
    mesh.userData.wornNoMasonry = true;
    mesh.userData.coastalAuthored = true;
    if (surface !== 'metal' && surface !== 'bronze')
      mesh.userData.environmentSurface = { family: surface, metres: 2, tint: 'source', uv: 'world' };
    scene.add(mesh); used.add(material); report.meshes++;
  }
  for (const material of Object.values(palette)) if (!used.has(material)) material.dispose();
  report.materials = used.size;
  scene.userData[REPORT_KEY] = report;
  return report;
}
