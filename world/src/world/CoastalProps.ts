import * as THREE from 'three';
import { clothLoft, coastalMaterial } from './CoastalAvatar';

const cream=coastalMaterial(0xe0d4b8), red=coastalMaterial(0x9e4b3c), green=coastalMaterial(0x3b554b);
const gold=coastalMaterial(0xb69b60), dark=coastalMaterial(0x42473d);
function piece(parent:THREE.Object3D,name:string,geometry:THREE.BufferGeometry,position:number[],material:THREE.Material){
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(position[0],position[1],position[2]);
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.coastalAuthored=true;mesh.userData.wornNoMasonry=true;parent.add(mesh);return mesh;
}
function box(p:THREE.Object3D,n:string,s:[number,number,number],at:number[],m:THREE.Material){return piece(p,n,new THREE.BoxGeometry(...s),at,m);}
function disc(p:THREE.Object3D,n:string,r:number,h:number,y:number,m:THREE.Material,rTop=r){return piece(p,n,new THREE.CylinderGeometry(rTop,r,h,12),[0,y,0],m);}

/** Origin is the grip at the centre of a tapered paper carton. */
export function createCoastalPopcorn():THREE.Group{
  const p=new THREE.Group();p.name='Striped popcorn carton';
  piece(p,'Folded paper carton',clothLoft([[-.36,.34,.34],[.34,.49,.49]]),[0,0,0],cream);
  for(const side of [-1,1])for(const x of [-.14,0,.14]){
    const stripe=box(p,'Printed red stripe',[.065,.62,.012],[x,0,side*.208],red);stripe.rotation.x=side*.106;
  }
  for(const side of [-1,1])box(p,'Rolled paper rim',[.51,.035,.025],[0,.35,side*.244],cream);
  for(const side of [-1,1])box(p,'Rolled paper rim side',[.025,.035,.51],[side*.244,.35,0],cream);
  // Kernels nest into the mouth, with an irregular silhouette instead of a solid lid.
  for(let n=0;n<18;n++){
    const a=n*2.39996,r=.19*Math.sqrt(n/18);
    const kernel=piece(p,'Popped kernel '+n,new THREE.IcosahedronGeometry(.082+(n%3)*.009,0),[Math.cos(a)*r,.36+.07*(1-r/.22)+(n%2)*.024,Math.sin(a)*r],cream);
    kernel.rotation.set(n*.7,n*.4,n*.2);
  }
  return p;
}

export function createCoastalDrink():THREE.Group{
  const p=new THREE.Group();p.name='Festival drink cup';
  piece(p,'Enamel paper cup',new THREE.CylinderGeometry(.20,.145,.55,10),[0,0,0],green);
  piece(p,'Cream sleeve',new THREE.CylinderGeometry(.185,.163,.22,10),[0,-.025,0],cream);
  disc(p,'Cup foot',.15,.025,-.278,cream);
  disc(p,'Rolled rim',.211,.035,.283,cream);
  disc(p,'Drink surface',.184,.014,.279,coastalMaterial(0x9d603c));
  const from=new THREE.Vector3(.095,.31,-.05),to=new THREE.Vector3(.075,.594,-.24);
  const straw=box(p,'Angled paper straw',[.027,from.distanceTo(to),.027],from.clone().add(to).multiplyScalar(.5).toArray(),cream);
  straw.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());
  box(p,'Red sleeve label',[.075,.10,.015],[0,-.025,.178],red);
  return p;
}

/** A weight-bearing lotus pedestal, folded robe, seated figure and fitted crown. */
export function createCoastalDeity():THREE.Group{
  const p=new THREE.Group();p.name='Seated gilded temple statue';
  disc(p,'Stone pedestal foot',2.03,.20,.10,dark);
  disc(p,'Lotus core',1.82,.44,.42,gold,1.63);
  for(let n=0;n<12;n++){
    const a=n*Math.PI/6;
    const petal=piece(p,'Carved lotus petal '+n,clothLoft([[0,.24,.18],[.18,.60,.30],[.40,.42,.25],[.53,.04,.08]]),[Math.sin(a)*1.61,.17,Math.cos(a)*1.61],gold);
    petal.rotation.y=a;
  }
  disc(p,'Lotus seat',1.67,.14,.68,gold);
  piece(p,'Continuous folded robe',clothLoft([[.73,2.75,1.85,.10],[1.05,3.0,1.75,.12],[1.38,2.30,1.35],[1.75,1.65,1.10,-.08],[2.75,1.45,1.05,-.10],[3.12,1.12,.83,-.12]]),[0,0,0],gold);
  for(const side of [-1,1]){
    const sleeve=piece(p,'Draped sleeve '+side,clothLoft([[0,.72,.88],[.55,.62,.72],[1.3,.52,.62],[1.48,.37,.45]]),[side*.79,1.52,-.03],gold);sleeve.rotation.z=side*.14;
    const hand=piece(p,'Hand resting in lap '+side,clothLoft([[0,.42,.40],[.16,.47,.45],[.28,.35,.35]]),[side*.26,1.56,.61],gold);hand.rotation.z=side*.2;
    const fold=piece(p,'Raised robe fold '+side,clothLoft([[0,.11,.065],[.72,.08,.05],[1.22,.025,.025]]),[side*.39,1.65,.51],cream);fold.rotation.z=side*-.19;
  }
  piece(p,'Neck',clothLoft([[0,.48,.46],[.36,.46,.43]]),[0,3.0,-.10],gold);
  piece(p,'Faceted face',clothLoft([[0,.56,.52],[.16,.90,.72],[.52,1.08,.79],[.89,.91,.74],[1.01,.67,.57]]),[0,3.20,-.07],gold);
  for(const side of [-1,1]){
    piece(p,'Ear '+side,new THREE.IcosahedronGeometry(.18,0),[side*.53,3.66,-.04],gold);
    box(p,'Closed eye '+side,[.16,.035,.025],[side*.23,3.74,.333],dark);
    box(p,'Brow '+side,[.20,.035,.025],[side*.23,3.89,.318],dark).rotation.z=side*-.10;
  }
  piece(p,'Nose',clothLoft([[0,.13,.12],[.17,.065,.045]]),[0,3.59,.35],gold);
  box(p,'Quiet smile',[.17,.025,.02],[0,3.48,.304],dark);
  piece(p,'Fitted hair crown',clothLoft([[0,1.06,.84],[.23,1.02,.81],[.39,.69,.58]]),[0,4.06,-.07],dark);
  disc(p,'Crown band',.51,.14,4.39,gold);
  piece(p,'Crown crest',clothLoft([[0,.70,.54],[.23,.61,.46],[.46,.32,.31],[.70,.08,.10]]),[0,4.44,-.07],gold);
  return p;
}



