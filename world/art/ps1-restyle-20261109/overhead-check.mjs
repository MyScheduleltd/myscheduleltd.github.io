// Local-only: every overhead piece the restyle hangs (its collider's underside)
// against the walking surface beneath it, sampled across its footprint. The
// body collides to 3.33 and hair reaches about 3.9 (the owner, 2026-11-09:
// avatars clipped through signs and awnings).
import { createRequire } from 'node:module';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  await page.goto('http://localhost:4201/?era=ps2&island&review=perf&cycleMinute=12');
  await page.waitForSelector('#festival-id', { timeout: 120_000 });
  await page.fill('#festival-id', `Head${Math.floor(Math.random() * 9000)}`);
  await page.click('button[data-audio="muted"]').catch(() => page.locator('#gate-form button[type="submit"]').first().click());
  await page.waitForFunction(() => window.__islandWorld?.admitting === false, null, { timeout: 240_000 });
  const rows = await page.evaluate(() => {
    const world = window.__islandWorld, out = [];
    for (const c of world.colliders) {
      if (!/^ps1-(light-box|awning|air-conditioner)|canopy$/.test(c.label ?? '') || c.minY === undefined) continue;
      let floor = -Infinity;
      for (const fx of [0, .5, 1]) for (const fz of [0, .5, 1]) {
        const x = c.minX + (c.maxX - c.minX) * fx, z = c.minZ + (c.maxZ - c.minZ) * fz;
        // A surface above the piece (a roof deck the footprint's wall edge
        // touches) is not what anybody stands on beneath it.
        const surface = world.groundHeightAt(x, z, c.minY - .5) - .28;
        if (surface < c.minY - 1) floor = Math.max(floor, surface);
      }
      out.push({ label: c.label, at: [+(c.minX + c.maxX).toFixed(1) / 2, +(c.minZ + c.maxZ).toFixed(1) / 2], clearance: +(c.minY - floor).toFixed(2) });
    }
    return out.sort((a, b) => a.clearance - b.clearance);
  });
  const low = rows.filter(r => r.clearance < 4.35);
  console.log(`${rows.length} overhead pieces; lowest clearance ${rows[0]?.clearance}; under 4.35: ${low.length}`);
  for (const r of rows.slice(0, 8)) console.log(r.clearance, r.label, r.at.map(v => v.toFixed(1)).join(','));
} finally { await browser.close(); }
