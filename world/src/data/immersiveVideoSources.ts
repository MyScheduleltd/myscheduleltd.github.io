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
 * Two hosts are wired. Add a film to whichever applies; an entry with no usable
 * URL is dropped rather than shipped broken, so a half-finished setup leaves
 * the screens on their posters instead of failing to load.
 */

/**
 * A browser API key for the Google Drive API, restricted to this site.
 *
 * Empty until one is issued. Note what this is and is not: a browser key ships
 * inside the public bundle, so it is **public by design** — what protects it is
 * the restriction on the key (Drive API only, and this site's referrer), not
 * secrecy. Do not put an unrestricted key here, and do not put an OAuth client
 * secret here under any circumstances.
 *
 * Drive is also **not a CDN**. Google's quotas are per-project and they
 * discourage serving media this way, so this is a route for testing in the
 * headset rather than for delivering a catalogue to an audience. When a real
 * CDN exists, move the film to `directUrls` below and drop it from here.
 */
const driveApiKey = '';

/**
 * The Drive API's `alt=media` response carries
 * `access-control-allow-origin` reflecting the caller, which is what makes it
 * usable as a texture. The ordinary `drive.google.com/uc?export=download`
 * endpoint does **not**: it answers `text/html` with the virus-scan
 * interstitial and no CORS header at all. They are not interchangeable.
 *
 * The file has to be shared so that anyone with the link can view it.
 */
const driveMedia = (fileId: string): string | undefined =>
  driveApiKey ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${driveApiKey}` : undefined;

/** YouTube id → Drive file id, for films hosted on Drive. */
const driveFiles: Record<string, string> = {
  // Skibidi — JJ Lin Ft. Jackie Chen, first in the DRIVE-IN 88 playlist.
  jiawzYgfkuI: '1OwWa9w8QScOGX4ZE3Hog4JldlV2RTDKu',
};

/**
 * YouTube id → a direct media URL on a host that sends CORS: R2 behind a custom
 * domain, Bunny, S3 + CloudFront. The right home for anything an audience will
 * watch. Needs `Range` support as well as CORS, or a screen cannot join a film
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
