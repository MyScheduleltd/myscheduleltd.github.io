// Check every song/difficulty opening through the normal loading/countdown
// paths. The rail waits through GO and starts with the routed music gain
// already audible. Covers pauses, replays, and the Level 1 tutorial entry.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { stubScoreboard } from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5297/';
const smoke = process.argv.includes('--smoke');
const phoneOnly = process.argv.includes('--phone');
const storyOnly = process.argv.includes('--story');
const selectionOnly = process.argv.includes('--selection');
const easyOnly = process.argv.includes('--easy');
const out = path.resolve(process.env.MOTH_COUNTDOWN_AUDIT_OUTPUT || '.qa/moth/openings/screenshots');
const stages = [
  ['level1-stage1', 'startLevel'], ['level2-stage2', 'startLevel2BathroomFight'],
  ['level3-stage2', 'startLevel3MassageFight'], ['level4-stage1', 'startLevel4ArcadeFight'],
  ['studio-stage1', 'startStudioFight'], ['level5-stage2', 'startLevel5RiverFight'],
  ['level6-stage2', 'startLevel6ConcertFight'], ['secret-xiaosi'], ['secret-getdown']
];
await fs.mkdir(out, { recursive: true });

async function mount(page, device) {
  await page.goto(new URL('moth/staff/?device=' + (device === 'desktop' ? 'desktop' : 'phone'), base).href,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => bobbyGame?.bootDone, undefined, { timeout: 90000 });
  await page.evaluate(() => {
    const game = bobbyGame;
    game.debugUnlockAllStages();
    game.progress.flags.debugSecretLevelsUnlocked = true;
    game.setLanguage('en', { persist: false, announce: false });
    const audit = window.__countAudit = { frames: [] };
    const render = game.render;
    const countdown = game.renderStageCountdown;
    const notes = window.drawRhythmRailNotes;
    if (!notes) throw Error('Could not instrument the browser rail renderer');
    game.render = function (...args) {
      const rhythm = this.level1OfficeRhythm;
      if (!audit.stage || !rhythm || this.currentStageId !== audit.stage || this.state !== 'playing' ||
          rhythm.tutorial?.mode !== 'done') return render.apply(this, args);
      const track = this.getActiveLevel1OfficeRhythmAudio();
      const route = this.musicAudioRoutes?.get(track);
      const frame = {
        at: performance.now(), clock: this.getLevel1OfficeRenderTime(), countdown: this.stageCountdown,
        audio: !!track && !track.paused && !track.muted && track.volume > .0001,
        source: track?.currentSrc, movie: !!this.arcadeMusicVideo && !this.arcadeMusicVideo.paused,
        native: track?.currentTime, gain: route?.gain.gain.value ?? 0, notes: [], counters: [],
        judgments: [rhythm.roundScore, rhythm.misses, rhythm.perfects, rhythm.goods, rhythm.combo]
      };
      audit.frame = frame;
      try { return render.apply(this, args); }
      finally {
        audit.frame = null;
        if (!audit.checkedCountInput && frame.counters.includes('GO!')) {
          audit.checkedCountInput = true;
          const note = rhythm.notes.find(note => note.status === 'pending');
          const originalFeedback = this.playRhythmHitSfx;
          let sounds = 0;
          this.playRhythmHitSfx = () => { sounds += 1; return true; };
          try {
            this.handleLevel1OfficeRhythmPress(note.button, performance.now());
            frame.countInput = { sounds, noteStatus: note.status };
          } finally { this.playRhythmHitSfx = originalFeedback; }
        }
        audit.frames.push(frame);
        if (audit.frames.length > 1000) audit.frames.shift();
      }
    };
    game.renderStageCountdown = function (...args) {
      audit.drawingCountdown = true;
      try { return countdown.apply(this, args); }
      finally { audit.drawingCountdown = false; }
    };
    window.drawRhythmRailNotes = function (target, list, layout) {
      const captured = audit.frame && target === game.ctx ? {
        x: layout.cursorX, y: layout.railY, time: layout.railTime, heads: [], rings: 0
      } : null;
      if (captured) {
        audit.frame.notes.push(captured);
        audit.rail = captured;
      }
      try {
        const rings = notes.call(this, target, list, layout);
        if (captured) captured.rings = rings?.length || 0;
        return rings;
      } finally { audit.rail = null; }
    };
    const fillText = game.ctx.fillText;
    game.ctx.fillText = function (text, x, y, ...args) {
      if (audit.drawingCountdown && /^(?:[123]|GO!|開始！)$/.test(text)) audit.frame?.counters.push(String(text));
      if (audit.rail && /^[MOTH]$/.test(text)) audit.rail.heads.push([text, x, y]);
      return fillText.call(this, text, x, y, ...args);
    };
  });
}

async function act(page, action, data) {
  await page.evaluate(({ action, data }) => {
    const button = document.createElement('button');
    button.id = 'count-audit-start';
    button.textContent = action;
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647';
    button.onclick = () => {
      button.remove();
      const game = bobbyGame;
      const audit = window.__countAudit;
      audit.frames = [];
      audit.stage = data.stage;
      audit.checkedCountInput = false;
      if (action === 'resume') { if (!game.resumeLevel1Office()) throw Error('Resume rejected'); return; }
      if (action === 'replay') { void game.replayFreePlayStage(); return; }
      game.returnToTitle();
      game.setDifficulty(data.difficulty, { persist: false, announce: false });
      if (action === 'selection' || !data.method) {
        void game.startStage(data.stage, { fromLevelSelection: action === 'selection' });
      } else {
        game.level1TutorialSeen = action !== 'tutorial';
        game.startLevelLoading(data.stage, () => game[data.method](
          data.stage === 'level2-stage2' ? { fromDialogue: true } : {}
        ));
      }
    };
    document.body.append(button);
  }, { action, data });
  await page.locator('#count-audit-start').click();
}

async function collect(page, label, capture = false) {
  await page.waitForFunction(() => window.__countAudit.frames.some(frame => frame.counters.includes('GO!')),
    undefined, { timeout: 90000 });
  if (capture) await page.screenshot({ path: path.join(out, label.replaceAll('/', '-') + '-go.png') });
  await page.waitForFunction(() => {
    const audit = window.__countAudit;
    const frames = audit.frames;
    const go = frames.findIndex(frame => frame.counters.includes('GO!'));
    const live = frames.at(-1);
    return go >= 0 && live.audio && !live.countdown && !live.counters.length && live.clock > frames[go].clock + .24;
  }, undefined, { timeout: 25000 });
  return page.evaluate(() => window.__countAudit.frames);
}

function check(frames, label) {
  const first = frames.findIndex(frame => frame.counters.length);
  const last = frames.findLastIndex(frame => frame.counters.length);
  const pre = frames.slice(0, last + 1);
  const visible = frames.slice(first, last + 1);
  const reference = visible[0];
  const counts = [...new Set(visible.flatMap(frame => frame.counters))];
  const railFrames = visible.filter(frame => frame.notes.length);
  assert.deepEqual(counts, ['3', '2', '1', 'GO!'], label + ' drew every countdown card');
  assert(pre.every(frame => !frame.audio && !frame.movie), label + ' played audio/video before GO cleared');
  assert(visible.every(frame => frame.clock === reference.clock), label + ' changed the playhead before GO cleared');
  assert(visible.every(frame => frame.judgments.every((n, i) => n === reference.judgments[i])),
    label + ' awarded a judgment during the countdown');
  assert.deepEqual(visible.find(frame => frame.countInput)?.countInput, {sounds: 0, noteStatus: 'pending'},
    label + ' accepted a hit or played a hit sound while GO was visible');
  assert(railFrames.length >= 4, label + ' did not draw the beat rail under the countdown');
  assert(railFrames.every(frame => frame.notes.every(rail => !rail.rings)), label + ' drew timing rings during the countdown');
  for (const rail of railFrames[0].notes) {
    const renders = railFrames.flatMap(frame => frame.notes.filter(candidate => candidate.x === rail.x && candidate.y === rail.y));
    assert(renders.length >= 4, label + ' track disappeared during the countdown');
    const firstDifferent = renders.find(note => note.time !== rail.time || JSON.stringify(note.heads) !== JSON.stringify(rail.heads));
    assert(!firstDifferent, label + ' moved beat heads during countdown at x=' + rail.x + ': ' + rail.time + ' to ' + firstDifferent?.time);
  }
  const post = frames.slice(last + 1);
  const firstRail = railFrames[0].notes[0];
  assert(post.some(frame => frame.audio && frame.clock > reference.clock + .2 && frame.source?.startsWith('blob:')),
    label + ' never started the verified game audio and chart after the count');
  assert(post.some(frame => frame.notes.some(rail => rail.time > firstRail.time)),
    label + ' never moved the rail once the card cleared');
  const moving = post.filter(frame => frame.notes.some(rail => rail.time > firstRail.time + .00001));
  const gain = Math.max(...moving.map(frame => frame.gain));
  assert(firstRail.time >= 0, label + ' drew an artificial silent note approach');
  assert(gain >= .48, label + ' never reached audible gain');
  assert(moving.every(frame => frame.audio && frame.gain >= gain * .87),
    label + ' moved while the song was muted or faded below its audible starting level: ' + JSON.stringify(moving.slice(0, 4)));
  console.log('PASS', label, JSON.stringify({ countFrames: visible.length, rails: railFrames[0].notes.length,
    openingGain: moving[0].gain, firstPlayable: moving[0].clock }));
}

async function finishOfficeTutorial(page) {
  await page.waitForFunction(() => bobbyGame.level1OfficeRhythm?.tutorial?.mode === 'intro'
    && !bobbyGame.level1OfficeRhythm.graphicsLoading && !bobbyGame.levelLoadingPresentation, undefined, { timeout: 90000 });
  await page.evaluate(() => {
    const g = bobbyGame;
    while (g.level1OfficeRhythm.tutorial.mode === 'intro') g.advanceLevel1OfficeTutorial();
  });
  const current = () => page.evaluate(() => {
    const t = bobbyGame.level1OfficeRhythm.tutorial;
    const note = t.notes[t.noteIndex];
    t.time = note.time;
    return note.button;
  });
  for (let i = 0; i < 4; i++) await page.keyboard.press('Key' + await current());
  const hold = 'Key' + await current();
  await page.keyboard.down(hold);
  await page.waitForFunction(() => bobbyGame.level1OfficeRhythm.tutorial.notes[4].holdDone);
  await page.keyboard.up(hold);
  await page.waitForFunction(() => bobbyGame.level1OfficeRhythm.tutorial.mode === 'complete');
  await page.evaluate(() => {
    const g = bobbyGame;
    while (g.level1OfficeRhythm.tutorial.mode === 'complete') g.advanceLevel1OfficeTutorial();
  });
}

const devices = phoneOnly ? ['portrait'] : ['desktop'];
for (const device of devices) {
  const phone = device === 'portrait';
  const browser = await (phone ? webkit : chromium).launch(phone ? { headless: true } : {
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  try {
    const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile: phone, hasTouch: phone });
    await stubScoreboard(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Frame step failed/.test(message.text())) errors.push(message.text()); });
    await mount(page, device);
    if (process.env.MOTH_EXPECTED_CHART_VERSION) {
      assert.equal(await page.evaluate(() => bobbyGame.config.rhythmChartVersion), process.env.MOTH_EXPECTED_CHART_VERSION,
        'The newest chart revision was loaded');
    }
    const lines = smoke ? stages.slice(0, 1) : stages;
    const kinds = smoke || selectionOnly ? ['selection'] : storyOnly ? ['story'] : ['story', 'selection'];
    for (const kind of kinds) {
      for (const [stage, method] of lines) {
        for (const difficulty of smoke || easyOnly ? ['chill'] : ['chill', 'shoot']) {
          const label = [device, kind, stage, difficulty].join('/');
          await act(page, kind, { stage, method, difficulty });
          check(await collect(page, label, stage === 'level1-stage1' && difficulty === 'chill'), label);
          assert.equal(await page.evaluate(() => bobbyGame.getKnownBgmTracks()
            .filter(track => track.mothFightCopy).length), 1, label + ' keeps one prepared fight copy');
        }
      }
    }
    if (!smoke && !storyOnly) {
      const river = { stage: 'level5-stage2', difficulty: 'chill' };
      await act(page, 'selection', river);
      await collect(page, device + '/river-pre-resume');
      await page.waitForFunction(() => bobbyGame.getLevel1OfficeRenderTime() > 1.1);
      const paused = await page.evaluate(() => {
        const g = bobbyGame;
        if (!g.pauseLevel1Office()) throw Error('Pause rejected');
        return g.getLevel1OfficeRenderTime();
      });
      await act(page, 'resume', river);
      const resumed = await collect(page, device + '/river-resume');
      assert.equal(resumed.find(frame => frame.counters.length).clock, paused);
      check(resumed, device + '/river-resume');
      await act(page, 'replay', river);
      check(await collect(page, device + '/river-replay'), device + '/river-replay');
    }
    if (!smoke && !selectionOnly) {
      const office = { stage: 'level1-stage1', method: 'startLevel', difficulty: 'chill' };
      await act(page, 'tutorial', office);
      await finishOfficeTutorial(page);
      check(await collect(page, device + '/office-after-tutorial'), device + '/office-after-tutorial');
    }
    assert.deepEqual(errors, [], 'No game runtime errors');
  } finally { await browser.close(); }
}
