import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:"export * from './src/world/WishWallFrame';export * from './src/world/PamphletSurface';export * from './src/world/TempleTrimAtlas';export * from './src/world/EnvironmentMaterials';export {FestivalWorld} from './src/world/FestivalWorld';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',loader:{'.png':'dataurl'}});
const {THREE,createWishWallFrame,WISH_WALL_CONTENT_CLEAR,polishPamphletSurface,TempleTrimAtlas,FestivalWorld,EnvironmentMaterials,tagEnvironmentSurface}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('crafted frame leaves the entire live canvas clear and stays inside the original roof/post plan',()=>{
 const atlas=new THREE.MeshStandardMaterial(),handle=createWishWallFrame(atlas),{root,report}=handle;
 assert.equal(root.name,'wish-wall');assert.ok(report.triangles>500&&report.triangles<2500);assert.ok(report.meshes<=6);
 assert.ok(root.children.every(m=>m.isMesh&&m.layers.isEnabled(1)&&!m.material.transparent));
 let atlasUses=0;
 for(const mesh of root.children){
  if(mesh.material===atlas)atlasUses++;
  const p=mesh.geometry.getAttribute('position');
  for(let i=0;i<p.count;i+=3){
   const triangle=new THREE.Box3().setFromPoints([0,1,2].map(d=>new THREE.Vector3().fromBufferAttribute(p,i+d)));
   assert.equal(triangle.intersectsBox(WISH_WALL_CONTENT_CLEAR),false,mesh.name+' occludes messages');
  }
 }
 assert.equal(atlasUses,1,'all inlay strips share the same material');
 const bounds=new THREE.Box3().setFromObject(root);
 assert.ok(bounds.min.x>=-2.90001&&bounds.max.x<=2.90001);assert.ok(bounds.min.y>=-.00001&&bounds.max.y<=3.76001);
 assert.ok(bounds.min.z>=-.482&&bounds.max.z<=.482);
 let geometryDisposals=0,atlasDisposals=0;
 root.children.forEach(m=>m.geometry.addEventListener('dispose',()=>geometryDisposals++));atlas.addEventListener('dispose',()=>atlasDisposals++);
 handle.dispose();handle.dispose();assert.equal(geometryDisposals,report.meshes);assert.equal(atlasDisposals,0);
});

test('live wishes reuse their original texture and face through empty, CJK, full and repeated updates',()=>{
 const calls=[],context=new Proxy({measureText:s=>({width:[...s].length*35})},{get:(o,k)=>k in o?o[k]:(...args)=>{if(k==='fillText')calls.push(args[0]);}});
 const priorDocument=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
 try{
  const world=Object.create(FestivalWorld.prototype);Object.assign(world,{scene:new THREE.Scene(),colliders:[],wishWallNotes:[]});
  world.createWishWall();const texture=world.wishWallTexture,canvas=world.wishWallCanvas;
  const face=world.scene.getObjectByName('wish-wall').children.find(m=>m.material?.isMeshBasicMaterial);
  const collider={...world.colliders[0]};assert.equal(face.material.map,texture);assert.equal(face.position.z,.06);assert.ok(Math.abs(face.geometry.parameters.width-4.44)<1e-6);
  assert.equal(canvas.width,2048);assert.equal(canvas.height,1184);assert.ok(calls.some(s=>s.includes('付款')));
  const notes=Array.from({length:35},(_,i)=>({name:'GUEST '+i,message:'祝大家平安，音樂與電影帶來快樂。 '.repeat(8)}));
  world.setWishes(notes);assert.equal(world.wishWallNotes.length,6,'the board hangs the newest six');assert.equal(world.wishWallNotes[0].name,'GUEST 34');assert.equal(world.wishWallNotes.at(-1).name,'GUEST 29');
  world.setWishes([...notes,{name:'GUEST 35',message:'newest'}]);assert.deepEqual(world.wishWallNotes.map(n=>n.name),['GUEST 35','GUEST 34','GUEST 33','GUEST 32','GUEST 31','GUEST 30'],'a new note pushes the oldest of the six off');world.setWishes(notes);
  assert.equal(world.wishWallTexture,texture);assert.equal(world.wishWallCanvas,canvas);assert.equal(face.material.map,texture);
  const version=texture.version;world.setWishes(notes);assert.equal(texture.version,version,'identical data does not repaint');
  world.setWishes([]);assert.ok(texture.version>version);assert.deepEqual(world.colliders[0],collider);
  world.wishWallFrame.dispose();texture.dispose();face.geometry.dispose();face.material.dispose();
 }finally{globalThis.document=priorDocument;}
});

test('pamphlet polishing is scoped to its imported model and preserves other shared source materials',()=>{
 const scene=new THREE.Scene(),stand=new THREE.Group(),lamp=new THREE.Group();stand.userData.environmentAssetKind='pamphlet-stand';lamp.userData.environmentAssetKind='street-lamp';scene.add(stand,lamp);
 const source=new THREE.MeshStandardMaterial({map:new THREE.Texture(),normalMap:new THREE.Texture()});let prior=0;source.onBeforeCompile=()=>prior++;
 const geometry=new THREE.BoxGeometry(),bookcase=new THREE.Mesh(geometry,source),lantern=new THREE.Mesh(geometry,source);bookcase.userData.environmentImported=lantern.userData.environmentImported=true;stand.add(bookcase);lamp.add(lantern);
 const handle=polishPamphletSurface(scene);assert.deepEqual(handle.report,{meshes:1,materials:1});assert.equal(polishPamphletSurface(scene),handle);
 assert.equal(lantern.material,source);assert.equal(bookcase.material.map,source.map);assert.equal(bookcase.material.normalMap,source.normalMap);
 const shader={fragmentShader:'#include <normal_fragment_maps>'};bookcase.material.onBeforeCompile(shader,{});assert.equal(prior,1);assert.match(shader.fragmentShader,/metalnessFactor/);assert.equal(bookcase.material.userData.islandPrintStrength,.3);
 let released=0;bookcase.material.addEventListener('dispose',()=>released++);handle.dispose();handle.dispose();assert.equal(released,1);assert.equal(bookcase.material,source);
});

test('shared atlas prepares once, chooses the small phone image, and releases a late load after teardown',async()=>{
 const priorFetch=globalThis.fetch,priorLoad=THREE.TextureLoader.prototype.loadAsync,priorWindow=globalThis.window;let fetched=0,release;
 globalThis.window={location:new URL('http://127.0.0.1:4184/'),setTimeout,clearTimeout};
 globalThis.fetch=async url=>{assert.equal(String(url),'http://127.0.0.1:4184/temple-trim-mobile.webp');fetched++;return new Response(new Uint8Array([1,2,3]));};
 const texture=new THREE.Texture({width:512,height:512});let disposed=0;texture.addEventListener('dispose',()=>disposed++);
 THREE.TextureLoader.prototype.loadAsync=()=>new Promise(resolve=>{release=()=>resolve(texture);});
 try{
  const atlas=new TempleTrimAtlas({'./temple-trim.webp':'unused','./temple-trim-mobile.webp':'http://127.0.0.1:4184/temple-trim-mobile.webp'},true);
  const pending=atlas.prepare();assert.equal(atlas.prepare(),pending);
  for(let attempt=0;!release&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(release,'texture decode should start: '+atlas.report.errors.join('; '));
  atlas.dispose();atlas.dispose();release();await pending;assert.equal(fetched,1);assert.equal(disposed,1);assert.equal(atlas.material.map,null);
 }finally{globalThis.fetch=priorFetch;THREE.TextureLoader.prototype.loadAsync=priorLoad;globalThis.window=priorWindow;}
});


test('frame family finishes receive shared maps while brass and the ornament atlas keep their authored surfaces',async()=>{
 const priorFetch=globalThis.fetch,priorLoad=THREE.TextureLoader.prototype.loadAsync,priorWindow=globalThis.window;
 globalThis.window={location:new URL('http://127.0.0.1:4184/'),setTimeout,clearTimeout};
 globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]));
 THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture({width:8,height:8});
 const atlas=new THREE.MeshStandardMaterial(),frame=createWishWallFrame(atlas),library=new EnvironmentMaterials({mobile:false,assets:Object.fromEntries(['wood','ceramic','stone'].map(f=>[f,{color:'http://127.0.0.1:4184/'+f+'.webp'}]))});
 try{
  for(const mesh of frame.root.children){const surface=mesh.material.userData.environmentSurface;if(surface)tagEnvironmentSurface(mesh,surface.family,surface);}
  const report=await library.prepare(frame.root);assert.equal(report.applied,4);assert.equal(report.skipped,0);
  assert.equal(frame.root.children.filter(m=>m.material.map).length,4);assert.ok(frame.root.children.some(m=>m.material===atlas));
 }finally{library.dispose();frame.dispose();atlas.dispose();globalThis.fetch=priorFetch;THREE.TextureLoader.prototype.loadAsync=priorLoad;globalThis.window=priorWindow;}
});

test('closing during material preparation prevents later art handles and play warmup from being allocated',async()=>{
 const priorWindow=globalThis.window;globalThis.window={location:new URL('http://127.0.0.1:4184/')};let resume,entered=false;
 const world=Object.create(FestivalWorld.prototype);Object.assign(world,{scene:new THREE.Scene(),disposed:false,environmentPrepared:false,publicScreenBoxes:()=>[],environmentMaterials:{prepare:()=>{entered=true;return new Promise(resolve=>{resume=resolve;});}}});
 try{
  const pending=world.prepareAssets();for(let i=0;!entered&&i<10;i++)await Promise.resolve();assert.ok(entered);
  world.disposed=true;resume();await pending;
  for(const key of ['driveInCarArt','pamphletSurface','driveInLicensePlates','environmentReflections'])assert.equal(world[key],undefined,key);
  const play=Object.create(FestivalWorld.prototype);Object.assign(play,{disposed:false,prepareAssets:async()=>{play.disposed=true;},warmScreenPlayer:()=>assert.fail('warmup after teardown')});await play.prepareForPlay();
 }finally{world.templeArchitecture?.dispose();globalThis.window=priorWindow;}
});
