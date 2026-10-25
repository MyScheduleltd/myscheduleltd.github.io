import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import * as THREE from 'three';

// Execute production methods without creating a WebGL world or making a seat
// claim. The real AmbientAudio graph is used with recording WebAudio nodes.
const worldSource=await readFile('src/world/FestivalWorld.ts','utf8');
const importedSource=await readFile('src/world/ImportedAvatar.ts','utf8');
const clientSource=await readFile('src/network/FestivalClient.ts','utf8');
const parse=(name,source)=>ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true);
const worldTree=parse('FestivalWorld.ts',worldSource),importedTree=parse('ImportedAvatar.ts',importedSource),clientTree=parse('FestivalClient.ts',clientSource);
const methods=(tree,name,names)=>{
 const klass=tree.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text===name);assert.ok(klass,name);
 return names.map(name=>{const method=klass.members.find(node=>node.name?.getText(tree)===name);assert.ok(method,name);return method.getText(tree);}).join('\n');
};
const constant=(tree,name)=>{
 const node=tree.statements.filter(ts.isVariableStatement).flatMap(statement=>statement.declarationList.declarations).find(node=>node.name.getText(tree)===name);assert.ok(node,name);
 return `const ${name}=${node.initializer.getText(tree)};`;
};
let clock=10_000;
const globals={THREE,Error,performance:{now:()=>clock},movesData:JSON.parse(await readFile('src/data/moves.json','utf8'))};
const source=[constant(importedTree,'MOVES'),constant(importedTree,'MOVE_SECONDS'),constant(importedTree,'PUNCH_CONTACT_SECONDS'),
 constant(worldTree,'PASSOUT_SPAN_MS'),constant(worldTree,'GESTURE_SPAN_MS'),constant(worldTree,'PUNCH_CONTACT_MS'),
 `class WorldHarness {${methods(worldTree,'FestivalWorld',['punch','settlePunchImpact','snowBrushed'])}}`,
 `class ClientHarness {${methods(clientTree,'FestivalClient',['claimSeat'])}}`,
 'Object.assign(globalThis,{WorldHarness,ClientHarness,PUNCH_CONTACT_MS,GESTURE_SPAN_MS});'].join('\n');
runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,globals);

let networkRequests=0;
globalThis.window={location:{hostname:'127.0.0.1',href:'http://127.0.0.1:4194/'},matchMedia:()=>({matches:false})};
globalThis.fetch=async()=>{networkRequests++;throw new Error('An action must not fetch a sound after entry');};
class Param{constructor(value=1){this.value=value;this.target=value;}setTargetAtTime(value){this.target=value;}}
class Node{connect(output){this.output=output;return output;}disconnect(){this.output=undefined;}}
class Gain extends Node{gain=new Param();}
class Filter extends Node{frequency=new Param();Q=new Param();}
class Source extends Node{playbackRate=new Param();start(when=0){this.when=when;this.context.started.push(this);}stop(){this.stopped=true;}}
const contexts=[];
globalThis.AudioContext=class{
 constructor(){this.state='suspended';this.currentTime=1;this.destination={};this.started=[];contexts.push(this);}
 createGain(){return new Gain();}createBiquadFilter(){return new Filter();}createBufferSource(){const node=new Source();node.context=this;return node;}
 resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
};
const audioBundle=await build({entryPoints:['src/world/AmbientAudio.ts'],define:{'import.meta.url':JSON.stringify(pathToFileURL(process.cwd()+'/src/world/AmbientAudio.ts').href)},bundle:true,write:false,platform:'node',format:'esm'});
const {AmbientAudio}=await import('data:text/javascript;base64,'+Buffer.from(audioBundle.outputFiles[0].text).toString('base64'));
async function fixture(){
 clock=10_000;const audio=new AmbientAudio();await audio.start(false);
 // Admission decoding is exercised in ambient-audio.test.mjs. These are the
 // resulting two ready buffers; action dispatch must never request replacements.
 audio.avatarBuffers.set('punch',{url:'avatar-punch.wav',duration:.415});
 audio.avatarBuffers.set('snow-brush',{url:'avatar-snow-brush.wav',duration:.52});
 const world=new globals.WorldHarness(),actions=[],context=contexts.at(-1);
 Object.assign(world,{audio,disposed:false,player:new THREE.Group(),playerState:'walking',npcDialogue:undefined,lastPunchAt:-Infinity,
  cameraShake:0,punchImpactAt:0,punchImpactPower:0,punchImpactNpc:undefined,
  isMentorControlLocked:()=>false,nearestNpcInFront:()=>undefined,nearestVisitorInFront:()=>undefined,onAction:action=>actions.push(action)});
 return {world,audio,actions,context,sounds:()=>context.started.map(source=>source.buffer?.url),close:()=>audio.dispose()};
}

test('the actual client accepts only an explicit true clear flag and preserves old-server success without a flag',async()=>{
 for(const [payload,expected]of[[{snowCleared:true},true],[{snowCleared:false},false],[{},false],[{snowCleared:'true'},false],[{snowCleared:1},false]]){
  const client=new globals.ClientHarness(),requests=[];
  client.request=async(...args)=>{requests.push(args);return{json:async()=>payload};};
  const result=await client.claimSeat('BEACH-MAT/3','brush');
  assert.equal(result.ok,true);assert.equal(result.snowCleared,expected);
  assert.equal(requests[0][0],'/api/seats/BEACH-MAT%2F3/claim');
  assert.equal(requests[0][1].method,'POST');assert.deepEqual(JSON.parse(requests[0][1].body),{snowAction:'brush'});
 }
 const client=new globals.ClientHarness();client.request=async()=>{throw new Error('Seat is occupied');};
 const result=await client.claimSeat('BEACH-MAT-3','brush');assert.equal(result.ok,false);assert.equal(result.message,'Seat is occupied');
});

test('a punch plays exactly once at animation contact, including a miss, and the cooldown never queues a second impact',async()=>{
 const f=await fixture(),requests=networkRequests;
 try{
  f.world.punch();const firstAt=f.world.punchImpactAt;
  assert.equal(firstAt,10_000+globals.PUNCH_CONTACT_MS);assert.equal(f.actions.length,1);assert.deepEqual(f.sounds(),[]);
  clock+=10;f.world.punch();assert.equal(f.actions.length,1);assert.equal(f.world.punchImpactAt,firstAt);
  clock=firstAt-1;f.world.settlePunchImpact();assert.deepEqual(f.sounds(),[]);
  clock=firstAt;f.world.settlePunchImpact();assert.deepEqual(f.sounds(),['avatar-punch.wav']);assert.equal(f.world.punchImpactAt,0);
  for(let i=0;i<4;i++){clock+=16;f.world.settlePunchImpact();}assert.equal(f.sounds().length,1);
  clock=10_000+globals.GESTURE_SPAN_MS.punch+1;f.world.punch();assert.equal(f.actions.length,2);assert.equal(f.sounds().length,1);
  clock=f.world.punchImpactAt;f.world.settlePunchImpact();assert.deepEqual(f.sounds(),['avatar-punch.wav','avatar-punch.wav']);
  assert.equal(networkRequests,requests);
 }finally{f.close();}
});

test('dialogue, seated/swimming states and controlled MENTOR reject a punch without early or deferred sound',async t=>{
 for(const blocked of ['dialogue','seated','swimming','mentor'])await t.test(blocked,async()=>{
  const f=await fixture(),requests=networkRequests;
  try{
   if(blocked==='dialogue')f.world.npcDialogue={};
   else if(blocked==='mentor')f.world.isMentorControlLocked=()=>true;
   else f.world.playerState=blocked;
   f.world.punch();clock+=2_000;f.world.settlePunchImpact();
   assert.equal(f.actions.length,0);assert.equal(f.world.punchImpactAt,0);assert.deepEqual(f.sounds(),[]);assert.equal(networkRequests,requests);
  }finally{f.close();}
 });
});

test('a resident recoil and the recorded sound arrive together, and repeated contact checks cannot replay either',async()=>{
 const f=await fixture(),npc={name:'KENNY',group:new THREE.Group(),knockback:new THREE.Vector3()};npc.group.position.z=2;
 f.world.nearestNpcInFront=()=>npc;
 try{
  f.world.punch();assert.equal(npc.knockback.length(),0);assert.deepEqual(f.sounds(),[]);
  clock=f.world.punchImpactAt;f.world.settlePunchImpact();
  assert.ok(Math.abs(npc.knockback.length()-7.4)<1e-9);assert.deepEqual(f.sounds(),['avatar-punch.wav']);
  const direction=npc.knockback.clone();clock+=30;f.world.settlePunchImpact();assert.deepEqual(npc.knockback,direction);assert.equal(f.sounds().length,1);
 }finally{f.close();}
});

test('the World brush notification reaches the existing preloaded character channel and stays silent after teardown',async()=>{
 const f=await fixture(),requests=networkRequests;
 try{
  f.world.snowBrushed();assert.deepEqual(f.sounds(),['avatar-snow-brush.wav']);
  const source=f.context.started[0];assert.equal(source.output.output.output.output,f.context.destination);
  f.world.disposed=true;f.world.snowBrushed();assert.equal(f.sounds().length,1);assert.equal(networkRequests,requests);
 }finally{f.close();}
});
