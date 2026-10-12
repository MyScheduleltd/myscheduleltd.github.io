// node --test services/moth-scoreboard/moth-scoreboard.test.mjs
// Runs the scoreboard function against an in-memory stand-in for Upstash's
// REST API (only the commands the function uses).
import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeUpstash} from './fake-upstash.mjs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const handler = require('./moth-scoreboard.js');
const {MAX_FIGHT_SCORE, MIN_RUN_SECONDS} = handler;

async function call(env, {method = 'GET', path = '/api/moth-scoreboard?mode=chill', body, origin = 'https://myscheduleltd.com', ip = '1.2.3.4'} = {}) {
  const headers = {'x-forwarded-for': ip}; if (origin) headers.origin = origin;
  const req = {method, url: path, headers, body};
  const res = {statusCode: 0, headers: {}, text: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { this.text = t; }};
  await handler(req, res, env);
  return {status: res.statusCode, headers: res.headers, json: res.text ? JSON.parse(res.text) : null};
}
const scores = (mode, scale = 0.5) => Object.fromEntries(Object.entries(MAX_FIGHT_SCORE[mode]).map(([k, max]) => [k, Math.floor(max * scale / 200) * 200]));
let n = 0;

test('scoreboard', async t => {
  const {server, url, data} = await fakeUpstash();
  const env = {KV_REST_API_URL: url, KV_REST_API_TOKEN: 'test-token', VERCEL_ENV: 'production'};
  t.after(() => server.close());
  // A story run's ticket, issued some minutes ago.
  const ticket = async (mode = 'chill', minutes = 15) => {
    const r = await call(env, {method: 'POST', ip: '3.' + (++n % 250) + '.0.1', body: {action: 'start', mode}});
    assert.equal(r.status, 201);
    const key = 'moth:ticket:' + r.json.run;
    data.set(key, JSON.stringify({...JSON.parse(data.get(key)), at: Date.now() - minutes * 60000}));
    return r.json.run;
  };

  await t.test('empty board', async () => {
    const r = await call(env);
    assert.equal(r.status, 200); assert.deepEqual(r.json, {mode: 'chill', entries: []});
    assert.equal(r.headers['access-control-allow-origin'], 'https://myscheduleltd.com');
  });
  await t.test('posts a valid run and ranks it', async () => {
    const r = await call(env, {method: 'POST', body: {mode: 'chill', id: '美麗本人', run: await ticket('chill'), scores: scores('chill')}});
    assert.equal(r.status, 201); assert.equal(r.json.rank, 1); assert.equal(r.json.entries[0].id, '美麗本人');
    assert.equal(r.json.entries[0].total, Object.values(scores('chill')).reduce((a, b) => a + b));
  });
  await t.test('rejects impossible or malformed runs', async () => {
    const over = scores('chill'); over['level1-stage1'] = 126200;
    const odd = scores('chill'); odd['level2-stage2'] = 1100;
    const missing = scores('chill'); delete missing['level6-stage2'];
    for (const s of [over, odd, missing]) assert.equal((await call(env, {method: 'POST', ip: '9.9.9.' + (++n), body: {mode: 'chill', id: 'ABC', run: await ticket('chill'), scores: s}})).json.error, 'scores');
    assert.equal((await call(env, {method: 'POST', ip: '9.9.8.1', body: {mode: 'hard', id: 'ABC', run: await ticket('chill'), scores: scores('chill')}})).json.error, 'mode');
    // A 拍片 score that is fine on 拍片 is too high for 摸魚.
    assert.equal((await call(env, {method: 'POST', ip: '9.9.8.2', body: {mode: 'chill', id: 'ABC', run: await ticket('chill'), scores: scores('shoot', 0.9)}})).json.error, 'scores');
  });
  await t.test('a run needs a ticket from its story start, on its difficulty, old enough to have played the songs', async () => {
    const post = (run, {mode = 'chill', ip = '2.2.' + (++n) + '.1'} = {}) => call(env, {method: 'POST', ip, body: {mode, id: 'TICKET', run, scores: scores(mode, 0.4)}});
    // Made up by the player: refused.
    assert.equal((await post('run-0001-abcdefghijkl')).json.error, 'run');
    assert.equal((await post('2f1d3c4b-5a69-4788-9a0b-1c2d3e4f5a6b')).json.error, 'run');
    // Issued just now: the seven songs cannot have been played yet.
    const young = await ticket('chill', MIN_RUN_SECONDS / 60 - 1);
    assert.equal((await post(young)).json.error, 'too-fast');
    // Issued for the other difficulty.
    assert.equal((await post(await ticket('shoot'))).json.error, 'run');
    // A ticket starts no board entry by itself, and one post uses it up.
    const run = await ticket('chill');
    assert.equal((await post(run)).status, 201);
    assert(!data.has('moth:ticket:' + run), 'The ticket is deleted once posted');
    assert.equal((await post(run)).json.error, 'posted');
    // Tickets need a valid difficulty, and a player starts at most 20 stories an hour.
    assert.equal((await call(env, {method: 'POST', ip: '2.3.0.1', body: {action: 'start', mode: 'hard'}})).json.error, 'mode');
    const starts = [];
    for (let i = 0; i < 21; i++) starts.push((await call(env, {method: 'POST', ip: '2.3.0.2', body: {action: 'start', mode: 'shoot'}})).status);
    assert.deepEqual([starts[19], starts[20]], [201, 429]);
    assert.match(run, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'Tickets are random UUIDs');
  });
  await t.test('IDs: 8 characters of Chinese, English or digits, no rude words', async () => {
    for (const [id, error] of [['', 'id'], ['123456789', 'id'], ['a b', 'id'], ['<script>', 'id'], ['FUCK', 'id-blocked'], ['f0ck', null], ['幹你娘', 'id-blocked'], ['Sh1t', 'id-blocked']]) {
      const r = await call(env, {method: 'POST', ip: '8.8.' + (++n) + '.1', body: {mode: 'shoot', id, run: await ticket('shoot'), scores: scores('shoot', 0.1)}});
      if (error) assert.equal(r.json.error, error, id); else assert.equal(r.status, 201, id);
    }
  });
  await t.test('a run posts once; a player posts at most 5 times in 10 minutes', async () => {
    const run = await ticket('chill');
    assert.equal((await call(env, {method: 'POST', ip: '7.7.7.7', body: {mode: 'chill', id: 'once', run, scores: scores('chill', 0.6)}})).status, 201);
    assert.equal((await call(env, {method: 'POST', ip: '7.7.7.8', body: {mode: 'chill', id: 'twice', run, scores: scores('chill', 0.6)}})).json.error, 'posted');
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await call(env, {method: 'POST', ip: '6.6.6.6', body: {mode: 'shoot', id: 'spam' + i, run: await ticket('shoot'), scores: scores('shoot', 0.2)}})).status);
    assert.deepEqual(results.slice(-1), [429]);
  });
  await t.test('keeps only the top 10; an out-scored entry is deleted; low scores are refused', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await call(env, {method: 'POST', ip: '5.5.5.' + i, body: {mode: 'chill', id: 'P' + i, run: await ticket('chill'), scores: scores('chill', 0.3 + i * 0.05)}})).json.error || 201);
    assert(statuses.every(status => status === 201));
    const board = (await call(env)).json.entries;
    assert.equal(board.length, 10);
    assert.deepEqual(board.map(e => e.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert(board.every((e, i) => i === 0 || board[i - 1].total >= e.total));
    const low = await call(env, {method: 'POST', ip: '5.5.4.1', body: {mode: 'chill', id: 'low', run: await ticket('chill'), scores: scores('chill', 0.05)}});
    assert.equal(low.status, 409); assert.equal(low.json.error, 'not-top');
  });
  await t.test('equal totals: the earlier post ranks higher', async () => {
    const s = scores('shoot', 0.95);
    await call(env, {method: 'POST', ip: '4.4.4.1', body: {mode: 'shoot', id: 'first', run: await ticket('shoot'), scores: s}});
    await new Promise(r => setTimeout(r, 1100));
    await call(env, {method: 'POST', ip: '4.4.4.2', body: {mode: 'shoot', id: 'second', run: await ticket('shoot'), scores: s}});
    const board = (await call(env, {path: '/api/moth-scoreboard?mode=shoot'})).json.entries;
    assert(board.findIndex(e => e.id === 'first') < board.findIndex(e => e.id === 'second'));
  });
  await t.test('other sites are refused; preflight works for the game', async () => {
    assert.equal((await call(env, {origin: 'https://evil.example'})).status, 403);
    const pre = await call(env, {method: 'OPTIONS'});
    assert.equal(pre.status, 204); assert.match(pre.headers['access-control-allow-methods'], /POST/);
    assert.equal((await call(env, {origin: 'http://127.0.0.1:5286'})).status, 403, 'local origins refused in production');
    assert.equal((await call({...env, VERCEL_ENV: 'preview'}, {origin: 'http://127.0.0.1:5286'})).status, 200, 'local origins allowed outside production');
  });
  await t.test('finds the storage under any integration prefix', async () => {
    assert.equal((await call({STORAGE_REST_API_URL: url, STORAGE_REST_API_TOKEN: 'test-token', VERCEL_ENV: 'production'})).status, 200);
  });
  await t.test('no storage configured -> 503', async () => {
    assert.equal((await call({})).status, 503);
  });
});
