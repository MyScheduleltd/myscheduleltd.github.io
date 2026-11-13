import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The sign-in page's loading bar (the owner, 2026-10-18; since 2026-11-12 it
// covers every download, and ENTER waits at 100%): the globe in steps, then bytes.
const bundle = await build({ entryPoints: ['src/ui/GateLoadMeter.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { GateLoadMeter } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('the globe moves in steps and only eases towards the next one, never reaching it', () => {
  const meter = new GateLoadMeter(0, { globe: true });
  assert.deepEqual(meter.read(0), { percent: 0, done: false });
  meter.globe('topology', 100);
  const waiting = meter.read(60_000).percent;
  assert.ok(waiting > 1 && waiting < 15, `a long wait for the code eases on but stops short of its step (${waiting}%)`);
  meter.globe('code', 60_000);
  assert.ok(meter.read(60_000).percent >= 15);
  assert.ok(meter.read(600_000).percent < 20, 'the globe is a fifth of the bar');
  meter.globe('painted', 600_000);
  assert.equal(meter.globeShown, true);
  assert.deepEqual(meter.read(600_000), { percent: 20, done: false }, 'and the downloads are the rest');
});

test('the bar is mostly bytes, and is done only when the globe and every download are there', () => {
  const meter = new GateLoadMeter(0, { globe: true });
  meter.globe('painted', 10);
  meter.downloads(.5, false);
  assert.equal(meter.read(20).percent, 60);
  meter.downloads(1, false);
  assert.equal(meter.read(30).done, false);
  assert.equal(meter.read(30).percent, 99, 'nothing reads 100 until every download has settled');
  meter.downloads(1, true);
  assert.deepEqual(meter.read(40), { percent: 100, done: true });
});

test('without a globe to wait for, the bar is the downloads alone', () => {
  const meter = new GateLoadMeter(0, { globe: false });
  meter.downloads(.25, false);
  assert.equal(meter.read(0).percent, 25);
  meter.downloads(0, true);
  assert.equal(meter.done, true);
});

test('the percentage never goes backwards, even when a download restarts', () => {
  const meter = new GateLoadMeter(0, { globe: false });
  meter.downloads(.6, false);
  assert.equal(meter.read(0).percent, 60);
  meter.downloads(.1, false);
  assert.equal(meter.read(10).percent, 60);
});
