import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { build } from 'esbuild';
import { INLAND_HOUSES, HILL_WALK, SEA_Y, TEMPLE_STAIR_VISUAL_OVERLAP, terrainHeightAt, isSwimmingDepth, createCoastalTerrain, createGroundRibbon, groundRibbonEdges } from '../src/world/CoastalTerrain.ts';

test('collision samples match every rendered terrain triangle, including off-grid positions', () => {
  const mesh=createCoastalTerrain(),p=mesh.geometry.getAttribute('position');
  for(let i=0;i<p.count;i+=3){
    const x=p.getX(i)*.2+p.getX(i+1)*.3+p.getX(i+2)*.5;
    const z=p.getZ(i)*.2+p.getZ(i+1)*.3+p.getZ(i+2)*.5;
    const y=p.getY(i)*.2+p.getY(i+1)*.3+p.getY(i+2)*.5;
    assert.ok(Math.abs(terrainHeightAt(x,z)-y)<.00001,`surface mismatch at ${x},${z}`);
  }
  mesh.geometry.dispose();mesh.material.dispose();
});

test('the full contour walk stays below 5 percent on the actual triangle surface', () => {
  for(let i=1;i<HILL_WALK.length;i++){
    const a=HILL_WALK[i-1],b=HILL_WALK[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]);
    const steps=Math.ceil(length/.1),run=length/steps;
    let previous=terrainHeightAt(a[0],a[2]);
    for(let n=1;n<=steps;n++){
      const t=n/steps,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
      const next=terrainHeightAt(x,z);
      assert.ok(Math.abs(next-previous)/run<.05,`steep contour at ${x},${z}`);
      previous=next;
    }
  }
});

test('paving faces upward and its edges rest on the same walking surface', () => {
  const ribbon=createGroundRibbon('test',[[0,60],[0,24],[-19,23.5]],4,new THREE.MeshBasicMaterial());
  const p=ribbon.geometry.getAttribute('position'),n=ribbon.geometry.getAttribute('normal');
  for(let i=0;i<p.count;i++){
    assert.ok(Math.abs(p.getY(i)-terrainHeightAt(p.getX(i),p.getZ(i))-.035)<.00001);
    assert.ok(n.getY(i)>.95,'inverted paving');
  }
  ribbon.geometry.dispose();ribbon.material.dispose();
});

test('paving triangle interiors follow the hills, including bends and broad paths',()=>{
  for(const [points,width] of [[HILL_WALK.map(p=>[p[0],p[2]]),4],[[[0,67],[0,24],[0,12]],12],[[[0,56],[68,56],[68,0],[52,-12]],7]]){
    const mesh=createGroundRibbon('grade check',points,width,new THREE.MeshBasicMaterial());
    const g=mesh.geometry,p=g.getAttribute('position'),idx=g.getIndex();
    for(let i=0;i<(idx?.count??p.count);i+=3){
      const vertex=[0,1,2].map(j=>idx?idx.getX(i+j):i+j);
      for(const weights of [[.2,.3,.5],[.6,.2,.2]]){
        const x=vertex.reduce((v,n,j)=>v+p.getX(n)*weights[j],0);
        const y=vertex.reduce((v,n,j)=>v+p.getY(n)*weights[j],0);
        const z=vertex.reduce((v,n,j)=>v+p.getZ(n)*weights[j],0);
        assert.ok(Math.abs(y-terrainHeightAt(x,z)-.035)<.00001,`paving penetrates terrain at ${x},${z}`);
      }
    }
    mesh.geometry.dispose();mesh.material.dispose();
  }
});

test('water depth follows the seabed across the irregular coast', () => {
  for(const x of [-80,-40,0,40,80]){
    assert.equal(isSwimmingDepth(x,-85),true);
    assert.equal(isSwimmingDepth(x,-25),false);
    assert.ok(terrainHeightAt(x,-85)<SEA_Y-1.25);
  }
  assert.equal(isSwimmingDepth(0,-50),false,'Shore equipment pad must stay dry');
});

test('temple roof is closed with outward normals and sedan wheels reach ground', async () => {
  const bundled=await build({entryPoints:[new URL('../src/world/CoastalGeometry.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
  const {coastalRoof,createCoastalSedan}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  const g=coastalRoof(37,43,2.34),n=g.getAttribute('normal');
  const positions=g.getAttribute('position');
  const edges=new Map();
  const key=i=>[positions.getX(i),positions.getY(i),positions.getZ(i)].map(v=>v.toFixed(5)).join(',');
  for(let i=0;i<n.count;i+=3){
    const ys=[0,1,2].map(j=>positions.getY(i+j));
    if(ys.every(y=>y>=0))assert.ok(n.getY(i)>.8,'tile slopes face up');
    if(ys.every(y=>y<0))assert.ok(n.getY(i)<-.99,'soffit faces down');
    for(let j=0;j<3;j++){const edge=[key(i+j),key(i+(j+1)%3)].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
  }
  assert.ok([...edges.values()].every(count=>count===2),'no open roof seams');
  const car=createCoastalSedan(0x86594a);car.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(car);
  assert.ok(Math.abs(bounds.min.y-.01)<.001);
  assert.ok(bounds.max.z-bounds.min.z>bounds.max.x-bounds.min.x);
  g.dispose();
});

test('stars fade in after dusk and out before the cycle joins dawn', async () => {
  const bundled=await build({entryPoints:[new URL('../src/world/CoastalSky.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
  const {nightSkyAmount}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  assert.equal(nightSkyAmount(16),0);
  assert.equal(nightSkyAmount(30),0);
  assert.equal(nightSkyAmount(45),1);
  assert.ok(nightSkyAmount(35)>0 && nightSkyAmount(35)<1);
  assert.ok(nightSkyAmount(57)>0 && nightSkyAmount(57)<1);
  assert.ok(Math.abs(nightSkyAmount(59.999)-nightSkyAmount(0))<.00001);
});

test('pavement triangles do not overlap roads or earlier walking surfaces',async()=>{
  const output=await build({stdin:{contents:"export * from './src/world/CoastalCirculation';export * from './src/world/CoastalSurfaces';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
  const {COASTAL_ROUTES,ROAD_POLYGONS,excludeRoads}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
  const inside=(x,z,poly)=>poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return (b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>1e-5;});
  let checked=0;
  const paved=[];
  for(const route of COASTAL_ROUTES.filter(r=>r.kind==='walk')){
    const mesh=createGroundRibbon(route.name,route.points,route.width,new THREE.MeshBasicMaterial(),.055);
    const exclusions=[...ROAD_POLYGONS,...paved];
    excludeRoads(mesh,exclusions);
    const p=mesh.geometry.getAttribute('position');
    assert.ok(p.count>0,route.name+' must retain walking surface');
    for(let i=0;i<p.count;i+=3){
      const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
      assert.ok(!exclusions.some(poly=>inside(x,z,poly)),route.name+' overlaps another surface');checked++;
    }
    const edges=groundRibbonEdges(route.points,route.width);
    for(let i=1;i<edges.length;i++)paved.push([edges[i-1][0],edges[i][0],edges[i][1],edges[i-1][1]]);
    mesh.geometry.dispose();mesh.material.dispose();
  }
  assert.ok(checked>100);
});

test('the Shore service lane has no zebra stripes or pedestrian paving layered across it',async()=>{
  const output=await build({entryPoints:['src/world/CoastalCirculation.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const {COASTAL_ROUTES}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
  const inShoreFrontage=(x,z)=>x>24&&x<51&&z>-18&&z<-5;
  for(const route of COASTAL_ROUTES.filter(route=>route.kind==='walk'||route.kind==='crossing')){
    const mesh=createGroundRibbon(route.name,route.points,route.width,new THREE.MeshBasicMaterial());
    const p=mesh.geometry.getAttribute('position');
    for(let i=0;i<p.count;i+=3){
      const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3;
      const z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
      assert.equal(inShoreFrontage(x,z),false,`${route.name} remains over the Shore road at ${x},${z}`);
    }
    mesh.geometry.dispose();mesh.material.dispose();
  }
});

test('street light footings clear the gate junction and the rooftop walking approach',async()=>{
  const output=await build({entryPoints:['src/world/CoastalCirculation.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const {streetLampObstructsRoute}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
  assert.equal(streetLampObstructsRoute(11,56),true,'gate service-road junction');
  assert.equal(streetLampObstructsRoute(11,8),true,'diagonal rooftop approach');
  assert.equal(streetLampObstructsRoute(8.5,40),true,'pavement centre');
  for(const [x,z] of [[23,-18],[47,-29],[-15,-42],[-11,46]])assert.equal(streetLampObstructsRoute(x,z),false,'clear verge');
});


test('shop cabinets and club threshold retain level terrain after hill and arrival grading',()=>{
  for(let x=23;x<=57;x+=.37)for(let z=8;z<=20;z+=.51)assert.ok(Math.abs(terrainHeightAt(x,z))<1e-8,`shop intrusion ${x},${z}`);
  for(let x=-24;x<=-19.4;x+=.1)for(let z=19.2;z<=27.8;z+=.2)assert.ok(Math.abs(terrainHeightAt(x,z))<1e-8,`club threshold gap ${x},${z}`);
});


test('neighbouring house ground meets every wall without exposed foundation bands',()=>{
  for(const [x,z,w,d,,base] of INLAND_HOUSES) {
    for(let t=0;t<=1;t+=.05)for(const [px,pz] of [[x-w/2+t*w,z-d/2],[x-w/2+t*w,z+d/2],[x-w/2,z-d/2+t*d],[x+w/2,z-d/2+t*d]]) {
      const gap=base-terrainHeightAt(px,pz);
      assert.ok(gap>=0&&gap<.17,`house ${x},${z} exposed ${gap} at ${px},${pz}`);
    }
  }
});

test('every temple riser has equal height, terrain stays below treads, and the podium perimeter is buried',async()=>{
 assert.ok(TEMPLE_STAIR_VISUAL_OVERLAP>=.12,'tread masonry must overlap the terrain cut enough to close oblique edge seams');
 const terrain=createCoastalTerrain();terrain.updateMatrixWorld(true);
 const {TEMPLE_STAIRS:f,templeStairX,templeTreadTop}=await import('../src/world/CoastalTerrain.ts');
 for(let i=0;i<f.count;i++){
  const top=templeTreadTop((templeStairX(i)+templeStairX(i+1))/2);
  assert.ok(Math.abs(top-.24*(i+1))<1e-9);
  for(const u of [.01,.5,.99])for(const z of [-2.4,4,10.4]){
   const x=templeStairX(i)+(templeStairX(i+1)-templeStairX(i))*u;
   assert.equal(new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0)).intersectObject(terrain).length,0,`earth rendered through tread ${i} at ${x},${z}`);
  }
 }
 for(const x of [74.5,76,91,106,107.5])for(const z of [-15.5,23.5])assert.ok(terrainHeightAt(x,z)>5.82,`exposed foundation ${x},${z}`);
});
