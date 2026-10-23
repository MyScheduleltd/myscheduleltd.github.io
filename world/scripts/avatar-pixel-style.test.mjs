import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const context=new Proxy({measureText:t=>({width:t.length*40})},{get:(o,k)=>k in o?o[k]:()=>{}});
globalThis.self=globalThis;globalThis.document={createElement:()=>({width:64,height:64,getContext:()=>context})};
globalThis.createImageBitmap=async blob=>{const v=new DataView(await blob.arrayBuffer());return{width:v.getUint32(16),height:v.getUint32(20),close(){}};};
const compiled=await build({stdin:{contents:"export * from './src/world/ImportedAvatar';export * from './src/world/CoastalAvatar';export * from './src/world/CoastalPose';export * from './src/world/FestivalAttendant';export * from './src/world/AvatarPixelStyle';export {VenueSceneryAssets} from './src/world/VenueSceneryAssets';export {RooftopBand,BAND_MEMBERS} from './src/world/RooftopBand';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
const {THREE,AVATAR_NATIVE,createCoastalAvatar,loadImportedAvatar,attachImportedAvatar,setCoastalSwimwear,applyAvatarColourLighting,applyAvatarPixelTexture,createFestivalAttendant,VenueSceneryAssets,RooftopBand,BAND_MEMBERS}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const files=Object.fromEntries(await Promise.all(['male','female'].map(async key=>{const b=await readFile(`src/assets/avatars/${key}.glb`);return[key,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)];})));await loadImportedAvatar(files);
function character(sex='male',swimwear){const root=new THREE.Group(),palette={...AVATAR_NATIVE[sex],top:sex==='male'?'#18191b':'#28191b',swimwear:swimwear??AVATAR_NATIVE[sex].swimwear};const rig=createCoastalAvatar(root,palette,true,new THREE.Group());attachImportedAvatar(root,rig,palette);return{root,rig,palette};}
function shaderOf(material){const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader,{});return shader;}

test('the swimsuit picker reaches both actual body shaders, including former legacy/default colours',()=>{
 for(const sex of ['male','female'])for(const colour of ['#ff00ff','#2277dd','#577467','#000000']){
  const {root}=character(sex,colour);setCoastalSwimwear(root,true);
  const body=root.userData.importedAvatar.meshes.find(m=>m.userData.componentId==='body'),shader=shaderOf(body.material);
  assert.equal(shader.uniforms.avatarDyeOn.value.z,1,sex+' '+colour);assert.equal(shader.uniforms.avatarGarment.value.getHexString(),colour.slice(1));
  assert.ok(shader.fragmentShader.includes('texture2D(avatarDye, avatarPixelUv(vMapUv)'),'dye mask and color must share crisp texels');
  const {root:reference}=character(sex,AVATAR_NATIVE[sex].swimwear);setCoastalSwimwear(reference,true);
  assert.equal(shaderOf(reference.userData.importedAvatar.meshes.find(m=>m.userData.componentId==='body').material).uniforms.avatarDyeOn.value.z,0,'native colour restores the original map');
 }
});

test('shirt and shoe picks independently dye both real bodies in outfits 1–3 while all white print maps stay separate',()=>{
 for(const sex of ['male','female'])for(const [id,wire]of[['1','18191b'],['2','191a1c'],['3','1a1b1d']]){
  const {root,palette}=character(sex);
  const base={...palette,top:'#'+(sex==='female'?'2'+wire.slice(1):wire)};
  root.userData.setImportedPalette(base);
  const parts=()=>Object.fromEntries(root.userData.importedAvatar.meshes.map(m=>[m.userData.componentId,m]));
  const maps=new Map(root.userData.importedAvatar.meshes.map(m=>[m,m.material.map]));
  const programKeys=new Map(root.userData.importedAvatar.meshes.map(m=>[m,m.material.customProgramCacheKey()]));
  for(const name of ['garment-tee','garment-shoes'])assert.equal(shaderOf(parts()[name].material).uniforms.avatarDyeOn.value.z,0,'absent fields preserve painted defaults');
  const chosen={...base,shirt:'#13c9bf',shoes:'#e94e3a',bottoms:'#602588',swimwear:'#2b7ac9',hair:'#ff9900',skin:'#835136'};
  root.userData.setImportedPalette(chosen);
  for(const [name,slot]of[['garment-tee','shirt'],['garment-shoes','shoes'],['garment-trousers','bottoms'],['body','swimwear']]){
   const mesh=parts()[name],shader=shaderOf(mesh.material);
   assert.equal(shader.uniforms.avatarGarment.value.getHexString(),chosen[slot].slice(1),`${sex} outfit${id} ${name}`);
   assert.equal(shader.uniforms.avatarDyeOn.value.z,1);
   if(slot==='shirt'||slot==='shoes'){
    assert.equal(shader.uniforms.avatarDyeOn.value.x,0);assert.equal(shader.uniforms.avatarDyeOn.value.y,0,'skin and hair choices cannot reach shoe/shirt masks');
    assert.match(shader.fragmentShader,/dyeMask=vec3\(0\.,0\.,1\.-smoothstep/);
   }
  }
  for(const mesh of root.userData.importedAvatar.meshes){
   assert.equal(mesh.material.map,maps.get(mesh),'dyes cannot swap or overwrite native/print atlases');
   assert.equal(mesh.material.customProgramCacheKey(),programKeys.get(mesh),'colour changes reuse the same program');
   if(String(mesh.userData.componentId).startsWith('print-'))assert.equal(shaderOf(mesh.material).uniforms.avatarGarment,undefined,'exact white artwork remains outside the dye shader');
  }
  root.userData.setImportedPalette(base);
  for(const name of ['garment-tee','garment-shoes'])assert.equal(shaderOf(parts()[name].material).uniforms.avatarDyeOn.value.z,0,'clearing a pick restores the original painted upper');
  assert.equal(base.top,chosen.top,'an independent colour cannot change the compatible outfit ID');
 }
});

test('all visible avatar materials keep real scene light/shadows and crisp map sampling without replacing texture objects',()=>{
 for(const sex of ['male','female']){
  const {root}=character(sex);
  for(const mesh of root.userData.importedAvatar.meshes.filter(m=>m.visible)){
   const material=mesh.material,map=material.map,shader=shaderOf(material);
   assert.equal(material.toneMapped,true);assert.equal(material.emissiveIntensity,0);
   assert.match(shader.fragmentShader,/AVATAR_SCENE_LIGHT_BANDS_V1/);assert.match(shader.fragmentShader,/reflectedLight.directDiffuse\+reflectedLight.indirectDiffuse/);
   assert.ok(!shader.fragmentShader.includes('evenIrradiance'),'must not substitute uniform albedo for directional face shading');
   assert.equal(material.map,map);if(map)assert.equal(map.magFilter,THREE.NearestFilter);
   assert.ok(shader.uniforms.avatarPixelGrid.value.x<=512&&shader.uniforms.avatarPixelGrid.value.y<=512);
   assert.ok(material.userData.avatarPixelStyle,'every visible part, including prints/shoes, uses the shared style');
  }
 }
});

test('scenic/band material composition is idempotent and preserves physical shadow inputs',()=>{
 const map=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1),material=new THREE.MeshStandardMaterial({map,emissive:0xffffff,emissiveIntensity:1});
 applyAvatarColourLighting(material);const hook=material.onBeforeCompile,key=material.customProgramCacheKey();applyAvatarColourLighting(material);
 assert.equal(material.onBeforeCompile,hook);assert.equal(material.customProgramCacheKey(),key);assert.equal(material.map,map);assert.equal(material.emissiveIntensity,0);
 const shader=shaderOf(material);assert.equal(shader.fragmentShader.split('AVATAR_SCENE_LIGHT_BANDS_V1').length-1,1);assert.ok(shader.fragmentShader.includes('AVATAR_CLOTH_WEAR_V1'));
 const uniforms=shader.uniforms;assert.ok(uniforms.avatarPixelGrid);applyAvatarPixelTexture(material);assert.equal(material.onBeforeCompile,hook);
});

test('both fixed staff use the native outfit-1 art and fitted eye-opening balaclavas at their authored supported height',()=>{
 const manager=new VenueSceneryAssets();
 for(const [x,z,yaw]of[[17,-27,0],[-37.6,-12.2,Math.PI/2]]){
  const parent=new THREE.Group();parent.position.set(x,-.68,z);parent.rotation.y=yaw;
  const {root,rig}=createFestivalAttendant(parent);manager.registerFestivalAttendant(rig);
  const metadata=root.userData.festivalAttendant;assert.equal(metadata.outfit,'1');assert.equal(metadata.slogan,'我的檔期有限');assert.equal(metadata.mask,'black-balaclava');
  const shown=root.userData.importedAvatar.meshes.filter(m=>m.visible).map(m=>m.userData.componentId);assert.ok(shown.includes('print-schedule-front'));assert.ok(!shown.includes('vest'));
  const mask=root.getObjectByName('Black festival staff balaclava');assert.equal(mask.parent,rig.head);assert.equal(mask.userData.balaclava.apertures,3,'ski mask has separate eyes and a small mouth opening');
  assert.equal(mask.userData.balaclava.fit,'native-head-faceted-hood');assert.ok(mask.geometry.index.count/3<400,'broad cloth planes do not need an inflated sphere');
  const hoodSize=mask.geometry.boundingBox.getSize(new THREE.Vector3());assert.ok(hoodSize.y>hoodSize.x*.95,'the crown must have head height, not a short wide balloon');
  const points=root.userData.importedSolePoints();assert.ok(Math.abs(Math.min(...points.map(p=>p.y))+.68)<1e-5,'fixed staff soles must remain on their authored floor');
  const body=root.userData.importedAvatar.meshes.find(m=>m.userData.componentId==='body'),shader=shaderOf(body.material);assert.equal(shader.uniforms.avatarStaffMask.value,1);assert.ok(shader.fragmentShader.includes('staffEyeOpening'));
  assert.match(shader.fragmentShader,/vAvatarSkin>\.5&&vAvatarHair<\.15/,'hair fragments cannot protrude through the face apertures');
  const before=rig.head.quaternion.clone();manager.update(1);assert.ok(before.angleTo(rig.head.quaternion)>.001,'keep the existing small station idle motion');
 }
 assert.equal(manager.reviewSnapshot().nativeAttendants,2);
});

test('all four actual musician files keep the scene-lit pixel materials throughout seated, walking and playing clips',async()=>{
 const files=Object.fromEntries(await Promise.all([...BAND_MEMBERS,'stage','bonfire'].map(async key=>{const b=await readFile(`src/assets/band/${key}.glb`);return[key,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)];})));
 const band=new RooftopBand({x:40,y:7,z:12.2,yaw:Math.PI},{x:53.5,y:7,z:15.6,yaw:Math.PI/2});await band.load(files);assert.equal(band.ready,true);
 const states=new Set(),hooks=new Map();
 const verify=()=>{
  for(const member of BAND_MEMBERS){
   const model=band.group.getObjectByName('band-'+member);assert.ok(model);
   model.traverse(mesh=>{if(!mesh.isMesh)return;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    assert.equal(material.isMeshStandardMaterial,true);assert.equal(material.toneMapped,true);assert.equal(material.emissiveIntensity,0);assert.equal(mesh.receiveShadow,true);
    const shader=shaderOf(material);assert.match(shader.fragmentShader,/AVATAR_SCENE_LIGHT_BANDS_V1/);assert.ok(shader.uniforms.avatarPixelGrid);
    assert.equal(material.userData.worldFilmGrain,!material.transparent);if(hooks.has(material))assert.equal(material.onBeforeCompile,hooks.get(material));else hooks.set(material,material.onBeforeCompile);
   }});
  }
  band.snapshot().forEach(m=>states.add(m.state));
 };
 verify();band.setPlaying(true);
 for(let frame=0;frame<2400;frame++){band.update(1/30,frame/30);if(frame%300===0)verify();}
 verify();assert.ok(states.has('seated')&&states.has('walking')&&states.has('playing'));assert.ok(band.snapshot().every(m=>m.state==='playing'));
});
