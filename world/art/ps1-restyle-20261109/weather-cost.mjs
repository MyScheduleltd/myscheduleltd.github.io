// Frame rate with snow and rain against clear weather, in the isometric view
// (the owner, 2026-11-13: weather on every surface, filling the window). On
// the production build (4202); the phone's CPU slowed four times as in the
// other speed checks. Weather is set in this page only.
//   node art/ps1-restyle-20261109/weather-cost.mjs
import { createRequire } from 'node:module';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83';
for (const device of [
  { name: 'phone', options: { viewport: { width: 402, height: 874 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  { name: 'desktop', options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
]) {
  const context = await browser.newContext(device.options);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${process.env.PORT ?? 4202}/?era=ps2&island`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gate-form', { timeout: 240_000 });
  await page.fill('#festival-id', `Cost${device.name}${Date.now() % 1000}`);
  await page.locator('#gate-form button[data-audio="muted"]').click();
  await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
  await page.evaluate(() => { const w = window.__islandWorld; w.setWeather = () => {}; w.setCameraMode('isometric'); w.cameraZoom = 1.6; const x = 6, z = 4; w.player.position.set(x, w.groundHeightAt(x, z, 0), z); });
  const rows = [];
  for (const type of ['clear', 'snow', 'rain']) {
    await page.evaluate(kind => { const w = window.__islandWorld, now = Date.now();
      w.weather.setShared({ version: 1, updatedAt: now, schedule: kind === 'clear' ? [] : [{ id: 'cost-' + kind, type: kind, startsAt: now - 30 * 60_000, endsAt: now + 60 * 60_000 }], clearedSeats: [] }, now); }, type);
    await page.waitForTimeout(9_000);
    if (device.name === 'phone') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const frames = await page.evaluate(() => new Promise(resolve => { const t = []; const f = now => { t.push(now); if (now - t[0] < 6000) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); const q = p => +d[Math.floor(p * (d.length - 1))].toFixed(1); resolve({ fps: +(1000 * d.length / (t.at(-1) - t[0])).toFixed(1), p50: q(.5), p90: q(.9), p99: q(.99) }); } }; requestAnimationFrame(f); }));
    if (device.name === 'phone') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const perf = await page.evaluate(() => { const s = window.__islandWorld.performanceSnapshot(), w = window.__islandWorld.weather.snapshot(); return { drawCalls: s.drawCalls, triangles: s.triangles, flakes: w.isometric }; });
    rows.push({ type, ...frames, ...perf });
  }
  for (const row of rows) console.log(device.name.padEnd(8), JSON.stringify(row));
  if (errors.length) console.log('errors:', errors.join(' | '));
  await context.close();
}
await browser.close();
