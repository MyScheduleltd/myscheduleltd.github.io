import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The loading page waits for a sleeping server and says so (the owner, 2026-11-09).
const bundle = await build({ entryPoints: ['src/network/ServiceWake.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const {
  ServiceWake, entryProgress, serviceCanSleep, WAKING_AFTER_MS, GIVE_UP_AFTER_MS, TYPICAL_WAKE_MS, WAKE_SHARE,
} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('an awake server answers before anything is said about waking', () => {
  const wake = new ServiceWake(1_000);
  assert.deepEqual(wake.read(1_300), { state: 'asking', progress: 0, seconds: 0 });
  wake.answered(1_320);
  assert.deepEqual(wake.read(5_000), { state: 'awake', progress: 1, seconds: 0 });
  assert.equal(wake.holds(5_000), false);
  assert.equal(wake.remaining(5_000), 0);
});

test('a sleeping server shows as waking, and the clock never claims it has woken', () => {
  const wake = new ServiceWake(0);
  assert.equal(wake.read(WAKING_AFTER_MS - 1).state, 'asking');
  const early = wake.read(WAKING_AFTER_MS);
  assert.equal(early.state, 'waking');
  assert.ok(early.progress > 0 && early.progress < .1);
  const typical = wake.read(TYPICAL_WAKE_MS);
  assert.ok(typical.progress > .7 && typical.progress < .9, `a typical wake reads ${typical.progress}`);
  assert.equal(typical.seconds, 60);
  let last = 0;
  for (let at = 0; at <= GIVE_UP_AFTER_MS * 2; at += 1_000) {
    const { progress } = wake.read(at);
    assert.ok(progress >= last && progress < 1, `${at} ms reads ${progress}`);
    last = progress;
  }
  assert.ok(wake.holds(GIVE_UP_AFTER_MS - 1));
  assert.equal(wake.remaining(GIVE_UP_AFTER_MS - 1_000), 1_000);
});

test('the loading page stops holding a visitor after two minutes', () => {
  const wake = new ServiceWake(0);
  assert.equal(wake.read(GIVE_UP_AFTER_MS).state, 'unreachable');
  assert.equal(wake.holds(GIVE_UP_AFTER_MS), false);
  // It may still answer later, and then it is simply awake.
  wake.answered(GIVE_UP_AFTER_MS + 30_000);
  assert.equal(wake.read(GIVE_UP_AFTER_MS + 40_000).state, 'awake');
  assert.equal(wake.read(GIVE_UP_AFTER_MS + 40_000).seconds, 150);
});

test('the bar mixes the world and the server only when ENTER found it asleep', () => {
  assert.equal(entryProgress(.5, 0, 0), .5, 'an awake server changes nothing');
  assert.equal(entryProgress(1, 1, WAKE_SHARE), 1);
  assert.ok(Math.abs(entryProgress(1, 0, WAKE_SHARE) - .7) < 1e-9, 'the world done, the server not');
  assert.ok(Math.abs(entryProgress(0, 1, WAKE_SHARE) - .3) < 1e-9);
  assert.equal(entryProgress(Number.NaN, 2, 5), 1);
  assert.equal(entryProgress(-1, -1, -1), 0);
});

test('only a hosted server is waited for; loopback review opts in with ?wake=1', () => {
  assert.equal(serviceCanSleep('https://myschedule-festival.onrender.com', 'myscheduleltd.com', ''), true);
  assert.equal(serviceCanSleep('http://127.0.0.1:8797', 'localhost', '?era=ps2&island'), false);
  assert.equal(serviceCanSleep('http://127.0.0.1:8798', 'localhost', '?era=ps2&island&wake=1'), true);
  assert.equal(serviceCanSleep('http://127.0.0.1:8798', 'myscheduleltd.com', '?wake=1'), false);
  assert.equal(serviceCanSleep('not a url', 'localhost', '?wake=1'), false);
});
