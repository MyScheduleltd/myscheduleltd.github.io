import * as THREE from 'three';
import { FestivalWorld } from './world/FestivalWorld';
import { HeadTracking, type TrackedPoint } from './world/HeadTracking';
import { createCoastalAvatar } from './world/CoastalAvatar';
import { walkCoastalPose, supportCoastalPose } from './world/CoastalPose';
import { loadImportedAvatar, attachImportedAvatar, syncImportedAvatars, AVATAR_NATIVE, AVATAR_VARIANTS } from './world/ImportedAvatar';
import { outfitWire } from './world/CoastalOutfits';
import { FINGER_NAMES } from './world/HandPose';
if (!['localhost','127.0.0.1'].includes(location.hostname)) throw Error('Local tracking review only');
await loadImportedAvatar(undefined, AVATAR_VARIANTS);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e8e5df');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);document.body.append(renderer.domElement);
const sun=new THREE.DirectionalLight(0xfff1da,2.3);sun.position.set(-3,6,7);scene.add(sun,new THREE.HemisphereLight(0xeff2f5,0xb3adb0,2));
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0xbebbb5}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const q=new URLSearchParams(location.search);const select=(id:string)=>document.getElementById(id) as HTMLSelectElement;
for(const id of ['sex','outfit','arms','detection','hands','palm','lean','view'])if(q.has(id))select(id).value=q.get(id)!;
let root:THREE.Group,rig:ReturnType<typeof createCoastalAvatar>;
const xrRig=new THREE.Group(),eye=new THREE.PerspectiveCamera(65,1,.05,100);xrRig.add(eye);scene.add(xrRig);xrRig.rotation.y=-Math.PI;
const outside=new THREE.OrthographicCamera(-3,3,3,-3,.1,30);
const tracker=new HeadTracking();tracker.startForReview();
let realDetector=false,detectorStatus='Not loaded';
const testImages=Object.fromEntries(['thumb_up','pointing_up'].map(name=>{const image=new Image();image.src=`./review/mediapipe/${name}.jpg`;return [name,image];}));
document.getElementById('detector')!.onclick=async()=>{
 detectorStatus='Loading pinned models';render();
 try{realDetector=await tracker.loadForReview()&&await tracker.setBodyTracking(true);detectorStatus=realDetector?'Real MediaPipe detector running':tracker.message;}
 catch(e){detectorStatus=String(e);}
 render();
};
const runtime=Object.create(FestivalWorld.prototype);
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),M=()=>new THREE.Matrix4();
Object.assign(runtime,{headTracking:tracker,headTrackingActive:true,xrActive:true,xrSimulated:true,xrYaw:-Math.PI,xrSpineTwist:0,xrRig,camera:eye,
 moveVector:V(),airborne:false,playerState:'walking',trackedBodyShown:false,trackedHiddenParts:[],trackedLandmarks:[],trackedArms:{left:false,right:false},xrHandPoses:{left:null,right:null},xrHandSampleAt:{left:0,right:0},
 armWorld:V(),armSwing:V(),armLocal:V(),armAxisX:V(),armAxisY:V(),armAxisZ:V(),armBasis:M(),headForward:V(),armTarget:V(),armMeasured:V(),armWanted:V(),
 armQuat:Q(),armParentQuat:Q(),armMeasuredQuat:Q(),armDesiredQuat:Q(),armMatrix:M(),armVecA:V(),armVecB:V(),armVecC:V(),footSurfaceAt:()=>0});
function mount(){
 if(root)scene.remove(root);root=new THREE.Group();root.position.y=.28;scene.add(root);
 const sex=select('sex').value==='female'?'female':'male',palette={...AVATAR_NATIVE[sex],top:outfitWire(select('outfit').value as '1'|'2'|'3'|'4',sex)};
 rig=createCoastalAvatar(root,palette,true,new THREE.Group());attachImportedAvatar(root,rig,palette);
 Object.assign(runtime,{player:root,playerRig:rig,trackedBodyShown:false,trackedHiddenParts:[],trackedLandmarks:[],xrHandPoses:{left:null,right:null},xrHandSampleAt:{left:0,right:0}});
}
const sensor=(v:THREE.Vector3):TrackedPoint=>({x:v.x,y:-v.y,z:-v.z,visibility:1});
function body(){
 const lean=Number(select('lean').value),p=Array.from({length:33},()=>sensor(V()));
 const at=(i:number,x:number,y:number,z:number)=>p[i]=sensor(new THREE.Vector3(x,y,z));
 at(11,.18,.45,lean*.45);at(12,-.18,.45,lean*.45);
 for(const [s,e,w] of [[11,13,15],[12,14,16]]){const sign=s===11?1:-1;const mode=select('arms').value;
  if(mode==='wide'){at(e,sign*.5,.45,lean*.45);at(w,sign*.85,.5,lean*.45);}
  else if(mode==='overhead'){at(e,sign*.4,.75,lean*.45);at(w,sign*.45,1.1,lean*.45);}
  else if(mode==='cross'){at(e,sign*.35,.3,.2+lean*.45);at(w,-sign*.15,.3,.4+lean*.45);}
  else {at(e,sign*.22,.25,.15+lean*.45);at(w,sign*.22,.26,.4+lean*.45);}}
 at(23,.1,0,0);at(24,-.1,0,0);at(25,.1,-.42,0);at(26,-.1,-.42,0);at(27,.1,-.82,0);at(28,-.1,-.82,0);
 return p;
}
function hand(left:boolean){
 const sign=left?-1:1,mode=select('hands').value,roll=Number(select('palm').value)*(left?-1:1);
 const points=[V()];
 FINGER_NAMES.forEach((name,k)=>{
  let p=new THREE.Vector3(sign*(.055-k*.022),0,name==='Thumb'?.03:.085);points.push(p.clone());
  let theta=0;
  for(let i=0;i<3;i++){
   const curl=mode==='fist'||mode===name? [.5,1.0,.7][i] : mode==='pinch'&&name==='Index'?[.45,.8,.5][i]:0;
   theta+=curl;
   let d=name==='Thumb'?new THREE.Vector3(sign*.85,mode==='pinch'?.5:0,.5).normalize():new THREE.Vector3(0,-Math.sin(theta),Math.cos(theta));
   if(name==='Thumb'&&mode==='pinch')d=new THREE.Vector3(-sign*.35,-.65,.55).normalize();
   p=p.clone().addScaledVector(d,i===0?.028:.021);points.push(p.clone());
  }
 });
 return points.map(p=>sensor(p.applyAxisAngle(new THREE.Vector3(0,0,1),roll)));
}
function render(){
 walkCoastalPose(rig,0,0);supportCoastalPose(rig,()=>0);
 const now=performance.now(),pose=body(),detection=select('detection').value;
 if(detection==='occluded')for(const i of [13,14])pose[i].visibility=0;
 const sample=select('hands').value.replace('detector-','');
 if(select('hands').value.startsWith('detector-')){
  if(realDetector&&testImages[sample]?.complete)tracker.detectImageForReview(testImages[sample],now);
 }else tracker.feedBodyForReview(detection==='hands'?undefined:pose,{left:hand(true),right:hand(false)},now);
 Object.assign(tracker.pose,{yaw:.2,pitch:.1,roll:.05,x:.15,y:.1,z:.12});
 runtime.updateTrackedBody(1/30);syncImportedAvatars(root);
 const wearer=select('view').value==='Wearer';root.userData.setImportedHeadHidden(wearer);
 const w=innerWidth,h=Math.max(300,innerHeight-120);renderer.setSize(w,h);
 eye.aspect=w/h;eye.rotation.x=-THREE.MathUtils.clamp(Number(q.get('lookDown')??.65),.3,1.45);eye.updateProjectionMatrix();
 outside.left=-2*w/h;outside.right=2*w/h;outside.top=2;outside.bottom=-2;outside.zoom=1;
 if(select('view').value==='Side')outside.position.set(7,1.8,0);
 else if(select('view').value==='Hands'){outside.position.set(2.8,2.6,7);outside.zoom=2;}
 else outside.position.set(0,1.8,7);
 outside.lookAt(0,select('view').value==='Hands'?1.9:1.65,select('view').value==='Hands'?.75:0);outside.updateProjectionMatrix();
 renderer.render(scene,wearer?eye:outside);
 const gap=eye.getWorldPosition(V()).distanceTo(rig.head.getWorldPosition(V()));
 const data={sex:select('sex').value,outfit:select('outfit').value,pose:select('hands').value,palm:select('palm').value,view:select('view').value,eyeToHeadPivot:gap,detectorStatus,left:runtime.xrHandPoses.left,right:runtime.xrHandPoses.right};
 document.documentElement.dataset.trackingReview=JSON.stringify(data);
 document.getElementById('result')!.textContent=`${data.sex} · ${data.pose} · ${detectorStatus} · eye stays ${gap.toFixed(3)} units from head pivot`;
}
mount();for(const id of ['sex','outfit','arms','detection','hands','palm','lean','view'])select(id).onchange=()=>{if(id==='sex'||id==='outfit')mount();render();};
render();setInterval(render,100);addEventListener('resize',render);
