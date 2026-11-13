// Local-only play check for the 逃脫我的美麗 cabinet (2026-11-10): enter the
// world in desktop Chrome, stand in front of the cabinet, read the prompt,
// press E, and confirm the live /lol/ game is mounted on the cabinet's screen.
// Usage: node play-check.mjs <outDir> [base=http://localhost:4201]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [out = 'art/escape-arcade-20261110/captures', base = 'http://localhost:4201'] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Loopback only');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${base}/?era=ps2&island&cycleMinute=12`);
  await page.waitForSelector('#festival-id', { timeout: 120_000 });
  await page.fill('#festival-id', `Play${Math.floor(Math.random() * 9000)}`);
  await page.click('button[data-audio="muted"]').catch(() => page.locator('#gate-form button[type="submit"]').first().click());
  await page.waitForFunction(() => window.__islandWorld?.admitting === false, null, { timeout: 240_000 });
  await page.waitForTimeout(3000);
  const where = await page.evaluate(() => {
    const world = window.__islandWorld, cabinet = world.escapeCabinet;
    const p = cabinet.root.position, x = p.x - 3.1, z = p.z;
    world.player.position.set(x, world.groundHeightAt(x, z, 0), z);
    world.player.rotation.y = -Math.PI / 2;
    world.cameraMode = 'follow'; world.cameraZoom = .86; world.cameraOrbit.follow.yaw = -Math.PI / 2; world.cameraOrbit.follow.pitch = .3;
    return { cabinet: [p.x, p.z], status: cabinet.status, near: world.nearArcade(), label: world.interactionLabel() };
  });
  console.log('standing at the cabinet:', JSON.stringify(where));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/play-0-approach.png` });
  await page.evaluate(() => {
    const w = window.__islandWorld, stop = w.stopArcadeGame.bind(w);
    window.__arcadeStops = [];
    w.stopArcadeGame = () => { window.__arcadeStops.push(new Error('stop').stack.split('\n').slice(1, 7).join(' | ')); stop(); };
    window.__keys = [];
    window.addEventListener('keydown', e => window.__keys.push(`${e.key}/${e.code}/${e.target?.tagName}/${e.defaultPrevented}`), true);
  });
  console.log('focus before E:', await page.evaluate(() => document.activeElement?.tagName + '#' + (document.activeElement?.id || '')));
  await page.mouse.click(720, 300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(800);
  if (!(await page.evaluate(() => Boolean(document.querySelector('.moth-arcade-screen iframe'))))) {
    console.log('E did not start it; calling interact() directly');
    console.log('interact:', await page.evaluate(() => { const w = window.__islandWorld; w.interact(); return { view: Boolean(w.arcadeView), session: Boolean(w.arcadeSession), connected: w.arcadeSession?.iframe?.isConnected, src: w.arcadeSession?.iframe?.src, iframes: [...document.querySelectorAll('iframe')].map(f => f.src.slice(0, 60)) }; }));
  }
  await page.waitForTimeout(1500);
  const mounted = await page.evaluate(() => {
    const frame = document.querySelector('.moth-arcade-screen iframe');
    return frame ? { src: frame.src, title: frame.title, hud: !document.querySelector('#moth-arcade-hud')?.hidden } : undefined;
  });
  console.log('after E:', JSON.stringify(mounted));
  await page.waitForTimeout(12000);
  console.log('stops:', JSON.stringify(await page.evaluate(() => window.__arcadeStops), null, 1));
  console.log('keys seen:', JSON.stringify(await page.evaluate(() => window.__keys)));
  await page.screenshot({ path: `${out}/play-1-playing.png` });
  const frame = page.frames().find(f => f.url().includes('/lol/'));
  console.log('game frame text:', frame ? (await frame.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 160) : 'none');
  await page.click('[data-arcade-exit]', { timeout: 5000 }).catch(error => console.log('exit click:', String(error).split('\n')[0]));
  await page.waitForTimeout(1500);
  console.log('after Exit:', JSON.stringify(await page.evaluate(() => ({ iframe: Boolean(document.querySelector('.moth-arcade-screen iframe')), hud: !document.querySelector('#moth-arcade-hud')?.hidden }))));
  console.log(errors.length ? 'page errors:\n' + errors.slice(0, 5).join('\n') : 'no page errors');
} finally { await browser.close(); }
