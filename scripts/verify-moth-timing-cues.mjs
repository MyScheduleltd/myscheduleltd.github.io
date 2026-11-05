// Audit the real shared renderer against all main/hidden easy/hard charts.
// A synthetic media clock checks pause/stall/calibration without playing audio.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/data/level1.json'), 'utf8'));
const specs = Object.entries(config).filter(([, spec]) => spec?.chart?.easy)
  .concat(config.secretLevels.map(level => [level.id, level.rhythm]));
const stages = {
  level1OfficeRhythm: ['level1-stage1', 'office'], level2BathroomRhythm: ['level2-stage2', 'bathroom'],
  level3MassageRhythm: ['level3-stage2', 'massage'], level4ArcadeRhythm: ['level4-stage1', 'arcade'],
  level5RiverRhythm: ['level5-stage2', 'river'], level6ConcertRhythm: ['level6-stage2', 'concert'],
  level5StudioRhythm: ['studio-stage1', 'studio'],
  ...Object.fromEntries(config.secretLevels.map(level => [level.id, [level.id, level.theme]]))
};
const cases = specs.flatMap(([name, spec]) => ['easy', 'hard'].map(mode => ({name, spec, mode, stage: stages[name][0], theme: stages[name][1]})));
const {chromium} = await import('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const out = path.join(root, '.qa/moth/rhythm-review/timing-cues');
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox']});
try {
  for (const [viewportName, viewport, phone] of [
    ['phone320', {width: 320, height: 568}, true],
    ['desktop', {width: 1280, height: 800}, false]
  ]) {
    const context = await browser.newContext({viewport, isMobile: phone, hasTouch: phone});
    await stubScoreboard(context);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(new URL(`moth/staff/?device=${phone ? 'phone' : 'desktop'}`, base).href, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 90000});
    await page.evaluate(() => {
      window.__cueOriginalUpdate = bobbyGame.update;
      bobbyGame.startStage('level1-stage1', {freePlay: true, skipAudio: true});
    });
    await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm?.tutorial?.mode === 'done' && !bobbyGame.levelLoadingPresentation && !(bobbyGame.stageCountdown > 0), undefined, {timeout: 90000});
    const clocks = await page.evaluate(() => {
      const g = bobbyGame, track = {currentTime: 24.75, paused: false};
      const receiver = {level1OfficeRhythm: {tutorial: {mode: 'done'}, skipAudio: false}, songTime: 4,
        audioInterruption: false, audioRecoveryVisible: () => false,
        getActiveLevel1OfficeRhythmAudio: () => track, getRhythmAudioStart: () => 20,
        getAudioOffsetSeconds: () => .025, getRhythmOutputDelay: () => 0};
      const read = () => g.getLevel1OfficeRenderTime.call(receiver);
      const calibrated = read(), stalled = read();
      receiver.getAudioOffsetSeconds = () => 0; receiver.getRhythmOutputDelay = () => .053;
      const automatic = read();
      track.paused = true; const paused = read();
      track.paused = false; receiver.level1OfficeRhythm.frozenSongTime = 2.125;
      const frozen = read(); delete receiver.level1OfficeRhythm.frozenSongTime;
      receiver.audioInterruption = true; const interrupted = read(); receiver.audioInterruption = false;
      receiver.level1OfficeRhythm.tutorial = {mode: 'practice', time: 1.25}; const practice = read();
      return {calibrated, stalled, automatic, paused, frozen, interrupted, practice};
    });
    assert(Math.abs(clocks.calibrated - 4.725) < 1e-12 && clocks.stalled === clocks.calibrated, `${viewportName}: cue clock samples media time and holds on a media stall`);
    assert(Math.abs(clocks.automatic - 4.697) < 1e-12, `${viewportName}: cue clock subtracts reported output delay`);
    assert.deepEqual({paused: clocks.paused, frozen: clocks.frozen, interrupted: clocks.interrupted, practice: clocks.practice},
      {paused: 4, frozen: 2.125, interrupted: 4, practice: 1.25}, `${viewportName}: pause, interruption and tutorial clocks`);
    const results = await page.evaluate(cases => {
      const g = bobbyGame, target = g.ctx, arc = target.arc;
      g.update = () => {};
      const previousSpec = g.getRhythmSpecFor, previousDifficulty = g.getDifficulty;
      const output = [];
      try {
        for (const entry of cases) {
          g.getRhythmSpecFor = () => entry.spec;
          g.getDifficulty = () => ({hardPhrases: entry.mode === 'hard'});
          const r = g.createLevel1OfficeRhythmState(entry.theme);
          r.skipAudio = true; r.tutorial.mode = 'done'; r.phaseIntroTimer = 0;
          g.level1OfficeRhythm = r; g.currentStageId = entry.stage;
          const rows = entry.spec.chart[entry.mode], step = 60 / entry.spec.bpm * entry.spec.chart.stepBeats;
          const factoryErrors = [];
          if (r.notes.length !== rows.length) factoryErrors.push(`count ${r.notes.length} instead of ${rows.length}`);
          r.notes.forEach((note, i) => {
            const row = rows[i];
            if (!row) return;
            const time = entry.spec.beatOffset + row[0] * step;
            const holdEnd = row[2] > 0 ? time + row[2] * step : null;
            if (Math.abs(note.time - time) > 1e-9 || note.button !== row[1]
              || (holdEnd == null ? note.holdEnd != null : Math.abs(note.holdEnd - holdEnd) > 1e-9)) factoryErrors.push(`row ${i}`);
          });
          const geometry = g.getRhythmRailGeometry();
          let dense = 0, sparse = 0;
          geometry.heads.forEach((head, i) => {
            if (head.maxRingRadius < geometry.heads[dense].maxRingRadius) dense = i;
            if (head.maxRingRadius > geometry.heads[sparse].maxRingRadius) sparse = i;
          });
          const hold = r.notes.findIndex(note => note.holdEnd);
          const indexes = [...new Set([0, r.notes.length - 1, dense, sparse, hold].filter(i => i >= 0))];
          const samples = [];
          for (const index of indexes) {
            const note = r.notes[index];
            const atHit = g.getRhythmTimingCue(note, note.time);
            for (const remaining of [.95, .5, .1, 0, -.05]) {
              const clock = note.time - remaining * atHit.lead;
              g.songTime = r.frozenSongTime = clock;
              const painted = [];
              target.arc = function (x, y, radius, start, end) {
                if (Math.abs(y - 616) < .001 && (this.strokeStyle === '#ffffff' || this.strokeStyle === '#ff315a'))
                  painted.push({x, radius, start, end, stroke: this.strokeStyle});
                return arc.apply(this, arguments);
              };
              g.render(); g.renderTallScreen();
              const actual = r.renderTelemetry.noteTimingCues?.find(cue => cue.id === note.id);
              const x = 760 + (note.time - clock) * geometry.pixelsPerSecond;
              samples.push({index, remaining, actual, expected: g.getRhythmTimingCue(note, clock),
                painted: painted.filter(cue => Math.abs(cue.x - x) < 1e-7),
                speed: geometry.pixelsPerSecond, hold: Boolean(note.holdEnd)});
            }
          }
          output.push({name: entry.name, mode: entry.mode, notes: r.notes.length, factoryErrors, samples});
        }
      } finally {
        target.arc = arc; g.getRhythmSpecFor = previousSpec; g.getDifficulty = previousDifficulty;
      }
      return output;
    }, cases);
    for (const result of results) {
      assert.deepEqual(result.factoryErrors, [], `${viewportName}/${result.name}/${result.mode}: every runtime factory head retains the measured attack time, button and hold end`);
      const previous = new Map();
      for (const sample of result.samples) {
        const label = `${viewportName}/${result.name}/${result.mode}/${sample.index}/${sample.remaining}`;
        assert(sample.actual && sample.expected && sample.painted.length === 1, `${label}: actual renderer paints this note's cue exactly once`);
        assert(sample.actual.maxRadius - sample.actual.targetRadius >= 5 - 1e-6, `${label}: real timing circle has at least 5px of visible shrinking travel`);
        assert(Math.abs(sample.actual.radius - sample.expected.radius) < 1e-9, `${label}: telemetry matches timing calculation`);
        assert(Math.abs(sample.painted[0].radius - sample.actual.radius) < 1e-9, `${label}: real canvas circle matches telemetry`);
        assert(Math.abs(sample.painted[0].end - sample.painted[0].start - 2 * Math.PI) < 1e-9, `${label}: white timing cue remains a complete circle`);
        assert.equal(sample.painted[0].stroke, '#ffffff', `${label}: white cue is visible against the rail through its attack`);
        if (previous.has(sample.index)) assert(sample.actual.radius <= previous.get(sample.index) + 1e-9, `${label}: real painted radius shrinks monotonically`);
        previous.set(sample.index, sample.actual.radius);
        if (sample.remaining === 0) assert.equal(sample.actual.radius, sample.actual.targetRadius, `${label}: actual circle reaches the head at exact target time`);
      }
    }
    const clockDraws = await page.evaluate(entry => {
      const g = bobbyGame, saved = Object.fromEntries(['getRhythmSpecFor', 'getDifficulty',
        'getActiveLevel1OfficeRhythmAudio', 'getRhythmAudioStart', 'getAudioOffsetSeconds', 'getRhythmOutputDelay'].map(key => [key, g[key]]));
      try {
        g.getRhythmSpecFor = () => entry.spec; g.getDifficulty = () => ({hardPhrases: false});
        const r = g.createLevel1OfficeRhythmState('office');
        r.skipAudio = false; r.tutorial.mode = 'done'; r.phaseIntroTimer = 0;
        g.level1OfficeRhythm = r; g.currentStageId = 'level1-stage1';
        const note = r.notes[3], track = {currentTime: 20 + .025 + note.time - .1, paused: false};
        g.getActiveLevel1OfficeRhythmAudio = () => track;
        g.getRhythmAudioStart = () => 20; g.getAudioOffsetSeconds = () => .025; g.getRhythmOutputDelay = () => 0;
        g.songTime = 0; // Deliberately stale: drawing must sample the media clock.
        const draw = () => {
          g.render(); g.renderTallScreen();
          return {clock: g.getLevel1OfficeRenderTime(), cue: r.renderTelemetry.noteTimingCues.find(cue => cue.id === note.id)};
        };
        const before = draw(), stalled = draw();
        g.songTime = before.clock; track.paused = true; const paused = draw();
        track.paused = false; track.currentTime = 20 + .025 + note.time; const resumedAtTarget = draw();
        return {before, stalled, paused, resumedAtTarget, noteTime: note.time, speed: g.getRhythmRailGeometry().pixelsPerSecond};
      } finally { Object.assign(g, saved); }
    }, cases[0]);
    assert(Math.abs(clockDraws.before.clock - (clockDraws.noteTime - .1)) < 1e-9, `${viewportName}: actual renderer reads current media time with the cut start and manual offset`);
    assert.deepEqual(clockDraws.stalled, clockDraws.before, `${viewportName}: the actual rendered circle holds still on a media stall`);
    assert.deepEqual(clockDraws.paused, clockDraws.before, `${viewportName}: the actual rendered circle holds on the saved pause clock`);
    assert(Math.abs(clockDraws.resumedAtTarget.cue.radius - clockDraws.resumedAtTarget.cue.targetRadius) < 1e-9
      && Math.abs(clockDraws.resumedAtTarget.cue.x - 760) < 1e-9, `${viewportName}: after resume, the real circle converges at the same audible target and hit line`);
    // Load actual river/concert arenas for before/at/after screenshots, so
    // legibility is checked in the real backgrounds and portrait layout.
    for (const density of ['sparse', 'dense']) {
      const entry = cases.find(c => c.name === (density === 'sparse' ? 'level5RiverRhythm' : 'level6ConcertRhythm') && c.mode === 'hard');
      await page.evaluate(entry => {
        const g = bobbyGame, hard = {...g.getDifficulty(), id: 'shoot', hardPhrases: true};
        g.getDifficulty = () => hard;
        g.update = window.__cueOriginalUpdate;
        g.debugUnlockAllStages();
        g.startStage(entry.stage, {freePlay: true, skipAudio: true});
      }, entry);
      await page.waitForFunction(stage => bobbyGame.currentStageId === stage && bobbyGame.state === 'playing'
        && bobbyGame.level1OfficeRhythm?.tutorial?.mode === 'done' && !bobbyGame.levelLoadingPresentation
        && !(bobbyGame.stageCountdown > 0) && !bobbyGame.level1OfficeRhythm?.graphicsLoading, entry.stage, {timeout: 90000});
      for (const [phase, remaining] of [['before', .9], ['at', 0], ['after', -.05]]) {
        const screenshot = await page.evaluate(({entry, density, remaining}) => {
          const g = bobbyGame, r = g.level1OfficeRhythm;
          g.update = () => {};
          r.skipAudio = true; r.tutorial.mode = 'done'; r.phaseIntroTimer = 0;
          r.judgment = r.trackPulse = null;
          r.notes.forEach(note => {note.status = 'pending';});
          const geometry = g.getRhythmRailGeometry();
          let index = 0;
          geometry.heads.forEach((head, i) => {
            if ((density === 'sparse' && head.maxRingRadius > geometry.heads[index].maxRingRadius)
              || (density === 'dense' && head.maxRingRadius < geometry.heads[index].maxRingRadius)) index = i;
          });
          const note = r.notes[index], cue = g.getRhythmTimingCue(note, note.time);
          g.songTime = r.frozenSongTime = note.time - remaining * cue.lead;
          g.render(); g.renderTallScreen();
          return {song: entry.name, mode: entry.mode, index, noteTime: note.time, remaining,
            telemetry: r.renderTelemetry.noteTimingCues.find(cue => cue.id === note.id)};
        }, {entry, density, remaining});
        await page.screenshot({path: path.join(out, `${viewportName}-${density}-${phase}.png`)});
        await fs.writeFile(path.join(out, `${viewportName}-${density}-${phase}.json`), JSON.stringify(screenshot, null, 2) + '\n');
      }
    }
    assert.deepEqual(errors, [], `${viewportName}: no browser errors`);
    console.log(viewportName, 'PASS', JSON.stringify({charts: results.length, factoryHeads: results.reduce((sum, result) => sum + result.notes, 0), actualDrawSamples: results.reduce((sum, result) => sum + result.samples.length, 0), clocks, mediaClockDrawing: true}));
    await context.close();
  }
} finally { await browser.close(); }
console.log('PASS: complete shrinking white timing circles on all nine songs/both modes, start/end/dense/sparse/hold passages, 320px phone/desktop; pause/stall/calibration clocks');
