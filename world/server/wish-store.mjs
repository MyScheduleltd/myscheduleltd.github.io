/**
 * Where the wish wall's notes outlive the process (the owner, 2026-10-22).
 *
 * Until then they were memory only, and the service on Render's free plan
 * sleeps when nobody is in the festival and starts from nothing on every
 * deploy, so the wall kept emptying itself. The newest WISH_LIMIT are now kept
 * in Upstash Redis as one JSON value: thirty short notes are a few kilobytes,
 * and replacing the whole list on every change means a save can never leave
 * it half-written. Still never in the state file, which is not where the owner
 * wanted them, and still never anything but what the wall already shows.
 *
 * Environment, as Upstash or its Vercel integration names it:
 * UPSTASH_REDIS_REST_URL and _TOKEN, or KV_REST_API_URL and _TOKEN. With
 * neither the store is off and the wall behaves exactly as it always has.
 */
export const WISH_STORE_KEY = 'festival:wishes';

export function createWishStore({ env = process.env, fetchImpl = globalThis.fetch, key = WISH_STORE_KEY, requestTimeoutMs = 4_000 } = {}) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token || typeof fetchImpl !== 'function') {
    return { enabled: false, load: async () => [], save: () => Promise.resolve() };
  }
  const command = async (args) => {
    const response = await fetchImpl(url.replace(/\/$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`wish storage ${response.status}`);
    const body = await response.json();
    if (body?.error) throw new Error(`wish storage: ${body.error}`);
    return body?.result;
  };
  // One write at a time, in order: each carries the whole wall as it was when
  // it changed, so the last one to land is always the newest.
  let queue = Promise.resolve();
  return {
    enabled: true,
    async load() {
      const raw = await command(['GET', key]);
      if (typeof raw !== 'string' || !raw) return [];
      const saved = JSON.parse(raw);
      return Array.isArray(saved) ? saved : [];
    },
    save(entries) {
      const payload = JSON.stringify(entries);
      const saved = queue.then(() => command(['SET', key, payload]));
      // A failed write must not poison subsequent writes, but its caller must
      // know it failed so the same dirty wall can be retried.
      queue = saved.catch(() => {});
      return saved;
    },
  };
}

/**
 * Load before replacing Redis: until that GET succeeds, the live array holds
 * only this process's new notes, not the retained wall. Changes remain usable
 * in memory while storage is unavailable, and payment notifications never
 * await this work. Each recovery burst has six retries with capped backoff;
 * a later change or a graceful shutdown starts another burst if necessary.
 */
export function createWishPersistence({ store, wishes, limit, clean, onChange = () => {}, warn = console.warn,
  retryDelaysMs = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] } = {}) {
  let loaded = !store.enabled, dirty = false, revision = 0, failures = 0;
  let active, retryTimer, disposed = false;
  const removed = new Set();
  const cancelRetry = () => { if (retryTimer !== undefined) clearTimeout(retryTimer); retryTimer = undefined; };
  const run = () => {
    if (disposed || active || retryTimer !== undefined || (!dirty && loaded)) return active;
    active = (async () => {
      try {
        if (!loaded) {
          const saved = await store.load();
          if (disposed) return;
          const retained = saved.filter((entry) => !removed.has(entry?.id));
          wishes.splice(0, wishes.length, ...mergeWishes(retained, wishes, limit, clean));
          removed.clear(); loaded = true; failures = 0;
          onChange();
        }
        while (dirty && !disposed) {
          const saving = revision;
          await store.save(wishes);
          failures = 0;
          if (revision === saving) dirty = false;
        }
      } catch (error) {
        warn(`wish wall ${loaded ? 'not saved' : 'not loaded'}: ${error.message}`);
        const delay = retryDelaysMs[failures++];
        if (!disposed && delay !== undefined) {
          retryTimer = setTimeout(() => { retryTimer = undefined; void run(); }, delay);
          retryTimer.unref?.();
        }
      } finally { active = undefined; }
    })();
    return active;
  };
  if (store.enabled) void run();
  return {
    changed(removedId) {
      if (!store.enabled || disposed) return;
      dirty = true; revision++;
      if (!loaded && removedId) removed.add(removedId);
      // Respect an outstanding backoff; after a burst is exhausted, a real
      // change is a new reason to try, rather than silently abandoning it.
      if (!active && retryTimer === undefined) failures = 0;
      void run();
    },
    async flush(timeoutMs = 2_000) {
      if (!store.enabled || disposed) return true;
      cancelRetry(); failures = 0;
      let timeout;
      const deadline = new Promise((resolve) => { timeout = setTimeout(() => resolve(false), timeoutMs); });
      try {
        return await Promise.race([(async () => {
          await (active ?? run());
          return loaded && !dirty;
        })(), deadline]);
      } finally { clearTimeout(timeout); }
    },
    dispose() { disposed = true; cancelRetry(); },
  };
}

/**
 * The saved wall and anything posted while it was still loading, as one wall:
 * each note once (by id), oldest first, the newest `limit` kept. `clean`
 * re-checks every saved note, because storage is outside this process.
 */
export function mergeWishes(saved, live, limit, clean = (entry) => entry) {
  const byId = new Map();
  for (const entry of [...saved.map(clean), ...live]) {
    if (entry && typeof entry.id === 'string' && entry.id && entry.message) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(-limit);
}
