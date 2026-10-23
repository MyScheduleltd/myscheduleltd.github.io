import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {chamferedBox} from './EnvironmentArchitecture';
import type {RooftopStairCameraBounds} from './RooftopCamera';

type ZY=readonly[number,number];
export interface StairGuardPost {
  z:number;supportTop:number;supportMinZ:number;supportMaxZ:number;
  section:'lower-flight'|'half-landing'|'upper-flight'|'top-landing';
  tread?:number;
}
export interface RooftopStairGuardPlan {
  railX:number;supportMinX:number;supportMaxX:number;nodes:ZY[];posts:StairGuardPost[];
  baseWidth:number;baseDepth:number;baseThickness:number;baseSink:number;
}

/** Posts land at tread centres; rail bends follow the actual riser boundaries. */
export function rooftopStairGuardPlan(r:RooftopStairCameraBounds,roofY:number):RooftopStairGuardPlan {
  const going=(r.stairLandingMinZ-r.stairMinZ)/9,riser=roofY/20,half=roofY/2;
  const plan:RooftopStairGuardPlan={railX:r.stairMinX-.25,supportMinX:r.stairMinX-.5,supportMaxX:r.stairMinX,
    nodes:[[r.stairMinZ+.16,riser+.16*riser/going],[r.stairLandingMinZ,half],
      [r.stairLandingMaxZ,half],[r.stairLandingMaxZ,half+riser],[r.stairTopZ,roofY],[r.stairMaxZ-.14,roofY]],
    posts:[],baseWidth:.28,baseDepth:.28,baseThickness:.04,baseSink:.002};
  for(const [start,base,section] of [[r.stairMinZ,0,'lower-flight'],[r.stairLandingMaxZ,half,'upper-flight']] as const){
    for(const tread of [0,2,4,6,8])plan.posts.push({z:start+(tread+.5)*going,supportTop:base+(tread+1)*riser+.36,
      supportMinZ:start+tread*going,supportMaxZ:start+(tread+1)*going,section,tread});
  }
  for(const [from,to,base,section] of [[r.stairLandingMinZ,r.stairLandingMaxZ,half,'half-landing'],[r.stairTopZ,r.stairMaxZ,roofY,'top-landing']] as const){
    for(const z of [from+.28,(from+to)/2,to-.28])plan.posts.push({z,supportTop:base+.36,supportMinZ:from,supportMaxZ:to,section});
  }
  plan.posts.sort((a,b)=>a.z-b.z);return plan;
}

function centrelineAt(z:number,nodes:readonly ZY[]):number {
  for(let i=1;i<nodes.length;i++){
    const [za,ya]=nodes[i-1],[zb,yb]=nodes[i];
    if(z>zb)continue;
    return zb===za?Math.max(ya,yb):ya+(yb-ya)*(z-za)/(zb-za);
  }
  return nodes.at(-1)![1];
}

/** A closed chamfered steel rail with true mitred joints and no overlapping end boxes. */
function sweptRail(nodes:readonly ZY[],x:number,height:number,size:number):THREE.BufferGeometry {
  const half=size/2,bevel=Math.min(.012,size*.15);
  const profile:ZY[]=[[-half+bevel,-half],[half-bevel,-half],[half,-half+bevel],[half,half-bevel],
    [half-bevel,half],[-half+bevel,half],[-half,half-bevel],[-half,-half+bevel]];
  const normals=nodes.slice(1).map(([z,y],i)=>new THREE.Vector2(-(y-nodes[i][1]),z-nodes[i][0]).normalize());
  const sections=nodes.map(([z,y],i)=>{
    const before=normals[Math.max(0,i-1)],after=normals[Math.min(normals.length-1,i)];
    const miter=before.clone().add(after).normalize();miter.multiplyScalar(1/Math.max(.4,miter.dot(after)));
    return profile.map(([px,offset])=>new THREE.Vector3(x+px,y+height+miter.y*offset,z+miter.x*offset));
  });
  const positions:number[]=[],uvs:number[]=[];
  const face=(vertices:THREE.Vector3[],outward:THREE.Vector3)=>{
    const normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
    if(normal.dot(outward)<0)vertices.reverse();
    for(let i=1;i<vertices.length-1;i++)for(const p of [vertices[0],vertices[i],vertices[i+1]]){
      positions.push(p.x,p.y,p.z);uvs.push(p.z/4,p.y/4);
    }
  };
  for(let segment=0;segment<sections.length-1;segment++)for(let j=0;j<profile.length;j++){
    const k=(j+1)%profile.length,[px,offset]=[(profile[j][0]+profile[k][0])/2,(profile[j][1]+profile[k][1])/2];
    face([sections[segment][j],sections[segment][k],sections[segment+1][k],sections[segment+1][j]],
      new THREE.Vector3(px,normals[segment].y*offset,normals[segment].x*offset));
  }
  for(const [i,sign] of [[0,-1],[nodes.length-1,1]]){
    const a=nodes[i===0?0:i-1],b=nodes[i===0?1:i];face([...sections[i]],new THREE.Vector3(0,b[1]-a[1],b[0]-a[0]).multiplyScalar(sign));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();return geometry;
}

/** One static draw mesh, no new textures/lights/updates/colliders. */
export function createRooftopStairGuard(r:RooftopStairCameraBounds,roofY:number,surface:THREE.MeshStandardMaterial){
  const plan=rooftopStairGuardPlan(r,roofY),root=new THREE.Group();root.name='NIMA stair guard';
  const material=surface.clone();material.name='NIMA polished painted iron';material.roughness=.52;material.metalness=.38;
  material.userData={...material.userData,preserveAuthoredSurface:true};
  const pieces:THREE.BufferGeometry[]=[];let vertices=0;
  const add=(geometry:THREE.BufferGeometry)=>{const flat=geometry.index?geometry.toNonIndexed():geometry;if(flat!==geometry)geometry.dispose();pieces.push(flat);
    const range={start:vertices,count:flat.getAttribute('position').count};vertices+=range.count;return range;};
  const box=(size:readonly[number,number,number],at:readonly[number,number,number],bevel:number)=>{const geometry=chamferedBox(size,bevel);geometry.translate(...at);return add(geometry);};
  const inspection={rails:[] as Array<{start:number;count:number}>,bases:[] as Array<{start:number;count:number;support:StairGuardPost}>,posts:[] as Array<{start:number;count:number;support:StairGuardPost}>};
  for(const [height,size] of [[1.8,.12],[.9,.075]])inspection.rails.push(add(sweptRail(plan.nodes,plan.railX,height,size)));
  for(const post of plan.posts){
    const bottom=post.supportTop-plan.baseSink,baseTop=bottom+plan.baseThickness;
    inspection.bases.push({...box([plan.baseWidth,plan.baseThickness,plan.baseDepth],[plan.railX,bottom+plan.baseThickness/2,post.z],.008),support:post});
    const top=centrelineAt(post.z,plan.nodes)+1.8-.02,foot=baseTop-.008;
    inspection.posts.push({...box([.12,top-foot,.12],[plan.railX,(top+foot)/2,post.z],.012),support:post});
    for(const dx of [-.088,.088])for(const dz of [-.088,.088]){
      const bolt=new THREE.CylinderGeometry(.018,.018,.018,6);bolt.translate(plan.railX+dx,baseTop+.009,post.z+dz);add(bolt);
    }
  }
  const geometry=mergeGeometries(pieces,false);if(!geometry)throw Error('Cannot merge NIMA stair guard');
  const report={posts:plan.posts.length,railSegments:(plan.nodes.length-1)*2,pieces:pieces.length,triangles:geometry.getAttribute('position').count/3,
    meshes:1,textures:0,lights:0,geometryBytes:Object.values(geometry.attributes).reduce((n,a)=>n+(a instanceof THREE.BufferAttribute?a.array.byteLength:0),0)};
  pieces.forEach(g=>g.dispose());
  const mesh=new THREE.Mesh(geometry,material);mesh.name='NIMA stair guard rail';mesh.userData.wornNoMasonry=true;
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.layers.enable(1);root.add(mesh);root.userData.rooftopStairGuardReport=report;
  return{root,report,plan,inspection};
}
