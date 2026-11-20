import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
const base=process.argv[2]||'http://127.0.0.1:5297/',out=path.resolve(process.env.MOTH_DEBUG_STORY_OUTPUT||'.qa/moth/concert-ending-20261120/debug-story-arrangements');await fs.mkdir(out,{recursive:true});const cases=[];
const chapters=[
 ['level1-stage1','playing','office','level1OfficeRhythm','level1OfficeVictoryDialogue'],
 ['level2-stage2','level2PreBossDialogue','bathroom','level2BathroomRhythm','level2BossDialogue'],
 ['level3-stage1','level3','massage','level3MassageRhythm','level3'],
 ['level4-stage1','level4','arcade','level4ArcadeRhythm','level4PostBossDialogue'],
 ['studio-stage1','studioPreDialogue','studio','level5StudioRhythm','studioPostDialogue'],
 ['level5-stage1','level5Dialogue','river','level5RiverRhythm','level5PostDialogue'],
 ['level6-stage1','level6Dream','concert','level6ConcertRhythm','level6WakeUp']
];
const fights=['level1-stage1','level2-stage2','level3-stage2','level4-stage1','studio-stage1','level5-stage2','level6-stage2','secret-xiaosi','secret-getdown'];
async function checkChart(page,selection,key,mode){
 const evidence=await page.evaluate(({selection,key,mode})=>{
  const g=bobbyGame,r=g.level1OfficeRhythm,s=g.getActiveRhythmSpec(),expected=selection?g.config.stageSelectRhythms[key]:g.config[key];
  const rows=expected.chart[mode==='shoot'?'hard':'easy'],step=(expected.chart.stepBeats||.5)*60/expected.bpm,offset=expected.beatOffset||0;
  return {selection:g.stageSelectRhythmId,freePlay:g.freePlay,duration:s.duration,expectedDuration:expected.duration,
   count:r.notes.length,expectedCount:rows.length,allRows:r.notes.every((n,i)=>Math.abs(n.time-(offset+rows[i][0]*step))<1e-7&&n.key===rows[i][1]),
   sameAudio:s.audioSrc===expected.audioSrc&&s.easyAudioSrc===expected.easyAudioSrc,mode:g.difficultyId,blocked:g.progress?.storyRun?.legacy};
 },{selection,key,mode});
 assert.equal(evidence.selection,selection?key:null);assert.equal(evidence.freePlay,selection);assert.equal(evidence.mode,mode);
 assert.equal(evidence.duration,evidence.expectedDuration);assert.equal(evidence.count,evidence.expectedCount);assert(evidence.allRows&&evidence.sameAudio,'Runtime note times, keys and music source use the selected arrangement');
 if(!selection)assert(evidence.blocked,'Staff chapter jumps cannot submit an incomplete Story score');return evidence;
}
for(const phone of [false,true]){
 const browser=await(phone?webkit:chromium).launch(phone?{headless:true}:{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
 const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:1000},isMobile:phone,hasTouch:phone});await stubScoreboard(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(new URL('moth/staff/?device='+(phone?'phone':'desktop'),base).href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>bobbyGame?.bootDone,undefined,{timeout:90000});await page.locator('#moth-boot-loading').waitFor({state:'detached'});
 await page.evaluate(()=>bobbyGame.toggleDebugPanel(true));
 for(const action of ['storyEasy','storyHard','storyContinue'])assert.equal(await page.locator('[data-debug-action="'+action+'"]').count(),1);
 assert.equal(await page.locator('[data-debug-stage="finale-stage1"]').count(),1,'One ending preview control');
 assert.equal(await page.locator('[data-debug-fight]').count(),18,'Nine full songs with both difficulties');
 assert.equal(await page.locator('[data-debug-story]').count(),14,'Seven continuous Story chapters with both difficulties');
 await page.screenshot({path:path.join(out,(phone?'phone':'desktop')+'-panel.png')});
 for(const[action,mode]of [['storyEasy','chill'],['storyHard','shoot']]){
  await page.evaluate(()=>bobbyGame.toggleDebugPanel(true));await page.locator('[data-debug-action="'+action+'"]').click();
  await page.waitForFunction(mode=>{const g=bobbyGame;return !g.freePlay&&g.progress?.storyRun?.difficulty===mode&&g.state==='playing'&&g.level1OfficeRhythm?.tutorial?.mode==='intro'&&!g.levelLoadingPresentation;},mode,{timeout:90000});
  assert.equal(await page.evaluate(()=>bobbyGame.debugPanelOpen),false);assert.equal(await page.evaluate(()=>bobbyGame.endingScoreboardPreview),false);
  cases.push({phone,action,mode,passed:true});console.log('PASS',phone?'phone':'desktop',action,'full Story intro and staff save');
 }
 await page.evaluate(()=>{const g=bobbyGame;g.debugUnlockAllStages();g.progress.storyCheckpoint='level3-stage1';g.progress.storyRun.difficulty='shoot';g.toggleDebugPanel(true);});
 assert.equal(await page.evaluate(()=>bobbyGame.getContinueStageId()),'level3-stage1');
 await page.locator('[data-debug-action="storyContinue"]').click();
 await page.waitForFunction(()=>bobbyGame.state==='level3'&&!bobbyGame.levelLoadingPresentation,undefined,{timeout:90000});assert.equal(await page.evaluate(()=>bobbyGame.difficultyId),'shoot');assert.equal(await page.evaluate(()=>bobbyGame.freePlay),false);
 cases.push({phone,action:'storyContinue',passed:true});console.log('PASS',phone?'phone':'desktop','saved Story checkpoint with original difficulty');
 await page.evaluate(()=>bobbyGame.toggleDebugPanel(true));await page.locator('[data-debug-stage="finale-stage1"]').click();
 await page.waitForFunction(()=>bobbyGame.state==='level6WakeUp'&&!bobbyGame.levelLoadingPresentation,undefined,{timeout:90000});
 await page.evaluate(()=>{const g=bobbyGame;g.level6WakeTimer=6;g.level6WakeIndex=g.getDialogueLines('level6Wake').length-1;g.advanceLevel6WakeUp();});
 await page.waitForFunction(()=>bobbyGame.scoreboard?.result?.blocked==='preview');assert.equal(await page.locator('.moth-board-post input').count(),0);cases.push({phone,action:'ending-preview',passed:true});
 await page.evaluate(()=>bobbyGame.closeScoreboard());await page.waitForFunction(()=>bobbyGame.state==='finaleEnding');
 for(const[id,state,theme,key,postState]of chapters)for(const mode of ['chill','shoot']){
  await page.evaluate(()=>bobbyGame.toggleDebugPanel(true));await page.locator('[data-debug-story="'+id+'"][data-debug-mode="'+mode+'"]').click();
  await page.waitForFunction(({state,mode})=>{const g=bobbyGame;return !g.freePlay&&!g.stageSelectRhythmId&&g.difficultyId===mode&&g.state===state&&!g.levelLoadingPresentation;},{state,mode},{timeout:90000});
  assert.equal(await page.evaluate(()=>bobbyGame.debugPanelOpen),false);
  await page.evaluate(theme=>{const g=bobbyGame;
   if(theme==='office'){g.level1OfficeRhythm.tutorial.mode='complete';g.level1OfficeRhythm.tutorial.readyDialogueIndex=g.getDialogueLines('officeReady').length-1;g.advanceLevel1OfficeTutorial();}
   else if(theme==='bathroom'){g.level2PreBossDialogueIndex=g.getDialogueLines('level2PreBoss').length-1;g.advanceLevel2PreBossDialogue();}
   else if(theme==='massage'){g.startLevel3Dialogue('level3PreBoss');g.level3DialogueIndex=g.getDialogueLines('level3PreBoss').length-1;g.advanceLevel3Dialogue();}
   else if(theme==='arcade'){g.startLevel4Dialogue();g.level4DialogueIndex=g.getDialogueLines('level4PreBoss').length-1;g.advanceLevel4Dialogue();}
   else if(theme==='studio'){g.studioDialogueIndex=g.getDialogueLines('studioPre').length-1;g.advanceStudioDialogue();}
   else if(theme==='river'){g.level5GanGanDialogueIndex=g.getDialogueLines('level5GanGan').length-1;g.advanceLevel5GanGanDialogue();}
   else if(theme==='concert'){g.level6DreamIndex=g.getDialogueLines('level6Dream').length-1;g.advanceLevel6Dream();}
  },theme);
  await page.waitForFunction(theme=>bobbyGame.state==='playing'&&bobbyGame.level1OfficeRhythm?.theme===theme&&!bobbyGame.levelLoadingPresentation,theme,{timeout:90000});
  const evidence=await checkChart(page,false,key,mode);
  await page.evaluate(()=>{const g=bobbyGame;g.stageCountdown=0;g.stageCountdownAction=null;g.level1OfficeRhythm.ending=true;g.level1OfficeRhythm.reviewResult='PASSED';g.startLevel1OfficeResults();g.continueLevel1OfficeResults();});
  await page.waitForFunction(postState=>bobbyGame.state===postState&&!bobbyGame.levelLoadingPresentation,postState,{timeout:90000});assert.equal(await page.evaluate(()=>bobbyGame.freePlay),false);
  if(theme==='bathroom'&&mode==='chill'){
   await page.evaluate(()=>{const g=bobbyGame;g.level2DialogueIndex=g.getDialogueLines('level2PostBoss').length-1;g.advanceLevel2BossDialogue();});
   await page.waitForFunction(()=>bobbyGame.state==='level1UnlockPrompt');await page.evaluate(()=>{bobbyGame.level1UnlockChoice=0;return bobbyGame.activateLevel1UnlockChoice();});
   await page.waitForFunction(()=>bobbyGame.state==='level3'&&!bobbyGame.levelLoadingPresentation,undefined,{timeout:90000});
   await page.evaluate(()=>{const g=bobbyGame;g.startLevel3Dialogue('level3PreBoss');g.level3DialogueIndex=g.getDialogueLines('level3PreBoss').length-1;g.advanceLevel3Dialogue();});
   await page.waitForFunction(()=>bobbyGame.state==='playing'&&bobbyGame.level1OfficeRhythm?.theme==='massage'&&!bobbyGame.levelLoadingPresentation,undefined,{timeout:90000});await checkChart(page,false,'level3MassageRhythm',mode);
  }
  cases.push({phone,action:'story-chapter',id,mode,evidence,postState,passed:true});console.log('PASS',phone?'phone':'desktop','Story chapter',id,mode,'scene → Story chart → post-fight story');
 }
 await page.evaluate(()=>{bobbyGame.debugUnlockAllStages();bobbyGame.toggleDebugPanel(true);});await page.locator('[data-debug-action="unlockSecrets"]').click();
 for(const id of fights)for(const mode of ['chill','shoot']){
  await page.evaluate(()=>bobbyGame.toggleDebugPanel(true));await page.locator('[data-debug-fight="'+id+'"][data-debug-mode="'+mode+'"]').click();
  await page.waitForFunction(({id,mode})=>{const g=bobbyGame;return g.state==='playing'&&g.freePlay&&g.stageSelectRhythmId===id&&g.currentStageId===id&&g.difficultyId===mode&&!g.levelLoadingPresentation;},{id,mode},{timeout:90000});
  const evidence=await checkChart(page,true,id,mode);cases.push({phone,action:'full-song',id,mode,evidence,passed:true});console.log('PASS',phone?'phone':'desktop','full song',id,mode,'actual full-song chart/music');
 }
 assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,cases},null,2)+'\n');console.log('PASS',cases.length,'staff Story/debug cases; all score requests intercepted');
