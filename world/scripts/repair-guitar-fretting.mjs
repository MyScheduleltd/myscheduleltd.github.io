/** Palm-up fretting repair. Re-bakes only left-arm/hand playing rotations.
 * Read the preserved pre-followup GLB; keep original compressed geometry,
 * skins, maps and every other clip. An optional input path allows re-baking a
 * newly authored source; retain a backup rather than feeding the repaired output.
 */
import {readFile,writeFile} from 'node:fs/promises';import * as THREE from 'three';import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{MeshoptDecoder}from'three/addons/libs/meshopt_decoder.module.js';
const b=await readFile(process.argv[2] ?? '.artifacts/venue-followup-20261010/guitarist-before.glb'),n=b.readUInt32LE(12),d=JSON.parse(b.subarray(20,20+n));
for(const m of d.meshes)for(const p of m.primitives)delete p.material;delete d.materials;delete d.images;delete d.textures;
const j=Buffer.from(JSON.stringify(d)),jp=Buffer.alloc(Math.ceil(j.length/4)*4,32);j.copy(jp);const bin=b.subarray(20+n),h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(20+jp.length+bin.length,8);h.writeUInt32LE(jp.length,12);h.writeUInt32LE(0x4e4f534a,16);const clean=Buffer.concat([h,jp,bin]);
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(clean.buffer.slice(clean.byteOffset,clean.byteOffset+clean.byteLength),'');
const clip=gltf.animations.find(c=>c.name==='play');
const root=gltf.scene;

const V=THREE.Vector3,Q=THREE.Quaternion;
const spine=root.getObjectByName('Spine');root.updateMatrixWorld(true);const bindSpine=spine.getWorldQuaternion(new Q()).invert();
const get=n=>root.getObjectByName(n),wp=n=>get(n).getWorldPosition(new V()),wq=n=>get(n).getWorldQuaternion(new Q());
const setWorldQ=(bone,q)=>{bone.quaternion.copy(bone.parent.getWorldQuaternion(new Q()).invert().multiply(q));root.updateMatrixWorld(true)};
const samples=clip.tracks.map(t=>({track:t,at:t.createInterpolant()}));
const handRest=wq('LeftHand'),handInverse=handRest.clone().invert();
const alongLocal=['Index','Middle','Ring','Pinky'].map(f=>wp('LeftHand'+f+'1').sub(wp('LeftHand'))).reduce((a,v)=>a.add(v),new V()).normalize().applyQuaternion(handInverse);
const palmLocal=new V(0,0,1).applyQuaternion(wq('LeftHandIndex1')).applyQuaternion(handInverse);palmLocal.addScaledVector(alongLocal,-palmLocal.dot(alongLocal)).normalize();
const localBasis=new THREE.Matrix4().makeBasis(alongLocal,palmLocal,alongLocal.clone().cross(palmLocal)).invert();
const handBind=get('LeftHand').quaternion.clone(),twistBind=get('LeftForeArm').getWorldQuaternion(new Q()).invert().multiply(get('LeftForeArmTwist').getWorldQuaternion(new Q()));
const outputNames=['LeftArm','LeftForeArm','LeftForeArmTwist','LeftHand','LeftHandPinky1',...['Index','Middle','Ring','Pinky'].flatMap(f=>[2,3].map(i=>'LeftHand'+f+i))];
const times=Float32Array.from({length:481},(_,i)=>i/30),outputs=new Map(outputNames.map(n=>[n,new Float32Array(times.length*4)]));
const prop=root.getObjectByName('prop-guitar');
const RAY=new THREE.Raycaster();
for(let i=0;i<times.length;i++){
 const t=times[i];
 for(const {track,at} of samples){const split=track.name.lastIndexOf('.'),node=get(track.name.slice(0,split)),value=at.evaluate(t===16?0:t);if(!node)continue;node[track.name.slice(split+1)].fromArray(value)}
 root.updateMatrixWorld(true);
 prop.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingSphere()}});
 const deformation=wq('Spine').multiply(bindSpine),neck=new V(.714,.616,.333).normalize().applyQuaternion(deformation),front=new V(-.423,0,.906).normalize().applyQuaternion(deformation);
 const oldTip=wp('LeftHandMiddle4');RAY.set(oldTip.clone().addScaledVector(neck,-.04).addScaledVector(front,.25),front.clone().negate());
 const hit=RAY.intersectObject(prop,true).find(h=>h.object.name==='Mesh_0');if(!hit)throw new Error('Neck contact ray missed at '+t);
 const contact=hit.point.clone().addScaledVector(front,.012);
 const S=wp('LeftArm'),E0=wp('LeftForeArm'),W0=wp('LeftHand'),U0=wq('LeftArm'),F0=wq('LeftForeArm');
 const across=neck.clone().cross(front).normalize(),palm=across.clone().negate();
 const handQ=new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(front,palm,front.clone().cross(palm)).multiply(localBasis));
 for(const f of ['Index','Middle','Ring','Pinky']){
  get('LeftHand'+f+'3').quaternion.multiply(new Q().setFromAxisAngle(new V(1,0,0),f==='Middle'?.25:f==='Pinky'?-.3:f==='Ring'?-.2:-.4));
 }
 get('LeftHandPinky1').quaternion.multiply(new Q().setFromAxisAngle(new V(1,0,0),-.3));
 setWorldQ(get('LeftHand'),handQ);
 const W=wp('LeftHand').add(contact.clone().sub(wp('LeftHandMiddle4'))).addScaledVector(across,.01);
 const L1=S.distanceTo(E0),L2=E0.distanceTo(W0),dir=W.clone().sub(S),distance=dir.length();dir.normalize();
 if(distance>L1+L2)throw new Error(JSON.stringify({t,L1,L2,distance,W:W.toArray(),S:S.toArray(),contact:contact.toArray()}));
 const axial=(L1*L1-L2*L2+distance*distance)/(2*distance),radius=Math.sqrt(Math.max(0,L1*L1-axial*axial));
 const pole=E0.clone().sub(S).addScaledVector(dir,-E0.clone().sub(S).dot(dir)).normalize();
 const E=S.clone().addScaledVector(dir,axial).addScaledVector(pole,radius);
 setWorldQ(get('LeftArm'),new Q().setFromUnitVectors(E0.clone().sub(S).normalize(),E.clone().sub(S).normalize()).multiply(U0));
 const foreQ=new Q().setFromUnitVectors(W0.clone().sub(E0).normalize(),W.clone().sub(E).normalize()).multiply(F0);
 // Pronation belongs to the forearm; leaving it all at the wrist twists the cuff.
 const relative=foreQ.clone().invert().multiply(handQ).multiply(handBind.clone().invert());
 const twist=new Q(0,relative.y,0,relative.w).normalize();foreQ.multiply(twist);
 setWorldQ(get('LeftForeArm'),foreQ);
 setWorldQ(get('LeftForeArmTwist'),foreQ.clone().multiply(twistBind));
 setWorldQ(get('LeftHand'),handQ);
 for(const name of outputNames)get(name).quaternion.toArray(outputs.get(name),i*4);
}
const source=JSON.parse(b.subarray(20,20+n)),animation=source.animations.find(a=>a.name==='play');
const originalBin=b.subarray(28+n),blocks=[originalBin];let offset=originalBin.length;
const append=(values,type)=>{const data=Buffer.from(values.buffer);source.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});blocks.push(data);offset+=data.length;source.accessors.push({bufferView:source.bufferViews.length-1,componentType:5126,count:values.length/(type==='VEC4'?4:1),type,...(type==='SCALAR'?{min:[0],max:[16]}:{})});return source.accessors.length-1;};
const input=append(times,'SCALAR'),changed=[];
for(const [name,values]of outputs){const node=source.nodes.findIndex(n=>n.name===name),output=append(values,'VEC4'),channel=animation.channels.find(c=>c.target.node===node&&c.target.path==='rotation');if(!channel)throw new Error('Missing channel '+name);animation.samplers[channel.sampler]={input,output,interpolation:'LINEAR'};changed.push(name)}
source.buffers[0].byteLength=offset;const json=Buffer.from(JSON.stringify(source)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const binary=Buffer.concat(blocks),header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);await writeFile('src/assets/band/guitarist.glb',Buffer.concat([header,padded,bh,binary]));console.log({changed,addedBytes:offset-originalBin.length});
