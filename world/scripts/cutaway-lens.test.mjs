import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:"export * from './src/world/CutawayLens';export {programUniforms} from './src/world/PlanetCurve';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {THREE,CUTAWAY_LENS,CutawayLens,cutawayUniforms,cutawayLensChunks,installCutawayLens,programUniforms}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('the lens rides in the clip test every world material already runs, and leaves three.js\'s own clipping intact',()=>{
 const pars=THREE.ShaderChunk.clipping_planes_pars_fragment,fragment=THREE.ShaderChunk.clipping_planes_fragment;
 const [lensPars,lensFragment]=cutawayLensChunks(pars,fragment);
 assert.ok(lensPars.includes(pars)&&lensFragment.startsWith(fragment),'the original clipping is kept whole');
 for(const name of ['cutawayToWorld','cutawayLens','cutawayNear','cutawayLevels'])assert.ok(lensPars.includes(name)&&lensFragment.includes(name),name);
 // Only where clipping is compiled in (never in a shadow map), and never for a material that opts out.
 assert.equal((lensFragment.match(/NUM_CLIPPING_PLANES > 0 && !defined\( CUTAWAY_KEEP \)/g)??[]).length,1);
 assert.ok(lensFragment.includes('if ( cutawayLens.z > 0.0 )'),'a closed lens costs one uniform test');
 assert.ok(lensFragment.includes('gl_FragCoord.xy'),'the soft edge is a fixed screen-space dither');
 assert.ok(lensFragment.includes('#ifdef CUTAWAY_OVERHEAD\n\t\t\t\tcutawayOverhead = true;'),'authored ceiling ties clip completely without moving the screen cut height');
 assert.deepEqual(cutawayLensChunks(lensPars,lensFragment),[lensPars,lensFragment],'idempotent');
 assert.equal(cutawayLensChunks('uniform vec4 somethingElse;',fragment),undefined,'leaves a changed three.js alone');
 assert.equal(installCutawayLens(),true);assert.equal(installCutawayLens(),true);
 assert.equal(THREE.ShaderChunk.clipping_planes_fragment,lensFragment);
 for(const name of Object.keys(cutawayUniforms))assert.equal(programUniforms[name],cutawayUniforms[name],`every program receives ${name}`);
});

test('the near walls are whichever sides of the room face the camera',()=>{
 const camera=new THREE.OrthographicCamera(-20,20,11,-11,.1,300),lens=new CutawayLens();
 const room={minX:0,maxX:10,minZ:0,maxZ:6,floor:2,ceiling:9},attendee=new THREE.Vector3(5,2.28,3);
 for(const [cx,cz] of [[1,1],[-1,1],[1,-1],[-1,-1]]){
  camera.position.set(5+cx*20,30,3+cz*20);camera.lookAt(5,3.7,3);
  lens.close();for(let frame=0;frame<120;frame++)lens.update(camera,attendee,room,1/60);
  const near=cutawayUniforms.cutawayNear.value,levels=cutawayUniforms.cutawayLevels.value;
  assert.deepEqual([near.x,near.y],[cx,cz]);
  assert.equal(near.z,cx>0?10-CUTAWAY_LENS.wall:-(0+CUTAWAY_LENS.wall));
  assert.equal(near.w,cz>0?6-CUTAWAY_LENS.wall:-(0+CUTAWAY_LENS.wall));
  assert.equal(levels.x,2+CUTAWAY_LENS.sill);assert.equal(levels.y,9,'the roof is cut where the room says, under its ceiling');
  assert.equal(cutawayUniforms.cutawayLens.value.z,CUTAWAY_LENS.radius*22,'a share of the shorter side');
 }
 // Open ground (the temple's stairs): no near walls, only the overhead cut.
 lens.update(camera,attendee,{...room,nearWalls:false},1/60);
 assert.deepEqual(cutawayUniforms.cutawayNear.value.toArray(),[1,1,1e9,1e9]);
 // Leaving the room it closes over a few frames, then sits shut.
 lens.update(camera,attendee,undefined,1/60);assert.ok(cutawayUniforms.cutawayLens.value.z>0);
 for(let frame=0;frame<120;frame++)lens.update(camera,attendee,undefined,1/60);
 assert.equal(lens.open,0);assert.equal(cutawayUniforms.cutawayLens.value.z,0);
});

test('the lens measures heights as modelled: the planet\'s bend is undone before the test',async()=>{
 const {PLANET,planetBendPoint}=await import('data:text/javascript;base64,'+Buffer.from((await build({stdin:{contents:"export * from './src/world/PlanetCurve';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text).toString('base64'));
 const fragment=THREE.ShaderChunk.clipping_planes_fragment,pars=THREE.ShaderChunk.clipping_planes_pars_fragment;
 assert.ok(fragment.includes('cutawayUnbend( ( cutawayToWorld'),'the world position is unbent before any height or side is tested');
 assert.ok(pars.includes('#ifdef PLANET_FLAT'),'what is drawn flat is not unbent');
 // The same inverse in JavaScript, against the real bend: a temple ceiling twenty units off comes back to 16.225.
 PLANET.on=true;PLANET.radius=320;PLANET.radiusUniform.value=320;PLANET.centre.value.set(86,0,0);
 const unbend=(w,c=PLANET.centre.value,R=320)=>{const dx=w.x-c.x,dz=w.z-c.z,s=Math.hypot(dx,dz),up=w.y+R,th=Math.atan2(s,up);return new THREE.Vector3(c.x+dx/s*th*R,Math.hypot(s,up)-R,c.z+dz/s*th*R);};
 for(const p of [[106,16.225,14],[90,6,-12],[70,3,4]]){
  const modelled=new THREE.Vector3(...p),bent=planetBendPoint(modelled.clone());
  assert.ok(bent.y<modelled.y-.05||modelled.distanceTo(PLANET.centre.value)<12,'bent ground falls away');
  assert.ok(unbend(bent).distanceTo(modelled)<1e-6,`${p} comes back where it was modelled`);
 }
});
