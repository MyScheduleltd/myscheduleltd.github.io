import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { stubScoreboard } from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const out = '.qa/moth/walk-navigation';
await mkdir(out, {recursive: true});
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox']
});
try {
  for (const phone of [false, true]) {
    const device = phone ? 'phone' : 'desktop';
    const context = await browser.newContext({
      viewport: phone ? {width: 393, height: 852} : {width: 1280, height: 800},
      isMobile: phone, hasTouch: phone
    });
    await stubScoreboard(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(new URL('moth/staff/?device=' + device, base).href, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => bobbyGame.bootDone, undefined, {timeout: 90000});
    await page.evaluate(async () => { await bobbyGame.loadSceneAssets('level3-stage1'); });
    await page.evaluate(() => {
      const game = bobbyGame;
      game.enterLevel3Stage1({forcePreBoss: true, spawnX: 140});
      game.updateLevel3 = () => {};
      const prompt = window.drawObjectivePrompt;
      window.drawObjectivePrompt = (target, text, ...rest) => {
        window.__walkPrompt = text;
        return prompt(target, text, ...rest);
      };
    });
    await page.waitForFunction(() => bobbyGame.state === 'level3');
    for (const [language, movement] of [['zh-TW', 'WASD 移動美麗本人'], ['en', 'WASD to move Dr. Beauty']]) {
      const result = await page.evaluate(language => {
        const game = bobbyGame;
        game.setLanguage(language, {persist: false, announce: false});
        const boss = game.level3Boss;
        game.render();
        const before = {route: game.getWalkRouteArrow(), prompt: window.__walkPrompt};
        game.level3Boss = null;
        game.level3PostBossComplete = true;
        game.render();
        game.renderTallScreen();
        const after = {route: game.getWalkRouteArrow(), prompt: window.__walkPrompt};
        game.level3Boss = boss;
        game.level3PostBossComplete = false;
        return {before, after};
      }, language);
      assert.deepEqual(result.before.route, {x: 1026, y: 245, direction: 'down'});
      assert.deepEqual(result.after.route, {x: 1190, y: 365, direction: 'right'});
      for (const {prompt} of [result.before, result.after]) assert.equal(prompt.includes(movement), !phone);
    }
    await page.evaluate(() => {
      const game = bobbyGame;
      game.sewerPlayer.x = game.level3Boss.x - 96;
      game.tallFocusX = game.sewerPlayer.x;
      game.render();
      game.renderTallScreen();
    });
    await page.screenshot({path: out + '/' + device + '-zuxian.png'});
    await page.evaluate(async () => { await bobbyGame.loadSceneAssets('level4-stage1'); });
    await page.evaluate(() => {
      const game = bobbyGame;
      game.freePlay = false;
      game.enterLevel4Stage1({spawnX: 700});
      game.updateLevel4 = () => {};
    });
    await page.waitForFunction(() => bobbyGame.state === 'level4');
    const cases = [
      {rail: 'upper', won: false, open: false, x: 600, target: {x: 960, y: 312, direction: 'down'}},
      {rail: 'upper', won: true, open: false, x: 600, target: {x: 1082, y: 412, direction: 'down'}},
      {rail: 'lower', won: true, open: false, x: 650, target: {x: 450, y: 577, direction: 'down'}},
      {rail: 'lower', won: true, open: true, x: 650, target: {x: 1082, y: 558, direction: 'up'}},
      {rail: 'upper', won: true, open: true, x: 1000, target: {x: 86, y: 376, direction: 'left'}}
    ];
    for (const caseInfo of cases) {
      const result = await page.evaluate(({rail, won, open, x}) => {
        const game = bobbyGame;
        game.level4Rail = rail;
        game.progress.flags.level4BossDefeated = won;
        game.memeChest.state = open ? 'open' : 'closed';
        const floor = game.getLevel4ActiveSideView().floorY;
        Object.assign(game.sewerPlayer, {x, y: floor});
        game.tallFocusX = x;
        game.render();
        game.renderTallScreen();
        const context = game.isTallScreenView() ? game.portraitCtx : game.ctx;
        const route = game.getWalkRouteArrow();
        const walk = game.isTallScreenView() ? game.getTallWalkLayout() : null;
        const width = context.canvas.width;
        const projectedX = walk ? (route.x - walk.srcX) * width / walk.srcW : route.x;
        const drawX = Math.round(Math.max(32, Math.min(projectedX, width - 32)));
        const drawY = Math.round(walk ? (route.y - walk.srcY) * walk.worldH / walk.srcH : route.y);
        const pixel = Array.from(context.getImageData(drawX, drawY, 1, 1).data);
        return {route, pixel};
      }, caseInfo);
      assert.deepEqual(result.route, caseInfo.target);
      assert.deepEqual(result.pixel, [255, 211, 108, 255], device + ' accurately positions the map arrow');
      if (caseInfo.open && caseInfo.rail === 'upper') await page.screenshot({path: out + '/' + device + '-exit.png'});
    }
    assert.deepEqual(errors, []);
    console.log(device, 'PASS Level 3 bilingual controls and Level 4 contextual map arrows');
    await context.close();
  }
} finally {
  await browser.close();
}
