import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/network/FestivalClient.ts'], bundle: true,
  write: false, format: 'esm', define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_FESTIVAL_SERVER_URL: 'https://festival.test' }) } });
let visit = 0;
async function client(fetch, options = {}) {
  globalThis.window = { location: new URL('https://myscheduleltd.com/beta/'), setTimeout, clearTimeout, setInterval: () => 0 };
  globalThis.fetch = fetch;
  const { FestivalClient } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text + `\n// visit ${++visit}`).toString('base64')}`);
  return new FestivalClient({ onState() {}, onStatus() {}, ...options });
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

const SESSION_KEY = 'myschedule-festival-session-v1';
function storage(t) {
  const items = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else delete globalThis.sessionStorage; });
  return items;
}
const liveResponse = () => new Response(new ReadableStream({ start(controller) {
  controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
} }), { headers: { 'content-type': 'text/event-stream' } });
const settle = () => new Promise(resolve => setImmediate(resolve));

test('gate admission persists the token and a reloaded tab recovers before claiming its own name', async t => {
  const items = storage(t), requests = [];
  const session = { id: 'visitor-owned-by-tab', token: 'test-token' };
  const palette = { top: '#291a1c', shirt: '#b34335', shoes: '#3579bc', bottoms: '#536342', swimwear: '#a73687' };
  const fetch = async (url, options) => {
    requests.push(new URL(url).pathname);
    if (new URL(url).pathname === '/api/events') return liveResponse();
    assert.deepEqual(JSON.parse(options.body).palette, palette, 'both garment dyes travel with the selected outfit');
    if (url.endsWith('/api/session/recover')) {
      assert.deepEqual(JSON.parse(options.body).session, session);
      return Response.json({ session, state: {} });
    }
    return Response.json({ session, state: {} }, { status: 201 });
  };
  const first = await client(fetch);
  assert.deepEqual(await first.requestPlace('test', palette), { admitted: true });
  assert.deepEqual(JSON.parse(items.get(SESSION_KEY)), { session, name: 'test' });
  first.suspend();
  requests.length = 0;
  const restored = await client(fetch);
  assert.deepEqual(await restored.requestPlace('test', palette), { admitted: true });
  assert.deepEqual(requests, ['/api/session/recover', '/api/events']);
  restored.suspend();
  await settle();
});

test('a replaced event stream cannot deliver a late stale state', async t => {
  storage(t);
  const states = [], readers = [];
  let events = 0;
  const visitor = await client(async url => {
    if (new URL(url).pathname !== '/api/events') return Response.json({ session: { id: 'owned', token: 'test' }, state: { sequence: 0 } });
    events++;
    let resolveRead;
    const reader = { read: () => new Promise(resolve => { resolveRead = resolve; }), cancel: async () => {}, releaseLock() {} };
    readers.push({ reader, deliver: value => resolveRead({ value: new TextEncoder().encode(value), done: false }) });
    return { ok: true, status: 200, body: { getReader: () => reader } };
  }, { onState: state => states.push(state.sequence) });
  await visitor.requestPlace('test', {}); await settle();
  visitor.suspend(); visitor.wake(); await settle();
  assert.equal(events, 2);
  readers[0].deliver('event: state\ndata: {"sequence":1}\n\n');
  readers[1].deliver('event: state\ndata: {"sequence":2}\n\n');
  await settle();
  assert.deepEqual(states, [0, 2]);
  visitor.suspend();
});

test('compact stream updates merge by visitor id, preserving unchanged state and removals', async () => {
  const states=[];
  const visitor=await client(()=>Promise.resolve(Response.json({})),{onState:s=>states.push(s)});
  const emit=(event,data)=>visitor.handleEventBlock(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const full={selfId:'a',serverTime:1,visitors:[{id:'a',name:'A'},{id:'b',name:'B'}],messages:[],schedule:{shore:{youtubeId:'film'}}};
  emit('state',full);emit('state-patch',{serverTime:2,visitors:[{id:'b',name:'New B'},{id:'c',name:'C'}]});
  assert.deepEqual(states[1].visitors.map(v=>v.name),['A','New B','C']);
  assert.equal(states[0].schedule,states[1].schedule);
  emit('state-patch',{serverTime:3,removedVisitors:['b'],messages:[{text:'hi'}]});
  assert.deepEqual(states[2].visitors.map(v=>v.id),['a','c']);assert.equal(states[2].messages[0].text,'hi');
});

test('slow presence requests cannot queue overlapping outdated positions', async () => {
  let release,posts=0;
  const visitor=await client(()=>{posts++;return new Promise(resolve=>{release=()=>resolve(Response.json({ok:true}));});});
  visitor.session={id:'a',token:'test'};visitor.lastPresenceAt=-10000;
  const first=visitor.publishPresence({moving:true,x:1},{});
  visitor.lastPresenceAt=-10000;await visitor.publishPresence({moving:true,x:2},{});
  assert.equal(posts,1);release();await first;
  visitor.lastPresenceAt=-10000;const next=visitor.publishPresence({moving:true,x:3},{});assert.equal(posts,2);release();await next;
});

test('a stationary garment colour change publishes and survives a remote compact update', async () => {
  const posted = [], states = [];
  const visitor = await client(async (_url, options) => {
    posted.push(JSON.parse(options.body)); return Response.json({ ok: true });
  }, { onState: state => states.push(state) });
  visitor.session = { id: 'a', token: 'test' };
  const presence = { moving: false, state: 'walking', x: 3, z: 4 };
  const original = { top: '#191a1c', shirt: '#a43439', shoes: '#297dbc', bottoms: '#536342', swimwear: '#a73687' };
  visitor.lastPresenceAt = -10000; await visitor.publishPresence(presence, original);
  const changed = { ...original, shirt: '#239459', shoes: '#bc6842' };
  visitor.lastPresenceAt = -10000; await visitor.publishPresence(presence, changed);
  assert.equal(posted.length, 2); assert.deepEqual(posted[1], { ...presence, palette: changed });
  const emit = (event, data) => visitor.handleEventBlock(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  emit('state', { visitors: [{ id: 'b', palette: original }], messages: [] });
  emit('state-patch', { visitors: [{ id: 'b', palette: changed }] });
  assert.deepEqual(states.at(-1).visitors[0].palette, changed);
  assert.equal(states.at(-1).visitors[0].palette.top, original.top);
});
