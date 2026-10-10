import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build } from 'esbuild';

// Canvas draws are irrelevant to movement/geometry; retain the actual world
// builders and collision solver, without constructing a WebGL renderer.
const context=new Proxy({measureText:text=>({width:text.length*40})},{get:(target,key)=>key in target?target[key]:()=>{}});
globalThis.document={createElement:()=>({getContext:()=>context})};
const compiled=await build({stdin:{contents:"export {FestivalWorld,boxGeometry} from './src/world/FestivalWorld'; export {applyWornStyle} from './src/world/WornStyle'; export * from './src/world/CoastalVenues'; export * from './src/world/CoastalTerrain'; export * from './src/world/CoastalCollision'; export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false,plugins:[{name:'expose-shared-geometry',setup(b){b.onLoad({filter:/FestivalWorld\.ts$/},async({path})=>({contents:await readFile(path,'utf8')+'\nexport {boxGeometry};',loader:'ts',resolveDir:dirname(path)}));}}]});
const {FestivalWorld,boxGeometry,applyWornStyle,SHORE_SIGN,SCREENING_SITES,VENUE_STANDS,terrainHeightAt,moveCoastalBody,THREE}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
function worldFixture(){
 const w=Object.create(FestivalWorld.prototype);
 Object.assign(w,{scene:new THREE.Scene(),colliders:[],seats:[],projectors:new Map(),venueSignMaterials:new Map(),graphicsMode:'normal',createProjectorSurface(){},venueSceneryAssets:{attach:async()=>{}}});
 return w;
}
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
