// Fights pick up where they stopped (scripts/moth-fight-resume.mjs):
//  1. a phone lock mid-song comes back frozen at that moment, counts 3 · 2 · 1
//     in silence (no note judged), then plays on from there;
//  2. when iPhone refuses to play outside a tap, the resume card's tap counts
//     in again and plays on from the same place;
//  3. 暫停 → 繼續 counts in too;
//  4. a reload while locked: the main menu's 繼續 restores the same fight at
//     the same moment (score, combo, health, every note), then the story goes
//     on after it is won;
// and the deck's O button confirms STORY MODE's difficulty card.
// usage: node scripts/verify-moth-resume.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const near = (a, b, tolerance, label) => assert(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);

// iPhone rules, roughly: a hidden page can be told it is hidden; playback and
// a stuck engine's resume need a tap unless the element already played in one,
// and a lock takes that grant away.
function phoneRules() {
  let hidden = false;
  Object.defineProperty(document, 'hidden', {configurable: true, get: () => hidden});
  Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => hidden ? 'hidden' : 'visible'});
  let granted = new WeakSet(), tapping = false;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (tapping) granted.add(this);
    return !window.__strict || tapping || granted.has(this) ? play.call(this) : Promise.reject(new DOMException('needs a tap', 'NotAllowedError'));
  };
  const Context = window.AudioContext || window.webkitAudioContext;
  const resume = Context.prototype.resume;
  Context.prototype.resume = function () {
    return !window.__strict || tapping || this.state === 'running' ? resume.call(this) : new Promise(() => {});
  };
  for (const type of ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click']) {
    window.addEventListener(type, () => { tapping = true; setTimeout(() => { tapping = false; }, 0); }, {capture: true});
  }
  window.__lock = () => {
    hidden = true;
    if (window.__strict) granted = new WeakSet();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: false}));
  };
  window.__unlock = () => {
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}));
  };
  // Plays the chart: each note's button on its beat (holds are let go).
  window.__autoplay = on => {
    window.__playing = on;
    const step = () => {
      const g = window.bobbyGame, r = g?.level1OfficeRhythm;
      if (!window.__playing) return;
      if (r && g.state === 'playing' && !(g.stageCountdown > 0)) {
        const now = g.getLevel1OfficeRenderTime();
        const note = r.notes.find(n => n.status === 'pending' && Math.abs(n.time - now) < 0.035 && !n.pressedByBot);
        if (note) {
          note.pressedByBot = true;
          const code = 'Key' + note.button;
          window.dispatchEvent(new KeyboardEvent('keydown', {code, key: note.button.toLowerCase(), bubbles: true}));
          setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', {code, key: note.button.toLowerCase(), bubbles: true})), 40);
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
}

const fight = page => page.evaluate(() => {
  const g = bobbyGame, r = g.level1OfficeRhythm, track = g.getActiveLevel1OfficeRhythmAudio();
  return {state: g.state, theme: r?.theme, songTime: g.songTime, render: r ? g.getLevel1OfficeRenderTime() : null, countdown: g.stageCountdown,
    trackTime: track?.currentTime, paused: track?.paused, score: r?.roundScore, combo: r?.combo, maxCombo: r?.maxCombo, health: r?.health,
    judged: r?.notes.filter(n => n.status !== 'pending').length, statuses: r?.notes.map(n => n.status).join(''), card: g.audioRecoveryVisible()};
});

async function storyFight(page, stageId, start) {
  await page.evaluate(({stageId, start}) => {
    const g = bobbyGame;
    g.progress ||= g.createDefaultProgress();
    g.progress.storyCheckpoint = stageId;
    g.saveProgress();
    g.freePlay = false;
    g[start]();
  }, {stageId, start});
  await page.waitForFunction(() => {
    const g = bobbyGame, track = g.getActiveLevel1OfficeRhythmAudio?.();
    return g.state === 'playing' && g.level1OfficeRhythm?.tutorial?.mode === 'done' && !(g.stageCountdown > 0) && track && !track.paused && track.currentTime > 1;
  }, undefined, {timeout: 90000});
  await page.evaluate(() => window.__autoplay(true));
}

// Frozen under the count: nothing moves, a press judges nothing.
async function assertCountIn(page, frozen, label) {
  const now = await fight(page);
  assert.equal(now.state, 'playing', label + ': back in the fight');
  assert(now.countdown > 2, label + ': counting in ' + now.countdown);
  assert(now.paused, label + ': silent during the count');
  near(now.songTime, frozen.songTime, 0.05, label + ': same moment');
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(1200);
  const later = await fight(page);
  assert.equal(later.judged, now.judged, label + ': no note judged during the count');
  near(later.songTime, frozen.songTime, 0.05, label + ': still frozen');
}

async function assertPlaysOn(page, frozen, label) {
  await page.waitForFunction(() => !(bobbyGame.stageCountdown > 0) && !bobbyGame.getActiveLevel1OfficeRhythmAudio().paused, undefined, {timeout: 15000});
  await page.waitForTimeout(1500);
  const after = await fight(page);
  assert(after.trackTime > frozen.trackTime + 0.5 && after.trackTime < frozen.trackTime + 4, `${label}: plays on from ${frozen.trackTime.toFixed(2)} (now ${after.trackTime.toFixed(2)})`);
  assert(after.judged >= frozen.judged, label + ': no note un-judged');
  return after;
}

const browsers = {
  chrome: () => chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']}),
  webkit: () => webkit.launch({headless: true})
};
for (const [name, launch] of Object.entries(browsers)) {
  const browser = await launch();
  const context = await browser.newContext({viewport: {width: 393, height: 852}, hasTouch: true, isMobile: name === 'webkit'});
  await stubScoreboard(context);
  await context.addInitScript(phoneRules);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(new URL('moth/staff/?device=phone', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  await page.keyboard.press('Shift');

  // The deck's O confirms STORY MODE's difficulty card (and starts the story).
  await page.evaluate(() => { bobbyGame.homeMenu.index = 0; bobbyGame.activateHomeMenuSelection(); });
  assert(await page.evaluate(() => bobbyGame.homeMenu.difficultyPick?.story), 'Difficulty card open');
  await page.locator('[data-mobile-action="btn-o"]').tap();
  await page.waitForFunction(() => bobbyGame.progress?.storyRun && !bobbyGame.homeMenu?.difficultyPick && bobbyGame.state !== 'title', undefined, {timeout: 20000});
  console.log(name, 'O button PASS');
  await page.evaluate(() => bobbyGame.returnToTitle());

  // 1. Lock and unlock mid-song.
  await storyFight(page, 'level4-stage1', 'startLevel4ArcadeFight');
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__lock());
  const locked = await fight(page);
  assert(locked.paused && locked.judged > 0, 'Paused while locked');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__unlock());
  await page.waitForTimeout(100);
  await assertCountIn(page, locked, 'unlock');
  const played = await assertPlaysOn(page, locked, 'unlock');
  console.log(name, 'lock/unlock PASS', JSON.stringify({at: +locked.trackTime.toFixed(2), score: played.score}));

  // 2. iPhone refuses to play outside a tap: the card's tap counts in again.
  await page.evaluate(() => { window.__strict = true; });
  await page.evaluate(() => window.__lock());
  const strict = await fight(page);
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__unlock());
  await page.waitForFunction(() => bobbyGame.audioRecoveryVisible(), undefined, {timeout: 15000});
  near((await fight(page)).songTime, strict.songTime, 0.05, 'card: same moment');
  await page.locator('.audio-recovery button').tap();
  await page.waitForFunction(() => !bobbyGame.audioRecoveryVisible() && bobbyGame.stageCountdown > 2, undefined, {timeout: 15000});
  await assertCountIn(page, strict, 'card');
  await assertPlaysOn(page, strict, 'card');
  await page.evaluate(() => { window.__strict = false; });
  console.log(name, 'resume card PASS');

  // 3. 暫停 → 繼續.
  await page.evaluate(() => bobbyGame.pauseLevel1Office());
  const paused = await fight(page);
  assert.equal(paused.state, 'level1OfficePaused');
  await page.waitForTimeout(1000);
  await page.evaluate(() => bobbyGame.resumeLevel1Office());
  await assertCountIn(page, paused, 'pause');
  await assertPlaysOn(page, paused, 'pause');
  console.log(name, '暫停 → 繼續 PASS');

  // 4. A reload while locked; 繼續 on the main menu.
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__lock());
  const kept = await fight(page);
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone && bobbyGame.state === 'title', undefined, {timeout: 60000});
  await page.keyboard.press('Shift');
  await page.evaluate(() => { const g = bobbyGame; g.homeMenu.index = g.getHomeMenuItems().findIndex(item => item.id === 'continue'); });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.stageCountdown > 2, undefined, {timeout: 60000});
  const restored = await fight(page);
  assert.equal(restored.theme, kept.theme);
  for (const key of ['score', 'combo', 'maxCombo', 'health', 'judged', 'statuses']) assert.equal(restored[key], kept[key], 'Restored ' + key);
  near(restored.songTime, kept.songTime, 0.05, 'restored: same moment');
  await page.evaluate(() => window.__autoplay(true));
  await assertCountIn(page, kept, 'restored');
  await assertPlaysOn(page, kept, 'restored');
  assert.equal(await page.evaluate(() => localStorage.getItem('moth.staff_fight_resume_v1')), null, 'Used once');
  console.log(name, 'reload → 繼續 PASS', JSON.stringify({at: +kept.trackTime.toFixed(2), score: kept.score, judged: kept.judged}));
  assert.deepEqual(errors, []);
  await browser.close();
}

// After a restored fight is won, the story goes on (every story fight).
{
  const browser = await browsers.chrome();
  const context = await browser.newContext({viewport: {width: 393, height: 852}, hasTouch: true});
  await stubScoreboard(context);
  await context.addInitScript(phoneRules);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  // A drawing or update error inside the game loop is reported, not thrown.
  page.on('console', message => { if (message.type() === 'error' && /Frame step failed|TypeError|ReferenceError/.test(message.text())) errors.push(message.text()); });
  const fights = [['level1-stage1', 'startLevel', 'level1OfficeVictoryDialogue'], ['level2-stage2', 'startLevel2BathroomFight', 'level2BossDialogue'],
    ['level3-stage2', 'startLevel3MassageFight', 'level3'], ['level4-stage1', 'startLevel4ArcadeFight', 'level4PostBossDialogue'],
    ['studio-stage1', 'startStudioFight', 'studioPostDialogue'], ['level5-stage2', 'startLevel5RiverFight', null], ['level6-stage2', 'startLevel6ConcertFight', null]];
  for (const [stageId, start, next] of fights) {
    await page.goto(new URL('moth/staff/?device=phone', base).href, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
    await page.keyboard.press('Shift');
    await page.evaluate(stageId => { const g = bobbyGame; g.progress ||= g.createDefaultProgress(); g.progress.storyCheckpoint = stageId; g.saveProgress(); }, stageId);
    await page.evaluate(start => { bobbyGame.freePlay = false; bobbyGame[start]({ skipTutorial: true }); }, start);
    await page.waitForFunction(() => { const g = bobbyGame, t = g.getActiveLevel1OfficeRhythmAudio?.(); return g.state === 'playing' && g.level1OfficeRhythm?.tutorial?.mode === 'done' && !(g.stageCountdown > 0) && t && !t.paused && t.currentTime > 1; }, undefined, {timeout: 90000});
    await page.evaluate(() => window.__autoplay(true));
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__lock());
    const kept = await fight(page);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.bobbyGame?.bootDone && bobbyGame.state === 'title', undefined, {timeout: 60000});
    await page.keyboard.press('Shift');
    await page.evaluate(() => { const g = bobbyGame; g.homeMenu.index = g.getHomeMenuItems().findIndex(item => item.id === 'continue'); g.activateHomeMenuSelection(); });
    await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.stageCountdown > 0, undefined, {timeout: 60000});
    const restored = await fight(page);
    assert.equal(restored.theme, kept.theme, stageId);
    assert.equal(restored.score, kept.score, stageId + ' score');
    near(restored.songTime, kept.songTime, 0.05, stageId);
    // Win it: every note perfect, the song run to its end.
    await page.waitForFunction(() => !(bobbyGame.stageCountdown > 0) && !bobbyGame.getActiveLevel1OfficeRhythmAudio().paused, undefined, {timeout: 15000});
    await page.evaluate(() => {
      const g = bobbyGame, r = g.level1OfficeRhythm, t = g.getActiveLevel1OfficeRhythmAudio();
      for (const n of r.notes) { n.status = 'perfect'; if (n.holdEnd) n.holdDone = true; }
      r.health = r.maxHealth; r.perfects += r.notes.length; r.misses = 0; if ('hype' in r) r.hype = 1;
      t.currentTime = Math.max(0, t.duration - 1.5);
    });
    await page.waitForFunction(() => bobbyGame.state === 'level1OfficeResults', undefined, {timeout: 30000}).catch(() => {});
    const result = await page.evaluate(() => ({state: bobbyGame.state, review: bobbyGame.level1OfficeRhythm?.reviewResult}));
    if (result.state === 'level1OfficeResults') {
      await page.evaluate(() => bobbyGame.continueLevel1OfficeResults());
      await page.waitForTimeout(2500);
    }
    const after = await page.evaluate(() => bobbyGame.state);
    console.log(stageId, 'restored', JSON.stringify({at: +kept.trackTime.toFixed(1), score: kept.score, result: result.state, review: result.review, next: after}));
    assert.equal(result.state, 'level1OfficeResults', stageId + ': won after the restore');
    if (next) assert.equal(after, next, stageId + ': the story goes on');
    assert.deepEqual(errors, [], stageId);
  }
  await browser.close();
}
// Level 3's exit into level 4, Bonita's talk, the fight: one LOADING card (the
// release's own, with the download under it), and the talk goes straight onto
// the arena under its count-in.
{
  const browser = await browsers.chrome();
  const page = await browser.newPage({viewport: {width: 393, height: 852}});
  await stubScoreboard(page);
  await page.goto(new URL('moth/staff/?device=phone', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  await page.keyboard.press('Shift');
  await page.evaluate(() => { bobbyGame.freePlay = false; bobbyGame.enterLevel3Stage1(); });
  await page.waitForFunction(() => bobbyGame.state === 'level3', undefined, {timeout: 60000});
  await page.evaluate(() => {
    const g = bobbyGame; window.__screens = [];
    const shown = () => g.levelLoadingPresentation ? 'loading screen' : g.level1OfficeRhythm?.graphicsLoading && !g.level1OfficeRhythm.countdownDuringGraphicsPreparation ? 'fight loading screen'
      : g.state === 'sewerTransition' ? 'LOADING card' : g.state;
    const tick = () => { const now = shown(); if (now !== window.__screens.at(-1)) window.__screens.push(now); requestAnimationFrame(tick); };
    tick();
    g.startSewerTransition('level4');
  });
  await page.waitForFunction(() => bobbyGame.state === 'level4', undefined, {timeout: 60000});
  await page.evaluate(() => bobbyGame.startLevel4Dialogue());
  for (let i = 0; i < 60 && await page.evaluate(() => bobbyGame.state === 'level4Dialogue'); i++) { await page.evaluate(() => bobbyGame.advanceLevel4Dialogue()); await page.waitForTimeout(100); }
  await page.waitForFunction(() => !bobbyGame.getActiveLevel1OfficeRhythmAudio()?.paused && !(bobbyGame.stageCountdown > 0), undefined, {timeout: 60000});
  const screens = await page.evaluate(() => window.__screens);
  assert.deepEqual(screens, ['level3', 'LOADING card', 'level4', 'level4Dialogue', 'playing'], 'Level 4 entry screens');
  console.log('level 4 entry PASS', JSON.stringify(screens));
  await browser.close();
}
console.log('PASS resume: lock/unlock count-in, resume card, 暫停, reload → 繼續 for every story fight, deck O, level 4 entry');
