import * as THREE from 'three';

/**
 * Two clothed, block-built festivalgoers attempting a partner tree balance.
 * The joke is their unsteady yoga and a censor box over each crotch, front
 * and back, on two people who are wearing swimwear the whole time.
 *
 * An easter egg, and only that: nobody here is a resident, nobody appears in
 * the attendee list or in STAFF, and nothing about them reaches the service.
 * They are scenery that happens to move — which is why they are built as
 * plain blocks with one small loop, rather than borrowing the avatar rig and
 * inheriting a walk cycle, a name badge and a place in the crowd along with
 * it.
 *
 * Local +Z is the direction their feet point.
 */

export interface BeachCoupleRig {
  root: THREE.Group;
  /** Existing block heads remain independently posed. */
  leftHead: THREE.Group;
  rightHead: THREE.Group;
  /** The lifted outer knee and two planted-body pivots make a gentle balance loop. */
  kickedLeg: THREE.Group;
  people: readonly [THREE.Group, THREE.Group];
  parasol: THREE.Group;
}

const flat = (color: number, roughness = 0.85) => new THREE.MeshStandardMaterial({
  color,
  roughness,
  metalness: 0.02,
  flatShading: true,
});

const block = (
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  parent: THREE.Object3D,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

/**
 * Each raised arm's turn from hanging (radians). The arm is a .26 × 1.2 block
 * hung from a shoulder .55 in from the body's centre, on bodies .7 either side
 * of the couple's centre at .72 scale. At this angle the arm's inner corner
 * stops .003 short of the centre line, so the two hands touch without
 * crossing; the old 2.79 sent each .08 past it, into the other.
 */
const INNER_ARM_TILT = 2.8958;

export const createBeachCouple = (): BeachCoupleRig => {
  const root = new THREE.Group();
  root.name = 'beach-couple';

  const towelWhite = flat(0xf4efe6, 0.92);
  const towelTeal = flat(0x1f9e9a, 0.92);
  const skinWarm = flat(0xa9694a, 0.78);
  const skinDeep = flat(0x7a4a33, 0.78);
  const hairDark = flat(0x1c1518, 0.9);
  const hairLight = flat(0x54331f, 0.9);
  const trunks = flat(0x2f6f8f, 0.8);
  const swimsuit = flat(0xd8b64a, 0.8);
  const poleWood = flat(0x8a7a63, 0.8);
  const canopy = flat(0xd9584c, 0.66);
  const canopyCream = flat(0xf1e6cd, 0.66);

  // --- the towel ------------------------------------------------------------
  // Striped, because a plain rectangle on sand reads as a hole in the ground.
  // Teal with white stripes, because the cream it used to be was the colour of
  // the sand and only its red stripes showed from any distance.
  // Sized to what is actually lying on it: at five across and three deep the
  // pair's feet hung off the end onto the sand, which is the one thing nobody
  // does on a beach towel.
  //
  // Thick, and sitting well clear of zero. The first one was eight centimetres
  // thick with its top at 0.09, and the beach it was laid on is at 0.28 — so
  // it was buried, and the pair were lying on bare sand with nothing under
  // them. The caller sets the group down on the ground; everything here is
  // measured up from that.
  block([3.8, 0.16, 5.4], [0, 0.08, 0.35], towelTeal, root);
  for (const z of [-1.7, -0.5, 0.7, 1.9, 2.6]) {
    block([3.84, 0.08, 0.46], [0, 0.2, z], towelWhite, root);
  }

  // --- the pair -------------------------------------------------------------
  // Upright, side by side, with a lifted OUTER knee each and the INNER hands
  // meeting overhead. This is a partner tree pose, never an all-fours pose.
  // Keep the original plain block heads, hair, blue/yellow clothing and skin
  // colours; the smaller standing scale keeps their crowns below the parasol.
  // The censor has to read from an ordinary third-person camera ten metres
  // off, where a whole person is a few dozen pixels. A 6×4 grid of near-equal
  // skin tones read as a pale sticker there, so it is five big cells a side,
  // neighbours far apart in value. Half
  // of it glows, so it still shows when the pair stand against the sun, but
  // not so much that it becomes a lamp on the beach at night.
  const mosaicColours = [[92, 56, 40], [140, 92, 64], [196, 140, 100], [236, 190, 150], [168, 110, 78], [250, 214, 180], [120, 74, 52]];
  const mosaicCells = [3, 1, 5, 2, 4, 0, 4, 2, 6, 1, 5, 2, 3, 0, 5, 1, 6, 0, 4, 2, 4, 3, 5, 1, 6];
  const mosaicPixels = new Uint8Array(mosaicCells.length * 4);
  mosaicCells.forEach((cell, i) => mosaicPixels.set([...mosaicColours[cell], 255], i * 4));
  const mosaicTexture = new THREE.DataTexture(mosaicPixels, 5, 5);
  mosaicTexture.colorSpace = THREE.SRGBColorSpace;
  mosaicTexture.magFilter = THREE.NearestFilter;
  mosaicTexture.minFilter = THREE.NearestFilter;
  mosaicTexture.generateMipmaps = false;
  mosaicTexture.needsUpdate = true;
  const mosaicMaterial = new THREE.MeshStandardMaterial({
    map: mosaicTexture, emissive: 0xffffff, emissiveMap: mosaicTexture, emissiveIntensity: .5,
    roughness: 1, metalness: 0, flatShading: true,
  });
  mosaicMaterial.name = 'yoga censor mosaic';
  mosaicMaterial.userData.preserveAuthoredSurface = true;
  const mosaicGeometry = new THREE.PlaneGeometry(.7, .6);
  const mosaic = (parent: THREE.Object3D, facing: 'front' | 'back') => {
    const patch = new THREE.Mesh(mosaicGeometry, mosaicMaterial);
    patch.name = `awkward-yoga-mosaic-crotch-${facing}`;
    // Between the legs, just under the hip block, standing proud of both the
    // .5-deep hips and the .34-deep thighs so neither pokes through it.
    patch.position.set(0, 1.02, facing === 'front' ? .27 : -.27);
    if (facing === 'back') patch.rotation.y = Math.PI;
    patch.userData.yogaMosaicTarget = 'crotch';
    patch.userData.yogaMosaicFacing = facing;
    parent.add(patch);
  };
  const person = (
    side: number,
    skin: THREE.Material,
    hair: THREE.Material,
    costume: THREE.Material,
  ): { group: THREE.Group; head: THREE.Group; nearLeg: THREE.Group } => {
    const group = new THREE.Group();
    group.name = side < 0 ? 'yoga-blue-partner' : 'yoga-yellow-partner';
    group.scale.setScalar(.72);
    group.position.set(side * .7, .2184, .7);
    root.add(group);

    block([1, 1.4, .52], [0, 2.1, 0], costume, group);
    block([.98, .5, .5], [0, 1.15, 0], costume, group);
    const head = new THREE.Group();
    head.position.set(0, 2.97, 0);
    group.add(head);
    block([.72, .7, .68], [0, .16, 0], skin, head);
    block([.78, .28, .58], [0, .5, -.1], hair, head);
    block([.16, .44, .5], [side * .38, .1, -.12], hair, head);
    block([.1, .05, .06], [-.17, .2, .35], hairDark, head);
    block([.1, .05, .06], [.17, .2, .35], hairDark, head);

    // Inner arms form a clumsy overhead arch, while outer hands rest at hips.
    // The two raised arms meet palm to palm: steep enough that their inner
    // faces touch at the couple's centre line rather than passing through each
    // other (owner, 2026-10-22). INNER_ARM_TILT is solved for that contact.
    const innerArm = new THREE.Group();
    innerArm.name = 'yoga-inner-arm';
    innerArm.position.set(-side * .55, 2.61, 0);
    innerArm.rotation.z = -side * INNER_ARM_TILT;
    group.add(innerArm);
    block([.26, 1.2, .24], [0, -.6, 0], skin, innerArm);
    const outerArm = new THREE.Group();
    outerArm.position.set(side * .55, 2.61, 0);
    outerArm.rotation.z = side * .85;
    group.add(outerArm);
    block([.26, .65, .24], [0, -.325, 0], skin, outerArm);
    const elbow = new THREE.Group();
    elbow.position.y = -.65;
    elbow.rotation.z = -side * 1.8;
    outerArm.add(elbow);
    block([.25, .6, .24], [0, -.3, 0], skin, elbow);

    const planted = new THREE.Group();
    planted.name = 'yoga-planted-leg';
    planted.position.set(-side * .24, 1.13, 0);
    group.add(planted);
    block([.36, 1.1, .34], [0, -.55, 0], skin, planted);
    const nearLeg = new THREE.Group();
    nearLeg.name = 'yoga-lifted-outer-knee';
    nearLeg.position.set(side * .24, 1.13, 0);
    nearLeg.rotation.z = side * 1.03;
    group.add(nearLeg);
    block([.36, .65, .34], [0, -.325, 0], skin, nearLeg);
    const knee = new THREE.Group();
    knee.position.y = -.65;
    knee.rotation.z = -side * 1.8;
    nearLeg.add(knee);
    block([.36, .65, .34], [0, -.325, 0], skin, knee);

    // A television censor box over a crotch that is already in swimwear: the
    // box implies more than there is. Front and back, so it reads from
    // whichever side somebody walks up. It rides the body, so it wobbles too.
    mosaic(group, 'front');
    mosaic(group, 'back');
    return { group, head, nearLeg };
  };
  const left = person(-1, skinWarm, hairDark, trunks);
  const right = person(1, skinDeep, hairLight, swimsuit);
  root.userData.beachYoga = { pose: 'upright-partner-tree-balance', clothed: true, mosaicTargets: ['crotch'], mosaicFacings: ['front', 'back'], actors: 2 };

  // --- the parasol ----------------------------------------------------------
  // Planted at the head end, which is the only end that wanted shading.
  const parasol = new THREE.Group();
  parasol.position.set(-0.25, 0, -2.5);
  parasol.rotation.z = 0.13;
  root.add(parasol);
  block([0.2, 3.5, 0.2], [0, 1.75, 0], poleWood, parasol);
  // Kept down to something a person would carry. At four and a half across it
  // shaded the whole scene it was meant to be part of, and read as a roof.
  // Stacked, not interleaved. The stripes were three slabs at 3.40, 3.39 and
  // 3.38 with heights of 0.22 and 0.26 — which is three boxes sharing the same
  // space, and what a depth buffer does with coplanar faces is flicker between
  // them. They now sit on top of the canopy with clear air between, so nothing
  // is fighting anything.
  block([3.5, 0.2, 3.5], [0, 3.36, 0], canopy, parasol);
  block([1.6, 0.09, 3.52], [0, 3.5, 0], canopyCream, parasol);
  block([3.52, 0.09, 1.6], [0, 3.5, 0], canopyCream, parasol);
  block([0.72, 0.16, 0.72], [0, 3.62, 0], canopy, parasol);

  return { root, leftHead: left.head, rightHead: right.head, kickedLeg: right.nearLeg, people: [left.group, right.group], parasol };
};

/**
 * A slow ankle wobble: two people struggling to hold a yoga balance. They sway
 * together, the same way at once, so the hands they hold together overhead stay
 * touching; swaying apart and back, they met through each other.
 */
export const animateBeachCouple = (rig: BeachCoupleRig, elapsed: number): void => {
  const wobble = Math.sin(elapsed * .82) * .022;
  rig.people[0].rotation.z = wobble;
  rig.people[1].rotation.z = wobble;
  for (let i = 0; i < rig.people.length; i++) {
    const person = rig.people[i], angle = person.rotation.z, plantedX = i === 0 ? .24 : -.24;
    // Balance on the lowest sole corner, exactly on the stripe top (Y .24).
    const sole = .03 * Math.cos(angle) + (plantedX - Math.sign(angle) * .18) * Math.sin(angle);
    person.position.y = .24 - .72 * sole;
  }
  rig.leftHead.rotation.z = -.08 - wobble;
  rig.rightHead.rotation.z = .11 + wobble;
  rig.leftHead.rotation.y = .22;
  rig.rightHead.rotation.y = -.22;
  rig.kickedLeg.rotation.z = 1.03 + Math.sin(elapsed * .69) * .04;
  rig.parasol.rotation.z = .13 + Math.sin(elapsed * .6) * .012;
};
