/**
 * The world's heavy files — bodies, the band, their textures — fetched from
 * jsDelivr's copy of this repository, and from GitHub Pages when that fails.
 *
 * GitHub Pages sent them to the owner's machine at ~45 KB/s a file, cached
 * or not; jsDelivr sent the same file at ~2 MB/s (2026-10-07). At Pages'
 * speed the band's 8.5 MB took over a minute and the bodies held the sign-in
 * page up for half of one. The owner chose the mirror, with Pages behind it.
 *
 * jsDelivr is somebody else's server, so nothing from it is used unchecked:
 * every file's SHA-256 is published beside it on Pages, by this site, at build
 * time (`asset-integrity.json`, vite.config.ts), and a file whose hash does not
 * match is thrown away and fetched from Pages instead. Only data travels this
 * way — models and pictures. The page's code never does.
 *
 * The mirror follows `main`, which jsDelivr re-reads at most every 12 hours
 * (sooner when purged after a release). A file too new for it is a 404 there
 * and comes from Pages; a mirror that errors or stalls is left alone for the
 * rest of the visit.
 */

import { requestWithDeadline } from '../network/RequestDeadline';

const REPOSITORY = 'MyScheduleltd/myscheduleltd.github.io';
/** Only the published site: development and the review pages load locally. */
const MIRRORED_HOSTS = new Set(['myscheduleltd.com', 'www.myscheduleltd.com']);
/** No-progress limits cover headers and body, without cutting off a slow download. */
const MANIFEST_MS = 10_000;
const MIRROR_MS = 20_000;
const SITE_MS = 60_000;

let mirrorDown = false;
let integrity: Promise<Record<string, string>> | undefined;

type DownloadProgress = { file: string; received: number };
const progressListeners = new Set<(progress: DownloadProgress) => void>();
export function watchAssetDownloads(listener: (progress: DownloadProgress) => void): () => void {
  progressListeners.add(listener);
  return () => { progressListeners.delete(listener); };
}

async function download(url: string, milliseconds: number, mirrored = false): Promise<ArrayBuffer | undefined> {
  return requestWithDeadline(async (signal, keepAlive) => {
    const response = await fetch(url, { signal, ...(mirrored ? { mode: 'cors' as const, credentials: 'omit' as const } : {}) });
    if (!response.ok) {
      if (mirrored) return undefined;
      throw new Error(`${fileName(url)}: ${response.status}`);
    }
    // Only arriving bytes renew the timer; successful headers alone do not.
    if (!response.body) return response.arrayBuffer();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value.length) continue;
        chunks.push(value);
        received += value.length;
        keepAlive();
        for (const listener of progressListeners) listener({ file: fileName(url), received });
      }
    } finally {
      if (signal.aborted) void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes.buffer;
  }, milliseconds, `${fileName(url)} download`);
}

/** Where jsDelivr keeps the same file, or nothing when it should not be used. */
export function mirrorUrl(url: string, here: Location | URL = window.location): string | undefined {
  try {
    const file = new URL(url, here.href);
    if (!MIRRORED_HOSTS.has(file.hostname) || file.hostname !== here.hostname) return undefined;
    // Pages publishes `docs/` at the root of the domain.
    return `https://cdn.jsdelivr.net/gh/${REPOSITORY}@main/docs${file.pathname}`;
  } catch {
    return undefined;
  }
}

/** The published hashes, read once, from Pages — never from the mirror. */
function hashes(assetUrl: string): Promise<Record<string, string>> {
  integrity ??= requestWithDeadline(async (signal) => {
    const response = await fetch(new URL('asset-integrity.json', assetUrl).href, { cache: 'no-cache', signal });
    return response.ok ? response.json() as Promise<Record<string, string>> : {};
  }, MANIFEST_MS, 'Asset integrity download')
    .catch(() => ({}));
  return integrity;
}

const fileName = (url: string): string => new URL(url, window.location.href).pathname.split('/').pop() ?? '';

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let text = '';
  for (const byte of digest) text += String.fromCharCode(byte);
  return `sha256-${btoa(text)}`;
}

async function fromMirror(mirror: string): Promise<ArrayBuffer | undefined> {
  try {
    // A missing new file is not an outage of the whole mirror.
    return await download(mirror, MIRROR_MS, true);
  } catch {
    // Unreachable, refused or stalled: stop asking it for this visit.
    mirrorDown = true;
    return undefined;
  }
}

/** A heavy file's bytes: from the mirror when it has them and they check out, otherwise from Pages. */
export async function fetchAsset(url: string): Promise<ArrayBuffer> {
  const mirror = mirrorDown || typeof crypto === 'undefined' || !crypto.subtle ? undefined : mirrorUrl(url);
  if (mirror) {
    const expected = (await hashes(url))[fileName(url)];
    if (expected) {
      const bytes = await fromMirror(mirror);
      if (bytes && await sha256(bytes) === expected) return bytes;
      if (bytes) console.warn(`The mirror's copy of ${fileName(url)} did not match; fetching it from the site instead.`);
    }
  }
  return (await download(url, SITE_MS))!;
}

/** A picture, by way of `fetchAsset`, as a URL an image (or a TextureLoader) can open. */
export async function assetObjectUrl(url: string): Promise<string> {
  const bytes = await fetchAsset(url);
  const type = /\.png$/i.test(url) ? 'image/png' : /\.webp$/i.test(url) ? 'image/webp' : 'image/jpeg';
  return URL.createObjectURL(new Blob([bytes], { type }));
}
