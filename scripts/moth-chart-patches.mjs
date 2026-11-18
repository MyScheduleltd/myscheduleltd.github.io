// Chart and fight-rule changes on top of the release's data/level1.json
// (build-moth.mjs publishes the result, compact; verify-moth-package.mjs checks
// nothing else changed).
//
// New charts use supplied studio stems. Story retains its edits, including
// Level 6's verse-through-chorus section. Level Select plays whole mixes.
//
// Level 7 (the concert): full hype at the song's end needed 75% / 85% weighted
// accuracy (easy / hard), too thin a margin (owner, 2026-10-13: a 72% run on
// hard fell short). It now needs 60% / 70%, and the bar fills with every hit
// (moth-runtime-patches.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cleanRetiredHighwayConfig } from './moth-retired-highway.mjs';
import { remixEasyLanes } from './moth-easy-lanes.mjs';

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
export const FUNK_CHARTS = JSON.parse(readFileSync(new URL('./moth-funk-charts.json', import.meta.url)));
// The measured source transcription is unchanged. This arrangement leaves
// its opening two seconds unscored so the first target can roll into view.
export const MOTH_CHART_VERSION = 'funk-rollin-20261118b';
export const MOTH_OPENING_LEAD_SECONDS = 2;
export const MOTH_STAGE_THEMES = {
  level1OfficeRhythm: ['level1-stage1', 'office'],
  level2BathroomRhythm: ['level2-stage2', 'bathroom'],
  level3MassageRhythm: ['level3-stage2', 'massage'],
  level4ArcadeRhythm: ['level4-stage1', 'arcade'],
  level5StudioRhythm: ['studio-stage1', 'studio'],
  level5RiverRhythm: ['level5-stage2', 'river'],
  level6ConcertRhythm: ['level6-stage2', 'concert']
};

function makeChart(song, {start, duration, offset}) {
  const stepBeats = .25;
  const secondsPerStep = stepBeats * 60 / song.bpm;
  const chart = {stepBeats, version: MOTH_CHART_VERSION, timingMode: 'studio-stems',
    sourceRoles: {easy: 'isolated-drum-stem', hard: 'lead-vocal'}};
  if (song.opening) chart.sourceRoles.opening = song.opening;
  if (song.extendedRests) chart.sourceRoles.extendedRests = song.extendedRests;
  const end = start + duration;
  for (const mode of ['easy', 'hard']) {
    chart[mode] = song[mode].filter(([time]) => time >= start + MOTH_OPENING_LEAD_SECONDS && time < end)
      .map(([time, lane, holdSeconds]) => [
        Math.round((time - start - offset) / secondsPerStep * 1e8) / 1e8,
        lane,
        time + holdSeconds < end ? Math.round(holdSeconds / secondsPerStep * 1e8) / 1e8 : 0
      ]);
    assert(chart[mode].length > 0, `Empty chart ${song.audioSrc}/${mode}`);
  }
  return chart;
}

function fullSongPhases(phases, duration, song) {
  const bar = 60 / song.bpm * song.meter.beatsPerBar;
  const boundaries = phases.map((_, index) => index === 0 ? 0 :
    song.meter.firstDownbeat + Math.round((duration * index / phases.length - song.meter.firstDownbeat) / bar) * bar);
  return phases.map((phase, index) => ({...phase, start: boundaries[index], end: boundaries[index + 1] ?? duration}));
}

export const CONCERT_HYPE_TARGET = { easy: 0.6, hard: 0.7 };
const CONCERT_NOTE = ['Hype grows with song progress; full hype requires 75%/85% weighted accuracy when the song ends. No early failure or secured climax.',
  'Hype fills with every hit, over 60%/70% of the whole song\'s weighted total: full hype secures the climax, and at the end it needs 60%/70% weighted accuracy (owner, 2026-10-13; was 75%/85%, growing with song progress). No early failure.'];

export function patchCharts(config) {
  const entries = Object.entries(config).filter(([, spec]) => spec?.chart?.easy)
    .map(([id, spec]) => [id, spec, ...MOTH_STAGE_THEMES[id]])
    .concat(config.secretLevels.map(level => [level.id, level.rhythm, level.id, level.theme]));
  assert.equal(entries.length, 9, 'All seven story fights and both hidden songs');
  assert.deepEqual(Object.keys(FUNK_CHARTS.songs).sort(), entries.map(([id]) => id).sort());
  config.stageSelectRhythms = {};
  for (const [id, spec, stage, theme] of entries) {
    const song = FUNK_CHARTS.songs[id];
    const original = BASE_DRUM_CHARTS.songs[id];
    for (const key of ['bpm', 'beatOffset', 'audioStartSeconds']) assert.equal(spec[key] || 0, original[key], `${id}: original audio clock ${key}`);
    if (id === 'level5RiverRhythm') {
      const measured = PRIOR_DRUM_CHARTS.songs[id];
      for (const key of ['beatOffset', 'audioStartSeconds', 'duration', 'fullSong', 'fadeInSeconds', 'fightCut']) spec[key] = measured[key];
      spec.phases.forEach((phase, index) => {
        phase.start = measured.phaseBoundaries[index];
        phase.end = measured.phaseBoundaries[index + 1];
      });
    }
    if (spec.fightCut?.fadeSeconds === 2) {
      // The old cut used the same two-second fade at both ends and masked
      // the opening hits. The new file keeps its cut clock and closing fade.
      spec.fightCut.src = spec.fightCut.src.replace(/\.m4a$/, '-onset.m4a');
    }
    assert.equal(createHash('sha256').update(readFileSync(new URL('../.qa/moth/published/' + song.audioSrc, import.meta.url))).digest('hex'),
      song.mixSha256, `Studio stems aligned to the exact shipped mix for ${id}`);
    assert.equal(spec.bpm, song.bpm, `Source tempo for ${id}`);
    spec.openingLeadSeconds = MOTH_OPENING_LEAD_SECONDS;
    spec.fadeInSeconds = MOTH_OPENING_LEAD_SECONDS;
    const storyOrigin = spec.fightCut?.fromSeconds || 0;
    const storyDuration = spec.duration - (spec.fightCut ? .08 : 0);
    const lanes = remixEasyLanes(song, {storyStart: storyOrigin, storyEnd: storyOrigin + storyDuration,
      openingLeadSeconds: MOTH_OPENING_LEAD_SECONDS});
    const playableSong = {...song, easy: lanes.rows};
    spec.chart = makeChart(playableSong, {start: storyOrigin, duration: storyDuration, offset: spec.beatOffset || 0});
    const easyFullSong = `assets/audio/easy-mixes/${theme}.m4a`;
    spec.easyAudioSrc = spec.fightCut ? `assets/audio/easy-mixes/${theme}-story.m4a` : easyFullSong;
    spec.note = 'Easy follows measured attacks in the isolated drum stem. Hard follows measured lead-vocal articulations.';
    if (song.opening === 'bass-riff') spec.note += ' The opening taps and holds use the bass riff.';
    if (song.extendedRests === 'bass-stem') spec.note += ' Audible bass fills extended rests.';
    const {fightCut, ...selection} = spec;
    const beatOffset = song.meter.firstDownbeat;
    config.stageSelectRhythms[stage] = {
      ...selection, theme, fullSong: true, audioSrc: song.audioSrc, easyAudioSrc: easyFullSong, duration: song.duration,
      beatOffset, audioStartSeconds: 0, fadeInSeconds: MOTH_OPENING_LEAD_SECONDS,
      phases: fullSongPhases(spec.phases || [], song.duration, song),
      chart: makeChart(playableSong, {start: 0, duration: song.duration, offset: beatOffset})
    };
  }
  config.rhythmChartVersion = MOTH_CHART_VERSION;
  const crowd = config.level6ConcertRhythm.crowd;
  assert.deepEqual(crowd.accuracyTarget, { easy: 0.75, hard: 0.85 }, 'Concert hype target');
  crowd.accuracyTarget = { ...CONCERT_HYPE_TARGET };
  config.stageSelectRhythms['level6-stage2'].crowd = crowd;
  assert(crowd.note.includes(CONCERT_NOTE[0]));
  crowd.note = crowd.note.replace(CONCERT_NOTE[0], CONCERT_NOTE[1]);
  return cleanRetiredHighwayConfig(config);
}
