// Combo graphics receive the scene's fixed Bayer texture on their own alpha
// layer. Exercise every callout, protected HUD pixels, freeze/cache behavior,
// transparency, and real WebGL context-loss fallback. No production scores.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5297/';
const out = path.resolve(process.env.MOTH_COMBO_LOOK_OUTPUT || '.qa/moth/concert-ending-20261120/combo');
await fs.mkdir(out, {recursive: true});
const report = {cases: [], alpha: [], fallback: [], errors: []};
for (const phone of [false, true]) {
  const label = phone ? 'phone-webkit' : 'desktop-chrome';
  const browser = await (phone ? webkit : chromium).launch(phone ? {headless:true} : {
    executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:phone ? {width:390,height:844} : {width:1280,height:900}, isMobile:phone, hasTouch:phone});
    await stubScoreboard(context);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    await page.goto(new URL('moth/staff/?device=' + (phone ? 'phone' : 'desktop'), base).href, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout:90000});
    assert(await page.evaluate(() => typeof bobbyGame.getCinematicComboGraphic === 'function'), 'Built runtime has combo grading');
    // A flat opaque patch, a half-alpha edge and transparent outside pixels
    // distinguish true alpha preservation from a black rectangular overlay.
    const alpha = await page.evaluate(() => {
      const source = document.createElement('canvas'); source.width=source.height=32;
      const ink=source.getContext('2d'); ink.fillStyle='rgb(128,96,64)'; ink.fillRect(8,8,16,16);
      ink.fillStyle='rgba(128,96,64,.5)'; ink.fillRect(7,8,1,16);
      const profile={shadow:[0,0,0],highlight:[0,0,0],haze:[0,0,0],vignette:0,lights:[]};
      const renderer=createMothCinematicRenderer({alpha:true});
      if(!renderer)return{backend:'canvas2d'};
      renderer.draw(source,32,32,profile);
      const output=document.createElement('canvas');output.width=output.height=32;const target=output.getContext('2d');target.drawImage(renderer.canvas,0,0);
      const pixels=target.getImageData(0,0,32,32).data, before=ink.getImageData(0,0,32,32).data;
      let alphaErrors=0, changed=0;const values=new Set();
      for(let i=0;i<pixels.length;i+=4){alphaErrors+=Math.abs(pixels[i+3]-before[i+3])>1;if(before[i+3]===255){values.add(pixels[i]);changed+=pixels[i]!==before[i]||pixels[i+1]!==before[i+1]||pixels[i+2]!==before[i+2];}}
      renderer.canvas.getContext('webgl').getExtension('WEBGL_lose_context')?.loseContext();
      return{backend:'webgl',alphaErrors,changed,redLevels:[...values],outsideAlpha:pixels[3],edgeAlpha:pixels[(8*32+7)*4+3]};
    });
    if(alpha.backend==='webgl') {assert.equal(alpha.alphaErrors,0);assert.equal(alpha.outsideAlpha,0);assert(Math.abs(alpha.edgeAlpha-127)<=1);assert(alpha.changed>100&&alpha.redLevels.length>=2);}
    report.alpha.push({label,...alpha});
    await page.evaluate(async()=>{const g=bobbyGame;g.debugUnlockAllStages();await g.startStage('level1-stage1',{freePlay:true,skipAudio:true});});
    await page.waitForFunction(()=>bobbyGame.state==='playing'&&bobbyGame.level1OfficeRhythm&&!bobbyGame.levelLoadingPresentation
      &&!bobbyGame.level1OfficeRhythm.graphicsLoading&&!(bobbyGame.stageCountdown>0)&&bobbyGame.level1OfficeRhythm.tutorial?.mode==='done',undefined,{timeout:120000});
    await page.evaluate(()=>{const g=bobbyGame,r=g.level1OfficeRhythm;g.update=()=>{};g.time=20;r.frozenSongTime=12;r.phaseIntroTimer=0;r.judgment=null;g.hitBursts=[];g.screenShake=0;g.renderCinematicScene=()=>{};});
    // Readback can switch Chrome's scaled Canvas2D image rasterizer from
    // GPU to CPU. Use one stable reference rasterizer for mask comparisons.
    await page.evaluate(()=>{bobbyGame.scratchLayers['cinematic-combo']=document.createElement('canvas').getContext('2d',{willReadFrequently:true});bobbyGame.cinematicComboCache=null;});
    for(let index=0;index<6;index++) {
      const result = await page.evaluate(index=>{
        const g=bobbyGame,r=g.level1OfficeRhythm,target=g.isTallScreenView()?g.portraitCtx:g.ctx;
        g.time=20;r.combo=(index+1)*10;r.lastCelebratedCombo=0;g.celebrateRhythmCombo();g.time=20.5;
        const draw=()=>{g.render();g.renderTallScreen();};
        const snapshot=()=>target.getImageData(0,0,target.canvas.width,target.canvas.height).data;
        g.cinematicLookEnabled=false;draw();const before=snapshot();
        const sourceAlpha=g.scratchLayers['cinematic-combo'].getImageData(0,0,1280,g.scratchLayers['cinematic-combo'].canvas.height).data;
        const original2d=CanvasRenderingContext2D.prototype.getImageData,originalGl=WebGLRenderingContext.prototype.readPixels;
        let reads=0;CanvasRenderingContext2D.prototype.getImageData=function(...a){reads++;return original2d.apply(this,a);};
        WebGLRenderingContext.prototype.readPixels=function(...a){reads++;return originalGl.apply(this,a);};
        g.cinematicLookEnabled=true;draw();const passReads=reads,telemetry={...g.cinematicComboTelemetry};
        CanvasRenderingContext2D.prototype.getImageData=original2d;WebGLRenderingContext.prototype.readPixels=originalGl;
        const after=snapshot(),native=g.getCinematicComboGraphic({celebration:r.celebration,photo:g.refs.comboCelebrations[index],crop:r.celebrationTelemetry.photoCrop,
          photoBounds:r.celebrationTelemetry.photoBounds,captionBounds:r.celebrationTelemetry.captionBounds,lift:0,scene:r.celebrationTelemetry.bounds});
        const alphaTarget=document.createElement('canvas');alphaTarget.width=native.width;alphaTarget.height=native.height;
        const alphaInk=alphaTarget.getContext('2d');alphaInk.drawImage(native,0,0);const outputAlpha=alphaInk.getImageData(0,0,native.width,native.height).data;
        const nowSource=g.scratchLayers['cinematic-combo'].getImageData(0,0,native.width,native.height).data;
        let alphaErrors=0;const alphaExamples=[];for(let i=3;i<sourceAlpha.length;i+=4)if(Math.abs(nowSource[i]-outputAlpha[i])>1){alphaErrors++;if(alphaExamples.length<8)alphaExamples.push({x:(i-3)/4%native.width,y:Math.floor((i-3)/4/native.width),before:sourceAlpha[i],now:nowSource[i],out:outputAlpha[i]});}
        draw();const repeated=snapshot(),cached={...g.cinematicComboTelemetry};
        let changedScene=0,changedHud=0,repeatedDifference=0,delta=0;
        const W=target.canvas.width,H=target.canvas.height,uiTop=520;
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){const at=(y*W+x)*4;let changed=false;
          for(let c=0;c<4;c++){changed ||= before[at+c]!==after[at+c];repeatedDifference+=repeated[at+c]!==after[at+c];if(c<3)delta+=Math.abs(before[at+c]-after[at+c]);}
          if(changed){if(y<uiTop)changedScene++;else changedHud++;}}
        return{caption:r.celebrationTelemetry.caption,telemetry,cached,passReads,alphaErrors,alphaExamples,changedScene,changedHud,repeatedDifference,averageDelta:delta/(W*H*3)};
      },index);
      assert(result.changedScene>1000, label+' '+result.caption+' visible textured popup');
      assert.equal(result.changedHud,0,label+' '+result.caption+' beat track/HUD unchanged');
      assert.equal(result.repeatedDifference,0,label+' '+result.caption+' frozen popup stable');
      assert.equal(result.passReads,0,label+' '+result.caption+' no render-pass pixel readback');
      if(result.alphaErrors)console.log('ALPHA DIAG',JSON.stringify(result));
      if(result.alphaErrors) console.log('ALPHA DETAIL',JSON.stringify(result));
      assert.equal(result.alphaErrors,0,label+' '+result.caption+' popup alpha retained');
      assert.equal(result.cached.cached,true);assert.equal(result.cached.passes,result.telemetry.passes);
      assert(result.telemetry.preserveAlpha&&!result.telemetry.animatedNoise);
      if(index===0)await page.screenshot({path:path.join(out,label+'-combo.png')});
      report.cases.push({label,...result});console.log('PASS',label,result.caption,result.telemetry.backend,'alpha/cache/HUD/frozen dither');
    }
    const fallback=await page.evaluate(async()=>{
      const g=bobbyGame;
      if(g.cinematicComboRenderer?.canvas){g.cinematicComboRenderer.canvas.getContext('webgl').getExtension('WEBGL_lose_context')?.loseContext();await new Promise(resolve=>setTimeout(resolve,100));}
      let raw;
      const pass=g.renderCinematicFallback;
      g.renderCinematicFallback=function(target,w,h,profile,options){if(options?.preserveAlpha)raw=target.getImageData(0,0,w,h).data;return pass.call(this,target,w,h,profile,options);};
      g.cinematicComboRenderer=null;g.cinematicComboCache=null;
      try{g.render();g.renderTallScreen();}finally{g.renderCinematicFallback=pass;}
      const first={...g.cinematicComboTelemetry},source=g.scratchLayers['cinematic-combo'];
      const filtered=source.getImageData(0,0,source.canvas.width,source.canvas.height).data;
      let alphaErrors=0,changed=0,newOutside=0;
      for(let i=0;i<raw.length;i+=4){alphaErrors+=Math.abs(filtered[i+3]-raw[i+3])>1;newOutside+=raw[i+3]===0&&filtered[i+3]>0;changed+=raw[i+3]>0&&(filtered[i]!==raw[i]||filtered[i+1]!==raw[i+1]||filtered[i+2]!==raw[i+2]);}
      return{...first,alphaErrors,changed,newOutside};
    });
    assert.equal(fallback.backend,'canvas2d');assert.equal(fallback.alphaErrors,0);assert.equal(fallback.newOutside,0);assert(fallback.changed>1000);
    report.fallback.push({label,...fallback});console.log('PASS',label,'Canvas fallback keeps alpha and fixed dither');
    await context.close();
  } finally {await browser.close();}
}
assert.deepEqual(report.errors,[]);
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,...report},null,2)+'\n');
console.log('PASS',report.cases.length,'combo cases, alpha-preserving shader and Canvas fallback, protected UI, cached stable texture');
