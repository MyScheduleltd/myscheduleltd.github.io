import { upstashClient } from './upstash.mjs';

export const WEATHER_STORE_KEY = 'festival:weather:v1';

/** Existing optional Upstash credentials, isolated from wishes and donations. */
export function createWeatherStore({ env = process.env, fetchImpl = globalThis.fetch, requestTimeoutMs = 4_000 } = {}) {
  const database = upstashClient({ env, fetchImpl, requestTimeoutMs, label: 'weather storage' });
  if (!database) return { enabled: false, load: async () => null, save: async () => {} };
  const { command } = database;
  let queue = Promise.resolve();
  return { enabled: true,
    async load() { const raw = await command(['GET', WEATHER_STORE_KEY]); return typeof raw === 'string' && raw ? JSON.parse(raw) : null; },
    save(weather) {
      const payload = JSON.stringify(weather);
      const pending = queue.then(() => command(['SET', WEATHER_STORE_KEY, payload]));
      queue = pending.catch(() => {});
      return pending;
    },
  };
}

/** Read before writing. A delayed remote load cannot replace a newer staff
 * change; a failed GET never causes an unknown remote snapshot to be erased.
 */
export function createWeatherPersistence({ store, weather, onChange = () => {}, warn = console.warn,
  retryDelaysMs = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] } = {}) {
  let loaded = !store.enabled, dirty = false, revision = 0, failures = 0, active, retryTimer, disposed = false;
  const cancelRetry = () => { if (retryTimer !== undefined) clearTimeout(retryTimer); retryTimer = undefined; };
  const run = () => {
    if (disposed || active || retryTimer !== undefined || (loaded && !dirty)) return active;
    active = (async () => {
      try {
        if (!loaded) {
          const saved = await store.load();
          if (disposed) return;
          const local = weather.snapshot();
          if (saved && Number.isSafeInteger(saved.updatedAt) && saved.updatedAt > local.updatedAt) {
            if (weather.restore(saved)) onChange();
          } else if (local.updatedAt > (saved?.updatedAt ?? 0)) dirty = true;
          loaded = true; failures = 0;
        }
        while (dirty && !disposed) {
          const saving = revision;
          await store.save(weather.snapshot());
          failures = 0;
          if (saving === revision) dirty = false;
        }
      } catch (error) {
        warn(`weather ${loaded ? 'not saved' : 'not loaded'}: ${error.message}`);
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
    status: () => ({ enabled: store.enabled, loaded, dirty }),
    changed() {
      if (!store.enabled || disposed) return;
      dirty = true; revision++;
      if (!active && retryTimer === undefined) failures = 0;
      void run();
    },
    async flush(timeoutMs = 2_000) {
      if (!store.enabled || disposed) return true;
      cancelRetry(); failures = 0;
      let timer;
      try { return await Promise.race([(async () => { await (active ?? run()); return loaded && !dirty; })(),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]); }
      finally { clearTimeout(timer); }
    },
    dispose() { disposed = true; cancelRetry(); },
  };
}
