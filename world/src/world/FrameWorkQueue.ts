/** Coalesce resource notifications and settle at most one body per paint. */
export class FrameWorkQueue {
  private pending = new Set<() => void>();
  private scheduled = false;
  constructor(private schedule: (run: () => void) => void = run => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }) {}
  add(work: () => void): void { this.pending.add(work); this.request(); }
  delete(work: () => void): void { this.pending.delete(work); }
  private request(): void {
    if (this.scheduled || !this.pending.size) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      const work = this.pending.values().next().value;
      if (work) { this.pending.delete(work); try { work(); } finally { this.request(); } }
    });
  }
}
