import * as THREE from 'three';
import { COASTAL_ROUTES, ROAD_POLYGONS } from './CoastalCirculation';
import { pixelSurface, worldSurfaceUV, excludeRoads } from './CoastalSurfaces';
import { coastalMaterial } from './CoastalAvatar';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEMPLE_STAIR_FOOTPRINT, SHORE_GRADE, INLAND_HOUSES, terrainHeightAt, createGroundRibbon, groundRibbonEdges, type PlanPoint } from './CoastalTerrain';

type Solid = (x:number,z:number,w:number,d:number,base:number,top:number,label:string)=>void;
type Clear = (x:number,z:number,radius:number)=>boolean;
const colours = {shell:0xc7baa0,red:0x863632,teal:0x52736a,concrete:0x928d7c,ink:0x303639,iron:0x5e6560,wood:0x72583d,brick:0x866150};

/** Shared authored materials and merged details keep silhouettes affordable on phones. */
export class CoastalScenery {
  private batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  private detailBounds:Array<{min:number[];max:number[];contact:number[];geometry:string}>=[];
  readonly mats=Object.fromEntries(Object.entries(colours).map(([key,color])=>[
    key,coastalMaterial(color),
  ])) as Record<keyof typeof colours,THREE.MeshStandardMaterial>;
  private leaves=[0x52654a,0x6c7950,0x3d574b].map(color=>new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true,side:THREE.DoubleSide}));
  constructor(private scene:THREE.Scene,private solid:Solid,private clear:Clear){
    this.mats.shell.map=pixelSurface('plaster');this.mats.brick.map=pixelSurface('brick');
    this.mats.teal.map=pixelSurface('ceramic');this.mats.concrete.map=pixelSurface('plaster');
  }
  private put(geometry:THREE.BufferGeometry,at:[number,number,number],mat:THREE.Material,rotation?:THREE.Euler):void {
    if(rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    geometry.translate(...at);
    geometry.computeBoundingBox();const p=geometry.getAttribute('position');let lowest=0;
    for(let i=1;i<p.count;i++)if(p.getY(i)<p.getY(lowest))lowest=i;
    this.detailBounds.push({min:geometry.boundingBox!.min.toArray(),max:geometry.boundingBox!.max.toArray(),contact:[p.getX(lowest),p.getY(lowest),p.getZ(lowest)],geometry:geometry.type});
    const list=this.batches.get(mat)??[];list.push(geometry);this.batches.set(mat,list);
  }
  box(size:[number,number,number],at:[number,number,number],mat:THREE.Material,rotation?:THREE.Euler):void{
    this.put(new THREE.BoxGeometry(...size),at,mat,rotation);
  }
  private beam(a:THREE.Vector3,b:THREE.Vector3,width:number,mat:THREE.Material,collisionLabel?:string):void{
    const geometry=new THREE.CylinderGeometry(width,width,a.distanceTo(b),5);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));
    this.put(geometry,a.clone().add(b).multiplyScalar(.5).toArray() as [number,number,number],mat);
    if(collisionLabel)for(let i=0;i<8;i++){
      const from=a.clone().lerp(b,i/8),to=a.clone().lerp(b,(i+1)/8),mid=from.clone().add(to).multiplyScalar(.5);
      this.solid(mid.x,mid.z,Math.abs(to.x-from.x)+width*2,Math.abs(to.z-from.z)+width*2,Math.min(from.y,to.y)-width,Math.max(from.y,to.y)+width,collisionLabel);
    }
  }
  private sign(text:string,sub:string,at:[number,number,number],w:number,h:number,angle=0):void{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.max(96,Math.round(768*h/w));
    const c=canvas.getContext('2d')!,W=canvas.width,H=canvas.height;
    c.fillStyle='#d2c4a8';c.fillRect(0,0,W,H);
    c.fillStyle='#84392f';c.fillRect(0,0,W,Math.max(3,H*.025));
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#303638';
    for(const [line,scale,y] of [[text,.36,.40],[sub,.17,.77]] as const){
      let size=H*scale;c.font=`bold ${size}px sans-serif`;
      size*=Math.min(1,(W-40)/Math.max(1,c.measureText(line).width));
      c.font=`bold ${size}px sans-serif`;c.fillText(line,W/2,H*y);
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.magFilter=THREE.NearestFilter;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    mesh.position.set(...at);mesh.rotation.y=angle;mesh.name=text;mesh.userData.coastalAuthored=true;this.scene.add(mesh);
  }
  private canopy(x:number,z:number,w:number,d:number,y:number):void{
    const angle=-.16;
    this.box([w,.18,d],[x,y,z],this.mats.teal,new THREE.Euler(angle,0,0));
    this.box([w,.55,.16],[x,y-.3,z+d*.49],this.mats.shell);

  }
  buildTown():void{
    const m=this.mats;
    this.box([21.8,2.5,1.2],[-35,7.4,-31.6],m.shell);
    // Mirrored Art Deco wings flank a centred crown and supported marquee.
    for(const [x,w,h] of [[-44.4,3.2,11.4],[-35,15.6,11.8],[-25.6,3.2,11.4]] as const){
      const base=x===-35?8:0;
      this.box([x===-35?w:w+.24,h-base,1.2],[x,base+(h-base)/2,-31.6],m.shell);
      this.box([w+.3,.28,1.5],[x,h+.14,-31.6],m.red);
    }
    for(const x of [-45,-25]){
      this.box([1.3,8.1,2.1],[x,4.05,-31.7],m.shell);
      this.solid(x,-31.7,1.3,2.1,0,12,'palace-front-pier');
      this.box([1.45,1.8,2.2],[x,.9,-31.7],m.teal);
    }
    this.box([21.5,.55,5.4],[-35,6,-28.7],m.red);
    this.box([22,.22,5.7],[-35,6.39,-28.7],m.shell);
    for(const x of [-44,-26]){
      this.beam(new THREE.Vector3(x,0,-26.2),new THREE.Vector3(x,5.75,-26.2),.12,m.iron);
      this.solid(x,-26.2,.25,.25,0,6,'palace-marquee-support');
    }
    // Shopfront: ceramic piers, striped cloth canopy, shutters and an authored floor grid.
    for(const x of [23,57]){
      this.box([.6,6.6,.65],[x,3.3,7.7],m.teal);
      this.solid(x,7.7,.6,.65,0,6.6,'shop-arcade-pier');
    }
    this.canopy(40,6.7,35,2.7,6.4);
    for(const x of [27,36,45,54]){
      this.box([6,3.9,.12],[x,3.4,44.1],m.teal);
      for(let row=0;row<7;row++)this.box([5.8,.08,.15],[x,1.7+row*.53,44.18],m.iron);
    }
    // Roof terrace: low planted corners and timber bench backs, clear of DJs/screens/routes.
    for(const x of [27,52]){
      this.box([3.7,.7,2],[x,7.35,40.7],m.shell);
      this.solid(x,40.7,3.7,2,7,7.7,'roof-planter');
      for(let i=0;i<3;i++)this.put(new THREE.IcosahedronGeometry(.8,0),[x-1+i,8.15,40.7],this.leaves[i]);
    }
    // Converted waterfront warehouse: brick bays, high steel windows and rainwater pipes.
    // Details sit against existing walls; the entrance and pavement remain open.
    for(const z of [3.75,10.5,37.75]){
      this.box([.14,2.1,4.4],[-19.54,7.25,z],m.iron);
      this.box([.16,1.8,4.1],[-19.44,7.25,z],m.teal);
      this.box([.23,.10,4.4],[-19.36,7.25,z],m.shell);
      for(const dz of [-1.4,0,1.4])this.box([.23,2.1,.10],[-19.36,7.25,z+dz],m.shell);
      this.box([.65,.18,4.7],[-19.48,6.12,z],m.concrete);
    }
    for(const z of [0.5,7,13.5,34,41.5]){
      this.box([.26,9.4,.45],[-19.49,4.3,z],m.brick);
      this.box([.36,.22,.64],[-19.44,8.95,z],m.concrete);
    }
    for(const z of [1,40.5]){
      this.beam(new THREE.Vector3(-19.3,terrainHeightAt(-19.3,z)+.1,z),new THREE.Vector3(-19.3,10,z),.085,m.iron);
      this.box([.3,.22,1.2],[-19.3,9.9,z+.4],m.iron);
    }
    // Drive-In: a connected gatehouse and strong mechanical screen silhouette.
    this.box([4.2,3.5,3.3],[17,.95,-27],m.shell);
    this.box([4.8,.32,4],[17,2.86,-27],m.red);
    this.box([3.6,1.2,.13],[17,1.45,-25.25],m.ink);
    this.solid(17,-27,4.2,3.3,-.8,3.2,'drive-in-ticket-booth');
    for(const x of [-9,9]){
      this.beam(new THREE.Vector3(x,-.8,-50),new THREE.Vector3(x,8.7,-46.1),.15,m.iron);
      this.solid(x,-50,1.8,1.8,-1,-.5,'screen-footing');
      this.box([1.8,.5,1.8],[x,-.75,-50],m.concrete);
    }
    // Shore: tensioned cloth and timber footings, out of the film's viewing rectangle.
    for(const side of [-1,1]){
      const x=35+side*10.5;
      this.box([1.6,.6,1.6],[x,SHORE_GRADE+.1,-36],m.concrete);
      this.solid(x,-36,1.6,1.6,SHORE_GRADE-.2,SHORE_GRADE+.4,'shore-footing');
      this.beam(new THREE.Vector3(x,SHORE_GRADE,-36),new THREE.Vector3(x,SHORE_GRADE+12.1,-36),.15,m.wood);
      this.beam(new THREE.Vector3(x,SHORE_GRADE+11,-36),new THREE.Vector3(x+side*4,terrainHeightAt(x+side*4,-40),-40),.035,m.iron,'shore-guy-wire');
      this.solid(x,-36,.6,.6,SHORE_GRADE,12,'shore-mast');
    }
    this.box([22,.25,.4],[35,SHORE_GRADE+12,-36],m.wood);
    // Temple cut has a substantial stone base. Return walls end before the approach.
    for(const z of [-17.7,25.7]){
      for(let x=76;x<110;x+=4){
        const base=terrainHeightAt(x,z)-.8;
        this.box([4,1.2,.75],[x,base+.6,z],m.concrete);
        this.solid(x,z,4,.75,base,base+1.2,'temple-retaining-wall');
      }
    }
    // A few long-established neighbouring houses frame the arrival; each has its own roofline.
    for(const [x,z,w,d,h,base] of INLAND_HOUSES){
      this.box([w,h,d],[x,base+h/2,z],x<0?m.shell:m.brick);
      this.solid(x,z,w,d,base,base+h,'inland-house');
      this.box([w+.8,.4,d+.8],[x,base+h+.2,z],m.teal);
      // Set masonry down to the lowest corner so the building is founded, not balanced on a point.
      const low=Math.min(...[-1,1].flatMap(a=>[-1,1].map(b=>terrainHeightAt(x+a*w/2,z+b*d/2))));
      this.box([w,base-low+.5,d],[x,(base+low)/2-.25,z],m.concrete);
      for(const dx of [-w*.3,w*.3]){
        this.box([2.5,2.1,.15],[x+dx,base+5.1,z-d/2-.08],m.teal);
        this.box([2.6,.18,.6],[x+dx,base+4.0,z-d/2-.3],m.concrete);
        this.box([.1,2.0,.1],[x+dx,base+5.1,z-d/2-.19],m.shell);
      }
      this.box([2.8,3.7,.22],[x,base+1.85,z-d/2-.12],m.ink);
      this.box([2.25,3.35,.12],[x,base+1.725,z-d/2-.27],m.wood);
      this.box([.09,.4,.14],[x+.75,base+1.7,z-d/2-.37],m.shell);
      this.box([3.1,.16,1.1],[x,base+.08,z-d/2-.45],m.concrete);
      this.box([3.2,.15,1.15],[x,base+3.9,z-d/2-.46],m.teal);
      this.sign('員工宿舍','STAFF DORMITORY',[x,base+3.53,z-d/2-.35],1.2,.25,Math.PI);
      const front=z-d/2;
      // Deep balcony slab, metal balustrade and air conditioners with readable vents.
      for(const dx of [-w*.3,w*.3]) {
        const bx=x+dx,deck=base+3.94,railTop=deck+1.15,edge=front-1.5;
        this.box([3.4,.22,1.5],[bx,deck-.11,front-.75],m.concrete);
        this.box([3.25,.10,.10],[bx,railTop,edge+.08],m.iron);
        this.box([3.25,.07,.07],[bx,deck+.16,edge+.08],m.iron);
        for(let n=0;n<7;n++)this.box([.055,.95,.055],[bx-1.5+n*.5,deck+.635,edge+.08],m.iron);
        for(const side of [-1,1]) {
          this.box([.1,.1,1.4],[bx+side*1.6,railTop,front-.72],m.iron);
          for(const dz of [.15,.72,1.42])this.box([.065,1.15,.065],[bx+side*1.6,deck+.575,front-dz],m.iron);
        }
      }
      for(const dx of [-w*.3,w*.3]) {
        this.box([1.5,.95,.7],[x+dx,base+3.1,front-.46],m.shell);
        this.box([1.2,.7,.04],[x+dx,base+3.1,front-.84],m.iron);
        for(let n=0;n<5;n++)this.box([1.1,.05,.05],[x+dx,base+2.83+n*.13,front-.88],m.shell);
      }
      this.beam(new THREE.Vector3(x+w*.43,base,front-.2),new THREE.Vector3(x+w*.43,base+h,front-.2),.09,m.iron);
    }
    const poles:[[number,number],[number,number],[number,number]]=[[13,52],[13,34],[13,21.5]];
    for(const [x,z] of poles){const b=terrainHeightAt(x,z);this.box([.38,9,.38],[x,b+4.5,z],m.concrete);this.box([2.4,.15,.16],[x,b+8.1,z],m.iron);this.solid(x,z,.4,.4,b,b+9,'utility-pole');}
    for(let n=1;n<poles.length;n++)for(const offset of [-.8,0,.8]) {
      const a=poles[n-1],b=poles[n];let prev=new THREE.Vector3(a[0]+offset,terrainHeightAt(...a)+8.25,a[1]);
      for(let j=1;j<=8;j++){const t=j/8;const next=new THREE.Vector3(THREE.MathUtils.lerp(a[0],b[0],t)+offset,THREE.MathUtils.lerp(terrainHeightAt(...a),terrainHeightAt(...b),t)+8.25-Math.sin(t*Math.PI)*.65,THREE.MathUtils.lerp(a[1],b[1],t));this.beam(prev,next,.018,m.ink);prev=next;}
    }
    // Gateway: low masonry pylons anchor the existing brand arch.
    for(const x of [-14,14]){
      const base=terrainHeightAt(x,62);
      this.box([2.3,4.8,2.1],[x,base+2.4,62],m.shell);
      this.box([2.5,.25,2.3],[x,base+5.12,62],m.red);
      this.solid(x,62,2.3,2.1,base,base+5,'gate-pylon');
    }
  }
  buildPlanting():void{
    const palms=[[-59,-25,7.3],[-69,-34,6.2],[-81,-28,8.2],[-56,-44,6],[-90,-46,5.8],
      [55,-24,7.2],[78,-47,6.4],[86,-39,8.2],[53,-49,5.6],[93,-50,7]];
    for(const [x,z,h] of palms) if(this.clear(x,z,5.2)) this.palm(x,z,h);
    for(const [x,z,s] of [[-76,-19,1.2],[-86,-9,1],[-18,51,1],[66,42,1.3],[119,14,1.2],[113,-17,1],[-53,-54,.7],[89,-24,1]] ){
      if(!this.clear(x,z,3.8*s))continue;
      (this.scene.userData.treeCanopies??=[]).push({x,z,radius:3.8*s});
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
      g.computeBoundingBox();const bounds=g.boundingBox!;
      this.solid(x+(bounds.min.x+bounds.max.x)/2,z+(bounds.min.z+bounds.max.z)/2,bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z,base+scale*.18+bounds.min.y,base+scale*.18+bounds.max.y,'embedded-coastal-rock');
      this.put(g,[x,base+scale*.18,z],this.mats.concrete);
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
    (this.scene.userData.treeCanopies??=[]).push({x,z,radius:5.2});
    const base=terrainHeightAt(x,z),lean=Math.sin(x*.3)*.9;
    let from=new THREE.Vector3(x,base-.15,z);
    for(let i=0;i<4;i++){
      const to=new THREE.Vector3(x+lean*((i+1)/4)**2,base+height*(i+1)/4,z+.22*(i+1));
      const g=new THREE.CylinderGeometry(.20-i*.02,.3-i*.02,from.distanceTo(to),6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize()));
      const center=from.clone().add(to).multiplyScalar(.5);g.computeBoundingBox();const bounds=g.boundingBox!;
      this.solid(center.x+(bounds.min.x+bounds.max.x)/2,center.z+(bounds.min.z+bounds.max.z)/2,bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z,center.y+bounds.min.y,center.y+bounds.max.y,'bent-palm-trunk');
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
  }
  buildCirculation():void{
    const m=this.mats;
    const paved:PlanPoint[][]=[];
    const ribbon=(name:string,points:readonly PlanPoint[],width:number,mat:THREE.Material,lift=.055)=>{
      const ground=createGroundRibbon(name,points,width,mat,lift);
      if(COASTAL_ROUTES.some(r=>r.name===name&&r.kind==='walk')) {
        excludeRoads(ground,[...ROAD_POLYGONS,...paved,TEMPLE_STAIR_FOOTPRINT]);
        const edges=groundRibbonEdges(points,width);
        for(let i=1;i<edges.length;i++)paved.push([edges[i-1][0],edges[i][0],edges[i][1],edges[i-1][1]]);
      }
      worldSurfaceUV(ground.geometry);this.scene.add(ground);
    };
    const asphalt=coastalMaterial(0x565d67);asphalt.map=pixelSurface('asphalt');
    for(const route of COASTAL_ROUTES) {
      const mat=route.kind==='road'?asphalt:route.kind==='carpet'?m.red:m.shell;
      ribbon(route.name,route.points,route.width,mat,route.kind==='road'?.035:route.kind==='carpet'?.075:route.kind==='crossing'?.065:.055);
    }
    for(let z=30;z<62;z+=7) ribbon('Arrival centre marking',[[0,z],[0,z+2]],.18,m.shell,.065);
    for(const [x,z] of [[-13,11],[-13,-10],[13,11],[16,-16],[-39,-20],[-19,29]] as const){
      if(!this.clear(x,z,1))continue;
      const base=terrainHeightAt(x,z);
      this.box([.38,1.65,.38],[x,base+.825,z],m.iron);
      this.box([.42,.18,.42],[x,base+1.45,z],m.shell);
      this.solid(x,z,.38,.38,base,base+1.7,'street-bollard');
    }
    // The old dark drainage ribbons read as two stray texture lines along the
    // arrival road. The road and its raised pavements already define the edge.

  }
  finish():void{
    this.scene.userData.coastalDetailBounds=this.detailBounds;
    for(const [mat,geometries] of this.batches){
      const clean=geometries.map(g=>{
        const next=g.index?g.toNonIndexed():g;
        for(const key of Object.keys(next.attributes)) if(key!=='position'&&key!=='normal')next.deleteAttribute(key);
        worldSurfaceUV(next);
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
