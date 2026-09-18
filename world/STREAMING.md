# Putting a film on the screens inside a headset

Outside a headset the screens are YouTube iframes and none of this applies.
Inside one there is no DOM to composite and no way to read an iframe's pixels
into a texture, so a screen needs a real media file from a host that sends CORS.

## The host: what does and does not work

**Google Drive's file host cannot be used, and it lies to curl.**

`https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t`
answers a command-line client perfectly — `200`, `content-type: video/mp4`,
`access-control-allow-origin: *`, `accept-ranges: bytes`, correct
`content-range` on a mid-file Range, a passing `OPTIONS` preflight. Every box a
video texture needs, ticked.

It still fails in a browser. Measured 2026-09-18, one header decides it:

| request | result |
|---|---|
| plain curl | `206 video/mp4` |
| `+ Origin: https://myscheduleltd.com` | `206 video/mp4` |
| `+ Chrome User-Agent` | `206 video/mp4` |
| `+ Quest browser User-Agent` | `206 video/mp4` |
| `+ Sec-Fetch-Mode: cors` | `206 video/mp4` |
| `+ Sec-Fetch-Dest: video` | `206 video/mp4` |
| **`+ Sec-Fetch-Site: cross-site`** | **`403 text/html`** |

`Sec-Fetch-Site: cross-site` is exactly what a browser sends when a page on this
site requests a file from Drive. It is Google declining to be hotlinked, and it
cannot be worked around: `Sec-Fetch-*` is a *forbidden header name*, so no fetch
option, no service worker and no `<video>` attribute can unset or forge it. In a
real browser the element fails with `MEDIA_ELEMENT_ERROR: Format error` and a
bare `fetch` with `TypeError: Failed to fetch`.

**The lesson: curl is not a browser.** Test any candidate host from a page.
`scripts/` has no harness for this; the quickest check is to run the dev server
and, in the console:

```js
const v = document.createElement('video');
v.crossOrigin = 'anonymous'; v.muted = true;
v.addEventListener('loadeddata', () => console.log('OK', v.videoWidth, v.duration));
v.addEventListener('error', () => console.log('FAIL', v.error.code, v.error.message));
v.src = CANDIDATE_URL;
```

If it loads, also confirm the pixels are untainted, since that is what a texture
upload needs — draw a frame to a canvas and call `getImageData`. A `SecurityError`
there means the video plays but can never appear on a screen in the world.

### What is still viable

**The Drive REST API, with a browser key.** Under the same
`Sec-Fetch-Site: cross-site` that the file host refuses, `www.googleapis.com`
answers `403 application/json` — *"The request is missing a valid API key"* —
with `access-control-allow-origin` set to this origin. That is an API asking to
be identified, not a host refusing to be embedded. It needs a Google Cloud
project, the Drive API enabled, and a key restricted to the Drive API and this
site's referrer. Quotas make it a testing route, not a delivery plan. One
caveat that cannot be settled without a key in hand: an HTTP-referrer
restriction depends on the browser sending `Referer`, and a `<video>` element's
media requests do not always send one. If playback 403s, the fallback is an
API-restricted key with no referrer restriction.

**A real CDN.** R2 behind a custom domain, Bunny, S3 + CloudFront. No hotlink
policy to be caught out by, no quota to trip, and it is the only one of these
that can carry an audience. Put the URL in `directUrls`; nothing else changes.

To find a Drive `FILE_ID`, open the file and read it out of the address bar:
`drive.google.com/file/d/`**`<FILE_ID>`**`/view`. The file must be shared
*anyone with the link can view*, or the URL 404s for everybody but the owner —
who will see it working.

## The encode

**This matters more than anything in the code.** A headset has to pull the file
over wifi and decode it while holding 90fps in the world around the screen, and
at the size a screen occupies in there a 4K master buys nothing anyone can see
while costing everything they can feel.

```bash
ffmpeg -i master.mov \
  -c:v libx264 -profile:v high -level 4.1 -crf 22 -preset slow \
  -vf "scale=-2:1080" -pix_fmt yuv420p \
  -g 120 -keyint_min 120 -sc_threshold 0 \
  -c:a aac -b:a 160k -ac 2 \
  -movflags +faststart \
  screening.mp4
```

What each part is for:

- **`scale=-2:1080`** — 1080p. The single biggest win, and invisible in a
  headset at this screen size.
- **`-crf 22 -preset slow`** — around 6Mbps for ordinary material. A 3½-minute
  clip lands near 180MB instead of 854MB.
- **`-profile:v high -level 4.1`, `-pix_fmt yuv420p`** — what the Quest's
  hardware decoder actually accelerates. Anything else risks a software decode,
  which will not hold framerate.
- **`-g 120 -keyint_min 120 -sc_threshold 0`** — a keyframe every four seconds,
  evenly. Seeks land quickly and predictably, which is what a shared screening
  clock needs when somebody sits down mid-film.
- **`-movflags +faststart`** — puts the `moov` atom in front of the media so
  playback can begin before the download finishes. **Without this a viewer waits
  for the entire file.** Check it with
  `ffprobe -v error -show_entries format=start_time screening.mp4`, or just
  confirm `moov` appears before `mdat` in the first few KB.

Drive's API quotas are counted generously but they are counted, and an
oversized master burns through them several times faster. Whatever the host,
it needs CORS *and* `Range`, or a screen cannot join a film part-way through.

## How smoothness is held on the client

`src/world/VideoSync.ts` holds the policy, and it is tested in
`scripts/video-sync.test.mjs`.

- **Joining within the first 3 seconds does not seek at all.** A seek before any
  buffer exists is a round trip the viewer waits out in full, and it is not
  worth paying to skip two seconds of a film.
- **Drift up to 5 seconds is walked off** by running the film up to 5% fast or
  slow, rather than by assigning `currentTime`. A seek drops the buffer, opens a
  fresh Range request and sends the decoder hunting for a keyframe — in a
  headset, that is the visible hitch. Browsers correct pitch on a rate change,
  so the audio does not chipmunk. Because the correction runs continuously,
  drift rarely reaches the seek threshold at all.
- **A stalled screen is never told to hurry**, which would only ask for more of
  what it has not got.
- **A loop point is not mistaken for drift** — a screen two seconds from the end
  of a looping film, told the screening is one second in, is three seconds
  behind the short way round, not a whole film ahead.
- **The connection is warmed** with a `preconnect` in `index.html`, so DNS, TCP
  and TLS are done before the first screening needs a byte. Retarget it if the
  media host changes, or it warms a connection nothing will use.

`?review=vr-hud` reports `directVideoBuffering`, `directVideoStalledMs`,
`directVideoRate` and `directVideoBufferedAhead`, so a bad-looking screening can
be diagnosed as the network or the world rather than guessed at.
