/**
 * Which way an avatar's hips and chest face, frame by frame.
 *
 * Off a headset a body has one heading and it is the direction of travel: push
 * the stick left, the character turns and walks left, which is what a
 * third-person game should do. In a headset that is wrong, and it is wrong in
 * a way that lands on the arms.
 *
 * There the view is independent of the body — the XR rig takes its position
 * from the avatar and its yaw from the visitor's own turning, so turning the
 * body cannot turn the head, and none of this can feed back on itself. That
 * independence is exactly what hurt. Strafing spun the torso ninety degrees
 * underneath a head that had not moved; walking backwards spun it a hundred
 * and eighty. The arm solver targets each controller's position in world space
 * and pulls it into the shoulder's frame, and that frame lives inside the body
 * — so a spun body put the target beside the chest, or behind the spine, and
 * the arm did the only thing left to it and reached around the torso. Crossed,
 * twisted, through the ribs. The solver was never wrong. It was solving
 * faithfully for a body that was facing the wrong way.
 *
 * So a body gets the two headings a body actually has. The chest owns the
 * visitor's own heading, because their real arms hang off their real chest and
 * squaring one to the other is what guarantees the hands stay in front of it.
 * The hips lean off the chest towards the step, clamped, which is how a person
 * sidesteps and back-pedals without their waist coming apart.
 *
 * Three.js is deliberately absent. Every quantity here is a heading in
 * radians, so the whole thing can be checked by arithmetic rather than by
 * putting a headset on.
 */

/**
 * How far the hips may lead the chest, in radians, on foot and in a seat.
 *
 * A walking body is not one rigid piece pointed wherever it is going. The
 * chest and the arms square up to whatever the eyes are on; the hips lean
 * towards the step and no further. Strafing, that lean is what makes a
 * sidestep read as a sidestep rather than a slide. Walking backwards, the
 * clamp is the whole point — a back-pedalling person's hips do not come round
 * to face behind them, so a hundred and eighty degrees of travel becomes
 * forty-six degrees of lean and the legs go backwards underneath a body that
 * still faces front.
 *
 * The lean is shaped by a sine of the angle rather than clipped to it, and
 * that is not cosmetic. Clipping has a seam at exactly-backwards: a step a
 * hair to one side of dead astern clamps the hips one way, a hair to the
 * other clamps them the other, and since a stick is never perfectly still,
 * backing away from something swung the body ninety degrees back and forth.
 * A sine has no seam. It also happens to say the right thing at every point
 * that matters — nothing when walking forwards, everything when strafing, and
 * nothing again when walking straight back, where a real person's hips do not
 * turn at all and the legs simply go backwards underneath them.
 *
 * Seated the hips belong to the chair and cannot lean at all, so the same
 * allowance is spent the other way round: the chest is the only thing that
 * turns, and it may go much further, because turning in a seat is mostly
 * waist.
 */
export const HIP_TWIST_MAX = 0.8;
export const SEATED_TWIST_MAX = 1.6;

/**
 * How fast the chest and the hips chase their headings, as exponential rates.
 *
 * Not a comfort lag. The chest is meant to be square to the head at all times
 * — that is the whole mechanism keeping the hands in front of it — and this
 * only takes the tremor out, because a head is never quite still and a torso
 * answering every micro-movement of one would shiver. The hips follow slower,
 * since a lean that snapped on and off at the edge of the stick's dead zone
 * would twitch.
 */
export const CHEST_TURN_RATE = 14;
export const HIP_TURN_RATE = 6;

/** Fold an angle back into (-pi, pi], the short way round. */
export const wrapAngle = (radians: number): number => Math.atan2(Math.sin(radians), Math.cos(radians));

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/** Ease one angle towards another the short way round. */
export const approachAngle = (from: number, to: number, rate: number, delta: number): number =>
  from + wrapAngle(to - from) * (1 - Math.exp(-rate * delta));

export interface BodyOrientationInput {
  /** Where the visitor is actually looking, as a world heading. */
  head: number;
  /** The heading of the last step, or undefined when standing still. */
  travel?: number;
  /** Where the seat points, or undefined when on foot. */
  seat?: number;
  /** The heading of the board being ridden, or undefined when not riding. */
  board?: number;
  /** Last frame's chest heading. */
  chest: number;
  /** Last frame's hip lead. */
  lead: number;
  /** Seconds since the last frame. */
  delta: number;
}

export interface BodyOrientation {
  /** World heading for the hips and the legs. */
  hips: number;
  /** Twist to apply at the waist, taking the lean back out above it. */
  spine: number;
  /** The chest's world heading, carried into the next frame. */
  chest: number;
  /** How far the hips lead the chest, carried into the next frame. */
  lead: number;
  /** True while the pose, not this, decides which way the body faces. */
  riding: boolean;
}

/**
 * `hips + spine` is the chest's heading — always, except while riding. That
 * identity is the contract the arms depend on, and it is what the tests pin
 * down.
 *
 * Riding is the exception, and deliberately: a skater stands across the deck,
 * and the pose that puts them there turns the avatar's own visual root a
 * quarter turn that this function neither sees nor should. So while riding,
 * `chest` stops describing where the chest points and becomes a parked value,
 * walked towards the body's heading only so that stepping off the board does
 * not snap the torso round. The owner chose that stance knowing the cost.
 */
export function orientBody(input: BodyOrientationInput): BodyOrientation {
  const { head, travel, seat, board, delta } = input;
  if (seat !== undefined) {
    // The hips are the chair's and stay in it. Whatever the visitor turns to
    // look at, they turn at the waist to look at.
    const reach = clamp(wrapAngle(head - seat), -SEATED_TWIST_MAX, SEATED_TWIST_MAX);
    const chest = approachAngle(input.chest, seat + reach, CHEST_TURN_RATE, delta);
    return { hips: seat, spine: wrapAngle(chest - seat), chest, lead: 0, riding: false };
  }
  if (board !== undefined) {
    // The wheels roll where the body heads, and the rider stands sideways on
    // top of them. Nothing at the waist: the pose owns the whole turn.
    return {
      hips: board,
      spine: 0,
      chest: approachAngle(input.chest, board, CHEST_TURN_RATE, delta),
      lead: input.lead * Math.exp(-HIP_TURN_RATE * delta),
      riding: true,
    };
  }
  const wanted = travel === undefined
    ? 0
    : HIP_TWIST_MAX * Math.sin(wrapAngle(travel - head));
  const chest = approachAngle(input.chest, head, CHEST_TURN_RATE, delta);
  const lead = input.lead + (wanted - input.lead) * (1 - Math.exp(-HIP_TURN_RATE * delta));
  return { hips: chest + lead, spine: -lead, chest, lead, riding: false };
}
