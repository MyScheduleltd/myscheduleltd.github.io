// Exercise the actual patched methods without browser/audio timing noise.
// Network, decoder and ownership failures must not become successful entry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import {patchMothRuntime} from './moth-runtime-patches.mjs';
const require = createRequire(import.meta.url);
const ts = require(process.env.MOTH_TYPESCRIPT_PATH || '/Users/myscheduleai/Desktop/myschedule-pivot/band-repair-20261004/world/node_modules/typescript/lib/typescript.js');
const source = patchMothRuntime(fs.readFileSync(new URL('../.qa/moth/published/src/game.js', import.meta.url), 'utf8'), ts);
const ast = ts.createSourceFile('runtime.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const game = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'BobbyGame');
const names = new Set(['loadChapterAssets', 'canonicalAudioSource', 'prepareChapterGraphics', 'chapterTracks', 'chapterSongs',
  'audioUsing', 'trimAudioMirror', 'replaceIdleAudioPlayer', 'prefetchHitSfx', 'loadHitSfx', 'prepareMenuSfx']);
const methods = game.members.filter(node => names.has(node.name?.getText(ast))).map(node => node.getText(ast));
assert.equal(methods.length, names.size);
const deferred = () => { let resolve, reject; const ready = new Promise((a,b) => {resolve=a;reject=b;}); return {ready,resolve,reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));
class AudioStub {
  constructor(src) { this.src=src; this.paused=true; this.loop=false; this.playbackRate=1; this.volume=.7; }
  getAttribute(name) { return name==='src' ? this.src : null; }
  removeAttribute(name) { if (name==='src') this.src=null; }
  pause() { this.paused=true; }
  load() { this.loads=(this.loads||0)+1; }
}
class ImageStub {
  constructor(ready=Promise.resolve()) { this.complete=true;this.naturalWidth=64;this.ready=ready;this.decodes=0; }
  decode() { this.decodes++;return this.ready; }
}
const revoked=[];
let fetchAsset = async src => ({data: new Uint8Array([1,2,3]).buffer, type:'audio/wav'});
const interfaceRequests=[];
const Factory = new Function('HIT_SFX','MENU_SFX','HTMLImageElement','Audio','URL','fetchGameAsset','requestAnimationFrame','VIEW_W','VIEW_H','interfaceAssetRequests',
  'return class Probe {'+methods.join('\n')+'}');
const Probe = Factory({M:'m.wav',O:'o.wav',H:'h.wav'},{'menu-tick':'tick.wav','menu-click':'click.wav'},ImageStub,AudioStub,{revokeObjectURL:url=>revoked.push(url)},
  (...args)=>fetchAsset(...args),callback=>queueMicrotask(callback),1280,720,interfaceRequests);
function probe() {
  const g=new Probe();
  Object.assign(g,{loadedSceneGroups:new Set(),sceneAssetJobs:[],refs:{},fightCutAudio:{office:new AudioStub('office.m4a')},
    audioMirror:new Map(),sfxBuffers:{M:{},O:{},H:{},'menu-tick':{},'menu-click':{}},gameAudioRegistry:new Set(),homePlaylistAudioCache:new Map(),
    sceneGroups:()=>['common','player','office'],getSecretLevel:()=>null,getSewerExploreBgmSrc:()=>'',
    getRhythmAudioFor:theme=>g.fightCutAudio[theme],getKnownBgmTracks:()=>Object.values(g.fightCutAudio),
    getScratchLayer:()=>({clearRect(){},drawImage(){}}),renderCinematicScene(){g.cinematicRenderer=null;},
    ensureToneContext:()=>({}),loadMenuSfx(){},
    loadHitSfx:()=>Promise.resolve(),
    songCopy:async src=>{const url='blob:'+src;g.audioMirror.set(src,{url,used:performance.now()});return url;},
    mirroredAudioUrl:src=>g.audioMirror.get(src)?.url||null,
    adoptSongCopy:async track=>{const src=g.canonicalAudioSource(track);track.src=g.mirroredAudioUrl(src);}
  });
  return g;
}

test('required song finishes before the chapter becomes ready',async()=>{
  const g=probe(),wait=deferred();
  g.songCopy=async src=>{await wait.ready;g.audioMirror.set(src,{url:'blob:ready',used:1});return 'blob:ready';};
  const ready=g.loadChapterAssets('level1-stage1');await tick();
  assert.equal(g.loadedSceneGroups.size,0);assert(g.sceneLoadProgress);
  wait.resolve();await ready;assert(g.loadedSceneGroups.has('office'));assert.equal(g.sceneLoadProgress,null);
});
test('a failed full download cannot silently start a streaming fight',async()=>{
  const g=probe();g.songCopy=async()=>null;
  await assert.rejects(g.loadChapterAssets('level1-stage1'),/required song could not be downloaded/);
  assert.equal(g.loadedSceneGroups.size,0);
});
test('a song which was not adopted cannot be marked ready',async()=>{
  const g=probe();g.adoptSongCopy=async()=>{};
  await assert.rejects(g.loadChapterAssets('level1-stage1'),/required song is not ready/);
  assert.equal(g.loadedSceneGroups.size,0);
});
test('slow image decode stays behind the chapter gate and is cached by image identity',async()=>{
  const g=probe(),wait=deferred(),image=new ImageStub(wait.ready);g.refs={image};
  const ready=g.loadChapterAssets('level1-stage1');await tick();
  assert.equal(image.decodes,1);assert.equal(g.loadedSceneGroups.size,0);
  wait.resolve();await ready;await g.prepareChapterGraphics();assert.equal(image.decodes,1);
});
test('a pending essential deck texture stays behind the chapter gate',async()=>{
  const g=probe(),wait=deferred();interfaceRequests.push(wait.ready);
  try {const ready=g.loadChapterAssets('level1-stage1');await tick();assert.equal(g.loadedSceneGroups.size,0);wait.resolve();await ready;}
  finally {interfaceRequests.length=0;}
});
test('menu audio still downloading on the title stays behind the chapter gate',async()=>{
  const g=probe(),wait=deferred();delete g.sfxBuffers['menu-click'];
  g.menuSfxLoading={'menu-click':wait.ready.then(()=>{g.sfxBuffers['menu-click']={};})};
  const ready=g.loadChapterAssets('level1-stage1');await tick();
  assert.equal(g.loadedSceneGroups.size,0);wait.resolve();await ready;assert(g.loadedSceneGroups.has('office'));
});
test('a swallowed failed menu download cannot release the chapter gate',async()=>{
  const g=probe();delete g.sfxBuffers['menu-click'];
  g.loadMenuSfx=()=>{g.menuSfxLoading={'menu-click':Promise.reject(Error('offline')).catch(()=>{})};};
  await assert.rejects(g.loadChapterAssets('level1-stage1'),/Required menu sound effects are not decoded/);
  assert.equal(g.loadedSceneGroups.size,0);
});
test('a failing hit sound waits for pending menu audio to settle before reporting failure',async()=>{
  const g=probe(),wait=deferred();g.loadHitSfx=async()=>{throw Error('hit failed');};
  g.menuSfxLoading={'menu-click':wait.ready};
  let finished=false;const ready=g.loadChapterAssets('level1-stage1').catch(error=>{assert.match(error.message,/hit failed/);finished=true;});
  await tick();assert.equal(finished,false);wait.resolve();await ready;assert.equal(finished,true);
});
test('a failed required SFX decode blocks entry',async()=>{
  const g=probe();g.loadHitSfx=async()=>{throw Error('decoder failed');};
  await assert.rejects(g.loadChapterAssets('level1-stage1'),/decoder failed/);
  assert.equal(g.loadedSceneGroups.size,0);
});
test('failure settles outstanding image work before the loader reports it',async()=>{
  const g=probe(),wait=deferred();g.sceneAssetJobs=[{group:'office',run:()=>wait.ready,release(){}}];g.songCopy=async()=>null;
  let finished=false;const ready=g.loadChapterAssets('level1-stage1').catch(()=>{finished=true;});await tick();
  assert.equal(finished,false);wait.resolve();await ready;assert.equal(finished,true);
});
test('adopted blob players retain canonical source paths on revisits',async()=>{
  const g=probe();await g.loadChapterAssets('level1-stage1');
  assert.deepEqual(g.chapterSongs(['office']),['office.m4a']);
  let copies=0;g.songCopy=async()=>{copies++;throw Error('blob should already be ready');};
  await g.loadChapterAssets('level1-stage1');assert.equal(copies,0);
});
test('shared walking/dialogue BGM is included once; the following chapter is not prefetched',async()=>{
  const g=probe();g.sewerAudio=new AudioStub('walk.m4a');const overlay=new AudioStub('walk.m4a');
  g.getSewerExploreBgmSrc=()=> 'walk.m4a';g.ensureDialogueOverlayAudio=()=>overlay;
  const requests=[];const copy=g.songCopy;g.songCopy=src=>{requests.push(src);return copy(src);};
  await g.loadChapterAssets('level1-stage1');
  assert.deepEqual(requests.sort(),['office.m4a','walk.m4a']);assert.equal(overlay.src,'blob:walk.m4a');
});
test('SFX download failures reject the batch instead of being hidden by allSettled',async()=>{
  const g=probe();delete g.loadHitSfx;g.sfxBuffers={};g.ensureToneContext=()=>({});g.ensureFeedbackOutput=()=>{};
  g.decodeHitSfx=async name=>{g.sfxBuffers[name]={};};fetchAsset=async src=>{if(src==='o.wav')throw Error('download failed');return {data:new ArrayBuffer(4)};};
  try {await assert.rejects(g.loadHitSfx(),/download failed/);assert.equal(g.hitSfxPrefetch,null);}
  finally {fetchAsset=async()=>({data:new ArrayBuffer(4)});}
});
test('SFX decode failures reject the batch',async()=>{
  const g=probe();delete g.loadHitSfx;g.sfxBuffers={};g.sfxRaw={M:new ArrayBuffer(4),O:new ArrayBuffer(4),H:new ArrayBuffer(4)};
  g.ensureToneContext=()=>({});g.ensureFeedbackOutput=()=>{};g.decodeHitSfx=async()=>{throw Error('decode failed');};
  await assert.rejects(g.loadHitSfx(),/decode failed/);
});
test('a decoder which resolves without producing a buffer cannot pass readiness',async()=>{
  const g=probe();delete g.loadHitSfx;g.sfxBuffers={};g.sfxRaw={M:new ArrayBuffer(4),O:new ArrayBuffer(4),H:new ArrayBuffer(4)};
  g.ensureToneContext=()=>({});g.ensureFeedbackOutput=()=>{};g.decodeHitSfx=async()=>{};
  await assert.rejects(g.loadHitSfx(),/Required sound effects are not decoded/);
});
test('idle audio eviction replaces aliases while active, paused-owner and current-chapter copies survive',()=>{
  const g=probe();g.fightCutAudio={};g.audioMirror.clear();g.sceneAudioSources=new Set(['scene.m4a']);
  for(const [index,name] of ['idle0','idle1','idle2','idle3','scene','playing','resume'].entries()){
    const track=new AudioStub('blob:'+name);g.fightCutAudio[name]=track;g.audioMirror.set(name+'.m4a',{url:track.src,used:index});
  }
  const old=g.fightCutAudio.idle0;g.level2BossAudio=old;g.fightCutAudio.playing.paused=false;g.pausedBgm={audio:g.fightCutAudio.resume};
  let disconnected=0;g.musicAudioRoutes=new WeakMap([[old,{source:{disconnect(){disconnected++;}},gain:{disconnect(){disconnected++;}}}]]);
  g.gameAudioRegistry.add(old);g.homePlaylistAudioCache.set('old',old);g.trimAudioMirror();
  assert.equal(g.audioMirror.size,5);assert(!g.audioMirror.has('idle0.m4a'));assert(!g.audioMirror.has('idle1.m4a'));
  assert.equal(g.fightCutAudio.idle0.src,'idle0.m4a');assert.equal(g.level2BossAudio,g.fightCutAudio.idle0);assert.notEqual(g.level2BossAudio,old);
  assert.equal(old.src,null);assert.equal(disconnected,2);assert(!g.gameAudioRegistry.has(old));assert(!g.homePlaylistAudioCache.has('old'));
  assert.equal(g.fightCutAudio.playing.src,'blob:playing');assert.equal(g.pausedBgm.audio.src,'blob:resume');
  assert(revoked.includes('blob:idle0'));assert.equal(g.canonicalAudioSource(g.fightCutAudio.idle0),'idle0.m4a');
});
test('chapter eviction drops the outgoing backdrop references',async()=>{
  const g=probe();let released=0;g.loadedSceneGroups.add('level2');g.rhythmBackdropCache=[{}];
  g.sceneAssetJobs=[{group:'level2',release(){released++;}}];await g.loadChapterAssets('level1-stage1');
  assert.equal(released,1);assert.deepEqual(g.rhythmBackdropCache,[]);assert(!g.loadedSceneGroups.has('level2'));
});
