import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
/**
 * Whether the shader takes the cheap road: two hashes per fragment instead of
 * eighteen. Set from the graphics mode before the pass runs, because it is a
 * compile-time define rather than a uniform — a branch a phone still pays for
 * is not a saving.
 */
let wornCheap = false;

export function setWornCheap(cheap: boolean): void {
  wornCheap = cheap;
}

export const WORN_UNIFORMS = {
  uWornAmount: { value: 0 },
  uWornSteps: { value: 10 },
  uWornGrain: { value: 0 },
  uWornTexture: { value: 0 },
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
  #ifdef WORN_MASONRY
  varying vec3 vWornNormal;
  #endif
  uniform float uWornAmount;
  uniform float uWornSteps;
  uniform float uWornGrain;
  uniform float uWornTexture;

  // No sin in here, and that is the point.
  //
  // The obvious hash is fract(sin(dot(p, k)) * big), and it was costing a
  // transcendental per call — eighteen of them per fragment once the two smooth
  // octaves are counted, on every lit surface in the world. A desktop GPU
  // swallows that. A phone does not, and the place it showed was a screening,
  // where a large lit surface fills the view and the video decoder is already
  // competing for the same silicon.
  //
  // This one is multiplies and a fract. Same character, a fraction of the cost.
  float wornHash(vec3 p) {
    vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.13, 0.17));
    q *= 17.0;
    return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
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
      // The two smooth octaves are eight hashes each — sixteen of the eighteen
      // this shader used to run. They are the staining rather than the tooth:
      // the damp patch, the run under a sill. On a phone the tooth is what
      // reads at all, so the staining is what goes.
      #ifdef WORN_CHEAP
      float variation = aggregate * 0.13 + speckle * 0.06;
      #else
      float runs = wornSmoothNoise(vec3(vWornWorld.x * 3.4, vWornWorld.y * 0.32, vWornWorld.z * 3.4)) - 0.5;
      float blotch = wornSmoothNoise(vWornWorld * 0.52) - 0.5;
      float variation = aggregate * 0.11 + speckle * 0.05 + runs * 0.05 + blotch * 0.05;
      #endif
      gl_FragColor.rgb = clamp(gl_FragColor.rgb * (1.0 + variation * uWornGrain), 0.0, 1.0);
    }
    #endif

    // Courses, in world space and squared to the wall they are on.
    //
    // This is the half of the reference the world has none of. What carries a
    // PS2-era street is not its shading — that is soft and unremarkable — it is
    // that a wall is visibly made of something at the scale of a hand.
    //
    // Walls only, and that is the whole of it. The first cut put slabs on every
    // horizontal surface too, which meant courses on the road, on the red
    // carpet, on the sand and across the awnings. Masonry on a beach is not a
    // texture, it is a mistake — so the define is set per material, on building
    // -sized upright volumes and on nothing else.
    //
    // Projected on whichever way the face points, so the pattern lies flat on
    // the wall instead of running across it at an angle. There are no usable
    // UVs here to do it any other way: the world shares one unit cube between
    // every surface, stretched by scale, so a texture mapped the ordinary way
    // would be one tile smeared the length of a twenty-metre wall.
    #ifdef WORN_MASONRY
    if (uWornTexture > 0.0) {
      vec3 wornN = normalize(vWornNormal);
      // A building's roof and soffit are not masonry either, so the courses
      // fade out as the face turns to face the sky.
      float wornUpright = 1.0 - smoothstep(0.35, 0.62, abs(wornN.y));
      if (wornUpright > 0.0) {
        vec2 wornPlane = abs(wornN.x) > abs(wornN.z) ? vWornWorld.zy : vWornWorld.xy;
        float wornSeam = 0.0;
        float wornArris = 0.0;
        float wornDepth = 0.24;

        // Four ways of being built, so the Palace is not made of the same
        // stuff as the club. Which one a wall gets is fixed per material at
        // patch time — a wall cannot change what it is made of halfway up.
        #if WORN_MASONRY_KIND == 1
          // Concrete panel: tall storey-sized bays, thin crisp joints.
          vec2 wornCell = wornPlane / vec2(2.4, 3.6);
          vec2 wornEdge = abs(fract(wornCell) - 0.5);
          float wornJoint = min(0.5 - wornEdge.x, 0.5 - wornEdge.y);
          wornSeam = 1.0 - smoothstep(0.0, 0.03, wornJoint);
          wornArris = smoothstep(0.03, 0.06, wornJoint) * (1.0 - smoothstep(0.06, 0.1, wornJoint));
          wornDepth = 0.3;
        #elif WORN_MASONRY_KIND == 2
          // Corrugated sheet: vertical ribs only, no courses at all. Reads as
          // a shed or a lock-up rather than as something anybody laid by hand.
          float wornRib = abs(fract(wornPlane.x / 0.34) - 0.5);
          wornSeam = 1.0 - smoothstep(0.12, 0.5, wornRib);
          wornArris = smoothstep(0.0, 0.12, wornRib) * (1.0 - smoothstep(0.12, 0.26, wornRib));
          wornDepth = 0.17;
        #elif WORN_MASONRY_KIND == 3
          // Render on block: no joints, just the faint horizontal float lines
          // a plasterer leaves. Almost nothing, which is the point — a street
          // where every wall is emphatic has no quiet walls to set them off.
          float wornFloat = abs(fract(wornPlane.y / 2.9) - 0.5);
          wornSeam = (1.0 - smoothstep(0.0, 0.06, wornFloat)) * 0.5;
          wornDepth = 0.1;
        #else
          // Block courses: long and low, offset half a block row to row so it
          // never resolves into graph paper.
          vec2 wornCell = wornPlane / vec2(3.0, 1.6);
          wornCell.x += floor(wornCell.y) * 0.5;
          vec2 wornEdge = abs(fract(wornCell) - 0.5);
          float wornJoint = min(0.5 - wornEdge.x, 0.5 - wornEdge.y);
          wornSeam = 1.0 - smoothstep(0.0, 0.05, wornJoint);
          wornArris = smoothstep(0.05, 0.09, wornJoint) * (1.0 - smoothstep(0.09, 0.14, wornJoint));
        #endif

        // A joint is a dark line with a lighter arris beside it, which is what
        // makes it read as a recess rather than as a stripe painted on.
        gl_FragColor.rgb *= 1.0 + (wornArris * 0.05 - wornSeam * wornDepth) * uWornTexture * wornUpright;
      }
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

function patchMaterial(material: PatchableMaterial, masonry: number | false = false): void {
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
    shader.uniforms.uWornTexture = WORN_UNIFORMS.uWornTexture;
    // The world position has to be carried through from the vertex stage;
    // nothing in the standard chunks hands it to the fragment shader unless a
    // feature that needs it happens to be switched on.
    // The normal is only declared where it is actually used, and that is not
    // fussiness. `objectNormal` exists in the unlit vertex shader only under
    // USE_ENVMAP or USE_SKINNING, so writing to it unconditionally failed to
    // compile on every plain basic material in the world — which is every sign,
    // every marquee and the timetable. They did not look wrong. They were gone.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWornWorld;'
        + (masonry === false ? '' : '\nvarying vec3 vWornNormal;'),
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vWornWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        + (masonry === false ? '' : '\n  vWornNormal = mat3(modelMatrix) * objectNormal;'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORN_NOISE}`)
      // After the colour space conversion the value is what the screen will
      // actually show, which is the only place quantising means anything.
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${WORN_FRAGMENT}`);
  };
  // Surface detail needs a normal to know which way the plane faces, and only
  // a lit material carries one.
  material.defines = {
    ...(material.defines ?? {}),
    WORN_STYLE: '',
    ...(wornCheap ? { WORN_CHEAP: '' } : {}),
    ...(masonry === false ? {} : { WORN_MASONRY: '', WORN_MASONRY_KIND: String(masonry) }),
  };
  // A face is not a wall. Skin and hair take the shading and the dither but
  // never the surface grain, because grime on a person reads as unwashed
  // rather than as weathered.
  //
  // Neither is a sign. Everything unlit in this world is something meant to be
  // read or to glow — the marquees, the screens, the neon, the stall boards —
  // and a visitor has to be able to read them. Grime across lettering is the
  // one place where the style actively costs somebody something.
  const unlit = material instanceof THREE.MeshBasicMaterial;
  if (material.userData.wornNoGrain === true || unlit) material.defines.WORN_NO_GRAIN = '';
  material.needsUpdate = true;
}

/**
 * Walks the scene and patches everything in it. Safe to call again — meshes
 * built after the first call are picked up, and anything already patched is
 * left alone.
 */
export function applyWornStyle(
  scene: THREE.Object3D,
  /** Screens and their frames, which are manufactured objects and not masonry. */
  keepPlain: THREE.Box3[] = [],
  /** Interiors, each of which should be built of one thing throughout. */
  rooms: MasonryRoom[] = [],
): number {
  let patched = 0;
  // One masonry variant per source material, not one per wall. The world reuses
  // a handful of colours across hundreds of surfaces, so keying on the material
  // keeps the extra draw calls in the tens rather than the hundreds.
  const masonryVariants = new Map<string, PatchableMaterial>();

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material) return;

    if (mesh.isMesh && isMasonry(mesh, keepPlain)) {
      const source = mesh.material as PatchableMaterial;
      // Arrays are left alone: nothing in this world uses a multi-material
      // wall, and guessing which slot is the face would be a coin toss.
      if (!Array.isArray(mesh.material)) {
        // Which way a wall is built comes from where it stands, not from its
        // colour. Keying it on the material alone would have made every wall
        // of the same colour identical, which is the failure this is meant to
        // fix.
        const kind = masonryKind(mesh, rooms);
        const key = `${source.uuid}:${kind}`;
        let variant = masonryVariants.get(key);
        if (!variant) {
          variant = source.clone() as PatchableMaterial;
          // A clone carries the original's defines and userData, which would
          // hand it a `wornPatched` flag it has not earned and leave it with
          // the plain patch it was cloned from.
          variant.defines = {};
          variant.userData = { ...source.userData, wornPatched: false };
          patchMaterial(variant, kind);
          patched += 1;
          masonryVariants.set(key, variant);
        }
        mesh.material = variant;
        return;
      }
    }

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
 * Which of the four ways of being built a wall gets: block, panel, sheet or
 * render.
 *
 * Derived from where the building stands, snapped to a sixteen-metre cell.
 * Placement is the one property that is stable across reloads and differs
 * between neighbours — but it has to be coarse, because a building here is
 * sometimes one volume and sometimes four separate wall slabs, and reading the
 * exact position would have built one side of a room out of block and the
 * facing side out of corrugated sheet. A cell wider than a building keeps its
 * walls agreeing with each other.
 */
function masonryKind(mesh: THREE.Mesh, rooms: MasonryRoom[]): number {
  const at = mesh.getWorldPosition(new THREE.Vector3());
  // Inside a room, the room decides, and every wall around it agrees. A
  // sixteen-metre cell is smaller than the club, so its four walls came out of
  // four different cells and the room ended up built of four different
  // materials — which is not a street full of variety, it is a room that looks
  // like a mistake.
  const roomIndex = rooms.findIndex(
    (room) => at.x >= room.minX && at.x <= room.maxX && at.z >= room.minZ && at.z <= room.maxZ,
  );
  if (roomIndex >= 0) return roomIndex % 4;
  const cellX = Math.round(at.x / 16);
  const cellZ = Math.round(at.z / 16);
  const value = Math.sin(cellX * 12.9898 + cellZ * 78.233) * 43758.5453;
  return Math.floor((value - Math.floor(value)) * 4);
}

/** A room whose walls should all be built the same way. */
export type MasonryRoom = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Whether a mesh is a wall or a building, as opposed to everything else.
 *
 * Deliberately crude, and deliberately about size rather than about names. The
 * world has no notion of what a piece *is* — every surface in it is the same
 * unit cube under a different scale — so any list of "these are the walls"
 * would be hand-maintained and would be wrong the first time somebody added a
 * building. Size is derived from the thing itself and cannot go stale.
 *
 * Tall enough to be a storey rules out the road, the red carpet, the sand and
 * every awning, all of which are wide and flat. Wide enough to be a face rules
 * out lamp posts, bollards and truss. What is left is walls and building
 * volumes, which is exactly what should be made of blocks.
 */
function isMasonry(mesh: THREE.Mesh, keepPlain: THREE.Box3[]): boolean {
  const material = mesh.material as THREE.Material;
  // Unlit is a sign, a screen or a light. None of them are built of anything.
  if (Array.isArray(material) || material instanceof THREE.MeshBasicMaterial) return false;
  if (mesh.userData.wornNoMasonry === true) return false;
  const scale = mesh.getWorldScale(new THREE.Vector3());
  // A storey and a half tall, and wide enough to be a face rather than a
  // feature. The first cut asked for 2.4 in both, which is a door — and it put
  // block courses on the club's front doors and on the popcorn stand, neither
  // of which anybody built out of masonry. A door is tall but narrow; a stall
  // is wide but short; a wall is both.
  if (scale.y < 4) return false;
  if (Math.max(scale.x, scale.z) < 6) return false;
  const where = mesh.getWorldPosition(new THREE.Vector3());
  return !keepPlain.some((box) => box.containsPoint(where));
}

/**
 * How much of the effect to mix in, and how coarse the colour depth is.
 * Amount 0 leaves the world exactly as it was; 1 is the full treatment. Steps
 * is the number of levels per channel — eight is heavy, sixteen is subtle.
 */
export function setWornStyle(amount: number, steps?: number, grain?: number, texture?: number): void {
  WORN_UNIFORMS.uWornAmount.value = THREE.MathUtils.clamp(amount, 0, 1);
  if (steps !== undefined) WORN_UNIFORMS.uWornSteps.value = Math.max(2, steps);
  if (grain !== undefined) WORN_UNIFORMS.uWornGrain.value = THREE.MathUtils.clamp(grain, 0, 2);
  if (texture !== undefined) WORN_UNIFORMS.uWornTexture.value = THREE.MathUtils.clamp(texture, 0, 2);
}

export function wornStyleSettings(): { amount: number; steps: number; grain: number; texture: number } {
  return {
    amount: WORN_UNIFORMS.uWornAmount.value,
    steps: WORN_UNIFORMS.uWornSteps.value,
    grain: WORN_UNIFORMS.uWornGrain.value,
    texture: WORN_UNIFORMS.uWornTexture.value,
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
  // `era=ps2` turns the style on by itself, so asking only about `worn` here
  // would have run the shading half without the dressing half — the same split
  // decision, read in two places, disagreeing.
  if (params.get('worn') === null && params.get('era') !== 'ps2') return false;
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

/**
 * Takes the square out of the world.
 *
 * Six rounds of dressing hung things on these buildings and it took them a long
 * way, but it could never fix the underlying read, because every surface here
 * is still a perfect rectangle with perfectly sharp corners. Look at the
 * reference images and there is almost no straight line in them: walls lean,
 * slabs have settled, parapets are uneven, nothing is quite square. That is not
 * clutter on top of the geometry, it is the geometry.
 *
 * So each corner of each large surface is moved a few centimetres, and that is
 * the whole idea. It is deliberately tiny — displacement you could measure but
 * not point at — because the failure mode here is not subtlety, it is a world
 * that reads as broken rather than as old.
 *
 * Three things make it work rather than look like damage:
 *
 *  - **Per corner, not per vertex.** A box carries each corner three times, once
 *    for each face meeting there. Moving those copies independently tears the
 *    box open at every seam. The offset is derived from which corner a vertex
 *    belongs to, so all three copies move together and the box stays sealed.
 *  - **Constant in the world, not in the model.** Every mesh here is one unit
 *    cube stretched by its scale, so a fixed local offset would be multiplied
 *    by that scale — a twenty-metre wall would lean a hundred times further
 *    than a doorframe. The offset is divided by the scale first, so a corner
 *    moves the same few centimetres whatever it belongs to.
 *  - **Only what is big enough to read.** A lean says "this settled" on a wall
 *    and "this is broken" on a handrail, so small objects keep their edges.
 *
 * Geometry is cloned per mesh, which is what makes this possible at all: the
 * world shares one box between every surface in it, and displacing that would
 * move every wall in the festival identically. A cube is twenty-four vertices,
 * so a thousand of them is a rounding error.
 */
export function warpWorldGeometry(
  scene: THREE.Object3D,
  amount = 1,
  /** Structures that must stay true: the screens and the theatres holding them. */
  keepTrue: THREE.Box3[] = [],
): number {
  if (amount <= 0) return 0;
  let warped = 0;

  const corner = (seed: THREE.Vector3, sx: number, sy: number, sz: number, salt: number): number => {
    const value = Math.sin(
      seed.x * 12.9898 + seed.y * 78.233 + seed.z * 37.719
      + sx * 3.17 + sy * 7.31 + sz * 11.53 + salt * 4.7,
    ) * 43758.5453;
    return (value - Math.floor(value)) - 0.5;
  };

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.wornWarped === true) return;
    // Anything marked to be left as built. A stair whose treads have each
    // settled a few centimetres in a different direction is not an old stair,
    // it is a broken one.
    if (mesh.userData.wornNoMasonry === true) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    if (geometry?.type !== 'BoxGeometry') return;
    const scale = mesh.getWorldScale(new THREE.Vector3());
    // Big flat things only. A wall that has settled reads as age; a settled
    // handrail reads as a bug.
    if (Math.max(scale.x, scale.y, scale.z) < 2.4) return;
    // The ground stays flat. A wall that is out of true reads as a building
    // that has stood a long time; a road that is out of true reads as a fault
    // in the renderer, because a floor is the one surface a person has an exact
    // expectation of. Anything far wider than it is tall is a floor.
    if (scale.y < Math.max(scale.x, scale.z) * 0.25) return;
    const where = mesh.getWorldPosition(new THREE.Vector3());
    // And a screen is a manufactured object hung on a frame. It was never going
    // to have settled, and leaning one is the single most obviously wrong thing
    // this pass can do — it is the flattest, straightest, most-looked-at surface
    // in the festival.
    if (keepTrue.some((box) => box.containsPoint(where))) return;

    mesh.userData.wornWarped = true;
    const own = geometry.clone();
    const at = where;
    const position = own.attributes.position as THREE.BufferAttribute;
    // How far a corner may move, in world units, before this stops reading as
    // settlement and starts reading as a fault in the renderer.
    // Halved from the first attempt, which read as damage rather than as age.
    // The line between the two is much finer than it looks from the code.
    const reach = 0.034 * amount;

    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      const sx = Math.sign(x);
      const sy = Math.sign(y);
      const sz = Math.sign(z);
      position.setXYZ(
        index,
        x + corner(at, sx, sy, sz, 1) * (reach / Math.max(scale.x, 0.001)),
        // Vertical movement is halved: a wall that leans has settled, a wall
        // whose top edge waves has melted.
        y + corner(at, sx, sy, sz, 2) * (reach * 0.5 / Math.max(scale.y, 0.001)),
        z + corner(at, sx, sy, sz, 3) * (reach / Math.max(scale.z, 0.001)),
      );
    }
    position.needsUpdate = true;
    // The faces are no longer square, so their old normals are lies.
    own.computeVertexNormals();
    mesh.geometry = own;
    warped += 1;
  });

  return warped;
}

/**
 * Gives a building a base, a shaft and a cap.
 *
 * The single biggest reason these buildings read as blocks rather than as
 * architecture is that they *are* blocks: one extruded rectangle, from the
 * ground to the sky, with the same footprint the whole way up. Real buildings
 * step. There is a plinth at the pavement where the wall is thicker and takes
 * the knocks, and there is a cornice at the top where the roof oversails. Two
 * steps is all it takes — the eye reads a base and a cap and stops asking.
 *
 * Done as geometry inside the mesh rather than as extra objects sitting on it,
 * and that is a measurement rather than a preference. This world runs at 470
 * draw calls and 5,800 triangles: draw calls are the budget, triangles are
 * nowhere near it. Stacking a plinth and a cornice on 62 buildings as separate
 * meshes would have cost 124 more draw calls; merged into the building's own
 * geometry it costs none, and about 3,000 triangles that nothing will notice.
 *
 * Everything is figured in world units and divided back through the mesh's own
 * scale, because every surface here is the same unit cube stretched to size —
 * a fixed local inset would give a twenty-metre wall a two-metre plinth.
 *
 * The proud faces stay inside the collider padding the walls already carry, so
 * this adds nothing to walk into. Nobody bumps a cornice.
 */
export function massBuildings(
  scene: THREE.Object3D,
  keepPlain: THREE.Box3[] = [],
): number {
  let massed = 0;
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.wornMassed === true) return;
    if ((mesh.geometry as THREE.BufferGeometry)?.type !== 'BoxGeometry') return;
    if (!isMasonry(mesh, keepPlain)) return;
    if (mesh.userData.wornNoMasonry === true) return;

    const scale = mesh.getWorldScale(new THREE.Vector3());
    // Not worth it on anything that is mostly plinth already.
    if (scale.y < 4) return;

    const proudX = 0.13 / scale.x;
    const proudZ = 0.13 / scale.z;
    // A plinth is about knee-to-waist, a cornice is a courtesy. Both are in
    // world units first, then taken back through the scale.
    const plinth = Math.min(1.1 / scale.y, 0.22);
    const cornice = Math.min(0.5 / scale.y, 0.12);

    const parts: THREE.BufferGeometry[] = [];

    const shaft = new THREE.BoxGeometry(1, 1, 1);
    parts.push(shaft);

    const base = new THREE.BoxGeometry(1 + proudX * 2, plinth, 1 + proudZ * 2);
    base.translate(0, -0.5 + plinth / 2, 0);
    parts.push(base);

    const cap = new THREE.BoxGeometry(1 + proudX * 2.6, cornice, 1 + proudZ * 2.6);
    cap.translate(0, 0.5 - cornice / 2, 0);
    parts.push(cap);

    const merged = mergeGeometries(parts, false);
    if (!merged) return;
    for (const part of parts) part.dispose();

    mesh.geometry = merged;
    mesh.userData.wornMassed = true;
    // The settle pass works corner by corner on a box, and a stepped profile
    // is not one — running it here would pull the plinth away from the wall it
    // belongs to. A massed building has a silhouette already; it does not also
    // need to lean.
    mesh.userData.wornWarped = true;
    massed += 1;
  });
  return massed;
}
