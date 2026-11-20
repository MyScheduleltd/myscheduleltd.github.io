// Verify variety without weakening the measured drum chart or vocal chart.
// --source-only can run before the combined build has generated the new data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {remixEasyLanes, summarizeEasyLanes} from './moth-easy-lanes.mjs';
import {measureEasyLaneChanges} from './moth-easy-difficulty.mjs';
import {FUNK_CHARTS, MOTH_STAGE_THEMES, MOTH_OPENING_LEAD_SECONDS, MOTH_CHART_VERSION} from './moth-chart-patches.mjs';

const sourceOnly = process.argv.includes('--source-only');
const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/data/level1.json')));
const sourceBefore = JSON.stringify(FUNK_CHARTS);
const report = [];
const levels = Object.entries(MOTH_STAGE_THEMES).map(([id, [stage]]) => ({id, stage, story: config[id]}))
  .concat(config.secretLevels.map(({id, rhythm}) => ({id, stage: id, story: rhythm})));
assert.equal(levels.length, 9);
for (const {id, stage, story} of levels) {
  const song = FUNK_CHARTS.songs[id];
  const hardBefore = JSON.stringify(song.hard);
  const start = story.fightCut?.fromSeconds || 0;
  const end = start + story.duration - (story.fightCut ? .08 : 0);
  const options = {storyStart: start, storyEnd: end, openingLeadSeconds: MOTH_OPENING_LEAD_SECONDS};
  const mixed = remixEasyLanes(song, options);
  const repeated = remixEasyLanes(structuredClone(song), options);
  assert.deepEqual(mixed.rows, repeated.rows, id + ' deterministic independent rebuild');
  assert.equal(mixed.rows.length, song.easy.length, id + ' keeps every source head');
  assert(mixed.rows.some((row, index) => row[1] !== song.easy[index][1]), id + ' actually remixes letters');
  let recurrentHeads = 0;
  const motifs = new Map();
  for (const [index, row] of mixed.rows.entries()) {
    assert.equal(row[0], song.easy[index][0], id + ' attack ' + index);
    assert.equal(row[2], song.easy[index][2], id + ' hold ' + index);
    assert.match(row[1], /^[MOTH]$/);
    // Independently identify the nearest source sixteenth inside the full
    // riff cycle; returning attacks must retain their original mixed letter.
    const tick = Math.round((row[0] - song.meter.firstDownbeat) * song.bpm / 60 * 4);
    const period = song.meter.riffBars * 16;
    const motif = ((tick % period) + period) % period;
    if (motifs.has(motif)) {
      assert.equal(row[1], motifs.get(motif), id + ' returning riff letter ' + motif);
      recurrentHeads++;
    } else motifs.set(motif, row[1]);
  }
  assert(recurrentHeads > song.easy.length / 2, id + ' recurrence coverage');
  assert.equal(JSON.stringify(song.hard), hardBefore, id + ' vocal chart remains untouched');
  for (const [arrangement, from, to, spec] of [
    ['Story', start + MOTH_OPENING_LEAD_SECONDS, end, story],
    ['Level Select', MOTH_OPENING_LEAD_SECONDS, song.duration, config.stageSelectRhythms[stage]]
  ]) {
    const rows = mixed.rows.filter(([time]) => time >= from && time < to);
    const before = summarizeEasyLanes(song.easy.filter(([time]) => time >= from && time < to));
    const after = summarizeEasyLanes(rows);
    assert(Object.values(after.counts).every(count => count >= after.notes * .15 && count <= after.notes * .35),
      id + '/' + arrangement + ' every letter stays within15–35%');
    assert(after.maxRun <= 3, id + '/' + arrangement + ' no long single-key run');
    assert.equal(after.narrow8, 0, id + '/' + arrangement + ' every8 heads use at least2 letters');
    assert.equal(after.missing24, 0, id + '/' + arrangement + ' every24 heads use all4 letters');
    assert(after.max16 <= 8, id + '/' + arrangement + ' no single key dominates a16-head passage');
    const ease = measureEasyLaneChanges(rows);
    assert(ease.longestRapidChangeRun <= 2, id + '/' + arrangement + ' no extended rapid button-change run');
    const density = song.easyDifficulty.windows[arrangement === 'Story' ? 'story' : 'full'];
    assert.equal(rows.length, density.selected, id + '/' + arrangement + ' measured Easy selection count');
    assert(Math.abs(rows.length - density.baseline * .8) <= .5,
      id + '/' + arrangement + ' about20% fewer playable heads than the published chart');
    if (!sourceOnly) {
      const nativeStart = arrangement === 'Story' ? start : 0;
      const unit = spec.chart.stepBeats * 60 / spec.bpm;
      assert.equal(spec.chart.version, MOTH_CHART_VERSION);
      assert.equal(spec.chart.easy.length, rows.length);
      spec.chart.easy.forEach(([step, letter, holdSteps], index) => {
        const [time, button, hold] = rows[index];
        assert.equal(letter, button, id + '/' + arrangement + ' projected key ' + index);
        assert(Math.abs(nativeStart + spec.beatOffset + step * unit - time) < .000002);
        assert(Math.abs(holdSteps * unit - hold) < .000002 || time + hold >= to);
      });
      const expectedHard = song.hard.filter(([time]) => time >= from && time < to);
      assert.equal(spec.chart.hard.length, expectedHard.length);
      spec.chart.hard.forEach(([step, letter, holdSteps], index) => {
        const [time, button, hold] = expectedHard[index];
        assert.equal(letter, button, id + '/' + arrangement + ' original Hard key ' + index);
        assert(Math.abs(nativeStart + spec.beatOffset + step * unit - time) < .000002);
        assert(Math.abs(holdSteps * unit - hold) < .000002 || time + hold >= to);
      });
    }
    report.push({id, arrangement, before, after, laneChanges: ease, density, recurrentHeads});
  }
}
assert.equal(JSON.stringify(FUNK_CHARTS), sourceBefore, 'Raw source transcription was not mutated');
const out = path.join(root, '.qa/moth/correct-stems-20261119');
await fs.mkdir(out, {recursive: true});
await fs.writeFile(path.join(out, 'lane-verification.json'), JSON.stringify({version: MOTH_CHART_VERSION,
  sourceSha256: createHash('sha256').update(sourceBefore).digest('hex'), sourceOnly, charts: report}, null, 2) + '\n');
console.log('PASS', report.length, 'Easy arrangements:20% fewer heads, manageable gestures, balanced letters, exact source timing/holds and fresh Hard');
for (const row of report) console.log(row.id, row.arrangement, JSON.stringify(row.after));
