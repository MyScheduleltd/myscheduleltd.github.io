import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// The geometry tests need a canvas handle, not a renderer or a fabricated image.
// Geometry-only tests retain PNG dimensions for the embedded cap texture.
// Pixel appearance is checked in the browser, not by this decoder stub.
globalThis.self=globalThis;
globalThis.createImageBitmap=async(blob)=>{const bytes=await blob.arrayBuffer();const view=new DataView(bytes);return {width:view.getUint32(16),height:view.getUint32(20),close(){}};};
globalThis.document = {createElement:()=>({width:64,height:64,getContext:()=>({fillRect(){}})})};
const output=await build({stdin:{contents:"export {applyWornStyle} from './src/world/WornStyle'; export * from './src/world/MentorDog'; export * from './src/world/HandPose'; export * from './src/world/RooftopBand'; export { HeadTracking } from './src/world/HeadTracking'; export { FestivalWorld } from './src/world/FestivalWorld'; export * from './src/world/CoastalAvatar'; export * from './src/world/CoastalPose'; export * from './src/world/CoastalCarry'; export * from './src/world/ImportedAvatar'; export * from './src/world/CoastalSkateboard'; export * from './src/world/CoastalGeometry'; export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,loader:{'.png':'dataurl'},platform:'node',format:'esm',write:false});
const {HeadTracking,RooftopBand,BAND_MEMBERS,FIST,FINGER_NAMES,handPoseFromJoints,MENTOR_NESTLE,applyWornStyle,waveCoastalPose,fallCoastalPose,landCoastalPose,djCoastalPose,hitCoastalPose,perchMentor,stepMentorGait,createMentorDog,poseCoastalCarry,loadImportedAvatar,attachImportedAvatar,syncImportedAvatars,COASTAL_CUP_OFFSET,COASTAL_STRAW_TIP,FestivalWorld,jumpCoastalArms,setCoastalSwimwear,punchCoastalPose,setCoastalFists,createCoastalSedan,CONVERTIBLE,walkCoastalPose,danceCoastalPose,COASTAL_STRIDE_LENGTH,THREE,createCoastalAvatar,supportCoastalPose,seatCoastalLegs,coastalFootHeights,skateCoastalPose,createCoastalSkateboard}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
function character(){
  const root=new THREE.Group();root.position.y=.28;
  const rig=createCoastalAvatar(root,{skin:'#dfb590',hair:'#3b3633',top:'#d0cbc1',bottoms:'#44464a',swimwear:'#577467'},true,new THREE.Group());
  return {root,rig};
}

const AVATAR_FILES=['male','female'];
const avatarBytes=Object.fromEntries(await Promise.all(AVATAR_FILES.map(async key=>{
  const bytes=await readFile(`src/assets/avatars/${key}.glb`);
  return [key,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)];
})));
await loadImportedAvatar(avatarBytes);
const BASE_PALETTE={skin:'#dfb590',hair:'#3b3633',top:'#18191b',bottoms:'#44464a',swimwear:'#577467'};
function importedCharacter(palette={}){
  const {root,rig}=character();
  attachImportedAvatar(root,rig,{...BASE_PALETTE,...palette});
  return {root,rig};
}

for(const top of ['#18191b','#28191b'])for(const side of ['Left','Right']){
 const {root,rig}=importedCharacter({top});walkCoastalPose(rig,0,0);syncImportedAvatars(root);
 const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 const read=()=>handPoseFromJoints({wrist:bones.get(side+'Hand').getWorldPosition(new THREE.Vector3()),fingers:Object.fromEntries(FINGER_NAMES.map(n=>[n,[1,2,3,4].map(i=>bones.get(side+'Hand'+n+i).getWorldPosition(new THREE.Vector3()))]))},side==='Right',true);
 const pose=read();for(const n of ['Index','Middle','Ring','Pinky'])pose[n]={curl:[.3,.8,.5],spread:0};
 root.userData.setImportedHandPose(side==='Left',pose);syncImportedAvatars(root);
 console.log(top,side,JSON.stringify(read()));
}
const files={};for(const n of [...BAND_MEMBERS,'stage','bonfire']){const b=await readFile('src/assets/band/'+n+'.glb');files[n]=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
const band=new RooftopBand({x:40,y:7,z:12.2,yaw:Math.PI},{x:53.5,y:7,z:15.6,yaw:Math.PI/2});await band.load(files);band.update(0,0);band.group.updateMatrixWorld(true);
for(const m of band.musicians){console.log(m.name,m.root.position.toArray());m.root.traverse(o=>{if(o.isSkinnedMesh){o.computeBoundingBox();console.log('bounds',o.name,o.boundingBox.min.toArray(),o.boundingBox.max.toArray(),o.boundingSphere.center.toArray(),o.boundingSphere.radius);}});}
