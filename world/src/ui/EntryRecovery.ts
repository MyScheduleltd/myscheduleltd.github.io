/** A failed entrance must return to a usable gate before allocating 3D again. */
export const ENTRY_PHASE_KEY = 'myschedule-festival-entry-phase-v1';
export const ENTRY_RETRY_KEY = 'myschedule-festival-rejoin-tries-v1';
export type EntryPhase = 'loading' | 'ready' | 'stable' | 'interrupted';

export interface EntryRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface EntryRecoveryOptions {
  /** Lazy access also catches browsers that throw while reading sessionStorage. */
  storage?: EntryRecoveryStorage | (() => EntryRecoveryStorage);
  phaseKey?: string;
  retryKey?: string;
  stableAfterMs?: number;
  setTimeout?: (callback: () => void, milliseconds: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
}

const PHASES = new Set<EntryPhase>(['loading', 'ready', 'stable', 'interrupted']);

/** Owns the entrance phase and stability timer, never identity or server tokens.
 * App retains its bounded automatic-rejoin counter for settled/legacy visits.
 */
export class EntryRecovery {
  private readonly storage: () => EntryRecoveryStorage;
  private readonly phaseKey: string;
  private readonly retryKey: string;
  private readonly stableAfterMs: number;
  private readonly schedule: NonNullable<EntryRecoveryOptions['setTimeout']>;
  private readonly cancel: NonNullable<EntryRecoveryOptions['clearTimeout']>;
  private generation = 0;
  private activePhase?: EntryPhase;
  private timer?: unknown;

  constructor(options: EntryRecoveryOptions = {}) {
    const storage = options.storage;
    this.storage = typeof storage === 'function' ? storage : storage ? () => storage : () => sessionStorage;
    this.phaseKey = options.phaseKey ?? ENTRY_PHASE_KEY;
    this.retryKey = options.retryKey ?? ENTRY_RETRY_KEY;
    this.stableAfterMs = options.stableAfterMs ?? 120_000;
    this.schedule = options.setTimeout ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.cancel = options.clearTimeout ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  private read(): { available: boolean; phase?: EntryPhase } {
    try {
      const stored = this.storage().getItem(this.phaseKey);
      if (stored === null) return { available: true };
      return { available: true, phase: PHASES.has(stored as EntryPhase) ? stored as EntryPhase : 'interrupted' };
    } catch { return { available: false }; }
  }

  /** Safe to consult while restoring the tab's saved name and outfit. */
  phase(): EntryPhase | undefined { return this.read().phase; }

  private write(phase: EntryPhase): boolean {
    this.activePhase = phase;
    try { this.storage().setItem(this.phaseKey, phase); return true; }
    catch { return false; }
  }

  /** A native process crash cannot run a catch handler. Its persisted loading
   * marker blocks the next automatic admission before heavy work starts.
   * Missing markers are legacy visits and retain App's existing retry limit.
   */
  allowAutomaticRejoin(): boolean {
    const { available, phase } = this.read();
    if (!available) return false;
    if (phase === 'loading') { this.write('interrupted'); return false; }
    return phase !== 'interrupted';
  }

  private cancelTimer(): void {
    const timer = this.timer;
    this.timer = undefined;
    if (timer !== undefined) try { this.cancel(timer); } catch { /* optional timer service */ }
  }

  /** Call before beginning the loading animation or allocating a new world. */
  begin(): void {
    this.cancelTimer();
    this.generation++;
    this.write('loading');
  }

  /** Call only after the entrance overlay is gone and gameplay has control.
   * A slow entrance never consumes the stability interval or clears retries.
   */
  finish(): void {
    if (this.activePhase !== 'loading') return;
    if (!this.write('ready')) return;
    const generation = this.generation;
    this.timer = this.schedule(() => {
      if (generation !== this.generation || this.activePhase !== 'ready' || this.phase() !== 'ready') return;
      this.timer = undefined;
      if (!this.write('stable')) return;
      try { this.storage().removeItem(this.retryKey); } catch { /* keep the conservative retry budget */ }
    }, this.stableAfterMs);
  }

  /** Also cancels a previous world's timer during entry errors or teardown. */
  fail(): void {
    this.cancelTimer();
    this.generation++;
    this.write('interrupted');
  }
}
