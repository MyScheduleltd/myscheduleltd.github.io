// Exercise the public Level Selection and real song-end results. Staff
// previews use the same build and a separate local storage namespace.
import assert from 'node:assert/strict';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use an isolated local build');
const hidden = ['secret-xiaosi', 'secret-getdown'];
const story = JSON.stringify({
  completedStages: ['finale-stage1'],
  unlockedStages: ['level1-stage1', 'finale-stage1'],
  storyCheckpoint: 'finale-stage1',
  storyRun: {id: 'saved-story', difficulty: 'chill', scores: {'level1-stage1': 2000}}
});
const progressKey = audience => `moth.${audience}_progress_v1`;
const clearKey = (audience, stage) => `${progressKey(audience)}.secret-clear.${stage}`;

async function open(browser, {audience = 'public', phone = false, storyComplete = true} = {}) {
  const context = await browser.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1280, height: 900},
    isMobile: phone, hasTouch: phone});
  await stubScoreboard(context);
  await context.addInitScript(({audience, key, savedStory}) => {
    if (savedStory && !localStorage.getItem(key)) localStorage.setItem(key, savedStory);
    localStorage.setItem(`moth.${audience}_language_v1`, 'en');
    window.__secretTestText = [];
    window.__secretTestFrames = [];
    window.__secretTestFrameNumber = 0;
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      const label = String(text);
      window.__secretTestText.push(label);
      if (window.__secretTestText.length > 2000) window.__secretTestText.splice(0, 1000);
      if (label === 'STAGE SELECT') {
        window.__secretTestFrameNumber++;
        window.__secretTestFrames.push([]);
        if (window.__secretTestFrames.length > 10) window.__secretTestFrames.shift();
      }
      window.__secretTestFrames.at(-1)?.push({label, y: args[1]});
      return fillText.call(this, text, ...args);
    };
    const played = new Set();
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      if (this instanceof HTMLAudioElement) played.add(this);
      return play.apply(this, args);
    };
    window.__secretTestActiveAudio = () => [...played].find(audio => audio.src.startsWith('blob:')
      && !audio.paused && !audio.ended && !audio.muted && audio.volume > .001 && audio.currentTime > .4 && audio.duration > 20);
  }, {audience, key: progressKey(audience), savedStory: storyComplete ? story : null});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(new URL(`moth/${audience === 'staff' ? 'staff/' : ''}?device=${phone ? 'phone' : 'desktop'}`, base).href,
    {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__secretTestText.includes('MAIN MENU'), undefined, {timeout: 90000});
  return {context, page, errors};
}

async function openSelection(page) {
  await page.evaluate(() => {window.__secretTestFrames = [];});
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__secretTestFrames.length > 0);
}

async function highlightHidden(page, index) {
  for (let move = 0; move < 12; move++) {
    const selection = await page.evaluate(index => {
      const title = index === 0 ? /笑死|\blol\b/i : /蹲得低|Get Down/i;
      const current = window.__secretTestFrames.at(-1)?.find(item => item.label.startsWith('>'));
      return {found: title.test(current?.label || ''), frame: window.__secretTestFrameNumber};
    }, index);
    if (selection.found) return;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(previous => window.__secretTestFrameNumber > previous, selection.frame);
  }
  throw new Error('Hidden level not present in Level Selection');
}

async function selectHidden(page, index, mode) {
  await openSelection(page);
  await highlightHidden(page, index);
  await page.keyboard.press('Enter');
  await page.keyboard.press(mode === 'hard' ? 'ArrowRight' : 'ArrowLeft');
  await page.keyboard.press('Enter');
}

async function finishPublicSong(page) {
  await page.waitForFunction(() => Boolean(window.__secretTestActiveAudio()), undefined, {timeout: 90000});
  await page.evaluate(() => {
    const audio = window.__secretTestActiveAudio();
    audio.currentTime = audio.duration - .25;
  });
}

async function returnFromResults(page) {
  await page.evaluate(() => {window.__secretTestText = [];});
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__secretTestText.includes('MAIN MENU'), undefined, {timeout: 12000});
}

async function closeDebugPanel(page) {
  await page.locator('[data-debug-action="close"]').click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForFunction(() => !bobbyGame.debugPanelOpen);
}

async function waitStaffFight(page, stage) {
  await page.waitForFunction(stage => {
    const g = bobbyGame, audio = g.getActiveLevel1OfficeRhythmAudio();
    return g.currentStageId === stage && g.state === 'playing' && !g.levelLoadingPresentation
      && !g.stageCountdown && audio && !audio.paused && audio.currentTime > .25;
  }, stage, {timeout: 90000});
}

async function finishStaffSong(page, stage) {
  await waitStaffFight(page, stage);
  await page.evaluate(() => {
    const audio = bobbyGame.getActiveLevel1OfficeRhythmAudio();
    audio.currentTime = audio.duration - .25;
  });
  await page.waitForFunction(() => bobbyGame.state === 'level1OfficeResults', undefined, {timeout: 12000});
  assert.equal(await page.evaluate(() => bobbyGame.level1OfficeRhythm.reviewResult), 'PASSED');
}

async function publicClears(browser, phone) {
  const {context, page, errors} = await open(browser, {phone});
  try {
    for (const [index, stage] of hidden.entries()) {
      const key = clearKey('public', stage);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
      await selectHidden(page, index, index ? 'hard' : 'easy');
      await finishPublicSong(page);
      await page.waitForFunction(key => localStorage.getItem(key) === '1', key, {timeout: 12000});
      await returnFromResults(page);
    }
    assert.equal(await page.evaluate(key => localStorage.getItem(key), progressKey('public')), story);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__secretTestText.includes('MAIN MENU'), undefined, {timeout: 90000});
    await openSelection(page);
    await highlightHidden(page, 1);
    await page.waitForFunction(() => window.__secretTestFrames.some(frame => [/笑死|\blol\b/i, /蹲得低|Get Down/i].every(title => {
      const row = frame.find(item => title.test(item.label));
      return row && frame.some(item => item.label === 'CLEAR' && Math.abs(item.y - row.y) < 12);
    })));
    assert.equal(await page.evaluate(() => typeof window.bobbyGame), 'undefined');
    assert.deepEqual(errors, []);
  } finally {await context.close();}
}

async function staffClears(browser) {
  const {context, page, errors} = await open(browser, {audience: 'staff'});
  const [first, second] = hidden;
  try {
    // The staff fight button can preview an unlocked secret without granting
    // the Level Selection clear, even in an already completed story save.
    await page.keyboard.press('KeyP');
    await page.locator(`[data-debug-fight="${second}"]`).click();
    await closeDebugPanel(page);
    await finishStaffSong(page, second);
    assert.equal(await page.evaluate(stage => bobbyGame.isStageCompleted(stage), second), false);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), clearKey('staff', second)), null);
    await returnFromResults(page);

    // A results preview during a legitimate entry must also wait for song
    // completion. Play Again keeps the legitimate entry's clear eligibility.
    await selectHidden(page, 0, 'easy');
    await waitStaffFight(page, first);
    await page.evaluate(() => bobbyGame.startLevel1OfficeResults());
    assert.equal(await page.evaluate(key => localStorage.getItem(key), clearKey('staff', first)), null);
    await page.keyboard.press('Enter');
    await finishStaffSong(page, first);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), clearKey('staff', first)), '1');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), clearKey('public', first)), null);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), progressKey('staff')), story);
    assert.deepEqual(errors, []);
  } finally {await context.close();}

  const preview = await open(browser, {audience: 'staff', storyComplete: false});
  try {
    assert.equal(await preview.page.evaluate(() => bobbyGame.areSecretLevelsUnlocked()), false);
    await preview.page.keyboard.press('KeyP');
    await preview.page.locator('[data-debug-action="unlockSecrets"]').click();
    await closeDebugPanel(preview.page);
    const saved = await preview.page.evaluate(key => localStorage.getItem(key), progressKey('staff'));
    await selectHidden(preview.page, 0, 'easy');
    await finishStaffSong(preview.page, first);
    assert.equal(await preview.page.evaluate(key => localStorage.getItem(key), clearKey('staff', first)), '1');
    assert.equal(await preview.page.evaluate(key => localStorage.getItem(key), progressKey('staff')), saved);
    assert.equal(await preview.page.evaluate(() => bobbyGame.isStageCompleted('finale-stage1')), false);
    const debugStatus = await preview.page.evaluate(() => bobbyGame.getDebugSnapshot().fields.secrets);
    assert.match(debugStatus, /lol · CLEAR/);
    assert.match(debugStatus, /Get Down.* · UNCLEARED/);
    assert.deepEqual(preview.errors, []);
  } finally {await preview.context.close();}
}

for (const [engine, type] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await type.launch(engine === 'chrome' ? {executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--no-sandbox']} : {headless: true});
  try {
    await publicClears(browser, engine === 'webkit');
    console.log(engine, 'PASS both public hidden clears, existing badges and reload persistence');
    if (engine === 'chrome') {
      await staffClears(browser);
      console.log(engine, 'PASS staff preview exclusion, story unlock rules and Play Again');
    }
  } finally {await browser.close();}
}
