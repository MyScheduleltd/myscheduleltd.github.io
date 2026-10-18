import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// Follow the real dependency graph, stopping at dynamic imports: these are
// the modules a cold visitor must download before the gate can render.
test('the gate renders without the 3D engine, terrain or avatar animation dependencies', async () => {
  const result = await build({entryPoints:['src/ui/App.ts'], bundle:true, write:false, metafile:true,
    loader:{'.png':'dataurl'}, format:'esm', splitting:true, outdir:'/tmp/startup-test'});
  const inputs = result.metafile.inputs;
  const visited = new Set();
  const visit = path => {
    if (visited.has(path)) return;
    visited.add(path);
    for (const dependency of inputs[path]?.imports ?? []) {
      if (!dependency.external && dependency.kind !== 'dynamic-import') visit(dependency.path);
    }
  };
  visit('src/ui/App.ts');
  for (const path of visited) {
    assert.ok(!/node_modules\/three\/|\/ImportedAvatar\.ts|\/CoastalTerrain\.ts|\/moves\.json/.test(path), path);
  }
});

test('the embedded brand image is the original PNG, without a separate image download', async () => {
  const result = await build({entryPoints:['src/ui/App.ts'], bundle:true, write:false,
    loader:{'.png':'dataurl'}, format:'esm'});
  const original = await readFile('src/assets/company-logo.png');
  assert.ok(result.outputFiles[0].text.includes(`data:image/png;base64,${original.toString('base64')}`));
});

test('sound-on entry unlocks audio before admission and avatar downloads', async () => {
 const code=await readFile('src/ui/App.ts','utf8');
 const submit=code.slice(code.indexOf("form?.addEventListener('submit'"),code.indexOf('private async enterWhenThereIsRoom'));
 assert.ok(submit.indexOf('entryAudio.start(muted)')<submit.indexOf('enterWhenThereIsRoom(muted)'));
 assert.ok(code.includes('audio: this.entryAudio'));
 assert.ok(code.includes('enterWhenThereIsRoom(readSession<boolean>(AUDIO_MUTED_KEY, true))'));
 assert.ok(code.includes('data-audio-resume'));
 assert.ok(code.includes('this.bodyTrackRequested ?'));
 assert.ok(code.includes('enableHeadTracking(chosen || undefined, this.bodyTrackRequested)'));
 assert.ok(code.includes("addEventListener('keydown', resumeEntryAudio, true)"));
});

test('audio gains recover on unmute after a suspended context without constructing a second graph', async () => {
 // Bundled: the module reaches the asset mirror through extensionless imports.
 const bundle=await build({entryPoints:['src/world/AmbientAudio.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const {AmbientAudio}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 let constructed=0;
 const param=(value)=>({value,setTargetAtTime(v){this.value=v}});
 const gain=()=>({gain:param(0),connect(){}});
 globalThis.AudioContext=class {
  state='suspended'; currentTime=0; sampleRate=8; destination={}; resumes=0;
  constructor(){constructed++;}
  createGain(){return gain();} createBuffer(){return {getChannelData:()=>new Float32Array(24)};}
  createBufferSource(){return {connect(){},start(){}};} createBiquadFilter(){return {connect(){},frequency:param(350),Q:param(1)};}
  async resume(){this.resumes++;this.state='running';}
 };
 try {
  const audio=new AmbientAudio();await audio.start(true);assert.equal(audio.master.gain.value,0);
  audio.context.state='suspended';audio.setMuted(false);await Promise.resolve();
  assert.equal(audio.context.state,'running');assert.equal(audio.master.gain.value,.7);
  audio.context.state='interrupted';assert.equal(audio.needsResume(),true);
  await audio.resume();assert.equal(audio.context.state,'running');
  await audio.start(false);assert.equal(constructed,1);
 } finally {delete globalThis.AudioContext;}
});
