// Local-only: where the sign-in loading bar sits against the 你的角色 caption
// (the owner, 2026-11-10: centre it below the caption). Captures while loading.
// Usage: node gate-loading-bar.mjs [outDir] [base]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [out = 'art/ps1-restyle-20261109/gate-bar', base = 'http://localhost:4201'] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Loopback only');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
try {
  for (const [w, h, mobile] of [[1440, 900], [1280, 720], [1100, 640], [402, 874, true]]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: !!mobile, hasTouch: !!mobile })).newPage();
    await page.goto(`${base}/?era=ps2&island&cycleMinute=12`);
    await page.waitForSelector('[data-gate-scene-status]', { timeout: 60_000 });
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), centre: Math.round((b.left + b.right) / 2), visible: b.width > 0 && getComputedStyle(el).display !== 'none' }; };
      return { caption: r(document.querySelector('.gate-avatar__caption .eyebrow')), hint: r(document.querySelector('#gate-avatar-hint')), bar: r(document.querySelector('[data-gate-scene-status]')), track: r(document.querySelector('.gate-scene-status__track')), state: document.querySelector('[data-gate-scene-status]')?.dataset.state, viewport: [innerWidth, innerHeight] };
    });
    console.log(JSON.stringify(m));
    await page.screenshot({ path: `${out}/gate-${w}x${h}.png` });
    await page.context().close();
  }
} finally { await browser.close(); }
