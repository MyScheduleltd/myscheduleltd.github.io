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
 * Built from the hind hooves up. The first version placed the body first and
 * then hung legs off it downwards, which meant every change to the pitch left
 * the feet somewhere new and the numbers were adjusted until the picture
 * looked right — that is how the horse and the man ended up inside one
 * another. Here the animal is drawn standing square, with its hind feet at the
 * origin, and then the whole thing is tipped back about that origin. The feet
 * cannot leave the stone, because they are the point it turns about.
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

/** How far the animal is tipped back onto its hocks, about its hind feet. */
const REAR_PITCH = -0.54;
/** Where the plinth stops and the animal starts. */
const PLINTH_TOP = 2.32;
/** How far the rider's shoulders are turned out of the horse's line. */
const RIDER_TURN = 1.16;

/**
 * The volume the piece fills, for the projector compositor alone — how much of
 * the screen it can cover, so a film is not painted over a horse standing in
 * front of it. Square in plan, because the statue is set at a right angle to
 * the road and a box that swapped its sides with it would be a second thing to
 * keep in step.
 */
export const GANGAN_STATUE_SIZE = { width: 7.2, height: 9.6, depth: 7.2 } as const;

export const createGanganStatue = (): THREE.Group => {
  const root = new THREE.Group();
  root.name = 'gangan-statue';

  // Metalness stays low. A properly metallic surface takes its colour almost
  // entirely from what it has to reflect, and this world has no environment
  // map — set honestly the whole statue comes out black. The gold has to live
  // in the colour, not in the shading model.
  //
  // Four tones, not three, and the horse and the rider are given different
  // ones on purpose: at any distance the complaint was that you could not tell
  // where the animal stopped and the man started, and no amount of modelling
  // fixes that if both are the same yellow.
  const hide = gold(0xa87a26, 0.48, 0.24);
  const hideLit = gold(0xcfa03c, 0.4, 0.28);
  const hideDeep = gold(0x6b4a12, 0.58, 0.18);
  const man = gold(0xf0d071, 0.28, 0.36);
  const manDeep = gold(0xbb9038, 0.42, 0.3);
  const stone = gold(0x2b2724, 0.92, 0.02);
  const stoneLip = gold(0x3d382f, 0.86, 0.04);

  // --- plinth ---------------------------------------------------------------
  block('plinth-base', [6.0, 0.5, 4.6], [0, 0.25, 0], stoneLip, root);
  block('plinth-die', [5.0, 1.5, 3.6], [0, 1.25, 0], stone, root);
  block('plinth-cap', [5.4, 0.32, 4.0], [0, 2.16, 0], stoneLip, root);

  // --- the horse ------------------------------------------------------------
  // Origin at the hind hooves, on the stone, and the whole group pitched back
  // about it. Nothing below is written in terms of the pitch.
  const horse = new THREE.Group();
  horse.name = 'horse';
  horse.position.set(0, PLINTH_TOP, -1.15);
  horse.rotation.x = REAR_PITCH;
  root.add(horse);

  // The outcrop the hind feet are dug into, which is what stops a rearing
  // horse reading as a falling one. Pitched with the animal so it stays under
  // the feet.
  block('crag', [2.5, 0.5, 1.5], [0, 0.05, 0.1], hideDeep, horse);

  // Hind legs. Standing height, drawn once and used twice; the two are given
  // slightly different bends so the pair is not a mirror.
  const hindLeg = (side: number, splay: number) => {
    const leg = new THREE.Group();
    leg.name = `${side < 0 ? 'left' : 'right'}-hind`;
    leg.position.set(side * 0.44, 0, 0);
    leg.rotation.x = splay;
    horse.add(leg);
    block('hoof', [0.36, 0.22, 0.44], [0, 0.11, 0.02], hideLit, leg);
    block('cannon', [0.26, 1.0, 0.3], [0, 0.72, 0], hideDeep, leg);
    block('hock', [0.34, 0.26, 0.38], [0, 1.32, -0.04], hideLit, leg);
    block('gaskin', [0.46, 0.95, 0.6], [0, 1.92, 0.06], hide, leg);
    return leg;
  };
  hindLeg(-1, 0.06);
  hindLeg(1, -0.05);

  // Body. Each piece butts up against the next rather than sitting inside it:
  // rump ends where the barrel starts, barrel ends where the chest starts.
  block('haunch', [1.22, 1.3, 1.15], [0, 2.42, 0.05], hide, horse);
  block('barrel', [1.18, 1.3, 1.9], [0, 2.44, 1.58], hide, horse);
  block('belly', [1.1, 0.42, 1.7], [0, 1.74, 1.6], hideDeep, horse);
  block('chest', [1.24, 1.24, 0.8], [0, 2.42, 2.93], hideLit, horse);
  block('shoulder', [1.3, 0.9, 0.7], [0, 2.72, 2.7], hide, horse);

  // Front legs, folded up under the chest. Pivoted at the shoulder so the fold
  // is two rotations and not four guessed positions.
  const foreLeg = (side: number, lift: number, fold: number) => {
    const leg = new THREE.Group();
    leg.name = `${side < 0 ? 'left' : 'right'}-fore`;
    leg.position.set(side * 0.43, 2.5, 2.86);
    leg.rotation.x = lift;
    horse.add(leg);
    block('forearm', [0.42, 1.05, 0.52], [0, -0.52, 0], hide, leg);
    const knee = new THREE.Group();
    knee.position.set(0, -1.05, 0);
    knee.rotation.x = fold;
    leg.add(knee);
    block('knee', [0.34, 0.26, 0.36], [0, -0.05, 0], hideLit, knee);
    block('cannon', [0.26, 0.95, 0.3], [0, -0.66, 0], hideDeep, knee);
    block('hoof', [0.34, 0.22, 0.42], [0, -1.24, 0.04], hideLit, knee);
    return leg;
  };
  // One higher and tighter than the other, which is what a real rear looks
  // like and what stops the front end reading as a single folded slab.
  foreLeg(-1, 1.62, -1.5);
  foreLeg(1, 1.05, -2.0);

  // Neck and head. The neck rises out of the shoulder and the head turns off
  // the centre line, so the animal looks across itself instead of straight
  // ahead — most of what keeps the silhouette from going flat.
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 2.95, 3.15);
  neck.rotation.set(-0.34, 0.2, 0.05);
  horse.add(neck);
  block('neck', [0.74, 1.85, 0.9], [0, 0.9, 0.1], hide, neck);
  block('crest', [0.4, 1.75, 0.3], [0, 0.98, -0.36], hideDeep, neck);
  for (const [y, length] of [[0.35, 0.5], [0.85, 0.62], [1.35, 0.52]] as Array<[number, number]>) {
    block('mane', [0.26, length, 0.22], [0, y, -0.56], hideDeep, neck);
  }

  const head = new THREE.Group();
  head.name = 'horse-head';
  head.position.set(0, 1.85, 0.18);
  head.rotation.set(0.62, 0.24, 0);
  neck.add(head);
  block('skull', [0.62, 0.66, 1.0], [0, 0, 0.28], hide, head);
  block('cheek', [0.66, 0.5, 0.34], [0, -0.06, -0.02], hideLit, head);
  block('muzzle', [0.5, 0.46, 0.46], [0, -0.12, 0.96], hideLit, head);
  block('nostril', [0.2, 0.13, 0.09], [0, -0.2, 1.2], hideDeep, head);
  block('blaze', [0.2, 0.1, 0.7], [0, 0.3, 0.4], hideLit, head);
  block('left-ear', [0.14, 0.34, 0.16], [-0.19, 0.44, -0.14], hideLit, head);
  block('right-ear', [0.14, 0.34, 0.16], [0.19, 0.44, -0.14], hideLit, head);
  block('forelock', [0.36, 0.22, 0.26], [0, 0.36, 0.08], hideDeep, head);
  // Bridle, which is where the reins in the rider's hand have to come from.
  block('browband', [0.66, 0.08, 0.1], [0, 0.2, 0.14], manDeep, head);
  block('noseband', [0.54, 0.09, 0.1], [0, -0.08, 0.78], manDeep, head);
  for (const side of [-1, 1]) {
    block('cheekpiece', [0.07, 0.5, 0.07], [side * 0.3, 0.02, 0.5], manDeep, head);
  }

  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 2.75, -0.5);
  tail.rotation.x = 0.62;
  horse.add(tail);
  block('dock', [0.34, 0.5, 0.4], [0, -0.2, 0], hide, tail);
  block('tail', [0.3, 1.5, 0.42], [0, -1.2, -0.1], hideDeep, tail);
  block('tail-tip', [0.22, 0.6, 0.28], [0, -2.15, -0.28], hideDeep, tail);

  // --- the rider ------------------------------------------------------------
  // A child of the horse, so he goes up with it, then turned partway back
  // towards upright — which is the whole trick of the painting: the animal
  // goes one way and the man does not.
  const rider = new THREE.Group();
  rider.name = 'gangan';
  rider.position.set(0, 3.2, 1.62);
  rider.rotation.x = 0.34;
  horse.add(rider);

  block('saddle', [1.3, 0.24, 1.4], [0, -0.08, 0.05], manDeep, rider);
  block('cantle', [1.2, 0.34, 0.24], [0, 0.12, -0.68], manDeep, rider);
  block('pommel', [0.9, 0.3, 0.22], [0, 0.1, 0.7], manDeep, rider);
  block('hips', [0.86, 0.52, 0.7], [0, 0.34, 0], man, rider);

  // Legs down the outside of the barrel, not through it. The barrel is 1.18
  // across, so its face is at 0.59; a 0.4 thigh centred at 0.86 clears it with
  // room to spare, which is what a leg on a horse actually does.
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.86, 0.2, 0.16);
    thigh.rotation.set(0.72, 0, side * 0.1);
    rider.add(thigh);
    block('thigh', [0.4, 0.95, 0.48], [0, -0.46, 0], man, thigh);
    const shin = new THREE.Group();
    shin.position.set(0, -0.95, 0);
    shin.rotation.x = -1.28;
    thigh.add(shin);
    block('shin', [0.34, 0.9, 0.4], [0, -0.44, 0], manDeep, shin);
    block('boot', [0.38, 0.3, 0.6], [0, -0.98, 0.14], man, shin);
    block('stirrup', [0.42, 0.12, 0.14], [0, -1.18, 0.1], hideDeep, shin);
  }

  // Everything above the waist is turned out of the horse's line, towards
  // whoever is walking up the road. Shoulders, arms, head and cloak all hang
  // off this one group, so the turn is one number.
  const upper = new THREE.Group();
  upper.name = 'gangan-upper';
  upper.position.set(0, 0.6, 0);
  upper.rotation.y = RIDER_TURN;
  rider.add(upper);

  block('waist', [0.8, 0.34, 0.6], [0, 0.05, 0], manDeep, upper);
  block('torso', [0.98, 1.0, 0.66], [0, 0.72, 0.02], man, upper);
  block('chest-plate', [0.86, 0.44, 0.16], [0, 0.86, 0.36], manDeep, upper);
  block('shoulders', [1.16, 0.28, 0.68], [0, 1.32, 0.02], man, upper);

  // The arm that points. Up and out of the top of the frame, the way the
  // painting sends the eye.
  const rightArm = new THREE.Group();
  rightArm.name = 'raised-arm';
  rightArm.position.set(0.62, 1.26, 0.02);
  rightArm.rotation.set(-0.3, 0, -2.42);
  upper.add(rightArm);
  block('upper-arm', [0.32, 0.85, 0.36], [0, -0.44, 0], man, rightArm);
  const forearm = new THREE.Group();
  forearm.position.set(0, -0.85, 0);
  forearm.rotation.z = 0.36;
  rightArm.add(forearm);
  block('forearm', [0.28, 0.8, 0.32], [0, -0.42, 0], manDeep, forearm);
  block('hand', [0.3, 0.3, 0.3], [0, -0.95, 0.02], man, forearm);
  block('finger', [0.12, 0.34, 0.12], [0, -1.24, 0.04], man, forearm);

  // The other hand is down on the reins, which is what stops the raised one
  // reading as a shrug.
  const leftArm = new THREE.Group();
  leftArm.name = 'rein-arm';
  leftArm.position.set(-0.62, 1.24, 0.02);
  leftArm.rotation.set(-0.7, 0.5, 0.34);
  upper.add(leftArm);
  block('upper-arm', [0.32, 0.85, 0.36], [0, -0.44, 0], man, leftArm);
  const leftForearm = new THREE.Group();
  leftForearm.position.set(0, -0.85, 0);
  leftForearm.rotation.x = -0.44;
  leftArm.add(leftForearm);
  block('forearm', [0.28, 0.78, 0.32], [0, -0.4, 0], manDeep, leftForearm);
  block('fist', [0.3, 0.28, 0.32], [0, -0.86, 0.04], man, leftForearm);

  // Head. Two things make it him: the hair down to the collar, and the cap.
  const head2 = new THREE.Group();
  head2.name = 'gangan-head';
  head2.position.set(0, 1.78, 0.02);
  head2.rotation.set(0.04, 0.18, 0);
  upper.add(head2);
  block('skull', [0.7, 0.72, 0.66], [0, 0, 0], man, head2);
  block('jaw', [0.6, 0.24, 0.56], [0, -0.4, 0.02], man, head2);
  block('hair-back', [0.76, 0.66, 0.2], [0, -0.08, -0.4], manDeep, head2);
  block('hair-left', [0.14, 0.56, 0.5], [-0.4, -0.18, -0.1], manDeep, head2);
  block('hair-right', [0.14, 0.56, 0.5], [0.4, -0.18, -0.1], manDeep, head2);
  block('brow', [0.66, 0.1, 0.09], [0, 0.14, 0.34], manDeep, head2);
  block('moustache', [0.3, 0.09, 0.1], [0, -0.2, 0.34], manDeep, head2);
  block('beard', [0.34, 0.22, 0.14], [0, -0.42, 0.3], manDeep, head2);
  // The cap. The peak is the only part that reads as a cap in silhouette.
  block('cap-crown', [0.76, 0.28, 0.7], [0, 0.5, 0], man, head2);
  block('cap-peak', [0.72, 0.1, 0.42], [0, 0.37, 0.53], manDeep, head2);

  // The cloak. It is the largest shape in the painting, and it is what fills
  // the space behind a rider who is otherwise a thin vertical. Hung off the
  // shoulders and swept back, entirely behind the man and clear of the horse.
  const cloak = new THREE.Group();
  cloak.name = 'cloak';
  cloak.position.set(0, 1.28, -0.4);
  cloak.rotation.set(0.26, 0, -0.2);
  upper.add(cloak);
  block('cloak-collar', [1.2, 0.28, 0.24], [0, 0.06, 0], man, cloak);
  block('cloak-back', [1.1, 1.3, 0.22], [-0.06, -0.66, -0.16], manDeep, cloak);
  block('cloak-flare', [0.86, 1.0, 0.2], [-0.42, -1.7, -0.42], man, cloak);
  block('cloak-tail', [0.58, 0.8, 0.18], [-0.78, -2.5, -0.7], manDeep, cloak);

  return root;
};
