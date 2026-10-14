// iPhone-only failures, forced on desktop browsers:
//  1. the phone's copy of a fight backdrop comes out blank (an iPhone can,
//     while the art is still decoding): level 2's bathroom, level 3's sofa and
//     level 7's stage must still be on screen (WebKit);
//  2. iPhone media volume (writes ignored, always reads 1): a fight song's
//     silent priming play must start silent, entering level 4 (Chrome);
//  3. a fade on a playing track glides, so slow frames cannot step it; a
//     paused track takes its level at once (Chrome);
//  4. a fight song never changes source at its start (Chrome).
// usage: node scripts/verify-moth-iphone.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const staff = new URL('moth/staff/?device=phone', base).href;
const boot = async (page, errors) => {
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(staff, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
};

// 1. A blank first copy of each fight backdrop a story scene leads into
//    (shown under the count-in while its art decodes).
for (const fight of [
  {name: 'level 2', stage: 'level2-stage2', start: 'startLevel2BathroomFight', ref: 'level2BathroomBackground'},
  {name: 'level 3', stage: 'level3-stage2', start: 'startLevel3MassageFight', ref: 'level3MassageSofa'},
  {name: 'level 7', stage: 'level6-stage2', start: 'startLevel6ConcertFight', ref: 'level6ConcertBgSheet'}
]) {
  const browser = await webkit.launch();
  const context = await browser.newContext({viewport: {width: 393, height: 852}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
  await stubScoreboard(context);
  await context.addInitScript(ref => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...rest) {
      if (!window.__spoiled && image && image === window.bobbyGame?.refs?.[ref] && !this.canvas.isConnected) { window.__spoiled = true; return; }
      return draw.call(this, image, ...rest);
    };
  }, fight.ref);
  const page = await context.newPage();
  const errors = [];
  await boot(page, errors);
  await page.evaluate(({stage, start}) => bobbyGame.loadSceneAssets(stage).then(() => { bobbyGame[start](); }), fight);
  await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm && !bobbyGame.level1OfficeRhythm.graphicsLoading && !(bobbyGame.stageCountdown > 0), undefined, {timeout: 60000});
  await page.waitForTimeout(500);
  const shown = await page.evaluate(ref => {
    const g = bobbyGame, image = g.refs[ref];
    const copy = (g.rhythmBackdropCache || []).find(e => e.image === image);
    const layer = copy?.canvas.getContext('2d');
    const points = copy ? [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].map(([x, y]) => layer.getImageData(Math.floor(copy.canvas.width * x), Math.floor(copy.canvas.height * y * 0.9), 1, 1).data[3]) : null;
    return {spoiled: Boolean(window.__spoiled), copy: Boolean(copy), alpha: points};
  }, fight.ref);
  assert(shown.spoiled, `${fight.name}: the first copy was forced blank`);
  assert(shown.copy && shown.alpha.every(a => a === 255), `${fight.name}: the backdrop on screen is whole ${JSON.stringify(shown)}`);
  assert.deepEqual(errors, []);
  console.log(`${fight.name} backdrop PASS`, JSON.stringify(shown));
  await browser.close();
}

// 2 and 3. iPhone media volume, level 3's walk into Bonita's fight.
{
  const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const context = await browser.newContext({viewport: {width: 393, height: 852}});
  await stubScoreboard(context);
  await context.addInitScript(() => {
    const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {configurable: true, enumerable: true, get() { return 1; }, set() { native.set.call(this, 1); }});
    window.__plays = [];
    window.__gain = {glides: 0, steps: 0, stepsWhilePlaying: 0};
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.addEventListener('playing', () => {
        const g = window.bobbyGame, route = g?.musicAudioRoutes?.get(this);
        window.__plays.push({fight: this === g?.level4ArcadeAudio, state: g?.state, gain: route?.gain.gain.value});
      }, {once: true});
      return play.apply(this, arguments);
    };
    const target = AudioParam.prototype.setTargetAtTime, step = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setTargetAtTime = function () { window.__gain.glides++; return target.apply(this, arguments); };
    AudioParam.prototype.setValueAtTime = function (value, time) {
      const g = window.bobbyGame;
      for (const [track, route] of [[g?.sewerAudio], [g?.level4ArcadeAudio]].map(([t]) => [t, g?.musicAudioRoutes?.get(t)])) {
        if (route?.gain.gain === this) { window.__gain.steps++; if (!track.paused) window.__gain.stepsWhilePlaying++; }
      }
      return step.apply(this, arguments);
    };
  });
  const page = await context.newPage();
  const errors = [];
  await boot(page, errors);
  await page.keyboard.press('Shift');
  await page.evaluate(() => bobbyGame.enterLevel3Stage1());
  await page.waitForFunction(() => bobbyGame.state === 'level3' && !bobbyGame.levelLoadingPresentation, undefined, {timeout: 90000});
  await page.waitForFunction(() => !bobbyGame.sewerAudio.paused && bobbyGame.sewerAudio.currentTime > 1.5, undefined, {timeout: 30000});
  await page.evaluate(() => bobbyGame.enterLevel4Stage1());
  await page.waitForFunction(() => bobbyGame.state === 'level4' && !bobbyGame.levelLoadingPresentation, undefined, {timeout: 90000});
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = bobbyGame; g.startLevel4Dialogue(); for (let i = 0; i < 40 && g.state === 'level4Dialogue'; i++) g.advanceLevel4Dialogue(); });
  await page.waitForFunction(() => { const t = bobbyGame.level4ArcadeAudio; return !t.paused && t.currentTime > 1; }, undefined, {timeout: 30000});
  await page.waitForTimeout(1000);
  const result = await page.evaluate(() => ({plays: window.__plays.filter(p => p.fight), gain: window.__gain, level: bobbyGame.musicAudioRoutes.get(bobbyGame.level4ArcadeAudio).gain.gain.value}));
  const priming = result.plays.find(p => p.state === 'loading');
  assert(priming, 'The fight song was primed on the loading screen ' + JSON.stringify(result.plays));
  assert.equal(priming.gain, 0, 'The priming play starts silent');
  assert(result.gain.glides > 20, 'Fades glide ' + JSON.stringify(result.gain));
  assert.equal(result.gain.stepsWhilePlaying, 0, 'No step of a playing track');
  assert(Math.abs(result.level - 0.72) < 0.01, 'The fight song plays at the music level: ' + result.level);
  assert.deepEqual(errors, []);
  console.log('volume PASS', JSON.stringify({priming, gain: result.gain, fightLevel: +result.level.toFixed(3)}));
  await browser.close();
}
// 4. A fight song that has played (primed on its stream) takes its downloaded
//    copy during the loading screen, muted, and never at the fight's start: an
//    iPhone plays the start of a changed source at full volume (owner,
//    2026-10-14: a burst after the count). Every fight, entered fresh (Chrome).
{
  const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const themes = {'level1-stage1': 'office', 'level2-stage2': 'bathroom', 'level3-stage2': 'massage', 'level4-stage1': 'arcade', 'studio-stage1': 'studio', 'level5-stage2': 'river', 'level6-stage2': 'concert'};
  const report = {};
  for (const [stage, theme] of Object.entries(themes)) {
    const context = await browser.newContext({viewport: {width: 393, height: 852}});
    await stubScoreboard(context);
    await context.addInitScript(() => {
      window.__changes = [];
      const played = new WeakSet();
      const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {configurable: true, get() { return src.get.call(this); }, set(value) {
        if (played.has(this) && this === window.__fight) window.__changes.push({muted: this.muted, state: window.bobbyGame?.state, loading: Boolean(window.bobbyGame?.levelLoadingPresentation)});
        src.set.call(this, value);
      }});
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this === window.__fight && window.bobbyGame?.state === 'playing') window.__start ||= {muted: this.muted, src: (this.getAttribute('src') || '').slice(0, 5)};
        played.add(this);
        return play.apply(this, arguments);
      };
    });
    const page = await context.newPage();
    const errors = [];
    await boot(page, errors);
    await page.keyboard.press('Shift');
    await page.evaluate(([stage, theme]) => { const g = bobbyGame; window.__fight = g.getRhythmAudioFor(theme); g.freePlay = true; g.startStage(stage); }, [stage, theme]);
    await page.waitForFunction(() => { const t = window.__fight; return t && !t.paused && t.currentTime > 1; }, undefined, {timeout: 60000});
    const seen = await page.evaluate(() => ({changes: window.__changes, start: window.__start}));
    assert(seen.changes.every(change => change.muted && change.loading), `${stage}: a played song changes source only muted, on the loading screen ${JSON.stringify(seen.changes)}`);
    assert.deepEqual(seen.start, {muted: false, src: 'blob:'}, `${stage}: the fight starts on its downloaded copy, unmuted`);
    assert.deepEqual(errors, []);
    report[theme] = seen.changes.length;
    await context.close();
  }
  console.log('song copy PASS', JSON.stringify(report));
  await browser.close();
}
console.log('PASS iPhone: blank backdrop copies recover (levels 2, 3, 7), silent priming, gliding fades, song copies taken on the loading screen');
