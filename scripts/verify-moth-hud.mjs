// The fight's colours and the phone's layout (moth-fight-hud.mjs), Chrome:
//  1. on a phone the timing track runs the whole width, its yellow even (the
//     film's vignette stays on the scene), with Dr. Beauty's staff ID above
//     it in either play mode, and a crowd meter on the level 7 badge;
//     GANGAN's feedback just above that row, off the track,
//     from the row's left edge and as wide as its line;
//  2. the phone's hit line leaves room for incoming cues and centers the note row, and
//     the notes are in the pad's colours (every letter cream), where they are
//     drawn, with the complete white circle visible from the start of its
//     820ms cue even for the densest phrases;
//  3. on a computer the same staff ID stays beside the track, his misses in it.
// Each frame is drawn on demand (render, then renderTallScreen) and read in
// the same step, so what is read is what that frame drew.
// usage: node scripts/verify-moth-hud.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
import {MOTH_NOTE_COLOURS} from './moth-fight-hud.mjs';
import {MOTH_PORTRAIT_RAIL_HIT_OFFSET, MOTH_RHYTHM_RING} from './moth-chart-playability.mjs';
// Ready = booted and the loading card gone: the card swallows every key until
// it leaves (~20 ms after bootDone), so a press inside that gap never lands.

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox']});
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
// Allow small raster variation when sampling glyphs and antialiased edges.
const near = (got, want, slack = 34) => got.every((v, c) => Math.abs(v - want[c]) <= slack);
// The track's yellow, the release's own.
const TRACK = rgb('#f1c62d');
// Pixels of a note's own colour in the 28 x 28 box around its head (of 784).
const filledPixels = note => {
  const want = rgb(MOTH_NOTE_COLOURS[note.button]);
  let n = 0;
  for (let i = 0; i < note.fill.length; i += 4) if (near([note.fill[i], note.fill[i + 1], note.fill[i + 2]], want, 40)) n++;
  return n;
};

async function fight(viewport, stage, freePlay, phone = true) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone});
  await stubScoreboard(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(new URL(`moth/staff/${phone ? '?device=phone' : ''}`, base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone&&!document.getElementById("moth-boot-loading"), undefined, {timeout: 60000});
  await page.evaluate(stage => {
    const g = bobbyGame, draw = g.drawGanganCoachChip;
    // Where the phone's view puts GANGAN's feedback.
    window.__tallChips = [];
    g.drawGanganCoachChip = function (target, rect, ...rest) {
      if (target === this.portraitCtx) window.__tallChips.push({...rect});
      return draw.call(this, target, rect, ...rest);
    };
    g.debugUnlockAllStages();
    g.startStage(stage, {freePlay: true, skipAudio: true});
  }, stage);
  await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm && !bobbyGame.level1OfficeRhythm.graphicsLoading
    && !(bobbyGame.stageCountdown > 0) && bobbyGame.level1OfficeRhythm.tutorial?.mode === 'done', undefined, {timeout: 90000});
  await page.waitForTimeout(2500);
  // A story fight: started from stage select, then counted as story.
  await page.evaluate(freePlay => { bobbyGame.freePlay = freePlay; }, freePlay);
  return {context, page, errors};
}

// One frame, drawn now, with what it shows.
const frame = page => page.evaluate(() => {
  const g = bobbyGame, rhythm = g.level1OfficeRhythm;
  rhythm.combo = 12; rhythm.roundScore = 4500; rhythm.hype = 0.55;
  // Each 失誤 tally the frame draws: on the phone's row or in the computer's box.
  const tallies = [], drawTally = g.drawMissTally;
  g.drawMissTally = function (target, row, misses) {
    const text = [], fillText = target.fillText;
    target.fillText = function (value, ...rest) {
      text.push(value);
      return fillText.call(this, value, ...rest);
    };
    try {
      return drawTally.apply(this, arguments);
    } finally {
      target.fillText = fillText;
      tallies.push({tall: target === this.portraitCtx, misses, text});
    }
  };
  rhythm.misses = 0;
  g.render();
  g.renderTallScreen();
  const zeroTallies = tallies.splice(0);
  rhythm.misses = 7;
  g.render();
  g.renderTallScreen();
  g.drawMissTally = drawTally;
  const tall = g.portraitCanvas && document.body.dataset.tallScreen === '1' ? g.portraitCtx : null;
  const read = (context, x, y) => [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
  const count = (context, box, test) => {
    const data = context.getImageData(box.x, box.y, box.w, box.h).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (test(data[i], data[i + 1], data[i + 2])) n++;
    return n;
  };
  // The phone's slice of the frame's track (hit line x 760, notes y 616).
  const {src, dest} = PORTRAIT_FIGHT.track;
  const scale = dest.w / src.w;
  const tallX = x => dest.x + (x - src.x) * scale, railY = dest.y + (616 - src.y) * dest.h / src.h;
  // Where this frame put the notes: the active cue's ring gives its clock.
  const ring = rhythm.renderTelemetry?.cueRing;
  const cue = g.getLevel1OfficeActiveCue();
  const railSpeed = g.getRhythmRailGeometry().pixelsPerSecond;
  const clock = cue && ring ? cue.time - (ring.x - 760) / railSpeed : null;
  const notes = clock == null ? [] : g.getLevel1OfficeRenderNotes().filter(note => note.status === 'pending' && !note.holdEnd)
    .map(note => ({button: note.button, ahead: note.time - clock, x: 760 + (note.time - clock) * railSpeed}));
  const wide = g.ctx;
  const out = {tall: Boolean(tall), notes, tallies, zeroTallies, missLabel: g.tr('MISS', '失誤'), tallyInk: 0, hype: 0,
    previewSeconds: (src.x + src.w - 760) / railSpeed,
    hitLine: tallX(760) - (dest.x + dest.w / 2), rail: railY - (dest.y + dest.h / 2)};
  if (tall) {
    // The row above the track, and the track's band under its legend.
    const row = {x: 8, y: 520, w: 704, h: 46};
    out.rowLeft = read(tall, 16, 543);
    out.rowPaper = read(tall, 440, 526);
    out.tallyInk = count(tall, {x: 352, y: 522, w: 84, h: 31},
      (r, g, b) => Math.abs(r - 0xb3) < 16 && Math.abs(g - 0x20) < 20 && Math.abs(b - 0x2c) < 20);
    out.hype = count(tall, row, (r, g, b) => (r === 0x3f && g === 0x6f && b === 0xb8) || (r === 0x9c && g === 0xcf && b === 0x6a));
    out.trackBand = [30, 150, 270, 390, 510, 630, 690].map(x => read(tall, x, 760));
    out.noteSamples = notes.map(note => ({...note, tallX: tallX(note.x),
      colour: read(tall, tallX(note.x) - 12, railY), centre: read(tall, tallX(note.x), railY + 3),
      // The head's fill around its letter: one pixel can land on a letter's edge
      // (O's ring sits 12 px left of centre), so count the box.
      fill: Array.from(tall.getImageData(Math.round(tallX(note.x)) - 14, Math.round(railY) - 14, 28, 28).data),
      // Adaptive heads use a smaller glyph, so a single coordinate may land
      // on an antialiased edge. Inspect its central stem, inside the cue arc.
      creamStemPixels: count(tall, {x: Math.round(tallX(note.x)) - 2, y: Math.round(railY) - 4, w: 5, h: 10},
        (r, g, b) => r > 210 && g > 200 && b > 170)}));
  } else {
    out.trackBand = [300, 500, 900, 1150].map(x => ({x, y: 696, colour: read(wide, x, 696)}));
    out.lifeBox = read(wide, 30, 600);
  }
  return out;
});

function verifyMissTally(shot, tall, name) {
  const zero = shot.zeroTallies.filter(item => item.tall === tall);
  assert(zero.length > 0 && zero.every(item => item.misses === 0 && item.text.length === 1 && item.text[0] === shot.missLabel),
    `${name}: label alone at zero misses ${JSON.stringify(zero)}`);
  assert(shot.tallies.some(item => item.tall === tall && item.misses === 7 && item.text.includes('7')),
    `${name}: numeric total after a miss ${JSON.stringify(shot.tallies)}`);
}

// 1 and 2. The phone.
for (const run of [
  {name: 'story, level 1', stage: 'level1-stage1', freePlay: false, band: '#2d7ec2'},
  {name: 'practice, level 4', stage: 'level4-stage1', freePlay: true, band: '#3552a8'},
  {name: 'story, level 7', stage: 'level6-stage2', freePlay: false, band: '#8a3fb0', concert: true}
]) {
  const {context, page, errors} = await fight({width: 393, height: 852}, run.stage, run.freePlay);
  const shot = await frame(page);
  assert(shot.tall, `${run.name}: the tall view is drawn`);
  // Level 7 dims its track while the band sound-checks; it still spans the width.
  const trackColour = run.concert ? shot.trackBand[0] : TRACK;
  for (const sample of shot.trackBand) assert(near(sample, trackColour, 2), `${run.name}: the track spans the width, its yellow even ${JSON.stringify(shot.trackBand)}`);
  assert(near(shot.rowPaper, [0xef, 0xe6, 0xcc], 12), `${run.name}: the staff ID strip's paper ${shot.rowPaper}`);
  assert(near(shot.rowLeft, rgb(run.band), 12), `${run.name}: the strip's band in the fight's colour ${shot.rowLeft}`);
  assert(shot.tallyInk > 30, `${run.name}: the strip's red tally (${shot.tallyInk} px)`);
  verifyMissTally(shot, true, run.name);
  if (run.concert) assert(shot.hype > 100, `${run.name}: the hype bar below the tally (${shot.hype} px)`);
  assert(Math.abs(shot.hitLine - (MOTH_PORTRAIT_RAIL_HIT_OFFSET - 352)) < 1 && Math.abs(shot.rail) < 1,
    `${run.name}: the portrait crop gives incoming rings the intended room ${shot.hitLine} ${shot.rail}`);
  // Upcoming notes in the pad's colours, where the frame drew them.
  const visible = shot.noteSamples.filter(note => note.ahead > 0.1 && note.tallX < 700);
  if (!run.concert) {
    assert(visible.length >= 1, `${run.name}: notes on the track ${JSON.stringify(shot.noteSamples.map(({fill, ...note}) => note))}`);
    for (const note of visible) {
      const {fill, ...seen} = note, filled = filledPixels(note);
      assert(filled >= 60, `${run.name}: ${note.button} note in its colour (${filled} of 784 px) ${JSON.stringify(seen)}`);
      // T's stem is at the note's centre: cream, like the other letters (owner, 2026-10-18).
      if (note.button === 'T') assert(note.creamStemPixels >= 2, `${run.name}: T's letter is cream ${JSON.stringify(seen)}`);
    }
    assert(shot.previewSeconds >= 0.9, `${run.name}: at least 900ms until an incoming head reaches the hit line`);
    const far = shot.noteSamples.find(note => note.ahead > MOTH_RHYTHM_RING.lead - .1 && note.ahead < shot.previewSeconds - .12);
    if (far) { const {fill, ...seen} = far; assert(far.tallX < 712 && filledPixels(far) >= 60, `${run.name}: a note ${far.ahead.toFixed(2)} s ahead is on the track ${JSON.stringify(seen)}`); }
  }
  // GANGAN's feedback (a missed note brings it) above the row, clear of the track.
  await page.waitForFunction(() => window.__tallChips.length > 0, undefined, {timeout: 30000});
  const chips = await page.evaluate(() => window.__tallChips);
  assert(chips.every(chip => chip.x === 8 && chip.y >= 400 && chip.y + chip.h <= 516 && chip.w >= 260 && chip.w <= 704), `${run.name}: feedback above the row, from its left edge ${JSON.stringify(chips.slice(0, 2))}`);
  assert.deepEqual(errors, []);
  console.log(`phone ${run.name} PASS`, JSON.stringify({row: shot.rowLeft, tallyInk: shot.tallyInk, hype: shot.hype, notes: visible.length, previewSeconds: shot.previewSeconds, chipWidths: [...new Set(chips.map(chip => Math.round(chip.w)))]}));
  await context.close();
}

// 3. A computer.
{
  const {context, page, errors} = await fight({width: 1280, height: 800}, 'level1-stage1', false, false);
  const shot = await frame(page);
  assert(!shot.tall);
  // The scene grade ends above the HUD: its actual palette stays exact.
  for (const {x, colour} of shot.trackBand) assert(near(colour, TRACK, 2), `desktop: the track's yellow at ${x}: ${colour}`);
  assert(near(shot.lifeBox, [0xef, 0xe6, 0xcc], 12), `desktop: Dr. Beauty's staff ID beside the track ${shot.lifeBox}`);
  verifyMissTally(shot, false, 'desktop');
  assert.deepEqual(errors, []);
  console.log('desktop PASS', JSON.stringify(shot.trackBand.map(sample => sample.colour)));
  await context.close();
}
await browser.close();
