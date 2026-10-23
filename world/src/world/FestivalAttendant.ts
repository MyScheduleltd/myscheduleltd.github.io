import * as THREE from 'three';
import { createCoastalAvatar } from './CoastalAvatar';
import { attachImportedAvatar, AVATAR_NATIVE, applyAvatarColourLighting } from './ImportedAvatar';
import { wardrobeTexture } from './CoastalWardrobe';
import { applyWorldFilmGrain } from './WorldFilmGrain';
import type { AvatarRig } from './FestivalWorld';
import { createStaffBalaclavaGeometry, STAFF_MASK_OPENINGS } from './StaffBalaclava';

/** Same outfit-1 artwork as visitors, reserved black clothing for fixed staff. */
export const FESTIVAL_ATTENDANT_PALETTE=Object.freeze({
  ...AVATAR_NATIVE.male,top:'#18191b',bottoms:'#15171a',hair:'#111214',
});

function balaclava(root:THREE.Group,rig:AvatarRig):THREE.Mesh {
  const body=root.userData.importedAvatar.meshes.find((m:THREE.SkinnedMesh)=>m.userData.componentId==='body') as THREE.SkinnedMesh;
  const positions=body.geometry.getAttribute('position'),ids=body.geometry.getAttribute('skinIndex'),weights=body.geometry.getAttribute('skinWeight');
  root.userData.syncImportedAvatar();body.skeleton.update();body.updateWorldMatrix(true,false);rig.head.updateWorldMatrix(true,false);
  const headIndex=body.skeleton.bones.findIndex(bone=>bone.name==='Head');
  let reference=-1,bestWeight=0;
  for(let i=0;i<positions.count;i++)for(let k=0;k<4;k++)if(ids.getComponent(i,k)===headIndex&&weights.getComponent(i,k)>bestWeight){
    bestWeight=weights.getComponent(i,k);reference=i;
  }
  if(reference<0||bestWeight<.99)throw new Error('Staff hood requires the native head bind transform');
  const toHead=(point:THREE.Vector3)=>{
    body.applyBoneTransform(reference,point);body.localToWorld(point);return rig.head.worldToLocal(point);
  };
  const geometry=createStaffBalaclavaGeometry(toHead);
  const material=new THREE.MeshStandardMaterial({color:0x171a1e,map:wardrobeTexture('canvas'),roughness:1,flatShading:true,side:THREE.DoubleSide});
  applyAvatarColourLighting(material);
  const mask=new THREE.Mesh(geometry,material);mask.name='Black festival staff balaclava';mask.castShadow=mask.receiveShadow=true;
  mask.userData.dynamic=true;mask.userData.wornNoMasonry=true;mask.userData.wornNoGrain=true;
  mask.userData.balaclava={head:{min:geometry.boundingBox!.min.toArray(),max:geometry.boundingBox!.max.toArray()},
    openings:STAFF_MASK_OPENINGS.map(hole=>({...hole})),apertures:3,fit:'native-head-faceted-hood',triangles:geometry.index!.count/3};
  rig.head.add(mask);root.userData.setImportedStaffMask(true);return mask;
}

function maskedDepth(body:THREE.SkinnedMesh):THREE.MeshDepthMaterial {
  const bones=new THREE.Vector3(...(['Head','head_end','headfront'].map(n=>body.skeleton.bones.findIndex(b=>b.name===n)) as [number,number,number]));
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  depth.onBeforeCompile=shader=>{
    shader.uniforms.staffShadowHeadBones={value:bones};
    shader.vertexShader='uniform vec3 staffShadowHeadBones;varying float staffShadowHead;\n'+shader.vertexShader.replace('#include <skinning_vertex>',`#include <skinning_vertex>
      staffShadowHead=dot(skinWeight,vec4(equal(skinIndex,vec4(staffShadowHeadBones.x)))
        +vec4(equal(skinIndex,vec4(staffShadowHeadBones.y)))+vec4(equal(skinIndex,vec4(staffShadowHeadBones.z))));`);
    shader.fragmentShader='varying float staffShadowHead;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(staffShadowHead>.25)discard;');
  };
  depth.customProgramCacheKey=()=>'festival-masked-shadow-v1';body.customDepthMaterial=depth;return depth;
}

/** Keep the authored post/group and collision footprint; only its wearer changes. */
export function createFestivalAttendant(parent:THREE.Group,height=3.25):{root:THREE.Group;rig:AvatarRig} {
  const root=new THREE.Group();root.name='Outfit 1 masked festival attendant';parent.add(root);
  const rig=createCoastalAvatar(root,FESTIVAL_ATTENDANT_PALETTE,true,new THREE.Group());
  attachImportedAvatar(root,rig,FESTIVAL_ATTENDANT_PALETTE);
  for(const [arm,sign] of [[rig.leftArm,-1],[rig.rightArm,1]] as const)arm.rotation.set(0,0,sign*.16);
  rig.leftElbow?.rotation.set(-.12,0,0);rig.rightElbow?.rotation.set(-.12,0,0);
  const mask=balaclava(root,rig);
  const nativeBody=root.userData.importedAvatar.meshes.find((m:THREE.SkinnedMesh)=>m.userData.componentId==='body') as THREE.SkinnedMesh;
  // The hidden curls cannot cast a larger hair silhouette through the hood.
  const depth=maskedDepth(nativeBody);
  for(const mesh of root.userData.importedAvatar.meshes as THREE.SkinnedMesh[]){
    mesh.userData.dynamic=true;
    if(mesh.userData.componentId==='garment-shoes')(mesh.material as THREE.MeshStandardMaterial).color.set(0x17191c);
  }
  root.userData.syncImportedAvatar();root.updateWorldMatrix(true,true);
  const floor=parent.getWorldPosition(new THREE.Vector3()).y;
  const low=Math.min(...(root.userData.importedSolePoints() as THREE.Vector3[]).map(p=>p.y));
  const top=rig.head.localToWorld(new THREE.Vector3(0,mask.geometry.boundingBox?.max.y??.8,0)).y;
  root.scale.setScalar(height/Math.max(.1,top-low));root.updateWorldMatrix(true,true);root.userData.syncImportedAvatar();
  const scaledLow=Math.min(...(root.userData.importedSolePoints() as THREE.Vector3[]).map(p=>p.y));
  root.position.y+=floor-scaledLow;root.updateWorldMatrix(true,true);root.userData.syncImportedAvatar();
  root.userData.festivalAttendant={outfit:'1',slogan:'我的檔期有限',mask:'black-balaclava',height,palette:{...FESTIVAL_ATTENDANT_PALETTE}};
  const dispose=root.userData.disposeImportedAvatar;
  let disposed=false;
  root.userData.disposeImportedAvatar=()=>{if(disposed)return;disposed=true;dispose();depth.dispose();mask.removeFromParent();mask.geometry.dispose();(mask.material as THREE.Material).dispose();};
  applyWorldFilmGrain(root);return{root,rig};
}
