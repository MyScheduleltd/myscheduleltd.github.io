import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The sign-in page's loading bar (the owner, 2026-10-18): one bar, as a
// percentage, for the globe and then the character.
const bundle = await build({ entryPoints: ['src/ui/GateLoadMeter.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { GateLoadMeter } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('the globe moves in steps and only eases towards the next one, never reaching it', () => {
  const meter = new GateLoadMeter(0, { globe: true, character: false });
  assert.deepEqual(meter.read(0), { percent: 0, stage: 'world', done: false });
  meter.globe('topology', 100);
  const waiting = meter.read(60_000).percent;
  assert.ok(waiting > 8 && waiting < 75, `a long wait for the code eases on but stops short of its step (${waiting}%)`);
  meter.globe('code', 60_000);
  assert.ok(meter.read(60_000).percent >= 75);
  assert.ok(meter.read(600_000).percent < 100, 'nothing reads 100 until the globe has painted');
  meter.globe('painted', 600_000);
  assert.deepEqual(meter.read(600_000), { percent: 100, stage: 'world', done: true }, 'a phone has no character to wait for');
});

test('with the character, the bar is mostly its bytes, and is done only when both are there', () => {
  const meter = new GateLoadMeter(0, { globe: true, character: true });
  meter.globe('topology', 0);
  meter.characterProgress(.5);
  assert.equal(meter.read(0).stage, 'world');
  meter.globe('painted', 10);
  const half = meter.read(10);
  assert.equal(half.stage, 'character');
  assert.equal(half.percent, Math.floor((.35 + .65 * .5) * 100));
  meter.characterProgress(.99);
  assert.equal(meter.read(20).done, false);
  assert.ok(meter.read(20).percent <= 99);
  meter.characterProgress(1);
  assert.deepEqual(meter.read(30), { percent: 100, stage: 'character', done: true });
});

test('the percentage never goes backwards, even when a download restarts', () => {
  const meter = new GateLoadMeter(0, { globe: false, character: true });
  meter.characterProgress(.6);
  assert.equal(meter.read(0).percent, 60);
  // A mirror copy that failed its check is fetched again from the start.
  meter.characterProgress(.1);
  assert.equal(meter.read(1).percent, 60);
  meter.globe('topology', 2);
  assert.equal(meter.read(3).percent, 60, 'a step already passed changes nothing');
});

test('a body chosen after everything loaded gets a bar of its own, from where its download already is', () => {
  const meter = new GateLoadMeter(0, { globe: false, character: true });
  assert.equal(meter.read(0).stage, 'character');
  meter.characterProgress(.4);
  assert.equal(meter.read(0).percent, 40);
  meter.characterProgress(1);
  assert.equal(meter.done, true);
});
