import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coastalMaterial } from './CoastalAvatar';

// A cut maple deck: broad standing area, tapered shoulders and faceted kicks.
const sections = [
  [-1.34, .075, .15], [-1.30, .19, .14], [-1.20, .29, .105],
  [-1.04, .33, .05], [-.82, .34, 0], [.82, .34, 0],
  [1.04, .33, .05], [1.20, .29, .105], [1.30, .19, .14], [1.34, .075, .15],
];

/** Closed, non-overlapping lamina; top and bottom follow the same kick profile. */
function plank(top: number, bottom: number, inset = 0): THREE.BufferGeometry {
  const vertices: number[] = [], indices: number[] = [];
  for (const [x, width, rise] of sections) {
    const w = width - inset;
    vertices.push(x, top + rise, -w, x, top + rise, w,
      x, bottom + rise, -w, x, bottom + rise, w);
  }
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * 4, b = a + 4;
    indices.push(a,a+1,b, a+1,b+1,b); // top
    indices.push(a+2,b+2,a+3, a+3,b+2,b+3); // underside
    indices.push(a,b,a+2, a+2,b,b+2); // near edge
    indices.push(a+1,a+3,b+1, a+3,b+3,b+1); // far edge
  }
  const last = (sections.length - 1) * 4;
  indices.push(0,2,1, 1,2,3, last,last+1,last+2, last+1,last+3,last+2);
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

// Instances share immutable geometry/materials, including the small hardware.
let template: THREE.Group | undefined;
function skateboardTemplate(): THREE.Group {
  const board = new THREE.Group();
  const batches = new Map<THREE.Material, { name: string; geometries: THREE.BufferGeometry[] }>();
  const material = (name: string, color: number) => {
    const m = coastalMaterial(color);m.name = name;
    batches.set(m, { name, geometries: [] });return m;
  };
  const maple = material('maple edges', 0xb59871);
  const ply = material('dark maple ply', 0x655044);
  const grip = material('charcoal grip', 0x24292c);
  const underside = material('forest deck underside', 0x415a50);
  const cream = material('ivory wheels and print', 0xdfd5bc);
  const red = material('brick red deck print', 0xa64e41);
  const metal = material('brushed truck metal', 0x8b9396);
  const dark = material('axles and bushings', 0x44494a);
  const add = (geometry: THREE.BufferGeometry, m: THREE.Material, position = new THREE.Vector3(), rotation = new THREE.Euler()) => {
    geometry.deleteAttribute('uv');
    geometry.applyMatrix4(new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1,1,1)));
    batches.get(m)!.geometries.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if(geometry.index)geometry.dispose();
  };
  const box = (size: [number,number,number], at: [number,number,number], m: THREE.Material) =>
    add(new THREE.BoxGeometry(...size), m, new THREE.Vector3(...at));
  const cylinder = (radius: number, length: number, at: [number,number,number], m: THREE.Material, axisZ = false) =>
    add(new THREE.CylinderGeometry(radius,radius,length,12),m,new THREE.Vector3(...at),new THREE.Euler(axisZ?Math.PI/2:0,0,0));

  // Feet rest at -.113, wheel tangency at -.46: these are the pose contract.
  add(plank(-.119,-.136),maple);
  add(plank(-.136,-.147),ply);
  add(plank(-.147,-.168),maple);
  add(plank(-.168,-.174),underside);
  add(plank(-.113,-.119,.035),grip);
  // Screen-printed bars on the underside; quiet festival colours, no gloss.
  box([.63,.002,.40],[0,-.175,0],cream);
  box([.12,.002,.46],[-.20,-.177,0],red);
  box([.12,.002,.46],[.02,-.177,0],red);
  box([.07,.002,.30],[.24,-.177,0],underside);
  // Small nose mark distinguishes the two ends without dominating the grip.
  box([.075,.002,.18],[.72,-.112,0],cream);

  for (const end of [-1,1]) {
    const x = end * .66;
    box([.25,.026,.28],[x,-.187,0],metal);
    cylinder(.053,.082,[x,-.241,0],dark);
    cylinder(.032,.09,[x,-.244,0],metal);
    box([.12,.075,.48],[x,-.302,0],metal);
    cylinder(.023,.86,[x,-.33,0],dark,true);
    for (const side of [-1,1]) {
      // Twelve faces keep a round rolling silhouette and deliberate PS2 facets.
      cylinder(.13,.135,[x,-.33,side*.3925],cream,true);
      cylinder(.056,.008,[x,-.33,side*.464],metal,true);
      cylinder(.025,.012,[x,-.33,side*.470],dark,true);
      for (const dx of [-.085,.085]) cylinder(.017,.003,[x+dx,-.1115,side*.10],metal);
    }
  }
  for (const [m, batch] of batches) {
    const geometry = mergeGeometries(batch.geometries);
    batch.geometries.forEach(g=>g.dispose());
    const mesh = new THREE.Mesh(geometry,m);
    mesh.name = `skateboard ${batch.name}`;
    mesh.castShadow = true;mesh.receiveShadow = true;board.add(mesh);
  }
  return board;
}

export function createCoastalSkateboard(parent:THREE.Object3D,scale=1,lift=0):THREE.Group {
  template ??= skateboardTemplate();
  const board = template.clone();
  board.name = 'coastal skateboard';
  board.scale.setScalar(scale);board.position.set(0,lift,0);
  // The board runs under the sideways stance.
  board.rotation.y = Math.PI/2;
  board.visible = false;parent.add(board);return board;
}
