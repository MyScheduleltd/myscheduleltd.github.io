import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planRenderScale, RENDER_SCALE_FLOOR, RENDER_SCALE_LOW_FPS, RENDER_SCALE_HIGH_FPS,
} from '../src/world/RenderScale.ts';

const PHONE = RENDER_SCALE_FLOOR.lite;

test('a phone is allowed further down than a desk', () => {
  // The whole point of the change: the ramp used to refuse to run at all in
  // the mode phones are given, which is the only place it was needed.
  assert.ok(RENDER_SCALE_FLOOR.lite < RENDER_SCALE_FLOOR.normal);
});

test('a struggling picture loses resolution, one step at a time', () => {
  let scale = 1;
  const seen = [];
  for (let window = 0; window < 12; window += 1) {
    const plan = planRenderScale(scale, 30, PHONE);
    scale = plan.scale;
    seen.push(scale);
  }
  assert.equal(scale, PHONE, 'it should reach the floor');
  assert.ok(seen[0] < 1 && seen[0] > PHONE, 'and not arrive in one jump');
});

test('it never goes below the floor or above full resolution', () => {
  assert.equal(planRenderScale(PHONE, 5, PHONE).scale, PHONE);
  assert.equal(planRenderScale(PHONE, 5, PHONE).changed, false);
  assert.equal(planRenderScale(1, 120, PHONE).scale, 1);
  assert.equal(planRenderScale(1, 120, PHONE).changed, false);
});

test('a picture with room to spare gets its sharpness back', () => {
  // The old ramp was one-way, so a single slow patch left the world soft for
  // the rest of the visit.
  let scale = PHONE;
  for (let window = 0; window < 40; window += 1) scale = planRenderScale(scale, 60, PHONE).scale;
  assert.equal(scale, 1);
});

test('recovery is slower than retreat', () => {
  const down = 1 - planRenderScale(1, 20, PHONE).scale;
  const up = planRenderScale(PHONE, 60, PHONE).scale - PHONE;
  assert.ok(down > up, 'dropping must be quicker than climbing back');
});

test('a device sitting between the thresholds is left alone', () => {
  // The oscillation guard, and the reason the two thresholds are far apart: a
  // resolution that changes every few seconds is worse than a low one that
  // holds still.
  const between = (RENDER_SCALE_LOW_FPS + RENDER_SCALE_HIGH_FPS) / 2;
  for (const scale of [0.5, 0.66, 0.84, 1]) {
    assert.equal(planRenderScale(scale, between, PHONE).changed, false,
      `${scale} moved at ${between}fps`);
  }
});

test('the ramp settles instead of hunting, on a device that is genuinely marginal', () => {
  // Model a device whose frame rate improves as resolution drops. Without the
  // gap between the thresholds this is the case that oscillates for ever.
  let scale = 1;
  let changes = 0;
  for (let window = 0; window < 200; window += 1) {
    // 38fps at full resolution, rising as the scale falls.
    const fps = 38 + (1 - scale) * 30;
    const plan = planRenderScale(scale, fps, PHONE);
    if (plan.changed) changes += 1;
    scale = plan.scale;
  }
  assert.ok(changes < 12, `the resolution changed ${changes} times and never settled`);
  assert.ok(scale > PHONE && scale <= 1, `settled at ${scale}`);
});

test('a window with no frames in it changes nothing', () => {
  for (const fps of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const plan = planRenderScale(0.8, fps, PHONE);
    if (Number.isFinite(fps) && fps > 0) continue;
    assert.equal(plan.changed, false, `${fps} should be ignored`);
    assert.equal(plan.scale, 0.8);
  }
});

test('a scale arriving out of range is brought back into it', () => {
  assert.equal(planRenderScale(4, 60, PHONE).scale, 1);
  assert.equal(planRenderScale(0.1, 60, PHONE).scale > 0.1, true);
  assert.ok(Number.isFinite(planRenderScale(Number.NaN, 60, PHONE).scale));
});
