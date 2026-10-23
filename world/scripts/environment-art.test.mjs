import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:"export * from './src/world/EnvironmentArt';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const {THREE,applyEnvironmentArt,environmentPaletteTint,ISLAND_PALETTE}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('the reference palette keeps lacquer red, paths distinct from asphalt and dark joinery readable',()=>{
  assert.equal(environmentPaletteTint('wood',new THREE.Color(0x8f1d1d)).getHex(),ISLAND_PALETTE.vermilion);
  assert.equal(environmentPaletteTint('plaster',new THREE.Color(0xc7baa0)).getHex(),ISLAND_PALETTE.cream);
  assert.notEqual(environmentPaletteTint('stone',new THREE.Color(0xaaa08b)).getHex(),environmentPaletteTint('asphalt',new THREE.Color(0x25282b)).getHex());
  assert.equal(environmentPaletteTint('plaster',new THREE.Color(0x26262a)).getHex(),ISLAND_PALETTE.ink);
});

test('environment printing preserves authored geometry, maps, normals and prior shader work while protecting characters and lettering',()=>{
  const scene=new THREE.Scene(),map=new THREE.Texture(),normal=new THREE.Texture();
  const surface=new THREE.MeshStandardMaterial({map,normalMap:normal,metalness:.83,roughness:.37});
  surface.userData.preserveAuthoredSurface=true;
  let prior=0;surface.onBeforeCompile=shader=>{prior++;shader.fragmentShader+='\n// authored hook';};
  surface.customProgramCacheKey=()=>'authored-source';
  const statue=new THREE.Mesh(new THREE.BoxGeometry(),surface);statue.userData.environmentImported=true;scene.add(statue);
  const colors=new THREE.MeshStandardMaterial({color:0x52736a});colors.userData.environmentFamily='ceramic';
  const wall=new THREE.Mesh(new THREE.BoxGeometry(),colors);scene.add(wall);
  const face=new THREE.MeshStandardMaterial({color:0xb98a6c});face.userData.environmentFamily='plaster';
  const person=new THREE.Group();person.name='character-body';person.add(new THREE.Mesh(new THREE.BoxGeometry(),face));scene.add(person);
  const signMat=new THREE.MeshBasicMaterial({map:new THREE.Texture()});signMat.userData.environmentAccent='vermilion';scene.add(new THREE.Mesh(new THREE.PlaneGeometry(),signMat));
  const vertices=Array.from(statue.geometry.attributes.position.array),normals=Array.from(statue.geometry.attributes.normal.array),faceColor=face.color.getHex();
  const report=applyEnvironmentArt(scene);
  assert.equal(report.imported,1);assert.equal(report.recolored,1);
  assert.equal(colors.color.getHex(),ISLAND_PALETTE.cyan);assert.equal(face.color.getHex(),faceColor);
  assert.equal(face.userData.islandPrintPatched,undefined);assert.equal(signMat.userData.islandPrintPatched,undefined);
  assert.equal(surface.map,map);assert.equal(surface.normalMap,normal);assert.equal(surface.metalness,.83);assert.equal(surface.roughness,.37);assert.equal(surface.flatShading,false);
  assert.deepEqual(Array.from(statue.geometry.attributes.position.array),vertices);assert.deepEqual(Array.from(statue.geometry.attributes.normal.array),normals);
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <colorspace_fragment>'};surface.onBeforeCompile(shader,{});
  assert.equal(prior,1);assert.match(shader.fragmentShader,/authored hook/);assert.match(shader.fragmentShader,/islandBayer/);assert.match(shader.vertexShader,/vIslandPrintWorld/);
  assert.equal(shader.uniforms.islandPrintStrength.value,1,'the environment keeps its existing strong print treatment');
  const hook=surface.onBeforeCompile,key=surface.customProgramCacheKey();applyEnvironmentArt(scene);
  assert.equal(surface.onBeforeCompile,hook);assert.equal(surface.customProgramCacheKey(),key);assert.match(key,/authored-source.*island-reference-print/);
});
