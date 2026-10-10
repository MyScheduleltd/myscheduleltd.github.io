import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// The geometry tests need a canvas handle, not a renderer or a fabricated image.
// Geometry-only tests retain PNG dimensions for the embedded cap texture.
// Pixel appearance is checked in the browser, not by this decoder stub.
globalThis.self=globalThis;
globalThis.createImageBitmap=async(blob)=>{const bytes=await blob.arrayBuffer();const view=new DataView(bytes);return {width:view.getUint32(16),height:view.getUint32(20),close(){}};};
globalThis.document = {createElement:()=>({width:64,height:64,getContext:()=>({fillRect(){}})})};
const output=await build({stdin:{contents:"export {applyWornStyle} from './src/world/WornStyle'; export * from './src/world/MentorDog'; export * from './src/world/HandPose'; export * from './src/world/RooftopBand'; export { HeadTracking } from './src/world/HeadTracking'; export { FestivalWorld } from './src/world/FestivalWorld'; export * from './src/world/CoastalAvatar'; export * from './src/world/CoastalPose'; export * from './src/world/CoastalCarry'; export * from './src/world/ImportedAvatar'; export * from './src/world/CoastalSkateboard'; export * from './src/world/CoastalGeometry'; export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
const {HeadTracking,RooftopBand,BAND_MEMBERS,FIST,FINGER_NAMES,handJointsFromLandmarks,handPoseFromJoints,MENTOR_NESTLE,applyWornStyle,waveCoastalPose,fallCoastalPose,landCoastalPose,djCoastalPose,hitCoastalPose,perchMentor,stepMentorGait,createMentorDog,poseCoastalCarry,loadImportedAvatar,attachImportedAvatar,syncImportedAvatars,COASTAL_CUP_OFFSET,COASTAL_STRAW_TIP,FestivalWorld,jumpCoastalArms,setCoastalSwimwear,punchCoastalPose,setCoastalFists,createCoastalSedan,CONVERTIBLE,walkCoastalPose,danceCoastalPose,COASTAL_STRIDE_LENGTH,THREE,createCoastalAvatar,supportCoastalPose,seatCoastalLegs,coastalFootHeights,skateCoastalPose,createCoastalSkateboard}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
function character(){
  const root=new THREE.Group();root.position.y=.28;
  const rig=createCoastalAvatar(root,{skin:'#dfb590',hair:'#3b3633',top:'#d0cbc1',bottoms:'#44464a',swimwear:'#577467'},true,new THREE.Group());
  return {root,rig};
}

test('the actual avatar keeps a supporting sole on the floor throughout its walk cycle',()=>{
  const {root,rig}=character();
  for(let i=0;i<=48;i++){
    walkCoastalPose(rig,i/48*Math.PI*2);
    supportCoastalPose(rig,()=>0);
    const feet=coastalFootHeights(rig);
    assert.ok(Math.abs(Math.min(...feet))<.00001,`unsupported phase ${i}: ${feet}`);
    assert.ok(feet.every(y=>y>-.00001));
    assert.equal(root.position.y,.28,'visual foot support must not move network/collision origin');
  }
});

test('ankles align with a sloping surface at different world headings',()=>{
  const {root,rig}=character();
  const floor=(x,z)=>.04*x+.035*z;
  const expected=new THREE.Vector3(-.04,1,-.035).normalize();
  for(const heading of [0,.9,2.2]){
    root.rotation.y=heading;supportCoastalPose(rig,floor);
    for(const ankle of [rig.leftAnkle,rig.rightAnkle]){
      const actual=new THREE.Vector3(0,1,0).applyQuaternion(ankle.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(actual.dot(expected)>.99999,'sole normal should follow terrain');
    }
  }
});

test('seated knees reach a low floor and hang from a tall stool without lengthening the limbs',()=>{
  const {root,rig}=character();
  for(const pad of [.4,1.2]){
    root.position.y=pad+.23-1.1;seatCoastalLegs(rig,()=>0);
    const feet=coastalFootHeights(rig);
    if(pad===.4)assert.ok(feet.every(y=>Math.abs(y)<.0001));
    else assert.ok(feet.every(y=>y>.5&&y<.8),'a tall stool should leave the feet hanging');
    for(const [hip,knee,ankle] of [[rig.leftLeg,rig.leftKnee,rig.leftAnkle],[rig.rightLeg,rig.rightKnee,rig.rightAnkle]]){
      assert.ok(knee.rotation.x>=0&&knee.rotation.x<=1.5);
      assert.ok(Math.abs(hip.getWorldPosition(new THREE.Vector3()).distanceTo(knee.getWorldPosition(new THREE.Vector3()))-.66)<.00001);
      assert.ok(Math.abs(knee.getWorldPosition(new THREE.Vector3()).distanceTo(ankle.getWorldPosition(new THREE.Vector3()))-.52)<.00001);
    }
  }
});


test('skate stance keeps both soles on the real deck and wheels on the ground',()=>{
  const {root,rig}=character();root.position.y=.46;
  root.remove(rig.board);rig.board=createCoastalSkateboard(root);
  for(let i=0;i<24;i++){
    skateCoastalPose(rig,i/24*Math.PI*2);
    const feet=coastalFootHeights(rig);
    assert.ok(feet.every(y=>Math.abs(y-(.46-.113))<.00001));
    assert.ok(Math.abs(new THREE.Box3().setFromObject(rig.board).min.y)<.00001);
    for(const knee of [rig.leftKnee,rig.rightKnee])assert.equal(knee.rotation.y,0,'knee hinge must not twist sideways');
  }
});


test('the skateboard standing surface and underside are solid at their declared heights',()=>{
  const root=new THREE.Group(),board=createCoastalSkateboard(root);board.visible=true;
  board.rotation.y=0;root.updateMatrixWorld(true);
  for(const x of [-.55,0,.55])for(const z of [-.20,0,.20]){
    const down=new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0));
    const top=down.intersectObject(board,true)[0];
    assert.ok(top&&Math.abs(top.point.y+.113)<1e-6,'grip must meet the skating foot support plane');
    const up=new THREE.Raycaster(new THREE.Vector3(x,-1,z),new THREE.Vector3(0,1,0));
    const bottom=up.intersectObject(board,true)[0];
    assert.ok(bottom&&bottom.face.normal.y<0,'underside must have an outward-facing surface');
  }
});

test('stance foot remains planted as the actual body advances through a stride',()=>{
  const {root,rig}=character();let planted;
  for(let i=0;i<=26;i++){
    const t=i/48;root.position.z=t*COASTAL_STRIDE_LENGTH;
    walkCoastalPose(rig,t*Math.PI*2);supportCoastalPose(rig,()=>0);
    const foot=rig.leftAnkle.getWorldPosition(new THREE.Vector3());
    planted??=foot.z;
    assert.ok(Math.abs(foot.z-planted)<.00001,`stance slip at ${t}: ${foot.z-planted}`);
  }
});

test('dance preserves both sole contacts and stable foot positions across the beat',()=>{
  const {rig}=character();let positions;
  for(let i=0;i<48;i++){
    danceCoastalPose(rig,i/48*Math.PI*4);supportCoastalPose(rig,()=>0);
    assert.ok(coastalFootHeights(rig).every(y=>Math.abs(y)<.00001));
    const current=[rig.leftAnkle,rig.rightAnkle].map(a=>a.getWorldPosition(new THREE.Vector3()));
    positions??=current;
    current.forEach((p,n)=>assert.ok(Math.hypot(p.x-positions[n].x,p.z-positions[n].z)<.00001));
  }
});


test('convertible cushion and footwell fit the articulated occupant inside an open cabin',()=>{
  const {root,rig}=character(),car=createCoastalSedan(0x8f1720);car.position.y=.1;
  const pad=new THREE.Box3().setFromObject(car.userData.cushion);
  root.position.set(CONVERTIBLE.seatX,pad.max.y+.23-1.1,CONVERTIBLE.seatZ-.3);root.rotation.y=Math.PI;
  seatCoastalLegs(rig,()=>CONVERTIBLE.footFloor+.1);
  assert.ok(coastalFootHeights(rig).every(y=>Math.abs(y-(CONVERTIBLE.footFloor+.1))<.0001));
  const head=rig.head.getWorldPosition(new THREE.Vector3());
  assert.ok(head.y>2.1,'eyes and head clear the low windshield');
  const ray=new THREE.Raycaster(new THREE.Vector3(CONVERTIBLE.seatX,4,CONVERTIBLE.seatZ),new THREE.Vector3(0,-1,0));
  const hits=ray.intersectObject(car,true);
  assert.ok(hits.length>0);
  assert.ok(hits[0].point.y<1,'no roof or solid cabin above the seat cushion');
});


test('the punch extends at contact and retracts while keeping both soles planted',()=>{
  const {rig}=character();const reach=[];
  for(const t of [0,.18,.357,.65,1]){
    punchCoastalPose(rig,t);supportCoastalPose(rig,()=>0);
    reach.push(rig.rightWrist.getWorldPosition(new THREE.Vector3()).z);
    assert.ok(coastalFootHeights(rig).every(y=>Math.abs(y)<.00001));
    assert.ok(rig.rightElbow.rotation.x<=0&&rig.rightElbow.rotation.x>=-1.41);
  }
  assert.ok(reach[2]>reach[0]+.25,'contact must reach forward, not hold a static guard');
  assert.ok(Math.abs(reach[4]-reach[0])<.00001,'hand returns to guard');
  setCoastalFists(rig,false);
  const parts=rig.visualRoot.parent.userData.sculptRuntime.parts;
  assert.ok(parts['hand-r'].every(p=>p.visible));assert.ok(parts['fist-r'].every(p=>!p.visible));
});

test('swimwear replaces streetwear geometry and restores original visibility',()=>{
  const {root,rig}=character();
  const original=root.userData.festivalGarments.map(({mesh})=>mesh.visible);
  setCoastalSwimwear(root,true);
  assert.ok(root.userData.swimMeshes.length>=12);
  assert.ok(root.userData.festivalGarments.every(({mesh})=>!mesh.visible));
  assert.ok(root.userData.swimMeshes.every(mesh=>mesh.visible));
  walkCoastalPose(rig,.8);supportCoastalPose(rig,()=>0);
  assert.ok(Math.abs(Math.min(...coastalFootHeights(rig)))<.00001);
  setCoastalSwimwear(root,false);
  assert.deepEqual(root.userData.festivalGarments.map(({mesh})=>mesh.visible),original);
  assert.ok(root.userData.swimMeshes.every(mesh=>!mesh.visible));
});


test('jump hands clear the complete head and hair through every lift and skate yaw',()=>{
  const {root,rig}=character();
  for(const skating of [false,true])for(let i=0;i<=20;i++) {
    walkCoastalPose(rig,0,0);if(skating)skateCoastalPose(rig,i*.3);
    jumpCoastalArms(rig,-1+i/10);root.updateMatrixWorld(true);
    const head=new THREE.Box3().setFromObject(rig.head).expandByScalar(.04);
    for(const wrist of [rig.leftWrist,rig.rightWrist]) {
      const hand=new THREE.Box3().setFromObject(wrist);
      assert.equal(head.intersectsBox(hand),false,`hand/head overlap at lift ${i}, skating ${skating}`);
    }
  }
});

test('rear hair covers the scalp continuously below the crown',()=>{
  const {root,rig}=character();root.updateMatrixWorld(true);
  for(const x of [-.2,0,.2])for(const y of [.58,.62,.64,.66,.68]) {
    const origin=rig.head.localToWorld(new THREE.Vector3(x,y,-2));
    const hits=new THREE.Raycaster(origin,new THREE.Vector3(0,0,1)).intersectObject(rig.head,true).filter(hit=>{let node=hit.object;while(node){if(!node.visible)return false;node=node.parent;}return true;});
    assert.ok(hits.length,'rear head ray must hit');
    assert.ok(hits[0].object.name.includes('hair'),'rear scalp must be covered by hair at '+y);
  }
});


test('full shoe soles stay above discrete stair treads at both headings and every walk phase',()=>{
  const {root,rig}=character();
  const tread=z=>Math.max(0,Math.ceil(z/.56))*(3.5/9);
  const floor=(x,z)=>tread(z);
  for(const heading of [0,Math.PI])for(let frame=0;frame<72;frame++){
    root.position.set(0,frame/72*3+.28,frame/72*4.32);root.rotation.y=heading;
    // Collision origin follows a smooth pitch; foot contact uses discrete geometry.
    root.position.y=root.position.z/.56*(3.5/9)+.28;
    walkCoastalPose(rig,frame/72*Math.PI*6);supportCoastalPose(rig,floor);root.updateMatrixWorld(true);
    for(const ankle of [rig.leftAnkle,rig.rightAnkle])for(const x of [-.26,0,.26])for(const z of [-.235,.1,.435]){
      const point=ankle.localToWorld(new THREE.Vector3(x,-.2,z));
      assert.ok(point.y>=floor(point.x,point.z)-.00001,`shoe penetrates tread at frame ${frame}, heading ${heading}: ${point.y-floor(point.x,point.z)}`);
    }
  }
});


function carryingWorld() {
  const {root,rig}=character();
  const world=Object.create(FestivalWorld.prototype);
  Object.assign(world,{player:root,playerRig:rig,npcs:[],seats:[],carriedProp:new THREE.Group(),carriedItem:'DRINK',playerState:'walking',drinkUntil:0,drinks:0,locomotion:new WeakMap(),reviewLastDelta:1/60});
  root.add(world.carriedProp);
  world.activeCarrierGroup=()=>root;
  world.footSurfaceAt=()=>0;world.groundHeightAt=()=>.28;
  world.onAction=()=>{};
  world.syncCarriedPropAnchor();
  return {world,root,rig};
}

test('consuming a drink retains its visible cup through the sip and removes it afterward',()=>{
  const {world}=carryingWorld();
  world.drinkInHand();
  assert.equal(world.carriedItem,undefined,'inventory is consumed immediately');
  assert.equal(world.drinks,1);
  assert.equal(world.carriedProp.visible,true,'the sip must not animate an empty hand');
  assert.equal(world.carriedPropKind,'DRINK');
  world.drinkUntil=0;
  world.syncCarriedPropAnchor();
  assert.equal(world.carriedProp.visible,false,'the consumed cup disappears after the sip');
});

test('sitting preserves the drinking arm and keeps the cup on its wrist socket',()=>{
  const {world,root,rig}=carryingWorld();
  world.animateRig(rig,0,0,'drink');
  const rotations=[rig.rightArm,rig.rightElbow,rig.rightWrist].map(j=>j.quaternion.clone());
  root.position.y=-.47;
  world.poseRigSeated(rig,'drink');
  [rig.rightArm,rig.rightElbow,rig.rightWrist].forEach((j,i)=>assert.ok(1-Math.abs(j.quaternion.dot(rotations[i]))<1e-10));
  root.updateWorldMatrix(true,true);
  const grip=rig.visualRoot.localToWorld(rig.visualRoot.worldToLocal(rig.rightWrist.getWorldPosition(new THREE.Vector3())).add(COASTAL_CUP_OFFSET));
  assert.ok(grip.distanceTo(world.carriedProp.getWorldPosition(new THREE.Vector3()))<1e-10);
  assert.equal(world.carriedProp.userData.carryHand,'right');
});


test('sip raises the straw to the actual mouth and returns the cup, with palms outside the cup',()=>{
  const {world,root,rig}=carryingWorld();const heights=[];
  for(const t of [0,.15,.35,.5,.7,.85,1]) {
    world.animateRig(rig,0,0,'drink',false,t);root.updateWorldMatrix(true,true);
    const tip=world.carriedProp.localToWorld(COASTAL_STRAW_TIP.clone());
    const mouth=rig.head.localToWorld(new THREE.Vector3(0,.299,.302));
    heights.push(tip.y);
    if(t>=.35&&t<=.7)assert.ok(tip.distanceTo(mouth)<.005,`straw misses mouth at ${t}: ${tip.distanceTo(mouth)}`);
    const palm=rig.visualRoot.getObjectByName('hand-r');
    const positions=palm.geometry.getAttribute('position');
    for(let n=0;n<positions.count;n++) {
      const v=world.carriedProp.worldToLocal(palm.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,n)));
      assert.ok(v.y<-.275||v.y>.275||Math.hypot(v.x,v.z)>(.145+(v.y+.275)*.1)+.002,`palm inside cup at ${t}: ${v.toArray()}`);
    }
  }
  assert.ok(heights[3]>heights[0]+.3);assert.ok(Math.abs(heights.at(-1)-heights[0])<.005);
});

test('popcorn eating retains the left carton while the right hand carries a bite to the mouth',()=>{
  const {world,root,rig}=carryingWorld();world.carriedItem='POPCORN';world.syncCarriedPropAnchor();
  world.nearbySeat=()=>undefined;
  world.interact();
  assert.equal(world.playerGesture,'eat');assert.equal(world.carriedItem,undefined);
  assert.equal(world.carriedPropKind,'POPCORN');assert.equal(world.carriedProp.visible,true);
  world.animateRig(rig,0,0,'eat',false,.5);root.updateWorldMatrix(true,true);
  assert.equal(rig.treat.visible,true);
  const mouth=rig.head.localToWorld(new THREE.Vector3(0,.299,.302));
  assert.ok(rig.treat.getWorldPosition(new THREE.Vector3()).distanceTo(mouth)<.015);
  world.eatingUntil=0;world.syncCarriedPropAnchor();assert.equal(world.carriedProp.visible,false);
});


const AVATAR_FILES=['male','female'];
const avatarBytes=Object.fromEntries(await Promise.all(AVATAR_FILES.map(async key=>{
  const bytes=await readFile(`src/assets/avatars/${key}.glb`);
  return [key,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)];
})));
await loadImportedAvatar(avatarBytes);
const BASE_PALETTE={skin:'#dfb590',hair:'#3b3633',top:'#18191b',bottoms:'#44464a',swimwear:'#577467'};
function importedCharacter(palette={}){
  const {root,rig}=character();
  attachImportedAvatar(root,rig,{...BASE_PALETTE,...palette});
  return {root,rig};
}
const shown=o=>o.visible&&(!o.parent||shown(o.parent));
const shownMeshes=root=>root.userData.importedAvatar.meshes.filter(shown);
const bodyMesh=root=>shownMeshes(root).find(m=>m.userData.componentId==='body');
const lowestSole=root=>Math.min(...root.userData.importedSolePoints().map(p=>p.y));

test('Higgsfield instances share geometry but never share a skeleton or colour material',()=>{
  const first=importedCharacter(),second=importedCharacter();
  const a=bodyMesh(first.root),b=bodyMesh(second.root);
  assert.equal(a.geometry,b.geometry);assert.notEqual(a.skeleton,b.skeleton);assert.notEqual(a.material,b.material);
  walkCoastalPose(first.rig,1,1);syncImportedAvatars(first.root);
  assert.notDeepEqual(a.skeleton.bones.find(b=>b.name==='RightArm').quaternion.toArray(),b.skeleton.bones.find(b=>b.name==='RightArm').quaternion.toArray());
});
test('walking keeps finite deformations, hands clear of the trousers and soles on the ground',()=>{
  const {root,rig}=importedCharacter(),mesh=bodyMesh(root),p=new THREE.Vector3();
  for(let frame=0;frame<24;frame++){
    walkCoastalPose(rig,frame/24*Math.PI*2,1);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);
    mesh.skeleton.update();const rest=mesh.geometry.getAttribute('position');
    for(let i=0;i<rest.count;i+=7){p.fromBufferAttribute(rest,i);mesh.applyBoneTransform(i,p);assert.ok(Number.isFinite(p.x+p.y+p.z));}
    const lowest=lowestSole(root);
    assert.ok(lowest>-.04&&lowest<.02,`shoe contact at ${frame}: ${lowest}`);
    for(const right of [false,true]){
      const tip=root.userData.importedFingertip(right);
      assert.ok(Math.abs(tip.x)>.36,`hand swings through the trousers at ${frame}: ${tip.x}`);
    }
  }
});
test('the arms hang from their generated A-pose to the rig, not stiffly out to the side',()=>{
  const {root,rig}=importedCharacter();walkCoastalPose(rig,0,0);syncImportedAvatars(root);
  for(const right of [false,true]){
    const frame=root.userData.importedHandFrame(right);
    // The source models stand with their arms 42° out; at rest they hang.
    assert.ok(frame.forearm.y<-.9,`forearm hangs ${right}: ${frame.forearm.toArray()}`);
  }
});
test('swimwear takes the clothes off the same body and keeps the same head',()=>{
  const {root}=importedCharacter(),land=bodyMesh(root);
  const garments=()=>shownMeshes(root).filter(m=>m.userData.componentId.startsWith('garment-')).map(m=>m.userData.componentId).sort();
  const headTop=()=>{syncImportedAvatars(root);return root.userData.importedHeadSupport().y;};
  const before=headTop();
  assert.deepEqual(garments(),['garment-shoes','garment-tee','garment-trousers']);
  setCoastalSwimwear(root,true);
  // One body in every outfit: the swimsuit is the body itself, never a second model.
  assert.equal(bodyMesh(root),land);assert.deepEqual(garments(),[]);
  assert.ok(root.userData.importedAvatar.variant.endsWith('-swim'));
  assert.ok(Math.abs(headTop()-before)<1e-6,'the crown does not move with the change');
  setCoastalSwimwear(root,false);assert.equal(bodyMesh(root),land);
  assert.deepEqual(garments(),['garment-shoes','garment-tee','garment-trousers']);
});
test('the cap and its mark are carried rigidly by the head',()=>{
  const {root}=importedCharacter({cap:'#303030'});
  for(const mesh of root.userData.importedAvatar.meshes.filter(m=>['cap','cap-logo'].includes(m.userData.componentId))){
    const ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
    for(let v=0;v<ids.count;v++)for(let k=0;k<4;k++)if(weights.getComponent(v,k)>.0001)
      assert.equal(mesh.skeleton.bones[ids.getComponent(v,k)].name,'Head',mesh.userData.componentId+' must be rigid');
  }
});

// Exercise the imported shoe surface, not the old rig's invisible proxy boxes.
test('imported soles clear every sampled step during ascent and descent',()=>{
  const {root,rig}=importedCharacter();
  const floor=(x,z)=>Math.max(0,Math.ceil(z/.56))*(3.5/9);
  for(const heading of [0,Math.PI])for(let frame=0;frame<48;frame++){
    root.position.set(0,0,frame/48*4.32);root.position.y=root.position.z/.56*(3.5/9)+.28;root.rotation.y=heading;
    walkCoastalPose(rig,frame/48*Math.PI*6);supportCoastalPose(rig,floor);syncImportedAvatars(root);
    let nearest=Infinity;
    for(const p of root.userData.importedSolePoints()){
      const clearance=p.y-floor(p.x,p.z);nearest=Math.min(nearest,clearance);
      assert.ok(clearance>-.04,`imported sole sinks at ${frame}, ${heading}: ${clearance}`);
    }
    assert.ok(nearest<.07,`imported shoes float at ${frame}, ${heading}: ${nearest}`);
  }
});
test('drinking and eating cannot drag trouser vertices with the hands',()=>{
  const {root,rig}=importedCharacter(),prop=new THREE.Group();root.add(prop);
  // The trousers and the legs under them: whatever follows the hips and legs
  // alone. The hands now hang to mid-thigh, so height cannot tell them apart.
  const legBones=/^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase))$/;
  const meshes=shownMeshes(root).filter(m=>['body','garment-trousers'].includes(m.userData.componentId));
  assert.equal(meshes.length,2);
  const legs=meshes.map(mesh=>{
    const rest=mesh.geometry.getAttribute('position'),ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
    mesh.skeleton.update();const picked=[];
    for(let i=0;i<rest.count;i++){
      let onLegs=true;for(let k=0;k<4;k++)if(weights.getComponent(i,k)>.001&&!legBones.test(mesh.skeleton.bones[ids.getComponent(i,k)].name))onLegs=false;
      if(onLegs)picked.push(i);
    }
    return {mesh,rest,picked};
  });
  assert.ok(legs.every(l=>l.picked.length>500));
  function vertices(){
    syncImportedAvatars(root);
    return legs.flatMap(({mesh,rest,picked})=>{mesh.skeleton.update();return picked.map(i=>mesh.localToWorld(mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(rest,i))));});
  }
  const baseline=vertices();
  for(const [hand,gesture] of [['right','drink'],['left','eat']])for(const phase of [0,.25,.5,.75,1]){
    prop.userData.carryHand=hand;poseCoastalCarry(rig,prop,gesture,phase);
    vertices().forEach((p,i)=>assert.ok(p.distanceTo(baseline[i])<.0005,`hand pulls trousers at ${gesture} ${phase}`));
  }
});

test('imported hands bring the straw and popcorn to the mouth',()=>{
  for(const palette of [{},{top:'#28191b'}])for(const gesture of ['drink','eat']){
    const {root,rig}=importedCharacter(palette),prop=new THREE.Group();root.add(prop);
    prop.userData.carryHand=gesture==='drink'?'right':'left';
    poseCoastalCarry(rig,prop,gesture,.5);syncImportedAvatars(root);
    const mouth=rig.head.localToWorld(root.userData.importedMouth.clone());
    const point=gesture==='drink'?prop.localToWorld(COASTAL_STRAW_TIP.clone()):rig.visualRoot.localToWorld(root.userData.importedFingertip(true));
    assert.ok(point.distanceTo(mouth)<.065,`${gesture} misses the mouth (${palette.top??'male'}): ${point.distanceTo(mouth)}`);
  }
});

test('seated imported shoes meet the floor without moving the seated body',()=>{
  const {root,rig}=importedCharacter();root.position.y=.4+.23-1.1;
  const seatedY=root.position.y;seatCoastalLegs(rig,()=>-.28);syncImportedAvatars(root);
  const lowest=lowestSole(root);
  assert.ok(Math.abs(lowest+.28)<.035,`seated shoe contact: ${lowest}`);
  assert.equal(root.position.y,seatedY);
});

test('every avatar file carries one skinned body, four influences and finite weights',()=>{
  const {root}=importedCharacter();
  for(const mesh of root.userData.importedAvatar.meshes){
    const weights=mesh.geometry.getAttribute('skinWeight');assert.ok(weights,mesh.userData.componentId);
    for(let v=0;v<weights.count;v+=5){
      let sum=0;for(let k=0;k<4;k++){const w=weights.getComponent(v,k);assert.ok(Number.isFinite(w));sum+=w;}
      assert.ok(Math.abs(sum-1)<.02,`${mesh.userData.componentId} weights sum to ${sum}`);
    }
  }
  const ids=root.userData.importedAvatar.meshes.map(m=>m.userData.componentId);
  for(const id of ['body','cap','cap-logo','print-schedule-front','print-schedule-back','print-schedule-tag','print-house-front','print-bros-back','vest','print-vest-front','print-vest-back'])
    assert.ok(ids.includes(id),'missing '+id);
});

test('the tee and vest lettering is the supplied artwork, never the generated text',async()=>{
  const {root}=importedCharacter();
  for(const [id,file] of [['print-schedule-front','schedule-front'],['print-schedule-back','schedule-back'],['print-schedule-tag','schedule-tag'],['print-house-front','house-front'],['print-bros-back','bros-back'],['print-vest-front','vest-front'],['print-vest-back','vest-back']]){
    const bytes=await readFile(`src/assets/outfits/${file}.png`),view=new DataView(bytes.buffer,bytes.byteOffset);
    const mesh=root.userData.importedAvatar.meshes.find(m=>m.userData.componentId===id);
    const image=mesh.material.map.image;
    // The build pads each image by a six-pixel transparent border.
    assert.deepEqual([image.width,image.height],[view.getUint32(16)+12,view.getUint32(20)+12],id);
  }
});

test('the cap is independently removable through palette and swim transitions',()=>{
 const {root}=importedCharacter();
 const cap=()=>shownMeshes(root).find(m=>m.userData.componentId==='cap');
 assert.equal(cap(),undefined);
 root.userData.setImportedPalette({...BASE_PALETTE,cap:'#aa3344'});assert.ok(cap());
 assert.equal(cap().material.color.getHexString(),new THREE.Color('#aa3344').getHexString());
 setCoastalSwimwear(root,true);assert.ok(cap(),'the cap stays on in the water');
 root.userData.setImportedPalette(BASE_PALETTE);assert.equal(cap(),undefined);
 setCoastalSwimwear(root,false);assert.equal(cap(),undefined);assert.ok(bodyMesh(root));
});

test('three fixed outfits remain independent across visitors and restore correctly after swimming',()=>{
 const a=importedCharacter(),b=importedCharacter();
 const visible=root=>shownMeshes(root).map(m=>m.userData.componentId).sort();
 const clothes=['garment-shoes','garment-tee','garment-trousers'];
 const dressed=(...prints)=>['body',...clothes,...prints].sort();
 for(const [top,expected] of [['#18191b',dressed('print-schedule-back','print-schedule-front','print-schedule-tag')],['#191a1c',dressed('print-bros-back','print-house-front')],['#1a1b1d',dressed('print-vest-back','print-vest-front','vest')]]){
  a.root.userData.setImportedPalette({...BASE_PALETTE,top});
  assert.deepEqual(visible(a.root),expected);
  assert.deepEqual(visible(b.root),dressed('print-schedule-back','print-schedule-front','print-schedule-tag'));
  setCoastalSwimwear(a.root,true);
  assert.deepEqual(visible(a.root),['body'],'only the swimwear body in the water');
  a.root.userData.setImportedPalette({...BASE_PALETTE,top});
  assert.deepEqual(visible(a.root),['body'],'appearance edits cannot reveal garments in water');
  setCoastalSwimwear(a.root,false);assert.deepEqual(visible(a.root),expected);
 }
});

test('the female body rides in the outfit wire and keeps outfit, cap and swimwear',()=>{
 const {root}=importedCharacter({top:'#291a1c',cap:'#303030'});
 assert.equal(root.userData.avatarSex,'female');
 assert.deepEqual(shownMeshes(root).map(m=>m.userData.componentId).sort(),['body','cap','cap-logo','garment-shoes','garment-tee','garment-trousers','print-bros-back','print-house-front']);
 setCoastalSwimwear(root,true);assert.equal(root.userData.importedAvatar.variant,'female-swim');
 setCoastalSwimwear(root,false);
 root.userData.setImportedPalette({...BASE_PALETTE,top:'#191a1c',cap:'#303030'});
 assert.equal(root.userData.avatarSex,'male');assert.equal(root.userData.importedAvatar.variant,'male');
 assert.ok(shownMeshes(root).some(m=>m.userData.componentId==='print-bros-back'),'the outfit survives the change of body');
});

test('a body mounted after the avatar was placed keeps its projector layers',()=>{
 // The screens redraw only what is on layer 1 in front of the film. A body
 // changed after entering was mounted on layer 0 alone, and the film covered it.
 const {root}=importedCharacter();
 root.traverse(o=>{o.layers.enable(1);o.layers.enable(2);});
 for(const top of ['#28191b','#1b1c1e','#18191b']){
  root.userData.setImportedPalette({...BASE_PALETTE,top});
  root.traverse(o=>{if(o.isMesh)assert.ok(o.layers.isEnabled(1)&&o.layers.isEnabled(2),`${top}: ${o.name} left off the projector layers`);});
 }
});

test('outfit 4 wears the swimsuit on land, on either body, standing on its feet',()=>{
 for(const [top,variant] of [['#1b1c1e','male-swim'],['#2b1c1e','female-swim']]){
  const {root,rig}=importedCharacter({top});
  assert.equal(root.userData.importedAvatar.variant,variant);
  walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);
  const lowest=lowestSole(root);
  assert.ok(lowest>-.04&&lowest<.02,`${variant} bare feet on the ground: ${lowest}`);
 }
});

test('every finger has three bones: a fist curls each tip toward the palm and rest round-trips',()=>{
 for(const top of ['#18191b','#28191b']){
  const {root,rig}=importedCharacter({top});walkCoastalPose(rig,0,0);syncImportedAvatars(root);
  const body=bodyMesh(root);
  for(const right of [false,true]){
   const side=right?'Left':'Right',bone=n=>body.skeleton.bones.find(b=>b.name===side+'Hand'+n);
   const rest=root.userData.importedHandRest(right);assert.ok(rest,`${top} ${side} finger rig`);
   const frame=root.userData.importedHandFrame(right),hand=bone('');
   const tips=()=>{syncImportedAvatars(root);root.updateMatrixWorld(true);return FINGER_NAMES.map(n=>bone(n+'4').getWorldPosition(new THREE.Vector3()));};
   const open=tips();
   root.userData.setImportedFists(true);const closed=tips();root.userData.setImportedFists(false);
   const wrist=hand.getWorldPosition(new THREE.Vector3());
   // Closed, every fingertip is nearer the wrist and has moved toward the palm side.
   const palm=frame.palm.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
   FINGER_NAMES.forEach((n,i)=>{
    assert.ok(closed[i].distanceTo(wrist)<open[i].distanceTo(wrist)*(n==='Thumb'?.97:.7),`${side} ${n} closes`);
    // Rolled in, the tip ends on the palm's side of its own knuckle.
    const knuckle=bone(n+'1').getWorldPosition(new THREE.Vector3());
    if(n!=='Thumb')assert.ok(closed[i].clone().sub(knuckle).dot(palm)>.01,`${side} ${n} curls toward the palm`);
   });
   root.userData.setImportedHandPose(right,rest);
   tips().forEach((p,i)=>assert.ok(p.distanceTo(open[i])<1e-6,'the rest pose leaves the hand as modelled'));
   root.userData.setImportedHandPose(right,null);
  }
 }
});
test('hand angles read a curled hand as curled, whichever hand it is',()=>{
 // A flat hand, palm down, fingers along -z; then the same hand curled.
 const make=(right,bendBy)=>{
  const s=right?1:-1,wrist=new THREE.Vector3(0,0,0),fingers={};
  const lanes={Thumb:-.045,Index:-.03,Middle:-.01,Ring:.01,Pinky:.03};
  for(const n of FINGER_NAMES){
   const x=lanes[n]*s;let p=new THREE.Vector3(x,0,n==='Thumb'?-.03:-.09),dir=new THREE.Vector3(0,0,-1);const pts=[p.clone()];
   for(let i=0;i<3;i++){dir.applyAxisAngle(new THREE.Vector3(1,0,0),-bendBy);p=p.clone().addScaledVector(dir,.03);pts.push(p);}
   fingers[n]=pts;
  }
  return handPoseFromJoints({wrist,fingers},right);
 };
 for(const right of [false,true])for(const amount of [.6,.9,1.2]){
  // At .9 and 1.2 the distal segment passes 90 degrees. Its bend must stay positive.
  const flat=make(right,0),curled=make(right,amount);
  for(const n of ['Index','Middle','Ring','Pinky'])for(let i=1;i<3;i++){
   assert.ok(Math.abs(flat[n].curl[i])<1e-6,`${n} straight`);
   assert.ok(Math.abs(curled[n].curl[i]-amount)<1e-6,`${right?'right':'left'} ${n} joint ${i} bends toward the palm: ${curled[n].curl[i]}`);
  }
 }
});
test('imported hands rest palm-in with thumbs forward and fingers down',()=>{
 const {root}=importedCharacter();
 for(const right of [false,true]){
  const frame=root.userData.importedHandFrame(right);
  assert.ok(frame.palm.dot(new THREE.Vector3(right?-1:1,0,0))>.85,`palm-in ${right}: ${frame.palm.toArray()}`);
  assert.ok(frame.thumb.z>.85,`thumb-forward ${right}: ${frame.thumb.toArray()}`);
  assert.ok(frame.fingers.y<-.9,`fingers-down ${right}: ${frame.fingers.toArray()}`);
 }
});

test('container grips face the prop without bending wrists through the sleeve',()=>{
 for(const right of [false,true])for(const progress of [0,.15,.35,.5,.7,.85,1]){
  const {root,rig}=importedCharacter(),prop=new THREE.Group();root.add(prop);prop.userData.carryHand=right?'right':'left';
  poseCoastalCarry(rig,prop,right?'drink':undefined,progress);
  const frame=root.userData.importedHandFrame(right);
  const centre=rig.visualRoot.worldToLocal(prop.getWorldPosition(new THREE.Vector3()));
  assert.ok(frame.palm.dot(centre.sub(root.userData.importedWrist(right)))>0,`palm must face container: ${right}, ${progress}`);
  assert.ok(frame.forearm.angleTo(frame.fingers)<THREE.MathUtils.degToRad(40.1),`wrist bend ${right}, ${progress}`);
 }
});

test('a piece of popcorn goes up with the palm towards the face, not the wrist bent back',()=>{
 for(const palette of [{},{top:'#28191b'}]){
  const {root,rig}=importedCharacter(palette),prop=new THREE.Group();root.add(prop);prop.userData.carryHand='left';
  poseCoastalCarry(rig,prop,'eat',.5);syncImportedAvatars(root);
  const frame=root.userData.importedHandFrame(true);
  const mouth=rig.visualRoot.worldToLocal(rig.head.localToWorld(root.userData.importedMouth.clone()));
  const toMouth=mouth.clone().sub(frame.joint).normalize();
  const who=palette.top?'female':'male';
  // The avatar faces +z in its own frame: a palm turned to the face points back along -z.
  assert.ok(frame.palm.z<-.3,`the palm is not turned to the face (${who}): ${frame.palm.toArray().map(v=>v.toFixed(2))}`);
  assert.ok(frame.fingers.dot(toMouth)>.5,`the fingers do not rise to the mouth (${who}): ${frame.fingers.dot(toMouth).toFixed(2)}`);
  assert.ok(frame.forearm.angleTo(frame.fingers)<THREE.MathUtils.degToRad(35),`the wrist is bent (${who}): ${THREE.MathUtils.radToDeg(frame.forearm.angleTo(frame.fingers)).toFixed(0)} degrees`);
 }
});
test('both wrists remain attached and anatomically bounded throughout the complete popcorn cycle',()=>{
 const {root,rig}=importedCharacter(),prop=new THREE.Group();root.add(prop);prop.userData.carryHand='left';
 for(let i=0;i<=60;i++){
  poseCoastalCarry(rig,prop,'eat',i/60);
  for(const right of [true,false]){
   const frame=root.userData.importedHandFrame(right);
   assert.ok(frame.forearm.angleTo(frame.fingers)<THREE.MathUtils.degToRad(40.1),`overbent wrist at ${i}, ${right}`);
   assert.ok(frame.joint.distanceTo(root.userData.importedWrist(right))<.02,`hand drift at ${i}, ${right}`);
  }
 }
});

test('the cap mark is textured, independent of cap dye, and hidden with the hat',()=>{
 const {root}=importedCharacter();
 const logo=root.userData.importedAvatar.meshes.find(m=>m.userData.componentId==='cap-logo');
 assert.ok(logo,'separate exact-logo patch');assert.ok(logo.material.map,'embedded PNG texture');
 const texture=logo.material.map,colour=logo.material.color.getHex();
 root.userData.setImportedPalette({...BASE_PALETTE,cap:'#ee3333'});
 assert.equal(shown(logo),true);assert.equal(logo.material.map,texture);assert.equal(logo.material.color.getHex(),colour);
 root.userData.setImportedPalette(BASE_PALETTE);
 assert.equal(shown(logo),false);
});

test('MENTOR lies in the hair or on the cap, following the animated head, legs uncrossed',()=>{
 const {root,rig}=importedCharacter(),group=new THREE.Group(),dog=createMentorDog();root.add(group);group.add(dog.root);
 const legs=[['leftFrontLeg',-1],['rightFrontLeg',1],['leftBackLeg',-1],['rightBackLeg',1]];
 for(const cap of [undefined,'#303030']){
  root.userData.setImportedPalette({...BASE_PALETTE,cap});
  for(let i=0;i<48;i++){
   root.position.set(i*.03,.28+i*.007,0);root.rotation.y=i*.03;
   walkCoastalPose(rig,i/48*Math.PI*2);supportCoastalPose(rig,()=>i*.007);syncImportedAvatars(root);
   const support=root.userData.importedHeadSupport(),surface=root.userData.importedHeadSurface();
   perchMentor(group,dog,rig.head,support,surface);
   // Settled into the dome it lies on, measured over the blocks' faces, not just their corners.
   let clearance=Infinity,belly=Infinity;
   // His body, not his paws and tail: those tuck into the hair as he lies.
   const limbs=new Set();for(const part of ['leftFrontLeg','rightFrontLeg','leftBackLeg','rightBackLeg','tail'])dog[part].traverse(o=>limbs.add(o));
   dog.root.traverse(mesh=>{
    if(!mesh.isMesh||limbs.has(mesh))return;
    for(const x of [-.5,0,.5])for(const y of [-.5,0,.5])for(const z of [-.5,0,.5]){
     const p=rig.head.worldToLocal(mesh.localToWorld(new THREE.Vector3(x,y,z))),under=surface(p.x,p.z);
     if(Number.isFinite(under))clearance=Math.min(clearance,p.y-under);
     if(mesh.name==='square-horizontal-torso')belly=Math.min(belly,p.y-support.y);
    }
   });
   // Lying on it, not perched on his paws over it (the owner, 2026-10-01:
   // "the gap is too wide") and not sunk into it ("too deep"): his lowest
   // point is in the hair or the cap's crown, by no more than a few cm.
   assert.ok(clearance<-MENTOR_NESTLE+.004&&clearance>-.12,`settled ${i}: ${clearance}`);
   assert.ok(belly<.01&&belly>-.12,`belly on the crown ${i}: ${belly}`);
   // Each paw stays on its own side of the body: crossed, they propped him up.
   for(const [leg,side] of legs){
    const paw=dog.root.worldToLocal(dog[leg].localToWorld(new THREE.Vector3(0,-.78,0)));
    assert.ok(paw.x*side>.25,`${leg} paw on its own side: ${paw.x}`);
   }
   assert.equal(group.parent,root,'retain carrier identity for networking');
  }
 }
});
test('MENTOR trot is frame-rate independent, bounded and settles when blocked',()=>{
 for(const fps of [30,60,120]){
  const dog=createMentorDog();stepMentorGait(dog,1/fps,true);
  for(let i=0;i<fps*3;i++){dog.root.position.x+=6/fps;stepMentorGait(dog,1/fps,true);}
  const phase=dog.root.userData.gait.phase;assert.ok(Math.abs(phase-3*1.15*Math.PI*2)<1e-6);
  for(let i=0;i<fps;i++)stepMentorGait(dog,1/fps,true);
  assert.equal(dog.root.userData.gait.phase,phase);assert.ok(dog.root.userData.gait.amount<.001);
  dog.root.position.x+=20;stepMentorGait(dog,1/fps,true);assert.equal(dog.root.userData.gait.phase,phase);
 }
});


test('receiving a punch is grounded, bounded and recovers without inheriting the walk pose',()=>{
 const {root,rig}=importedCharacter();
 const world=Object.create(FestivalWorld.prototype);
 Object.assign(world,{locomotion:new WeakMap(),reviewLastDelta:1/60});world.footSurfaceAt=()=>0;
 const joints=[rig.torso,rig.head,rig.leftArm,rig.rightArm,rig.leftElbow,rig.rightElbow,rig.leftWrist,rig.rightWrist,rig.leftLeg,rig.rightLeg,rig.leftKnee,rig.rightKnee];
 for(const away of [[0,-1],[1,0],[0,1],[-1,0]]){
  root.userData.hitDirection=new THREE.Vector3(away[0],0,away[1]);let previous;
  for(let i=0;i<=62;i++){
   // Deliberately poison the incoming pose to catch uninitialised joints.
   walkCoastalPose(rig,2.1);world.animateRig(rig,9,.62,'hit',false,i/62);syncImportedAvatars(root);
   assert.ok(Math.abs(rig.head.rotation.x)<=.141&&Math.abs(rig.head.rotation.z)<=.101);
   assert.ok(rig.leftArm.rotation.z<0&&rig.rightArm.rotation.z>0,'brace outward, never cross arms through the torso');
   const minimum=lowestSole(root);
   assert.ok(minimum>-.04&&minimum<.02,`hit sole contact ${i}: ${minimum}`);
   const current=joints.map(j=>j.quaternion.clone());
   if(previous)current.forEach((q,j)=>assert.ok(q.angleTo(previous[j])<.11,`abrupt joint change at ${i}, joint ${j}`));
   previous=current;
  }
  const recovered=joints.map(j=>j.quaternion.clone());hitCoastalPose(rig,0,...away);
  recovered.forEach((q,j)=>assert.ok(q.angleTo(joints[j].quaternion)<1e-6,'recovery ends at its relaxed starting pose'));
 }
});
test('a hit recoils first, braces later and follows the impact direction',()=>{
 const {rig}=character();hitCoastalPose(rig,.15);const earlyChest=Math.abs(rig.torso.rotation.x),earlyKnee=rig.leftKnee.rotation.x;
 hitCoastalPose(rig,.39);assert.ok(Math.abs(rig.torso.rotation.x)<earlyChest);assert.ok(rig.leftKnee.rotation.x>earlyKnee);
 hitCoastalPose(rig,.15,1,0);assert.ok(rig.torso.rotation.z<0);assert.equal(rig.torso.rotation.x,0);
 hitCoastalPose(rig,.15,-1,0);assert.ok(rig.torso.rotation.z>0);
});


test('wave uses an outward shoulder and a single bending elbow without twisting it sideways',()=>{
 const {root,rig}=importedCharacter();let last;
 for(let i=0;i<=80;i++){
  walkCoastalPose(rig,0,0);waveCoastalPose(rig,i*.13,i/80);syncImportedAvatars(root);
  const wrist=root.userData.importedWrist(true);
  assert.ok(Number.isFinite(wrist.y));
  if(i>28&&i<52)assert.ok(wrist.y>2.5,'raised palm stays above the shoulder');
  const frame=root.userData.importedHandFrame(true);
  assert.ok(frame.forearm.angleTo(frame.fingers)<1.1,'wrist must follow forearm');
  // The generated arm is solved to its own wrist, a few degrees from the rig's
  // proxy, so the largest single step is a shade above the old 0.12.
  if(last)assert.ok(rig.rightArm.quaternion.angleTo(last)<.135,`wave change ${i}: ${rig.rightArm.quaternion.angleTo(last)}`);
  last=rig.rightArm.quaternion.clone();
 }
});
test('falling holds a brace and landing keeps soles supported through compression and recovery',()=>{
 const {root,rig}=importedCharacter();
 fallCoastalPose(rig,-18);assert.ok(Math.abs(rig.leftArm.rotation.x)<.5);assert.ok(rig.leftKnee.rotation.x<.5);
 let previous;
 for(let i=0;i<=80;i++){
  landCoastalPose(rig,i/80);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);
  assert.ok(rig.leftKnee.rotation.x>=0&&rig.leftKnee.rotation.x<=.71);
  if(previous)assert.ok(rig.leftKnee.quaternion.angleTo(previous)<.09);
  previous=rig.leftKnee.quaternion.clone();
  assert.ok(coastalFootHeights(rig).every(h=>h>-.04));
 }
 assert.equal(rig.torso.rotation.x,0);assert.equal(rig.leftKnee.rotation.x,0);
});
test('remote seated drinking creates a cup before posing and keeps it visible until the action finishes',()=>{
 const {world,root,rig}=carryingWorld();const cup=new THREE.Group();root.add(cup);
 const remote={group:root,rig,carriedProp:cup,carriedItem:undefined,state:'seated',moving:false,running:false,gesture:'drink',gestureUntil:performance.now()+1800,
 previousTarget:root.position.clone(),target:root.position.clone(),targetAt:performance.now(),updateInterval:220,targetRotation:0,previousRotation:0,animationPhase:0,badge:new THREE.Group()};
 world.remoteAvatars=new Map([['other',remote]]);
 world.updateRemoteAvatars(1/60,0);assert.equal(cup.visible,true);assert.equal(cup.userData.item,'DRINK');assert.equal(cup.userData.carryHand,'right');
 const before=rig.rightArm.quaternion.clone();remote.gestureUntil=performance.now()+800;world.updateRemoteAvatars(1/60,1);
 assert.ok(before.angleTo(rig.rightArm.quaternion)>.05,'the sip must advance while seated');
 remote.gestureUntil=0;world.updateRemoteAvatars(1/60,2);assert.equal(cup.visible,false);
});

test('DJ hands lie over the record and mixer with palms down',()=>{
 const {root,rig}=importedCharacter();
 for(const time of [0,1,3,5,7]){
  djCoastalPose(rig,time);syncImportedAvatars(root);
  for(const right of [false,true]){
   const wrist=root.userData.importedWrist(right),tip=root.userData.importedFingertip(right),frame=root.userData.importedHandFrame(right);
   assert.ok(tip.y>1.26&&tip.y<1.36,`fingertips stay at control surface height: ${tip.y}`);
   // The generated fingers are longer than the old blocky ones, so the tips
   // reach a couple of centimetres further over the mixer.
   assert.ok(tip.z>.6&&tip.z<.84,`hands stay above the deck rather than behind the cabinet: ${tip.z}`);
   // The mixer spans |x| < .41 and each platter is .98 across; the platter
   // hand is at full reach, and measured by its real palm its tips land at -.89 to -.92.
   assert.ok(right?Math.abs(tip.x)<.3:tip.x<-.85,`one hand on the mixer, one on the platter: ${tip.x}`);
   assert.ok(frame.palm.y<-.6,'palms face the controls');
  }
 }
});


test('controller movement resumes immediately when a teleport closes menu capture',()=>{
  const world=Object.create(FestivalWorld.prototype),events=[];
  const frame={moveX:.65,moveY:-.8,lookX:0,lookY:0,pressed:new Set(),held:new Set()};
  Object.assign(world,{xrActive:false,keys:new Set(),gamepad:{poll:()=>frame},gamepadRunning:false,onAction:e=>events.push(e)});
  for(let trip=0;trip<3;trip++) {
    world.setMenuOpen(true);world.updateGamepad(1/60);
    assert.equal(world.stickX,0);assert.equal(world.stickY,0,'map input must not walk the avatar');
    world.setMenuOpen(false);world.updateGamepad(1/60);
    assert.equal(world.stickX,.65);assert.equal(world.stickY,-.8,'the next pad frame must control the avatar');
    frame.moveX=0;frame.moveY=0;world.updateGamepad(1/60);
    assert.equal(world.stickX,0);assert.equal(world.stickY,0,'releasing the stick must stop movement');
    frame.moveX=.65;frame.moveY=-.8;
  }
  assert.ok(events.some(e=>e.type==='gamepadMenu'));
});

test('NIMA fast travel keeps the follow camera outside the open shop bay',()=>{
  const world=Object.create(FestivalWorld.prototype);
  const player=new THREE.Group();
  Object.assign(world,{
    player,playerState:'walking',cameraMode:'follow',cameraReach:10.56,
    cameraOrbit:{follow:{yaw:0,pitch:.3},perspective:{yaw:.8,pitch:.4}},
    groundHeightAt:()=>.28,setSwimming(){},setOutfit(){},
  });
  world.fastTravel('rooftop');
  assert.deepEqual(player.position.toArray(),[40,.28,4]);
  assert.equal(world.cameraOrbit.follow.yaw,Math.PI);
  assert.equal(world.cameraReach,0);
  const lookZ=player.position.z-2.2;
  const cameraZ=lookZ+Math.cos(world.cameraOrbit.follow.yaw)*10.56;
  assert.ok(cameraZ<8,'the resting camera must remain south of the shop footprint');
});

test('follow camera stays on the avatar side of a nearby building wall',()=>{
  const world=Object.create(FestivalWorld.prototype);
  const player=new THREE.Group();player.position.set(0,.28,0);
  Object.assign(world,{
    player,playerState:'walking',cameraMode:'follow',cameraReach:0,
    cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),lookTarget:new THREE.Vector3(),groundHeightAt:()=>0,
    clubAvoidance:{side:0,offset:0},wallAvoidance:{side:0,offset:0},
    colliders:[{minX:-5,maxX:5,minZ:2,maxZ:3,minY:-1,maxY:10}],
  });
  const eye=player.position.clone().add(new THREE.Vector3(0,2.84,0));
  // The swing is eased now rather than snapped — a camera that jumped to its
  // alternate in a single frame is precisely the lurch the owner reported — so
  // settle it over a second of frames and read where it comes to rest.
  const target=new THREE.Vector3(0,3.12,10);
  for(let frame=0;frame<240;frame++){target.set(0,3.12,10);world.pullCameraClearOfWalls(target,1/60);}
  // The contract the owner asked for on 2026-09-18: the view does not move
  // itself out of the way any more. It stays on the orbit it was given, stops
  // short of the wall, and never looks through it. It is allowed to end up
  // close to the avatar — that is the trade, and the avatar is faded out before
  // the lens reaches their head.
  assert.ok(target.z<2,`camera target crossed the wall at z=${target.z}`);
  assert.ok(Math.abs(target.x)<.05,`the camera swung itself to x=${target.x.toFixed(2)}`);
  assert.equal(world.wallAvoidance.side,0,'no side may be taken any more');
  assert.equal(world.wallAvoidance.offset,0,'and no swing applied');
  assert.ok(world.cameraClearReach(eye,target)>=target.distanceTo(eye)-.32,
    'the view it settles on still has an unobstructed line of sight');
  const oldPosition=new THREE.Vector3(0,3.12,10);
  const clear=world.cameraClearReach(eye,oldPosition);
  assert.ok(clear<2,'smoothing an obstructed camera must be clamped too');
});

test('wall avoidance holds one side and returns to the usual orbit after clearance',()=>{
  const world=Object.create(FestivalWorld.prototype);
  const player=new THREE.Group();player.position.set(0,.28,0);
  Object.assign(world,{player,playerState:'walking',cameraMode:'follow',cameraReach:0,
    cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),lookTarget:new THREE.Vector3(),groundHeightAt:()=>0,
    clubAvoidance:{side:0,offset:0},wallAvoidance:{side:0,offset:0},
    colliders:[{minX:-5,maxX:5,minZ:2,maxZ:3,minY:-1,maxY:10}]});
  const first=new THREE.Vector3(0,3.12,10);
  for(let frame=0;frame<240;frame++){first.set(0,3.12,10);world.pullCameraClearOfWalls(first,1/60);}
  const side=world.wallAvoidance.side;
  // Thirty more frames against the same wall must not change its mind.
  const second=new THREE.Vector3(0,3.12,10);
  for(let frame=0;frame<30;frame++){second.set(0,3.12,10);world.pullCameraClearOfWalls(second,1/60);}
  assert.ok(Math.sign(first.x)===Math.sign(second.x),'the orbit must not flip sides between frames');
  assert.equal(world.wallAvoidance.side,side,'the committed side must survive');
  player.position.z=-12;
  const clear=new THREE.Vector3(0,3.12,-2);
  for(let frame=0;frame<120;frame++){clear.set(0,3.12,-2);world.pullCameraClearOfWalls(clear,1/60);}
  assert.equal(world.wallAvoidance.side,0);
  assert.ok(Math.abs(clear.x)<.05,`the camera should return to the preferred orbit after the wall, got x=${clear.x}`);
});

test('perspective orbit also stays away from a wall at its side',()=>{
  const world=Object.create(FestivalWorld.prototype);
  const player=new THREE.Group();player.position.set(0,.28,0);
  Object.assign(world,{player,playerState:'walking',cameraMode:'perspective',cameraReach:0,
    cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),lookTarget:new THREE.Vector3(),groundHeightAt:()=>0,
    clubAvoidance:{side:0,offset:0},wallAvoidance:{side:0,offset:0},
    colliders:[{minX:2,maxX:3,minZ:-5,maxZ:5,minY:-1,maxY:10}]});
  const eye=player.position.clone().add(new THREE.Vector3(0,2.84,0));
  const target=new THREE.Vector3(9,3.12,2);
  for(let frame=0;frame<240;frame++){target.set(9,3.12,2);world.pullCameraClearOfWalls(target,1/60);}
  // Closeness is permitted now; looking through the wall is not.
  assert.ok(world.cameraClearReach(eye,target)>=target.distanceTo(eye)-.32);
  assert.equal(world.wallAvoidance.offset,0,'the perspective orbit must not swing either');
});

test('club wall confinement finds room to the side before squeezing the camera',()=>{
  const world=Object.create(FestivalWorld.prototype);
  const player=new THREE.Group();player.position.set(-51.5,-15.7,15);
  Object.assign(world,{player,playerState:'walking',cameraMode:'follow',
    cameraOrbit:{follow:{yaw:Math.PI/2,pitch:.3},perspective:{yaw:.8,pitch:.4}},
    lookTarget:new THREE.Vector3(),groundHeightAt:()=>-16,
    cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),
    clubAvoidance:{side:0,offset:0},wallAvoidance:{side:0,offset:0}});
  const target=new THREE.Vector3(-41.5,-12,15);
  // The swing is eased now rather than snapped, so it is settled over a second
  // of frames — a camera that jumped to its alternate in one frame is what made
  // walking through the club dizzy.
  for(let frame=0;frame<90;frame+=1)world.confineCameraToClub(target,1/60);
  // The room still holds the camera inside its walls — that part has not
  // changed — but it no longer hunts along them for a better view.
  // The invariant that still matters: wherever the view ends up, it is inside
  // the club. It used to be allowed a 1.6 minimum distance even when the orbit
  // it was on had less room than that, which with the swing gone would put the
  // lens through the wall and show the void behind it.
  assert.ok(world.inClub(target.x,target.z),
    `the camera left the room at ${target.x.toFixed(2)},${target.z.toFixed(2)}`);
  assert.ok(target.distanceTo(player.position)<=7.5,'and never further out than the orbit asked for');
  assert.equal(world.clubAvoidance.offset,0,'the club must not swing the view any more');
  assert.equal(world.clubAvoidance.side,0);
});

test('the club camera commits to one side instead of swinging as you walk',()=>{
  const world=Object.create(FestivalWorld.prototype);
  const player=new THREE.Group();player.position.set(-51.5,-15.7,15);
  Object.assign(world,{player,playerState:'walking',cameraMode:'follow',
    cameraOrbit:{follow:{yaw:Math.PI/2,pitch:.3},perspective:{yaw:.8,pitch:.4}},
    lookTarget:new THREE.Vector3(),groundHeightAt:()=>-16,
    cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),
    clubAvoidance:{side:0,offset:0},wallAvoidance:{side:0,offset:0}});
  const target=new THREE.Vector3(-41.5,-12,15);
  for(let frame=0;frame<90;frame+=1)world.confineCameraToClub(target,1/60);
  // The rule now, in its strongest form: walking moves the avatar and nothing
  // else. This used to assert that a side had been *taken* and merely held on
  // to; the owner tried that and asked for the swing gone altogether, because
  // even a committed, eased swing reads as the world turning around somebody
  // who is only pressing forward.
  assert.equal(world.clubAvoidance.side,0,'no side may be taken any more');
  assert.equal(world.clubAvoidance.offset,0,'and no swing applied');
  let biggestSidestep=0;
  let previous=target.clone();
  for(let stepIndex=0;stepIndex<40;stepIndex+=1){
    player.position.z+=0.25;
    world.confineCameraToClub(target,1/60);
    // The avatar's own 0.25 is subtracted; what is left is the camera moving
    // of its own accord, which must be nothing.
    biggestSidestep=Math.max(biggestSidestep,Math.hypot(target.x-previous.x,target.z-previous.z-0.25));
    previous=target.clone();
    assert.equal(world.clubAvoidance.offset,0,`the camera swung itself at step ${stepIndex}`);
  }
  assert.ok(biggestSidestep<0.06,`the camera moved itself ${biggestSidestep.toFixed(3)} sideways in one frame`);
});

test('approaching a building keeps the follow camera out of the face and the masonry',()=>{
  const world=Object.create(FestivalWorld.prototype);
  const player=new THREE.Group();player.position.set(0,.28,-15);
  const camera=new THREE.PerspectiveCamera();camera.position.set(0,5,-7);
  Object.assign(world,{player,camera,lookTarget:new THREE.Vector3(),cameraProbe:new THREE.Vector3(),
    cameraMode:'follow',cameraZoom:1,cameraReach:0,playerState:'walking',
    cameraScratch:new THREE.Vector3(),cameraAim:new THREE.Euler(0,0,0,'YXZ'),
    cameraArcPivot:new THREE.Vector3(),cameraArcFrom:new THREE.Vector3(),cameraArcTo:new THREE.Vector3(),
    clubAvoidance:{side:0,offset:0},wallAvoidance:{side:0,offset:0},
    cameraOrbit:{follow:{yaw:0,pitch:Math.atan2(3.4,10)},perspective:{yaw:.8,pitch:.4}},
    colliders:[{minX:-5,maxX:5,minZ:2,maxZ:3,minY:-1,maxY:10}],
    groundHeightAt:()=>0,confineCameraToClub(){},confineCameraOverWater(){},
    settlePunchImpact(){},applyCameraShake(){},applyDrunkenView(){},
  });
  let closest=Infinity;
  let biggestZoomStep=0;
  let previousReach;
  for(let frame=0;frame<310;frame++){
    player.position.z=Math.min(0,-15+frame*.06);
    world.updateCamera(1/60,frame/60);
    const eye=player.position.clone().add(new THREE.Vector3(0,2.84,0));
    const reach=camera.position.distanceTo(eye);
    closest=Math.min(closest,reach);
    // The first frame arrives from nowhere and is exempt; after that, how far
    // the view closes in during a single frame is the whole complaint. It used
    // to assign the shorter distance outright, so walking up to anything
    // snapped the lens towards the back of the avatar's head in one frame.
    if(previousReach!==undefined) biggestZoomStep=Math.max(biggestZoomStep,Math.abs(reach-previousReach));
    previousReach=reach;
    assert.ok(world.cameraClearReach(eye,camera.position)>=eye.distanceTo(camera.position)-.35,
      `camera passed through the wall at frame ${frame}`);
  }
  /**
   * A deliberate trade, not an oversight.
   *
   * Easing the lens along an *arc* about the avatar, and clamping its distance
   * on the ray it was actually travelling, cut this to 0.183. But moving the
   * lens angularly is precisely what turns the view when `lookAt` re-aims it
   * every frame, and the owner reported the result as the rotation drifting and
   * being less steady than it had been. Rotation stability was asked for three
   * times running; a third of a unit of distance, occasionally, was not
   * complained about once.
   *
   * So the straight interpolation is back and this is 0.337 again. If it is
   * ever worth attacking, the cause is the limit cycle described in the camera
   * code — the eased distance measured towards the *target* sits longer than
   * the line the lens is really on — and the fix has to be one that does not
   * move the lens sideways to get it.
   */
  assert.ok(biggestZoomStep<0.35,`the view closed in ${biggestZoomStep.toFixed(3)} in a single frame`);
  // Not so close that the lens is inside the head. Below 1.4 the avatar is
  // faded out, so that is the floor worth holding rather than a comfortable
  // shoulder distance.
  assert.ok(closest>1.4,`camera reached ${closest.toFixed(2)} units from the face`);
});

test('an authorized direct film fills and releases the immersive theater quad',async()=>{
  const originalCreate=document.createElement;
  const originalWindow=globalThis.window;
  const listeners=new Map();
  const video={readyState:1,currentTime:0,duration:90,volume:1,muted:true,src:'',
    playsInline:false,paused:false,
    addEventListener(name,listener){listeners.set(name,listener);},
    play(){this.paused=false;return Promise.resolve();},
    pause(){this.paused=true;},removeAttribute(name){if(name==='src')this.src='';},load(){},
  };
  document.createElement=(tag)=>tag==='video'?video:originalCreate(tag);
  globalThis.window={location:{href:'https://beta.example.test/'}};
  try {
    const world=Object.create(FestivalWorld.prototype);
    const projector={xrPoster:new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial()),muted:true,
      pending:{film:{title:'Test film'},offsetSeconds:27,reloadToken:''}};
    const durations=[];
    Object.assign(world,{projectors:new Map([['shore',projector]]),
      refreshXrPoster(){},onProjectorDuration:(...args)=>durations.push(args)});
    world.startImmersiveVideo('shore',{
      id:'test-film',title:'Test film',youtubeId:'test1234567',immersiveUrl:'https://media.example.test/film.mp4',
    },27);
    assert.equal(video.src,'https://media.example.test/film.mp4');
    listeners.get('loadedmetadata')();
    assert.equal(video.currentTime,27,'the shared programme offset must be used');
    assert.deepEqual(durations,[['shore','test1234567',90]]);
    listeners.get('loadeddata')();
    assert.ok(projector.xrPoster.material.map instanceof THREE.VideoTexture);
    world.stopImmersiveVideo('shore');
    assert.equal(video.paused,true);
    assert.equal(video.src,'');
    assert.equal(projector.xrPoster.material.map,null);
  } finally {
    document.createElement=originalCreate;
    globalThis.window=originalWindow;
  }
});

test('both sides of an authored club facade retain the same concrete panel finish',()=>{
  const scene=new THREE.Scene(),base=new THREE.MeshStandardMaterial();
  const walls=[10,36].map(z=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),base);
    mesh.scale.set(.8,13,18);mesh.position.set(-20,6,z);
    mesh.userData.wornMasonryKind=1;scene.add(mesh);return mesh;
  });
  scene.updateMatrixWorld(true);applyWornStyle(scene);
  assert.equal(walls[0].material,walls[1].material);
  assert.equal(walls[0].material.defines.WORN_MASONRY_KIND,'1');
});

test('in a headset every Higgsfield body puts its hands on the controllers and takes its head off',()=>{
  const FEMALE_TOP='#2b1a1c';
  for(const [palette,swim] of [[{},false],[{},true],[{top:FEMALE_TOP},false],[{top:FEMALE_TOP},true]]){
    const {root,rig}=importedCharacter({...palette,cap:'#303030'});
    if(swim)setCoastalSwimwear(root,true);
    const scene=new THREE.Scene();scene.add(root);
    walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);root.updateMatrixWorld(true);
    const head=rig.head.getWorldPosition(new THREE.Vector3());
    const mouth=rig.head.localToWorld(root.userData.importedMouth.clone());
    const forward=mouth.clone().sub(head).setY(0).normalize();
    const camera=new THREE.PerspectiveCamera();camera.position.copy(head);camera.lookAt(head.clone().add(forward));camera.updateMatrixWorld(true);
    const controllers=[],targets={};
    for(const hand of ['left','right']){
      // The visitor's left hand drives the model's mirrored-name right arm.
      const shoulder=(hand==='left'?rig.rightArm:rig.leftArm).getWorldPosition(new THREE.Vector3());
      targets[hand]=shoulder.clone().addScaledVector(forward,.5).add(new THREE.Vector3(0,-.3,0));
      const controller=new THREE.Group();controller.position.copy(targets[hand]);controller.userData.inputSource={handedness:hand};
      scene.add(controller);controllers.push(controller);
    }
    const world=Object.create(FestivalWorld.prototype);
    const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),M=()=>new THREE.Matrix4();
    Object.assign(world,{
      playerRig:rig,player:root,xrControllers:controllers,xrHands:[],xrHandPoses:{left:null,right:null},xrHandSampleAt:{left:0,right:0},xrArmsShown:false,xrHiddenParts:[],leftSwing:{readyAt:0},rightSwing:{readyAt:0},
      armWorld:V(),armSwing:V(),armLocal:V(),armAxisX:V(),armAxisY:V(),armAxisZ:V(),armBasis:M(),headForward:V(),armTarget:V(),armMeasured:V(),armWanted:V(),
      armCalibration:new Map(),armCalibratePending:false,armQuat:Q(),armParentQuat:Q(),armMeasuredQuat:Q(),armDesiredQuat:Q(),armMatrix:M(),armVecA:V(),armVecB:V(),armVecC:V(),
      xrSpineTwist:0,skating:false,renderer:{xr:{getCamera:()=>camera}},onAction(){},punchFromTouch(){},
    });
    let inHeadset=true;world.paintsInHeadset=()=>inHeadset;
    world.updateXrArms();syncImportedAvatars(root);
    const label=`${palette.top?'female':'male'}${swim?' swimwear':''}`;
    for(const hand of ['left','right']){
      const wrist=rig.visualRoot.localToWorld(root.userData.importedWrist(hand==='left'));
      const miss=wrist.distanceTo(targets[hand]);
      assert.ok(miss<.03,`${label} ${hand} wrist misses its controller by ${miss.toFixed(3)}`);
      // The arm reaches forward, on its own side: not crossed over the chest.
      const side=wrist.clone().sub(head).dot(new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)));
      const wanted=targets[hand].clone().sub(head).dot(new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)));
      assert.ok(Math.sign(side)===Math.sign(wanted),`${label} ${hand} arm crossed over`);
    }
    const caps=root.userData.importedAvatar.meshes.filter(m=>['cap','cap-logo'].includes(m.userData.componentId));
    assert.equal(root.userData.importedAvatar.headHidden,true,`${label}: the head stays on in the headset`);
    assert.ok(caps.every(m=>!shown(m)),`${label}: the cap stays on in the headset`);
    assert.ok(shown(bodyMesh(root)),`${label}: the body went with the head`);
    inHeadset=false;world.updateXrArms();
    assert.equal(root.userData.importedAvatar.headHidden,false,`${label}: the head is not put back`);
    assert.ok(caps.some(m=>shown(m)),`${label}: the cap is not put back`);
  }
});
test('bare hands in a headset: the wrist, its turn and every finger follow the tracked hand',()=>{
  const {root,rig}=importedCharacter();
  const scene=new THREE.Scene();scene.add(root);
  walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);root.updateMatrixWorld(true);
  const head=rig.head.getWorldPosition(new THREE.Vector3());
  const mouth=rig.head.localToWorld(root.userData.importedMouth.clone());
  const forward=mouth.clone().sub(head).setY(0).normalize(),up=new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(forward,up);
  const camera=new THREE.PerspectiveCamera();camera.position.copy(head);camera.lookAt(head.clone().add(forward));camera.updateMatrixWorld(true);
  // A hand held out palm down, fingers forward, curled 0.9 at every finger joint.
  const lanes={Thumb:.05,Index:.03,Middle:.01,Ring:-.01,Pinky:-.03};
  const names={Thumb:['thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'],
   Index:['index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip'],
   Middle:['middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip'],
   Ring:['ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip'],
   Pinky:['pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip']};
  const controllers=[],hands=[],wrists={};
  for(const hand of ['left','right']){
    const shoulder=(hand==='left'?rig.rightArm:rig.leftArm).getWorldPosition(new THREE.Vector3());
    const wrist=shoulder.clone().addScaledVector(forward,.45).add(new THREE.Vector3(0,-.25,0));wrists[hand]=wrist;
    // The thumb is on the inside: toward the body's middle.
    const thumbward=right.clone().multiplyScalar(hand==='right'?-1:1);
    const space=new THREE.Group();space.joints={};
    const joint=(name,p)=>{const j=new THREE.Group();j.position.copy(p);j.visible=true;space.add(j);space.joints[name]=j;};
    joint('wrist',wrist);
    for(const [n,lane] of Object.entries(lanes)){
      let p=wrist.clone().addScaledVector(forward,n==='Thumb'?.03:.09).addScaledVector(thumbward,lane),dir=forward.clone();
      joint(names[n][0],p);
      // Each joint turns the finger further down, toward the palm.
      const bendAxis=forward.clone().cross(new THREE.Vector3(0,-1,0)).normalize();
      for(let i=1;i<4;i++){if(n!=='Thumb')dir.applyAxisAngle(bendAxis,.9);p=p.clone().addScaledVector(dir,.03);joint(names[n][i],p);}
    }
    scene.add(space);hands.push(space);
    const controller=new THREE.Group();controller.position.copy(wrist).addScaledVector(forward,.1);controller.userData.inputSource={handedness:hand,hand:{}};
    scene.add(controller);controllers.push(controller);
  }
  scene.updateMatrixWorld(true);
  const world=Object.create(FestivalWorld.prototype);
  const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),M=()=>new THREE.Matrix4();
  Object.assign(world,{
    playerRig:rig,player:root,xrControllers:controllers,xrHands:hands,xrHandPoses:{left:null,right:null},xrHandSampleAt:{left:0,right:0},xrArmsShown:false,xrHiddenParts:[],leftSwing:{readyAt:0},rightSwing:{readyAt:0},
    armWorld:V(),armSwing:V(),armLocal:V(),armAxisX:V(),armAxisY:V(),armAxisZ:V(),armBasis:M(),headForward:V(),armTarget:V(),armMeasured:V(),armWanted:V(),
    armCalibration:new Map(),armCalibratePending:false,armQuat:Q(),armParentQuat:Q(),armMeasuredQuat:Q(),armDesiredQuat:Q(),armMatrix:M(),armVecA:V(),armVecB:V(),armVecC:V(),
    xrSpineTwist:0,skating:false,renderer:{xr:{getCamera:()=>camera}},onAction(){},punchFromTouch(){},
  });
  world.paintsInHeadset=()=>true;
  const body=bodyMesh(root);
  const tipsOf=hand=>{const side=hand==='left'?'Left':'Right';root.updateMatrixWorld(true);
    return ['Index','Middle','Ring','Pinky'].map(n=>body.skeleton.bones.find(b=>b.name===side+'Hand'+n+'4').getWorldPosition(new THREE.Vector3()));};
  syncImportedAvatars(root);
  for(let frame=0;frame<12;frame++){world.updateXrArms();syncImportedAvatars(root);}
  for(const hand of ['left','right']){
    const landed=rig.visualRoot.localToWorld(root.userData.importedWrist(hand==='left'));
    assert.ok(landed.distanceTo(wrists[hand])<.03,`${hand}: the wrist goes to the tracked wrist, not the ray: ${landed.distanceTo(wrists[hand]).toFixed(3)}`);
    const frame=root.userData.importedHandFrame(hand==='left');
    const fingers=frame.fingers.clone().applyQuaternion(rig.visualRoot.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(fingers.dot(forward)>.75,`${hand}: the hand points where the tracked hand points: ${fingers.dot(forward).toFixed(2)}`);
    const pose=world.xrHandPoses[hand];assert.ok(pose&&pose.Middle.curl[1]>.6,`${hand}: the curl is read`);
    const curled=tipsOf(hand).map(t=>t.distanceTo(landed));
    root.userData.setImportedHandPose(hand==='left',null);syncImportedAvatars(root);
    const open=tipsOf(hand).map(t=>t.distanceTo(landed));
    curled.forEach((d,i)=>assert.ok(d<open[i]*.92,`${hand} finger ${i} curls with the tracked one: ${d.toFixed(3)} vs ${open[i].toFixed(3)}`));
  }
});
test('the desktop preview puts the webcam body on the avatar: arms, wrists, fingers, chest and legs',()=>{
  for (const top of ['#18191b','#28191b']) {
  const {root,rig}=importedCharacter({top});
  const scene=new THREE.Scene();scene.add(root);
  walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);root.updateMatrixWorld(true);
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  const up=new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(forward,up);
  // World directions to the camera's axes (x right of the picture, y down, z away): the visitor faces the lens.
  const cam=v=>({x:-v.dot(right),y:-v.dot(up),z:-v.dot(forward),visibility:1});
  const W=(r,u,f)=>right.clone().multiplyScalar(r).addScaledVector(up,u).addScaledVector(forward,f);
  const pose=Array.from({length:33},()=>cam(W(0,.3,0)));
  const put=(i,v)=>{pose[i]=cam(v);};
  put(11,W(-.18,.45,0));put(12,W(.18,.45,0));            // left, right shoulder
  put(13,W(-.21,.2,0));put(15,W(-.22,-.05,0));           // left arm hanging
  put(14,W(.18,.45,.28));put(16,W(.18,.45,.55));          // right arm straight out in front
  put(23,W(-.1,0,0));put(24,W(.1,0,0));put(25,W(-.1,-.42,0));put(26,W(.1,-.42,0));put(27,W(-.1,-.82,0));put(28,W(.1,-.82,0));
  // The right hand: pointing forward, palm down, every finger curled 0.9 a joint.
  const hand=[W(0,0,0)],lanes=[.05,.03,.01,-.01,-.03];
  const bendAxis=forward.clone().cross(new THREE.Vector3(0,-1,0)).normalize();
  lanes.forEach((lane,f)=>{let p=W(-lane,0,f===0?.03:.09),dir=forward.clone();hand.push(p);
    for(let i=1;i<4;i++){if(f)dir.applyAxisAngle(bendAxis,.9);p=p.clone().addScaledVector(dir,.03);hand.push(p);}});
  const tracker=new HeadTracking();tracker.startForReview();
  const world=Object.create(FestivalWorld.prototype);
  const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),M=()=>new THREE.Matrix4();
  Object.assign(world,{
    playerRig:rig,player:root,xrActive:true,xrSimulated:true,headTracking:tracker,headTrackingActive:true,
    moveVector:V(),airborne:false,playerState:'walking',trackedBodyShown:false,trackedHiddenParts:[],trackedLandmarks:[],trackedArms:{left:false,right:false},xrHandPoses:{left:null,right:null},xrHandSampleAt:{left:0,right:0},
    armWorld:V(),armSwing:V(),armLocal:V(),armAxisX:V(),armAxisY:V(),armAxisZ:V(),armBasis:M(),headForward:V(),armTarget:V(),armMeasured:V(),armWanted:V(),
    armQuat:Q(),armParentQuat:Q(),armMeasuredQuat:Q(),armDesiredQuat:Q(),armMatrix:M(),armVecA:V(),armVecB:V(),armVecC:V(),
    footSurfaceAt:()=>0,
  });
  const shoulderR=rig.leftArm.getWorldPosition(new THREE.Vector3()),shoulderL=rig.rightArm.getWorldPosition(new THREE.Vector3());
  for(let frame=0;frame<30;frame++){
    walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);
    tracker.feedBodyForReview(pose,{right:hand.map(cam)},performance.now());
    world.updateTrackedBody(1/30);syncImportedAvatars(root);
  }
  assert.equal(root.userData.importedAvatar.headHidden,true,'seen from inside: no head');
  assert.equal(root.visible,true,'the body is shown in the preview');
  // The visitor's right is the model's Right, driven through the rig's mirrored left arm.
  const wristR=rig.visualRoot.localToWorld(root.userData.importedWrist(false)),wristL=rig.visualRoot.localToWorld(root.userData.importedWrist(true));
  assert.ok(wristR.clone().sub(shoulderR).dot(forward)>.5,`the right arm reaches forward: ${wristR.clone().sub(shoulderR).dot(forward).toFixed(2)}`);
  assert.ok(Math.abs(wristR.y-shoulderR.y)<.35,`at shoulder height: ${(wristR.y-shoulderR.y).toFixed(2)}`);
  assert.ok(wristL.y<shoulderL.y-.8,`the left arm hangs: ${(wristL.y-shoulderL.y).toFixed(2)}`);
  const pose0=world.xrHandPoses.right;assert.ok(pose0&&pose0.Middle.curl[1]>.6,'the right hand\'s curl is read');
  // Asked to stop: everything handed back.
  tracker.setBodyTracking(false);world.updateTrackedBody(1/30);
  assert.equal(root.userData.importedAvatar.headHidden,false,'the head comes back');
  assert.equal(world.xrHandPoses.right,null,'the hand is let go');
  }
});
test('Quest stick forward uses current headset heading plus snap turn, never the stale XR camera',()=>{
 const world=Object.create(FestivalWorld.prototype),camera=new THREE.PerspectiveCamera();
 Object.assign(world,{xrActive:true,xrSimulated:false,xrSession:{inputSources:[{handedness:'left',gamepad:{axes:[0,0,0,-1],buttons:[]}}]},xrMovementView:camera,playerState:'walking',xrSnapReady:true,xrTeleportReady:true,xrJumpReady:true});
 world.movePlayer=(x,y,distance,view)=>{assert.equal(x,0);assert.equal(y,-1);const actual=view.getWorldDirection(new THREE.Vector3());const expected=new THREE.Vector3(-Math.sin(world.xrYaw+world.xrHeadHeading),0,-Math.cos(world.xrYaw+world.xrHeadHeading));assert.ok(actual.distanceTo(expected)<1e-8);};
 world.renderer={xr:{getCamera(){throw Error('reference-space camera is stale before render');}}};
 for(const yaw of [0,.5,Math.PI,-Math.PI/2])for(const head of [0,.3,-1.1]){world.xrYaw=yaw;world.xrHeadHeading=head;world.updateXrInput(1/72);}
});

test('venue relocation moves solids and seat foot support with the model, leaving projector world coordinates intact',()=>{
 const world=Object.create(FestivalWorld.prototype),scene=new THREE.Scene(),poster=new THREE.Mesh(),seat=new THREE.Vector3(35,0,-20),collider={minX:34,maxX:36,minZ:-21,maxZ:-19,minY:.1,maxY:2.16,viewTop:2.16};
 Object.assign(world,{scene,projectors:new Map([['drive-in',{xrPoster:poster}]]),seats:[],colliders:[]});
 let car;
 world.buildOnGrade(()=>{car=new THREE.Group();car.position.set(35,.1,-20);scene.add(car,poster);world.seats.push({position:seat,footFloor:.4});world.colliders.push(collider);},-.8,-35,-10);
 assert.deepEqual(car.position.toArray(),[0,-.7000000000000001,-30]);assert.deepEqual(seat.toArray(),[0,-.8,-30]);assert.equal(world.seats[0].footFloor,-.4);assert.equal(collider.minX,-1);assert.equal(collider.minZ,-31);assert.equal(collider.minY,-.7000000000000001);assert.deepEqual(poster.position.toArray(),[0,0,0]);
});

test('walking is steered by the orbit the visitor set, never by where the lens ended up',()=>{
  // The fault this guards is a feedback loop, and it made leaving SLAP AND POP
  // impossible: movement read the *rendered* camera's facing, which `lookAt`
  // derives from wherever the lens has been moved to. So a step moved the
  // avatar, the lens was repositioned around it — pulled in by clearance, eased,
  // or jumped when the club's confinement swapped the look target for one 2.2
  // units away — the facing turned, "forward" turned with it, and the next step
  // went somewhere slightly different. Near a doorway that is a circle.
  const step=(cameraPosition)=>{
    const world=Object.create(FestivalWorld.prototype);
    const player=new THREE.Group();player.position.set(0,.28,0);
    Object.assign(world,{player,camera:new THREE.PerspectiveCamera(),cameraMode:'follow',
      cameraDirection:new THREE.Vector3(),moveVector:new THREE.Vector3(),
      cameraOrbit:{follow:{yaw:0,pitch:.3},perspective:{yaw:.8,pitch:.4}},
      colliders:[],groundHeightAt:()=>0,airborne:false,playerState:'walking',
      npcs:[],remoteAvatars:new Map(),seats:[],occupiedSeats:new Set()});
    world.camera.position.set(...cameraPosition);
    // Aimed at the follow mode's own look target, which is offset in world Z —
    // so the facing genuinely differs from the orbit by a different amount from
    // each of these positions.
    world.camera.lookAt(new THREE.Vector3(0,1.4,-2.2));
    world.movePlayer(0,-1,0.1);
    return [Number(world.player.position.x.toFixed(6)),Number(world.player.position.z.toFixed(6))];
  };
  const taken=[step([0,5,-10]),step([9,5,4]),step([-9,5,4]),step([0,2,-2])];
  for(const position of taken){
    assert.deepEqual(position,taken[0],
      `the same orbit gave a different step from a different lens position: ${JSON.stringify(taken)}`);
  }
  // And it is the orbit's own heading: yaw 0 means the camera sits behind and
  // looks along -Z, so forward is -Z.
  assert.equal(taken[0][0],0,'forward drifted sideways');
  assert.ok(taken[0][1]<0,'forward should advance along -Z at yaw 0');
});

test('the avatar stays put on screen however far the camera is turned',()=>{
  // The look target carried a fixed `z - 2.2` lead in *world* space, so that the
  // view sits a little ahead of the body and you can see where you are going.
  // At yaw zero that offset is directly ahead and the framing is the one it was
  // drawn for. Turn ninety degrees and the same offset is entirely sideways, so
  // the view is aimed at a patch of ground beside the avatar and the avatar
  // slides to the edge of the frame — further the more you had turned.
  const onScreen=(yaw)=>{
    const world=Object.create(FestivalWorld.prototype);
    const player=new THREE.Group();player.position.set(0,.28,0);
    const camera=new THREE.PerspectiveCamera(58,16/9,.1,300);camera.position.set(0,5,10);
    Object.assign(world,{player,camera,lookTarget:new THREE.Vector3(),cameraProbe:new THREE.Vector3(),
      cameraMode:'follow',cameraZoom:1,cameraReach:0,playerState:'walking',cameraScratch:new THREE.Vector3(),
      cameraFollowY:Number.NaN,cameraFloorY:Number.NaN,
      cameraArcPivot:new THREE.Vector3(),cameraArcFrom:new THREE.Vector3(),cameraArcTo:new THREE.Vector3(),
      clubAvoidance:{side:0,offset:0},wallAvoidance:{side:0,offset:0},
      cameraOrbit:{follow:{yaw,pitch:Math.atan2(3.4,10)},perspective:{yaw:.8,pitch:.4}},
      colliders:[],groundHeightAt:()=>0,confineCameraToClub(){},confineCameraOverWater(){},
      settlePunchImpact(){},applyCameraShake(){},applyDrunkenView(){}});
    for(let frame=0;frame<400;frame+=1)world.updateCamera(1/60,frame/60);
    camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
    return new THREE.Vector3(player.position.x,player.position.y+1.5,player.position.z).project(camera);
  };
  const straightOn=onScreen(0);
  // Slightly low in frame, which is the lead doing its job, and dead centre.
  assert.ok(Math.abs(straightOn.x)<1e-6,`not centred even at yaw 0: ${straightOn.x}`);
  assert.ok(straightOn.y<0,'the lead should put the body a little below centre');
  for(const yaw of [Math.PI/4,Math.PI/2,Math.PI,-Math.PI/2,2.3,-2.9]){
    const turned=onScreen(yaw);
    assert.ok(Math.abs(turned.x-straightOn.x)<1e-6,
      `turning to ${(yaw*180/Math.PI).toFixed(0)}° moved the avatar sideways to ${turned.x.toFixed(3)}`);
    assert.ok(Math.abs(turned.y-straightOn.y)<1e-6,
      `turning to ${(yaw*180/Math.PI).toFixed(0)}° moved the avatar vertically to ${turned.y.toFixed(3)}`);
  }
});

test('in a headset the avatar walks where the view points, not where the orbit does',()=>{
  // The counterpart to the test above, and the fault it guards was caused by
  // that one's fix. On a flat screen the orbit's yaw is the heading, because the
  // rendered camera's facing drifts as the lens is moved about. In a headset —
  // including the phone preview — `updateCamera` hands the camera to the XR rig
  // and builds its orientation from `xrYaw` and the gyroscope, so *there* the
  // camera's own direction is the authority and the orbit is stale. Taking the
  // orbit's yaw in that mode walks the avatar somewhere other than where the
  // phone is pointing.
  const stepTaken=(xrActive,cameraYaw)=>{
    const world=Object.create(FestivalWorld.prototype);
    const player=new THREE.Group();player.position.set(0,.28,0);
    const camera=new THREE.PerspectiveCamera();
    Object.assign(world,{player,camera,cameraMode:'follow',xrActive,
      cameraDirection:new THREE.Vector3(),moveVector:new THREE.Vector3(),
      // Deliberately nothing like the camera's heading, so the two are telling.
      cameraOrbit:{follow:{yaw:0,pitch:.3},perspective:{yaw:.8,pitch:.4}},
      colliders:[],groundHeightAt:()=>0,airborne:false,playerState:'walking',
      npcs:[],remoteAvatars:new Map(),seats:[],occupiedSeats:new Set()});
    camera.position.set(0,3,0);
    camera.rotation.order='YXZ';
    camera.rotation.set(0,cameraYaw,0);
    camera.updateMatrixWorld(true);
    world.movePlayer(0,-1,0.1);
    return world.player.position.clone();
  };
  // The phone is turned a quarter circle from the orbit. In a headset the step
  // must follow the phone; on a flat screen it must follow the orbit.
  const inHeadset=stepTaken(true,Math.PI/2);
  const onScreen=stepTaken(false,Math.PI/2);
  assert.ok(Math.abs(inHeadset.x)>0.09 && Math.abs(inHeadset.z)<0.01,
    `a headset should walk along the view: got ${inHeadset.toArray().map((v)=>v.toFixed(3))}`);
  assert.ok(Math.abs(onScreen.z)>0.09 && Math.abs(onScreen.x)<0.01,
    `a flat screen should walk along the orbit: got ${onScreen.toArray().map((v)=>v.toFixed(3))}`);
});

test('the camera sits on its orbit and does not wobble along behind',()=>{
  // The jelly, and the drift, were one thing: the lens was eased towards its
  // orbit position at about eight percent a frame, so it never arrived. It
  // trailed the avatar by an amount that depended on how fast the avatar was
  // moving, swung when that changed, and settled afterwards — and because
  // `lookAt` re-aims from wherever it has trailed to, every bit of that lag
  // came out as the view turning. Placed exactly, the facing is the orbit's and
  // nothing else can move it.
  const ramp=(x,z)=> z<0?0 : z>6?3 : z*0.5;
  const walk=(colliders,ground)=>{
    const world=Object.create(FestivalWorld.prototype);
    const player=new THREE.Group();
    const camera=new THREE.PerspectiveCamera();camera.position.set(0,5,-9);
    Object.assign(world,{player,camera,lookTarget:new THREE.Vector3(),cameraProbe:new THREE.Vector3(),
      cameraMode:'follow',cameraZoom:1,cameraReach:0,playerState:'walking',cameraScratch:new THREE.Vector3(),
      clubAvoidance:{side:0,offset:0},wallAvoidance:{side:0,offset:0},
      cameraOrbit:{follow:{yaw:.6,pitch:Math.atan2(3.4,10)},perspective:{yaw:.8,pitch:.4}},
      colliders,groundHeightAt:ground,confineCameraToClub(){},confineCameraOverWater(){},
      settlePunchImpact(){},applyCameraShake(){},applyDrunkenView(){}});
    const direction=new THREE.Vector3();
    let previousDirection,previousCamera,previousPlayer,worstTurn=0,worstWobble=0;
    for(let frame=0;frame<400;frame+=1){
      const z=-3+frame*0.03;
      player.position.set(0,0.28+ground(0,z),z);
      world.updateCamera(1/60,frame/60);
      camera.getWorldDirection(direction);
      if(previousDirection&&frame>=25){
        worstTurn=Math.max(worstTurn,direction.angleTo(previousDirection));
        // The camera's own movement, with the avatar's taken out. Rigidly
        // attached, this is zero.
        worstWobble=Math.max(worstWobble,camera.position.clone().sub(previousCamera)
          .sub(player.position.clone().sub(previousPlayer)).length());
      }
      previousDirection=direction.clone();
      previousCamera=camera.position.clone();
      previousPlayer=player.position.clone();
    }
    return {worstTurn,worstWobble};
  };
  const walls=[{minX:-4,maxX:-1.3,minZ:-6,maxZ:12,minY:-1,maxY:14},
               {minX:1.3,maxX:4,minZ:-6,maxZ:12,minY:-1,maxY:14}];
  for(const [label,result] of [
    ['flat ground',walk([],()=>0)],
    ['up a ramp',walk([],ramp)],
    ['a ramp between walls',walk(walls,ramp)],
  ]){
    assert.ok(result.worstTurn<1e-6,
      `walking ${label} turned the view by ${THREE.MathUtils.radToDeg(result.worstTurn).toExponential(2)} degrees in a frame`);
    assert.ok(result.worstWobble<1e-9,
      `walking ${label} moved the camera ${result.worstWobble.toExponential(2)} of its own accord`);
  }
});

/** A private screening borrows a venue's screen and must give it back. */
const privateWorld=()=>{
  const world=Object.create(FestivalWorld.prototype);
  const started=[],stopped=[],panels=[];
  world.projectors=new Map([['shore',{pending:undefined,xrPoster:{visible:false}}]]);
  world.privateScreening=undefined;world.privateVenue=undefined;world.privatePanel=undefined;
  world.xrActive=true;world.xrSimulated=false;
  world.projectorVenue=()=>world.fakeVenue;
  world.fakeVenue='shore';
  world.startImmersiveVideo=(venue,film,offset)=>started.push([venue,film.id,Math.round(offset)]);
  world.stopImmersiveVideo=(venue)=>stopped.push(venue);
  world.releaseProjector=()=>{};
  world.refreshXrPoster=()=>{};
  world.startPrivatePanel=()=>panels.push(world.privateScreening?.film.id);
  return {world,started,stopped,panels};
};
const PUBLIC_A={id:'pub-a',title:'PUBLIC A',embedUrl:'https://x/a',youtubeId:'pa'};
const PUBLIC_B={id:'pub-b',title:'PUBLIC B',embedUrl:'https://x/b',youtubeId:'pb'};
const PRIVATE={id:'skibidi',title:'SKIBIDI',youtubeId:'jiawzYgfkuI',immersiveUrl:'https://x/s.mp4'};

test('a private film takes the venue screen',()=>{
  const {world,started}=privateWorld();
  world.setPublicScreening('shore',PUBLIC_A,12,'t1');
  started.length=0;
  world.setPrivateScreening(PRIVATE,0);
  assert.equal(world.privateVenue,'shore');
  assert.ok(started.some(([v,id])=>v==='shore'&&id==='skibidi'),'it goes up on the wall');
});

test('the programme cannot interrupt a private screening, but is still recorded',()=>{
  const {world,started}=privateWorld();
  world.setPublicScreening('shore',PUBLIC_A,12,'t1');
  world.setPrivateScreening(PRIVATE,0);
  started.length=0;
  world.setPublicScreening('shore',PUBLIC_B,40,'t2');
  assert.deepEqual(started,[],'the festival must not cut across what you chose');
  assert.equal(world.projectors.get('shore').pending.film.id,'pub-b','but it keeps arriving');
});

test('giving the screen back shows where the festival has got to, not where it was',()=>{
  const {world,started}=privateWorld();
  world.setPublicScreening('shore',PUBLIC_A,12,'t1');
  world.setPrivateScreening(PRIVATE,0);
  world.setPublicScreening('shore',PUBLIC_B,40,'t2');
  started.length=0;
  world.setPrivateScreening(undefined);
  assert.equal(world.privateVenue,undefined);
  assert.ok(started.some(([v,id])=>v==='shore'&&id==='pub-b'),'the newer public film goes back up');
});

test('carrying a private film out of the cinema moves it to the personal panel',()=>{
  const {world,started,panels}=privateWorld();
  world.setPrivateScreening(PRIVATE,0);
  assert.equal(world.privateVenue,'shore');
  started.length=0;
  world.fakeVenue=undefined;           // walked out of the room
  world.applyPrivateScreening();
  assert.equal(world.privateVenue,undefined,'the wall is given back');
  assert.deepEqual(panels,['skibidi'],'and it follows you on the panel');
});

test('a YouTube-only film is never put on a surface in the world',()=>{
  const {world,started,panels}=privateWorld();
  world.setPrivateScreening({id:'yt',title:'YT ONLY',youtubeId:'abc'},0);
  assert.equal(world.privateVenue,undefined);
  assert.deepEqual(started,[]);
  assert.deepEqual(panels,[]);
});


test('the rooftop band sits by the fire, plays the record at their marks, and goes back',async()=>{
 const files={};
 for(const name of [...BAND_MEMBERS,'stage','bonfire']){const b=await readFile(`src/assets/band/${name}.glb`);files[name]=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
 const stage={x:40,y:7,z:12.2,yaw:Math.PI},fire={x:53.5,y:7,z:15.6,yaw:Math.PI/2};
 const band=new RooftopBand(stage,fire);await band.load(files);
 for(const member of band.musicians){
  assert.equal(member.actions.walk.getClip().duration,1,'walk clip uses the intended 30 fps');
  assert.equal(member.actions.play.getClip().duration,16,'eight bars at 120 bpm take sixteen seconds');
  assert.equal(member.actions.sit.getClip().duration,16,'seated clip retains its authored duration');
 }
 const at=()=>band.snapshot();
 assert.deepEqual(at().map(m=>m.state),['seated','seated','seated','seated']);
 assert.ok(at().every(m=>!m.carrying),'instruments stay on the stage while they sit');
 const nearFire=m=>Math.hypot(m.x-fire.x,m.z-fire.z);
 const run=seconds=>{for(let t=0;t<seconds;t+=1/30){band.update(1/30,t);
  const people=at();
  for(const m of people)assert.ok(nearFire(m)>1.1*3.42/1.7*.55,`${m.name} walked through the fire`);
  for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){
   const a=people[i],b=people[j],d=Math.hypot(a.x-b.x,a.z-b.z);
   assert.ok(d>.98,`${a.name} overlaps ${b.name}: ${d.toFixed(3)}`);
  }
  const benches=[];band.group.updateMatrixWorld(true);
  band.group.traverse(o=>{if(o.userData.componentId==='bench')benches.push(new THREE.Box3().setFromObject(o));});
  for(const m of people.filter(m=>m.state==='walking'))for(const bench of benches){
   const dx=Math.max(bench.min.x-m.x,0,m.x-bench.max.x),dz=Math.max(bench.min.z-m.z,0,m.z-bench.max.z);
   assert.ok(Math.hypot(dx,dz)>.30,`${m.name} walks through a bench: ${Math.hypot(dx,dz)} at ${m.x.toFixed(2)},${m.z.toFixed(2)} bench x ${bench.min.x.toFixed(2)}..${bench.max.x.toFixed(2)} z ${bench.min.z.toFixed(2)}..${bench.max.z.toFixed(2)}`);
  }}};
 band.setPlaying(true);run(80);
 for(const m of at()){
  assert.equal(m.state,'playing',m.name);assert.equal(m.clip,'play');
  // In front of the screen's back (z 19.6) and behind the roof's front edge (z 8).
  assert.ok(m.z>8.5&&m.z<19,`${m.name} on the roof over the shop: ${m.z}`);
 }
 assert.ok(at().filter(m=>m.name!=='vocal').every(m=>m.carrying),'guitar, bass and sticks in hand');
 const drummer=at().find(m=>m.name==='drummer');assert.ok(drummer.y>7.3,'the drummer is up on the riser');
 band.setPlaying(false);run(80);
 assert.deepEqual(at().map(m=>m.state),['seated','seated','seated','seated']);
 assert.ok(at().every(m=>!m.carrying&&nearFire(m)<3.5),'back on the benches, instruments put down');
 // Changing the record during rising and walking must not reroute through furniture.
 for(const delay of [.45,4]){band.setPlaying(true);run(delay);band.setPlaying(false);run(80);assert.ok(at().every(m=>m.state==='seated'));}
});

test('both caps have the same proportions and his clears his eyes',async()=>{
 const meta=JSON.parse(await readFile('src/assets/avatars/avatars.json','utf8'));
 const rise=k=>meta[k].cap.top-meta[k].cap.band;
 // Sized to his curls it stood twice hers and came down over his eyes.
 assert.ok(rise('male')<rise('female')*1.7,`his crown ${rise('male').toFixed(3)} against hers ${rise('female').toFixed(3)}`);
 assert.ok(meta.male.cap.band>.5,`his band sits above his eyes (.47-.505): ${meta.male.cap.band}`);
});
test('shoes stand level: heel and toe meet the ground together',()=>{
 for(const top of ['#18191b','#28191b']){
  const {root,rig}=importedCharacter({top});walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);root.updateMatrixWorld(true);
  const shoes=shownMeshes(root).find(m=>m.userData.componentId==='garment-shoes');
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
  const p=shoes.geometry.getAttribute('position'),pts=[];
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);shoes.applyBoneTransform(i,v);pts.push(root.worldToLocal(shoes.localToWorld(v)));}
  for(const side of [-1,1]){
   const foot=pts.filter(v=>Math.sign(v.x)===side),along=foot.map(v=>v.dot(forward)),lo=Math.min(...along),hi=Math.max(...along);
   const lowIn=(a,b)=>Math.min(...foot.filter((v,i)=>along[i]>=a&&along[i]<=b).map(v=>v.y));
   const heel=lowIn(lo,lo+(hi-lo)*.3),toe=lowIn(lo+(hi-lo)*.7,hi);
   // Tipped toes-up by the foot bones, the toe stood 3-4 cm off the ground.
   assert.ok(toe-heel<.03,`${top} ${side} toe ${toe.toFixed(3)} against heel ${heel.toFixed(3)}`);
  }
 }
});

test('another visitor sees the tracked arms, fingers and chest as sent',()=>{
  // The sender: the desktop fixture's reading, arm out front, right hand curled.
  const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),M=()=>new THREE.Matrix4();
  const scratch=()=>({armWorld:V(),armSwing:V(),armLocal:V(),armAxisX:V(),armAxisY:V(),armAxisZ:V(),armBasis:M(),headForward:V(),armTarget:V(),armMeasured:V(),armWanted:V(),
    armQuat:Q(),armParentQuat:Q(),armMeasuredQuat:Q(),armDesiredQuat:Q(),armMatrix:M(),armVecA:V(),armVecB:V(),armVecC:V(),footSurfaceAt:()=>0});
  const a=importedCharacter(),b=importedCharacter();
  for(const {root,rig} of [a,b]){walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);root.updateMatrixWorld(true);}
  b.root.position.set(5,.28,3);b.root.rotation.y=1.1;b.root.updateMatrixWorld(true);
  const sender=Object.create(FestivalWorld.prototype);
  const camera=new THREE.PerspectiveCamera();camera.position.set(0,3,0);camera.lookAt(0,3,5);camera.updateMatrixWorld(true);
  Object.assign(sender,scratch(),{playerRig:a.rig,player:a.root,xrSimulated:true,camera,trackedTorso:[.2,.3],trackedLegs:undefined,
    trackedArms:{left:false,right:true},xrHandPoses:{left:null,right:{...FIST}}});
  const forward=new THREE.Vector3(0,0,1),target=a.rig.leftArm.getWorldPosition(new THREE.Vector3()).addScaledVector(forward,.5);
  sender.reachArm('right',target);syncImportedAvatars(a.root);
  const limbs=sender.limbsForNetwork();
  assert.ok(limbs&&limbs.r&&limbs.rf&&limbs.t&&limbs.h,'arm, fingers, chest and head are sent');
  assert.equal(limbs.l,undefined,'an untracked arm is not');
  // Over the wire: rounded to hundredths, as the service relays it.
  const wire=JSON.parse(JSON.stringify(limbs));
  const receiver=Object.create(FestivalWorld.prototype);
  Object.assign(receiver,scratch(),{playerRig:a.rig,player:a.root});
  const remote={group:b.root,rig:b.rig,limbsApplied:false};
  receiver.applyLimbs(remote,wire);syncImportedAvatars(b.root);
  const normalised=(root)=>{const arm=root.userData.importedArm(false),w=root.userData.importedWrist(false);return w.sub(arm.shoulder).divideScalar(arm.reach);};
  const sent=normalised(a.root),shown=normalised(b.root);
  assert.ok(sent.distanceTo(shown)<.06,`the arm lands the same way on the other body: ${sent.toArray().map(v=>v.toFixed(2))} vs ${shown.toArray().map(v=>v.toFixed(2))}`);
  const tip=(root)=>{const body=root.userData.importedAvatar.meshes.find(m=>m.userData.componentId==='body');root.updateMatrixWorld(true);
    return body.skeleton.bones.find(x=>x.name==='RightHandMiddle4').getWorldPosition(new THREE.Vector3()).distanceTo(body.skeleton.bones.find(x=>x.name==='RightHand').getWorldPosition(new THREE.Vector3()));};
  const curled=tip(b.root);
  receiver.applyLimbs(remote,undefined);syncImportedAvatars(b.root);
  assert.ok(curled<tip(b.root)*.75,'the fist arrives, and is let go when tracking stops');
});


test('both standing shoe soles are planted and separated for both bodies',()=>{
 for(const top of ['#18191b','#28191b']){
  const {root,rig}=importedCharacter({top});walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);
  const points=root.userData.importedSolePoints();
  const left=points.filter(p=>p.x<0),right=points.filter(p=>p.x>0);
  const heights=[left,right].map(p=>Math.min(...p.map(v=>v.y)));
  for(const sole of [left,right])assert.ok(Math.max(...sole.map(v=>v.y))-Math.min(...sole.map(v=>v.y))<.04,`sole plane tilted: ${top}`);
  assert.ok(heights.every(h=>Math.abs(h)<.002),`both soles meet floor: ${top}: ${heights}`);
  const gap=Math.min(...right.map(p=>p.x))-Math.max(...left.map(p=>p.x));
  assert.ok(gap>.04,`separate standing shoes: ${top}: gap ${gap}`);
 }
});

// Inspect the skin that is actually drawn in outfit 4: the same mesh also
// contains dressed-only feet, discarded by the swimwear shader.
function visibleBareFeet(root){
 const mesh=bodyMesh(root);mesh.skeleton.update();
 const ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),dressed=mesh.geometry.getAttribute('_dressed');
 return ['Left','Right'].map(side=>{
  const owned=mesh.skeleton.bones.map((b,i)=>b.name===side+'Foot'||b.name===side+'ToeBase'?i:-1).filter(i=>i>=0);
  const points=[];
  for(let v=0;v<ids.count;v++){
   let onFoot=0;for(let k=0;k<4;k++)if(owned.includes(ids.getComponent(v,k)))onFoot+=weights.getComponent(v,k);
   if(onFoot>.5&&(dressed?.getX(v)??0)<.5)points.push(mesh.localToWorld(mesh.getVertexPosition(v,new THREE.Vector3())));
  }
  return points;
 });
}
test('male swimwear plants the visible heels and forefeet on flat and sloping ground',()=>{
 const {root,rig}=importedCharacter({top:'#1b1c1e'});
 for(const floor of [()=>0,(x,z)=>.04*x+.035*z])for(const heading of [0,.9,2.2]){
  root.rotation.y=heading;walkCoastalPose(rig,0,0);supportCoastalPose(rig,floor);syncImportedAvatars(root);
  for(const foot of visibleBareFeet(root)){
   const local=foot.map(p=>root.worldToLocal(p.clone())),z0=Math.min(...local.map(p=>p.z)),length=Math.max(...local.map(p=>p.z))-z0;
   const clearance=foot.map(p=>p.y-floor(p.x,p.z));
   const heel=Math.min(...clearance.filter((_,i)=>local[i].z<z0+length*.2));
   const ball=Math.min(...clearance.filter((_,i)=>local[i].z>z0+length*.2&&local[i].z<z0+length*.8));
   assert.ok(heel>=-.002&&heel<.006,`heel floats at heading ${heading}: ${heel}`);
   assert.ok(ball>=-.002&&ball<.006,`forefoot floats at heading ${heading}: ${ball}`);
   assert.ok(Math.min(...clearance)>-.002,'the visible skin must not sink below the floor');
  }
 }
});
test('male barefoot walking supports the real skin and returning to shoes restores the original skeleton',()=>{
 const {root,rig}=importedCharacter();
 const stand=()=>{walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);};stand();
 const bones=bodyMesh(root).skeleton.bones;
 const snapshot=()=>bones.map(b=>[b.name,...b.position.toArray(),...b.quaternion.toArray()]);
 const shod=snapshot();
 for(let repeat=0;repeat<3;repeat++){
  root.userData.setImportedPalette({...BASE_PALETTE,top:'#1b1c1e'});
  for(let frame=0;frame<48;frame++){
   walkCoastalPose(rig,frame/48*Math.PI*2);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);
   const low=Math.min(...visibleBareFeet(root).flat().map(p=>p.y));
   assert.ok(low>-.006&&low<.003,`barefoot walk contact ${frame}: ${low}`);
  }
  root.userData.setImportedPalette(BASE_PALETTE);stand();
  assert.deepEqual(snapshot(),shod,'barefoot alignment must not accumulate or alter shod joints');
 }
});

test('desktop full-body eyes stay attached to the posed head instead of amplified parallax',()=>{
 for(const top of ['#18191b','#28191b']) {
  const {root,rig}=importedCharacter({top});const xrRig=new THREE.Group(),camera=new THREE.PerspectiveCamera();xrRig.add(camera);
  xrRig.position.set(3,.7,-4);root.position.copy(xrRig.position).add(new THREE.Vector3(0,.28,0));
  const tracker=new HeadTracking();tracker.startForReview();tracker.feedBodyForReview(Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1})),{},performance.now());
  const world=Object.create(FestivalWorld.prototype);Object.assign(world,{player:root,playerRig:rig,xrRig,camera,headTracking:tracker,headTrackingActive:true,xrActive:true,xrSimulated:true,trackedBodyShown:true});
  for(const yaw of [0,.9,2.6])for(const lean of [-.4,0,.4])for(const pitch of [-.4,0,.4]) {
   walkCoastalPose(rig,0,0);root.rotation.y=yaw;xrRig.rotation.y=yaw+1.3;
   rig.torso.rotation.set(lean,.3,.2);rig.head.rotation.set(-pitch,-.3,-.2);
   Object.assign(tracker.pose,{x:.15,y:.1,z:.12,pitch});
   world.applyHeadCoupledView();
   const eye=rig.head.localToWorld(new THREE.Vector3(0,2.84-rig.torso.position.y-rig.head.position.y,0));
   assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(eye)<1e-9,'camera detached from neck');
   assert.ok(camera.getWorldPosition(new THREE.Vector3()).distanceTo(rig.head.getWorldPosition(new THREE.Vector3()))<.75);
  }
 }
});

test('webcam palm pronation preserves the wrist endpoint and shares rotation with the forearm',()=>{
 for(const top of ['#18191b','#28191b'])for(const hand of ['left','right'])for(const angle of [-1.3,-.6,.6,1.3]) {
  const {root,rig}=importedCharacter({top});walkCoastalPose(rig,0,0);syncImportedAvatars(root);
  const frame=root.userData.importedHandFrame(hand==='left'),basis=rig.visualRoot.getWorldQuaternion(new THREE.Quaternion());
  const along=frame.fingers.clone().applyQuaternion(basis),thumb=frame.thumb.clone().applyQuaternion(basis);
  const axis=frame.forearm.clone().applyQuaternion(basis);const roll=new THREE.Quaternion().setFromAxisAngle(axis,angle);
  const targetAlong=along.clone().applyQuaternion(roll),targetThumb=thumb.clone().applyQuaternion(roll);
  const elbow=hand==='left'?rig.rightElbow:rig.leftElbow,wrist=hand==='left'?rig.rightWrist:rig.leftWrist;
  const oldElbow=elbow.quaternion.clone(),oldWrist=wrist.quaternion.clone();
  const at=rig.visualRoot.localToWorld(root.userData.importedWrist(hand==='left'));
  const world=Object.create(FestivalWorld.prototype);Object.assign(world,{player:root,playerRig:rig,armVecA:new THREE.Vector3(),armVecB:new THREE.Vector3(),armVecC:new THREE.Vector3(),armMatrix:new THREE.Matrix4(),armAxisX:new THREE.Vector3(),armAxisY:new THREE.Vector3(),armAxisZ:new THREE.Vector3(),armBasis:new THREE.Matrix4()});
  world.turnWrist(hand,targetAlong,targetThumb,rig,root,true);
  const landed=root.userData.importedHandFrame(hand==='left');
  assert.ok(landed.fingers.clone().applyQuaternion(basis).dot(targetAlong)>.99999);
  assert.ok(landed.thumb.clone().applyQuaternion(basis).dot(targetThumb)>.99999);
  assert.ok(rig.visualRoot.localToWorld(root.userData.importedWrist(hand==='left')).distanceTo(at)<1e-7,'pronation moved the hand');
  assert.ok(elbow.quaternion.angleTo(oldElbow)>Math.abs(angle)*.6,'forearm did not pronate');
  assert.ok(wrist.quaternion.angleTo(oldWrist)<Math.abs(angle)*.4,'all twist stayed in wrist');
 }
});

test('desktop webcam chest uses the calibrated screen heading through strafes and amplified head turns',()=>{
 const {root,rig}=importedCharacter();const tracker=new HeadTracking();tracker.startForReview();tracker.feedBodyForReview(Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1})),{},performance.now());
 const world=Object.create(FestivalWorld.prototype);Object.assign(world,{player:root,playerRig:rig,headTracking:tracker,headTrackingActive:true,xrActive:true,xrSimulated:true,playerState:'walking',skating:false,xrBodyOriented:false,xrChestHeading:0,xrHipOffset:0});
 world.isMentorControlLocked=()=>false;
 for(const yaw of [0,.7,-2.1])for(const head of [-1.2,.9])for(const travel of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
  world.xrBodyOriented=false;world.xrYaw=yaw;world.xrHeadHeading=head;world.travelHeading=yaw+Math.PI+travel;world.travelHeadingAt=performance.now();
  for(let k=0;k<90;k++)world.orientXrBody(1/60,performance.now());
  assert.ok(Math.abs(world.wrapAngle(root.rotation.y+world.xrSpineTwist-yaw-Math.PI))<1e-6,'chest followed travel or amplified head yaw');
 }
});

test('each tracked digit moves its own native joints on either avatar and restores rest exactly',()=>{
 for(const top of ['#18191b','#28191b'])for(const side of ['Left','Right']) {
  const {root,rig}=importedCharacter({top});walkCoastalPose(rig,0,0);syncImportedAvatars(root);
  const bones=new Map();root.traverse(o=>{if(o.isBone&&o.name.startsWith(side+'Hand'))bones.set(o.name,o);});
  const capture=()=>Object.fromEntries([...bones].map(([n,b])=>[n,b.quaternion.toArray()]));
  const rest=capture();
  const points={wrist:bones.get(side+'Hand').getWorldPosition(new THREE.Vector3()),fingers:{}};
  for(const n of FINGER_NAMES)points.fingers[n]=[1,2,3,4].map(k=>bones.get(side+'Hand'+n+k).getWorldPosition(new THREE.Vector3()));
  const relaxed=handPoseFromJoints(points,side==='Right');
  for(const name of FINGER_NAMES){
   const pose=structuredClone(relaxed);pose[name]={curl:[.5,.85,.6],spread:name==='Thumb'?.7:.2};
   root.userData.setImportedHandPose(side==='Left',pose);syncImportedAvatars(root);
   let moved=0;
   for(const [n,b] of bones){if(n.startsWith(side+'Hand'+name))moved+=b.quaternion.angleTo(new THREE.Quaternion().fromArray(rest[n]));else assert.ok(b.quaternion.toArray().every((v,i)=>Math.abs(v-rest[n][i])<1e-6),n+' moved with '+name);}
   assert.ok(moved>.2,name+' did not articulate');
   root.userData.setImportedHandPose(side==='Left',null);syncImportedAvatars(root);assert.deepEqual(capture(),rest,'tracking release did not restore fingers');
  }
 }
});

test('raised DJ platforms support native soles at their mesh tops in both venues',()=>{
 const world=Object.create(FestivalWorld.prototype);world.groundHeightAt=()=>.28;
 for(const [x,z,floor] of [[40,23.4,7.7],[-68,37.3,-.1]])for(const top of ['#18191b','#28191b']) {
  const {root,rig}=importedCharacter({top});root.position.set(x,floor+.28,z);
  const support=(x,z,y)=>world.footSurfaceAt(x,z,y);
  assert.ok(Math.abs(support(x,z,floor+.28)-floor)<1e-9);
  for(const seconds of [0,1,3,5,7]) {
   djCoastalPose(rig,seconds);supportCoastalPose(rig,support);syncImportedAvatars(root);
   const points=root.userData.importedSolePoints();
   assert.ok(Math.abs(Math.min(...points.map(p=>p.y))-floor)<.002,'soles under stage: '+Math.min(...points.map(p=>p.y)));
   assert.ok(points.every(p=>p.y>=floor-.002),'sole penetrates stage');
  }
 }
 assert.equal(world.footSurfaceAt(46,23.4,7.8),0,'roof stage footprint extended into deck');
 assert.equal(world.footSurfaceAt(-58,37.3,0),0,'club stage footprint extended into room');
});

test('tracked arms retain shoulder roll at straight-arm singularities without changing wrist reach',()=>{
 for(const hand of ['left','right']) {
  const {root,rig}=character();walkCoastalPose(rig,0,0);
  const world=Object.create(FestivalWorld.prototype),V=()=>new THREE.Vector3();
  Object.assign(world,{player:root,playerRig:rig,armWorld:V(),armLocal:V(),armTarget:V(),armMeasured:V(),armWanted:V(),armAxisX:V(),armAxisY:V(),armAxisZ:V(),armBasis:new THREE.Matrix4()});
  const shoulder=hand==='left'?rig.rightArm:rig.leftArm,wrist=hand==='left'?rig.rightWrist:rig.leftWrist;
  let previous;
  for(let i=0;i<=80;i++) {
   const direction=new THREE.Vector3((hand==='left'?1:-1)*Math.sin(.25+i*.004),-Math.cos(.25+i*.004),.001).normalize();
   const target=shoulder.parent.localToWorld(shoulder.position.clone().addScaledVector(direction,.94));
   world.reachArm(hand,target,rig,root,undefined,true);
   const orientation=shoulder.quaternion.clone();
   if(previous)assert.ok(orientation.angleTo(previous)<.02,'shoulder snapped near straight-arm pole');
   previous=orientation;
   const expected=shoulder.parent.localToWorld(shoulder.position.clone().addScaledVector(direction,.93));
   assert.ok(wrist.getWorldPosition(V()).distanceTo(expected)<1e-6,'stabilized roll changed endpoint');
  }
 }
});


function webcamRuntime(root,rig,tracker){
 const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),M=()=>new THREE.Matrix4();
 const world=Object.create(FestivalWorld.prototype);
 Object.assign(world,{player:root,playerRig:rig,headTracking:tracker,headTrackingActive:true,xrActive:true,xrSimulated:true,xrYaw:-Math.PI,xrSpineTwist:0,
 moveVector:V(),airborne:false,playerState:'walking',trackedBodyShown:false,trackedHiddenParts:[],trackedLandmarks:[],trackedArms:{left:false,right:false},xrHandPoses:{left:null,right:null},xrHandSampleAt:{left:0,right:0},trackedArmFrames:new WeakMap(),
 armWorld:V(),armSwing:V(),armLocal:V(),armAxisX:V(),armAxisY:V(),armAxisZ:V(),armBasis:M(),headForward:V(),armTarget:V(),armMeasured:V(),armWanted:V(),armQuat:Q(),armParentQuat:Q(),armMeasuredQuat:Q(),armDesiredQuat:Q(),armMatrix:M(),armVecA:V(),armVecB:V(),armVecC:V(),footSurfaceAt:()=>0});
 return world;
}
function webcamHand(left,digit,rotation=new THREE.Quaternion()){
 const sign=left?-1:1,points=[new THREE.Vector3()];
 FINGER_NAMES.forEach((name,k)=>{
  let p=new THREE.Vector3(sign*(.055-k*.022),0,name==='Thumb'?.03:.085);points.push(p.clone());let theta=0;
  for(let i=0;i<3;i++){theta+=name===digit?[.3,.8,.5][i]:0;
   const direction=name==='Thumb'?new THREE.Vector3(sign*.85,-Math.sin(theta),.5*Math.cos(theta)).normalize():new THREE.Vector3(0,-Math.sin(theta),Math.cos(theta));
   p=p.clone().addScaledVector(direction,i===0?.028:.021);points.push(p.clone());}
 });
 return points.map(p=>{p.applyQuaternion(rotation);return {x:p.x,y:-p.y,z:-p.z};});
}
test('webcam hands articulate native fingers and orient palms even without visible shoulders or a body',()=>{
 for(const top of ['#18191b','#28191b'])for(const hand of ['left','right'])for(const mode of ['occluded','absent','stale']){
  const {root,rig}=importedCharacter({top});walkCoastalPose(rig,0,0);syncImportedAvatars(root);
  const tracker=new HeadTracking();tracker.startForReview();const world=webcamRuntime(root,rig,tracker);
  const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});const side=hand==='left'?'Left':'Right';
  const rest=Object.fromEntries(FINGER_NAMES.map(n=>[n,[1,2,3].map(i=>bones.get(side+'Hand'+n+i).quaternion.clone())]));
  for(const digit of FINGER_NAMES){
   world.xrHandSampleAt[hand]=0;world.xrHandPoses[hand]=null;
   const now=performance.now(),points=webcamHand(hand==='left',digit,new THREE.Quaternion().setFromEuler(new THREE.Euler(.6,-.7,.4)));
   const pose=mode==='absent'?undefined:Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));
   tracker.feedBodyForReview(pose,{[hand]:points},now);if(mode==='stale')tracker.body.at=now-1000;
   world.updateTrackedBody(1/30);syncImportedAvatars(root);
   assert.ok(world.xrHandPoses[hand],mode+' lost a recognized hand');
   const measured=handJointsFromLandmarks(points),along=measured.fingers.Middle[0].clone().sub(measured.wrist).normalize(),thumb=measured.fingers.Index[0].clone().sub(measured.fingers.Pinky[0]);thumb.addScaledVector(along,-thumb.dot(along)).normalize();
   const actual=root.userData.importedHandFrame(hand==='left'),basis=rig.visualRoot.getWorldQuaternion(new THREE.Quaternion());
   assert.ok(actual.fingers.clone().applyQuaternion(basis).dot(along)>.999,'finger direction ignored');
   assert.ok(actual.thumb.clone().applyQuaternion(basis).dot(thumb)>.999,'palm orientation ignored');
   const moved=[1,2,3].reduce((sum,i)=>sum+bones.get(side+'Hand'+digit+i).quaternion.angleTo(rest[digit][i-1]),0);
   assert.ok(moved>.15,digit+' native joints did not move');
  }
 }
});

test('a transient musician asset failure retries without losing any band member',async()=>{
 const files={};for(const n of [...BAND_MEMBERS,'stage','bonfire']){const b=await readFile('src/assets/band/'+n+'.glb');files[n]=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
 const good=files.guitarist;let attempts=0;Object.defineProperty(files,'guitarist',{get(){return ++attempts===1?new ArrayBuffer(4):good;}});
 const band=new RooftopBand({x:40,y:7,z:12.2,yaw:Math.PI},{x:53.5,y:7,z:15.6,yaw:Math.PI/2});await band.load(files);band.update(0,0);
 assert.equal(attempts,2);assert.deepEqual(band.snapshot().map(m=>m.name).sort(),[...BAND_MEMBERS].sort());
 for(const playing of [false,true,false]){band.setPlaying(playing);for(let i=0;i<2400;i++)band.update(1/30,i/30);assert.equal(band.snapshot().length,4);assert.ok(band.snapshot().every(m=>m.state===(playing?'playing':'seated')));}
});


test('recognized hands still reach the renderer when the pose detector returns an invalid frame',()=>{
 const tracker=new HeadTracking();tracker.startForReview();const points=webcamHand(true,'Index');
 tracker.poseLandmarker={detectForVideo:()=>({worldLandmarks:[Array.from({length:33},()=>({x:NaN,y:0,z:0}))]}),close(){}};
 tracker.handLandmarker={detectForVideo:()=>({worldLandmarks:[points],landmarks:[points],handedness:[[{categoryName:'Left'}]]}),close(){}};
 tracker.detectBody({},performance.now());assert.ok(tracker.body.hands.left);assert.equal(tracker.bodyStatus,'tracking');
});

test('an unavailable musician recovers on a later frame without reloading the world',async()=>{
 const files={};for(const n of [...BAND_MEMBERS,'stage','bonfire']){const b=await readFile('src/assets/band/'+n+'.glb');files[n]=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
 const good=files.guitarist;let attempts=0;Object.defineProperty(files,'guitarist',{get(){return ++attempts<=3?new ArrayBuffer(4):good;}});
 const band=new RooftopBand({x:40,y:7,z:12.2,yaw:Math.PI},{x:53.5,y:7,z:15.6,yaw:Math.PI/2});await band.load(files);
 assert.equal(band.ready,false);assert.equal(band.snapshot().length,3);band.setPlaying(true);
 for(let i=0;i<151;i++)band.update(.1,i*.1);
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(band.ready,true);assert.equal(band.snapshot().length,4);assert.equal(band.snapshot().find(m=>m.name==='guitarist').state,'playing');
});

// Official MediaPipe recorded detector outputs, rather than handcrafted curl
// vectors: these exposed the swapped fallback that flattened every bent digit.
const recordedHands=await Promise.all(['thumb_up','pointing_up'].map(async name=>JSON.parse(await readFile(`scripts/fixtures/mediapipe/${name}.json`,'utf8'))));
test('recorded detector hands retain anatomical side, individual finger bends and palm orientation on both avatars',()=>{
 for(const top of ['#18191b','#28191b'])for(const hand of ['left','right'])for(const mode of ['absent','invalid','occluded'])for(const sample of recordedHands){
  const {root,rig}=importedCharacter({top});walkCoastalPose(rig,0,0);syncImportedAvatars(root);
  const tracker=new HeadTracking();tracker.startForReview();const world=webcamRuntime(root,rig,tracker);
  world.camera=new THREE.Object3D();
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.5,-.7,.4));
  const points=sample.worldLandmarks.map(p=>{const v=new THREE.Vector3(hand==='left'?-p.x:p.x,p.y,p.z).applyQuaternion(rotation);return {x:v.x,y:v.y,z:v.z};});
  const image=sample.landmarks.map(p=>({...p,x:hand==='left'?1-p.x:p.x}));
  const pose=mode==='absent'?[]:[Array.from({length:33},()=>({x:mode==='invalid'?NaN:0,y:0,z:0,visibility:0}))];
  tracker.poseLandmarker={detectForVideo:()=>({worldLandmarks:pose,landmarks:pose}),close(){}};
  tracker.handLandmarker={detectForVideo:()=>({worldLandmarks:[points],landmarks:[image],handedness:[[{categoryName:hand==='left'?'Left':'Right'}]]}),close(){}};
  tracker.bodyWanted=true;tracker.detectBody({},performance.now());
  assert.ok(tracker.body.hands[hand],`${mode}: SDK ${hand} assigned to opposite side`);
  world.updateTrackedBody(1/30);syncImportedAvatars(root);
  const measured=world.xrHandPoses[hand];assert.ok(measured);
  assert.ok(measured.Middle.curl.every(v=>v>.7),'recognized bent fingers clamped flat');
  if(sample.source.includes('pointing_up'))assert.ok(measured.Index.curl[1]<.2&&measured.Middle.curl[1]>1,'independent pointing finger lost');
  const joints=handJointsFromLandmarks(points),along=joints.fingers.Middle[0].clone().sub(joints.wrist).normalize();
  const thumb=joints.fingers.Index[0].clone().sub(joints.fingers.Pinky[0]);thumb.addScaledVector(along,-thumb.dot(along)).normalize();
  const frame=root.userData.importedHandFrame(hand==='left'),basis=rig.visualRoot.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(frame.fingers.clone().applyQuaternion(basis).dot(along)>.999,'measured fingers orientation lost');
  assert.ok(frame.thumb.clone().applyQuaternion(basis).dot(thumb)>.999,'measured palm roll lost');
  const side=hand==='left'?'Left':'Right',bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
  const wrist=bones.get(side+'Hand').getWorldPosition(new THREE.Vector3());
  const tip=bones.get(side+'HandMiddle4').getWorldPosition(new THREE.Vector3());
  const curledDistance=tip.distanceTo(wrist);
  const limbs=world.limbsForNetwork();assert.ok(limbs[hand==='left'?'lf':'rf'],'hand-only fingers omitted from network');
  assert.ok(limbs[hand==='left'?'l':'r'],'hand-only orientation omitted from network');
  const remote=importedCharacter({top});walkCoastalPose(remote.rig,0,0);
  world.applyLimbs({group:remote.root,rig:remote.rig},limbs);syncImportedAvatars(remote.root);
  const remoteBones=new Map();remote.root.traverse(o=>{if(o.isBone)remoteBones.set(o.name,o);});
  for(const digit of FINGER_NAMES)for(let k=1;k<=3;k++)assert.ok(bones.get(side+'Hand'+digit+k).quaternion.angleTo(remoteBones.get(side+'Hand'+digit+k).quaternion)<.008,'relayed joint exceeds hundredth-radian relay precision');
  root.userData.setImportedHandPose(hand==='left',null);syncImportedAvatars(root);
  assert.ok(curledDistance<bones.get(side+'HandMiddle4').getWorldPosition(new THREE.Vector3()).distanceTo(bones.get(side+'Hand').getWorldPosition(new THREE.Vector3()))*.8,'native middle finger did not curl');
 }
});
