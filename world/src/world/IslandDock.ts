import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ISLAND, ISLAND_COVE, SEA_Y, terrainHeightAt } from './CoastalTerrain';
import { pixelSurface } from './CoastalSurfaces';
import { ps1SurfaceTexture } from './Ps1Surfaces';
import { buildPs1Ferry } from './Ps1Ferry';

/**
 * The landing for the island prototype, just outside the gate: a walled
 * harbour basin, stone steps down from the quay, a timber pier with a T-head
 * out in the basin, and a small ferry moored alongside it. Blocky solid pieces in flat colours with the world's pixel
 * grain, like the rest of the town; one batched mesh per material.
 */

const DECK_Y = SEA_Y + 1.35;
const PIER_X = 0;
const QUAY_Z = ISLAND_COVE.z;
const STEPS = 16;
const STEP_RUN = .34;
const ROOT_Z = QUAY_Z + STEPS * STEP_RUN;
const HEAD_Z = QUAY_Z + 22;
const WIDTH = 5.2;
const HEAD_W = 16;
const LANDING = 1.6;
const HEAD_D = 7;
/** Where an arrival steps off the ferry: on the pier head, facing the gate. */
export const DOCK_ARRIVAL = { x: PIER_X + 1.2, z: HEAD_Z + .5 } as const;

type Put = (geometry: THREE.BufferGeometry, mat: THREE.Material) => void;

function mat(color: number, map?: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: .95, metalness: 0, flatShading: true, map });
  return m;
}

function box(put: Put, size: [number, number, number], at: [number, number, number], m: THREE.Material, yaw = 0, roll = 0): void {
  const g = new THREE.BoxGeometry(...size);
  if (roll) g.rotateZ(roll);
  if (yaw) g.rotateY(yaw);
  g.translate(...at);
  put(g, m);
}

function post(put: Put, x: number, z: number, top: number, radius: number, m: THREE.Material): void {
  const bottom = Math.min(terrainHeightAt(x, z), SEA_Y) - 1.5;
  const g = new THREE.CylinderGeometry(radius, radius * 1.08, top - bottom, 6);
  g.translate(x, (top + bottom) / 2, z);
  put(g, m);
}

/**
 * A hull lofted through stations along its length: each a flat-bottomed
 * section with flared sides, narrowing and lifting to a raked bow. Lower and
 * upper strakes are separate meshes so they take two colours on one crisp
 * line, the way the reference boat's paint does.
 */
function hull(length: number, beam: number, depth: number, stripeHeight = 0): { lower: THREE.BufferGeometry; upper: THREE.BufferGeometry; stripe?: THREE.BufferGeometry; deck: THREE.BufferGeometry } {
  const stations = [-.5, -.42, -.2, .05, .25, .38, .46, .5];
  const section = (t: number) => {
    const bow = Math.max(0, (t - .1) / .4);
    const halfBeam = beam / 2 * (t < -.42 ? .86 : 1 - bow * bow * .94);
    const keel = -depth + bow * bow * depth * .62 + (t < -.42 ? depth * .18 : 0);
    const sheer = .12 + bow * bow * .55;
    return { z: t * length, halfBeam, keel, sheer };
  };
  const ring = (s: ReturnType<typeof section>, band: number) => {
    // Chine to sheer, in `band` 0 (keel .. waterline stripe), 2 (the boot-top
    // stripe itself, when there is one) or 1 (above it .. sheer).
    const stripe = -depth * .38, above = stripe + stripeHeight;
    const lowY = band === 0 ? s.keel : band === 2 ? Math.max(stripe, s.keel) : Math.max(above, s.keel);
    const highY = band === 0 ? Math.max(stripe, s.keel) : band === 2 ? Math.max(above, s.keel) : s.sheer;
    const w = (y: number) => s.halfBeam * (.72 + .28 * THREE.MathUtils.clamp((y - s.keel) / (s.sheer - s.keel + 1e-4), 0, 1));
    return [[-w(highY), highY], [-w(lowY), lowY], [w(lowY), lowY], [w(highY), highY]];
  };
  const loft = (band: number) => {
    const pos: number[] = [];
    const secs = stations.map(section);
    for (let i = 0; i < secs.length - 1; i++) {
      const a = ring(secs[i], band), b = ring(secs[i + 1], band);
      for (let k = 0; k < 3; k++) {
        const p = [[a[k], secs[i].z], [a[k + 1], secs[i].z], [b[k + 1], secs[i + 1].z], [b[k], secs[i + 1].z]] as const;
        const q = p.map(([xy, z]) => [xy[0], xy[1], z]);
        pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
      }
    }
    // The transom: a flat stern.
    const s = ring(secs[0], band);
    pos.push(s[0][0], s[0][1], secs[0].z, s[2][0], s[2][1], secs[0].z, s[1][0], s[1][1], secs[0].z);
    pos.push(s[0][0], s[0][1], secs[0].z, s[3][0], s[3][1], secs[0].z, s[2][0], s[2][1], secs[0].z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  // The deck: a flat plate at each station's sheer, a little inside the rail.
  const deckPos: number[] = [];
  const secs = stations.map(section);
  for (let i = 0; i < secs.length - 1; i++) {
    const a = secs[i], b = secs[i + 1];
    const y = Math.min(a.sheer, b.sheer) - .08;
    const q = [[-a.halfBeam * .9, y, a.z], [a.halfBeam * .9, y, a.z], [b.halfBeam * .9, y, b.z], [-b.halfBeam * .9, y, b.z]];
    deckPos.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  // Planks run fore and aft: the tile's planks lie along U.
  const deckUv: number[] = [];
  for (let i = 0; i < deckPos.length; i += 3) deckUv.push(deckPos[i + 2] / 6, deckPos[i] / 2.4);
  deck.setAttribute('uv', new THREE.Float32BufferAttribute(deckUv, 2));
  deck.computeVertexNormals();
  return { lower: loft(0), upper: loft(1), stripe: stripeHeight > 0 ? loft(2) : undefined, deck };
}

export class IslandDock {
  readonly group = new THREE.Group();
  readonly boat = new THREE.Group();
  private readonly batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly boatHome = new THREE.Vector3();
  private readonly quayTop = terrainHeightAt(PIER_X, QUAY_Z - 1.5);
  /**
   * The coping along the top of every quay wall, as [minX, maxX, minZ, maxZ,
   * top]. It is a slab laid 19 cm proud of the ground the wall was sized to,
   * and the terrain under it dips into the harbour's cut, so a body on it was
   * stood on the terrain — up to 80 cm into the stone at the side quays (the
   * owner's screenshot, 2026-10-07). Walked as a floor now, like the steps.
   */
  private readonly copings: Array<[number, number, number, number, number]> = [];

  constructor() {
    this.group.name = 'island-dock';
    const grain = pixelSurface('plaster');
    grain.repeat.set(.5, .5);
    const deck = mat(0x8a6f52, grain), deckAlt = mat(0x7b6249, grain), timber = mat(0x5a4838, grain);
    const iron = mat(0x2c2f2e), rope = mat(0xcdbb93), tyre = mat(0x1d1e1f);
    const put: Put = (g, m) => { const list = this.batches.get(m) ?? []; list.push(g); this.batches.set(m, list); };

    const stone = mat(0x8d8a80, pixelSurface('brick')), coping = mat(0xb9b3a4, grain), dark = mat(0x55544f, pixelSurface('brick'));
    // Quay walls round the basin: along its landward edge, then up each side
    // to the open sea, each block as tall as the ground behind it.
    const wallFoot = ISLAND_COVE.floor - .5;
    const wall = (x: number, z: number, along: 'x' | 'z', length: number, behindX: number, behindZ: number) => {
      const top = Math.max(terrainHeightAt(behindX, behindZ), SEA_Y + .6);
      // The quay's wall reaches back into the land: the terrain's two-unit
      // triangles span the harbour's cut, and a thin wall left the ground
      // sagging into a trough behind it.
      const back = along === 'x' ? 2.2 : 1.2, shift = along === 'x' ? -.5 : 0;
      const size: [number, number, number] = along === 'x' ? [length, top - wallFoot, back] : [back, top - wallFoot, length];
      box(put, size, [x, (top + wallFoot) / 2, z + shift], stone);
      const copingSize = along === 'x' ? [length + .1, back + .3] : [back + .3, length + .1];
      box(put, [copingSize[0], .22, copingSize[1]], [x, top + .08, z + shift], coping);
      this.copings.push([x - copingSize[0] / 2, x + copingSize[0] / 2, z + shift - copingSize[1] / 2, z + shift + copingSize[1] / 2, top + .19]);
      // A dark tide band at the waterline.
      box(put, along === 'x' ? [length + .04, .5, 1.26] : [1.26, .5, length + .04], [x, SEA_Y + .05, z], dark);
    };
    for (let x = -ISLAND_COVE.half; x < ISLAND_COVE.half; x += 3) {
      if (Math.abs(x + 1.5 - PIER_X) < WIDTH / 2 + 1) continue;
      wall(x + 1.5, QUAY_Z, 'x', 3, x + 1.5, QUAY_Z - 1.5);
    }
    for (const side of [-1, 1]) {
      for (let z = QUAY_Z - .6; z < ISLAND.north + 14; z += 3) {
        if (terrainHeightAt(side * (ISLAND_COVE.half + 1.5), z + 1.5) < SEA_Y - .4) break;
        wall(side * ISLAND_COVE.half, z + 1.5, 'z', 3, side * (ISLAND_COVE.half + 1.5), z + 1.5);
      }
    }
    // Steps down from the quay to the pier, between two cheek walls, from a
    // flat stone landing at their head.
    const quayTop = this.quayTop;
    box(put, [WIDTH, quayTop - wallFoot, LANDING], [PIER_X, (quayTop + wallFoot) / 2, QUAY_Z - .6 - LANDING / 2], stone);
    for (let i = 0; i < STEPS; i++) {
      const top = THREE.MathUtils.lerp(quayTop, DECK_Y + .08, (i + 1) / STEPS);
      box(put, [WIDTH, top - wallFoot, STEP_RUN + .02], [PIER_X, (top + wallFoot) / 2, QUAY_Z - .6 + (i + .5) * STEP_RUN], stone);
    }
    for (const side of [-1, 1]) {
      box(put, [.7, quayTop + .5 - wallFoot, STEPS * STEP_RUN + 1.2], [PIER_X + side * (WIDTH / 2 + .35), (quayTop + .5 + wallFoot) / 2, QUAY_Z + STEPS * STEP_RUN / 2 - .6], stone);
      box(put, [.9, .2, STEPS * STEP_RUN + 1.3], [PIER_X + side * (WIDTH / 2 + .35), quayTop + .6, QUAY_Z + STEPS * STEP_RUN / 2 - .6], coping);
    }
    // The walk: boards across two stringers, posts in pairs every four units.
    for (let z = ROOT_Z - .6; z < HEAD_Z - 3; z += .9) {
      box(put, [WIDTH, .16, .78], [PIER_X, DECK_Y, z + .45], Math.round(z / .9) % 3 ? deck : deckAlt);
    }
    for (const side of [-1, 1]) {
      box(put, [.3, .45, HEAD_Z - ROOT_Z], [PIER_X + side * (WIDTH / 2 - .5), DECK_Y - .3, (ROOT_Z + HEAD_Z - 3) / 2], timber);
      for (let z = ROOT_Z + 1; z <= HEAD_Z - 3; z += 4) post(put, PIER_X + side * (WIDTH / 2 - .15), z, DECK_Y + .95, .22, timber);
    }
    // The head: a wider platform across the end, where the ferry ties up.
    const headW = HEAD_W, headD = HEAD_D;
    for (let x = -headW / 2; x < headW / 2; x += .9) {
      box(put, [.78, .16, headD], [PIER_X + x + .45, DECK_Y, HEAD_Z + headD / 2 - 3], Math.round(x / .9) % 3 ? deck : deckAlt);
    }
    for (const [x, z] of [[-headW / 2, HEAD_Z - 3], [headW / 2, HEAD_Z - 3], [-headW / 2, HEAD_Z + headD - 3], [headW / 2, HEAD_Z + headD - 3], [0, HEAD_Z + headD - 3], [-headW / 4, HEAD_Z + headD - 3], [headW / 4, HEAD_Z + headD - 3]]) {
      post(put, PIER_X + x, z, DECK_Y + 1.05, .26, timber);
    }
    box(put, [headW, .45, .3], [PIER_X, DECK_Y - .3, HEAD_Z - 3], timber);
    box(put, [headW, .45, .3], [PIER_X, DECK_Y - .3, HEAD_Z + headD - 3], timber);
    // Bollards along the east edge of the head, and old tyres hung as fenders.
    // Both stand forward of the gangway (it lands at HEAD_Z + 2.6, 1.1 wide):
    // one stood at its foot, in the way of everyone stepping off the boat
    // (the owner, 2026-10-01).
    const bollards: THREE.Vector3[] = [];
    for (const z of [HEAD_Z - 1.8, HEAD_Z + .6]) {
      const x = PIER_X + headW / 2 - .6;
      const g = new THREE.CylinderGeometry(.22, .28, .55, 7);
      g.translate(x, DECK_Y + .36, z);
      put(g, iron);
      const cap = new THREE.CylinderGeometry(.32, .32, .1, 7);
      cap.translate(x, DECK_Y + .66, z);
      put(cap, iron);
      bollards.push(new THREE.Vector3(x, DECK_Y + .55, z));
    }
    for (const z of [HEAD_Z - 1, HEAD_Z + 1.5]) {
      const g = new THREE.TorusGeometry(.42, .16, 5, 8);
      g.rotateY(Math.PI / 2);
      g.translate(PIER_X + headW / 2 + .12, DECK_Y - .45, z);
      put(g, tyre);
    }

    for (const [m, list] of this.batches) {
      const mesh = new THREE.Mesh(mergeGeometries(list)!, m);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = 'island-dock-' + (m as THREE.MeshStandardMaterial).color.getHexString();
      this.group.add(mesh);
      list.forEach((g) => g.dispose());
    }

    // The ferry: white upper works over a blue hull, the bow pointing out to
    // sea, tied alongside the head's east face. Its cabin is Ps1Ferry's.
    const white = mat(0xe9e4d6, grain), blue = mat(0x2a4f80), boatDeck = mat(0x9c8a6c, grain);
    const length = 12, beam = 4.2, depth = 1.5;
    // The Showa ferry (2026-11-11) has a red boot-top stripe and a planked deck.
    const shape = hull(length, beam, depth, .22);
    boatDeck.map = ps1SurfaceTexture('wood'); boatDeck.color.set(0xb08a62);
    const stripe = mat(0xb3352b);
    for (const m of [blue, white, boatDeck, stripe]) m.side = THREE.DoubleSide;
    for (const [g, m] of [[shape.lower, blue], [shape.upper, white], [shape.deck, boatDeck], ...(shape.stripe ? [[shape.stripe, stripe]] as const : [])] as const) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = mesh.receiveShadow = true;
      this.boat.add(mesh);
    }
    {
      // A timber rubbing strake along the sheer, either side.
      const stations = [-.5, -.42, -.2, .05, .25, .38, .46, .5];
      const at = (t: number) => {
        const bow = Math.max(0, (t - .1) / .4);
        return { z: t * length, half: beam / 2 * (t < -.42 ? .86 : 1 - bow * bow * .94), sheer: .12 + bow * bow * .55 };
      };
      const strake = mat(0x6b4a32);
      for (let i = 0; i < stations.length - 2; i++) for (const side of [-1, 1]) {
        const a = at(stations[i]), b = at(stations[i + 1]);
        const from = new THREE.Vector3(side * (a.half + .04), a.sheer - .1, a.z), to = new THREE.Vector3(side * (b.half + .04), b.sheer - .1, b.z);
        const piece = new THREE.Mesh(new THREE.BoxGeometry(.1, .14, from.distanceTo(to) + .04), strake);
        piece.position.copy(from).lerp(to, .5);
        piece.lookAt(to);
        this.boat.add(piece);
      }
    }
    buildPs1Ferry(this.boat, { length, beam, deck: .12, pierSide: -1 });
    this.boat.name = 'island-ferry';
    // Floating on its waterline, 0.9 below the sheer amidships: the blue
    // bottom shows as a band under the white topsides.
    this.boatHome.set(PIER_X + headW / 2 + beam / 2 + 1.05, SEA_Y + .9, HEAD_Z + 1.2);
    this.boat.position.copy(this.boatHome);
    this.group.add(this.boat);

    // The gangway the arrivals come ashore by: from the ferry's rail down to
    // the head, with a handrail each side.
    const deckTop = DECK_Y + .08, boatDeckY = this.boatHome.y + .06;
    const from = new THREE.Vector3(PIER_X + headW / 2 - 1.3, deckTop + .05, HEAD_Z + 2.6);
    const to = new THREE.Vector3(this.boatHome.x - .6, boatDeckY + .05, HEAD_Z + 2.6);
    const run = to.clone().sub(from), mid = from.clone().lerp(to, .5), tilt = Math.atan2(run.y, run.x);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(run.length(), .1, 1.1), deckAlt);
    plank.position.copy(mid);
    plank.rotation.z = tilt;
    plank.castShadow = plank.receiveShadow = true;
    this.group.add(plank);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(run.length(), .06, .06), white);
      rail.position.copy(mid).add(new THREE.Vector3(0, .9, side * .52));
      rail.rotation.z = tilt;
      this.group.add(rail);
      for (const t of [.05, .5, .95]) {
        const stanchion = new THREE.Mesh(new THREE.BoxGeometry(.05, .9, .05), white);
        stanchion.position.copy(from.clone().lerp(to, t)).add(new THREE.Vector3(0, .45, side * .52));
        this.group.add(stanchion);
      }
    }

    // Mooring lines from the bollards: one to the stern cleat, one a spring
    // line amidships, square across, clear of the gangway.
    this.boat.updateMatrixWorld(true);
    for (const [bollard, local] of [[bollards[0], new THREE.Vector3(-beam / 2 + .3, .5, -length / 2 + 1)], [bollards[1], new THREE.Vector3(-beam / 2 + .4, .6, -.6)]] as const) {
      const cleat = local.clone().add(this.boatHome);
      const sag = bollard.clone().lerp(cleat, .5);
      sag.y -= .35;
      const curve = new THREE.CatmullRomCurve3([bollard, sag, cleat]);
      const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, .045, 4), rope);
      this.group.add(line);
    }
  }

  /**
   * The floor a body walks on here, or undefined off the landing: the steps
   * as one even ramp from the quay to the deck (as the temple's are), the
   * boards of the pier and its head, and the coping on top of the quay walls.
   */
  heightAt(x: number, z: number): number | undefined {
    const stepsFrom = QUAY_Z - .6, stepsTo = ROOT_Z - .6;
    if (Math.abs(x - PIER_X) < WIDTH / 2 && z >= stepsFrom - LANDING && z < stepsFrom) return this.quayTop;
    if (Math.abs(x - PIER_X) < WIDTH / 2 && z >= stepsFrom && z < stepsTo) {
      return THREE.MathUtils.lerp(this.quayTop, DECK_Y + .08, (z - stepsFrom) / (stepsTo - stepsFrom));
    }
    if (Math.abs(x - PIER_X) < WIDTH / 2 && z >= stepsTo && z <= HEAD_Z - 3) return DECK_Y + .08;
    if (Math.abs(x - PIER_X) < HEAD_W / 2 && z >= HEAD_Z - 3 && z <= HEAD_Z + HEAD_D - 3) return DECK_Y + .08;
    let coping: number | undefined;
    for (const [minX, maxX, minZ, maxZ, top] of this.copings) {
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) coping = Math.max(coping ?? -Infinity, top);
    }
    return coping;
  }

  /**
   * Thin walls a body may not cross, as [x, z, width, depth]: the quay's edge
   * either side of the steps, the basin's side walls, and every edge of the
   * pier and its head. Nobody walks off into the harbour, whose walls stand
   * too tall to climb back out of.
   */
  barriers(): [number, number, number, number][] {
    const t = .3, half = ISLAND_COVE.half;
    const out: [number, number, number, number][] = [];
    const gap = WIDTH / 2 + .7;
    // As deep as the walls and their copings (the owner, 2026-11-11): a thin
    // line at the edge let a body on the grass press its legs into the raised
    // coping, and one in the water press into the wall below it.
    out.push([(-half - gap) / 2, QUAY_Z + .225, half - gap, 1.05], [(half + gap) / 2, QUAY_Z + .225, half - gap, 1.05]);
    for (const side of [-1, 1]) {
      out.push([side * (half + .075), QUAY_Z + 30, 1.65, 60]);
      out.push([PIER_X + side * (WIDTH / 2 + .15), (QUAY_Z + HEAD_Z - 3) / 2, t, HEAD_Z - 3 - QUAY_Z]);
      out.push([PIER_X + side * (HEAD_W / 2 + .15), HEAD_Z - 3 + HEAD_D / 2, t, HEAD_D]);
      out.push([PIER_X + side * (HEAD_W / 2 + WIDTH / 2) / 2, HEAD_Z - 3 - .15, (HEAD_W - WIDTH) / 2, t]);
    }
    out.push([PIER_X, HEAD_Z + HEAD_D - 3 + .15, HEAD_W + .6, t]);
    // What stands on the walk itself (the owner, 2026-11-11: bodies went into
    // all of these). The steps' cheek walls stand .7 over the quay beside
    // them and .45 outside the pier's edge line; the posts down the pier and
    // the bollards on the head are knee-high; the gangway's handrails come
    // ashore on the head.
    for (const side of [-1, 1]) {
      out.push([PIER_X + side * (WIDTH / 2 + .35), QUAY_Z + STEPS * STEP_RUN / 2 - .6, .9, STEPS * STEP_RUN + 1.3]);
      for (let z = ROOT_Z + 1; z <= HEAD_Z - 3; z += 4) out.push([PIER_X + side * (WIDTH / 2 - .15), z, .5, .5]);
    }
    for (const z of [HEAD_Z - 1.8, HEAD_Z + .6]) out.push([PIER_X + HEAD_W / 2 - .6, z, .66, .66]);
    out.push([PIER_X + HEAD_W / 2 - .55, HEAD_Z + 2.6, 1.5, 1.3]);
    return out;
  }

  /**
   * Where the harbour's lamp posts stand: on the quay either side of the
   * steps, and on the pier head's far edge, clear of the gangway, the
   * bollards and the walk down the middle.
   */
  lampSpots(): [number, number][] {
    return [
      [PIER_X - (WIDTH / 2 + 2.4), QUAY_Z - 2.2], [PIER_X + WIDTH / 2 + 2.4, QUAY_Z - 2.2],
      [PIER_X - (HEAD_W / 2 - .7), HEAD_Z + HEAD_D - 3.7], [PIER_X + 5.2, HEAD_Z + HEAD_D - 3.7],
    ];
  }

  /**
   * Where the water washes round things in the harbour (StylizedWater): each
   * post standing in it as [x, z, radius], and the ferry's hull as
   * [x, z, half beam, half length].
   */
  washSpots(): { posts: Array<[number, number, number]>; boat: [number, number, number, number] } {
    const posts: Array<[number, number, number]> = [];
    for (const side of [-1, 1]) for (let z = ROOT_Z + 1; z <= HEAD_Z - 3; z += 4) posts.push([PIER_X + side * (WIDTH / 2 - .15), z, .24]);
    for (const [x, z] of [[-HEAD_W / 2, HEAD_Z - 3], [HEAD_W / 2, HEAD_Z - 3], [-HEAD_W / 2, HEAD_Z + HEAD_D - 3], [HEAD_W / 2, HEAD_Z + HEAD_D - 3], [0, HEAD_Z + HEAD_D - 3], [-HEAD_W / 4, HEAD_Z + HEAD_D - 3], [HEAD_W / 4, HEAD_Z + HEAD_D - 3]]) posts.push([PIER_X + x, z, .28]);
    return { posts, boat: [this.boatHome.x, this.boatHome.z, 2.15, 6.1] };
  }

  /** The ferry rides the swell a little: heave, roll and pitch, slow. */
  update(elapsed: number): void {
    this.boat.position.y = this.boatHome.y + Math.sin(elapsed * .9) * .07;
    this.boat.rotation.z = Math.sin(elapsed * .7 + 1) * .025;
    this.boat.rotation.x = Math.sin(elapsed * .55) * .012;
  }
}
