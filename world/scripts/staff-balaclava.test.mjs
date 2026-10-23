import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStaffBalaclavaGeometry, STAFF_MASK_OPENINGS, staffMaskOpeningShader } from '../src/world/StaffBalaclava.ts';

test('the actual hood surface has two separate eye holes and a small mouth hole, with solid cloth between them', () => {
  const geometry=createStaffBalaclavaGeometry(point=>point);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);
  const first=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,.8),new THREE.Vector3(0,0,-1)).intersectObject(mesh,false)[0]?.point.z;
  for(const hole of STAFF_MASK_OPENINGS){
    for(const offset of [-.4,0,.4])assert.ok(first(hole.x+hole.rx*offset,hole.y)<.02,hole.id+' must see through the real front cloth, not a painted visor');
  }
  for(const [x,y]of[[0,.512],[.118,.512],[0,.606],[.08,.429]])assert.ok(first(x,y)>.15,'cloth remains over bridge, cheeks, crown and mouth sides');
  assert.ok(geometry.index.count/3<400);mesh.material.dispose();geometry.dispose();
});

test('the crown has native head proportions and carries clean outward-facing planes', () => {
  const geometry=createStaffBalaclavaGeometry(point=>point);
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.y>size.x,'a head-height crown replaces the short wide ellipsoid');
  assert.ok(size.z<.36&&size.x<.31,'the cloth stays close to the native face');
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
  for(let i=0;i<positions.count;i++)for(const axis of ['X','Y','Z'])assert.ok(Number.isFinite(normals['get'+axis](i)));
  geometry.dispose();
});

test('aperture coordinates are shared exactly with the native-body shader mask', () => {
  const expression=staffMaskOpeningShader('face');
  for(const hole of STAFF_MASK_OPENINGS){assert.ok(expression.includes(hole.x.toFixed(3)));assert.ok(expression.includes(hole.y.toFixed(3)));assert.ok(expression.includes(hole.rx.toFixed(3)));}
  assert.ok(expression.includes('face.z>.119'));
});
