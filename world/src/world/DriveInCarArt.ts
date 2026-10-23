import * as THREE from 'three';

export const DRIVE_IN_PAINTS = [0xf34830, 0xffb52e, 0x10b6c5, 0xffd18a, 0x365fd1, 0x148d62] as const;
export const CAR_PAINT_MATERIAL = 'Convertible painted panels';
/** Audited source faces -X; the theater screen is -Z in car-local space. */
export const DRIVE_IN_CAR_YAW = -Math.PI / 2;
/** Loaded mesh support measured at the retained driver x/z; fallback stays .86. */
export const DRIVE_IN_CUSHION_TOP = .76;

export interface DriveInCarArtHandle {
  readonly report: { cars: number; materials: number; colors: number[] };
  /** Restore source references after rendering and reflections have stopped. */
  dispose(): void;
}

const prepared = new WeakMap<THREE.Object3D, DriveInCarArtHandle>();

/** The source paint is red. Neutral atlas texels keep their authored colour. */
function paintedMaterial(source: THREE.MeshStandardMaterial, hex: number): THREE.MeshStandardMaterial {
  const material = source.clone();
  const previous = source.onBeforeCompile, previousKey = source.customProgramCacheKey();
  const color = new THREE.Color(hex);
  material.userData.driveInPaintColor = hex;
  material.userData.preserveAuthoredSurface = true;
  material.userData.islandPrintStrength = .28;
  material.color.setHex(0xffffff);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.driveInBodyPaint = { value: color };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 driveInBodyPaint;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 driveInSource = diffuseColor.rgb;
        float driveInRed = (driveInSource.r-max(driveInSource.g,driveInSource.b))/max(driveInSource.r,.0001);
        float driveInMask = smoothstep(.45,.68,driveInRed)*smoothstep(.002,.012,driveInSource.r);
        // Generated albedo contains lighting and dents. Keep a little of that
        // variation while letting the real panel normals/light define the paint.
        float driveInShade = mix(.72,clamp(driveInSource.r,.15,1.),.22);
        diffuseColor.rgb = mix(driveInSource,driveInBodyPaint*driveInShade,driveInMask);
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor,.29,driveInMask);
      `)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor,.10,driveInMask);
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 driveInPanelNormal = normal;
        #include <normal_fragment_maps>
        normal = normalize(mix(normal,driveInPanelNormal,driveInMask*.96));
      `);
  };
  // Colours are uniforms: all six variants use the same compiled shader.
  material.customProgramCacheKey = () => previousKey + ':drive-in-paint-v2-polished';
  return material;
}

/** One source geometry/atlas, six paint colours; tyres/chrome/leather stay intact. */
export function applyDriveInCarArt(scene: THREE.Object3D): DriveInCarArtHandle {
  const cached = prepared.get(scene);
  if (cached) return cached;
  const variants = new Map<THREE.MeshStandardMaterial, Map<number, THREE.MeshStandardMaterial>>();
  const restored: Array<{ mesh: THREE.Mesh; before: THREE.Material | THREE.Material[] }> = [];
  const cars = new Set<THREE.Object3D>(), colors = new Set<number>();
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.environmentImported !== true) return;
    let car: THREE.Object3D | null = mesh;
    while (car && !Number.isInteger(car.userData.driveInPaint)) car = car.parent;
    if (!car) return;
    const hex = car.userData.driveInPaint as number;
    const before = mesh.material;
    let changed = false;
    const next = (Array.isArray(before) ? before : [before]).map(source => {
      const standard = source as THREE.MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial || (source.name !== CAR_PAINT_MATERIAL && source.userData.carPaint !== true)) return source;
      let byColor = variants.get(standard);
      if (!byColor) { byColor = new Map(); variants.set(standard, byColor); }
      let material = byColor.get(hex);
      if (!material) { material = paintedMaterial(standard, hex); byColor.set(hex, material); }
      changed = true;
      return material;
    });
    if (!changed) return;
    restored.push({ mesh, before });
    mesh.material = Array.isArray(before) ? next : next[0];
    cars.add(car); colors.add(hex);
  });
  let disposed = false;
  const handle: DriveInCarArtHandle = {
    report: { cars: cars.size, materials: [...variants.values()].reduce((n, byColor) => n + byColor.size, 0), colors: [...colors] },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { mesh, before } of restored) mesh.material = before;
      for (const byColor of variants.values()) for (const material of byColor.values()) material.dispose();
      prepared.delete(scene);
    },
  };
  prepared.set(scene, handle);
  return handle;
}
