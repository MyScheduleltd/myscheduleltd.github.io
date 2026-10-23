import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:"export * from './src/world/WorldCamera';export * from './src/world/CutawayLens';export {terrainHeightAt} from './src/world/CoastalTerrain';export {FestivalWorld} from './src/world/FestivalWorld';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',loader:{'.png':'dataurl'}});
const {THREE,WorldCamera,FestivalWorld,WORLD_CAMERA_MODES,ISOMETRIC_VIEW,isometricExtraDepth,mobileFollowYaw,CutawayLens,CUTAWAY_LENS,cutawayUniforms,terrainHeightAt}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

function fixture(mode='follow'){
 const w=Object.create(FestivalWorld.prototype);Object.assign(w,{camera:new WorldCamera(58,1,.1,300),player:new THREE.Group(),cameraMode:mode,cameraZoom:1,cameraReach:0,cameraOrbit:{follow:{yaw:.2,pitch:.32}},playerState:'walking',lookTarget:new THREE.Vector3(),moveVector:new THREE.Vector3(),cameraDirection:new THREE.Vector3(),stickX:0,stickY:0,lastManualLookAt:-Infinity,colliders:[],scene:new THREE.Scene(),wallAvoidance:{side:0,offset:0},cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),settlePunchImpact(){},applyCameraShake(){},applyDrunkenView(){},confineCameraOverWater(){},pullCameraClearOfWalls(){},cameraClearReach:(a,b)=>a.distanceTo(b),lookSensitivity:1,occupiedSeats:new Set(),nearArcade:()=>false,nearClubBar:()=>false,nearJukebox:()=>false,nearShopCounter:()=>false,nearWishWall:()=>false,nearbyDj:()=>undefined,nearbyMentor:()=>undefined,mentorFollowsActiveAvatar:()=>false,nearestSocialTarget:()=>undefined,drinkUntil:0,eatingUntil:0,npcs:[],remoteAvatars:new Map(),onAction(){}});return w;
}

test('a network/profile refresh cannot revive a first-person, XR, controlled or arcade-hidden body between frames',()=>{
 const w=fixture();
 for(const mode of WORLD_CAMERA_MODES){w.cameraMode=mode;w.player.visible=!w.player.visible;w.applyControlledNpcVisibility();assert.equal(w.player.visible,mode!=='first-person');}
 w.cameraMode='follow';
 for(const [field,value] of [['xrActive',true],['controlledNpcId','KENNY'],['arcadeView',{}]]){
  w[field]=value;w.player.visible=true;w.applyControlledNpcVisibility();assert.equal(w.player.visible,false,field);w[field]=undefined;
 }
 w.applyControlledNpcVisibility();assert.equal(w.player.visible,true);
});

test('the three choices cycle exactly and isometric uses actual parallel orthographic rays',()=>{
 const w=fixture();assert.deepEqual(WORLD_CAMERA_MODES,['follow','first-person','isometric']);
 assert.equal(w.toggleCameraMode(),'first-person');assert.equal(w.toggleCameraMode(),'isometric');assert.equal(w.toggleCameraMode(),'follow');
 const c=w.camera;c.position.set(0,0,10);c.lookAt(0,0,0);c.setIsometric(true);c.updateMatrixWorld(true);
 assert.equal(c.isPerspectiveCamera,false);assert.equal(c.isOrthographicCamera,true);assert.equal(c.projectionMatrix.elements[11],0);assert.equal(c.projectionMatrix.elements[15],1);
 const near=new THREE.Vector3(1,0,0).project(c),far=new THREE.Vector3(1,0,-30).project(c);assert.ok(Math.abs(near.x-far.x)<1e-12,'depth cannot change isometric object scale');
 const rays=[-.5,.5].map(x=>{const r=new THREE.Raycaster();r.setFromCamera(new THREE.Vector2(x,0),c);return r.ray.clone();});
 assert.ok(rays[0].direction.distanceTo(rays[1].direction)<1e-12);assert.ok(rays[0].origin.distanceTo(rays[1].origin)>1);
 c.aspect=402/874;c.updateProjectionMatrix();assert.ok(Math.abs((c.right-c.left)-ISOMETRIC_VIEW.span)<1e-10,'portrait keeps horizontal room');
 c.setIsometric(false);assert.equal(c.isPerspectiveCamera,true);assert.equal(c.isOrthographicCamera,false);assert.notEqual(c.projectionMatrix.elements[11],0);
});

test('real camera update keeps a fixed isometric diagonal across walking, swimming and seating; manual views keep drag control',()=>{
 const w=fixture('isometric'),directions=[];
 for(const [state,x,y,z] of [['walking',0,.28,0],['walking',30,7,25],['swimming',0,-.2,-60],['seated',-35,1,-30]]){
  w.playerState=state;w.player.position.set(x,y,z);w.player.rotation.y+=1;w.updateCamera(1/60,0);w.camera.updateMatrixWorld(true);
  directions.push(w.camera.getWorldDirection(new THREE.Vector3()));assert.equal(w.cameraMode,'isometric');assert.equal(w.camera.isOrthographicCamera,true);
 }
 for(const direction of directions)assert.ok(direction.distanceTo(directions[0])<1e-12);
 const before={...w.cameraOrbit.follow};w.applyLookDelta(100,50);assert.deepEqual(w.cameraOrbit.follow,before,'isometric cannot rotate through touch, mouse or controller look');
 w.setCameraMode('first-person');w.applyLookDelta(100,50);assert.notEqual(w.cameraOrbit.follow.yaw,before.yaw);w.updateCamera(1/60,0);assert.equal(w.camera.isPerspectiveCamera,true);assert.equal(w.cameraMode,'first-person');
 w.setCameraMode('follow');const yaw=w.cameraOrbit.follow.yaw;w.applyLookDelta(-50,0);assert.notEqual(w.cameraOrbit.follow.yaw,yaw);
});

test('actual seat entry, selected changes while seated, public screening setup and standing preserve the chosen view',()=>{
 const oldWindow=globalThis.window;globalThis.window={location:new URL('http://127.0.0.1:4187/')};
 try{
  for(const mode of WORLD_CAMERA_MODES)for(const kind of ['bar','screening']){
   const w=fixture(mode),seat={id:kind==='bar'?'CLUB-BAR-1':'PALACE-1',kind,venue:kind==='bar'?'club':'palace',position:new THREE.Vector3(-35,0,-30),facing:Math.PI};
   w.nearestSeat=()=>seat;w.seatAnchor=()=>seat.position.clone();w.seats=[seat];w.groundHeightAt=()=>.28;w.staticCollides=()=>false;const actions=[];w.onAction=a=>actions.push(a);
   w.interact();assert.equal(w.playerState,'seated');assert.equal(w.cameraMode,mode,'seating cannot select a screen-aim camera');assert.equal(actions.at(-1).type,'seated');
   w.originalPlayerIdle={visible:false};w.isMentorControlLocked=()=>false;w.syncCarriedPropAnchor=()=>{};
   w.updatePlayer(1/60);assert.equal(w.player.visible,mode!=='first-person','seated first-person must hide the avatar head just as walking does');
   const changed=w.toggleCameraMode();assert.notEqual(changed,mode);w.standUp();assert.equal(w.cameraMode,changed,'standing cannot restore an earlier selection');
   w.setCameraMode(mode);w.focusPublicScreeningForReview('palace');assert.equal(w.cameraMode,mode,'starting the actual public-screening fixture preserves selection');
  }
 }finally{globalThis.window=oldWindow;}
});

test('mobile third-person follow waits after manual drag, then eases toward stable joystick travel without steering first-person or iso',()=>{
 assert.equal(mobileFollowYaw(.2,Math.PI/2,1/60,1000,900,true),.2);assert.equal(mobileFollowYaw(.2,Math.PI/2,1/60,3000,0,false),.2);
 const eased=mobileFollowYaw(0,Math.PI/2,1/60,3000,0,true);assert.ok(eased<0&&eased>-.05,'one frame turns gently via the shortest arc');
 const w=fixture('follow');w.mobileCameraControls=true;w.setMovementVector(1,0);assert.equal(w.mobileMoveYaw,.2);w.moveVector.set(.1,0,0);w.travelHeading=Math.PI/2;
 const yaw=w.cameraOrbit.follow.yaw;w.updateCamera(1/60,0);assert.notEqual(w.cameraOrbit.follow.yaw,yaw);assert.equal(w.mobileMoveYaw,.2,'joystick holds a world heading while the view eases');
 w.applyLookDelta(20,0);const manual=w.cameraOrbit.follow.yaw;w.updateCamera(1/60,0);assert.equal(w.cameraOrbit.follow.yaw,manual,'manual drag pauses follow immediately');
 for(const mode of ['first-person','isometric']){w.setCameraMode(mode);w.lastManualLookAt=-Infinity;const before=w.cameraOrbit.follow.yaw;w.updateCamera(1/60,0);assert.equal(w.cameraOrbit.follow.yaw,before);}
 w.setMovementVector(0,0);assert.equal(w.mobileMoveYaw,undefined);
});

test('a cushion-fitted Palace attendee keeps a usable follow or isometric view over low chairs while real walls still stop the follow lens',()=>{
 for(const mode of ['follow','isometric']){
  const w=fixture(mode);delete w.pullCameraClearOfWalls;delete w.cameraClearReach;
  w.groundHeightAt=()=>.115;w.playerState='seated';w.activeSeat={id:'PALACE-1-1',venue:'palace',position:new THREE.Vector3(-40.5,0,-36.7)};
  // Production seat fit: the visual hips meet the cushion at y=.76 while the
  // attendee root sits at -.11. Its conservative movement box reaches 2.2.
  w.player.position.set(-40.5,-.11,-37.12);Object.assign(w.cameraOrbit.follow,{yaw:-.189,pitch:.3714885067805556});
  w.colliders=[];for(let row=0;row<3;row++)for(let column=-2;column<=2;column++){
   const x=-35+column*2.75,z=-36.7-row*3.05;w.colliders.push({minX:x-.74,maxX:x+.74,minZ:z-.705,maxZ:z+.705,minY:-.4,maxY:2.2});
  }
  const orbit={...w.cameraOrbit.follow};w.player.visible=true;w.updateCamera(1/60,0);
  assert.ok(w.camera.position.distanceTo(w.lookTarget)>10,'a conservative chair box collapsed the view onto the seated avatar');assert.equal(w.player.visible,true);
  assert.deepEqual(w.cameraOrbit.follow,orbit);assert.equal(w.cameraMode,mode);
  w.colliders.push({minX:-46,maxX:-24,minZ:-33,maxZ:-32,minY:0,maxY:10});w.cameraReach=0;w.player.visible=true;w.updateCamera(1/60,0);
  const reach=w.lookTarget.distanceTo(w.camera.position);
  // The isometric camera is never pulled in: the cutaway lens opens the hall instead.
  if(mode==='isometric')assert.ok(Math.abs(reach-ISOMETRIC_VIEW.distance)<1e-6);
  else{assert.ok(reach>1.4,'a real wall with a clear indoor interval must leave a usable shot');assert.ok(w.cameraClearReach(w.lookTarget,w.camera.position)>=reach-.001,'ignoring chairs must not allow the lens through masonry');}
  assert.deepEqual(w.cameraOrbit.follow,orbit);assert.equal(w.cameraMode,mode);assert.equal(w.camera.isOrthographicCamera,mode==='isometric');
 }
});

test('zoomed out or upright on a phone, the isometric box starts far enough back that nothing near the camera is sliced',()=>{
 const p=ISOMETRIC_VIEW.pitch;
 for(const [aspect,zoom] of [[1280/800,1],[1280/800,3],[402/874,1],[402/874,3],[874/402,.35]]){
  const c=new WorldCamera(58,aspect,.1,300);c.setIsometric(true,zoom);
  const extra=isometricExtraDepth(c.top),front=ISOMETRIC_VIEW.distance+extra;
  // The box's lowest front edge, above the look target, must clear rooftops and the planet's fall.
  assert.ok(front*Math.sin(p)-c.top*Math.cos(p)>=ISOMETRIC_VIEW.clearance-1e-9,`aspect ${aspect} zoom ${zoom}`);
  const box=[c.left,c.right,c.top,c.bottom];
  c.setIsometricBehind(extra);
  const behind=new THREE.Vector3(0,0,extra-.2).applyMatrix4(c.projectionMatrix).z;
  assert.ok(behind>=-1-1e-6&&behind<=1,'a point that far behind the camera is inside the box');
  assert.deepEqual([c.left,c.right,c.top,c.bottom],box,'the picture itself is unchanged');
 }
 assert.equal(isometricExtraDepth(0),Math.max(0,ISOMETRIC_VIEW.clearance/Math.sin(p)-ISOMETRIC_VIEW.distance));
});

test('indoors or out, the isometric camera is never pulled in, and its box always reaches back so nothing near it is sliced',()=>{
 const w=fixture('isometric');w.cameraZoom=1;let pulls=0;
 w.pullCameraClearOfWalls=(target)=>{pulls++;target.lerp(w.lookTarget,.8);};
 const world=Object.getPrototypeOf(w);
 // Outdoors on the square, and inside the temple, the Palace hall, the club and the pop-up shop.
 for(const [x,z,indoors] of [[0,3,false],[60,-30,false],[90,4,true],[-35,-40,true],[-70,21,true],[40,12,true]]){
  w.player.position.set(x,0,z);w.updateCamera(1/60,0);w.camera.updateMatrixWorld(true);
  assert.equal(world.isometricRoom.call(w)!==undefined,indoors,`${x},${z}`);
  assert.equal(pulls,0);
  assert.ok(Math.abs(w.camera.position.distanceTo(w.lookTarget)-ISOMETRIC_VIEW.distance)<1e-6);
  assert.ok(w.camera.orthographicBehind>0,'the box reaches back behind the camera');
 }
});

test('indoors in the isometric view a lens opens round the attendee, cutting the roof and the near walls; outdoors it stays shut',()=>{
 const w=fixture('isometric');w.cutawayLens=new CutawayLens();let floor=0;w.groundHeightAt=()=>floor+.28;
 const lens=cutawayUniforms.cutawayLens.value,near=cutawayUniforms.cutawayNear.value,levels=cutawayUniforms.cutawayLevels.value;
 const frame=(n=1)=>{for(let i=0;i<n;i++){w.updateCamera(1/60,0);w.updateIsometricCutaway(1/60);}};
 const groundOut=(x,z)=>Math.max(...[0,4,8,12].flatMap(dx=>[0,4,8,12].map(dz=>terrainHeightAt(x+dx,z+dz))));
 w.player.position.set(0,.28,3);frame();
 assert.equal(lens.z,0,'outdoors the lens is shut');
 // Into the pop-up shop under the deck: the lens opens like an iris, round the attendee's middle.
 w.player.position.set(40,.28,12);frame();
 const full=CUTAWAY_LENS.radius*Math.min(w.camera.right-w.camera.left,w.camera.top-w.camera.bottom);
 assert.ok(lens.z>0&&lens.z<full/2,`opens from nothing: ${lens.z}`);
 frame(120);
 assert.equal(lens.z,full,'the owner\'s large lens');assert.equal(lens.w,CUTAWAY_LENS.feather);
 const middle=w.player.position.clone();middle.y+=CUTAWAY_LENS.centre;middle.applyMatrix4(w.camera.matrixWorldInverse);
 assert.ok(Math.hypot(lens.x-middle.x,lens.y-middle.y)<1e-9,'centred on the attendee');
 const viewToWorld=new THREE.Vector3(1,2,-3).applyMatrix4(cutawayUniforms.cutawayToWorld.value);
 assert.ok(viewToWorld.distanceTo(new THREE.Vector3(1,2,-3).applyMatrix4(w.camera.matrixWorld))<1e-9);
 // The camera looks in from the +x, +z side: the near walls are the shop's east wall and the deck's side.
 assert.deepEqual([near.x,near.y],[1,1]);
 assert.ok(Math.abs(near.z-(58-CUTAWAY_LENS.wall))<1e-9&&Math.abs(near.w-(19-CUTAWAY_LENS.wall))<1e-9);
 // The roof is cut just under the deck slab over the shop (its underside is at 6.35).
 const shopSill=Math.max(0,groundOut(40,12))+CUTAWAY_LENS.sill;
 assert.ok(Math.abs(levels.x-shopSill)<1e-9&&Math.abs(levels.y-6.3)<1e-9);
 // A jump lifts the body, not the floor, so the cut stays where it is.
 w.player.position.y=2.4;frame();
 assert.ok(Math.abs(levels.x-shopSill)<1e-9&&Math.abs(levels.y-6.3)<1e-9);
 // On the deck over the shop the attendee is outdoors again, and the lens closes.
 w.player.position.set(40,7.28,12);frame(120);
 assert.equal(lens.z,0);
 // The club's floor is below the street: the near walls are cut to the street, never the ground outside,
 // and the roof under its tie beams, which cross the room from 12 up.
 floor=-1;w.player.position.set(-70,-.72,21);frame(120);
 assert.ok(levels.x>=CUTAWAY_LENS.sill-1e-9&&Math.abs(levels.y-11.8)<1e-9);
 // At the lobby's door the pavement outside is higher than the lobby floor: the near walls stop at it.
 floor=-.15;w.player.position.set(-23,.13,26);frame();
 const outside=groundOut(-23,26);
 assert.ok(outside>.3,'the street at the door stands above the lobby floor');
 assert.ok(Math.abs(levels.x-(outside+CUTAWAY_LENS.sill))<1e-9,'cut no lower than the ground outside');
 // The temple: cut under its ceiling, ten over the floor, well over the lanterns, which reach 11.55.
 floor=6;w.player.position.set(90,6.28,4);frame(120);
 assert.ok(Math.abs(levels.y-16)<1e-9&&levels.y>11.55+.2);assert.deepEqual([near.x,near.y],[1,1]);
 // The Palace hall: under its roof (10.04), over the screen's top edge (9.95).
 floor=.25;w.player.position.set(-35,.53,-40);frame();
 assert.ok(levels.y>9.95&&levels.y<10.04);
 // The temple's approach stairs: open ground with the temple on the camera's side. No near walls,
 // and the cut at least over the temple's floor, so the stairs and the attendee show through it.
 floor=3;w.player.position.set(70,3.28,4);frame();
 assert.ok(lens.z>0,'the lens stays open from the hall down the stairs');
 assert.ok(near.z>1e8&&near.w>1e8,'no near walls out of doors');
 assert.ok(Math.abs(levels.y-(3+CUTAWAY_LENS.overhead))<1e-9);
 floor=.3;w.player.position.set(66,.58,4);frame();
 assert.ok(Math.abs(levels.y-(6+CUTAWAY_LENS.sill))<1e-9,'never lower than the temple floor, so its podium and the hill stay whole');
 // Out of the isometric view it shuts at once.
 w.setCameraMode('follow');frame();
 assert.equal(lens.z,0);
});
