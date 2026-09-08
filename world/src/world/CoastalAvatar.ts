import * as THREE from 'three';
import type { AvatarPalette, AvatarColourSlot, AvatarRig } from './FestivalWorld';
import { addAvatarAccessories } from './AvatarAccessories';

/** Deliberate light bands, retaining the world's coloured ambient and night lights. */
export function coastalMaterial(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  mat.userData.wornNoMasonry = true;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      `float coastalLuma = max(dot(totalDiffuse, vec3(0.2126, 0.7152, 0.0722)), 0.001);
       float coastalBand = floor(coastalLuma * 5.0 + 0.5) / 5.0;
       totalDiffuse *= mix(1.0, max(0.10, coastalBand) / coastalLuma, 0.42);
       vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;`,
    );
  };
  mat.customProgramCacheKey = () => 'coastal-soft-cel-v1';
  return mat;
}

const faces = new Map<number, THREE.MeshStandardMaterial>();
function faceMaterial(variant: number): THREE.MeshStandardMaterial {
  const cached = faces.get(variant);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const c = canvas.getContext('2d')!;
  // The face is a tiny authored decal: brows, narrow eyes, cheek and lip marks.
  c.fillStyle = '#493b32';
  c.fillRect(6, 9, 6, 1); c.fillRect(20, 9 + variant % 2, 6, 1);
  c.fillStyle = '#d7cbb6'; c.fillRect(6, 12, 6, 2); c.fillRect(20, 12, 6, 2);
  c.fillStyle = '#272e2e'; c.fillRect(9, 12, 2, 2); c.fillRect(21, 12, 2, 2);
  c.fillStyle = '#805b4d'; c.fillRect(14, 23, 6, 1);
  c.fillStyle = '#c1896c'; c.fillRect(5, 18, 4, 1); c.fillRect(23, 18, 4, 1);
  if (variant === 3) { c.fillStyle = '#51463b'; c.fillRect(13, 21, 7, 1); }
  const map = new THREE.CanvasTexture(canvas);
  map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter;
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: .1, roughness: 1, depthWrite: false });
  mat.userData.wornNoGrain = true; mat.userData.wornNoMasonry = true;
  faces.set(variant, mat); return mat;
}

/** Dimensions are actual widths, unlike the radius-based old four-sided cylinders. */
function taper(top: number, bottom: number, height: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(top / Math.SQRT2, bottom / Math.SQRT2, height, 4);
  g.rotateY(Math.PI / 4); g.scale(1, 1, depth / Math.max(top, bottom));
  return g;
}

export function createCoastalAvatar(
  parent: THREE.Group, palette: AvatarPalette, markPalette: boolean,
  board: THREE.Group,
): AvatarRig {
  const seed = Number.parseInt(palette.top.slice(1), 16) + Number.parseInt(palette.bottoms.slice(1), 16);
  const variant = seed % 4;
  parent.userData.coastalCharacter = variant;
  const materials = Object.fromEntries(['skin', 'hair', 'top', 'bottoms', 'swimwear'].map(slot =>
    [slot, coastalMaterial(palette[slot as AvatarColourSlot])])) as Record<AvatarColourSlot, THREE.MeshStandardMaterial>;
  materials.skin.userData.wornNoGrain = true; materials.hair.userData.wornNoGrain = true;
  const ink = coastalMaterial(0x343a38), trim = coastalMaterial(0xd0bfa0);
  const part = (g: THREE.BufferGeometry, at: [number, number, number], target: THREE.Object3D,
    slot: AvatarColourSlot | THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(g, typeof slot === 'string' ? materials[slot] : slot);
    mesh.position.set(...at); target.add(mesh);
    mesh.userData.coastalAuthored = true;
    if (markPalette && typeof slot === 'string') mesh.userData.paletteSlot = slot;
    return mesh;
  };
  const box = (size: [number, number, number], at: [number, number, number], target: THREE.Object3D,
    slot: AvatarColourSlot | THREE.Material) => part(new THREE.BoxGeometry(...size), at, target, slot);
  const broad = variant === 2 ? 1.06 : .96;
  part(taper(.69, .64, .36, .4), [0, 1.2, 0], parent, 'bottoms');
  const spine = new THREE.Group(); spine.position.y = 1.45; parent.add(spine);
  part(taper(broad, .67, .89, .47), [0, .43, 0], spine, 'top');
  // Hem, pocket and collar are sewn garment details, without mechanical joint caps.
  box([.70, .09, .46], [0, .015, 0], spine, 'top');
  box([.18, .21, .02], [-.23, .57, .246], spine, 'top');
  part(taper(.23, .28, .23, .23), [0, .98, 0], spine, 'skin');
  for (const side of [-1, 1]) {
    const collar = box([.19, .13, .055], [side * .14, .825, .22], spine, trim);
    collar.rotation.z = side * .30;
  }
  if (variant === 1) box([.025, .69, .025], [0, .40, .25], spine, trim);
  if (variant === 2) box([.69, .065, .02], [0, .31, .249], spine, trim);

  const head = new THREE.Group(); head.position.set(0, 1.02, 0); spine.add(head);
  part(taper(.48, .37, .55, .40), [0, .28, 0], head, 'skin');
  // A small nose and ears give the profile a human outline at walking distance.
  part(taper(.05, .09, .15, .095), [0, .28, .23], head, 'skin');
  for (const side of [-1, 1]) box([.075, .15, .11], [side * .245, .29, -.005], head, 'skin');
  const face = part(new THREE.PlaneGeometry(.41, .49), [0, .285, .202], head, faceMaterial(variant));
  face.renderOrder = 1;
  part(taper(.46, .51, variant === 0 ? .13 : .18, .45), [0, .57, -.025], head, 'hair');
  if (variant === 0) {
    const fringe = box([.31, .105, .17], [-.075, .53, .15], head, 'hair'); fringe.rotation.z = -.15;
  } else if (variant === 1) {
    box([.50, .43, .16], [0, .36, -.19], head, 'hair');
    box([.105, .38, .28], [-.22, .39, -.055], head, 'hair');
  } else if (variant === 2) {
    part(new THREE.IcosahedronGeometry(.27, 0), [0, .67, -.08], head, 'hair');
  } else {
    box([.48, .18, .12], [0, .48, -.22], head, 'hair');
    box([.08, .2, .17], [.21, .43, -.02], head, 'hair');
  }
  const arm = (side: number) => {
    const pivot = new THREE.Group(); pivot.position.set(side * (broad / 2 + .065), .75, 0); spine.add(pivot);
    part(taper(.29, .24, .39, .31), [0, -.16, 0], pivot, 'top');
    part(taper(.215, .18, .3, .22), [0, -.44, 0], pivot, 'skin');
    const joint = new THREE.Group(); joint.position.y = -.56; pivot.add(joint);
    part(taper(.19, .145, .46, .19), [0, -.20, .005], joint, 'skin');
    part(taper(.15, .18, .20, .14), [0, -.49, .03], joint, 'skin');
    return { pivot, joint };
  };
  const leg = (side: number) => {
    const pivot = new THREE.Group(); pivot.position.set(side * .22, 1.16, 0); parent.add(pivot);
    part(taper(.32, .26, .76, .37), [0, -.33, 0], pivot, 'bottoms');
    const joint = new THREE.Group(); joint.position.y = -.71; pivot.add(joint);
    part(taper(.27, .24, .61, .31), [0, -.26, 0], joint, 'bottoms');
    box([.29, .18, .48], [0, -.61, .085], joint, ink);
    // Root .28 above the walking surface; the sole ends at exactly -.28.
    box([.30, .055, .50], [0, -.7025, .09], joint, trim);
    return { pivot, joint };
  };
  const left = arm(-1), right = arm(1), ll = leg(-1), rr = leg(1);
  const treat = box([.16, .16, .22], [0, -.49, .18], right.joint, coastalMaterial(0xd18a35));
  treat.visible = false;
  addAvatarAccessories({ head, torso: spine, leftArm: left.pivot, rightArm: right.pivot }, palette, markPalette);
  return { leftArm: left.pivot, rightArm: right.pivot, leftLeg: ll.pivot, rightLeg: rr.pivot,
    leftElbow: left.joint, rightElbow: right.joint, leftKnee: ll.joint, rightKnee: rr.joint,
    head, torso: spine, treat, board, headTop: variant === 2 ? 3.41 : 3.13 };
}
