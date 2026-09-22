import test from 'node:test';
import assert from 'node:assert/strict';
import { solveArm, armWrist } from '../src/world/ArmIk.ts';

// The avatar's own bones: elbow 0.5 below the shoulder, wrist 0.43 below that.
const UPPER = 0.5, LOWER = 0.43, REACH = UPPER + LOWER;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const len = (v) => Math.hypot(...v);

/** The only test that matters: walk the chain forward and see where it lands. */
const reaches = (target, pole) => {
  const s = solveArm(target, UPPER, LOWER, pole);
  return { s, off: dist(armWrist(s, UPPER, LOWER), target) };
};

test('the wrist lands on the target, wherever the target is', () => {
  // A spread of directions and distances, all inside reach.
  for (const t of [
    [0, -0.6, 0], [0, -0.9, 0], [0.4, -0.5, 0], [-0.4, -0.5, 0],
    [0, -0.3, -0.5], [0.3, -0.2, -0.6], [0, 0.2, -0.7], [0.5, 0.3, 0.2],
    [-0.2, -0.75, 0.3], [0.1, 0.05, 0.2],
  ]) {
    const { off } = reaches(t);
    assert.ok(off < 1e-6, `${JSON.stringify(t)} missed by ${off}`);
  }
});

test('the bones keep their lengths', () => {
  const s = solveArm([0.3, -0.4, -0.5], UPPER, LOWER);
  assert.ok(Math.abs(len(s.upper) - 1) < 1e-9, 'upper is a unit direction');
  assert.ok(Math.abs(len(s.lower) - 1) < 1e-9, 'lower is a unit direction');
});

test('a straight-down arm is straight, not bent', () => {
  // At full reach the elbow has nothing to bend around.
  const s = solveArm([0, -REACH, 0], UPPER, LOWER);
  assert.ok(s.bend < 0.03, `expected a straight arm, got ${s.bend} rad`);
});

test('a folded-in target bends the elbow right up', () => {
  const near = solveArm([0, -0.1, 0], UPPER, LOWER);
  const far = solveArm([0, -0.9, 0], UPPER, LOWER);
  assert.ok(near.bend > far.bend, 'closer target, more bend');
  assert.ok(near.bend > 2, `expected a deep bend, got ${near.bend} rad`);
});

test('out of reach, the arm straightens towards the target and says so', () => {
  const s = solveArm([0, -3, 0], UPPER, LOWER);
  assert.equal(s.stretched, true);
  assert.ok(s.bend < 0.03, 'a reaching arm is a straight arm');
  const wrist = armWrist(s, UPPER, LOWER);
  assert.ok(Math.abs(len(wrist) - REACH) < 1e-6, 'and it is at full stretch');
  // Still pointing the right way, even though it cannot get there.
  assert.ok(wrist[1] < -0.9 * REACH, 'aimed at the target');
});

test('inside the closest the bones can fold, it does not blow up', () => {
  // |0.5 - 0.43| = 0.07, so this is nearer than the chain can physically reach.
  const s = solveArm([0, -0.01, 0], UPPER, LOWER);
  for (const v of [...s.upper, ...s.lower, s.bend]) assert.ok(Number.isFinite(v));
  assert.equal(s.stretched, false, 'too close is not the same as too far');
});

test('a zero target is survivable', () => {
  const s = solveArm([0, 0, 0], UPPER, LOWER);
  for (const v of [...s.upper, ...s.lower, s.bend]) assert.ok(Number.isFinite(v));
});

test('the pole decides which way the elbow breaks', () => {
  const target = [0, -0.7, -0.2];
  const back = solveArm(target, UPPER, LOWER, [0, 0, -1]);
  const front = solveArm(target, UPPER, LOWER, [0, 0, 1]);
  // Same wrist, mirrored elbow — which is the whole point of a pole vector.
  assert.ok(dist(armWrist(back, UPPER, LOWER), target) < 1e-6);
  assert.ok(dist(armWrist(front, UPPER, LOWER), target) < 1e-6);
  assert.ok(dist(back.upper, front.upper) > 0.1, 'the elbows go different ways');
});

test('a pole lying along the arm still gives a usable answer', () => {
  // cross(aim, pole) is degenerate here; it must pick another plane, not NaN.
  const s = solveArm([0, -0.6, 0], UPPER, LOWER, [0, -1, 0]);
  for (const v of [...s.upper, ...s.lower, s.bend]) assert.ok(Number.isFinite(v));
  assert.ok(dist(armWrist(s, UPPER, LOWER), [0, -0.6, 0]) < 1e-6);
});

import { armOrientation } from '../src/world/ArmIk.ts';

/** Rebuild the chain from the rotations the rig would be given. */
const forwardFromRig = (target, pole) => {
  const s = solveArm(target, UPPER, LOWER, pole);
  const { x, y, z, elbowX } = armOrientation(s);
  // Shoulder basis maps local (x,y,z) to these axes. The upper bone is local
  // -Y, so in parent space it is -y.
  const upper = [-y[0], -y[1], -y[2]];
  // The forearm is local -Y turned about local X by elbowX: (0,-cos,-sin),
  // which in parent space is -cos*y - sin*z.
  const c = Math.cos(elbowX), sn = Math.sin(elbowX);
  const lower = [
    -c * y[0] - sn * z[0],
    -c * y[1] - sn * z[1],
    -c * y[2] - sn * z[2],
  ];
  // x must be perpendicular to both, or the basis is not a basis.
  const perp = Math.abs(x[0] * upper[0] + x[1] * upper[1] + x[2] * upper[2]);
  return {
    wrist: [0, 1, 2].map((i) => upper[i] * UPPER + lower[i] * LOWER),
    perp,
  };
};

test('the rig rotations put the wrist on the target', () => {
  // The real test of armOrientation: go all the way round through the basis
  // and the elbow angle the avatar would actually be given, and land on it.
  for (const t of [
    [0, -0.6, 0], [0.4, -0.5, 0], [-0.4, -0.5, 0], [0, -0.3, -0.5],
    [0.3, -0.2, -0.6], [0, 0.2, -0.7], [0.5, 0.3, 0.2], [-0.2, -0.75, 0.3],
    [0.2, -0.85, -0.1], [0.1, 0.05, 0.2],
  ]) {
    const { wrist, perp } = forwardFromRig(t);
    assert.ok(dist(wrist, t) < 1e-6, `${JSON.stringify(t)} missed by ${dist(wrist, t)}`);
    assert.ok(perp < 1e-9, 'the hinge axis is perpendicular to the bone');
  }
});

test('a straight arm asks the elbow for no bend', () => {
  const { elbowX } = armOrientation(solveArm([0, -REACH, 0], UPPER, LOWER));
  assert.ok(Math.abs(elbowX) < 0.03, `expected ~0, got ${elbowX}`);
});

test('the basis stays a basis for an out-of-reach target', () => {
  const o = armOrientation(solveArm([0, 0, -4], UPPER, LOWER));
  for (const v of [...o.x, ...o.y, ...o.z, o.elbowX]) assert.ok(Number.isFinite(v));
  assert.ok(Math.abs(len(o.x) - 1) < 1e-9 && Math.abs(len(o.z) - 1) < 1e-9);
});
