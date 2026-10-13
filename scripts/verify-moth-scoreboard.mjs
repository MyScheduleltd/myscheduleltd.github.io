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
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

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
const api = async (body, ip) => {
  const res = {statusCode: 0, text: '', setHeader() {}, end(t) { this.text = t || ''; }};
  await handler({method: 'POST', url: '/api/moth-scoreboard', headers: {'x-forwarded-for': ip}, body}, res, env);
  return {status: res.statusCode, json: JSON.parse(res.text)};
};
// A ticket as if its story had started 15 minutes ago.
const age = run => {
  const key = 'moth:ticket:' + run;
  store.data.set(key, JSON.stringify({...JSON.parse(store.data.get(key)), at: Date.now() - 15 * 60000}));
};
const seed = async (mode, count, scale) => {
  for (let i = 0; i < count; i++) {
    const {json: {run}} = await api({action: 'start', mode}, `11.0.${i}.1`);
    age(run);
    const posted = await api({mode, id: 'P' + (i + 1), run, scores: runScores(mode, scale - i * 0.03)}, `11.0.${i}.1`);
    assert(posted.status === 201 || posted.json.error === 'not-top', JSON.stringify(posted.json));
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
  // The server issued the run's ticket; the songs take ~14 minutes, so age it.
  const ticket = await page.waitForFunction(() => bobbyGame.progress.storyRun.ticket, undefined, {timeout: 15000}).then(handle => handle.jsonValue());
  assert.equal(JSON.parse(store.data.get('moth:ticket:' + ticket)).mode, 'shoot');
  age(ticket);

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

  // A run that never reached the server for its ticket can't be posted, and says why.
  await page.evaluate(scores => { bobbyGame.progress.storyRun = {id: 'offline-run', difficulty: 'chill', scores, startedAt: Date.now(), ticket: null}; bobbyGame.startFinaleEnding(); }, runScores('chill', 0.5));
  await page.locator('.moth-board').waitFor();
  assert.match(await page.locator('.moth-board-run p').innerText(), /could not reach the scoreboard|開始時沒有連上排行榜/);
  assert.equal(await page.locator('.moth-board-post input').count(), 0, 'No ID entry for an unverified run');
  await page.locator('[data-board-close]').click();
  await page.waitForFunction(() => bobbyGame.state === 'finaleEnding');
  assert.deepEqual(errors, []);
  console.log(label, 'PASS', JSON.stringify({rank, total, scrollable}));
  await context.close();
}
// The server's limits are the charts' own maxima: 1000 per note plus 1000
// per completed hold, for every story fight on both difficulties.
{
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await stubScoreboard(page);
  await page.goto(new URL('moth/staff/?device=desktop', base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  for (const mode of ['chill', 'shoot']) for (const id of STORY_FIGHTS) {
    await page.evaluate(([id, mode]) => { bobbyGame.returnToTitle(); bobbyGame.setDifficulty(mode, {persist: false, announce: false}); bobbyGame.startStage(id, {skipAudio: true}); }, [id, mode]);
    await page.waitForFunction(() => bobbyGame.state === 'playing' && bobbyGame.level1OfficeRhythm?.notes?.length && !bobbyGame.levelLoadingPresentation, undefined, {timeout: 120000});
    const most = await page.evaluate(() => { const notes = bobbyGame.level1OfficeRhythm.notes.filter(n => !n.practice); return (notes.length + notes.filter(n => n.holdEnd).length) * 1000; });
    assert.equal(maxima[mode][id], most, `Server limit for ${id} on ${mode}`);
  }
  console.log('limits PASS: the server allows exactly each chart\'s maximum');
  await page.close();
}
await browser.close();
store.server.close();
console.log('PASS scoreboard: story difficulty, recorded fights, board before credits, post, share, menu, server limits');
