/**
 * How hard the world is allowed to push the device it is running on.
 *
 * The renderer draws at a fraction of the screen's own pixels and lets the
 * display scale it up. On a phone that fraction is the single cheapest lever
 * there is: a recent iPhone reports three device pixels per CSS pixel, so
 * shading every one of them costs nine times what shading one does.
 *
 * Pure, so `scripts/render-scale.test.mjs` can drive the whole ramp without a
 * GPU — the thing that is easy to get wrong here is not the arithmetic but the
 * oscillation, a scale that drops because the frame rate is low and then
 * raises because dropping it fixed the frame rate, for ever.
 */

/** Below this the picture is judged to be struggling and the scale comes down. */
export const RENDER_SCALE_LOW_FPS = 44;
/**
 * Above this it has room to spare and the scale goes back up.
 *
 * Deliberately far above the floor. If these two thresholds were close, a
 * device sitting between them would spend its life stepping up and down, and a
 * resolution that changes every few seconds is more distracting than a low one
 * that holds still.
 */
export const RENDER_SCALE_HIGH_FPS = 57;

export const RENDER_SCALE_DOWN_STEP = 0.16;
/** Recovery is slower than retreat: better to be late to sharpen than to thrash. */
export const RENDER_SCALE_UP_STEP = 0.07;

/**
 * The lowest fraction each mode may fall to.
 *
 * `lite` is allowed much further down because it is what phones run, and a
 * soft picture that holds its frame rate is worth more than a sharp one that
 * does not — the pixel-art treatment hides most of the softness anyway.
 */
export const RENDER_SCALE_FLOOR = { normal: 0.67, lite: 0.5 } as const;

export interface RenderScalePlan {
  scale: number;
  changed: boolean;
}

export const planRenderScale = (
  scale: number,
  framesPerSecond: number,
  floor: number,
): RenderScalePlan => {
  const current = Number.isFinite(scale) ? Math.min(1, Math.max(floor, scale)) : 1;
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) return { scale: current, changed: false };
  if (framesPerSecond < RENDER_SCALE_LOW_FPS && current > floor) {
    const next = Math.max(floor, current - RENDER_SCALE_DOWN_STEP);
    return { scale: next, changed: next !== current };
  }
  if (framesPerSecond > RENDER_SCALE_HIGH_FPS && current < 1) {
    const next = Math.min(1, current + RENDER_SCALE_UP_STEP);
    return { scale: next, changed: next !== current };
  }
  return { scale: current, changed: false };
};
