// Local-only art review captures: the same camera views with the previous
// film look (?look=film) and the PS1 screen layer (default). HUD hidden,
// remote visitors removed in this client only; no server data is edited.
// Usage: node capture-looks.mjs <outDir> [base]  (VIEWS=id,id LOOKS=film,ps1 PROFILES=desktop,phone)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [out = 'art/ps1-restyle-20261109/looks', base = 'http://localhost:4201'] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Loopback captures only');
mkdirSync(out, { recursive: true });
const views = [
  { id: 'square', minute: 12, focus: 'square', from: [9, 8, 15], to: [0, 4, -5] },
  { id: 'street', minute: 12, focus: 'shop', from: [14, 8, -4], to: [40, 4, 15] },
  { id: 'entrance-out', minute: 12, focus: 'square', from: [0, 8, 84], to: [0, 10.5, 62] },
  { id: 'entrance-in', minute: 12, focus: 'square', from: [3, 8, 44], to: [0, 10.5, 62] },
  { id: 'entrance-night', minute: 42, focus: 'square', from: [0, 8, 84], to: [0, 10.5, 62] },
  { id: 'palace-far', minute: 31, focus: 'square', from: [22, 10, 58], to: [-35, 15, -31] },
  { id: 'booth-sign', minute: 12, focus: 'shop', from: [17, 5, -15], to: [17, 4.4, -25] },
  { id: 'dancehall-close', minute: 12, focus: 'square', from: [-8, 6, 44], to: [-18.5, 9, 40.8] },
  { id: 'shops-east-close', minute: 12, focus: 'shop', from: [68, 4.2, 16], to: [59, 5.4, 30] },
  { id: 'shops-south-close', minute: 12, focus: 'shop', from: [30, 4.2, 55], to: [36, 5.4, 44.5] },
  { id: 'club-corner-close', minute: 12, focus: 'square', from: [-8, 6, 4], to: [-18.5, 9, 1.5] },
  { id: 'dock-shops-close', minute: 12, focus: 'square', from: [12, 5, 52], to: [26, 6.5, 62] },
  { id: 'arcade-row', minute: 12, focus: 'shop', from: [11.5, 4.2, 13.5], to: [21, 2.3, 13.5] },
  { id: 'arcade-row-night', minute: 42, focus: 'shop', from: [11.5, 4.2, 13.5], to: [21, 2.3, 13.5] },
  { id: 'dock-east-drops', minute: 12, focus: 'square', from: [15, 15, 56], to: [26, 7.5, 63] },
  { id: 'dock-west-drops', minute: 12, focus: 'square', from: [-16, 15, 55], to: [-29, 7.5, 61] },
  { id: 'corner-poles', minute: 12, focus: 'shop', from: [57, 17, 61], to: [46, 11, 47] },
  { id: 'east-drops', minute: 12, focus: 'shop', from: [73, 13, 3], to: [59, 7.5, 16] },
  { id: 'palace', minute: 12, focus: 'palace', from: [-17, 11, -14], to: [-35, 6, -37] },
  { id: 'shore', minute: 12, focus: 'shore', from: [49, 13, -14], to: [35, 3, -29] },
  { id: 'overview', minute: 12, focus: 'square', from: [145, 180, 170], to: [0, -1, 20] },
  { id: 'plan', minute: 12, focus: 'shop', from: [45, 190, 1], to: [45, 0, 0] },
  { id: 'temple', minute: 12, focus: 'shop', from: [52, 9, -12], to: [80, 5, 2] },
  { id: 'south-face', minute: 12, focus: 'shop', from: [16, 6.5, 62], to: [40, 4.5, 44] },
  { id: 'east-street', minute: 12, focus: 'shop', from: [69, 6, -12], to: [60, 4.5, 30] },
  { id: 'east-street-night', minute: 42, focus: 'shop', from: [69, 6, -12], to: [60, 4.5, 30] },
  { id: 'south-face-night', minute: 42, focus: 'shop', from: [16, 6.5, 62], to: [40, 4.5, 44] },
  { id: 'arch', minute: 12, focus: 'square', from: [3, 5.5, 34], to: [0, 7.5, 6] },
  { id: 'arch-night', minute: 42, focus: 'square', from: [3, 5.5, 34], to: [0, 7.5, 6] },
  { id: 'temple-afternoon', minute: 20, focus: 'shop', from: [52, 9, -12], to: [80, 5, 2] },
  { id: 'dock-arrival', minute: 12, focus: 'square', from: [2, 7.5, 82], to: [0, 5, 50] },
  { id: 'dock-west', minute: 12, focus: 'square', from: [-10, 6.5, 80], to: [-30, 5.5, 63] },
  { id: 'dock-east', minute: 12, focus: 'square', from: [10, 6.5, 82], to: [27, 5.5, 66] },
  { id: 'dock-arrival-night', minute: 42, focus: 'square', from: [2, 7.5, 82], to: [0, 5, 50] },
  { id: 'club-wall', minute: 12, focus: 'square', from: [6, 6.5, -4], to: [-20, 5, 16] },
  { id: 'club-machines', minute: 12, focus: 'square', from: [-9, 4.5, 10], to: [-19, 2.4, 20] },
  { id: 'garage-east-machine', minute: 12, focus: 'shop', from: [66, 4.5, 38], to: [58, 2.4, 30] },
  { id: 'club-machines-night', minute: 42, focus: 'square', from: [-9, 4.5, 10], to: [-19, 2.4, 20] },
  { id: 'pamphlet', minute: 12, focus: 'square', from: [2.6, 3.4, 4.4], to: [0, 1.9, -2] },
  { id: 'pamphlet-night', minute: 42, focus: 'square', from: [2.6, 3.4, 4.4], to: [0, 1.9, -2] },
  { id: 'ferry', minute: 12, focus: 'square', from: [3.5, 4.5, 99], to: [10.5, 1.2, 92.5] },
  { id: 'ferry-side', minute: 12, focus: 'square', from: [17, 5, 88], to: [10.4, 1.4, 92.6] },
  { id: 'ferry-night', minute: 42, focus: 'square', from: [3.5, 4.5, 99], to: [10.5, 1.2, 92.5] },
  { id: 'jukebox', minute: 12, focus: 'shop', from: [15.5, 3.4, 13.5], to: [21, 2.2, 13.5] },
  { id: 'jukebox-night', minute: 42, focus: 'shop', from: [15.5, 3.4, 13.5], to: [21, 2.2, 13.5] },
  { id: 'palace-oblique', minute: 27, focus: 'palace', from: [-18, 4, -20], to: [-36, 13, -31] },
  { id: 'moth-coin-side', minute: 12, focus: 'shop', from: [18.6, 2.2, 8.6], to: [19.6, 1.0, 11.2] },
  { id: 'moth-coin-front', minute: 12, focus: 'shop', from: [17.2, 1.6, 10.8], to: [19.6, 0.9, 10.8] },
  { id: 'moth-coin-top', minute: 12, focus: 'shop', from: [18.8, 3.4, 10.8], to: [19.55, 0.6, 10.8] },
  { id: 'sky-day', minute: 12, focus: 'square', from: [0, 6, 30], to: [40, 40, -60] },
  { id: 'sky-sunset', minute: 27, focus: 'square', from: [0, 6, 30], to: [40, 40, -60] },
  { id: 'sky-night', minute: 42, focus: 'square', from: [0, 6, 30], to: [20, 80, -60] },
  { id: 'sky-overhead', minute: 12, focus: 'square', from: [0, 8, 20], to: [10, 90, -10] },
  { id: 'palace-pilaster-left', minute: 12, focus: 'palace', from: [-39.5, 7.6, -25], to: [-45, 7.4, -30.5] },
  { id: 'palace-pilaster-right', minute: 12, focus: 'palace', from: [-30.5, 7.6, -25], to: [-25, 7.4, -30.5] },
  { id: 'palace-front', minute: 12, focus: 'palace', from: [-35, 6.5, -11], to: [-35, 6, -29] },
  { id: 'palace-night', minute: 42, focus: 'palace', from: [-35, 6.5, -11], to: [-35, 6, -29] },
  { id: 'palace-high', minute: 12, focus: 'palace', from: [-10, 22, -6], to: [-35, 11, -38] },
  { id: 'district', minute: 30, focus: 'square', from: [-2, 70, 75], to: [12, 0, -12] },
  { id: 'temple-night', minute: 42, focus: 'shop', from: [52, 9, -12], to: [80, 5, 2] },
  { id: 'temple-aerial', minute: 20, focus: 'shop', from: [48, 34, -34], to: [91, 12, 4] },
  { id: 'drivein-screen', minute: 12, focus: 'square', from: [5, 7, -22], to: [0, 8, -46] },
  { id: 'shore-screen', minute: 12, focus: 'shore', from: [40, 7, -12], to: [35, 8, -36] },
  { id: 'beach-umbrellas', minute: 12, focus: 'shore', from: [70, 9, -28], to: [80, 2, -47] },
  { id: 'shore-night', minute: 42, focus: 'shore', from: [40, 7, -12], to: [35, 8, -36] },
  { id: 'temple-street-close', minute: 42, focus: 'shop', from: [61.5, 4.6, 50], to: [58.5, 4.2, 30] },
  { id: 'pier-sea', minute: 42, focus: 'square', from: [6, 6, 96], to: [-6, 0, 80] },
  { id: 'screens-night', minute: 42, focus: 'shore', from: [18, 6, -14], to: [18, 6, -40] },
  { id: 'pier-sea-day', minute: 12, focus: 'square', from: [6, 6, 96], to: [-6, 0, 80] },
  { id: 'sea-horizon', minute: 12, focus: 'shore', from: [30, 9, -50], to: [10, 0, -110] },
  { id: 'sea-horizon-night', minute: 42, focus: 'shore', from: [30, 9, -50], to: [10, 0, -110] },
  { id: 'street-sunset', minute: 27, focus: 'shop', from: [17, 6.5, -9], to: [40, 4, 14] },
  { id: 'street-night', minute: 42, focus: 'shop', from: [17, 6.5, -9], to: [40, 4, 14] },
];
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const pick = (list, env) => (process.env[env] ? list.filter((item) => process.env[env].split(',').includes(item.id ?? item)) : list);
const selectedViews = pick(views, 'VIEWS');
const looks = pick(['film', 'ps1'], 'LOOKS');
const profileNames = pick(Object.keys(profiles), 'PROFILES');
const report = { base, views: [], errors: [] };
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  for (const profileName of profileNames) for (const look of looks) for (const minute of [...new Set(selectedViews.map((view) => view.minute))]) {
    const context = await browser.newContext(profiles[profileName]);
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(`${profileName}/${look}: ${error}`));
    await page.goto(`${base}/?era=ps2&island&review=perf&cycleMinute=${minute}${look === 'film' ? '&look=film' : ''}`);
    await page.waitForSelector('#festival-id', { timeout: 120_000 });
    await page.fill('#festival-id', `Look${Math.floor(Math.random() * 9000)}`);
    await page.click(`[data-graphics=${process.env.GRAPHICS ?? 'normal'}]`).catch(() => undefined);
    await page.click('button[data-audio="muted"]').catch(() => page.locator('#gate-form button[type="submit"]').first().click());
    await page.waitForFunction(() => window.__islandWorld?.admitting === false && window.__festivalPerf?.().drawCalls > 0, null, { timeout: 240_000 });
    await page.waitForTimeout(1500);
    const drawing = await page.evaluate(() => { const canvas = document.querySelector('#world-canvas'); return { width: canvas.width, height: canvas.height, css: [canvas.clientWidth, canvas.clientHeight], look: document.querySelector('.world-shell')?.dataset.screenLook }; });
    await page.addStyleTag({ content: 'body * { visibility:hidden !important; } canvas { visibility:visible !important; }' });
    for (const view of selectedViews.filter((item) => item.minute === minute)) {
      await page.evaluate((v) => {
        const world = window.__islandWorld; world.setAerialReview(); world.focusCoastalForReview(v.focus);
        for (const avatar of world.remoteAvatars.values()) avatar.group.removeFromParent();
        world.setAerialReview(v.from, v.to);
      }, view);
      await page.waitForTimeout(1000);
      const filename = `${view.id}-${profileName}-${look}.png`;
      await page.screenshot({ path: join(out, filename) });
      report.views.push({ ...view, profile: profileName, look, filename, drawing });
      console.log(`Captured ${filename} drawn ${drawing.width}x${drawing.height}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
}
if (report.errors.length) { console.error(report.errors.join('\n')); process.exitCode = 1; }
