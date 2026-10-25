import * as THREE from 'three';
import type { AvatarRig } from './FestivalWorld';
import { seatCoastalLegs, setCoastalFists, walkCoastalPose, type WalkingFloor } from './CoastalPose';

export type CoastalRelaxationPose = 'ground-sit' | 'chair-sit' | 'recline';
type Probe = { mesh: THREE.Mesh; vertex: number; head?: boolean };
type ContactCache = { key: string; worldY: number; probes: Probe[]; measurements: number; headPitch?: number };
type FittedRest = Pick<ContactCache, 'worldY' | 'headPitch'>;
const cache = new WeakMap<AvatarRig, ContactCache>();
const probeSets = new WeakMap<AvatarRig, Map<string, Probe[]>>();
// Scalar fits survive getting up, so fixed mats can be prepared under the gate.
// Ground rests remain single-entry; their arbitrary positions cannot grow a map.
const reclineFits = new Map<string, FittedRest>();
// Reuse the costly native silhouette reduction across bodies/wardrobes. Values
// contain only vertex indices: no retired avatar/material is kept alive here.
const reclineSurfaces = new WeakMap<THREE.BufferGeometry, Map<string, Array<Pick<Probe, 'vertex' | 'head'>>>>();
const point = new THREE.Vector3(), local = new THREE.Vector3();

function wearingSwimwear(root: THREE.Object3D): boolean {
  // Selected outfit 4 and water-forced swimwear share the same visible body.
  // The native renderer knows both, whereas the legacy flag knows only water.
  const variant = root.userData.importedAvatar?.variant as string | undefined;
  return variant ? variant.endsWith('-swim') : Boolean(root.userData.wearingSwimwear);
}

function shown(mesh: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = mesh; current; current = current.parent) if (!current.visible) return false;
  return true;
}
function meshesOf(rig: AvatarRig): THREE.Mesh[] {
  const root = rig.visualRoot?.parent;
  const imported = root?.userData.importedAvatar?.meshes as THREE.SkinnedMesh[] | undefined;
  if (imported) return imported.filter(shown);
  const meshes: THREE.Mesh[] = [];
  rig.visualRoot?.traverse(object => { if ((object as THREE.Mesh).isMesh && shown(object) && object !== rig.treat) meshes.push(object as THREE.Mesh); });
  return meshes;
}
function refresh(rig: AvatarRig, meshes: THREE.Mesh[]): void {
  rig.visualRoot?.parent?.userData.syncImportedAvatar?.();
  rig.visualRoot?.parent?.updateWorldMatrix(true, true);
  const skeletons = new Set<THREE.Skeleton>();
  for (const mesh of meshes) if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((mesh as THREE.SkinnedMesh).skeleton);
  for (const skeleton of skeletons) skeleton.update();
}
function vertexAt(probe: Probe): THREE.Vector3 {
  point.fromBufferAttribute(probe.mesh.geometry.getAttribute('position'), probe.vertex);
  if ((probe.mesh as THREE.SkinnedMesh).isSkinnedMesh) (probe.mesh as THREE.SkinnedMesh).applyBoneTransform(probe.vertex, point);
  return point.applyMatrix4(probe.mesh.matrixWorld);
}
function contactProbes(rig: AvatarRig, meshes: THREE.Mesh[], reclining: boolean): Probe[] {
  const root = rig.visualRoot!.parent!, inverse = root.matrixWorld.clone().invert(), headInverse = rig.head.matrixWorld.clone().invert();
  const swimwear = wearingSwimwear(root);
  const bodyInverse = rig.visualRoot!.matrixWorld.clone().invert();
  const cells = new Map<string, { probe: Probe; y: number }>();
  const result: Probe[] = [];
  for (const mesh of meshes) {
    const surfaceKey = `${root.userData.importedAvatar?.variant ?? ''}:${swimwear}:${mesh.userData.componentId ?? mesh.name}`;
    const prepared = reclining ? reclineSurfaces.get(mesh.geometry)?.get(surfaceKey) : undefined;
    if (prepared) { result.push(...prepared.map(probe => ({ ...probe, mesh }))); continue; }
    if (reclining) cells.clear();
    const positions = mesh.geometry.getAttribute('position');
    const hidden = mesh.userData.componentId === 'body'
      ? mesh.geometry.getAttribute(swimwear ? '_dressed' : '_covered') : undefined;
    const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    const skullBones = (mesh as THREE.SkinnedMesh).skeleton?.bones.map(bone => /^(head|head_end|headfront|neck)$/i.test(bone.name));
    for (let vertex = 0; vertex < positions.count; vertex++) {
      if (hidden && hidden.getX(vertex) > .5) continue;
      let headWeight = 0;
      if (reclining && skullBones && indices && weights) for (let k = 0; k < 4; k++) {
        if (skullBones[indices.getComponent(vertex, k)]) headWeight += weights.getComponent(vertex, k);
      }
      const head = reclining && (headWeight >= .5 || (!skullBones && rig.head.getObjectById(mesh.id)));
      const probe: Probe = { mesh, vertex, head: Boolean(head) }; const at = vertexAt(probe);
      if (head) {
        // Keep the rear surface at each head-local height, rather than one
        // lowest skull point. These contacts remain valid as the neck tucks.
        local.copy(at).applyMatrix4(headInverse);
        const key = 'head:' + Math.floor(local.x / .01) + ':' + Math.floor(local.y / .01);
        if (!cells.has(key) || cells.get(key)!.y > local.z) cells.set(key, { probe, y: local.z });
        continue;
      }
      local.copy(at).applyMatrix4(reclining ? bodyInverse : inverse);
      const key = Math.floor(local.x / .045) + ':' + Math.floor((reclining ? local.y : local.z) / .045);
      const bottom = reclining ? local.z : at.y;
      if (!cells.has(key) || cells.get(key)!.y > bottom) cells.set(key, { probe, y: bottom });
    }
    if (reclining) {
      const reduced = [...cells.values()].map(cell => cell.probe);
      let byVariant = reclineSurfaces.get(mesh.geometry); if (!byVariant) reclineSurfaces.set(mesh.geometry, byVariant = new Map());
      byVariant.set(surfaceKey, reduced.map(({ vertex, head }) => ({ vertex, head })));
      result.push(...reduced);
    }
  }
  return reclining ? result : [...cells.values()].map(cell => cell.probe);
}

/** A measured, held rest. Only the visual body moves; its network origin stays put. */
export function poseRelaxedCoastal(rig: AvatarRig, pose: CoastalRelaxationPose, floor: WalkingFloor, support?: THREE.Mesh): void {
  const body = rig.visualRoot, root = body?.parent;
  if (!body || !root || root.userData.importedCulled?.() || root.userData.cullThrottle) return;
  root.userData.coastalRelaxation = pose;
  root.userData.setImportedMove?.(null);
  walkCoastalPose(rig, 0, 0); setCoastalFists(rig, false);
  body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
  rig.board.visible = false; rig.treat.visible = false;
  rig.head.rotation.set(0, 0, 0);
  if (pose === 'recline') {
    const normal = support ? new THREE.Vector3(0, 1, 0).applyQuaternion(support.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Vector3(0, 1, 0);
    normal.applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    body.position.z = 1.4;
    rig.leftLeg.rotation.set(-.035, 0, -.05); rig.rightLeg.rotation.set(-.035, 0, .05);
    rig.leftKnee?.rotation.set(.07, 0, 0); rig.rightKnee?.rotation.set(.07, 0, 0);
    rig.leftAnkle?.rotation.set(.55, 0, 0); rig.rightAnkle?.rotation.set(.55, 0, 0);
    rig.torso.rotation.set(.30, 0, 0); rig.head.rotation.x = .08;
    rig.leftArm.rotation.set(0, 0, -.22); rig.rightArm.rotation.set(0, 0, .22);
    rig.leftElbow?.rotation.set(-.22, 0, 0); rig.rightElbow?.rotation.set(-.22, 0, 0);
  } else {
    const ground = pose === 'ground-sit';
    rig.leftLeg.rotation.set(ground ? -2.25 : -Math.PI / 2, 0, ground ? -.065 : 0);
    rig.rightLeg.rotation.set(ground ? -2.25 : -Math.PI / 2, 0, ground ? .065 : 0);
    rig.leftKnee?.rotation.set(ground ? 2.72 : Math.PI / 2, 0, 0); rig.rightKnee?.rotation.set(ground ? 2.72 : Math.PI / 2, 0, 0);
    rig.leftAnkle?.rotation.set(ground ? -.47 : 0, 0, 0); rig.rightAnkle?.rotation.set(ground ? -.47 : 0, 0, 0);
    rig.torso.rotation.set(ground ? -.06 : .035, 0, 0);
    rig.leftArm.rotation.set(-.45, 0, -.23); rig.rightArm.rotation.set(-.45, 0, .23);
    rig.leftElbow?.rotation.set(-.7, 0, 0); rig.rightElbow?.rotation.set(-.7, 0, 0);
    if (!ground && root.userData.supportImportedSeat && support) {
      seatCoastalLegs(rig, floor, new THREE.Box3().setFromObject(support));
      return;
    }
  }
  const meshes = meshesOf(rig); root.updateWorldMatrix(true, false);
  const rootY = root.getWorldPosition(new THREE.Vector3()).y;
  const signature = meshes.map(mesh => mesh.geometry.uuid).join(',');
  const transform = root.matrixWorld.elements.map((value, index) => index === 13 ? 0 : Math.round(value * 1e5) / 1e5);
  const samples = [[0, 0], [-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8], [0, -2], [0, 2]].map(([x, z]) => {
    local.set(x, 0, z); root.localToWorld(local); return floor(local.x, local.z, rootY);
  });
  const swimwear = wearingSwimwear(root);
  const key = [pose, signature, swimwear, ...transform, ...samples, ...(support?.matrixWorld.elements ?? [])].join('|');
  const previous = cache.get(rig);
  if (previous?.key === key) {
    body.position.y = previous.worldY - rootY;
    if (previous.headPitch !== undefined) rig.head.rotation.x = previous.headPitch;
    root.userData.syncImportedAvatar?.(); return;
  }
  refresh(rig, meshes);
  let sets = probeSets.get(rig); if (!sets) probeSets.set(rig, sets = new Map());
  const probeKey = [pose, signature, swimwear, ...body.quaternion.toArray().map(v => Math.round(v * 1e4) / 1e4)].join('|');
  let probes = sets.get(probeKey);
  if (!probes) { probes = contactProbes(rig, meshes, pose === 'recline'); sets.set(probeKey, probes); }
  const preparedFit = pose === 'recline' ? reclineFits.get(key) : undefined;
  if (preparedFit) {
    body.position.y = preparedFit.worldY - rootY;
    if (preparedFit.headPitch !== undefined) rig.head.rotation.x = preparedFit.headPitch;
    refresh(rig, meshes);
    cache.set(rig, { key, ...preparedFit, probes, measurements: previous?.measurements ?? 0 });
    return;
  }
  const pad = pose === 'chair-sit' && support ? new THREE.Box3().setFromObject(support) : undefined;
  let lift = -Infinity;
  for (const probe of probes) {
    // An oversized skull must not be the support for the entire torso/legs.
    if (pose === 'recline' && probe.head) continue;
    const at = vertexAt(probe); let surface = floor(at.x, at.z, rootY);
    if (pad && at.x >= pad.min.x && at.x <= pad.max.x && at.z >= pad.min.z && at.z <= pad.max.z) surface = Math.max(surface, pad.max.y);
    lift = Math.max(lift, surface + .012 - at.y);
  }
  if (Number.isFinite(lift)) body.position.y += lift;
  refresh(rig, meshes);
  let headPitch: number | undefined;
  if (pose === 'recline') {
    const head = probes.filter(probe => probe.head);
    if (head.length) {
      const headGap = (pitch: number) => {
        rig.head.rotation.x = pitch; refresh(rig, meshes);
        let gap = Infinity;
        for (const probe of head) { const at = vertexAt(probe); gap = Math.min(gap, at.y - floor(at.x, at.z, rootY)); }
        return gap;
      };
      const clearance = .025;
      let low = .08, high = 1.;
      if (headGap(low) >= clearance) high = low;
      else if (headGap(high) >= clearance) {
        // A bounded solve happens only when this model/support changes.
        for (let i = 0; i < 10; i++) { const mid = (low + high) / 2; if (headGap(mid) < clearance) low = mid; else high = mid; }
      }
      headPitch = high;
      const gap = headGap(headPitch);
      // A future incompatible skull still clears the cloth, without a NaN
      // pose. Current native bodies fit through the neck's bounded range.
      if (gap < clearance) { body.position.y += clearance - gap; refresh(rig, meshes); }
    }
  }
  cache.set(rig, { key, worldY: rootY + body.position.y, probes, measurements: (previous?.measurements ?? 0) + 1, headPitch });
  if (pose === 'recline') {
    // 64 current sex/outfit/cap/mat combinations fit comfortably. Keep a firm
    // ceiling even if an embedding moves its mats around dynamically.
    if (reclineFits.size >= 256 && !reclineFits.has(key)) reclineFits.delete(reclineFits.keys().next().value!);
    reclineFits.set(key, { worldY: rootY + body.position.y, headPitch });
  }
}

export interface CoastalReclineTarget {
  position: THREE.Vector3;
  anchor?: THREE.Vector3;
  facing: number;
  surfaceHeightAt: WalkingFloor;
  support: THREE.Mesh;
}

/** Entry-loading CPU preparation only: no render, decoder, texture or new rig.
 * Equivalent native instances share scalar fits and reduced geometry indices. */
export function prepareCoastalReclines(rig: AvatarRig, targets: readonly CoastalReclineTarget[], groundOffset = .28): number {
  const root = rig.visualRoot?.parent;
  if (!root || root.userData.importedMoveActive?.()) return 0;
  const objects = [...new Set([root, ...Object.values(rig).filter((value): value is THREE.Object3D => value instanceof THREE.Object3D)])];
  const saved = objects.map(object => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), visible: object.visible }));
  const marker = root.userData.coastalRelaxation, throttle = root.userData.cullThrottle;
  const culled = root.userData.importedCulled?.(), held = cache.get(rig);
  let prepared = 0;
  try {
    root.visible = true; if (rig.visualRoot) rig.visualRoot.visible = true;
    root.userData.cullThrottle = false; root.userData.setImportedCulled?.(false);
    for (const target of targets) {
      root.position.copy(target.anchor ?? target.position); root.position.y = target.position.y + groundOffset;
      root.rotation.set(0, target.facing, 0);
      poseRelaxedCoastal(rig, 'recline', target.surfaceHeightAt, target.support);
      if (cache.get(rig)?.headPitch !== undefined) prepared++;
    }
  } finally {
    for (const { object, position, quaternion, scale, visible } of saved) {
      object.position.copy(position); object.quaternion.copy(quaternion); object.scale.copy(scale); object.visible = visible;
    }
    if (marker === undefined) delete root.userData.coastalRelaxation; else root.userData.coastalRelaxation = marker;
    root.userData.syncImportedAvatar?.();
    if (throttle === undefined) delete root.userData.cullThrottle; else root.userData.cullThrottle = throttle;
    if (culled !== undefined) root.userData.setImportedCulled?.(culled);
    if (held) cache.set(rig, held); else cache.delete(rig);
  }
  return prepared;
}

/** Local review reads the same visible contact vertices used by the fit. */
export function relaxedCoastalContactSnapshot(rig: AvatarRig, floor: WalkingFloor) {
  const entry = cache.get(rig); if (!entry) return undefined;
  refresh(rig, meshesOf(rig));
  let minClearance = Infinity;
  for (const probe of entry.probes) { const p = vertexAt(probe); minClearance = Math.min(minClearance, p.y - floor(p.x, p.z, p.y)); }
  return { minClearance, contacts: entry.probes.length, measurements: entry.measurements, bodyY: rig.visualRoot?.position.y, headPitch: entry.headPitch };
}

/** End an explicit rest before walking/jumping; no mat-local offset survives. */
export function clearRelaxedCoastal(rig: AvatarRig): void {
  const body = rig.visualRoot; if (!body) return;
  body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
  if (body.parent) delete body.parent.userData.coastalRelaxation;
  cache.delete(rig);
}
