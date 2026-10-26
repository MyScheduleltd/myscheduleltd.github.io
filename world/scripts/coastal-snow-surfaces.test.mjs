import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';

const paint=new Proxy({measureText:text=>({width:text.length*40}),createRadialGradient:()=>({addColorStop(){}}),getImageData:(_x,_y,w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:()=>{}});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>paint})};
const compiled=await build({stdin:{contents:"export {CoastalScenery} from './src/world/CoastalScenery';export {buildSnowSurfaceMeshes,SNOW_SURFACE_BUDGET} from './src/world/SnowSurfaceCoverage';export {setIslandTerrain,INLAND_HOUSES} from './src/world/CoastalTerrain';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {CoastalScenery,buildSnowSurfaceMeshes,SNOW_SURFACE_BUDGET,setIslandTerrain,INLAND_HOUSES,THREE}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
setIslandTerrain(true);
const fixture=(capture=true)=>{
 const scene=new THREE.Scene(),solids=[],scenery=new CoastalScenery(scene,(...args)=>solids.push(args),()=>true);
 if(!capture)scenery.snowBox=function(_id,...args){this.box(...args);};
 scenery.buildTown();scenery.buildCirculation();scenery.buildPlanting();scenery.finish();return{scene,scenery,solids};
};
const visualHash=scene=>scene.children.filter(o=>o.isMesh).map(mesh=>{
 const hash=createHash('sha256');for(const [name,a]of Object.entries(mesh.geometry.attributes))hash.update(name).update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
 return{name:mesh.name,geometry:hash.digest('hex'),cast:mesh.castShadow,receive:mesh.receiveShadow,color:mesh.material.color.getHex()};
});

test('merged town details expose exact roofs, canopies and outdoor slabs through a one-time CPU registry without changing art or shadow batches',()=>{
 const f=fixture(),baseline=fixture(false),sources=f.scenery.takeSnowSurfaceSources();
 const expected=[...Array.from({length:3},(_,i)=>`coastal-palace-crown-${i+1}`),'coastal-palace-marquee','coastal-shop-canopy',...INLAND_HOUSES.flatMap((_,i)=>['roof','doorhood','doorstep','balcony-1','balcony-2'].map(part=>`coastal-dorm-${i+1}-${part}`)),...Array.from({length:2},(_,i)=>`coastal-gate-pylon-${i+1}`)];
 assert.equal(sources.length,27);assert.deepEqual(sources.map(s=>s.id).sort(),expected.sort());assert.equal(new Set(sources.map(s=>s.id)).size,27);
 assert.deepEqual(f.scenery.takeSnowSurfaceSources(),[],'draining releases town-owned references');
 assert.deepEqual(visualHash(f.scene),visualHash(baseline.scene),'capturing support references changes no rendered geometry, materials or cast/receive role');
 assert.deepEqual(f.solids,baseline.solids,'collision and route footprints remain exact');
 for(const source of sources){
  assert.equal(source.object.parent,null,'measurement is detached, never an extra scene draw');
  const p=source.object.geometry.attributes.position;assert.ok(p.count>0);assert.ok([...p.array].every(Number.isFinite),'finish must leave the original CPU arrays readable for extraction');
 }
 const result=buildSnowSurfaceMeshes(sources);assert.equal(result.sources.length,27);assert.ok(result.sources.every(s=>s.sourceTriangles>0));
 assert.deepEqual(result.sources.filter(s=>s.topTriangles===0).map(s=>s.id).sort(),INLAND_HOUSES.map((_,i)=>`coastal-dorm-${i+1}-doorstep`).sort(),'doorhoods shelter their full doorstep; every exposed roof/slab retains snow');assert.ok(result.triangles<3000);
 const snow=new THREE.Mesh(result.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));snow.updateMatrixWorld(true);
 const realTop=(source,x,z)=>new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObject(source.object,false)[0]?.point.y;
 for(const [i,[x,z,w,d,h,base]]of INLAND_HOUSES.entries()){
  const source=sources.find(s=>s.id===`coastal-dorm-${i+1}-roof`);source.object.updateMatrixWorld(true);
  assert.ok(Math.abs(realTop(source,x,z)-(base+h+.4))<1e-5);
  const y=new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObject(snow,false)[0]?.point.y;
  assert.ok(Math.abs(y-(base+h+.4+SNOW_SURFACE_BUDGET.contactLift))<1e-5,`dorm${i+1} roof contact`);
  assert.equal(result.shelteredAt(x,z,base+1),true,'the merged roof remains a real snow/rain shelter');
 }
 result.geometry.dispose();snow.material.dispose();
});
