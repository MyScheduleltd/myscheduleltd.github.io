// The fight's colours and the phone's layout (moth-fight-hud.mjs), Chrome:
//  1. on a phone the timing track runs the whole width, its yellow even (the
//     film's vignette stays on the scene), with Dr. Beauty's row above it: hearts, combo and score in a story
//     fight, level 7's hype bar in the hearts' place, his staff ID strip in a
//     practice run;
//  2. the notes are in the pad's colours (T's letter dark), and one 3 s
//     ahead is already on the phone's track, where it is drawn;
//  3. on a computer Dr. Beauty's box stays beside the track.
// Each frame is drawn on demand (render, then renderTallScreen) and read in
// the same step, so what is read is what that frame drew.
// usage: node scripts/verify-moth-hud.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
import {MOTH_NOTE_COLOURS} from './moth-fight-hud.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox']});
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
// The film grain over the frame moves each pixel a little.
const near = (got, want, slack = 34) => got.every((v, c) => Math.abs(v - want[c]) <= slack);
// The track's yellow, the release's own.
const TRACK = rgb('#f1c62d');
// The film over the fight (renderLevel1OfficeFilmGrain): a 7.5% warm tint,
// then, where the vignette reaches, up to 30% dark brown between 180 and
// 720 px from (640, 398).
const filmed = (colour, x, y, vignette = true) => {
  const shade = vignette ? 0.3 * Math.min(1, Math.max(0, (Math.hypot(x - 640, y - 398) - 180) / 540)) : 0;
  return colour.map((v, c) => (v * 0.925 + [188, 104, 48][c] * 0.075) * (1 - shade) + [29, 8, 5][c] * shade);
};

async function fight(viewport, stage, freePlay, phone = true) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone});
  await stubScoreboard(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(new URL(`moth/staff/${phone ? '?device=phone' : ''}`, base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  await page.evaluate(stage => { bobbyGame.debugUnlockAllStages(); bobbyGame.startStage(stage, {freePlay: true, skipAudio: true}); }, stage);
  await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm && !bobbyGame.level1OfficeRhythm.graphicsLoading
    && !(bobbyGame.stageCountdown > 0) && bobbyGame.level1OfficeRhythm.tutorial?.mode === 'done', undefined, {timeout: 90000});
  await page.waitForTimeout(2500);
  // A story fight's hearts: started from stage select, then counted as story.
  await page.evaluate(freePlay => { bobbyGame.freePlay = freePlay; }, freePlay);
  return {context, page, errors};
}

// One frame, drawn now, with what it shows.
const frame = page => page.evaluate(() => {
  const g = bobbyGame, rhythm = g.level1OfficeRhythm;
  rhythm.health = 2; rhythm.maxHealth = 5; rhythm.combo = 12; rhythm.roundScore = 4500; rhythm.misses = 7; rhythm.hype = 0.55;
  g.render();
  g.renderTallScreen();
  const tall = g.portraitCanvas && document.body.dataset.tallScreen === '1' ? g.portraitCtx : null;
  const read = (context, x, y) => [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
  const count = (context, box, test) => {
    const data = context.getImageData(box.x, box.y, box.w, box.h).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (test(data[i], data[i + 1], data[i + 2])) n++;
    return n;
  };
  // Where this frame put the notes: the active cue's ring gives its clock.
  const ring = rhythm.renderTelemetry?.cueRing;
  const cue = g.getLevel1OfficeActiveCue();
  const clock = cue && ring ? cue.time - (ring.x - 760) / 140 : null;
  const notes = clock == null ? [] : g.getLevel1OfficeRenderNotes().filter(note => note.status === 'pending' && !note.holdEnd)
    .map(note => ({button: note.button, ahead: note.time - clock, x: 760 + (note.time - clock) * 140}));
  const wide = g.ctx;
  const out = {tall: Boolean(tall), notes, hearts: 0, hype: 0};
  if (tall) {
    // The row above the track, and the track's band under its legend.
    const row = {x: 8, y: 520, w: 704, h: 46};
    out.rowLeft = read(tall, 16, 543);
    out.rowPaper = read(tall, 360, 528);
    out.hearts = count(tall, row, (r, g, b) => Math.abs(r - 0xef) < 16 && Math.abs(g - 0x3f) < 20 && Math.abs(b - 0x78) < 20);
    out.hype = count(tall, row, (r, g, b) => (r === 0x3f && g === 0x6f && b === 0xb8) || (r === 0x9c && g === 0xcf && b === 0x6a));
    out.trackBand = [30, 150, 270, 390, 510, 630, 690].map(x => read(tall, x, 760));
    out.noteSamples = notes.map(note => ({...note, tallX: 8 + (note.x - 700) * 1.35,
      colour: read(tall, 8 + (note.x - 700) * 1.35 - 12, 572 + (616 - 540) * 1.35),
      centre: read(tall, 8 + (note.x - 700) * 1.35, 572 + (616 - 540) * 1.35 + 3)}));
  } else {
    out.trackBand = [300, 500, 900, 1150].map(x => ({x, y: 696, colour: read(wide, x, 696)}));
    out.lifeBox = read(wide, 30, 600);
  }
  return out;
});

// 1 and 2. The phone.
for (const run of [
  {name: 'story, level 1', stage: 'level1-stage1', freePlay: false, row: 'hearts'},
  {name: 'practice, level 4', stage: 'level4-stage1', freePlay: true, row: 'strip', band: '#3552a8'},
  {name: 'story, level 7', stage: 'level6-stage2', freePlay: false, row: 'hype'}
]) {
  const {context, page, errors} = await fight({width: 393, height: 852}, run.stage, run.freePlay);
  const shot = await frame(page);
  assert(shot.tall, `${run.name}: the tall view is drawn`);
  // Level 7 dims its track while the band sound-checks; it still spans the width.
  const trackColour = run.row === 'hype' ? shot.trackBand[0] : filmed(TRACK, 0, 0, false);
  for (const sample of shot.trackBand) assert(near(sample, trackColour, 16), `${run.name}: the track spans the width, its yellow even ${JSON.stringify(shot.trackBand)}`);
  if (run.row === 'strip') {
    assert(near(shot.rowPaper, [0xef, 0xe6, 0xcc], 12), `${run.name}: the staff ID strip's paper ${shot.rowPaper}`);
    assert(near(shot.rowLeft, rgb(run.band), 12), `${run.name}: the strip's band in the fight's colour ${shot.rowLeft}`);
    assert.equal(shot.hearts, 0, `${run.name}: no hearts in practice`);
  } else {
    assert(near(shot.rowLeft, [8, 9, 13], 12), `${run.name}: the dark row ${shot.rowLeft}`);
    if (run.row === 'hearts') assert(shot.hearts > 150, `${run.name}: hearts in the row (${shot.hearts} px)`);
    else assert(shot.hype > 100 && shot.hearts === 0, `${run.name}: the hype bar in the hearts' place (${shot.hype} px)`);
  }
  // Notes in the pad's colours, out to 3 s ahead where the frame drew them.
  const visible = shot.noteSamples.filter(note => note.tallX > 40 && note.tallX < 700);
  if (run.row !== 'hype') {
    assert(visible.length >= 2, `${run.name}: notes on the track ${JSON.stringify(shot.noteSamples)}`);
    for (const note of visible) {
      assert(near(note.colour, rgb(MOTH_NOTE_COLOURS[note.button]), 40), `${run.name}: ${note.button} note in its colour ${JSON.stringify(note)}`);
      if (note.button === 'T') assert(Math.max(...note.centre) < 90, `${run.name}: T's letter is dark ${JSON.stringify(note)}`);
    }
    const far = shot.noteSamples.find(note => note.ahead > 2.6 && note.ahead < 3.3);
    if (far) assert(far.tallX < 712 && near(far.colour, rgb(MOTH_NOTE_COLOURS[far.button]), 40), `${run.name}: a note ${far.ahead.toFixed(2)} s ahead is on the track ${JSON.stringify(far)}`);
  }
  assert.deepEqual(errors, []);
  console.log(`phone ${run.name} PASS`, JSON.stringify({row: shot.rowLeft, hearts: shot.hearts, hype: shot.hype, notes: visible.length, aheadOver2s: visible.filter(n => n.ahead > 2.3).length}));
  await context.close();
}

// 3. A computer.
{
  const {context, page, errors} = await fight({width: 1280, height: 800}, 'level1-stage1', false, false);
  const shot = await frame(page);
  assert(!shot.tall);
  // The frame keeps the film's vignette over its lower panel here.
  for (const {x, y, colour} of shot.trackBand) assert(near(colour, filmed(TRACK, x, y), 14), `desktop: the track's yellow at ${x}: ${colour}`);
  assert(near(shot.lifeBox, filmed([8, 9, 13], 30, 600), 8), `desktop: Dr. Beauty's box beside the track ${shot.lifeBox}`);
  assert.deepEqual(errors, []);
  console.log('desktop PASS', JSON.stringify(shot.trackBand.map(sample => sample.colour)));
  await context.close();
}
await browser.close();
