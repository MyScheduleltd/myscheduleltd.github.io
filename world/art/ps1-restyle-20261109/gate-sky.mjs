// Local-only: the sign-in globe at several times of day, to see the sun and
// moon stay clear of its edge (the owner, 2026-11-10). Usage: node gate-sky.mjs [outDir] [base]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [out = 'art/ps1-restyle-20261109/gate-sky', base = 'http://localhost:4201'] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Loopback only');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
try {
  for (const minute of (process.env.MINUTES ?? '3,8,12,20,26,31,42').split(',')) {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
    await page.goto(`${base}/?era=ps2&island&cycleMinute=${minute}`);
    await page.waitForSelector('#festival-id', { timeout: 120_000 });
    await page.waitForFunction(() => window.__islandWorld, null, { timeout: 60_000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}/minute-${minute}.png` });
    console.log(minute, JSON.stringify(await page.evaluate(() => ({ sun: window.__islandWorld.dayNight.sunObject.visible, moon: window.__islandWorld.dayNight.moonObject.visible }))));
    await page.context().close();
  }
} finally { await browser.close(); }
