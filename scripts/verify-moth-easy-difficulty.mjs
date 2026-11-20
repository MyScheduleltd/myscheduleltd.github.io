import assert from 'node:assert/strict';
import {reduceEasyDifficulty, measureEasyLaneChanges, easyLaneEasePenalty} from './moth-easy-difficulty.mjs';

const groove = Array.from({length: 32}, (_, index) => ({time: index * .25,
  button: 'MOTH'[index % 4], source: 'drum-stem',
  role: index % 8 === 0 ? 'downbeat' : index === 30 ? 'fill-accent' : 'groove',
  confidence: index % 8 === 0 ? 1.2 : index === 30 ? 1.1 : .4 + (index % 3) * .1}));
const before = structuredClone(groove);
const reduced = reduceEasyDifficulty(groove, {bpm: 120, duration: 8, storyStart: 2,
  storyEnd: 6, openingLeadSeconds: 0, baselineFullCount: 32, baselineStoryCount: 16});
assert.equal(reduced.report.windows.full.selected, 26, 'Full-song density follows the published count target');
assert.equal(reduced.report.windows.story.selected, 13, 'Story density has its own published count target');
for (const time of [0, 2, 4, 6, 7.5]) assert(reduced.events.some(event => event.time === time),
  'Main Ones and explicit fill accents survive: ' + time);
assert(reduced.events.every(event => groove.includes(event)), 'Every selected hit is an actual input attack object');
assert.deepEqual(groove, before, 'Selection never mutates source timing, sound metadata or tails');
assert.deepEqual(reduceEasyDifficulty(structuredClone(groove), {bpm: 120, duration: 8,
  storyStart: 2, storyEnd: 6, openingLeadSeconds: 0, baselineFullCount: 32,
  baselineStoryCount: 16}).events, reduced.events, 'The same measured performance produces the same selection');
const softerOnes = groove.map(event => ({...event,
  confidence: event.role === 'downbeat' ? .1 : 1.8}));
const softResult = reduceEasyDifficulty(softerOnes, {bpm: 120, duration: 8,
  openingLeadSeconds: 0, baselineFullCount: 24, baselineStoryCount: 24});
for (const time of [0, 2, 4, 6]) assert(softResult.events.some(event => event.time === time),
  'A valid quiet One is not replaced by a loud offbeat within its bar');

const bass = Array.from({length: 8}, (_, index) => ({time: 4 + index * .5,
  button: 'MOTH'[index % 4], source: 'bass-stem', role: 'bass-break', confidence: .85,
  ...(index === 2 ? {holdEnd: 5.75} : {})}));
const withRest = [...groove.filter(event => event.time < 4), ...bass];
const rested = reduceEasyDifficulty(withRest, {bpm: 120, duration: 8,
  openingLeadSeconds: 0, baselineFullCount: 24, baselineStoryCount: 24});
for (const time of [4, 6]) assert(rested.events.some(event => event.time === time),
  'Bass keeps each occupied bar of an extended rest active');
assert(rested.events.includes(bass[2]) && bass[2].holdEnd === 5.75,
  'A retained bass sustain preserves its original onset and release');
assert(rested.report.windows.full.minGapSeconds >= .225 - 1e-8,
  'No selected attack falls inside a held tail');

const sparse = [{time: 2.5, button: 'M', source: 'drum-stem', role: 'downbeat'},
  {time: 4.5, button: 'O', source: 'drum-stem', role: 'downbeat'},
  {time: 6.5, button: 'T', source: 'drum-stem', role: 'downbeat'}];
const limited = reduceEasyDifficulty(sparse, {bpm: 120, duration: 8,
  baselineFullCount: 20, baselineStoryCount: 20});
assert.deepEqual(limited.events, sparse, 'Insufficient new attacks never cause old or invented hits to be inserted');
assert.equal(limited.report.windows.full.reason, 'candidate-limited');
assert.equal(limited.report.windows.full.targetShortfall, 13);

const intro = reduceEasyDifficulty(groove, {bpm: 120, duration: 8,
  baselineFullCount: 24, baselineStoryCount: 24});
assert.deepEqual(intro.events.filter(event => event.time < 2), groove.filter(event => event.time < 2),
  'Raw review attacks before the unscored musical intro remain available');
assert.equal(intro.report.windows.full.selected, 19, 'Unscored intro heads never inflate playable density');

const fast = ['M', 'O', 'T', 'H', 'M', 'O'].map((button, index) => [index * .25, button, 0]);
const simple = ['M', 'M', 'O', 'O', 'T', 'T'].map((button, index) => [index * .25, button, 0]);
assert.equal(measureEasyLaneChanges(fast).rapidChanges, 5);
assert.equal(measureEasyLaneChanges(simple).rapidChanges, 2);
assert.equal(measureEasyLaneChanges([[0, 'M', 1], [1.25, 'O', 0]]).rapidChanges, 1,
  'A quick change after a hold is measured from its release, not the distant head');
assert(easyLaneEasePenalty(simple) < easyLaneEasePenalty(fast),
  'The lane objective prefers manageable two-note gestures to a six-note fast button run');
assert.deepEqual(fast.map(row => row[0]), simple.map(row => row[0]),
  'Gesture simplification compares the same sound times');
console.log('PASS Easy selection: playable count targets, source attacks, Ones/fills, bass rests, holds, determinism and rapid gestures');
