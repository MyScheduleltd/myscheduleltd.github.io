import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { fetchAsset } from './AssetMirror';
import { parseGameModel } from './MobileAssetBudget';
import type { AvatarRig } from './FestivalWorld';
import { createVictoryStatue, disposeVictoryStatue, VICTORY_STATUE_HEIGHT, VICTORY_PLINTH_TOP } from './VictoryStatue';

// The festival's attendants are avatar rigs (`registerFestivalAttendant`).
// The retired Meshy attendant model was deleted on 2026-11-12.
export type ScenicAsset = 'boxOffice' | 'valet' | 'statue';
function assetUrl(kind: ScenicAsset): string {
  const urls: Record<ScenicAsset, string> = {
    boxOffice: new URL('../assets/venue-scenery/box-office.glb', import.meta.url).href,
    valet: new URL('../assets/venue-scenery/valet.glb', import.meta.url).href,
    statue: new URL('../assets/venue-scenery/temple-statue.glb', import.meta.url).href,
  };
  return urls[kind];
}

/** Meshy scenery is local game data, fetched through the same verified mirror. */
export class VenueSceneryAssets {
  private disposed = false;
  private attachments: Promise<void>[] = [];
  private readonly motion = new THREE.Quaternion();
  private readonly motionEuler = new THREE.Euler();
  private loads = new Map<ScenicAsset, Promise<THREE.Group>>();
  private instances: Array<{ kind: ScenicAsset; model: THREE.Object3D }> = [];
  private nativeAttendants:Array<{rig:AvatarRig;spineRest:THREE.Quaternion;headRest:THREE.Quaternion;phase:number}>=[];
  readonly status: Partial<Record<ScenicAsset, 'loading' | 'ready' | 'failed'>> = {};

  private load(kind: ScenicAsset): Promise<THREE.Group> {
    let loaded = this.loads.get(kind);
    if (!loaded) {
      this.status[kind] = 'loading';
      loaded = fetchAsset(assetUrl(kind)).then((bytes) => parseGameModel(new GLTFLoader(), bytes)).then((gltf) => {
        gltf.scene.traverse((object) => {
          // These downloads arrive after the world's initial layer traversal.
          // The foreground pass must occlude video behind the entire model.
          object.layers.enable(1);
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.dynamic = true;
          mesh.userData.wornNoMasonry = true;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            const surface = material as THREE.MeshStandardMaterial;
            // Keep the generated normals, maps and authored material values.
            // Global masonry/flat-shading is for procedural town geometry.
            surface.userData.preserveAuthoredSurface = true;
          }
        });
        this.status[kind] = 'ready';
        return gltf.scene;
      }).catch((error) => {
        this.status[kind] = 'failed';
        console.warn(`Venue asset ${kind} could not load`, error);
        throw error;
      });
      this.loads.set(kind, loaded);
    }
    return loaded;
  }

  attach(kind: ScenicAsset, parent: THREE.Group, height: number, fallback?: THREE.Object3D): Promise<void> {
    const attachment = this.attachModel(kind, parent, height, fallback);
    this.attachments.push(attachment);
    return attachment;
  }

  /** Reuse the exact temple portrait head with a closed static victory body. */
  attachVictoryStatue(parent: THREE.Group, height = VICTORY_STATUE_HEIGHT, baseY = VICTORY_PLINTH_TOP): Promise<void> {
    const attachment = this.load('statue').then(original => {
      if (this.disposed) return;
      // A faster generated replacement can retire this fallback before the
      // shared temple download finishes; never create a hidden late prototype.
      if (!parent.visible) return;
      const model = createVictoryStatue(original, height); model.position.y += baseY;
      parent.add(model); this.instances.push({ kind: 'statue', model });
    }).catch(error => { console.warn('Victory portrait could not be attached', error); });
    this.attachments.push(attachment); return attachment;
  }

  /** Retire only the code fallback; the shared seated portrait stays cached. */
  discardVictoryStatue(parent: THREE.Group): void {
    this.instances = this.instances.filter(({ model }) => {
      if (model.parent !== parent || !model.userData.victoryStatue) return true;
      model.removeFromParent(); disposeVictoryStatue(model); return false;
    });
  }

  /** Wait for placement, not just download completion, before graphics preparation. */
  async ready(): Promise<void> { await Promise.all(this.attachments); }

  private async attachModel(kind: ScenicAsset, parent: THREE.Group, height: number, fallback?: THREE.Object3D): Promise<void> {
    try {
      const original = await this.load(kind);
      if (this.disposed) return;
      const model = clone(original);
      model.traverse(node => node.layers.enable(1));
      model.name = `Meshy 7 ${kind}`;
      model.updateMatrixWorld(true);
      model.traverse((node) => {
        const mesh = node as THREE.SkinnedMesh;
        if (mesh.isSkinnedMesh) { mesh.skeleton.update(); mesh.computeBoundingBox(); }
      });
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      if (!(size.y > 0) || !Number.isFinite(size.y)) throw new Error('Invalid model bounds');
      const scale = height / size.y;
      model.scale.setScalar(scale);
      // Match the booth's authored collision footprint, including its roof.
      if (kind === 'boxOffice') model.scale.set(4.8 / size.x, scale, 4 / size.z);
      if (kind === 'valet') model.scale.set(1.6 / size.x, scale, 1.3 / size.z);
      model.position.set(-(box.min.x + box.max.x) * model.scale.x / 2, -box.min.y * model.scale.y, -(box.min.z + box.max.z) * model.scale.z / 2);
      parent.add(model);
      this.instances.push({ kind, model });
      if (fallback) fallback.visible = false;
    } catch {
      // Keep the visible authored fallback if a download fails.
    }
  }

  registerFestivalAttendant(rig:AvatarRig):void {
    this.nativeAttendants.push({rig,spineRest:rig.torso.quaternion.clone(),headRest:rig.head.quaternion.clone(),phase:this.nativeAttendants.length*2.4});
  }

  update(elapsed: number): void {
    // Small, independently phased motions keep both staff at their posts.
    for(const {rig,spineRest,headRest,phase} of this.nativeAttendants){
      rig.torso.quaternion.copy(spineRest).multiply(this.motion.setFromEuler(this.motionEuler.set(Math.sin(elapsed*1.3+phase)*.008,0,0)));
      rig.head.quaternion.copy(headRest).multiply(this.motion.setFromEuler(this.motionEuler.set(0,Math.sin(elapsed*.35+phase)*.065,0)));
    }
  }

  reviewSnapshot(): unknown {
    return { status: { ...this.status }, nativeAttendants:this.nativeAttendants.length,instances: this.instances.map(({kind, model}) => {
      model.updateWorldMatrix(true, true);
      let triangles = 0, skinnedMeshes = 0, bones = 0;
      model.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
        if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes++;
        if ((node as THREE.Bone).isBone) bones++;
      });
      const box = new THREE.Box3().setFromObject(model);
      const joints = Object.fromEntries(['Head','LeftArm','LeftHand','RightArm','RightHand'].map(name => {
        const bone = model.getObjectByName(name);
        return [name,bone ? {position:bone.getWorldPosition(new THREE.Vector3()).toArray(),quaternion:bone.quaternion.toArray()} : undefined];
      }));
      return {kind,triangles,skinnedMeshes,bones,min:box.min.toArray(),max:box.max.toArray(),joints};
    }) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { model } of this.instances) if (model.userData.victoryStatue) disposeVictoryStatue(model);
    for(const {rig}of this.nativeAttendants)rig.visualRoot?.parent?.userData.disposeImportedAvatar?.();
    this.nativeAttendants.length=0;this.instances.length = 0;
    for (const pending of this.loads.values()) void pending.then(model => model.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        (material as THREE.MeshStandardMaterial).map?.dispose();
        material.dispose();
      }
    })).catch(() => undefined);
    this.loads.clear();
  }
}
