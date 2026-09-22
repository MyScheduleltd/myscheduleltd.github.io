import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orientBody, wrapAngle, HIP_TWIST_MAX, SEATED_TWIST_MAX,
} from '../src/world/BodyOrientation.ts';

const FRAME = 1 / 72;
const RING = Array.from({ length: 16 }, (_, i) => wrapAngle(i * Math.PI / 8));

/** Run the thing until it stops moving, the way a frame loop would. */
const settle = (input, frames = 400) => {
  let chest = input.chest ?? input.head;
  let lead = input.lead ?? 0;
  let out;
  for (let i = 0; i < frames; i += 1) {
    out = orientBody({ ...input, chest, lead, delta: FRAME });
    ({ chest, lead } = out);
  }
  return out;
};

/**
 * Where a world point sits relative to a body of the given heading: +Z front.
 *
 * The transpose of three.js's Y rotation, because a body heading theta sends
 * its own +Z to world (sin theta, cos theta) and this has to come back.
 */
const intoBody = (heading, x, z) => ({
  x: x * Math.cos(heading) - z * Math.sin(heading),
  z: x * Math.sin(heading) + z * Math.cos(heading),
});

const forwardOf = (heading) => ({ x: Math.sin(heading), z: Math.cos(heading) });

test('hips plus spine is the chest, on every frame of every transient', () => {
  // The identity the arms depend on. Checked while it is still moving, not
  // only once settled — a mid-turn frame is a frame somebody is looking at.
  let chest = 0;
  let lead = 0;
  for (const travel of RING) {
    for (const head of RING) {
      for (let i = 0; i < 30; i += 1) {
        const out = orientBody({ head, travel, chest, lead, delta: FRAME });
        const off = Math.abs(wrapAngle(out.hips + out.spine - out.chest));
        assert.ok(off < 1e-12, `hips+spine drifted from the chest by ${off}`);
        ({ chest, lead } = out);
      }
    }
  }
});

test('the chest ends up square to the head, wherever the visitor walks', () => {
  for (const head of RING) {
    for (const travel of RING) {
      const out = settle({ head, travel });
      const off = Math.abs(wrapAngle(out.chest - head));
      assert.ok(off < 1e-3, `looking ${head}, walking ${travel}: chest off by ${off}`);
    }
  }
});

test('the hips never lead the chest past the clamp', () => {
  let chest = 0;
  let lead = 0;
  for (const travel of RING) {
    for (let i = 0; i < 200; i += 1) {
      const out = orientBody({ head: 0, travel, chest, lead, delta: FRAME });
      assert.ok(
        Math.abs(out.lead) <= HIP_TWIST_MAX + 1e-9,
        `hips led by ${out.lead}, past ${HIP_TWIST_MAX}`,
      );
      ({ chest, lead } = out);
    }
  }
});

test('walking backwards back-pedals instead of turning the body round', () => {
  // The old rule was `rotation.y = atan2(move.x, move.z)`, which for a step
  // straight backwards is the head's heading plus pi: the avatar about-faced
  // while the visitor's head, and hands, had not moved at all.
  const head = 0;
  const out = settle({ head, travel: Math.PI });
  assert.ok(
    Math.abs(wrapAngle(out.hips - head)) <= HIP_TWIST_MAX + 1e-6,
    `the hips came round to ${out.hips}`,
  );
  assert.ok(Math.abs(wrapAngle(out.chest - head)) < 1e-3, 'the chest still faces front');
});

test('a hand held in front of the visitor stays in front of the chest', () => {
  // The regression, stated as the thing that actually went wrong: a controller
  // held out in front of the face, taken into the body's frame. Positive z is
  // the chest's front. Behind the spine is where the arm had to reach around.
  for (const head of RING) {
    const ahead = forwardOf(head);
    const right = { x: Math.cos(head), z: -Math.sin(head) };
    const hand = {
      x: ahead.x * 0.45 + right.x * 0.18,
      z: ahead.z * 0.45 + right.z * 0.18,
    };
    for (const travel of RING) {
      const out = settle({ head, travel });
      const local = intoBody(out.chest, hand.x, hand.z);
      assert.ok(local.z > 0.4, `looking ${head}, walking ${travel}: hand at z=${local.z}`);
      // And the old rule, for contrast: straight back puts it behind the spine.
      const wasLocal = intoBody(travel, hand.x, hand.z);
      if (Math.abs(wrapAngle(travel - head - Math.PI)) < 1e-9) {
        assert.ok(wasLocal.z < -0.4, 'the old rule should have put it behind');
      }
    }
  }
});

test('standing still squares everything up', () => {
  const out = settle({ head: 1.2, travel: undefined });
  assert.ok(Math.abs(out.lead) < 1e-4, `the lean should decay, got ${out.lead}`);
  assert.ok(Math.abs(wrapAngle(out.hips - 1.2)) < 1e-3, 'hips come back under the chest');
  assert.ok(Math.abs(out.spine) < 1e-4, 'and the waist untwists');
});

test('a strafe leans the hips towards the step, not at it', () => {
  // Ninety degrees of travel should not become ninety degrees of body.
  const out = settle({ head: 0, travel: Math.PI / 2 });
  assert.ok(out.lead > 0.2, `expected a lean into the step, got ${out.lead}`);
  assert.ok(out.lead <= HIP_TWIST_MAX + 1e-9, 'and no more than the clamp');
  assert.ok(Math.abs(out.lead - Math.PI / 2) > 0.3, 'the hips did not simply point at it');
});

test('the turn is eased, not snapped', () => {
  // One frame must not do the whole job, or a head tremor becomes a torso one.
  const first = orientBody({ head: 1, travel: undefined, chest: 0, lead: 0, delta: FRAME });
  assert.ok(first.chest > 0.1 && first.chest < 0.35, `one frame moved ${first.chest} of 1`);
  // But a quarter of a second must very nearly finish it: this is a tremor
  // filter, not a comfort lag, and a chest that trails the head is a chest the
  // hands are no longer in front of.
  let chest = 0;
  for (let i = 0; i < Math.round(0.25 / FRAME); i += 1) {
    ({ chest } = orientBody({ head: 1, travel: undefined, chest, lead: 0, delta: FRAME }));
  }
  assert.ok(chest > 0.96, `a quarter second only reached ${chest} of 1`);
});

test('a turn across the back takes the short way round', () => {
  // Headings either side of pi are neighbours, and arithmetic that forgets it
  // sends the avatar the long way, spinning through everything in front.
  let chest = wrapAngle(Math.PI - 0.05);
  const head = wrapAngle(-Math.PI + 0.05);
  for (let i = 0; i < 60; i += 1) {
    const out = orientBody({ head, travel: undefined, chest, lead: 0, delta: FRAME });
    assert.ok(
      Math.abs(wrapAngle(out.chest - head)) <= 0.11,
      `the chest wandered to ${out.chest} on its way to ${head}`,
    );
    ({ chest } = out);
  }
});

test('a seated body turns at the waist and stays in the chair', () => {
  const seat = 0.7;
  for (const head of RING) {
    const out = settle({ head, seat });
    assert.equal(out.hips, seat, 'the hips are the chair and do not move');
    assert.equal(out.lead, 0, 'a seated body takes no steps to lean into');
    const wanted = wrapAngle(head - seat);
    const expected = Math.max(-SEATED_TWIST_MAX, Math.min(SEATED_TWIST_MAX, wanted));
    assert.ok(
      Math.abs(out.spine - expected) < 1e-3,
      `looking ${head} from a seat at ${seat}: waist at ${out.spine}, wanted ${expected}`,
    );
  }
});

test('a seated waist has a limit, and a shoulder-check finds it', () => {
  const out = settle({ head: wrapAngle(2.9), seat: 0 });
  assert.ok(Math.abs(out.spine) <= SEATED_TWIST_MAX + 1e-9, 'no one twists that far');
  assert.ok(Math.abs(out.spine) > SEATED_TWIST_MAX - 1e-3, 'but they go as far as they can');
});
