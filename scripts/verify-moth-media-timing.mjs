// Software timing audit using the actual decoded/playing media of every
// stage, with real input and hold-release handlers. No physical latency claim.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/data/level1.json'), 'utf8'));
const stages = ['level1-stage1', 'level2-stage2', 'level3-stage2', 'level4-stage1', 'studio-stage1', 'level5-stage2', 'level6-stage2', ...config.secretLevels.map(level => level.id)];
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const smoke = process.argv.includes('--smoke');
const riverOnly = process.argv.includes('--river');
const report = [];
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await stubScoreboard(context);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(new URL('moth/staff/?device=desktop', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 90000});
  await page.evaluate(() => {
    window.__mediaTimingUpdate = bobbyGame.update;
    bobbyGame.debugUnlockAllStages();
    bobbyGame.progress.flags.debugSecretLevelsUnlocked = true;
  });
  for (const stage of riverOnly ? ['level5-stage2'] : smoke ? stages.slice(0, 1) : stages) {
    for (const mode of smoke ? ['chill'] : ['chill', 'shoot']) {
      await page.evaluate(({stage, mode}) => {
        const g = bobbyGame;
        g.update = window.__mediaTimingUpdate;
        g.setDifficulty(mode, {persist: false, announce: false});
        g.startStage(stage, {freePlay: true, skipAudio: false});
      }, {stage, mode});
      await page.waitForFunction(stage => {
        const g = bobbyGame, r = g.level1OfficeRhythm, track = r && g.getActiveLevel1OfficeRhythmAudio();
        return g.currentStageId === stage && g.state === 'playing' && r?.tutorial?.mode === 'done'
          && !g.levelLoadingPresentation && !(g.stageCountdown > 0) && !r.audioStartPending && !r.audioStarting && !r.songHandover
          && !g.audioInterruption && !g.audioRecovering && !g.audioRecoveryVisible()
          && track && !track.paused && track.readyState >= 3 && !track.seeking;
      }, stage, {timeout: 120000});
      if (stage === 'level1-stage1' && mode === 'chill') {
        const readClock = () => page.evaluate(() => {
          const g = bobbyGame, track = g.getActiveLevel1OfficeRhythmAudio();
          return {blob: track.currentSrc.startsWith('blob:'), media: track.currentTime,
            chart: g.getLevel1OfficeRenderTime(), seeking: track.seeking, paused: track.paused};
        });
        const before = await readClock();
        await context.setOffline(true);
        try {
          await page.waitForFunction(previous => bobbyGame.getLevel1OfficeRenderTime() > previous + .6,
            before.chart, {timeout: 10000});
          const after = await readClock();
          assert(after.blob && !after.seeking && !after.paused, 'The fight keeps playing its local song after losing the connection');
          assert(Math.abs((after.media - before.media) - (after.chart - before.chart)) < .06, 'The note clock stays with the local audio while offline');
          console.log('PASS: active fight music and chart clock stay in sync with the network disabled');
        } finally { await context.setOffline(false); }
      }
      const result = await page.evaluate(async ({stage, mode}) => {
        const g = bobbyGame, r = g.level1OfficeRhythm, track = g.getActiveLevel1OfficeRhythmAudio();
        g.update = () => {}; // Keep normal judgment updates from consuming sought notes.
        r.phaseIntroTimer = 0;
        delete r.frozenSongTime;
        track.muted = true;
        const seek = async target => {
          const mediaTime = target + g.getRhythmAudioStart() + g.getAudioOffsetSeconds() + g.getRhythmOutputDelay();
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {cleanup(); reject(new Error(`Seek timed out: ${stage}/${mode}/${mediaTime}`));}, 10000);
            const cleanup = () => {clearTimeout(timeout); track.removeEventListener('seeked', done);};
            const done = () => {cleanup(); resolve();};
            track.addEventListener('seeked', done, {once: true});
            track.currentTime = mediaTime;
          });
          if (track.paused) await track.play();
          if (track.readyState < 3) await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Seek did not become playable')), 10000);
            track.addEventListener('canplay', () => {clearTimeout(timeout); resolve();}, {once: true});
          });
          return mediaTime;
        };
        const holdIndex = r.notes.findIndex(note => note.holdEnd);
        const indexes = [...new Set([0, Math.floor(r.notes.length / 2), r.notes.length - 1, holdIndex].filter(i => i >= 0))];
        const hits = [];
        for (const index of indexes) {
          const note = r.notes[index];
          note.status = 'pending'; note.holding = false; note.holdBroken = false; note.holdDone = false; r.holds = {};
          const mediaTime = await seek(note.time);
          const clock = g.getLevel1OfficeRenderTime();
          const pressed = g.handleLevel1OfficeRhythmPress(note.button, performance.now());
          const hit = {index, time: note.time, button: note.button, mediaTime, clock, errorMs: (clock - note.time) * 1000,
            pressed, status: note.status, deltaMs: note.delta * 1000, hold: Boolean(note.holdEnd), holding: Boolean(note.holding)};
          if (note.holdEnd) {
            await seek(note.holdEnd);
            hit.released = g.handleLevel1OfficeRhythmRelease(note.button, performance.now());
            hit.holdDone = Boolean(note.holdDone); hit.holdBroken = Boolean(note.holdBroken);
          }
          hits.push(hit);
        }
        const beforePause = g.getLevel1OfficeRenderTime(), misses = r.misses;
        g.songTime = beforePause; track.pause();
        const pausedStart = g.getLevel1OfficeRenderTime();
        await new Promise(resolve => setTimeout(resolve, 100));
        const pausedEnd = g.getLevel1OfficeRenderTime();
        await track.play();
        track.playbackRate = 0; // A deliberately stationary real-media playhead.
        const stationaryStart = g.getLevel1OfficeRenderTime();
        await new Promise(resolve => setTimeout(resolve, 100));
        const stationaryEnd = g.getLevel1OfficeRenderTime();
        track.playbackRate = 1;
        track.pause();
        return {stage, mode, source: track.currentSrc.startsWith('blob:') ? 'verified-blob' : track.currentSrc,
          noteCount: r.notes.length, audioStart: g.getRhythmAudioStart(), manualOffset: g.getAudioOffsetSeconds(),
          outputDelay: g.getRhythmOutputDelay(), readyState: track.readyState, duration: track.duration, hits,
          pausedStart, pausedEnd, stationaryStart, stationaryEnd, missesBeforePause: misses, missesAfterPause: r.misses};
      }, {stage, mode});
      assert.equal(result.source, 'verified-blob', `${stage}/${mode}: actual verified media blob is playing`);
      assert(result.hits.length >= 3 && result.hits.every(hit => hit.pressed && hit.status === 'perfect'), `${stage}/${mode}: first/middle/last/hold attacks judge PERFECT on the actual media clock: ${JSON.stringify(result.hits)}`);
      assert(result.hits.every(hit => Math.abs(hit.errorMs) < 75 && hit.deltaMs < 75), `${stage}/${mode}: media-seek origin matches measured note timestamps`);
      assert(result.hits.filter(hit => hit.hold).every(hit => hit.holding && hit.released && hit.holdDone && !hit.holdBroken), `${stage}/${mode}: real hold release completes at the media tail`);
      assert.equal(result.pausedEnd, result.pausedStart, `${stage}/${mode}: paused media does not advance the cue clock`);
      assert(Math.abs(result.stationaryEnd - result.stationaryStart) < .000001, `${stage}/${mode}: a stationary media clock does not advance the cue clock`);
      assert.equal(result.missesAfterPause, result.missesBeforePause, `${stage}/${mode}: paused/stationary media consumes no notes`);
      report.push(result);
      console.log(stage, mode, 'PASS', JSON.stringify({notes: result.noteCount, source: result.source, hits: result.hits.map(hit => ({index: hit.index, deltaMs: +hit.deltaMs.toFixed(3), hold: hit.hold})), audioStart: result.audioStart, outputDelay: result.outputDelay}));
    }
  }
  assert.deepEqual(errors, [], 'No browser errors in real-media timing audit');
  await context.close();
} finally { await browser.close(); }
await fs.mkdir(path.join(root, '.qa/moth/rhythm-review'), {recursive: true});
await fs.writeFile(path.join(root, `.qa/moth/rhythm-review/actual-media-timing${riverOnly ? '-river' : smoke ? '-smoke' : ''}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(`PASS actual media clock: ${riverOnly ? 'river/both modes' : smoke ? 'level 1 smoke check' : 'all nine arenas/both modes'}; first/middle/last attacks, holds, seek origins, pause and stationary playhead. This is local software validation, not physical output/controller latency measurement.`);
