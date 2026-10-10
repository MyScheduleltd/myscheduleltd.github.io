import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
export {THREE};
export async function loadGuitar(path='src/assets/band/guitarist.glb') {
 const bytes=await readFile(path),length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length));
 for(const m of doc.meshes)for(const p of m.primitives)delete p.material;delete doc.materials;delete doc.images;delete doc.textures;
 const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const bin=bytes.subarray(20+length),head=Buffer.alloc(20);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(20+padded.length+bin.length,8);head.writeUInt32LE(padded.length,12);head.writeUInt32LE(0x4e4f534a,16);
 const clean=Buffer.concat([head,padded,bin]);return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(clean.buffer.slice(clean.byteOffset,clean.byteOffset+clean.byteLength),'');
}
export function handSamples(body,prefix='LeftHand') {
 const p=body.geometry.attributes.position,skin=body.geometry.attributes.skinIndex,weight=body.geometry.attributes.skinWeight,out=[];
 for(let i=0;i<p.count;i++){
  let total=0;for(let j=0;j<4;j++){const name=body.skeleton.bones[skin.getComponent(i,j)].name;if(name.startsWith(prefix))total+=weight.getComponent(i,j)}
  if(total>.5)out.push(i);
 }
 return out;
}
export function skinPoint(mesh,index) {
 return mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,index)).applyMatrix4(mesh.matrixWorld);
}
export function neckTriangles(root,neck,centre) {
 const out=[];root.getObjectByName('prop-guitar').traverse(mesh=>{
  if(!mesh.isMesh||mesh.name!=='Mesh_0')return;mesh.skeleton.update();const p=mesh.geometry.attributes.position,ids=mesh.geometry.index,points=Array.from({length:p.count},(_,i)=>skinPoint(mesh,i));
  for(let i=0;i<(ids?.count??p.count);i+=3){const a=points[ids?ids.getX(i):i],b=points[ids?ids.getX(i+1):i+1],c=points[ids?ids.getX(i+2):i+2];
   if([a,b,c].every(v=>Math.abs(v.dot(neck)-centre)<.12))out.push(new THREE.Triangle(a,b,c));
  }
 });return out;
}
/** Conservative neck/string envelope: includes every rendered surface on a ray. */
export function skinClearance(root,triangles,front,samples) {
 const body=root.getObjectByName('guitarist-body');body.skeleton.update();let worst=Infinity,inside=0,checked=0,vertex=-1;
 const ray=new THREE.Ray(),hit=new THREE.Vector3();
 for(const i of samples){const point=skinPoint(body,i),value=point.dot(front);let low=Infinity,high=-Infinity;
  ray.set(point.clone().addScaledVector(front,.4),front.clone().negate());
  for(const tri of triangles)if(ray.intersectTriangle(tri.a,tri.b,tri.c,false,hit)){const at=hit.dot(front);low=Math.min(low,at);high=Math.max(high,at)}
  if(!Number.isFinite(low))continue;checked++;
  const clearance=value>high?value-high:value<low?low-value:-Math.min(high-value,value-low);
  if(clearance<0)inside++;if(clearance<worst){worst=clearance;vertex=i}
 }
 return {worst,inside,checked,vertex};
}
