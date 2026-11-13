// Local-only phone loading baseline (the owner, 2026-11-09): how many bytes
// and seconds a Threads-on-iPhone visitor spends before the sign-in page
// works, and before they are inside. Production build served by ps1-preview
// (4202) against the disposable ps1-api (8797). Desktop Chrome emulating a
// phone; not a real iPhone, and not Threads' own WebKit view.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const out = 'art/ps1-restyle-20261109/loading';
await mkdir(out, { recursive: true });
const THREADS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Barcelona 358.0.0.24.106 (iPhone16,2; iOS 18_1; zh_TW; zh-Hant; scale=3.00; 1290x2796; 663434569)';
const profiles = [
  { name: 'unthrottled' },
  { name: '4g-10mbps-80ms', network: { offline: false, latency: 80, downloadThroughput: 10e6 / 8, uploadThroughput: 3e6 / 8 } },
];
const results = [];
for (const profile of profiles) {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--enable-precise-memory-info'] });
  try {
    const context = await browser.newContext({ viewport: { width: 402, height: 874 }, userAgent: THREADS, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (profile.network) await cdp.send('Network.emulateNetworkConditions', profile.network);
    let bytes = 0, requests = 0;
    const byType = {};
    const urls = new Map();
    cdp.on('Network.responseReceived', (event) => urls.set(event.requestId, { url: event.response.url, type: event.type }));
    cdp.on('Network.loadingFinished', (event) => {
      bytes += event.encodedDataLength; requests += 1;
      const info = urls.get(event.requestId);
      const ext = (info?.url.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? info?.type ?? 'other').toLowerCase();
      byType[ext] = (byType[ext] ?? 0) + event.encodedDataLength;
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    const start = Date.now();
    await page.goto('http://localhost:4202/?era=ps2&island', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#gate-form', { timeout: 240_000 });
    const gate = { seconds: (Date.now() - start) / 1000, megabytes: bytes / 1e6, requests };
    // Let the gate's own background preloading run as a visitor reading it would.
    await page.waitForTimeout(8_000);
    const gateIdle = { megabytes: bytes / 1e6, requests };
    await page.fill('#festival-id', 'LoadCheck');
    const pressed = Date.now(), bytesAtPress = bytes;
    await page.locator('#gate-form button[type="submit"]').first().click();
    await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 600_000 });
    const entered = { secondsAfterEnter: (Date.now() - pressed) / 1000, megabytesAfterEnter: (bytes - bytesAtPress) / 1e6, totalMegabytes: bytes / 1e6, requests };
    await page.waitForTimeout(5_000);
    const heap = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
    const settled = { totalMegabytes: bytes / 1e6, requests, jsHeapMegabytes: heap };
    await page.screenshot({ path: `${out}/${profile.name}-inside.png` });
    results.push({ profile: profile.name, gate, gateIdle, entered, settled, byTypeMegabytes: Object.fromEntries(Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1e6).toFixed(2)])), errors });
    await context.close();
  } finally {
    await browser.close();
  }
}
await writeFile(`${out}/report.json`, JSON.stringify({ physicalDevice: false, note: 'Chrome phone emulation with a Threads user agent; local production build; cache disabled.', results }, null, 2));
console.log(JSON.stringify(results, null, 1));
