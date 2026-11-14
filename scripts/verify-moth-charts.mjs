// Verify shipped rows against measured source attacks, audio hashes and clocks.
// No network, music playback, score submission or original-master modification.
// --measurements also checks the locally retained transcription independently
// of the per-row evidence embedded in the generated build input.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { DRUM_CHARTS, BASE_DRUM_CHARTS, PRIOR_DRUM_CHARTS, MOTH_CHART_VERSION } from './moth-chart-patches.mjs';
import { SCOREBOARD_CHART_VERSION } from './moth-scoreboard-client.mjs';

const root = new URL('../', import.meta.url);
const read = file => fs.readFile(new URL(file, root));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const config = JSON.parse(await read('docs/moth/data/level1.json'));
const source = await read('.qa/moth/published/data/level1.json');
assert.equal(sha(source), DRUM_CHARTS.baselineSha256, 'Authored density derives from the immutable release');
assert.equal(config.rhythmChartVersion, MOTH_CHART_VERSION);
assert.equal(SCOREBOARD_CHART_VERSION, MOTH_CHART_VERSION, 'Score submission uses this chart version');
const entries = Object.entries(config).filter(([, spec]) => spec?.chart?.easy)
  .concat(config.secretLevels.map(level => [level.id, level.rhythm]));
assert.equal(entries.length, 9);
const report = [];
for (const [id, spec] of entries) {
  const measured = DRUM_CHARTS.songs[id];
  const playing = spec.fightCut?.src || spec.audioSrc || config.audioSrc;
  assert.equal(sha(await read('docs/moth/' + playing)), measured.hashes.playing, id + ': unchanged analyzed AAC/cut');
  assert.equal(spec.chart.version, MOTH_CHART_VERSION);
  assert.equal(spec.chart.timingMode, 'waveform-attacks');
  assert.equal(spec.chart.selectionVersion, measured.selectionVersion, id + ': current drum selection');
  assert.equal(measured.refinementVersion, 'energy-boundary-v2', id + ': significant drum boundaries replace pre-noise slope picks');
  assert(!spec.chart.breakNotes && !spec.chart.introSources, id + ': no melodic/filler exception');
  assert(Math.abs(measured.tempo.measuredBpm - spec.bpm) < .02, id + ': whole-song tempo fit');
  assert(measured.tempo.broadPeaks[String(measured.tempo.subdivision)].some(peak => Math.abs(peak.bpm - spec.bpm) < .08), id + ': authored tempo is a broad-range peak');
  assert.equal(measured.alignment.length, 5);
  for (const check of measured.alignment) {
    assert(Math.abs(check.lagMs) <= .024, id + ': sampled master/AAC alignment within one decoded sample');
    assert(check.correlation > .94, id + ': usable correlation');
  }
  const cache = process.argv.includes('--measurements')
    ? JSON.parse(await read('.qa/moth/drum-sync-20261029/' + id + '-measured.json')) : null;
  if (cache) {
    assert.deepEqual(cache.hashes, BASE_DRUM_CHARTS.songs[id].hashes, id + ': measured source identity');
    assert.equal(cache.refinementVersion, measured.refinementVersion, id + ': current detector measurement cache');
  }
  const unit = 60 / spec.bpm * spec.chart.stepBeats;
  if (id === 'level5RiverRhythm') {
    assert.equal(spec.fightCut.fromSeconds, 10, 'Owner-confirmed verse 1 entrance around 00:10');
    assert.equal(spec.fightCut.toSeconds, 164, 'Owner-confirmed chorus 2 ending around 02:44');
    assert(Math.abs(spec.duration + spec.fightCut.fadeSeconds - 154) < .00001, 'The ending fade stays inside the requested 154-second section');
    assert.equal(spec.fullSong, false);
    assert.equal(spec.phases[0].start, 0);
    assert.equal(spec.phases.at(-1).end, spec.duration);
    const beat = 60 / spec.bpm;
    const quarterError = (measured.quarterGrid.sourcePhaseSeconds - spec.audioStartSeconds - spec.beatOffset) / beat;
    assert(Math.abs(quarterError - Math.round(quarterError)) < 1e-9, 'River visual quarter pulse follows the measured snare phase');
    assert(measured.evidence.easy[0].time > 15 && measured.evidence.easy[0].time < 16
      && measured.evidence.hard[0].time > 15 && measured.evidence.hard[0].time < 16,
      'Verse opening remains drumless; both charts enter with the recorded drums');
  }
  for (const mode of ['easy', 'hard']) {
    const rows = spec.chart[mode], evidence = measured.evidence[mode];
    assert.deepEqual(rows, measured[mode], id + '/' + mode + ': shipped chart');
    assert.equal(rows.length, evidence.length);
    const prior = PRIOR_DRUM_CHARTS.songs[id];
    const phraseCounts = events => {
      const counts = {};
      for (const event of events) {
        const phrase = Math.floor((event.time - spec.beatOffset) / (unit * 32));
        counts[phrase] = (counts[phrase] ?? 0) + 1;
      }
      return counts;
    };
    assert.deepEqual(phraseCounts(evidence), phraseCounts(prior.evidence[mode]), id + '/' + mode + ': same density in every eight-beat phrase');
    assert.deepEqual(rows.filter(row => row[2] > 0), prior[mode].filter(row => row[2] > 0), id + '/' + mode + ': exact original hold starts and ends');
    const priorIds = new Set(prior.evidence[mode].map(event => `${event.instrument}:${event.proposalAttack}`));
    const accentsChanged = evidence.filter(event => !priorIds.has(`${event.instrument}:${event.proposalAttack}`)).length;
    assert(accentsChanged > 0, id + '/' + mode + ': groove selection revisits this chart');
    let largestEncodingErrorMs = 0;
    for (let index = 0; index < rows.length; index++) {
      const [step, button, hold] = rows[index], event = evidence[index];
      const time = spec.beatOffset + step * unit;
      assert.equal(button, event.button);
      assert.equal(event.instrument, spec.chart.drumInstruments[button]);
      assert.equal(event.source, 'isolated-drums');
      assert(Number.isFinite(event.proposalAttack) && event.onsetContrast >= .5 && !event.onsetEdge,
        id + ': significant, bounded drum attack; ambiguous classifier events require review');
      assert(event.drumRms > 0 && event.masterRiseSupport > 0, id + ': measured transient in the source drum band');
      if (!priorIds.has(`${event.instrument}:${event.proposalAttack}`)) {
        assert(event.drumRms >= .005 && (event.drumEnergyShare >= .02 || event.masterRiseSupport >= .25),
          id + ': selected new accents have audible support in the mix');
      }
      const encodingError = Math.abs(time - event.time) * 1000;
      largestEncodingErrorMs = Math.max(largestEncodingErrorMs, encodingError);
      assert(encodingError < .001, id + '/' + mode + ': waveform time retained in row encoding');
      assert(Math.abs(time + (spec.audioStartSeconds || 0) - event.attack) < .000002, id + ': correct full-song/cut origin');
      if (cache) {
        const raw = cache.refinements[event.instrument].find(hit => Math.abs(hit.proposal - event.proposalAttack) < .00001);
        assert(raw && Math.abs(raw.time - event.attack) < .000002, id + ': head matches retained measured proposal and attack');
      }
      assert(time >= 0 && time + hold * unit <= spec.duration, id + ': head and hold inside song');
      assert(!measured.restSections.some(([lo, hi]) => time > lo && time < hi), id + ': no head during excluded drumless passage');
      if (index + 1 < rows.length) {
        const gap = (rows[index + 1][0] - step) * unit;
        const minimum = mode === 'hard' ? Math.max(.224, Math.min(.28, unit * 4 * .45)) : .224;
        assert(gap >= minimum - .000002, id + ': readable tap spacing');
        if (hold) assert(gap - hold * unit >= .2 - .000002, id + ': clear hold tail and release gap');
      }
      if (mode === 'hard') {
        const repeated = rows.slice(index + 1).find(next => next[1] === button);
        if (repeated) assert((repeated[0] - step) * unit >= .30 - .000002, id + ': same-button recovery');
        if (index + 4 < rows.length) assert((rows[index + 4][0] - step) * unit >= 1 - .000002, id + ': at most four heads per rolling second');
      }
    }
    report.push({id, mode, heads: rows.length, holds: rows.filter(row => row[2] > 0).length, accentsChanged,
      bpm: spec.bpm, measuredBpm: measured.tempo.measuredBpm, maximumEncodingRoundtripMs: +largestEncodingErrorMs.toFixed(6),
      largestSampledCodecLagMs: Math.max(...measured.alignment.map(check => Math.abs(check.lagMs))), independentTranscriptionChecked: Boolean(cache)});
  }
}
await fs.writeFile(new URL('.qa/moth/drum-sync-20261029/note-audit.json', root), JSON.stringify(report, null, 2) + '\n');
console.log('PASS chart audit: nine songs, eighteen charts; audio hashes, BPM and AAC/master alignment, audible source attacks, preserved phrase counts and holds, cut origins, drumless rests and Hard recovery');
console.log(JSON.stringify(report));
