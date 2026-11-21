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
  // Feel charts (author-moth-feel.py) keep their authored letters: the same drum is always the same button.
  const easy = song.feel ? {rows: song.easy} : remixEasyLanes(song, {storyStart: storyOrigin,
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
      const minimumGap = mode === 'hard' ? .12499 : song.feel ? .11999 : .18999;
      // Grid charts (author-moth-feel.py): every note on the song's beat grid,
      // 16ths (swung 16ths in the measured swung bars) and in Hard triplets, as
      // rhythm games chart; Easy's main hits at least an 8th apart (owner, 2026-11-21).
      const swingAt = time => {
        const g = song.grid, k = Math.floor((time - g.first) * g.bpm / 60 + 1e-6);
        return g.swing && g.swingBars.includes(Math.floor((k + .5) / 4)) ? g.swing : .5;
      };
      // Easy sits on the grid, or exactly on a drum hit more than 15 ms off it
      // (grid.drumTimed); Hard follows the singer exactly (grid.hard 'sung').
      const onGrid = time => {
        const g = song.grid, beat = 60 / g.bpm, position = (time - g.first) / beat, d = g.division || 4;
        const k = Math.floor(position + 1e-6), frac = position - k, s = swingAt(time);
        const straight = s !== .5 ? [0, s / 2, s, (1 + s) / 2, 1] : Array.from({length: d + 1}, (_, i) => i / d);
        const triplet = Array.from({length: d * 3 / 4 + 1}, (_, i) => i / (d * 3 / 4));
        const sets = mode === 'easy' ? [straight] : [straight, triplet];
        return sets.some(set => set.some(p => Math.abs(frac - p) * beat < .00002))
          || (mode === 'easy' && (g.drumTimed || []).some(t => Math.abs(t - time) < .00002));
      };
      const gridded = song.grid && !(mode === 'hard' && song.grid.hard === 'sung');
      const easyGap = time => {
        const s = swingAt(time), beat = 60 / song.grid.bpm;
        return s === .5 && beat / 4 >= .19 - 1e-9 ? beat / 4 : Math.min(s, 1 - s) * beat;
      };
      rows.forEach(([step, key, holdSteps], index) => {
        const time = start + spec.beatOffset + step * unit;
        const [onset, button, holdSeconds] = expected[index];
        assert(Math.abs(time - onset) < .000002, `${id}/${kind}/${mode} onset ${index}`);
        assert.equal(key, button);
        assert.match(key, /^[MOTH]$/);
        if (gridded) assert(onGrid(onset), `${id}/${mode} note ${index} at ${onset} sits on the song's grid or its drum hit`);
        if (song.grid && mode === 'easy' && index) {
          assert(onset - expected[index - 1][0] >= Math.max(.12, easyGap(onset) - .065) - .00002,
            `${id}/easy note ${index}: main hits an 8th apart (a 16th in slow songs), less a drum's own timing`);
        }
        const tail = onset + holdSeconds;
        assert(Math.abs(time + holdSteps * unit - (tail < end ? tail : onset)) < .000002,
          `${id}/${kind}/${mode} release ${index}`);
        if (index) {
          const previous = expected[index - 1];
          const gap = onset - previous[0] - previous[2];
          assert(gap >= minimumGap, id);
          if (mode === 'hard' && gap < .18999 && !song.grid) {
            const evidence = song.hardTimingExceptions?.find(pair => Math.abs(pair.previousTime - previous[0]) < .00001
              && Math.abs(pair.time - onset) < .00001);
            assert(evidence, id + ' short vocal pair has independent source evidence');
            for (const support of [evidence.before, evidence.after]) {
              assert(support.strong && support.depth < .35 && support.energy > .16,
                id + ' both fast syllables have a real voiced-body reset');
            }
          }
          if (mode === 'easy' && song.feel) {
            // Easy as the drum kit: quick pairs, never three in a row, the same button at least 160 ms apart.
            const before = expected[index - 2];
            assert(!(before && gap < .18999 && previous[0] - before[0] - before[2] < .18999), id + ' no three quick notes in a row');
            if (previous[1] === button) assert(onset - previous[0] >= .15999, id + ' same button again too soon');
          } else if (mode === 'easy' && gap < .22499) {
            const evidence = song.easyTimingExceptions?.find(pair => Math.abs(pair.previousTime - previous[0]) < .00001
              && Math.abs(pair.time - onset) < .00001);
            assert(evidence, id + ' quick drum fill has measured source evidence');
            assert(evidence.before.drumFillAccent || evidence.after.drumFillAccent, id + ' source burst accent');
            for (const support of [evidence.before,evidence.after]) assert(
              ['kick','snare','percussion'].includes(support.drumVoice) && support.drumSalience >= .65,
              id + ' quick fill retains two strong physical drum strokes');
          }
        }
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
      } else if (song.feel) {
        assert(rows.every(row => row[2] === 0 || mode === 'hard' || row[1] === 'H'), id + ' Easy holds are big moments or bass on H');
      } else assert.equal(holds, 0, id);
      const cap = kind === 'Level Select' ? limits.stages[stage][scoreMode] : limits[scoreMode][stage];
      if (cap !== undefined) assert.equal(cap, (rows.length + holds) * 1000, `${stage} ${kind} score cap`);
      report.push({id, arrangement:kind, mode, notes:rows.length, holds, firstHit:expected[0][0] - start, duration:spec.duration});
    }
  }
}
console.log('PASS', report.length, 'Story/Level Select charts: exact mix identities, onsets, full durations and score caps');
console.log(JSON.stringify(report));
