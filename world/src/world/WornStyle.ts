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
  uWornGrain: { value: 0 },
};

/**
 * A 4x4 ordered dither built from two nested 2x2 matrices, which is far
 * cheaper than indexing a lookup array in GLSL.
 */
/**
 * Surface grain, computed from the fragment's position in the world.
 *
 * This is the answer to the honest flaw in the shading pass: a screen-space
 * dither does not stick to anything, so the grain sits still while the wall
 * slides underneath it. Sampling noise at the world position instead means the
 * speckle belongs to the wall — walk past and it travels, exactly as a painted
 * texture would, without a single texture being authored or a UV being unwrapped.
 *
 * Two scales, because one is never enough to read as a material. A hard cell
 * hash at high frequency is the aggregate — the fine tooth of concrete or the
 * chip in asphalt. A smooth octave at roughly two metres is the staining: the
 * damp patch, the run under a sill, the place the sun has bleached. Together
 * they do most of what a small painted texture would, and they cost no memory.
 */
const WORN_NOISE = /* glsl */ `
  varying vec3 vWornWorld;
  uniform float uWornAmount;
  uniform float uWornSteps;
  uniform float uWornGrain;

  float wornHash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
  }

  float wornSmoothNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n00 = mix(wornHash(i + vec3(0.0, 0.0, 0.0)), wornHash(i + vec3(1.0, 0.0, 0.0)), f.x);
    float n10 = mix(wornHash(i + vec3(0.0, 1.0, 0.0)), wornHash(i + vec3(1.0, 1.0, 0.0)), f.x);
    float n01 = mix(wornHash(i + vec3(0.0, 0.0, 1.0)), wornHash(i + vec3(1.0, 0.0, 1.0)), f.x);
    float n11 = mix(wornHash(i + vec3(0.0, 1.0, 1.0)), wornHash(i + vec3(1.0, 1.0, 1.0)), f.x);
    return mix(mix(n00, n10, f.y), mix(n01, n11, f.y), f.z);
  }
`;

const WORN_FRAGMENT = /* glsl */ `
  #ifdef WORN_STYLE
  {
    // Surface first, so the dither below quantises a grained colour rather
    // than laying grain over a quantised one.
    #ifndef WORN_NO_GRAIN
    if (uWornGrain > 0.0) {
      // Centred on zero, and added rather than multiplied.
      //
      // The first version got this wrong in a way that was guaranteed to read
      // as filth: each of the four scales ran from about 0.7 up to 1.1, so
      // every one of them darkened on average, and multiplying four together
      // compounded that into deep blotches. Darkening a surface in patches is
      // the definition of painting dirt onto it. A surface that is merely made
      // of something varies *both ways* around its own colour — some grains
      // catch the light, some sit in shadow — and the average stays where the
      // colour was.
      float aggregate = wornHash(floor(vWornWorld * 38.0)) - 0.5;
      float speckle = wornHash(floor(vWornWorld * 12.0 + 3.7)) - 0.5;
      float runs = wornSmoothNoise(vec3(vWornWorld.x * 3.4, vWornWorld.y * 0.32, vWornWorld.z * 3.4)) - 0.5;
      float blotch = wornSmoothNoise(vWornWorld * 0.52) - 0.5;
      float variation = aggregate * 0.11 + speckle * 0.05 + runs * 0.05 + blotch * 0.05;
      gl_FragColor.rgb = clamp(gl_FragColor.rgb * (1.0 + variation * uWornGrain), 0.0, 1.0);
    }
    #endif

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
    shader.uniforms.uWornGrain = WORN_UNIFORMS.uWornGrain;
    // The world position has to be carried through from the vertex stage;
    // nothing in the standard chunks hands it to the fragment shader unless a
    // feature that needs it happens to be switched on.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWornWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vWornWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORN_NOISE}`)
      // After the colour space conversion the value is what the screen will
      // actually show, which is the only place quantising means anything.
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${WORN_FRAGMENT}`);
  };
  material.defines = { ...(material.defines ?? {}), WORN_STYLE: '' };
  // A face is not a wall. Skin and hair take the shading and the dither but
  // never the surface grain, because grime on a person reads as unwashed
  // rather than as weathered.
  if (material.userData.wornNoGrain === true) material.defines.WORN_NO_GRAIN = '';
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
export function setWornStyle(amount: number, steps?: number, grain?: number): void {
  WORN_UNIFORMS.uWornAmount.value = THREE.MathUtils.clamp(amount, 0, 1);
  if (steps !== undefined) WORN_UNIFORMS.uWornSteps.value = Math.max(2, steps);
  if (grain !== undefined) WORN_UNIFORMS.uWornGrain.value = THREE.MathUtils.clamp(grain, 0, 2);
}

export function wornStyleSettings(): { amount: number; steps: number; grain: number } {
  return {
    amount: WORN_UNIFORMS.uWornAmount.value,
    steps: WORN_UNIFORMS.uWornSteps.value,
    grain: WORN_UNIFORMS.uWornGrain.value,
  };
}

/**
 * Whether the geometry is restyled as well as the shading.
 *
 * Read from the URL rather than passed in, because the avatar rigs are built
 * while the world is being constructed — long before the UI gets a chance to
 * look at the query string. The world already reads `cycleMinute` the same way.
 *
 * On whenever the worn flag is present, and turned off again with `&meshes=0`
 * so the shading pass can be judged on its own.
 */
export function wornMeshesRequested(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('worn') === null) return false;
  return params.get('meshes') !== '0';
}

/**
 * A four-sided tapered prism — the low-poly workhorse.
 *
 * A box cannot taper, and a taper is most of what separates a figure from a
 * stack of blocks. A cylinder of four radial segments is a box whose top and
 * bottom can differ, which is exactly the primitive wanted, and it facets
 * properly under flat shading. Turned an eighth so its faces sit square to the
 * viewer rather than presenting a corner.
 */
export function taperedPrism(
  topWidth: number,
  bottomWidth: number,
  height: number,
  depthRatio = 1,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(topWidth, bottomWidth, height, 4, 1);
  geometry.rotateY(Math.PI / 4);
  if (depthRatio !== 1) geometry.scale(1, 1, depthRatio);
  return geometry;
}
