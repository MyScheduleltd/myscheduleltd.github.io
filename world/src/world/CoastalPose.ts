import { reachCoastalHand } from './CoastalCarry';
import * as THREE from 'three';
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

/** One gait cycle travels this distance; stance velocity matches the moving body. */
export const COASTAL_STRIDE_LENGTH = 2.4;

export function walkCoastalPose(rig:AvatarRig,phase:number,amount=1):void {
  amount=THREE.MathUtils.clamp(amount,0,1);
  const reach=1.18-(.05+.18*Math.cos(phase)**2)*amount;
  legParts(rig).forEach(([hip,knee],i)=>{
    if(!knee)return;
    const t=((phase/(Math.PI*2)+i*.5)%1+1)%1;
    const u=(t-.55)/.45;
    // Hermite swing meets stance velocity at both ends, avoiding a mechanical reversal.
    const swing=-.66+1.32*u*u*(3-2*u)-1.08*(2*u*u*u-3*u*u+u);
    const z=(t<.55?.66-COASTAL_STRIDE_LENGTH*t:swing)*amount;
    const dy=-reach+(t<.55?0:.15*Math.sin(Math.PI*u)**2)*amount;
    const d=Math.min(1.17999,Math.hypot(dy,z));
    const bend=Math.acos(THREE.MathUtils.clamp((d*d-.66*.66-.52*.52)/(2*.66*.52),-1,1));
    hip.rotation.set(Math.atan2(-z,-dy)-Math.atan2(.52*Math.sin(bend),.66+.52*Math.cos(bend)),0,0);
    knee.rotation.set(bend,0,0);
  });
  const swing=Math.cos(phase-.22)*.28*amount;
  const spread=rig.visualRoot?.parent?.userData.importedAvatar ? .43+.015*amount : .36-.10*amount;
  rig.leftArm.rotation.set(swing,0,-spread);rig.rightArm.rotation.set(-swing,0,spread);
  rig.leftElbow?.rotation.set(-.22-Math.max(0,-swing)*.55,0,0);
  rig.rightElbow?.rotation.set(-.22-Math.max(0,swing)*.55,0,0);
  rig.leftWrist?.rotation.set(-.08,0,-.035);rig.rightWrist?.rotation.set(-.08,0,.035);
  rig.torso.rotation.set(.04*amount,Math.sin(phase-.25)*.055*amount,Math.sin(phase)*.022*amount);
  rig.head.rotation.set(-.02*amount,-Math.sin(phase-.25)*.035*amount,-Math.sin(phase)*.018*amount);
}

/** Symmetric knee bounce keeps both feet planted while the upper body follows the beat. */
export function danceCoastalPose(rig:AvatarRig,beat:number):void {
  const bounce=Math.sin(beat),sway=Math.sin(beat/2);
  const bend=.35+.15*(1-Math.cos(beat));
  const hip=-Math.atan2(.52*Math.sin(bend),.66+.52*Math.cos(bend));
  for(const [leg,knee] of legParts(rig)){leg.rotation.set(hip,0,0);knee?.rotation.set(bend,0,0);}
  rig.torso.rotation.set(.035,sway*.12,bounce*.035);
  rig.head.rotation.set(bounce*.025,-sway*.07,0);
  rig.leftArm.rotation.set(-.25+bounce*.25,0,-.30);
  rig.rightArm.rotation.set(-.25-bounce*.25,0,.30);
  rig.leftElbow?.rotation.set(-.75+bounce*.18,0,0);
  rig.rightElbow?.rotation.set(-.75-bounce*.18,0,0);
  rig.leftWrist?.rotation.set(-.10,0,-.035);rig.rightWrist?.rotation.set(-.10,0,.035);
  rig.treat.visible=false;
}


export function setCoastalFists(rig:AvatarRig,closed:boolean):void {
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
  rig.leftArm.rotation.set(-.52,0,-.27);rig.leftElbow?.rotation.set(-1.25,0,0);
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
  rig.leftArm.rotation.set(-.22,0,-.42-drop*.18);rig.rightArm.rotation.set(-.27,0,.42+drop*.18);
  rig.leftElbow?.rotation.set(-.55,0,0);rig.rightElbow?.rotation.set(-.65,0,0);
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
  reachCoastalHand(rig,false,new THREE.Vector3(-.98,1.30,.53+(working?Math.sin(seconds*4)*.055:0)),palmDown(false));
  reachCoastalHand(rig,true,new THREE.Vector3(.24,1.32,.46+(!working?Math.sin(seconds*1.4)*.08:0)),palmDown(true));
}
