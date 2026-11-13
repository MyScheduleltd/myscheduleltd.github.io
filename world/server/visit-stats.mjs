/**
 * Anonymous visit counters (the owner, 2026-11-09).
 *
 * The owner could only tell that few people came back because nobody was
 * ever online. That cannot separate "nobody comes" from "people come and the
 * page fails them", and most visitors arrive from Instagram and Threads on
 * phones, inside those apps' own browsers. So each visit reports a handful of
 * moments: the sign-in page opened, ENTER pressed, the world shown, and the
 * page left (from the gate, during loading or from inside). It also reports
 * the stage at which the previous visit on this browser crashed, if it did.
 *
 * Nothing personal is kept. A visit carries a random token that the browser
 * made up, used only to count distinct browsers per day. Redis keeps that in a
 * HyperLogLog, which cannot give the token back. The rest is per-day tallies
 * of fixed words: device kind, which app's browser, where the link came from.
 * No names, no addresses and no IPs are stored. Tallies expire after
 * VISIT_RETAIN_DAYS.
 *
 * Storage is the same Upstash Redis as the wish wall and the weather. The
 * service sleeps and redeploys from nothing, so memory alone would lose every
 * count. With no Redis configured (local review), counts live in memory.
 */
import { upstashClient } from './upstash.mjs';
export const VISIT_KEY_PREFIX = 'festival:visits:';
export const VISIT_RETAIN_DAYS = 120;
const RETAIN_SECONDS = VISIT_RETAIN_DAYS * 86_400;

export const VISIT_DEVICES = ['phone', 'tablet', 'desktop'];
export const VISIT_BROWSERS = ['instagram', 'threads', 'facebook', 'line', 'inapp', 'safari', 'chrome', 'firefox', 'edge', 'other'];
export const VISIT_SOURCES = ['instagram', 'threads', 'facebook', 'search', 'direct', 'other'];
/** Where a visit was when the page went away. */
export const VISIT_PHASES = ['gate', 'loading', 'world'];
/** The previous visit's last black-box checkpoint, when it ended without saying goodbye. */
export const VISIT_CRASH_STAGES = ['world', 'world-ready', 'loading', 'other'];
const STAY_BUCKETS = [[1, '0-1'], [5, '1-5'], [15, '5-15'], [30, '15-30'], [Infinity, '30+']];
export const VISIT_STAY_BUCKETS = STAY_BUCKETS.map(([, name]) => name);
const TOKEN = /^[A-Za-z0-9_-]{8,40}$/;

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const count = (value, max) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, max) : 0;
};

/** The festival keeps Taiwan time, so a day starts at 00:00 in Taipei. */
export const taiwanDay = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

/** The last `days` Taiwan days, newest first. */
export const recentDays = (days, now = Date.now()) => Array.from({ length: days }, (_, index) => taiwanDay(now - index * 86_400_000));

/**
 * One reported moment, reduced to the tallies it adds. Anything not on the
 * fixed lists becomes `other` or is dropped. A malformed report adds nothing.
 */
export function visitIncrements(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const token = typeof payload.v === 'string' && TOKEN.test(payload.v) ? payload.v : undefined;
  const device = pick(payload.d, VISIT_DEVICES, 'desktop');
  const browser = pick(payload.b, VISIT_BROWSERS, 'other');
  const returning = payload.r === 1 || payload.r === true;
  const fields = {};
  const add = (field, amount = 1) => { if (amount) fields[field] = (fields[field] ?? 0) + amount; };
  const unique = {};
  switch (payload.e) {
    case 'open': {
      add('open');
      if (returning) add('open:returning');
      add(`device:${device}`);
      add(`browser:${browser}`);
      add(`source:${pick(payload.s, VISIT_SOURCES, 'other')}`);
      if (payload.c !== undefined) {
        const stage = pick(payload.c, VISIT_CRASH_STAGES, 'other');
        add('crash');
        add(`crash:${stage}`);
        add(`crash:browser:${browser}`);
      }
      if (token) unique.u = token;
      break;
    }
    case 'start':
      add('start');
      add(`start:browser:${browser}`);
      break;
    case 'entered':
      add('entered');
      add(`entered:browser:${browser}`);
      add(`entered:device:${device}`);
      if (returning) add('entered:returning');
      add('entered:seconds', count(payload.t, 600));
      if (token) unique.ue = token;
      break;
    case 'leave': {
      const phase = pick(payload.p, VISIT_PHASES, undefined);
      if (!phase) return null;
      add(`leave:${phase}`);
      add(`leave:${phase}:browser:${browser}`);
      if (phase === 'loading') add(`leave:loading:at:${Math.min(9, Math.floor(count(payload.g, 100) / 10)) * 10}`);
      if (phase === 'world') {
        // Seconds, so that a visit of under a minute still has a length.
        const seconds = count(payload.t, 14_400);
        add(`stay:${STAY_BUCKETS.find(([limit]) => seconds / 60 < limit)[1]}`);
        add('stay:seconds', seconds);
        add('stay:areas', count(payload.a, 12));
      }
      break;
    }
    default:
      return null;
  }
  return { fields, unique };
}

function memoryStore() {
  const days = new Map();
  const day = (key) => {
    if (!days.has(key)) days.set(key, { fields: new Map(), u: new Set(), ue: new Set() });
    return days.get(key);
  };
  return {
    enabled: false,
    async record(key, { fields, unique }) {
      const entry = day(key);
      for (const [field, amount] of Object.entries(fields)) entry.fields.set(field, (entry.fields.get(field) ?? 0) + amount);
      if (unique.u) entry.u.add(unique.u);
      if (unique.ue) entry.ue.add(unique.ue);
      const oldest = taiwanDay(Date.now() - RETAIN_SECONDS * 1000);
      for (const saved of days.keys()) if (saved < oldest) days.delete(saved);
    },
    async read(keys) {
      return keys.map((key) => {
        const entry = days.get(key);
        return { fields: Object.fromEntries(entry?.fields ?? []), unique: entry?.u.size ?? 0, enteredUnique: entry?.ue.size ?? 0 };
      });
    },
  };
}

/**
 * Redis through Upstash's REST pipeline: every tally of one report goes in one
 * request, and every day's read in one more. Counting is HINCRBY and PFADD,
 * both atomic, so two visits landing together can never overwrite each other.
 */
export function createVisitStore({ env = process.env, fetchImpl = globalThis.fetch, prefix = VISIT_KEY_PREFIX, requestTimeoutMs = 4_000 } = {}) {
  const database = upstashClient({ env, fetchImpl, requestTimeoutMs, label: 'visit storage' });
  if (!database) return memoryStore();
  const { pipeline } = database;
  return {
    enabled: true,
    async record(day, { fields, unique }) {
      const key = `${prefix}${day}`;
      const commands = Object.entries(fields).map(([field, amount]) => ['HINCRBY', key, field, String(amount)]);
      commands.push(['EXPIRE', key, String(RETAIN_SECONDS)]);
      for (const set of ['u', 'ue']) {
        if (!unique[set]) continue;
        commands.push(['PFADD', `${key}:${set}`, unique[set]], ['EXPIRE', `${key}:${set}`, String(RETAIN_SECONDS)]);
      }
      await pipeline(commands);
    },
    async read(days) {
      const results = await pipeline(days.flatMap((day) => [
        ['HGETALL', `${prefix}${day}`], ['PFCOUNT', `${prefix}${day}:u`], ['PFCOUNT', `${prefix}${day}:ue`],
      ]));
      return days.map((_, index) => {
        const flat = Array.isArray(results[index * 3]) ? results[index * 3] : [];
        const fields = {};
        for (let at = 0; at + 1 < flat.length; at += 2) fields[flat[at]] = Number(flat[at + 1]) || 0;
        return { fields, unique: Number(results[index * 3 + 1]) || 0, enteredUnique: Number(results[index * 3 + 2]) || 0 };
      });
    },
  };
}

const byPrefix = (fields, prefix, names) => Object.fromEntries(names.map((name) => [name, fields[`${prefix}${name}`] ?? 0]));

/** One day's tallies as STAFF read them. */
export function summarizeVisitDay(day, { fields, unique, enteredUnique }) {
  const value = (field) => fields[field] ?? 0;
  const stays = value('leave:world');
  return {
    day,
    opened: value('open'),
    uniqueBrowsers: unique,
    returning: value('open:returning'),
    started: value('start'),
    entered: value('entered'),
    enteredUnique,
    enteredReturning: value('entered:returning'),
    averageLoadSeconds: value('entered') ? Math.round(value('entered:seconds') / value('entered')) : 0,
    devices: byPrefix(fields, 'device:', VISIT_DEVICES),
    sources: byPrefix(fields, 'source:', VISIT_SOURCES),
    browsers: Object.fromEntries(VISIT_BROWSERS.map((browser) => [browser, {
      opened: value(`browser:${browser}`),
      started: value(`start:browser:${browser}`),
      entered: value(`entered:browser:${browser}`),
      leftLoading: value(`leave:loading:browser:${browser}`),
      crashed: value(`crash:browser:${browser}`),
    }])),
    left: byPrefix(fields, 'leave:', VISIT_PHASES),
    leftLoadingAt: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`${index * 10}%`, value(`leave:loading:at:${index * 10}`)])),
    crashes: value('crash'),
    crashStages: byPrefix(fields, 'crash:', VISIT_CRASH_STAGES),
    stay: byPrefix(fields, 'stay:', VISIT_STAY_BUCKETS),
    averageMinutes: stays ? Math.round((value('stay:seconds') / 60 / stays) * 10) / 10 : 0,
    averageAreas: stays ? Math.round((value('stay:areas') / stays) * 10) / 10 : 0,
  };
}

/**
 * The service's side: record a report (best effort, never awaited by the
 * visitor), cap how often one address can report, and read summaries for
 * STAFF with a short cache so an open panel does not spend Redis commands.
 */
export function createVisitStats({ store = createVisitStore(), now = () => Date.now(), warn = console.warn,
  perAddressLimit = 60, windowMs = 10 * 60_000, cacheMs = 60_000 } = {}) {
  const recent = new Map();
  const cache = new Map();
  let warned = 0;
  const allowed = (address) => {
    const at = now();
    if (recent.size > 5_000) for (const [key, entry] of recent) if (entry.resetAt <= at) recent.delete(key);
    const entry = recent.get(address);
    if (!entry || entry.resetAt <= at) { recent.set(address, { count: 1, resetAt: at + windowMs }); return true; }
    entry.count += 1;
    return entry.count <= perAddressLimit;
  };
  return {
    persistent: store.enabled,
    /** Resolves to whether the report was counted. */
    async record(payload, address = 'unknown') {
      const increments = visitIncrements(payload);
      if (!increments || !Object.keys(increments.fields).length || !allowed(address)) return false;
      try {
        await store.record(taiwanDay(now()), increments);
        cache.clear();
        return true;
      } catch (error) {
        // At most one line a minute: a Redis outage must not flood the log.
        if (now() - warned > 60_000) { warned = now(); warn(`Visit counter not saved: ${error instanceof Error ? error.message : error}`); }
        return false;
      }
    },
    async summary(days = 14) {
      const span = Math.max(1, Math.min(60, Math.floor(Number(days)) || 14));
      const cached = cache.get(span);
      if (cached && now() - cached.at < cacheMs) return cached.value;
      const keys = recentDays(span, now());
      const rows = await store.read(keys);
      const value = { persistent: store.enabled, timeZone: 'Asia/Taipei', days: keys.map((day, index) => summarizeVisitDay(day, rows[index])) };
      cache.set(span, { at: now(), value });
      return value;
    },
  };
}
