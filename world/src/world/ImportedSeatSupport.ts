import * as THREE from 'three';
import type { AvatarRig } from './FestivalWorld';
import type { WalkingFloor } from './CoastalPose';

type Probe = { mesh: THREE.SkinnedMesh; vertex: number };
type SeatBody = { model: THREE.Object3D; meshes: THREE.SkinnedMesh[] };
type SeatSupportOptions = {
  body: () => SeatBody;
  clothed: () => boolean;
  available: () => boolean;
  sync: () => void;
  soles: () => Array<Probe & { side: 'Left' | 'Right' }>;
};

/** Contact is read from the rendered trousers/skin, never the hidden control rig. */
export function createImportedSeatSupport(root: THREE.Group, rig: AvatarRig, options: SeatSupportOptions) {
  const body = rig.visualRoot!;
  const p = new THREE.Vector3(), local = new THREE.Vector3(), turn = new THREE.Quaternion();
  const selected = new WeakMap<THREE.Object3D, Map<boolean, Probe[]>>();
  let cached: { key: string; worldBodyY: number; knees: number[] } | undefined;
  const point = ({ mesh, vertex }: Probe) => {
    p.fromBufferAttribute(mesh.geometry.getAttribute('position'), vertex);
    return mesh.localToWorld(mesh.applyBoneTransform(vertex, p));
  };
  const refresh = () => { options.sync(); for (const mesh of options.body().meshes) mesh.skeleton.update(); };
  const parts = [
    [rig.leftLeg, rig.leftKnee, rig.leftAnkle, 'Right'],
    [rig.rightLeg, rig.rightKnee, rig.rightAnkle, 'Left'],
  ] as const;
  const pose = (angles: readonly number[]) => {
    parts.forEach(([hip, knee, ankle], i) => {
      hip.rotation.set(-Math.PI / 2, 0, 0);
      knee?.rotation.set(angles[i], 0, 0);
      if (knee && ankle) ankle.quaternion.copy(turn.copy(hip.quaternion).multiply(knee.quaternion).invert());
    });
  };
  const probes = () => {
    const mounted = options.body(), clothed = options.clothed();
    let sets = selected.get(mounted.model);
    if (!sets) selected.set(mounted.model, sets = new Map());
    let result = sets.get(clothed);
    if (result) return result;
    // Select once in a horizontal-thigh pose. Keep the lowest real vertex in
    // each 3.5cm contact cell; duplicated triangles do not add per-frame work.
    const cells = new Map<string, { probe: Probe; y: number }>();
    for (const mesh of mounted.meshes) {
      const id = String(mesh.userData.componentId ?? '');
      if (!mesh.visible || (id !== 'body' && id !== 'garment-trousers')) continue;
      const vertices = mesh.geometry.getAttribute('position');
      const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
      const covered = mesh.geometry.getAttribute(options.clothed() ? '_covered' : '_dressed');
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        if (id === 'body' && (covered?.getX(vertex) ?? 0) > .5) continue;
        let pelvicWeight = 0;
        for (let k = 0; k < 4; k++) {
          const name = mesh.skeleton.bones[indices.getComponent(vertex, k)].name;
          if (name === 'Hips' || name === 'LeftUpLeg' || name === 'RightUpLeg') pelvicWeight += weights.getComponent(vertex, k);
        }
        if (pelvicWeight < .7) continue;
        const probe = { mesh, vertex };
        local.copy(point(probe)); root.worldToLocal(local);
        if (Math.abs(local.x) > .58 || local.z < -.32 || local.z > .62 || local.y < .6 || local.y > 1.4) continue;
        const cell = Math.floor(local.x / .035) + ':' + Math.floor(local.z / .035);
        if (!cells.has(cell) || cells.get(cell)!.y > local.y) cells.set(cell, { probe, y: local.y });
      }
    }
    result = [...cells.values()].map(v => v.probe);
    sets.set(clothed, result);
    return result;
  };
  const contacts = (pad?: THREE.Box3) => probes().flatMap(probe => {
    const at = point(probe);
    // A thigh beyond the front edge cannot support the pelvis on that chair.
    if (pad && (at.x < pad.min.x || at.x > pad.max.x || at.z < pad.min.z || at.z > pad.max.z)) return [];
    return [at.clone()];
  });
  const footGap = (side: 'Left' | 'Right', floor: WalkingFloor) => {
    let gap = Infinity;
    for (const sole of options.soles()) {
      if (sole.side !== side) continue;
      const at = point(sole);
      gap = Math.min(gap, at.y - floor(at.x, at.z, at.y));
    }
    return gap;
  };
  const solveKnees = (floor: WalkingFloor) => {
    const angles = parts.map(([, knee]) => knee?.rotation.x ?? 0);
    parts.forEach(([, knee, , side], i) => {
      if (!knee) return;
      const gapAt = (angle: number) => { angles[i] = angle; pose(angles); refresh(); return footGap(side, floor); };
      // The shin hangs vertically on a tall stool; a reachable floor lifts it
      // forward at the knee, without tipping the supporting thigh downward.
      let low = 0, high = Math.PI / 2;
      if (gapAt(high) < 0) {
        for (let iteration = 0; iteration < 12; iteration++) {
          const middle = (low + high) / 2;
          if (gapAt(middle) > 0) low = middle; else high = middle;
        }
      } else low = high;
      angles[i] = (low + high) / 2;
    });
    pose(angles);
    return angles;
  };
  const support = (floor: WalkingFloor, pad?: THREE.Box3) => {
    const anchor = root.getWorldPosition(new THREE.Vector3());
    const padTop = pad?.max.y ?? anchor.y + rig.leftLeg.position.y - .23;
    const bounds = pad ? [...pad.min.toArray(), ...pad.max.toArray()] : [padTop];
    const floorSamples = [-.26, .26].map(x => {
      local.set(x, 0, .9); root.localToWorld(local);
      return floor(local.x, local.z, padTop);
    });
    // Remote interpolation may still be settling the network origin in Y.
    // The rendered seat and foot supports are fixed, so reuse their solved
    // world height while compensating that origin instead of solving again.
    const transform=root.matrixWorld.elements.map((v,i)=>i===13?0:v);
    const key = [options.body().model.uuid, options.clothed(), ...transform, ...bounds, ...floorSamples]
      .map(v => typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v).join(',');
    if (cached?.key === key) { body.position.y = cached.worldBodyY-anchor.y; pose(cached.knees); return; }
    if (!options.available()) return;
    body.position.y = 0; pose([Math.PI / 2, Math.PI / 2]); refresh();
    let angles = [Math.PI / 2, Math.PI / 2];
    // Knee weights can softly affect the front of the trousers. Recheck the
    // visible support after the foot solve, rather than assuming a joint size.
    for (let iteration = 0; iteration < 3; iteration++) {
      refresh();
      const bottom = Math.min(...contacts(pad).map(at => at.y));
      const correction = padTop + .004 - bottom;
      if (Number.isFinite(correction) && (pad || Math.abs(correction) < .5)) body.position.y += correction;
      angles = solveKnees(floor);
    }
    cached = { key, worldBodyY: body.position.y+anchor.y, knees: angles };
    refresh();
  };
  const snapshot = (pad?: THREE.Box3) => { refresh(); return contacts(pad); };
  return { support, snapshot };
}
