import test from 'node:test';
import assert from 'node:assert/strict';
import { createWishStore, createWishPersistence, mergeWishes, WISH_STORE_KEY } from './wish-store.mjs';

const fakeUpstash = (fail = false) => {
  const stored = new Map(), calls = [];
  const fetchImpl = async (url, init) => {
    const args = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization, args });
    if (fail) return { ok: false, status: 503, json: async () => ({}) };
    if (args[0] === 'SET') { stored.set(args[1], args[2]); return { ok: true, json: async () => ({ result: 'OK' }) }; }
    return { ok: true, json: async () => ({ result: stored.get(args[1]) ?? null }) };
  };
  return { stored, calls, fetchImpl };
};

test('without Upstash settings the store is off and the wall stays as it was', async () => {
  const { calls, fetchImpl } = fakeUpstash();
  const store = createWishStore({ env: {}, fetchImpl });
  assert.equal(store.enabled, false);
  assert.deepEqual(await store.load(), []);
  await store.save([{ id: 'a', message: 'x' }]);
  assert.equal(calls.length, 0);
});

test('either naming of the settings works, and the whole wall is one value under one key', async () => {
  for (const env of [
    { UPSTASH_REDIS_REST_URL: 'https://up.example/', UPSTASH_REDIS_REST_TOKEN: 't1' },
    { KV_REST_API_URL: 'https://up.example', KV_REST_API_TOKEN: 't1' },
  ]) {
    const { stored, calls, fetchImpl } = fakeUpstash();
    const store = createWishStore({ env, fetchImpl });
    assert.equal(store.enabled, true);
    const wall = [{ id: 'a', name: 'GUEST', message: '祝福', at: 1 }];
    await store.save(wall);
    assert.deepEqual(calls[0], { url: 'https://up.example', auth: 'Bearer t1', args: ['SET', WISH_STORE_KEY, JSON.stringify(wall)] });
    assert.deepEqual(await store.load(), wall);
    assert.ok(stored.has(WISH_STORE_KEY));
  }
});

test('saves land in order, so the last change is what stays', async () => {
  const { stored, fetchImpl } = fakeUpstash();
  const store = createWishStore({ env: { UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }, fetchImpl });
  void store.save([{ id: 'a', message: 'one' }]);
  void store.save([{ id: 'a', message: 'one' }, { id: 'b', message: 'two' }]);
  await store.save([{ id: 'b', message: 'two' }]);
  assert.deepEqual(JSON.parse(stored.get(WISH_STORE_KEY)), [{ id: 'b', message: 'two' }]);
});

test('storage errors reach the retry controller instead of pretending the wall was saved', async () => {
  const { fetchImpl } = fakeUpstash(true);
  const store = createWishStore({ env: { UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }, fetchImpl });
  await assert.rejects(store.save([{ id: 'a', message: 'x' }]), /503/);
  await assert.rejects(store.load());
});

const until = async (check) => {
  const deadline = Date.now() + 1_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'wish persistence settled before the deadline');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

test('a delayed startup read merges new notes and STAFF removals before its first write', async () => {
  let releaseLoad;
  const writes = [], wishes = [{ id: 'remove', message: 'on the wall', at: 2 }];
  const store = { enabled: true, load: () => new Promise((resolve) => { releaseLoad = resolve; }),
    save: async (wall) => { writes.push(structuredClone(wall)); } };
  const persistence = createWishPersistence({ store, wishes, limit: 30 });
  try {
    wishes.push({ id: 'new', message: 'paid during startup', at: 3 }); persistence.changed();
    wishes.splice(0, 1); persistence.changed('remove');
    assert.deepEqual(writes, [], 'an incomplete startup wall cannot replace retained history');
    releaseLoad([{ id: 'old', message: 'retained', at: 1 }, { id: 'remove', message: 'old version', at: 2 }]);
    assert.equal(await persistence.flush(), true);
    assert.deepEqual(writes.at(-1).map((w) => w.id), ['old', 'new']);
    assert.deepEqual(wishes.map((w) => w.id), ['old', 'new']);
  } finally { persistence.dispose(); }
});

test('an initial GET outage retries without a SET, and saves the recovered history with newer notes', async () => {
  let reads = 0;
  const writes = [], warnings = [], wishes = [];
  const store = { enabled: true, load: async () => {
    if (++reads === 1) throw new Error('503');
    return [{ id: 'old', message: 'must survive', at: 1 }];
  }, save: async (wall) => { writes.push(structuredClone(wall)); } };
  const persistence = createWishPersistence({ store, wishes, limit: 30, retryDelaysMs: [10], warn: (text) => warnings.push(text) });
  try {
    wishes.push({ id: 'new', message: 'payment still works', at: 2 });
    assert.equal(persistence.changed(), undefined, 'payment handling does not await storage');
    assert.deepEqual(writes, []);
    await until(() => writes.length === 1);
    assert.equal(reads, 2); assert.equal(warnings.length, 1);
    assert.deepEqual(writes[0].map((w) => w.id), ['old', 'new']);
  } finally { persistence.dispose(); }
});

test('failed SETs retry the latest revision, including edits made while an earlier write was pending', async () => {
  let releaseWrite, attempts = 0;
  const writes = [], wishes = [];
  const store = { enabled: true, load: async () => [], save: async (wall) => {
    const snapshot = structuredClone(wall);
    if (++attempts === 1) await new Promise((resolve, reject) => { releaseWrite = () => reject(new Error('offline')); });
    writes.push(snapshot);
  } };
  const persistence = createWishPersistence({ store, wishes, limit: 30, retryDelaysMs: [5], warn: () => {} });
  try {
    wishes.push({ id: 'a', message: 'first', at: 1 }); persistence.changed();
    await until(() => Boolean(releaseWrite));
    wishes.push({ id: 'b', message: 'second', at: 2 }); persistence.changed();
    wishes.splice(0, 1); persistence.changed('a');
    releaseWrite();
    await until(() => writes.length === 1);
    assert.deepEqual(writes[0].map((w) => w.id), ['b']);
    assert.equal(await persistence.flush(), true);
  } finally { persistence.dispose(); }
});

test('GET retry bursts are bounded, never overwrite unread history, and resume on a later change', async () => {
  let reads = 0, fail = true;
  const writes = [], wishes = [];
  const store = { enabled: true, load: async () => {
    reads++;
    if (fail) throw new Error('offline');
    return [{ id: 'old', message: 'retained', at: 1 }];
  }, save: async (wall) => writes.push(structuredClone(wall)) };
  const persistence = createWishPersistence({ store, wishes, limit: 30, retryDelaysMs: [1, 1], warn: () => {} });
  try {
    wishes.push({ id: 'a', message: 'in memory', at: 2 }); persistence.changed();
    await until(() => reads === 3);
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(reads, 3); assert.deepEqual(writes, []);
    fail = false;
    wishes.push({ id: 'b', message: 'recovery', at: 3 }); persistence.changed();
    assert.equal(await persistence.flush(), true);
    assert.deepEqual(writes.at(-1).map((w) => w.id), ['old', 'a', 'b']);
  } finally { persistence.dispose(); }
});

test('shutdown flush has a deadline and disposal prevents a late GET from writing an abandoned wall', async () => {
  let releaseRead;
  const writes = [], wishes = [];
  const store = { enabled: true, load: () => new Promise((resolve) => { releaseRead = resolve; }),
    save: async (wall) => writes.push(structuredClone(wall)) };
  const persistence = createWishPersistence({ store, wishes, limit: 30 });
  wishes.push({ id: 'new', message: 'waiting for the retained wall', at: 2 }); persistence.changed();
  assert.equal(await persistence.flush(10), false, 'an unavailable store cannot hold shutdown forever');
  persistence.dispose();
  releaseRead([{ id: 'old', message: 'retained', at: 1 }]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(writes, [], 'a late callback cannot overwrite unread or abandoned history');
});

test('the saved wall and notes posted while loading merge once each, oldest first, newest thirty', () => {
  const saved = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, message: `saved ${i}`, at: i }));
  const live = [{ id: 'live', message: 'posted during the load', at: 100 }, { id: 's29', message: 'saved 29', at: 29 }];
  const merged = mergeWishes([...saved, { id: '', message: 'no id' }, { id: 'x' }], live, 30);
  assert.equal(merged.length, 30);
  assert.equal(merged[0].id, 's1', 'the oldest saved note made room');
  assert.equal(merged.at(-1).id, 'live');
  assert.equal(new Set(merged.map((w) => w.id)).size, 30, 'each note once');
  assert.deepEqual(mergeWishes([{ id: 'a', message: 'raw', at: 1 }], [], 30, (w) => ({ ...w, message: w.message.toUpperCase() })).map((w) => w.message), ['RAW']);
});
