/**
 * Deciding whether the view may swing around something, and by how much.
 *
 * Two separate systems used to do this — one keeping the camera inside the
 * club's walls, one keeping it out of the world's solids — and both wrote the
 * same `cameraAvoidanceSide` field on the same frame. Each kept overruling the
 * other's committed side, so the hysteresis that was supposed to stop the view
 * flip-flopping did the opposite: it flipped every frame. On a staircase, where
 * the geometry under the camera changes step by step, that is a view that
 * "rotates everywhere", which is exactly what was reported on the NIMA ROOFTOP
 * stairs. One implementation, two separate states, is the fix.
 *
 * The rule the owner asked for: **walking must not move the camera.** Only the
 * drag turns the view. The swing below exists solely so the lens does not end
 * up inside a wall, and on stairs and slopes it is switched off altogether —
 * there the view pulls in close instead, which is steady even when the ground
 * is not.
 *
 * Free of three.js and of the world, so `scripts/camera-avoidance.test.mjs`
 * can drive it directly.
 */

/** Which way round an obstruction the view is currently committed to going. */
export type AvoidanceSide = -1 | 0 | 1;

export interface AvoidanceState {
  side: AvoidanceSide;
  /** The swing actually applied, in radians; eased, never snapped. */
  offset: number;
}

export interface AvoidanceOptions {
  /** Clear distance available if the view swung by this many radians. */
  reachAt: (offset: number) => number;
  /** The distance the view would like to have. */
  preferred: number;
  /** False on stairs and slopes: pull in close rather than swing. */
  steerAllowed: boolean;
  /** Seconds since the last frame. */
  delta: number;
  /**
   * The angles to try, nearest first. The two callers want different ladders:
   * a room's corners are wide and forgiving, a building's edge is not, and
   * stepping past it in coarse jumps lands the view beside the wall rather
   * than short of it. Defaults to the room's.
   */
  offsets?: readonly number[];
}

/**
 * The angles tried, nearest first, so the view leans aside before it gives up
 * and goes right round.
 */
export const AVOIDANCE_OFFSETS = [0.4, 0.8, 1.2, 1.6, 2.1, Math.PI] as const;

/** Finer, for steering round a solid whose edge the view has to clear exactly. */
export const AVOIDANCE_OFFSETS_FINE = [0.35, 0.7, 1.05, 1.4, 1.8, 2.3, Math.PI] as const;

/** How long a swing takes to arrive. Long enough to read as drift, not a lurch. */
export const AVOIDANCE_EASE_SECONDS = 0.32;

/**
 * Margins, and why they differ.
 *
 * Taking a *new* side has to be clearly better than staying put, or the view
 * changes its mind over noise. Keeping the side already in use needs only to
 * not be worse. This gap is the hysteresis; without it the two answers trade
 * places every frame and the world appears to rotate around somebody who is
 * only walking forward.
 */
export const AVOIDANCE_NEW_SIDE_MARGIN = 0.6;
export const AVOIDANCE_KEEP_SIDE_MARGIN = 0.05;

/** Above this fraction of `preferred`, the view is clear and owes nothing. */
export const AVOIDANCE_CLEAR_FRACTION = 0.95;
/** Below this fraction, it is blocked enough to be worth swinging at all. */
export const AVOIDANCE_BLOCKED_FRACTION = 0.8;

export const easeTowards = (current: number, wanted: number, delta: number, seconds: number): number => {
  const step = Number.isFinite(delta) ? Math.max(0, delta) : 1 / 60;
  if (!Number.isFinite(current)) return wanted;
  return current + (wanted - current) * (1 - Math.exp(-step / seconds));
};

export interface AvoidanceResult extends AvoidanceState {
  /** The clear distance the chosen swing buys. */
  available: number;
}

/**
 * Advance one frame of avoidance.
 *
 * Returns the new state; the caller keeps it and passes it back. Nothing here
 * touches the camera — the caller applies `offset` to its own orbit.
 */
export const stepAvoidance = (state: AvoidanceState, options: AvoidanceOptions): AvoidanceResult => {
  const { reachAt, preferred, steerAllowed, delta, offsets = AVOIDANCE_OFFSETS } = options;
  const side: AvoidanceSide = state.side === -1 || state.side === 1 ? state.side : 0;
  let offset = Number.isFinite(state.offset) ? state.offset : 0;
  let available = reachAt(0);

  // On stairs and slopes the view never swings. It unwinds whatever swing it
  // was already carrying — easing it out rather than dropping it, so stepping
  // onto a staircase settles the view instead of snapping it straight.
  if (!steerAllowed) {
    offset = easeTowards(offset, 0, delta, AVOIDANCE_EASE_SECONDS);
    if (Math.abs(offset) < 0.001) offset = 0;
    return { side: 0, offset, available: offset === 0 ? available : Math.max(1.6, reachAt(offset)) };
  }

  let nextSide = side;
  let wanted = 0;

  if (available >= preferred * AVOIDANCE_CLEAR_FRACTION) {
    // Clear again. Let the swing go, and stop claiming a side.
    nextSide = 0;
  } else if (available < preferred * AVOIDANCE_BLOCKED_FRACTION) {
    const order: Array<-1 | 1> = side === -1 ? [-1, 1] : [1, -1];
    let best = available;
    for (const candidateOffset of offsets) {
      for (const candidateSide of order) {
        // Going the whole way round is one move, not two.
        if (candidateOffset === Math.PI && candidateSide === -1) continue;
        const candidate = reachAt(candidateOffset * candidateSide);
        const margin = candidateSide === side ? AVOIDANCE_KEEP_SIDE_MARGIN : AVOIDANCE_NEW_SIDE_MARGIN;
        if (candidate > best + margin) {
          best = candidate;
          wanted = candidateOffset * candidateSide;
          nextSide = candidateSide;
        }
        if (best >= preferred * AVOIDANCE_CLEAR_FRACTION) break;
      }
      if (best >= preferred * AVOIDANCE_CLEAR_FRACTION) break;
    }
    available = best;
  } else {
    // In between: neither clear nor badly blocked. Hold what is already
    // applied. Re-deciding here is what made a marginal call oscillate.
    wanted = offset;
  }

  offset = easeTowards(offset, wanted, delta, AVOIDANCE_EASE_SECONDS);
  // An exponential ease only ever approaches its target, so a swing that has
  // been given back sits at a millionth of a radian for ever. Settle it, both
  // so "no swing" is a state the caller can test for and so the camera path
  // stops doing trigonometry every frame for a rotation nobody can see.
  if (Math.abs(offset) < 0.001) offset = 0;
  if (offset !== 0) available = Math.max(1.6, reachAt(offset));
  return { side: nextSide, offset, available };
};
