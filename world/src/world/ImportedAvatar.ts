import { topOutfit } from './CoastalOutfits';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { AvatarPalette, AvatarRig } from './FestivalWorld';

let template: THREE.Group | undefined;
let loading: Promise<void> | undefined;
export function loadImportedAvatar(bytes?:ArrayBuffer): Promise<void> {
  const loader=new GLTFLoader();
  return loading ??= (bytes?loader.parseAsync(bytes,''):loader.loadAsync(new URL('../assets/neighbour.glb', import.meta.url).href)).then(gltf => { template=gltf.scene; }).catch(error => { loading=undefined; throw error; });
}

/** Share immutable geometry/textures, but give every attendee an independent skeleton and dyes. */
export function attachImportedAvatar(root:THREE.Group, rig:AvatarRig, palette:AvatarPalette): AvatarRig {
  if(!template)throw new Error('The supplied avatar must finish loading before the world starts.');
  const body=rig.visualRoot!;
  body.scale.setScalar(1);
  const oldMeshes:THREE.Mesh[]=[];
  body.traverse(o=>{if(o instanceof THREE.Mesh&&o!==rig.treat&&!root.userData.swimMeshes.includes(o))oldMeshes.push(o);});
  for(const mesh of oldMeshes){mesh.removeFromParent();mesh.geometry.dispose();}
  root.userData.festivalGarments=[];
  const model=clone(template) as THREE.Group;
  model.name='Clean Blender character';model.scale.setScalar(3.42/1.700001);model.position.y=1.43;
  body.add(model);root.updateMatrixWorld(true);
  const uniforms=Object.fromEntries(['skin','hair','top','bottoms','swimwear','cap'].map(key=>[key,{value:new THREE.Color(palette[key as keyof AvatarPalette]??'#3c434f')}])) as Record<string,{value:THREE.Color}>;
  const meshes:THREE.SkinnedMesh[]=[];
  model.traverse(o=>{
    if(!(o instanceof THREE.SkinnedMesh))return;
    meshes.push(o);o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
    o.userData.componentId=o.name==='cap-logo'?'cap-logo':(o.material as THREE.Material).name.replace('FBX • ','');
    const component=o.userData.componentId as string;
    if(component.includes('-print-'))o.castShadow=false;
    const dyeFamily=component==='cap'?'cap':component==='head'?'head':component.includes('trousers')?'bottoms':component.endsWith('-hand')||component.endsWith('-forearm')?'skin':'none';
    const material=(o.material as THREE.MeshStandardMaterial).clone();o.material=material;
    material.roughness=1;material.metalness=0;material.userData.wornNoMasonry=true;material.userData.wornNoGrain=true;
    material.onBeforeCompile=shader=>{
      for(const [key,value] of Object.entries(uniforms))shader.uniforms['avatar_'+key]=value;
      shader.vertexShader='varying vec3 avatarSource;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\navatarSource = position;');
      shader.fragmentShader='varying vec3 avatarSource;\n'+Object.keys(uniforms).map(k=>'uniform vec3 avatar_'+k+';').join('\n')+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 original = diffuseColor.rgb;
        float hi = max(original.r,max(original.g,original.b));
        float lo = min(original.r,min(original.g,original.b));
        float lightness = dot(original,vec3(.2126,.7152,.0722));
        bool skin = original.r > original.g*1.13 && original.g > original.b*1.1 && original.r > .3;
        bool brown = original.r > original.b*1.15 && original.r > original.g*1.025;
        float height = avatarSource.y;
        if(${dyeFamily==='head'||dyeFamily==='skin'?'true':'false'} && skin) diffuseColor.rgb=avatar_skin*clamp(lightness/.65,.5,1.25);
        else if(${dyeFamily==='head'?'true':'false'} && brown) diffuseColor.rgb=avatar_hair*clamp(lightness/.065,.45,1.8);
        else if(${dyeFamily==='cap'?'true':'false'} && hi<.22 && !brown) diffuseColor.rgb=avatar_cap*clamp(lightness/.035,.45,1.8);
        else if(${dyeFamily==='bottoms'?'true':'false'} && !skin) diffuseColor.rgb=avatar_bottoms*clamp(lightness/.065,.4,1.8);
      `);
    };
    material.customProgramCacheKey=()=> 'reference-avatar-dyes-v3-'+dyeFamily;
  });
  // Keep the supplied head and hands for swimming, with a purpose-built fitted
  // swim body on the same control rig. A recoloured hoodie is not a swimsuit.
  const swimDetails:THREE.SkinnedMesh[]=[];
  for(const mesh of meshes){
    const name=(mesh.material as THREE.Material).name;
    if(!name.endsWith('head')&&!name.endsWith('-hand'))continue;
    const geometry=mesh.geometry;
    const detail=new THREE.SkinnedMesh(geometry,mesh.material);
    detail.name='Supplied head and hands • swim outfit';detail.skeleton=mesh.skeleton;detail.bindMatrix.copy(mesh.bindMatrix);detail.bindMatrixInverse.copy(mesh.bindMatrixInverse);
    detail.position.copy(mesh.position);detail.quaternion.copy(mesh.quaternion);detail.scale.copy(mesh.scale);detail.visible=false;detail.frustumCulled=false;detail.castShadow=true;
    mesh.parent!.add(detail);swimDetails.push(detail);
  }
  let wearingCap=Boolean(palette.cap), swimming=false, outfit=topOutfit(palette.top);
  const refreshVisibility=()=>{
    meshes.forEach(m=>{
      const id=String(m.userData.componentId);
      const selected=id.startsWith('outfit1-')?outfit!=='2':id.startsWith('outfit2-')?outfit==='2':id.startsWith('vest')?outfit==='3':true;
      m.visible=id.startsWith('cap')?wearingCap:!swimming&&selected;
    });
    swimDetails.forEach(m=>m.visible=swimming);
  };
  root.userData.setImportedSwimwear=(active:boolean)=>{swimming=active;refreshVisibility();};
  refreshVisibility();
  const mapping:Record<string,THREE.Object3D>={Hips:body,Spine02:rig.torso,Head:rig.head,
    RightArm:rig.leftArm,RightForeArm:rig.leftElbow!,RightHand:rig.leftWrist!,
    LeftArm:rig.rightArm,LeftForeArm:rig.rightElbow!,LeftHand:rig.rightWrist!,
    RightUpLeg:rig.leftLeg,RightLeg:rig.leftKnee!,RightFoot:rig.leftAnkle!,
    LeftUpLeg:rig.rightLeg,LeftLeg:rig.rightKnee!,LeftFoot:rig.rightAnkle!};
  const links=Object.entries(mapping).map(([name,control])=>{
    const bone=model.getObjectByName(name)!;
    // The authored hands have their broad face forward. Calibrate each wrist
    // into an anatomical palm-in rest without changing the shared mesh.
    const side=name==='LeftHand'?1:name==='RightHand'?-1:0;
    const rest=bone.getWorldQuaternion(new THREE.Quaternion());
    const authoredPalmIn=side&&meshes.find(m=>m.userData.componentId===(side>0?'Left-hand':'Right-hand'))?.userData.palmBasis==='inward';
    const handBasis=side&&!authoredPalmIn?rest.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),side*Math.PI/2)).multiply(rest):new THREE.Quaternion();
    return {bone,control,handBasis,offset:control.matrixWorld.clone().invert().multiply(bone.matrixWorld)};
  });
  // The swim body's arm lengths must end at the imported wrists, not the
  // procedural proxy wrists; otherwise a bare gap appears before each hand.
  const swimArms=(root.userData.swimMeshes as THREE.Mesh[]).filter(m=>/^swim-(arm|forearm)-/.test(m.name)).map(mesh=>{
    const side=mesh.name.endsWith('-r')?'Left':'Right';
    const lower=mesh.name.includes('forearm');
    mesh.geometry.dispose();
    // A rounded deltoid falls away from the shoulder pivot; a flat cylinder cap
    // read as a cut-off, square shoulder next to the tank's narrow neck opening.
    mesh.geometry=lower?new THREE.CylinderGeometry(.11,.085,1,8,1):new THREE.LatheGeometry(
      [[0,-.5],[.105,-.49],[.125,-.22],[.145,.20],[.135,.35],[.09,.46],[0,.5]].map(([r,y])=>new THREE.Vector2(r,y)),8);

    body.add(mesh);mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);mesh.scale.set(1,1,1);
    const end=model.getObjectByName(side+(lower?'Hand':'ForeArm'))!;
    const endOffset=new THREE.Vector3(),tipOffset=new THREE.Vector3();
    if(lower){
      const hand=meshes.find(m=>(m.material as THREE.Material).name.endsWith(side+'-hand'))!;
      const p=hand.geometry.getAttribute('position');
      for(const [point,direction] of [[endOffset,1],[tipOffset,-1]] as const){
        let extreme=-Infinity,count=0,representative=0;
        for(let i=0;i<p.count;i++)extreme=Math.max(extreme,p.getY(i)*direction);
        for(let i=0;i<p.count;i++)if(p.getY(i)*direction>extreme-.008){point.add(new THREE.Vector3().fromBufferAttribute(p,i));count++;representative=i;}
        point.divideScalar(count);hand.skeleton.update();hand.applyBoneTransform(representative,point);
        hand.localToWorld(point);end.worldToLocal(point);
      }
    }
    return {mesh,start:model.getObjectByName(side+(lower?'ForeArm':'Arm'))!,end,endOffset,tipOffset};
  });
  // The rest asset's oversized sleeves need clearance beyond the torso edge.
  rig.leftArm.position.x-=.055;rig.rightArm.position.x+=.055;
  const world=new THREE.Matrix4(),rotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion();
  const unusedPosition=new THREE.Vector3(),unusedScale=new THREE.Vector3();
  root.userData.syncImportedAvatar=()=>{
    body.updateWorldMatrix(true,true);
    for(const {bone,control,offset,handBasis} of links){
      world.multiplyMatrices(control.matrixWorld,offset);
      world.decompose(unusedPosition,rotation,unusedScale);
      bone.parent!.getWorldQuaternion(parentRotation);
      // Preserve native joint translations and lengths. Moving every bone to a
      // foreign control position tears a continuous skinned garment at seams.
      bone.quaternion.copy(parentRotation.invert()).multiply(rotation).multiply(handBasis);
      bone.updateWorldMatrix(false,true);
    }
    if(root.userData.wearingSwimwear)for(const {mesh,start,end,endOffset} of swimArms){
      const a=body.worldToLocal(start.getWorldPosition(new THREE.Vector3()));
      const b=body.worldToLocal(end.localToWorld(endOffset.clone()));
      const direction=a.clone().sub(b);
      mesh.position.copy(a).add(b).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
      mesh.scale.y=direction.length()+.025;
    }
    // SkinnedMesh refreshes its inverse bind transform in updateMatrixWorld,
    // not updateWorldMatrix. CPU shoe probes and rendering must use the same one.
    for(const mesh of [...meshes,...swimDetails])mesh.updateMatrixWorld(true);
  };
  const soleSamples=meshes.flatMap(mesh=>{
    if(!(mesh.material as THREE.Material).name.endsWith('shoe'))return [];
    const p=mesh.geometry.getAttribute('position'),indices:number[]=[];
    // Retain the perimeter of every vertical shoe slice. A heel-only probe can
    // miss the next stair riser beneath a long toe even when its centre is clear.
    const slices=new Map<number,number[]>();
    for(let i=0;i<p.count;i++){
      const key=Math.round(p.getZ(i)/.015),slice=slices.get(key)??[];
      slice.push(i);slices.set(key,slice);
    }
    for(const slice of slices.values())for(const axis of ['x','y','z'] as const)for(const direction of [-1,1]){
      let best=-Infinity,vertex=-1;
      for(const i of slice){const value=(axis==='x'?p.getX(i):axis==='y'?p.getY(i):p.getZ(i))*direction;
        if(value>best){best=value;vertex=i;}}
      if(vertex>=0)indices.push(vertex);
    }
    return [...new Set(indices)].map(vertex=>({mesh,vertex}));
  });
  root.userData.supportImportedPose=(floor:((x:number,z:number,y:number)=>number)|undefined,localFloor:number)=>{
    if(root.userData.wearingSwimwear)return;
    root.userData.syncImportedAvatar();
    for(const mesh of meshes)mesh.skeleton.update();
    let rise=-Infinity;
    const p=new THREE.Vector3();
    for(const {mesh,vertex} of soleSamples){
      p.fromBufferAttribute(mesh.geometry.getAttribute('position'),vertex);mesh.applyBoneTransform(vertex,p);mesh.localToWorld(p);
      if(floor)rise=Math.max(rise,floor(p.x,p.z,p.y)-p.y);
      else{root.worldToLocal(p);rise=Math.max(rise,localFloor-p.y);}
    }
    if(Number.isFinite(rise)&&Math.abs(rise)<.5)body.position.y+=rise;
  };
  root.userData.supportImportedSeat=(floor:(x:number,z:number,y:number)=>number)=>{
    if(root.userData.wearingSwimwear)return;
    for(let iteration=0;iteration<3;iteration++){
      root.userData.syncImportedAvatar();for(const mesh of meshes)mesh.skeleton.update();
      for(const [side,hip,knee] of [['Right',rig.leftLeg,rig.leftKnee],['Left',rig.rightLeg,rig.rightKnee]] as const){
        if(!knee)continue;
        let rise=-Infinity;const p=new THREE.Vector3();
        for(const {mesh,vertex} of soleSamples){
          if(!(mesh.material as THREE.Material).name.includes(side+'-shoe'))continue;
          p.fromBufferAttribute(mesh.geometry.getAttribute('position'),vertex);mesh.applyBoneTransform(vertex,p);mesh.localToWorld(p);
          rise=Math.max(rise,floor(p.x,p.z,p.y)-p.y);
        }
        if(!Number.isFinite(rise))continue;
        const angle=THREE.MathUtils.clamp(hip.rotation.x-THREE.MathUtils.clamp(rise/.55,-.13,.13),-1.85,-1.2);
        knee.rotation.x-=angle-hip.rotation.x;hip.rotation.x=angle;
      }
    }
  };
  // Authored lip centre in the rebuilt Blender asset (Z-up -> glTF Y-up).
  root.updateMatrixWorld(true);
  // Store crown anchors in the head frame once; they follow all animated head motion.
  const crowns=[false,true].map(cap=>{
    let top=-Infinity;
    for(const mesh of meshes){
      const id=String(mesh.userData.componentId);
      if(!(cap?id==='cap':id==='hair'||id==='head'))continue;
      mesh.skeleton.update();
      const positions=mesh.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++){
        const v=new THREE.Vector3().fromBufferAttribute(positions,i);mesh.applyBoneTransform(i,v);
        root.worldToLocal(mesh.localToWorld(v));top=Math.max(top,v.y);
      }
    }
    return rig.head.worldToLocal(root.localToWorld(new THREE.Vector3(0,Number.isFinite(top)?top:rig.headTop,0)));
  });
  root.userData.importedHeadSupport=()=>crowns[Number(wearingCap)].clone();
  root.userData.importedMouth=rig.head.worldToLocal(model.localToWorld(new THREE.Vector3(0,.398,.15)));
  root.userData.importedWrist=(right:boolean)=>{
    root.userData.syncImportedAvatar();
    const arm=swimArms.find(a=>a.mesh.name===`swim-forearm-${right?'r':'l'}`)!;
    return body.worldToLocal(arm.end.localToWorld(arm.endOffset.clone()));
  };
  root.userData.importedFingertip=(right:boolean)=>{
    root.userData.syncImportedAvatar();
    const arm=swimArms.find(a=>a.mesh.name===`swim-forearm-${right?'r':'l'}`)!;
    return body.worldToLocal(arm.end.localToWorld(arm.tipOffset.clone()));
  };
  root.userData.importedHandFrame=(right:boolean)=>{
    root.userData.syncImportedAvatar();
    const mesh=meshes.find(m=>m.userData.componentId===(right?'Left-hand':'Right-hand'))!;
    mesh.skeleton.update();
    const origin=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),0);
    const at=(p:THREE.Vector3)=>body.worldToLocal(mesh.localToWorld(mesh.applyBoneTransform(0,p)));
    const start=at(origin.clone());
    const direction=(v:THREE.Vector3)=>at(origin.clone().add(v)).sub(start).normalize();
    const side=right?'Left':'Right';
    const elbow=body.worldToLocal(model.getObjectByName(side+'ForeArm')!.getWorldPosition(new THREE.Vector3()));
    const joint=body.worldToLocal(model.getObjectByName(side+'Hand')!.getWorldPosition(new THREE.Vector3()));
    const forearm=joint.clone().sub(elbow).normalize();
    const inward=mesh.userData.palmBasis==='inward';
    return {forearm,joint,palm:direction(inward?new THREE.Vector3(right?-1:1,0,0):new THREE.Vector3(0,0,-1)),thumb:direction(inward?new THREE.Vector3(0,0,1):new THREE.Vector3(right?-1:1,0,0)),fingers:direction(new THREE.Vector3(0,-1,0))};
  };
  root.userData.setImportedPalette=(p:AvatarPalette)=>{wearingCap=Boolean(p.cap);outfit=topOutfit(p.top);refreshVisibility();for(const key of Object.keys(uniforms))uniforms[key].value.set(p[key as keyof AvatarPalette]??'#3c434f');};
  root.userData.importedAvatar={source:'avatars1.blend',triangles:meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3,0),meshes};
  root.userData.sculptRuntime.parts=Object.fromEntries(meshes.map(m=>[m.userData.componentId,[m]]));
  return rig;
}

export function syncImportedAvatars(scene:THREE.Object3D):void {
  scene.traverse(o=>{if(o.userData.syncImportedAvatar)o.userData.syncImportedAvatar();});
}
