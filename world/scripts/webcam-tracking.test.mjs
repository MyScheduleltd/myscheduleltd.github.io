import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LandmarkFilter, assignWebcamHands, handLandmarks } from '../src/world/TrackingFilter.ts';
import { FINGER_NAMES, handPoseFromJoints, handJointsFromLandmarks, limitHandPose, smoothHandPose } from '../src/world/HandPose.ts';

const point = (x = 0) => ({ x, y: 0, z: 0, visibility: 1 });
test('stationary webcam jitter shrinks while deliberate reaches respond within 100ms', () => {
 const f = new LandmarkFilter(); let raw = [], filtered = [];
 for (let k = 0; k < 180; k++) { const x = .006 * Math.sin(k * 2); const p = f.read([point(x)], 1000 + k * 1000 / 30)[0]; if(k>30){ raw.push(x*x);filtered.push(p.x*p.x); } }
 assert.ok(Math.sqrt(filtered.reduce((a,b)=>a+b)/raw.reduce((a,b)=>a+b)) < .55);
 let p; for(let k=0;k<3;k++) p=f.read([point(.3)],7000+k*1000/30)[0];
 assert.ok(p.x>.27);
});
test('render frames do not re-filter the same webcam sample', () => {
 const f=new LandmarkFilter(); f.read([point(0)],1000);const a=f.read([point(.1)],1033);
 for(let k=0;k<144;k++) assert.deepEqual(f.read([point(.1)],1033),a);
 assert.equal(f.read([point(NaN)],1066),undefined);
 assert.equal(f.read([point(.9)],1100)[0].x > a[0].x,true);
});
test('low-confidence landmarks cannot drag a shoulder through the body',()=>{
 const f=new LandmarkFilter();f.read([point(.1)],1000);
 const p=f.read([{...point(4),visibility:.1}],1033)[0]; assert.equal(p.x,.1);assert.equal(p.visibility,.1);
});
test('crossed hands keep distinct left/right assignments',()=>{
 const p=Array.from({length:33},()=>point());p[15]={x:.51,y:.5,z:0};p[16]={x:.49,y:.5,z:0};
 assert.deepEqual(assignWebcamHands([{x:.505,y:.5,z:0},{x:.55,y:.5,z:0}],p,['Right','Right']),['right','left']);
 assert.deepEqual(assignWebcamHands([{x:.505,y:.5,z:0}],p,['Left']),['left']);
});
function hand(right, angles){
 const sign=right?1:-1;const wrist=new THREE.Vector3(0,0,0), fingers={};
 FINGER_NAMES.forEach((n,k)=>{let p=new THREE.Vector3(sign*(.04-k*.015),.06,0);const chain=[p.clone()];let theta=0;
 angles.forEach((a,i)=>{theta+=a;p=p.clone().add(new THREE.Vector3(0,Math.cos(theta),Math.sin(theta)).multiplyScalar(.025-i*.004));chain.push(p);});fingers[n]=chain;});
 return {wrist,fingers};
}
test('both hands preserve curl under whole-hand rotation instead of bending backward',()=>{
 const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.6,-.7,.4));
 for(const right of [false,true]) {const joints=hand(right,[.2,.6,.35]);const a=handPoseFromJoints(joints,right);joints.wrist.applyQuaternion(rotation);for(const f of Object.values(joints.fingers))f.forEach(p=>p.applyQuaternion(rotation));const b=handPoseFromJoints(joints,right);
 for(const n of ['Index','Middle','Ring','Pinky'])for(let k=0;k<3;k++)assert.ok(Math.abs(a[n].curl[k]-b[n].curl[k])<1e-6);
 assert.ok(a.Index.curl[1]>.5); }
});
test('missing/degenerate hands drop out; anatomical limits reject broken bends',()=>{
 assert.equal(handJointsFromLandmarks(Array.from({length:21},()=>point())),undefined);
 const bad=Object.fromEntries(FINGER_NAMES.map(n=>[n,{curl:[-3,5,Infinity],spread:4}]));const out=limitHandPose(bad);
 assert.deepEqual(out.Index.curl,[-.08,1.75,0]); assert.equal(out.Index.spread,.5);
});
test('finger damping has the same response at 30, 60 and 144Hz',()=>{
 const a=limitHandPose(handPoseFromJoints(hand(true,[0,0,0]),true)),b=limitHandPose(handPoseFromJoints(hand(true,[.4,.5,.3]),true));
 const end=hz=>{let p=a;for(let k=0;k<hz;k++)p=smoothHandPose(p,b,Math.exp(-24/hz));return p.Index.curl[1];};
 assert.ok(Math.abs(end(30)-end(144))<1e-9);assert.ok(Math.abs(end(60)-end(144))<1e-9);
});

function detailedHand(right, poses) {
 const sign=right?1:-1,wrist=new THREE.Vector3(),fingers={};
 FINGER_NAMES.forEach((name,k)=>{
   const spec=poses[name]??{curl:[0,0,0],spread:0};
   let p=new THREE.Vector3(sign*(.04-k*.015),.07,0),theta=0;
   const chain=[p.clone()],flat=new THREE.Vector3(sign*Math.sin(spec.spread),Math.cos(spec.spread),0);
   for(let i=0;i<3;i++){theta+=spec.curl[i];p=p.clone().addScaledVector(flat,.025*Math.cos(theta)).add(new THREE.Vector3(0,0,.025*Math.sin(theta)));chain.push(p);}
   fingers[name]=chain;
 });
 // Keep the middle knuckle on the palm centre line.
 const shift=fingers.Middle[0].x;for(const chain of Object.values(fingers))chain.forEach(p=>p.x-=shift);
 return {wrist,fingers};
}
test('individual finger joints retain flexion while spread and palm orientation change',()=>{
 for(const right of [false,true])for(const name of ['Index','Middle','Ring','Pinky'])for(const spread of [-.35,0,.35]){
   const wanted={curl:[.35,.8,.5],spread};const joints=detailedHand(right,{[name]:wanted});
   for(const rotation of [new THREE.Quaternion(),new THREE.Quaternion().setFromEuler(new THREE.Euler(1.4,-.9,2.8))]){
     const rotated={wrist:joints.wrist.clone().applyQuaternion(rotation),fingers:Object.fromEntries(Object.entries(joints.fingers).map(([n,chain])=>[n,chain.map(p=>p.clone().applyQuaternion(rotation))]))};
     const reading=handPoseFromJoints(rotated,right);
     for(let i=0;i<3;i++)assert.ok(Math.abs(reading[name].curl[i]-wanted.curl[i])<1e-6,`${name} joint ${i}: ${reading[name].curl[i]}`);
     for(const other of ['Index','Middle','Ring','Pinky'].filter(n=>n!==name))assert.ok(reading[other].curl.every(v=>Math.abs(v)<1e-6),`${other} moved with ${name}`);
   }
 }
});
test('thumb abduction is not flattened into the palm by finger hyperextension limits',()=>{
 const pose=handPoseFromJoints(detailedHand(true,{}),true);pose.Thumb={curl:[-.6,.4,.7],spread:1.45};
 assert.deepEqual(limitHandPose(pose).Thumb,pose.Thumb);
 assert.deepEqual(limitHandPose({...pose,Index:{curl:[-.6,.4,.7],spread:0}}).Index.curl,[-.08,.4,.7]);
});

test('one occluded or backward finger cannot reverse another finger on a known webcam hand',()=>{
 for(const right of [false,true]){
  const joints=detailedHand(right,{Index:{curl:[0,-1,-.8],spread:0},Middle:{curl:[.1,.4,.2],spread:0}});
  const reading=limitHandPose(handPoseFromJoints(joints,right,true));
  assert.ok(Math.abs(reading.Middle.curl[1]-.4)<1e-6,'middle flexion flipped with noisy index');
  assert.deepEqual(reading.Index.curl.slice(1),[-.08,-.08]);
 }
});

test('a hand keeps following after its first frame although MediaPipe reports zero visibility', () => {
 // HandLandmarker puts visibility 0 on every hand point. Fed raw, the filter
 // held each one where the first frame found it, so the fingers froze while
 // the arms, from the pose model, kept moving (the owner, 2026-10-07).
 const hand = (x) => Array.from({ length: 21 }, (_, i) => ({ x: x + i * .001, y: 0, z: 0, visibility: 0 }));
 const raw = new LandmarkFilter();
 raw.read(hand(0), 1000);
 let frozen; for (let k = 1; k < 10; k++) frozen = raw.read(hand(.05), 1000 + k * 33)[0];
 assert.equal(frozen.x, 0, 'the old path stays frozen, which is the fault this guards');
 const fixed = new LandmarkFilter();
 fixed.read(handLandmarks(hand(0)), 1000);
 let moved; for (let k = 1; k < 10; k++) moved = fixed.read(handLandmarks(hand(.05)), 1000 + k * 33)[0];
 assert.ok(moved.x > .04, `the finger follows (${moved.x})`);
});

