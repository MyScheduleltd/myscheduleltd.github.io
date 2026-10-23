import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBeachCouple, animateBeachCouple } from '../src/world/BeachCouple.ts';

test('the existing block couple holds an upright clothed partner balance, with a crotch censor front and back', () => {
  const rig = createBeachCouple();
  assert.equal(rig.people.length, 2);
  assert.deepEqual(rig.root.userData.beachYoga, { pose: 'upright-partner-tree-balance', clothed: true, mosaicTargets: ['crotch'], mosaicFacings: ['front', 'back'], actors: 2 });
  const patches = [], colours = new Set(); let triangles = 0, lights = 0;
  rig.root.traverse(node => {
    if (node.isLight) lights++;
    if (!node.isMesh) return;
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    if (node.material.color) colours.add(node.material.color.getHex());
    if (node.userData.yogaMosaicTarget) patches.push(node);
  });
  assert.equal(patches.length, 4);
  for (const person of rig.people) {
    const own = patches.filter(node => node.parent === person);
    assert.deepEqual(own.map(node => node.userData.yogaMosaicFacing).sort(), ['back', 'front'], 'each partner is boxed front and back');
    for (const patch of own) {
      assert.equal(patch.userData.yogaMosaicTarget, 'crotch');
      const { width, height } = patch.geometry.parameters;
      assert.deepEqual([width, height], [.7, .6]);
      // Between the legs (x 0), at the hip/thigh join, clear of the .5-deep hips.
      assert.equal(patch.position.x, 0);
      assert.ok(patch.position.y > .9 && patch.position.y < 1.15, `crotch height: ${patch.position.y}`);
      assert.ok(Math.abs(patch.position.z) > .25, 'stands proud of the hip block');
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(patch.quaternion).z;
      assert.ok(Math.sign(facing) === Math.sign(patch.position.z), 'faces outward from its side');
    }
  }
  assert.ok(patches.every(node => node.material === patches[0].material), 'one shared 25-pixel mosaic texture');
  const mosaic = patches[0].material;
  assert.equal(mosaic.map.image.width, 5); assert.equal(mosaic.map.image.height, 5);
  assert.equal(mosaic.map.magFilter, THREE.NearestFilter);
  assert.equal(mosaic.emissiveMap, mosaic.map, 'the same cells glow, so the censor reads against the sun');
  assert.ok(mosaic.emissiveIntensity > 0 && mosaic.emissiveIntensity <= .6, 'not a lamp at night');
  // Teal and white, so the towel does not disappear into the sand.
  for (const colour of [0x1f9e9a, 0xf4efe6]) assert.ok(colours.has(colour), 'teal towel with white stripes');
  assert.ok(!colours.has(0xe8dcc0), 'no sand-coloured towel');
  for (const colour of [0xa9694a, 0x7a4a33, 0x1c1518, 0x54331f, 0x2f6f8f, 0xd8b64a]) assert.ok(colours.has(colour), 'preserve original avatar palette');
  assert.equal(lights, 0); assert.ok(triangles < 550, `keep the scenery simple: ${triangles}`);
  for (let time = 0; time < 30; time += .125) {
    animateBeachCouple(rig, time); rig.root.updateMatrixWorld(true);
    for (const person of rig.people) {
      const planted = person.getObjectByName('yoga-planted-leg').children[0];
      const sole = new THREE.Box3().setFromObject(planted).min.y;
      assert.ok(Math.abs(sole - .24) < 1e-6, `planted foot stays on towel: ${sole}`);
      assert.ok(Math.abs(person.rotation.z) < .025, 'gentle ankle wobble, no prone or thrusting motion');
      const head = new THREE.Box3().setFromObject(person.children.find(node => node === rig.leftHead || node === rig.rightHead));
      assert.ok(head.min.y > 2, 'both people remain upright');
    }
  }
});

test('the raised hands meet palm to palm without passing through each other, all through the wobble', () => {
  const rig = createBeachCouple();
  const arms = rig.people.map(person => person.getObjectByName('yoga-inner-arm').children[0]);
  let widest = 0;
  for (let time = 0; time < 30; time += .1) {
    animateBeachCouple(rig, time); rig.root.updateMatrixWorld(true);
    const [left, right] = arms.map(arm => new THREE.Box3().setFromObject(arm));
    const gap = right.min.x - left.max.x;
    assert.ok(gap > 0, `the hands overlap by ${-gap} at t=${time}`);
    widest = Math.max(widest, gap);
  }
  assert.ok(widest < .02, `the hands should stay touching, gap up to ${widest}`);
});

