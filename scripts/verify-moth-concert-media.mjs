// Actual decoded concert video follows the local song through loading,
// count-in, seek, pause/resume and offline playback in both arrangements.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
const base=process.argv[2]||'http://127.0.0.1:5297/';
const out=path.resolve(process.env.MOTH_CONCERT_OUTPUT||'.qa/moth/concert-ending-20261120/media');
await fs.mkdir(out,{recursive:true});const report=[];
for(const phone of (process.argv.includes('--phone')?[true]:[false,true])){
 const browser=await(phone?webkit:chromium).launch(phone?{headless:true}:{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
 const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:1000},isMobile:phone,hasTouch:phone});await stubScoreboard(context);
 const page=await context.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push({url:r.url(),at:Date.now(),type:r.resourceType()}));
 await page.addInitScript(()=>{window.__concertCsp=[];document.addEventListener('securitypolicyviolation',e=>__concertCsp.push(e.effectiveDirective+':'+e.blockedURI));});
 await page.goto(new URL('moth/staff/?device='+(phone?'phone':'desktop'),base).href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>bobbyGame?.bootDone,undefined,{timeout:90000});
 await page.evaluate(()=>{bobbyGame.debugUnlockAllStages();bobbyGame.level1TutorialSeen=true;});
 for(const fullSong of [false,true])for(const mode of ['chill','shoot']){
 await page.evaluate(({fullSong,mode})=>{const g=bobbyGame;g.returnToTitle();g.setDifficulty(mode,{persist:false,announce:false});void g.startStage('level6-stage2',{freePlay:true,fromLevelSelection:fullSong});},{fullSong,mode});
 await page.waitForFunction(()=>{const g=bobbyGame;return g.state==='playing'&&g.isConcertRhythm()&&!g.levelLoadingPresentation&&g.concertMusicVideo?.readyState>=2;},undefined,{timeout:90000});
 const count=await page.evaluate(()=>({counting:bobbyGame.isRhythmCountIn(),videoPaused:bobbyGame.concertMusicVideo.paused,videoTime:bobbyGame.concertMusicVideo.currentTime,blob:bobbyGame.concertMusicVideo.currentSrc.startsWith('blob:')}));
 assert(count.blob);if(count.counting)assert(count.videoPaused,'Video does not run ahead of count-in');
 await page.waitForFunction(()=>{const g=bobbyGame,a=g.getActiveLevel1OfficeRhythmAudio(),v=g.concertMusicVideo;return !g.isRhythmCountIn()&&a&&!a.paused&&a.currentTime>(a.mothFightLead||0)+.3&&v&&!v.paused&&!v.seeking;},undefined,{timeout:30000});
 const start=await page.evaluate(()=>({song:bobbyGame.getActiveLevel1OfficeRhythmAudio().currentTime,video:bobbyGame.concertMusicVideo.currentTime,expected:bobbyGame.getConcertVideoTime(),muted:bobbyGame.concertMusicVideo.muted}));assert(start.muted);assert(Math.abs(start.video-start.expected)<.16,'Opening video aligns with the actual music source');
 const samples=[];
 for(const time of [5,55,115,155]){
 await page.evaluate(time=>{const g=bobbyGame,a=g.getActiveLevel1OfficeRhythmAudio();a.currentTime=time+(a.mothFightLead||0);},time);
 await page.waitForFunction(()=>{const g=bobbyGame,v=g.concertMusicVideo,a=g.getActiveLevel1OfficeRhythmAudio();return !a.seeking&&!v.seeking&&!v.paused&&Math.abs(v.currentTime-g.getConcertVideoTime())<.13;},undefined,{timeout:10000});
 samples.push(await page.evaluate(()=>({video:bobbyGame.concertMusicVideo.currentTime,expected:bobbyGame.getConcertVideoTime()})));
 }
 await page.evaluate(()=>bobbyGame.pauseLevel1Office());
 await page.waitForFunction(()=>bobbyGame.concertMusicVideo.paused);
 const before=await page.evaluate(()=>({v:bobbyGame.concertMusicVideo.currentTime,a:bobbyGame.getActiveLevel1OfficeRhythmAudio().currentTime}));
 await page.waitForTimeout(250);
 const after=await page.evaluate(()=>({v:bobbyGame.concertMusicVideo.currentTime,a:bobbyGame.getActiveLevel1OfficeRhythmAudio().currentTime}));
 assert(Math.abs(before.v-after.v)<.025&&Math.abs(before.a-after.a)<.025,'Pause freezes video and song');
 await page.evaluate(()=>bobbyGame.resumeLevel1Office());
 await page.waitForFunction(()=>{const g=bobbyGame;return !g.isRhythmCountIn()&&!g.getActiveLevel1OfficeRhythmAudio().paused&&!g.concertMusicVideo.paused&&!g.concertMusicVideo.seeking;},undefined,{timeout:20000});
 await page.waitForFunction(()=>Math.abs(bobbyGame.concertMusicVideo.currentTime-bobbyGame.getConcertVideoTime())<.13,undefined,{timeout:10000});
 // Stop at a normal stage moment for the map/sprite composition screenshot.
 await page.evaluate(()=>{const g=bobbyGame,a=g.getActiveLevel1OfficeRhythmAudio();a.currentTime=42+(a.mothFightLead||0);});
 await page.waitForFunction(()=>!bobbyGame.concertMusicVideo.seeking&&Math.abs(bobbyGame.concertMusicVideo.currentTime-bobbyGame.getConcertVideoTime())<.13);
 const rendered=await page.evaluate(()=>{const g=bobbyGame;g.render();return{led:g.concertLedTelemetry,booth:g.concertBoothTelemetry,video:g.concertMusicVideo.currentTime,expected:g.getConcertVideoTime()};});
 assert(rendered.led.occludedByBooth&&rendered.led.featherPixels>=10&&rendered.led.ledMatrix);
 assert(await page.evaluate(()=>{const mask=bobbyGame.concertLedMask;const ink=mask.getContext('2d');return ink.getImageData(606,272,1,1).data[3]===0&&ink.getImageData(300,100,1,1).data[3]===255;}),'Painted booth face occludes video; open LED interior remains visible');
 assert(rendered.led.behindActors&&rendered.led.w>600&&rendered.led.frameWidth>450,'Movie occupies large LED wall');assert(!rendered.booth.duplicateBooth);assert(Math.abs(rendered.booth.y+rendered.booth.height-rendered.booth.deckY)<.001);assert(rendered.booth.centerX>990,'DJ equipment is anchored to existing painted booth');
 const label=(phone?'phone':'desktop')+'-'+(fullSong?'selection':'story')+'-'+mode;
 await page.screenshot({path:path.join(out,label+'.png')});
 if(mode==='chill'){
  await context.setOffline(true);const t=await page.evaluate(()=>bobbyGame.concertMusicVideo.currentTime);
  try{await page.waitForFunction(t=>bobbyGame.concertMusicVideo.currentTime>t+.4,t,{timeout:5000});assert(await page.evaluate(()=>Math.abs(bobbyGame.concertMusicVideo.currentTime-bobbyGame.getConcertVideoTime())<.16),'Offline video and music retain source sync');}finally{await context.setOffline(false);}
 }
 report.push({label,count,start,samples,rendered});console.log('PASS',label,'verifiedBlob,count-in,source-sync,seeks,pause,resume,LED,integratedbooth');
 }
 // Leaving the chapter releases the decoder and object URL.
 await page.evaluate(async()=>{bobbyGame.returnToTitle();await bobbyGame.loadSceneAssets('level1-stage1');});assert.equal(await page.evaluate(()=>bobbyGame.concertMusicVideo),null);
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>__concertCsp),[]);
 await context.close();
 }finally{await browser.close();}
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,cases:report},null,2)+'\n');console.log('PASS',report.length,'concert video cases; one muted asset, no streaming during gameplay');
