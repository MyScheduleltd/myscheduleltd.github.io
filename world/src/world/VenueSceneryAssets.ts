import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { fetchAsset } from './AssetMirror';
import { applyAvatarColourLighting } from './ImportedAvatar';

export type ScenicAsset = 'attendant' | 'boxOffice' | 'valet' | 'statue';
function assetUrl(kind: ScenicAsset): string {
  const urls: Record<ScenicAsset, string> = {
    attendant: new URL('../assets/venue-scenery/attendant.glb', import.meta.url).href,
    boxOffice: new URL('../assets/venue-scenery/box-office.glb', import.meta.url).href,
    valet: new URL('../assets/venue-scenery/valet.glb', import.meta.url).href,
    statue: new URL('../assets/venue-scenery/temple-statue.glb', import.meta.url).href,
  };
  return urls[kind];
}

/** Meshy scenery is local game data, fetched through the same verified mirror. */
export class VenueSceneryAssets {
  private disposed = false;
  private readonly motion = new THREE.Quaternion();
  private readonly motionEuler = new THREE.Euler();
  private loads = new Map<ScenicAsset, Promise<THREE.Group>>();
  private instances: Array<{ kind: ScenicAsset; model: THREE.Object3D }> = [];
  private attendants: Array<{ spine?: THREE.Bone; head?: THREE.Bone; spineRest?: THREE.Quaternion; headRest?: THREE.Quaternion; phase: number }> = [];
  readonly status: Partial<Record<ScenicAsset, 'loading' | 'ready' | 'failed'>> = {};

  private load(kind: ScenicAsset): Promise<THREE.Group> {
    let loaded = this.loads.get(kind);
    if (!loaded) {
      this.status[kind] = 'loading';
      loaded = fetchAsset(assetUrl(kind)).then((bytes) => new GLTFLoader().parseAsync(bytes, '')).then((gltf) => {
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
            if (kind === 'attendant') applyAvatarColourLighting(surface);
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

  async attach(kind: ScenicAsset, parent: THREE.Group, height: number, fallback?: THREE.Object3D): Promise<void> {
    try {
      const original = await this.load(kind);
      if (this.disposed) return;
      const model = clone(original);
      model.traverse(node => node.layers.enable(1));
      model.name = `Meshy 7 ${kind}`;
      if (kind === 'attendant') this.lowerAttendantArms(model);
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
      if (kind === 'attendant') this.registerAttendant(model);
    } catch {
      // Keep the visible authored fallback if a download fails.
    }
  }

  /** Lower generated A-pose arms in world space, respecting each bone's axes. */
  private lowerAttendantArms(model: THREE.Object3D): void {
    model.updateMatrixWorld(true);
    for (const side of ['Left', 'Right']) {
      const arm = model.getObjectByName(`${side}Arm`) as THREE.Bone | undefined;
      const elbow = model.getObjectByName(`${side}ForeArm`);
      if (!arm || !elbow || !arm.parent) continue;
      const at = arm.getWorldPosition(new THREE.Vector3());
      const from = elbow.getWorldPosition(new THREE.Vector3()).sub(at).normalize();
      const down = new THREE.Vector3(Math.sign(at.x) * .18, -1, .03).normalize();
      const world = new THREE.Quaternion().setFromUnitVectors(from, down).multiply(arm.getWorldQuaternion(new THREE.Quaternion()));
      arm.quaternion.copy(arm.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
      model.updateMatrixWorld(true);
    }
  }

  private registerAttendant(model: THREE.Object3D): void {
    const bones: THREE.Bone[] = [];
    model.traverse((node) => { if ((node as THREE.Bone).isBone) bones.push(node as THREE.Bone); });
    const find = (pattern: RegExp): THREE.Bone | undefined => bones.find((bone) => pattern.test(bone.name));
    const spine = find(/spine2|spine_02|chest/i) ?? find(/spine/i);
    const head = find(/head/i);
    this.attendants.push({ spine, head, spineRest: spine?.quaternion.clone(), headRest: head?.quaternion.clone(), phase: this.attendants.length * 2.4 });
  }

  update(elapsed: number): void {
    // Small, independently phased motions keep both staff at their posts.
    for (const rig of this.attendants) {
      if (rig.spine && rig.spineRest) rig.spine.quaternion.copy(rig.spineRest).multiply(this.motion.setFromEuler(this.motionEuler.set(Math.sin(elapsed * 1.3 + rig.phase) * .008, 0, 0)));
      if (rig.head && rig.headRest) rig.head.quaternion.copy(rig.headRest).multiply(this.motion.setFromEuler(this.motionEuler.set(0, Math.sin(elapsed * .35 + rig.phase) * .065, 0)));
    }
  }

  reviewSnapshot(): unknown {
    return { status: { ...this.status }, instances: this.instances.map(({kind, model}) => {
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
    this.disposed = true; this.attendants.length = 0; this.instances.length = 0;
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
