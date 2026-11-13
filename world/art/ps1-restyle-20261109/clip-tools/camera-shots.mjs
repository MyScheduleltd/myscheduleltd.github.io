// Third-person views in tight spots: the avatar placed, the follow camera's
// yaw and pitch set, the frame captured as a visitor sees it.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [out, minute = '12', graphics = 'normal'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const spots = [
  ['club-wall', -17.6, 12, -Math.PI / 2, .3],
  ['club-lamp', -17.4, 26, -Math.PI / 2 - .5, .25],
  ['dorm-front', -39, 55.6, 0, .3],
  ['shop-under-deck', 40, 12, 0, .32],
  ['temple-stairs', 68, 4, -Math.PI / 2, .3],
  ['palace-hall', -35, -40, 0, .3],
  ['open-square', 0, 10, .6, .3],
];
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => console.error('pageerror', String(e)));
  await page.goto(`http://localhost:4201/?era=ps2&island&review=perf&cycleMinute=${minute}`);
  await page.waitForSelector('#festival-id', { timeout: 120000 });
  await page.fill('#festival-id', `Cam${Math.floor(Math.random() * 9000)}`);
  await page.click(`[data-graphics=${graphics}]`).catch(() => undefined);
  await page.click('button[data-audio="muted"]');
  await page.waitForFunction(() => window.__islandWorld?.admitting === false && window.__festivalPerf?.().drawCalls > 0, null, { timeout: 240000 });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: 'body * { visibility:hidden !important; } canvas { visibility:visible !important; }' });
  for (const [name, x, z, yaw, pitch] of spots) {
    await page.evaluate(([x, z, yaw, pitch]) => {
      const w = window.__islandWorld;
      for (const a of w.remoteAvatars.values()) a.group.removeFromParent();
      w.setAerialReview();
      w.player.position.set(x, w.groundHeightAt(x, z, x > 74 ? 7 : .3), z);
      Object.assign(w.cameraOrbit.follow, { yaw, pitch }); w.cameraReach = 0; w.lastManualLookAt = performance.now();
    }, [x, z, yaw, pitch]);
    await page.waitForTimeout(900);
    const info = await page.evaluate(() => { const w = window.__islandWorld; return { reach: +w.camera.position.distanceTo(w.lookTarget).toFixed(2), lens: window.__islandWorld && true }; });
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(name, JSON.stringify(info));
  }
} finally { await browser.close(); }
