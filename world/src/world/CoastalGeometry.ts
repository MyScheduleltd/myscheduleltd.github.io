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
    // Fascia and soffit close the roof volume; distant eaves never read as floating sheets.
    const a=[rim[i][0],-.55,rim[i][2]],b=[rim[j][0],-.55,rim[j][2]];
    p.push(...rim[i],...rim[j],...a,...rim[j],...b,...a);
    p.push(...a,...b,0,-.55,0);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.computeVertexNormals();return g;
}

/** Open touring car: the cabin is a void, with separate sills, cushions and footwells. */
export const CONVERTIBLE = { width:3.6, length:5.6, cushionTop:.86, footFloor:.38, seatX:-.85, seatZ:.45 } as const;
export function createCoastalSedan(color:number):THREE.Group {
  const car=new THREE.Group();car.name='Drive Thru 88 convertible';
  const paint=coastalMaterial(color),trim=coastalMaterial(0x353a3a),cloth=coastalMaterial(0xb6a78c);
  const tyre=coastalMaterial(0x242a29),chrome=coastalMaterial(0x999f99);
  const box=(name:string,s:[number,number,number],at:[number,number,number],m:THREE.Material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...s),m);mesh.name=name;mesh.position.set(...at);car.add(mesh);return mesh;
  };
  box('floorpan',[3.4,.16,5.35],[0,.30,0],trim);
  box('bonnet',[3.6,.66,1.4],[0,.81,-2.1],paint);
  box('boot',[3.6,.66,.8],[0,.81,2.4],paint);
  for(const x of [-1.7,1.7]){
    box('door-sill',[.2,.75,3.4],[x,.835,.3],paint);
    box('door-lining',[.09,.5,2.9],[x*.93,.89,.3],cloth);
    box('armrest',[.16,.12,.8],[x*.9,1.14,.35],trim);
    box('door-handle',[.04,.055,.27],[x*1.065,1.08,.4],chrome);
    box('mirror',[.28,.18,.28],[x*1.1,1.37,-1.24],paint);
  }
  box('dashboard',[3.1,.28,.38],[0,1.12,-1.3],trim);
  box('instrument-panel',[.64,.19,.025],[-.85,1.17,-1.095],chrome);
  for(const x of [-1.04,-.77]){
    const gauge=new THREE.Mesh(new THREE.CircleGeometry(.065,8),tyre);gauge.position.set(x,1.17,-1.077);car.add(gauge);
  }
  box('console',[.27,.42,1.5],[0,.59,-.2],trim);
  box('gear-lever',[.06,.2,.06],[0,.90,-.4],chrome);
  for(const x of [-.85,.85]){
    const cushion=box(x<0?'driver-cushion':'passenger-cushion',[1.38,.22,1.15],[x,.75,.45],cloth);
    box('seat-back',[1.38,1.0,.20],[x,1.31,1.02],cloth).rotation.x=-.08;
    box('headrest',[.65,.3,.20],[x,1.91,1.1],cloth);
    for(const dx of [-.45,0,.45])box('upholstery-seam',[.018,.012,.9],[x+dx,.866,.45],trim);
    if(x<0)car.userData.cushion=cushion;
  }
  box('folded-soft-top',[3.0,.23,.45],[0,1.22,1.83],trim);
  // Low, raked windshield leaves seated eye lines above its top rail.
  const glass=new THREE.MeshStandardMaterial({color:0x9bbdb9,transparent:true,opacity:.23,roughness:.65,depthWrite:false,side:THREE.DoubleSide});
  box('windscreen',[3.13,.72,.035],[0,1.54,-1.50],glass).rotation.x=-.23;
  for(const x of [-1.6,1.6])box('windscreen-pillar',[.09,.78,.10],[x,1.54,-1.50],chrome).rotation.x=-.23;
  box('windscreen-rail',[3.28,.085,.10],[0,1.91,-1.585],chrome);
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(.24,.035,5,12),trim);
  wheel.name='steering-wheel';wheel.position.set(-.85,1.28,-.91);wheel.rotation.x=-.35;car.add(wheel);
  for(const x of [-1.72,1.72])for(const z of [-1.85,1.85]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.26,8),tyre);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.47,z);car.add(wheel);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.28,8),chrome);hub.rotation.z=Math.PI/2;hub.position.copy(wheel.position);car.add(hub);
  }
  for(const z of [-2.82,2.82]){
    box('bumper',[3.65,.16,.12],[0,.58,z],chrome);
    for(const x of [-1.23,1.23])box('lamp',[.57,.21,.07],[x,.94,z],coastalMaterial(z<0?0xe5cf95:0x9f4035));
  }
  car.traverse(o=>{o.userData.coastalAuthored=true;});return car;
}
