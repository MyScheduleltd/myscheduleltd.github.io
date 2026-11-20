// Software timing audit using the actual decoded/playing media of every
// stage, with real input and hold-release handlers. No physical latency claim.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/data/level1.json'), 'utf8'));
const stages = ['level1-stage1', 'level2-stage2', 'level3-stage2', 'level4-stage1', 'studio-stage1', 'level5-stage2', 'level6-stage2', ...config.secretLevels.map(level => level.id)];
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const smoke = process.argv.includes('--smoke');
const riverOnly = process.argv.includes('--river');
const useFullSongs = process.argv.includes('--full-songs');
const bothArrangements = process.argv.includes('--both-arrangements');
const easyOnly = process.argv.includes('--easy-only');
const phone = process.argv.includes('--phone');
const screenshots = process.env.MOTH_MEDIA_SCREENSHOTS && path.resolve(process.env.MOTH_MEDIA_SCREENSHOTS);
const storyKeys = Object.fromEntries(stages.slice(0, 7).map((stage, index) => [stage,
  ['level1OfficeRhythm', 'level2BathroomRhythm', 'level3MassageRhythm', 'level4ArcadeRhythm',
    'level5StudioRhythm', 'level5RiverRhythm', 'level6ConcertRhythm'][index]]));
const report = [];
const browser = await (phone ? webkit : chromium).launch(phone ? {headless: true} : {
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
try {
  const context = await browser.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1280, height: 800},
    isMobile: phone, hasTouch: phone});
  await stubScoreboard(context);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(new URL('moth/staff/?device=' + (phone ? 'phone' : 'desktop'), base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 90000});
  await page.evaluate(() => {
    window.__mediaTimingUpdate = bobbyGame.update;
    bobbyGame.debugUnlockAllStages();
    bobbyGame.progress.flags.debugSecretLevelsUnlocked = true;
  });
  for (const fullSongs of bothArrangements ? [false, true] : [useFullSongs]) {
  for (const stage of riverOnly ? ['level5-stage2'] : smoke ? stages.slice(0, 1) : stages) {
    for (const mode of smoke || easyOnly ? ['chill'] : ['chill', 'shoot']) {
      await page.evaluate(({stage, mode, fullSongs}) => {
        const g = bobbyGame;
        g.update = window.__mediaTimingUpdate;
        g.setDifficulty(mode, {persist: false, announce: false});
        g.startStage(stage, {freePlay: true, fromLevelSelection: fullSongs, skipAudio: false});
      }, {stage, mode, fullSongs});
      await page.waitForFunction(stage => {
        const g = bobbyGame, r = g.level1OfficeRhythm, track = r && g.getActiveLevel1OfficeRhythmAudio();
        return g.currentStageId === stage && g.state === 'playing' && r?.tutorial?.mode === 'done'
          && !g.levelLoadingPresentation && !(g.stageCountdown > 0) && !r.audioStartPending && !r.audioStarting && !r.songHandover
          && !g.audioInterruption && !g.audioRecovering && !g.audioRecoveryVisible()
          && track && !track.paused && track.readyState >= 3 && !track.seeking;
      }, stage, {timeout: 120000});
      if (stage === 'level1-stage1' && mode === 'chill') {
        await page.waitForFunction(() => bobbyGame.getLevel1OfficeRenderTime() > .15);
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
        const spec = g.getActiveRhythmSpec();
        g.update = () => {}; // Keep normal judgment updates from consuming sought notes.
        r.phaseIntroTimer = 0;
        delete r.frozenSongTime;
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
        const rapidIndex = r.notes.findIndex((note, index) => index > 0 && note.time - r.notes[index - 1].time < .19 - 1e-5);
        const indexes = [...new Set([0, ...'MOTH'.split('').map(button => r.notes.findIndex(note => note.button === button)),
          Math.floor(r.notes.length / 2), r.notes.length - 1, holdIndex,
          ...(rapidIndex > 0 ? [rapidIndex - 1, rapidIndex] : [])].filter(i => i >= 0))];
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
        // WebKit applies a playback-rate change asynchronously. Let that
        // update reach the media pipeline before sampling the frozen clock.
        await new Promise(resolve => setTimeout(resolve, 100));
        const stationaryStart = g.getLevel1OfficeRenderTime();
        const stationaryMediaStart = track.currentTime;
        await new Promise(resolve => setTimeout(resolve, 100));
        const stationaryEnd = g.getLevel1OfficeRenderTime();
        const stationaryMediaEnd = track.currentTime;
        track.playbackRate = 1;
        track.pause();
        track.volume = BGM_VOLUME;
        // Let the audio graph render the scheduled gain before reading it.
        await new Promise(resolve => setTimeout(resolve, 80));
        const musicGain = g.musicAudioRoutes.get(track)?.gain.gain.value;
        return {stage, mode, source: track.currentSrc.startsWith('blob:') ? 'verified-blob' : track.currentSrc,
          rows: r.notes.map(note => [note.time, note.button, note.holdEnd ?? null]),
          noteCount: r.notes.length, audioStart: g.getRhythmAudioStart(), manualOffset: g.getAudioOffsetSeconds(),
          mediaSource: g.canonicalAudioSource(track), fullSong: spec.fullSong,
          expectedSource: mode === 'chill' ? spec.easyAudioSrc : (spec.fightCut?.src || spec.audioSrc),
          warmup: track.mothFightLead || 0, outputDelay: g.getRhythmOutputDelay(), readyState: track.readyState,
          duration: track.duration, musicGain, hits,
          pausedStart, pausedEnd, stationaryStart, stationaryEnd, stationaryMediaStart, stationaryMediaEnd,
          missesBeforePause: misses, missesAfterPause: r.misses};
      }, {stage, mode});
      result.arrangement = fullSongs ? 'level-select' : 'story';
      assert.equal(result.source, 'verified-blob', `${stage}/${mode}: actual verified media blob is playing`);
      assert.equal(result.mediaSource, result.expectedSource, `${stage}/${mode}: difficulty-specific audio source`);
      assert.equal(Math.round(result.musicGain * 1000) / 1000, mode === 'chill' ? 1 : .5,
        `${stage}/${mode}: gameplay music gain`);
      const expectedSpec = fullSongs ? config.stageSelectRhythms[stage]
        : config[storyKeys[stage]] || config.secretLevels.find(level => level.id === stage)?.rhythm;
      assert(expectedSpec, stage + ': generated arrangement exists');
      const unit = expectedSpec.chart.stepBeats * 60 / expectedSpec.bpm;
      const expectedRows = expectedSpec.chart[mode === 'chill' ? 'easy' : 'hard'];
      assert.equal(result.rows.length, expectedRows.length, `${stage}/${mode}: runtime row count matches the generated arrangement`);
      const mismatches = result.rows.flatMap(([time, button, tail], index) => {
        const [step, expectedButton, hold] = expectedRows[index];
        const expectedTime = expectedSpec.beatOffset + step * unit;
        const expectedTail = hold ? expectedTime + hold * unit : null;
        return button !== expectedButton || Math.abs(time - expectedTime) > .000002
          || (expectedTail === null ? tail !== null : tail === null || Math.abs(tail - expectedTail) > .000002) ? [index] : [];
      });
      assert.deepEqual(mismatches, [], `${stage}/${mode}: every runtime button, attack and hold tail matches generated data`);
      result.runtimeRowsMatched = result.rows.length;
      delete result.rows;
      const expectedButtons = [...new Set(expectedRows.map(row => row[1]))].sort();
      assert.deepEqual([...new Set(result.hits.map(hit => hit.button))].sort(), expectedButtons,
        `${stage}/${mode}: every charted M/O/T/H button is exercised against the playing media`);
      if (fullSongs) {
        const spec = config.stageSelectRhythms[stage];
        assert.equal(result.fullSong, true);
        assert.equal(result.audioStart, result.warmup);
        assert(Math.abs(result.duration - result.warmup - spec.duration) < .05, `${stage}/${mode}: exact full mix duration after decoder preparation`);
        assert.equal(result.noteCount, spec.chart[mode === 'shoot' ? 'hard' : 'easy'].length);
      }
      assert(result.hits.length >= 3 && result.hits.every(hit => hit.pressed && hit.status === 'perfect'), `${stage}/${mode}: first/middle/last/hold attacks judge PERFECT on the actual media clock: ${JSON.stringify(result.hits)}`);
      assert(result.hits.every(hit => Math.abs(hit.errorMs) < 75 && hit.deltaMs < 75), `${stage}/${mode}: media-seek origin matches measured note timestamps`);
      assert(result.hits.filter(hit => hit.hold).every(hit => hit.holding && hit.released && hit.holdDone && !hit.holdBroken), `${stage}/${mode}: real hold release completes at the media tail`);
      assert.equal(result.pausedEnd, result.pausedStart, `${stage}/${mode}: paused media does not advance the cue clock`);
      assert(Math.abs(result.stationaryEnd - result.stationaryStart) < .000001,
        `${stage}/${mode}: a stationary media clock does not advance the cue clock: ` +
        JSON.stringify({cue: [result.stationaryStart, result.stationaryEnd], media: [result.stationaryMediaStart, result.stationaryMediaEnd]}));
      assert.equal(result.missesAfterPause, result.missesBeforePause, `${stage}/${mode}: paused/stationary media consumes no notes`);
      report.push(result);
      console.log(stage, fullSongs ? 'full-song' : 'story', mode, 'PASS', JSON.stringify({notes: result.noteCount, source: result.source, hits: result.hits.map(hit => ({index: hit.index, button: hit.button, deltaMs: +hit.deltaMs.toFixed(3), hold: hit.hold})), audioStart: result.audioStart, outputDelay: result.outputDelay}));
      if (screenshots && mode === 'chill' && ['level3-stage2', 'level4-stage1', 'secret-xiaosi'].includes(stage)) {
        await page.evaluate(() => {
          const g = bobbyGame, r = g.level1OfficeRhythm;
          let index = 0, rank = -1;
          for (let i = 0; i < r.notes.length; i++) {
            const visible = r.notes.slice(i).filter(note => note.time - r.notes[i].time < 1.15);
            const score = new Set(visible.map(note => note.button)).size * 100 + visible.length;
            if (score > rank) { rank = score; index = i; }
          }
          for (const note of r.notes) { note.status = 'pending'; note.holding = false; note.holdBroken = false; }
          r.frozenSongTime = r.notes[index].time - .2;
          r.phaseIntroTimer = 0;
          g.render();
        });
        await fs.mkdir(screenshots, {recursive: true});
        await page.screenshot({path: path.join(screenshots, `${phone ? 'webkit-phone' : 'chrome-desktop'}-${stage}-${fullSongs ? 'full' : 'story'}.png`)});
      }
    }
  }
  }
  assert.deepEqual(errors, [], 'No browser errors in real-media timing audit');
  await context.close();
} finally { await browser.close(); }
const output = path.resolve(process.env.MOTH_MEDIA_AUDIT_OUTPUT || path.join(root,
  `.qa/moth/rhythm-review/actual-media-timing${riverOnly ? '-river' : smoke ? '-smoke' : ''}.json`));
await fs.mkdir(path.dirname(output), {recursive: true});
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`PASS actual media clock: ${report.length} arrangements/difficulties; every runtime row and charted button, first/middle/last attacks, holds, seek origins, pause and stationary playhead. This is local software validation, not physical output/controller latency measurement.`);
