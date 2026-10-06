import * as THREE from 'three';
import type { AvatarRig, AvatarGesture } from './FestivalWorld';

const down=new THREE.Vector3(0,-1,0);
const smooth=(t:number)=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
export const COASTAL_CUP_OFFSET=new THREE.Vector3(-.325,-.13,0);
export const COASTAL_CARTON_OFFSET=new THREE.Vector3(.37,-.12,0);
export const COASTAL_STRAW_TIP=new THREE.Vector3(.075,.594,-.24);

/** The turn that carries one hand frame (palm, fingers) onto another. */
function turnFrame(palm0:THREE.Vector3,fingers0:THREE.Vector3,palm1:THREE.Vector3,fingers1:THREE.Vector3):THREE.Quaternion {
  const frame=(p:THREE.Vector3,f:THREE.Vector3)=>{
    const fingers=f.clone().normalize(),palm=p.clone().addScaledVector(fingers,-p.dot(fingers)).normalize();
    return new THREE.Matrix4().makeBasis(palm,fingers,palm.clone().cross(fingers));
  };
  return new THREE.Quaternion().setFromRotationMatrix(frame(palm1,fingers1).multiply(frame(palm0,fingers0).invert()));
}

/** Two rigid arm segments, solved in torso space; the elbow bends outward. */
export function reachCoastalHand(rig:AvatarRig,right:boolean,bodyTarget:THREE.Vector3,wristRotation=new THREE.Quaternion()):void {
  const shoulder=right?rig.rightArm:rig.leftArm,elbow=right?rig.rightElbow:rig.leftElbow,wrist=right?rig.rightWrist:rig.leftWrist;
  const body=rig.visualRoot;
  if(!elbow||!wrist||!body||!shoulder.parent)return;
  const nativeWrist=body.parent?.userData.importedWrist;
  // A target past the generated arm's reach is brought just inside it. Out of
  // reach, the passes below never settle, and a hand swaying across the edge
  // of reach (the male's wave) jumped between the two answers.
  const arm=body.parent?.userData.importedArm?.(right) as {shoulder:THREE.Vector3;reach:number}|undefined;
  if(arm){const out=bodyTarget.clone().sub(arm.shoulder);if(out.length()>arm.reach*.985)bodyTarget=arm.shoulder.clone().add(out.setLength(arm.reach*.985));}
  // The native wrist sits a few centimetres off the proxy's; aim past the
  // target by that much, capped.
  const corrected=bodyTarget.clone(),offset=new THREE.Vector3();
  for(let attempt=0;attempt<(nativeWrist?6:1);attempt++){
  corrected.copy(bodyTarget).add(offset);
  body.updateWorldMatrix(true,true);
  const target=shoulder.parent.worldToLocal(body.localToWorld(corrected.clone())).sub(shoulder.position);
  const length=THREE.MathUtils.clamp(target.length(),.09,.925),axis=target.normalize();
  const along=(.5*.5-.43*.43+length*length)/(2*length);
  const pole=new THREE.Vector3(right?1:-1,-1.6,-.15);
  pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  const upper=axis.clone().multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,.25-along*along)));
  shoulder.quaternion.setFromUnitVectors(down,upper.clone().normalize());
  const lower=axis.multiplyScalar(length).sub(upper).normalize().applyQuaternion(shoulder.quaternion.clone().invert());
  elbow.quaternion.setFromUnitVectors(down,lower);
  const torso=shoulder.parent.quaternion;
  wrist.quaternion.copy(torso).multiply(shoulder.quaternion).multiply(elbow.quaternion).invert().multiply(wristRotation);
  if(nativeWrist){
    // The imported skeleton has a different native wrist axis. Solve the
    // rendered palm/finger frame, rather than trusting the proxy wrist axes.
    const frame=body.parent!.userData.importedHandFrame?.(right);
    if(frame){
      const palm=new THREE.Vector3(right?-1:1,0,0).applyQuaternion(wristRotation);
      const fingers=down.clone().applyQuaternion(wristRotation);
      // A palm target cannot bend a real wrist backward through the sleeve.
      // Keep flexion within 40 degrees of the rendered lower arm.
      const angle=frame.forearm.angleTo(fingers),limit=THREE.MathUtils.degToRad(40);
      if(angle>limit){
        const swing=new THREE.Quaternion().setFromUnitVectors(frame.forearm,fingers);
        swing.slerp(new THREE.Quaternion(),1-limit/angle);
        fingers.copy(frame.forearm).applyQuaternion(swing).normalize();
      }
      palm.addScaledVector(fingers,-palm.dot(fingers)).normalize();
      const orientation=(p:THREE.Vector3,f:THREE.Vector3)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(p,f,p.clone().cross(f)));
      const correction=orientation(palm,fingers).multiply(orientation(frame.palm,frame.fingers).invert());
      const bodyWorld=body.getWorldQuaternion(new THREE.Quaternion());
      const targetWorld=bodyWorld.clone().multiply(correction).multiply(bodyWorld.clone().invert()).multiply(wrist.getWorldQuaternion(new THREE.Quaternion()));
      wrist.quaternion.copy(wrist.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(targetWorld);
    }
    const error=bodyTarget.clone().sub(nativeWrist(right));
    if(error.length()<.001)break;
    offset.addScaledVector(error,.8).clampLength(0,.12);
  }
  }
}

/** A side grip: the palm stays outside the container, with the thumb at its edge. */
export function poseCoastalCarry(rig:AvatarRig,prop:THREE.Group,gesture:AvatarGesture|undefined,progress:number):void {
  const body=rig.visualRoot,root=body?.parent;if(!body||!root)return;
  const right=prop.userData.carryHand==='right';
  const offset=right?COASTAL_CUP_OFFSET:COASTAL_CARTON_OFFSET;
  const wrist=right?rig.rightWrist:rig.leftWrist;if(!wrist)return;
  const hold=new THREE.Vector3(right?.72:-.66,right?1.55:1.62,.50);
  // The mouth anchor follows the head's actual motion, not a fixed world height.
  body.updateWorldMatrix(true,true);
  const mouth=body.worldToLocal(rig.head.localToWorld(root.userData.importedMouth?.clone()??new THREE.Vector3(0,.299,.302)));
  if(right&&gesture==='drink') {
    const lift=smooth(progress/.3)*(1-smooth((progress-.72)/.28));
    hold.lerp(mouth.clone().sub(COASTAL_STRAW_TIP).sub(offset),lift);
  }
  // Palm-in rest needs a quarter-turn: thumb up, fingers forward along
  // the container instead of pointing down its side.
  const holdingRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),root.userData.importedWrist?-Math.PI/2:0);
  reachCoastalHand(rig,right,hold,holdingRotation);
  // The fingers close round it rather than lying flat against its side.
  root.userData.setImportedGrip?.(right,right?.45:.35);
  body.updateWorldMatrix(true,true);
  const centre=(root.userData.importedWrist?.(right)??body.worldToLocal(wrist.getWorldPosition(new THREE.Vector3()))).add(offset);
  prop.position.copy(root.worldToLocal(body.localToWorld(centre)));
  prop.scale.copy(body.scale);
  prop.quaternion.copy(root.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(body.getWorldQuaternion(new THREE.Quaternion()));
  const bite=rig.treat;
  if(gesture==='eat'&&!right) {
    const lift=smooth((progress-.18)/.32)*(1-smooth((progress-.72)/.28));
    const imported=Boolean(root.userData.importedWrist);
    const pinch=new THREE.Vector3(-.12,1.965,.74).lerp(mouth.clone().add(imported?new THREE.Vector3(0,-.15,.22):new THREE.Vector3(0,.015,.28)),lift);
    // Brought up to the lips, the hand stays in line with the forearm: its
    // fingers rise towards the mouth, the palm turns to the face and the thumb
    // is uppermost, as anyone eats from their fingers. It used to be turned a
    // fixed 123 degrees about one axis, which bent the wrist back on itself.
    const rest=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.12);
    const lipsward=(forearm:THREE.Vector3)=>rest.clone().slerp(turnFrame(new THREE.Vector3(-1,0,0),down,new THREE.Vector3(-.35,0,-1),
      forearm.clone().lerp(new THREE.Vector3(-.25,.85,-.2).normalize(),.4).normalize()),lift);
    let handRotation=imported?lipsward(new THREE.Vector3(-.25,.85,-.2).normalize()):new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
    reachCoastalHand(rig,true,pinch,handRotation);
    // The fingers follow the forearm the arm actually took, part way to the
    // lips: the arms differ in length, and one fixed direction bent the
    // shorter one's wrist.
    if(imported&&lift>0){handRotation=lipsward(root.userData.importedHandFrame(true).forearm);reachCoastalHand(rig,true,pinch,handRotation);}
    if(imported&&lift>0)for(let attempt=0;attempt<4;attempt++){
      const error=mouth.clone().add(new THREE.Vector3(0,0,.02)).sub(root.userData.importedFingertip(true));
      if(error.length()<.008)break;
      reachCoastalHand(rig,true,pinch.add(error.multiplyScalar(lift)),handRotation);
    }
    bite.position.set(0,-.28,.015);bite.scale.set(.48,.48,.48);
    if(root.userData.importedWrist){
      const biteAt=root.userData.importedFingertip(true);
      bite.position.copy(bite.parent!.worldToLocal(body.localToWorld(biteAt)));
    }
    bite.visible=progress>.16&&progress<.65;
  } else {
    bite.position.set(0,-.15,.18);bite.scale.setScalar(1);
  }
}
