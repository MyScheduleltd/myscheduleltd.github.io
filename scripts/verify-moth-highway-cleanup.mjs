// Current night-drive/river flow and compatibility with old highway entries.
// Uses isolated browser profiles and a stub scoreboard; never writes live data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
import {RETIRED_HIGHWAY_LAYERS, cleanRetiredHighwayConfig} from './moth-retired-highway.mjs';
import {RETIRED_METHOD_GROUPS} from './moth-code-trim.mjs';

const root = path.resolve(import.meta.dirname, '..');
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const out = path.join(root, '.qa/moth/cleanup-20261106/highway');
await fs.mkdir(out, {recursive: true});
const config = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/data/level1.json'), 'utf8'));
assert.equal(config.level5.stage1.parallaxLayers.length, 1);
assert.equal(config.level5.stage2.parallaxLayers.length, 1);
assert.match(config.level5.stage1.parallaxLayers[0].source, /level5-road-/);
assert.match(config.level5.stage2.parallaxLayers[0].source, /previous-style-background-loop/);
assert.deepEqual(cleanRetiredHighwayConfig(structuredClone(config)), config, 'Cleanup is idempotent');
for (const file of RETIRED_HIGHWAY_LAYERS) await assert.rejects(fs.access(path.join(root, 'docs/moth', file)));
for (const file of ['src/game.js', 'staff/game.js']) {
  const source = await fs.readFile(path.join(root, 'docs/moth', file), 'utf8');
  for (const method of RETIRED_METHOD_GROUPS['Level 5: retired highway exploration and goat chase']) {
    assert(!source.includes(`  ${method}(`), file + ': unreachable helper removed: ' + method);
  }
  assert(!/this\.state\s*=\s*"(?:level5|level5Boss|level5BossVictory|level5BossFailure)"/.test(source), file + ': no old-state entry');
}

const oldStates = ['level5', 'level5Boss', 'level5BossVictory', 'level5BossFailure'];
const report = [];
const launch = {
  chrome: () => chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']}),
  webkit: () => webkit.launch({headless: true})
};
async function open(browser, phone, query = '') {
  const context = await browser.newContext({viewport: phone ? {width: 393, height: 852} : {width: 1280, height: 900},
    isMobile: phone, hasTouch: phone});
  await stubScoreboard(context);
  const page = await context.newPage(), errors = [], retired = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => {
    const url = decodeURIComponent(request.url()).split('?')[0];
    if (RETIRED_HIGHWAY_LAYERS.some(file => url.endsWith('/' + file))) retired.push(url);
  });
  await page.goto(new URL(`moth/staff/?device=${phone ? 'phone' : 'desktop'}${query}`, base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 90000});
  await page.evaluate(() => {
    const game = bobbyGame;
    window.__highwayStates = [game.state];
    let state = game.state;
    Object.defineProperty(game, 'state', {configurable: true, get: () => state, set: value => {
      if (value !== state) window.__highwayStates.push(value);
      state = value;
    }});
    // This fixture resumes after the studio fight. startStoryRun() would
    // launch an unrelated asynchronous office entry and race the route under
    // test, so create its stored run/progress directly instead.
    window.__highwayStoryFixture = () => {
      game.setDifficulty('chill', {persist: false, announce: false});
      game.freePlay = false;
      game.progress = game.createDefaultProgress();
      game.progress.storyRun = {id: 'local-highway-check', difficulty: 'chill', chartVersion: game.config.rhythmChartVersion,
        scores: {}, startedAt: Date.now(), ticket: null};
    };
  });
  await page.keyboard.press('Shift');
  return {context, page, errors, retired};
}
async function river(page) {
  await page.waitForFunction(() => {
    const game = bobbyGame, rhythm = game.level1OfficeRhythm, audio = game.getActiveLevel1OfficeRhythmAudio();
    return game.state === 'playing' && game.currentStageId === 'level5-stage2' && rhythm?.theme === 'river'
      && !game.levelLoadingPresentation && !rhythm.graphicsLoading && rhythm.tutorial?.mode === 'done'
      && !game.stageCountdown && audio && !audio.paused && audio.currentTime > .1;
  }, undefined, {timeout: 120000}).catch(async error => {
    const snapshot = await page.evaluate(() => {const g=bobbyGame,r=g.level1OfficeRhythm,a=g.getActiveLevel1OfficeRhythmAudio();return {
      state:g.state,stage:g.currentStageId,theme:r?.theme,freePlay:g.freePlay,loading:g.levelLoadingPresentation,
      progress:g.sceneLoadProgress,graphics:r?.graphicsLoading,tutorial:r?.tutorial?.mode,countdown:g.stageCountdown,
      pending:r?.audioStartPending,media:a&&{paused:a.paused,at:a.currentTime,ready:a.readyState,src:a.src.slice(0,100)},
      recovery:g.audioRecoveryVisible(),trace:window.__highwayStates,loadError:g.loadError};});
    throw new Error(error.message+' '+JSON.stringify(snapshot));
  });
  const result = await page.evaluate(() => {
    const game = bobbyGame, audio = game.getActiveLevel1OfficeRhythmAudio();
    return {state: game.state, stage: game.currentStageId, theme: game.level1OfficeRhythm.theme,
      duration: audio.duration, freePlay: game.freePlay, trace: [...window.__highwayStates]};
  });
  assert(Math.abs(result.duration - 154) < .06, 'Current verse-to-chorus recording');
  assert(!result.trace.some(state => oldStates.includes(state)), 'No retired exploration/chase state');
  return result;
}

const selectedEngine = process.argv.find(arg=>arg.startsWith('--engine='))?.slice(9);
const selectedDevice = process.argv.find(arg=>arg.startsWith('--device='))?.slice(9);
const legacyOnly = process.argv.includes('--legacy-only');
for (const engine of selectedEngine ? [selectedEngine] : ['chrome', 'webkit']) {
  const browser = await launch[engine]();
  try {
    for (const phone of selectedDevice ? [selectedDevice === 'phone'] : [false, true]) {
      const label = `${engine}-${phone ? 'phone' : 'desktop'}`;
      if (!legacyOnly) {
      const {context, page, errors, retired} = await open(browser, phone);
      try {
        await page.evaluate(() => {
          const game = bobbyGame;
          window.__highwayStoryFixture();
          game.startLevelLoading('studio-stage1', () => game.enterStudioDialogue(true));
        });
        await page.waitForFunction(() => bobbyGame.state === 'studioPostDialogue' && !bobbyGame.levelLoadingPresentation,
          undefined, {timeout: 90000});
        // Follow the real post-studio dialogue handler into the night drive.
        await page.evaluate(() => { for (let i = 0; i < 30 && bobbyGame.state === 'studioPostDialogue'; i++) bobbyGame.advanceStudioDialogue(); });
        await page.waitForFunction(() => bobbyGame.state === 'level5Dialogue' && bobbyGame.level5Drive
          && !bobbyGame.levelLoadingPresentation, undefined, {timeout: 90000});
        const drive = await page.evaluate(() => ({stage: bobbyGame.currentStageId,
          road: bobbyGame.refs.level5ParallaxLayers?.map(image => image?.naturalWidth || image?.width),
          skyline: bobbyGame.refs.level5BossParallaxLayers?.map(image => image?.naturalWidth || image?.width),
          car: Boolean(bobbyGame.refs.level5DriveCarSheet), freePlay: bobbyGame.freePlay}));
        assert.deepEqual(drive.road, [2560]); assert.deepEqual(drive.skyline, [5120]);
        assert(drive.car && !drive.freePlay, 'Current night-drive art and story mode preserved');
        await page.screenshot({path: path.join(out, `${label}-drive.png`)});
        await page.evaluate(() => { for (let i = 0; i < 30 && bobbyGame.state === 'level5Dialogue'; i++) bobbyGame.advanceLevel5GanGanDialogue(); });
        const normal = await river(page); assert(!normal.freePlay);
        console.log(label, 'normal river PASS');
        await page.screenshot({path: path.join(out, `${label}-river.png`)});
        // Old direct boss entry remains a preview of the current river fight.
        const progressBefore = await page.evaluate(() => {
          bobbyGame.returnToTitle();
          window.__highwayStoryFixture();
          const progress = JSON.stringify(bobbyGame.progress);
          bobbyGame.enterLevel5BossFight({fromDebug: true});
          return progress;
        });
        const alias = await river(page); assert(alias.freePlay);
        assert.equal(await page.evaluate(() => JSON.stringify(bobbyGame.progress)), progressBefore, 'Debug alias does not change story progress');
        // A legacy caller without the former drive marker cannot reopen the
        // retired walk. The normal dialogue completion still enters the river.
        await page.evaluate(() => {
          bobbyGame.returnToTitle(); window.__highwayStoryFixture();
          bobbyGame.level5Drive = null; bobbyGame.finishLevel5GanGanDialogue();
        });
        const fallback = await river(page); assert(!fallback.freePlay);
        assert.deepEqual(errors, []); assert.deepEqual(retired, []);
        report.push({label, drive, normal, alias, fallback, errors, retired});
        console.log(label, 'PASS night drive, story river, old API alias, no-drive fallback, no retired asset requests');
      } finally { await context.close(); }
      }
      // A fresh page exercises the actual old debug URL's delayed dispatcher.
      const legacy = await open(browser, phone, '&autostart=1&debugLevel5Boss=1');
      try {
        const result = await river(legacy.page); assert(result.freePlay);
        await legacy.page.waitForTimeout(1000);
        assert.equal(await legacy.page.evaluate(() => bobbyGame.currentStageId), 'level5-stage2', 'No second office/chase retry');
        assert.deepEqual(legacy.errors, []); assert.deepEqual(legacy.retired, []);
        report.push({label: label + '-debug-url', ...result, errors: legacy.errors, retired: legacy.retired});
        console.log(label, 'PASS legacy debug URL');
      } finally { await legacy.context.close(); }
      const drivePreview = await open(browser, phone, '&autostart=1&debugLevel5=1');
      try {
        await drivePreview.page.waitForFunction(() => bobbyGame.state === 'level5Dialogue' && bobbyGame.level5Drive
          && !bobbyGame.levelLoadingPresentation, undefined, {timeout: 90000});
        const drive = await drivePreview.page.evaluate(() => ({stage: bobbyGame.currentStageId,
          road: bobbyGame.refs.level5ParallaxLayers?.map(image => image?.naturalWidth || image?.width),
          skyline: bobbyGame.refs.level5BossParallaxLayers?.map(image => image?.naturalWidth || image?.width),
          trace: [...window.__highwayStates]}));
        assert.equal(drive.stage, 'level5-stage1');
        assert.deepEqual(drive.road, [2560]); assert.deepEqual(drive.skyline, [5120]);
        assert(!drive.trace.some(state => oldStates.includes(state)));
        assert.deepEqual(drivePreview.errors, []); assert.deepEqual(drivePreview.retired, []);
        report.push({label: label + '-drive-debug-url', ...drive, errors: drivePreview.errors, retired: drivePreview.retired});
        console.log(label, 'PASS legacy drive URL');
      } finally { await drivePreview.context.close(); }
    }
  } finally { await browser.close(); }
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS current highway replacement flow, retained skyline/road, removed assets/code and compatibility entries');
