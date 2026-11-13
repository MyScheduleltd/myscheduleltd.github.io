import * as THREE from 'three';
import { loadLightBoxFace } from './Ps1LightBoxHousing';
import nameBoard from '../assets/ps1/ferry/nameboard.png';

/**
 * The ferry at the island's pier as a Showa harbour ferry (the owner,
 * 2026-11-11: "the 3D modeling of the boat needs to be updated as well", and
 * their pick of the Showa ferry). The hull stays IslandDock's lofted one, now
 * with a red boot-top stripe and a timber rubbing strake; this is everything
 * above the deck:
 *
 * - a white passenger cabin with a row of rounded windows and a blue base band;
 * - a sage roof with a rail round its upper deck;
 * - a wheelhouse on top with a red roof and the 海燕丸 name board;
 * - a cream funnel with a red band;
 * - a mast with a lamp and strings of signal flags to the bow and stern;
 * - life rings, tyre fenders on the pier side, and bollards and a rope coil
 *   on the fore deck.
 *
 * Local frame as IslandDock builds the boat: the bow towards +z, the deck about
 * 0.12 up, `pierSide` the side the gangway comes aboard. The way aboard (local
 * z 0.85 to 1.95 on that side) is left open.
 */
export interface Ps1FerryFrame { length: number; beam: number; deck: number; pierSide: -1 | 1 }

type Paint = (x: number, row: number) => number;

function drawn(width: number, height: number, paint: Paint, name: string): THREE.DataTexture {
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

/** One rounded cabin window a tile, sky-blue glass with a reflection; rows are stored bottom first. */
const cabinWindow = () => drawn(16, 16, (x, row) => {
  const y = 15 - row, inX = x >= 3 && x <= 12, inY = y >= 3 && y <= 11, corner = (x === 3 || x === 12) && (y === 3 || y === 11);
  if (y >= 14) return 0x3d6ea8;
  if (!inX || !inY || corner) return 0xf1eee6;
  if (x === 3 || x === 12 || y === 3 || y === 11) return 0xb8bec4;
  if (x + y < 13 && y < 7) return 0xc6e0ef;
  return y < 6 ? 0x7fa7cc : 0x55799e;
}, 'PS1 ferry cabin window');

/** The wheelhouse's band of glass, four panes a tile. */
const bridgeWindow = () => drawn(16, 8, (x, row) => {
  const y = 7 - row;
  if (y === 0 || y === 7) return 0xf1eee6;
  if (x % 4 === 0) return 0xd8dcdf;
  if (x % 4 === 1 && y < 4) return 0xc6e0ef;
  return y < 3 ? 0x86aed2 : 0x4f7398;
}, 'PS1 ferry bridge window');

function flat(colour: number, roughness = .75, metalness = 0): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness, flatShading: true });
  material.userData.wornNoMasonry = true;
  return material;
}

export function buildPs1Ferry(boat: THREE.Group, frame: Ps1FerryFrame): void {
  const { length, beam, deck: d, pierSide } = frame;
  const white = flat(0xf1eee6), blue = flat(0x3d6ea8), sage = flat(0x8fb7a5), red = flat(0xa8322c), cream = flat(0xece4d0);
  const iron = flat(0x2c2f2e, .5), rail = flat(0xf4f1ea, .5), timber = flat(0x7a5a40), rope = flat(0xcdbb93, .9), tyre = flat(0x1d1e1f, .95);
  const orange = flat(0xe8612c, .6), lamp = flat(0xf2dd9a, .4);
  lamp.emissive.set(0xffd27a); lamp.emissiveIntensity = .6;
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number], turn?: THREE.Euler) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...at);
    if (turn) mesh.rotation.copy(turn);
    mesh.castShadow = mesh.receiveShadow = true;
    boat.add(mesh);
    return mesh;
  };
  const box = (size: [number, number, number], at: [number, number, number], material: THREE.Material) => add(new THREE.BoxGeometry(...size), material, at);
  const panel = (texture: THREE.Texture, width: number, height: number, at: [number, number, number], yaw: number, repeat: number) => {
    const map = texture.clone(); map.needsUpdate = true; map.repeat.set(repeat, 1);
    const material = new THREE.MeshStandardMaterial({ map, roughness: .45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    return add(new THREE.PlaneGeometry(width, height), material, at, new THREE.Euler(0, yaw, 0));
  };
  const windows = cabinWindow(), bridge = bridgeWindow();

  // The passenger cabin, aft of the way aboard.
  const cabin = { back: -4.9, front: .45, half: 1.45, top: d + 1.8 };
  const cabinLength = cabin.front - cabin.back, cabinMid = (cabin.front + cabin.back) / 2;
  box([cabin.half * 2, cabin.top - d, cabinLength], [0, (cabin.top + d) / 2, cabinMid], white);
  box([cabin.half * 2 + .04, .22, cabinLength + .04], [0, d + .2, cabinMid], blue);
  for (const side of [-1, 1]) panel(windows, cabinLength - .3, 1.0, [side * (cabin.half + .013), d + 1.15, cabinMid], side * Math.PI / 2, Math.round((cabinLength - .3) / 1.3));
  panel(windows, cabin.half * 2 - .3, 1.0, [0, d + 1.15, cabin.front + .013], 0, 2);
  box([.8, 1.3, .05], [pierSide * .5, d + .8, cabin.back - .02], flat(0x55799e, .4));
  // Its roof, the upper deck, with a rail round the open part.
  const roofY = cabin.top + .07;
  box([cabin.half * 2 + .4, .14, cabinLength + .5], [0, roofY, cabinMid], sage);
  for (const side of [-1, 1]) {
    box([.05, .05, cabinLength - 1.5], [side * (cabin.half + .1), roofY + .62, cabinMid - .75], rail);
    for (let z = cabin.back + .1; z <= cabin.front - 1.6; z += .9) box([.05, .6, .05], [side * (cabin.half + .1), roofY + .33, z], rail);
  }
  box([cabin.half * 2 + .2, .05, .05], [0, roofY + .62, cabin.back - .1], rail);

  // The wheelhouse on top at the front, red-roofed, its name board below the glass.
  const house = { back: -1.0, front: .5, half: 1.1, bottom: roofY + .07, top: roofY + 1.42 };
  const houseMid = (house.front + house.back) / 2, houseLength = house.front - house.back;
  box([house.half * 2, house.top - house.bottom, houseLength], [0, (house.top + house.bottom) / 2, houseMid], white);
  panel(bridge, house.half * 2 - .2, .62, [0, house.top - .45, house.front + .013], 0, 4);
  for (const side of [-1, 1]) panel(bridge, houseLength - .2, .62, [side * (house.half + .013), house.top - .45, houseMid], side * Math.PI / 2, 2);
  box([house.half * 2 + .36, .14, houseLength + .4], [0, house.top + .07, houseMid], red);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.36, .34), new THREE.MeshBasicMaterial({ map: loadLightBoxFace(nameBoard, 'PS1 ferry name board'), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  board.position.set(0, house.bottom + .36, house.front + .016);
  board.name = '海燕丸 name board';
  boat.add(board);

  // The funnel behind it: cream, a red band, a black cap.
  const funnelZ = -2.4;
  add(new THREE.CylinderGeometry(.32, .36, 1.2, 10), cream, [0, roofY + .67, funnelZ]);
  add(new THREE.CylinderGeometry(.335, .345, .24, 10), red, [0, roofY + .95, funnelZ]);
  add(new THREE.CylinderGeometry(.34, .33, .1, 10), iron, [0, roofY + 1.32, funnelZ]);

  // The mast on the wheelhouse roof, its lamp, and two strings of flags.
  const mastTop = new THREE.Vector3(0, house.top + 2.2, houseMid);
  add(new THREE.CylinderGeometry(.05, .06, 2.1, 6), iron, [0, house.top + 1.15, houseMid]);
  box([1.1, .05, .05], [0, house.top + 1.6, houseMid], iron);
  box([.22, .22, .22], [0, mastTop.y + .05, houseMid], lamp);
  const colours = [0xc8352c, 0xf0c63e, 0x3d6ea8, 0xf4f1ea, 0x4f9a5a];
  for (const end of [new THREE.Vector3(0, d + .9, length / 2 - .2), new THREE.Vector3(0, d + 1.3, -length / 2 + .2)]) {
    const flags = 11, positions: number[] = [], tint: number[] = [];
    for (let i = 1; i < flags; i++) {
      const t = i / flags, p = mastTop.clone().lerp(end, t);
      p.y -= Math.sin(t * Math.PI) * .35;
      const c = new THREE.Color(colours[i % colours.length]);
      // A pennant hanging from the line, seen from either side.
      positions.push(p.x, p.y, p.z - .14, p.x, p.y, p.z + .14, p.x, p.y - .34, p.z);
      for (let k = 0; k < 3; k++) tint.push(c.r, c.g, c.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3));
    geometry.computeVertexNormals();
    const pennants = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 }));
    pennants.name = 'ferry signal flags';
    boat.add(pennants);
    const line = new THREE.CatmullRomCurve3([mastTop, mastTop.clone().lerp(end, .5).setY((mastTop.y + end.y) / 2 - .35), end]);
    add(new THREE.TubeGeometry(line, 10, .015, 3), iron, [0, 0, 0]);
  }

  // Life rings on the cabin's sides.
  for (const side of [-1, 1]) for (const z of [-1.4, -3.7]) {
    add(new THREE.TorusGeometry(.3, .08, 6, 12), orange, [side * (cabin.half + .07), d + 1.12, z], new THREE.Euler(0, Math.PI / 2, 0));
  }
  // The fore deck: rails either side (open on the pier side where the gangway
  // comes aboard), two bollards and a coil of rope.
  for (const side of [-1, 1]) {
    const from = side === pierSide ? 2.1 : .6, to = 4.2;
    const x = side * (beam / 2 - .5);
    box([.06, .06, to - from], [x, d + .72, (from + to) / 2], rail);
    for (let z = from; z <= to + 1e-6; z += (to - from) / 3) box([.05, .7, .05], [x, d + .37, z], rail);
  }
  for (const x of [-.7, .7]) add(new THREE.CylinderGeometry(.14, .17, .36, 8), iron, [x, d + .18, length / 2 - 1.5]);
  add(new THREE.TorusGeometry(.24, .06, 5, 12), rope, [.35, d + .06, 3.3], new THREE.Euler(Math.PI / 2, 0, 0));
  box([.5, .35, .4], [-.4, d + .18, 3.6], timber);
  // Tyre fenders hung over the pier side, clear of the way aboard.
  for (const z of [-3.2, -1.1, 3.4]) {
    add(new THREE.TorusGeometry(.3, .12, 6, 10), tyre, [pierSide * (beam / 2 + .06), d - .45, z], new THREE.Euler(0, Math.PI / 2, 0));
  }
}
