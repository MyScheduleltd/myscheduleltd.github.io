import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fetchAsset } from './AssetMirror';
import { mobileAssetBudgetEnabled, parseGameModel } from './MobileAssetBudget';

export const ENVIRONMENT_ASSET_KINDS = ['street-lamp', 'pamphlet-stand', 'cinema-pilaster', 'statue', 'victory-statue', 'drive-in-car'] as const;
export type EnvironmentAssetKind = typeof ENVIRONMENT_ASSET_KINDS[number];
export const ENVIRONMENT_ASSET_ROOT = 'Higgsfield environment asset';
export type EnvironmentModelAssets = Partial<Record<EnvironmentAssetKind, string>>;

/** Accept the caller's eager Vite ?url glob without evaluating Vite in fixtures. */
export function environmentModelAssetsFromUrls(files: Record<string, string>, mobile=mobileAssetBudgetEnabled()): EnvironmentModelAssets {
  const desktop:EnvironmentModelAssets={}, phone:EnvironmentModelAssets={};
  for(const [path,url] of Object.entries(files)) {
    const match=/^(.+?)(-mobile)?\.glb$/.exec(path.split('/').pop()??'');
    if(!match||!ENVIRONMENT_ASSET_KINDS.includes(match[1] as EnvironmentAssetKind))continue;
    (match[2]?phone:desktop)[match[1] as EnvironmentAssetKind]=url;
  }
  return mobile?{...desktop,...phone}:desktop;
}

export interface EnvironmentFitOptions {
  height?: number;
  maxWidth?: number;
  maxDepth?: number;
  maxHeight?: number;
  /** Explicit nonuniform fit. Otherwise height and all maxima share one scale. */
  exactSize?: readonly [number, number, number];
  /** Applied before calculating the footprint, in radians. */
  yaw?: number;
}

export interface EnvironmentAttachmentOptions extends EnvironmentFitOptions {
  fallback?: readonly THREE.Object3D[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface EnvironmentFit {
  root: THREE.Group;
  model: THREE.Object3D;
  bounds: THREE.Box3;
  size: THREE.Vector3;
  scale: THREE.Vector3;
}

const positive = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be finite and positive`);
  return value;
};

/** Fit by transforms alone; geometry, authored normals and UVs remain shared. */
export function fitEnvironmentModel(source: THREE.Object3D, options: EnvironmentFitOptions = {}): EnvironmentFit {
  if (options.yaw !== undefined && !Number.isFinite(options.yaw)) throw new Error('yaw must be finite');
  const model = source.clone(true);
  const turned = new THREE.Group(); turned.rotation.y = options.yaw ?? 0; turned.add(model);
  const fitted = new THREE.Group(); fitted.add(turned);
  const root = new THREE.Group(); root.name = ENVIRONMENT_ASSET_ROOT; root.add(fitted);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turned), originalSize = box.getSize(new THREE.Vector3());
  for (const [axis, value] of Object.entries({ width: originalSize.x, height: originalSize.y, depth: originalSize.z })) positive(value, `Model ${axis}`);
  if (![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) throw new Error('Invalid model bounds');
  const scale = new THREE.Vector3(1, 1, 1);
  if (options.exactSize) {
    const wanted = options.exactSize.map((value, i) => positive(value, `exactSize[${i}]`));
    scale.set(wanted[0] / originalSize.x, wanted[1] / originalSize.y, wanted[2] / originalSize.z);
  } else {
    let uniform = options.height === undefined ? 1 : positive(options.height, 'height') / originalSize.y;
    for (const [maximum, dimension, name] of [
      [options.maxWidth, originalSize.x, 'maxWidth'], [options.maxHeight, originalSize.y, 'maxHeight'], [options.maxDepth, originalSize.z, 'maxDepth'],
    ] as const) if (maximum !== undefined) uniform = Math.min(uniform, positive(maximum, name) / dimension);
    scale.setScalar(uniform);
  }
  // Scaling outside the yaw group makes exactSize describe the chosen facing's
  // actual axis-aligned footprint, even when the facing is not a quarter turn.
  fitted.scale.copy(scale);
  fitted.position.set(-(box.min.x + box.max.x) * scale.x / 2, -box.min.y * scale.y, -(box.min.z + box.max.z) * scale.z / 2);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  return { root, model, bounds, size: bounds.getSize(new THREE.Vector3()), scale };
}

type AssetState = 'loading' | 'ready' | 'failed';
interface OwnedResources {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  textures: Set<THREE.Texture>;
}
const resourcesIn = (root: THREE.Object3D): OwnedResources => {
  const resources: OwnedResources = { geometries: new Set(), materials: new Set(), textures: new Set() };
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    resources.geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      resources.materials.add(material);
      for (const value of Object.values(material)) if ((value as THREE.Texture | null)?.isTexture) resources.textures.add(value as THREE.Texture);
    }
  });
  return resources;
};
const release = (resources: OwnedResources): void => {
  for (const geometry of resources.geometries) geometry.dispose();
  for (const material of resources.materials) material.dispose();
  const closed = new Set<unknown>();
  for (const texture of resources.textures) {
    texture.dispose();
    const image = texture.image as { close?: () => void } | undefined;
    if (image && !closed.has(image)) { image.close?.(); closed.add(image); }
  }
};

export interface EnvironmentAssetReport {
  status: Partial<Record<EnvironmentAssetKind, AssetState>>;
  errors: Partial<Record<EnvironmentAssetKind, string[]>>;
  sources: Partial<Record<EnvironmentAssetKind, { bytes: number; triangles: number; meshes: number; materials: number; textures: number }>>;
  instances: Array<{ kind: EnvironmentAssetKind; size: number[]; scale: number[]; min: number[]; max: number[] }>;
}

/** Fixed, static models loaded once per kind, then cloned with shared resources. */
export class EnvironmentAssets {
  private readonly urls: EnvironmentModelAssets;
  private readonly mobile: boolean;
  private readonly loads = new Map<EnvironmentAssetKind, Promise<THREE.Group>>();
  private readonly attachments: Promise<boolean>[] = [];
  private readonly roots: THREE.Group[] = [];
  private readonly owned: OwnedResources = { geometries: new Set(), materials: new Set(), textures: new Set() };
  private readonly report: EnvironmentAssetReport = { status: {}, errors: {}, sources: {}, instances: [] };
  private disposed = false;

  constructor(options: { assets?: EnvironmentModelAssets; mobile?: boolean } = {}) {
    this.urls = options.assets ?? {};
    this.mobile = options.mobile ?? mobileAssetBudgetEnabled();
  }

  private load(kind: EnvironmentAssetKind): Promise<THREE.Group> {
    let pending = this.loads.get(kind);
    if (pending) return pending;
    this.report.status[kind] = 'loading';
    pending = (async () => {
      const url = this.urls[kind];
      if (!url) throw new Error(`No ${kind}.glb installed`);
      const bytes = await fetchAsset(url);
      if (this.disposed) throw new Error('Environment assets disposed');
      const gltf = await parseGameModel(new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), bytes, this.mobile);
      const resources = resourcesIn(gltf.scene);
      try {
        if (this.disposed) throw new Error('Environment assets disposed');
        if (gltf.animations.length) throw new Error('Environment assets must not contain animation');
        let triangles = 0, meshes = 0;
        gltf.scene.traverse(object => {
          object.layers.enable(1);
          const mesh = object as THREE.Mesh;
          if ((object as THREE.Bone).isBone || (mesh as THREE.SkinnedMesh).isSkinnedMesh) throw new Error('Environment assets must be static, without a skin');
          if (!mesh.isMesh) return;
          const positions = mesh.geometry.getAttribute('position');
          if (!positions?.count) throw new Error('Environment asset has an empty mesh');
          for (let i = 0; i < positions.count; i++) if (![positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite)) throw new Error('Environment asset has invalid vertices');
          triangles += (mesh.geometry.index?.count ?? positions.count) / 3; meshes++;
          mesh.userData.wornNoMasonry = true;
          mesh.userData.environmentImported = true;
          delete mesh.userData.dynamic;
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const surface = material as THREE.MeshStandardMaterial;
            if (surface.isMeshStandardMaterial && (!Number.isFinite(surface.roughness) || surface.roughness < 0 || surface.roughness > 1)) throw new Error('Environment asset has invalid roughness');
            if (kind === 'victory-statue' && surface.isMeshStandardMaterial) {
              // The square sculpture shares the temple statue's broad planar
              // response. Actual face normals provide the facets under world
              // lighting; the style is not only painted into the colour map.
              surface.flatShading = true;
              surface.roughness = .8;
              surface.metalness = 0;
              surface.userData.victoryBlockySurface = true;
            }
            material.userData.preserveAuthoredSurface = true;
          }
        });
        if (!meshes) throw new Error('Environment asset has no mesh');
        // Bounds are validated before a source may be attached anywhere.
        const bounds = new THREE.Box3().setFromObject(gltf.scene), size = bounds.getSize(new THREE.Vector3());
        for (const dimension of size.toArray()) positive(dimension, 'Model dimension');
        for (const geometry of resources.geometries) this.owned.geometries.add(geometry);
        for (const material of resources.materials) this.owned.materials.add(material);
        for (const texture of resources.textures) this.owned.textures.add(texture);
        this.report.sources[kind] = { bytes: bytes.byteLength, triangles, meshes, materials: resources.materials.size, textures: resources.textures.size };
        this.report.status[kind] = 'ready';
        return gltf.scene;
      } catch (error) { release(resources); throw error; }
    })();
    this.loads.set(kind, pending);
    return pending;
  }

  attach(kind: EnvironmentAssetKind, parent: THREE.Object3D, options: EnvironmentAttachmentOptions = {}): Promise<boolean> {
    const pending = this.attachModel(kind, parent, options);
    this.attachments.push(pending);
    return pending;
  }

  private async attachModel(kind: EnvironmentAssetKind, parent: THREE.Object3D, options: EnvironmentAttachmentOptions): Promise<boolean> {
    if (this.disposed) return false;
    try {
      // Hiding an ancestor would hide the replacement as well. Treat that as
      // a placement error while the original scenery is still visible.
      for (let ancestor: THREE.Object3D | null = parent; ancestor; ancestor = ancestor.parent) {
        if (options.fallback?.includes(ancestor)) throw new Error('Fallback cannot contain the attachment parent');
      }
      const source = await this.load(kind);
      if (this.disposed) return false;
      const fitted = fitEnvironmentModel(source, options);
      fitted.root.userData.environmentAssetKind = kind;
      fitted.root.traverse(object => {
        object.layers.enable(1);
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) { mesh.castShadow = options.castShadow ?? false; mesh.receiveShadow = options.receiveShadow ?? true; }
      });
      parent.add(fitted.root);
      this.roots.push(fitted.root);
      this.report.instances.push({ kind, size: fitted.size.toArray(), scale: fitted.scale.toArray(), min: fitted.bounds.min.toArray(), max: fitted.bounds.max.toArray() });
      // A fetch, parse, static-content or fit failure must never erase the world.
      for (const fallback of options.fallback ?? []) fallback.visible = false;
      this.report.status[kind] = 'ready';
      return true;
    } catch (error) {
      this.report.status[kind] = 'failed';
      (this.report.errors[kind] ??= []).push(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /** Includes every placement added while the current loading batch finishes. */
  async ready(): Promise<void> {
    let completed = 0;
    while (completed < this.attachments.length) {
      const waiting = this.attachments.slice(completed); completed = this.attachments.length;
      await Promise.all(waiting);
    }
  }

  snapshot(): EnvironmentAssetReport {
    return {
      status: { ...this.report.status },
      errors: Object.fromEntries(Object.entries(this.report.errors).map(([kind, errors]) => [kind, [...errors]])),
      sources: Object.fromEntries(Object.entries(this.report.sources).map(([kind, source]) => [kind, { ...source }])),
      instances: this.report.instances.map(instance => ({ ...instance, size: [...instance.size], scale: [...instance.scale], min: [...instance.min], max: [...instance.max] })),
    };
  }

  /** Rendering must stop first: all instances deliberately share these resources. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const root of this.roots) root.removeFromParent();
    this.roots.length = 0;
    release(this.owned);
    this.owned.geometries.clear(); this.owned.materials.clear(); this.owned.textures.clear();
  }
}
