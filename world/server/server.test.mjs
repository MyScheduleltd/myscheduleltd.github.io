import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join as joinPath } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer as createHttpServer } from 'node:http';
import { aesDecrypt, aesEncrypt, checkMacValue } from './ecpay.mjs';
import { ecpayConfig } from './donations.mjs';
import { randomUUID } from 'node:crypto';

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
const startServer = async (port, stateFile, seedFile = 'off', extraEnv = {}) => {
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
      // Offerings against ECPay's stage account, which is public and takes no
      // money. Nothing here contacts ECPay: the tests exercise this service's
      // own half — what it signs, what it accepts, and what it refuses.
      ECPAY_PUBLIC_URL: `http://127.0.0.1:${port}`,
      ...extraEnv,
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

test('a sign-in donation is listed, invoiced and restored for STAFF without a visitor session', async () => {
  const config = ecpayConfig();
  const keys = [config.invoice.hashKey, config.invoice.hashIV];
  let issues = 0, notices = 0;
  const invoiceServer = createHttpServer(async (request,response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const data = aesDecrypt(JSON.parse(raw).Data,...keys);
    if (request.url.endsWith('/Issue')) { issues++; assert.equal(data.CustomerEmail,'guest-test@example.com'); }
    else { notices++; assert.equal(data.NotifyMail,'guest-test@example.com'); }
    const answer = request.url.endsWith('/Issue')
      ? {RtnCode:1,InvoiceNo:'TEST000050',InvoiceDate:'2026-10-09 10:00:00'}
      : {RtnCode:1};
    response.writeHead(200,{'content-type':'application/json'});
    response.end(JSON.stringify({TransCode:1,Data:aesEncrypt(answer,...keys)}));
  });
  await new Promise(resolve=>invoiceServer.listen(0,'127.0.0.1',resolve));
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory,'guest-staff-history.json');
  const env = {ECPAY_STAGE_INVOICE_BASE:`http://127.0.0.1:${invoiceServer.address().port}`};
  let instance = await startServer(port,stateFile,'off',env);
  const staff = {'x-festival-admin-key':'test-admin-key'};
  const list = ()=>fetch(`${url}/api/admin/state`,{headers:staff}).then(r=>r.json());
  try {
    const started = await fetch(`${url}/api/donation`,{
      method:'POST',headers:{'content-type':'application/json',origin:'http://127.0.0.1:5173'},
      body:JSON.stringify({amount:52,email:'guest-test@example.com',displayName:'SIGN-IN GIVER'}),
    });
    assert.equal(started.status,200);
    const {id} = await started.json();
    const pending = (await list()).offerings.find(row=>row.id===id);
    assert.equal(pending.state,'pending');
    assert.equal(pending.visitorName,'SIGN-IN GIVER');
    const notice = {CustomField1:id,MerchantTradeNo:pending.tradeNo,RtnCode:'1',TradeAmt:'52',PaymentType:'Credit_CreditCard',TradeNo:'stage-guest-trade'};
    notice.CheckMacValue=checkMacValue(notice,config.payment.hashKey,config.payment.hashIV);
    const paid = await fetch(`${url}/api/ecpay/notify`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(notice)});
    assert.equal(await paid.text(),'1|OK');
    let row;
    for (let i=0;i<40;i++) {
      row=(await list()).offerings.find(entry=>entry.id===id);
      if(row.invoiceNoticeSent===true) break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(row.state,'paid'); assert.equal(row.invoiceNo,'TEST000050');
    assert.equal(row.invoiceNoticeSent,true); assert.equal(issues,1); assert.equal(notices,1);
    assert.equal('email' in row,false,'STAFF history exposes no recipient address');
    await stopServer(instance);
    instance=await startServer(port,stateFile,'off',env);
    row=(await list()).offerings.find(entry=>entry.id===id);
    assert.equal(row.invoiceNo,'TEST000050','survives a restart when the settings file survives');
    assert.equal(row.visitorName,'SIGN-IN GIVER');
    assert.equal(issues,1,'restoring history does not reissue an invoice');
  } finally {
    await stopServer(instance);
    await new Promise(resolve=>invoiceServer.close(resolve));
  }
});

test('STAFF history is capped at 50 completed records while old unfinished payments remain settleable', async () => {
  const now=Date.now(), stateFile=joinPath(temporaryDirectory,'bounded-offerings.json');
  const completed=Array.from({length:60},(_,i)=>({id:randomUUID(),tradeNo:`FINAL-${i}`,createdAt:now-20*86_400_000-i*1000,paidAt:now-20*86_400_000+1000-i*1000,state:'paid',amount:30,invoiceNo:`TEST-${i}`}));
  const awaiting={id:randomUUID(),tradeNo:'OLD-AWAITING',createdAt:now-86_400_000,state:'awaiting',amount:30};
  const pending={id:randomUUID(),tradeNo:'OLD-PENDING',createdAt:now-86_400_000,state:'pending',amount:30};
  const uninvoiced={id:randomUUID(),tradeNo:'OLD-UNINVOICED',createdAt:now-86_400_000,paidAt:now-86_400_000,state:'paid',amount:30,invoiceError:'Needs a retry'};
  writeFileSync(stateFile,JSON.stringify({donations:[...completed,awaiting,pending,uninvoiced]}));
  const port=await freePort(),url=`http://127.0.0.1:${port}`;
  const instance=await startServer(port,stateFile);
  try {
    const get=()=>fetch(`${url}/api/admin/state`,{headers:{'x-festival-admin-key':'test-admin-key'}}).then(r=>r.json());
    let state=await get();
    assert.equal(state.offeringLimit,50); assert.equal(state.offerings.length,50);
    assert.deepEqual(state.offerings.map(r=>r.id),[awaiting,pending,uninvoiced,...completed.slice(0,47)].map(r=>r.id));
    const config=ecpayConfig();
    const notice={CustomField1:awaiting.id,MerchantTradeNo:awaiting.tradeNo,RtnCode:'1',TradeAmt:'30',PaymentType:'CVS_CVS',TradeNo:'stage-deferred'};
    notice.CheckMacValue=checkMacValue(notice,config.payment.hashKey,config.payment.hashIV);
    assert.equal(await fetch(`${url}/api/ecpay/notify`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(notice)}).then(r=>r.text()),'1|OK');
    state=await get();
    assert.equal(state.offerings.length,50);
    assert.equal(state.offerings[0].id,awaiting.id,'a newly paid older checkout is listed first');
    assert.equal(state.offerings[0].state,'paid');
    await stopServer(instance);
    const kept=JSON.parse(readFileSync(stateFile,'utf8')).donations;
    assert.equal(kept.filter(r=>r.invoiceNo).length,50);
    assert.ok(!kept.some(r=>r.id===completed[59].id),'oldest completed history is deleted, not merely hidden');
    for (const row of [awaiting,pending,uninvoiced]) assert.ok(kept.some(r=>r.id===row.id),'unfinished processing records survive the display limit');
  } finally { await stopServer(instance); }
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
  // The three theatres traded catalogues: the palace took television, the
  // drive-in took the music videos, the shore took the commercials.
  assert.equal(config.schedule.palace.order.length, 2);
  assert.equal(config.schedule['drive-in'].order.length, 32);
  assert.equal(config.schedule.shore.order.length, 4);

  const currentYoutubeId = config.schedule.palace.youtubeId;
  // Early, it is somebody skipping the programme for everyone: refused.
  const early = await fetch(`${baseUrl}/api/programme/palace/advance`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ youtubeId: currentYoutubeId }),
  });
  assert.equal((await early.json()).advanced, false, 'no visitor can skip a work');
  await nearlyOver('palace', currentYoutubeId);
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
      currentYoutubeId: '5pSwEJw53Y8',
      order: ['5pSwEJw53Y8', 'qyMIdPT4K4Q'],
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
  assert.deepEqual(state.schedule.shore.order, ['5pSwEJw53Y8', 'qyMIdPT4K4Q']);
  assert.equal(state.schedule.shore.youtubeId, '5pSwEJw53Y8');
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

const adminPost = (path, body) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-festival-admin-key': 'test-admin-key',
    origin: 'http://127.0.0.1:5173',
  },
  body: JSON.stringify(body),
});

/**
 * Puts a venue's current work one second from the end of its length, through
 * STAFF, so a player's "it has ended" is believed. Visitors cannot shorten a
 * known length, and a skip earlier than the end is refused.
 */
const nearlyOver = async (venue, youtubeId) => {
  const set = await adminPost('/api/admin/duration', { youtubeId, seconds: 16 });
  assert.equal(set.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 1_100));
};

test('staff write a resident introduction, and can take it back off again', async () => {
  // Held on the wave button in the world. Nothing is seeded, because the roster
  // is real colleagues and no biography is invented for them, so the whole
  // feature turns on STAFF being able to put one in and clear it again.
  const written = await adminPost('/api/admin/npcs', {
    npcId: 'KENNY', name: 'KENNY', title: 'Director',
    introduction: 'Directed the opening night film.  ',
  });
  assert.equal(written.status, 200);
  const served = async () => {
    const config = await (await fetch(`${baseUrl}/api/config`)).json();
    return config.npcProfiles.find((profile) => profile.id === 'KENNY');
  };
  let profile = await served();
  // Trimmed on the way in by safeText, like every other field STAFF type.
  assert.equal(profile.introduction, 'Directed the opening night film.');
  assert.equal(profile.title, 'Director');

  // Empty is a real answer, not a missing one: it is how a resident goes back
  // to having just a name and a job title on their card.
  const cleared = await adminPost('/api/admin/npcs', {
    npcId: 'KENNY', name: 'KENNY', title: 'Director', introduction: '   ',
  });
  assert.equal(cleared.status, 200);
  profile = await served();
  assert.equal(profile.introduction, '');

  // A rename must not quietly drop a biography that is already written.
  await adminPost('/api/admin/npcs', {
    npcId: 'KENNY', name: 'KENNY', title: 'Director', introduction: 'Back again.',
  });
  const renamed = await adminPost('/api/admin/npcs', {
    npcId: 'KENNY', name: 'KEN', title: 'Senior Director', introduction: 'Back again.',
  });
  assert.equal(renamed.status, 200);
  profile = await served();
  assert.equal(profile.name, 'KEN');
  assert.equal(profile.introduction, 'Back again.');

  // Put it back, so the tests after this one see the roster they expect.
  await adminPost('/api/admin/npcs', { npcId: 'KENNY', name: 'KENNY', title: 'Senior Director', introduction: '' });
});

test('a resident is introduced in both languages, and an older page cannot wipe the Chinese', async () => {
  // The owner writes in Chinese; the English is its translation. Each half is
  // its own field, so neither language has to be squeezed into the other's.
  const written = await adminPost('/api/admin/npcs', {
    npcId: 'NUNO', name: 'NUNO', title: 'Chief Researcher', titleZh: '首席研究員',
    introduction: 'Loves surfing.', introductionZh: '愛好衝浪。',
  });
  assert.equal(written.status, 200);
  const served = async () => {
    const config = await (await fetch(`${baseUrl}/api/config`)).json();
    return config.npcProfiles.find((profile) => profile.id === 'NUNO');
  };
  let profile = await served();
  assert.equal(profile.title, 'Chief Researcher');
  assert.equal(profile.titleZh, '首席研究員');
  assert.equal(profile.introduction, 'Loves surfing.');
  assert.equal(profile.introductionZh, '愛好衝浪。');

  // A page published before the Chinese fields existed sends only the English
  // pair. Its save must leave the Chinese exactly where it was.
  await adminPost('/api/admin/npcs', {
    npcId: 'NUNO', name: 'NUNO', title: 'Head Researcher', introduction: 'Loves sailing.',
  });
  profile = await served();
  assert.equal(profile.title, 'Head Researcher');
  assert.equal(profile.titleZh, '首席研究員');
  assert.equal(profile.introduction, 'Loves sailing.');
  assert.equal(profile.introductionZh, '愛好衝浪。');

  // Sent empty, they clear — the same as the English introduction.
  await adminPost('/api/admin/npcs', {
    npcId: 'NUNO', name: 'NUNO', title: 'Sound Engineer', titleZh: '', introduction: '', introductionZh: '  ',
  });
  profile = await served();
  assert.equal(profile.titleZh, '');
  assert.equal(profile.introductionZh, '');
});

test('staff retitle a film in one language, and an empty title gives it back', async () => {
  // The STAFF panel published on 2026-10-06 already sends this. Until the
  // service had the route, every save from it was a 404.
  const both = await adminPost('/api/admin/video-title', { youtubeId: 'jiawzYgfkuI', title: 'EN TITLE', titleZh: '中文標題' });
  assert.equal(both.status, 200);
  const config = await (await fetch(`${baseUrl}/api/config`)).json();
  assert.deepEqual(config.videoTitles.jiawzYgfkuI, { title: 'EN TITLE', titleZh: '中文標題' }, 'attendees are told');
  const cleared = await (await adminPost('/api/admin/video-title', { youtubeId: 'jiawzYgfkuI', titleZh: '' })).json();
  assert.deepEqual(cleared.videoTitles.jiawzYgfkuI, { title: 'EN TITLE' }, 'only the language that was cleared goes back');
  const gone = await (await adminPost('/api/admin/video-title', { youtubeId: 'jiawzYgfkuI', title: '' })).json();
  assert.equal(gone.videoTitles.jiawzYgfkuI, undefined);
  const refused = await adminPost('/api/admin/video-title', { youtubeId: 'no', title: 'X' });
  assert.equal(refused.status, 400);
  const outsider = await fetch(`${baseUrl}/api/admin/video-title`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ youtubeId: 'jiawzYgfkuI', title: 'X' }),
  });
  assert.equal(outsider.status, 401, 'only STAFF retitle');
});

test('an unknown resident cannot be given an introduction', async () => {
  const response = await adminPost('/api/admin/npcs', {
    npcId: 'NOBODY', name: 'NOBODY', title: 'Ghost', introduction: 'Unwelcome.',
  });
  assert.equal(response.status, 400);
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
  // An introduction comes back empty on a new resident, and that is the
  // intended state: nobody's biography is invented, so a name and a job title
  // is all a newly added NPC has until STAFF write one.
  assert.deepEqual(profile, {
    id: payload.npcId, name: 'ALICE', title: 'Producer', titleZh: '', introduction: '', introductionZh: '',
  });
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

    const retitled = await fetch(`${restartUrl}/api/admin/video-title`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ youtubeId: 'jiawzYgfkuI', title: 'RESTART TITLE', titleZh: '重啟標題' }),
    });
    assert.equal(retitled.status, 200);

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
    assert.deepEqual(config.videoTitles.jiawzYgfkuI, { title: 'RESTART TITLE', titleZh: '重啟標題' });
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

  await nearlyOver('drive-in', before.youtubeId);
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
  assert.equal(club.name, 'SLAP AND POP');
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
  await nearlyOver('club', before.youtubeId);
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
  await adminPost('/api/admin/duration', { youtubeId: club.youtubeId, seconds: 600 });
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

test('the receipt mailbox reaches STAFF and no attendee payload', async () => {
  // A real address, STAFF's to set. It went out on /api/config to every
  // visitor from 2026-09-11 until this test: nothing was checking.
  const mailbox = 'receipts-private@example.test';
  const staff = { 'x-festival-admin-key': 'test-admin-key', 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' };
  const setMailbox = (email) => fetch(`${baseUrl}/api/admin/offering-receipt`, {
    method: 'POST', headers: staff, body: JSON.stringify({ email }),
  });
  assert.equal((await setMailbox(mailbox)).status, 200);
  try {
    const state = await (await fetch(`${baseUrl}/api/admin/state`, { headers: staff })).json();
    assert.equal(state.offeringReceipt.email, mailbox, 'STAFF can still read the address they set');

    const config = await (await fetch(`${baseUrl}/api/config`)).text();
    assert.ok(!config.includes(mailbox), '/api/config must not carry the mailbox');
    const options = await (await fetch(`${baseUrl}/api/donation/options`)).text();
    assert.ok(!options.includes(mailbox), '/api/donation/options must not carry the mailbox');

    // The attendee broadcast: every `state` event comes from one builder, so
    // the first one on a fresh stream is the one every later broadcast sends.
    const session = await join('MAILBOX PRIVACY');
    const stream = await fetch(`${baseUrl}/api/events`, { headers: { ...auth(session), accept: 'text/event-stream' } });
    const reader = stream.body.getReader(), decoder = new TextDecoder();
    let received = '';
    while (!/event: state\ndata: .*\n\n/.test(received)) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    assert.match(received, /event: state/, 'the stream delivered a state event to check');
    assert.ok(!received.includes(mailbox), 'the attendee broadcast must not carry the mailbox');
  } finally {
    // Leave the shared instance as the rest of the suite expects it.
    await setMailbox('');
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
    { label: "the outer contour walk", x: 120, y: 4.6, z: -6 },
    { label: "the west coastal edge", x: -109, y: .7, z: -30 },
    { label: "the raised temple", x: 98, y: 6.28, z: 4 },
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

test('a name comes back to a visitor whose connection dropped', async () => {
  // The lock-screen case, which is the one that mattered. A name was reserved
  // for two minutes after a stream dropped, so a phone that had been locked
  // came back, asked to join as itself, and was told its own name was taken by
  // a visitor who was nobody: no stream, no presence, two minutes still to run.
  const first = await join('LOCKED PHONE');
  assert.ok(first.id, 'the first arrival gets a session');

  // No event stream was ever opened for that session, which is the state a
  // dropped connection leaves behind.
  const again = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ name: 'LOCKED PHONE' }),
  });
  assert.equal(again.status, 201, 'the same name is granted again to somebody with no live stream');
  const second = (await again.json()).session;
  assert.notEqual(second.id, first.id, 'and it is a new session rather than the old one revived');

  // The old session is genuinely gone rather than left as a second holder of
  // one name, which would put two of the same person in the room.
  const stale = await fetch(`${baseUrl}/api/presence`, {
    method: 'POST',
    headers: auth(first),
    body: JSON.stringify({
      x: 0, y: 1.48, z: 0, rotation: 0, location: 'MY SQUARE',
      state: 'walking', moving: false, running: false, venue: 'shore',
    }),
  });
  assert.equal(stale.status, 401, 'the replaced session no longer counts as a visitor');
});

test('a name is refused while somebody is actually holding it', async () => {
  // The other half: standing a live visitor down would let anybody take a name
  // out from under somebody who is in the room using it.
  const held = await join('LIVE HOLDER');
  const stream = await fetch(`${baseUrl}/api/events`, {
    headers: { ...auth(held), accept: 'text/event-stream' },
  });
  assert.equal(stream.status, 200, 'the holder has an open stream');
  const reader = stream.body.getReader();
  await reader.read();

  const taken = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ name: 'LIVE HOLDER' }),
  });
  assert.equal(taken.status, 409, 'a name in use is still refused');
  await reader.cancel();
});


test('an offering needs an amount in range and an email, from a guest or a visitor', async () => {
  // A guest on the sign-in page may give too (the Donate button there), but
  // is held to exactly the same amount and address rules.
  const guestTooSmall = await fetch(`${baseUrl}/api/donation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 29, email: 'donor@example.com' }),
  });
  assert.equal(guestTooSmall.status, 400);

  const session = await join('OFFERING TEST');
  const tooSmall = await fetch(`${baseUrl}/api/donation`, {
    method: 'POST', headers: auth(session), body: JSON.stringify({ amount: 29, email: 'donor@example.com' }),
  });
  assert.equal(tooSmall.status, 400);
  const tooLarge = await fetch(`${baseUrl}/api/donation`, {
    method: 'POST', headers: auth(session), body: JSON.stringify({ amount: 10001, email: 'donor@example.com' }),
  });
  assert.equal(tooLarge.status, 400);
  const noEmail = await fetch(`${baseUrl}/api/donation`, {
    method: 'POST', headers: auth(session), body: JSON.stringify({ amount: 100, email: 'not-an-address' }),
  });
  assert.equal(noEmail.status, 400, 'the invoice has to go somewhere');

  const started = await fetch(`${baseUrl}/api/donation`, {
    method: 'POST', headers: auth(session), body: JSON.stringify({ amount: 100, email: 'donor@example.com' }),
  });
  assert.equal(started.status, 200);
  const offering = await started.json();
  assert.ok(offering.id);
  assert.ok(offering.checkoutUrl.endsWith(`/api/donation/${offering.id}/checkout`));

  const status = await (await fetch(`${baseUrl}/api/donation/${offering.id}`)).json();
  assert.equal(status.state, 'pending');
});

test('the checkout page carries a signed form and never the key', async () => {
  const session = await join('CHECKOUT TEST');
  const started = await (await fetch(`${baseUrl}/api/donation`, {
    method: 'POST', headers: auth(session), body: JSON.stringify({ amount: 300, email: 'donor@example.com' }),
  })).json();
  const page = await fetch(`${baseUrl}/api/donation/${started.id}/checkout`);
  assert.equal(page.status, 200);
  const markup = await page.text();
  assert.match(markup, /payment-stage\.ecpay\.com\.tw/, 'stage, not production');
  assert.match(markup, /name="CheckMacValue" value="[0-9A-F]{64}"/);
  assert.match(markup, /name="TotalAmount" value="300"/);
  // The secrets are the whole point of doing this server-side.
  assert.equal(markup.includes('pwFHCqoQZGmho4w6'), false);
  assert.equal(markup.includes('EkRm7iFT261dpevs'), false);
});

test('a forged payment notification is refused, and a real one is acknowledged', async () => {
  const { checkMacValue } = await import('./ecpay.mjs');
  const session = await join('NOTIFY TEST');
  const started = await (await fetch(`${baseUrl}/api/donation`, {
    method: 'POST', headers: auth(session), body: JSON.stringify({ amount: 500, email: 'donor@example.com' }),
  })).json();

  const forged = await fetch(`${baseUrl}/api/ecpay/notify`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ MerchantID: '3002607', RtnCode: '1', TradeAmt: '500', CustomField1: started.id, CheckMacValue: 'DEADBEEF' }).toString(),
  });
  assert.equal(forged.status, 400);
  assert.equal(await forged.text(), '0|CheckMacValue');
  const stillPending = await (await fetch(`${baseUrl}/api/donation/${started.id}`)).json();
  assert.equal(stillPending.state, 'pending', 'a forgery must not mark anything paid');

  // ECPay's own stage credentials, which is what the service is configured
  // with when nothing else is set.
  const notice = {
    MerchantID: '3002607',
    MerchantTradeNo: 'IGNORED',
    RtnCode: '1',
    RtnMsg: 'Succeeded',
    TradeAmt: '500',
    TradeNo: '2609090000000001',
    PaymentDate: '2026/09/09 00:00:00',
    PaymentType: 'Credit_CreditCard',
    CustomField1: started.id,
  };
  const real = await fetch(`${baseUrl}/api/ecpay/notify`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...notice,
      CheckMacValue: checkMacValue(notice, 'pwFHCqoQZGmho4w6', 'EkRm7iFT261dpevs'),
    }).toString(),
  });
  assert.equal(real.status, 200);
  assert.equal(await real.text(), '1|OK', 'anything else and ECPay retries for a day');
  const paid = await (await fetch(`${baseUrl}/api/donation/${started.id}`)).json();
  assert.equal(paid.state, 'paid');
});

test('the amount that counts is the one ECPay reports, not the one asked for', async () => {
  const { checkMacValue } = await import('./ecpay.mjs');
  const session = await join('AMOUNT TEST');
  const started = await (await fetch(`${baseUrl}/api/donation`, {
    method: 'POST', headers: auth(session), body: JSON.stringify({ amount: 1000, email: 'donor@example.com' }),
  })).json();
  const notice = { MerchantID: '3002607', RtnCode: '1', TradeAmt: '10', TradeNo: 'T2', CustomField1: started.id };
  await fetch(`${baseUrl}/api/ecpay/notify`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...notice, CheckMacValue: checkMacValue(notice, 'pwFHCqoQZGmho4w6', 'EkRm7iFT261dpevs') }).toString(),
  });
  const settled = await (await fetch(`${baseUrl}/api/donation/${started.id}`)).json();
  assert.equal(settled.amount, 10, 'a client that asks for 1000 and pays 10 has paid 10');
});


test('fixed outfit IDs and independent trouser colours survive join and presence updates',async()=>{
 for(const top of ['#18191b','#191a1c','#1a1b1d']){
  const palette={top,bottoms:'#718262'};
  const response=await fetch(`${baseUrl}/api/session`,{method:'POST',headers:{'content-type':'application/json',origin:'http://127.0.0.1:5173'},body:JSON.stringify({name:'OUTFIT CHECK',palette})});
  assert.equal(response.status,201);const session=(await response.json()).session;
  for(const state of ['walking','swimming','walking']){
   const updated=await fetch(`${baseUrl}/api/presence`,{method:'POST',headers:auth(session),body:JSON.stringify({x:0,z:0,state,palette})});
   assert.equal(updated.status,202);
   const shared=await (await fetch(`${baseUrl}/api/admin/state`,{headers:{'x-festival-admin-key':'test-admin-key',origin:'http://127.0.0.1:5173'}})).json();
   const visitor=shared.visitors.find(v=>v.id===session.id);
   assert.equal(visitor.palette.top,top);assert.equal(visitor.palette.bottoms,palette.bottoms);assert.equal(visitor.presence.state,state);
  }
 }
});

test('the offering panel is served three amounts, all of them payable', async () => {
  const response = await fetch(`${baseUrl}/api/donation/options`);
  assert.equal(response.status, 200);
  const options = await response.json();
  assert.deepEqual(options.presets, [52, 520, 5920]);
  // A preset the server would then refuse is a button that cannot be pressed,
  // and nothing else in the flow checks that the two agree.
  for (const amount of options.presets) {
    assert.ok(amount >= options.min, `NT$${amount} is under the floor of ${options.min}`);
    assert.ok(amount <= options.max, `NT$${amount} is over the ceiling of ${options.max}`);
    assert.ok(Number.isInteger(amount), `NT$${amount} is not a whole dollar`);
  }
  // The panel highlights the second one when it opens, so there has to be one.
  assert.ok(options.presets.length >= 2, 'the default selection must exist');
});

test('an invoice goes to the donor only when they tick the receipt box, and otherwise to the STAFF mailbox', async () => {
  // The owner's rule, 2026-10-06: the visitor's address is used only if they
  // asked for a receipt; without the tick the 電子發票 goes to the mailbox set
  // in the STAFF panel, and the address they typed is not kept at all.
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'receipt-routing-state.json');
  const mailbox = 'festival-invoices@example.test';
  const instance = await startServer(port, stateFile);
  const ids = {};
  try {
    const staffSaved = await fetch(`${url}/api/admin/offering-receipt`, {
      method: 'POST',
      headers: { 'x-festival-admin-key': 'test-admin-key', 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ email: mailbox }),
    });
    assert.equal(staffSaved.status, 200);
    const session = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ name: 'RECEIPT GIVER' }),
    }).then((r) => r.json()).then((r) => r.session);
    const give = (body) => fetch(`${url}/api/donation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.token}`,
        'x-festival-session': session.id,
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify(body),
    });
    const ticked = await give({ amount: 52, email: 'ticked@example.com', receipt: true });
    assert.equal(ticked.status, 200);
    ids.ticked = (await ticked.json()).id;
    const unticked = await give({ amount: 52, email: 'unticked@example.com', receipt: false });
    assert.equal(unticked.status, 200);
    ids.unticked = (await unticked.json()).id;
  } finally {
    await stopServer(instance);
  }
  const saved = JSON.parse(readFileSync(stateFile, 'utf8'));
  const record = (id) => (saved.donations ?? []).find((entry) => entry.id === id);
  assert.equal(record(ids.ticked).email, 'ticked@example.com');
  assert.equal(record(ids.ticked).wantsReceipt, true);
  assert.equal(record(ids.unticked).email, mailbox);
  assert.equal(record(ids.unticked).wantsReceipt, false);
  assert.equal(JSON.stringify(saved).includes('unticked@example.com'), false, 'an address given without the tick is not kept');
});

test('a phone barcode carrier is checked, kept for the invoice, and survives a restart', async () => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'phone-carrier-state.json');
  const instance = await startServer(port, stateFile);
  let id;
  try {
    const session = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ name: 'BARCODE GIVER' }),
    }).then((r) => r.json()).then((r) => r.session);
    const give = (body) => fetch(`${url}/api/donation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.token}`,
        'x-festival-session': session.id,
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify(body),
    });
    assert.equal((await give({ amount: 29, email: 'giver@example.com', receipt: true })).status, 400, 'under NT$30');
    assert.equal((await give({ amount: 52, email: 'giver@example.com', receipt: true, carrier: 'mobile', mobileBarcode: 'AB201C9' })).status, 400, 'no slash');
    const made = await give({ amount: 52, email: 'giver@example.com', receipt: true, carrier: 'mobile', mobileBarcode: '/ab201c9' });
    assert.equal(made.status, 200, 'typed in lowercase, read as the capitals it is');
    ({ id } = await made.json());
  } finally {
    await stopServer(instance);
  }
  const saved = JSON.parse(readFileSync(stateFile, 'utf8')).donations.find((entry) => entry.id === id);
  assert.equal(saved.carrierType, '3');
  assert.equal(saved.carrierNum, '/AB201C9', 'kept, so a payment that lands days later is still invoiced to it');
});

test('a guest on the sign-in page can make an offering, within limits', async () => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const instance = await startServer(port, joinPath(temporaryDirectory, 'guest-offering-state.json'));
  try {
    const give = (address) => fetch(`${url}/api/donation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173', 'cf-connecting-ip': address },
      body: JSON.stringify({ amount: 52, email: 'guest@example.com', receipt: true }),
    });
    const first = await give('203.0.113.20');
    assert.equal(first.status, 200, 'no session needed to pay');
    assert.match((await first.json()).checkoutUrl, /\/api\/donation\/[0-9a-f-]{36}\/checkout$/);
    for (let k = 1; k < 5; k += 1) assert.equal((await give('203.0.113.20')).status, 200);
    assert.equal((await give('203.0.113.20')).status, 429, 'five open checkouts per address');
    assert.equal((await give('203.0.113.21')).status, 200, 'another address is not held up');
  } finally {
    await stopServer(instance);
  }
});

test('a deferred offering survives a restart and can still be settled and invoiced', async () => {
  // The whole reason convenience-store and ATM payments needed work. Somebody
  // takes a 超商代碼 away, the service restarts twice over the next three days,
  // and then ECPay says the money arrived. If the record did not outlive the
  // process, that notification lands on nothing: the visitor is never credited
  // and `issueInvoice` never runs, which means money taken and no 電子發票 —
  // and the invoice is the festival's to issue, not ECPay's.
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'deferred-offering-state.json');

  let id;
  let instance = await startServer(port, stateFile);
  try {
    const session = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ name: 'DEFERRED GIVER' }),
    }).then((r) => r.json()).then((r) => r.session);

    const created = await fetch(`${url}/api/donation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.token}`,
        'x-festival-session': session.id,
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify({ amount: 520, email: 'giver@example.com', receipt: true }),
    });
    assert.equal(created.status, 200);
    ({ id } = await created.json());
    assert.ok(id, 'the offering was given an id');
  } finally {
    await stopServer(instance);
  }

  // It is on disk before anybody has paid anything.
  const saved = JSON.parse(readFileSync(stateFile, 'utf8'));
  const onDisk = (saved.donations ?? []).find((entry) => entry.id === id);
  assert.ok(onDisk, 'the offering was written down before the payer left');
  assert.equal(onDisk.state, 'pending');
  for (const field of ['CardNo', 'cardNo', 'cvv', 'pan']) {
    assert.ok(!(field in onDisk), `${field} must never be persisted`);
  }

  instance = await startServer(port, stateFile);
  try {
    const config = ecpayConfig();
    const notice = {
      MerchantID: config.payment.merchantId,
      MerchantTradeNo: onDisk.tradeNo,
      RtnCode: '1',
      RtnMsg: 'Succeeded',
      TradeAmt: '520',
      TradeNo: '2504010000000001',
      PaymentType: 'CVS_CVS',
      PaymentDate: '2026/09/26 14:12:00',
      CustomField1: id,
    };
    notice.CheckMacValue = checkMacValue(notice, config.payment.hashKey, config.payment.hashIV);
    const settled = await fetch(`${url}/api/ecpay/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(notice).toString(),
    });
    assert.equal(settled.status, 200);
    assert.equal(await settled.text(), '1|OK');

    // And a forged one still cannot move the books, restart or no restart.
    const forged = await fetch(`${url}/api/ecpay/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...notice, TradeAmt: '99999', CheckMacValue: 'nope' }).toString(),
    });
    assert.equal(forged.status, 400);
  } finally {
    await stopServer(instance);
  }

  const after = JSON.parse(readFileSync(stateFile, 'utf8'));
  const settledRecord = (after.donations ?? []).find((entry) => entry.id === id);
  assert.ok(settledRecord, 'the offering is still there after settling');
  assert.equal(settledRecord.state, 'paid');
  // Taken from ECPay's number, never from anything a browser said.
  assert.equal(settledRecord.paidAmount, 520);
});

test('a code issued at a store moves the offering off pending, and only when signed', async () => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'awaiting-offering-state.json');
  const instance = await startServer(port, stateFile);
  try {
    const session = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ name: 'CODE HOLDER' }),
    }).then((r) => r.json()).then((r) => r.session);
    const { id } = await fetch(`${url}/api/donation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.token}`,
        'x-festival-session': session.id,
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify({ amount: 52, email: 'code@example.com', receipt: true }),
    }).then((r) => r.json());

    const config = ecpayConfig();
    const info = {
      MerchantID: config.payment.merchantId,
      MerchantTradeNo: 'MSINFO0000000000',
      RtnCode: '10100073',
      RtnMsg: 'Get CVS Code Succeeded.',
      TradeAmt: '52',
      TradeNo: '2504010000000002',
      PaymentType: 'CVS_CVS',
      CustomField1: id,
    };
    // Unsigned first: this endpoint can move a record's state, so it must
    // refuse anything that did not come from ECPay exactly as the settlement
    // notification does.
    const forged = await fetch(`${url}/api/ecpay/payment-info`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...info, CheckMacValue: 'nope' }).toString(),
    });
    assert.equal(forged.status, 400);

    info.CheckMacValue = checkMacValue(info, config.payment.hashKey, config.payment.hashIV);
    const accepted = await fetch(`${url}/api/ecpay/payment-info`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(info).toString(),
    });
    assert.equal(accepted.status, 200);
    assert.equal(await accepted.text(), '1|OK');
  } finally {
    await stopServer(instance);
  }

  const after = JSON.parse(readFileSync(stateFile, 'utf8'));
  const record = (after.donations ?? []).at(-1);
  assert.equal(record.state, 'awaiting', 'a code was issued, so it is no longer an abandoned checkout');
  assert.equal(record.invoiceNo, '', 'no invoice yet: nothing has been paid');
  // The code itself is ECPay's to show and email. Keeping a copy would be one
  // more thing to leak for no benefit the payer can use.
  const text = JSON.stringify(record);
  for (const leak of ['vAccount', 'PaymentNo', 'Barcode1', 'BankCode']) {
    assert.ok(!text.includes(leak), `${leak} must not be stored`);
  }
});


test('a failed attempt to get a store code leaves the offering alone', async () => {
  // ECPay reports a 取號 that failed through the same callback as one that
  // succeeded. Reading only the record id moved the offering to `awaiting`
  // either way — telling the visitor to go and pay with a code they were
  // never given, and holding the record open on the strength of it.
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'failed-code-state.json');
  const instance = await startServer(port, stateFile);
  try {
    const session = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ name: 'NO CODE' }),
    }).then((r) => r.json()).then((r) => r.session);
    const { id } = await fetch(`${url}/api/donation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.token}`,
        'x-festival-session': session.id,
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify({ amount: 52, email: 'nocode@example.com', receipt: true }),
    }).then((r) => r.json());

    const config = ecpayConfig();
    const failure = {
      MerchantID: config.payment.merchantId,
      MerchantTradeNo: 'MSFAIL0000000000',
      RtnCode: '10100058',
      RtnMsg: 'Get code failed.',
      TradeAmt: '52',
      TradeNo: '2504010000000003',
      PaymentType: 'CVS_CVS',
      CustomField1: id,
    };
    failure.CheckMacValue = checkMacValue(failure, config.payment.hashKey, config.payment.hashIV);
    const answered = await fetch(`${url}/api/ecpay/payment-info`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(failure).toString(),
    });
    // Acknowledged, because it did come from ECPay and there is nothing to retry.
    assert.equal(answered.status, 200);
  } finally {
    await stopServer(instance);
  }

  const after = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal((after.donations ?? []).at(-1).state, 'pending', 'no code, no promise');
});

test('tracked limbs are relayed to everyone, checked field by field', async () => {
  const session = await join('LIMBS TEST');
  const response = await fetch(`${baseUrl}/api/presence`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({
      x: 1, y: .28, z: 2, rotation: 0, location: 'MY SQUARE', state: 'walking', moving: false, running: false, venue: 'shore',
      limbs: {
        l: [.1234, -.5, .9, 0, -1, 0, 1, 0, 0],   // kept, to hundredths
        le: [.346, -.523, .78],                     // elbow direction
        re: [0, 1],                               // incomplete elbow: dropped
        r: [1, 2, 3],                              // wrong length: dropped
        t: [9, -9],                                // held to ±4
        h: [.2, 'up'],                             // not numbers: dropped
        extra: [1, 2],                             // not a field: dropped
      },
    }),
  });
  assert.equal(response.status, 202);
  const state = await (await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  })).json();
  const visitor = state.visitors.find((candidate) => candidate.id === session.id);
  assert.deepEqual(visitor.presence.limbs, { l: [.12, -.5, .9, 0, -1, 0, 1, 0, 0], le: [.35, -.52, .78], t: [4, -4] });
  // Tracking stops: the next presence without limbs takes them away.
  await fetch(`${baseUrl}/api/presence`, {
    method: 'POST',
    headers: auth(session),
    body: JSON.stringify({ x: 1, y: .28, z: 2, rotation: 0, location: 'MY SQUARE', state: 'walking', moving: false, running: false, venue: 'shore' }),
  });
  const after = await (await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173' },
  })).json();
  assert.equal(after.visitors.find((candidate) => candidate.id === session.id).presence.limbs, undefined);
});

test('wrong staff keys lock that address out, and nobody else', async () => {
  const from = (address, key) => fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': key, 'x-forwarded-for': address, origin: 'http://127.0.0.1:5173' },
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal((await from('203.0.113.9', `guess-${attempt}`)).status, 401);
  }
  // Locked: even the right key is refused, or the lock would announce a hit.
  assert.equal((await from('203.0.113.9', 'test-admin-key')).status, 429);
  // Another address is untouched.
  assert.equal((await from('198.51.100.4', 'test-admin-key')).status, 200);
  // Behind Cloudflare the address is CF-Connecting-IP, which a client cannot
  // choose; a forged X-Forwarded-For beside it changes nothing.
  const viaEdge = await fetch(`${baseUrl}/api/admin/state`, {
    headers: { 'x-festival-admin-key': 'test-admin-key', 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '192.0.2.77', origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(viaEdge.status, 429);
});

test('recovering a session cannot add attendees past the room limit', async () => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const instance = await startServer(port, joinPath(temporaryDirectory, 'recover-cap.json'), 'off', { FESTIVAL_MAX_VISITORS: '1' });
  try {
    const headers = { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' };
    const first = await fetch(`${url}/api/session`, { method: 'POST', headers, body: JSON.stringify({ name: 'INSIDE' }) });
    assert.equal(first.status, 201);
    const forged = await fetch(`${url}/api/session/recover`, {
      method: 'POST', headers,
      body: JSON.stringify({ name: 'SNEAK', session: { id: 'not-a-session', token: 'not-a-token' } }),
    });
    assert.equal(forged.status, 503, 'a made-up session is a new attendee, and the room is full');
  } finally {
    await stopServer(instance);
  }
});

test('ids shaped like object internals are not accepted as videos', async () => {
  const refused = await adminPost('/api/admin/tempo', { youtubeId: '__proto__', bpm: 120 });
  assert.equal(refused.status, 400);
});

test('a visitor cannot shorten a work, alone or by repeating themselves', async () => {
  const one = await join('LENGTH ONE');
  const two = await join('LENGTH TWO');
  const report = (session, seconds) => fetch(`${baseUrl}/api/programme/shore/duration`, {
    method: 'POST', headers: auth(session), body: JSON.stringify({ youtubeId: 'zzLengthTest1', seconds }),
  });
  const known = async () => (await (await fetch(`${baseUrl}/api/config`)).json()).trackDurations.zzLengthTest1;
  await report(one, 5);
  assert.equal(await known(), undefined, 'five seconds is not a length anything is shortened to');
  await report(one, 60);
  await report(one, 60);
  assert.equal(await known(), undefined, 'one visitor repeating themselves is still one visitor');
  await report(two, 61);
  assert.equal(await known(), 61, 'two players agreeing is a length');
  await report(one, 30);
  await report(two, 30);
  assert.equal(await known(), 61, 'and once known, visitors cannot change it');
});



test('STAFF see an offering whose invoice ECPay refused, and can issue it again', async () => {
  // A stand-in for ECPay's invoice service, on ECPay's public stage keys. It
  // refuses the first invoice and issues the second: the shape of a wrong key
  // fixed, or a 字軌 opened, after the payment had already been taken.
  const config = ecpayConfig();
  const keys = [config.invoice.hashKey, config.invoice.hashIV];
  const issues = [];
  const notices = [];
  const ecpay = createHttpServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const data = aesDecrypt(JSON.parse(raw).Data, ...keys);
    const reply = (inner) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ TransCode: 1, TransMsg: '', Data: aesEncrypt(inner, ...keys) }));
    };
    if (request.url === '/B2CInvoice/Issue') {
      issues.push(data);
      return issues.length === 1
        ? reply({ RtnCode: 1600003, RtnMsg: '查無可用字軌' })
        : reply({ RtnCode: 1, RtnMsg: '開立發票成功', InvoiceNo: 'FU67503600', InvoiceDate: '2026-10-07 21:00:00' });
    }
    notices.push(data);
    return reply({ RtnCode: 1, RtnMsg: '發送通知成功' });
  });
  await new Promise((resolve) => ecpay.listen(0, '127.0.0.1', resolve));
  const fake = `http://127.0.0.1:${ecpay.address().port}`;

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const instance = await startServer(port, joinPath(temporaryDirectory, 'staff-offerings-state.json'), 'off', {
    ECPAY_STAGE_INVOICE_BASE: fake,
  });
  const staff = { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' };
  // Render's log outlives the records (no disk), so every step goes there.
  let log = '';
  instance.stdout.on('data', (chunk) => { log += chunk.toString(); });
  instance.stderr.on('data', (chunk) => { log += chunk.toString(); });
  try {
    const session = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ name: 'REFUSED GIVER' }),
    }).then((r) => r.json()).then((r) => r.session);
    const { id } = await fetch(`${url}/api/donation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.token}`,
        'x-festival-session': session.id,
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify({ amount: 30, email: 'giver@example.com', receipt: true }),
    }).then((r) => r.json());
    const tradeNo = (await fetch(`${url}/api/admin/state`, { headers: staff }).then((r) => r.json()))
      .offerings.find((entry) => entry.id === id).tradeNo;
    const notice = {
      MerchantID: config.payment.merchantId,
      MerchantTradeNo: tradeNo,
      RtnCode: '1',
      RtnMsg: 'Succeeded',
      TradeAmt: '30',
      TradeNo: '2510070000000001',
      PaymentType: 'Credit_CreditCard',
      PaymentDate: '2026/10/07 21:00:00',
      CustomField1: id,
    };
    notice.CheckMacValue = checkMacValue(notice, config.payment.hashKey, config.payment.hashIV);
    await fetch(`${url}/api/ecpay/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(notice).toString(),
    });

    let refused;
    for (let attempt = 0; attempt < 50 && !refused?.invoiceError; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const state = await fetch(`${url}/api/admin/state`, { headers: staff }).then((r) => r.json());
      refused = state.offerings.find((entry) => entry.id === id);
    }
    assert.equal(issues.length, 1, 'the invoice was asked for once the payment arrived');
    assert.equal(issues[0].CarrierType, '1');
    assert.equal(issues[0].CarrierNum, '', 'ECPay fills its own carrier number in');
    assert.equal(refused.state, 'paid');
    assert.equal(refused.invoiceNo, '');
    assert.match(refused.invoiceError, /查無可用字軌/, 'STAFF read ECPay\'s own reason');
    assert.equal(refused.canRetry, true);
    for (const field of ['email', 'carrierNum']) assert.ok(!(field in refused), `${field} is not shown to STAFF`);
    assert.ok(!JSON.stringify(refused).includes('giver@example.com'), 'nor is the address anywhere in it');

    // Visitors cannot reach it.
    const stranger = await fetch(`${url}/api/admin/offerings/retry-invoice`, {
      method: 'POST',
      headers: { ...staff, 'x-festival-admin-key': 'wrong' },
      body: JSON.stringify({ id }),
    });
    assert.equal(stranger.status, 401);
    assert.equal(issues.length, 1);

    const retried = await fetch(`${url}/api/admin/offerings/retry-invoice`, {
      method: 'POST',
      headers: staff,
      body: JSON.stringify({ id }),
    });
    assert.equal(retried.status, 200);
    const { offering } = await retried.json();
    assert.equal(offering.invoiceNo, 'FU67503600');
    assert.equal(offering.invoiceError, '');
    assert.equal(offering.canRetry, false, 'an issued invoice is never asked for twice');
    assert.equal(issues[1].RelateNumber, tradeNo, 'the same sale, the same number');
    assert.equal(notices.length, 1, 'and ECPay was asked to email it');
    assert.equal(notices[0].NotifyMail, 'giver@example.com');

    const again = await fetch(`${url}/api/admin/offerings/retry-invoice`, {
      method: 'POST',
      headers: staff,
      body: JSON.stringify({ id }),
    });
    assert.equal(again.status, 200);
    assert.equal(issues.length, 2, 'pressing it again issues nothing more');

    for (const step of [`Offering ${tradeNo} opened`, `Offering ${tradeNo} paid`, `Invoice not issued for ${tradeNo}`,
      `Invoice FU67503600 issued for ${tradeNo}`, 'Invoice FU67503600 emailed by ECPay']) {
      assert.ok(log.includes(step), `the log says: ${step}`);
    }
    assert.ok(!log.includes('giver@example.com'), 'and never the address');

    // A payment ECPay reports for a record this instance has lost.
    const orphan = { ...notice, MerchantTradeNo: 'MSLOSTRECORD0001', CustomField1: '00000000-0000-4000-8000-000000000000' };
    delete orphan.CheckMacValue;
    orphan.CheckMacValue = checkMacValue(orphan, config.payment.hashKey, config.payment.hashIV);
    await fetch(`${url}/api/ecpay/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(orphan).toString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.match(log, /Offering MSLOSTRECORD0001 paid \(NT\$30\), but this service no longer has its record/);
  } finally {
    await stopServer(instance);
    await new Promise((resolve) => ecpay.close(resolve));
  }
});


test('a jukebox record plays its own length, not a guess, and a length heard is kept', async () => {
  // Records were timed against a flat 3:35 after every redeploy, so anything
  // longer was cut off (the owner, 2026-10-08). A length on file is used now.
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'jukebox-length-state.json');
  const seedFile = joinPath(temporaryDirectory, 'jukebox-length-seed.json');
  writeFileSync(seedFile, JSON.stringify({
    version: 1,
    jukeboxTracks: [
      { id: 'bc0KhhjJP98', youtubeId: 'bc0KhhjJP98', title: 'SHORT ONE' },
      { id: '58RgLQ_0Ars', youtubeId: '58RgLQ_0Ars', title: 'UNKNOWN LENGTH' },
    ],
    trackDurations: { bc0KhhjJP98: 2 },
  }), 'utf8');
  const instance = await startServer(port, stateFile, seedFile);
  try {
    const session = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ name: 'RECORD PLAYER' }),
    }).then((r) => r.json()).then((r) => r.session);
    const as = { authorization: `Bearer ${session.token}`, 'x-festival-session': session.id, 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' };
    const put = await fetch(`${url}/api/jukebox/request`, { method: 'POST', headers: as, body: JSON.stringify({ trackId: 'bc0KhhjJP98' }) });
    assert.equal((await put.json()).jukebox.nowPlaying?.youtubeId, 'bc0KhhjJP98');
    await new Promise((resolve) => setTimeout(resolve, 2_600));
    const config = await fetch(`${url}/api/config`).then((r) => r.json());
    assert.equal(config.jukebox.nowPlaying, null, 'it ran its two seconds, not three and a half minutes');

    // An unknown record: a listener's player says it runs 4:22. That is kept
    // with every other length, which is what is saved and committed.
    await fetch(`${url}/api/jukebox/duration`, { method: 'POST', headers: as, body: JSON.stringify({ youtubeId: '58RgLQ_0Ars', seconds: 262 }) });
    const learned = await fetch(`${url}/api/config`).then((r) => r.json());
    assert.equal(learned.trackDurations['58RgLQ_0Ars'], 262);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const saved = JSON.parse(readFileSync(stateFile, 'utf8'));
    assert.equal(saved.trackDurations?.['58RgLQ_0Ars'], 262, `and written down: ${JSON.stringify(saved.trackDurations)} ${Object.keys(saved).join(',')}`);

    // And a known length is not cut short by a visitor afterwards.
    await fetch(`${url}/api/jukebox/duration`, { method: 'POST', headers: as, body: JSON.stringify({ youtubeId: '58RgLQ_0Ars', seconds: 30 }) });
    assert.equal((await fetch(`${url}/api/config`).then((r) => r.json())).trackDurations['58RgLQ_0Ars'], 262);
  } finally {
    await stopServer(instance);
  }
});

test('lengths nobody has on file are looked up on YouTube when the service starts', async () => {
  // A stand-in for YouTube's watch page: the length is all that is read.
  const asked = [];
  const youtube = createHttpServer((request, response) => {
    const id = new URL(request.url, 'http://x').searchParams.get('v');
    asked.push(id);
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(id === '58RgLQ_0Ars' ? '<script>var x={"lengthSeconds":"262"};</script>' : '<html>no length here</html>');
  });
  await new Promise((resolve) => youtube.listen(0, '127.0.0.1', resolve));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const seedFile = joinPath(temporaryDirectory, 'lookup-seed.json');
  writeFileSync(seedFile, JSON.stringify({
    version: 1,
    jukeboxTracks: [
      { id: '58RgLQ_0Ars', youtubeId: '58RgLQ_0Ars', title: 'NEEDS A LENGTH' },
      { id: 'bc0KhhjJP98', youtubeId: 'bc0KhhjJP98', title: 'ALREADY KNOWN' },
      { id: 'UvynvnxZJ3Q', youtubeId: 'UvynvnxZJ3Q', title: 'YOUTUBE WILL NOT SAY' },
    ],
    trackDurations: { bc0KhhjJP98: 208 },
  }), 'utf8');
  const instance = await startServer(port, joinPath(temporaryDirectory, 'lookup-state.json'), seedFile, {
    FESTIVAL_YOUTUBE_TITLES: 'on',
    FESTIVAL_YOUTUBE_ORIGIN: `http://127.0.0.1:${youtube.address().port}`,
  });
  try {
    let lengths = {};
    for (let attempt = 0; attempt < 40 && !lengths['58RgLQ_0Ars']; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      lengths = (await fetch(`${url}/api/config`).then((r) => r.json())).trackDurations;
    }
    assert.equal(lengths['58RgLQ_0Ars'], 262, 'looked up');
    assert.equal(lengths.bc0KhhjJP98, 208, 'a length on file is left alone');
    assert.equal(lengths.UvynvnxZJ3Q, undefined, 'and one YouTube would not give stays unknown, not invented');
    assert.ok(!asked.includes('bc0KhhjJP98'), 'only what is missing is asked for');
  } finally {
    await stopServer(instance);
    await new Promise((resolve) => youtube.close(resolve));
  }
});

test('STAFF can ask ECPay whether the invoice keys work, without issuing anything', async () => {
  const config = ecpayConfig();
  const keys = [config.invoice.hashKey, config.invoice.hashIV];
  let mode = 'ok';
  const asked = [];
  const ecpay = createHttpServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    asked.push(request.url);
    if (mode === 'wrong-keys') {
      response.writeHead(500, { 'content-type': 'text/html' });
      return response.end('<html>Internal Server Error</html>');
    }
    const data = aesDecrypt(JSON.parse(raw).Data, ...keys);
    assert.equal(data.InvoiceCategory, 1);
    assert.equal(data.InvoiceYear, String(new Date().getFullYear() - 1911), 'the ROC year');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ TransCode: 1, TransMsg: '', Data: aesEncrypt({
      RtnCode: 1,
      RtnMsg: '查詢成功',
      InvoiceInfo: [{ InvoiceHeader: 'FU', InvoiceYear: '115', InvoiceTerm: 5, InvType: '07', InvoiceStart: '67503600', InvoiceEnd: '67503949', InvoiceNo: '', UseStatus: 2 }],
    }, ...keys) }));
  });
  await new Promise((resolve) => ecpay.listen(0, '127.0.0.1', resolve));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const instance = await startServer(port, joinPath(temporaryDirectory, 'invoice-check-state.json'), 'off', {
    ECPAY_STAGE_INVOICE_BASE: `http://127.0.0.1:${ecpay.address().port}`,
  });
  const staff = { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' };
  try {
    const good = await fetch(`${url}/api/admin/invoice-check`, { method: 'POST', headers: staff, body: '{}' }).then((r) => r.json());
    assert.equal(good.ok, true);
    assert.deepEqual(good.ranges.map((range) => [range.header, range.term, range.used, range.status]), [['FU', 5, '', 2]]);
    assert.deepEqual(asked, ['/B2CInvoice/GetInvoiceWordSetting'], 'only the read-only query; nothing issued');

    mode = 'wrong-keys';
    const bad = await fetch(`${url}/api/admin/invoice-check`, { method: 'POST', headers: staff, body: '{}' }).then((r) => r.json());
    assert.equal(bad.ok, false);
    assert.match(bad.message, /HTTP 500: usually the invoice MerchantID, HashKey and HashIV do not belong together/);

    const stranger = await fetch(`${url}/api/admin/invoice-check`, { method: 'POST', headers: { ...staff, 'x-festival-admin-key': 'nope' }, body: '{}' });
    assert.equal(stranger.status, 401);
  } finally {
    await stopServer(instance);
    await new Promise((resolve) => ecpay.close(resolve));
  }
});

test('a note left with an offering goes on the wish wall once paid, never to disk, newest thirty', async () => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const stateFile = joinPath(temporaryDirectory, 'wish-wall-state.json');
  const instance = await startServer(port, stateFile);
  const config = ecpayConfig();
  const staff = { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' };
  const wall = async () => (await fetch(`${url}/api/config`).then((r) => r.json())).wishes;
  const pay = async (id, amount) => {
    const tradeNo = (await fetch(`${url}/api/admin/state`, { headers: staff }).then((r) => r.json())).offerings.find((o) => o.id === id).tradeNo;
    const notice = { MerchantID: config.payment.merchantId, MerchantTradeNo: tradeNo, RtnCode: '1', RtnMsg: 'Succeeded', TradeAmt: String(amount), TradeNo: '2510080000000001', PaymentType: 'Credit_CreditCard', PaymentDate: '2026/10/08 12:00:00', CustomField1: id };
    notice.CheckMacValue = checkMacValue(notice, config.payment.hashKey, config.payment.hashIV);
    await fetch(`${url}/api/ecpay/notify`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(notice).toString() });
  };
  try {
    const session = await fetch(`${url}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' }, body: JSON.stringify({ name: 'WISHER' }) })
      .then((r) => r.json()).then((r) => r.session);
    const as = { authorization: `Bearer ${session.token}`, 'x-festival-session': session.id, 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' };
    // A visitor's note is signed with their own name, whatever they send.
    const { id } = await fetch(`${url}/api/donation`, { method: 'POST', headers: as, body: JSON.stringify({ amount: 30, email: 'giver@example.com', receipt: true, message: '祝影展順利！', displayName: 'SOMEONE ELSE' }) }).then((r) => r.json());
    assert.deepEqual(await wall(), [], 'nothing goes up before the money does');
    await pay(id, 30);
    assert.deepEqual((await wall()).map((w) => [w.name, w.message]), [['WISHER', '祝影展順利！']]);

    // A guest on the sign-in page signs with what they typed at the gate.
    const guest = await fetch(`${url}/api/donation`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' }, body: JSON.stringify({ amount: 30, email: 'guest@example.com', receipt: true, message: '  hello   wall  ', displayName: 'AWD' }) }).then((r) => r.json());
    await pay(guest.id, 30);
    assert.deepEqual((await wall()).at(-1), { ...(await wall()).at(-1), name: 'AWD', message: 'hello wall' });

    // Never written down.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const saved = readFileSync(stateFile, 'utf8');
    assert.ok(!saved.includes('祝影展順利') && !saved.includes('hello wall'), 'the notes are memory only');

    // The newest thirty stay; the oldest falls off.
    for (let index = 0; index < 30; index += 1) {
      const more = await fetch(`${url}/api/donation`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' }, body: JSON.stringify({ amount: 30, email: 'guest@example.com', receipt: true, message: `note ${index}` }) }).then((r) => r.json());
      if (more.id) await pay(more.id, 30);
    }
    const full = await wall();
    assert.equal(full.length, 30);
    assert.ok(!full.some((w) => w.message === '祝影展順利！'), 'the oldest went first');

    // STAFF can take one down; a visitor cannot.
    const target = full.at(-1).id;
    assert.equal((await fetch(`${url}/api/admin/wishes/remove`, { method: 'POST', headers: { ...staff, 'x-festival-admin-key': 'nope' }, body: JSON.stringify({ id: target }) })).status, 401);
    assert.equal((await fetch(`${url}/api/admin/wishes/remove`, { method: 'POST', headers: staff, body: JSON.stringify({ id: target }) })).status, 200);
    assert.ok(!(await wall()).some((w) => w.id === target));
  } finally {
    await stopServer(instance);
  }
});

test('a resident\'s music credits keep their lines, and an introduction save leaves them alone', async () => {
  const staff = { 'x-festival-admin-key': 'test-admin-key', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' };
  const profile = (await fetch(`${baseUrl}/api/config`).then((r) => r.json())).djProfiles.XIEHGAN;
  assert.match(profile.creditsZh, /夜市王/, 'XIEH GAN ships with the owner\'s credits');
  assert.match(profile.credits, /The King of Nightmarket/);
  const save = (extra) => fetch(`${baseUrl}/api/admin/dj-profile`, {
    method: 'POST',
    headers: staff,
    body: JSON.stringify({ id: 'XIEHGAN', role: profile.role, roleZh: profile.roleZh, introduction: profile.introduction, introductionZh: profile.introductionZh, ...extra }),
  });
  assert.equal((await save({ creditsZh: '第一筆\n\n  第二筆  \n*附註' })).status, 200);
  let after = (await fetch(`${baseUrl}/api/config`).then((r) => r.json())).djProfiles.XIEHGAN;
  assert.equal(after.creditsZh, '第一筆\n第二筆\n*附註', 'one credit per line, blanks dropped');
  assert.equal(after.credits, profile.credits, 'the other language untouched');
  assert.equal((await save({})).status, 200);
  after = (await fetch(`${baseUrl}/api/config`).then((r) => r.json())).djProfiles.XIEHGAN;
  assert.equal(after.creditsZh, '第一筆\n第二筆\n*附註', 'an introduction save keeps the credits');
  // Put the owner's list back for whatever runs after.
  await save({ creditsZh: profile.creditsZh, credits: profile.credits });
});
