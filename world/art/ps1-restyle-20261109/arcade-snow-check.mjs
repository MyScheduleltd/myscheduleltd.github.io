// Snow on the arcade cabinets while their games are played (the owner,
// 2026-11-13: "the game screen is overlapping with the snow"). The game is a
// web page laid over the 3D canvas, so any snow in front of the screen is
// cut off by it. Dev server (4201); snow is set in this page only.
//   node art/ps1-restyle-20261109/arcade-snow-check.mjs <label> [snow|clear]
// M.O.T.H is still locked here (until 2026-11-16 00:00 Taiwan time), so it is
// opened the way it will be once released, straight on its cabinet.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [label = 'now', weather = 'snow'] = process.argv.slice(2);
const out = `art/ps1-restyle-20261109/arcade-snow/${label}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const checks = [];
const check = (name, ok, detail = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`); };
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
await page.goto('http://localhost:4201/?era=ps2&island&cycleMinute=12', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gate-form', { timeout: 120_000 });
await page.fill('#festival-id', `Arcade${Date.now() % 1000}`);
await page.locator('#gate-form button[data-audio="muted"]').click();
await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
await page.waitForTimeout(2_000);
if (weather === 'snow') await page.evaluate(() => {
  const w = window.__islandWorld, now = Date.now(); w.setWeather = () => {};
  w.weather.setShared({ version: 1, updatedAt: now, schedule: [{ id: 'arcade-snow', type: 'snow', startsAt: now - 30 * 60_000, endsAt: now + 60 * 60_000 }], clearedSeats: [] }, now);
});
await page.waitForTimeout(1_500);

// Snow in front of the screen, as drawn: with the game page hidden, the 3D
// view is photographed and every point of the screen's outline (exactly where
// the page is laid) is read. Snow-white there is snow the page would cut off.
// The snow's depth is added on the graphics card, so rays cannot see it.
const snowOverScreen = async name => {
  const open = await page.evaluate(() => Boolean(window.__islandWorld.arcadeView));
  if (!open) return { open: false };
  await page.evaluate(() => { document.querySelector('.world-css3d').style.opacity = '0'; });
  await page.waitForTimeout(400);
  const shot = (await page.screenshot({ path: `${out}/${name}-3d-only.png` })).toString('base64');
  await page.evaluate(() => { document.querySelector('.world-css3d').style.opacity = ''; });
  return page.evaluate(async shot => {
    const view = window.__islandWorld.arcadeView, image = new Image();
    image.src = `data:image/png;base64,${shot}`; await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data, scale = image.width / innerWidth;
    const COLS = 64, ROWS = 48;
    // A row of the screen counts as snow when most of it is snow-white: the
    // attract picture's speckle and the game's own lettering never fill a row.
    let samples = 0, rows = 0, highest = -1;
    for (let r = 0; r < ROWS; r++) { let inRow = 0, white = 0; for (let c = 0; c < COLS; c++) {
      const u = (c + .5) / COLS, v = (r + .5) / ROWS, at = view.projectedScreenPoint(u, v);
      if (!at) continue;
      const x = Math.round(at.x * scale), y = Math.round(at.y * scale);
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const i = (y * image.width + x) * 4, red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
      samples++; inRow++;
      if (Math.min(red, green, blue) > 185 && Math.max(red, green, blue) - Math.min(red, green, blue) < 45) white++;
    }
    if (inRow && white / inRow >= .5) { rows++; highest = Math.max(highest, 1 - (r + .5) / ROWS); } }
    return { open: true, samples, overScreen: rows, upTo: highest < 0 ? 0 : +((highest + .5 / ROWS) * 100).toFixed(1) };
  }, shot);
};

for (const game of ['escape', 'moth']) {
  await page.evaluate(game => {
    const w = window.__islandWorld, cabinet = game === 'escape' ? w.escapeCabinet : w.arcadeCabinet;
    const p = cabinet.root.position, x = p.x - 3.1, z = p.z;
    w.player.position.set(x, w.groundHeightAt(x, z, 0), z); w.player.rotation.y = -Math.PI / 2; w.airborne = false;
    w.cameraMode = 'follow'; w.cameraZoom = .86; w.cameraOrbit.follow.yaw = -Math.PI / 2; w.cameraOrbit.follow.pitch = .3;
  }, game);
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${out}/${game}-${weather}-walk.png` });
  const before = await page.evaluate(game => {
    const w = window.__islandWorld, cabinet = game === 'escape' ? w.escapeCabinet : w.arcadeCabinet;
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    let snow = 0; cabinet.root.traverse(o => { if (o.isMesh && /snow/.test(o.name) && shown(o)) snow++; });
    return { coverage: +w.weather.snapshot().settledDepth.toFixed(3), cabinetSnowMeshes: snow };
  }, game);
  if (game === 'escape') {
    await page.mouse.click(720, 300);
    await page.keyboard.press('KeyE');
  } else {
    // As it will open after the release, straight on the cabinet.
    await page.evaluate(() => {
      const w = window.__islandWorld; w.setArcadeLocked(false); w.setArcadeLocked = () => {};
      const shell = document.querySelector('.world-shell'); shell.dataset.arcadePlaying = 'true'; shell.dataset.arcadeLocked = 'false';
      w.startArcadeGame(`https://myscheduleltd.com/moth/?arcade=1&arcadeLaunch=${crypto.randomUUID()}`, () => {}, undefined, 'moth');
    });
  }
  // CONTROL=1 puts the snow back while playing, as before the fix, to show
  // the check catches it.
  if (process.env.CONTROL) await page.evaluate(game => window.__islandWorld.weather.setSurfaceHidden(`${game}-arcade-cabinet`, false), game);
  await page.waitForTimeout(6_000);
  const measured = await snowOverScreen(`${game}-${weather}`);
  measured.cabinetSnowShown = await page.evaluate(game => {
    const w = window.__islandWorld, cabinet = game === 'escape' ? w.escapeCabinet : w.arcadeCabinet;
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    let snow = 0; cabinet.root.traverse(o => { if (o.isMesh && /snow/.test(o.name) && shown(o)) snow++; });
    return snow;
  }, game);
  await page.screenshot({ path: `${out}/${game}-${weather}-play.png` });
  console.log(game, JSON.stringify({ ...before, ...measured }));
  check(`${game}: the game is open`, measured.open);
  if (weather === 'snow') check(`${game}: no snow in front of the screen while playing`, measured.open && measured.overScreen === 0, `${measured.overScreen} of 48 rows of the screen are snow, up to ${measured.upTo}% of its height from the bottom`);
  await page.evaluate(game => {
    const w = window.__islandWorld;
    if (game === 'escape') document.querySelector('[data-arcade-exit]')?.click();
    if (w.arcadeView) { w.stopArcadeGame(); const shell = document.querySelector('.world-shell'); delete shell.dataset.arcadePlaying; delete shell.dataset.arcadeLocked; }
  }, game);
  await page.waitForTimeout(1_200);
  const after = await page.evaluate(game => {
    const w = window.__islandWorld, cabinet = game === 'escape' ? w.escapeCabinet : w.arcadeCabinet;
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    let snow = 0; cabinet.root.traverse(o => { if (o.isMesh && /snow/.test(o.name) && shown(o)) snow++; });
    return { open: Boolean(w.arcadeView), cabinetSnowMeshes: snow };
  }, game);
  check(`${game}: the game closes and the cabinet's snow is back`, !after.open && after.cabinetSnowMeshes === before.cabinetSnowMeshes && (weather !== 'snow' || after.cabinetSnowMeshes > 0), `${JSON.stringify(after)}, before ${before.cabinetSnowMeshes}`);
  await page.screenshot({ path: `${out}/${game}-${weather}-after.png` });
}
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`${checks.filter(Boolean).length}/${checks.length}`);
process.exit(checks.every(Boolean) ? 0 : 1);
