import { watchAssetDownloads } from '../world/AssetMirror';

/**
 * Everything the sign-in page downloads before ENTER (the owner, 2026-11-12:
 * "make sure all assets will be loaded at the sign in loading page, so
 * players do not need to wait for things to load after entered the world").
 *
 * Each preload says which files it fetches, and the bar is their bytes: as
 * they arrive (AssetMirror reports them by published name), and in full once
 * the preload has finished. A file that failed counts as done; the world asks
 * for it again when it is built and reports properly then.
 */
declare const __ASSET_BYTES__: Record<string, number> | undefined;
const SIZES: Record<string, number> = typeof __ASSET_BYTES__ === 'undefined' ? {} : __ASSET_BYTES__;
/** For a file the build's size table does not know. */
const UNKNOWN_BYTES = 200_000;

/** A URL's file name, as AssetMirror reports downloads. */
export const publishedName = (url: string): string => {
  try { return decodeURIComponent(new URL(url, globalThis.location?.href ?? 'http://localhost/').pathname.split('/').pop() ?? ''); } catch { return ''; }
};

/** A built file's source name: Vite adds `-` and an eight-character hash before the extension. */
export const sourceName = (file: string, sizes: Record<string, number> = SIZES): string =>
  file in sizes ? file : file.replace(/-[\w-]{8}(\.[a-z0-9]+)$/i, '$1');

export class SignInDownloads {
  private readonly expected = new Map<string, number>();
  private readonly received = new Map<string, number>();
  private open = 0;
  private sealed = false;
  private readonly stop: () => void;

  constructor(watch = watchAssetDownloads, private readonly sizes: Record<string, number> = SIZES) {
    this.stop = watch(({ file, received }) => {
      if (this.expected.has(file)) this.received.set(file, Math.max(this.received.get(file) ?? 0, received));
    });
  }

  /** A preload and the files it fetches. */
  track(urls: readonly string[], job: Promise<unknown>): void {
    const files = urls.map(publishedName).filter(Boolean);
    for (const file of files) if (!this.expected.has(file)) this.expected.set(file, this.sizes[sourceName(file, this.sizes)] ?? UNKNOWN_BYTES);
    this.open++;
    void job.catch(() => undefined).then(() => {
      for (const file of files) this.received.set(file, this.expected.get(file) ?? 0);
      this.open--;
    });
  }

  /** Every preload has been tracked; done once they have all settled. */
  seal(): void { this.sealed = true; }

  /** 0 to 1, by bytes. */
  get fraction(): number {
    let have = 0, total = 0;
    for (const [file, bytes] of this.expected) { total += bytes; have += Math.min(bytes, this.received.get(file) ?? 0); }
    return total ? have / total : 0;
  }

  get done(): boolean { return this.sealed && this.open === 0; }

  dispose(): void { this.stop(); }
}
