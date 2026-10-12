import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

// Keep the real exported geometry, skeleton, outfit masks and skinning. The
// image stub only lets GLTFLoader decode embedded texture dimensions in Node.
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const data = new DataView(await blob.arrayBuffer());
  return { width: data.getUint32(16), height: data.getUint32(20), close() {} };
};
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ({ fillRect() {} }) }) };
const bundle = await build({
  stdin: {
    contents: "export * from './src/world/ImportedAvatar'; export * from './src/world/CoastalAvatar'; export * from './src/world/CoastalPose'; export * from './src/world/HandPose'; export { FestivalWorld } from './src/world/FestivalWorld'; export { HeadTracking } from './src/world/HeadTracking'; export * as THREE from 'three';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false,
});
const {
  THREE, FINGER_NAMES, FestivalWorld, HeadTracking, createCoastalAvatar,
  loadImportedAvatar, attachImportedAvatar, syncImportedAvatars, walkCoastalPose, supportCoastalPose,
} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const files = Object.fromEntries(await Promise.all(['male', 'female'].map(async sex => {
  // A local negative-fixture run can load the rejected male foot export
  // without replacing the installed asset. Normal CI reads the source GLBs.
  const path = sex === 'male' && process.env.SWIM_MALE_TEST_ASSET
    ? process.env.SWIM_MALE_TEST_ASSET : `src/assets/avatars/${sex}.glb`;
  const bytes = await readFile(path);
  return [sex, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)];
})));
await loadImportedAvatar(files);

const OUTFITS = {
  male: ['#18191b', '#191a1c', '#1a1b1d', '#1b1c1e'],
  female: ['#28191b', '#291a1c', '#2a1b1d', '#2b1c1e'],
};
const PALETTE = { skin: '#dfb590', hair: '#3b3633', top: '#18191b', bottoms: '#44464a', swimwear: '#577467' };
function character(top) {
  const root = new THREE.Group();
  root.position.y = .28;
  const palette = { ...PALETTE, top };
  const rig = createCoastalAvatar(root, palette, true, new THREE.Group());
  attachImportedAvatar(root, rig, palette);
  walkCoastalPose(rig, 0, 0);
  syncImportedAvatars(root);
  const mesh = root.userData.importedAvatar.meshes.find(m => m.userData.componentId === 'body');
  return { root, rig, mesh };
}

// These are the shader's actual wardrobe visibility rules, not just mesh.visible:
// both body generations were in one visible mesh when swim fingers stayed rigid.
function shownVertex(mesh, vertex, swim) {
  const mask = mesh.geometry.getAttribute(swim ? '_dressed' : '_covered');
  return (mask?.getX(vertex) ?? 0) <= .5;
}
function weightOn(mesh, vertex, bones) {
  const indices = mesh.geometry.getAttribute('skinIndex');
  const weights = mesh.geometry.getAttribute('skinWeight');
  let weight = 0;
  for (let k = 0; k < 4; k++) if (bones.has(indices.getComponent(vertex, k))) weight += weights.getComponent(vertex, k);
  return weight;
}
function ownedVertices(mesh, side, swim, digit) {
  const prefix = side + 'Hand' + (digit ?? '');
  const bones = new Set(mesh.skeleton.bones.map((bone, index) => {
    if (!bone.name.startsWith(prefix)) return -1;
    // Distal skin demonstrates actual fingertip articulation. A bone rotating
    // while every visible finger stays weighted to the wrist is not a pass.
    if (digit && bone.name.endsWith('1')) return -1;
    return index;
  }).filter(index => index >= 0));
  const vertices = [];
  for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex++) {
    if (shownVertex(mesh, vertex, swim) && weightOn(mesh, vertex, bones) > (digit ? .9 : .5)) vertices.push(vertex);
  }
  return vertices;
}
function positionsInHand(mesh, side, vertices) {
  mesh.skeleton.update();
  const hand = mesh.skeleton.bones.find(bone => bone.name === side + 'Hand');
  const inverse = hand.matrixWorld.clone().invert();
  return vertices.map(vertex => mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
}
function meanDisplacement(before, after) {
  assert.equal(before.length, after.length);
  return before.reduce((sum, point, i) => sum + point.distanceTo(after[i]), 0) / Math.max(1, before.length);
}

test('swimwear and outfits 1–3 draw the same repaired hand skin, without a second hand layer', () => {
  for (const [sex, outfits] of Object.entries(OUTFITS)) {
    const { root, mesh } = character(outfits[0]);
    for (const side of ['Left', 'Right']) {
      const original = ownedVertices(mesh, side, false);
      assert.ok(original.length > 300, `${sex} ${side}: missing hand skin`);
      const covered = mesh.geometry.getAttribute('_covered'), dressed = mesh.geometry.getAttribute('_dressed');
      for (const vertex of original) {
        assert.ok((covered?.getX(vertex) ?? 0) <= .5 && (dressed?.getX(vertex) ?? 0) <= .5,
          `${sex} ${side}: shared hand must be visible in both wardrobe modes`);
      }
      for (const [outfit, top] of outfits.entries()) {
        root.userData.setImportedPalette({ ...PALETTE, top });
        const swim = outfit === 3;
        assert.deepEqual(ownedVertices(mesh, side, swim), original,
          `${sex} ${side}: outfit ${outfit + 1} swapped the hand geometry or exposed an overlapping layer`);
      }
      root.userData.setImportedPalette({ ...PALETTE, top: outfits[0] });
      root.userData.setImportedSwimwear(true);
      assert.deepEqual(ownedVertices(mesh, side, true), original, `${sex} ${side}: entering water changed hands`);
      root.userData.setImportedSwimwear(false);
      root.userData.setImportedPalette({ ...PALETTE, top: outfits[0] });
    }
  }
});

test('both swimsuit hands have visible skin weighted to all five distal finger chains', () => {
  for (const [sex, outfits] of Object.entries(OUTFITS)) for (const side of ['Left', 'Right']) {
    const { mesh } = character(outfits[3]);
    for (const digit of FINGER_NAMES) {
      const vertices = ownedVertices(mesh, side, true, digit);
      assert.ok(vertices.length >= 20, `${sex} ${side} swimsuit: ${digit} has only ${vertices.length} weighted distal vertices`);
    }
  }
});

function desktopTrackingWorld(root, rig, tracker) {
  const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion(), M = () => new THREE.Matrix4();
  const world = Object.create(FestivalWorld.prototype);
  Object.assign(world, {
    player: root, playerRig: rig, headTracking: tracker, headTrackingActive: true,
    xrActive: true, xrSimulated: true, xrYaw: -Math.PI, xrSpineTwist: 0,
    moveVector: V(), airborne: false, playerState: 'walking', trackedBodyShown: false,
    trackedHiddenParts: [], trackedLandmarks: [], trackedArms: { left: false, right: false },
    xrHandPoses: { left: null, right: null }, xrHandSampleAt: { left: 0, right: 0 },
    trackedArmFrames: new WeakMap(), armWorld: V(), armSwing: V(), armLocal: V(),
    armAxisX: V(), armAxisY: V(), armAxisZ: V(), armBasis: M(), headForward: V(),
    armTarget: V(), armMeasured: V(), armWanted: V(), armQuat: Q(), armParentQuat: Q(),
    armMeasuredQuat: Q(), armDesiredQuat: Q(), armMatrix: M(), armVecA: V(), armVecB: V(),
    armVecC: V(), footSurfaceAt: () => 0,
  });
  return world;
}
function cameraHand(hand, closed) {
  const sign = hand === 'left' ? -1 : 1, points = [new THREE.Vector3()];
  FINGER_NAMES.forEach((digit, lane) => {
    let point = new THREE.Vector3(sign * (.055 - lane * .022), 0, digit === 'Thumb' ? .03 : .085);
    points.push(point.clone());
    let angle = 0;
    for (let joint = 0; joint < 3; joint++) {
      angle += closed.has(digit) ? [.3, .8, .5][joint] : 0;
      const direction = digit === 'Thumb'
        ? new THREE.Vector3(sign * .85, -Math.sin(angle), .5 * Math.cos(angle)).normalize()
        : new THREE.Vector3(0, -Math.sin(angle), Math.cos(angle));
      point = point.clone().addScaledVector(direction, joint === 0 ? .028 : .021);
      points.push(point.clone());
    }
  });
  return points.map(point => ({ x: point.x, y: -point.y, z: -point.z }));
}
test('desktop camera open, fist and independent index movements deform the visible skin in every outfit', () => {
  for (const [sex, outfits] of Object.entries(OUTFITS)) for (const [outfit, top] of outfits.entries()) for (const hand of ['left', 'right']) {
    const { root, rig, mesh } = character(top), swim = outfit === 3, side = hand === 'left' ? 'Left' : 'Right';
    const tracker = new HeadTracking();
    tracker.startForReview();
    const world = desktopTrackingWorld(root, rig, tracker);
    const vertices = Object.fromEntries(FINGER_NAMES.map(digit => [digit, ownedVertices(mesh, side, swim, digit)]));
    for (const digit of FINGER_NAMES) assert.ok(vertices[digit].length >= 20, `${sex} outfit ${outfit + 1} ${side} ${digit}: no visible tracked skin`);
    const feed = closed => {
      world.xrHandSampleAt[hand] = 0;
      world.xrHandPoses[hand] = null;
      tracker.feedBodyForReview(undefined, { [hand]: cameraHand(hand, closed) }, performance.now());
      world.updateTrackedBody(1 / 30);
      syncImportedAvatars(root);
      return Object.fromEntries(FINGER_NAMES.map(digit => [digit, positionsInHand(mesh, side, vertices[digit])]));
    };
    const open = feed(new Set()), index = feed(new Set(['Index']));
    assert.ok(meanDisplacement(open.Index, index.Index) > .01, `${sex} outfit ${outfit + 1} ${side}: visible index did not bend`);
    for (const digit of FINGER_NAMES.filter(digit => digit !== 'Index')) {
      assert.ok(meanDisplacement(open[digit], index[digit]) < .001, `${sex} outfit ${outfit + 1} ${side}: index tracking moved ${digit}`);
    }
    const fist = feed(new Set(FINGER_NAMES));
    for (const digit of FINGER_NAMES) assert.ok(meanDisplacement(open[digit], fist[digit]) > .005,
      `${sex} outfit ${outfit + 1} ${side}: visible ${digit} stayed rigid in a tracked fist`);
    const reopened = feed(new Set());
    for (const digit of FINGER_NAMES) assert.ok(meanDisplacement(open[digit], reopened[digit]) < .0001,
      `${sex} outfit ${outfit + 1} ${side}: visible ${digit} did not reopen`);
  }
});

function standingFoot(root, mesh, side) {
  mesh.skeleton.update();
  const bones = new Set(mesh.skeleton.bones.map((bone, index) =>
    bone.name === side + 'Foot' || bone.name === side + 'ToeBase' ? index : -1).filter(index => index >= 0));
  const points = [];
  for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex++) {
    if (!shownVertex(mesh, vertex, true) || weightOn(mesh, vertex, bones) <= .5) continue;
    points.push(root.worldToLocal(mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
  }
  assert.ok(points.length > 80, `${side}: missing visible bare-foot surface`);
  const box = new THREE.Box3().setFromPoints(points);
  // Exclude the upper ankle when measuring the footprint. Include the complete
  // heel, ball and toe outline, rather than relying on its unchanged toe bones.
  const outline = points.filter(point => point.y < box.min.y + .12);
  const bounds = new THREE.Box3().setFromPoints(outline), depth = bounds.max.z - bounds.min.z;
  const centre = samples => samples.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(samples.length);
  const heel = centre(outline.filter(point => point.z < bounds.min.z + depth * .2));
  const toe = centre(outline.filter(point => point.z > bounds.max.z - depth * .2));
  const forward = toe.sub(heel).setY(0).normalize(), across = new THREE.Vector3(forward.z, 0, -forward.x);
  const span = direction => {
    const values = outline.map(point => point.dot(direction));
    return Math.max(...values) - Math.min(...values);
  };
  return {
    length: span(forward), width: span(across), yaw: THREE.MathUtils.radToDeg(Math.atan2(forward.x, forward.z)),
    minX: bounds.min.x, maxX: bounds.max.x,
  };
}

test('bare feet have a compact separated footprint with mild toe-out on both avatars', () => {
  for (const [sex, outfits] of Object.entries(OUTFITS)) {
    const { root, mesh } = character(outfits[3]);
    const feet = ['Left', 'Right'].map(side => standingFoot(root, mesh, side));
    const regenerated = mesh.userData.higgsfield_source === '2cfdd22a-9ecb-4358-bd50-68d9b0d8cb11';
    for (const [i, foot] of feet.entries()) {
      const label = `${sex} ${i === 0 ? 'Left' : 'Right'}`;
      assert.ok(Math.abs(foot.yaw) <= 10, `${label}: foot splays ${foot.yaw} degrees`);
      assert.ok(foot.length >= .4 && foot.length <= .68, `${label}: disproportionate foot length ${foot.length}`);
      // The new Higgsfield anatomy is fuller than the rejected narrow repair.
      // Source-surface parity is checked separately below; never squeeze that
      // generated anatomy to satisfy the old procedural footprint envelope.
      assert.ok(foot.width >= .14 && foot.width <= (regenerated ? .34 : .26), `${label}: disproportionate foot width ${foot.width}`);
      assert.ok(foot.width / foot.length >= .25 && foot.width / foot.length <= (regenerated ? .62 : .42), `${label}: broad or pinched foot silhouette`);
    }
    assert.ok(Math.abs(feet[0].length - feet[1].length) / Math.max(...feet.map(foot => foot.length)) < .08,
      `${sex}: bare feet have inconsistent lengths`);
    assert.ok(Math.abs(feet[0].width - feet[1].width) / Math.max(...feet.map(foot => foot.width)) < .12,
      `${sex}: bare feet have inconsistent widths`);
    assert.ok(feet[0].minX - feet[1].maxX > .06, `${sex}: standing feet overlap or cross`);
  }
});

function footSideProfile(root, mesh, side) {
  mesh.skeleton.update();
  const bones = new Set(mesh.skeleton.bones.map((bone, index) =>
    bone.name === side + 'Foot' || bone.name === side + 'ToeBase' ? index : -1).filter(index => index >= 0));
  const points = new Map();
  for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex++) {
    if (shownVertex(mesh, vertex, true) && weightOn(mesh, vertex, bones) > .15) {
      points.set(vertex, root.worldToLocal(mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
    }
  }
  const box = new THREE.Box3().setFromPoints([...points.values()]);
  const outline = [...points.values()].filter(point => point.y < box.min.y + .12);
  const bounds = new THREE.Box3().setFromPoints(outline), depth = bounds.max.z - bounds.min.z;
  const centre = samples => samples.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(samples.length);
  const heel = centre(outline.filter(point => point.z < bounds.min.z + depth * .2));
  const toe = centre(outline.filter(point => point.z > bounds.max.z - depth * .2));
  const forward = toe.sub(heel).setY(0).normalize(), across = new THREE.Vector3(forward.z, 0, -forward.x);
  const longitudinal = outline.map(point => point.dot(forward));
  const start = Math.min(...longitudinal), length = Math.max(...longitudinal) - start;
  const index = mesh.geometry.index;
  // Intersect the skinned triangles with transverse planes. Vertex-only bins
  // miss a long sloping forefoot when its only vertices are at either end.
  const section = fraction => {
    const target = start + fraction * length, crossings = [];
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      const vertices = [0, 1, 2].map(offset => points.get(index.getX(triangle + offset)));
      if (vertices.some(point => !point)) continue;
      for (let edge = 0; edge < 3; edge++) {
        const a = vertices[edge], b = vertices[(edge + 1) % 3];
        const alongA = a.dot(forward), alongB = b.dot(forward);
        if ((alongA - target) * (alongB - target) > 0 || Math.abs(alongB - alongA) < 1e-8) continue;
        crossings.push(a.clone().lerp(b, (target - alongA) / (alongB - alongA)));
      }
    }
    assert.ok(crossings.length >= 8, `${side}: no continuous foot cross-section at ${fraction}`);
    const heights = crossings.map(point => point.y - box.min.y), widths = crossings.map(point => point.dot(across));
    const sole = Math.min(...heights), top = Math.max(...heights);
    return { sole, top, thickness: top - sole, width: Math.max(...widths) - Math.min(...widths) };
  };
  return { length, heel: section(.15), ball: section(.7), toes: section(.9) };
}

function assertMaleFootProfile(root, mesh, pose) {
  const regenerated = mesh.userData.higgsfield_source === '2cfdd22a-9ecb-4358-bd50-68d9b0d8cb11';
  for (const side of ['Left', 'Right']) {
    const { length, heel, ball, toes } = footSideProfile(root, mesh, side);
    const label = `${side} ${pose}`;
    // The ball bears weight beside the heel; the toe spring is small. The
    // previous narrow footprint passed width/length checks while its toe sole
    // still climbed above a tenth of the complete foot length.
    for (const [name, contact] of Object.entries({ heel, ball })) {
      assert.ok(contact.sole / length < .045, `${label} ${name}: barefoot contact is raised ${contact.sole / length} foot lengths`);
    }
    assert.ok(toes.sole / length < .06, `${label}: forefoot slopes upward into a wedge (${toes.sole / length} foot lengths)`);
    assert.ok(toes.top / ball.top < .82, `${label}: dorsal foot profile stays thick instead of tapering toward the toes`);
    assert.ok(toes.thickness / length > .05 && toes.thickness / length < (regenerated ? .22 : .17),
      `${label}: toe box is flattened or disproportionately thick`);
    assert.ok(toes.width / ball.width > .6 && toes.width / ball.width <= 1.03,
      `${label}: toe box forms a needle point or widens into a webbed forefoot`);
  }
}

test('male bare feet retain heel, ball and tapered toe-box sections while standing and walking', () => {
  const { root, rig, mesh } = character(OUTFITS.male[3]);
  assertMaleFootProfile(root, mesh, 'standing');
  // Drive the actual leg/ankle mapping through the gait, including swing and
  // stance. The ankle blend must not stretch the new forefoot into a wedge.
  for (let sample = 0; sample < 8; sample++) {
    walkCoastalPose(rig, sample * Math.PI / 4, 1);
    supportCoastalPose(rig, () => 0);
    syncImportedAvatars(root);
    assertMaleFootProfile(root, mesh, `walk phase ${sample}`);
  }
});

test('regenerated male retains actual Higgsfield hand and foot surfaces at bind rest', async () => {
  const fixture = JSON.parse(await readFile('scripts/fixtures/male-higgsfield-anatomy-20261012.json', 'utf8'));
  const { mesh } = character(OUTFITS.male[3]);
  assert.equal(mesh.userData.higgsfield_source, fixture.sourceJob);
  assert.equal(mesh.userData.separateTexture, true);
  assert.equal(mesh.skeleton.bones.length, 64);
  const p = mesh.geometry.getAttribute('position');
  const key = point => point.map(v => Math.round(v * 100000)).join(',');
  const actual = new Set(Array.from({length:p.count}, (_, i) => key([p.getX(i),p.getY(i),p.getZ(i)])));
  for (const [region, points] of Object.entries(fixture.samples)) {
    const retained = points.filter(point => actual.has(key(point))).length;
    assert.ok(retained / points.length > .98, `${region}: generated surface reshaped or replaced (${retained}/${points.length})`);
  }
});

test('wardrobe and water transitions preserve shoulder, wrist, hip, knee and ankle joint proportions', () => {
  const joints = ['Hips', 'neck', 'Head', ...['Left', 'Right'].flatMap(side =>
    ['Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot'].map(part => side + part))];
  for (const [sex, outfits] of Object.entries(OUTFITS)) {
    const { root, rig, mesh } = character(outfits[0]);
    const positions = () => {
      syncImportedAvatars(root);
      return joints.map(name => {
        const bone = mesh.skeleton.bones.find(bone => bone.name === name);
        assert.ok(bone, `${sex}: missing anatomical joint ${name}`);
        return rig.visualRoot.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
      });
    };
    const baseline = positions();
    for (const top of outfits) {
      root.userData.setImportedPalette({ ...PALETTE, top });
      positions().forEach((position, i) => assert.ok(position.distanceTo(baseline[i]) < .00001,
        `${sex} ${top}: ${joints[i]} changed body proportions`));
    }
    root.userData.setImportedPalette({ ...PALETTE, top: outfits[0] });
    root.userData.setImportedSwimwear(true);
    positions().forEach((position, i) => assert.ok(position.distanceTo(baseline[i]) < .00001,
      `${sex}: entering water changed ${joints[i]}`));
  }
});

test('visible arm skin overlaps every sampled tee cuff opening in the dressed outfits', () => {
  for (const [sex, outfits] of Object.entries(OUTFITS)) {
    const { root, mesh } = character(outfits[0]);
    const tee = root.userData.importedAvatar.meshes.find(part => part.userData.componentId === 'garment-tee');
    assert.ok(tee);
    mesh.skeleton.update(); tee.skeleton.update();
    for (const side of ['Left', 'Right']) {
      const at = name => root.worldToLocal(mesh.skeleton.bones.find(bone => bone.name === side + name).getWorldPosition(new THREE.Vector3()));
      const elbow = at('ForeArm'), axis = at('Hand').sub(elbow).normalize();
      const across = axis.clone().cross(new THREE.Vector3(0, 0, 1)).normalize(), normal = axis.clone().cross(across).normalize();
      const bones = new Set(mesh.skeleton.bones.map((bone, index) =>
        bone.name.startsWith(side) && /Arm|Hand/.test(bone.name) ? index : -1).filter(index => index >= 0));
      const points = Array.from({ length: tee.geometry.getAttribute('position').count }, (_, vertex) =>
        root.worldToLocal(tee.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(tee.matrixWorld)));
      // UV seams duplicate vertices. Count geometric edges, otherwise atlas
      // seams would be mistaken for the sleeve's actual open boundary.
      const pointKey = point => point.toArray().map(value => value.toFixed(4)).join(',');
      const edges = new Map(), index = tee.geometry.index;
      for (let i = 0; i < index.count; i += 3) {
        const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        for (let edge = 0; edge < 3; edge++) {
          const a = vertices[edge], b = vertices[(edge + 1) % 3];
          const key = [pointKey(points[a]), pointKey(points[b])].sort().join('|');
          if (edges.has(key)) edges.get(key).count++;
          else edges.set(key, { a, b, count: 1 });
        }
      }
      const sectors = Array.from({ length: 16 }, () => []);
      for (const edge of edges.values()) {
        if (edge.count !== 1 || weightOn(tee, edge.a, bones) <= .25 || weightOn(tee, edge.b, bones) <= .25) continue;
        const relative = points[edge.a].clone().add(points[edge.b]).multiplyScalar(.5).sub(elbow);
        const reach = relative.dot(axis), radial = relative.addScaledVector(axis, -reach);
        if (reach < -.15 || reach > .15 || radial.length() > .22) continue;
        const angle = (Math.atan2(radial.dot(normal), radial.dot(across)) + Math.PI * 2) % (Math.PI * 2);
        sectors[Math.floor(angle / (Math.PI * 2) * sectors.length)].push(reach);
      }
      assert.ok(sectors.filter(sector => sector.length).length >= 10, `${sex} ${side}: sleeve opening was not sampled`);
      const covered = mesh.geometry.getAttribute('_covered');
      for (const [sector, cuff] of sectors.entries()) {
        if (!cuff.length) continue;
        const angle = (sector + .5) / sectors.length * Math.PI * 2;
        const radial = across.clone().multiplyScalar(Math.cos(angle)).addScaledVector(normal, Math.sin(angle));
        // Skin must extend slightly inside the visible cuff, so bending the
        // elbow does not reveal an empty strip between the sleeve and arm.
        const centre = elbow.clone().addScaledVector(axis, Math.max(...cuff) - .01);
        const origin = root.localToWorld(centre.clone().addScaledVector(radial, .4));
        const direction = radial.clone().negate().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
        const hits = new THREE.Raycaster(origin, direction, 0, .8).intersectObject(mesh, false);
        const skin = hits.find(hit => {
          if (!hit.face) return false;
          const point = root.worldToLocal(hit.point.clone());
          if (point.distanceTo(centre) > .22) return false;
          const vertices = [hit.face.a, hit.face.b, hit.face.c];
          if (!vertices.every(vertex => weightOn(mesh, vertex, bones) > .15)) return false;
          const triangle = vertices.map(vertex => mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
          const bary = THREE.Triangle.getBarycoord(hit.point, ...triangle, new THREE.Vector3());
          return bary && vertices.reduce((mask, vertex, i) => mask + covered.getX(vertex) * bary.getComponent(i), 0) <= .5;
        });
        assert.ok(skin, `${sex} ${side} cuff sector ${sector}: outfit mask leaves an exposed gap below sleeve`);
      }
    }
  }
});
