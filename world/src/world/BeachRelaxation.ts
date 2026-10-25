import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coastalMaterial } from './CoastalAvatar';
import { COASTAL_ROUTES } from './CoastalCirculation';
import { SEA_Y, terrainHeightAt } from './CoastalTerrain';

export type BeachRelaxationKind = 'chair' | 'mat';
export interface BeachRelaxationBounds { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; }
export interface BeachRelaxationSpot {
  id: string;
  kind: BeachRelaxationKind;
  /** Interaction centre, on the actual ground rather than the avatar datum. */
  position: THREE.Vector3;
  facing: number;
  /** Top of the supporting pad at its centre. The pose helper fits the body. */
  anchor: THREE.Vector3;
  normal: THREE.Vector3;
  /** An undrawn, exact copy of the visible batched pad, retained for contact. */
  support: THREE.Mesh;
  footprint: BeachRelaxationBounds;
  exitPoints: THREE.Vector3[];
  surfaceHeightAt: (x: number, z: number) => number;
}
export interface BeachRelaxationOptions {
  /** Geometry surface Y, not `groundHeightAt`'s avatar-origin Y. */
  heightAt?: (x: number, z: number) => number;
  clear?: (bounds: BeachRelaxationBounds) => boolean;
}

/** Hand-placed in the two open beach wings, outside the film bays and yoga. */
export const BEACH_RELAXATION_LAYOUT = [
  { id: 'BEACH-CHAIR-1', kind: 'chair', x: -100, z: -31, facing: -Math.PI / 2 },
  { id: 'BEACH-CHAIR-2', kind: 'chair', x: -84, z: -41, facing: Math.PI },
  { id: 'BEACH-CHAIR-3', kind: 'chair', x: -65, z: -49, facing: Math.PI },
  { id: 'BEACH-CHAIR-4', kind: 'chair', x: 69, z: -45, facing: Math.PI },
  { id: 'BEACH-CHAIR-5', kind: 'chair', x: 86, z: -47, facing: Math.PI },
  { id: 'BEACH-CHAIR-6', kind: 'chair', x: 110, z: -44, facing: Math.PI / 2 },
  { id: 'BEACH-MAT-1', kind: 'mat', x: -96, z: -38, facing: -Math.PI * .75 },
  { id: 'BEACH-MAT-2', kind: 'mat', x: -74, z: -43, facing: Math.PI },
  { id: 'BEACH-MAT-3', kind: 'mat', x: 61, z: -50, facing: Math.PI },
  { id: 'BEACH-MAT-4', kind: 'mat', x: 99, z: -47, facing: Math.PI * .75 },
] as const;

const overlaps = (a: BeachRelaxationBounds, b: BeachRelaxationBounds, gap = 0) =>
  a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;
const MAT_STRIPES = [-1.82, -1.13, -.44, .25, .94, 1.63] as const;
function routeDistance(x: number, z: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(.0001, dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

/** Ten small props, merged by material; no downloads, timers or new shaders. */
export function createBeachRelaxation(options: BeachRelaxationOptions = {}) {
  const heightAt = options.heightAt ?? terrainHeightAt, clear = options.clear ?? (() => true);
  const root = new THREE.Group(); root.name = 'Beach relaxation';
  const spots: BeachRelaxationSpot[] = [], colliders: Array<BeachRelaxationBounds & { id: string; label: string; viewTop: number }> = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  const materials = {
    wood: coastalMaterial(0x82694b), ink: coastalMaterial(0x303633), cream: coastalMaterial(0xe1d4b8),
    red: coastalMaterial(0xa84e42), green: coastalMaterial(0x526951),
  };
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const supportMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const add = (parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], material: THREE.Material, rotateX = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...at); mesh.rotation.x = rotateX;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.wornNoMasonry = true; parent.add(mesh); return mesh;
  };
  const corner = new THREE.Vector3();
  for (const spec of BEACH_RELAXATION_LAYOUT) {
    const width = spec.kind === 'chair' ? 2.4 : 2.5, depth = spec.kind === 'chair' ? 3.1 : 4.6;
    const heading = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spec.facing);
    const samples: THREE.Vector3[] = [];
    for (const x of [-width / 2, 0, width / 2]) for (const z of [-depth / 2, 0, depth / 2]) {
      const p = new THREE.Vector3(x, 0, z).applyQuaternion(heading); p.x += spec.x; p.z += spec.z; p.y = heightAt(p.x, p.z); samples.push(p);
    }
    const low = Math.min(...samples.map(p => p.y)), high = Math.max(...samples.map(p => p.y));
    const footprint: BeachRelaxationBounds = { minX: Math.min(...samples.map(p => p.x)), maxX: Math.max(...samples.map(p => p.x)), minZ: Math.min(...samples.map(p => p.z)), maxZ: Math.max(...samples.map(p => p.z)), minY: low - .05, maxY: high + (spec.kind === 'chair' ? 2.5 : .3) };
    let reason = low < SEA_Y + .16 ? 'wet footprint' : high - low > .7 ? 'uneven ground' : '';
    if (!reason && COASTAL_ROUTES.some(route => route.points.slice(1).some((end, i) => samples.some(p => routeDistance(p.x, p.z, route.points[i], end) < route.width / 2 + .7)))) reason = 'route clearance';
    if (!reason && spots.some(spot => overlaps(spot.footprint, footprint, .8))) reason = 'prop clearance';
    if (!reason && !clear(footprint)) reason = 'scenery clearance';
    const exitPoints: THREE.Vector3[] = [];
    for (const [x, z] of [[-width / 2 - .9, 0], [width / 2 + .9, 0], [0, depth / 2 + .9], [0, -depth / 2 - .9]]) {
      const p = new THREE.Vector3(x, 0, z).applyQuaternion(heading); p.x += spec.x; p.z += spec.z; p.y = heightAt(p.x, p.z);
      if (p.y < SEA_Y + .16 || !clear({ minX: p.x - .5, maxX: p.x + .5, minZ: p.z - .5, maxZ: p.z + .5, minY: p.y + .02, maxY: p.y + 3.1 })) continue;
      exitPoints.push(p);
    }
    if (!reason && !exitPoints.length) reason = 'no dry exit';
    if (reason) { rejected.push({ id: spec.id, reason }); continue; }
    const group = new THREE.Group(); group.name = spec.id; group.quaternion.copy(heading);
    const centreHeight = heightAt(spec.x, spec.z), normal = new THREE.Vector3(0, 1, 0);
    let pad: THREE.Mesh;
    if (spec.kind === 'chair') {
      group.position.set(spec.x, high + .015, spec.z);
      pad = add(group, [1.68, .16, 1.6], [0, .76, .02], materials.cream);
      add(group, [1.68, 1.45, .14], [0, 1.47, -.89], materials.green, -.16);
      for (const x of [-.89, .89]) {
        for (const z of [-.72, .73]) {
          corner.set(x, 0, z).applyQuaternion(heading); const floor = heightAt(spec.x + corner.x, spec.z + corner.z) - group.position.y;
          add(group, [.12, .78 - floor, .12], [x, (floor + .78) / 2, z], materials.wood);
        }
        add(group, [.15, .15, 1.72], [x, 1.04, -.01], materials.wood);
        add(group, [.12, .36, .12], [x, .9, .64], materials.ink);
      }
      for (const z of [-.55, -.16, .23, .61]) add(group, [1.71, .018, .12], [0, .849, z], materials.red);
      for (const x of [-.58, .58]) add(group, [.095, 1.42, .025], [x, 1.47, -.806], materials.cream, -.16);
    } else {
      const dx = (heightAt(spec.x + .5, spec.z) - heightAt(spec.x - .5, spec.z));
      const dz = (heightAt(spec.x, spec.z + .5) - heightAt(spec.x, spec.z - .5));
      normal.set(-dx, 1, -dz).normalize();
      const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      group.quaternion.copy(tilt.multiply(heading));
      const base = Math.max(...samples.map(p => p.y - dx * (p.x - spec.x) - dz * (p.z - spec.z)));
      group.position.set(spec.x, base + .06 / normal.y + .008, spec.z);
      pad = add(group, [2.25, .12, 4.3], [0, 0, 0], materials.green);
      for (const z of MAT_STRIPES) add(group, [2.26, .016, .22], [0, .068, z], materials.cream);
      // The two native heads have different rear silhouettes. A pillow that
      // reaches their napes supports both without moving the mat footprint.
      add(group, [1.24, .14, .9], [0, .15, -1.4], materials.red);
    }
    group.updateMatrixWorld(true);
    const anchor = pad.localToWorld(new THREE.Vector3(0, spec.kind === 'chair' ? .08 : .06, 0));
    const support = pad.clone(); support.name = spec.id + '-support'; support.visible = false; support.material = supportMaterial;
    support.userData.environmentExclude = true; support.raycast = () => {};
    pad.matrixWorld.decompose(support.position, support.quaternion, support.scale); root.add(support);
    const inverse = group.matrixWorld.clone().invert(), surfacePoint = new THREE.Vector3();
    const surfaceHeightAt = (x: number, z: number) => {
      const plane = anchor.y - (normal.x * (x - anchor.x) + normal.z * (z - anchor.z)) / normal.y;
      if (spec.kind === 'mat') {
        // Test each top at its own height: a tilted box projects a slightly
        // different footprint than the base pad. Bare green cloth is not a stripe.
        const pillow = plane + .16 / normal.y;
        let local = surfacePoint.set(x, pillow, z).applyMatrix4(inverse);
        if (Math.abs(local.x) < .62 && local.z > -1.85 && local.z < -.95) return pillow;
        const stripe = plane + .016 / normal.y;
        local = surfacePoint.set(x, stripe, z).applyMatrix4(inverse);
        if (Math.abs(local.x) < 1.13 && MAT_STRIPES.some(centre => Math.abs(local.z - centre) < .11)) return stripe;
        return plane;
      }
      return plane;
    };
    // Placement bounds deliberately include extra clearance. The follow camera
    // needs the visible back's actual top so that margin is not a head-high wall.
    const visibleTop = new THREE.Box3().setFromObject(group).max.y;
    for (const child of group.children) {
      const mesh = child as THREE.Mesh; const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const list = batches.get(mesh.material as THREE.Material) ?? []; list.push(geometry); batches.set(mesh.material as THREE.Material, list);
      mesh.geometry.dispose();
    }
    // The support copy owns an independent geometry after batching consumed its source.
    support.geometry = spec.kind === 'chair' ? new THREE.BoxGeometry(1.68, .16, 1.6) : new THREE.BoxGeometry(2.25, .12, 4.3);
    spots.push({ id: spec.id, kind: spec.kind, position: new THREE.Vector3(spec.x, centreHeight, spec.z), facing: spec.facing, anchor, normal, support, footprint, exitPoints, surfaceHeightAt });
    if (spec.kind === 'chair') colliders.push({ ...footprint, id: spec.id, label: 'beach-chair', viewTop: visibleTop });
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries); geometries.forEach(part => part.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Beach relaxation batch'; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.wornNoMasonry = true; root.add(mesh);
  }
  return { root, spots, colliders, rejected };
}
