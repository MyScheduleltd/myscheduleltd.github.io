// Fight songs and weak connections (Chrome):
//  1. a fight's song downloads whole before the fight: its loading screen waits
//     for it, and the song plays from the downloaded copy, not a stream;
//  2. a song that streams and runs dry mid-fight holds the fight under
//     載入中… (no note judged), and the fight goes on the moment it plays again.
// usage: node scripts/verify-moth-songs.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
const open = async () => {
  const context = await browser.newContext({viewport: {width: 393, height: 852}});
  await stubScoreboard(context);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(new URL('moth/staff/?device=phone', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  await page.keyboard.press('Shift');
  return {context, page, errors};
};
const song = page => page.evaluate(() => {
  const g = bobbyGame, t = g.getActiveLevel1OfficeRhythmAudio?.();
  return {state: g.state, loading: Boolean(g.levelLoadingPresentation), src: t?.getAttribute('src')?.slice(0, 5), playing: Boolean(t && !t.paused), time: t?.currentTime,
    stalled: g.isFightSongStalled(), judged: g.level1OfficeRhythm?.notes.filter(n => n.status !== 'pending').length};
});

// 1. Download first.
{
  const {context, page, errors} = await open();
  let released = 0;
  await page.route('**/fight-cuts/level4-arcade.m4a*', async route => { await new Promise(r => setTimeout(r, 4000)); released = Date.now(); await route.continue(); });
  const started = Date.now();
  await page.evaluate(() => bobbyGame.startStage('level4-stage1'));
  await page.waitForFunction(() => bobbyGame.levelLoadingPresentation, undefined, {timeout: 10000});
  const total = await page.evaluate(() => new Promise(resolve => { const t = setInterval(() => { const p = bobbyGame.sceneLoadProgress; if (p) { clearInterval(t); resolve(p.total); } }, 20); }));
  await page.waitForFunction(() => !bobbyGame.levelLoadingPresentation, undefined, {timeout: 60000});
  const loaded = Date.now();
  assert(released && loaded >= released, 'The loading screen waited for the song');
  await page.waitForFunction(() => { const t = bobbyGame.getActiveLevel1OfficeRhythmAudio(); return !t.paused && t.currentTime > 1; }, undefined, {timeout: 30000});
  const now = await song(page);
  assert.equal(now.src, 'blob:', 'The song plays from its downloaded copy');
  assert.deepEqual(errors, []);
  console.log('download first PASS', JSON.stringify({loadingSeconds: (loaded - started) / 1000, progressJobs: total, src: now.src}));
  await context.close();
}

// 2. A stream that runs dry mid-fight.
{
  const {context, page, errors} = await open();
  // The chapter's art first, at full speed; then no copies, and a trickle.
  // (Loading also hands the song, not yet played, its copy: put it back on the stream.)
  const stream = await page.evaluate(() => bobbyGame.level4ArcadeAudio.getAttribute('src'));
  await page.evaluate(() => bobbyGame.loadSceneAssets('level4-stage1'));
  await page.evaluate(stream => { const g = bobbyGame; g.songCopy = () => Promise.resolve(null); g.audioMirror = new Map(); g.level4ArcadeAudio.src = stream; }, stream);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: 14000, uploadThroughput: -1});
  await page.evaluate(() => bobbyGame.startStage('level4-stage1'));
  await page.waitForFunction(() => bobbyGame.state === 'playing' && !bobbyGame.levelLoadingPresentation && !(bobbyGame.stageCountdown > 0), undefined, {timeout: 60000});
  await page.waitForFunction(() => bobbyGame.isFightSongStalled() && performance.now() - bobbyGame.level1OfficeRhythm.stalledSince > 500, undefined, {timeout: 60000});
  const stalled = await song(page);
  assert.equal(stalled.src, 'asset', 'Streaming from this site');
  // While it waits, the next note's own button judges nothing (checked in one go,
  // as a trickle can let the song move on between two looks).
  const press = await page.evaluate(() => {
    const g = bobbyGame, r = g.level1OfficeRhythm;
    if (!g.isFightSongStalled()) return null;
    const note = r.notes.find(n => n.status === 'pending');
    const before = r.notes.map(n => n.status).join();
    g.handleLevel1OfficeRhythmPress('Key' + note.button, performance.now());
    return {same: r.notes.map(n => n.status).join() === before, button: note.button};
  });
  assert(press?.same, 'No note judged while the song waits ' + JSON.stringify(press));
  const held = await song(page);
  const shot = await page.screenshot({clip: {x: 0, y: 0, width: 393, height: 420}});
  if (process.argv[3]) (await import('node:fs')).writeFileSync(process.argv[3], shot);
  // The connection recovers: the fight goes on at once, no count.
  await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
  await page.waitForFunction(at => !bobbyGame.isFightSongStalled() && bobbyGame.getActiveLevel1OfficeRhythmAudio().currentTime > at + 1, held.time, {timeout: 60000});
  const after = await song(page);
  assert(!(await page.evaluate(() => bobbyGame.stageCountdown > 0)), 'No count after a stall');
  assert.deepEqual(errors, []);
  console.log('stall PASS', JSON.stringify({stalledAt: +stalled.time.toFixed(2), resumedTo: +after.time.toFixed(2)}));
  await context.close();
}
await browser.close();
console.log('PASS songs: download first, stall holds under 載入中… and goes on');
