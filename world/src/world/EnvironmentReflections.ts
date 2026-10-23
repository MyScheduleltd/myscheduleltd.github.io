import * as THREE from 'three';

export interface EnvironmentReflectionOptions {
  faceSize?: 32 | 64;
  intensity?: number;
}

export interface EnvironmentReflectionReport {
  state: 'unused' | 'ready' | 'disposed';
  meshes: number;
  materials: number;
  clonedMaterials: number;
  faceSize: number;
  sourceTexels: number;
  /** Source faces and the PMREM scratch atlas are released after preparation. */
  sourceBytes: number;
  atlasTexels: number;
  /** Retained RGBA atlas estimate, excluding driver overhead. */
  estimatedBytes: number;
  preparationPeakBytes: number;
  intensity: number;
}

export interface EnvironmentReflectionHandle {
  readonly texture: THREE.Texture | null;
  readonly report: EnvironmentReflectionReport;
  /** Stop rendering first. Restore authored values, then release the one atlas. */
  dispose(): void;
}

type Prefilter = Pick<THREE.PMREMGenerator, 'fromCubemap' | 'dispose'>;
type PrefilterFactory = (renderer: THREE.WebGLRenderer) => Prefilter;
const prepared = new WeakMap<THREE.Object3D, WeakMap<THREE.WebGLRenderer, EnvironmentReflectionHandle>>();

/** Pixel-centred cube directions meet at the same continuous hemisphere. */
function cubeDirection(face: number, u: number, v: number): THREE.Vector3 {
  return new THREE.Vector3(...([
    [1, -v, -u], [-1, -v, u], [u, 1, v],
    [u, -1, -v], [u, -v, 1], [-u, -v, -1],
  ][face] as [number, number, number])).normalize();
}

/** No canvas, external image, extra light or scene render is needed. */
function coastalReflectionSource(size: number): { cube: THREE.CubeTexture; faces: THREE.DataTexture[] } {
  const horizon = [.57, .59, .59], sky = [.34, .40, .46], ground = [.21, .20, .18];
  const keyDirection = new THREE.Vector3(-.45, .72, .52).normalize();
  const faces: THREE.DataTexture[] = [];
  for (let face = 0; face < 6; face++) {
    const pixels = new Uint8Array(size * size * 4);
    for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
      const direction = cubeDirection(face, (column + .5) / size * 2 - 1, (row + .5) / size * 2 - 1);
      const above = direction.y >= 0;
      const amount = above ? Math.pow(direction.y, .65) : Math.min(1, -direction.y * 1.8);
      const destination = above ? sky : ground;
      // Broad, low-contrast coastal daylight gives bronze a readable highlight
      // without inventing a visible sun, studio strip or new light source.
      const key = Math.exp((direction.dot(keyDirection) - 1) / .32);
      const offset = (row * size + column) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const value = THREE.MathUtils.lerp(horizon[channel], destination[channel], amount) + key * [.16, .15, .13][channel];
        pixels[offset + channel] = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
      }
      pixels[offset + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    faces.push(texture);
  }
  const cube = new THREE.CubeTexture(faces);
  cube.name = 'Temporary neutral coastal reflection source';
  cube.colorSpace = THREE.LinearSRGBColorSpace;
  cube.type = THREE.UnsignedByteType;
  cube.format = THREE.RGBAFormat;
  cube.generateMipmaps = false;
  cube.minFilter = THREE.LinearFilter;
  cube.magFilter = THREE.LinearFilter;
  cube.needsUpdate = true;
  return { cube, faces };
}

function importedMesh(object: THREE.Object3D): object is THREE.Mesh {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh || mesh.userData.environmentImported !== true || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  for (let ancestor: THREE.Object3D | null = mesh; ancestor; ancestor = ancestor.parent) {
    if (ancestor.userData.environmentExclude || ancestor.userData.dynamic || ancestor.userData.coastalCharacter !== undefined) return false;
  }
  return true;
}

/**
 * Prepare once under admission loading, after the four imported art kinds have
 * finished attaching and before static batching/shader warmup. The atlas is
 * assigned only to explicitly tagged imported meshes; scene.environment and
 * every original world/character material remain unchanged. Repeated calls for
 * the same root and renderer reuse the existing handle.
 *
 * The optional factory permits lifecycle verification without a WebGL context.
 */
export function prepareEnvironmentReflections(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
  options: EnvironmentReflectionOptions = {},
  createPrefilter: PrefilterFactory = activeRenderer => new THREE.PMREMGenerator(activeRenderer),
): EnvironmentReflectionHandle {
  const cached = prepared.get(root)?.get(renderer);
  if (cached) return cached;
  const faceSize = options.faceSize ?? 32;
  if (faceSize !== 32 && faceSize !== 64) throw new Error('Environment reflection faces must be 32 or 64 pixels');
  const requestedIntensity = options.intensity ?? .6;
  if (!Number.isFinite(requestedIntensity) || requestedIntensity < 0 || requestedIntensity > 2)
    throw new Error('Environment reflection intensity must be between 0 and 2');

  const targets: THREE.Mesh[] = [], protectedMaterials = new Set<THREE.Material>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (importedMesh(object)) targets.push(object);
    else for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) protectedMaterials.add(material);
  });
  const sources = new Set<THREE.MeshStandardMaterial>();
  for (const mesh of targets) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial && material.userData.preserveAuthoredSurface === true)
      sources.add(material as THREE.MeshStandardMaterial);
  const report: EnvironmentReflectionReport = {
    state: 'unused', meshes: 0, materials: 0, clonedMaterials: 0, faceSize,
    sourceTexels: 0, sourceBytes: 0, atlasTexels: 0, estimatedBytes: 0, preparationPeakBytes: 0, intensity: requestedIntensity,
  };
  if (!sources.size) return { texture: null, report, dispose() { report.state = 'disposed'; } };

  const { cube, faces } = coastalReflectionSource(faceSize);
  let generator: Prefilter | undefined, target: THREE.WebGLRenderTarget;
  try {
    generator = createPrefilter(renderer);
    target = generator.fromCubemap(cube);
  } finally {
    cube.dispose();
    faces.forEach(face => face.dispose());
    generator?.dispose();
  }
  const texture = target.texture;
  texture.name = 'Shared imported environment coastal PMREM';
  texture.userData.environmentReflection = true;
  report.state = 'ready';
  report.sourceTexels = 6 * faceSize * faceSize;
  report.sourceBytes = report.sourceTexels * 4;
  report.atlasTexels = target.width * target.height;
  const bytesPerTexel = texture.type === THREE.FloatType ? 16 : texture.type === THREE.HalfFloatType ? 8 : 4;
  report.estimatedBytes = report.atlasTexels * bytesPerTexel;
  report.preparationPeakBytes = report.sourceBytes + report.estimatedBytes * 2;

  const replacements = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const saved = new Map<THREE.MeshStandardMaterial, { map: THREE.Texture | null; intensity: number }>();
  const ownedClones = new Set<THREE.Material>();
  for (const source of sources) {
    // A shared source outside the imported branch is protected even if an
    // embedding caller accidentally reused it for an older world object.
    const material = protectedMaterials.has(source) ? source.clone() : source;
    if (material !== source) ownedClones.add(material);
    saved.set(material, { map: material.envMap, intensity: material.envMapIntensity });
    material.envMap = texture;
    material.envMapIntensity = requestedIntensity;
    material.needsUpdate = true;
    replacements.set(source, material);
  }
  const restored: Array<{ mesh: THREE.Mesh; before: THREE.Material | THREE.Material[]; after: THREE.Material | THREE.Material[] }> = [];
  for (const mesh of targets) {
    const before = mesh.material;
    const materials = Array.isArray(before) ? before : [before];
    if (!materials.some(material => replacements.has(material))) continue;
    const next = materials.map(material => replacements.get(material) ?? material);
    mesh.material = Array.isArray(before) ? next : next[0];
    restored.push({ mesh, before, after: mesh.material });
  }
  report.meshes = restored.length;
  report.materials = replacements.size;
  report.clonedMaterials = ownedClones.size;
  const handle: EnvironmentReflectionHandle = {
    texture, report,
    dispose() {
      if (report.state === 'disposed') return;
      for (const [material, previous] of saved) if (material.envMap === texture) {
        material.envMap = previous.map; material.envMapIntensity = previous.intensity; material.needsUpdate = true;
      }
      for (const { mesh, before, after } of restored) if (mesh.material === after) mesh.material = before;
      for (const material of ownedClones) material.dispose();
      target.dispose();
      report.state = 'disposed';
      prepared.get(root)?.delete(renderer);
    },
  };
  let byRenderer = prepared.get(root);
  if (!byRenderer) { byRenderer = new WeakMap(); prepared.set(root, byRenderer); }
  byRenderer.set(renderer, handle);
  return handle;
}
