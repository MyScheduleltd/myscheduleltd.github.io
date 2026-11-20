// Timing regressions plus visible bilingual keyboard/touch settings. Separate
// AudioWorklet PCM audits compare the actual rendered song with this clock.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
import {TIMING_RESET_ID} from './moth-output-timing.mjs';
const base=process.argv[2]||'http://127.0.0.1:5297/';
const out=path.resolve('.qa/moth/timing-audit-20261120/output-settings');
await fs.mkdir(out,{recursive:true});const report=[];
for(const phone of [false,true]){
 const browser=await(phone?webkit:chromium).launch(phone?{headless:true}:{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:1000},isMobile:phone,hasTouch:phone});await stubScoreboard(context);
  // A device already past the one-time reset (moth-output-timing.mjs clears every
  // older calibration once and stores a mode from then on;
  // .qa/moth/timing-check-20261120 checks that): its manual value is kept.
  await context.addInitScript(id=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');localStorage.setItem('moth.staff.audioOffsetSeconds','.096');localStorage.setItem('moth.staff.audioOffsetSeconds.mode','manual');localStorage.setItem('moth.staff.audioOffsetSeconds.reset',id);},TIMING_RESET_ID);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(new URL('moth/staff/?device='+(phone?'phone':'desktop'),base).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>bobbyGame?.bootDone,undefined,{timeout:90000});
  await page.locator('#moth-boot-loading').waitFor({state:'detached',timeout:10000});
  const values=await page.evaluate(()=>{
   const g=bobbyGame;
   const legacy={mode:g.getTimingMode(),total:g.getAudioOffsetSeconds()};
   g.setTimingMode('auto');
   const preserved=localStorage.getItem('moth.staff.audioOffsetSeconds');
   const read=(outputLatency,baseLatency=.005805,state='running',manual=0,skipAudio=false)=>{
    const track={},context={outputLatency,baseLatency,state};
    const receiver={level1OfficeRhythm:{skipAudio},getAudioOffsetSeconds:()=>manual,
      getActiveLevel1OfficeRhythmAudio:()=>track,musicAudioRoutes:new Map([[track,{context}]]),
      getReportedOutputDelay:g.getReportedOutputDelay};
    return g.getRhythmOutputDelay.call(receiver);
   };
   const values={legacy,preserved,automaticOffset:g.getAudioOffsetSeconds(),
    bt:read(.248),longBt:read(.4),wired:read(.02),manual:read(.248,.005805,'running',.096),
    zero:read(0,0),invalid:read(NaN),negative:read(-.1),excessive:read(1.2),
    suspended:read(.248,.005805,'suspended'),skipped:read(.248,.005805,'running',0,true)};
   g.setAudioOffsetSeconds(0);values.manualZero=g.getTimingMode();
   g.setAudioOffsetSeconds(.096);g.returnToTitle();g.openTimingCalibration();
   return values;
  });
  assert.deepEqual(values.legacy,{mode:'manual',total:.096});assert.equal(values.preserved,'.096');assert.equal(values.automaticOffset,0);
  assert(Math.abs(values.bt-.253805)<1e-9&&Math.abs(values.longBt-.405805)<1e-9&&Math.abs(values.wired-.025805)<1e-9);
  for(const key of ['manual','zero','invalid','negative','excessive','suspended','skipped'])assert.equal(values[key],0,key);
  assert.equal(values.manualZero,'manual');
  // The existing total is preserved; M selects auto rather than adding it.
  await page.keyboard.press('m');
  assert.equal(await page.evaluate(()=>bobbyGame.getTimingMode()),'auto');
  assert.equal(await page.evaluate(()=>bobbyGame.getManualAudioOffsetSeconds()),.096);
  for(const language of ['en','zh-TW']){
   await page.evaluate(language=>{bobbyGame.setLanguage(language);bobbyGame.render();},language);
   await page.screenshot({path:path.join(out,(phone?'phone':'desktop')+'-'+language+'.png')});
  }
  // Increment from the reported automatic total, not from zero.
  const adjustment=await page.evaluate(()=>{
   const g=bobbyGame,old=g.getReportedOutputDelay;g.getReportedOutputDelay=()=>.254;
   g.moveHomeMenuSelection(-1);const result={mode:g.getTimingMode(),offset:g.getAudioOffsetSeconds()};
   g.getReportedOutputDelay=old;return result;
  });assert.deepEqual(adjustment,{mode:'manual',offset:.259});
  const touch=await page.evaluate(()=>{
   const g=bobbyGame,p=homeGeometry().panel;
   g.handleCanvasPointerDown({x:p.x+p.w/2,y:p.y+437},{pointerId:1});
   return {mode:g.getTimingMode(),phase:g.homeMenu.calibration.phase};
  });assert.equal(touch.mode,'auto');assert.equal(touch.phase,'ready');
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>bobbyGame?.bootDone,undefined,{timeout:90000});
  assert.equal(await page.evaluate(()=>bobbyGame.getTimingMode()),'auto','Explicit automatic persists across reload');
  assert.deepEqual(errors,[]);report.push({phone,values,adjustment,touch});console.log('PASS',phone?'WebKit phone':'Chrome desktop','Bluetooth cutoff, preserved96, automatic/manual, bilingual UI, keyboard and touch');
  await context.close();
 }finally{await browser.close();}
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,cases:report},null,2)+'\n');
