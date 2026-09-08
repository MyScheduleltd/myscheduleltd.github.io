import * as THREE from 'three';
import { coastalMaterial } from './CoastalAvatar';

/** Hipped tiles meet a raised ridge; the eave corners turn up without detached blocks. */
export function coastalRoof(width: number, depth: number, rise: number): THREE.BufferGeometry {
  const rim = [
    [-width/2,.45,-depth/2], [0,0,-depth/2], [width/2,.45,-depth/2],
    [width/2,0,0], [width/2,.45,depth/2], [0,0,depth/2],
    [-width/2,.45,depth/2], [-width/2,0,0],
  ];
  const crown = [
    [-width*.28,rise,-depth*.28], [0,rise,-depth*.28], [width*.28,rise,-depth*.28],
    [width*.28,rise,0], [width*.28,rise,depth*.28], [0,rise,depth*.28],
    [-width*.28,rise,depth*.28], [-width*.28,rise,0],
  ];
  const p: number[] = [];
  for(let i=0;i<8;i++){
    const j=(i+1)%8;
    p.push(...rim[i],...crown[i],...rim[j],...rim[j],...crown[i],...crown[j]);
    p.push(...crown[i],0,rise,0,...crown[j]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.computeVertexNormals();return g;
}

/** Boxy eighties sedan proportions, pitched windscreen, round low-sided wheels. */
export function createCoastalSedan(color: number): THREE.Group {
  const car=new THREE.Group();car.name='Festival sedan';
  const paint=coastalMaterial(color),glass=coastalMaterial(0x4c686c);
  const tyre=coastalMaterial(0x282e2d),chrome=coastalMaterial(0xa0a496);
  const lamps=coastalMaterial(0xe5cf95),red=coastalMaterial(0x9f4035);
  const box=(s:[number,number,number],at:[number,number,number],m:THREE.Material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...s),m);mesh.position.set(...at);car.add(mesh);return mesh;
  };
  box([2.8,.74,4.6],[0,.85,0],paint);
  box([2.65,.2,4.25],[0,1.28,0],paint);
  const cabin=new THREE.BoxGeometry(2.42,.88,2.35);
  const positions=cabin.getAttribute('position');
  for(let i=0;i<positions.count;i++) if(positions.getY(i)>0){
    positions.setX(i,positions.getX(i)*.87);
    positions.setZ(i,positions.getZ(i)*.67+.12);
  }
  cabin.computeVertexNormals();
  const windows=new THREE.Mesh(cabin,glass);windows.position.set(0,1.82,-.32);car.add(windows);
  box([2.17,.12,1.62],[0,2.31,-.20],paint);
  for(const x of [-1.215,1.215]) {
    box([.065,.83,.11],[x,1.82,-.17],paint);
    box([.08,.06,.34],[x*1.13,1.22,.42],chrome);
  }
  for(const x of [-1.38,1.38]) for(const z of [-1.4,1.4]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.26,8),tyre);
    wheel.rotation.z=Math.PI/2;wheel.position.set(x,.47,z);car.add(wheel);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.28,8),chrome);
    hub.rotation.z=Math.PI/2;hub.position.copy(wheel.position);car.add(hub);
  }
  for(const z of [-2.32,2.32]){
    box([2.84,.16,.16],[0,.58,z],chrome);
    for(const x of [-.98,.98])box([.49,.21,.08],[x,.99,z],z<0?lamps:red);
  }
  box([.78,.16,.05],[0,.98,-2.36],tyre);
  car.traverse(o=>{o.userData.coastalAuthored=true;});
  return car;
}
