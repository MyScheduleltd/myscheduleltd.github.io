import test from 'node:test';
import assert from 'node:assert/strict';
import {
  videoSyncPlan, videoJoinTime, wrapToDuration, bufferedAheadOf,
  SYNC_TOLERANCE_SECONDS, SYNC_SEEK_SECONDS, SYNC_MAX_RATE_NUDGE, JOIN_FROM_START_SECONDS,
} from '../src/world/VideoSync.ts';

const FILM = 204.6; // Skibidi, the clip actually being tested in the headset.
const playing = (over) => ({ current: 0, target: 0, duration: FILM, readyState: 4, ...over });

test('a screen already on the clock is left completely alone', () => {
  const plan = videoSyncPlan(playing({ current: 40, target: 40.1 }));
  assert.equal(plan.seekTo, undefined);
  assert.equal(plan.playbackRate, 1);
});

test('ordinary drift is walked off, never seeked', () => {
  // This is the whole point: the old code sat on up to four seconds of drift
  // and then yanked the playhead, which in a headset is a visible hitch.
  for (const drift of [0.4, 1, 2, 4.9]) {
    const plan = videoSyncPlan(playing({ current: 40, target: 40 + drift }));
    assert.equal(plan.seekTo, undefined, `drift of ${drift}s should not seek`);
    assert.ok(plan.playbackRate > 1, `drift of ${drift}s should hurry the film`);
    assert.ok(plan.playbackRate <= 1 + SYNC_MAX_RATE_NUDGE + 1e-9, `drift of ${drift}s bent the clock too far`);
  }
});

test('a screen that has run ahead is slowed, not rewound', () => {
  const plan = videoSyncPlan(playing({ current: 42, target: 40 }));
  assert.equal(plan.seekTo, undefined);
  assert.ok(plan.playbackRate < 1);
  assert.ok(plan.playbackRate >= 1 - SYNC_MAX_RATE_NUDGE - 1e-9);
});

test('the nudge pulls harder the further behind a screen is', () => {
  const near = videoSyncPlan(playing({ current: 40, target: 40.5 })).playbackRate;
  const far = videoSyncPlan(playing({ current: 40, target: 42 })).playbackRate;
  assert.ok(far > near, 'a bigger gap should close faster');
});

test('a gap too wide to walk off is seeked', () => {
  const plan = videoSyncPlan(playing({ current: 10, target: 10 + SYNC_SEEK_SECONDS + 1 }));
  assert.equal(plan.seekTo, 10 + SYNC_SEEK_SECONDS + 1);
  assert.equal(plan.playbackRate, 1, 'a seek lands on the clock, so the rate goes back to normal');
});

test('the nudge actually converges — drift shrinks to nothing and stays there', () => {
  // Walk the policy forward a second at a time against a clock that keeps
  // running, and prove it settles instead of oscillating or stalling out.
  let current = 40;
  const start = 43; // three seconds behind
  let target = start;
  let seeks = 0;
  for (let step = 0; step < 400; step += 1) {
    const plan = videoSyncPlan(playing({ current, target }));
    if (plan.seekTo !== undefined) { current = plan.seekTo; seeks += 1; }
    current += plan.playbackRate * 0.25;
    target += 0.25;
  }
  assert.equal(seeks, 0, 'three seconds of drift should never have needed a seek');
  assert.ok(Math.abs(target - current) <= SYNC_TOLERANCE_SECONDS,
    `drift settled at ${(target - current).toFixed(3)}s, outside tolerance`);
});

test('a loop point is not mistaken for being a whole film behind', () => {
  // A screen two seconds from the end, told the screening is one second in,
  // is two seconds from arriving there on its own. Reading that as 203
  // seconds of drift and seeking backwards is the bug this guards.
  const plan = videoSyncPlan(playing({ current: FILM - 2, target: 1 }));
  assert.equal(plan.seekTo, undefined);
  assert.ok(plan.playbackRate > 1, 'it is behind by three seconds the short way round');
});

test('and the same the other way over the join', () => {
  const plan = videoSyncPlan(playing({ current: 1, target: FILM - 2 }));
  assert.equal(plan.seekTo, undefined);
  assert.ok(plan.playbackRate < 1);
});

test('a screen stalled for data is not asked to run faster', () => {
  const plan = videoSyncPlan(playing({ current: 40, target: 42, buffering: true }));
  assert.equal(plan.playbackRate, 1, 'hurrying a stalled screen only asks for more of what it has not got');
  assert.equal(plan.seekTo, undefined);
});

test('nothing is corrected before the film has any metadata', () => {
  const plan = videoSyncPlan({ current: 0, target: 90, duration: NaN, readyState: 0 });
  assert.equal(plan.seekTo, undefined);
  assert.equal(plan.playbackRate, 1);
});

test('joining at the top of a film costs no seek at all', () => {
  assert.equal(videoJoinTime(0, FILM), undefined);
  assert.equal(videoJoinTime(JOIN_FROM_START_SECONDS - 0.1, FILM), undefined);
});

test('joining a screening in progress seeks to where it is', () => {
  assert.equal(videoJoinTime(90, FILM), 90);
  // Past the end means a later pass through a looping film.
  assert.ok(Math.abs(videoJoinTime(FILM + 30, FILM) - 30) < 1e-9);
});

test('a duration that is not known yet never produces a nonsense seek', () => {
  assert.equal(wrapToDuration(90, 0), 90);
  assert.equal(wrapToDuration(90, NaN), 90);
  assert.equal(wrapToDuration(-5, 0), 0);
  assert.equal(wrapToDuration(NaN, FILM), 0);
});

const ranges = (pairs) => ({
  length: pairs.length,
  start: (index) => pairs[index][0],
  end: (index) => pairs[index][1],
});

test('buffer ahead counts only the stretch under the playhead', () => {
  assert.equal(bufferedAheadOf(ranges([[0, 30]]), 10), 20);
  // A stretch fetched further on does nothing for the next frame.
  assert.equal(bufferedAheadOf(ranges([[0, 12], [100, 140]]), 20), 0);
  assert.equal(bufferedAheadOf(ranges([[0, 12], [100, 140]]), 120), 20);
  assert.equal(bufferedAheadOf(undefined, 10), 0);
  assert.equal(bufferedAheadOf(ranges([]), 10), 0);
});
