// The beach chairs and mats under umbrellas offer to wipe their snow again,
// and the action prompt sits clear of the key tips (the owner, 2026-11-13).
// Dev server (4201); snow is set in this page only.
//   node art/ps1-restyle-20261109/beach-snow-check.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const out = 'art/ps1-restyle-20261109/weather/beach';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const checks = [];
const check = (name, ok, detail = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`); };
for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  const page = await (await browser.newContext({ viewport })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  await page.goto('http://localhost:4201/?era=ps2&island&cycleMinute=20', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gate-form', { timeout: 120_000 });
  await page.fill('#festival-id', `Beach${viewport.width}${Date.now() % 1000}`);
  await page.locator('#gate-form button[data-audio="muted"]').click();
  await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
  await page.evaluate(() => { const w = window.__islandWorld, now = Date.now(); w.setWeather = () => {};
    w.weather.setShared({ version: 1, updatedAt: now, schedule: [{ id: 'beach-snow', type: 'snow', startsAt: now - 30 * 60_000, endsAt: now + 60 * 60_000 }], clearedSeats: [] }, now); });
  await page.waitForTimeout(1_500);
  const label = `${viewport.width}×${viewport.height}`;
  const spots = await page.evaluate(() => { const w = window.__islandWorld; return (w.beachRelaxation?.spots ?? []).map(s => ({ id: s.id, brush: w.canBrushSnowSeat(s.id), snow: +w.weather.seatCoverage(s.id).toFixed(2), exit: s.exitPoints[0]?.toArray() })); });
  check(`${label}: every beach chair and mat can be wiped`, spots.length === 8 && spots.every(s => s.brush && s.snow > .03), spots.map(s => `${s.id}:${s.brush ? 'wipe' : 'no'}:${s.snow}`).join(' '));
  for (const spot of spots.filter(s => ['BEACH-CHAIR-1', 'BEACH-MAT-2'].includes(s.id))) {
    await page.evaluate(([x, , z]) => { const w = window.__islandWorld; w.setCameraMode('follow'); w.player.position.set(x, w.groundHeightAt(x, z, 0), z); w.airborne = false; }, spot.exit);
    await page.waitForTimeout(1_200);
    // The prompt and the key tips, as laid out on screen.
    const layout = await page.evaluate(() => {
      const box = selector => { const node = document.querySelector(selector); if (!node || node.hidden || getComputedStyle(node).display === 'none') return null; const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: node.textContent.trim().slice(0, 40) }; };
      return { toast: box('.interaction-toast'), hint: box('.controls-hint') };
    });
    const clear = layout.toast && layout.hint && layout.toast.bottom <= layout.hint.top - 6;
    check(`${label} ${spot.id}: the prompt sits above the key tips`, Boolean(clear), layout.toast ? `prompt ${layout.toast.text} bottom ${layout.toast.bottom.toFixed(0)}, tips top ${layout.hint?.top.toFixed(0)}` : 'no prompt');
    if (viewport.width === 1440) await page.screenshot({ path: `${out}/${spot.id}-prompt.png` });
    await page.keyboard.press('e');
    const choice = await page.waitForSelector('.snow-seat-choice', { timeout: 4_000 }).then(() => true, () => false);
    const words = choice ? await page.evaluate(() => document.querySelector('.snow-seat-choice').textContent.replace(/\s+/g, ' ').trim().slice(0, 80)) : '';
    check(`${label} ${spot.id}: E offers to wipe the snow first`, choice, words);
    if (viewport.width === 1440 && choice) await page.screenshot({ path: `${out}/${spot.id}-choice.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await page.context().close();
}
await browser.close();
console.log(`${checks.filter(Boolean).length}/${checks.length}`);
process.exit(checks.every(Boolean) ? 0 : 1);
