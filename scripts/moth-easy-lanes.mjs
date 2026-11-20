// Choose letters for the measured Easy attacks without changing their sound
// times. One assignment per riff position makes returning grooves familiar;
// balancing both arrangements avoids a good full-song mix hiding a dull cut.
import {easyLaneEasePenalty, measureEasyLaneChanges} from './moth-easy-difficulty.mjs';
export const EASY_LANE_PATTERN_VERSION = 'riff-ease-20261119a';
const BUTTONS = 'MOTH';
const cache = new WeakMap();
const STARTING_PATTERNS = [
  [2, 2, 3, 3, 1, 1, 0, 0, 1, 1, 2, 2, 0, 0, 3, 3],
  [1, 1, 0, 0, 2, 2, 3, 3, 2, 2, 1, 1, 3, 3, 0, 0]
];

export function easyLaneMotif(song, time) {
  const beats = (time - song.meter.firstDownbeat) * song.bpm / 60;
  // Nearest sixteenth identifies the motif, never a replacement timestamp.
  const bar = Math.floor((beats + .125) / 4);
  const period = song.meter.riffBars;
  const phase = ((bar % period) + period) % period;
  const slot = ((Math.round((beats - bar * 4) * 4) % 16) + 16) % 16;
  return phase * 16 + slot;
}

export function summarizeEasyLanes(rows) {
  const keys = rows.map(row => typeof row === 'number' ? row : BUTTONS.indexOf(row[1]));
  const counts = Array(4).fill(0);
  let run = 0, previous = -1, maxRun = 0, missing16 = 0, missing24 = 0, narrow8 = 0, max16 = 0;
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    counts[key]++;
    run = key === previous ? run + 1 : 1;
    previous = key;
    maxRun = Math.max(maxRun, run);
    if (index >= 15) {
      const window = Array(4).fill(0);
      for (let at = index - 15; at <= index; at++) window[keys[at]]++;
      if (window.some(count => count === 0)) missing16++;
      max16 = Math.max(max16, ...window);
    }
    if (index >= 23 && new Set(keys.slice(index - 23, index + 1)).size < 4) missing24++;
    if (index >= 7 && new Set(keys.slice(index - 7, index + 1)).size < 2) narrow8++;
  }
  return {notes: keys.length, counts: Object.fromEntries([...BUTTONS].map((key, i) => [key, counts[i]])),
    maxRun, missing16, missing24, narrow8, max16};
}

function scorePattern(mapping, arrangements, moments) {
  let score = 0;
  for (const [arrangementIndex, cells] of arrangements.entries()) {
    const keys = cells.map(cell => mapping[cell]);
    const counts = Array(4).fill(0), sixteen = Array(4).fill(0), eight = Array(4).fill(0), twentyFour = Array(4).fill(0);
    score += easyLaneEasePenalty(moments[arrangementIndex], {buttons: keys});
    let run = 0, previous = -1;
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      counts[key]++;
      run = key === previous ? run + 1 : 1;
      previous = key;
      if (run > 3) score += 1000 * (run - 3);
      sixteen[key]++;
      eight[key]++;
      twentyFour[key]++;
      if (index >= 16) sixteen[keys[index - 16]]--;
      if (index >= 8) eight[keys[index - 8]]--;
      if (index >= 24) twentyFour[keys[index - 24]]--;
      if (index >= 15) {
        for (const count of sixteen) {
          if (count > 8) score += 400 * (count - 8);
        }
      }
      if (index >= 23 && twentyFour.some(count => count === 0)) score += 90;
      if (index >= 7 && eight.filter(count => count > 0).length < 2) score += 25;
    }
    for (const count of counts) {
      score += .8 * (count - keys.length / 4) ** 2 / keys.length;
      // Treat the public balance bounds as constraints. A sub-note excess
      // must not be cheaper than one additional button change.
      if (count < Math.ceil(.15 * keys.length)) score += 10000 * (Math.ceil(.15 * keys.length) - count);
      if (count > Math.floor(.35 * keys.length)) score += 10000 * (count - Math.floor(.35 * keys.length));
    }
  }
  return score;
}

export function remixEasyLanes(song, {storyStart, storyEnd, openingLeadSeconds = 2}) {
  const key = [storyStart, storyEnd, openingLeadSeconds].join('/');
  let versions = cache.get(song);
  if (!versions) cache.set(song, versions = new Map());
  if (versions.has(key)) return versions.get(key);

  const cells = song.easy.map(([time]) => easyLaneMotif(song, time));
  const unique = [...new Set(cells)].sort((a, b) => a - b);
  const windows = [
    {name: 'full', start: openingLeadSeconds, end: song.duration},
    {name: 'story', start: storyStart + openingLeadSeconds, end: storyEnd}
  ];
  const arrangements = windows.map(({start, end}) => cells.filter((_, index) => {
    const time = song.easy[index][0];
    return time >= start && time < end;
  }));
  const moments = windows.map(({start, end}) => song.easy.filter(([time]) => time >= start && time < end));
  if (arrangements.some(rows => rows.length === 0)) throw new Error('Easy lane arrangement is empty');
  const frequency = new Map(unique.map(cell => [cell,
    arrangements.reduce((sum, rows) => sum + rows.filter(value => value === cell).length, 0)]));
  const order = [...unique].sort((a, b) => frequency.get(b) - frequency.get(a) || a - b);

  let best, bestScore = Infinity;
  // Fixed musical starting palettes, transposed across riff bars. The search
  // changes whole recurring cells, never random individual notes or a rote
  // per-note M/O/T/H counter. Ties retain the existing candidate assignment.
  for (let seed = 0; seed < 8; seed++) {
    const mapping = {};
    for (const cell of unique) {
      const phase = Math.floor(cell / 16), slot = cell % 16;
      mapping[cell] = (STARTING_PATTERNS[seed % 2][slot] + phase + (seed >> 1)) % 4;
    }
    let score = scorePattern(mapping, arrangements, moments);
    for (let sweep = 0; sweep < 10; sweep++) {
      let changed = false;
      for (const cell of order) {
        const previous = mapping[cell];
        let choice = previous, localScore = score;
        for (let button = 0; button < 4; button++) {
          mapping[cell] = button;
          const candidate = scorePattern(mapping, arrangements, moments);
          if (candidate < localScore - 1e-8) {
            choice = button;
            localScore = candidate;
          }
        }
        mapping[cell] = choice;
        if (choice !== previous) {
          changed = true;
          score = localScore;
        }
      }
      if (!changed) break;
    }
    if (score < bestScore) {
      best = {...mapping};
      bestScore = score;
    }
  }
  const rows = song.easy.map(([time, , hold], index) => [time, BUTTONS[best[cells[index]]], hold]);
  const metrics = Object.fromEntries(windows.map(({name, start, end}) => {
    const selected = rows.filter(([time]) => time >= start && time < end);
    return [name, {...summarizeEasyLanes(selected), laneChanges: measureEasyLaneChanges(selected)}];
  }));
  for (const [name, value] of Object.entries(metrics)) {
    if (Object.values(value.counts).some(count => count < value.notes * .15 || count > value.notes * .35)
      || value.maxRun > 3 || value.missing24 || value.narrow8 || value.max16 > 8) {
      throw new Error('Easy lane balance constraints not satisfied: ' + name + ' ' + JSON.stringify(value));
    }
  }
  const result = {rows, metrics, motifs: Object.fromEntries(unique.map(cell => [cell, BUTTONS[best[cell]]])),
    patternVersion: EASY_LANE_PATTERN_VERSION};
  versions.set(key, result);
  return result;
}
