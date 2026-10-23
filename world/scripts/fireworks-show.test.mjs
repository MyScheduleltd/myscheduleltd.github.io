import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: "export * from './src/world/FireworksShow';export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { THREE, FireworksShow, createFireworkScore, FIREWORK_PALETTE, FIREWORK_BUDGET } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('score has intentional breath, four distinct patterns, approved colours and a symmetric last 20 seconds', () => {
  const score = createFireworkScore(), finale = score.filter(event => event.at >= 105);
  assert.deepEqual(new Set(score.map(event => event.pattern)), new Set(['willow', 'ring', 'peony', 'comet']));
  assert.deepEqual(new Set(score.map(event => event.colour)), new Set(['amber', 'cyan', 'vermilion']));
  assert.deepEqual(Object.keys(FIREWORK_PALETTE), ['amber', 'cyan', 'vermilion']);
  assert.ok(score.every((event, i) => i === 0 || event.at >= score[i - 1].at));
  assert.equal(score[1].at - score[0].at, 6);
  assert.ok(finale.length > 10); assert.ok(score.at(-1).at < 125);
  for (const pair of [['comet', 105], ['ring', 108], ['peony', 114]]) {
    const members = finale.filter(event => event.pattern === pair[0] && event.at >= pair[1] && event.at < pair[1] + .5);
    assert.equal(members.length, 2); assert.equal(members[0].x, -members[1].x); assert.equal(members[0].y, members[1].y);
  }
  assert.equal(createFireworkScore(120_000).at(-1).at, 117.2);
  assert.deepEqual(createFireworkScore(Infinity), score); assert.deepEqual(createFireworkScore(NaN), score);
});

test('125-second desktop and phone shows keep two draws, fixed buffers, finite trails and strict particle budgets', () => {
  for (const quality of ['normal', 'lite']) {
    const scene = new THREE.Scene(), show = new FireworksShow(scene, { seaY: -.6, quality });
    const [points, glints] = show.root.children, pointGeometry = points.geometry, material = points.material;
    const buffers = Object.values(points.geometry.attributes).map(attribute => attribute.array.buffer);
    const originalRandom = Math.random; Math.random = () => { throw Error('show uses random confetti'); };
    let peak = 0, finale = false;
    try {
      show.start(1_000);
      for (let frame = 0; frame <= 132 * 30; frame++) {
        show.update(1 / 30, 1_000 + frame * 1000 / 30);
        const snapshot = show.snapshot(), count = points.geometry.drawRange.count;
        peak = Math.max(peak, count); finale ||= snapshot.phase === 'finale';
        assert.equal(count, snapshot.particles); assert.ok(count <= FIREWORK_BUDGET[quality]);
        assert.ok(snapshot.bursts <= (quality === 'normal' ? 4 : 3)); assert.equal(snapshot.lights, 0);
        assert.ok(snapshot.reflectionHeights.every(y => y === -.6 + .018));
        assert.ok(snapshot.drawCalls <= 2);
        // Sample every exposed star/tail for numerical stability and water-plane containment.
        if (frame % 30 === 0) {
          const positions = points.geometry.attributes.position.array;
          for (let i = 0; i < count * 3; i++) assert.ok(Number.isFinite(positions[i]));
          const alpha = points.geometry.attributes.sparkAlpha.array;
          for (let i = 0; i < count; i++) assert.ok(alpha[i] >= 0 && alpha[i] <= 1);
          for (let i = 0; i < glints.geometry.drawRange.count; i++) {
            assert.ok(Math.abs(glints.geometry.attributes.position.getY(i) - (-.6 + .018)) < 1e-6);
            assert.ok(glints.geometry.attributes.position.getZ(i) < -74);
          }
        }
      }
    } finally { Math.random = originalRandom; }
    assert.ok(peak > (quality === 'normal' ? 1200 : 600), `show too sparse: ${quality} ${peak}`);
    assert.equal(finale, true); assert.equal(show.root.visible, false); assert.equal(show.snapshot().active, false);
    assert.equal(points.geometry, pointGeometry); assert.equal(points.material, material);
    Object.values(points.geometry.attributes).forEach((attribute, i) => assert.equal(attribute.array.buffer, buffers[i]));
    assert.equal(show.root.children.length, 2); assert.equal(scene.children.flatMap(o => o.children).some(o => o.isLight), false);
    show.dispose();
  }
});

test('shells have rising launch trails, curved lingering willow trails and a coherent thin ring silhouette', () => {
  const show = new FireworksShow(new THREE.Scene(), { seaY: 0 }); show.start(0);
  const points = show.root.children[0], positions = points.geometry.attributes.position;
  show.update(.016, 850); assert.equal(show.snapshot().rockets, 1); assert.equal(show.snapshot().bursts, 0);
  assert.ok(positions.getY(0) > positions.getY(7));
  show.update(.016, 3_000); assert.deepEqual(show.snapshot().patterns, ['willow']);
  const count = points.geometry.drawRange.count;
  assert.ok(count > 400); assert.ok(points.geometry.attributes.sparkAlpha.getX(0) > points.geometry.attributes.sparkAlpha.getX(6));
  // Same ray, seven closely spaced samples: a continuous curving tail, not independent dots.
  const a = new THREE.Vector3().fromBufferAttribute(positions, 0), b = new THREE.Vector3().fromBufferAttribute(positions, 6);
  assert.ok(a.distanceTo(b) > .2 && a.distanceTo(b) < 5);
  show.update(.016, 8_700); assert.deepEqual(show.snapshot().patterns, ['ring']);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < points.geometry.drawRange.count; i += 7) {
    minX = Math.min(minX, positions.getX(i)); maxX = Math.max(maxX, positions.getX(i));
    minY = Math.min(minY, positions.getY(i)); maxY = Math.max(maxY, positions.getY(i));
    minZ = Math.min(minZ, positions.getZ(i)); maxZ = Math.max(maxZ, positions.getZ(i));
  }
  assert.ok(maxX - minX > 9 && maxY - minY > 9); assert.ok(maxZ - minZ < (maxX - minX) * .4);
  show.dispose();
});

test('background returns skip expired launches and sound catch-up; graphics changes, stop and disposal release only owned effects', () => {
  const scene = new THREE.Scene(), unrelated = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); scene.add(unrelated);
  let unrelatedDisposed = 0; unrelated.geometry.addEventListener('dispose', () => unrelatedDisposed++); unrelated.material.addEventListener('dispose', () => unrelatedDisposed++);
  const cues = [], show = new FireworksShow(scene, { seaY: 0, onCue: cue => cues.push(cue) }); show.start(0); show.update(0, 0);
  assert.equal(cues.length, 1); assert.equal(cues[0].kind, 'launch');
  show.update(60, 60_000); assert.equal(cues.length, 1); assert.ok(show.snapshot().bursts <= 4);
  show.update(1 / 30, 123_000); show.setQuality('lite'); show.update(0, 123_000);
  assert.ok(show.snapshot().particles <= 1024); assert.ok(show.snapshot().bursts <= 3);
  const owned = show.root.children.flatMap(object => [object.geometry, object.material]); let released = 0;
  for (const resource of owned) resource.addEventListener('dispose', () => released++);
  show.stop(); assert.equal(show.snapshot().active, false); assert.equal(show.snapshot().particles, 0); assert.equal(show.root.visible, false);
  show.start(130_000); show.update(1, 131_000); assert.ok(show.snapshot().particles > 0);
  show.dispose(); show.dispose(); show.start(0); show.update(1, 1_000);
  assert.equal(released, 4); assert.equal(unrelatedDisposed, 0); assert.equal(show.root.parent, null); assert.equal(unrelated.parent, scene);
});

test('shared material keeps the built-in planet/XR projection and renders soft round sparks with bright cores', () => {
  const show = new FireworksShow(new THREE.Scene(), { seaY: 0 }), material = show.root.children[0].material;
  const shader = { vertexShader: THREE.ShaderLib.points.vertexShader, fragmentShader: THREE.ShaderLib.points.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {});
  assert.match(shader.vertexShader, /#include <project_vertex>/); assert.match(shader.vertexShader, /#include <logdepthbuf_pars_vertex>/);
  assert.match(shader.vertexShader, /size \* sparkScale/); assert.match(shader.fragmentShader, /gl_PointCoord/);
  assert.match(shader.vertexShader, /isPerspectiveMatrix\(projectionMatrix\) \? 1\. : 4\./, 'parallel views retain visible sparks without new materials');
  assert.match(shader.fragmentShader, /if \(sparkRadius > 1\.\) discard/); assert.match(shader.fragmentShader, /#include <colorspace_fragment>/);
  assert.equal(material.depthWrite, false); assert.equal(material.depthTest, true); assert.equal(material.toneMapped, false);
  assert.equal(material.blending, THREE.AdditiveBlending); show.dispose();
});

test('temple score launches within the roof footprint, finishes in 24 seconds, and draws no misplaced sea reflections', () => {
  const show = new FireworksShow(new THREE.Scene(), { seaY: 0, score: 'temple' });
  show.root.position.set(91, 15, 100); show.start(0, 24_000);
  const points = show.root.children[0];
  let seen = false;
  for (let now = 0; now < 30_000; now += 100) {
    show.update(.1, now); const snapshot = show.snapshot();
    seen ||= snapshot.bursts > 0;
    assert.ok(snapshot.particles <= 2048 && snapshot.drawCalls <= 1);
    assert.equal(snapshot.reflections, 0); assert.deepEqual(snapshot.reflectionHeights, []);
    if (snapshot.rockets && !snapshot.bursts) {
      for (let i = 0; i < points.geometry.drawRange.count; i++) assert.ok(Math.abs(points.geometry.attributes.position.getX(i)) < 12);
    }
    if (now === 24_000) assert.equal(snapshot.active, false);
  }
  assert.equal(seen, true); assert.equal(show.root.visible, false); show.dispose();
});
