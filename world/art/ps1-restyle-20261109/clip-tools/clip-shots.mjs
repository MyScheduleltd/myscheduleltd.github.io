// Stands the avatar at each clipping cluster and photographs it from 7 units off.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [list, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const clusters = JSON.parse(readFileSync(list, 'utf8'));
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
  await page.goto(`http://localhost:4201/?era=ps2&island&review=perf&cycleMinute=12`);
  await page.waitForSelector('#festival-id', { timeout: 120000 });
  await page.fill('#festival-id', `Clip${Math.floor(Math.random() * 9000)}`);
  await page.click('button[data-audio="muted"]');
  await page.waitForFunction(() => window.__islandWorld?.admitting === false && window.__festivalPerf?.().drawCalls > 0, null, { timeout: 240000 });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: 'body * { visibility:hidden !important; } canvas { visibility:visible !important; }' });
  for (const [n, c] of clusters.entries()) {
    const placed = await page.evaluate((c) => {
      const w = window.__islandWorld;
      for (const a of w.remoteAvatars.values()) a.group.removeFromParent();
      const free = (x, z) => { const y = w.groundHeightAt(x, z, .3); return y > -.6 && !w.staticCollides(x, z, y, .6) ? y : undefined; };
      let best;
      for (let x = c.box[0] - .4; x <= c.box[1] + .4; x += .1) for (let z = c.box[2] - .4; z <= c.box[3] + .4; z += .1) {
        const y = free(x, z); if (y === undefined) continue;
        const d = Math.hypot(x - c.x, z - c.z); if (!best || d < best.d) best = { x, z, y, d };
      }
      if (!best) return null;
      w.player.position.set(best.x, best.y, best.z);
      let dx = best.x - c.x, dz = best.z - c.z; const l = Math.hypot(dx, dz);
      if (l < .05) { dx = .6; dz = .8; } else { dx /= l; dz /= l; }
      const from = [best.x + dx * 6 + dz * 2.5, best.y + 4.5, best.z + dz * 6 - dx * 2.5];
      w.setAerialReview(from, [best.x, best.y + 1.4, best.z]);
      return best;
    }, c);
    if (!placed) { console.log(n, 'no stand point', c.x, c.z); continue; }
    await page.waitForTimeout(700);
    const file = `${out}/${String(n).padStart(3, '0')}_${c.x}_${c.z}.png`;
    await page.screenshot({ path: file });
    console.log(n, c.x, c.z, 'stand', placed.x.toFixed(2), placed.z.toFixed(2), c.names?.[0]);
  }
} finally { await browser.close(); }
