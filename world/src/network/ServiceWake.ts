/**
 * Whether the festival server is awake, and how far along its waking is.
 *
 * The server runs on Render's free plan, which puts it to sleep after fifteen
 * minutes without a visitor and takes up to about a minute to wake it
 * (render.com/docs/free). The first visitor after a quiet spell is the one who
 * wakes it, and their requests simply wait while it does. The owner,
 * 2026-11-09: everything still loads on the loading page, the page explains
 * the wait, and the bar includes the server's waking.
 *
 * Render reports nothing while a server wakes, so the waking part of the bar
 * is a clock. It eases towards full without reaching it and fills only when
 * the server answers. A stall shows as a bar that has all but stopped, never
 * as one that claims more than has happened (as GateLoadMeter does).
 */
export type ServiceWakeState = 'asking' | 'waking' | 'awake' | 'unreachable';
export interface ServiceWakeReading {
  state: ServiceWakeState;
  /** 0 to 1, and 1 only once the server has answered. */
  progress: number;
  /** Whole seconds since the page first asked. */
  seconds: number;
}

/** An awake server answers well inside this; past it, the server is waking. */
export const WAKING_AFTER_MS = 2_500;
/** How long the loading page holds a visitor for the server before going in alone. */
export const GIVE_UP_AFTER_MS = 120_000;
/** What a sleeping server's wake typically costs, for the bar's pace and the copy. */
export const TYPICAL_WAKE_MS = 60_000;
/** How much of the loading bar is the server's, when it is still asleep at ENTER. */
export const WAKE_SHARE = .3;
const WAKE_EASE_MS = 30_000;
const WAKE_CEILING = .95;

export class ServiceWake {
  private readonly startedAt: number;
  private answeredAt?: number;

  constructor(now: number) {
    this.startedAt = now;
  }

  answered(now: number): void {
    this.answeredAt ??= Math.max(now, this.startedAt);
  }

  get awake(): boolean {
    return this.answeredAt !== undefined;
  }

  read(now: number): ServiceWakeReading {
    const elapsed = Math.max(0, (this.answeredAt ?? now) - this.startedAt);
    const seconds = Math.floor(elapsed / 1_000);
    if (this.answeredAt !== undefined) return { state: 'awake', progress: 1, seconds };
    const progress = elapsed < WAKING_AFTER_MS ? 0 : WAKE_CEILING * (1 - Math.exp(-elapsed / WAKE_EASE_MS));
    if (elapsed >= GIVE_UP_AFTER_MS) return { state: 'unreachable', progress, seconds };
    return { state: elapsed < WAKING_AFTER_MS ? 'asking' : 'waking', progress, seconds };
  }

  /** Whether the loading page should still hold a visitor for the server. */
  holds(now: number): boolean {
    return this.answeredAt === undefined && now - this.startedAt < GIVE_UP_AFTER_MS;
  }

  /** Milliseconds until the loading page stops holding for it; 0 once it no longer does. */
  remaining(now: number): number {
    return this.holds(now) ? GIVE_UP_AFTER_MS - (now - this.startedAt) : 0;
  }
}

/**
 * The bar the visitor sees: the world's own loading, and the server's waking
 * when ENTER found it still asleep. `share` is fixed when loading begins so the
 * bar does not jump when the server answers.
 */
export function entryProgress(assets: number, wake: number, share: number): number {
  const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const s = clamp(share);
  return clamp((1 - s) * clamp(assets) + s * clamp(wake));
}

/** Only a hosted service sleeps. A loopback one may opt in for review with `?wake=1`. */
export function serviceCanSleep(serviceUrl: string, pageHost: string, search: string): boolean {
  let host = '';
  try { host = new URL(serviceUrl).hostname; } catch { return false; }
  const loopback = (name: string) => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(name);
  if (!loopback(host)) return true;
  return loopback(pageHost) && new URLSearchParams(search).get('wake') === '1';
}
