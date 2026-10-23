import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:"export * from './src/world/DialogueCamera';export * from './src/world/WorldCamera';export {FestivalWorld} from './src/world/FestivalWorld';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,loader:{'.png':'dataurl'}});
const {THREE,WorldCamera,FestivalWorld,dialogueFrame,DialogueCameraTransition,NpcDialogueClock}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const canvasContext=new Proxy({measureText:text=>({width:text.length*40})},{get:(target,key)=>key in target?target[key]:()=>{}});
globalThis.document={createElement:()=>({getContext:()=>canvasContext})};

test('third-person conversation fits both upper bodies in portrait and landscape at varied floor heights and headings',()=>{
 for(const aspect of [402/874,874/402,1.6])for(const heading of [0,.8,Math.PI])for(const height of [0,7,-16]){
  const player=new THREE.Vector3(10,height+.28,20),subject=player.clone().add(new THREE.Vector3(Math.sin(heading)*3,.2,Math.cos(heading)*3));
  const frame=dialogueFrame('follow',player,subject,{aspect,fov:58}),camera=new THREE.PerspectiveCamera(58,aspect,.1,300);
  camera.position.copy(frame.position);camera.lookAt(frame.target);camera.updateMatrixWorld(true);
  for(const actor of [player,subject])for(const height of [1.4,2.84,3.04]){
   const projected=actor.clone().add(new THREE.Vector3(0,height,0)).project(camera);
   assert.ok(Math.abs(projected.x)<.84&&projected.y<.87&&projected.y>-.44&&projected.z>-1&&projected.z<1,'a conversation actor was cropped or behind the lens');
  }
 }
});

test('first-person conversation keeps the eye near the visitor and frames the resident; isometric has no alternate frame',()=>{
 const player=new THREE.Vector3(2,7.28,4),subject=new THREE.Vector3(2,7.28,7);
 const frame=dialogueFrame('first-person',player,subject,{aspect:.46,fov:74});
 assert.ok(frame.position.distanceTo(player.clone().add(new THREE.Vector3(0,2.84,0)))<.13);
 assert.ok(frame.target.distanceTo(subject.clone().add(new THREE.Vector3(0,2.68,0)))<1e-12);
 assert.equal(dialogueFrame('isometric',player,subject,{aspect:.46,fov:74}),undefined);
 const transition=new DialogueCameraTransition(new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-1));
 const early=transition.step(frame,.1),startDistance=early.position.distanceTo(frame.position);
 assert.ok(startDistance>0&&startDistance<frame.position.length());
 const complete=transition.step(frame,.5);assert.ok(complete.position.distanceTo(frame.position)<1e-12);assert.ok(complete.target.distanceTo(frame.target)<1e-12);
 assert.equal(transition.step(frame,.1),complete,'transition reuses its vector outputs');
});

function fixture(mode='follow'){
 const w=Object.create(FestivalWorld.prototype),actions=[],npc={id:'VIOLA',name:'Viola',group:new THREE.Group(),badge:new THREE.Sprite(new THREE.SpriteMaterial()),remoteCarriedProp:new THREE.Group(),gestureUntil:0,waitUntil:123,route:[new THREE.Vector3(0,.28,8)],waypointIndex:0,phase:0,speed:1,transit:[],knockback:new THREE.Vector3()};
 npc.group.position.set(0,.28,3);
 Object.assign(w,{camera:new WorldCamera(58,1.6,.1,300),player:new THREE.Group(),lookTarget:new THREE.Vector3(),cameraMode:mode,cameraZoom:1.2,cameraReach:0,cameraOrbit:{follow:{yaw:.4,pitch:.3}},keys:new Set(['w']),stickX:0,stickY:0,mobileMoveYaw:undefined,moveVector:new THREE.Vector3(),cameraDirection:new THREE.Vector3(),cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),wallAvoidance:{side:0,offset:0},playerState:'walking',lookSensitivity:1,scene:new THREE.Scene(),originalPlayerIdle:{visible:false},npcs:[npc],remoteNpcControls:new Map(),npcProfileById:new Map([['VIOLA',{id:'VIOLA',name:'VIOLA',title:'PRODUCER',introduction:'A precise introduction.'}]]),onAction:a=>actions.push(a),cameraPointerReset(){},settlePunchImpact(){},applyCameraShake(){},applyDrunkenView(){},confineCameraOverWater(){},pullCameraClearOfWalls(){},cameraClearReach:(a,b)=>a.distanceTo(b),syncCarriedPropAnchor(){},staticCollides:()=>false,sharedNpcRoutes:true,isMentorControlLocked:()=>false,groundHeightAt:()=>.28,colliders:[],northLimit:()=>150,walkableXRange:()=>({min:-120,max:130}),resolvePlayerCrowdCollisions(){},paintsInHeadset:()=>false,desktopBodyTracked:()=>false});
 w.player.position.y=.28;w.scene.add(w.player,npc.group);w.updateCamera(1/60,0);return {w,npc,actions};
}

test('an actual resident wave opens the named introduction, pauses controls and restores the original selected view on close',()=>{
 for(const mode of ['follow','first-person','isometric']){
  const {w,npc,actions}=fixture(mode),before={position:w.camera.position.clone(),target:w.lookTarget.clone(),orbit:{...w.cameraOrbit.follow},zoom:w.cameraZoom};
  w.greetSocialTarget({name:npc.name,npc});
  assert.deepEqual(actions.map(a=>a.type),['greet','npcIntroduction']);assert.equal(actions[1].presentation,'dialogue','a wave is a conversation');assert.equal(actions[1].name,'VIOLA');assert.equal(actions[1].title,'PRODUCER');assert.equal(actions[1].introduction,'A precise introduction.');
  assert.equal(w.npcDialogue.npc,npc);assert.equal(w.playerGesture,'wave');assert.equal(npc.gesture,'wave');
  const origin=w.player.position.clone();w.setMovementVector(1,1);w.setMovementKey('w',true);w.movePlayer(1,1,2);w.updatePlayer(1/60);
  assert.equal(w.keys.size,0);assert.equal(w.stickX,0);assert.equal(w.moveVector.lengthSq(),0);assert.ok(w.player.position.distanceTo(origin)<1e-12);
  w.applyLookDelta(100,80);assert.deepEqual(w.cameraOrbit.follow,before.orbit);
  for(let i=0;i<60;i++)w.updateCamera(1/60,i/60);
  assert.equal(w.cameraMode,mode);assert.equal(w.cameraZoom,before.zoom);assert.deepEqual(w.cameraOrbit.follow,before.orbit);
  if(mode==='isometric'){assert.ok(w.camera.position.distanceTo(before.position)<1e-12);assert.ok(w.lookTarget.distanceTo(before.target)<1e-12);assert.equal(w.camera.isOrthographicCamera,true);}
  else assert.ok(w.lookTarget.distanceTo(before.target)>.1,'manual views should receive a temporary conversation composition');
  w.closeNpcDialogue();w.closeNpcDialogue();w.updateCamera(1/60,2);
  assert.equal(w.npcDialogue,undefined);assert.equal(w.cameraMode,mode);assert.ok(w.camera.position.distanceTo(before.position)<1e-12);assert.ok(w.lookTarget.distanceTo(before.target)<1e-12);
  w.setMovementVector(.5,0);assert.equal(w.stickX,.5,'closing must release new input');
 }
});

test('asking for an introduction outright opens the plain card: no conversation shot, no hold, controls kept',()=>{
 for(const mode of ['follow','first-person']){
  const {w,npc,actions}=fixture(mode),before={position:w.camera.position.clone(),target:w.lookTarget.clone()};
  assert.equal(w.openNpcIntroduction({name:npc.name,npc},'menu'),true);
  assert.deepEqual(actions.map(a=>[a.type,a.presentation]),[['npcIntroduction','menu']]);assert.equal(actions[0].name,'VIOLA');
  assert.equal(w.npcDialogue,undefined,'SHIFT+E must not start the conversation camera');
  for(let i=0;i<30;i++)w.updateCamera(1/60,i/60);
  assert.ok(w.lookTarget.distanceTo(before.target)<.5,'the selected view stays the player\'s own');
  w.setMovementVector(.5,0);assert.equal(w.stickX,.5,'controls are not paused for the card');
 }
});

test('a dialogue resident holds their route without disabling other visitors, then resumes when closed; remote greetings stay ordinary waves',()=>{
 const {w,npc,actions}=fixture();let routeUpdates=0;w.updateSharedNpc=()=>routeUpdates++;
 w.greetSocialTarget({name:npc.name,npc});const position=npc.group.position.clone();
 for(let i=0;i<90;i++)w.updateNpcs(1/60,i/60);
 assert.equal(routeUpdates,0);assert.ok(npc.group.position.distanceTo(position)<1e-12);assert.equal(npc.waitUntil,123,'modal pause must not overwrite route timers');
 const neighbor={...npc,id:'DANNY',group:new THREE.Group(),phase:.8};neighbor.group.position.copy(npc.group.position).add(new THREE.Vector3(.8,0,0));w.npcs.push(neighbor);w.holdBodiesApart(1/60);
 assert.ok(npc.group.position.distanceTo(position)<1e-12,'crowd separation cannot move the conversation subject');assert.ok(neighbor.group.position.x>.8,'another nearby body can still separate');
 w.npcs.pop();w.closeNpcDialogue();w.updateNpcs(1/60,2);assert.equal(routeUpdates,1,'normal route updates resume after close');
 actions.length=0;const remote={group:new THREE.Group()};w.greetSocialTarget({name:'Visitor',remote});assert.deepEqual(actions.map(a=>a.type),['greet']);assert.equal(w.npcDialogue,undefined,'a live visitor has no resident introduction');
});

test('the dialogue presentation clock catches up at bounded pace without jumps after background gaps or clock corrections',()=>{
 const clock=new NpcDialogueClock();clock.hold('VIOLA',100,1000);
 assert.equal(clock.sample('VIOLA',120,21000),100,'reading keeps the same presentation time');
 clock.release('VIOLA',21000);let time=clock.sample('VIOLA',120.1,21100);assert.ok(Math.abs(time-100.2)<1e-8);
 assert.equal(clock.sample('VIOLA',160,60000),time,'a background gap cannot fast-forward the actor');
 const forward=clock.sample('VIOLA',5000,60100);assert.ok(forward-time<=.20000001,'a forward device/server correction cannot teleport the actor');time=forward;
 assert.equal(clock.sample('VIOLA',50,60200),time,'a backwards correction cannot reverse the route');
 assert.equal(clock.sample('OTHER',888,60200),888,'unrelated residents keep the unmodified shared clock');
 // A separate two-second hold rejoins the shared phase, then releases the
 // temporary clock entirely. After that ordinary samples pass through.
 const rejoin=new NpcDialogueClock();rejoin.hold('DANNY',10,0);rejoin.release('DANNY',2000);
 for(let i=1;i<=20;i++)rejoin.sample('DANNY',12+i*.1,2000+i*100);
 assert.equal(rejoin.sample('DANNY',30,5000),30,'catch-up must finish rather than leave permanent local phase drift');
});

test('actual shared-route sampling resumes continuously after a long dialogue instead of snapping to the absolute clock',async()=>{
 const {w,npc}=fixture();w.npcClockOffset=1_000_000-Date.now();
 const a=new THREE.Vector3(0,.28,0),b=new THREE.Vector3(10,.28,0);
 w.sharedNpcRoute=()=>[{from:a,to:b,start:0,duration:10},{from:b,to:a,start:10,duration:10}];
 w.updateSharedNpc(npc,0);const held=npc.group.position.clone(),route=w.sharedNpcRoute(npc);
 w.greetSocialTarget({name:npc.name,npc});w.npcClockOffset+=30_000;
 w.updateNpcs(1/60,30);assert.ok(npc.group.position.distanceTo(held)<1e-12);
 const releaseAt=performance.now();w.closeNpcDialogue();w.updateSharedNpc(npc,30);
 assert.ok(npc.group.position.distanceTo(held)<=2*(performance.now()-releaseAt)/1000+.015,'the first actual sample after close snapped to a different route location');
 const before=npc.group.position.clone(),sampleAt=performance.now();await new Promise(resolve=>setTimeout(resolve,30));w.updateSharedNpc(npc,30.03);
 assert.ok(npc.group.position.distanceTo(before)<=2*(performance.now()-sampleAt)/1000+.015,'catch-up exceeded twice the route walking pace');
 assert.equal(w.sharedNpcRoute(npc)[0].duration,route[0].duration,'conversation cannot rewrite route timing');
});

test('real club, bar and temple walls select a readable alternate conversation angle without a close-face zoom',()=>{
 for(const venue of ['club','temple']){
  const {w,npc}=fixture();
  Object.assign(w,{seats:[],projectors:new Map(),venueSignMaterials:new Map(),clubLights:[],clubFloorPanels:[],clubBeatLights:[],paving:[],kerbStones:[],graphicsMode:'normal',preview:true,templeSignText:{name:'美麗本人',label:'THE TEMPLE'},dayNight:{addLampMaterial(){},addLampLight(){}},createProjectorSurface(){},venueSceneryAssets:{attach:async()=>{}}});
  delete w.cameraClearReach;delete w.pullCameraClearOfWalls;delete w.groundHeightAt;
  if(venue==='club')w.createClub();else w.buildOnGrade(()=>w.createTemple(),4.8);
  const positions=venue==='club'
   ?[{player:[-87.8,-.72,20],npc:[-85,-.72,20]},{player:[-82,-.72,1.8],npc:[-82,-.72,4.6]},{seat:w.seats.find(s=>s.kind==='bar'),npc:[-73.2,-.72,8.8]}]
   :[{player:[77.5,6.28,12],npc:[80.2,6.28,12]},{player:[82,6.28,20.5],npc:[84.8,6.28,20.5]}];
  let alternateAngles=0;
  for(const setup of positions)for(const aspect of [402/874,1.6])for(const mode of ['follow','first-person']){
   w.closeNpcDialogue();w.playerState=setup.seat?'seated':'walking';
   w.player.position.copy(setup.seat?w.seatAnchor(setup.seat):new THREE.Vector3(...setup.player));npc.group.position.set(...setup.npc);
   w.camera.aspect=aspect;w.camera.updateProjectionMatrix();w.setCameraMode(mode);w.cameraReach=0;w.updateCamera(1/60,0);
   const ordinary=dialogueFrame(mode,w.player.position,npc.group.position,{aspect,fov:w.camera.fov});
   if(mode==='follow'&&w.cameraClearReach(ordinary.target,ordinary.position)<ordinary.target.distanceTo(ordinary.position)-.02)alternateAngles++;
   const orbit={...w.cameraOrbit.follow},zoom=w.cameraZoom;
   w.greetSocialTarget({name:npc.name,npc});
   for(let frame=0;frame<40;frame++){
    w.updateCamera(1/60,frame/60);const camera=w.camera;
    assert.equal(w.player.visible,mode!=='first-person','first/third avatar visibility must hold throughout the cinematic ease');
    assert.equal(w.blocksCamera(camera.position.x,camera.position.z,camera.position.y),false,`${venue} ${mode} lens entered masonry`);
    const reach=w.lookTarget.distanceTo(camera.position);
    assert.ok(w.cameraClearReach(w.lookTarget,camera.position)>=reach-.02,`${venue} ${mode} view ray passed through a physical wall`);
   }
   w.camera.updateMatrixWorld(true);
   if(mode==='follow'){
    assert.ok(w.camera.position.distanceTo(w.lookTarget)>=4.59,'wall avoidance must not collapse the conversation into a face');
    for(const actor of [w.player.position,npc.group.position]){
     const head=actor.clone().add(new THREE.Vector3(0,2.84,0)).project(w.camera);
     assert.ok(Math.abs(head.x)<.9&&head.y<.95&&head.y>-.5&&head.z>-1&&head.z<1,`${venue} actor head escaped the alternate shot`);
    }
   }
   assert.deepEqual(w.cameraOrbit.follow,orbit);assert.equal(w.cameraZoom,zoom);assert.equal(w.cameraMode,mode);
  }
  assert.ok(alternateAngles>0,`${venue} fixtures must reproduce the obstructed preferred shot`);
 }
});

test('a blocked easing chord cuts safely to the checked shot, caches checks, and a confined room retains its safe player view',()=>{
 const player=new THREE.Vector3(0,.28,0),subject=new THREE.Vector3(0,.28,3),start=new THREE.Vector3(4,3,-4),target=new THREE.Vector3(0,2,0);
 const transition=new DialogueCameraTransition(start,target);let probes=0;
 const options={aspect:1.6,fov:58,clearReach:(from,to)=>{probes++;return from.equals(start)&&!to.equals(start)?.12:from.distanceTo(to);}};
 const selected=transition.frame('follow',player,subject,options),count=probes,pose=transition.step(selected,1/60);
 assert.ok(pose.position.distanceTo(selected.position)<1e-12,'an obstructed easing path must not be traversed');
 assert.equal(transition.frame('follow',player,subject,options),selected);assert.equal(probes,count,'unchanged modal framing must not repeat collider probes every frame');
 const confined=new DialogueCameraTransition(start,target),fallback=confined.frame('follow',player,subject,{aspect:.46,fov:58,clearReach:(a,b)=>a.equals(start)&&b.equals(start)?0:.12});
 assert.ok(fallback.position.distanceTo(start)<1e-12);assert.ok(fallback.target.distanceTo(target)<1e-12,'no fully fitted angle should retain the safe player composition');
});
