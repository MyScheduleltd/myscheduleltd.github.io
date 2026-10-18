import { FestivalWorld, type AvatarPalette, type GraphicsMode } from './FestivalWorld';
import { loadOwnAvatar } from './ImportedAvatar';
import { avatarSex } from './CoastalOutfits';
import { gateAvatarScissor, gateAvatarViewport, type GatePreviewCameraSnapshot, type GatePreviewRect } from './GatePreviewLayout';

export interface GatePreviewEntryFrame {
  elapsedMs: number;
  progress: number;
  target: number;
  camera: GatePreviewCameraSnapshot;
  avatarViewport?: GatePreviewRect;
  avatarScissor?: GatePreviewRect;
}

interface GatePreviewOptions {
  palette: AvatarPalette;
  graphicsMode?: GraphicsMode;
  onReady?: () => void;
  onError?: (error: unknown) => void;
  /** Optional local review capture; values describe a frame that really drew. */
  onEntryFrame?: (frame: GatePreviewEntryFrame) => void;
}

/** A local scene preview, not a visitor: no admission, sound, media or controls. */
export class GatePreview {
  private readonly canvas = document.createElement('canvas');
  private readonly cssLayer = document.createElement('div');
  private readonly unusedForeground = document.createElement('canvas');
  private world?: FestivalWorld;
  private host?: HTMLElement;
  private avatarRegion?: HTMLElement;
  private palette: AvatarPalette;
  private graphicsMode: GraphicsMode;
  private initializing?: Promise<void>;
  private disposed = false;
  private failed = false;
  private hasPainted = false;
  private readonly readyWaiters: Array<(ready: boolean) => void> = [];
  private readyPaint = 0;
  private avatarReady = false;
  private animation = 0;
  private lastFrame = -Infinity;
  private startedAt = performance.now();
  private yaw = .22;
  private pointer?: { id: number; x: number };
  private entry?: { target: number; current: number; lastAt?: number; startedAt: number; complete: boolean; avatarRect?: { x: number; y: number; width: number; height: number } };
  private readonly entryWaiters: Array<() => void> = [];
  private entryPaint = 0;
  private readonly stageWaiters: Array<{ value: number; resolve: () => void }> = [];
  private stagePaint = 0;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly resizeObserver = new ResizeObserver(() => this.schedule());
  private readonly mobileQuery = window.matchMedia('(max-width: 800px), (pointer: coarse) and (max-width: 1000px)');

  constructor(private readonly options: GatePreviewOptions) {
    this.palette = { ...options.palette };
    this.graphicsMode = options.graphicsMode ?? 'normal';
    this.canvas.className = 'gate__world';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.mobileQuery.addEventListener('change', this.mediaChanged);
  }

  /** Rebind a redrawn language/form without rebuilding the scene or losing yaw. */
  mount(host: HTMLElement, avatarRegion?: HTMLElement): void {
    if (this.disposed) return;
    this.unbindRegion();
    this.resizeObserver.disconnect();
    this.host = host;
    this.avatarRegion = avatarRegion;
    host.prepend(this.canvas);
    this.resizeObserver.observe(host);
    if (avatarRegion) {
      this.resizeObserver.observe(avatarRegion);
      avatarRegion.addEventListener('pointerdown', this.pointerDown);
      avatarRegion.addEventListener('pointermove', this.pointerMove);
      avatarRegion.addEventListener('pointerup', this.pointerUp);
      avatarRegion.addEventListener('pointercancel', this.pointerUp);
      avatarRegion.addEventListener('lostpointercapture', this.pointerUp);
      avatarRegion.addEventListener('keydown', this.keyDown);
    }
    if (this.hasPainted) this.options.onReady?.();
    void this.initialize();
    this.schedule();
  }

  setPalette(palette: AvatarPalette): void {
    if (this.disposed) return;
    this.palette = { ...palette };
    this.world?.setAvatarPalette(this.palette);
    if (!this.mobileQuery.matches) {
      // ImportedAvatar settles late arrivals against its most recent palette.
      // A female selection cannot be overwritten by an older male request.
      // Hers is drawn as soon as her own body is in; his follows behind.
      void loadOwnAvatar(avatarSex(palette.top))
        .then(() => {
          if (this.disposed) return;
          this.avatarReady = true;
          this.world?.setAvatarPalette(this.palette);
          this.schedule();
        })
        .catch(error => { if (!this.disposed) this.options.onError?.(error); });
    }
    this.schedule();
  }

  setGraphicsMode(mode: GraphicsMode): void {
    this.graphicsMode = mode;
    this.schedule();
  }

  /** Admission may start only once there is a painted aerial view to fly from. */
  ready(): Promise<boolean> {
    if (this.disposed || this.failed || document.hidden) return Promise.resolve(false);
    if (this.hasPainted) return Promise.resolve(true);
    return new Promise(resolve => this.readyWaiters.push(resolve));
  }

  private finishReadyWaiters(ready: boolean): void {
    cancelAnimationFrame(this.readyPaint);
    this.readyPaint = 0;
    if (ready) this.hasPainted = true;
    for (const resolve of this.readyWaiters.splice(0)) resolve(ready);
    if (ready) this.options.onReady?.();
  }

  /** Start only after admission succeeds; queueing visitors keep their menu. */
  beginEntry(): void {
    if (this.disposed || this.entry) return;
    const region = this.avatarRegion?.getBoundingClientRect();
    const entry = this.entry = {
      target: 0, current: 0, complete: false, startedAt: performance.now(), lastAt: performance.now(),
      // DOMRect coordinates are prototype getters, so spreading a DOMRect
      // later would discard its width/height and produce an invalid viewport.
      avatarRect: region ? { x: region.x, y: region.y, width: region.width, height: region.height } : undefined,
    };
    if (this.pointer && this.avatarRegion?.hasPointerCapture(this.pointer.id)) this.avatarRegion.releasePointerCapture(this.pointer.id);
    this.pointer = undefined;
    // Phones omit the studio avatar, but need this same cached body as the
    // camera reaches the player's actual dock entrance.
    void loadOwnAvatar(avatarSex(this.palette.top)).then(() => {
      if (this.disposed || this.entry !== entry) return;
      this.avatarReady = true;
      this.world?.setAvatarPalette(this.palette);
      this.schedule();
    }).catch(() => { /* App reports and retries the real character load. */ });
    this.schedule();
  }

  setEntryProgress(value: number): void {
    if (!this.entry || this.disposed || !Number.isFinite(value)) return;
    this.entry.target = Math.max(this.entry.target, Math.max(0, Math.min(1, value)));
    this.finishHiddenEntry();
    this.schedule();
  }

  cancelEntry(): void {
    if (this.disposed) return;
    this.entry = undefined;
    cancelAnimationFrame(this.entryPaint);
    this.entryPaint = 0;
    this.finishEntryWaiters();
    this.world?.cancelGateEntry();
    this.schedule();
  }

  /** Let completed load work become visible before the next synchronous stage. */
  awaitEntryProgress(value: number): Promise<void> {
    if (!this.entry || this.disposed || this.failed || document.hidden || this.reducedMotion.matches || !Number.isFinite(value)) return Promise.resolve();
    const stage = Math.max(0, Math.min(1, value));
    return new Promise(resolve => {
      this.stageWaiters.push({ value: stage, resolve });
      this.schedule();
    });
  }

  private finishStageWaiters(): void {
    cancelAnimationFrame(this.stagePaint);
    this.stagePaint = 0;
    for (const { resolve } of this.stageWaiters.splice(0)) resolve();
  }

  /** Complete after the final painted frame; hidden tabs cannot paint and skip that wait. */
  awaitEntryComplete(): Promise<void> {
    this.finishHiddenEntry();
    if (!this.entry || this.entry.complete || this.disposed || this.failed) return Promise.resolve();
    return new Promise(resolve => this.entryWaiters.push(resolve));
  }

  private finishHiddenEntry(): void {
    if (!document.hidden || !this.entry || this.entry.target !== 1) return;
    cancelAnimationFrame(this.entryPaint);
    this.entryPaint = 0;
    this.entry.current = 1;
    this.entry.complete = true;
    this.finishEntryWaiters();
  }

  private finishEntryWaiters(): void {
    this.finishStageWaiters();
    for (const resolve of this.entryWaiters.splice(0)) resolve();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animation);
    cancelAnimationFrame(this.entryPaint);
    this.animation = 0;
    this.entryPaint = 0;
    this.entry = undefined;
    this.finishReadyWaiters(false);
    this.finishEntryWaiters();
    this.unbindRegion();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.mobileQuery.removeEventListener('change', this.mediaChanged);
    this.world?.stop();
    this.world = undefined;
    this.canvas.remove();
    this.cssLayer.remove();
    this.host = undefined;
    this.avatarRegion = undefined;
  }

  private initialize(): Promise<void> {
    if (this.initializing || this.world || this.failed || this.disposed) return this.initializing ?? Promise.resolve();
    this.initializing = (async () => {
      if (this.disposed || !this.host?.isConnected) return;
      this.world = new FestivalWorld({
        canvas: this.canvas,
        foregroundCanvas: this.unusedForeground,
        cssLayer: this.cssLayer,
        // Gate images are a low-cost scenic view. The selected quality still
        // controls the actual game; changing it never rebuilds this preview.
        graphicsMode: 'lite',
        palette: this.palette,
        preview: true,
        previewAvatar: false,
        onSnapshot: () => undefined,
        onAction: () => undefined,
      });
      this.schedule();
      // The scenic view must paint before body bytes finish. It can then
      // follow actual loading progress even during a cold character download.
      if (!this.mobileQuery.matches) this.setPalette(this.palette);
    })().catch(error => {
      this.failed = true;
      this.finishReadyWaiters(false);
      this.finishEntryWaiters();
      if (!this.disposed) this.options.onError?.(error);
    }).finally(() => { this.initializing = undefined; });
    return this.initializing;
  }

  private schedule(): void {
    if (this.animation || this.disposed || this.failed || document.hidden || !this.host?.isConnected) return;
    this.animation = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.animation = 0;
    if (this.disposed || document.hidden || !this.host?.isConnected) return;
    const mobile = this.mobileQuery.matches;
    const fps = this.entry ? (mobile ? 24 : 45) : mobile ? 12 : this.graphicsMode === 'lite' ? 20 : 30;
    if (this.world && now - this.lastFrame >= 1000 / fps - .5) {
      this.lastFrame = now;
      const viewport = this.host.getBoundingClientRect();
      const width = Math.round(viewport.width), height = Math.round(viewport.height);
      if (width > 1 && height > 1) {
        const entry = this.entry;
        if (entry) {
          // Work that blocked a frame must not turn into a large camera step
          // afterwards. Keep the last part of the approach visibly animated.
          const delta = entry.lastAt === undefined ? 0 : Math.min(.05, Math.max(0, (now - entry.lastAt) / 1000));
          entry.lastAt = now;
          // A cached load still has a visible 1.2-second flight. This is a
          // camera speed limit, not invented loading: a stalled target holds.
          entry.current = this.reducedMotion.matches ? entry.target
            : Math.min(entry.target, entry.current + delta / 1.2);
        }
        const slide = entry ? Math.min(1, Math.max(0, (now - entry.startedAt) / 480)) : 0;
        const region = !mobile && this.avatarReady && (!entry || (slide < 1 && !this.reducedMotion.matches))
          ? entry?.avatarRect ? { ...entry.avatarRect, x: entry.avatarRect.x + (viewport.x + width - entry.avatarRect.x + 2) * slide }
            : this.avatarRegion?.getBoundingClientRect()
          : undefined;
        // The caption belongs below the soles, never over the shoes.
        const studioRegion = region ? {
          x: region.x, y: region.y, width: region.width, height: Math.max(0, region.height - 60),
        } : undefined;
        const avatar = studioRegion ? gateAvatarScissor(viewport, studioRegion) : undefined;
        const avatarViewport = studioRegion ? gateAvatarViewport(viewport, studioRegion) : undefined;
        try {
          const camera = this.world.renderGatePreview({
            width, height,
            pixelRatio: Math.min(window.devicePixelRatio || 1, mobile ? .8 : this.graphicsMode === 'lite' ? 1 : 1.25),
            elapsed: (now - this.startedAt) / 1000,
            yaw: this.yaw,
            avatar,
            avatarViewport,
            entry: entry?.current,
            entryTarget: entry?.target,
            entryAvatarReady: this.avatarReady,
            entryGraphicsMode: this.graphicsMode,
          });
          if (entry && camera) this.options.onEntryFrame?.({
            elapsedMs: Math.max(0, now - entry.startedAt), progress: entry.current, target: entry.target,
            camera, avatarViewport, avatarScissor: avatar,
          });
          if (entry && !this.stagePaint && this.stageWaiters.some(stage => entry.current >= stage.value - .01)) {
            this.stagePaint = requestAnimationFrame(() => {
              this.stagePaint = 0;
              if (this.disposed || this.entry !== entry) return;
              // This callback follows a rendered frame. Loading milestones
              // themselves never resolve an animation stage before it paints.
              for (let i = this.stageWaiters.length - 1; i >= 0; i--) {
                const stage = this.stageWaiters[i];
                if (entry.current < stage.value - .01) continue;
                this.stageWaiters.splice(i, 1);
                stage.resolve();
              }
            });
          }
          if (entry && entry.target === 1 && entry.current === 1 && !entry.complete && !this.entryPaint) {
            this.entryPaint = requestAnimationFrame(() => {
              this.entryPaint = 0;
              if (this.disposed || this.entry !== entry) return;
              entry.complete = true;
              this.finishEntryWaiters();
            });
          }
          if (!this.hasPainted && !this.readyPaint) this.readyPaint = requestAnimationFrame(() => {
            this.readyPaint = 0;
            if (!this.disposed && !this.failed && !document.hidden) this.finishReadyWaiters(true);
          });
        } catch (error) {
          this.failed = true;
          this.finishReadyWaiters(false);
          this.finishEntryWaiters();
          this.options.onError?.(error);
          return;
        }
      }
    }
    this.schedule();
  };

  private readonly visibilityChanged = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.animation); this.animation = 0;
      this.finishReadyWaiters(false);
      this.finishStageWaiters();
      this.finishHiddenEntry();
    }
    else this.schedule();
  };

  private readonly mediaChanged = (): void => {
    if (!this.mobileQuery.matches) this.setPalette(this.palette);
    this.schedule();
  };

  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.mobileQuery.matches || this.entry) return;
    this.pointer = { id: event.pointerId, x: event.clientX };
    this.avatarRegion?.setPointerCapture(event.pointerId);
    this.avatarRegion?.focus({ preventScroll: true });
    event.preventDefault();
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (this.pointer?.id !== event.pointerId) return;
    this.yaw += (event.clientX - this.pointer.x) * .009;
    this.pointer.x = event.clientX;
    this.schedule();
  };

  private readonly pointerUp = (): void => { this.pointer = undefined; };

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (this.entry || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    this.yaw += event.key === 'ArrowLeft' ? -.15 : .15;
    event.preventDefault();
    this.schedule();
  };

  private unbindRegion(): void {
    const region = this.avatarRegion;
    if (!region) return;
    if (this.pointer && region.hasPointerCapture(this.pointer.id)) region.releasePointerCapture(this.pointer.id);
    this.pointer = undefined;
    region.removeEventListener('pointerdown', this.pointerDown);
    region.removeEventListener('pointermove', this.pointerMove);
    region.removeEventListener('pointerup', this.pointerUp);
    region.removeEventListener('pointercancel', this.pointerUp);
    region.removeEventListener('lostpointercapture', this.pointerUp);
    region.removeEventListener('keydown', this.keyDown);
  }
}
