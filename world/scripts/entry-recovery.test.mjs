import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { EntryRecovery, ENTRY_PHASE_KEY, ENTRY_RETRY_KEY } from '../src/ui/EntryRecovery.ts';

function entryLifecycle(initial = {}) {
  const values = new Map(Object.entries(initial));
  const pending = new Map(), callbacks = new Map(), canceled = [];
  let now = 0, serial = 0;
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const options = { storage,
    setTimeout(callback, milliseconds) { const id=++serial; pending.set(id,{callback,at:now+milliseconds});callbacks.set(id,callback);return id; },
    clearTimeout(id) { canceled.push(id);pending.delete(id); },
  };
  const advance = milliseconds => {
    now += milliseconds;
    for (const [id, task] of [...pending]) if (task.at <= now) { pending.delete(id); task.callback(); }
  };
  return { recovery:new EntryRecovery(options),options,storage,values,pending,callbacks,canceled,advance };
}

test('an interrupted native loading phase blocks automatic world allocation and preserves the visitor records', () => {
  const visitor = { inside:'1', profile:'saved tab outfit', session:'existing server session', [ENTRY_RETRY_KEY]:'1' };
  const h=entryLifecycle(visitor);
  assert.equal(h.recovery.allowAutomaticRejoin(),true,'legacy visits retain the existing bounded rejoin path');
  h.recovery.begin();
  const afterDiscard=new EntryRecovery(h.options);
  assert.equal(afterDiscard.phase(),'loading');
  assert.equal(afterDiscard.allowAutomaticRejoin(),false);
  assert.equal(afterDiscard.phase(),'interrupted');
  assert.equal(afterDiscard.allowAutomaticRejoin(),false,'another reload cannot restart heavy entry');
  for (const [key,value] of Object.entries(visitor)) assert.equal(h.values.get(key),value,'identity/session/retry data must survive');
  assert.equal(h.pending.size,0,'an unfinished entrance starts no stability timer');
  afterDiscard.begin();
  assert.equal(afterDiscard.phase(),'loading','an explicit manual retry can enter again');
});

test('only completed handoff starts the stability interval, even after a very slow entrance', () => {
  const h=entryLifecycle({[ENTRY_RETRY_KEY]:'2'});
  h.recovery.begin();h.advance(300_000);
  assert.equal(h.recovery.phase(),'loading');assert.equal(h.values.get(ENTRY_RETRY_KEY),'2');
  assert.equal(h.pending.size,0);
  h.recovery.finish();
  assert.equal(h.recovery.phase(),'ready');assert.equal(h.pending.size,1);
  assert.equal(new EntryRecovery(h.options).allowAutomaticRejoin(),true);
  h.advance(119_999);assert.equal(h.recovery.phase(),'ready');assert.equal(h.values.get(ENTRY_RETRY_KEY),'2');
  h.advance(1);assert.equal(h.recovery.phase(),'stable');assert.equal(h.values.has(ENTRY_RETRY_KEY),false);
  assert.equal(new EntryRecovery(h.options).allowAutomaticRejoin(),true);
});

test('a new attempt or failed world cancels its prior timer and rejects late timer callbacks', () => {
  const h=entryLifecycle({[ENTRY_RETRY_KEY]:'1'});
  h.recovery.begin();h.recovery.finish();
  const oldCallback=h.callbacks.get(1);
  h.recovery.begin();assert.deepEqual(h.canceled,[1]);
  oldCallback();assert.equal(h.recovery.phase(),'loading');assert.equal(h.values.get(ENTRY_RETRY_KEY),'1');
  h.recovery.finish();const nextCallback=h.callbacks.get(2);
  h.recovery.fail();assert.deepEqual(h.canceled,[1,2]);
  nextCallback();assert.equal(h.recovery.phase(),'interrupted');assert.equal(h.values.get(ENTRY_RETRY_KEY),'1');
  assert.equal(h.pending.size,0);assert.equal(h.recovery.allowAutomaticRejoin(),false);
});

test('duplicate completion or completion without entry cannot allocate extra stability timers', () => {
  const h=entryLifecycle();h.recovery.finish();assert.equal(h.pending.size,0);
  h.recovery.begin();h.recovery.finish();h.recovery.finish();assert.equal(h.pending.size,1);
  h.recovery.fail();h.recovery.finish();assert.equal(h.pending.size,0);
});

test('blocked storage property, operations and malformed phase fail safely before automatic admission', () => {
  let reads=0;
  const blocked=new EntryRecovery({storage:()=>{reads++;throw Error('blocked storage property');}});
  assert.equal(reads,0,'constructing the lifecycle must not access browser storage');
  assert.equal(blocked.phase(),undefined);assert.equal(blocked.allowAutomaticRejoin(),false);
  assert.doesNotThrow(()=>{blocked.begin();blocked.finish();blocked.fail();});
  const operations=new EntryRecovery({storage:{getItem(){throw Error('blocked read');},setItem(){throw Error('blocked write');},removeItem(){throw Error('blocked removal');}}});
  assert.equal(operations.allowAutomaticRejoin(),false);assert.doesNotThrow(()=>{operations.begin();operations.finish();operations.fail();});
  const malformed=entryLifecycle({[ENTRY_PHASE_KEY]:'not-a-real-phase'});
  assert.equal(malformed.recovery.phase(),'interrupted');assert.equal(malformed.recovery.allowAutomaticRejoin(),false);
});

test('a late timer cannot overwrite an externally recorded interrupted entrance', () => {
  const h=entryLifecycle({[ENTRY_RETRY_KEY]:'2'});
  h.recovery.begin();h.recovery.finish();h.storage.setItem(ENTRY_PHASE_KEY,'interrupted');h.advance(120_000);
  assert.equal(h.recovery.phase(),'interrupted');assert.equal(h.values.get(ENTRY_RETRY_KEY),'2');
});

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
