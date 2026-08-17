import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join as joinPath } from 'node:path';
import { tmpdir } from 'node:os';

const temporaryDirectory = mkdtempSync(joinPath(tmpdir(), 'festival-test-'));
let baseUrl;
let server;

// Ports are borrowed from the operating system rather than hard-coded, so an
// unrelated local service can never fail the suite.
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

// Every instance gets its own settings file so a previous run can never leak
// persisted STAFF state into the next one.
const startServer = async (port, stateFile) => {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      FESTIVAL_PORT: String(port),
      FESTIVAL_ADMIN_KEY: 'test-admin-key',
      FESTIVAL_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
      FESTIVAL_STATE_FILE: stateFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let failure = '';
  child.stderr.on('data', (chunk) => {
    failure += chunk.toString();
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Festival server did not start on ${port}. ${failure.trim()}`)),
      4_000,
    );
    child.once('error', reject);
    child.stdout.on('data', (chunk) => {
      if (!chunk.toString().includes('listening')) return;
      clearTimeout(timer);
      resolve();
    });
  });
  return child;
};

const stopServer = (child) => new Promise((resolve) => {
  if (!child || child.exitCode !== null) return resolve();
  child.once('exit', resolve);
  child.kill('SIGTERM');
  setTimeout(resolve, 3_000).unref?.();
});

before(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = await startServer(port, joinPath(temporaryDirectory, 'main-state.json'));
});

after(async () => {
  await stopServer(server);
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

const join = async (name) => {
  const response = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ name }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).session;
};

const auth = (session) => ({
  authorization: `Bearer ${session.token}`,
  'x-festival-session': session.id,
  'content-type': 'application/json',
  origin: 'http://127.0.0.1:5173',
});

test('health endpoint reports readiness', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('browser preflight allows the authenticated session header', async () => {
  const response = await fetch(`${baseUrl}/api/presence`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://127.0.0.1:5173',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type,x-festival-session',
    },
  });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /x-festival-session/);
});

test('development accepts a fallback Vite loopback port', async () => {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { origin: 'http://127.0.0.1:5199' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5199');
});

test('attendee sessions recover without returning to the sign-in gate', async () => {
  const session = await join('RECOVERY TEST');
  const response = await fetch(`${baseUrl}/api/session/recover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ session, name: 'RECOVERY TEST' }),
  });
  assert.equal(response.status, 200);
  const recovered = await response.json();
  assert.equal(recovered.session.id, session.id);
  assert.equal(recovered.state.selfId, session.id);
});

test('seat ownership is authoritative across two visitors', async () => {
  const first = await join('TEST ONE');
  const second = await join('TEST TWO');
  const claimed = await fetch(`${baseUrl}/api/seats/PALACE-1-1/claim`, { method: 'POST', headers: auth(first) });
  assert.equal(claimed.status, 200);
  const conflict = await fetch(`${baseUrl}/api/seats/PALACE-1-1/claim`, { method: 'POST', headers: auth(second) });
  assert.equal(conflict.status, 409);
  const released = await fetch(`${baseUrl}/api/seats/PALACE-1-1/release`, { method: 'POST', headers: auth(first) });
  assert.equal(released.status, 200);
  const reclaimed = await fetch(`${baseUrl}/api/seats/PALACE-1-1/claim`, { method: 'POST', headers: auth(second) });
  assert.equal(reclaimed.status, 200);
});

test('chat is sanitized and moderation requires the staff key', async () => {
  const session = await join('CHAT TEST');
  const sent = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ channel: 'FESTIVAL', text: '  hello    festival  ' }),
  });
  assert.equal(sent.status, 201);
  const denied = await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'wrong', origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(denied.status, 401);
  const allowed = await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(allowed.status, 200);
  const state = await allowed.json();
  assert.equal(state.messages.at(-1).text, 'hello festival');
});

test('public programmes expose full queues and advance when a work ends', async () => {
  const session = await join('ADVANCE TEST');
  const configResponse = await fetch(`${baseUrl}/api/config`);
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(config.schedule.palace.order.length, 4);
  assert.equal(config.schedule['drive-in'].order.length, 2);
  assert.equal(config.schedule.shore.order.length, 32);

  const currentYoutubeId = config.schedule.palace.youtubeId;
  const advanced = await fetch(`${baseUrl}/api/programme/palace/advance`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: currentYoutubeId }),
  });
  assert.equal(advanced.status, 200);
  const result = await advanced.json();
  assert.equal(result.advanced, true);
  assert.notEqual(result.schedule.palace.youtubeId, currentYoutubeId);
});

test('staff can reorder and rename a venue programme', async () => {
  const updated = await fetch(`${baseUrl}/api/admin/schedule`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-festival-admin-key': 'test-admin-key',
      origin: 'http://127.0.0.1:5173',
    },
    body: JSON.stringify({
      venue: 'shore',
      name: 'THE TIDE',
      currentYoutubeId: 'SRbsIUYB0dc',
      order: ['SRbsIUYB0dc', 'jiawzYgfkuI'],
      mode: 'scheduled-loop',
      specialYoutubeUrl: 'https://youtu.be/KD5dGYzk9Bo',
      specialStartsAt: '2026-08-13T20:00:00+08:00',
    }),
  });
  assert.equal(updated.status, 200);
  const stateResponse = await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.schedule.shore.name, 'THE TIDE');
  assert.deepEqual(state.schedule.shore.order, ['SRbsIUYB0dc', 'jiawzYgfkuI']);
  assert.equal(state.schedule.shore.youtubeId, 'SRbsIUYB0dc');
  assert.equal(state.schedule.shore.mode, 'scheduled-loop');
  assert.equal(state.schedule.shore.special.youtubeId, 'KD5dGYzk9Bo');
  assert.ok(state.schedule.shore.updatedAt > 0);
});

test('staff wordmark settings are shared in public config', async () => {
  const updated = await fetch(`${baseUrl}/api/admin/style`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-festival-admin-key': 'test-admin-key',
      origin: 'http://127.0.0.1:5173',
    },
    body: JSON.stringify({ brandFontSize: 28, brandScaleY: 1.2, brandScaleX: 1.35, brandOffsetX: 18, brandOffsetY: -6 }),
  });
  assert.equal(updated.status, 200);
  const config = await fetch(`${baseUrl}/api/config`);
  assert.equal(config.status, 200);
  const state = await config.json();
  assert.equal(state.siteStyle.brandFontSize, 28);
  assert.equal(state.siteStyle.brandScaleY, 1.2);
  assert.equal(state.siteStyle.brandScaleX, 1.35);
  assert.equal(state.siteStyle.brandOffsetX, 18);
  assert.equal(state.siteStyle.brandOffsetY, -6);
});

test('staff can change the looped YouTube background on the sign-in page', async () => {
  const updated = await fetch(`${baseUrl}/api/admin/gate-background`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-festival-admin-key': 'test-admin-key',
      origin: 'http://127.0.0.1:5173',
    },
    body: JSON.stringify({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
  });
  assert.equal(updated.status, 200);
  const configResponse = await fetch(`${baseUrl}/api/config`);
  const config = await configResponse.json();
  assert.equal(config.gateBackground.youtubeId, 'dQw4w9WgXcQ');
  assert.ok(config.gateBackground.updatedAt > 0);
});

test('staff can update NPC names and job titles across the festival', async () => {
  const updated = await fetch(`${baseUrl}/api/admin/npcs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-festival-admin-key': 'test-admin-key',
      origin: 'http://127.0.0.1:5173',
    },
    body: JSON.stringify({ npcId: 'KENNY', name: 'KEN', title: 'Senior Director' }),
  });
  assert.equal(updated.status, 200);
  const configResponse = await fetch(`${baseUrl}/api/config`);
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(config.npcNames.KENNY, 'KEN');
  assert.equal(config.npcNames.MENTOR, 'MENTOR');
  assert.equal(config.npcNames.VIOLA, 'VIOLA');
  assert.equal(config.npcProfiles.find((profile) => profile.id === 'KENNY').title, 'Senior Director');
});

test('staff can add a new NPC to the shared roster', async () => {
  const added = await fetch(`${baseUrl}/api/admin/npcs/add`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-festival-admin-key': 'test-admin-key',
      origin: 'http://127.0.0.1:5173',
    },
    body: JSON.stringify({ name: 'ALICE', title: 'Producer' }),
  });
  assert.equal(added.status, 201);
  const payload = await added.json();
  assert.match(payload.npcId, /^NPC_\d+$/);
  const configResponse = await fetch(`${baseUrl}/api/config`);
  const config = await configResponse.json();
  const profile = config.npcProfiles.find((candidate) => candidate.id === payload.npcId);
  assert.deepEqual(profile, { id: payload.npcId, name: 'ALICE', title: 'Producer' });
});

test('staff NPC control preserves the original attendee and restores its position', async () => {
  const session = await join('CONTROL TEST');
  const startingPresence = {
    x: 6,
    z: -12,
    rotation: 0.75,
    location: 'MY SQUARE',
    state: 'walking',
    moving: false,
    venue: 'shore',
  };
  const presence = await fetch(`${baseUrl}/api/presence`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify(startingPresence),
  });
  assert.equal(presence.status, 202);

  const controlled = await fetch(`${baseUrl}/api/admin/impersonate`, {
    method: 'POST',
    headers: { ...auth(session), 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ npcId: 'NUNO' }),
  });
  assert.equal(controlled.status, 200);
  const controlledIdentity = await controlled.json();
  assert.equal(controlledIdentity.npcId, 'NUNO');
  assert.equal(controlledIdentity.name, 'NUNO');
  assert.equal(controlledIdentity.originalName, 'CONTROL TEST');

  const movingPresence = await fetch(`${baseUrl}/api/presence`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({
      ...startingPresence,
      x: 18,
      z: -26,
      location: 'THE SHORE',
      state: 'seated',
      moving: true,
      carriedItem: 'POPCORN',
    }),
  });
  assert.equal(movingPresence.status, 202);

  const adminStateResponse = await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  });
  const adminState = await adminStateResponse.json();
  const controlledVisitor = adminState.visitors.find((visitor) => visitor.id === session.id);
  assert.deepEqual(controlledVisitor.impersonationOrigin, startingPresence);
  assert.equal(controlledVisitor.presence.x, 18);
  assert.equal(controlledVisitor.presence.z, -26);
  assert.equal(controlledVisitor.presence.state, 'seated');
  assert.equal(controlledVisitor.presence.moving, true);
  assert.equal(controlledVisitor.presence.carriedItem, 'POPCORN');

  const restored = await fetch(`${baseUrl}/api/admin/impersonate`, {
    method: 'POST',
    headers: { ...auth(session), 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ npcId: '' }),
  });
  assert.equal(restored.status, 200);
  const restoredIdentity = await restored.json();
  assert.equal(restoredIdentity.name, 'CONTROL TEST');
  assert.equal(restoredIdentity.npcId, undefined);

  const restoredStateResponse = await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  });
  const restoredState = await restoredStateResponse.json();
  const restoredVisitor = restoredState.visitors.find((visitor) => visitor.id === session.id);
  assert.equal(restoredVisitor.impersonationOrigin, undefined);
  assert.equal(restoredVisitor.presence.x, startingPresence.x);
  assert.equal(restoredVisitor.presence.z, startingPresence.z);
  assert.equal(restoredVisitor.presence.rotation, startingPresence.rotation);
});

test('MENTOR pickup is exclusive and shared while STAFF control remains attached', async () => {
  const staff = await join('MENTOR STAFF');
  const carrier = await join('MENTOR CARRIER');
  const other = await join('MENTOR OTHER');

  const controlled = await fetch(`${baseUrl}/api/admin/impersonate`, {
    method: 'POST',
    headers: { ...auth(staff), 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ npcId: 'MENTOR' }),
  });
  assert.equal(controlled.status, 200);

  const feedingPresence = await fetch(`${baseUrl}/api/presence`, {
    method: 'POST',
    headers: auth(carrier),
    body: JSON.stringify({
      x: 0,
      z: 0,
      rotation: 0,
      location: 'MY SQUARE',
      state: 'walking',
      moving: true,
      venue: 'shore',
      gesture: 'feed',
    }),
  });
  assert.equal(feedingPresence.status, 202);
  const feedingStateResponse = await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  });
  const feedingState = await feedingStateResponse.json();
  const feedingVisitor = feedingState.visitors.find((visitor) => visitor.id === carrier.id);
  assert.equal(feedingVisitor.presence.moving, true);
  assert.equal(feedingVisitor.presence.gesture, 'feed');

  const pickedUp = await fetch(`${baseUrl}/api/mentor/pick-up`, {
    method: 'POST',
    headers: auth(carrier),
  });
  assert.equal(pickedUp.status, 200);
  assert.equal((await pickedUp.json()).mentorCarrierId, carrier.id);

  const conflict = await fetch(`${baseUrl}/api/mentor/pick-up`, {
    method: 'POST',
    headers: auth(other),
  });
  assert.equal(conflict.status, 409);

  const adminStateResponse = await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  });
  const adminState = await adminStateResponse.json();
  assert.equal(adminState.mentorCarrierId, carrier.id);
  assert.equal(adminState.visitors.find((visitor) => visitor.id === staff.id).npcId, 'MENTOR');
  assert.equal(adminState.visitors.find((visitor) => visitor.id === carrier.id).presence.carriedItem, 'MENTOR');

  const released = await fetch(`${baseUrl}/api/mentor/put-down`, {
    method: 'POST',
    headers: auth(carrier),
  });
  assert.equal(released.status, 200);
  assert.equal((await released.json()).mentorCarrierId, null);
});

test('staff can add a YouTube work to a venue queue', async () => {
  const added = await fetch(`${baseUrl}/api/admin/videos`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-festival-admin-key': 'test-admin-key',
      origin: 'http://127.0.0.1:5173',
    },
    body: JSON.stringify({
      venue: 'palace',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      title: 'SPECIAL TEST WORK',
      titleZh: '特別測試作品',
      creator: 'TEST DIRECTOR',
      year: 2026,
    }),
  });
  assert.equal(added.status, 201);
  const configResponse = await fetch(`${baseUrl}/api/config`);
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(config.customVideos.palace.at(-1).title, 'SPECIAL TEST WORK');
  assert.equal(config.schedule.palace.order.at(-1), 'dQw4w9WgXcQ');
});

test('staff can take a video down from a venue queue', async () => {
  const removed = await fetch(`${baseUrl}/api/admin/videos/remove`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-festival-admin-key': 'test-admin-key',
      origin: 'http://127.0.0.1:5173',
    },
    body: JSON.stringify({ venue: 'palace', youtubeId: 'dQw4w9WgXcQ' }),
  });
  assert.equal(removed.status, 200);
  const configResponse = await fetch(`${baseUrl}/api/config`);
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(config.schedule.palace.order.includes('dQw4w9WgXcQ'), false);
  assert.equal(config.customVideos.palace.some((video) => video.youtubeId === 'dQw4w9WgXcQ'), false);
});

test('staff settings survive a service restart', async () => {
  const port = await freePort();
  const restartUrl = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'restart-state.json');
  const staffHeaders = {
    'content-type': 'application/json',
    'x-festival-admin-key': 'test-admin-key',
    origin: 'http://127.0.0.1:5173',
  };

  let instance = await startServer(port, stateFile);
  try {
    const background = await fetch(`${restartUrl}/api/admin/gate-background`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ youtubeUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' }),
    });
    assert.equal(background.status, 200);

    const renamed = await fetch(`${restartUrl}/api/admin/npcs`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ npcId: 'KENNY', name: 'RESTART KENNY', title: 'Restart Director' }),
    });
    assert.equal(renamed.status, 200);

    const added = await fetch(`${restartUrl}/api/admin/videos`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({
        venue: 'shore',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        title: 'RESTART TEST WORK',
        year: 2026,
      }),
    });
    assert.equal(added.status, 201);

    const style = await fetch(`${restartUrl}/api/admin/style`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ brandFontSize: 33, brandScaleY: 1.4, brandScaleX: 1.2, brandOffsetX: 12, brandOffsetY: -8 }),
    });
    assert.equal(style.status, 200);
  } finally {
    await stopServer(instance);
  }

  instance = await startServer(port, stateFile);
  try {
    const configResponse = await fetch(`${restartUrl}/api/config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.gateBackground.youtubeId, 'aqz-KE-bpKQ');
    assert.equal(config.npcNames.KENNY, 'RESTART KENNY');
    assert.equal(config.npcProfiles.find((profile) => profile.id === 'KENNY').title, 'Restart Director');
    assert.equal(config.customVideos.shore.at(-1).title, 'RESTART TEST WORK');
    assert.equal(config.schedule.shore.order.includes('dQw4w9WgXcQ'), true);
    assert.equal(config.siteStyle.brandFontSize, 33);
    assert.equal(config.siteStyle.brandScaleY, 1.4);
    assert.equal(config.siteStyle.brandOffsetY, -8);
  } finally {
    await stopServer(instance);
  }
});

test('a discarded settings file leaves the festival on its defaults', async () => {
  const port = await freePort();
  const throwawayUrl = `http://127.0.0.1:${port}`;
  const instance = await startServer(port, 'off');
  try {
    const config = await (await fetch(`${throwawayUrl}/api/config`)).json();
    assert.equal(config.gateBackground.youtubeId, 'Ffli-o0ocT0');
    assert.equal(config.npcNames.KENNY, 'KENNY');
  } finally {
    await stopServer(instance);
  }
});

test('chat history survives a service restart and stays readable', async () => {
  const port = await freePort();
  const chatUrl = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'chat-state.json');
  const origin = 'http://127.0.0.1:5173';

  const joinAt = async (name) => {
    const response = await fetch(`${chatUrl}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ name }),
    });
    assert.equal(response.status, 201);
    return (await response.json()).session;
  };

  let instance = await startServer(port, stateFile);
  try {
    const speaker = await joinAt('CHAT BEFORE');
    for (const [channel, text] of [['NEARBY', 'nearby line'], ['FESTIVAL', 'festival line']]) {
      const sent = await fetch(`${chatUrl}/api/chat`, {
        method: 'POST',
        headers: auth(speaker),
        body: JSON.stringify({ channel, text }),
      });
      assert.equal(sent.status, 201);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  } finally {
    await stopServer(instance);
  }

  instance = await startServer(port, stateFile);
  try {
    // A different attendee, with no shared proximity, still reads the history.
    const listener = await joinAt('CHAT AFTER');
    const stateResponse = await fetch(`${chatUrl}/api/session/recover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ session: listener, name: 'CHAT AFTER' }),
    });
    assert.equal(stateResponse.status, 200);
    const texts = (await stateResponse.json()).state.messages.map((message) => message.text);
    assert.equal(texts.includes('nearby line'), true);
    assert.equal(texts.includes('festival line'), true);
  } finally {
    await stopServer(instance);
  }
});

test('a venue publishes one programme clock for every attendee', async () => {
  const session = await join('CLOCK TEST');
  const config = await (await fetch(`${baseUrl}/api/config`)).json();
  const before = config.schedule['drive-in'];
  assert.equal(typeof before.startedAt, 'number');
  assert.equal(before.pausedAt, null);
  assert.ok(before.startedAt > 0, 'the current work records when it began');

  await new Promise((resolve) => setTimeout(resolve, 20));
  const advanced = await fetch(`${baseUrl}/api/programme/drive-in/advance`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: before.youtubeId }),
  });
  assert.equal(advanced.status, 200);
  const after = (await advanced.json()).schedule['drive-in'];
  assert.notEqual(after.youtubeId, before.youtubeId);
  assert.ok(after.startedAt > before.startedAt, 'the next work restarts the clock');
});

test('pausing a venue freezes its programme clock and resuming shifts it', async () => {
  const staffHeaders = {
    'content-type': 'application/json',
    'x-festival-admin-key': 'test-admin-key',
    origin: 'http://127.0.0.1:5173',
  };
  const scheduleFor = async () => (await (await fetch(`${baseUrl}/api/config`)).json()).schedule.palace;
  const edit = async (mode) => {
    const current = await scheduleFor();
    const response = await fetch(`${baseUrl}/api/admin/schedule`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ venue: 'palace', order: current.order, currentYoutubeId: current.youtubeId, mode }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).schedule.palace;
  };

  const running = await scheduleFor();
  const paused = await edit('paused');
  assert.equal(typeof paused.pausedAt, 'number');
  assert.equal(paused.startedAt, running.startedAt, 'pausing keeps the work where it is');

  await new Promise((resolve) => setTimeout(resolve, 60));
  const resumed = await edit('continuous');
  assert.equal(resumed.pausedAt, null);
  assert.ok(
    resumed.startedAt >= paused.startedAt + 50,
    'resuming pushes the clock forward by the time spent paused',
  );
});

test('the club is a full venue with the DR.BEAUTY records', async () => {
  const config = await (await fetch(`${baseUrl}/api/config`)).json();
  const club = config.schedule.club;
  assert.equal(club.name, 'THE BASEMENT');
  assert.equal(club.order.length, 8, 'all eight DR.BEAUTY tracks are in the box');
  assert.equal(club.order.includes('rMicadJVzH8'), true);
  assert.equal(typeof club.startedAt, 'number', 'the club runs on the same programme clock');
  assert.equal(config.customVideos.club.length, 0);
  assert.equal(config.npcProfiles.some((profile) => profile.id === 'XIEHGAN' && profile.name === 'XIEH GAN' && profile.title === 'Resident DJ'), true);
});

test('staff set a track tempo and it is rejected outside a musical range', async () => {
  const staffHeaders = {
    'content-type': 'application/json',
    'x-festival-admin-key': 'test-admin-key',
    origin: 'http://127.0.0.1:5173',
  };
  const saved = await fetch(`${baseUrl}/api/admin/tempo`, {
    method: 'POST',
    headers: staffHeaders,
    body: JSON.stringify({ youtubeId: 'rMicadJVzH8', bpm: 128 }),
  });
  assert.equal(saved.status, 200);
  const config = await (await fetch(`${baseUrl}/api/config`)).json();
  assert.equal(config.trackTempos.rMicadJVzH8, 128);

  for (const bpm of [0, 12, 400]) {
    const rejected = await fetch(`${baseUrl}/api/admin/tempo`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ youtubeId: 'rMicadJVzH8', bpm }),
    });
    assert.equal(rejected.status, 400, `${bpm} BPM is not a club tempo`);
  }
  const unchanged = await (await fetch(`${baseUrl}/api/config`)).json();
  assert.equal(unchanged.trackTempos.rMicadJVzH8, 128);
});

test('a request joins the queue rather than cutting the room off', async () => {
  const session = await join('DJ REQUEST');
  const before = (await (await fetch(`${baseUrl}/api/config`)).json()).schedule.club;
  const wanted = before.order.find((youtubeId) => youtubeId !== before.youtubeId);

  const requested = await fetch(`${baseUrl}/api/club/request`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: wanted }),
  });
  assert.equal(requested.status, 200);
  assert.equal((await requested.json()).position, 1);

  // The room keeps playing what it was playing; the request waits its turn.
  const config = await (await fetch(`${baseUrl}/api/config`)).json();
  assert.equal(config.schedule.club.youtubeId, before.youtubeId, 'nothing is cut short');
  assert.deepEqual(config.venueQueues.club.map((entry) => entry.youtubeId), [wanted]);
  assert.equal(config.venueQueues.club[0].requestedBy, 'DJ REQUEST');

  // When the current track ends, the queued one is what plays next.
  const advanced = await fetch(`${baseUrl}/api/programme/club/advance`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: before.youtubeId }),
  });
  assert.equal(advanced.status, 200);
  const result = await advanced.json();
  assert.equal(result.schedule.club.youtubeId, wanted, 'the queue decides the next track');
  assert.deepEqual(result.venueQueues.club, [], 'and leaves the queue when it plays');
});

test('the booth turns down nonsense and back-to-back requests', async () => {
  const session = await join('DJ SPAM');
  const club = (await (await fetch(`${baseUrl}/api/config`)).json()).schedule.club;

  const unknown = await fetch(`${baseUrl}/api/club/request`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: 'notatrack01' }),
  });
  assert.equal(unknown.status, 404);

  const alreadyOn = await fetch(`${baseUrl}/api/club/request`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: club.youtubeId }),
  });
  assert.equal(alreadyOn.status, 409);

  const first = club.order.find((youtubeId) => youtubeId !== club.youtubeId);
  const accepted = await fetch(`${baseUrl}/api/club/request`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: first }),
  });
  assert.equal(accepted.status, 200);

  const second = club.order.find((youtubeId) => youtubeId !== club.youtubeId && youtubeId !== first);
  const tooSoon = await fetch(`${baseUrl}/api/club/request`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: second }),
  });
  assert.equal(tooSoon.status, 429, 'a cooldown stops one attendee stacking the queue');
});

test('a departing attendee takes their queued requests with them', async () => {
  const session = await join('DJ LEAVER');
  const club = (await (await fetch(`${baseUrl}/api/config`)).json()).schedule.club;
  const wanted = club.order.find((youtubeId) => youtubeId !== club.youtubeId);

  const queued = await fetch(`${baseUrl}/api/club/request`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: wanted }),
  });
  // Another test may already hold this track; only assert when it went in.
  if (queued.status === 200) {
    const withRequest = await (await fetch(`${baseUrl}/api/config`)).json();
    assert.equal(withRequest.venueQueues.club.some((entry) => entry.requestedBy === 'DJ LEAVER'), true);
  }

  const left = await fetch(`${baseUrl}/api/session/leave`, { method: 'POST', headers: auth(session) });
  assert.equal(left.status, 200);
  const after = await (await fetch(`${baseUrl}/api/config`)).json();
  assert.equal(after.venueQueues.club.some((entry) => entry.requestedBy === 'DJ LEAVER'), false);
});

test('staff can rotate the key, and only with the current one', async () => {
  const port = await freePort();
  const keyUrl = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'key-state.json');
  const headers = (key) => ({
    'content-type': 'application/json',
    'x-festival-admin-key': key,
    origin: 'http://127.0.0.1:5173',
  });
  const rotate = (key, body) => fetch(`${keyUrl}/api/admin/key`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify(body),
  });

  let instance = await startServer(port, stateFile);
  try {
    // A wrong current key is refused even though the header is valid.
    const wrongCurrent = await rotate('test-admin-key', { currentKey: 'nope', nextKey: 'a-much-longer-key' });
    assert.equal(wrongCurrent.status, 403);

    // Short and spaced keys are refused.
    assert.equal((await rotate('test-admin-key', { currentKey: 'test-admin-key', nextKey: 'short' })).status, 400);
    assert.equal((await rotate('test-admin-key', { currentKey: 'test-admin-key', nextKey: 'has spaces in it' })).status, 400);

    const changed = await rotate('test-admin-key', { currentKey: 'test-admin-key', nextKey: 'a-much-longer-key' });
    assert.equal(changed.status, 200);

    // The old key stops working and the new one takes over.
    assert.equal((await fetch(`${keyUrl}/api/admin/state`, { headers: headers('test-admin-key') })).status, 401);
    assert.equal((await fetch(`${keyUrl}/api/admin/state`, { headers: headers('a-much-longer-key') })).status, 200);
  } finally {
    await stopServer(instance);
  }

  instance = await startServer(port, stateFile);
  try {
    // The rotation survives a restart, and only a hash was written to disk.
    assert.equal((await fetch(`${keyUrl}/api/admin/state`, { headers: headers('a-much-longer-key') })).status, 200);
    assert.equal((await fetch(`${keyUrl}/api/admin/state`, { headers: headers('test-admin-key') })).status, 401);
    const saved = JSON.parse(readFileSync(stateFile, 'utf8'));
    assert.equal(JSON.stringify(saved).includes('a-much-longer-key'), false, 'the key itself is never stored');
    assert.match(saved.adminKeyDigest.hash, /^[0-9a-f]{128}$/);
  } finally {
    await stopServer(instance);
  }
});
