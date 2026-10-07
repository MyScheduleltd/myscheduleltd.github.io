import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Scenery that never moves, drawn as a few large meshes instead of hundreds of
 * small ones.
 *
 * The island built ~1,500 loose meshes straight into the scene, plus props of
 * fifty pieces each, and every one cost a matrix update, a frustum test and a
 * draw call every frame. On a phone that per-object work was most of the frame
 * (17 fps in 一般, 21 in 精簡, under phone-like CPU throttling; 2026-10-07).
 * Pieces that share a material, a shadow role, render layers and the worn-style
 * flags are baked into one geometry in world space, so the picture is the same
 * pixel for pixel: same material, same positions, same lighting.
 *
 * What is never batched: anything transparent (it is sorted per object),
 * skinned or instanced meshes, meshes with children or a render order, the
 * cinema screens' backdrops (they move with the screen), and whatever a caller
 * excludes. Only the scene's loose meshes and the named static props are
 * looked at. A tour of every venue found none of these moving or hiding.
 *
 * Run once, after the planet subdivision and the worn-style passes have
 * finished reshaping geometry; both work per mesh and must see the originals.
 */

/** Props built from many pieces that stand still for good. Matched by name. */
export const STATIC_PROP_NAMES = new Set([
  'Drive Thru 88 convertible',
  'gangan-statue',
  'Timber DJ console',
  'Festival pamphlet rack',
  'Seated gilded temple statue',
  'Enamel framed speaker',
  'Framed enamel sign',
]);

/** Flags the worn style reads off a mesh; a batch keeps those its pieces share. */
const KEPT_FLAGS = ['wornMasonryKind', 'wornNoMasonry', 'wornNoGrain', 'coastalAuthored'] as const;

const flagsOf = (mesh: THREE.Mesh): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const flag of KEPT_FLAGS) if (mesh.userData[flag] !== undefined) out[flag] = mesh.userData[flag];
  return out;
};

const attributeSignature = (geometry: THREE.BufferGeometry): string =>
  Object.entries(geometry.attributes)
    .map(([name, attribute]) => {
      const a = attribute as THREE.BufferAttribute;
      return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${(a.array as ArrayLike<number> & { constructor: { name: string } }).constructor.name}`;
    })
    .sort()
    .join(',') + (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length ? '+morph' : '');

const batchable = (mesh: THREE.Object3D, excluded: Set<THREE.Object3D>): mesh is THREE.Mesh => {
  const m = mesh as THREE.Mesh;
  if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh) return false;
  if (excluded.has(m) || m.children.length || m.renderOrder !== 0 || !m.visible || !m.frustumCulled) return false;
  if (Array.isArray(m.material) || !m.material || (m.material as THREE.Material).transparent) return false;
  if (m.userData.projectorBackground || m.userData.dynamic) return false;
  if (!m.geometry?.attributes?.position) return false;
  return true;
};

/**
 * A material's look, as a string: two materials with the same one draw the
 * same pixels. Colours, maps, lighting response, shader patches (the worn
 * style keeps its per-material choices in `defines` and `userData`; its
 * uniforms are shared by every material) and the program key.
 */
const PROPERTIES = ['type', 'roughness', 'metalness', 'emissiveIntensity', 'side', 'flatShading', 'vertexColors',
  'transparent', 'opacity', 'alphaTest', 'depthWrite', 'depthTest', 'fog', 'toneMapped', 'wireframe',
  'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'envMapIntensity', 'shininess', 'reflectivity'];
const COLOURS = ['color', 'emissive', 'specular'];
const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'lightMap', 'bumpMap', 'envMap'];
const lookOf = (material: THREE.Material): string => {
  const m = material as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PROPERTIES) if (key in m) out[key] = m[key];
  for (const key of COLOURS) { const c = m[key] as THREE.Color | undefined; if (c?.getHex) out[key] = c.getHex(); }
  for (const key of MAPS) { const t = m[key] as THREE.Texture | null | undefined; if (t) out[key] = t.uuid; }
  out.defines = JSON.stringify((material as { defines?: Record<string, unknown> }).defines ?? {});
  out.cache = material.customProgramCacheKey?.() ?? '';
  out.compile = material.onBeforeCompile?.toString() ?? '';
  out.userData = JSON.stringify(material.userData ?? {});
  return JSON.stringify(out);
};

/**
 * Whether a material may be swapped for an identical twin. The shader patches
 * (worn style, coastal cel bands) each name their variant in the program cache
 * key or in `defines`, both part of the look. Anything that glows is left alone: the lamps' materials are dimmed and brightened with the
 * time of day, one by one, and a twin would not follow.
 */
const shareable = (material: THREE.Material): boolean => {
  const emissive = (material as THREE.MeshStandardMaterial).emissive;
  // The worn style's masonry walls are tracked as its own (wornOrphanCount);
  // swapping one out would leave it looking abandoned.
  if (material.userData.wornMasonry === true) return false;
  return !material.transparent && (!emissive || emissive.getHex() === 0);
};

export interface StaticBatchReport {
  examined: number;
  batchedPieces: number;
  batches: number;
  /** Pieces moved onto an identical twin of their material. */
  sharedMaterials: number;
}

export function batchStaticScenery(scene: THREE.Scene, excluded: Set<THREE.Object3D> = new Set()): StaticBatchReport {
  scene.updateMatrixWorld(true);
  const candidates: THREE.Mesh[] = [];
  let examined = 0;
  for (const child of scene.children) {
    if ((child as THREE.Mesh).isMesh && !child.children.length) {
      examined += 1;
      if (batchable(child, excluded)) candidates.push(child as THREE.Mesh);
      continue;
    }
    if (!STATIC_PROP_NAMES.has(child.name) || excluded.has(child)) continue;
    child.traverse((node) => {
      if (!(node as THREE.Mesh).isMesh) return;
      examined += 1;
      if (batchable(node, excluded)) candidates.push(node as THREE.Mesh);
    });
  }

  // Identical materials first, so that pieces which only differ in which copy
  // of the same material they were given end up in one batch.
  const twins = new Map<string, THREE.Material>();
  let sharedMaterials = 0;
  for (const mesh of candidates) {
    const material = mesh.material as THREE.Material;
    if (!shareable(material)) continue;
    const look = lookOf(material);
    const twin = twins.get(look);
    if (!twin) { twins.set(look, material); continue; }
    if (twin !== material) { mesh.material = twin; sharedMaterials += 1; }
  }

  const groups = new Map<string, THREE.Mesh[]>();
  for (const mesh of candidates) {
    const material = mesh.material as THREE.Material;
    const key = [
      material.uuid, mesh.castShadow ? 1 : 0, mesh.receiveShadow ? 1 : 0, mesh.layers.mask,
      attributeSignature(mesh.geometry), JSON.stringify(flagsOf(mesh)),
    ].join('|');
    const list = groups.get(key) ?? [];
    list.push(mesh);
    groups.set(key, list);
  }

  let batchedPieces = 0;
  let batches = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // In world space, unindexed, so pieces with and without an index merge.
    const parts = members.map((mesh) => {
      const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone());
      g.applyMatrix4(mesh.matrixWorld);
      return g;
    });
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const first = members[0];
    const batch = new THREE.Mesh(merged, first.material);
    batch.name = 'static-batch';
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.layers.mask = first.layers.mask;
    Object.assign(batch.userData, flagsOf(first), { staticBatch: members.length });
    // Its vertices are already where they belong: an identity transform that
    // three.js never needs to recompute.
    batch.matrixAutoUpdate = false;
    batch.matrixWorldAutoUpdate = false;
    batch.updateMatrix();
    batch.updateMatrixWorld(true);
    scene.add(batch);
    for (const mesh of members) mesh.removeFromParent();
    batchedPieces += members.length;
    batches += 1;
  }
  return { examined, batchedPieces, batches, sharedMaterials };
}
