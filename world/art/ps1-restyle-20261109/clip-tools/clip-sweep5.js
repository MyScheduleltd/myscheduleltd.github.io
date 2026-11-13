// Every place a body can stand while scenery passes through it. Samples every
// visible triangle, files the samples by 25 cm cell, then for each cell asks
// whether an avatar could stand within reach (0.4) of it, and whether any
// sample there sits between its shins (0.3) and the top of its hair (3.85)
// measured from that avatar's own floor.
(() => {
  const w = window.__islandWorld, V = w.player.position.constructor;
  w.scene.updateMatrixWorld(true);
  const skipRoots = new Set([w.player, ...[...w.remoteAvatars.values()].map((a) => a.group), ...w.npcs.map((n) => n.group)]);
  const skipName = /sky|cloud|cumulus|\bsea\b|seabed|water|ocean|landform|terrain|shadow|snow|rain|particle|firefl|star field|moon|sun disc/i;
  const visible = (o) => { for (let p = o; p; p = p.parent) { if (!p.visible || skipRoots.has(p)) return false; } return true; };
  const CELL = .25, cells = new Map(), key = (i, j) => i * 100000 + j;
  const a = new V(), b = new V(), c = new V(), p = new V(), e1 = new V(), e2 = new V();
  w.scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry?.attributes?.position || !visible(o)) return;
    const label = `${o.name || '?'} < ${o.parent?.name || ''}`;
    if (skipName.test(label) || /grass tuft/i.test(label)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every((m) => !m || m.colorWrite === false || (m.transparent && m.opacity < .3))) return;
    const pos = o.geometry.attributes.position, index = o.geometry.index, count = index ? index.count : pos.count;
    const im = new o.matrixWorld.constructor(), wm = new o.matrixWorld.constructor();
    for (let n = 0; n < (o.isInstancedMesh ? o.count : 1); n++) {
      if (o.isInstancedMesh) { o.getMatrixAt(n, im); wm.multiplyMatrices(o.matrixWorld, im); } else wm.copy(o.matrixWorld);
      for (let t = 0; t < count; t += 3) {
        a.fromBufferAttribute(pos, index ? index.getX(t) : t).applyMatrix4(wm);
        b.fromBufferAttribute(pos, index ? index.getX(t + 1) : t + 1).applyMatrix4(wm);
        c.fromBufferAttribute(pos, index ? index.getX(t + 2) : t + 2).applyMatrix4(wm);
        if (Math.max(a.y, b.y, c.y) < -3 || Math.min(a.y, b.y, c.y) > 30) continue;
        if (Math.max(a.x, b.x, c.x) < -112 || Math.min(a.x, b.x, c.x) > 124 || Math.max(a.z, b.z, c.z) < -76 || Math.min(a.z, b.z, c.z) > 140) continue;
        e1.subVectors(b, a); e2.subVectors(c, a);
        const samples = Math.min(2500, Math.max(3, Math.ceil(e1.clone().cross(e2).length() / 2 / .02)));
        for (let s = 0; s < samples; s++) {
          let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
          p.copy(a).addScaledVector(e1, u).addScaledVector(e2, v);
          const i = Math.floor(p.x / CELL), j = Math.floor(p.z / CELL), k = key(i, j);
          let cell = cells.get(k); if (!cell) cells.set(k, cell = { i, j, ys: [], labels: [], seen: 0 });
          // Reservoir of 48 samples a cell.
          cell.seen++;
          if (cell.ys.length < 48) { cell.ys.push(p.y); cell.labels.push(label); }
          else { const r = Math.floor(Math.random() * cell.seen); if (r < 48) { cell.ys[r] = p.y; cell.labels[r] = label; } }
        }
      }
    }
  });
  const north = w.northLimit(), standCache = new Map();
  const stand = (x, z) => {
    const k = `${x.toFixed(2)},${z.toFixed(2)}`; if (standCache.has(k)) return standCache.get(k);
    let g; if (!(z < -75 || z > north || x < -110 || x > 122)) { const y = w.groundHeightAt(x, z, .3); if (y > -.6 && !w.staticCollides(x, z, y, .6)) g = y - .28; }
    standCache.set(k, g); return g;
  };
  const flagged = new Map();
  for (const [k, cell] of cells) {
    const x = (cell.i + .5) * CELL, z = (cell.j + .5) * CELL;
    for (let d = -1; d < 8; d++) {
      const cx = d < 0 ? x : x + Math.cos(d * Math.PI / 4) * .4, cz = d < 0 ? z : z + Math.sin(d * Math.PI / 4) * .4;
      const g = stand(cx, cz); if (g === undefined) continue;
      const hits = cell.ys.map((y, n) => [y - g, cell.labels[n]]).filter(([h]) => h >= .3 && h <= 3.85);
      if (hits.length) { flagged.set(k, { ...cell, hits }); break; }
    }
  }
  const seen = new Set(), clusters = [];
  for (const [k, cell] of flagged) {
    if (seen.has(k)) continue;
    const stack = [cell], members = []; seen.add(k);
    while (stack.length) { const m = stack.pop(); members.push(m);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const nk = key(m.i + di, m.j + dj), nb = flagged.get(nk); if (nb && !seen.has(nk)) { seen.add(nk); stack.push(nb); } } }
    const names = new Map(); let body = 0, head = 0, hair = 0;
    for (const m of members) for (const [h, n] of m.hits) { names.set(n, (names.get(n) ?? 0) + 1); if (h > 3.25) hair++; else if (h > 2.2) head++; else body++; }
    const xs = members.map((m) => (m.i + .5) * CELL), zs = members.map((m) => (m.j + .5) * CELL);
    clusters.push({ cells: members.length, body, head, hair, x: +(xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(2), z: +(zs.reduce((s, v) => s + v, 0) / zs.length).toFixed(2),
      box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)].map((v) => +v.toFixed(2)),
      names: [...names].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([n, c]) => `${n} (${c})`) });
  }
  clusters.sort((p, q) => (q.body + q.head + q.hair) - (p.body + p.head + p.hair));
  return { cells: cells.size, flaggedCells: flagged.size, clusters: clusters.length, top: clusters.slice(0, 300) };
})()
