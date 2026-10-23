import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const context = new Proxy({ measureText: text => ({ width: text.length * 40 }) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const compiled = await build({ stdin: { contents: "export {FestivalWorld} from './src/world/FestivalWorld';export {FireworksShow} from './src/world/FireworksShow';export {createCoastalAvatar} from './src/world/CoastalAvatar';export {createMentorDog} from './src/world/MentorDog';export {CLUB_GRADE} from './src/world/CoastalTerrain';export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', loader: { '.png': 'dataurl', '.glb': 'dataurl', '.mp3': 'dataurl', '.wav': 'dataurl' } });
const { THREE, FestivalWorld, FireworksShow, createCoastalAvatar, createMentorDog, CLUB_GRADE } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

function fixture() {
  const world = Object.create(FestivalWorld.prototype), scene = new THREE.Scene(), player = new THREE.Group(), dogGroup = new THREE.Group(), dogRig = createMentorDog(), actions = [];
  const playerRig = createCoastalAvatar(player, { skin: '#dfb590', hair: '#3b3633', top: '#d0cbc1', bottoms: '#44464a', swimwear: '#577467' }, true, new THREE.Group());
  player.position.set(40, .28, 0); dogGroup.add(dogRig.root); dogGroup.position.copy(player.position).add(new THREE.Vector3(1, 0, 0)); scene.add(player, dogGroup);
  const mentor = { id: 'MENTOR', name: 'MENTOR', group: dogGroup, dogRig, badge: new THREE.Sprite(), knockback: new THREE.Vector3(), route: [], lane: new THREE.Vector2(), transit: [], speed: 1, waitUntil: 0, stuckFor: 0 };
  Object.assign(world, { scene, player, playerRig, npcs: [mentor], remoteAvatars: new Map(), remoteNpcControls: new Map(), seats: [], occupiedSeats: new Set(), colliders: [], paving: [], kerbStones: [], carriedProp: new THREE.Group(), playerState: 'walking', carryingMentor: false, drinkUntil: 0, eatingUntil: 0, drinks: 0, keys: new Set(), moveVector: new THREE.Vector3(), clock: { elapsedTime: 0 }, onAction: action => actions.push(action) });
  player.add(world.carriedProp);
  return { world, mentor, player, actions };
}
function assertHeld(world, mentor, item) {
  assert.equal(world.isCarryingMentor(), true); assert.equal(world.carriedItem, item);
  assert.equal(mentor.group.parent, world.player); assert.equal(world.carriedProp.parent, world.player);
  assert.equal(mentor.group.visible, true); assert.ok(mentor.group.position.toArray().every(Number.isFinite));
}

test('the actual seated bar action orders a drink without putting the head-carried dog down', () => {
  const { world, mentor, actions } = fixture();
  world.player.position.set(-68, CLUB_GRADE + .28, 8.8); world.playerState = 'seated';
  mentor.group.position.copy(world.player.position).add(new THREE.Vector3(1, 0, 0));
  assert.equal(world.nearClubBar(), true); assert.equal(world.mentorAction('carry'), true);
  const perch = mentor.group.matrix.clone(); actions.length = 0;
  world.interact(); assertHeld(world, mentor, 'DRINK');
  assert.deepEqual(actions, [{ type: 'drinkOrdered' }]); assert.deepEqual(mentor.group.matrix.elements, perch.elements);
  assert.equal(world.playerState, 'seated'); assert.equal(world.carriedPropKind, 'DRINK'); assert.equal(world.carriedProp.visible, true);
});

test('walking up to the actual popcorn counter orders food while MENTOR stays carried; eating later keeps the dog', () => {
  const { world, mentor, actions } = fixture(); world.mentorAction('carry');
  world.player.position.set(-20, 0, -24); actions.length = 0;
  world.interact(); assertHeld(world, mentor, 'POPCORN'); assert.deepEqual(actions, [{ type: 'food', item: 'POPCORN' }]);
  assert.equal(world.carriedPropKind, 'POPCORN'); assert.equal(world.carriedProp.visible, true);
  world.player.position.set(40, .28, 0); actions.length = 0; world.interact();
  assertHeld(world, mentor, undefined); assert.deepEqual(actions, [{ type: 'ate' }]);
  assert.equal(world.eatingItem, 'POPCORN'); assert.equal(world.carriedProp.visible, true, 'carton stays visible through the eating animation');
  world.eatingUntil = 0; world.syncCarriedPropAnchor(); assertHeld(world, mentor, undefined); assert.equal(world.carriedProp.visible, false);
});

test('picking the dog up preserves existing food and shared carrier polling cannot replace it', () => {
  for (const item of ['POPCORN', 'DRINK', 'HOTDOG', 'PIZZA', 'CHICKEN']) {
    const { world, mentor, actions } = fixture(); world.carriedItem = item; world.syncCarriedPropAnchor();
    assert.equal(world.mentorAction('carry'), true); assertHeld(world, mentor, item);
    assert.equal(actions.at(-1).discardedPopcorn, false);
    world.setSharedMentorCarrier('self', 'self'); world.setSharedMentorCarrier('self', 'self');
    assertHeld(world, mentor, item); assert.equal(world.carriedPropKind, item); assert.equal(world.carriedProp.visible, true);
  }
  const { world, mentor } = fixture(); world.carriedItem = 'POPCORN'; world.syncCarriedPropAnchor();
  world.setSharedMentorCarrier('self', 'self'); assertHeld(world, mentor, 'POPCORN');
});

test('the popcorn counter eating prompt consumes the carton instead of silently ordering another, with MENTOR still on the head', () => {
  const { world, mentor, actions } = fixture(); world.mentorAction('carry'); world.player.position.set(-20, 0, -24);
  world.interact(); assertHeld(world, mentor, 'POPCORN');
  assert.match(world.interactionLabel(), /EAT POPCORN/); actions.length = 0; world.triggerPrompt();
  assertHeld(world, mentor, undefined); assert.deepEqual(actions, [{ type: 'ate' }]); assert.equal(world.eatingItem, 'POPCORN');
});

test('the separate put-down choice releases MENTOR onto the ground while retaining hand food', () => {
  const { world, mentor, actions } = fixture(); world.carriedItem = 'POPCORN'; world.syncCarriedPropAnchor();
  assert.equal(world.mentorAction('carry'), true); actions.length = 0;
  assert.equal(world.mentorAction('carry'), true); assert.equal(world.isCarryingMentor(), false);
  assert.equal(mentor.group.parent, world.scene); assert.equal(world.carriedItem, 'POPCORN'); assert.equal(world.carriedProp.visible, true);
  assert.deepEqual(actions, [{ type: 'mentor', active: false }]); assert.equal(mentor.group.scale.x, 1);
});

test('explicit feed and pet inside the real shop reach MENTOR rather than the generic venue dispatcher', () => {
  const { world, mentor, actions } = fixture(); world.shopCounter = { x: 40, y: .28, z: 0 };
  assert.equal(world.nearShopCounter(), true); assert.match(world.interactionLabel(), /OPEN MASTER OF THE HOUSE/);
  assert.equal(world.mentorAction('feed'), true); assert.deepEqual(actions, [{ type: 'treat', target: 'MENTOR' }]);
  assert.equal(world.playerGesture, 'feed'); assert.equal(mentor.gesture, 'tail-wag');
  actions.length = 0; assert.equal(world.mentorAction('pet'), true); assert.deepEqual(actions, []); assert.equal(mentor.gesture, 'tail-wag');
  assert.equal(world.playerGesture, 'wave');
  actions.length = 0; world.interact(); assert.deepEqual(actions, [{ type: 'shop' }], 'the independent main prompt still opens the venue');
});

test('explicit choices reject unavailable or player-controlled MENTOR and pickup prompts no longer claim popcorn loss', () => {
  const { world, mentor } = fixture(); world.carriedItem = 'POPCORN';
  assert.doesNotMatch(world.interactionLabel(), /LOST|WILL BE LOST/);
  mentor.group.position.x += 10; assert.equal(world.mentorAction('feed'), false);
  mentor.group.position.copy(world.player.position); world.controlledNpcId = 'MENTOR';
  for (const action of ['feed', 'pet', 'carry']) assert.equal(world.mentorAction(action), false);
});


test('shared donation fireworks align to service time once, expire without replay and remain separate from the private quest show', () => {
  const world=Object.create(FestivalWorld.prototype),scene=new THREE.Scene();let prepared=0;
  world.audio={prepareFireworks:()=>{prepared++;return Promise.resolve();}};
  world.templeFireworks=new FireworksShow(scene,{seaY:0,score:'temple'});
  world.fireworksShow=new FireworksShow(scene,{seaY:0});world.fireworksShow.start(performance.now());
  const now=1_000_000,event={id:'anonymous-test-event',startedAt:now-5_000,durationMs:24_000};
  world.syncDonationCelebration(event,now);world.templeFireworks.update(0,performance.now());
  assert.equal(prepared,1);assert.equal(world.templeFireworks.snapshot().active,true);
  const started=world.templeFireworks.startedAt;assert.ok(Math.abs(performance.now()-started-5_000)<30);
  world.syncDonationCelebration(event,now+1000);assert.equal(world.templeFireworks.startedAt,started);assert.equal(prepared,1);
  world.syncDonationCelebration(event,now+25_000);assert.equal(world.templeFireworks.snapshot().active,false);
  world.syncDonationCelebration(event,now);assert.equal(world.templeFireworks.snapshot().active,false,'same expired ID cannot restart');
  for(const invalid of [undefined,{...event,id:'bad',durationMs:999999},{...event,id:'future',startedAt:now+60000}])world.syncDonationCelebration(invalid,now);
  assert.equal(prepared,1);assert.equal(world.fireworksShow.snapshot().active,true);
  world.templeFireworks.dispose();world.fireworksShow.dispose();
});
