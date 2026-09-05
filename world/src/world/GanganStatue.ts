import * as THREE from 'three';

/**
 * GANGAN, cast in gold, on a rearing horse.
 *
 * The pose is David's *Napoleon Crossing the Alps*, and the important thing
 * about that painting is that the horse is in **profile** while the rider's
 * body is turned out of it towards you. So the statue is set across the road
 * rather than down it: an arrival gets the animal side on, which is the only
 * view in which a horse is a horse, and GANGAN's chest and face turned to
 * them.
 *
 * Local +Z is the way the horse points. Local +X is where the rider faces.
 *
 * The body pivots at the hip and the hind legs do not go with it.
 *
 * Two earlier versions tipped the whole animal — first about its body, then
 * about its hind feet — and both tipped the legs over too, which is two slabs
 * leaning at thirty degrees and not a horse standing on anything. A rearing
 * horse keeps its hind legs under itself and bends them; only the body goes
 * back. So the legs are built downwards from a fixed hip to the stone, where
 * they stay, and the one rotation that rears the animal is on the body alone.
 *
 * Everything is a scaled unit cube, like every other body in the festival.
 */

const gold = (color: number, roughness: number, metalness: number) => new THREE.MeshStandardMaterial({
  color,
  roughness,
  metalness,
  flatShading: true,
});

const block = (
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  parent: THREE.Object3D,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

/** How far the body is tipped back. The legs do not go with it. */
const REAR_PITCH = -0.5;
/** Where the hip sits above the stone, which is what the hind legs reach up to. */
const HIP_Y = 4.5;
const HIP_Z = -1.0;

/**
 * The volume the piece fills, for the projector compositor alone — how much of
 * the screen it can cover, so a film is not painted over a horse standing in
 * front of it. Square in plan, because the statue is set at a right angle to
 * the road and a box that swapped its sides with it would be a second thing to
 * keep in step.
 */
export const GANGAN_STATUE_SIZE = { width: 7.2, height: 9.8, depth: 7.2 } as const;

export const createGanganStatue = (): THREE.Group => {
  const root = new THREE.Group();
  root.name = 'gangan-statue';

  // Metalness stays low. A properly metallic surface takes its colour almost
  // entirely from what it has to reflect, and this world has no environment
  // map — set honestly the whole statue comes out black. The gold has to live
  // in the colour, not in the shading model.
  //
  // The horse and the man are given different golds on purpose: no amount of
  // modelling separates two masses that are the same yellow.
  const hide = gold(0xa87a26, 0.48, 0.24);
  const hideLit = gold(0xcfa03c, 0.4, 0.28);
  const hideDeep = gold(0x6b4a12, 0.58, 0.18);
  const man = gold(0xf2d478, 0.26, 0.36);
  const manDeep = gold(0xb98c34, 0.42, 0.3);
  const stone = gold(0x2b2724, 0.92, 0.02);
  const stoneLip = gold(0x3d382f, 0.86, 0.04);

  // --- plinth ---------------------------------------------------------------
  block('plinth-base', [6.0, 0.5, 4.6], [0, 0.25, 0], stoneLip, root);
  block('plinth-die', [5.0, 1.5, 3.6], [0, 1.25, 0], stone, root);
  block('plinth-cap', [5.4, 0.32, 4.0], [0, 2.16, 0], stoneLip, root);

  // --- hind legs ------------------------------------------------------------
  // On the root, not on the body, and this is the whole correction.
  //
  // The last version pitched the entire animal about its hind feet, which
  // tipped the legs over with everything else: two slabs leaning at thirty
  // degrees, which is not a leg standing on anything. A rearing horse holds
  // its hind legs under itself and bends them; only the body goes back. So the
  // body pivots at the **hip**, and the legs are built downwards from that hip
  // to the stone, where they stay.
  //
  // The numbers below are worked, not chosen: a thigh of 1.3 at 0.5 radians
  // puts the hock at y = 4.5 − 1.3·cos(0.5) = 3.36 and z = −1.0 − 1.3·sin(0.5)
  // = −1.62, and a cannon of 1.04 at −0.47 from there lands the hoof on
  // 2.32 — the top of the plinth.
  const hindLeg = (side: number, lean: number) => {
    const hip = new THREE.Group();
    hip.name = `${side < 0 ? 'left' : 'right'}-hind`;
    hip.position.set(side * 0.46, HIP_Y, HIP_Z);
    hip.rotation.x = 0.5 + lean;
    root.add(hip);
    block('haunch', [0.58, 0.5, 0.7], [0, -0.1, 0.1], hide, hip);
    block('thigh', [0.5, 1.3, 0.62], [0, -0.65, 0], hide, hip);
    const hock = new THREE.Group();
    hock.position.set(0, -1.3, 0);
    hock.rotation.x = -0.97 - lean;
    hip.add(hock);
    block('hock', [0.36, 0.28, 0.42], [0, -0.06, -0.02], hideLit, hock);
    block('cannon', [0.28, 1.04, 0.32], [0, -0.62, 0], hideDeep, hock);
    block('fetlock', [0.32, 0.18, 0.34], [0, -1.2, 0.02], hideLit, hock);
    block('hoof', [0.36, 0.2, 0.44], [0, -1.38, 0.04], hideLit, hock);
  };
  hindLeg(-1, 0.04);
  hindLeg(1, -0.03);

  // --- the body -------------------------------------------------------------
  // Pivoted at the hip. Everything in here is drawn as if the animal were
  // level, and the one rotation on the group rears it.
  const horse = new THREE.Group();
  horse.name = 'horse';
  horse.position.set(0, HIP_Y, HIP_Z);
  horse.rotation.x = REAR_PITCH;
  root.add(horse);

  block('rump', [1.22, 1.26, 1.15], [0, 0.02, 0.18], hide, horse);
  block('barrel', [1.16, 1.3, 1.9], [0, 0.04, 1.68], hide, horse);
  block('belly', [1.06, 0.42, 1.7], [0, -0.64, 1.72], hideDeep, horse);
  block('chest', [1.22, 1.24, 0.85], [0, 0.04, 3.05], hideLit, horse);
  block('withers', [1.26, 0.5, 0.85], [0, 0.62, 2.9], hide, horse);

  // Front legs, folded up under the chest.
  const foreLeg = (side: number, lift: number, fold: number) => {
    const shoulder = new THREE.Group();
    shoulder.name = `${side < 0 ? 'left' : 'right'}-fore`;
    shoulder.position.set(side * 0.44, 0.1, 3.1);
    shoulder.rotation.x = lift;
    horse.add(shoulder);
    block('forearm', [0.44, 1.05, 0.54], [0, -0.52, 0], hide, shoulder);
    const knee = new THREE.Group();
    knee.position.set(0, -1.05, 0);
    knee.rotation.x = fold;
    shoulder.add(knee);
    block('knee', [0.36, 0.26, 0.38], [0, -0.06, 0], hideLit, knee);
    block('cannon', [0.28, 0.95, 0.32], [0, -0.66, 0], hideDeep, knee);
    block('hoof', [0.34, 0.2, 0.42], [0, -1.22, 0.04], hideLit, knee);
  };
  // One higher and tighter than the other, so the front end is not one slab.
  foreLeg(-1, 1.55, -1.45);
  foreLeg(1, 1.0, -1.95);

  // Neck and head. The neck leans **forward** as it rises.
  //
  // It leaned back before — the rotation carried the wrong sign — which put
  // the head up and behind the withers, in the same space as the rider. That
  // is the head meshing into GANGAN, and it was one minus sign.
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.6, 3.3);
  neck.rotation.set(0.3, 0.14, 0);
  horse.add(neck);
  block('neck', [0.74, 1.9, 0.9], [0, 0.95, 0.06], hide, neck);
  block('crest', [0.4, 1.8, 0.3], [0, 1.02, -0.38], hideDeep, neck);
  for (const [y, length] of [[0.4, 0.5], [0.9, 0.62], [1.42, 0.5]] as Array<[number, number]>) {
    block('mane', [0.26, length, 0.22], [0, y, -0.57], hideDeep, neck);
  }

  const head = new THREE.Group();
  head.name = 'horse-head';
  head.position.set(0, 1.92, 0.16);
  head.rotation.set(0.5, 0.18, 0);
  neck.add(head);
  block('skull', [0.62, 0.66, 1.0], [0, 0, 0.3], hide, head);
  block('cheek', [0.66, 0.5, 0.36], [0, -0.06, -0.02], hideLit, head);
  block('muzzle', [0.5, 0.46, 0.46], [0, -0.12, 0.98], hideLit, head);
  block('nostril', [0.2, 0.13, 0.09], [0, -0.2, 1.22], hideDeep, head);
  block('left-ear', [0.14, 0.34, 0.16], [-0.19, 0.44, -0.12], hideLit, head);
  block('right-ear', [0.14, 0.34, 0.16], [0.19, 0.44, -0.12], hideLit, head);
  block('forelock', [0.36, 0.22, 0.26], [0, 0.36, 0.1], hideDeep, head);
  block('browband', [0.66, 0.09, 0.1], [0, 0.2, 0.16], manDeep, head);
  block('noseband', [0.54, 0.1, 0.1], [0, -0.08, 0.8], manDeep, head);
  for (const side of [-1, 1]) {
    block('cheekpiece', [0.07, 0.52, 0.07], [side * 0.3, 0.02, 0.52], manDeep, head);
  }

  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0.35, -0.5);
  tail.rotation.x = 0.5;
  horse.add(tail);
  block('dock', [0.36, 0.5, 0.42], [0, -0.2, 0], hide, tail);
  block('tail', [0.32, 1.5, 0.44], [0, -1.2, -0.12], hideDeep, tail);
  block('tail-tip', [0.24, 0.62, 0.3], [0, -2.16, -0.3], hideDeep, tail);

  // --- the rider ------------------------------------------------------------
  // Sat on the barrel, then turned partway back towards upright: the animal
  // goes one way and the man does not, which is the whole trick of the
  // painting. The horse is pitched half a radian; he gives back most of it.
  const rider = new THREE.Group();
  rider.name = 'gangan';
  rider.position.set(0, 0.76, 1.55);
  rider.rotation.set(0.34, 0.2, 0);
  horse.add(rider);

  block('saddle', [1.32, 0.22, 1.35], [0, 0, 0.02], manDeep, rider);
  block('cantle', [1.24, 0.3, 0.22], [0, 0.18, -0.63], manDeep, rider);
  block('pommel', [0.92, 0.26, 0.2], [0, 0.16, 0.66], manDeep, rider);
  block('hips', [0.84, 0.5, 0.68], [0, 0.36, -0.02], man, rider);

  // Legs down the outside of the barrel. The barrel is 1.16 across, so its
  // face is at 0.58; a 0.4 thigh centred at 0.84 clears it, which is what a
  // leg on a horse actually does. Sat inside it, they were the thing that made
  // the two shapes unreadable.
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.84, 0.24, 0.14);
    thigh.rotation.set(0.78, 0, side * 0.08);
    rider.add(thigh);
    block('thigh', [0.4, 0.95, 0.48], [0, -0.46, 0], man, thigh);
    const knee = new THREE.Group();
    knee.position.set(0, -0.95, 0);
    knee.rotation.x = -1.32;
    thigh.add(knee);
    block('shin', [0.34, 0.88, 0.4], [0, -0.43, 0], manDeep, knee);
    block('boot', [0.38, 0.3, 0.6], [0, -0.96, 0.14], man, knee);
    block('stirrup', [0.42, 0.12, 0.16], [0, -1.16, 0.1], hideDeep, knee);
  }

  // Everything above the waist is turned out of the horse's line towards
  // whoever is walking up the road. A third of a right angle here, on top of a
  // fifth at the hips — the last one twisted him sixty-six degrees at the
  // waist alone, which is not a posture, it is an injury.
  const upper = new THREE.Group();
  upper.name = 'gangan-upper';
  upper.position.set(0, 0.6, -0.02);
  upper.rotation.y = 0.52;
  rider.add(upper);

  block('waist', [0.78, 0.32, 0.58], [0, 0.06, 0], manDeep, upper);
  block('torso', [0.96, 1.0, 0.64], [0, 0.72, 0.01], man, upper);
  block('sash', [0.98, 0.22, 0.66], [0, 0.4, 0.01], manDeep, upper);
  block('shoulders', [1.14, 0.28, 0.66], [0, 1.32, 0.01], man, upper);

  // The arm that points, up and out of the top of the frame.
  const rightArm = new THREE.Group();
  rightArm.name = 'raised-arm';
  rightArm.position.set(0.62, 1.26, 0.02);
  rightArm.rotation.set(-0.26, 0, -2.1);
  upper.add(rightArm);
  block('upper-arm', [0.32, 0.85, 0.36], [0, -0.44, 0], man, rightArm);
  const forearm = new THREE.Group();
  forearm.position.set(0, -0.85, 0);
  forearm.rotation.z = 0.3;
  rightArm.add(forearm);
  block('forearm', [0.28, 0.8, 0.32], [0, -0.42, 0], manDeep, forearm);
  block('hand', [0.3, 0.3, 0.3], [0, -0.95, 0.02], man, forearm);
  block('finger', [0.12, 0.32, 0.12], [0, -1.22, 0.04], man, forearm);

  // The other hand is down on the reins.
  const leftArm = new THREE.Group();
  leftArm.name = 'rein-arm';
  leftArm.position.set(-0.62, 1.24, 0.02);
  leftArm.rotation.set(-0.62, 0.42, 0.3);
  upper.add(leftArm);
  block('upper-arm', [0.32, 0.85, 0.36], [0, -0.44, 0], man, leftArm);
  const leftForearm = new THREE.Group();
  leftForearm.position.set(0, -0.85, 0);
  leftForearm.rotation.x = -0.4;
  leftArm.add(leftForearm);
  block('forearm', [0.28, 0.78, 0.32], [0, -0.4, 0], manDeep, leftForearm);
  block('fist', [0.3, 0.28, 0.32], [0, -0.86, 0.04], man, leftForearm);

  // Head. Two things make it him: the hair to the collar, and the cap.
  const head2 = new THREE.Group();
  head2.name = 'gangan-head';
  head2.position.set(0, 1.76, 0.02);
  head2.rotation.set(0.02, 0.14, 0);
  upper.add(head2);
  block('skull', [0.7, 0.72, 0.66], [0, 0, 0], man, head2);
  block('jaw', [0.6, 0.24, 0.56], [0, -0.4, 0.02], man, head2);
  block('hair-back', [0.76, 0.66, 0.2], [0, -0.08, -0.4], manDeep, head2);
  block('hair-left', [0.14, 0.56, 0.5], [-0.4, -0.18, -0.1], manDeep, head2);
  block('hair-right', [0.14, 0.56, 0.5], [0.4, -0.18, -0.1], manDeep, head2);
  block('brow', [0.66, 0.1, 0.09], [0, 0.14, 0.34], manDeep, head2);
  block('moustache', [0.3, 0.09, 0.1], [0, -0.2, 0.34], manDeep, head2);
  block('beard', [0.34, 0.22, 0.14], [0, -0.42, 0.3], manDeep, head2);
  block('cap-crown', [0.76, 0.28, 0.7], [0, 0.5, 0], man, head2);
  block('cap-peak', [0.72, 0.1, 0.42], [0, 0.37, 0.53], manDeep, head2);

  // The cloak: the largest shape in the painting, and what fills the space
  // behind a rider who is otherwise a thin vertical. Behind him, and clear of
  // the horse.
  const cloak = new THREE.Group();
  cloak.name = 'cloak';
  cloak.position.set(0, 1.28, -0.38);
  cloak.rotation.set(0.24, 0, -0.18);
  upper.add(cloak);
  block('cloak-collar', [1.18, 0.28, 0.22], [0, 0.06, 0], man, cloak);
  block('cloak-back', [1.08, 1.3, 0.2], [-0.06, -0.66, -0.14], manDeep, cloak);
  block('cloak-flare', [0.84, 1.0, 0.18], [-0.4, -1.68, -0.38], man, cloak);
  block('cloak-tail', [0.56, 0.8, 0.16], [-0.74, -2.46, -0.62], manDeep, cloak);

  return root;
};
