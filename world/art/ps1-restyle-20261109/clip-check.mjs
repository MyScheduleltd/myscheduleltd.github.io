// Local-only clipping check for the PS1 restyle (the owner, 2026-11-09: "some
// of the signs are clipping into the buildings, please inspect thoroughly").
// Loads the world, then tests every piece the restyle added (Ps1StreetProps
// part bounds, every mesh named "PS1 …" or tagged ps1Prop, every venue sign
// and neon frame) against every static part of the world, including the town
// details merged by CoastalScenery (their pre-merge bounds). Reports pieces
// that sink more than a few centimetres into something solid. Flat signs are
// caught too: a sign has no thickness, so it is flagged when it sits buried
// inside a solid rather than on its face.
// Usage: node clip-check.mjs [base=http://localhost:4201]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const [base = 'http://localhost:4201'] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw Error('Loopback only');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  await page.goto(`${base}/?era=ps2&island&review=perf&cycleMinute=12&nobatch`);
  await page.waitForSelector('#festival-id', { timeout: 120_000 });
  await page.fill('#festival-id', `Clip${Math.floor(Math.random() * 9000)}`);
  await page.click('button[data-audio="muted"]').catch(() => page.locator('#gate-form button[type="submit"]').first().click());
  await page.waitForFunction(() => window.__islandWorld?.admitting === false && window.__festivalPerf?.().drawCalls > 0, null, { timeout: 240_000 });
  const report = await page.evaluate(() => {
    const scene = window.__islandScene;
    const THREE = { Box3: scene.children.find(o => o.isMesh)?.geometry.boundingBox?.constructor };
    const boxOf = (object) => {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      object.updateWorldMatrix(true, false);
      const position = object.geometry?.getAttribute('position');
      if (!position) return undefined;
      const e = object.matrixWorld.elements;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const w = [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
      }
      return { min, max };
    };
    const isOurs = (object) => { for (let p = object; p; p = p.parent) if (p.userData.ps1Prop || /^PS1 /.test(p.name)) return true; return false; };
    const isSign = (object) => { for (let p = object; p; p = p.parent) if (p.userData.neonSignFrame) return true; const m = object.material; return Boolean(m && !Array.isArray(m) && m.isMeshBasicMaterial && m.map && object.geometry?.type === 'PlaneGeometry'); };
    const skip = (object) => {
      for (let p = object; p; p = p.parent) if (p.userData.dynamic || p.userData.coastalCharacter !== undefined || p.name === 'character-body' || p.userData.projectorBackground && p.renderOrder < 0) return true;
      return object.renderOrder < 0 || object.name === 'Authored coastal town details' || /sea|water|terrain|ground|ribbon|square|carpet|paving|Festival|landing|path|sky|wave|ocean|asphalt|foundation|floor|lawn|walk|approach|pavement|crossing|apron/i.test(object.name) || !object.visible;
    };
    const ours = [], solids = [];
    for (const part of scene.userData.ps1Props?.parts ?? []) ours.push({ name: part.label, ...part });
    scene.traverse((object) => {
      if (!object.isMesh || skip(object)) return;
      const box = boxOf(object);
      if (!box) return;
      const size = box.max.map((v, k) => v - box.min[k]);
      if (isOurs(object) || isSign(object)) {
        // Merged prop meshes span the island; their pieces are in the part registry instead.
        if (Math.max(...size) > 30 || object.userData.ps1Prop && !isSign(object) && !/^PS1 /.test(object.name)) return;
        ours.push({ name: object.name || `${object.material?.name || object.geometry.type}#${object.id}`, ...box, sign: isSign(object) });
        return;
      }
      if (Math.max(...size) > 70 || object.material?.transparent) return;
      solids.push({ name: object.name || `${object.material?.name || object.geometry.type}#${object.id}`, ...box });
    });
    for (const detail of scene.userData.coastalDetailBounds ?? []) solids.push({ name: `town ${detail.geometry}`, min: detail.min, max: detail.max });
    const hits = [];
    // Our pieces against each other too (a light-box through an awning).
    const others = [...solids, ...ours.filter(o => !o.sign).map(o => ({ ...o, name: `ours: ${o.name}` }))];
    for (const a of ours) for (const b of others) {
      if (`ours: ${a.name}` === b.name) continue;
      let depth = Infinity, ok = true;
      for (let k = 0; k < 3; k++) {
        const thin = a.max[k] - a.min[k] < .02;
        const overlap = Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]);
        if (thin) {
          // A flat piece counts only when it lies buried inside the solid on this axis.
          const buried = Math.min(a.min[k] - b.min[k], b.max[k] - a.max[k]);
          if (buried < .03) { ok = false; break; }
          depth = Math.min(depth, buried);
        } else {
          if (overlap < .05) { ok = false; break; }
          depth = Math.min(depth, overlap);
        }
      }
      if (ok) hits.push({ ours: a.name, sign: Boolean(a.sign), solid: b.name, depth: +depth.toFixed(2), at: a.min.map((v, k) => +((v + a.max[k]) / 2).toFixed(1)), oursBox: [a.min.map(v => +v.toFixed(2)), a.max.map(v => +v.toFixed(2))], solidBox: [b.min.map(v => +v.toFixed(2)), b.max.map(v => +v.toFixed(2))] });
    }
    hits.sort((x, y) => y.depth - x.depth);
    return { ours: ours.length, solids: solids.length, hits };
  });
  writeFileSync('art/ps1-restyle-20261109/clip-report.json', JSON.stringify(report, null, 2));
  console.log(`checked ${report.ours} added pieces and signs against ${report.solids} solids; ${report.hits.length} clashes`);
  const seen = new Set();
  for (const hit of report.hits) { const key = `${hit.ours}|${hit.solid}`; if (seen.has(key)) continue; seen.add(key); console.log(`${hit.depth.toFixed(2)}  ${hit.ours}  ->  ${hit.solid}  ours ${JSON.stringify(hit.oursBox)} solid ${JSON.stringify(hit.solidBox)}`); }
} finally {
  await browser.close();
}
