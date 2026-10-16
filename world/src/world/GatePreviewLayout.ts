import * as THREE from 'three';
import { ISLAND } from './CoastalTerrain';
import { PLANET } from './PlanetCurve';

export interface GatePreviewRect { x: number; y: number; width: number; height: number }
export interface GatePreviewFrame {
  width: number;
  height: number;
  pixelRatio: number;
  elapsed: number;
  yaw: number;
  /** Full studio viewport; clipping must not change the avatar's projection. */
  avatarViewport?: GatePreviewRect;
  avatar?: GatePreviewRect;
  entry?: number;
  entryTarget?: number;
  entryAvatarReady?: boolean;
  entryGraphicsMode?: 'normal' | 'lite';
}

export interface GatePreviewCameraSnapshot {
  position: [number, number, number];
  fov: number;
}

export interface GateEntryCameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  near: number;
  far: number;
}

export function gateAerialTarget(): THREE.Vector3 {
  return new THREE.Vector3((ISLAND.west + ISLAND.east) / 2, PLANET.on ? -PLANET.radius : -12,
    (ISLAND.north + ISLAND.south) / 2);
}

/** One smooth approach, driven only by completed load work. */
export function blendGateEntryCamera(camera: THREE.PerspectiveCamera, from: GateEntryCameraPose, to: GateEntryCameraPose, progress: number): void {
  const p = Math.max(0, Math.min(1, progress));
  const amount = p * p * (3 - 2 * p);
  camera.position.lerpVectors(from.position, to.position, amount);
  camera.lookAt(new THREE.Vector3().lerpVectors(from.target, to.target, amount));
  camera.fov = THREE.MathUtils.lerp(from.fov, to.fov, amount);
  camera.near = THREE.MathUtils.lerp(from.near, to.near, amount);
  camera.far = THREE.MathUtils.lerp(from.far, to.far, amount);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** Keep a translated studio view full size, even as its visible crop narrows. */
export function gateAvatarViewport(viewport: GatePreviewRect, region: GatePreviewRect): GatePreviewRect {
  return { x: region.x - viewport.x, y: viewport.height - (region.y - viewport.y + region.height), width: region.width, height: region.height };
}

/** Keep the complete curved ground visible, including the actual ocean sphere. */
export function fitGateAerialCamera(camera: THREE.PerspectiveCamera, aspect: number, elapsed: number): void {
  camera.aspect = Math.max(.2, aspect);
  camera.fov = 46;
  const centre = gateAerialTarget();
  const direction = new THREE.Vector3(.38 + Math.sin(elapsed * .018) * .055, 1.32, .66).normalize();
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  // Fitting only the coastline cuts off the rounded ocean below it. Fit the
  // real planet, with a small allowance for buildings, so its whole silhouette
  // remains visible in desktop and portrait windows as the viewpoint drifts.
  const radius = PLANET.on ? PLANET.radius + 24
    : Math.hypot((ISLAND.east - ISLAND.west) / 2, (ISLAND.north - ISLAND.south) / 2, 27);
  const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.08;
  camera.far = Math.max(2000, distance + radius * 2);
  camera.position.copy(centre).addScaledVector(direction, distance);
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** The avatar stays fully visible in a narrow column and in shorter windows. */
export function fitGateAvatarCamera(camera: THREE.PerspectiveCamera, width: number, height: number): void {
  camera.aspect = Math.max(.2, width / Math.max(height, 1));
  camera.fov = 32;
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const distance = Math.max(2.05 / Math.tan(vertical), 1.18 / (Math.tan(vertical) * camera.aspect));
  camera.position.set(0, 1.72, distance);
  camera.lookAt(0, 1.72, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** Browser rectangles are top-left based; Three's scissor is bottom-left. */
export function gateAvatarScissor(viewport: GatePreviewRect, region: GatePreviewRect): GatePreviewRect | undefined {
  const left = Math.max(viewport.x, region.x), top = Math.max(viewport.y, region.y);
  const right = Math.min(viewport.x + viewport.width, region.x + region.width);
  const bottom = Math.min(viewport.y + viewport.height, region.y + region.height);
  if (right - left < 2 || bottom - top < 2) return undefined;
  return { x: left - viewport.x, y: viewport.height - (bottom - viewport.y), width: right - left, height: bottom - top };
}
