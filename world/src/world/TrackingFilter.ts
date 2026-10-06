/** Sample-time filtering keeps webcam noise down without adding render-rate lag. */
export interface Landmark { x: number; y: number; z: number; visibility?: number }
const alpha = (seconds: number, cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * seconds));
export class LandmarkFilter {
  private held: Landmark[] = [];
  private previous: Landmark[] = [];
  private speed: number[] = [];
  private at = 0;
  reset(): void { this.held = []; this.previous = []; this.speed = []; this.at = 0; }
  read(points: Landmark[], at: number): Landmark[] | undefined {
    if (!Number.isFinite(at) || points.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) return undefined;
    if (this.at && at <= this.at) return this.held.map(p => ({ ...p }));
    const dt = Math.max(.001, Math.min(.1, (at - this.at) / 1000));
    const fresh = !this.at || at - this.at > 350 || this.held.length !== points.length;
    this.held = points.map((p, i) => {
      const old = this.held[i];
      if (fresh || !old) { this.speed[i] = 0; return { ...p }; }
      if ((p.visibility ?? 1) < .5) return { ...old, visibility: p.visibility };
      const prev = this.previous[i] ?? p;
      const velocity = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) / dt;
      const derivativeEase = alpha(dt, 1.5);
      this.speed[i] = (this.speed[i] ?? 0) + (velocity - (this.speed[i] ?? 0)) * derivativeEase;
      // Steady hands get a low cutoff; deliberate movement follows faster.
      const ease = alpha(dt, 2.5 + Math.min(18, this.speed[i] * 8));
      return { x: old.x + (p.x - old.x) * ease, y: old.y + (p.y - old.y) * ease,
        z: old.z + (p.z - old.z) * ease, visibility: p.visibility };
    });
    this.previous = points.map(p => ({ ...p })); this.at = at;
    return this.held.map(p => ({ ...p }));
  }
}

/**
 * A hand's landmarks, ready for a LandmarkFilter.
 *
 * MediaPipe's HandLandmarker does not estimate visibility for hand points: it
 * reports 0 for every one. The filter holds any point under .5 where it last
 * was, so every finger froze on the first frame the hand was found and never
 * moved again, while the arms (from the pose model, which does report
 * visibility) kept following (the owner, 2026-10-07). A hand that was detected
 * at all is in view; its points carry no visibility here.
 */
export function handLandmarks(points: Landmark[]): Landmark[] {
  return points.map(({ x, y, z }) => ({ x, y, z }));
}

/** Match both detections together so crossed hands cannot overwrite one side. */
export function assignWebcamHands(wrists: Array<Landmark | undefined>, pose: Landmark[] | undefined,
  labels: string[]): Array<'left' | 'right'> {
  // MediaPipe reports anatomical handedness. Mirroring the preview must not
  // reverse the curl normal used to interpret the landmark skeleton.
  const fallback = labels.map(label => label === 'Left' ? 'left' as const : 'right' as const);
  if (!pose || pose.length < 33 || (pose[15].visibility ?? 1) < .5 || (pose[16].visibility ?? 1) < .5) return fallback;
  const distance = (i: number, side: number) => wrists[i]
    ? Math.hypot(wrists[i]!.x - pose[side].x, wrists[i]!.y - pose[side].y) : 1e3;
  if (wrists.length === 2) return distance(0, 15) + distance(1, 16) <= distance(0, 16) + distance(1, 15)
    ? ['left', 'right'] : ['right', 'left'];
  return wrists.map((p, i) => p ? distance(i, 15) <= distance(i, 16) ? 'left' : 'right' : fallback[i]);
}
