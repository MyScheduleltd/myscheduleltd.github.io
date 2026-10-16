/** Rolling timings from the real render loop, not clamped simulation delta. */
export class FrameTimings {
  private gaps: number[] = [];
  private work: number[] = [];
  private longestGap = 0;
  private longFrames = 0;
  private elapsed = 0;
  private stalls: Array<{ atMs: number; gapMs: number; workMs: number }> = [];
  reset(): void {
    this.gaps = []; this.work = []; this.longestGap = 0; this.longFrames = 0; this.elapsed = 0; this.stalls = [];
  }
  record(gap: number, work: number): void {
    if (gap <= 0) return;
    this.longestGap = Math.max(this.longestGap, gap);
    this.elapsed += gap;
    if (gap > 100) {
      this.longFrames++;
      this.stalls.push({ atMs: Math.round(this.elapsed), gapMs: Math.round(gap), workMs: Math.round(work) });
      if (this.stalls.length > 24) this.stalls.shift();
    }
    if (this.gaps.length === 240) { this.gaps.shift(); this.work.shift(); }
    this.gaps.push(gap); this.work.push(work);
  }
  snapshot() {
    const gaps = [...this.gaps].sort((a,b) => a-b), work = [...this.work].sort((a,b) => a-b);
    const at = (a: number[], p: number) => Math.round((a[Math.floor((a.length-1)*p)] ?? 0)*10)/10;
    return { frames: gaps.length, fps: Math.round(10000*gaps.length/(this.gaps.reduce((a,b)=>a+b,0)||1))/10,
      gapP95Ms: at(gaps,.95), gapMaxMs: at(gaps,1), workP95Ms: at(work,.95), workMaxMs: at(work,1),
      lifetimeGapMaxMs: Math.round(this.longestGap * 10) / 10, over100Ms: this.longFrames, stalls: [...this.stalls] };
  }
}
