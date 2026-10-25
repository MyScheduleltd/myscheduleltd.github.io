import * as THREE from 'three';
import { PLANET, planetBendPoint } from './PlanetCurve';

/**
 * Casters with the same geometry and surface features share stable depth owners.
 *
 * three.js draws every caster into a shadow map with one shared depth
 * material. Skinning and morph targets are part of that material's program, so
 * each time the shadow pass went from an avatar's body to a lamp post or a
 * prop and back, three.js worked out the program again from scratch — several
 * times per avatar, for every shadow-casting light, every frame. On a phone
 * that was an eighth of the shadow pass (2026-10-17).
 *
 * A caster of each kind keeps one depth material of its own, so no shared one
 * ever changes kind, texture features or side. Three's shared depth material
 * changes maps/sides between draws without always checking its program again,
 * leaving a valid variant cold until a later body change forces that check.
 * Preparing each actual owner at admission avoids those late compilations.
 * It is the same material three.js would have used, with
 * the same settings, and three.js still copies each object's side and maps
 * onto it before drawing, so the shadow maps are unchanged. Casters that need
 * a private depth variant (cut-out textures, displacement) are left to
 * three.js, which already keeps one per material for them.
 */
const depthByKind = new Map<string, THREE.MeshDepthMaterial>();

/** The cases where three.js clones its depth material per source material. */
const needsOwnVariant = (material: THREE.Material): boolean => {
  const m = material as THREE.MeshStandardMaterial;
  return Boolean((m.displacementMap && m.displacementScale !== 0)
    || ((m.alphaMap || m.map) && m.alphaTest > 0)
    || m.alphaToCoverage
    || (m.clipShadows && m.clippingPlanes?.length));
};

export function shareShadowDepthMaterials(root: THREE.Object3D): number {
  let assigned = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow || mesh.customDepthMaterial) return;
    const material = mesh.material;
    if (!material || Array.isArray(material) || needsOwnVariant(material)) return;
    const morph = mesh.geometry.morphAttributes;
    const surface = material as THREE.MeshStandardMaterial;
    const kind = [
      (mesh as THREE.SkinnedMesh).isSkinnedMesh ? 1 : 0, (mesh as THREE.InstancedMesh).isInstancedMesh ? 1 : 0,
      morph.position?.length ?? 0, morph.normal ? 1 : 0, morph.color ? 1 : 0,
      surface.map?.channel ?? '-', surface.alphaMap?.channel ?? '-', surface.side, surface.shadowSide ?? 'auto',
    ].join('|');
    let depth = depthByKind.get(kind);
    if (!depth) {
      depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depthByKind.set(kind, depth);
    }
    mesh.customDepthMaterial = depth;
    assigned += 1;
  });
  return assigned;
}

/**
 * Leaves out of the shadow pass, for one draw, the casters whose shadow cannot
 * land anywhere the camera sees.
 *
 * The sun's shadow map is one fixed square over the whole island, so every
 * caster on the island was drawn into it every frame: the beach couple, the
 * drive-in box office and the arcade while the visitor stood in the club, over
 * a hundred draws that no pixel ever sampled. A caster's shadow lies along the
 * light from it, so when the stretch of light from the caster down to the
 * lowest floor misses the view, nothing it shades is on screen and the shadow
 * map loses only what nobody looks at. On frozen frames at the gate, the
 * square, the Shore, the club and the rooftop no pixel changed, and the shadow
 * pass drew 9–61% fewer objects (2026-10-17).
 *
 * Always kept: anything within reach of a lamp's shadow (those maps are small
 * and close by) and anything under `keep`, the visitor's own body, which may
 * have moved since its matrices were written. The stretch is measured in the
 * planet curve's bent space, where both passes draw, down to the bent floor,
 * with a margin for the soft shadow filter and for bodies that moved a frame's
 * worth. `castShadow` is put back straight after the draw, so nothing outside
 * it ever sees the change.
 */
export class ShadowCasterCulling {
  private casters: THREE.Mesh[] = [];
  private lights: THREE.Light[] = [];
  private listedAt = -Infinity;
  private readonly hidden: THREE.Mesh[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly start = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly directions = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly lampReach = Array.from({ length: 8 }, () => new THREE.Sphere());

  constructor(
    /** Below the lowest surface that can catch a shadow: the seabed bottoms out at −19.5. */
    private readonly lowestFloor = -20,
    private readonly margin = 1.5,
  ) {}

  /** Call just before the scene is drawn; returns how many casters sat out. */
  hide(scene: THREE.Scene, camera: THREE.Camera, now: number, keep?: THREE.Object3D): number {
    this.restore();
    // Listed now and then rather than every frame. A caster or light added in
    // between is simply drawn as before until the next listing.
    if (now - this.listedAt > 1000) {
      this.listedAt = now;
      this.casters = [];
      this.lights = [];
      scene.traverse((object) => {
        if ((object as THREE.Light).isLight) this.lights.push(object as THREE.Light);
        // Hidden pieces (most of every body's procedural rig, bodies out of
        // view) are not listed: three.js does not draw them, and one shown
        // later is simply drawn until the next listing picks it up.
        else if ((object as THREE.Mesh).isMesh && object.castShadow && shown(object) && !(keep && within(object, keep))) {
          this.casters.push(object as THREE.Mesh);
        }
      });
    }
    let suns = 0;
    let lamps = 0;
    for (const light of this.lights) {
      if (!light.castShadow || !shown(light)) continue;
      if ((light as THREE.DirectionalLight).isDirectionalLight) {
        if (suns === this.directions.length) return 0;
        // Matrices as the last draw left them: asking for world positions
        // would rewrite them, and the light only moves with the hour.
        this.from.setFromMatrixPosition(light.matrixWorld);
        this.directions[suns++].setFromMatrixPosition((light as THREE.DirectionalLight).target.matrixWorld).sub(this.from).normalize();
      } else {
        // A spot shadow keeps everything within its reach; too many, and
        // nothing is left out at all.
        if (lamps === this.lampReach.length) return 0;
        const distance = (light as THREE.SpotLight).distance;
        this.lampReach[lamps++].set(this.from.setFromMatrixPosition(light.matrixWorld), distance > 0 ? distance : Infinity);
      }
    }
    if (!suns) return 0;
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    const planes = this.frustum.planes;
    casters: for (const mesh of this.casters) {
      if (!mesh.castShadow || !mesh.visible) continue;
      const skinned = mesh as THREE.SkinnedMesh;
      // The same bounds three.js culls this mesh by.
      if (skinned.isSkinnedMesh && !skinned.boundingSphere) skinned.computeBoundingSphere();
      if (!skinned.isSkinnedMesh && !mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const bounds = skinned.isSkinnedMesh ? skinned.boundingSphere : mesh.geometry.boundingSphere;
      if (!bounds) continue;
      this.sphere.copy(bounds).applyMatrix4(mesh.matrixWorld);
      if (!Number.isFinite(this.sphere.radius)) continue;
      for (let i = 0; i < lamps; i++) if (this.lampReach[i].intersectsSphere(this.sphere)) continue casters;
      const radius = this.sphere.radius + this.margin;
      planetBendPoint(this.sphere.center, this.start);
      for (let i = 0; i < suns; i++) {
        const direction = this.directions[i];
        this.end.copy(direction).multiplyScalar(this.reachToFloor(this.start, direction)).add(this.start);
        let outside = false;
        for (const plane of planes) {
          if (plane.distanceToPoint(this.start) < -radius && plane.distanceToPoint(this.end) < -radius) { outside = true; break; }
        }
        if (!outside) continue casters;
      }
      mesh.castShadow = false;
      this.hidden.push(mesh);
    }
    return this.hidden.length;
  }

  /** Puts every caster back; call straight after the draw. */
  restore(): void {
    for (const mesh of this.hidden) mesh.castShadow = true;
    this.hidden.length = 0;
  }

  /**
   * How far light travels from `start` before it is below every surface.
   * On the island the bent world is a sphere round a point under the visitor,
   * and every surface stands outside the sphere of the lowest floor; on the
   * flat map that sphere is the plane at the lowest floor.
   */
  private reachToFloor(start: THREE.Vector3, direction: THREE.Vector3): number {
    const cap = 400;
    if (!PLANET.on) return direction.y < -1e-3 ? Math.min(cap, Math.max(0, (start.y - this.lowestFloor) / -direction.y)) : cap;
    const centre = PLANET.centre.value;
    this.offset.set(start.x - centre.x, start.y + PLANET.radius, start.z - centre.z);
    const floor = PLANET.radius + this.lowestFloor;
    // |offset + t·direction| = floor, nearest t ahead of the caster.
    const b = this.offset.dot(direction), c = this.offset.lengthSq() - floor * floor;
    const disc = b * b - c;
    if (c <= 0) return 0;
    if (disc < 0 || b >= 0) return cap;
    return Math.min(cap, -b - Math.sqrt(disc));
  }
}

const within = (object: THREE.Object3D, ancestor: THREE.Object3D): boolean => {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
  return false;
};

const shown = (object: THREE.Object3D): boolean => {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
};
