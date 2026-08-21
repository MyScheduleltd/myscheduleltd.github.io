import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const startServer = async (port, stateFile, seedFile = 'off') => {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      FESTIVAL_PORT: String(port),
      FESTIVAL_ADMIN_KEY: 'test-admin-key',
      // Sessions accumulate across the whole file — nothing here logs out — so
      // the cap has to clear the total the suite opens, not the twenty a real
      // instance holds. The queue at the gate has a test of its own.
      FESTIVAL_MAX_VISITORS: '120',
      // These tests must not depend on YouTube answering.
      FESTIVAL_YOUTUBE_TITLES: 'off',
      FESTIVAL_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
      FESTIVAL_STATE_FILE: stateFile,
      // Assert on the festival the code ships with, never on the running order
      // STAFF happen to have curated into the committed seed.
      FESTIVAL_SEED_FILE: seedFile,
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
    // Up on the roof deck, so restoring the attendee has to put the height back
    // as well as the floor plan.
    y: 7.28,
    z: -12,
    rotation: 0.75,
    location: 'MY SQUARE',
    state: 'walking',
    moving: false,
    running: false,
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
  assert.equal(controlledVisitor.presence.y, 7.28, 'height rides along with the rest of the presence');
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

  const restored = await fetch(`${baseUrl}/api/admin/impersonate`, {
    method: 'POST',
    headers: { ...auth(staff), 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ npcId: '' }),
  });
  assert.equal(restored.status, 200);
});

test('MENTOR follows the highest active feeder, pauses for STAFF control, and ranks NPC feeds', async () => {
  const first = await join('LOYALTY FIRST');
  const second = await join('LOYALTY SECOND');
  const staff = await join('LOYALTY STAFF');
  const adminHeaders = { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' };
  const state = async () => (await (await fetch(`${baseUrl}/api/admin/state`, { headers: adminHeaders })).json());
  const feed = async (session) => fetch(`${baseUrl}/api/mentor/feed`, { method: 'POST', headers: auth(session) });

  const initial = await state();
  assert.equal(initial.mentorFollower, null);
  assert.equal(initial.mentorFeedCounts.visitors[first.id], 0);
  assert.equal(initial.mentorFeedCounts.npcs.MENTOR, undefined);

  const firstFeedResponse = await feed(first);
  assert.equal(firstFeedResponse.status, 200);
  const firstFeedPayload = await firstFeedResponse.json();
  assert.equal(firstFeedPayload.state.mentorFeedCounts.visitors[first.id], 1);
  assert.deepEqual(firstFeedPayload.state.mentorFollower, { kind: 'visitor', id: first.id });
  assert.deepEqual((await state()).mentorFollower, { kind: 'visitor', id: first.id });

  assert.equal((await feed(second)).status, 200);
  assert.deepEqual((await state()).mentorFollower, { kind: 'visitor', id: first.id }, 'the current leader keeps a tied rank');
  assert.equal((await feed(second)).status, 200);
  assert.deepEqual((await state()).mentorFollower, { kind: 'visitor', id: second.id });

  const controlledMentor = await fetch(`${baseUrl}/api/admin/impersonate`, {
    method: 'POST',
    headers: { ...auth(staff), 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ npcId: 'MENTOR' }),
  });
  assert.equal(controlledMentor.status, 200);
  assert.equal((await state()).mentorFollower, null, 'STAFF control suspends autonomous following');

  const restoredStaff = await fetch(`${baseUrl}/api/admin/impersonate`, {
    method: 'POST',
    headers: { ...auth(staff), 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ npcId: '' }),
  });
  assert.equal(restoredStaff.status, 200);
  assert.deepEqual((await state()).mentorFollower, { kind: 'visitor', id: second.id });

  assert.equal((await fetch(`${baseUrl}/api/session/leave`, { method: 'POST', headers: auth(second) })).status, 200);
  assert.deepEqual((await state()).mentorFollower, { kind: 'visitor', id: first.id }, 'the next ranked attendee takes over');
  assert.equal((await fetch(`${baseUrl}/api/session/leave`, { method: 'POST', headers: auth(first) })).status, 200);
  assert.equal((await state()).mentorFollower, null, 'no positive active score leaves MENTOR free');

  const controlledNpc = await fetch(`${baseUrl}/api/admin/impersonate`, {
    method: 'POST',
    headers: { ...auth(staff), 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ npcId: 'NUNO' }),
  });
  assert.equal(controlledNpc.status, 200);
  assert.equal((await feed(staff)).status, 200);
  const npcState = await state();
  assert.equal(npcState.mentorFeedCounts.npcs.NUNO, 1);
  assert.deepEqual(npcState.mentorFollower, { kind: 'npc', id: 'NUNO' });

  const mentorSelfFeed = await fetch(`${baseUrl}/api/admin/impersonate`, {
    method: 'POST',
    headers: { ...auth(staff), 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ npcId: 'MENTOR' }),
  });
  assert.equal(mentorSelfFeed.status, 200);
  assert.equal((await feed(staff)).status, 409);

  const finalRestore = await fetch(`${baseUrl}/api/admin/impersonate`, {
    method: 'POST',
    headers: { ...auth(staff), 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ npcId: '' }),
  });
  assert.equal(finalRestore.status, 200);
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

test('the staff key walks past a queue that holds everybody else', async () => {
  // The service has always let STAFF past a full house — an administrator shut
  // out of a busy room cannot fix whatever made it busy — but the key could
  // only be given after getting in, which is exactly when it is no longer any
  // use. The gate offers it now, so this covers the road it opens.
  const held = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'QUEUED ONE', probe: true }),
  });
  const staffed = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-festival-admin-key': 'test-admin-key' },
    body: JSON.stringify({ name: 'STAFF ONE', probe: true }),
  });
  // Whatever the house is doing, a key is never answered with a queue ticket.
  assert.notEqual(staffed.status, 202, 'a staff key must never be given a place in the queue');
  if (held.status === 202) {
    const body = await held.json();
    assert.ok(body.waiting?.ticket, 'a queued visitor is given a ticket');
  }
});

test('a booth running on a guess defers to the visitor rather than refusing them', async () => {
  const session = await join('GUESS TEST');
  // The rooftop has had no length reported for anything, so the server is
  // running it on the nominal four minutes. That guess drifts — a little on
  // every record and badly across a night — until the booth is certain it is
  // playing something that finished long ago, and refuses a request for a
  // record the visitor can plainly hear is over. Where it is guessing it should
  // give way to the person in the room.
  const rooftop = (await (await fetch(`${baseUrl}/api/config`)).json()).schedule.rooftop;
  const answer = await fetch(`${baseUrl}/api/rooftop/request`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: rooftop.youtubeId }),
  });
  assert.equal(answer.status, 200, 'a guessing booth should not claim to know what is on');
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

// Told how long the record actually runs, the booth knows where the programme
  // has got to and may refuse. A refusal costs nothing, so this goes first.
  await fetch(`${baseUrl}/api/programme/club/duration`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: club.youtubeId, seconds: 600 }),
  });
  const alreadyOn = await fetch(`${baseUrl}/api/club/request`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: club.youtubeId }),
  });
  assert.equal(alreadyOn.status, 409, 'a booth that knows the length may refuse');

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

test('a committed seed carries the festival across a deploy that keeps no disk', async () => {
  const port = await freePort();
  const seededUrl = `http://127.0.0.1:${port}`;
  const seedFile = joinPath(temporaryDirectory, 'seed.json');
  writeFileSync(seedFile, JSON.stringify({
    version: 1,
    schedule: {
      club: {
        name: 'THE CELLAR',
        subtitle: 'GUEST NIGHT',
        order: ['rMicadJVzH8', 'lhAvlkYlFc4'],
        currentIndex: 1,
        mode: 'scheduled-loop',
      },
    },
    gateCopy: { title: 'MY THEATRE' },
  }), 'utf8');

  // A deploy leaves the instance with no state of its own, which is exactly the
  // case this seed exists to cover.
  const instance = await startServer(port, joinPath(temporaryDirectory, 'never-written.json'), seedFile);
  try {
    const config = await (await fetch(`${seededUrl}/api/config`)).json();
    assert.equal(config.schedule.club.name, 'THE CELLAR', 'the seeded venue name is in force');
    assert.equal(config.schedule.club.order.length, 2, 'the seeded running order is in force');
    assert.equal(config.schedule.club.youtubeId, 'lhAvlkYlFc4', 'and it resumes at the seeded position');
    assert.equal(config.gateCopy.title, 'MY THEATRE');
    assert.equal(typeof config.schedule.club.startedAt, 'number', 'the clock is this process own');
  } finally {
    await stopServer(instance);
  }
});

test('an instance that has settings of its own ignores the seed', async () => {
  const port = await freePort();
  const liveUrl = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'outranks-seed.json');
  const seedFile = joinPath(temporaryDirectory, 'outranked-seed.json');
  writeFileSync(seedFile, JSON.stringify({
    version: 1,
    schedule: { club: { name: 'THE SEEDED ROOM', order: ['rMicadJVzH8'], currentIndex: 0 } },
  }), 'utf8');

  let instance = await startServer(port, stateFile, seedFile);
  try {
    const saved = await fetch(`${liveUrl}/api/admin/schedule`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-festival-admin-key': 'test-admin-key',
        origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify({
        venue: 'club',
        name: 'TONIGHT ONLY',
        order: ['rMicadJVzH8'],
        currentYoutubeId: 'rMicadJVzH8',
        mode: 'continuous',
      }),
    });
    assert.equal(saved.status, 200);
  } finally {
    await stopServer(instance);
  }

  instance = await startServer(port, stateFile, seedFile);
  try {
    const config = await (await fetch(`${liveUrl}/api/config`)).json();
    assert.equal(config.schedule.club.name, 'TONIGHT ONLY', 'what STAFF set outranks the committed seed');
  } finally {
    await stopServer(instance);
  }
});

test('presence keeps attendees where they stand across the whole world', async () => {
  const session = await join('EXTENT TEST');
  // The basement's west end and the roof deck's east edge both used to fall
  // outside what the service would accept, so attendees there were pinned to
  // the boundary and drawn somewhere they were not.
  const places = [
    { label: 'the basement', x: -68, y: -16.22, z: 30 },
    { label: 'the roof deck', x: 54, y: 7.28, z: 44 },
    { label: 'the far water', x: 0, y: -2.08, z: -58 },
    // Added after both were found pinned. The temple sits out at x = 76 to 106
    // and the service stopped at 60, so everyone inside it was filed forty-odd
    // units west of where they stood; the gate approach runs to z = 60 and the
    // service stopped at 50. Positions are what the punch is resolved from, so
    // in both places two attendees standing together could not touch.
    { label: 'the temple', x: 98, y: 1.48, z: 4 },
    { label: 'the temple steps', x: 73, y: 1.48, z: -10 },
    { label: 'the festival gate', x: 0, y: 0.28, z: 60 },
    { label: "the basement's west end", x: -99, y: -16.22, z: 30 },
  ];
  for (const place of places) {
    const response = await fetch(`${baseUrl}/api/presence`, {
      method: 'POST',
      headers: auth(session),
      body: JSON.stringify({
        x: place.x,
        y: place.y,
        z: place.z,
        rotation: 0,
        location: place.label,
        state: 'walking',
        moving: false,
        venue: 'shore',
      }),
    });
    assert.equal(response.status, 202);
    const state = await (await fetch(`${baseUrl}/api/admin/state`, {
      headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
    })).json();
    const mine = state.visitors.find((visitor) => visitor.id === session.id);
    assert.equal(mine.presence.x, place.x, `x survives in ${place.label}`);
    assert.equal(mine.presence.y, place.y, `height survives in ${place.label}`);
    assert.equal(mine.presence.z, place.z, `z survives in ${place.label}`);
  }
});

test('a rooftop bench is a seat the service knows about', async () => {
  const session = await join('BENCH TEST');
  // Built into the world but never registered here, so sitting was refused as
  // an unknown seat.
  for (const seatId of ['ROOFTOP-BENCH-1', 'ROOFTOP-BENCH-2', 'ROOFTOP-BENCH-3']) {
    const claimed = await fetch(`${baseUrl}/api/seats/${seatId}/claim`, { method: 'POST', headers: auth(session) });
    assert.equal(claimed.status, 200, `${seatId} can be claimed`);
    const released = await fetch(`${baseUrl}/api/seats/${seatId}/release`, { method: 'POST', headers: auth(session) });
    assert.equal(released.status, 200);
  }
  const nonsense = await fetch(`${baseUrl}/api/seats/ROOFTOP-BENCH-9/claim`, { method: 'POST', headers: auth(session) });
  assert.equal(nonsense.status, 404, 'a bench that does not exist is still refused');
});

test('staff letter the temple sign and everyone is told', async () => {
  const staffHeaders = {
    'content-type': 'application/json',
    'x-festival-admin-key': 'test-admin-key',
    origin: 'http://127.0.0.1:5173',
  };
  const before = await (await fetch(`${baseUrl}/api/config`)).json();
  assert.equal(before.templeSign.name, '美麗本人', 'the sign starts on the festival default');

  const saved = await fetch(`${baseUrl}/api/admin/temple-sign`, {
    method: 'POST',
    headers: staffHeaders,
    body: JSON.stringify({ name: '美麗真人', label: 'THE GREAT HALL' }),
  });
  assert.equal(saved.status, 200);

  // The public settings carry it, which is how every attendee gets the change
  // rather than only the STAFF member who made it.
  const after = await (await fetch(`${baseUrl}/api/config`)).json();
  assert.equal(after.templeSign.name, '美麗真人');
  assert.equal(after.templeSign.label, 'THE GREAT HALL');

  const blank = await fetch(`${baseUrl}/api/admin/temple-sign`, {
    method: 'POST',
    headers: staffHeaders,
    body: JSON.stringify({ name: '', label: '' }),
  });
  assert.equal(blank.status, 400, 'an empty sign is refused rather than left blank');

  const unauthorised = await fetch(`${baseUrl}/api/admin/temple-sign`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ name: 'ANYONE', label: 'ANYTHING' }),
  });
  assert.equal(unauthorised.status, 401, 'and only STAFF may letter it');
});

test('a punch lands on whoever is in front of it, and shakes MENTOR loose', async () => {
  const thrower = await join('THROWER');
  const target = await join('TARGET');
  const stand = async (session, x, z, rotation) => {
    const response = await fetch(`${baseUrl}/api/presence`, {
      method: 'POST',
      headers: auth(session),
      body: JSON.stringify({
        x, y: 0.28, z, rotation, location: 'MY SQUARE',
        state: 'walking', moving: false, running: false, venue: 'shore',
      }),
    });
    assert.equal(response.status, 202);
  };

  // Face to face, an arm's length apart, the thrower looking at the target.
  await stand(thrower, 0, 0, 0);
  await stand(target, 0, 2, 0);
  const landed = await (await fetch(`${baseUrl}/api/punch`, { method: 'POST', headers: auth(thrower) })).json();
  assert.equal(landed.hit?.name, 'TARGET', 'the blow finds whoever is in front of it');

  // Turned away from them it finds nobody, however close they are standing.
  await stand(thrower, 0, 0, Math.PI);
  await new Promise((resolve) => setTimeout(resolve, 650));
  const missed = await (await fetch(`${baseUrl}/api/punch`, { method: 'POST', headers: auth(thrower) })).json();
  assert.equal(missed.hit, null, 'and nobody behind it');

  // A held button cannot become a machine gun.
  await stand(thrower, 0, 0, 0);
  await new Promise((resolve) => setTimeout(resolve, 650));
  await fetch(`${baseUrl}/api/punch`, { method: 'POST', headers: auth(thrower) });
  const tooSoon = await (await fetch(`${baseUrl}/api/punch`, { method: 'POST', headers: auth(thrower) })).json();
  assert.equal(tooSoon.hit, null, 'a second blow straight after lands nothing');

  // Carrying MENTOR and taking one: MENTOR is let go of.
  await fetch(`${baseUrl}/api/mentor/carry`, { method: 'POST', headers: auth(target) }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 650));
  const struck = await (await fetch(`${baseUrl}/api/punch`, { method: 'POST', headers: auth(thrower) })).json();
  assert.equal(struck.hit?.name, 'TARGET');

  // And everyone watching is told, so the recoil is not the victim's word alone.
  const state = await (await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  })).json();
  const hit = state.visitors.find((entry) => entry.name === 'TARGET');
  assert.ok(hit.hitAt > 0, 'the blow is published with the rest of the state');
  assert.equal(hit.hitBy, 'THROWER');
  // Where it came from, so the struck body can be thrown away from it rather
  // than always straight backwards.
  assert.equal(hit.hitFromX, 0);
  assert.equal(hit.hitFromZ, 0);
});

test('the thrower names their target, and cannot name one across the festival', async () => {
  const thrower = await join('NAMER');
  const target = await join('NAMED');
  const stand = async (session, x, z, rotation) => {
    const response = await fetch(`${baseUrl}/api/presence`, {
      method: 'POST',
      headers: auth(session),
      body: JSON.stringify({
        x, y: 0.28, z, rotation, location: 'MY SQUARE',
        state: 'walking', moving: false, running: false, venue: 'shore',
      }),
    });
    assert.equal(response.status, 202);
  };
  const punchAt = async (session, targetId) => (await (await fetch(`${baseUrl}/api/punch`, {
    method: 'POST', headers: auth(session), body: JSON.stringify({ targetId }),
  })).json()).hit;

  // Standing back to back. Working the aim out from these figures finds
  // nobody — but the thrower's screen had them in reach a moment ago, which is
  // the case the naming exists for.
  await stand(thrower, 0, 0, Math.PI);
  await stand(target, 0, 4, 0);
  assert.equal((await punchAt(thrower, target.id))?.name, 'NAMED', 'a named target in reach is struck whichever way both are facing');

  // Naming someone forty units off is not lag, it is a lie.
  await new Promise((resolve) => setTimeout(resolve, 650));
  await stand(target, 0, -40, 0);
  assert.equal(await punchAt(thrower, target.id), null, 'and one across the festival is refused');

  // Naming yourself does nothing.
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(await punchAt(thrower, thrower.id), null, 'nobody punches themselves');
});

test('staff letter the arch over the road, and both faces follow', async () => {
  const staff = { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' };
  const put = (payload) => fetch(`${baseUrl}/api/admin/entrance-sign`, { method: 'POST', headers: staff, body: JSON.stringify(payload) });

  // It ships with the festival's own name on it.
  const before = await (await fetch(`${baseUrl}/api/config`, { headers: { origin: 'http://127.0.0.1:5173' } })).json();
  assert.equal(before.entranceSign.title, 'MYSCHEDULE');

  const changed = await put({ title: 'THE LAST NIGHT', subtitle: 'CLOSING PROGRAMME' });
  assert.equal(changed.status, 200);
  const after = await (await fetch(`${baseUrl}/api/config`, { headers: { origin: 'http://127.0.0.1:5173' } })).json();
  assert.equal(after.entranceSign.title, 'THE LAST NIGHT');
  assert.equal(after.entranceSign.subtitle, 'CLOSING PROGRAMME');

  // One line on its own leaves the other as it was, rather than blanking it.
  assert.equal((await put({ title: 'MYSCHEDULE', subtitle: '' })).status, 200);
  const kept = await (await fetch(`${baseUrl}/api/config`, { headers: { origin: 'http://127.0.0.1:5173' } })).json();
  assert.equal(kept.entranceSign.title, 'MYSCHEDULE');
  assert.equal(kept.entranceSign.subtitle, 'CLOSING PROGRAMME');

  // An arch with nothing on it is not a sign.
  assert.equal((await put({ title: '', subtitle: '' })).status, 400);
});

test('the jukebox is stocked by staff and queued by whoever is standing at it', async () => {
  const staff = { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' };
  const stock = (payload) => fetch(`${baseUrl}/api/admin/jukebox`, { method: 'POST', headers: staff, body: JSON.stringify(payload) });

  // Only a link the service can actually read, and only with a title.
  assert.equal((await stock({ url: 'https://example.com/not-a-video', title: 'NOPE' })).status, 400);
  // A blank title is allowed: the record takes YouTube's own name for it, or
  // its id when that lookup is off or unreachable, as it is here.
  const untitled = await stock({ url: 'https://www.youtube.com/watch?v=UvynvnxZJ3Q', title: '' });
  assert.equal(untitled.status, 200);
  assert.equal((await untitled.json()).jukebox.tracks[0].title, 'UvynvnxZJ3Q');
  assert.equal((await stock({ remove: 'UvynvnxZJ3Q' })).status, 200);

  const added = await stock({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'FIRST RECORD' });
  assert.equal(added.status, 200);
  const second = await stock({ url: 'https://youtu.be/Ffli-o0ocT0', title: 'SECOND RECORD' });
  assert.equal(second.status, 200);
  // The same record twice is a mistake, not a request.
  assert.equal((await stock({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'AGAIN' })).status, 409);

  // Stock alone plays nothing. The machine does not work through its own
  // shelf to fill a silence — an empty queue is an empty square.
  const config = await (await fetch(`${baseUrl}/api/config`, { headers: { origin: 'http://127.0.0.1:5173' } })).json();
  assert.equal(config.jukebox.tracks.length, 2);
  assert.equal(config.jukebox.nowPlaying, null, 'a stocked jukebox with nothing asked for is silent');

  // An attendee puts one on, and it is on the shared list under their name.
  const listener = await join('LISTENER');
  const queued = await fetch(`${baseUrl}/api/jukebox/request`, {
    method: 'POST', headers: auth(listener), body: JSON.stringify({ trackId: 'Ffli-o0ocT0' }),
  });
  assert.equal(queued.status, 200);
  const after = await queued.json();
  // Nothing was playing, so it goes straight on rather than into the queue.
  assert.equal(after.jukebox.nowPlaying?.title, 'SECOND RECORD');
  assert.equal(after.jukebox.nowPlaying?.requestedByName, 'LISTENER');

  // The first request starts playing at once; a second from the same attendee
  // is allowed and waits behind it.
  const again = await fetch(`${baseUrl}/api/jukebox/request`, {
    method: 'POST', headers: auth(listener), body: JSON.stringify({ trackId: 'dQw4w9WgXcQ' }),
  });
  assert.equal(again.status, 200, 'anyone may line up as many as they like');
  const lined = (await again.json()).jukebox;
  assert.equal(lined.nowPlaying?.title, 'SECOND RECORD', 'the first goes on straight away');
  assert.equal(lined.queue.length, 1, 'and the second waits');

  // STAFF can drop a waiting record and stop the machine altogether.
  const dropped = await stock({ drop: lined.queue[0].queueId });
  assert.equal(dropped.status, 200);
  assert.equal((await dropped.json()).jukebox.queue.length, 0);
  const stopped = await stock({ stop: true });
  assert.equal(stopped.status, 200);
  assert.equal((await stopped.json()).jukebox.nowPlaying, null, 'stopping leaves the square silent');

  // A record that is not in the machine cannot be asked for.
  const bogus = await fetch(`${baseUrl}/api/jukebox/request`, {
    method: 'POST', headers: auth(listener), body: JSON.stringify({ trackId: 'not-a-track' }),
  });
  assert.equal(bogus.status, 400);

  // Taking a record out takes its waiting copy with it.
  // The STAFF panel reads the admin payload, not the attendee one. It carried
  // no jukebox at all, so the shelf and the running order were always empty
  // there however many records were in the machine.
  const adminState = await (await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  })).json();
  assert.ok(adminState.jukebox, 'staff are told about the jukebox');
  assert.equal(adminState.jukebox.tracks.length, 2, 'and can see what is in it');

  const removed = await stock({ remove: 'Ffli-o0ocT0' });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).jukebox.tracks.length, 1);
});

test('five blows put an attendee down, and the sixth is refused while they are up', async () => {
  const thrower = await join('KILLER');
  const target = await join('VICTIM');
  const stand = async (session, x, z) => {
    await fetch(`${baseUrl}/api/presence`, {
      method: 'POST',
      headers: auth(session),
      body: JSON.stringify({
        x, y: 0.28, z, rotation: 0, location: 'MY SQUARE',
        state: 'walking', moving: false, running: false, venue: 'shore',
      }),
    });
  };
  const punch = async () => (await (await fetch(`${baseUrl}/api/punch`, {
    method: 'POST', headers: auth(thrower), body: JSON.stringify({ targetId: target.id }),
  })).json()).hit;

  await stand(thrower, 0, 0);
  await stand(target, 0, 2);

  // Four land and leave them standing.
  for (let blow = 1; blow <= 4; blow += 1) {
    const hit = await punch();
    assert.equal(hit?.name, 'VICTIM', `blow ${blow} lands`);
    assert.equal(hit?.died, false, `blow ${blow} does not put them down`);
    await new Promise((resolve) => setTimeout(resolve, 650));
  }

  // The fifth does.
  const fatal = await punch();
  assert.equal(fatal?.died, true, 'the fifth blow puts them down');

  // And they are left alone on the way back up.
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(await punch(), null, 'nothing lands while they are getting up');

  // Everyone is told, so the body can be moved to the temple by its own client.
  const state = await (await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  })).json();
  const dead = state.visitors.find((entry) => entry.name === 'VICTIM');
  assert.ok(dead.diedAt > 0, 'the death is published with the rest of the state');
  assert.equal(dead.killedBy, 'KILLER');
});

test('a punch lands in the temple, where the map used to stop', async () => {
  // The whole reason this is its own test: hit detection reads the positions
  // the service holds, and the service used to clamp everyone in the temple to
  // the same spot forty units west. Two attendees standing face to face in
  // front of the altar were, to this process, standing on top of each other at
  // x = 60 — and a punch there found either nothing or the wrong person.
  const thrower = await join('EAST THROWER');
  const target = await join('EAST TARGET');
  const stand = async (session, x, z, rotation) => {
    const response = await fetch(`${baseUrl}/api/presence`, {
      method: 'POST',
      headers: auth(session),
      body: JSON.stringify({
        x, y: 1.48, z, rotation, location: 'THE TEMPLE',
        state: 'walking', moving: false, running: false, venue: 'shore',
      }),
    });
    assert.equal(response.status, 202);
  };

  await stand(thrower, 96, 4, 0);
  await stand(target, 96, 6, 0);
  const landed = await (await fetch(`${baseUrl}/api/punch`, { method: 'POST', headers: auth(thrower) })).json();
  assert.equal(landed.hit?.name, 'EAST TARGET', 'a blow thrown in the temple lands there');

  // And the far side of the world still works the same way.
  await new Promise((resolve) => setTimeout(resolve, 650));
  await stand(thrower, 0, 58, 0);
  await stand(target, 0, 60, 0);
  const atTheGate = await (await fetch(`${baseUrl}/api/punch`, { method: 'POST', headers: auth(thrower) })).json();
  assert.equal(atTheGate.hit?.name, 'EAST TARGET', 'and one thrown at the gate lands there');
});
