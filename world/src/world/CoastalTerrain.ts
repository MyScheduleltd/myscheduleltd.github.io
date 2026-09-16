import { excludeRoads } from './CoastalSurfaces.ts';
import * as THREE from 'three';

/** World units are approximately half a metre. The old street remains the datum. */
export const SEA_Y = -2;
export const TEMPLE_GRADE = 4.8;
/** Shared visible stairs, walking ramp and printed plan. */
export const TEMPLE_STAIRS = { start:65, end:74.5, centerZ:4, width:13, count:25, top:6 } as const;
/**
 * Visual masonry carried just under the cut terrain at both stair edges.
 * The walkable width remains TEMPLE_STAIRS.width; this small skirt only keeps
 * an oblique camera from seeing through the exact tread/terrain boundary.
 */
export const TEMPLE_STAIR_VISUAL_OVERLAP = 0.16;
export const TEMPLE_STAIR_FOOTPRINT: readonly PlanPoint[] = [[65,-2.5],[74.5,-2.5],[74.5,10.5],[65,10.5]];
export const templeStairX = (index:number) => index<=20?65+index*.32:71.4+(index-20)*.62;
export const templeStairPitch = (x:number) => x<71.4?4.8*Math.max(0,(x-65)/6.4):4.8+1.2*Math.min(1,(x-71.4)/3.1);
export const templeTreadTop = (x:number) => .24*Math.min(25,Math.floor(x<71.4?(x-65)/.32:20+(x-71.4)/.62)+1);
export const SHORE_GRADE = 0;
export const CLUB_GRADE = -1;
// Shared finished grades keep houses fixed while the surrounding earth is raised.
// The east foreground house sits back from the service lane to leave a real forecourt.
export const INLAND_HOUSES = [
  [-39,65,17,14,8,2.49],[-66,65,19,13,10,3.61],
  [35,68,16,14,9,2.49],[66,66,17,12,7,2.76],
] as const;
export type PlanPoint = readonly [number, number];

/** A long contour walk, with a maximum designed longitudinal grade below 5%. */
export const HILL_WALK: readonly (readonly [number, number, number])[] = [
  [58, 0, 5.5], [64, 0, 5.5], [68, .8, -14], [68, 1.6, -32], [112, 3.2, -32],
  [116, 4.2, -6], [114, 4.8, 28], [72, 4.8, 28], [72, 4.8, 4], [73, 4.8, 4],
];

/** Service street stays on a graded terrace below the hill walk. */
export const EAST_SERVICE_LANE: readonly (readonly [number,number,number])[] = [
  [6,2,56],[60.5,0,56],[60.5,0,-6],[54,0,-12],[46,0,-12],[17,0,-12],[17,-.8,-22],[0,-.8,-22],
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
  [18, 52, -41, -10, 0, 6],
  [-17, 20, -51, -25, -.8, 6],
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
  for(const [cx,cz,w,d,,base] of INLAND_HOUSES) {
    const distance=outside(x,z,cx-w/2-1.5,cx+w/2+1.5,cz-d/2-1.5,cz+d/2+1.5);
    // Hold the entrance earth just below the door sill. The former 0.08 gap
    // left a bright exposed foundation line even on the level houses.
    h=mix(h,base-.02,1-smooth(distance/5));
  }
  // Square and its main pedestrian spine remain a deliberately level civic terrace.
  h = mix(h, 0, 1 - smooth(outside(x,z,-17,17,-18,14) / 7));
  // A modest rise on the arrival street, independently of the pads at its sides.
  if (z > 14) {
    const roadWeight = 1 - smooth(Math.max(0, Math.abs(x) - 16) / 5);
    h = mix(h, 3 * clamp((z - 16) / 60), roadWeight);
  }
  // Grade the service street before the pedestrian contour. The road descends
  // once from the arrival junction, then remains level along the shop frontage.
  let roadDistance=Infinity,roadHeight=0;
  for(let i=1;i<EAST_SERVICE_LANE.length;i++){
    const a=EAST_SERVICE_LANE[i-1],b=EAST_SERVICE_LANE[i],dx=b[0]-a[0],dz=b[2]-a[2];
    const t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz));
    const d=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t);
    if(d<roadDistance){roadDistance=d;roadHeight=mix(a[1],b[1],t);}
  }
  const roadBlend=z>58?1.6:3.1;
  if(roadDistance<2.4+roadBlend)h=mix(h,roadHeight,1-smooth((roadDistance-2.4)/roadBlend));
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
  // Building interiors take priority over landscape/road blending. Keep these
  // small pads away from the contour route so its accessible grade is unchanged.
  for (const [a,b,c,d] of [[22,58,8,22],[-26,-18,18,30]]) {
    h = mix(h, 0, 1 - smooth(outside(x,z,a,b,c,d) / 3));
  }
  // Earth meets the podium just below its stone finish, including all corners.
  const foundationDistance=outside(x,z,74,108,-16,24);
  h=mix(h,5.88,1-smooth(foundationDistance/1.5));
  // Extend the excavation past both edges for the terrain's 2-unit triangles.
  if(x>=65&&x<=74&&Math.abs(z-TEMPLE_STAIRS.centerZ)<=10){
    const belowFlight=x<71.4?Math.max(0,templeStairPitch(x)-.15):4.8;
    h=mix(h,Math.min(h,belowFlight),1-smooth((Math.abs(z-4)-8)/2));
  }
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
  // Remove earth inside the founded stair footprint instead of relying on
  // coarse landscape triangles to stay below every narrow tread.
  excludeRoads(mesh,[TEMPLE_STAIR_FOOTPRINT]);
  const cutPositions=mesh.geometry.getAttribute('position'),cutColours:number[]=[];
  for(let i=0;i<cutPositions.count;i++){
    const x=cutPositions.getX(i),z=cutPositions.getZ(i),y=cutPositions.getY(i),shore=shorelineAt(x);
    if(z<-16)colour.copy(wet).lerp(sand,smooth((z-shore)/18));
    else colour.copy(soil).lerp(cut,clamp(y/7));
    colour.multiplyScalar(1+Math.sin(x*.31+z*.19)*.035+Math.cos(x*.16-z*.27)*.025);
    cutColours.push(colour.r,colour.g,colour.b);
  }
  mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(cutColours,3));
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
  const edges=groundRibbonEdges(points,width);
  const vertices:number[]=[];
  // Clip each paved strip against the actual 2-unit terrain triangles. Every
  // paved triangle then lies on one terrain plane, including its interior.
  const cross=(a:PlanPoint,b:PlanPoint,p:PlanPoint)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const clip=(input:PlanPoint[],bounds:PlanPoint[])=>{
    let polygon=input;
    for(let e=0;e<3;e++){
      const a=bounds[e],b=bounds[(e+1)%3],output:PlanPoint[]=[];
      for(let j=0;j<polygon.length;j++){
        const p=polygon[j],q=polygon[(j+1)%polygon.length],dp=cross(a,b,p),dq=cross(a,b,q);
        if(dp<=1e-9)output.push(p);
        if((dp<0&&dq>0)||(dp>0&&dq<0)){
          const t=dp/(dp-dq);output.push([mix(p[0],q[0],t),mix(p[1],q[1],t)]);
        }
      }
      polygon=output;if(!polygon.length)break;
    }
    return polygon;
  };
  for(let i=1;i<edges.length;i++)for(const triangle of [[edges[i-1][0],edges[i-1][1],edges[i][0]],[edges[i-1][1],edges[i][1],edges[i][0]]]){
    const minX=Math.floor(Math.min(...triangle.map(p=>p[0]))/2)*2,maxX=Math.max(...triangle.map(p=>p[0]));
    const minZ=Math.floor(Math.min(...triangle.map(p=>p[1]))/2)*2,maxZ=Math.max(...triangle.map(p=>p[1]));
    for(let z=minZ;z<maxZ;z+=2)for(let x=minX;x<maxX;x+=2){
      for(const cell of [[[x,z],[x,z+2],[x+2,z]],[[x+2,z],[x,z+2],[x+2,z+2]]] as PlanPoint[][]){
        const polygon=clip(triangle,cell);
        for(let n=1;n<polygon.length-1;n++){
          const a=polygon[0],b=polygon[n],c=polygon[n+1];
          if(Math.abs(cross(a,b,c))<1e-9)continue;
          for(const p of [a,b,c])vertices.push(p[0],heightAt(p[0],p[1])+lift,p[1]);
        }
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;mesh.receiveShadow=true;
  mesh.userData.groundFootprint=[...edges.map(e=>e[0]),...edges.map(e=>e[1]).reverse()];
  mesh.userData.groundLift=lift;
  mesh.userData.projectorBackground=true;
  mesh.userData.wornNoMasonry=true;
  mesh.userData.coastalAuthored=true;
  return mesh;
}

/** Shared mitred edges for pavement rendering, exclusion and the illustrated map. */
export function groundRibbonEdges(points:readonly PlanPoint[],width:number):PlanPoint[][] {
  const samples=points.map(p=>new THREE.Vector2(...p));
  const edges:PlanPoint[][]=[];
  for(let i=0;i<samples.length;i++){
    const here=samples[i],prev=samples[Math.max(0,i-1)],next=samples[Math.min(samples.length-1,i+1)];
    const before=here.clone().sub(prev).normalize(),after=next.clone().sub(here).normalize();
    if(i===0)before.copy(after);if(i===samples.length-1)after.copy(before);
    const n1=new THREE.Vector2(-before.y,before.x),n2=new THREE.Vector2(-after.y,after.x);
    const mitre=n1.clone().add(n2).normalize();
    const reach=Math.min(width*1.25,width*.5/Math.max(.4,mitre.dot(n1)));
    edges.push([-1,1].map(side=>[here.x+mitre.x*reach*side,here.y+mitre.y*reach*side] as PlanPoint));
  }
  return edges;
}

/** Same polygon used by the paving mesh, for floor contact without a second layout. */
export function insidePaving(x:number,z:number,polygon:readonly PlanPoint[]):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
