import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const bytes=await blob.arrayBuffer(),v=new DataView(bytes);return {width:v.getUint32(16),height:v.getUint32(20),close(){}};};
globalThis.document={createElement:()=>({width:64,height:64,getContext:()=>({fillRect(){}})})};
const output=await build({stdin:{contents:"export {FestivalWorld} from './src/world/FestivalWorld';export * from './src/world/BeachRelaxation';export * from './src/world/CoastalRelaxationPose';export * from './src/world/CoastalTerrain';export * from './src/world/CoastalAvatar';export * from './src/world/ImportedAvatar';export {setPlanetCentre,planetBendPoint} from './src/world/PlanetCurve';export {CoastalScenery} from './src/world/CoastalScenery';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,loader:{'.png':'dataurl'}});
const {THREE,FestivalWorld,createBeachRelaxation,BEACH_RELAXATION_LAYOUT,setIslandTerrain,terrainHeightAt,SEA_Y,isSwimmingDepth,CoastalScenery,createCoastalAvatar,setCoastalSwimwear,loadImportedAvatar,attachImportedAvatar,syncImportedAvatars,poseRelaxedCoastal,prepareCoastalReclines,clearRelaxedCoastal,relaxedCoastalContactSnapshot,setPlanetCentre,planetBendPoint}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
setIslandTerrain(true);
const solids=[];new CoastalScenery(new THREE.Scene(),(x,z,w,d,minY,maxY,label)=>solids.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY,maxY,label}),()=>true).buildPlanting();
const overlaps=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ&&a.minY<b.maxY&&a.maxY>b.minY;
const props=createBeachRelaxation({clear:b=>!solids.some(s=>overlaps(s,b))});
test('all ten beach props have authored stable identities, dry full footprints, scenery clearance and safe exits',()=>{
 assert.equal(props.spots.length,10);assert.deepEqual(props.rejected,[]);
 assert.deepEqual(props.spots.map(s=>s.id),BEACH_RELAXATION_LAYOUT.map(s=>s.id));assert.equal(props.colliders.length,6);
 for(const spot of props.spots){assert.ok(!solids.some(s=>overlaps(s,spot.footprint)),spot.id);assert.ok(spot.exitPoints.length>=2,spot.id);for(const exit of spot.exitPoints)assert.ok(exit.y>=SEA_Y+.16,spot.id);
  for(let x=spot.footprint.minX;x<=spot.footprint.maxX;x+=.4)for(let z=spot.footprint.minZ;z<=spot.footprint.maxZ;z+=.4)assert.ok(terrainHeightAt(x,z)>=SEA_Y+.15,spot.id+' wet footprint');
  assert.ok(Array.from({length:30},(_,i)=>i*2+2).some(d=>isSwimmingDepth(spot.position.x+Math.sin(spot.facing)*d,spot.position.z+Math.cos(spot.facing)*d)),spot.id+' must face open water');
 }
 assert.equal(props.root.children.filter(c=>c.visible).length,5,'ten props share five material draws');
 const bytes=props.root.children.filter(c=>c.visible).reduce((sum,m)=>sum+Object.values(m.geometry.attributes).reduce((s,a)=>s+a.array.byteLength,0),0);assert.ok(bytes<1024*1024,'fixed scenery stays below1MiB of vertex payload');
});
test('unsafe scenery and wet ground reject props without moving an entrance or placing a blocked rest',()=>{
 assert.equal(createBeachRelaxation({clear:()=>false}).spots.length,0);
 assert.equal(createBeachRelaxation({heightAt:()=>SEA_Y-.5}).spots.length,0);
});
test('chair clearance margins cannot pull the real follow camera into its own backrest',()=>{
 const world=Object.create(FestivalWorld.prototype);Object.assign(world,{colliders:props.colliders,colliderIndexCount:0,player:new THREE.Group(),playerState:'seated'});
 for(const chair of props.spots.filter(s=>s.kind==='chair')){
  world.player.position.copy(chair.position).add(new THREE.Vector3(0,.28,0));
  const collider=props.colliders.find(c=>c.id===chair.id);assert.ok(collider.viewTop<collider.maxY,'retain separate physical clearance bounds');
  for(const y of [chair.position.y+1.4,chair.position.y+2.15])assert.equal(world.blocksCamera(chair.position.x,chair.position.z,y),false,chair.id+' must not be an infinitely tall camera wall');
 }
 // Real walls still obstruct: this is a height correction, not a camera bypass.
 const collider=props.colliders[0];const old=collider.viewTop;collider.viewTop=collider.maxY+5;world.player.position.copy(props.spots[0].position).add(new THREE.Vector3(0,.28,0));assert.equal(world.blocksCamera(props.spots[0].position.x,props.spots[0].position.z,props.spots[0].position.y+1.4),true);collider.viewTop=old;
});
const bytes=Object.fromEntries(await Promise.all(['male','female'].map(async key=>{const b=await readFile(`src/assets/avatars/${key}.glb`);return [key,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)];})));await loadImportedAvatar(bytes);
const palette={skin:'#dfb590',hair:'#3b3633',top:'#18191b',bottoms:'#44464a',swimwear:'#577467'};
function character(female=false,outfit=1,cap=false,swim=false){const root=new THREE.Group();root.position.y=.28;const wire=['18191b','191a1c','1a1b1d','1b1c1e'][outfit-1];const p={...palette,top:'#'+(female?'2'+wire.slice(1):wire),cap:cap?'#24262a':undefined};const rig=createCoastalAvatar(root,p,true,new THREE.Group());attachImportedAvatar(root,rig,p);if(swim)setCoastalSwimwear(root,true);return {root,rig,palette:p};}
function visibleVertices(root){syncImportedAvatars(root);root.updateMatrixWorld(true);const result=[];for(const mesh of root.userData.importedAvatar.meshes){if(!mesh.visible)continue;mesh.skeleton.update();const p=mesh.geometry.getAttribute('position'),hidden=mesh.userData.componentId==='body'?mesh.geometry.getAttribute(root.userData.importedAvatar.variant.endsWith('-swim')?'_dressed':'_covered'):undefined;for(let i=0;i<p.count;i++){if(hidden&&hidden.getX(i)>.5)continue;result.push(mesh.localToWorld(mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(p,i))));}}return result;}
for(const female of [false,true]){
 test(`${female?'female':'male'} actual visible ground-sit contacts clear flat and graded ground without moving the network origin`,()=>{
  const {root,rig}=character(female);for(const heading of [0,1.1]){root.rotation.y=heading;const floor=(x,z)=>.025*x+.04*z;const before=root.position.clone();poseRelaxedCoastal(rig,'ground-sit',floor);const clearances=visibleVertices(root).map(p=>p.y-floor(p.x,p.z));assert.ok(Math.min(...clearances)>.005);assert.ok(Math.min(...clearances)<.025);assert.ok(root.position.equals(before));const first=relaxedCoastalContactSnapshot(rig,floor);for(let i=0;i<12;i++)poseRelaxedCoastal(rig,'ground-sit',floor);assert.equal(relaxedCoastalContactSnapshot(rig,floor).measurements,first.measurements,'held pose reuses visible-contact fit');assert.equal(root.userData.importedMoveActive(),null);}
 });
 test(`${female?'female':'male'} actual visible reclining body fits each sloped mat and clears its cloth and pillow`,()=>{
  const {root,rig}=character(female);for(const spot of props.spots.filter(s=>s.kind==='mat')){root.position.copy(spot.position).add(new THREE.Vector3(0,.28,0));root.rotation.y=spot.facing;const before=root.position.clone();poseRelaxedCoastal(rig,'recline',spot.surfaceHeightAt,spot.support);const vertices=visibleVertices(root),gaps=vertices.map(p=>p.y-spot.surfaceHeightAt(p.x,p.z));assert.ok(Math.min(...gaps)>.004,spot.id+' clipping: '+Math.min(...gaps));assert.ok(Math.min(...gaps)<.03,spot.id+' floating');const inverse=spot.support.matrixWorld.clone().invert();const local=vertices.map(p=>p.clone().applyMatrix4(inverse));assert.ok(Math.max(...local.map(p=>Math.abs(p.x)))<1.25,spot.id+' body exceeds mat width');assert.ok(Math.max(...local.map(p=>Math.abs(p.z)))<2.3,spot.id+' body exceeds mat length: '+Math.max(...local.map(p=>Math.abs(p.z))));assert.ok(root.position.equals(before));}
 });
 test(`${female?'female':'male'} chairs use real visible cushion contact at every ocean heading`,()=>{
  const {root,rig}=character(female);for(const spot of props.spots.filter(s=>s.kind==='chair')){root.position.copy(spot.position).add(new THREE.Vector3(0,.28,0));root.rotation.y=spot.facing;const before=root.position.clone();poseRelaxedCoastal(rig,'chair-sit',terrainHeightAt,spot.support);syncImportedAvatars(root);const pad=new THREE.Box3().setFromObject(spot.support),contacts=root.userData.importedSeatContactPoints(pad);assert.ok(contacts.length>20);const gap=Math.min(...contacts.map(p=>p.y))-pad.max.y;assert.ok(gap>-.005&&gap<.015,spot.id+' cushion gap '+gap);assert.ok(root.userData.importedSolePoints().every(p=>p.y-terrainHeightAt(p.x,p.z)>-.025),spot.id+' shoe below ground');assert.ok(root.position.equals(before));}
 });
}

test('leaving a recline clears all visual offsets and throttled skins cannot cache a stale fit',()=>{
 const {root,rig}=character();const spot=props.spots.find(s=>s.kind==='mat');root.position.copy(spot.position).add(new THREE.Vector3(0,.28,0));root.rotation.y=spot.facing;poseRelaxedCoastal(rig,'recline',spot.surfaceHeightAt,spot.support);assert.equal(rig.visualRoot.position.z,1.4);const held=rig.visualRoot.position.clone();root.userData.cullThrottle=true;poseRelaxedCoastal(rig,'ground-sit',terrainHeightAt);assert.ok(rig.visualRoot.position.equals(held),'held skin is left intact');root.userData.cullThrottle=false;clearRelaxedCoastal(rig);assert.equal(rig.visualRoot.position.length(),0);assert.equal(rig.visualRoot.rotation.x,0);assert.equal(root.userData.coastalRelaxation,undefined);assert.equal(relaxedCoastalContactSnapshot(rig,terrainHeightAt),undefined);
});

// Independently reconstruct each visible top triangle. These tests do not use
// the pose helper's probe set or BeachRelaxation.surfaceHeightAt as their oracle.
function realMatSurface(spot){
 props.root.updateMatrixWorld(true);const inverse=spot.support.matrixWorld.clone().invert(),triangles=[];
 props.root.traverseVisible(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?.count??pos.count;
  for(let i=0;i<count;i+=3){const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(pos,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));const[a,b,c]=vertices;
   if(new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).y<=1e-8)continue;
   if(vertices.some(p=>Math.abs(p.x)>1.131||Math.abs(p.z)>2.151)||Math.max(...vertices.map(p=>p.y))-Math.min(...vertices.map(p=>p.y))>1e-5)continue;
   triangles.push(vertices);
  }
 });
 assert.ok(triangles.length>=16,'actual base, six cloth stripes and pillow must supply top triangles');
 const height=(x,z)=>{let top=-Infinity;for(const[a,b,c]of triangles){const det=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z),u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/det,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/det;if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)top=Math.max(top,u*a.y+v*b.y+(1-u-v)*c.y);}return top;};
 return{inverse,height,worldAt:(localX,localZ,localY)=>new THREE.Vector3(localX,localY,localZ).applyMatrix4(spot.support.matrixWorld)};
}
function anatomy(root,spot){
 syncImportedAvatars(root);root.updateMatrixWorld(true);const surface=realMatSurface(spot),minimum={},contacts={};let min=Infinity,reads=0,maxX=0,maxZ=0;
 for(const mesh of root.userData.importedAvatar.meshes){if(!mesh.visible)continue;mesh.skeleton.update();const pos=mesh.geometry.attributes.position,ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,hidden=mesh.userData.componentId==='body'?mesh.geometry.getAttribute(root.userData.importedAvatar.variant.endsWith('-swim')?'_dressed':'_covered'):undefined;
  for(let i=0;i<pos.count;i++){if(hidden&&hidden.getX(i)>.5)continue;let dominant=0;for(let k=1;k<4;k++)if(weights.getComponent(i,k)>weights.getComponent(i,dominant))dominant=k;const bone=mesh.skeleton.bones[ids.getComponent(i,dominant)].name,region=/head|neck/i.test(bone)?'head':/Spine/.test(bone)?'back':/Hips/.test(bone)?'pelvis':/Foot|Toe/.test(bone)?'heel':/Leg/.test(bone)?'leg':'arm';
   const world=mesh.localToWorld(mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(pos,i))),local=world.clone().applyMatrix4(surface.inverse),top=surface.height(local.x,local.z);maxX=Math.max(maxX,Math.abs(local.x));maxZ=Math.max(maxZ,Math.abs(local.z));
   assert.ok(Number.isFinite(top),'the whole native silhouette stays over the authored mat');const gap=local.y-top;min=Math.min(min,gap);reads++;
   if(minimum[region]===undefined||gap<minimum[region]){minimum[region]=gap;contacts[region]={world,support:surface.worldAt(local.x,local.z,top)};}
   if(region==='head'&&top>.20)minimum.pillow=Math.min(minimum.pillow??Infinity,gap);
  }
 }
 return{minimum,min,contacts,reads,maxX,maxZ};
}

test('the visible pelvis, back, heels and pillow support every public wardrobe on all four real mat headings',()=>{
 const failures=[];
 for(const female of [false,true])for(const wardrobe of [1,2,3,4,'swim'])for(const cap of [false,true]){
  const{root,rig}=character(female,wardrobe==='swim'?1:wardrobe,cap,wardrobe==='swim');
  for(const spot of props.spots.filter(s=>s.kind==='mat')){
   root.position.copy(spot.anchor);root.position.y=spot.position.y+.28;root.rotation.y=spot.facing;poseRelaxedCoastal(rig,'recline',spot.surfaceHeightAt,spot.support);
   const result=anatomy(root,spot),label=`${female?'female':'male'} ${wardrobe} cap${cap} ${spot.id}`;
   // A tiny clearance follows real faceted garments; one scalp contact may
   // never hide a whole torso hovering .3–.5 units above the fabric again.
   const limits={pelvis:.10,back:.18,heel:.09,pillow:.055};
   if(result.min<-.008||Object.entries(limits).some(([region,max])=>!Number.isFinite(result.minimum[region])||result.minimum[region]>max))failures.push({label,min:result.min,regions:result.minimum});
   assert.ok(result.maxX<1.13&&result.maxZ<2.151,label+' authored footprint');
   // The same bend preserves a supported body; the mat-normal separation has
   // a tiny tangential component on a sloped shoreline, so allow its scale.
   setPlanetCentre(0,0);for(const{world,support}of Object.values(result.contacts)){const bentGap=planetBendPoint(world).distanceTo(planetBendPoint(support)),flatGap=world.distanceTo(support);assert.ok(Math.abs(bentGap-flatGap)<.003,`shared planet support gap ${bentGap} versus ${flatGap}`);}
   const first=relaxedCoastalContactSnapshot(rig,spot.surfaceHeightAt),pitch=rig.head.rotation.x;for(let frame=0;frame<8;frame++)poseRelaxedCoastal(rig,'recline',spot.surfaceHeightAt,spot.support);assert.equal(relaxedCoastalContactSnapshot(rig,spot.surfaceHeightAt).measurements,first.measurements);assert.equal(rig.head.rotation.x,pitch,'cached neck support is held with the body');
  }
  root.userData.disposeImportedAvatar();
 }
 assert.deepEqual(failures,[],'independent rendered-triangle anatomy contact failures');
});

test('entry preparation restores transforms and equivalent native instances use prewarmed scalar fits with zero vertex sweeps',()=>{
 const targets=props.spots.filter(s=>s.kind==='mat').map(spot=>{const support=spot.support.clone();support.position.y+=.123;support.updateMatrixWorld(true);return{...spot,support,position:spot.position.clone().add(new THREE.Vector3(0,.123,0)),anchor:spot.anchor.clone().add(new THREE.Vector3(0,.123,0)),surfaceHeightAt:(x,z)=>spot.surfaceHeightAt(x,z)+.123};});
 const{root,rig}=character();root.position.set(5,.28,8);root.rotation.y=.8;rig.head.rotation.y=.17;rig.visualRoot.position.set(.03,.08,.11);root.visible=false;root.userData.cullThrottle=true;root.userData.setImportedCulled(true);
 const objects=[...new Set([root,...Object.values(rig).filter(value=>value instanceof THREE.Object3D)])],saved=objects.map(o=>[o.position.toArray(),o.quaternion.toArray(),o.scale.toArray(),o.visible]);
 assert.equal(prepareCoastalReclines(rig,targets),4);
 assert.deepEqual(objects.map(o=>[o.position.toArray(),o.quaternion.toArray(),o.scale.toArray(),o.visible]),saved);assert.equal(root.userData.importedCulled(),true);assert.equal(root.userData.cullThrottle,true);assert.equal(root.userData.coastalRelaxation,undefined);
 const other=character();assert.equal(other.root.userData.importedAvatar.meshes[0].geometry,root.userData.importedAvatar.meshes[0].geometry,'native instances share template geometry');let sweeps=0;
 for(const mesh of other.root.userData.importedAvatar.meshes){const original=mesh.applyBoneTransform;mesh.applyBoneTransform=function(...args){sweeps++;return original.apply(this,args);};}
 for(const spot of targets){other.root.position.copy(spot.anchor);other.root.position.y=spot.position.y+.28;other.root.rotation.y=spot.facing;poseRelaxedCoastal(other.rig,'recline',spot.surfaceHeightAt,spot.support);assert.equal(sweeps,0,'first use after admission must not read/deform vertices again');const worldY=other.root.position.y+other.rig.visualRoot.position.y;other.root.position.y+=.11;poseRelaxedCoastal(other.rig,'recline',spot.surfaceHeightAt,spot.support);assert.ok(Math.abs(other.root.position.y+other.rig.visualRoot.position.y-worldY)<1e-9,'remote Y smoothing retains physical support');clearRelaxedCoastal(other.rig);}
 assert.equal(sweeps,0);assert.equal(other.rig.visualRoot.position.length(),0);root.userData.disposeImportedAvatar();other.root.userData.disposeImportedAvatar();
});

test('gate wardrobe/cap preparation also covers new native visitors and water-forced swimwear without first-use vertex work',()=>{
 const targets=props.spots.filter(s=>s.kind==='mat').map(spot=>{const support=spot.support.clone();support.position.y+=.257;support.updateMatrixWorld(true);return{...spot,support,position:spot.position.clone().add(new THREE.Vector3(0,.257,0)),anchor:spot.anchor.clone().add(new THREE.Vector3(0,.257,0)),surfaceHeightAt:(x,z)=>spot.surfaceHeightAt(x,z)+.257};});
 for(const female of [false,true]){
  for(const outfit of [1,2,3,4]){
   const warm=character(female,outfit);
   for(const cap of [undefined,'#24262a']){warm.root.userData.setImportedPalette({...warm.palette,cap});assert.equal(prepareCoastalReclines(warm.rig,targets),4);}
   warm.root.userData.disposeImportedAvatar();
  }
  for(const outfit of [1,2,3,4,'water'])for(const cap of [false,true]){
   const other=character(female,outfit==='water'?1:outfit,cap,outfit==='water');let reads=0;
   for(const mesh of other.root.userData.importedAvatar.meshes){const original=mesh.applyBoneTransform;mesh.applyBoneTransform=function(...args){reads++;return original.apply(this,args);};}
   for(const spot of targets){other.root.position.copy(spot.anchor);other.root.position.y=spot.position.y+.28;other.root.rotation.y=spot.facing;poseRelaxedCoastal(other.rig,'recline',spot.surfaceHeightAt,spot.support);assert.equal(reads,0,`${female?'female':'male'} ${outfit} cap${cap}: gate fits must transfer between native instances`);clearRelaxedCoastal(other.rig);}
   other.root.userData.disposeImportedAvatar();
  }
 }
});
