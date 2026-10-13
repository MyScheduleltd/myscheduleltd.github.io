// Phone-deck and audio-engine behaviour (Chrome):
//  1. the deck artwork from styles.css arrives through the game (all 19
//     --moth-art-* properties filled), not as direct stylesheet downloads,
//     with the M, T and H buttons in their track note colours;
//  2. iOS settling the bottom safe area after launch, without a resize,
//     re-lays out the deck exactly as a fresh load with that inset;
//  3. after an idle (a minute on a menu or paused, a hidden page, a dead
//     engine) the next key rebuilds the audio engines and music is heard;
//  4. the fights' hit sounds load even when the engine was rebuilt first,
//     and one that failed is fetched again.
// usage: node scripts/verify-moth-device.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox']});
const rows = page => page.evaluate(() => {
  const mid = s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r?.height ? Math.round(r.top + r.height / 2) : null; };
  return {pad: mid('[data-mobile-direction="left"]'), moth: mid('[data-mobile-action="btn-h"]'), space: mid('[data-mobile-action="jump"]')};
});

// 1 + 2. Phone deck.
{
  const context = await browser.newContext({viewport: {width: 393, height: 852}, deviceScaleFactor: 3, isMobile: true, hasTouch: true});
  await stubScoreboard(context);
  const page = await context.newPage();
  const stylesheetArt = [];
  page.on('request', r => { if (r.resourceType() === 'image' && /\/assets\//.test(r.url())) stylesheetArt.push(r.url()); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {insets: {bottom: 0}});
  await page.goto(new URL('moth/?device=phone', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => { const s = getComputedStyle(document.documentElement); for (let i = 0; i < 19; i++) if (!s.getPropertyValue('--moth-art-' + i).includes('blob:')) return false; return true; }, undefined, {timeout: 60000});
  assert.deepEqual(stylesheetArt.filter(url => /mobile_|film-grain/.test(url)), [], 'No deck artwork fetched by the stylesheet itself');
  // M, T and H wear their note colours; O and everything but the grey faces are untouched.
  const tint = await page.evaluate(async () => {
    const shown = getComputedStyle(document.querySelector('.mobile-moth__button')).backgroundImage.match(/url\("?([^")]+)/)[1];
    const read = async url => {
      const image = Object.assign(new Image(), {src: url});
      await image.decode();
      const canvas = Object.assign(document.createElement('canvas'), {width: image.width, height: image.height});
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height);
    };
    const [before, after] = await Promise.all([read('assets/ui/mobile_moth_buttons_20261002/sheet.webp'), read(shown)]);
    const columns = [0, 1, 2, 3].map(() => ({changed: 0, r: 0, g: 0, b: 0}));
    for (let i = 0; i < before.data.length; i += 4) {
      if (Math.abs(before.data[i] - after.data[i]) + Math.abs(before.data[i + 1] - after.data[i + 1]) + Math.abs(before.data[i + 2] - after.data[i + 2]) < 24) continue;
      const column = columns[Math.floor((i / 4 % before.width) * 4 / before.width)];
      column.changed++; column.r += after.data[i]; column.g += after.data[i + 1]; column.b += after.data[i + 2];
    }
    return {shown: shown.slice(0, 5), columns: columns.map(c => c.changed ? {changed: c.changed, rgb: [c.r, c.g, c.b].map(v => Math.round(v / c.changed))} : {changed: 0})};
  });
  const [m, o, t, h] = tint.columns;
  assert.equal(tint.shown, 'blob:', 'The deck shows the game-made sheet');
  assert.equal(o.changed, 0, 'O keeps its grey');
  assert(m.changed > 5000 && m.rgb[2] > m.rgb[0] + 60, 'M is blue ' + JSON.stringify(m));
  assert(t.changed > 5000 && t.rgb[0] > t.rgb[1] + 80 && t.rgb[2] > t.rgb[1], 'T is pink ' + JSON.stringify(t));
  assert(h.changed > 5000 && h.rgb[1] > h.rgb[0] + 50 && h.rgb[1] > h.rgb[2], 'H is green ' + JSON.stringify(h));
  console.log('tint PASS', JSON.stringify(tint.columns));
  await page.waitForTimeout(3000);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {insets: {bottom: 34}});
  await page.waitForTimeout(2500);
  const late = await rows(page);
  const fresh = await context.newPage();
  await (await context.newCDPSession(fresh)).send('Emulation.setSafeAreaInsetsOverride', {insets: {bottom: 34}});
  await fresh.goto(new URL('moth/?device=phone', base).href, {waitUntil: 'domcontentloaded'});
  await fresh.waitForTimeout(6000);
  assert.deepEqual(late, await rows(fresh), 'A late safe-area change lays the deck out as a fresh load does');
  assert.equal(late.pad, late.moth, 'H/O level with the arrows');
  console.log('deck PASS', JSON.stringify(late));
  await context.close();
}

// 3. Audio engine refresh after idling.
{
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await stubScoreboard(page);
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(new URL('moth/staff/?device=desktop', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  const heard = () => page.evaluate(async () => {
    const g = bobbyGame, track = g.getActiveLevel1OfficeRhythmAudio(), route = g.musicAudioRoutes.get(track);
    const a = route.context.createAnalyser(); a.fftSize = 2048; route.gain.connect(a);
    let peak = 0;
    for (let n = 0; n < 12; n++) { const s = new Float32Array(2048); a.getFloatTimeDomainData(s); for (const v of s) peak = Math.max(peak, Math.abs(v)); await new Promise(r => setTimeout(r, 80)); }
    route.gain.disconnect(a);
    return {peak, playing: !track.paused, running: route.context.state === 'running', refreshes: g.audioEngineRefreshes || 0};
  });
  const fight = async id => {
    await page.keyboard.press('Shift');
    await page.evaluate(id => { bobbyGame.returnToTitle(); bobbyGame.startStage(id); }, id);
    await page.waitForFunction(() => bobbyGame.state === 'playing' && !bobbyGame.levelLoadingPresentation, undefined, {timeout: 120000});
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(120); }
    await page.waitForTimeout(5000);
  };
  await fight('level1-stage1');
  await page.evaluate(() => { bobbyGame.returnToTitle(); bobbyGame.lastMusicAt = performance.now() - 61000; });
  await fight('level2-stage2');
  let r = await heard();
  assert(r.refreshes === 1 && r.peak > 0.01 && r.playing && r.running, 'Menu idle: rebuilt, music heard');
  await page.evaluate(() => { bobbyGame.pauseLevel1Office(); bobbyGame.lastMusicAt = performance.now() - 61000; });
  const at = await page.evaluate(() => bobbyGame.getActiveLevel1OfficeRhythmAudio().currentTime);
  await page.keyboard.press('Shift');
  await page.evaluate(() => bobbyGame.resumeLevel1Office());
  // 繼續 counts in (3 · 2 · 1) before the song plays on.
  await page.waitForFunction(() => !(bobbyGame.stageCountdown > 0) && !bobbyGame.getActiveLevel1OfficeRhythmAudio().paused, undefined, {timeout: 15000});
  await page.waitForTimeout(1000);
  r = await heard();
  assert(r.refreshes === 2 && r.peak > 0.01 && r.playing, 'Long pause: rebuilt, music heard');
  assert(await page.evaluate(at => { const t = bobbyGame.getActiveLevel1OfficeRhythmAudio().currentTime; return t > at && t < at + 5; }, at), 'Resumed from its position');
  await page.evaluate(() => { const g = bobbyGame, route = g.musicAudioRoutes.get(g.getActiveLevel1OfficeRhythmAudio()); route.gain.disconnect(); route.source.disconnect(); g.audioEngineStale = 'hidden'; });
  await page.keyboard.press('Shift');
  await page.waitForTimeout(2500);
  r = await heard();
  assert(r.refreshes === 3 && r.peak > 0.01 && r.playing && r.running, 'Dead engine after a hidden page: rebuilt, music heard');
  assert.deepEqual(errors, []);
  console.log('audio refresh PASS');
}

// 4. A minute on the title before any fight rebuilds the engine first; the
// fights still get every hit sound, and one that failed to download is
// fetched again by the next fight.
{
  const page = await browser.newPage({viewport: {width: 393, height: 852}});
  await stubScoreboard(page);
  // O's sound cannot be downloaded (even retried) until the first fight is under way.
  let failing = true;
  await page.route('**/assets/sfx/player-feedback/button-o.wav*', route => failing ? route.fulfill({status: 503, body: ''}) : route.fallback());
  await page.goto(new URL('moth/staff/?device=phone', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  await page.keyboard.press('Shift');
  await page.evaluate(() => { bobbyGame.lastMusicAt = performance.now() - 61000; });
  await page.keyboard.press('ArrowDown');
  const sounds = async id => {
    await page.evaluate(id => { bobbyGame.returnToTitle(); bobbyGame.startStage(id); }, id);
    await page.waitForFunction(() => bobbyGame.state === 'playing' && !bobbyGame.levelLoadingPresentation && !bobbyGame.level1OfficeRhythm?.graphicsLoading, undefined, {timeout: 120000});
    return page.evaluate(() => ({loaded: Object.keys(bobbyGame.sfxBuffers || {}).length, refreshes: bobbyGame.audioEngineRefreshes || 0,
      m: bobbyGame.playRhythmHitSfx('do', false, 'M'), o: bobbyGame.playRhythmHitSfx('do', false, 'O')}));
  };
  const first = await sounds('level4-stage1');
  assert(first.refreshes >= 1, 'The engine was rebuilt before the first fight');
  assert.deepEqual([first.loaded, first.m, first.o], [26, true, false], 'Every sound but the failed one ' + JSON.stringify(first));
  failing = false;
  const second = await sounds('level3-stage2');
  assert.deepEqual([second.loaded, second.o], [27, true], 'The failed sound is fetched again ' + JSON.stringify(second));
  console.log('hit sounds PASS', JSON.stringify({first, second}));
}
await browser.close();
console.log('PASS phone deck artwork, late safe-area layout, audio engine refresh, and hit sounds');
