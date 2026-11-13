// Check revised copy and the staff preview path across cold chapter loads.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { GAME_CREDIT_LINES } from './moth-credits.mjs';
import { MOTH_OFFICE_TUTORIAL } from './moth-tutorial-patches.mjs';
import { stubScoreboard } from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const out = path.resolve(process.argv[3] || '.qa/moth/20261112-copy');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await stubScoreboard(context);
  const previousDraft = JSON.stringify({ version: 2, scenes: { officeReady: [{ speaker: 'GANGAN', text: 'Old staff draft' }] } });
  await context.addInitScript(draft => localStorage.setItem('moth.staff_debug_conversation_overrides_v1', draft), previousDraft);
  const draftWithoutDemos = MOTH_OFFICE_TUTORIAL.map(({ speaker, zh, en }) => ({ speaker, text: zh, en }));
  await context.addInitScript(draft => {
    localStorage.setItem('moth.staff_debug_conversation_overrides_v2', JSON.stringify({ version: 2, scenes: { officeTutorial: draft } }));
  }, draftWithoutDemos);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(new URL('moth/staff/', base).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, { timeout: 60000 });
  await page.locator('.debug-panel-toggle').click();
  await page.locator('.debug-conversation-editor > summary').click();

  const dialogueCounts = {
    officeTutorial: 8, officeReady: 3, officeVictory: 4, level2PreBoss: 9, level2PostBoss: 3,
    level3PreBoss: 3, level3PostBoss: 5, level4PreBoss: 4, level4PostBoss: 4, level4Exit: 3,
    studioPre: 3, studioPost: 4, level5GanGan: 9, level5Post: 6, level6Dream: 3, level6Wake: 2
  };
  const allLines = await page.evaluate(ids => Object.fromEntries(ids.map(id => [id, bobbyGame.getDialogueLines(id)])), Object.keys(dialogueCounts));
  for (const [id, lines] of Object.entries(allLines)) {
    assert.equal(lines.length, dialogueCounts[id], id);
    for (const line of lines) {
      assert(line.en?.trim() && (line.zh || line.text)?.trim(), id + ' bilingual copy');
      assert(!/下方補動態圖示|是否可加/.test(line.zh || line.text), id + ' excludes document editorial notes');
    }
  }
  assert.match(allLines.officeReady[1].en, /two hidden songs/);
  assert.equal(allLines.officeTutorial[2].rhythmDemo, 'tap');
  assert.equal(allLines.officeTutorial[3].rhythmDemo, 'hold');
  assert.equal(allLines.level2PreBoss[5].text, '又禿又油有又肥～');
  assert.match(allLines.level2PreBoss[6].en, /typed “and” twice/);

  const preview = async (id, index, language, copy) => {
    await page.locator('[data-debug-conversation="scene"]').selectOption(id);
    await page.locator('[data-debug-conversation="line"]').selectOption(String(index));
    assert.equal(await page.locator(`[data-debug-conversation="${language === 'en' ? 'english' : 'text'}"]`).inputValue(), copy);
    await page.locator(`[data-debug-conversation-action="preview${language === 'en' ? 'English' : 'Chinese'}"]`).click();
    await page.waitForFunction(({ id, index, language }) => {
      const g = bobbyGame, active = g.getActiveDebugDialogue();
      return !g.levelLoadingPresentation && active?.scene.id === id && active.index === index && g.language === language;
    }, { id, index, language }, { timeout: 60000 });
    assert(await page.evaluate(() => bobbyGame.freePlay), 'Preview does not enter story play');
  };
  await preview('officeReady', 2, 'zh-TW', '現在！開始協助美麗蓋章章，跟上鼓點，贏得更高的分數吧！');
  await preview('level3PostBoss', 2, 'en', 'And now, a word from our sponsor!');
  await preview('level4PostBoss', 2, 'en', 'What’s a Master Beauty?');
  await preview('level5Post', 5, 'zh-TW', '嗚嗚嗚...老闆...你尿得太近了....');
  await preview('level6Dream', 1, 'en', 'In his dream, Dr. Beauty and Gan Gan finally stepped onto a big stage of their own.');
  assert.equal(await page.evaluate(() => localStorage.getItem('moth.staff_debug_conversation_overrides_v1')), previousDraft);

  assert.equal(await page.locator('[data-debug-action="heal"]').count(), 0);
  const readProgress = () => page.evaluate(() => ({
    saved: localStorage.getItem('moth.staff_progress_v1'),
    active: JSON.stringify(bobbyGame.progress)
  }));
  const beforeCardPreviews = await readProgress();
  for (const [level, next, button] of [[3, 'level4-stage1', 'PLAY LEVEL 4 NOW'], [4, 'studio-stage1', 'PLAY LEVEL 5 NOW']]) {
    await page.locator(`[data-debug-stage="level${level}-confirmation"]`).click();
    await page.waitForFunction(next => bobbyGame.state === 'level1UnlockPrompt'
      && bobbyGame.storyAdvance?.stageId === next && !bobbyGame.levelLoadingPresentation, next);
    const card = await page.evaluate(() => {
      const g = bobbyGame;
      const original = g.ctx.fillText;
      const text = [];
      g.setLanguage('en', { persist: false, announce: false });
      g.ctx.fillText = (line, x, y, ...rest) => {
        text.push({ line: String(line), y });
        return original.call(g.ctx, line, x, y, ...rest);
      };
      try { g.render(); }
      finally { g.ctx.fillText = original; }
      return { text, preview: g.freePlay, scene: g.getDebugSnapshot().fields.boss };
    });
    assert(card.preview);
    assert.equal(card.scene, 'Confirmation · LEVEL ' + (level + 1));
    assert(card.text.some(({ line }) => line.includes(button)));
    assert(!card.text.some(({ line, y }) => /^(LIFE|[♥♡]+)$/.test(line)
      || (y < 130 && /^(DR\. BEAUTY|AREA|LEVEL \d|MP\b)/.test(line))));
    assert.deepEqual(await readProgress(), beforeCardPreviews);
    await page.locator('[data-debug-action="close"]').click();
    const point = await page.evaluate(choice => {
      const g = bobbyGame;
      const button = g.level1UnlockRects[choice];
      const canvas = g.ctx.canvas;
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (button.x + button.w / 2) * rect.width / canvas.width,
        y: rect.top + (button.y + button.h / 2) * rect.height / canvas.height
      };
    }, level === 3 ? 0 : 1);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(level => bobbyGame.state === (level === 3 ? 'level4' : 'title'), level, { timeout: 15000 }).catch(async error => {
      const state = await page.evaluate(() => ({ state: bobbyGame.state, stage: bobbyGame.currentStageId, error: bobbyGame.loadError }));
      throw new Error(`Level ${level} confirmation: ${JSON.stringify(state)}`, { cause: error });
    });
    assert.deepEqual(await readProgress(), beforeCardPreviews);
    if (level === 3) assert.doesNotMatch(await page.evaluate(() => bobbyGame.getDebugSnapshot().fields.player), /HP|health/i);
    await page.locator('.debug-panel-toggle').click();
  }

  await page.locator('[data-debug-stage="level6-streak-break"]').click();
  await page.waitForFunction(() => bobbyGame.getLevel1OfficeGanganJudgmentPrompt()?.slot === 'streakBreak');
  const coach = await page.evaluate(() => {
    const g = bobbyGame, result = {};
    for (const language of ['en', 'zh-TW']) {
      g.setLanguage(language, { persist: false, announce: false });
      result[language] = g.getLevel1OfficeGanganJudgmentPrompt().text;
    }
    return result;
  });
  assert.deepEqual(coach, { en: 'Shake off that miss. You’ll get your rhythm back.', 'zh-TW': '忘記剛剛的失誤，手感會回來的' });

  await page.locator('[data-debug-stage="finale-ending"]').click();
  await page.waitForFunction(() => bobbyGame.state === 'finaleEnding');
  const roll = await page.evaluate(() => bobbyGame.getFinaleCreditEntries().map(row => row.text));
  assert.deepEqual(roll, ['MASTER OF THE HOUSE', ...GAME_CREDIT_LINES]);
  await page.locator('[data-debug-action="close"]').click();
  await page.evaluate(() => {
    const g = bobbyGame;
    g.finaleEndingTimer = 10;
    g.updateFinaleEnding = () => {};
    g.render();
  });
  await page.screenshot({ path: path.join(out, 'desktop-ending-credits.png') });

  const phase = () => page.evaluate(() => bobbyGame.state === 'finaleEnding' ? bobbyGame.finaleEndingPhase : bobbyGame.state);
  const confirm = () => page.keyboard.press('KeyO');
  const skipRoll = () => page.evaluate(() => {
    const g = bobbyGame;
    const { x, y, w, h } = g.getFinaleEndingSkipRect();
    g.handleFinaleEndingPointer({ x: x + w / 2, y: y + h / 2 });
  });
  const notices = {
    en: ['All songs have been unlocked in the playlist.', 'Two hidden levels have been unlocked in Stage Select.', 'O / ENTER / TAP'],
    'zh-TW': ['所有歌曲已在播放清單解鎖。', '兩個隱藏關卡已在關卡選擇解鎖。', 'O / ENTER / 點一下']
  };
  const checkCard = async () => {
    assert.equal(await phase(), 'unlocks');
    for (const language of ['en', 'zh-TW']) {
      const painted = await page.evaluate(language => {
        const g = bobbyGame;
        g.setLanguage(language, { persist: false, announce: false });
        return [[1280, 720], [720, 1280]].map(([width, height]) => {
          const canvas = Object.assign(document.createElement('canvas'), { width, height });
          const ctx = canvas.getContext('2d');
          const lines = [];
          ctx.fillText = text => { lines.push(text); };
          g.renderFinaleEndingScene(ctx, width, height);
          return lines.join('').replace(/\s+/g, '');
        });
      }, language);
      const expected = notices[language].join('').replace(/\s+/g, '');
      for (const text of painted) assert.equal(text, expected, language + ' final card contains exactly the two notices and control hint');
    }
  };
  const openWakeCredits = async ({ story = false } = {}) => {
    await page.waitForFunction(() => bobbyGame.state === 'level6WakeUp');
    await page.evaluate(() => { bobbyGame.level6WakeTimer = 5.6; });
    await confirm();
    await confirm();
    if (story) {
      await page.waitForFunction(() => bobbyGame.scoreboard && performance.now() >= bobbyGame.scoreboard.quietUntil);
      await page.locator('[data-board-close]').click();
    }
    await page.waitForFunction(() => bobbyGame.state === 'finaleEnding' && bobbyGame.finaleEndingPhase === 'credits');
  };
  const unlockStatus = () => page.evaluate(() => ({
    completed: bobbyGame.isStageCompleted('finale-stage1'),
    hidden: bobbyGame.areSecretLevelsUnlocked(),
    playlist: bobbyGame.getHomePlaylistSongDefs().every(song => !song.locked),
    progress: localStorage.getItem('moth.staff_progress_v1')
  }));

  // Walk through the whole staff preview, including its final card.
  await page.evaluate(() => { delete bobbyGame.updateFinaleEnding; });
  const before = await unlockStatus();
  assert.equal(before.completed, false);
  await skipRoll();
  assert.equal(await phase(), 'thanks');
  await confirm();
  await checkCard();
  await confirm();
  assert.equal(await phase(), 'title');
  assert.deepEqual(await unlockStatus(), before);

  // Replay through the real Stage Select row before the story has been cleared.
  await page.evaluate(async () => {
    const g = bobbyGame;
    g.resetHomeMenu('stageSelect');
    g.homeMenu.index = g.getHomeMenuItems().findIndex(stage => stage.id === 'finale-stage1');
    await g.activateHomeMenuSelection();
    await g.activateHomeMenuSelection();
  });
  await openWakeCredits();
  await skipRoll();
  await confirm();
  await checkCard();
  await confirm();
  assert.equal(await phase(), 'title');
  assert.deepEqual(await unlockStatus(), before);

  // Simulate arrival at the last story checkpoint and let the song end.
  await page.evaluate(async () => {
    const g = bobbyGame;
    g.progress.unlockedStages.push('finale-stage1');
    await g.startStage('finale-stage1', { freePlay: false });
  });
  await openWakeCredits({ story: true });
  await page.waitForFunction(() => !bobbyGame.finaleMusicPending && Number.isFinite(bobbyGame.sewerAudio?.duration), undefined, { timeout: 60000 });
  await page.evaluate(() => { bobbyGame.sewerAudio.currentTime = bobbyGame.sewerAudio.duration; });
  await page.waitForFunction(() => bobbyGame.finaleEndingPhase === 'thanks');
  await confirm();
  await checkCard();
  const cleared = await unlockStatus();
  assert(cleared.completed && cleared.hidden && cleared.playlist);
  assert(JSON.parse(cleared.progress).completedStages.includes('finale-stage1'));
  await confirm();
  assert.equal(await phase(), 'title');

  const titles = await page.evaluate(() => {
    const g = bobbyGame;
    g.returnToTitle();
    g.resetHomeMenu('stageSelect');
    const result = {};
    for (const language of ['en', 'zh-TW']) {
      g.setLanguage(language, { persist: false, announce: false });
      result[language] = {
        ending: g.getHomeMenuItems().find(stage => stage.id === 'finale-stage1')?.title,
        soundtrack: g.getStageTitle('finale-stage1'),
        songLabel: g.getHomePlaylistSongDefs().find(song => song.id === 'home-finale-ending')?.levelLabel
      };
    }
    return result;
  });
  assert.deepEqual(titles, {
    en: { ending: 'Ending credits', soundtrack: 'Get Down ft. $hitGanGan', songLabel: 'BONUS' },
    'zh-TW': { ending: '片尾字幕', soundtrack: '蹲得低 ft. 謝乾', songLabel: 'BONUS' }
  });
  const lyrics = await page.evaluate(() => bobbyGame.getHomeLyricsSongDefs().flatMap(song => song.lyrics));
  for (const line of ['我賤價拍賣一百塊我立刻當你婆', 'Man我應該 卡認份鋪床舖携你玩', '在酒局上場前 先給我滴薑黃']) assert(lyrics.includes(line));
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS all 16 bilingual dialogue scenes, staff previews across chapters, Gan Gan, credits and unlock card for Story Mode, Level Selection and staff');
} finally {
  await browser.close();
}
