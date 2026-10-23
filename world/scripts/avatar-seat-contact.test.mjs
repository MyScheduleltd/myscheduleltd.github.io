import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const canvasContext=new Proxy({measureText:t=>({width:t.length*40})},{get:(o,k)=>k in o?o[k]:()=>{}});
globalThis.document={createElement:()=>({width:64,height:64,getContext:()=>canvasContext,addEventListener(){},removeEventListener(){},set src(v){}}),createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(v){}})};
globalThis.Image=class {addEventListener(){}removeEventListener(){}set src(v){}};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const v=new DataView(await blob.arrayBuffer());return{width:v.getUint32(16),height:v.getUint32(20),close(){}};};
const output=await build({stdin:{contents:"export {FestivalWorld} from './src/world/FestivalWorld';export * from './src/world/ImportedAvatar';export * from './src/world/CoastalAvatar';export * from './src/world/CoastalPose';export {batchStaticScenery} from './src/world/StaticBatch';export {SCREENING_SITES} from './src/world/CoastalVenues';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
const {THREE,FestivalWorld,createCoastalAvatar,loadImportedAvatar,attachImportedAvatar,seatCoastalLegs,supportCoastalPose,walkCoastalPose,syncImportedAvatars,batchStaticScenery,SCREENING_SITES}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const bytes=Object.fromEntries(await Promise.all(['male','female'].map(async key=>{const b=await readFile(`src/assets/avatars/${key}.glb`);return[key,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)];})));
await loadImportedAvatar(bytes);
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function character(sex='male',outfit='1'){
 const root=new THREE.Group(),top=(sex==='male'?['#18191b','#191a1c','#1a1b1d','#1b1c1e']:['#28191b','#291a1c','#2a1b1d','#2b1c1e'])[Number(outfit)-1];
 const palette={skin:'#dfb590',hair:'#3b3633',top,bottoms:'#44464a',swimwear:'#577467'};
 const rig=createCoastalAvatar(root,palette,true,new THREE.Group());attachImportedAvatar(root,rig,palette);return{root,rig};
}
function fixture(){
 const w=Object.create(FestivalWorld.prototype);
 Object.assign(w,{scene:new THREE.Scene(),colliders:[],seats:[],projectors:new Map(),venueSignMaterials:new Map(),clubLights:[],clubBeatLights:[],clubFloorPanels:[],paving:[],graphicsMode:'normal',dayNight:{addLampLight(){}},createProjectorSurface(){},venueSceneryAssets:{attach:async()=>{}}});
 w.createPalace();const shore=SCREENING_SITES.shore;w.buildOnGrade(()=>w.createShoreScreen(),shore.grade,shore.dx,shore.dz);
 const drive=SCREENING_SITES['drive-in'];w.buildOnGrade(()=>w.createDriveIn(),drive.grade,drive.dx,drive.dz);
 w.createRooftop();w.createClub();w.scene.updateMatrixWorld(true);
 return w;
}
// Independently read every actual visible pelvic/upper-thigh skin vertex.
// This does not call the support helper or its reduced cached probe list.
function visibleContact(root,pad){
 const points=[],p=new THREE.Vector3(),local=new THREE.Vector3();
 for(const mesh of root.userData.importedAvatar.meshes){
  const id=mesh.userData.componentId;if(!mesh.visible||!['body','garment-trousers'].includes(id))continue;
  const clothed=root.userData.importedAvatar.meshes.some(m=>m.visible&&m.userData.componentId==='garment-trousers');
  const hidden=mesh.geometry.getAttribute(clothed?'_covered':'_dressed');
  const pos=mesh.geometry.getAttribute('position'),ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');mesh.skeleton.update();
  for(let i=0;i<pos.count;i++){
   if(id==='body'&&(hidden?.getX(i)??0)>.5)continue;
   let weight=0;for(let k=0;k<4;k++)if(['Hips','LeftUpLeg','RightUpLeg'].includes(mesh.skeleton.bones[ids.getComponent(i,k)].name))weight+=weights.getComponent(i,k);
   if(weight<.7)continue;
   p.fromBufferAttribute(pos,i);mesh.applyBoneTransform(i,p);mesh.localToWorld(p);local.copy(p);root.worldToLocal(local);
   if(Math.abs(local.x)>.58||local.z<-.32||local.z>.62||p.x<pad.min.x||p.x>pad.max.x||p.z<pad.min.z||p.z>pad.max.z)continue;
   points.push(p.clone());
  }
 }
 assert.ok(points.length>12,'the real skin must have a support patch above this pad');
 return{bottom:Math.min(...points.map(p=>p.y)),points};
}

test('both rendered bodies and all outfits contact every real seat family before and after static batching',()=>{
 const w=fixture(),seats=['PALACE-1-1','SHORE-1-1','DRIVE-1-1','ROOFTOP-BENCH-1','CLUB-1-1'].map(id=>w.seats.find(s=>s.id===id));
 assert.ok(seats.every(Boolean));
 for(const batch of [false,true]){
  if(batch)assert.ok(batchStaticScenery(w.scene).batchedPieces>200);
  for(const sex of ['male','female'])for(const outfit of ['1','2','3','4']){
   const {root,rig}=character(sex,outfit);w.player=root;w.playerRig=rig;w.scene.add(root);
   for(const seat of seats){
    root.position.copy(w.seatAnchor(seat));root.rotation.y=seat.facing??Math.PI;const origin=root.position.clone();
    w.poseRigSeated(rig);syncImportedAvatars(root);root.updateMatrixWorld(true);
    const pad=new THREE.Box3().setFromObject(seat.cushion),at=visibleContact(root,pad),gap=at.bottom-pad.max.y;
    assert.ok(gap>=-.012&&gap<=.012,`${sex} outfit${outfit} ${seat.id} batch${batch} actual skin/cushion gap ${gap}`);
    near(root.position.distanceTo(origin),0);near(rig.leftLeg.rotation.x,-Math.PI/2);near(rig.rightLeg.rotation.x,-Math.PI/2);
    const soles=root.userData.importedSolePoints();for(const p of soles)assert.ok(p.y>=(seat.footFloor??w.footSurfaceAt(p.x,p.z,p.y))-.012,'a seated sole enters its physical floor');
   }
   root.removeFromParent();
  }
 }
});

test('the previous fixed-thigh offset reproduces the male floating support patch',()=>{
 const {root,rig}=character();root.position.set(0,.4+.23-1.1,0);root.rotation.y=Math.PI;
 const pad=new THREE.Box3(new THREE.Vector3(-.65,.22,-.7),new THREE.Vector3(.65,.4,.7));
 const support=root.userData.supportImportedSeat;root.userData.supportImportedSeat=undefined;
 seatCoastalLegs(rig,()=>-.28);syncImportedAvatars(root);
 const old=visibleContact(root,pad).bottom-pad.max.y;assert.ok(old>.08,'fixture must reproduce a visible unsupported gap before repair');
 root.userData.supportImportedSeat=support;seatCoastalLegs(rig,()=>-.28,pad);syncImportedAvatars(root);
 near(visibleContact(root,pad).bottom-pad.max.y,.004,.005);
});

test('seated contact is cached, keeps native bone lengths, and clears on returning to standing',()=>{
 for(const sex of ['male','female']){
  const {root,rig}=character(sex);root.position.set(0,.4+.23-1.1,0);
  const lengths=root.userData.importedAvatar.meshes[0].skeleton.bones.map(b=>b.position.clone());
  const pad=new THREE.Box3(new THREE.Vector3(-.65,.22,-.7),new THREE.Vector3(.65,.4,.7));
  seatCoastalLegs(rig,()=>0,pad);const offset=rig.visualRoot.position.y,knee=rig.leftKnee.rotation.x;
  let syncs=0;const original=root.userData.syncImportedAvatar;root.userData.syncImportedAvatar=()=>{syncs++;original();};
  for(let frame=0;frame<60;frame++){rig.visualRoot.position.y=0;seatCoastalLegs(rig,()=>0,pad);near(rig.visualRoot.position.y,offset);near(rig.leftKnee.rotation.x,knee);}
  const worldY=root.position.y+offset;
  for(const dy of [.03,.1,-.04]){root.position.y+=dy;seatCoastalLegs(rig,()=>0,pad);near(root.position.y+rig.visualRoot.position.y,worldY);}
  assert.equal(syncs,0,'unchanged seats must reuse the supported pose, with no repeated skin solve');root.userData.syncImportedAvatar=original;
  root.userData.importedAvatar.meshes[0].skeleton.bones.forEach((bone,i)=>near(bone.position.distanceTo(lengths[i]),0));
  root.position.y=.28;walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);
  near(Math.min(...root.userData.importedSolePoints().map(p=>p.y)),0,.006);
 }
});

test('remote seated tracked legs cannot replace cushion support while tracked head and chest still apply',()=>{
 const w=fixture(),seat=w.seats.find(s=>s.id==='SHORE-1-1'),{root,rig}=character();
 w.player=root;w.playerRig=rig;root.position.copy(w.seatAnchor(seat));root.rotation.y=Math.PI;
 w.poseRigSeated(rig);const lift=rig.visualRoot.position.y,hip=rig.leftLeg.rotation.x;
 const avatar={group:root,rig,state:'seated'};w.applyLimbs(avatar,{g:[0,0,0,0,0,0],h:[.2,.1],t:[.08,.12]});
 near(rig.visualRoot.position.y,lift);near(rig.leftLeg.rotation.x,hip);near(rig.head.rotation.y,.2);near(rig.torso.rotation.x,.08);
 const pad=new THREE.Box3().setFromObject(seat.cushion);syncImportedAvatars(root);near(visibleContact(root,pad).bottom-pad.max.y,.004,.005);
});

test('taking a seat immediately ends a held native dance clip before measuring contact',()=>{
 const {root,rig}=character();root.position.y=.4+.23-1.1;
 const pad=new THREE.Box3(new THREE.Vector3(-.65,.22,-.7),new THREE.Vector3(.65,.4,.7));
 root.userData.setImportedMove('dance',.47);assert.equal(root.userData.importedMoveActive(),'dance');
 seatCoastalLegs(rig,()=>0,pad);syncImportedAvatars(root);
 assert.equal(root.userData.importedMoveActive(),null);near(visibleContact(root,pad).bottom-pad.max.y,.004,.005);
});

test('the actual remote-controlled resident updater uses each seat height, including roof and basement seats',()=>{
 const w=fixture(),player=character();w.player=player.root;w.playerRig=player.rig;
 Object.assign(w,{sharedNpcRoutes:new Map(),remoteNpcControls:new Map(),npcControlTarget:new THREE.Vector3(),locomotion:new WeakMap(),reviewLastDelta:1/60,clock:{elapsedTime:1},clubBeat:{bpm:120}});
 for(const sex of ['male','female'])for(const id of ['PALACE-1-1','SHORE-1-1','DRIVE-1-1','ROOFTOP-BENCH-1','CLUB-1-1']){
  const seat=w.seats.find(s=>s.id===id),anchor=w.seatAnchor(seat),{root,rig}=character(sex);root.position.set(anchor.x,.28,anchor.z);root.rotation.y=Math.PI;
  const npc={id:'KENNY',group:root,rig,badge:new THREE.Group(),remoteCarriedProp:new THREE.Group(),gestureUntil:0};w.npcs=[npc];
  w.remoteNpcControls.set('KENNY',{x:anchor.x,y:.28,z:anchor.z,rotation:Math.PI,state:'seated',moving:false});
  w.updateNpcs(1/60,0);near(root.position.y,anchor.y,.00002);
  for(let i=1;i<8;i++)w.updateNpcs(1/60,i/60);
  near(root.position.y,anchor.y,.00002);syncImportedAvatars(root);
  const pad=new THREE.Box3().setFromObject(seat.cushion);near(visibleContact(root,pad).bottom-pad.max.y,.004,.006);
 }
 const npc=w.npcs[0];w.remoteNpcControls.set('KENNY',{x:100,y:4.2,z:100,rotation:0,state:'seated',moving:false});
 w.updateNpcs(2,3);near(w.npcControlTarget.y,4.2);
});
