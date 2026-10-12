// The final scoreboard end to end (Chrome): the game's requests to the
// scoreboard API are answered by the real function
// (services/moth-scoreboard/moth-scoreboard.js) over an in-memory Upstash.
// usage: node scripts/verify-moth-scoreboard.mjs http://127.0.0.1:5286/ [screenshot-dir]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {fakeUpstash} from '../services/moth-scoreboard/fake-upstash.mjs';
import {SCOREBOARD_API, STORY_FIGHTS} from './moth-scoreboard-client.mjs';

const require = createRequire(import.meta.url);
const handler = require('../services/moth-scoreboard/moth-scoreboard.js');
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const shots = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (shots) fs.mkdirSync(shots, {recursive: true});
const store = await fakeUpstash();
const env = {KV_REST_API_URL: store.url, KV_REST_API_TOKEN: 'test-token', VERCEL_ENV: 'preview'};
const maxima = handler.MAX_FIGHT_SCORE;
const runScores = (mode, scale) => Object.fromEntries(STORY_FIGHTS.map(id => [id, Math.floor(maxima[mode][id] * scale / 200) * 200]));

// Answer the page's API calls with the real function.
async function bridge(route) {
  const request = route.request();
  const url = new URL(request.url());
  const req = {method: request.method(), url: url.pathname + url.search, headers: {...request.headers(), 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 200)}, body: request.postData() || undefined};
  const res = {statusCode: 200, headers: {}, text: '', setHeader(k, v) { this.headers[k] = String(v); }, end(t) { this.text = t || ''; }};
  await handler(req, res, env);
  await route.fulfill({status: res.statusCode, headers: res.headers, body: res.text});
}
const seed = async (mode, count, scale) => {
  for (let i = 0; i < count; i++) {
    const req = {method: 'POST', url: '/api/moth-scoreboard', headers: {'x-forwarded-for': `11.0.${i}.1`}, body: {mode, id: 'P' + (i + 1), run: `seed-${mode}-${i}-xxxxxxxxxxxx`, scores: runScores(mode, scale - i * 0.03)}};
    const res = {setHeader() {}, end() {}};
    await handler(req, res, env);
  }
};

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox']});
for (const [label, viewport, device] of [['phone', {width: 390, height: 844}, 'phone'], ['desktop', {width: 1280, height: 800}, 'desktop']]) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2, hasTouch: device === 'phone', isMobile: device === 'phone', acceptDownloads: true});
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(base).origin});
  await context.route(SCOREBOARD_API + '*', bridge);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(new URL('moth/staff/?device=' + device, base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});

  // Menu: no DIFFICULTY, a SCOREBOARD after LYRICS.
  const ids = await page.evaluate(() => bobbyGame.getHomeMenuItems().map(item => item.id));
  assert(!ids.includes('difficulty'), 'DIFFICULTY removed from the main menu');
  assert.equal(ids[ids.indexOf('lyrics') + 1], 'scoreboard');

  // STORY MODE asks for the difficulty; the run keeps it.
  await page.evaluate(() => { bobbyGame.homeMenu.index = 0; });
  await page.keyboard.press('Enter');
  assert(await page.evaluate(() => bobbyGame.homeMenu.difficultyPick?.story === true), 'Difficulty card for the story');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => bobbyGame.progress?.storyRun?.difficulty === 'shoot' && bobbyGame.difficultyId === 'shoot', undefined, {timeout: 20000});

  // Cleared story fights record their scores (here, with the fight's result in place).
  const mode = 'shoot';
  const mine = runScores(mode, label === 'phone' ? 0.97 : 0.99);
  await page.evaluate(scores => { for (const [id, score] of Object.entries(scores)) { bobbyGame.level1OfficeRhythm = {roundScore: score}; bobbyGame.completeStage(id); } bobbyGame.level1OfficeRhythm = null; }, mine);
  assert.deepEqual(await page.evaluate(() => bobbyGame.progress.storyRun.scores), mine);

  // Others are already on the board (11 posted; the top 10 remain).
  if (label === 'phone') { await seed('shoot', 11, 0.9); await seed('chill', 4, 0.8); }

  // Before the credits: the board, the run's total, and its standing.
  await page.evaluate(() => bobbyGame.startFinaleEnding());
  await page.locator('.moth-board').waitFor();
  assert.notEqual(await page.evaluate(() => bobbyGame.state), 'finaleEnding', 'The credits wait for the board');
  await page.waitForFunction(() => !document.querySelector('.moth-board-list .state'), undefined, {timeout: 15000});
  assert.equal(await page.locator('.moth-board-list li').count(), 10, 'The top 10');
  const total = Object.values(mine).reduce((a, b) => a + b);
  assert.equal(await page.locator('.moth-board-run strong').innerText(), total.toLocaleString('en-US'));
  if (shots) await page.screenshot({path: path.join(shots, `${label}-final.png`)});

  // Post with an ID.
  await page.locator('.moth-board-post input').fill(label === 'phone' ? '美麗Boy' : 'DRBEAUTY');
  await page.locator('.moth-board-post button').click();
  await page.waitForFunction(() => bobbyGame.progress.storyRun.posted?.rank, undefined, {timeout: 15000});
  const rank = await page.evaluate(() => bobbyGame.progress.storyRun.posted.rank);
  assert.equal(await page.locator('.moth-board-list li.is-mine').count(), 1, 'Own entry highlighted');
  assert.equal(await page.locator('.moth-board-list li').count(), 10, 'Still 10: the 11th was removed');
  if (shots) await page.screenshot({path: path.join(shots, `${label}-posted.png`)});

  // Share card and link.
  await page.waitForFunction(() => bobbyGame.scoreboard?.cardFile?.size > 20000, undefined, {timeout: 10000});
  if (shots) fs.writeFileSync(path.join(shots, `${label}-card.png`), Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await bobbyGame.scoreboard.cardFile.arrayBuffer())))));
  const download = page.waitForEvent('download', {timeout: 5000}).catch(() => null);
  await page.locator('[data-focus-key="share"]').click();
  assert(await download || await page.evaluate(() => Boolean(navigator.canShare)), 'Card shared or downloaded');
  await page.locator('[data-focus-key="copy"]').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, new RegExp('第 ' + rank + ' 名|#' + rank));
  assert.match(copied, /myscheduleltd\.com\/moth\//);

  // Continue: the credits roll, and the board does not come back.
  await page.locator('[data-board-close]').click();
  await page.waitForFunction(() => bobbyGame.state === 'finaleEnding' && !document.querySelector('.moth-board'));
  await page.evaluate(() => bobbyGame.startFinaleEnding());
  assert.equal(await page.locator('.moth-board').count(), 0);

  // From the main menu: both boards, keyboard tabs and scrolling, Escape back.
  await page.evaluate(() => { bobbyGame.returnToTitle(); bobbyGame.resetHomeMenu?.('root'); });
  await page.evaluate(() => { bobbyGame.homeMenu.index = bobbyGame.getHomeMenuItems().findIndex(item => item.id === 'scoreboard'); });
  await page.keyboard.press('Enter');
  await page.locator('.moth-board').waitFor();
  await page.waitForFunction(() => !document.querySelector('.moth-board-list .state'), undefined, {timeout: 15000});
  assert.equal(await page.locator('.moth-board-tabs [aria-selected="true"]').innerText(), await page.evaluate(() => bobbyGame.scoreboardModeLabel('shoot')));
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.moth-board-tabs [aria-selected="true"]').innerText(), await page.evaluate(() => bobbyGame.scoreboardModeLabel('chill')));
  await page.keyboard.press('ArrowRight');
  const scrollable = await page.evaluate(() => { const list = document.querySelector('.moth-board-list'); return list.scrollHeight > list.clientHeight; });
  if (scrollable) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => document.querySelector('.moth-board-list').scrollTop > 0), 'The list scrolls');
  }
  if (shots) await page.screenshot({path: path.join(shots, `${label}-menu.png`)});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.moth-board').count(), 0);
  assert.equal(await page.evaluate(() => bobbyGame.state), 'title');
  assert.deepEqual(errors, []);
  console.log(label, 'PASS', JSON.stringify({rank, total, scrollable}));
  await context.close();
}
await browser.close();
store.server.close();
console.log('PASS scoreboard: story difficulty, recorded fights, board before credits, post, share, menu');
