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
const output = await build({ stdin: { contents: "export * from './src/world/MothArcade'; export * as THREE from 'three'; export { PLANET, planetBendPoint } from './src/world/PlanetCurve'; export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; export { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { THREE, MothArcadeSession, arcadeScreenFrame, arcadeQuadTransform, PLANET, planetBendPoint, GLTFLoader, MeshoptDecoder } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

function cssPoint(matrix, x, y) {
  const w = matrix[3] * x + matrix[7] * y + matrix[15];
  return { x: (matrix[0] * x + matrix[4] * y + matrix[12]) / w, y: (matrix[1] * x + matrix[5] * y + matrix[13]) / w };
}
function cssMatrix(session) { return session.object.element.style.transform.slice(9, -1).split(',').map(Number); }
function physicalPoint(frame, camera, width, height, u, v) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(frame.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(frame.quaternion);
  const p = frame.centre.clone().addScaledVector(right, (u - .5) * frame.width).addScaledVector(up, (.5 - v) * frame.height);
  if (PLANET.on) planetBendPoint(p, p);
  p.project(camera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 };
}
function nearPoint(actual, expected, tolerance = 1e-7) {
  assert.ok(actual && Math.hypot(actual.x - expected.x, actual.y - expected.y) < tolerance,
    `projected point ${JSON.stringify(actual)} must match ${JSON.stringify(expected)}`);
}

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
  assert.match(mounted.style.transform,/^matrix3d\(/); assert.equal(mounted.style.visibility,'visible');
  for (const [u,v] of [[0,0],[1,0],[1,1],[0,1]]) {
    nearPoint(cssPoint(cssMatrix(session),u*1024,v*853),physicalPoint(session.frame,camera,1280,720,u,v));
  }
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

test('a single DOM homography follows all four corners of a level-camera tilted monitor after resize', () => {
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.34,1.116));
  screen.position.set(20.32,2.48,11.65);screen.rotation.order='YXZ';screen.rotation.set(-.183,-Math.PI/2,0);
  const session = new MothArcadeSession(screen,'https://myscheduleltd.com/moth/?arcade=1',()=>{});
  const camera = new THREE.PerspectiveCamera(58,16/9,.1,100),parent=new THREE.Group();
  parent.position.set(17,.28,12);parent.rotation.y=.7;parent.add(camera);parent.updateMatrixWorld(true);
  const normal = session.frame.normal.clone();normal.y=0;normal.normalize();
  const position=session.frame.centre.clone().addScaledVector(normal,1.42);
  camera.position.copy(position).applyMatrix4(parent.matrixWorld.clone().invert());camera.lookAt(session.frame.centre);
  camera.updateWorldMatrix(true,false);
  const sourceHeight=Math.round(1024*session.frame.height/session.frame.width);
  let previous;
  for(const [width,height] of [[1280,720],[2808,1476],[1024,480],[390,680]]) {
    camera.aspect=width/height;camera.updateProjectionMatrix();camera.updateWorldMatrix(true,false);
    const box=session.scissor(camera,width,height);assert.ok(box);session.renderScreen(box,height);
    const matrix=cssMatrix(session);assert.ok(matrix.every(Number.isFinite));
    assert.notDeepEqual(matrix,previous,'viewport resizing must recompute the screen transform');previous=matrix;
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1],[.5,.915]]) {
      const expected=physicalPoint(session.frame,camera,width,height,u,v);
      nearPoint(cssPoint(matrix,u*1024,v*sourceHeight),expected);
      nearPoint(session.projectedScreenPoint(u,v),expected);
    }
    const tl=physicalPoint(session.frame,camera,width,height,0,0),tr=physicalPoint(session.frame,camera,width,height,1,0);
    const bl=physicalPoint(session.frame,camera,width,height,0,1),br=physicalPoint(session.frame,camera,width,height,1,1);
    assert.ok(Math.abs((tr.x-tl.x)-(br.x-bl.x))>1,'the live DOM must retain the real screen trapezoid, not expand to its bounding rectangle');
  }
  assert.equal(session.projectedScreenPoint(NaN,.5),undefined);assert.equal(session.projectedScreenPoint(-.1,.5),undefined);
  session.dispose();assert.equal(session.projectedScreenPoint(.5,.915),undefined);
});

test('screen corners include the island projection and invalid views hide stale iframe placement', () => {
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.34,1.116));
  screen.position.set(20.32,2.48,11.65);screen.rotation.order='YXZ';screen.rotation.set(-.183,-Math.PI/2,0);
  const session=new MothArcadeSession(screen,'https://myscheduleltd.com/moth/?arcade=1',()=>{});
  const camera=new THREE.PerspectiveCamera(58,16/9,.1,100);camera.position.set(18.9,2.48,11.65);camera.lookAt(screen.position);camera.updateMatrixWorld(true);
  const previous={on:PLANET.on,radius:PLANET.radius,centre:PLANET.centre.value.clone()};
  try {
    PLANET.on=true;PLANET.radius=320;PLANET.centre.value.set(17.42,0,13.0025);
    const box=session.scissor(camera,1280,720);assert.ok(box);session.renderScreen(box,720);
    const sourceHeight=Math.round(1024*session.frame.height/session.frame.width);
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]) {
      nearPoint(cssPoint(cssMatrix(session),u*1024,v*sourceHeight),physicalPoint(session.frame,camera,1280,720,u,v));
    }
    camera.lookAt(new THREE.Vector3(15,2.48,11.65));camera.updateMatrixWorld(true);
    assert.equal(session.scissor(camera,1280,720),undefined);
    assert.equal(session.object.element.style.visibility,'hidden');assert.equal(session.projectedScreenPoint(.5,.915),undefined);
    session.renderScreen(box,720);assert.equal(session.object.element.style.visibility,'hidden','a previous scissor must not revive a now-invalid projection');
    assert.equal(session.scissor(camera,0,720),undefined);assert.equal(session.scissor(camera,1280,NaN),undefined);
  } finally {PLANET.on=previous.on;PLANET.radius=previous.radius;PLANET.centre.value.copy(previous.centre);session.dispose();}
});

test('screen homography rejects collapsed, folded and nonfinite surfaces instead of producing a broken clickable transform', () => {
  const quad=[{x:50,y:30},{x:380,y:40},{x:420,y:260},{x:20,y:250}];
  const matrix=arcadeQuadTransform(quad,1024,853);assert.ok(matrix);
  for(const [i,x,y] of [[0,0,0],[1,1024,0],[2,1024,853],[3,0,853]])nearPoint(cssPoint(matrix,x,y),quad[i]);
  for(const points of [quad.slice(0,3),[quad[0],quad[2],quad[1],quad[3]],quad.map(p=>({x:p.x,y:30})),quad.map(p=>({x:p.x,y:Infinity}))]) {
    assert.equal(arcadeQuadTransform(points,1024,853),undefined);
  }
  for(const [width,height] of [[0,853],[1024,0],[NaN,853],[1024,Infinity]])assert.equal(arcadeQuadTransform(quad,width,height),undefined);
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

// Exercise the actual App lifecycle methods. Keep their network/audio callers
// stubbed, while retaining the DOM parentage and asynchronous browser results
// that can otherwise reload a live iframe or strand controls in its wrapper.
const appSource = await readFile('src/ui/App.ts', 'utf8');
const appTree = ts.createSourceFile('App.ts', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const appClass = appTree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'App');
assert.ok(appClass);
const arcadeMethodNames = new Set([
  'closeArcadeGame', 'toggleArcadeFullscreen', 'syncArcadeFullscreenState', 'leaveArcadeOnEscape',
  'fullscreenElement', 'screenOwnsFullscreen', 'requestScreenFullscreen', 'exitScreenFullscreen',
]);
const arcadeMethods = appClass.members.filter(node => node.name && arcadeMethodNames.has(node.name.getText(appTree)));
assert.equal(arcadeMethods.length, arcadeMethodNames.size);
const arcadeAppCode = ts.transpileModule(`class ArcadeAppFixture { ${arcadeMethods.map(node => node.getText(appTree)).join('\n')} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText + '\nArcadeAppFixture;';

class ArcadeElement {
  constructor(selector) { this.selector = selector; this.children = []; this.attributes = new Map(); this.dataset = {}; this.style = {}; this.hidden = false; this.moves = 0; }
  get isConnected() { return this.connectedRoot || Boolean(this.parentElement?.isConnected); }
  append(node) {
    node.remove(); node.parentElement = this; this.children.push(node); node.moves++;
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children; siblings.splice(siblings.indexOf(this), 1); this.parentElement = null;
  }
  querySelector(selector) {
    for (const node of this.children) {
      if (node.selector === selector) return node;
      const nested = node.querySelector(selector); if (nested) return nested;
    }
    return null;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
}

function fullscreenAppFixture() {
  const root = new ArcadeElement('root'); root.connectedRoot = true;
  const shell = new ArcadeElement('.world-shell'), css = new ArcadeElement('#world-css3d');
  const screen = new ArcadeElement('.moth-arcade-screen'), iframe = new ArcadeElement('iframe');
  const hud = new ArcadeElement('#moth-arcade-hud'), button = new ArcadeElement('[data-arcade-fullscreen]');
  const exit = new ArcadeElement('[data-arcade-exit]');
  root.append(shell); shell.append(css); css.append(screen); screen.append(iframe); shell.append(hud); hud.append(exit); hud.append(button);
  iframe.src = 'https://myscheduleltd.com/moth/?arcade=1&arcadeLaunch=preserve-state'; iframe.contentWindow = {};
  shell.dataset.arcadePlaying = 'true';
  const document = { fullscreenElement: null, activeElement: null };
  const App = runInNewContext(arcadeAppCode, { document, HTMLElement: ArcadeElement });
  const app = new App(); app.root = root; app.arcadePlaying = true; app.arcadeFullscreenPending = false;
  app.language = 'zh-TW'; app.audioMuted = false;
  const calls = { requests: [], exits: 0, stopped: 0, alerts: [], focused: [], windowFocused: 0, restoredBeforeDispose: false };
  iframe.focus = options => { calls.focused.push(options); document.activeElement = iframe; };
  iframe.blur = () => { document.activeElement = null; };
  iframe.contentWindow.focus = () => calls.windowFocused++;
  app.showWorldAlert = text => calls.alerts.push(text);
  app.syncJukebox = app.applyJukeboxVolume = app.syncMenuCapture = () => {};
  app.world = {
    audio: { setMuted() {} },
    stopArcadeGame() { calls.stopped++; calls.restoredBeforeDispose = hud.parentElement === shell; screen.remove(); },
  };
  const change = () => app.syncArcadeFullscreenState();
  screen.requestFullscreen = () => { calls.requests.push(screen); document.fullscreenElement = screen; change(); return Promise.resolve(); };
  document.exitFullscreen = () => { calls.exits++; document.fullscreenElement = null; document.webkitFullscreenElement = null; change(); return Promise.resolve(); };
  return { app, root, shell, css, screen, iframe, hud, button, document, calls, change };
}

test('arcade native fullscreen contains both controls and preserves the same live iframe across return', async () => {
  const f = fullscreenAppFixture(), contentWindow = f.iframe.contentWindow, src = f.iframe.src, moves = f.iframe.moves;
  await f.app.toggleArcadeFullscreen();
  assert.deepEqual(f.calls.requests, [f.screen], 'fullscreen the wrapper, not its cross-origin iframe');
  assert.equal(f.hud.parentElement, f.screen); assert.equal(f.button.textContent, '退出全螢幕');
  assert.equal(f.button.attributes.get('aria-pressed'), 'true');
  assert.equal(f.calls.focused.length, 1); assert.equal(f.calls.windowFocused, 1);
  assert.equal(f.calls.focused[0].preventScroll, true); assert.equal(f.document.activeElement, f.iframe);
  f.document.activeElement = f.button;
  f.change(); f.change();
  assert.equal(f.hud.moves, 2, 'duplicate standard/WebKit notifications must not keep moving the controls');
  assert.equal(f.calls.focused.length, 1); assert.equal(f.document.activeElement, f.button,
    'duplicate notifications must preserve subsequent button keyboard navigation');
  await f.app.toggleArcadeFullscreen();
  assert.equal(f.calls.exits, 1); assert.equal(f.hud.parentElement, f.shell);
  assert.equal(f.button.textContent, '全螢幕'); assert.equal(f.button.attributes.get('aria-pressed'), 'false');
  assert.equal(f.iframe.parentElement, f.screen); assert.equal(f.iframe.moves, moves);
  assert.equal(f.iframe.contentWindow, contentWindow); assert.equal(f.iframe.src, src);
  assert.equal(f.calls.focused.length, 2); assert.equal(f.calls.windowFocused, 2); assert.equal(f.document.activeElement, f.iframe);
  assert.equal(f.calls.stopped, 0); assert.equal(f.app.arcadePlaying, true);
});

test('browser-initiated fullscreen exit restores controls without exiting the running game', async () => {
  const f = fullscreenAppFixture(); f.app.language = 'en';
  await f.app.toggleArcadeFullscreen(); assert.equal(f.button.textContent, 'EXIT FULLSCREEN');
  f.document.fullscreenElement = null; f.change();
  assert.equal(f.hud.parentElement, f.shell); assert.equal(f.button.textContent, 'FULLSCREEN');
  assert.equal(f.calls.focused.length, 2); assert.equal(f.calls.windowFocused, 2);
  assert.equal(f.calls.stopped, 0); assert.equal(f.app.arcadePlaying, true);
});

test('fullscreen request rejection leaves the cabinet game and both controls usable', async () => {
  const f = fullscreenAppFixture();
  f.screen.requestFullscreen = () => { f.calls.requests.push(f.screen); return Promise.reject(new Error('Permission denied')); };
  await f.app.toggleArcadeFullscreen();
  assert.equal(f.document.fullscreenElement, null); assert.equal(f.hud.parentElement, f.shell);
  assert.equal(f.button.textContent, '全螢幕'); assert.equal(f.app.arcadeFullscreenPending, false);
  assert.equal(f.calls.alerts.length, 1); assert.equal(f.calls.stopped, 0); assert.equal(f.app.arcadePlaying, true);
  assert.equal(f.calls.focused.length, 0, 'a refusal must not steal focus from the control');
  assert.equal(f.iframe.parentElement, f.screen);
  f.screen.requestFullscreen = () => { f.document.fullscreenElement = f.screen; f.change(); return Promise.resolve(); };
  await f.app.toggleArcadeFullscreen(); assert.equal(f.hud.parentElement, f.screen, 'a refused request must not lock out a subsequent retry');
});

test('a pending fullscreen permission result admits only one request and does not claim fullscreen early', async () => {
  const f = fullscreenAppFixture(); let resolve;
  f.screen.requestFullscreen = () => { f.calls.requests.push(f.screen); return new Promise(done => { resolve = done; }); };
  const pending = f.app.toggleArcadeFullscreen();
  assert.equal(f.calls.requests.length, 1, 'the native request runs immediately in the button gesture');
  assert.equal(f.app.arcadeFullscreenPending, true); assert.equal(f.hud.parentElement, f.shell);
  assert.equal(f.calls.focused.length, 0, 'gameplay focus waits for the real fullscreen transition');
  await f.app.toggleArcadeFullscreen(); assert.equal(f.calls.requests.length, 1);
  f.document.fullscreenElement = f.screen; f.change(); resolve(); await pending;
  assert.equal(f.app.arcadeFullscreenPending, false); assert.equal(f.hud.parentElement, f.screen);
  assert.equal(f.calls.focused.length, 1); assert.equal(f.calls.windowFocused, 1);
});

test('Exit restores controls before removing the fullscreen wrapper and releases native fullscreen', async () => {
  const f = fullscreenAppFixture(); await f.app.toggleArcadeFullscreen();
  const focusCount = f.calls.focused.length;
  f.app.closeArcadeGame();
  assert.equal(f.calls.restoredBeforeDispose, true); assert.equal(f.calls.stopped, 1); assert.equal(f.calls.exits, 1);
  assert.equal(f.hud.parentElement, f.shell); assert.equal(f.hud.hidden, true); assert.equal(f.screen.isConnected, false);
  assert.equal(f.document.fullscreenElement, null); assert.equal(f.app.arcadePlaying, false);
  assert.equal(f.shell.dataset.arcadePlaying, undefined); assert.equal(f.css.attributes.get('aria-hidden'), 'true');
  assert.equal(f.button.attributes.get('aria-pressed'), 'false');
  assert.equal(f.calls.focused.length, focusCount, 'teardown must not refocus the game it is about to remove');
  assert.equal(f.calls.windowFocused, focusCount);
});

test('Exit while fullscreen is pending prevents a late browser result from stranding a closed game in fullscreen', async () => {
  const f = fullscreenAppFixture(); let resolve;
  f.screen.requestFullscreen = () => new Promise(done => { resolve = done; });
  const pending = f.app.toggleArcadeFullscreen(); f.app.closeArcadeGame();
  assert.equal(f.hud.parentElement, f.shell); assert.equal(f.calls.stopped, 1);
  // A late acceptance exercises the defensive cleanup even when the removed
  // element still appears as the browser's pending fullscreen target.
  f.document.fullscreenElement = f.screen; resolve(); await pending;
  assert.equal(f.document.fullscreenElement, null); assert.equal(f.calls.exits, 1);
  assert.equal(f.hud.parentElement, f.shell); assert.equal(f.hud.hidden, true);
  assert.equal(f.app.arcadePlaying, false); assert.equal(f.app.arcadeFullscreenPending, false);
  assert.equal(f.calls.alerts.length, 0); assert.equal(f.iframe.moves, 1);
  assert.equal(f.calls.focused.length, 0); assert.equal(f.calls.windowFocused, 0);
});

test('Escape returns fullscreen play to the cabinet, then leaves the game on the next press', async () => {
  const f = fullscreenAppFixture(); await f.app.toggleArcadeFullscreen();
  f.app.leaveArcadeOnEscape();
  assert.equal(f.calls.exits, 1); assert.equal(f.calls.stopped, 0); assert.equal(f.app.arcadePlaying, true);
  assert.equal(f.hud.parentElement, f.shell);
  f.app.leaveArcadeOnEscape();
  assert.equal(f.calls.stopped, 1); assert.equal(f.app.arcadePlaying, false);
  assert.equal(f.calls.focused.length, 2, 'closing after returning from fullscreen must not refocus gameplay');
  const other = fullscreenAppFixture(); other.document.fullscreenElement = new ArcadeElement('unrelated fullscreen');
  other.app.leaveArcadeOnEscape();
  assert.equal(other.calls.exits, 0, 'closing arcade play must not dismiss another element\'s fullscreen');
  assert.equal(other.calls.stopped, 1);
});

test('arcade fullscreen uses the WebKit fallback while retaining native exit and control restore', async () => {
  const f = fullscreenAppFixture(); delete f.screen.requestFullscreen; delete f.document.exitFullscreen;
  f.screen.webkitRequestFullscreen = () => { f.document.webkitFullscreenElement = f.screen; f.change(); };
  f.document.webkitExitFullscreen = () => { f.calls.exits++; f.document.webkitFullscreenElement = null; f.change(); };
  await f.app.toggleArcadeFullscreen(); assert.equal(f.hud.parentElement, f.screen);
  await f.app.toggleArcadeFullscreen(); assert.equal(f.calls.exits, 1); assert.equal(f.hud.parentElement, f.shell);
  assert.equal(f.app.arcadeFullscreenPending, false);
});
