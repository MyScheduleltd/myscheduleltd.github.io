// M.O.T.H final scoreboard: a Vercel Function on the beauty-boy project,
// storing each difficulty's top 10 in Upstash Redis (Vercel Marketplace).
//
//   GET  /api/moth-scoreboard?mode=chill|shoot
//        -> { mode, entries: [{ rank, id, total, at }] }
//   POST /api/moth-scoreboard  { action: "start", mode }
//        -> 201 { run }        a ticket for a new story run
//   POST /api/moth-scoreboard  { mode, id, run, scores: { <stageId>: n, ... } }
//        -> 201 { mode, rank, entries } | 4xx { error }
//
// The total is the sum of the score of the attempt that cleared each of the
// seven story fights. Scores come from the player's browser, so the server
// accepts only totals a real run can reach: every fight present, each a
// multiple of 200 (perfect 1000, good 600, hold 1000) and no more than that
// fight's chart allows on that difficulty. The run must also have been
// played: STORY MODE takes a ticket from this server when the story starts,
// and a score is accepted only once that ticket is MIN_RUN_SECONDS old, on
// the ticket's own difficulty. A run posts once; a player starts at most 20
// stories an hour and posts at most 5 times in 10 minutes. Only the top 10
// per difficulty are kept: a new score that enters removes the 11th, and it
// is deleted.
//
// Environment (added by the Upstash for Redis integration): KV_REST_API_URL
// and KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL and _TOKEN.
'use strict';
const crypto = require('node:crypto');

// Highest score each fight's chart allows: 1000 x (notes + holds), read from
// the game's own note lists (release mobile-deck-20261012a, with level 2's
// drum break charted on 2026-10-13: scripts/moth-chart-patches.mjs).
const MAX_FIGHT_SCORE = {
  chill: { 'level1-stage1': 126000, 'level2-stage2': 127000, 'level3-stage2': 155000, 'level4-stage1': 182000, 'studio-stage1': 192000, 'level5-stage2': 245000, 'level6-stage2': 263000 },
  shoot: { 'level1-stage1': 203000, 'level2-stage2': 209000, 'level3-stage2': 263000, 'level4-stage1': 194000, 'studio-stage1': 295000, 'level5-stage2': 336000, 'level6-stage2': 341000 }
};
const FIGHTS = Object.keys(MAX_FIGHT_SCORE.chill);
// Each fight ends when its song does, and the seven songs last 836 s. The
// game asks for its ticket again until the first fight is cleared, which
// leaves 751 s of songs; 12 minutes is below both.
const MIN_RUN_SECONDS = 720;
const TICKET_SECONDS = 60 * 60 * 24 * 60;
const TOP = 10;
const ALLOWED_ORIGINS = new Set(['https://myscheduleltd.com', 'https://www.myscheduleltd.com', 'https://beauty-boy.vercel.app']);
// Up to 8 characters of Chinese, English letters or digits.
const ID_PATTERN = /^[\p{Script=Han}A-Za-z0-9]{1,8}$/u;
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigg', 'fag', 'rape', 'porn', 'nazi', 'hitler', 'slut', 'whore',
  '幹你', '幹妳', '幹您', '操你', '肏', '屌', '雞巴', '機掰', '機八', '雞掰', '靠北', '靠杯', '他媽', '他马', '你媽', '妳媽', '婊', '屄', '賤人', '王八', '智障', '白痴', '白癡', '去死', '強姦', '性交', '台獨', '支那'];

function cleanId(raw) {
  const id = String(raw ?? '').normalize('NFKC').trim();
  if (!ID_PATTERN.test(id)) return { error: 'id' };
  const folded = id.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
  if (BLOCKED.some(word => folded.includes(word) || id.includes(word))) return { error: 'id-blocked' };
  return { id };
}

function checkRun(mode, scores) {
  const limits = MAX_FIGHT_SCORE[mode];
  if (!limits || !scores || typeof scores !== 'object') return { error: 'scores' };
  const keys = Object.keys(scores);
  if (keys.length !== FIGHTS.length || !FIGHTS.every(stage => keys.includes(stage))) return { error: 'scores' };
  let total = 0;
  for (const stage of FIGHTS) {
    const value = scores[stage];
    if (!Number.isInteger(value) || value < 0 || value % 200 !== 0 || value > limits[stage]) return { error: 'scores' };
    total += value;
  }
  return { total };
}

// Equal totals: the earlier post ranks higher. The fraction (below 1, so it
// never outweighs a 200-point difference) falls 1e-9 per second from 2023:
// totals reach ~1.8e6, where a double still resolves ~2.3e-10, so every
// second stays distinct until 2055.
const rankScore = (total, at) => total + Math.min(0.999999, Math.max(0, 1 - (Math.floor(at / 1000) - 1.7e9) / 1e9));

function redis(env = process.env) {
  // The integration names its variables <prefix>_REST_API_URL / _TOKEN.
  const prefixed = Object.keys(env).find(key => /_REST_API_URL$/.test(key) && env[key.replace(/_URL$/, '_TOKEN')]);
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || (prefixed && env[prefixed]);
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || (prefixed && env[prefixed.replace(/_URL$/, '_TOKEN')]);
  if (!url || !token) return null;
  const call = async (path, body) => {
    const response = await fetch(url.replace(/\/$/, '') + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`storage ${response.status}`);
    return response.json();
  };
  return {
    command: async (...args) => (await call('', args)).result,
    pipeline: async commands => (await call('/pipeline', commands)).map(item => item.result)
  };
}

// True once a key has been counted more than `most` times in `seconds`.
async function overLimit(store, key, seconds, most) {
  const [, count] = await store.pipeline([['SET', key, 0, 'EX', seconds, 'NX'], ['INCR', key]]);
  return count > most;
}

// A burst of board views costs one storage read per board every few seconds.
const boardCache = new Map();
async function readBoard(store, mode, { fresh = false } = {}) {
  const cached = boardCache.get(mode);
  if (!fresh && cached && Date.now() - cached.at < 5000) return cached.entries;
  const entries = await readStoredBoard(store, mode);
  boardCache.set(mode, { at: Date.now(), entries });
  return entries;
}

async function readStoredBoard(store, mode) {
  const raw = await store.command('ZREVRANGE', `moth:board:${mode}`, 0, TOP - 1);
  return (raw || []).map((member, index) => {
    const entry = JSON.parse(member);
    return { rank: index + 1, id: entry.id, total: entry.total, at: entry.at };
  });
}

function send(res, status, body, origin) {
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(body === null ? '' : JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 4096) throw new Error('too large'); }
  return JSON.parse(text || '{}');
}

async function handler(req, res, env = process.env) {
  const requestOrigin = req.headers.origin;
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(requestOrigin || '') && env.VERCEL_ENV !== 'production';
  const origin = ALLOWED_ORIGINS.has(requestOrigin) || local ? requestOrigin : null;
  if (req.method === 'OPTIONS') {
    if (origin) {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    return send(res, origin ? 204 : 403, null, origin);
  }
  if (requestOrigin && !origin) return send(res, 403, { error: 'origin' }, null);
  const store = redis(env);
  if (!store) return send(res, 503, { error: 'storage' }, origin);
  const url = new URL(req.url, 'http://local');
  try {
    if (req.method === 'GET') {
      const mode = url.searchParams.get('mode');
      if (!MAX_FIGHT_SCORE[mode]) return send(res, 400, { error: 'mode' }, origin);
      return send(res, 200, { mode, entries: await readBoard(store, mode) }, origin);
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' }, origin);
    const body = await readBody(req);
    const mode = body.mode;
    if (!MAX_FIGHT_SCORE[mode]) return send(res, 400, { error: 'mode' }, origin);
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (body.action === 'start') {
      if (await overLimit(store, `moth:starts:${ip}`, 3600, 20)) return send(res, 429, { error: 'rate' }, origin);
      const run = crypto.randomUUID();
      await store.command('SET', `moth:ticket:${run}`, JSON.stringify({ mode, at: Date.now() }), 'EX', TICKET_SECONDS);
      return send(res, 201, { run }, origin);
    }
    const name = cleanId(body.id);
    if (name.error) return send(res, 400, { error: name.error }, origin);
    const run = checkRun(mode, body.scores);
    if (run.error) return send(res, 400, { error: run.error }, origin);
    const runId = String(body.run || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId)) return send(res, 400, { error: 'run' }, origin);
    if (await overLimit(store, `moth:rate:${ip}`, 600, 5)) return send(res, 429, { error: 'rate' }, origin);
    const [ticketJson, posted] = await store.pipeline([['GET', `moth:ticket:${runId}`], ['EXISTS', `moth:run:${runId}`]]);
    if (posted) return send(res, 409, { error: 'posted', entries: await readBoard(store, mode) }, origin);
    const ticket = ticketJson ? JSON.parse(ticketJson) : null;
    if (ticket?.mode !== mode) return send(res, 400, { error: 'run' }, origin);
    if (Date.now() - ticket.at < MIN_RUN_SECONDS * 1000) return send(res, 400, { error: 'too-fast' }, origin);
    const board = `moth:board:${mode}`;
    const [count, lowest] = await store.pipeline([['ZCARD', board], ['ZRANGE', board, 0, 0, 'WITHSCORES']]);
    if (count >= TOP && lowest?.length && run.total <= Math.floor(Number(lowest[1]))) return send(res, 409, { error: 'not-top', entries: await readBoard(store, mode, { fresh: true }) }, origin);
    // One post per story run.
    if (await store.command('SET', `moth:run:${runId}`, '1', 'NX', 'EX', 60 * 60 * 24 * 90) !== 'OK') return send(res, 409, { error: 'posted', entries: await readBoard(store, mode) }, origin);
    const at = Date.now();
    const member = JSON.stringify({ id: name.id, total: run.total, at, run: runId, scores: body.scores });
    await store.pipeline([['ZADD', board, rankScore(run.total, at), member], ['ZREMRANGEBYRANK', board, 0, -(TOP + 1)], ['DEL', `moth:ticket:${runId}`]]);
    const entries = await readBoard(store, mode, { fresh: true });
    const mine = entries.find(entry => entry.at === at && entry.id === name.id);
    return send(res, mine ? 201 : 409, mine ? { mode, rank: mine.rank, entries } : { error: 'not-top', entries }, origin);
  } catch (error) {
    return send(res, error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'json' : 'server' }, origin);
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.MAX_FIGHT_SCORE = MAX_FIGHT_SCORE;
module.exports.MIN_RUN_SECONDS = MIN_RUN_SECONDS;
module.exports.cleanId = cleanId;
module.exports.checkRun = checkRun;
