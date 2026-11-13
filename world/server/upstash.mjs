/**
 * The festival's one Upstash Redis database, over its REST API. The wish wall
 * (wish-store), STAFF weather (weather-store) and visit counters (visit-stats)
 * all share it, each under its own `festival:` key. Credentials are optional:
 * without UPSTASH_REDIS_REST_URL and _TOKEN (or Vercel's KV_REST_API_URL and
 * _TOKEN) this returns undefined and each store keeps its memory fallback.
 *
 * `tools/upstash-key-report.mjs` lists what the database holds, read-only.
 */
export function upstashClient({ env = process.env, fetchImpl = globalThis.fetch, requestTimeoutMs = 4_000, label = 'storage' } = {}) {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').replace(/\/$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token || typeof fetchImpl !== 'function') return undefined;
  const post = async (path, body) => {
    const response = await fetchImpl(url + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`${label} ${response.status}`);
    return response.json();
  };
  return {
    /** One command; its result. */
    async command(args) {
      const reply = await post('', args);
      if (reply?.error) throw new Error(`${label}: ${reply.error}`);
      return reply?.result;
    },
    /** Several commands in one request; their results, in order. */
    async pipeline(commands) {
      const replies = await post('/pipeline', commands);
      if (!Array.isArray(replies)) throw new Error(`${label}: unexpected reply`);
      const failed = replies.find((entry) => entry?.error);
      if (failed) throw new Error(`${label}: ${failed.error}`);
      return replies.map((entry) => entry?.result);
    },
  };
}
