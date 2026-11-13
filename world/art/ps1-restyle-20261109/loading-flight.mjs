// Local-only captures of the sign-in backdrop and the loading flight (the
// owner, 2026-11-09: the loading animation follows the new art). Sign-in
// after the backdrop has turned a while, then frames through the flight.
// Usage: node loading-flight.mjs <outDir> [base=http://localhost:4201] [minute=12]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [out = 'art/ps1-restyle-20261109/loading-flight', base = 'http://localhost:4201', minute = '12'] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Loopback only');
mkdirSync(out, { recursive: true });
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  for (const [name, profile] of Object.entries(profiles)) {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    await page.goto(`${base}/?era=ps2&island&cycleMinute=${minute}`);
    await page.waitForSelector('#festival-id', { timeout: 120_000 });
    await page.waitForTimeout(9_000);
    await page.screenshot({ path: `${out}/${name}-0-sign-in.png` });
    await page.fill('#festival-id', `Fly${Math.floor(Math.random() * 9000)}`);
    const started = Date.now();
    await page.click('button[data-audio="muted"]').catch(() => page.locator('#gate-form button[type="submit"]').first().click());
    for (const at of (process.env.FRAMES ?? '1200,2600,4200,6500').split(',').map(Number)) {
      await page.waitForTimeout(Math.max(0, at - (Date.now() - started)));
      await page.screenshot({ path: `${out}/${name}-1-flight-${at}ms.png` });
    }
    console.log(`${name} captured`);
    await context.close();
  }
} finally {
  await browser.close();
}
