import * as THREE from 'three';

/** Exact, staff-editable lettering; no generated lettering or runtime lights. */
export type NeonSignStyle = 'entrance' | 'palace' | 'club' | 'rooftop' | 'temple' | 'shore' | 'drive-in' | 'pamphlet' | 'popcorn' | 'festival';
interface NeonPalette { ink:string; enamel:string; tube:string; accent:string; core:string; }
export const NEON_SIGN_PALETTES:Readonly<Record<NeonSignStyle,NeonPalette>> = {
  entrance:{ink:'#090e21',enamel:'#17152d',tube:'#3ce9ec',accent:'#ff6742',core:'#fff2ce'},
  palace:{ink:'#18090e',enamel:'#360f20',tube:'#ff4b45',accent:'#ffc658',core:'#fff5d6'},
  club:{ink:'#071421',enamel:'#102332',tube:'#30e5ee',accent:'#ff513d',core:'#e5ffff'},
  rooftop:{ink:'#170b26',enamel:'#29143a',tube:'#ff63bc',accent:'#55e5f4',core:'#fff1ea'},
  temple:{ink:'#210c16',enamel:'#3b1420',tube:'#ffd36b',accent:'#ff5542',core:'#fff3cb'},
  shore:{ink:'#071d25',enamel:'#102e34',tube:'#70f4bd',accent:'#ff8466',core:'#eaffdc'},
  'drive-in':{ink:'#1c1021',enamel:'#2d142b',tube:'#ff675a',accent:'#ffe598',core:'#fff4df'},
  pamphlet:{ink:'#0a2023',enamel:'#173238',tube:'#ffb45b',accent:'#62e3ce',core:'#fff5d6'},
  popcorn:{ink:'#280d17',enamel:'#451524',tube:'#ff6054',accent:'#ffd871',core:'#fff6db'},
  festival:{ink:'#111026',enamel:'#211e37',tube:'#5be3e5',accent:'#ffaf57',core:'#fff0d5'},
};

export interface NeonSignOptions {
  aspect?:number;
  style?:NeonSignStyle;
  /** One bounded source bitmap. Callers can choose 512 for small phone signs. */
  maxEdge?:number;
  font?:(size:number,heading:boolean)=>string;
}
export interface NeonSignTextureReport { style:NeonSignStyle; lines:readonly string[]; width:number; height:number; decodedBytesWithMips:number; paints:number; }
interface SignState { canvas:HTMLCanvasElement; context:CanvasRenderingContext2D; options:Required<NeonSignOptions>; lines:string[]; report:NeonSignTextureReport; disposed:boolean; }
const states=new WeakMap<THREE.Texture,SignState>();
const disposedSignTextures=new WeakSet<THREE.Texture>(),disposedSignMaterials=new WeakSet<THREE.Material>();
const defaultFont=(size:number,heading:boolean)=>`${heading?900:700} ${size}px "Arial Narrow", "Arial", "Noto Sans TC", sans-serif`;

/** Only initial defaults are inferred. Use an explicit style for staff renames. */
export function neonSignStyleForLines(lines:readonly string[]):NeonSignStyle {
  const title=(lines[0]??'').toUpperCase();
  if(title.includes('PALACE'))return 'palace';
  if(title.includes('SLAP')||title.includes('WAREHOUSE'))return 'club';
  if(title.includes('NIMA')||title.includes('ROOFTOP'))return 'rooftop';
  if(title.includes('TEMPLE')||title.includes('美麗本人'))return 'temple';
  if(title.includes('SHORE'))return 'shore';
  if(title.includes('DRIVE'))return 'drive-in';
  if(title.includes('PAMPHLET')||lines.some(line=>line.toUpperCase().includes('PAMPHLET')))return 'pamphlet';
  if(title.includes('POP!'))return 'popcorn';
  if(title.includes('MYSCHEDULE'))return 'entrance';
  return 'festival';
}

/** Keep the panel's real aspect, including portrait/square staff signage. */
export function neonSignTextureSize(aspect=2,maxEdge=1024):{width:number;height:number} {
  if(!Number.isFinite(aspect)||aspect<=0)throw new RangeError('Neon sign aspect must be positive and finite.');
  const edge=Math.max(128,Math.min(1536,Math.round(Number.isFinite(maxEdge)?maxEdge:1024)));
  return aspect>=1?{width:edge,height:Math.max(1,Math.round(edge/aspect))}:{width:Math.max(1,Math.round(edge*aspect)),height:edge};
}

function panelPath(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,cut:number,style:NeonSignStyle):void {
  c.beginPath();
  if(style==='temple'||style==='shore'||style==='rooftop'){
    const r=Math.min(cut*2.2,h*.18,w*.12);
    c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);
  }else{
    c.moveTo(x+cut,y);c.lineTo(x+w-cut,y);c.lineTo(x+w,y+cut);c.lineTo(x+w,y+h-cut);
    c.lineTo(x+w-cut,y+h);c.lineTo(x+cut,y+h);c.lineTo(x,y+h-cut);c.lineTo(x,y+cut);
  }
  c.closePath();
}

function paint(state:SignState):void {
  if(state.disposed)return;
  const {canvas,context:c,options,lines}=state,{width:w,height:h}=canvas;
  const p=NEON_SIGN_PALETTES[options.style],unit=Math.min(w,h),wide=w/h>3.2;
  c.save();c.clearRect(0,0,w,h);c.fillStyle=p.ink;c.fillRect(0,0,w,h);
  // Deep enamel, a dark metal gutter and two independently coloured tubes.
  panelPath(c,w*.012,h*.035,w*.976,h*.93,unit*.055,options.style);c.fillStyle=p.enamel;c.fill();
  c.lineJoin='round';c.lineCap='round';c.strokeStyle=p.accent;c.lineWidth=Math.max(2,unit*.028);c.stroke();
  panelPath(c,w*.027,h*.102,w*.946,h*.796,unit*.045,options.style);
  c.shadowColor=p.tube;c.shadowBlur=unit*.035;c.strokeStyle=p.tube;c.lineWidth=Math.max(1.5,unit*.014);c.stroke();
  c.shadowBlur=0;
  // Fixed decorative rivets/bulbs and brackets are baked once into the bitmap.
  const bulbStyle=options.style==='palace'||options.style==='drive-in';
  if(bulbStyle){
    const count=Math.max(6,Math.min(40,Math.round(w/h*8)));
    for(let i=0;i<count;i++)for(const y of [h*.052,h*.948]){
      c.beginPath();c.arc(w*(.055+.89*i/(count-1)),y,Math.max(1,unit*.012),0,Math.PI*2);c.fillStyle=p.core;c.fill();
    }
  }else{
    for(const side of [-1,1]){
      const x=w/2+side*(w*.454);
      c.strokeStyle=p.accent;c.lineWidth=Math.max(1,unit*.016);c.beginPath();
      c.moveTo(x-side*unit*.045,h*.34);c.lineTo(x,h*.5);c.lineTo(x-side*unit*.045,h*.66);c.stroke();
      if(options.style==='temple'){
        c.beginPath();c.moveTo(x,h*.35);c.bezierCurveTo(x-unit*.10,h*.28,x-unit*.09,h*.53,x,h*.58);
        c.bezierCurveTo(x+unit*.09,h*.53,x+unit*.10,h*.28,x,h*.35);c.stroke();
      }
    }
  }
  // The horizontal divider has Art Deco stepped ends, rather than another box.
  const headingY=lines.length===1?.50:.397,subtitleY=.748;
  if(lines.length>1){
    c.strokeStyle=p.accent;c.lineWidth=Math.max(1,unit*.010);c.beginPath();
    const start=w*(wide?.17:.13),end=w-start,y=h*.595;
    c.moveTo(start-unit*.035,y-unit*.025);c.lineTo(start,y-unit*.025);c.lineTo(start,y);c.lineTo(end,y);c.lineTo(end,y-unit*.025);c.lineTo(end+unit*.035,y-unit*.025);c.stroke();
  }
  c.textAlign='center';c.textBaseline='middle';
  lines.forEach((line,index)=>{
    const heading=index===0;
    const y=lines.length<=2?(heading?headingY:subtitleY)*h:h*(.27+index*.47/Math.max(1,lines.length-1));
    let size=h*(heading?(wide?.37:.335):.16);
    c.font=options.font(size,heading);
    size*=Math.min(1,(w-unit*(heading?.42:.60))/Math.max(1,c.measureText(line).width));
    c.font=options.font(size,heading);
    if(heading){
      c.shadowColor=p.tube;c.shadowBlur=Math.max(2,unit*.027);c.lineWidth=Math.max(2,size*.065);c.strokeStyle=p.tube;c.strokeText(line,w*.5,y);
      c.shadowBlur=0;c.fillStyle=p.enamel;c.fillText(line,w*.5,y);
      c.lineWidth=Math.max(.65,size*.014);c.strokeStyle=p.core;c.strokeText(line,w*.5,y);
    }else{
      c.shadowColor=p.accent;c.shadowBlur=unit*.014;c.fillStyle=p.core;c.fillText(line,w*.5,y);c.shadowBlur=0;
    }
  });
  c.restore();state.report.paints++;
}

export function createNeonSignTexture(lines:readonly string[],options:NeonSignOptions={}):THREE.CanvasTexture {
  const size=neonSignTextureSize(options.aspect,options.maxEdge),canvas=document.createElement('canvas');
  canvas.width=size.width;canvas.height=size.height;const context=canvas.getContext('2d');
  if(!context)throw new Error('Canvas 2D context unavailable for neon sign.');
  const resolved:Required<NeonSignOptions>={aspect:options.aspect??2,maxEdge:options.maxEdge??1024,style:options.style??neonSignStyleForLines(lines),font:options.font??defaultFont};
  const report:NeonSignTextureReport={style:resolved.style,lines:[...lines],...size,decodedBytesWithMips:Math.ceil(size.width*size.height*4*4/3),paints:0};
  const state:SignState={canvas,context,options:resolved,lines:[...lines],report,disposed:false};
  paint(state);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=2;texture.userData.neonSign=report;states.set(texture,state);
  texture.addEventListener('dispose',()=>{state.disposed=true;states.delete(texture);disposedSignTextures.add(texture);});
  return texture;
}

/** Used only when the brand font finishes loading, never in the animation loop. */
export function repaintNeonSignTexture(texture:THREE.Texture):void {
  const state=states.get(texture);if(!state||state.disposed)return;
  paint(state);texture.needsUpdate=true;
}

/** Optional in-place staff edits retain a single canvas/texture allocation. */
export function updateNeonSignTexture(texture:THREE.Texture,lines:readonly string[]):boolean {
  const state=states.get(texture);if(!state||state.disposed)return false;
  if(state.lines.length===lines.length&&state.lines.every((line,i)=>line===lines[i]))return false;
  state.lines=[...lines];state.report.lines=[...lines];paint(state);texture.needsUpdate=true;return true;
}

/** Release live sign canvases before removing their frames from the scene.
 * Only exact neon-tagged CanvasTexture .map slots confer ownership here;
 * imported maps, other material slots, geometry and scene nodes stay intact. */
export function disposeNeonSignTextures(root:THREE.Object3D):{textures:number;materials:number} {
  const textures=new Set<THREE.Texture>(),materials=new Set<THREE.Material>();
  root.traverse(object=>{
    const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      const map=(material as THREE.Material&{map?:THREE.CanvasTexture|null}).map;
      if(map?.isCanvasTexture&&map.userData.neonSign){textures.add(map);materials.add(material);}
    }
  });
  const report={textures:0,materials:0};
  for(const texture of textures)if(!disposedSignTextures.has(texture)){disposedSignTextures.add(texture);texture.dispose();report.textures++;}
  for(const material of materials)if(!disposedSignMaterials.has(material)){disposedSignMaterials.add(material);material.dispose();report.materials++;}
  return report;
}

interface FrameState { meshes:THREE.Mesh[]; geometries:THREE.BufferGeometry[]; materials:THREE.Material[]; disposed:boolean; }
const frames=new WeakMap<THREE.Object3D,FrameState>();

/** Three merged meshes, no transparent glow cards, lights, timers or colliders. */
export function createNeonSignFrame(width:number,height:number,style:NeonSignStyle='festival'):THREE.Group {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Neon frame dimensions must be positive and finite.');
  const root=new THREE.Group();root.name='Retro neon sign frame';const p=NEON_SIGN_PALETTES[style],unit=Math.min(width,height),rim=Math.min(.10,unit*.045);
  const materials=[new THREE.MeshBasicMaterial({color:p.ink}),new THREE.MeshBasicMaterial({color:p.accent}),new THREE.MeshBasicMaterial({color:p.tube})];
  materials.forEach(m=>{m.userData.preserveAuthoredSurface=true;m.userData.islandPaletteApplied=true;m.userData.islandPrintStrength=.6;});
  const sets:number[][]=[[],[],[]];
  const box=(set:number,s:[number,number,number],at:[number,number,number])=>{
    const geometry=new THREE.BoxGeometry(...s).toNonIndexed(),position=geometry.getAttribute('position');
    for(let i=0;i<position.count;i++)sets[set].push(position.getX(i)+at[0],position.getY(i)+at[1],position.getZ(i)+at[2]);geometry.dispose();
  };
  box(0,[width+.26,height+.26,.18],[0,0,-.13]);
  for(const y of [-1,1]){
    box(1,[width+.20,rim,.035],[0,y*(height/2+.055),-.015]);
    box(2,[width*.64,rim*.42,.024],[0,y*(height/2+.075),.009]);
  }
  for(const x of [-1,1]){
    box(1,[rim,height+.12,.035],[x*(width/2+.055),0,-.015]);
    box(2,[rim*.42,height*.58,.024],[x*(width/2+.075),0,.009]);
  }
  const meshes:THREE.Mesh[]=[];
  const geometries=sets.map((data,i)=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,materials[i]);mesh.name=['Dark enamel cabinet','Coloured metal surround','Neon edge tubes'][i];mesh.layers.enable(1);root.add(mesh);meshes.push(mesh);return geometry;
  });
  root.userData.neonSignFrame={style,meshes:3,triangles:sets.reduce((n,data)=>n+data.length/9,0)};
  frames.set(root,{meshes,geometries,materials,disposed:false});return root;
}

/** Caller owns the frame. Repeated teardown is harmless; textures are separate. */
export function disposeNeonSignFrame(root:THREE.Object3D):void {
  const state=frames.get(root);if(!state||state.disposed)return;state.disposed=true;
  new Set([...state.geometries,...state.meshes.map(mesh=>mesh.geometry)]).forEach(g=>g.dispose());state.materials.forEach(m=>m.dispose());root.removeFromParent();frames.delete(root);
}
