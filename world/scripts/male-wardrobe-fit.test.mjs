import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=new DataView(await blob.arrayBuffer());return {width:b.getUint32(16),height:b.getUint32(20),close(){}};};
globalThis.document={createElement:()=>({width:64,height:64,getContext:()=>({fillRect(){}})})};
const output=await build({stdin:{contents:"export * from './src/world/ImportedAvatar'; export * from './src/world/CoastalAvatar'; export * from './src/world/CoastalPose'; export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
const {THREE,MOVE_SECONDS,loadImportedAvatar,attachImportedAvatar,syncImportedAvatars,createCoastalAvatar,walkCoastalPose,skateCoastalPose,waveCoastalPose,supportCoastalPose,setCoastalSwimwear}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
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
test('waving does not lift the male chest and side ribs with the upper arm',()=>{
 const {root,rig,parts}=character(),body=parts.body,p=body.geometry.getAttribute('position');
 const vertices=Array.from({length:p.count},(_,v)=>v).filter(v=>{
  const x=Math.abs(p.getX(v)),y=p.getY(v);
  // Central chest and the side ribs below the armpit are torso, not deltoid.
  return y>.055&&y<.27&&(x<.12||(y<.125&&x<.145));
 });
 assert.ok(vertices.length>300,`exercise the actual front, back and side torso surface (${vertices.length} vertices)`);
 const sample=()=>{
  syncImportedAvatars(root);root.updateMatrixWorld(true);body.skeleton.update();
  const inverse=body.skeleton.bones.find(b=>b.name==='Spine01').matrixWorld.clone().invert();
  return vertices.map(v=>body.getVertexPosition(v,new THREE.Vector3()).applyMatrix4(body.matrixWorld).applyMatrix4(inverse));
 };
 const rest=sample();
 for(const progress of [.1,.25,.32,.5,.68,.8,.95]){
  walkCoastalPose(rig,0,0);waveCoastalPose(rig,progress*8,progress);
  const points=sample(),movement=Math.max(...points.map((point,i)=>point.distanceTo(rest[i])));
  assert.ok(movement<.004,`wave ${progress}: chest/ribs moved ${movement.toFixed(3)} in torso space toward the waving arm`);
 }
});
test('male shoulder UV and normal splits stay welded through the wave and action clips',()=>{
 const {root,rig,parts}=character(),body=parts.body,p=body.geometry.getAttribute('position');
 const selected=new Set(Array.from({length:p.count},(_,v)=>v).filter(v=>
  Math.abs(p.getX(v))>.09&&Math.abs(p.getX(v))<.225&&p.getY(v)>.17&&p.getY(v)<.325&&
  body.geometry.getAttribute('_skin').getX(v)>.5&&body.geometry.getAttribute('_hair').getX(v)<.5));
 const groups=new Map();
 for(const v of selected){
  const key=new THREE.Vector3().fromBufferAttribute(p,v).toArray().map(x=>Math.round(x*1e6)).join(',');
  const ids=groups.get(key)??[];ids.push(v);groups.set(key,ids);
 }
 const seams=[...groups.values()].filter(ids=>ids.length>1);
 assert.ok(seams.length>200,'exercise authored UV/normal splits across both shoulder surfaces');
 const check=label=>{
  syncImportedAvatars(root);root.updateMatrixWorld(true);body.skeleton.update();
  const posed=new Map([...selected].map(v=>[v,body.getVertexPosition(v,new THREE.Vector3())]));
  for(const ids of seams)for(const v of ids.slice(1))
   assert.ok(posed.get(v).distanceTo(posed.get(ids[0]))<.00001,`${label}: shoulder seam opens between ${ids[0]} and ${v}`);
 };
 for(let frame=0;frame<=24;frame++){
  walkCoastalPose(rig,0,0);waveCoastalPose(rig,frame/3,frame/24);check(`wave ${frame}`);
 }
 for(const move of ['punch','dance'])for(let frame=0;frame<=32;frame++){
  root.userData.setImportedMove(move,frame*MOVE_SECONDS[move]/32);check(`${move} ${frame}`);
 }
});
test('the lower waist cannot acquire a side bulge from the waving arm',()=>{
 const {root,rig,parts}=character(),body=parts.body,p=body.geometry.getAttribute('position');
 // Include the hip transition below the earlier chest/rib check. Its small
 // residual arm weights raised the side of the stomach during a wave.
 const ids=Array.from({length:p.count},(_,v)=>v).filter(v=>Math.abs(p.getX(v))<.16&&p.getY(v)>-.035&&p.getY(v)<.06);
 assert.ok(ids.length>100,'exercise both low-waist side surfaces');
 const sample=()=>{syncImportedAvatars(root);root.updateMatrixWorld(true);body.skeleton.update();return ids.map(v=>body.getVertexPosition(v,new THREE.Vector3()));};
 const rest=sample();
 for(const phase of [.1,.25,.5,.75,.95]){
  walkCoastalPose(rig,0,0);waveCoastalPose(rig,phase*8,phase);const wave=sample();
  const movement=Math.max(...wave.map((point,i)=>point.distanceTo(rest[i])));
  assert.ok(movement<.00001,`wave ${phase}: low waist moved ${movement} with the hand`);
 }
});
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

test('saved male swimwear colours dye the shorts while retaining the white stripe texture and its mask',()=>{
 for(const colour of ['#ff00ff','#ffff00','#ffffff','#000000']){
  const root=new THREE.Group(),palette={skin:'#fbc4a0',hair:'#55413b',top:'#18191b',bottoms:'#5b5a4d',swimwear:colour};
  const rig=createCoastalAvatar(root,palette,true,new THREE.Group());attachImportedAvatar(root,rig,palette);setCoastalSwimwear(root,true);
  const body=root.userData.importedAvatar.meshes.find(m=>m.userData.componentId==='body');
  const shader={uniforms:{},vertexShader:'#include <skinning_vertex>',fragmentShader:'#include <map_fragment>'};
  body.material.onBeforeCompile(shader,{});
  assert.equal(shader.uniforms.avatarDyeOn.value.z,1,'chosen male swimsuit colour must reach the cloth mask');
  assert.equal(shader.uniforms.avatarGarment.value.getHexString(),colour.slice(1));
  assert.ok(body.material.map,'keep the original texture with its white side stripes');
 }
});

test('native swim-short cloth and white stripes stay outside skin cleanup through both leg hems',async()=>{
 const reference=JSON.parse(await readFile('scripts/fixtures/male-swimwear-surface.json','utf8'));
 const {parts}=character(),body=parts.body,position=body.geometry.getAttribute('position'),skin=body.geometry.getAttribute('_skin');
 const key=p=>p.map(x=>Math.round(x*1e6)).join(','),labels=new Map();
 for(let v=0;v<position.count;v++){
  const k=key([position.getX(v),position.getY(v),position.getZ(v)]);
  labels.set(k,Math.max(labels.get(k)??0,skin.getX(v)));
 }
 assert.ok(reference.samples.some(s=>s.stripe),'acceptance samples need the white side stripes');
 for(const side of [-1,1])assert.ok(reference.samples.some(s=>s.point[0]*side>.08&&s.point[2]<-.33),'acceptance samples need both original leg hems');
 for(const sample of reference.samples)for(const [x,y,z] of sample.vertices){
  const label=labels.get(key([x,z,-y]));
  assert.notEqual(label,undefined,'native fabric sample missing from the export');
  assert.equal(label,0,`skin cleanup spills onto native shorts at ${x},${y},${z}`);
 }
 // Skin below the fabric must still follow the selected skin colour.
 let lowerLeg=0;
 for(let v=0;v<position.count;v++)if(position.getY(v)<-.38&&position.getY(v)>-.60&&Math.abs(position.getX(v))<.20){
  assert.equal(skin.getX(v),1,'shorts ownership extended onto bare legs');lowerLeg++;
 }
 assert.ok(lowerLeg>100,'bare-leg guard must exercise real skin');
});

test('male dance palms and fingers follow the source FBX hand frame and the wrists articulate',async()=>{
 const reference=JSON.parse(await readFile('scripts/fixtures/dance-hand-reference.json','utf8'));
 const {root}=character(),bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 const rotations={Left:[],Right:[]};
 for(const sample of reference.samples){
  root.userData.setImportedMove('dance',sample.seconds);syncImportedAvatars(root);root.updateMatrixWorld(true);
  for(const side of ['Left','Right']){
   const actual=root.userData.importedHandFrame(side==='Left');
   for(const axis of ['palm','fingers']){
    const expected=new THREE.Vector3().fromArray(sample.hands[side][axis]);
    assert.ok(actual[axis].dot(expected)>.9999,`${side} ${axis} direction differs from source at ${sample.seconds}s`);
   }
   rotations[side].push(bones.get(side+'Hand').quaternion.clone());
  }
 }
 for(const side of ['Left','Right']){
  const range=Math.max(...rotations[side].map(q=>q.angleTo(rotations[side][0])));
  assert.ok(range>.5,`${side} wrist is frozen relative to the forearm`);
 }
 for(const seconds of [7.8,9.1])for(const side of ['Left','Right']){
  root.userData.setImportedMove('dance',seconds);syncImportedAvatars(root);
  assert.ok(root.userData.importedHandFrame(side==='Left').palm.y<-.85,`${side} floor-support palm faces away from the floor`);
 }
});

test('male dance wrist skin retains volume across the source routine',async()=>{
 const {root,rig,parts}=character(),body=parts.body,position=body.geometry.getAttribute('position'),vertices={};
 for(const side of ['Left','Right']){
  const index=name=>body.skeleton.bones.findIndex(b=>b.name===side+name);
  const joint=name=>new THREE.Vector3().setFromMatrixPosition(body.skeleton.boneInverses[index(name)].clone().invert());
  const wrist=joint('Hand'),axis=wrist.clone().sub(joint('ForeArm')).normalize();
  vertices[side]=Array.from({length:position.count},(_,v)=>v).filter(v=>{
   const delta=new THREE.Vector3().fromBufferAttribute(position,v).sub(wrist);
   return Math.abs(delta.dot(axis))<.010&&delta.length()<.05;
  });
  assert.ok(vertices[side].length>100);
 }
 const radius=side=>{
  const frame=root.userData.importedHandFrame(side==='Left');body.skeleton.update();
  const axis=frame.forearm.clone().applyQuaternion(rig.visualRoot.getWorldQuaternion(new THREE.Quaternion()));
  const points=vertices[side].map(v=>body.getVertexPosition(v,new THREE.Vector3()).applyMatrix4(body.matrixWorld));
  const centre=points.reduce((a,b)=>a.add(b),new THREE.Vector3()).divideScalar(points.length);
  return Math.sqrt(points.reduce((sum,p)=>{
   const delta=p.clone().sub(centre);delta.addScaledVector(axis,-delta.dot(axis));return sum+delta.lengthSq();
  },0)/points.length);
 };
 const rest=Object.fromEntries(['Left','Right'].map(side=>[side,radius(side)]));
 for(let frame=0;frame<254;frame+=3){
  root.userData.setImportedMove('dance',frame/24);syncImportedAvatars(root);root.updateMatrixWorld(true);
  for(const side of ['Left','Right'])assert.ok(radius(side)/rest[side]>.72,`${side} wrist skin collapses at source frame ${frame+1}`);
 }
});

test('shirt graphics stay flush with their cloth through skating, punching and dancing',()=>{
 const {root,rig,parts}=character(),tee=parts['garment-tee'];
 const clothPosition=tee.geometry.getAttribute('position');
 const clothPoints=Array.from({length:clothPosition.count},(_,v)=>new THREE.Vector3().fromBufferAttribute(clothPosition,v));
 const correspondences=[];
 for(const id of ['print-schedule-back','print-bros-back','print-vest-back','print-schedule-front','print-house-front','print-schedule-tag']){
  const print=parts[id],position=print.geometry.getAttribute('position');
  assert.equal(print.userData.print_surface,'garment-tee',`${id}: no cloth attachment`);
  for(let v=0;v<position.count;v++){
   const point=new THREE.Vector3().fromBufferAttribute(position,v);let closest=-1,distance=Infinity;
   clothPoints.forEach((p,i)=>{const d=point.distanceToSquared(p);if(d<distance){closest=i;distance=d;}});
   assert.ok(Math.sqrt(distance)<.00025,`${id}: print floats away from its authored cloth vertex`);
   correspondences.push({print,vertex:v,clothVertex:closest});
  }
 }
 const check=label=>{
  syncImportedAvatars(root);root.updateMatrixWorld(true);tee.skeleton.update();
  for(const {print,vertex,clothVertex} of correspondences){
   print.skeleton.update();
   const ink=print.getVertexPosition(vertex,new THREE.Vector3()).applyMatrix4(print.matrixWorld);
   const cloth=tee.getVertexPosition(clothVertex,new THREE.Vector3()).applyMatrix4(tee.matrixWorld);
   assert.ok(ink.distanceTo(cloth)<.0015,`${label}: ${print.userData.componentId} separates from the shirt`);
  }
 };
 for(const phase of [0,.8,1.8,3]){skateCoastalPose(rig,phase);check(`skate ${phase}`);}
 for(const move of ['punch','dance'])for(let frame=0;frame<=16;frame++){
  root.userData.setImportedMove(move,frame*MOVE_SECONDS[move]/16);check(`${move} ${frame}`);
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

test('lower male neck skin stays with the crew collar instead of following the shoulders or head',()=>{
 const {parts}=character(),mesh=parts.body,p=mesh.geometry.getAttribute('position');
 const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');let checked=0;
 for(let v=0;v<p.count;v++){
  if(p.getY(v)<=.325||p.getY(v)>=.354||Math.abs(p.getX(v)-.008)>=.06||Math.abs(p.getZ(v)-.024)>=.04)continue;
  for(let k=0;k<4;k++)if(weights.getComponent(v,k)>1e-6){
   const bone=mesh.skeleton.bones[indices.getComponent(v,k)].name;
   assert.equal(bone,'Spine',`lower neck skin ${v} is pulled by ${bone}`);
  }
  checked++;
 }
 assert.ok(checked>100,'sample the generated neck surface around the collar');
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
 const shoes=parts['garment-shoes'],shoeMaterial=shoes.material,shoeMap=shoeMaterial.map;
 assert.ok(shoes.userData.footwear_source,'exercise the recovered footwear with its separate source atlas');
 assert.ok(shoeMap);assert.notEqual(shoeMap,body.material.map,'footwear must not inherit the body dye atlas');
 assert.match(shoeMaterial.customProgramCacheKey(),/^higgsfield-avatar-dye-v15-shoes-/);
 const shoeShader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 shoeMaterial.onBeforeCompile(shoeShader,{});
 assert.ok(shoeShader.uniforms.avatarEven,'keep the shared scene-lit avatar bands');
 assert.equal(shoeShader.uniforms.avatarDyeOn.value.x,0);assert.equal(shoeShader.uniforms.avatarDyeOn.value.y,0);
 assert.equal(shoeShader.uniforms.avatarDyeOn.value.z,0,'absent shoe dye retains the recovered sneaker artwork');
 assert.ok(shoeShader.fragmentShader.includes('dyeMask=vec3(0.,0.,1.-smoothstep(.24,.52,garmentLuma))'),'only the component-owned upper mask may dye the shoes');
 assert.ok(shoeShader.uniforms.worldFilmFrame,'the added film finish must still reach footwear');
 assert.equal(shoeMaterial.map,shoeMap,'shader composition cannot replace the authored sneaker artwork');
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
