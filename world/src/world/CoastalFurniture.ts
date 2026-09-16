import * as THREE from 'three';
import { coastalMaterial } from './CoastalAvatar';

/** Shared joinery and equipment palette for both music venues. Front is +Z. */
const palette=()=>({wood:coastalMaterial(0x80634c),green:coastalMaterial(0x354d47),cream:coastalMaterial(0xcfc5ad),metal:coastalMaterial(0x555e58),dark:coastalMaterial(0x232c2b),red:coastalMaterial(0xa75647)});
function builder(name:string) {
  const group=new THREE.Group();group.name=name;
  const box=(name:string,s:[number,number,number],p:[number,number,number],m:THREE.Material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...s),m);mesh.name=name;mesh.position.set(...p);mesh.userData.wornNoMasonry=true;group.add(mesh);return mesh;
  };
  const disc=(name:string,r:number,depth:number,p:[number,number,number],m:THREE.Material,front=false)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,depth,12),m);mesh.name=name;mesh.position.set(...p);if(front)mesh.rotation.x=Math.PI/2;mesh.userData.wornNoMasonry=true;group.add(mesh);return mesh;
  };
  return {group,box,disc};
}
export function createCoastalDecks(width=5.7):THREE.Group {
  const {group,box,disc}=builder('Timber DJ console'),m=palette();
  box('recessed-plinth',[width-.45,.16,.95],[0,.08,.25],m.dark);
  box('joinery-cabinet',[width-.3,1.08,1.05],[0,.7,.25],m.wood);
  box('enamel-front',[width-.6,.78,.06],[0,.71,.8],m.green);
  for(const x of [-1,1])box('corner-trim',[.12,1.1,1.15],[x*(width/2-.16),.71,.25],m.cream);
  for(let i=0;i<11;i++)box('front-vent',[.035,.5,.035],[(i-5)*(width-.9)/11,.66,.843],m.wood);
  box('worktop',[width,.14,1.6],[0,1.31,.15],m.cream);
  for(const side of [-1,1]){
    const x=side*width*.27;
    box('turntable',[1.45,.1,1.4],[x,1.43,0],m.green);
    disc('platter',.49,.07,[x,1.515,0],m.dark);disc('record-label',.13,.015,[x,1.558,0],m.cream);
    box('tonearm',[.035,.05,.58],[x+.48,1.55,-.03],m.metal);
    box('start-button',[.13,.04,.13],[x-.52,1.51,.49],m.red);
  }
  box('mixer',[.82,.12,1.3],[0,1.44,0],m.dark);
  for(const x of [-.24,0,.24])for(const z of [-.35,-.1,.2])box('mixer-knob',[.08,.09,.08],[x,1.55,z],m.cream);
  for(const x of [-.24,0,.24])box('fader',[.08,.05,.18],[x,1.535,.45],m.red);
  return group;
}
export function createCoastalSpeaker(width:number,height:number,depth:number):THREE.Group {
  const {group,box,disc}=builder('Enamel framed speaker'),m=palette();
  box('cabinet',[width,height,depth],[0,height/2,0],m.wood);
  box('baffle',[width-.18,height-.2,.08],[0,height/2,depth/2+.025],m.dark);
  for(const y of [.1,height-.1])box('edge-rail',[width,.13,.12],[0,y,depth/2+.065],m.green);
  for(const x of [-width/2+.07,width/2-.07])box('edge-upright',[.14,height,.12],[x,height/2,depth/2+.065],m.green);
  disc('woofer-surround',width*.34,.08,[0,height*.34,depth/2+.08],m.metal,true);
  disc('woofer',width*.28,.1,[0,height*.34,depth/2+.13],m.dark,true);
  disc('dust-cap',width*.11,.11,[0,height*.34,depth/2+.15],m.green,true);
  box('horn',[width*.54,height*.17,.08],[0,height*.77,depth/2+.08],m.metal);
  box('horn-opening',[width*.4,height*.10,.09],[0,height*.77,depth/2+.12],m.dark);
  for(const x of [-1,1])box('rubber-foot',[width*.16,.1,depth*.7],[x*width*.32,.05,0],m.dark);
  return group;
}
export function createCoastalJukebox():THREE.Group {
  const {group,box,disc}=builder('Record selector cabinet'),m=palette();
  box('founded-plinth',[2.4,.5,1.5],[0,-.05,0],m.dark);
  box('timber-case',[2.2,2.85,1.3],[0,1.6,0],m.wood);
  box('enamel-face',[1.96,2.5,.1],[0,1.62,.69],m.green);
  box('cream-header',[2.3,.24,1.4],[0,3.12,0],m.cream);
  box('selector-window',[1.68,.85,.08],[0,2.2,.77],m.dark);
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
    box('record-title',[.42,.16,.025],[(col-1)*.5,2.45-row*.24,.825],m.cream);
    box('selection-key',[.14,.08,.045],[(col-1)*.5,1.59-row*.13,.83],m.red);
  }
  disc('speaker-grille',.52,.08,[0,.73,.79],m.dark,true);
  for(let i=0;i<7;i++)box('speaker-louvre',[1.42,.045,.08],[0,.46+i*.11,.86],m.cream);
  for(const x of [-1,1])box('side-trim',[.09,2.75,.09],[x*1.02,1.65,.76],m.cream);
  box('coin-slot',[.25,.055,.055],[.63,1.72,.84],m.dark);
  return group;
}
