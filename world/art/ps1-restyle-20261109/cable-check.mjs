// Local-only cable check (the owner, 2026-11-10: "the cable lines clip
// through objects, please inspect thoroughly"). Loads the world, then tests
// every strung wire against every triangle drawn in the scene: the PS1 pole
// lines and service drops (Ps1StreetProps, 'PS1 overhead wires'), the town's
// east pole line and the shore's guy wires (CoastalScenery townWireRuns).
// A wire may touch what it is tied to, so hits within ANCHOR of either end of
// a run are ignored; everything else it passes through is reported.
// Usage: node cable-check.mjs [base=http://localhost:4201]
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
  await page.fill('#festival-id', `Cable${Math.floor(Math.random() * 9000)}`);
  await page.click('button[data-audio="muted"]').catch(() => page.locator('#gate-form button[type="submit"]').first().click());
  await page.waitForFunction(() => window.__islandWorld?.admitting === false && window.__festivalPerf?.().drawCalls > 0, null, { timeout: 240_000 });
  await page.waitForTimeout(4000);
  const report = await page.evaluate(() => {
    const ANCHOR = .35, JOINT = .06, CELL = 2;
    const scene = window.__islandScene;
    scene.updateMatrixWorld(true);
    // Runs: arrays of [x,y,z] points, each with a label.
    const runs = [];
    scene.traverse((o) => {
      if (o.isLineSegments && o.name === 'PS1 overhead wires') {
        const p = o.geometry.getAttribute('position');
        // Ps1StreetProps.wire writes ten segments (twenty points) per wire.
        for (let w = 0; w < p.count; w += 20) {
          const pts = [];
          for (let i = w; i < w + 20; i += 2) pts.push([p.getX(i), p.getY(i), p.getZ(i)]);
          pts.push([p.getX(w + 19), p.getY(w + 19), p.getZ(w + 19)]);
          runs.push({ label: `ps1 wire ${w / 20}`, pts });
        }
      }
    });
    for (const [i, flat] of (scene.userData.townWireRuns ?? []).entries()) {
      const pts = [];
      for (let k = 0; k < flat.length; k += 3) pts.push([flat[k], flat[k + 1], flat[k + 2]]);
      runs.push({ label: flat.length === 6 ? `shore guy wire ${i}` : `town wire ${i}`, pts });
    }
    // Segments into a grid of cells.
    const segs = [], grid = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    for (const [r, run] of runs.entries()) {
      let along = 0;
      const total = run.pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - run.pts[i][0], p[1] - run.pts[i][1], p[2] - run.pts[i][2]), 0);
      for (let i = 0; i + 1 < run.pts.length; i++) {
        const a = run.pts[i], b = run.pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const s = { r, a, b, from: along, len, total, joints: [i > 0, i + 2 < run.pts.length] };
        along += len;
        const id = segs.push(s) - 1;
        const lo = [0, 1, 2].map(k => Math.floor(Math.min(a[k], b[k]) / CELL)), hi = [0, 1, 2].map(k => Math.floor(Math.max(a[k], b[k]) / CELL));
        for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
          const k = key(x, y, z); (grid.get(k) ?? grid.set(k, []).get(k)).push(id);
        }
      }
    }
    const skip = (o) => {
      for (let p = o; p; p = p.parent) {
        if (!p.visible) return true;
        if (p.userData.coastalCharacter !== undefined || p.name === 'character-body' || p.isSkinnedMesh) return true;
      }
      const m = o.material;
      if (Array.isArray(m) ? false : m && (m.transparent && m.opacity < .3 || m.visible === false)) return true;
      return /sky|cloud|star|glitter|reflection|rain|snow-fall|fog/i.test(o.name);
    };
    const hits = [], seen = new Set();
    const e1 = [0, 0, 0], e2 = [0, 0, 0], pv = [0, 0, 0], tv = [0, 0, 0], qv = [0, 0, 0];
    const sub = (o, a, b) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; };
    const cross = (o, a, b) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const testTri = (v0, v1, v2, name, objectId) => {
      const lo = [0, 1, 2].map(k => Math.floor(Math.min(v0[k], v1[k], v2[k]) / CELL)), hi = [0, 1, 2].map(k => Math.floor(Math.max(v0[k], v1[k], v2[k]) / CELL));
      if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 4000) return;
      const cand = new Set();
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (const id of grid.get(key(x, y, z)) ?? []) cand.add(id);
      if (!cand.size) return;
      sub(e1, v1, v0); sub(e2, v2, v0);
      for (const id of cand) {
        const s = segs[id], dir = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]];
        cross(pv, dir, e2); const det = dot(e1, pv);
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det; sub(tv, s.a, v0);
        const u = dot(tv, pv) * inv; if (u < 0 || u > 1) continue;
        cross(qv, tv, e1); const v = dot(dir, qv) * inv; if (v < 0 || u + v > 1) continue;
        const t = dot(e2, qv) * inv; if (t < 0 || t > 1) continue;
        const at = s.from + t * s.len;
        if (at < ANCHOR || s.total - at < ANCHOR) continue;
        if ((s.joints[0] && t * s.len < JOINT) || (s.joints[1] && (1 - t) * s.len < JOINT)) continue;
        const point = [0, 1, 2].map(k => s.a[k] + dir[k] * t);
        const tag = `${s.r}|${objectId}|${point.map(v => Math.round(v * 2)).join(',')}`;
        if (seen.has(tag)) continue; seen.add(tag);
        hits.push({ run: runs[s.r].label, object: name, at: point.map(v => +v.toFixed(2)), fromEnd: +Math.min(at, s.total - at).toFixed(2), runEnds: [runs[s.r].pts[0].map(v => +v.toFixed(1)), runs[s.r].pts[runs[s.r].pts.length - 1].map(v => +v.toFixed(1))] });
      }
    };
    let meshes = 0, triangles = 0;
    const v0 = [0, 0, 0], v1 = [0, 0, 0], v2 = [0, 0, 0];
    const tmp = scene.children.find(o => o.isMesh)?.matrixWorld.constructor;
    scene.traverse((o) => {
      if (!o.isMesh || skip(o)) return;
      const position = o.geometry?.getAttribute('position');
      if (!position) return;
      const index = o.geometry.index;
      const count = index ? index.count : position.count;
      const instances = o.isInstancedMesh ? o.count : 1;
      if (count / 3 * instances > 3e6) return;
      meshes++;
      const name = o.name || `${(Array.isArray(o.material) ? o.material[0] : o.material)?.name || o.geometry.type}#${o.id}`;
      const world = o.matrixWorld.elements;
      const im = new tmp();
      for (let n = 0; n < instances; n++) {
        let e = world;
        if (o.isInstancedMesh) { o.getMatrixAt(n, im); im.premultiply(o.matrixWorld); e = im.elements; }
        const vert = (out, i) => {
          const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
          out[0] = e[0] * x + e[4] * y + e[8] * z + e[12]; out[1] = e[1] * x + e[5] * y + e[9] * z + e[13]; out[2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        };
        for (let i = 0; i + 2 < count; i += 3) {
          vert(v0, index ? index.getX(i) : i); vert(v1, index ? index.getX(i + 1) : i + 1); vert(v2, index ? index.getX(i + 2) : i + 2);
          triangles++;
          testTri(v0, v1, v2, name, `${o.id}:${n}`);
        }
      }
    });
    return { runs: runs.length, segments: segs.length, meshes, triangles, hits };
  });
  writeFileSync('art/ps1-restyle-20261109/cable-report.json', JSON.stringify(report, null, 2));
  console.log(`${report.runs} wires (${report.segments} segments) against ${report.triangles} triangles in ${report.meshes} meshes: ${report.hits.length} clashes`);
  const byRun = new Map();
  for (const hit of report.hits) (byRun.get(hit.run) ?? byRun.set(hit.run, []).get(hit.run)).push(hit);
  for (const [run, list] of byRun) console.log(`${run} ${JSON.stringify(list[0].runEnds)}: ${[...new Set(list.map(h => h.object))].join(', ')} at ${list.slice(0, 4).map(h => JSON.stringify(h.at)).join(' ')}`);
} finally {
  await browser.close();
}
