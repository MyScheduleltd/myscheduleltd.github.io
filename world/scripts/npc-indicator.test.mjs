import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: "export * from './src/world/NpcIndicator';export * from './src/world/NpcRoster';export {WorldCamera} from './src/world/WorldCamera';export {FestivalWorld} from './src/world/FestivalWorld';export {PLANET,planetBendPoint} from './src/world/PlanetCurve';export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node',loader:{'.png':'dataurl'} });
const { THREE, NpcIndicators, NPC_INDICATOR, npcIndicatorOpacity,createNpcIdentityTexture,NPC_TITLES,NPC_CHARACTER_TITLES,npcCharacterTitleIn,DEFAULT_NPC_NAMES,DEFAULT_NPC_PROFILES,FestivalWorld,WorldCamera,PLANET,planetBendPoint } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const paints = [];
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  const commands = [];
  const context = new Proxy({}, { get: (object, key) => key==='measureText'?text=>({width:Array.from(text).reduce((sum,c)=>sum+(c===' '?.3:/[A-Za-z0-9.]/.test(c)?.6:1),0)*(Number(/ (\d+(?:\.\d+)?)px/.exec(object.font??'')?.[1])||40)}):key in object ? object[key] : (...args) => commands.push([key, ...args]), set: (object, key, value) => { object[key] = value; commands.push(['set', key, value]); return true; } });
  const canvas = { width: 0, height: 0, getContext(type) { assert.equal(type, '2d'); return context; } };
  paints.push({ canvas, commands });
  return canvas;
} };

const camera = () => { const result = new THREE.PerspectiveCamera(); result.position.set(0, 4, 7); return result; };
const target = (scene, id) => {
  const group = new THREE.Group(), head = new THREE.Group();
  head.position.y = 2.5; group.add(head); scene.add(group);
  return { id, group, head };
};
const nearly = (a, b) => assert.ok(a.distanceTo(b) < 1e-7, `${a.toArray()} != ${b.toArray()}`);

test('resident tickets hide for both local and remote player-controlled identities, hidden bodies and detached bodies', () => {
  const scene = new THREE.Scene(), locals = target(scene, 'A'), remotes = target(scene, 'B'), dog = target(scene, 'MENTOR');
  const pool = new NpcIndicators(scene, [locals, remotes, dog]);
  pool.update(camera()); assert.deepEqual(pool.root.children.map(s => s.visible), [true, true, true]);
  pool.update(camera(), { localPlayerNpcId: 'A', remotePlayerNpcIds: new Map([['B', { visitorId: 'player' }]]) });
  assert.deepEqual(pool.root.children.map(s => s.visible), [false, false, true]);
  pool.update(camera(), { localPlayerNpcId: 'MENTOR', remotePlayerNpcIds: new Set() });
  assert.deepEqual(pool.root.children.map(s => s.visible), [true, true, false]);
  const hiddenParent = new THREE.Group(); scene.add(hiddenParent); hiddenParent.add(locals.group); hiddenParent.visible = false;
  remotes.group.removeFromParent(); pool.update(camera());
  assert.deepEqual(pool.root.children.map(s => s.visible), [false, false, true]);
  assert.equal(scene.children.some(o => o.userData.remoteVisitor && o.children.some(s => s.userData.npcIndicator)), false);
  pool.dispose();
});

test('head crowns follow movement, gestures, late imported caps and carried MENTOR without inheriting puppet scale', () => {
  const scene = new THREE.Scene(), human = target(scene, 'A'), dog = target(scene, 'MENTOR');
  let crown = new THREE.Vector3(.08, .48, -.02); human.crown = () => crown;
  dog.headOffset = new THREE.Vector3(0, .37, 0);
  const pool = new NpcIndicators(scene, [human, dog]), view = camera();
  human.group.position.set(3, 1, -2); human.group.rotation.y = .6; human.head.rotation.x = .2;
  pool.update(view);
  nearly(pool.root.children[0].position, human.head.localToWorld(crown.clone()).add(new THREE.Vector3(0, NPC_INDICATOR.clearance, 0)));
  const first = pool.root.children[0].position.clone();
  crown = new THREE.Vector3(.08, .7, -.02); human.group.position.x += 1; pool.update(view);
  assert.ok(pool.root.children[0].position.distanceTo(first) > .9);
  human.head.add(dog.group); dog.group.position.set(0, .8, 0); dog.group.scale.setScalar(.56); dog.head.scale.setScalar(.68); dog.head.rotation.x = -.12;
  pool.update(view);
  const carriedCrown=dog.head.localToWorld(dog.headOffset.clone()).project(view);
  assert.ok(bounds(pool.root.children[0],view).bottom>carriedCrown.y,'the carrier ticket must clear the perched body too');
  assert.ok(bounds(pool.root.children[1],view).bottom>bounds(pool.root.children[0],view).top,'carried tickets must remain separate');
  assert.equal(pool.root.children[1].parent, pool.root);
  assert.deepEqual(pool.root.children[1].scale.toArray(), [NPC_INDICATOR.width, NPC_INDICATOR.height, 1]);
  assert.equal(dog.group.parent, human.head);
  pool.dispose();
});

test('distant tickets fade without new buffers, lights or bitmap paints; depth testing prevents showing through buildings', () => {
  assert.equal(npcIndicatorOpacity(0), 1); assert.equal(npcIndicatorOpacity(17), 1);
  assert.equal(npcIndicatorOpacity(24), .5); assert.equal(npcIndicatorOpacity(31), 0); assert.equal(npcIndicatorOpacity(Infinity), 0);
  let previous = 1; for (let d = 0; d <= 35; d += .25) { const opacity = npcIndicatorOpacity(d); assert.ok(opacity <= previous && opacity >= 0); previous = opacity; }
  const scene = new THREE.Scene(), resident = target(scene, 'A'), pool = new NpcIndicators(scene, [resident]), view = camera();
  const sprite = pool.root.children[0], geometry = sprite.geometry, bitmapCount = paints.length;
  pool.update(view); const anchor = sprite.position.clone(); view.position.copy(anchor).add(new THREE.Vector3(0, 0, 24)); pool.update(view);
  assert.equal(sprite.material.opacity, .5); assert.equal(sprite.visible, true);
  for (let i = 0; i < 100; i++) pool.update(view);
  assert.equal(paints.length, bitmapCount); assert.equal(sprite.geometry, geometry);
  view.position.z += 8; pool.update(view); assert.equal(sprite.visible, false);
  assert.equal(sprite.material.depthTest, true); assert.equal(sprite.material.depthWrite, false); assert.equal(sprite.material.toneMapped, false);
  assert.equal(pool.root.children.some(o => o.isLight), false); assert.equal(pool.report.lights, 0);
  assert.equal(pool.report.decodedBytes, 114688);
  pool.dispose();
});

test('all badges share one exact NPC ticket texture with high monochrome contrast, released once without touching avatar resources', () => {
  const scene = new THREE.Scene(), a = target(scene, 'A'), b = target(scene, 'B');
  const avatarGeometry = new THREE.BoxGeometry(), avatarMaterial = new THREE.MeshStandardMaterial();
  a.group.add(new THREE.Mesh(avatarGeometry, avatarMaterial));
  let avatarDisposals = 0; avatarGeometry.addEventListener('dispose', () => avatarDisposals++); avatarMaterial.addEventListener('dispose', () => avatarDisposals++);
  const pool = new NpcIndicators(scene, [a, b]), [first, second] = pool.root.children, map = first.material.map;
  assert.equal(second.material.map, map); assert.notEqual(first.material, second.material);
  assert.equal(map.colorSpace, THREE.SRGBColorSpace); assert.equal(map.generateMipmaps, false);
  assert.equal(map.image.width, 256); assert.equal(map.image.height, 112);
  const commands = paints.at(-1).commands;
  assert.deepEqual(commands.filter(c => c[0] === 'fillText').map(c => c[1]), ['NPC']);
  const luminance = hex => { const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
  // The pass menu's black on cream paper, not a glowing amber sign.
  const foreground = commands.find(c => c[0] === 'set' && c[1] === 'fillStyle' && c[2] === '#111113')[2];
  assert.ok(commands.some(c => c[0] === 'set' && c[1] === 'fillStyle' && c[2] === '#f5efe2'), 'paper ticket');
  assert.ok(!commands.some(c => c[0] === 'set' && c[1] === 'shadowBlur' && c[2] > 0), 'no neon glow');
  assert.ok((luminance('#f5efe2') + .05) / (luminance(foreground) + .05) > 15);
  let maps = 0, materials = 0; map.addEventListener('dispose', () => maps++);
  first.material.addEventListener('dispose', () => materials++); second.material.addEventListener('dispose', () => materials++);
  pool.dispose(); pool.dispose(); pool.update(camera());
  assert.equal(maps, 1); assert.equal(materials, 2); assert.equal(avatarDisposals, 0);
  assert.equal(pool.root.parent, null); assert.equal(pool.root.children.length, 0); assert.equal(a.group.parent, scene);
});

function identityTarget(scene,id,name,title){
 const t=target(scene,id),texture=createNpcIdentityTexture(name,title);
 t.identity=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false}));
 t.identity.userData.npcLabelRequested=true;t.group.add(t.identity);t.group.userData.nameBadge=t.identity;return t;
}
function bounds(sprite,view){
 sprite.updateWorldMatrix(true,false);view.updateWorldMatrix(true,false);
 const centre=sprite.getWorldPosition(new THREE.Vector3()),scale=sprite.getWorldScale(new THREE.Vector3()),up=new THREE.Vector3().setFromMatrixColumn(view.matrixWorld,1);
 return {bottom:centre.clone().addScaledVector(up,-scale.y/2).project(view).y,top:centre.clone().addScaledVector(up,scale.y/2).project(view).y};
}

test('requested job defaults and full resident names remain exact; served title edits repaint without rebuilding bodies',()=>{
 assert.deepEqual(NPC_TITLES,{DRBEAUTY:'Artist',KENNY:'DIRECTOR',LOUI:'DIRECTOR',MENTOR:'VIDEO EDITOR',MICHAEL:'DIRECTOR',MINYUN:'ADMINISTRATOR',NUNO:'SOUND ENGINEER',SEBINE:'DIRECTOR',VIOLA:'PROJECT MANAGER',XIEHGAN:'BOSS',YO:'SOCIAL',ZC:'DIRECTOR'});
 assert.equal(DEFAULT_NPC_NAMES.MINYUN,'MIN YUN LEE');assert.equal(DEFAULT_NPC_NAMES.XIEHGAN,'XIEH GAN');assert.equal(DEFAULT_NPC_NAMES.DRBEAUTY,'DR.BEAUTY');
 assert.equal(DEFAULT_NPC_PROFILES.find(p=>p.id==='VIOLA').titleZh,'','legacy fallback fantasy roles must not hide the new job');
 const scene=new THREE.Scene(),t=identityTarget(scene,'VIOLA','VIOLA','PROJECT MANAGER'),w=Object.create(FestivalWorld.prototype),group=t.group;
 Object.assign(w,{npcs:[{id:t.id,name:'VIOLA',group,badge:t.identity}],npcProfileById:new Map(),applyControlledNpcVisibility(){}});
 let disposals=0;t.identity.material.map.addEventListener('dispose',()=>disposals++);
 w.setNpcProfiles([{id:'VIOLA',name:'VIOLA',title:'CUSTOM ROLE',titleZh:'自訂職稱',introduction:'Custom biography'}]);
 assert.equal(t.identity.material.map.userData.npcIdentity.title,'CUSTOM ROLE');assert.equal(disposals,1);assert.equal(w.npcs[0].group,group);assert.equal(w.npcProfileById.get('VIOLA').titleZh,'自訂職稱');
 const map=t.identity.material.map;w.setNpcProfiles([{id:'VIOLA',name:'VIOLA',title:'CUSTOM ROLE',titleZh:'自訂職稱',introduction:'Changed biography'}]);
 assert.equal(t.identity.material.map,map,'unchanged labels cannot repaint on biography/network updates');
});

test('name then title stay above late hair/cap crowns with an NPC ticket above both in perspective and true isometric projection',()=>{
 const old={on:PLANET.on,radius:PLANET.radius,centre:PLANET.centre.value.clone()};
 try{
  PLANET.on=true;PLANET.radius=320;PLANET.centre.value.set(0,0,0);
  const scene=new THREE.Scene(),t=identityTarget(scene,'MINYUN','MIN YUN LEE','ADMINISTRATOR');t.group.position.set(8,1,10);
  let crown=new THREE.Vector3(.06,.6,0);t.crown=()=>crown;
  const pool=new NpcIndicators(scene,[t]),ticket=pool.root.getObjectByName('npc-ticket:MINYUN');
  for(const aspect of [402/874,1.6])for(const iso of [false,true]){
   const view=new WorldCamera(58,aspect,.1,300);view.setIsometric(iso);view.position.set(17,13,21);view.lookAt(8,3,10);view.updateMatrixWorld(true);
   for(const height of [.6,.95]){
    crown=new THREE.Vector3(.06,height,0);pool.update(view);
    const point=planetBendPoint(t.head.localToWorld(crown.clone())).project(view),label=bounds(t.identity,view),tag=bounds(ticket,view);
    assert.ok(label.bottom>point.y+.005,'job title touched the avatar hair/cap in projection');assert.ok(tag.bottom>label.top+.005,'NPC ticket overlapped the name');
    assert.equal(t.identity.material.defines.PLANET_FLAT,'');assert.equal(ticket.material.defines.PLANET_FLAT,'','CPU anchors must not bend twice');
   }
  }
  pool.dispose();assert.equal(t.identity.parent,t.group,'indicator rebuild must return the world-owned identity label');
 }finally{PLANET.on=old.on;PLANET.radius=old.radius;PLANET.centre.value.copy(old.centre);}
});

test('carried MENTOR labels clear both resident and visitor carrier names without inheriting carrier scale',()=>{
 const scene=new THREE.Scene(),human=identityTarget(scene,'LOUI','LOUI','DIRECTOR'),dog=identityTarget(scene,'MENTOR','MENTOR','VIDEO EDITOR');
 human.head.add(dog.group);dog.group.position.y=.55;dog.group.scale.setScalar(.56);dog.head.scale.setScalar(.68);dog.headOffset=new THREE.Vector3(0,.37,0);
 const view=camera();view.lookAt(0,3,0);view.updateMatrixWorld(true);const pool=new NpcIndicators(scene,[dog,human]);pool.update(view);
 const carrierTicket=pool.root.getObjectByName('npc-ticket:LOUI');
 assert.ok(bounds(human.identity,view).bottom>dog.head.localToWorld(dog.headOffset.clone()).project(view).y+.005,'the perched dog body covered its carrier role');
 assert.ok(bounds(dog.identity,view).bottom>bounds(carrierTicket,view).top+.005,'dog title overlapped the resident carrier stack');
 assert.equal(dog.identity.scale.x,NPC_INDICATOR.identityWidth);
 const visitor=new THREE.Group(),name=new THREE.Sprite(new THREE.SpriteMaterial());name.position.y=5;name.scale.set(2,.7,1);visitor.add(name);visitor.userData.nameBadge=name;scene.add(visitor);visitor.add(dog.group);pool.update(view);
 assert.ok(bounds(dog.identity,view).bottom>bounds(name,view).top+.005,'dog title overlapped the visitor carrier name');
 pool.update(view,{localPlayerNpcId:'MENTOR'});assert.equal(dog.identity.visible,false);assert.equal(pool.root.getObjectByName('npc-ticket:MENTOR').visible,false);
 pool.dispose();
});

test('a visitor carrier name clears the perched body with planet curvature and restores its ordinary anchor without changing ownership',()=>{
 const old={on:PLANET.on,radius:PLANET.radius,centre:PLANET.centre.value.clone()};
 try{
  PLANET.on=true;PLANET.radius=80;PLANET.centre.value.set(10,0,5);
  const scene=new THREE.Scene(),visitor=new THREE.Group(),name=new THREE.Sprite(new THREE.SpriteMaterial()),dog=identityTarget(scene,'MENTOR','MENTOR','VIDEO EDITOR');
  visitor.position.set(25,0,30);name.position.set(0,4.2,0);name.scale.set(2,.7,1);visitor.add(name);visitor.userData.nameBadge=name;scene.add(visitor);visitor.add(dog.group);dog.group.position.y=4;
  const original=name.position.clone(),view=new THREE.PerspectiveCamera(58,1,.1,300);view.position.set(30,14,42);view.lookAt(25,5,30);view.updateMatrixWorld(true);
  const pool=new NpcIndicators(scene,[dog]);pool.update(view);
  const centre=planetBendPoint(name.getWorldPosition(new THREE.Vector3())),up=new THREE.Vector3().setFromMatrixColumn(view.matrixWorld,1),bottom=centre.clone().addScaledVector(up,-.35).project(view).y,crown=planetBendPoint(dog.head.localToWorld(new THREE.Vector3(0,.5,0))).project(view).y;
  assert.ok(bottom>crown+.005,'visitor name remained behind the perched dog body');assert.ok(bounds(dog.identity,view).bottom>centre.clone().addScaledVector(up,.35).project(view).y+.005,'MENTOR label covered the moved visitor name');assert.equal(name.parent,visitor);assert.equal(name.material.defines,undefined);
  scene.attach(dog.group);pool.update(view);nearly(name.position,original);pool.dispose();nearly(name.position,original);
 }finally{PLANET.on=old.on;PLANET.radius=old.radius;PLANET.centre.value.copy(old.centre);}
});

test('close portrait first-person names and tickets remain within the viewport width without repainting their full wording',()=>{
 const scene=new THREE.Scene(),t=identityTarget(scene,'MINYUN','MIN YUN LEE','ADMINISTRATOR'),view=new THREE.PerspectiveCamera(58,402/874,.1,300);
 const pool=new NpcIndicators(scene,[t]),ticket=pool.root.getObjectByName('npc-ticket:MINYUN'),map=t.identity.material.map,paintCount=paints.length;
 for(const distance of [.8,1.4,2.4]){
  view.position.set(0,3.7,distance);view.lookAt(0,3.7,0);view.updateMatrixWorld(true);pool.update(view);
  const right=new THREE.Vector3().setFromMatrixColumn(view.matrixWorld,0);
  for(const label of [t.identity,ticket]){
   const centre=label.getWorldPosition(new THREE.Vector3()),halfWidth=label.getWorldScale(new THREE.Vector3()).x/2;
   const left=centre.clone().addScaledVector(right,-halfWidth).project(view).x,rightEdge=centre.clone().addScaledVector(right,halfWidth).project(view).x;
   assert.ok(left>=-NPC_INDICATOR.maxScreenFraction-1e-7&&rightEdge<=NPC_INDICATOR.maxScreenFraction+1e-7,'close phone label cropped its name or title');
  }
  assert.ok(bounds(ticket,view).bottom>bounds(t.identity,view).top,'clamping must retain ticket and name separation');
 }
 assert.equal(t.identity.material.map,map);assert.equal(paints.length,paintCount);assert.equal(map.userData.npcIdentity.name,'MIN YUN LEE');assert.equal(map.userData.npcIdentity.title,'ADMINISTRATOR');pool.dispose();
});

test('long names and roles preserve all text within a bounded bitmap, with a high contrast title below its name',()=>{
 const name='MIN YUN LEE FILM FESTIVAL PRODUCTION TEAM',title='SOUND ENGINEER AND RECORDING SUPERVISOR';
 const texture=createNpcIdentityTexture(name,title),meta=texture.userData.npcIdentity,commands=paints.at(-1).commands;
 assert.equal(meta.nameLines.join(' '),name);assert.equal(meta.titleLines.join(' '),title);assert.ok(meta.nameLines.length<=2&&meta.titleLines.length<=2);assert.equal(texture.image.width,512);assert.ok(texture.image.height<=320);assert.ok(meta.height<1.7);
 const rows=commands.filter(c=>c[0]==='fillText');assert.ok(rows.slice(meta.nameLines.length).every(c=>c[3]>rows[meta.nameLines.length-1][3]),'job title must render below every name line');
 const luminance=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
 assert.ok(commands.some(c=>c[0]==='set'&&c[1]==='fillStyle'&&c[2]==='#f5efe2'),'pass-menu paper card');assert.ok(commands.some(c=>c[0]==='set'&&c[1]==='fillStyle'&&c[2]==='#a91c24'),'festival-red job title');assert.ok((luminance('#f5efe2')+.05)/(luminance('#a91c24')+.05)>4.5,'role lettering needs luminance contrast in Noir as well as colour');assert.ok((luminance('#f5efe2')+.05)/(luminance('#111113')+.05)>15,'name lettering');assert.equal(texture.generateMipmaps,false);assert.equal(texture.minFilter,THREE.LinearFilter);
});

test('introductions and the wave dialogue use who a resident is in their introduction; head labels keep the job',()=>{
 for(const profile of DEFAULT_NPC_PROFILES){
  assert.ok(NPC_CHARACTER_TITLES[profile.id],`${profile.id} has an introduction title`);
  assert.equal(npcCharacterTitleIn(profile,true),NPC_CHARACTER_TITLES[profile.id].zh);
  assert.equal(npcCharacterTitleIn(profile,false),NPC_CHARACTER_TITLES[profile.id].en);
  assert.equal(profile.title,NPC_TITLES[profile.id],'the job title stays the head label default');
 }
 const viola=DEFAULT_NPC_PROFILES.find(p=>p.id==='VIOLA');
 assert.equal(npcCharacterTitleIn(viola,true),'吟遊詩人');assert.equal(npcCharacterTitleIn(viola,false),'Bard');
 assert.ok(viola.introductionZh.includes('吟遊詩人'),'the title is the one her introduction gives');
 assert.equal(npcCharacterTitleIn({id:'SOMEONE',title:'GUEST DJ',titleZh:'客座 DJ'},true),'客座 DJ','anyone else falls back to their job title');
});


test('in the isometric view tickets fade across the picture from the attendee, not with the camera\'s fixed 34-unit stand-off', () => {
  const scene = new THREE.Scene(), near = target(scene, 'NEAR'), far = target(scene, 'FAR'), pool = new NpcIndicators(scene, [near, far]);
  far.group.position.set(24, 0, 0);
  const view = new WorldCamera(58, 1, .1, 300); view.setIsometric(true, 1);
  // Placed as the world places it: 34 back along the fixed diagonal from the attendee's chest.
  const look = new THREE.Vector3(0, 1.4, 0), p = Math.atan(1 / Math.sqrt(2));
  view.position.copy(look).add(new THREE.Vector3(Math.sin(Math.PI / 4) * Math.cos(p), Math.sin(p), Math.cos(Math.PI / 4) * Math.cos(p)).multiplyScalar(34));
  view.lookAt(look); view.updateMatrixWorld(true);
  pool.update(view);
  const [nearTicket, farTicket] = pool.root.children;
  assert.ok(view.position.distanceTo(nearTicket.position) > NPC_INDICATOR.fadeEnd, 'the camera itself is past the whole fade');
  assert.equal(nearTicket.visible, true); assert.equal(nearTicket.material.opacity, 1);
  assert.ok(farTicket.material.opacity < 1, 'a resident far across the picture still fades');
  pool.dispose();
});
