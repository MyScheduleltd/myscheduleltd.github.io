import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import legacySource from '../../docs/js/allData.js';

/** The room remembers this many lines; older ones fall off the top. */
const CHAT_HISTORY_LIMIT = 50;
/**
 * How long each work runs, learned from the players that watch it. The
 * catalogue comes from the site's video list and carries no durations, so
 * until a work has been watched once its slot is a nominal guess.
 */
const trackDurations = {};
const NOMINAL_TRACK_SECONDS = 240;
/**
 * How many attendees the world holds at once. Traffic grows with the square of
 * this, because every attendee is sent a state that lists every attendee: at
 * twenty the service pushes about 0.9 MB/s at a full house, which the free
 * instance carries comfortably. Past that the room stops being pleasant before
 * it stops working. Raise it with FESTIVAL_MAX_VISITORS on a larger instance.
 */
const MAX_VISITORS = Math.max(1, Number(process.env.FESTIVAL_MAX_VISITORS ?? 20));
/**
 * Everyone turned away, oldest first. A ticket holds a place while its owner
 * keeps asking for it; stop asking and the place is given up.
 */
const waiting = new Map();
const WAITING_TICKET_GRACE_MS = 20_000;

const pruneWaiting = () => {
  const now = Date.now();
  for (const [ticket, entry] of waiting) {
    if (now - entry.lastSeen > WAITING_TICKET_GRACE_MS) waiting.delete(ticket);
  }
};

/** Where a ticket stands, counting from one. */
const waitingPosition = (ticket) => {
  let position = 0;
  for (const key of waiting.keys()) {
    position += 1;
    if (key === ticket) return position;
  }
  return 0;
};
const isProduction = process.env.NODE_ENV === 'production';
// Hosts hand a container its port in PORT and expect the process to bind every
// interface. Reading only FESTIVAL_PORT and binding loopback is right for a
// laptop and unreachable anywhere else, so both are accepted and production
// binds outward by default.
const HOST = process.env.FESTIVAL_HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1');
const PORT = Number(process.env.FESTIVAL_PORT ?? process.env.PORT ?? 8787);
const ADMIN_KEY = process.env.FESTIVAL_ADMIN_KEY ?? (isProduction ? '' : 'myschedule-local-admin');
const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url));
// STAFF settings outlive a service restart. Set FESTIVAL_STATE_FILE=off for a
// throwaway instance that always boots from the built-in festival defaults.
const configuredStateFile = (process.env.FESTIVAL_STATE_FILE ?? '').trim();
const persistenceEnabled = configuredStateFile !== 'off';
const STATE_FILE = configuredStateFile && persistenceEnabled
  ? resolve(configuredStateFile)
  : fileURLToPath(new URL('./festival-state.json', import.meta.url));
// The programme as committed, used when the instance has nothing of its own —
// which on a disk-less plan is every single deploy. It never holds the STAFF
// key or anyone's chat. FESTIVAL_SEED_FILE=off ignores it and boots the bare
// built-in festival, which is what the tests want: they assert on the code's
// own defaults and must not inherit whatever STAFF have curated in production.
const configuredSeedFile = (process.env.FESTIVAL_SEED_FILE ?? '').trim();
const seedEnabled = configuredSeedFile !== 'off';
const SEED_FILE = configuredSeedFile && seedEnabled
  ? resolve(configuredSeedFile)
  : fileURLToPath(new URL('./festival-seed.json', import.meta.url));
const configuredOrigins = (process.env.FESTIVAL_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (isProduction && !ADMIN_KEY) {
  throw new Error('FESTIVAL_ADMIN_KEY is required when NODE_ENV=production.');
}

const visitors = new Map();
const seats = new Map();
const messages = [];
// Chat restored from a previous run has no live author to measure proximity
// against, so it is shown to everyone rather than silently disappearing.
const restoredMessageIds = new Set();
const streams = new Map();
const DISCONNECTED_SESSION_GRACE_MS = 120_000;
const youtubeIdFromUrl = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] ?? '';
    return parsed.searchParams.get('v') ?? '';
  } catch {
    return '';
  }
};

const programmeCategoryForVenue = {
  palace: 'COMMERCIAL',
  'drive-in': 'TELEVISION',
  shore: 'MUSIC VIDEO',
  club: 'ORIGINALS',
  rooftop: 'ORIGINALS',
};
const defaultVenueNames = {
  palace: 'THE PALACE',
  'drive-in': 'DRIVE-IN 88',
  shore: 'THE SHORE',
  club: 'THE BASEMENT',
  rooftop: 'THE ROOFTOP',
};
// The second line on each venue's sign. STAFF own these the same way they own
// the names above; the values here are only what a fresh service starts with.
const defaultVenueSubtitles = {
  palace: 'COMMERCIAL',
  'drive-in': 'TELEVISION',
  shore: 'MUSIC VIDEO',
  club: 'XIEH GAN',
  rooftop: 'DR.BEAUTY',
};
const VENUES = Object.keys(programmeCategoryForVenue);
const isVenue = (value) => VENUES.includes(value);
// The club spins the DR.BEAUTY originals, which live outside the portfolio
// categories in the legacy data.
const legacyFilmsForCategory = (category) => (category === 'ORIGINALS'
  ? legacySource.drBeautyVideos ?? []
  : legacySource.profilo.find((entry) => entry.name === category)?.profilo ?? []);
const programmeIdsByVenue = Object.fromEntries(
  Object.entries(programmeCategoryForVenue).map(([venue, category]) => [
    venue,
    legacyFilmsForCategory(category).map((film) => youtubeIdFromUrl(film.url)).filter(Boolean),
  ]),
);
const customVideosByVenue = {
  palace: [],
  'drive-in': [],
  shore: [],
  club: [],
  rooftop: [],
};
const DEFAULT_TRACK_TEMPO = 120;
// The club's lights cannot listen to a cross-origin player, so each track
// carries a tempo and every attendee strobes off the shared programme clock.
const trackTempos = {};
const programmeSchedule = Object.fromEntries(
  Object.keys(programmeCategoryForVenue).map((venue) => {
    const order = [...programmeIdsByVenue[venue]];
    return [venue, {
      name: defaultVenueNames[venue],
      subtitle: defaultVenueSubtitles[venue],
      order,
      currentIndex: 0,
      youtubeId: order[0],
      mode: 'continuous',
      special: null,
      activeSpecialYoutubeId: null,
      // Every client computes its playback position from this, so the service
      // is the single clock for a public screening.
      startedAt: Date.now(),
      pausedAt: null,
      updatedAt: 0,
    }];
  }),
);
const siteStyle = {
  brandFontSize: 21,
  brandScaleY: 1,
  brandScaleX: 1,
  brandOffsetX: 0,
  brandOffsetY: 0,
  updatedAt: 0,
};
const gateBackground = {
  youtubeId: 'Ffli-o0ocT0',
  updatedAt: 0,
};
let mentorCarrierId = null;
const CLUB_REQUEST_COOLDOWN_MS = 30_000;
const CLUB_QUEUE_LIMIT = 12;
// Requested tracks waiting their turn. Live session state, so it is not saved:
// the attendees who asked are gone after a restart anyway.
const venueQueues = { club: [], rooftop: [] };
const isDjVenue = (value) => Object.prototype.hasOwnProperty.call(venueQueues, value);
// The most recent request, so every client can credit whoever asked.
let clubRequest = null;
const defaultNpcNames = {
  MENTOR: 'MENTOR',
  KENNY: 'KENNY',
  NUNO: 'NUNO',
  MICHAEL: 'MICHAEL',
  SEBINE: 'SEBINE',
  ZC: 'ZC',
  LOUI: 'LOUI',
  MINYUN: 'MINYUN',
  VIOLA: 'VIOLA',
  XIEHGAN: 'XIEH GAN',
  DRBEAUTY: 'DR.BEAUTY',
};
const npcNames = { ...defaultNpcNames };
const npcTitles = {
  MENTOR: 'Video Editor',
  KENNY: 'Director',
  NUNO: 'Sound Engineer',
  MICHAEL: 'Director',
  SEBINE: 'Director',
  ZC: 'Director',
  LOUI: 'Director',
  MINYUN: 'Director Manager',
  VIOLA: 'Project Manager',
  XIEHGAN: 'Resident DJ',
  DRBEAUTY: 'Rooftop DJ',
};
const publicNpcProfiles = () => Object.keys(npcNames).map((id) => ({ id, name: npcNames[id], title: npcTitles[id] }));
// The pop-up store's destination. Empty until STAFF set one, and only ever an
// http(s) address: this string ends up in a link the visitor's browser follows,
// so a javascript: or data: URL here would be script execution on every
// visitor who walks up to the counter.
// The words on the gate, in both languages. STAFF own these; the build carries
// its own copy so the gate still reads before this is ever fetched.
const gateCopy = {
  kicker: 'BETA',
  kickerZh: 'BETA',
  title: 'MY THEATRE',
  titleZh: '我的戲院',
  intro: 'Follow the programme, take a seat, watch the work.',
  introZh: '跟著節目表、入座，觀看作品。',
  nameLabel: 'ATTENDEE NAME',
  nameLabelZh: '觀影者名稱',
  updatedAt: 0,
};

const shopLink = { url: '', label: 'THE POP-UP STORE', labelZh: '快閃服飾店', updatedAt: 0 };
// The two lines carved over the temple door: who is worshipped there, and what
// the building is called. STAFF own both, the way they own the venue signs.
const templeSign = { name: '美麗本人', label: 'THE TEMPLE', updatedAt: 0 };
const safeExternalUrl = (value) => {
  const text = safeText(value, 500);
  if (!text) return '';
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const djProfiles = {
  XIEHGAN: {
    id: 'XIEHGAN',
    name: 'XIEH GAN',
    role: 'Resident DJ · The Basement',
    roleZh: '駐場 DJ · 皇宮地下室',
    // Left for STAFF to write. Inventing a biography for a real person is not
    // this file's job, so the placeholder says plainly that it is one.
    introduction: 'Resident DJ at The Basement. STAFF have not written this introduction yet — open the booth with a STAFF pass to fill it in.',
    introductionZh: '皇宮地下室的駐場 DJ。這段介紹尚未由 STAFF 撰寫，請以 STAFF 通行證開啟後編輯。',
    updatedAt: 0,
  },
  DRBEAUTY: {
    id: 'DRBEAUTY',
    name: 'DR.BEAUTY',
    role: 'Rooftop DJ · Artist, rapper, music producer, host, YouTuber',
    roleZh: '頂樓 DJ · 藝人、饒舌歌手、音樂製作人、主持人、YouTuber',
    // Taken from the DR.BEAUTY page on myscheduleltd.com rather than written
    // here, so the world and the site say the same thing.
    introduction: 'Li Baobi — artist, rapper, music producer, host, influencer, YouTuber and party mascot. Opened the 美麗本人 YouTube channel in 2019, known for reaction videos to Mandarin music videos shot with animation and effects, and for putting "R爆" and the 醬擠 gesture into everyday use among younger audiences.',
    introductionZh: '李包比，藝人、饒舌歌手、音樂製作人、主持人、網美、YouTuber、派對吉祥物。2019 年開立『美麗本人』YouTube 頻道，以浮誇且具幽默感的表演方式對華語歌曲 MV 做 Reaction 影片，加入動畫及特效，並以一句「R爆」跟經典手勢「醬擠」在年輕族群間瘋傳。',
    updatedAt: 0,
  },
};
const pamphletContent = {
  youtubeId: 'Ffli-o0ocT0',
  eyebrow: 'MY SCHEDULE LTD.',
  title: 'MY SCHEDULE',
  titleZh: '我的檔期',
  introduction: 'This is MY SCHEDULE LTD. We are a creative video production company based in Taipei, Taiwan. Operating globally, we are dedicated to producing top-quality visuals. Our creative team specializes in a variety of video productions, including movies, music videos, television shows, commercials, and occasionally unconventional YouTube content.',
  introductionZh: '這是我的檔期有限公司。我們是位於台灣台北的創意影像製作公司，服務遍及全球，致力製作高品質影像。團隊擅長電影、音樂錄影帶、電視節目、廣告，以及不定期的非典型 YouTube 內容。',
  updatedAt: 0,
};
let broadcastTimer;

const validSeats = new Set([
  ...Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, column) => `PALACE-${row + 1}-${column + 1}`)).flat(),
  ...Array.from({ length: 2 }, (_, row) => Array.from({ length: 3 }, (_, column) => `DRIVE-${row + 1}-${column + 1}`)).flat(),
  ...Array.from({ length: 3 }, (_, row) => Array.from({ length: 7 }, (_, column) => `SHORE-${row + 1}-${column + 1}`)).flat(),
  // Bar stools in the club.
  ...Array.from({ length: 6 }, (_, column) => `CLUB-1-${column + 1}`),
  // Benches on the rooftop deck. These were built into the world without ever
  // being registered here, so every attempt to sit on one was turned away as an
  // unknown seat.
  ...Array.from({ length: 3 }, (_, index) => `ROOFTOP-BENCH-${index + 1}`),
]);

const json = (response, status, payload) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
};

const allowedOrigin = (request) => {
  const origin = request.headers.origin;
  if (!origin) return undefined;
  const forwardedProtocol = String(request.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim();
  const sameOrigin = `${forwardedProtocol}://${request.headers.host ?? ''}`;
  let localDevelopmentOrigin = false;
  if (!isProduction) {
    try {
      const parsedOrigin = new URL(origin);
      localDevelopmentOrigin = ['127.0.0.1', 'localhost'].includes(parsedOrigin.hostname) &&
        ['http:', 'https:'].includes(parsedOrigin.protocol);
    } catch {
      localDevelopmentOrigin = false;
    }
  }
  return configuredOrigins.includes(origin) || origin === sameOrigin || localDevelopmentOrigin ? origin : null;
};

const cors = (request, response) => {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('cross-origin-opener-policy', 'same-origin-allow-popups');
  const origin = allowedOrigin(request);
  if (origin === null) return false;
  if (origin) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'Origin');
  }
  response.setHeader('access-control-allow-headers', 'content-type, authorization, x-festival-session, x-festival-admin-key');
  response.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  return true;
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const serveStatic = async (url, response) => {
  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = resolve(DIST_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(resolve(DIST_DIR))) return false;
  try {
    const file = await readFile(filePath);
    const extension = extname(filePath);
    response.writeHead(200, {
      'content-type': contentTypes[extension] ?? 'application/octet-stream',
      'content-length': file.byteLength,
      'cache-control': requestedPath.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    response.end(file);
    return true;
  } catch {
    return false;
  }
};

const body = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const safeText = (value, max) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, max);
const safePalette = (value = {}) => {
  const color = (slot, fallback) => /^#[0-9a-f]{6}$/i.test(value[slot] ?? '') ? value[slot] : fallback;
  return {
    skin: color('skin', '#9d5f43'),
    hair: color('hair', '#171315'),
    top: color('top', '#9f1720'),
    bottoms: color('bottoms', '#20242c'),
    swimwear: color('swimwear', '#d5b23f'),
  };
};

const persistedSnapshot = () => ({
  version: 1,
  savedAt: Date.now(),
  schedule: programmeSchedule,
  siteStyle,
  gateBackground,
  customVideos: customVideosByVenue,
  npcNames,
  npcTitles,
  pamphlet: pamphletContent,
  djProfiles,
  shopLink,
  templeSign,
  gateCopy,
  trackTempos,
  trackDurations,
  adminKeyDigest,
  messages,
});

let persistTimer;
let persistQueue = Promise.resolve();
let unsavedSettings = false;

const writeStateFile = (payload) => {
  const temporaryFile = `${STATE_FILE}.${process.pid}.tmp`;
  return writeFile(temporaryFile, payload, 'utf8').then(() => rename(temporaryFile, STATE_FILE));
};

// Settings changes are debounced and written through a temporary file so an
// interrupted save can never leave a half-written festival state behind.
const persist = () => {
  if (!persistenceEnabled) return;
  unsavedSettings = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    const payload = JSON.stringify(persistedSnapshot(), null, 2);
    unsavedSettings = false;
    persistQueue = persistQueue
      .then(() => writeStateFile(payload))
      .catch((error) => {
        unsavedSettings = true;
        console.error('Festival settings could not be saved:', error.message);
      });
  }, 200);
};

// Only a shutdown that would otherwise lose a STAFF edit writes the file, so a
// service that changed nothing never recreates a settings file an operator
// deliberately removed.
const persistNow = () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  if (!persistenceEnabled || !unsavedSettings) return;
  unsavedSettings = false;
  try {
    const temporaryFile = `${STATE_FILE}.${process.pid}.tmp`;
    writeFileSync(temporaryFile, JSON.stringify(persistedSnapshot(), null, 2), 'utf8');
    renameSync(temporaryFile, STATE_FILE);
  } catch (error) {
    console.error('Festival settings could not be saved:', error.message);
  }
};

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const validYoutubeId = (value) => /^[A-Za-z0-9_-]{6,20}$/.test(String(value ?? ''));

const restoreCustomVideos = (saved) => {
  for (const venue of Object.keys(customVideosByVenue)) {
    const entries = Array.isArray(saved?.[venue]) ? saved[venue] : [];
    const restored = [];
    for (const entry of entries) {
      const youtubeId = String(entry?.youtubeId ?? '').trim();
      const title = safeText(entry?.title, 100);
      if (!validYoutubeId(youtubeId) || !title) continue;
      if (programmeIdsByVenue[venue].includes(youtubeId)) continue;
      if (restored.some((video) => video.youtubeId === youtubeId)) continue;
      const year = Number(entry?.year);
      restored.push({
        id: `custom-${venue}-${youtubeId}`,
        title,
        titleZh: safeText(entry?.titleZh, 100) || undefined,
        creator: safeText(entry?.creator, 80) || undefined,
        year: Number.isInteger(year) && year >= 1888 && year <= 2200 ? year : undefined,
        category: programmeCategoryForVenue[venue],
        venue,
        youtubeId,
        embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
        sourceUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      });
    }
    customVideosByVenue[venue] = restored;
  }
};

const restoreSchedule = (saved) => {
  for (const venue of Object.keys(programmeSchedule)) {
    const entry = saved?.[venue];
    if (!entry) continue;
    const allowedIds = new Set([
      ...programmeIdsByVenue[venue],
      ...customVideosByVenue[venue].map((video) => video.youtubeId),
    ]);
    const order = (Array.isArray(entry.order) ? entry.order : [])
      .map((value) => String(value).trim())
      .filter((value, index, list) => allowedIds.has(value) && list.indexOf(value) === index);
    if (!order.length) continue;
    const currentIndex = clampNumber(entry.currentIndex, 0, order.length - 1, 0);
    const special = validYoutubeId(entry.special?.youtubeId)
      ? { youtubeId: entry.special.youtubeId, startsAt: clampNumber(entry.special.startsAt, 0, Number.MAX_SAFE_INTEGER, Date.now()) }
      : null;
    programmeSchedule[venue] = {
      name: safeText(entry.name, 32) || defaultVenueNames[venue],
      subtitle: safeText(entry.subtitle, 32) || defaultVenueSubtitles[venue],
      order,
      currentIndex: Math.round(currentIndex),
      youtubeId: order[Math.round(currentIndex)],
      mode: ['continuous', 'paused', 'recurring', 'scheduled-loop'].includes(entry.mode) ? entry.mode : 'continuous',
      special,
      // Whichever special was mid-roll belongs to the previous process.
      activeSpecialYoutubeId: null,
      startedAt: Date.now(),
      pausedAt: entry.mode === 'paused' ? Date.now() : null,
      updatedAt: clampNumber(entry.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    };
  }
};

const restoreMessages = (saved) => {
  if (!Array.isArray(saved)) return;
  for (const entry of saved.slice(-500)) {
    const id = safeText(entry?.id, 64);
    const author = safeText(entry?.author, 16);
    const text = safeText(entry?.text, 160);
    const timestamp = Number(entry?.timestamp);
    if (!id || !author || !text || !Number.isFinite(timestamp)) continue;
    if (!['NEARBY', 'VENUE', 'FESTIVAL'].includes(entry.channel)) continue;
    messages.push({
      id,
      authorId: safeText(entry?.authorId, 64),
      author,
      channel: entry.channel,
      text,
      timestamp,
    });
    restoredMessageIds.add(id);
  }
};

const restoreNpcs = (savedNames, savedTitles) => {
  for (const [id, name] of Object.entries(savedNames ?? {})) {
    if (!/^[A-Z0-9_]{1,24}$/.test(id)) continue;
    // Only the current roster and NPCs STAFF added are restored. A default
    // that has since been renamed would otherwise return as a stray.
    if (!(id in npcNames) && !/^NPC_\d+$/.test(id)) continue;
    if (Object.keys(npcNames).length >= 24 && !(id in npcNames)) continue;
    const safeName = safeText(name, 16);
    if (!safeName) continue;
    npcNames[id] = safeName;
    npcTitles[id] = safeText(savedTitles?.[id], 40) || npcTitles[id] || 'Director';
  }
};

const restorePersistedState = () => {
  if (!persistenceEnabled) return;
  let saved;
  try {
    saved = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    // Nothing written by this instance. Fall back to the programme committed to
    // the repository, because the free plan gives the service no disk that
    // survives a deploy: without this, every deploy would throw away the running
    // order, the venue names and the works STAFF added, and hand attendees the
    // bare defaults. Capture the live settings into it with
    // `node world/scripts/capture-state.mjs` before deploying.
    if (!seedEnabled) return;
    try {
      saved = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
    } catch {
      // No seed either, so the festival boots from the built-in defaults.
      return;
    }
  }
  if (!saved || typeof saved !== 'object') return;

  if (saved.siteStyle) {
    siteStyle.brandFontSize = clampNumber(saved.siteStyle.brandFontSize, 12, 42, siteStyle.brandFontSize);
    siteStyle.brandScaleY = clampNumber(saved.siteStyle.brandScaleY, 0.5, 2, siteStyle.brandScaleY);
    siteStyle.brandScaleX = clampNumber(saved.siteStyle.brandScaleX, 0.5, 2, siteStyle.brandScaleX);
    siteStyle.brandOffsetX = clampNumber(saved.siteStyle.brandOffsetX, -120, 240, siteStyle.brandOffsetX);
    siteStyle.brandOffsetY = clampNumber(saved.siteStyle.brandOffsetY, -80, 80, siteStyle.brandOffsetY);
    siteStyle.updatedAt = clampNumber(saved.siteStyle.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  }

  if (validYoutubeId(saved.gateBackground?.youtubeId)) {
    gateBackground.youtubeId = saved.gateBackground.youtubeId;
    gateBackground.updatedAt = clampNumber(saved.gateBackground.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  }

  if (saved.gateCopy && typeof saved.gateCopy === 'object') {
    for (const field of ['kicker', 'kickerZh', 'title', 'titleZh', 'intro', 'introZh', 'nameLabel', 'nameLabelZh']) {
      const value = safeText(saved.gateCopy[field], field.startsWith('intro') ? 300 : 80);
      if (value) gateCopy[field] = value;
    }
    gateCopy.updatedAt = clampNumber(saved.gateCopy.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  }
  if (saved.templeSign && typeof saved.templeSign === 'object') {
    Object.assign(templeSign, {
      name: safeText(saved.templeSign.name, 24) || templeSign.name,
      label: safeText(saved.templeSign.label, 24) || templeSign.label,
      updatedAt: clampNumber(saved.templeSign.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    });
  }

  if (saved.shopLink && typeof saved.shopLink === 'object') {
    Object.assign(shopLink, {
      url: safeExternalUrl(saved.shopLink.url),
      label: safeText(saved.shopLink.label, 60) || shopLink.label,
      labelZh: safeText(saved.shopLink.labelZh, 60) || shopLink.labelZh,
      updatedAt: clampNumber(saved.shopLink.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    });
  }
  if (saved.trackDurations && typeof saved.trackDurations === 'object') {
    for (const [id, value] of Object.entries(saved.trackDurations)) {
      const seconds = clampNumber(value, 1, 86_400, 0);
      if (/^[A-Za-z0-9_-]{6,20}$/.test(id) && seconds) trackDurations[id] = Math.round(seconds);
    }
  }
  const savedDjProfiles = saved.djProfiles;
  if (savedDjProfiles && typeof savedDjProfiles === 'object') {
    for (const id of Object.keys(djProfiles)) {
      const entry = savedDjProfiles[id];
      if (!entry || typeof entry !== 'object') continue;
      Object.assign(djProfiles[id], {
        role: safeText(entry.role, 120) || djProfiles[id].role,
        roleZh: safeText(entry.roleZh, 120) || djProfiles[id].roleZh,
        introduction: safeText(entry.introduction, 1200) || djProfiles[id].introduction,
        introductionZh: safeText(entry.introductionZh, 1200) || djProfiles[id].introductionZh,
        updatedAt: clampNumber(entry.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
      });
    }
  }
  const pamphlet = saved.pamphlet;
  if (pamphlet && validYoutubeId(pamphlet.youtubeId)) {
    const restored = {
      youtubeId: pamphlet.youtubeId,
      eyebrow: safeText(pamphlet.eyebrow, 60),
      title: safeText(pamphlet.title, 80),
      titleZh: safeText(pamphlet.titleZh, 80),
      introduction: safeText(pamphlet.introduction, 1200),
      introductionZh: safeText(pamphlet.introductionZh, 1200),
      updatedAt: clampNumber(pamphlet.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    };
    if (restored.eyebrow && restored.title && restored.titleZh && restored.introduction && restored.introductionZh) {
      Object.assign(pamphletContent, restored);
    }
  }

  for (const [youtubeId, bpm] of Object.entries(saved.trackTempos ?? {})) {
    const tempo = Number(bpm);
    if (!validYoutubeId(youtubeId) || !Number.isFinite(tempo) || tempo < 40 || tempo > 220) continue;
    trackTempos[youtubeId] = Math.round(tempo);
  }
  if (saved.adminKeyDigest
    && typeof saved.adminKeyDigest.salt === 'string'
    && typeof saved.adminKeyDigest.hash === 'string'
    && /^[0-9a-f]{32}$/.test(saved.adminKeyDigest.salt)
    && /^[0-9a-f]{128}$/.test(saved.adminKeyDigest.hash)) {
    adminKeyDigest = { salt: saved.adminKeyDigest.salt, hash: saved.adminKeyDigest.hash };
  }
  restoreMessages(saved.messages);
  restoreNpcs(saved.npcNames, saved.npcTitles);
  restoreCustomVideos(saved.customVideos);
  restoreSchedule(saved.schedule);
};

const tokenMatches = (candidate, expected) => {
  if (!candidate || !expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const bearer = (request) => request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
const sessionFor = (request) => {
  const id = request.headers['x-festival-session'];
  const visitor = typeof id === 'string' ? visitors.get(id) : undefined;
  return visitor && tokenMatches(bearer(request), visitor.token) ? visitor : undefined;
};

// { salt, hash } once STAFF have set their own key; null while the environment
// key is still in force.
let adminKeyDigest = null;

const hashAdminKey = (key, salt) => scryptSync(key, salt, 64).toString('hex');

const adminKeyMatches = (candidate) => {
  if (!candidate) return false;
  if (!adminKeyDigest) return tokenMatches(candidate, ADMIN_KEY);
  return tokenMatches(hashAdminKey(candidate, adminKeyDigest.salt), adminKeyDigest.hash);
};

const adminAllowed = (request) => adminKeyMatches(String(request.headers['x-festival-admin-key'] ?? ''));

const createVisitor = (name, palette) => ({
  id: randomUUID(),
  token: randomBytes(24).toString('base64url'),
  name,
  originalName: name,
  palette: safePalette(palette),
  presence: { x: 0, y: 0.28, z: 22, rotation: 0, location: 'FESTIVAL GATE', state: 'walking', moving: false, running: false, venue: 'shore' },
  joinedAt: Date.now(),
  lastSeen: Date.now(),
  mutedUntil: 0,
  chatTimes: [],
});

const publicVisitor = (visitor) => ({
  id: visitor.id,
  name: visitor.name,
  originalName: visitor.originalName,
  palette: visitor.palette,
  presence: visitor.presence,
  hitAt: visitor.hitAt ?? 0,
  hitBy: visitor.hitBy,
  impersonationOrigin: visitor.impersonationOrigin,
  seatedAt: visitor.seatedAt,
  mutedUntil: visitor.mutedUntil,
  joinedAt: visitor.joinedAt,
  npcId: visitor.npcId,
});

const canSeeMessage = (viewer, message) => {
  if (message.authorId === viewer.id || message.channel === 'FESTIVAL') return true;
  if (restoredMessageIds.has(message.id)) return true;
  const author = visitors.get(message.authorId);
  if (!author) return message.channel !== 'NEARBY';
  if (message.channel === 'VENUE') return author.presence.venue === viewer.presence.venue;
  const dx = author.presence.x - viewer.presence.x;
  const dz = author.presence.z - viewer.presence.z;
  return Math.hypot(dx, dz) <= 14;
};

const stateFor = (visitor) => ({
  serverTime: Date.now(),
  selfId: visitor.id,
  visitors: [...visitors.values()].map(publicVisitor),
  seats: [...seats.entries()].map(([seatId, visitorId]) => ({ seatId, visitorId })),
  messages: messages.filter((message) => canSeeMessage(visitor, message)).slice(-100),
  schedule: programmeSchedule,
  siteStyle,
  gateBackground,
  mentorCarrierId,
  clubRequest,
  venueQueues,
  customVideos: customVideosByVenue,
  npcNames,
  npcProfiles: publicNpcProfiles(),
  pamphlet: pamphletContent,
  djProfiles,
  shopLink,
  templeSign,
  gateCopy,
  trackTempos,
});

const writeEvent = (response, event, data) => {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

const broadcast = () => {
  broadcastTimer = undefined;
  settleAllSchedules();
  for (const [sessionId, responseSet] of streams) {
    const visitor = visitors.get(sessionId);
    if (!visitor) continue;
    const state = stateFor(visitor);
    for (const response of responseSet) writeEvent(response, 'state', state);
  }
};

/**
 * Walks a venue's programme forward to wherever its own clock says it should
 * be. Until now the running order only moved when a player reported a work had
 * ended, so a venue nobody was standing in never advanced: its start time
 * stayed put while the elapsed time grew, and an attendee walking back in was
 * handed an offset past the end of the work — or past the six-hour sanity
 * limit, which sent it back to the beginning. That is the restart.
 */
const durationOf = (youtubeId) => trackDurations[youtubeId] ?? NOMINAL_TRACK_SECONDS;

const settleSchedule = (venue) => {
  const schedule = programmeSchedule[venue];
  if (!schedule?.order?.length) return false;
  if (schedule.mode === 'paused' || schedule.pausedAt) return false;
  let moved = false;
  // A programme left alone overnight can be many works behind; the bound stops
  // a corrupt start time from spinning here.
  let guard = schedule.order.length * 4 + 4;
  while (guard > 0) {
    guard -= 1;
    const playing = schedule.activeSpecialYoutubeId ?? schedule.order[schedule.currentIndex];
    const runs = durationOf(playing) * 1000;
    if (Date.now() - schedule.startedAt < runs) break;
    schedule.startedAt += runs;
    if (schedule.activeSpecialYoutubeId) {
      schedule.activeSpecialYoutubeId = null;
      schedule.currentIndex = (schedule.currentIndex + 1) % schedule.order.length;
    } else if (schedule.special && schedule.special.startsAt <= Date.now()) {
      schedule.activeSpecialYoutubeId = schedule.special.youtubeId;
      schedule.special = null;
    } else {
      schedule.currentIndex = (schedule.currentIndex + 1) % schedule.order.length;
    }
    schedule.youtubeId = schedule.activeSpecialYoutubeId ?? schedule.order[schedule.currentIndex];
    schedule.updatedAt = Date.now();
    moved = true;
  }
  return moved;
};

const settleAllSchedules = () => VENUES.map(settleSchedule).some(Boolean);

const scheduleBroadcast = () => {
  if (!broadcastTimer) broadcastTimer = setTimeout(broadcast, 50);
};

const releaseSeat = (visitor) => {
  if (!visitor.seatedAt) return;
  if (seats.get(visitor.seatedAt) === visitor.id) seats.delete(visitor.seatedAt);
  visitor.seatedAt = undefined;
};

const removeVisitor = (visitor, reason = 'left') => {
  pruneWaiting();
  releaseSeat(visitor);
  if (mentorCarrierId === visitor.id) mentorCarrierId = null;
  for (const queue of Object.values(venueQueues)) {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index].requestedBy === visitor.name) queue.splice(index, 1);
    }
  }
  visitors.delete(visitor.id);
  const responseSet = streams.get(visitor.id);
  if (responseSet) {
    for (const response of responseSet) {
      writeEvent(response, reason === 'kicked' ? 'kicked' : 'closed', { reason });
      response.end();
    }
  }
  streams.delete(visitor.id);
  scheduleBroadcast();
};

const apiError = (response, status, message) => json(response, status, { error: message });

const server = createServer(async (request, response) => {
  if (!cors(request, response)) return apiError(response, 403, 'Origin is not allowed.');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    return response.end();
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { ok: true, visitors: visitors.size, uptime: Math.floor(process.uptime()) });
    }

    if (request.method === 'GET' && url.pathname === '/api/config') {
      settleAllSchedules();
      return json(response, 200, { schedule: programmeSchedule, siteStyle, gateBackground, customVideos: customVideosByVenue, npcNames, npcProfiles: publicNpcProfiles(), pamphlet: pamphletContent, djProfiles, shopLink, templeSign, gateCopy, trackTempos, clubRequest, venueQueues });
    }

    if (request.method === 'POST' && url.pathname === '/api/session') {
      const payload = await body(request);
      const name = safeText(payload.name, 16);
      if (!name) return apiError(response, 400, 'A festival name is required.');
      const duplicate = [...visitors.values()].some((visitor) => visitor.name.toLocaleUpperCase('en-US') === name.toLocaleUpperCase('en-US'));
      if (duplicate) return apiError(response, 409, 'That festival name is already connected.');

      pruneWaiting();
      // STAFF are not queued: an admin locked out of a busy room cannot fix
      // whatever made it busy.
      const isStaff = adminAllowed(request);
      const ticket = safeText(payload.waitTicket, 64);
      if (!isStaff) {
        const known = ticket && waiting.get(ticket);
        if (known) known.lastSeen = Date.now();
        const queueAhead = known ? waitingPosition(ticket) - 1 : waiting.size;
        // A place only opens for the head of the queue, or the room would be
        // taken by whoever happened to ask at the right moment.
        const admitted = visitors.size + queueAhead < MAX_VISITORS;
        if (!admitted) {
          const issued = known ? ticket : randomUUID();
          if (!known) waiting.set(issued, { lastSeen: Date.now() });
          return json(response, 202, {
            waiting: {
              ticket: issued,
              position: waitingPosition(issued),
              ahead: Math.max(0, waitingPosition(issued) - 1),
              capacity: MAX_VISITORS,
              inside: visitors.size,
            },
          });
        }
        if (known) waiting.delete(ticket);
      }
      const visitor = createVisitor(name, payload.palette);
      visitors.set(visitor.id, visitor);
      scheduleBroadcast();
      return json(response, 201, { session: { id: visitor.id, token: visitor.token }, state: stateFor(visitor) });
    }

    if (request.method === 'POST' && url.pathname === '/api/session/recover') {
      const payload = await body(request);
      const name = safeText(payload.name, 16);
      const previousId = safeText(payload.session?.id, 64);
      const previousToken = safeText(payload.session?.token, 128);
      if (!name || !previousId || !previousToken) return apiError(response, 400, 'Session recovery details are required.');

      const existing = visitors.get(previousId);
      if (existing) {
        if (!tokenMatches(previousToken, existing.token)) return apiError(response, 401, 'Invalid festival session.');
        existing.palette = safePalette(payload.palette ?? existing.palette);
        existing.lastSeen = Date.now();
        return json(response, 200, {
          session: { id: existing.id, token: existing.token },
          state: stateFor(existing),
        });
      }

      const duplicate = [...visitors.values()].some((visitor) => visitor.name.toLocaleUpperCase('en-US') === name.toLocaleUpperCase('en-US'));
      if (duplicate) return apiError(response, 409, 'That festival name is already connected.');
      const recovered = createVisitor(name, payload.palette);
      visitors.set(recovered.id, recovered);
      scheduleBroadcast();
      return json(response, 201, {
        session: { id: recovered.id, token: recovered.token },
        state: stateFor(recovered),
      });
    }

    const visitor = sessionFor(request);

    if (request.method === 'GET' && url.pathname === '/api/events') {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      response.write(': connected\n\n');
      const responseSet = streams.get(visitor.id) ?? new Set();
      responseSet.add(response);
      streams.set(visitor.id, responseSet);
      visitor.lastSeen = Date.now();
      writeEvent(response, 'state', stateFor(visitor));
      request.on('close', () => {
        responseSet.delete(response);
        if (!responseSet.size) streams.delete(visitor.id);
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/presence') {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      const payload = await body(request);
      visitor.presence = {
        // These bounds have to cover every venue or attendees are dragged to
        // the edge of them and drawn somewhere they are not. The world runs
        // from the basement's west wall at -90 to the roof deck's east edge at
        // 54, and from the far water at -58 to the club's south wall at 42.
        x: Math.max(-95, Math.min(60, Number(payload.x) || 0)),
        // Height, without which the roof deck seven units up and the basement
        // sixteen down both drew their occupants standing in the street.
        y: Math.max(-24, Math.min(14, Number(payload.y) || 0)),
        z: Math.max(-85, Math.min(50, Number(payload.z) || 0)),
        rotation: Number(payload.rotation) || 0,
        location: safeText(payload.location, 40) || 'FESTIVAL GATE',
        state: ['walking', 'seated', 'swimming'].includes(payload.state) ? payload.state : 'walking',
        moving: payload.moving === true,
        running: payload.running === true,
        venue: isVenue(payload.venue) ? payload.venue : 'shore',
        gesture: ['wave', 'feed', 'tail-wag', 'dance', 'drink', 'jump', 'stumble', 'offer', 'bow', 'punch', 'hit'].includes(payload.gesture) ? payload.gesture : undefined,
        carriedItem: payload.carriedItem === 'MENTOR'
          ? (mentorCarrierId === visitor.id ? 'MENTOR' : undefined)
          : ['POPCORN', 'DRINK', 'HOTDOG', 'PIZZA', 'CHICKEN'].includes(payload.carriedItem)
            ? payload.carriedItem
            : undefined,
      };
      visitor.palette = safePalette(payload.palette ?? visitor.palette);
      visitor.lastSeen = Date.now();
      scheduleBroadcast();
      return json(response, 202, { ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/punch') {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      const now = Date.now();
      // Rate limited so a held mouse button cannot become a machine gun.
      if (visitor.punchedAt && now - visitor.punchedAt < 600) {
        return json(response, 200, { ok: true, hit: null });
      }
      visitor.punchedAt = now;
      const from = visitor.presence;
      // Facing is the rotation the attendee publishes; reach is a little over
      // an arm's length, and the blow only lands on what is in front of it.
      const facingX = Math.sin(from.rotation);
      const facingZ = Math.cos(from.rotation);
      let struck;
      let closest = 3.2;
      for (const other of visitors.values()) {
        if (other.id === visitor.id) continue;
        const dx = other.presence.x - from.x;
        const dz = other.presence.z - from.z;
        if (Math.abs((other.presence.y ?? 0) - (from.y ?? 0)) > 2.6) continue;
        const distance = Math.hypot(dx, dz);
        if (distance > closest || distance < 0.001) continue;
        if ((dx / distance) * facingX + (dz / distance) * facingZ < 0.55) continue;
        closest = distance;
        struck = other;
      }
      if (!struck) return json(response, 200, { ok: true, hit: null });
      struck.hitAt = now;
      struck.hitBy = visitor.name;
      // Whatever they were holding, they are not holding it now.
      let droppedMentor = false;
      if (mentorCarrierId === struck.id) {
        mentorCarrierId = null;
        droppedMentor = true;
      }
      if (struck.presence.carriedItem) {
        struck.presence = { ...struck.presence, carriedItem: undefined };
      }
      scheduleBroadcast();
      return json(response, 200, { ok: true, hit: { id: struck.id, name: struck.name, droppedMentor } });
    }

    // A request to the resident DJ. Unlike a private screening this changes
    // what the whole room hears, which is the point of asking a DJ.
    const requestMatch = url.pathname.match(/^\/api\/(club|rooftop)\/request$/);
    if (request.method === 'POST' && requestMatch) {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      const payload = await body(request);
      const djVenue = requestMatch[1];
      const clubQueue = venueQueues[djVenue];
      const youtubeId = String(payload.youtubeId ?? '').trim();
      const schedule = programmeSchedule[djVenue];
      // Anything in the venue's library, not only what the running order
      // happens to hold. STAFF curate the order down — the basement is six of
      // its eight records — while the booth still offers the whole box, so
      // every track they had cut was offered and then refused.
      const boxed = new Set([
        ...schedule.order,
        ...(programmeIdsByVenue[djVenue] ?? []),
        ...(customVideosByVenue[djVenue] ?? []).map((film) => film.youtubeId),
      ]);
      if (!boxed.has(youtubeId)) return apiError(response, 404, 'That track is not in the box.');
      const now = Date.now();
      if (visitor.trackRequestAt && now - visitor.trackRequestAt < CLUB_REQUEST_COOLDOWN_MS) {
        const seconds = Math.ceil((CLUB_REQUEST_COOLDOWN_MS - (now - visitor.trackRequestAt)) / 1000);
        return apiError(response, 429, `The DJ is still mixing. Try again in ${seconds}s.`);
      }
      if (schedule.youtubeId === youtubeId) return apiError(response, 409, 'That one is already playing.');
      if (clubQueue.length >= CLUB_QUEUE_LIMIT) return apiError(response, 409, 'The queue is full. Try again shortly.');
      if (clubQueue.some((entry) => entry.youtubeId === youtubeId)) {
        return apiError(response, 409, 'That one is already in the queue.');
      }
      visitor.trackRequestAt = now;
      clubQueue.push({ youtubeId, requestedBy: visitor.name, at: now });
      clubRequest = { venue: djVenue, youtubeId, requestedBy: visitor.name, at: now, position: clubQueue.length };
      visitor.lastSeen = now;
      scheduleBroadcast();
      return json(response, 200, {
        ok: true,
        position: clubQueue.length,
        clubQueue: venueQueues[djVenue],
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/mentor/pick-up') {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      if (visitor.npcId === 'MENTOR') return apiError(response, 409, 'MENTOR cannot pick up himself.');
      if (mentorCarrierId && mentorCarrierId !== visitor.id) {
        return apiError(response, 409, 'MENTOR is already being carried.');
      }
      mentorCarrierId = visitor.id;
      visitor.presence = { ...visitor.presence, carriedItem: 'MENTOR', gesture: undefined };
      for (const controlledVisitor of visitors.values()) {
        if (controlledVisitor.npcId !== 'MENTOR') continue;
        controlledVisitor.presence = {
          ...controlledVisitor.presence,
          state: 'walking',
          moving: false,
          gesture: undefined,
          carriedItem: undefined,
        };
      }
      visitor.lastSeen = Date.now();
      scheduleBroadcast();
      return json(response, 200, { ok: true, mentorCarrierId });
    }

    if (request.method === 'POST' && url.pathname === '/api/mentor/put-down') {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      if (mentorCarrierId !== visitor.id) return apiError(response, 409, 'You are not carrying MENTOR.');
      mentorCarrierId = null;
      visitor.presence = { ...visitor.presence, carriedItem: undefined };
      visitor.lastSeen = Date.now();
      scheduleBroadcast();
      return json(response, 200, { ok: true, mentorCarrierId });
    }

    const seatMatch = url.pathname.match(/^\/api\/seats\/([^/]+)\/(claim|release)$/);
    if (request.method === 'POST' && seatMatch) {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      const seatId = decodeURIComponent(seatMatch[1]).toUpperCase();
      if (!validSeats.has(seatId)) return apiError(response, 404, 'Unknown seat.');
      if (seatMatch[2] === 'claim') {
        const owner = seats.get(seatId);
        if (owner && owner !== visitor.id) return apiError(response, 409, 'That seat is occupied.');
        releaseSeat(visitor);
        seats.set(seatId, visitor.id);
        visitor.seatedAt = seatId;
      } else if (seats.get(seatId) === visitor.id) {
        releaseSeat(visitor);
      }
      visitor.lastSeen = Date.now();
      scheduleBroadcast();
      return json(response, 200, { ok: true, seatId });
    }

    if (request.method === 'POST' && url.pathname === '/api/chat') {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      const now = Date.now();
      if (visitor.mutedUntil > now) return apiError(response, 403, 'You are temporarily muted by festival staff.');
      visitor.chatTimes = visitor.chatTimes.filter((timestamp) => timestamp > now - 10_000);
      if (visitor.chatTimes.length >= 5) return apiError(response, 429, 'Please wait before sending another message.');
      const payload = await body(request);
      const text = safeText(payload.text, 160);
      const channel = ['NEARBY', 'VENUE', 'FESTIVAL'].includes(payload.channel) ? payload.channel : 'NEARBY';
      if (!text) return apiError(response, 400, 'Message is empty.');
      visitor.chatTimes.push(now);
      messages.push({ id: randomUUID(), authorId: visitor.id, author: visitor.name, channel, text, timestamp: now });
      if (messages.length > CHAT_HISTORY_LIMIT) messages.splice(0, messages.length - CHAT_HISTORY_LIMIT);
      scheduleBroadcast();
      persist();
      return json(response, 201, { ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/session/leave') {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      removeVisitor(visitor);
      return json(response, 200, { ok: true });
    }

    const durationMatch = url.pathname.match(/^\/api\/programme\/(palace|drive-in|shore|club|rooftop)\/duration$/);
    if (request.method === 'POST' && durationMatch) {
      const visitor = sessionFor(request);
      if (!visitor) return apiError(response, 401, 'Unknown session.');
      const durationPayload = await body(request);
      const youtubeId = String(durationPayload.youtubeId ?? '').trim();
      const seconds = clampNumber(durationPayload.seconds, 1, 86_400, 0);
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(youtubeId) || !seconds) {
        return apiError(response, 400, 'Invalid track duration.');
      }
      const known = trackDurations[youtubeId];
      if (!known || Math.abs(known - seconds) > 1) {
        trackDurations[youtubeId] = Math.round(seconds);
        persist();
      }
      return json(response, 200, { ok: true });
    }

    const advanceMatch = url.pathname.match(/^\/api\/programme\/(palace|drive-in|shore|club|rooftop)\/advance$/);
    if (request.method === 'POST' && advanceMatch) {
      if (!visitor) return apiError(response, 401, 'Invalid festival session.');
      const payload = await body(request);
      const venue = advanceMatch[1];
      const schedule = programmeSchedule[venue];
      const expectedYoutubeId = String(payload.youtubeId ?? '');
      const currentYoutubeId = schedule.activeSpecialYoutubeId ?? schedule.order[schedule.currentIndex];
      if (expectedYoutubeId !== currentYoutubeId || schedule.mode === 'paused') {
        return json(response, 200, { ok: true, advanced: false, schedule: programmeSchedule });
      }

      const queued = isDjVenue(venue) ? venueQueues[venue].shift() : undefined;
      if (queued) {
        // A requested track takes precedence over the standing order.
        schedule.activeSpecialYoutubeId = null;
        schedule.currentIndex = Math.max(0, schedule.order.indexOf(queued.youtubeId));
      } else if (schedule.activeSpecialYoutubeId) {
        schedule.activeSpecialYoutubeId = null;
        schedule.currentIndex = (schedule.currentIndex + 1) % schedule.order.length;
      } else if (schedule.special && schedule.special.startsAt <= Date.now()) {
        schedule.activeSpecialYoutubeId = schedule.special.youtubeId;
        schedule.special = null;
      } else {
        schedule.currentIndex = (schedule.currentIndex + 1) % schedule.order.length;
      }
      schedule.youtubeId = schedule.activeSpecialYoutubeId ?? schedule.order[schedule.currentIndex];
      schedule.startedAt = Date.now();
      schedule.pausedAt = null;
      schedule.updatedAt = Date.now();
      scheduleBroadcast();
      persist();
      return json(response, 200, { ok: true, advanced: true, schedule: programmeSchedule, venueQueues });
    }

    if (url.pathname.startsWith('/api/admin/')) {
      if (!adminAllowed(request)) return apiError(response, 401, 'Invalid staff key.');
      if (request.method === 'GET' && url.pathname === '/api/admin/state') {
        return json(response, 200, {
          visitors: [...visitors.values()].map(publicVisitor),
          seats: [...seats.entries()].map(([seatId, visitorId]) => ({ seatId, visitorId })),
          messages: messages.slice(-CHAT_HISTORY_LIMIT),
          schedule: programmeSchedule,
          siteStyle,
          gateBackground,
          mentorCarrierId,
          clubRequest,
          venueQueues,
          customVideos: customVideosByVenue,
          npcNames,
          npcProfiles: publicNpcProfiles(),
          pamphlet: pamphletContent,
          djProfiles,
          shopLink,
          templeSign,
          gateCopy,
          trackTempos,
        });
      }
      const payload = await body(request);
      if (request.method === 'POST' && url.pathname === '/api/admin/schedule') {
        const venue = String(payload.venue ?? '');
        if (!isVenue(venue)) return apiError(response, 400, 'Unknown venue.');
        const current = programmeSchedule[venue];
        const allowedIds = new Set([
          ...programmeIdsByVenue[venue],
          ...customVideosByVenue[venue].map((video) => video.youtubeId),
        ]);
        let order = Array.isArray(payload.order)
          ? payload.order.map((value) => String(value).trim()).filter((value, index, list) => list.indexOf(value) === index)
          : [...current.order];
        const legacyStart = String(payload.youtubeId ?? '').trim();
        if (legacyStart && allowedIds.has(legacyStart)) order = [legacyStart, ...order.filter((id) => id !== legacyStart)];
        if (!order.length || order.some((id) => !allowedIds.has(id))) return apiError(response, 400, 'Invalid programme order.');
        const requestedCurrent = String(payload.currentYoutubeId ?? legacyStart ?? '').trim();
        const currentIndex = requestedCurrent && order.includes(requestedCurrent)
          ? order.indexOf(requestedCurrent)
          : Math.max(0, order.indexOf(current.youtubeId));
        const mode = ['continuous', 'paused', 'recurring', 'scheduled-loop'].includes(payload.mode)
          ? payload.mode
          : current.mode;
        let startedAt = current.youtubeId === order[currentIndex] && current.startedAt ? current.startedAt : Date.now();
        let pausedAt = current.pausedAt ?? null;
        if (mode === 'paused' && current.mode !== 'paused') {
          pausedAt = Date.now();
        } else if (mode !== 'paused' && current.mode === 'paused') {
          if (pausedAt) startedAt += Date.now() - pausedAt;
          pausedAt = null;
        }
        const name = safeText(payload.name ?? current.name, 32) || defaultVenueNames[venue];
        const subtitle = safeText(payload.subtitle ?? current.subtitle, 32) || defaultVenueSubtitles[venue];
        const requestedSpecialSource = ['none', 'library', 'youtube'].includes(payload.specialSource)
          ? payload.specialSource
          : (payload.specialYoutubeUrl ? 'youtube' : payload.specialYoutubeId ? 'library' : 'none');
        const specialYoutubeUrl = requestedSpecialSource === 'youtube' ? safeText(payload.specialYoutubeUrl, 300) : '';
        const specialYoutubeId = requestedSpecialSource === 'youtube'
          ? youtubeIdFromUrl(specialYoutubeUrl)
          : requestedSpecialSource === 'library'
            ? String(payload.specialYoutubeId ?? '').trim()
            : '';
        if (requestedSpecialSource === 'library' && specialYoutubeId && !order.includes(specialYoutubeId)) {
          return apiError(response, 400, 'Special screening is not in this venue.');
        }
        const specialStartsAt = Date.parse(String(payload.specialStartsAt ?? ''));
        if (specialYoutubeId && !/^[A-Za-z0-9_-]{6,20}$/.test(specialYoutubeId)) {
          return apiError(response, 400, 'Invalid special screening.');
        }
        programmeSchedule[venue] = {
          name,
          subtitle,
          order,
          currentIndex,
          youtubeId: order[currentIndex],
          mode,
          special: specialYoutubeId ? {
            youtubeId: specialYoutubeId,
            startsAt: Number.isFinite(specialStartsAt) ? specialStartsAt : Date.now(),
          } : null,
          activeSpecialYoutubeId: null,
          startedAt,
          pausedAt,
          updatedAt: Date.now(),
        };
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, schedule: programmeSchedule });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/style') {
        siteStyle.brandFontSize = Math.max(12, Math.min(42, Number(payload.brandFontSize) || siteStyle.brandFontSize));
        siteStyle.brandScaleY = Math.max(0.5, Math.min(2, Number(payload.brandScaleY) || siteStyle.brandScaleY));
        siteStyle.brandScaleX = Math.max(0.5, Math.min(2, Number(payload.brandScaleX) || siteStyle.brandScaleX));
        siteStyle.brandOffsetX = Math.max(-120, Math.min(240, Number(payload.brandOffsetX) || 0));
        siteStyle.brandOffsetY = Math.max(-80, Math.min(80, Number(payload.brandOffsetY) || 0));
        siteStyle.updatedAt = Date.now();
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, siteStyle });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/gate-background') {
        const youtubeUrl = safeText(payload.youtubeUrl, 300);
        const youtubeId = youtubeIdFromUrl(youtubeUrl);
        if (!youtubeId || !/^[A-Za-z0-9_-]{6,20}$/.test(youtubeId)) return apiError(response, 400, 'Invalid YouTube link.');
        gateBackground.youtubeId = youtubeId;
        gateBackground.updatedAt = Date.now();
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, gateBackground });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/key') {
        // The header already proved the caller holds the current key, but the
        // change is re-authenticated from the body so a shared or forgotten
        // browser session cannot rotate it on its own.
        const currentKey = String(payload.currentKey ?? '');
        const nextKey = String(payload.nextKey ?? '');
        if (!adminKeyMatches(currentKey)) return apiError(response, 403, 'The current staff key is incorrect.');
        if (nextKey.length < 12) return apiError(response, 400, 'The new staff key needs at least 12 characters.');
        if (nextKey.length > 128) return apiError(response, 400, 'The new staff key is too long.');
        if (!/^[\x21-\x7e]+$/.test(nextKey)) return apiError(response, 400, 'Use printable characters with no spaces.');
        if (adminKeyMatches(nextKey)) return apiError(response, 409, 'That is already the staff key.');
        const salt = randomBytes(16).toString('hex');
        adminKeyDigest = { salt, hash: hashAdminKey(nextKey, salt) };
        persist();
        return json(response, 200, { ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/tempo') {
        const youtubeId = String(payload.youtubeId ?? '').trim();
        if (!validYoutubeId(youtubeId)) return apiError(response, 400, 'Unknown track.');
        const bpm = Number(payload.bpm);
        if (!Number.isFinite(bpm) || bpm < 40 || bpm > 220) {
          return apiError(response, 400, 'Choose a tempo between 40 and 220 BPM.');
        }
        trackTempos[youtubeId] = Math.round(bpm);
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, trackTempos });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/npcs') {
        const npcId = safeText(payload.npcId, 24).toUpperCase();
        if (!(npcId in npcNames)) return apiError(response, 400, 'Unknown NPC.');
        const name = safeText(payload.name, 16);
        if (!name) return apiError(response, 400, 'An NPC name is required.');
        const title = safeText(payload.title, 40);
        if (!title) return apiError(response, 400, 'An NPC job title is required.');
        const duplicate = Object.entries(npcNames).some(([id, currentName]) =>
          id !== npcId && currentName.toLocaleUpperCase('en-US') === name.toLocaleUpperCase('en-US'));
        if (duplicate) return apiError(response, 409, 'That NPC name is already in use.');
        npcNames[npcId] = name;
        npcTitles[npcId] = title;
        for (const controlledVisitor of visitors.values()) {
          if (controlledVisitor.npcId === npcId) controlledVisitor.name = name;
        }
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, npcNames, npcProfiles: publicNpcProfiles() });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/npcs/add') {
        if (Object.keys(npcNames).length >= 24) return apiError(response, 409, 'The NPC limit has been reached.');
        const name = safeText(payload.name, 16);
        if (!name) return apiError(response, 400, 'An NPC name is required.');
        const title = safeText(payload.title, 40);
        if (!title) return apiError(response, 400, 'An NPC job title is required.');
        const duplicate = Object.values(npcNames).some((currentName) =>
          currentName.toLocaleUpperCase('en-US') === name.toLocaleUpperCase('en-US'));
        if (duplicate) return apiError(response, 409, 'That NPC name is already in use.');
        let sequence = Object.keys(npcNames).length + 1;
        while (`NPC_${sequence}` in npcNames) sequence += 1;
        const npcId = `NPC_${sequence}`;
        npcNames[npcId] = name;
        npcTitles[npcId] = title;
        scheduleBroadcast();
        persist();
        return json(response, 201, { ok: true, npcId, npcNames, npcProfiles: publicNpcProfiles() });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/impersonate') {
        if (!visitor) return apiError(response, 401, 'A live festival session is required.');
        const npcId = safeText(payload.npcId, 24).toUpperCase();
        if (npcId && !(npcId in npcNames)) return apiError(response, 400, 'Unknown NPC.');
        if (npcId && !visitor.npcId) {
          visitor.impersonationOrigin = { ...visitor.presence, gesture: undefined };
          if (visitor.seatedAt) seats.delete(visitor.seatedAt);
          visitor.seatedAt = undefined;
        }
        if (!npcId && visitor.npcId && visitor.impersonationOrigin) {
          visitor.presence = { ...visitor.impersonationOrigin, gesture: undefined, state: 'walking', moving: false };
          visitor.impersonationOrigin = undefined;
        }
        visitor.npcId = npcId || undefined;
        visitor.name = npcId ? npcNames[npcId] : visitor.originalName;
        visitor.lastSeen = Date.now();
        scheduleBroadcast();
        return json(response, 200, { name: visitor.name, originalName: visitor.originalName, npcId: visitor.npcId });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/pamphlet') {
        const youtubeUrl = safeText(payload.youtubeUrl, 300);
        const youtubeId = youtubeIdFromUrl(youtubeUrl);
        if (!youtubeId || !/^[A-Za-z0-9_-]{6,20}$/.test(youtubeId)) return apiError(response, 400, 'Invalid YouTube link.');
        const eyebrow = safeText(payload.eyebrow, 60);
        const title = safeText(payload.title, 80);
        const titleZh = safeText(payload.titleZh, 80);
        const introduction = safeText(payload.introduction, 1200);
        const introductionZh = safeText(payload.introductionZh, 1200);
        if (!eyebrow || !title || !titleZh || !introduction || !introductionZh) {
          return apiError(response, 400, 'Complete all pamphlet fields.');
        }
        Object.assign(pamphletContent, {
          youtubeId, eyebrow, title, titleZh, introduction, introductionZh, updatedAt: Date.now(),
        });
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, pamphlet: pamphletContent });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/gate-copy') {
        const next = {};
        for (const field of ['kicker', 'kickerZh', 'title', 'titleZh', 'intro', 'introZh', 'nameLabel', 'nameLabelZh']) {
          const value = safeText(payload[field], field.startsWith('intro') ? 300 : 80);
          if (!value) return apiError(response, 400, 'Complete every gate field in both languages.');
          next[field] = value;
        }
        Object.assign(gateCopy, next, { updatedAt: Date.now() });
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, gateCopy });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/shop-link') {
        // An empty string is allowed: that is how STAFF take the store down.
        const raw = safeText(payload.url, 500);
        const link = raw ? safeExternalUrl(raw) : '';
        if (raw && !link) return apiError(response, 400, 'The store link must be an http or https address.');
        const label = safeText(payload.label, 60);
        const labelZh = safeText(payload.labelZh, 60);
        Object.assign(shopLink, {
          url: link,
          label: label || shopLink.label,
          labelZh: labelZh || shopLink.labelZh,
          updatedAt: Date.now(),
        });
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, shopLink });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/temple-sign') {
        const name = safeText(payload.name, 24);
        const label = safeText(payload.label, 24);
        if (!name && !label) return apiError(response, 400, 'The temple sign needs something on it.');
        Object.assign(templeSign, {
          name: name || templeSign.name,
          label: label || templeSign.label,
          updatedAt: Date.now(),
        });
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, templeSign });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/dj-profile') {
        const id = safeText(payload.id, 40).toUpperCase();
        if (!Object.prototype.hasOwnProperty.call(djProfiles, id)) return apiError(response, 400, 'Unknown DJ.');
        const role = safeText(payload.role, 120);
        const roleZh = safeText(payload.roleZh, 120);
        const introduction = safeText(payload.introduction, 1200);
        const introductionZh = safeText(payload.introductionZh, 1200);
        if (!role || !roleZh || !introduction || !introductionZh) {
          return apiError(response, 400, 'Complete all DJ introduction fields.');
        }
        Object.assign(djProfiles[id], { role, roleZh, introduction, introductionZh, updatedAt: Date.now() });
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, djProfiles });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/videos') {
        const venue = String(payload.venue ?? '');
        if (!isVenue(venue)) return apiError(response, 400, 'Unknown venue.');
        const youtubeUrl = safeText(payload.youtubeUrl, 300);
        const youtubeId = youtubeIdFromUrl(youtubeUrl);
        if (!youtubeId || !/^[A-Za-z0-9_-]{6,20}$/.test(youtubeId)) return apiError(response, 400, 'Invalid YouTube link.');
        const duplicate = [
          ...programmeIdsByVenue[venue],
          ...customVideosByVenue[venue].map((video) => video.youtubeId),
        ].includes(youtubeId);
        if (duplicate) return apiError(response, 409, 'That video is already in this venue.');
        const title = safeText(payload.title, 100);
        if (!title) return apiError(response, 400, 'A video title is required.');
        const yearValue = Number(payload.year);
        const category = programmeCategoryForVenue[venue];
        const entry = {
          id: `custom-${venue}-${youtubeId}`,
          title,
          titleZh: safeText(payload.titleZh, 100) || undefined,
          creator: safeText(payload.creator, 80) || undefined,
          year: Number.isInteger(yearValue) && yearValue >= 1888 && yearValue <= 2200 ? yearValue : undefined,
          category,
          venue,
          youtubeId,
          embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
          sourceUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
        };
        customVideosByVenue[venue].push(entry);
        programmeSchedule[venue].order.push(youtubeId);
        programmeSchedule[venue].updatedAt = Date.now();
        scheduleBroadcast();
        persist();
        return json(response, 201, { ok: true, video: entry, schedule: programmeSchedule });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/videos/remove') {
        const venue = String(payload.venue ?? '');
        if (!isVenue(venue)) return apiError(response, 400, 'Unknown venue.');
        const youtubeId = String(payload.youtubeId ?? '').trim();
        const schedule = programmeSchedule[venue];
        if (!schedule.order.includes(youtubeId)) return apiError(response, 404, 'Video is not in this venue.');
        if (schedule.order.length <= 1) return apiError(response, 409, 'A venue must keep at least one video.');

        const previousCurrentYoutubeId = schedule.activeSpecialYoutubeId ?? schedule.order[schedule.currentIndex];
        schedule.order = schedule.order.filter((id) => id !== youtubeId);
        if (schedule.activeSpecialYoutubeId === youtubeId) schedule.activeSpecialYoutubeId = null;
        if (schedule.special?.youtubeId === youtubeId) schedule.special = null;
        schedule.currentIndex = previousCurrentYoutubeId !== youtubeId && schedule.order.includes(previousCurrentYoutubeId)
          ? schedule.order.indexOf(previousCurrentYoutubeId)
          : Math.min(schedule.currentIndex, schedule.order.length - 1);
        schedule.youtubeId = schedule.activeSpecialYoutubeId ?? schedule.order[schedule.currentIndex];
        if (previousCurrentYoutubeId === youtubeId) schedule.startedAt = Date.now();
        schedule.updatedAt = Date.now();

        const customIndex = customVideosByVenue[venue].findIndex((video) => video.youtubeId === youtubeId);
        if (customIndex >= 0) customVideosByVenue[venue].splice(customIndex, 1);
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true, schedule: programmeSchedule, customVideos: customVideosByVenue });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/mute') {
        const target = visitors.get(String(payload.visitorId));
        if (!target) return apiError(response, 404, 'Visitor not found.');
        target.mutedUntil = Date.now() + Math.max(1, Math.min(60, Number(payload.minutes) || 5)) * 60_000;
        scheduleBroadcast();
        return json(response, 200, { ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/kick') {
        const target = visitors.get(String(payload.visitorId));
        if (!target) return apiError(response, 404, 'Visitor not found.');
        removeVisitor(target, 'kicked');
        return json(response, 200, { ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/delete-message') {
        const index = messages.findIndex((message) => message.id === payload.messageId);
        if (index < 0) return apiError(response, 404, 'Message not found.');
        restoredMessageIds.delete(payload.messageId);
        messages.splice(index, 1);
        scheduleBroadcast();
        persist();
        return json(response, 200, { ok: true });
      }
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && isProduction && await serveStatic(url, response)) return;
    return apiError(response, 404, 'Not found.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    return apiError(response, 400, message);
  }
});

const heartbeat = setInterval(() => {
  const now = Date.now();
  // A venue's programme moves on whether or not anybody is standing in it.
  if (settleAllSchedules()) scheduleBroadcast();
  for (const responseSet of streams.values()) {
    for (const response of responseSet) response.write(': heartbeat\n\n');
  }
  for (const visitor of visitors.values()) {
    // An open event stream is itself proof that the attendee remains live.
    // Only expire disconnected sessions, and leave enough room for a
    // background tab or brief network interruption to recover.
    if (streams.get(visitor.id)?.size) {
      visitor.lastSeen = now;
      continue;
    }
    if (now - visitor.lastSeen > DISCONNECTED_SESSION_GRACE_MS) removeVisitor(visitor, 'timeout');
  }
}, 10_000);

restorePersistedState();

server.listen(PORT, HOST, () => {
  console.log(`myschedule festival server listening on http://${HOST}:${PORT}`);
});

const shutdown = () => {
  clearInterval(heartbeat);
  if (broadcastTimer) clearTimeout(broadcastTimer);
  persistNow();
  for (const visitor of [...visitors.values()]) removeVisitor(visitor, 'shutdown');
  server.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
