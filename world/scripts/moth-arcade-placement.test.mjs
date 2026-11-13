import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build } from 'esbuild';
import { ARCADE_WIDTH, ARCADE_WALL_CLEARANCE, nearestArcade } from '../src/world/ArcadeRules.ts';

// Build the actual venue and load its actual cabinet without a WebGL renderer.
// Canvas painting and asset transport are the only fixture substitutes.
const context = new Proxy({ measureText: text => ({ width: text.length * 40 }) }, {
  get: (target, key) => key in target ? target[key] : () => {},
});
globalThis.document = { createElement: () => ({ getContext: () => context }) };
globalThis.window = { location: new URL('http://127.0.0.1:4173/') };
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const view = new DataView(await blob.arrayBuffer());
  return { width: view.getUint32(16), height: view.getUint32(20), close() {} };
};
const assets = {
  'http://127.0.0.1:4173/moth-arcade.glb': await readFile('src/assets/venue-scenery/moth-arcade.glb'),
  'http://127.0.0.1:4173/escape-arcade.glb': await readFile('src/assets/venue-scenery/escape-arcade.glb'),
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => String(url).startsWith('blob:')
  ? originalFetch(url)
  : (assert.ok(assets[String(url)], `unexpected cabinet request ${url}`), new Response(assets[String(url)]));
globalThis.Image = class { set src(_) {} };
const compiled = await build({
  stdin: { contents: "export { FestivalWorld, rooftopBounds } from './src/world/FestivalWorld'; export { MothArcadeView } from './src/world/MothArcade'; export { PLANET, planetBendPoint } from './src/world/PlanetCurve'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'placement-fixture', setup(builder) {
    builder.onLoad({ filter: /FestivalWorld\.ts$/ }, async ({ path }) => ({
      contents: await readFile(path, 'utf8') + '\nexport { rooftopBounds };', loader: 'ts', resolveDir: dirname(path),
    }));
    builder.onLoad({ filter: /MothArcade\.ts$/ }, async ({ path }) => ({
      contents: (await readFile(path, 'utf8')).replace("new URL('../assets/venue-scenery/moth-arcade.glb', import.meta.url).href", "'http://127.0.0.1:4173/moth-arcade.glb'")
        .replace("new URL('../assets/venue-scenery/escape-arcade.glb', import.meta.url).href", "'http://127.0.0.1:4173/escape-arcade.glb'"),
      loader: 'ts', resolveDir: dirname(path),
    }));
  } }],
});
const { FestivalWorld, rooftopBounds, MothArcadeView, PLANET, planetBendPoint, THREE } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('the whole authored cabinet clears the actual rooftop wall while the row stays centred', async () => {
  const world = Object.create(FestivalWorld.prototype);
  Object.assign(world, {
    scene: new THREE.Scene(), colliders: [], seats: [], projectors: new Map(),
    venueSignMaterials: new Map(), clubLights: [], paving: [],
    dayNight: { addLampLight() {} }, createProjectorSurface() {},
    createRooftopStair() {}, createRooftopScreenFrame() {},
  });
  world.createRooftop();
  world.createJukebox();
  const arcade = world.arcadeCabinet;
  await arcade.ready;
  assert.equal(arcade.status, 'ready');
  world.scene.updateMatrixWorld(true);

  const centreZ = (rooftopBounds.minZ + rooftopBounds.bayMaxZ) / 2;
  const wall = world.scene.children.find(object => object.isMesh &&
    Math.abs(object.position.x - rooftopBounds.minX) < 1e-9 &&
    Math.abs(object.position.z - centreZ) < 1e-9 &&
    Math.abs(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x - .8) < 1e-8);
  assert.ok(wall, 'the production rooftop builder must supply the real west bay wall');
  const wallBounds = new THREE.Box3().setFromObject(wall);
  const cabinetBounds = new THREE.Box3().setFromObject(arcade.root, true);
  const clearance = wallBounds.min.x - cabinetBounds.max.x;
  assert.ok(clearance >= ARCADE_WALL_CLEARANCE - 1e-7, `cabinet intersects its wall: clearance ${clearance}, bounds ${JSON.stringify(cabinetBounds)}`);
  assert.ok(clearance < .03, 'the back must sit against the wall, rather than leaving an unnecessary gap');
  assert.ok(cabinetBounds.max.x > wallBounds.min.x - .03);
  // The old root would visibly bury almost half a world unit of this asset.
  const oldBackX = 21 + cabinetBounds.getSize(new THREE.Vector3()).x / 2;
  assert.ok(oldBackX - wallBounds.min.x > .45);

  const jukebox = world.jukebox;
  assert.equal(jukebox.x, rooftopBounds.minX - 1, 'do not move the correctly placed record selector');
  assert.ok(Math.abs((arcade.root.position.z - ARCADE_WIDTH / 2 + jukebox.z + 1.2) / 2 - centreZ) < 1e-9);
  const collider = world.colliders.find(c => c.label === 'moth-arcade');
  assert.ok(Math.abs((collider.minX + collider.maxX) / 2 - arcade.root.position.x) < 1e-9);
  assert.ok(Math.abs((collider.minZ + collider.maxZ) / 2 - arcade.root.position.z) < 1e-9);
  assert.ok(collider.minX < cabinetBounds.min.x && collider.maxX > cabinetBounds.max.x);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(20, 0, centreZ);
  floor.userData.groundFootprint = [[5, -1.5], [35, -1.5], [35, 28.5], [5, 28.5]];
  world.scene.add(floor);
  // The rendered floor seating must preserve the corrected horizontal fit.
  const arcadeX = arcade.root.position.x;
  world.seatArcadeOnGround();
  assert.equal(arcade.root.position.x, arcadeX);
  assert.ok(new THREE.Box3().setFromObject(arcade.root, true).max.x <= wallBounds.min.x - ARCADE_WALL_CLEARANCE + 1e-7);
  const visitor = { x: arcadeX - 3.1, z: arcade.root.position.z - 1.35 };
  const row = [arcade, world.escapeCabinet].map(cabinet => ({ game: cabinet.game, x: cabinet.root.position.x, z: cabinet.root.position.z }));
  assert.equal(nearestArcade(visitor, row, jukebox), 'moth', 'the real review approach must retain E access to this cabinet');

  // Exercise the production play camera with the accepted tilted screen,
  // rather than a synthetic vertical monitor that would conceal this defect.
  const arcadeView = new MothArcadeView(arcade.screen);
  Object.assign(world, { arcadeView, player: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(58, 2808 / 1476, .1, 300) });
  world.updateCamera(.016, 0);
  world.camera.updateMatrixWorld(true);
  const forward = world.camera.getWorldDirection(new THREE.Vector3());
  assert.ok(Math.abs(forward.y) < 1e-9, 'playing must keep the camera level');
  assert.equal(world.camera.fov, 58, 'retain normal world perspective and neighbour visibility');
  assert.equal(world.player.visible, false);
  // The neighbour is now 逃脫我的美麗 (the row since 2026-11-10). The play
  // camera stands half a metre off M.O.T.H's front, so what shows of it is
  // the side panel facing M.O.T.H, halfway back.
  await world.escapeCabinet.ready;
  world.scene.updateMatrixWorld(true);
  const neighbour = new THREE.Box3().setFromObject(world.escapeCabinet.root, true);
  assert.ok(neighbour.min.z > arcade.root.position.z, 'actual neighbouring cabinet geometry is present on the right');
  const midDepth = (neighbour.min.x + neighbour.max.x) / 2;
  const bottom = new THREE.Vector3(midDepth, neighbour.min.y + .2, neighbour.min.z + .02);
  const top = new THREE.Vector3(midDepth, neighbour.max.y - .2, neighbour.min.z + .02);
  PLANET.radius = 320;
  PLANET.centre.value.set(visitor.x, 0, visitor.z);
  const projected = [bottom, top].map(p => planetBendPoint(p).project(world.camera));
  assert.ok(projected.every(p => p.x > -1 && p.x < 1), 'keep the neighbouring cabinet edge visible during play');
  const lean = Math.abs(Math.atan2((projected[1].x - projected[0].x) * 2808,
    (projected[1].y - projected[0].y) * 1476)) * 180 / Math.PI;
  assert.ok(lean < .5, `the neighbour must stand upright in the curved-world play view: ${lean} degrees`);
});

test('逃脫我的美麗 stands between M.O.T.H and the jukebox, backed to the same wall, facing the road', async () => {
  const world = Object.create(FestivalWorld.prototype);
  Object.assign(world, {
    scene: new THREE.Scene(), colliders: [], seats: [], projectors: new Map(),
    venueSignMaterials: new Map(), clubLights: [], paving: [],
    dayNight: { addLampLight() {} }, createProjectorSurface() {},
    createRooftopStair() {}, createRooftopScreenFrame() {},
  });
  world.createRooftop();
  world.createJukebox();
  const moth = world.arcadeCabinet, escape = world.escapeCabinet;
  await Promise.all([moth.ready, escape.ready]);
  assert.equal(escape.status, 'ready');
  assert.equal(escape.game, 'escape');
  world.scene.updateMatrixWorld(true);
  const mothBounds = new THREE.Box3().setFromObject(moth.root, true), escapeBounds = new THREE.Box3().setFromObject(escape.root, true);
  // Side by side in a straight row, a reasonable space apart.
  const gap = escapeBounds.min.z - mothBounds.max.z;
  assert.ok(gap > .45 && gap < .8, `the space between the cabinets: ${gap}`);
  assert.ok(Math.abs(escape.root.position.x - moth.root.position.x) < 1e-9, 'the same distance from the wall');
  assert.ok(escapeBounds.max.z < world.jukebox.z - 1.2 + 1e-6, 'clear of the jukebox');
  assert.ok(Math.abs(escapeBounds.getSize(new THREE.Vector3()).y - 3.8) < .02);
  // Its live screen faces the road (west) and is a usable size.
  const frame = new MothArcadeView(escape.screen).frame;
  assert.ok(frame.normal.x < -.95, `screen must face the road: ${JSON.stringify(frame.normal)}`);
  assert.ok(frame.width > 1.2 && frame.height > 1, `screen ${frame.width} x ${frame.height}`);
  // Its joystick and buttons hide only while its game is played (2026-11-10).
  const controls = [];
  escape.root.traverse(node => { if (/joystick|button/.test(node.userData.cabinetRole ?? '')) controls.push(node); });
  assert.equal(controls.length, 5, 'the stick (shaft and ball) and three buttons');
  escape.setControlsHidden(true);
  assert.ok(controls.every(node => !node.visible));
  escape.setControlsHidden(false);
  assert.ok(controls.every(node => node.visible));
  const collider = world.colliders.find(c => c.label === 'escape-arcade');
  assert.ok(collider && collider.minX < escapeBounds.min.x && collider.maxX > escapeBounds.max.x);
});
