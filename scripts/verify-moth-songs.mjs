// Fight songs and weak connections (Chrome):
//  1. a fight's song downloads whole before the fight: its loading screen waits
//     for it, and the song plays from the downloaded copy, not a stream;
//  2. a failed full download blocks entry instead of falling back to a stream;
//  3. defensive recovery still freezes judgments if an already downloaded
//     media player temporarily cannot provide samples, then resumes in place.
// usage: node scripts/verify-moth-songs.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
const open = async () => {
  const context = await browser.newContext({viewport: {width: 393, height: 852}});
  await stubScoreboard(context);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(new URL('moth/staff/?device=phone', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  await page.keyboard.press('Shift');
  return {context, page, errors};
};
const song = page => page.evaluate(() => {
  const g = bobbyGame, t = g.getActiveLevel1OfficeRhythmAudio?.();
  return {state: g.state, loading: Boolean(g.levelLoadingPresentation), src: t?.getAttribute('src')?.slice(0, 5), playing: Boolean(t && !t.paused), time: t?.currentTime,
    stalled: g.isFightSongStalled(), judged: g.level1OfficeRhythm?.notes.filter(n => n.status !== 'pending').length};
});

// 1. Download first.
{
  const {context, page, errors} = await open();
  let released = 0;
  await page.route('**/fight-cuts/level4-arcade.m4a*', async route => { await new Promise(r => setTimeout(r, 4000)); released = Date.now(); await route.continue(); });
  const started = Date.now();
  await page.evaluate(() => bobbyGame.startStage('level4-stage1'));
  await page.waitForFunction(() => bobbyGame.levelLoadingPresentation, undefined, {timeout: 10000});
  const total = await page.evaluate(() => new Promise(resolve => { const t = setInterval(() => { const p = bobbyGame.sceneLoadProgress; if (p) { clearInterval(t); resolve(p.total); } }, 20); }));
  await page.waitForFunction(() => !bobbyGame.levelLoadingPresentation, undefined, {timeout: 60000});
  const loaded = Date.now();
  assert(released && loaded >= released, 'The loading screen waited for the song');
  await page.waitForFunction(() => { const t = bobbyGame.getActiveLevel1OfficeRhythmAudio(); return !t.paused && t.currentTime > 1; }, undefined, {timeout: 30000});
  const now = await song(page);
  assert.equal(now.src, 'blob:', 'The song plays from its downloaded copy');
  assert.deepEqual(errors, []);
  console.log('download first PASS', JSON.stringify({loadingSeconds: (loaded - started) / 1000, progressJobs: total, src: now.src}));
  await context.close();
}

// 2. A required full download fails: do not enter on an origin stream.
{
  const {context, page, errors} = await open();
  let attempts=0;
  await page.route('**/fight-cuts/level4-arcade.m4a*',route=>{attempts++;return route.fulfill({status:503,body:'unavailable'});});
  await page.evaluate(() => bobbyGame.startStage('level4-stage1'));
  await page.locator('.load-recovery').waitFor({state:'visible',timeout:60000});
  const blocked=await page.evaluate(()=>({state:bobbyGame.state,ready:bobbyGame.loadedSceneGroups.has('level4'),
    rhythm:Boolean(bobbyGame.level1OfficeRhythm),judged:bobbyGame.level1OfficeRhythm?.notes.filter(note=>note.status!=='pending').length||0,
    playing:bobbyGame.getKnownBgmTracks().some(track=>!track.paused)}));
  assert(attempts>=3,'A required song retries before showing recovery');
  assert.equal(blocked.state,'failure');assert(!blocked.ready&&!blocked.rhythm&&!blocked.playing);
  assert.equal(blocked.judged,0,'No note can be judged before required music is available');
  assert.deepEqual(errors,[]);
  console.log('failed download blocked PASS',JSON.stringify({attempts,...blocked}));
  await context.close();
}

// 3. A defensive media stall after successful full-copy entry. Hold an
// actual downloaded player at a real pending head; no network stream is used.
{
  const {context,page,errors}=await open();
  await page.evaluate(()=>bobbyGame.startStage('level4-stage1'));
  await page.waitForFunction(()=>{const g=bobbyGame,t=g.getActiveLevel1OfficeRhythmAudio();return g.state==='playing'
    &&!g.levelLoadingPresentation&&!g.level1OfficeRhythm?.graphicsLoading&&!(g.stageCountdown>0)
    &&t&&!t.paused&&t.currentTime>1;},undefined,{timeout:60000});
  const target=await page.evaluate(async()=>{
    const g=bobbyGame,r=g.level1OfficeRhythm,t=g.getActiveLevel1OfficeRhythmAudio();
    const note=r.notes.find(note=>note.status==='pending'&&!note.holdEnd&&note.time>g.getLevel1OfficeRenderTime()+1);
    if(!note)throw Error('A normal pending head is required for the stall check');
    const previousRate=t.playbackRate,descriptor=Object.getOwnPropertyDescriptor(t,'readyState');
    t.playbackRate=0;
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Stall setup seek timed out')),10000);
      t.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});
      t.currentTime=note.time+g.getRhythmAudioStart()+g.getAudioOffsetSeconds()+g.getRhythmOutputDelay();});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    Object.defineProperty(t,'readyState',{configurable:true,get:()=>2});
    window.__songStallProbe={track:t,note,previousRate,descriptor};
    return {id:note.id,button:note.button,time:note.time,renderTime:g.getLevel1OfficeRenderTime(),src:t.getAttribute('src')?.slice(0,5)};
  });
  assert.equal(target.src,'blob:','Defensive check uses the fully downloaded song');
  assert(Math.abs(target.renderTime-target.time)<.035,'The held input is actually inside its note timing window');
  await page.waitForFunction(()=>bobbyGame.isFightSongStalled()&&performance.now()-bobbyGame.level1OfficeRhythm.stalledSince>500,undefined,{timeout:10000});
  const stalled = await song(page);
  const frozen=await page.evaluate(()=>({clock:bobbyGame.songTime,statuses:bobbyGame.level1OfficeRhythm.notes.map(note=>note.status).join()}));
  const press = await page.evaluate(() => {
    const g = bobbyGame, r = g.level1OfficeRhythm,note=window.__songStallProbe.note;
    if (!g.isFightSongStalled()) return null;
    const before = r.notes.map(n => n.status).join();
    g.handleLevel1OfficeRhythmPress('Key' + note.button, performance.now());
    return {same: r.notes.map(n => n.status).join() === before, button: note.button,status:note.status};
  });
  assert(press?.same&&press.status==='pending', 'No note judged while the song waits ' + JSON.stringify(press));
  await page.waitForTimeout(600);
  const held = await song(page);
  const stillFrozen=await page.evaluate(()=>({clock:bobbyGame.songTime,statuses:bobbyGame.level1OfficeRhythm.notes.map(note=>note.status).join()}));
  assert(Math.abs(stillFrozen.clock-frozen.clock)<.03,'The audible game clock stays held');
  assert.equal(stillFrozen.statuses,frozen.statuses,'Neither hits nor automatic misses advance during the stall');
  const shot = await page.screenshot({clip: {x: 0, y: 0, width: 393, height: 420}});
  if (process.argv[3]) (await import('node:fs')).writeFileSync(process.argv[3], shot);
  const recoveredPress=await page.evaluate(()=>{
    const {track,note,previousRate,descriptor}=window.__songStallProbe;
    if(descriptor)Object.defineProperty(track,'readyState',descriptor);else delete track.readyState;
    // The same exact input now judges its head, proving the stalled check
    // did not merely press a harmless button between chart notes.
    bobbyGame.handleLevel1OfficeRhythmPress('Key'+note.button,performance.now());
    const status=note.status;track.playbackRate=previousRate;delete window.__songStallProbe;
    return {status,countdown:bobbyGame.stageCountdown};
  });
  assert.match(recoveredPress.status,/^(perfect|good)$/);assert(!(recoveredPress.countdown>0));
  await page.waitForFunction(at => !bobbyGame.isFightSongStalled() && bobbyGame.getActiveLevel1OfficeRhythmAudio().currentTime > at + 1, held.time, {timeout: 60000});
  const after = await song(page);
  assert(!(await page.evaluate(() => bobbyGame.stageCountdown > 0)), 'No count after a stall');
  assert.deepEqual(errors, []);
  console.log('stall PASS', JSON.stringify({stalledAt: +stalled.time.toFixed(2), resumedTo: +after.time.toFixed(2), restoredJudgment:recoveredPress.status}));
  await context.close();
}
await browser.close();
console.log('PASS songs: complete download before entry, failed downloads block play, defensive local-buffer stalls hold clock/judgments and resume');
