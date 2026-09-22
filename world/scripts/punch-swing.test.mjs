import test from 'node:test';
import assert from 'node:assert/strict';
import { trackPunch, restingSwing, PUNCH_SPEED, PUNCH_COOLDOWN_MS } from '../src/world/PunchSwing.ts';

const AHEAD = [0, 0, -1];
/** Drive a hand along `path` at `step` ms a frame and collect the punches. */
const swing = (path, step = 14, forward = AHEAD) => {
  let state = restingSwing();
  const thrown = [];
  path.forEach((p, i) => {
    const r = trackPunch(state, p, i * step, forward);
    state = r.state;
    if (r.thrown) thrown.push({ frame: i, speed: +r.speed.toFixed(2) });
  });
  return thrown;
};
/** A hand moving `metresPerSecond` straight ahead, for `frames`. */
const jab = (mps, frames = 8, step = 14) =>
  Array.from({ length: frames }, (_, i) => [0, 0, -(mps * (i * step) / 1000)]);

test('a hand held still throws nothing', () => {
  assert.deepEqual(swing(Array.from({ length: 30 }, () => [0.2, 1.2, -0.3])), []);
});

test('a jab is thrown', () => {
  const hits = swing(jab(4));
  assert.equal(hits.length, 1, 'exactly one');
  assert.ok(hits[0].speed > PUNCH_SPEED);
});

test('one swing is one punch, not one a frame', () => {
  // 20 frames of fast movement inside one cooldown window (280ms of a 480ms
  // window). Without the cooldown this would be 19 punches.
  const hits = swing(jab(5, 20));
  assert.equal(hits.length, 1);
});

test('a long swing throws again only after the cooldown', () => {
  // 60 frames is 840ms: long enough for a second window to open, short
  // enough that a third cannot. Someone holding their arm out and running
  // should not machine-gun the room.
  const step = 14;
  const hits = swing(jab(5, 60, step));
  assert.equal(hits.length, 2, 'two punches across a long swing, not many');
  const gap = (hits[1].frame - hits[0].frame) * step;
  assert.ok(gap >= PUNCH_COOLDOWN_MS, `the second waited ${gap}ms`);
});

test('a slow reach is not a punch', () => {
  assert.deepEqual(swing(jab(1.2, 20)), []);
});

test('pulling the hand back is not a punch', () => {
  // Same speed, opposite direction: retracting a fist must not land one.
  const back = jab(5, 10).map(([x, y, z]) => [x, y, -z]);
  assert.deepEqual(swing(back), []);
});

test('lifting a drink is not a punch', () => {
  // Straight up, fast. Nothing about it is going where the visitor is looking.
  const up = Array.from({ length: 10 }, (_, i) => [0, 5 * (i * 14) / 1000, 0]);
  assert.deepEqual(swing(up), []);
});

test('a punch follows where the head is facing, not the world', () => {
  // Facing +X, so a swing along +X is the forward one.
  const alongX = Array.from({ length: 8 }, (_, i) => [4 * (i * 14) / 1000, 0, 0]);
  assert.equal(swing(alongX, 14, [1, 0, 0]).length, 1, 'thrown when facing +X');
  assert.deepEqual(swing(alongX, 14, AHEAD), [], 'not when facing -Z');
});

test('a dropped frame does not invent a punch', () => {
  // The hand moved a long way, but a second passed — a paused session, not a
  // swing. Measuring across it would report a huge speed.
  let state = restingSwing();
  state = trackPunch(state, [0, 1, 0], 0, AHEAD).state;
  const r = trackPunch(state, [0, 1, -3], 1000, AHEAD);
  assert.equal(r.thrown, false);
  assert.equal(r.speed, 0, 'and no speed is claimed at all');
});

test('two frames in the same millisecond are ignored, not divided by zero', () => {
  let state = restingSwing();
  state = trackPunch(state, [0, 1, 0], 100, AHEAD).state;
  const r = trackPunch(state, [0, 1, -0.5], 100, AHEAD);
  assert.equal(r.thrown, false);
  assert.ok(Number.isFinite(r.speed));
});

test('the very first frame of a session throws nothing', () => {
  const r = trackPunch(restingSwing(), [0, 1, -9], 0, AHEAD);
  assert.equal(r.thrown, false);
});
