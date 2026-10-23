import * as THREE from 'three';

export const PALACE_PILASTER_BRONZE = 0xb08449;
export interface PalacePilasterFinishHandle {
  readonly report: { meshes: number; materials: number; color: number; metalness: number; roughness: number };
  /** Stop reflections/rendering first, then restore source materials. Maps remain caller-owned. */
  dispose(): void;
}
const prepared = new WeakMap<THREE.Object3D, PalacePilasterFinishHandle>();

/** Replace the imported pilaster's baked ivory/burgundy paint with satin bronze.
 * Exact imported-kind ancestry is required: shared Material_0 names are ignored.
 * Geometry/UVs are untouched; source maps stay alive on the original material.
 */
export function polishPalacePilasters(scene: THREE.Object3D): PalacePilasterFinishHandle {
  const cached = prepared.get(scene);
  if (cached) return cached;
  const variants = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  const restored: Array<{ mesh: THREE.Mesh; before: THREE.Material | THREE.Material[]; after: THREE.Material | THREE.Material[] }> = [];
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.environmentImported !== true || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    let marked = false;
    for (let ancestor: THREE.Object3D | null = mesh; ancestor; ancestor = ancestor.parent) {
      if (ancestor.userData.environmentExclude || ancestor.userData.dynamic || ancestor.userData.coastalCharacter !== undefined) return;
      if (ancestor.userData.environmentAssetKind === 'cinema-pilaster') marked = true;
    }
    if (!marked) return;
    const before = mesh.material;
    let changed = false;
    const next = (Array.isArray(before) ? before : [before]).map(source => {
      const standard = source as THREE.MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial) return source;
      let material = variants.get(standard);
      if (!material) {
        material = standard.clone();
        material.name = 'Palace satin-bronze pilaster';
        material.color.setHex(PALACE_PILASTER_BRONZE);
        material.metalness = .5;
        material.roughness = .5;
        material.emissive.setHex(0);
        material.emissiveIntensity = 0;
        material.map = material.emissiveMap = material.normalMap = null;
        material.roughnessMap = material.metalnessMap = material.aoMap = null;
        material.bumpMap = material.displacementMap = material.lightMap = material.alphaMap = null;
        material.vertexColors = false;
        Object.assign(material.userData, {
          preserveAuthoredSurface: true,
          islandPaletteApplied: true,
          palacePilasterFinish: 'satin-bronze',
        });
        const prior = standard.onBeforeCompile, priorKey = standard.customProgramCacheKey();
        material.onBeforeCompile = (shader, renderer) => prior.call(material!, shader, renderer);
        material.customProgramCacheKey = () => priorKey + ':palace-pilaster-satin-bronze-v1';
        material.needsUpdate = true;
        variants.set(standard, material);
      }
      changed = true;
      return material;
    });
    if (!changed) return;
    const after = Array.isArray(before) ? next : next[0];
    mesh.material = after;
    restored.push({ mesh, before, after });
  });
  let disposed = false;
  const handle: PalacePilasterFinishHandle = {
    report: { meshes: restored.length, materials: variants.size, color: PALACE_PILASTER_BRONZE, metalness: .5, roughness: .5 },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { mesh, before, after } of restored) if (mesh.material === after) mesh.material = before;
      for (const material of variants.values()) material.dispose();
      prepared.delete(scene);
    },
  };
  prepared.set(scene, handle);
  return handle;
}
