import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const VICTORY_STATUE_HEIGHT = 7.3;
export const VICTORY_PLINTH_TOP = 2.32;

/** Bake only the existing portrait's head/hair/beard from its seated bind pose.
 * The seated robe cannot stretch into a runner, so it never enters this mesh. */
function portraitHead(source: THREE.Object3D): THREE.Mesh {
  source.updateMatrixWorld(true);
  const head = source.getObjectByName('Head'), crown = source.getObjectByName('head_end'), front = source.getObjectByName('headfront');
  if (!head || !crown || !front) throw new Error('Temple portrait head landmarks unavailable');
  const origin = head.getWorldPosition(new THREE.Vector3());
  const up = crown.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const forward = front.getWorldPosition(new THREE.Vector3()).sub(origin); forward.addScaledVector(up, -forward.dot(up)).normalize();
  const right = up.clone().cross(forward).normalize(), frame = new THREE.Matrix4().makeBasis(right, up, forward).invert();
  let result: THREE.Mesh | undefined;
  source.traverse(node => {
    const mesh = node as THREE.SkinnedMesh; if (!mesh.isSkinnedMesh || result) return;
    mesh.skeleton.update();
    const position = mesh.geometry.getAttribute('position'), ids = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight'), uv = mesh.geometry.getAttribute('uv'), indices = mesh.geometry.index;
    if (!indices || !uv) throw new Error('Temple portrait geometry unavailable');
    const headBones = new Set(mesh.skeleton.bones.flatMap((bone, i) => /^(Head|head_end|headfront)$/.test(bone.name) ? [i] : []));
    const influence = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) for (let k = 0; k < 4; k++) if (headBones.has(ids.getComponent(i, k))) influence[i] += weights.getComponent(i, k);
    const chosen: number[] = [];
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
      if ((influence[a] + influence[b] + influence[c]) / 3 >= .50) chosen.push(a, b, c);
    }
    const vertices = [...new Set(chosen)], mapping = new Map(vertices.map((id, i) => [id, i]));
    if (vertices.length < 30) throw new Error('Temple portrait head extraction failed');
    const positions: number[] = [], uvs: number[] = [], point = new THREE.Vector3();
    for (const id of vertices) {
      mesh.getVertexPosition(id, point).applyMatrix4(mesh.matrixWorld).sub(origin).applyMatrix4(frame);
      positions.push(point.x, point.y, point.z); uvs.push(uv.getX(id), uv.getY(id));
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(chosen.map(id => mapping.get(id)!));
    geometry.computeVertexNormals(); geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!, size = bounds.getSize(new THREE.Vector3()), scale = 1.24 / size.y;
    geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2); geometry.scale(scale, scale, scale); geometry.translate(0, 5.13, 0);
    result = new THREE.Mesh(geometry, mesh.material); result.name = 'Exact temple portrait head';
    result.userData.sourceVertexIds = vertices; result.userData.sourceTriangleIndices = chosen; result.userData.victoryOwnedGeometry = true;
  });
  if (!result) throw new Error('Temple portrait has no head mesh');
  return result;
}

/** The real closed shoe establishes the support plane. */
export function victorySupportBounds(model: THREE.Object3D): THREE.Box3 {
  const shoe = model.getObjectByName('victory-standing-shoe');
  if (!shoe) throw new Error('Victory statue has no standing shoe');
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const corners = shoe.userData.supportCorners as THREE.Vector3[];
  for (const point of corners) box.expandByPoint(point.clone().applyMatrix4(shoe.matrixWorld));
  return box;
}

/** Closed, faceted runner body around the unchanged portrait. All pieces are
 * baked into two static body draws; no new skeleton, animation loop or textures. */
export function createVictoryStatue(source: THREE.Object3D, height = VICTORY_STATUE_HEIGHT): THREE.Group {
  if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid victory statue height');
  const root = new THREE.Group(); root.name = 'GANGAN victory portrait';
  const head = portraitHead(source); root.add(head);
  const gold = new THREE.MeshStandardMaterial({ color: 0xc19a43, roughness: .68, metalness: .18, flatShading: true });
  const trouserGold = new THREE.MeshStandardMaterial({ color: 0xa78334, roughness: .74, metalness: .16, flatShading: true });
  gold.userData.preserveAuthoredSurface = true; trouserGold.userData.preserveAuthoredSurface = true;
  const body: THREE.BufferGeometry[] = [], trousers: THREE.BufferGeometry[] = [];
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const mark = (name: string, at: THREE.Vector3) => { const joint = new THREE.Group(); joint.name = name; joint.position.copy(at); root.add(joint); return joint; };
  const sphere = (at: THREE.Vector3, scale: THREE.Vector3, into = body) => { const geometry = new THREE.SphereGeometry(1, 12, 8); geometry.scale(scale.x, scale.y, scale.z); geometry.translate(at.x, at.y, at.z); into.push(geometry); };
  const limb = (a: THREE.Vector3, b: THREE.Vector3, radiusA: number, radiusB: number, into = body) => {
    const direction = b.clone().sub(a), geometry = new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), 12, 1, false);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(point(0, 1, 0), direction.normalize())); geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); into.push(geometry);
  };
  const hips = point(0, 3.40, 0); mark('Hips', hips); mark('Head', point(0, 5.58, 0)); mark('headfront', point(0, 5.70, .45));
  const torsoProfile = [[0,3.55],[.48,3.55],[.52,3.72],[.58,4.30],[.76,4.67],[.59,4.92],[.24,5.12],[0,5.12]].map(([x,y]) => new THREE.Vector2(x,y));
  const torso = new THREE.LatheGeometry(torsoProfile, 16); torso.scale(1, 1, .66); body.push(torso);
  sphere(point(0,3.42,0), point(.59,.38,.36), trousers);
  limb(point(0,4.99,0), point(0,5.29,0), .22, .21);
  for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
    const shoulder = point(sign * .76, 4.78, 0), elbow = point(sign * 1.66, 5.77, .035), wrist = point(sign * 2.35, 6.64, .07);
    mark(`${side}Shoulder`, shoulder); mark(`${side}Arm`, shoulder); mark(`${side}ForeArm`, elbow); mark(`${side}Hand`, wrist);
    limb(shoulder, elbow, .25, .20); limb(elbow, wrist, .20, .14);
    sphere(shoulder, point(.27,.28,.24)); sphere(elbow, point(.205,.205,.205));
    // Sleeve edge, palm and four separate closed fingers retain a clean V silhouette.
    const cuff = shoulder.clone().lerp(elbow, .35); limb(shoulder, cuff, .30, .27);
    const palmEnd = wrist.clone().add(point(sign * .21,.30,.01)); limb(wrist, palmEnd, .155, .145);
    for (let finger = 0; finger < 4; finger++) {
      const spread = (finger - 1.5) * .079;
      const a = palmEnd.clone().add(point(spread, -.035, 0)), b = a.clone().add(point(sign * .11 + spread * .15, .22 - Math.abs(spread) * .15, .005));
      limb(a,b,.043,.036); sphere(b,point(.036,.04,.036));
    }
    const thumb = wrist.clone().add(point(-sign * .14,.14,.035)); limb(wrist,thumb,.063,.05); sphere(thumb,point(.05,.06,.05));
  }
  const rightHip = point(-.30,3.40,0), rightKnee = point(-.36,1.95,.02), rightAnkle = point(-.36,.39,.015);
  const leftHip = point(.30,3.40,0), leftKnee = point(.92,3.72,1.20), leftAnkle = point(1.03,2.55,.35);
  for (const [side, hip, knee, ankle] of [['Right',rightHip,rightKnee,rightAnkle],['Left',leftHip,leftKnee,leftAnkle]] as const) {
    mark(`${side}UpLeg`,hip); mark(`${side}Leg`,knee); mark(`${side}Foot`,ankle); mark(`${side}ToeBase`,ankle.clone().add(point(0,-.16,.55)));
    limb(hip,knee,.29,.235,trousers); limb(knee,ankle,.235,.17,trousers); sphere(knee,point(.24,.25,.24),trousers);
    const shoeCentre = ankle.clone().add(point(0,-.205,.20));
    sphere(shoeCentre,point(.225,.18,.46),trousers);
    if (side === 'Right') {
      // Invisible transform marker with the exact authored ellipsoid bounds.
      const support = mark('victory-standing-shoe',shoeCentre);
      support.userData.supportCorners = [-1,1].flatMap(x => [-1,1].flatMap(y => [-1,1].map(z => point(x * .225, y * .18, z * .46))));
    }
  }
  for (const [name, pieces, surface] of [['Victory closed gold body',body,gold],['Victory closed gold trousers',trousers,trouserGold]] as const) {
    const geometry = mergeGeometries(pieces, false)!; const mesh = new THREE.Mesh(geometry, surface); mesh.name = name; mesh.userData.victoryOwnedGeometry = true; mesh.userData.victoryOwnedMaterial = true; root.add(mesh); pieces.forEach(geometry => geometry.dispose());
  }
  root.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(root), scale = height / box.getSize(new THREE.Vector3()).y;
  root.scale.setScalar(scale); root.updateMatrixWorld(true);
  const support = victorySupportBounds(root), centre = support.getCenter(new THREE.Vector3()); root.position.add(point(-centre.x,-support.min.y,-centre.z)); root.updateMatrixWorld(true);
  root.userData.victoryStatue = true; root.userData.pose = 'glico-victory'; root.userData.environmentExclude = true;
  root.traverse(node => { node.layers.enable(1); const mesh = node as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.dynamic = true; mesh.userData.wornNoMasonry = true; }
  });
  return root;
}

/** Source head material/textures belong to the venue cache; only the newly
 * authored geometry/body finishes are owned by this runner. */
const disposedVictoryStatues = new WeakSet<THREE.Object3D>();
export function disposeVictoryStatue(model: THREE.Object3D): void {
  if (disposedVictoryStatues.has(model)) return;
  disposedVictoryStatues.add(model);
  model.traverse(node => { const mesh = node as THREE.Mesh; if (!mesh.isMesh) return;
    if (mesh.userData.victoryOwnedGeometry) mesh.geometry.dispose();
    if (mesh.userData.victoryOwnedMaterial) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  });
}
