import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:"export * from './src/world/WorldFilmGrain';export * from './src/world/PlanetCurve';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {THREE,applyWorldFilmGrain,setWorldFilmGrainFrame,WORLD_FILM_GRAIN_SETTINGS,WORLD_DITHER_SETTINGS,PLANET,installPlanetCurve,materialCompileHookIdentity}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const shaderFor=material=>{const source=material.isMeshStandardMaterial?THREE.ShaderLib.standard:THREE.ShaderLib.basic;return {uniforms:{},vertexShader:source.vertexShader,fragmentShader:source.fragmentShader};};
const mesh=material=>new THREE.Mesh(new THREE.BoxGeometry(),material);

test('film chains after existing dye, print and fog hooks without changing maps, PBR, alpha or rigging shaders',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0x7a3825,roughness:.63,metalness:.28,map:new THREE.Texture(),normalMap:new THREE.Texture()});root.add(mesh(material));
  material.userData.wornNoGrain=true;let calls=0;
  material.onBeforeCompile=function(shader){assert.equal(this,material);calls++;shader.uniforms.avatarDye={value:3};shader.vertexShader+='\n// AVATAR_DYE';shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','#include <colorspace_fragment>\n// EXISTING_PRINT_PASS');};
  material.customProgramCacheKey=()=> 'avatar-dye-key';
  const before={map:material.map,normal:material.normalMap,color:material.color.clone(),roughness:material.roughness,metalness:material.metalness,transparent:material.transparent};
  assert.equal(applyWorldFilmGrain(root).added,1);const shader=shaderFor(material),vertex=shader.vertexShader;material.onBeforeCompile(shader,{});
  assert.equal(calls,1);assert.equal(shader.uniforms.avatarDye.value,3);assert.equal(shader.vertexShader,vertex+'\n// AVATAR_DYE');
  const source=shader.fragmentShader;
  assert.ok(source.indexOf('// WORLD_FILM_GRAIN_V1')>source.indexOf('// EXISTING_PRINT_PASS'));
  assert.ok(source.indexOf('// WORLD_FILM_GRAIN_V1')>source.indexOf('#include <fog_fragment>'));
  assert.ok(source.indexOf('// WORLD_FILM_GRAIN_V1')<source.indexOf('#include <premultiplied_alpha_fragment>'));
  assert.equal(material.map,before.map);assert.equal(material.normalMap,before.normal);assert.ok(material.color.equals(before.color));assert.equal(material.roughness,before.roughness);assert.equal(material.metalness,before.metalness);assert.equal(material.transparent,before.transparent);
  assert.equal(material.customProgramCacheKey(),'avatar-dye-key:world-film-grain-v1');
});

test('real hook identity protects idempotence and copied flags cannot leave cloned avatars without grain',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();root.add(mesh(material));assert.equal(applyWorldFilmGrain(root).added,1);
  const version=material.version,first=material.onBeforeCompile;assert.equal(applyWorldFilmGrain(root).alreadyPatched,1);assert.equal(material.version,version);assert.equal(material.onBeforeCompile,first);
  const clone=material.clone();assert.equal(clone.userData.worldFilmGrain,true);root.add(mesh(clone));assert.equal(applyWorldFilmGrain(root).added,1);
  const shader=shaderFor(clone);clone.onBeforeCompile(shader,{});assert.equal(shader.fragmentShader.split('// WORLD_FILM_GRAIN_V1').length-1,1);
  const prior=material.onBeforeCompile;material.onBeforeCompile=function(s,r){prior.call(this,s,r);s.fragmentShader+='\n// LATER_PLUGIN';};
  assert.equal(applyWorldFilmGrain(root).added,1);const chained=shaderFor(material);material.onBeforeCompile(chained,{});
  assert.equal(chained.fragmentShader.split('// WORLD_FILM_GRAIN_V1').length-1,1);assert.match(chained.fragmentShader,/LATER_PLUGIN/);assert.ok(chained.uniforms.worldFilmFrame);
});

test('films, explicit HUD ancestry, sprites, transparency and custom/depth shaders stay clear',()=>{
  const root=new THREE.Group(),world=new THREE.MeshBasicMaterial(),video=new THREE.MeshBasicMaterial({map:new THREE.VideoTexture({})}),emissive=new THREE.MeshStandardMaterial({emissiveMap:new THREE.VideoTexture({})}),transparent=new THREE.MeshBasicMaterial({transparent:true}),custom=new THREE.ShaderMaterial(),depth=new THREE.MeshDepthMaterial(),distance=new THREE.MeshDistanceMaterial(),flagged=new THREE.MeshBasicMaterial();flagged.userData.filmGrainExclude=true;
  const hud=new THREE.Group(),hudMaterial=new THREE.MeshBasicMaterial();hud.userData.filmGrainExclude=true;hud.add(mesh(hudMaterial));root.add(hud);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial());root.add(sprite);
  [world,video,emissive,transparent,custom,depth,distance,flagged].forEach(m=>root.add(mesh(m)));
  const report=applyWorldFilmGrain(root);assert.equal(report.added,1);assert.equal(world.userData.worldFilmGrain,true);
  for(const material of [video,emissive,transparent,custom,depth,distance,flagged,hudMaterial,sprite.material])assert.equal(material.userData.worldFilmGrain,undefined);
  const old=new THREE.MeshBasicMaterial(),initial=old.onBeforeCompile,group=new THREE.Group();group.add(mesh(old));applyWorldFilmGrain(group);group.children[0].userData.filmGrainExclude=true;
  assert.equal(applyWorldFilmGrain(group).restored,1);assert.equal(old.onBeforeCompile,initial);
  const shared=new THREE.MeshBasicMaterial(),protectedCopy=mesh(shared);protectedCopy.userData.filmGrainExclude=true;const sharedRoot=new THREE.Group();sharedRoot.add(mesh(shared),protectedCopy);
  assert.equal(applyWorldFilmGrain(sharedRoot).added,0,'an explicit HUD exclusion also protects a shared material');
});

test('all draws share one 18 Hz seed; dense monochrome grain stays bounded without textures or frame allocations',()=>{
  const root=new THREE.Group(),a=new THREE.MeshBasicMaterial(),b=new THREE.MeshStandardMaterial();root.add(mesh(a),mesh(b));applyWorldFilmGrain(root);
  const first=shaderFor(a),second=shaderFor(b);a.onBeforeCompile(first,{});b.onBeforeCompile(second,{});
  assert.equal(first.uniforms.worldFilmFrame,second.uniforms.worldFilmFrame);const uniform=first.uniforms.worldFilmFrame;
  setWorldFilmGrainFrame(0);assert.equal(uniform.value,0);assert.equal(setWorldFilmGrainFrame(.02),false);assert.equal(setWorldFilmGrainFrame(1/18+.001),true);assert.equal(uniform.value,1);
  const versions=[a.version,b.version],mapA=a.map,mapB=b.map;
  for(let i=0;i<10000;i++)setWorldFilmGrainFrame(i/60);
  assert.deepEqual([a.version,b.version],versions);assert.equal(a.map,mapA);assert.equal(b.map,mapB);assert.equal(first.uniforms.worldFilmFrame,uniform);
  for(const value of [NaN,Infinity,-1,Number.MAX_VALUE,1e12]){setWorldFilmGrainFrame(value);assert.ok(Number.isInteger(uniform.value)&&uniform.value>=0&&uniform.value<WORLD_FILM_GRAIN_SETTINGS.period);}
  assert.ok(WORLD_FILM_GRAIN_SETTINGS.strength>=.12&&WORLD_FILM_GRAIN_SETTINGS.strength<=.14);assert.equal(WORLD_FILM_GRAIN_SETTINGS.hz,18);
  assert.ok(WORLD_FILM_GRAIN_SETTINGS.clumpPixels<2.5);assert.ok(WORLD_FILM_GRAIN_SETTINGS.clump<.18);
  assert.equal(WORLD_DITHER_SETTINGS.levels,12);assert.equal(WORLD_DITHER_SETTINGS.amount,.65);
  assert.ok(first.fragmentShader.indexOf('// WORLD_ORDERED_DITHER_V1')<first.fragmentShader.indexOf('// WORLD_FILM_GRAIN_V1'));
  const film=first.fragmentShader.slice(first.fragmentShader.indexOf('// WORLD_FILM_GRAIN_V1'),first.fragmentShader.indexOf('#include <premultiplied_alpha_fragment>'));
  assert.match(film,/mix\(worldFilmFine, worldFilmClump, 0\.12\)/);assert.match(film,/gl_FragColor\.rgb = clamp\(gl_FragColor\.rgb \+ vec3\(/);
  assert.doesNotMatch(film,/\bdiscard\b|\bstep\s*\(|gl_FragColor\.a\s*=/);assert.equal((film.match(/worldFilmHash\(/g)??[]).length,2);
});

test('the actual planet accessor keeps repeated passes stable while external replacement and cloned avatars still get grain',()=>{
  const prototype=THREE.Material.prototype,compileDescriptor=Object.getOwnPropertyDescriptor(prototype,'onBeforeCompile'),cacheDescriptor=Object.getOwnPropertyDescriptor(prototype,'customProgramCacheKey');
  const chunks=Object.fromEntries(['logdepthbuf_pars_vertex','project_vertex','worldpos_vertex'].map(key=>[key,THREE.ShaderChunk[key]]));
  const spriteVertex=THREE.ShaderLib.sprite.vertexShader,priorPlanet={on:PLANET.on,radius:PLANET.radius,uniform:PLANET.radiusUniform.value};
  try{
    installPlanetCurve(170);
    const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();root.add(mesh(material));let baseCalls=0;
    const baseHook=shader=>{baseCalls++;shader.uniforms.avatarDye={value:7};};material.onBeforeCompile=baseHook;
    assert.notEqual(material.onBeforeCompile,material.onBeforeCompile,'the real planet getter creates fresh wrappers');
    assert.equal(materialCompileHookIdentity(material.onBeforeCompile),baseHook);
    assert.equal(applyWorldFilmGrain(root).added,1);const version=material.version,key=material.customProgramCacheKey();
    for(let i=0;i<5;i++){const report=applyWorldFilmGrain(root);assert.equal(report.added,0);assert.equal(report.alreadyPatched,1);}
    assert.equal(material.version,version);assert.equal(material.customProgramCacheKey(),key);
    const first=shaderFor(material);material.onBeforeCompile(first,{});assert.equal(baseCalls,1);assert.equal(first.uniforms.avatarDye.value,7);
    assert.equal(first.uniforms.planetCentre,PLANET.centre);assert.equal(first.uniforms.planetRadius,PLANET.radiusUniform);assert.ok(first.uniforms.worldFilmFrame);
    const clone=material.clone();assert.equal(clone.userData.worldFilmGrain,true);root.add(mesh(clone));assert.equal(applyWorldFilmGrain(root).added,1);
    const clonedShader=shaderFor(clone);clone.onBeforeCompile(clonedShader,{});assert.ok(clonedShader.uniforms.planetCentre);assert.ok(clonedShader.uniforms.worldFilmFrame);
    const previous=material.onBeforeCompile;material.onBeforeCompile=function(shader,renderer){previous.call(this,shader,renderer);shader.uniforms.laterPlugin={value:11};};
    assert.equal(applyWorldFilmGrain(root).added,1);const afterVersion=material.version;assert.equal(applyWorldFilmGrain(root).added,0);assert.equal(material.version,afterVersion);
    const chained=shaderFor(material);material.onBeforeCompile(chained,{});assert.equal(chained.uniforms.laterPlugin.value,11);assert.equal(chained.fragmentShader.split('// WORLD_FILM_GRAIN_V1').length-1,1);assert.equal(chained.uniforms.planetCentre,PLANET.centre);
    const protectedMaterial=new THREE.MeshBasicMaterial(),original=materialCompileHookIdentity(protectedMaterial.onBeforeCompile),protectedRoot=new THREE.Group(),protectedMesh=mesh(protectedMaterial);protectedRoot.add(protectedMesh);applyWorldFilmGrain(protectedRoot);protectedMesh.userData.filmGrainExclude=true;
    assert.equal(applyWorldFilmGrain(protectedRoot).restored,1);assert.equal(materialCompileHookIdentity(protectedMaterial.onBeforeCompile),original);
  }finally{
    Object.defineProperty(prototype,'onBeforeCompile',compileDescriptor);Object.defineProperty(prototype,'customProgramCacheKey',cacheDescriptor);
    Object.assign(THREE.ShaderChunk,chunks);THREE.ShaderLib.sprite.vertexShader=spriteVertex;PLANET.on=priorPlanet.on;PLANET.radius=priorPlanet.radius;PLANET.radiusUniform.value=priorPlanet.uniform;
  }
});
