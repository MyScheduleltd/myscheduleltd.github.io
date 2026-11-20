// Regression for TV callouts after the former fighter coordinates were removed.
// --preview-patch tests the source methods without changing generated files.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {patchMothRuntime} from './moth-runtime-patches.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
const root = path.resolve(import.meta.dirname, '..');
const base = process.argv[2] || 'http://127.0.0.1:5297/';
const previewPatch = process.argv.includes('--preview-patch');
const out = path.resolve(process.env.MOTH_TV_FEEDBACK_OUTPUT || '.qa/moth/pattern-refine-20261119/feedback');
await fs.mkdir(out, {recursive: true});
const require = createRequire(import.meta.url);
const ts = require(process.env.MOTH_TYPESCRIPT_PATH || '/Users/myscheduleai/Desktop/myschedule-pivot/band-repair-20261004/world/node_modules/typescript/lib/typescript.js');
const patched = patchMothRuntime(await fs.readFile(path.join(root, '.qa/moth/published/src/game.js'), 'utf8'), ts);
const ast = ts.createSourceFile('feedback-runtime.js', patched, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
assert.equal(ast.parseDiagnostics.length, 0);
const gameClass = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'BobbyGame');
const names = ['spawnArcadeBurst', 'renderLevel4ArcadeGame', 'renderArcadeTvFeedback'];
const methods = names.map(name => {
  const method = gameClass.members.find(node => node.name?.getText(ast) === name);
  assert(method, name); return method.getText(ast);
});
assert(!methods[0].includes('layout.bobbyX') && !methods[0].includes('layout.bonitaX'));
const report = [];
for (const phone of [false, true]) {
  const browser = await (phone ? webkit : chromium).launch(phone ? {headless: true} : {
    headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1280, height: 800},
      isMobile: phone, hasTouch: phone, bypassCSP: previewPatch});
    await stubScoreboard(context);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(new URL('moth/staff/?device=' + (phone ? 'phone' : 'desktop'), base).href, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => bobbyGame?.bootDone, undefined, {timeout: 90000});
    if (previewPatch) await page.evaluate(methods => {
      Object.assign(Object.getPrototypeOf(bobbyGame), Function('return ({' + methods.join(',\n') + '})')());
    }, methods);
    await page.evaluate(async () => {
      const g = bobbyGame;
      g.debugUnlockAllStages();
      await g.startStage('level4-stage1', {freePlay: true, fromLevelSelection: true, skipAudio: true});
    });
    await page.waitForFunction(() => bobbyGame.level1OfficeRhythm?.theme === 'arcade'
      && !bobbyGame.level1OfficeRhythm.graphicsLoading && !bobbyGame.levelLoadingPresentation,
    undefined, {timeout: 90000});
    for (const language of ['zh-TW', 'en']) {
      for (const kind of ['perfect', 'good', 'miss']) {
        const state = await page.evaluate(({kind, language}) => {
          const g = bobbyGame, r = g.level1OfficeRhythm;
          g.update = () => {};
          g.levelLoadingPresentation = null; g.stageCountdown = 0; g.state = 'playing';
          g.setLanguage(language, {persist: false, announce: false});
          r.tutorial.mode = 'done'; r.phaseIntroTimer = 0; r.ending = false;
          r.audioStarting = false; r.audioStartPending = false; r.songHandover = false;
          r.frozenSongTime = 20; r.skipAudio = true; r.combo = kind === 'miss' ? 0 : 10;
          r.arcadeEvent = null; r.arcadeCheer = null;
          g.hitBursts = [];
          let worldBursts = 0;
          const spawn = g.spawnHitBurst;
          g.spawnHitBurst = () => {worldBursts++;};
          try { g.spawnArcadeBurst({kind, action: 'do', label: kind === 'perfect' ? g.tr('PERFECT', '完美')
            : kind === 'good' ? g.tr('GOOD', '很好') : g.tr('MISS', '失誤'), perfect: kind === 'perfect'}); }
          finally {g.spawnHitBurst = spawn;}
          r.frozenSongTime = 20.14;
          g.render();
          const first = structuredClone(r.graphicsArcadeFeedbackTelemetry);
          g.render();
          const frozen = structuredClone(r.graphicsArcadeFeedbackTelemetry);
          r.frozenSongTime = 21;
          g.render();
          const expired = r.graphicsArcadeFeedbackTelemetry;
          r.frozenSongTime = 20.14;
          g.render();
          return {first, frozen, expired, worldBursts, globalBursts: g.hitBursts.length,
            fighterCoordinatesRemoved: g.getLevel4ArcadeLayout().bobbyX === undefined};
        }, {kind, language});
        const {first, frozen, expired} = state;
        assert(first && first.alpha > 0, 'A visible TV callout is produced: ' + JSON.stringify(state));
        for (const value of Object.values(first.bounds)) assert(Number.isFinite(value));
        const {bounds: b, glass: tv} = first;
        assert(b.x >= tv.x && b.y >= tv.y && b.x + b.w <= tv.x + tv.w && b.y + b.h <= tv.y + tv.h,
          'The complete callout remains inside the TV glass');
        assert(Math.abs(b.y + b.h - (first.trackTop - 8)) < .001, 'Callout sits just above the TV rail');
        assert(first.hitX >= b.x && first.hitX <= b.x + b.w, 'Callout aligns to the TV hit line');
        assert.deepEqual(frozen, first, 'Pausing the source clock freezes the feedback');
        assert.equal(expired, null, 'Feedback expires on the song clock');
        assert.equal(state.worldBursts, 0, 'TV feedback never creates an undefined-position world burst');
        assert.equal(state.globalBursts, 0);
        assert(state.fighterCoordinatesRemoved, 'The regression uses the new TV layout, without old fighter positions');
        const label = `${phone ? 'phone' : 'desktop'}-${language}-${kind}`;
        await page.screenshot({path: path.join(out, label + '.png')});
        report.push({label, ...state});
        console.log('PASS', label, 'TV-contained callout above rail, finite position, frozen clock and expiry');
      }
    }
    assert.deepEqual(errors, [], 'No runtime or drawing errors');
    await context.close();
  } finally { await browser.close(); }
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({previewPatch, cases: report}, null, 2) + '\n');
console.log('PASS', report.length, 'TV feedback cases');
