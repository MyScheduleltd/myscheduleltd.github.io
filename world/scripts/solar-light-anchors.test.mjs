import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const compiled=await build({stdin:{contents:"export * from './src/world/PlanetLightAnchors';export * from './src/world/SolarClock';export * from './src/world/PlanetCurve';export {DayNightCycle} from './src/world/DayNightCycle';export * as THREE from 'three';export {WebGLLights} from './node_modules/three/src/renderers/webgl/WebGLLights.js';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {THREE,WebGLLights,PLANET,setPlanetCentre,planetBendPoint,applyPlanetLightAnchors,disposePlanetLightAnchors,SolarClock,visualCycleMinuteAtHour,solarOrbitAtHour,DayNightCycle}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const near=(actual,expected,message)=>assert.ok(actual.distanceTo(expected)<1e-8,message+': '+actual.toArray()+' / '+expected.toArray());

test('real Three light uniforms and shadow cameras follow curved lamp meshes and targets as the avatar centre moves',()=>{
  const was={on:PLANET.on,radius:PLANET.radius,centre:PLANET.centre.value.clone()};PLANET.on=true;PLANET.radius=170;
  const scene=new THREE.Scene(),building=new THREE.Group();building.position.set(5,1,-3);building.rotation.y=.35;scene.add(building);
  const point=new THREE.PointLight(0xffffff,12,26),spot=new THREE.SpotLight(0xffaa66,12,30),lens=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  point.position.set(80,8,10);lens.position.copy(point.position);building.add(point,lens);spot.position.set(11,5,36);spot.target.position.set(0,0,35.1);scene.add(spot,spot.target);
  const pointSource=point.position.clone(),spotSource=spot.position.clone(),targetSource=spot.target.position.clone(),originalPointUpdate=point.updateMatrixWorld;
  const camera=new THREE.PerspectiveCamera();camera.position.set(24,16,68);camera.lookAt(50,5,20);camera.updateMatrixWorld(true);
  const realLights=new WebGLLights({has:()=>false});realLights.setup([point,spot]);
  try{
    assert.deepEqual(applyPlanetLightAnchors(scene),{sources:2,targets:1,wrapped:3});const hooked=point.updateMatrixWorld;
    for(const [x,z] of [[0,136],[0,22],[76,4],[91,4],[-70,20],[0,-48],[0,136]]){
      setPlanetCentre(x,z);
      // Lamp budgets still measure the authored flat-world location, even
      // after the preceding draw left renderer-facing matrices curved.
      const budgetPoint=point.getWorldPosition(new THREE.Vector3());lens.updateWorldMatrix(true,false);
      near(budgetPoint,new THREE.Vector3().setFromMatrixPosition(lens.matrixWorld),'budget source must stay flat');
      scene.updateMatrixWorld(true);realLights.setupView([point,spot],camera);
      const flatLens=new THREE.Vector3().setFromMatrixPosition(lens.matrixWorld),curvedLens=planetBendPoint(flatLens);
      near(realLights.state.point[0].position,curvedLens.clone().applyMatrix4(camera.matrixWorldInverse),'renderer uploads the same position as the bent lamp mesh centre');
      const bentSpot=planetBendPoint(spotSource),bentTarget=planetBendPoint(targetSource);
      near(realLights.state.spot[0].position,bentSpot.clone().applyMatrix4(camera.matrixWorldInverse),'spot source upload');
      near(realLights.state.spot[0].direction,bentSpot.clone().sub(bentTarget).transformDirection(camera.matrixWorldInverse),'spot cone aims at the matching curved target');
      spot.shadow.updateMatrices(spot);near(spot.shadow.camera.position,bentSpot,'shadow camera uses the curved source');
      for(let repeat=0;repeat<8;repeat++)scene.updateMatrixWorld(false);
      near(new THREE.Vector3().setFromMatrixPosition(point.matrixWorld),curvedLens,'repeated render/foreground passes must not accumulate bend');
      assert.equal(point.updateMatrixWorld,hooked);assert.deepEqual(point.position.toArray(),pointSource.toArray());assert.deepEqual(spot.position.toArray(),spotSource.toArray());assert.deepEqual(spot.target.position.toArray(),targetSource.toArray());
    }
    assert.deepEqual(applyPlanetLightAnchors(scene),{sources:2,targets:1,wrapped:3});assert.equal(point.updateMatrixWorld,hooked);
    disposePlanetLightAnchors(scene);disposePlanetLightAnchors(scene);assert.equal(point.updateMatrixWorld,originalPointUpdate);scene.updateMatrixWorld(true);
    near(new THREE.Vector3().setFromMatrixPosition(point.matrixWorld),point.getWorldPosition(new THREE.Vector3()),'disposal restores ordinary flat matrices');
  }finally{disposePlanetLightAnchors(scene);PLANET.on=was.on;PLANET.radius=was.radius;PLANET.centre.value.copy(was.centre);}
});

test('pooled lamp reassignment, late lights and flat mode keep original transforms and a constant light count',()=>{
  const was={on:PLANET.on,centre:PLANET.centre.value.clone()};PLANET.on=true;setPlanetCentre(34,80);
  const scene=new THREE.Scene(),spot=new THREE.SpotLight(),sun=new THREE.DirectionalLight();spot.position.set(11,4.8,36);spot.target.position.set(0,0,35.1);scene.add(spot,spot.target,sun);
  const sunUpdate=sun.updateMatrixWorld;applyPlanetLightAnchors(scene);const hooked=spot.updateMatrixWorld;
  try{
    for(const [x,z] of [[11,36],[-11,16],[15,-34]]){
      spot.position.set(x,4.8,z);spot.target.position.set(0,0,z-.9);scene.updateMatrixWorld(true);
      near(new THREE.Vector3().setFromMatrixPosition(spot.matrixWorld),planetBendPoint(spot.position),'reassigned pool source');
      near(new THREE.Vector3().setFromMatrixPosition(spot.target.matrixWorld),planetBendPoint(spot.target.position),'reassigned pool target');
    }
    const late=new THREE.PointLight();late.position.set(91,10,4);scene.add(late);assert.equal(applyPlanetLightAnchors(scene).sources,2);assert.equal(spot.updateMatrixWorld,hooked);assert.equal(sun.updateMatrixWorld,sunUpdate);
    PLANET.on=false;scene.updateMatrixWorld(true);near(new THREE.Vector3().setFromMatrixPosition(spot.matrixWorld),spot.position,'flat mode source');near(new THREE.Vector3().setFromMatrixPosition(spot.target.matrixWorld),spot.target.position,'flat mode target');
    assert.equal(scene.children.filter(o=>o.isLight).length,3);assert.equal(spot.castShadow,false,'anchoring cannot add shadow workload');
  }finally{disposePlanetLightAnchors(scene);PLANET.on=was.on;PLANET.centre.value.copy(was.centre);}
});

test('the visual sky reads device civil time, with an explicit time-zone option and cyclic 24h continuity',()=>{
  const instant=Date.UTC(2026,9,20,22,12,30,250),device=new SolarClock(),reading=device.read(instant),date=new Date(instant);
  const expected=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600+date.getMilliseconds()/3_600_000;
  assert.equal(reading.clockSource,'device');assert.equal(reading.localHour,expected);assert.equal(reading.cycleMinute,visualCycleMinuteAtHour(expected));
  const taipei=new SolarClock({timeZone:'Asia/Taipei'}).read(instant);assert.equal(taipei.clockSource,'time-zone');assert.ok(Math.abs(taipei.localHour-(6+12/60+30.25/3600))<1e-10);
  assert.equal(visualCycleMinuteAtHour(6),0);assert.equal(visualCycleMinuteAtHour(12),15);assert.equal(visualCycleMinuteAtHour(18),30);assert.equal(visualCycleMinuteAtHour(0),45);assert.equal(visualCycleMinuteAtHour(24),45);
  const midnightBefore=solarOrbitAtHour(24-1e-6),midnightAfter=solarOrbitAtHour(0);assert.ok(Math.hypot(midnightBefore.y-midnightAfter.y,midnightBefore.z-midnightAfter.z)<.001);
});

test('sun rises on the dock side, sets at the opposite beach and the moon follows the night half of the same real day',()=>{
  const sunrise=solarOrbitAtHour(6),noon=solarOrbitAtHour(12),sunset=solarOrbitAtHour(18),midnight=solarOrbitAtHour(0);
  assert.ok(sunrise.z>200&&Math.abs(sunrise.y-.2)<1e-9);assert.ok(noon.y>130&&Math.abs(noon.z)<1e-9);assert.ok(sunset.z< -200&&Math.abs(sunset.y-.2)<1e-8);assert.ok(midnight.y< -130);
  assert.ok(solarOrbitAtHour(5.9).elevation<0&&solarOrbitAtHour(6.1).elevation>0);assert.ok(solarOrbitAtHour(17.9).elevation>0&&solarOrbitAtHour(18.1).elevation<0);
  const pixels=(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),made={createRadialGradient:()=>({addColorStop(){}}),getImageData:(x,y,w,h)=>pixels(w,h),createImageData:pixels};
  const context=new Proxy({}, {get:(o,k)=>k in o?o[k]:made[k]??(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}}),oldDocument=globalThis.document;globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>context})};
  try{
    const cycle=new DayNightCycle(new THREE.Scene(),undefined,{timeZone:'UTC'});
    for(const hour of [0,6,12,18,23]){
      const state=cycle.update(Date.UTC(2026,9,21,hour)),review=cycle.getCelestialReviewState();
      assert.equal(state.localHour,hour);assert.equal(state.clockSource,'time-zone');assert.equal(state.cycleMinute,visualCycleMinuteAtHour(hour));
      assert.ok(Math.abs((review.sun.position[1]-.2)/140+(review.moon.position[1]-.2)/130)<1e-10,'sun and moon have opposite elevation');
      assert.equal(cycle.directionalLight.castShadow,true);assert.equal(cycle.moonLight.castShadow,true);
    }
    cycle.update(Date.UTC(2026,9,21,0));assert.equal(cycle.sunObject.visible,false);assert.equal(cycle.moonObject.visible,true);
    const fixed=new DayNightCycle(new THREE.Scene(),15);const a=fixed.update(Date.UTC(2026,9,21,0)),b=fixed.update(Date.UTC(2026,9,21,23));assert.equal(a.cycleMinute,15);assert.equal(b.cycleMinute,15);assert.equal(b.localHour,12);assert.equal(b.clockSource,'review');
  }finally{globalThis.document=oldDocument;}
});
