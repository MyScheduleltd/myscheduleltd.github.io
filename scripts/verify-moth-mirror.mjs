// Exercises the jsDelivr mirror before release: the local build is served as
// https://myscheduleltd.com (so the game enables its mirror) while jsDelivr is
// the real network. Then a throttled local server shows a slow, steady Pages
// download longer than the stall limit still completes.
// usage: node scripts/verify-moth-mirror.mjs [chrome|webkit]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const docs = path.resolve(import.meta.dirname, '../docs');
const out = path.resolve('.qa/moth/mirror');
fs.mkdirSync(out, {recursive: true});
const MIRROR = /^https:\/\/cdn\.jsdelivr\.net\/gh\/MyScheduleltd\/myscheduleltd\.github\.io@[0-9a-f]{40}\/docs\/moth\//;
const OFFICE = /level1_office|level1Office|level3_rhythm_ui/;
const local = pathname => {
  let p = decodeURIComponent(pathname);
  if (p.endsWith('/')) p += 'index.html';
  return path.join(docs, p);
};
const engine = process.argv[2] || 'chrome';
const browser = engine === 'webkit' ? await webkit.launch({headless: true})
  : await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox']});
const report = {};

async function livePage({tamper = false, mirrorDown = false} = {}) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  await context.route('https://myscheduleltd.com/**', route => {
    const file = local(new URL(route.request().url()).pathname);
    return fs.existsSync(file) ? route.fulfill({path: file}) : route.fulfill({status: 404, body: 'missing'});
  });
  if (tamper) await context.route(/cdn\.jsdelivr\.net.*foreground\.webp/, route => route.fulfill({status: 200, contentType: 'image/webp', body: Buffer.from('not the published file')}));
  if (mirrorDown) await context.route(/cdn\.jsdelivr\.net/, route => route.abort('connectionfailed'));
  const page = await context.newPage();
  const requests = [], errors = [], warnings = [], violations = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.exposeFunction('__qaViolation', directive => violations.push(directive));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.__qaViolation(`${event.effectiveDirective} ${event.blockedURI}`)));
  return {context, page, requests, errors, warnings, violations};
}

async function enterOffice(page) {
  const started = Date.now();
  await page.goto('https://myscheduleltd.com/moth/staff/?device=phone', {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => bobbyGame.loadError || (bobbyGame.state === 'playing' && !bobbyGame.level1OfficeRhythm?.graphicsLoading), undefined, {timeout: 120000});
  assert.equal(await page.evaluate(() => bobbyGame.loadError), '', 'Level 1 loads');
  return (Date.now() - started) / 1000;
}

// 1. Mirror on: office art and sound effects arrive from the pinned jsDelivr path.
{
  const {context, page, requests, errors, violations} = await livePage();
  const seconds = await enterOffice(page);
  await page.evaluate(() => bobbyGame.loadHitSfx());
  assert.equal(await page.evaluate(() => Object.keys(bobbyGame.sfxBuffers).length), 27, 'All sound effects decode');
  const media = requests.filter(url => /\.(webp|png|wav)(\?|$)/.test(url));
  const mirrored = media.filter(url => MIRROR.test(url));
  const fromSite = media.filter(url => url.startsWith('https://myscheduleltd.com/moth/assets/') && OFFICE.test(url));
  assert(mirrored.some(url => /foreground\.webp/.test(url)), 'Office background came from the mirror');
  assert(mirrored.filter(url => /\/sfx\//.test(url)).length >= 27, 'Sound effects came from the mirror');
  assert.deepEqual(fromSite, [], 'No office art fetched from Pages');
  assert(requests.some(url => url.startsWith('https://myscheduleltd.com/moth/asset-integrity.json')), 'Hashes read from this site');
  assert(!requests.some(url => /cdn\.jsdelivr\.net.*\.(js|json)(\?|$)/.test(url)), 'No code or configuration from the mirror');
  assert.deepEqual(violations, []);
  assert.deepEqual(errors, []);
  await page.screenshot({path: path.join(out, `${engine}-mirror-office.png`)});
  report.mirror = {seconds, mirrored: mirrored.length};
  console.log('mirror PASS', report.mirror);
  await context.close();
}

// 1b. Music: the first fight's track is fetched on the home screen, swapped in
// by the tap that primes it, and plays; a highlighted song starts at once.
{
  const {context, page, requests, errors} = await livePage();
  await page.goto('https://myscheduleltd.com/moth/staff/?device=desktop', {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  await page.waitForFunction(() => bobbyGame.audioMirror?.get(bobbyGame.stageTrackSource('level1-stage1'))?.url, undefined, {timeout: 20000});
  await page.keyboard.press('KeyP');
  await page.locator('[data-debug-fight="level1-stage1"]').click();
  // Chrome leaves the clicked debug button focused; a later Enter would press it again.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('KeyP');
  const fightStarted = Date.now();
  await page.waitForFunction(() => { const a = bobbyGame.fightCutAudio.office; return !a.paused && a.currentTime > 1; }, undefined, {timeout: 40000});
  const fight = await page.evaluate(() => ({src: bobbyGame.fightCutAudio.office.getAttribute('src').slice(0, 5), t: bobbyGame.fightCutAudio.office.currentTime}));
  assert.equal(fight.src, 'blob:', 'Fight music plays the verified mirror copy');
  assert(!requests.some(url => /myscheduleltd\.com\/moth\/assets\/audio\/fight-cuts\/level1-office/.test(url)), 'Fight music not streamed from Pages');
  // The playlist: highlight a song, give it a moment, then play it.
  await page.evaluate(() => { bobbyGame.returnToTitle(); bobbyGame.completeStage('level1-stage1'); bobbyGame.homeMenu.index = 3; });
  await page.keyboard.press('Enter');
  await page.evaluate(() => { bobbyGame.homeMenu.index = bobbyGame.getHomePlaylistSongDefs().findIndex(song => !song.locked); });
  const song = await page.evaluate(() => bobbyGame.getHomeMenuItems()[bobbyGame.homeMenu.index].audioSrc);
  await page.waitForFunction(src => bobbyGame.audioMirror?.get(src)?.url, song, {timeout: 20000});
  const pressed = Date.now();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => bobbyGame.songPreview?.audio.currentTime > 0.5, undefined, {timeout: 20000});
  const songStart = (Date.now() - pressed) / 1000;
  assert.equal(await page.evaluate(() => bobbyGame.songPreview.audio.getAttribute('src').slice(0, 5)), 'blob:', 'Song plays the verified mirror copy');
  assert(songStart < 5, `Song starts promptly (${songStart}s)`);
  assert.deepEqual(errors, []);
  report.music = {fightSeconds: (Date.now() - fightStarted) / 1000, songStartSeconds: songStart};
  console.log('music PASS', report.music);
  await context.close();
}

// 2. A mirror copy that fails its hash is discarded for this site's copy.
{
  const {context, page, requests, warnings, errors} = await livePage({tamper: true});
  report.tampered = {seconds: await enterOffice(page)};
  assert(requests.some(url => /^https:\/\/myscheduleltd\.com\/moth\/assets\/.*foreground\.webp/.test(url)), 'Fell back to Pages');
  assert(warnings.some(text => /hash mismatch/.test(text)));
  assert.deepEqual(errors, []);
  console.log('tampered mirror PASS', report.tampered);
  await context.close();
}

// 3. jsDelivr unreachable: everything still loads from this site.
{
  const {context, page, errors} = await livePage({mirrorDown: true});
  report.mirrorDown = {seconds: await enterOffice(page)};
  assert.deepEqual(errors, []);
  console.log('mirror down PASS', report.mirrorDown);
  await context.close();
}

// 4. Pages at 150 KB/s per file: the 6.8 MB background takes ~45 s, well past
// the 20 s stall limit, and must still complete.
{
  const server = http.createServer((request, response) => {
    const file = local(new URL(request.url, 'http://x').pathname);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
    const data = fs.readFileSync(file);
    const type = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.wav': 'audio/wav', '.m4a': 'audio/mp4'}[path.extname(file)] || 'application/octet-stream';
    response.writeHead(200, {'content-type': type, 'content-length': data.length});
    if (!request.url.startsWith('/moth/assets/')) return response.end(data);
    let at = 0;
    const timer = setInterval(() => {
      response.write(data.subarray(at, at += 15000));
      if (at >= data.length) { clearInterval(timer); response.end(); }
    }, 100);
    request.on('close', () => clearInterval(timer));
  });
  await new Promise(resolve => server.listen(5291, '127.0.0.1', resolve));
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const started = Date.now();
  await page.goto('http://127.0.0.1:5291/moth/staff/?device=phone', {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 60000});
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => bobbyGame.loadError || (bobbyGame.state === 'playing' && !bobbyGame.level1OfficeRhythm?.graphicsLoading), undefined, {timeout: 240000});
  assert.equal(await page.evaluate(() => bobbyGame.loadError), '', 'Slow steady downloads are not abandoned');
  report.slowPages = {seconds: (Date.now() - started) / 1000};
  assert(report.slowPages.seconds > 25, 'The run really exceeded the stall limit');
  assert.deepEqual(errors, []);
  console.log('slow Pages PASS', report.slowPages);
  await context.close();
  server.close();
}

fs.writeFileSync(path.join(out, `${engine}-report.json`), JSON.stringify(report, null, 2) + '\n');
await browser.close();
console.log(engine, 'PASS mirror, hash fallback, mirror outage, and slow steady downloads');
