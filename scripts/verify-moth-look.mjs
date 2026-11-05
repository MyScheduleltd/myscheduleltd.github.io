// Actual Chrome render evidence: all nine arenas, both modes, phone framing,
// protected interface pixels, fixed dither, WebGL loss/Canvas fallback, and
// scene-pass timings. This is local browser evidence, not physical-phone QA.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || '.qa/moth/look-review');
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
const allFights = [
  ['office','level1-stage1'], ['bathroom','level2-stage2'], ['massage','level3-stage2'],
  ['arcade','level4-stage1'], ['studio','studio-stage1'], ['river','level5-stage2'],
  ['concert','level6-stage2'], ['secretLaugh','secret-xiaosi'], ['secretSquat','secret-getdown']
];
const only = process.argv.find(arg => arg.startsWith('--theme='))?.slice(8);
const fights=only ? allFights.filter(([name])=>name===only) : allFights;
const resume = process.argv.includes('--narratives-only');
const previous = resume ? JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8')) : null;
const report = {browser: 'Headless local Chrome; software GPU permitted', fights: previous?.fights || [], phone: [], narratives: [], errors: []};
async function setup(phone = false, noWebgl = false) {
  const context = await browser.newContext({viewport: phone ? {width:393,height:852} : {width:1440,height:1000},
    isMobile: phone, hasTouch: phone, reducedMotion: 'reduce'});
  await stubScoreboard(context);
  if (noWebgl) await context.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      return ['webgl','webgl2','experimental-webgl'].includes(kind) ? null : get.call(this, kind, ...args);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => { report.errors.push(String(error)); console.error('look page error',String(error)); });
  await page.goto(new URL(`moth/staff/?device=${phone ? 'phone' : 'desktop'}`, base).href, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout:90000});
  assert(await page.evaluate(() => typeof bobbyGame.renderCinematicScene === 'function'), 'Built runtime includes scene look');
  await page.evaluate(() => { bobbyGame.debugUnlockAllStages(); bobbyGame.progress.flags.debugSecretLevelsUnlocked=true; window.__lookOriginalUpdate = bobbyGame.update; });
  return {page, context};
}
async function fight(page, stage, hard = false) {
  await page.evaluate(async ({stage, hard}) => {
    const g = bobbyGame; g.update = window.__lookOriginalUpdate; g.returnToTitle();
    g.progress.flags.debugSecretLevelsUnlocked=true;
    g.setDifficulty(hard ? 'shoot' : 'chill', {persist:false, announce:false});
    await g.startStage(stage, {freePlay:true, skipAudio:true});
  }, {stage, hard});
  await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm
    && !bobbyGame.level1OfficeRhythm.graphicsLoading && !bobbyGame.levelLoadingPresentation
    && !(bobbyGame.stageCountdown > 0) && bobbyGame.level1OfficeRhythm.tutorial?.mode === 'done', undefined, {timeout:180000});
  await page.evaluate(() => {
    const g = bobbyGame, r = g.level1OfficeRhythm;
    g.update = () => {}; g.time = 12.25; g.songTime = 12; r.frozenSongTime = 12;
    r.phaseIntroTimer = 0; r.judgment = null; r.trackPulse = null; r.hype = .55; r.misses = 7;
    r.bobbyActionTimer = 0; r.bobbyReactionTimer = 0; r.reactionTimer = 0;
    g.hitBursts = []; g.screenShake = 0;
  });
}
async function cadence(page) {
  return page.evaluate(async () => {
    const sample = async enabled => {
      bobbyGame.cinematicLookEnabled=enabled;
      const times=[]; let previous=null;
      await new Promise(resolve => {
        const tick=time=>{ if(previous!==null) times.push(time-previous); previous=time;
          if(times.length<40) requestAnimationFrame(tick); else resolve(); };
        requestAnimationFrame(tick);
      });
      const sorted=times.slice(5).sort((a,b)=>a-b);
      return {medianFrameMs:sorted[Math.floor(sorted.length*.5)], p95FrameMs:sorted[Math.floor(sorted.length*.95)],
        longestFrameMs:Math.max(...sorted), samples:sorted.length};
    };
    const baseline=await sample(false), graded=await sample(true);
    return {baseline,graded};
  });
}
async function orderedTextureProof(page, backend) {
  const result=await page.evaluate(backend=>{
    const source=document.createElement('canvas'); source.width=source.height=32;
    const target=source.getContext('2d');target.fillStyle='#777777';target.fillRect(0,0,32,32);
    const profile={shadow:[0,0,0],highlight:[0,0,0],haze:[0,0,0],vignette:0,lights:[]};
    if(backend==='webgl') {
      const renderer=createMothCinematicRenderer();
      if(!renderer)throw new Error('No GPU for ordered texture proof');
      renderer.draw(source,32,32,profile); target.drawImage(renderer.canvas,0,0);
      renderer.canvas.getContext('webgl').getExtension('WEBGL_lose_context')?.loseContext();
    } else bobbyGame.renderCinematicFallback(target,32,32,profile);
    const pixels=target.getImageData(0,0,32,32).data;
    const levels=[...new Set(Array.from({length:1024},(_,i)=>pixels[i*4]))].sort((a,b)=>a-b);
    let periodic=true;
    for(let y=0;y<24;y++)for(let x=0;x<24;x++)for(let c=0;c<3;c++){
      const at=(y*32+x)*4+c;
      periodic&&=pixels[at]===pixels[(y*32+x+8)*4+c]&&pixels[at]===pixels[((y+8)*32+x)*4+c];
    }
    return {backend,levels,contrast:levels.at(-1)-levels[0],periodic};
  },backend);
  assert(result.contrast>=18,`${backend}: ordered texture has visible contrast on an otherwise flat midtone`);
  assert(result.periodic,`${backend}: fixed native-pixel Bayer tile repeats without noise`);
  return result;
}
async function compare(page, prefix, phone = false, performanceFrames = 30, sceneHeight = 508, translucentInterface = false) {
  const shot = await page.evaluate(({phone, performanceFrames, sceneHeight}) => {
    const g = bobbyGame, target = phone ? g.portraitCtx : g.ctx;
    const draw = () => { g.render(); g.renderTallScreen(); };
    const snapshot = () => target.getImageData(0, 0, target.canvas.width, target.canvas.height).data;
    const reads = {canvas:0, webgl:0};
    const read2d = CanvasRenderingContext2D.prototype.getImageData, readgl = WebGLRenderingContext.prototype.readPixels;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) { reads.canvas++; return read2d.apply(this,args); };
    WebGLRenderingContext.prototype.readPixels = function(...args) { reads.webgl++; return readgl.apply(this,args); };
    // Warm the browser's Canvas/GPU handoff before comparing raster output.
    g.cinematicLookEnabled = true; draw();
    g.cinematicLookEnabled = false; draw(); draw();
    const before = snapshot(), beforePNG = target.canvas.toDataURL();
    // Only inspect the implementation's pass for CPU readback. Scene asset
    // preparation and the proof's own snapshots are outside this boundary.
    const renderPass = g.renderCinematicScene;
    let insidePass = false, passReads = 0;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) { if(insidePass) passReads++; return read2d.apply(this,args); };
    WebGLRenderingContext.prototype.readPixels = function(...args) { if(insidePass) passReads++; return readgl.apply(this,args); };
    g.renderCinematicScene = function(...args) { insidePass=true; try{return renderPass.apply(this,args);} finally{insidePass=false;} };
    g.cinematicLookEnabled = true; draw();
    const after = snapshot(), afterPNG = target.canvas.toDataURL(), telemetry = {...g.cinematicTelemetry};
    draw(); const repeated = snapshot();
    const W = target.canvas.width, H = target.canvas.height;
    const region = (x,y,w,h) => {
      let changed=0, delta=0, blackBefore=0, blackAfter=0, lumaBefore=0, lumaAfter=0, pixels=0, opaqueTextPixels=0, alteredOpaqueText=0;
      for(let yy=y; yy<y+h; yy++) for(let xx=x; xx<x+w; xx++) {
        const i=(yy*W+xx)*4; let different=false;
        for(let c=0;c<3;c++) { const d=Math.abs(after[i+c]-before[i+c]); delta+=d; different ||= d>0; }
        const lb=before[i]*.2126+before[i+1]*.7152+before[i+2]*.0722;
        const la=after[i]*.2126+after[i+1]*.7152+after[i+2]*.0722;
        if(before[i]>224 && before[i+1]>210 && before[i+2]>175) { opaqueTextPixels++;
          if(Math.max(...[0,1,2].map(c=>Math.abs(after[i+c]-before[i+c])))>8) alteredOpaqueText++; }
        lumaBefore+=lb; lumaAfter+=la; blackBefore+=lb<6; blackAfter+=la<6; changed+=different; pixels++;
      }
      return {changed, pixels, fraction:changed/pixels, averageChannelDelta:delta/pixels/3, opaqueTextPixels, alteredOpaqueText,
        lumaBefore:lumaBefore/pixels, lumaAfter:lumaAfter/pixels, blackBefore:blackBefore/pixels, blackAfter:blackAfter/pixels};
    };
    let repeatDifference=0; for(let i=0;i<after.length;i++) if(after[i]!==repeated[i]) repeatDifference++;
    const scene = region(0,0,W,phone ? 500 : Math.min(sceneHeight,H));
    const interfaceTop=phone ? 520 : sceneHeight;
    const ui=interfaceTop < H ? region(0,interfaceTop,W,phone ? Math.min(260,H-interfaceTop) : H-interfaceTop) : null;
    const board = !phone && g.isRiverRhythm() ? region(396,18,488,84) : null;
    const durations=[];
    for(let i=0;i<performanceFrames;i++) { draw(); durations.push(g.cinematicTelemetry.passMs); }
    durations.sort((a,b)=>a-b);
    g.renderCinematicScene = renderPass;
    CanvasRenderingContext2D.prototype.getImageData = read2d;
    WebGLRenderingContext.prototype.readPixels = readgl;
    return {beforePNG, afterPNG, scene, ui, board, repeatDifference, passReads, telemetry,
      performance: {frames:performanceFrames, medianPassMs:durations[Math.floor(durations.length*.5)], p95PassMs:durations[Math.min(durations.length-1,Math.floor(durations.length*.95))]}};
  }, {phone, performanceFrames, sceneHeight});
  for(const [suffix, data] of [['before',shot.beforePNG], ['after',shot.afterPNG]]) {
    await fs.writeFile(path.join(out, `${prefix}-${suffix}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  delete shot.beforePNG; delete shot.afterPNG;
  assert(shot.scene.fraction > .55, `${prefix}: scene receives a real palette/lighting pass`);
  assert(shot.scene.averageChannelDelta > 4.5, `${prefix}: clearly visible grade and dither at play size`);
  assert(shot.scene.lumaAfter >= shot.scene.lumaBefore - 15, `${prefix}: original painted shadow detail retained`);
  assert(shot.scene.blackAfter <= shot.scene.blackBefore + .04, `${prefix}: no crushed blacks`);
  if(shot.ui) {
    if(translucentInterface) {
      // The dialogue panel is translucent over the newly graded art. Its
      // background may change; the cream glyphs and opaque portraits may not.
      // Stronger source lighting legitimately shows through a translucent
      // panel. Keep that blend bounded while protecting actual opaque ink.
      assert(shot.ui.averageChannelDelta < Math.max(4,shot.scene.averageChannelDelta*.35)
        && shot.ui.alteredOpaqueText / Math.max(1,shot.ui.opaqueTextPixels) < .01,
        `${prefix}: translucent panel preserves opaque UI/text ${JSON.stringify(shot.ui)}`);
    } else assert(shot.ui.fraction < .003 && shot.ui.averageChannelDelta < .025,
      `${prefix}: interface colours/bounds preserved; only browser edge antialiasing may differ ${JSON.stringify(shot.ui)}`);
  }
  if(shot.board) assert.equal(shot.board.changed,0, `${prefix}: river measuring board untouched`);
  assert.equal(shot.passReads,0, `${prefix}: no per-frame CPU readback`);
  if(shot.repeatDifference) console.log('repeat metrics',prefix,JSON.stringify(shot));
  assert.equal(shot.repeatDifference,0, `${prefix}: fixed dither and lights do not flicker at rest`);
  assert.equal(shot.telemetry.animatedNoise,false, `${prefix}: reduced-motion safe look`);
  assert.equal(shot.telemetry.paletteLevels,10, `${prefix}: strong ordered palette texture is active`);
  assert.equal(shot.telemetry.ditherMix,.92, `${prefix}: full-strength fixed dither is active`);
  return shot;
}
try {
  const desktop = await setup();
  report.orderedTexture=await orderedTextureProof(desktop.page,'webgl');
  for(const [name,stage] of process.argv.includes('--narratives-only') ? [] : fights) {
    for(const hard of [false,true]) {
      await fight(desktop.page,stage,hard);
      const result = await compare(desktop.page, `${name}-${hard ? 'hard' : 'easy'}`,false,hard ? 6 : 30);
      assert.equal(result.telemetry.profile,name,`${name}: scene-specific lighting`);
      assert.equal(result.telemetry.backend,'webgl',`${name}: GPU shader used`);
      if(!hard && ['office','river','concert'].includes(name)) result.cadence=await cadence(desktop.page);
      report.fights.push({name,mode:hard ? 'hard' : 'easy',...result});
      await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
      if(name==='river'&&hard) await desktop.page.screenshot({path:path.join(out,'river-framed-final.png'),fullPage:true});
      console.log(`look ${name}/${hard ? 'hard' : 'easy'} PASS ${result.performance.medianPassMs.toFixed(2)} ms`);
    }
  }
  // Native phone composition and UI copy, including river's repositioned board.
  const phone = await setup(true);
  for(const [name,stage] of fights.filter(([name]) => ['office','studio','river','concert','secretSquat'].includes(name))) {
    await fight(phone.page,stage,true);
    const result = await compare(phone.page, `${name}-phone`,true,12);
    if(['river','concert'].includes(name)) result.cadence=await cadence(phone.page);
    report.phone.push({name,...result});
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    if(name==='river') await phone.page.screenshot({path:path.join(out,'river-phone-framed-final.png'),fullPage:true});
    console.log(`look ${name}/phone PASS`);
  }
  await phone.context.close();
  // Narrative/roaming renderers have their own scene compositions. Their
  // lower dialogue UI draws after the grade, including native phone scenes.
  for(const [name,stage,state,sceneHeight] of (only ? [] : [
    ['living-room','level3-stage1','level3',720],
    ['bedroom','level4-meme-chest','level4',720],
    ['studio-dialogue','studio-pre','studioPreDialogue',508],
    ['night-drive','level5-stage1','level5Dialogue',508],
    ['dream','level6-stage1','level6Dream',508],
    ['wake-up','finale-stage1','level6WakeUp',508]
  ])) {
    await desktop.page.evaluate(async stage => {
      const g=bobbyGame; g.update=window.__lookOriginalUpdate; g.returnToTitle(); await g.debugJumpToStage(stage);
    },stage);
    await desktop.page.waitForFunction(state => bobbyGame.state===state && !bobbyGame.levelLoadingPresentation,
      state,{timeout:180000});
    await desktop.page.evaluate(() => { const g=bobbyGame; g.update=()=>{}; g.time=12.25;
      g.level6DreamStartedAt=10; g.level6DreamBubbleAt=10; g.level6DreamIndex=1; g.level6WakeTimer=6;
      if(g.level5Drive) g.level5Drive.startedAt=10; });
    const result=await compare(desktop.page,name,false,12,sceneHeight,true);
    report.narratives.push({name,...result});
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log('look '+name+' PASS');
  }
  // A lost GPU must degrade immediately to a fixed Canvas look, never blank
  // the scene or prevent a song from rendering.
  await fight(desktop.page,'level5-stage2');
  const lost = await desktop.page.evaluate(async () => {
    const g=bobbyGame;
    const extension=g.cinematicRenderer?.canvas.getContext('webgl')?.getExtension('WEBGL_lose_context');
    if(!extension) return {supported:false};
    extension.loseContext(); await new Promise(resolve=>setTimeout(resolve,100));
    g.render(); return {supported:true,...g.cinematicTelemetry};
  });
  assert(lost.supported && lost.backend==='canvas2d','GPU context loss switches to a live Canvas fallback');
  report.contextLoss=lost;
  await desktop.context.close();
  const fallback=await setup(false,true);
  report.orderedFallbackTexture=await orderedTextureProof(fallback.page,'canvas2d');
  await fight(fallback.page,'level6-stage2');
  report.fallback=await compare(fallback.page,'concert-canvas-fallback',false,12);
  assert.equal(report.fallback.telemetry.backend,'canvas2d','No-WebGL devices use stable fallback');
  await fallback.context.close();
  assert.deepEqual(report.errors,[],'No scene/render exceptions');
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`PASS: ${report.fights.length} desktop arena/mode combinations, ${report.phone.length} phone cases, context loss and Canvas fallback. Proof: ${out}`);
} finally { await browser.close(); }
