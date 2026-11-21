// Bar and beat lines on the track (owner, 2026-11-21: "like Taiko"). A thin
// ink line where each bar of the song begins, and fainter ones on its other
// beats, scroll in with the notes, so the tempo shows before the notes arrive
// and a note between two lines reads as an off-beat. The lines come from the
// song's beat grid (author-moth-feel.py → chart.grid), on the same clock as
// the notes, and are drawn under them: on the main track (which the phone's
// tall view copies) and on Level 4's arcade TV.
export function patchBarLines(once) {
  once('function drawRhythmRailNotes(target, notes, {bounds, cursorX, railY, railTime, speed, cueAt, viewLeft}) {',
    `function drawRhythmBarLines(target, lines, {bounds, cursorX, railTime, speed}) {
  if (!lines?.length) return;
  const left = bounds.x + 36, right = bounds.x + bounds.w - 36;
  target.save();
  for (const bar of [false, true]) {
    target.strokeStyle = bar ? "rgba(35, 28, 13, 0.46)" : "rgba(35, 28, 13, 0.2)";
    target.lineWidth = bar ? 3 : 2;
    const top = bounds.y + (bar ? 48 : 60), bottom = bounds.y + bounds.h - (bar ? 42 : 54);
    target.beginPath();
    for (const line of lines) {
      if (line.bar !== bar) continue;
      const x = Math.round(cursorX + (line.time - railTime) * speed);
      if (x < left) continue;
      if (x > right) break;
      target.moveTo(x, top);
      target.lineTo(x, bottom);
    }
    target.stroke();
  }
  target.restore();
}

function drawRhythmRailNotes(target, notes, {bounds, cursorX, railY, railTime, speed, cueAt, viewLeft}) {`);
  once('      noteTimingCues = drawRhythmRailNotes(target, this.getLevel1OfficeRenderNotes(), {',
    `      drawRhythmBarLines(target, this.getRhythmGridLines(), {bounds: ribbonBounds, cursorX, railTime, speed: pixelsPerSecond});
      noteTimingCues = drawRhythmRailNotes(target, this.getLevel1OfficeRenderNotes(), {`);
  once('      drawRhythmRailNotes(target, this.getLevel1OfficeRenderNotes(), {bounds, cursorX, railY, railTime, speed, cueAt});',
    `      drawRhythmBarLines(target, this.getRhythmGridLines(), {bounds, cursorX, railTime, speed});
      drawRhythmRailNotes(target, this.getLevel1OfficeRenderNotes(), {bounds, cursorX, railY, railTime, speed, cueAt});`);
  once('  getActiveRhythmSpec() {', `  // Every beat on the fight's clock, each marked when it begins a bar, worked
  // out once per fight from the chart's grid. None while practice notes play.
  getRhythmGridLines() {
    const rhythm = this.level1OfficeRhythm;
    if (!rhythm || rhythm.tutorial?.mode !== "done") return null;
    if (rhythm.gridLines !== undefined) return rhythm.gridLines;
    const spec = this.getActiveRhythmSpec(), grid = spec?.chart?.grid;
    if (!grid || !Number.isFinite(grid.firstStep) || !(spec.bpm > 0)) return (rhythm.gridLines = null);
    const stepBeats = spec.chart.stepBeats || 0.5;
    const beat = 60 / spec.bpm, beatsPerBar = Math.round((grid.stepsPerBar || 16) * stepBeats);
    const first = (Number.isFinite(spec.beatOffset) ? spec.beatOffset : 0) + grid.firstStep * stepBeats * beat;
    let end = 0;
    for (const note of rhythm.notes || []) end = Math.max(end, note.time + (note.duration || 0));
    const lines = [];
    for (let k = Math.ceil(-first / beat); first + k * beat <= end + 2 * beatsPerBar * beat; k++) {
      lines.push({time: first + k * beat, bar: ((k % beatsPerBar) + beatsPerBar) % beatsPerBar === 0});
    }
    return (rhythm.gridLines = lines);
  }

  getActiveRhythmSpec() {`);
}
