import * as THREE from 'three';

const ATLAS_WIDTH = 512, ATLAS_HEIGHT = 128, CELL_WIDTH = 128, CELL_HEIGHT = 64;
const PLATE_WIDTH = 1.82, PLATE_HEIGHT = .40;
const FRAME_WIDTH = 1.88, FRAME_HEIGHT = .46, FRAME_DEPTH = .06;
/** Car-local +Z is rear; both mounts remain inside the retained bumper envelope. */
export const DRIVE_IN_PLATE_MOUNTS = {
  imported: { y: 1.03, frameZ: 2.765, faceZ: 2.800 },
  fallback: { y: .91, frameZ: 2.8375, faceZ: 2.8725 },
} as const;

export interface DriveInLicensePlateOptions {
  /** Default: numbered plates also remain available when the GLB falls back. */
  skipFallbacks?: boolean;
}

export interface DriveInLicensePlateReport {
  cars: number;
  importedCars: number;
  fallbackCars: number;
  skippedFallbacks: number;
  invalidNumbers: number;
  duplicateNumbers: number[];
  numbers: number[];
  triangles: number;
  textureTexels: number;
  estimatedTextureBytesWithMips: number;
  mounts: Array<{ number: number; source: 'imported' | 'fallback'; y: number; frameZ: number; faceZ: number }>;
}

export interface DriveInLicensePlateHandle {
  readonly report: DriveInLicensePlateReport;
  /** Stop rendering first. Batched plate pixels belong to the ending scene. */
  dispose(): void;
}

const prepared = new WeakMap<THREE.Object3D, DriveInLicensePlateHandle>();

function hasImportedCar(car: THREE.Object3D): boolean {
  let imported = false;
  car.traverse(object => {
    if (!(object as THREE.Mesh).isMesh || object.userData.environmentImported !== true) return;
    // Ignore the car container's own visibility: isolated review viewers may
    // temporarily hide the whole source while comparing it to the original.
    for (let parent: THREE.Object3D | null = object; parent && parent !== car; parent = parent.parent)
      if (!parent.visible) return;
    imported = true;
  });
  return imported;
}

function numberAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = ATLAS_WIDTH; canvas.height = ATLAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot prepare drive-in plate numbers without a canvas context');
  // Every cell is opaque. The broad cream field covers the generated source
  // lettering; a full housing covers its perimeter, including oblique views.
  context.fillStyle = '#fff0ca'; context.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = '900 58px sans-serif';
  for (let number = 1; number <= 6; number++) {
    const column = (number - 1) % 4, row = Math.floor((number - 1) / 4);
    const x = column * CELL_WIDTH, y = row * CELL_HEIGHT;
    context.fillStyle = '#243248';
    context.fillRect(x + 5, y + 4, CELL_WIDTH - 10, 2); context.fillRect(x + 5, y + CELL_HEIGHT - 6, CELL_WIDTH - 10, 2);
    context.fillRect(x + 5, y + 4, 2, CELL_HEIGHT - 8); context.fillRect(x + CELL_WIDTH - 7, y + 4, 2, CELL_HEIGHT - 8);
    // The physical plate is wider than its atlas cell. Compress the glyph's
    // canvas advance so the world-space digit retains normal proportions.
    context.fillText(String(number), x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2 + 1, CELL_WIDTH * .12);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'Drive-in rear plate numbers 1–6'; texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  return texture;
}

function numberFace(number: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(PLATE_WIDTH, PLATE_HEIGHT);
  const uv = geometry.getAttribute('uv');
  const column = (number - 1) % 4, row = Math.floor((number - 1) / 4), gutter = 2;
  for (let vertex = 0; vertex < uv.count; vertex++) {
    // Canvas origin is top-left; texture UV origin is bottom-left. Keep the
    // numerals upright, in the proper atlas cell, with a mip/filter gutter.
    const x = column * CELL_WIDTH + gutter + uv.getX(vertex) * (CELL_WIDTH - gutter * 2);
    const y = (row + 1) * CELL_HEIGHT - gutter - uv.getY(vertex) * (CELL_HEIGHT - gutter * 2);
    uv.setXY(vertex, x / ATLAS_WIDTH, 1 - y / ATLAS_HEIGHT);
  }
  return geometry;
}

/**
 * Read car.userData.driveInSeatNumber (integer 1…6); do not infer numbering
 * from generation order or rename any seat. Call once after imported models
 * settle and before planet subdivision, batching and GPU preparation. The
 * caller supplies left-to-right back-row numbers 1–3, then front-row 4–6.
 *
 * If a model failed, its original procedural car receives the same number on
 * a separate mount fitted to that boot. skipFallbacks is for an untouched-old
 * art comparison. Neither path changes collision, seating, lights or source
 * materials. One atlas/material and one housing material remain shared.
 */
export function applyDriveInLicensePlates(
  scene: THREE.Object3D,
  options: DriveInLicensePlateOptions = {},
): DriveInLicensePlateHandle {
  const previous = prepared.get(scene); if (previous) return previous;
  const report: DriveInLicensePlateReport = {
    cars: 0, importedCars: 0, fallbackCars: 0, skippedFallbacks: 0, invalidNumbers: 0,
    duplicateNumbers: [], numbers: [], triangles: 0, textureTexels: 0, estimatedTextureBytesWithMips: 0, mounts: [],
  };
  const cars: Array<{ car: THREE.Object3D; number: number; imported: boolean }> = [], used = new Set<number>();
  scene.traverse(car => {
    const value = car.userData.driveInSeatNumber;
    if (value === undefined) return;
    if (!Number.isInteger(value) || value < 1 || value > 6) { report.invalidNumbers++; return; }
    if (used.has(value)) { report.duplicateNumbers.push(value); return; }
    const imported = hasImportedCar(car);
    if (!imported && options.skipFallbacks) { report.skippedFallbacks++; return; }
    used.add(value); cars.push({ car, number: value, imported });
  });
  if (!cars.length) return { report, dispose() {} };

  const texture = numberAtlas();
  const faceMaterial = new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: .69, metalness: .04 });
  faceMaterial.name = 'Drive-in numbered rear plates'; faceMaterial.userData.preserveAuthoredSurface = true;
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x263038, roughness: .58, metalness: .55 });
  frameMaterial.name = 'Drive-in rear plate housings'; frameMaterial.userData.preserveAuthoredSurface = true;
  const housing = new THREE.BoxGeometry(FRAME_WIDTH, FRAME_HEIGHT, FRAME_DEPTH), faces = new Map<number, THREE.PlaneGeometry>();
  const groups: THREE.Group[] = [];
  const geometries = new Set<THREE.BufferGeometry>([housing]);
  const releasedGeometries = new Set<THREE.BufferGeometry>();
  housing.addEventListener('dispose', () => releasedGeometries.add(housing));
  for (const { car, number, imported } of cars) {
    const mount = imported ? DRIVE_IN_PLATE_MOUNTS.imported : DRIVE_IN_PLATE_MOUNTS.fallback;
    const group = new THREE.Group(); group.name = `Drive-in rear number ${number}`;
    group.userData.environmentExclude = true; group.userData.driveInLicensePlate = true;
    // Store only plate metadata here. Copying driveInSeatNumber onto children
    // would make a later traversal mistake a plate for another car.
    group.userData.plateNumber = number;
    const frame = new THREE.Mesh(housing, frameMaterial); frame.position.set(0, mount.y, mount.frameZ);
    let geometry = faces.get(number);
    if (!geometry) {
      geometry = numberFace(number); faces.set(number, geometry); geometries.add(geometry);
      const owned = geometry; geometry.addEventListener('dispose', () => releasedGeometries.add(owned));
    }
    const face = new THREE.Mesh(geometry, faceMaterial); face.position.set(0, mount.y, mount.faceZ);
    frame.name = 'Opaque source-plate cover'; face.name = `Rear license number ${number}`;
    for (const mesh of [frame, face]) {
      mesh.userData.wornNoMasonry = true; mesh.userData.wornNoGrain = true;
      mesh.userData.driveInLicensePlate = true; mesh.receiveShadow = true; mesh.layers.enable(1);
      group.add(mesh);
    }
    car.add(group); groups.push(group);
    report.cars++; report[imported ? 'importedCars' : 'fallbackCars']++;
    report.numbers.push(number); report.triangles += 14;
    report.mounts.push({ number, source: imported ? 'imported' : 'fallback', ...mount });
  }
  report.textureTexels = ATLAS_WIDTH * ATLAS_HEIGHT;
  report.estimatedTextureBytesWithMips = Math.ceil(report.textureTexels * 4 * 4 / 3);
  let disposed = false;
  const handle: DriveInLicensePlateHandle = {
    report,
    dispose() {
      if (disposed) return; disposed = true;
      for (const group of groups) group.removeFromParent();
      // StaticBatch may already have released these originals after baking
      // world-space copies. Do not issue a second release for those resources.
      for (const geometry of geometries) if (!releasedGeometries.has(geometry)) geometry.dispose();
      faceMaterial.dispose(); frameMaterial.dispose(); texture.dispose(); texture.image = null;
      prepared.delete(scene);
    },
  };
  prepared.set(scene, handle);
  return handle;
}
