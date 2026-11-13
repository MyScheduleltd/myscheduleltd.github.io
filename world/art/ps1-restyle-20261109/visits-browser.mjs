// Local-only check of the anonymous visit tallies: a Threads-on-iPhone visitor
// opens the sign-in page, enters the island and leaves; then STAFF's VISITS
// block is drawn from the local API's real summary with production CSS.
// Needs the ps1-api (8797) and ps1-client (4201) launch configs running.
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const out = 'art/ps1-restyle-20261109/visits';
await mkdir(out, { recursive: true });
const API = 'http://127.0.0.1:8797';
const STAFF_KEY = process.env.PS1_STAFF_KEY;
assert.ok(STAFF_KEY, 'PS1_STAFF_KEY must be set to the local review key');
const summary = async (days = 2) => (await fetch(`${API}/api/admin/visits?days=${days}`, { headers: { 'x-festival-admin-key': STAFF_KEY } })).json();
const THREADS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Barcelona 358.0.0.24.106 (iPhone16,2; iOS 18_1; zh_TW; zh-Hant; scale=3.00; 1290x2796; 663434569)';

const report = { physicalDevice: false, steps: [] };
const before = (await summary()).days[0];
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--enable-gpu'] });
try {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, userAgent: THREADS, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  // A beacon's body is not visible to Playwright; record what the page hands it.
  await page.addInitScript(() => {
    window.__visits = [];
    const send = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (String(url).endsWith('/api/visit') && data instanceof Blob) data.text().then((text) => window.__visits.push(JSON.parse(text)));
      return send(url, data);
    };
  });
  await page.goto('http://localhost:4201/?era=ps2&island', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gate-form', { timeout: 60_000 });
  await page.fill('#festival-id', 'VisitCheck');
  const started = Date.now();
  await page.locator('#gate-form button[type="submit"]').first().click();
  await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 240_000 });
  report.steps.push({ step: 'entered', seconds: Math.round((Date.now() - started) / 1000) });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: join(out, 'threads-iphone-inside.png') });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  const visits = await page.evaluate(() => window.__visits);
  report.sent = visits.map(({ v, ...rest }) => ({ ...rest, token: v ? 'random' : 'none' }));
  assert.deepEqual(visits.map((visit) => visit.e), ['open', 'start', 'entered', 'leave']);
  assert.ok(visits.every((visit) => visit.b === 'threads' && visit.d === 'phone'));
  assert.equal(visits[0].s, 'threads', 'no referrer inside Threads is credited to Threads');
  assert.equal(visits[3].p, 'world');
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}
await new Promise((resolve) => setTimeout(resolve, 300));
const after = await summary();
const today = after.days[0];
assert.equal(today.opened - before.opened, 1);
assert.equal(today.browsers.threads.entered - before.browsers.threads.entered, 1);
assert.equal(today.left.world - before.left.world, 1);
report.summaryToday = { opened: today.opened, started: today.started, entered: today.entered, threads: today.browsers.threads, left: today.left };

// STAFF's block, isolated with production CSS, from the real summary above.
const bundle = await build({ entryPoints: ['src/ui/VisitStaff.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'VisitReview', write: false });
const css = (await readFile('src/style.css', 'utf8')).replace(/^@import[^\n]*\n/gm, '');
const shotBrowser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  for (const [name, viewport] of [['desktop', { width: 1100, height: 1400 }], ['phone', { width: 390, height: 1600 }]]) {
    for (const zh of [true, false]) {
      const page = await shotBrowser.newPage({ viewport });
      await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><section class="panel" style="position:static;display:block;max-width:none;max-height:none;overflow:visible"><div class="admin-panel"><details class="staff-section" open><summary><span>VISITS</span></summary><div class="staff-section__body" id="body"></div></details></div></section>');
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(({ data, zh }) => { document.querySelector('#body').innerHTML = VisitReview.visitStaffContent(data, zh, { loading: false, error: '' }); }, { data: after, zh });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${name} has no sideways page scroll (${overflow}px)`);
      await page.screenshot({ path: join(out, `staff-visits-${name}-${zh ? 'zh' : 'en'}.png`), fullPage: true });
      await page.close();
    }
  }
} finally {
  await shotBrowser.close();
}
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
