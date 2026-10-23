import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEMPLE_GRADE } from './CoastalTerrain';
import type { EnvironmentFamily } from './EnvironmentMaterials';

type XYZ = readonly [number, number, number];
type Finish = 'timber' | 'shadow' | 'tile' | 'stone' | 'gilt' | 'decoration';
type Feature = 'roof' | 'brackets' | 'columns' | 'lattice' | 'foundation' | 'frieze';

/** Matches createTemple's completed world-space plan, including its grade. */
export const TEMPLE_ARCHITECTURE_LAYOUT = {
  minX: 76, maxX: 106, minZ: -14, maxZ: 22,
  centreX: 91, centreZ: 4, floorY: TEMPLE_GRADE + 1.2,
  lowerRoofY: TEMPLE_GRADE + 12.2, upperRoofY: TEMPLE_GRADE + 15.8,
  maxTriangles: 10_000,
} as const;

export interface TempleArchitectureOptions {
  /** Caller-owned, shared Higgsfield four-band atlas; no map is fetched here. */
  decorativeMaterial?: THREE.MeshStandardMaterial;
}

export interface TempleArchitectureReport {
  pieces: number;
  triangles: number;
  meshes: number;
  materials: number;
  geometryBytes: number;
  atlasPanels: number;
  byFeature: Record<Feature, number>;
  /** The door, sign/bracket, altar and complete stair flight stay unobstructed. */
  clearances: Record<string, { min: XYZ; max: XYZ }>;
}

export interface TempleArchitectureHandle {
  readonly report: TempleArchitectureReport;
  /** End rendering first. Batched geometry belongs to the ending world. */
  dispose(): void;
}

const prepared = new WeakMap<THREE.Scene, TempleArchitectureHandle>();
const L = TEMPLE_ARCHITECTURE_LAYOUT;
const P = (x: number, y: number, z: number): XYZ => [x, y, z];
const vec = (p: XYZ) => new THREE.Vector3(...p);

/** Moulded square section, rather than a stack of unrelated cubes. */
function moulding(levels: readonly (readonly [number, number])[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]] as const;
  const triangle = (a: XYZ, b: XYZ, c: XYZ) => positions.push(...a, ...b, ...c);
  for (let level = 0; level < levels.length - 1; level++) {
    const [low, a] = levels[level], [high, b] = levels[level + 1];
    for (let corner = 0; corner < 4; corner++) {
      const [x1, z1] = corners[corner], [x2, z2] = corners[(corner + 1) % 4];
      const p = P(x1 * a, low, z1 * a), q = P(x2 * a, low, z2 * a);
      const r = P(x1 * b, high, z1 * b), s = P(x2 * b, high, z2 * b);
      triangle(p, q, r); triangle(q, s, r);
    }
  }
  const [bottom, a] = levels[0], [top, b] = levels[levels.length - 1];
  triangle(P(-a, bottom, -a), P(a, bottom, a), P(-a, bottom, a));
  triangle(P(-a, bottom, -a), P(a, bottom, -a), P(a, bottom, a));
  triangle(P(-b, top, -b), P(-b, top, b), P(b, top, b));
  triangle(P(-b, top, -b), P(b, top, b), P(b, top, -b));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(positions.flatMap((_, i) => i % 3 === 0 ? [positions[i], positions[i + 1]] : []), 2));
  return geometry;
}

/** A small swept timber bracket with a stepped, concave underside. */
function bracketGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(.26, 0); shape.lineTo(.54, .14);
  shape.lineTo(.82, .21); shape.lineTo(1.18, .26); shape.lineTo(1.70, .26);
  shape.lineTo(1.70, .41); shape.lineTo(.88, .41); shape.lineTo(.51, .32);
  shape.lineTo(0, .18); shape.closePath();
  const indexed = new THREE.ExtrudeGeometry(shape, { depth: .28, bevelEnabled: false, curveSegments: 1, steps: 1 });
  const geometry = indexed.index ? indexed.toNonIndexed() : indexed;
  if (geometry !== indexed) indexed.dispose();
  geometry.translate(0, 0, -.14);
  return geometry;
}

/**
 * Apply after buildOnGrade(createTemple) and EnvironmentArchitecture, before
 * EnvironmentMaterials.prepare, planet subdivision and static batching.
 * This adds static construction only: no lights, colliders or runtime work.
 * The four optional atlas faces use top-band V .75..1 and second-band .5..75.
 */
export function applyTempleArchitecture(
  scene: THREE.Scene,
  options: TempleArchitectureOptions = {},
): TempleArchitectureHandle {
  const previous = prepared.get(scene);
  if (previous) return previous;

  const report: TempleArchitectureReport = {
    pieces: 0, triangles: 0, meshes: 0, materials: 0, geometryBytes: 0, atlasPanels: 0,
    byFeature: { roof: 0, brackets: 0, columns: 0, lattice: 0, foundation: 0, frieze: 0 },
    clearances: {
      doorway: { min: [70.5, L.floorY - .15, .4], max: [78.3, L.floorY + 5.65, 7.6] },
      identitySign: { min: [70.7, TEMPLE_GRADE + 7.6, -.5], max: [75.91, TEMPLE_GRADE + 11.35, 8.5] },
      altar: { min: [97, L.floorY - .1, -2.7], max: [106, L.floorY + 8.8, 10.7] },
      stairFlight: { min: [64.8, -.3, -2.7], max: [74.45, L.floorY + .1, 10.7] },
    },
  };
  const clear = Object.values(report.clearances).map(bounds => new THREE.Box3(vec(bounds.min), vec(bounds.max)));
  const ownedMaterials = new Set<THREE.Material>();
  const material = (name: string, color: number, roughness = .82, metalness = 0) => {
    const finish = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    finish.name = `Temple joinery ${name}`;
    ownedMaterials.add(finish);
    return finish;
  };
  const decoration = options.decorativeMaterial ?? material('vermilion frieze fallback', 0x8f1d1d, .72);
  const palette: Record<Finish, THREE.MeshStandardMaterial> = {
    timber: material('carved timber', 0x75442b),
    shadow: material('recess shadow', 0x162a32, .98),
    tile: material('glazed roof edging', 0x446e5c, .56, .05),
    stone: material('carved pale stone', 0xb2a990, .90),
    gilt: material('aged gilt', 0xc4a36a, .75, .18),
    decoration,
  };
  for (const finish of ['shadow', 'gilt'] as const) palette[finish].userData.preserveAuthoredSurface = true;
  palette.shadow.userData.environmentAccent = 'ink';
  palette.gilt.userData.environmentAccent = 'amber';
  if (options.decorativeMaterial) {
    // This is an authored atlas, not a tile family. Preserve its colours even
    // when the caller's subsequent art pass traverses every imported surface.
    decoration.userData.preserveAuthoredSurface = true;
    decoration.userData.islandPaletteApplied = true;
  }
  const batches = new Map<Finish, THREE.BufferGeometry[]>();
  const add = (feature: Feature, finish: Finish, geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    if (clear.some(volume => volume.intersectsBox(bounds))) {
      geometry.dispose();
      throw new Error(`Temple ${feature} enters a protected volume`);
    }
    const triangles = geometry.getAttribute('position').count / 3;
    if (report.triangles + triangles > L.maxTriangles) {
      geometry.dispose();
      throw new Error('Temple architectural detail exceeds the source triangle budget');
    }
    const batch = batches.get(finish) ?? [];
    batch.push(geometry); batches.set(finish, batch);
    report.pieces++; report.triangles += triangles; report.byFeature[feature] += triangles;
  };
  const block = (feature: Feature, finish: Finish, size: XYZ, at: XYZ, yaw = 0) => {
    const indexed = new THREE.BoxGeometry(...size), geometry = indexed.toNonIndexed(); indexed.dispose();
    geometry.rotateY(yaw); geometry.translate(...at); add(feature, finish, geometry);
  };
  const beam = (feature: Feature, finish: Finish, from: XYZ, to: XYZ, width: number, depth = width) => {
    const a = vec(from), b = vec(to), direction = b.clone().sub(a), length = direction.length();
    const indexed = new THREE.BoxGeometry(width, length, depth), geometry = indexed.toNonIndexed(); indexed.dispose();
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.divideScalar(length)));
    geometry.translate(...a.add(b).multiplyScalar(.5).toArray() as [number, number, number]);
    add(feature, finish, geometry);
  };

  // Follow the exact eight-edge hip/eave profile used by coastalRoof. Courses
  // and cap strips are shallow relief; the original kicked corners and tiers
  // continue to define the silhouette, including the existing finial.
  const roof = (y: number, width: number, depth: number, rise: number) => {
    const rim: XYZ[] = [
      [-width / 2, .45, -depth / 2], [0, 0, -depth / 2], [width / 2, .45, -depth / 2], [width / 2, 0, 0],
      [width / 2, .45, depth / 2], [0, 0, depth / 2], [-width / 2, .45, depth / 2], [-width / 2, 0, 0],
    ];
    const crown: XYZ[] = [
      [-width * .28, rise, -depth * .28], [0, rise, -depth * .28], [width * .28, rise, -depth * .28], [width * .28, rise, 0],
      [width * .28, rise, depth * .28], [0, rise, depth * .28], [-width * .28, rise, depth * .28], [-width * .28, rise, 0],
    ];
    const world = (point: XYZ, dy = 0): XYZ => [L.centreX + point[0], y + point[1] + dy, L.centreZ + point[2]];
    for (let edge = 0; edge < 8; edge++) {
      const next = (edge + 1) % 8;
      for (const [offset, finish, thickness] of [
        [-.46, 'timber', .11], [-.28, 'gilt', .045], [-.10, 'tile', .10],
      ] as const) beam('roof', finish, world(rim[edge], offset), world(rim[next], offset), thickness);
      beam('roof', 'tile', world(rim[edge], .025), world(crown[edge], .025), .12, .065);
      for (const amount of [.24, .50, .76]) {
        const interpolate = (index: number): XYZ => rim[index].map((value, axis) => value + (crown[index][axis] - value) * amount) as unknown as XYZ;
        beam('roof', 'tile', world(interpolate(edge), .025), world(interpolate(next), .025), .055, .045);
      }
    }
    // Exposed rafter ends occupy the existing eave/soffit band. They are not
    // a new low ceiling, and do not hang over the west entrance or banner.
    const countX = Math.floor(width / 5), countZ = Math.floor(depth / 5);
    for (const side of [-1, 1]) {
      for (let i = 1; i < countZ; i++) block('roof', 'timber', [.72, .18, .19],
        [L.centreX + side * (width / 2 - .45), y - .61, L.centreZ - depth / 2 + depth * i / countZ]);
      for (let i = 1; i < countX; i++) block('roof', 'timber', [.19, .18, .72],
        [L.centreX - width / 2 + width * i / countX, y - .61, L.centreZ + side * (depth / 2 - .45)]);
    }
  };
  roof(L.lowerRoofY, 37, 43, .9 * 2.6);
  roof(L.upperRoofY, 31.5, 37.5, .8 * 2.6);

  // The lower bracket sets fit between EnvironmentArchitecture's existing
  // shoes at west Z -10/-3/11/18. No duplicate portal or competing hangers.
  const bracket = (x: number, z: number, yaw: number) => {
    const outward = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const at = (distance: number, y: number): XYZ => [x + outward.x * distance, y, z + outward.z * distance];
    const geometry = bracketGeometry();
    geometry.rotateY(yaw); geometry.translate(x, L.lowerRoofY - 1.13, z); add('brackets', 'timber', geometry);
    // Below the original soffit at roofY−.775; a buried top bearing joins it,
    // while the stepped undersides and gilt end remain visible from the stair.
    for (const [distance, height, length] of [[.60, -.92, 1.35], [1.02, -.78, 1.85]])
      block('brackets', 'timber', [length, .11, .43], at(distance, L.lowerRoofY + height), yaw);
    block('brackets', 'gilt', [.22, .075, .47], at(1.67, L.lowerRoofY - .79), yaw);
  };
  for (const z of [-12.4, -5.2, 13.2, 20.4]) {
    bracket(75.55, z, Math.PI); bracket(106.45, z, 0);
  }
  for (const x of [81, 91, 101]) {
    bracket(x, -14.45, Math.PI / 2); bracket(x, 22.45, -Math.PI / 2);
  }

  // Socketed square columns retain their original collider and base/capital
  // extents. The new profiles stay within .74 of each shaft centre.
  for (const x of [79.2, 102.8]) for (const z of [-10.8, 18.8]) {
    const shoe = moulding([[.39, .73], [.48, .73], [.55, .69], [.64, .69], [.76, .655], [.88, .655]]);
    shoe.translate(x, L.floorY, z); add('columns', 'stone', shoe);
    const cap = moulding([[9.48, .655], [9.64, .655], [9.77, .70], [9.86, .70], [10.02, .74], [10.19, .74]]);
    cap.translate(x, L.floorY, z); add('columns', 'timber', cap);
    for (const side of [-1, 1]) {
      block('columns', 'gilt', [1.40, .07, .06], [x, L.floorY + .67, z + side * .67]);
      block('columns', 'gilt', [.06, .07, 1.40], [x + side * .67, L.floorY + .67, z]);
      for (const corner of [-1, 1]) {
        block('columns', 'timber', [.045, 8.3, .045], [x + side * .659, L.floorY + 5.15, z + corner * .57]);
        block('columns', 'timber', [.045, 8.3, .045], [x + corner * .57, L.floorY + 5.15, z + side * .659]);
      }
    }
  }

  // A dark set-back field, jointed frame and central lozenge make each lattice
  // a constructed panel. All relief fits inside the existing .16 wall margin.
  const lattice = (centre: XYZ, width: number, yaw: number) => {
    const transform = (u: number, v: number, inset = 0): XYZ => [
      centre[0] + Math.cos(yaw) * u + Math.sin(yaw) * inset,
      centre[1] + v,
      centre[2] - Math.sin(yaw) * u + Math.cos(yaw) * inset,
    ];
    block('lattice', 'shadow', [width, 3.72, .035], transform(0, 0, -.015), yaw);
    for (const v of [-1.88, 1.88]) beam('lattice', 'timber', transform(-width / 2, v, .025), transform(width / 2, v, .025), .11, .065);
    for (const u of [-width / 2, width / 2]) beam('lattice', 'timber', transform(u, -1.88, .025), transform(u, 1.88, .025), .11, .065);
    const diamond: readonly (readonly [number, number])[] = [[-width * .29, 0], [0, 1.43], [width * .29, 0], [0, -1.43]];
    for (let i = 0; i < 4; i++) beam('lattice', 'timber', transform(...diamond[i], .045), transform(...diamond[(i + 1) % 4], .045), .075, .055);
    beam('lattice', 'timber', transform(-width / 2, 0, .045), transform(width / 2, 0, .045), .075, .055);
    beam('lattice', 'timber', transform(0, -1.88, .045), transform(0, 1.88, .045), .075, .055);
  };
  for (const x of [81, 91, 101]) {
    lattice([x, L.floorY + 5.05, -14.52], 6.7, Math.PI);
    lattice([x, L.floorY + 5.05, 22.52], 6.7, 0);
  }
  for (const z of [-10.5, -3.7, 11.7, 18.5]) lattice([75.48, L.floorY + 4.45, z], 5.1, -Math.PI / 2);

  // Dado/coping profiles stay on existing wall faces, above the earlier
  // stone skirting. Neither the finished floor nor the hillside is covered.
  for (const z of [-14.53, 22.53]) {
    block('foundation', 'stone', [29.4, .16, .12], [91, L.floorY + .83, z]);
    block('foundation', 'stone', [29.4, .07, .12], [91, L.floorY + 1.04, z]);
    for (const x of [79, 85, 91, 97, 103]) block('foundation', 'stone', [.05, .55, .12], [x, L.floorY + 1.40, z]);
  }
  for (const z of [-7.1, 15.1]) {
    block('foundation', 'stone', [.12, .16, 10.5], [75.47, L.floorY + .83, z]);
    block('foundation', 'stone', [.12, .07, 10.5], [75.47, L.floorY + 1.04, z]);
  }
  block('foundation', 'stone', [.12, .16, 35.4], [106.53, L.floorY + .83, 4]);

  const frieze = (centre: XYZ, width: number, height: number, yaw: number, band: number) => {
    const indexed = new THREE.PlaneGeometry(width, height), geometry = indexed.toNonIndexed(); indexed.dispose();
    const uv = geometry.getAttribute('uv'), repeats = width / (height * 4), gutter = .002;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeats, 1 - (band + 1) / 4 + gutter + uv.getY(i) * (.25 - gutter * 2));
    geometry.rotateY(yaw); geometry.translate(...centre); add('frieze', 'decoration', geometry);
    const edge = (u: number, v: number): XYZ => [centre[0] + Math.cos(yaw) * u, centre[1] + v, centre[2] - Math.sin(yaw) * u];
    for (const v of [-height / 2 - .055, height / 2 + .055]) beam('frieze', 'timber', edge(-width / 2 - .10, v), edge(width / 2 + .10, v), .09, .10);
    for (const u of [-width / 2 - .055, width / 2 + .055]) beam('frieze', 'timber', edge(u, -height / 2), edge(u, height / 2), .09, .10);
    if (options.decorativeMaterial) report.atlasPanels++;
  };
  for (const z of [-7.1, 15.1]) frieze([75.44, L.floorY + 8.35, z], 10.5, 1.1, -Math.PI / 2, 0);
  frieze([91, L.floorY + 8.35, -14.54], 27.2, .9, Math.PI, 1);
  frieze([91, L.floorY + 8.35, 22.54], 27.2, .9, 0, 1);

  const meshes: THREE.Mesh[] = [], geometries = new Set<THREE.BufferGeometry>();
  const families: Partial<Record<Finish, EnvironmentFamily>> = { timber: 'wood', tile: 'ceramic', stone: 'stone' };
  if (!options.decorativeMaterial) families.decoration = 'wood';
  for (const [finish, pieces] of batches) {
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach(piece => piece.dispose());
    if (!geometry) throw new Error('Temple joinery geometry attributes disagree');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, palette[finish]);
    mesh.name = `Temple architecture · ${finish}`;
    mesh.layers.enable(1); mesh.receiveShadow = true;
    mesh.userData.templeArchitecture = true;
    mesh.userData.environmentArea = 'temple';
    mesh.userData.wornNoMasonry = true; mesh.userData.coastalAuthored = true;
    if (families[finish]) mesh.userData.environmentSurface = { family: families[finish], metres: 2, tint: 'source', uv: 'world' };
    if (finish === 'decoration' && options.decorativeMaterial) mesh.userData.environmentImported = true;
    scene.add(mesh); meshes.push(mesh); geometries.add(geometry);
    for (const attribute of Object.values(geometry.attributes)) report.geometryBytes += attribute.array.byteLength;
  }
  report.meshes = meshes.length; report.materials = new Set(meshes.map(mesh => mesh.material)).size;
  scene.userData.templeArchitectureReport = report;
  let disposed = false;
  const handle: TempleArchitectureHandle = {
    report,
    dispose() {
      if (disposed) return;
      disposed = true;
      const released = new Set<THREE.BufferGeometry>();
      for (const mesh of meshes) {
        mesh.removeFromParent(); released.add(mesh.geometry); mesh.geometry.dispose();
      }
      for (const geometry of geometries) if (!released.has(geometry)) geometry.dispose();
      for (const finish of ownedMaterials) finish.dispose();
      prepared.delete(scene); delete scene.userData.templeArchitectureReport;
    },
  };
  prepared.set(scene, handle);
  return handle;
}
