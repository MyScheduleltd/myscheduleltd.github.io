import * as THREE from 'three';

/**
 * The festival's six tiled surface families. Each is a drawn 64-pixel PS1 tile
 * (Ps1Surfaces) laid over explicitly tagged static geometry in world metres.
 * The photographic tiles, their normal and roughness maps, and the compressed
 * copies were retired with the film look (the owner, 2026-11-12).
 */
export const ENVIRONMENT_FAMILIES = ['plaster', 'brick', 'ceramic', 'asphalt', 'wood', 'stone'] as const;
export type EnvironmentFamily = typeof ENVIRONMENT_FAMILIES[number];

export interface EnvironmentSurface {
  family: EnvironmentFamily;
  /** World metres per tile, independent of the source mesh's scale. */
  metres?: number;
  /** Neutral tile maps retain the festival's existing colour by default. */
  tint?: 'source' | number;
  /** Preserve is for an already UV-authored mesh; procedural shells use world. */
  uv?: 'world' | 'preserve';
  /** Keep this tint through the island palette pass (EnvironmentArt), for a colour chosen on purpose. */
  keepTint?: boolean;
}

/** Explicit opt-in on a static mesh, never a traversal of its children. */
export function tagEnvironmentSurface<T extends THREE.Mesh>(mesh: T, family: EnvironmentFamily, options: Omit<EnvironmentSurface, 'family'> = {}): T {
  mesh.userData.environmentSurface = { ...options, family } satisfies EnvironmentSurface;
  return mesh;
}

/** Protect a character/prop branch even if one of its meshes was tagged. */
export function excludeEnvironmentObject<T extends THREE.Object3D>(object: T): T {
  object.userData.environmentExclude = true;
  return object;
}

const SURFACES: Record<EnvironmentFamily, { metres: number; roughness: number }> = {
  plaster: { metres: 3, roughness: .88 },
  brick: { metres: 2.4, roughness: .88 },
  ceramic: { metres: 2, roughness: .55 },
  asphalt: { metres: 4, roughness: .92 },
  wood: { metres: 2, roughness: .76 },
  stone: { metres: 3, roughness: .84 },
};

export interface EnvironmentMaterialReport {
  tagged: number;
  applied: number;
  skipped: number;
  materialVariants: number;
  /** Drawn tiles in use (shared, never downloaded). */
  textures: number;
  releasedGeometries: number;
  releasedMaterials: number;
  families: Record<EnvironmentFamily, { state: 'unused' | 'ready' }>;
}

export interface EnvironmentMaterialOptions {
  /** One drawn tile per family (Ps1Surfaces), shared across worlds, so never disposed here. */
  drawnTile: (family: EnvironmentFamily) => THREE.Texture;
}

/**
 * Six shared tiles, with reusable material variants for existing colours.
 * Call prepare after fixed model placement and before static batching/warmup.
 * Only explicit tags or the caller's exact selector are eligible. In particular
 * this does not guess surfaces from a name, colour, position or bounding box.
 */
export class EnvironmentMaterials {
  private readonly drawnTile: (family: EnvironmentFamily) => THREE.Texture;
  private readonly tiles = new Map<EnvironmentFamily, THREE.Texture>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly applied = new WeakSet<THREE.Mesh>();
  private disposed = false;
  private taggedCount = 0;
  private appliedCount = 0;
  private skippedCount = 0;
  private releasedGeometries = 0;
  private releasedMaterials = 0;

  constructor(options: EnvironmentMaterialOptions) {
    this.drawnTile = options.drawnTile;
  }

  private tile(family: EnvironmentFamily): THREE.Texture {
    let tile = this.tiles.get(family);
    if (!tile) { tile = this.drawnTile(family); this.tiles.set(family, tile); }
    return tile;
  }

  /** Existing authored GLBs, characters, signs and animated props stay intact. */
  private eligible(mesh: THREE.Mesh): mesh is THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh
      || !mesh.geometry?.getAttribute('position') || Array.isArray(mesh.material)
      || !((mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial)
      || mesh.material.transparent || mesh.material.opacity < 1
      || mesh.material.userData.preserveAuthoredSurface === true) return false;
    // Some real venue floors belong behind the CSS video too. Only their
    // explicit construction tag plus this explicit opt-in can exempt them;
    // a broad selector can never turn a screen/backdrop into a tiled surface.
    const allowProjectorBackground = mesh.userData.environmentAllowProjectorBackground === true
      && mesh.userData.environmentSurface !== undefined;
    for (let object: THREE.Object3D | null = mesh; object; object = object.parent) {
      const data = object.userData;
      if (data.environmentExclude || data.dynamic || data.sculptRuntime || (data.projectorBackground && !allowProjectorBackground)
        || data.paletteSlot !== undefined || data.coastalCharacter !== undefined
        || object.name === 'character-body' || (object as THREE.Bone).isBone) return false;
    }
    return true;
  }

  private material(source: THREE.MeshStandardMaterial, surface: EnvironmentSurface, map: THREE.Texture): THREE.MeshStandardMaterial {
    const defaults = SURFACES[surface.family];
    const tint = surface.tint === undefined || surface.tint === 'source' ? source.color : new THREE.Color(surface.tint);
    // Ceiling structure can hang below the room's numerical roof cut. This
    // explicit rendering role survives tile replacement, but no source cel,
    // worn or arbitrary shader define is carried into the tile material.
    const overhead=(source as THREE.MeshStandardMaterial & {defines?:Record<string,unknown>}).defines?.CUTAWAY_OVERHEAD!==undefined;
    // Match the source's intentional indoor fill as well as its tint/render
    // side. No cel/worn onBeforeCompile hooks or per-mesh uniforms follow it.
    const key = `${surface.family}:${tint.getHexString()}:${source.side}:${source.emissive.toArray().join(',')}:${source.emissiveIntensity}:${overhead?'overhead':''}${surface.keepTint?':kept':''}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: tint, map,
        emissive: source.emissive, emissiveIntensity: source.emissiveIntensity,
        roughness: defaults.roughness, metalness: 0,
        side: source.side, flatShading: false,
      });
      material.name = `Environment ${surface.family} ${tint.getHexString()}`;
      material.userData.preserveAuthoredSurface = true;
      material.userData.environmentFamily = surface.family;
      if (surface.keepTint) material.userData.islandPaletteApplied = true;
      if(overhead)(material as THREE.MeshStandardMaterial & {defines:Record<string,string>}).defines={CUTAWAY_OVERHEAD:''};
      this.materials.set(key, material);
    }
    return material;
  }

  private projectUVs(mesh: THREE.Mesh, metres: number): void {
    const source = mesh.geometry;
    const geometry = source.clone();
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const uv = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
      const x = Math.abs(normal.x), y = Math.abs(normal.y), z = Math.abs(normal.z);
      uv[i * 2] = (x > y && x > z ? point.z : point.x) / metres;
      uv[i * 2 + 1] = (y > x && y > z ? point.z : point.y) / metres;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // Existing tangents belonged to the old UVs; derivatives reconstruct them.
    geometry.deleteAttribute('tangent');
    mesh.geometry = geometry;
    // The source may be the shared unit cube. Release it only after checking
    // every visible and hidden consumer in the supplied world root below.
  }

  async prepare(root: THREE.Object3D, select?: (mesh: THREE.Mesh) => EnvironmentSurface | undefined): Promise<EnvironmentMaterialReport> {
    if (this.disposed) return this.snapshot();
    const candidates: Array<{ mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; surface: EnvironmentSurface }> = [];
    root.updateWorldMatrix(true, true);
    root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || this.applied.has(mesh)) return;
      const surface = (mesh.userData.environmentSurface as EnvironmentSurface | undefined) ?? select?.(mesh);
      if (!surface || !ENVIRONMENT_FAMILIES.includes(surface.family)) return;
      this.taggedCount++;
      if (!this.eligible(mesh)) { this.skippedCount++; return; }
      candidates.push({ mesh, surface });
    });
    const replacedGeometries = new Set<THREE.BufferGeometry>();
    const replacedMaterials = new Set<THREE.Material>();
    for (const { mesh, surface } of candidates) {
      if (this.applied.has(mesh)) continue;
      const source = mesh.material;
      if (surface.uv !== 'preserve') {
        replacedGeometries.add(mesh.geometry);
        const metres = surface.metres ?? SURFACES[surface.family].metres;
        this.projectUVs(mesh, Number.isFinite(metres) && metres > 0 ? metres : SURFACES[surface.family].metres);
      }
      mesh.material = this.material(source, surface, this.tile(surface.family));
      replacedMaterials.add(source);
      mesh.userData.wornNoMasonry = true;
      mesh.userData.environmentFamily = surface.family;
      this.applied.add(mesh);
      this.appliedCount++;
    }
    // Match StaticBatch's ownership rule: do not leave already drawn originals
    // resident beside their replacements, or dispose a shared primitive still
    // used by a sign, character, hidden prop or another part of the world.
    root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      replacedGeometries.delete(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) replacedMaterials.delete(material);
    });
    for (const geometry of replacedGeometries) { geometry.dispose(); this.releasedGeometries++; }
    for (const material of replacedMaterials) { material.dispose(); this.releasedMaterials++; }
    return this.snapshot();
  }

  snapshot(): EnvironmentMaterialReport {
    return {
      tagged: this.taggedCount, applied: this.appliedCount, skipped: this.skippedCount,
      materialVariants: this.materials.size, textures: this.tiles.size,
      releasedGeometries: this.releasedGeometries, releasedMaterials: this.releasedMaterials,
      families: Object.fromEntries(ENVIRONMENT_FAMILIES.map(family => [family,
        { state: this.tiles.has(family) ? 'ready' : 'unused' }])) as EnvironmentMaterialReport['families'],
    };
  }

  /** Call after rendering stops; materials are shared by every opted-in mesh. The drawn tiles are shared across worlds. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear(); this.tiles.clear();
  }
}
