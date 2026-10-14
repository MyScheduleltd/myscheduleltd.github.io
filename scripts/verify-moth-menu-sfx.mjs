// Menu sounds (moth-menu-sfx.mjs), Chrome, phone layout: each input below
// must play exactly the sounds listed — the tick for a selection that moves
// (and the playlist player), the click for a confirm, a back, a new screen or
// the next dialogue line — and walking and fight inputs none.
// usage: node scripts/verify-moth-menu-sfx.mjs http://127.0.0.1:5286/
import assert from 'node:assert/strict';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
const context = await browser.newContext({viewport: {width: 393, height: 852}});
await stubScoreboard(context);
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(new URL('moth/staff/?device=phone', base).href, {waitUntil: 'domcontentloaded'});
await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});

// Ready before any input: read straight into sound buffers.
await page.waitForFunction(() => bobbyGame.sfxBuffers?.['menu-tick'] && bobbyGame.sfxBuffers?.['menu-click'], undefined, {timeout: 20000});
const buffers = await page.evaluate(() => Object.fromEntries(['menu-tick', 'menu-click'].map(name => {
  const b = bobbyGame.sfxBuffers[name]; return [name, {rate: b.sampleRate, seconds: +b.duration.toFixed(3), peak: +Math.max(...b.getChannelData(0).map(Math.abs)).toFixed(3)}];
})));
assert.equal(buffers['menu-tick'].rate, 44100);
assert(Math.abs(buffers['menu-tick'].seconds - 0.134) < 0.002 && Math.abs(buffers['menu-click'].seconds - 0.101) < 0.002, JSON.stringify(buffers));
assert(buffers['menu-tick'].peak > 0.85 && buffers['menu-click'].peak > 0.85, 'Both at full level ' + JSON.stringify(buffers));

const played = () => page.evaluate(() => (bobbyGame.feedbackAudioHistory || []).filter(e => e.channel === 'menu').map(e => e.name.replace('menu-', '')));
const results = [];
async function expectSounds(label, act, expected) {
  const before = (await played()).length;
  await act();
  await page.waitForTimeout(120);
  const heard = (await played()).slice(before);
  assert.deepEqual(heard, expected, `${label}: heard ${JSON.stringify(heard)}`);
  results.push(`${label}: ${expected.join('+') || 'silent'}`);
}
const key = code => () => page.keyboard.press(code);
const deck = action => () => page.evaluate(action => { bobbyGame.handleMobileControlDown(action, performance.now()); bobbyGame.handleMobileControlUp(action, performance.now()); }, action);
const select = id => page.evaluate(id => { const g = bobbyGame; g.homeMenu.index = g.getHomeMenuItems().findIndex(item => item.id === id); }, id);
const view = () => page.evaluate(() => bobbyGame.homeMenu?.view);

// The title menu.
await expectSounds('title ↓', key('ArrowDown'), ['tick']);
await expectSounds('title ↑', key('ArrowUp'), ['tick']);
await expectSounds('deck ↓', deck('nav-down'), ['tick']);
await select('stageSelect');
await expectSounds('open stage select (O)', key('KeyO'), ['click']);
assert.equal(await view(), 'stageSelect');
await expectSounds('stage list ↓', key('ArrowDown'), ['tick']);
await expectSounds('pick a stage (Enter)', key('Enter'), ['click']);
assert(await page.evaluate(() => Boolean(bobbyGame.homeMenu.difficultyPick)), 'Difficulty card open');
await expectSounds('difficulty → (摸魚/拍片)', key('ArrowRight'), ['tick']);
await expectSounds('difficulty ← ', key('ArrowLeft'), ['tick']);
await expectSounds('close the card (H)', key('KeyH'), ['click']);
await expectSounds('back to the title (deck H)', deck('back'), ['click']);
assert.equal(await view(), 'root');
// Settings toggles: an arrow ticks, a confirm clicks.
await select('language');
await expectSounds('language → (toggle)', key('ArrowRight'), ['tick']);
await expectSounds('language O (toggle)', key('KeyO'), ['click']);
// The playlist player's buttons tick (its songs open once the story is
// cleared; here every stage counts as cleared).
await page.evaluate(() => { bobbyGame.isStageCompleted = () => true; });
await select('playlist');
await expectSounds('open the playlist', key('Enter'), ['click']);
await page.evaluate(() => { const g = bobbyGame; g.homeMenu.index = g.getHomeMenuItems().findIndex(song => !song.locked); });
await expectSounds('open a song', key('Enter'), ['click']);
assert.equal(await view(), 'playlistPlayer');
const song = await page.evaluate(() => bobbyGame.homeMenu.playerSongId);
await expectSounds('player: next song (deck ↓)', deck('nav-down'), ['tick']);
assert.notEqual(await page.evaluate(() => bobbyGame.homeMenu.playerSongId), song, 'The next song is on');
await expectSounds('player: play/pause (O)', key('KeyO'), ['tick']);
await expectSounds('player: back (H)', key('KeyH'), ['click']);
await expectSounds('playlist: back (H)', key('KeyH'), ['click']);
assert.equal(await view(), 'root');
// The scoreboard plays its own: open clicks, a tab ticks, close clicks once.
await select('scoreboard');
await expectSounds('open the scoreboard', key('Enter'), ['click']);
await page.waitForFunction(() => bobbyGame.scoreboard?.root?.isConnected);
await expectSounds('scoreboard tab →', key('ArrowRight'), ['tick']);
await expectSounds('scoreboard tab → again (no change)', key('ArrowRight'), []);
await expectSounds('close the scoreboard (Esc)', key('Escape'), ['click']);
// A walking scene: moving is silent; each line of a talk clicks.
await page.evaluate(() => bobbyGame.enterLevel3Stage1());
await page.waitForFunction(() => bobbyGame.state === 'level3' && !bobbyGame.levelLoadingPresentation, undefined, {timeout: 90000});
await page.waitForTimeout(500);
await expectSounds('walking →', async () => { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight'); }, []);
await page.evaluate(() => bobbyGame.startLevel3Dialogue('level3PreBoss'));
await expectSounds('next line (O)', key('KeyO'), ['click']);
await expectSounds('next line (deck O)', deck('advance'), ['click']);
// A fight: the buttons play their own sounds, never the menu's.
await page.evaluate(() => { const g = bobbyGame; for (let i = 0; i < 40 && g.state === 'level3Dialogue'; i++) g.advanceLevel3Dialogue(); });
await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm && !(bobbyGame.stageCountdown > 0), undefined, {timeout: 60000});
await page.waitForTimeout(1500);
await expectSounds('fight M O T H', async () => { for (const code of ['KeyM', 'KeyO', 'KeyT', 'KeyH']) { await page.keyboard.press(code); await page.waitForTimeout(150); } }, []);
// Its pause menu.
await expectSounds('pause (Esc)', key('Escape'), ['click']);
assert.equal(await page.evaluate(() => bobbyGame.state), 'level1OfficePaused');
await expectSounds('pause menu ↓', key('ArrowDown'), ['tick']);
await expectSounds('pause menu ↑', key('ArrowUp'), ['tick']);
await expectSounds('resume (H)', key('KeyH'), ['click']);
assert.equal(await page.evaluate(() => bobbyGame.state), 'playing');
assert.match(await page.evaluate(() => bobbyGame.getSfxTestLabel()), /· 27\/27/, '音效測試 counts the fights\' sounds');
assert.deepEqual(errors, []);
console.log(results.join('\n'));
console.log('PASS menu sounds:', results.length, 'inputs');
await browser.close();
