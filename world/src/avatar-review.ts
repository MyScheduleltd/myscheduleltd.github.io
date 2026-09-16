import { TOP_OUTFITS } from './world/CoastalOutfits';
import { createMentorDog, perchMentor } from './world/MentorDog';
import * as THREE from 'three';
import { loadImportedAvatar, attachImportedAvatar, syncImportedAvatars } from './world/ImportedAvatar';
import { poseCoastalCarry } from './world/CoastalCarry';
import { createCoastalDrink, createCoastalPopcorn } from './world/CoastalProps';
import { createCoastalAvatar, setCoastalSwimwear } from './world/CoastalAvatar';
import { createCoastalSkateboard } from './world/CoastalSkateboard';
import { waveCoastalPose, fallCoastalPose, landCoastalPose, djCoastalPose, jumpCoastalArms, hitCoastalPose, punchCoastalPose, COASTAL_STRIDE_LENGTH, walkCoastalPose, danceCoastalPose, skateCoastalPose, supportCoastalPose, seatCoastalLegs, coastalFootHeights } from './world/CoastalPose';
const q=new URLSearchParams(location.search);
await loadImportedAvatar();
if (!['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('Local art review only');
const scene=new THREE.Scene();scene.background=new THREE.Color(0xe8e5df);
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(innerWidth,Math.max(240,innerHeight-160));renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const camera=new THREE.OrthographicCamera(-2.2*innerWidth/Math.max(240,innerHeight-160),2.2*innerWidth/Math.max(240,innerHeight-160),2.2,-2.2,.1,30);camera.position.set(0,2.55,10);camera.lookAt(0,1.55,0);if(q.has('top')){camera.position.set(0,10,.001);camera.lookAt(0,1.55,0);}
if(q.has('face')){camera.zoom=2.7;camera.position.set(0,2.8,10);camera.lookAt(0,2.8,0);camera.updateProjectionMatrix();}
const sun=new THREE.DirectionalLight(0xfff1da,2.3);sun.position.set(-3,6,7);sun.castShadow=true;scene.add(sun,new THREE.HemisphereLight(0xeff2f5,0xb3adb0,2));
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-4;sun.shadow.camera.right=4;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-3;sun.shadow.camera.near=.5;sun.shadow.camera.far=20;
sun.shadow.bias=-.0004;sun.shadow.normalBias=.025;sun.shadow.radius=2;
if(q.get('light')==='grazing'){sun.position.set(-6,2,1);sun.intensity=3;}
if(q.get('light')==='neutral'){sun.position.set(-2,5,6);sun.intensity=2;}

const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0xe8e5df,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.28;floor.receiveShadow=true;scene.add(floor);
if(q.has('mask')) {floor.visible=false;document.getElementById('label')!.style.display='none';}
const reviewDog=q.has('mentor')?createMentorDog():undefined;const dogCarrier=new THREE.Group();if(reviewDog){dogCarrier.add(reviewDog.root);scene.add(dogCarrier);dogCarrier.position.x=1.5;}
const root=new THREE.Group();root.userData.wardrobeVariant=Number(q.get('family')??0);scene.add(root);const board=createCoastalSkateboard(root);
const rig=createCoastalAvatar(root,{skin:'#dfb590',hair:'#3b3633',top:TOP_OUTFITS.find(o=>o.id===q.get('outfit'))?.wire??TOP_OUTFITS[0].wire,bottoms:'#44464a',swimwear:'#577467',cap:q.has('cap')?'#3c434f':undefined,chain:q.has('gear')?'#a18b5d':undefined,backpack:q.has('gear')?'#4d6055':undefined,tattoo:q.has('gear')?'#3c434f':undefined},true,board);
const reviewPalette={skin:'#dfb590',hair:'#3b3633',top:TOP_OUTFITS.find(o=>o.id===q.get('outfit'))?.wire??TOP_OUTFITS[0].wire,bottoms:'#44464a',swimwear:'#577467',cap:q.has('cap')?'#3c434f':undefined};
attachImportedAvatar(root,rig,reviewPalette);
if(reviewDog&&q.get('mentor')==='carry')root.add(dogCarrier);
if(q.has('swim'))setCoastalSwimwear(root,true);
let phase=Number(q.get('phase')??0);const pose=q.get('pose')??'idle';
let playing=false,lastFrame=0;
if(pose==='walk')walkCoastalPose(rig,phase);
if(pose==='dance')danceCoastalPose(rig,phase);

if(pose==='hit')hitCoastalPose(rig,phase%1,Math.sin(Number(q.get('impactAngle')??Math.PI)),Math.cos(Number(q.get('impactAngle')??Math.PI)));
if(pose==='punch')punchCoastalPose(rig,(phase/(Math.PI*2))%1);
if(pose==='wave')waveCoastalPose(rig,phase*8,phase);
if(pose==='fall')fallCoastalPose(rig,-12);
if(pose==='land')landCoastalPose(rig,phase);
if(pose==='dj')djCoastalPose(rig,phase*8);
supportCoastalPose(rig);
if(pose==='seat'){
  const pad=Number(q.get('pad')??.4);root.position.y=pad+.23-1.1;
  seatCoastalLegs(rig,()=>-.28);rig.leftElbow!.rotation.x=rig.rightElbow!.rotation.x=-.8;
  const seat=new THREE.Mesh(new THREE.BoxGeometry(1.3,.10,.8),new THREE.MeshStandardMaterial({color:0x797d74,roughness:1}));seat.position.set(0,pad-.05,-.18);scene.add(seat);
}
if(pose==='skate-jump'){skateCoastalPose(rig,phase);jumpCoastalArms(rig,Math.cos(phase));}
if(pose==='skate'){root.position.y=.18;skateCoastalPose(rig,phase);}
const carried=new THREE.Group();root.add(carried);
const carryPose=['carry-cup','carry-popcorn','drink','eat'].includes(pose);
if(carryPose){carried.userData.carryHand=['drink','carry-cup'].includes(pose)?'right':'left';carried.add(carried.userData.carryHand==='right'?createCoastalDrink():createCoastalPopcorn());poseCoastalCarry(rig,carried,pose==='eat'?'eat':pose==='drink'?'drink':undefined,phase);}
root.rotation.y=Number(q.get('angle')??0);root.updateMatrixWorld(true);
const parts=root.userData.sculptRuntime.parts as Record<string,THREE.Mesh[]>;
const originals=new Map<THREE.Mesh,boolean>();
for(const meshes of Object.values(parts))for(const mesh of meshes)originals.set(mesh,mesh.visible);
const separated=new THREE.Group();root.add(separated);
let exploded=false,selected='';
const highlight=new THREE.Box3Helper(new THREE.Box3(),0xa6533f);highlight.visible=false;scene.add(highlight);
const visible=(object:THREE.Object3D):boolean=>object.visible&&(!object.parent||visible(object.parent));
function render(){
  syncImportedAvatars(scene);
  if(reviewDog&&q.get('mentor')==='carry')perchMentor(dogCarrier,reviewDog,rig.head,root.userData.importedHeadSupport());
  root.updateMatrixWorld(true);
  if(q.has('board')){
    for(const child of root.children)child.visible=child===board;
    board.visible=true;
    const underside=q.get('board')==='underside';
    floor.visible=!underside;
    camera.zoom=1.8;camera.position.set(0,underside?-2:2,5);
    camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  }
  const selection=new THREE.Box3();for(const mesh of parts[selected]??[])if(visible(mesh))selection.expandByObject(mesh);
  highlight.visible=!selection.isEmpty();highlight.box.copy(selection);
  renderer.render(scene,camera);
  document.body.dataset.avatarReview=JSON.stringify({model:'MYSCHEDULE neighbour',joints:Object.keys(root.userData.sculptRuntime.joints),parts:Object.entries(parts).map(([name,meshes])=>({name,kind:'part',triangles:meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3,0),visible:meshes.some(visible)})),unnamedMeshes:Object.values(parts).flat().filter(mesh=>!mesh.name).length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,feet:coastalFootHeights(rig),pose,phase,stage:q.get('stage')??'optimization-pass',selected,exploded});
}
function explode(){
  camera.zoom=exploded?.68:(q.has('face')?2.7:1);camera.updateProjectionMatrix();
  floor.visible=!exploded&&!q.has('mask');
  for(const child of [...separated.children]){
    const mesh=child as THREE.Mesh;mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.removeFromParent();
  }
  for(const [mesh,wasVisible] of originals)mesh.visible=wasVisible;
  syncImportedAvatars(root);
  if(exploded){
    // Freeze the currently skinned surfaces for inspection. Translating an
    // attached SkinnedMesh is cancelled by its inverse bind matrix.
    for(const [mesh,wasVisible] of originals){
      if(!wasVisible)continue;
      (mesh as THREE.SkinnedMesh).skeleton.update();
      const geometry=mesh.geometry.clone(),positions=geometry.getAttribute('position');
      const point=new THREE.Vector3();
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i);(mesh as THREE.SkinnedMesh).applyBoneTransform(i,point);
        root.worldToLocal(mesh.localToWorld(point));positions.setXYZ(i,point.x,point.y,point.z);
      }
      geometry.computeVertexNormals();geometry.computeBoundingBox();
      const view=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));
      view.name=mesh.name;view.userData.componentId=mesh.userData.componentId;
      view.position.copy(geometry.boundingBox!.getCenter(new THREE.Vector3())).sub(new THREE.Vector3(0,1.5,0)).multiplyScalar(.7);
      separated.add(view);mesh.visible=false;
    }
  }
  render();
}

if(!q.has('mask')){
  const controls=document.createElement('nav');controls.id='studio-controls';controls.setAttribute('aria-label','Avatar study controls');
  controls.innerHTML=`<label>Pose <select id="pose"><option value="idle">Standing</option><option value="walk">Walking</option><option value="carry-cup">Hold drink</option><option value="carry-popcorn">Hold popcorn</option><option value="drink">Drink</option><option value="eat">Eat popcorn</option><option value="punch">Punch</option><option value="hit">Receive punch</option><option value="dance">Dance</option><option value="wave">Wave</option><option value="fall">Falling</option><option value="land">Landing</option><option value="dj">DJ at decks</option><option value="seat">Sitting</option><option value="skate">Skateboard</option><option value="skate-jump">Skateboard jump</option></select></label><label>Outfit <select id="outfit">${TOP_OUTFITS.map(o=>`<option value="${o.id}">${o.en}</option>`).join('')}<option value="swim">Swimwear</option></select></label><label><input id="wear-cap" type="checkbox" ${q.has('cap')?'checked':''}> Cap</label><label>Cap colour <input id="cap-colour" type="color" value="#3c434f" ${q.has('cap')?'':'disabled'}></label><button id="play">Play motion</button>${carryPose||pose==='hit'?`<label>Action progress <input id="action-progress" type="range" min="0" max="1" step="0.01" value="${phase}"></label>`:""}<button id="turn">Turn 45°</button><button id="explode">Separate parts</button><label>Inspect <select id="part"><option value="">Click a part</option></select></label><output id="selection">Articulated garment study</output>`;
  document.body.append(controls);
  for(const id of ['pose','outfit']){
    const select=document.getElementById(id) as HTMLSelectElement;select.value=id==='outfit'?(q.has('swim')?'swim':q.get('outfit')??'1'):(q.get('pose')??'idle');
    select.onchange=()=>{if(id==='outfit'){if(select.value==='swim')q.set('swim','');else {q.delete('swim');q.set('outfit',select.value);}}else q.set(id,select.value);if(id==='pose'&&select.value==='walk')q.set('phase','1');location.search=q.toString();};
  }
  const capToggle=document.getElementById('wear-cap') as HTMLInputElement;
  const capColour=document.getElementById('cap-colour') as HTMLInputElement;
  const updateCap=()=>{capColour.disabled=!capToggle.checked;reviewPalette.cap=capToggle.checked?capColour.value:undefined;root.userData.setImportedPalette(reviewPalette);render();};
  capToggle.onchange=updateCap;capColour.oninput=updateCap;
  const play=document.getElementById('play') as HTMLButtonElement;
  play.disabled=!['walk','dance','skate','punch','hit','drink','eat','wave','land','dj'].includes(pose);
  const scrub=document.getElementById('action-progress') as HTMLInputElement|null;
  if(scrub)scrub.oninput=()=>{playing=false;play.textContent='Play motion';phase=Number(scrub.value);if(pose==='hit'){hitCoastalPose(rig,phase,Math.sin(Number(q.get('impactAngle')??Math.PI)),Math.cos(Number(q.get('impactAngle')??Math.PI)));supportCoastalPose(rig);render();return;}poseCoastalCarry(rig,carried,pose==='eat'?'eat':pose==='drink'?'drink':undefined,phase);render();};
  play.onclick=()=>{playing=!playing;lastFrame=0;play.textContent=playing?'Pause motion':'Play motion';};
  const select=document.getElementById('part') as HTMLSelectElement;
  for(const [name,meshes] of Object.entries(parts))if(meshes.some(visible)){const option=new Option(name,name);select.add(option);}
  const inspect=(name:string)=>{selected=name;select.value=name;document.getElementById('selection')!.textContent=name||'Click a part';render();};
  select.onchange=()=>inspect(select.value);
  document.getElementById('turn')!.onclick=()=>{root.rotation.y+=Math.PI/4;render();};
  document.getElementById('explode')!.onclick=()=>{exploded=!exploded;document.getElementById('explode')!.textContent=exploded?'Assemble parts':'Separate parts';explode();};
  renderer.domElement.addEventListener('pointerdown',event=>{
    const rect=renderer.domElement.getBoundingClientRect();
    const point=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    const ray=new THREE.Raycaster();ray.setFromCamera(point,camera);
    const hit=ray.intersectObjects(Object.values(parts).flat()).find(h=>visible(h.object));
    inspect(hit?.object.userData.componentId??'');
  });
}
render();

addEventListener('resize',()=>{
  renderer.setSize(innerWidth,Math.max(240,innerHeight-160));
  camera.left=-2.2*innerWidth/Math.max(240,innerHeight-160);camera.right=2.2*innerWidth/Math.max(240,innerHeight-160);
  camera.updateProjectionMatrix();render();
});

function animate(now:number){
  if(playing&&!exploded){
    if(lastFrame)phase+=Math.min((now-lastFrame)/1000,.05)*(['wave','land','dj'].includes(pose)?1/1.6:pose==='hit'?1/.62:carryPose?(pose==='drink'?1/1.8:1/2):Math.PI*2*(pose==='walk'?3.6/COASTAL_STRIDE_LENGTH:pose==='punch'?1/.56:1.6));
    if(pose==='walk')walkCoastalPose(rig,phase);
    if(pose==='dance')danceCoastalPose(rig,phase);
if(pose==='wave')waveCoastalPose(rig,phase*8,phase%1);
if(pose==='land')landCoastalPose(rig,phase%1);
if(pose==='dj')djCoastalPose(rig,phase*8);
if(pose==='hit')hitCoastalPose(rig,phase%1,Math.sin(Number(q.get('impactAngle')??Math.PI)),Math.cos(Number(q.get('impactAngle')??Math.PI)));
if(pose==='punch')punchCoastalPose(rig,(phase/(Math.PI*2))%1);
    if(pose==='skate')skateCoastalPose(rig,phase);else supportCoastalPose(rig);
    if(carryPose)poseCoastalCarry(rig,carried,pose==='eat'?'eat':pose==='drink'?'drink':undefined,phase%1);
    const scrub=document.getElementById('action-progress') as HTMLInputElement|null;if(scrub)scrub.value=String(phase%1);
    render();
  }
  lastFrame=now;requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
