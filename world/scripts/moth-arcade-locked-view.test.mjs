import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';

// The locked view must not even allocate an iframe or install game listeners.
// Keep the actual Three projection and session; count their browser effects.
let elements = [], events = [];
function element(tag) {
  elements.push(tag);
  return { style: {}, contentWindow: { postMessage() {}, focus() {} },
    setAttribute() {}, append() {}, remove() {}, focus() {},
    addEventListener() {}, removeEventListener() {} };
}
globalThis.document = { createElement: element, addEventListener: name => events.push(name), removeEventListener() {} };
globalThis.window = { addEventListener: name => events.push(name), removeEventListener() {} };
const bundle = await build({
  stdin: { contents: "export { MothArcadeView, MothArcadeSession } from './src/world/MothArcade'; export * as THREE from 'three'; export { PLANET, planetBendPoint } from './src/world/PlanetCurve';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { MothArcadeView, MothArcadeSession, THREE, PLANET, planetBendPoint } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function screen() {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 1.116));
  mesh.position.set(20.32, 2.48, 11.65);
  mesh.rotation.order = 'YXZ'; mesh.rotation.set(-.183, -Math.PI / 2, 0);
  return mesh;
}
function physicalPoint(frame, camera, width, height, u, v) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(frame.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(frame.quaternion);
  const point = frame.centre.clone().addScaledVector(right, (u - .5) * frame.width).addScaledVector(up, (.5 - v) * frame.height);
  if (PLANET.on) planetBendPoint(point, point);
  point.project(camera);
  return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
}
function near(actual, expected) {
  assert.ok(actual && Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-7);
}

test('locked CRT projection needs no browser element, listener, iframe or game URL', () => {
  elements = []; events = [];
  const locked = new MothArcadeView(screen());
  assert.deepEqual(elements, []); assert.deepEqual(events, []);
  assert.equal('iframe' in locked, false); assert.equal('object' in locked, false);
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, .1, 100);
  camera.position.copy(locked.frame.centre).add(new THREE.Vector3(-1.8, 0, 0));
  camera.lookAt(locked.frame.centre); camera.updateMatrixWorld(true);
  assert.ok(locked.scissor(camera, 1280, 720));
  assert.ok(locked.projectedScreenPoint(.5, .915));
  locked.dispose(); locked.dispose();
  assert.equal(locked.projectedScreenPoint(.5, .915), undefined);
  assert.equal(locked.scissor(camera, 1280, 720), undefined);
  assert.deepEqual(elements, []); assert.deepEqual(events, []);
});

test('locked Exit anchor and live iframe use identical physical-screen projection after resize and planet bending', () => {
  const mesh = screen(), locked = new MothArcadeView(mesh);
  const live = new MothArcadeSession(mesh, 'https://myscheduleltd.com/moth/?arcade=1', () => {});
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, .1, 100);
  camera.position.copy(locked.frame.centre).add(new THREE.Vector3(-1.8, 0, 0));
  camera.lookAt(locked.frame.centre); camera.updateMatrixWorld(true);
  const old = { on: PLANET.on, radius: PLANET.radius, centre: PLANET.centre.value.clone() };
  try {
    PLANET.on = true; PLANET.radius = 320; PLANET.centre.value.set(17.42, 0, 13.0025);
    for (const [width, height] of [[1280, 720], [2808, 1476], [1024, 480], [768, 1024]]) {
      camera.aspect = width / height; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      const box = locked.scissor(camera, width, height);
      assert.ok(box); assert.deepEqual(box, live.scissor(camera, width, height));
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1], [.5, .915]]) {
        const physical = physicalPoint(locked.frame, camera, width, height, u, v);
        const projected = locked.projectedScreenPoint(u, v);
        // The projected DOM uses one flat homography; planet bending is slightly
        // curved inside the four corners. Its control remains within a pixel.
        if (u === .5) assert.ok(Math.hypot(projected.x - physical.x, projected.y - physical.y) < 1);
        else near(projected, physical);
        near(locked.projectedScreenPoint(u, v), live.projectedScreenPoint(u, v));
      }
    }
    assert.equal(locked.scissor(camera, 0, 720), undefined);
    assert.equal(locked.projectedScreenPoint(.5, .915), undefined, 'invalid frames must discard stale Exit placement');
  } finally {
    PLANET.on = old.on; PLANET.radius = old.radius; PLANET.centre.value.copy(old.centre);
    locked.dispose(); live.dispose();
  }
});

// Execute the production world methods with actual camera/view/session classes.
// Other game systems remain absent so an overlooked locked-view guard fails.
const source = await readFile('src/world/FestivalWorld.ts', 'utf8');
const tree = ts.createSourceFile('FestivalWorld.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const worldClass = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'FestivalWorld');
const names = new Set(['startArcadeLockedView', 'startArcadeGame', 'beginArcadeView', 'stopArcadeGame', 'setArcadeLocked',
  'updateCamera', 'updatePlayer', 'setMovementVector', 'updateGamepad', 'interact', 'keyDown', 'cameraPointerDown',
  'applyLookDelta', 'cameraWheel', 'interactionLabel', 'nearArcade']);
const members = worldClass.members.filter(node => node.name && names.has(node.name.getText(tree)));
assert.equal(members.length, names.size);
const code = ts.transpileModule(`class WorldLockedViewFixture { ${members.map(node => node.getText(tree)).join('\n')} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText + '\nWorldLockedViewFixture;';
const World = runInNewContext(code, { THREE, MothArcadeView, MothArcadeSession });
function worldFixture() {
  const world = new World();
  world.arcadeLocked = true;
  world.arcadeCabinet = { screen: screen(), status: 'ready', setLocked() {} };
  world.keys = new Set(['w']); world.running = true; world.dancing = true;
  world.stickX = .5; world.stickY = -.8; world.moveVector = new THREE.Vector3(1, 0, 2);
  world.player = new THREE.Group(); world.player.position.set(17, 0, 12);
  world.camera = new THREE.PerspectiveCamera(58, 16 / 9, .1, 100);
  const parent = new THREE.Group(); parent.position.set(17, .28, 12); parent.rotation.y = .7;
  parent.add(world.camera); parent.updateMatrixWorld(true);
  world.xrActive = false; world.xrSimulated = false; world.conservesMobileGpu = false;
  world.cameraPointerReset = () => { world.pointerResets = (world.pointerResets || 0) + 1; };
  world.cssRenderer = { domElement: { append() {} } };
  world.xrHud = { setVisible: value => { world.hudVisible = value; } };
  return world;
}

test('desktop locked entry captures world controls, hides the visitor, and cannot create a live session', () => {
  const world = worldFixture(); elements = []; events = [];
  const layout = () => {};
  assert.equal(world.startArcadeLockedView(() => {}, layout), true);
  assert.ok(world.arcadeView instanceof MothArcadeView);
  assert.equal(world.arcadeSession, undefined); assert.equal(world.arcadeAperture, undefined);
  assert.equal(world.arcadeScreenLayout, layout);
  assert.equal(world.keys.size, 0); assert.equal(world.running, false); assert.equal(world.dancing, false);
  assert.equal(world.stickX, 0); assert.equal(world.stickY, 0); assert.equal(world.player.visible, false);
  assert.equal(world.hudVisible, false); assert.equal(world.pointerResets, 1);
  assert.deepEqual(elements, []); assert.deepEqual(events, []);
  assert.equal(world.startArcadeLockedView(() => {}), false, 'repeated E must not stack the close-up');
  assert.equal(world.startArcadeGame('must-not-load', () => {}), false);
  assert.deepEqual(elements, []); assert.deepEqual(events, []);
  world.stopArcadeGame();
  assert.equal(world.arcadeView, undefined); assert.equal(world.arcadeScreenLayout, undefined);
  assert.equal(world.player.visible, true); assert.equal(world.keys.size, 0);
  world.setMovementVector(.6, -.3);
  assert.equal(world.stickX, .6); assert.equal(world.stickY, -.3, 'exit releases movement capture');
});

test('release handover keeps the same level camera endpoint and switches only the screen content', () => {
  const world = worldFixture();
  assert.equal(world.startArcadeLockedView(() => {}), true);
  world.updateCamera(1 / 60, 1); world.camera.updateWorldMatrix(true, false);
  const position = world.camera.getWorldPosition(new THREE.Vector3());
  const quaternion = world.camera.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(Math.abs(position.y - world.arcadeView.frame.centre.y) < 1e-9, 'screen tilt must not pitch the view or lean the jukebox');
  const locked = world.arcadeView;
  world.setArcadeLocked(false, 'en'); world.stopArcadeGame();
  assert.equal(locked.projectedScreenPoint(.5, .915), undefined);
  assert.equal(world.startArcadeGame('https://myscheduleltd.com/moth/?arcade=1', () => {}), true);
  assert.equal(world.arcadeView, world.arcadeSession);
  world.updateCamera(1 / 60, 2); world.camera.updateWorldMatrix(true, false);
  assert.ok(position.distanceTo(world.camera.getWorldPosition(new THREE.Vector3())) < 1e-9);
  assert.ok(quaternion.angleTo(world.camera.getWorldQuaternion(new THREE.Quaternion())) < 1e-7);
  world.stopArcadeGame(); assert.equal(world.arcadeSession, undefined);
});

test('keyboard, gamepad, orbit, wheel, interaction and player updates cannot move the locked view', () => {
  const world = worldFixture(); world.startArcadeLockedView(() => {});
  const position = world.player.position.clone(); let polled = 0;
  world.gamepad = { poll: () => { polled++; return { axes: [1, 1] }; } };
  world.keys.add('w'); world.moveVector.set(3, 0, -1); world.stickX = .9; world.stickY = -.9;
  world.keyDown({ key: 'w', shiftKey: true });
  world.cameraPointerDown({ button: 0 }); world.applyLookDelta(300, -100); world.cameraWheel({ deltaY: -300 });
  world.interact(); world.updateGamepad(1 / 60); world.updatePlayer(1 / 60);
  assert.equal(polled, 1); assert.equal(world.keys.size, 0);
  assert.equal(world.moveVector.lengthSq(), 0); assert.equal(world.stickX, 0); assert.equal(world.stickY, 0);
  assert.ok(position.equals(world.player.position)); assert.equal(world.player.visible, false);
  assert.equal(world.interactionLabel(), undefined); assert.equal(world.promptActionable, false);
  assert.equal(world.nearArcade(), false);
  world.stopArcadeGame();
});

test('unlocked cabinets, missing CRTs and immersive VR cannot enter the locked desktop view', () => {
  const world = worldFixture();
  world.arcadeLocked = false; assert.equal(world.startArcadeLockedView(() => {}), false);
  world.arcadeLocked = true; world.xrActive = true; assert.equal(world.startArcadeLockedView(() => {}), false);
  world.xrActive = false; world.arcadeCabinet.screen = undefined;
  assert.equal(world.startArcadeLockedView(() => {}), false);
  assert.equal(world.arcadeView, undefined);
});
