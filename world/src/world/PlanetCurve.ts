import * as THREE from 'three';

/**
 * The festival drawn as a small planet, the way Messenger and Animal Crossing
 * do it: the world is modelled, walked and collided on flat ground, and only
 * drawing wraps it round a sphere under the visitor. Everything a few metres
 * off stays where it is; the far side of the island and the open sea fall away
 * below a near horizon.
 *
 * Every built-in material is bent in its vertex stage (`project_vertex`), and
 * its world position (`worldpos_vertex`) with it, so shadows and fog land on
 * the bent surface. A material that must stay put — the sky's clouds, stars,
 * sun and moon, which already follow the visitor — is marked with
 * `keepFlat`. CSS3D panels (the screening videos) are moved and tilted as a
 * whole to where their centre bends to, by `bendCss3d`.
 *
 * Installed once, before any material compiles; off unless the page asks.
 */

export const PLANET = {
  on: false,
  radius: 170,
  centre: { value: new THREE.Vector3() },
  radiusUniform: { value: 170 },
};

/** GLSL for a vertex stage: the declarations and `planetBend(world)`. */
export const PLANET_GLSL = /* glsl */ `
uniform vec3 planetCentre;
uniform float planetRadius;
vec3 planetBend(vec3 w) {
  if (planetRadius <= 0.0) return w;
  vec2 d = w.xz - planetCentre.xz;
  float r = length(d);
  if (r < 1e-4) return w;
  float th = min(r / planetRadius, 3.1);
  float h = planetRadius + w.y;
  vec2 dir = d / r;
  float s = sin(th) * h;
  return vec3(planetCentre.x + dir.x * s, cos(th) * h - planetRadius, planetCentre.z + dir.y * s);
}
`;

const PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
#ifdef PLANET_FLAT
	mvPosition = modelViewMatrix * mvPosition;
#else
	mvPosition = viewMatrix * vec4( planetBend( ( modelMatrix * mvPosition ).xyz ), 1.0 );
#endif
gl_Position = projectionMatrix * mvPosition;
`;

export function installPlanetCurve(radius: number): void {
  if (PLANET.on) return;
  PLANET.on = true;
  PLANET.radius = radius;
  PLANET.radiusUniform.value = radius;
  const chunks = THREE.ShaderChunk as Record<string, string>;
  // A vertex-only chunk that every built-in vertex shader includes at global
  // scope: the place to declare the bend.
  chunks.logdepthbuf_pars_vertex = PLANET_GLSL + chunks.logdepthbuf_pars_vertex;
  chunks.project_vertex = PROJECT;
  chunks.worldpos_vertex = chunks.worldpos_vertex.replace(
    'worldPosition = modelMatrix * worldPosition;',
    'worldPosition = modelMatrix * worldPosition;\n\t#ifndef PLANET_FLAT\n\tworldPosition.xyz = planetBend( worldPosition.xyz );\n\t#endif',
  );
  // Name badges are sprites, which place themselves from their own origin.
  const sprite = THREE.ShaderLib.sprite;
  sprite.vertexShader = sprite.vertexShader.replace(
    'vec4 mvPosition = modelViewMatrix[ 3 ];',
    '#ifdef PLANET_FLAT\n\tvec4 mvPosition = modelViewMatrix[ 3 ];\n\t#else\n\tvec4 mvPosition = viewMatrix * vec4( planetBend( modelMatrix[ 3 ].xyz ), 1.0 );\n\t#endif',
  );
  // Every program gets the two uniforms, whatever else a material hooks in.
  // Material.onBeforeCompile is a prototype method that materials overwrite
  // per instance (the worn style chains onto whatever was there), so the
  // property becomes an accessor: the setter keeps the material's own hook,
  // the getter hands three.js a wrapper that adds the uniforms first. The
  // program cache key stays the material's own hook, as it was.
  const own = new WeakMap<THREE.Material, THREE.Material['onBeforeCompile']>();
  const noop = function onBeforeCompile() {};
  Object.defineProperty(THREE.Material.prototype, 'onBeforeCompile', {
    configurable: true,
    get(this: THREE.Material) {
      const hook = own.get(this);
      return (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => {
        shader.uniforms.planetCentre = PLANET.centre;
        shader.uniforms.planetRadius = PLANET.radiusUniform;
        hook?.call(this, shader, renderer);
      };
    },
    set(this: THREE.Material, hook: THREE.Material['onBeforeCompile']) {
      own.set(this, hook);
    },
  });
  THREE.Material.prototype.customProgramCacheKey = function customProgramCacheKey(this: THREE.Material) {
    return (own.get(this) ?? noop).toString();
  };
}

/** A material drawn where it is modelled, unbent: the sky and what rides with it. */
export function keepFlat(material: THREE.Material): void {
  if (!PLANET.on) return;
  const withDefines = material as THREE.Material & { defines?: Record<string, unknown> };
  withDefines.defines = { ...(withDefines.defines ?? {}), PLANET_FLAT: '' };
  material.needsUpdate = true;
}

/** Where the bend is centred: under the visitor, so the ground they stand on is true. */
export function setPlanetCentre(x: number, z: number): void {
  PLANET.centre.value.set(x, 0, z);
}

const scratch = { d: new THREE.Vector2(), axis: new THREE.Vector3(), q: new THREE.Quaternion(), m: new THREE.Matrix4(), t: new THREE.Matrix4() };

/** The same bend as the shader, on the CPU. */
export function planetBendPoint(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const c = PLANET.centre.value, R = PLANET.radius;
  const dx = p.x - c.x, dz = p.z - c.z, r = Math.hypot(dx, dz);
  if (r < 1e-4) return out.copy(p);
  const th = Math.min(r / R, 3.1), h = R + p.y, s = Math.sin(th) * h;
  return out.set(c.x + dx / r * s, Math.cos(th) * h - R, c.z + dz / r * s);
}

/**
 * The rigid motion that carries the flat world at `p` to the bent one: the
 * point moves to where it bends to and tilts by the arc angle, away from the
 * centre. Premultiplied onto a CSS3D panel's world matrix it lands the video
 * inside its bent WebGL frame.
 */
export function planetBendMatrix(p: THREE.Vector3, out = new THREE.Matrix4()): THREE.Matrix4 {
  const c = PLANET.centre.value;
  const dx = p.x - c.x, dz = p.z - c.z, r = Math.hypot(dx, dz);
  if (r < 1e-4) return out.identity();
  const th = Math.min(r / PLANET.radius, 3.1);
  scratch.axis.set(dz / r, 0, -dx / r);
  scratch.q.setFromAxisAngle(scratch.axis, th);
  const bent = planetBendPoint(p);
  out.makeTranslation(-p.x, -p.y, -p.z);
  scratch.m.makeRotationFromQuaternion(scratch.q);
  out.premultiply(scratch.m);
  scratch.t.makeTranslation(bent.x, bent.y, bent.z);
  return out.premultiply(scratch.t);
}

const panelCentre = new THREE.Vector3();
const bend = new THREE.Matrix4();

/** Bend each CSS3D panel of a scene as a whole. Call after its matrices update. */
export function bendCss3d(scene: THREE.Scene): void {
  if (!PLANET.on) return;
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!(object as THREE.Object3D & { isCSS3DObject?: boolean }).isCSS3DObject) return;
    panelCentre.setFromMatrixPosition(object.matrixWorld);
    object.matrixWorld.premultiply(planetBendMatrix(panelCentre, bend));
  });
}

/**
 * Split every triangle whose longest edge is over `maxEdge` until none is.
 * The bend happens at vertices, so a long wall, a floor slab or a roof that
 * is two triangles stays a flat plane between its corners while the ground
 * beside it curves: it floats, or the ground cuts through it. Every attribute
 * is interpolated along the split; material groups are kept.
 */
export function subdivideForPlanet(source: THREE.BufferGeometry, maxEdge: number, budget = 120_000, scale = new THREE.Vector3(1, 1, 1)): THREE.BufferGeometry | undefined {
  const geometry = source.index ? source.toNonIndexed() : source;
  const names = Object.keys(geometry.attributes);
  const attrs = names.map((n) => geometry.getAttribute(n) as THREE.BufferAttribute);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const triangles = pos.count / 3;
  const out: number[][] = attrs.map(() => []);
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
  const newGroups: { start: number; count: number; materialIndex?: number }[] = [];
  const limit = maxEdge * maxEdge;
  let made = 0, split = false;
  const read = (a: THREE.BufferAttribute, i: number) => {
    const v: number[] = [];
    for (let k = 0; k < a.itemSize; k++) v.push(a.array[i * a.itemSize + k] as number);
    return v;
  };
  // A vertex is its values for every attribute; position is attrs[names.indexOf('position')].
  const p = names.indexOf('position');
  const mid = (a: number[][], b: number[][]) => a.map((va, j) => va.map((x, k) => (x + b[j][k]) / 2));
  // Edges measured as the world sees them: a unit box stretched into a long
  // wall is long in one direction only, and only that direction is split.
  const d2 = (a: number[][], b: number[][]) => ((a[p][0] - b[p][0]) * scale.x) ** 2 + ((a[p][1] - b[p][1]) * scale.y) ** 2 + ((a[p][2] - b[p][2]) * scale.z) ** 2;
  const emit = (t: number[][][], depth: number): void => {
    const e = [d2(t[0], t[1]), d2(t[1], t[2]), d2(t[2], t[0])];
    const longest = e.indexOf(Math.max(...e));
    if (e[longest] > limit && depth < 12 && made < budget) {
      split = true;
      const a = t[longest], b = t[(longest + 1) % 3], c = t[(longest + 2) % 3], m = mid(a, b);
      emit([a, m, c], depth + 1);
      emit([m, b, c], depth + 1);
      return;
    }
    made++;
    for (const v of t) v.forEach((values, j) => out[j].push(...values));
  };
  for (const group of groups) {
    const start = made * 3;
    const end = Math.min(group.start + group.count, pos.count);
    for (let i = group.start; i + 2 < end; i += 3) {
      emit([0, 1, 2].map((k) => attrs.map((a) => read(a, i + k))), 0);
    }
    newGroups.push({ start, count: made * 3 - start, materialIndex: group.materialIndex });
  }
  if (!split || made >= budget) return undefined;
  const result = new THREE.BufferGeometry();
  attrs.forEach((a, j) => {
    const Array = a.array.constructor as Float32ArrayConstructor;
    result.setAttribute(names[j], new THREE.BufferAttribute(new Array(out[j]), a.itemSize, a.normalized));
  });
  if (geometry.groups.length) for (const g of newGroups) result.addGroup(g.start, g.count, g.materialIndex);
  void triangles;
  return result;
}

// Per source geometry, per scale: the subdivided copy (or null, none needed).
const subdivided = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry | null>>();
const produced = new WeakSet<THREE.BufferGeometry>();

/**
 * Subdivide the large static meshes of a scene so they follow the planet.
 * Skinned, instanced and sky pieces are left alone.
 *
 * Done per geometry AND per scale. Hundreds of the town's pieces share one
 * unit box, stretched by their scale; done once per geometry, the box was
 * split as finely as the largest of them needed, and every column, sign and
 * handrail drew 49,152 triangles: sixty million a frame on the island, two
 * frames a second on a desktop (2026-10-01). Edges are measured along each
 * axis at that axis's scale, so a wall splits along its length only.
 */
export function subdivideSceneForPlanet(scene: THREE.Object3D, maxEdge = 3): number {
  if (!PLANET.on) return 0;
  let changed = 0;
  const scale = new THREE.Vector3();
  const size = new THREE.Vector3();
  // Scales a few percent apart share one subdivision.
  const bucket = (v: number) => Math.round(Math.log2(Math.max(Math.abs(v), 1e-4)) * 8);
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if (mesh.renderOrder <= -2 || !mesh.geometry?.getAttribute('position')) return;
    if (produced.has(mesh.geometry)) return;
    mesh.getWorldScale(scale);
    scale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    const before = mesh.geometry;
    let byScale = subdivided.get(before);
    if (!byScale) subdivided.set(before, byScale = new Map());
    const key = `${bucket(scale.x)},${bucket(scale.y)},${bucket(scale.z)}`;
    if (byScale.has(key)) {
      const known = byScale.get(key);
      if (known) { mesh.geometry = known; changed++; }
      return;
    }
    if (!before.boundingBox) before.computeBoundingBox();
    before.boundingBox!.getSize(size).multiply(scale);
    if (Math.max(size.x, size.y, size.z) < maxEdge * 1.5) { byScale.set(key, null); return; }
    const after = subdivideForPlanet(before, maxEdge, 120_000, scale) ?? null;
    byScale.set(key, after);
    if (after) { produced.add(after); mesh.geometry = after; changed++; }
  });
  return changed;
}
