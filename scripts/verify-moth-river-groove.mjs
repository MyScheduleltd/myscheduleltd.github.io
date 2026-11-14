// Musical-selection regressions for the river excerpt. These checks protect
// audible shuffled hits from the old straight-grid/nearest-weak-hit selection;
// they do not infer acoustic accuracy from a self-consistent input timestamp.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {DRUM_CHARTS, MOTH_CHART_VERSION} from './moth-chart-patches.mjs';

const root = new URL('../', import.meta.url);
const read = file => fs.readFile(new URL(file, root));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const baseBytes = await read('scripts/moth-drum-charts.json');
const base = JSON.parse(baseBytes).songs.level5RiverRhythm;
const grooveBytes = await read('scripts/moth-river-groove.json');
const groove = JSON.parse(grooveBytes), song = groove.song;
const cache = JSON.parse(await read('.qa/moth/drum-sync-20261029/level5RiverRhythm-measured.json'));
assert.equal(groove.baselineSha256, sha(baseBytes), 'Selection is based on the retained source transcription');
assert.deepEqual(groove.window, {start: 10, end: 164}, 'Owner-confirmed verse 1 through chorus 2');
assert.equal(song.selectionVersion, 'audible-shuffle-v1');
assert.equal(groove.version, 'drums-readable-20261105b');
assert.equal(song.hashes.stem, 'dc8bad34b3388b7223ea8648a530a9d6fc75a8f349a6ca60b4c0ceab45829891');
assert.equal(song.hashes.master, '4d6555a1f539c7ef24ad1c6198ebc08b6f8e3dc9206a61639432a0e29312c741');
for (const key of ['stem', 'master']) assert.equal(song.hashes[key], cache.hashes[key], 'Reviewed source identity: ' + key);

const beat = 60 / song.bpm, unit = beat / 4, phase = .0893;
const inWindow = event => event.attack >= groove.window.start && event.attack < groove.window.end;
const phrases = events => {
  const counts = {};
  for (const event of events) {
    const key = Math.floor((event.attack - phase) / (8 * beat));
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
};
assert.equal(base.evidence.easy.filter(inWindow).length, 178, 'Previous easy density in the requested section');
assert.equal(song.easy.length, 178, 'Easy density is retained');
assert.deepEqual(phrases(song.evidence.easy), phrases(base.evidence.easy.filter(inWindow)), 'Every eight-beat easy phrase retains its head count');
assert.equal(song.hard.length, 207, 'Reviewed hard selection remains bounded');

const reports = [];
for (const mode of ['easy', 'hard']) {
  const rows = song[mode], events = song.evidence[mode];
  assert.equal(rows.length, events.length);
  let minGap = Infinity, holds = 0;
  for (let index = 0; index < events.length; index++) {
    const event = events[index], [step, button, tail] = rows[index];
    assert(inWindow(event), `${mode}: every head lies within the selected source section`);
    assert.equal(button, event.button);
    assert.equal(event.source, 'isolated-drums');
    assert.equal(event.selectionVersion, song.selectionVersion);
    assert(event.audibilityScore >= 1.5 && event.drumRms > 0 && event.masterRiseSupport > 0, `${mode}: an audible source-supported attack is required`);
    assert(event.onsetContrast >= .5 && !event.onsetEdge, `${mode}: a bounded attack rather than an unresolved classifier boundary`);
    const measured = cache.refinements[event.instrument]?.find(hit => Math.abs(hit.proposal - event.proposalAttack) < .00001);
    assert(measured && Math.abs(measured.time - event.attack) < .000002, `${mode}: retained measured source proposal and attack`);
    assert(Math.abs(song.beatOffset + step * unit + song.audioStartSeconds - event.attack) < .000002, `${mode}: actual off-grid attack is encoded exactly`);
    if (tail > 0) holds++;
    if (index + 1 < events.length) {
      const next = events[index + 1], gap = next.attack - event.attack;
      minGap = Math.min(minGap, gap);
      assert(gap >= (mode === 'hard' ? Math.max(.224, Math.min(.28, beat * .45)) : .224) - .000001, `${mode}: readable adjacent heads`);
      assert(gap - tail * unit >= (mode === 'hard' && tail ? .2 : .06) - .000001, `${mode}: hold tail and recovery remain clear`);
    }
    if (mode === 'hard') {
      const same = events.slice(index + 1).find(next => next.button === button);
      if (same) assert(same.attack - event.attack >= .3 - .000001, 'Hard repeated-button recovery');
      if (index + 4 < events.length) assert(events[index + 4].attack - event.attack >= 1 - .000001, 'No more than four hard heads in a rolling second');
    }
  }
  const hold = events.findIndex(event => Math.abs(event.attack - 86.787) < .0001 && event.button === 'O');
  assert(hold >= 0 && rows[hold][2] > 0, `${mode}: the hold begins on the reviewed snare, not the old weak percussion`);
  assert(Math.abs(events[hold].attack + rows[hold][2] * unit - 87.7667894736842) < .00001, `${mode}: reviewed release remains intact`);
  for (const attack of [39.433, 59.961, 64.697, 125.093, 127.856, 135.749]) {
    const index = events.findIndex(event => Math.abs(event.attack - attack) < .0001 && event.instrument === 'kick');
    assert(index >= 0, `${mode}: strong shuffled kick ${attack} is retained`);
    assert(events[index].gridDeviationMs > 65 && events[index].tripletGridDeviationMs < 4, `${mode}: a strong triplet is not filtered by the old 65 ms straight-grid gate`);
    assert(Math.abs(rows[index][0] - Math.round(rows[index][0])) > .2, `${mode}: a shuffled kick is not snapped to a straight sixteenth`);
    assert(!events.some((event, other) => other !== index && Math.abs(event.attack - attack) < .224), `${mode}: the former weak nearby hit is not retained beside the true kick`);
  }
  for (const removed of [39.563, 60.078, 64.804, 86.924, 127.975])
    assert(!events.some(event => Math.abs(event.attack - removed) < .0001), `${mode}: reviewed weak pickup ${removed} is not reintroduced`);
  reports.push({mode, heads: rows.length, holds, minimumGapMs: +(minGap * 1000).toFixed(3)});
}

if (!process.argv.includes('--source-only')) {
  const cut = JSON.parse(await read('scripts/moth-river-cut.json'));
  const config = JSON.parse(await read('docs/moth/data/level1.json'));
  const runtime = config.level5RiverRhythm, selected = DRUM_CHARTS.songs.level5RiverRhythm;
  assert.equal(cut.grooveSha256, sha(grooveBytes), 'Final cut consumes the reviewed groove artifact');
  assert.equal(cut.version, groove.version);
  assert.equal(runtime.chart.version, MOTH_CHART_VERSION);
  assert.equal(runtime.audioStartSeconds, 10);
  assert.equal(runtime.fightCut.toSeconds, 164);
  assert(Math.abs(runtime.duration + runtime.fightCut.fadeSeconds - 154) < .00001, 'Audio and review fade stay inside the requested section');
  assert.equal(sha(await read('docs/moth/' + runtime.fightCut.src)), selected.hashes.playing, 'The shipped crop matches its timing evidence');
  for (const mode of ['easy', 'hard']) {
    assert.equal(runtime.chart[mode].length, cut.song[mode].length, `${mode}: final crop retains the complete reviewed phrase density`);
    assert.deepEqual(runtime.chart[mode], selected[mode]);
    for (let index = 0; index < selected[mode].length; index++) {
      const row = runtime.chart[mode][index], source = selected.evidence[mode][index];
      const at = runtime.beatOffset + row[0] * unit;
      assert.equal(row[1], source.button);
      assert(Math.abs(at + runtime.audioStartSeconds - source.attack) < .000002, `${mode}: source-to-cut rebasing retains every attack`);
      assert(at >= 0 && at + row[2] * unit <= runtime.duration, `${mode}: final head/hold fits the actual gameplay clock`);
    }
    for (const attack of [39.433, 59.961, 64.697, 125.093, 127.856, 135.749]) {
      assert(selected.evidence[mode].some(event => event.instrument === 'kick' && Math.abs(event.attack - attack) < .0001),
        `${mode}: the current overlay retains the reviewed shuffled kick ${attack}`);
    }
    assert.deepEqual(runtime.chart[mode].filter(row => row[2] > 0), cut.song[mode].filter(row => row[2] > 0), `${mode}: reviewed hold start and tail are preserved`);
  }
}
await fs.mkdir(new URL('.qa/moth/river-reselection-20261105/', root), {recursive: true});
await fs.writeFile(new URL('.qa/moth/river-reselection-20261105/groove-regression.json', root), JSON.stringify({scope: process.argv.includes('--source-only') ? 'source-selection' : 'source-selection-and-shipped-cut', reports}, null, 2) + '\n');
console.log('PASS river groove: preserved easy phrase density, audible shuffled kicks, measured source references, clear hard recovery and holds' + (process.argv.includes('--source-only') ? '' : ', exact final verse-to-chorus crop rebasing'));
console.log(JSON.stringify(reports));
