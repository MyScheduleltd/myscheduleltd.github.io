import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:"export {DayNightCycle} from './src/world/DayNightCycle';export {PLANET,planetBendPoint} from './src/world/PlanetCurve';export {applyPlanetLightAnchors,disposePlanetLightAnchors} from './src/world/PlanetLightAnchors';export {ShadowCasterCulling} from './src/world/ShadowCasters';export {CoastalScenery} from './src/world/CoastalScenery';export {BEACH_RELAXATION_LAYOUT,createBeachRelaxation} from './src/world/BeachRelaxation';export {terrainHeightAt,setIslandTerrain,islandTerrain,createCoastalTerrain} from './src/world/CoastalTerrain';export {batchStaticScenery} from './src/world/StaticBatch';export {WebGLLights} from 'three/src/renderers/webgl/WebGLLights.js';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const {THREE,DayNightCycle,PLANET,planetBendPoint,applyPlanetLightAnchors,disposePlanetLightAnchors,ShadowCasterCulling,CoastalScenery,BEACH_RELAXATION_LAYOUT,createBeachRelaxation,terrainHeightAt,setIslandTerrain,islandTerrain,createCoastalTerrain,batchStaticScenery,WebGLLights}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const paint=new Proxy({createRadialGradient:()=>({addColorStop(){}}),getImageData:(_x,_y,w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:()=>{}});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>paint})};
const atHour=hour=>Date.UTC(2026,9,25)+hour*3_600_000;
const close=(actual,expected,message)=>assert.ok(actual.distanceTo(expected)<1e-8,message);
const savePlanet=()=>({on:PLANET.on,radius:PLANET.radius,centre:PLANET.centre.value.clone(),island:islandTerrain()});
const restorePlanet=state=>{PLANET.on=state.on;PLANET.radius=state.radius;PLANET.centre.value.copy(state.centre);setIslandTerrain(state.island);};

test('sun/moon shadow focus follows both beach wings at day, sunset and night without changing sky or light direction',()=>{
 const saved=savePlanet();PLANET.on=true;PLANET.radius=170;setIslandTerrain(true);
 const scene=new THREE.Scene(),cycle=new DayNightCycle(scene,undefined,{timeZone:'UTC'}),camera=new THREE.PerspectiveCamera(55,1.44,.1,150),lights=new WebGLLights({has:()=>false});
 applyPlanetLightAnchors(scene);
 try{
  for(const hour of [7,12,16+14/60,17.9,0])for(const [x,z] of [[-90,-40],[90,-45],[-55,-35],[88,4],[0,70]]){
   cycle.setShadowFocus(new THREE.Vector3());cycle.update(atHour(hour));
   const sky=cycle.getCelestialReviewState(),sunDirection=cycle.directionalLight.position.clone().normalize(),moonDirection=cycle.moonLight.position.clone().normalize(),sunIntensity=cycle.directionalLight.intensity,moonIntensity=cycle.moonLight.intensity;
   const focus=new THREE.Vector3(x,terrainHeightAt(x,z),z);PLANET.centre.value.set(x,0,z);cycle.setShadowFocus(focus);cycle.update(atHour(hour));
   close(cycle.directionalLight.position.clone().sub(cycle.directionalLight.target.position).normalize(),sunDirection,'sun direction unchanged');
   close(cycle.moonLight.position.clone().sub(cycle.moonLight.target.position).normalize(),moonDirection,'moon direction unchanged');
   assert.deepEqual(cycle.getCelestialReviewState(),sky);assert.equal(cycle.directionalLight.intensity,sunIntensity);assert.equal(cycle.moonLight.intensity,moonIntensity);
   camera.position.set(x+18,focus.y+17,z+24);camera.lookAt(focus);scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);lights.setup([cycle.directionalLight,cycle.moonLight]);lights.setupView([cycle.directionalLight,cycle.moonLight],camera);
   close(lights.state.directional[0].direction,sunDirection.clone().transformDirection(camera.matrixWorldInverse),'actual renderer sun uniform keeps the same direction after anchor preparation');
   const view=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
   for(const light of [cycle.directionalLight,cycle.moonLight]){
    if(light.intensity<=.12)continue;
    assert.deepEqual(light.shadow.mapSize.toArray(),[1024,1024]);light.shadow.camera.updateProjectionMatrix();light.shadow.updateMatrices(light);
    const frustum=light.shadow.getFrustum();let visible=0;
    for(let dx=-55;dx<=55;dx+=5)for(let dz=-55;dz<=55;dz+=5){
     if(Math.hypot(dx,dz)>55)continue;
     const point=planetBendPoint(new THREE.Vector3(x+dx,terrainHeightAt(x+dx,z+dz),z+dz));
     if(!view.containsPoint(point))continue;visible++;assert.ok(frustum.containsPoint(point),`visible ground outside ${light===cycle.directionalLight?'sun':'moon'} shadow volume at ${hour}, ${x},${z}: ${dx},${dz}`);
    }
    assert.ok(visible>0);
    for(const spec of BEACH_RELAXATION_LAYOUT){
     if(Math.hypot(spec.x-x,spec.z-z)>55)continue;
     for(const height of [0,spec.kind==='chair'?2.5:.3])assert.ok(frustum.containsPoint(planetBendPoint(new THREE.Vector3(spec.x,terrainHeightAt(spec.x,spec.z)+height,spec.z))),`${spec.id} clipped at ${hour}`);
    }
   }
  }
  cycle.setShadowsEnabled(false);cycle.update(atHour(16));assert.equal(cycle.directionalLight.castShadow,false);assert.equal(cycle.moonLight.castShadow,false,'Lite still draws no celestial shadow maps');
 }finally{disposePlanetLightAnchors(scene);restorePlanet(saved);}
});

test('moving the shadow focus copies finite coordinates and retains a constant light/map budget',()=>{
 const scene=new THREE.Scene(),cycle=new DayNightCycle(scene,26),focus=new THREE.Vector3(-90,1,-40);
 cycle.setShadowFocus(focus);focus.set(900,900,900);cycle.update();assert.deepEqual(cycle.directionalLight.target.position.toArray(),[-90,1,-40]);
 cycle.setShadowFocus(new THREE.Vector3(NaN,0,0));cycle.update();assert.deepEqual(cycle.moonLight.target.position.toArray(),[-90,1,-40]);
 assert.equal(scene.children.filter(object=>object.isLight).length,3);assert.equal(cycle.directionalLight.shadow.camera.left,-70);assert.equal(cycle.moonLight.shadow.camera.left,-65);
 assert.ok(Math.abs(cycle.directionalLight.shadow.bias*(240-.5)-(-.00035*(140-.5)))<1e-12,'same world-space sun depth bias');
});

test('coastal land receives shadows and merged planting keeps palm/tree/rock silhouettes separate from grass and town trim',()=>{
 const saved=savePlanet();setIslandTerrain(true);
 try{
  const terrain=createCoastalTerrain();assert.equal(terrain.receiveShadow,true);assert.ok(terrain.material.isMeshStandardMaterial);assert.equal(terrain.castShadow,false);
  const scene=new THREE.Scene(),scenery=new CoastalScenery(scene,()=>{},()=>true);scenery.buildPlanting();scenery.box([2,1,1],[-35,1,-30],scenery.mats.wood);scenery.finish();
  const meshes=scene.children.filter(object=>object.isMesh),casters=meshes.filter(mesh=>mesh.castShadow),receivers=meshes.filter(mesh=>!mesh.castShadow);
  assert.equal(casters.length,5,'wood,stone and three leaf colours add only five silhouette draws per active celestial map');
  assert.ok(receivers.length>0);assert.ok(meshes.every(mesh=>mesh.receiveShadow));
  const triangles=casters.reduce((sum,mesh)=>sum+mesh.geometry.getAttribute('position').count/3,0);assert.ok(triangles>1500&&triangles<3000,`bounded planting triangles: ${triangles}`);
  assert.ok(receivers.some(mesh=>mesh.material===scenery.mats.wood),'wood trim does not become a caster when trunks use the same material');
  const before=meshes.map(mesh=>({material:mesh.material,cast:mesh.castShadow,triangles:mesh.geometry.attributes.position.count/3}));batchStaticScenery(scene);
  const after=[];scene.traverse(object=>{if(object.isMesh)after.push(object);});
  for(const role of [false,true])assert.equal(after.filter(mesh=>mesh.castShadow===role).reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count/3,0),before.filter(mesh=>mesh.cast===role).reduce((sum,mesh)=>sum+mesh.triangles,0),'static batching preserves each shadow role');
  terrain.geometry.dispose();terrain.material.dispose();
 }finally{restorePlanet(saved);}
});

test('visible beach silhouette casters survive the ordinary culling pass under a focused sunset light',()=>{
 const saved=savePlanet();PLANET.on=true;PLANET.radius=170;setIslandTerrain(true);PLANET.centre.value.set(-90,0,-40);
 try{
  const scene=new THREE.Scene(),cycle=new DayNightCycle(scene,(16+14/60-6)/24*60),camera=new THREE.PerspectiveCamera(55,1.44,.1,150);
  cycle.setShadowFocus(new THREE.Vector3(-90,terrainHeightAt(-90,-40),-40));cycle.update();
  camera.position.set(-106,12,-23);camera.lookAt(-90,0,-43);scene.add(camera);
  const casters=[[-103,-42,2.5],[-90,-46,6],[-100,-31,2.5],[-84,-41,2.5]].map(([x,z,height])=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,height,2),new THREE.MeshStandardMaterial());mesh.position.set(x,terrainHeightAt(x,z)+height/2,z);mesh.castShadow=true;scene.add(mesh);return mesh;});
  scene.updateMatrixWorld(true);const culling=new ShadowCasterCulling();culling.hide(scene,camera,0);assert.ok(casters.every(mesh=>mesh.castShadow),'the palm, rock and chairs in the camera region remain submitted');culling.restore();
 }finally{restorePlanet(saved);}
});
