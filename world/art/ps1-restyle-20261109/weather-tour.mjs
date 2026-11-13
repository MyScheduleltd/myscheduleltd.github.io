// Snow (or rain) at full depth, the isometric camera, and a capture at each
// venue (the owner, 2026-11-13: weather must reach the new buildings and fill
// the isometric window). Weather is set in this page only, never on the service.
//   node art/ps1-restyle-20261109/weather-tour.mjs <label> [snow|rain] [zoom] [desktop|phone]
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [label = 'now', type = 'snow', zoom = '1', device = 'desktop'] = process.argv.slice(2);
const out = `art/ps1-restyle-20261109/weather/${label}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const context = await browser.newContext(device === 'phone'
  ? { viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
await page.goto('http://localhost:4201/?era=ps2&island&cycleMinute=12', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gate-form', { timeout: 120_000 });
await page.fill('#festival-id', `Tour${Date.now() % 1000}`);
await page.locator('#gate-form button[data-audio="muted"]').click();
await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
await page.waitForTimeout(2_000);
await page.evaluate(([kind, z]) => {
  const world = window.__islandWorld, now = Date.now();
  world.setWeather = () => {};
  world.weather.setShared({ version: 1, updatedAt: now, schedule: [{ id: 'tour', type: kind, startsAt: now - 30 * 60_000, endsAt: now + 60 * 60_000 }], clearedSeats: [] }, now);
  world.setCameraMode('isometric');
  world.cameraZoom = Number(z);
}, [type, zoom]);
// Outdoor spots beside each place, so roofs and the props on them are in view.
const SPOTS = { gate: [0, 52], ferry: [6, 82], square: [6, 4], arcade: [16, 6], palace: [-28, -22], 'drive-in': [12, -24], shore: [56, -40], club: [-12, 30], rooftop: [30, 6], temple: [70, -18] };
for (const [spot, [x, z]] of Object.entries(SPOTS)) {
  await page.evaluate(([px, pz, zm]) => {
    const world = window.__islandWorld;
    world.player.position.set(px, world.groundHeightAt(px, pz, 0), pz);
    world.airborne = false; world.verticalVelocity = 0;
    world.setCameraMode('isometric'); world.cameraZoom = Number(zm);
  }, [x, z, zoom]);
  await page.waitForTimeout(5_000);
  await page.screenshot({ path: `${out}/${device}-${type}-${spot}.png` });
}
const snapshot = await page.evaluate(() => window.__islandWorld.weather.snapshot());
console.log(label, type, `zoom ${zoom}`, JSON.stringify({ isometric: snapshot.isometric, snow: +snapshot.snow.toFixed(2), rain: +snapshot.rain.toFixed(2), settled: +snapshot.settledDepth.toFixed(3) }), errors.length ? `errors: ${errors.join(' | ')}` : '');
await browser.close();
