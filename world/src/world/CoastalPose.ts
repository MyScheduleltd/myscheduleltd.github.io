import { reachCoastalHand } from './CoastalCarry';
import * as THREE from 'three';
import walkCycle from '../data/walk-cycle.json';
import type { AvatarRig } from './FestivalWorld';

export type WalkingFloor = (x: number, z: number, referenceY: number) => number;
const up=new THREE.Vector3(0,1,0);
const chain=new THREE.Matrix4(), next=new THREE.Matrix4();
const combined=new THREE.Quaternion(), target=new THREE.Quaternion();
const point=new THREE.Vector3(), normal=new THREE.Vector3();

function legParts(rig: AvatarRig) {
  return [
    [rig.leftLeg,rig.leftKnee,rig.leftAnkle],
    [rig.rightLeg,rig.rightKnee,rig.rightAnkle],
  ] as const;
}

function footMatrix(hip:THREE.Group,knee:THREE.Group,ankle:THREE.Group):THREE.Matrix4 {
  hip.updateMatrix();knee.updateMatrix();ankle.updateMatrix();
  return chain.copy(hip.matrix).multiply(knee.matrix).multiply(ankle.matrix);
}

/** Independent ankles keep shoes flat while the hip and knee bend above them. */
export function levelCoastalFeet(rig: AvatarRig): void {
  for(const [hip,knee,ankle] of legParts(rig)) {
    if(!knee||!ankle)continue;
    ankle.quaternion.copy(combined.copy(hip.quaternion).multiply(knee.quaternion).invert());
  }
}

/** Place the lower sole on the surface without changing authoritative player position. */
export function supportCoastalPose(rig:AvatarRig,floor?:WalkingFloor,localFloor=-.28):void {
  const body=rig.visualRoot,root=body?.parent;
  if(!body||!root)return;
  body.position.y=0;levelCoastalFeet(rig);
  body.updateWorldMatrix(true,false);
  const rootRotation=body.getWorldQuaternion(new THREE.Quaternion()).invert();
  let rise=-Infinity;
  for(const [hip,knee,ankle] of legParts(rig)) {
    if(!knee||!ankle)continue;
    if(floor){
      point.set(0,-.20,.1).applyMatrix4(footMatrix(hip,knee,ankle)).applyMatrix4(body.matrixWorld);
      const x=point.x,z=point.z,y=point.y;
      normal.set(-(floor(x+.2,z,y)-floor(x-.2,z,y))/.4,1,-(floor(x,z+.2,y)-floor(x,z-.2,y))/.4).normalize();
      // Retaining the ankle hinge while matching the local slope avoids tilted soles.
      if(normal.y>.85){
        target.setFromUnitVectors(up,normal.applyQuaternion(rootRotation));
        ankle.quaternion.copy(combined.copy(hip.quaternion).multiply(knee.quaternion).invert()).multiply(target);
      }
    }
    next.copy(footMatrix(hip,knee,ankle));
    if(floor)next.premultiply(body.matrixWorld);
    for(const x of [-.26,.26])for(const z of [-.235,.435]){
      point.set(x,-.20,z).applyMatrix4(next);
      rise=Math.max(rise,(floor?floor(point.x,point.z,point.y):localFloor)-point.y);
    }
  }
  // A distant floor belongs to jumping/swimming/a different storey, not an IK target.
  if(Number.isFinite(rise)&&rise>-.46&&rise<.95)body.position.y=rise;
  root.userData.supportImportedPose?.(floor,localFloor);
}

/** A sideways, symmetrical crouch; knees bend at their hinge, never twist for foot yaw. */
export function skateCoastalPose(rig:AvatarRig,phase:number):void {
  if(!rig.visualRoot)return;
  const bend=.64+Math.sin(phase*1.6)*.08;
  rig.visualRoot.rotation.y=-Math.PI/2;
  rig.leftLeg.rotation.set(-bend/2,0,-.30);
  rig.rightLeg.rotation.set(-bend/2,0,.30);
  rig.leftKnee?.rotation.set(bend,0,0);rig.rightKnee?.rotation.set(bend,0,0);
  rig.torso.rotation.set(.12,0,0);rig.head.rotation.set(0,1.15,0);
  rig.leftArm.rotation.set(0,0,-.9);rig.rightArm.rotation.set(0,0,.9);
  rig.leftElbow?.rotation.set(-.45,0,0);rig.rightElbow?.rotation.set(-.45,0,0);
  // Deck grip is 0.113 below the authoritative rider origin.
  supportCoastalPose(rig,undefined,-.113);
  rig.board.visible=true;
}

/** Solve each seated shin against its real floor; tall stools leave legs naturally hanging. */
export function seatCoastalLegs(rig:AvatarRig,floor:WalkingFloor):void {
  const body=rig.visualRoot,root=body?.parent;
  if(!body||!root)return;
  body.position.y=0;root.updateWorldMatrix(true,false);
  for(const [hip,knee,ankle] of legParts(rig)){
    if(!knee||!ankle)continue;
    hip.rotation.set(-Math.PI/2,0,0);
    const gap=(angle:number)=>{
      knee.rotation.set(angle,0,0);
      ankle.quaternion.copy(combined.copy(hip.quaternion).multiply(knee.quaternion).invert());
      point.set(0,-.20,.1).applyMatrix4(footMatrix(hip,knee,ankle)).applyMatrix4(root.matrixWorld);
      return point.y-floor(point.x,point.z,point.y);
    };
    let low=0,high=1.5;
    if(gap(high)<0){
      for(let i=0;i<14;i++){const middle=(low+high)/2;if(gap(middle)>0)low=middle;else high=middle;}
    }else low=high;
    gap((low+high)/2);
  }
  root.userData.supportImportedSeat?.(floor);
}

export function coastalFootHeights(rig:AvatarRig):number[] {
  const body=rig.visualRoot;
  if(!body)return [];
  body.updateWorldMatrix(true,false);
  return legParts(rig).flatMap(([hip,knee,ankle])=>{
    if(!knee||!ankle)return [];
    point.set(0,-.20,.1).applyMatrix4(footMatrix(hip,knee,ankle)).applyMatrix4(body.matrixWorld);
    return [point.y];
  });
}

/**
 * The walk is the owner's reference, a Mixamo "Walking" on the avatars' own
 * skeleton (art/reference/walking-mixamo.fbx), read into the rig's joint
 * angles by scripts/prepare-walk.py: one gait cycle, from the model's right
 * heel strike, 48 samples of each leg's swing, splay and knee, each arm's
 * swing, splay and elbow, and the chest's and head's turn.
 */
const WALK = walkCycle as {stride:number;frames:Array<Record<string,number|number[]>>};

/** One gait cycle travels this distance; stance velocity matches the moving body. */
export const COASTAL_STRIDE_LENGTH = WALK.stride;

const THIGH=.66,SHIN=.52;
/** The share of a cycle each foot is on the ground, from the reference. */
const STANCE=.55;

const sampled=(name:string,phase:number):number[]=>{
  const n=WALK.frames.length,f=(((phase/(Math.PI*2))%1+1)%1)*n,i=Math.floor(f),t=f-i;
  const a=WALK.frames[i%n][name],b=WALK.frames[(i+1)%n][name];
  const va=Array.isArray(a)?a:[a],vb=Array.isArray(b)?b:[b];
  return va.map((x,k)=>x+(vb[k]-x)*t);
};

/**
 * Hip swing and knee bend that put the ankle at (z forward, y up) from the
 * hip, for a leg first opened outward by an angle whose cosine is k: the hip
 * is Rx(swing)·Rz(open), the knee Rx(bend). In the leg's plane the foot sits
 * at Y = -(T + S cos b)·k, Z = -S sin b, and the swing turns that onto the
 * target.
 */
function solveLeg(z:number,y:number,k:number):[number,number]{
  const T=THIGH,S=SHIN,d2=z*z+y*y;
  // (T + S c)² k² + S² (1 - c²) = d², a quadratic in c = cos b.
  const qa=S*S*(k*k-1),qb=2*T*S*k*k,qc=T*T*k*k+S*S-d2;
  let c=Math.abs(qa)<1e-9?-qc/qb:(-qb+Math.sqrt(Math.max(0,qb*qb-4*qa*qc)))/(2*qa);
  if(!Number.isFinite(c)||Math.abs(c)>1)c=THREE.MathUtils.clamp((d2-T*T-S*S)/(2*T*S),-1,1);
  const bend=Math.acos(THREE.MathUtils.clamp(c,-1,1));
  const Y=-(T+S*Math.cos(bend))*k,Z=-S*Math.sin(bend);
  return [Math.atan2(z,y)-Math.atan2(Z,Y),bend];
}

export function walkCoastalPose(rig:AvatarRig,phase:number,amount=1):void {
  amount=THREE.MathUtils.clamp(amount,0,1);
  const imported=rig.visualRoot?.parent?.userData.importedAvatar;
  const legs:Array<[THREE.Object3D,THREE.Object3D|undefined,string,number]>=[[rig.leftLeg,rig.leftKnee,'left',0],[rig.rightLeg,rig.rightKnee,'right',.5]];
  for(const [hip,knee,side,offset] of legs){
    if(!knee)continue;
    // The reference's ankle path, through the rig's own thigh and shin.
    const ankle=(p:number)=>{const [a]=sampled(side+'Leg',p),[b]=sampled(side+'Knee',p);
      return [-(THIGH*Math.sin(a)+SHIN*Math.sin(a+b)),-(THIGH*Math.cos(a)+SHIN*Math.cos(a+b))];};
    const t=((phase/(Math.PI*2)-offset)%1+1)%1;
    const strike=ankle(offset*Math.PI*2),path=ankle(phase);
    // On the ground the foot stays exactly where it struck while the body
    // travels a stride a cycle; off it, the reference's swing, eased back
    // onto its own path by the next strike.
    const stanceZ=(u:number)=>strike[0]-COASTAL_STRIDE_LENGTH*u;
    let z:number;
    if(t<STANCE)z=stanceZ(t);
    else{const u=(t-STANCE)/(1-STANCE),left=stanceZ(STANCE)-ankle((offset+STANCE)*Math.PI*2)[0];z=path[0]+left*(1-u*u*(3-2*u));}
    // Never further than the leg reaches: the hip dips instead, which the
    // support pass turns into the walk's bob.
    // Wide trouser legs passing straight by each other met and looked stuck
    // together: an imported body's legs open a little, never less.
    const out=Math.sign(hip.position.x||1),[,splay]=sampled(side+'Leg',phase);
    const open=Math.max(splay*out*amount,imported?.07:0)*out;
    // Solved exactly for the opened leg: rotated out about Z first (three's
    // XYZ order), its reach forward and down shortens, so the knee and the
    // swing are found for the leg as it actually hangs. Standing (amount 0),
    // straight.
    const k=Math.cos(open),reach=(THIGH+SHIN)*k-1e-4,zz=z*amount;
    // How far below the hip the ankle is, as the reference measures it: its
    // hips dip a little on each step and the swinging foot lifts.
    const [drop]=sampled(side+'Drop',phase);
    const wantY=THREE.MathUtils.lerp(-reach,-reach*Math.min(1,drop),amount);
    const dy=-Math.sqrt(Math.max(0,Math.min(wantY*wantY,reach*reach-zz*zz)));
    const [swing,bend]=solveLeg(zz,dy,k);
    hip.rotation.set(swing,0,open);
    knee.rotation.set(bend,0,0);
  }
  // An imported body says how far its arms stand out: enough for the hands to
  // swing clear of its own trousers, and no further than the walk takes them.
  const rest=imported ? (imported.armSpread??.43) : .36;
  for(const [arm,elbow,side,sign] of [[rig.leftArm,rig.leftElbow,'left',-1],[rig.rightArm,rig.rightElbow,'right',1]] as const){
    const [swing,splay]=sampled(side+'Arm',phase),[bend]=sampled(side+'Elbow',phase);
    const spread=(rest+Math.max(0,splay*sign-rest)*amount)*sign;
    arm.rotation.set(swing*amount,0,spread);
    // Standing, an imported body's arms hang as it was generated: elbows and
    // wrists all but straight. Bent like the old rig's, the hands came out
    // in front of the thighs and she read as hunched (the owner, October 2).
    const hang=imported?-.05:-.22;
    elbow?.rotation.set(hang+(-bend-hang)*amount,0,0);
  }
  const wrist=imported?amount:1;
  rig.leftWrist?.rotation.set(-.08*wrist,0,-.035*wrist);rig.rightWrist?.rotation.set(-.08*wrist,0,.035*wrist);
  const torso=sampled('torso',phase),head=sampled('head',phase);
  rig.torso.rotation.set(torso[0]*amount,torso[1]*amount,torso[2]*amount);
  rig.head.rotation.set(head[0]*amount,head[1]*amount,head[2]*amount);
}

/** Symmetric knee bounce keeps both feet planted while the upper body follows the beat. */
/**
 * A groove on the club's beat: the knees drop on every beat, the fists pump in
 * turn over two, the chest twists and rolls with them and the head nods. The
 * old dance moved the arms a few degrees and nothing else, and read as standing
 * about. The legs keep their hinge (hip angle from knee bend), which holds each
 * ankle under its hip, so the soles stay planted wherever the beat is.
 */
export function danceCoastalPose(rig:AvatarRig,beat:number):void {
  const drop=.5-.5*Math.cos(beat),pump=Math.sin(beat/2),twist=Math.sin(beat/2+.6);
  const bend=.30+.50*drop;
  const hip=-Math.atan2(.52*Math.sin(bend),.66+.52*Math.cos(bend));
  for(const [leg,knee] of legParts(rig)){leg.rotation.set(hip,0,0);knee?.rotation.set(bend,0,0);}
  rig.torso.rotation.set(.06+.08*drop,twist*.22,pump*.07);
  rig.head.rotation.set(.12*drop-.04,-twist*.14,-pump*.05);
  // Each fist rises in turn from the chest, elbows out.
  const up=(v:number)=>Math.max(0,v);
  rig.leftArm.rotation.set(-.35-1.60*up(pump),0,-.40-.25*up(pump));
  rig.rightArm.rotation.set(-.35-1.60*up(-pump),0,.40+.25*up(-pump));
  rig.leftElbow?.rotation.set(-1.55+.75*up(pump),0,0);
  rig.rightElbow?.rotation.set(-1.55+.75*up(-pump),0,0);
  rig.leftWrist?.rotation.set(-.10,0,-.035);rig.rightWrist?.rotation.set(-.10,0,.035);
  rig.treat.visible=false;
}


/** Open both hands' carrying grips; the carry pose closes the one that holds something. */
export function releaseCoastalGrips(rig:AvatarRig):void {
  for(const right of [false,true])rig.visualRoot?.parent?.userData.setImportedGrip?.(right,0);
}

export function setCoastalFists(rig:AvatarRig,closed:boolean):void {
  rig.visualRoot?.parent?.userData.setImportedFists?.(closed);
  const parts=rig.visualRoot?.parent?.userData.sculptRuntime?.parts as Record<string,THREE.Mesh[]>|undefined;
  if(!parts)return;
  for(const side of ['l','r']){
    for(const mesh of parts['hand-'+side]??[])mesh.visible=!closed;
    for(const mesh of parts['fist-'+side]??[])mesh.visible=closed;
  }
}

/** A jab reaches contact at 200/560 of the gesture, then retracts along the same hinge plane. */
export function punchCoastalPose(rig:AvatarRig,progress:number):void {
  const t=THREE.MathUtils.clamp(progress,0,1),ease=(v:number)=>{v=THREE.MathUtils.clamp(v,0,1);return v*v*(3-2*v);};
  const extend=t<.18?0:t<.357?ease((t-.18)/.177):1-ease((t-.357)/.643);
  const coil=t<.18?ease(t/.18):t<.357?1-extend:0;
  walkCoastalPose(rig,0,0);setCoastalFists(rig,true);
  const bend=.24,hip=-Math.atan2(.52*Math.sin(bend),.66+.52*Math.cos(bend));
  for(const [leg,knee] of legParts(rig)){leg.rotation.set(hip,0,0);knee?.rotation.set(bend,0,0);}
  rig.torso.rotation.set(.025+extend*.045,-.12*coil+.20*extend,0);
  rig.head.rotation.set(0,.06*coil-.10*extend,0);
  // The other fist stays up by the chin. Bent only 72 degrees it floated out
  // at chest height, and at the moment of contact both arms reached forward.
  rig.leftArm.rotation.set(-.62,0,-.20);rig.leftElbow?.rotation.set(-2.05,0,0);
  rig.rightArm.rotation.set(-.10-extend*1.43,-.10*extend,.22-extend*.10);
  rig.rightElbow?.rotation.set(-1.40+extend*1.28,0,0);
  rig.rightWrist?.rotation.set(-.04,0,0);rig.leftWrist?.rotation.set(-.04,0,0);
  rig.treat.visible=false;
}

/** Low outward balance arms keep the hands outside the head throughout a jump. */
export function jumpCoastalArms(rig:AvatarRig,lift:number):void {
  const pitch=-.55-THREE.MathUtils.clamp(lift,-1,1)*.12;
  rig.leftArm.rotation.set(pitch,0,-.95);rig.rightArm.rotation.set(pitch,0,.95);
  rig.leftElbow?.rotation.set(-.35,0,0);rig.rightElbow?.rotation.set(-.35,0,0);
  rig.leftWrist?.rotation.set(-.1,0,-.035);rig.rightWrist?.rotation.set(-.1,0,.035);
}


/** Impact, delayed brace, then recovery. No clock-driven flailing or inherited walk pose. */
export function hitCoastalPose(rig:AvatarRig,progress:number,awayX=0,awayZ=-1):void {
  const t=THREE.MathUtils.clamp(progress,0,1);
  const ease=(v:number)=>{v=THREE.MathUtils.clamp(v,0,1);return v*v*v*(v*(v*6-15)+10);};
  const pulse=(peak:number,end:number)=>t<peak?ease(t/peak):1-ease((t-peak)/(end-peak));
  const impact=pulse(.15,.82),head=pulse(.23,.94),brace=pulse(.31,1),settle=pulse(.39,1);
  const length=Math.hypot(awayX,awayZ)||1;awayX/=length;awayZ/=length;
  walkCoastalPose(rig,0,0);
  // Weight is caught by the knees; both ankles retain a level supporting sole.
  const bend=.0083+.43*settle;
  const hip=-Math.atan2(.52*Math.sin(bend),.66+.52*Math.cos(bend));
  for(const [leg,knee] of legParts(rig)){leg.rotation.set(hip,0,0);knee?.rotation.set(bend,0,0);}
  rig.torso.rotation.set(awayZ*.23*impact,.07*impact,-awayX*.18*impact);
  rig.head.rotation.set(awayZ*.14*head,-.04*head,-awayX*.10*head);
  const spread=rig.leftArm.rotation.z;
  rig.leftArm.rotation.set(-.34*brace,0,spread-.19*brace);
  rig.rightArm.rotation.set(-.24*brace,0,-spread+.15*brace);
  rig.leftElbow?.rotation.set(-.22-.46*brace,0,0);
  rig.rightElbow?.rotation.set(-.22-.37*brace,0,0);
  rig.leftWrist?.rotation.set(-.08-.04*brace,0,-.035);
  rig.rightWrist?.rotation.set(-.08-.03*brace,0,.035);
  rig.treat.visible=false;
  levelCoastalFeet(rig);
}

/** Greeting uses an outward shoulder, one elbow hinge and a small forearm rotation. */
export function waveCoastalPose(rig:AvatarRig,phase:number,progress=.5):void {
  const ease=(t:number)=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
  const lift=ease(progress/.32)*(1-ease((progress-.68)/.32));
  rig.rightArm.rotation.set(0,0,.18);rig.rightElbow?.rotation.set(-.22,0,0);rig.rightWrist?.rotation.set(0,0,0);
  const rest=[rig.rightArm.quaternion.clone(),rig.rightElbow?.quaternion.clone(),rig.rightWrist?.quaternion.clone()];
  const palmForward=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,-1,0),new THREE.Vector3(-1,0,0)));
  reachCoastalHand(rig,true,new THREE.Vector3(.90+.07*Math.sin(phase*2.2),2.75,.20),palmForward);
  [rig.rightArm,rig.rightElbow,rig.rightWrist].forEach((joint,i)=>{if(joint&&rest[i])joint.quaternion.slerpQuaternions(rest[i]!,joint.quaternion.clone(),lift);});
}

/** A controlled airborne brace; no cyclic windmilling or walking in mid-air. */
export function fallCoastalPose(rig:AvatarRig,velocity=-10):void {
  walkCoastalPose(rig,0,0);
  const drop=THREE.MathUtils.clamp(-velocity/18,0,1);
  rig.torso.rotation.x=.06+drop*.12;rig.head.rotation.x=.10;
  // Airborne: arms flung up and out for balance. Held low they read as
  // somebody standing with their arms slightly out, not somebody falling.
  rig.leftArm.rotation.set(-.30,0,-2.05-drop*.20);rig.rightArm.rotation.set(-.36,0,2.05+drop*.20);
  rig.leftElbow?.rotation.set(-.70,0,0);rig.rightElbow?.rotation.set(-.80,0,0);
  rig.leftLeg.rotation.x=-.18;rig.rightLeg.rotation.x=-.12;
  rig.leftKnee?.rotation.set(.40,0,0);rig.rightKnee?.rotation.set(.32,0,0);
  levelCoastalFeet(rig);
}

/** Contact, knee compression and gradual recovery, ending exactly at idle. */
export function landCoastalPose(rig:AvatarRig,progress:number,severity=1):void {
  walkCoastalPose(rig,0,0);
  const t=THREE.MathUtils.clamp(progress,0,1);
  const ease=(v:number)=>{v=THREE.MathUtils.clamp(v,0,1);return v*v*v*(v*(v*6-15)+10);};
  const compression=(t<.22?.25+.75*ease(t/.22):1-ease((t-.22)/.78))*severity;
  const knee=.70*compression;
  rig.leftLeg.rotation.x=-knee*.46;rig.rightLeg.rotation.x=-knee*.46;
  rig.leftKnee?.rotation.set(knee,0,0);rig.rightKnee?.rotation.set(knee,0,0);
  rig.torso.rotation.x=.27*compression;rig.head.rotation.x=-.10*compression;
  rig.leftArm.rotation.set(-.4*compression,0,-.18-.25*compression);
  rig.rightArm.rotation.set(-.36*compression,0,.18+.25*compression);
  rig.leftElbow?.rotation.set(-.22-.45*compression,0,0);rig.rightElbow?.rotation.set(-.22-.40*compression,0,0);
  levelCoastalFeet(rig);
}

/** Four-bar phrase: cue the inner record edge, then adjust a channel fader. */
export function djCoastalPose(rig:AvatarRig,seconds:number):void {
  walkCoastalPose(rig,0,0);
  const cycle=seconds%8,working=cycle<4;
  rig.torso.rotation.set(.20,.018*Math.sin(seconds*1.6),0);
  rig.head.rotation.set(.18,.08*Math.sin(seconds*.7),0);
  // Mirror the palm axes so both hands rest flat on the controls, fingers forward.
  const palmDown=(right:boolean)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0,right?1:-1,0),new THREE.Vector3(0,0,-1),new THREE.Vector3(right?-1:1,0,0)));
  // Wrists a little back from the deck's front edge: the generated hands are
  // longer than the old blocky ones and their fingertips went over it. The
  // platter hand reaches far out, where the 40 degree wrist limit keeps its
  // fingers raised, so its wrist sits a centimetre lower and further out.
  reachCoastalHand(rig,false,new THREE.Vector3(-1.005,1.27,.50+(working?Math.sin(seconds*4)*.055:0)),palmDown(false));
  // Lift the mixer-hand target 3cm to keep native fingertips on the fader
  // surface once both shoes are planted on the platform.
  reachCoastalHand(rig,true,new THREE.Vector3(.24,1.33,.43+(!working?Math.sin(seconds*1.4)*.08:0)),palmDown(true));
}
