import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';

const bundled = await build({ stdin: { contents: "export * from './src/world/FestivalWeather';export * from './src/world/CoastalTerrain';export {batchStaticScenery} from './src/world/StaticBatch';export {warmScenePrograms,warmByDrawing} from './src/world/SceneWarmup';export {PLANET,subdivideSceneForPlanet} from './src/world/PlanetCurve';export * as THREE from 'three';", loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { FestivalWeather, WEATHER_BUDGET, THREE, setIslandTerrain, terrainHeightAt, SEA_Y, batchStaticScenery, warmScenePrograms, warmByDrawing, PLANET, subdivideSceneForPlanet } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const now = Date.UTC(2026, 9, 24, 12);
const clear = { version: 1, updatedAt: now, schedule: [], clearedSeats: [] };
const flat = { heightAt: () => 0, dryAt: () => true, shelteredAt: () => false };
const observer = new THREE.Vector3(1, 0, 1);
const support = { id: 'bench-a', x: 2, z: 2, y: .5, width: 2, depth: 1 };
const schedule = (type, startsAt = now - 300_000, endsAt = now + 300_000) => ({ ...clear, schedule: [{ id: type + '-1', type, startsAt, endsAt }] });
const fixture = (ground = flat, phone = true) => {
  const scene = new THREE.Scene(), weather = new FestivalWeather(scene, ground, phone);
  const groundMesh = weather.root.getObjectByName('thin-ground-snow');
  const rain = weather.root.getObjectByName('ink-rain-streaks');
  const snow = weather.root.getObjectByName('paper-snow-flakes');
  return { scene, weather, ground: groundMesh, rain, snow };
};
const bytes = geometry => Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, geometry.index?.array.byteLength ?? 0);
const shaderFor = material => {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {}); return shader;
};
const fallingShaderFor = material => {
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.points.vertexShader,fragmentShader:THREE.ShaderLib.points.fragmentShader};
  material.onBeforeCompile(shader,{});return shader;
};

test('snow cells reject water, roofs, cliffs and non-finite terrain instead of bridging them', () => {
  const roof = (x, z) => x >= 8 && x <= 14 && z >= 8 && z <= 14;
  const groundQuery = { heightAt: (x, z) => x >= 30 && x <= 34 ? NaN : x >= 18 && x <= 20 ? 3 : .001 * z,
    dryAt: (x, z) => x >= -20 && x <= 40 && z >= -20 && z <= 40 && !(x >= -4 && x <= 2),
    shelteredAt: (x, z) => roof(x, z) };
  const f = fixture(groundQuery), p = f.ground.geometry.attributes.position;
  let valid = true, rejected = '';
  for (let i = 0; i < p.count; i += 6) {
    const xs = [], zs = [], ys = [];
    for (let j = 0; j < 6; j++) { xs.push(p.getX(i + j)); ys.push(p.getY(i + j)); zs.push(p.getZ(i + j)); }
    for (let j = 0; j < 6; j++) {
      if (!Number.isFinite(ys[j]) || !groundQuery.dryAt(xs[j], zs[j]) || roof(xs[j], zs[j]) || Math.abs(ys[j] - groundQuery.heightAt(xs[j], zs[j]) - .03) > 1e-6) { valid = false; rejected = 'invalid corner'; }
    }
    if (Math.max(...ys) - Math.min(...ys) > 1.20001) { valid = false; rejected = 'cliff bridge'; }
  }
  assert.ok(p.count > 0); assert.ok(valid, rejected);
  assert.equal(f.ground.material.map, null); assert.equal(f.ground.receiveShadow, true);
  f.weather.dispose();
});

test('cold construction samples shared corners once and retains the pre-optimization terrain, roof and water geometry exactly',()=>{
  let queries=0;
  const ground={heightAt:(x,z)=>{queries++;return x>=30&&x<=34?NaN:x>=18&&x<=20?3:.001*z;},
    dryAt:(x,z)=>x>=-20&&x<=40&&z>=-20&&z<=40&&!(x>=-4&&x<=2),
    shelteredAt:(x,z)=>x>=8&&x<=14&&z>=8&&z<=14};
  const f=fixture(ground),hash=createHash('sha256');
  for(const attribute of Object.values(f.ground.geometry.attributes))hash.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
  // Captured from the prior four-queries-per-cell constructor for this same
  // mixed terrain fixture: positions, vertex colours and normals together.
  assert.equal(hash.digest('hex'),'8753c07e1ca4d732494eac0b85090de13560a38abc8e3300377c86fa3d295634');
  assert.equal(f.ground.geometry.attributes.position.count,3270);
  assert.equal(queries,11264,'exact shared grid vertices replace the prior 44,196 terrain queries');
  f.weather.dispose();
});

test('caps and ground use the same explicit server clock, including brush and melt history', () => {
  const f = fixture(); f.weather.addSupports([support, { ...support, id: 'bench-b', x: 6 }]);
  const capA = f.weather.root.getObjectByName('seat-snow-bench-a');
  const capB = f.weather.root.getObjectByName('seat-snow-bench-b');
  const groundShader = shaderFor(f.ground.material), a = shaderFor(capA.material), b = shaderFor(capB.material);
  const state = schedule('snow'); state.clearedSeats = [{ seatId: 'bench-a', occurrenceId: 'snow-1', clearedAt: now - 1000 }];
  f.weather.setShared(state); f.weather.update(.016, observer, now);
  assert.equal(groundShader.uniforms.snowCoverage.value, .5);
  assert.equal(a.uniforms.snowCoverage.value, 0);
  assert.equal(b.uniforms.snowCoverage.value, .5);
  assert.equal(capA.visible, false); assert.equal(capB.visible, true);
  f.weather.update(.016, observer, now + 750_000);
  assert.equal(f.weather.current().type, 'clear');
  assert.equal(groundShader.uniforms.snowCoverage.value, .5);
  assert.equal(b.uniforms.snowCoverage.value, .5);
  assert.equal(a.uniforms.snowCoverage.value, 0);
  f.weather.update(.016, observer, now + 1_200_000);
  assert.equal(groundShader.uniforms.snowCoverage.value, 0); assert.equal(capB.visible, false);
  f.weather.dispose();
});

test('settled snow reaches a bounded 0.12-unit lift on ground and sloped supports without changing contact geometry',()=>{
  const f=fixture(),centre={x:3,z:4},facing=.67,cos=Math.cos(facing),sin=Math.sin(facing);
  const clothHeight=(x,z)=>.4+.035*(x-centre.x)-.025*(z-centre.z);
  const mat={id:'sloped-mat',...centre,y:clothHeight(centre.x,centre.z),width:2.25,depth:4.3,facing,groundMask:true,heightAt:clothHeight};
  f.weather.addSupports([mat]);f.scene.updateMatrixWorld(true);
  const cap=f.weather.root.getObjectByName('seat-snow-sloped-mat');
  const shaders=[shaderFor(f.ground.material),shaderFor(cap.material)];
  const arrays=[f.ground.geometry.attributes.position.array,cap.geometry.attributes.position.array];
  const sizes=[bytes(f.ground.geometry),bytes(cap.geometry)],indices=cap.geometry.index.array;
  // Read the production vertex hook's real displacement, rather than assuming
  // the configuration value actually reaches the GPU shader.
  const lift=shader=>{const expression=shader.vertexShader.match(/transformed\.y\s*\+=\s*snowCoverage\s*\*\s*([\d.]+)/);assert.ok(expression);return shader.uniforms.snowCoverage.value*Number(expression[1]);};
  const state=schedule('snow',now,now+1_200_000);f.weather.setShared(state);
  for(const [time,expected]of[[now,0],[now+300_000,.06],[now+600_000,.12],[now+1_200_000,.12],[now+1_650_000,.06],[now+2_100_000,0]]){
    f.weather.update(.016,observer,time);
    for(const shader of shaders)assert.ok(Math.abs(lift(shader)-expected)<1e-10);
    assert.ok(Math.abs(f.weather.snapshot().settledDepth-expected)<1e-10);
    assert.equal(f.weather.snapshot().maximumSettledDepth,.12);
    const positions=cap.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      const point=new THREE.Vector3().fromBufferAttribute(positions,i);point.y+=lift(shaders[1]);point.applyMatrix4(cap.matrixWorld);
      assert.ok(Math.abs(point.y-clothHeight(point.x,point.z)-.025-expected)<1e-6,'thicker snow must remain on the actual sloped cloth surface');
    }
  }
  // Brush at maximum accumulation. Its fixed, rotated ground mask must still
  // prevent the higher terrain blanket from poking through the exposed mat.
  state.clearedSeats=[{seatId:'sloped-mat',occurrenceId:'snow-1',clearedAt:now+600_000}];
  f.weather.setShared(state);f.weather.update(.016,observer,now+600_000);
  assert.equal(cap.visible,false);assert.equal(lift(shaders[1]),0);assert.equal(lift(shaders[0]),.12);
  assert.equal(shaders[0].uniforms.snowMaskCount.value,1);
  assert.deepEqual(shaders[0].uniforms.snowMasks.value[0].toArray(),[centre.x,centre.z,1.125,2.15]);
  assert.deepEqual(shaders[0].uniforms.snowMaskRotations.value[0].toArray(),[cos,sin]);
  assert.equal(f.ground.geometry.attributes.position.array,arrays[0]);assert.equal(cap.geometry.attributes.position.array,arrays[1]);
  assert.deepEqual([bytes(f.ground.geometry),bytes(cap.geometry)],sizes);assert.equal(cap.geometry.index.array,indices);
  f.weather.dispose();
});

test('clear entry warmup includes every later weather kind, and restores current visibility after drawing', async () => {
  const f = fixture(); f.weather.addSupports([support]);
  f.weather.update(.016, observer, now);
  const drawables = f.weather.root.children.slice();
  assert.ok(drawables.every(object => !object.visible));
  f.weather.setWarmup(true);
  // The normal loading frame keeps running while shader preparation awaits.
  f.weather.update(.016, observer, now + 16);
  assert.ok(drawables.every(object => object.visible));
  const names = [];
  const renderer = { compile(surfaces) { surfaces.traverse(o => { if (o.geometry) names.push(o.name); }); return new Set(); },
    properties: { get: () => ({}) }, shadowMap: {}, info: { programs: [] }, render(scene) { scene.traverseVisible(o => { if (o.geometry) names.push('draw:' + o.name); }); } };
  await warmScenePrograms(renderer, f.scene, new THREE.PerspectiveCamera());
  await warmByDrawing(renderer, f.scene, new THREE.PerspectiveCamera(), undefined, 2);
  assert.deepEqual(new Set(names.filter(name => !name.startsWith('draw:'))), new Set(drawables.map(o => o.name)));
  assert.ok(drawables.every(object => names.includes('draw:' + object.name)));
  f.weather.setWarmup(false);
  assert.ok(drawables.every(object => !object.visible));
  assert.equal(shaderFor(f.ground.material).uniforms.snowCoverage.value, 0, 'warmup must not leave artificial snow');
  f.weather.dispose();
});

test('weather changes retain bounded buffers and material variants; phone draws only its smaller budget', () => {
  const f = fixture(); f.weather.addSupports([support]); f.weather.addSupports([support]);
  const objects = f.weather.root.children.slice(), geometries = objects.map(o => o.geometry), materials = objects.map(o => o.material);
  const positions = geometries.map(g => g.attributes.position.array), versions = materials.map(m => m.version), keys = materials.map(m => m.customProgramCacheKey());
  for (const type of ['rain', 'snow', 'rain', 'snow']) {
    f.weather.setShared(schedule(type));
    for (let frame = 0; frame < 120; frame++) f.weather.update(1 / 60, observer, now + frame * 17);
  }
  assert.deepEqual(f.weather.root.children, objects); assert.equal(f.weather.snapshot().seatCaps, 1);
  assert.deepEqual(objects.map(o => o.geometry), geometries); assert.deepEqual(objects.map(o => o.material), materials);
  assert.deepEqual(geometries.map(g => g.attributes.position.array), positions);
  assert.deepEqual(materials.map(m => m.version), versions); assert.deepEqual(materials.map(m => m.customProgramCacheKey()), keys);
  assert.equal(f.rain.geometry.drawRange.count, WEATHER_BUDGET.phoneRain * 2);
  assert.equal(f.snow.geometry.drawRange.count, WEATHER_BUDGET.phoneSnow);
  assert.equal(f.rain.geometry.attributes.position.count, WEATHER_BUDGET.rain * 2);
  assert.equal(f.snow.geometry.attributes.position.count, WEATHER_BUDGET.snow);
  assert.ok(materials.every(m => !m.map)); assert.equal(f.weather.snapshot().extraLights, 0);
  assert.equal(shaderFor(f.ground.material).vertexShader, shaderFor(objects.at(-1).material).vertexShader);
  f.weather.root.name = 'Popcorn concession';
  const report = batchStaticScenery(f.scene);
  assert.equal(report.batchedPieces, 0); assert.ok(objects.every(o => o.parent === f.weather.root));
  f.weather.dispose();
});

test('precipitation falls above roofs but its below-roof particles are suppressed without new geometry', () => {
  const f = fixture({ ...flat, shelteredAt: (_x, _z, y) => y < 8 });
  f.weather.setShared(schedule('rain')); f.weather.update(.1, observer, now);
  const p = f.rain.geometry.attributes.position;
  const y = Array.from({ length: WEATHER_BUDGET.phoneRain }, (_, i) => p.getY(i * 2));
  assert.ok(y.some(value => value === -100)); assert.ok(y.some(value => value >= 8));
  assert.ok(y.every(value => value === -100 || value >= 8));
  f.weather.dispose();
});

test('snowfall has three filled depth bands and varied flake sizes in both phone and desktop draws',()=>{
  for(const phone of[true,false]){
    const f=fixture(flat,phone);f.weather.setShared(schedule('snow'));f.weather.update(.1,observer,now);
    const position=f.snow.geometry.attributes.position,flakes=f.snow.geometry.attributes.snowFlake;
    const count=phone?WEATHER_BUDGET.phoneSnow:WEATHER_BUDGET.snow;
    const bands=[0,0,0],sizes=[];let close=0;
    for(let i=0;i<count;i++){
      const band=i%3,radius=[10,18,29][band];bands[band]++;sizes.push(flakes.getX(i));
      assert.ok(Math.abs(position.getX(i)-observer.x)<=radius+.00001);
      assert.ok(Math.abs(position.getZ(i)-observer.z)<=radius+.00001);
      assert.ok(position.getY(i)>=0&&position.getY(i)<=26);
      if(Math.abs(position.getX(i)-observer.x)<10&&Math.abs(position.getZ(i)-observer.z)<10)close++;
    }
    assert.equal(f.snow.geometry.drawRange.count,count);assert.equal(count,phone?420:960);
    assert.deepEqual(bands,phone?[140,140,140]:[320,320,320]);
    assert.ok(close>count*.4,'a substantial near volume must remain around the player, rather than spreading every flake over one distant box');
    assert.ok(Math.max(...sizes)-Math.min(...sizes)>1.2,'snow has visibly different small flakes and heavier clusters');
    assert.ok(f.snow.material.size>.11);assert.equal(f.snow.material.map,null);assert.equal(f.snow.material.depthWrite,false);
    f.weather.dispose();
  }
});

test('flake shader prepares stepped silhouettes, facets, tumble and lens/band fades without image assets or runtime variants',()=>{
  const f=fixture(),shader=fallingShaderFor(f.snow.material),material=f.snow.material;
  const version=material.version,key=material.customProgramCacheKey(),flakes=f.snow.geometry.attributes.snowFlake;
  const flakeData=flakes.array,flakeVersion=flakes.version;
  assert.match(shader.vertexShader,/attribute vec4 snowFlake/);assert.match(shader.vertexShader,/gl_PointSize=min/);
  assert.match(shader.vertexShader,/if\(!isPerspectiveMatrix\(projectionMatrix\)\)gl_PointSize\*=scale\*projectionMatrix\[1\]\[1\]/,'isometric flakes retain a world-sized footprint instead of sub-pixel PointsMaterial dots');
  assert.equal(shader.uniforms.snowSizeLimit.value,18);
  assert.match(shader.vertexShader,/smoothstep\(1\.5,4\.0,-mvPosition.z\)/);assert.match(shader.vertexShader,/bandFade/);
  assert.match(shader.fragmentShader,/gl_PointCoord/);assert.match(shader.fragmentShader,/floor\(p\*10\.0\+\.5\)/);
  assert.match(shader.fragmentShader,/discard/);assert.match(shader.fragmentShader,/iceTint\*facet/);
  assert.match(shader.vertexShader,/snowDriftTime/);
  assert.match(shader.vertexShader,/vSnowShape=vec4\(cos\(turn\),sin\(turn\)/);
  assert.doesNotMatch(shader.fragmentShader,/\b(?:sin|cos)\s*\(/,'per-flake rotation and tumble must not repeat for every covered screen pixel');
  for(const type of['snow','rain','snow']){f.weather.setShared(schedule(type));for(let i=0;i<90;i++)f.weather.update(1/60,observer,now+i*17);}
  assert.equal(material.version,version);assert.equal(material.customProgramCacheKey(),key);
  assert.equal(flakes.array,flakeData);assert.equal(flakes.version,flakeVersion,'size, seed, shade and band opacity remain static GPU data');
  const again=fallingShaderFor(material);assert.equal(again.uniforms.snowDriftTime,shader.uniforms.snowDriftTime);
  assert.equal(again.uniforms.snowObserver,shader.uniforms.snowObserver);assert.ok(shader.uniforms.snowObserver.value.equals(observer));
  f.weather.dispose();
});

test('movement-only clock updates retain the surface cadence while a shared brush or occurrence change refreshes immediately',()=>{
  const f=fixture();f.weather.addSupports([support]);const state=schedule('snow');
  f.weather.setShared(state,now);f.weather.update(1/60,observer,now);
  const cap=f.weather.root.getObjectByName('seat-snow-bench-a'),uniform=shaderFor(cap.material).uniforms.snowCoverage;
  let value=uniform.value,writes=0;
  Object.defineProperty(uniform,'value',{get:()=>value,set:next=>{writes++;value=next;}});
  for(let frame=1;frame<=120;frame++){
    f.weather.setShared(state,now+frame*16);f.weather.update(1/60,observer,now+frame*16);
  }
  assert.ok(writes>=7&&writes<=8,'unchanged movement SSE must not rescan/rewrite every seat on each frame: '+writes);
  state.clearedSeats=[{seatId:'bench-a',occurrenceId:'snow-1',clearedAt:now+1920}];
  f.weather.setShared(state,now+1921);f.weather.update(1/60,observer,now+1921);
  assert.equal(value,0);assert.equal(cap.visible,false);assert.equal(f.weather.seatCoverage('bench-a'),0);
  const prior=writes;
  state.updatedAt++;state.schedule=[{...state.schedule[0],id:'snow-2'}];
  f.weather.setShared(state,now+1922);f.weather.update(1/60,observer,now+1922);
  assert.equal(writes,prior+1);assert.ok(value>.5);assert.equal(cap.visible,true,'old brushes cannot hide a new snow occurrence');
  f.weather.dispose();
});

test('heavier snow falls with varied weight and broad sideways drift while motion time stays independent of epoch timestamps',()=>{
  const f=fixture(),distant=fixture();
  f.weather.setShared(schedule('snow'));distant.weather.setShared(schedule('snow',now+1e12-300000,now+1e12+300000));
  f.weather.update(.1,observer,now);distant.weather.update(.1,observer,now+1e12);
  assert.deepEqual(f.snow.geometry.attributes.position.array,distant.snow.geometry.attributes.position.array,'server epoch controls the shared event, not GPU wind precision');
  const before=f.snow.geometry.attributes.position.array.slice();f.weather.update(.1,observer,now+100);
  const after=f.snow.geometry.attributes.position.array,speeds=[];let drifting=0;
  for(let i=0;i<WEATHER_BUDGET.phoneSnow;i++){
    const fall=before[i*3+1]-after[i*3+1];if(fall>0&&fall<1)speeds.push(fall/.1);
    if(Math.abs(before[i*3]-after[i*3])>.025)drifting++;
  }
  assert.ok(speeds.length>WEATHER_BUDGET.phoneSnow*.95);assert.ok(Math.min(...speeds)>1.5);assert.ok(Math.max(...speeds)>3.6);
  assert.ok(drifting>WEATHER_BUDGET.phoneSnow*.8,'flakes travel with the wind rather than vibrating in one vertical column');
  const shader=fallingShaderFor(f.snow.material);shader.uniforms.snowDriftTime.value=3599.99;
  f.weather.update(.05,observer,now+150);assert.ok(shader.uniforms.snowDriftTime.value<.1,'long sessions retain bounded shader precision');
  f.weather.dispose();distant.weather.dispose();
});

test('denser snow retains roof suppression and never uploads non-finite precipitation positions',()=>{
  const f=fixture({...flat,heightAt:x=>x>0?NaN:0,shelteredAt:(_x,_z,y)=>y<8});
  f.weather.setShared(schedule('snow'));f.weather.update(.1,observer,now);
  const positions=f.snow.geometry.attributes.position;let hidden=0,above=0;
  for(let i=0;i<WEATHER_BUDGET.phoneSnow;i++){
    const y=positions.getY(i);assert.ok(Number.isFinite(positions.getX(i))&&Number.isFinite(y)&&Number.isFinite(positions.getZ(i)));
    assert.ok(y===-100||y>=8);if(y===-100)hidden++;else above++;
  }
  assert.ok(hidden>0&&above>0);f.weather.dispose();
});

test('a rotated low mat cap follows the sampled slope and pillow across its full cloth footprint', () => {
  const f=fixture(),facing=.63,centre={x:12,z:22},cos=Math.cos(facing),sin=Math.sin(facing);
  const heightAt=(x,z)=>{
    const dx=x-centre.x,dz=z-centre.z,localZ=dx*sin+dz*cos;
    return .11*x-.07*z+.2*Math.exp(-(((localZ-1.65)/.32)**2));
  };
  const mat={id:'mat-a',...centre,y:heightAt(centre.x,centre.z),width:2.25,depth:4.3,facing,heightAt,groundMask:true};
  f.weather.addSupports([mat]);f.scene.updateMatrixWorld(true);
  const mesh=f.weather.root.getObjectByName('seat-snow-mat-a'),positions=mesh.geometry.attributes.position;
  let maximumError=0;
  for(let i=0;i<positions.count;i++){
    const vertex=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
    maximumError=Math.max(maximumError,Math.abs(vertex.y-heightAt(vertex.x,vertex.z)-.025));
  }
  assert.ok(maximumError<1e-6,'the raised pillow and sloped cloth must use the real finished surface');
  assert.equal(mesh.geometry.index.count/3,182);
  assert.ok(mesh.geometry.attributes.position.count<=112);
  const bound=mesh.geometry.boundingBox??(mesh.geometry.computeBoundingBox(),mesh.geometry.boundingBox);
  assert.ok(Math.abs(bound.max.x-bound.min.x-2.25)<1e-6);
  assert.ok(Math.abs(bound.max.z-bound.min.z-4.3)<1e-6);
  const ground=shaderFor(f.ground.material),cap=shaderFor(mesh.material);
  assert.equal(ground.uniforms.snowGroundMask.value,1);assert.equal(cap.uniforms.snowGroundMask.value,0);
  assert.equal(ground.uniforms.snowMasks,cap.uniforms.snowMasks);
  assert.equal(ground.uniforms.snowMaskCount.value,1);
  assert.deepEqual(ground.uniforms.snowMasks.value[0].toArray(),[centre.x,centre.z,1.125,2.15]);
  assert.deepEqual(ground.uniforms.snowMaskRotations.value[0].toArray(),[cos,sin]);
  assert.match(ground.fragmentShader,/uniform vec4 snowMasks\[10\]/);
  assert.match(ground.fragmentShader,/if\(snowGroundMask > \.5\)/);
  assert.equal(ground.fragmentShader,cap.fragmentShader,'ground and caps share the shader program, selected only by a uniform');
  assert.equal(f.ground.material.customProgramCacheKey(),mesh.material.customProgramCacheKey());
  f.weather.dispose();
});

test('brushing a mat clears only its cap while its fixed ground cutout survives snowfall and melt', () => {
  const f=fixture(),mat={...support,id:'mat-a',width:2.25,depth:4.3,groundMask:true,heightAt:()=>.04};
  f.weather.addSupports([mat]);f.weather.addSupports([mat]);
  const mesh=f.weather.root.getObjectByName('seat-snow-mat-a'),ground=shaderFor(f.ground.material),cap=shaderFor(mesh.material);
  const masks=ground.uniforms.snowMasks.value,rotations=ground.uniforms.snowMaskRotations.value;
  const materialVersion=f.ground.material.version,position=mesh.geometry.attributes.position.array;
  const state=schedule('snow');f.weather.setShared(state);f.weather.update(.1,observer,now);
  assert.equal(cap.uniforms.snowCoverage.value,.5);assert.equal(mesh.visible,true);
  state.clearedSeats=[{seatId:'mat-a',occurrenceId:'snow-1',clearedAt:now}];
  f.weather.setShared(state);f.weather.update(.1,observer,now+16);
  assert.equal(cap.uniforms.snowCoverage.value,0);assert.equal(mesh.visible,false);
  assert.equal(ground.uniforms.snowCoverage.value,.5000266666666666);
  assert.equal(ground.uniforms.snowMaskCount.value,1,'the terrain must not reveal a raised snow blanket under brushed cloth');
  f.weather.update(.1,observer,now+1_200_000);
  assert.equal(ground.uniforms.snowCoverage.value,0);
  assert.equal(ground.uniforms.snowMaskCount.value,1,'the authored cutout remains ready for the next occurrence');
  assert.equal(ground.uniforms.snowMasks.value,masks);assert.equal(ground.uniforms.snowMaskRotations.value,rotations);
  assert.equal(f.ground.material.version,materialVersion);assert.equal(mesh.geometry.attributes.position.array,position);
  assert.equal(f.weather.snapshot().groundMasks,1);
  f.weather.dispose();assert.equal(f.weather.snapshot().groundMasks,0);
});

test('mask and support tessellation have explicit fixed bounds before admission',()=>{
  const f=fixture();
  for(let i=0;i<WEATHER_BUDGET.groundMasks;i++)f.weather.addSupports([{...support,id:'mat-'+i,x:i*3,groundMask:true}]);
  assert.equal(f.weather.snapshot().groundMasks,10);
  const shader=shaderFor(f.ground.material);
  assert.equal(shader.uniforms.snowMasks.value.length,10);assert.equal(shader.uniforms.snowMaskRotations.value.length,10);
  assert.throws(()=>f.weather.addSupports([{...support,id:'overflow',groundMask:true}]),/budget exceeded/);
  f.weather.addSupports([{...support,id:'large-height-query',width:30,depth:30,heightAt:()=>0}]);
  const large=f.weather.root.getObjectByName('seat-snow-large-height-query');
  assert.equal(large.geometry.index.count/3,WEATHER_BUDGET.capSegments**2*2);
  assert.ok(bytes(large.geometry)<35_000);
  f.weather.dispose();
});

test('terminal disposal releases each resource once, detaches the root and does not revive on a late update', () => {
  const f = fixture(); f.weather.addSupports([support]);
  const objects = f.weather.root.children.slice();
  const resources = new Set(objects.flatMap(o => [o.geometry, o.material]));
  const disposed = new Map([...resources].map(r => [r, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  f.weather.dispose(); f.weather.dispose();
  f.weather.setShared(schedule('snow')); f.weather.setWarmup(true); f.weather.addSupports([support]); f.weather.update(.1, observer, now);
  assert.equal(f.weather.root.parent, null); assert.equal(f.weather.root.children.length, 0);
  assert.ok([...disposed.values()].every(count => count === 1));
  assert.ok(objects.every(o => Object.keys(o.geometry.attributes).length === 0 && !o.geometry.index));
  assert.equal(f.weather.snapshot().groundTriangles, 0); assert.equal(f.weather.snapshot().seatCaps, 0);
});

test('island and worst-case geometry stay under the same phone allocation cap, measured without a GL context', async () => {
  const measure = (name, query) => {
    const started = performance.now(), f = fixture(query), constructionMs = performance.now() - started;
    const result = { name, groundTriangles: f.weather.snapshot().groundTriangles, groundBufferBytes: bytes(f.ground.geometry),
      precipitationBufferBytes: bytes(f.rain.geometry) + bytes(f.snow.geometry), maximumPhoneRainSegments: WEATHER_BUDGET.phoneRain,
      maximumPhoneSnowPoints: WEATHER_BUDGET.phoneSnow, maximumDesktopRainSegments: WEATHER_BUDGET.rain,
      maximumDesktopSnowPoints: WEATHER_BUDGET.snow, snowDepthBands: WEATHER_BUDGET.snowBands,
      snowBandRadii: [WEATHER_BUDGET.snowNearRadius,WEATHER_BUDGET.snowMidRadius,WEATHER_BUDGET.snowFarRadius],
      snowPointSize:WEATHER_BUDGET.snowPointSize, additionalTextures: 0, additionalLights: 0, constructionMs: +constructionMs.toFixed(2) };
    const priorPlanet = PLANET.on; PLANET.on = true;
    const subdivisionStarted = performance.now();
    try { subdivideSceneForPlanet(f.scene); }
    finally { PLANET.on = priorPlanet; }
    result.planetGroundTriangles = f.weather.snapshot().groundTriangles;
    result.planetGroundBufferBytes = bytes(f.ground.geometry);
    result.planetSubdivisionMs = +(performance.now() - subdivisionStarted).toFixed(2);
    assert.ok(result.planetGroundBufferBytes + result.precipitationBufferBytes < 2.5 * 1024 ** 2);
    f.weather.dispose(); return result;
  };
  setIslandTerrain(true);
  let island;
  try { island = measure('island terrain without buildings (conservative upper bound)', { heightAt: terrainHeightAt, dryAt: (x, z) => terrainHeightAt(x, z) > SEA_Y + .05, shelteredAt: () => false }); }
  finally { setIslandTerrain(false); }
  const worst = measure('full rectangular dry flat terrain', flat);
  assert.equal(worst.groundTriangles, 22_098);
  assert.ok(island.groundTriangles > 10_000 && island.groundTriangles < worst.groundTriangles);
  assert.ok(worst.groundBufferBytes + worst.precipitationBufferBytes < 2.5 * 1024 ** 2);
  assert.equal(worst.precipitationBufferBytes, 42_240);
  assert.ok(worst.precipitationBufferBytes<50*1024,'all rain and layered-snow attributes stay below 50 KiB');
  const mats=fixture();mats.weather.addSupports(Array.from({length:4},(_,i)=>({...support,id:'measured-mat-'+i,x:i*4,width:2.25,depth:4.3,groundMask:true,heightAt:()=>.12})));
  const caps=mats.weather.root.children.filter(object=>object.name.startsWith('seat-snow-'));
  const matBudget={mats:4,groundMasks:mats.weather.snapshot().groundMasks,maximumGroundMasks:WEATHER_BUDGET.groundMasks,triangles:caps.reduce((n,m)=>n+m.geometry.index.count/3,0),bufferBytes:caps.reduce((n,m)=>n+bytes(m.geometry),0),maskFloatPayloadBytes:WEATHER_BUDGET.groundMasks*6*4};
  assert.equal(matBudget.triangles,728);assert.ok(matBudget.bufferBytes<25_000);mats.weather.dispose();
  const report = { measuredAt: new Date().toISOString(), measurements: [island, worst], matBudget, notes: ['CPU geometry/typed-array budget only; actual GPU frame time and shader linking require browser checks.', 'The production planet subdivision is included separately. Construction/subdivision timing is this Mac, not an iPhone measurement.', 'Existing buildings and roof rejection reduce island snow below this bound.', 'No collision geometry, texture maps, lights or WebGL contexts are created by FestivalWeather.'] };
  await mkdir('art/weather-actions-20261024', { recursive: true });
  await writeFile('art/weather-actions-20261024/weather-geometry-budget.json', JSON.stringify(report, null, 2) + '\n');
});
