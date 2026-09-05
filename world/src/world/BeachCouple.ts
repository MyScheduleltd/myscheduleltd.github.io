import * as THREE from 'three';

/**
 * Two people on a towel behind the palms, who came to the festival for each
 * other rather than for the films.
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
  /** The two head pivots, which are the whole joke. */
  leftHead: THREE.Group;
  rightHead: THREE.Group;
  /** One leg that goes up, because one leg always goes up. */
  kickedLeg: THREE.Group;
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

export const createBeachCouple = (): BeachCoupleRig => {
  const root = new THREE.Group();
  root.name = 'beach-couple';

  const towelRed = flat(0xc4453a, 0.92);
  const towelCream = flat(0xe8dcc0, 0.92);
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
  // Sized to what is actually lying on it: at five across and three deep the
  // pair's feet hung off the end onto the sand, which is the one thing nobody
  // does on a beach towel.
  //
  // Thick, and sitting well clear of zero. The first one was eight centimetres
  // thick with its top at 0.09, and the beach it was laid on is at 0.28 — so
  // it was buried, and the pair were lying on bare sand with nothing under
  // them. The caller sets the group down on the ground; everything here is
  // measured up from that.
  // The stripes are set *into* the towel rather than laid on top of it. Sitting
  // exactly on the surface put their underside on the same plane as the
  // towel's top face, and two faces in one plane is what a depth buffer
  // flickers between — which is the striping that showed up along the whole
  // mat. Sunk halfway in, nothing is coplanar with anything.
  block([3.8, 0.18, 5.4], [0, 0.09, 0.35], towelCream, root);
  for (const z of [-1.7, -0.5, 0.7, 1.9, 2.6]) {
    block([3.86, 0.14, 0.46], [0, 0.14, z], towelRed, root);
  }

  // --- the pair -------------------------------------------------------------
  // Lying on their backs, shoulders touching, heads turned in. Everything is
  // low and horizontal: the silhouette has to say "lying down" from across the
  // sand, before any of the detail is legible.
  const person = (
    side: number,
    skin: THREE.Material,
    hair: THREE.Material,
    costume: THREE.Material,
  ): { group: THREE.Group; head: THREE.Group; nearLeg: THREE.Group } => {
    const group = new THREE.Group();
    group.position.set(side * 0.74, 0, 0);
    root.add(group);

    block([1.0, 0.52, 1.5], [0, 0.5, -0.1], costume, group);
    block([0.98, 0.5, 0.5], [0, 0.5, 0.75], skin, group);

    // Head on a pivot at the shoulder end, so it can turn in without the body
    // following it.
    const head = new THREE.Group();
    head.position.set(0, 0.58, -1.02);
    group.add(head);
    block([0.72, 0.7, 0.68], [0, 0.16, 0], skin, head);
    block([0.78, 0.28, 0.72], [0, 0.5, -0.02], hair, head);
    block([0.16, 0.44, 0.5], [side * -0.38, 0.1, -0.12], hair, head);
    // Eyes shut. They are not looking at the sea.
    block([0.1, 0.05, 0.06], [-0.17, 0.2, 0.35], hairDark, head);
    block([0.1, 0.05, 0.06], [0.17, 0.2, 0.35], hairDark, head);

    // The far arm lies flat on the towel.
    block([0.26, 0.24, 1.2], [side * 0.55, 0.44, -0.1], skin, group);
    // The near one is thrown across the other person — over them, not through
    // them. It used to sit at the same height as their chest and reach into
    // it, which is not an embrace, it is two boxes in the same place. The
    // torso's top is at 0.76, so the arm rides above that and rests on it.
    const arm = new THREE.Group();
    arm.position.set(side * -0.42, 0.9, -0.3);
    arm.rotation.set(0, 0, side * 0.12);
    group.add(arm);
    block([0.26, 0.2, 0.9], [side * -0.5, 0, 0], skin, arm);
    block([0.22, 0.18, 0.24], [side * -0.95, -0.04, 0.06], skin, arm);

    const farLeg = new THREE.Group();
    farLeg.position.set(side * 0.24, 0.44, 1.0);
    group.add(farLeg);
    block([0.36, 0.34, 1.3], [0, 0, 0.62], skin, farLeg);

    const nearLeg = new THREE.Group();
    nearLeg.position.set(side * -0.22, 0.44, 1.0);
    group.add(nearLeg);
    block([0.36, 0.34, 1.3], [0, 0, 0.62], skin, nearLeg);

    return { group, head, nearLeg };
  };

  const left = person(-1, skinWarm, hairDark, trunks);
  const right = person(1, skinDeep, hairLight, swimsuit);

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

  return { root, leftHead: left.head, rightHead: right.head, kickedLeg: right.nearLeg, parasol };
};

/**
 * The loop. They lean in, they meet, they part, and one of them forgets what
 * their leg is doing. Slow — the whole thing is funnier at a pace nobody would
 * describe as urgent, and a fast loop behind the palms would read as a glitch.
 */
export const animateBeachCouple = (rig: BeachCoupleRig, elapsed: number): void => {
  const cycle = elapsed * 0.42;
  // Held at the top of the swing rather than passed through, so there is a
  // kiss and not a collision.
  const lean = Math.max(0, Math.sin(cycle)) ** 0.6;
  rig.leftHead.rotation.z = -0.62 * lean;
  rig.rightHead.rotation.z = 0.62 * lean;
  rig.leftHead.rotation.y = 0.16 * lean;
  rig.rightHead.rotation.y = -0.16 * lean;
  // The leg goes up a beat behind the lean, which is the joke.
  rig.kickedLeg.rotation.x = -0.95 * Math.max(0, Math.sin(cycle - 0.55)) ** 0.8;
  // Barely there, but a parasol that never moves is a parasol nobody planted.
  rig.parasol.rotation.z = 0.13 + Math.sin(elapsed * 0.6) * 0.012;
};
