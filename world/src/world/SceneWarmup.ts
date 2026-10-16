import * as THREE from 'three';

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
  await renderer.compileAsync(surfaces, camera, scene);
}

/** Upload fixed maps while admission still covers expensive driver work. */
export async function uploadSceneTextures(renderer: THREE.WebGLRenderer, scene: THREE.Scene, extra: THREE.Texture[] = []): Promise<void> {
  const textures = new Set(extra);
  scene.traverseVisible(object => {
    const material = (object as THREE.Mesh).material;
    for (const surface of Array.isArray(material) ? material : material ? [material] : []) {
      for (const value of Object.values(surface)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  // Keep one upload per browser task so the loading animation remains responsive.
  for (const texture of textures) {
    renderer.initTexture(texture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}
