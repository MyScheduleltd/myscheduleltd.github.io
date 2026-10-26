import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {build} from 'esbuild';

const context=new Proxy({measureText:text=>({width:text.length*40})},{get:(target,key)=>key in target?target[key]:()=>{}});
globalThis.document={createElement:()=>({getContext:()=>context}),createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(v){}})};
globalThis.Image=class{addEventListener(){}removeEventListener(){}set src(v){}};
globalThis.window={location:new URL('http://127.0.0.1/'),setTimeout,clearTimeout};
const compiled=await build({stdin:{contents:"export {FestivalWorld} from './src/world/FestivalWorld';export {FestivalWeather} from './src/world/FestivalWeather';export {buildSnowSurfaceMeshes,SNOW_SURFACE_BUDGET} from './src/world/SnowSurfaceCoverage';export {fitEnvironmentModel} from './src/world/EnvironmentAssets';export {createVictoryStatue} from './src/world/VictoryStatue';export {PLANET,subdivideSceneForPlanet} from './src/world/PlanetCurve';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';export {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false,plugins:[{name:'statue-snow-cpu-only',setup(b){b.onLoad({filter:/FestivalAttendant\.ts$/},()=>({contents:'export function createFestivalAttendant(parent){return {root:parent,rig:{}};}',loader:'js'}));}}]});
const {FestivalWorld,FestivalWeather,buildSnowSurfaceMeshes,SNOW_SURFACE_BUDGET,fitEnvironmentModel,createVictoryStatue,PLANET,subdivideSceneForPlanet,GLTFLoader,MeshoptDecoder,THREE}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text+'\n//# sourceURL=statue-snow-fixture.mjs').toString('base64'));
const ART='art/statue-snow-20261026';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const near=(a,b,t=.00025)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const geometryBytes=g=>Object.values(g.attributes).reduce((sum,a)=>sum+a.array.byteLength,g.index?.array.byteLength??0);

/** Preserve every node, accessor, index, normal and UV. Images are irrelevant
 * to these CPU geometry/contact tests and are never decoded here. */
async function geometryModel(path){
 const bytes=await readFile(path),n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString());
 json.materials=json.materials.map(()=>({pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}));
 const raw=Buffer.from(JSON.stringify(json)),padded=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),tail=bytes.subarray(20+n),clean=Buffer.alloc(20+padded.length+tail.length);
 clean.writeUInt32LE(0x46546c67,0);clean.writeUInt32LE(2,4);clean.writeUInt32LE(clean.length,8);clean.writeUInt32LE(padded.length,12);clean.writeUInt32LE(0x4e4f534a,16);padded.copy(clean,20);tail.copy(clean,20+padded.length);
 return(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(clean.buffer.slice(clean.byteOffset,clean.byteOffset+clean.byteLength),'')).scene;
}
const [desktop,mobile,portrait]=await Promise.all([
 geometryModel('src/assets/environment/victory-statue.glb'),geometryModel('src/assets/environment/victory-statue-mobile.glb'),geometryModel('src/assets/venue-scenery/temple-statue.glb'),
]);

function fixture(model=desktop,{deferred,generated=true}={}){
 const w=Object.create(FestivalWorld.prototype),events=[],attachments=[],fallbacks=[];
 Object.assign(w,{scene:new THREE.Scene(),colliders:[],player:new THREE.Group(),preview:false,disposed:false,environmentPrepared:true,
  graphicsMode:'normal',pendingRemoteVisitors:new Map(),venueSceneryAssets:{
   attachVictoryStatue(parent){const job=Promise.resolve().then(()=>{const body=createVictoryStatue(portrait);body.position.y+=2.32;parent.add(body);fallbacks.push(body);events.push('fallback-installed');});attachments.push(job);return job;},
   discardVictoryStatue(parent){parent.clear();events.push('fallback-retired');},ready:()=>Promise.all(attachments),
  },
 });
 if(generated)w.environmentModels={
  attach(kind,parent,options){assert.equal(kind,'victory-statue');const job=Promise.resolve(deferred).then(()=>{
   const fit=fitEnvironmentModel(model,options);parent.add(fit.root);for(const fallback of options.fallback)fallback.visible=false;events.push('generated-installed');return true;
  });attachments.push(job);return job;},ready:()=>Promise.all(attachments),
 };
 w.createGanganStatue();w.scene.updateMatrixWorld(true);
 return{w,events,attachments,fallbacks,root:w.scene.getObjectByName('gangan-statue'),source:w.snowSurfaceSources?.find(s=>s.id==='square-statue-and-plinth')};
}
function visibleMeshes(root){const result=[];root.traverseVisible(o=>{if(o.isMesh)result.push(o);});return result;}
function snapshot(root){return visibleMeshes(root).map(mesh=>({id:mesh.uuid,geometry:mesh.geometry.uuid,material:Array.isArray(mesh.material)?mesh.material.map(m=>m.uuid):mesh.material.uuid,position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),attributes:Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([k,a])=>[k,sha(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))])),index:mesh.geometry.index?sha(new Uint8Array(mesh.geometry.index.array.buffer,mesh.geometry.index.array.byteOffset,mesh.geometry.index.array.byteLength)):null}));}
function topAt(meshes,x,z){return new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObjects(meshes,false)[0]?.point.y;}
function upwardCentres(root){
 root.updateWorldMatrix(true,true);const points=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
 for(const mesh of visibleMeshes(root)){const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
  for(let i=0;i<(index?.count??p.count);i+=3){const read=(out,k)=>out.fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld);read(a,0);read(b,1);read(c,2);n.crossVectors(b.clone().sub(a),c.clone().sub(a));if(n.y/n.length()>.55)for(const weights of[[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]])points.push(a.clone().multiplyScalar(weights[0]).addScaledVector(b,weights[1]).addScaledVector(c,weights[2]));}
 }
 return points;
}
const profiles=[];

test('optional refinement preserves exact sloping surfaces and rejects invalid or unbounded spans',()=>{
 const object=new THREE.Mesh(new THREE.PlaneGeometry(6,8),new THREE.MeshBasicMaterial());object.rotation.x=-Math.PI/2+.2;object.rotation.z=.1;object.position.set(4,2,5);object.updateMatrixWorld(true);
 const source={id:'sloping-authored-surface',object},plain=buildSnowSurfaceMeshes([source]),refined=buildSnowSurfaceMeshes([{...source,maximumFaceSpan:1}]);
 const snow=new THREE.Mesh(refined.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));snow.updateMatrixWorld(true);
 for(const x of [2,3,4,5,6])for(const z of [3,4,5,6,7])near(topAt([snow],x,z),topAt([object],x,z)+SNOW_SURFACE_BUDGET.contactLift);
 assert.ok(refined.sourceTriangles>plain.sourceTriangles);
 for(const maximumFaceSpan of [0,-1,Infinity,NaN])assert.throws(()=>buildSnowSurfaceMeshes([{...source,maximumFaceSpan}]),/finite and positive/);
 assert.throws(()=>buildSnowSurfaceMeshes([{...source,maximumFaceSpan:Number.MIN_VALUE}]),/fixed subdivision depth|fixed triangle/);
 plain.geometry.dispose();refined.geometry.dispose();snow.material.dispose();object.geometry.dispose();object.material.dispose();
});

test('World registers the whole final statue and original stepped plinth without moving art or its collider',async()=>{
 const f=fixture();assert.ok(f.source);assert.equal(f.source.object,f.root);assert.equal(f.source.visibleOnly,true);
 assert.ok(f.source.maximumFaceSpan>0&&f.source.maximumFaceSpan<=2,'dense sculpture uses bounded exact refinement of its broad base faces');
 assert.equal(f.source.sheltersGround,false,'a sculpture does not act as a roof over the surrounding pavement');
 await Promise.all(f.attachments);await Promise.resolve();
 assert.deepEqual(f.root.position.toArray(),[0,0,-6.2]);assert.equal(f.root.rotation.y,0);
 const plinth=f.root.children.filter(o=>o.name.startsWith('plinth-'));assert.equal(plinth.length,3);
 assert.deepEqual(plinth.map(o=>({name:o.name,position:o.position.toArray(),scale:o.scale.toArray(),yaw:o.rotation.y})),[
  {name:'plinth-base',position:[0,.25,0],scale:[6,.5,4.6],yaw:-Math.PI/2},
  {name:'plinth-die',position:[0,1.25,0],scale:[5,1.5,3.6],yaw:-Math.PI/2},
  {name:'plinth-cap',position:[0,2.16,0],scale:[5.4,.32,4],yaw:-Math.PI/2},
 ]);
 assert.equal(f.w.colliders.length,1);const collider=f.w.colliders[0];near(collider.minX,-2.8);near(collider.maxX,2.8);near(collider.minZ,-9.7);near(collider.maxZ,-2.7);
 const model=f.root.getObjectByName('Higgsfield victory statue mount');near(model.position.y,2.32);
 assert.ok(model.children.length>0);assert.equal(f.root.getObjectByName('Victory portrait fallback'),undefined,'the loaded model retires the code fallback before extraction');
});

test('statue surface snow leaves existing ground coverage and overhead particle queries unchanged',async()=>{
 const f=fixture();await Promise.all(f.attachments);await Promise.resolve();
 const floor=new THREE.PlaneGeometry(20,20);floor.rotateX(-Math.PI/2);floor.translate(0,0,-6.2);
 const distantRoof=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());distantRoof.position.set(100,10,100);
 const defaultSource={id:'distant-normal-roof',object:distantRoof};
 const baseline=buildSnowSurfaceMeshes([defaultSource],floor),withStatue=buildSnowSurfaceMeshes([defaultSource,f.source],floor);
 assert.deepEqual([...withStatue.terrainGeometry.attributes.position.array],[...baseline.terrainGeometry.attributes.position.array]);
 assert.deepEqual([...withStatue.terrainGeometry.index.array],[...baseline.terrainGeometry.index.array]);
 for(const [x,z]of[[0,-6.2],[-2,-6],[2,-6]])assert.equal(withStatue.shelteredAt(x,z,0),false,'the statue must not add dense sculpture faces to per-particle overhead checks');
 assert.equal(withStatue.shelteredAt(100,100,0),true,'ordinary roof/deck behavior remains the default');
 for(const r of[baseline,withStatue]){r.geometry.dispose();r.terrainGeometry?.dispose();}floor.dispose();distantRoof.geometry.dispose();distantRoof.material.dispose();
});

for(const [label,model]of[['desktop',desktop],['mobile',mobile]])test(`${label}: snow contacts the real head, both raised arms, footwear and exposed base steps within the fixed geometry allowance`,async()=>{
 const f=fixture(model);await Promise.all(f.attachments);await Promise.resolve();f.root.updateWorldMatrix(true,true);
 const before=snapshot(f.root),colliders=structuredClone(f.w.colliders),start=performance.now(),built=buildSnowSurfaceMeshes([f.source]),extractionMs=performance.now()-start;
 assert.equal(built.sources.length,1);assert.equal(built.sources[0].id,'square-statue-and-plinth');assert.ok(built.sources[0].sourceTriangles>=2085);
 assert.ok(built.sources[0].topTriangles>1000);assert.ok(built.triangles<SNOW_SURFACE_BUDGET.surfaceTriangles);
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),snow=new THREE.Mesh(built.geometry,material);snow.updateMatrixWorld(true);
 const actual=visibleMeshes(f.root),sculpture=f.root.getObjectByName('Higgsfield victory statue mount'),bounds=new THREE.Box3().setFromObject(sculpture),size=bounds.getSize(new THREE.Vector3()),centre=bounds.getCenter(new THREE.Vector3());
 const regions={head:p=>(p.y-bounds.min.y)/size.y>.68&&(p.y-bounds.min.y)/size.y<.88&&Math.abs(p.x-centre.x)/size.x<.18,
  leftArm:p=>(p.y-bounds.min.y)/size.y>.6&&(p.x-centre.x)/size.x<-.3,
  rightArm:p=>(p.y-bounds.min.y)/size.y>.6&&(p.x-centre.x)/size.x>.3,
  footwear:p=>(p.y-bounds.min.y)/size.y<.1};
 const samples={};
 for(const [name,within]of Object.entries(regions)){
  const candidates=upwardCentres(sculpture).filter(within).sort((a,b)=>b.y-a.y),checked=[];
  for(const p of candidates){const real=topAt(actual,p.x,p.z);if(!Number.isFinite(real)||Math.abs(real-p.y)>.0001)continue;
   const y=topAt([snow],p.x,p.z);assert.ok(Number.isFinite(y),`${label} missing ${name} contact`);near(y,real+SNOW_SURFACE_BUDGET.contactLift);checked.push(p.toArray());if(checked.length===5)break;
  }
  assert.ok(checked.length>=3,`${label} ${name} has ${checked.length} tested exposed contact points`);samples[name]=checked;
 }
 for(const [x,z,top]of[[2.15,-3.35,.5],[-2.15,-3.35,.5],[1.8,-3.7,2.32],[-1.8,-3.7,2.32]]){near(topAt(actual,x,z),top);near(topAt([snow],x,z),top+SNOW_SURFACE_BUDGET.contactLift);}
 assert.equal(topAt([snow],2.5,-3.05),undefined,'snow does not replace the real stepped silhouette with a bounding rectangle');
 assert.deepEqual(snapshot(f.root),before,'extraction/refinement cannot reshape, recolour or move existing statue geometry');assert.deepEqual(f.w.colliders,colliders);
 const scene=new THREE.Scene();snow.userData.dynamic=true;scene.add(snow);const on=PLANET.on;PLANET.on=true;try{subdivideSceneForPlanet(scene);}finally{PLANET.on=on;}
 const bytes=geometryBytes(snow.geometry);assert.ok(bytes<512*1024,`${label} statue snow adds ${bytes} B, beyond its 512 KiB allowance`);
 profiles.push({profile:label,sourceTriangles:built.sourceTriangles,topTriangles:built.topTriangles,snowTriangles:built.triangles,planetTriangles:(snow.geometry.index?.count??snow.geometry.attributes.position.count)/3,planetBytes:bytes,extractionMs:Math.round(extractionMs*100)/100,samples});
 snow.geometry.dispose();material.dispose();
});

test('hidden fallback geometry never contributes phantom snow outside the final sculpture',async()=>{
 const f=fixture();await Promise.all(f.attachments);await Promise.resolve();
 const clean=buildSnowSurfaceMeshes([f.source]);
 const hidden=new THREE.Group();hidden.name='Hidden fallback sentinel';hidden.visible=false;
 const poison=new THREE.Mesh(new THREE.BoxGeometry(10,2,10),new THREE.MeshStandardMaterial());poison.position.set(100,70,100);hidden.add(poison);f.root.add(hidden);
 const guarded=buildSnowSurfaceMeshes([f.source]);assert.equal(guarded.sourceTriangles,clean.sourceTriangles);assert.equal(guarded.triangles,clean.triangles);
 assert.deepEqual([...guarded.geometry.attributes.position.array],[...clean.geometry.attributes.position.array]);
 clean.geometry.dispose();guarded.geometry.dispose();poison.geometry.dispose();poison.material.dispose();
});

test('real weather keeps detailed statue snow indexed through planet preparation and reuses/releases its resources',async()=>{
 const f=fixture();await Promise.all(f.attachments);await Promise.resolve();
 const scene=new THREE.Scene(),roof=new THREE.Mesh(new THREE.BoxGeometry(20,.3,20),new THREE.MeshStandardMaterial());roof.position.set(35,8,0);
 const weather=new FestivalWeather(scene,{heightAt:()=>0,dryAt:(x,z)=>Math.abs(x)<10&&Math.abs(z)<10,shelteredAt:()=>false},true);
 weather.addSurfaceMeshes([{id:'normal-large-roof',object:roof},f.source]);
 const detail=weather.root.getObjectByName('authored-detail-snow'),coarse=weather.root.getObjectByName('authored-outdoor-snow');
 assert.ok(detail&&coarse);assert.equal(detail.material,coarse.material,'the additional draw reuses the existing snow material/program');
 const detailGeometry=detail.geometry,coarseGeometry=coarse.geometry;assert.ok(detailGeometry.index);
 const wasPlanet=PLANET.on;PLANET.on=true;try{subdivideSceneForPlanet(scene);}finally{PLANET.on=wasPlanet;}
 assert.notEqual(coarse.geometry,coarseGeometry,'large roof triangles still receive normal planet refinement');
 assert.equal(detail.geometry,detailGeometry,'small detailed triangles keep their indexed representation');
 assert.ok(geometryBytes(detail.geometry)<512*1024,'a coarse roof must not expand the entire sculpture into repeated vertices');
 weather.setWarmup(true);assert.equal(detail.visible,true);weather.setWarmup(false);assert.equal(detail.visible,false);
 weather.setShared({version:1,updatedAt:1,schedule:[{type:'snow',startsAt:0,endsAt:900000}],clearedSeats:[]});
 weather.update(.1,new THREE.Vector3(),610001);assert.equal(detail.visible,true);assert.equal(weather.snapshot().snowCoverage,1);
 weather.update(.1,new THREE.Vector3(),1800001);assert.equal(detail.visible,false);assert.equal(weather.snapshot().snowCoverage,0);assert.equal(detail.geometry,detailGeometry);
 let geometryDisposed=0,materialDisposed=0;detailGeometry.addEventListener('dispose',()=>geometryDisposed++);detail.material.addEventListener('dispose',()=>materialDisposed++);
 weather.dispose();weather.dispose();assert.equal(geometryDisposed,1);assert.equal(materialDisposed,1);assert.equal(weather.root.children.length,0);
 roof.geometry.dispose();roof.material.dispose();
});

test('a failed generated model still permits snow on the real code portrait fallback and original plinth',async()=>{
 const f=fixture(desktop,{generated:false});await Promise.all(f.attachments);f.root.updateMatrixWorld(true,true);
 assert.ok(f.root.getObjectByName('GANGAN victory portrait'));
 const built=buildSnowSurfaceMeshes([f.source]);assert.ok(built.sources[0].topTriangles>1000);assert.ok(built.triangles<SNOW_SURFACE_BUDGET.surfaceTriangles);
 const snow=new THREE.Mesh(built.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));snow.updateMatrixWorld(true);
 near(topAt([snow],2.15,-3.35),.5+SNOW_SURFACE_BUDGET.contactLift);
 const head=f.root.getObjectByName('Exact temple portrait head'),headBox=new THREE.Box3().setFromObject(head),p=headBox.getCenter(new THREE.Vector3());
 const real=topAt(visibleMeshes(f.root),p.x,p.z);assert.ok(real>7);near(topAt([snow],p.x,p.z),real+SNOW_SURFACE_BUDGET.contactLift);
 built.geometry.dispose();snow.material.dispose();
});

test('actual World admission waits for final model placement before extracting snow and releases source references',async()=>{
 let release;const deferred=new Promise(resolve=>{release=resolve;}),f=fixture(mobile,{deferred});let extraction;
 f.w.weather={root:new THREE.Group(),addSurfaceMeshes(sources){f.events.push('extract');assert.ok(f.root.getObjectByName('Higgsfield victory statue mount').children.length);extraction=buildSnowSurfaceMeshes(sources);}};
 f.w.warmScreenPlayer=()=>{f.events.push('after-extract');f.w.disposed=true;};
 const preparing=f.w.prepareForPlay();await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(extraction,undefined);assert.ok(!f.events.includes('extract'),'a delayed final statue cannot be snow-extracted early');
 release();await preparing;assert.ok(extraction);assert.ok(f.events.indexOf('generated-installed')<f.events.indexOf('extract'));assert.ok(f.events.indexOf('fallback-retired')<f.events.indexOf('extract'));
 assert.deepEqual(f.w.snowSurfaceSources,[],'source objects are not retained after the admission extraction');
 await f.w.prepareForPlay();assert.equal(f.events.filter(e=>e==='extract').length,1);extraction.geometry.dispose();
 await mkdir(ART,{recursive:true});await writeFile(ART+'/statue-snow-test-report.json',JSON.stringify({profiles,actualModelVariants:2,contactRegions:['head','leftArm','rightArm','footwear','base-step','cap-step'],hiddenFallbackExcluded:true,placementAndColliderUnchanged:true,deferredAdmission:true},null,2)+'\n');
});
