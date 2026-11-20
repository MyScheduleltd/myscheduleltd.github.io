// Exercise Level Selection clear badges with real full-song playback.
// The staff page shares the game code and uses its own storage namespace.
import assert from 'node:assert/strict';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use an isolated local build');
const hidden = ['secret-xiaosi', 'secret-getdown'];
const titles = [/笑死|\blol\b/i, /蹲得低|Get Down/i];
const story = JSON.stringify({
  completedStages: ['level1-stage1', 'finale-stage1'],
  unlockedStages: ['level1-stage1', 'finale-stage1'],
  storyCheckpoint: 'finale-stage1',
  storyRun: {id: 'saved-story', difficulty: 'chill', scores: {'level1-stage1': 2000}}
});
const progressKey = audience => `moth.${audience}_progress_v1`;
const clearKey = (audience, stage) => `${progressKey(audience)}.level-select-clear-v1.${stage}`;

async function open(browser, {audience = 'public', phone = false, storyComplete = true} = {}) {
  const context = await browser.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1280, height: 900},
    isMobile: phone, hasTouch: phone});
  await stubScoreboard(context);
  await context.addInitScript(({audience, key, savedStory, hidden}) => {
    if (savedStory && !localStorage.getItem(key)) {
      localStorage.setItem(key, savedStory);
      for (const stage of hidden) localStorage.setItem(key + '.secret-clear.' + stage, '1');
    }
    localStorage.setItem(`moth.${audience}_language_v1`, 'en');
    window.__secretTestText = [];
    window.__secretTestRootFrames = [];
    window.__secretTestFrames = [];
    window.__secretTestFrameNumber = 0;
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      const label = String(text);
      window.__secretTestText.push(label);
      if (window.__secretTestText.length > 2000) window.__secretTestText.splice(0, 1000);
      const header = args[1] === 72 || args[1] === 140;
      if (header && label === 'MAIN MENU') {
        window.__secretTestRootFrames.push([]);
        if (window.__secretTestRootFrames.length > 10) window.__secretTestRootFrames.shift();
      } else if (header && label === 'STAGE SELECT') {
        window.__secretTestFrameNumber++;
        window.__secretTestFrames.push([]);
        if (window.__secretTestFrames.length > 10) window.__secretTestFrames.shift();
      }
      window.__secretTestFrames.at(-1)?.push({label, y: args[1]});
      window.__secretTestRootFrames.at(-1)?.push(label);
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
  }, {audience, key: progressKey(audience), savedStory: storyComplete ? story : null, hidden});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(new URL(`moth/${audience === 'staff' ? 'staff/' : ''}?device=${phone ? 'phone' : 'desktop'}`, base).href,
    {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__secretTestRootFrames.length > 0, undefined, {timeout: 90000});
  return {context, page, errors};
}

async function openSelection(page) {
  await page.evaluate(() => {window.__secretTestFrames = [];});
  for (let move = 0; move < 12; move++) await page.keyboard.press('ArrowUp');
  for (let move = 0; move < 12; move++) {
    const selected = await page.evaluate(() => window.__secretTestRootFrames.at(-1)?.find(label => label.startsWith('>')));
    if (selected === '> STAGE SELECT') break;
    await page.keyboard.press('ArrowDown');
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  assert.equal(await page.evaluate(() => window.__secretTestRootFrames.at(-1)?.find(label => label.startsWith('>'))), '> STAGE SELECT');
  await page.keyboard.press('ArrowRight');
  try {
    await page.waitForFunction(() => window.__secretTestFrames.length > 0, undefined, {timeout: 5000});
  } catch (error) {
    const labels = await page.evaluate(() => [...new Set(window.__secretTestText.slice(-150))]);
    throw new Error(`Level Selection did not open. Canvas labels: ${labels.join(' | ')}`, {cause: error});
  }
}

async function highlightStage(page, title) {
  const visited = [];
  for (let move = 0; move < 12; move++) {
    const selection = await page.evaluate(([source, flags]) => {
      const title = new RegExp(source, flags);
      const current = window.__secretTestFrames.at(-1)?.find(item => item.label.startsWith('>'));
      return {label: current?.label, found: title.test(current?.label || ''), frame: window.__secretTestFrameNumber};
    }, [title.source, title.flags]);
    if (selection.found) return;
    visited.push(selection.label);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(previous => window.__secretTestFrameNumber > previous + 1, selection.frame);
  }
  throw new Error(`Level not present in Level Selection: ${title}. Visited: ${visited.join(' | ')}`);
}

async function selectStage(page, title, mode, {expectUncleared = false} = {}) {
  await openSelection(page);
  await highlightStage(page, title);
  if (expectUncleared) {
    assert.equal(await page.evaluate(() => {
      const frame = window.__secretTestFrames.at(-1) || [];
      const row = frame.find(item => item.label.startsWith('>'));
      return Boolean(row && frame.some(item => item.label === 'CLEAR' && Math.abs(item.y - row.y) < 12));
    }), false);
  }
  await page.keyboard.press('Enter');
  await page.keyboard.press(mode === 'hard' ? 'ArrowRight' : 'ArrowLeft');
  await page.keyboard.press('Enter');
}

async function finishPublicSong(page) {
  await page.waitForFunction(() => Boolean(window.__secretTestActiveAudio()), undefined, {timeout: 90000});
  // Accelerate playback without seeking over any part of the song.
  await page.evaluate(() => { window.__secretTestActiveAudio().playbackRate = 8; });
}

async function returnFromResults(page) {
  await page.waitForFunction(() => window.__secretTestText.includes('> PLAY AGAIN'));
  const board = page.locator('.moth-board');
  // Result boards initially ignore inputs to avoid dismissing them with the
  // last rhythm hit. Retry Back until the game accepts it.
  for (let tries = 0; tries < 3 && await board.count(); tries++) {
    await board.getByRole('button', {name: 'BACK', exact: true}).click();
    if (await board.count()) await page.waitForTimeout(400);
  }
  assert.equal(await board.count(), 0, 'The result board must close before returning to the menu');
  await page.evaluate(() => {window.__secretTestRootFrames = [];});
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__secretTestRootFrames.length > 0, undefined, {timeout: 12000});
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

async function finishStaffSong(page, stage, {seek = false} = {}) {
  await waitStaffFight(page, stage);
  await page.evaluate(seek => {
    const audio = bobbyGame.getActiveLevel1OfficeRhythmAudio();
    if (seek) audio.currentTime = audio.duration - .25;
    else audio.playbackRate = 8;
  }, seek);
  await page.waitForFunction(() => bobbyGame.state === 'level1OfficeResults', undefined, {timeout: 45000});
  assert.equal(await page.evaluate(() => bobbyGame.level1OfficeRhythm.reviewResult), 'PASSED');
}

async function publicClears(browser, phone) {
  const {context, page, errors} = await open(browser, {phone});
  try {
    const unfinished = clearKey('public', hidden[0]);
    await selectStage(page, titles[0], 'easy', {expectUncleared: true});
    await page.waitForFunction(() => Boolean(window.__secretTestActiveAudio()), undefined, {timeout: 90000});
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__secretTestRootFrames.length > 0, undefined, {timeout: 90000});
    assert.equal(await page.evaluate(key => localStorage.getItem(key), unfinished), null, 'Leaving the song early earns no clear');
    const choices = hidden.map((stage, index) => [stage, titles[index], index ? 'hard' : 'easy']);
    if (!phone) choices.push(['level1-stage1', /新。李包比自傳|My Name Is Dr\. Beauty/i, 'easy']);
    for (const [stage, title, mode] of choices) {
      const key = clearKey('public', stage);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
      await selectStage(page, title, mode, {expectUncleared: true});
      await finishPublicSong(page);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null, 'Starting playback earns no clear');
      await page.waitForFunction(key => localStorage.getItem(key) === '1', key, {timeout: 45000});
      console.log(phone ? 'portrait' : 'desktop', stage, 'PASS full-song finish');
      await returnFromResults(page);
    }
    assert.equal(await page.evaluate(key => localStorage.getItem(key), progressKey('public')), story);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__secretTestRootFrames.length > 0, undefined, {timeout: 90000});
    await openSelection(page);
    await highlightStage(page, titles[1]);
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
    await page.locator(`[data-debug-fight="${second}"][data-debug-mode="chill"]`).click();
    await closeDebugPanel(page);
    await finishStaffSong(page, second, {seek: true});
    assert.equal(await page.evaluate(stage => bobbyGame.isStageCompleted(stage), second), false);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), clearKey('staff', second)), null);
    await returnFromResults(page);

    // Seeking to the end and showing results early both leave the badge
    // unset. Play Again keeps the Level Selection origin.
    await selectStage(page, titles[0], 'easy', {expectUncleared: true});
    await finishStaffSong(page, first, {seek: true});
    assert.equal(await page.evaluate(key => localStorage.getItem(key), clearKey('staff', first)), null);
    await returnFromResults(page);
    await selectStage(page, titles[0], 'easy');
    await waitStaffFight(page, first);
    await page.evaluate(() => bobbyGame.startLevel1OfficeResults());
    assert.equal(await page.evaluate(key => localStorage.getItem(key), clearKey('staff', first)), null);

    // Even with the first playback observation delayed, Replay begins a new
    // proof at zero. Its proof survives a normal pause and media replacement.
    await page.evaluate(() => {
      const observe = bobbyGame.observeStageSelectionPlayback;
      let waiting = true;
      bobbyGame.observeStageSelectionPlayback = function (rhythm, track) {
        if (waiting && track && track.currentTime < .6) return;
        waiting = false;
        return observe.call(this, rhythm, track);
      };
    });
    await page.keyboard.press('Enter');
    await waitStaffFight(page, first);
    await page.waitForFunction(() => bobbyGame.level1OfficeRhythm?.stageSelectionPlayback?.through >= .65);
    await page.evaluate(() => {
      const game = bobbyGame, original = game.getActiveLevel1OfficeRhythmAudio();
      if (!game.pauseLevel1Office()) throw new Error('Failed to pause the Level Selection replay');
      game.rebuildMusicAudioContext();
      if (game.getActiveLevel1OfficeRhythmAudio() === original) throw new Error('The media element was not replaced');
    });
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
    await selectStage(preview.page, titles[0], 'easy');
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

await Promise.all([['chrome', chromium], ['webkit', webkit]].map(async ([engine, type]) => {
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
}));
