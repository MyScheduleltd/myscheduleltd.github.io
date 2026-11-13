// Local-only stand-in for Render's free plan, for reviewing the loading page's
// server-waking stage. Sits in front of the local API and behaves like a
// sleeping service: the first request after a quiet spell starts a wake, and
// every request (preflights included) waits until the wake is done, as
// Render's own requests do. Never points anywhere but loopback.
//
// Usage: node sleepy-proxy.mjs [listenPort=8798] [targetPort=8797]
//   SLEEPY_WAKE_MS   how long a wake takes (default 45000)
//   SLEEPY_IDLE_MS   quiet time before it sleeps again (default 120000)
//   SLEEPY_NEVER=1   never wakes (to review the two-minute give-up)
import { createServer, request as forward } from 'node:http';

const [listenPort = '8798', targetPort = '8797'] = process.argv.slice(2);
const wakeMs = Number(process.env.SLEEPY_WAKE_MS ?? 45_000);
const idleMs = Number(process.env.SLEEPY_IDLE_MS ?? 120_000);
const never = process.env.SLEEPY_NEVER === '1';
let awakeAt = 0;
let lastAt = 0;
let wakeStartedAt = 0;

const log = (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

function untilAwake() {
  const now = Date.now();
  if (awakeAt && now - lastAt > idleMs) { awakeAt = 0; log('fell asleep after a quiet spell'); }
  lastAt = now;
  if (!awakeAt) {
    wakeStartedAt = now;
    awakeAt = never ? Number.POSITIVE_INFINITY : now + wakeMs;
    log(`${never ? 'asked while asleep; this one never wakes' : `asked while asleep; waking for ${wakeMs / 1000} s`}`);
  }
  const wait = awakeAt - now;
  return wait > 0 ? new Promise((resolve) => setTimeout(resolve, Math.min(wait, 2 ** 31 - 1))) : Promise.resolve();
}

createServer(async (incoming, outgoing) => {
  // Port probes (the desktop app checks listed ports) must not wake it; only the page's API calls do.
  if (!/^\/(api\/|health)/.test(incoming.url ?? '')) { outgoing.writeHead(204); outgoing.end(); return; }
  const asked = Date.now();
  await untilAwake();
  if (outgoing.destroyed || incoming.destroyed) return;
  const held = Date.now() - asked;
  if (held > 50) log(`${incoming.method} ${incoming.url} held ${(held / 1000).toFixed(1)} s (wake began ${((asked - wakeStartedAt) / 1000).toFixed(1)} s before it was asked)`);
  const upstream = forward({ host: '127.0.0.1', port: Number(targetPort), method: incoming.method, path: incoming.url, headers: incoming.headers }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(upstream);
}).listen(Number(listenPort), '127.0.0.1', () => log(`sleepy proxy on 127.0.0.1:${listenPort} → 127.0.0.1:${targetPort}, wake ${wakeMs / 1000} s, sleeps after ${idleMs / 1000} s quiet`));
