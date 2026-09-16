/** Direct, authorized media URLs keyed by the matching YouTube film ID.
 * These are used only for WebXR's in-world screens; ordinary browsers keep the
 * existing YouTube player. Add an MP4 URL here when the film owner supplies it.
 * The video host must permit cross-origin use as a WebGL texture.
 */
export const immersiveVideoSources: Record<string, string> = {};
