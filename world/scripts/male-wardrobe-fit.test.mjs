import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=new DataView(await blob.arrayBuffer());return {width:b.getUint32(16),height:b.getUint32(20),close(){}};};
globalThis.document={createElement:()=>({width:64,height:64,getContext:()=>({fillRect(){}})})};
const output=await build({stdin:{contents:"export * from './src/world/ImportedAvatar'; export * from './src/world/CoastalAvatar'; export * from './src/world/CoastalPose'; export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
const {THREE,MOVE_SECONDS,loadImportedAvatar,attachImportedAvatar,syncImportedAvatars,createCoastalAvatar,walkCoastalPose,waveCoastalPose,supportCoastalPose,setCoastalSwimwear}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const files=Object.fromEntries(await Promise.all(['male','female'].map(async sex=>{
 const bytes=await readFile(sex==='male'?(process.env.WARDROBE_MALE_TEST_ASSET??'src/assets/avatars/male.glb'):'src/assets/avatars/female.glb');
 return [sex,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)];
})));
await loadImportedAvatar(files);
function character(top='#18191b',cap){
 const root=new THREE.Group(),palette={skin:'#dfb590',hair:'#3b3633',top,bottoms:'#44464a',swimwear:'#577467',cap};
 const rig=createCoastalAvatar(root,palette,true,new THREE.Group());attachImportedAvatar(root,rig,palette);
 walkCoastalPose(rig,0,0);supportCoastalPose(rig);syncImportedAvatars(root);root.updateMatrixWorld(true);
 const parts=Object.fromEntries(root.userData.importedAvatar.meshes.map(m=>[m.userData.componentId,m]));
 return {root,rig,parts};
}
test('male shirt, vest and prints do not follow the thighs or head',()=>{
 const {parts}=character();
 for(const [id,mesh] of Object.entries(parts)){
  if(id!=='garment-tee'&&id!=='vest'&&!id.startsWith('print-'))continue;
  const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
  for(let v=0;v<indices.count;v++)for(let k=0;k<4;k++){
   if(weights.getComponent(v,k)<1e-6)continue;
   const bone=mesh.skeleton.bones[indices.getComponent(v,k)].name;
   assert.ok(!/Leg|Foot|Toe|^Head$|head_end|headfront/.test(bone),`${id} vertex ${v} follows ${bone}`);
  }
 }
});
test('male waistband stays enclosed by the shirt in all three standing outfits',()=>{
 for(const top of ['#18191b','#191a1c','#1a1b1d']){
  const {parts}=character(top),pants=parts['garment-trousers'],tee=parts['garment-tee'];
  pants.skeleton.update();tee.skeleton.update();
  const hips=tee.skeleton.bones.find(b=>b.name==='Hips').getWorldPosition(new THREE.Vector3());
  const p=pants.geometry.getAttribute('position');let sampled=0;
  for(let v=0;v<p.count;v++){
   // Select the actual authored upper waistband, not an arbitrary screen crop.
   if(p.getY(v)<-.10)continue;
   const point=pants.getVertexPosition(v,new THREE.Vector3()).applyMatrix4(pants.matrixWorld);
   const origin=hips.clone();origin.y=point.y;
   const delta=point.clone().sub(origin);if(delta.length()<.03)continue;
   const ray=new THREE.Raycaster(origin,delta.clone().normalize(),0,1);
   const hits=ray.intersectObject(tee,false);
   assert.ok(hits.some(hit=>hit.distance>=delta.length()+.008),`outfit ${top}: waistband ${v} escapes shirt (${delta.length().toFixed(3)}m)`);
   sampled++;
  }
  assert.ok(sampled>20,`waistband fixture must sample the real upper ring (${sampled})`);
 }
});
test('male waistband stays attached to the pelvis throughout walking',()=>{
 const {root,rig,parts}=character(),pants=parts['garment-trousers'],p=pants.geometry.getAttribute('position');
 const vertices=Array.from({length:p.count},(_,v)=>v).filter(v=>p.getY(v)>-.07);
 let before;
 for(let frame=0;frame<16;frame++){
  walkCoastalPose(rig,frame/16*Math.PI*2);supportCoastalPose(rig);syncImportedAvatars(root);root.updateMatrixWorld(true);pants.skeleton.update();
  const inverse=pants.skeleton.bones.find(b=>b.name==='Hips').matrixWorld.clone().invert();
  const points=vertices.map(v=>pants.getVertexPosition(v,new THREE.Vector3()).applyMatrix4(pants.matrixWorld).applyMatrix4(inverse));
  if(before)points.forEach((point,i)=>assert.ok(point.distanceTo(before[i])<.005,'thigh motion pulled the waistband into a spike'));
  else before=points;
 }
});
test('skin enclosed by the torso panels cannot leak out as the arms rise',()=>{
 const {parts}=character(),body=parts.body,p=body.geometry.getAttribute('position'),mask=body.geometry.getAttribute('_covered');let checked=0;
 for(let v=0;v<p.count;v++){
  // This is torso-side skin, well inside the shirt, away from the sleeve openings.
  if(Math.abs(p.getX(v))>=.17||p.getY(v)<=.06||p.getY(v)>=.25)continue;
  assert.ok(mask.getX(v)>.5,`torso-side vertex ${v} is exposed by the dressed shader`);checked++;
 }
 assert.ok(checked>100,'test must include the actual generated torso surface');
});
test('male capped hair remains behind the actual rendered crown',()=>{
 const {parts}=character('#18191b','#232a36'),body=parts.body,cap=parts.cap;
 body.skeleton.update();cap.skeleton.update();
 const head=cap.skeleton.bones.findIndex(b=>b.name==='Head');
 // Undo the cap's rigid head skinning, so rays use the current head pose
 // rather than assuming a particular world angle or avatar scale.
 const headFrame=cap.matrixWorld.clone().multiply(cap.bindMatrixInverse)
  .multiply(cap.skeleton.bones[head].matrixWorld).multiply(cap.skeleton.boneInverses[head]).multiply(cap.bindMatrix);
 const inverse=headFrame.clone().invert(),p=body.geometry.getAttribute('position');let sampled=0;
 for(let v=0;v<p.count;v+=3){
  if(p.getY(v)<.65)continue;
  const point=body.getVertexPosition(v,new THREE.Vector3()).applyMatrix4(body.matrixWorld);
  const local=point.clone().applyMatrix4(inverse);
  const origin=new THREE.Vector3(.014,local.y,.027).applyMatrix4(headFrame);
  const delta=point.clone().sub(origin);if(delta.length()<.005)continue;
  const hits=new THREE.Raycaster(origin,delta.clone().normalize(),0,5).intersectObject(cap,false);
  if(!hits.length)continue; // The adjustable rear opening has no cap surface.
  assert.ok(delta.length()<hits[0].distance-.001,`hair vertex ${v} shows through the cap crown`);sampled++;
 }
 assert.ok(sampled>1000,`cap regression must measure real upper hair (${sampled})`);
});
test('removing the male cap restores the complete hairstyle in every outfit and swimwear',()=>{
 for(const top of ['#18191b','#191a1c','#1a1b1d','#1b1c1e']){
  const {root,parts}=character(top),body=parts.body,key=body.morphTargetDictionary.CapHair;
  const vertices=[...Array(body.geometry.getAttribute('position').count).keys()].filter(v=>v%31===0);
  body.skeleton.update();const before=vertices.map(v=>body.getVertexPosition(v,new THREE.Vector3()));
  const palette={skin:'#dfb590',hair:'#3b3633',top,bottoms:'#44464a',swimwear:'#577467'};
  root.userData.setImportedPalette({...palette,cap:'#232a36'});assert.equal(body.morphTargetInfluences[key],1);assert.ok(parts.cap.visible);
  // The cap must fit around the generated hairstyle, preserving its volume.
  vertices.forEach((v,i)=>assert.ok(body.getVertexPosition(v,new THREE.Vector3()).distanceTo(before[i])<1e-7,'wearing the cap changed the hairstyle or anatomy'));
  root.userData.setImportedPalette(palette);assert.equal(body.morphTargetInfluences[key],0);assert.equal(parts.cap.visible,false);
  vertices.forEach((v,i)=>assert.ok(body.getVertexPosition(v,new THREE.Vector3()).distanceTo(before[i])<1e-7,'uncapped hairstyle was not restored'));
  setCoastalSwimwear(root,true);root.userData.setImportedPalette({...palette,cap:'#232a36'});
  assert.equal(body.morphTargetInfluences[key],1);assert.ok(parts.cap.visible);
  root.userData.setImportedPalette(palette);assert.equal(body.morphTargetInfluences[key],0);assert.equal(parts.cap.visible,false);
 }
});

// UV and hard-normal splits must not be mistaken for physical seam holes.
function shirtBoundaries(mesh){
 const p=mesh.geometry.getAttribute('position'),idx=mesh.geometry.index,canonical=new Map(),ids=[],positions=[];
 for(let v=0;v<p.count;v++){
  const point=new THREE.Vector3().fromBufferAttribute(p,v),key=point.toArray().map(x=>Math.round(x*1e6)).join(',');
  if(!canonical.has(key)){canonical.set(key,positions.length);positions.push(point);}
  ids.push(canonical.get(key));
 }
 const edges=new Map();
 for(let f=0;f<idx.count;f+=3){
  const tri=[ids[idx.getX(f)],ids[idx.getX(f+1)],ids[idx.getX(f+2)]];
  if(new Set(tri).size<3)continue;
  for(let k=0;k<3;k++){
   const a=tri[k],b=tri[(k+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');
   const e=edges.get(key)??{a,b,count:0};e.count++;edges.set(key,e);
  }
 }
 assert.ok([...edges.values()].every(e=>e.count<=2),'shirt has overlapping nonmanifold faces');
 const boundary=[...edges.values()].filter(e=>e.count===1),neighbors=new Map();
 for(const {a,b} of boundary){for(const [x,y] of [[a,b],[b,a]]){const n=neighbors.get(x)??[];n.push(y);neighbors.set(x,n);}}
 assert.ok([...neighbors.values()].every(n=>n.length===2),'a garment opening branches or ends in a tear');
 const unseen=new Set(neighbors.keys()),rings=[];
 while(unseen.size){
  const todo=[unseen.values().next().value],ring=[];
  while(todo.length){const v=todo.pop();if(!unseen.delete(v))continue;ring.push(v);todo.push(...neighbors.get(v));}
  rings.push(ring.map(v=>positions[v]));
 }
 return rings;
}
test('male tee has only its four intended openings, with no collar or cuff tears',()=>{
 const {parts}=character(),rings=shirtBoundaries(parts['garment-tee']);
 assert.equal(rings.length,4,'only the neck, two cuffs and lower hem should be open');
 assert.ok(rings.every(r=>r.length>=16),'an extra small tear survived export');
 assert.equal(rings.filter(r=>r.every(p=>p.y>.33)).length,1,'one continuous collar opening');
 assert.equal(rings.filter(r=>r.every(p=>p.y<-.11)).length,1,'one lower hem');
 assert.equal(rings.filter(r=>r.every(p=>Math.abs(p.x)>.17)&&r.every(p=>p.y>.09&&p.y<.17)).length,2,'two continuous sleeve openings');
});
test('male collar stays attached to the torso when either arm is raised',()=>{
 for(const top of ['#18191b','#191a1c','#1a1b1d']){
  const {root,rig,parts}=character(top),tee=parts['garment-tee'],p=tee.geometry.getAttribute('position');
  const vertices=Array.from({length:p.count},(_,v)=>v).filter(v=>Math.abs(p.getX(v))<.085&&p.getY(v)>.33);
  assert.ok(vertices.length>25,'regression must sample the actual collar');
  const neck=tee.skeleton.bones.find(b=>b.name==='neck');
  const sample=()=>{syncImportedAvatars(root);root.updateMatrixWorld(true);tee.skeleton.update();const inverse=neck.matrixWorld.clone().invert();return vertices.map(v=>tee.getVertexPosition(v,new THREE.Vector3()).applyMatrix4(tee.matrixWorld).applyMatrix4(inverse));};
  const rest=sample();
  for(const left of [false,true]){
   walkCoastalPose(rig,0,0);waveCoastalPose(rig,4,.5);
   if(left){rig.leftArm.quaternion.copy(rig.rightArm.quaternion);rig.rightArm.rotation.set(0,0,.18);}
   sample().forEach((point,i)=>assert.ok(point.distanceTo(rest[i])<.005,`outfit ${top}: arm movement pulled collar vertex ${vertices[i]} out of place`));
  }
 }
});
test('male cuffs retain their open shape through elbow and wrist tracking',()=>{
 const {root,rig,parts}=character(),tee=parts['garment-tee'],p=tee.geometry.getAttribute('position');
 for(const side of ['Left','Right']){
  const arm=tee.skeleton.bones.find(b=>b.name===side+'Arm'),fore=tee.skeleton.bones.find(b=>b.name===side+'ForeArm');
  const indices=tee.geometry.getAttribute('skinIndex'),weights=tee.geometry.getAttribute('skinWeight');
  const ring=shirtBoundaries(tee).find(r=>r.every(p=>p.y>.09&&p.y<.17)&&(side==='Left'?r[0].x>0:r[0].x<0));
  assert.ok(ring,'the actual cuff opening is present');
  const vertices=Array.from({length:p.count},(_,v)=>v).filter(v=>ring.some(point=>point.distanceTo(new THREE.Vector3().fromBufferAttribute(p,v))<1e-6));
  assert.ok(vertices.length>=20,'regression must include the complete actual cuff');
  for(const v of vertices)for(let k=0;k<4;k++)if(weights.getComponent(v,k)>1e-4)assert.equal(tee.skeleton.bones[indices.getComponent(v,k)].name,side+'Arm','the cuff should move with the upper arm');
  const sample=()=>{syncImportedAvatars(root);root.updateMatrixWorld(true);tee.skeleton.update();const inverse=arm.matrixWorld.clone().invert();return vertices.map(v=>tee.getVertexPosition(v,new THREE.Vector3()).applyMatrix4(tee.matrixWorld).applyMatrix4(inverse));};
  const rest=sample(),control=side==='Left'?rig.leftElbow:rig.rightElbow,wrist=side==='Left'?rig.leftWrist:rig.rightWrist;
  control.rotation.set(-1.2,.7,-.3);wrist.rotation.set(.5,-.8,.4);
  sample().forEach((point,i)=>assert.ok(point.distanceTo(rest[i])<1e-6,'elbow/wrist motion shredded the cuff'));
  control.rotation.set(0,0,0);wrist.rotation.set(0,0,0);
 }
});
test('male collar triangles stay within a cloth UV island',()=>{
 const {parts}=character(),mesh=parts['garment-tee'],p=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv'),index=mesh.geometry.index;let checked=0;
 for(let i=0;i<index.count;i+=3){
  const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
  if(!ids.every(v=>p.getY(v)>.305)||!ids.some(v=>Math.abs(p.getX(v))<.095&&p.getY(v)>.33))continue;
  for(const getter of ['getX','getY']){
   const values=ids.map(v=>uv[getter](v));
   assert.ok(Math.max(...values)-Math.min(...values)<.04,'collar UV triangle crosses unrelated skin/cloth atlas regions');
  }
  checked++;
 }
 assert.ok(checked>40,'regression must include the actual front and rear collar fabric');
});

test('male sneakers have closed sole and upper surfaces, including pale texture regions',()=>{
 const {parts}=character(),shoes=parts['garment-shoes'];
 assert.equal(shirtBoundaries(shoes).length,0,'sneakers contain open tears');
 const p=shoes.geometry.getAttribute('position'),indices=shoes.geometry.getAttribute('skinIndex'),weights=shoes.geometry.getAttribute('skinWeight');
 for(let v=0;v<p.count;v++){
  assert.equal(weights.getX(v),1,'the complete footwear must move rigidly with its ankle');
  assert.equal(shoes.skeleton.bones[indices.getX(v)].name,(p.getX(v)>0?'Left':'Right')+'Foot');
 }
});
test('hair dye includes the lower curls on both sides and the rear, without dyeing hands',()=>{
 const {parts}=character(),body=parts.body,p=body.geometry.getAttribute('position'),hair=body.geometry.getAttribute('_hair');
 assert.ok(hair,'complete generated hair needs a surface label');
 for(const side of [-1,1]){
  const lower=Array.from({length:p.count},(_,v)=>v).filter(v=>p.getY(v)>.47&&p.getY(v)<.60&&p.getX(v)*side>.15);
  assert.ok(lower.length>100,'sample the actual lower side curls');
  assert.ok(lower.filter(v=>hair.getX(v)>.5).length/lower.length>.9,'lower hair remains brown after dyeing');
 }
 let rear=0;
 for(let v=0;v<p.count;v++){
  if(p.getY(v)>.46&&p.getY(v)<.63&&p.getZ(v)<-.15){assert.ok(hair.getX(v)>.5,'rear curl was omitted');rear++;}
  if(p.getY(v)<.30)assert.equal(hair.getX(v),0,'hair color leaked onto arm/hand/body skin');
 }
 assert.ok(rear>100,'sample the actual rear curl surface');
 const bottom=Array.from({length:p.count},(_,v)=>v).filter(v=>p.getY(v)>.37&&p.getY(v)<.41&&p.getZ(v)<-.012&&Math.abs(p.getX(v))>.06);
 assert.ok(bottom.length>100,'sample the curls behind the neck, below the face');
 assert.ok(bottom.filter(v=>hair.getX(v)>.5).length/bottom.length>.95,'bottom rear hair remains undyed');
 // Recovered sneakers have a different atlas and must retain their artwork.
 assert.equal(parts['garment-shoes'].material.customProgramCacheKey(),'higgsfield-avatar-even-v2');
});
test('male elbow skin follows its arm joints through actual punch and dance clips',()=>{
 const {root,parts}=character(),body=parts.body,p=body.geometry.getAttribute('position'),si=body.geometry.getAttribute('skinIndex'),sw=body.geometry.getAttribute('skinWeight');
 const points=[];
 for(const side of ['Left','Right']){
  const arm=body.skeleton.bones.find(b=>b.name===side+'ForeArm');
  const inverse=body.skeleton.boneInverses[body.skeleton.bones.indexOf(arm)].clone().invert();
  const elbow=new THREE.Vector3().setFromMatrixPosition(inverse);
  let sampled=0;
  for(let v=0;v<p.count;v++){
   const point=new THREE.Vector3().fromBufferAttribute(p,v);
   if(point.distanceTo(elbow)>.045)continue;
   for(let k=0;k<4;k++)if(sw.getComponent(v,k)>.001)assert.ok([side+'Arm',side+'ForeArm'].includes(body.skeleton.bones[si.getComponent(v,k)].name),`elbow ${v} follows an unrelated bone`);
   points.push(v);sampled++;
  }
  assert.ok(sampled>50,'regression must sample both actual elbow surfaces');
 }
 const index=body.geometry.index,chosen=new Set(points),edges=[];
 for(let i=0;i<index.count;i+=3)for(let k=0;k<3;k++){
  const a=index.getX(i+k),b=index.getX(i+(k+1)%3);
  if(!chosen.has(a)||!chosen.has(b))continue;
  const length=new THREE.Vector3().fromBufferAttribute(p,a).distanceTo(new THREE.Vector3().fromBufferAttribute(p,b));
  if(length>.0005)edges.push([a,b,length]);
 }
 for(const move of ['punch','dance'])for(let f=0;f<=32;f++){
  root.userData.setImportedMove(move,f*MOVE_SECONDS[move]/32);syncImportedAvatars(root);root.updateMatrixWorld(true);body.skeleton.update();
  const posed=new Map(points.map(v=>[v,body.getVertexPosition(v,new THREE.Vector3())]));
  for(const [a,b,length] of edges)assert.ok(posed.get(a).distanceTo(posed.get(b))<length*2.2,`${move} frame ${f}: elbow surface tears into a spike`);
 }
});
