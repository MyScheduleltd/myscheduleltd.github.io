import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Native avatar coordinates, shared by the cloth apertures and body shader.
 * Separate eye holes avoid the previous broad, rectangular visor. */
export const STAFF_MASK_OPENINGS = Object.freeze([
  { id: 'left-eye', x: -.071, y: .512, rx: .035, ry: .046 },
  { id: 'right-eye', x: .071, y: .512, rx: .035, ry: .046 },
  { id: 'mouth', x: 0, y: .429, rx: .032, ry: .018 },
]);

export function staffMaskOpeningShader(position: string): string {
  return `(${position}.z>.119&&(${STAFF_MASK_OPENINGS.map(hole =>
    `dot((${position}.xy-vec2(${hole.x.toFixed(3)},${hole.y.toFixed(3)}))/vec2(${hole.rx.toFixed(3)},${hole.ry.toFixed(3)}),` +
    `(${position}.xy-vec2(${hole.x.toFixed(3)},${hole.y.toFixed(3)}))/vec2(${hole.rx.toFixed(3)},${hole.ry.toFixed(3)}))<1.`).join('||')}))`;
}

// The source scalp is hair, so bounds of the exposed face alone cannot size a
// hood. These broad rings restore a head-shaped crown above that face,
// with a narrower jaw/neck and flat cloth planes matching the native style.
const RINGS = [
  [.324, .176, .192, .034],
  [.355, .144, .145, .034],
  [.397, .244, .246, .062],
  [.455, .292, .319, .065],
  [.526, .304, .339, .056],
  [.592, .292, .327, .039],
  [.641, .260, .285, .025],
  [.665, .190, .222, .020],
] as const;
const OUTLINE = [[-.41,-.5],[.41,-.5],[.5,-.35],[.5,.35],[.41,.5],[-.41,.5],[-.5,.35],[-.5,-.35]] as const;

function frontZ(x: number, y: number): number {
  let index = RINGS.findIndex(ring => ring[0] >= y);
  index = THREE.MathUtils.clamp(index < 0 ? RINGS.length - 1 : index, 1, RINGS.length - 1);
  const low = RINGS[index - 1], high = RINGS[index];
  const mix = THREE.MathUtils.clamp((y - low[0]) / (high[0] - low[0]), 0, 1);
  const plane = THREE.MathUtils.lerp(low[3] + low[2] / 2, high[3] + high[2] / 2, mix);
  // A small covered nose ridge; no skin nose sticks through the fabric.
  return plane + .013 * Math.max(0, 1 - Math.abs(x) / .044) * Math.max(0, 1 - Math.abs(y - .466) / .055);
}

/** One faceted, closed hood with real eye/mouth apertures and a fitted collar.
 * The caller maps native coordinates through the actual bound head matrix. */
export function createStaffBalaclavaGeometry(toHead: (point: THREE.Vector3) => THREE.Vector3): THREE.BufferGeometry {
  const vertices: number[] = [], indices: number[] = [];
  for (const [y, width, depth, centreZ] of RINGS) for (const [x, z] of OUTLINE) vertices.push(x * width, y, z * depth + centreZ);
  for (let ring = 0; ring < RINGS.length - 1; ring++) for (let edge = 0; edge < OUTLINE.length; edge++) {
    if (edge === 4) continue; // The front is triangulated separately around three real openings.
    const a = ring * 8 + edge, b = ring * 8 + (edge + 1) % 8, c = a + 8, d = b + 8;
    indices.push(a, c, b, b, c, d);
  }
  // Crown cap; the bottom joins the neck and stays open inside the shirt.
  const top = (RINGS.length - 1) * 8;
  for (let edge = 1; edge < 7; edge++) indices.push(top, top + edge + 1, top + edge);
  const side = new THREE.BufferGeometry(); side.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); side.setIndex(indices);

  const face = new THREE.Shape();
  face.moveTo(-RINGS[0][1] * .41, RINGS[0][0]);
  for (const [y, width] of RINGS) face.lineTo(-width * .41, y);
  for (const [y, width] of [...RINGS].reverse()) face.lineTo(width * .41, y);
  face.closePath();
  for (const hole of STAFF_MASK_OPENINGS) {
    const path = new THREE.Path(); path.absellipse(hole.x, hole.y, hole.rx, hole.ry, 0, Math.PI * 2, true); face.holes.push(path);
  }
  const front = new THREE.ShapeGeometry(face, 8);
  const frontPositions = front.getAttribute('position');
  for (let i = 0; i < frontPositions.count; i++) frontPositions.setZ(i, frontZ(frontPositions.getX(i), frontPositions.getY(i)));
  // ShapeGeometry has UVs; side UVs are added before merging the same cloth.
  const sidePositions = side.getAttribute('position'), sideUv: number[] = [];
  for (let i = 0; i < sidePositions.count; i++) sideUv.push(sidePositions.getX(i) * 3, sidePositions.getY(i) * 3);
  side.setAttribute('uv', new THREE.Float32BufferAttribute(sideUv, 2));
  side.computeVertexNormals(); front.computeVertexNormals();
  const geometry = mergeGeometries([side, front])!;
  const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i); uv.setXY(i, point.x * 3, point.y * 3);
    toHead(point); positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  side.dispose(); front.dispose();
  return geometry;
}
