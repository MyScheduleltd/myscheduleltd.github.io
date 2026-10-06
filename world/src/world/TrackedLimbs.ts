import { FINGER_NAMES, type HandPose } from './HandPose';

/**
 * A visitor's tracked body, as it travels to everyone else: a headset's arms
 * and bare hands, or the desktop webcam's whole body. Numbers only, rounded to
 * hundredths, and nothing that assumes the sender's size: an arm is where its
 * wrist is against its own shoulder as a fraction of its reach, so the same
 * pose lands the same way on whatever body is drawn.
 *
 * Every field is optional; absent means "not tracked, play the animation".
 * The service checks each field's length and range and drops anything else
 * (world/server/index.mjs, safeLimbs), so the two must agree on LIMB_FIELDS.
 */
export interface TrackedLimbs {
  /**
   * Each arm by the visitor's own side: the wrist's offset from the shoulder
   * in the body's frame as a fraction of the arm's reach (3), then the hand's
   * finger and thumb-side directions in the body's frame (3 + 3).
   */
  l?: number[];
  r?: number[];
  /** Measured elbow bend direction, in the body frame. */
  le?: number[];
  re?: number[];
  /** Each hand's fingers: thumb to little finger, three curls and a spread. */
  lf?: number[];
  rf?: number[];
  /** The chest's lean forward and twist, radians over the animation. */
  t?: number[];
  /** Lateral chest lean and anatomical head tilt, optional for older clients. */
  tr?: number[];
  hr?: number[];
  /** Legs, as the rig names them: left hip pitch, roll, knee; right the same. */
  g?: number[];
  /** Where the head looks against the body: yaw (toward its left) and pitch (up). */
  h?: number[];
}

export const LIMB_FIELDS: Record<keyof TrackedLimbs, number> = { l: 9, r: 9, lf: 20, rf: 20, le: 3, re: 3, tr: 1, hr: 1, t: 2, g: 6, h: 2 };

const round = (n: number) => Math.round(Math.max(-4, Math.min(4, n)) * 100) / 100;

/** Hundredths, in range, of the right length; anything else is left out. */
export function cleanLimbs(value: unknown): TrackedLimbs | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: TrackedLimbs = {};
  for (const [key, length] of Object.entries(LIMB_FIELDS) as Array<[keyof TrackedLimbs, number]>) {
    const list = (value as Record<string, unknown>)[key];
    if (!Array.isArray(list) || list.length !== length) continue;
    if (!list.every(n => typeof n === 'number' && Number.isFinite(n))) continue;
    out[key] = list.map(round);
  }
  return Object.keys(out).length ? out : undefined;
}

export function encodeHandPose(pose: HandPose): number[] {
  return FINGER_NAMES.flatMap(name => [...pose[name].curl, pose[name].spread].map(round));
}

export function decodeHandPose(list: number[]): HandPose {
  const pose = {} as HandPose;
  FINGER_NAMES.forEach((name, i) => {
    const at = i * 4;
    pose[name] = { curl: [list[at], list[at + 1], list[at + 2]], spread: list[at + 3] };
  });
  return pose;
}

/**
 * Between two readings, as a remote body's position is played out between two
 * updates. A field only one side has is taken whole: it has just started or
 * stopped being tracked.
 */
export function mixLimbs(from: TrackedLimbs | undefined, to: TrackedLimbs | undefined, t: number): TrackedLimbs | undefined {
  if (!to) return undefined;
  if (!from) return to;
  const out: TrackedLimbs = {};
  for (const key of Object.keys(LIMB_FIELDS) as Array<keyof TrackedLimbs>) {
    const b = to[key], a = from[key];
    if (!b) continue;
    out[key] = a && a.length === b.length ? b.map((v, i) => a[i] + (v - a[i]) * t) : b;
  }
  return out;
}
