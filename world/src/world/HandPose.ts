import * as THREE from 'three';

/**
 * Finger poses shared by everything that moves a hand: a headset's hand
 * tracking, the webcam's hand landmarks, and fixed poses like a fist.
 *
 * A pose is angles, not positions, so it carries from a visitor's own hand to
 * an avatar's of any size: for each finger, how far each of its three joints
 * is bent toward the palm (radians, 0 straight), and how far the finger swings
 * at its knuckle toward the thumb's side.
 */
export const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;
export type FingerName = typeof FINGER_NAMES[number];
export interface FingerPose { curl: [number, number, number]; spread: number }
export type HandPose = Record<FingerName, FingerPose>;

/**
 * Joint positions of one hand, in any one frame: the wrist, and for each
 * finger its knuckle, two middle joints and tip (for the thumb: the base of its
 * metacarpal, its knuckle, its one middle joint and tip). WebXR's hand joints
 * and MediaPipe's landmarks both give these.
 */
export interface HandJoints { wrist: THREE.Vector3; fingers: Record<FingerName, THREE.Vector3[]> }

const along = new THREE.Vector3(), across = new THREE.Vector3(), palm = new THREE.Vector3();
const a = new THREE.Vector3(), b = new THREE.Vector3(), side = new THREE.Vector3();

/** The palm's frame: toward the fingers, toward the thumb, and out of the palm. */
export function palmFrame(joints: HandJoints, right: boolean): { along: THREE.Vector3; across: THREE.Vector3; palm: THREE.Vector3 } {
  const f = joints.fingers;
  along.copy(f.Middle[0]).sub(joints.wrist).normalize();
  across.copy(f.Index[0]).sub(f.Pinky[0]);
  across.addScaledVector(along, -across.dot(along)).normalize();
  // For a right hand, fingers × thumb-ward points out of the back of the hand.
  palm.crossVectors(along, across);
  if (right) palm.negate();
  return { along: along.clone(), across: across.clone(), palm: palm.clone() };
}

/** Signed flexion about a fixed palm axis, including joints curled past 90 degrees. */
function bend(u: THREE.Vector3, v: THREE.Vector3, axis: THREE.Vector3): number {
  a.copy(u).normalize(); b.copy(v).normalize();
  side.crossVectors(a, b);
  return a.angleTo(b) * (side.dot(axis) < 0 ? -1 : 1);
}

/**
 * Angles of a hand from its joints. `right` is the owner's right hand. Fingers
 * bend toward the palm far more than away from it, so if they read as bent
 * backward overall the hand was named wrong (a camera reports its mirror
 * image), and it is read as the other hand.
 */
export function handPoseFromJoints(joints: HandJoints, right: boolean, knownHandedness = false): HandPose {
  const pose = readHandPose(joints, right);
  // Webcam sides are already matched to anatomical pose wrists. A noisy or
  // hyperextended digit must not flip every other finger's palm/curl axes.
  if (knownHandedness) return pose;
  const back = (['Index', 'Middle', 'Ring', 'Pinky'] as const).reduce((sum, n) => sum + pose[n].curl[1] + pose[n].curl[2], 0);
  return back < -.3 ? readHandPose(joints, !right) : pose;
}

function readHandPose(joints: HandJoints, right: boolean): HandPose {
  const frame = palmFrame(joints, right);
  const pose = {} as HandPose;
  for (const name of FINGER_NAMES) {
    const p = joints.fingers[name];
    const segs = [p[1].clone().sub(p[0]), p[2].clone().sub(p[1]), p[3].clone().sub(p[2])];
    if (name === 'Thumb') {
      // The metacarpal's lift out of the palm is its "curl"; the two joints
      // after it bend across the palm.
      const lift = Math.asin(THREE.MathUtils.clamp(segs[0].clone().normalize().dot(frame.palm), -1, 1));
      const inward = frame.palm.clone().sub(frame.across).normalize();
      // A thumb has its own oblique metacarpal. Using the middle finger's
      // axis erased opposition/pinch motion as the thumb swung across the palm.
      const axis = segs[0].clone().cross(inward).normalize();
      pose.Thumb = {
        curl: [lift, bend(segs[0], segs[1], axis), bend(segs[1], segs[2], axis)],
        spread: Math.atan2(segs[0].dot(frame.across), segs[0].dot(frame.along)),
      };
      continue;
    }
    // The knuckle bends from the palm's own direction, not from the wrist.
    const flat = segs[0].clone().addScaledVector(frame.palm, -segs[0].dot(frame.palm));
    const axis = flat.clone().cross(frame.palm).normalize();
    pose[name] = {
      // Separate flexion from sideways splay at the knuckle.
      curl: [Math.atan2(segs[0].dot(frame.palm), flat.length()), bend(segs[0], segs[1], axis), bend(segs[1], segs[2], axis)],
      spread: Math.atan2(flat.dot(frame.across), Math.max(1e-6, flat.dot(frame.along))),
    };
  }
  return pose;
}

const finger = (curl: [number, number, number], spread = 0): FingerPose => ({ curl, spread });
/** A closed fist: fingers rolled into the palm, the thumb folded over them. */
export const FIST: HandPose = {
  Thumb: finger([.55, .55, .6], .35),
  Index: finger([1.45, 1.6, 1.0]), Middle: finger([1.5, 1.6, 1.0]),
  Ring: finger([1.5, 1.55, 1.0]), Pinky: finger([1.45, 1.5, 1.0]),
};

/** Blend two poses: 0 is `from`, 1 is `to`. */
export function mixHandPose(from: HandPose, to: HandPose, t: number): HandPose {
  const out = {} as HandPose;
  for (const name of FINGER_NAMES) {
    const f = from[name], g = to[name];
    out[name] = {
      curl: [0, 1, 2].map(i => f.curl[i] + (g.curl[i] - f.curl[i]) * t) as [number, number, number],
      spread: f.spread + (g.spread - f.spread) * t,
    };
  }
  return out;
}

/** WebXR's joint names for each finger: the knuckle, two middle joints, the tip. */
const XR_JOINTS: Record<FingerName, string[]> = {
  Thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  Index: ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  Middle: ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  Ring: ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  Pinky: ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
};

/**
 * A headset's tracked hand as joints, from the positions of WebXR's named
 * joints (any one frame). Undefined while any joint is missing: a hand half
 * out of view is not posed from guesses.
 */
export function handJointsFromXR(position: (name: string) => THREE.Vector3 | undefined): HandJoints | undefined {
  const wrist = position('wrist');
  if (!wrist) return undefined;
  const fingers = {} as Record<FingerName, THREE.Vector3[]>;
  for (const name of FINGER_NAMES) {
    const points = XR_JOINTS[name].map(position);
    if (points.some(p => !p)) return undefined;
    fingers[name] = points as THREE.Vector3[];
  }
  return { wrist, fingers };
}

/**
 * MediaPipe's 21 hand landmarks as joints (0 wrist; then four a finger from
 * the thumb's base). Its coordinates are image-space with y down, so y is
 * flipped; which hand it is comes from its handedness, as seen by the camera.
 */
export function handJointsFromLandmarks(
  points: Array<{ x: number; y: number; z: number }>,
  place: (p: { x: number; y: number; z: number }) => THREE.Vector3 = p => new THREE.Vector3(p.x, -p.y, -p.z),
): HandJoints | undefined {
  if (points.length < 21 || points.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) return undefined;
  const at = (i: number) => place(points[i]);
  const fingers = {} as Record<FingerName, THREE.Vector3[]>;
  FINGER_NAMES.forEach((name, f) => { fingers[name] = [1, 2, 3, 4].map(k => at(f * 4 + k)); });
  const joints = { wrist: at(0), fingers };
  const frame = palmFrame(joints, true);
  if (frame.along.lengthSq() < .9 || frame.across.lengthSq() < .9) return undefined;
  if (FINGER_NAMES.some(n => fingers[n].some((p, i) => i > 0 && p.distanceToSquared(fingers[n][i - 1]) < 1e-10))) return undefined;
  return joints;
}

/** Ease a held pose toward a new reading: tracked joints shiver. */
export function smoothHandPose(held: HandPose | null, reading: HandPose, keep = .55): HandPose {
  return held ? mixHandPose(reading, held, keep) : reading;
}

/** Reject impossible backward bends from noisy/occluded camera landmarks. */
export function limitHandPose(pose: HandPose): HandPose {
  const out = {} as HandPose;
  for (const name of FINGER_NAMES) {
    const p = pose[name], thumb = name === 'Thumb';
    const maximum = thumb ? [1.2, 1.5, 1.5] : [1.55, 1.75, 1.35];
    out[name] = { curl: p.curl.map((v, i) => THREE.MathUtils.clamp(Number.isFinite(v) ? v : 0, thumb && i === 0 ? -1.2 : -.08, maximum[i])) as [number, number, number],
      spread: THREE.MathUtils.clamp(Number.isFinite(p.spread) ? p.spread : 0, thumb ? -1.6 : -.5, thumb ? 1.6 : .5) };
  }
  return out;
}
