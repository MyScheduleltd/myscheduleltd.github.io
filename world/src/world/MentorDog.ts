import * as THREE from 'three';

export interface MentorDogRig {
  root: THREE.Group;
  head: THREE.Group;
  leftFrontLeg: THREE.Group;
  rightFrontLeg: THREE.Group;
  leftBackLeg: THREE.Group;
  rightBackLeg: THREE.Group;
  tail: THREE.Group;
  body: THREE.Mesh;
}

const dogMaterial = (color: number, roughness = 0.9) => new THREE.MeshStandardMaterial({
  color,
  roughness,
  metalness: 0,
  flatShading: true,
});

const addBlock = (
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  meshMaterial: THREE.Material,
  parent: THREE.Object3D,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), meshMaterial);
  mesh.name = name;
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

/**
 * Animation-ready block-style reconstruction of MENTOR. The dog deliberately
 * shares the square Roblox/Minecraft-like visual grammar of the festival's
 * attendee avatars: a readable horizontal body, four grounded legs, a cube
 * head, slab ears, and a short square muzzle. Local +Z is forward.
 */
export const createMentorDog = (): MentorDogRig => {
  const root = new THREE.Group();
  root.name = 'mentor-dog-root';
  // Medium companion: knee-to-thigh height, scaled about the paw contact plane.
  root.scale.setScalar(.68);
  root.position.y=-.28*(1-.68);

  const fur = dogMaterial(0x55342a);
  const furLight = dogMaterial(0x704a3a);
  const furDark = dogMaterial(0x2d1b18);
  const face = dogMaterial(0x090708, 0.55);
  const collar = dogMaterial(0x9f1422, 0.72);

  // The long horizontal block makes the four-footed animal silhouette clear
  // from the same distances at which the human NPCs are read.
  const bodyPivot = new THREE.Group();
  bodyPivot.name = 'body-pivot';
  bodyPivot.position.set(0, 0.74, 0);
  root.add(bodyPivot);
  const body = addBlock('square-horizontal-torso', [0.86, 0.7, 1.35], [0, 0, 0], fur, bodyPivot);
  addBlock('square-chest', [0.72, 0.62, 0.34], [0, 0.02, 0.66], furLight, bodyPivot);
  addBlock('red-collar', [0.76, 0.12, 0.56], [0, 1.02, 0.53], collar, root);

  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.set(0, 1.25, 0.78);
  root.add(head);
  addBlock('square-poodle-head', [0.9, 0.74, 0.74], [0, 0, 0], fur, head);
  addBlock('left-flat-ear', [0.24, 0.62, 0.26], [-0.56, -0.08, 0], furDark, head);
  addBlock('right-flat-ear', [0.24, 0.62, 0.26], [0.56, -0.08, 0], furDark, head);
  addBlock('square-muzzle', [0.5, 0.28, 0.32], [0, -0.13, 0.49], furLight, head);
  addBlock('square-nose', [0.2, 0.17, 0.12], [0, -0.11, 0.69], face, head);
  addBlock('left-square-eye', [0.1, 0.11, 0.07], [-0.22, 0.1, 0.4], face, head);
  addBlock('right-square-eye', [0.1, 0.11, 0.07], [0.22, 0.1, 0.4], face, head);

  const createLeg = (name: string, x: number, z: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.name = `${name}-socket`;
    pivot.position.set(x, 0.5, z);
    root.add(pivot);
    // Bottom is local y=-0.28. With the NPC's ground offset, all four blocks
    // land on the same floor plane instead of floating or becoming humanoid.
    addBlock(`${name}-square-leg`, [0.25, 0.78, 0.27], [0, -0.39, 0], furDark, pivot);
    return pivot;
  };
  const leftFrontLeg = createLeg('left-front-leg', -0.3, 0.48);
  const rightFrontLeg = createLeg('right-front-leg', 0.3, 0.48);
  const leftBackLeg = createLeg('left-back-leg', -0.3, -0.48);
  const rightBackLeg = createLeg('right-back-leg', 0.3, -0.48);

  const tail = new THREE.Group();
  tail.name = 'tail-socket';
  tail.position.set(0, 0.92, -0.68);
  tail.rotation.x = -0.7;
  root.add(tail);
  addBlock('short-square-tail', [0.22, 0.22, 0.64], [0, 0.08, -0.24], furLight, tail);

  const carrySocket = new THREE.Object3D();
  carrySocket.name = 'carry-socket';
  carrySocket.position.set(0, 1.62, 0);
  root.add(carrySocket);

  root.userData.sculptRuntime = {
    parts: ['square-body', 'square-head', 'left-ear', 'right-ear', 'muzzle', 'collar', 'left-front-leg', 'right-front-leg', 'left-back-leg', 'right-back-leg', 'tail'],
    pivots: {
      head: head.name,
      leftFrontLeg: leftFrontLeg.name,
      rightFrontLeg: rightFrontLeg.name,
      leftBackLeg: leftBackLeg.name,
      rightBackLeg: rightBackLeg.name,
      tail: tail.name,
    },
    sockets: [leftFrontLeg.name, rightFrontLeg.name, leftBackLeg.name, rightBackLeg.name, tail.name, carrySocket.name],
    colliders: [{ type: 'box', size: [0.92, 1.62, 1.55], center: [0, 0.66, 0] }],
    inferredRegions: ['grounded leg length', 'rear torso depth', 'tail'],
    style: 'simple block-style festival NPC',
  };

  root.scale.setScalar(0.68);
  return { root, head, leftFrontLeg, rightFrontLeg, leftBackLeg, rightBackLeg, tail, body };
};

/** Keep a compact, still perch in the animated head frame, with paws on the crown. */
export function perchMentor(group:THREE.Group, rig:MentorDogRig, head:THREE.Object3D, support:THREE.Vector3):void {
  const parent=group.parent;if(!parent)return;
  for(const [leg,sign] of [[rig.leftFrontLeg,1],[rig.rightFrontLeg,-1],[rig.leftBackLeg,1],[rig.rightBackLeg,-1]] as const)leg.rotation.set(0,0,sign*1.08);
  group.scale.setScalar(.56);
  parent.updateWorldMatrix(true,false);head.updateWorldMatrix(true,false);
  group.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(head.getWorldQuaternion(new THREE.Quaternion())));
  group.position.copy(parent.worldToLocal(head.localToWorld(support.clone())));
  group.updateWorldMatrix(false,true);
  // Measure the actual tucked legs, not the standing dog's old origin.
  let lowest=Infinity;
  for(const leg of [rig.leftFrontLeg,rig.rightFrontLeg,rig.leftBackLeg,rig.rightBackLeg])leg.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    const positions=o.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)lowest=Math.min(lowest,group.worldToLocal(o.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,i))).y);
  });
  group.position.add(new THREE.Vector3(0,.006-lowest*.56,0).applyQuaternion(group.quaternion));
  group.updateWorldMatrix(false,true);
}

/** Distance-driven trot; collisions and teleports cannot make stationary paws shuffle. */
export function stepMentorGait(rig:MentorDogRig,delta:number,moving:boolean):{phase:number;amount:number} {
  const position=rig.root.getWorldPosition(new THREE.Vector3());
  const state=rig.root.userData.gait??={x:position.x,z:position.z,phase:0,amount:0};
  const dt=THREE.MathUtils.clamp(delta,0,.1);
  const distance=Math.hypot(position.x-state.x,position.z-state.z);
  const speed=dt>0&&distance<2?distance/dt:0;
  const active=moving&&speed>.12;
  if(active)state.phase+=Math.min(distance/1.8,dt*1.15)*Math.PI*2;
  state.amount+=(Number(active)*Math.min(1,speed/2)-state.amount)*(1-Math.exp(-10*dt));
  state.x=position.x;state.z=position.z;
  return state;
}
