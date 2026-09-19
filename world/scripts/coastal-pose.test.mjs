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
const output=await build({stdin:{contents:"export {applyWornStyle} from './src/world/WornStyle'; export * from './src/world/MentorDog'; export { FestivalWorld } from './src/world/FestivalWorld'; export * from './src/world/CoastalAvatar'; export * from './src/world/CoastalPose'; export * from './src/world/CoastalCarry'; export * from './src/world/ImportedAvatar'; export * from './src/world/CoastalSkateboard'; export * from './src/world/CoastalGeometry'; export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
const {applyWornStyle,waveCoastalPose,fallCoastalPose,landCoastalPose,djCoastalPose,hitCoastalPose,perchMentor,stepMentorGait,createMentorDog,poseCoastalCarry,loadImportedAvatar,attachImportedAvatar,syncImportedAvatars,COASTAL_CUP_OFFSET,COASTAL_STRAW_TIP,FestivalWorld,jumpCoastalArms,setCoastalSwimwear,punchCoastalPose,setCoastalFists,createCoastalSedan,CONVERTIBLE,walkCoastalPose,danceCoastalPose,COASTAL_STRIDE_LENGTH,THREE,createCoastalAvatar,supportCoastalPose,seatCoastalLegs,coastalFootHeights,skateCoastalPose,createCoastalSkateboard}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
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


const importedBytes=await readFile(process.env.AVATAR_ASSET??'src/assets/neighbour.glb');
await loadImportedAvatar(importedBytes.buffer.slice(importedBytes.byteOffset,importedBytes.byteOffset+importedBytes.byteLength));
function importedCharacter(){
  const {root,rig}=character();
  attachImportedAvatar(root,rig,{skin:'#dfb590',hair:'#3b3633',top:'#d0cbc1',bottoms:'#44464a',swimwear:'#577467'});
  return {root,rig};
}
test('supplied FBX instances share geometry but never share a skeleton or colour material',()=>{
  const first=importedCharacter(),second=importedCharacter();
  const a=first.root.userData.importedAvatar.meshes[0],b=second.root.userData.importedAvatar.meshes[0];
  assert.equal(a.geometry,b.geometry);assert.notEqual(a.skeleton,b.skeleton);assert.notEqual(a.material,b.material);
  walkCoastalPose(first.rig,1,1);syncImportedAvatars(first.root);
  assert.notDeepEqual(a.skeleton.bones.find(b=>b.name==='RightArm').quaternion.toArray(),b.skeleton.bones.find(b=>b.name==='RightArm').quaternion.toArray());
});
test('supplied mesh keeps finite deformations, clear walking wrists and grounded soles through a full cycle',()=>{
  const {root,rig}=importedCharacter(),meshes=root.userData.importedAvatar.meshes,p=new THREE.Vector3();
  for(let frame=0;frame<24;frame++){
    walkCoastalPose(rig,frame/24*Math.PI*2,1);supportCoastalPose(rig,()=>0);syncImportedAvatars(root);
    let lowest=Infinity;
    for(const mesh of meshes){
    mesh.skeleton.update();const rest=mesh.geometry.getAttribute('position');
    for(let i=0;i<rest.count;i++){
      if(rest.getY(i)>-.69)continue;
      p.fromBufferAttribute(rest,i);mesh.applyBoneTransform(i,p);mesh.localToWorld(p);
      assert.ok(Number.isFinite(p.y));lowest=Math.min(lowest,p.y);
    }}
    assert.ok(lowest>-.04 && lowest<.02,`actual shoe contact at ${frame}: ${lowest}`);
    for(const hand of [rig.leftWrist,rig.rightWrist])assert.ok(Math.abs(root.worldToLocal(hand.getWorldPosition(p)).x)>.57,'oversized sleeve must clear the torso');
  }
});
test('swimwear replaces the imported streetwear while keeping the supplied head and hands',()=>{
  const {root}=importedCharacter(),mesh=root.userData.importedAvatar.meshes.find(m=>m.userData.componentId==='tee');
  setCoastalSwimwear(root,true);assert.equal(mesh.visible,false);assert.ok(root.userData.swimMeshes.every(m=>m.visible));
  assert.equal(root.getObjectByName('Supplied head and hands • swim outfit').visible,true);
  setCoastalSwimwear(root,false);assert.equal(mesh.visible,true);assert.ok(root.userData.swimMeshes.every(m=>!m.visible));
});

test('rigid bag and head parts never inherit limb influences',()=>{
  const {root}=importedCharacter();
  for(const mesh of root.userData.importedAvatar.meshes){
    const name=mesh.material.name;
    const allowed=name.includes('bag-and-strap')?['Spine02']:name.endsWith('head')?['Head']:null;
    if(!allowed)continue;
    const ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
    for(let v=0;v<ids.count;v++)for(let k=0;k<4;k++)if(weights.getComponent(v,k)>.0001)
      assert.ok(allowed.includes(mesh.skeleton.bones[ids.getComponent(v,k)].name),name+' must be rigid');
  }
});

// Exercise the imported shoe surface, not the old rig's invisible proxy boxes.
test('imported soles clear every sampled step during ascent and descent',()=>{
  const {root,rig}=importedCharacter(),p=new THREE.Vector3();
  const floor=(x,z)=>Math.max(0,Math.ceil(z/.56))*(3.5/9);
  const shoes=root.userData.importedAvatar.meshes.filter(m=>m.material.name.endsWith('shoe'));
  for(const heading of [0,Math.PI])for(let frame=0;frame<48;frame++){
    root.position.set(0,0,frame/48*4.32);root.position.y=root.position.z/.56*(3.5/9)+.28;root.rotation.y=heading;
    walkCoastalPose(rig,frame/48*Math.PI*6);supportCoastalPose(rig,floor);syncImportedAvatars(root);
    let nearest=Infinity;
    for(const mesh of shoes){
      mesh.skeleton.update();const rest=mesh.geometry.getAttribute('position');
      for(let i=0;i<rest.count;i++){
        p.fromBufferAttribute(rest,i);mesh.applyBoneTransform(i,p);mesh.localToWorld(p);
        const clearance=p.y-floor(p.x,p.z);nearest=Math.min(nearest,clearance);
        assert.ok(clearance>-.04,`imported sole sinks at ${frame}, ${heading}: ${clearance}`);
      }
    }
    assert.ok(nearest<.07,`imported shoes float at ${frame}, ${heading}: ${nearest}`);
  }
});
test('drinking and eating cannot drag trouser or bag vertices with the hands',()=>{
  const {root,rig}=importedCharacter(),prop=new THREE.Group();root.add(prop);
  const parts=root.userData.importedAvatar.meshes.filter(m=>m.material.name.includes('trousers')||m.material.name.includes('bag-and-strap'));
  function vertices(){
    syncImportedAvatars(root);
    return parts.flatMap(mesh=>{
      mesh.skeleton.update();const p=mesh.geometry.getAttribute('position');
      return Array.from({length:p.count},(_,i)=>mesh.localToWorld(mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(p,i))));
    });
  }
  const baseline=vertices();
  for(const [hand,gesture] of [['right','drink'],['left','eat']])for(const phase of [0,.25,.5,.75,1]){
    prop.userData.carryHand=hand;poseCoastalCarry(rig,prop,gesture,phase);
    vertices().forEach((p,i)=>assert.ok(p.distanceTo(baseline[i])<.00001,`hand pulls garment at ${gesture} ${phase}`));
  }
});

test('imported hands bring the straw and popcorn to the mouth',()=>{
  for(const gesture of ['drink','eat']){
    const {root,rig}=importedCharacter(),prop=new THREE.Group();root.add(prop);
    prop.userData.carryHand=gesture==='drink'?'right':'left';
    poseCoastalCarry(rig,prop,gesture,.5);syncImportedAvatars(root);
    const mouth=rig.head.localToWorld(root.userData.importedMouth.clone());
    const point=gesture==='drink'?prop.localToWorld(COASTAL_STRAW_TIP.clone()):rig.visualRoot.localToWorld(root.userData.importedFingertip(true));
    assert.ok(point.distanceTo(mouth)<.065,`${gesture} misses the native mouth: ${point.distanceTo(mouth)}`);
  }
});

test('seated imported shoes meet the floor without moving the seated body',()=>{
  const {root,rig}=importedCharacter();root.position.y=.4+.23-1.1;
  const seatedY=root.position.y;seatCoastalLegs(rig,()=>-.28);syncImportedAvatars(root);
  for(const mesh of root.userData.importedAvatar.meshes.filter(m=>m.material.name.endsWith('shoe'))){
    mesh.skeleton.update();const rest=mesh.geometry.getAttribute('position');let lowest=Infinity;
    for(let i=0;i<rest.count;i++){
      const p=mesh.localToWorld(mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(rest,i)));
      lowest=Math.min(lowest,p.y);
    }
    assert.ok(Math.abs(lowest+.28)<.035,`seated shoe contact: ${lowest}`);
  }
  assert.equal(root.position.y,seatedY);
});

test('the installed model matches its zero-open-edge Blender audit',async()=>{
  const audit=JSON.parse(await readFile('src/assets/neighbour.meta.json','utf8'));
  assert.equal(audit.glbSha256,createHash('sha256').update(importedBytes).digest('hex'));
  assert.ok(audit.parts.length>10);
  for(const part of audit.parts){assert.equal(part.boundaryEdges,0,part.name);assert.equal(part.nonManifoldEdges,0,part.name);}
});

test('every clean body section has one joint owner and cannot stretch between unrelated bones',()=>{
  const {root}=importedCharacter();
  for(const mesh of root.userData.importedAvatar.meshes){
    const ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),owners=new Set();
    for(let i=0;i<ids.count;i++)for(let k=0;k<4;k++)if(weights.getComponent(i,k)>.00001)owners.add(ids.getComponent(i,k));
    assert.equal(owners.size,1,mesh.material.name);
  }
});

test('the cap is independently removable through palette and swim transitions',()=>{
 const {root}=importedCharacter(),meshes=root.userData.importedAvatar.meshes;
 const cap=meshes.find(m=>m.userData.componentId==='cap');
 assert.ok(cap,'separate cap mesh');assert.equal(cap.visible,false);
 const head=meshes.find(m=>m.userData.componentId==='head');assert.equal(head.visible,true);
 const palette={skin:'#dfb590',hair:'#3b3633',top:'#d0cbc1',bottoms:'#44464a',swimwear:'#577467'};
 root.userData.setImportedPalette({...palette,cap:'#aa3344'});assert.equal(cap.visible,true);
 setCoastalSwimwear(root,true);assert.equal(cap.visible,true);
 root.userData.setImportedPalette(palette);assert.equal(cap.visible,false);
 setCoastalSwimwear(root,false);assert.equal(cap.visible,false);assert.equal(head.visible,true);
});


test('streetwear contains no shoulder bag and every authored surface is closed',async()=>{
 const audit=JSON.parse(await readFile('src/assets/neighbour.meta.json','utf8'));
 assert.deepEqual(audit.outfits,['schedule-tee','bros-tee','utility-vest']);
 assert.ok(audit.parts.every(p=>!p.name.startsWith('bag-')&&!p.name.startsWith('strap-')));
 assert.ok(audit.parts.every(p=>p.boundaryEdges===0&&p.nonManifoldEdges===0));
});

test('three fixed outfits remain independent across visitors and restore correctly after swimming',()=>{
 const a=importedCharacter(),b=importedCharacter();
 const palette={skin:'#dfb590',hair:'#3b3633',bottoms:'#718262',swimwear:'#577467'};
 const visible=root=>root.userData.importedAvatar.meshes.filter(m=>m.visible).map(m=>m.userData.componentId);
 for(const [top,id] of [['#18191b','1'],['#191a1c','2'],['#1a1b1d','3']]){
  a.root.userData.setImportedPalette({...palette,top});
  const names=visible(a.root);
  assert.equal(names.some(n=>n.startsWith('vest')),id==='3');
  assert.equal(names.some(n=>n.startsWith('outfit2')),id==='2');
  assert.equal(names.some(n=>n.startsWith('outfit1')),id!=='2');
  assert.ok(!visible(b.root).some(n=>n.startsWith('vest')||n.startsWith('outfit2')));
  setCoastalSwimwear(a.root,true);
  assert.equal(visible(a.root).length,0,'all imported streetwear hidden in water');
  a.root.userData.setImportedPalette({...palette,top});
  assert.equal(visible(a.root).length,0,'appearance edits cannot reveal garments in water');
  setCoastalSwimwear(a.root,false);assert.deepEqual(visible(a.root),names);
 }
});

test('imported hands rest palm-in with thumbs forward and fingers down',()=>{
 const {root}=importedCharacter();
 for(const right of [false,true]){
  const frame=root.userData.importedHandFrame(right);
  assert.ok(frame.palm.dot(new THREE.Vector3(right?-1:1,0,0))>.98,`palm-in ${right}: ${frame.palm.toArray()}`);
  assert.ok(frame.thumb.z>.98,`thumb-forward ${right}: ${frame.thumb.toArray()}`);
  assert.ok(frame.fingers.y<-.98,`fingers-down ${right}: ${frame.fingers.toArray()}`);
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

test('both wrists remain attached and anatomically bounded throughout the complete popcorn cycle',()=>{
 const {root,rig}=importedCharacter(),prop=new THREE.Group();root.add(prop);prop.userData.carryHand='left';
 for(let i=0;i<=60;i++){
  poseCoastalCarry(rig,prop,'eat',i/60);
  for(const right of [true,false]){
   const frame=root.userData.importedHandFrame(right);
   assert.ok(frame.forearm.angleTo(frame.fingers)<THREE.MathUtils.degToRad(40.1),`overbent wrist at ${i}, ${right}`);
   assert.ok(frame.joint.distanceTo(root.userData.importedWrist(right))<.02,`hand/cuff socket drift at ${i}, ${right}`);
   const cuff=root.userData.importedAvatar.meshes.find(m=>m.userData.componentId===(right?'Left-forearm':'Right-forearm'));
   cuff.skeleton.update();const positions=cuff.geometry.getAttribute('position');let bottom=Infinity;
   for(let v=0;v<positions.count;v++)bottom=Math.min(bottom,positions.getY(v));
   const centre=new THREE.Vector3();let count=0;
   for(let v=0;v<positions.count;v++)if(positions.getY(v)<bottom+.0001){
    const point=new THREE.Vector3().fromBufferAttribute(positions,v);cuff.applyBoneTransform(v,point);
    centre.add(rig.visualRoot.worldToLocal(cuff.localToWorld(point)));count++;
   }
   centre.divideScalar(count);
   assert.ok(centre.distanceTo(frame.joint)<.02,`visible sleeve/hand break at ${i}, ${right}: ${centre.distanceTo(frame.joint)}`);
  }
 }
});

test('the original cap logo is textured, independent of cap dye, and hidden with the hat',()=>{
 const {root}=importedCharacter(),meshes=root.userData.importedAvatar.meshes;
 const logo=meshes.find(m=>m.userData.componentId==='cap-logo');
 assert.ok(logo,'separate exact-logo patch');assert.ok(logo.material.map,'embedded PNG texture');
 const texture=logo.material.map;
 root.userData.setImportedPalette({skin:'#dfb590',hair:'#3b3633',top:'#d0cbc1',bottoms:'#44464a',swimwear:'#577467',cap:'#ee3333'});
 assert.equal(logo.visible,true);assert.equal(logo.material.map,texture);
 root.userData.setImportedPalette({skin:'#dfb590',hair:'#3b3633',top:'#d0cbc1',bottoms:'#44464a',swimwear:'#577467'});
 assert.equal(logo.visible,false);
});


test('MENTOR stays in contact with the animated crown with and without a cap',()=>{
 const {root,rig}=importedCharacter(),group=new THREE.Group(),dog=createMentorDog();root.add(group);group.add(dog.root);
 for(const cap of [undefined,'#303030']){
  root.userData.setImportedPalette({cap});
  for(let i=0;i<48;i++){
   root.position.set(i*.03,.28+i*.007,0);root.rotation.y=i*.03;
   walkCoastalPose(rig,i/48*Math.PI*2);supportCoastalPose(rig,()=>i*.007);syncImportedAvatars(root);
   const support=root.userData.importedHeadSupport();perchMentor(group,dog,rig.head,support);
   let lowest=Infinity;
   for(const leg of [dog.leftFrontLeg,dog.rightFrontLeg,dog.leftBackLeg,dog.rightBackLeg])leg.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const positions=mesh.geometry.getAttribute('position');
    for(let v=0;v<positions.count;v++)lowest=Math.min(lowest,rig.head.worldToLocal(mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,v))).y-support.y);
   });
   assert.ok(Math.abs(lowest-.006)<1e-5,`crown contact ${i}: ${lowest}`);
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
   let minimum=Infinity;
   for(const mesh of root.userData.importedAvatar.meshes.filter(m=>m.userData.componentId.endsWith('shoe'))){
    mesh.skeleton.update();const vertices=mesh.geometry.getAttribute('position');
    for(let v=0;v<vertices.count;v++){
     const p=new THREE.Vector3().fromBufferAttribute(vertices,v);mesh.applyBoneTransform(v,p);mesh.localToWorld(p);minimum=Math.min(minimum,p.y);
    }
   }
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
  if(last)assert.ok(rig.rightArm.quaternion.angleTo(last)<.12,`wave change ${i}: ${rig.rightArm.quaternion.angleTo(last)}`);
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
   assert.ok(tip.y>1.26&&tip.y<1.34,'fingertips stay at control surface height');
   assert.ok(tip.z>.6&&tip.z<.8,'hands stay above the deck rather than behind the cabinet');
   assert.ok(right?Math.abs(tip.x)<.3:tip.x<-.9,'one hand on the mixer, one on the platter');
   assert.ok(frame.palm.y<-.6,'palms face the controls');
  }
 }
});


test('controller movement resumes immediately when a teleport closes menu capture',()=>{
  const world=Object.create(FestivalWorld.prototype),events=[];
  const frame={moveX:.65,moveY:-.8,lookX:0,lookY:0,pressed:new Set(),held:new Set()};
  Object.assign(world,{xrActive:false,gamepad:{poll:()=>frame},gamepadRunning:false,onAction:e=>events.push(e)});
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
    cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),groundHeightAt:()=>0,
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
    cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),groundHeightAt:()=>0,
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
    cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),groundHeightAt:()=>0,
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
   * The lunge, now mostly gone, pinned at what it measures.
   *
   * It was 0.337 inward every tenth frame, for ever, and it survived three
   * fixes because none of them was the cause. The cause was a limit cycle: the
   * eased distance was measured towards the camera's *target*, which sits at
   * the full orbit radius and so points steeper than the lens actually does, and
   * a steeper ray clears an obstruction further. So the distance sat about 0.45
   * longer than the line the lens was on, pushed outward at the opening rate,
   * went obstructed, and was hauled back by the clamp that guarantees you cannot
   * see through a wall. Ten frames, every time, against a wall, a corridor and a
   * lamp post alike — identical numbers, because the lens sits on x=0 in all
   * three and the sight line crosses each the same way.
   *
   * `easeCameraToward` now travels the arc and clamps the distance on the ray
   * the lens is actually on, measured out to the radius it wants rather than the
   * one it has — the latter could only ever take room away, which walked the
   * lens to 0.37 of a unit from the eye, inside the avatar's head.
   *
   * Measured after: 0.183 near a wall, and 0.005 on stairs, which is the case
   * that was reported as unusable. Something of the cycle remains near a wall
   * and this is where it is caught if it grows.
   */
  assert.ok(biggestZoomStep<0.19,`the view closed in ${biggestZoomStep.toFixed(3)} in a single frame`);
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
