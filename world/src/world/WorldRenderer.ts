import * as THREE from 'three';
import { installLightEarlyOut } from './LightLoop';
import { installCutawayLens } from './CutawayLens';

interface WorldRendererOptions {
  canvas: HTMLCanvasElement;
  normalGraphics: boolean;
  pixelRatio: number;
  checkShaderErrors: boolean;
  inactiveClipPlane: THREE.Plane;
}

/** One GPU context for scenery, public video apertures, avatars and XR. */
export function createWorldRenderer(
  options: WorldRendererOptions,
  create: (parameters: THREE.WebGLRendererParameters) => THREE.WebGLRenderer =
    (parameters) => new THREE.WebGLRenderer(parameters),
): THREE.WebGLRenderer {
  // Before anything compiles: every lit shader is built from the patched chunk.
  installLightEarlyOut();
  installCutawayLens();
  const renderer = create({
    canvas: options.canvas, alpha: true,
    antialias: options.normalGraphics, powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.debug.checkShaderErrors = options.checkShaderErrors;
  renderer.shadowMap.enabled = options.normalGraphics;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(options.pixelRatio);
  renderer.clippingPlanes = [options.inactiveClipPlane];
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFramebufferScaleFactor(0.78);
  renderer.xr.setFoveation(0.7);
  return renderer;
}
