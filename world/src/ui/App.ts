import {
  catalogue,
  catalogueByVenue,
  catalogueSummary,
  type CatalogueEntry,
  type VenueKey,
} from '../data/catalogue';
import companyLogoUrl from '../assets/company-logo.png';
import { DJ_BY_VENUE, djProfileFor } from '../data/djProfiles';
import { ProgrammeClock } from '../data/programmeClock';
import { QUESTS, QUEST_SECTIONS, QUEST_TOTAL, type QuestId } from '../data/quests';
import {
  FestivalClient,
  type AdminState,
  type ChatChannel,
  type ConnectionStatus,
  type DjProfile,
  type FestivalState,
  type GateBackground,
  type GateCopy,
  type PamphletContent,
  type ProgrammeMode,
  type SiteStyle,
  JukeboxState,
} from '../network/FestivalClient';
import {
  DEFAULT_NPC_NAMES,
  DEFAULT_NPC_PROFILES,
  FestivalWorld,
  NPC_NAMES,
  NPC_TITLES,
  type AvatarPalette,
  type GraphicsMode,
  type NpcId,
  type NpcNames,
  type NpcProfile,
  type WorldAction,
  type WorldSnapshot,
} from '../world/FestivalWorld';

type Language = 'en' | 'zh-TW';
type PanelId = 'quests' | 'map' | 'programme' | 'jukebox' | 'chat' | 'attendees' | 'pamphlet' | 'character' | 'sound' | 'graphics' | 'controls' | 'contact' | 'admin';

interface ChatMessage {
  id: string;
  authorId?: string;
  author: string;
  channel: ChatChannel;
  text: string;
  timestamp: number;
  npc?: boolean;
}

interface PrivateProgress {
  filmId: string;
  offset: number;
  startedAt?: number;
}

interface SavedProfile {
  id: string;
  language: Language;
  graphicsMode: GraphicsMode;
  palette: AvatarPalette;
}

/**
 * How long a press on the prompt has to last to count as a hold rather than a
 * tap. Long enough not to fire while somebody is simply pressing the button,
 * short enough that it does not feel like the prompt is ignoring them.
 */
const PROMPT_HOLD_MS = 450;
/**
 * How long the corner stays in sight after it clears the frame, so somebody
 * learns where it is while they are still looking at it.
 */
const CAMERA_CORNER_CUE_MS = 1_100;

const PROFILE_KEY = 'myschedule-festival-profile-v1';
const PRIVATE_PROGRESS_KEY = 'myschedule-private-screening-v1';
const CHAT_KEY = 'myschedule-local-chat-v2';
const STAFF_KEY = 'myschedule-festival-staff-key-v1';
const STAFF_SECTIONS_KEY = 'myschedule-festival-staff-sections-v1';

const defaultPamphlet: PamphletContent = {
  youtubeId: 'Ffli-o0ocT0',
  eyebrow: 'MY SCHEDULE LTD.',
  title: 'MY SCHEDULE',
  titleZh: '我的檔期',
  introduction: 'This is MY SCHEDULE LTD. We are a creative video production company based in Taipei, Taiwan. Operating globally, we are dedicated to producing top-quality visuals. Our creative team specializes in a variety of video productions, including movies, music videos, television shows, commercials, and occasionally unconventional YouTube content.',
  introductionZh: '這是我的檔期有限公司。我們是位於台灣台北的創意影像製作公司，服務遍及全球，致力製作高品質影像。團隊擅長電影、音樂錄影帶、電視節目、廣告，以及不定期的非典型 YouTube 內容。',
  updatedAt: 0,
};

const defaultVenueLabels: Record<VenueKey, string> = {
  palace: 'THE PALACE',
  'drive-in': 'DRIVE-IN 88',
  shore: 'THE SHORE',
  club: 'THE BASEMENT',
  rooftop: 'THE ROOFTOP',
};
const VENUE_KEYS: VenueKey[] = ['palace', 'drive-in', 'shore', 'club', 'rooftop'];

const defaultPalette: AvatarPalette = {
  skin: '#9d5f43',
  hair: '#171315',
  top: '#9f1720',
  bottoms: '#20242c',
  swimwear: '#d5b23f',
};

const copy = {
  en: {
    gateKicker: 'BETA',
    gateTitle: 'MY THEATRE',
    gateIntro: 'Follow the programme, take a seat, watch the work.',
    festivalId: 'ATTENDEE NAME',
    remember: 'REMEMBER ME ON THIS DEVICE',
    sound: 'ENTER WITH SOUND',
    muted: 'ENTER MUTED',
    language: 'LANGUAGE',
    graphics: 'GRAPHICS',
    normal: 'NORMAL',
    lite: 'LITE',
    invalidId: 'Use 1–16 characters. Reserved staff/system names are unavailable.',
    menu: 'FESTIVAL PASS',
    local: 'PRE-LAUNCH BUILD',
    palette: 'CHARACTER COLORS',
    gateNote: 'MOVE: WASD / ARROWS · RUN: SHIFT · JUMP: SPACE · CAMERA: T · CHAT: ENTER',
  },
  'zh-TW': {
    gateKicker: 'BETA',
    gateTitle: '我的戲院',
    gateIntro: '跟著節目表、入座，觀看作品。',
    festivalId: '觀影者名稱',
    remember: '記住此裝置',
    sound: '開啟聲音進入',
    muted: '靜音進入',
    language: '語言',
    graphics: '畫質',
    normal: '一般',
    lite: '精簡',
    invalidId: '請使用 1–16 個字元；系統及工作人員保留名稱無法使用。',
    menu: '影展通行證',
    local: '上線前版本',
    palette: '角色配色',
    gateNote: '移動：WASD／方向鍵 · 奔跑：SHIFT · 跳躍：SPACE · 鏡頭：T · 聊天：ENTER',
  },
} as const;

/** The jukebox slider is the attendee's own, kept on their machine. */
/**
 * What it takes to go down, and how long a beating is remembered — held here as
 * well as in the service so the page can stand in for a service too old to know
 * about either. Kept level with HITS_TO_DIE and HIT_MEMORY_MS there.
 */
const LOCAL_HITS_TO_DIE = 5;
const LOCAL_HIT_MEMORY_MS = 30_000;

const JUKEBOX_VOLUME_KEY = 'myschedule-jukebox-volume-v1';
const DEFAULT_JUKEBOX_VOLUME = 0.4;
const readStoredJukeboxVolume = (): number => {
  try {
    const raw = window.localStorage.getItem(JUKEBOX_VOLUME_KEY);
    if (raw === null) return DEFAULT_JUKEBOX_VOLUME;
    const stored = Number(raw);
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : DEFAULT_JUKEBOX_VOLUME;
  } catch {
    return DEFAULT_JUKEBOX_VOLUME;
  }
};

const panelLabels: Record<Language, Record<PanelId, string>> = {
  en: {
    quests: 'OBJECTIVES', map: 'MAP', programme: 'PROGRAMME', jukebox: 'JUKEBOX', chat: 'CHAT', attendees: 'ATTENDEES', pamphlet: 'PAMPHLET', character: 'CHARACTER',
    sound: 'SOUND', graphics: 'GRAPHICS', controls: 'CONTROLS', contact: 'CONTACT', admin: 'STAFF',
  },
  'zh-TW': {
    quests: '任務', map: '地圖', programme: '節目表', jukebox: '點唱機', chat: '聊天', attendees: '觀影者', pamphlet: '影展手冊', character: '角色',
    sound: '聲音', graphics: '畫質', controls: '操作', contact: '聯絡', admin: '工作人員',
  },
};

const paletteInputs = ['skin', 'hair', 'top', 'bottoms', 'swimwear'] as const;
const paletteLabels: Record<Language, Record<(typeof paletteInputs)[number], string>> = {
  en: { skin: 'SKIN', hair: 'HAIR', top: 'TOP', bottoms: 'BOTTOMS', swimwear: 'SWIMWEAR' },
  'zh-TW': { skin: '膚色', hair: '髮色', top: '上衣', bottoms: '下身', swimwear: '泳裝' },
};

const defaultGateBackground: GateBackground = { youtubeId: 'Ffli-o0ocT0', updatedAt: 0 };
const gateBackgroundUrl = (youtubeId: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${encodeURIComponent(youtubeId)}&playsinline=1&rel=0`;

const initialChat: ChatMessage[] = [
  { id: 'npc-1', author: 'MENTOR', channel: 'NEARBY', text: 'The public screenings are live in all three venues.', timestamp: Date.now() - 185000, npc: true },
  { id: 'npc-2', author: 'KENNY', channel: 'VENUE', text: 'Drive-In 88 has a clear view from the center bay.', timestamp: Date.now() - 121000, npc: true },
  { id: 'npc-3', author: 'NUNO', channel: 'FESTIVAL', text: 'The Palace marquee is open from MY SQUARE.', timestamp: Date.now() - 64000, npc: true },
];

const normalizeIdForSafety = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');

const isValidId = (value: string) => {
  const normalized = normalizeIdForSafety(value);
  if (!normalized || [...value.trim()].length > 16) return false;
  return !['STAFF', 'ADMIN', 'NPC', 'MYSCHEDULE', 'SYSTEM'].includes(normalized);
};

const readProfile = (): SavedProfile | null => {
  try {
    const value = localStorage.getItem(PROFILE_KEY);
    if (!value) return null;
    return JSON.parse(value) as SavedProfile;
  } catch {
    return null;
  }
};

const readSession = <T>(key: string, fallback: T): T => {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
};

const setButtonPressed = (button: HTMLButtonElement, pressed: boolean) => {
  button.setAttribute('aria-pressed', String(pressed));
  button.classList.toggle('is-selected', pressed);
};

export class App {
  private readonly root: HTMLElement;
  private world?: FestivalWorld;
  private language: Language;
  private graphicsMode: GraphicsMode;
  private palette: AvatarPalette;
  private snapshot?: WorldSnapshot;
  private activePanel?: PanelId;
  private currentId = '';
  private audioMuted = true;
  private screenMode?: 'public' | 'private';
  private screenMaximized = false;
  private screenNativeFullscreen = false;
  private promptHoldTimer = 0;
  private promptHeld = false;
  private cameraHidden = false;
  private cameraCornerCueTimer = 0;
  private publicFilmId?: string;
  private openDjBooth?: { name: string; venue: 'club' | 'rooftop'; view: 'requests' | 'about' };
  /** Set once STAFF touch the introduction, so no update can redraw over them. */
  private djIntroductionTouched = false;
  /** The introduction as it stood when drawn, to notice someone else changing it. */
  private djIntroductionSignature = '';
  private serverClockOffset = 0;
  private activeVenue: VenueKey = 'shore';
  private activeSeatId = 'CURRENT SEAT';
  /** The last blow this attendee took, so one is played out only once. */
  private lastHitAt = 0;
  private lastDeathAt = 0;
  private localHitCount = 0;
  private localHitAt = 0;
  private jukeboxVolume = readStoredJukeboxVolume();
  private jukeboxFrame?: HTMLIFrameElement;
  private lastJukeboxLiftAt = 0;
  private jukeboxSoundConfirmed = false;
  /** Lengths already reported, so the same one is not sent on every message. */
  private readonly jukeboxReportedDurations = new Map<string, number>();
  private jukeboxPlayingId?: string;
  private jukeboxStartedAt = 0;
  private jukeboxSilenced = false;
  private jukeboxRendered = '';
  private viewMode: 'normal' | 'camera' | 'postcard' | 'film' = 'normal';
  private postcardFilter = 'none';
  private cameraHintTimer = 0;
  private impactTimer = 0;
  private deathTimer = 0;
  private privateProgress?: PrivateProgress;
  private chatChannel: ChatChannel = 'NEARBY';
  private chatMessages: ChatMessage[];
  /** Said here, not yet echoed by the service. Kept so it shows straight away. */
  private pendingChat: ChatMessage[] = [];
  private chatStreamElement?: HTMLElement;
  private chatStreamSignature = '';
  private npcTimer?: number;
  private readonly festivalClient: FestivalClient;
  /** Public config is the lightweight wake-up request sent while the gate is drawn. */
  private festivalServiceReady = false;
  private connectionStatus: ConnectionStatus = 'offline';
  private networkState?: FestivalState;
  private staffKey = sessionStorage.getItem(STAFF_KEY) ?? '';
  private adminState?: AdminState;
  private adminError = '';
  private programmeRotationIndex = -1;
  private readonly openStaffSections = new Set<string>(
    JSON.parse(sessionStorage.getItem(STAFF_SECTIONS_KEY) ?? '[]') as string[],
  );
  private programmeTimer?: number;
  private siteStyle: SiteStyle = {
    brandFontSize: 41,
    brandScaleY: 1.35,
    brandScaleX: 0.65,
    brandOffsetX: 0,
    brandOffsetY: 4,
    updatedAt: 0,
  };
  private gateBackground: GateBackground = { ...defaultGateBackground };
  private npcProfiles: NpcProfile[] = DEFAULT_NPC_PROFILES.map((profile) => ({ ...profile }));
  private pamphlet: PamphletContent = { ...defaultPamphlet };
  private readonly programmeClock = new ProgrammeClock();
  private waitTimer?: number;
  private gateCopy?: GateCopy;
  private controlledNpcId?: string;
  /** Visit-only onboarding: deliberately absent from local/session storage. */
  private readonly completedQuests = new Set<QuestId>();
  private questCelebrated = false;

  constructor(root: HTMLElement) {
    this.root = root;
    const saved = readProfile();
    const browserLanguage: Language = navigator.language.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en';
    this.language = saved?.language ?? browserLanguage;
    // A phone defaulted to the heaviest setting the world has: shadows on,
    // every resident, full resolution. Nobody arriving on one had chosen that
    // — it was simply what a fresh visitor got, and a fresh visitor is exactly
    // who has not been to the graphics panel. A coarse pointer on a small
    // screen starts light instead, and the 一般 / 精簡 switch still overrides
    // it for anyone who wants to try.
    this.graphicsMode = saved?.graphicsMode ?? (App.looksLikeAPhone() ? 'lite' : 'normal');
    this.palette = { ...defaultPalette, ...saved?.palette };
    this.currentId = saved?.id ?? '';
    this.privateProgress = readSession<PrivateProgress | undefined>(PRIVATE_PROGRESS_KEY, undefined);
    this.chatMessages = readSession<ChatMessage[]>(CHAT_KEY, initialChat).slice(-100);
    this.festivalClient = new FestivalClient({
      onState: (state) => this.handleNetworkState(state),
      onStatus: (status, detail) => this.handleConnectionStatus(status, detail),
    });
  }

  mount(): void {
    this.renderGate();
    void this.festivalClient.publicConfig().then((config) => {
      this.festivalServiceReady = true;
      this.siteStyle = { ...this.siteStyle, ...config.siteStyle };
      this.gateBackground = { ...this.gateBackground, ...config.gateBackground };
      this.npcProfiles = this.normalizeNpcProfiles(config.npcProfiles, config.npcNames);
      this.pamphlet = { ...this.pamphlet, ...config.pamphlet };
      if (config.gateCopy) {
        this.gateCopy = config.gateCopy;
        // The gate is already on screen by now, so it has to be redrawn.
        if (this.root.querySelector('#gate-form')) this.renderGate();
      }
      this.applySiteStyle();
      this.applyGateBackground();
    }).catch(() => undefined);
  }

  /**
   * The gate's wording: STAFF's if the service has any, the build's otherwise.
   * The gate is drawn before the service is asked, so the build always has to
   * carry a readable copy of its own.
   */
  private gateText(): { [K in keyof typeof copy[Language]]: string } {
    const base = copy[this.language];
    const staff = this.gateCopy;
    if (!staff) return base;
    const zh = this.language === 'zh-TW';
    return {
      ...base,
      gateKicker: (zh ? staff.kickerZh : staff.kicker) || base.gateKicker,
      gateTitle: (zh ? staff.titleZh : staff.title) || base.gateTitle,
      gateIntro: (zh ? staff.introZh : staff.intro) || base.gateIntro,
      festivalId: (zh ? staff.nameLabelZh : staff.nameLabel) || base.festivalId,
    };
  }

  private renderGate(): void {
    const text = this.gateText();
    document.documentElement.lang = this.language;
    this.root.innerHTML = `
      <section class="gate" aria-labelledby="gate-title">
        <div class="gate__atmosphere" aria-hidden="true">
          <iframe class="gate__video" src="${this.escapeAttribute(gateBackgroundUrl(this.gateBackground.youtubeId))}" title="" tabindex="-1" allow="autoplay; encrypted-media"></iframe>
          <div class="gate__video-shade"></div>
          <div class="gate__grain"></div>
        </div>
        <header class="gate__brand">
          <img class="brand-logo" src="${companyLogoUrl}" alt="我的檔期" />
          <span>MYSCHEDULE</span>
          <span class="phase-badge">${text.local}</span>
        </header>
        <form class="gate-card" id="gate-form">
          <p class="eyebrow">${text.gateKicker}</p>
          <h1 id="gate-title">${text.gateTitle}</h1>
          <p class="gate-card__intro">${text.gateIntro}</p>
          <p class="gate-card__waiting" id="gate-waiting" role="status" hidden></p>

          <label class="field-label" for="festival-id">${text.festivalId}</label>
          <input
            id="festival-id"
            name="festivalId"
            maxlength="16"
            autocomplete="nickname"
            placeholder="TYPE IN YOUR NAME"
            value="${this.escapeAttribute(this.currentId)}"
            required
          />
          <p class="field-error" id="id-error" role="alert" hidden>${text.invalidId}</p>

          <div class="gate-grid">
            <fieldset>
              <legend>${text.language}</legend>
              <div class="segmented">
                <button type="button" data-language="en" aria-pressed="${this.language === 'en'}">EN</button>
                <button type="button" data-language="zh-TW" aria-pressed="${this.language === 'zh-TW'}">繁中</button>
              </div>
            </fieldset>
            <fieldset>
              <legend>${text.graphics}</legend>
              <div class="segmented">
                <button type="button" data-graphics="normal" aria-pressed="${this.graphicsMode === 'normal'}">${text.normal}</button>
                <button type="button" data-graphics="lite" aria-pressed="${this.graphicsMode === 'lite'}">${text.lite}</button>
              </div>
            </fieldset>
          </div>

          <fieldset class="palette-picker">
            <legend>${text.palette}</legend>
            ${paletteInputs
              .map(
                (slot) => `
                  <label><span>${paletteLabels[this.language][slot]}</span><input type="color" data-palette="${slot}" value="${this.palette[slot]}" /></label>
                `,
              )
              .join('')}
          </fieldset>

          <label class="check-field">
            <input id="remember-profile" type="checkbox" ${this.currentId ? 'checked' : ''} />
            <span>${text.remember}</span>
          </label>

          ${App.staffEntranceAsked() ? `
          <details class="gate-staff" open>
            <summary>${this.language === 'zh-TW' ? '工作人員入口' : 'STAFF ENTRANCE'}</summary>
            <label class="field-label" for="gate-staff-key">${this.language === 'zh-TW' ? '工作人員金鑰' : 'STAFF KEY'}</label>
            <input id="gate-staff-key" type="password" autocomplete="off" spellcheck="false"
              placeholder="${this.language === 'zh-TW' ? '持金鑰可免排隊進場' : 'Skips the queue'}" />
          </details>` : ''}

          <div class="gate-actions">
            <button class="button button--primary" type="submit" data-audio="sound">${text.sound}</button>
            <button class="button button--secondary" type="submit" data-audio="muted">${text.muted}</button>
          </div>
          <p class="gate-card__note">${text.gateNote}</p>
        </form>
      </section>
    `;

    this.root.querySelectorAll<HTMLButtonElement>('[data-language]').forEach((button) => {
      setButtonPressed(button, button.dataset.language === this.language);
      button.addEventListener('click', () => {
        this.language = button.dataset.language as Language;
        const id = this.root.querySelector<HTMLInputElement>('#festival-id')?.value ?? '';
        this.currentId = id;
        this.renderGate();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-graphics]').forEach((button) => {
      setButtonPressed(button, button.dataset.graphics === this.graphicsMode);
      button.addEventListener('click', () => {
        this.graphicsMode = button.dataset.graphics as GraphicsMode;
        this.root.querySelectorAll<HTMLButtonElement>('[data-graphics]').forEach((candidate) =>
          setButtonPressed(candidate, candidate === button),
        );
      });
    });

    this.root.querySelectorAll<HTMLInputElement>('[data-palette]').forEach((input) => {
      input.addEventListener('input', () => {
        const slot = input.dataset.palette as keyof AvatarPalette;
        this.palette = { ...this.palette, [slot]: input.value };
      });
    });

    const form = this.root.querySelector<HTMLFormElement>('#gate-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
      const input = this.root.querySelector<HTMLInputElement>('#festival-id');
      const id = input?.value.trim() ?? '';
      const error = this.root.querySelector<HTMLElement>('#id-error');
      if (!isValidId(id)) {
        if (error) error.hidden = false;
        input?.setAttribute('aria-invalid', 'true');
        input?.focus();
        return;
      }
      // Carried into the request for a place. The service already lets STAFF
      // past a full house — an administrator shut out of a busy room cannot fix
      // whatever made it busy — but nothing ever offered anywhere to say so
      // before entering, so the key could only be given after getting in, which
      // is precisely when it was no longer any use.
      const gateKey = this.root.querySelector<HTMLInputElement>('#gate-staff-key')?.value.trim() ?? '';
      if (gateKey) {
        this.staffKey = gateKey;
        sessionStorage.setItem(STAFF_KEY, gateKey);
      }
      const remember = this.root.querySelector<HTMLInputElement>('#remember-profile')?.checked ?? false;
      const profile: SavedProfile = { id, language: this.language, graphicsMode: this.graphicsMode, palette: this.palette };
      if (remember) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      else localStorage.removeItem(PROFILE_KEY);
      this.currentId = id;
      void this.enterWhenThereIsRoom(submitter?.dataset.audio === 'muted');
    });
  }

  /**
   * Holds somebody at the gate while the world is full, rather than admitting
   * them into a room with no room. Keeps asking on their behalf, showing where
   * they are in the queue, and goes in the moment a place opens. With no
   * service to ask, the world is single-player and everyone gets in.
   */
  private async enterWhenThereIsRoom(muted: boolean): Promise<void> {
    const zh = this.language === 'zh-TW';
    const form = this.root.querySelector<HTMLFormElement>('#gate-form');
    const notice = this.root.querySelector<HTMLElement>('#gate-waiting');
    const buttons = form?.querySelectorAll<HTMLButtonElement>('button[type="submit"]');
    const stopWaiting = () => {
      window.clearTimeout(this.waitTimer);
      this.waitTimer = undefined;
      buttons?.forEach((button) => { button.disabled = false; });
      if (notice) notice.hidden = true;
    };

    // A click must acknowledge itself immediately. Previously the button
    // looked inert for the whole cold-start delay, which made a working entry
    // path indistinguishable from a broken one.
    buttons?.forEach((button) => { button.disabled = true; });
    if (notice) {
      notice.hidden = false;
      notice.textContent = zh ? '正在開啟影展…' : 'OPENING THE FESTIVAL…';
    }

    const ask = async (): Promise<void> => {
      const placeRequest = this.festivalClient.requestPlace(this.currentId, this.palette, this.staffKey);
      if (!this.festivalServiceReady) {
        // The config request is also the service wake-up call. If it has not
        // answered yet, do not hold the visitor behind hosting infrastructure:
        // draw the local world now and let the single admission request attach
        // multiplayer in the background. A ready service still gets to enforce
        // its capacity and queue below.
        stopWaiting();
        this.enterWorldAfterGateFeedback(muted);
        return;
      }
      const place = await placeRequest;
      if ('waiting' in place && place.waiting) {
        buttons?.forEach((button) => { button.disabled = true; });
        if (notice) {
          notice.hidden = false;
          notice.textContent = zh
            ? `影展目前已滿（${place.waiting.inside}/${place.waiting.capacity}）。你在候補第 ${place.waiting.position} 位，有人離開後就會自動進入。`
            : `The festival is full (${place.waiting.inside}/${place.waiting.capacity}). You are number ${place.waiting.position} in the queue and will go in as soon as a place opens.`;
        }
        // Kept short so a place is taken up promptly once one opens, and well
        // inside the ticket's grace so the spot is not lost between asks.
        this.waitTimer = window.setTimeout(() => { void ask(); }, 4_000);
        return;
      }
      stopWaiting();
      if ('error' in place && place.error) {
        if (notice) { notice.hidden = false; notice.textContent = place.error; }
        return;
      }
      this.enterWorldAfterGateFeedback(muted);
    };

    await ask();
  }

  /**
   * Give the disabled button and opening message one browser task to paint
   * before Three.js builds the scene. Scene construction is intentionally
   * synchronous, so entering it in the submit task made the click look dead
   * even after the network wait was removed.
   */
  private enterWorldAfterGateFeedback(muted: boolean): void {
    window.setTimeout(() => this.enterWorld(muted), 50);
  }

  private enterWorld(muted: boolean): void {
    const zh = this.language === 'zh-TW';
    this.root.innerHTML = `
      <section class="world-shell">
        <canvas id="world-canvas" aria-label="Myschedule festival world"></canvas>
        <div class="world-css3d" id="world-css3d" aria-hidden="true"></div>
        <canvas id="world-foreground" aria-hidden="true"></canvas>
        <div class="world-vignette" aria-hidden="true"></div>
        <div class="world-impact" data-impact aria-hidden="true"></div>
        <div class="world-death" aria-live="polite"></div>
        <div class="world-postcard" aria-hidden="true">
          <div class="world-postcard__frame"></div>
          <div class="world-postcard__caption">
            <input type="text" maxlength="64" data-postcard-caption
              placeholder="${zh ? '寫下你的明信片…' : 'WRITE YOUR POSTCARD…'}"
              aria-label="${zh ? '明信片文字' : 'Postcard caption'}" />
          </div>
          <div class="world-postcard__tools">
            <button type="button" class="world-postcard__tab" data-postcard-tab aria-haspopup="true">${zh ? '原色' : 'AS SHOT'}</button>
            <div class="world-postcard__menu">
              ${[
                ['none', zh ? '原色' : 'AS SHOT'],
                ['warm', zh ? '暖調' : 'WARM'],
                ['cold', zh ? '冷調' : 'COLD'],
                ['mono', zh ? '黑白' : 'MONO'],
                ['faded', zh ? '褪色' : 'FADED'],
              ].map(([value, label]) => `<button type="button" data-postcard-filter="${value}"${value === 'none' ? ' class="is-active"' : ''}>${label}</button>`).join('')}
            </div>
          </div>
        </div>
        <div class="world-film" aria-hidden="true">
          <div class="world-film__edge world-film__edge--top"><span>MYSCHEDULE 400 · 35MM</span></div>
          <div class="world-film__grain"></div>
          <div class="world-film__edge world-film__edge--bottom">
            <input type="text" maxlength="48" data-film-caption
              placeholder="${zh ? '寫在片邊…' : 'WRITE ON THE EDGE…'}"
              aria-label="${zh ? '底片文字' : 'Film caption'}" />
          </div>
        </div>
        <button class="world-camera-hint" type="button" data-camera-step hidden></button>
        <button class="world-camera-hide" type="button" data-camera-hide hidden
          aria-label="${zh ? '顯示或隱藏相機介面' : 'Show or hide camera controls'}">${zh ? '隱藏' : 'HIDE'}</button>
        <button class="zoom-reset" type="button" data-zoom-reset hidden>${zh ? '重設縮放' : 'RESET ZOOM'}</button>
        <button class="jukebox-sound" type="button" data-jukebox-sound hidden>DROP THE BEAT</button>
        <header class="world-header">
          <div class="world-brand"><img class="brand-logo" src="${companyLogoUrl}" alt="我的檔期" /><span>MYSCHEDULE</span></div>
          <div class="status-cluster" id="connection-status" data-status="connecting">
            <span class="status-dot"></span>
            <span>${zh ? '連線中' : 'CONNECTING'} / ${this.escapeHtml(this.currentId)}</span>
          </div>
        </header>
        <section class="world-status" aria-live="polite">
          <p class="eyebrow" id="location-label">${zh ? '影展入口' : 'FESTIVAL GATE'}</p>
          <p class="world-clock" id="festival-clock">--:--</p>
          <p id="phase-label">${zh ? '同步影展光線' : 'SYNCING FESTIVAL LIGHT'}</p>
        </section>
        <div class="inventory-status" id="inventory-status" aria-live="polite"></div>
        <button class="objective-count" type="button" data-panel="quests" aria-label="${zh ? '開啟任務進度' : 'Open objective progress'}">
          <span>${zh ? '任務' : 'OBJECTIVES'}</span><strong data-objective-count>0/${QUEST_TOTAL}</strong>
        </button>
        <button class="pass-toggle" id="pass-toggle" type="button" aria-expanded="false" aria-controls="festival-pass">
          <span>${zh ? '通行證' : 'PASS'}</span><span>+</span>
        </button>
        <nav class="festival-pass" id="festival-pass" aria-label="Festival pass menu" hidden>
          <p class="festival-pass__title">${copy[this.language].menu}</p>
          ${Object.entries(panelLabels[this.language])
            .map(([id, label], index) => `<button type="button" data-panel="${id}"><span>${String(index + 1).padStart(2, '0')}</span>${label}${id === 'quests' ? `<small data-quest-count>0/${QUEST_TOTAL}</small>` : ''}</button>`)
            .join('')}
          <button type="button" class="festival-pass__fireworks" data-replay-fireworks hidden><span>★</span>${zh ? '重播煙火' : 'REPLAY FIREWORKS'}</button>
        </nav>
        <section class="panel" id="panel" aria-live="polite" hidden></section>
        <section class="venue-screen" id="venue-screen" aria-label="Private festival screening" hidden>
          <button class="venue-screen__close" type="button" data-screen-close aria-label="${zh ? '離開全螢幕' : 'Exit fullscreen'}">✕</button>
          <div class="venue-screen__frame" id="screen-frame"></div>
          <footer>
            <div><span id="screen-mode">PUBLIC SCREENING</span><strong id="screen-title">THE SHORE</strong></div>
            <div class="venue-screen__actions" id="screen-actions"></div>
          </footer>
        </section>
        <section class="public-seat-hud" id="public-seat-hud" hidden>
          <div><span id="public-seat-mode">THE SHORE · PUBLIC SCREENING</span><strong id="public-seat-title">NOW PLAYING</strong></div>
          <div>
            <button type="button" data-public-catalogue>${zh ? '片單' : 'CATALOGUE'}</button>
            <button type="button" data-public-fullscreen>${zh ? '放映全螢幕' : 'FULLSCREEN SCREENING'}</button>
            <button type="button" data-public-stand>${zh ? '起身' : 'STAND'}</button>
          </div>
        </section>
        <section class="seat-menu" id="seat-menu" aria-labelledby="seat-menu-title" hidden></section>
        <button class="interaction-toast" id="interaction-toast" type="button" hidden></button>
        <div class="world-alert" id="world-alert" role="status" hidden></div>
        <div class="touch-controls" aria-hidden="true">
          <div class="touch-stick" data-stick><span class="touch-stick__knob" data-stick-knob></span></div>
          <div class="touch-ring">
            <button type="button" class="touch-ring__hit" data-touch-act="punch" aria-label="${zh ? '出拳' : 'Punch'}">${zh ? '拳' : 'HIT'}</button>
            <button type="button" class="touch-ring__key touch-ring__key--a" data-touch-act="jump" aria-label="${zh ? '跳躍' : 'Jump'}">${zh ? '跳' : 'JUMP'}</button>
            <button type="button" class="touch-ring__key touch-ring__key--b" data-touch-act="run" aria-label="${zh ? '奔跑' : 'Run'}">${zh ? '跑' : 'RUN'}</button>
            <button type="button" class="touch-ring__key touch-ring__key--c" data-touch-act="dance" aria-label="${zh ? '跳舞' : 'Dance'}">${zh ? '舞' : 'DANCE'}</button>
            <button type="button" class="touch-ring__key touch-ring__key--d" data-touch-act="offer" aria-label="${zh ? '供養' : 'Offer'}">${zh ? '供' : 'OFFER'}</button>
            <button type="button" class="touch-ring__key touch-ring__key--e" data-touch-act="photo" aria-label="${zh ? '拍照' : 'Photo'}">${zh ? '影' : 'PHOTO'}</button>
          </div>
        </div>
        <section
          class="chat-stream"
          id="chat-stream"
          aria-label="${zh ? '三頻道即時留言' : 'Live comments from all channels'}"
          aria-live="polite"
          aria-atomic="false"
        ></section>
          <div class="controls-hint"><span>${zh ? '移動' : 'MOVE'}</span> WASD / ARROWS <span>${zh ? '奔跑' : 'RUN'}</span> SHIFT <span>${zh ? '互動' : 'INTERACT'}</span> E · SHIFT+E ${zh ? '抱起 MENTOR' : 'PICK UP MENTOR'} <span>${zh ? '跳躍' : 'JUMP'}</span> SPACE <span>${zh ? '跳舞' : 'DANCE'}</span> B <span>${zh ? '供養' : 'OFFER'}</span> O <span>${zh ? '視角' : 'LOOK'}</span> ${zh ? '拖曳滑鼠' : 'DRAG MOUSE'} · T <span>${zh ? '拍照' : 'PHOTO'}</span> C</div>
      </section>
    `;

    const canvas = this.root.querySelector<HTMLCanvasElement>('#world-canvas');
    const foregroundCanvas = this.root.querySelector<HTMLCanvasElement>('#world-foreground');
    const cssLayer = this.root.querySelector<HTMLElement>('#world-css3d');
    if (!canvas || !foregroundCanvas || !cssLayer) throw new Error('World rendering layers were not created.');
    this.renderChatStream();

    this.world = new FestivalWorld({
      canvas,
      foregroundCanvas,
      cssLayer,
      graphicsMode: this.graphicsMode,
      palette: this.palette,
      onSnapshot: (snapshot) => this.updateSnapshot(snapshot),
      onAction: (action) => this.handleWorldAction(action),
      onProjectorAdvance: (venue, youtubeId) => {
        if (this.festivalClient.online) {
          void this.festivalClient.advanceProgramme(venue, youtubeId);
          return;
        }
        // No service to keep the running order, so the venue moves its own on.
        this.programmeClock.advance(venue, this.localOrder(venue));
        this.syncPublicProjectors();
        if (this.screenMaximized && this.screenMode === 'public' && this.activeVenue === venue) {
          this.renderScreen(this.publicFilm(venue), 'public', 0, true);
        }
      },
      onProjectorDuration: (venue, youtubeId, seconds) => {
        this.programmeClock.learnDuration(youtubeId, seconds);
        // The service keeps every venue's programme moving whether or not
        // anybody is in the room, and it needs the lengths to do it.
        if (this.festivalClient.online) void this.festivalClient.reportTrackDuration(venue, youtubeId, seconds);
      },
    });
    this.world.setNpcProfiles(this.npcProfiles);
    this.world.start();
    this.syncPublicProjectors();
    const reviewTarget = new URLSearchParams(window.location.search).get('review');
    if (reviewTarget === 'mentor' || reviewTarget === 'mentor-carry' || reviewTarget === 'mentor-npc-carry') {
      this.world.focusMentorForReview(
        reviewTarget === 'mentor-carry' || reviewTarget === 'mentor-npc-carry',
        reviewTarget === 'mentor-npc-carry' ? 'KENNY' : undefined,
      );
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.mentorReviewSnapshot();
      window.setTimeout(() => {
        document.documentElement.dataset.mentorReview = JSON.stringify(this.world?.mentorReviewSnapshot());
      }, 250);
    } else if (reviewTarget === 'mentor-at-stand' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      this.world.focusMentorAtStandForReview();
      // Session recovery reconciles one last state after the gate closes and
      // clears the staged follower, so the fixture is laid again behind it —
      // and left callable, because how long that takes is not ours to know.
      for (const delay of [0, 400, 1200]) {
        window.setTimeout(() => this.world?.focusMentorAtStandForReview(), delay);
      }
      (window as Window & { __festivalRestage?: () => void }).__festivalRestage =
        () => this.world?.focusMentorAtStandForReview();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview =
        () => this.world?.mentorAtStandReviewSnapshot();
    } else if ((reviewTarget === 'mentor-follow' || reviewTarget === 'mentor-follow-greeting') && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      if (reviewTarget === 'mentor-follow-greeting') {
        this.world.focusMentorGreetingForReview();
        // Gate/session recovery can finish on the next task and reconcile one
        // last empty state. Restage the loopback-only fixture after that tick so
        // it always measures the intended loyal-dog-plus-guest arrangement.
        window.setTimeout(() => this.world?.focusMentorGreetingForReview(), 250);
      } else this.world.focusMentorFollowerForReview();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => reviewTarget === 'mentor-follow-greeting'
        ? this.world?.mentorGreetingReviewSnapshot()
        : this.world?.mentorFollowerReviewSnapshot();
      window.setInterval(() => {
        document.documentElement.dataset.mentorFollowerReview = JSON.stringify(reviewTarget === 'mentor-follow-greeting'
          ? this.world?.mentorGreetingReviewSnapshot()
          : this.world?.mentorFollowerReviewSnapshot());
      }, 250);
    } else if (reviewTarget === 'perf') {
      (window as Window & { __festivalPerf?: () => unknown }).__festivalPerf = () => this.world?.performanceSnapshot();
    } else if (reviewTarget === 'rooftop' || reviewTarget === 'rooftop-dj') {
      this.world.focusRooftopForReview(reviewTarget === 'rooftop-dj');
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.clubReviewSnapshot();
    } else if (reviewTarget === 'timetable' || reviewTarget === 'timetable-projector' ||
      reviewTarget === 'timetable-projector-close') {
      this.world.focusTimetableForReview(
        reviewTarget === 'timetable-projector' || reviewTarget === 'timetable-projector-close',
        reviewTarget === 'timetable-projector-close',
      );
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.timetableReviewSnapshot();
      window.setTimeout(() => {
        document.documentElement.dataset.timetableReview = JSON.stringify(this.world?.timetableReviewSnapshot());
      }, 500);
    } else if (reviewTarget === 'projector-front' || reviewTarget === 'projector-rear') {
      this.world.focusProjectorSideForReview(reviewTarget === 'projector-rear');
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () =>
        this.world?.projectorSideReviewSnapshot();
      window.setTimeout(() => {
        document.documentElement.dataset.projectorSideReview = JSON.stringify(
          this.world?.projectorSideReviewSnapshot(),
        );
      }, 500);
    } else if (reviewTarget === 'celestial') {
      this.world.focusCelestialForReview();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.celestialReviewSnapshot();
      window.setTimeout(() => {
        document.documentElement.dataset.celestialReview = JSON.stringify(this.world?.celestialReviewSnapshot());
      }, 500);
    } else if (reviewTarget === 'fireworks' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      this.world.focusCelestialForReview();
      this.world.startFireworks();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.fireworksReviewSnapshot();
      window.setInterval(() => {
        document.documentElement.dataset.fireworksReview = JSON.stringify(this.world?.fireworksReviewSnapshot());
      }, 400);
    } else if ((reviewTarget === 'quests' || reviewTarget === 'quests-complete') && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      if (reviewTarget === 'quests-complete') QUESTS.forEach((quest) => this.completeQuest(quest.id));
      this.openPanel('quests');
      const questReview = () => ({
        completed: this.completedQuests.size,
        total: QUEST_TOTAL,
        replayUnlocked: this.questCelebrated,
      });
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = questReview;
      document.documentElement.dataset.questReview = JSON.stringify(questReview());
    } else if (reviewTarget === 'private-screening' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      const film = this.allFilms()[0];
      if (film) this.startPrivateScreening(film);
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => ({
        screenMode: this.screenMode,
        screenMaximized: this.screenMaximized,
        nativeFullscreenElement: this.fullscreenElement()?.id ?? null,
        screenHidden: this.root.querySelector<HTMLElement>('#venue-screen')?.hidden,
      });
    } else if (reviewTarget === 'mobile-screening-controls' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      this.world.focusPublicScreeningForReview();
      this.startPublicScreening(true);
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => {
        const stick = this.root.querySelector<HTMLElement>('.touch-stick');
        const hit = this.root.querySelector<HTMLElement>('.touch-ring__hit');
        const actionKeys = [...this.root.querySelectorAll<HTMLElement>('.touch-ring__key:not(.touch-ring__key--e)')];
        const camera = this.root.querySelector<HTMLElement>('.touch-ring__key--e');
        const screeningBar = this.root.querySelector<HTMLElement>('#public-seat-hud');
        const pass = this.root.querySelector<HTMLElement>('#pass-toggle');
        const cameraBox = camera?.getBoundingClientRect();
        const barBox = screeningBar?.getBoundingClientRect();
        const passBox = pass?.getBoundingClientRect();
        const overlaps = Boolean(cameraBox && barBox && !(
          cameraBox.right <= barBox.left || cameraBox.left >= barBox.right ||
          cameraBox.bottom <= barBox.top || cameraBox.top >= barBox.bottom
        ));
        return {
          stickDisplay: stick ? getComputedStyle(stick).display : null,
          hitDisplay: hit ? getComputedStyle(hit).display : null,
          actionKeyDisplays: actionKeys.map((key) => getComputedStyle(key).display),
          cameraDisplay: camera ? getComputedStyle(camera).display : null,
          cameraBox: cameraBox ? { x: cameraBox.x, y: cameraBox.y, width: cameraBox.width, height: cameraBox.height } : null,
          screeningBarBox: barBox ? { x: barBox.x, y: barBox.y, width: barBox.width, height: barBox.height } : null,
          passBox: passBox ? { x: passBox.x, y: passBox.y, width: passBox.width, height: passBox.height } : null,
          cameraPassBottomDelta: cameraBox && passBox ? cameraBox.bottom - passBox.bottom : null,
          cameraPassHeightDelta: cameraBox && passBox ? cameraBox.height - passBox.height : null,
          overlaps,
        };
      };
    } else if (reviewTarget === 'menu-ownership' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      this.openDjRequest(this.npcName('XIEHGAN'), 'club');
      this.openSeatMenu('SHORE-REVIEW', 'shore');
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => {
        const menu = this.root.querySelector<HTMLElement>('#seat-menu');
        return {
          owner: menu?.dataset.menuOwner ?? null,
          title: menu?.querySelector<HTMLElement>('#seat-menu-title')?.textContent ?? null,
          djStateCleared: !this.openDjBooth,
        };
      };
    } else if (reviewTarget === 'gate' || reviewTarget === 'gate-approach') {
      this.world.focusGateForReview(reviewTarget === 'gate-approach');
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.structureReviewSnapshot();
    } else if (reviewTarget === 'temple' || reviewTarget === 'temple-altar') {
      this.world.focusTempleForReview(reviewTarget === 'temple-altar');
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.structureReviewSnapshot();
    } else if (reviewTarget === 'jukebox-sound' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      this.world.focusJukeboxForReview();
      this.jukeboxVolume = DEFAULT_JUKEBOX_VOLUME;
      this.jukeboxPlayingId = 'review-jukebox-track';
      window.setTimeout(() => {
        this.audioMuted = false;
        this.jukeboxSilenced = false;
        this.updateJukeboxSoundPrompt();
        document.documentElement.dataset.jukeboxSoundReview = JSON.stringify({
          volume: this.jukeboxVolume,
          promptHidden: this.root.querySelector<HTMLButtonElement>('[data-jukebox-sound]')?.hidden,
        });
      }, 0);
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => ({
        volume: this.jukeboxVolume,
        promptHidden: this.root.querySelector<HTMLButtonElement>('[data-jukebox-sound]')?.hidden,
        promptText: this.root.querySelector<HTMLButtonElement>('[data-jukebox-sound]')?.textContent,
      });
    } else if (reviewTarget === 'jukebox') {
      this.world.focusJukeboxForReview();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.structureReviewSnapshot();
    } else if (reviewTarget === 'club-bar') {
      this.world.focusClubBarForReview();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.barReviewSnapshot();
    } else if (reviewTarget === 'club-lobby') {
      this.world.focusClubLobbyForReview();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.clubReviewSnapshot();
    } else if (reviewTarget === 'nav' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview =
        () => this.world?.navReviewSnapshot();
      (window as Window & { __festivalResidents?: () => unknown }).__festivalResidents =
        () => this.world?.residentsReviewSnapshot();
    } else if (reviewTarget === 'mentor-wedged' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      this.world.focusMentorWedgedForReview();
      (window as Window & { __festivalRestage?: () => void }).__festivalRestage =
        () => this.world?.focusMentorWedgedForReview();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview =
        () => this.world?.mentorWedgedReviewSnapshot();
    } else if (reviewTarget === 'club-stair') {
      this.world.focusClubStairForReview();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.clubReviewSnapshot();
      (window as Window & { __festivalRegulars?: () => unknown }).__festivalRegulars =
        () => this.world?.clubRegularsReviewSnapshot();
    } else if (reviewTarget === 'club' || reviewTarget === 'club-dj') {
      this.world.focusClubForReview(reviewTarget === 'club-dj');
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.clubReviewSnapshot();
      window.setTimeout(() => {
        document.documentElement.dataset.clubReview = JSON.stringify(this.world?.clubReviewSnapshot());
      }, 400);
    } else if (reviewTarget === 'npc-control' || reviewTarget === 'npc-popcorn-seat') {
      if (reviewTarget === 'npc-popcorn-seat') this.world.focusNpcPopcornForReview();
      (window as Window & { __festivalReview?: () => unknown }).__festivalReview = () => this.world?.npcControlReviewSnapshot();
      window.setTimeout(() => {
        document.documentElement.dataset.npcControlReview = JSON.stringify(this.world?.npcControlReviewSnapshot());
      }, 250);
    }
    this.audioMuted = muted;
    void this.world.audio.start(muted);
    // Loopback review routes are deterministic visual fixtures. Keeping them
    // offline prevents a persisted STAFF impersonation from replacing the
    // controlled avatar while a carry/geometry snapshot is being inspected.
    if (!reviewTarget) void this.festivalClient.connect(this.currentId, this.palette);

    const passToggle = this.root.querySelector<HTMLButtonElement>('#pass-toggle');
    const pass = this.root.querySelector<HTMLElement>('#festival-pass');
    passToggle?.addEventListener('click', () => {
      const isOpen = passToggle.getAttribute('aria-expanded') === 'true';
      passToggle.setAttribute('aria-expanded', String(!isOpen));
      if (pass) pass.hidden = isOpen;
      passToggle.querySelector('span:last-child')!.textContent = isOpen ? '+' : '−';
      if (!isOpen) this.completeQuest('pass');
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((button) => {
      button.addEventListener('click', () => this.openPanel(button.dataset.panel as PanelId));
    });
    this.root.querySelector<HTMLButtonElement>('[data-replay-fireworks]')?.addEventListener('click', () => {
      if (!this.questCelebrated) return;
      this.closeFestivalPass();
      this.world?.startFireworks();
      this.showWorldAlert(this.language === 'zh-TW' ? '煙火再次升空' : 'FIREWORKS LAUNCHED AGAIN');
    });

    // Delegated rather than bound to the element: the prompt is re-rendered as
    // the world changes around it, and a listener put on the button that was
    // there at start-up is lost the first time that happens — which is why
    // tapping the prompt did nothing at all on a phone, where tapping it is the
    // only way to reach what it offers.
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('#interaction-toast')) return;
      // A hold has already done the other half and cleared the tap.
      if (this.promptHeld) {
        this.promptHeld = false;
        return;
      }
      this.world?.triggerPrompt();
    });

    // Tap for the first thing the prompt offers, hold for the second. Only
    // MENTOR offers two — a treat on a tap, the dog in your arms on a hold —
    // and SHIFT+E, which is how a keyboard says it, is unsayable on a phone.
    this.root.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('#interaction-toast')) return;
      if (!this.world?.hasSecondaryPrompt()) return;
      const toast = this.root.querySelector<HTMLElement>('#interaction-toast');
      window.clearTimeout(this.promptHoldTimer);
      this.promptHoldTimer = window.setTimeout(() => {
        this.promptHeld = true;
        toast?.classList.remove('is-holding');
        this.world?.triggerSecondaryPrompt();
      }, PROMPT_HOLD_MS);
      toast?.classList.add('is-holding');
    });
    for (const done of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      this.root.addEventListener(done, (event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest('#interaction-toast')) return;
        window.clearTimeout(this.promptHoldTimer);
        this.root.querySelector<HTMLElement>('#interaction-toast')?.classList.remove('is-holding');
      });
    }
    window.addEventListener('keydown', this.globalShortcut);
    window.addEventListener('pointerup', this.liftJukeboxOnGesture, true);
    document.addEventListener('fullscreenchange', this.syncScreenFullscreenState);
    document.addEventListener('webkitfullscreenchange', this.syncScreenFullscreenState);
    this.root.querySelector<HTMLButtonElement>('[data-jukebox-sound]')?.addEventListener('click', () => {
      this.jukeboxSoundConfirmed = true;
      this.applyJukeboxVolume();
      // Again a moment later: the player can accept the connection a beat after
      // it is spoken to, and the press is the only permission we will get.
      window.setTimeout(() => this.applyJukeboxVolume(), 400);
      this.updateJukeboxSoundPrompt();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.applyJukeboxVolume();
    });
    // Pinching the page is allowed — it is the only way back from a browser
    // that has decided to zoom on its own — but once zoomed there is no obvious
    // way to say "put it back". This appears when the page is scaled and does
    // exactly that.
    const viewport = window.visualViewport;
    if (viewport) {
      const watchScale = () => {
        const button = this.root.querySelector<HTMLButtonElement>('[data-zoom-reset]');
        if (button) button.hidden = viewport.scale <= 1.02;
        // How much of the window the on-screen keyboard is standing on. A phone
        // shrinks what you can see when the keys come up but leaves the page
        // believing it still has the whole window, so a panel measured against
        // the window keeps its full height and puts the box you are typing in
        // underneath the keyboard. Handed to the stylesheet so anything pinned
        // to the bottom can sit on top of the keys instead of behind them.
        const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(covered)}px`);
        // Flagged as well as measured, so the layout can give up whatever it can
        // spare while the keys are standing on most of the screen. Eighty is
        // past anything a browser's own furniture accounts for.
        if (covered > 80) document.documentElement.dataset.keyboard = 'up';
        else delete document.documentElement.dataset.keyboard;
      };
      viewport.addEventListener('resize', watchScale);
      viewport.addEventListener('scroll', watchScale);
      watchScale();
    }
    this.root.querySelector<HTMLButtonElement>('[data-zoom-reset]')?.addEventListener('click', () => {
      this.resetPageZoom();
    });
    const stick = this.root.querySelector<HTMLElement>('[data-stick]');
    const knob = this.root.querySelector<HTMLElement>('[data-stick-knob]');
    if (stick && knob) {
      // The stick reads as a direction and a distance, both taken from where
      // the thumb is relative to where it first landed. Below a tenth it reads
      // as nothing, so resting a thumb on the pad is not walking.
      let holding = -1;
      let originX = 0;
      let originY = 0;
      const reach = 46;
      const release = () => {
        holding = -1;
        knob.style.transform = '';
        this.world?.setMovementVector(0, 0);
      };
      stick.addEventListener('pointerdown', (event) => {
        holding = event.pointerId;
        originX = event.clientX;
        originY = event.clientY;
        stick.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      stick.addEventListener('pointermove', (event) => {
        if (event.pointerId !== holding) return;
        const dx = event.clientX - originX;
        const dy = event.clientY - originY;
        const distance = Math.hypot(dx, dy);
        const scale = distance > reach ? reach / distance : 1;
        knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
        const strength = Math.min(distance / reach, 1);
        if (strength < 0.1) {
          this.world?.setMovementVector(0, 0);
          return;
        }
        const angle = Math.atan2(dy, dx);
        // Screen down is forwards, which is what -vertical means to the world.
        this.world?.setMovementVector(Math.cos(angle) * strength, Math.sin(angle) * strength);
      });
      for (const done of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        stick.addEventListener(done, release);
      }
    }
    // Run is the one that holds — it is a shift key, not a press. The rest
    // fire once, on the way down, so they answer as fast as a keyboard does.
    this.root.querySelector<HTMLButtonElement>('[data-camera-step]')?.addEventListener('click', () => {
      this.cycleViewMode();
    });
    // Clearing the frame is a decision, and so is getting it back. This takes
    // the filter tab and the way out off the picture together; a press on the
    // frame itself is what returns them.
    this.root.querySelector<HTMLButtonElement>('[data-camera-hide]')?.addEventListener('click', () => {
      this.setCameraControlsHidden(!this.cameraHidden);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-touch-act]').forEach((button) => {
      const act = button.dataset.touchAct;
      const hold = act === 'run';
      const end = () => {
        if (!hold) return;
        button.classList.remove('is-active');
        this.world?.setRunning(false);
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        button.classList.add('is-active');
        if (act === 'jump') this.world?.jumpFromTouch();
        else if (act === 'punch') this.world?.punchFromTouch();
        else if (act === 'dance') this.world?.toggleDancing();
        else if (act === 'offer') this.world?.offerFromTouch();
        else if (act === 'photo') this.cycleViewMode();
        else if (act === 'run') this.world?.setRunning(true);
        if (!hold) window.setTimeout(() => button.classList.remove('is-active'), 160);
      });
      for (const done of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        button.addEventListener(done, end);
      }
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
      const key = button.dataset.move as 'w' | 'a' | 's' | 'd';
      const setActive = (active: boolean) => {
        button.classList.toggle('is-active', active);
        this.world?.setMovementKey(key, active);
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        setActive(true);
      });
      button.addEventListener('pointerup', () => setActive(false));
      button.addEventListener('pointercancel', () => setActive(false));
      button.addEventListener('lostpointercapture', () => setActive(false));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-postcard-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        this.postcardFilter = button.dataset.postcardFilter ?? 'none';
        const shell = this.root.querySelector<HTMLElement>('.world-shell');
        if (shell) shell.dataset.filter = this.postcardFilter;
        this.root.querySelectorAll<HTMLButtonElement>('[data-postcard-filter]')
          .forEach((other) => other.classList.toggle('is-active', other === button));
        // The tab is the only part of this left in the picture, so it says
        // which look is on rather than something generic like FILTER.
        const tab = this.root.querySelector<HTMLElement>('[data-postcard-tab]');
        if (tab) tab.textContent = button.textContent;
        // Let go, so the menu tucks itself away instead of sitting open under
        // a pointer that has stopped moving.
        button.blur();
      });
    });
    this.root.querySelector<HTMLButtonElement>('[data-public-catalogue]')?.addEventListener('click', () => this.openFilmPicker(this.activeVenue));
    this.root.querySelector<HTMLButtonElement>('[data-public-fullscreen]')?.addEventListener('click', () => {
      this.openPublicScreenFullscreen();
    });
    // The only way out of a filled screen used to be Escape, or a button in a
    // row that scrolls sideways off the edge of a phone. Neither is reachable
    // with a thumb, so a full screening was a room with the door painted over.
    this.root.querySelector<HTMLButtonElement>('[data-screen-close]')?.addEventListener('click', () => {
      void this.setScreenMaximized(false);
    });
    // Standing up is its own action. Routing it through interact() meant that at
    // the bar, where plain E orders a round, the STAND button bought a drink.
    this.root.querySelector<HTMLButtonElement>('[data-public-stand]')?.addEventListener('click', () => this.world?.forceStand());
    window.addEventListener('pagehide', (event) => {
      this.resetQuestProgress();
      if (event.persisted) {
        this.festivalClient.suspend();
        return;
      }
      this.pausePrivateScreening();
      window.removeEventListener('keydown', this.globalShortcut);
      document.removeEventListener('fullscreenchange', this.syncScreenFullscreenState);
      document.removeEventListener('webkitfullscreenchange', this.syncScreenFullscreenState);
      if (this.programmeTimer) window.clearInterval(this.programmeTimer);
      void this.festivalClient.disconnect();
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) this.festivalClient.resume();
    });
    this.startNpcChat();
    this.syncProgrammeBoard(true);
    this.programmeTimer = window.setInterval(() => this.syncProgrammeBoard(), 1_000);
  }

  private updateSnapshot(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    if (snapshot.moving) this.completeQuest('walk');
    if (snapshot.moving && snapshot.running) this.completeQuest('run');
    if (snapshot.cameraMode !== 'follow' && snapshot.cameraMode !== 'screening') this.completeQuest('camera');
    if (snapshot.location === 'THE PALACE') this.completeQuest('palace');
    if (snapshot.location === 'DRIVE-IN 88') this.completeQuest('drive-in');
    if (snapshot.location === 'THE SHORE' || snapshot.location === 'MEDITERRANEAN SEA') this.completeQuest('shore');
    if (snapshot.location === 'THE BASEMENT') this.completeQuest('basement');
    if (snapshot.location === 'THE ROOFTOP') this.completeQuest('rooftop');
    const location = this.root.querySelector<HTMLElement>('#location-label');
    const clock = this.root.querySelector<HTMLElement>('#festival-clock');
    const phase = this.root.querySelector<HTMLElement>('#phase-label');
    const toast = this.root.querySelector<HTMLButtonElement>('#interaction-toast');
    const inventory = this.root.querySelector<HTMLElement>('#inventory-status');
    if (location) location.textContent = this.localizeLocation(snapshot.location);
    if (clock) {
      clock.textContent = new Intl.DateTimeFormat(this.language, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date());
    }
    if (phase) {
      const phaseNames = this.language === 'zh-TW'
        ? { dawn: '晨曦', morning: '上午', daylight: '日光', 'golden-hour': '黃金時刻', sunset: '日落', 'blue-hour': '藍調時刻', night: '夜晚' }
        : { dawn: 'DAWN', morning: 'MORNING', daylight: 'DAYLIGHT', 'golden-hour': 'GOLDEN HOUR', sunset: 'SUNSET', 'blue-hour': 'BLUE HOUR', night: 'NIGHT' };
      const cameraNames = this.language === 'zh-TW'
        ? { follow: '跟隨鏡頭', perspective: '視角鏡頭', 'first-person': '第一人稱', screening: '觀影鏡頭' }
        : { follow: 'FOLLOW CAMERA', perspective: 'PERSPECTIVE CAMERA', 'first-person': 'FIRST PERSON', screening: 'SCREENING CAMERA' };
      phase.textContent = `${phaseNames[snapshot.dayNight.phase]} · ${cameraNames[snapshot.cameraMode]}`;
    }
    if (toast) {
      // Theater screens already carry a persistent STAND button, so repeating
      // E / STAND UP over the film is clutter. Other seated prompts stay: the
      // basement bar still needs this button for ordering and drinking on a
      // phone, where no keyboard shortcut exists.
      const redundantTheaterStandPrompt = Boolean(
        snapshot.inTheater && snapshot.playerState === 'seated' && snapshot.interaction?.startsWith('E / STAND UP'),
      );
      toast.hidden = !snapshot.interaction || redundantTheaterStandPrompt;
      toast.textContent = this.promptForTouch(this.localizeInteraction(snapshot.interaction ?? ''));
      toast.classList.toggle('is-actionable', snapshot.canInteract);
      // The DJ prompt has its own mobile slot on the pass row. Tag the raw
      // interaction before localization so both languages share one reliable
      // layout hook without coupling CSS to translated copy.
      toast.classList.toggle(
        'interaction-toast--dj',
        Boolean(snapshot.interaction?.startsWith('E / REQUEST A TRACK FROM')),
      );
      toast.disabled = !snapshot.canInteract;
      // MENTOR is the one prompt that offers two things, and the second is
      // behind a key a phone does not have. It gets its own button.
      // The prompt says so itself rather than a second button saying it.
      toast.classList.toggle('is-holdable', Boolean(snapshot.canInteract && this.world?.hasSecondaryPrompt()));
    }
    if (inventory) {
      const chips = [
        this.language === 'zh-TW'
          ? ({ walking: '步行', seated: '已入座', swimming: '游泳中' } as const)[snapshot.playerState]
          : snapshot.playerState.toUpperCase(),
        snapshot.outfit === 'swimwear' ? (this.language === 'zh-TW' ? '泳裝' : 'SWIMWEAR') : undefined,
        snapshot.carriedItem === 'POPCORN' ? (this.language === 'zh-TW' ? '手拿爆米花' : 'HOLDING POPCORN') : undefined,
        snapshot.carriedItem === 'DRINK' ? (this.language === 'zh-TW' ? '手拿調酒' : 'HOLDING A DRINK') : undefined,
        snapshot.carriedItem === 'HOTDOG' ? (this.language === 'zh-TW' ? '手拿熱狗' : 'HOLDING A HOT DOG') : undefined,
        snapshot.carriedItem === 'PIZZA' ? (this.language === 'zh-TW' ? '手拿披薩' : 'HOLDING PIZZA') : undefined,
        snapshot.carriedItem === 'CHICKEN' ? (this.language === 'zh-TW' ? '手拿炸雞' : 'HOLDING FRIED CHICKEN') : undefined,
        snapshot.carriedItem === 'MENTOR' ? (this.language === 'zh-TW' ? `頭頂 ${this.mentorName()}` : `CARRYING ${this.mentorName()}`) : undefined,
        snapshot.stowedItem ? (this.language === 'zh-TW' ? '爆米花已收起' : `${snapshot.stowedItem} STOWED`) : undefined,
        snapshot.hasPamphlet ? (this.language === 'zh-TW' ? '影展手冊' : 'PAMPHLET') : undefined,
        `${snapshot.npcCount} NPC`,
      ].filter(Boolean);
      inventory.innerHTML = chips.map((chip) => `<span>${chip}</span>`).join('');
    }
    this.syncVenueScreen(snapshot);
    this.syncJukebox();
    void this.festivalClient.publishPresence({
      x: snapshot.x,
      y: snapshot.y,
      z: snapshot.z,
      rotation: snapshot.rotation,
      location: snapshot.location,
      state: snapshot.playerState,
      moving: snapshot.moving,
      running: snapshot.running,
      venue: snapshot.screeningVenue,
      gesture: snapshot.gesture,
      carriedItem: snapshot.carriedItem,
    }, this.palette).catch(() => undefined);
  }

  private handleWorldAction(action: WorldAction): void {
    if (action.type === 'jump') this.completeQuest('jump');
    if (action.type === 'dance' && action.active) this.completeQuest('dance');
    if (action.type === 'greet') this.completeQuest('greet');
    if (action.type === 'treat') this.completeQuest('feed-mentor');
    if (action.type === 'mentor' && action.active) this.completeQuest('carry-mentor');
    if (action.type === 'ate') this.completeQuest('eat');
    if (action.type === 'drank') this.completeQuest('drink');
    if (action.type === 'jukebox') this.completeQuest('jukebox');
    if (action.type === 'pamphlet') this.completeQuest('pamphlet');
    if (action.type === 'programme') this.completeQuest('programme');
    if (action.type === 'donate' && !action.target) this.completeQuest('offering');
    if (action.type === 'seated' && action.seatId.startsWith('CLUB-')) {
      this.activeSeatId = action.seatId;
      this.closeFestivalPass();
      if (this.festivalClient.online) void this.confirmSeatClaim(action.seatId);
      // No reminder here. Sitting down always puts a prompt on screen — the
      // seated branch of the world's own labelling has no path that returns
      // nothing — so this said, in a second box a moment later, whatever the
      // prompt was already saying. Two boxes for one action, close enough
      // together to touch. The prompt is the better of the two: it is where
      // every other action is offered, and on a phone it is the thing you
      // press.
      return;
    }
    if (action.type === 'seated') {
      this.completeQuest('public-screening');
      this.activeVenue = action.venue;
      this.activeSeatId = action.seatId;
      this.closeFestivalPass();
      const panel = this.root.querySelector<HTMLElement>('#panel');
      if (panel) panel.hidden = true;
      this.openSeatMenu(action.seatId, action.venue);
      if (this.festivalClient.online) void this.confirmSeatClaim(action.seatId);
      return;
    }
    if (action.type === 'seatUnavailable') {
      this.showWorldAlert(`${action.seatId} · ${this.language === 'zh-TW' ? '已有觀影者' : 'OCCUPIED BY ANOTHER ATTENDEE'}`);
      return;
    }
    if (action.type === 'stood') {
      const releasedSeat = this.activeSeatId;
      this.pausePrivateScreening();
      this.hideSeatMenu();
      this.hidePublicSeatHud();
      if (this.snapshot?.inTheater) this.startPublicScreening(false);
      else this.hideVenueScreen();
      if (this.festivalClient.online && releasedSeat !== 'CURRENT SEAT') {
        void this.festivalClient.releaseSeat(releasedSeat);
      }
      this.activeSeatId = 'CURRENT SEAT';
      return;
    }
    if (action.type === 'food') {
      // Nothing to announce. The prompt already offers to eat whatever has just
      // been picked up, and names it — so a second box saying the same thing is
      // one of two telling you one thing. The table of names went with it.
      return;
    }
    if (action.type === 'ate') {
      this.showWorldAlert(this.language === 'zh-TW' ? '吃完了' : 'FINISHED IT');
      return;
    }
    if (action.type === 'mentor') {
      const mentorName = this.mentorName();
      if (action.active) {
        if (this.festivalClient.online) {
          void this.festivalClient.claimMentor().then((result) => {
            if (result.ok) return;
            this.world?.rejectMentorCarry();
            this.showWorldAlert(result.message ?? (this.language === 'zh-TW' ? `${mentorName} 已被其他人抱起` : `${mentorName} IS ALREADY BEING CARRIED`));
          });
        }
        this.showWorldAlert(action.discardedPopcorn
          ? (this.language === 'zh-TW' ? `已抱起 ${mentorName} · 爆米花已丟棄` : `${mentorName} PICKED UP · POPCORN DISCARDED`)
          : (this.language === 'zh-TW' ? `已抱起 ${mentorName}` : `${mentorName} PICKED UP`));
      } else {
        if (this.festivalClient.online) {
          void this.festivalClient.releaseMentor().then((result) => {
            if (result.ok) return;
            this.world?.restoreMentorCarry();
            this.showWorldAlert(result.message ?? (this.language === 'zh-TW' ? '無法放下 MENTOR' : 'MENTOR COULD NOT BE RELEASED'));
          });
        }
        this.showWorldAlert(this.language === 'zh-TW' ? `${mentorName} 已放回地面` : `${mentorName} IS BACK ON THE GROUND`);
      }
      return;
    }
    if (action.type === 'jukebox') {
      this.openPanel('jukebox');
      return;
    }
    if (action.type === 'shop') {
      const zh = this.language === 'zh-TW';
      const link = this.networkState?.shopLink;
      // Only ever an http(s) address, re-checked here as well as on the
      // service: this string is handed straight to the browser to follow, and
      // the world can be run against a service we do not control.
      const safe = (() => {
        if (!link?.url) return '';
        try {
          const parsed = new URL(link.url);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
        } catch {
          return '';
        }
      })();
      if (!safe) {
        this.showWorldAlert(zh ? '快閃服飾店即將開幕' : 'THE POP-UP STORE OPENS SOON');
        return;
      }
      const name = zh ? (link?.labelZh || '快閃服飾店') : (link?.label || 'THE POP-UP STORE');
      this.showWorldAlert(zh ? `正在開啟 ${name}` : `OPENING ${name}`);
      window.open(safe, '_blank', 'noopener,noreferrer');
      return;
    }
    if (action.type === 'pamphlet') {
      this.openPanel('pamphlet');
      return;
    }
    if (action.type === 'swim') {
      this.showWorldAlert(action.active
        ? (action.stowedPopcorn
          ? (this.language === 'zh-TW' ? '已換泳裝 · 爆米花已收起' : 'SWIMWEAR ON · POPCORN STOWED')
          : (this.language === 'zh-TW' ? '已換泳裝' : 'SWIMWEAR ON'))
        : (this.language === 'zh-TW' ? '已換回影展服裝' : 'FESTIVAL OUTFIT RESTORED'));
      return;
    }
    if (action.type === 'treat') {
      if (this.festivalClient.online) {
        void this.festivalClient.feedMentor().then((result) => {
          if (!result.ok) this.showWorldAlert(result.message ?? (this.language === 'zh-TW' ? '餵食未能記錄' : 'FEED COULD NOT BE RECORDED'));
        });
      }
      this.showWorldAlert(this.language === 'zh-TW'
        ? `正在餵 ${action.target} 吃點心`
        : `GIVING ${action.target} A TREAT`);
      return;
    }
    if (action.type === 'greet') {
      this.showWorldAlert(action.gesture === 'tail-wag'
        ? (this.language === 'zh-TW' ? `向 ${action.target} 搖尾巴` : `WAGGING TAIL AT ${action.target}`)
        : `${this.language === 'zh-TW' ? '向' : 'WAVING TO'} ${action.target}${this.language === 'zh-TW' ? '揮手' : ''}`);
      return;
    }
    if (action.type === 'punch') {
      const zh = this.language === 'zh-TW';
      // Landing one on another attendee deserves the same confirmation as
      // landing one on a resident. struck is the resident's name; targetId is
      // set when the thrower had another attendee in front of them.
      this.flashImpact(action.struck || action.targetId ? '2' : undefined);
      // A resident is settled here and now; another attendee is the service's
      // call, so that answer arrives a moment later and outranks this one.
      if (action.struck) {
        this.showWorldAlert(zh ? `打中了 ${action.struck}` : `LANDED ONE ON ${action.struck}`);
      }
      void this.festivalClient.throwPunch(action.targetId).then((result) => {
        if (!result.hit) return;
        this.showWorldAlert(zh ? `打中了 ${result.hit.name}` : `LANDED ONE ON ${result.hit.name}`);
      });
      return;
    }
    if (action.type === 'died') {
      const zh = this.language === 'zh-TW';
      this.flashImpact('1');
      this.showDeath(action.by);
      this.showWorldAlert(action.by
        ? (zh ? `你被 ${action.by} 打倒了` : `${action.by} PUT YOU DOWN`)
        : (zh ? '你倒下了' : 'YOU WENT DOWN'));
      return;
    }
    if (action.type === 'punched') {
      const zh = this.language === 'zh-TW';
      this.flashImpact('1');
      const from = action.by ? (zh ? `被 ${action.by} 打中` : `${action.by} LANDED ONE ON YOU`) : (zh ? '被打中了' : 'YOU TOOK ONE');
      this.showWorldAlert(action.droppedMentor
        ? (zh ? `${from} · MENTOR 掉了` : `${from} — YOU DROPPED MENTOR`)
        : from);
      return;
    }
    if (action.type === 'donate') {
      const zh = this.language === 'zh-TW';
      if (!action.target) {
        const deity = action.deity ?? '美麗本人';
        this.showWorldAlert(zh ? `向${deity}獻上供養` : `AN OFFERING TO ${deity}`);
        return;
      }
      this.showWorldAlert(zh ? `向 ${action.target} 佈施` : `AN OFFERING TO ${action.target}`);
      // They bow back in the world and answer here, in whichever language the
      // giver is reading.
      const thanks = zh
        ? ['謝謝你，願你平安。', '有心了，感激不盡。', '這份心意我收下了。']
        : ['Thank you — may it come back to you.', 'That is kind of you.', 'I accept it with thanks.'];
      this.chatMessages = [...this.chatMessages, {
        id: `npc-thanks-${Date.now()}`,
        author: action.target,
        channel: 'NEARBY' as ChatChannel,
        text: thanks[Math.floor(Math.random() * thanks.length)],
        timestamp: Date.now(),
        npc: true,
      }].slice(-100);
      this.renderChatStream();
      return;
    }
    if (action.type === 'dance') {
      this.showWorldAlert(action.active
        ? (this.language === 'zh-TW' ? '開始跳舞 · 移動即停止' : 'DANCING · MOVE TO STOP')
        : (this.language === 'zh-TW' ? '停止跳舞' : 'STOPPED DANCING'));
      return;
    }
    if (action.type === 'drinkOrdered') {
      // The prompt turns to DRINK UP the moment the glass is in hand, so a box
      // saying the same thing is the second of two telling you one thing.
      return;
    }
    if (action.type === 'drank') {
      this.showWorldAlert(action.drunk
        ? (this.language === 'zh-TW' ? `第 ${action.drinks} 杯 · 房間開始晃了` : `THAT IS ${action.drinks} · THE ROOM IS MOVING`)
        : (this.language === 'zh-TW' ? `喝了第 ${action.drinks} 杯` : `DRINK ${action.drinks} DOWN`));
      return;
    }
    if (action.type === 'dj') {
      this.activeVenue = action.venue;
      this.openDjRequest(action.name, action.venue);
      return;
    }
    if (action.type === 'programme') {
      this.openPanel('programme');
      return;
    }
  }

  private syncVenueScreen(snapshot: WorldSnapshot): void {
    this.activeVenue = snapshot.screeningVenue;
    this.syncPublicProjectors();
    this.world?.setPublicScreenMuted(
      snapshot.inTheater ? snapshot.screeningVenue : undefined,
      this.audioMuted || !snapshot.inTheater || this.screenMaximized ||
        (this.screenMode === 'private' && this.privateScreenOpen()),
    );
    if (this.screenMode === 'private' && (snapshot.playerState === 'seated' || this.privateScreenOpen())) return;
    if (this.screenMaximized && snapshot.playerState === 'seated') return;
    const seatMenuOpen = !this.root.querySelector<HTMLElement>('#seat-menu')?.hidden;
    if (snapshot.inTheater) {
      if (!this.screenMode) this.startPublicScreening(false);
      if (snapshot.playerState === 'seated' && !seatMenuOpen && this.screenMode === 'public') this.showPublicSeatHud();
      else if (snapshot.playerState !== 'seated') this.hidePublicSeatHud();
    } else if (snapshot.playerState !== 'seated') {
      this.hideVenueScreen();
      this.hidePublicSeatHud();
    }
  }

  /**
   * The club strobes to the tempo recorded for whatever it is playing, phased
   * from the same service clock the programme uses, so the flashes land on the
   * same beat for everyone in the room.
   */
  private syncClubBeat(): void {
    const schedule = this.networkState?.schedule?.club;
    const youtubeId = this.publicFilm('club').youtubeId;
    const bpm = this.networkState?.trackTempos?.[youtubeId] ?? 120;
    this.world?.setClubBeat(bpm, schedule?.startedAt ?? 0);
  }

  private syncPublicProjectors(): void {
    // While the session is still being established the programme clock is
    // unknown. Loading now would start every work at zero and only correct
    // itself on a second load, so wait for the service or for offline play.
    if (this.connectionStatus === 'connecting' && !this.networkState) return;
    for (const venue of VENUE_KEYS) {
      const film = this.publicFilm(venue);
      const schedule = this.networkState?.schedule?.[venue];
      this.world?.setVenueName(venue, this.venueName(venue), this.venueSubtitle(venue));
      // The service (or ProgrammeClock while offline) is the one sequencer.
      // Giving YouTube a playlist as well let its iframe move first, then
      // report the next work's duration while projector.youtubeId still named
      // the previous one. That poisoned the shared duration table and made the
      // service cut longer films off at the wrongly learned time.
      this.world?.setPublicScreening(venue, film, this.publicOffset(venue), `${schedule?.updatedAt ?? 0}|${schedule?.startedAt ?? 0}`);
      this.world?.setPublicScreenPaused(venue, schedule?.mode === 'paused');
    }
  }

  private syncProgrammeBoard(force = false): void {
    const venues: VenueKey[] = VENUE_KEYS;
    const index = Math.floor(Date.now() / 8_000) % venues.length;
    const countdown = this.root.querySelector<HTMLElement>('#programme-rotate-countdown');
    if (countdown) countdown.textContent = String(8 - Math.floor((Date.now() / 1000) % 8));
    this.syncStaffNowPlaying();
    if (!force && index === this.programmeRotationIndex) return;
    this.programmeRotationIndex = index;
    const venue = venues[index];
    const playlist = this.venueFilms(venue);
    const film = this.publicFilm(venue);
    const filmIndex = Math.max(0, playlist.findIndex((entry) => entry.id === film.id));
    const next = playlist[(filmIndex + 1) % playlist.length];
    const metadata = [
      film.creator,
      film.year,
    ].filter(Boolean).join(' · ');
    this.world?.setProgrammeBoard(this.venueName(venue), this.filmTitle(film), metadata, this.filmTitle(next ?? film));
    if (this.activePanel === 'programme') this.updateProgrammeFocus(venue, film, next ?? film, filmIndex, playlist.length);
  }

  /**
   * Keeps the STAFF panel's "now playing" selects on the work each projector is
   * actually running. The panel is drawn once and then left open, so without
   * this the selects report whatever was showing when it was opened.
   */
  private syncStaffNowPlaying(): void {
    if (this.activePanel !== 'admin') return;
    this.root.querySelectorAll<HTMLFormElement>('[data-programme-form]').forEach((form) => {
      const select = form.querySelector<HTMLSelectElement>('select[name="currentYoutubeId"][data-follows-screen]');
      if (!select) return;
      const showing = this.publicFilm(form.dataset.programmeForm as VenueKey).youtubeId;
      // Leave it alone if this venue is not running that work — a special
      // screening plays outside the list, and is configured further down.
      if (select.value !== showing && [...select.options].some((option) => option.value === showing)) {
        select.value = showing;
      }
    });
  }

  private readonly globalShortcut = (event: KeyboardEvent): void => {
    // Escape is what attendees reach for to leave anything that fills the
    // screen, and the browser no longer handles it for us.
    if (event.key === 'Escape' && this.screenMaximized) {
      event.preventDefault();
      void this.setScreenMaximized(false);
      return;
    }
    // Escape also leaves the camera, which is the other thing that fills the
    // screen — and from inside the caption field it is the only way out, since
    // C there is a letter being typed.
    if (event.key === 'Escape' && this.viewMode !== 'normal') {
      event.preventDefault();
      this.setViewMode('normal');
      return;
    }
    if ((event.key === 'c' || event.key === 'C') && !event.repeat) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (this.activePanel) return;
      event.preventDefault();
      this.cycleViewMode();
      return;
    }
    if (event.key !== 'Enter' || event.repeat) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (this.activePanel !== 'chat') this.openPanel('chat');
    window.setTimeout(() => this.root.querySelector<HTMLInputElement>('#chat-message')?.focus(), 0);
  };

  /** The order a venue works through when no service is dictating one. */
  private localOrder(venue: VenueKey): string[] {
    return this.venueFilms(venue).map((film) => film.youtubeId);
  }

  private publicFilm(venue: VenueKey = this.activeVenue): CatalogueEntry {
    const verifiedLocalPublicUpload: Record<VenueKey, string> = {
      shore: 'SRbsIUYB0dc',
      palace: 'KD5dGYzk9Bo',
      'drive-in': 'TmvklnJYWA4',
      club: 'rMicadJVzH8',
      rooftop: 'rMicadJVzH8',
    };
    const schedule = this.networkState?.schedule?.[venue];
    const scheduledYoutubeId = schedule?.activeSpecialYoutubeId ?? schedule?.youtubeId ?? schedule?.order?.[schedule.currentIndex];
    const listedFilm = this.allFilms().find((film) => film.youtubeId === scheduledYoutubeId);
    if (listedFilm) return listedFilm;
    if (schedule?.activeSpecialYoutubeId && scheduledYoutubeId) {
      return {
        id: `special-${venue}-${scheduledYoutubeId}`,
        title: this.language === 'zh-TW' ? '特別放映' : 'SPECIAL SCREENING',
        category: catalogueByVenue[venue][0]?.category ?? 'SPECIAL SCREENING',
        venue,
        youtubeId: scheduledYoutubeId,
        embedUrl: `https://www.youtube-nocookie.com/embed/${scheduledYoutubeId}`,
        sourceUrl: `https://www.youtube.com/watch?v=${scheduledYoutubeId}`,
      };
    }
    // No service, so the venue runs its own programme rather than sitting on
    // one fixed work. Falls back to the known-good upload only if the running
    // order somehow yields nothing.
    const local = this.programmeClock.position(venue, this.localOrder(venue));
    const playing = local && this.venueFilms(venue).find((film) => film.youtubeId === local.youtubeId);
    return playing
      ?? catalogueByVenue[venue].find((film) => film.youtubeId === verifiedLocalPublicUpload[venue])
      ?? catalogueByVenue[venue][0];
  }

  /**
   * How far into the current work the venue is, measured against the service
   * clock rather than this browser's, so every attendee sees the same second.
   * Returns 0 offline, where there is no shared programme to join.
   */
  private publicOffset(venue: VenueKey): number {
    const schedule = this.networkState?.schedule?.[venue];
    if (!schedule?.startedAt) {
      return this.programmeClock.position(venue, this.localOrder(venue))?.offset ?? 0;
    }
    const now = schedule.pausedAt ?? (Date.now() + this.serverClockOffset);
    const elapsed = Math.floor((now - schedule.startedAt) / 1000);
    // A stale start time, most often a programme left paused for a long time,
    // should show the work rather than seek past its end.
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 21_600) return 0;
    return elapsed;
  }

  /**
   * Where a maximized public screening should start. The in-world projector is
   * already playing, so join it in progress instead of loading the film from
   * the top. Falls back to the projector's own starting offset if the player
   * has not reported a position yet.
   */
  private publicScreeningOffset(): number {
    return Math.floor(this.world?.publicScreenTime(this.activeVenue) ?? this.publicOffset(this.activeVenue));
  }

  private startPublicScreening(seated: boolean): void {
    this.screenMode = 'public';
    this.syncPublicProjectors();
    this.hideVenueScreen(false);
    if (seated) this.showPublicSeatHud();
    else this.hidePublicSeatHud();
    this.world?.setPublicScreenMuted(
      this.snapshot?.inTheater ? this.activeVenue : undefined,
      this.audioMuted || !this.snapshot?.inTheater,
    );
  }

  private startPrivateScreening(film: CatalogueEntry, offset = 0): void {
    this.completeQuest('private-screening');
    this.activeVenue = film.venue;
    this.privateProgress = { filmId: film.id, offset, startedAt: Date.now() };
    this.savePrivateProgress();
    this.hidePublicSeatHud();
    this.world?.setPublicScreenMuted(undefined, true);
    this.renderScreen(film, 'private', offset, true);
    this.hideSeatMenu();
  }

  private renderScreen(
    film: CatalogueEntry,
    mode: 'public' | 'private',
    offset: number,
    seated: boolean,
  ): void {
    const screen = this.root.querySelector<HTMLElement>('#venue-screen');
    const frame = this.root.querySelector<HTMLElement>('#screen-frame');
    const modeLabel = this.root.querySelector<HTMLElement>('#screen-mode');
    const title = this.root.querySelector<HTMLElement>('#screen-title');
    const actions = this.root.querySelector<HTMLElement>('#screen-actions');
    if (!screen || !frame || !modeLabel || !title || !actions) return;

    this.screenMode = mode;
    const playerUrl = new URL(film.embedUrl.replace('youtube-nocookie.com', 'youtube.com'));
    playerUrl.searchParams.set('autoplay', '1');
    playerUrl.searchParams.set('mute', this.audioMuted ? '1' : '0');
    playerUrl.searchParams.set('controls', seated ? '1' : '0');
    playerUrl.searchParams.set('playsinline', '1');
    playerUrl.searchParams.set('rel', '0');
    playerUrl.searchParams.set('enablejsapi', '1');
    playerUrl.searchParams.set('start', String(Math.max(0, Math.floor(offset))));
    // A private viewing owns its player and may loop. Public screenings must
    // end cleanly so the shared programme can replace them with the next work;
    // looping here would be a second sequencer competing with that clock.
    if (mode === 'private') {
      playerUrl.searchParams.set('loop', '1');
      playerUrl.searchParams.set('playlist', film.youtubeId);
    }
    if (window.location.origin !== 'null') playerUrl.searchParams.set('origin', window.location.origin);
    playerUrl.searchParams.set('widget_referrer', window.location.href);
    frame.innerHTML = `<iframe title="${this.escapeAttribute(film.title)}" src="${this.escapeAttribute(playerUrl.toString())}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    modeLabel.textContent = mode === 'public'
      ? (this.language === 'zh-TW' ? '公開放映 · 同步播放' : 'PUBLIC SCREENING · SYNCHRONIZED')
      : (this.language === 'zh-TW' ? '私人放映 · 僅此裝置' : 'PRIVATE SCREENING · THIS DEVICE');
    title.textContent = this.filmTitle(film);
    screen.hidden = false;
    this.root.querySelector<HTMLElement>('.world-shell')?.setAttribute('data-screen-mode', mode);
    screen.classList.toggle('venue-screen--seated', seated);
    screen.classList.toggle('venue-screen--maximized', this.screenMaximized);

    actions.innerHTML = seated
      ? `<button type="button" data-screen-catalogue>${this.language === 'zh-TW' ? '片單' : 'CATALOGUE'}</button>
         ${mode === 'private' ? `<button type="button" data-screen-public>${this.language === 'zh-TW' ? '觀看公開放映' : 'WATCH PUBLIC'}</button>` : ''}
         <button type="button" data-screen-fullscreen>${this.fullscreenLabel()}</button>
         <button type="button" data-screen-stand>${this.snapshot?.playerState === 'seated'
           ? (this.language === 'zh-TW' ? '起身' : 'STAND')
           : (this.language === 'zh-TW' ? '離開' : 'LEAVE')}</button>`
      : `<span>${this.language === 'zh-TW' ? '入座即可私人觀影' : 'TAKE A SEAT FOR PRIVATE VIEWING'}</span>`;

    actions.querySelector<HTMLButtonElement>('[data-screen-catalogue]')?.addEventListener('click', () => this.openFilmPicker(this.activeVenue));
    actions.querySelector<HTMLButtonElement>('[data-screen-public]')?.addEventListener('click', () => {
      this.pausePrivateScreening();
      this.startPublicScreening(true);
    });
    actions.querySelector<HTMLButtonElement>('[data-screen-fullscreen]')?.addEventListener('click', () => {
      this.toggleScreenFullscreen();
    });
    actions.querySelector<HTMLButtonElement>('[data-screen-stand]')?.addEventListener('pointerdown', () => {
      if (this.snapshot?.playerState === 'seated') {
        this.world?.forceStand();
        return;
      }
      // Standing already: there is nothing to stand up from, so just close it.
      this.pausePrivateScreening();
      this.hideVenueScreen();
      this.world?.setPublicScreenMuted(undefined, this.audioMuted);
    });

  }

  private openPublicScreenFullscreen(): void {
    this.renderScreen(this.publicFilm(this.activeVenue), 'public', this.publicScreeningOffset(), true);
    void this.setScreenMaximized(true);
  }

  private fullscreenLabel(): string {
    if (this.language === 'zh-TW') return this.screenMaximized ? '離開全螢幕' : '全螢幕';
    return this.screenMaximized ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
  }

  private fullscreenElement(): Element | null {
    const fullscreenDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitCurrentFullScreenElement?: Element | null;
    };
    return document.fullscreenElement
      ?? fullscreenDocument.webkitFullscreenElement
      ?? fullscreenDocument.webkitCurrentFullScreenElement
      ?? null;
  }

  private screenOwnsFullscreen(screen: HTMLElement): boolean {
    const fullscreenElement = this.fullscreenElement();
    return fullscreenElement === screen || (fullscreenElement !== null && screen.contains(fullscreenElement));
  }

  private async requestScreenFullscreen(screen: HTMLElement): Promise<boolean> {
    const fullscreenScreen = screen as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      webkitRequestFullScreen?: () => Promise<void> | void;
    };
    const request = screen.requestFullscreen?.bind(screen)
      ?? fullscreenScreen.webkitRequestFullscreen?.bind(fullscreenScreen)
      ?? fullscreenScreen.webkitRequestFullScreen?.bind(fullscreenScreen);
    if (!request) return false;
    try {
      await Promise.resolve(request());
      return true;
    } catch {
      return false;
    }
  }

  private async exitScreenFullscreen(): Promise<void> {
    const fullscreenDocument = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitCancelFullScreen?: () => Promise<void> | void;
    };
    const exit = document.exitFullscreen?.bind(document)
      ?? fullscreenDocument.webkitExitFullscreen?.bind(fullscreenDocument)
      ?? fullscreenDocument.webkitCancelFullScreen?.bind(fullscreenDocument);
    if (!exit) return;
    try {
      await Promise.resolve(exit());
    } catch {
      // The CSS fallback still needs to be escapable if the browser refuses
      // or has already dismissed its own fullscreen layer.
    }
  }

  private applyScreenMaximized(maximized: boolean): void {
    const screen = this.root.querySelector<HTMLElement>('#venue-screen');
    if (!screen) return;
    const wasMaximized = this.screenMaximized;
    this.screenMaximized = maximized;
    screen.classList.toggle('venue-screen--maximized', maximized);
    const fullscreenButton = this.root.querySelector<HTMLButtonElement>('[data-screen-fullscreen]');
    if (fullscreenButton) fullscreenButton.textContent = this.fullscreenLabel();
    this.world?.setPublicScreenMuted(
      this.snapshot?.inTheater ? this.activeVenue : undefined,
      this.audioMuted || !this.snapshot?.inTheater || maximized,
    );
    if (maximized) {
      this.hidePublicSeatHud();
      return;
    }
    // Leaving a maximized public screening returns to the seated HUD, which is
    // where the attendee opened it from. A private screening keeps its panel.
    if (wasMaximized && this.screenMode === 'public' && this.snapshot?.playerState === 'seated') {
      this.hideVenueScreen(false);
      this.showPublicSeatHud();
    }
  }

  /**
   * Phones use the browser's real Fullscreen API so the video can leave the
   * browser chrome behind. The same panel stays in the fullscreen tree, which
   * keeps our close button reachable. Older WebKit builds fall back to the
   * existing viewport-filling layout instead of leaving the button inert.
   */
  private async setScreenMaximized(maximized: boolean): Promise<void> {
    const screen = this.root.querySelector<HTMLElement>('#venue-screen');
    if (!screen) return;

    if (maximized) {
      this.applyScreenMaximized(true);
      if (!App.usesMobileScreeningLayout()) return;
      // The picture goes fullscreen, not the panel around it. Handing the whole
      // panel to the browser filled the display with the panel's own layout —
      // title, buttons and all — so the film kept its little box inside it and
      // the button read as making the window slightly bigger. Fullscreening the
      // frame gives the screen over to the player alone.
      //
      // screenOwnsFullscreen() already accepts any descendant of the panel, so
      // the state sync and the exit path need no change for this.
      const frame = this.root.querySelector<HTMLElement>('#screen-frame');
      this.screenNativeFullscreen = await this.requestScreenFullscreen(frame ?? screen);
      return;
    }

    if (this.screenNativeFullscreen || this.screenOwnsFullscreen(screen)) {
      await this.exitScreenFullscreen();
    }
    this.screenNativeFullscreen = false;
    this.applyScreenMaximized(false);
  }

  private readonly syncScreenFullscreenState = (): void => {
    const screen = this.root.querySelector<HTMLElement>('#venue-screen');
    if (!screen) return;
    if (this.screenOwnsFullscreen(screen)) {
      this.screenNativeFullscreen = true;
      this.applyScreenMaximized(true);
      return;
    }
    if (!this.screenNativeFullscreen) return;
    this.screenNativeFullscreen = false;
    this.applyScreenMaximized(false);
  };

  private toggleScreenFullscreen(): void {
    void this.setScreenMaximized(!this.screenMaximized);
  }

  private hideVenueScreen(resetMode = true): void {
    const screen = this.root.querySelector<HTMLElement>('#venue-screen');
    const frame = this.root.querySelector<HTMLElement>('#screen-frame');
    if (screen) {
      if (this.screenOwnsFullscreen(screen)) void this.exitScreenFullscreen();
      screen.hidden = true;
      screen.classList.remove('venue-screen--maximized');
    }
    this.screenNativeFullscreen = false;
    this.root.querySelector<HTMLElement>('.world-shell')?.removeAttribute('data-screen-mode');
    this.screenMaximized = false;
    if (frame) frame.innerHTML = '';
    if (resetMode) this.screenMode = undefined;
  }

  private showPublicSeatHud(): void {
    const hud = this.root.querySelector<HTMLElement>('#public-seat-hud');
    const mode = this.root.querySelector<HTMLElement>('#public-seat-mode');
    const title = this.root.querySelector<HTMLElement>('#public-seat-title');
    if (mode) mode.textContent = `${this.venueName(this.activeVenue)} · ${this.language === 'zh-TW' ? '公開放映' : 'PUBLIC SCREENING'}`;
    if (title) title.textContent = this.filmTitle(this.publicFilm(this.activeVenue));
    if (hud) hud.hidden = false;
  }

  private hidePublicSeatHud(): void {
    const hud = this.root.querySelector<HTMLElement>('#public-seat-hud');
    if (hud) hud.hidden = true;
  }

  private sendScreenCommand(func: 'mute' | 'unMute' | 'setVolume', args: number[] = []): void {
    const iframe = this.root.querySelector<HTMLIFrameElement>('#screen-frame iframe');
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }

  private openSeatMenu(seatId: string, venue: VenueKey = this.activeVenue): void {
    const menu = this.root.querySelector<HTMLElement>('#seat-menu');
    if (!menu) return;
    this.openDjBooth = undefined;
    menu.dataset.menuOwner = 'screening';
    this.activeVenue = venue;
    this.activeSeatId = seatId;
    const resumable = this.privateProgress
      ? this.allFilms().find((film) => film.id === this.privateProgress?.filmId)
      : undefined;
    const venueResume = resumable?.venue === venue ? resumable : undefined;
    menu.hidden = false;
    menu.innerHTML = `
      <p class="eyebrow">${this.escapeHtml(this.venueName(venue))} · ${this.escapeHtml(seatId)}</p>
      <h2 id="seat-menu-title">${this.language === 'zh-TW' ? '已入座' : 'YOU HAVE A SEAT'}</h2>
      <p>${this.language === 'zh-TW' ? '公開放映同步進行；私人選片只會更改你的畫面。' : 'Public playback stays synchronized. A private choice changes only your screen.'}</p>
      <div class="seat-menu__actions">
        ${venueResume ? `<button type="button" data-seat-resume>${this.language === 'zh-TW' ? '繼續播放' : 'RESUME'} ${this.escapeHtml(this.filmTitle(venueResume))}</button>` : ''}
        <button type="button" data-seat-public>${this.language === 'zh-TW' ? '與觀眾一起看' : 'WATCH WITH AUDIENCE'}</button>
        <button type="button" data-seat-catalogue>${this.language === 'zh-TW' ? '選擇影片' : 'CHOOSE A FILM'}</button>
        <button type="button" data-seat-stand>${this.language === 'zh-TW' ? '起身' : 'STAND UP'}</button>
      </div>`;
    menu.querySelector<HTMLButtonElement>('[data-seat-resume]')?.addEventListener('click', () => {
      if (venueResume && this.privateProgress) this.startPrivateScreening(venueResume, this.privateProgress.offset);
    });
    menu.querySelector<HTMLButtonElement>('[data-seat-public]')?.addEventListener('click', () => {
      this.pausePrivateScreening();
      this.startPublicScreening(true);
      this.hideSeatMenu();
    });
    menu.querySelector<HTMLButtonElement>('[data-seat-catalogue]')?.addEventListener('click', () => this.openFilmPicker(venue));
    menu.querySelector<HTMLButtonElement>('[data-seat-stand]')?.addEventListener('click', () => this.world?.forceStand());
  }

  /**
   * Asking the resident DJ for a track. This is not the theatres' private
   * catalogue: a request joins the back of the queue and the DJ plays it for
   * the whole room when the current track ends. A private listening is offered
   * alongside for attendees who would rather not wait or share.
   */
  private openDjRequest(djName: string, venue: 'club' | 'rooftop' = 'club'): void {
    const menu = this.root.querySelector<HTMLElement>('#seat-menu');
    if (!menu) return;
    this.openDjBooth = { name: djName, venue, view: 'requests' };
    menu.dataset.menuOwner = 'dj';
    const zh = this.language === 'zh-TW';
    const nowPlaying = this.publicFilm(venue);
    const queue = this.networkState?.venueQueues?.[venue] ?? [];
    const trackTitle = (youtubeId: string) => {
      const film = this.venueFilms(venue).find((entry) => entry.youtubeId === youtubeId);
      return this.filmTitle(film ?? nowPlaying);
    };
    menu.hidden = false;
    menu.innerHTML = `
      <p class="eyebrow">${this.escapeHtml(this.venueName(venue))} · ${zh ? '點歌' : 'REQUEST A TRACK'}</p>
      <h2 id="seat-menu-title">${zh ? `跟 ${this.escapeHtml(djName)} 點歌` : `ASK ${this.escapeHtml(djName)} FOR A TRACK`}</h2>
      <div class="dj-booth">
        <p class="dj-booth__now"><span>${zh ? '正在播放' : 'ON THE DECKS'}</span><strong>${this.escapeHtml(this.filmTitle(nowPlaying))}</strong></p>
        <p class="dj-booth__note">${zh ? '點歌會排進隊伍，整間俱樂部一起聽。想自己聽就選「私人聆聽」。' : 'A request joins the queue and the room hears it. Choose private listening to hear one on your own.'}</p>
      </div>
      <details class="dj-queue" data-dj-queue${queue.length ? ' open' : ''}>
        <summary><span>${zh ? '待播清單' : 'UPCOMING TRACKS'}</span><b>${queue.length}</b></summary>
        <ol class="dj-queue__list">${queue.length
          ? queue.map((entry) => `<li><span>${this.escapeHtml(trackTitle(entry.youtubeId))}</span><small>${this.escapeHtml(entry.requestedBy)}</small></li>`).join('')
          : `<li class="dj-queue__empty">${zh ? '目前沒有人點歌，DJ 依片單順序播放。' : 'Nothing queued. The DJ is working through the record box.'}</li>`}</ol>
      </details>
      <div class="dj-tracklist">${this.venueFilms(venue).map((film) => {
        const playing = film.youtubeId === nowPlaying.youtubeId;
        const queued = queue.some((entry) => entry.youtubeId === film.youtubeId);
        const bpm = this.networkState?.trackTempos?.[film.youtubeId];
        return `
        <div class="dj-tracklist__row${playing ? ' is-playing' : ''}">
          <span class="dj-tracklist__title">${this.escapeHtml(this.filmTitle(film))}</span>
          <span class="dj-tracklist__meta">${bpm ? `${bpm} BPM` : ''}${playing ? ` · ${zh ? '播放中' : 'PLAYING'}` : queued ? ` · ${zh ? '已排隊' : 'QUEUED'}` : ''}</span>
          <button type="button" data-request-track="${this.escapeAttribute(film.youtubeId)}"${playing || queued ? ' disabled' : ''}>${zh ? '點這首' : 'REQUEST'}</button>
          <button type="button" class="dj-tracklist__private" data-private-track="${this.escapeAttribute(film.youtubeId)}">${zh ? '私人聆聽' : 'PRIVATE'}</button>
        </div>`;
      }).join('')}</div>
      <div class="seat-menu__actions">
        ${DJ_BY_VENUE[venue] ? `<button type="button" data-dj-about>${zh ? `認識 ${this.escapeHtml(djName)}` : `ABOUT ${this.escapeHtml(djName)}`}</button>` : ''}
        <button class="seat-menu__back" type="button" data-seat-back>${zh ? '離開' : 'BACK TO THE FLOOR'}</button>
      </div>`;

    menu.querySelector<HTMLButtonElement>('[data-dj-about]')?.addEventListener('click', () => {
      this.openDjAbout(djName, venue);
    });
    menu.querySelectorAll<HTMLButtonElement>('[data-request-track]').forEach((button) => {
      button.addEventListener('click', () => {
        const youtubeId = button.dataset.requestTrack ?? '';
        if (!this.festivalClient.online) {
          this.showWorldAlert(zh ? '離線時無法點歌' : 'THE BOOTH IS OFFLINE');
          return;
        }
        button.disabled = true;
        void this.festivalClient.requestTrack(venue, youtubeId).then((result) => {
          if (!result.ok) {
            button.disabled = false;
            this.showWorldAlert(result.message ?? (zh ? '點歌失敗' : 'THE DJ PASSED ON THAT ONE'));
            return;
          }
          this.world?.acknowledgeDjRequest();
          this.openDjBooth = { name: djName, venue, view: 'requests' };
          this.showWorldAlert(zh
            ? `已排進待播清單：${trackTitle(youtubeId)}`
            : `QUEUED: ${trackTitle(youtubeId)}`);
        });
      });
    });
    menu.querySelectorAll<HTMLButtonElement>('[data-private-track]').forEach((button) => {
      button.addEventListener('click', () => {
        const film = this.venueFilms(venue).find((entry) => entry.youtubeId === button.dataset.privateTrack);
        if (!film) return;
        this.hideSeatMenu();
        this.startPrivateScreening(film);
        this.showWorldAlert(zh ? '私人聆聽 · 只有你聽得到' : 'PRIVATE LISTENING · YOURS ALONE');
      });
    });
    menu.querySelector<HTMLButtonElement>('[data-seat-back]')?.addEventListener('click', () => {
      this.openDjBooth = undefined;
      this.hideSeatMenu();
    });
  }

  private djProfileSignature(profile: DjProfile): string {
    return [profile.role, profile.roleZh, profile.introduction, profile.introductionZh].join('\u0000');
  }

  /**
   * Offers a reload when another STAFF member changes an introduction that is
   * open and mid-edit. Redrawing under them would throw their work away, and
   * saying nothing would have them overwrite a colleague without knowing, so
   * the choice is put in front of them and left there.
   */
  private noticeDjIntroductionChanged(djName: string, venue: 'club' | 'rooftop'): void {
    const form = this.root.querySelector<HTMLFormElement>('[data-dj-edit]');
    if (!form || form.querySelector('[data-dj-stale]')) return;
    const profile = djProfileFor(venue, this.networkState?.djProfiles, djName);
    if (!profile || this.djProfileSignature(profile) === this.djIntroductionSignature) return;
    const zh = this.language === 'zh-TW';
    const notice = document.createElement('p');
    notice.className = 'dj-about__stale dj-about__wide';
    notice.dataset.djStale = '';
    notice.append(zh
      ? '另一位工作人員剛更新了這份介紹。'
      : 'Another STAFF member has just changed this introduction.');
    const reload = document.createElement('button');
    reload.type = 'button';
    const resting = zh ? '載入他們的版本' : 'LOAD THEIRS';
    reload.textContent = resting;
    // Their version replaces what is being written and there is no getting it
    // back, so the button asks once before it does it. A native dialog is no
    // use here: this sits over a pointer-locked world.
    let armed = false;
    const disarm = (): void => {
      if (!armed) return;
      armed = false;
      delete reload.dataset.armed;
      reload.textContent = resting;
    };
    reload.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        reload.dataset.armed = '';
        reload.textContent = zh ? '確定？會蓋掉你寫的' : 'SURE? REPLACES YOURS';
        return;
      }
      this.djIntroductionTouched = false;
      this.openDjAbout(djName, venue);
    });
    // Going back to writing puts the safety on again, so a stray second click
    // minutes later cannot take the text.
    form.addEventListener('input', disarm);
    reload.addEventListener('blur', disarm);
    notice.append(reload);
    form.prepend(notice);
  }

  /**
   * Whether the introduction is mid-edit. Redrawing then would wipe the text,
   * the caret and the scroll of whoever is writing, so an arriving update has
   * to wait — a profile changed elsewhere shows the next time it is opened.
   */
  private djIntroductionBeingEdited(): boolean {
    const form = this.root.querySelector<HTMLFormElement>('[data-dj-edit]');
    if (!form) return false;
    return this.djIntroductionTouched || form.contains(document.activeElement);
  }

  /**
   * The resident's introduction, opened from their booth. Visitors read it;
   * STAFF get an edit form under it. The form only appears with a service
   * connected, because there is nowhere to save an edit without one — the
   * introduction itself always shows, since the build carries a copy.
   */
  private openDjAbout(djName: string, venue: 'club' | 'rooftop'): void {
    const menu = this.root.querySelector<HTMLElement>('#seat-menu');
    if (!menu) return;
    const zh = this.language === 'zh-TW';
    const profile = djProfileFor(venue, this.networkState?.djProfiles, djName);
    if (!profile) return;
    this.openDjBooth = { name: djName, venue, view: 'about' };
    menu.dataset.menuOwner = 'dj';
    const canEdit = Boolean(this.staffKey) && this.festivalClient.online;
    const paragraphs = (text: string) => text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${this.escapeHtml(line)}</p>`)
      .join('');
    menu.hidden = false;
    menu.innerHTML = `
      <p class="eyebrow">${this.escapeHtml(this.venueName(venue))} · ${zh ? '駐場介紹' : 'RESIDENT'}</p>
      <h2 id="seat-menu-title">${this.escapeHtml(profile.name)}</h2>
      <p class="dj-about__role">${this.escapeHtml(zh ? profile.roleZh : profile.role)}</p>
      <div class="dj-about__body">${paragraphs(zh ? profile.introductionZh : profile.introduction)}</div>
      ${canEdit ? `
      <form class="dj-about__edit" data-dj-edit>
        <p class="eyebrow dj-about__wide">${zh ? 'STAFF 編輯 · 中文' : 'STAFF EDIT · ENGLISH'}</p>
        <label class="dj-about__wide"><span>${zh ? '頭銜' : 'ROLE'}</span><input name="role" value="${this.escapeAttribute(zh ? profile.roleZh : profile.role)}" maxlength="120" required /></label>
        <label class="dj-about__wide"><span>${zh ? '介紹' : 'INTRODUCTION'}</span><textarea name="introduction" rows="6" maxlength="1200" required>${this.escapeHtml(zh ? profile.introductionZh : profile.introduction)}</textarea></label>
        <p class="dj-about__hint dj-about__wide">${zh
          ? '這裡編輯的是中文版。切換到 EN 可編輯英文版，兩者分開儲存。'
          : 'This edits the English version. Switch to 繁中 to edit the Chinese one; they are saved separately.'}</p>
        <button type="submit">${zh ? '儲存中文介紹' : 'SAVE ENGLISH INTRODUCTION'}</button>
      </form>` : ''}
      <button class="seat-menu__back" type="button" data-dj-back>${zh ? '回到點歌' : 'BACK TO REQUESTS'}</button>`;

    this.djIntroductionTouched = false;
    this.djIntroductionSignature = this.djProfileSignature(profile);
    menu.querySelector<HTMLFormElement>('[data-dj-edit]')?.addEventListener('input', () => {
      this.djIntroductionTouched = true;
    });
    menu.querySelector<HTMLButtonElement>('[data-dj-back]')?.addEventListener('click', () => {
      this.openDjRequest(djName, venue);
    });
    menu.querySelector<HTMLFormElement>('[data-dj-edit]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const data = new FormData(form);
      const submit = form.querySelector('button[type=submit]');
      if (submit instanceof HTMLButtonElement) submit.disabled = true;
      const role = String(data.get('role') ?? '');
      const introduction = String(data.get('introduction') ?? '');
      // Only the language on screen was editable, so the other one is passed
      // back exactly as it came rather than blanked.
      void this.festivalClient.updateDjProfile(this.staffKey, {
        id: profile.id,
        role: zh ? profile.role : role,
        roleZh: zh ? role : profile.roleZh,
        introduction: zh ? profile.introduction : introduction,
        introductionZh: zh ? introduction : profile.introductionZh,
      }).then(() => {
        this.showWorldAlert(zh ? '介紹已更新' : 'INTRODUCTION SAVED');
        this.djIntroductionTouched = false;
        this.openDjAbout(djName, venue);
      }).catch((error: unknown) => {
        if (submit instanceof HTMLButtonElement) submit.disabled = false;
        this.showWorldAlert(error instanceof Error ? error.message : (zh ? '儲存失敗' : 'COULD NOT SAVE'));
      });
    });
  }

  private openFilmPicker(venue: VenueKey = this.activeVenue): void {
    const menu = this.root.querySelector<HTMLElement>('#seat-menu');
    if (!menu) return;
    this.openDjBooth = undefined;
    menu.dataset.menuOwner = 'screening';
    this.activeVenue = venue;
    menu.hidden = false;
    menu.innerHTML = `
      <p class="eyebrow">${this.escapeHtml(this.venueName(venue))} · ${this.language === 'zh-TW' ? '私人片單' : 'PERSONAL CATALOGUE'}</p>
      <h2 id="seat-menu-title">${this.language === 'zh-TW' ? '選擇影片' : 'CHOOSE A FILM'}</h2>
      <div class="seat-film-grid">${this.venueFilms(venue).map((film) => `
        <button type="button" data-private-film="${film.id}">
          <span>${this.escapeHtml(this.filmTitle(film))}</span><small>${this.categoryLabel(film.category)}${film.year ? ` · ${film.year}` : ''}</small>
        </button>`).join('')}</div>
      <button class="seat-menu__back" type="button" data-seat-back>${this.language === 'zh-TW' ? '返回' : 'BACK'}</button>`;
    menu.querySelectorAll<HTMLButtonElement>('[data-private-film]').forEach((button) => {
      button.addEventListener('click', () => {
        const film = this.allFilms().find((entry) => entry.id === button.dataset.privateFilm);
        if (film) this.startPrivateScreening(film);
      });
    });
    menu.querySelector<HTMLButtonElement>('[data-seat-back]')?.addEventListener('click', () => {
      this.openSeatMenu(this.activeSeatId, venue);
    });
  }

  private hideSeatMenu(): void {
    const menu = this.root.querySelector<HTMLElement>('#seat-menu');
    this.openDjBooth = undefined;
    if (menu) {
      menu.hidden = true;
      delete menu.dataset.menuOwner;
    }
  }

  private privateScreenOpen(): boolean {
    return this.screenMode === 'private' && this.root.querySelector<HTMLElement>('#venue-screen')?.hidden === false;
  }

  private pausePrivateScreening(): void {
    if (!this.privateProgress || this.screenMode !== 'private') return;
    const elapsed = this.privateProgress.startedAt
      ? (Date.now() - this.privateProgress.startedAt) / 1000
      : 0;
    this.privateProgress = {
      filmId: this.privateProgress.filmId,
      offset: this.privateProgress.offset + elapsed,
    };
    this.savePrivateProgress();
  }

  private savePrivateProgress(): void {
    if (this.privateProgress) sessionStorage.setItem(PRIVATE_PROGRESS_KEY, JSON.stringify(this.privateProgress));
    else sessionStorage.removeItem(PRIVATE_PROGRESS_KEY);
  }

  private handleNetworkState(state: FestivalState): void {
    const previousSchedule = JSON.stringify(this.networkState?.schedule ?? {});
    const previousPamphletUpdatedAt = this.pamphlet.updatedAt;
    const previousMentorCarrierId = this.networkState?.mentorCarrierId ?? null;
    const previousAttendeeSignature = this.attendeeListSignature(this.networkState, this.npcProfiles);
    // Attendee clocks drift and some are simply wrong. Programme positions are
    // measured against the service clock instead.
    if (state.serverTime) this.serverClockOffset = state.serverTime - Date.now();
    this.networkState = state;
    this.siteStyle = { ...this.siteStyle, ...state.siteStyle };
    this.gateBackground = { ...this.gateBackground, ...state.gateBackground };
    this.npcProfiles = this.normalizeNpcProfiles(state.npcProfiles, state.npcNames);
    this.pamphlet = { ...this.pamphlet, ...state.pamphlet };
    if (state.gateCopy) this.gateCopy = state.gateCopy;
    const selfVisitor = state.visitors.find((visitor) => visitor.id === state.selfId);
    if (selfVisitor) {
      this.currentId = selfVisitor.name;
      this.controlledNpcId = selfVisitor.npcId;
      this.world?.setControlledNpcId(selfVisitor.npcId);
      this.handleConnectionStatus(this.connectionStatus);
      if (selfVisitor.npcId === 'MENTOR' && state.mentorCarrierId && state.mentorCarrierId !== state.selfId && state.mentorCarrierId !== previousMentorCarrierId) {
        const carrierName = state.visitors.find((visitor) => visitor.id === state.mentorCarrierId)?.originalName ?? 'AN ATTENDEE';
        this.showWorldAlert(this.language === 'zh-TW'
          ? `${carrierName} 抱起了 ${this.mentorName()} · 移動控制暫停`
          : `${carrierName} PICKED UP ${this.mentorName()} · MOVEMENT CONTROL PAUSED`);
      } else if (selfVisitor.npcId === 'MENTOR' && previousMentorCarrierId && !state.mentorCarrierId) {
        this.showWorldAlert(this.language === 'zh-TW'
          ? `${this.mentorName()} 已放下 · 移動控制恢復`
          : `${this.mentorName()} WAS PUT DOWN · MOVEMENT CONTROL RESTORED`);
      }
    }
    this.applySiteStyle();
    this.world?.setNpcProfiles(this.npcProfiles);
    const self = state.visitors.find((visitor) => visitor.id === state.selfId);
    // Whether the service is new enough to rule on death itself. It publishes
    // diedAt for every attendee once it can, even as a zero, so the field being
    // a number at all is the test — not its value.
    const serviceRulesOnDeath = typeof self?.diedAt === 'number';
    const hitAt = self?.hitAt ?? 0;
    if (hitAt && hitAt > this.lastHitAt) {
      this.lastHitAt = hitAt;
      this.world?.takeHit(self?.hitBy, self?.hitFromX, self?.hitFromZ);
      // A service older than this page sends the blow and nothing else — it has
      // no idea an attendee can go down. Rather than lose the whole thing to a
      // deploy that has not happened, the page counts its own beating and drops
      // on the fifth, on the same terms the service would use. It hands the
      // ruling straight back the moment a service can make it, because death is
      // shared and only the service can tell everybody else about it.
      if (!serviceRulesOnDeath) {
        if (hitAt - this.localHitAt > LOCAL_HIT_MEMORY_MS) this.localHitCount = 0;
        this.localHitAt = hitAt;
        this.localHitCount += 1;
        if (this.localHitCount >= LOCAL_HITS_TO_DIE) {
          this.localHitCount = 0;
          this.world?.die(self?.hitBy);
        }
      }
    }
    if (serviceRulesOnDeath) this.localHitCount = 0;
    const diedAt = self?.diedAt ?? 0;
    if (diedAt && diedAt > this.lastDeathAt) {
      this.lastDeathAt = diedAt;
      this.world?.die(self?.killedBy);
    }
    // The running order is a shared thing that moves without this attendee
    // touching anything, so an open jukebox panel has to follow it. Compared
    // rather than redrawn every tick, or the list rebuilds under the cursor.
    if (this.activePanel === 'jukebox') {
      const signature = JSON.stringify(state.jukebox ?? null);
      if (signature !== this.jukeboxRendered) {
        this.jukeboxRendered = signature;
        this.openPanel('jukebox');
      }
    }
    if (state.entranceSign) this.world?.setEntranceSign(state.entranceSign.title, state.entranceSign.subtitle);
    if (state.templeSign) this.world?.setTempleSign(state.templeSign.name, state.templeSign.label);
    this.world?.setSharedMentorCarrier(state.mentorCarrierId, state.selfId);
    this.world?.setMentorFollower(state.mentorFollower);
    const remoteVisitors = state.visitors
      .filter((visitor) => visitor.id !== state.selfId)
      .map((visitor) => ({
        id: visitor.id,
        name: visitor.name,
        palette: visitor.palette,
        x: visitor.presence.x,
        y: visitor.presence.y,
        z: visitor.presence.z,
        rotation: visitor.presence.rotation,
        state: visitor.presence.state,
        moving: visitor.presence.moving,
        running: visitor.presence.running,
        gesture: visitor.hitAt && Date.now() - visitor.hitAt < 620 ? 'hit' : visitor.presence.gesture,
        carriedItem: visitor.presence.carriedItem,
        npcId: visitor.npcId,
        originalName: visitor.originalName,
        impersonationOrigin: visitor.impersonationOrigin,
      }));
    this.world?.setRemoteVisitors(remoteVisitors);
    this.world?.setSharedMentorCarrier(state.mentorCarrierId, state.selfId);
    this.world?.setOccupiedSeats(
      state.seats.filter((seat) => seat.visitorId !== state.selfId).map((seat) => seat.seatId),
    );
    // Anything said here and not yet come back from the service is kept on the
    // end, so a line does not vanish between being sent and being echoed. Each
    // is dropped the moment the service's own copy of it arrives.
    const arrived = new Set(state.messages.map((message) => `${message.author}|${message.text}`));
    this.pendingChat = this.pendingChat.filter((message) => !arrived.has(`${message.author}|${message.text}`));
    this.chatMessages = [
      ...initialChat,
      ...state.messages.map((message) => ({ ...message, npc: false })),
      ...this.pendingChat,
    ].slice(-100);
    this.renderChatStream();
    this.refreshOpenChatFeed();
    const previousRequestAt = this.networkState?.clubRequest?.at ?? 0;
    this.syncClubBeat();
    const openSeatMenu = this.root.querySelector<HTMLElement>('#seat-menu');
    if (this.openDjBooth && openSeatMenu && !openSeatMenu.hidden && openSeatMenu.dataset.menuOwner === 'dj') {
      // Re-render from the state that has just arrived, so the queue the
      // service holds is what the attendee sees. This used to redraw the
      // requests page whichever page was actually open, so every update — and
      // they arrive constantly — threw anyone reading the introduction back to
      // the running order, mid-sentence and mid-keystroke.
      const booth = this.openDjBooth;
      this.networkState = state;
      if (booth.view === 'requests') this.openDjRequest(booth.name, booth.venue);
      else if (!this.djIntroductionBeingEdited()) this.openDjAbout(booth.name, booth.venue);
      else this.noticeDjIntroductionChanged(booth.name, booth.venue);
    }
    const request = state.clubRequest;
    if (request && request.at > previousRequestAt && this.snapshot?.screeningVenue === (request.venue ?? 'club')) {
      const venue = request.venue ?? 'club';
      const track = this.venueFilms(venue).find((film) => film.youtubeId === request.youtubeId);
      const title = this.filmTitle(track ?? this.publicFilm(venue));
      this.showWorldAlert(this.language === 'zh-TW'
        ? `${request.requestedBy} 點了《${title}》· 待播第 ${request.position ?? 1} 首`
        : `${request.requestedBy} QUEUED ${title} · #${request.position ?? 1} UP`);
      this.world?.acknowledgeDjRequest();
    }
    if (previousSchedule !== JSON.stringify(state.schedule ?? {})) {
      const previousPublicFilmId = this.publicFilmId;
      this.syncPublicProjectors();
      this.syncProgrammeBoard(true);
      // syncVenueScreen leaves a maximized screening alone, so follow the
      // programme here or the screening would keep playing a finished work.
      this.publicFilmId = this.publicFilm(this.activeVenue).id;
      if (this.screenMaximized && this.screenMode === 'public' && previousPublicFilmId !== this.publicFilmId) {
        this.renderScreen(this.publicFilm(this.activeVenue), 'public', 0, true);
      }
    }
    if (this.activePanel === 'pamphlet' && previousPamphletUpdatedAt !== this.pamphlet.updatedAt) {
      this.openPanel('pamphlet');
    }
    // The stream was redrawn above, and that is the only part of this panel a
    // new message changes. Rebuilding the whole thing threw away the field
    // being typed into — its text, its caret and any half-finished characters
    // an input method was still holding. Somebody writing Chinese lost the word
    // in their hands every time a resident said anything, which is several
    // times a minute, and that is what being cut off constantly was.
    if (this.activePanel === 'attendees' && previousAttendeeSignature !== this.attendeeListSignature(state, this.npcProfiles)) {
      this.reopenPanelKeepingPlace('attendees');
    }
  }

  /**
   * Redraws an open panel without throwing the reader back to the top. Panels
   * are rebuilt wholesale from markup, so anything that refreshes one — saving
   * a venue, an attendee arriving — otherwise loses the scroll position, which
   * is punishing in the STAFF panel where the save button sits a long way down.
   */
  private reopenPanelKeepingPlace(panelId: PanelId): void {
    const previousScrollTop = this.root.querySelector<HTMLElement>('#panel .panel__body')?.scrollTop ?? 0;
    this.openPanel(panelId);
    const body = this.root.querySelector<HTMLElement>('#panel .panel__body');
    if (!body) return;
    body.scrollTop = Math.min(previousScrollTop, Math.max(0, body.scrollHeight - body.clientHeight));
  }

  private handleConnectionStatus(status: ConnectionStatus, detail?: string): void {
    this.connectionStatus = status;
    const cluster = this.root.querySelector<HTMLElement>('#connection-status');
    if (cluster) {
      cluster.dataset.status = status;
      const label = cluster.querySelector<HTMLElement>('span:last-child');
      if (label) {
        const stateLabel = this.language === 'zh-TW'
          ? ({ connecting: '連線中', online: '線上', reconnecting: '重新連線', offline: '離線', kicked: '已結束' } as const)[status]
          : status === 'online' ? 'LIVE' : status === 'offline' ? 'OFFLINE' : status.toUpperCase();
        label.textContent = `${stateLabel} / ${this.currentId}`;
      }
      cluster.title = detail ?? '';
    }
    if (status === 'offline' && detail) this.showWorldAlert(this.language === 'zh-TW' ? '離線模式 · 正在重新連線' : `OFFLINE MODE · ${detail}`);
    if (status === 'kicked') {
      this.world?.stop();
      this.showWorldAlert(this.language === 'zh-TW' ? '工作人員已結束此連線' : (detail ?? 'SESSION ENDED BY FESTIVAL STAFF'));
    }
  }

  private async confirmSeatClaim(seatId: string): Promise<void> {
    const result = await this.festivalClient.claimSeat(seatId);
    if (result.ok) return;
    this.hideSeatMenu();
    this.hidePublicSeatHud();
    this.world?.forceStand();
    this.showWorldAlert(`${seatId} · ${result.message ?? 'SEAT IS UNAVAILABLE'}`);
  }

  /**
   * C walks through three states: the world with its instruments, the world
   * alone, and the world as a postcard. Sending it round in a ring rather than
   * giving each its own key means the way out is the same key as the way in,
   * which is the one thing somebody holding a camera needs to know.
   */
  private cycleViewMode(): void {
    const order = ['normal', 'camera', 'postcard', 'film'] as const;
    this.setViewMode(order[(order.indexOf(this.viewMode) + 1) % order.length]);
  }

  /**
   * Bring the camera's controls back and start them settling again. Left alone
   * they go, so the picture is the only thing on screen.
   */
  /**
   * Put the page back to its own size. There is no API that sets the pinch
   * scale, but a browser re-reads the viewport when it changes, so pinning the
   * scale for a moment and then letting go snaps it back to one and leaves
   * pinching available again afterwards.
   */
  private resetPageZoom(): void {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.content;
    meta.content = `${original}, maximum-scale=1.0, minimum-scale=1.0`;
    window.setTimeout(() => {
      meta.content = original;
    }, 320);
  }

  /**
   * Show or clear the camera's own controls. A decision, not a clock: nothing
   * goes away on its own and nothing comes back on its own, so a shot is never
   * half composed around a control that is about to disappear.
   */
  private setCameraControlsHidden(hidden: boolean): void {
    const shell = this.root.querySelector<HTMLElement>('.world-shell');
    if (!shell) return;
    this.cameraHidden = hidden && this.viewMode !== 'normal';
    if (this.cameraHidden) shell.dataset.cameraHidden = 'on';
    else delete shell.dataset.cameraHidden;
    // Driven through the same data-shown these two already use rather than
    // overridden from the shell. An override has to out-argue whatever set them
    // in the first place, and it lost silently; setting the flag they actually
    // read cannot.
    const up = !this.cameraHidden && this.viewMode !== 'normal';
    const hint = this.root.querySelector<HTMLElement>('.world-camera-hint');
    if (hint) {
      if (up) hint.dataset.shown = 'on';
      else delete hint.dataset.shown;
    }
    // The corner never goes away, it only stops being visible. Cleared, it is
    // still the one place that answers a press — so the same corner puts the
    // controls back, and there is nothing left over the picture to find.
    const corner = this.root.querySelector<HTMLElement>('.world-camera-hide');
    if (!corner) return;
    window.clearTimeout(this.cameraCornerCueTimer);
    if (up) {
      corner.dataset.shown = 'on';
      delete corner.dataset.armed;
      return;
    }
    if (this.viewMode === 'normal') {
      delete corner.dataset.shown;
      delete corner.dataset.armed;
      return;
    }
    // Clearing the frame holds the corner in place for a moment before it goes,
    // so its position is taught at the one instant somebody is looking at it.
    // An invisible control nobody can find again is not a clean frame, it is a
    // lost one. It is pressable throughout, including while it fades.
    corner.dataset.armed = 'on';
    corner.dataset.shown = 'on';
    this.cameraCornerCueTimer = window.setTimeout(() => {
      if (this.cameraHidden) delete corner.dataset.shown;
    }, CAMERA_CORNER_CUE_MS);
  }

  private setViewMode(mode: 'normal' | 'camera' | 'postcard' | 'film'): void {
    this.viewMode = mode;
    if (mode !== 'normal') this.completeQuest('photo');
    this.world?.setPhotographing(mode !== 'normal');
    const shell = this.root.querySelector<HTMLElement>('.world-shell');
    if (!shell) return;
    if (mode === 'normal') delete shell.dataset.view;
    else shell.dataset.view = mode;
    // Film brings its own grade, so the postcard's looks are not offered on
    // top of it — a vintage stock that can be turned cold is not a stock.
    shell.dataset.filter = mode === 'postcard' ? this.postcardFilter : 'none';
    const zh = this.language === 'zh-TW';
    // The one thing left on screen in camera mode, and it goes too. Without it
    // there is no way to discover that C is also the way back.
    const hint = this.root.querySelector<HTMLElement>('.world-camera-hint');
    if (hint) {
      // Camera mode hides every other control so the frame is clean, the ring
      // of touch buttons among them — which on a phone left no way back out at
      // all. This is that way: the same words, now a button, and on a touch
      // screen it neither names a key nobody has nor fades away.
      const touch = App.looksLikeAPhone();
      const step = mode === 'camera'
        ? (zh ? '明信片模式' : 'POSTCARD MODE')
        : mode === 'postcard'
          ? (zh ? '底片模式' : '35MM FILM')
          : mode === 'film'
            ? (zh ? '離開' : 'EXIT')
            : '';
      hint.textContent = step && !touch ? `${zh ? 'C／' : 'C / '}${step}` : step;
      hint.hidden = mode === 'normal';
      const hide = this.root.querySelector<HTMLElement>('[data-camera-hide]');
      if (hide) hide.hidden = mode === 'normal';
      window.clearTimeout(this.cameraHintTimer);
      if (mode !== 'normal') {
        hint.dataset.shown = 'on';
        // Every mode starts with the controls up. Stepping into a mode you had
        // cleared would otherwise leave you with no visible way out of it.
        this.setCameraControlsHidden(false);
      } else {
        delete hint.dataset.shown;
      }
    }
    // The caption is no longer taken hold of on the way in. On a phone that put
    // the keyboard over the picture before it had even been framed, and it is
    // what made simply switching to film zoom the page — a field is focused, so
    // Safari zooms to it. Anyone who wants to write taps the caption.
    if (mode === 'normal') {
      // Leaving the caption focused would swallow WASD.
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }

  /**
   * The jukebox's own player: one hidden YouTube frame, seeked to wherever the
   * service says the record has got to, so everybody in the square is at the
   * same bar of it however long ago they arrived.
   *
   * It is deliberately not part of the world's audio graph. That graph is for
   * things with a place in the world — the sea, the room tone — and is ducked
   * and panned accordingly. This is a record playing over the whole festival,
   * and the only thing it answers to is the attendee's own slider.
   */
  private syncJukebox(): void {
    // Keep the local browser-review fixture independent of whatever happens to
    // be playing on a developer's already-running service. Without this guard,
    // the next presence update can replace the simulated record before the
    // prompt has been inspected.
    const reviewTarget = new URLSearchParams(window.location.search).get('review');
    if (reviewTarget === 'jukebox-sound' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
      this.updateJukeboxSoundPrompt();
      return;
    }
    const jukebox = this.networkState?.jukebox;
    const playing = jukebox?.nowPlaying;
    if (!playing) {
      this.stopJukebox();
      return;
    }
    // Inside a screening room the film is the point, so the square's record is
    // not carried in there. Same in the club and on the deck, where a resident
    // DJ is already playing to the room.
    const venue = this.snapshot?.screeningVenue;
    const inItsOwnRoom = Boolean(this.snapshot?.inTheater) || venue === 'club' || venue === 'rooftop';
    const silenced = this.audioMuted || inItsOwnRoom;
    if (silenced !== this.jukeboxSilenced) {
      this.jukeboxSilenced = silenced;
      this.applyJukeboxVolume();
    }
    if (this.jukeboxPlayingId === playing.youtubeId && this.jukeboxStartedAt === playing.startedAt) return;
    this.jukeboxPlayingId = playing.youtubeId;
    this.jukeboxStartedAt = playing.startedAt;
    const offset = Math.max(0, Math.floor((Date.now() - playing.startedAt) / 1000));
    this.mountJukeboxFrame(playing.youtubeId, offset);
    this.updateJukeboxSoundPrompt();
  }

  /**
   * A phone will not let a page raise a sound on its own account, and quietly
   * nudging the player from here does not help: the command crosses into
   * YouTube's own frame, and a finger that touched this page is not a finger
   * that touched that one. What it does honour is an unmute asked for in the
   * moment somebody presses something. So there is something to press. It
   * appears only when a record is actually playing, only where sound was asked
   * for, and only until it has been used once.
   */
  private updateJukeboxSoundPrompt(): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-jukebox-sound]');
    if (!button) return;
    const wantsSound = !this.audioMuted && !this.jukeboxSilenced && this.jukeboxVolume > 0;
    button.hidden = this.jukeboxSoundConfirmed || !this.jukeboxPlayingId || !wantsSound;
  }

  private mountJukeboxFrame(youtubeId: string, offsetSeconds: number): void {
    let frame = this.jukeboxFrame;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'jukebox-player';
      frame.title = 'Festival jukebox';
      frame.allow = 'autoplay; encrypted-media';
      frame.setAttribute('aria-hidden', 'true');
      // The player only listens once it has loaded, so a volume set before
      // that lands nowhere — which is why the slider appeared to do nothing on
      // the first record. Re-applied on load, and again shortly after, since a
      // player can accept the connection a beat later than the load event.
      frame.addEventListener('load', () => {
        this.applyJukeboxVolume();
        window.setTimeout(() => this.applyJukeboxVolume(), 600);
      });
      // The festival moves the record on when it believes it has finished, and
      // without being told how long one runs it fell back to a flat guess of
      // three and a half minutes — so every record longer than that was cut off
      // partway. The player knows the real length; nobody was ever asking it.
      // The venue screens have always reported theirs; the jukebox never did.
      window.addEventListener('message', this.jukeboxMessage);
      this.root.querySelector('.world-shell')?.appendChild(frame);
      this.jukeboxFrame = frame;
    }
    const url = new URL(`https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}`);
    url.searchParams.set('autoplay', '1');
    // Browsers refuse to start audio that no gesture asked for. The attendee
    // has already chosen sound or silence at the gate; when they chose silence
    // this starts muted and the slider brings it up.
    // The slider has a say in this, not just the choice made at the gate. It
    // did not before, so every time the record changed the new frame was built
    // unmuted and played at full volume until the load handler caught up —
    // which is why sound came back a while after the volume was taken to zero.
    // Always starts muted, whatever the attendee chose. A phone flatly refuses
    // to begin a sound that nobody asked for, so a record built to play aloud
    // did not play at all — silence rather than music, which is why the jukebox
    // could be ordered from and never heard. Muted, it is allowed to start; the
    // volume is then brought up on load and on the first touch of the page,
    // which is a gesture and so permitted. Anyone who chose silence simply has
    // it left down.
    url.searchParams.set('mute', '1');
    url.searchParams.set('controls', '0');
    url.searchParams.set('playsinline', '1');
    url.searchParams.set('rel', '0');
    url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('start', String(offsetSeconds));
    if (window.location.origin !== 'null') url.searchParams.set('origin', window.location.origin);
    frame.src = url.toString();
    this.applyJukeboxVolume();
  }

  /**
   * The jukebox player talking back. It volunteers the length of the record as
   * soon as it has one, which is the only way the festival can move the running
   * order on at the right moment rather than at a guess.
   */
  private readonly jukeboxMessage = (event: MessageEvent): void => {
    if (!this.jukeboxFrame || event.source !== this.jukeboxFrame.contentWindow) return;
    if (typeof event.data !== 'string') return;
    let payload: { event?: string; info?: { duration?: number } };
    try {
      payload = JSON.parse(event.data) as typeof payload;
    } catch {
      return;
    }
    const seconds = payload?.info?.duration;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 5) return;
    const youtubeId = this.jukeboxPlayingId;
    if (!youtubeId || this.jukeboxReportedDurations.get(youtubeId) === Math.round(seconds)) return;
    this.jukeboxReportedDurations.set(youtubeId, Math.round(seconds));
    if (this.festivalClient.online) void this.festivalClient.reportJukeboxDuration(youtubeId, Math.round(seconds));
  };

  private stopJukebox(): void {
    this.jukeboxPlayingId = undefined;
    this.updateJukeboxSoundPrompt();
    if (!this.jukeboxFrame) return;
    this.jukeboxFrame.remove();
    this.jukeboxFrame = undefined;
    this.jukeboxPlayingId = undefined;
    this.jukeboxStartedAt = 0;
  }

  /**
   * A phone will not raise a sound that no finger asked for, and the record
   * starts on the festival's clock rather than on a tap. So every touch of the
   * page is taken as the permission it is, and the volume is put where it
   * belongs. Throttled: fingers land often and this costs a round of messages.
   */
  private readonly liftJukeboxOnGesture = (): void => {
    const now = performance.now();
    if (now - this.lastJukeboxLiftAt < 1_200) return;
    this.lastJukeboxLiftAt = now;
    this.applyJukeboxVolume();
  };

  private applyJukeboxVolume(): void {
    const frame = this.jukeboxFrame?.contentWindow;
    if (!frame) return;
    const level = this.jukeboxSilenced || this.audioMuted ? 0 : Math.round(this.jukeboxVolume * 100);
    const send = (func: string, args: unknown[] = []) => {
      frame.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    };
    // Announce this page as a listener first. Without it a player that has not
    // been spoken to yet discards the commands that follow.
    frame.postMessage(JSON.stringify({ event: 'listening', id: 'jukebox' }), '*');
    this.updateJukeboxSoundPrompt();
    send('setVolume', [level]);
    if (level === 0) send('mute');
    else {
      send('unMute');
      send('playVideo');
    }
  }

  /**
   * The death card. Deliberately just the words and the dark: no meter, no
   * count of what it took, nothing to study afterwards. It clears itself.
   */
  private showDeath(by?: string): void {
    const layer = document.querySelector<HTMLElement>('.world-death');
    if (!layer) return;
    const zh = this.language === 'zh-TW';
    const line = zh ? '你死了' : 'YOU DIED';
    const under = by
      ? (zh ? `被 ${this.escapeHtml(by)} 打倒 · 於寺廟醒來` : `PUT DOWN BY ${this.escapeHtml(by)} · YOU WAKE IN THE TEMPLE`)
      : (zh ? '於寺廟醒來' : 'YOU WAKE IN THE TEMPLE');
    layer.innerHTML = `<strong>${line}</strong><small>${under}</small>`;
    window.clearTimeout(this.deathTimer);
    layer.dataset.shown = 'on';
    this.deathTimer = window.setTimeout(() => {
      delete layer.dataset.shown;
    }, 3_400);
  }

  /**
   * The screen's answer to a punch: '1' for taking one, '2' for landing one.
   * Held on for a beat and then released, and the class does the fading — the
   * page is doing nothing else at that moment, so this stays off the frame
   * loop the world is running.
   */
  private flashImpact(kind?: '1' | '2'): void {
    if (!kind) return;
    const layer = document.querySelector<HTMLElement>('[data-impact]');
    if (!layer) return;
    window.clearTimeout(this.impactTimer);
    layer.dataset.hit = kind;
    this.impactTimer = window.setTimeout(() => {
      delete layer.dataset.hit;
    }, kind === '1' ? 120 : 70);
  }

  private showWorldAlert(message: string): void {
    const alert = this.root.querySelector<HTMLElement>('#world-alert');
    if (!alert) return;
    alert.textContent = message;
    alert.hidden = false;
    window.setTimeout(() => {
      if (alert.textContent === message) alert.hidden = true;
    }, 2200);
  }

  private questPanelContent(): string {
    const language = this.language;
    const done = this.completedQuests.size;
    return `
      <div class="quest-progress" aria-label="${done} / ${QUEST_TOTAL}">
        <p class="eyebrow">${language === 'zh-TW' ? '本次造訪' : 'THIS VISIT'}</p>
        <strong>${done}<span> / ${QUEST_TOTAL}</span></strong>
        <div><i style="width:${Math.round(done / QUEST_TOTAL * 100)}%"></i></div>
        <p>${language === 'zh-TW'
          ? '完成基本操作、探索場地並參與影展。離開世界後進度會重設。'
          : 'Learn the controls, explore the venues and join the festival. Progress resets when you leave.'}</p>
      </div>
      ${QUEST_SECTIONS.map((section) => `
        <section class="quest-section">
          <h2>${section.title[language]}</h2>
          <ol>
            ${section.quests.map((item) => {
              const complete = this.completedQuests.has(item.id);
              return `<li class="${complete ? 'is-complete' : ''}">
                <span class="quest-check" aria-hidden="true">${complete ? '✓' : '○'}</span>
                <div><strong>${this.escapeHtml(item.title[language])}</strong><small>${this.escapeHtml(item.hint[language])}</small></div>
              </li>`;
            }).join('')}
          </ol>
        </section>`).join('')}
      ${this.questCelebrated ? `<p class="quest-complete-note">${language === 'zh-TW'
        ? '全部完成。煙火重播已解鎖於通行證選單。'
        : 'ALL COMPLETE. FIREWORKS REPLAY IS UNLOCKED IN THE PASS MENU.'}</p>` : ''}`;
  }

  private completeQuest(id: QuestId): void {
    if (this.completedQuests.has(id)) return;
    this.completedQuests.add(id);
    this.refreshQuestUi();
    if (this.completedQuests.size < QUEST_TOTAL || this.questCelebrated) return;
    this.questCelebrated = true;
    this.refreshQuestUi();
    this.world?.startFireworks();
    this.showWorldAlert(this.language === 'zh-TW'
      ? '任務全部完成 · 海上煙火升空'
      : 'ALL OBJECTIVES COMPLETE · FIREWORKS OVER THE SEA');
  }

  private refreshQuestUi(): void {
    const count = this.root.querySelector<HTMLElement>('[data-quest-count]');
    if (count) count.textContent = `${this.completedQuests.size}/${QUEST_TOTAL}`;
    const viewportCount = this.root.querySelector<HTMLElement>('[data-objective-count]');
    if (viewportCount) viewportCount.textContent = `${this.completedQuests.size}/${QUEST_TOTAL}`;
    const replay = this.root.querySelector<HTMLButtonElement>('[data-replay-fireworks]');
    if (replay) replay.hidden = !this.questCelebrated;
    if (this.activePanel !== 'quests') return;
    const body = this.root.querySelector<HTMLElement>('#panel .panel__body');
    if (body) body.innerHTML = this.questPanelContent();
  }

  private resetQuestProgress(): void {
    this.completedQuests.clear();
    this.questCelebrated = false;
    this.world?.stopFireworks();
    this.refreshQuestUi();
  }

  private openPanel(panelId: PanelId): void {
    const panel = this.root.querySelector<HTMLElement>('#panel');
    if (!panel) return;
    if (panelId === 'map') this.completeQuest('map');
    if (panelId === 'programme') this.completeQuest('programme');
    this.closeFestivalPass();
    this.activePanel = panelId;
    panel.className = `panel${panelId === 'chat' ? ' panel--chat' : ''}${panelId === 'character' ? ' panel--character' : ''}`;
    panel.hidden = false;
    panel.innerHTML = `
      <header class="panel__header"><p><span>${this.language === 'zh-TW' ? '影展通行證' : 'FESTIVAL PASS'} /</span> ${panelLabels[this.language][panelId]}</p><button id="panel-close" type="button" aria-label="${this.language === 'zh-TW' ? '關閉' : 'Close'}">×</button></header>
      <div class="panel__body">${this.panelContent(panelId)}</div>
    `;
    panel.querySelector<HTMLButtonElement>('#panel-close')?.addEventListener('click', () => {
      panel.hidden = true;
      panel.className = 'panel';
      this.activePanel = undefined;
    });
    this.bindPanelActions(panelId, panel);
    if (panelId === 'admin' && this.staffKey && !this.adminState && !this.adminError) void this.refreshAdminState();
  }

  private closeFestivalPass(): void {
    const toggle = this.root.querySelector<HTMLButtonElement>('#pass-toggle');
    const pass = this.root.querySelector<HTMLElement>('#festival-pass');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      const sign = toggle.querySelector('span:last-child');
      if (sign) sign.textContent = '+';
    }
    if (pass) pass.hidden = true;
  }

  private panelContent(panelId: PanelId): string {
    switch (panelId) {
      case 'quests':
        return this.questPanelContent();
      case 'map':
        return `
          <p class="panel-intro">${this.language === 'zh-TW' ? '選擇入口即可快速移動。' : 'Choose an entrance to fast travel.'}</p>
          <div class="map-card" aria-label="${this.language === 'zh-TW' ? '影展地圖' : 'Festival map'}">
            <div class="map-sea">${this.language === 'zh-TW' ? '地中海' : 'MEDITERRANEAN<br />SEA'}</div>
            <span class="map-branch" aria-hidden="true"></span>
            <button class="map-node map-node--gate" data-travel="gate">${this.language === 'zh-TW' ? '影展入口' : 'FESTIVAL GATE'}</button>
            <button class="map-node map-node--palace" data-travel="palace">${this.escapeHtml(this.venueName('palace'))}<small>${this.categoryLabel('COMMERCIAL')}</small></button>
            <button class="map-node map-node--square" data-travel="square">${this.language === 'zh-TW' ? '我的廣場' : 'MY SQUARE'}</button>
            <button class="map-node map-node--drive" data-travel="drive-in">${this.escapeHtml(this.venueName('drive-in'))}<small>${this.categoryLabel('TELEVISION')}</small></button>
            <button class="map-node map-node--shore" data-travel="shore">${this.escapeHtml(this.venueName('shore'))}<small>${this.categoryLabel('MUSIC VIDEO')}</small></button>
            <button class="map-node map-node--rooftop" data-travel="rooftop">${this.escapeHtml(this.venueName('rooftop'))}<small>${this.categoryLabel('ORIGINALS')}</small></button>
            <button class="map-node map-node--club" data-travel="club">${this.escapeHtml(this.venueName('club'))}<small>${this.categoryLabel('ORIGINALS')}</small></button>
          </div>`;
      case 'programme':
        {
        const venues: VenueKey[] = VENUE_KEYS;
        const venue = venues[Math.max(0, this.programmeRotationIndex) % venues.length];
        const film = this.publicFilm(venue);
        const playlist = this.venueFilms(venue);
        const filmIndex = Math.max(0, playlist.findIndex((entry) => entry.id === film.id));
        const next = playlist[(filmIndex + 1) % playlist.length];
        return `
          <div class="programme-focus" id="programme-focus" data-venue="${venue}">
            <p class="eyebrow" data-programme-eyebrow>${this.language === 'zh-TW' ? '現正放映' : 'NOW PLAYING'} · ${this.escapeHtml(this.venueName(venue))} · ${this.language === 'zh-TW' ? '切換倒數' : 'ROTATES IN'} <span id="programme-rotate-countdown">${8 - Math.floor((Date.now() / 1000) % 8)}</span>${this.language === 'zh-TW' ? '秒' : 'S'}</p>
            <h2 data-programme-title>${this.escapeHtml(this.filmTitle(film))}</h2>
            <dl>
              <div><dt>${this.language === 'zh-TW' ? '節目' : 'PROGRAMME'}</dt><dd data-programme-category>${this.escapeHtml(this.categoryLabel(film.category))}</dd></div>
              <div><dt>${this.language === 'zh-TW' ? '導演' : 'DIRECTOR'}</dt><dd data-programme-director>${this.escapeHtml(film.creator ?? (this.language === 'zh-TW' ? '我的檔期典藏' : 'MYSCHEDULE ARCHIVE'))}</dd></div>
              <div><dt>${this.language === 'zh-TW' ? '年份' : 'YEAR'}</dt><dd data-programme-year>${film.year ?? (this.language === 'zh-TW' ? '典藏' : 'ARCHIVE')}</dd></div>
              <div><dt>${this.language === 'zh-TW' ? '串流' : 'STREAM'}</dt><dd data-programme-stream>${filmIndex + 1} / ${playlist.length}</dd></div>
              <div><dt>${this.language === 'zh-TW' ? '下一部' : 'UP NEXT'}</dt><dd data-programme-next>${this.escapeHtml(this.filmTitle(next ?? film))}</dd></div>
            </dl>
          </div>
          <p class="programme-library-count">${this.totalFilmCount()} ${this.language === 'zh-TW' ? `部作品 · ${VENUE_KEYS.length} 座場地` : `WORKS · ${VENUE_KEYS.length} VENUES`}</p>
          ${VENUE_KEYS.map((key) => this.venueCatalogue(this.venueName(key), this.venueFilms(key))).join('')}
        `;
        }
      case 'chat':
        return this.chatPanelContent();
      case 'attendees':
        {
        const feedCounts = this.networkState?.mentorFeedCounts ?? { visitors: {}, npcs: {} };
        const feedLabel = (count: number) => `<span class="attendee-feed-count">${this.language === 'zh-TW' ? '餵食' : 'FEED'} ×${count}</span>`;
        const selfVisitor = this.networkState?.visitors.find((visitor) => visitor.id === this.networkState?.selfId);
        const selfFeedCount = selfVisitor?.npcId && selfVisitor.npcId !== 'MENTOR'
          ? feedCounts.npcs[selfVisitor.npcId] ?? 0
          : feedCounts.visitors[this.networkState?.selfId ?? ''] ?? 0;
        const remoteVisitors = this.networkState?.visitors.filter((visitor) => visitor.id !== this.networkState?.selfId) ?? [];
        const visibleNpcProfiles = this.npcProfiles
          .slice(0, this.snapshot?.npcCount ?? 5)
          .map((profile, originalIndex) => ({ profile, originalIndex }))
          .sort((left, right) => left.profile.name.localeCompare(right.profile.name, this.language === 'zh-TW' ? 'zh-Hant' : 'en', {
            sensitivity: 'base',
            numeric: true,
          }));
        return `
          <p class="panel-intro">${this.connectionStatus === 'online'
            ? (this.language === 'zh-TW' ? `${remoteVisitors.length + 1} 位線上觀影者` : `${remoteVisitors.length + 1} LIVE VISITOR${remoteVisitors.length ? 'S' : ''}`)
            : (this.language === 'zh-TW' ? '離線模式 · 正在重新連線' : 'OFFLINE · RECONNECTING')}</p>
          <ul class="attendee-list">
            <li><span class="status-dot"></span><strong>${this.escapeHtml(this.currentId)}</strong><small>${this.localizeLocation(this.snapshot?.location ?? 'FESTIVAL GATE')}${window.innerWidth < 780 ? ` · ${this.language === 'zh-TW' ? '手機' : 'PHONE'}` : ''}${selfVisitor?.npcId === 'MENTOR' ? '' : feedLabel(selfFeedCount)}</small></li>
            ${remoteVisitors.map((visitor) => {
              const count = visitor.npcId && visitor.npcId !== 'MENTOR'
                ? feedCounts.npcs[visitor.npcId] ?? 0
                : feedCounts.visitors[visitor.id] ?? 0;
              return `<li><span class="status-dot"></span><strong>${this.escapeHtml(visitor.name)}</strong><small>${this.escapeHtml(this.localizeLocation(visitor.presence.location))}${visitor.seatedAt ? ` · ${this.escapeHtml(visitor.seatedAt)}` : ''}${visitor.npcId === 'MENTOR' ? '' : feedLabel(count)}</small></li>`;
            }).join('')}
            ${visibleNpcProfiles.map(({ profile, originalIndex }) => `<li><span class="npc-dot">NPC</span><strong>${this.escapeHtml(profile.name)}<em>${this.escapeHtml(profile.title)}</em></strong><small>${this.escapeHtml(this.localizeLocation(
              profile.id === 'XIEHGAN' ? 'THE BASEMENT'
                : profile.id === 'DRBEAUTY' ? 'THE ROOFTOP'
                : originalIndex < 4 ? 'MY SQUARE'
                  : originalIndex < 6 ? 'THE PALACE'
                    : originalIndex < 8 ? 'DRIVE-IN 88' : 'THE SHORE'))}${profile.id === 'MENTOR' ? '' : feedLabel(feedCounts.npcs[profile.id] ?? 0)}</small></li>`).join('')}
          </ul>`;
        }
      case 'pamphlet':
        return `
          <div class="pamphlet-layout">
            <div class="pamphlet-video"><iframe src="https://www.youtube.com/embed/${this.escapeAttribute(this.pamphlet.youtubeId)}?controls=1&playsinline=1&rel=0" title="My Schedule highlight reel" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
            <article>
              <p class="eyebrow">${this.escapeHtml(this.pamphlet.eyebrow)}</p>
              <h2>${this.escapeHtml(this.language === 'zh-TW' ? this.pamphlet.titleZh : this.pamphlet.title)}</h2>
              <p>${this.escapeHtml(this.language === 'zh-TW' ? this.pamphlet.introductionZh : this.pamphlet.introduction)}</p>
            </article>
          </div>
          ${this.staffKey && this.adminState ? `
            <button class="pamphlet-edit-toggle" type="button" data-pamphlet-edit-toggle>${this.language === 'zh-TW' ? '編輯手冊' : 'EDIT PAMPHLET'}</button>
            <form class="pamphlet-editor" id="pamphlet-editor" hidden>
              <label>${this.language === 'zh-TW' ? 'YouTube 連結' : 'YOUTUBE LINK'}<input name="youtubeUrl" type="url" required value="https://youtu.be/${this.escapeAttribute(this.pamphlet.youtubeId)}" /></label>
              <label>${this.language === 'zh-TW' ? '頁首' : 'EYEBROW'}<input name="eyebrow" maxlength="60" required value="${this.escapeAttribute(this.pamphlet.eyebrow)}" /></label>
              <label>${this.language === 'zh-TW' ? '英文標題' : 'ENGLISH TITLE'}<input name="title" maxlength="80" required value="${this.escapeAttribute(this.pamphlet.title)}" /></label>
              <label>${this.language === 'zh-TW' ? '中文標題' : 'CHINESE TITLE'}<input name="titleZh" maxlength="80" required value="${this.escapeAttribute(this.pamphlet.titleZh)}" /></label>
              <label class="pamphlet-editor__wide">${this.language === 'zh-TW' ? '英文介紹' : 'ENGLISH INTRODUCTION'}<textarea name="introduction" maxlength="1200" required>${this.escapeHtml(this.pamphlet.introduction)}</textarea></label>
              <label class="pamphlet-editor__wide">${this.language === 'zh-TW' ? '中文介紹' : 'CHINESE INTRODUCTION'}<textarea name="introductionZh" maxlength="1200" required>${this.escapeHtml(this.pamphlet.introductionZh)}</textarea></label>
              <button type="submit">${this.language === 'zh-TW' ? '更新手冊' : 'UPDATE PAMPHLET'}</button>
            </form>` : ''}`;
      case 'character':
        return `
          <div class="panel-palette">${paletteInputs
            .map((slot) => `<label><span>${paletteLabels[this.language][slot]}</span><input type="color" data-world-palette="${slot}" value="${this.palette[slot]}" /></label>`)
            .join('')}</div>`;
      case 'jukebox': {
        const zh = this.language === 'zh-TW';
        const jukebox = this.networkState?.jukebox;
        if (!jukebox || !jukebox.tracks.length) {
          return `<p class="panel-intro">${zh
            ? '點唱機還是空的。工作人員可以從工作人員面板放入唱片。'
            : 'The jukebox is empty. STAFF stock it from the staff panel.'}</p>`;
        }
        const playing = jukebox.nowPlaying;
        const mine = jukebox.queue.filter((entry) => entry.requestedBy === this.networkState?.selfId).length;
        return `
          <p class="panel-intro">${zh
            ? '整個影展一起聽同一張唱片。影廳、俱樂部與屋頂不受影響。'
            : 'One record, heard across the whole festival. The theatres, the club and the rooftop are left alone.'}</p>
          <div class="jukebox-now">
            <span class="eyebrow">${zh ? '播放中' : 'NOW PLAYING'}</span>
            <strong>${playing ? this.escapeHtml(playing.title) : (zh ? '目前沒唱片在播放' : 'NOTHING PLAYING')}</strong>
            ${playing?.requestedByName ? `<small>${zh ? '由' : 'FOR'} ${this.escapeHtml(playing.requestedByName)}</small>` : ''}
          </div>
          <div class="jukebox-queue">
            <span class="eyebrow">${zh ? `等待中 · ${jukebox.queue.length}` : `WAITING · ${jukebox.queue.length}`}</span>
            ${jukebox.queue.length
              ? `<ol>${jukebox.queue.map((entry) => `<li><strong>${this.escapeHtml(entry.title)}</strong><small>${this.escapeHtml(entry.requestedByName ?? '')}</small></li>`).join('')}</ol>`
              : `<p class="panel-note">${zh ? '沒有人排隊。' : 'Nobody is waiting.'}</p>`}
          </div>
          <span class="eyebrow">${zh ? '選一張' : 'PUT ONE ON'}</span>
          ${mine ? `<p class="panel-note">${zh ? `你有 ${mine} 張在等。` : `${mine} of yours waiting.`}</p>` : ''}
          <div class="jukebox-picks">
            ${jukebox.tracks.map((track) => `<button type="button" data-jukebox-pick="${this.escapeAttribute(track.id)}">${this.escapeHtml(track.title)}</button>`).join('')}
          </div>`;
      }
      case 'sound':
        return `
          <label class="range-field"><span>${this.language === 'zh-TW' ? '主音量' : 'MASTER'}</span><input data-volume="master" type="range" min="0" max="1" value="0.7" step="0.01" /></label>
          <label class="range-field"><span>${this.language === 'zh-TW' ? '環境音' : 'ENVIRONMENT'}</span><input data-volume="ambient" type="range" min="0" max="1" value="0.28" step="0.01" /></label>
          <label class="range-field"><span>${this.language === 'zh-TW' ? '放映音量' : 'SCREENING'}</span><input data-volume="screening" type="range" min="0" max="1" value="0.85" step="0.01" /></label>
          <label class="range-field"><span>${this.language === 'zh-TW' ? '點唱機' : 'JUKEBOX'}</span><input data-volume="jukebox" type="range" min="0" max="1" value="${this.jukeboxVolume}" step="0.01" /></label>
          <p class="panel-note">${this.language === 'zh-TW'
            ? '點唱機音量只影響你自己，不會改變別人聽到的。'
            : 'The jukebox slider is yours alone — it does not change what anybody else hears.'}</p>
          <button class="panel-button" data-mute="true">${this.audioMuted ? (this.language === 'zh-TW' ? '開啟聲音' : 'UNMUTE') : (this.language === 'zh-TW' ? '靜音' : 'MUTE')}</button>`;
      case 'graphics':
        return `
          <p class="panel-intro">${this.language === 'zh-TW' ? '精簡模式可提升效能。' : 'Lite mode improves performance.'}</p>
          <div class="segmented segmented--dark">
            <button data-world-graphics="normal" aria-pressed="${this.graphicsMode === 'normal'}">${this.language === 'zh-TW' ? '一般' : 'NORMAL'}</button>
            <button data-world-graphics="lite" aria-pressed="${this.graphicsMode === 'lite'}">${this.language === 'zh-TW' ? '精簡' : 'LITE'}</button>
          </div>
          <button class="panel-button" data-camera-toggle>${this.language === 'zh-TW' ? '切換視角鏡頭' : 'TOGGLE PERSPECTIVE CAMERA'}</button>`;
      case 'controls':
        return `
          <dl class="controls-list"><div><dt>WASD / 方向鍵</dt><dd>${this.language === 'zh-TW' ? '移動／游泳' : 'Move / swim'}</dd></div><div><dt>E</dt><dd>${this.language === 'zh-TW' ? '互動／餵 MENTOR 吃點心' : 'Interact / give MENTOR a treat'}</dd></div><div><dt>SHIFT + E</dt><dd>${this.language === 'zh-TW' ? '抱起 MENTOR' : 'Pick up MENTOR'}</dd></div><div><dt>SHIFT</dt><dd>${this.language === 'zh-TW' ? '奔跑' : 'Run'}</dd></div><div><dt>SPACE</dt><dd>${this.language === 'zh-TW' ? '跳躍（可從高處跳下）' : 'Jump — and drop from high places'}</dd></div><div><dt>B</dt><dd>${this.language === 'zh-TW' ? '跳舞' : 'Dance'}</dd></div><div><dt>O</dt><dd>${this.language === 'zh-TW' ? '供養／佈施：在神像前或 NPC 旁' : 'Make an offering — at the altar or beside an NPC'}</dd></div><div><dt>${this.language === 'zh-TW' ? '滑鼠左鍵' : 'LEFT CLICK'}</dt><dd>${this.language === 'zh-TW' ? '出拳（被打中會鬆手放開 MENTOR）' : 'Throw a punch — anyone hit drops MENTOR'}</dd></div><div><dt>T</dt><dd>${this.language === 'zh-TW' ? '切換鏡頭' : 'Change camera'}</dd></div><div><dt>C</dt><dd>${this.language === 'zh-TW' ? '拍照模式／明信片模式／離開' : 'Camera mode / postcard mode / exit'}</dd></div><div><dt>${this.language === 'zh-TW' ? '滑鼠拖曳' : 'DRAG MOUSE'}</dt><dd>${this.language === 'zh-TW' ? '轉動視角' : 'Turn the view'}</dd></div><div><dt>${this.language === 'zh-TW' ? '滾輪／觸控板縮放' : 'WHEEL / PINCH'}</dt><dd>${this.language === 'zh-TW' ? '鏡頭遠近' : 'Move the camera in and out'}</dd></div><div><dt>ENTER</dt><dd>${this.language === 'zh-TW' ? '開啟聊天' : 'Open chat'}</dd></div><div><dt>PASS</dt><dd>${this.language === 'zh-TW' ? '開啟選單' : 'Open menu'}</dd></div></dl>`;
      case 'contact':
        return `
          <div class="contact-list">
            <button data-copy="0935829620"><span>${this.language === 'zh-TW' ? '電話' : 'PHONE'}</span>0935 829 620</button>
            <button data-copy="santana30541@gmail.com"><span>${this.language === 'zh-TW' ? '電子郵件' : 'EMAIL'}</span>santana30541@gmail.com</button>
            <a href="https://www.instagram.com/myschedule_ltd/" target="_blank" rel="noreferrer"><span>INSTAGRAM</span>@myschedule_ltd ↗</a>
            <a href="https://www.youtube.com/@myschedulestudio" target="_blank" rel="noreferrer"><span>YOUTUBE</span>@myschedulestudio ↗</a>
          </div>`;
      case 'admin':
        return this.adminPanelContent();
    }
  }

  private bindPanelActions(panelId: PanelId, panel: HTMLElement): void {
    panel.querySelectorAll<HTMLButtonElement>('[data-travel]').forEach((button) => {
      button.addEventListener('click', () => {
        this.world?.fastTravel(button.dataset.travel as 'gate' | 'square' | 'palace' | 'drive-in' | 'shore' | 'club' | 'rooftop');
        panel.hidden = true;
      });
    });
    panel.querySelectorAll<HTMLInputElement>('[data-world-palette]').forEach((input) => {
      input.addEventListener('input', () => {
        const slot = input.dataset.worldPalette as keyof AvatarPalette;
        this.palette = { ...this.palette, [slot]: input.value };
        this.world?.setAvatarPalette(this.palette);
      });
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-world-graphics]').forEach((button) => {
      setButtonPressed(button, button.dataset.worldGraphics === this.graphicsMode);
      button.addEventListener('click', () => {
        this.graphicsMode = button.dataset.worldGraphics as GraphicsMode;
        this.world?.setGraphicsMode(this.graphicsMode);
        panel.querySelectorAll<HTMLButtonElement>('[data-world-graphics]').forEach((candidate) =>
          setButtonPressed(candidate, candidate === button),
        );
      });
    });
    panel.querySelector<HTMLButtonElement>('[data-camera-toggle]')?.addEventListener('click', () => {
      this.world?.toggleCameraMode();
    });
    panel.querySelector<HTMLButtonElement>('[data-mute]')?.addEventListener('click', (event) => {
      this.audioMuted = !this.audioMuted;
      this.world?.audio.setMuted(this.audioMuted);
      // The jukebox is its own player and was never told, so turning the
      // festival's sound on left the square silent until the slider was moved.
      this.applyJukeboxVolume();
      this.sendScreenCommand(this.audioMuted ? 'mute' : 'unMute');
      this.world?.setPublicScreenMuted(
        this.snapshot?.inTheater ? this.activeVenue : undefined,
        this.audioMuted || !this.snapshot?.inTheater || this.screenMode === 'private',
      );
      (event.currentTarget as HTMLButtonElement).textContent = this.audioMuted
        ? (this.language === 'zh-TW' ? '開啟聲音' : 'UNMUTE')
        : (this.language === 'zh-TW' ? '靜音' : 'MUTE');
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-jukebox-pick]').forEach((button) => {
      button.addEventListener('click', () => {
        const trackId = button.dataset.jukeboxPick ?? '';
        button.disabled = true;
        void this.festivalClient.requestJukeboxTrack(trackId).then((result) => {
          const zh = this.language === 'zh-TW';
          if (!result.ok) {
            button.disabled = false;
            this.showWorldAlert(result.message ?? (zh ? '點播失敗' : 'THAT DID NOT GO ON'));
            return;
          }
          this.showWorldAlert(zh ? '已排入點唱機' : 'QUEUED ON THE JUKEBOX');
          if (this.activePanel === 'jukebox') this.openPanel('jukebox');
        });
      });
    });
    panel.querySelectorAll<HTMLInputElement>('[data-volume]').forEach((input) => {
      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (input.dataset.volume === 'master') this.world?.audio.setMasterVolume(value);
        if (input.dataset.volume === 'ambient') this.world?.audio.setAmbientVolume(value);
        if (input.dataset.volume === 'jukebox') {
          this.jukeboxVolume = value;
          try { window.localStorage.setItem(JUKEBOX_VOLUME_KEY, String(value)); } catch { /* private mode */ }
          this.applyJukeboxVolume();
        }
        if (input.dataset.volume === 'screening') {
          this.world?.audio.setScreeningVolume(value);
          this.sendScreenCommand('setVolume', [Math.round(value * 100)]);
          this.world?.setPublicScreenVolume(value);
        }
      });
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        await navigator.clipboard.writeText(button.dataset.copy ?? '');
        const original = button.innerHTML;
        button.innerHTML = this.language === 'zh-TW' ? '<span>已複製</span>剪貼簿' : '<span>COPIED</span>TO CLIPBOARD';
        window.setTimeout(() => (button.innerHTML = original), 1200);
      });
    });

    if (panelId === 'admin') {
      const gateEditor = panel.querySelector<HTMLFormElement>('#gate-copy-editor');
      gateEditor?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(gateEditor);
        const button = gateEditor.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (button) button.disabled = true;
        const field = (name: string) => String(data.get(name) ?? '');
        void this.festivalClient.updateGateCopy(this.staffKey, {
          kicker: field('kicker'), kickerZh: field('kickerZh'),
          title: field('title'), titleZh: field('titleZh'),
          intro: field('intro'), introZh: field('introZh'),
          nameLabel: field('nameLabel'), nameLabelZh: field('nameLabelZh'),
        }).then(async () => {
          await this.refreshAdminState(false);
          this.showWorldAlert(this.language === 'zh-TW' ? '入口文字已更新' : 'GATE COPY SAVED');
        }).catch((error: unknown) => {
          this.showWorldAlert(error instanceof Error ? error.message : (this.language === 'zh-TW' ? '儲存失敗' : 'COULD NOT SAVE'));
        }).finally(() => {
          if (button) button.disabled = false;
        });
      });
      const jukeboxEditor = panel.querySelector<HTMLFormElement>('#jukebox-editor');
      jukeboxEditor?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(jukeboxEditor);
        void this.festivalClient.updateJukebox(this.staffKey, {
          url: String(data.get('url') ?? ''),
          title: String(data.get('title') ?? ''),
        })
          .then(() => { this.adminError = ''; jukeboxEditor.reset(); return this.refreshAdminState(); })
          .catch((error) => {
            this.adminError = error instanceof Error ? error.message : 'Jukebox update failed.';
            this.openPanel('admin');
          });
      });
      // Every jukebox control goes the same way: send it, then re-read the
      // state so the panel shows what the service actually did.
      const jukeboxAction = (payload: Parameters<typeof this.festivalClient.updateJukebox>[1]) => {
        void this.festivalClient.updateJukebox(this.staffKey, payload)
          .then(() => { this.adminError = ''; return this.refreshAdminState(); })
          .catch((error) => {
            this.adminError = error instanceof Error ? error.message : 'Jukebox update failed.';
            this.openPanel('admin');
          });
      };
      panel.querySelector<HTMLButtonElement>('[data-jukebox-skip]')?.addEventListener('click', () => jukeboxAction({ skip: true }));
      panel.querySelector<HTMLButtonElement>('[data-jukebox-stop]')?.addEventListener('click', () => jukeboxAction({ stop: true }));
      panel.querySelectorAll<HTMLButtonElement>('[data-jukebox-move]').forEach((button) => {
        button.addEventListener('click', () => jukeboxAction({
          reorder: button.dataset.jukeboxMove ?? '',
          direction: button.dataset.direction === 'up' ? 'up' : 'down',
        }));
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-jukebox-drop]').forEach((button) => {
        button.addEventListener('click', () => jukeboxAction({ drop: button.dataset.jukeboxDrop ?? '' }));
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-jukebox-remove]').forEach((button) => {
        button.addEventListener('click', () => {
          void this.festivalClient.updateJukebox(this.staffKey, { remove: button.dataset.jukeboxRemove ?? '' })
            .then(() => { this.adminError = ''; return this.refreshAdminState(); })
            .catch((error) => {
              this.adminError = error instanceof Error ? error.message : 'Jukebox update failed.';
              this.openPanel('admin');
            });
        });
      });
      const entranceEditor = panel.querySelector<HTMLFormElement>('#entrance-sign-editor');
      entranceEditor?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(entranceEditor);
        void this.festivalClient.updateEntranceSign(this.staffKey, {
          title: String(data.get('title') ?? ''),
          subtitle: String(data.get('subtitle') ?? ''),
        })
          .then(() => this.refreshAdminState())
          .catch((error) => {
            this.adminError = error instanceof Error ? error.message : 'Entrance sign update failed.';
            this.openPanel('admin');
          });
      });
      const templeEditor = panel.querySelector<HTMLFormElement>('#temple-sign-editor');
      templeEditor?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(templeEditor);
        void this.festivalClient.updateTempleSign(this.staffKey, {
          name: String(data.get('name') ?? ''),
          label: String(data.get('label') ?? ''),
        })
          .then(() => this.refreshAdminState())
          .catch((error) => {
            this.adminError = error instanceof Error ? error.message : 'Temple sign update failed.';
            this.openPanel('admin');
          });
      });
      const shopEditor = panel.querySelector<HTMLFormElement>('#shop-link-editor');
      shopEditor?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(shopEditor);
        const button = shopEditor.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (button) button.disabled = true;
        void this.festivalClient.updateShopLink(this.staffKey, {
          url: String(data.get('url') ?? ''),
          label: String(data.get('label') ?? ''),
          labelZh: String(data.get('labelZh') ?? ''),
        }).then(async () => {
          await this.refreshAdminState(false);
          this.showWorldAlert(this.language === 'zh-TW' ? '商店連結已更新' : 'STORE LINK SAVED');
        }).catch((error: unknown) => {
          this.showWorldAlert(error instanceof Error ? error.message : (this.language === 'zh-TW' ? '儲存失敗' : 'COULD NOT SAVE'));
        }).finally(() => {
          if (button) button.disabled = false;
        });
      });
    }

    if (panelId === 'pamphlet') {
      const editor = panel.querySelector<HTMLFormElement>('#pamphlet-editor');
      panel.querySelector<HTMLButtonElement>('[data-pamphlet-edit-toggle]')?.addEventListener('click', () => {
        if (editor) editor.hidden = !editor.hidden;
      });
      editor?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(editor);
        const button = editor.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (button) button.disabled = true;
        void this.festivalClient.updatePamphlet(this.staffKey, {
          youtubeUrl: String(data.get('youtubeUrl') ?? ''),
          eyebrow: String(data.get('eyebrow') ?? ''),
          title: String(data.get('title') ?? ''),
          titleZh: String(data.get('titleZh') ?? ''),
          introduction: String(data.get('introduction') ?? ''),
          introductionZh: String(data.get('introductionZh') ?? ''),
        }).then(async () => {
          await this.refreshAdminState(false);
          this.openPanel('pamphlet');
        }).catch((error) => {
          this.adminError = error instanceof Error ? error.message : 'Pamphlet update failed.';
          if (button) button.disabled = false;
        });
      });
    }

    if (panelId === 'chat') {
      panel.querySelectorAll<HTMLButtonElement>('[data-chat-channel]').forEach((button) => {
        setButtonPressed(button, button.dataset.chatChannel === this.chatChannel);
        button.addEventListener('click', () => {
          this.chatChannel = button.dataset.chatChannel as ChatChannel;
          this.openPanel('chat');
        });
      });
      const chatInput = panel.querySelector<HTMLInputElement>('#chat-message');
      // Writing Chinese puts an input method between the keyboard and the
      // field: the keys type a reading, the IME offers characters, and ENTER
      // accepts the one wanted. In several browsers that accepting keystroke
      // reaches the form as an ordinary ENTER, so every time somebody chose a
      // character the half-written line was sent and the field was emptied of
      // its meaning — which is what being cut off constantly is. Nobody typing
      // English ever saw it, because English never presses ENTER mid-word.
      //
      // Nothing is sent while a composition is open, nor in the moment after
      // one closes: the order of compositionend against the keystroke that
      // ended it is not the same in every browser, so the flag alone is not
      // enough to catch it.
      let composing = false;
      let composedAt = 0;
      chatInput?.addEventListener('compositionstart', () => { composing = true; });
      chatInput?.addEventListener('compositionend', () => {
        composing = false;
        composedAt = performance.now();
      });
      panel.querySelector<HTMLFormElement>('#chat-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        if (composing || performance.now() - composedAt < 250) return;
        const input = chatInput;
        const text = input?.value.trim() ?? '';
        if (!text) return;
        if (this.festivalClient.online) {
          // readOnly, not disabled. Disabling a focused field blurs it, which
          // drops the caret and closes the IME, so the line after every line
          // had to be started by clicking back into the box.
          if (input) input.readOnly = true;
          // Shown at once rather than waited for. It used to be sent and then
          // waited on, so your own line only appeared once the service had taken
          // it, broadcast it, and sent it back — which on a phone is long enough
          // to believe it was lost and say it again.
          const said = text.slice(0, 160);
          const pending: ChatMessage = {
            id: `pending-${Date.now()}`,
            author: this.currentId,
            channel: this.chatChannel,
            text: said,
            timestamp: Date.now(),
          };
          this.pendingChat = [...this.pendingChat, pending].slice(-8);
          this.addChatMessage(pending);
          void this.festivalClient.sendMessage(this.chatChannel, said).then((result) => {
            if (!result.ok) {
              // It never got there, so it should stop looking as though it had.
              this.pendingChat = this.pendingChat.filter((message) => message !== pending);
              this.chatMessages = this.chatMessages.filter((message) => message.id !== pending.id);
              this.renderChatStream();
              this.refreshOpenChatFeed();
              this.showWorldAlert(result.message ?? 'MESSAGE COULD NOT BE SENT');
            } else {
              // Sent lines used to stay in the box, so the next one was typed
              // onto the end of the last.
              if (input) input.value = '';
              this.completeQuest('chat');
            }
            if (input) {
              input.readOnly = false;
              input.focus();
            }
          });
        } else {
          this.addChatMessage({
            id: `visitor-${Date.now()}`,
            author: this.currentId,
            channel: this.chatChannel,
            text: text.slice(0, 160),
            timestamp: Date.now(),
          });
          this.completeQuest('chat');
          // Redraw the stream rather than the panel: rebuilding the panel threw
          // away the very field being typed into, focus and all.
          if (input) input.value = '';
          this.renderChatStream();
          input?.focus();
        }
      });
    }

    if (panelId === 'admin') {
      panel.querySelector<HTMLFormElement>('#staff-login')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = panel.querySelector<HTMLInputElement>('#staff-key');
        this.staffKey = input?.value ?? '';
        sessionStorage.setItem(STAFF_KEY, this.staffKey);
        void this.refreshAdminState();
      });
      panel.querySelectorAll<HTMLDetailsElement>('[data-staff-section]').forEach((section) => {
        section.addEventListener('toggle', () => {
          const id = section.dataset.staffSection ?? '';
          if (section.open) this.openStaffSections.add(id);
          else this.openStaffSections.delete(id);
          sessionStorage.setItem(STAFF_SECTIONS_KEY, JSON.stringify([...this.openStaffSections]));
        });
      });
      panel.querySelector<HTMLFormElement>('#staff-key-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const data = new FormData(form);
        const currentKey = String(data.get('currentKey') ?? '');
        const nextKey = String(data.get('nextKey') ?? '');
        const confirmKey = String(data.get('confirmKey') ?? '');
        const zh = this.language === 'zh-TW';
        if (nextKey !== confirmKey) {
          this.adminError = zh ? '兩次輸入的新金鑰不一致。' : 'The new keys do not match.';
          this.openPanel('admin');
          return;
        }
        void this.festivalClient.updateAdminKey(this.staffKey, currentKey, nextKey)
          .then(() => {
            // Keep this browser authenticated with the key it just set.
            this.staffKey = nextKey;
            sessionStorage.setItem(STAFF_KEY, nextKey);
            this.adminError = '';
            return this.refreshAdminState();
          })
          .then(() => this.showWorldAlert(zh ? '金鑰已更換' : 'STAFF KEY CHANGED'))
          .catch((error) => {
            this.adminError = error instanceof Error ? error.message : 'Key change failed.';
            this.openPanel('admin');
          });
      });
      panel.querySelectorAll<HTMLFormElement>('[data-tempo-form]').forEach((form) => {
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const youtubeId = form.dataset.tempoForm ?? '';
          const bpm = Number(new FormData(form).get('bpm'));
          void this.festivalClient.updateTrackTempo(this.staffKey, youtubeId, bpm)
            .then(() => this.refreshAdminState())
            .catch((error) => {
              this.adminError = error instanceof Error ? error.message : 'Tempo update failed.';
              this.openPanel('admin');
            });
        });
      });
      panel.querySelector<HTMLButtonElement>('[data-staff-refresh]')?.addEventListener('click', () => void this.refreshAdminState());
      panel.querySelector<HTMLButtonElement>('[data-staff-logout]')?.addEventListener('click', () => {
        this.staffKey = '';
        this.adminState = undefined;
        this.adminError = '';
        sessionStorage.removeItem(STAFF_KEY);
        this.openPanel('admin');
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-npc-play]').forEach((button) => {
        button.addEventListener('click', () => {
          const npcId = button.dataset.npcPlay || undefined;
          button.disabled = true;
          void this.festivalClient.impersonateNpc(this.staffKey, npcId)
            .then((identity) => {
              this.currentId = identity.name;
              this.controlledNpcId = identity.npcId;
              const selfVisitor = this.networkState?.visitors.find((visitor) => visitor.id === this.networkState?.selfId);
              if (selfVisitor) {
                selfVisitor.name = identity.name;
                selfVisitor.npcId = identity.npcId;
              }
              this.world?.setControlledNpcId(identity.npcId);
              this.handleConnectionStatus(this.connectionStatus);
              return this.refreshAdminState();
            })
            .catch((error) => {
              this.adminError = error instanceof Error ? error.message : 'NPC control failed.';
              this.openPanel('admin');
            });
        });
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-moderate]').forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.dataset.moderate as 'mute' | 'kick' | 'delete-message';
          const visitorId = button.dataset.visitorId;
          const messageId = button.dataset.messageId;
          const payload = action === 'delete-message' ? { messageId } : { visitorId, minutes: 5 };
          void this.festivalClient.moderate(this.staffKey, action, payload)
            .then(() => this.refreshAdminState())
            .catch((error) => {
              this.adminError = error instanceof Error ? error.message : 'Moderation action failed.';
              this.openPanel('admin');
            });
        });
      });
      panel.querySelectorAll<HTMLFormElement>('[data-npc-form]').forEach((form) => {
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const npcId = form.dataset.npcForm as NpcId;
          const name = form.querySelector<HTMLInputElement>('input[name="npcName"]')?.value.trim() ?? '';
          const title = form.querySelector<HTMLInputElement>('input[name="npcTitle"]')?.value.trim() ?? '';
          if (!name || !title) return;
          const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
          if (button) button.disabled = true;
          void this.festivalClient.updateNpcProfile(this.staffKey, npcId, name, title)
            .then(() => this.refreshAdminState())
            .catch((error) => {
              this.adminError = error instanceof Error ? error.message : 'NPC profile update failed.';
              this.openPanel('admin');
            });
        });
      });
      panel.querySelector<HTMLFormElement>('#staff-npc-add')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const name = form.querySelector<HTMLInputElement>('input[name="npcName"]')?.value.trim() ?? '';
        const title = form.querySelector<HTMLInputElement>('input[name="npcTitle"]')?.value.trim() ?? '';
        if (!name || !title) return;
        const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (button) button.disabled = true;
        void this.festivalClient.addNpc(this.staffKey, name, title)
          .then(() => this.refreshAdminState())
          .catch((error) => {
            this.adminError = error instanceof Error ? error.message : 'NPC creation failed.';
            this.openPanel('admin');
          });
      });
      panel.querySelectorAll<HTMLFormElement>('[data-programme-form]').forEach((form) => {
        const syncSpecialSource = () => {
          const source = form.querySelector<HTMLSelectElement>('select[name="specialSource"]')?.value ?? 'none';
          const library = form.querySelector<HTMLElement>('[data-special-library]');
          const youtube = form.querySelector<HTMLElement>('[data-special-youtube]');
          if (library) library.hidden = source !== 'library';
          if (youtube) youtube.hidden = source !== 'youtube';
        };
        form.querySelector<HTMLSelectElement>('select[name="specialSource"]')?.addEventListener('change', syncSpecialSource);
        syncSpecialSource();
        // Until STAFF pick a work themselves this stays pinned to whatever the
        // projector is showing, so it cannot go stale while the panel sits
        // open. Their choice wins from the moment they make it.
        form.querySelector<HTMLSelectElement>('select[name="currentYoutubeId"]')?.addEventListener('change', (event) => {
          delete (event.currentTarget as HTMLSelectElement).dataset.followsScreen;
        });
        form.querySelectorAll<HTMLButtonElement>('[data-order-move]').forEach((button) => {
          button.addEventListener('click', () => {
            const item = button.closest('li');
            if (!item) return;
            if (button.dataset.orderMove === 'up' && item.previousElementSibling) {
              item.parentElement?.insertBefore(item, item.previousElementSibling);
            }
            if (button.dataset.orderMove === 'down' && item.nextElementSibling) {
              item.parentElement?.insertBefore(item.nextElementSibling, item);
            }
            form.querySelectorAll<HTMLElement>('[data-programme-order] li b').forEach((number, index) => {
              number.textContent = String(index + 1);
            });
          });
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const venue = form.dataset.programmeForm as VenueKey;
          const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
          const order = [...form.querySelectorAll<HTMLElement>('[data-programme-order] li')]
            .map((item) => item.dataset.youtubeId ?? '')
            .filter(Boolean);
          const name = form.querySelector<HTMLInputElement>('input[name="venueName"]')?.value ?? defaultVenueLabels[venue];
          const subtitle = form.querySelector<HTMLInputElement>('input[name="venueSubtitle"]')?.value ?? '';
          const mode = form.querySelector<HTMLSelectElement>('select[name="mode"]')?.value as ProgrammeMode;
          const currentYoutubeId = form.querySelector<HTMLSelectElement>('select[name="currentYoutubeId"]')?.value ?? order[0];
          const specialSource = (form.querySelector<HTMLSelectElement>('select[name="specialSource"]')?.value ?? 'none') as 'none' | 'library' | 'youtube';
          const specialYoutubeId = form.querySelector<HTMLSelectElement>('select[name="specialYoutubeId"]')?.value ?? '';
          const specialYoutubeUrl = form.querySelector<HTMLInputElement>('input[name="specialYoutubeUrl"]')?.value ?? '';
          const specialStartsAt = form.querySelector<HTMLInputElement>('input[name="specialStartsAt"]')?.value ?? '';
          if (!order.length || !currentYoutubeId) return;
          if (button) button.disabled = true;
          void this.festivalClient.updateProgramme(this.staffKey, {
            venue, name, subtitle, order, currentYoutubeId, mode, specialSource, specialYoutubeId, specialYoutubeUrl, specialStartsAt,
          })
            .then(() => this.refreshAdminState())
            .catch((error) => {
              // Deliberately jumps to the top: the failure message renders
              // there, and keeping the reader's place would hide it.
              this.adminError = error instanceof Error ? error.message : 'Programme update failed.';
              this.openPanel('admin');
            });
        });
      });
      panel.querySelector<HTMLFormElement>('#staff-video-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const formData = new FormData(form);
        const year = Number(formData.get('year'));
        void this.festivalClient.addVideo(this.staffKey, {
          venue: String(formData.get('venue')) as VenueKey,
          youtubeUrl: String(formData.get('youtubeUrl') ?? ''),
          title: String(formData.get('title') ?? ''),
          titleZh: String(formData.get('titleZh') ?? ''),
          creator: String(formData.get('creator') ?? ''),
          year: Number.isFinite(year) && year > 0 ? year : undefined,
        }).then(() => this.refreshAdminState()).catch((error) => {
          this.adminError = error instanceof Error ? error.message : 'Video could not be added.';
          this.openPanel('admin');
        });
      });
      panel.querySelector<HTMLFormElement>('#staff-gate-background-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const youtubeUrl = new FormData(form).get('youtubeUrl');
        const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (button) button.disabled = true;
        void this.festivalClient.updateGateBackground(this.staffKey, String(youtubeUrl ?? ''))
          .then(() => this.refreshAdminState())
          .catch((error) => {
            this.adminError = error instanceof Error ? error.message : 'Gate background update failed.';
            this.openPanel('admin');
          });
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-video-remove]').forEach((button) => {
        button.addEventListener('click', () => {
          const venue = button.dataset.venue as VenueKey;
          const youtubeId = button.dataset.videoRemove ?? '';
          if (!venue || !youtubeId) return;
          button.disabled = true;
          void this.festivalClient.removeVideo(this.staffKey, venue, youtubeId)
            .then(() => this.refreshAdminState())
            .catch((error) => {
              this.adminError = error instanceof Error ? error.message : 'Video could not be removed.';
              this.openPanel('admin');
            });
        });
      });
      panel.querySelector<HTMLFormElement>('#staff-style-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const formData = new FormData(form);
        void this.festivalClient.updateSiteStyle(this.staffKey, {
          brandFontSize: Number(formData.get('brandFontSize')),
          brandScaleY: Number(formData.get('brandScaleY')),
          brandScaleX: Number(formData.get('brandScaleX')),
          brandOffsetX: Number(formData.get('brandOffsetX')),
          brandOffsetY: Number(formData.get('brandOffsetY')),
        }).then(() => this.refreshAdminState()).catch((error) => {
          this.adminError = error instanceof Error ? error.message : 'Style update failed.';
          this.openPanel('admin');
        });
      });
      const styleForm = panel.querySelector<HTMLFormElement>('#staff-style-form');
      styleForm?.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
        input.addEventListener('input', () => {
          const read = (name: string, fallback: number) => {
            const value = Number(styleForm.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value);
            return Number.isFinite(value) ? value : fallback;
          };
          this.siteStyle = {
            ...this.siteStyle,
            brandFontSize: read('brandFontSize', this.siteStyle.brandFontSize),
            brandScaleY: read('brandScaleY', this.siteStyle.brandScaleY),
            brandScaleX: read('brandScaleX', this.siteStyle.brandScaleX),
            brandOffsetX: read('brandOffsetX', this.siteStyle.brandOffsetX),
            brandOffsetY: read('brandOffsetY', this.siteStyle.brandOffsetY),
          };
          this.applySiteStyle();
        });
      });
    }

    if (panelId === 'programme') {
      panel.querySelectorAll<HTMLButtonElement>('[data-film-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const film = this.allFilms().find((entry) => entry.id === button.dataset.filmId);
          if (film) window.open(film.sourceUrl, '_blank', 'noopener,noreferrer');
        });
      });
    }
  }

  /**
   * Just the messages, so they can be redrawn on their own. Rebuilding the
   * whole panel to show one new line takes the box you are typing in with it,
   * which is what it used to do and why those rebuilds were taken out — leaving
   * the panel showing everything except what you had just said.
   */
  private chatFeedContent(): string {
    const visible = this.chatMessages.filter((message) => message.channel === this.chatChannel).slice(-100);
    if (!visible.length) return `<p class="chat-empty">${this.language === 'zh-TW' ? '尚無訊息' : 'No messages yet.'}</p>`;
    const time = new Intl.DateTimeFormat(this.language, { hour: '2-digit', minute: '2-digit' });
    return visible.map((message) => `
      <article><header><strong>${message.npc ? 'NPC · ' : ''}${this.escapeHtml(message.npc ? this.npcNameFromAuthor(message.author) : message.author)}</strong><time>${time.format(message.timestamp)}</time></header><p>${this.escapeHtml(this.localizeNpcChat(message.text))}</p></article>`).join('');
  }

  /**
   * Put a newly arrived line into an open chat panel and follow it down, unless
   * the reader has scrolled back through the history — in which case they are
   * reading something and should not be yanked to the bottom.
   */
  private refreshOpenChatFeed(): void {
    if (this.activePanel !== 'chat') return;
    const feed = this.root.querySelector<HTMLElement>('#panel .chat-feed');
    if (!feed) return;
    const wasAtBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
    feed.innerHTML = this.chatFeedContent();
    if (wasAtBottom) feed.scrollTop = feed.scrollHeight;
  }

  private chatPanelContent(): string {
    const channelLabel: Record<ChatChannel, string> = this.language === 'zh-TW'
      ? { NEARBY: '附近', VENUE: '影廳', FESTIVAL: '全影展' }
      : { NEARBY: 'NEARBY', VENUE: 'VENUE', FESTIVAL: 'FESTIVAL' };
    return `
      <div class="chat-channels segmented segmented--dark">
        ${(['NEARBY', 'VENUE', 'FESTIVAL'] as ChatChannel[]).map((channel) => `
          <button type="button" data-chat-channel="${channel}" aria-pressed="${channel === this.chatChannel}">${channelLabel[channel]}</button>`).join('')}
      </div>
      <div class="chat-feed" aria-live="polite">${this.chatFeedContent()}</div>
      <p class="connection-note" data-status="${this.connectionStatus}">${this.connectionStatus === 'online' ? (this.language === 'zh-TW' ? '即時聊天 · 伺服器管理' : 'LIVE CHAT · MODERATED') : (this.language === 'zh-TW' ? '離線聊天 · 僅此裝置' : 'OFFLINE CHAT · THIS DEVICE')}</p>
      <form class="chat-form" id="chat-form">
        <label for="chat-message">${this.language === 'zh-TW' ? '訊息' : 'MESSAGE'} · ${channelLabel[this.chatChannel]}</label>
        <div><input id="chat-message" maxlength="160" autocomplete="off" placeholder="${this.language === 'zh-TW' ? '最多 160 字' : '160 characters'}" /><button type="submit">${this.language === 'zh-TW' ? '傳送' : 'SEND'}</button></div>
      </form>`;
  }

  /**
   * STAFF tools are grouped so the panel stays short. Which groups are open is
   * remembered, because the panel re-renders on every refresh and a collapsed
   * group would otherwise swallow the form being worked on.
   */
  private staffSection(id: string, title: string, body: string): string {
    const open = this.openStaffSections.has(id) ? ' open' : '';
    return `<details class="staff-section" data-staff-section="${id}"${open}>
      <summary><span>${title}</span></summary>
      <div class="staff-section__body">${body}</div>
    </details>`;
  }

  private adminPanelContent(): string {
    if (!this.staffKey || !this.adminState) {
      return `
        <p class="panel-intro">${this.language === 'zh-TW' ? '輸入工作人員金鑰。' : 'Enter the staff key.'}</p>
        ${this.adminError ? `<p class="staff-error" role="alert">${this.escapeHtml(this.adminError)}</p>` : ''}
        <form class="staff-login" id="staff-login">
          <label for="staff-key">${this.language === 'zh-TW' ? '工作人員金鑰' : 'STAFF KEY'}</label>
          <div><input id="staff-key" type="password" autocomplete="current-password" /><button type="submit">${this.language === 'zh-TW' ? '解鎖' : 'UNLOCK'}</button></div>
        </form>`;
    }
    const style = { ...this.siteStyle, ...this.adminState.siteStyle };
    const controlledNpcId = this.controlledNpcId
      ?? this.networkState?.visitors.find((visitor) => visitor.id === this.networkState?.selfId)?.npcId;
    const mentorCarrierName = controlledNpcId === 'MENTOR' && this.networkState?.mentorCarrierId
      ? this.networkState.visitors.find((visitor) => visitor.id === this.networkState?.mentorCarrierId)?.originalName
      : undefined;
    return `
      <div class="staff-toolbar">
        <p><span>${this.language === 'zh-TW' ? '線上觀影者' : 'LIVE VISITORS'}</span><strong>${this.adminState.visitors.length}</strong></p>
        <p><span>${this.language === 'zh-TW' ? '已佔座位' : 'OCCUPIED SEATS'}</span><strong>${this.adminState.seats.length}</strong></p>
        <button type="button" data-staff-refresh>${this.language === 'zh-TW' ? '重新整理' : 'REFRESH'}</button>
        <button type="button" data-staff-logout>${this.language === 'zh-TW' ? '鎖定' : 'LOCK'}</button>
      </div>
      ${controlledNpcId ? `<div class="staff-identity"><span>${this.language === 'zh-TW' ? '目前扮演' : 'PLAYING AS'} · ${this.escapeHtml(this.npcProfiles.find((profile) => profile.id === controlledNpcId)?.name ?? controlledNpcId)}${mentorCarrierName ? ` · ${this.language === 'zh-TW' ? '由' : 'CARRIED BY'} ${this.escapeHtml(mentorCarrierName)}` : ''}</span><button type="button" data-npc-play="">${this.language === 'zh-TW' ? '回復本人' : 'RETURN TO SELF'}</button></div>` : ''}
      ${this.adminError ? `<p class="staff-error" role="alert">${this.escapeHtml(this.adminError)}</p>` : ''}
      ${this.staffSection('gate', this.language === 'zh-TW' ? '登入頁文字' : 'SIGN-IN PAGE', `
      <form class="staff-form" id="gate-copy-editor">
        <p class="staff-note">${this.language === 'zh-TW'
          ? '訪客進入前看到的文字。兩種語言都要填寫。'
          : 'What a visitor reads before entering. Both languages are required.'}</p>
        ${([
          ['kickerZh', '小標（中）', 'KICKER (ZH)'],
          ['kicker', '小標（英）', 'KICKER (EN)'],
          ['titleZh', '標題（中）', 'TITLE (ZH)'],
          ['title', '標題（英）', 'TITLE (EN)'],
          ['introZh', '說明（中）', 'INTRO (ZH)'],
          ['intro', '說明（英）', 'INTRO (EN)'],
          ['nameLabelZh', '名稱欄位（中）', 'NAME LABEL (ZH)'],
          ['nameLabel', '名稱欄位（英）', 'NAME LABEL (EN)'],
        ] as Array<[keyof GateCopy, string, string]>).map(([field, zhLabel, enLabel]) => {
          const value = String(this.adminState?.gateCopy?.[field] ?? this.gateCopy?.[field] ?? '');
          // The two intros run to 300 characters and cannot be read in half a
          // row, so they take the full width the way the pamphlet editor does.
          const wide = String(field).startsWith('intro') ? ' class="staff-form__wide"' : '';
          return `<label${wide}><span>${this.language === 'zh-TW' ? zhLabel : enLabel}</span><input name="${field}" maxlength="${String(field).startsWith('intro') ? 300 : 80}" value="${this.escapeAttribute(value)}" required /></label>`;
        }).join('')}
        <button type="submit">${this.language === 'zh-TW' ? '儲存入口文字' : 'SAVE GATE COPY'}</button>
      </form>`)}
      ${this.staffSection('shop', this.language === 'zh-TW' ? '快閃服飾店' : 'POP-UP STORE', `
      <form class="staff-form" id="shop-link-editor">
        <p class="staff-note">${this.language === 'zh-TW'
          ? '屋頂快閃店的連結。留空即為尚未開張，訪客按 E 時會看到「即將開幕」。'
          : 'Where the rooftop pop-up store sends visitors. Leave it empty and the store reads as not open yet.'}</p>
        <label class="staff-form__wide"><span>${this.language === 'zh-TW' ? '商店網址' : 'STORE LINK'}</span><input name="url" type="url" inputmode="url" maxlength="500" placeholder="https://" value="${this.escapeAttribute(this.adminState.shopLink?.url ?? '')}" /></label>
        <label><span>${this.language === 'zh-TW' ? '店名（中）' : 'STORE NAME (ZH)'}</span><input name="labelZh" maxlength="60" value="${this.escapeAttribute(this.adminState.shopLink?.labelZh ?? '')}" /></label>
        <label><span>${this.language === 'zh-TW' ? '店名（英）' : 'STORE NAME (EN)'}</span><input name="label" maxlength="60" value="${this.escapeAttribute(this.adminState.shopLink?.label ?? '')}" /></label>
        <button type="submit">${this.language === 'zh-TW' ? '儲存商店連結' : 'SAVE STORE LINK'}</button>
      </form>`)}
      ${this.staffSection('jukebox', this.language === 'zh-TW' ? '點唱機' : 'JUKEBOX', `
      <form class="staff-form" id="jukebox-editor">
        <p class="panel-intro">${this.language === 'zh-TW'
          ? '放入唱片：貼上 YouTube 連結即可，曲名留空就用 YouTube 上的標題。整個影展都會聽到，影廳、俱樂部與屋頂不受影響。'
          : "Stock the machine with a YouTube link. Leave the title blank and it takes YouTube's own. It plays across the open festival; the theatres, the club and the rooftop are left alone."}</p>
        <label class="is-wide"><span>${this.language === 'zh-TW' ? 'YOUTUBE 連結' : 'YOUTUBE LINK'}</span><input name="url" placeholder="https://www.youtube.com/watch?v=…" /></label>
        <label><span>${this.language === 'zh-TW' ? '曲名（可留空）' : 'TITLE (OPTIONAL)'}</span><input name="title" maxlength="120" placeholder="${this.language === 'zh-TW' ? '留空就用 YOUTUBE 上的標題' : "LEAVE BLANK FOR YOUTUBE'S OWN TITLE"}" /></label>
        <button class="panel-button" type="submit">${this.language === 'zh-TW' ? '放入點唱機' : 'ADD TO THE JUKEBOX'}</button>
      </form>
      <div class="staff-jukebox">
        <span class="eyebrow">${this.language === 'zh-TW' ? '播放中' : 'NOW PLAYING'}</span>
        <div class="staff-jukebox__now">
          <strong>${this.staffJukebox()?.nowPlaying?.title
            ? this.escapeHtml(this.staffJukebox()!.nowPlaying!.title)
            : (this.language === 'zh-TW' ? '目前沒唱片在播放' : 'NOTHING PLAYING')}</strong>
          <span>
            <button type="button" data-jukebox-skip>${this.language === 'zh-TW' ? '跳過' : 'SKIP'}</button>
            <button type="button" data-jukebox-stop>${this.language === 'zh-TW' ? '停止並清空' : 'STOP & CLEAR'}</button>
          </span>
        </div>
        <span class="eyebrow">${this.language === 'zh-TW' ? '等待中' : 'WAITING'}</span>
        <ol class="staff-jukebox__queue">
          ${(this.staffJukebox()?.queue ?? []).map((entry, index, all) => `<li>
            <strong>${this.escapeHtml(entry.title)}</strong>
            <small>${this.escapeHtml(entry.requestedByName ?? '')}</small>
            <span>
              <button type="button" data-jukebox-move="${this.escapeAttribute(entry.queueId ?? '')}" data-direction="up"${index === 0 ? ' disabled' : ''}>&uarr;</button>
              <button type="button" data-jukebox-move="${this.escapeAttribute(entry.queueId ?? '')}" data-direction="down"${index === all.length - 1 ? ' disabled' : ''}>&darr;</button>
              <button type="button" data-jukebox-drop="${this.escapeAttribute(entry.queueId ?? '')}">&times;</button>
            </span>
          </li>`).join('') || `<li class="is-empty"><small>${this.language === 'zh-TW' ? '沒有人排隊。' : 'Nobody is waiting.'}</small></li>`}
        </ol>
        <span class="eyebrow">${this.language === 'zh-TW' ? '機器裡的唱片' : 'IN THE MACHINE'}</span>
        <ul class="staff-list">
          ${(this.staffJukebox()?.tracks ?? []).map((track) => `<li><strong>${this.escapeHtml(track.title)}</strong><button type="button" data-jukebox-remove="${this.escapeAttribute(track.id)}">${this.language === 'zh-TW' ? '取出' : 'REMOVE'}</button></li>`).join('')
            || `<li><small>${this.language === 'zh-TW' ? '點唱機是空的。' : 'The jukebox is empty.'}</small></li>`}
        </ul>
      </div>`)}
      ${this.staffSection('entrance', this.language === 'zh-TW' ? '影展拱門' : 'ENTRANCE ARCH', `
      <form class="staff-form" id="entrance-sign-editor">
        <p>${this.language === 'zh-TW'
          ? '路口拱門上的兩行字。兩面相同，進場與離場都看得到。'
          : 'The two lines on the arch over the road. Both faces carry the same words, read on the way in and on the way out.'}</p>
        <label><span>${this.language === 'zh-TW' ? '主標' : 'TITLE'}</span><input name="title" maxlength="26" value="${this.escapeAttribute(this.adminState.entranceSign?.title ?? '')}" /></label>
        <label><span>${this.language === 'zh-TW' ? '副標' : 'SUBTITLE'}</span><input name="subtitle" maxlength="34" value="${this.escapeAttribute(this.adminState.entranceSign?.subtitle ?? '')}" /></label>
        <button class="panel-button" type="submit">${this.language === 'zh-TW' ? '更新拱門' : 'UPDATE THE ARCH'}</button>
      </form>`)}
      ${this.staffSection('temple', this.language === 'zh-TW' ? '寺廟看板' : 'TEMPLE SIGN', `
      <form class="staff-form" id="temple-sign-editor">
        <p class="staff-note">${this.language === 'zh-TW'
          ? '刻在寺廟門楣上的兩行字：所奉之神，以及建築名稱。'
          : 'The two lines over the temple door: who is worshipped there, and what the building is called.'}</p>
        <label><span>${this.language === 'zh-TW' ? '神名' : 'DEITY'}</span><input name="name" maxlength="24" value="${this.escapeAttribute(this.adminState.templeSign?.name ?? '')}" /></label>
        <label><span>${this.language === 'zh-TW' ? '寺廟名稱' : 'TEMPLE NAME'}</span><input name="label" maxlength="24" value="${this.escapeAttribute(this.adminState.templeSign?.label ?? '')}" /></label>
        <button type="submit">${this.language === 'zh-TW' ? '儲存寺廟看板' : 'SAVE TEMPLE SIGN'}</button>
      </form>`)}
      ${this.staffSection('programme', this.language === 'zh-TW' ? '節目與銀幕' : 'PROGRAMME & SCREENS', `
      <div class="staff-programmes">${VENUE_KEYS.map((venue) => {
        const schedule = this.adminState?.schedule?.[venue];
        const venueFilms = this.venueFilms(venue);
        const order = (schedule?.order ?? venueFilms.map((film) => film.youtubeId))
          .map((youtubeId) => venueFilms.find((film) => film.youtubeId === youtubeId))
          .filter((film): film is CatalogueEntry => Boolean(film));
        // What the projector is actually showing, which is not always the
        // position stored on the schedule: a special screening overrides it,
        // and with no service running the venue keeps its own clock. This used
        // to read the stored position, so it was only right at the instant the
        // panel was drawn and drifted as the venue worked through its list.
        const showing = this.publicFilm(venue).youtubeId;
        const current = order.some((film) => film.youtubeId === showing) ? showing : schedule?.youtubeId ?? order[0]?.youtubeId;
        const specialTime = schedule?.special?.startsAt
          ? new Date(schedule.special.startsAt - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
          : '';
        const specialInLibrary = Boolean(schedule?.special?.youtubeId && order.some((film) => film.youtubeId === schedule.special?.youtubeId));
        const specialSource = schedule?.special?.youtubeId ? (specialInLibrary ? 'library' : 'youtube') : 'none';
        return `
          <form data-programme-form="${venue}">
            <div class="staff-programme__top">
              <label>${this.language === 'zh-TW' ? '影廳名稱' : 'VENUE NAME'}<input name="venueName" maxlength="32" value="${this.escapeAttribute(schedule?.name ?? defaultVenueLabels[venue])}" /></label>
              <label>${this.language === 'zh-TW' ? '看板副標' : 'SIGN SUBTITLE'}<input name="venueSubtitle" maxlength="32" value="${this.escapeAttribute(schedule?.subtitle ?? '')}" /></label>
              <label>${this.language === 'zh-TW' ? '模式' : 'MODE'}<select name="mode">
                ${(['continuous', 'paused', 'recurring', 'scheduled-loop'] as ProgrammeMode[]).map((mode) => `<option value="${mode}"${schedule?.mode === mode ? ' selected' : ''}>${this.programmeModeLabel(mode)}</option>`).join('')}
              </select></label>
              <label>${this.language === 'zh-TW' ? '現正放映' : 'NOW PLAYING'}<select name="currentYoutubeId" data-follows-screen="on">
                ${order.map((film) => `<option value="${film.youtubeId}"${film.youtubeId === current ? ' selected' : ''}>${this.escapeHtml(this.filmTitle(film))}</option>`).join('')}
              </select></label>
            </div>
            <p class="staff-programme__name">${this.escapeHtml(schedule?.name ?? defaultVenueLabels[venue])} · ${this.categoryLabel(catalogueByVenue[venue][0]?.category ?? '')}</p>
            <ol class="staff-order" data-programme-order>
              ${order.map((film, index) => `<li data-youtube-id="${film.youtubeId}"><span><b>${index + 1}</b>${this.escapeHtml(this.filmTitle(film))}</span><span><button type="button" data-order-move="up" aria-label="${this.language === 'zh-TW' ? '上移' : 'Up'}">↑</button><button type="button" data-order-move="down" aria-label="${this.language === 'zh-TW' ? '下移' : 'Down'}">↓</button><button type="button" data-video-remove="${film.youtubeId}" data-venue="${venue}" aria-label="${this.language === 'zh-TW' ? '下架影片' : 'Remove video'}">×</button></span></li>`).join('')}
            </ol>
            <div class="staff-special">
              <label>${this.language === 'zh-TW' ? '特別放映來源' : 'SPECIAL SOURCE'}<select name="specialSource">
                <option value="none"${specialSource === 'none' ? ' selected' : ''}>${this.language === 'zh-TW' ? '無' : 'NONE'}</option>
                <option value="library"${specialSource === 'library' ? ' selected' : ''}>${this.language === 'zh-TW' ? '影廳片單' : 'THEATER VIDEO LIST'}</option>
                <option value="youtube"${specialSource === 'youtube' ? ' selected' : ''}>YOUTUBE LINK</option>
              </select></label>
              <label data-special-library${specialSource !== 'library' ? ' hidden' : ''}>${this.language === 'zh-TW' ? '片單影片' : 'LIST VIDEO'}<select name="specialYoutubeId">
                ${order.map((film) => `<option value="${film.youtubeId}"${film.youtubeId === schedule?.special?.youtubeId ? ' selected' : ''}>${this.escapeHtml(this.filmTitle(film))}</option>`).join('')}
              </select></label>
              <label data-special-youtube${specialSource !== 'youtube' ? ' hidden' : ''}>${this.language === 'zh-TW' ? 'YouTube 連結' : 'YOUTUBE LINK'}<input name="specialYoutubeUrl" type="url" placeholder="https://youtu.be/..." value="${specialSource === 'youtube' && schedule?.special?.youtubeId ? `https://youtu.be/${this.escapeAttribute(schedule.special.youtubeId)}` : ''}" /></label>
              <label>${this.language === 'zh-TW' ? '日期' : 'DATE'}<input name="specialStartsAt" type="datetime-local" value="${specialTime}" /></label>
              <button type="submit">${this.language === 'zh-TW' ? '儲存影廳' : 'SAVE VENUE'}</button>
            </div>
          </form>`;
      }).join('')}</div>
      <h4 class="staff-subheading">${this.language === 'zh-TW' ? '新增 YouTube 影片' : 'ADD YOUTUBE VIDEO'}</h4>
      <form class="staff-video" id="staff-video-form">
        <label>${this.language === 'zh-TW' ? '影廳' : 'VENUE'}<select name="venue">${VENUE_KEYS.map((venue) => `<option value="${venue}">${this.escapeHtml(this.venueName(venue))}</option>`).join('')}</select></label>
        <label>${this.language === 'zh-TW' ? 'YouTube 連結' : 'YOUTUBE LINK'}<input name="youtubeUrl" type="url" required placeholder="https://youtu.be/..." /></label>
        <label>${this.language === 'zh-TW' ? '英文片名' : 'TITLE'}<input name="title" required maxlength="100" /></label>
        <label>${this.language === 'zh-TW' ? '中文片名' : 'CHINESE TITLE'}<input name="titleZh" maxlength="100" /></label>
        <label>${this.language === 'zh-TW' ? '導演' : 'DIRECTOR'}<input name="creator" maxlength="80" /></label>
        <label>${this.language === 'zh-TW' ? '年份' : 'YEAR'}<input name="year" type="number" min="1888" max="2200" /></label>
        <button type="submit">${this.language === 'zh-TW' ? '新增影片' : 'ADD VIDEO'}</button>
      </form>
      <h4 class="staff-subheading">${this.language === 'zh-TW' ? '俱樂部節拍' : 'CLUB TEMPO'}</h4>
      <p class="staff-note">${this.language === 'zh-TW' ? '俱樂部燈光沒辦法讀取 YouTube 的聲音，所以每首歌自己帶速度。燈光依服務時鐘閃動，房裡每個人都同步。' : 'The club lights cannot read a YouTube player\u2019s audio, so each track carries its own tempo. Lights strobe off the service clock, so the whole room flashes together.'}</p>
      <div class="staff-tempos">${this.venueFilms('club').map((film) => `
        <form data-tempo-form="${this.escapeAttribute(film.youtubeId)}">
          <span>${this.escapeHtml(this.filmTitle(film))}</span>
          <label>BPM<input name="bpm" type="number" min="40" max="220" step="1" value="${this.adminState?.trackTempos?.[film.youtubeId] ?? 120}" /></label>
          <button type="submit">${this.language === 'zh-TW' ? '儲存' : 'SAVE'}</button>
        </form>`).join('')}</div>
      `)}
      ${this.staffSection('world', this.language === 'zh-TW' ? '世界與外觀' : 'WORLD & APPEARANCE', `
      <h4 class="staff-subheading">${this.language === 'zh-TW' ? '字標設定' : 'WORDMARK'}</h4>
      <form class="staff-style" id="staff-style-form">
        <label>${this.language === 'zh-TW' ? '大小' : 'SIZE'}<input name="brandFontSize" type="number" min="12" max="42" step="1" value="${style.brandFontSize}" /></label>
        <label>${this.language === 'zh-TW' ? '高度' : 'HEIGHT'}<input name="brandScaleY" type="number" min="0.5" max="2" step="0.05" value="${style.brandScaleY}" /></label>
        <label>${this.language === 'zh-TW' ? '寬度' : 'WIDTH'}<input name="brandScaleX" type="number" min="0.5" max="2" step="0.05" value="${style.brandScaleX}" /></label>
        <label>${this.language === 'zh-TW' ? '水平位置' : 'X POSITION'}<input name="brandOffsetX" type="number" min="-120" max="240" step="1" value="${style.brandOffsetX}" /></label>
        <label>${this.language === 'zh-TW' ? '垂直位置' : 'Y POSITION'}<input name="brandOffsetY" type="number" min="-80" max="80" step="1" value="${style.brandOffsetY}" /></label>
        <button type="submit">${this.language === 'zh-TW' ? '儲存' : 'SAVE'}</button>
      </form>
      <h4 class="staff-subheading">${this.language === 'zh-TW' ? '登入頁面循環背景' : 'SIGN-IN LOOP BACKGROUND'}</h4>
      <p class="staff-note">${this.language === 'zh-TW' ? '貼上允許嵌入的 YouTube 連結。影片會自動靜音並循環播放。' : 'Paste an embeddable YouTube link. It will autoplay muted and loop behind the sign-in form.'}</p>
      <form class="staff-gate-background" id="staff-gate-background-form">
        <label>${this.language === 'zh-TW' ? 'YouTube 連結' : 'YOUTUBE LINK'}<input name="youtubeUrl" type="url" required placeholder="https://youtu.be/..." value="https://youtu.be/${this.escapeAttribute(this.adminState.gateBackground?.youtubeId ?? this.gateBackground.youtubeId)}" /></label>
        <button type="submit">${this.language === 'zh-TW' ? '更新背景' : 'UPDATE BACKGROUND'}</button>
      </form>
      `)}
      ${this.staffSection('people', this.language === 'zh-TW' ? '角色與 NPC' : 'PEOPLE & NPCS', `
      <div class="staff-list">
        <div class="staff-npc-list">${this.normalizeNpcProfiles(this.adminState.npcProfiles, this.adminState.npcNames).map((profile) => `
          <form class="staff-npc-form" data-npc-form="${this.escapeAttribute(profile.id)}">
            <span class="npc-dot">NPC</span>
            <label><span>${this.language === 'zh-TW' ? '名稱' : 'NAME'}</span><input name="npcName" maxlength="16" required value="${this.escapeAttribute(profile.name)}" /></label>
            <label><span>${this.language === 'zh-TW' ? '職稱' : 'JOB TITLE'}</span><input name="npcTitle" maxlength="40" required value="${this.escapeAttribute(profile.title)}" /></label>
            <span class="staff-npc-actions"><button type="submit">${this.language === 'zh-TW' ? '儲存' : 'SAVE'}</button><button type="button" data-npc-play="${this.escapeAttribute(profile.id)}"${controlledNpcId === profile.id ? ' disabled' : ''}>${controlledNpcId === profile.id ? (this.language === 'zh-TW' ? '使用中' : 'PLAYING') : (this.language === 'zh-TW' ? '扮演' : 'PLAY AS')}</button></span>
          </form>`).join('')}</div>
        <form class="staff-npc-add" id="staff-npc-add">
          <h4>${this.language === 'zh-TW' ? '新增 NPC' : 'ADD NPC'}</h4>
          <label><span>${this.language === 'zh-TW' ? '名稱' : 'NAME'}</span><input name="npcName" maxlength="16" required /></label>
          <label><span>${this.language === 'zh-TW' ? '職稱' : 'JOB TITLE'}</span><input name="npcTitle" maxlength="40" required /></label>
          <button type="submit">${this.language === 'zh-TW' ? '加入世界' : 'ADD TO WORLD'}</button>
        </form>
      </div>
      `)}
      ${this.staffSection('security', this.language === 'zh-TW' ? '工作人員金鑰' : 'STAFF KEY', `
      <p class="staff-note">${this.language === 'zh-TW'
        ? '更換金鑰需要先輸入目前的金鑰。伺服器只保存加鹽雜湊，不保存金鑰本身。忘記新金鑰時，只能刪除設定檔回到環境變數金鑰。'
        : 'Changing the key requires the current one. Only a salted hash is stored, never the key itself. If the new key is lost, the only way back is deleting the settings file to fall back to the environment key.'}</p>
      <form class="staff-gate-background" id="staff-key-form">
        <label>${this.language === 'zh-TW' ? '目前金鑰' : 'CURRENT KEY'}<input name="currentKey" type="password" autocomplete="current-password" required /></label>
        <label>${this.language === 'zh-TW' ? '新金鑰（至少 12 字元）' : 'NEW KEY (12+ CHARACTERS)'}<input name="nextKey" type="password" autocomplete="new-password" minlength="12" required /></label>
        <label>${this.language === 'zh-TW' ? '再次輸入新金鑰' : 'REPEAT NEW KEY'}<input name="confirmKey" type="password" autocomplete="new-password" minlength="12" required /></label>
        <button type="submit">${this.language === 'zh-TW' ? '更換金鑰' : 'CHANGE KEY'}</button>
      </form>
      `)}
      ${this.staffSection('moderation', this.language === 'zh-TW' ? '管理' : 'MODERATION', `
      <h4 class="staff-subheading">${this.language === 'zh-TW' ? '觀影者' : 'ATTENDEES'}</h4>
      <div class="staff-list">
        ${this.adminState.visitors.map((visitor) => `
          <article>
            <div><strong>${this.escapeHtml(visitor.name)}</strong><small>${this.escapeHtml(this.localizeLocation(visitor.presence.location))}${visitor.seatedAt ? ` · ${this.escapeHtml(visitor.seatedAt)}` : ''}</small></div>
            <div><button data-moderate="mute" data-visitor-id="${visitor.id}">${this.language === 'zh-TW' ? '靜音 5 分鐘' : 'MUTE 5M'}</button><button data-moderate="kick" data-visitor-id="${visitor.id}">${this.language === 'zh-TW' ? '結束連線' : 'END SESSION'}</button></div>
          </article>`).join('') || `<p>${this.language === 'zh-TW' ? '目前無線上觀影者。' : 'No live attendees.'}</p>`}
      </div>
      <h4 class="staff-subheading">${this.language === 'zh-TW' ? '近期聊天' : 'RECENT CHAT'}</h4>
      <div class="staff-list">${this.adminState.messages.slice(-20).reverse().map((message) => `
        <article><div><strong>${this.escapeHtml(message.author)} · ${this.chatChannelLabel(message.channel)}</strong><small>${this.escapeHtml(this.localizeNpcChat(message.text))}</small></div><button data-moderate="delete-message" data-message-id="${message.id}">${this.language === 'zh-TW' ? '移除' : 'REMOVE'}</button></article>`).join('') || `<p>${this.language === 'zh-TW' ? '尚無聊天。' : 'No chat yet.'}</p>`}</div>
      `)}
`;
  }

  private async refreshAdminState(reopenPanel = true): Promise<void> {
    try {
      this.adminState = await this.festivalClient.adminState(this.staffKey);
      this.siteStyle = { ...this.siteStyle, ...this.adminState.siteStyle };
      this.gateBackground = { ...this.gateBackground, ...this.adminState.gateBackground };
      this.npcProfiles = this.normalizeNpcProfiles(this.adminState.npcProfiles, this.adminState.npcNames);
      this.pamphlet = { ...this.pamphlet, ...this.adminState.pamphlet };
      this.world?.setNpcProfiles(this.npcProfiles);
      this.applySiteStyle();
      this.applyGateBackground();
      this.adminError = '';
    } catch (error) {
      this.adminState = undefined;
      this.adminError = error instanceof Error ? error.message : 'Staff service is unavailable.';
    }
    if (reopenPanel && this.activePanel === 'admin') this.reopenPanelKeepingPlace('admin');
  }

  private addChatMessage(message: ChatMessage): void {
    this.chatMessages = [...this.chatMessages, message].slice(-100);
    sessionStorage.setItem(CHAT_KEY, JSON.stringify(this.chatMessages));
    this.renderChatStream();
    this.refreshOpenChatFeed();
  }

  private renderChatStream(): void {
    const stream = this.root.querySelector<HTMLElement>('#chat-stream');
    if (!stream) return;
    const messages = [...this.chatMessages]
      .sort((first, second) => first.timestamp - second.timestamp)
      .slice(-4);
    const timeFormat = new Intl.DateTimeFormat(this.language, { hour: '2-digit', minute: '2-digit' });
    const items = messages.map((message) => ({
      id: message.id,
      channel: message.channel,
      channelLabel: this.chatChannelLabel(message.channel),
      author: `${message.npc ? 'NPC · ' : ''}${message.npc ? this.npcNameFromAuthor(message.author) : message.author}`,
      time: timeFormat.format(message.timestamp),
      text: this.localizeNpcChat(message.text),
    }));
    const signature = JSON.stringify(items);
    const elementChanged = stream !== this.chatStreamElement;
    this.chatStreamElement = stream;
    // Presence snapshots arrive while any attendee moves. Do not rebuild the
    // same chat DOM for those snapshots; doing so restarted its enter animation
    // every frame and made the overlay flash.
    if (!elementChanged && signature === this.chatStreamSignature) return;
    this.chatStreamSignature = signature;
    stream.dataset.renderCount = String(Number(stream.dataset.renderCount ?? 0) + 1);
    stream.hidden = messages.length === 0;
    stream.innerHTML = items.map((item) => `
      <article class="chat-stream__item" data-channel="${item.channel}">
        <header>
          <span class="chat-stream__channel">${this.escapeHtml(item.channelLabel)}</span>
          <strong>${this.escapeHtml(item.author)}</strong>
          <time>${item.time}</time>
        </header>
        <p>${this.escapeHtml(item.text)}</p>
      </article>
    `).join('');
  }

  private startNpcChat(): void {
    if (this.npcTimer) window.clearInterval(this.npcTimer);
    const lines = [
      ['MICHAEL', 'VENUE', 'The projector haze is beautiful tonight.'],
      ['SEBINE', 'NEARBY', 'I am heading to the programme board.'],
      ['ZC', 'FESTIVAL', 'Try swimming past the screen—there are buoys at the boundary.'],
      ['LOUI', 'VENUE', 'Private viewing only changes your own screen.'],
      ['MINYUN', 'NEARBY', 'See you by The Shore.'],
      ['VIOLA', 'FESTIVAL', 'The Shore programme is ready for the next screening.'],
    ] as const;
    let index = 0;
    this.npcTimer = window.setInterval(() => {
      if (this.festivalClient.online) return;
      const [author, channel, text] = lines[index % lines.length];
      this.addChatMessage({ id: `ambient-${Date.now()}`, author, channel, text, timestamp: Date.now(), npc: true });
      // Redraw the stream, never the panel: see the note by the other one.
      if (this.activePanel === 'chat') this.renderChatStream();
      index += 1;
    }, 18000);
  }

  private venueName(venue: VenueKey): string {
    return this.networkState?.schedule?.[venue]?.name
      ?? this.adminState?.schedule?.[venue]?.name
      ?? defaultVenueLabels[venue];
  }

  /** The second line on a venue's sign, if STAFF have set one. */
  private venueSubtitle(venue: VenueKey): string | undefined {
    return this.networkState?.schedule?.[venue]?.subtitle
      ?? this.adminState?.schedule?.[venue]?.subtitle;
  }

  private filmTitle(film: CatalogueEntry): string {
    return this.language === 'zh-TW' && film.titleZh ? film.titleZh : film.title;
  }

  private categoryLabel(category: string): string {
    if (this.language !== 'zh-TW') return category;
    return ({ COMMERCIAL: '廣告', TELEVISION: '電視', 'MUSIC VIDEO': '音樂錄影帶', ORIGINALS: '原創' } as Record<string, string>)[category] ?? category;
  }

  private programmeModeLabel(mode: ProgrammeMode): string {
    if (this.language === 'zh-TW') {
      return ({ continuous: '連續播放', paused: '暫停', recurring: '循環播放', 'scheduled-loop': '排程循環' } as const)[mode];
    }
    return ({ continuous: 'CONTINUOUS', paused: 'PAUSED', recurring: 'RECURRING', 'scheduled-loop': 'SCHEDULED LOOP' } as const)[mode];
  }

  private localizeLocation(value: string): string {
    if (value === 'THE PALACE') return this.venueName('palace');
    if (value === 'DRIVE-IN 88') return this.venueName('drive-in');
    if (value === 'THE SHORE') return this.venueName('shore');
    if (value === 'THE BASEMENT') return this.venueName('club');
    if (value === 'THE ROOFTOP') return this.venueName('rooftop');
    if (this.language !== 'zh-TW') return value;
    return ({
      'FESTIVAL GATE': '影展入口',
      'MY SQUARE': '我的廣場',
      'THE SHORE ENTRANCE': `${this.venueName('shore')}入口`,
      'MEDITERRANEAN SEA': '地中海',
    } as Record<string, string>)[value] ?? value;
  }

  /**
   * The same prompt, said in what a thumb actually does. Key names mean nothing
   * on a phone. A tap does whatever the prompt leads with — including the
   * SHIFT+E ones, where that is the only thing on offer — and a hold is only
   * mentioned where there genuinely is a second thing behind it, which is
   * MENTOR and nothing else.
   */
  private promptForTouch(value: string): string {
    if (!value || !App.looksLikeAPhone()) return value;
    const zh = this.language === 'zh-TW';
    const tap = zh ? '輕觸／' : 'TAP / ';
    const hold = zh ? '長按／' : 'HOLD / ';
    const twoParted = value.includes('·') && /SHIFT\+E/.test(value);
    return value
      .replace(/SHIFT\+E ?[／/] ?/g, twoParted ? hold : tap)
      .replace(/(^|· )[EO] ?[／/] ?/g, (_match, lead: string) => `${lead}${tap}`);
  }

  private localizeInteraction(value: string): string {
    const mentorName = this.mentorName();
    if (this.language !== 'zh-TW' || !value) {
      return value
        .replace(' — private viewing pauses if active', '')
        .replaceAll('MENTOR', mentorName);
    }
    if (value.startsWith('E / STAND UP')) return 'E／起身';
    if (value.includes('· OCCUPIED')) return value.replace('· OCCUPIED', '· 已有人');
    if (value.startsWith('E / TAKE SEAT')) return value.replace('E / TAKE SEAT', 'E／入座');
    if (value.startsWith('E TO SIT')) return value.replace('E TO SIT', 'E／入座');
    if (value.startsWith('O / WORSHIP')) return value.replace('O / WORSHIP', 'O／參拜');
    if (value.startsWith('E / WAVE TO')) return value.replace('E / WAVE TO', 'E／揮手給');
    if (value.startsWith('E / WAG TAIL AT')) return value.replace('E / WAG TAIL AT', 'E／搖尾巴給');
    if (value === 'E / ORDER A DRINK') return 'E／點一杯';
    if (value === 'E / OPEN THE POP-UP STORE') return 'E／逛快閃服飾店';
    if (value === 'E / PUT A RECORD ON') return 'E／點歌';
    if (value === 'SHIFT+E / DRINK UP') return 'SHIFT+E／喝一口';
    if (value.startsWith('E / EAT ')) {
      const snacks: Record<string, string> = {
        POPCORN: '爆米花', HOTDOG: '熱狗', PIZZA: '披薩', CHICKEN: '炸雞',
      };
      const item = value.slice('E / EAT '.length);
      return `E／吃${snacks[item] ?? item}`;
    }
    if (value.startsWith('E / REQUEST A TRACK FROM')) return value.replace('E / REQUEST A TRACK FROM', 'E／向') + ' 點歌';
    if (value.startsWith('E / GIVE MENTOR A TREAT')) {
      return value.includes('POPCORN WILL BE LOST')
        ? `E／餵 ${mentorName} 吃點心 · SHIFT+E／抱起（爆米花會丟棄）`
        : `E／餵 ${mentorName} 吃點心 · SHIFT+E／抱起`;
    }
    if (value === 'E / PUT MENTOR DOWN') return `E／放下 ${mentorName}`;
    if (value === 'POPCORN COLLECTED') return '已拿取爆米花';
    if (value === 'E / TAKE POPCORN') return 'E／拿取爆米花';
    if (value.startsWith('SWIMMING')) return '游泳中 · 靠近觀影者可揮手';
    if (value.startsWith('SWIMWEAR ON')) return '已換泳裝 · 進入水中';
    if (value.startsWith('E / OPEN')) return 'E／開啟節目表';
    return value;
  }

  private localizeNpcChat(value: string): string {
    if (this.language !== 'zh-TW') return value;
    return ({
      'The public screenings are live in all three venues.': '三座影廳都在進行公開放映。',
      'Drive-In 88 has a clear view from the center bay.': '汽車戲院中央區域視野最佳。',
      'The Palace marquee is open from MY SQUARE.': '從我的廣場可前往皇宮影廳。',
      'The projector haze is beautiful tonight.': '今晚的投影光霧很漂亮。',
      'I am heading to the programme board.': '我要去看節目表。',
      'Try swimming past the screen—there are buoys at the boundary.': '螢幕後方可以游泳，浮標是邊界。',
      'Private viewing only changes your own screen.': '私人觀影只會更改你的畫面。',
      'The Shore programme is ready for the next screening.': '海岸影廳已準備好下一場放映。',
    } as Record<string, string>)[value] ?? value;
  }

  private chatChannelLabel(channel: ChatChannel): string {
    if (this.language !== 'zh-TW') return channel;
    return ({ NEARBY: '附近', VENUE: '影廳', FESTIVAL: '影展' } as const)[channel];
  }

  private npcName(npcId: NpcId): string {
    return this.npcProfiles.find((profile) => profile.id === npcId)?.name.trim() || DEFAULT_NPC_NAMES[npcId] || npcId;
  }

  private npcNameFromAuthor(author: string): string {
    return this.npcProfiles.some((profile) => profile.id === author) ? this.npcName(author) : author;
  }

  /**
   * The roster the lists are drawn from, merged rather than replaced.
   *
   * The service's list used to win outright whenever it had anything in it, so
   * a service running an older build than the page erased any resident it had
   * not heard of — while the world, which builds its crowd from this client's
   * own roster, went on drawing them. Somebody was walking the festival and
   * absent from both the attendee list and the STAFF panel, which is exactly
   * what happened to YO between his being added here and the service catching
   * up. The two halves are deployed separately and will not always agree.
   *
   * So: this build's roster is the floor, the service's names and titles are
   * laid over it, and anything the service knows that this build does not —
   * residents STAFF added later — is appended.
   */
  /**
   * The jukebox as the STAFF panel should see it.
   *
   * It is published on two payloads: the one attendees are sent and the one
   * STAFF are. A service can be running a build that has it on the first and
   * not yet on the second — which is exactly the state the festival's own
   * service is in, so the panel showed an empty machine while the square was
   * playing out of a full one. There is no reason to prefer one source when
   * both describe the same machine, so whichever has it wins.
   */
  private staffJukebox(): JukeboxState | undefined {
    return this.adminState?.jukebox ?? this.networkState?.jukebox;
  }

  /**
   * Whether this is a hand-held rather than a desk. Both halves matter: a
   * touchscreen laptop has a coarse pointer and plenty of power, and a narrow
   * desktop window is still a desktop.
   */
  /**
   * Whether the gate should show its staff door. Asked for by name in the
   * address — myscheduleltd.com/beta/?staff — so the entrance is not advertised
   * to everybody arriving. It guards nothing on its own: the key is still the
   * only thing that opens it, and the service is what checks that. This only
   * keeps it out of sight of people it is no use to.
   */
  private static staffEntranceAsked(): boolean {
    try {
      return new URLSearchParams(window.location.search).has('staff');
    } catch {
      return false;
    }
  }

  private static looksLikeAPhone(): boolean {
    try {
      return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;
    } catch {
      return false;
    }
  }

  private static usesMobileScreeningLayout(): boolean {
    try {
      return window.matchMedia('(max-width: 780px), (pointer: coarse) and (hover: none)').matches;
    } catch {
      return false;
    }
  }

  private normalizeNpcProfiles(profiles: NpcProfile[] | undefined, names: NpcNames | undefined): NpcProfile[] {
    const served = new Map((profiles ?? []).slice(0, 24).map((profile) => [profile.id, profile]));
    const known = new Set<string>(NPC_NAMES);
    const merged: NpcProfile[] = NPC_NAMES.map((id) => ({
      id,
      name: served.get(id)?.name?.trim() || names?.[id]?.trim() || DEFAULT_NPC_NAMES[id],
      title: served.get(id)?.title?.trim() || NPC_TITLES[id],
    }));
    for (const [id, profile] of served) {
      if (known.has(id)) continue;
      merged.push({
        id,
        name: profile.name?.trim() || id,
        title: profile.title?.trim() || 'Festival Staff',
      });
    }
    return merged.slice(0, 24);
  }

  private attendeeListSignature(state: FestivalState | undefined, profiles: NpcProfile[]): string {
    const visitors = (state?.visitors ?? [])
      .map((visitor) => [visitor.id, visitor.name, visitor.presence.location, visitor.seatedAt ?? ''])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    const npcCount = this.snapshot?.npcCount ?? 5;
    const npcs = profiles.slice(0, npcCount).map((profile) => [profile.id, profile.name, profile.title]);
    return JSON.stringify([this.language, visitors, npcs, state?.mentorFeedCounts ?? null, state?.mentorFollower ?? null]);
  }

  private mentorName(): string {
    return this.npcName('MENTOR');
  }

  private applySiteStyle(): void {
    document.documentElement.style.setProperty('--brand-font-size', `${this.siteStyle.brandFontSize}px`);
    document.documentElement.style.setProperty('--brand-scale-y', String(this.siteStyle.brandScaleY));
    document.documentElement.style.setProperty('--brand-scale-x', String(this.siteStyle.brandScaleX));
    document.documentElement.style.setProperty('--brand-offset-x', `${this.siteStyle.brandOffsetX}px`);
    document.documentElement.style.setProperty('--brand-offset-y', `${this.siteStyle.brandOffsetY}px`);
  }

  private applyGateBackground(): void {
    const frame = this.root.querySelector<HTMLIFrameElement>('.gate__video');
    if (!frame) return;
    const next = gateBackgroundUrl(this.gateBackground.youtubeId || defaultGateBackground.youtubeId);
    if (frame.src !== next) frame.src = next;
  }

  private customFilms(venue: VenueKey): CatalogueEntry[] {
    return this.networkState?.customVideos?.[venue]
      ?? this.adminState?.customVideos?.[venue]
      ?? [];
  }

  private venueFilms(venue: VenueKey): CatalogueEntry[] {
    return [...catalogueByVenue[venue], ...this.customFilms(venue)];
  }

  private allFilms(): CatalogueEntry[] {
    return [
      ...catalogue,
      ...this.customFilms('palace'),
      ...this.customFilms('drive-in'),
      ...this.customFilms('shore'),
    ];
  }

  private totalFilmCount(): number {
    return catalogueSummary.total + this.customFilms('palace').length + this.customFilms('drive-in').length + this.customFilms('shore').length;
  }

  private updateProgrammeFocus(venue: VenueKey, film: CatalogueEntry, next: CatalogueEntry, filmIndex: number, total: number): void {
    const focus = this.root.querySelector<HTMLElement>('#programme-focus');
    if (!focus) return;
    focus.dataset.venue = venue;
    const eyebrow = focus.querySelector<HTMLElement>('[data-programme-eyebrow]');
    const title = focus.querySelector<HTMLElement>('[data-programme-title]');
    const programme = focus.querySelector<HTMLElement>('[data-programme-category]');
    const director = focus.querySelector<HTMLElement>('[data-programme-director]');
    const year = focus.querySelector<HTMLElement>('[data-programme-year]');
    const stream = focus.querySelector<HTMLElement>('[data-programme-stream]');
    const nextTitle = focus.querySelector<HTMLElement>('[data-programme-next]');
    if (eyebrow) eyebrow.innerHTML = `${this.language === 'zh-TW' ? '現正放映' : 'NOW PLAYING'} · ${this.escapeHtml(this.venueName(venue))} · ${this.language === 'zh-TW' ? '切換倒數' : 'ROTATES IN'} <span id="programme-rotate-countdown">${8 - Math.floor((Date.now() / 1000) % 8)}</span>${this.language === 'zh-TW' ? '秒' : 'S'}`;
    if (title) title.textContent = this.filmTitle(film);
    if (programme) programme.textContent = this.categoryLabel(film.category);
    if (director) director.textContent = film.creator ?? (this.language === 'zh-TW' ? '我的檔期典藏' : 'MYSCHEDULE ARCHIVE');
    if (year) year.textContent = String(film.year ?? (this.language === 'zh-TW' ? '典藏' : 'ARCHIVE'));
    if (stream) stream.textContent = `${filmIndex + 1} / ${total}`;
    if (nextTitle) nextTitle.textContent = this.filmTitle(next);
  }

  private venueCatalogue(name: string, films: CatalogueEntry[]): string {
    return `<details class="catalogue-group"><summary><span>${this.escapeHtml(name)}</span><small>${films.length} ${this.language === 'zh-TW' ? '部' : 'FILMS'}</small></summary><div>${films
      .map(
        (film) => `<button data-film-id="${film.id}"><span>${this.escapeHtml(this.filmTitle(film))}</span><small>${this.categoryLabel(film.category)}${film.year ? ` · ${film.year}` : ''}</small></button>`,
      )
      .join('')}</div></details>`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[character] ?? character);
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value);
  }
}
