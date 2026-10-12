import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const out = path.resolve('.qa/moth/loading-audio');
await fs.mkdir(out, {recursive:true});
const report = [];
for (const [engine,type] of [['chrome',chromium],['webkit',webkit]]) {
  const browser = await type.launch(engine === 'chrome' ? {executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']} : {headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage(), errors = [], frameErrors = [], requests = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message=>{if(message.type()==='error'&&message.text().startsWith('Frame step failed:')) frameErrors.push(message.text());});
    page.on('request', request => requests.push(request.url()));
    const started = Date.now();
    await page.goto(new URL('moth/staff/?device=phone',base).href, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.bobbyGame?.bootDone);
    assert.equal(await page.evaluate(()=>bobbyGame.state), 'title');
    const initialArt = requests.filter(url=>/\.(webp|m4a|wav)(\?|$)/.test(url));
    assert.equal(initialArt.filter(url=>!/mobile_|pocket_device_shell|forge_device_shell/.test(url)).length,0,'Title downloads no chapter art or songs');
    const titleMs = Date.now()-started;
    console.log(engine,'title',titleMs,'ms');
    // Use the ordinary keyboard menu entry to play an unlocked playlist track.
    await page.evaluate(()=>{bobbyGame.completeStage('level1-stage1');bobbyGame.homeMenu.index=3;});
    await page.keyboard.press('Enter');
    await page.evaluate(()=>{bobbyGame.homeMenu.index=bobbyGame.getHomePlaylistSongDefs().findIndex(song=>!song.locked);});
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>bobbyGame.songPreview?.audio.currentTime>0.5,{},{timeout:30000});
    const music = await page.evaluate(async()=>{
      const g=bobbyGame, audio=g.songPreview.audio, route=g.musicAudioRoutes.get(audio), analyser=route.context.createAnalyser();
      analyser.fftSize=2048; route.gain.connect(analyser);
      let peak=0;
      for(let n=0;n<20;n++) {const samples=new Float32Array(2048);analyser.getFloatTimeDomainData(samples);peak=Math.max(peak,...samples.map(Math.abs));await new Promise(r=>setTimeout(r,100));}
      route.gain.disconnect(analyser);
      return {peak,time:audio.currentTime,volume:audio.volume,context:route.context.state,oneEngine:g.level1OfficeAudioContext===g.musicAudioContext};
    });
    assert(music.peak>0.001,'Playlist produces nonzero PCM through the game output');
    assert.equal(music.context,'running');assert(music.oneEngine);
    console.log(engine,'playlist PCM',music.peak);
    await page.evaluate(()=>{bobbyGame.returnToTitle();bobbyGame.homeMenu.index=0;});
    await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    await page.waitForFunction(()=>bobbyGame.state==='playing'&&!bobbyGame.level1OfficeRhythm?.graphicsLoading,undefined,{timeout:90000});
    assert.deepEqual(await page.evaluate(()=>[...bobbyGame.loadedSceneGroups].sort()),['common','office','player']);
    const effects = await page.evaluate(async()=>{
      const g=bobbyGame, context=g.level1OfficeAudioContext, analyser=context.createAnalyser();
      analyser.fftSize=2048;const node=g.ensureFeedbackOutput(context);node.connect(analyser);
      g.runSfxTest();let peak=0;
      for(let n=0;n<15;n++){const samples=new Float32Array(2048);analyser.getFloatTimeDomainData(samples);peak=Math.max(peak,...samples.map(Math.abs));await new Promise(r=>setTimeout(r,50));}
      node.disconnect(analyser);return {peak,decoded:Object.keys(g.sfxBuffers).length,played:g.sfxTestResult};
    });
    assert(effects.peak>0.001);assert(effects.played);assert.equal(effects.decoded,27);
    console.log(engine,'effects PCM',effects.peak);
    await page.screenshot({path:path.join(out,`${engine}-office.png`)});
    // Enter each chapter through its normal loading gate, then check eviction.
    for(const [stage,group] of [['level2-stage2','level2'],['level3-stage2','level3'],['level4-stage1','level4'],['studio-stage1','studio'],['level5-stage2','level5'],['level6-stage2','level6']]) {
      await page.evaluate(id=>{bobbyGame.returnToTitle();bobbyGame.startStage(id,{skipAudio:true});},stage);
      await page.waitForFunction(group=>bobbyGame.loadedSceneGroups.has(group)&&!bobbyGame.levelLoadingPresentation&&bobbyGame.state==='playing',group,{timeout:90000});
      const groups=await page.evaluate(()=>[...bobbyGame.loadedSceneGroups].sort());
      assert(groups.includes(group));assert(!groups.includes('office'),'Previous chapter art released');
      // Drawn in every fight although named after one chapter: GANGAN's coach chip and Dr. Beauty's HUD portrait.
      assert(await page.evaluate(()=>Boolean(bobbyGame.refs.level1OfficeGanganCoachSheet&&bobbyGame.refs.bobby)),'Coach chip and HUD portraits loaded');
      // GANGAN's chip portrait stays inside the chip (its cap used to stand above the border).
      assert(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=120;const t=c.getContext('2d');bobbyGame.drawGanganCoachChip(t,{x:10,y:40,w:280,h:52},{row:0,color:'#8fe8ff',text:'x',kind:'perfect'},1,0);return t.getImageData(0,0,300,40).data.every((v,i)=>i%4!==3||v===0);}),'Coach portrait inside its chip');
      assert.equal(await page.evaluate(()=>bobbyGame.loadError),'');
      console.log(engine,stage,'PASS',groups);
    }
    // Verify the hidden-level resource groups and finale entry as well.
    await page.evaluate(()=>bobbyGame.returnToTitle());
    await page.keyboard.press('KeyP');
    await page.locator('[data-debug-action="unlockSecrets"]').click();
    await page.keyboard.press('KeyP');
    await page.evaluate(()=>bobbyGame.startStage('secret-xiaosi',{skipAudio:true}));
    await page.waitForFunction(()=>bobbyGame.state==='playing'&&!bobbyGame.levelLoadingPresentation&&bobbyGame.loadedSceneGroups.has('secret-xiaosi'),undefined,{timeout:90000});
    assert(!await page.evaluate(()=>bobbyGame.loadedSceneGroups.has('level6')));
    await page.evaluate(()=>{bobbyGame.returnToTitle();bobbyGame.startStage('finale-stage1',{freePlay:true});});
    await page.waitForFunction(()=>bobbyGame.loadedSceneGroups.has('level6')&&!bobbyGame.levelLoadingPresentation,undefined,{timeout:90000});
    assert(!await page.evaluate(()=>bobbyGame.loadedSceneGroups.has('secret-xiaosi')));
    await page.evaluate(()=>{bobbyGame.returnToTitle();bobbyGame.startLevelLoading('level1-stage0',()=>bobbyGame.startTutorialStage0());});
    await page.waitForFunction(()=>bobbyGame.loadedSceneGroups.has('road')&&!bobbyGame.levelLoadingPresentation,undefined,{timeout:90000});
    assert.equal(await page.evaluate(()=>bobbyGame.currentStageId),'level1-stage0');
    // An earlier download must not reopen its scene after the target changes.
    await page.goto(new URL('moth/staff/?device=phone',base).href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.bobbyGame?.bootDone);
    await page.route('**/foreground.webp*',async route=>{await new Promise(r=>setTimeout(r,1000));await route.continue();});
    await page.evaluate(()=>bobbyGame.startStage('level1-stage1',{skipAudio:true}));
    await page.waitForFunction(()=>bobbyGame.sceneLoadProgress?.total>0);
    await page.evaluate(()=>{bobbyGame.returnToTitle();bobbyGame.startStage('level2-stage2',{skipAudio:true});});
    await page.waitForFunction(()=>bobbyGame.state==='playing'&&!bobbyGame.levelLoadingPresentation&&bobbyGame.loadedSceneGroups.has('level2'),undefined,{timeout:90000});
    assert.equal(await page.evaluate(()=>bobbyGame.currentStageId),'level2-stage2');
    assert(!await page.evaluate(()=>bobbyGame.loadedSceneGroups.has('office')));
    await page.unroute('**/foreground.webp*');
    // A recoverable network failure retries instead of aborting the whole boot.
    await page.goto(new URL('moth/staff/?device=phone',base).href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.bobbyGame?.bootDone);
    let transient = 0;
    await page.route('**/foreground.webp*', route => {if (++transient===1) return route.fulfill({status:503,body:'temporary'});return route.continue();});
    await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    await page.waitForFunction(()=>bobbyGame.state==='playing'&&!bobbyGame.level1OfficeRhythm?.graphicsLoading,undefined,{timeout:90000});
    assert.equal(transient,2);assert.equal(await page.locator('.load-recovery').count(),0);
    await page.unroute('**/foreground.webp*');
    await page.goto(new URL('moth/staff/?device=phone',base).href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.bobbyGame?.bootDone);
    let permanent=0;
    await page.route('**/foreground.webp*', route=>{permanent++;return route.fulfill({status:503,body:'unavailable'});});
    await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    await page.locator('.load-recovery').waitFor({state:'visible',timeout:30000});
    assert.equal(permanent,3);assert(await page.locator('.load-recovery').innerText().then(text=>/REFRESH PAGE|重新整理網頁/.test(text)));
    assert(!await page.locator('.load-recovery').innerText().then(text=>/assets\/|Could not load/.test(text)));
    await page.screenshot({path:path.join(out,`${engine}-refresh-prompt.png`)});
    await page.evaluate(()=>sessionStorage.setItem('moth.qa-refresh','preserved'));
    await page.unroute('**/foreground.webp*');
    await page.locator('.load-recovery button').click();
    await page.waitForFunction(()=>window.bobbyGame?.bootDone&&bobbyGame.state==='title');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('moth.qa-refresh')),'preserved');
    // A blocked audio start has a real button, rather than an invisible pause.
    await page.evaluate(()=>bobbyGame.showAudioRecovery('start'));
    assert(await page.locator('.audio-recovery:not(.load-recovery)').isVisible());
    await page.locator('.audio-recovery:not(.load-recovery) button').click();
    await page.waitForFunction(()=>!bobbyGame.audioRecoveryVisible());
    // The same recovery art and refresh control must work in the public build.
    await context.addInitScript(()=>{window.__qaText=[];const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.__qaText.push(String(text));if(window.__qaText.length>3000)window.__qaText.splice(0,1000);return fill.call(this,text,...args);};});
    await page.goto(new URL('moth/?device=phone',base).href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__qaText.some(text=>/STORY MODE|故事模式/.test(text)));
    await page.route('**/foreground.webp*',route=>route.fulfill({status:503,body:'unavailable'}));
    await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    await page.locator('.load-recovery').waitFor({state:'visible',timeout:30000});
    assert.equal(await page.locator('.debug-panel,.debug-panel-toggle').count(),0);
    assert.equal(await page.evaluate(()=>typeof window.bobbyGame),'undefined');
    // Behind the prompt the screen says CONNECTION LOST and draws no scene or HUD.
    await page.evaluate(()=>{window.__qaText.length=0;});
    await page.waitForTimeout(500);
    const behind = await page.evaluate(()=>[...new Set(window.__qaText)]);
    assert(behind.length&&behind.every(text=>/^(CONNECTION LOST|連線中斷)$/.test(text)),`Only CONNECTION LOST behind the prompt: ${behind}`);
    await page.screenshot({path:path.join(out,`${engine}-public-refresh-prompt.png`)});
    await page.unroute('**/foreground.webp*');
    await page.locator('.load-recovery button').click();
    await page.waitForFunction(()=>window.__qaText.some(text=>/STORY MODE|故事模式/.test(text)));
    assert.deepEqual(errors,[]);
    assert.deepEqual(frameErrors,[]);
    report.push({engine,titleMs,initialChapterDownloads:0,music,effects,chapterEntries:10,cancelledEntryIgnored:true,transientRetry:true,permanentRetries:permanent,refreshRetainsSession:true,publicRefreshPrompt:true,audioRecoveryButton:true,errors,frameErrors});
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(engine,'PASS loading, chapter eviction, audio PCM, retry and refresh');
    await context.close();
  } finally {await browser.close();}
}
