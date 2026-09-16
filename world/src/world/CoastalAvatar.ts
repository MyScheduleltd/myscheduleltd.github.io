import * as THREE from 'three';
import type { AvatarPalette, AvatarColourSlot, AvatarRig } from './FestivalWorld';
import { addAvatarAccessories } from './AvatarAccessories';
import { wardrobeTexture, wardrobePatch } from './CoastalWardrobe';
import { assembleCoastalParts } from './CoastalParts';

/** Deliberate light bands, retaining the world's coloured ambient and night lights. */
export function coastalMaterial(color: THREE.ColorRepresentation, diffuseGain = 1): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  mat.userData.wornNoMasonry = true;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      `totalDiffuse *= ${diffuseGain.toFixed(3)};
       float coastalLuma = max(dot(totalDiffuse, vec3(0.2126, 0.7152, 0.0722)), 0.001);
       float coastalBand = floor(coastalLuma * 5.0 + 0.5) / 5.0;
       totalDiffuse *= mix(1.0, max(0.10, coastalBand) / coastalLuma, 0.42);
       vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;`,
    );
  };
  mat.customProgramCacheKey = () => 'coastal-soft-cel-v2:' + diffuseGain;
  return mat;
}

const faceMaps=new Map<number,THREE.MeshStandardMaterial>();
function neighbourhoodFace(variant:number):THREE.MeshStandardMaterial {
  if(faceMaps.has(variant))return faceMaps.get(variant)!;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const c=canvas.getContext('2d')!;
  c.fillStyle='#292e30';c.fillRect(14,15,8,16);c.fillRect(42,15+(variant%2),8,16);
  c.fillStyle='#bc846e';c.fillRect(29,38,7,2);
  c.fillStyle='#ca9780';c.fillRect(8,32,5,2);c.fillRect(51,32,5,2);
  const map=new THREE.CanvasTexture(canvas);map.magFilter=THREE.NearestFilter;map.minFilter=THREE.NearestFilter;map.colorSpace=THREE.SRGBColorSpace;
  const m=coastalMaterial(0xffffff);m.map=map;m.transparent=true;m.alphaTest=.1;m.depthWrite=false;m.userData.wornNoGrain=true;
  faceMaps.set(variant,m);return m;
}

/** Eight-corner polygon rings create actual cloth volume and broad fold planes. */
export function clothLoft(rings: Array<[number, number, number, number?]>): THREE.BufferGeometry {
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  const outline = [[-.36,-.5],[.36,-.5],[.5,-.36],[.5,.36],[.36,.5],[-.36,.5],[-.5,.36],[-.5,-.36]];
  const min = Math.min(...rings.map(r => r[0])), height = Math.max(...rings.map(r => r[0])) - min;
  for (const [y,w,d,z=0] of rings) for (let j=0;j<=8;j++) {
    const pt=outline[j%8];vertices.push(pt[0]*w,y,pt[1]*d+z);uv.push(j/8,(y-min)/height);
  }
  for (let i=0;i<rings.length-1;i++) for (let j=0;j<8;j++) {
    const a=i*9+j,b=a+9;indices.push(a,b,a+1,a+1,b,b+1);
  }
  for (let j=1;j<7;j++) {indices.push(0,j,j+1);const o=(rings.length-1)*9;indices.push(o,o+j+1,o+j);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function createCoastalAvatar(parent: THREE.Group, palette: AvatarPalette, markPalette: boolean, board: THREE.Group): AvatarRig {
  const root=parent;
  const seed=Number.parseInt(palette.top.slice(1),16)+Number.parseInt(palette.bottoms.slice(1),16);
  const variant=seed%4, family=Number(parent.userData.wardrobeVariant??0); parent.userData.coastalCharacter=family;
  // Foot support moves the visible rig, never the network/collision origin.
  parent=new THREE.Group();parent.name='character-body';parent.scale.x=.94;root.add(parent);
  const materials=Object.fromEntries(['skin','hair','top','bottoms','swimwear'].map(slot =>
    [slot,coastalMaterial(palette[slot as AvatarColourSlot],slot==='skin'?1.2:1)])) as Record<AvatarColourSlot,THREE.MeshStandardMaterial>;
  for(const m of Object.values(materials)) m.userData.wornNoGrain=true;
  const ink=coastalMaterial(0x343a43), trim=coastalMaterial(0xd8d3c8);
  materials.top.map=wardrobeTexture('cotton');
  materials.bottoms.map=wardrobeTexture('denim');
  materials.bottoms.vertexColors=true;
  materials.hair.map=wardrobeTexture('hair');materials.hair.vertexColors=true;
  ink.map=wardrobeTexture('canvas');
  const joints: Record<string,THREE.Group>={};
  const joint=(name:string,at:[number,number,number],target:THREE.Object3D) => {
    const g=new THREE.Group();g.name=name;g.position.set(...at);target.add(g);joints[name]=g;return g;
  };
  const part=(name:string,g:THREE.BufferGeometry,at:[number,number,number],target:THREE.Object3D,slot:AvatarColourSlot|THREE.Material) => {
    const m=new THREE.Mesh(g,typeof slot==='string'?materials[slot]:slot);m.name=name;m.position.set(...at);target.add(m);
    if(slot==='hair'){const tone=.86+((name.length*7+name.charCodeAt(name.length-1))%6)*.04;g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*3).fill(tone),3));}
    if(slot==='bottoms')g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*3).fill(name.startsWith('cargo-')?.80:1),3));
    m.castShadow=true;m.receiveShadow=true;m.userData.coastalAuthored=true;m.userData.componentId=name;m.userData.explodeWithParent=true;
    if(markPalette&&typeof slot==='string')m.userData.paletteSlot=slot;return m;
  };
  const box=(name:string,size:[number,number,number],at:[number,number,number],target:THREE.Object3D,slot:AvatarColourSlot|THREE.Material)=>part(name,new THREE.BoxGeometry(...size),at,target,slot);
  const loft=(name:string,r:Array<[number,number,number,number?]>,at:[number,number,number],target:THREE.Object3D,slot:AvatarColourSlot|THREE.Material) => part(name,clothLoft(r),at,target,slot);
  loft('pelvis',[[1.05,.71,.42],[1.2,.78,.46],[1.36,.74,.44]],[0,0,0],parent,'bottoms');
  const spine=joint('spine',[0,1.25,0],parent);
  loft('torso',[[-.085,.72,.48],[.08,.76,.53],[.5,.68,.51],[.76,.69,.49],[.88,.55,.42]],[0,0,0],spine,'top');
  loft('hoodie-hem',[[-.085,.75,.515],[-.01,.76,.53]],[0,0,0],spine,'top');
  loft('hoodie-pocket',[[0,.50,.035],[.18,.57,.045],[.26,.39,.035]],[0,.15,.267],spine,'top');
  loft('neck',[[0,.25,.25],[.25,.27,.25]],[0,.81,0],spine,'skin');
  loft('hood',[[.48,.28,.15],[.62,.56,.27],[.80,.69,.34],[.96,.62,.34]],[0,0,-.23],spine,'top');
  const head=joint('head',[0,.88,0],spine);
  loft('head',[[.18,.59,.46],[.25,.72,.56],[.37,.81,.59],[.61,.79,.58],[.74,.57,.46]],[0,0,0],head,'skin');
  loft('hair',[[.65,.90,.67],[.77,.94,.69],[.86,.67,.56],[.90,.37,.34]],[0,0,-.025],head,'hair');
  loft('hair-back',[[.13,.55,.18],[.25,.78,.23],[.40,.86,.25],[.70,.90,.26]],[0,0,-.25],head,'hair');
  for(let n=0;n<5;n++)loft('fringe-nape-'+n,[[0,.08,.10],[.14,.18,.18],[.29,.19,.17]],[(n-2)*.14,.08+(n%2)*.035,-.29],head,'hair').rotation.z=(n-2)*.09;
  for(const side of [-1,1]) loft('ear-'+side,[[.25,.09,.15],[.43,.12,.17],[.48,.08,.14]],[side*.43,0,.015],head,'skin');
  part('face',new THREE.PlaneGeometry(.68,.65),[0,.37,.298],head,neighbourhoodFace(variant)).castShadow=false;
  // A layered, uneven fringe, with full side/rear volume rather than a helmet rim.
  for(let n=0;n<7;n++) {
    const x=(n-3)*.12,y=(n===0||n===6)?.43:n===3?.52:.59+(n%2)*.04;
    const lock=loft('fringe-'+n,[[0,.105,.13],[.11,.16,.18],[.22,.14,.15]],[x,y,.255],head,'hair');
    lock.rotation.z=(n-3)*-.045;
  }
  // Staggered, blunt hair clusters follow the back and side turnaround views.
  for(let row=0;row<2;row++)for(let n=0;n<7;n++){
    const x=(n-3)*.115,edge=Math.abs(n-3)/3;
    const lock=loft('fringe-back-layer-'+row+'-'+n,[[0,.085,.085],[.09,.13,.12],[.20,.13,.10]],
      [x,.20+row*.18+(n%2)*.035,-.37+edge*.045],head,'hair');
    lock.rotation.z=(n-3)*-.04;
  }
  for(const side of [-1,1])for(let n=0;n<3;n++) {
    const lock=loft('side-lock-'+side+'-'+n,[[0,.085,.10],[.12,.17,.18],[.23,.14,.15]],[side*(.46+n*.028),.32+(n%2)*.11,-.10+n*.10],head,'hair');lock.rotation.z=side*(.30+n*.08);
  }
  for(const side of [-1,1])for(let n=0;n<3;n++){
    const lock=loft('temple-hair-'+side+'-'+n,[[0,.12,.13],[.10,.17,.18],[.18,.14,.16]],[side*(.43+n*.023),.51+(n%2)*.055,.09-n*.15],head,'hair');
    lock.rotation.z=side*(.45+n*.06);
  }
  const rimGeometry=new THREE.TorusGeometry(.245,.085,4,10,Math.PI*1.5);rimGeometry.rotateZ(Math.PI*.75);rimGeometry.rotateX(Math.PI/2);
  part('hood-rim',rimGeometry,[0,.95,-.018],spine,'top');
  box('zipper',[.025,.70,.028],[0,.37,.263],spine,trim);
  for(const side of [-1,1])box('hood-cord-'+side,[.02,.28,.025],[side*.13,.82,.273],spine,trim);
  const arm=(side:number) => {
    const label=side<0?'l':'r',shoulder=joint('shoulder-'+label,[side*.29,.77,0],spine);
    loft('upper-arm-'+label,[[-.53,.31,.35],[-.36,.32,.36],[-.10,.28,.35],[.06,.23,.27]],[0,0,0],shoulder,'top');
    shoulder.rotation.z=side*.36;
    const elbow=joint('elbow-'+label,[0,-.5,0],shoulder);
    part('elbow-seam-'+label,new THREE.IcosahedronGeometry(.145,0),[0,0,0],elbow,family>=2?'skin':'top');
    loft('forearm-'+label,[[-.45,.24,.27],[-.36,.32,.34],[-.15,.37,.37],[.04,.31,.34]],[0,0,0],elbow,'top');
    loft('cuff-'+label,[[-.455,.245,.275],[-.375,.26,.29]],[0,0,.004],elbow,'top');
    const wrist=joint('wrist-'+label,[0,-.43,0],elbow);
    loft('hand-'+label,[[-.23,.13,.16],[-.15,.18,.20],[.04,.17,.18]],[0,0,0],wrist,'skin');
    box('thumb-'+label,[.07,.12,.095],[-side*.087,-.10,.065],wrist,'skin').rotation.z=side*.28;
    for(let n=0;n<3;n++){
      const finger=box('finger-'+label+'-'+n,[.043,.13,.09],[(n-1)*.048,-.215,.028],wrist,'skin');
      finger.rotation.x=-.18; // Slightly curled resting fingers, following the hand sheet.
    }
    return {shoulder,elbow,wrist};
  };
  const leg=(side:number) => {
    const label=side<0?'l':'r',hip=joint('hip-'+label,[side*.26,1.1,0],parent);
    loft('thigh-'+label,[[-.69,.37,.41],[-.46,.40,.44],[-.14,.40,.44],[.12,.37,.42]],[0,0,0],hip,'bottoms');
    hip.rotation.z=side*.035;
    box('cargo-flap-'+label,[.31,.30,.075],[side*.09,-.29,.238],hip,'bottoms');
    box('cargo-lip-'+label,[.32,.09,.08],[side*.09,-.145,.268],hip,'bottoms');
    for(const edge of [-1,1])box('cargo-bellows-'+label+'-'+edge,[.035,.24,.08],[side*.09+edge*.145,-.31,.24],hip,'bottoms');
    box('cargo-button-'+label,[.028,.027,.012],[side*.09,-.163,.312],hip,ink);
    const knee=joint('knee-'+label,[0,-.66,0],hip);
    part('knee-seam-'+label,new THREE.IcosahedronGeometry(.17,0),[0,0,0],knee,'bottoms');
    loft('shin-'+label,[[-.52,.33,.35],[-.43,.38,.39],[-.30,.47,.45],[-.15,.46,.44],[.04,.37,.41]],[0,0,0],knee,'bottoms');
    const ankle=joint('ankle-'+label,[0,-.52,0],knee);
    loft('shoe-'+label,[[-.15,.51,.65,.10],[-.02,.49,.62,.1],[.13,.31,.42,.01]],[0,0,0],ankle,ink);
    loft('sole-edge-'+label,[[-.20,.49,.64,.10],[-.17,.52,.67,.10],[-.13,.51,.66,.10]],[0,0,0],ankle,trim);
    loft('toe-cap-'+label,[[-.125,.49,.23],[-.045,.43,.21],[.005,.32,.14]],[0,0,.335],ankle,trim);
    box('shoe-tongue-'+label,[.22,.12,.16],[0,.13,.10],ankle,ink);
    for(const sidePanel of [-1,1])box('shoe-panel-'+label+'-'+sidePanel,[.025,.12,.24],[sidePanel*.229,-.025,.015],ankle,trim);
    box('shoe-heel-'+label,[.26,.16,.04],[0,.015,-.207],ankle,trim);
    box('shoe-pull-'+label,[.11,.12,.045],[0,.12,-.20],ankle,trim);
    for(const edge of [-1,1])for(let n=0;n<5;n++)box('sole-tread-'+label+'-'+edge+'-'+n,[.022,.047,.047],[edge*.252,-.165,-.16+n*.12],ankle,ink);
    for(let n=0;n<4;n++)for(const cross of [-1,1])box(n===0&&cross===-1?'laces-'+label:'lace-'+label+'-'+n+'-'+cross,[.19,.018,.02],[0,.134-n*.040,.232+n*.055],ankle,trim).rotation.y=cross*.32;
    return {hip,knee,ankle};
  };
  const left=arm(-1),right=arm(1),ll=leg(-1),rr=leg(1);
  if(family===0){
    const sleeve=coastalMaterial(palette.top); sleeve.userData.wornNoGrain=true; sleeve.map=wardrobeTexture('sleeve');
    for(const label of ['l','r']) (parent.getObjectByName('upper-arm-'+label) as THREE.Mesh).material=sleeve;
    loft('inner-collar',[[.80,.27,.27],[.91,.28,.28]],[0,0,0],spine,ink);
    part('chest-patch',new THREE.PlaneGeometry(.17,.15),[.19,.64,.261],spine,wardrobePatch('harbour'));
  }
  const treat=part('treat',new THREE.IcosahedronGeometry(.12,0),[0,-.15,.18],right.wrist,coastalMaterial(0xe0d4b8));treat.visible=false;
  addAvatarAccessories({head,torso:spine,leftArm:left.shoulder,rightArm:right.shoulder},palette,markPalette);
  // Preserve the existing cap toggle, replacing only its old box geometry.
  const cap=head.children.find(o=>o.userData.accessorySlot==='cap') as THREE.Group|undefined;
  if(cap){
    const material=(cap.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    material.map=wardrobeTexture('canvas');
    for(const child of [...cap.children]){if(child instanceof THREE.Mesh)child.geometry.dispose();cap.remove(child);}
    const crown=loft('cap',[[.64,.96,.82],[.79,.93,.79],[.98,.70,.61],[1.01,.42,.36]],[0,0,-.04],cap,material);
    const cp=crown.geometry.getAttribute('position');
    for(let i=0;i<cp.count;i++){if(cp.getY(i)<.65&&cp.getZ(i)>0)cp.setY(i,cp.getY(i)+.07*(1-Math.pow(cp.getX(i)/.48,2)));}
    crown.geometry.computeVertexNormals();
    const brimShape=new THREE.Shape();brimShape.moveTo(-.36,-.09);brimShape.lineTo(.36,-.09);brimShape.lineTo(.40,.04);brimShape.lineTo(.32,.22);brimShape.lineTo(.16,.28);brimShape.lineTo(-.16,.28);brimShape.lineTo(-.32,.22);brimShape.lineTo(-.40,.04);brimShape.closePath();
    const brim=new THREE.ExtrudeGeometry(brimShape,{depth:.027,bevelEnabled:true,bevelThickness:.009,bevelSize:.009,bevelSegments:1,steps:1});brim.rotateX(Math.PI/2);
    const bp=brim.getAttribute('position');for(let i=0;i<bp.count;i++)bp.setY(i,bp.getY(i)+.075*(1-Math.pow(bp.getX(i)/.40,2)));brim.computeVertexNormals();
    part('cap-brim',brim,[0,.676,.37],cap,material);
    part('cap-label',new THREE.PlaneGeometry(.18,.135),[0,.82,.356],cap,wardrobePatch('harbour')).rotation.x=-.42;
    part('cap-back-opening',new THREE.PlaneGeometry(.23,.12),[0,.775,-.462],cap,coastalMaterial(0x121716)).rotation.y=Math.PI;
    box('cap-back-strap',[.28,.045,.04],[0,.703,-.47],cap,material);
    const capStitch=coastalMaterial(0x66707a);
    for(const side of [-1,1]){
      const seam=box('cap-seam-'+side,[.016,.22,.018],[side*.245,.86,.29],cap,capStitch);seam.rotation.x=-.48;seam.rotation.z=side*.30;
      for(let n=0;n<3;n++)box('cap-brim-stitch-'+side+'-'+n,[.09,.006,.012],[side*(.06+n*.09),.692+.075*(1-Math.pow((.06+n*.09)/.40,2)),.48],cap,capStitch);
    }
    loft('cap-button',[[0,.07,.07],[.025,.055,.055]],[0,1.012,-.04],cap,material);
  }
  if(family!==0){
    for(const name of ['hood','hood-rim','hood-cord--1','hood-cord-1']){const piece=spine.getObjectByName(name);if(piece)piece.visible=false;}
    for(const side of [-1,1])box('shirt-collar-'+side,[.18,.14,.035],[side*.13,.79,.259],spine,'top').rotation.z=side*.34;
  }
  if(family===1){
    for(let n=0;n<4;n++)box('overshirt-button-'+n,[.035,.035,.018],[0,.19+n*.15,.287],spine,ink);
    for(const side of [-1,1])box('overshirt-pocket-'+side,[.20,.21,.03],[side*.19,.49,.27],spine,'top');
  }
  if(family===2||family===3){
    for(const label of ['l','r']){
      const upper=parent.getObjectByName('upper-arm-'+label) as THREE.Mesh;
      upper.geometry.dispose();upper.geometry=clothLoft([[-.34,.34,.36],[-.10,.37,.38],[.075,.27,.29]]);
      loft('bare-upper-'+label,[[-.53,.24,.26],[-.30,.27,.29]],[0,0,0],joints['shoulder-'+label],'skin');
      const forearm=parent.getObjectByName('forearm-'+label) as THREE.Mesh;
      forearm.geometry.dispose();forearm.geometry=clothLoft([[-.45,.17,.19],[-.28,.21,.23],[.04,.24,.26]]);forearm.material=materials.skin;
      const cuff=parent.getObjectByName('cuff-'+label);if(cuff)cuff.visible=false;
    }
    if(cap){
      cap.visible=true;
      const capMat=(cap.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      capMat.color.set(family===2?0x9a4e3d:0x4c7164);
      if(family===2){
        const brim=cap.getObjectByName('cap-brim');if(brim)brim.visible=false;
        loft('beanie-fold',[[.60,1.0,.84],[.75,1.0,.84]],[0,0,-.04],cap,capMat);
      }
    }
  }
  if(family===3){
    const apron=coastalMaterial(0x507367);
    loft('apron',[[-.29,.68,.036],[.25,.70,.035],[.76,.47,.035]],[0,0,.289],spine,apron);
    box('apron-pocket',[.37,.24,.025],[0,.14,.326],spine,apron);
    for(const side of [-1,1])box('apron-strap-'+side,[.065,.28,.029],[side*.21,.73,.303],spine,apron);
    part('apron-label',new THREE.PlaneGeometry(.20,.12),[0,.59,.311],spine,wardrobePatch('shop'));
    for(const name of ['bag','bag-flap','bag-label','bag-webbing','bag-webbing-lower','bag-webbing-back','strap-buckle']){const part=spine.getObjectByName(name);if(part)part.visible=false;}
  }
  for(const [label,wrist] of [['l',left.wrist],['r',right.wrist]] as const){
    const fist=loft('fist-'+label,[[-.25,.20,.23],[-.19,.27,.27],[-.04,.25,.26],[.015,.16,.17]],[0,0,0],wrist,'skin');fist.visible=false;
  }
  const parts=assembleCoastalParts(parent);
  // Swim clothing changes silhouette, retaining the same articulated skeleton.
  const swimMeshes:THREE.Mesh[]=[];
  const swim=(name:string,r:Array<[number,number,number,number?]>,at:[number,number,number],node:THREE.Object3D,slot:AvatarColourSlot)=>{
    const mesh=loft('swim-'+name,r,at,node,slot);mesh.visible=false;swimMeshes.push(mesh);
  };
  swim('vest',[[0,.66,.41],[.5,.62,.40],[.75,.57,.37],[.82,.40,.30]],[0,0,0],spine,'swimwear');
  swim('neck',[[.80,.24,.24],[1.05,.25,.24]],[0,0,0],spine,'skin');
  swim('waist',[[1.03,.70,.43],[1.33,.69,.42]],[0,0,0],parent,'swimwear');
  for(const [label,arm,leg] of [['l',left,ll],['r',right,rr]] as const){
    swim('arm-'+label,[[-.51,.21,.24],[0,.24,.27]],[0,0,0],arm.shoulder,'skin');
    swim('forearm-'+label,[[-.43,.16,.19],[0,.21,.24]],[0,0,0],arm.elbow,'skin');
    swim('shorts-'+label,[[-.37,.35,.38],[.1,.36,.40]],[0,0,0],leg.hip,'swimwear');
    swim('thigh-'+label,[[-.68,.24,.28],[-.36,.28,.31]],[0,0,0],leg.hip,'skin');
    swim('calf-'+label,[[-.52,.17,.20],[-.28,.24,.27],[.04,.24,.28]],[0,0,0],leg.knee,'skin');
    swim('foot-'+label,[[-.20,.27,.47,.09],[-.10,.29,.48,.09],[.07,.18,.24,0]],[0,0,0],leg.ankle,'skin');
  }
  const swimTrim=(name:string,size:[number,number,number],at:[number,number,number],node:THREE.Object3D)=>{
    const mesh=box('swim-trim-'+name,size,at,node,trim);mesh.visible=false;swimMeshes.push(mesh);
  };
  swimTrim('chest',[.48,.065,.026],[0,.60,.209],spine);
  swimTrim('drawstring',[.025,.13,.025],[.035,.02,.224],spine);
  for(const [label,leg] of [['l',ll],['r',rr]] as const)swimTrim('hem-'+label,[.31,.055,.026],[0,-.33,.195],leg.hip);
  root.userData.swimMeshes=swimMeshes;
  root.userData.festivalGarments=Object.entries(parts).filter(([id])=>!['head','hair','face','hand-l','hand-r','fist-l','fist-r'].includes(id)).flatMap(([,meshes])=>meshes.map(mesh=>({mesh,visible:mesh.visible})));
  const colliders=Object.fromEntries(Object.entries(joints).map(([id,node])=>[id,{node,type:'capsule',radius:id.includes('wrist')?.10:.20}]));
  root.userData.sculptRuntime={joints,sockets:{head,handLeft:left.wrist,handRight:right.wrist,footLeft:ll.ankle,footRight:rr.ankle},parts,colliders,visualRoot:parent,dimensions:{thigh:.66,shin:.52,soleBottom:-.20,eyeHeight:2.59},breakable:false};
  return {visualRoot:parent,leftArm:left.shoulder,rightArm:right.shoulder,leftLeg:ll.hip,rightLeg:rr.hip,leftElbow:left.elbow,rightElbow:right.elbow,leftKnee:ll.knee,rightKnee:rr.knee,leftWrist:left.wrist,rightWrist:right.wrist,leftAnkle:ll.ankle,rightAnkle:rr.ankle,head,torso:spine,treat,board,get headTop(){return (cap?.visible?3.14:3.05)+parent.position.y;}};
}

export function setCoastalSwimwear(root:THREE.Object3D,active:boolean):void {
  root.userData.setImportedSwimwear?.(active);
  const wasActive=Boolean(root.userData.wearingSwimwear);
  for(const garment of root.userData.festivalGarments??[]){
    if(active&&!wasActive)garment.visible=garment.mesh.visible;
    if(active)garment.mesh.visible=false;
    else if(wasActive)garment.mesh.visible=garment.visible;
  }
  for(const mesh of root.userData.swimMeshes??[])mesh.visible=active;
  root.userData.wearingSwimwear=active;
}
