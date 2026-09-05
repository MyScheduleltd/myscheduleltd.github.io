import * as THREE from 'three';
import type { AvatarPalette } from './FestivalWorld';

/**
 * The things a visitor puts on over the top of themselves.
 *
 * Two rigs are built in this world — the plain box figure and the styled one
 * with tapered limbs — and they are not the same size. A cap sized by hand for
 * one sits like a bucket on the other. So nothing here is a fixed measurement:
 * each piece is cut from the bounding box of the part it goes on, read off the
 * rig that has just been built. One implementation, both bodies, and a third
 * rig later would need nothing added here.
 *
 * Every accessory is built whether or not it is being worn, and shown or
 * hidden from the palette. Rebuilding a body to put a hat on it would mean
 * tearing down and replacing a rig that is in the middle of a walk cycle, and
 * would have to happen on every other visitor's screen too; a visibility flag
 * costs nothing and can change on any frame.
 */

export const ACCESSORY_SLOTS = ['cap', 'chain', 'tattoo', 'backpack'] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];

/** Default colour offered for each, the first time somebody switches it on. */
export const DEFAULT_ACCESSORY_COLOURS: Record<AccessorySlot, string> = {
  cap: '#1d1f24',
  chain: '#d8b23f',
  tattoo: '#2b2f4a',
  backpack: '#7a3b2c',
};

export interface AccessoryAnchors {
  /** The head pivot. The cap goes on whatever is inside it. */
  head: THREE.Object3D;
  /** What the chain and the pack hang off. */
  torso: THREE.Object3D;
  /**
   * Where the torso is, when that cannot be read off the anchor.
   *
   * One rig's chest is a group with the body inside it and measures itself.
   * The other's is a single scaled mesh, and hanging anything on a mesh means
   * inheriting its scale — a chain stretched to 1.02 x 1.38 x 0.62. That rig
   * passes the avatar's own root as the anchor and says here where the chest
   * sits within it.
   */
  torsoBounds?: THREE.Box3;
  /** Upper-arm pivots, for the ink. */
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
}

/**
 * The extent of a group's own meshes, in that group's coordinates.
 *
 * `Box3.setFromObject` would want world matrices that are not up to date at
 * build time, and would drag in whatever the group is parented to. These rigs
 * hang their pieces directly off the pivot, so accumulating each child's own
 * geometry box through its own position and scale is both enough and exact.
 */
const localBox = (group: THREE.Object3D): THREE.Box3 => {
  const box = new THREE.Box3();
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const geometry = child.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) continue;
    const min = bounds.min.clone().multiply(child.scale).add(child.position);
    const max = bounds.max.clone().multiply(child.scale).add(child.position);
    box.expandByPoint(new THREE.Vector3(Math.min(min.x, max.x), Math.min(min.y, max.y), Math.min(min.z, max.z)));
    box.expandByPoint(new THREE.Vector3(Math.max(min.x, max.x), Math.max(min.y, max.y), Math.max(min.z, max.z)));
  }
  return box;
};

const accessoryMaterial = (colour: string): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
  color: new THREE.Color(colour),
  roughness: 0.72,
  metalness: 0.08,
  flatShading: true,
});

const piece = (
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
 * Hang the four accessories off a rig that has just been built.
 *
 * `markPalette` follows the same rule the rest of the rig uses: the visitor's
 * own body is marked so the live preview can recolour it in place, and other
 * people's bodies are not.
 */
export const addAvatarAccessories = (
  anchors: AccessoryAnchors,
  palette: AvatarPalette,
  markPalette = false,
): void => {
  const build = (slot: AccessorySlot, parent: THREE.Object3D): THREE.Group => {
    const group = new THREE.Group();
    group.name = `accessory-${slot}`;
    group.userData.accessorySlot = slot;
    group.visible = Boolean(palette[slot]);
    if (markPalette) group.userData.paletteSlot = slot;
    parent.add(group);
    return group;
  };
  const shade = (slot: AccessorySlot): THREE.MeshStandardMaterial => {
    const material = accessoryMaterial(palette[slot] ?? DEFAULT_ACCESSORY_COLOURS[slot]);
    if (markPalette) material.userData.accessorySlot = slot;
    // Skin and hair are exempted from the world's surface grain because a
    // person is not a wall; cloth and metal worn on that person are not a wall
    // either, and picking up the grain made a cap read as a roof tile.
    material.userData.wornNoGrain = true;
    return material;
  };

  // ---- cap -----------------------------------------------------------------
  const headBox = localBox(anchors.head);
  if (!headBox.isEmpty()) {
    const size = headBox.getSize(new THREE.Vector3());
    const centre = headBox.getCenter(new THREE.Vector3());
    const cap = build('cap', anchors.head);
    const material = shade('cap');
    const crownHeight = size.y * 0.34;
    const crownY = headBox.max.y - crownHeight * 0.42;
    piece([size.x * 1.06, crownHeight, size.z * 1.06], [centre.x, crownY, centre.z], material, cap);
    // The peak. It is the only part of a cap that reads as a cap in
    // silhouette, so it is the part that must not be skimped.
    piece(
      [size.x * 0.96, crownHeight * 0.3, size.z * 0.62],
      [centre.x, crownY - crownHeight * 0.5, headBox.max.z + size.z * 0.28],
      material,
      cap,
    );
  }

  // ---- chain and pack ------------------------------------------------------
  const torsoBox = anchors.torsoBounds ?? localBox(anchors.torso);
  if (!torsoBox.isEmpty()) {
    const size = torsoBox.getSize(new THREE.Vector3());
    const centre = torsoBox.getCenter(new THREE.Vector3());
    const front = torsoBox.max.z;
    const back = torsoBox.min.z;

    // A chain of links, hung round the neck.
    //
    // Two goes at this were wrong in opposite directions: first a great
    // chevron of two long strands, which read as webbing somebody had been
    // strapped into, and then three thin sticks and a blob, which read as a
    // shirt button. What the reference actually shows is a rope of heavy links
    // that goes round the neck and hangs in a U on the chest — thick, short,
    // and obviously made of separate pieces.
    //
    // So it is built as links, placed round a curve. Each one is a small block
    // set at its own angle along the arc, which is as close to a curb chain as
    // a pile of boxes gets, and at avatar scale is exactly what reads.
    const chain = build('chain', anchors.torso);
    const chainMaterial = shade('chain');
    // The neck's own width, not the chest's: a chain fits the throat.
    const radiusX = size.x * 0.3;
    // How far it hangs. A heavy chain sits well down the chest, which is what
    // makes it a chain and not a collar.
    const drop = size.y * 0.34;
    const neckY = torsoBox.max.y - size.y * 0.05;
    const link = Math.max(size.x * 0.11, 0.05);
    const LINKS = 11;
    for (let index = 0; index < LINKS; index += 1) {
      // Across the throat and down: -1 at the left shoulder, +1 at the right,
      // 0 at the bottom of the hang.
      const across = (index / (LINKS - 1)) * 2 - 1;
      const x = centre.x + across * radiusX;
      // A hanging chain is not a semicircle. Its lowest stretch is flat and
      // it turns up sharply at the ends, which a fourth power gives and a
      // circle does not.
      const y = neckY - drop * (1 - across ** 4);
      // Round the body as well as across it, or the chain cuts a straight line
      // through a chest that is curved.
      const z = front * (0.78 + 0.16 * (1 - across * across));
      const piece3 = piece([link * 1.25, link * 1.25, link], [x, y, z], chainMaterial, chain);
      // Alternating quarter turns, which is how the links of a real chain sit
      // and the one detail that stops this reading as a row of beads.
      piece3.rotation.z = (index % 2 === 0 ? 0.42 : -0.42) + across * 0.5;
      piece3.rotation.x = index % 2 === 0 ? 0.3 : -0.3;
    }
    // The weight on the end of it, hanging below the lowest link.
    piece(
      [size.x * 0.17, size.y * 0.1, link * 1.3],
      [centre.x, neckY - drop - size.y * 0.06, front * 0.95],
      chainMaterial,
      chain,
    );

    const pack = build('backpack', anchors.torso);
    const packMaterial = shade('backpack');
    const packDepth = size.z * 0.62;
    piece(
      [size.x * 0.86, size.y * 0.74, packDepth],
      [centre.x, centre.y - size.y * 0.02, back - packDepth * 0.5],
      packMaterial,
      pack,
    );
    // Straps over the shoulders, which is what stops it floating behind them.
    for (const side of [-1, 1]) {
      piece(
        [size.x * 0.14, size.y * 0.86, size.z * 0.16],
        [side * size.x * 0.28, centre.y + size.y * 0.1, front * 0.72],
        packMaterial,
        pack,
      );
    }
  }

  // ---- ink -----------------------------------------------------------------
  // Arms only. Bands rather than a pattern: at this size a design is three
  // pixels of noise, and a band around the bicep is what a tattoo looks like
  // from across a square.
  for (const arm of [anchors.leftArm, anchors.rightArm]) {
    const armBox = localBox(arm);
    if (armBox.isEmpty()) continue;
    const size = armBox.getSize(new THREE.Vector3());
    const centre = armBox.getCenter(new THREE.Vector3());
    const ink = build('tattoo', arm);
    const material = shade('tattoo');
    for (const [depth, thickness] of [[0.26, 0.1], [0.46, 0.06], [0.6, 0.04]] as Array<[number, number]>) {
      piece(
        [size.x * 1.07, size.y * thickness, size.z * 1.07],
        [centre.x, armBox.max.y - size.y * depth, centre.z],
        material,
        ink,
      );
    }
  }
};

/**
 * Show, hide and recolour whatever accessories a body is carrying.
 *
 * Safe to call on any group, including one built before accessories existed:
 * a body with none simply has nothing marked to find.
 */
export const applyAvatarAccessories = (root: THREE.Object3D, palette: AvatarPalette): void => {
  root.traverse((child) => {
    const slot = child.userData.accessorySlot as AccessorySlot | undefined;
    if (!slot) return;
    const colour = palette[slot];
    child.visible = Boolean(colour);
    if (!colour) return;
    child.traverse((part) => {
      if (part instanceof THREE.Mesh && part.material instanceof THREE.MeshStandardMaterial) {
        part.material.color.set(colour);
      }
    });
  });
};
