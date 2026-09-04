import * as THREE from 'three';

/**
 * GANGAN, cast in gold, on a rearing horse.
 *
 * The pose is David's *Napoleon Crossing the Alps*: the horse up on its hind
 * legs with its head turned across, the rider settled back into the saddle,
 * one arm thrown up and the cloak caught behind him. What the painting does
 * with a diagonal, this does with a pitched body and a raised arm, because
 * that is all a pile of boxes has to work with.
 *
 * Local +Z is the direction the statue faces, and it is set up to be met head
 * on: the body opens towards whoever is walking up the road, and the horse's
 * head turns off that line so the silhouette is not flat.
 *
 * Everything here is a scaled unit cube, like every other body in the
 * festival. A smooth statue among blocky people would read as an import.
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

/** How far the horse is tipped back onto its hocks. */
const REAR_PITCH = -0.46;
/** Where the plinth stops and the sculpture starts. */
export const GANGAN_PLINTH_TOP = 2.1;
/** The box the thing occupies, for anything that needs to know what it hides. */
export const GANGAN_STATUE_SIZE = { width: 6.3, height: 9.2, depth: 5.0 } as const;

export const createGanganStatue = (): THREE.Group => {
  const root = new THREE.Group();
  root.name = 'gangan-statue';

  // Bronze-gold rather than yellow. A single flat gold on every face turns a
  // statue into a cut-out at any distance, so the metal is split three ways
  // and the pieces that catch the light get the brightest of them.
  //
  // Metalness is kept low on purpose. A properly metallic surface takes its
  // colour almost entirely from what is around it to reflect, and there is no
  // environment map in this world — set honestly to 0.85 the whole statue came
  // out black. The festival's own materials are all near-dielectric for the
  // same reason; the gold has to come from the colour, not the shading model.
  const bronze = gold(0xb8862a, 0.44, 0.26);
  const bronzeLit = gold(0xf2d47a, 0.30, 0.34);
  const bronzeDeep = gold(0x6f4d14, 0.56, 0.2);
  const stone = gold(0x2b2724, 0.92, 0.02);
  const stoneLip = gold(0x3a352f, 0.88, 0.04);

  // --- the plinth -----------------------------------------------------------
  block('plinth-base', [5.6, 0.45, 4.0], [0, 0.225, 0], stoneLip, root);
  block('plinth-die', [4.6, 1.35, 3.1], [0, 1.125, 0], stone, root);
  block('plinth-cap', [5.0, 0.3, 3.5], [0, 1.95, 0], stoneLip, root);
  // The outcrop the hind hooves are planted on, as in the painting.
  block('crag', [2.6, 0.55, 1.7], [0, 2.38, -0.75], bronzeDeep, root);
  block('crag-step', [1.5, 0.35, 1.0], [0.5, 2.4, 0.35], bronzeDeep, root);

  // --- the horse ------------------------------------------------------------
  // One pitched group carries the barrel and everything growing out of it. The
  // legs hang off the root instead, because a leg has to reach the stone and
  // that is easier to say in the statue's own upright frame than in a tilted
  // one.
  const horse = new THREE.Group();
  horse.name = 'horse';
  horse.position.set(0, 4.5, -0.32);
  horse.rotation.x = REAR_PITCH;
  root.add(horse);

  block('barrel', [1.24, 1.28, 2.9], [0, 0, 0], bronze, horse);
  block('rump', [1.18, 1.22, 0.85], [0, 0.04, -1.52], bronze, horse);
  block('chest', [1.3, 1.22, 0.95], [0, 0.06, 1.44], bronzeLit, horse);
  block('girth', [1.32, 0.5, 1.1], [0, -0.5, 0.55], bronzeDeep, horse);

  // The neck rises out of the chest and the head turns off the centre line, so
  // the animal is looking across its own shoulder rather than straight down
  // the road. That turn is most of what stops this reading as a rocking horse.
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.5, 1.68);
  neck.rotation.set(-0.74, 0.18, 0.08);
  horse.add(neck);
  block('neck-block', [0.78, 2.1, 0.92], [0, 0.95, 0.06], bronze, neck);
  block('crest', [0.44, 1.9, 0.34], [0, 1.0, -0.38], bronzeDeep, neck);

  const head = new THREE.Group();
  head.name = 'horse-head';
  head.position.set(0, 1.95, 0.22);
  head.rotation.set(1.02, 0.3, 0);
  neck.add(head);
  block('horse-skull', [0.64, 0.66, 1.2], [0, 0, 0.34], bronze, head);
  block('muzzle', [0.52, 0.48, 0.44], [0, -0.1, 1.06], bronzeLit, head);
  block('nostril', [0.2, 0.14, 0.1], [0, -0.16, 1.3], bronzeDeep, head);
  block('left-ear', [0.15, 0.36, 0.16], [-0.2, 0.44, -0.16], bronzeLit, head);
  block('right-ear', [0.15, 0.36, 0.16], [0.2, 0.44, -0.16], bronzeLit, head);
  block('forelock', [0.42, 0.2, 0.3], [0, 0.36, 0.06], bronzeDeep, head);

  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0.32, -1.88);
  tail.rotation.x = 0.95;
  horse.add(tail);
  block('tail-block', [0.32, 1.5, 0.44], [0, -0.7, 0], bronzeDeep, tail);
  block('tail-tip', [0.24, 0.6, 0.3], [0, -1.55, 0.18], bronzeDeep, tail);

  // Hind legs: planted, taking the whole weight. Front legs: off the ground
  // and folded, one higher than the other so the pair is not a mirror.
  const leg = (
    name: string,
    hip: [number, number, number],
    hipRotation: number,
    upper: [number, number, number],
    kneeRotation: number,
    lower: [number, number, number],
    hoof: boolean,
  ): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(...hip);
    pivot.rotation.x = hipRotation;
    root.add(pivot);
    block(`${name}-upper`, upper, [0, -upper[1] / 2, 0], bronze, pivot);
    const knee = new THREE.Group();
    knee.position.set(0, -upper[1], 0);
    knee.rotation.x = kneeRotation;
    pivot.add(knee);
    block(`${name}-lower`, lower, [0, -lower[1] / 2, 0], bronzeDeep, knee);
    if (hoof) block(`${name}-hoof`, [lower[0] + 0.1, 0.22, lower[2] + 0.14], [0, -lower[1] - 0.11, 0.04], bronzeLit, knee);
    return pivot;
  };

  leg('left-hind', [-0.44, 3.86, -1.28], 0.34, [0.46, 1.05, 0.62], -0.42, [0.36, 0.92, 0.44], true);
  leg('right-hind', [0.44, 3.86, -1.28], 0.2, [0.46, 1.05, 0.62], -0.3, [0.36, 0.92, 0.44], true);
  leg('left-fore', [-0.48, 5.5, 1.12], 1.6, [0.4, 1.05, 0.5], -1.65, [0.32, 0.95, 0.38], true);
  leg('right-fore', [0.48, 5.36, 1.0], 1.02, [0.4, 1.05, 0.5], -2.05, [0.32, 0.95, 0.38], true);

  // --- the rider ------------------------------------------------------------
  // Seated on the pitched barrel but held upright against it, which is the
  // whole trick of the painting: the horse goes one way and the man does not.
  const rider = new THREE.Group();
  rider.name = 'gangan';
  rider.position.set(0, 5.5, -0.92);
  rider.rotation.set(-0.14, -0.22, 0);
  root.add(rider);

  block('saddle', [1.36, 0.3, 1.5], [0, -0.62, 0.14], bronzeDeep, rider);
  block('hips', [0.98, 0.5, 0.72], [0, -0.34, 0], bronze, rider);
  block('torso', [1.0, 1.15, 0.66], [0, 0.42, 0.02], bronzeLit, rider);
  block('collar', [1.06, 0.2, 0.72], [0, 0.98, 0.02], bronze, rider);

  // Thighs down each flank, calves tucked back to the girth.
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.52, -0.42, 0.1);
    thigh.rotation.set(0.95, 0, side * 0.16);
    rider.add(thigh);
    block(`${side < 0 ? 'left' : 'right'}-thigh`, [0.42, 1.0, 0.52], [0, -0.5, 0], bronze, thigh);
    const shin = new THREE.Group();
    shin.position.set(0, -1.0, 0);
    shin.rotation.x = -1.5;
    thigh.add(shin);
    block(`${side < 0 ? 'left' : 'right'}-shin`, [0.36, 0.95, 0.42], [0, -0.48, 0], bronzeDeep, shin);
    block(`${side < 0 ? 'left' : 'right'}-boot`, [0.4, 0.28, 0.62], [0, -1.02, 0.14], bronzeLit, shin);
  }

  // The arm that does the pointing. Up and out, the way the painting sends the
  // eye out of the top of the frame.
  const rightArm = new THREE.Group();
  rightArm.name = 'raised-arm';
  rightArm.position.set(0.6, 0.82, 0.02);
  rightArm.rotation.set(-0.35, 0, -2.35);
  rider.add(rightArm);
  block('right-upper-arm', [0.34, 0.95, 0.38], [0, -0.48, 0], bronzeLit, rightArm);
  const rightForearm = new THREE.Group();
  rightForearm.position.set(0, -0.95, 0);
  rightForearm.rotation.set(0, 0, 0.42);
  rightArm.add(rightForearm);
  block('right-forearm', [0.3, 0.9, 0.34], [0, -0.45, 0], bronze, rightForearm);
  block('right-hand', [0.3, 0.32, 0.32], [0, -0.98, 0.02], bronzeLit, rightForearm);

  // The other hand is down on the reins, which is what keeps the raised one
  // from reading as a shrug.
  const leftArm = new THREE.Group();
  leftArm.name = 'rein-arm';
  leftArm.position.set(-0.6, 0.8, 0.02);
  leftArm.rotation.set(-0.85, 0.2, 0.3);
  rider.add(leftArm);
  block('left-upper-arm', [0.34, 0.9, 0.38], [0, -0.45, 0], bronze, leftArm);
  const leftForearm = new THREE.Group();
  leftForearm.position.set(0, -0.9, 0);
  leftForearm.rotation.x = -0.5;
  leftArm.add(leftForearm);
  block('left-forearm', [0.3, 0.85, 0.34], [0, -0.42, 0], bronzeLit, leftForearm);
  block('left-hand', [0.3, 0.3, 0.34], [0, -0.92, 0.04], bronze, leftForearm);

  // Head, and the two things that make it him: the hair down to the collar and
  // the cap over it.
  const head2 = new THREE.Group();
  head2.name = 'gangan-head';
  head2.position.set(0, 1.42, 0.02);
  head2.rotation.set(0.06, 0.34, 0);
  rider.add(head2);
  block('skull', [0.74, 0.76, 0.68], [0, 0, 0], bronzeLit, head2);
  block('hair-back', [0.8, 0.72, 0.26], [0, -0.06, -0.4], bronze, head2);
  block('hair-left', [0.16, 0.6, 0.6], [-0.42, -0.16, -0.06], bronze, head2);
  block('hair-right', [0.16, 0.6, 0.6], [0.42, -0.16, -0.06], bronze, head2);
  block('brow', [0.72, 0.12, 0.1], [0, 0.14, 0.34], bronzeDeep, head2);
  block('moustache', [0.34, 0.1, 0.12], [0, -0.16, 0.35], bronzeDeep, head2);
  block('beard', [0.3, 0.24, 0.16], [0, -0.34, 0.3], bronzeDeep, head2);
  // The cap, worn forward: at the distance this is read from, a peak out front
  // is the only part of it that says "cap" rather than "lump".
  block('cap-crown', [0.8, 0.3, 0.74], [0, 0.5, -0.02], bronze, head2);
  block('cap-peak', [0.78, 0.11, 0.44], [0, 0.38, 0.52], bronzeDeep, head2);

  // The cloak. It is the largest single shape in the painting and it is what
  // fills the space behind a rider who is otherwise a thin vertical.
  const cloak = new THREE.Group();
  cloak.name = 'cloak';
  cloak.position.set(-0.1, 0.5, -0.42);
  cloak.rotation.set(0.22, 0.1, -0.26);
  rider.add(cloak);
  block('cloak-shoulder', [1.5, 0.5, 0.36], [0, 0.5, 0], bronzeLit, cloak);
  block('cloak-fall', [1.34, 1.5, 0.3], [-0.12, -0.42, -0.16], bronze, cloak);
  block('cloak-flare', [1.05, 1.1, 0.28], [-0.55, -1.35, -0.44], bronzeLit, cloak);
  block('cloak-tail', [0.7, 0.85, 0.24], [-0.95, -2.15, -0.72], bronze, cloak);

  // Read from the far end of a long road, so it is built at the size it needs
  // to be seen at rather than the size it is comfortable to author at.
  root.scale.setScalar(1.14);
  return root;
};
