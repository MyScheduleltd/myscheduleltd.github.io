import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build } from 'esbuild';
import { ARCADE_WIDTH, ARCADE_WALL_CLEARANCE, arcadeIsNearest } from '../src/world/ArcadeRules.ts';

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
const asset = await readFile('src/assets/venue-scenery/moth-arcade.glb');
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => String(url).startsWith('blob:')
  ? originalFetch(url)
  : (assert.equal(String(url), 'http://127.0.0.1:4173/moth-arcade.glb'), new Response(asset));
globalThis.Image = class { set src(_) {} };
const compiled = await build({
  stdin: { contents: "export { FestivalWorld, rooftopBounds } from './src/world/FestivalWorld'; export { MothArcadeView } from './src/world/MothArcade'; export { PLANET, planetBendPoint } from './src/world/PlanetCurve'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'placement-fixture', setup(builder) {
    builder.onLoad({ filter: /FestivalWorld\.ts$/ }, async ({ path }) => ({
      contents: await readFile(path, 'utf8') + '\nexport { rooftopBounds };', loader: 'ts', resolveDir: dirname(path),
    }));
    builder.onLoad({ filter: /MothArcade\.ts$/ }, async ({ path }) => ({
      contents: (await readFile(path, 'utf8')).replace("new URL('../assets/venue-scenery/moth-arcade.glb', import.meta.url).href", "'http://127.0.0.1:4173/moth-arcade.glb'"),
      loader: 'ts', resolveDir: dirname(path),
    }));
  } }],
});
const { FestivalWorld, rooftopBounds, MothArcadeView, PLANET, planetBendPoint, THREE } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('the whole authored cabinet clears the actual rooftop wall while the pair stays centred', async () => {
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
  const visitor = { x: arcadeX - 3.1, z: arcade.root.position.z + 1.35 };
  assert.equal(arcadeIsNearest(visitor, arcade.root.position, jukebox), true, 'the real review approach must retain E access to this cabinet');

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
  const caseMesh = world.scene.getObjectByName('timber-case');
  assert.ok(caseMesh, 'actual neighbouring jukebox geometry is present');
  const bottom = caseMesh.localToWorld(new THREE.Vector3(-1.1, -1.425, -.65));
  const top = caseMesh.localToWorld(new THREE.Vector3(-1.1, 1.425, -.65));
  PLANET.radius = 320;
  PLANET.centre.value.set(visitor.x, 0, visitor.z);
  const projected = [bottom, top].map(p => planetBendPoint(p).project(world.camera));
  assert.ok(projected.every(p => p.x > -1 && p.x < 1), 'keep the jukebox edge visible during play');
  const lean = Math.abs(Math.atan2((projected[1].x - projected[0].x) * 2808,
    (projected[1].y - projected[0].y) * 1476)) * 180 / Math.PI;
  assert.ok(lean < .5, `jukebox must stand upright in the curved-world play view: ${lean} degrees`);
});
