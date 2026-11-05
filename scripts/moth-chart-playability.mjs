// Keep neighboring drum notes readable on the shared horizontal rail. The
// chart owns timing; this changes only drawing, never an attack or judgment.
export function calculateRhythmRailGeometry(notes = []) {
  const gaps = notes.slice(1).map((note, index) => note.time - notes[index].time);
  const positive = gaps.filter(gap => gap > 0.001);
  const minGap = positive.length ? Math.min(...positive) : Infinity;
  // About 50 px between the closest heads, with at least 1.45 s of preview
  // in the phone's 260 px half-track. Reserve a narrow halo around dense
  // heads so every timing cue can remain a complete shrinking circle.
  const pixelsPerSecond = Math.min(180, Math.max(140, Math.ceil(50 / minGap)));
  const heads = notes.map((note, index) => {
    const before = index > 0 ? note.time - notes[index - 1].time : Infinity;
    const after = index + 1 < notes.length ? notes[index + 1].time - note.time : Infinity;
    const distance = Math.max(0, Math.min(before, after)) * pixelsPerSecond;
    return {
      radius: Math.max(11.75, Math.min(21, (distance - 18.5) / 2)),
      // A thinner outline preserves the same usable colored interior around
      // a 16 px letter while leaving at least 5 px of visible cue travel.
      lineWidth: distance < 54 ? 3 : 5,
      maxRingRadius: Math.max(14.5, Math.min(59, distance / 2 - 1.75))
    };
  });
  return { pixelsPerSecond, minGap, heads };
}

// A cue always closes onto the note's painted outer border at its exact
// audible attack time. Dense notes reveal it later, rather than switching to
// an unrelated fixed-radius growing arc or covering the next note's letter.
export function calculateRhythmTimingCue(note, renderTime, geometry, fullLead, perfectWindow, goodWindow) {
  if (note?.status !== 'pending' || !Number.isFinite(note.time) || !Number.isFinite(renderTime)) return null;
  const targetRadius = geometry.radius + (geometry.lineWidth || 5) / 2;
  const maxRadius = Math.max(targetRadius, geometry.maxRingRadius);
  const expansion = maxRadius - targetRadius;
  const lead = Math.min(Math.max(.01, fullLead), Math.max(.35, expansion / 28));
  const until = note.time - renderTime;
  if (until > lead + 1e-9 || until < -goodWindow) return null;
  const remaining = Math.min(1, Math.max(0, until / lead));
  const stage = until < -perfectWindow ? 'LATE' : Math.abs(until) <= perfectWindow ? 'NOW' : 'HIT';
  return {radius: targetRadius + expansion * remaining, targetRadius, maxRadius, lead,
    progress: 1 - remaining, until, stage, color: stage === 'LATE' ? '#ff315a' : '#ffffff',
    lineWidth: stage === 'NOW' ? 3 : 2};
}

export function patchChartPlayability(once, edit) {
  once('const RHYTHM_DIFFICULTIES = {', calculateRhythmRailGeometry.toString() + '\n\n' + calculateRhythmTimingCue.toString() + '\n\nconst RHYTHM_DIFFICULTIES = {');
  once('      const pixelsPerSecond = 140;', '      const railGeometry = this.getRhythmRailGeometry();\n      const pixelsPerSecond = railGeometry.pixelsPerSecond;');
  once('      // Hold tails first, under every head: a bar out to where the hold ends,', `      // Clip heads and rings as a whole at the rail's edges (including the
      // phone's copied strip), rather than letting partial circles escape it.
      target.save();
      target.beginPath();
      target.rect(trackLeft, ribbonBounds.y + 32, trackRight - trackLeft, ribbonBounds.h - 52);
      target.clip();
      // Hold tails first, under every head: a bar out to where the hold ends,`);
  once('        target.arc(x, railY, 21, 0, TAU);', '        const noteGeometry = railGeometry.byNote.get(note) || { radius: 21, maxRingRadius: 59 };\n        const noteRadius = noteGeometry.radius;\n        target.lineWidth = noteGeometry.lineWidth || 5;\n        target.arc(x, railY, noteRadius, 0, TAU);');
  once('        drawCentredGlyph(target, button, x, railY, "900 18px \'Courier New\', monospace");', '        drawCentredGlyph(target, button, x, railY, `900 ${Math.max(16, Math.min(18, Math.floor(noteRadius * 0.9)))}px \'Courier New\', monospace`);');
  once('    target.fillStyle = haunted ? "#281328" : "#f1c62d";', '    const noteTimingCues = [];\n    target.fillStyle = haunted ? "#281328" : "#f1c62d";');
  edit('        const noteUntil = note.time - renderTime;\n', '          const approachRadius = 27 + remainingRatio * 32;\n', () => `        const timing = !frozen && !haunted && !rhythm?.ending
          ? this.getRhythmTimingCue(note, renderTime, noteGeometry) : null;
        if (timing) {
`);
  edit('          const noteStage = noteUntil < -perfectWindow\n', '          target.restore();\n        }\n      });\n', () => `          target.save();
          target.strokeStyle = timing.color;
          target.lineWidth = timing.lineWidth;
          target.beginPath();
          target.arc(x, railY, timing.radius, 0, TAU);
          target.stroke();
          target.restore();
          noteTimingCues.push({ id: note.id, time: note.time, button, x, y: railY, ...timing });
        }
      });
      target.restore();
`);
  once('        approachRadius: activeCue ? 27 + clamp(Math.max(0, timeUntilCue) / cueLeadDuration, 0, 1) * 48 : null,',
    '        approachRadius: activeCue ? this.getRhythmTimingCue(activeCue, renderTime)?.radius ?? null : null,\n        noteTimingCues,');
  once('              x: 760 + (activeCue.time - renderTime) * 140,', '              x: 760 + (activeCue.time - renderTime) * this.getRhythmRailGeometry().pixelsPerSecond,');
  once('              y: ribbonBounds.y + 96\n            }', '              y: ribbonBounds.y + 96,\n              visible: Boolean(this.getRhythmTimingCue(activeCue, renderTime)),\n              radius: this.getRhythmTimingCue(activeCue, renderTime)?.radius ?? null\n            }');
  once('        phaseIntroVisible,\n        haunted,', '        railPixelsPerSecond: this.getRhythmRailGeometry().pixelsPerSecond,\n        phaseIntroVisible,\n        haunted,');
}

export const RHYTHM_RAIL_METHODS = `
  getRhythmTimingCue(note, renderTime, geometry = null) {
    const spec = this.getActiveRhythmSpec();
    const head = geometry || this.getRhythmRailGeometry().byNote.get(note) || {radius: 21, maxRingRadius: 59};
    const fullLead = Math.min(rhythmRingLeadSeconds(spec), Math.max(.01, note.time - note.cueAt));
    return calculateRhythmTimingCue(note, renderTime, head, fullLead, spec.perfectWindow || .085, spec.goodWindow || .19);
  }

  getRhythmRailGeometry() {
    const rhythm = this.level1OfficeRhythm;
    const tutorial = rhythm?.tutorial;
    // Tutorial notes may move after a miss. Its one visible note has no
    // neighboring head to collide with and retains the familiar large ring.
    if (tutorial?.mode === "practice") return { pixelsPerSecond: 140, byNote: new Map() };
    const notes = rhythm?.notes || [];
    if (rhythm?.railGeometry?.notes === notes) return rhythm.railGeometry;
    const geometry = calculateRhythmRailGeometry(notes);
    geometry.notes = notes;
    geometry.byNote = new Map(notes.map((note, index) => [note, geometry.heads[index]]));
    if (rhythm) rhythm.railGeometry = geometry;
    return geometry;
  }
`;
