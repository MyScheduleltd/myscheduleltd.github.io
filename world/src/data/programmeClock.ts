/**
 * A venue's programme running on the visitor's own clock.
 *
 * With the festival service connected, every attendee shares one programme
 * clock and this is not used. On a static host there is no service, and the
 * screens used to sit on whichever work was listed first, restarting it from
 * the top every time somebody walked back into the room.
 *
 * Nothing in the catalogue records how long a work runs — it is built from the
 * site's video list, which carries no durations — so they are learned from the
 * player the first time a work is watched and kept in local storage. Until a
 * length is known a nominal slot is used, so the order still advances rather
 * than sticking on the first entry for ever.
 */
const NOMINAL_SLOT_SECONDS = 240;
const DURATIONS_KEY = 'myschedule-programme-durations-v1';
const CLOCKS_KEY = 'myschedule-programme-clocks-v1';

interface VenueClock {
  /** Index into the venue's running order. */
  index: number;
  /** When the work at that index started, as a wall-clock stamp. */
  startedAt: number;
}

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) as T } : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing and full quotas are not worth breaking a screening over.
  }
};

export class ProgrammeClock {
  private durations = readJson<Record<string, number>>(DURATIONS_KEY, {});
  private clocks = readJson<Record<string, VenueClock>>(CLOCKS_KEY, {});

  /** How long a work runs, once the player has told us. */
  learnDuration(youtubeId: string, seconds: number): void {
    if (!youtubeId || !Number.isFinite(seconds) || seconds < 1) return;
    const known = this.durations[youtubeId];
    if (known && Math.abs(known - seconds) < 1) return;
    this.durations[youtubeId] = Math.round(seconds);
    writeJson(DURATIONS_KEY, this.durations);
  }

  durationOf(youtubeId: string): number {
    return this.durations[youtubeId] ?? NOMINAL_SLOT_SECONDS;
  }

  /**
   * Where a venue's programme is right now: which work, and how far into it.
   * Rolls forward through as many works as the elapsed time covers, so a venue
   * nobody has visited for an hour is found part-way through a later work
   * rather than still sitting on the one that was playing when they left.
   */
  position(venue: string, order: string[]): { youtubeId: string; offset: number } | undefined {
    if (!order.length) return undefined;
    const now = Date.now();
    let clock = this.clocks[venue];
    if (!clock || clock.index >= order.length || !order[clock.index]) {
      clock = { index: 0, startedAt: now };
    }
    let elapsed = (now - clock.startedAt) / 1000;
    // A clock from a previous visit can be days old. Walking it forward one
    // work at a time would be a long loop, so wrap by the running order first.
    const totalRun = order.reduce((sum, id) => sum + this.durationOf(id), 0);
    if (totalRun > 0 && elapsed > totalRun) {
      const laps = Math.floor(elapsed / totalRun);
      elapsed -= laps * totalRun;
      clock = { index: clock.index, startedAt: now - elapsed * 1000 };
    }
    let guard = order.length + 1;
    while (elapsed >= this.durationOf(order[clock.index]) && guard > 0) {
      elapsed -= this.durationOf(order[clock.index]);
      clock = { index: (clock.index + 1) % order.length, startedAt: now - elapsed * 1000 };
      guard -= 1;
    }
    const previous = this.clocks[venue];
    if (!previous || previous.index !== clock.index || Math.abs(previous.startedAt - clock.startedAt) > 1500) {
      this.clocks[venue] = clock;
      writeJson(CLOCKS_KEY, this.clocks);
    }
    return { youtubeId: order[clock.index], offset: Math.max(0, Math.floor(elapsed)) };
  }

  /** Called when a work reaches its end, so the next one starts cleanly. */
  advance(venue: string, order: string[]): void {
    if (!order.length) return;
    const clock = this.clocks[venue] ?? { index: 0, startedAt: Date.now() };
    this.clocks[venue] = { index: (clock.index + 1) % order.length, startedAt: Date.now() };
    writeJson(CLOCKS_KEY, this.clocks);
  }
}
