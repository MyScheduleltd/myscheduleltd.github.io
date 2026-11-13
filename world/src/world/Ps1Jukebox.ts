import * as THREE from 'three';
import { loadLightBoxFace } from './Ps1LightBoxHousing';
import marqueeFace from '../assets/ps1/jukebox/marquee.png';

/**
 * The jukebox in the arcade row, as a Showa record jukebox (the owner,
 * 2026-11-11: "please redesign the jukebox as well", and their pick): a warm
 * walnut cabinet with chrome trim, a rounded top carrying a lit marquee of a
 * record rising on cream (`art/ferry-jukebox-20261111/build-faces.py`; no
 * lettering, the owner's call, and not a sun and rays), a big window onto a carousel
 * of records, a row of push-button selectors, and a slatted speaker grille.
 *
 * The old cabinet's footprint (2.4 by 1.5) and its front towards +z, so it
 * drops into the same place, turned the same way, with the same collider.
 */
type Paint = (x: number, y: number) => number;

function drawn(width: number, height: number, paint: Paint, name: string): THREE.DataTexture {
  const pixels = new Uint8ClampedArray(width * height * 4);
  // Painted top row first; stored bottom row first.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const rgb = paint(x, y), i = ((height - 1 - y) * width + x) * 4;
    pixels[i] = (rgb >> 16) & 255; pixels[i + 1] = (rgb >> 8) & 255; pixels[i + 2] = rgb & 255; pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** The record window: five discs standing in the carousel against a warm lit back. */
const recordWindow = () => drawn(40, 22, (x, y) => {
  if (x === 0 || x === 39 || y === 0 || y === 21) return 0xc9ccd0;
  if (y >= 18) return y === 18 ? 0x9a9ea3 : 0xb7bbc0;
  const labels = [0xb3352b, 0x3d6ea8, 0xe0bd55, 0x4f9a5a, 0xf1eee6];
  for (let k = 4; k >= 0; k--) {
    const cx = 6 + k * 7, cy = 10, dx = (x - cx) / 4.2, dy = (y - cy) / 7.2, r = Math.hypot(dx, dy);
    if (r < 1) {
      if (r < .3) return r < .08 ? 0x111111 : labels[k];
      return (Math.round(r * 9) % 2) ? 0x1d1a19 : 0x2b2724;
    }
  }
  return y < 6 ? 0xf6e7c0 : y < 12 ? 0xf0d9a4 : 0xe6c58a;
}, 'PS1 jukebox record window');

/** The selector strip: cream push-buttons on chrome, one red. */
const selectorStrip = () => drawn(32, 6, (x, y) => {
  if (y === 0 || y === 5) return 0x9a9ea3;
  if (x % 3 === 0) return 0xc2c6ca;
  return x === 16 || x === 17 ? 0xb3352b : (y === 1 ? 0xfaf5e6 : 0xe9dfc8);
}, 'PS1 jukebox selectors');

/** The speaker grille: walnut slats over dark cloth. */
const grille = () => drawn(16, 16, (x, y) => {
  const slat = x % 4;
  if (slat === 3) return 0x241814;
  const shade = slat === 0 ? 0x8b5a36 : slat === 1 ? 0x7b4f30 : 0x6a432a;
  return y === 0 || y === 15 ? 0x5a3a24 : shade;
}, 'PS1 jukebox grille');

function flat(colour: number, roughness = .7, metalness = 0): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness, flatShading: true });
  material.userData.wornNoMasonry = true;
  return material;
}

export function createPs1Jukebox(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Record selector cabinet';
  // Deep walnut, not lifted by the town's sunny grade (it went orange).
  group.userData.ps1TownKeep = true;
  const walnut = flat(0x6e4429, .6), dark = flat(0x2b2622), chrome = flat(0xc9ccd0, .3, .6);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...at);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const box = (size: [number, number, number], at: [number, number, number], material: THREE.Material) => add(new THREE.BoxGeometry(...size), material, at);
  const face = (map: THREE.Texture, width: number, height: number, at: [number, number, number], lit: boolean) => {
    const material = lit
      ? new THREE.MeshBasicMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
      : new THREE.MeshStandardMaterial({ map, roughness: .7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    return add(new THREE.PlaneGeometry(width, height), material, at);
  };
  const front = .65;
  // Plinth (it runs below the floor, for uneven ground) and the walnut body.
  box([2.36, .5, 1.44], [0, -.05, 0], dark);
  box([2.2, 2.0, 1.3], [0, 1.2, 0], walnut);
  // The rounded top: half a drum across the cabinet's width.
  const arch = new THREE.CylinderGeometry(1.1, 1.1, 1.3, 20, 1, false, 0, Math.PI);
  arch.rotateX(Math.PI / 2); arch.rotateZ(Math.PI / 2);
  add(arch, walnut, [0, 2.2, 0]);
  // The marquee on its face, lit, inside a chrome arc.
  const marquee = new THREE.CircleGeometry(.98, 24, 0, Math.PI);
  const map = loadLightBoxFace(marqueeFace, 'PS1 jukebox marquee');
  map.repeat.set(1, 2); map.offset.set(0, -1);
  const lit = new THREE.Mesh(marquee, new THREE.MeshBasicMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  lit.position.set(0, 2.22, front + .015);
  lit.name = 'jukebox marquee';
  group.add(lit);
  add(new THREE.TorusGeometry(1.04, .06, 6, 20, Math.PI), chrome, [0, 2.2, front + .02]);
  box([2.16, .08, .08], [0, 2.2, front + .02], chrome);
  // Chrome pillars down the front corners.
  for (const x of [-1.06, 1.06]) box([.1, 2.0, .1], [x, 1.2, front - .02], chrome);
  // The record window, the selectors under it, the coin slot, the grille.
  face(recordWindow(), 1.78, .98, [0, 1.62, front + .013], true);
  face(selectorStrip(), 1.8, .3, [0, 1.0, front + .013], false);
  box([.18, .08, .05], [.78, 1.27, front + .03], chrome);
  face(grille(), 1.72, .62, [0, .5, front + .013], false);
  box([2.0, .06, .06], [0, .84, front + .03], chrome);
  return group;
}
