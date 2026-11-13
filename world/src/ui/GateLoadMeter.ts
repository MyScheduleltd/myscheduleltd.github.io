/**
 * The sign-in page's loading bar, as one percentage (the owner, 2026-10-18;
 * since 2026-11-12 it covers everything, and ENTER waits at 100%).
 *
 * Two parts. The globe arrives as script, which reports no bytes, so it moves
 * in steps — the topology, its code, its first painted frame — and between
 * them eases towards the next step without ever reaching it. Everything else
 * (both bodies, the band, the sounds, the world's own files) is real bytes
 * (SignInDownloads). A stall shows as a bar that has all but stopped, never as
 * one that claims more than has happened.
 */
export type GlobeStep = 'start' | 'topology' | 'code' | 'painted';
export interface GateLoadReading { percent: number; done: boolean }

const GLOBE_AT: Record<GlobeStep, number> = { start: 0, topology: .08, code: .75, painted: 1 };
const NEXT: Record<GlobeStep, GlobeStep> = { start: 'topology', topology: 'code', code: 'painted', painted: 'painted' };
/** The globe's share of the bar when it is still to appear: most of what is waited for is bytes. */
const GLOBE_SHARE = .2;
/** How quickly the globe eases towards its next step while waiting for it. */
const EASE_MS = 3_000;

export class GateLoadMeter {
  private step: GlobeStep;
  private stepAt: number;
  private bytes = 0;
  private bytesDone = false;
  private readonly globeShare: number;
  private shown = 0;

  /** `globe`: the globe is still to appear. */
  constructor(now: number, { globe }: { globe: boolean }) {
    this.step = globe ? 'start' : 'painted';
    this.stepAt = now;
    this.globeShare = globe ? GLOBE_SHARE : 0;
  }

  globe(step: GlobeStep, now: number): void {
    if (GLOBE_AT[step] <= GLOBE_AT[this.step]) return;
    this.step = step;
    this.stepAt = now;
  }

  /** The downloads' progress, 0 to 1, and whether every one has settled. */
  downloads(fraction: number, done: boolean): void {
    if (done) this.bytesDone = true;
    else this.bytes = Math.max(this.bytes, Math.min(1, Math.max(0, fraction)));
  }

  get done(): boolean { return this.step === 'painted' && this.bytesDone; }

  /** The globe has painted; what is left is downloads. */
  get globeShown(): boolean { return this.step === 'painted'; }

  read(now: number): GateLoadReading {
    const at = GLOBE_AT[this.step], next = GLOBE_AT[NEXT[this.step]];
    const globe = at + (next - at) * .8 * (1 - Math.exp(-Math.max(0, now - this.stepAt) / EASE_MS));
    const value = this.globeShare * globe + (1 - this.globeShare) * (this.bytesDone ? 1 : this.bytes);
    const done = this.done;
    // Never backwards, and 100 only when everything is there.
    this.shown = done ? 100 : Math.max(this.shown, Math.min(99, Math.floor(value * 100)));
    return { percent: this.shown, done };
  }
}
