import { resolveMediaUrl } from './MediaLink';
/**
 * Where an in-world screen gets a film it can draw *inside a headset*.
 *
 * Outside a headset the screens are YouTube iframes composited through the
 * CSS3D layer, and that stays exactly as it is. An immersive session composites
 * no DOM at all, so nothing in an iframe reaches the display and an iframe's
 * pixels cannot be read into a WebGL texture — which is why a headset needs an
 * actual media file, from a host that permits cross-origin use. Keyed by the
 * YouTube id of the film it stands in for.
 *
 * An entry with no usable URL is dropped rather than shipped broken, so a
 * half-finished setup leaves the screens on their posters instead of failing
 * to load.
 */

/**
 * Google Drive's *file* host cannot be used, and the reason is worth recording
 * because it does not show up in the obvious test.
 *
 * `https://drive.usercontent.google.com/download?id=…&export=download&confirm=t`
 * answers a command-line client perfectly: `200`, `content-type: video/mp4`,
 * `access-control-allow-origin: *`, `accept-ranges: bytes`, correct
 * `content-range` on a mid-file Range, and a passing `OPTIONS` preflight. Every
 * box a video texture needs, ticked.
 *
 * It still fails in a browser. Measured 2026-09-18, the single header
 * `Sec-Fetch-Site: cross-site` turns that `206 video/mp4` into `403 text/html`.
 * `Sec-Fetch-Mode`, `Sec-Fetch-Dest`, the User-Agent and the Origin all make no
 * difference on their own — it is that one header, and it is precisely the one
 * a browser sends when a page on this site requests a file from Drive. It is
 * Google declining to be hotlinked, and it cannot be worked around: `Sec-Fetch-*`
 * is a forbidden header name, so no fetch option, no service worker and no
 * `<video>` attribute can unset or forge it. Confirmed in a real browser, where
 * the element fails with `MEDIA_ELEMENT_ERROR: Format error` and a bare `fetch`
 * with `TypeError: Failed to fetch`.
 *
 * So: curl is not a browser. Anything claiming to serve media to this world has
 * to be tested from a page, not from a shell.
 */

/**
 * A browser API key for the Google Drive API, restricted to this site.
 *
 * Empty until one is issued. The REST API is a different host with different
 * manners: under the same `Sec-Fetch-Site: cross-site` that Drive's file host
 * refuses, `www.googleapis.com` answers `403 application/json` — "The request
 * is missing a valid API key" — with `access-control-allow-origin` set to this
 * origin. That is an API asking to be identified, not a host refusing to be
 * embedded, which is why this is the one Drive route still worth a key.
 *
 * Note what a browser key is and is not: it ships inside the public bundle, so
 * it is **public by design** — what protects it is the restriction on the key
 * (Drive API only, and this site's referrer), not secrecy. Do not put an
 * unrestricted key here, and do not put an OAuth client secret here under any
 * circumstances.
 *
 * Drive is also not a CDN. Quotas are per-project and Google discourages
 * serving media this way, so this is a route for testing in the headset rather
 * than for delivering a catalogue to an audience.
 */
const driveApiKey = 'AIzaSyCOVGK4WTCqQzapmMDnc3cgTuCCtvPyqOI';

/**
 * A link a member of staff pasted into the STAFF panel, resolved against this
 * build's Drive key. The key lives here and only here, so resolving has to
 * happen on this side rather than on the service.
 */
export const immersiveUrlFor = (pasted: string | undefined): string | undefined =>
  resolveMediaUrl(pasted, driveApiKey);

const driveMedia = (fileId: string): string | undefined =>
  driveApiKey ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${driveApiKey}` : undefined;

/** The host a screen will actually talk to, for the warm-up in index.html. */
export const MEDIA_ORIGIN = 'https://www.googleapis.com';

/**
 * YouTube id → Drive file id.
 *
 * The file behind each id should be a *streaming* encode, not the delivery
 * master: H.264 High, 1080p, around 6Mbps, AAC, and `-movflags +faststart` so
 * the moov atom leads and playback can begin before the download finishes. A
 * headset has to fetch this over wifi and decode it while holding 90fps in the
 * world around the screen, and at the size the screen occupies in there a 4K
 * master buys nothing a viewer can see while costing everything they can feel.
 * See `world/STREAMING.md`.
 */
const driveFiles: Record<string, string> = {
  // Skibidi — JJ Lin Ft. Jackie Chen, first in the DRIVE-IN 88 playlist.
  // The 1080p/6Mbps streaming encode, not the 4K master: the master was
  // 895MB at 35Mbps, which a headset cannot decode while holding 90fps in
  // the world around the screen. Keyframes every two seconds, so a screen
  // joining a film part way through lands close to the programme clock.
  jiawzYgfkuI: '1y1oR_RYNXob0NBuB4QiLgywV5IEJzDXT',
};

/**
 * YouTube id → a direct media URL on a host that sends CORS: R2 behind a custom
 * domain, Bunny, S3 + CloudFront. The right home for anything an audience will
 * watch, and the only one of these routes with no hotlink policy to be caught
 * out by. Needs `Range` support as well as CORS, or a screen cannot join a film
 * part-way through and the shared programme clock has nothing to seek to.
 */
const directUrls: Record<string, string> = {};

const usable = (entries: Array<[string, string | undefined]>): Record<string, string> =>
  Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1])));

export const immersiveVideoSources: Record<string, string> = {
  ...usable(Object.entries(driveFiles).map(([youtubeId, fileId]) => [youtubeId, driveMedia(fileId)])),
  // A direct URL wins, so moving a film onto a real CDN needs no other change.
  ...directUrls,
};
