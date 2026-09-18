import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stepAvoidance, easeTowards, AVOIDANCE_OFFSETS, AVOIDANCE_EASE_SECONDS,
  AVOIDANCE_CLEAR_FRACTION,
} from '../src/world/CameraAvoidance.ts';

const FRAME = 1 / 60;
const PREFERRED = 7.4;

/**
 * A world where the view is blocked straight back and clear to one side.
 *
 * Wide enough that leaning slightly aside does not escape it — the first rung
 * of the ladder still hits it — so the tests below exercise a swing that is
 * actually worth the name rather than a nudge.
 */
const blockedBehind = (clearSide) => (offset) => {
  if (Math.abs(offset) < 0.75) return 2.0;
  return Math.sign(offset) === clearSide ? PREFERRED : 2.4;
};

const settle = (state, reachAt, frames = 240, steerAllowed = true) => {
  let result;
  for (let frame = 0; frame < frames; frame += 1) {
    result = stepAvoidance(state, { reachAt, preferred: PREFERRED, steerAllowed, delta: FRAME });
    state.side = result.side;
    state.offset = result.offset;
  }
  return result;
};

test('a clear view is never swung at all', () => {
  const state = { side: 0, offset: 0 };
  const result = settle(state, () => PREFERRED);
  assert.equal(result.offset, 0);
  assert.equal(result.side, 0);
});

test('a blocked view swings to the side that is actually clear', () => {
  for (const clearSide of [1, -1]) {
    const state = { side: 0, offset: 0 };
    const result = settle(state, blockedBehind(clearSide));
    assert.equal(Math.sign(result.offset), clearSide, `should have gone ${clearSide}`);
    assert.ok(result.available > 2.4, 'the swing has to buy some distance');
  }
});

test('the swing arrives as a drift, never in one frame', () => {
  // A camera that jumped to its alternate in a single frame is the lurch the
  // owner reported. One frame may move it only a few percent of the way.
  const state = { side: 0, offset: 0 };
  const first = stepAvoidance(state, {
    reachAt: blockedBehind(1), preferred: PREFERRED, steerAllowed: true, delta: FRAME,
  });
  assert.ok(Math.abs(first.offset) < 0.1, `moved ${first.offset.toFixed(3)} rad in one frame`);
});

test('walking past an obstruction never flips the committed side', () => {
  // The reported dizziness. Two systems used to share one field and overrule
  // each other every frame; this is the behaviour that must hold.
  const state = { side: 0, offset: 0 };
  settle(state, blockedBehind(1));
  const committed = state.side;
  assert.ok(committed === 1 || committed === -1);

  // Now make the far side very marginally better, over and over. The margin
  // for taking a NEW side must refuse to be tempted.
  let flips = 0;
  for (let frame = 0; frame < 600; frame += 1) {
    const jitter = Math.sin(frame * 0.7) * 0.2;
    const reachAt = (offset) => {
      if (Math.abs(offset) < 0.2) return 2.0;
      return Math.sign(offset) === 1 ? PREFERRED - 0.3 + jitter : PREFERRED - 0.3 - jitter;
    };
    const result = stepAvoidance(state, { reachAt, preferred: PREFERRED, steerAllowed: true, delta: FRAME });
    if (result.side !== 0 && state.side !== 0 && result.side !== state.side) flips += 1;
    state.side = result.side;
    state.offset = result.offset;
  }
  assert.equal(flips, 0, `the view changed sides ${flips} times while walking`);
});

test('on stairs the view does not swing at all, whatever is in the way', () => {
  // The NIMA ROOFTOP stairs. The ground under the camera changes step by step,
  // so every frame answers "how far can I see that way" differently. A view
  // that acts on those answers is the one that rotated everywhere.
  const state = { side: 0, offset: 0 };
  const result = settle(state, blockedBehind(1), 240, false);
  assert.equal(result.offset, 0, 'a swing on a staircase is exactly the fault');
  assert.equal(result.side, 0);
});

test('stepping onto stairs unwinds an existing swing instead of dropping it', () => {
  const state = { side: 0, offset: 0 };
  settle(state, blockedBehind(1));
  const carried = state.offset;
  assert.ok(Math.abs(carried) > 0.5, 'precondition: the view was swung');

  // One frame on the stairs must ease it back, not snap it straight.
  const first = stepAvoidance(state, {
    reachAt: blockedBehind(1), preferred: PREFERRED, steerAllowed: false, delta: FRAME,
  });
  assert.ok(Math.abs(first.offset) < Math.abs(carried), 'it should be unwinding');
  assert.ok(Math.abs(first.offset) > Math.abs(carried) * 0.9, 'but not snapping to zero');

  state.side = first.side; state.offset = first.offset;
  const settled = settle(state, blockedBehind(1), 240, false);
  assert.equal(settled.offset, 0, 'and it arrives at straight');
});

test('a view that becomes clear again gives the swing back', () => {
  const state = { side: 0, offset: 0 };
  settle(state, blockedBehind(1));
  assert.ok(Math.abs(state.offset) > 0.5);
  const result = settle(state, () => PREFERRED);
  assert.equal(result.offset, 0, 'the camera must return to the orbit that was asked for');
  assert.equal(result.side, 0, 'and stop claiming a side');
});

test('a marginal blockage holds what it has rather than re-deciding', () => {
  // Between "clear" and "badly blocked" nothing is re-chosen. Re-deciding in
  // that band is what made a borderline call oscillate.
  const state = { side: 1, offset: 0.8 };
  const between = PREFERRED * ((AVOIDANCE_CLEAR_FRACTION + 0.8) / 2);
  const result = stepAvoidance(state, {
    reachAt: (offset) => (offset === 0 ? between : PREFERRED),
    preferred: PREFERRED, steerAllowed: true, delta: FRAME,
  });
  assert.ok(Math.abs(result.offset - 0.8) < 0.01, `it moved to ${result.offset.toFixed(3)}`);
  assert.equal(result.side, 1);
});

test('the ease has the shape it claims, and tolerates a missing frame time', () => {
  // One time constant is about 63 percent of the way there.
  const after = easeTowards(0, 1, AVOIDANCE_EASE_SECONDS, AVOIDANCE_EASE_SECONDS);
  assert.ok(Math.abs(after - 0.632) < 0.005, `got ${after.toFixed(3)}`);
  assert.equal(easeTowards(0, 1, Number.NaN, AVOIDANCE_EASE_SECONDS) > 0, true);
  assert.equal(easeTowards(Number.NaN, 0.5, FRAME, AVOIDANCE_EASE_SECONDS), 0.5);
});

test('a state arriving with nonsense in it is not trusted', () => {
  const result = stepAvoidance({ side: 7, offset: Number.NaN }, {
    reachAt: () => PREFERRED, preferred: PREFERRED, steerAllowed: true, delta: FRAME,
  });
  assert.ok(Number.isFinite(result.offset));
  assert.equal(result.side, 0);
});

test('going right round is only ever tried one way', () => {
  // Both hands reaching for PI is the same view twice, and swinging the long
  // way to reach it is a full rotation of the world.
  const tried = [];
  stepAvoidance({ side: 0, offset: 0 }, {
    reachAt: (offset) => { tried.push(offset); return offset === 0 ? 1 : 1.2; },
    preferred: PREFERRED, steerAllowed: true, delta: FRAME,
  });
  assert.ok(tried.includes(Math.PI), 'the whole way round must be on the ladder');
  assert.ok(!tried.includes(-Math.PI), 'but only once');
  assert.ok(AVOIDANCE_OFFSETS.every((offset) => offset > 0), 'the ladder itself is one-sided');
});

// --- pinch ------------------------------------------------------------------

const { pinchZoom, pinchSpread, PINCH_DEAD_ZONE, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX } =
  await import('../src/world/CameraInput.ts');

test('spreading the fingers brings the camera in, pinching pushes it out', () => {
  // The one that is easy to get backwards. `zoom` is a multiple of the resting
  // distance, so a bigger spread must divide it.
  assert.ok(pinchZoom(1, 100, 200) < 1, 'fingers apart should close the distance');
  assert.ok(pinchZoom(1, 200, 100) > 1, 'fingers together should open it up');
});

test('the zoom stays between its limits however hard you pull', () => {
  assert.equal(pinchZoom(1, 10, 10000), CAMERA_ZOOM_MIN);
  assert.equal(pinchZoom(1, 10000, 10), CAMERA_ZOOM_MAX);
});

test('a resting hand does not make the view breathe', () => {
  // Two fingers on glass are never quite still and a phone reports the tremor.
  const held = pinchZoom(1, 200, 200 + PINCH_DEAD_ZONE * 0.9);
  assert.equal(held, 1, 'a tremor under the dead zone must change nothing');
  assert.notEqual(pinchZoom(1, 200, 200 + PINCH_DEAD_ZONE * 4), 1, 'a real move must still count');
});

test('the first frame of a pinch and any nonsense leave the zoom alone', () => {
  // The caller assigns the result unconditionally, so this must be safe.
  for (const [previous, spread] of [[0, 120], [120, 0], [Number.NaN, 120], [120, Number.NaN], [-4, 120]]) {
    assert.equal(pinchZoom(1.4, previous, spread), 1.4, `${previous} -> ${spread} should be ignored`);
  }
});

test('a pinch that returns to where it started returns the zoom with it', () => {
  // Step out and back in the same number of steps; drift would mean the
  // gesture leaves the camera somewhere it was never asked to be.
  let zoom = 1;
  const spreads = [100, 130, 170, 220, 170, 130, 100];
  for (let i = 1; i < spreads.length; i += 1) zoom = pinchZoom(zoom, spreads[i - 1], spreads[i]);
  assert.ok(Math.abs(zoom - 1) < 1e-9, `the zoom drifted to ${zoom}`);
});

test('the spread is the plain distance between two fingers', () => {
  assert.equal(pinchSpread({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(pinchSpread({ x: 10, y: 10 }, { x: 10, y: 10 }), 0);
});
