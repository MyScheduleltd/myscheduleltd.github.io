// Tutorial copy and the rules it describes, on phone and desktop in both languages.
// usage: node scripts/verify-moth-tutorial.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { stubScoreboard } from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const out = path.resolve(process.argv[3] || '.qa/moth/tutorial');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
try {
  for (const [device, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, isMobile: device === 'phone', hasTouch: device === 'phone' });
    await stubScoreboard(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(new URL('moth/staff/?device=' + device, base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, { timeout: 60000 });
    await page.evaluate(() => { bobbyGame.level1TutorialSeen = false; bobbyGame.startLevel({ skipAudio: true }); });
    await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm?.tutorial?.mode === 'intro' && !bobbyGame.level1OfficeRhythm.graphicsLoading, undefined, { timeout: 90000 });
    const rules = await page.evaluate(() => {
      const g = bobbyGame, intro = g.getDialogueLines('officeTutorial'), ready = g.getDialogueLines('officeReady');
      return { intro, ready, healthless: g.isHealthlessRun() };
    });
    assert.equal(rules.healthless, true);
    assert.equal(rules.intro.length, 8, 'Short rule pages replace the old heart paragraph');
    for (const line of [...rules.intro, ...rules.ready]) {
      assert(line.en?.trim() && line.zh?.trim(), 'Each tutorial page is bilingual');
      assert(!/five hearts|lose one|at least one heart|五顆心|扣心|保住一顆心/i.test(line.en + line.zh), 'No retired heart rule');
    }
    assert.match(rules.intro[5].en, /wrong button/);
    assert.match(rules.intro[5].zh, /按錯鍵/);
    assert.equal(rules.intro[6].en, 'Your number of misses affects your final rating. Follow the drums and aim for a higher score!');
    assert.equal(rules.intro[6].zh, '失誤次數會影響最終評級。跟上鼓點，挑戰更高分！');
    assert.match(rules.intro[7].en, /two hidden songs/);
    for (const language of ['zh-TW', 'en']) {
      await page.evaluate(language => { bobbyGame.setLanguage(language, { persist: false, announce: false }); }, language);
      for (const index of [2, 5, 6, 7]) {
        await page.evaluate(index => {
          const g = bobbyGame;
          g.level1OfficeRhythm.tutorial.mode = 'intro';
          g.level1OfficeRhythm.tutorial.dialogueIndex = index;
          g.render(); g.renderTallScreen();
        }, index);
        assert.equal(await page.evaluate(() => document.body.dataset.language), language, 'Dialogue helpers use the selected UI language');
        await page.screenshot({ path: path.join(out, `${device}-${language}-rules-${index + 1}.png`), fullPage: true });
      }
      await page.evaluate(() => {
        const g = bobbyGame;
        g.level1OfficeRhythm.tutorial.mode = 'complete';
        g.level1OfficeRhythm.tutorial.readyDialogueIndex = 0;
        g.render(); g.renderTallScreen();
      });
      await page.screenshot({ path: path.join(out, `${device}-${language}-ready.png`), fullPage: true });
    }
    // Exercise the engine rather than just asserting text: a wrong button at a
    // note counts a miss; an off-window ghost tap does not. Neither costs health.
    const behavior = await page.evaluate(() => {
      const g = bobbyGame, r = g.level1OfficeRhythm;
      r.tutorial.mode = 'done'; r.skipAudio = true; r.audioStartPending = false;
      g.stageCountdown = 0; g.songTime = 10; r.combo = 2;
      r.notes = [{ id: 'rule-test', time: 10, button: 'T', key: 'T', action: 'do', status: 'pending' }];
      const before = { health: r.health, misses: r.misses, score: r.roundScore };
      g.handleLevel1OfficeRhythmPress('KeyO', performance.now());
      const wrong = { status: r.notes[0].status, combo: r.combo, misses: r.misses - before.misses, health: r.health - before.health, score: r.roundScore - before.score };
      g.songTime = 20;
      g.handleLevel1OfficeRhythmPress('KeyM', performance.now());
      const ghostMisses = r.misses - before.misses - 1;
      const held = { id: 'held-rule-test', time: 20, holdEnd: 21, button: 'T', action: 'do', status: 'perfect', holding: true };
      r.notes = [held]; r.holds = { T: held }; r.combo = 3;
      const holdBefore = { misses: r.misses, health: r.health, score: r.roundScore };
      g.handleLevel1OfficeRhythmRelease('KeyT', performance.now());
      return { wrong, ghostMisses, earlyHold: { broken: held.holdBroken, combo: r.combo, misses: r.misses - holdBefore.misses, health: r.health - holdBefore.health, score: r.roundScore - holdBefore.score } };
    });
    assert.deepEqual(behavior, { wrong: { status: 'miss', combo: 0, misses: 1, health: 0, score: 0 }, ghostMisses: 0, earlyHold: { broken: true, combo: 0, misses: 1, health: 0, score: 0 } });
    assert.deepEqual(errors, []);
    console.log('tutorial PASS', JSON.stringify({ device, languages: ['zh-TW', 'en'], pages: rules.intro.length, behavior }));
    await context.close();
  }
} finally { await browser.close(); }
console.log('PASS tutorial: bilingual healthless rules and matching miss behavior; screenshots at ' + out);
