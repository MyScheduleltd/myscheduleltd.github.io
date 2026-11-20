// Select an approachable subset of freshly measured attacks. This module
// never moves an onset, invents a hit, changes a sustain, or reads old timing.
// Published head counts set the difficulty target; the new stems own the notes.
export const EASY_DIFFICULTY_VERSION = 'accent-groove-20261119b';

const endOf = event => event.holdEnd ?? event.time;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const explicitAccent = event => event.required === true
  || ['fill-accent', 'full-band-accent', 'riff-return'].includes(event.role);

function lowerBound(rows, time) {
  let low = 0, high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function separated(event, selected, gap) {
  const at = lowerBound(selected, event.time);
  const required = (left, right) => gap <= .225 + 1e-8
    && left.source === 'drum-stem' && right.source === 'drum-stem'
    && ['kick','snare','percussion'].includes(left.drumVoice)
    && ['kick','snare','percussion'].includes(right.drumVoice)
    && Math.min(left.drumSalience || 0, right.drumSalience || 0) >= .65
    && (left.drumFillAccent || right.drumFillAccent) ? Math.min(gap, .190) : gap;
  return (!at || event.time - endOf(selected[at - 1]) >= required(selected[at - 1], event) - 1e-8)
    && (at === selected.length || selected[at].time - endOf(event) >= required(event, selected[at]) - 1e-8);
}

function insert(event, selected) {
  selected.splice(lowerBound(selected, event.time), 0, event);
}

function placement(event, {bpm, firstDownbeat, beatsPerBar, riffBars}) {
  const beats = (event.time - firstDownbeat) * bpm / 60;
  const tick = Math.round(beats * 4);
  const period = beatsPerBar * riffBars * 4;
  const bar = Math.floor((beats + .125) / beatsPerBar);
  return {bar, cell: ((tick % period) + period) % period,
    onOne: Math.abs(beats - bar * beatsPerBar) <= .12};
}

function confidence(event) {
  const value = Number(event.confidence ?? event.strength ?? .5);
  return Number.isFinite(value) ? clamp(value, 0, 8) : .5;
}

/**
 * events: freshly analyzed {time, button, source, role, confidence, holdEnd?}.
 * Counts refer to playable heads after each arrangement's musical opening.
 * A preferred gap removes unnecessary flurries first. The hard floor can be
 * used for genuine fill accents when the requested density needs a quick pair.
 */
export function reduceEasyDifficulty(events, {
  bpm, firstDownbeat = 0, beatsPerBar = 4, riffBars = 2, duration,
  storyStart = 0, storyEnd = duration, baselineFullCount, baselineStoryCount,
  openingLeadSeconds = 2, reduction = .2, minGapSeconds = .225,
  preferredGapSeconds = .30
} = {}) {
  if (!(bpm > 0 && duration > 0 && reduction >= 0 && reduction < 1
    && minGapSeconds >= 0 && preferredGapSeconds >= minGapSeconds
    && storyStart >= 0 && storyEnd > storyStart && storyEnd <= duration + .1)) {
    throw new Error('Invalid Easy difficulty arrangement');
  }
  const ordered = [...events].sort((a, b) => a.time - b.time);
  if (!ordered.length || ordered.some(event => !Number.isFinite(event.time)
    || event.time < 0 || event.time >= duration || !Number.isFinite(endOf(event))
    || endOf(event) < event.time || endOf(event) > duration + 1e-8)) {
    throw new Error('Easy candidates require valid measured attacks and tails');
  }
  const meter = {bpm, firstDownbeat, beatsPerBar, riffBars};
  const positions = new Map(ordered.map(event => [event, placement(event, meter)]));
  const windows = [
    {name: 'full', start: openingLeadSeconds, end: duration, baseline: baselineFullCount},
    {name: 'story', start: storyStart + openingLeadSeconds, end: storyEnd, baseline: baselineStoryCount}
  ];
  const inside = (event, window) => event.time >= window.start && event.time < window.end;
  for (const window of windows) {
    window.candidates = ordered.filter(event => inside(event, window));
    if (!window.candidates.length) throw new Error('No measured Easy attacks in ' + window.name);
    window.baseline = Number.isFinite(window.baseline) && window.baseline > 0
      ? window.baseline : window.candidates.length;
    window.desired = Math.max(1, Math.round(window.baseline * (1 - reduction)));
    window.target = Math.min(window.desired, window.candidates.length);
  }
  const [full, story] = windows;
  const playable = full.candidates;
  const soundCell = event => positions.get(event).cell + ':' + (event.drumVoice || 'kit');
  const frequency = new Map();
  for (const event of playable) {
    const cell = soundCell(event);
    frequency.set(cell, (frequency.get(cell) || 0) + 1);
  }
  const strength = event => (event.drumSalience !== undefined
    ? 3 * event.drumSalience + 1.4 * (event.drumRecurrence || 0)
      + (event.drumVoice === 'kick' || event.drumVoice === 'snare' ? .8 : 0)
      + (event.drumGrooveAnchor ? 1.2 : 0)
    : 2 * confidence(event))
    + .15 * Math.min(4, frequency.get(soundCell(event)) || 0)
    + (positions.get(event).onOne || event.role === 'downbeat' ? .8 : 0)
    + (event.role?.includes('fill') ? .5 : 0)
    + (event.source?.includes('bass') ? .15 : 0);

  // Retain a real attack in every occupied bar. Prefer its One; in a bass-only
  // rest use the measured bass anchor. Empty bars stay empty, never synthesized.
  const anchors = new Map(), fillAnchors = new Map();
  for (const event of playable) {
    const key = positions.get(event).bar;
    const previous = anchors.get(key);
    const one = positions.get(event).onOne || event.role === 'downbeat';
    const previousOne = previous && (positions.get(previous).onOne || previous.role === 'downbeat');
    if (!previous || one && !previousOne || one === previousOne && strength(event) > strength(previous)) {
      anchors.set(key, event);
    }
    if (event.role === 'fill') {
      const group = event.fillId ?? key;
      const previousFill = fillAnchors.get(group);
      if (!previousFill || strength(event) > strength(previousFill)) fillAnchors.set(group, event);
    }
  }
  const priorities = new Map();
  for (const event of playable) {
    const anchor = anchors.get(positions.get(event).bar) === event;
    const one = positions.get(event).onOne || event.role === 'downbeat';
    const fill = fillAnchors.get(event.fillId ?? positions.get(event).bar) === event;
    const score = event.required ? 1000 : endOf(event) > event.time ? 900
      : anchor && one ? 850 : event.drumGrooveAnchor ? 820
      : explicitAccent(event) ? 800 : fill ? 790 : anchor ? 700 : 0;
    if (score) priorities.set(event, score);
  }
  const selected = [], kept = new Set(), rejectedProtected = [];
  for (const event of [...priorities.keys()].sort((a, b) => priorities.get(b) - priorities.get(a)
    || strength(b) - strength(a) || a.time - b.time)) {
    if (separated(event, selected, minGapSeconds)) {
      insert(event, selected); kept.add(event);
    } else rejectedProtected.push({time: event.time, role: event.role, reason: 'measured-tail-or-spacing-conflict'});
  }
  story.target = Math.max(story.target, selected.filter(event => inside(event, story)).length);
  full.target = Math.max(full.target, story.target + selected.filter(event => !inside(event, story)).length);

  const remaining = window => window.target - selected.filter(event => inside(event, window)).length;
  const selectedCells = () => new Set(selected.map(soundCell));
  const pick = (window, pool) => {
    const groups = new Map();
    for (const event of pool) {
      const cell = soundCell(event);
      if (!groups.has(cell)) groups.set(cell, []);
      groups.get(cell).push(event);
    }
    // Prefer whole recurring accents before individual exceptions. A fill or
    // changed delivery may keep a different subset when its bar has extra hits.
    const ranked = [...groups.values()].sort((a, b) =>
      b.reduce((sum, event) => sum + strength(event), 0) / b.length
      - a.reduce((sum, event) => sum + strength(event), 0) / a.length || a[0].time - b[0].time);
    for (const group of ranked) {
      const candidates = group.filter(event => !kept.has(event));
      if (!candidates.length || candidates.length > remaining(window)) continue;
      const trial = [...selected];
      if (!candidates.every(event => {
        if (!separated(event, trial, preferredGapSeconds)) return false;
        insert(event, trial); return true;
      })) continue;
      for (const event of candidates) {insert(event, selected); kept.add(event);}
    }
    for (const gap of [preferredGapSeconds, minGapSeconds]) {
      while (remaining(window) > 0) {
        const cells = selectedCells();
        let best, bestScore = -Infinity;
        for (const event of pool) {
          if (kept.has(event) || !separated(event, selected, gap)) continue;
          const at = lowerBound(selected, event.time);
          const left = at ? event.time - endOf(selected[at - 1]) : Infinity;
          const right = at < selected.length ? selected[at].time - endOf(event) : Infinity;
          const strain = Math.max(0, 1 - left / preferredGapSeconds)
            + Math.max(0, 1 - right / preferredGapSeconds);
          const score = strength(event) + (cells.has(soundCell(event)) ? .5 : 0)
            + Math.min(1, Math.min(left, right) / (60 / bpm)) * .2 - strain * 1.5;
          if (score > bestScore + 1e-8 || Math.abs(score - bestScore) <= 1e-8 && event.time < best.time) {
            best = event; bestScore = score;
          }
        }
        if (!best) break;
        insert(best, selected); kept.add(best);
      }
    }
  };
  pick(story, story.candidates);
  // The full-song pass cannot add to the cropped Story quota after it is met.
  pick(full, playable.filter(event => !inside(event, story)));

  // Keep raw attacks before the unscored opening for source-review overlays;
  // they are excluded by the existing runtime projection, never judged.
  const result = ordered.filter(event => event.time < full.start || kept.has(event));
  const byRole = rows => Object.fromEntries([...new Set(rows.map(event => event.role || 'unspecified'))]
    .map(role => [role, rows.filter(event => (event.role || 'unspecified') === role).length]));
  const report = {version: EASY_DIFFICULTY_VERSION, reduction, minGapSeconds, preferredGapSeconds,
    rejectedProtected, selectedSourceIndices: result.map(event => events.indexOf(event)),
    windows: Object.fromEntries(windows.map(window => {
      const rows = result.filter(event => inside(event, window));
      const gaps = rows.slice(1).map((event, index) => event.time - endOf(rows[index]));
      return [window.name, {baseline: window.baseline, desired: window.desired,
        available: window.candidates.length, planned: window.target, selected: rows.length,
        fractionOfBaseline: rows.length / window.baseline,
        targetShortfall: Math.max(0, window.desired - rows.length),
        reason: window.candidates.length < window.desired ? 'candidate-limited'
          : rows.length < window.target ? 'spacing-limited'
          : window.target > window.desired ? 'protected-accent-floor' : 'target',
        minGapSeconds: gaps.length ? Math.min(...gaps) : null,
        rapidPairs: gaps.filter(gap => gap < preferredGapSeconds - 1e-8).length,
        keptByRole: byRole(rows)}];
    }))};
  return {events: result, report};
}

/** Score button changes separately so a recurring-cell lane optimizer can
 * simplify fast gestures while keeping every chosen musical onset intact. */
export function measureEasyLaneChanges(rows, {rapidGapSeconds = .35, buttons} = {}) {
  const time = row => Array.isArray(row) ? row[0] : row.time;
  const tail = row => Array.isArray(row) ? row[0] + (row[2] || 0) : row.holdEnd ?? row.time;
  const button = (row, index) => buttons ? buttons[index] : Array.isArray(row) ? row[1] : row.button;
  let changes = 0, rapidPairs = 0, rapidChanges = 0, quickRun = 0, longestRapidChangeRun = 0;
  let sameRun = rows.length ? 1 : 0, maxSameKeyRun = sameRun, excessSwitches = 0;
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1], current = rows[index];
    const changed = button(current, index) !== button(previous, index - 1);
    const rapid = time(current) - tail(previous) < rapidGapSeconds - 1e-8;
    if (changed) changes++;
    if (rapid) rapidPairs++;
    if (rapid && changed) {rapidChanges++; quickRun++;} else quickRun = 0;
    longestRapidChangeRun = Math.max(longestRapidChangeRun, quickRun);
    if (quickRun > 2) excessSwitches += quickRun - 2;
    sameRun = changed ? 1 : sameRun + 1;
    maxSameKeyRun = Math.max(maxSameKeyRun, sameRun);
  }
  return {notes: rows.length, changes, rapidPairs, rapidChanges,
    rapidChangeRate: rapidPairs ? rapidChanges / rapidPairs : 0,
    longestRapidChangeRun, maxSameKeyRun, excessSwitches};
}

export function easyLaneEasePenalty(rows, options) {
  const value = measureEasyLaneChanges(rows, options);
  return value.rapidChanges * 2 + value.excessSwitches * 8;
}
