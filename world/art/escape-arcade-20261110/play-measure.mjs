// Local-only: where the screen, Exit/Fullscreen and the joystick land in the
// play view of each cabinet (2026-11-10, owner: move the buttons off the game,
// the joystick head is cropped). Usage: node play-measure.mjs [outDir] [base]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [out = 'art/escape-arcade-20261110/captures', base = 'http://localhost:4201'] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Loopback only');
mkdirSync(out, { recursive: true });
const sizes = (process.env.SIZES ?? '1440x900,1280x620').split(',').map(s => s.split('x').map(Number));
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const [width, height] of sizes) {
    const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })).newPage();
    await page.goto(`${base}/?era=ps2&island&cycleMinute=12`);
    await page.waitForSelector('#festival-id', { timeout: 120_000 });
    await page.fill('#festival-id', `Size${Math.floor(Math.random() * 9000)}`);
    await page.click('button[data-audio="muted"]').catch(() => page.locator('#gate-form button[type="submit"]').first().click());
    await page.waitForFunction(() => window.__islandWorld?.admitting === false, null, { timeout: 240_000 });
    await page.waitForTimeout(2500);
    for (const game of ['escape', 'moth']) {
      await page.evaluate((game) => {
        const world = window.__islandWorld, cabinet = game === 'escape' ? world.escapeCabinet : world.arcadeCabinet;
        const p = cabinet.root.position, x = p.x - 3.1, z = p.z;
        world.player.position.set(x, world.groundHeightAt(x, z, 0), z);
        world.player.rotation.y = -Math.PI / 2;
      }, game);
      await page.waitForTimeout(600);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(game === 'escape' ? 6000 : 2000);
      const m = await page.evaluate((game) => {
        const world = window.__islandWorld, cabinet = game === 'escape' ? world.escapeCabinet : world.arcadeCabinet;
        const cam = world.camera, W = innerWidth, H = innerHeight;
        const V = cam.position.constructor;
        const toPx = (v) => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
        const rectOf = (pts) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { left: Math.round(Math.min(...xs)), top: Math.round(Math.min(...ys)), right: Math.round(Math.max(...xs)), bottom: Math.round(Math.max(...ys)) }; };
        const frame = world.arcadeView?.frame;
        const right = new V(1, 0, 0).applyQuaternion(frame.quaternion), up = new V(0, 1, 0).applyQuaternion(frame.quaternion);
        const screen = rectOf([[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => toPx(frame.centre.clone().addScaledVector(right, a * frame.width / 2).addScaledVector(up, b * frame.height / 2))));
        const stick = [];
        cabinet.root.traverse(o => { if (o.isMesh && /joystick|stem|ball|button/i.test(o.name)) stick.push(o); });
        const corners = [];
        for (const o of stick) {
          o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
          for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(toPx(new V(x, y, z).applyMatrix4(o.matrixWorld)));
        }
        const deckEdge = Math.round(toPx(frame.centre.clone().addScaledVector(up, -(frame.height / 2 + .063)))[1]);
        const hud = document.querySelector('#moth-arcade-hud')?.getBoundingClientRect();
        return { game, viewport: [W, H], deckEdge, screen, joystick: corners.length ? rectOf(corners) : null, stickNames: stick.map(o => o.name), hud: hud && { left: Math.round(hud.left), top: Math.round(hud.top), right: Math.round(hud.right), bottom: Math.round(hud.bottom) } };
      }, game);
      console.log(JSON.stringify(m));
      await page.screenshot({ path: `${out}/measure-${game}-${width}x${height}.png` });
      await page.click('[data-arcade-exit]', { timeout: 3000 }).catch(() => page.evaluate(() => window.__islandWorld.stopArcadeGame()));
      await page.waitForTimeout(800);
    }
    await page.context().close();
  }
} finally { await browser.close(); }
