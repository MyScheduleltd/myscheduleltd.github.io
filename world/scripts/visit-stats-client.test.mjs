import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The browser's half of the anonymous visit tallies (the owner, 2026-11-09).
const bundle = await build({ entryPoints: ['src/network/VisitStats.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { classifyBrowser, classifyDevice, classifySource, rememberVisit, VisitReporter, VISIT_STORAGE_KEY } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const UA = {
  instagramIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.20.85 (iPhone16,2; iOS 18_1; zh_TW; zh-Hant; scale=3.00; 1290x2796; 654818585)',
  threadsIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Barcelona 358.0.0.24.106 (iPhone16,2; iOS 18_1; zh_TW; zh-Hant; scale=3.00; 1290x2796; 663434569)',
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 352.0.0.38.100 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; zh_TW; 649887421)',
  facebookIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/482.0.0.37.104;FBBV/650012345]',
  lineIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.15.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
};

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); }, values };
};

test('the in-app browsers of Instagram, Threads, Facebook and LINE are told apart from Safari and Chrome', () => {
  assert.equal(classifyBrowser(UA.instagramIphone), 'instagram');
  assert.equal(classifyBrowser(UA.instagramAndroid), 'instagram');
  assert.equal(classifyBrowser(UA.threadsIphone), 'threads');
  assert.equal(classifyBrowser(UA.facebookIphone), 'facebook');
  assert.equal(classifyBrowser(UA.lineIphone), 'line');
  assert.equal(classifyBrowser(UA.safariIphone), 'safari');
  assert.equal(classifyBrowser(UA.chromeIphone), 'chrome');
  assert.equal(classifyBrowser(UA.macChrome), 'chrome');
  assert.equal(classifyBrowser(UA.windowsEdge), 'edge');
});

test('phones, tablets (including an iPad calling itself a Mac) and desktops', () => {
  assert.equal(classifyDevice(UA.threadsIphone), 'phone');
  assert.equal(classifyDevice(UA.instagramAndroid), 'phone');
  assert.equal(classifyDevice(UA.ipadSafari, 5), 'tablet');
  assert.equal(classifyDevice(UA.ipadSafari, 0), 'desktop');
  assert.equal(classifyDevice(UA.macChrome), 'desktop');
});

test('a link is credited to utm_source, then the referrer, then the app whose browser opened it', () => {
  assert.equal(classifySource('?utm_source=ig', '', 'safari'), 'instagram');
  assert.equal(classifySource('?utm_source=threads', '', 'safari'), 'threads');
  assert.equal(classifySource('', 'https://l.instagram.com/?u=x', 'safari'), 'instagram');
  assert.equal(classifySource('', 'https://www.threads.net/@myschedule', 'chrome'), 'threads');
  assert.equal(classifySource('', 'https://www.google.com/', 'chrome'), 'search');
  assert.equal(classifySource('', '', 'threads'), 'threads', 'an in-app browser with no referrer still says where it is');
  assert.equal(classifySource('', '', 'safari'), 'direct');
  assert.equal(classifySource('', 'https://news.example/', 'safari'), 'other');
  assert.equal(classifySource('', 'not a url', 'safari'), 'direct', 'an unreadable referrer is no referrer');
});

test('a browser keeps one random token and is returning only on a later Taiwan day', () => {
  const storage = memoryStorage();
  const first = rememberVisit(storage, Date.parse('2026-11-09T02:00:00Z'));
  assert.match(first.token, /^[a-z0-9]{8,40}$/);
  assert.equal(first.returning, false);
  const sameDay = rememberVisit(storage, Date.parse('2026-11-09T15:00:00Z'));
  assert.equal(sameDay.token, first.token);
  assert.equal(sameDay.returning, false, '23:00 in Taipei is still the same day');
  const nextDay = rememberVisit(storage, Date.parse('2026-11-09T16:30:00Z'));
  assert.equal(nextDay.token, first.token);
  assert.equal(nextDay.returning, true);
  assert.deepEqual(Object.keys(JSON.parse(storage.values.get(VISIT_STORAGE_KEY))).sort(), ['first', 'id', 'last'], 'only the token and two dates are stored');
});

test('blocked storage still reports, as a first visit', () => {
  const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const visit = rememberVisit(blocked, Date.now());
  assert.equal(visit.returning, false);
  assert.ok(visit.token.length >= 8);
});

test('a visit reports open, start, entered and one leave, with nothing personal', () => {
  const sent = [];
  let now = Date.parse('2026-11-09T12:00:00Z');
  const reporter = new VisitReporter({
    endpoint: 'https://api.example/api/visit', userAgent: UA.threadsIphone, search: '', referrer: '',
    storage: memoryStorage(), now: () => now, send: (url, body) => sent.push({ url, ...JSON.parse(body) }),
  });
  reporter.open('world');
  reporter.open();
  reporter.start();
  now += 14_000;
  reporter.entered();
  now += 7 * 60_000 + 30_000;
  reporter.leave(1, 3);
  reporter.leave(1, 3);
  assert.deepEqual(sent.map((report) => report.e), ['open', 'start', 'entered', 'leave']);
  assert.ok(sent.every((report) => report.url === 'https://api.example/api/visit'));
  assert.deepEqual(sent[0], { url: 'https://api.example/api/visit', e: 'open', v: sent[0].v, d: 'phone', b: 'threads', r: 0, s: 'threads', c: 'world' });
  assert.equal(sent[2].t, 14);
  assert.deepEqual({ p: sent[3].p, t: sent[3].t, a: sent[3].a }, { p: 'world', t: 450, a: 3 });
  assert.ok(new Set(sent.map((report) => report.v)).size === 1);
});

test('leaving before the world appears says how far loading got, or that ENTER was never pressed', () => {
  const sent = [];
  const make = () => new VisitReporter({ endpoint: '/api/visit', userAgent: UA.instagramIphone, storage: memoryStorage(), send: (_url, body) => sent.push(JSON.parse(body)) });
  const loading = make();
  loading.open();
  loading.start();
  loading.leave(.474, 0);
  const gate = make();
  gate.open();
  gate.leave(0, 0);
  const never = make();
  never.leave(0, 0);
  assert.deepEqual(sent.filter((report) => report.e === 'leave').map(({ p, g }) => ({ p, g })), [{ p: 'loading', g: 47 }, { p: 'gate', g: undefined }]);
});

// STAFF 訪客統計's browser table (the owner, 2026-11-13): titled 載入率; a
// browser is flagged in words as well as red, only from five attempts; the
// alert under the title appears only when something is flagged, naming it.
const staffBundle = await build({ entryPoints: ['src/ui/VisitStaff.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { visitStaffContent } = await import('data:text/javascript;base64,' + Buffer.from(staffBundle.outputFiles[0].text).toString('base64'));
const staffDay = browsers => ({
  day: '2026-11-13', opened: 30, uniqueBrowsers: 20, returning: 0, started: 20, entered: 14, enteredUnique: 14, enteredReturning: 0,
  averageLoadSeconds: 12, devices: {}, sources: {}, browsers, left: {}, leftLoadingAt: {}, crashes: 0, crashStages: {}, stay: {}, averageMinutes: 0, averageAreas: 0,
});
const tally = (opened, started, entered) => ({ opened, started, entered, leftLoading: started - entered, crashed: 0 });
const panel = (browsers, zh = true) => visitStaffContent({ persistent: true, timeZone: 'Asia/Taipei', days: [staffDay(browsers)] }, zh, { loading: false, error: '' });
const row = (html, label) => html.match(new RegExp(`<tr[^>]*><th scope="row">${label}</th>.*?</tr>`))?.[0] ?? '';

test('the STAFF browser table flags a low load rate in words, names it, and waits for five attempts', () => {
  const html = panel({ threads: tally(8, 5, 2), safari: tally(12, 9, 8), line: tally(3, 2, 1) });
  assert.match(html, /<h4 class="staff-subheading">載入率<\/h4>/);
  assert.doesNotMatch(html, /各瀏覽器|紅色：/, 'the old title and the always-on legend are gone');
  assert.match(row(html, 'Threads 內建瀏覽器'), /class="is-warn".*40% <span class="staff-visits__flag">偏低<\/span>/);
  assert.match(html, /role="status">Threads 內建瀏覽器：載入率不到六成。<\/p>/);
  assert.doesNotMatch(row(html, 'Safari'), /is-warn|偏低|樣本少/, '89% with nine attempts is fine');
  const line = row(html, 'LINE 內建瀏覽器');
  assert.match(line, /50% <span class="staff-visits__few">樣本少<\/span>/);
  assert.doesNotMatch(line, /is-warn|偏低/, 'two attempts are too few to flag');
  assert.doesNotMatch(html, /LINE 內建瀏覽器：/, 'and too few are never named in the alert');
});

test('with every browser fine the STAFF browser table says nothing alarming', () => {
  const html = panel({ safari: tally(12, 9, 8), chrome: tally(6, 5, 5), facebook: tally(4, 4, 4) });
  assert.doesNotMatch(html, /載入率不到六成|is-warn|偏低/);
  assert.doesNotMatch(row(html, 'Facebook 內建瀏覽器'), /樣本少/, 'a full rate from few attempts needs no note');
  const english = panel({ threads: tally(8, 6, 1), instagram: tally(9, 7, 3) }, false);
  assert.match(english, />LOAD RATE<\/h4>/);
  assert.match(english, /role="status">INSTAGRAM APP, THREADS APP: load rate under 60%\.<\/p>/);
});
