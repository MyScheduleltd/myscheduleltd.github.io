// Final concert result -> wake-up dialogue -> Story leaderboard -> credits.
// The browser uses the built game; every scoreboard request is intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {SCOREBOARD_API, SCOREBOARD_CHART_VERSION, STORY_FIGHTS} from './moth-scoreboard-client.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5297/';
const out = path.resolve(process.env.MOTH_ENDING_FLOW_OUTPUT || '.qa/moth/ending-flow-20261120/browser');
await fs.mkdir(out, {recursive: true});
const report = [];
for (const phone of [false, true]) {
  const engine = phone ? 'webkit' : 'chrome';
  const browser = await (phone ? webkit : chromium).launch(phone ? {headless: true} : {
    headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const context = await browser.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1280, height: 800}, isMobile: phone, hasTouch: phone});
  let scenario = 'qualifies', posts = 0, pendingPost = null;
  try {
    await context.route(SCOREBOARD_API + '*', async route => {
      const request = route.request();
      const headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json'};
      if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers});
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        if (body.action === 'start') return route.fulfill({status: 201, headers, body: JSON.stringify({run: 'test-ending-ticket', chartVersion: SCOREBOARD_CHART_VERSION})});
        posts++;
        if (scenario === 'failed-post') return route.fulfill({status: 503, headers, body: JSON.stringify({error: 'unavailable'})});
        if (scenario === 'delayed-post') await new Promise(resolve => { pendingPost = resolve; });
        return route.fulfill({status: 201, headers, body: JSON.stringify({id: body.id, chartVersion: SCOREBOARD_CHART_VERSION, ...(body.stage ? {stage:body.stage} : {}), rank: 1, entries: [{id: body.id, rank: 1, total: 7000, at: Date.now()}]})});
      }
      const params = new URL(request.url()).searchParams;
      const stage = params.get('stage');
      const entries = scenario === 'short' ? Array.from({length: stage ? 5 : 10}, (_, index) => ({id: 'TOP' + index, rank: index + 1, total: 100000 - index * 1000, at: Date.now()})) : [];
      return route.fulfill({status: 200, headers, body: JSON.stringify({chartVersion: SCOREBOARD_CHART_VERSION, mode: params.get('mode'), ...(stage ? {stage} : {}), entries})});
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('response',async response=>{if(response.url().startsWith(SCOREBOARD_API)&&response.request().method()==='POST')console.log('API POST RESPONSE',response.status(),await response.text());});
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => (window.__endingCsp ||= []).push(event.effectiveDirective)));
    await page.goto(new URL('moth/staff/?device=' + (phone ? 'phone' : 'desktop'), base).href, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 90000});
    await page.locator('#moth-boot-loading').waitFor({state: 'detached'});
    await page.keyboard.press('Shift');
    await page.evaluate(() => {
      const g = bobbyGame, start = g.startFinaleEnding;
      g.startFinaleEnding = function(...args) { this.__endingStarts = (this.__endingStarts || 0) + 1; return start.apply(this, args); };
    });
    const mount = async ({eligible = true, preview = false, stalePreview = false, language = 'zh-TW'} = {}) => {
      posts = 0;
      await page.evaluate(({eligible, preview, stalePreview, language, version, fights}) => {
        const g = bobbyGame;
        g.closeScoreboard({continueStory: false});
        g.returnToTitle();
        g.__endingStarts = 0;
        g.freePlay = preview;
        g.endingScoreboardPreview = preview || stalePreview;
        g.setLanguage(language, {persist: false, announce: false});
        g.progress.storyRun = {id: 'ending-fixture', ticket: eligible ? 'test-ending-ticket' : null,
          difficulty: 'chill', chartVersion: version, scores: Object.fromEntries(fights.map(stage => [stage, 1000]))};
        g.startLevel6WakeUp();
      }, {eligible, preview, stalePreview, language, version: SCOREBOARD_CHART_VERSION, fights: STORY_FIGHTS});
      await page.waitForFunction(() => bobbyGame.state === 'level6WakeUp' && !bobbyGame.levelLoadingPresentation, undefined, {timeout: 120000});
      await page.evaluate(() => {
        const g = bobbyGame, lines = g.getDialogueLines('level6Wake');
        g.level6WakeTimer = 6;
        g.level6WakeIndex = Math.max(0, lines.length - 2);
        if (lines.length > 1) g.advanceLevel6WakeUp();
      });
      assert.equal(await page.locator('.moth-board').count(), 0, 'Leaderboard waits for the last dialogue line');
      await page.evaluate(() => bobbyGame.advanceLevel6WakeUp());
      await page.waitForFunction(() => bobbyGame.scoreboard?.ending && bobbyGame.scoreboard.status.chill === 'ready');
      assert.equal(await page.evaluate(() => bobbyGame.__endingStarts), 0, 'Credits wait for the board');
      assert.equal(await page.evaluate(() => bobbyGame.state), 'level6WakeUp');
      await page.waitForFunction(() => performance.now() >= bobbyGame.scoreboard.quietUntil);
    };
    const credits = async label => {
      await page.waitForFunction(() => bobbyGame.state === 'finaleEnding' && !bobbyGame.scoreboard).catch(async error=>{console.log('ENDING TIMEOUT',label,JSON.stringify(await page.evaluate(()=>({state:bobbyGame.state,loadError:bobbyGame.loadError,loading:bobbyGame.levelLoadingPresentation,progress:bobbyGame.sceneLoadProgress,board:bobbyGame.scoreboard&&{posting:bobbyGame.scoreboard.posting,message:bobbyGame.scoreboard.message,result:bobbyGame.scoreboard.result},started:bobbyGame.__endingStarts}))));throw error;});
      assert.equal(await page.evaluate(() => bobbyGame.__endingStarts), 1, 'Credits start exactly once');
      assert.equal(await page.locator('.moth-board').count(), 0);
      report.push({engine, label, passed: true});
      console.log('PASS', engine, label);
    };

    // The final result's Continue action must not produce another chapter card.
    await page.evaluate(async () => {
      const g = bobbyGame;
      await g.loadSceneAssets('finale-stage1');
      g.freePlay = false;
      g.state = 'level1OfficeResults';
      g.level1OfficeRhythm = {theme: 'concert'};
      g.continueLevel1OfficeResults();
    });
    await page.waitForFunction(() => bobbyGame.state === 'level6WakeUp');
    assert.equal(await page.evaluate(() => Boolean(bobbyGame.storyAdvance)), false);
    report.push({engine, label: 'result-directly-to-cutscene', passed: true});

    scenario = 'qualifies';
    await mount({stalePreview: true});
    assert.equal(await page.evaluate(() => bobbyGame.scoreboard.result.blocked), null, 'A stale debug flag cannot turn a real run into preview');
    await page.screenshot({path: path.join(out, engine + '-qualified-story-board.png')});
    await page.locator('.moth-board-post input').fill('BEAUTY');
    await page.locator('.moth-board-post button').click();
    await page.waitForTimeout(500);
    console.log('POST STATE',posts,JSON.stringify(await page.evaluate(()=>({state:bobbyGame.state,board:bobbyGame.scoreboard&&{posting:bobbyGame.scoreboard.posting,message:bobbyGame.scoreboard.message,result:bobbyGame.scoreboard.result},starts:bobbyGame.__endingStarts}))));
    await credits('successful-post-automatically-starts-credits');
    assert.equal(posts, 1);

    scenario = 'short';
    await mount({language: 'en'});
    assert.equal(await page.locator('.moth-board-post input').count(), 0);
    assert.equal(await page.evaluate(() => bobbyGame.scoreboardStanding().kind), 'short');
    await page.locator('[data-board-close]').click();
    await credits('nonqualifying-close-starts-credits');
    assert.equal(posts, 0);

    scenario = 'failed-post';
    await mount();
    await page.locator('.moth-board-post input').fill('BEAUTY');
    await page.locator('.moth-board-post button').click();
    await page.waitForFunction(() => bobbyGame.scoreboard && !bobbyGame.scoreboard.posting && bobbyGame.scoreboard.message);
    assert.equal(await page.evaluate(() => bobbyGame.__endingStarts), 0, 'A failed POST must not advance');
    scenario = 'qualifies';
    await page.locator('.moth-board-post button').click();
    await credits('failed-post-remains-retryable');
    assert.equal(posts, 2);

    await mount({eligible: false});
    assert.equal(await page.evaluate(() => bobbyGame.scoreboardStanding().kind), 'ineligible');
    await page.keyboard.press('Escape');
    await credits('offline-close-starts-credits');
    assert.equal(posts, 0);

    await mount({preview: true});
    assert.equal(await page.evaluate(() => bobbyGame.scoreboard.result.blocked), 'preview');
    assert.equal(await page.locator('.moth-board-post input').count(), 0);
    assert.equal(await page.evaluate(() => bobbyGame.progress.storyRun.finishedAt), undefined, 'Debug preview does not finish the real saved run');
    await page.keyboard.press('KeyH');
    await credits('debug-preview-is-not-submittable');
    assert.equal(posts, 0);

    scenario = 'delayed-post';
    await mount();
    await page.locator('.moth-board-post input').fill('BEAUTY');
    await page.locator('.moth-board-post button').click();
    await page.waitForFunction(() => bobbyGame.scoreboard.posting);
    while (!pendingPost) await new Promise(resolve => setTimeout(resolve, 10));
    await page.locator('[data-board-close]').click();
    await credits('close-during-post-starts-credits-once');
    pendingPost(); pendingPost = null;
    await page.waitForFunction(() => Boolean(bobbyGame.progress.storyRun.posted));
    assert.equal(await page.evaluate(() => bobbyGame.__endingStarts), 1, 'A late POST cannot start the credits twice');

    // Existing home/stage boards do not inherit the ending continuation.
    scenario = 'qualifies';
    await page.evaluate(({version, fights}) => {
      const g = bobbyGame;
      g.returnToTitle();g.__endingStarts = 0;g.freePlay = false;
      g.progress.storyRun = {id: 'home-fixture', ticket: 'test-ending-ticket', difficulty: 'chill', chartVersion: version,
        finishedAt: Date.now(), scores: Object.fromEntries(fights.map(stage => [stage, 1000]))};
      g.openScoreboard();
    }, {version: SCOREBOARD_CHART_VERSION, fights: STORY_FIGHTS});
    await page.locator('.moth-board-post input').waitFor();
    await page.locator('.moth-board-post input').fill('BEAUTY');
    await page.locator('.moth-board-post button').click();
    await page.waitForFunction(() => bobbyGame.scoreboard?.result.run.posted);
    assert.equal(await page.evaluate(() => bobbyGame.state), 'title');
    assert.equal(await page.evaluate(() => bobbyGame.__endingStarts), 0);
    await page.locator('[data-board-close]').click();
    assert.equal(await page.evaluate(() => bobbyGame.state), 'title');
    report.push({engine, label: 'home-post-stays-on-board', passed: true});

    await page.evaluate(() => {
      const g = bobbyGame;
      g.state = 'level1OfficeResults';g.__endingStarts = 0;
      g.openScoreboard({stage: 'secret-xiaosi', stageResult: {mode: 'chill', total: 1000, complete: true, run: {ticket: 'test-stage-ticket', stage: 'secret-xiaosi', mode: 'chill'}}});
    });
    await page.waitForFunction(() => bobbyGame.scoreboard.status.chill === 'ready' && performance.now() >= bobbyGame.scoreboard.quietUntil);
    await page.locator('[data-board-close]').click();
    assert.equal(await page.evaluate(() => bobbyGame.state), 'level1OfficeResults');
    assert.equal(await page.evaluate(() => bobbyGame.__endingStarts), 0);
    report.push({engine, label: 'stage-close-keeps-result-menu', passed: true});
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__endingCsp || []), []);
  } finally {
    if (pendingPost) pendingPost();
    await context.close();await browser.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
console.log('PASS', report.length, 'ending-flow cases; scoreboard POSTs intercepted, no production writes');
