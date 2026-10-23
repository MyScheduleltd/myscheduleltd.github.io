import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/** Public environment tiles use GPU compression; raster remains an explicit recovery path. */
export function gpuTexturesEnabled(here?: Pick<Location, 'hostname' | 'search'>): boolean {
  const location = here ?? (typeof window === 'undefined' ? undefined : window.location);
  return Boolean(location && ['localhost', '127.0.0.1', 'myscheduleltd.com', 'www.myscheduleltd.com'].includes(location.hostname)
    && new URLSearchParams(location.search).get('gpuTextures') !== 'raster');
}

const BLOCK_FORMATS = new Map<number, string>([
  [THREE.RGBA_ASTC_4x4_Format, 'ASTC_4x4'], [THREE.RGBA_BPTC_Format, 'BC7'],
  [THREE.RGB_BPTC_UNSIGNED_Format, 'BC6H'], [THREE.RGBA_ETC2_EAC_Format, 'ETC2_RGBA'],
  [THREE.RGB_ETC2_Format, 'ETC2_RGB'], [THREE.RGB_ETC1_Format, 'ETC1_RGB'],
  [THREE.RGBA_S3TC_DXT5_Format, 'BC3'], [THREE.RGBA_S3TC_DXT1_Format, 'BC1_RGBA'],
  [THREE.RGBA_PVRTC_4BPPV1_Format, 'PVRTC_RGBA'], [THREE.RGB_PVRTC_4BPPV1_Format, 'PVRTC_RGB'],
]);

export interface GpuTextureAllocation {
  width: number; height: number; format: string; compressed: boolean;
  mipLevels: number; mipBytes: number;
}

/** Byte counts come from the actual transcoder output, including its mip chain. */
export function gpuTextureAllocation(texture: THREE.Texture): GpuTextureAllocation {
  const image = texture.image as { width?: number; height?: number; data?: ArrayBufferView } | undefined;
  const mips = texture.mipmaps as Array<{ data?: ArrayBufferView }>;
  const compressed = Boolean((texture as THREE.CompressedTexture).isCompressedTexture && BLOCK_FORMATS.has(texture.format));
  return {
    width: image?.width ?? 0, height: image?.height ?? 0,
    format: BLOCK_FORMATS.get(texture.format) ?? (texture.format === THREE.RGBAFormat ? 'RGBA' : String(texture.format)),
    compressed, mipLevels: mips.length || (image?.data ? 1 : 0),
    mipBytes: mips.length ? mips.reduce((bytes, level) => bytes + (level.data?.byteLength ?? 0), 0) : image?.data?.byteLength ?? 0,
  };
}

export interface GpuTextureReport {
  workerLimit: 1; activeLeases: number; pending: number; disposed: boolean;
  transcodes: number; compressedTextures: number; rgbaFallbacks: number;
  retainedMipBytes: number; compressedMipBytes: number;
  textures: GpuTextureAllocation[];
  error?: string;
}

export interface GpuTextureLease {
  decode(bytes: ArrayBuffer): Promise<THREE.Texture>;
  snapshot(): GpuTextureReport;
  release(): void;
}

interface GpuTextureRuntimeOptions {
  workerFactory?: (url: string) => Worker;
  decodeTimeoutMs?: number;
}

/** One pool, shared across overlapping world admission/teardown, never avatars. */
export class GpuTextureRuntime {
  private readonly loader: KTX2Loader;
  private leases = 0;
  private pending = 0;
  private initialized = false;
  private initialization?: Promise<void>;
  private initializationSettled = false;
  private loaderDisposed = false;
  private workerConfigured = false;
  private disposed = false;
  private failure?: Error;
  private readonly waiting = new Set<(error: Error) => void>();
  private readonly workerFactory: (url: string) => Worker;
  private readonly workerUrl: string;
  private readonly decodeTimeoutMs: number;
  private readonly allocations: GpuTextureAllocation[] = [];

  constructor(renderer: THREE.WebGLRenderer, factory = () => new KTX2Loader(), transcoderPath?: string, options: GpuTextureRuntimeOptions = {}) {
    this.loader = factory().setWorkerLimit(1).detectSupport(renderer);
    // Vite serves/emits the pinned three package's files at this same-origin
    // path. Executable transcoder code never goes through the data CDN mirror.
    const path = transcoderPath ?? new URL('./assets/basis/', window.location.href).href;
    this.loader.setTranscoderPath(path);
    this.workerUrl = `${path.endsWith('/') ? path : path + '/'}basis_worker.js`;
    this.workerFactory = options.workerFactory ?? (url => new Worker(url));
    this.decodeTimeoutMs = options.decodeTimeoutMs ?? 30_000;
  }

  acquire(renderer?: THREE.WebGLRenderer): GpuTextureLease {
    if (this.disposed) throw new Error('GPU texture runtime disposed');
    if (renderer) {
      const previous = { ...this.loader.workerConfig };
      this.loader.detectSupport(renderer);
      if (JSON.stringify(previous) !== JSON.stringify(this.loader.workerConfig)) {
        this.loader.workerConfig = previous;
        throw new Error('Overlapping renderers require different GPU texture formats');
      }
    }
    this.leases++;
    let released = false;
    return {
      decode: bytes => released ? Promise.reject(new Error('GPU texture lease released')) : this.decode(bytes),
      snapshot: () => this.snapshot(),
      release: () => { if (!released) { released = true; this.leases--; this.retire(); } },
    };
  }

  private async decode(bytes: ArrayBuffer): Promise<THREE.Texture> {
    if (this.failure || this.disposed) throw this.failure ?? new Error('GPU texture runtime disposed');
    this.pending++;
    try {
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        let settled = false;
        const fail = (error: Error) => {
          if (settled) return;
          settled = true; clearTimeout(timer); this.waiting.delete(fail); reject(error);
        };
        const timer = setTimeout(() => this.fail(new Error('GPU texture decode exceeded 30 seconds')), this.decodeTimeoutMs);
        this.waiting.add(fail);
        void (async () => {
          await this.initialize();
          if (settled || this.failure) return;
          this.configureStaticWorker();
          this.loader.parse(bytes, texture => {
            if (settled) { texture.dispose(); return; }
            settled = true; clearTimeout(timer); this.waiting.delete(fail); resolve(texture);
          }, error => fail(error instanceof Error ? error : new Error(String(error))));
        })().catch(error => fail(error instanceof Error ? error : new Error(String(error))));
      });
      texture.generateMipmaps = false;
      this.allocations.push(gpuTextureAllocation(texture));
      // Retain the mip arrays. Clearing them after upload breaks WebGL context
      // restoration; disposing the worker does not clear texture-owned data.
      return texture;
    } finally { this.pending--; this.retire(); }
  }

  private initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialized = true;
      this.initialization = this.loader.init().finally(() => {
        this.initializationSettled = true;
        if (this.disposed) this.disposeLoader();
      });
    }
    return this.initialization;
  }

  private configureStaticWorker(): void {
    if (this.workerConfigured) return;
    this.workerConfigured = true;
    // Basis's pinned Emscripten bindings use Function(). A blob worker
    // inherits the page's strict CSP and cannot initialize them. A pinned
    // same-origin static worker has its own security policy; the page keeps
    // its prohibition on JavaScript eval. No executable bytes use the CDN.
    this.loader.workerPool.setWorkerCreator(() => {
      let worker: Worker;
      try { worker = this.workerFactory(this.workerUrl); }
      catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
      worker.addEventListener('error', event => {
        event.preventDefault();
        this.fail(new Error(`GPU texture worker failed: ${event.message || 'unknown worker error'}`));
      });
      worker.addEventListener('messageerror', () => this.fail(new Error('GPU texture worker returned an unreadable message')));
      try {
        const binary = this.loader.transcoderBinary?.slice(0);
        if (!binary) throw new Error('GPU texture transcoder did not finish initialization');
        worker.postMessage({ type: 'init', config: this.loader.workerConfig, transcoderBinary: binary }, [binary]);
      } catch (error) {
        worker.terminate();
        this.fail(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
      return worker;
    });
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    // Three's worker pool has no error or initialization-rejection handling.
    // Reject all active/queued wrappers before retiring that failed pool.
    for (const reject of [...this.waiting]) reject(error);
    this.retire();
  }

  snapshot(): GpuTextureReport {
    return {
      workerLimit: 1, activeLeases: this.leases, pending: this.pending, disposed: this.disposed,
      transcodes: this.allocations.length,
      compressedTextures: this.allocations.filter(texture => texture.compressed).length,
      rgbaFallbacks: this.allocations.filter(texture => !texture.compressed).length,
      retainedMipBytes: this.allocations.reduce((bytes, texture) => bytes + texture.mipBytes, 0),
      compressedMipBytes: this.allocations.reduce((bytes, texture) => bytes + (texture.compressed ? texture.mipBytes : 0), 0),
      textures: this.allocations.map(texture => ({ ...texture })),
      ...(this.failure ? { error: this.failure.message } : {}),
    };
  }

  private retire(): void {
    if (this.disposed || this.pending || (this.leases && !this.failure)) return;
    this.disposed = true;
    // Three's worker pool drops pending promises on dispose. Only drain it
    // once every parse has settled, including a world closed during loading.
    this.disposeLoader();
  }

  private disposeLoader(): void {
    // A late network initialization can still create a worker blob URL. Let
    // it settle, then revoke it, even when our admission deadline has passed.
    if (!this.initialized || !this.initializationSettled || this.loaderDisposed) return;
    this.loaderDisposed = true;
    this.loader.dispose();
  }
}

let shared: GpuTextureRuntime | undefined;
export function acquireGpuTextures(renderer: THREE.WebGLRenderer): GpuTextureLease {
  if (!shared || shared.snapshot().disposed) shared = new GpuTextureRuntime(renderer);
  return shared.acquire(renderer);
}
