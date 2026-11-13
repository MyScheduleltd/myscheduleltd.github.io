// Verify both real choices at every chapter handoff without playing seven full songs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { stubScoreboard } from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const screenshots = process.argv[3];
if (screenshots) await mkdir(screenshots, { recursive: true });
const chapters = [
  ['level1-stage1', 'playing', 'office', 'level1-stage1'],
  ['level2-stage2', 'level2PreBossDialogue', 'bathroom', 'level2-stage2'],
  ['level3-stage1', 'level3', 'massage', 'level3-stage2'],
  ['level4-stage1', 'level4', 'arcade', 'level4-stage1'],
  ['studio-stage1', 'studioPreDialogue', 'studio', 'studio-stage1'],
  ['level5-stage1', 'level5Dialogue', 'river', 'level5-stage2'],
  ['level6-stage1', 'level6Dream', 'concert', 'level6-stage2'],
  ['finale-stage1', 'level6WakeUp']
];
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox']
});

async function verifyRoute(phone) {
  const context = await browser.newContext({
    viewport: phone ? { width: 393, height: 852 } : { width: 1280, height: 900 },
    isMobile: phone, hasTouch: phone
  });
  await stubScoreboard(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const waitForOpening = ([stage, state]) => page.waitForFunction(([stage, state]) => {
    const game = window.bobbyGame;
    return game.currentStageId === stage && game.state === state
      && !game.levelLoadingPresentation && !game.level1OfficeRhythm?.graphicsLoading;
  }, [stage, state], { timeout: 60000 });
  try {
    await page.goto(new URL('moth/staff/?device=' + (phone ? 'phone' : 'desktop'), base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, { timeout: 60000 });
    await page.evaluate(phone => {
      bobbyGame.setLanguage(phone ? 'zh-TW' : 'en', { persist: false, announce: false });
      return bobbyGame.startStage('level1-stage1', { freePlay: false });
    }, phone);
    await waitForOpening(chapters[0]);

    for (let index = 0; index < chapters.length - 1; index++) {
      const [, , theme, fightStage] = chapters[index];
      const [nextStage] = chapters[index + 1];
      // Start at the song result and use the actual post-fight handoff, including
      // the living-room exit and the bedroom's chest and exit monologue.
      const postFight = await page.evaluate(({ theme, fightStage }) => {
        const g = bobbyGame;
        g.currentStageId = fightStage;
        g.level1OfficeRhythm = g.createLevel1OfficeRhythmState(theme);
        g.level1OfficeRhythm.tutorial.mode = 'done';
        g.state = 'playing';
        g.startLevel1OfficeResults();
        g.continueLevel1OfficeResults();
        switch (theme) {
          case 'office':
            g.level1VictoryDialogueIndex = g.getDialogueLines('officeVictory').length - 1;
            g.advanceLevel1OfficeVictoryDialogue();
            break;
          case 'bathroom':
            g.level2DialogueIndex = g.getDialogueLines('level2PostBoss').length - 1;
            g.advanceLevel2BossDialogue();
            break;
          case 'massage':
            g.startLevel3Dialogue('level3PostBoss');
            g.level3DialogueIndex = g.getDialogueLines('level3PostBoss').length - 1;
            g.advanceLevel3Dialogue();
            g.updateLevel3(20);
            if (!g.canExitLevel3ToLevel4()) throw new Error('Post-fight dialogue should open the room exit');
            g.startLevel3ExitRight();
            g.updateLevel3(20);
            break;
          case 'arcade':
            g.level4PostBossDialogueIndex = g.getDialogueLines('level4PostBoss').length - 1;
            g.advanceLevel4PostBossDialogue();
            g.level4Rail = 'lower';
            g.sewerPlayer.x = 450;
            if (!g.isLevel4NearMemeChest()) throw new Error('The basement chest should still be available before the card');
            g.tryLevel4Interact();
            g.memeChest.state = 'open';
            g.level4Rail = 'upper';
            g.sewerPlayer.x = g.getLevel4Stage1Config().exits.leftDoor.x;
            g.tryLevel4Interact();
            g.level4ExitIndex = g.getDialogueLines('level4Exit').length - 1;
            g.advanceLevel4ExitMonologue();
            break;
          case 'studio':
            g.studioDialogueIndex = g.getDialogueLines('studioPost').length - 1;
            g.advanceStudioDialogue();
            break;
          case 'river':
            g.level5PostIndex = g.getDialogueLines('level5Post').length - 1;
            g.advanceLevel5PostDialogue();
            break;
        }
        return {
          state: g.state, target: g.storyAdvance?.stageId, checkpoint: g.getContinueStageId(),
          cleared: g.isStageCompleted(fightStage), chest: Boolean(g.progress.flags.level4MemeChestOpened),
          finaleCompleted: g.isStageCompleted('finale-stage1')
        };
      }, { theme, fightStage });
      assert.equal(postFight.state, 'level1UnlockPrompt', theme);
      assert.equal(postFight.target, nextStage, theme);
      assert.equal(postFight.checkpoint, nextStage, theme);
      assert.equal(postFight.cleared, true, theme);
      if (theme === 'arcade') assert.equal(postFight.chest, true);
      assert.equal(postFight.finaleCompleted, false, 'The card itself cannot complete the finale');

      // Paint the full card and backdrop to catch legacy HUD draws behind it.
      const labels = await page.evaluate(() => {
        const g = bobbyGame;
        const drawn = [];
        const fillText = g.ctx.fillText;
        g.ctx.fillText = (text, x, y, ...rest) => {
          drawn.push({ text: String(text), y });
          return fillText.call(g.ctx, text, x, y, ...rest);
        };
        try { g.render(); g.renderTallScreen(); }
        finally { g.ctx.fillText = fillText; }
        return drawn;
      });
      const nextLabel = theme === 'concert' ? (phone ? '觀看片尾' : 'WATCH THE ENDING')
        : phone ? '立即遊玩 LEVEL ' + (index + 2) : 'PLAY LEVEL ' + (index + 2) + ' NOW';
      assert(labels.some(({ text }) => text.includes(nextLabel)), JSON.stringify(labels));
      assert(labels.some(({ text }) => text.includes(phone ? '儲存並回主畫面' : 'SAVE & GO HOME')));
      assert.deepEqual(labels.filter(({ text, y }) => /^(LIFE|[♥♡]+)$/.test(text)
        || (y < 130 && /^(DR\. BEAUTY|AREA|VENUE|BOSS|LEVEL \d|MP\b)/.test(text))), [], theme + ' confirmation backdrop has no legacy status header');

      if (screenshots && ['massage', 'arcade'].includes(theme)) {
        await page.screenshot({ path: path.join(screenshots, `${phone ? 'phone' : 'desktop'}-${theme}.png`) });
      }
      if (phone) {
        await page.waitForFunction(() => bobbyGame.getTallScreenMode() === 'card' && bobbyGame.portraitCanvas?.clientWidth > 0);
        const point = await page.evaluate(() => {
          const g = bobbyGame;
          const button = g.level1UnlockRects[1];
          const { src, dest, fit } = g.getTallCardLayout();
          const rect = g.portraitCanvas.getBoundingClientRect();
          return {
            x: rect.left + (dest.x + (button.x + button.w / 2 - src.x) * fit) * rect.width / g.portraitCanvas.width,
            y: rect.top + (dest.y + (button.y + button.h / 2 - src.y) * fit) * rect.height / g.portraitCanvas.height
          };
        });
        await page.touchscreen.tap(point.x, point.y);
        await page.waitForFunction(() => bobbyGame.state === 'title');
        if (theme === 'arcade') {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, { timeout: 60000 });
        }
        const checkpoint = await page.evaluate(() => bobbyGame.getContinueStageId());
        assert.equal(checkpoint, nextStage);
        await page.evaluate(() => bobbyGame.continueStory());
      } else {
        await page.keyboard.press('KeyO');
      }
      await waitForOpening(chapters[index + 1]);
      assert.equal(await page.evaluate(() => bobbyGame.storyAdvance), null);
      console.log('PASS ' + (phone ? 'phone save / continue ' : 'desktop next ') + theme + ' → ' + nextStage);
    }
    // Replays route through the existing rematch path without writing progress.
    const replay = await page.evaluate(() => {
      const g = bobbyGame;
      const before = JSON.stringify(g.progress);
      g.freePlay = true;
      g.level1OfficeRhythm = g.createLevel1OfficeRhythmState('concert');
      g.state = 'level1OfficeResults';
      let replayed = false;
      const original = g.replayFreePlayStage;
      g.replayFreePlayStage = () => { replayed = true; };
      try { g.continueLevel1OfficeResults(); }
      finally { g.replayFreePlayStage = original; }
      return { replayed, card: Boolean(g.storyAdvance), saved: JSON.stringify(g.progress) !== before };
    });
    assert.deepEqual(replay, { replayed: true, card: false, saved: false });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

try {
  await Promise.all([verifyRoute(false), verifyRoute(true)]);
} finally {
  await browser.close();
}
