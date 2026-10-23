import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:"export * from './src/world/PalacePilasterFinish';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {THREE,polishPalacePilasters,PALACE_PILASTER_BRONZE}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('only imported cinema-pilasters receive bronze; shared source textures and geometry stay untouched',()=>{
 const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),source=new THREE.MeshStandardMaterial({color:0xffffff,map:new THREE.Texture(),emissiveMap:new THREE.Texture(),normalMap:new THREE.Texture(),roughnessMap:new THREE.Texture(),metalnessMap:new THREE.Texture(),emissive:0xffffff,roughness:1,metalness:1});
 source.name='Material_0';const sourceJSON=source.toJSON(),position=geometry.attributes.position.array.slice();let sourceReleased=0,mapsReleased=0;source.addEventListener('dispose',()=>sourceReleased++);
 for(const value of Object.values(source))if(value?.isTexture)value.addEventListener('dispose',()=>mapsReleased++);
 const imported=(kind,marked=true)=>{const group=new THREE.Group();group.userData.environmentAssetKind=kind;const mesh=new THREE.Mesh(geometry,source);mesh.userData.environmentImported=marked;group.add(new THREE.Group().add(mesh));scene.add(group);return mesh;};
 const left=imported('cinema-pilaster'),right=imported('cinema-pilaster'),lamp=imported('street-lamp'),stand=imported('pamphlet-stand'),unmarked=imported('cinema-pilaster',false);
 const excluded=imported('cinema-pilaster');excluded.parent.userData.environmentExclude=true;
 const character=imported('cinema-pilaster');character.parent.userData.coastalCharacter=0;
 const handle=polishPalacePilasters(scene);assert.equal(polishPalacePilasters(scene),handle);assert.deepEqual(handle.report,{meshes:2,materials:1,color:PALACE_PILASTER_BRONZE,metalness:.5,roughness:.5});
 assert.equal(left.material,right.material);assert.notEqual(left.material,source);for(const mesh of [lamp,stand,unmarked,excluded,character])assert.equal(mesh.material,source);
 assert.equal(left.geometry,geometry);assert.deepEqual(geometry.attributes.position.array,position);assert.deepEqual(source.toJSON(),sourceJSON);
 const mat=left.material;assert.equal(mat.color.getHex(),PALACE_PILASTER_BRONZE);assert.equal(mat.metalness,.5);assert.equal(mat.roughness,.5);assert.equal(mat.emissive.getHex(),0);assert.equal(mat.emissiveIntensity,0);assert.equal(mat.vertexColors,false);
 for(const key of ['map','emissiveMap','normalMap','roughnessMap','metalnessMap','aoMap','bumpMap','displacementMap','lightMap','alphaMap'])assert.equal(mat[key],null,key);
 assert.equal(mat.userData.preserveAuthoredSurface,true);assert.equal(mat.userData.islandPaletteApplied,true);
 let ownedReleased=0;mat.addEventListener('dispose',()=>ownedReleased++);handle.dispose();handle.dispose();assert.equal(left.material,source);assert.equal(right.material,source);assert.equal(ownedReleased,1);assert.equal(sourceReleased,0);assert.equal(mapsReleased,0);assert.deepEqual(source.toJSON(),sourceJSON);
 const again=polishPalacePilasters(scene);assert.notEqual(again,handle);again.dispose();
});

test('material arrays preserve unrelated members and shader hooks; teardown does not overwrite a later owner',()=>{
 const scene=new THREE.Scene(),root=new THREE.Group();root.userData.environmentAssetKind='cinema-pilaster';scene.add(root);
 const source=new THREE.MeshStandardMaterial(),other=new THREE.MeshBasicMaterial();let prior=0;source.onBeforeCompile=function(shader){prior++;shader.uniforms.preserved={value:this.color.getHex()};};source.customProgramCacheKey=()=> 'existing-hook';
 const original=[source,other],mesh=new THREE.Mesh(new THREE.BoxGeometry(),original);mesh.userData.environmentImported=true;root.add(mesh);
 const handle=polishPalacePilasters(scene);assert.equal(mesh.material[1],other);assert.notEqual(mesh.material,original);const finish=mesh.material[0];assert.equal(finish.customProgramCacheKey(),'existing-hook:palace-pilaster-satin-bronze-v1');
 const shader={uniforms:{}};finish.onBeforeCompile(shader,{});assert.equal(prior,1);assert.equal(shader.uniforms.preserved.value,PALACE_PILASTER_BRONZE);
 const later=new THREE.MeshStandardMaterial();mesh.material=later;let disposed=0;finish.addEventListener('dispose',()=>disposed++);handle.dispose();assert.equal(mesh.material,later);assert.equal(disposed,1);assert.equal(original[0],source);
});
