// What other visitors cost a phone (the owner, 2026-11-13: look into why
// phones drop frames when the world is busy). Joins stand-in visitors straight
// through the local service (8797), half standing and half walking, in front
// of a phone page on the production build (4202), and measures frames at 0, 5,
// 10 and 19 others (the service admits 20). Each stand-in leaves at the end.
//   node art/ps1-restyle-20261109/crowd-cost.mjs [phone|desktop]
import { createRequire } from 'node:module';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:8797';
const profile = process.argv[2] ?? 'phone';
const phone = profile === 'phone';
const STEPS = (process.env.STEPS ?? '0,5,10,19').split(',').map(Number);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const context = await browser.newContext(phone
  ? { viewport: { width: 402, height: 874 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const errors = [];
page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
await page.goto('http://localhost:4202/?era=ps2&island', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gate-form', { timeout: 240_000 });
await page.fill('#festival-id', `Crowd${profile}${Date.now() % 1000}`);
await page.locator('#gate-form button[data-audio="muted"]').click();
await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 600_000 });
await page.waitForTimeout(5_000);
// Where the camera looks, flattened: the crowd stands beyond the player, in view.
const me = await page.evaluate(() => {
  const world = window.__islandWorld, p = world.player.position, look = world.camera.getWorldDirection(p.clone());
  const along = Math.hypot(look.x, look.z) || 1;
  return { x: p.x, y: p.y, z: p.z, r: world.player.rotation.y, fx: look.x / along, fz: look.z / along };
});

const stand = [];
const post = (path, payload, who) => fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${who.token}`, 'x-festival-session': who.id } : {}) }, body: JSON.stringify(payload) });
// Beyond the player as the camera sees it: rows three to ten units out.
const spot = index => {
  const row = Math.floor(index / 5), column = index % 5 - 2;
  const ahead = 3 + row * 2.4, side = column * 1.6 + (row % 2) * .8;
  const fx = me.fx, fz = me.fz;
  return { x: me.x + fx * ahead + fz * side, z: me.z + fz * ahead - fx * side };
};
const join = async index => {
  const female = index % 2 === 1;
  const palette = { top: female ? '#28191b' : '#18191b', skin: '#9d5f43', hair: '#171315', bottoms: '#20242c', swimwear: '#d5b23f' };
  const answer = await post('/api/session', { name: `Crowd${String(index).padStart(2, '0')}${Date.now() % 1000}`, palette });
  const { session } = await answer.json();
  stand.push({ ...session, index, palette, home: spot(index), walking: index % 2 === 0 });
};
let tick = 0;
const keepAlive = setInterval(() => {
  tick++;
  for (const who of stand) {
    const angle = tick * .35 + who.index;
    const x = who.walking ? who.home.x + Math.cos(angle) * .9 : who.home.x;
    const z = who.walking ? who.home.z + Math.sin(angle) * .9 : who.home.z;
    void post('/api/presence', { x, y: me.y, z, rotation: who.walking ? angle + Math.PI / 2 : me.r + Math.PI, state: 'walking', moving: who.walking, venue: 'shore', location: 'MY SQUARE', palette: who.palette }, who).catch(() => undefined);
  }
}, 300);

const rows = [];
try {
  for (const crowd of STEPS) {
    while (stand.length < crowd) await join(stand.length);
    await page.waitForTimeout(6_000);
    if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // Frame gaps, and the world's own per-phase times averaged over every frame.
    const frames = await page.evaluate(() => new Promise(resolve => {
      const world = window.__islandWorld; const t = []; const sum = { residents: 0, visitors: 0, skins: 0, draw: 0 }; let n = 0;
      const f = now => {
        t.push(now); for (const key in sum) sum[key] += world.framePhases[key]; n++;
        if (now - t[0] < 6000) { requestAnimationFrame(f); return; }
        const d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b);
        const q = p => +d[Math.floor(p * (d.length - 1))].toFixed(1);
        const ms = Object.fromEntries(Object.entries(sum).map(([key, value]) => [key, +(value / n).toFixed(2)]));
        resolve({ fps: +(1000 * d.length / (t.at(-1) - t[0])).toFixed(1), p50: q(.5), p90: q(.9), p99: q(.99), ms });
      };
      requestAnimationFrame(f);
    }));
    if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const perf = await page.evaluate(() => { const s = window.__islandWorld.performanceSnapshot(); return { drawCalls: s.drawCalls, triangles: s.triangles, textures: s.textures, shadowCasters: s.shadowCasters, visitors: s.crowd.visitors, pending: s.crowd.pending, phases: s.crowd.phases, timings: s.crowd.timings }; });
    rows.push({ crowd, ...frames, ...perf });
    if (crowd === STEPS.at(-1)) await page.screenshot({ path: `art/ps1-restyle-20261109/flows/${profile}-crowd-${crowd}.png` });
    console.log(JSON.stringify({ crowd, ...frames, drawCalls: perf.drawCalls, triangles: perf.triangles, textures: perf.textures, shadowCasters: perf.shadowCasters, shown: perf.visitors, pending: perf.pending }));
  }
} finally {
  clearInterval(keepAlive);
  await Promise.all(stand.map(who => post('/api/session/leave', {}, who).catch(() => undefined)));
  await page.close({ runBeforeUnload: true }).catch(() => undefined);
  await browser.close();
}
if (errors.length) console.log('errors:', errors.join(' | '));
