// Chart and fight-rule changes on top of the release's data/level1.json
// (build-moth.mjs publishes the result, compact; verify-moth-package.mjs checks
// nothing else changed).
//
// All nine playable songs use measured drum-only rows. Silent drum breaks
// contain no filler; Level 6 uses verse 1 through the end of chorus 2.
//
// Level 7 (the concert): full hype at the song's end needed 75% / 85% weighted
// accuracy (easy / hard), too thin a margin (owner, 2026-10-13: a 72% run on
// hard fell short). It now needs 60% / 70%, and the bar fills with every hit
// (moth-runtime-patches.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cleanRetiredHighwayConfig } from './moth-retired-highway.mjs';

// Measured separately from the game's runtime. The build only consumes these
// versioned rows; it does not need Python, Demucs or the original audio stems.
const baseBytes = readFileSync(new URL('./moth-drum-charts.json', import.meta.url));
export const BASE_DRUM_CHARTS = JSON.parse(baseBytes);
const riverBytes = readFileSync(new URL('./moth-river-cut.json', import.meta.url));
const riverCut = JSON.parse(riverBytes);
assert.equal(createHash('sha256').update(baseBytes).digest('hex'), riverCut.sourceSha256, 'River cut rebased from the current full-song transcription');
const grooveBytes = readFileSync(new URL('./moth-river-groove.json', import.meta.url));
assert.equal(createHash('sha256').update(grooveBytes).digest('hex'), riverCut.grooveSha256, 'River cut uses the reviewed audible groove');
export const PRIOR_DRUM_CHARTS = { ...BASE_DRUM_CHARTS, version: riverCut.version,
  songs: { ...BASE_DRUM_CHARTS.songs, level5RiverRhythm: riverCut.song } };
const revised = JSON.parse(readFileSync(new URL('./moth-groove-charts.json', import.meta.url)));
assert.equal(revised.baseSha256, riverCut.sourceSha256, 'Groove selection is based on the retained source transcription');
assert.equal(revised.riverSha256, createHash('sha256').update(riverBytes).digest('hex'), 'Groove selection uses the approved river crop');
assert.deepEqual(Object.keys(revised.songs).sort(), Object.keys(PRIOR_DRUM_CHARTS.songs).sort(), 'Groove selection covers every story and hidden song');
export const DRUM_CHARTS = { ...PRIOR_DRUM_CHARTS, version: revised.version, songs: Object.fromEntries(
  Object.entries(PRIOR_DRUM_CHARTS.songs).map(([id, song]) => {
    const {easy, hard} = revised.songs[id];
    for (const [mode, selected] of [['easy', easy], ['hard', hard]]) {
      assert.equal(selected.rows.length, song[mode].length, `${id}/${mode}: existing chart density`);
      assert.equal(selected.evidence.length, selected.rows.length, `${id}/${mode}: an attack measurement for every note`);
    }
    return [id, { ...song, selectionVersion: revised.selectionVersion, easy: easy.rows, hard: hard.rows,
      evidence: {easy: easy.evidence, hard: hard.evidence} }];
  })
) };
export const MOTH_CHART_VERSION = DRUM_CHARTS.version;

export const CONCERT_HYPE_TARGET = { easy: 0.6, hard: 0.7 };
const CONCERT_NOTE = ['Hype grows with song progress; full hype requires 75%/85% weighted accuracy when the song ends. No early failure or secured climax.',
  'Hype fills with every hit, over 60%/70% of the whole song\'s weighted total: full hype secures the climax, and at the end it needs 60%/70% weighted accuracy (owner, 2026-10-13; was 75%/85%, growing with song progress). No early failure.'];

export function patchCharts(config) {
  const entries = Object.entries(config).filter(([, spec]) => spec?.chart?.easy)
    .concat(config.secretLevels.map(level => [level.id, level.rhythm]));
  assert.equal(entries.length, 9, 'All seven story fights and both hidden songs');
  for (const [id, spec] of entries) {
    const measured = DRUM_CHARTS.songs[id];
    assert(measured, `Measured chart for ${id}`);
    const original = BASE_DRUM_CHARTS.songs[id];
    for (const key of ['bpm', 'beatOffset', 'audioStartSeconds']) assert.equal(spec[key] || 0, original[key], `${id}: original audio clock ${key}`);
    if (id === 'level5RiverRhythm') {
      for (const key of ['beatOffset', 'audioStartSeconds', 'duration', 'fullSong', 'fadeInSeconds', 'fightCut']) spec[key] = measured[key];
      spec.phases.forEach((phase, index) => {
        phase.start = measured.phaseBoundaries[index];
        phase.end = measured.phaseBoundaries[index + 1];
      });
    }
    spec.chart = {
      stepBeats: .25, version: MOTH_CHART_VERSION, timingMode: 'waveform-attacks',
      selectionVersion: measured.selectionVersion,
      sourceRoles: Object.fromEntries([...'MOTH'].map(button => [button, 'drums'])),
      drumInstruments: { M: 'hat', O: 'snare', T: 'kick', H: 'other' },
      easy: measured.easy.map(row => [...row]), hard: measured.hard.map(row => [...row])
    };
    spec.note = 'M/O/T/H heads follow measured isolated drum attacks. The charts favor audible kick, snare and cymbal accents, with the recording’s swing and syncopation intact. Both modes keep their phrase density and holds. Hard has at least 300 ms between repeated buttons and at most four heads per second.';
  }
  config.rhythmChartVersion = MOTH_CHART_VERSION;
  const crowd = config.level6ConcertRhythm.crowd;
  assert.deepEqual(crowd.accuracyTarget, { easy: 0.75, hard: 0.85 }, 'Concert hype target');
  crowd.accuracyTarget = { ...CONCERT_HYPE_TARGET };
  assert(crowd.note.includes(CONCERT_NOTE[0]));
  crowd.note = crowd.note.replace(CONCERT_NOTE[0], CONCERT_NOTE[1]);
  return cleanRetiredHighwayConfig(config);
}
