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

test('nothing on the DJ console reaches back into the DJ standing at it', async () => {
  // The reported fault: on a phone the DJs were clipping through their booths.
  // The console's top used to overhang the cabinet behind it — the worktop to
  // -0.65 and the platters to -0.70 — while the DJ stands at -0.9 and leans
  // forward over the decks. The overhang went through their chest.
  const bundled = await build({
    entryPoints: [new URL('../src/world/CoastalFurniture.ts', import.meta.url).pathname],
    bundle: true, platform: 'node', format: 'esm', write: false,
  });
  const { createCoastalDecks, DECK_TOP_BACK, DECK_DJ_STAND_Z } =
    await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));

  const decks = createCoastalDecks(4.9);
  decks.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const whole = new THREE.Box3().setFromObject(decks);

  // Only the parts standing above the worktop can meet a chest; the cabinet
  // below is exactly what the DJ's legs are meant to be hidden behind.
  let worst = Number.POSITIVE_INFINITY;
  let culprit = '';
  decks.traverse((child) => {
    if (!child.isMesh) return;
    box.setFromObject(child);
    if (box.max.y < 1.35) return;
    if (box.min.z < worst) { worst = box.min.z; culprit = child.name || 'unnamed'; }
  });

  assert.ok(worst >= DECK_TOP_BACK - 0.001,
    `${culprit} reaches back to ${worst.toFixed(3)}, past DECK_TOP_BACK ${DECK_TOP_BACK}`);

  // And the gap that leaves. A leaning torso is about a quarter deep at the
  // chest; anything under that and the console is inside the DJ again.
  const chest = DECK_DJ_STAND_Z + 0.25 + 0.12; // half-depth, plus the forward lean
  assert.ok(worst > chest,
    `the console reaches ${worst.toFixed(3)} but the DJ's chest is at ${chest.toFixed(3)}`);

  // The front lip is the side the room sees, and it has not moved.
  assert.ok(Math.abs(whole.max.z - 0.95) < 0.001, `front lip moved to ${whole.max.z.toFixed(3)}`);
  decks.traverse((child) => { if (child.isMesh) { child.geometry.dispose(); child.material.dispose?.(); } });
});

/**
 * The pamphlet stand's tray has been reported as clipping three times. The
 * numbers that matter are written down here so a fourth report is a failing
 * test rather than a screenshot.
 */
/**
 * The fourth pamphlet-stand report, and a different fault from the first three.
 *
 * Those were solids inside solids. This one was solids agreeing exactly where
 * their surfaces were: the cheeks' outer faces at x = ±1.10 and the slab's at
 * x = ±1.10, the stop's front at z = 0.55 and the slab's at z = 0.55. Two faces
 * at one depth is a coin toss the depth buffer re-tosses as the camera moves,
 * which is why it was reported as a glitch when rotating rather than as a seam.
 *
 * Only same-side pairs count. A max face against a min face is two solids
 * touching back to back — the feet under the case — and culling means only one
 * of them is ever facing the camera. A max against a max is two outward faces
 * on one plane, and that is the fight.
 */
test('no two surfaces on the pamphlet stand sit at exactly the same depth', async () => {
  const bundled = await build({ entryPoints: [new URL('../src/world/CoastalProps.ts', import.meta.url).pathname], bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false });
  const { createCoastalPamphletStand } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  const stand = createCoastalPamphletStand();
  stand.updateMatrixWorld(true);

  // Grouped by parent: the tray is tilted, so its children can only ever be
  // coplanar with each other, and comparing across the tilt would be noise.
  const frames = new Map();
  stand.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.parameters;
    const span = (centre, size) => [centre - size / 2, centre + size / 2];
    const entry = { name: o.name, x: span(o.position.x, p.width), y: span(o.position.y, p.height), z: span(o.position.z, p.depth) };
    if (!frames.has(o.parent.uuid)) frames.set(o.parent.uuid, []);
    frames.get(o.parent.uuid).push(entry);
  });

  const overlap = (a, b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  const clashes = [];
  for (const boxes of frames.values()) {
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        for (const axis of ['x', 'y', 'z']) {
          const rest = ['x', 'y', 'z'].filter((k) => k !== axis);
          const area = rest.map((k) => overlap(a[k], b[k]));
          // No shared area means no shared pixels, whatever the depths agree on.
          if (area.some((v) => v <= 1e-4)) continue;
          for (const side of [0, 1]) {
            if (Math.abs(a[axis][side] - b[axis][side]) > 1e-6) continue;
            clashes.push(`${a.name} and ${b.name} both put a face at ${axis}=${a[axis][side].toFixed(3)}, sharing ${area.map((v) => v.toFixed(3)).join('x')}`);
          }
        }
      }
    }
  }
  assert.deepEqual(clashes, [], `coplanar faces will flicker as the camera turns:\n${clashes.join('\n')}`);
});

/**
 * The gap under the tray is closed, and closed by something rather than by a
 * smaller gap.
 *
 * Between the case top at 1.57 and the tray's tilted underside there was real
 * open air — 133mm at the riser, closing to 15mm at the front lip. Nothing
 * intersected; it was a hole, and from a low angle you looked into the shadow
 * in it and read the tray as cutting into the case. Fired straight up from
 * just above the case top, a ray must now meet the fascia or the riser before
 * it meets the underside of the tray.
 */
test('the wedge under the pamphlet tray is filled, not merely clear', async () => {
  const bundled = await build({ entryPoints: [new URL('../src/world/CoastalProps.ts', import.meta.url).pathname], bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false });
  const { createCoastalPamphletStand } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  const stand = createCoastalPamphletStand();
  stand.updateMatrixWorld(true);

  // Containment, not a raycast. A ray fired from the gap starts *inside* the
  // riser over most of the back, and a front-facing material does not report
  // the surface you leave through — so the first version of this read solid
  // timber as a hole.
  const solids = [];
  stand.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.parameters;
    solids.push({
      name: o.name,
      toLocal: new THREE.Matrix4().copy(o.matrixWorld).invert(),
      half: new THREE.Vector3(p.width / 2, p.height / 2, p.depth / 2),
    });
  });
  const probe = new THREE.Vector3();
  const holding = (point, skip) => solids.find((solid) => {
    if (skip.includes(solid.name)) return false;
    probe.copy(point).applyMatrix4(solid.toLocal);
    return Math.abs(probe.x) <= solid.half.x && Math.abs(probe.y) <= solid.half.y && Math.abs(probe.z) <= solid.half.z;
  });

  const slab = solids.find((solid) => solid.name === 'Sloped display tray');
  const inSlab = (point) => {
    probe.copy(point).applyMatrix4(slab.toLocal);
    return Math.abs(probe.x) <= slab.half.x && Math.abs(probe.y) <= slab.half.y && Math.abs(probe.z) <= slab.half.z;
  };

  const point = new THREE.Vector3();
  const filled = new Set();
  let sampled = 0;
  // Only where there is a tray overhead to make a gap: the slab's underside
  // runs from z = -0.451 at the back to z = 0.627 at the front lip, and the
  // case top it is over ends at 0.56. Outside that the sky is meant to be
  // open, and sampling it was the first version of this test failing on
  // nothing at all.
  for (let z = -0.43; z <= 0.5001; z += 0.02) {
    for (const x of [-0.95, -0.5, 0, 0.5, 0.95]) {
      // Up from just above the case top until the tray itself is reached.
      // Everything in between has to be somebody's timber.
      for (let y = 1.575; y < 1.83; y += 0.005) {
        point.set(x, y, z);
        if (inSlab(point)) break;
        const held = holding(point, ['Sloped display tray']);
        assert.ok(held, `open air under the tray at x=${x} y=${y.toFixed(3)} z=${z.toFixed(2)}`);
        filled.add(held.name);
        sampled += 1;
      }
    }
  }
  assert.ok(sampled > 500, `only ${sampled} points were in the gap at all — the sweep missed it`);
  assert.ok(filled.has('Tray skirt'), `the fascia was never the thing holding the gap; saw ${[...filled].join(', ')}`);
});

test('nothing on the pamphlet stand sits inside anything else', async () => {
  const bundled=await build({entryPoints:[new URL('../src/world/CoastalProps.ts',import.meta.url).pathname],bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
  const { createCoastalPamphletStand } = await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  const stand = createCoastalPamphletStand();
  stand.updateMatrixWorld(true);

  const boxOf = (name) => {
    const found = [];
    stand.traverse((o) => { if (o.name === name && o.isMesh) found.push(o); });
    assert.ok(found.length, `no mesh named ${name}`);
    return found.map((mesh) => new THREE.Box3().setFromObject(mesh));
  };
  const gap = (below, above) => above.min.y - below.max.y;

  const [caseBox] = boxOf('Timber case');
  const [trayBox] = boxOf('Sloped display tray');
  const [riserBox] = boxOf('Tray riser');

  // Bounding boxes, which for a tilted slab is the conservative test: if these
  // do not touch then no triangle of one is inside the other, whatever the
  // rotation. The tray clears the case top outright now rather than relying on
  // an overhang, which is a smaller thing to get wrong next time.
  assert.ok(!trayBox.intersectsBox(caseBox),
    `the tray is inside the case: tray y from ${trayBox.min.y.toFixed(4)}, case top ${caseBox.max.y.toFixed(4)}`);
  assert.ok(trayBox.min.y >= caseBox.max.y,
    `the tray's lowest corner must sit on or above the case top, not ${trayBox.min.y.toFixed(4)} against ${caseBox.max.y.toFixed(4)}`);

  // The riser must stop under the tray rather than standing through it: its top
  // used to reach 1.71 where the tray's underside is 1.703. A bounding box is
  // no use for this pair — the tilted tray's box dips to the front while the
  // riser sits at the back — so the riser's top corners are taken into the
  // tray's own space and checked against the slab's underside directly.
  const trayMesh = (() => { let m; stand.traverse((o) => { if (o.name === 'Sloped display tray') m = o; }); return m; })();
  trayMesh.geometry.computeBoundingBox();
  const halfY = trayMesh.geometry.boundingBox.max.y;
  const toTray = new THREE.Matrix4().copy(trayMesh.matrixWorld).invert();
  const extent = trayMesh.geometry.boundingBox;
  let checked = 0;
  for (const x of [riserBox.min.x, riserBox.max.x]) {
    for (const z of [riserBox.min.z, riserBox.max.z]) {
      const corner = new THREE.Vector3(x, riserBox.max.y, z).applyMatrix4(toTray);
      // Only corners under the slab's footprint can pierce it at all.
      if (corner.x < extent.min.x || corner.x > extent.max.x) continue;
      if (corner.z < extent.min.z || corner.z > extent.max.z) continue;
      checked += 1;
      assert.ok(corner.y <= -halfY,
        `a riser corner stands ${(corner.y + halfY).toFixed(4)} up inside the tray`);
    }
  }
  assert.ok(checked > 0, 'the riser sits under the tray at all, so this proves something');

  // Every printed layer needs real daylight over the one beneath it, or it
  // z-fights into speckles at ordinary viewing distance.
  //
  // Measured in the tray's own space, not the world's. These all hang off the
  // tilted tray, and a world bounding box spreads a 0.88-deep booklet through
  // 0.175 of height — so comparing world Y between two layers says nothing
  // about which is on top of which.
  const localSpans = (name) => {
    const out = [];
    stand.traverse((o) => {
      if (o.name !== name || !o.isMesh) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      out.push({
        yMin: o.position.y + bb.min.y, yMax: o.position.y + bb.max.y,
        xMin: o.position.x + bb.min.x, xMax: o.position.x + bb.max.x,
      });
    });
    return out;
  };
  const overlapsX = (a, b) => a.xMin < b.xMax && a.xMax > b.xMin;
  const covers = localSpans('Printed booklet cover');
  const stacks = localSpans('Cream paper stack');
  assert.equal(covers.length, 3);
  assert.equal(stacks.length, 3);
  for (const [name, layers] of [['fold', localSpans('Booklet fold')], ['type line', localSpans('Cover type line')]]) {
    assert.ok(layers.length, `${name} exists`);
    for (const layer of layers) {
      const under = covers.find((cover) => overlapsX(layer, cover));
      assert.ok(under, `${name} is not over any cover`);
      const clear = layer.yMin - under.yMax;
      assert.ok(clear > 0.008, `${name} clears its cover by only ${clear.toFixed(4)} — it will z-fight`);
    }
  }
  for (const cover of covers) {
    const stack = stacks.find((s) => overlapsX(cover, s));
    assert.ok(stack, 'each cover sits on a paper stack');
    const clear = cover.yMin - stack.yMax;
    assert.ok(clear > 0.008, `a cover clears its stack by only ${clear.toFixed(4)}`);
  }
});
