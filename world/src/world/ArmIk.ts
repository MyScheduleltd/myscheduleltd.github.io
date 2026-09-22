/**
 * Two-bone inverse kinematics, for putting an avatar's hand where a
 * controller actually is.
 *
 * The rig is already the right shape for this: each arm is a shoulder joint,
 * an elbow half a unit below it and a wrist 0.43 below that, so there is a
 * genuine two-bone chain to solve rather than a single blended pose.
 *
 * Deliberately free of three.js. Everything here is plain arithmetic on
 * triples, which means the solution can be checked by walking the chain
 * forward again and seeing whether the wrist lands where it was asked to —
 * and that is a test of the maths rather than of my guesses about which way
 * the rig's axes point. The caller turns these directions into rotations.
 */

export type Vec3 = readonly [number, number, number];

export interface ArmSolution {
  /** Unit direction of the upper arm, from the shoulder. */
  readonly upper: Vec3;
  /** Unit direction of the forearm, from the elbow. */
  readonly lower: Vec3;
  /** How far the elbow is bent, in radians. 0 is a straight arm. */
  readonly bend: number;
  /** True when the target was beyond reach and the arm is stretched at it. */
  readonly stretched: boolean;
}

const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (v: Vec3): Vec3 => {
  const l = len(v);
  return l > 1e-9 ? scale(v, 1 / l) : [0, -1, 0];
};
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Rodrigues: turn `v` about a unit `axis` by `angle`. */
const rotate = (v: Vec3, axis: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = dot(axis, v) * (1 - c);
  const x = cross(axis, v);
  return [
    v[0] * c + x[0] * s + axis[0] * k,
    v[1] * c + x[1] * s + axis[1] * k,
    v[2] * c + x[2] * s + axis[2] * k,
  ];
};

/**
 * Where the two bones have to point for the wrist to reach `target`.
 *
 * `target` is the wrist's wanted position in the shoulder's own space.
 * `pole` decides which way the elbow breaks — an arm's elbow goes outward and
 * back, never forward through the chest — and only its component across the
 * arm matters, so a rough direction is enough.
 *
 * Out of reach, the arm straightens at the target rather than snapping or
 * refusing: a person reaching for something too far away extends towards it,
 * and `stretched` says so for anything that wants to know.
 */
export function solveArm(
  target: Vec3,
  upperLength: number,
  lowerLength: number,
  pole: Vec3 = [0, 0, -1],
): ArmSolution {
  const reach = upperLength + lowerLength;
  const closest = Math.abs(upperLength - lowerLength);
  const distance = len(target);
  const aim = norm(target);
  // A hair inside each limit, so the triangle never degenerates and `acos`
  // never has to be trusted at exactly ±1.
  // Beyond reach there is no triangle to solve: the arm is straight and
  // pointed at the target. Answered exactly rather than through the clamp
  // below, which would otherwise leave a hair of bend and a hair of slack.
  if (distance >= reach) return { upper: aim, lower: aim, bend: 0, stretched: true };
  const solved = clamp(distance, closest + 1e-4, reach);
  const stretched = false;

  // The angle at the shoulder between the line to the wrist and the upper bone.
  const cosShoulder = (upperLength * upperLength + solved * solved - lowerLength * lowerLength)
    / (2 * upperLength * solved);
  const shoulderAngle = Math.acos(clamp(cosShoulder, -1, 1));

  // Swing the upper bone off the aim line, in the plane the pole picks out.
  let axis = cross(aim, pole);
  if (len(axis) < 1e-6) {
    // Pole parallel to the arm: any perpendicular will do, so take one.
    axis = cross(aim, Math.abs(aim[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  }
  const upper = norm(rotate(aim, norm(axis), shoulderAngle));

  // The forearm simply finishes the journey from the elbow to the target.
  const elbow = scale(upper, upperLength);
  const lower = norm(sub(target, elbow));

  const cosElbow = (upperLength * upperLength + lowerLength * lowerLength - solved * solved)
    / (2 * upperLength * lowerLength);
  const bend = Math.PI - Math.acos(clamp(cosElbow, -1, 1));

  return { upper, lower, bend, stretched };
}

/** Walk the chain forward again: where the wrist actually ends up. */
export function armWrist(solution: ArmSolution, upperLength: number, lowerLength: number): Vec3 {
  const { upper, lower } = solution;
  return [
    upper[0] * upperLength + lower[0] * lowerLength,
    upper[1] * upperLength + lower[1] * lowerLength,
    upper[2] * upperLength + lower[2] * lowerLength,
  ];
}

export interface ArmOrientation {
  /** The shoulder's local X in its parent's space: the elbow's hinge axis. */
  readonly x: Vec3;
  /** Local Y. The bone runs down local -Y, so this is the opposite of `upper`. */
  readonly y: Vec3;
  /** Local Z, completing a right-handed basis. */
  readonly z: Vec3;
  /** Rotation about the elbow's own X that lands the forearm on `lower`. */
  readonly elbowX: number;
}

/**
 * The rotations the rig actually wants, read out of a solved arm.
 *
 * Both bones hang down their joint's local -Y — the elbow sits at [0,-0.5,0]
 * under the shoulder and the wrist at [0,-0.43,0] under the elbow — and the
 * elbow bends about its own X, which is what every hand-written pose in
 * `CoastalPose` does too.
 *
 * A minimal rotation from -Y to the upper bone is not enough: it leaves the
 * twist about the bone arbitrary, and the twist is exactly what decides which
 * way the elbow breaks. So the whole basis is built, with local X *as* the
 * hinge axis, and the elbow angle then falls out of the arithmetic instead of
 * being guessed at and corrected by eye.
 */
export function armOrientation(solution: ArmSolution): ArmOrientation {
  const { upper, lower } = solution;
  const y: Vec3 = [-upper[0], -upper[1], -upper[2]];
  // The plane the two bones lie in. Straight-armed there is no plane, so any
  // perpendicular will do — the elbow angle comes out zero either way.
  let x = cross(upper, lower);
  if (len(x) < 1e-6) x = cross(y, Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const xn = norm(x);
  const z = norm(cross(xn, y));
  // The forearm continues down local -Y when straight. Rotating -Y about +X by
  // t gives (0, -cos t, -sin t), so matching it to `lower` in this basis is a
  // single atan2 and no case analysis.
  const elbowX = Math.atan2(-dot(lower, z), -dot(lower, y));
  return { x: xn, y, z, elbowX };
}
