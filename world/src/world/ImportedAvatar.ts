import { topOutfit, avatarSex, type AvatarSex } from './CoastalOutfits';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { AvatarPalette, AvatarRig } from './FestivalWorld';
import avatarMeta from '../assets/avatars/avatars.json';
import { FINGER_NAMES, FIST, handPoseFromJoints, mixHandPose, type FingerName, type HandPose } from './HandPose';
import { DEFAULT_ACCESSORY_COLOURS } from './AvatarAccessories';
import movesData from '../data/moves.json';
import { walkCoastalPose, levelCoastalFeet } from './CoastalPose';

/**
 * The punch and the dance, from the owner's Mixamo files (2026-10-01; see
 * scripts/prepare-moves.py): per bone, its turn away from the file's rest in
 * the body's frame, 24 a second, the hips' travel as fractions of the
 * standing hip height, and where each joint was at the file's rest. Played on
 * each body's own skeleton, so they fit both.
 */
type MoveClip = { frames: number; bones: Record<string, number[]>; hips: number[]; rest: Record<string, number[]>; contact?: number };
/**
 * The joint each moved bone points at. A body's bone is first turned from its
 * own rest direction onto the file's (the dance rests in a T-pose, the bodies
 * in their generated A-pose), so the move's turns start where the file's did;
 * played straight onto the A-pose, the dance's arms were wrong (the owner,
 * October 2). Hands, feet's toes and the head keep their parent's alignment;
 * the hips keep their own facing.
 */
const MOVE_CHILD: Record<string, string> = {
  Spine02: 'Spine01', Spine01: 'Spine', Spine: 'neck', neck: 'Head',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
};
const MOVE_INHERIT: Record<string, string> = {
  Head: 'neck', LeftHand: 'LeftForeArm', RightHand: 'RightForeArm', LeftToeBase: 'LeftFoot', RightToeBase: 'RightFoot',
};
export type ImportedMove = 'punch' | 'dance';
const MOVES = movesData as unknown as { fps: number } & Record<ImportedMove, MoveClip>;
export const MOVE_FPS = MOVES.fps;
/** How long a move runs, in seconds; the dance loops. */
export const MOVE_SECONDS: Record<ImportedMove, number> = {
  punch: (MOVES.punch.frames - 1) / MOVES.fps,
  dance: MOVES.dance.frames / MOVES.fps,
};
/** When the punch's fist arrives, in seconds from the start. */
export const PUNCH_CONTACT_SECONDS = MOVES.punch.contact ?? .33;

/**
 * The visitor avatars are the Higgsfield generations, prepared by
 * `scripts/prepare-higgsfield-avatars.py`. Since 2026-09-25 each sex is one
 * body, the same in every outfit: the base generation in its swimwear, with
 * the tee, trousers and shoes of the clothed generation fitted onto it as
 * meshes of their own. The owner asked for the model to stay the same
 * through every outfit, and separately generated bodies never quite matched.
 *
 * So there is one file per sex, and an avatar mounts it once. Outfits 1 to 3
 * show the garments (and their prints, or the vest); the swimsuit, on land or
 * in the water, is the body with the garments hidden. Dressed, the body's
 * vertices under the garments (its `_covered` attribute) are not drawn, so no
 * skin can show through a sleeve or a shoe however the body moves.
 *
 * The procedural coastal rig still does all the animating. Each mapped bone
 * copies its control joint's rotation, measured from where the two stood at
 * rest, so every existing pose drives these skeletons unchanged. The models
 * were generated in an A-pose; lowering the arms happens here, through their
 * own skin weights, because baking a lowered rest into the mesh is what
 * hunched the shoulders of the prototype.
 */

/**
 * One model per sex, each its dressed generation, head and all, in every
 * outfit; in the swimsuit a swim body is drawn under that head instead of
 * the clothes (the owner, October 2 for her, October 5 for him: "match to
 * the head when he's in outfits 1-3 like you did for the female").
 */
export type AvatarVariant = AvatarSex;
export const AVATAR_VARIANTS: AvatarVariant[] = ['male', 'female'];
type DyeSlot = 'skin' | 'hair' | 'bottoms' | 'swimwear';
type Meta = { sex: AvatarSex; mouth: number[]; native: Partial<Record<DyeSlot, string>>; reference: Partial<Record<DyeSlot, number>>; cap?: { band: number; top: number } };
const META = avatarMeta as unknown as Record<AvatarVariant, Meta>;

import { AVATAR_NATIVE } from './NativeAvatarPalette';
export { AVATAR_NATIVE, avatarVariantsFor } from './NativeAvatarPalette';

/**
 * Native colours of earlier builds that visitors may have saved. Her hair read
 * #3d3335 on the modelled bob; on her generated hair (2026-10-01) it reads a
 * shade lighter, and a saved old value would otherwise dye the new texture.
 */
const LEGACY_NATIVE: Partial<Record<AvatarVariant, Partial<Record<DyeSlot, string[]>>>> = {
  // And the October 1 builds' (#423738 hair, #fbd2c0 skin, #171518 suit).
  female: { hair: ['#3d3335', '#423738'], skin: ['#fbd2c0'], swimwear: ['#171518'] },
  // His September 28 body (until October 4), whose colours visitors saved.
  // And the October 4 builds on the September 25 body.
  male: { hair: ['#54342b', '#573831'], skin: ['#faad82', '#f9a67c'], swimwear: ['#0d0b0e', '#191519'], bottoms: ['#5a5a4d', '#58574b'] },
};

/** The cap's default before October 2, which saved palettes may still hold. */
const LEGACY_CAP = '#1d1f24';
/** Model units to the avatar body: 1.7 tall, origin at mid-height. */
const MODEL_SCALE = 3.42 / 1.7;
const MODEL_Y = 1.43;
/** How far the walking arms stand out from the body, in radians. */
const ARM_SPREAD = .27;
/** How far each foot stands out beyond its hip at rest, in model units. The
 * generated bodies stand 3 to 7 cm out, the men widest, and read as a
 * straddle; brought right under the hips, the baggy trousers met. Every body
 * is given this one small stance instead, and the walk opens the legs a
 * little further as they pass (see walkCoastalPose). */
const STANCE = .025;
/** The meshes the dye shader draws: the body and the garments on it. */
const DYED = new Set(['body', 'garment-tee', 'garment-trousers', 'garment-shoes']);

interface Template { scene: THREE.Group; dye?: THREE.Texture; vest?: THREE.Texture }
const templates = new Map<AvatarVariant, Template>();
const pending = new Map<AvatarVariant, Promise<void>>();
/** Avatars waiting for a body or its finishing layers to arrive. */
const arrivals = new Set<() => void>();
const announce = () => { for (const listener of [...arrivals]) listener(); };

function modelUrl(key: AvatarVariant): string {
  return key === 'male'
    ? new URL('../assets/avatars/male.glb', import.meta.url).href
    : new URL('../assets/avatars/female.glb', import.meta.url).href;
}

function dyeUrl(key: AvatarVariant): string {
  return key === 'male'
    ? new URL('../assets/avatars/male-dye.png', import.meta.url).href
    : new URL('../assets/avatars/female-dye.png', import.meta.url).href;
}

function vestUrl(key: AvatarVariant): string | undefined {
  return key === 'male'
    ? new URL('../assets/avatars/male-vest.jpg', import.meta.url).href
    : new URL('../assets/avatars/female-vest.jpg', import.meta.url).href;
}

/** The body's texture with the utility vest painted over the tee. */
async function loadVest(key: AvatarVariant, like?: THREE.Texture): Promise<THREE.Texture | undefined> {
  const url = vestUrl(key);
  if (!url || typeof window === 'undefined' || typeof Image === 'undefined') return undefined;
  try {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    if (like) { texture.magFilter = like.magFilter; texture.minFilter = like.minFilter; texture.anisotropy = like.anisotropy; }
    return texture;
  } catch {
    return undefined;
  }
}

async function loadDye(key: AvatarVariant): Promise<THREE.Texture | undefined> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return undefined;
  try {
    const texture = await new THREE.TextureLoader().loadAsync(dyeUrl(key));
    // Weights, not colours, and filtered exactly like the texture they
    // describe, so the two always agree about which texel is which.
    texture.flipY = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    return texture;
  } catch {
    // Without the mask the bodies keep their generated colours.
    return undefined;
  }
}

function sharpenBody(map?: THREE.Texture | null): void {
  if (!map) return;
  // Crisp pixels up close, averaged ones far away. Nearest-mipmap sampling
  // picked one texel of a smaller level at random and sparkled.
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.anisotropy = 4;
  map.needsUpdate = true;
}

function loadVariant(key: AvatarVariant, bytes?: ArrayBuffer): Promise<void> {
  const known = pending.get(key);
  if (known) return known;
  const promise = (async () => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = bytes ? await loader.parseAsync(bytes, '') : await loader.loadAsync(modelUrl(key));
    const template: Template = { scene: gltf.scene };
    let map: THREE.Texture | undefined;
    gltf.scene.traverse(o => { if (o instanceof THREE.Mesh && o.userData.componentId === 'body') map = (o.material as THREE.MeshStandardMaterial).map ?? undefined; });
    sharpenBody(map);
    templates.set(key, template);
    announce();
    // The dye mask and the vest follow on their own: a body is usable without
    // them, and nobody should wait at the gate for a colour.
    if (!bytes) void Promise.all([
      loadDye(key).then(t => { template.dye = t; }),
      loadVest(key, map).then(t => { template.vest = t; }),
    ]).then(announce);
  })().catch(error => { pending.delete(key); throw error; });
  pending.set(key, promise);
  return promise;
}

/**
 * Load the bodies. Resolves once `first` are in — the male body the residents
 * mostly wear, and whichever the visitor is wearing — and fetches the other
 * behind it. `files` lets tests hand every body over directly.
 */
export function loadImportedAvatar(files?: Partial<Record<AvatarVariant, ArrayBuffer>>, first: AvatarVariant[] = ['male'], background = true): Promise<void> {
  if (files) return Promise.all(AVATAR_VARIANTS.map(key => loadVariant(key, files[key]))).then(() => undefined);
  const wanted = [...new Set<AvatarVariant>(['male', ...first])];
  const essential = Promise.all(wanted.map(key => loadVariant(key)));
  if (background) void essential.then(
    () => Promise.all(AVATAR_VARIANTS.map(key => loadVariant(key).catch(() => undefined))),
    () => undefined,
  );
  return essential.then(() => undefined);
}

type Side = 'Left' | 'Right';
/**
 * How evenly an avatar is lit. The generated models carry their own colours
 * as emission: self-lit, which is how they look in the generator and on the
 * reference sheets. Lit by the world instead, every small bump of the
 * generated mesh drew a shadow — a nose and a pout on her face, a patchwork
 * of facets on his legs. So an avatar takes the scene's light as an amount
 * (ambient, sky and sun colours, so dusk and night still reach it) and mostly
 * ignores which way each face turns; a little directional shading remains so
 * it still stands in the world.
 */
const AVATAR_EVEN = { value: .72 };
export function setAvatarEvenness(amount: number): void {
  AVATAR_EVEN.value = THREE.MathUtils.clamp(amount, 0, 1);
}
function evenLight(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.avatarEven = AVATAR_EVEN;
  shader.fragmentShader = 'uniform float avatarEven;\n' + shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    {
      vec3 evenIrradiance = ambientLightColor;
      #if NUM_HEMI_LIGHTS > 0
        for (int i = 0; i < NUM_HEMI_LIGHTS; i++) evenIrradiance += mix(hemisphereLights[i].groundColor, hemisphereLights[i].skyColor, .7);
      #endif
      #if NUM_DIR_LIGHTS > 0
        for (int i = 0; i < NUM_DIR_LIGHTS; i++) evenIrradiance += directionalLights[i].color * .6;
      #endif
      vec3 litDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
      // The generated colours whatever the hour (the owner, October 2: her
      // hair read red-brown and her skin tan under the island's warm light).
      // The light's colour and strength are dropped: what is left of it is
      // only how much brighter or darker this face is lit than the body as
      // a whole, a little of it, so the body still stands in the scene.
      vec3 luma = vec3(.2126, .7152, .0722);
      float evenLit = dot(evenIrradiance * BRDF_Lambert(material.diffuseColor), luma);
      float shade = clamp(dot(litDiffuse, luma) / max(evenLit, 1e-4), .75, 1.15);
      reflectedLight.directDiffuse = material.diffuseColor * mix(1., shade, 1. - avatarEven);
      reflectedLight.indirectDiffuse = vec3(0.);
      reflectedLight.directSpecular = vec3(0.);
    }`);
}

interface Link { bone: THREE.Bone; control: THREE.Object3D; offset: THREE.Quaternion; bareOffset?: THREE.Quaternion }
interface Hand { bone: THREE.Bone; tips: number[]; palm: THREE.Vector3; thumb: THREE.Vector3; fingers: THREE.Vector3 }
/**
 * One finger's three bones at rest, the axes it curls and spreads about in
 * each bone's own frame, and the angles of the rest pose, so a pose can be
 * given as absolute angles and applied as the difference.
 */
interface Finger { bones: THREE.Bone[]; rest: THREE.Quaternion[]; curl: THREE.Vector3[]; spread: THREE.Vector3 }
interface FingerRig { fingers: Record<FingerName, Finger>; rest: HandPose }
interface Sole { mesh: THREE.SkinnedMesh; vertex: number; side: Side }
interface Mounted {
  key: AvatarVariant;
  /** Each moved bone's rest turn in the body's frame, and the standing hip height. */
  moveRest: Map<string, THREE.Quaternion>;
  /** Per move, the turn taking each bone from this body's rest onto the file's. */
  moveAlign: Record<ImportedMove, Map<string, THREE.Quaternion>>;
  /** The bones only a move turns (spine, neck, shoulders, toes), as they rest. */
  moveHome: Map<string, THREE.Quaternion>;
  moveLeg: number;
  model: THREE.Group;
  meshes: THREE.SkinnedMesh[];
  body: THREE.SkinnedMesh;
  links: Link[];
  hands: Record<Side, Hand>;
  /** Finger bones, when the body has them. */
  fingerRigs: Partial<Record<Side, FingerRig>>;
  /** The lowest points of each foot: bare, and in the shoes. */
  soles: { bare: Sole[]; shod: Sole[] };
  calibrateBareFeet: () => void;
  /** Per dyed mesh, the uniforms its shader reads. */
  uniforms: Map<THREE.SkinnedMesh, Record<string, THREE.IUniform>>;
  /** Per dyed mesh, the palette slot its garment dye comes from. */
  slots: Map<THREE.SkinnedMesh, DyeSlot>;
  mouth: THREE.Vector3;
  atlas?: THREE.Texture | null;
}

const hexDistance = (a: string, b?: string): number => {
  if (!b) return Infinity;
  const x = new THREE.Color(a), y = new THREE.Color(b);
  return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b);
};

/**
 * A height field over points in the head frame: the highest point in each
 * cell of a grid, read with its neighbours so a gap between vertices is not a
 * hole. Off the head there is nothing to rest on (-Infinity).
 */
function headSurface(points: THREE.Vector3[]): (x: number, z: number) => number {
  if (!points.length) return () => -Infinity;
  const box = new THREE.Box3().setFromPoints(points), n = 24;
  const sx = Math.max(box.max.x - box.min.x, 1e-6) / n, sz = Math.max(box.max.z - box.min.z, 1e-6) / n;
  const tops = new Float32Array(n * n).fill(-Infinity);
  const cell = (v: number, min: number, size: number) => Math.floor((v - min) / size);
  for (const p of points) {
    const i = Math.min(n - 1, cell(p.x, box.min.x, sx)), j = Math.min(n - 1, cell(p.z, box.min.z, sz));
    tops[j * n + i] = Math.max(tops[j * n + i], p.y);
  }
  return (x, z) => {
    const i = cell(x, box.min.x, sx), j = cell(z, box.min.z, sz);
    let top = -Infinity;
    for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++)
      if (a >= 0 && a < n && b >= 0 && b < n) top = Math.max(top, tops[b * n + a]);
    return top;
  };
}

export function attachImportedAvatar(root: THREE.Group, rig: AvatarRig, palette: AvatarPalette): AvatarRig {
  if (!templates.has('male')) throw new Error('The male body must finish loading before the world starts.');
  const body = rig.visualRoot!;
  body.scale.setScalar(1);
  // Every procedural surface goes, swimwear included; the rig stays.
  const old: THREE.Mesh[] = [];
  body.traverse(o => { if (o instanceof THREE.Mesh && o !== rig.treat) old.push(o); });
  for (const mesh of old) { mesh.removeFromParent(); mesh.geometry.dispose(); }
  root.userData.swimMeshes = [];
  root.userData.festivalGarments = [];
  root.updateMatrixWorld(true);

  // The controls at rest, in the body's own frame, before anything moves.
  const bodyQuat = body.getWorldQuaternion(new THREE.Quaternion());
  const bodyInverse = bodyQuat.clone().invert();
  const map: Array<[string, THREE.Object3D, THREE.Object3D?]> = [
    ['Hips', body], ['Spine02', rig.torso], ['Head', rig.head],
    ['RightArm', rig.leftArm, rig.leftElbow], ['RightForeArm', rig.leftElbow!, rig.leftWrist], ['RightHand', rig.leftWrist!],
    ['LeftArm', rig.rightArm, rig.rightElbow], ['LeftForeArm', rig.rightElbow!, rig.rightWrist], ['LeftHand', rig.rightWrist!],
    ['RightUpLeg', rig.leftLeg, rig.leftKnee], ['RightLeg', rig.leftKnee!, rig.leftAnkle], ['RightFoot', rig.leftAnkle!],
    ['LeftUpLeg', rig.rightLeg, rig.rightKnee], ['LeftLeg', rig.rightKnee!, rig.rightAnkle], ['LeftFoot', rig.rightAnkle!],
  ];
  const controlRest = new Map<string, THREE.Quaternion>();
  const controlDirection = new Map<string, THREE.Vector3>();
  for (const [name, control, next] of map) {
    controlRest.set(name, bodyInverse.clone().multiply(control.getWorldQuaternion(new THREE.Quaternion())));
    if (next) {
      const from = body.worldToLocal(control.getWorldPosition(new THREE.Vector3()));
      controlDirection.set(name, body.worldToLocal(next.getWorldPosition(new THREE.Vector3())).sub(from).normalize());
    }
  }

  let sex: AvatarSex = avatarSex(palette.top);
  let outfit = topOutfit(palette.top);
  let wearingCap = Boolean(palette.cap);
  let swimming = false;
  let headHidden = false;
  let current = palette;
  // Outfit 4 is the swimsuit worn on land; in the water everyone wears theirs.
  const dressed = () => !swimming && outfit !== '4';
  const wanted = (): AvatarVariant => sex;

  const mount = (key: AvatarVariant): Mounted => {
    const template = templates.get(key)!;
    const model = clone(template.scene) as THREE.Group;
    model.name = `Higgsfield avatar · ${key}`;
    model.scale.setScalar(MODEL_SCALE);
    model.position.y = MODEL_Y;
    body.add(model);
    // A body mounted after the avatar was placed — a change of body, or one
    // that arrived late — joins the layers the avatar was given, or the
    // screens' foreground pass never redraws it and the film covers it.
    model.traverse(o => { o.layers.mask = body.layers.mask; });
    root.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Bone>();
    const meshes: THREE.SkinnedMesh[] = [];
    model.traverse(o => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
      if (o instanceof THREE.SkinnedMesh) meshes.push(o);
    });
    const bodyMesh = meshes.find(m => m.userData.componentId === 'body')!;
    const shoes = meshes.find(m => m.userData.componentId === 'garment-shoes');
    const quat = body.getWorldQuaternion(new THREE.Quaternion()).invert();
    const inBody = (bone: THREE.Object3D) => quat.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    const at = (bone: THREE.Object3D) => body.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));

    // Turn each limb from its generated A-pose onto the rig's rest, joint by
    // joint, so a control at rest leaves its limb where the rig means it.
    const extra = new Map<string, THREE.Quaternion>();
    const close = (hip: string, foot: string) => {
      const out = Math.abs(at(bones.get(foot)!).x) - Math.abs(at(bones.get(hip)!).x);
      return THREE.MathUtils.clamp(1 - STANCE * MODEL_SCALE / Math.max(out, 1e-4), 0, 1);
    };
    for (const [chain, amount] of [
      [['RightArm', 'RightForeArm', 'RightHand'], 1], [['LeftArm', 'LeftForeArm', 'LeftHand'], 1],
      [['RightUpLeg', 'RightLeg', 'RightFoot'], close('RightUpLeg', 'RightFoot')],
      [['LeftUpLeg', 'LeftLeg', 'LeftFoot'], close('LeftUpLeg', 'LeftFoot')],
    ] as Array<[string[], number]>) {
      let turned = new THREE.Quaternion();
      chain.forEach((name, i) => {
        const next = chain[i + 1];
        if (next) {
          const from = at(bones.get(next)!).sub(at(bones.get(name)!)).applyQuaternion(turned).normalize();
          const to = from.clone().lerp(controlDirection.get(name)!, amount).normalize();
          turned = new THREE.Quaternion().setFromUnitVectors(from, to).multiply(turned);
        }
        extra.set(name, turned.clone());
      });
    }
    // At the bind pose still: every moved bone's rest, and the hips' height
    // over the ankles, which the moves' travel is measured against.
    const moveRest = new Map<string, THREE.Quaternion>();
    const moveHome = new Map<string, THREE.Quaternion>();
    for (const name of new Set([...Object.keys(MOVES.punch.bones), ...Object.keys(MOVES.dance.bones)])) {
      const bone = bones.get(name);
      if (bone) { moveRest.set(name, inBody(bone)); moveHome.set(name, bone.quaternion.clone()); }
    }
    const moveLeg = at(bones.get('Hips')!).y - Math.min(at(bones.get('LeftFoot')!).y, at(bones.get('RightFoot')!).y);
    const alignTo = (clip: MoveClip) => {
      const align = new Map<string, THREE.Quaternion>();
      for (const [name, child] of Object.entries(MOVE_CHILD)) {
        const bone = bones.get(name), next = bones.get(child), from = clip.rest[name], to = clip.rest[child];
        if (!bone || !next || !from || !to) continue;
        const mine = at(next).sub(at(bone)).normalize();
        const theirs = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
        align.set(name, new THREE.Quaternion().setFromUnitVectors(mine, theirs));
      }
      for (const [name, parent] of Object.entries(MOVE_INHERIT)) {
        const turn = align.get(parent);
        if (turn) align.set(name, turn.clone());
      }
      return align;
    };
    const moveAlign = { punch: alignTo(MOVES.punch), dance: alignTo(MOVES.dance) };
    const links: Link[] = map.map(([name, control]) => {
      const bone = bones.get(name)!;
      // Shoe soles are authored level. Closing the A-pose legs must not
      // rotate their sole planes with the thigh correction.
      const rest = (name.endsWith('Foot') ? new THREE.Quaternion() : (extra.get(name) ?? new THREE.Quaternion())).clone().multiply(inBody(bone));
      return { bone, control, offset: controlRest.get(name)!.clone().invert().multiply(rest) };
    });

    // Positions are measured through the skin, at the bind pose. The files
    // are quantised: a raw position is a packed integer whose scale lives in
    // the skin's bind matrices, so it only means anything once skinned.
    const probe = (mesh: THREE.SkinnedMesh) => {
      mesh.skeleton.update();
      const position = mesh.geometry.getAttribute('position');
      const skinIndex = mesh.geometry.getAttribute('skinIndex');
      const skinWeight = mesh.geometry.getAttribute('skinWeight');
      const boneIndex = (name: string) => mesh.skeleton.bones.findIndex(b => b.name === name);
      const weightOn = (vertex: number, indices: number[]) => {
        let w = 0;
        for (let k = 0; k < 4; k++) if (indices.includes(skinIndex.getComponent(vertex, k))) w += skinWeight.getComponent(vertex, k);
        return w;
      };
      const vertexAt = (vertex: number) => body.worldToLocal(mesh.localToWorld(mesh.applyBoneTransform(vertex, new THREE.Vector3().fromBufferAttribute(position, vertex))));
      return { position, boneIndex, weightOn, vertexAt };
    };

    // Hands: where the fingers point, which vertices are the fingertips, and
    // which way the palm faces, all in the hand bone's own frame.
    const skin = probe(bodyMesh);
    const hands = {} as Record<Side, Hand>;
    for (const side of ['Left', 'Right'] as Side[]) {
      const bone = bones.get(side + 'Hand')!;
      // The hand and its finger bones: the fingers are rigged separately.
      const indices = bodyMesh.skeleton.bones.map((b, i) => b.name.startsWith(side + 'Hand') ? i : -1).filter(i => i >= 0);
      const wrist = at(bone);
      const owned: number[] = [];
      for (let v = 0; v < skin.position.count; v++) if (skin.weightOn(v, indices) > .5) owned.push(v);
      const points = owned.map(skin.vertexAt);
      const centre = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(Math.max(1, points.length));
      // With finger bones, the hand is measured off them: the fingers point
      // from the wrist to the knuckles, and the palm faces the way the
      // fingers curl at rest. Guessed as "inward, square to the middle of the
      // hand's vertices", the male's palm came out 48 degrees off once his
      // palm and thumb were rebuilt, and every grip held the cup palm-up.
      const joint = (finger: string, i: number) => bones.get(`${side}Hand${finger}${i}`);
      const curled = ['Index', 'Middle', 'Ring'].filter(f => [1, 2, 4].every(i => joint(f, i)));
      const fingers = curled.length
        ? ['Index', 'Middle', 'Ring', 'Pinky'].filter(f => joint(f, 1))
          .reduce((sum, f) => sum.add(at(joint(f, 1)!)), new THREE.Vector3()).divideScalar(4).sub(wrist).normalize()
        : centre.clone().sub(wrist).normalize();
      const reach = points.map(p => p.clone().sub(wrist).dot(fingers));
      const furthest = Math.max(...reach);
      const tips = owned.filter((_, i) => reach[i] > furthest - .045);
      const palm = new THREE.Vector3();
      for (const f of curled) {
        const base = at(joint(f, 1)!), first = at(joint(f, 2)!).sub(base).normalize(), bend = at(joint(f, 4)!).sub(base);
        palm.add(bend.addScaledVector(first, -bend.dot(first)).normalize());
      }
      if (palm.lengthSq() < 1e-6) palm.set(-Math.sign(wrist.x || 1), 0, 0);
      palm.addScaledVector(fingers, -palm.dot(fingers)).normalize();
      let thumb = new THREE.Vector3().crossVectors(fingers, palm);
      if (thumb.z < 0) thumb.negate();
      const toBone = inBody(bone).invert();
      // Lowering the A-pose arm swings it down but never rolls it, so a
      // generated hand keeps whatever roll it was made with: the male's palms
      // faced 50 degrees forward at rest. Roll the lowered hand until its palm
      // faces the thigh, half of it in the forearm so the wrist's skin does
      // not twist. Every pose starts from this rest.
      const handExtra = extra.get(side + 'Hand'), foreExtra = extra.get(side + 'ForeArm');
      if (handExtra && foreExtra) {
        const restPalm = palm.clone().applyQuaternion(handExtra), restFingers = fingers.clone().applyQuaternion(handExtra);
        const want = new THREE.Vector3(-Math.sign(wrist.x || 1), 0, 0);
        want.addScaledVector(restFingers, -want.dot(restFingers)).normalize();
        const roll = Math.atan2(new THREE.Vector3().crossVectors(restPalm, want).dot(restFingers), restPalm.dot(want));
        const forearm = wrist.clone().sub(at(bones.get(side + 'ForeArm')!)).normalize().applyQuaternion(foreExtra);
        const restRoll = (name: string, axis: THREE.Vector3, angle: number) => {
          const link = links.find(l => l.bone.name === name)!;
          const rest = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(extra.get(name)!).multiply(inBody(link.bone));
          link.offset = controlRest.get(name)!.clone().invert().multiply(rest);
        };
        if (Math.abs(roll) > .02) { restRoll(side + 'Hand', restFingers, roll); restRoll(side + 'ForeArm', forearm, roll / 2); }
      }
      hands[side] = { bone, tips, fingers: fingers.applyQuaternion(toBone), palm: palm.applyQuaternion(toBone), thumb: thumb.applyQuaternion(toBone) };
    }

    // Fingers: each bone's curl axis carries its child toward the palm; the
    // knuckle's spread axis is the palm's normal, signed toward the thumb.
    const fingerRigs: Partial<Record<Side, FingerRig>> = {};
    for (const side of ['Left', 'Right'] as Side[]) {
      const chain = (name: FingerName) => [1, 2, 3, 4].map(i => bones.get(`${side}Hand${name}${i}`));
      if (!FINGER_NAMES.every(name => chain(name).every(Boolean))) continue;
      const hand = hands[side], handWorld = bones.get(side + 'Hand')!.getWorldQuaternion(new THREE.Quaternion());
      const palmWorld = hand.palm.clone().applyQuaternion(handWorld), thumbWorld = hand.thumb.clone().applyQuaternion(handWorld);
      const joints = { wrist: bones.get(side + 'Hand')!.getWorldPosition(new THREE.Vector3()), fingers: {} as Record<FingerName, THREE.Vector3[]> };
      const fingers = {} as Record<FingerName, Finger>;
      for (const name of FINGER_NAMES) {
        const links = chain(name) as THREE.Bone[];
        const points = links.map(b => b.getWorldPosition(new THREE.Vector3()));
        joints.fingers[name] = points;
        const toward = name === 'Thumb' ? palmWorld.clone().sub(thumbWorld).normalize() : palmWorld;
        const curl = [0, 1, 2].map(i => {
          const along = points[i + 1].clone().sub(points[i]).normalize();
          const axis = new THREE.Vector3().crossVectors(along, toward).normalize();
          return axis.applyQuaternion(links[i].getWorldQuaternion(new THREE.Quaternion()).invert());
        });
        const along = points[1].clone().sub(points[0]).normalize();
        const spreadWorld = name === 'Thumb' ? new THREE.Vector3().crossVectors(along, thumbWorld).normalize() : palmWorld.clone();
        // Signed so a positive spread swings the finger toward the thumb.
        if (name !== 'Thumb' && new THREE.Vector3().crossVectors(spreadWorld, along).dot(thumbWorld) < 0) spreadWorld.negate();
        fingers[name] = {
          bones: links.slice(0, 3), rest: links.slice(0, 3).map(b => b.quaternion.clone()), curl,
          spread: spreadWorld.applyQuaternion(links[0].getWorldQuaternion(new THREE.Quaternion()).invert()),
        };
      }
      // Measured as the hand it anatomically is: the model's Left bones are
      // the character's left hand (the rig's naming is mirrored, not the model's).
      fingerRigs[side] = { fingers, rest: handPoseFromJoints(joints, side === 'Right') };
    }

    // The generated male barefoot skin has a different sole pitch from its
    // shoes. Calibrate its heel/ball plane after closing the A-pose legs:
    // measuring at bind rest misses the vertices shared with the shin.
    // This only changes the barefoot ankle mapping, never mesh/garment data.
    const bareContacts = new Map<Side, { heel: number[]; ball: number[] }>();
    const savedBones = key === 'male' ? [...bones.values()].map(b => ({ bone: b, rest: b.quaternion.clone() })) : [];
    const poseBareRest = () => {
      for (const link of links) {
        const world = link.control.getWorldQuaternion(new THREE.Quaternion()).multiply(link.bareOffset ?? link.offset);
        link.bone.quaternion.copy(link.bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(world);
        link.bone.updateMatrixWorld(true);
      }
      root.updateMatrixWorld(true);
      bodyMesh.skeleton.update();
    };
    if (key === 'male') {
      const m = probe(bodyMesh), dressedOnly = bodyMesh.geometry.getAttribute('_dressed');
      for (const side of ['Left', 'Right'] as Side[]) {
        const ids = [m.boneIndex(side + 'Foot'), m.boneIndex(side + 'ToeBase')];
        const points: Array<{ v: number; p: THREE.Vector3 }> = [];
        for (let v = 0; v < m.position.count; v++)
          if (m.weightOn(v, ids) > .5 && (dressedOnly?.getX(v) ?? 0) < .5) points.push({ v, p: m.vertexAt(v) });
        const z0 = Math.min(...points.map(({ p }) => p.z)), length = Math.max(...points.map(({ p }) => p.z)) - z0;
        bareContacts.set(side, {
          heel: points.filter(({ p }) => p.z < z0 + length * .2).map(({ v }) => v),
          ball: points.filter(({ p }) => p.z > z0 + length * .2 && p.z < z0 + length * .8).map(({ v }) => v),
        });
      }
    }

    // The soles: the lowest point and outlines of the shown foot surface.
    const solesOf = (mesh: THREE.SkinnedMesh): Sole[] => {
      const m = probe(mesh);
      const out: Sole[] = [];
      for (const side of ['Left', 'Right'] as Side[]) {
        const ids = [m.boneIndex(side + 'Foot'), m.boneIndex(side + 'ToeBase')].filter(i => i >= 0);
        const feet: number[] = [];
        const dressedOnly = key === 'male' && mesh === bodyMesh ? mesh.geometry.getAttribute('_dressed') : undefined;
        for (let v = 0; v < m.position.count; v++) {
          if (m.weightOn(v, ids) > .5 && (dressedOnly?.getX(v) ?? 0) < .5) feet.push(v);
        }
        const at = feet.map(v => m.vertexAt(v));
        const lowest = Math.min(...at.map(p => p.y));
        const sole = feet.map((v, i) => ({ v, p: at[i] })).filter(({ p }) => p.y < lowest + .018 * MODEL_SCALE);
        // The toe springs up, so the whole outline alone stood a shoe 9 mm up.
        const picked = new Set<number>();
        const contact = mesh === bodyMesh ? bareContacts.get(side) : undefined;
        if (contact) for (const vertices of [contact.heel, contact.ball])
          picked.add(vertices.reduce((a, b) => m.vertexAt(b).y < m.vertexAt(a).y ? b : a));
        const flat = sole.filter(({ p }) => p.y < lowest + .006 * MODEL_SCALE);
        const outline = (set: typeof sole) => {
          for (let k = 0; k < 8; k++) {
            const dx = Math.cos(k * Math.PI / 4), dz = Math.sin(k * Math.PI / 4);
            let best = set[0];
            for (const c of set) if (c.p.x * dx + c.p.z * dz > best.p.x * dx + best.p.z * dz) best = c;
            if (best) picked.add(best.v);
          }
        };
        const bottom = sole.reduce((a, b) => (b.p.y < a.p.y ? b : a), sole[0]);
        if (bottom) picked.add(bottom.v);
        outline(flat);
        outline(sole);
        for (const v of picked) out.push({ mesh, vertex: v, side });
      }
      return out;
    };
    const soles = { bare: solesOf(bodyMesh), shod: shoes ? solesOf(shoes) : solesOf(bodyMesh) };
    let barefootCalibrated = false;
    const calibrateBareFeet = () => {
      if (key !== 'male' || barefootCalibrated) return;
      barefootCalibrated = true;
      // The world stands with a small leg spread and soft knees. Preserve
      // every current control while measuring that pose once for this skin.
      const controls = [...new Set(map.map(([, control]) => control))].map(control => ({ control, rest: control.quaternion.clone() }));
      walkCoastalPose(rig, 0, 0);
      levelCoastalFeet(rig);
      root.updateMatrixWorld(true);
      const m = probe(bodyMesh);
      poseBareRest();
      for (let iteration = 0; iteration < 12; iteration++) {
        let settled = true;
        for (const [side, contact] of bareContacts) {
          const bottom = (vertices: number[]) => vertices.map(v => m.vertexAt(v)).reduce((a, b) => b.y < a.y ? b : a);
          const heel = bottom(contact.heel), ball = bottom(contact.ball);
          if (Math.abs(heel.y - ball.y) < .0001) continue;
          settled = false;
          const forward = ball.clone().sub(heel);
          const pitch = -Math.atan2(heel.y - ball.y, Math.hypot(forward.x, forward.z));
          const axis = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
          const link = links.find(l => l.bone.name === side + 'Foot')!;
          const rest = controlRest.get(link.bone.name)!;
          link.bareOffset = rest.clone().invert()
            .multiply(new THREE.Quaternion().setFromAxisAngle(axis, pitch))
            .multiply(rest).multiply(link.bareOffset ?? link.offset);
        }
        if (settled) break;
        poseBareRest();
      }
      soles.bare = solesOf(bodyMesh);
      for (const { control, rest } of controls) control.quaternion.copy(rest);
      for (const { bone, rest } of savedBones) bone.quaternion.copy(rest);
      root.updateMatrixWorld(true);
    };

    const reference = META[key].reference;
    const shared: Record<string, THREE.IUniform> = {
      avatarHideHead: { value: headHidden ? 1 : 0 },
      avatarDye: { value: template.dye ?? null },
      avatarSkin: { value: new THREE.Color() },
      avatarHair: { value: new THREE.Color() },
    };
    const uniforms = new Map<THREE.SkinnedMesh, Record<string, THREE.IUniform>>();
    const slots = new Map<THREE.SkinnedMesh, DyeSlot>();
    for (const mesh of meshes) {
      const component = String(mesh.userData.componentId ?? '');
      mesh.castShadow = !component.startsWith('print-') && component !== 'cap-logo';
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = material;
      material.roughness = 1;
      material.metalness = 0;
      material.userData.wornNoMasonry = true;
      material.userData.wornNoGrain = true;
      // Shown in the colours it was generated in: not through the world's
      // filmic curve and its exposure for the hour, which shifted them.
      material.toneMapped = false;
      material.onBeforeCompile = shader => evenLight(shader);
      material.customProgramCacheKey = () => 'higgsfield-avatar-even-v2';
      if (component.startsWith('print-') || component === 'cap-logo') {
        // Blended, not cut out. A cut-out drops every texel under half
        // opacity, and from a distance the averaged thin strokes of a print
        // all fall under it: the back graphic's table simply vanished. Drawn
        // just in front of the cloth they were copied from, writing no depth.
        material.transparent = true;
        material.depthWrite = false;
        material.alphaTest = .02;
        material.polygonOffset = true;
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
        if (material.map) {
          const printMap = material.map;
          printMap.wrapS = printMap.wrapT = THREE.ClampToEdgeWrapping;
          printMap.minFilter = THREE.LinearMipmapLinearFilter;
          printMap.magFilter = THREE.LinearFilter;
          printMap.anisotropy = 8;
          printMap.needsUpdate = true;
        }
        // Lettering stays legible from further off: sample a sharper mip
        // than the GPU would choose. Thin white strokes on black otherwise
        // average into grey long before the garment is small.
        // The print is projected past the artwork's edges onto whole faces of
        // cloth. Outside the artwork nothing is drawn: clamped to its edge, a
        // small mip level carried the heading's colour up the shirt in streaks.
        material.onBeforeCompile = shader => {
          evenLight(shader);
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
              if (vMapUv.x < 0. || vMapUv.x > 1. || vMapUv.y < 0. || vMapUv.y > 1.) discard;
              diffuseColor *= texture2D( map, vMapUv, -0.8 );
            #endif`);
        };
        material.customProgramCacheKey = () => 'higgsfield-avatar-print-v4';
      }
      if (!DYED.has(component)) continue;
      // Looking into a sleeve or a trouser leg shows its inside, not the sky.
      if (component.startsWith('garment-')) material.side = THREE.DoubleSide;
      // The garment dye of this mesh: the swimsuit on the body, the trousers
      // on the trousers; the tee and the shoes keep their own colours.
      const slot: DyeSlot = component === 'body' ? 'swimwear' : 'bottoms';
      const index = (name: string) => mesh.skeleton.bones.findIndex(b => b.name === name);
      // In a headset the head and neck are taken off, as the owner asked:
      // looking down, the visitor sees their shoulders.
      const own: Record<string, THREE.IUniform> = {
        ...shared,
        avatarHeadBones: { value: new THREE.Vector4(...['Head', 'head_end', 'headfront', 'neck'].map(index)) },
        avatarCover: { value: 0 },
        avatarSwim: { value: 0 },
        avatarDyeOn: { value: new THREE.Vector3() },
        avatarReference: { value: new THREE.Vector3(reference.skin ?? .5, reference.hair ?? .05, reference[slot] ?? .05) },
        avatarGarment: { value: new THREE.Color() },
      };
      uniforms.set(mesh, own);
      slots.set(mesh, slot);
      const covered = mesh.geometry.getAttribute('_covered') !== undefined;
      // Hers only: the dressed generation's arms and hands, which give way
      // to the swimsuit body's own while she swims.
      const dressedOnly = mesh.geometry.getAttribute('_dressed') !== undefined;
      material.onBeforeCompile = shader => {
        evenLight(shader);
        Object.assign(shader.uniforms, own);
        // In a headset the visitor's own head is taken off, or they look out
        // through the inside of their hair. The head is part of the one body
        // mesh, so it goes by its skin weights: whatever mostly follows the
        // head bones is not drawn while avatarHideHead is on. Dressed, the
        // skin under the garments is not drawn either.
        shader.vertexShader = `uniform vec4 avatarHeadBones;
          uniform float avatarHideHead;
          varying float vAvatarHead;
          varying float vAvatarCovered;
          varying float vAvatarDressed;
          ${covered ? 'attribute float _covered;' : ''}
          ${dressedOnly ? 'attribute float _dressed;' : ''}
          ` + shader.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
          vAvatarHead = 0.;
          vAvatarCovered = ${covered ? '_covered' : '0.'};
          vAvatarDressed = ${dressedOnly ? '_dressed' : '0.'};
          #ifdef USE_SKINNING
            float onHead = dot(skinWeight, vec4(equal(skinIndex, vec4(avatarHeadBones.x))) + vec4(equal(skinIndex, vec4(avatarHeadBones.y)))
              + vec4(equal(skinIndex, vec4(avatarHeadBones.z))));
            float onNeck = dot(skinWeight, vec4(equal(skinIndex, vec4(avatarHeadBones.w))));
            // Gone when it follows the head at all, or the head and neck
            // between them carry most of it; the tops of the shoulders stay.
            vAvatarHead = avatarHideHead * max(onHead / .25, (onHead + onNeck) / .6);
          #endif`);
        shader.fragmentShader = `uniform sampler2D avatarDye;
          uniform vec3 avatarDyeOn, avatarReference, avatarSkin, avatarHair, avatarGarment;
          uniform float avatarCover, avatarSwim;
          varying float vAvatarHead;
          varying float vAvatarCovered;
          varying float vAvatarDressed;
          ` + shader.fragmentShader;
        // Each dye keeps the texel's own light and shade, measured against
        // the median of its class, so a recoloured body keeps its folds.
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `if (vAvatarHead > 1.) discard;
          if (avatarCover > .5 && vAvatarCovered > .5) discard;
          if (avatarSwim > .5 && vAvatarDressed > .5) discard;
          #include <map_fragment>
          #ifdef USE_MAP
            vec3 dyeWeight = texture2D(avatarDye, vMapUv).rgb * avatarDyeOn;
            float dyeTotal = dyeWeight.r + dyeWeight.g + dyeWeight.b;
            if (dyeTotal > .002) {
              float dyeLight = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
              // A texel's shade against its class's median, softened for the
              // dark classes: dyeing near-black cloth or hair light multiplied
              // its fine noise into blotches, which made the dyed swimsuits
              // look rough. Skin, already light, keeps its shading.
              vec3 shade = pow(clamp(vec3(dyeLight) / max(avatarReference, vec3(.002)), .25, 4.), vec3(.85, .55, .45));
              shade = clamp(shade, .55, 1.45);
              vec3 dyed = (avatarSkin * shade.x * dyeWeight.r + avatarHair * shade.y * dyeWeight.g + avatarGarment * shade.z * dyeWeight.b) / dyeTotal;
              diffuseColor.rgb = mix(diffuseColor.rgb, dyed, clamp(dyeTotal, 0., 1.));
            }
          #endif`);
      };
      material.customProgramCacheKey = () => `higgsfield-avatar-dye-v8-${covered}-${dressedOnly}`;
    }
    const meta = META[key];
    return {
      key, model, meshes, body: bodyMesh, links, hands, fingerRigs, soles, calibrateBareFeet, uniforms, slots, moveRest, moveAlign, moveHome, moveLeg,
      mouth: new THREE.Vector3().fromArray(meta.mouth),
      atlas: (bodyMesh.material as THREE.MeshStandardMaterial).map,
    };
  };

  const unmount = (mounted?: Mounted) => {
    if (!mounted) return;
    mounted.model.removeFromParent();
    for (const mesh of mounted.meshes) (mesh.material as THREE.Material).dispose();
  };

  // A body that has not arrived yet is stood in for by one that has, and
  // swapped for the real one the moment it lands.
  const resolve = (want: AvatarVariant): AvatarVariant => templates.has(want) ? want : 'male';
  let mounted = mount(resolve(wanted()));
  // Off-screen: the skin is not drawn and not re-posed. Decided per frame by
  // the world from where the body is drawn (see FestivalWorld.cullAvatars).
  let culled = false;
  importedAvatarRoots.add(root);
  root.userData.setImportedCulled = (next: boolean) => {
    culled = next;
    mounted.model.visible = !next;
  };
  root.userData.importedCulled = () => culled;
  const clothed = () => dressed();
  const morph = (mesh: THREE.SkinnedMesh, name: string, value: number) => {
    const index = mesh.morphTargetDictionary?.[name];
    if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
  };

  const refresh = () => {
    const on = clothed();
    for (const mesh of mounted.meshes) {
      const id = String(mesh.userData.componentId ?? '');
      mesh.visible = id === 'body'
        || (id.startsWith('garment-') && on)
        || ((id === 'cap' || id === 'cap-logo') && wearingCap && !headHidden)
        // Under the vest the front lettering is painted into the V instead.
        || (id === 'print-schedule-front' && outfit === '1' && on)
        || ((id === 'print-schedule-back' || id === 'print-schedule-tag') && outfit === '1' && on)
        || ((id === 'print-house-front' || id === 'print-bros-back') && outfit === '2' && on)
        || ((id === 'vest' || id.startsWith('print-vest')) && outfit === '3' && on);
      // The cap's old default, near-black, now the reference's grey.
      if (id === 'cap') (mesh.material as THREE.MeshStandardMaterial).color.set(!current.cap || current.cap.toLowerCase() === LEGACY_CAP ? DEFAULT_ACCESSORY_COLOURS.cap : current.cap);
    }
    morph(mounted.body, 'CapHair', wearingCap ? 1 : 0);
    const template = templates.get(mounted.key);
    // Outfit 3 is the vest painted over the same tee, in the shared texture.
    const vest = template?.vest;
    const atlas = outfit === '3' && vest ? vest : mounted.atlas ?? null;
    const native = META[mounted.key].native;
    // A slot the model has no class for (her swim model's hair) never dyes.
    const dyed = (slot: DyeSlot) => current[slot] && native[slot] && hexDistance(current[slot] as string, native[slot]) > .03
      && hexDistance(current[slot] as string, AVATAR_NATIVE[sex][slot]) > .03
      && !(LEGACY_NATIVE[mounted.key]?.[slot] ?? []).some(old => hexDistance(current[slot] as string, old) <= .03) ? 1 : 0;
    for (const [mesh, own] of mounted.uniforms) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.map !== atlas) { material.map = atlas; material.needsUpdate = true; }
      const slot = mounted.slots.get(mesh)!;
      own.avatarCover.value = mesh === mounted.body && on ? 1 : 0;
      own.avatarSwim.value = mesh === mounted.body && !on ? 1 : 0;
      (own.avatarDyeOn.value as THREE.Vector3).set(dyed('skin'), dyed('hair'), dyed(slot));
      (own.avatarGarment.value as THREE.Color).set(current[slot] ?? '#808080');
    }
    const shared = mounted.uniforms.get(mounted.body)!;
    shared.avatarDye.value = template?.dye ?? null;
    (shared.avatarSkin.value as THREE.Color).set(current.skin ?? '#808080');
    (shared.avatarHair.value as THREE.Color).set(current.hair ?? '#808080');
    shared.avatarHideHead.value = headHidden ? 1 : 0;
    root.userData.sculptRuntime.parts = mounted.meshes.reduce((parts: Record<string, THREE.Mesh[]>, m) => {
      (parts[String(m.userData.componentId)] ??= []).push(m); return parts;
    }, {});
    root.userData.importedAvatar = {
      source: 'higgsfield', sex, variant: on ? mounted.key : `${mounted.key}-swim`, armSpread: ARM_SPREAD, headHidden,
      meshes: [...mounted.meshes],
      triangles: mounted.meshes.filter(m => m.visible).reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3, 0),
    };
    root.userData.avatarSex = sex;
  };

  // Per rig side, the pose the hand is held in: tracked, a fist, or none
  // (the relaxed rest the body was modelled in).
  const handPoses: Record<Side, HandPose | null> = { Left: null, Right: null };
  const fists: Record<Side, boolean> = { Left: false, Right: false };
  // A hand round a cup or a carton: part of the way to a fist. The carry pose
  // sets it; animateRig lets go of both every frame before posing, as it
  // opens the fists, so a hand that has put its cup down opens again.
  const grips: Record<Side, number> = { Left: 0, Right: 0 };
  const turn = new THREE.Quaternion(), spreadTurn = new THREE.Quaternion();
  const poseFingers = () => {
    for (const side of ['Left', 'Right'] as Side[]) {
      const rig = mounted.fingerRigs[side];
      if (!rig) continue;
      const grip = grips[side];
      const pose = handPoses[side] ?? (fists[side] ? FIST : grip > 0 ? mixHandPose(rig.rest, FIST, grip) : null);
      for (const name of FINGER_NAMES) {
        const finger = rig.fingers[name], want = pose?.[name], rest = rig.rest[name];
        finger.bones.forEach((bone, i) => {
          bone.quaternion.copy(finger.rest[i]);
          if (!want) return;
          bone.quaternion.multiply(turn.setFromAxisAngle(finger.curl[i], want.curl[i] - rest.curl[i]));
          if (i === 0) bone.quaternion.multiply(spreadTurn.setFromAxisAngle(finger.spread, want.spread - rest.spread));
        });
      }
    }
  };
  const world = new THREE.Quaternion(), parentWorld = new THREE.Quaternion();
  const scratchPosition = new THREE.Vector3(), scratchScale = new THREE.Vector3();
  // Each mounted model's nodes, parents first, each with the link (if any)
  // that turns it. One pass down this list rebuilds every world matrix once.
  const orders = new WeakMap<Mounted, Array<{ node: THREE.Object3D; link?: Link; outside: boolean }>>();
  const inBodyTree = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === body) return true; return false; };
  const orderOf = (m: Mounted) => {
    let order = orders.get(m);
    if (!order) {
      const byBone = new Map<THREE.Object3D, Link>(m.links.map(l => [l.bone, l]));
      const list: Array<{ node: THREE.Object3D; link?: Link; outside: boolean }> = [];
      m.model.traverse(node => {
        if (node === m.model) return;
        const link = byBone.get(node);
        list.push({ node, link, outside: link ? !inBodyTree(link.control) : false });
      });
      orders.set(m, order = list);
    }
    return order;
  };
  /**
   * Turn every mapped bone to its control, measured from rest, and rebuild
   * the model's world matrices.
   *
   * One pass, parents first. It runs four or five times a frame for every
   * body in view (the feet, the hands and the arms each re-read the pose), and
   * the version before refreshed the whole body, then each bone's whole
   * subtree, then the whole model again: the largest cost in the frame on a
   * phone (2026-10-01).
   */
  // The move being played, renewed every frame by the pose that wants it:
  // left unrenewed for a tenth of a second it lapses, so a dancer who sits
  // down or is picked up is never left stuck in the routine.
  let move: { name: ImportedMove; seconds: number; at: number } | null = null;
  const moveTurn = new THREE.Quaternion(), bodyWorld = new THREE.Quaternion();
  const sample = (clip: MoveClip, values: number[], frame: number, size: number, out: number[]) => {
    const f0 = Math.floor(frame) % clip.frames, f1 = (f0 + 1) % clip.frames, t = frame - Math.floor(frame);
    for (let k = 0; k < size; k++) out[k] = values[f0 * size + k] * (1 - t) + values[f1 * size + k] * t;
    return out;
  };
  const scratch4 = [0, 0, 0, 0], scratch3 = [0, 0, 0];
  root.userData.setImportedMove = (name: ImportedMove | null, seconds = 0) => {
    move = name ? { name, seconds, at: performance.now() } : null;
  };
  const activeMove = () => move && performance.now() - move.at < 100 ? move : null;
  root.userData.importedMoveActive = () => activeMove()?.name ?? null;

  root.userData.syncImportedAvatar = () => {
    // Not drawn this frame, so nothing to rebuild. The next frame it is seen,
    // it is synced before it is drawn.
    // A distant body seen this frame is rebuilt every other frame.
    if (culled || root.userData.cullThrottle) return;
    // The procedural rig the bones follow; the model is rebuilt below.
    body.updateWorldMatrix(true, false);
    for (const child of body.children) if (child !== mounted.model) child.updateWorldMatrix(false, true);
    poseFingers();
    const model = mounted.model;
    const playing = activeMove();
    const clip = playing ? MOVES[playing.name] : undefined;
    // Frame in the clip: the punch runs once and holds its end; the dance loops.
    const frame = playing && clip ? (playing.name === 'dance'
      ? ((playing.seconds * MOVES.fps) % clip.frames + clip.frames) % clip.frames
      : Math.min(Math.max(playing.seconds * MOVES.fps, 0), clip.frames - 1.001)) : 0;
    model.position.set(0, MODEL_Y, 0);
    if (clip) {
      // The hips' travel and drop, as authored, scaled to this body's legs.
      const [x, y, z] = sample(clip, clip.hips, frame, 3, scratch3);
      model.position.set(x * mounted.moveLeg, MODEL_Y + y * mounted.moveLeg, z * mounted.moveLeg);
      body.matrixWorld.decompose(scratchPosition, bodyWorld, scratchScale);
    }
    if (model.matrixAutoUpdate) model.updateMatrix();
    model.matrixWorld.multiplyMatrices(body.matrixWorld, model.matrix);
    for (const { node, link, outside } of orderOf(mounted)) {
      const parent = node.parent!;
      const turns = clip?.bones[node.name];
      const rest = turns ? mounted.moveRest.get(node.name) : undefined;
      if (playing && clip && turns && rest) {
        // The move's turn away from the file's rest, on this body's own rest
        // turned onto the file's.
        const [qx, qy, qz, qw] = sample(clip, turns, frame, 4, scratch4);
        moveTurn.set(qx, qy, qz, qw).normalize();
        world.copy(bodyWorld).multiply(moveTurn);
        const align = mounted.moveAlign[playing.name].get(node.name);
        if (align) world.multiply(align);
        world.multiply(rest);
        parent.matrixWorld.decompose(scratchPosition, parentWorld, scratchScale);
        node.quaternion.copy(parentWorld.invert()).multiply(world);
      } else if (link) {
        if (outside) link.control.getWorldQuaternion(world);
        else link.control.matrixWorld.decompose(scratchPosition, world, scratchScale);
        world.multiply(!clothed() && link.bareOffset ? link.bareOffset : link.offset);
        parent.matrixWorld.decompose(scratchPosition, parentWorld, scratchScale);
        node.quaternion.copy(parentWorld.invert()).multiply(world);
      } else {
        // A bone only a move turns goes back to rest when the move ends: left
        // as the last frame had it, the spine, neck and shoulders stayed bent
        // after a dance and the body looked squashed (the owner, October 2).
        const home = mounted.moveHome.get(node.name);
        if (home) node.quaternion.copy(home);
      }
      if (node.matrixAutoUpdate) node.updateMatrix();
      node.matrixWorld.multiplyMatrices(parent.matrixWorld, node.matrix);
      // SkinnedMesh refreshes its inverse bind transform in updateMatrixWorld;
      // CPU shoe probes and rendering must use the same one.
      const skinned = node as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh && skinned.bindMode === THREE.AttachedBindMode) skinned.bindMatrixInverse.copy(skinned.matrixWorld).invert();
    }
  };

  root.userData.setImportedSwimwear = (on: boolean) => { swimming = on; settle(); root.userData.syncImportedAvatar(); };
  /** Take the head off (in a headset) or put it back. A body mounted later follows. */
  root.userData.setImportedHeadHidden = (hidden: boolean) => { headHidden = hidden; refresh(); };
  root.userData.setImportedFists = (closed: boolean) => { fists.Left = fists.Right = closed; };
  /** Close one hand part way round something held (0 opens it). */
  root.userData.setImportedGrip = (right: boolean, amount: number) => { grips[right ? 'Left' : 'Right'] = amount; };
  /**
   * Hold one hand in a pose (a tracked hand), or let it go back to rest or a
   * fist with null. `right` is the rig's right hand, as everywhere here.
   */
  root.userData.setImportedHandPose = (right: boolean, pose: HandPose | null) => { handPoses[right ? 'Left' : 'Right'] = pose; };
  /** The rest pose's angles, for tests and for tracking to measure against. */
  root.userData.importedHandRest = (right: boolean): HandPose | undefined => mounted.fingerRigs[right ? 'Left' : 'Right']?.rest;

  const soleProbe = new THREE.Vector3();
  const activeSoles = () => clothed() ? mounted.soles.shod : mounted.soles.bare;
  const soleHeight = (side: Side | undefined, floor: ((x: number, z: number, y: number) => number) | undefined, localFloor: number) => {
    let rise = -Infinity;
    for (const sole of activeSoles()) {
      if (side && sole.side !== side) continue;
      soleProbe.fromBufferAttribute(sole.mesh.geometry.getAttribute('position'), sole.vertex);
      sole.mesh.applyBoneTransform(sole.vertex, soleProbe);
      sole.mesh.localToWorld(soleProbe);
      if (floor) rise = Math.max(rise, floor(soleProbe.x, soleProbe.z, soleProbe.y) - soleProbe.y);
      else { root.worldToLocal(soleProbe); rise = Math.max(rise, localFloor - soleProbe.y); }
    }
    return rise;
  };
  const updateSkeletons = () => { for (const mesh of new Set(activeSoles().map(s => s.mesh))) mesh.skeleton.update(); };
  /** Where the soles actually are, in world space, for tests and probes. */
  root.userData.importedSolePoints = () => {
    root.userData.syncImportedAvatar();
    updateSkeletons();
    return activeSoles().map(({ mesh, vertex }) => mesh.localToWorld(mesh.applyBoneTransform(vertex, new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), vertex))));
  };
  const groundedLegRest = new WeakMap<THREE.Bone, THREE.Vector3>();
  // Points spread over every shown mesh, for keeping a dancer out of the
  // floor: the routine was authored on longer legs, and in the floor work and
  // the drops feet, knees and hands went through the ground (the owner,
  // October 2). Never pulled down: only ever lifted out.
  const floorProbes = new WeakMap<Mounted, Array<{ mesh: THREE.SkinnedMesh; vertex: number }>>();
  const probesOf = (m: Mounted) => {
    let list = floorProbes.get(m);
    if (!list) {
      list = [];
      const total = m.meshes.reduce((n, mesh) => n + mesh.geometry.getAttribute('position').count, 0);
      const stride = Math.max(1, Math.floor(total / 600));
      for (const mesh of m.meshes) {
        const id = String(mesh.userData.componentId ?? '');
        if (id !== 'body' && !id.startsWith('garment-')) continue;
        const count = mesh.geometry.getAttribute('position').count;
        for (let i = 0; i < count; i += stride) list.push({ mesh, vertex: i });
      }
      floorProbes.set(m, list);
    }
    return list;
  };
  const floorProbe = new THREE.Vector3();
  const keepAboveFloor = (floor: ((x: number, z: number, y: number) => number) | undefined, localFloor: number) => {
    const probes = probesOf(mounted);
    for (const mesh of new Set(probes.map(p => p.mesh))) mesh.skeleton.update();
    let rise = -Infinity;
    // The floor asked for at the dancer's own height: asked at a point that
    // had already gone under, it answered with whatever lies below that.
    const standing = root.getWorldPosition(new THREE.Vector3()).y + .5;
    for (const { mesh, vertex } of probes) {
      if (!mesh.visible) continue;
      floorProbe.fromBufferAttribute(mesh.geometry.getAttribute('position'), vertex);
      mesh.applyBoneTransform(vertex, floorProbe);
      mesh.localToWorld(floorProbe);
      if (floor) rise = Math.max(rise, floor(floorProbe.x, floorProbe.z, standing) - floorProbe.y);
      else { root.worldToLocal(floorProbe); rise = Math.max(rise, localFloor - floorProbe.y); }
    }
    if (rise > 0 && rise < 1.5) {
      body.position.y += rise;
      root.userData.syncImportedAvatar();
    }
  };
  root.userData.supportImportedPose = (floor: ((x: number, z: number, y: number) => number) | undefined, localFloor: number) => {
    if (root.userData.wearingSwimwear) return;
    // The dance carries its own height: the floor work and the kicks would
    // otherwise be pushed back up onto the feet.
    if (activeMove()?.name === 'dance') { root.userData.syncImportedAvatar(); keepAboveFloor(floor, localFloor); return; }
    // Clear the last standing correction before evaluating a new pose.
    const legs = (['Left', 'Right'] as Side[]).map(side => {
      const bone = mounted.model.getObjectByName(side + 'UpLeg') as THREE.Bone;
      if (!groundedLegRest.has(bone)) groundedLegRest.set(bone, bone.position.clone());
      bone.position.copy(groundedLegRest.get(bone)!);
      return { side, bone };
    });
    root.userData.syncImportedAvatar();
    updateSkeletons();
    const rises = legs.map(({ side }) => soleHeight(side, floor, localFloor));
    const rise = Math.max(...rises);
    if (Number.isFinite(rise) && Math.abs(rise) < .5) {
      body.position.y += rise;
      // At rest both feet are planted. A shared body lift alone leaves the
      // shorter generated leg floating. Correct each native chain by its
      // measured sole error; keep the deliberate swing-foot lift while walking.
      // The solver can express a straight hip as 2π - epsilon. For the
      // barefoot male, recognise that same rest so both generated legs plant.
      const hipAtRest = (angle: number) => Math.abs(mounted.key === 'male' && !clothed()
        ? Math.atan2(Math.sin(angle), Math.cos(angle)) : angle) < .03;
      const standing = hipAtRest(rig.leftLeg.rotation.x) && hipAtRest(rig.rightLeg.rotation.x)
        && (rig.leftKnee?.rotation.x ?? 0) < .03 && (rig.rightKnee?.rotation.x ?? 0) < .03;
      if (standing) {
        body.updateWorldMatrix(true, true);
        legs.forEach(({ bone }, i) => {
          const correction = rises[i] - rise;
          if (Math.abs(correction) > .08) return;
          const at = bone.getWorldPosition(new THREE.Vector3());
          at.y += correction;
          bone.position.copy(bone.parent!.worldToLocal(at));
        });
      }
      root.userData.syncImportedAvatar();
    }
  };
  root.userData.supportImportedSeat = (floor: (x: number, z: number, y: number) => number) => {
    if (root.userData.wearingSwimwear) return;
    for (let iteration = 0; iteration < 3; iteration++) {
      root.userData.syncImportedAvatar();
      updateSkeletons();
      for (const [side, hip, knee] of [['Right', rig.leftLeg, rig.leftKnee], ['Left', rig.rightLeg, rig.rightKnee]] as const) {
        if (!knee) continue;
        const rise = soleHeight(side, floor, 0);
        if (!Number.isFinite(rise)) continue;
        const angle = THREE.MathUtils.clamp(hip.rotation.x - THREE.MathUtils.clamp(rise / .55, -.13, .13), -1.85, -1.2);
        knee.rotation.x -= angle - hip.rotation.x;
        hip.rotation.x = angle;
      }
    }
  };

  // Anything measured against the head is kept in the rig's head frame, so it
  // follows every animated nod without being measured again.
  let crowns: THREE.Vector3[] = [];
  let surfaces: ((x: number, z: number) => number)[] = [];
  const measureHead = () => {
    mounted.calibrateBareFeet();
    root.userData.syncImportedAvatar();
    const headBone = mounted.links.find(l => l.control === rig.head)!.bone;
    const mouthWorld = mounted.model.localToWorld(mounted.mouth.clone());
    root.userData.importedMouth = rig.head.worldToLocal(mouthWorld);
    const tops: THREE.Vector3[][] = [];
    // Measured in the head's own frame, whatever the pose: taken as the
    // highest point straight above the feet, a head measured mid-dance or
    // bowed put the crown in the air above it, and MENTOR rode there, a head
    // above the cap (the owner, October 2).
    crowns = [false, true].map(cap => {
      const probe = new THREE.Vector3();
      const surface: THREE.Vector3[] = [];
      tops.push(surface);
      for (const mesh of mounted.meshes) {
        const id = String(mesh.userData.componentId);
        if (cap ? id !== 'cap' : id !== 'body') continue;
        mesh.skeleton.update();
        const positions = mesh.geometry.getAttribute('position');
        const ids = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
        const head = mesh.skeleton.bones.indexOf(headBone);
        for (let i = 0; i < positions.count; i++) {
          // Only the head can be the crown: a raised hand is not a perch.
          let onHead = 0;
          for (let k = 0; k < 4; k++) if (ids.getComponent(i, k) === head) onHead += weights.getComponent(i, k);
          if (onHead < .5) continue;
          probe.fromBufferAttribute(positions, i);
          mesh.applyBoneTransform(i, probe);
          mesh.localToWorld(probe);
          surface.push(rig.head.worldToLocal(probe.clone()));
        }
      }
      if (!surface.length) return rig.head.worldToLocal(root.localToWorld(new THREE.Vector3(0, rig.headTop, 0)));
      let top = -Infinity, x = 0, z = 0;
      for (const p of surface) top = Math.max(top, p.y);
      const crown = surface.filter(p => p.y > top - .06);
      for (const p of crown) { x += p.x; z += p.z; }
      return new THREE.Vector3(x / crown.length, top, z / crown.length);
    });
    surfaces = tops.map(headSurface);
  };
  root.userData.importedHeadSupport = () => crowns[Number(wearingCap)].clone();
  // The whole top of the hair (or the cap) in the head frame, so something
  // lying on it rests on the dome rather than balancing on its highest point.
  root.userData.importedHeadSurface = () => surfaces[Number(wearingCap)];

  const handOf = (right: boolean) => mounted.hands[right ? 'Left' : 'Right'];
  root.userData.importedWrist = (right: boolean) => {
    root.userData.syncImportedAvatar();
    return body.worldToLocal(handOf(right).bone.getWorldPosition(new THREE.Vector3()));
  };
  root.userData.importedFingertip = (right: boolean) => {
    root.userData.syncImportedAvatar();
    const hand = handOf(right), mesh = mounted.body;
    mesh.skeleton.update();
    const p = mesh.geometry.getAttribute('position'), result = new THREE.Vector3(), probe = new THREE.Vector3();
    for (const v of hand.tips) {
      probe.fromBufferAttribute(p, v);
      mesh.applyBoneTransform(v, probe);
      result.add(body.worldToLocal(mesh.localToWorld(probe)));
    }
    return result.divideScalar(Math.max(1, hand.tips.length));
  };
  root.userData.importedHandFrame = (right: boolean) => {
    root.userData.syncImportedAvatar();
    const hand = handOf(right), side = right ? 'Left' : 'Right';
    const elbow = body.worldToLocal(mounted.links.find(l => l.bone.name === side + 'ForeArm')!.bone.getWorldPosition(new THREE.Vector3()));
    const joint = body.worldToLocal(hand.bone.getWorldPosition(new THREE.Vector3()));
    const toBody = body.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(hand.bone.getWorldQuaternion(new THREE.Quaternion()));
    const direction = (v: THREE.Vector3) => v.clone().applyQuaternion(toBody).normalize();
    return { forearm: joint.clone().sub(elbow).normalize(), joint, palm: direction(hand.palm), thumb: direction(hand.thumb), fingers: direction(hand.fingers) };
  };

  // Where the generated arm starts and how far it reaches, in the body frame.
  root.userData.importedArm = (right: boolean) => {
    root.userData.syncImportedAvatar();
    const side = right ? 'Left' : 'Right';
    const at = (name: string) => body.worldToLocal(mounted.links.find(l => l.bone.name === name)!.bone.getWorldPosition(new THREE.Vector3()));
    const shoulder = at(side + 'Arm'), elbow = at(side + 'ForeArm'), wrist = at(side + 'Hand');
    return { shoulder, reach: shoulder.distanceTo(elbow) + elbow.distanceTo(wrist) };
  };

  /** Mount the wanted body if it has arrived since, then redraw. */
  const settle = () => {
    const want = resolve(wanted());
    const changed = mounted.key !== want;
    if (changed) { unmount(mounted); mounted = mount(want); mounted.model.visible = !culled; }
    refresh();
    if (changed) { measureHead(); root.userData.syncImportedAvatar(); }
  };

  root.userData.setImportedPalette = (p: AvatarPalette) => {
    current = p;
    wearingCap = Boolean(p.cap);
    outfit = topOutfit(p.top);
    sex = avatarSex(p.top);
    settle();
  };

  const onArrival = () => {
    // An avatar taken out of the world stops listening.
    if (!root.parent) { arrivals.delete(onArrival); return; }
    settle();
  };
  arrivals.add(onArrival);

  root.userData.sculptRuntime.parts = {};
  refresh();
  measureHead();
  return rig;
}

/**
 * Every body that carries an imported avatar. Kept as a list because walking
 * the whole scene to find the fifteen of them cost a traversal of thousands of
 * objects every frame.
 */
export const importedAvatarRoots = new Set<THREE.Object3D>();

const inScene = (node: THREE.Object3D, scene: THREE.Object3D): boolean => {
  for (let p: THREE.Object3D | null = node; p; p = p.parent) if (p === scene) return true;
  return false;
};

export function syncImportedAvatars(scene: THREE.Object3D): void {
  for (const root of importedAvatarRoots) {
    // A body not (or not yet) in this scene is skipped, never forgotten: a
    // remote visitor's body is built before it is added.
    if (root.userData.syncImportedAvatar && inScene(root, scene)) root.userData.syncImportedAvatar();
  }
}
