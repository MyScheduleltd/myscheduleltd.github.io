/**
 * Deciding, from where a controller has been, whether a punch was thrown.
 *
 * The festival already has a punch: a gesture, sent to the other visitors and
 * animated on their side. What this adds is the *throw* — the button becomes
 * an actual movement of the arm, so connecting depends on how hard and in
 * which direction somebody swung.
 *
 * It has to be a rising edge with a cooldown rather than a plain speed test.
 * A hand travelling fast is fast for a good tenth of a second, and at 72 or
 * 90 frames a second that is one swing arriving as a dozen punches.
 *
 * Kept free of three.js so the whole thing can be driven from a list of made
 * up positions in a test, which is the only way any of this gets checked
 * without a headset on.
 */

export type Vec3 = readonly [number, number, number];

/** Metres a second. A jab runs 3-6; this is low enough for a lazy throw. */
export const PUNCH_SPEED = 2.2;
/** One swing is one punch, however many frames it spans. */
export const PUNCH_COOLDOWN_MS = 480;
/**
 * How much of the movement has to be going away from the chest. A punch is
 * thrown outward; lifting a drink or waving is not, and should not land one.
 */
export const PUNCH_FORWARDNESS = 0.55;

export interface SwingState {
  readonly at?: number;
  readonly p?: Vec3;
  /** Nothing is thrown before this, which is what makes one swing one punch. */
  readonly readyAt: number;
}

export interface SwingResult {
  readonly state: SwingState;
  readonly thrown: boolean;
  /** Metres a second at the moment of the throw, for how hard it landed. */
  readonly speed: number;
}

export const restingSwing = (): SwingState => ({ readyAt: 0 });

const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

/**
 * Feed in a hand's position each frame, with the direction the head is facing.
 *
 * A gap outside 4-200ms is not measured: below it the numbers are noise
 * divided by nearly nothing, and above it the hand has been somewhere we did
 * not see — a dropped frame, a paused session — and inventing a speed across
 * that is how a punch gets thrown by a visitor who was standing still.
 */
export function trackPunch(
  state: SwingState,
  p: Vec3,
  at: number,
  forward: Vec3,
  speedThreshold = PUNCH_SPEED,
): SwingResult {
  const previous = state.p;
  const since = state.at === undefined ? undefined : at - state.at;
  const next: SwingState = { at, p, readyAt: state.readyAt };
  if (!previous || since === undefined || since < 4 || since > 200) {
    return { state: next, thrown: false, speed: 0 };
  }
  const seconds = since / 1000;
  const move: Vec3 = [p[0] - previous[0], p[1] - previous[1], p[2] - previous[2]];
  const travelled = len(move);
  const speed = travelled / seconds;
  if (speed < speedThreshold || at < state.readyAt) {
    return { state: next, thrown: false, speed };
  }
  const facing = len(forward);
  if (facing < 1e-6 || travelled < 1e-9) return { state: next, thrown: false, speed };
  const forwardness = (move[0] * forward[0] + move[1] * forward[1] + move[2] * forward[2])
    / (travelled * facing);
  if (forwardness < PUNCH_FORWARDNESS) return { state: next, thrown: false, speed };
  return { state: { ...next, readyAt: at + PUNCH_COOLDOWN_MS }, thrown: true, speed };
}
