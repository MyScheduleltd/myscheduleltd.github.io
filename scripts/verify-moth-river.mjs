// Verify Level 6's owner-selected verse 1 → chorus 2 audio, drums and ending.
import assert from 'node:assert/strict';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true,
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try {
  for (const difficulty of ['chill','shoot']) {
    const context = await browser.newContext({viewport:{width:1280,height:900}});
    await stubScoreboard(context);
    const page = await context.newPage(), errors=[];
    page.on('pageerror', error=>errors.push(String(error)));
    await page.goto(new URL('moth/staff/?device=desktop',base).href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.bobbyGame?.bootDone,undefined,{timeout:90000});
    await page.keyboard.press('Shift');
    await page.evaluate(async difficulty=>{
      const g=bobbyGame; g.setDifficulty(difficulty,{persist:false,announce:false});
      await g.startStage('level5-stage2',{freePlay:true});
    },difficulty);
    await page.waitForFunction(()=>{
      const g=bobbyGame,t=g.getActiveLevel1OfficeRhythmAudio();
      return g.state==='playing'&&!g.levelLoadingPresentation&&g.level1OfficeRhythm?.tutorial?.mode==='done'&&!t.paused&&t.currentTime>.1;
    },undefined,{timeout:90000});
    const start=await page.evaluate(()=>{
      const g=bobbyGame,r=g.level1OfficeRhythm,t=g.getActiveLevel1OfficeRhythmAudio(),spec=g.getActiveRhythmSpec();
      const first=r.notes[0];
      return {duration:g.getActiveRhythmDuration(),mediaDuration:t.duration,audioStart:g.getRhythmAudioStart(),
        configuredStart:spec.audioStartSeconds,configuredEnd:spec.fightCut.toSeconds,baked:g.hasBakedFades(),first:first.time,heads:r.notes.length,
        clock:g.getLevel1OfficeRenderTime(),mediaTime:t.currentTime,delay:g.getRhythmOutputDelay(),src:t.src.slice(0,5)};
    });
    assert(Math.abs(start.mediaDuration-154)<.06,'Requested master 00:10–02:44 audio section');
    assert(Math.abs(start.mediaDuration-start.duration-.35)<.06,'Ending fade stays within chorus 2');
    assert.equal(start.audioStart,0,'No double seek on the baked crop');
    assert.equal(start.configuredStart,10);
    assert.equal(start.configuredEnd,164);
    assert(start.baked&&start.src==='blob:','Verified downloaded short cut is used');
    assert(start.first>15&&start.first<16,'Original drumless verse opening has no invented notes');
    assert(Math.abs(start.clock-(start.mediaTime-start.delay))<.04,'Audible clock has one origin');
    // These targets were independently reviewed in the full recording, not
    // taken from whichever note happened to be selected in the old chart.
    const prominent = await page.evaluate(async () => {
      const g = bobbyGame, r = g.level1OfficeRhythm, track = g.getActiveLevel1OfficeRhythmAudio();
      const update = g.update; g.update = () => {};
      const results = [];
      try {
        for (const masterAt of [39.433, 59.961, 64.697, 125.093, 127.856, 135.749]) {
          const local = masterAt - g.getActiveRhythmSpec().audioStartSeconds;
          const note = r.notes.find(note => Math.abs(note.time - local) < .00001 && note.button === 'T');
          if (!note) throw Error('Missing prominent recorded kick at master ' + masterAt);
          note.status = 'pending'; r.holds = {};
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('Audio seek stalled')), 10000);
            track.addEventListener('seeked', () => {clearTimeout(timer); resolve();}, {once: true});
            track.currentTime = local + g.getRhythmAudioStart() + g.getAudioOffsetSeconds() + g.getRhythmOutputDelay();
          });
          if (track.paused) await track.play();
          const pressed = g.handleLevel1OfficeRhythmPress('KeyT', performance.now());
          results.push({masterAt, local, pressed, status: note.status, deltaMs: note.delta * 1000});
          g.handleLevel1OfficeRhythmRelease('KeyT', performance.now());
        }
      } finally {g.update = update;}
      return results;
    });
    assert(prominent.every(hit => hit.pressed && hit.status === 'perfect'), 'Reviewed shuffled kicks align with actual media/input in both modes: ' + JSON.stringify(prominent));
    // At the last phrase the normal engine finishes on the short chart rather
    // than waiting for the original four-minute song or leaving a frozen rail.
    await page.evaluate(()=>{
      const g=bobbyGame,r=g.level1OfficeRhythm,t=g.getActiveLevel1OfficeRhythmAudio();
      r.perfects=r.notes.length;r.goods=r.misses=0;
      for(const note of r.notes)note.status='perfect';
      t.currentTime=g.getActiveRhythmDuration()+.15;
    });
    await page.waitForFunction(()=>bobbyGame.level1OfficeRhythm?.ending,undefined,{timeout:10000});
    const end=await page.evaluate(()=>({ending:bobbyGame.level1OfficeRhythm.ending,result:bobbyGame.level1OfficeRhythm.reviewResult,
      time:bobbyGame.songTime,duration:bobbyGame.getActiveRhythmDuration()}));
    assert.equal(end.result,'PASSED');
    assert(end.time>=end.duration&&end.time<end.duration+1);
    assert.deepEqual(errors,[]);
    console.log('river PASS',JSON.stringify({difficulty,start,prominent,end}));
    await context.close();
  }
} finally {await browser.close();}
