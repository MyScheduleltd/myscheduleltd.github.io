/**
 * Keeping an in-world screen on the festival's shared clock without making the
 * picture stutter.
 *
 * Every seat in a venue is watching the same screening, so a screen that has
 * drifted has to be pulled back. The obvious way — assign `currentTime` — is
 * the expensive way: a seek throws away the buffer the browser has built,
 * issues a fresh Range request, and makes the decoder hunt for the nearest
 * keyframe before it can show anything. On a desk that is a blink. In a headset,
 * on wifi, while the world around the screen is holding 90fps, it is the
 * visible hitch the owner asked to be rid of.
 *
 * So drift is corrected two ways. Small drift is absorbed by running the film a
 * few percent fast or slow until it lines up, which costs nothing, touches no
 * network, and is under the threshold anybody notices — browsers correct pitch
 * on a rate change by default, so the audio does not chipmunk either. Only
 * drift too large to walk off is worth a seek.
 *
 * Kept free of three.js and of the DOM so the policy can be tested directly.
 */

/** Drift we simply live with. Below this, correcting costs more than it buys. */
export const SYNC_TOLERANCE_SECONDS = 0.25;

/**
 * Drift we give up on walking off and seek instead.
 *
 * Deliberately generous. Because the rate nudge runs continuously, ordinary
 * drift never reaches this — it is here for the discontinuities a nudge cannot
 * answer: a screening that changed film, a headset that slept, a tab that was
 * throttled in the background for a minute.
 */
export const SYNC_SEEK_SECONDS = 5;

/** The most we will bend the clock. Five percent passes unnoticed; more does not. */
export const SYNC_MAX_RATE_NUDGE = 0.05;

/**
 * How long a correction is given to converge. A gap is closed at
 * `drift / SYNC_CATCHUP_SECONDS`, so the further behind the screen is the
 * harder it pulls, up to the cap above.
 */
export const SYNC_CATCHUP_SECONDS = 20;

export interface VideoSyncState {
  /** `video.currentTime`. */
  current: number;
  /** Where the shared programme clock says this screen should be. */
  target: number;
  /** `video.duration`; may be 0 or NaN before metadata arrives. */
  duration: number;
  /** `video.readyState`. Below `HAVE_METADATA` there is nothing to seek to. */
  readyState: number;
  /** True while the screen has stopped for want of data. */
  buffering?: boolean;
}

export interface VideoSyncPlan {
  /** Assign to `currentTime`, or leave alone when absent. */
  seekTo?: number;
  /** What `playbackRate` should be. */
  playbackRate: number;
}

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

/**
 * Where the clock's answer lands inside a film that loops.
 *
 * A screening runs longer than its film, so the shared time can be past the
 * end; the film is where it would be on this pass through.
 */
export const wrapToDuration = (seconds: number, duration: number): number => {
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, seconds);
  if (!Number.isFinite(seconds)) return 0;
  const wrapped = seconds % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
};

/**
 * Whether a screen joining a screening should seek at all.
 *
 * Joining within the first few seconds is treated as joining at the start.
 * A seek before playback has begun is the worst one there is — it happens
 * before any buffer exists, so it is a round trip the viewer waits out in
 * full — and buying it to skip two seconds of a film is a bad trade.
 */
export const JOIN_FROM_START_SECONDS = 3;

export const videoJoinTime = (target: number, duration: number): number | undefined => {
  const at = wrapToDuration(target, duration);
  return at > JOIN_FROM_START_SECONDS ? at : undefined;
};

/**
 * What to do about the gap between where a screen is and where it should be.
 *
 * Positive drift means the screen is behind and has to hurry.
 */
export const videoSyncPlan = (state: VideoSyncState): VideoSyncPlan => {
  const { current, target, duration, readyState } = state;

  // Nothing is known about the film yet, so there is nothing to correct
  // towards and no seek that would land anywhere.
  if (readyState < 1 || !Number.isFinite(current) || !Number.isFinite(target)) {
    return { playbackRate: 1 };
  }

  const wanted = wrapToDuration(target, duration);
  let drift = wanted - current;

  // Near a loop point the short way round may be backwards through the end.
  // Without this a screen at 203s of a 205s film, told to be at 1s, reads as
  // 202 seconds behind and seeks — when it is two seconds from arriving there
  // on its own.
  if (Number.isFinite(duration) && duration > 0) {
    if (drift > duration / 2) drift -= duration;
    else if (drift < -duration / 2) drift += duration;
  }

  if (Math.abs(drift) <= SYNC_TOLERANCE_SECONDS) return { playbackRate: 1 };

  // Too far to walk off. Note this still seeks to `wanted`, not to `current +
  // drift`, so a wrap lands in the right place.
  if (Math.abs(drift) >= SYNC_SEEK_SECONDS) return { seekTo: wanted, playbackRate: 1 };

  // Already stopped for want of data. Running faster only asks for more of what
  // it has not got, and running slower prolongs the stall.
  if (state.buffering) return { playbackRate: 1 };

  const nudge = clamp(drift / SYNC_CATCHUP_SECONDS, -SYNC_MAX_RATE_NUDGE, SYNC_MAX_RATE_NUDGE);
  return { playbackRate: 1 + nudge };
};

/** The shape of `video.buffered`, named here so this file needs no DOM. */
export interface BufferedRanges {
  length: number;
  start(index: number): number;
  end(index: number): number;
}

/**
 * How many seconds of film are already in hand ahead of the playhead.
 *
 * The one number that says whether a screen is about to stall. Only the range
 * containing the playhead counts: a browser that has fetched a stretch further
 * on — after a seek, say — has nothing that helps the next frame.
 */
export const bufferedAheadOf = (ranges: BufferedRanges | undefined, current: number): number => {
  if (!ranges || !Number.isFinite(current)) return 0;
  for (let index = 0; index < ranges.length; index += 1) {
    // A hair of tolerance at the head: a playhead sitting exactly on a
    // boundary is inside the range for every purpose that matters here.
    if (current >= ranges.start(index) - 0.05 && current <= ranges.end(index)) {
      return Math.max(0, ranges.end(index) - current);
    }
  }
  return 0;
};
