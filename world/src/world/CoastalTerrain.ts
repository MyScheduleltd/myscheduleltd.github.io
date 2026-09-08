import * as THREE from 'three';

/** World units are approximately half a metre. The old street remains the datum. */
export const SEA_Y = -2;
export const TEMPLE_GRADE = 4.8;
export const SHORE_GRADE = -0.8;
export const CLUB_GRADE = -1;
export type PlanPoint = readonly [number, number];

/** A long contour walk, with a maximum designed longitudinal grade below 5%. */
export const HILL_WALK: readonly (readonly [number, number, number])[] = [
  [40, 0, 4], [65, 0.8, -4], [65, 1.6, -32], [112, 3.2, -32],
  [116, 4.2, -6], [114, 4.8, 28], [70, 4.8, 28], [70, 4.8, 4], [73, 4.8, 4],
];

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const outside = (x: number, z: number, a: number, b: number, c: number, d: number) =>
  Math.hypot(Math.max(a - x, 0, x - b), Math.max(c - z, 0, z - d));

/** Coast bends are authored at landscape scale; its centre keeps the screening bay. */
export const shorelineAt = (x: number): number =>
  -59 - 3.2 * Math.sin(x * 0.045) - 1.2 * Math.sin(x * 0.11 + 0.7);

const pads = [
  [-102, -17, -9, 52, 0, 9], // Warehouse block and forecourt.
  [14, 62, -5, 47, 0, 8],   // Shop, deck, outside stair and lower approach.
  [-48, -22, -51, -20, 0, 6],
  [21, 49, -39, -10, 0, 6],
  [-17, 17, -50, -27, SHORE_GRADE, 8],
  [69, 110, -17, 25, TEMPLE_GRADE, 19],
] as const;

function designGrade(x: number, z: number): number {
  const coast = shorelineAt(x);
  // Connected foreshore and seabed: the sea intersects the same mesh people stand on.
  let h = z < coast ? SEA_Y + (z - coast) * 0.34
    : mix(SEA_Y, 0, smooth((z - coast) / 37));
  if (z > -18) h = Math.max(h, 3 * clamp((z - 16) / 60));
  // Hills frame the town; the developed pads below are cut into this same ground.
  h += 5.4 * Math.exp(-(((x - 97) / 37) ** 2 + ((z - 9) / 39) ** 2));
  h += 3.8 * Math.exp(-(((x + 93) / 25) ** 2 + ((z - 68) / 22) ** 2));
  // Dunes occupy the sheltered upper shore, away from all three venue pads.
  const duneBand = Math.exp(-(((z + 33) / 13) ** 2));
  h += duneBand * Math.max(0, 1 - Math.abs(Math.abs(x) - 66) / 26)
    * (0.75 + 0.35 * Math.sin(x * 0.17));
  for (const [a,b,c,d,height,blend] of pads) {
    h = mix(h, height, 1 - smooth(outside(x,z,a,b,c,d) / blend));
  }
  // Square and its main pedestrian spine remain a deliberately level civic terrace.
  h = mix(h, 0, 1 - smooth(outside(x,z,-17,17,-18,14) / 7));
  // A modest rise on the arrival street, independently of the pads at its sides.
  if (z > 14) {
    const roadWeight = 1 - smooth(Math.max(0, Math.abs(x) - 16) / 5);
    h = mix(h, 3 * clamp((z - 16) / 60), roadWeight);
  }
  // Carve a contour path into the hillside. A full-width level cross-section is
  // blended back into the hill, providing real earth beneath the paving.
  let nearest = Infinity;
  let pathY = 0;
  for (let i = 1; i < HILL_WALK.length; i++) {
    const a = HILL_WALK[i-1], b = HILL_WALK[i];
    const dx = b[0]-a[0], dz = b[2]-a[2];
    const t = clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz));
    const distance = Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t);
    if (distance < nearest) { nearest = distance; pathY = mix(a[1],b[1],t); }
  }
  if (nearest < 10) h = mix(h,pathY,1-smooth((nearest-2.8)/7.2));
  // Flat floor and stair foundation of the inland warehouse are cut out in the
  // rendered terrain; avoid reporting the planted hill as its floor.
  return h;
}

// Cache grid vertices: feet and route probes reuse the same local triangles.
const gradeCache = new Map<string, number>();
function gridGrade(x: number, z: number): number {
  const key = `${x},${z}`;
  let height = gradeCache.get(key);
  if (height === undefined) { height = designGrade(x,z); gradeCache.set(key,height); }
  return height;
}

/** Sample exactly the triangles rendered below, including off-grid foot positions. */
export function terrainHeightAt(x: number, z: number): number {
  const step = 2;
  const gx = Math.floor(x/step)*step, gz = Math.floor(z/step)*step;
  const u=(x-gx)/step, v=(z-gz)/step;
  const a=gridGrade(gx,gz), b=gridGrade(gx+step,gz);
  const c=gridGrade(gx,gz+step), d=gridGrade(gx+step,gz+step);
  return u+v<=1 ? a+(b-a)*u+(c-a)*v : d+(c-d)*(1-u)+(b-d)*(1-v);
}

export function isSwimmingDepth(x: number, z: number): boolean {
  return terrainHeightAt(x,z) < SEA_Y-1.25;
}

export function createCoastalTerrain(): THREE.Mesh {
  const positions:number[]=[], colours:number[]=[];
  const soil=new THREE.Color(0x72765c), sand=new THREE.Color(0xc0aa7c);
  const wet=new THREE.Color(0x857858), cut=new THREE.Color(0x82806d);
  const colour=new THREE.Color();
  const vertex=(x:number,z:number)=>{
    const y=gridGrade(x,z);
    positions.push(x,y,z);
    const shore=shorelineAt(x);
    if(z<-16) colour.copy(wet).lerp(sand,smooth((z-shore)/18));
    else colour.copy(soil).lerp(cut,clamp(y/7));
    const facet = Math.sin(x*.31+z*.19)*.035 + Math.cos(x*.16-z*.27)*.025;
    colour.multiplyScalar(1+facet);
    colours.push(colour.r,colour.g,colour.b);
  };
  for(let z=-112;z<88;z+=2) for(let x=-120;x<130;x+=2){
    if(x>=-90&&x<-20&&z>=0&&z<42) continue;
    vertex(x,z);vertex(x,z+2);vertex(x+2,z);
    vertex(x+2,z);vertex(x,z+2);vertex(x+2,z+2);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});
  material.userData.wornNoMasonry=true;
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Coastal landform and seabed';
  mesh.receiveShadow=true;
  mesh.userData.projectorBackground=true;
  mesh.userData.coastalAuthored=true;
  mesh.userData.wornNoMasonry=true;
  return mesh;
}

/** Continuous mitred ribbons conform to the collision surface rather than float. */
export function createGroundRibbon(
  name:string, points:readonly PlanPoint[], width:number, material:THREE.Material, lift=.035,
  heightAt: (x:number,z:number)=>number = terrainHeightAt,
):THREE.Mesh {
  const samples:THREE.Vector2[]=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));
    for(let j=0;j<count;j++) samples.push(new THREE.Vector2(mix(a[0],b[0],j/count),mix(a[1],b[1],j/count)));
  }
  samples.push(new THREE.Vector2(...points[points.length-1]));
  const vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<samples.length;i++){
    const here=samples[i],prev=samples[Math.max(0,i-1)],next=samples[Math.min(samples.length-1,i+1)];
    const tangent=next.clone().sub(prev).normalize();
    for(const side of [-1,1]){
      const x=here.x-tangent.y*width*.5*side,z=here.y+tangent.x*width*.5*side;
      vertices.push(x,heightAt(x,z)+lift,z);
    }
    if(i>0){const a=(i-1)*2,b=i*2;indices.push(a,a+1,b,a+1,b+1,b);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;mesh.receiveShadow=true;
  mesh.userData.projectorBackground=true;
  mesh.userData.wornNoMasonry=true;
  mesh.userData.coastalAuthored=true;
  return mesh;
}
