/** Rolling timings from the real render loop, not clamped simulation delta. */
export class FrameTimings {
  private gaps: number[] = [];
  private work: number[] = [];
  record(gap: number, work: number): void {
    if (gap <= 0) return;
    if (this.gaps.length === 240) { this.gaps.shift(); this.work.shift(); }
    this.gaps.push(gap); this.work.push(work);
  }
  snapshot() {
    const gaps = [...this.gaps].sort((a,b) => a-b), work = [...this.work].sort((a,b) => a-b);
    const at = (a: number[], p: number) => Math.round((a[Math.floor((a.length-1)*p)] ?? 0)*10)/10;
    return { frames: gaps.length, fps: Math.round(10000*gaps.length/(this.gaps.reduce((a,b)=>a+b,0)||1))/10,
      gapP95Ms: at(gaps,.95), gapMaxMs: at(gaps,1), workP95Ms: at(work,.95), workMaxMs: at(work,1) };
  }
}
