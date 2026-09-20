/**
 * Nothing leaves an immersive session without being asked for twice.
 *
 * A headset has no popup blocker bar and no address bar. When the browser
 * refuses `window.open` — and Quest refuses it routinely, because a WebXR
 * `select` is not the kind of gesture a popup blocker accepts — the visitor
 * sees no new window at all. They just see the festival disappear, because the
 * code that asked for the window came out of VR whether or not it got one.
 *
 * Worse, a session's `select` does not only come from a trigger. Once the
 * controllers go idle the headset switches to hand tracking, and a resting
 * hand pinches by accident all the time. One stray pinch while walking past
 * the shop counter was enough to end the afternoon.
 *
 * So a link that leaves VR is armed by one press and followed by the next.
 * Both have to name the same destination, within a few seconds. An accidental
 * pinch manages the first; it does not manage the second.
 */
export const LEAVE_VR_ARMED_MS = 6_000;

export interface LeaveVrArming {
  /** What the armed press was going to open. */
  readonly key: string;
  /** When the offer lapses, on the same clock that is passed to `armLeavingVr`. */
  readonly until: number;
}

export interface LeaveVrDecision {
  /** True when this press is the second one and the link may be followed. */
  readonly confirmed: boolean;
  /** What to hold until the next press, or nothing once it has been spent. */
  readonly armed: LeaveVrArming | undefined;
}

/**
 * Arm on the first press, confirm on the second.
 *
 * A confirmed press clears the arming rather than leaving it standing, so the
 * press after that starts again from the beginning — coming back from the shop
 * and brushing the counter should not reopen it.
 */
export function armLeavingVr(
  armed: LeaveVrArming | undefined,
  key: string,
  now: number,
): LeaveVrDecision {
  if (armed && armed.key === key && now < armed.until) return { confirmed: true, armed: undefined };
  return { confirmed: false, armed: { key, until: now + LEAVE_VR_ARMED_MS } };
}
