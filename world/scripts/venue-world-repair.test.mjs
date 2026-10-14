import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build } from 'esbuild';

// Canvas draws are irrelevant to movement/geometry; retain the actual world
// builders and collision solver, without constructing a WebGL renderer.
const context=new Proxy({measureText:text=>({width:text.length*40})},{get:(target,key)=>key in target?target[key]:()=>{}});
globalThis.document={createElement:()=>({getContext:()=>context})};
const compiled=await build({stdin:{contents:"export {FestivalWorld,boxGeometry} from './src/world/FestivalWorld'; export {MothArcadeCabinet} from './src/world/MothArcade'; export {applyWornStyle} from './src/world/WornStyle'; export * from './src/world/CoastalVenues'; export * from './src/world/CoastalTerrain'; export * from './src/world/CoastalCollision'; export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false,plugins:[{name:'expose-shared-geometry',setup(b){b.onLoad({filter:/FestivalWorld\.ts$/},async({path})=>({contents:await readFile(path,'utf8')+'\nexport {boxGeometry};',loader:'ts',resolveDir:dirname(path)}));}}]});
const {FestivalWorld,boxGeometry,MothArcadeCabinet,applyWornStyle,SHORE_SIGN,SCREENING_SITES,VENUE_STANDS,terrainHeightAt,createCoastalTerrain,createGroundRibbon,moveCoastalBody,THREE}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
function worldFixture(){
 const w=Object.create(FestivalWorld.prototype);
 Object.assign(w,{scene:new THREE.Scene(),colliders:[],seats:[],projectors:new Map(),venueSignMaterials:new Map(),graphicsMode:'normal',createProjectorSurface(){},venueSceneryAssets:{attach:async()=>{}}});
 return w;
}
test('the arcade base reaches the rendered ground without the jukebox clearance lift',()=>{
 const w=worldFixture(),arcade=Object.create(MothArcadeCabinet.prototype);arcade.root=new THREE.Group();
 arcade.root.position.set(21,.24,11.6525);arcade.root.rotation.y=-Math.PI/2;
 const body=new THREE.Mesh(new THREE.BoxGeometry(1.81,3.8,2.11));body.position.y=1.9;arcade.root.add(body);
 w.arcadeCabinet=arcade;w.scene.add(arcade.root,createCoastalTerrain());
 const collider={label:'moth-arcade',maxY:4.04};w.colliders.push(collider);
 w.seatArcadeOnGround();
 assert.ok(Math.abs(arcade.root.position.y-(terrainHeightAt(21,11.6525)+.01))<1e-6,'a level floor must not leave the previous 0.24 clearance gap');
 assert.equal(arcade.root.position.x,21);assert.equal(arcade.root.position.z,11.6525);
 let support=arcade.root.getObjectByName('Arcade grounded rubber plinth');assert.ok(support);
 let bounds=new THREE.Box3().setFromObject(support);assert.ok(bounds.min.y<terrainHeightAt(21,11.6525));
 assert.ok(bounds.max.y>arcade.root.position.y,'support must overlap the cabinet body');
 // A thin raised strip through the centre is missed by four corner samples.
 // The actual raycast must seat above it while keeping the low edges founded.
 const paving=createGroundRibbon('Arcade floor seam',[[21,10],[21,13]],.5,new THREE.MeshBasicMaterial(),.055);
 w.scene.add(paving);w.seatArcadeOnGround();
 assert.ok(Math.abs(arcade.root.position.y-(terrainHeightAt(21,11.6525)+.065))<1e-6);
 support=arcade.root.getObjectByName('Arcade grounded rubber plinth');bounds=new THREE.Box3().setFromObject(support);
 assert.ok(bounds.min.y<terrainHeightAt(21,11.6525));assert.ok(bounds.max.y>arcade.root.position.y);
 assert.equal(arcade.root.children.filter(o=>o.name==='Arcade grounded rubber plinth').length,1,'refitting cannot accumulate duplicate supports');
 assert.equal(collider.maxY,arcade.root.position.y+3.8);
 assert.equal(body.position.y,1.9,'floor seating must not deform the authored cabinet');
});
test('arcade camera stays on the physical screen with a transformed desktop VR parent',()=>{
 const w=worldFixture(),parent=new THREE.Group(),screen=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1));
 screen.position.set(21,2.5,11.65);screen.rotation.set(-.18,-Math.PI/2,0);screen.updateMatrixWorld(true);
 const frame={centre:screen.position.clone(),normal:new THREE.Vector3(0,0,1).applyQuaternion(screen.quaternion),quaternion:screen.quaternion.clone(),width:1.2,height:1};
 Object.assign(w,{camera:new THREE.PerspectiveCamera(50,16/9,.1,100),player:new THREE.Group(),arcadeSession:{frame},xrActive:true,xrSimulated:true,xrYaw:.7,xrSimPitch:.2});
 parent.position.set(17,.28,11.65);parent.rotation.y=.7;parent.add(w.camera);
 const expected=frame.centre.clone().addScaledVector(frame.normal,frame.height/(2*Math.tan(THREE.MathUtils.degToRad(25))*.72));
 for(const yaw of [.7,-1.5,2.2]){
  parent.rotation.y=yaw;w.updateCamera(1/60,0);w.camera.updateWorldMatrix(true,false);
  assert.ok(w.camera.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-8);
  const towards=frame.centre.clone().sub(expected).normalize();
  assert.ok(w.camera.getWorldDirection(new THREE.Vector3()).distanceTo(towards)<1e-8);
  w.applyLookDelta(100,-80);assert.equal(w.xrYaw,.7);assert.equal(w.xrSimPitch,.2);
  assert.equal(w.player.visible,false);
 }
 w.camera.aspect=.45;w.camera.updateProjectionMatrix();w.updateCamera(1/60,0);w.camera.updateWorldMatrix(true,false);
 const right=new THREE.Vector3(1,0,0).applyQuaternion(frame.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(frame.quaternion);
 for(const x of [-1,1])for(const y of [-1,1]){
  const p=frame.centre.clone().addScaledVector(right,x*frame.width/2).addScaledVector(up,y*frame.height/2).project(w.camera);
  assert.ok(Math.abs(p.x)<1 && Math.abs(p.y)<1,'a narrow desktop window must keep the entire game screen in view');
 }
});
test('arcade movement is held at zero and exiting clears held inputs and the screen aperture',()=>{
 const w=worldFixture(),aperture=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1)),parent=new THREE.Scene();parent.add(aperture);
 let disposed=0,geometryDisposed=0;aperture.geometry.addEventListener('dispose',()=>geometryDisposed++);
 Object.assign(w,{arcadeSession:{dispose(){disposed++;}},arcadeAperture:aperture,arcadeScreenLayout:()=>{},keys:new Set(['KeyW']),stickX:1,stickY:1,running:true});
 w.setMovementVector(1,-1);assert.equal(w.stickX,0);assert.equal(w.stickY,0);
 w.stopArcadeGame();assert.equal(disposed,1);assert.equal(geometryDisposed,1);assert.equal(parent.children.length,0);
 assert.equal(w.arcadeSession,undefined);assert.equal(w.arcadeAperture,undefined);assert.equal(w.arcadeScreenLayout,undefined);assert.equal(w.keys.size,0);assert.equal(w.stickX,0);assert.equal(w.stickY,0);assert.equal(w.running,false);
});
test('short and narrow desktop windows keep the complete screen centered for its integrated exit control',()=>{
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1));
 screen.position.set(21,2.5,11.65);screen.rotation.order='YXZ';screen.rotation.set(-.18,-Math.PI/2,0);screen.updateMatrixWorld(true);
 const frame={centre:screen.position.clone(),normal:new THREE.Vector3(0,0,1).applyQuaternion(screen.quaternion),quaternion:screen.quaternion.clone(),width:1.2,height:1};
 const right=new THREE.Vector3(1,0,0).applyQuaternion(frame.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(frame.quaternion);
 for(const width of [1024,390]){
  const height=480,w=worldFixture();
  Object.assign(w,{camera:new THREE.PerspectiveCamera(50,width/height,.1,100),player:new THREE.Group(),arcadeSession:{frame},foregroundCanvas:{clientHeight:height}});
  w.updateCamera(1/60,0);w.camera.updateWorldMatrix(true,false);
  const centre=frame.centre.clone().project(w.camera);
  assert.ok(Math.abs(centre.x)<1e-8 && Math.abs(centre.y)<1e-8,'the screen must stay centered after removing the external HUD reserve');
  for(const x of [-1,1])for(const y of [-1,1]){
   const p=frame.centre.clone().addScaledVector(right,x*frame.width/2).addScaledVector(up,y*frame.height/2).project(w.camera);
   assert.ok(Math.abs(p.x)<1 && Math.abs(p.y)<1,'the whole orange game interface must remain within the viewport');
  }
 }
});
test('building the real Shore feet cannot deform shared walls, stairs or screen supports',()=>{
 const before=Array.from(boxGeometry.attributes.position.array),normals=Array.from(boxGeometry.attributes.normal.array);
 const w=worldFixture(),site=SCREENING_SITES.shore;
 w.buildOnGrade(()=>w.createShoreScreen(),site.grade,site.dx,site.dz);
 assert.deepEqual(Array.from(boxGeometry.attributes.position.array),before);
 assert.deepEqual(Array.from(boxGeometry.attributes.normal.array),normals);
 const board=w.scene.children.find(n=>n.name==='Framed enamel sign');
 assert.equal(board.position.x,SHORE_SIGN.x);assert.equal(board.position.z,SHORE_SIGN.z);
 const feet=board.children.filter(n=>n.scale.x===.6);
 assert.equal(feet.length,2);assert.ok(feet.every(n=>n.geometry!==boxGeometry));
 for(const foot of feet){foot.updateWorldMatrix(true,false);const p=foot.geometry.attributes.position;for(let i=0;i<p.count;i++){
  const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(foot.matrixWorld);
  // Both surfaces follow the same slope; inspect the lower face separately.
  if(before[i*3+1]===-.5)assert.ok(Math.abs(v.y-terrainHeightAt(v.x,v.z))<.00001,'foot leaves ground');
 }}
});
test('the actual Shore board blocks movement across its centre and both posts after relocation',()=>{
 const w=worldFixture(),site=SCREENING_SITES.shore;w.buildOnGrade(()=>w.createShoreScreen(),site.grade,site.dx,site.dz);
 const solids=w.colliders.filter(c=>c.label?.startsWith('shore-programme'));
 assert.equal(solids.length,3);
 const board=solids.find(c=>c.label==='shore-programme-board');
 assert.ok(Math.abs((board.minX+board.maxX)/2-(SHORE_SIGN.x-.1*Math.sin(SHORE_SIGN.rotation)))<1e-6);
 assert.ok(Math.abs((board.minZ+board.maxZ)/2-(SHORE_SIGN.z-.1*Math.cos(SHORE_SIGN.rotation)))<1e-6);
 for(const c of solids){
  const x=(c.minX+c.maxX)/2,z=(c.minZ+c.maxZ)/2,y=terrainHeightAt(x,z)+.28;
  for(const direction of [-1,1]){
   const start={x,y,z:z+direction*2};const r=moveCoastalBody(start,0,-direction*4,.6,solids,terrainHeightAt);
   assert.ok(direction*(r.z-z)>.6,'avatar passed through board/post');
  }
 }
});
test('new ticket stands block avatars from all sides including elevated body overlaps',()=>{
 const w=worldFixture();w.venueSignMaterials.set('drive-in',new THREE.MeshBasicMaterial());w.createVenueEntrances();
 for(const label of ['drive-in-ticket-booth','palace-ticket-stand','palace-ticket-inspector']){
  const c=w.colliders.find(c=>c.label===label),x=(c.minX+c.maxX)/2,z=(c.minZ+c.maxZ)/2;
  assert.equal(c.physical,true);
  for(const y of [c.minY+.28,c.maxY-.1])for(const axis of ['x','z'])for(const sign of [-1,1]){
   const extent=axis==='x'?(c.maxX-c.minX)/2:(c.maxZ-c.minZ)/2;
   const start={x,y,z};start[axis]+=sign*(extent+2);
   const move=sign*-6;const r=moveCoastalBody(start,axis==='x'?move:0,axis==='z'?move:0,.6,[c],()=>y,true);
   assert.ok(sign*(r[axis]-(axis==='x'?x:z))>=extent+.59,`${label} crossed from ${axis}`);
  }
 }
});
test('the town style pass preserves authored generated normals and PBR maps',()=>{
 const mat=new THREE.MeshStandardMaterial({roughness:.45,metalness:.12,normalMap:new THREE.Texture(),map:new THREE.Texture()});
 mat.userData.preserveAuthoredSurface=true;const shader=mat.onBeforeCompile,map=mat.map,normalMap=mat.normalMap;
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),mat);mesh.userData.wornNoMasonry=true;
 applyWornStyle(mesh);
 assert.equal(mat.flatShading,false);assert.equal(mat.normalMap,normalMap);assert.equal(mat.map,map);
 assert.equal(mat.roughness,.45);assert.equal(mat.metalness,.12);assert.equal(mat.onBeforeCompile,shader);assert.equal(mat.userData.wornPatched,undefined);
});

test('shop reach works at the counter but excludes the rooftop at identical coordinates',()=>{
 const w=worldFixture();w.player=new THREE.Group();w.shopCounter={x:40,y:.28,z:3.4};
 for(const x of [28,40,52]){
  w.player.position.set(x,.28,3.4);assert.equal(w.nearShopCounter(),true);
  w.player.position.y=8.5;assert.equal(w.nearShopCounter(),false);
 }
 w.player.position.set(40,.28,9);assert.equal(w.nearShopCounter(),false);
});
test('opening dance selection does not start dancing, and selection or stop determines the gesture',()=>{
 const w=worldFixture(),actions=[];
 Object.assign(w,{playerState:'standing',dancing:false,menuOpen:false,isMentorControlLocked:()=>false,onAction:a=>actions.push(a)});
 w.requestDanceSelection();assert.equal(w.dancing,false);assert.deepEqual(actions.pop(),{type:'danceSelection',active:false});
 w.selectDance('groove');assert.equal(w.dancing,true);
 w.requestDanceSelection();assert.equal(w.dancing,true);assert.deepEqual(actions.pop(),{type:'danceSelection',active:true});
 w.selectDance('stop');assert.equal(w.dancing,false);
 const count=actions.length;w.menuOpen=true;w.requestDanceSelection();assert.equal(actions.length,count);
 w.menuOpen=false;w.playerState='seated';w.requestDanceSelection();w.selectDance('groove');assert.equal(w.dancing,false);assert.equal(actions.length,count);
});
