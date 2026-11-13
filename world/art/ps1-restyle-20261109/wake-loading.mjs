// Local-only review of the loading page's server-waking stage (the owner,
// 2026-11-09). A Threads-on-iPhone visitor arrives at a sleeping server
// (sleepy-proxy.mjs in front of ps1-api), presses ENTER after reading the page
// for a few seconds, and this samples the bar, its label and the explanation
// once a second until they are inside.
// Usage: node wake-loading.mjs <scenario> [base=http://localhost:4203] [query=?era=ps2&island&wake=1]
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [scenario = 'sleeping', base = 'http://localhost:4203', query = '?era=ps2&island&wake=1'] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Loopback only');
const out = `art/ps1-restyle-20261109/wake/${scenario}`;
await mkdir(out, { recursive: true });
const THREADS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Barcelona 358.0.0.24.106 (iPhone16,2; iOS 18_1; zh_TW; zh-Hant; scale=3.00; 1290x2796; 663434569)';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const report = { scenario, base, query, samples: [], requests: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, userAgent: THREADS, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'zh-TW' });
  const page = await context.newPage();
  const opened = Date.now();
  const at = () => +((Date.now() - opened) / 1000).toFixed(1);
  page.on('pageerror', (error) => report.errors.push(String(error)));
  page.on('request', (request) => { if (/:879\d\//.test(request.url()) && !/\/api\/visit/.test(request.url())) report.requests.push({ at: at(), method: request.method(), path: new URL(request.url()).pathname, event: 'sent' }); });
  page.on('response', (response) => { if (/:879\d\//.test(response.url()) && !/\/api\/visit/.test(response.url())) report.requests.push({ at: at(), method: response.request().method(), path: new URL(response.url()).pathname, status: response.status(), event: 'answered' }); });
  await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#festival-id', { timeout: 120_000 });
  await page.waitForTimeout(6_000);
  await page.fill('#festival-id', `Wake${Math.floor(Math.random() * 9000)}`);
  await page.screenshot({ path: `${out}/0-sign-in.png` });
  report.enteredAt = at();
  await page.locator('#gate-form button[type="submit"]').first().click();
  const shots = new Set([10, 30, 50]);
  for (;;) {
    const sample = await page.evaluate(() => {
      const entry = document.querySelector('[data-gate-entry]');
      const note = entry?.querySelector('[data-gate-entry-wake]');
      return {
        percent: Number(entry?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') ?? NaN),
        label: entry?.querySelector('[data-gate-entry-label]')?.textContent ?? '',
        note: note && !note.hidden ? note.textContent : '',
        inside: !document.querySelector('.gate--live') && Boolean(document.querySelector('.objective-count')),
        online: document.querySelector('[data-connection-status], .connection-status')?.textContent?.trim() ?? '',
      };
    });
    const t = +(at() - report.enteredAt).toFixed(1);
    report.samples.push({ t, ...sample });
    for (const shot of shots) if (t >= shot) { shots.delete(shot); await page.screenshot({ path: `${out}/1-loading-${shot}s.png` }); }
    if (sample.inside) break;
    if (t > 240) { report.errors.push('not inside after 240 s'); break; }
    await page.waitForTimeout(1_000);
  }
  report.insideAfterEnter = +(at() - report.enteredAt).toFixed(1);
  await page.waitForTimeout(6_000);
  report.after = await page.evaluate(() => ({ status: document.querySelector('.connection-status, [data-connection-status]')?.textContent?.trim() ?? '', people: document.querySelector('.online-count, [data-online-count]')?.textContent?.trim() ?? '' }));
  await page.screenshot({ path: `${out}/2-inside.png` });
  await context.close();
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
const changes = report.samples.filter((s, i, all) => i === 0 || s.label !== all[i - 1].label || Boolean(s.note) !== Boolean(all[i - 1].note));
for (const s of changes) console.log(`${s.t}s ${s.percent}% ${s.label}${s.note ? ' [note shown]' : ''}`);
console.log('inside after ENTER', report.insideAfterEnter, 's; server requests:', report.requests.filter((r) => r.event === 'answered').map((r) => `${r.at}s ${r.method} ${r.path} ${r.status}`).join(', '));
if (report.errors.length) { console.error(report.errors.join('\n')); process.exitCode = 1; }
