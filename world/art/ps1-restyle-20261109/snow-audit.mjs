// Does snow reach everything that stands under the open sky? (The owner,
// 2026-11-13: "make sure the weather conditions will affect the newly added
// objects/buildings".) On the dev server (4201, unbatched so objects keep
// their names), with snow forced on in this page only:
//   1. every visible object's sky-facing surfaces are sampled; a sample that
//      sees the sky but has no settled snow on it is a miss;
//   2. settled snow is sampled the other way round: snow with a roof or
//      canopy over it is snow (and snowfall) where none should be.
//   node art/ps1-restyle-20261109/snow-audit.mjs [out.json]
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const out = process.argv[2] ?? 'art/ps1-restyle-20261109/snow-audit.json';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
await page.goto('http://localhost:4201/?era=ps2&island&nobatch', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gate-form', { timeout: 120_000 });
await page.fill('#festival-id', `SnowAudit${Date.now() % 1000}`);
await page.locator('#gate-form button[data-audio="muted"]').click();
await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
await page.waitForTimeout(3_000);
// Snow for half an hour already, so it lies at full depth. This page only.
await page.evaluate(() => {
  const world = window.__islandWorld, now = Date.now();
  world.setWeather = () => {};
  world.weather.setShared({ version: 1, updatedAt: now, schedule: [{ id: 'audit-snow', type: 'snow', startsAt: now - 30 * 60_000, endsAt: now + 60 * 60_000 }], clearedSeats: [] }, now);
});
await page.waitForTimeout(2_000);
const report = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const world = window.__islandWorld, scene = window.__islandScene;
  scene.updateMatrixWorld(true);
  const weatherRoot = world.weather.root;
  const snow = [];
  weatherRoot.traverse(o => { if (o.isMesh && /snow/.test(o.name) && o.visible) snow.push(o); });
  // Snow riding on something that moves (the ferry) is that thing's child.
  scene.traverse(o => { if (o.isMesh && o.name.startsWith('moving-snow-') && o.visible) snow.push(o); });
  const skipRoots = new Set([weatherRoot, world.player, ...world.npcs.map(npc => npc.group), ...[...world.remoteAvatars.values()].map(a => a.group)]);
  const visible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const inSkipped = o => { if (o.name.startsWith('moving-snow-')) return true; for (let p = o; p; p = p.parent) if (skipRoots.has(p)) return true; return false; };
  const path = o => { const names = []; for (let p = o; p && p !== scene; p = p.parent) if (p.name) names.push(p.name); return names.slice(0, 3).join(' < ') || `(${o.type})`; };
  const NOT_SURFACE = /sea|water|wave|swell|surf|foam|ocean|cloud|star|sky|sun|moon|halo|glow|beam|shadow|lens|screen|projector|aperture|flame|light cone|ray/i;
  const occluders = [], candidates = [];
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || !visible(o) || inSkipped(o)) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.every(m => m.depthWrite === false || (m.transparent && m.opacity < .5))) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const box = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld), size = box.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.z) > 260) return;
    occluders.push(o);
    if (!NOT_SURFACE.test(path(o))) candidates.push(o);
  });
  // Rays see both faces of everything: a surface sealed inside a closed roof
  // shell is under that roof, whichever way the roof's faces are wound.
  for (const o of occluders) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.userData.auditSide ??= m.side; m.side = THREE.DoubleSide; }
  const ray = new THREE.Raycaster(), up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), centre = new THREE.Vector3();
  const opensToSky = point => { ray.set(point.clone().addScaledVector(up, .03), up); ray.far = 90; return ray.intersectObjects(occluders, false).length === 0; };
  const snowOn = point => { ray.set(point.clone().addScaledVector(up, .6), down); ray.far = 1; return ray.intersectObjects(snow, false).some(hit => hit.point.y >= point.y - .2); };
  const misses = [];
  let sampled = 0, sky = 0, covered = 0;
  for (const mesh of candidates) {
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    if (!position) continue;
    const triangles = (index ? index.count : position.count) / 3, stride = Math.max(1, Math.floor(triangles / 3000));
    const doubleSided = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => m.side === THREE.DoubleSide);
    const tops = [];
    for (let t = 0; t < triangles; t += stride) {
      const ia = index ? index.getX(t * 3) : t * 3, ib = index ? index.getX(t * 3 + 1) : t * 3 + 1, ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      n.subVectors(b, a).cross(c.clone().sub(a));
      const area = n.length() / 2;
      if (area < .03) continue;
      n.normalize();
      if (!(n.y > .6 || (doubleSided && n.y < -.6))) continue;
      tops.push({ area: area * stride, point: centre.copy(a).add(b).add(c).divideScalar(3).clone() });
    }
    if (!tops.length) continue;
    tops.sort((p, q) => q.area - p.area);
    let open = 0, bare = 0, openArea = 0, bareArea = 0;
    const barePoints = [];
    for (const top of tops.slice(0, 8)) {
      sampled++;
      if (!opensToSky(top.point)) continue;
      sky++; open++; openArea += top.area;
      if (snowOn(top.point)) { covered++; continue; }
      bare++; bareArea += top.area;
      if (barePoints.length < 3) barePoints.push([+top.point.x.toFixed(1), +top.point.y.toFixed(1), +top.point.z.toFixed(1)]);
    }
    const totalArea = tops.reduce((sum, top) => sum + top.area, 0);
    if (bare && bareArea / Math.max(openArea, 1e-6) > .5 && totalArea > .25) {
      mesh.geometry.computeBoundingBox();
      const at = mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      misses.push({ object: path(mesh), area: +totalArea.toFixed(1), bareOfOpen: `${bare}/${open}`, at: [+at.x.toFixed(1), +at.y.toFixed(1), +at.z.toFixed(1)], bare: barePoints });
    }
  }
  // The other way round: settled snow with something overhead.
  const roofed = new Map();
  let snowSamples = 0;
  for (const mesh of snow) {
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const triangles = (index ? index.count : position.count) / 3, stride = Math.max(1, Math.floor(triangles / 2500));
    for (let t = 0; t < triangles; t += stride) {
      const ia = index ? index.getX(t * 3) : t * 3, ib = index ? index.getX(t * 3 + 1) : t * 3 + 1, ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      centre.copy(a).add(b).add(c).divideScalar(3);
      snowSamples++;
      ray.set(centre.clone().addScaledVector(up, .25), up); ray.far = 30;
      const hit = ray.intersectObjects(occluders, false)[0];
      if (!hit) continue;
      const key = path(hit.object);
      const entry = roofed.get(key) ?? { over: key, samples: 0, at: [+centre.x.toFixed(1), +centre.y.toFixed(1), +centre.z.toFixed(1)], height: +hit.distance.toFixed(1) };
      entry.samples++; roofed.set(key, entry);
    }
  }
  for (const o of occluders) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.userData.auditSide !== undefined) { m.side = m.userData.auditSide; delete m.userData.auditSide; }
  return {
    snowMeshes: snow.map(m => m.name), candidates: candidates.length, occluders: occluders.length,
    topSamples: sampled, openToSky: sky, snowCovered: covered,
    misses: misses.sort((p, q) => q.area - p.area),
    snowUnderCover: { samples: snowSamples, byCover: [...roofed.values()].sort((p, q) => q.samples - p.samples) },
  };
});
await writeFile(out, JSON.stringify({ ...report, errors }, null, 1));
console.log(`snow meshes ${report.snowMeshes.filter(n => !n.startsWith('seat-snow')).join(', ')} (+${report.snowMeshes.filter(n => n.startsWith('seat-snow')).length} seat caps); ${report.candidates} objects, ${report.topSamples} sky-facing samples, ${report.openToSky} open to the sky, ${report.snowCovered} with snow`);
console.log(`objects open to the sky with bare tops: ${report.misses.length}`);
for (const miss of report.misses.slice(0, 60)) console.log(`  BARE ${String(miss.area).padStart(6)} m² ${miss.bareOfOpen.padStart(5)} @${miss.at.join(',')}  ${miss.object}  bare at ${miss.bare.map(p => p.join(',')).join(' ; ')}`);
console.log(`settled snow with cover overhead: ${report.snowUnderCover.byCover.reduce((n, e) => n + e.samples, 0)} of ${report.snowUnderCover.samples} samples`);
for (const entry of report.snowUnderCover.byCover.slice(0, 30)) console.log(`  UNDER ${String(entry.samples).padStart(4)} × ${entry.height}m up @${entry.at.join(',')}  ${entry.over}`);
if (errors.length) console.log('errors:', errors.join(' | '));

await browser.close();
