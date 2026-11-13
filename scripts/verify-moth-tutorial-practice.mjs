// Test the patched warm-up on the real rhythm methods with a controlled clock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { patchMothRuntime } from './moth-runtime-patches.mjs';

const require = createRequire(import.meta.url);
const ts = require(process.env.MOTH_TYPESCRIPT_PATH || '/Users/myscheduleai/Desktop/myschedule-pivot/band-repair-20261004/world/node_modules/typescript/lib/typescript.js');
const release = fs.readFileSync(new URL('../.qa/moth/published/src/game.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('runtime.js', patchMothRuntime(release, ts), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const game = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'BobbyGame');
const names = new Set([
  'createLevel1OfficeRhythmState', 'advanceLevel1OfficeTutorial', 'getLevel1OfficeActionForKey',
  'getLevel1OfficeRenderTime', 'getLevel1OfficeInputTime', 'getLevel1OfficeRenderNotes',
  'handleLevel1OfficeRhythmPress', 'handleLevel1OfficeRhythmRelease',
  'advanceLevel1OfficePractice', 'scheduleLevel1OfficePracticeNote',
  'registerLevel1OfficeTutorialMiss', 'completeLevel1OfficeHold',
  'updateLevel1OfficeHolds', 'updateLevel1OfficeRhythm', 'releaseHeldInputs'
]);
const methods = game.members.filter(node => names.has(node.name?.getText(ast))).map(node => node.getText(ast));
assert.equal(methods.length, names.size);
const constants = new Set([
  'MOTH_RHYTHM_RING', 'MOTH_BUTTONS', 'MOTH_ACTION_OF_BUTTON', 'MOTH_KEY_CODES', 'MOTH_HOLD_GRACE',
  'LEVEL1_OFFICE_TIMING_SCORE', 'LEVEL1_OFFICE_STAMP_DURATION', 'LEVEL1_OFFICE_PROP_ROWS'
]);
const definitions = ast.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(decl => constants.has(decl.name.getText(ast))))
  .map(node => node.getText(ast));
assert.equal(definitions.length, constants.size);
const Practice = new Function(definitions.join('\n') + '\nreturn class Practice {\n' + methods.join('\n') + '\n}')();

function practice() {
  const g = new Practice();
  const spec = { missWindow: 0.22, perfectWindow: 0.075 };
  const noop = () => {};
  Object.assign(g, {
    state: 'playing', score: 0, time: 0, keys: new Set(), mobileHeldActions: new Set(),
    tr: english => english, getDifficulty: () => ({ hardPhrases: false }), getDialogueLines: () => ['Last intro line'],
    getActiveRhythmSpec: () => spec, getRhythmSpecFor: () => spec,
    audioRecoveryVisible: () => false, isFightSongStalled: () => false,
    isBathroomRhythm: () => false, isArcadeRhythm: () => false, isConcertRhythm: () => false,
    isMassageRhythm: () => false, playRhythmHitSfx: () => true, playLevel1OfficeTone: noop,
    playRhythmMissSfx: noop, stopRhythmFeedback: noop, haptic: noop, celebrateRhythmCombo: noop,
    nudgeLevel1OfficeNotesOntoHits: noop, resetGamepadInput: noop, getLevel3RhythmLanes: () => [],
    registerLevel1OfficeMiss: () => assert.fail('Practice must never register a scored miss')
  });
  const rhythm = g.level1OfficeRhythm = g.createLevel1OfficeRhythmState();
  const tutorial = rhythm.tutorial;
  assert(g.advanceLevel1OfficeTutorial());
  assert.equal(tutorial.mode, 'practice');
  const press = (note, key = 'Key' + note.button) => {
    tutorial.time = note.time;
    assert(g.handleLevel1OfficeRhythmPress(key, performance.now()));
  };
  return { g, rhythm, tutorial, press };
}

function reachHold() {
  const run = practice();
  const { g, tutorial, press } = run;
  for (const [index, button] of ['T', 'O', 'M', 'H'].entries()) {
    const note = tutorial.notes[index];
    assert.equal(note.button, button);
    assert.equal(note.holdEnd, undefined);
    press(note);
    assert.equal(tutorial.noteIndex, index + 1);
    assert.equal(tutorial.mode, 'practice');
  }
  const hold = tutorial.notes[tutorial.noteIndex];
  assert.equal(hold.button, 'T');
  assert(Math.abs(hold.holdEnd - hold.time - 1.2) < 1e-8);
  return { ...run, hold };
}

test('warm-up uses four distinct taps, then keeps the hold active beyond its attack window', () => {
  const { g, rhythm, tutorial, hold, press } = reachHold();
  press(hold);
  assert(hold.holding);
  assert.equal(tutorial.noteIndex, 4);
  assert.equal(tutorial.mode, 'practice');
  g.updateLevel1OfficeRhythm(0.6);
  assert(hold.holding);
  assert.equal(tutorial.mistakes, 0);
  assert.deepEqual(g.getLevel1OfficeRenderNotes(), [hold]);
  g.updateLevel1OfficeRhythm(0.7);
  assert(hold.holdDone);
  assert.equal(tutorial.mode, 'practice');
  assert.equal(rhythm.judgment.text, 'HOLD COMPLETE');
  g.updateLevel1OfficeRhythm(0.7);
  assert.equal(tutorial.mode, 'complete');
  assert.deepEqual([g.score, rhythm.combo, rhythm.roundScore, rhythm.perfects, rhythm.misses], [0, 0, 0, 0, 0]);
});

test('an early release retries the same hold with its full tail and no scored miss', () => {
  const { g, rhythm, tutorial, hold, press } = reachHold();
  press(hold);
  const time = hold.time;
  tutorial.time += 0.25;
  assert(g.handleLevel1OfficeRhythmRelease('T', performance.now()));
  assert.equal(tutorial.noteIndex, 4);
  assert.equal(tutorial.mistakes, 1);
  assert.equal(rhythm.misses, 0);
  assert.equal(rhythm.judgment.detail, 'RELEASED EARLY · KEEP T HELD');
  assert.equal(hold.status, 'pending');
  assert(!hold.holding && !hold.holdBroken && hold.time > time);
  assert(Math.abs(hold.holdEnd - hold.time - 1.2) < 1e-8);
  press(hold);
  tutorial.time = hold.holdEnd - 0.06;
  assert(g.handleLevel1OfficeRhythmRelease('T', performance.now()));
  assert(hold.holdDone);
  g.updateLevel1OfficeRhythm(0.7);
  assert.equal(tutorial.mode, 'complete');
});

test('system input reset retries an active practice hold without penalizing the player', () => {
  const { g, rhythm, tutorial, hold, press } = reachHold();
  press(hold);
  g.releaseHeldInputs();
  assert.equal(hold.status, 'pending');
  assert.equal(rhythm.holds.T, undefined);
  assert.equal(tutorial.mistakes, 0);
  assert.equal(rhythm.judgment, null);
  assert(Math.abs(hold.holdEnd - hold.time - 1.2) < 1e-8);
});
