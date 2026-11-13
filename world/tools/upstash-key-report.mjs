// A read-only list of what the festival's Upstash database holds (the owner,
// 2026-11-12: "make sure everything is organized and clean").
//
// Run it yourself, with the database's READ-ONLY token from the Upstash
// console (Details -> REST API -> Read-Only Token). Nothing is written, and no
// value is ever read: only each key's name, type, size and time to live.
//
//   UPSTASH_REDIS_REST_URL=https://….upstash.io \
//   UPSTASH_REDIS_REST_TOKEN=<read-only token> \
//   node tools/upstash-key-report.mjs
//
// Keys the service writes (server/wish-store.mjs, weather-store.mjs,
// visit-stats.mjs) are marked "expected"; anything else is listed as a
// possible leftover for the owner to decide on. Deleting is never done here.
const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (the read-only token).');
  process.exit(1);
}

/** Only these commands are ever sent. */
const READ_ONLY = new Set(['SCAN', 'TYPE', 'TTL', 'MEMORY', 'STRLEN', 'HLEN', 'LLEN', 'SCARD', 'ZCARD', 'DBSIZE']);
async function pipeline(commands) {
  for (const [name] of commands) if (!READ_ONLY.has(name)) throw new Error(`refusing ${name}`);
  const response = await fetch(`${url}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commands) });
  if (!response.ok) throw new Error(`Upstash answered ${response.status}`);
  return (await response.json()).map(entry => entry.error ? { error: entry.error } : entry.result);
}

const EXPECTED = [
  [/^festival:wishes$/, 'wish wall (newest 30)'],
  [/^festival:weather:v1$/, 'weather settings'],
  [/^festival:visits:\d{4}-\d{2}-\d{2}$/, 'visit counters for a day'],
  [/^festival:visits:\d{4}-\d{2}-\d{2}:[a-z]+$/, 'unique-visitor estimate for a day'],
];
const describe = key => EXPECTED.find(([pattern]) => pattern.test(key))?.[1];
const LENGTH = { string: 'STRLEN', hash: 'HLEN', list: 'LLEN', set: 'SCARD', zset: 'ZCARD' };

const keys = [];
let cursor = '0';
do {
  const [[next, batch]] = await pipeline([['SCAN', cursor, 'COUNT', '500']]);
  cursor = String(next);
  keys.push(...batch);
} while (cursor !== '0' && keys.length < 100_000);
keys.sort();

const rows = [];
for (let i = 0; i < keys.length; i += 100) {
  const slice = keys.slice(i, i + 100);
  const meta = await pipeline(slice.flatMap(key => [['TYPE', key], ['TTL', key], ['MEMORY', 'USAGE', key]]));
  const lengths = await pipeline(slice.map((key, j) => [LENGTH[meta[j * 3]] ?? 'STRLEN', key]));
  slice.forEach((key, j) => rows.push({ key, type: meta[j * 3], ttl: meta[j * 3 + 1], bytes: typeof meta[j * 3 + 2] === 'number' ? meta[j * 3 + 2] : undefined, length: lengths[j], what: describe(key) }));
}

const ttl = s => s === -1 ? 'never expires' : s === -2 ? 'gone' : `${Math.round(s / 86400)} d`;
let unexpected = 0, total = 0;
for (const row of rows) {
  total += row.bytes ?? 0;
  if (!row.what) unexpected++;
  console.log([row.what ? 'expected ' : 'LEFTOVER?', row.key, row.type, row.bytes === undefined ? '' : `${row.bytes} B`, typeof row.length === 'number' ? `len ${row.length}` : '', ttl(row.ttl), row.what ?? ''].filter(Boolean).join('  '));
}
console.log(`\n${rows.length} keys, about ${(total / 1024).toFixed(1)} KB; ${unexpected} not written by the current service.`);
