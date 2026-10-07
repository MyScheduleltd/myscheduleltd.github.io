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

const REPOSITORY = 'MyScheduleltd/myscheduleltd.github.io';
/** Only the published site: development and the review pages load locally. */
const MIRRORED_HOSTS = new Set(['myscheduleltd.com', 'www.myscheduleltd.com']);
/** Long enough for a cold jsDelivr edge, short enough not to strand anybody. */
const FIRST_BYTE_MS = 10_000;

let mirrorDown = false;
let integrity: Promise<Record<string, string>> | undefined;

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
  integrity ??= fetch(new URL('asset-integrity.json', assetUrl).href, { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() as Promise<Record<string, string>> : {}))
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
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), FIRST_BYTE_MS);
  try {
    const response = await fetch(mirror, { signal: abort.signal, mode: 'cors', credentials: 'omit' });
    window.clearTimeout(timer);
    // Not there yet (a release newer than the mirror's copy): this file only.
    if (!response.ok) return undefined;
    return await response.arrayBuffer();
  } catch {
    window.clearTimeout(timer);
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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${fileName(url)}: ${response.status}`);
  return response.arrayBuffer();
}

/** A picture, by way of `fetchAsset`, as a URL an image (or a TextureLoader) can open. */
export async function assetObjectUrl(url: string): Promise<string> {
  const bytes = await fetchAsset(url);
  const type = /\.png$/i.test(url) ? 'image/png' : /\.webp$/i.test(url) ? 'image/webp' : 'image/jpeg';
  return URL.createObjectURL(new Blob([bytes], { type }));
}
