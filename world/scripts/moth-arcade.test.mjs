import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
import { arcadeIsNearest, arcadeGameUrl, externalArcadeRequired, cabinetPairPositions, ARCADE_WIDTH } from '../src/world/ArcadeRules.ts';

globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const b = new DataView(await blob.arrayBuffer());
  return { width: b.getUint32(16), height: b.getUint32(20), close() {} };
};
function element() {
  return { style: {}, listeners: new Map(), contentWindow: { focus() {}, postMessage() {} }, focus() {}, setAttribute() {}, append() {}, remove() {},
    addEventListener(name, fn) { this.listeners.set(name, fn); }, removeEventListener(name) { this.listeners.delete(name); } };
}
globalThis.Element = class { closest() { return null; } };
globalThis.document = { createElement: element, addEventListener() {}, removeEventListener() {} };
const listeners = new Map();
globalThis.window = { addEventListener: (n, f) => listeners.set(n, f), removeEventListener: n => listeners.delete(n) };
const output = await build({ stdin: { contents: "export * from './src/world/MothArcade'; export * as THREE from 'three'; export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; export { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { THREE, MothArcadeSession, arcadeScreenFrame, GLTFLoader, MeshoptDecoder } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

test('arcade and jukebox outer edges centre together below the venue sign', () => {
  const {arcadeZ, jukeboxZ} = cabinetPairPositions(13.5);
  assert.ok(Math.abs((arcadeZ - ARCADE_WIDTH / 2 + jukeboxZ + 1.2) / 2 - 13.5) < 1e-8);
  assert.ok(jukeboxZ - 1.2 - (arcadeZ + ARCADE_WIDTH / 2) > 1);
});

test('E selects the closest cabinet instead of the overlapping jukebox prompt', () => {
  const arcade = { x: 21, z: 13.5 }, jukebox = { x: 21, z: 16.9 };
  assert.equal(arcadeIsNearest({ x: 18, z: 13.5 }, arcade, jukebox), true);
  assert.equal(arcadeIsNearest({ x: 18, z: 16.9 }, arcade, jukebox), false);
  assert.equal(arcadeIsNearest({ x: 15, z: 13.5 }, arcade, jukebox), false);
});
test('mobile and immersive VR use the public game; desktop and hybrid laptops embed it', () => {
  assert.equal(externalArcadeRequired(true, false, false), true);
  assert.equal(externalArcadeRequired(false, true, false), false);
  assert.equal(externalArcadeRequired(true, true, false), false);
  assert.equal(externalArcadeRequired(false, true, true), true);
});
test('every launch fetches the live public game with a fresh entry URL, never a local snapshot', async () => {
  const first = new URL(arcadeGameUrl()), next = new URL(arcadeGameUrl());
  for (const url of [first, next, new URL(arcadeGameUrl(false))]) {
    assert.equal(url.origin, 'https://myscheduleltd.com');
    assert.equal(url.pathname, '/moth/');
    assert.ok(url.searchParams.get('arcadeLaunch'));
  }
  assert.equal(first.searchParams.get('arcade'), '1');
  assert.notEqual(first.href, next.href, 're-entry must not reuse cached entry HTML');
  assert.equal(new URL(arcadeGameUrl(false)).searchParams.has('arcade'), false,
    'mobile and immersive VR keep the standalone public interface');
  const app = await readFile('src/ui/App.ts', 'utf8');
  assert.match(app, /startArcadeGame\(arcadeGameUrl\(\)/);
  assert.match(app, /openLinkAndLeaveVr\(arcadeGameUrl\(false\)/);
  const config = await readFile('vite.config.ts', 'utf8');
  assert.doesNotMatch(config, /localMothPreview/, 'the preview server must not serve a stale bundled public game');
});
test('polished GLB keeps its budgets, clean orange surfaces, outward artwork and the exact live screen', async () => {
  const bytes = await readFile('src/assets/venue-scenery/moth-arcade.glb');
  assert.ok(bytes.length < 2 * 1024 * 1024, 'cabinet must stay below 2 MiB');
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const screens = meshes.filter(o => o.userData.arcadeScreen);
  assert.equal(screens.length, 1, 'only the independent CRT surface can host the game');
  const screen = screens[0], artwork = meshes.filter(o => o.userData.cabinetRole === 'artwork');
  assert.ok(artwork.length > 0, 'keep the authored M.O.T.H artwork');
  let generatedBody; gltf.scene.traverse(o => { if (o.userData.higgsfieldJob) generatedBody = o; });
  assert.equal(generatedBody?.userData.higgsfieldJob, 'e62abde6-2233-41ae-89f8-e974a9de6c16');
  assert.ok(meshes.reduce((sum,o) => sum + o.geometry.index.count / 3, 0) < 12000);
  const roles = new Set(meshes.map(o => o.userData.cabinetRole).filter(Boolean));
  for (const role of ['shell', 'controls', 'trim', 'lettering', 'artwork', 'hardware', 'marquee', 'print']) {
    assert.ok(roles.has(role), `missing the cabinet's ${role} geometry`);
  }
  const groupedMaterials = new Set();
  for (const o of meshes.filter(o => o !== screen && !o.userData.cabinetRefinement)) {
    const key = `${o.userData.cabinetRole}:${o.material.uuid}`;
    assert.equal(groupedMaterials.has(key), false, 'small components must share one mesh per material and role');
    groupedMaterials.add(key);
  }
  const textured = meshes.filter(o => o.material.map);
  assert.deepEqual(textured, artwork, 'only the artwork may use an image; shell and controls must stay clean');
  assert.equal(new Set(artwork.map(o => o.material.map)).size, 1, 'all artwork must share one texture');
  for (const o of artwork) {
    assert.equal(o.material.map.image.width, 1024); assert.equal(o.material.map.image.height, 1536);
    assert.ok(o.material.alphaTest >= .89, 'the print must mask its transparent background');
    assert.equal(o.material.transparent, false, 'alpha-masked artwork must avoid translucent sorting');
    assert.equal(o.material.side, THREE.FrontSide, 'outward prints must cull their back faces');
  }
  const enamel = meshes.find(o => o.userData.cabinetRole === 'shell' && /orange enamel/.test(o.material.name))?.material;
  assert.ok(enamel, 'closed shell must use the M.O.T.H orange enamel');
  assert.equal(enamel.color.getHex(THREE.SRGBColorSpace), 0xff5c21);
  assert.equal(enamel.map, null); assert.equal(enamel.metalness, 0);
  assert.ok(meshes.some(o => o.userData.cabinetRole === 'controls' && o.material === enamel), 'the control deck must match the shell enamel');

  gltf.scene.updateMatrixWorld(true);
  const checkedFaces = { left: 0, right: 0, marquee: 0 };
  for (const o of artwork) {
    const position = o.geometry.getAttribute('position'), normal = o.geometry.getAttribute('normal');
    const matrix = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    const expectedNormal = point => Math.abs(point.x) > .44
      ? new THREE.Vector3(Math.sign(point.x), 0, 0) : new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      const n = new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(matrix);
      assert.ok(n.dot(expectedNormal(point)) > .99999, 'artwork normals must face out of the cabinet');
    }
    const indices = o.geometry.index;
    for (let i = 0; i < indices.count; i += 3) {
      const corners = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(position, indices.getX(i + j)).applyMatrix4(o.matrixWorld));
      const centre = corners.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / 3);
      const faceNormal = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0])).normalize();
      assert.ok(faceNormal.dot(expectedNormal(centre)) > .99999, 'triangle winding must keep alpha-masked prints visible from outside');
      checkedFaces[Math.abs(centre.x) > .44 ? (centre.x < 0 ? 'left' : 'right') : 'marquee']++;
    }
  }
  assert.ok(checkedFaces.left > 0 && checkedFaces.right > 0 && checkedFaces.marquee > 0, 'artwork must remain visible on both sides and the marquee');
  const cleanTrim = meshes.filter(o => o.userData.cabinetRefinement);
  assert.equal(cleanTrim.length, 7, 'keep the accepted bezel layers, both protective rails, and marquee shelf');
  for (const o of cleanTrim) {
    assert.equal(o.material.map, null, 'clean trim must not inherit the streaked generated atlas');
    assert.equal(o.material.metalness, 0);
  }
  screen.geometry.computeBoundingBox(); const size = screen.geometry.boundingBox.getSize(new THREE.Vector3());
  assert.equal(screen.geometry.getAttribute('position').count, 4); assert.equal(screen.geometry.index.count, 6);
  assert.ok(Math.abs(size.x - .6679390072822571) < 1e-7 && Math.abs(size.y - .5574392080307007) < 1e-7 && size.z < 1e-7,
    'the independent screen must retain the accepted local XY dimensions');
  const frame = arcadeScreenFrame(screen);
  assert.ok(frame.centre.distanceTo(new THREE.Vector3(-.0008604973554611206, .28872355818748474, .10049180686473846)) < 1e-7,
    'screen centre must retain the accepted cabinet position');
  const acceptedQuaternion = [-.09122224897146225, 0, 0, .9958305358886719];
  assert.ok(frame.quaternion.toArray().every((value, i) => Math.abs(value - acceptedQuaternion[i]) < 1e-7),
    'screen orientation must retain the accepted cabinet tilt');
  assert.ok(frame.normal.z > .98 && frame.normal.y > .15, 'screen must face the viewer with the cabinet tilt');
});
test('the live frame fits the mesh and accepts exit only from its own origin and window', () => {
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1)); screen.position.set(2, 3, 4);
  screen.rotation.y = -.4; screen.scale.setScalar(2); let exits = 0;
  const session = new MothArcadeSession(screen, 'https://myscheduleltd.com/moth/?arcade=1', () => exits++);
  assert.equal(session.iframe.src, 'https://myscheduleltd.com/moth/?arcade=1');
  assert.ok(session.object.position.distanceTo(session.frame.centre) < .004);
  assert.ok(Math.abs(session.frame.width - 2.4) < 1e-6); assert.equal(session.frame.height, 2);
  const camera = new THREE.PerspectiveCamera(50, 16/9, .1, 100);
  camera.position.copy(session.frame.centre).addScaledVector(session.frame.normal, 4); camera.lookAt(session.frame.centre); camera.updateMatrixWorld(true);
  const box = session.scissor(camera, 1280, 720); assert.ok(box && box.width > 200 && box.height > 200);
  const host=element();let mounted;host.append=node=>{mounted=node;};session.mount(host);session.renderScreen(box,720);
  assert.equal(mounted,session.object.element);assert.equal(mounted.style.transformOrigin,'0 0');
  assert.equal(mounted.style.transform,`translate(${box.x}px, ${720-box.y-box.height}px) scale(${box.width/1024}, ${box.height/853})`);
  const message = listeners.get('message'), source = session.iframe.contentWindow;
  const posted = []; source.postMessage = (...args) => posted.push(args);
  let focused = 0; session.iframe.focus = () => focused++;
  const key = { type: 'keydown', code: 'KeyD', key: 'd', repeat: false, target: new Element(),
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  listeners.get('keydown')(key);
  assert.equal(key.prevented, true); assert.equal(key.stopped, true); assert.equal(focused, 1);
  assert.deepEqual(posted[0], [{ type: 'moth-arcade-key', eventType: 'keydown', code: 'KeyD', key: 'd', repeat: false, shiftKey: undefined }, session.origin]);
  const exitButton = new Element(); exitButton.closest = () => exitButton;
  listeners.get('keydown')({ ...key, code: 'Enter', target: exitButton });
  listeners.get('keydown')({ ...key, code: 'KeyD', ctrlKey: true });
  listeners.get('keydown')({ ...key, code: 'Escape' });
  assert.equal(posted.length, 1, 'Exit button, browser shortcuts and Escape are not game input');
  listeners.get('keyup')({ ...key, type: 'keyup', target: exitButton });
  assert.equal(posted[1][0].eventType, 'keyup', 'release reaches the game even after focus moves');
  const focusBeforeSpace = focused, messagesBeforeSpace = posted.length;
  const buttonSpace = type => ({ ...key, type, code: 'Space', key: ' ', target: exitButton, prevented: false, stopped: false });
  const spaceDown = buttonSpace('keydown'), spaceUp = buttonSpace('keyup');
  listeners.get('keydown')(spaceDown); listeners.get('keyup')(spaceUp);
  assert.equal(spaceDown.prevented, false); assert.equal(spaceUp.prevented, false,
    'Space release must retain the browser default that activates the Exit button');
  assert.equal(spaceDown.stopped, false); assert.equal(spaceUp.stopped, false,
    'the Exit button must receive both native Space events');
  assert.equal(focused, focusBeforeSpace, 'Space release must leave keyboard focus on the Exit button');
  assert.equal(posted.length, messagesBeforeSpace + 1, 'only the release is sent to the game');
  assert.equal(posted.at(-1)[0].eventType, 'keyup'); assert.equal(posted.at(-1)[0].code, 'Space');
  const focusBeforePointer = focused;
  listeners.get('pointerup')({ target: new Element() });
  assert.equal(focused, focusBeforePointer + 1, 'a surround click restores native focus before the next key even without a child bridge');
  listeners.get('pointerup')({ target: exitButton });
  assert.equal(focused, focusBeforePointer + 1, 'Exit clicks keep their native target');
  const focusBeforeReady = focused;
  message({ source: {}, origin: session.origin, data: { type: 'moth-arcade-ready' } });
  message({ source, origin: 'https://example.com', data: { type: 'moth-arcade-ready' } });
  assert.equal(focused, focusBeforeReady, 'unrelated ready messages cannot steal keyboard focus');
  message({ source, origin: session.origin, data: { type: 'moth-arcade-ready' } });
  assert.equal(focused, focusBeforeReady + 1, 'the loaded game receives focus again at its ready handshake');
  message({ source: {}, origin: session.origin, data: { type: 'moth-arcade-exit' } });
  message({ source, origin: 'https://example.com', data: { type: 'moth-arcade-exit' } });
  assert.equal(exits, 0);
  message({ source, origin: session.origin, data: { type: 'moth-arcade-exit' } }); assert.equal(exits, 1);
  session.dispose(); assert.equal(listeners.has('message'), false); assert.equal(session.iframe.src, 'about:blank');
  assert.equal(session.iframe.listeners.has('load'), false);
  assert.equal(listeners.has('keydown'), false); assert.equal(listeners.has('keyup'), false);
  assert.equal(listeners.has('pointerup'), false);
  assert.equal(posted.at(-1)[0].type, 'moth-arcade-release');
});

const bridge = await readFile('../scripts/moth-arcade-embed.js', 'utf8');
function bridgeFixture(referrer, child = 'http://127.0.0.1:4173/moth/?arcade=1', top = false, nativeInput = () => {}) {
  const handlers = new Map(), messages = [], document = { referrer, documentElement: { dataset: {} } };
  class KeyboardEvent {
    constructor(type, init) { Object.assign(this, { type, repeat: false, key: '' }, init); }
    preventDefault() { this.defaultPrevented = true; }
    stopImmediatePropagation() { this.stopped = true; }
  }
  const window = { location: new URL(child), addEventListener: (n, f) => handlers.set(n, f),
    dispatchEvent(event) { handlers.get(event.type)?.(event); if (!event.stopped) nativeInput(event); } };
  window.parent = top ? window : { postMessage: (...args) => messages.push(args) };
  runInNewContext(bridge, { window, document, URL, URLSearchParams, KeyboardEvent });
  return { handlers, messages, document, window, KeyboardEvent };
}
test('public embed bridge leaves native keys and standalone/staff games alone', () => {
  for (const f of [bridgeFixture('https://evil.test/'), bridgeFixture('http://127.0.0.1:4173/', undefined, true), bridgeFixture('http://127.0.0.1:4173/', 'http://127.0.0.1:4173/moth/')]) {
    assert.equal(f.handlers.size, 0); assert.deepEqual(f.document.documentElement.dataset, {});
  }
  const f = bridgeFixture('http://127.0.0.1:4173/'); assert.equal(f.document.documentElement.dataset.arcadePlay, 'true');
  let handled = 0; f.handlers.get('keydown')({ code: 'KeyE', preventDefault() { handled++; }, stopImmediatePropagation() { handled++; } });
  assert.equal(handled, 0); assert.equal(f.messages.length, 0);
  f.handlers.get('keydown')({ code: 'Escape', preventDefault() { handled++; }, stopImmediatePropagation() { handled++; } });
  assert.equal(handled, 2); assert.equal(f.messages[0][1], 'http://127.0.0.1:4173'); assert.equal(f.messages[0][0].type, 'moth-arcade-exit');
});
test('trusted focus recovery reaches the real game movement handlers once and releases held inputs', async () => {
  const gameSource = await readFile('../docs/moth/src/game.js', 'utf8');
  const tree = ts.createSourceFile('game.js', gameSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let input;
  function find(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(tree) === 'bindInput') input = node;
    else ts.forEachChild(node, find);
  }
  find(tree); assert.ok(input);
  const handlers = {};
  for (const statement of input.body.statements) {
    const call = statement.expression;
    if (!call || !ts.isCallExpression(call) || call.expression.getText(tree) !== 'window.addEventListener'
      || !ts.isStringLiteral(call.arguments[0]) || !['keydown', 'keyup'].includes(call.arguments[0].text)
      || !ts.isArrowFunction(call.arguments[1])) continue;
    handlers[call.arguments[0].text] = runInNewContext(`(function(event) { return (${call.arguments[1].getText(tree)})(event); })`, {
      movementKeys: ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'], hotbarKeys: [], rhythmKeys: ['KeyH', 'KeyT', 'KeyM', 'KeyO'],
    });
  }
  // Use the public game's actual listener bodies, without exporting its private
  // instance or replacing them with a transport-shaped fake implementation.
  const game = {
    state: 'playing', keys: new Set(), attacks: 0, getControlMode: () => 'action',
    audioRecoveryVisible: () => false, isDebugPanelElement: () => false, scrollDialogue: () => false,
    handleWalkPauseKey: () => false, canPauseLevel1Office: () => false,
    noteTutorialMovement() {}, isLevel1ActionState: () => false, isSewerActionState: () => false,
    tryPlayerPrimaryAttack() { this.attacks++; },
  };
  let deliveries = 0;
  const f = bridgeFixture('http://127.0.0.1:4173/', undefined, false, event => {
    deliveries++; handlers[event.type]?.call(game, event);
  });
  const send = (data, source = f.window.parent, origin = 'http://127.0.0.1:4173') => f.handlers.get('message')({ data, source, origin });
  const down = { type: 'moth-arcade-key', eventType: 'keydown', code: 'KeyD', key: 'd' };
  send(down, {}); send(down, f.window.parent, 'https://evil.test');
  send({ ...down, code: 'Escape' }); send({ ...down, eventType: 'click' });
  assert.equal(deliveries, 0, 'only valid input from the parent window and origin is accepted');
  send(down); assert.equal(game.keys.has('KeyD'), true); assert.equal(deliveries, 1);
  send({ type: 'moth-arcade-key', eventType: 'keydown', code: 'KeyH', key: 'h' });
  assert.equal(game.attacks, 1); assert.equal(game.shootHeld, true);
  send({ type: 'moth-arcade-release' });
  assert.equal(game.keys.size, 0); assert.equal(game.shootHeld, false);
  const before = deliveries;
  f.window.dispatchEvent(new f.KeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));
  assert.equal(deliveries, before + 1, 'native in-frame keys are handled once without being reposted');
  assert.equal(f.messages.length, 0, 'ordinary keys stay inside the frame');
  f.window.dispatchEvent(new f.KeyboardEvent('keyup', { code: 'KeyD' }));
  assert.equal(game.keys.size, 0);
});
test('public scripts retain valid SRI and desktop override without exposing game state or changing saved device mode', async () => {
  const html = await readFile('../docs/moth/index.html', 'utf8'), game = await readFile('../docs/moth/src/game.js', 'utf8');
  for (const [, src, hash] of html.matchAll(/<script src="([^"]+)"[^>]*integrity="([^"]+)"/g)) {
    const content = await readFile('../docs/moth/' + src.split('?')[0].replace(/^\.\//, ''));
    assert.equal(hash, 'sha384-' + createHash('sha384').update(content).digest('base64'));
  }
  assert.match(game, /loadDeviceModePreference\(\) \{\s*if \(document.documentElement.dataset.arcadePlay === "true"\) return "desktop";/);
  assert.doesNotMatch(game, /window\.bobbyGame|createDebugPanel|data-debug-action/);
  const staff = await readFile('../docs/moth/staff/index.html', 'utf8'); assert.doesNotMatch(staff, /arcade-embed/);
});
