// Meaningful chart limits plus rendered dense-head bounds on small phones,
// portrait phones, landscape and desktop. No production scoreboard requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { calculateRhythmRailGeometry, calculateRhythmTimingCue, MOTH_PORTRAIT_RAIL_HIT_OFFSET, MOTH_RHYTHM_HEAD, MOTH_RHYTHM_RING } from './moth-chart-playability.mjs';
import { stubScoreboard } from './moth-scoreboard-stub.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/data/level1.json'), 'utf8'));
const specs = Object.entries(config).filter(([, value]) => value && typeof value === 'object' && value.chart?.easy)
  .concat(config.secretLevels.map(level => [level.id, level.rhythm]));
const reports = [];
for (const [name, spec] of specs) {
  for (const mode of ['easy', 'hard']) {
    const step = 60 / spec.bpm * spec.chart.stepBeats;
    const notes = spec.chart[mode].map(([index, button, hold = 0]) => {
      const time = spec.beatOffset + index * step;
      return {time, button, status: 'pending', holdEnd: hold > 0 ? spec.beatOffset + (index + hold) * step : null};
    });
    const geometry = calculateRhythmRailGeometry(notes);
    const perfectWindow = spec.perfectWindow || .075;
    const outerRadius = MOTH_RHYTHM_RING.radius + MOTH_RHYTHM_RING.lineWidth / 2 + MOTH_RHYTHM_RING.outlineWidth;
    const fullRingPreview = ((704 - MOTH_PORTRAIT_RAIL_HIT_OFFSET) / 1.35 - outerRadius) / geometry.pixelsPerSecond;
    assert(fullRingPreview >= MOTH_RHYTHM_RING.lead, `${name}/${mode}: even the smallest phone shows the whole ring for its full lead`);
    let closestPixels = Infinity, closestSameKey = Infinity, maxInSecond = 0;
    const last = new Map();
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      assert(Number.isFinite(note.time) && note.time >= 0, `${name}/${mode}: valid audible attack time`);
      const cueAtHit = calculateRhythmTimingCue(note, note.time, perfectWindow);
      const headOuter = MOTH_RHYTHM_HEAD.radius + MOTH_RHYTHM_HEAD.lineWidth / 2;
      assert.equal(cueAtHit.radius - cueAtHit.lineWidth / 2, headOuter, `${name}/${mode}: the ring's inside edge meets the head's outside edge exactly at the attack`);
      assert.equal(cueAtHit.maxRadius, MOTH_RHYTHM_RING.radius, `${name}/${mode}: fixed starting ring size`);
      assert.equal(cueAtHit.lead, MOTH_RHYTHM_RING.lead, `${name}/${mode}: fixed timing lead`);
      assert.equal(cueAtHit.progress, 1, `${name}/${mode}: cue reaches full progress at the attack`);
      let previousRadius = Infinity, previousProgress = -Infinity;
      for (const remaining of [1, .8, .5, .2, .05, 0, -.05]) {
        const cue = calculateRhythmTimingCue(note, note.time - remaining * cueAtHit.lead, perfectWindow);
        assert(cue, `${name}/${mode}: cue remains visible from its lead through the hit window`);
        assert(cue.radius <= previousRadius + 1e-9 && cue.progress >= previousProgress - 1e-9, `${name}/${mode}: every cue shrinks monotonically`);
        assert(cue.radius - cue.lineWidth / 2 >= headOuter && cue.color === '#ffffff', `${name}/${mode}: the ring stays white and outside the head through the attack`);
        if (remaining > 0) assert(cue.radius - cue.lineWidth / 2 > headOuter, `${name}/${mode}: the ring never touches early`);
        previousRadius = cue.radius; previousProgress = cue.progress;
      }
      assert.equal(calculateRhythmTimingCue({...note, status: 'perfect', holding: true}, note.time, perfectWindow), null, `${name}/${mode}: a hit hold has no misleading second cue`);
      assert.equal(calculateRhythmTimingCue(note, note.time - cueAtHit.lead - .01, perfectWindow), null, `${name}/${mode}: cue is absent before its actual lead`);
      assert.equal(calculateRhythmTimingCue(note, note.time + perfectWindow, perfectWindow)?.stage, 'NOW', `${name}/${mode}: closed white cue lasts through the perfect window`);
      assert.equal(calculateRhythmTimingCue(note, note.time + perfectWindow + .001, perfectWindow), null, `${name}/${mode}: cue clears after the perfect window`);
      if (last.has(note.button)) closestSameKey = Math.min(closestSameKey, note.time - last.get(note.button));
      last.set(note.button, note.time);
      maxInSecond = Math.max(maxInSecond, notes.filter(other => other.time >= note.time - 1e-6 && other.time < note.time + 1 - 1e-6).length);
      if (i > 0) {
        const gap = note.time - notes[i - 1].time;
        assert(gap > 0, `${name}/${mode}: no simultaneous unreadable heads`);
        const empty = gap * geometry.pixelsPerSecond - 2 * MOTH_RHYTHM_HEAD.radius - MOTH_RHYTHM_HEAD.lineWidth;
        closestPixels = Math.min(closestPixels, empty);
        assert(empty >= 0.5 - 1e-6, `${name}/${mode}: heads have separate painted bounds (${empty}px)`);
        const previousCue = calculateRhythmTimingCue(notes[i - 1], note.time - MOTH_RHYTHM_RING.lead, perfectWindow);
        const previousOuter = previousCue ? previousCue.radius + previousCue.lineWidth / 2 + previousCue.outlineWidth : headOuter;
        const haloSpace = gap * geometry.pixelsPerSecond - outerRadius - previousOuter;
        assert(haloSpace >= .5 - 1e-6, `${name}/${mode}: neighboring timing circles remain separate when the later ring first appears (${haloSpace}px)`);
      }
      if (note.holdEnd) {
        const next = notes[i + 1];
        assert(!next || next.time - note.holdEnd >= 0.06 - 1e-6, `${name}/${mode}: no hidden head under a hold and room to release`);
      }
    }
    if (mode === 'hard') {
      const minimumGap = Math.max(0.224, Math.min(0.28, 60 / spec.bpm * 0.45));
      assert(geometry.minGap >= minimumGap - 1e-6, `${name}/hard: tempo-scaled minimum gap (${geometry.minGap} < ${minimumGap})`);
      assert(closestSameKey >= 0.30 - 1e-6, `${name}/hard: at least 300ms between same-button attacks`);
      assert(maxInSecond <= 4, `${name}/hard: at most four attacks in any second (${maxInSecond})`);
    }
    reports.push({name, mode, notes: notes.length, minGapMs: Math.round(geometry.minGap * 1000), closestSameKeyMs: Math.round(closestSameKey * 1000), maxInSecond, pixelsPerSecond: geometry.pixelsPerSecond, emptyPixels: Number(closestPixels.toFixed(2)), fullRingPreview: Number(fullRingPreview.toFixed(3))});
  }
}
console.log('chart playability PASS', JSON.stringify(reports));
if (process.argv.includes('--static')) process.exit(0);

const { chromium } = await import('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const out = path.join(root, '.qa/moth/rhythm-review');
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox']});
try {
  for (const [name, viewport, phone] of [
    ['phone-small', {width: 320, height: 568}, true],
    ['phone', {width: 393, height: 852}, true],
    ['landscape', {width: 844, height: 390}, false],
    ['desktop', {width: 1280, height: 800}, false]
  ]) {
    const context = await browser.newContext({viewport, isMobile: phone, hasTouch: phone});
    await stubScoreboard(context);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(new URL(`moth/staff/?device=${phone ? 'phone' : 'desktop'}`, base).href, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 90000});
    const latency = await page.evaluate(() => {
      // Exercise the game's actual clock method with deterministic route
      // reports. Screen layout must never change speaker compensation.
      const read = (deviceMode, {offset = 0, skipAudio = false, outputLatency = 0.041, baseLatency = 0.012, state = 'running'} = {}) => {
        const track = {}, context = {state, outputLatency, baseLatency};
        const receiver = {deviceMode, level1OfficeRhythm: {skipAudio}, getAudioOffsetSeconds: () => offset,
          getActiveLevel1OfficeRhythmAudio: () => track, musicAudioRoutes: new Map([[track, {context}]])};
        return bobbyGame.getRhythmOutputDelay.call(receiver);
      };
      const track = {}, route = {context: {state: 'running', outputLatency: .041, baseLatency: .012}};
      const receiver = {deviceMode: 'desktop', level1OfficeRhythm: {skipAudio: false}, getAudioOffsetSeconds: () => 0,
        getActiveLevel1OfficeRhythmAudio: () => track, musicAudioRoutes: new Map([[track, route]])};
      const initialRoute = bobbyGame.getRhythmOutputDelay.call(receiver);
      route.context.outputLatency = .081;
      const changedLatency = bobbyGame.getRhythmOutputDelay.call(receiver);
      route.context = {state: 'running', outputLatency: .02, baseLatency: .005};
      const changedContext = bobbyGame.getRhythmOutputDelay.call(receiver);
      return {desktop: read('desktop'), phone: read('phone'), calibrated: read('desktop', {offset: .025}),
        skip: read('desktop', {skipAudio: true}), suspended: read('phone', {state: 'suspended'}),
        invalid: read('phone', {outputLatency: NaN}), implausible: read('desktop', {outputLatency: .4}),
        initialRoute, changedLatency, changedContext};
    });
    assert(Math.abs(latency.desktop - .053) < 1e-12 && latency.desktop === latency.phone, `${name}: desktop and phone compensate the same reported output delay`);
    assert.deepEqual(Object.fromEntries(Object.entries(latency).filter(([key]) => !['desktop', 'phone', 'initialRoute', 'changedLatency', 'changedContext'].includes(key))),
      {calibrated: 0, skip: 0, suspended: 0, invalid: 0, implausible: 0}, `${name}: manual calibration bypass and invalid-route handling`);
    assert(Math.abs(latency.initialRoute - .053) < 1e-12 && Math.abs(latency.changedLatency - .093) < 1e-12
      && Math.abs(latency.changedContext - .025) < 1e-12, `${name}: output-route changes invalidate compensation immediately`);
    await page.evaluate(() => bobbyGame.startStage('level1-stage1', {freePlay: true, skipAudio: true}));
    await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm?.tutorial?.mode === 'done' && !bobbyGame.levelLoadingPresentation && !(bobbyGame.stageCountdown > 0), undefined, {timeout: 90000});
    const geometry = await page.evaluate(() => {
      const g = bobbyGame, r = g.level1OfficeRhythm;
      // The closest allowed hard phrase, repeated across all four buttons.
      r.notes = Array.from({length: 10}, (_, index) => ({id: index, time: 10 + index * 0.224, button: 'MOTH'[index % 4], action: index % 2 ? 'accent' : 'do', task: 'stamp', cueAt: 8.4 + index * 0.224, phaseIndex: 0, status: 'pending', cuePlayed: true}));
      const held = {id: -1, time: 9.328, holdEnd: 9.94, button: 'T', action: 'do', task: 'stamp', phaseIndex: 0, status: 'perfect', holding: true};
      r.notes.unshift(held);
      r.frozenSongTime = 9.9; g.songTime = 9.9; r.phaseIntroTimer = 0; r.judgment = null; r.trackPulse = null;
      // Freeze updates after setup; the actual renderer and portrait copy run.
      g.update = () => {};
      const target = g.ctx, arcs = [], clips = [], glyphs = [], tails = [], activeTails = [], holdMarkers = [], stack = [];
      const originals = Object.fromEntries(['save', 'restore', 'beginPath', 'rect', 'clip', 'arc', 'fillText', 'moveTo', 'lineTo', 'stroke', 'fillRect'].map(key => [key, target[key]]));
      let clip = null, pathRect = null, line = [];
      target.save = function () { stack.push(clip); return originals.save.apply(this, arguments); };
      target.restore = function () { clip = stack.pop() || null; return originals.restore.apply(this, arguments); };
      target.beginPath = function () { pathRect = null; line = []; return originals.beginPath.apply(this, arguments); };
      target.rect = function (x, y, w, h) { pathRect = {x, y, w, h}; return originals.rect.apply(this, arguments); };
      target.clip = function () { if (pathRect?.x === 264 && pathRect.w === 952) { clip = pathRect; clips.push(clip); } return originals.clip.apply(this, arguments); };
      target.moveTo = function (x, y) { line.push({x, y}); return originals.moveTo.apply(this, arguments); };
      target.lineTo = function (x, y) { line.push({x, y}); return originals.lineTo.apply(this, arguments); };
      target.stroke = function () {
        if (clip && this.lineWidth === 22 && this.strokeStyle === '#16171b') tails.push({line, cap: this.lineCap});
        if (clip && this.strokeStyle === '#fff3a2' && pathRect == null) activeTails.push(line);
        return originals.stroke.apply(this, arguments);
      };
      target.fillRect = function (x, y, w, h) {
        if (clip && x === 750 && y === 624 && w === 20 && h === 17) holdMarkers.push({x, y});
        return originals.fillRect.apply(this, arguments);
      };
      target.arc = function (x, y, radius, start, end) {
        if (Math.abs(y - 616) < .001 && radius <= 60 && x >= 264 && x <= 1216) {
          arcs.push({x, y, radius, start, end, lineWidth: this.lineWidth, stroke: this.strokeStyle, clip});
        }
        return originals.arc.apply(this, arguments);
      };
      target.fillText = function (text, x, y) {
        if ('MOTH'.includes(text) && Math.abs(y - 616) < 10 && x >= 264 && x <= 1216) {
          const metrics = this.measureText(text);
          const inkRadius = Math.hypot((metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) / 2,
            (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) / 2);
          glyphs.push({text, x, y, font: this.font, inkRadius});
        }
        return originals.fillText.apply(this, arguments);
      };
      try { g.render(); g.renderTallScreen(); }
      finally { Object.assign(target, originals); }
      const layout = g.getRhythmRailGeometry();
      return {speed: layout.pixelsPerSecond, gapPixels: 0.224 * layout.pixelsPerSecond,
        tall: document.body.dataset.tallScreen === '1', viewportWidth: innerWidth,
        canvasBounds: g.ctx.canvas.getBoundingClientRect().toJSON(), telemetry: r.renderTelemetry.railPixelsPerSecond,
        arcs, clips, glyphs, tails, activeTails, holdMarkers, cues: r.renderTelemetry.noteTimingCues,
        heldX: 760 + (held.time - g.songTime) * layout.pixelsPerSecond,
        releaseX: 760 + (held.holdEnd - g.songTime) * layout.pixelsPerSecond};
    });
    assert.equal(geometry.telemetry, geometry.speed, `${name}: draw telemetry uses the actual rail speed`);
    assert.equal(geometry.tall, phone, `${name}: expected phone/desktop renderer`);
    const heads = geometry.arcs.filter(arc => arc.stroke === '#16171b');
    assert(heads.length >= 4 && heads.every(head => head.radius === MOTH_RHYTHM_HEAD.radius && head.lineWidth === MOTH_RHYTHM_HEAD.lineWidth), `${name}: all rendered tap and hold heads have the same radius and stroke`);
    assert(heads.some(head => Math.abs(head.x - geometry.heldX) < 1e-6) && heads.every(head => head.x !== 760), `${name}: judged hold head scrolls past the hit line instead of blocking it`);
    assert(geometry.tails.length === 1 && geometry.tails[0].cap === 'round'
      && Math.abs(geometry.tails[0].line[0].x - geometry.heldX) < 1e-6
      && Math.abs(geometry.tails[0].line[1].x + 11 - geometry.releaseX) < 1e-6,
      `${name}: one rounded hold body connects to the scrolling head and ends at the true release point`);
    assert.equal(geometry.activeTails.length, 1, `${name}: the remaining sustain is visibly lit`);
    assert.equal(geometry.holdMarkers.length, phone ? 1 : 0, `${name}: the key stays identified at the hit line when the hold head leaves the cropped aperture`);
    const cues = geometry.arcs.filter(arc => arc.stroke === MOTH_RHYTHM_RING.color);
    assert(cues.length >= 1 && cues.every(cue => Math.abs(cue.end - cue.start - Math.PI * 2) < 1e-9), `${name}: timing cues are complete shrinking circles`);
    assert(geometry.glyphs.length >= 4 && geometry.glyphs.every(glyph => Number(glyph.font.match(/([\d.]+)px/)[1]) === 18), `${name}: every note letter uses the same 18px font`);
    assert(geometry.glyphs.every(glyph => {
      const head = heads.reduce((closest, head) => Math.abs(head.x - glyph.x) < Math.abs(closest.x - glyph.x) ? head : closest);
      return glyph.inkRadius <= head.radius - head.lineWidth / 2;
    }), `${name}: every letter's measured ink fits inside its colored head without touching the outline`);
    assert(geometry.cues.length === cues.length && geometry.cues.every(cue => cues.some(arc => Math.abs(arc.x - cue.x) < 1e-9 && Math.abs(arc.radius - cue.radius) < 1e-9)), `${name}: telemetry reports the painted cue radii`);
    assert(geometry.clips.length > 0 && geometry.arcs.every(arc => arc.clip), `${name}: all note heads and timing arcs obey rail clipping`);
    const painted = new Map();
    for (const arc of geometry.arcs) painted.set(arc.x, Math.max(painted.get(arc.x) || 0, arc.radius + arc.lineWidth / 2));
    const bounds = [...painted].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < bounds.length; i++) {
      assert(bounds[i][0] - bounds[i - 1][0] - bounds[i][1] - bounds[i - 1][1] >= .5 - 1e-6,
        `${name}: actual head and timing-arc painted bounds never touch`);
    }
    assert(geometry.clips.every(clip => clip.y <= 555 && clip.y + clip.h >= 679.5), `${name}: sparse timing rings fit vertically`);
    await page.screenshot({path: path.join(out, `hard-rail-${name}.png`)});
    assert.deepEqual(errors, []);
    console.log(name, 'rail PASS', JSON.stringify({...geometry, arcs: geometry.arcs.length, clips: geometry.clips, latency}));
    await context.close();
  }
} finally {
  await browser.close();
}
console.log('PASS playability: all nine songs/both modes; hard spacing/repetition/density; separate note heads; four viewport renders');
