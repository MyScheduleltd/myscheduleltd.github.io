import * as THREE from 'three';

/**
 * Tier one of the art direction: the pass that makes the world look used.
 *
 * Three things, and none of them touch a single mesh:
 *
 *  - **Flat shading.** Normals stop being averaged across corners, so a box
 *    reads as a box rather than a soft plastic object. This is most of the
 *    difference on its own.
 *  - **Posterised colour.** The final colour is quantised to a small number of
 *    steps, so smooth gradients break into bands the way a low colour depth
 *    makes them.
 *  - **Ordered dither.** A 4x4 Bayer threshold is added before quantising, so
 *    the bands are broken up by a fixed screen-space pattern instead of a hard
 *    edge. This is what reads as grain rather than as banding.
 *
 * Deliberately not here: vertex snapping and affine texture warping. Those are
 * the console's broken-hardware tics — they are what make a thing look like one
 * particular machine, and they are the two that read as a bug to anybody who
 * does not know the reference. The brief was "not clean", not "1998".
 *
 * The work is done by patching each material's fragment shader after its colour
 * space conversion, which is where the colour is finally in display space —
 * quantising anywhere earlier posterises light values rather than pixels, and
 * looks wrong. No render target and no post-processing pass: this world
 * composites a CSS3D layer and a second scissored renderer over the main one,
 * and a full-screen pass would have to be threaded through both.
 */

/**
 * Shared by every patched material, so the whole world dials together from one
 * place rather than needing a walk of the scene per change.
 */
export const WORN_UNIFORMS = {
  uWornAmount: { value: 0 },
  uWornSteps: { value: 10 },
};

/**
 * A 4x4 ordered dither built from two nested 2x2 matrices, which is far
 * cheaper than indexing a lookup array in GLSL.
 */
const WORN_FRAGMENT = /* glsl */ `
  #ifdef WORN_STYLE
  {
    vec2 wornCoord = gl_FragCoord.xy;
    vec2 wornCell = floor(wornCoord);
    float wornLow = fract(wornCell.x * 0.5 + wornCell.y * wornCell.y * 0.75);
    vec2 wornHalf = floor(wornCoord * 0.5);
    float wornHigh = fract(wornHalf.x * 0.5 + wornHalf.y * wornHalf.y * 0.75);
    float wornThreshold = wornHigh * 0.25 + wornLow - 0.5;

    float wornSteps = max(uWornSteps, 2.0);
    vec3 wornStepped = floor(gl_FragColor.rgb * wornSteps + wornThreshold) / wornSteps;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, clamp(wornStepped, 0.0, 1.0), uWornAmount);
  }
  #endif
`;

type PatchableMaterial = THREE.Material & {
  flatShading?: boolean;
  // Only the shader materials declare this, but every material that reaches
  // the patch below is one that compiles a program, so it is always there.
  defines?: Record<string, unknown>;
  userData: Record<string, unknown>;
};

function patchMaterial(material: PatchableMaterial): void {
  if (material.userData.wornPatched === true) return;
  material.userData.wornPatched = true;

  // Only lit materials have normals to flatten. A basic material is unshaded,
  // so flattening it would do nothing but force a needless recompile.
  const lit = material instanceof THREE.MeshStandardMaterial
    || material instanceof THREE.MeshPhysicalMaterial;
  if (lit) {
    material.flatShading = true;
    material.userData.wornFlattened = true;
  }

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uWornAmount = WORN_UNIFORMS.uWornAmount;
    shader.uniforms.uWornSteps = WORN_UNIFORMS.uWornSteps;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform float uWornAmount;\nuniform float uWornSteps;\nvoid main() {',
      )
      // After the colour space conversion the value is what the screen will
      // actually show, which is the only place quantising means anything.
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${WORN_FRAGMENT}`);
  };
  material.defines = { ...(material.defines ?? {}), WORN_STYLE: '' };
  material.needsUpdate = true;
}

/**
 * Walks the scene and patches everything in it. Safe to call again — meshes
 * built after the first call are picked up, and anything already patched is
 * left alone.
 */
export function applyWornStyle(scene: THREE.Object3D): number {
  let patched = 0;
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const target = material as PatchableMaterial;
      if (target.userData.wornPatched === true) continue;
      patchMaterial(target);
      patched += 1;
    }
  });
  return patched;
}

/**
 * How much of the effect to mix in, and how coarse the colour depth is.
 * Amount 0 leaves the world exactly as it was; 1 is the full treatment. Steps
 * is the number of levels per channel — eight is heavy, sixteen is subtle.
 */
export function setWornStyle(amount: number, steps?: number): void {
  WORN_UNIFORMS.uWornAmount.value = THREE.MathUtils.clamp(amount, 0, 1);
  if (steps !== undefined) WORN_UNIFORMS.uWornSteps.value = Math.max(2, steps);
}

export function wornStyleSettings(): { amount: number; steps: number } {
  return {
    amount: WORN_UNIFORMS.uWornAmount.value,
    steps: WORN_UNIFORMS.uWornSteps.value,
  };
}
