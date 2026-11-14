// Keep neighboring drum notes readable on the shared horizontal rail. The
// chart owns timing; this changes only drawing, never an attack or judgment.
export const MOTH_RHYTHM_HEAD = {radius: 21, lineWidth: 5, font: "900 18px 'Courier New', monospace"};
export const MOTH_RHYTHM_RING = {radius: 39, lineWidth: 4, outlineWidth: 2, lead: 0.82, color: '#ffffff', outlineColor: '#493423'};
export const MOTH_PORTRAIT_RAIL_HIT_OFFSET = 226;

export function getRhythmDrumPulse(notes, time) {
  // Sample the last charted drum attack on the same clock that draws the notes.
  // Searching by time also works after a pause or a dropped animation frame.
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (notes[middle].time <= time) low = middle + 1;
    else high = middle;
  }
  const note = notes[low - 1];
  if (!note) return 0;
  const backbeat = note.button === "T" || note.button === "O";
  const decay = backbeat ? 0.19 : 0.12;
  const remaining = Math.max(0, 1 - (time - note.time) / decay);
  return remaining * remaining * (backbeat ? 1 : 0.48);
}

export function calculateRhythmRailGeometry(notes = []) {
  let minGap = Infinity;
  for (let index = 1; index < notes.length; index++) {
    const gap = notes[index].time - notes[index - 1].time;
    if (gap > 0.001) minGap = Math.min(minGap, gap);
  }
  // The previous ring is already closing when the next one appears at full
  // size. Reserve room for both painted edges, even in the tightest pair.
  const {radius, lineWidth, outlineWidth, lead} = MOTH_RHYTHM_RING;
  const closed = MOTH_RHYTHM_HEAD.radius + (MOTH_RHYTHM_HEAD.lineWidth + lineWidth) / 2;
  const previousRadius = closed + (radius - closed) * Math.max(0, 1 - minGap / lead);
  const ringSpacing = radius + previousRadius + lineWidth + 2 * outlineWidth + 1.5;
  const pixelsPerSecond = Math.max(140, Math.ceil(ringSpacing / minGap));
  return {pixelsPerSecond, minGap};
}

// A cue always closes onto the note's painted outer border at its exact
// audible attack time. The dark edge extends outward from the white stroke.
export function calculateRhythmTimingCue(note, renderTime, perfectWindow) {
  if (note?.status !== 'pending' || !Number.isFinite(note.time) || !Number.isFinite(renderTime)) return null;
  const {radius: maxRadius, lead, color, lineWidth, outlineWidth, outlineColor} = MOTH_RHYTHM_RING;
  const targetRadius = MOTH_RHYTHM_HEAD.radius + (MOTH_RHYTHM_HEAD.lineWidth + lineWidth) / 2;
  const until = note.time - renderTime;
  if (until > lead + 1e-9 || until < -perfectWindow - 1e-9) return null;
  const remaining = Math.min(1, Math.max(0, until / lead));
  const stage = Math.abs(until) <= perfectWindow + 1e-9 ? 'NOW' : 'HIT';
  return {radius: targetRadius + (maxRadius - targetRadius) * remaining, targetRadius, maxRadius, lead,
    progress: 1 - remaining, until, stage, color, lineWidth, outlineWidth, outlineColor};
}

function drawRhythmNoteHead(target, {x, y, button, missed, completed, held}, scale = 1) {
  const {radius, lineWidth, font} = MOTH_RHYTHM_HEAD;
  const active = completed || held;
  target.save();
  target.fillStyle = missed ? "#30343a" : active ? "#fff3a2" : MOTH_NOTE_COLOURS[button] || "#ef3f78";
  target.strokeStyle = "#16171b";
  target.lineWidth = lineWidth * scale;
  target.beginPath();
  target.arc(x, y, radius * scale, 0, TAU);
  target.fill();
  target.stroke();

  target.lineCap = "round";
  target.lineWidth = 2 * scale;
  target.strokeStyle = missed ? "rgba(210, 215, 222, 0.18)" : "rgba(255, 255, 234, 0.48)";
  target.beginPath();
  target.arc(x, y, (radius - 6) * scale, Math.PI * 1.13, Math.PI * 1.69);
  target.stroke();
  target.fillStyle = missed ? "#747982" : active ? "#16171b" : "#ffffff";
  drawCentredGlyph(target, button, x, y, scale === 1 ? font : font.replace("18px", Math.round(18 * scale) + "px"));
  target.restore();
}

function drawRhythmHoldTail(target, {x, endX, y, hitX, button, missed, held, completed}, scale = 1) {
  if (endX <= x) return;
  // The curved cap is inside the tail's true end, so the painted right edge
  // reaches the line precisely when the sustain finishes.
  const half = Math.min(11 * scale, (endX - x) / 2);
  const center = endX - half;
  const railColor = missed ? "#30343a" : held || completed ? "#77745d" : MOTH_NOTE_COLOURS[button] || "#ef3f78";
  target.save();
  target.lineCap = "round";
  target.strokeStyle = "#16171b";
  target.lineWidth = half * 2;
  target.beginPath();
  target.moveTo(x, y);
  target.lineTo(center, y);
  target.stroke();
  target.strokeStyle = railColor;
  target.lineWidth = half * 1.27;
  target.stroke();

  if (held && !missed && endX > hitX) {
    // Keep the path connected to its head. Only the unplayed part changes
    // color at the hit line, which shows what remains to be held.
    target.save();
    target.beginPath();
    target.rect(hitX, y - half, endX - hitX, half * 2);
    target.clip();
    target.strokeStyle = "#fff3a2";
    target.lineWidth = half * 1.27;
    target.beginPath();
    target.moveTo(x, y);
    target.lineTo(center, y);
    target.stroke();
    target.restore();
  }
  target.restore();
}

function drawRhythmHoldMarker(target, x, y, button, scale = 1) {
  // If the original head has scrolled outside the window, identify the
  // sustained key just below its connected tail, clear of the note lane.
  target.save();
  target.fillStyle = "#16171b";
  target.fillRect(x - 10 * scale, y + 8 * scale, 20 * scale, 17 * scale);
  target.fillStyle = "#fff3a2";
  target.fillRect(x - 8 * scale, y + 9 * scale, 16 * scale, 14 * scale);
  target.fillStyle = "#16171b";
  drawCentredGlyph(target, button, x, y + 16 * scale, "900 " + Math.round(11 * scale) + "px 'Courier New', monospace");
  target.restore();
}

function drawRhythmTimingRing(target, x, y, cue, scale = 1) {
  target.save();
  target.strokeStyle = cue.outlineColor;
  target.lineWidth = (cue.lineWidth + cue.outlineWidth) * scale;
  target.beginPath();
  target.arc(x, y, (cue.radius + cue.outlineWidth / 2) * scale, 0, TAU);
  target.stroke();
  target.strokeStyle = cue.color;
  target.lineWidth = cue.lineWidth * scale;
  target.beginPath();
  target.arc(x, y, cue.radius * scale, 0, TAU);
  target.stroke();
  target.restore();
}

function drawRhythmHitPulse(target, x, y, pulse, age, reducedMotion) {
  const duration = pulse.finish ? 0.28 : 0.22;
  if (age < 0 || age >= duration) return;
  const remaining = 1 - age / duration;
  const progress = 1 - remaining * remaining;
  const strong = pulse.perfect || pulse.finish;
  const colour = MOTH_NOTE_COLOURS[pulse.button] || "#f7f2de";
  target.save();
  target.globalAlpha = remaining * 0.88;
  target.lineWidth = 3;
  target.strokeStyle = strong ? "#fff4b3" : "#c9f2ff";
  target.beginPath();
  target.arc(x, y, 25 + (reducedMotion ? 0 : progress * (strong ? 25 : 15)), 0, TAU);
  target.stroke();
  if (!reducedMotion) {
    // Small sparks stay within the hit area and clear before the next attack.
    const distance = 29 + progress * (strong ? 22 : 12);
    const diagonal = Math.round(distance * 0.61);
    const lift = Math.round(distance * 0.48);
    const size = strong ? 5 : 4;
    target.fillStyle = colour;
    for (const offset of [-1, 1]) {
      target.fillRect(x + offset * diagonal - size / 2, y - lift, size, size);
      target.fillRect(x + offset * diagonal - size / 2, y + lift, size, size);
    }
  }
  target.restore();
}

export function patchChartPlayability(once, edit) {
  once('const RHYTHM_DIFFICULTIES = {', `const MOTH_RHYTHM_HEAD = ${JSON.stringify(MOTH_RHYTHM_HEAD)};
const MOTH_RHYTHM_RING = ${JSON.stringify(MOTH_RHYTHM_RING)};
${calculateRhythmRailGeometry.toString()}

${getRhythmDrumPulse.toString()}

${calculateRhythmTimingCue.toString()}

${drawRhythmNoteHead.toString()}

${drawRhythmHoldTail.toString()}

${drawRhythmHoldMarker.toString()}

${drawRhythmTimingRing.toString()}

${drawRhythmHitPulse.toString()}

const RHYTHM_DIFFICULTIES = {`);
  once('      lastBeatIndex: -1,\n', '');
  once(`    const beatSeconds = 60 / Math.max(1, spec.bpm || 92.3);
    const beatIndex = Math.floor((this.songTime - (spec.beatOffset || 0)) / beatSeconds);
    if (beatIndex !== rhythm.lastBeatIndex) {
      rhythm.lastBeatIndex = beatIndex;
      rhythm.beatPulse = 1;
    }
    rhythm.beatPulse = Math.max(0, rhythm.beatPulse - dt * 4.8);`,
    '    rhythm.beatPulse = rhythm.ending ? 0 : getRhythmDrumPulse(rhythm.notes, this.getLevel1OfficeRenderTime());');
  once('    rhythm.trackPulse = { at: this.time, perfect };',
    '    rhythm.trackPulse = { at: this.time, perfect, button: target.button };');
  once('    rhythm.trackPulse = { at: this.time, perfect: true };',
    '    rhythm.trackPulse = { at: this.time, perfect: true, button: note.button, finish: true };');
  edit('      // A shockwave off the hit line on every hit, and a bigger one with a\n', '      // No combo callout on the track:', () => `      const pulse = !frozen && !rhythm?.ending && rhythm?.trackPulse;
      if (pulse && motionTime - pulse.at < 0.28) {
        drawRhythmHitPulse(target, cursorX, railY, pulse, motionTime - pulse.at,
          window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
      }
      // No combo callout on the track:`);
  once('x: 760 - 352 / 1.35, y: 616 - 98 / 1.35', `x: 760 - ${MOTH_PORTRAIT_RAIL_HIT_OFFSET} / 1.35, y: 616 - 98 / 1.35`);
  once("  // width: a slice of the frame's track centred on its hit line (x 760) and\n  // its row of notes (y 616), scaled up so the notes read bigger than they do\n  // full-width.", "  // width: a slice of the track, with more room in front of the hit line\n  // (x 760) for incoming circles. The row (y 616) stays vertically centered\n  // and is scaled up for legibility.");
  once('      const pixelsPerSecond = 140;', '      const pixelsPerSecond = this.getRhythmRailGeometry().pixelsPerSecond;');
  once('    target.fillStyle = haunted ? "#281328" : "#f1c62d";', '    const noteTimingCues = [];\n    target.fillStyle = haunted ? "#281328" : "#f1c62d";');
  edit('      const trackLeft = ribbonBounds.x + 36;\n', '      target.font = "900 13px \'Courier New\', monospace";', () => `      const trackLeft = ribbonBounds.x + 36;
      const trackRight = ribbonBounds.x + ribbonBounds.w - 36;
      const viewLeft = this.isTallScreenView() ? PORTRAIT_FIGHT.track.src.x : trackLeft;
      const headRadius = MOTH_RHYTHM_HEAD.radius + MOTH_RHYTHM_HEAD.lineWidth / 2;
      const visibleNotes = [];
      for (const note of this.getLevel1OfficeRenderNotes()) {
        const x = cursorX + (note.time - renderTime) * pixelsPerSecond;
        const endX = note.holdEnd ? cursorX + (note.holdEnd - renderTime) * pixelsPerSecond : x;
        if (endX + headRadius < trackLeft || x - headRadius > trackRight) continue;
        visibleNotes.push({note, x, endX,
          button: note.button || LEVEL1_OFFICE_ACTION_KEYS[note.action],
          missed: note.status === "miss" || note.holdBroken,
          completed: note.status === "perfect" || note.status === "good",
          held: note.holding});
      }
      target.save();
      target.beginPath();
      target.rect(trackLeft, ribbonBounds.y + 32, trackRight - trackLeft, ribbonBounds.h - 52);
      target.clip();
      // Paint tails underneath every head, with the release cap at the real
      // end of its sustain. The scrolling head and spent tail stay connected.
      for (const {note, x, endX, button, missed, held} of visibleNotes) {
        if (!note.holdEnd) continue;
        drawRhythmHoldTail(target, {x, endX, y: railY, hitX: cursorX, button, missed, held, completed: note.holdDone});
        if (held && endX > cursorX && x + headRadius <= viewLeft) {
          drawRhythmHoldMarker(target, cursorX, railY, button);
        }
      }
      for (const {note, x, button, missed, completed, held} of visibleNotes) {
        drawRhythmNoteHead(target, {x, y: railY, button, missed, completed, held});
        const timing = !frozen && !haunted && !rhythm?.ending
          ? this.getRhythmTimingCue(note, renderTime) : null;
        if (timing) {
          drawRhythmTimingRing(target, x, railY, timing);
          noteTimingCues.push({id: note.id, time: note.time, button, x, y: railY, ...timing});
        }
      }
      target.restore();

      target.font = "900 13px 'Courier New', monospace";`);
  once('        approachRadius: activeCue ? 27 + clamp(Math.max(0, timeUntilCue) / cueLeadDuration, 0, 1) * 48 : null,',
    '        approachRadius: activeCue ? this.getRhythmTimingCue(activeCue, renderTime)?.radius ?? null : null,\n        noteTimingCues,');
  once('              x: 760 + (activeCue.time - renderTime) * 140,', '              x: 760 + (activeCue.time - renderTime) * this.getRhythmRailGeometry().pixelsPerSecond,');
  once('              y: ribbonBounds.y + 96\n            }', '              y: ribbonBounds.y + 96,\n              visible: Boolean(this.getRhythmTimingCue(activeCue, renderTime)),\n              radius: this.getRhythmTimingCue(activeCue, renderTime)?.radius ?? null\n            }');
  once('        phaseIntroVisible,\n        haunted,', '        railPixelsPerSecond: this.getRhythmRailGeometry().pixelsPerSecond,\n        phaseIntroVisible,\n        haunted,');
}

export const RHYTHM_RAIL_METHODS = `
  getRhythmTimingCue(note, renderTime) {
    return calculateRhythmTimingCue(note, renderTime, this.getActiveRhythmSpec().perfectWindow || .075);
  }

  getRhythmRailGeometry() {
    const rhythm = this.level1OfficeRhythm;
    const tutorial = rhythm?.tutorial;
    // Practice shows only one note at a time and keeps the baseline speed.
    if (!rhythm || tutorial?.mode === "practice") return {pixelsPerSecond: 140};
    if (this.rhythmRailLayout?.notes !== rhythm.notes) {
      this.rhythmRailLayout = {notes: rhythm.notes, ...calculateRhythmRailGeometry(rhythm.notes)};
    }
    return this.rhythmRailLayout;
  }
`;
