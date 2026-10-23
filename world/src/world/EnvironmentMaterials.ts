import * as THREE from 'three';
import { fetchAsset } from './AssetMirror';
import { loadBudgetedTexture, mobileAssetBudgetEnabled } from './MobileAssetBudget';

export const ENVIRONMENT_FAMILIES = ['plaster', 'brick', 'ceramic', 'asphalt', 'wood', 'stone'] as const;
export type EnvironmentFamily = typeof ENVIRONMENT_FAMILIES[number];
export type EnvironmentTextureRole = 'color' | 'normal' | 'roughness';
export type EnvironmentTextureUrls = Partial<Record<EnvironmentTextureRole, string>>;
export type EnvironmentAssets = Partial<Record<EnvironmentFamily, EnvironmentTextureUrls>>;

export interface EnvironmentSurface {
  family: EnvironmentFamily;
  /** World metres per tile, independent of the source mesh's scale. */
  metres?: number;
  /** Neutral tile maps retain the festival's existing colour by default. */
  tint?: 'source' | number;
  /** Preserve is for an already UV-authored mesh; procedural shells use world. */
  uv?: 'world' | 'preserve';
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

/** Accept Vite's eager ?url glob; absent optional maps produce no requests. */
export function environmentAssetsFromUrls(files: Record<string, string>): EnvironmentAssets {
  const assets: EnvironmentAssets = {};
  for (const [path, url] of Object.entries(files)) {
    const name = path.split('/').pop() ?? '';
    const match = /^(plaster|brick|ceramic|asphalt|wood|stone)(?:-(normal|roughness))?\.webp$/.exec(name);
    if (!match) continue;
    const family = match[1] as EnvironmentFamily;
    (assets[family] ??= {})[(match[2] ?? 'color') as EnvironmentTextureRole] = url;
  }
  return assets;
}

const SURFACES: Record<EnvironmentFamily, { metres: number; roughness: number; normal: number }> = {
  plaster: { metres: 3, roughness: .88, normal: .20 },
  brick: { metres: 2.4, roughness: .88, normal: .28 },
  ceramic: { metres: 2, roughness: .55, normal: .14 },
  asphalt: { metres: 4, roughness: .92, normal: .22 },
  wood: { metres: 2, roughness: .76, normal: .16 },
  stone: { metres: 3, roughness: .84, normal: .23 },
};
const ROLES: EnvironmentTextureRole[] = ['color', 'normal', 'roughness'];
type TextureSet = Partial<Record<EnvironmentTextureRole, THREE.Texture>>;
type FamilyState = 'unused' | 'missing' | 'loading' | 'ready' | 'partial' | 'failed';

export interface EnvironmentMaterialReport {
  tagged: number;
  applied: number;
  skipped: number;
  materialVariants: number;
  textures: number;
  encodedBytes: number;
  /** RGBA8 decoded allocation estimate; excludes mipmaps/driver overhead. */
  decodedBytes: number;
  releasedGeometries: number;
  releasedMaterials: number;
  families: Record<EnvironmentFamily, { state: FamilyState; maps: EnvironmentTextureRole[]; errors: string[] }>;
}

export interface EnvironmentMaterialOptions {
  assets: EnvironmentAssets;
  mobile?: boolean;
}

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error);

/**
 * Six shared tile sets, with reusable material variants for existing colours.
 * Call prepare after fixed model placement and before static batching/warmup.
 * Only explicit tags or the caller's exact selector are eligible. In particular
 * this does not guess surfaces from a name, colour, position or bounding box.
 */
export class EnvironmentMaterials {
  private readonly assets: EnvironmentAssets;
  private readonly mobile: boolean;
  private readonly loads = new Map<EnvironmentFamily, Promise<TextureSet>>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly applied = new WeakSet<THREE.Mesh>();
  private disposed = false;
  private encodedBytes = 0;
  private decodedBytes = 0;
  private taggedCount = 0;
  private appliedCount = 0;
  private skippedCount = 0;
  private releasedGeometries = 0;
  private releasedMaterials = 0;
  private readonly families = Object.fromEntries(ENVIRONMENT_FAMILIES.map(family => [family,
    { state: 'unused' as FamilyState, maps: [] as EnvironmentTextureRole[], errors: [] as string[] },
  ])) as EnvironmentMaterialReport['families'];

  constructor(options: EnvironmentMaterialOptions) {
    this.assets = options.assets;
    this.mobile = options.mobile ?? mobileAssetBudgetEnabled();
  }

  private async loadTexture(url: string, role: EnvironmentTextureRole): Promise<THREE.Texture> {
    // Match the avatar path: verified file bytes, then the shared mobile image
    // queue and bounded decode. A blob URL is local data, never another CDN hit.
    const bytes = await fetchAsset(url);
    if (this.disposed) throw new Error('Environment materials disposed');
    this.encodedBytes += bytes.byteLength;
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    let texture: THREE.Texture;
    try {
      texture = await (this.mobile && typeof createImageBitmap !== 'undefined'
        ? loadBudgetedTexture(objectUrl)
        : new THREE.TextureLoader().loadAsync(objectUrl));
    } finally { URL.revokeObjectURL(objectUrl); }
    if (this.disposed) { this.releaseTexture(texture); throw new Error('Environment materials disposed'); }
    texture.colorSpace = role === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 2;
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    const image = texture.image as { width?: number; height?: number };
    this.decodedBytes += (image?.width ?? 0) * (image?.height ?? 0) * 4;
    this.textures.add(texture);
    return texture;
  }

  private loadFamily(family: EnvironmentFamily): Promise<TextureSet> {
    let pending = this.loads.get(family);
    if (pending) return pending;
    const urls = this.assets[family];
    const report = this.families[family];
    if (!urls?.color) {
      report.state = 'missing';
      report.errors.push('No base-colour tile installed; original surface retained.');
      pending = Promise.resolve({});
    } else {
      report.state = 'loading';
      pending = (async () => {
        const set: TextureSet = {};
        // Download and decode at most one new tile at a time. The mobile
        // decoder also shares its queue with embedded GLB/avatar images.
        for (const role of ROLES) {
          const url = urls[role];
          if (!url || this.disposed) continue;
          try { set[role] = await this.loadTexture(url, role); report.maps.push(role); }
          catch (error) {
            report.errors.push(`${role}: ${errorText(error)}`);
            if (role === 'color') break;
          }
        }
        report.state = !set.color ? 'failed' : report.errors.length ? 'partial' : 'ready';
        return set;
      })();
    }
    this.loads.set(family, pending);
    return pending;
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

  private material(source: THREE.MeshStandardMaterial, surface: EnvironmentSurface, maps: TextureSet): THREE.MeshStandardMaterial {
    const defaults = SURFACES[surface.family];
    const tint = surface.tint === undefined || surface.tint === 'source' ? source.color : new THREE.Color(surface.tint);
    // Match the source's intentional indoor fill as well as its tint/render
    // side. No cel/worn onBeforeCompile hooks or per-mesh uniforms follow it.
    const key = `${surface.family}:${tint.getHexString()}:${source.side}:${source.emissive.toArray().join(',')}:${source.emissiveIntensity}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: tint, map: maps.color ?? null, normalMap: maps.normal ?? null,
        emissive: source.emissive, emissiveIntensity: source.emissiveIntensity,
        roughnessMap: maps.roughness ?? null, roughness: maps.roughness ? 1 : defaults.roughness,
        // Both loaders upload unflipped image rows (+V points down the image).
        // Generated OpenGL +Y maps need their green component inverted here.
        metalness: 0, normalScale: new THREE.Vector2(defaults.normal, -defaults.normal),
        side: source.side, flatShading: false,
      });
      material.name = `Environment ${surface.family} ${tint.getHexString()}`;
      material.userData.preserveAuthoredSurface = true;
      material.userData.environmentFamily = surface.family;
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
    // Family jobs are serial too, bounding extra decode pressure during entry.
    for (const family of new Set(candidates.map(candidate => candidate.surface.family))) await this.loadFamily(family);
    if (this.disposed) return this.snapshot();
    const replacedGeometries = new Set<THREE.BufferGeometry>();
    const replacedMaterials = new Set<THREE.Material>();
    for (const { mesh, surface } of candidates) {
      if (this.applied.has(mesh)) continue;
      const maps = await this.loadFamily(surface.family);
      if (this.disposed) break;
      if (!maps.color) { this.skippedCount++; continue; }
      const source = mesh.material;
      if (surface.uv !== 'preserve') {
        replacedGeometries.add(mesh.geometry);
        const metres = surface.metres ?? SURFACES[surface.family].metres;
        this.projectUVs(mesh, Number.isFinite(metres) && metres > 0 ? metres : SURFACES[surface.family].metres);
      }
      mesh.material = this.material(source, surface, maps);
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
      materialVariants: this.materials.size, textures: this.textures.size,
      encodedBytes: this.encodedBytes, decodedBytes: this.decodedBytes,
      releasedGeometries: this.releasedGeometries, releasedMaterials: this.releasedMaterials,
      families: Object.fromEntries(ENVIRONMENT_FAMILIES.map(family => [family,
        { ...this.families[family], maps: [...this.families[family].maps], errors: [...this.families[family].errors] },
      ])) as EnvironmentMaterialReport['families'],
    };
  }

  private releaseTexture(texture: THREE.Texture): void {
    texture.dispose();
    (texture.image as { close?: () => void } | undefined)?.close?.();
  }

  /** Call after rendering stops; materials/maps are shared by every opted-in mesh. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) this.releaseTexture(texture);
    this.materials.clear(); this.textures.clear();
  }
}
