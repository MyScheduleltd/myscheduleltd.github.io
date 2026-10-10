import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGuitar, THREE, handSamples, neckTriangles, skinClearance} from './guitar-contact.mjs';

// Measure the deformed skin, including finger pads, rather than bone endpoints.
// The ray envelope includes the rendered neck, frets and strings.
test('palm-up fretting skin stays outside the animated neck and strings', async () => {
  const gltf = await loadGuitar(), root = gltf.scene;
  root.updateMatrixWorld(true);
  const spine = root.getObjectByName('Spine');
  const bind = spine.getWorldQuaternion(new THREE.Quaternion()).invert();
  const hand = root.getObjectByName('LeftHand');
  const inverse = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  const palmLocal = new THREE.Vector3(0,0,1)
    .applyQuaternion(root.getObjectByName('LeftHandIndex1').getWorldQuaternion(new THREE.Quaternion()))
    .applyQuaternion(inverse);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(gltf.animations.find(c => c.name === 'play')).play();
  const body = root.getObjectByName('guitarist-body');
  const wholeHand = handSamples(body);
  const fingers = ['Index','Middle','Ring'].map(f => [f, handSamples(body, 'LeftHand'+f)]);
  let minimum = Infinity, maximumContact = 0, checked = 0;
  for (let time = 0; time < 16; time += .25) {
    mixer.setTime(time); root.updateMatrixWorld(true);
    const deformation = spine.getWorldQuaternion(new THREE.Quaternion()).multiply(bind);
    const neck = new THREE.Vector3(.714,.616,.333).normalize().applyQuaternion(deformation);
    const front = new THREE.Vector3(-.423,0,.906).normalize().applyQuaternion(deformation);
    const under = neck.clone().cross(front).normalize();
    const palm = palmLocal.clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(palm.dot(under.clone().negate()) > .9, `palm rolls downward at ${time}s`);
    const tip = root.getObjectByName('LeftHandMiddle4').getWorldPosition(new THREE.Vector3());
    assert.ok(hand.getWorldPosition(new THREE.Vector3()).sub(tip).dot(under) > .01,
      `wrist moved above the neck at ${time}s`);
    const triangles = neckTriangles(root, neck, tip.dot(neck));
    const clearance = skinClearance(root, triangles, front, wholeHand);
    assert.ok(clearance.checked > 200, 'no rendered neck/finger overlap sampled');
    assert.equal(clearance.inside, 0, `skin vertex ${clearance.vertex} clips at ${time}s by ${-clearance.worst}m`);
    minimum = Math.min(minimum, clearance.worst); checked += clearance.checked;
    for (const [finger, samples] of fingers) {
      const contact = skinClearance(root, triangles, front, samples);
      assert.ok(contact.checked > 20, `${finger} moved off the fretboard at ${time}s`);
      assert.ok(contact.worst < .01, `${finger} floats ${contact.worst}m off the strings at ${time}s`);
      maximumContact = Math.max(maximumContact, contact.worst);
    }
  }
  console.log(`64 poses; ${checked} skin/envelope checks; minimum clearance ${(minimum*1000).toFixed(2)}mm; maximum nearest finger gap ${(maximumContact*1000).toFixed(2)}mm`);
});
