import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled=await build({stdin:{contents:"export * from './src/world/DriveInCarArt'; export * as THREE from 'three'; export {batchStaticScenery} from './src/world/StaticBatch';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {THREE,DRIVE_IN_PAINTS,CAR_PAINT_MATERIAL,applyDriveInCarArt,batchStaticScenery}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('six car colours share authored maps and one shader while batching preserves paint differences',()=>{
  const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(1,1,1),map=new THREE.Texture(),normal=new THREE.Texture();
  const paint=new THREE.MeshStandardMaterial({map,normalMap:normal,roughness:.46,metalness:.7});paint.name=CAR_PAINT_MATERIAL;
  paint.userData.preserveAuthoredSurface=true;
  const trim=new THREE.MeshStandardMaterial({color:0x252525,map});
  const pieces=[];
  for(const [i,hex] of [...DRIVE_IN_PAINTS,DRIVE_IN_PAINTS[0]].entries()){
    const car=new THREE.Group();car.name='Drive Thru 88 convertible';car.userData.driveInPaint=hex;car.position.x=i*7;
    const body=new THREE.Mesh(geometry,paint),tyres=new THREE.Mesh(geometry,trim);body.userData.environmentImported=true;tyres.userData.environmentImported=true;
    car.add(body,tyres);scene.add(car);pieces.push(body);
  }
  const handle=applyDriveInCarArt(scene);assert.equal(handle.report.cars,7);assert.equal(handle.report.materials,6);
  assert.equal(applyDriveInCarArt(scene),handle,'repeat preparation must not stack shader patches');
  assert.equal(pieces[0].material,pieces[6].material);assert.equal(new Set(pieces.map(p=>p.material)).size,6);
  assert.equal(new Set(pieces.map(p=>p.material.customProgramCacheKey())).size,1,'uniform paint colours do not compile six programs');
  assert.equal(pieces[0].material.userData.islandPrintStrength,.28,'car paint keeps subtler grain than the environment');
  for(const body of pieces){assert.equal(body.material.map,map);assert.equal(body.material.normalMap,normal);assert.equal(body.material.roughness,.46);assert.equal(body.material.metalness,.7);}
  assert.equal(paint.color.getHex(),0xffffff);assert.equal(trim.color.getHex(),0x252525,'tyres and trim are not globally recoloured');
  let disposed=0;for(const material of new Set(pieces.map(p=>p.material)))material.addEventListener('dispose',()=>disposed++);
  assert.ok(batchStaticScenery(scene).batchedPieces>7);
  const batchedColors=new Set();scene.traverse(object=>{if(object.isMesh&&object.material.userData.driveInPaintColor!==undefined)batchedColors.add(object.material.userData.driveInPaintColor);});
  assert.deepEqual([...batchedColors].sort(),[...DRIVE_IN_PAINTS].sort());
  handle.dispose();handle.dispose();assert.equal(disposed,6);for(const body of pieces)assert.equal(body.material,paint);
});

test('paint selection is explicit and previous shader work survives on a marked body',()=>{
  const scene=new THREE.Scene(),car=new THREE.Group();car.userData.driveInPaint=DRIVE_IN_PAINTS[1];scene.add(car);
  const source=new THREE.MeshStandardMaterial();source.userData.carPaint=true;
  let priorCalls=0;source.onBeforeCompile=shader=>{priorCalls++;shader.uniforms.previousWork={value:7};};
  const body=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),source);body.userData.environmentImported=true;
  const unmarked=new THREE.Mesh(body.geometry,source);car.add(body,unmarked);
  const art=applyDriveInCarArt(scene);assert.equal(art.report.materials,1);assert.equal(unmarked.material,source);
  const shader={uniforms:{},fragmentShader:'#include <common>\n#include <map_fragment>'};body.material.onBeforeCompile(shader,{});
  assert.equal(priorCalls,1);assert.equal(shader.uniforms.previousWork.value,7);assert.equal(shader.uniforms.driveInBodyPaint.value.getHex(),DRIVE_IN_PAINTS[1]);
  art.dispose();
});
