import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitStats, createVisitStore, recentDays, summarizeVisitDay, taiwanDay, visitIncrements } from './visit-stats.mjs';

const TOKEN = 'abcDEF123_-xyz';

test('a day starts at midnight in Taipei, not in UTC', () => {
  assert.equal(taiwanDay(Date.parse('2026-11-09T15:59:59Z')), '2026-11-09');
  assert.equal(taiwanDay(Date.parse('2026-11-09T16:00:00Z')), '2026-11-10');
  assert.deepEqual(recentDays(3, Date.parse('2026-11-09T16:00:00Z')), ['2026-11-10', '2026-11-09', '2026-11-08']);
});

test('an opened sign-in page counts its device, browser, source and a previous crash', () => {
  const { fields, unique } = visitIncrements({ e: 'open', v: TOKEN, d: 'phone', b: 'threads', s: 'threads', r: 1, c: 'world' });
  assert.deepEqual(fields, {
    open: 1, 'open:returning': 1, 'device:phone': 1, 'browser:threads': 1, 'source:threads': 1,
    crash: 1, 'crash:world': 1, 'crash:browser:threads': 1,
  });
  assert.deepEqual(unique, { u: TOKEN });
});

test('words off the fixed lists never become new tallies', () => {
  const { fields, unique } = visitIncrements({ e: 'open', v: 'x', d: 'fridge', b: '<script>', s: 'evil.example', c: 'nowhere' });
  assert.deepEqual(Object.keys(fields).sort(), ['browser:other', 'crash', 'crash:browser:other', 'crash:other', 'device:desktop', 'open', 'source:other']);
  assert.deepEqual(unique, {}, 'a token that is not a plain random string is not counted as a browser');
  assert.equal(visitIncrements({ e: 'delete-everything' }), null);
  assert.equal(visitIncrements({ e: 'leave', p: 'moon' }), null);
  assert.equal(visitIncrements(null), null);
  assert.equal(visitIncrements('open'), null);
});

test('entering keeps how long the loading took, capped', () => {
  const { fields, unique } = visitIncrements({ e: 'entered', v: TOKEN, d: 'phone', b: 'instagram', r: 0, t: 5_000 });
  assert.deepEqual(fields, { entered: 1, 'entered:browser:instagram': 1, 'entered:device:phone': 1, 'entered:seconds': 600 });
  assert.deepEqual(unique, { ue: TOKEN });
});

test('leaving during loading records how far the bar had got, in tens', () => {
  assert.deepEqual(visitIncrements({ e: 'leave', p: 'loading', b: 'instagram', g: 47 }).fields,
    { 'leave:loading': 1, 'leave:loading:browser:instagram': 1, 'leave:loading:at:40': 1 });
  assert.equal(visitIncrements({ e: 'leave', p: 'loading', g: 100 }).fields['leave:loading:at:90'], 1);
  assert.equal(visitIncrements({ e: 'leave', p: 'loading', g: -5 }).fields['leave:loading:at:0'], 1);
});

test('leaving the world records the time spent and areas visited', () => {
  assert.deepEqual(visitIncrements({ e: 'leave', p: 'world', b: 'safari', t: 474, a: 3 }).fields,
    { 'leave:world': 1, 'leave:world:browser:safari': 1, 'stay:5-15': 1, 'stay:seconds': 474, 'stay:areas': 3 });
  assert.equal(visitIncrements({ e: 'leave', p: 'world', t: 40 }).fields['stay:0-1'], 1);
  assert.equal(visitIncrements({ e: 'leave', p: 'world', t: 59 }).fields['stay:seconds'], 59, 'under a minute still counts its seconds');
  assert.equal(visitIncrements({ e: 'leave', p: 'world', t: 1e9 }).fields['stay:30+'], 1);
  assert.equal(visitIncrements({ e: 'leave', p: 'world', t: 1e9 }).fields['stay:seconds'], 14_400);
});

test('without Redis the counts live in memory and summarize per day', async () => {
  let now = Date.parse('2026-11-09T04:00:00Z');
  const stats = createVisitStats({ store: createVisitStore({ env: {} }), now: () => now });
  assert.equal(stats.persistent, false);
  await stats.record({ e: 'open', v: TOKEN, d: 'phone', b: 'instagram', s: 'instagram' }, 'a');
  await stats.record({ e: 'open', v: TOKEN, d: 'phone', b: 'instagram', s: 'instagram' }, 'a');
  await stats.record({ e: 'open', v: 'secondBrowser1', d: 'desktop', b: 'chrome', s: 'direct', r: 1 }, 'b');
  await stats.record({ e: 'start', v: TOKEN, b: 'instagram' }, 'a');
  await stats.record({ e: 'leave', v: TOKEN, p: 'loading', b: 'instagram', g: 62 }, 'a');
  await stats.record({ e: 'entered', v: 'secondBrowser1', d: 'desktop', b: 'chrome', r: 1, t: 12 }, 'b');
  await stats.record({ e: 'leave', v: 'secondBrowser1', p: 'world', b: 'chrome', t: 18 * 60 + 5, a: 4 }, 'b');
  const { days, persistent } = await stats.summary(2);
  assert.equal(persistent, false);
  assert.equal(days.length, 2);
  const today = days[0];
  assert.equal(today.day, '2026-11-09');
  assert.equal(today.opened, 3);
  assert.equal(today.uniqueBrowsers, 2);
  assert.equal(today.returning, 1);
  assert.equal(today.started, 1);
  assert.equal(today.entered, 1);
  assert.equal(today.enteredUnique, 1);
  assert.equal(today.enteredReturning, 1);
  assert.equal(today.averageLoadSeconds, 12);
  assert.deepEqual(today.devices, { phone: 2, tablet: 0, desktop: 1 });
  assert.equal(today.sources.instagram, 2);
  assert.deepEqual(today.browsers.instagram, { opened: 2, started: 1, entered: 0, leftLoading: 1, crashed: 0 });
  assert.equal(today.leftLoadingAt['60%'], 1);
  assert.deepEqual(today.stay, { '0-1': 0, '1-5': 0, '5-15': 0, '15-30': 1, '30+': 0 });
  assert.equal(today.averageMinutes, 18.1);
  assert.equal(today.averageAreas, 4);
  assert.equal(days[1].opened, 0, 'a day nobody came still has a row');
  now += 86_400_000;
  assert.equal((await stats.summary(1)).days[0].day, '2026-11-10', 'the cache is per span and expires');
});

test('one address cannot flood the counters', async () => {
  const stats = createVisitStats({ store: createVisitStore({ env: {} }), perAddressLimit: 3 });
  const results = [];
  for (let i = 0; i < 5; i += 1) results.push(await stats.record({ e: 'open', b: 'chrome' }, 'same'));
  assert.deepEqual(results, [true, true, true, false, false]);
  assert.equal(await stats.record({ e: 'open', b: 'chrome' }, 'other'), true);
  assert.equal(await stats.record({ e: 'bogus' }, 'third'), false);
});

test('with Redis each report is one pipeline of atomic increments that expire', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, commands: JSON.parse(init.body) });
    return { ok: true, json: async () => JSON.parse(init.body).map(() => ({ result: 1 })) };
  };
  const store = createVisitStore({ env: { UPSTASH_REDIS_REST_URL: 'https://kv.example/', UPSTASH_REDIS_REST_TOKEN: 't0k' }, fetchImpl });
  assert.equal(store.enabled, true);
  await store.record('2026-11-09', visitIncrements({ e: 'open', v: TOKEN, d: 'phone', b: 'threads', s: 'threads' }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://kv.example/pipeline');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t0k');
  assert.deepEqual(calls[0].commands, [
    ['HINCRBY', 'festival:visits:2026-11-09', 'open', '1'],
    ['HINCRBY', 'festival:visits:2026-11-09', 'device:phone', '1'],
    ['HINCRBY', 'festival:visits:2026-11-09', 'browser:threads', '1'],
    ['HINCRBY', 'festival:visits:2026-11-09', 'source:threads', '1'],
    ['EXPIRE', 'festival:visits:2026-11-09', String(120 * 86_400)],
    ['PFADD', 'festival:visits:2026-11-09:u', TOKEN],
    ['EXPIRE', 'festival:visits:2026-11-09:u', String(120 * 86_400)],
  ]);
  assert.ok(!JSON.stringify(calls[0].commands).includes('address'), 'nothing about the visitor but the random token is sent');
});

test('Redis reads come back as one pipeline and parse into summaries', async () => {
  const fetchImpl = async (_url, init) => {
    const commands = JSON.parse(init.body);
    assert.deepEqual(commands.map((command) => command[0]), ['HGETALL', 'PFCOUNT', 'PFCOUNT', 'HGETALL', 'PFCOUNT', 'PFCOUNT']);
    return { ok: true, json: async () => [
      { result: ['open', '5', 'entered', '2', 'browser:instagram', '4', 'leave:world', '2', 'stay:seconds', '540'] },
      { result: 4 }, { result: 2 },
      { result: [] }, { result: 0 }, { result: 0 },
    ] };
  };
  const store = createVisitStore({ env: { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'x' }, fetchImpl });
  const [today, yesterday] = await store.read(['2026-11-09', '2026-11-08']);
  const summary = summarizeVisitDay('2026-11-09', today);
  assert.equal(summary.opened, 5);
  assert.equal(summary.uniqueBrowsers, 4);
  assert.equal(summary.enteredUnique, 2);
  assert.equal(summary.browsers.instagram.opened, 4);
  assert.equal(summary.averageMinutes, 4.5);
  assert.equal(summarizeVisitDay('2026-11-08', yesterday).opened, 0);
});

test('a Redis failure is not thrown at the visitor and is logged once a minute at most', async () => {
  const warnings = [];
  const store = createVisitStore({ env: { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'x' }, fetchImpl: async () => ({ ok: false, status: 503 }) });
  const stats = createVisitStats({ store, warn: (line) => warnings.push(line) });
  assert.equal(await stats.record({ e: 'open', b: 'chrome' }, 'a'), false);
  assert.equal(await stats.record({ e: 'open', b: 'chrome' }, 'a'), false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /503/);
});
