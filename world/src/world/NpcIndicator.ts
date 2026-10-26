import * as THREE from 'three';
import {PLANET,planetBendPoint} from './PlanetCurve';

/** Resident identity, rather than an avatar skin: a player wearing one is not an NPC. */
export interface NpcIndicatorTarget {
  id: string;
  group: THREE.Object3D;
  head?: THREE.Object3D;
  /** Head-local hair/cap crown. The imported avatar supplies this after mounting. */
  crown?: () => THREE.Vector3 | undefined;
  /** Head-local fallback, also used for MENTOR's small, carried head. */
  headOffset?: Readonly<THREE.Vector3>;
  /** Root-local fallback for a body without a head pivot. */
  headTop?: number;
  /** Existing resident nameplate; it remains owned by the world. */
  identity?:THREE.Sprite;
}

export interface NpcIndicatorControls {
  localPlayerNpcId?: string;
  /** Carried residents need no floating labels over the carrier's camera. */
  carriedNpcId?: string;
  /** A Set or the existing remoteNpcControls Map, without copying it each frame. */
  remotePlayerNpcIds?: { has(id: string): boolean };
}

// Owner, 2026-10-22: the name and title card read too big over a resident's
// head, so the card, its ticket and the gaps are about 70% of what they were.
export const NPC_INDICATOR = Object.freeze({
  width: .6,
  height: .27,
  clearance: .29,
  fadeStart: 17,
  fadeEnd: 31,
  textureWidth: 256,
  textureHeight: 112,
  identityWidth:1.9,
  identityGap:.12,
  carrierGap:.16,
  maxScreenFraction:.86,
});

// The 通行證 menu's paper, not the neon of the signs: these are interface, and
// the signs' tubes and glows belong to the buildings alone.
const PAPER = '#f5efe2', INK = '#111113', RED = '#a91c24';
const CONDENSED = '"Barlow Condensed", Impact, sans-serif';

function wrappedText(c:CanvasRenderingContext2D,text:string,fontSize:number,weight:number):string[]{
  c.font=`${weight} ${fontSize}px ${CONDENSED}`;
  const lines:string[]=[];let line='';
  for(const token of text.match(/\S+\s*/gu)??['']){
    if(c.measureText(line+token.trimEnd()).width<=464){line+=token;continue;}
    if(line.trim()){lines.push(line.trim());line='';}
    for(const character of token){
      if(c.measureText(line+character).width>464&&line){lines.push(line.trim());line='';}
      line+=character;
    }
  }
  if(line.trim()||!lines.length)lines.push(line.trim());return lines;
}

/** Canvas lettering is fixed at the moment it is painted. A label made before
 * the condensed face arrives would keep the fallback, so paint again once. */
function repaintWhenCondensedArrives(texture:THREE.CanvasTexture,paint:()=>void):void{
  const fonts=(globalThis as {document?:{fonts?:FontFaceSet}}).document?.fonts;
  const face='900 40px "Barlow Condensed"';
  if(!fonts||fonts.check(face))return;
  void fonts.load(face).then(()=>{paint();texture.needsUpdate=true;}).catch(()=>{});
}

/** The pass menu's card: cream paper, the name in black condensed capitals, a
 * printed rule, the job title in festival red, and the same hard black offset
 * shadow. Ink on paper keeps its contrast in Noir. Full wording is wrapped and
 * measured; one bitmap replaces the existing name bitmap. */
export function createNpcIdentityTexture(name:string,title:string):THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=512;
  const c=canvas.getContext('2d');if(!c)throw new Error('NPC identity canvas unavailable');
  const fit=(text:string,start:number,weight:number)=>{let size=start,lines=wrappedText(c,text,size,weight);while(lines.length>2&&size>8){size-=2;lines=wrappedText(c,text,size,weight);}return {size,lines};};
  const heading=fit(name,56,900),role=fit(title,36,800);
  const edge=4,shadow=10,padding=16,gap=14,nameLine=heading.size*1.08,titleLine=role.size*1.18;
  canvas.height=Math.ceil(edge+padding*2+heading.lines.length*nameLine+gap+role.lines.length*titleLine+shadow);
  const cardWidth=512-edge-shadow,cardHeight=canvas.height-edge-shadow,centre=edge+cardWidth/2;
  const paint=()=>{
    c.clearRect(0,0,512,canvas.height);
    c.fillStyle='rgba(0,0,0,.6)';c.fillRect(edge+shadow,edge+shadow,cardWidth,cardHeight);
    c.fillStyle=PAPER;c.fillRect(edge,edge,cardWidth,cardHeight);
    c.textAlign='center';c.textBaseline='middle';
    let y=edge+padding+nameLine/2;c.font=`900 ${heading.size}px ${CONDENSED}`;c.fillStyle=INK;
    for(const line of heading.lines){c.fillText(line,centre,y);y+=nameLine;}
    const rule=y-nameLine/2+gap/2;c.strokeStyle='rgba(17,17,19,.32)';c.lineWidth=2;c.setLineDash([7,5]);
    c.beginPath();c.moveTo(edge+30,rule);c.lineTo(edge+cardWidth-30,rule);c.stroke();c.setLineDash([]);
    y+=gap-nameLine/2+titleLine/2;c.font=`800 ${role.size}px ${CONDENSED}`;c.fillStyle=RED;
    for(const line of role.lines){c.fillText(line,centre,y);y+=titleLine;}
  };
  paint();
  const texture=new THREE.CanvasTexture(canvas);texture.name='npc-name-and-title';texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
  texture.userData.npcIdentity={name,title,nameLines:heading.lines,titleLines:role.lines,width:NPC_INDICATOR.identityWidth,height:NPC_INDICATOR.identityWidth*canvas.height/512};
  repaintWhenCondensedArrives(texture,paint);
  return texture;
}

function ticketPath(c: CanvasRenderingContext2D, inset: number): void {
  const left = inset, right = 256 - inset, top = inset, bottom = 112 - inset;
  const corner = 11, notch = 8;
  c.beginPath();
  c.moveTo(left + corner, top); c.lineTo(right - corner, top);
  c.lineTo(right, top + corner); c.lineTo(right, 56 - notch);
  c.arc(right, 56, notch, -Math.PI / 2, Math.PI / 2, true);
  c.lineTo(right, bottom - corner); c.lineTo(right - corner, bottom);
  c.lineTo(left + corner, bottom); c.lineTo(left, bottom - corner);
  c.lineTo(left, 56 + notch); c.arc(left, 56, notch, Math.PI / 2, -Math.PI / 2, true);
  c.lineTo(left, top + corner); c.closePath();
}

/** A paper admission ticket, shared by every resident: notched stub, red
 * perforations, black NPC, the pass menu's hard shadow. No glow, no lights. */
export function createNpcTicketTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = NPC_INDICATOR.textureWidth;
  canvas.height = NPC_INDICATOR.textureHeight;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('NPC ticket canvas unavailable');
  const paint = () => {
    c.clearRect(0, 0, 256, 112);
    c.save(); c.translate(6, 6); ticketPath(c, 10); c.fillStyle = 'rgba(0,0,0,.6)'; c.fill(); c.restore();
    ticketPath(c, 10); c.fillStyle = PAPER; c.fill();
    c.strokeStyle = RED; c.lineWidth = 3;
    for (const x of [35, 221]) for (let y = 31; y <= 81; y += 10) {
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 4); c.stroke();
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 70px ${CONDENSED}`;
    c.fillStyle = INK; c.fillText('NPC', 128, 58);
  };
  paint();
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'npc-festival-pass-ticket';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  repaintWhenCondensedArrives(texture, paint);
  return texture;
}

/** Full contrast nearby, then a smooth, bounded fade to avoid distant badge clutter. */
export function npcIndicatorOpacity(distance: number): number {
  if (!Number.isFinite(distance) || distance >= NPC_INDICATOR.fadeEnd) return 0;
  if (distance <= NPC_INDICATOR.fadeStart) return 1;
  const t = (distance - NPC_INDICATOR.fadeStart) / (NPC_INDICATOR.fadeEnd - NPC_INDICATOR.fadeStart);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Scene-owned billboards keep a fixed world size when MENTOR is scaled onto a
 * carrier's head. Update after imported skins, dog perching and camera movement.
 * CPU-bent crown anchors and flat sprite materials keep the whole stack spaced
 * in the camera's vertical direction, including steep isometric views.
 */
export class NpcIndicators {
  readonly root = new THREE.Group();
  readonly report: Readonly<{ badges: number; textures: number; decodedBytes: number; lights: number }>;
  private readonly texture: THREE.CanvasTexture;
  private readonly entries: Array<{ target: NpcIndicatorTarget; sprite: THREE.Sprite; anchor:THREE.Vector3; parent:THREE.Object3D|null; identityWidth:number;identityHeight:number;ticketWidth:number;ticketHeight:number;clearance:number; allowed:boolean }>;
  private readonly visitorLabels=new Map<THREE.Sprite,{position:THREE.Vector3;seen:boolean}>();
  private readonly point = new THREE.Vector3();
  private readonly cameraPoint = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly worldScale = new THREE.Vector3();
  private readonly up=new THREE.Vector3();
  private readonly carrierPoint=new THREE.Vector3();
  private readonly carrierScale=new THREE.Vector3();
  private readonly cameraSpace=new THREE.Vector3();
  private readonly viewPoint=new THREE.Vector3();
  private disposed = false;

  constructor(private readonly scene: THREE.Scene, targets: readonly NpcIndicatorTarget[]) {
    this.root.name = 'npc-ticket-indicators';
    this.root.userData.filmGrainExclude = true;
    this.root.userData.environmentExclude = true;
    this.texture = createNpcTicketTexture();
    this.entries = targets.map(target => {
      const material = new THREE.SpriteMaterial({
        map: this.texture, transparent: true, depthTest: true, depthWrite: false,
        toneMapped: false, fog: false, alphaTest: .02,
      });
      const sprite = new THREE.Sprite(material);
      Object.assign(material,{defines:{PLANET_FLAT:''}});
      sprite.name = `npc-ticket:${target.id}`;
      sprite.userData.npcIndicator = true;
      sprite.layers.enable(2);
      sprite.scale.set(NPC_INDICATOR.width, NPC_INDICATOR.height, 1);
      sprite.visible = false;
      this.root.add(sprite);
      const parent=target.identity?.parent??null;
      if(target.identity){
        this.root.add(target.identity);target.identity.userData.npcIdentityLabel=true;
        Object.assign(target.identity.material,{defines:{PLANET_FLAT:''},toneMapped:false,fog:false,depthWrite:false});
      }
      return { target, sprite,anchor:new THREE.Vector3(),parent,identityWidth:NPC_INDICATOR.identityWidth,identityHeight:0,ticketWidth:NPC_INDICATOR.width,ticketHeight:NPC_INDICATOR.height,clearance:NPC_INDICATOR.clearance,allowed:false };
    });
    scene.add(this.root);
    this.report = Object.freeze({ badges: this.entries.length, textures: 1,
      decodedBytes: NPC_INDICATOR.textureWidth * NPC_INDICATOR.textureHeight * 4, lights: 0 });
  }

  update(camera: THREE.Camera, controls: NpcIndicatorControls = {}): void {
    if (this.disposed) return;
    camera.getWorldPosition(this.cameraPoint);
    camera.updateWorldMatrix(true,false);this.up.setFromMatrixColumn(camera.matrixWorld,1).normalize();
    this.root.updateWorldMatrix(true, false);
    this.inverse.copy(this.root.matrixWorld).invert();
    this.root.getWorldScale(this.worldScale);
    // A visitor's existing name stays owned by their avatar. Restore its
    // ordinary local anchor before calculating this frame's carried clearance.
    for(const [label,saved] of this.visitorLabels){label.position.copy(saved.position);saved.seen=false;}
    for (const entry of this.entries) {
      const {target,sprite}=entry;
      let attached = false, visible = true;
      for (let parent: THREE.Object3D | null = target.group; parent; parent = parent.parent) {
        if (!parent.visible) visible = false;
        if (parent === this.scene) { attached = true; break; }
      }
      if (!attached || !visible || target.id === controls.localPlayerNpcId || target.id === controls.carriedNpcId || controls.remotePlayerNpcIds?.has(target.id)) {
        sprite.visible = false;entry.allowed=false;if(target.identity)target.identity.visible=false;
        continue;
      }
      if (target.head) {
        this.point.copy(target.crown?.() ?? target.headOffset ?? this.point.set(0, .5, 0));
        target.head.updateWorldMatrix(true, false);
        this.point.applyMatrix4(target.head.matrixWorld);
      } else {
        this.point.set(0, target.headTop ?? 3.2, 0);
        target.group.updateWorldMatrix(true, false);
        this.point.applyMatrix4(target.group.matrixWorld);
      }
      if(PLANET.on)planetBendPoint(this.point,this.point);
      entry.anchor.copy(this.point);entry.allowed=true;entry.clearance=NPC_INDICATOR.clearance;
      this.cameraSpace.copy(this.point).applyMatrix4(camera.matrixWorldInverse);
      const halfWidth=(camera.projectionMatrix.elements[15]===0?Math.max(.05,-this.cameraSpace.z):1)/Math.abs(camera.projectionMatrix.elements[0]);
      const availableWidth=2*NPC_INDICATOR.maxScreenFraction*halfWidth;
      entry.identityWidth=Math.min(NPC_INDICATOR.identityWidth,availableWidth);
      entry.identityHeight=(target.identity?.material.map?.userData.npcIdentity?.height??0)*entry.identityWidth/NPC_INDICATOR.identityWidth;
      entry.ticketWidth=target.identity?Math.min(NPC_INDICATOR.width,availableWidth):NPC_INDICATOR.width;
      entry.ticketHeight=NPC_INDICATOR.height*entry.ticketWidth/NPC_INDICATOR.width;
    }
    // Both identities belong above the complete carried silhouette. Starting
    // the carrier's role under the perched dog lets its body cover that text.
    for(const dog of this.entries)if(dog.allowed&&dog.target.id==='MENTOR'){
      for(let parent=dog.target.group.parent;parent&&parent!==this.scene;parent=parent.parent){
        const carrier=this.entries.find(other=>other.target.group===parent);
        if(carrier?.allowed){
          // Share a camera plane as well as a vertical line. Different depths
          // otherwise let perspective expand one label into its neighbour.
          const dogY=this.carrierPoint.copy(dog.anchor).project(camera).y,carrierY=this.cameraSpace.copy(carrier.anchor).project(camera).y;
          if(dogY>carrierY)carrier.anchor.copy(dog.anchor);else dog.anchor.copy(carrier.anchor);
          this.cameraSpace.copy(carrier.anchor).applyMatrix4(camera.matrixWorldInverse);
          const halfWidth=(camera.projectionMatrix.elements[15]===0?Math.max(.05,-this.cameraSpace.z):1)/Math.abs(camera.projectionMatrix.elements[0]);
          const width=2*NPC_INDICATOR.maxScreenFraction*halfWidth;
          carrier.identityWidth=Math.min(carrier.identityWidth,width);dog.identityWidth=Math.min(dog.identityWidth,width);
          carrier.identityHeight=(carrier.target.identity?.material.map?.userData.npcIdentity?.height??0)*carrier.identityWidth/NPC_INDICATOR.identityWidth;
          dog.identityHeight=(dog.target.identity?.material.map?.userData.npcIdentity?.height??0)*dog.identityWidth/NPC_INDICATOR.identityWidth;
          carrier.ticketWidth=Math.min(carrier.ticketWidth,width);dog.ticketWidth=Math.min(dog.ticketWidth,width);
          carrier.ticketHeight=NPC_INDICATOR.height*carrier.ticketWidth/NPC_INDICATOR.width;dog.ticketHeight=NPC_INDICATOR.height*dog.ticketWidth/NPC_INDICATOR.width;
        }
      }
    }
    for(const entry of this.entries){
      if(!entry.allowed)continue;
      const {target,sprite,anchor,identityHeight}=entry;
      this.point.copy(anchor);
      let clearance:number=entry.clearance;
      // A carried MENTOR must sit above the carrier's entire label stack.
      for(let parent=target.group.parent;target.id==='MENTOR'&&parent&&parent!==this.scene;parent=parent.parent){
        const carrier=this.entries.find(other=>other.target.group===parent);
        if(carrier?.allowed){
          const top=carrier.clearance+(carrier.identityHeight?carrier.identityHeight+NPC_INDICATOR.identityGap+carrier.ticketHeight:carrier.ticketHeight/2);
          clearance=Math.max(clearance,this.carrierPoint.copy(carrier.anchor).sub(anchor).dot(this.up)+top+NPC_INDICATOR.carrierGap+(identityHeight?0:entry.ticketHeight/2));
        }else{
          const label=parent.userData.nameBadge as THREE.Sprite|undefined;
          if(label?.isSprite&&label.visible){
            label.getWorldPosition(this.carrierPoint);label.getWorldScale(this.carrierScale);
            const bent=PLANET.on&&(label.material as THREE.SpriteMaterial&{defines?:Record<string,unknown>}).defines?.PLANET_FLAT===undefined;
            if(bent)planetBendPoint(this.carrierPoint,this.carrierPoint);
            const height=Math.abs(this.carrierScale.y),above=Math.max(NPC_INDICATOR.clearance+height/2,this.cameraSpace.copy(this.carrierPoint).sub(anchor).dot(this.up));
            if(label.parent){
              let saved=this.visitorLabels.get(label);if(!saved){saved={position:label.position.clone(),seen:true};this.visitorLabels.set(label,saved);}saved.seen=true;
              this.carrierPoint.copy(anchor).addScaledVector(this.up,above);
              // Invert the sprite-centre bend; its owner and material remain
              // untouched, so removal/wardrobe/disposal keep their usual paths.
              this.cameraSpace.copy(this.carrierPoint);
              if(bent){const c=PLANET.centre.value,R=PLANET.radius,dx=this.carrierPoint.x-c.x,dz=this.carrierPoint.z-c.z,r=Math.hypot(dx,dz),h=this.carrierPoint.y+R;
                if(r>1e-4){const flatRadius=Math.atan2(r,h)*R;this.cameraSpace.set(c.x+dx/r*flatRadius,Math.hypot(r,h)-R,c.z+dz/r*flatRadius);}}
              label.position.copy(label.parent.worldToLocal(this.cameraSpace));
            }
            clearance=Math.max(clearance,this.carrierPoint.sub(anchor).dot(this.up)+Math.abs(this.carrierScale.y)/2+NPC_INDICATOR.carrierGap+(identityHeight?0:entry.ticketHeight/2));
          }
        }
      }
      if(target.identity){
        const identity=target.identity,requested=identity.userData.npcLabelRequested??identity.visible;
        identity.visible=requested;
        identity.position.copy(anchor).addScaledVector(this.up,clearance+identityHeight/2).applyMatrix4(this.inverse);
        identity.scale.set(entry.identityWidth/Math.abs(this.worldScale.x||1),identityHeight/Math.abs(this.worldScale.y||1),1);
      }
      this.point.addScaledVector(this.up,clearance+(identityHeight?identityHeight+NPC_INDICATOR.identityGap+entry.ticketHeight/2:0));
      // The isometric camera always stands 34 back, past the whole fade, so
      // there the fade runs across the picture from its centre, the attendee.
      const orthographic=camera.projectionMatrix.elements[15]===1;
      this.viewPoint.copy(this.point).applyMatrix4(camera.matrixWorldInverse);
      const opacity = npcIndicatorOpacity(orthographic?Math.hypot(this.viewPoint.x,this.viewPoint.y):this.cameraPoint.distanceTo(this.point));
      if(target.identity){target.identity.visible=Boolean(target.identity.userData.npcLabelRequested??target.identity.visible)&&opacity>0;target.identity.material.opacity=opacity;}
      sprite.visible = opacity > 0;
      sprite.material.opacity = opacity;
      sprite.position.copy(this.point).applyMatrix4(this.inverse);
      // Normally identity; protects the badge if a review transforms the scene.
      sprite.scale.set(entry.ticketWidth / Math.abs(this.worldScale.x || 1),
        entry.ticketHeight / Math.abs(this.worldScale.y || 1), 1);
    }
    for(const [label,saved] of this.visitorLabels)if(!saved.seen)this.visitorLabels.delete(label);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for(const [label,saved] of this.visitorLabels)label.position.copy(saved.position);this.visitorLabels.clear();
    this.root.removeFromParent();
    for (const { sprite } of this.entries) sprite.material.dispose();
    for(const {target,parent} of this.entries)if(target.identity){parent?.add(target.identity);target.identity.position.set(0,target.headTop??3.48,0);}
    this.texture.dispose();
    this.root.clear();
  }
}
