import * as THREE from 'three';

type Textile = 'cotton' | 'sleeve' | 'denim' | 'hair' | 'canvas';
const textiles = new Map<Textile, THREE.CanvasTexture>();

/** Authored value blocks: panel wear and seams, without screen-space noise. */
export function wardrobeTexture(kind: Textile): THREE.CanvasTexture {
  const existing = textiles.get(kind);
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#f5f3ed'; c.fillRect(0, 0, 64, 64);
  const blocks = [
    [1, 3, 6, 19, '#e0ded8'], [10, 31, 5, 13, '#d9d8d3'],
    [20, 7, 9, 10, '#e8e6e0'], [31, 38, 5, 17, '#dbd9d4'],
    [40, 20, 7, 11, '#e5e3dd'], [52, 44, 10, 13, '#e1dfd9'],
    [4, 51, 5, 9, '#eeece6'], [25, 24, 6, 17, '#eeece6'],
  ] as const;
  for (const [x, y, w, h, colour] of blocks) {
    c.fillStyle = colour; c.fillRect(x, y, w, h);
  }
  if (kind === 'denim' || kind === 'canvas') {
    c.fillStyle = '#c9cac5';
    for (const x of [1, 15, 33, 49]) c.fillRect(x, 1, 1, 62);
    c.fillStyle = '#d3d2cd'; c.fillRect(0, 58, 64, 2);
  }
  if (kind === 'cotton') {
    c.fillStyle = '#c9c8c2'; c.fillRect(0, 57, 64, 3);
    c.fillStyle = '#faf8f0'; c.fillRect(0, 60, 64, 2);
  }
  if (kind === 'sleeve') {
    c.fillStyle = '#778794'; c.fillRect(0, 26, 64, 13);
    c.fillStyle = '#687a88';
    for (const x of [4, 19, 39, 56]) c.fillRect(x, 27, 5, 11);
    c.fillStyle = '#c5c8c5'; c.fillRect(0, 39, 64, 2);
  }
  if (kind === 'hair') {
    c.fillStyle = '#dedbd2';
    for (const [x, y, w, h] of [[1, 19, 7, 40], [12, 3, 5, 45], [28, 24, 4, 35], [43, 8, 6, 47], [56, 28, 7, 30]]) {
      c.fillRect(x, y, w, h);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestMipmapNearestFilter;
  textiles.set(kind, map);
  return map;
}

const patches = new Map<string, THREE.MeshBasicMaterial>();
/** A tiny ticket/harbour mark, original to this festival's clothing. */
export function wardrobePatch(kind: 'ticket' | 'harbour' | 'shop'): THREE.MeshBasicMaterial {
  const existing = patches.get(kind);
  if (existing) return existing;
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24;
  const c = canvas.getContext('2d')!;
  c.fillStyle = kind === 'ticket' ? '#974d40' : kind === 'shop' ? '#dedbd0' : '#d2cdc1';
  c.fillRect(0, 0, 32, 24);
  c.fillStyle = kind === 'ticket' ? '#e4dccc' : '#414d5a';
  // Two cinema seats and an opening between them read at a few screen pixels.
  for (const [x, y, w, h] of [[6, 6, 7, 10], [19, 6, 7, 10], [4, 13, 11, 4], [17, 13, 11, 4], [6, 17, 3, 3], [23, 17, 3, 3]]) c.fillRect(x, y, w, h);
  if (kind === 'harbour') { c.fillRect(7, 3, 18, 2); c.fillRect(15, 0, 2, 5); }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter;
  const material = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  material.userData.wornNoGrain = true; material.userData.wornNoMasonry = true;
  patches.set(kind, material); return material;
}
