import * as THREE from 'three';

/** Wait for live shader programs without retaining a removed visitor's material. */
export async function compileScenePrograms(
  renderer: THREE.WebGLRenderer, surfaces: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene,
): Promise<void> {
  const pending = renderer.compile(surfaces, camera, scene);
  // Three 0.179's compileAsync assumes every material survives each timer.
  // Presence can remove/re-dress a visitor during admission, disposing that
  // material and its renderer properties. Its timer then throws at isReady(),
  // leaving the admission promise unresolved. Only still-live programs wait.
  while (pending.size) {
    for (const material of pending) {
      const properties = renderer.properties.get(material) as { currentProgram?: { isReady(): boolean } };
      const program = properties.currentProgram;
      if (!program || program.isReady()) pending.delete(material);
    }
    if (pending.size) await new Promise<void>(resolve => setTimeout(resolve, 16));
  }
}

/** Compile visible surfaces, including those outside the entrance camera's frustum. */
export async function warmScenePrograms(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
  const surfaces = new THREE.Group();
  scene.traverseVisible(object => {
    const drawable = object as THREE.Mesh;
    if (drawable.isMesh || (object as THREE.Sprite).isSprite || (object as THREE.Line).isLine || (object as THREE.Points).isPoints) {
      // Compilation reads geometry/material features only. Copies preserve
      // skin/instance flags without reparenting or drawing the live objects.
      surfaces.add(object.clone(false));
    }
  });
  await compileScenePrograms(renderer, surfaces, camera, scene);
}

/** Upload fixed maps while admission still covers expensive driver work. */
export async function uploadSceneTextures(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, extra: THREE.Texture[] = [], active: () => boolean = () => true,
): Promise<void> {
  const textures = new Set(extra);
  scene.traverseVisible(object => {
    const material = (object as THREE.Mesh).material;
    for (const surface of Array.isArray(material) ? material : material ? [material] : []) {
      for (const value of Object.values(surface)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  // Keep one upload per browser task so the loading animation remains responsive.
  for (const texture of textures) {
    if (!active()) return;
    renderer.initTexture(texture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

const drawable = (object: THREE.Object3D): boolean =>
  Boolean((object as THREE.Mesh).isMesh || (object as THREE.Sprite).isSprite || (object as THREE.Line).isLine || (object as THREE.Points).isPoints);

/**
 * Compiles by drawing (2026-10-18).
 *
 * `warmScenePrograms` asks three.js for the programs of what is visible, and in
 * WebKit — Safari, every iPhone — that left the real cost for later: a cold
 * run in Playwright's WebKit spent 6.3 s linking 44 programs in the first
 * world frame, then froze for 60–460 ms at a time on the way round the island,
 * as each new thing came into view. What it missed: everything hidden or
 * culled when it ran (NPCs out of sight, props, the band, the arcade, a second
 * body type), and every shadow-pass program, which only a draw with shadows on
 * builds. Metal also builds a pipeline per program at its first real draw.
 *
 * So, under the loading view, one of each kind of draw is drawn — one per
 * material and object type — a batch at a time, with a task between batches so
 * the loading animation keeps moving. Every light keeps the visibility it had,
 * because the number of lights is part of every program's key; only drawables
 * and the groups holding them are shown, and all of it is put back after.
 */
export async function warmByDrawing(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  onProgress?: (progress: number) => void, batchSize = 24, active: () => boolean = () => true,
): Promise<{ kinds: number; programs: number }> {
  const drawables: THREE.Object3D[] = [];
  scene.traverse(object => { if (drawable(object)) drawables.push(object); });
  const kinds = new Map<string, THREE.Object3D>();
  for (const object of drawables) {
    const mesh = object as THREE.Mesh & { isBatchedMesh?: boolean };
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    const key = [object.type, (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh, (mesh as unknown as THREE.InstancedMesh).isInstancedMesh,
      mesh.isBatchedMesh, object.castShadow, object.receiveShadow, Boolean(mesh.morphTargetInfluences?.length),
      mesh.customDepthMaterial?.uuid, mesh.customDistanceMaterial?.uuid, ...materials.map(material => material.uuid)].join('|');
    if (!kinds.has(key)) kinds.set(key, object);
  }
  const lit = new Set<THREE.Object3D>();
  scene.traverseVisible(object => { if ((object as THREE.Light).isLight) lit.add(object); });
  const lights: THREE.Object3D[] = [];
  const visibility = new Map<THREE.Object3D, boolean>();
  scene.traverse(object => {
    visibility.set(object, object.visible);
    if ((object as THREE.Light).isLight) lights.push(object);
  });
  const representatives = [...kinds.values()];
  const culling = new Map(representatives.map(object => [object, object.frustumCulled] as const));
  try {
    for (const object of representatives) object.frustumCulled = false;
    for (let start = 0; start < representatives.length; start += batchSize) {
      if (!active()) break;
      for (const object of drawables) object.visible = false;
      for (const object of representatives.slice(start, start + batchSize)) {
        for (let node: THREE.Object3D | null = object; node; node = node.parent) node.visible = true;
      }
      for (const light of lights) light.visible = lit.has(light);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      onProgress?.(Math.min(1, (start + batchSize) / representatives.length));
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  } finally {
    for (const [object, visible] of visibility) object.visible = visible;
    for (const [object, culled] of culling) object.frustumCulled = culled;
  }
  return { kinds: representatives.length, programs: renderer.info.programs?.length ?? 0 };
}
