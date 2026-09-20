import test from 'node:test';
import assert from 'node:assert/strict';
import {
  placePrivateScreening, privateOffset, playsInsideHeadset,
} from '../src/world/PrivateScreening.ts';

const SKIBIDI = { id: 'f1', title: 'SKIBIDI', youtubeId: 'jiawzYgfkuI', immersiveUrl: 'https://example.test/a.mp4' };
const YOUTUBE_ONLY = { id: 'f2', title: 'ANOTHER', youtubeId: 'abc' };
const at = (film, startedAt = 0, offsetSeconds = 0) => ({ film, offsetSeconds, startedAt });

test('only a film with a direct source can play inside a session', () => {
  // A cross-origin YouTube iframe cannot become a WebGL texture. No amount of
  // wanting it to changes that, so the distinction is load-bearing.
  assert.equal(playsInsideHeadset(SKIBIDI), true);
  assert.equal(playsInsideHeadset(YOUTUBE_ONLY), false);
  assert.equal(playsInsideHeadset(undefined), false);
});

test('seated in a venue, the private film takes that venue screen', () => {
  const where = placePrivateScreening(at(SKIBIDI), 'shore', true);
  assert.deepEqual(where, { kind: 'venue', venue: 'shore' });
});

test('away from any projector it falls back to a personal panel', () => {
  // The club hands out private tracks at the DJ booth, where there is no screen.
  assert.deepEqual(placePrivateScreening(at(SKIBIDI), undefined, true), { kind: 'panel' });
});

test('a YouTube-only film is never placed in the world', () => {
  assert.deepEqual(placePrivateScreening(at(YOUTUBE_ONLY), 'shore', true), { kind: 'none' });
  assert.deepEqual(placePrivateScreening(at(YOUTUBE_ONLY), undefined, true), { kind: 'none' });
});

test('outside a headset nothing is placed — the flat player is still the player', () => {
  assert.deepEqual(placePrivateScreening(at(SKIBIDI), 'shore', false), { kind: 'none' });
});

test('no screening, no placement', () => {
  assert.deepEqual(placePrivateScreening(undefined, 'shore', true), { kind: 'none' });
});

test('the offset follows the clock from where it started', () => {
  const s = at(SKIBIDI, 1_000, 30);
  assert.equal(privateOffset(s, 1_000, 200), 30);
  assert.equal(privateOffset(s, 11_000, 200), 40, 'ten seconds later, ten seconds in');
});

test('a private screening loops rather than ending on a black wall', () => {
  const s = at(SKIBIDI, 0, 0);
  // A round 200s film: still running at 199s, come back round by 201s.
  assert.equal(privateOffset(s, 199_000, 200), 199);
  assert.equal(privateOffset(s, 201_000, 200).toFixed(2), '1.00');
  // And SKIBIDI's real length, which is 204.583333 rather than 204.583 — at
  // 204_583ms it is a third of a millisecond short of the end, not past it.
  assert.equal(privateOffset(s, 204_583, 204.583333).toFixed(2), '204.58');
  assert.ok(privateOffset(s, 204_584, 204.583333) < 0.01, 'a shade later, back to the top');
});

test('without a duration the raw elapsed time comes back', () => {
  // What a video still waiting on its metadata should seek to once it arrives.
  assert.equal(privateOffset(at(SKIBIDI, 0, 5), 10_000, undefined), 15);
  assert.equal(privateOffset(at(SKIBIDI, 0, 5), 10_000, 0), 15);
  assert.equal(privateOffset(at(SKIBIDI, 0, 5), 10_000, NaN), 15);
});

test('a clock that runs backwards does not seek behind the start', () => {
  assert.equal(privateOffset(at(SKIBIDI, 5_000, 12), 1_000, 200), 12);
});
