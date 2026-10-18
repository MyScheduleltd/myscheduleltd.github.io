/**
 * The sign-in page's loading bar: one bar, bottom right, as a percentage (the
 * owner, 2026-10-18). On a slow connection the globe and the character took a
 * while to appear and nothing said they were coming.
 *
 * The character's part is real bytes (ImportedAvatar.avatarLoadFraction). The
 * globe's arrives as script, which reports no bytes, so it moves in steps — the
 * topology, its code, its first painted frame — and between them eases towards
 * the next step without ever reaching it. A stall shows as a bar that has all
 * but stopped, never as one that claims more than has happened.
 */
export type GlobeStep = 'start' | 'topology' | 'code' | 'painted';
export type GateLoadStage = 'world' | 'character';
export interface GateLoadReading { percent: number; stage: GateLoadStage; done: boolean }

const GLOBE_AT: Record<GlobeStep, number> = { start: 0, topology: .08, code: .75, painted: 1 };
const NEXT: Record<GlobeStep, GlobeStep> = { start: 'topology', topology: 'code', code: 'painted', painted: 'painted' };
/** How much of the bar is the character when both are loading: most of the bytes are his or hers. */
const CHARACTER_SHARE = .65;
/** How quickly the globe eases towards its next step while waiting for it. */
const EASE_MS = 3_000;

export class GateLoadMeter {
  private step: GlobeStep;
  private stepAt: number;
  private character = 0;
  private characterDone: boolean;
  private readonly globeShare: number;
  private readonly characterShare: number;
  private shown = 0;

  /** `globe`: the globe is still to appear; `character`: so is the character. */
  constructor(now: number, { globe, character }: { globe: boolean; character: boolean }) {
    this.step = globe ? 'start' : 'painted';
    this.stepAt = now;
    this.characterDone = !character;
    this.globeShare = globe ? character ? 1 - CHARACTER_SHARE : 1 : 0;
    this.characterShare = character ? globe ? CHARACTER_SHARE : 1 : 0;
  }

  globe(step: GlobeStep, now: number): void {
    if (GLOBE_AT[step] <= GLOBE_AT[this.step]) return;
    this.step = step;
    this.stepAt = now;
  }

  /** The character's own progress, 0 to 1; 1 once it can be drawn. */
  characterProgress(fraction: number): void {
    if (fraction >= 1) this.characterDone = true;
    else this.character = Math.max(this.character, Math.max(0, fraction));
  }

  get done(): boolean { return this.step === 'painted' && this.characterDone; }

  read(now: number): GateLoadReading {
    const at = GLOBE_AT[this.step], next = GLOBE_AT[NEXT[this.step]];
    const globe = at + (next - at) * .8 * (1 - Math.exp(-Math.max(0, now - this.stepAt) / EASE_MS));
    const value = this.globeShare * globe + this.characterShare * (this.characterDone ? 1 : this.character);
    const done = this.done;
    // Never backwards, and 100 only when both are there.
    this.shown = done ? 100 : Math.max(this.shown, Math.min(99, Math.floor(value * 100)));
    return { percent: this.shown, stage: this.step === 'painted' && this.characterShare ? 'character' : 'world', done };
  }
}
