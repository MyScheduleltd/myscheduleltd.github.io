import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadPixelSign } from './Ps1Signs';
import { loadLightBoxFace } from './Ps1LightBoxHousing';
import { ps1SurfaceTexture, type Ps1SurfaceKind } from './Ps1Surfaces';
import { worldSurfaceUV } from './CoastalSurfaces';

/**
 * Street clutter for the PS1 restyle's pilot (the owner, 2026-11-09: MY SQUARE
 * and the temple/rooftop street first, as a retro Taipei film district). What
 * makes a Taipei street read as one at a glance, in the owner's references and
 * the agreed concept: window air-conditioners on every wall, concrete utility
 * poles with a tangle of wires, rows of parked scooters, rolling steel shutters,
 * barred windows, and vertical light-box signs.
 *
 * Built to the town's own rules (CoastalScenery): flat-coloured parts merge
 * into one vertex-coloured mesh, the few textured parts share three drawn
 * 16–32-pixel tiles, and anything standing on the ground is placed only where
 * the world says nobody walks, with a collider. Wall-mounted pieces start above
 * head height (an avatar is 3.46 units) and take no collider. One unit is about
 * half a metre.
 */
export interface Ps1PropHost {
  scene: THREE.Scene;
  /** Adds a physical collider, as CoastalScenery's `solid`. */
  solid: (x: number, z: number, w: number, d: number, base: number, top: number, label: string) => void;
  /** Whether a round footprint is clear of buildings and walkways. */
  clear: (x: number, z: number, radius: number) => boolean;
  groundAt: (x: number, z: number) => number;
  /** The surface people actually walk on here (paving, road, path), not the bare terrain. */
  surfaceAt: (x: number, z: number) => number;
  /**
   * Somewhere for snow to settle (FestivalWeather). A cover keeps the ground
   * under it clear and stops falling snow and rain; a detail only catches snow.
   */
  snowSurface?: (id: string, object: THREE.Object3D, cover: boolean) => void;
}

/**
 * How high above the walking surface anything overhead must start (the owner,
 * 2026-11-09: avatars clipped through signs and awnings). The body collides up
 * to 3.33, hair reaches about 3.9; 4.4 clears both, and each overhead piece
 * also gets a collider from its underside up, so a jump bumps it rather than
 * passing through.
 */
export const PS1_OVERHEAD_CLEARANCE = 4.4;

/** A sign's art; `aspect` is its face's width over height (square shop boxes 1, the tall 皇宮戲院 9/16). */
export interface Ps1LightBox { url: string; name: string; aspect?: number }

export interface Ps1PropReport {
  airConditioners: number;
  poles: number;
  wireSpans: number;
  scooters: number;
  shutters: number;
  windows: number;
  lightBoxes: number;
  umbrellas: number;
  skipped: string[];
  /** Every placed piece's world bounds, for the loopback clipping check. */
  parts: Array<{ label: string; min: number[]; max: number[] }>;
  /** Light-box faces: the caller lights them with the street lamps. */
  lampMaterials: THREE.MeshStandardMaterial[];
}

/** The rooftop building's shell (FestivalWorld rooftopBounds) and its deck height. */
export interface Ps1RooftopShell { minX: number; maxX: number; minZ: number; maxZ: number; stairMinZ: number; stairMaxZ: number; roofY: number }

type Rgb = number;

function drawnTile(width: number, height: number, paint: (x: number, y: number) => number, name: string): THREE.DataTexture {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const rgb = paint(x, y), i = (y * width + x) * 4;
    pixels[i] = (rgb >> 16) & 255; pixels[i + 1] = (rgb >> 8) & 255; pixels[i + 2] = rgb & 255; pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Striped awning canvas, faded blue and cream, with a scalloped valance edge. */
const awningTile = () => drawnTile(16, 8, (x, y) => {
  const stripe = Math.floor(x / 4) % 2 === 0;
  if (y === 7) return x % 4 === 1 || x % 4 === 2 ? (stripe ? 0x2e4f7a : 0xd8d0b8) : 0x1a1a1a;
  const fade = y < 2 ? 12 : 0;
  return stripe ? 0x355a88 + fade * 0x010101 : 0xe2dac2 - (y > 5 ? 0x0a0a0a : 0);
}, 'PS1 awning');

/** A window unit's face: louvres over a round fan, in a yellowed casing. */
const airConditionerFace = () => drawnTile(16, 12, (x, y) => {
  if (x === 0 || y === 0 || x === 15 || y === 11) return 0x8c8778;
  const dx = x - 10.5, dy = y - 5.5, r = Math.hypot(dx, dy);
  if (r < 4.2) return r > 3.2 ? 0x45464a : (x + y) % 2 ? 0x2a2b2e : 0x5c5e62;
  if (x < 6) return y % 2 ? 0x6d6a60 : 0xb9b3a2;
  return 0xc9c3b2;
}, 'PS1 air conditioner face');

/** A rolling steel shutter: ribbed slats, rust at the foot, a lock bar. */
const shutterTile = () => drawnTile(16, 32, (x, y) => {
  if (y >= 29) return y === 31 ? 0x3d3a36 : 0x5b4d40;
  if (y >= 26 && x >= 6 && x <= 9) return 0x2f3031;
  const rib = y % 3 === 0 ? 0x6f736f : y % 3 === 1 ? 0xa3a69f : 0x8b8f89;
  const rust = y > 22 && (x * 7 + y * 3) % 11 === 0;
  return rust ? 0x7a5a42 : rib;
}, 'PS1 rolling shutter');

/**
 * A window behind an iron grille, curtain half drawn. The glass was near
 * black; in the sunny street it is the anime sky-blue glass with a reflection
 * across its top (the owner, 2026-11-11).
 */
const windowTile = () => drawnTile(16, 16, (x, y) => {
  if (x === 0 || y === 0 || x === 15 || y === 15) return 0x9a9a8e;
  if (x % 4 === 2 || y % 5 === 2) return 0x5e6460;
  if (x < 7 && y > 2) return y % 2 ? 0xc9b48e : 0xd8c49c;
  if (x + y < 9) return 0xb8d4e6;
  return y < 4 ? 0x7fa4c2 : 0x5a7d9c;
}, 'PS1 barred window');

/**
 * A drinks machine's face (2026-11-11, the owner's Japanese street
 * references): a lit window of sample cans in four rows, the price buttons
 * under each, the coin panel and the dark slot below. Invented, no brand.
 */
const vendingFace = () => drawnTile(16, 32, (x, row) => {
  // Rows are stored bottom first; drawn here top first.
  const y = 31 - row;
  const cans = [0xd2453a, 0x3f7fc2, 0xf0d24e, 0x4fa36a, 0xe9e4d8, 0xe0874a];
  if (x === 0 || x === 15) return 0xdedad0;
  if (y < 3) return y === 1 ? 0x2f6fb0 : 0xe8e4da;
  if (y >= 3 && y < 19) {
    const row = Math.floor((y - 3) / 4), cell = y - 3 - row * 4, col = Math.floor((x - 1) / 2);
    if (cell === 3) return (x % 2) ? 0x3a3c40 : 0xf1c64a;
    if (cell === 0) return 0xf6f4ee;
    return x % 2 === 0 ? 0xf6f4ee : cans[(col + row * 2) % cans.length];
  }
  if (y < 26) return x >= 11 && y >= 20 && y <= 24 ? (y === 22 ? 0x2a2b2e : 0x9aa0a6) : 0xeeeae2;
  if (y < 30) return x >= 3 && x <= 12 ? 0x1d1e21 : 0xe2ded4;
  return 0xbab6ac;
}, 'PS1 drinks machine');

export class Ps1StreetProps {
  private readonly paint: THREE.BufferGeometry[] = [];
  /** Awnings: the pieces that shelter what is under them from snow and rain. */
  private readonly covers = new Set<THREE.BufferGeometry>();
  private readonly snowNames = new Map<string, number>();
  private readonly textured = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly wires: number[] = [];
  private readonly report: Ps1PropReport = { airConditioners: 0, poles: 0, wireSpans: 0, scooters: 0, shutters: 0, windows: 0, lightBoxes: 0, umbrellas: 0, skipped: [], parts: [], lampMaterials: [] };
  private readonly acMaterial: THREE.MeshStandardMaterial;
  private readonly shutterMaterial: THREE.MeshStandardMaterial;
  private readonly windowMaterial: THREE.MeshStandardMaterial;
  private readonly awningMaterial: THREE.MeshStandardMaterial;
  private readonly vendingMaterial: THREE.MeshStandardMaterial;

  constructor(private readonly host: Ps1PropHost) {
    // Each placing method records the bounds of what it adds, so a loopback
    // check can test every piece against the buildings it hangs on.
    const self = this as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ['airConditioner', 'shutter', 'window', 'lightBox', 'pole', 'poster', 'tiledBlock', 'awning', 'umbrella', 'bulbs', 'scooterLine', 'vendingMachine', 'cone', 'plantPot', 'vine']) {
      const place = self[name].bind(this);
      self[name] = (...args: unknown[]) => this.record(name, () => place(...args));
    }
    const surface = (map: THREE.Texture, roughness: number) => {
      const material = new THREE.MeshStandardMaterial({ map, roughness, metalness: .05 });
      material.userData.wornNoMasonry = true;
      return material;
    };
    this.acMaterial = surface(airConditionerFace(), .7);
    this.shutterMaterial = surface(shutterTile(), .6);
    this.windowMaterial = surface(windowTile(), .5);
    this.awningMaterial = surface(awningTile(), .9);
    this.awningMaterial.side = THREE.DoubleSide;
    // The machine's window is lit, a little by day and properly after dark.
    this.vendingMaterial = surface(vendingFace(), .45);
    this.vendingMaterial.emissive.set(0xffffff);
    this.vendingMaterial.emissiveMap = this.vendingMaterial.map;
    this.vendingMaterial.emissiveIntensity = .28;
    this.report.lampMaterials.push(this.vendingMaterial);
  }

  private record<T>(kind: string, build: () => T): T {
    const paintStart = this.paint.length, childStart = this.host.scene.children.length;
    const texturedStart = new Map([...this.textured].map(([material, list]) => [material, list.length]));
    const result = build();
    const box = new THREE.Box3(), part = new THREE.Box3();
    for (const geometry of this.paint.slice(paintStart)) { geometry.computeBoundingBox(); box.union(geometry.boundingBox!); }
    for (const [material, list] of this.textured) for (const geometry of list.slice(texturedStart.get(material) ?? 0)) { geometry.computeBoundingBox(); box.union(geometry.boundingBox!); }
    for (const object of this.host.scene.children.slice(childStart)) {
      object.userData.ps1Prop = true;
      object.updateWorldMatrix(true, true);
      box.union(part.setFromObject(object));
    }
    if (!box.isEmpty()) {
      const centre = box.getCenter(new THREE.Vector3());
      this.report.parts.push({ label: `${kind} @ ${centre.x.toFixed(1)},${centre.y.toFixed(1)},${centre.z.toFixed(1)}`, min: box.min.toArray(), max: box.max.toArray() });
    }
    return result;
  }

  /** A flat-coloured box, turned about Y, into the merged vertex-coloured mesh. */
  box(size: [number, number, number], at: [number, number, number], colour: Rgb, turn = 0, tilt?: THREE.Euler): void {
    const geometry = new THREE.BoxGeometry(...size).toNonIndexed();
    if (tilt) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(tilt));
    if (turn) geometry.rotateY(turn);
    geometry.translate(...at);
    this.colour(geometry, colour);
  }

  cylinder(radius: number, height: number, at: [number, number, number], colour: Rgb, sides = 6, along?: THREE.Euler): void {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, sides).toNonIndexed();
    if (along) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(along));
    geometry.translate(...at);
    this.colour(geometry, colour);
  }

  /** A box with rounded edges (a light-box's housing), painted like `box`. */
  roundedBox(size: [number, number, number], at: [number, number, number], colour: Rgb, turn = 0, radius = .1): void {
    const geometry = new RoundedBoxGeometry(...size, 3, Math.min(radius, Math.min(...size) / 2 - .001)).toNonIndexed();
    if (turn) geometry.rotateY(turn);
    geometry.translate(...at);
    this.colour(geometry, colour);
  }

  private colour(geometry: THREE.BufferGeometry, hex: Rgb): void {
    const c = new THREE.Color(hex), count = geometry.getAttribute('position').count, colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([c.r, c.g, c.b], i * 3);
    geometry.deleteAttribute('uv');
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    this.paint.push(geometry);
  }

  /** A flat panel facing `normal` (one of ±X, ±Z), textured once across. */
  private panel(material: THREE.Material, width: number, height: number, at: [number, number, number], normal: [number, number], repeatX = 1, repeatY = 1): void {
    const geometry = new THREE.PlaneGeometry(width, height);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
    geometry.rotateY(Math.atan2(normal[0], normal[1]));
    geometry.translate(...at);
    const list = this.textured.get(material) ?? [];
    list.push(geometry.toNonIndexed());
    this.textured.set(material, list);
  }

  /** A window unit on brackets, its face toward `normal`. `at` is the wall point. */
  airConditioner(at: [number, number, number], normal: [number, number], stain = true): void {
    const [x, y, z] = at, [nx, nz] = normal, turn = Math.atan2(nx, nz);
    const out = (d: number): [number, number] => [x + nx * d, z + nz * d];
    const [bx, bz] = out(.42);
    this.box([1.5, 1.05, .78], [bx, y, bz], 0xc6c0ae, turn);
    const [fx, fz] = out(.815);
    this.panel(this.acMaterial, 1.42, .98, [fx, y, fz], normal);
    // Two angle-iron brackets and a rust stain the drip has left below.
    for (const side of [-.55, .55]) {
      const sx = x + nz * side + nx * .4, sz = z - nx * side + nz * .4;
      this.box([.08, .08, .8], [sx, y - .58, sz], 0x3a3936, turn);
    }
    // The rust streak the drip leaves, unless something hangs below it (an awning).
    if (stain) { const [sx, sz] = out(.02); this.box([.22, 1.1, .02], [sx + nz * .45, y - 1.15, sz - nx * .45], 0x6e5c48, turn); }
    this.overhead(x + nx * .42, z + nz * .42, nx ? .84 : 1.6, nx ? 1.6 : .84, y - .6, y + .55, 'ps1-air-conditioner');
    this.report.airConditioners++;
  }

  /** A shutter flush on a wall, `at` its foot centre. */
  shutter(at: [number, number, number], normal: [number, number], width: number, height: number): void {
    const [x, y, z] = at, [nx, nz] = normal, turn = Math.atan2(nx, nz);
    this.panel(this.shutterMaterial, width, height, [x + nx * .07, y + height / 2, z + nz * .07], normal, Math.max(1, Math.round(width / 1.6)), 1);
    // A slim head box: anything deeper reaches into a passing head.
    this.box([width + .3, .45, .2], [x + nx * .1, y + height + .2, z + nz * .1], 0x5d605b, turn);
    // The panel and head box stand .2 proud of the wall the building's
    // collider stops at, so a body pressed against the wall went into them
    // (the owner, 2026-11-11).
    const along = Math.abs(nx) > Math.abs(nz);
    this.host.solid(x + nx * .1, z + nz * .1, along ? .25 : width + .3, along ? width + .3 : .25, y, y + height + .45, 'ps1-shutter');
    this.report.shutters++;
  }

  /** A spot left empty because it was in the way, for the report. */
  skipped(label: string): void { this.report.skipped.push(label); }

  /**
   * A drinks machine standing against a wall (the owner's Japanese street
   * references, 2026-11-11), `at` the wall at its foot, `normal` out from it.
   * Two metres tall in a world where the avatar is 3.46 for 1.75 m. Stops a body.
   */
  vendingMachine(at: [number, number, number], normal: [number, number], body: Rgb = 0xf0ede6): void {
    const [x, y, z] = at, [nx, nz] = normal, turn = Math.atan2(nx, nz);
    const w = 1.9, d = 1.45, h = 3.7, cx = x + nx * (d / 2 + .04), cz = z + nz * (d / 2 + .04);
    this.roundedBox([w, h, d], [cx, y + h / 2, cz], body, turn, .1);
    this.panel(this.vendingMaterial, w * .84, h * .86, [cx + nx * (d / 2 + .012), y + h * .5, cz + nz * (d / 2 + .012)], normal);
    // A plinth and the recycling bin beside it.
    this.box([w + .1, .16, d + .1], [cx, y + .08, cz], 0x6d6f70, turn);
    const side = .2 + w / 2 + .38, bx = cx + nz * side, bz = cz - nx * side;
    this.cylinder(.34, 1.25, [bx, y + .62, bz], 0x2f6fb0, 8);
    this.cylinder(.36, .08, [bx, y + 1.27, bz], 0xd8d4c8, 8);
    const along = Math.abs(nx) > Math.abs(nz);
    this.host.solid(cx, cz, along ? d : w, along ? w : d, y, y + h, 'ps1-vending-machine');
    this.host.solid(bx, bz, .72, .72, y, y + 1.3, 'ps1-recycling-bin');
  }

  /** A traffic cone, white-banded orange. Stops a body. */
  cone(x: number, z: number): void {
    const y = this.host.surfaceAt(x, z);
    this.box([.62, .08, .62], [x, y + .04, z], 0x2a2a2a);
    const g = new THREE.ConeGeometry(.28, 1.3, 8).toNonIndexed();
    g.translate(x, y + .73, z);
    this.colour(g, 0xe2602e);
    this.cylinder(.2, .2, [x, y + .78, z], 0xf2efe6, 8);
    this.host.solid(x, z, .6, .6, y, y + 1.4, 'ps1-cone');
  }

  /** A potted shrub by a door, a Japanese street's doorstep garden. Stops a body. */
  plantPot(x: number, z: number, leaf: Rgb = 0x5f9a52): void {
    const y = this.host.surfaceAt(x, z);
    this.cylinder(.42, .8, [x, y + .4, z], 0xb5653f, 8);
    this.cylinder(.46, .1, [x, y + .82, z], 0xc9774d, 8);
    for (const [dx, dy, dz, r] of [[0, 1.35, 0, .62], [.28, 1.1, .16, .42], [-.26, 1.18, -.12, .44]] as const) {
      const g = new THREE.IcosahedronGeometry(r, 0).toNonIndexed();
      g.translate(x + dx, y + dy, z + dz);
      this.colour(g, leaf);
    }
    this.host.solid(x, z, .9, .9, y, y + 2, 'ps1-plant-pot');
  }

  /**
   * Ivy climbing a wall from the ground, in two greens, as on the konbini in
   * the owner's references. Flat to the wall (a few centimetres proud), so it
   * needs no collider.
   */
  vine(at: [number, number, number], normal: [number, number], height: number, seed = 1): void {
    const [x, y, z] = at, [nx, nz] = normal, turn = Math.atan2(nx, nz);
    const tx = nz, tz = -nx;
    let off = 0;
    for (let i = 0; i < Math.ceil(height / .45); i++) {
      const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453, r = v - Math.floor(v);
      off = Math.max(-.6, Math.min(.6, off + (r - .5) * .5));
      const size = .5 + r * .45, h = y + .25 + i * .45;
      this.box([size, .42, .05], [x + tx * off + nx * .045, h, z + tz * off + nz * .045], i % 3 ? 0x5d9150 : 0x4a7d44, turn);
      if (r > .55) this.box([.32, .3, .05], [x + tx * (off + (r > .8 ? .45 : -.45)) + nx * .05, h + .1, z + tz * (off + (r > .8 ? .45 : -.45)) + nz * .05], 0x6aa35a, turn);
    }
  }

  /**
   * A striped awning sloping out from a wall: `top` is where it meets the wall
   * (centre), `depth` how far it reaches, `drop` how far its front falls.
   */
  awning(top: [number, number, number], normal: [number, number], width: number, depth: number, drop: number): void {
    const [x, y, z] = top, [nx, nz] = normal;
    const geometry = new THREE.PlaneGeometry(width, Math.hypot(depth, drop));
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / 4, uv.getY(i));
    geometry.rotateX(-Math.PI / 2 + Math.atan2(drop, depth));
    geometry.rotateY(Math.atan2(nx, nz));
    geometry.translate(x + nx * depth / 2, y - drop / 2, z + nz * depth / 2);
    const list = this.textured.get(this.awningMaterial) ?? [];
    const cover = geometry.toNonIndexed();
    list.push(cover);
    this.covers.add(cover);
    this.textured.set(this.awningMaterial, list);
    // The valance hanging from the front edge.
    this.panel(this.awningMaterial, width, .45, [x + nx * (depth + .01), y - drop - .2, z + nz * (depth + .01)], normal, width / 4, 1);
    this.overhead(x + nx * depth / 2, z + nz * depth / 2, nx ? depth + .1 : width, nx ? width : depth + .1, y - drop - .45, y + .1, 'ps1-awning');
  }

  /** A collider from an overhead piece's underside up: walked under, bumped by a jump. */
  private overhead(x: number, z: number, w: number, d: number, bottom: number, top: number, label: string): void {
    this.host.solid(x, z, w, d, bottom, top, label);
  }

  /** The lowest an overhead piece may hang at a point: the walking surface plus the clearance. */
  clearAbove(x: number, z: number): number {
    return this.host.surfaceAt(x, z) + PS1_OVERHEAD_CLEARANCE;
  }

  /** A barred window with a sill. */
  window(at: [number, number, number], normal: [number, number], width = 1.8, height = 1.6): void {
    const [x, y, z] = at, [nx, nz] = normal, turn = Math.atan2(nx, nz);
    this.panel(this.windowMaterial, width, height, [x + nx * .06, y, z + nz * .06], normal);
    this.box([width + .3, .14, .34], [x + nx * .15, y - height / 2 - .07, z + nz * .15], 0x8d897d, turn);
    this.report.windows++;
  }

  /**
   * A light-box sticking out from a wall at right angles, printed on both
   * faces so it reads up and down the street, in a rounded housing (the
   * owner, 2026-11-10: Showa-era light-boxes). Its foot is `bottom`. It
   * reaches as far from the wall as the tall boxes it replaced (`height` at
   * 56:99); a square box is that wide and as tall.
   */
  lightBox(sign: Ps1LightBox, wall: [number, number, number], normal: [number, number], bottom: number, tallHeight = 3.6, standOff = .2): void {
    const [x, , z] = wall, [nx, nz] = normal;
    const depth = tallHeight * 56 / 99, height = depth / (sign.aspect ?? 56 / 99), thick = .32, rim = .12;
    // Held `standOff` from the wall on its bracket, clear of any eave or slab edge.
    const cx = x + nx * (depth / 2 + rim + standOff), cz = z + nz * (depth / 2 + rim + standOff), cy = bottom + rim + height / 2;
    const texture = loadLightBoxFace(sign.url, `PS1 light-box ${sign.name}`);
    // A soft backlight at night: full white made the deep faces glow bright red (the owner, 2026-11-10: "reds too bright").
    // Pulled forward in the depth test, and 3 cm proud of the housing, so it
    // never flickers with it far off (2026-11-10).
    const face = new THREE.MeshStandardMaterial({ map: texture, emissive: 0x7a7a7a, emissiveMap: texture, emissiveIntensity: 0, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    face.name = `PS1 light-box ${sign.name}`;
    face.userData.wornNoMasonry = true;
    this.report.lampMaterials.push(face);
    // Faces look along the wall, so turn a +Z plane a quarter round the normal.
    const along: [number, number] = [-nz, nx];
    for (const side of [1, -1]) {
      const geometry = new THREE.PlaneGeometry(depth, height);
      geometry.rotateY(Math.atan2(along[0] * side, along[1] * side));
      geometry.translate(cx + along[0] * side * (thick / 2 + .03), cy, cz + along[1] * side * (thick / 2 + .03));
      const mesh = new THREE.Mesh(geometry, face);
      mesh.name = `${sign.name} light-box`;
      this.host.scene.add(mesh);
    }
    this.roundedBox([depth + rim * 2, height + rim * 2, thick], [cx, cy, cz], 0xd6d1c4, Math.atan2(along[0], along[1]), rim);
    // Two arms from the wall to the housing's back edge, top and bottom.
    const reach = rim + standOff;
    for (const y of [bottom + rim + height * .82, bottom + rim + height * .18]) {
      this.box([.1, .12, reach + .06], [x + nx * reach / 2, y, z + nz * reach / 2], 0x2d2f30, Math.atan2(nx, nz));
    }
    this.overhead(cx, cz, nx ? depth + rim * 2 + .1 : thick + .1, nx ? thick + .1 : depth + rim * 2 + .1, bottom, bottom + height + rim * 2 + .1, 'ps1-light-box');
    this.report.lightBoxes++;
  }

  /**
   * A concrete pole with a crossarm of insulators, if its spot is clear.
   * Returns the wire anchors. The arm runs along `arm` (x, z), across the
   * line, so the wires never run along it or through each other's insulators.
   */
  pole(x: number, z: number, label: string, transformer = false, arm: readonly [number, number] = [1, 0]): THREE.Vector3[] | undefined {
    if (!this.host.clear(x, z, .7)) { this.report.skipped.push(label); return undefined; }
    const base = this.host.groundAt(x, z), height = 13.5;
    this.cylinder(.26, height, [x, base + height / 2, z], 0x8e8a7f, 6);
    this.box([.34, .34, .34], [x, base + .17, z], 0x77736a);
    // Climbing pegs, a few warning stripes, the crossarm and its insulators.
    for (let i = 0; i < 6; i++) this.box([.5, .07, .07], [x, base + 3.4 + i * 1.3, z], 0x4a4946, i % 2 ? Math.PI / 2 : 0);
    for (let i = 0; i < 4; i++) this.box([.56, .26, .56], [x, base + .6 + i * .52, z], i % 2 ? 0xcfb23c : 0x252526);
    const armY = base + height - .7, length = Math.hypot(arm[0], arm[1]) || 1;
    const ax = arm[0] / length, az = arm[1] / length, turn = Math.atan2(-az, ax);
    this.box([3.2, .2, .2], [x, armY, z], 0x4a4a47, turn);
    const anchors: THREE.Vector3[] = [];
    for (const d of [-1.35, 0, 1.35]) {
      this.cylinder(.09, .32, [x + ax * d, armY + .26, z + az * d], 0xd6d1c4, 5);
      anchors.push(new THREE.Vector3(x + ax * d, armY + .42, z + az * d));
    }
    if (transformer) {
      this.cylinder(.48, 1.5, [x + ax * .62, armY - 2.1, z + az * .62], 0x6d7a72, 8);
      this.box([.2, .2, .7], [x + ax * .3, armY - 1.6, z + az * .3], 0x4a4a47, turn);
    }
    this.host.solid(x, z, .62, .62, base, base + height, label);
    this.report.poles++;
    return anchors;
  }

  /**
   * A service drop from a pole (its anchors, as `pole` returns them) to a
   * wall: it leaves from a bracket on the shaft below the crossarm, on the
   * side facing the wall, so it never cuts through the arm or its insulators.
   */
  drop(pole: readonly THREE.Vector3[], to: THREE.Vector3, level: number, sag: number): void {
    const top = pole[1], armY = top.y - .42;
    const dx = to.x - top.x, dz = to.z - top.z, reach = Math.hypot(dx, dz) || 1;
    const ux = dx / reach, uz = dz / reach, y = armY - 1.2 - level * .35;
    this.box([.36, .1, .1], [top.x + ux * .3, y - .08, top.z + uz * .3], 0x4a4a47, Math.atan2(-uz, ux));
    this.cylinder(.06, .18, [top.x + ux * .44, y, top.z + uz * .44], 0xd6d1c4, 5);
    this.wire(new THREE.Vector3(top.x + ux * .44, y + .09, top.z + uz * .44), to, sag);
  }

  /** A sagging wire from a to b, as short straight runs. */
  wire(a: THREE.Vector3, b: THREE.Vector3, sag: number): void {
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      for (const t of [i / steps, (i + 1) / steps]) {
        const p = a.clone().lerp(b, t);
        p.y -= sag * 4 * t * (1 - t);
        this.wires.push(p.x, p.y, p.z);
      }
    }
    this.report.wireSpans++;
  }

  /** A parked step-through scooter, nose along `heading` (radians about Y). */
  scooter(x: number, z: number, heading: number, body: Rgb): void {
    const base = this.host.groundAt(x, z);
    const local = (dx: number, dy: number, dz: number): [number, number, number] => {
      const s = Math.sin(heading), c = Math.cos(heading);
      return [x + dx * c + dz * s, base + dy, z - dx * s + dz * c];
    };
    const wheel = new THREE.Euler(0, 0, Math.PI / 2);
    for (const dz of [-1.15, 1.2]) {
      const geometry = new THREE.CylinderGeometry(.42, .42, .26, 8).toNonIndexed();
      geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(wheel));
      geometry.rotateY(heading);
      geometry.translate(...local(0, .42, dz));
      this.colour(geometry, 0x18181a);
    }
    this.box([.62, .5, 2.1], local(0, .78, -.1), body, heading);
    this.box([.66, .9, .8], local(0, 1.2, -.75), body, heading);
    this.box([.52, .2, .95], local(0, 1.72, -.75), 0x1c1c1e, heading);
    this.box([.66, 1.35, .22], local(0, 1.45, .95), body, heading, new THREE.Euler(-.22, 0, 0));
    this.box([1.05, .1, .1], local(0, 2.25, 1.0), 0x8f8f8c, heading);
    this.box([.3, .22, .12], local(0, 2.05, 1.17), 0xe6dcb8, heading);
    this.box([.5, .45, .5], local(0, 1.3, -1.55), 0x2a2a2c, heading);
    this.report.scooters++;
  }

  /** A row of scooters parked side by side along X, if the strip is clear. */
  scooterRow(x0: number, z: number, count: number, heading: number, label: string, palette: Rgb[]): void {
    this.scooterLine(x0, z, 'x', count, heading, label, palette);
  }

  /** The same along either axis: `along` is the direction the row runs. */
  scooterLine(x0: number, z0: number, along: 'x' | 'z', count: number, heading: number, label: string, palette: Rgb[]): void {
    const spacing = 1.35, at = (i: number): [number, number] => along === 'x'
      ? [x0 + i * spacing, z0 + (i % 2 ? .15 : -.1)] : [x0 + (i % 2 ? .15 : -.1), z0 + i * spacing];
    for (let i = 0; i < count; i++) if (!this.host.clear(...at(i), .8)) { this.report.skipped.push(`${label} ${i}`); return; }
    for (let i = 0; i < count; i++) this.scooter(...at(i), heading + (i % 3 - 1) * .08, palette[i % palette.length]);
    const length = count * spacing + .4, [mx, mz] = along === 'x' ? [x0 + (count - 1) * spacing / 2, z0] : [x0, z0 + (count - 1) * spacing / 2];
    const ground = this.host.groundAt(mx, mz);
    this.host.solid(mx, mz, along === 'x' ? length : 3.2, along === 'x' ? 3.2 : length, ground, ground + 2.4, label);
  }

  /** A framed poster on a wall facing `normal`; `lit` ones glow at night like a lit case. */
  poster(sign: Ps1LightBox, at: [number, number, number], width: number, height: number, lit: boolean, normal: [number, number] = [0, 1]): void {
    const map = loadPixelSign(sign.url, `PS1 poster ${sign.name}`);
    const material = new THREE.MeshStandardMaterial({ map, roughness: .55, emissive: lit ? 0xffffff : 0x000000, emissiveMap: lit ? map : null, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    material.userData.wornNoMasonry = true;
    if (lit) this.report.lampMaterials.push(material);
    const turn = Math.atan2(normal[0], normal[1]);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(at[0] + normal[0] * .09, at[1], at[2] + normal[1] * .09);
    mesh.rotation.y = turn;
    mesh.name = `${sign.name} poster`;
    this.host.scene.add(mesh);
    this.box([width + .24, height + .24, .1], [at[0] + normal[0] * .01, at[1], at[2] + normal[1] * .01], 0x2a2622, turn);
  }

  /** A solid block clad in one of the drawn tiles, in world-scaled texels. */
  tiledBlock(x: [number, number], z: [number, number], y: [number, number], tint: number, kind: Ps1SurfaceKind, metres: number, name: string): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(x[1] - x[0], y[1] - y[0], z[1] - z[0]).toNonIndexed();
    geometry.translate((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2);
    worldSurfaceUV(geometry, metres);
    const material = new THREE.MeshStandardMaterial({ map: ps1SurfaceTexture(kind), color: tint, roughness: .86, metalness: .02 });
    material.userData.wornNoMasonry = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    this.host.scene.add(mesh);
    const count = (this.snowNames.get(name) ?? 0) + 1;
    this.snowNames.set(name, count);
    this.host.snowSurface?.(count > 1 ? `${name} ${count}` : name, mesh, true);
    return mesh;
  }

  /** A beach umbrella: a pole and a canopy of eight alternating stripes, if the spot is clear. */
  umbrella(x: number, z: number, label: string, colours: [Rgb, Rgb] = [0xc23a30, 0xefe6d2]): boolean {
    if (!this.host.clear(x, z, .5)) { this.report.skipped.push(label); return false; }
    // The eave clears heads anywhere under the canopy, sloping sand included.
    const base = this.host.groundAt(x, z), radius = 2.2;
    let floor = this.host.surfaceAt(x, z);
    for (let i = 0; i < 8; i++) floor = Math.max(floor, this.host.surfaceAt(x + Math.cos(i * Math.PI / 4) * radius, z + Math.sin(i * Math.PI / 4) * radius));
    const eave = floor + PS1_OVERHEAD_CLEARANCE + .05, apex = eave + .85;
    this.cylinder(.07, apex - base, [x, (base + apex) / 2, z], 0xd8d2c4, 5);
    const positions: number[] = [], colours3: number[] = [];
    const tint = colours.map(c => new THREE.Color(c));
    for (let i = 0; i < 8; i++) {
      const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * radius, eave, z + Math.sin(a0) * radius], p1 = [x + Math.cos(a1) * radius, eave, z + Math.sin(a1) * radius];
      // Top, wound to face up; the underside, wound to face down.
      positions.push(x, apex, z, ...p1, ...p0, x, apex - .12, z, ...p0, ...p1);
      for (let k = 0; k < 6; k++) colours3.push(tint[i % 2].r, tint[i % 2].g, tint[i % 2].b);
    }
    const canopy = new THREE.BufferGeometry();
    canopy.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    canopy.setAttribute('color', new THREE.Float32BufferAttribute(colours3, 3));
    canopy.computeVertexNormals();
    // Snow on the canopy, but not a cover: the chairs and mats under beach
    // umbrellas collect snow and offer to wipe it (the owner, 2026-11-13).
    this.paint.push(canopy);
    this.host.solid(x, z, .3, .3, base, apex, label);
    this.overhead(x, z, radius * 1.6, radius * 1.6, eave - .05, apex, `${label}-canopy`);
    this.report.umbrellas++;
    return true;
  }

  /** Bulbs at these points, lit with the street lamps (a cinema marquee, an arch). */
  bulbs(points: THREE.Vector3[], label: string, radius = .15): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xf3e1b0, emissive: 0xffc46a, emissiveIntensity: 0, roughness: .4 });
    material.userData.wornNoMasonry = true;
    this.report.lampMaterials.push(material);
    const geometries = points.map(p => new THREE.SphereGeometry(radius, 6, 4).translate(p.x, p.y, p.z));
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (merged) { const mesh = new THREE.Mesh(merged, material); mesh.name = `${label} bulbs`; this.host.scene.add(mesh); }
  }

  /**
   * Snow on every prop that stands under the sky (the owner, 2026-11-13). The
   * props are drawn merged, so the weather reads two stand-ins built from the
   * same pieces, never drawn: the covers, which keep the ground under them
   * clear, and everything else, which only catches snow.
   */
  private registerSnow(): void {
    if (!this.host.snowSurface) return;
    const shape = (geometry: THREE.BufferGeometry) => {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      const only = new THREE.BufferGeometry();
      only.setAttribute('position', flat.getAttribute('position').clone());
      if (flat !== geometry) flat.dispose();
      return only;
    };
    const standIn = (pieces: THREE.BufferGeometry[], name: string) => {
      if (!pieces.length) return undefined;
      const shapes = pieces.map(shape), merged = mergeGeometries(shapes, false);
      shapes.forEach(g => g.dispose());
      if (!merged) return undefined;
      const mesh = new THREE.Mesh(merged);
      mesh.name = name; mesh.visible = false;
      mesh.updateMatrixWorld(true);
      return mesh;
    };
    const all = [...this.paint, ...[...this.textured.values()].flat()];
    const covers = standIn(all.filter(g => this.covers.has(g)), 'PS1 street props snow covers');
    const details = standIn(all.filter(g => !this.covers.has(g)), 'PS1 street props snow details');
    if (covers) this.host.snowSurface('ps1-street-covers', covers, true);
    if (details) this.host.snowSurface('ps1-street-details', details, false);
  }

  /** Merge and add everything; call once. */
  finish(): Ps1PropReport {
    const scene = this.host.scene;
    this.registerSnow();
    if (this.paint.length) {
      const merged = mergeGeometries(this.paint, false);
      this.paint.forEach(g => g.dispose());
      if (merged) {
        merged.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: .04, flatShading: true });
        material.userData.wornNoMasonry = true;
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = 'PS1 street props';
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
    for (const [material, geometries] of this.textured) {
      const merged = mergeGeometries(geometries, false);
      geometries.forEach(g => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `PS1 ${(material as THREE.MeshStandardMaterial).map?.name ?? 'panel'}s`;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    if (this.wires.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.wires, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x1b1b1d }));
      lines.name = 'PS1 overhead wires';
      scene.add(lines);
    }
    return this.report;
  }
}

/** A dock dormitory (CoastalTerrain INLAND_HOUSES): centre, width, depth, height, floor level. */
export type Ps1DockHouse = readonly [x: number, z: number, w: number, d: number, h: number, base: number];

export interface Ps1DockDressing {
  houses: readonly Ps1DockHouse[];
  lightBoxes: Ps1LightBox[];
  /** The town's existing poles on the east pavement (CoastalScenery), wire height included. */
  eastPoles: ReadonlyArray<readonly [number, number]>;
  eastWireY: number;
}

/**
 * The dock blocks (the owner, 2026-11-09: dress the dormitories arrivals pass
 * first). Their fronts already carry balconies and units; the side walls that
 * face the arrival street were bare. Each gets windows and units well above
 * head height; the two beside the street also get a shutter, two light-boxes
 * and a row of scooters, and the west pavement gets its own pole line with
 * service drops, as the east pavement already has.
 */
/** Returns the wire points of the west line's last pole, for the line to carry on from. */
function dressDock(props: Ps1StreetProps, host: Ps1PropHost, dock: Ps1DockDressing): THREE.Vector3[] | undefined {
  const nearest = [Math.min(...dock.houses.filter(h => h[0] < 0).map(h => Math.abs(h[0]))), Math.min(...dock.houses.filter(h => h[0] > 0).map(h => h[0]))];
  let boxes = 0;
  for (const [index, [x, z, w, d, h, base]] of dock.houses.entries()) {
    const toStreet: [number, number] = x < 0 ? [1, 0] : [-1, 0];
    const wallX = x + toStreet[0] * w / 2;
    const near = Math.abs(x) === (x < 0 ? nearest[0] : nearest[1]);
    const upper = base + Math.min(h - 1.6, 5.6);
    const slots: number[] = [];
    // Kept clear of the corner light-boxes (at 1.1 and 1.3 from each end).
    for (let at = z - d / 2 + 2.8; at <= z + d / 2 - 2.8 + 1e-6; at += (d - 5.6) / 3) slots.push(at);
    for (const [i, at] of slots.entries()) {
      if ((i + index) % 2) props.window([wallX, upper + .2, at], toStreet, 1.7, 1.5);
      else props.airConditioner([wallX, upper, at], toStreet);
    }
    if (!near) continue;
    // A shop at street level, its sign and its regulars' scooters.
    props.shutter([wallX, base, z + d * .12], toStreet, 4.4, 3.2);
    for (const at of [z - d / 2 + 1.1, z + d / 2 - 1.3]) {
      const sign = dock.lightBoxes[boxes++];
      if (sign) props.lightBox(sign, [wallX, 0, at], toStreet, Math.max(base + 3.7, props.clearAbove(wallX + toStreet[0] * 1.8, at)), 3.2);
    }
    props.scooterLine(wallX + toStreet[0] * 2.3, z - d / 2 + 2.2, 'z', 4, toStreet[0] > 0 ? Math.PI / 2 : -Math.PI / 2, `ps1-dock-scooters-${index}`, [0x2f4d6e, 0xc6bea9, 0x8f2f2b, 0x1f1f22]);
  }
  // West pavement: a pole line between the lamps (x -11 every ten), wired to the dormitory.
  const west = dock.houses.filter(h => h[0] < 0).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]))[0];
  let previous: THREE.Vector3[] | undefined;
  for (const [i, z] of [51, 41, 31].entries()) {
    const anchors = props.pole(-13.6, z, `ps1-dock-pole-${i}`, i === 1);
    if (anchors && previous) anchors.forEach((anchor, k) => props.wire(previous![k], anchor, .7 + k * .15));
    if (anchors && west && i === 0) {
      const [x, hz, w, d, , base] = west;
      // Past the light-box 1.1 from the wall's end, which they crossed (2026-11-10).
      for (const [k, dz] of [[0, -d / 2 + 3.5], [1, -d / 2 + 6.5]] as const) props.drop(anchors, new THREE.Vector3(x + w / 2 + .1, base + 6.4 - k * .2, hz + dz), k, 1.1);
    }
    previous = anchors ?? previous;
  }
  // East pavement: drops from the town's existing first pole to the dormitory.
  const east = dock.houses.filter(h => h[0] > 0).sort((a, b) => a[0] - b[0])[0];
  const pole = dock.eastPoles[0];
  if (east && pole) {
    const [x, hz, w, d, , base] = east;
    // Past the 照相館 light-box 1.1 from the wall's end, which they crossed (2026-11-10).
    for (const [k, dz] of [[-.8, -d / 2 + 3.5], [.8, -d / 2 + 6.5]] as const) {
      props.wire(new THREE.Vector3(pole[0] + k, host.groundAt(pole[0], pole[1]) + dock.eastWireY, pole[1]), new THREE.Vector3(x - w / 2 - .1, base + 6.4, hz + dz), 1.1);
    }
  }
  return previous;
}

/** The warehouse club's square-facing wall (FestivalWorld clubBounds). */
export interface Ps1PalacePosters {
  giant: Ps1LightBox & { aspect: number };
  side: Ps1LightBox & { aspect: number };
  cases: readonly Ps1LightBox[];
  vertical: Ps1LightBox;
}
export interface Ps1ClubWall { clubWallX: number; clubMinZ: number; clubMaxZ: number; doorMinZ: number; doorMaxZ: number; posters?: Ps1PalacePosters; lightBoxes?: Ps1LightBox[] }

/**
 * The square's west side (2026-11-09, continuing the art): the warehouse
 * club's long wall gets units under its high vents and two loading shutters,
 * the west pole line carries on over the warehouse street with drops to it,
 * and the Palace marquee gets its row of cinema bulbs.
 */
function dressWestSide(props: Ps1StreetProps, host: Ps1PropHost, club: Ps1ClubWall, westLine?: THREE.Vector3[]): void {
  // The wall is 0.8 thick about x -20, and its stone and metal cladding
  // (EnvironmentArchitecture, the basement) stands out to x -19.14 up to 8.54:
  // that is the face things are mounted on.
  const east: [number, number] = [1, 0], x = club.clubWallX + .9;
  const ground = (z: number) => host.groundAt(x, z);
  // The town's high vents sit at z 3.75, 10.5 and 37.75 (CoastalScenery); a unit under each, and two more.
  for (const z of [3.4, 10.5, 16.5, 29, 37.75]) {
    if (z > club.doorMinZ - 1 && z < club.doorMaxZ + 1) continue;
    props.airConditioner([x, props.clearAbove(x + 1, z) + .6, z], east);
  }
  for (const z of [7.1, 34]) props.shutter([x, ground(z), z], east, 5, 4.2);
  // The west pavement line (dressDock ends at z 31) crosses the warehouse street.
  const anchors = props.pole(-13.6, 11, 'ps1-west-pole-club', true);
  if (anchors && westLine) anchors.forEach((anchor, k) => props.wire(westLine[k], anchor, 1 + k * .15));
  if (anchors) for (const [k, z] of [[0, 8], [1, 14]] as const) props.drop(anchors, new THREE.Vector3(x + .1, ground(z) + 7.6 - k * .2, z), k, .9);
  // The Palace marquee (CoastalScenery: 21.5 wide, under-side at 5.725, front at z -26.0).
  const bulbs: THREE.Vector3[] = [];
  // Gaps where the canopy's posts come down (x -44 and -26).
  for (let i = 0; i <= 24; i++) { const bx = -45.5 + i * 21 / 24; if (Math.abs(bx + 44) > .4 && Math.abs(bx + 26) > .4) bulbs.push(new THREE.Vector3(bx, 5.6, -25.95)); }
  for (const side of [-45.75, -24.25]) for (let i = 1; i <= 4; i++) bulbs.push(new THREE.Vector3(side, 5.6, -25.95 - i * .9));
  props.bulbs(bulbs, 'ps1-palace-marquee');
  if (club.posters) dressPalace(props, club.posters);
  // Lit cases on the wings' free faces between the piers and the opening
  // (CoastalScenery; front face z -31.0).
  const [caseLeft, caseRight] = club.posters?.cases ?? [];
  if (caseLeft) props.poster(caseLeft, [-43.47, 2.25, -31.0], 1.3, 1.88, true);
  if (caseRight) props.poster(caseRight, [-26.53, 2.25, -31.0], 1.3, 1.88, true);
}

/**
 * The Palace as the agreed district concept has it (the owner, 2026-11-09:
 * "I like this a lot, can we build this?"): a tiled block of upper storeys
 * over the auditorium, its front a bulb-framed wall with the giant poster and
 * the 皇宮戲院 board above it (moved up in FestivalWorld), a vertical sign at
 * the corner, a billboard down the side that faces the square, and a roof of
 * units, tanks and an aerial. The hall below is untouched: the block starts on
 * its parapet (createPalace: roof 22.4 by 17.1 at x -35, z -40.75, top 10.91).
 */
function dressPalace(props: Ps1StreetProps, posters: Ps1PalacePosters): void {
  const minX = -46.2, maxX = -23.8, minZ = -49.5, front = -31.05, base = 10.9, top = 20.2;
  const cx = (minX + maxX) / 2, cz = (minZ + front) / 2;
  props.tiledBlock([minX, maxX], [minZ, front], [base, top], 0xefe4cd, 'ceramic', 2, 'PS1 Palace upper storeys');
  props.box([maxX - minX + .7, .45, front - minZ + .7], [cx, top + .2, cz], 0xc2b9a8);
  props.box([maxX - minX + .4, .35, front - minZ + .4], [cx, base + .1, cz], 0xc2b9a8);
  // Windows on the west and back faces, and over the billboard on the east.
  for (const y of [13, 15.8, 18.6]) {
    for (let z = -47.4; z <= -33.4; z += 3.5) props.window([minX, y, z], [-1, 0], 1.6, 1.4);
    for (let x = -43.6; x <= -26.4; x += 3.44) props.window([x, y, minZ], [0, -1], 1.6, 1.4);
  }
  // Not beside the vertical sign at the front corner.
  for (let z = -47.4; z <= -36.9; z += 3.5) props.window([maxX, 18.7, z], [1, 0], 1.6, 1.3);
  // The front: the giant poster, a frame of bulbs round the whole face.
  const giantWidth = 8.4, giantHeight = giantWidth / posters.giant.aspect;
  // Proud of the old crown's red cap and the facade's ornament (front at z -30.55).
  props.poster(posters.giant, [cx, 9.25 + giantHeight / 2, -30.45], giantWidth, giantHeight, false);
  const bulbs: THREE.Vector3[] = [];
  // In front of the hall's side walls, which end at z -30.5. The fluted
  // pilasters either side of the entrance (FestivalWorld: 1 wide at x -45 and
  // -25, up to y 8.02) are left bare: bulbs sat on them, which the owner
  // read as lights stuck on drainpipes (2026-11-11). The frame's sides stand
  // clear outside them, and the low row breaks where they come up through it.
  const [left, right] = [-45.95, -24.05], onPilaster = (x: number, y: number) => y < 8.3 && Math.min(Math.abs(x + 45), Math.abs(x + 25)) < .77;
  for (let i = 0; i <= 26; i++) for (const y of [7.1, 19.8]) {
    const x = left + i * (right - left) / 26;
    if (!onPilaster(x, y)) bulbs.push(new THREE.Vector3(x, y, -30.32));
  }
  for (let i = 1; i < 16; i++) for (const x of [left, right]) bulbs.push(new THREE.Vector3(x, 7.1 + i * 12.7 / 16, -30.32));
  props.bulbs(bulbs, 'ps1-palace-front', .17);
  // The bulbs stand 0.7 off the upper block's face (z -31.05), and seen from
  // the side they hung in the air (the owner, 2026-11-11). They are set in a
  // raised gold marquee frame now, a channel from the wall out to the bulbs,
  // as a cinema's bulb border is. The low rail breaks at the pilasters, as the
  // bulbs do.
  const frame = 0xc9b07a, back = -31.06, face = -30.42, depth = face - back, mid = (back + face) / 2;
  for (const x of [left, right]) props.box([.34, 19.8 - 7.1 + .34, depth], [x, (7.1 + 19.8) / 2, mid], frame);
  props.box([right - left + .34, .34, depth], [(left + right) / 2, 19.8, mid], frame);
  for (const [from, to] of [[left, -45.77], [-44.23, -25.77], [-24.23, right]] as const) {
    props.box([to - from + .17, .34, depth], [(from + to) / 2, 7.1, mid], frame);
  }
  // The side billboard, and the vertical sign standing out towards the square.
  const sideHeight = 5, sideWidth = sideHeight * posters.side.aspect;
  props.poster(posters.side, [maxX, 14.6, -41.2], sideWidth, sideHeight, false, [1, 0]);
  props.lightBox(posters.vertical, [maxX, 0, -32.4], [1, 0], 11.4, 6.8);
  // The roof: window units, two water tanks on legs, an aerial.
  for (const [x, z] of [[-43, -46], [-40.6, -46], [-28, -47], [-29, -36], [-44, -36]] as const) props.box([1.6, 1.1, 1.2], [x, top + .95, z], 0xc6c0ae);
  for (const [x, z] of [[-36.5, -45], [-33, -45]] as const) {
    props.cylinder(.95, 1.7, [x, top + 2.15, z], 0x9aa3a0, 8);
    for (const dx of [-.6, .6]) for (const dz of [-.6, .6]) props.box([.12, 1, .12], [x + dx, top + .9, z + dz], 0x4a4a47);
  }
  props.box([.12, 4.5, .12], [-31, top + 2.6, -42], 0x3a3a38);
  for (const [y, w] of [[3.2, 2], [2.4, 1.4], [1.6, .9]] as const) props.box([w, .08, .08], [-31, top + .4 + y, -42], 0x3a3a38);
}

/**
 * The rooftop building as the concept's shophouse (2026-11-09, "Club and
 * shophouse"): striped awnings over each shopfront on the dock road and over
 * the shutters on the temple street, and its name on a board above the south
 * parapet. A covered arcade (騎樓) cannot fit: the storey is 7 units and its
 * face already carries the town's slatted shopfronts, light-boxes and units.
 */
function dressShophouse(props: Ps1StreetProps, host: Ps1PropHost, shell: Ps1RooftopShell, board?: { map: THREE.Texture; aspect: number }): void {
  const south: [number, number] = [0, 1], east: [number, number] = [1, 0];
  // Over the town's slatted panels (x 27/36/45/54, six wide, top 5.35), under the upper units.
  // Each awning's lowest edge, its valance, clears heads on the pavement (the
  // drop plus the valance's 0.45 above PS1_OVERHEAD_CLEARANCE).
  for (const x of [27, 36, 45, 54]) props.awning([x, Math.max(host.groundAt(x, shell.maxZ) + 5.6, props.clearAbove(x, shell.maxZ + 1.9) + 1.05), shell.maxZ], south, 6.2, 1.9, .6);
  for (const z of [23.6, 30.1, 36.6]) props.awning([shell.maxX, props.clearAbove(shell.maxX + 1.4, z) + .85, z], east, 4.8, 1.4, .4);
  if (board) {
    const height = 2.8, width = height * board.aspect, x = 40, z = shell.maxZ + .3, bottom = shell.roofY + 1.5;
    for (const dx of [-width / 2 + .6, width / 2 - .6]) props.box([.25, 1.6, .25], [x + dx, shell.roofY + .8, z - .1], 0x2a2b2b);
    // A light-box housing like every other sign (2026-11-10), not a flat board.
    props.roundedBox([width + .28, height + .28, .32], [x, bottom + height / 2, z - .19], 0xd6d1c4, 0, .14);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: board.map, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    sign.position.set(x, bottom + height / 2, z);
    sign.name = '你媽俱樂部 roof board';
    host.scene.add(sign);
  }
}

/**
 * The club's square front as the concept's tiled block (2026-11-09): a tiled
 * skin over its east wall above the ground floor, with three rows of windows,
 * returns round both ends and a parapet that hides the sawtooth roof from the
 * square, and light-boxes at its corners. The wall behind, its door, sign and
 * everything inside are untouched (FestivalWorld createClub: floor -1,
 * ceiling 14, east wall at x -20, ends at z -0.4 and 42.4).
 */
function dressClubFront(props: Ps1StreetProps, club: Ps1ClubWall): void {
  // The skin starts above the wall's cladding (top 8.54) and stands just behind
  // the 死懶趴 sign's face (x -19.12), so neither pokes through the other.
  const x = club.clubWallX, base = 8.6, top = 17.6, north = club.clubMinZ - .4, southZ = club.clubMaxZ + .4;
  // White mosaic tile, the Showa apartment block of the owner's Japanese street
  // references (2026-11-11), rather than the grey Taipei tile it was.
  const tint = 0xeae3d3, face = x + .8;
  props.tiledBlock([x + .4, face], [north - .3, southZ + .3], [base, top], tint, 'ceramic', 2, 'PS1 club front skin');
  props.tiledBlock([x - 10, face], [north - .3, north], [5.6, top], tint, 'ceramic', 2, 'PS1 club north return');
  // Deep enough to cover the end of the wall's top band (to z 42.9).
  props.tiledBlock([x - 10, face], [southZ, southZ + .6], [5.6, top], tint, 'ceramic', 2, 'PS1 club south return');
  props.box([1.3, .45, southZ - north + 1.3], [face - .15, top + .2, (north + southZ) / 2], 0xc3bcae);
  props.box([11.4, .45, .9], [x - 4.6, top + .2, north - .15], 0xc3bcae);
  props.box([11.4, .45, 1.2], [x - 4.6, top + .2, southZ + .3], 0xc3bcae);
  for (const y of [10.4, 13.1, 15.8]) for (let z = 2.6; z <= 40; z += 3.75) props.window([face, y, z], [1, 0], 1.6, 1.4);
  for (const y of [10.6, 13.8]) for (const dx of [-3, -7]) {
    props.window([x + dx, y, north - .3], [0, -1], 1.6, 1.5);
    props.window([x + dx, y, southZ + .6], [0, 1], 1.6, 1.5);
  }
  const [basement, dancehall] = club.lightBoxes ?? [];
  // Off the cladding's face (x -19.14), which runs the wall's full length.
  if (basement) props.lightBox(basement, [x + .86, 0, 1.2], [1, 0], 6.2, 4.2, .3);
  if (dancehall) props.lightBox(dancehall, [x + .86, 0, 40.8], [1, 0], 6.2, 3.6, .3);
}

/**
 * The pilot's dressing: the rooftop building's east face on the temple street
 * and its south face towards the dock, the poles and wires along both roads,
 * and scooters at the kerb. Spots that are walkways are skipped and reported.
 */
/** A beach lounger or mat (BeachRelaxation BEACH_RELAXATION_LAYOUT). */
export interface Ps1BeachSpot { readonly id: string; readonly x: number; readonly z: number; readonly facing: number }

/**
 * The beach as the concept has it (2026-11-09, "do the beach"): a striped
 * umbrella beside every lounger and mat, to the side of where its occupant
 * faces, so it shades without standing over a seat. Spots that are walkways
 * are skipped.
 */
function dressBeach(props: Ps1StreetProps, spots: readonly Ps1BeachSpot[]): void {
  const stripes: Array<[Rgb, Rgb]> = [[0xc23a30, 0xefe6d2], [0x2f5d8a, 0xefe6d2], [0xd9a032, 0xefe6d2]];
  for (const [i, spot] of spots.entries()) {
    const side = 2.1, sx = Math.cos(spot.facing) * side, sz = -Math.sin(spot.facing) * side;
    if (!props.umbrella(spot.x + sx, spot.z + sz, `ps1-umbrella-${spot.id}`, stripes[i % stripes.length])) props.umbrella(spot.x - sx, spot.z - sz, `ps1-umbrella-${spot.id}-other-side`, stripes[i % stripes.length]);
  }
}

/**
 * The Japanese street (the owner, 2026-11-11, after a sunny anime street, a
 * flat city poster and two pixel shopfronts: a barber's and a konbini with ivy
 * and cones): drinks machines in the gaps along the shopfronts, a doorstep
 * garden of pots, ivy up the corners, and a few cones where the club's loading
 * shutter is. Every spot is checked against the walkways and what is already
 * there; one that is in the way is skipped and reported.
 */
function dressJapaneseStreet(props: Ps1StreetProps, host: Ps1PropHost, shell: Ps1RooftopShell, club?: Ps1ClubWall): void {
  const skip = (what: string, x: number, z: number) => props.skipped(`${what} @ ${x.toFixed(1)},${z.toFixed(1)}`);
  const machine = (x: number, z: number, normal: [number, number], body?: number) => {
    // Clear in front of it, where people stand to buy, and where it stands.
    const fx = x + normal[0] * 2.1, fz = z + normal[1] * 2.1, mx = x + normal[0] * .8, mz = z + normal[1] * .8;
    if (!host.clear(fx, fz, .5) || !host.clear(mx, mz, .4)) { skip('drinks machine', x, z); return; }
    props.vendingMachine([x, host.surfaceAt(mx, mz), z], normal, body);
  };
  // The garage's dock face, in the gaps between its slatted panels (x 27/36/45/54, six wide).
  machine(31, shell.maxZ, [0, 1]);
  machine(49, shell.maxZ, [0, 1], 0xe9472f);
  // The temple street face, between the second and third shutters.
  machine(shell.maxX, 33.35, [1, 0], 0x3f7fc2);
  if (club) {
    const x = club.clubWallX + .86;
    machine(x, 13.6, [1, 0]);
    machine(x, 29.6, [1, 0], 0xe9472f);
    // Cones round the loading shutter at z 34, as if a delivery were due.
    for (const [dx, z] of [[1.9, 31.8], [2.3, 33.2], [2.3, 34.8], [1.9, 36.2]] as const) {
      if (host.clear(x + dx, z, .4)) props.cone(x + dx, z); else skip('cone', x + dx, z);
    }
    // Pots either side of the club's doors, and ivy up its corners.
    for (const z of [club.doorMinZ - 1.1, club.doorMaxZ + 1.1]) {
      if (host.clear(x + .7, z, .5)) props.plantPot(x + .7, z); else skip('plant pot', x + .7, z);
    }
    props.vine([x - .02, host.surfaceAt(x + .2, 2.4), 2.4], [1, 0], 7.6, 3);
    props.vine([x - .02, host.surfaceAt(x + .2, 39.6), 39.6], [1, 0], 7.2, 7);
  }
  // A pot at the gap under the 冰果室 sign, and ivy up the garage's street corners.
  if (host.clear(shell.maxX + .7, 26.85, .5)) props.plantPot(shell.maxX + .7, 26.85, 0x6aa055); else skip('plant pot', shell.maxX + .7, 26.85);
  props.vine([shell.maxX, host.surfaceAt(shell.maxX + .2, 20.6), 20.6], [1, 0], 5.6, 11);
  props.vine([shell.maxX, host.surfaceAt(shell.maxX + .2, 43.2), 43.2], [1, 0], 5.4, 13);
}

export function dressPs1Pilot(host: Ps1PropHost, shell: Ps1RooftopShell, lightBoxes: Ps1LightBox[], dock?: Ps1DockDressing, club?: Ps1ClubWall, roofBoard?: { map: THREE.Texture; aspect: number }, beach?: readonly Ps1BeachSpot[]): Ps1PropReport {
  const props = new Ps1StreetProps(host);
  const westLine = dock ? dressDock(props, host, dock) : undefined;
  if (club) { dressWestSide(props, host, club, westLine); dressClubFront(props, club); }
  dressShophouse(props, host, shell, roofBoard);
  if (beach) dressBeach(props, beach);
  const east: [number, number] = [1, 0], south: [number, number] = [0, 1];
  const ground = (x: number, z: number) => host.groundAt(x, z);
  // East face on the temple street, under the deck: steel shutters at street
  // level, then a band of windows and units well above head height.
  for (const z of [23.6, 30.1, 36.6]) props.shutter([shell.maxX, ground(shell.maxX, z), z], east, 4.4, 3.3);
  // The awnings over these shutters (dressShophouse) fill the band up to the
  // deck slab, so units and windows go only beyond them.
  props.window([shell.maxX, ground(shell.maxX, 43) + 5.3, 43], east, 1.7, 1.5);
  // South face, towards the dock. The town's four slatted panels already fill
  // it to 5.35 (CoastalScenery, x 27/36/45/54, six wide), so units go in the
  // gaps between them and along the strip above.
  for (const x of [31.5, 49.5]) props.airConditioner([x, props.clearAbove(x, shell.maxZ + 1) + .6, shell.maxZ], south);
  // Nothing above the panels: the deck slab overhangs this face by 0.6 from a height of 6.35.
  // Light-boxes: the company's own name where arrivals first see the building.
  const [brand, video, ice, billiards] = lightBoxes;
  // Hung 0.8 off the wall on brackets, past the deck slab's 0.6 overhang. 冰果室
  // sits in the gap between two temple-street awnings (z 26.0 to 27.7).
  // Their undersides clear heads over the pavement and the road below them.
  if (brand) props.lightBox(brand, [shell.minX + 1.1, 0, shell.maxZ], south, props.clearAbove(shell.minX + 1.1, shell.maxZ + 2), 3.4, .8);
  if (video) props.lightBox(video, [40.5, 0, shell.maxZ], south, props.clearAbove(40.5, shell.maxZ + 2), 3.2, .8);
  if (ice) props.lightBox(ice, [shell.maxX, 0, 26.85], east, props.clearAbove(shell.maxX + 2, 26.85), 3.2, .8);
  if (billiards) props.lightBox(billiards, [shell.maxX, 0, 40.3], east, props.clearAbove(shell.maxX + 2, 40.3), 3, .8);
  // Poles along the temple street and round the corner towards the dock.
  const line: Array<[number, number, boolean]> = [[65.5, -6, false], [65.5, 12, true], [65.5, 30, false], [65.5, 48, false], [47, 49.5, true], [29, 49.5, false]];
  // Each crossarm runs across the line, square to the way it travels (the
  // corner's halfway between): along it, the wires ran through the next
  // pole's insulators (2026-11-10). Anchor 0 stays on the right-hand side.
  const across = (i: number): [number, number] => {
    let tx = 0, tz = 0;
    for (const [from, to] of [[i - 1, i], [i, i + 1]]) {
      const a = line[from], b = line[to];
      if (!a || !b) continue;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      tx += (b[0] - a[0]) / l; tz += (b[1] - a[1]) / l;
    }
    return [tz, -tx];
  };
  let previous: THREE.Vector3[] | undefined;
  for (const [index, [x, z, transformer]] of line.entries()) {
    const anchors = props.pole(x, z, `ps1-utility-pole-${index}`, transformer, across(index));
    if (anchors && previous) anchors.forEach((anchor, k) => props.wire(previous![k], anchor, .7 + k * .18));
    // The tangle: service drops from the pole to the nearest wall, tied to
    // the edge of the roof slab, which overhangs the walls by 0.6 from 6.35
    // to 6.95 (FestivalWorld createRooftop): to the wall itself they ran
    // through it (2026-11-10).
    if (anchors) {
      const toEast = x > shell.maxX;
      for (const [k, offset] of [[0, -3], [1, 4]] as const) {
        const y = shell.roofY - .3 - k * .15;
        const wall = toEast
          ? new THREE.Vector3(shell.maxX + .63, y, z + offset)
          : new THREE.Vector3(x + offset, y, shell.maxZ + .63);
        if (toEast ? z + offset > shell.minZ && z + offset < shell.maxZ : true) props.drop(anchors, wall, k, .9);
      }
    }
    previous = anchors ?? previous;
  }
  // Scooters at the kerb of the south face, noses out to the road.
  props.scooterRow(31, shell.maxZ + 2.3, 5, 0, 'ps1-scooters-south', [0x8f2f2b, 0xc6bea9, 0x2f4d6e, 0x3f5c46, 0x1f1f22]);
  props.scooterRow(46.5, shell.maxZ + 2.3, 4, 0, 'ps1-scooters-south-east', [0xc6bea9, 0x8f2f2b, 0x1f1f22, 0x6b6f3e]);
  // Last, so it gives way to everything the district already had.
  dressJapaneseStreet(props, host, shell, club);
  return props.finish();
}
