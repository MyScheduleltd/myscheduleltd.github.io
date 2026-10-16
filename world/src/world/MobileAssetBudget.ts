import { ImageBitmapLoader, Texture } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MOBILE_TEXTURE_EDGE = 1024;

export function mobileAssetBudgetEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const review = new URLSearchParams(window.location.search).get('review');
    return (['127.0.0.1', 'localhost'].includes(window.location.hostname) && review === 'mobile-memory')
      || window.matchMedia('(pointer: coarse) and (hover: none)').matches;
  } catch { return false; }
}

export function fitTextureSize(width: number, height: number, limit = MOBILE_TEXTURE_EDGE): { width: number; height: number } {
  const scale = Math.min(1, limit / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Read encoded dimensions before decoding; no full-size bitmap is needed. */
export function encodedImageSize(bytes: ArrayBuffer): { width: number; height: number } | undefined {
  const b = new Uint8Array(bytes), d = new DataView(bytes);
  if (b.length >= 24 && d.getUint32(0) === 0x89504e47 && d.getUint32(4) === 0x0d0a1a0a) {
    return { width: d.getUint32(16), height: d.getUint32(20) };
  }
  if (b.length >= 30 && d.getUint32(0) === 0x52494646 && d.getUint32(8) === 0x57454250) {
    const kind = d.getUint32(12);
    if (kind === 0x56503858) return { width: 1 + b[24] + (b[25] << 8) + (b[26] << 16), height: 1 + b[27] + (b[28] << 8) + (b[29] << 16) };
    if (kind === 0x56503820) return { width: d.getUint16(26, true) & 0x3fff, height: d.getUint16(28, true) & 0x3fff };
    if (kind === 0x5650384c && b[20] === 0x2f) {
      const bits = d.getUint32(21, true);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < b.length) {
      if (b[offset++] !== 0xff) continue;
      while (b[offset] === 0xff) offset++;
      const marker = b[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > b.length) break;
      const length = d.getUint16(offset);
      if (length < 2 || offset + length > b.length) break;
      if (length >= 7 && [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: d.getUint16(offset + 5), height: d.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  return undefined;
}

/** Independent queues: a model parser waits for its image decodes. */
export class AssetWorkQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
const models = new AssetWorkQueue(), images = new AssetWorkQueue();
const configured = new WeakSet<GLTFLoader>();
const stats = { decodedImages: 0, originalBytes: 0, decodedBytes: 0, largestEdge: 0, activeModels: 0, peakActiveModels: 0 };
export const mobileAssetBudgetSnapshot = () => ({ ...stats });

/** All current game images are PNG/JPEG/WebP, including embedded GLB maps. */
export async function decodeBudgetedImage(blob: Blob): Promise<ImageBitmap> {
  const size = encodedImageSize(await blob.arrayBuffer());
  const target = size && size.width > 0 && size.height > 0 ? fitTextureSize(size.width, size.height) : undefined;
  let bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: 'none', premultiplyAlpha: 'none',
    ...(target ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' as const } : {}),
  });
  // Guard implementations that ignore resize options, and unknown formats.
  // Originals are closed immediately; neither parser caches nor the GPU see them.
  const wanted = fitTextureSize(bitmap.width, bitmap.height);
  if (wanted.width !== bitmap.width || wanted.height !== bitmap.height) {
    const original = bitmap;
    const canvas = document.createElement('canvas');
    canvas.width = wanted.width; canvas.height = wanted.height;
    const context = canvas.getContext('2d');
    if (!context) { original.close(); throw new Error('Mobile texture resize is unavailable.'); }
    try {
      context.drawImage(original, 0, 0, wanted.width, wanted.height);
      bitmap = await createImageBitmap(canvas, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    } finally { original.close(); canvas.width = canvas.height = 1; }
  }
  stats.decodedImages++;
  stats.originalBytes += (size?.width ?? bitmap.width) * (size?.height ?? bitmap.height) * 4;
  stats.decodedBytes += bitmap.width * bitmap.height * 4;
  stats.largestEdge = Math.max(stats.largestEdge, bitmap.width, bitmap.height);
  return bitmap;
}

/** GLTFParser keeps its normal texture/source caches, sampler and UV handling. */
export class BudgetImageBitmapLoader extends ImageBitmapLoader {
  override load(url: string, onLoad?: (image: ImageBitmap) => void, _progress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): void {
    const resolved = this.manager.resolveURL(this.path + url);
    this.manager.itemStart(resolved);
    void images.run(async () => {
      const response = await fetch(resolved, { headers: this.requestHeader, credentials: this.crossOrigin === 'anonymous' ? 'same-origin' : 'include' });
      if (!response.ok) throw new Error(`Texture load failed (${response.status}).`);
      return decodeBudgetedImage(await response.blob());
    }).then(image => onLoad?.(image)).catch(error => {
      this.manager.itemError(resolved);
      onError?.(error);
    }).finally(() => this.manager.itemEnd(resolved));
  }
}

/** Serialise mobile geometry/image preparation, not the network downloads. */
export function parseGameModel(loader: GLTFLoader, bytes: ArrayBuffer, mobile = mobileAssetBudgetEnabled()): Promise<GLTF> {
  if (!mobile || typeof createImageBitmap === 'undefined') return loader.parseAsync(bytes, '');
  if (!configured.has(loader)) {
    configured.add(loader);
    loader.register(parser => {
      parser.textureLoader = new BudgetImageBitmapLoader(parser.options.manager)
        .setCrossOrigin(parser.options.crossOrigin).setRequestHeader(parser.options.requestHeader);
      return { name: 'MYSCHEDULE_mobile_texture_budget' };
    });
  }
  return models.run(async () => {
    stats.activeModels++;
    stats.peakActiveModels = Math.max(stats.peakActiveModels, stats.activeModels);
    try { return await loader.parseAsync(bytes, ''); }
    finally { stats.activeModels--; }
  });
}

/** Dye masks and clothing atlases outside GLBs use the same decode budget. */
export async function loadBudgetedTexture(url: string): Promise<Texture> {
  const image = await new BudgetImageBitmapLoader().loadAsync(url);
  const texture = new Texture(image);
  texture.needsUpdate = true;
  return texture;
}
