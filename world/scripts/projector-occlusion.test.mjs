import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build } from 'esbuild';

const output = await build({
  stdin: { contents: "export { FestivalWorld, projectorApertureMaterial } from './src/world/FestivalWorld'; export { createWorldRenderer } from './src/world/WorldRenderer'; export { RooftopBand } from './src/world/RooftopBand'; export { selectDecorativeLights } from './src/world/LightBudget'; export { warmScenePrograms, uploadSceneTextures } from './src/world/SceneWarmup'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'expose-material-for-test', setup(builder) {
    builder.onLoad({ filter: /FestivalWorld\.ts$/ }, async ({ path }) => ({
      contents: await readFile(path, 'utf8') + '\nexport { projectorApertureMaterial };', loader: 'ts', resolveDir: dirname(path),
    }));
  } }],
});
const { FestivalWorld, projectorApertureMaterial, createWorldRenderer, RooftopBand, THREE, selectDecorativeLights, warmScenePrograms, uploadSceneTextures } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

test('desktop and lite worlds each create one alpha context while preserving graphics and XR settings', () => {
  for (const normalGraphics of [true, false]) {
    const canvas = {}, clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1_000_000);
    const allocations = [], values = {};
    const renderer = createWorldRenderer({
      canvas, normalGraphics, pixelRatio: normalGraphics ? 1.25 : 1,
      checkShaderErrors: false, inactiveClipPlane: clipPlane,
    }, parameters => {
      allocations.push(parameters);
      return {
        debug: {}, shadowMap: {}, setPixelRatio(value) { values.pixelRatio = value; },
        xr: {
          setReferenceSpaceType(value) { values.space = value; },
          setFramebufferScaleFactor(value) { values.xrScale = value; },
          setFoveation(value) { values.foveation = value; },
        },
      };
    });
    assert.equal(allocations.length, 1);
    assert.deepEqual(allocations[0], { canvas, alpha: true, antialias: normalGraphics, powerPreference: 'high-performance' });
    assert.equal(renderer.shadowMap.enabled, normalGraphics);
    assert.equal(renderer.shadowMap.type, THREE.PCFSoftShadowMap);
    assert.equal(values.pixelRatio, normalGraphics ? 1.25 : 1);
    assert.equal(renderer.xr.enabled, true);
    assert.deepEqual([values.space, values.xrScale, values.foveation], ['local-floor', .78, .7]);
    assert.deepEqual(renderer.clippingPlanes, [clipPlane]);
    for (const point of [new THREE.Vector3(0, -200, 0), new THREE.Vector3(0, 200, 0)]) {
      assert.ok(clipPlane.distanceToPoint(point) > 0, 'the idle plane clips part of the world');
    }
  }
});

test('the asynchronously loaded band fire joins the same main and projector light set before it becomes visible', async () => {
  const originalLoad = RooftopBand.prototype.load, savedDocument = globalThis.document;
  globalThis.document = { createElement() { return { getContext() { return { fillRect() {} }; } }; } };
  let finishLoad;
  // Keep the real FestivalWorld -> RooftopBand callback and buildFire path;
  // delay only file delivery until the initial world-light traversal is over.
  RooftopBand.prototype.load = function () {
    return new Promise(resolve => { finishLoad = () => {
      const anchor = new THREE.Group(); this.group.add(anchor);
      this.buildFire(anchor); resolve();
    }; });
  };
  try {
    const world = Object.create(FestivalWorld.prototype);
    const scene = new THREE.Scene(), lampRegistrations = [];
    const sun = new THREE.DirectionalLight(); scene.add(sun);
    Object.assign(world, {
      scene, colliders: [],
      dayNight: { addLampLight(light, intensity) {
        assert.equal(light.parent, null, 'the late light was visible before its render layers were registered');
        lampRegistrations.push({ light, intensity });
      } },
    });
    world.createRooftopBand();
    scene.traverse(object => { if (object.isLight) object.layers.enable(2); });
    const lightIds = layer => {
      const result = [];
      scene.traverseVisible(object => { if (object.isLight && object.layers.isEnabled(layer)) result.push(object.uuid); });
      return result.sort();
    };
    assert.deepEqual(lightIds(0), lightIds(2));
    finishLoad(); await Promise.resolve();
    assert.equal(lampRegistrations.length, 1);
    assert.equal(lampRegistrations[0].intensity, 16);
    assert.equal(lightIds(0).length, 1, 'a late light bypassed the existing shader budget');
    selectDecorativeLights([lampRegistrations[0].light], true, () => 0);
    assert.equal(lightIds(0).length, 2, 'the registered bonfire was not available to the next budget');
    assert.deepEqual(lightIds(0), lightIds(2), 'late band loading changed only the main shader light count');
  } finally { RooftopBand.prototype.load = originalLoad; globalThis.document = savedDocument; }
});

test('the video aperture retains closer world surfaces without changing their depth', () => {
  assert.equal(projectorApertureMaterial.depthTest, true);
  assert.equal(projectorApertureMaterial.depthWrite, false);
  assert.equal(projectorApertureMaterial.blending, THREE.NoBlending);
  assert.equal(projectorApertureMaterial.opacity, 0);
});

function fixture() {
  const world = Object.create(FestivalWorld.prototype);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.background = new THREE.Color(0x123456);
  const background = scene.background;
  const visible = new THREE.Group(), hidden = new THREE.Group(); hidden.visible = false;
  const events = [];
  const inactivePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1_000_000);
  const idleClipping = [inactivePlane];
  const renderer = {
    autoClear: true, shadowMap: { enabled: true, autoUpdate: true, needsUpdate: true }, clippingPlanes: idleClipping, info: { render: { calls: 1 } },
    setScissorTest(value) { events.push(['scissorTest', value]); },
    setScissor(...value) { events.push(['scissor', ...value]); },
    clear(...value) { events.push(['clear', ...value]); },
    render(rendered, cam) {
      events.push(['render', rendered === scene ? 'avatars' : 'aperture', cam.layers.mask, this.autoClear]);
      if (rendered === scene) {
        assert.equal(visible.visible, true); assert.equal(hidden.visible, false);
        assert.equal(this.clippingPlanes.length, 1, 'first screening introduced a new clip-plane shader variant');
        assert.equal(this.shadowMap.enabled, true, 'first screening introduced an unshadowed shader variant');
        assert.equal(this.shadowMap.autoUpdate, false, 'foreground repeats the main shadow-map renders');
        assert.equal(this.shadowMap.needsUpdate, false, 'pending updates repeat the main shadow-map renders');
      }
    },
  };
  Object.assign(world, {
    scene, camera, renderer, conservesMobileGpu: true,
    projectors: new Map(['rooftop', 'club'].map(key => [key, { aperture: new THREE.Mesh() }])),
    projectorApertureScene: new THREE.Scene(), projectorClipPlane: new THREE.Plane(),
    foregroundAvatarEntries: () => [{ id: 'DJ', group: visible }, { id: 'hidden', group: hidden }],
    avatarIntersectsProjector: () => true,
  });
  return { world, events, visible, hidden, background, renderer, idleClipping };
}

test('single-context DJ redraw retains booth depth across both projectors', () => {
  const f = fixture();
  const scissors = new Map(['rooftop', 'club'].map(key => [key, { x: 10, y: 20, width: 200, height: 300 }]));
  f.world.compositeProjectorAvatars(['rooftop', 'club'], scissors);
  assert.equal(f.events.filter(([kind]) => kind === 'clear').length, 0, 'world depth was erased before drawing the DJ');
  const renders = f.events.filter(([kind]) => kind === 'render');
  assert.deepEqual(renders.map(([, pass]) => pass), ['aperture', 'avatars', 'avatars']);
  assert.ok(renders.every(([, , , autoClear]) => autoClear === false));
  assert.deepEqual(f.world.lastSingleContextAvatarIds, ['DJ']);
  assert.equal(f.visible.visible, true); assert.equal(f.hidden.visible, false);
  assert.equal(f.world.scene.background, f.background);
  assert.equal(f.renderer.autoClear, true); assert.equal(f.renderer.shadowMap.enabled, true);
  assert.equal(f.renderer.clippingPlanes, f.idleClipping); assert.equal(f.world.camera.layers.mask, 1);
  assert.equal(f.renderer.shadowMap.autoUpdate, true); assert.equal(f.renderer.shadowMap.needsUpdate, true);
  assert.ok([...f.world.projectors.values()].every(p => !p.aperture.visible));
});

test('compositor restores scene and avatar state if a redraw fails', () => {
  const f = fixture(); f.renderer.render = scene => { if (scene === f.world.scene) throw new Error('render failed'); };
  assert.throws(() => f.world.compositeProjectorAvatars(['rooftop'], new Map([['rooftop', { x: 0, y: 0, width: 1, height: 1 }]])), /render failed/);
  assert.equal(f.visible.visible, true); assert.equal(f.hidden.visible, false);
  assert.equal(f.world.scene.background, f.background); assert.equal(f.renderer.autoClear, true);
  assert.equal(f.renderer.shadowMap.enabled, true); assert.equal(f.renderer.clippingPlanes, f.idleClipping);
  assert.equal(f.renderer.shadowMap.autoUpdate, true); assert.equal(f.renderer.shadowMap.needsUpdate, true);
  assert.equal(f.world.camera.layers.mask, 1);
  assert.ok([...f.world.projectors.values()].every(p => !p.aperture.visible));
});

test('scenes without video skip all projector passes on desktop and mobile', () => {
  for (const mobile of [true, false]) {
    const f = fixture(); f.world.conservesMobileGpu = mobile;
    f.world.compositeProjectorAvatars([], new Map());
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.world.lastSingleContextAvatarIds, []);
    assert.ok([...f.world.projectors.values()].every(p => !p.aperture.visible));
  }
});

test('desktop and mobile redraw only avatars intersecting the active screen, with the same world depth', () => {
  for (const mobile of [true, false]) {
    const f = fixture(); f.world.conservesMobileGpu = mobile;
    const outsider = new THREE.Group();
    const entries = f.world.foregroundAvatarEntries;
    f.world.foregroundAvatarEntries = () => [...entries(), { id: 'outside', group: outsider }];
    f.world.avatarIntersectsProjector = group => group !== outsider;
    f.world.compositeProjectorAvatars(['club'], new Map([['club', { x: 2, y: 3, width: 100, height: 90 }]]));
    assert.deepEqual(f.world.lastSingleContextAvatarIds, ['DJ']);
    assert.equal(f.events.filter(([kind]) => kind === 'clear').length, 0);
    assert.deepEqual(f.events.filter(([kind]) => kind === 'render').map(([, pass]) => pass), ['aperture', 'avatars']);
    assert.equal(outsider.visible, true, 'the ordinary world visibility was not restored');
  }
});

test('programme refreshes retain an unchanged poster texture and replace changed titles, source states or video maps', () => {
  const savedDocument = globalThis.document;
  let canvases = 0, disposed = 0;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas'); canvases += 1;
      return { getContext() { return {
        fillRect() {}, strokeRect() {}, fillText() {},
        measureText(text) { return { width: text.length * 20 }; },
      }; } };
    },
  };
  try {
    const world = Object.create(FestivalWorld.prototype);
    const projector = { xrPoster: new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()) };
    Object.assign(world, {
      projectors: new Map([['shore', projector]]), privateOwns: () => false,
      stopImmersiveVideo() {}, projectorVenue: () => undefined, releaseProjector() {},
    });
    const film = { id: 'same-film', title: 'A FILM', youtubeId: 'id', embedUrl: 'https://www.youtube.com/embed/id' };
    world.setPublicScreening('shore', film, 0);
    const first = projector.xrPoster.material.map;
    first.addEventListener('dispose', () => { disposed += 1; });
    for (let index = 0; index < 50; index += 1) world.setPublicScreening('shore', film, index);
    assert.equal(canvases, 1, 'unchanged schedule updates allocated 1024px posters');
    assert.equal(projector.xrPoster.material.map, first);
    world.setPublicScreening('shore', { ...film, title: 'A NEW TITLE' }, 51);
    assert.equal(canvases, 2); assert.equal(disposed, 1);
    world.setPublicScreening('shore', { ...film, title: 'A NEW TITLE', immersiveUrl: 'https://example.test/film.mp4' }, 52);
    assert.equal(canvases, 3, 'direct-video availability changed without updating the fallback message');
    projector.xrPoster.material.map = new THREE.Texture();
    world.refreshXrPoster('shore');
    assert.equal(canvases, 4, 'the title cache accidentally retained a video map');
    projector.xrPoster.material.map = null;
    world.refreshXrPoster('shore');
    assert.equal(canvases, 5, 'stopping an immersive film left the fallback empty');
  } finally { globalThis.document = savedDocument; }
});

test('moving between districts preserves each light/shadow shader count in both modes', () => {
  const lights = Array.from({length: 24}, (_, i) => { const l = new THREE.PointLight(); l.position.x = i * 10; return l; });
  for(let i=0;i<6;i++){const l=new THREE.SpotLight();l.position.x=-30-i*3;l.castShadow=i<2;lights.push(l);}
  const signature=()=>['PointLight','SpotLight'].map(type=>[false,true].map(shadow=>lights.filter(l=>l.visible&&l.type===type&&l.castShadow===shadow).length));
  for(const normal of [true,false]){
    let first;
    for(const district of [-80,0,90,0,-80]){
      selectDecorativeLights(lights,normal,l=>Math.abs(l.position.x-district));
      const next=signature();first??=next;assert.deepEqual(next,first,'crossing a venue changes shader defines');
      assert.equal(lights.filter(l=>l.visible).length,normal?10:6);
    }
    const late=new THREE.PointLight();late.visible=false;lights.push(late);
    selectDecorativeLights(lights,normal,l=>Math.abs(l.position.x));assert.deepEqual(signature(),first,'late scenery adds a new shader slot');
  }
});

test('warmup includes off-camera surfaces but skips hidden fallback bodies and preserves the live graph',async()=>{
  const scene=new THREE.Scene(),hidden=new THREE.Group(),camera=new THREE.PerspectiveCamera();hidden.visible=false;scene.add(hidden);
  const surface=new THREE.SkinnedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());surface.position.x=1000;scene.add(surface);
  hidden.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));
  const calls=[];await warmScenePrograms({async compileAsync(root,cam,target){calls.push(root);assert.equal(cam,camera);assert.equal(target,scene);}},scene,camera);
  assert.equal(calls.length,1);assert.equal(calls[0].children.length,1);assert.equal(calls[0].children[0].isSkinnedMesh,true);
  assert.equal(calls[0].children[0].material,surface.material);assert.equal(calls[0].children[0].geometry,surface.geometry);
  assert.equal(surface.parent,scene);assert.equal(scene.children.length,2);
});

test('unchanged programme snapshots do not send repeated playback commands, and parked players stay paused',()=>{
  const world=Object.create(FestivalWorld.prototype),commands=[];
  const projector={iframe:{contentWindow:{postMessage(data){commands.push(JSON.parse(data).func);}}}};
  world.projectors=new Map([['club',projector]]);
  for(let i=0;i<30;i++)world.setPublicScreenPaused('club',false);
  assert.deepEqual(commands,['playVideo']);
  for(let i=0;i<30;i++)world.setPublicScreenPaused('club',true);
  assert.deepEqual(commands,['playVideo','pauseVideo']);
  projector.paused=false;projector.parked=true;world.nudgeProjectorsToPlay();assert.equal(commands.length,2);
  world.setPublicScreenPaused('club',true);world.setPublicScreenPaused('club',false);
  assert.deepEqual(commands.slice(-2),['pauseVideo','pauseVideo'],'STAFF resuming a programme woke a parked decoder');
});

test('a short doorway crossing reuses one paused decoder, rejoins the clock, and releases it after a bounded stay',()=>{
  const saved=globalThis.performance;let now=1000;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
  try{
    let place='club';const commands=[],releases=[];const frame={contentWindow:{postMessage(data){commands.push(JSON.parse(data));}},src:'film',removeAttribute(){}};
    const p={iframe:frame,element:{replaceChildren(){releases.push('club');}},paused:false,pending:{offsetSeconds:90},signature:'same'};
    const world=Object.create(FestivalWorld.prototype);Object.assign(world,{projectors:new Map([['club',p]]),mountedProjectorVenue:'club',projectorLeaveAt:undefined,playheads:new Map(),playerReleases:0,projectorVenue:()=>place,stopImmersiveVideo(){},applyPrivateScreening(){}});
    place=undefined;world.updateProjectorMounts();world.updateProjectorMounts();assert.equal(p.iframe,frame);assert.equal(p.parked,true);assert.deepEqual(commands.map(c=>c.func),['pauseVideo']);
    now+=3000;place='club';world.updateProjectorMounts();assert.equal(p.iframe,frame);assert.equal(p.parked,false);assert.deepEqual(commands.map(c=>c.func),['pauseVideo','seekTo','playVideo']);assert.deepEqual(commands[1].args,[90,true]);assert.deepEqual(releases,[]);
    place=undefined;world.updateProjectorMounts();now+=8001;world.updateProjectorMounts();assert.equal(p.iframe,undefined);assert.equal(frame.src,'about:blank');assert.deepEqual(releases,['club']);
  }finally{Object.defineProperty(globalThis,'performance',{configurable:true,value:saved});}
});

test('asset notifications settle one body per paint, coalesce repeats, and cancel disposed bodies',async()=>{
  const {FrameWorkQueue}=await import('data:text/javascript;base64,'+Buffer.from((await build({entryPoints:['src/world/FrameWorkQueue.ts'],bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text).toString('base64'));
  const frames=[],done=[];const queue=new FrameWorkQueue(run=>frames.push(run));
  const jobs=Array.from({length:20},(_,i)=>()=>done.push(i));
  jobs.forEach(job=>queue.add(job));jobs.forEach(job=>queue.add(job));queue.delete(jobs[5]);
  assert.equal(frames.length,1);assert.equal(done.length,0);
  while(frames.length){const before=done.length;frames.shift()();assert.equal(done.length,before+1);}
  assert.deepEqual(done,jobs.map((_,i)=>i).filter(i=>i!==5));
});

test('admission prepares the existing room before GPU warmup, without starting the gameplay loop',async()=>{
  const savedWindow=globalThis.window;globalThis.window={setTimeout:run=>setTimeout(run,0),location:{search:'?nobatch'}};
  try{
    const world=Object.create(FestivalWorld.prototype),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();let created=0,compiled=0;
    Object.assign(world,{scene,camera,preview:false,disposed:false,pendingRemoteVisitors:new Map([['a',1],['b',2],['c',3]]),projectors:new Map(),cullDecorativeLights(){},flushRemoteVisitor(){this.pendingRemoteVisitors.delete(this.pendingRemoteVisitors.keys().next().value);scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));created++;},renderer:{async compileAsync(root,cam,target){compiled++;assert.equal(created,3);assert.equal(root.children.length,3);assert.equal(cam,camera);assert.equal(target,scene);},setAnimationLoop(){throw Error('admission started gameplay before preparation completed');}}});
    await world.prepareForPlay();assert.equal(created,3);assert.equal(compiled,1);assert.equal(world.pendingRemoteVisitors.size,0);
  }finally{globalThis.window=savedWindow;}
});


test('admission cannot compile or finish before fixed assets are placed', async () => {
  const savedWindow=globalThis.window;globalThis.window={setTimeout:run=>setTimeout(run,0),location:{search:'?nobatch'}};
  try {
    const world=Object.create(FestivalWorld.prototype),scene=new THREE.Scene();
    let finishScenery,finishBand,finishArcade,compiled=0,complete=false;
    const scenery=new Promise(resolve=>finishScenery=resolve),band=new Promise(resolve=>finishBand=resolve),arcade=new Promise(resolve=>finishArcade=resolve);
    const progress=[];
    Object.assign(world,{scene,camera:new THREE.PerspectiveCamera(),pendingRemoteVisitors:new Map(),projectors:new Map(),venueSceneryAssets:{ready:()=>scenery},bandLoad:band,rooftopBand:{ready:true},arcadeCabinet:{ready:arcade,status:'ready'},cullDecorativeLights(){},renderer:{async compileAsync(){compiled++;}}});
    const prepared=world.prepareForPlay(p=>progress.push(p)).then(()=>complete=true);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(compiled,0);
    finishScenery();finishArcade();await new Promise(resolve=>setImmediate(resolve));assert.equal(complete,false);assert.equal(compiled,0);
    finishBand();await prepared;assert.equal(compiled,1);assert.equal(progress.at(-1),1);assert.equal(complete,true);
  }finally{globalThis.window=savedWindow;}
});

test('texture preparation accepts hidden outfit and uniform maps without uploading discarded fallback maps', async()=>{
  const scene=new THREE.Scene(),map=new THREE.Texture(),dye=new THREE.Texture(),fallback=new THREE.Texture();
  const group=new THREE.Group();group.visible=false;scene.add(group);
  group.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:fallback})));
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map})));
  const uploaded=[];await uploadSceneTextures({initTexture(texture){uploaded.push(texture);}},scene,[dye,map]);
  assert.deepEqual(uploaded,[dye,map]);
});
