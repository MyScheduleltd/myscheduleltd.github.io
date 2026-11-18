// Verify both runtime arrangements against the measured full-mix timestamps.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FUNK_CHARTS, MOTH_STAGE_THEMES, MOTH_CHART_VERSION, MOTH_OPENING_LEAD_SECONDS} from './moth-chart-patches.mjs';
import {SCOREBOARD_CHART_VERSION} from './moth-scoreboard-client.mjs';
import {remixEasyLanes} from './moth-easy-lanes.mjs';

const read = file => readFile(new URL('../' + file, import.meta.url));
const config = JSON.parse(await read('docs/moth/data/level1.json'));
const limits = JSON.parse(await read('services/moth-scoreboard/chart-limits.json'));
assert.equal(config.rhythmChartVersion, MOTH_CHART_VERSION);
assert.equal(SCOREBOARD_CHART_VERSION, MOTH_CHART_VERSION);
assert.equal(limits.version, MOTH_CHART_VERSION);
const levels = Object.entries(MOTH_STAGE_THEMES).map(([id, [stage, theme]]) => ({id, stage, theme, story: config[id]}))
  .concat(config.secretLevels.map(({id, theme, rhythm}) => ({id, stage: id, theme, story: rhythm})));
assert.equal(levels.length, 9);
assert.deepEqual(Object.keys(config.stageSelectRhythms).sort(), levels.map(level => level.stage).sort());
assert.deepEqual(Object.keys(limits.stages).sort(), levels.map(level => level.stage).sort());
const report = [];
for (const {id, stage, theme, story} of levels) {
  const song = FUNK_CHARTS.songs[id];
  const storyOrigin = story.fightCut?.fromSeconds || 0;
  const easy = remixEasyLanes(song, {storyStart: storyOrigin,
    storyEnd: storyOrigin + story.duration - (story.fightCut ? .08 : 0), openingLeadSeconds: MOTH_OPENING_LEAD_SECONDS});
  const selection = config.stageSelectRhythms[stage];
  assert.equal(selection.fullSong, true, id);
  assert.equal(selection.audioStartSeconds, 0, id);
  assert.equal(selection.duration, song.duration, id);
  assert.equal(selection.audioSrc, song.audioSrc, id);
  assert.equal(selection.theme, theme, id);
  assert(!selection.fightCut, id);
  assert.equal(selection.beatOffset, song.meter.firstDownbeat, id);
  assert.equal(createHash('sha256').update(await read('docs/moth/' + song.audioSrc)).digest('hex'), song.mixSha256, id);
  if (id === 'level5RiverRhythm') {
    assert.equal(story.fightCut.fromSeconds, 10);
    assert.equal(story.fightCut.toSeconds, 164);
  }
  for (const [kind, spec] of [['Story', story], ['Level Select', selection]]) {
    const start = spec.fightCut?.fromSeconds || 0;
    const end = start + spec.duration - (spec.fightCut ? .08 : 0);
    assert.equal(spec.bpm, song.bpm, id);
    assert.equal(spec.chart.version, MOTH_CHART_VERSION, id);
    assert.equal(spec.openingLeadSeconds, MOTH_OPENING_LEAD_SECONDS, id);
    assert.equal(spec.fadeInSeconds, MOTH_OPENING_LEAD_SECONDS, id);
    const sourceRoles = {easy: 'isolated-drum-stem', hard: 'lead-vocal'};
    if (id === 'level5RiverRhythm') sourceRoles.opening = 'bass-riff';
    if (song.extendedRests) sourceRoles.extendedRests = 'bass-stem';
    assert.deepEqual(spec.chart.sourceRoles, sourceRoles);
    for (const [mode, scoreMode] of [['easy', 'chill'], ['hard', 'shoot']]) {
      const rows = spec.chart[mode];
      const expected = (mode === 'easy' ? easy.rows : song.hard)
        .filter(([time]) => time >= start + MOTH_OPENING_LEAD_SECONDS && time < end);
      assert.equal(rows.length, expected.length, id);
      assert(expected[0][0] - start >= MOTH_OPENING_LEAD_SECONDS,
        `${id}/${kind}/${mode} leaves the opening music unjudged`);
      const unit = spec.chart.stepBeats * 60 / spec.bpm;
      const minimumGap = mode === 'hard' ? .18999 : .22499;
      rows.forEach(([step, key, holdSteps], index) => {
        const time = start + spec.beatOffset + step * unit;
        const [onset, button, holdSeconds] = expected[index];
        assert(Math.abs(time - onset) < .000002, `${id}/${kind}/${mode} onset ${index}`);
        assert.equal(key, button);
        assert.match(key, /^[MOTH]$/);
        const tail = onset + holdSeconds;
        assert(Math.abs(time + holdSteps * unit - (tail < end ? tail : onset)) < .000002,
          `${id}/${kind}/${mode} release ${index}`);
        if (index) assert(onset - expected[index - 1][0] - expected[index - 1][2] >= minimumGap, id);
      });
      const holds = rows.filter(row => row[2] > 0).length;
      if (id === 'level5RiverRhythm') {
        // The short first Story vocal sustain was inside the new musical
        // intro. The remaining opening stays on the source bass/vocal attacks.
        const openingRows = expected.filter(([time]) => time < start + 10);
        assert(openingRows.some(row => row[2] === 0),
          `Level 6 ${kind}/${mode} retains opening source attacks after the lead-in`);
        if (kind === 'Level Select') assert(holds > 0,
          `Level 6 ${kind}/${mode} retains source holds outside the lead-in`);
      } else assert.equal(holds, 0, id);
      const cap = kind === 'Level Select' ? limits.stages[stage][scoreMode] : limits[scoreMode][stage];
      if (cap !== undefined) assert.equal(cap, (rows.length + holds) * 1000, `${stage} ${kind} score cap`);
      report.push({id, arrangement:kind, mode, notes:rows.length, holds, firstHit:expected[0][0] - start, duration:spec.duration});
    }
  }
}
console.log('PASS', report.length, 'Story/Level Select charts: exact mix identities, onsets, full durations and score caps');
console.log(JSON.stringify(report));
