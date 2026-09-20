/**
 * Where a private film goes when the visitor is wearing a headset.
 *
 * A private screening has always been a YouTube iframe in `#venue-screen`.
 * That element is also the WebXR DOM overlay root, so unhiding it inside an
 * immersive session does not put the film in the world — it asks the headset
 * to draw a flat browser panel in front of it. The film plays, and the world
 * is still there behind it, but you are watching a web page rather than a
 * cinema. That is the reported bug.
 *
 * A film can only be shown *inside* the session if it has a direct video
 * source, because a cross-origin YouTube iframe can never become a WebGL
 * texture. Only films with `immersiveUrl` qualify; the rest keep the old
 * route, behind a confirmation so nobody is taken out of VR by surprise.
 */

export interface ScreeningFilm {
  id: string;
  title: string;
  youtubeId: string;
  /** A direct, CORS-clean video. Absent for anything that is only on YouTube. */
  immersiveUrl?: string;
}

export interface PrivateScreeningState {
  film: ScreeningFilm;
  /** Where the film was when this screening began, in seconds. */
  offsetSeconds: number;
  /** The clock reading when it began, on the same clock passed to `privateOffset`. */
  startedAt: number;
}

/**
 * Which surface shows it.
 *
 * `venue` is a real cinema screen and is preferred wherever there is one: the
 * festival is worth watching on something the size of a wall. `panel` is the
 * fallback for everywhere else a private screening can be started — the club's
 * DJ booth hands out private tracks, and there is no projector on the floor.
 */
export type PrivatePlacement =
  | { kind: 'venue'; venue: string }
  | { kind: 'panel' }
  | { kind: 'none' };

/** Whether this film can be drawn inside an immersive session at all. */
export function playsInsideHeadset(film: ScreeningFilm | undefined): boolean {
  return Boolean(film?.immersiveUrl);
}

export function placePrivateScreening(
  screening: PrivateScreeningState | undefined,
  activeVenue: string | undefined,
  inHeadset: boolean,
): PrivatePlacement {
  if (!screening || !inHeadset) return { kind: 'none' };
  if (!playsInsideHeadset(screening.film)) return { kind: 'none' };
  if (activeVenue) return { kind: 'venue', venue: activeVenue };
  return { kind: 'panel' };
}

/**
 * Where the film has got to.
 *
 * A private screening loops, unlike a public one: it answers to nobody but the
 * person watching it, so running off the end should return to the beginning
 * rather than leave them looking at a black wall. Without a known duration the
 * elapsed time is returned unwrapped, which is what a still-loading video
 * should seek to once its metadata arrives.
 */
export function privateOffset(
  screening: PrivateScreeningState,
  now: number,
  durationSeconds?: number,
): number {
  const elapsed = Math.max(0, (now - screening.startedAt) / 1000);
  const at = Math.max(0, screening.offsetSeconds) + elapsed;
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return at;
  return at % durationSeconds;
}
