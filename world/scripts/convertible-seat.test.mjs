import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const context = new Proxy({ measureText: text => ({ width: text.length * 40 }) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const compiled = await build({
  stdin: { contents: "export {FestivalWorld} from './src/world/FestivalWorld';export {EnvironmentAssets} from './src/world/EnvironmentAssets';export {CONVERTIBLE} from './src/world/CoastalGeometry';export {createConvertibleSeatProxy} from './src/world/ConvertibleSeat';export {batchStaticScenery} from './src/world/StaticBatch';export {createCoastalAvatar} from './src/world/CoastalAvatar';export {coastalFootHeights} from './src/world/CoastalPose';export {SCREENING_SITES} from './src/world/CoastalVenues';export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', loader: { '.png': 'dataurl' },
});
const { THREE, FestivalWorld, EnvironmentAssets, CONVERTIBLE, createConvertibleSeatProxy, batchStaticScenery, createCoastalAvatar, coastalFootHeights, SCREENING_SITES } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('all six real relocated car seats retain pad contact and foot support after real static batching', () => {
  const world = Object.create(FestivalWorld.prototype);
  Object.assign(world, { scene: new THREE.Scene(), colliders: [], seats: [], projectors: new Map(), venueSignMaterials: new Map(), graphicsMode: 'normal', createProjectorSurface() {} });
  const site = SCREENING_SITES['drive-in'];
  world.buildOnGrade(() => world.createDriveIn(), site.grade, site.dx, site.dz);
  world.scene.updateMatrixWorld(true);
  assert.equal(world.seats.length, 6);
  const before = world.seats.map(seat => ({ seat, proxy: seat.cushion, car: seat.cushion.parent, pad: new THREE.Box3().setFromObject(seat.cushion) }));
  for (const { seat, proxy, pad } of before) {
    assert.equal(proxy.visible, false); assert.equal(proxy.userData.convertibleSeatAnchor, true);
    near(pad.max.y, .16); near(seat.footFloor, -.32);
    // The proxy initially describes exactly the visible authored driver pad.
    const original = new THREE.Box3().setFromObject(proxy.parent.userData.cushion);
    assert.ok(pad.min.distanceTo(original.min) < 1e-6); assert.ok(pad.max.distanceTo(original.max) < 1e-6);
  }
  const batch = batchStaticScenery(world.scene);
  assert.ok(batch.batchedPieces > 100, 'exercise the real populated scenery batcher');
  world.player = new THREE.Group();
  world.playerRig = createCoastalAvatar(world.player, { skin: '#dfb590', hair: '#3b3633', top: '#d0cbc1', bottoms: '#44464a', swimwear: '#577467' }, true, new THREE.Group());
  world.scene.add(world.player);
  for (const { seat, proxy, car, pad } of before) {
    assert.equal(proxy.parent, car); assert.equal(proxy.visible, false);
    const after = new THREE.Box3().setFromObject(proxy);
    assert.ok(after.min.distanceTo(pad.min) < 1e-6); assert.ok(after.max.distanceTo(pad.max) < 1e-6);
    world.player.position.copy(world.seatAnchor(seat)); world.player.rotation.y = Math.PI;
    world.poseRigSeated(world.playerRig); world.player.updateMatrixWorld(true);
    const hip = world.playerRig.leftLeg.getWorldPosition(new THREE.Vector3());
    near(hip.y - after.max.y, .23);
    near(world.player.position.z, seat.position.z - .3);
    for (const sole of coastalFootHeights(world.playerRig)) near(sole, seat.footFloor, .0001);
  }
});

test('a nested future cushion keeps its source bounds after relocation, with no visible or raycast proxy', () => {
  const scene = new THREE.Scene(), car = new THREE.Group(), interior = new THREE.Group();
  car.name = 'Drive Thru 88 convertible'; car.position.set(8, .1, -20); car.rotation.y = .42;
  interior.position.set(-.7, .8, .3); interior.rotation.y = .2; car.add(interior); scene.add(car);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(1.3, .2, 1.1), new THREE.MeshStandardMaterial()); cushion.scale.set(.9, 1.2, 1.1); interior.add(cushion);
  const proxy = createConvertibleSeatProxy(car, cushion);
  car.position.add(new THREE.Vector3(-35, -.8, -10)); scene.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(cushion), proxyBounds = new THREE.Box3().setFromObject(proxy);
  assert.ok(sourceBounds.min.distanceTo(proxyBounds.min) < 1e-6); assert.ok(sourceBounds.max.distanceTo(proxyBounds.max) < 1e-6);
  assert.equal(proxy.visible, false); assert.equal(proxy.material.visible, false);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(proxyBounds.getCenter(new THREE.Vector3()).x, 10, proxyBounds.getCenter(new THREE.Vector3()).z), new THREE.Vector3(0, -1, 0)).intersectObject(proxy, true).length, 0);
  for (const part of proxy.children) assert.equal(part.material.visible, false);
  assert.throws(() => createConvertibleSeatProxy(car, new THREE.Group()), /finite visible cushion bounds/);
});

async function originalDriveIn(t) {
  const previous = { fetch: globalThis.fetch, window: globalThis.window };
  const requests = [];
  globalThis.window = { location: new URL('http://127.0.0.1:4184/'), setTimeout, clearTimeout };
  globalThis.fetch = async requested => { requests.push(String(requested)); throw new Error('The restored authored cars must not request an imported model'); };
  t.after(() => { globalThis.fetch = previous.fetch; globalThis.window = previous.window; });
  // Even when an older manifest includes this GLB, the drive-in builder must
  // retain the requested original cars and must not schedule its download.
  const assets = new EnvironmentAssets({ assets: { 'drive-in-car': 'http://127.0.0.1:4184/assets/drive-in-car.glb' }, mobile: true });
  t.after(() => assets.dispose());
  const world = Object.create(FestivalWorld.prototype);
  Object.assign(world, {
    scene: new THREE.Scene(), colliders: [], seats: [], projectors: new Map(), venueSignMaterials: new Map(), graphicsMode: 'normal', createProjectorSurface() {},
    environmentModels: assets, environmentPrepared: true,
  });
  const site = SCREENING_SITES['drive-in'];
  world.buildOnGrade(() => world.createDriveIn(), site.grade, site.dx, site.dz);
  world.scene.updateMatrixWorld(true);
  const cars = world.seats.map(seat => seat.cushion.parent);
  await world.prepareAssets();
  return { world, assets, cars, requests };
}

function visibleSurfaceAt(scene, x, z, fromY = 5, excludedRoot) {
  const meshes = [];
  scene.traverseVisible(object => {
    for (let parent = object; parent; parent = parent.parent) if (parent === excludedRoot) return;
    if (object.isMesh && object.material.visible !== false) meshes.push(object);
  });
  const hit = new THREE.Raycaster(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0)).intersectObjects(meshes, false)[0];
  assert.ok(hit, `no visible support at ${x}, ${z}`);
  return hit.point.y;
}

test('restored original cars schedule no GLB request and retain their colours, numbers and full physical row aisle', async t => {
  const { world, assets, cars, requests } = await originalDriveIn(t);
  assert.deepEqual(requests, []);
  assert.equal(assets.snapshot().instances.length, 0);
  assert.equal(assets.snapshot().status['drive-in-car'], undefined);
  assert.deepEqual(cars.map(car => car.userData.driveInPaint), [0xc74935,0xd4b24a,0x38678e,0xd4d1b8,0x745b90,0x3b7657]);
  assert.deepEqual(cars.map(car => car.userData.driveInSeatNumber), [1,2,3,4,5,6]);
  assert.deepEqual(world.seats.map(seat => seat.id), ['DRIVE-1-1','DRIVE-1-2','DRIVE-1-3','DRIVE-2-1','DRIVE-2-2','DRIVE-2-3']);
  const visibleBounds = cars.map(car => {
    const bounds = new THREE.Box3();
    car.traverseVisible(part => { if (part.isMesh && part.material.visible !== false) bounds.union(new THREE.Box3().setFromObject(part)); });
    assert.equal(car.getObjectByName('bonnet').material.color.getHex(),car.userData.driveInPaint);
    assert.equal(car.userData.cushion.visible,true);
    return bounds;
  });
  const screenCollider=world.colliders.find(collider=>collider.label!=='convertible-car');
  for (let column=0;column<3;column++) {
    near(visibleBounds[column].min.z-visibleBounds[column+3].max.z,3,.0001);
    assert.ok(visibleBounds[column+3].min.z-screenCollider.maxZ > 2.8, 'front bumpers retain an aisle before the screen');
  }
  assert.equal(world.staticCollides(0,-26,-.7,FestivalWorld.BODY_RADIUS),false,'retain the existing fast-travel arrival');
  const aisleZ=(visibleBounds[0].min.z+visibleBounds[3].max.z)/2;
  for (let x=-11;x<=11;x+=.25) assert.equal(world.staticCollides(x,aisleZ,-.7,FestivalWorld.BODY_RADIUS),false,'the full cross-row aisle must clear a standing visitor');
});

test('actual original cushion and footwell surfaces still support all six seats through admission and static batching', async t => {
  const { world, cars, requests } = await originalDriveIn(t);
  batchStaticScenery(world.scene); world.scene.updateMatrixWorld(true);
  world.player = new THREE.Group();
  world.playerRig = createCoastalAvatar(world.player, { skin: '#dfb590', hair: '#3b3633', top: '#d0cbc1', bottoms: '#44464a', swimwear: '#577467' }, true, new THREE.Group());
  world.scene.add(world.player);
  world.seats.forEach((seat, i) => {
    const car=cars[i],pad=new THREE.Box3().setFromObject(seat.cushion);
    assert.equal(seat.cushion.parent,car);assert.equal(seat.cushion.visible,false);
    near(pad.max.y-car.position.y,CONVERTIBLE.cushionTop);
    near(seat.footFloor-car.position.y,CONVERTIBLE.footFloor);
    const driverX=car.position.x+CONVERTIBLE.seatX;
    const hip=visibleSurfaceAt(world.scene,driverX,car.position.z+CONVERTIBLE.seatZ-.3,5,world.player);
    // Authored stitching rises 12mm above the pad, rather than a generated
    // sloping cushion; preserve that small actual relief after batching.
    near(hip-pad.max.y,.012,.0001);
    // Below dashboard and wheel: measure the real authored floorpan.
    const footwell=visibleSurfaceAt(world.scene,driverX,car.position.z-.7,car.position.y+.4,world.player);
    near(footwell,seat.footFloor);
    world.player.position.copy(world.seatAnchor(seat));world.player.rotation.y=Math.PI;
    world.poseRigSeated(world.playerRig);world.player.updateMatrixWorld(true);
    near(world.playerRig.leftLeg.getWorldPosition(new THREE.Vector3()).y-pad.max.y,.23);
    for(const sole of coastalFootHeights(world.playerRig))near(sole,seat.footFloor,.0001);
    for(const ankle of [world.playerRig.leftAnkle,world.playerRig.rightAnkle]){
      const sole=new THREE.Vector3(0,-.20,.1).applyMatrix4(ankle.matrixWorld);
      const actualFloor=visibleSurfaceAt(world.scene,sole.x,sole.z,sole.y+.015,world.player);
      near(sole.y,actualFloor,.0001);
    }
  });
  assert.deepEqual(requests,[],'admission/batching cannot silently restore imported car loading');
});
