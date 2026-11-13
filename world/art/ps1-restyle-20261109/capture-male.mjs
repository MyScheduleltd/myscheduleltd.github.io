// Side-by-side check of the male avatar (the owner, 2026-11-12: "lighter
// models, same look", compared before anything ships). Captures the sign-in
// page's character preview and the first view inside the world, on desktop
// and a phone, from the dev server (ps1-client, 4201).
//   node art/ps1-restyle-20261109/capture-male.mjs <label>
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const label = process.argv[2] ?? 'current';
const out = 'art/ps1-restyle-20261109/male-lighter';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  for (const device of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    { name: 'phone', viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ]) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    await page.goto('http://localhost:4201/?era=ps2&island&cycleMinute=14', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#gate-form', { timeout: 120_000 });
    await page.waitForTimeout(9_000);
    const preview = page.locator('.gate-avatar, [data-gate-avatar], .gate__avatar').first();
    if (await preview.isVisible().catch(() => false)) await preview.screenshot({ path: `${out}/${label}-${device.name}-signin-avatar.png`, timeout: 10_000 }).catch(() => undefined);
    await page.screenshot({ path: `${out}/${label}-${device.name}-signin.png` });
    await page.fill('#festival-id', 'MaleCheck');
    await page.locator('#gate-form button[type="submit"]').first().click();
    await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
    await page.waitForTimeout(6_000);
    await page.screenshot({ path: `${out}/${label}-${device.name}-inside.png` });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log('captured', label);
