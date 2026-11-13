// Does anything still download once a visitor is inside? (The owner,
// 2026-11-13: "make sure all assets load at the sign in loading page, so
// loading doesn't interrupt the game play experience.") On the production
// build served by ps1-preview (4202) against the local service, desktop and
// phone: records every response after ENTER while travelling to each venue
// through 地圖 and opening every 通行證 page. The service's own API calls and
// YouTube's players (films stream by nature) are listed apart.
//   node art/ps1-restyle-20261109/late-loads.mjs
import { createRequire } from 'node:module';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const PANELS = ['quests', 'map', 'programme', 'jukebox', 'chat', 'attendees', 'pamphlet', 'character', 'sound', 'graphics', 'controls', 'contact'];
const VENUES = ['gate', 'square', 'palace', 'drive-in', 'shore', 'club', 'rooftop', 'temple'];
let failed = false;
for (const device of [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  let inside = false;
  const late = [];
  const urls = new Map();
  cdp.on('Network.responseReceived', e => urls.set(e.requestId, e.response.url));
  cdp.on('Network.loadingFinished', e => { if (inside) late.push({ url: urls.get(e.requestId) ?? '?', bytes: e.encodedDataLength }); });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error).slice(0, 160)));
  await page.goto('http://localhost:4202/?era=ps2&island', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gate-form', { timeout: 120_000 });
  await page.fill('#festival-id', `Late${device.name}`);
  await page.locator('#gate-form button[data-audio="muted"]').click();
  await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
  inside = true;
  await page.waitForTimeout(3_000);
  const openPanel = async id => {
    await page.locator('#pass-toggle').click();
    await page.waitForTimeout(250);
    await page.locator(`#festival-pass [data-panel="${id}"]`).click();
    await page.waitForTimeout(700);
  };
  for (const venue of VENUES) {
    await openPanel('map');
    await page.locator(`[data-travel="${venue}"]`).first().click().catch(() => undefined);
    await page.waitForTimeout(2_500);
  }
  for (const id of PANELS) {
    await openPanel(id);
    await page.locator('#panel-close').click().catch(() => undefined);
    await page.waitForTimeout(300);
  }
  const kind = url => /\/api\//.test(url) ? 'service' : /youtube|ytimg|googlevideo|doubleclick|ggpht/.test(url) ? 'youtube' : url.startsWith('blob:') || url.startsWith('data:') ? 'local' : 'asset';
  const assets = late.filter(entry => kind(entry.url) === 'asset');
  const sum = list => (list.reduce((total, entry) => total + entry.bytes, 0) / 1024).toFixed(0);
  console.log(`${device.name}: after ENTER — assets ${assets.length} (${sum(assets)} KB), service ${late.filter(e => kind(e.url) === 'service').length}, youtube ${late.filter(e => kind(e.url) === 'youtube').length} (${sum(late.filter(e => kind(e.url) === 'youtube'))} KB)`);
  for (const entry of assets) console.log(`   LATE ${(entry.bytes / 1024).toFixed(0).padStart(6)} KB ${entry.url}`);
  if (errors.length) console.log('   errors:', errors.join(' | '));
  if (assets.length || errors.length) failed = true;
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
