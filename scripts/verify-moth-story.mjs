// Story mode keeps its place, and the owner's 2026-10-18 fixes (Chrome):
//  1. a story is kept on the device: leaving a story fight from its pause menu
//     asks nothing, and the main menu's 繼續 in a later tab returns to that
//     moment after the 3-2-1, with the same hearts and combo; a practice run
//     still asks before throwing itself away;
//  2. a story kept in the session from before the change moves to the device;
//  3. after 祖賢's massage Dr. Beauty is back where it began, facing her;
//  4. every 10 in a row gives back one heart in a story fight, up to five, and
//     none in practice or in level 7;
//  5. a touch on the deck beside its buttons is not left to Safari (no iPhone
//     magnifier), and one on a button is;
//  6. level 4: Dr. Beauty is back where Bonita's game began; after the win
//     the basement chest opens with O, its picture saves (a download here)
//     and closes with H; the instruction bar sits at the top, clear of 暫停,
//     on a computer and on a phone.
// usage: node scripts/verify-moth-story.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const staff = new URL('moth/staff/', base).href;
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
const open = async (context, url = staff) => {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone && bobbyGame.state === 'title', undefined, {timeout: 60000});
  return {page, errors};
};
const fighting = (page, label = '') => page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm && !bobbyGame.level1OfficeRhythm.graphicsLoading
  && !(bobbyGame.stageCountdown > 0) && bobbyGame.level1OfficeRhythm.tutorial?.mode === 'done' && bobbyGame.songTime > 0, undefined, {timeout: 180000}).catch(async error => { throw new Error(label + ' ' + JSON.stringify(await page.evaluate(() => ({state: bobbyGame.state, stage: bobbyGame.currentStageId, rhythm: Boolean(bobbyGame.level1OfficeRhythm), mode: bobbyGame.level1OfficeRhythm?.tutorial?.mode, loading: bobbyGame.level1OfficeRhythm?.graphicsLoading, countdown: bobbyGame.stageCountdown, songTime: bobbyGame.songTime})))); });

// Story fights open with their scene's dialogue: O through it. On the live site a
// chapter can take a while to load, so presses wait for the loading screen to end
// (an O there would be lost) and the loading time is noted.
const loadingSeconds = [];
const throughDialogue = async page => {
  const deadline = Date.now() + 180000;
  let loadingSince = null;
  for (let presses = 0; presses < 80 && Date.now() < deadline;) {
    const state = await page.evaluate(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm ? 'fight' : bobbyGame.state);
    if (state === 'loading') loadingSince ??= Date.now();
    else if (loadingSince) { loadingSeconds.push(Math.round((Date.now() - loadingSince) / 100) / 10); loadingSince = null; }
    if (state === 'fight') return;
    if (state !== 'loading') { await page.keyboard.press('KeyO'); presses++; }
    await page.waitForTimeout(300);
  }
};

// 1. A story fight left for the main menu, picked up in a later tab.
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await stubScoreboard(context);
  const {page, errors} = await open(context);
  // A story run (as the main menu's 故事模式 starts one), in its level 2 fight.
  await page.evaluate(() => { bobbyGame.debugUnlockAllStages(); bobbyGame.startStoryRun('chill'); bobbyGame.startStage('level2-stage2', {freePlay: false}); });
  await throughDialogue(page);
  await fighting(page);
  await page.waitForTimeout(2500);
  const left = await page.evaluate(() => {
    const g = bobbyGame, rhythm = g.level1OfficeRhythm;
    rhythm.health = 3; rhythm.combo = 7;
    const songTime = g.songTime;
    g.pauseLevel1Office();
    g.level1OfficePauseChoice = 1;
    g.activateLevel1OfficePauseChoice();
    return {state: g.state, songTime, continueStage: g.getContinueStageId()};
  });
  assert.equal(left.state, 'title', 'A story fight goes to the main menu without asking');
  assert.ok(left.continueStage, '繼續 is on');
  // A later visit: a new tab, so a new session.
  const later = await open(context);
  const menu = await later.page.evaluate(() => ({continueStage: bobbyGame.getContinueStageId(), session: Object.keys(sessionStorage), disabled: bobbyGame.getHomeMenuItems().find(i => i.id === 'continue')?.disabled}));
  assert.equal(menu.continueStage, left.continueStage, '繼續 is there on a later visit');
  assert.ok(!menu.disabled);
  assert.deepEqual(menu.session, [], 'Nothing in the session');
  await later.page.evaluate(() => { bobbyGame.homeMenu.index = bobbyGame.getHomeMenuItems().findIndex(i => i.id === 'continue'); bobbyGame.activateHomeMenuSelection(); });
  await later.page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.stageCountdown > 0, undefined, {timeout: 90000});
  await later.page.waitForFunction(() => !(bobbyGame.stageCountdown > 0), undefined, {timeout: 15000});
  const back = await later.page.evaluate(() => ({stage: bobbyGame.currentStageId, songTime: bobbyGame.songTime, health: bobbyGame.level1OfficeRhythm.health, combo: bobbyGame.level1OfficeRhythm.combo}));
  assert.equal(back.stage, 'level2-stage2', 'The same fight');
  assert.equal(back.health, 3, 'Same hearts');
  assert.equal(back.combo, 7, 'Same combo');
  assert(Math.abs(back.songTime - left.songTime) < 1.5, `Same moment (${left.songTime} → ${back.songTime})`);
  // A practice run still asks before throwing itself away.
  await later.page.evaluate(() => { bobbyGame.returnToTitle(); bobbyGame.startStage('level2-stage2'); });
  await fighting(later.page);
  const practice = await later.page.evaluate(() => {
    const g = bobbyGame;
    g.pauseLevel1Office(); g.level1OfficePauseChoice = 1; g.activateLevel1OfficePauseChoice();
    return {state: g.state, confirming: g.level1OfficePauseConfirm};
  });
  assert.deepEqual(practice, {state: 'level1OfficePaused', confirming: true}, 'A practice run asks first');
  assert.deepEqual([...errors, ...later.errors], []);
  console.log('continue PASS', JSON.stringify({left, back}));
  await context.close();
}

// 2. A story kept in the session from before moves to the device.
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await stubScoreboard(context);
  await context.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    sessionStorage.setItem('moth.staff_progress_v1', JSON.stringify({completedStages: ['level1-stage1', 'level2-stage2'], unlockedStages: ['level1-stage1', 'level2-stage2', 'level3-stage1'], storyCheckpoint: 'level3-stage1'}));
  });
  const {page, errors} = await open(context);
  const moved = await page.evaluate(() => ({continueStage: bobbyGame.getContinueStageId(), local: Boolean(localStorage.getItem('moth.staff_progress_v1')), session: sessionStorage.getItem('moth.staff_progress_v1')}));
  assert.deepEqual(moved, {continueStage: 'level3-stage1', local: true, session: null}, 'The session story moved to the device');
  assert.deepEqual(errors, []);
  console.log('session story PASS', JSON.stringify(moved));
  await context.close();
}

// 3 and 4. Level 3's living room after the massage; hearts back every 10.
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await stubScoreboard(context);
  const {page, errors} = await open(context);
  await page.evaluate(() => { bobbyGame.debugUnlockAllStages(); bobbyGame.startStoryRun('chill'); bobbyGame.startStage('level3-stage1', {freePlay: false}); });
  await page.waitForFunction(() => bobbyGame.state === 'level3' && bobbyGame.sewerPlayer && bobbyGame.level3Boss, undefined, {timeout: 90000});
  const took = await page.evaluate(() => {
    const g = bobbyGame;
    g.sewerPlayer.x = g.level3Boss.x - 120;
    g.tryLevel3Interact();
    return {x: g.sewerPlayer.x, facing: g.sewerPlayer.facing, state: g.state, entrance: g.config.level3.stage1.sideView?.spawnX};
  });
  assert.equal(took.state, 'level3Dialogue');
  for (let i = 0; i < 40 && await page.evaluate(() => bobbyGame.state === 'level3Dialogue'); i++) await page.evaluate(() => bobbyGame.advanceLevel3Dialogue());
  await fighting(page);
  const hearts = await page.evaluate(() => {
    const g = bobbyGame, rhythm = g.level1OfficeRhythm, out = [];
    const milestone = (health, combo) => { rhythm.health = health; rhythm.combo = combo; rhythm.lastCelebratedCombo = 0; g.celebrateRhythmCombo(); return rhythm.health; };
    out.push(milestone(3, 10), milestone(4, 20), milestone(5, 30), milestone(2, 7));
    g.freePlay = true; out.push(milestone(2, 40)); g.freePlay = false;
    return {out, glow: rhythm.celebrationHeart?.index};
  });
  assert.deepEqual(hearts.out, [4, 5, 5, 2, 2], 'A heart back at every 10 in a row, up to five, none in practice');
  await page.evaluate(() => { const g = bobbyGame; g.level1OfficeRhythm.health = 5; g.startLevel1OfficeResults(); g.continueLevel1OfficeResults(); });
  await page.waitForFunction(() => bobbyGame.state === 'level3' && bobbyGame.sewerPlayer, undefined, {timeout: 30000});
  const back = await page.evaluate(() => ({x: bobbyGame.sewerPlayer.x, facing: bobbyGame.sewerPlayer.facing, phase: bobbyGame.level3Boss?.phase}));
  assert.deepEqual(back, {x: took.x, facing: took.facing, phase: 'postBoss'}, `Back where the massage began, not the entrance (${took.entrance})`);
  // Level 7 has no hearts to give back.
  await page.evaluate(() => { bobbyGame.returnToTitle(); bobbyGame.startStage('level6-stage2', {freePlay: false}); });
  await throughDialogue(page);
  await fighting(page);
  const concert = await page.evaluate(() => { const r = bobbyGame.level1OfficeRhythm; const before = r.health; r.combo = 10; r.lastCelebratedCombo = 0; bobbyGame.celebrateRhythmCombo(); return [before, r.health]; });
  assert.equal(concert[0], concert[1], 'Level 7 unchanged');
  assert.deepEqual(errors, []);
  console.log('level 3 return PASS', JSON.stringify({took, back}), 'hearts PASS', JSON.stringify(hearts));
  await context.close();
}

// 5. The deck beside its buttons.
{
  const context = await browser.newContext({viewport: {width: 393, height: 852}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  await stubScoreboard(context);
  const {page, errors} = await open(context, staff + '?device=phone');
  const touched = await page.evaluate(() => {
    const press = element => {
      const rect = element.getBoundingClientRect();
      const touch = new Touch({identifier: 1, target: element, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2});
      const event = new TouchEvent('touchstart', {bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch]});
      element.dispatchEvent(event);
      element.dispatchEvent(new TouchEvent('touchend', {bubbles: true, cancelable: true, changedTouches: [touch]}));
      return event.defaultPrevented;
    };
    const style = getComputedStyle(document.querySelector('.mobile-controls'));
    return {beside: press(document.querySelector('.mobile-controls__handheld-brand')), button: press(document.querySelector('.mobile-moth__button--m')),
      callout: style.webkitTouchCallout ?? style.getPropertyValue('-webkit-touch-callout'), select: style.userSelect || style.webkitUserSelect};
  });
  assert.equal(touched.beside, true, 'A touch beside the buttons is held back from Safari');
  assert.equal(touched.button, false, 'A touch on a button keeps its default (the haptic tick)');
  assert.equal(touched.select, 'none');
  assert.deepEqual(errors, []);
  console.log('deck long press PASS', JSON.stringify(touched));
  await context.close();
}
// 6. Level 4.
for (const phone of [false, true]) {
  const context = await browser.newContext({...(phone ? {viewport: {width: 393, height: 852}, deviceScaleFactor: 2, isMobile: true, hasTouch: true} : {viewport: {width: 1280, height: 800}}), acceptDownloads: true});
  await stubScoreboard(context);
  const {page, errors} = await open(context, staff + (phone ? '?device=phone' : ''));
  await page.evaluate(() => { bobbyGame.debugUnlockAllStages(); bobbyGame.startStoryRun('chill'); bobbyGame.startStage('level4-stage1', {freePlay: false}); });
  await page.waitForFunction(() => bobbyGame.state === 'level4' && bobbyGame.sewerPlayer, undefined, {timeout: 90000});
  // The bar's frame, read where it is drawn: the wide frame on a computer, the tall view on a phone.
  const bar = () => page.evaluate(phone => {
    const g = bobbyGame;
    g.render(); g.renderTallScreen();
    const read = (context, x, y) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
    const accent = ([r, gg, b]) => (Math.abs(r - 0x8f) < 30 && Math.abs(gg - 0xe8) < 30 && Math.abs(b - 0xff) < 30) || (Math.abs(r - 0xff) < 30 && Math.abs(gg - 0xd3) < 30 && Math.abs(b - 0x6c) < 40);
    if (phone) {
      // In its own row under 暫停, centred across the screen, its line centred in it. The
      // bar's sides are the columns of its frame colour at two heights; its line, the pale
      // text between them on the middle row.
      const pause = g.getLevel1OfficePauseButtonRect(), barTop = 8 + pause.h + 8;
      const sides = top => Array.from({length: 720}, (_, x) => x).filter(x => accent(read(g.portraitCtx, x, top + 12)) && accent(read(g.portraitCtx, x, top + pause.h - 12)));
      const frame = sides(barTop);
      const row = [...g.portraitCtx.getImageData(0, Math.round(barTop + pause.h / 2), 720, 1).data];
      const text = Array.from({length: 720}, (_, x) => x).filter(x => x > frame[0] + 4 && x < frame.at(-1) - 4 && row[x * 4] > 200 && row[x * 4 + 1] > 200 && row[x * 4 + 2] > 170);
      const barCentre = (frame[0] + frame.at(-1)) / 2;
      return {top: accent(read(g.portraitCtx, 360, barTop + 2)), bottom: accent(read(g.portraitCtx, 360, 776 - 22 - 50 + 2)),
        besidePause: sides(8).filter(x => x > 8 + pause.w + 4).length, barCentre, offCentre: Math.round((text[0] + text.at(-1)) / 2 - barCentre)};
    }
    return {top: accent(read(g.ctx, 640, 19)), bottom: accent(read(g.ctx, 640, 720 - 132 + 3))};
  }, phone);
  const upstairs = await bar();
  assert(upstairs.top && !upstairs.bottom, `${phone ? 'phone' : 'computer'}: the bar at the top ${JSON.stringify(upstairs)}`);
  if (phone) {
    assert.equal(upstairs.besidePause, 0, `phone: nothing of the bar in 暫停's row ${JSON.stringify(upstairs)}`);
    assert(Math.abs(upstairs.barCentre - 360) <= 2, `phone: the bar centred across the screen ${JSON.stringify(upstairs)}`);
    assert(Math.abs(upstairs.offCentre) <= 6, `phone: the line centred in its bar ${JSON.stringify(upstairs)}`);
    console.log('phone bar PASS', JSON.stringify(upstairs));
    assert.deepEqual(errors, []);
    await context.close();
    continue;
  }
  // Back where Bonita's game began, facing her: here on her right, as when he
  // comes up the ladder (the talk stood him on her left whatever happened).
  const took = await page.evaluate(() => { const g = bobbyGame; g.sewerPlayer.x = 1060; g.startLevel4Dialogue(); return {x: g.sewerPlayer.x, state: g.state}; });
  assert.equal(took.state, 'level4Dialogue');
  await throughDialogue(page);
  await fighting(page);
  await page.evaluate(() => { const g = bobbyGame; g.startLevel1OfficeResults(); g.continueLevel1OfficeResults(); });
  await page.waitForFunction(() => /^level4/.test(bobbyGame.state) && bobbyGame.sewerPlayer, undefined, {timeout: 30000});
  const back = await page.evaluate(() => ({state: bobbyGame.state, x: bobbyGame.sewerPlayer.x, facing: bobbyGame.sewerPlayer.facing, won: bobbyGame.progress.flags.level4BossDefeated}));
  assert.deepEqual(back, {state: 'level4PostBossDialogue', x: took.x, facing: -1, won: true}, 'Back where the game began');
  // The basement chest: O opens it, O saves the picture, H closes it. The
  // picture is read once, through the game's file loader, as the chest comes
  // into view; that copy is shown and saved.
  const pictureRequests = [];
  page.on('request', request => { if (request.url().includes('level4-meme.png')) pictureRequests.push(request.url()); });
  await page.evaluate(() => { const g = bobbyGame; g.state = 'level4'; g.sewerPlayer.x = 1082; g.tryLevel4LadderInteract(); g.sewerPlayer.x = 500; });
  const near = await page.evaluate(() => ({near: bobbyGame.isLevel4NearMemeChest(), interact: bobbyGame.isMobileInteractAvailable()}));
  assert.deepEqual(near, {near: true, interact: true}, 'The chest is in reach in the basement');
  await page.waitForFunction(() => bobbyGame.memePicture, undefined, {timeout: 10000});
  assert(await page.evaluate(async () => Boolean(await bobbyGame.memePicture)), 'The picture is read before the chest opens');
  await page.keyboard.press('KeyO');
  await page.waitForFunction(() => bobbyGame.memeView && document.querySelector('.moth-meme img')?.naturalWidth > 0, undefined, {timeout: 10000});
  assert(await page.evaluate(() => document.querySelector('.moth-meme img').src.startsWith('blob:')), 'The picture shown is the copy read ahead');
  const [download] = await Promise.all([page.waitForEvent('download', {timeout: 10000}), page.keyboard.press('KeyO')]);
  assert.equal(download.suggestedFilename(), 'dr-beauty-meme.png');
  const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(sha(await download.path()), sha(new URL('../moth-asset-additions/assets/memes/level4-meme.png', import.meta.url)), 'The saved picture is the published one');
  assert.equal(pictureRequests.length, 1, JSON.stringify(pictureRequests));
  await page.keyboard.press('KeyH');
  const after = await page.evaluate(() => ({open: Boolean(bobbyGame.memeView), chest: bobbyGame.memeChest.state, opened: bobbyGame.progress.flags.level4MemeChestOpened, kept: JSON.parse(localStorage.getItem('moth.staff_progress_v1')).flags.level4MemeChestOpened}));
  assert.deepEqual(after, {open: false, chest: 'open', opened: true, kept: true}, 'Closed, the chest stays open and remembered');
  assert.deepEqual(errors, []);
  console.log('level 4 PASS', JSON.stringify({upstairs, took, back, after}));
  await context.close();
}
// 7. The staff tools' previews (practice runs): the chest is in the basement after 'L4
// After Win Talk', 'L4 Basement Chest' goes straight to it, and opening it there
// leaves the save alone.
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await stubScoreboard(context);
  const {page, errors} = await open(context);
  const panel = async stage => {
    await page.keyboard.press('KeyP');
    await page.click(`[data-debug-stage="${stage}"]`);
    // Chrome leaves the clicked button focused; a later key would press it again.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('KeyP');
  };
  await panel('level4-postboss-dialogue');
  await page.waitForFunction(() => bobbyGame.state === 'level4PostBossDialogue', undefined, {timeout: 90000});
  for (let i = 0; i < 40 && await page.evaluate(() => bobbyGame.state === 'level4PostBossDialogue'); i++) await page.evaluate(() => bobbyGame.advanceLevel4PostBossDialogue());
  const afterTalk = await page.evaluate(() => { const g = bobbyGame; g.sewerPlayer.x = 1082; g.tryLevel4LadderInteract(); return {state: g.state, practice: g.freePlay, rail: g.level4Rail, chest: g.hasLevel4MemeChest()}; });
  assert.deepEqual(afterTalk, {state: 'level4', practice: true, rail: 'lower', chest: true}, 'The chest after L4 After Win Talk');
  await panel('level4-meme-chest');
  await page.waitForFunction(() => bobbyGame.state === 'level4' && bobbyGame.level4Rail === 'lower' && bobbyGame.memeChestSheet, undefined, {timeout: 90000});
  const straight = await page.evaluate(() => ({near: bobbyGame.isLevel4NearMemeChest(), chest: bobbyGame.memeChest.state}));
  assert.deepEqual(straight, {near: true, chest: 'closed'}, 'L4 Basement Chest: beside the closed chest');
  await page.keyboard.press('KeyO');
  await page.waitForFunction(() => bobbyGame.memeView && document.querySelector('.moth-meme img')?.naturalWidth > 0, undefined, {timeout: 10000});
  await page.keyboard.press('KeyH');
  const preview = await page.evaluate(() => ({open: Boolean(bobbyGame.memeView), chest: bobbyGame.memeChest.state, saved: Boolean(bobbyGame.progress?.flags?.level4MemeChestOpened)}));
  assert.deepEqual(preview, {open: false, chest: 'open', saved: false}, 'Opened in a preview, not saved');
  assert.deepEqual(errors, []);
  console.log('staff tools PASS', JSON.stringify({afterTalk, straight, preview}));
  await context.close();
}
// 8. The hidden levels end: their charts run to the very end of their songs,
// where the fight's clock (the playhead less the output delay) never arrives.
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await stubScoreboard(context);
  const {page, errors} = await open(context);
  const ends = {};
  for (const stage of ['secret-xiaosi', 'secret-getdown']) {
    await page.evaluate(stage => { const g = bobbyGame; g.returnToTitle(); if (!g.progress) g.progress = g.createDefaultProgress(); g.progress.flags.debugSecretLevelsUnlocked = true; g.startStage(stage); }, stage);
    await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm && !bobbyGame.level1OfficeRhythm.graphicsLoading && bobbyGame.songTime > 1, undefined, {timeout: 180000});
    const length = await page.evaluate(() => { const track = bobbyGame.getActiveLevel1OfficeRhythmAudio(); track.currentTime = track.duration - 3; return {track: track.duration, chart: bobbyGame.getActiveRhythmDuration()}; });
    await page.waitForFunction(() => bobbyGame.state === 'level1OfficeResults', undefined, {timeout: 20000})
      .catch(async () => { throw new Error(stage + ' never finished ' + JSON.stringify(await page.evaluate(() => ({state: bobbyGame.state, songTime: bobbyGame.songTime, ended: bobbyGame.getActiveLevel1OfficeRhythmAudio()?.ended})))); });
    ends[stage] = length;
  }
  assert.deepEqual(errors, []);
  console.log('hidden levels PASS', JSON.stringify(ends));
  await context.close();
}
await browser.close();
console.log('loading screens (s)', JSON.stringify(loadingSeconds));
console.log('PASS story: kept on the device, 繼續 mid-fight, level 3 and 4 returns, hearts every 10, deck long press, level 4 chest, bar at the top, staff chest previews, hidden levels end');
