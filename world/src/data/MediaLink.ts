/**
 * What a member of staff pastes, turned into something a `<video>` can load.
 *
 * Nobody should have to know that a Google Drive share link is not a video.
 * Drive hands out `.../file/d/<id>/view?usp=sharing`, and that address serves
 * an HTML viewer page — and its *file* host refuses a cross-site request
 * outright, because `Sec-Fetch-Site: cross-site` is a forbidden header name
 * that no fetch option, service worker or `<video>` attribute can unset. The
 * API host is the only door that answers a browser, and it needs a key.
 *
 * So: a Drive link of any shape becomes an API media URL, and anything else
 * on https is handed back untouched, which is what a real CDN wants.
 */

const DRIVE_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
  'drive.usercontent.google.com',
]);

/** A Drive file id is long, and Drive's own ids use the URL-safe alphabet. */
const FILE_ID = /^[A-Za-z0-9_-]{10,}$/;

/** The file id inside a Drive link, in any of the shapes Drive gives out. */
export function driveFileId(link: string): string | undefined {
  let url: URL;
  try { url = new URL(link.trim()); } catch { return undefined; }
  if (!DRIVE_HOSTS.has(url.hostname)) return undefined;
  // .../file/d/<id>/view, .../document/d/<id>/edit
  const inPath = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url.pathname);
  if (inPath) return inPath[1];
  // .../open?id=<id>, .../uc?export=download&id=<id>
  const query = url.searchParams.get('id');
  return query && FILE_ID.test(query) ? query : undefined;
}

/**
 * The address a screen should actually fetch.
 *
 * `undefined` means there is nothing playable here: an empty box, something
 * that is not a URL, anything not on https, or a Drive link with no key
 * configured to read it with. A screen with no source falls back to its
 * painted poster, which is the right outcome for all of those.
 */
export function resolveMediaUrl(
  link: string | undefined,
  driveApiKey: string,
): string | undefined {
  if (!link?.trim()) return undefined;
  let url: URL;
  try { url = new URL(link.trim()); } catch { return undefined; }
  // A headset will not play mixed content, and neither will the site.
  if (url.protocol !== 'https:') return undefined;
  const fileId = driveFileId(url.href);
  if (!fileId) return url.href;
  return driveApiKey
    ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${driveApiKey}`
    : undefined;
}

/**
 * The id inside a YouTube link, in the shapes people actually paste.
 *
 * The service has the same parser, because it has to validate what arrives.
 * This side needs it too: a newly added film has to be matched to the VR link
 * pasted beside it before the service has answered with anything to match on.
 */
export function youtubeIdFromUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return ''; }
  if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] ?? '';
  const parts = url.pathname.split('/').filter(Boolean);
  if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] ?? '';
  return url.searchParams.get('v') ?? '';
}
