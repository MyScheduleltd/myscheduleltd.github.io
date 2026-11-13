// Local-only: what the caustic sea costs in 精簡 on a phone-sized window
// (the owner, 2026-11-10 chose it over a baked texture; promised a measure).
// Stands on the pier looking out to sea, then times GPU work per frame with
// EXT_disjoint_timer_query_webgl2 (when the browser offers it) and counts the
// sea's drawn pixels, with the shader sea on and then off.
import { createRequire } from 'node:module';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const base = process.argv[2] ?? 'http://localhost:4201';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Loopback only');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
  await page.goto(`${base}/?era=ps2&island&review=perf&cycleMinute=12`);
  await page.waitForSelector('#festival-id', { timeout: 120_000 });
  await page.click('[data-graphics=lite]').catch(() => undefined);
  await page.fill('#festival-id', `Sea${Math.floor(Math.random() * 9000)}`);
  await page.click('button[data-audio="muted"]').catch(() => page.locator('#gate-form button[type="submit"]').first().click());
  await page.waitForFunction(() => window.__islandWorld?.admitting === false, null, { timeout: 240_000 });
  await page.waitForTimeout(3000);
  const result = await page.evaluate(async () => {
    const world = window.__islandWorld, renderer = world.renderer, gl = renderer.getContext();
    world.player.position.set(-6, world.groundHeightAt(-6, 92, 0), 92); world.player.rotation.y = Math.PI;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const buffer = [gl.drawingBufferWidth, gl.drawingBufferHeight];
    const frames = (n) => new Promise(done => { let k = 0; const step = () => (++k >= n ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); });
    const measure = async (label) => {
      await frames(30);
      const times = [];
      if (ext) {
        for (let i = 0; i < 40; i++) {
          const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          renderer.render(world.scene, world.camera);
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          await frames(2);
          for (let w = 0; w < 30 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); w++) await frames(1);
          if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(q);
        }
      }
      times.sort((a, b) => a - b);
      return { label, sea: world.stylizedWater?.visible ? 'caustic shader' : 'baked texture', medianGpuMs: times.length ? +times[times.length >> 1].toFixed(3) : null, samples: times.length };
    };
    const on = await measure('shader sea');
    world.stylizedWater.visible = false; await frames(5);
    const off = await measure('baked sea');
    world.stylizedWater.visible = true;
    return { drawingBuffer: buffer, pixelRatio: renderer.getPixelRatio(), mode: world.graphicsMode, timer: Boolean(ext), on, off };
  });
  console.log(JSON.stringify(result, null, 1));
  await page.screenshot({ path: 'art/ps1-restyle-20261109/lite-sea-cost.png' });
} finally { await browser.close(); }
