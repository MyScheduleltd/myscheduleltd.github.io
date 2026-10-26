import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const built=await build({stdin:{contents:"export * from './src/world/SnowSurfaceCoverage';export * from './src/world/FestivalWeather';export {createConvertibleSeatProxy} from './src/world/ConvertibleSeat';export {coastalRoof} from './src/world/CoastalGeometry';export {IslandDock} from './src/world/IslandDock';export {setIslandTerrain,terrainHeightAt,SEA_Y} from './src/world/CoastalTerrain';export {PLANET,subdivideSceneForPlanet} from './src/world/PlanetCurve';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {THREE,buildSnowTerrain,buildSnowSurfaceMeshes,SNOW_SURFACE_BUDGET,FestivalWeather,createConvertibleSeatProxy,coastalRoof,IslandDock,setIslandTerrain,terrainHeightAt,SEA_Y,PLANET,subdivideSceneForPlanet}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text+'\n//# sourceURL=snow-surface-coverage-fixture.mjs').toString('base64'));
const box=(width,height,depth,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth));mesh.position.set(x,y-height/2,z);return mesh;};
const faces=geometry=>{
 const result=[],p=geometry.attributes.position,lift=geometry.attributes.snowLift,index=geometry.index;
 for(let i=0;i<(index?.count??p.count);i+=3){const vertices=[0,1,2].map(k=>{const j=index?index.getX(i+k):i+k;return{x:p.getX(j),y:p.getY(j),z:p.getZ(j),lift:lift.getX(j)};});result.push(vertices);}
 return result;
};
const area=([a,b,c])=>Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/2;
function heightAt(geometry,x,z){
 const results=[];
 for(const [a,b,c]of faces(geometry).filter(face=>face.every(p=>p.lift===1))){
  const d=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(d)<1e-9)continue;
  const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/d,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/d,w=1-u-v;
  if(Math.min(u,v,w)>-1e-6)results.push(u*a.y+v*b.y+w*c.y);
 }
 return results;
}
const bytes=g=>Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,g.index?.array.byteLength??0);

test('two temple roof tiers cover only the real exposed envelope, excluding the interior floor and coplanar duplicates',()=>{
 const floor=box(10,.2,10,0,0,0),low=box(6,.5,6,0,4,0),high=box(2,.4,2,0,7,0),duplicate=high.clone();
 const result=buildSnowSurfaceMeshes([{id:'floor',object:floor},{id:'lower-roof',object:low},{id:'upper-roof',object:high},{id:'same-top',object:duplicate}]);
 const tops=faces(result.geometry).filter(face=>face.every(p=>p.lift===1));
 assert.ok(Math.abs(tops.reduce((n,f)=>n+area(f),0)-100)<1e-5,'exact projected coverage must have neither holes nor double-coated interior overlap');
 for(const [x,z,expected]of[[.23,.19,7],[2.2,.15,4],[4.1,.17,0]]){
  const heights=heightAt(result.geometry,x,z);assert.ok(heights.length>0);assert.ok(heights.every(y=>Math.abs(y-expected-SNOW_SURFACE_BUDGET.contactLift)<1e-5));
 }
 assert.ok(faces(result.geometry).some(face=>face.some(p=>p.lift===0)&&face.some(p=>p.lift===1)),'exposed roof edges retain contact skirts');
 assert.ok(result.triangles<250);result.geometry.dispose();
});

test('authored dock planks and temple treads preserve genuine gaps, exact elevation and exclusions over water',()=>{
 const dock=new THREE.Group(),boat=box(2,.2,2,0,3,0);dock.add(box(2,.2,3,-2,1,0),box(2,.2,3,2,1,0),boat);
 const result=buildSnowSurfaceMeshes([{id:'dock',object:dock,exclude:[boat]}]);
 assert.equal(heightAt(result.geometry,0,0).length,0,'neither an ocean gap nor the moving ferry receives a fixed floating snow rectangle');
 assert.ok(heightAt(result.geometry,-2,.2).every(y=>Math.abs(y-1-SNOW_SURFACE_BUDGET.contactLift)<1e-6));
 assert.ok(Math.abs(faces(result.geometry).filter(f=>f.every(p=>p.lift===1)).reduce((n,f)=>n+area(f),0)-12)<1e-6);
 const stairs=new THREE.Group();stairs.add(box(3,.3,4,0,.3),box(2,.6,4,.5,.6),box(1,.9,4,1,.9));
 const stepped=buildSnowSurfaceMeshes([{id:'temple-stairs',object:stairs}]);
 for(const [x,top]of[[-1.2,.3],[-.2,.6],[1.1,.9]])assert.ok(heightAt(stepped.geometry,x,.23).every(y=>Math.abs(y-top-SNOW_SURFACE_BUDGET.contactLift)<1e-6));
 const submerged=buildSnowSurfaceMeshes([{id:'submerged-support',object:box(3,.2,3,0,-2.2),minimumHeight:SEA_Y+.02}]);
 assert.equal(submerged.geometry.index.count,0,'submerged timber and tide bands cannot become white water patches');
 assert.equal(heightAt(stepped.geometry,2,.23).length,0);result.geometry.dispose();stepped.geometry.dispose();submerged.geometry.dispose();
});

test('a transformed pitched roof follows its real triangle plane, with no guessed horizontal slab or source mutation',()=>{
 const parent=new THREE.Group(),roof=box(8,.3,5,0,0);roof.rotation.z=.26;parent.position.set(17,9,-11);parent.rotation.y=.4;parent.add(roof);parent.updateMatrixWorld(true);
 const before=roof.geometry.attributes.position.array.slice(),source=roof.geometry;
 const built=buildSnowSurfaceMeshes([{id:'palace-pitched',object:parent}]);
 const inverse=roof.matrixWorld.clone().invert();
 for(const face of faces(built.geometry).filter(face=>face.every(p=>p.lift===1)))for(const p of face){
  const local=new THREE.Vector3(p.x,p.y-SNOW_SURFACE_BUDGET.contactLift,p.z).applyMatrix4(inverse);
  assert.ok(Math.abs(local.y-.15)<2e-6,'every top vertex remains on the authored rotated roof face');
 }
 assert.equal(roof.geometry,source);assert.deepEqual(source.attributes.position.array,before);
 built.geometry.dispose();
});

test('visible shell sources use the final fallback swap, respect hidden ancestors and exclude an attendant while hidden seat proxies still work',()=>{
 const booth=new THREE.Group(),fallback=new THREE.Group(),old=box(8,.4,8,0,12,0),loaded=box(4,.3,4,0,5,0),actor=box(1,1,1,0,20,0);
 fallback.add(old);fallback.visible=false;booth.add(fallback,loaded,actor);
 const visible=buildSnowSurfaceMeshes([{id:'loaded-booth',object:booth,exclude:[actor],visibleOnly:true}]);
 assert.ok(heightAt(visible.geometry,.3,.2).every(y=>Math.abs(y-5-SNOW_SURFACE_BUDGET.contactLift)<1e-5));
 assert.equal(heightAt(visible.geometry,3,.2).length,0,'an invisible ancestor suppresses all its old roof descendants');
 assert.ok(visible.shelteredAt(.3,.2,4));assert.equal(visible.shelteredAt(.3,.2,6),false,'neither retired fallback nor moving actor can shelter the visible shell');
 loaded.visible=false;fallback.visible=true;
 const failed=buildSnowSurfaceMeshes([{id:'fallback-booth',object:booth,exclude:[actor],visibleOnly:true}]);assert.ok(heightAt(failed.geometry,3,.2).some(y=>Math.abs(y-12-SNOW_SURFACE_BUDGET.contactLift)<1e-5));
 old.visible=false;
 const proxy=buildSnowSurfaceMeshes([{id:'hidden-seat-proxy',object:old}]);assert.ok(proxy.topTriangles>0,'visibility filtering is explicit and never disables measurement proxies');
 visible.geometry.dispose();failed.geometry.dispose();proxy.geometry.dispose();
});

test('the production kicked temple roof coats every exposed tile triangle while the upper tier hides lower tiles',()=>{
 const low=new THREE.Mesh(coastalRoof(30,24,2.34)),high=new THREE.Mesh(coastalRoof(24,18,2.08));
 low.position.y=12;high.position.y=15.6;
 const result=buildSnowSurfaceMeshes([{id:'temple-lower',object:low},{id:'temple-upper',object:high}]);
 const tops=faces(result.geometry).filter(face=>face.every(p=>p.lift===1));
 assert.ok(Math.abs(tops.reduce((n,t)=>n+area(t),0)-720)<.001,'the authored kicked perimeter must be filled exactly once');
 for(const [x,z]of[[14.7,11.6],[0,11.6],[10.1,7.1],[.37,.21]]){
  const heights=heightAt(result.geometry,x,z);assert.ok(heights.length>0);
  if(Math.abs(x)<12&&Math.abs(z)<9)assert.ok(heights.every(y=>y>=15.6));
  else assert.ok(heights.every(y=>y>=12&&y<15.6));
 }
 assert.ok(result.triangles<1500);result.geometry.dispose();
});

test('adaptive ground coats midpoint hills and closes every refinement edge without bridging a cliff or ocean',()=>{
 const query={heightAt:(x,z)=>.3*Math.sin(Math.PI*x/2)**2*Math.exp(-z*z/5),dryAt:(x,z)=>x>=-4&&x<=4&&z>=-4&&z<=4,shelteredAt:()=>false};
 const result=buildSnowTerrain(query),triangles=faces(result.geometry),edges=new Map();
 const key=p=>[p.x,p.z].map(v=>Math.round(v*1e6)).join(',');
 for(const face of triangles)for(let i=0;i<3;i++){
  const a=face[i],b=face[(i+1)%3],ak=key(a),bk=key(b),k=ak<bk?ak+'|'+bk:bk+'|'+ak;
  const edge=edges.get(k);if(edge)edge.count++;else edges.set(k,{a,b,count:1});
 }
 assert.ok(result.geometry.index,'repeated terrain corners must remain welded');
 assert.ok(Math.abs(triangles.reduce((n,t)=>n+area(t),0)-64)<1e-6);
 for(const {a,b,count}of edges.values())if(count===1)assert.ok((Math.abs(a.x)===4&&Math.abs(b.x)===4)||(Math.abs(a.z)===4&&Math.abs(b.z)===4),'there must be no exposed T-junction inside dry ground');
 const centre=heightAt(result.geometry,1,.17);assert.ok(centre.length>0&&centre.every(y=>Math.abs(y-query.heightAt(1,.17)-SNOW_SURFACE_BUDGET.contactLift)<.13));
 const cliff=buildSnowTerrain({...query,heightAt:x=>x<0?0:3});
 for(const face of faces(cliff.geometry))assert.ok(Math.max(...face.map(p=>p.y))-Math.min(...face.map(p=>p.y))<=SNOW_SURFACE_BUDGET.maximumRise+.0001);
 assert.equal(heightAt(cliff.geometry,-.12,.17).length,0,'the discontinuity is rejected within one quarter-unit cell rather than bridged');
 assert.ok(heightAt(cliff.geometry,-.4,.17).length>0,'valid hillside resumes within 0.25 units of the discontinuity');
 assert.ok(bytes(result.geometry)<100_000);result.geometry.dispose();cliff.geometry.dispose();
});

test('the authored registry clips false walk ramps above or below treads while preserving exposed steep ground',()=>{
 const query={heightAt:(x,z)=>x>0&&x<3&&Math.abs(z)<1.8?x*.3+.7:Math.max(0,-x-3)*1.8,
  dryAt:(x,z)=>x>=-5&&x<=5&&z>=-4&&z<=4,shelteredAt:()=>false};
 const terrain=buildSnowTerrain(query),stairs=new THREE.Group();
 stairs.add(box(1,.3,3,.5,.3),box(1,.6,3,1.5,.6),box(1,.9,3,2.5,.9));
 const roof=box(2,.3,2,0,7,-2.5);
 const result=buildSnowSurfaceMeshes([{id:'real-treads',object:stairs,terrainMask:true},{id:'real-roof',object:roof}],terrain.geometry);
 assert.ok(result.terrainGeometry);
 for(const x of[.3,1.3,2.3]){
  assert.equal(heightAt(result.terrainGeometry,x,.23).length,0,'the walkable ramp cannot survive underneath a registered real tread');
  assert.ok(heightAt(result.geometry,x,.23).length>0);
 }
 assert.equal(heightAt(result.terrainGeometry,.23,-2.6).length,0,'an exact roof overhang shelters the terrain outside older coarse building boxes');
 assert.ok(heightAt(result.terrainGeometry,4,.23).length>0,'nearby uncovered ground remains coated');
 assert.ok(heightAt(result.terrainGeometry,-4.23,.23).length>0,'a real steep hillside must not inherit the roof-face slope filter');
 terrain.geometry.dispose();result.geometry.dispose();result.terrainGeometry.dispose();
});

test('finished real roofs restore outdoor edges lost to provisional shelter boxes and share exact overhead checks',()=>{
 let provisionalChecks=0;
 const weather=new FestivalWeather(new THREE.Scene(),{heightAt:()=>0,dryAt:(x,z)=>Math.abs(x)<=5&&Math.abs(z)<=5,
  shelteredAt:(x,z)=>{provisionalChecks++;return Math.abs(x)<3&&Math.abs(z)<3;}},true);
 const old=weather.root.getObjectByName('thin-ground-snow').geometry;let oldDisposed=0;old.addEventListener('dispose',()=>oldDisposed++);
 assert.equal(heightAt(old,2.35,.23).length,0,'the fixture must reproduce the original oversized shelter hole');
 assert.equal(weather.shelteredAt(.2,.2,0),undefined);
 weather.addSurfaceMeshes([{id:'actual-palace-roof',object:box(4,.3,4,0,5)}]);
 const ground=weather.root.getObjectByName('thin-ground-snow').geometry;
 assert.equal(oldDisposed,1,'the provisional GPU buffer is released before warmup');
 assert.ok(heightAt(ground,2.35,.23).length>0,'legitimate outdoor pavement outside the real eave must be restored');
 assert.equal(heightAt(ground,.23,.23).length,0,'the actual roof must still keep interior ground dry');
 assert.equal(weather.shelteredAt(.23,.23,0),true);
 assert.equal(weather.shelteredAt(2.35,.23,0),false,'the old coarse box cannot suppress weather outside the real eave');
 assert.equal(weather.shelteredAt(.23,.23,5.1),false,'particles above the roof must still fall');
 provisionalChecks=0;
 const now=Date.UTC(2026,9,25);weather.setShared({version:1,updatedAt:now,schedule:[{id:'rain',type:'rain',startsAt:now-1000,endsAt:now+600_000}],clearedSeats:[]});
 weather.update(.1,new THREE.Vector3(),now);assert.equal(provisionalChecks,0,'rain must use the prepared exact roof query');
 weather.setShared({version:1,updatedAt:now+1,schedule:[{id:'snow',type:'snow',startsAt:now-1000,endsAt:now+600_000}],clearedSeats:[]});
 weather.update(.1,new THREE.Vector3(),now+1);assert.equal(provisionalChecks,0,'snow must use the same prepared exact roof query');
 weather.dispose();assert.equal(weather.shelteredAt(.23,.23,0),undefined,'disposal releases the CPU shelter registry too');
});

test('the retained shelter query follows triangular eaves and support elevation without retaining source mutation',()=>{
 const roof=new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,4,0),new THREE.Vector3(0,4,4),new THREE.Vector3(4,4,0)]));
 const result=buildSnowSurfaceMeshes([{id:'triangle-canopy',object:roof}]);
 assert.equal(result.shelteredAt(.3,.3,0),true);
 assert.equal(result.shelteredAt(3,3,0),false,'a bounding box cannot fill the missing triangular half');
 assert.equal(result.shelteredAt(.3,.3,4),false);
 roof.position.set(100,100,100);roof.geometry.dispose();
 assert.equal(result.shelteredAt(.3,.3,0),true,'the finished numeric registry is independent of source objects later batched or disposed');
 result.geometry.dispose();
});

test('actual island dock, planks, coping and stairs remain bounded after production planet subdivision',()=>{
 const previousDocument=globalThis.document,previousPlanet=PLANET.on,previousWarn=console.warn;let harmlessMaterialWarnings=0;
 console.warn=(...args)=>{if(String(args[0])==="THREE.Material: parameter 'map' has value of undefined.")harmlessMaterialWarnings++;else previousWarn(...args);};
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){}})})};setIslandTerrain(true);
 let terrain,result,dock;
 try{
  dock=new IslandDock();PLANET.on=true;subdivideSceneForPlanet(dock.group);
  terrain=buildSnowTerrain({heightAt:(x,z)=>dock.heightAt(x,z)??terrainHeightAt(x,z),dryAt:(x,z)=>terrainHeightAt(x,z)>SEA_Y+.05,shelteredAt:()=>false});
  const start=performance.now();result=buildSnowSurfaceMeshes([{id:'island-dock',object:dock.group,exclude:[dock.boat],minimumHeight:SEA_Y+.02}],terrain.geometry);
  assert.ok(result.sourceTriangles>300&&result.topTriangles>100);
  assert.ok(result.triangles<20_000&&bytes(result.geometry)<2*1024**2);
  assert.ok(result.terrainGeometry&&bytes(result.terrainGeometry)<2*1024**2);
  assert.ok(result.geometry.attributes.position.count<result.geometry.index.count);
  assert.equal(heightAt(result.geometry,30,95).length,0,'an adjacent harbour water location cannot acquire a roof-size rectangle');
  assert.ok(heightAt(result.geometry,-3.2,95.3).length>0,'the authored pier head itself receives snow over the basin');
  console.log('CPU authored-dock snow budget '+JSON.stringify({sourceTriangles:result.sourceTriangles,topTriangles:result.topTriangles,triangles:result.triangles,bufferBytes:bytes(result.geometry),clippedTerrainBytes:bytes(result.terrainGeometry),constructionMs:+(performance.now()-start).toFixed(1),existingHarmlessMaterialWarnings:harmlessMaterialWarnings}));
 }finally{
  terrain?.geometry.dispose();result?.geometry.dispose();result?.terrainGeometry?.dispose();
  dock?.group.traverse(object=>{if(object.geometry)object.geometry.dispose();if(object.material){for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
  setIslandTerrain(false);PLANET.on=previousPlanet;globalThis.document=previousDocument;console.warn=previousWarn;
 }
});

test('car cushions use the real nested driver/passenger proxies; first snow, brushing and warmup retain all buffers',()=>{
 const scene=new THREE.Scene(),car=new THREE.Group(),pad=box(1.1,.22,1.4,.7,1.3,.3);car.position.set(8,2,-9);car.rotation.y=.4;car.add(pad);scene.add(car);
 const proxy=createConvertibleSeatProxy(car,pad,'passenger');
 const weather=new FestivalWeather(scene,{heightAt:()=>0,dryAt:()=>false,shelteredAt:()=>false},true);
 weather.addSupports([{id:'DRIVE-1-PASSENGER',object:proxy,x:0,z:0,y:-50,width:1,depth:1}]);
 weather.addSurfaceMeshes([{id:'fixed-dock',object:box(3,.2,4,30,1,-10)}]);
 const cap=weather.root.getObjectByName('seat-snow-DRIVE-1-PASSENGER'),fixed=weather.root.getObjectByName('authored-outdoor-snow');
 const ground=weather.root.getObjectByName('thin-ground-snow'),programs=[ground,cap,fixed].map(mesh=>{
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  mesh.material.onBeforeCompile(shader);return{key:mesh.material.customProgramCacheKey(),vertex:shader.vertexShader,fragment:shader.fragmentShader,uniforms:Object.keys(shader.uniforms).sort()};
 });
 assert.deepEqual(programs[1],programs[0],'seat caps must reuse the exact settled-ground shader variant prepared at entry');
 assert.deepEqual(programs[2],programs[0],'the authored roof/dock layer must not add a shader variant after admission');
 const centre=pad.localToWorld(new THREE.Vector3(0,.11,0));
 assert.ok(heightAt(cap.geometry,centre.x,centre.z).every(y=>Math.abs(y-centre.y-SNOW_SURFACE_BUDGET.contactLift)<1e-5),'seat.position/centre guesses must not override the real cushion top');
 const geometries=[cap.geometry,fixed.geometry],buffers=geometries.flatMap(g=>Object.values(g.attributes).map(a=>a.array.buffer));
 weather.addSurfaceMeshes([{id:'do-not-rebuild-in-play',object:box(9,.1,9)}]);assert.equal(fixed.geometry,geometries[1]);
 const now=Date.UTC(2026,9,25),shared={version:1,updatedAt:now,schedule:[{id:'snow-test',type:'snow',startsAt:now-600_000,endsAt:now+600_000}],clearedSeats:[]};
 weather.setShared(shared);weather.update(.1,new THREE.Vector3(),now);assert.ok(cap.visible&&fixed.visible);
 weather.setShared({...shared,updatedAt:now+1,clearedSeats:[{seatId:'DRIVE-1-PASSENGER',occurrenceId:'snow-test',clearedAt:now}]});weather.update(.1,new THREE.Vector3(),now+1);
 assert.equal(cap.visible,false);assert.equal(fixed.visible,true);weather.setWarmup(true);assert.equal(cap.visible,true);weather.setWarmup(false);
 assert.deepEqual(geometries.flatMap(g=>Object.values(g.attributes).map(a=>a.array.buffer)),buffers);
 const disposed=new Map();for(const g of geometries){disposed.set(g,0);g.addEventListener('dispose',()=>disposed.set(g,disposed.get(g)+1));}
 weather.dispose();weather.dispose();assert.ok([...disposed.values()].every(n=>n===1));
});
