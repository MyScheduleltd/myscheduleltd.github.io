import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {build} from 'esbuild';

const context=new Proxy({measureText:text=>({width:text.length*40})},{get:(target,key)=>key in target?target[key]:()=>{}});
globalThis.document={createElement:()=>({getContext:()=>context}),createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(v){}})};
globalThis.Image=class{addEventListener(){}removeEventListener(){}set src(v){}};
globalThis.window={location:new URL('http://127.0.0.1/'),setTimeout,clearTimeout};
const compiled=await build({stdin:{contents:"export {FestivalWorld,TEMPLE_GRADE,TEMPLE_STAIRS,SEA_Y} from './src/world/FestivalWorld';export {FestivalWeather} from './src/world/FestivalWeather';export {buildSnowSurfaceMeshes,SNOW_SURFACE_BUDGET} from './src/world/SnowSurfaceCoverage';export {SCREENING_SITES} from './src/world/CoastalVenues';export {setIslandTerrain,terrainHeightAt,INLAND_HOUSES} from './src/world/CoastalTerrain';export {CoastalScenery} from './src/world/CoastalScenery';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';export {createBeachRelaxation} from './src/world/BeachRelaxation';export {batchStaticScenery} from './src/world/StaticBatch';export {PLANET,subdivideSceneForPlanet} from './src/world/PlanetCurve';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false,plugins:[{name:'expose-authored-world-constants',setup(b){b.onLoad({filter:/FestivalWorld\.ts$/},async({path})=>({contents:await readFile(path,'utf8')+'\nexport {TEMPLE_GRADE,TEMPLE_STAIRS,SEA_Y};',loader:'ts',resolveDir:dirname(path)}));b.onLoad({filter:/FestivalAttendant\.ts$/},()=>({contents:'export function createFestivalAttendant(parent){return {root:parent,rig:{}};}',loader:'js'}));}}]});
const {FestivalWorld,FestivalWeather,TEMPLE_GRADE,TEMPLE_STAIRS,SEA_Y,buildSnowSurfaceMeshes,SNOW_SURFACE_BUDGET,SCREENING_SITES,setIslandTerrain,terrainHeightAt,INLAND_HOUSES,CoastalScenery,GLTFLoader,createBeachRelaxation,batchStaticScenery,PLANET,subdivideSceneForPlanet,THREE}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text+'\n//# sourceURL=weather-world-surfaces-fixture.mjs').toString('base64'));
// The real booth geometry and node transforms, without image decoding. No
// rendered/material estimate is derived from this CPU-only loader fixture.
const boothBytes=await readFile('src/assets/venue-scenery/box-office.glb'),boothJsonLength=boothBytes.readUInt32LE(12);
const boothJson=JSON.parse(boothBytes.subarray(20,20+boothJsonLength).toString());boothJson.materials=boothJson.materials.map(()=>({pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}));
const jsonBytes=Buffer.from(JSON.stringify(boothJson)),jsonPadding=(4-jsonBytes.length%4)%4,jsonChunk=Buffer.concat([jsonBytes,Buffer.alloc(jsonPadding,32)]),binChunk=boothBytes.subarray(20+boothJsonLength),cleanGlb=Buffer.alloc(20+jsonChunk.length+binChunk.length);
cleanGlb.writeUInt32LE(0x46546c67,0);cleanGlb.writeUInt32LE(2,4);cleanGlb.writeUInt32LE(cleanGlb.length,8);cleanGlb.writeUInt32LE(jsonChunk.length,12);cleanGlb.writeUInt32LE(0x4e4f534a,16);jsonChunk.copy(cleanGlb,20);binChunk.copy(cleanGlb,20+jsonChunk.length);
const boothModel=(await new GLTFLoader().parseAsync(cleanGlb.buffer.slice(cleanGlb.byteOffset,cleanGlb.byteOffset+cleanGlb.byteLength),'')).scene;
setIslandTerrain(true);
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const bytes=g=>Object.values(g.attributes).reduce((sum,a)=>sum+a.array.byteLength,g.index?.array.byteLength??0);
function fixture(){
 const w=Object.create(FestivalWorld.prototype);
 Object.assign(w,{scene:new THREE.Scene(),player:new THREE.Group(),colliders:[],seats:[],projectors:new Map(),venueSignMaterials:new Map(),clubLights:[],clubBeatLights:[],clubFloorPanels:[],paving:[],wishWallNotes:[],graphicsMode:'normal',templeSignText:{name:'美麗仙人',label:'TEMPLE'},dayNight:{addLampLight(){},addLampMaterial(){}},createProjectorSurface(){},venueSceneryAssets:{registerFestivalAttendant(){},attach:async(kind,parent,height,fallback)=>{
  if(kind!=='boxOffice')return;const model=boothModel.clone(true),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());model.scale.set(4.8/size.x,height/size.y,4/size.z);model.position.set(-(bounds.min.x+bounds.max.x)*model.scale.x/2,-bounds.min.y*model.scale.y,-(bounds.min.z+bounds.max.z)*model.scale.z/2);parent.add(model);fallback.visible=false;
 }}});
 w.createPalace();w.createClub();w.createRooftop();w.createConcession();w.buildOnGrade(()=>w.createTemple(),TEMPLE_GRADE);
 const drive=SCREENING_SITES['drive-in'];w.buildOnGrade(()=>w.createDriveIn(),drive.grade,drive.dx,drive.dz);
 const shore=SCREENING_SITES.shore;w.buildOnGrade(()=>w.createShoreScreen(),shore.grade,shore.dx,shore.dz);
 w.createWesternBlock();w.createWishWall();w.createVenueEntrances();
 const scenery=new CoastalScenery(w.scene,()=>{},()=>false);scenery.buildTown();scenery.buildCirculation();scenery.finish();w.snowSurfaceSources.push(...scenery.takeSnowSurfaceSources());
 const sea=new THREE.ShaderMaterial({uniforms:{uFadeDistance:{value:0},uDeepOpacity:{value:0}}});
 w.surroundIsland(new THREE.Mesh(new THREE.PlaneGeometry(1,1)),new THREE.Mesh(new THREE.PlaneGeometry(1,1)),sea);
 w.beachRelaxation=createBeachRelaxation({heightAt:(x,z)=>w.groundHeightAt(x,z,0)-.28,
  clear:b=>!w.colliders.some(c=>b.minX<c.maxX+.15&&b.maxX>c.minX-.15&&b.minZ<c.maxZ+.15&&b.maxZ>c.minZ-.15&&b.minY<(c.maxY??Infinity)&&b.maxY>(c.minY??-Infinity))});
 w.scene.add(w.beachRelaxation.root);
 w.scene.updateWorldMatrix(true,true);return w;
}
const surfaceFixture=fixture();
const registry=surfaceFixture.snowSurfaceSources;
let extracted;
function authored(){return extracted??=buildSnowSurfaceMeshes(registry);}
function snowHeightAt(x,z){const mesh=new THREE.Mesh(authored().geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh,false)[0]?.point.y;}
function actualTopAt(x,z){
 const candidates=[];
 for(const source of registry){const excluded=new Set(source.exclude??[]);const visit=o=>{if(excluded.has(o))return;if(o.isMesh)candidates.push(o);o.children.forEach(visit);};visit(source.object);}
 return new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObjects(candidates,false)[0]?.point.y;
}

test('actual World builders register every roof, tier, stair, landing, canopy and fixed dock once',()=>{
 const ids=registry.map(s=>s.id);assert.equal(ids.length,new Set(ids).size);
 const expected=['palace-roof',...Array.from({length:7},(_,i)=>`club-roof-${i+1}`),'club-entry-canopy','temple-podium',...Array.from({length:TEMPLE_STAIRS.count},(_,i)=>`temple-step-${i+1}`),'temple-roof-lower','temple-roof-upper','temple-roof-connector','temple-finial','shop-roof','rooftop-deck',...['lower','upper'].flatMap(f=>Array.from({length:9},(_,i)=>`rooftop-stair-${f}-tread-${i+1}`)),'rooftop-stair-middle-landing','rooftop-stair-top-landing','rooftop-stair-deck-seam','rooftop-stair-foot','concession-canopy','island-dock','western-block-roof','wish-wall-roof','drive-in-box-office-roof',...Array.from({length:3},(_,i)=>`coastal-palace-crown-${i+1}`),'coastal-palace-marquee','coastal-shop-canopy',...INLAND_HOUSES.flatMap((_,i)=>['roof','doorhood','doorstep','balcony-1','balcony-2'].map(part=>`coastal-dorm-${i+1}-${part}`)),...Array.from({length:2},(_,i)=>`coastal-gate-pylon-${i+1}`)];
 assert.deepEqual([...ids].sort(),expected.sort());assert.equal(ids.length,95);
 for(const s of registry){assert.ok(s.object.parent||s.id.startsWith('coastal-'),'source is the authored scene object or exact premerge town geometry');assert.equal(s.object.userData.snowApproximation,undefined);}
 const booth=registry.find(s=>s.id==='drive-in-box-office-roof');assert.equal(booth.visibleOnly,true);assert.equal(booth.exclude[0].name,'Unlisted box office attendant');assert.equal(booth.object.children[0].visible,false,'the measured fixture uses the final loaded shell, not retired fallback');
 for(const s of registry.filter(s=>/step-|stair-|podium|deck|island-dock/.test(s.id)))assert.equal(s.terrainMask,true,`${s.id} must erase virtual walking ramp projections`);
 const dock=registry.find(s=>s.id==='island-dock');assert.deepEqual(dock.exclude,[surfaceFixture.islandDock.boat]);near(dock.minimumHeight,SEA_Y+.02);
 const report=authored();assert.ok(report.triangles>1000&&report.triangles<SNOW_SURFACE_BUDGET.surfaceTriangles);
 assert.ok(report.sources.every(s=>s.sourceTriangles>0));
 assert.equal(report.sources.find(s=>s.id==='temple-roof-connector').topTriangles,0,'the upper roof must suppress the hidden connector cap');
});

test('snow lands on the exact highest tier and rotated Club slabs, never their bounding rectangles',()=>{
 for(const [x,z]of [[74,4],[76,21],[91,4],[85,15],[-35,-40],[-85,4],[-81,15],[-55,23],[30,29],[19.3,21.5],[-20,-25]]){
  const real=actualTopAt(x,z),snow=snowHeightAt(x,z);assert.ok(Number.isFinite(real)&&Number.isFinite(snow),`missing contact at ${x},${z}`);near(snow,real+SNOW_SURFACE_BUDGET.contactLift,.0001);
 }
 // The Palace's old shelter rectangle reached x=-47 although the roof ends
 // at -46.2. Exact overhead coverage must restore that exposed edge.
 assert.equal(authored().shelteredAt(-46.6,-40,0),false);assert.equal(authored().shelteredAt(-35,-40,0),true);
 assert.equal(authored().shelteredAt(-20,-25,0),true,'concession canopy shelters its real footprint');
 assert.equal(authored().shelteredAt(-20,-25,3),false,'above the canopy remains outdoors');
 const b=registry.find(s=>s.id==='island-dock');
 const boatBefore=new THREE.Box3().setFromObject(b.exclude[0]);b.exclude[0].position.x+=250;b.exclude[0].updateWorldMatrix(true,true);
 const moved=buildSnowSurfaceMeshes(registry);assert.equal(moved.triangles,authored().triangles,'moving boat never alters fixed snow');moved.geometry.dispose();b.exclude[0].position.x-=250;b.exclude[0].updateWorldMatrix(true,true);assert.ok(!boatBefore.isEmpty());
});

test('all twelve relocated driver/passenger pads and real shore/roof cushions use exact world-space objects',()=>{
 const w=surfaceFixture,calls=[];w.weather={addSupports:s=>calls.push(...s)};w.prepareWeatherSupports();
 const outdoor=w.seats.filter(s=>!s.id.startsWith('PALACE-')&&!s.id.startsWith('CLUB-'));
 assert.equal(w.beachRelaxation.spots.length,10);assert.deepEqual(w.beachRelaxation.rejected,[]);
 assert.equal(calls.length,outdoor.length+10);assert.equal(calls.filter(s=>s.id.startsWith('DRIVE-')).length,12);
 for(const seat of outdoor){const support=calls.find(s=>s.id===seat.id),b=new THREE.Box3().setFromObject(seat.cushion);assert.equal(support.object,seat.cushion);near(support.x,b.getCenter(new THREE.Vector3()).x);near(support.z,b.getCenter(new THREE.Vector3()).z);near(support.y,b.max.y);near(support.width,b.max.x-b.min.x);near(support.depth,b.max.z-b.min.z);}
 const car=calls.find(s=>s.id==='DRIVE-1-1');assert.equal(car.object.visible,false);assert.notEqual(car.width,1.35,'actual cushion width replaces the old arbitrary support rectangle');
 const weather=new FestivalWeather(w.scene,{heightAt:()=>0,dryAt:()=>true,shelteredAt:()=>false},true);weather.addSupports(calls);
 for(const s of calls){const cap=weather.root.getObjectByName(`seat-snow-${s.id}`);assert.ok(cap,`missing ${s.id}`);if(!s.object)continue;cap.updateWorldMatrix(true,true);const capB=new THREE.Box3().setFromBufferAttribute(cap.geometry.attributes.position).applyMatrix4(cap.matrixWorld),real=new THREE.Box3().setFromObject(s.object);near(capB.min.x,real.min.x,.0001);near(capB.max.x,real.max.x,.0001);near(capB.min.z,real.min.z,.0001);near(capB.max.z,real.max.z,.0001);near(capB.max.y,real.max.y+SNOW_SURFACE_BUDGET.contactLift,.0001);}
 weather.dispose();w.weather=undefined;
});

test('ground support fallback preserves a wide bench bounds, and low mats retain their exact surface sampler',()=>{
 const w=Object.create(FestivalWorld.prototype),bench=new THREE.Mesh(new THREE.BoxGeometry(4,.2,1.6),new THREE.MeshStandardMaterial());bench.position.set(4,.9,3);
 const calls=[];Object.assign(w,{scene:new THREE.Scene(),seats:[{id:'FUTURE-BENCH',position:new THREE.Vector3(4,0,3),forward:0}],weather:{addSupports:s=>calls.push(...s)}});w.scene.add(bench);
 const mat={id:'MAT',kind:'mat',anchor:new THREE.Vector3(8,0,2),facing:.3,surfaceHeightAt:(x,z)=>.04+x*.01+z*.02};w.beachRelaxation={spots:[mat]};
 w.prepareWeatherSupports();const support=calls.find(s=>s.id==='FUTURE-BENCH');assert.ok(support);near(support.width,4);near(support.depth,1.6);near(support.y,1);assert.equal(support.object,undefined);
 const m=calls.find(s=>s.id==='MAT');assert.equal(m.heightAt,mat.surfaceHeightAt);assert.equal(m.groundMask,true);
});

test('actual source extraction completes under admission before subdivision/warmup and releases source refs',async()=>{
 const w=Object.create(FestivalWorld.prototype),events=[];Object.assign(w,{scene:new THREE.Scene(),preview:false,disposed:false,pendingRemoteVisitors:new Map(),snowSurfaceSources:[{id:'real-roof',object:new THREE.Mesh(new THREE.BoxGeometry(3,.2,3),new THREE.MeshStandardMaterial())}],async prepareAssets(){events.push('assets');},warmScreenPlayer(){events.push('warm-player');this.disposed=true;}});
 w.scene.add(w.snowSurfaceSources[0].object);w.weather=new FestivalWeather(w.scene,{heightAt:()=>0,dryAt:()=>true,shelteredAt:()=>false},true);const add=w.weather.addSurfaceMeshes.bind(w.weather);w.weather.addSurfaceMeshes=s=>{events.push('extract');add(s);};
 await w.prepareForPlay();assert.deepEqual(events,['assets','extract','warm-player']);assert.deepEqual(w.snowSurfaceSources,[]);
 assert.equal(w.weather.root.getObjectByName('authored-outdoor-snow').material.userData.worldFilmGrain,true);
 await w.prepareForPlay();assert.equal(events.filter(e=>e==='extract').length,1);w.weather.dispose();
 const source=await readFile('src/world/FestivalWorld.ts','utf8');const body=source.slice(source.indexOf('async prepareForPlay('),source.indexOf('private warmAvatarVariants('));assert.ok(body.indexOf('addSurfaceMeshes(')<body.indexOf('subdivideSceneForPlanet('));assert.ok(body.indexOf('addSurfaceMeshes(')<body.indexOf('warmScenePrograms('));
 const preview=Object.create(FestivalWorld.prototype);preview.preview=true;const mesh=new THREE.Mesh();assert.equal(preview.registerSnowSurface('preview-roof',mesh),mesh);assert.equal(preview.snowSurfaceSources,undefined,'animated preview cannot retain retired scenery through this registry');
});

test('Palace shadow silhouette adds only the three large walls and roof, not trim',()=>{
 const w=Object.create(FestivalWorld.prototype);Object.assign(w,{scene:new THREE.Scene(),colliders:[],seats:[],projectors:new Map(),venueSignMaterials:new Map(),graphicsMode:'normal',createProjectorSurface(){}});w.createPalace();
 const masses=w.scene.children.filter(m=>m.name.startsWith('Palace main ')||m.name==='Palace auditorium roof');assert.equal(masses.length,4);assert.ok(masses.every(m=>m.castShadow));assert.equal(new Set(masses.map(m=>m.material)).size,2);
 const trims=w.scene.children.filter(m=>m.isMesh&&m.userData.wornNoMasonry&&!masses.includes(m));assert.ok(trims.length>=8);assert.ok(trims.every(m=>!m.castShadow));
 const batch=batchStaticScenery(w.scene);assert.ok(batch.batchedPieces>50);let castDraws=0;w.scene.traverse(o=>{if(o.isMesh&&o.castShadow)castDraws++;});assert.ok(castDraws<=4,`${castDraws} includes existing screen plus three architectural flag/material batches`);
});

test('gameplay and animated entry position the shadow camera before updating its light',async()=>{
 const source=await readFile('src/world/FestivalWorld.ts','utf8');const gate=source.slice(source.indexOf('renderGatePreview('),source.indexOf('private gatePreviewCamera('));const play=source.slice(source.indexOf('this.weather?.update(delta,this.player.position)'));
 assert.ok(gate.indexOf('setShadowFocus(shadowFocus)')>=0&&gate.indexOf('setShadowFocus(shadowFocus)')<gate.indexOf('this.dayNight.update()'));
 assert.ok(play.indexOf('setShadowFocus(this.player.position)')<play.indexOf('this.dayNight.update()'));
 const w=Object.create(FestivalWorld.prototype);w.weather={shelteredAt:()=>false};assert.equal(w.weatherShelteredAt(-35,-40,0),false,'the final exact query overrides stale provisional Palace boxes');
});

test('Palace ceiling beams follow the cutaway without lowering the screen cut or changing physical art',()=>{
 const beams=surfaceFixture.scene.children.filter(o=>o.name==='Palace ceiling tie beam');assert.equal(beams.length,3);
 assert.equal(new Set(beams.map(o=>o.material)).size,1);
 for(const beam of beams){assert.equal(beam.material.defines.CUTAWAY_OVERHEAD,'');near(beam.position.y,9.91);near(beam.scale.y,.3);assert.equal(beam.castShadow,false);assert.equal(beam.visible,true);}
 const room=surfaceFixture.isometricRoom.call({player:{position:new THREE.Vector3(-35,.28,-40)},inClubRoom:()=>false,inClubLobby:()=>false,onClubStairs:()=>false});
 assert.equal(room.ceiling,10,'the screen top at9.95 is still retained by the existing room height');
 assert.ok(surfaceFixture.scene.children.filter(o=>o.isMesh&&!beams.includes(o)).every(o=>o.material?.defines?.CUTAWAY_OVERHEAD===undefined),'only the ceiling beam material opts in');
});

test('indoor seating never asks for a snow choice, and stale brush selections become ordinary sitting',()=>{
 const w=Object.create(FestivalWorld.prototype),actions=[];
 Object.assign(w,{scene:new THREE.Scene(),player:new THREE.Group(),seats:surfaceFixture.seats,beachRelaxation:surfaceFixture.beachRelaxation,occupiedSeats:new Set(),playerState:'walking',onAction:a=>actions.push(a),
 nearArcade:()=>false,mentorFollowsActiveAvatar:()=>false,nearestRelaxation:()=>undefined,weather:{seatCoverage:()=>1,shelteredAt:()=>false},seatAnchor:s=>s.position.clone()});
 const indoor=w.seats.filter(s=>s.id.startsWith('PALACE-')||s.id.startsWith('CLUB-'));
 assert.ok(indoor.length>=15);
 for(const seat of indoor){
  assert.equal(w.canBrushSnowSeat(seat.id),false,seat.id);
  w.playerState='walking';w.nearestSeat=()=>seat;w.interact();assert.equal(actions.at(-1).type,'seated',seat.id);assert.equal(actions.at(-1).snowAction,undefined);
  w.playerState='walking';w.takeSnowSeat(seat.id,'brush');assert.equal(actions.at(-1).type,'seated');assert.equal(actions.at(-1).snowAction,'sit','a stale event must not request a forbidden server brush');
 }
 assert.ok(actions.every(a=>a.type!=='snowSeat'));
 const outdoor=w.seats.find(s=>s.id==='DRIVE-1-1');w.playerState='walking';w.nearestSeat=()=>outdoor;w.interact();assert.equal(actions.at(-1).type,'snowSeat');
 w.weather.shelteredAt=()=>true;assert.equal(w.canBrushSnowSeat(outdoor.id),false,'an outdoor-labelled seat under a real canopy still rejects brushing');
 assert.equal(w.canBrushSnowSeat('DOES-NOT-EXIST'),false);
 const sample=authored();for(const [x,z,y]of[[-35,-40,1],[-70,22,-10]])assert.equal(sample.shelteredAt(x,z,y),true,`${x},${z} stay roofed even when a lens opens`);
});

test('complete actual authored registry stays within one draw and fixed CPU/geometry budgets',async()=>{
 const started=performance.now(),result=buildSnowSurfaceMeshes(registry),elapsed=performance.now()-started;
 assert.ok(result.triangles<SNOW_SURFACE_BUDGET.surfaceTriangles);assert.ok(bytes(result.geometry)<2_000_000);assert.ok(elapsed<3000,`authored preparation exceeded bounded CPU budget: ${elapsed}ms`);
 const before={triangles:result.triangles,geometryBytes:bytes(result.geometry)};
 const scene=new THREE.Scene(),mesh=new THREE.Mesh(result.geometry,new THREE.MeshStandardMaterial());mesh.userData.dynamic=true;scene.add(mesh);const wasPlanet=PLANET.on;PLANET.on=true;const planetStarted=performance.now();try{subdivideSceneForPlanet(scene);}finally{PLANET.on=wasPlanet;}const after={triangles:(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3,geometryBytes:bytes(mesh.geometry),subdivisionMs:Math.round((performance.now()-planetStarted)*100)/100};assert.ok(after.geometryBytes<6_000_000);
 const w=surfaceFixture;w.weather=undefined;w.weather=new FestivalWeather(w.scene,{heightAt:(x,z)=>w.groundHeightAt(x,z,0)-.28,dryAt:(x,z)=>!w.isOverWater(z,x),shelteredAt:(x,z,y)=>w.weatherShelteredAt(x,z,y)},true);w.prepareWeatherSupports();const allStarted=performance.now();w.weather.addSurfaceMeshes(registry);const weatherBefore={snapshot:w.weather.snapshot(),bytes:0};w.weather.root.traverse(o=>{if(o.geometry)weatherBefore.bytes+=bytes(o.geometry);});const allScene=new THREE.Scene();allScene.add(w.weather.root);PLANET.on=true;try{subdivideSceneForPlanet(allScene);}finally{PLANET.on=wasPlanet;}const weatherAfter={triangles:0,bytes:0};w.weather.root.traverse(o=>{if(o.geometry){weatherAfter.bytes+=bytes(o.geometry);if(o.isMesh)weatherAfter.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 assert.equal(weatherBefore.snapshot.seatCaps,46,'all36 outdoor venue seats plus10 beach supports are budgeted');
 assert.ok(weatherBefore.bytes<1_500_000,'all un-subdivided weather geometry stays under1.5MB');
 assert.ok(weatherAfter.bytes<5_000_000&&weatherAfter.triangles<100_000,'actual complete planet geometry stays under5MB/100ktriangles');
 const report={registrySources:registry.length,sourceTriangles:result.sourceTriangles,topTriangles:result.topTriangles,snowTriangles:result.triangles,geometryBytes:bytes(result.geometry),authoredExtractionMs:Math.round(elapsed*100)/100,beforePlanet:before,afterPlanet:after,weatherBefore,weatherAfter,fullPreparationMs:Math.round((performance.now()-allStarted)*100)/100,sourceDetails:result.sources,draws:1,textures:0,lights:0};w.weather.dispose();w.weather=undefined;
 await mkdir('art/weather-coverage-20261025',{recursive:true});await writeFile('art/weather-coverage-20261025/world-surfaces-budget.json',JSON.stringify(report,null,2)+'\n');result.geometry.dispose();
});
