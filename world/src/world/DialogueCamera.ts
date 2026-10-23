import * as THREE from 'three';
import type {WorldCameraMode} from './WorldCamera';

export interface DialogueFrame { position:THREE.Vector3; target:THREE.Vector3 }
export interface DialogueFrameOptions {
  aspect:number; fov:number; playerEyeHeight?:number; subjectEyeHeight?:number;
  clearReach?:(origin:THREE.Vector3,target:THREE.Vector3)=>number;
  fallback?:DialogueFrame;
}
const UP=new THREE.Vector3(0,1,0);
const DIALOGUE_ANGLES=[0,-1.22,.7,-1.92,1.22,-2.44,1.9,Math.PI] as const;
function clearSegment(clearReach:NonNullable<DialogueFrameOptions['clearReach']>,from:THREE.Vector3,to:THREE.Vector3):boolean {
  return clearReach(from,to)>=from.distanceTo(to)-.015;
}

/** Conversation framing uses the actors' own floor heights, including stairs
 * and raised venues. No selected view, FOV, orbit or zoom preference is edited. */
export function dialogueFrame(mode:WorldCameraMode,player:THREE.Vector3,subject:THREE.Vector3,options:DialogueFrameOptions):DialogueFrame|undefined {
  if(mode==='isometric')return undefined;
  const playerEye=options.playerEyeHeight??2.84,subjectEye=options.subjectEyeHeight??2.84;
  const axis=subject.clone().sub(player).setY(0);
  if(axis.lengthSq()<1e-8)axis.set(0,0,-1);else axis.normalize();
  const side=new THREE.Vector3(-axis.z,0,axis.x);
  const playerHead=player.clone().add(new THREE.Vector3(0,playerEye,0)),subjectHead=subject.clone().add(new THREE.Vector3(0,subjectEye,0));
  const clearReach=options.clearReach;
  if(mode==='first-person'){
    for(const offset of [.12,-.12,0]){
      const frame={position:playerHead.clone().addScaledVector(side,offset),target:subjectHead.clone().add(new THREE.Vector3(0,-.16,0))};
      if(!clearReach||(clearSegment(clearReach,playerHead,frame.position)&&clearSegment(clearReach,subjectHead,frame.position)))return frame;
    }
    return options.fallback;
  }
  const target=player.clone().lerp(subject,.5);
  target.y=(player.y+playerEye*.62+subject.y+subjectEye*.62)/2-.2;
  // An over-shoulder two-shot, fitted to both actors' upper bodies. Portrait
  // uses more distance rather than cutting a face off at the edge. The lowest
  // fitted point stays above the bottom 35% of the frame, which is where the
  // full-width conversation box sits (up to 34dvh).
  const preferred=axis.clone().multiplyScalar(-.80).addScaledVector(side,.56).add(new THREE.Vector3(0,.22,0)).normalize();
  const tanV=Math.tan(THREE.MathUtils.degToRad(options.fov/2)),tanH=tanV*Math.max(.2,options.aspect);
  for(const angle of DIALOGUE_ANGLES){
    const backward=preferred.clone().applyAxisAngle(UP,angle),forward=backward.clone().negate();
    const right=new THREE.Vector3().crossVectors(forward,UP).normalize(),up=new THREE.Vector3().crossVectors(right,forward).normalize();
    let distance=4.6;
    for(const [actor,eye] of [[player,playerEye],[subject,subjectEye]] as const){
      for(const y of [eye*.38,eye+.25])for(const x of [-.62,.62]){
        const point=actor.clone().addScaledVector(side,x).add(new THREE.Vector3(0,y,0)).sub(target);
        const depth=point.dot(forward),horizontal=point.dot(right),vertical=point.dot(up);
        distance=Math.max(distance,Math.abs(horizontal)/(tanH*.83)-depth,vertical/(tanV*.86)-depth,-vertical/(tanV*.30)-depth);
      }
    }
    const frame={position:target.clone().addScaledVector(backward,distance),target};
    if(!clearReach||(clearSegment(clearReach,target,frame.position)&&clearSegment(clearReach,playerHead,frame.position)&&clearSegment(clearReach,subjectHead,frame.position)))return frame;
  }
  // A very confined space keeps the already-safe player view. Never collapse
  // a fully fitted conversation shot into somebody's face to clear a wall.
  return options.fallback;
}

/** One short ease into the conversation, with reusable output vectors. The
 * ordinary camera path resumes immediately when the owning modal closes. */
export class DialogueCameraTransition {
  private readonly startPosition:THREE.Vector3;
  private readonly startTarget:THREE.Vector3;
  private readonly output:DialogueFrame={position:new THREE.Vector3(),target:new THREE.Vector3()};
  private age=0;
  private cached?:{mode:WorldCameraMode;aspect:number;fov:number;player:THREE.Vector3;subject:THREE.Vector3;frame?:DialogueFrame};
  private cut=false;
  constructor(position:THREE.Vector3,target:THREE.Vector3){this.startPosition=position.clone();this.startTarget=target.clone();}
  frame(mode:WorldCameraMode,player:THREE.Vector3,subject:THREE.Vector3,options:DialogueFrameOptions):DialogueFrame|undefined {
    const old=this.cached;
    if(old&&old.mode===mode&&old.aspect===options.aspect&&old.fov===options.fov&&old.player.equals(player)&&old.subject.equals(subject))return old.frame;
    const fallback={position:this.startPosition,target:this.startTarget};
    const frame=dialogueFrame(mode,player,subject,{...options,fallback});
    this.cached={mode,aspect:options.aspect,fov:options.fov,player:player.clone(),subject:subject.clone(),frame};
    this.cut=false;
    if(frame&&options.clearReach){
      const clearReach=options.clearReach;
      // If an easing chord cuts through a corner, use a clean camera cut to
      // the checked composition rather than moving through solid masonry.
      this.cut=!clearSegment(clearReach,this.startPosition,frame.position);
      for(let n=0;n<=5&&!this.cut;n++){
        const position=this.startPosition.clone().lerp(frame.position,n/5),target=this.startTarget.clone().lerp(frame.target,n/5);
        this.cut=!clearSegment(clearReach,target,position);
      }
    }
    return frame;
  }
  step(frame:DialogueFrame,delta:number):DialogueFrame {
    this.age+=Math.max(0,delta);
    const t=this.cut?1:THREE.MathUtils.smoothstep(this.age,0,.42);
    this.output.position.lerpVectors(this.startPosition,frame.position,t);
    this.output.target.lerpVectors(this.startTarget,frame.target,t);
    return this.output;
  }
}

/** Only a held resident gets a private presentation clock. On release it
 * rejoins the ordinary shared clock along the same tested route at at most
 * twice walking pace. Background gaps and clock corrections cannot teleport
 * it forward; a backwards clock waits rather than walking the route backwards. */
export class NpcDialogueClock {
  private readonly entries=new Map<string,{time:number;lastMs:number;held:boolean}>();
  hold(id:string,presentationTime:number,nowMs:number):void {
    if(!Number.isFinite(presentationTime)||!Number.isFinite(nowMs))return;
    const existing=this.entries.get(id);
    this.entries.set(id,{time:existing?.time??presentationTime,lastMs:nowMs,held:true});
  }
  release(id:string,nowMs:number):void {
    const entry=this.entries.get(id);if(!entry)return;
    entry.held=false;entry.lastMs=nowMs;
  }
  sample(id:string,sharedSeconds:number,nowMs:number):number {
    const entry=this.entries.get(id);if(!entry)return sharedSeconds;
    const delta=(nowMs-entry.lastMs)/1000;entry.lastMs=nowMs;
    if(entry.held||!Number.isFinite(delta)||delta<=0||delta>.25||!Number.isFinite(sharedSeconds))return entry.time;
    entry.time+=Math.max(0,Math.min(sharedSeconds-entry.time,2*delta));
    if(Math.abs(sharedSeconds-entry.time)<1e-6){this.entries.delete(id);return sharedSeconds;}
    return entry.time;
  }
}
