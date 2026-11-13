/**
 * The browser's half of the anonymous visit tallies (server/visit-stats.mjs).
 *
 * A visit reports a few moments: the sign-in page opened, ENTER pressed, the
 * world shown, and the page left. Each report says what kind of device this
 * is, which app's browser it runs in and where the link came from. It also
 * carries a random token that this browser made up for itself, so the
 * service can count distinct browsers. Nothing typed and no name is sent.
 *
 * Reports go by `navigator.sendBeacon` as plain text: no preflight, and a
 * beacon still leaves when the page is closing, which is the moment the
 * "left" report is about.
 */
export type VisitDevice = 'phone' | 'tablet' | 'desktop';
export type VisitBrowser = 'instagram' | 'threads' | 'facebook' | 'line' | 'inapp' | 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';
export type VisitSource = 'instagram' | 'threads' | 'facebook' | 'search' | 'direct' | 'other';
export type VisitCrashStage = 'world' | 'world-ready' | 'loading' | 'other';

export const VISIT_STORAGE_KEY = 'myschedule-festival-visit-v1';

export function classifyDevice(userAgent: string, maxTouchPoints = 0): VisitDevice {
  // iPadOS asks for desktop pages and calls itself a Mac; only touch gives it away.
  if (/iPad|Tablet/i.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'tablet';
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return 'tablet';
  if (/iPhone|iPod|Android|Mobi/i.test(userAgent)) return 'phone';
  return 'desktop';
}

/**
 * In-app browsers first: they are Safari or Chrome underneath, but with less
 * memory and their own quirks, which is the point of telling them apart.
 * Threads' browser names itself by its codename, Barcelona.
 */
export function classifyBrowser(userAgent: string): VisitBrowser {
  if (/Instagram/i.test(userAgent)) return 'instagram';
  if (/Barcelona/i.test(userAgent)) return 'threads';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(userAgent)) return 'facebook';
  if (/\bLine\//i.test(userAgent)) return 'line';
  if (/; wv\)|GSA\/|MicroMessenger|KAKAOTALK|Twitter/i.test(userAgent)) return 'inapp';
  if (/Edg(e|A|iOS)?\//.test(userAgent)) return 'edge';
  if (/Firefox|FxiOS/.test(userAgent)) return 'firefox';
  if (/Chrome|CriOS/.test(userAgent)) return 'chrome';
  if (/Safari/.test(userAgent)) return 'safari';
  return 'other';
}

/**
 * Where the link came from: an explicit `utm_source`, else the referrer's
 * host. In-app browsers often send no referrer at all, so a visit opened
 * inside Instagram or Threads with none is credited to that app.
 */
export function classifySource(search: string, referrer: string, browser: VisitBrowser): VisitSource {
  const named = new URLSearchParams(search).get('utm_source')?.toLowerCase() ?? '';
  let host = '';
  try { host = referrer ? new URL(referrer).hostname.toLowerCase() : ''; } catch { host = ''; }
  const said = named || host;
  if (/instagram|^ig$/.test(said)) return 'instagram';
  if (/threads/.test(said)) return 'threads';
  if (/facebook|fb\.me|^fb$/.test(said)) return 'facebook';
  if (/google\.|bing\.|yahoo\.|duckduckgo\./.test(said)) return 'search';
  if (!said) {
    if (browser === 'instagram') return 'instagram';
    if (browser === 'threads') return 'threads';
    if (browser === 'facebook') return 'facebook';
    return 'direct';
  }
  if (typeof location !== 'undefined' && host === location.hostname) return 'direct';
  return 'other';
}

const taiwanDay = (now: number) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

const randomToken = (): string => {
  const bytes = new Uint8Array(12);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.every((byte) => byte === 0)) for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 20);
};

interface StoredVisit { id: string; first: string; last: string }

/** This browser's token, and whether it has been here on an earlier day. */
export function rememberVisit(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, now: number): { token: string; returning: boolean } {
  const today = taiwanDay(now);
  let saved: StoredVisit | undefined;
  try {
    const raw = storage?.getItem(VISIT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<StoredVisit> : undefined;
    if (parsed && typeof parsed.id === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(parsed.id) && typeof parsed.first === 'string') {
      saved = { id: parsed.id, first: parsed.first, last: typeof parsed.last === 'string' ? parsed.last : parsed.first };
    }
  } catch { /* blocked or corrupt storage: a new token below */ }
  const visit = saved ?? { id: randomToken(), first: today, last: today };
  const returning = visit.first < today;
  try { storage?.setItem(VISIT_STORAGE_KEY, JSON.stringify({ ...visit, last: today })); } catch { /* private browsing */ }
  return { token: visit.id, returning };
}

export interface VisitReporterOptions {
  endpoint: string;
  userAgent?: string;
  maxTouchPoints?: number;
  search?: string;
  referrer?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  now?: () => number;
  send?: (url: string, body: string) => void;
}

const beacon = (url: string, body: string): void => {
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
  } catch { /* fall through to fetch */ }
  void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain;charset=UTF-8' } }).catch(() => undefined);
};

export class VisitReporter {
  private readonly endpoint: string;
  private readonly device: VisitDevice;
  private readonly browser: VisitBrowser;
  private readonly source: VisitSource;
  private readonly token: string;
  private readonly returning: boolean;
  private readonly now: () => number;
  private readonly send: (url: string, body: string) => void;
  private opened = false;
  private started = false;
  private startedAt = 0;
  private enteredAt = 0;
  private left = false;

  constructor(options: VisitReporterOptions) {
    this.endpoint = options.endpoint;
    this.now = options.now ?? (() => Date.now());
    this.send = options.send ?? beacon;
    const userAgent = options.userAgent ?? '';
    this.device = classifyDevice(userAgent, options.maxTouchPoints ?? 0);
    this.browser = classifyBrowser(userAgent);
    this.source = classifySource(options.search ?? '', options.referrer ?? '', this.browser);
    const { token, returning } = rememberVisit(options.storage, this.now());
    this.token = token;
    this.returning = returning;
  }

  /** What this visit is: device, browser and source, for review fixtures. */
  describe(): { device: VisitDevice; browser: VisitBrowser; source: VisitSource; returning: boolean } {
    return { device: this.device, browser: this.browser, source: this.source, returning: this.returning };
  }

  private report(event: string, extra: Record<string, unknown> = {}): void {
    this.send(this.endpoint, JSON.stringify({ e: event, v: this.token, d: this.device, b: this.browser, r: this.returning ? 1 : 0, ...extra }));
  }

  /** The sign-in page is up. `crash` is where the previous visit here died, if it did. */
  open(crash?: VisitCrashStage): void {
    if (this.opened) return;
    this.opened = true;
    this.report('open', { s: this.source, ...(crash ? { c: crash } : {}) });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.startedAt = this.now();
    this.report('start');
  }

  entered(): void {
    if (this.enteredAt) return;
    this.enteredAt = this.now();
    this.report('entered', { t: this.startedAt ? Math.round((this.enteredAt - this.startedAt) / 1000) : 0 });
  }

  /**
   * The page is going away or out of sight. Reported once per page: a phone
   * switching apps for a moment counts as leaving at that moment. That
   * undercounts the time of somebody who comes straight back, and never
   * overcounts it.
   */
  leave(progress: number, areas: number): void {
    if (this.left || !this.opened) return;
    this.left = true;
    if (this.enteredAt) {
      this.report('leave', { p: 'world', t: Math.round((this.now() - this.enteredAt) / 1000), a: areas });
    } else if (this.started) {
      this.report('leave', { p: 'loading', g: Math.round(Math.max(0, Math.min(1, progress)) * 100) });
    } else {
      this.report('leave', { p: 'gate' });
    }
  }
}
