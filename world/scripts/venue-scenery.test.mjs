import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { build } from 'esbuild';

const names = {attendant:'attendant',boxOffice:'box-office',valet:'valet',statue:'temple-statue'};
async function geometry(kind) {
  const bytes=await readFile(new URL(`../src/assets/venue-scenery/${names[kind]}.glb`,import.meta.url));
  const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length));
  // Node has no image decoder. Retain every geometry/skin buffer byte; only
  // omit material bindings so the real GLTF loader can inspect the mesh.
  for(const mesh of doc.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  delete doc.materials;delete doc.textures;delete doc.images;
  const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
  const bin=bytes.subarray(20+length),header=Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+padded.length+bin.length,8);
  header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const clean=Buffer.concat([header,padded,bin]);
  const gltf=await new GLTFLoader().parseAsync(clean.buffer.slice(clean.byteOffset,clean.byteOffset+clean.byteLength),'');
  return {scene:gltf.scene,doc,bytes};
}
const compiled=await build({entryPoints:['src/world/VenueSceneryAssets.ts'],bundle:true,loader:{'.png':'dataurl'},write:false,format:'esm',platform:'node',define:{'import.meta.url':JSON.stringify(new URL('../src/world/VenueSceneryAssets.ts',import.meta.url).href)}});
const {VenueSceneryAssets}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const assets=()=>{const a=new VenueSceneryAssets();a.load=async kind=>(await geometry(kind)).scene;return a;};

test('installed scenery matches its recorded original or locally repaired asset provenance',async()=>{
  const provenance=JSON.parse(await readFile(new URL('../art/VENUE_ASSET_PROVENANCE_20261009.json',import.meta.url)));
  for(const asset of provenance.assets){
    const bytes=await readFile(new URL(`../src/assets/venue-scenery/${asset.asset}.glb`,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    if (!asset.source_preserved) {
      assert.match(asset.original_sha256,/^[a-f0-9]{64}$/);
      assert.notEqual(asset.original_sha256,asset.sha256);
      assert.ok(asset.local_repair);
    }
  }
});

test('generated scenery stays within web geometry and texture budgets and retains usable rigs',async()=>{
  for(const kind of Object.keys(names)){
    const {scene,doc,bytes}=await geometry(kind);
    assert.ok(bytes.length<10_000_000,`${kind} download budget`);
    let triangles=0;scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
      for(const values of Object.values(mesh.geometry.attributes))for(const v of values.array)assert.ok(Number.isFinite(v));
      if(mesh.isSkinnedMesh){
        assert.equal(mesh.skeleton.bones.length,24);
        const weights=mesh.geometry.attributes.skinWeight;
        for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<.001);
      }
    });
    assert.ok(triangles<25_000,`${kind} polygon budget`);
    assert.equal(doc.skins?.length??0,['attendant','statue'].includes(kind)?1:0);
  }
});

test('the box office has a true service opening and fits its collision footprint',async()=>{
  const a=assets(),root=new THREE.Group();await a.attach('boxOffice',root,5.8);root.updateMatrixWorld(true);
  root.children[0].traverse(node=>assert.ok(node.layers.mask&2,'late asset missing video foreground layer'));
  const bounds=new THREE.Box3().setFromObject(root);
  assert.ok(Math.abs(bounds.max.x-bounds.min.x-4.8)<.001);
  assert.ok(Math.abs(bounds.max.z-bounds.min.z-4)<.001);
  for(const y of [2,2.8,3.5]){
    const ray=new THREE.Raycaster(new THREE.Vector3(0,y,5),new THREE.Vector3(0,0,-1));
    const hit=ray.intersectObject(root,true)[0];
    assert.ok(hit&&hit.point.z<0,`service window filled at ${y}`);
  }
});

test('two unlisted attendants have independent skeletons, lowered arms and stable idle motions',async()=>{
  const a=assets(),first=new THREE.Group(),second=new THREE.Group();
  const template=(await geometry('attendant')).scene;a.load=async()=>template;
  await a.attach('attendant',first,3.25);await a.attach('attendant',second,3.25);
  const h1=first.getObjectByName('Head'),h2=second.getObjectByName('Head');assert.notEqual(h1,h2);
  for(const side of ['Left','Right']){
    first.updateMatrixWorld(true);
    const arm=first.getObjectByName(side+'Arm').getWorldPosition(new THREE.Vector3());
    const hand=first.getObjectByName(side+'Hand').getWorldPosition(new THREE.Vector3());
    assert.ok(hand.y<arm.y-.5,`${side} arm remains raised`);
    assert.ok(Math.abs(hand.x-arm.x)<.4,`${side} arm sticks out`);
  }
  let changes=0;const original=h1.quaternion.clone();
  for(let time=0;time<=20;time+=.125){
    a.update(time);first.updateMatrixWorld(true);second.updateMatrixWorld(true);
    if(original.angleTo(h1.quaternion)>.01)changes++;
    for(const root of [first,second])root.traverse(node=>{assert.ok(node.matrixWorld.elements.every(Number.isFinite));});
  }
  assert.ok(changes>20,'idle did not advance');assert.ok(h1.quaternion.angleTo(h2.quaternion)>.01,'clones share motion');
});

test('stand proximity selects only the relevant venue and remains local to each entrance',async()=>{
  const {VENUE_STANDS,venueStandNear}=await import('../src/world/CoastalVenues.ts');
  for(const [venue,stand]of Object.entries(VENUE_STANDS)){
    assert.equal(venueStandNear(stand.approachX,stand.approachZ),venue);
    assert.equal(venueStandNear(stand.approachX,stand.approachZ+stand.range+.1),undefined);
  }
  assert.equal(venueStandNear(0,10),undefined);
});

test('the relocated Shore board and new ticket stands stay clear of the road and Palace carpet',async()=>{
  const compiled=await build({entryPoints:['src/world/CoastalCirculation.ts'],bundle:true,write:false,format:'esm',platform:'node'});
  const {ROAD_POLYGONS,COASTAL_ROUTES}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const {insidePaving}=await import('../src/world/CoastalTerrain.ts');
  const {SHORE_SIGN,VENUE_STANDS}=await import('../src/world/CoastalVenues.ts');
  for(const [name,x,z,width,depth,angle]of [
    ['Shore',SHORE_SIGN.x,SHORE_SIGN.z,SHORE_SIGN.width,1,SHORE_SIGN.rotation],
    ['Drive-In',VENUE_STANDS['drive-in'].x,VENUE_STANDS['drive-in'].z,4.8,4,0],
    ['Palace',VENUE_STANDS.palace.x,VENUE_STANDS.palace.z,1.6,1.3,VENUE_STANDS.palace.rotation],
  ])for(const sx of [-1,0,1])for(const sz of [-1,0,1]){
    const dx=sx*width/2,dz=sz*depth/2;
    const point=[x+dx*Math.cos(angle)+dz*Math.sin(angle),z-dx*Math.sin(angle)+dz*Math.cos(angle)];
    assert.ok(!ROAD_POLYGONS.some(p=>insidePaving(...point,p)),`${name} obstructs a vehicle lane`);
  }
  const route=COASTAL_ROUTES.find(r=>r.name==='Palace carpet');
  const stand=VENUE_STANDS.palace;
  for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((stand.x-a[0])*dx+(stand.z-a[1])*dz)/(dx*dx+dz*dz)));
    assert.ok(Math.hypot(stand.x-a[0]-t*dx,stand.z-a[1]-t*dz)>route.width/2+1,'valet stand blocks the carpet');
  }
});

test('repaired booth has a closed cabinet, shallow pulls and uninterrupted wall panels',async()=>{
 const a=assets(),root=new THREE.Group();await a.attach('boxOffice',root,5.8);root.updateMatrixWorld(true);
 for(const name of ['GEO-left booth wall','GEO-back booth wall','GEO-ticket cabinet case','GEO-ticket cabinet top']){
  const mesh=root.getObjectByName(name.replaceAll(' ','_')) ?? root.getObjectByName(name);assert.ok(mesh?.isMesh,`missing structural ${name}`);
  const p=mesh.geometry.attributes.position,ids=mesh.geometry.index,edges=new Map();
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(',');
  for(let i=0;i<ids.count;i+=3){const triangle=[ids.getX(i),ids.getX(i+1),ids.getX(i+2)];for(let j=0;j<3;j++){const edge=[key(triangle[j]),key(triangle[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}}
  assert.ok([...edges.values()].every(n=>n===2),`${name} has an open or overlapping edge`);
 }
 const pulls=[];root.traverse(o=>{if(o.name.startsWith('GEO-cabinet_pull')||o.name.startsWith('GEO-cabinet pull'))pulls.push(o)});
 assert.equal(pulls.length,2);for(const pull of pulls){const size=new THREE.Box3().setFromObject(pull).getSize(new THREE.Vector3());assert.ok(size.x<.1&&size.z<.1,'cabinet pull protrudes like a broken fragment');}
});

test('the service counter ends inside both front posts',async()=>{
 const {scene}=await geometry('boxOffice');scene.updateMatrixWorld(true);
 const counter=scene.getObjectByName('GEO-service_counter');assert.ok(counter);
 const bounds=new THREE.Box3().setFromObject(counter);
 const posts=[];scene.traverse(o=>{if(o.name.startsWith('GEO-')&&o.name.includes('post'))posts.push(o)});
 const front=posts.map(p=>new THREE.Box3().setFromObject(p)).filter(b=>b.min.z<-.7).sort((a,b)=>a.min.x-b.min.x);
 assert.equal(front.length,2);
 assert.ok(bounds.min.x>front[0].max.x+.005,'counter penetrates left post');
 assert.ok(bounds.max.x<front[1].min.x-.005,'counter penetrates right post');
});
