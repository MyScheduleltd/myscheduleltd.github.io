import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const context=new Proxy({measureText:text=>({width:text.length*40})},{get:(target,key)=>key in target?target[key]:()=>{}});
globalThis.document={createElement:()=>({getContext:()=>context}),createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(v){}})};
globalThis.Image=class{addEventListener(){}removeEventListener(){}set src(v){}};
const compiled=await build({stdin:{contents:"export {FestivalWorld} from './src/world/FestivalWorld'; export {createRooftopStairGuard} from './src/world/RooftopStairGuard'; export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
const {FestivalWorld,createRooftopStairGuard,THREE}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const r={minX:22,stairMinX:17.8,stairMaxX:21.4,stairMinZ:20,stairLandingMinZ:25.04,stairLandingMaxZ:28.64,stairTopZ:33.68,stairMaxZ:36.5};
function fixture(){
 const w=Object.create(FestivalWorld.prototype);Object.assign(w,{scene:new THREE.Scene(),colliders:[]});
 w.createRooftopStair(new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial());w.scene.updateMatrixWorld(true);
 const actual=w.scene.getObjectByName('NIMA stair guard rail'),model=createRooftopStairGuard(r,7,new THREE.MeshStandardMaterial());
 const hash=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
 assert.equal(hash(actual.geometry.getAttribute('position').array),hash(model.root.children[0].geometry.getAttribute('position').array),'the real builder must install the tested guard geometry');
 const masonry=w.scene.children.filter(n=>n.isMesh),ray=new THREE.Raycaster();
 function supportAt(x,z,expectedY){ray.set(new THREE.Vector3(x,expectedY+.2,z),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=1;const hit=ray.intersectObjects(masonry,false)[0];assert.ok(hit,'missing rendered stair support');return hit.point.y;}
 return{w,actual,model,supportAt};
}
function boundsOfRange(geometry,range){const box=new THREE.Box3(),p=geometry.getAttribute('position');for(let i=range.start;i<range.start+range.count;i++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(p,i));return box;}

test('every actual base plate is fully supported by one rendered tread or landing',()=>{
 const {actual,model,supportAt}=fixture(),{plan,inspection}=model;
 // Previously the bend post was only 0.04 beyond the half-landing edge.
 // Its 0.26-deep plate overhung the previous step by 0.09, a 0.35-unit gap.
 const oldFoot=3.5+.36,oldLowZ=25.08-.13;
 assert.ok(oldFoot-supportAt(plan.railX,oldLowZ,oldFoot)>.3,'the old plate must reproduce the visible stair-nose mismatch');
 assert.equal(inspection.bases.length,16);
 for(const base of inspection.bases){
  const b=boundsOfRange(actual.geometry,base),s=base.support;
  assert.ok(b.min.z>=s.supportMinZ+.1399&&b.max.z<=s.supportMaxZ-.1399,'base plate straddles a stair nose');
  assert.ok(b.min.x>=plan.supportMinX+.1099&&b.max.x<=plan.supportMaxX-.1099,'base plate leaves its masonry kerb');
  for(const x of [b.min.x,(b.min.x+b.max.x)/2,b.max.x])for(const z of [b.min.z,(b.min.z+b.max.z)/2,b.max.z]){
   const contact=supportAt(x,z,s.supportTop);
   assert.ok(Math.abs(contact-s.supportTop)<1e-5,'plate corners are not on the same actual tread');
   assert.ok(b.min.y-contact>=-.0021&&b.min.y-contact<=.0001,'base must seat within its two-millimetre join, without floating or deep clipping');
  }
 }
});

test('post feet clear the masonry and the entire guard stays outside the walkable tread strip',()=>{
 const {actual,model,w}=fixture(),{plan,inspection}=model;
 for(const post of inspection.posts){const b=boundsOfRange(actual.geometry,post);assert.ok(b.min.y>=post.support.supportTop+.0299,'post shaft clips its rendered step');}
 actual.geometry.computeBoundingBox();const b=actual.geometry.boundingBox;
 assert.ok(b.max.x<r.stairMinX-.10&&b.min.x>r.stairMinX-.5+.10,'new steelwork reduces stair walking clearance');
 const guard=w.colliders.find(c=>c.label==='rooftop-stair-open-guard');
 assert.deepEqual([guard.minX,guard.maxX,guard.minZ,guard.maxZ,guard.minY,guard.maxY].map(n=>+n.toFixed(4)),[17.14,17.96,19.84,36.66,-.4,8.5]);
 const flightPosts=plan.posts.filter(p=>p.tread!==undefined);
 assert.equal(flightPosts.length,10);
 for(const p of flightPosts)assert.ok(Math.abs(p.z-(p.supportMinZ+p.supportMaxZ)/2)<1e-8,'flight post must be centred on its own tread');
});

test('continuous mitred rails are closed and follow the actual riser pitch',()=>{
 const {actual,model}=fixture(),p=actual.geometry.getAttribute('position');
 assert.equal(model.report.railSegments,10);
 const nodes=model.plan.nodes;
 for(const [a,b] of [[nodes[0],nodes[1]],[nodes[3],nodes[4]]])assert.ok(Math.abs((b[1]-a[1])/(b[0]-a[0])-.35/.56)<1e-8,'rail slope differs from the actual step mapping');
 assert.equal(nodes[1][0],r.stairLandingMinZ);assert.equal(nodes[2][0],r.stairLandingMaxZ);assert.equal(nodes[4][0],r.stairTopZ);
 for(const range of model.inspection.rails){
  const edges=new Map(),key=v=>v.toArray().map(n=>Math.round(n*1e5)).join(',');
  for(let i=range.start;i<range.start+range.count;i+=3){
   const vertices=[0,1,2].map(n=>new THREE.Vector3().fromBufferAttribute(p,i+n));
   assert.ok(vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).lengthSq()>1e-14,'degenerate mitre face');
   for(const [a,b] of [[0,1],[1,2],[2,0]]){const edge=[key(vertices[a]),key(vertices[b])].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
  }
  assert.ok([...edges.values()].every(n=>n===2),'rail has an open end, internal end cap or duplicate overlapping joint');
 }
 const ray=new THREE.Raycaster(new THREE.Vector3(model.plan.railX,4,22),new THREE.Vector3(0,-1,0));
 actual.updateMatrixWorld(true);const hit=ray.intersectObject(actual,false)[0];assert.ok(hit&&hit.point.y>3.44&&hit.point.y<3.49,'the upper handrail must have an outward-facing closed top');
});

test('guard detail stays within the small shared geometry budget',()=>{
 const {model,actual}=fixture();assert.equal(model.report.meshes,1);assert.ok(model.report.triangles<3500);assert.equal(model.report.lights,0);assert.equal(model.report.textures,0);
 for(const name of ['position','normal','uv'])assert.ok(Array.from(actual.geometry.getAttribute(name).array).every(Number.isFinite),'invalid '+name+' attribute');
 assert.equal(actual.material.flatShading,false);assert.equal(actual.material.userData.preserveAuthoredSurface,true);
});
