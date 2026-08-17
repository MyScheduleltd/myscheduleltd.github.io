import type { AvatarGesture, AvatarPalette, CarriedItem, NpcId, NpcNames, NpcProfile, PlayerState } from '../world/FestivalWorld';
import type { VenueKey } from '../data/catalogue';
import type { CatalogueEntry } from '../data/catalogue';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'kicked';
export type ChatChannel = 'NEARBY' | 'VENUE' | 'FESTIVAL';

export interface NetworkPresence {
  x: number;
  z: number;
  rotation: number;
  location: string;
  state: PlayerState;
  moving: boolean;
  venue: VenueKey;
  gesture?: AvatarGesture;
  carriedItem?: CarriedItem;
}

export interface NetworkVisitor {
  id: string;
  name: string;
  originalName: string;
  palette: AvatarPalette;
  presence: NetworkPresence;
  impersonationOrigin?: NetworkPresence;
  seatedAt?: string;
  mutedUntil: number;
  joinedAt: number;
  npcId?: string;
}

export interface NetworkMessage {
  id: string;
  authorId: string;
  author: string;
  channel: ChatChannel;
  text: string;
  timestamp: number;
}

export type ProgrammeMode = 'continuous' | 'paused' | 'recurring' | 'scheduled-loop';

export interface ProgrammeScheduleEntry {
  name: string;
  order: string[];
  currentIndex: number;
  youtubeId: string;
  mode: ProgrammeMode;
  special: { youtubeId: string; startsAt: number } | null;
  activeSpecialYoutubeId: string | null;
  /** Service clock for the current work; every client seeks from this. */
  startedAt: number;
  pausedAt: number | null;
  updatedAt: number;
}

export type ProgrammeSchedule = Record<VenueKey, ProgrammeScheduleEntry>;

export interface SiteStyle {
  brandFontSize: number;
  brandScaleY: number;
  brandScaleX: number;
  brandOffsetX: number;
  brandOffsetY: number;
  updatedAt: number;
}

export interface GateBackground {
  youtubeId: string;
  updatedAt: number;
}

export type CustomVideos = Record<VenueKey, CatalogueEntry[]>;

/** Beats per minute per track, used to strobe the club in time. */
export type TrackTempos = Record<string, number>;

/** The last track an attendee asked the club's DJ to play. */
export interface ClubRequest {
  venue?: VenueKey;
  youtubeId: string;
  requestedBy: string;
  at: number;
  position?: number;
}

/** Tracks waiting their turn on the club's decks, in play order. */
export interface ClubQueueEntry {
  youtubeId: string;
  requestedBy: string;
  at: number;
}

export interface PamphletContent {
  youtubeId: string;
  eyebrow: string;
  title: string;
  titleZh: string;
  introduction: string;
  introductionZh: string;
  updatedAt: number;
}

export interface FestivalState {
  serverTime: number;
  selfId: string;
  visitors: NetworkVisitor[];
  seats: Array<{ seatId: string; visitorId: string }>;
  messages: NetworkMessage[];
  schedule: ProgrammeSchedule;
  siteStyle: SiteStyle;
  gateBackground: GateBackground;
  mentorCarrierId: string | null;
  clubRequest: ClubRequest | null;
  venueQueues: Partial<Record<VenueKey, ClubQueueEntry[]>>;
  customVideos: CustomVideos;
  npcNames: NpcNames;
  npcProfiles: NpcProfile[];
  pamphlet: PamphletContent;
  djProfiles: DjProfiles;
  trackTempos: TrackTempos;
}

export interface AdminState {
  visitors: NetworkVisitor[];
  seats: Array<{ seatId: string; visitorId: string }>;
  messages: NetworkMessage[];
  schedule: ProgrammeSchedule;
  siteStyle: SiteStyle;
  gateBackground: GateBackground;
  mentorCarrierId: string | null;
  clubRequest: ClubRequest | null;
  venueQueues: Partial<Record<VenueKey, ClubQueueEntry[]>>;
  customVideos: CustomVideos;
  npcNames: NpcNames;
  npcProfiles: NpcProfile[];
  pamphlet: PamphletContent;
  djProfiles: DjProfiles;
  trackTempos: TrackTempos;
}

/** A resident DJ's introduction, shown from their booth. */
export interface DjProfile {
  id: string;
  name: string;
  role: string;
  roleZh: string;
  introduction: string;
  introductionZh: string;
  updatedAt: number;
}

export type DjProfiles = Record<string, DjProfile>;

export interface PublicConfig {
  schedule: ProgrammeSchedule;
  siteStyle: SiteStyle;
  gateBackground: GateBackground;
  customVideos: CustomVideos;
  npcNames: NpcNames;
  npcProfiles: NpcProfile[];
  pamphlet: PamphletContent;
  djProfiles: DjProfiles;
  trackTempos: TrackTempos;
}

interface Session {
  id: string;
  token: string;
}

interface SessionIdentity {
  name: string;
  palette: AvatarPalette;
}

interface ClientOptions {
  onState: (state: FestivalState) => void;
  onStatus: (status: ConnectionStatus, detail?: string) => void;
}

const defaultServerUrl = import.meta.env.DEV ? 'http://127.0.0.1:8787' : window.location.origin;

export class FestivalClient {
  private readonly baseUrl = (import.meta.env.VITE_FESTIVAL_SERVER_URL || defaultServerUrl).replace(/\/$/, '');
  private readonly onState: ClientOptions['onState'];
  private readonly onStatus: ClientOptions['onStatus'];
  private session?: Session;
  private abortController?: AbortController;
  private reconnectTimer?: number;
  private reconnectAttempt = 0;
  private lastPresenceAt = 0;
  private lastPresence = '';
  private closed = false;
  private suspended = false;
  private recovering = false;
  private identity?: SessionIdentity;

  constructor({ onState, onStatus }: ClientOptions) {
    this.onState = onState;
    this.onStatus = onStatus;
  }

  get online(): boolean {
    return Boolean(this.session) && !this.closed;
  }

  async connect(name: string, palette: AvatarPalette): Promise<void> {
    this.closed = false;
    this.suspended = false;
    this.identity = { name, palette };
    this.onStatus('connecting');
    try {
      const response = await fetch(`${this.baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, palette }),
      });
      const payload = await response.json() as { session?: Session; state?: FestivalState; error?: string };
      if (!response.ok || !payload.session || !payload.state) throw new Error(payload.error ?? 'Festival server is unavailable.');
      this.session = payload.session;
      this.reconnectAttempt = 0;
      this.onState(payload.state);
      this.onStatus('online');
      void this.openEventStream();
    } catch (error) {
      this.onStatus('offline', error instanceof Error ? error.message : 'Festival server is unavailable.');
    }
  }

  async publishPresence(presence: NetworkPresence, palette: AvatarPalette): Promise<void> {
    if (!this.session || this.closed) return;
    if (this.identity) this.identity.palette = palette;
    const payload = JSON.stringify({ ...presence, palette });
    const now = performance.now();
    if (payload === this.lastPresence && now - this.lastPresenceAt < 3_000) return;
    if (now - this.lastPresenceAt < 220) return;
    this.lastPresence = payload;
    this.lastPresenceAt = now;
    await this.request('/api/presence', { method: 'POST', body: payload }, false);
  }

  async claimSeat(seatId: string): Promise<{ ok: boolean; message?: string }> {
    return this.action(`/api/seats/${encodeURIComponent(seatId)}/claim`);
  }

  async releaseSeat(seatId: string): Promise<void> {
    await this.request(`/api/seats/${encodeURIComponent(seatId)}/release`, { method: 'POST' }, false);
  }

  async sendMessage(channel: ChatChannel, text: string): Promise<{ ok: boolean; message?: string }> {
    return this.action('/api/chat', { channel, text });
  }

  async adminState(key: string): Promise<AdminState> {
    return this.adminRequest('/api/admin/state', key, { method: 'GET' }) as Promise<AdminState>;
  }

  async publicConfig(): Promise<PublicConfig> {
    const response = await fetch(`${this.baseUrl}/api/config`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('Festival configuration is unavailable.');
    return response.json() as Promise<PublicConfig>;
  }

  async moderate(key: string, action: 'mute' | 'kick' | 'delete-message', payload: object): Promise<void> {
    await this.adminRequest(`/api/admin/${action}`, key, { method: 'POST', body: JSON.stringify(payload) });
  }

  async updateProgramme(key: string, payload: {
    venue: VenueKey;
    name: string;
    order: string[];
    currentYoutubeId: string;
    mode: ProgrammeMode;
    specialSource?: 'none' | 'library' | 'youtube';
    specialYoutubeUrl?: string;
    specialYoutubeId?: string;
    specialStartsAt?: string;
  }): Promise<void> {
    await this.adminRequest('/api/admin/schedule', key, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateSiteStyle(key: string, style: Omit<SiteStyle, 'updatedAt'>): Promise<void> {
    await this.adminRequest('/api/admin/style', key, {
      method: 'POST',
      body: JSON.stringify(style),
    });
  }

  /** Ask the club's DJ to drop a track for the room. */
  async requestTrack(venue: 'club' | 'rooftop', youtubeId: string): Promise<{ ok: boolean; message?: string }> {
    return this.action(`/api/${venue}/request`, { youtubeId });
  }

  /** Rotates the staff key. The current one must be supplied as well. */
  async updateAdminKey(key: string, currentKey: string, nextKey: string): Promise<void> {
    await this.adminRequest('/api/admin/key', key, {
      method: 'POST',
      body: JSON.stringify({ currentKey, nextKey }),
    });
  }

  async updateTrackTempo(key: string, youtubeId: string, bpm: number): Promise<void> {
    await this.adminRequest('/api/admin/tempo', key, {
      method: 'POST',
      body: JSON.stringify({ youtubeId, bpm }),
    });
  }

  async updateGateBackground(key: string, youtubeUrl: string): Promise<void> {
    await this.adminRequest('/api/admin/gate-background', key, {
      method: 'POST',
      body: JSON.stringify({ youtubeUrl }),
    });
  }

  async claimMentor(): Promise<{ ok: boolean; message?: string }> {
    return this.action('/api/mentor/pick-up');
  }

  async releaseMentor(): Promise<{ ok: boolean; message?: string }> {
    return this.action('/api/mentor/put-down');
  }

  async updateNpcProfile(key: string, npcId: NpcId, name: string, title: string): Promise<void> {
    await this.adminRequest('/api/admin/npcs', key, {
      method: 'POST',
      body: JSON.stringify({ npcId, name, title }),
    });
  }

  async addNpc(key: string, name: string, title: string): Promise<void> {
    await this.adminRequest('/api/admin/npcs/add', key, {
      method: 'POST',
      body: JSON.stringify({ name, title }),
    });
  }

  async impersonateNpc(key: string, npcId?: string): Promise<{ name: string; originalName: string; npcId?: string }> {
    return this.adminRequest('/api/admin/impersonate', key, {
      method: 'POST',
      body: JSON.stringify({ npcId: npcId ?? '' }),
    }) as Promise<{ name: string; originalName: string; npcId?: string }>;
  }

  async updatePamphlet(key: string, payload: {
    youtubeUrl: string;
    eyebrow: string;
    title: string;
    titleZh: string;
    introduction: string;
    introductionZh: string;
  }): Promise<void> {
    await this.adminRequest('/api/admin/pamphlet', key, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateDjProfile(key: string, payload: {
    id: string;
    role: string;
    roleZh: string;
    introduction: string;
    introductionZh: string;
  }): Promise<void> {
    await this.adminRequest('/api/admin/dj-profile', key, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async addVideo(key: string, payload: {
    venue: VenueKey;
    youtubeUrl: string;
    title: string;
    titleZh?: string;
    creator?: string;
    year?: number;
  }): Promise<void> {
    await this.adminRequest('/api/admin/videos', key, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async removeVideo(key: string, venue: VenueKey, youtubeId: string): Promise<void> {
    await this.adminRequest('/api/admin/videos/remove', key, {
      method: 'POST',
      body: JSON.stringify({ venue, youtubeId }),
    });
  }

  async advanceProgramme(venue: VenueKey, youtubeId: string): Promise<void> {
    await this.request(`/api/programme/${venue}/advance`, {
      method: 'POST',
      body: JSON.stringify({ youtubeId }),
    }, false);
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    this.suspended = false;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.abortController?.abort();
    if (this.session) await this.request('/api/session/leave', { method: 'POST', keepalive: true }, false);
    this.session = undefined;
  }

  suspend(): void {
    if (this.closed) return;
    this.suspended = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.abortController?.abort();
  }

  resume(): void {
    if (this.closed || !this.suspended) return;
    this.suspended = false;
    if (this.session) void this.openEventStream();
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    if (this.session) {
      headers.set('authorization', `Bearer ${this.session.token}`);
      headers.set('x-festival-session', this.session.id);
    }
    return headers;
  }

  private async request(path: string, init: RequestInit, throwOnError = true): Promise<Response> {
    const headers = this.headers(init.headers);
    if (init.body) headers.set('content-type', 'application/json');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (error) {
      if (!this.closed) this.onStatus('reconnecting', 'Connection interrupted. Retrying…');
      throw error;
    }
    if (throwOnError && !response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? `Request failed (${response.status}).`);
    }
    return response;
  }

  private async action(path: string, payload?: object): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.request(path, { method: 'POST', body: payload ? JSON.stringify(payload) : undefined });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Action failed.' };
    }
  }

  private async adminRequest(path: string, key: string, init: RequestInit): Promise<unknown> {
    const headers = this.headers(init.headers);
    headers.set('x-festival-admin-key', key);
    if (init.body) headers.set('content-type', 'application/json');
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      const staleServer = response.status === 404
        ? 'Staff server is outdated. Restart npm run dev.'
        : undefined;
      throw new Error(payload.error === 'Not found.' ? staleServer : (payload.error ?? staleServer ?? 'Staff request failed.'));
    }
    return payload;
  }

  private async openEventStream(): Promise<void> {
    if (!this.session || this.closed || this.suspended) return;
    this.abortController?.abort();
    this.abortController = new AbortController();
    try {
      const response = await fetch(`${this.baseUrl}/api/events`, {
        headers: this.headers({ accept: 'text/event-stream' }),
        signal: this.abortController.signal,
      });
      if (response.status === 401) {
        await this.recoverSession();
        return;
      }
      if (!response.ok || !response.body) throw new Error('Live festival stream is unavailable.');
      this.reconnectAttempt = 0;
      this.onStatus('online');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          this.handleEventBlock(block);
          boundary = buffer.indexOf('\n\n');
        }
      }
      if (!this.closed) this.scheduleReconnect();
    } catch (error) {
      if (!this.closed && !(error instanceof DOMException && error.name === 'AbortError')) this.scheduleReconnect();
    }
  }

  private handleEventBlock(block: string): void {
    if (!block || block.startsWith(':')) return;
    let event = 'message';
    const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    const payload = JSON.parse(data.join('\n')) as FestivalState | { reason?: string };
    if (event === 'state') this.onState(payload as FestivalState);
    if (event === 'kicked') {
      this.closed = true;
      this.session = undefined;
      this.onStatus('kicked', 'Festival staff ended this session.');
    }
  }

  private async recoverSession(): Promise<void> {
    if (this.closed || this.suspended || this.recovering || !this.session || !this.identity) return;
    this.recovering = true;
    this.onStatus('reconnecting', 'Restoring your festival session…');
    try {
      const response = await fetch(`${this.baseUrl}/api/session/recover`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session: this.session, ...this.identity }),
      });
      const payload = await response.json() as { session?: Session; state?: FestivalState; error?: string };
      if (!response.ok || !payload.session || !payload.state) throw new Error(payload.error ?? 'Session recovery failed.');
      this.session = payload.session;
      this.reconnectAttempt = 0;
      this.onState(payload.state);
      this.onStatus('online');
      void this.openEventStream();
    } catch {
      this.scheduleReconnect();
    } finally {
      this.recovering = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.suspended || !this.session || this.reconnectTimer) return;
    this.onStatus('reconnecting', 'Live connection interrupted. Retrying…');
    const delay = Math.min(10_000, 500 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.openEventStream();
    }, delay);
  }
}
