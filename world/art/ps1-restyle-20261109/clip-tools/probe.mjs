// Loads the local world and runs a probe function (file given as argv[2]) in the page.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const probe = readFileSync(process.argv[2], 'utf8');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.error('pageerror', String(e)));
  await page.goto(`http://localhost:4201/?era=ps2&island&review=perf&cycleMinute=${process.env.MINUTE ?? 12}${process.env.EXTRA ?? ""}`);
  await page.waitForSelector('#festival-id', { timeout: 120000 });
  await page.fill('#festival-id', `Probe${Math.floor(Math.random() * 9000)}`);
  await page.click('button[data-audio="muted"]');
  await page.waitForFunction(() => window.__islandWorld?.admitting === false && window.__festivalPerf?.().drawCalls > 0, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  console.log(JSON.stringify(await page.evaluate(probe), null, 1));
} finally { await browser.close(); }
