// Chart and fight-rule changes on top of the release's data/level1.json
// (build-moth.mjs writes the result; verify-moth-package.mjs checks nothing
// else changed).
//
// Level 2 (腥。禿油肥, 75 BPM): the release charted drum hits only, which left
// 72.6–83.8 s, three and a half bars where the drums drop out under the rap,
// without a note (owner, 2026-10-13). Those bars now follow the song's pulse
// like the drums either side: T on beats 1 and 3, O on 2 and 4. In-between
// notes (M on eighths, H on sixteenths) sit only where the rap or the band
// audibly attacks, measured on the Demucs stems: each within 45 ms of its step,
// inside the perfect window. Easy keeps one pickup per bar at most, like the
// rest of its chart. Taps only.
// A step is a sixteenth: time = step × 0.2 s − 1.033 s.
//
// Level 7 (the concert): full hype at the song's end needed 75% / 85% weighted
// accuracy (easy / hard), too thin a margin (owner, 2026-10-13: a 72% run on
// hard fell short). It now needs 60% / 70%, and the bar fills with every hit
// (moth-runtime-patches.mjs).
import assert from 'node:assert/strict';

export const CONCERT_HYPE_TARGET = { easy: 0.6, hard: 0.7 };
const CONCERT_NOTE = ['Hype grows with song progress; full hype requires 75%/85% weighted accuracy when the song ends. No early failure or secured climax.',
  'Hype fills with every hit, over 60%/70% of the whole song\'s weighted total: full hype secures the climax, and at the end it needs 60%/70% weighted accuracy (owner, 2026-10-13; was 75%/85%, growing with song progress). No early failure.'];

export const LEVEL2_BREAK = {
  after: 368, before: 424, // the release's notes either side (72.567 s, 83.767 s)
  easy: [[372, 'O'], [376, 'T'], [380, 'O'], [384, 'T'], [386, 'M'], [388, 'O'], [392, 'T'], [396, 'O'],
    [400, 'T'], [404, 'O'], [408, 'T'], [410, 'M'], [412, 'O'], [416, 'T'], [420, 'O']],
  hardExtra: [[371, 'H'], [379, 'H'], [390, 'M'], [391, 'H'], [395, 'H'], [402, 'M'], [411, 'H'], [422, 'M']]
};

// The same additions as text, so the data file's diff is just the new notes
// (re-serializing it would rewrite every 16.0 as 16).
export function patchChartsText(text) {
  const rhythm = text.indexOf('"level2BathroomRhythm": {');
  const chart = text.indexOf('"chart": {', rhythm);
  assert(rhythm > 0 && chart > rhythm, 'Level 2 chart');
  const added = { easy: LEVEL2_BREAK.easy, hard: [...LEVEL2_BREAK.easy, ...LEVEL2_BREAK.hardExtra] };
  for (const mode of ['easy', 'hard']) {
    const list = text.indexOf(`"${mode}": [`, chart);
    const anchor = `        [\n          ${LEVEL2_BREAK.before.toFixed(1)},\n`;
    const at = text.indexOf(anchor, list);
    assert(list > chart && at > list && text.lastIndexOf(`"${mode}": [`, at) === list, `Level 2 ${mode}: the note after the break`);
    const notes = added[mode].slice().sort((a, b) => a[0] - b[0])
      .map(([step, button]) => `        [\n          ${step.toFixed(1)},\n          "${button}",\n          0\n        ],\n`).join('');
    text = text.slice(0, at) + notes + text.slice(at);
  }
  const version = '      "version": "drum-groove-20261008b",\n';
  const at = text.indexOf(version, chart);
  assert(at > chart && at < text.indexOf('"easy": [', chart), 'Level 2 chart version');
  text = text.slice(0, at + version.length) + `      "breakNotes": ${JSON.stringify(breakNotes())},\n` + text.slice(at + version.length);
  const concert = text.indexOf('"level6ConcertRhythm": {');
  const target = '      "accuracyTarget": {\n        "easy": 0.75,\n        "hard": 0.85\n      },\n';
  const end = () => text.indexOf('\n  "', concert + 1); // the next top-level key
  const where = text.indexOf(target, concert);
  assert(concert > 0 && where > concert && where < end(), 'Concert hype target');
  text = text.slice(0, where) + `      "accuracyTarget": {\n        "easy": ${CONCERT_HYPE_TARGET.easy},\n        "hard": ${CONCERT_HYPE_TARGET.hard}\n      },\n` + text.slice(where + target.length);
  const note = text.indexOf(CONCERT_NOTE[0], concert);
  assert(note > concert && note < end(), 'Concert hype note');
  return text.slice(0, note) + CONCERT_NOTE[1] + text.slice(note + CONCERT_NOTE[0].length);
}

const breakNotes = () => ({ steps: [LEVEL2_BREAK.after, LEVEL2_BREAK.before], follows: 'the song pulse under the rap (no drums)', added: '2026-10-13' });

export function patchCharts(config) {
  const chart = config.level2BathroomRhythm.chart;
  const added = { easy: LEVEL2_BREAK.easy, hard: [...LEVEL2_BREAK.easy, ...LEVEL2_BREAK.hardExtra] };
  for (const mode of ['easy', 'hard']) {
    const notes = chart[mode];
    assert(!notes.some(([step]) => step > LEVEL2_BREAK.after && step < LEVEL2_BREAK.before), `Level 2 ${mode}: the break is not empty`);
    assert(notes.some(([step]) => step === LEVEL2_BREAK.after) && notes.some(([step]) => step === LEVEL2_BREAK.before), `Level 2 ${mode}: the notes either side moved`);
    chart[mode] = [...notes, ...added[mode].map(([step, button]) => [step, button, 0])].sort((a, b) => a[0] - b[0]);
  }
  chart.breakNotes = breakNotes();
  const crowd = config.level6ConcertRhythm.crowd;
  assert.deepEqual(crowd.accuracyTarget, { easy: 0.75, hard: 0.85 }, 'Concert hype target');
  crowd.accuracyTarget = { ...CONCERT_HYPE_TARGET };
  assert(crowd.note.includes(CONCERT_NOTE[0]));
  crowd.note = crowd.note.replace(CONCERT_NOTE[0], CONCERT_NOTE[1]);
  return config;
}
