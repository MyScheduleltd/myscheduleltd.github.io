import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Details share their garment's identity; different articulated parts stay separate. */
function component(name:string):string {
  if(name==='hair-back'||name.startsWith('fringe-')||name.startsWith('side-lock-'))return 'hair';
  if(name.startsWith('ear-'))return 'head';
  if(['neck','zipper','inner-collar','chest-patch'].includes(name)||name.startsWith('overshirt-')||name.startsWith('shirt-collar-'))return 'torso';
  if(name.startsWith('hoodie-'))return 'torso';
  if(name.startsWith('hood-'))return 'hood';
  if(name.startsWith('bag-')||name==='strap-buckle')return 'bag';
  if(name.startsWith('cap-')||name==='beanie-fold')return 'cap';
  if(name.startsWith('apron-'))return 'apron';
  for(const side of ['l','r']){
    if(name==='thumb-'+side||name.startsWith('finger-'+side+'-'))return 'hand-'+side;
    if(name==='cuff-'+side||name==='elbow-seam-'+side)return 'forearm-'+side;
    if(name==='knee-seam-'+side)return 'shin-'+side;
    if(name==='cargo-lip-'+side||name.startsWith('cargo-bellows-'+side)||name==='cargo-button-'+side)return 'cargo-flap-'+side;
    if(name==='shoe-tongue-'+side||name==='shoe-pull-'+side)return 'shoe-'+side;
    if(name.startsWith('shoe-panel-'+side)||name==='shoe-heel-'+side)return 'shoe-'+side;
    if(name==='toe-cap-'+side||name.startsWith('sole-tread-'+side))return 'sole-edge-'+side;
    if(name.startsWith('lace-'+side+'-'))return 'laces-'+side;
  }
  return name;
}

/** Batch only within one joint, component, material and visibility/palette contract. */
export function assembleCoastalParts(root:THREE.Object3D):Record<string,THREE.Mesh[]> {
  const batches=new Map<string,THREE.Mesh[]>();
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    if(!object.name){
      const group=object.parent!,slot=group.userData.accessorySlot??'detail';
      object.name=`${slot}-${group.parent?.name??'body'}-${group.children.indexOf(object)}`;
    }
    const slot=object.parent?.userData.accessorySlot;
    const id=slot&&slot!=='cap'?`${slot}-${object.parent?.parent?.name??'body'}`:component(object.name);
    object.userData.componentId=id;object.userData.explodeWithParent=true;
    const material=object.material;
    const key=[object.parent?.uuid,id,Array.isArray(material)?object.uuid:material.uuid,object.visible,object.userData.paletteSlot??'',object.castShadow,object.receiveShadow].join('|');
    (batches.get(key)??(batches.set(key,[]),batches.get(key)!)).push(object);
  });
  const parts:Record<string,THREE.Mesh[]>={};
  for(const meshes of batches.values()){
    let mesh=meshes[0];
    let built=meshes;
    if(meshes.length>1&&meshes.every(m=>m.children.length===0)){
      const geometry=meshes.map(m=>{
        m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrix);
        if(!g.hasAttribute('uv'))g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
        return g;
      });
      const merged=mergeGeometries(geometry);geometry.forEach(g=>g.dispose());
      if(merged){
        const first=mesh,parent=first.parent!;
        mesh=new THREE.Mesh(merged,first.material);mesh.name=first.userData.componentId;
        mesh.userData={...first.userData,detailNames:meshes.map(m=>m.name)};
        mesh.visible=first.visible;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;
        parent.add(mesh);for(const old of meshes){parent.remove(old);old.geometry.dispose();}
        built=[mesh];
      }
    }
    for(const part of built)(parts[part.userData.componentId]??=[]).push(part);
  }
  return parts;
}
