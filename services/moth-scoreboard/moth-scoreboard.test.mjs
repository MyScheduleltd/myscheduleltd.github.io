// node --test services/moth-scoreboard/moth-scoreboard.test.mjs
// Runs the scoreboard function against an in-memory stand-in for Upstash's
// REST API (only the commands the function uses).
import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeUpstash} from './fake-upstash.mjs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const handler = require('./moth-scoreboard.js');
const {MAX_FIGHT_SCORE} = handler;

async function call(env, {method = 'GET', path = '/api/moth-scoreboard?mode=chill', body, origin = 'https://myscheduleltd.com', ip = '1.2.3.4'} = {}) {
  const headers = {'x-forwarded-for': ip}; if (origin) headers.origin = origin;
  const req = {method, url: path, headers, body};
  const res = {statusCode: 0, headers: {}, text: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { this.text = t; }};
  await handler(req, res, env);
  return {status: res.statusCode, headers: res.headers, json: res.text ? JSON.parse(res.text) : null};
}
const scores = (mode, scale = 0.5) => Object.fromEntries(Object.entries(MAX_FIGHT_SCORE[mode]).map(([k, max]) => [k, Math.floor(max * scale / 200) * 200]));
let n = 0;
const runId = () => `run-${String(++n).padStart(4, '0')}-abcdefghijkl`;

test('scoreboard', async t => {
  const {server, url} = await fakeUpstash();
  const env = {KV_REST_API_URL: url, KV_REST_API_TOKEN: 'test-token', VERCEL_ENV: 'production'};
  t.after(() => server.close());

  await t.test('empty board', async () => {
    const r = await call(env);
    assert.equal(r.status, 200); assert.deepEqual(r.json, {mode: 'chill', entries: []});
    assert.equal(r.headers['access-control-allow-origin'], 'https://myscheduleltd.com');
  });
  await t.test('posts a valid run and ranks it', async () => {
    const r = await call(env, {method: 'POST', body: {mode: 'chill', id: '美麗本人', run: runId(), scores: scores('chill')}});
    assert.equal(r.status, 201); assert.equal(r.json.rank, 1); assert.equal(r.json.entries[0].id, '美麗本人');
    assert.equal(r.json.entries[0].total, Object.values(scores('chill')).reduce((a, b) => a + b));
  });
  await t.test('rejects impossible or malformed runs', async () => {
    const over = scores('chill'); over['level1-stage1'] = 126200;
    const odd = scores('chill'); odd['level2-stage2'] = 1100;
    const missing = scores('chill'); delete missing['level6-stage2'];
    for (const s of [over, odd, missing]) assert.equal((await call(env, {method: 'POST', ip: '9.9.9.' + (++n), body: {mode: 'chill', id: 'ABC', run: runId(), scores: s}})).json.error, 'scores');
    assert.equal((await call(env, {method: 'POST', ip: '9.9.8.1', body: {mode: 'hard', id: 'ABC', run: runId(), scores: scores('chill')}})).json.error, 'mode');
    // A 拍片 score that is fine on 拍片 is too high for 摸魚.
    assert.equal((await call(env, {method: 'POST', ip: '9.9.8.2', body: {mode: 'chill', id: 'ABC', run: runId(), scores: scores('shoot', 0.9)}})).json.error, 'scores');
  });
  await t.test('IDs: 8 characters of Chinese, English or digits, no rude words', async () => {
    for (const [id, error] of [['', 'id'], ['123456789', 'id'], ['a b', 'id'], ['<script>', 'id'], ['FUCK', 'id-blocked'], ['f0ck', null], ['幹你娘', 'id-blocked'], ['Sh1t', 'id-blocked']]) {
      const r = await call(env, {method: 'POST', ip: '8.8.' + (++n) + '.1', body: {mode: 'shoot', id, run: runId(), scores: scores('shoot', 0.1)}});
      if (error) assert.equal(r.json.error, error, id); else assert.equal(r.status, 201, id);
    }
  });
  await t.test('a run posts once; a player posts at most 5 times in 10 minutes', async () => {
    const run = runId();
    assert.equal((await call(env, {method: 'POST', ip: '7.7.7.7', body: {mode: 'chill', id: 'once', run, scores: scores('chill', 0.6)}})).status, 201);
    assert.equal((await call(env, {method: 'POST', ip: '7.7.7.8', body: {mode: 'chill', id: 'twice', run, scores: scores('chill', 0.6)}})).json.error, 'posted');
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await call(env, {method: 'POST', ip: '6.6.6.6', body: {mode: 'shoot', id: 'spam' + i, run: runId(), scores: scores('shoot', 0.2)}})).status);
    assert.deepEqual(results.slice(-1), [429]);
  });
  await t.test('keeps only the top 10; an out-scored entry is deleted; low scores are refused', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await call(env, {method: 'POST', ip: '5.5.5.' + i, body: {mode: 'chill', id: 'P' + i, run: runId(), scores: scores('chill', 0.3 + i * 0.05)}})).json.error || 201);
    assert(statuses.every(status => status === 201));
    const board = (await call(env)).json.entries;
    assert.equal(board.length, 10);
    assert.deepEqual(board.map(e => e.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert(board.every((e, i) => i === 0 || board[i - 1].total >= e.total));
    const low = await call(env, {method: 'POST', ip: '5.5.4.1', body: {mode: 'chill', id: 'low', run: runId(), scores: scores('chill', 0.05)}});
    assert.equal(low.status, 409); assert.equal(low.json.error, 'not-top');
  });
  await t.test('equal totals: the earlier post ranks higher', async () => {
    const s = scores('shoot', 0.95);
    await call(env, {method: 'POST', ip: '4.4.4.1', body: {mode: 'shoot', id: 'first', run: runId(), scores: s}});
    await new Promise(r => setTimeout(r, 1100));
    await call(env, {method: 'POST', ip: '4.4.4.2', body: {mode: 'shoot', id: 'second', run: runId(), scores: s}});
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
  await t.test('no storage configured -> 503', async () => {
    assert.equal((await call({})).status, 503);
  });
});
