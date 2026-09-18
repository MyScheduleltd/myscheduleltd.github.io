/**
 * Turning two fingers into a camera distance.
 *
 * Kept apart from the world so `scripts/camera-avoidance.test.mjs` can check
 * the arithmetic, which is the part that is easy to get backwards: spreading
 * the fingers has to bring the camera *in*, the way it enlarges a photograph.
 */

export const CAMERA_ZOOM_MIN = 0.45;
export const CAMERA_ZOOM_MAX = 2.2;

/**
 * The smallest change worth acting on, in pixels of finger separation.
 *
 * Two fingers resting on glass are never quite still, and a phone reports that
 * tremor. Below this it is noise, and following it makes the view breathe.
 */
export const PINCH_DEAD_ZONE = 1.5;

/**
 * `zoom` is a multiple of the resting camera distance, so a spread that grows
 * divides it: fingers apart, camera closer.
 *
 * Returns the zoom unchanged when there is nothing sensible to do — the first
 * frame of a pinch, a degenerate spread, or a tremor below the dead zone — so
 * a caller can assign the result unconditionally.
 */
export const pinchZoom = (zoom: number, previousSpread: number, spread: number): number => {
  if (!Number.isFinite(previousSpread) || !Number.isFinite(spread)) return zoom;
  if (previousSpread <= 0 || spread <= 0) return zoom;
  if (Math.abs(spread - previousSpread) < PINCH_DEAD_ZONE) return zoom;
  const next = zoom * (previousSpread / spread);
  if (!Number.isFinite(next)) return zoom;
  return Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, next));
};

/** The distance between two fingers. */
export const pinchSpread = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.hypot(a.x - b.x, a.y - b.y);
