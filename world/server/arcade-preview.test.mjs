import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { ARCADE_CODE_BROWSERS, ArcadePreviewAccess, ARCADE_PREVIEW_END, arcadeDeviceKey, arcadeProofText } from './arcade-preview.mjs';

const key = () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { ...pair, jwk: pair.publicKey.export({ format: 'jwk' }) };
};
const proof = (service, owner, action, code = '') => {
  const { nonce } = service.challenge(owner.jwk, action, '127.0.0.1');
  return { publicKey: owner.jwk, nonce, code,
    signature: sign('sha256', Buffer.from(arcadeProofText(action, nonce, code)),
      { key: owner.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
};

test('only new verified paid donations with an actual public browser key issue distinct random tickets', () => {
  const service = new ArcadePreviewAccess({ now: () => ARCADE_PREVIEW_END - 100_000 });
  const owner = key();
  for (const state of ['pending', 'awaiting', 'failed']) {
    assert.equal(service.issue({ id: randomUUID(), state, arcadeDeviceKey: owner.jwk }), undefined);
  }
  assert.equal(service.issue({ id: randomUUID(), state: 'paid' }), undefined, 'earlier donors without a key are excluded');
  const donation = { id: randomUUID(), state: 'paid', arcadeDeviceKey: owner.jwk };
  const first = service.issue(donation), second = service.issue({ ...donation, id: randomUUID() });
  assert.match(first.code, /^MOTH-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);
  assert.notEqual(first.code, second.code);
  assert.equal(service.issue(donation), first, 'duplicate callbacks retain the same code');
  assert.equal(arcadeDeviceKey({ ...owner.jwk, d: 'private' }), undefined);
  assert.equal(arcadeDeviceKey({ ...owner.jwk, x: 'A'.repeat(43), y: 'A'.repeat(43) }), undefined, 'reject off-curve points');
});

test('a code unlocks any browser it is typed into, but only its buyer\'s browser lists it', () => {
  // Owner, 2026-10-22: whoever paid may play on any device, or share the code.
  const service = new ArcadePreviewAccess({ now: () => ARCADE_PREVIEW_END - 100_000 });
  const owner = key(), friend = key();
  const grant = service.issue({ id: randomUUID(), state: 'paid', arcadeDeviceKey: owner.jwk });
  const friendId = service.authenticate(proof(service, friend, 'redeem', grant.code), 'redeem');
  assert.equal(service.status(friendId).unlocked, false, 'nothing is unlocked before the code is entered');
  assert.equal(service.redeem(friendId, grant.code.toLowerCase()).unlocked, true, 'another browser unlocks with the code');
  assert.deepEqual(service.status(friendId).codes, [], 'the code is never shown to a browser that did not buy it');
  const ownerId = service.authenticate(proof(service, owner, 'status'), 'status');
  assert.equal(service.status(ownerId).unlocked, false, 'the buyer\'s browser is unlocked only once it enters the code too');
  assert.equal(service.status(ownerId).codes[0].code, grant.code, 'and it lists the code it bought');
  assert.equal(service.redeem(ownerId, grant.code).unlocked, true);
  assert.equal(service.redeem(ownerId, grant.code).unlocked, true, 're-entry is idempotent');
  assert.deepEqual(service.snapshot()[0].unlocked, [friendId, ownerId]);
  assert.throws(() => service.redeem(ownerId, 'MOTH-00000000-00000000-00000000'), /not valid/);
});

test('one code opens at most ARCADE_CODE_BROWSERS browsers, and older saved grants keep their buyer unlocked', () => {
  const service = new ArcadePreviewAccess({ now: () => ARCADE_PREVIEW_END - 100_000 });
  const grant = service.issue({ id: randomUUID(), state: 'paid', arcadeDeviceKey: key().jwk });
  for (let i = 0; i < ARCADE_CODE_BROWSERS; i++) service.redeem(String(i).padStart(64, 'a'), grant.code);
  assert.throws(() => service.redeem('f'.repeat(64), grant.code), /most devices/);
  assert.equal(service.redeem('0'.padStart(64, 'a'), grant.code).unlocked, true, 'a browser already counted keeps working');
  const restored = new ArcadePreviewAccess({ now: () => ARCADE_PREVIEW_END - 100_000 });
  const old = { ...service.snapshot()[0], unlocked: undefined, redeemedAt: 1 };
  delete old.unlocked;
  restored.restore([old]);
  assert.equal(restored.status(old.deviceId).unlocked, true);
});

test('signatures bind the key, action, nonce and exact normalized ticket; expired and replayed proofs fail', () => {
  let now = ARCADE_PREVIEW_END - 200_000;
  const service = new ArcadePreviewAccess({ now: () => now });
  const owner = key(), stranger = key();
  const authentic = proof(service, owner, 'status');
  const ownerId = service.authenticate(authentic, 'status');
  assert.equal(ownerId, arcadeDeviceKey(owner.jwk).id);
  assert.throws(() => service.authenticate(authentic, 'status'), /could not verify/);
  assert.throws(() => service.authenticate(proof(service, owner, 'status'), 'redeem'), /could not verify/);
  const substituted = proof(service, owner, 'status'); substituted.publicKey = stranger.jwk;
  assert.throws(() => service.authenticate(substituted, 'status'), /could not verify/);
  const changed = proof(service, owner, 'redeem', 'MOTH-AAAA'); changed.code = 'MOTH-BBBB';
  assert.throws(() => service.authenticate(changed, 'redeem'), /could not verify/);
  const old = proof(service, owner, 'status'); now += 60_001;
  assert.throws(() => service.authenticate(old, 'status'), /could not verify/);
});

test('private entitlements restore independently of trimmed donation history and expire exactly at release', () => {
  let now = ARCADE_PREVIEW_END - 100_000;
  const service = new ArcadePreviewAccess({ now: () => now }), owner = key();
  const grant = service.issue({ id: randomUUID(), state: 'paid', arcadeDeviceKey: owner.jwk });
  const ownerId = service.authenticate(proof(service, owner, 'redeem', grant.code), 'redeem');
  service.redeem(ownerId, grant.code);
  const restored = new ArcadePreviewAccess({ now: () => now }); restored.restore(service.snapshot());
  assert.equal(restored.status(ownerId).unlocked, true);
  assert.equal(restored.status(ownerId).codes[0].code, grant.code);
  now = ARCADE_PREVIEW_END;
  assert.deepEqual(restored.status(ownerId), { released: true, expiresAt: now, unlocked: true, codes: [] });
  assert.equal(restored.issue({ id: randomUUID(), state: 'paid', arcadeDeviceKey: owner.jwk }), undefined);
  assert.deepEqual(restored.challenge(owner.jwk, 'status', 'host'), { released: true, expiresAt: now });
  assert.deepEqual(restored.snapshot(), [], 'preview tickets are discarded at the public release');
});

test('proof issuance is rate limited and challenge storage is bounded', () => {
  const service = new ArcadePreviewAccess({ now: () => ARCADE_PREVIEW_END - 100_000 }), owner = key();
  for (let i = 0; i < 120; i++) service.challenge(owner.jwk, 'status', 'same-address');
  assert.throws(() => service.challenge(owner.jwk, 'status', 'same-address'), error => error.status === 429);
  for (let i = service.challenges.size; i < 2048; i++) service.challenge(owner.jwk, 'status', `address-${i}`);
  assert.equal(service.challenges.size, 2048);
  assert.throws(() => service.challenge(owner.jwk, 'status', 'new-address'), error => error.status === 429);
});
