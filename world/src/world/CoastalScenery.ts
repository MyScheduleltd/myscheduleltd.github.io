import * as THREE from 'three';
import { coastalMaterial } from './CoastalAvatar';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HILL_WALK, SHORE_GRADE, TEMPLE_GRADE, terrainHeightAt, createGroundRibbon, type PlanPoint } from './CoastalTerrain';

type Solid = (x:number,z:number,w:number,d:number,base:number,top:number,label:string)=>void;
type Clear = (x:number,z:number,radius:number)=>boolean;
const colours = {shell:0xc7baa0,red:0x863632,teal:0x52736a,concrete:0x928d7c,ink:0x303639,iron:0x5e6560,wood:0x72583d};

/** Shared authored materials and merged details keep silhouettes affordable on phones. */
export class CoastalScenery {
  private batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  readonly mats=Object.fromEntries(Object.entries(colours).map(([key,color])=>[
    key,coastalMaterial(color),
  ])) as Record<keyof typeof colours,THREE.MeshStandardMaterial>;
  private leaves=[0x52654a,0x6c7950,0x3d574b].map(color=>new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true,side:THREE.DoubleSide}));
  constructor(private scene:THREE.Scene,private solid:Solid,private clear:Clear){}
  private put(geometry:THREE.BufferGeometry,at:[number,number,number],mat:THREE.Material,rotation?:THREE.Euler):void {
    if(rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    geometry.translate(...at);
    const list=this.batches.get(mat)??[];list.push(geometry);this.batches.set(mat,list);
  }
  box(size:[number,number,number],at:[number,number,number],mat:THREE.Material,rotation?:THREE.Euler):void{
    this.put(new THREE.BoxGeometry(...size),at,mat,rotation);
  }
  private beam(a:THREE.Vector3,b:THREE.Vector3,width:number,mat:THREE.Material):void{
    const geometry=new THREE.CylinderGeometry(width,width,a.distanceTo(b),5);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));
    this.put(geometry,a.clone().add(b).multiplyScalar(.5).toArray() as [number,number,number],mat);
  }
  private sign(text:string,sub:string,at:[number,number,number],w:number,h:number,angle=0):void{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;
    const c=canvas.getContext('2d')!;c.fillStyle='#d2c4a8';c.fillRect(0,0,512,192);
    c.fillStyle='#84392f';c.fillRect(0,0,512,8);c.fillRect(0,184,512,8);
    c.textAlign='center';c.fillStyle='#303638';c.font='bold 54px sans-serif';c.fillText(text,256,90,470);
    c.font='24px sans-serif';c.fillText(sub,256,143,470);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.magFilter=THREE.NearestFilter;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    mesh.position.set(...at);mesh.rotation.y=angle;mesh.name=text;mesh.userData.coastalAuthored=true;this.scene.add(mesh);
  }
  private canopy(x:number,z:number,w:number,d:number,y:number):void{
    const angle=-.16;
    this.box([w,.18,d],[x,y,z],this.mats.teal,new THREE.Euler(angle,0,0));
    this.box([w,.55,.16],[x,y-.3,z+d*.49],this.mats.shell);
    for(const side of [-1,1]){
      const px=x+side*(w/2-.45),pz=z+d*.43,ground=terrainHeightAt(px,pz);
      this.box([.18,y-ground,.18],[px,(y+ground)/2,pz],this.mats.iron);
      this.solid(px,pz,.2,.2,ground,y,'canopy-post');
    }
  }
  buildTown():void{
    const m=this.mats;
    // Palace: an asymmetric old picture house, stepped crown and a supported marquee.
    for(const [x,w,h] of [[-44.4,3.2,12.4],[-35,15.5,11.1],[-25.5,3.1,10.2]] as const){
      this.box([w,h-8,1.2],[x,8+(h-8)/2,-31.6],m.shell);
      this.box([w+.3,.28,1.5],[x,h+.14,-31.6],m.red);
    }
    for(const x of [-45,-25]){
      this.box([1.3,8.1,2.1],[x,4.05,-31.7],m.shell);
      this.solid(x,-31.7,1.3,2.1,0,12,'palace-front-pier');
      this.box([1.45,1.8,2.2],[x,.9,-31.7],m.teal);
    }
    this.box([21.5,.55,4.2],[-35,6,-29.8],m.red);
    this.box([22,.22,4.5],[-35,6.39,-29.8],m.shell);
    for(const x of [-44,-26]){
      this.beam(new THREE.Vector3(x,0,-28.2),new THREE.Vector3(x,5.75,-28.2),.12,m.iron);
      this.solid(x,-28.2,.25,.25,0,6,'palace-marquee-support');
    }
    this.sign('皇宮戲院','MYSCHEDULE PICTURE HOUSE',[-35,9.45,-30.9],15,1.5);
    this.box([1.7,7.3,1.0],[-46,9.7,-30.7],m.red);
    this.sign('映畫','PALACE',[-46,10.25,-30.15],1.5,3.8);
    // Roof ridges are real geometry with supported end walls, not flat slabs.
    // Keep the auditorium open to the follow camera; its side parapets imply the roofline.
    this.box([.45,.45,18],[-45.5,10.25,-40],m.shell);
    this.box([.45,.45,18],[-24.5,10.25,-40],m.shell);
    // Shopfront: ceramic piers, striped cloth canopy, shutters and an authored floor grid.
    for(const x of [23,33.5,46.5,57]){
      this.box([.6,6.6,.65],[x,3.3,7.7],m.teal);
      this.solid(x,7.7,.6,.65,0,6.6,'shop-arcade-pier');
    }
    this.canopy(40,6.7,35,2.7,5.9);
    for(let i=0;i<18;i++) this.box([.95,.035,2.72],[23.5+i*1.9,6.025,6.7],m.shell,new THREE.Euler(-.16,0,0));
    this.sign('主理人商店','MASTER OF THE HOUSE',[40,6.7,7.28],15,.8,Math.PI);
    for(const x of [27,36,45,54]){
      this.box([6,3.9,.12],[x,3.4,44.1],m.teal);
      for(let row=0;row<7;row++)this.box([5.8,.08,.15],[x,1.7+row*.53,44.18],m.iron);
    }
    // Roof terrace: low planted corners and timber bench backs, clear of DJs/screens/routes.
    for(const x of [27,52]){
      this.box([3.7,.7,2],[x,7.35,40.7],m.shell);
      for(let i=0;i<3;i++)this.put(new THREE.IcosahedronGeometry(.8,0),[x-1+i,8.15,40.7],this.leaves[i]);
    }
    // Drive-In: a connected gatehouse and strong mechanical screen silhouette.
    this.box([4.2,3.5,3.3],[46,1.75,-17],m.shell);
    this.box([4.8,.32,4],[46,3.66,-17],m.red);
    this.box([3.6,1.2,.13],[46,2.25,-15.25],m.ink);
    this.solid(46,-17,4.2,3.3,0,4,'drive-in-ticket-booth');
    this.sign('88','汽車戲院',[46,4.8,-15.18],3.5,1.5);
    for(const x of [26,44]){
      this.beam(new THREE.Vector3(x,0,-40),new THREE.Vector3(x,9.5,-36.1),.15,m.iron);
      this.solid(x,-40,.6,.6,0,1,'screen-footing');
      this.box([1.8,.5,1.8],[x,.05,-40],m.concrete);
    }
    // Shore: tensioned cloth and timber footings, out of the film's viewing rectangle.
    for(const side of [-1,1]){
      const x=side*10.5;
      this.box([1.6,.6,1.6],[x,SHORE_GRADE+.1,-46],m.concrete);
      this.beam(new THREE.Vector3(x,SHORE_GRADE,-46),new THREE.Vector3(x,SHORE_GRADE+12.1,-46),.15,m.wood);
      this.beam(new THREE.Vector3(x,SHORE_GRADE+11,-46),new THREE.Vector3(x+side*4,terrainHeightAt(x+side*4,-50),-50),.035,m.iron);
      this.solid(x,-46,.6,.6,SHORE_GRADE,12,'shore-mast');
    }
    this.box([22,.25,.4],[0,SHORE_GRADE+12,-46],m.wood);
    // Temple cut has a substantial stone base. Return walls end before the approach.
    for(const z of [-17.7,25.7]){
      for(let x=76;x<110;x+=4){
        const base=terrainHeightAt(x,z)-.8;
        this.box([4,1.2,.75],[x,base+.6,z],m.concrete);
      }
    }
    this.sign('海風映畫祭','THE HILL WALK',[70, TEMPLE_GRADE+2.6,26.4],5,1.3);
    for(const x of [68,72]){
      this.box([.15,2.7,.15],[x,TEMPLE_GRADE+1.35,26.45],m.wood);
      this.solid(x,26.45,.18,.18,TEMPLE_GRADE,TEMPLE_GRADE+3,'hill-wayfinding');
    }
    // A few long-established neighbouring houses frame the arrival; each has its own roofline.
    for(const [x,z,w,d,h] of [[-39,65,17,14,8],[-66,65,19,13,10],[35,65,16,14,9],[62,66,17,12,7]] as const){
      const base=terrainHeightAt(x,z);
      this.box([w,h,d],[x,base+h/2,z],m.shell);
      this.solid(x,z,w,d,base,base+h,'inland-house');
      this.box([w+.8,.4,d+.8],[x,base+h+.2,z],m.teal);
      // Set masonry down to the lowest corner so the building is founded, not balanced on a point.
      const low=Math.min(...[-1,1].flatMap(a=>[-1,1].map(b=>terrainHeightAt(x+a*w/2,z+b*d/2))));
      this.box([w,base-low+.5,d],[x,(base+low)/2-.25,z],m.concrete);
      for(const dx of [-w*.3,0,w*.3]){
        this.box([2.5,2.8,.15],[x+dx,base+4.9,z-d/2-.08],m.teal);
        this.box([2.6,.18,.6],[x+dx,base+3.4,z-d/2-.3],m.concrete);
        this.box([.1,2.6,.1],[x+dx,base+4.9,z-d/2-.19],m.shell);
      }
      this.box([2.2,3.3,.15],[x,base+1.65,z-d/2-.12],m.wood);
    }
    // Gateway: low masonry pylons anchor the existing brand arch.
    for(const x of [-14,14]){
      const base=terrainHeightAt(x,62);
      this.box([2.3,4.8,2.1],[x,base+2.4,62],m.shell);
      this.box([2.5,.25,2.3],[x,base+4.92,62],m.red);
      this.solid(x,62,2.3,2.1,base,base+5,'gate-pylon');
    }
  }
  buildPlanting():void{
    const palms=[[-59,-25,7.3],[-69,-34,6.2],[-81,-28,8.2],[-56,-44,6],[-90,-46,5.8],
      [55,-24,7.2],[78,-47,6.4],[86,-39,8.2],[53,-49,5.6],[93,-50,7],[-43,56,7],[29,54,7.3]];
    for(const [x,z,h] of palms) if(this.clear(x,z,1)) this.palm(x,z,h);
    for(const [x,z,s] of [[-76,-19,1.2],[-86,-9,1],[-12,57,1],[66,42,1.3],[119,14,1.2],[113,-17,1],[-53,-54,.7],[89,-24,1]] ){
      if(!this.clear(x,z,1.5))continue;
      const base=terrainHeightAt(x,z),m=this.mats;
      this.put(new THREE.CylinderGeometry(.21*s,.43*s,5*s,6),[x,base+2.5*s,z],m.wood);
      this.solid(x,z,.85*s,.85*s,base,base+6*s,'coastal-almond-tree');
      for(let level=0;level<3;level++){
        const geometry=new THREE.IcosahedronGeometry(1,0);geometry.scale((3-level*.5)*s,.8*s,(2.5-level*.35)*s);
        geometry.rotateY(level*.6);this.put(geometry,[x+level*.3*s,base+(3.6+level*1.15)*s,z],this.leaves[level]);
      }
    }
    for(const [x,z,scale] of [[-103,-42,4],[-93,-51,2.7],[-87,-59,2],[-73,-50,1.7],[93,-57,3],[107,-50,4],[78,-55,1.6],[116,36,3],[-109,53,3]] ){
      const base=terrainHeightAt(x,z),g=new THREE.IcosahedronGeometry(1,0);
      g.scale(scale,scale*.62,scale*.8);g.rotateY(x*.1);g.rotateZ(.13);
      this.put(g,[x,base+scale*.18,z],this.mats.concrete);
      this.solid(x,z,scale*1.5,scale*1.3,base,base+scale*.7,'embedded-coastal-rock');
    }
    for(const [x,z] of [[-60,-27],[-73,-28],[-81,-35],[-62,-46],[-95,-31],[58,-39],[82,-44],[91,-36],[68,-49],[113,35],[73,40],[-107,45]]){
      if(!this.clear(x,z,2))continue;
      for(let i=0;i<9;i++){
        const px=x+Math.sin(i*2.4)*1.8,pz=z+Math.cos(i*2.4)*1.2,base=terrainHeightAt(px,pz);
        const g=new THREE.ConeGeometry(.19,.8+(i%3)*.25,3);g.rotateZ(.16*Math.sin(i));
        this.put(g,[px,base+.4,pz],this.leaves[i%3]);
      }
    }
  }
  private palm(x:number,z:number,height:number):void{
    const base=terrainHeightAt(x,z),lean=Math.sin(x*.3)*.9;
    let from=new THREE.Vector3(x,base-.15,z);
    for(let i=0;i<4;i++){
      const to=new THREE.Vector3(x+lean*((i+1)/4)**2,base+height*(i+1)/4,z+.22*(i+1));
      const g=new THREE.CylinderGeometry(.20-i*.02,.3-i*.02,from.distanceTo(to),6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize()));
      this.put(g,from.clone().add(to).multiplyScalar(.5).toArray() as [number,number,number],this.mats.wood);from=to;
    }
    for(let leaf=0;leaf<8;leaf++){
      const a=leaf*Math.PI/4+.21,length=3.1+(leaf%3)*.43,positions:number[]=[];
      const p=(t:number,side:number)=>{
        const spread=Math.sin(t*Math.PI)*.52*side;
        return [Math.cos(a)*length*t-Math.sin(a)*spread,.6*Math.sin(t*Math.PI)-t*t*.9,Math.sin(a)*length*t+Math.cos(a)*spread];
      };
      for(let s=0;s<4;s++){
        const a0=p(s/4,-1),a1=p(s/4,1),b0=p((s+1)/4,-1),b1=p((s+1)/4,1);
        positions.push(...a0,...a1,...b0,...a1,...b1,...b0);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
      // Every batch uses non-indexed geometry with position and normal only.
      this.put(g,from.toArray() as [number,number,number],this.leaves[leaf%3]);
    }
    this.solid(x,z,.7,.7,base,base+height,'bent-palm');
  }
  buildCirculation():void{
    const m=this.mats;
    const ribbon=(name:string,points:readonly PlanPoint[],width:number,mat:THREE.Material,lift=.04)=>{
      this.scene.add(createGroundRibbon(name,points,width,mat,lift));
    };
    ribbon('Arrival street',[[0,67],[0,24],[0,12]],12,m.ink);
    ribbon('Warehouse access street',[[-20,23.5],[-9,23.5],[0,24]],7,m.ink);
    ribbon('Drive-In access lane',[[0,56],[68,56],[68,0],[52,-12],[46,-12]],7,m.ink);
    ribbon('West pavement',[[-8.5,60],[-8.5,33],[-8.5,14]],3,m.shell);
    ribbon('East pavement',[[8.5,60],[8.5,24],[9,6],[9,-12],[0,-28]],4,m.shell);
    ribbon('Coastal promenade',[[-49,-19],[-35,-18],[0,-18],[35,-10],[50,-12]],5,m.shell);
    ribbon('Palace public approach',[[-35,-18],[-35,-30.8]],9,m.shell);
    ribbon('Ceremonial carpet · reception to Palace',[[-13,-13],[-35,-13],[-35,-31.4]],3.8,m.red,.075);
    ribbon('Warehouse forecourt walk',[[0,24],[-11,24],[-19,23.5]],4,m.shell,.06);
    ribbon('Roof stair approach',[[9,6],[19.6,16],[19.6,20]],4,m.shell);
    ribbon('Temple contour walk',HILL_WALK.map(p=>[p[0],p[2]] as PlanPoint),4,m.shell);
    ribbon('Square east connection',[[9,6],[20,0],[40,4]],4,m.shell);
    // Street markings stop at the pedestrian threshold; road and carpet never overlap.
    for(let z=30;z<62;z+=7) ribbon('Arrival centre marking',[[0,z],[0,z+2]],.18,m.shell,.065);
    for(const x of [-4,-2,0,2,4]) ribbon('Pedestrian crossing',[[x,13],[x,16]],.8,m.shell,.065);
    for(const [x,z] of [[-13,11],[-13,-10],[13,11],[16,-16],[-39,-20],[-19,29]] as const){
      if(!this.clear(x,z,1))continue;
      const base=terrainHeightAt(x,z);
      this.box([.38,1.65,.38],[x,base+.825,z],m.iron);
      this.box([.42,.18,.42],[x,base+1.45,z],m.shell);
      this.solid(x,z,.38,.38,base,base+1.7,'street-bollard');
    }
    // Drainage channels run beside the road, terminate outside entrances.
    for(const x of [-6.3,6.3]) ribbon('Roadside drainage',[[x,59],[x,30]],.22,m.iron,.055);
    this.sign('海風映畫祭','PALACE  ←   SHORE  ↓   TEMPLE  →',[-14,3.6,-10],6,1.8);
    for(const x of [-16.3,-11.7]){
      this.box([.2,3.6,.2],[x,1.8,-10.15],m.wood);
      this.solid(x,-10.15,.25,.25,0,4,'festival-wayfinding');
    }
  }
  finish():void{
    for(const [mat,geometries] of this.batches){
      const clean=geometries.map(g=>{
        const next=g.index?g.toNonIndexed():g;
        for(const key of Object.keys(next.attributes)) if(key!=='position'&&key!=='normal')next.deleteAttribute(key);
        if(next!==g)g.dispose();return next;
      });
      const combined=mergeGeometries(clean,false);clean.forEach(g=>g.dispose());
      if(!combined)throw new Error('Coastal geometry batch mismatch');
      const mesh=new THREE.Mesh(combined,mat);mesh.receiveShadow=true;
      mesh.name='Authored coastal town details';mesh.userData.coastalAuthored=true;mesh.userData.wornNoMasonry=true;
      this.scene.add(mesh);
    }
    this.batches.clear();
  }
}
