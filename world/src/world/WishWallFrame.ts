import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chamferedBox } from './EnvironmentArchitecture';

/** Exact live-canvas clearance, in the existing board's local coordinates. */
export const WISH_WALL_CONTENT_CLEAR = new THREE.Box3(new THREE.Vector3(-2.25,.66,.055),new THREE.Vector3(2.25,3.24,.24));
export interface WishWallFrameHandle {
  root:THREE.Group;
  report:{pieces:number;triangles:number;meshes:number;materials:number};
  dispose():void;
}

/** Smooth, bevelled joinery around the original canvas, within the old roof,
 * posts and collision plan. The content plane is created/owned by the caller.
 */
export function createWishWallFrame(decorativeMaterial?:THREE.MeshStandardMaterial):WishWallFrameHandle {
  const root=new THREE.Group();root.name='wish-wall';
  const red=new THREE.MeshStandardMaterial({color:0xbf392b,roughness:.58,metalness:.08});
  const wood=new THREE.MeshStandardMaterial({color:0x743d29,roughness:.7});
  const tile=new THREE.MeshStandardMaterial({color:0x158f9d,roughness:.45,metalness:.12});
  const gold=new THREE.MeshStandardMaterial({color:0xd8ae52,roughness:.4,metalness:.52});
  const stone=new THREE.MeshStandardMaterial({color:0xe3c18c,roughness:.86});
  const ownsDecorative=!decorativeMaterial;
  const decorative=decorativeMaterial??new THREE.MeshStandardMaterial({color:0xdfad54,roughness:.53,metalness:.18});
  const palette={red,wood,tile,gold,stone,decorative},owned=new Set<THREE.Material>([red,wood,tile,gold,stone,...(ownsDecorative?[decorative]:[])]);
  for(const [name,mat] of Object.entries(palette)) {
    if(name!=='decorative')mat.name='Wish Wall crafted '+name;
    // Family finishes receive the existing shared tile maps during admission.
    // Only the brass and authored ornament atlas bypass that replacement.
    if(name==='gold'||name==='decorative')mat.userData.preserveAuthoredSurface=true;
    mat.userData.islandPaletteApplied=true;
    mat.userData.environmentArchitecture=true;
  }
  red.userData.environmentSurface={family:'wood',tint:0xe34330,uv:'preserve',metres:1.4};
  wood.userData.environmentSurface={family:'wood',tint:0x8f5734,uv:'preserve',metres:1.4};
  tile.userData.environmentSurface={family:'ceramic',tint:0x10b6c5,uv:'preserve',metres:1.4};
  stone.userData.environmentSurface={family:'stone',tint:0xe3c18c,uv:'preserve',metres:1.4};
  const parts=new Map<THREE.Material,THREE.BufferGeometry[]>();
  let pieces=0,triangles=0;
  function add(geometry:THREE.BufferGeometry,mat:THREE.Material) {
    const flat=geometry.index?geometry.toNonIndexed():geometry;
    if(flat!==geometry)geometry.dispose();
    const list=parts.get(mat)??[];list.push(flat);parts.set(mat,list);
    triangles+=flat.getAttribute('position').count/3;pieces++;
  }
  function solid(surface:keyof typeof palette,size:readonly[number,number,number],at:readonly[number,number,number],bevel=.025,rx=0) {
    const geometry=chamferedBox(size,bevel);geometry.rotateX(rx);geometry.translate(...at);add(geometry,palette[surface]);
  }
  // Original backing face remains behind z.06, never over the live lettering.
  solid('wood',[4.6,2.7,.14],[0,1.95,-.02]);
  for(const side of [-1,1]) {
    const x=side*2.46;
    solid('red',[.30,3.64,.30],[x,1.85,0],.035);
    solid('stone',[.36,.20,.36],[x,.10,0],.04);
    solid('gold',[.34,.07,.32],[x,.245,0],.014);
    solid('gold',[.34,.10,.32],[x,3.24,0],.018);
    solid('wood',[.12,2.58,.14],[side*2.32,1.95,.12],.018);
    solid('gold',[.035,2.57,.035],[side*2.2725,1.95,.18],.006);
    for(const y of [.43,3.06]) {
      const bolt=new THREE.CylinderGeometry(.028,.028,.025,8);bolt.rotateX(Math.PI/2);bolt.translate(x,y,.165);add(bolt,gold);
    }
  }
  for(const y of [.57,3.33]) {
    solid('wood',[4.62,.16,.20],[0,y,.1],.025);
    solid('gold',[4.53,.025,.035],[0,y+(y<1?.055:-.055),.2125],.004);
  }
  // Roof/ridge reproduce the former envelope; bevels remove crude box edges.
  solid('tile',[5.6,.20,.95],[0,3.55,0],.035,0);
  solid('red',[5.8,.12,.22],[0,3.7,.02],.025);
  solid('gold',[5.48,.035,.04],[0,3.44,.385],.006,0);
  solid('wood',[5.30,.065,.48],[0,3.39,-.03],.015);
  // Four atlas strips share one material. Motifs keep their 4:1 proportions,
  // repeating along the long axis; gutters avoid adjacent-band mip bleed.
  function inlay(width:number,height:number,x:number,y:number,band:number,vertical=false) {
    const geometry=new THREE.PlaneGeometry(width,height),uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++){
      const u=uv.getX(i),v=uv.getY(i),repeat=vertical?height/(width*4):width/(height*4);
      uv.setXY(i,(vertical?v:u)*repeat,(3-band)/4+.003+(vertical?u:v)*(.25-.006));
    }
    geometry.translate(x,y,.215);add(geometry,decorative);
  }
  inlay(4.44,.095,0,3.33,0);inlay(4.44,.095,0,.57,2);
  for(const side of [-1,1])inlay(.075,2.45,side*2.31,1.95,2,true);
  const releasedGeometry=new Set<THREE.BufferGeometry>(),releasedMaterial=new Set<THREE.Material>();
  for(const mat of owned)mat.addEventListener('dispose',()=>releasedMaterial.add(mat));
  const meshes:THREE.Mesh[]=[];
  for(const [mat,list] of parts){
    const geometry=mergeGeometries(list,false);list.forEach(g=>g.dispose());
    if(!geometry)throw Error('Cannot merge Wish Wall joinery');
    geometry.addEventListener('dispose',()=>releasedGeometry.add(geometry));
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=mat.name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.layers.enable(1);
    mesh.userData.wornNoMasonry=true;root.add(mesh);meshes.push(mesh);
  }
  const report={pieces,triangles,meshes:meshes.length,materials:parts.size};root.userData.wishWallArtReport=report;
  let disposed=false;
  return{root,report,dispose(){
    if(disposed)return;disposed=true;root.removeFromParent();
    for(const mesh of meshes)if(!releasedGeometry.has(mesh.geometry)){releasedGeometry.add(mesh.geometry);mesh.geometry.dispose();}
    for(const mat of owned)if(!releasedMaterial.has(mat))mat.dispose();
  }};
}
