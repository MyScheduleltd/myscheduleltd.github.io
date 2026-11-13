/**
 * The world's screen treatment, the PS1 look (the owner, 2026-11-09: "PS1
 * low-poly with chunky pixel textures", with a subtle screen layer of
 * resolution and dither only, no wobble or texture warping).
 *
 * The world is drawn at a fixed low resolution, about PS1_SHORT_SIDE pixels
 * across its short side, and enlarged as square blocks of a whole number of
 * device pixels. Every lit or flat surface is then reduced to 15-bit colour
 * (five bits per channel, the PlayStation's own depth) through a 4×4 ordered
 * dither (WorldFilmGrain.ts). The earlier film look was retired on 2026-11-12.
 */

/** Rows (portrait: columns) of drawn pixels the short side aims for. */
export const PS1_SHORT_SIDE = 360;

/**
 * The renderer's pixel ratio for the PS1 look. Each drawn pixel covers k×k
 * device pixels for a whole number k, so the blocks stay even and do not
 * crawl as the camera moves; k is chosen to bring the short side nearest
 * the target.
 */
export function ps1PixelRatio(cssWidth: number, cssHeight: number, devicePixelRatio: number, targetShortSide = PS1_SHORT_SIDE): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const shortSide = Math.max(1, Math.min(cssWidth || 1, cssHeight || 1)) * dpr;
  const blocks = Math.max(1, Math.round(shortSide / Math.max(1, targetShortSide)));
  return dpr / blocks;
}
