import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/network/FestivalClient.ts'], bundle: true,
  write: false, format: 'esm', define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_FESTIVAL_SERVER_URL: 'https://festival.test' }) } });
let visit = 0;
async function client(fetch) {
  globalThis.window = { location: new URL('https://myscheduleltd.com/beta/'), setTimeout, clearTimeout, setInterval: () => 0 };
  globalThis.fetch = fetch;
  const { FestivalClient } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text + `\n// visit ${++visit}`).toString('base64')}`);
  return new FestivalClient({ onState() {}, onStatus() {} });
}

test('admission stalled before headers stops blocking the gate and cancels its request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const visitor = await client((_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  const place = visitor.requestPlace('test', {});
  t.mock.timers.tick(15_001);
  assert.deepEqual(await place, { admitted: true }, 'same local-world fallback as an unreachable service');
  assert.equal(signal.aborted, true);
});

test('admission stalled after headers also times out and can retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const visitor = await client(() => {
    calls++;
    return calls === 1 ? Promise.resolve({ ok: true, json: () => new Promise(() => {}) })
      : Promise.resolve(Response.json({ error: 'Name already in use.' }, { status: 409 }));
  });
  const place = visitor.requestPlace('test', {});
  await Promise.resolve();
  t.mock.timers.tick(15_001);
  assert.deepEqual(await place, { admitted: true });
  assert.deepEqual(await visitor.requestPlace('test', {}), { admitted: false, error: 'Name already in use.' });
  assert.equal(calls, 2);
});

test('a responding full festival still holds its queue ticket and deduplicates entry clicks', async () => {
  const waiting = { ticket: 'ticket-1', position: 2, inside: 50, capacity: 50 };
  const bodies = [];
  const visitor = await client((_url, options) => {
    bodies.push(JSON.parse(options.body));
    return Promise.resolve(Response.json({ waiting }, { status: 202 }));
  });
  const first = visitor.requestPlace('test', {});
  assert.equal(visitor.requestPlace('test', {}), first);
  assert.deepEqual(await first, { admitted: false, waiting });
  await visitor.requestPlace('test', {});
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].waitTicket, waiting.ticket);
  assert.equal(bodies[1].probe, true);
});

test('a service refusal stays visible instead of becoming a timeout fallback', async () => {
  const visitor = await client(() => Promise.resolve(Response.json({ error: 'Entry refused.' }, { status: 403 })));
  assert.deepEqual(await visitor.requestPlace('test', {}), { admitted: false, error: 'Entry refused.' });
});
