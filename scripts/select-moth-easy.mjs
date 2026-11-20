#!/usr/bin/env node
// Apply approachable Easy selection to freshly analyzed stem candidates.
// The old build supplies counts only. Its old onsets are never selection input.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {reduceEasyDifficulty, EASY_DIFFICULTY_VERSION} from './moth-easy-difficulty.mjs';

const root = path.resolve(import.meta.dirname, '..');
const local = name => path.join(root, '.qa/moth/correct-stems-20261119', name);
const {values} = parseArgs({options: {
  candidates: {type: 'string', default: local('fresh-candidates.json')},
  analysis: {type: 'string', default: local('fresh-analysis.json')},
  baseline: {type: 'string', default: local('baseline-level1.json')},
  output: {type: 'string', default: local('selected-candidates.json')},
  report: {type: 'string', default: local('selected-analysis.json')}
}});
assert(![values.candidates, values.analysis, values.baseline].map(file => path.resolve(file))
  .some(file => [values.output, values.report].map(file => path.resolve(file)).includes(file)),
  'Selection outputs must not overwrite fresh source evidence');
const [candidateBytes, analysisBytes, baselineBytes] = await Promise.all([
  fs.readFile(values.candidates), fs.readFile(values.analysis), fs.readFile(values.baseline)
]);
const candidates = JSON.parse(candidateBytes), evidence = JSON.parse(analysisBytes);
const baseline = JSON.parse(baselineBytes);
const output = structuredClone(candidates), report = structuredClone(evidence);
const STAGES = {
  level1OfficeRhythm: 'level1-stage1', level2BathroomRhythm: 'level2-stage2',
  level3MassageRhythm: 'level3-stage2', level4ArcadeRhythm: 'level4-stage1',
  level5StudioRhythm: 'studio-stage1', level5RiverRhythm: 'level5-stage2',
  level6ConcertRhythm: 'level6-stage2', 'secret-xiaosi': 'secret-xiaosi',
  'secret-getdown': 'secret-getdown'
};
assert.equal(Object.keys(candidates.songs).length, 9);
assert.deepEqual(Object.keys(candidates.songs).sort(), Object.keys(STAGES).sort());
const round = value => Math.round(value * 1e5) / 1e5;
const row = event => [event.time, event.button, round((event.holdEnd ?? event.time) - event.time)];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const identities = {candidatesSha256: sha(candidateBytes), analysisSha256: sha(analysisBytes),
  baselineSha256: sha(baselineBytes), baselineVersion: baseline.rhythmChartVersion};

for (const [id, song] of Object.entries(candidates.songs)) {
  const events = evidence[id]?.easy;
  assert(events?.length, id + ' requires fresh per-attack evidence');
  assert.deepEqual(events.map(row), song.easy, id + ' rows must match the fresh analyzed attacks');
  const story = baseline[id] || baseline.secretLevels.find(level => level.id === id)?.rhythm;
  const full = baseline.stageSelectRhythms[STAGES[id]];
  assert(story && full, id + ' requires both published arrangement counts');
  const storyStart = story.fightCut?.fromSeconds || 0;
  const storyEnd = Math.min(song.duration,
    storyStart + story.duration - (story.fightCut ? .08 : 0));
  const options = {bpm: song.bpm, firstDownbeat: song.meter.firstDownbeat,
    beatsPerBar: song.meter.beatsPerBar, riffBars: song.meter.riffBars,
    duration: song.duration, storyStart, storyEnd, openingLeadSeconds: 2,
    baselineFullCount: full.chart.easy.length, baselineStoryCount: story.chart.easy.length};
  const selected = reduceEasyDifficulty(events, options);
  output.songs[id].easy = selected.events.map(row);
  output.songs[id].easyDifficulty = {version: EASY_DIFFICULTY_VERSION,
    baselineVersion: baseline.rhythmChartVersion, openingLeadSeconds: 2,
    storyStart, storyEnd, baselineFullCount: options.baselineFullCount,
    baselineStoryCount: options.baselineStoryCount, reduction: selected.report.reduction,
    windows: selected.report.windows};
  report[id].easy = selected.events;
  report[id].easyCandidateCount = events.length;
  report[id].easySelectedCount = selected.events.length;
  report[id].easyDifficulty = {...selected.report, ...identities};
  assert.deepEqual(output.songs[id].hard, song.hard, id + ' keeps all fresh vocal rows');
  assert.deepEqual(report[id].hard, evidence[id].hard, id + ' keeps all fresh vocal evidence');
  console.log(id, JSON.stringify(selected.report.windows));
}
for (const [file, data, compact] of [[values.output, output, true], [values.report, report, false]]) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, JSON.stringify(data, null, compact ? undefined : 2) + '\n');
}
console.log('PASS fresh-source Easy selection for all nine songs; Hard transcription unchanged');
