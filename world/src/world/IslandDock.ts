import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ISLAND, ISLAND_COVE, SEA_Y, terrainHeightAt } from './CoastalTerrain';
import { pixelSurface } from './CoastalSurfaces';

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
function hull(length: number, beam: number, depth: number): { lower: THREE.BufferGeometry; upper: THREE.BufferGeometry; deck: THREE.BufferGeometry } {
  const stations = [-.5, -.42, -.2, .05, .25, .38, .46, .5];
  const section = (t: number) => {
    const bow = Math.max(0, (t - .1) / .4);
    const halfBeam = beam / 2 * (t < -.42 ? .86 : 1 - bow * bow * .94);
    const keel = -depth + bow * bow * depth * .62 + (t < -.42 ? depth * .18 : 0);
    const sheer = .12 + bow * bow * .55;
    return { z: t * length, halfBeam, keel, sheer };
  };
  const ring = (s: ReturnType<typeof section>, band: number) => {
    // Chine to sheer, in `band` 0 (keel .. waterline stripe) or 1 (stripe .. sheer).
    const stripe = -depth * .38;
    const lowY = band === 0 ? s.keel : Math.max(stripe, s.keel);
    const highY = band === 0 ? Math.max(stripe, s.keel) : s.sheer;
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
  deck.computeVertexNormals();
  return { lower: loft(0), upper: loft(1), deck };
}

export class IslandDock {
  readonly group = new THREE.Group();
  readonly boat = new THREE.Group();
  private readonly batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly boatHome = new THREE.Vector3();
  private readonly quayTop = terrainHeightAt(PIER_X, QUAY_Z - 1.5);

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
      box(put, along === 'x' ? [length + .1, .22, back + .3] : [back + .3, .22, length + .1], [x, top + .08, z + shift], coping);
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

    // The ferry: white upper works over a blue hull, a red cabin roof, the
    // bow pointing out to sea, tied alongside the head's east face.
    const white = mat(0xe9e4d6, grain), blue = mat(0x2f5f86), red = mat(0xa8322c), glass = mat(0x22303a), boatDeck = mat(0x9c8a6c, grain);
    const length = 12, beam = 4.2, depth = 1.5;
    const shape = hull(length, beam, depth);
    for (const m of [blue, white, boatDeck]) m.side = THREE.DoubleSide;
    for (const [g, m] of [[shape.lower, blue], [shape.upper, white], [shape.deck, boatDeck]] as const) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = mesh.receiveShadow = true;
      this.boat.add(mesh);
    }
    const part = (size: [number, number, number], at: [number, number, number], m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
      mesh.position.set(...at);
      mesh.castShadow = mesh.receiveShadow = true;
      this.boat.add(mesh);
      return mesh;
    };
    // Wheelhouse aft of midships, windows all round, a roof with an overhang.
    part([2.9, 1.9, 3.4], [0, .12 + .95, -1.6], white);
    part([3.02, .55, 3.52], [0, .12 + 1.45, -1.6], glass);
    part([2.1, .5, .06], [0, .12 + 1.45, .17], glass);
    part([3.4, .22, 4.1], [0, .12 + 2.02, -1.7], red);
    // A stubby mast with a lamp, and a railing along each side of the fore deck.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 2.6, 6), iron);
    mast.position.set(0, .12 + 3.3, -2.2);
    this.boat.add(mast);
    part([.3, .3, .3], [0, .12 + 4.6, -2.2], mat(0xf2dd9a));
    // On the pier side the rail starts aft of where the gangway comes aboard
    // (local z .85..1.95), so the way off the boat is open.
    for (const side of [-1, 1]) {
      const from = side < 0 ? 2.1 : .5;
      for (const z of side < 0 ? [2.1, 3.0, 4.0] : [.6, 1.8, 3.0, 4.0]) part([.06, .7, .06], [side * (beam / 2 - .35 - Math.max(0, z - 2.6) * .45), .12 + .35 + (z > 3 ? .1 : 0), z], white);
      part([.07, .07, 4.1 - from], [side * (beam / 2 - .5), .12 + .72, (from + 4.1) / 2], white);
    }
    // A life ring on the wheelhouse side facing the pier.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.36, .1, 5, 10), mat(0xe8612c));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(-1.47, .12 + 1.0, -1.1);
    this.boat.add(ring);
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
   * as one even ramp from the quay to the deck (as the temple's are), then
   * the boards of the pier and its head.
   */
  heightAt(x: number, z: number): number | undefined {
    const stepsFrom = QUAY_Z - .6, stepsTo = ROOT_Z - .6;
    if (Math.abs(x - PIER_X) < WIDTH / 2 && z >= stepsFrom - LANDING && z < stepsFrom) return this.quayTop;
    if (Math.abs(x - PIER_X) < WIDTH / 2 && z >= stepsFrom && z < stepsTo) {
      return THREE.MathUtils.lerp(this.quayTop, DECK_Y + .08, (z - stepsFrom) / (stepsTo - stepsFrom));
    }
    if (Math.abs(x - PIER_X) < WIDTH / 2 && z >= stepsTo && z <= HEAD_Z - 3) return DECK_Y + .08;
    if (Math.abs(x - PIER_X) < HEAD_W / 2 && z >= HEAD_Z - 3 && z <= HEAD_Z + HEAD_D - 3) return DECK_Y + .08;
    return undefined;
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
    out.push([(-half - gap) / 2, QUAY_Z - .15, half - gap, t], [(half + gap) / 2, QUAY_Z - .15, half - gap, t]);
    for (const side of [-1, 1]) {
      out.push([side * (half - .15), QUAY_Z + 30, t, 60]);
      out.push([PIER_X + side * (WIDTH / 2 + .15), (QUAY_Z + HEAD_Z - 3) / 2, t, HEAD_Z - 3 - QUAY_Z]);
      out.push([PIER_X + side * (HEAD_W / 2 + .15), HEAD_Z - 3 + HEAD_D / 2, t, HEAD_D]);
      out.push([PIER_X + side * (HEAD_W / 2 + WIDTH / 2) / 2, HEAD_Z - 3 - .15, (HEAD_W - WIDTH) / 2, t]);
    }
    out.push([PIER_X, HEAD_Z + HEAD_D - 3 + .15, HEAD_W + .6, t]);
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

  /** The ferry rides the swell a little: heave, roll and pitch, slow. */
  update(elapsed: number): void {
    this.boat.position.y = this.boatHome.y + Math.sin(elapsed * .9) * .07;
    this.boat.rotation.z = Math.sin(elapsed * .7 + 1) * .025;
    this.boat.rotation.x = Math.sin(elapsed * .55) * .012;
  }
}
