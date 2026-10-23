import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {ROOFTOP_STAIR_OPEN_GUARD,rooftopStairGuardCameraTop,rooftopStairCameraFloor,rooftopStairPassesSlenderPole} from '../src/world/RooftopCamera.ts';
import {WorldCamera,ISOMETRIC_VIEW} from '../src/world/WorldCamera.ts';

// Real rooftop builders, real height field, real shared orbit and obstruction
// solver. Only canvas/asset decoding and rendering are omitted in this fixture.
const context=new Proxy({measureText:text=>({width:text.length*40})},{get:(target,key)=>key in target?target[key]:()=>{}});
globalThis.document={createElement:()=>({getContext:()=>context,addEventListener(){},removeEventListener(){},set src(v){}}),createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(v){}})};
globalThis.Image=class {addEventListener(){} removeEventListener(){} set src(v){}};
const compiled=await build({stdin:{contents:"export {FestivalWorld} from './src/world/FestivalWorld'; export {CoastalScenery} from './src/world/CoastalScenery'; export {moveCoastalBody} from './src/world/CoastalCollision'; export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
const {FestivalWorld,CoastalScenery,moveCoastalBody,THREE}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const bounds={minX:22,stairMinX:17.8,stairMaxX:21.4,stairMinZ:20,stairLandingMinZ:25.04,stairLandingMaxZ:28.64,stairTopZ:33.68,stairMaxZ:36.5};
const PITCH=Math.atan2(3.4,10);
function fixture(mode='follow',yaw=-Math.PI/2,pitch=PITCH){
 const w=Object.create(FestivalWorld.prototype);
 Object.assign(w,{scene:new THREE.Scene(),colliders:[],seats:[],projectors:new Map(),venueSignMaterials:new Map(),clubLights:[],player:new THREE.Group(),graphicsMode:'normal',createProjectorSurface(){},venueSceneryAssets:{attach:async()=>{}}});
 w.createRooftop();w.paving=[];w.kerbStones=[];
 Object.assign(w,{camera:new WorldCamera(),cameraMode:mode,cameraZoom:1,cameraReach:0,playerState:'walking',cameraOrbit:{follow:{yaw,pitch}},lookTarget:new THREE.Vector3(),cameraProbe:new THREE.Vector3(),cameraScratch:new THREE.Vector3(),wallAvoidance:{side:0,offset:0},settlePunchImpact(){},applyCameraShake(){},applyDrunkenView(){}});
 return w;
}
function at(w,x,z){w.player.position.set(x,w.groundHeightAt(x,z,.28),z);w.updateCamera(1/60,0);return w.camera.position.distanceTo(w.lookTarget);}
function addActualTown(w){
 const town=new CoastalScenery(w.scene,(x,z,width,depth,base,top,label)=>{
  w.addCollider(x,z,width,depth,.08,{minY:base,maxY:top},label,top);
  w.colliders.at(-1).physical=true;
 },()=>true);
 town.buildTown();return town;
}

test('the camera-only guard envelope contains the real sloping rail beams',()=>{
 const w=fixture(),rails=[];w.scene.traverse(object=>{if(object.name==='NIMA stair guard rail')rails.push(object);});
 assert.equal(rails.length,1,'the continuous rails and their feet share one static mesh');
 assert.equal(w.scene.userData.rooftopStairGuardReport.railSegments,10,'use the actual two flights, landing and gooseneck beams');
 for(const rail of rails){
  rail.updateWorldMatrix(true,false);const positions=rail.geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){
   const vertex=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(rail.matrixWorld);
   assert.ok(vertex.y<=rooftopStairGuardCameraTop(vertex.z,bounds,7)+1e-5,`visible rail escaped camera envelope atz=${vertex.z}`);
  }
 }
});

test('the real lower open guard no longer masquerades as a wall to the deck coping',()=>{
 const w=fixture(),guard=w.colliders.find(c=>c.label===ROOFTOP_STAIR_OPEN_GUARD);
 assert.ok(guard,'the real builder must identify only the open rail collider');
 const physical={...guard};
 assert.equal(guard.maxY,8.5,'retain the movement barrier and jump contract');
 assert.ok(rooftopStairGuardCameraTop(22,bounds,7)<3.5);
 // Reproduce the previous code with the same real collider and camera ray.
 guard.label=undefined;
 assert.ok(at(w,19.6,22)<3,'the old full-height open-guard box must reproduce the reported close view');
 guard.label=ROOFTOP_STAIR_OPEN_GUARD;w.cameraReach=0;
 assert.ok(Math.abs(at(w,19.6,22)-10.56)<1e-8,'the actual shared camera must retain its full selected orbit');
 assert.deepEqual(guard,physical,'camera correction cannot change physical collision bounds');
});

test('both walk directions keep ordinary framing over both flights and landings from the open side',()=>{
 for(const mode of ['follow'])for(const yaw of [-Math.PI/2,-1.8,-2.2,Math.PI]){
  const w=fixture(mode,yaw),radius=10.56;
  const expectedDirection=new THREE.Vector3(-Math.sin(yaw)*Math.cos(PITCH),-Math.sin(PITCH),-Math.cos(yaw)*Math.cos(PITCH));
  for(const direction of [1,-1])for(let i=0;i<=320;i++){
   const z=direction===1?20.05+i*.05:36.05-i*.05;
   const reach=at(w,19.6,z);
   assert.ok(Math.abs(reach-radius)<1e-8,`${mode} yaw=${yaw} z=${z}: shortened ${radius} to ${reach}; pivot=${w.lookTarget.toArray()} camera=${w.camera.position.toArray()}`);
   assert.ok(w.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expectedDirection)<1e-8,'stair membership changed yaw or pitch');
   assert.equal(w.cameraZoom,1);assert.equal(w.wallAvoidance.offset,0);
  }
 }
});

test('a fixed isometric view keeps orthographic scale on the real outdoor stair, and draws the masonry whole instead of slicing it',()=>{
 const w=fixture('isometric'),expected=new THREE.Vector3(-Math.sin(ISOMETRIC_VIEW.yaw)*Math.cos(ISOMETRIC_VIEW.pitch),-Math.sin(ISOMETRIC_VIEW.pitch),-Math.cos(ISOMETRIC_VIEW.yaw)*Math.cos(ISOMETRIC_VIEW.pitch));
 const physical=w.colliders.map(c=>({...c}));
 for(const zoom of [.8,1,1.5])for(const direction of [1,-1])for(let i=0;i<=320;i++){
  const z=direction===1?20.05+i*.05:36.05-i*.05;w.cameraZoom=zoom;
  const reach=at(w,19.6,z);
  assert.equal(w.camera.isOrthographicCamera,true);
  assert.ok(Math.abs((w.camera.right-w.camera.left)-ISOMETRIC_VIEW.span*zoom)<1e-8,'camera clearance must not change isometric image scale');
  assert.ok(w.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected)<1e-8,'stair membership changed the fixed diagonal');
  // Outdoors (owner, 2026-10-22): no pull-in, so no near cut through the stair or the shop; the box reaches behind the lens.
  assert.ok(Math.abs(w.camera.position.distanceTo(w.lookTarget)-ISOMETRIC_VIEW.distance)<1e-6,'outdoors the isometric camera is never pulled in');
  assert.ok(w.camera.orthographicBehind>0,'and the box starts behind it, so nothing near the camera is sliced');
  assert.equal(w.cameraZoom,zoom);assert.equal(w.wallAvoidance.offset,0);
 }
 assert.deepEqual(w.colliders,physical,'isometric probes cannot change physical stair barriers');
});

test('the real east stringer and shop masonry continue to stop the camera',()=>{
 const w=fixture('follow',Math.PI/2),guard=w.colliders.find(c=>c.label===ROOFTOP_STAIR_OPEN_GUARD);
 assert.ok(guard);
 for(const z of [20.8,22,24,26,29,31]){
  w.cameraReach=0;const reach=at(w,19.6,z);
  assert.ok(reach<6,'the solid east stringer must retain camera occlusion');
  assert.ok(w.cameraClearReach(w.lookTarget,w.camera.position)>=reach-.001,'final camera ray crossed masonry');
 }
 const original={...guard};at(w,19.6,22);
 assert.deepEqual(guard,original,'probing cannot mutate the shared movement collider');
});

test('the uphill ray above real treads keeps its distance over the half-landing',()=>{
 const w=fixture('follow',0),originalHeight=w.groundHeightAt.bind(w);
 const expectedPhysical=rooftopStairCameraFloor(19.6,33.6,bounds,7);
 assert.ok(Math.abs(expectedPhysical-6.65)<1e-8,'the last actual tread is below the interpolated avatar height');
 assert.equal(rooftopStairCameraFloor(16,26,bounds,7),undefined);
 assert.equal(rooftopStairCameraFloor(30,26,bounds,7),undefined);
 // Same position and selected orbit: the old avatar pitch-line answer says
 // this point is blocked, despite a clear gap above the rendered last tread.
 const eyeY=3.78+1.4,eyeZ=28.5-2.2;
 const rayY=eyeY+(33.6-eyeZ)*Math.tan(PITCH);
 assert.ok(rayY<originalHeight(19.6,33.6,.28)+.45,'reproduce the old false ground blockage');
 assert.ok(rayY>expectedPhysical+.45,'the actual masonry leaves the requested clearance');
 for(const z of [28.2,28.3,28.4,28.5,28.6]){
  w.cameraReach=0;assert.ok(Math.abs(at(w,19.6,z)-10.56)<1e-8,`half-landingz=${z} falsely shortened the clear ray`);
 }
});

test('the actual town utility pole does not zoom the stair camera and still stops the body',()=>{
 const w=fixture();addActualTown(w);
 const pole=w.colliders.find(c=>c.label==='utility-pole'&&Math.abs((c.minZ+c.maxZ)/2-21.5)<1e-8);
 assert.ok(pole,'the real CoastalScenery builder must place the reported pole');
 const original={...pole};
 // A different solid label reproduces the previous pole-as-wall camera rule.
 pole.label='solid-camera-pole';
 assert.ok(at(w,19.6,21.28156)<8,'reproduce the real browser 7.835-unit close view');
 pole.label='utility-pole';w.cameraReach=0;
 assert.ok(Math.abs(at(w,19.6,21.28156)-10.56)<1e-8,'a slender post must not shorten the ordinary stair orbit');
 assert.deepEqual(pole,original,'camera classification cannot alter physical bounds');
 for(const sign of [-1,1]){
  const y=pole.minY+.28,start={x:13+sign*2,y,z:21.5};
  const moved=moveCoastalBody(start,-sign*4,0,.6,[pole],()=>y);
  assert.ok(sign*(moved.x-13)>.86,'body crossed the real utility pole');
 }
});

test('real town poles preserve full framing throughout a moving climb and descent',()=>{
 const w=fixture();addActualTown(w);
 for(const direction of [1,-1])for(let i=0;i<=320;i++){
  const z=direction===1?20.05+i*.05:36.05-i*.05;
  const reach=at(w,19.6,z);
  assert.ok(Math.abs(reach-10.56)<1e-8,`town ${direction} z=${z}: orbit ${reach}`);
 }
});

test('slender-pole treatment is limited to known thin utility poles viewed from the stair',()=>{
 const pole={label:'utility-pole',minX:12.72,maxX:13.28,minZ:21.22,maxZ:21.78,minY:0,maxY:9};
 assert.equal(rooftopStairPassesSlenderPole(pole,19.6,21.5,bounds),true);
 assert.equal(rooftopStairPassesSlenderPole(pole,19.6,35,bounds),true);
 for(const c of [{...pole,label:'wall'},{...pole,maxX:14},{...pole,maxZ:23},{...pole,maxY:undefined},{...pole,maxY:1}]){
  assert.equal(rooftopStairPassesSlenderPole(c,19.6,21.5,bounds),false,'wide or unknown solids must keep ordinary wall avoidance');
 }
 for(const [x,z] of [[10,21.5],[23,21.5],[19.6,15],[19.6,40]])assert.equal(rooftopStairPassesSlenderPole(pole,x,z,bounds),false,'the exception cannot escape the stair footprint');
});
