import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sharp=require('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const compiled=await build({stdin:{contents:"export * from './src/world/EnvironmentAssets';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {THREE,GLTFLoader,fitEnvironmentModel,environmentModelAssetsFromUrls}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
// The owner's 2026-10-22 regeneration: Meshy 7 from the reference image, refined in Blender to about 8,000 triangles.
const folder='art/victory-statue-regen-20261022',provenance=JSON.parse(await readFile(folder+'/provenance.json','utf8'));
async function glb(file){const bytes=await readFile(file),length=bytes.readUInt32LE(12);return{file,bytes,json:JSON.parse(bytes.subarray(20,20+length)),binary:bytes.subarray(28+length)};}
function view(model,index){const v=model.json.bufferViews[index];return model.binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function modelWithoutImages(model){
 const document=structuredClone(model.json);document.materials=document.materials.map(material=>({...material,pbrMetallicRoughness:{...material.pbrMetallicRoughness,baseColorTexture:undefined,metallicRoughnessTexture:undefined},normalTexture:undefined,emissiveTexture:undefined,occlusionTexture:undefined}));delete document.images;delete document.textures;delete document.extensionsRequired;
 const json=Buffer.from(JSON.stringify(document)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const header=Buffer.from(model.bytes.subarray(0,20));header.writeUInt32LE(20+padded.length+model.bytes.length-(20+model.bytes.readUInt32LE(12)),8);header.writeUInt32LE(padded.length,12);const clean=Buffer.concat([header,padded,model.bytes.subarray(20+model.bytes.readUInt32LE(12))]);return(await new GLTFLoader().parseAsync(clean.buffer.slice(clean.byteOffset,clean.byteOffset+clean.length),'')).scene;
}

test('the installed statue is the recorded Meshy 7 generation refined in Blender, on both devices',async()=>{
 const jobs=JSON.parse(await readFile(folder+'/jobs.json','utf8'));
 const meshy=jobs.candidates.find(c=>c.label==='meshy');assert.equal(meshy.jobId,provenance.source.meshyRaw.jobId);assert.equal(meshy.model,'meshy_v7_image_to_3d');
 assert.equal(jobs.reference.jobId,'6440ad70-a9d8-4e27-864a-5302c4b2ef94','generated from the owner-approved reference image');
 // The raw generation and the Blender intermediate (7 MB, never served) stay
 // with the working copy rather than the repository; checked where present.
 const optional=async name=>{try{return await readFile(folder+'/'+name);}catch(error){if(error.code==='ENOENT')return undefined;throw error;}};
 const raw=await optional('higgsfield-meshy7-raw.glb'),refined=await optional('refined-blender.glb');
 if(raw)assert.equal(sha(raw),provenance.source.meshyRaw.sha256);
 if(refined)assert.equal(sha(refined),provenance.blender.sha256);
 const report=JSON.parse(await readFile(folder+'/refine-report.json','utf8'));assert.equal(report.trianglesAfter,8000);assert.equal(report.trianglesBefore,29530);
 const desktop=await glb('src/assets/environment/victory-statue.glb'),mobile=await glb('src/assets/environment/victory-statue-mobile.glb');
 assert.equal(sha(desktop.bytes),provenance.installed.desktop.sha256);assert.equal(sha(mobile.bytes),provenance.installed.mobile.sha256);
 for(const installed of [desktop,mobile]){
  assert.equal(installed.json.meshes.length,1);assert.equal(installed.json.meshes[0].primitives.length,1);assert.equal(installed.json.materials.length,1);
  assert.equal(installed.json.skins?.length??0,0);assert.equal(installed.json.animations?.length??0,0);
  const primitive=installed.json.meshes[0].primitives[0];
  assert.deepEqual(Object.keys(primitive.attributes).sort(),['NORMAL','POSITION','TEXCOORD_0']);
  assert.equal(installed.json.accessors[primitive.indices].count/3,8000);
 }
 // One mesh, two image sizes: the geometry bytes are identical across devices.
 const p=desktop.json.meshes[0].primitives[0];
 for(const id of [...Object.values(p.attributes),p.indices])assert.deepEqual(view(desktop,desktop.json.accessors[id].bufferView),view(mobile,mobile.json.accessors[id].bufferView));
});

test('desktop/mobile carry one 1024/512 WebP colour map, matte gold, within the agreed download',async()=>{
 for(const [name,edge,budget] of [['victory-statue',1024,640],['victory-statue-mobile',512,448]]){
  const installed=await glb('src/assets/environment/'+name+'.glb'),material=installed.json.materials[0];assert.equal(installed.json.images.length,1);assert.ok(material.pbrMetallicRoughness.baseColorTexture);assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture,undefined);assert.equal(material.normalTexture,undefined);assert.equal(material.emissiveTexture,undefined);assert.equal(material.pbrMetallicRoughness.metallicFactor,0);assert.ok(Math.abs(material.pbrMetallicRoughness.roughnessFactor-.8)<1e-6);
  for(const image of installed.json.images){assert.equal(image.uri,undefined);const meta=await sharp(view(installed,image.bufferView)).metadata();assert.equal(meta.width,edge);assert.equal(meta.height,edge);assert.equal(meta.format,'webp');}
  assert.ok(installed.bytes.length<budget*1024,`${name} ${installed.bytes.length} B`);
 }
 const files={'../assets/environment/victory-statue.glb':'desktop.glb','../assets/environment/victory-statue-mobile.glb':'phone.glb'};
 assert.deepEqual(environmentModelAssetsFromUrls(files,false),{'victory-statue':'desktop.glb'});assert.deepEqual(environmentModelAssetsFromUrls(files,true),{'victory-statue':'phone.glb'});
});

test('the regenerated runner fits the retained plinth/projector volume and has two elevated hands, a raised knee and one standing shoe',async()=>{
 const source=await modelWithoutImages(await glb('src/assets/environment/victory-statue-mobile.glb')),fit=fitEnvironmentModel(source,{height:7.3,maxWidth:7.6,maxDepth:7.2});
 assert.ok(Math.abs(fit.size.y-7.3)<1e-6);assert.ok(fit.bounds.min.x>=-3.8&&fit.bounds.max.x<=3.8);assert.ok(fit.bounds.max.y+2.32<9.8);assert.ok(Math.abs(fit.bounds.min.y)<1e-6);
 let positions;source.traverse(mesh=>{if(mesh.isMesh)positions=mesh.geometry.attributes.position;});
 const box=new THREE.Box3().setFromBufferAttribute(positions),size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
 const regions={leftHand:0,rightHand:0,raisedKnee:0,standingShoe:0};
 for(let i=0;i<positions.count;i++){
  const x=(positions.getX(i)-centre.x)/size.x,y=(positions.getY(i)-box.min.y)/size.y,z=(positions.getZ(i)-centre.z)/size.z;
  if(y>.82&&x<-.38)regions.leftHand++;if(y>.82&&x>.38)regions.rightHand++;
  if(y>.4&&y<.6&&x>.05&&z>.15)regions.raisedKnee++;if(y<.06)regions.standingShoe++;
 }
 for(const [name,count]of Object.entries(regions))assert.ok(count>10,name+' silhouette region missing: '+count);
 // The raised knee comes forward on +Z, so the statue faces +Z as the one it replaces did.
});
