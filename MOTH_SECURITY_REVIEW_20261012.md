# M.O.T.H integration and security review — 12 October 2026

Status: the initial integration is live following PR #18, and the loading/audio repair following PR #19; the jsDelivr follow-up below requires review. All 238 deployed game files matched the package, both game URLs returned 200, and all five menus contain M.O.T.H below BETA. The loading/audio follow-up described below requires review and publication; its browser checks are local unless explicitly labelled live.

## Requested experience

- `M.O.T.H` appears immediately after `BETA` in the side menu on all five main website pages and links to `/moth/` in the same tab.
- `/moth/` uses the selected published `mobile-deck-20261012a` game from `https://beauty-boy.vercel.app/`. The snapshot hashes every downloaded file and checks that the release entry did not move during the download. All 231 retained assets/configuration files match that snapshot. Original styles remain intact, with refresh-screen styles appended.
- The public script removes 28 debug methods or replaces shared debug hooks with inert helpers. It does not construct a panel or toggle, accept debug/autostart URL launches, intercept P to open tools, load saved dialogue overrides, or expose the game instance/class to global browser JavaScript. Its script runs inside a closure. Gameplay dialogue definitions remain available.
- `/moth/staff/` retains debug tools and displays their toggle without requiring a query parameter. It is unlisted and marked `noindex, nofollow, noarchive`. **It is publicly accessible to anyone with the URL**, as expressly selected by the owner. It is not an authenticated administrative area.
- Public/staff progress and preferences have distinct storage namespaces. Debug changes operate in that browser; they do not publish content or modify the website's server.
- The package includes 238 files, with 18 required music files and 27 sound effects. Every audio path is referenced by game code/configuration. Diagnostic HTML pages, archives, original development projects and a downloadable deployment manifest are excluded.
- Browser playback still permits retrieving or recording the audio. The owner accepted this limitation. There is no claim of DRM or download prevention.

## Protections added

- Both game entries have Content Security Policy metadata limiting scripts, media and data requests to this website; inline JavaScript, external connections, plugins and form submissions are blocked. Required dynamic styles remain permitted. The manifest is explicitly allowed.
- The game's data requests may also reach one jsDelivr path, pinned to the commit that published these assets: `cdn.jsdelivr.net/gh/MyScheduleltd/myscheduleltd.github.io@4a1cae24…/docs/moth/`. Images and sound effects from it are used only when their SHA-256 matches `/moth/asset-integrity.json`, which this site serves. Code and configuration never come from it.
- Both game scripts have SHA-384 Subresource Integrity attributes checked against the packaged bytes.
- The five main pages and their Pug template now have a resource policy allowing the existing pinned jQuery, Bootstrap, Swiper and YouTube integrations. Existing third-party script/style integrity attributes are preserved.
- A development-only `source-map-js` advisory was found and patched from 1.2.1 to 1.2.2 in `world/package-lock.json`. No BETA/PS2 application bundles were rebuilt or changed. The published backend uses Node built-ins rather than this build dependency.

## Loading and audio follow-up

- The initial loader blocked the menu on artwork from every chapter. All packaged WebP artwork totals about 829 MB when expanded to RGBA pixels; actual browser memory also depends on decoding and GPU copies. The phone's failure screenshot names a later-level image while the game is still opening. A failed initial image prevented audio initialization as well.
- The menu now starts after configuration is ready, without downloading chapter images, songs or sound effects. The existing device/control artwork remains. Chapter entry loads the common art and that chapter's art, then releases other chapters' image references. The original artwork files and audio files are unchanged.
- Image downloads have a 20-second attempt timeout and up to three attempts, with a fresh retry URL after a failed attempt. Configuration downloads also have bounded retries. Asset jobs use three workers; batches are serialized, and a cancelled entry cannot reopen an earlier scene.
- A permanent failure shows a dark, red-bordered console-style panel with a clear REFRESH PAGE button instead of a filename and GAME OVER. English and Traditional Chinese prompts are provided. Refresh keeps existing session saves. Behind the panel the game screen shows only CONNECTION LOST on a dark scanline ground. The retired level-1 road scene and its HUD are no longer redrawn, and the backdrop is lighter so that text reads.
- Music and effects share an AudioContext, resumed on real input. Sound effects download/decode when a fight or sound test needs them. Songs do not preload at startup. An audio-start failure now exposes its existing recovery dialog and a working enable-sound button instead of pausing behind an invisible prompt.
- `scripts/verify-moth-loading.mjs` exercises Chrome and WebKit: ten scene entries, chapter eviction, cancelled-entry handling, transient retries, permanent failures, refresh/session preservation, public debug absence, and audio recovery. It measures nonzero PCM from earned-track playback and game sound effects, and verifies all 27 effects decoded. Physical iPhone playback still needs validation after publication.
- **Live regression after PR #19, fixed in the follow-up.** GitHub Pages delivers about 40–90 KB/s per file to Taiwan, while this network reaches jsDelivr at about 2–4 MB/s. The 20-second total limit per image attempt aborted level 1's 6.8 MB background on every try, so live level 1 showed CONNECTION LOST after about 110 seconds. Downloads are now abandoned only after 20 seconds with no data (15 seconds for configuration). Images and sound effects come from the pinned jsDelivr copy when their hash matches, with one retry; otherwise from this site. Fight music and songs still stream from Pages, since their bitrate (about 31 KB/s) is below Pages' throughput. `scripts/verify-moth-mirror.mjs` serves this build as the live site and uses the real jsDelivr. In Chrome and WebKit, level 1 opened in about 3 seconds. A tampered mirror copy was rejected in favour of this site's copy. A jsDelivr outage fell back cleanly. A steady 150 KB/s download of 56–59 seconds completed.
- **Music follow-up.** Live after PR #20, a playlist song took about 24 seconds to start and the level-1 fight about 16 seconds, because music still streamed from Pages. Fight tracks and songs now use the same hash-checked jsDelivr copies, played from a local object URL. iPhone grants playback to the play inside a tap, so a copy replaces a track's source only before that track's first play, in the tap that primes it (`primeRhythmTrack`, `getHomePlaylistAudio`). After that a track's source never changes. To have copies ready in time, the home screen fetches the first fight's track, the highlighted song or stage after 300 ms, and the next track; each chapter fetches its fights' tracks while it loads. A track whose copy isn't ready streams from Pages as before. At most eight unused copies are kept, and a copy any player still references is never released. Verified with the live site emulated in Chrome and WebKit: fight music plays the verified copy with no Pages request, and a highlighted song starts in 0.5–1.0 seconds.

## Verification

Evidence is retained in the checkout's ignored `.qa/moth/` directory.

| Check | Result |
| --- | --- |
| Published snapshot / package integrity | 231 preserved files match; original styles retained with recovery styles appended; no recognized credential patterns in M.O.T.H; no diagnostic pages or unreferenced audio |
| Public browser behavior | Chrome and WebKit, desktop/portrait/small phone/landscape: title and actual story tutorial render; debug URL switches and P do not create controls; no public game globals |
| Staff browser behavior | Both engines: visible toggle, P, hidden-level unlock, fight launch, separate storage |
| Injection restriction | Both engines refuse an injected inline script under the game policy |
| Side menu | All five pages: mobile link visible within viewport, immediately below BETA; staff absent; page scripts/resource policy checked |
| Existing backend suite | 73 tests pass, including chat sanitization, protected moderation, staff access/key rotation/lockout, session limits, and payment behavior |
| Additional isolated production-mode security checks | 11 checks pass: anonymous/invalid-key admin writes, file-upload/static-write rejection, environment access, traversal, foreign origin, oversized input and credential/marker exposure |
| Payment implementation suite | 30 tests pass |
| Dependency advisories | Full lockfile and production-only audit: zero known advisories after patch |
| Published website/API file exposure | Tested `.env`, `.git/config`, server source/state, and encoded traversal paths reject access with 404/400 |
| Live admin authorization | Missing/invalid keys return 401; admin state and offering data are inaccessible anonymously |
| Live origin checks | Website origin accepted; foreign origin rejected with 403 |
| Live public API configuration | No credential-named fields found in the response; intentionally public configuration remains available |
| Credential-pattern scan | 737 served text files scanned; no OpenAI/GitHub/AWS token or private-key patterns found. Existing Google browser key appears in 86 BETA bundles |
| Existing Google Drive browser key | Missing and foreign referrers receive 403 `API_KEY_HTTP_REFERRER_BLOCKED`; site referrer accepted with 200. Key retained following the owner's reply |
| Repository controls | Main requires one approval, approval of the latest push, and enforcement for admins. One admin and two write collaborators are configured. Automatic merging is disabled |

The live checks are non-destructive: no production uploads, chat posts, payments, setting changes or load testing were performed. Source review found no visitor file-upload endpoint in M.O.T.H. Its static files can only be published through repository/hosting access. The existing festival's write/moderation routes use separate session/admin controls; M.O.T.H does not call them.

## Remaining limits

- This is an implementation review, dependency check, local browser test and targeted live assessment, not a guarantee that every possible vulnerability or malware is absent. Credential scanning is pattern-based and cannot prove the absence of all secrets.
- The initial production routes and all 238 files were verified after publication. This loading/audio repair still needs production verification after merge and GitHub Pages publication. Physical phones have not been tested.
- The staff URL is intentionally public, and robots metadata does not enforce access control. Staff debug actions change that visitor's game, not website administration.
- Songs and other public media can be downloaded or recorded. Removing download buttons or hiding URLs cannot solve that while browser playback is preserved.
- jsDelivr is a third-party service. If it is unavailable, or a copy fails its hash, the game falls back to GitHub Pages' slower delivery. A connection slower than the fight music's bitrate (about 31 KB/s) would still stutter.
- jsDelivr fetches each file from GitHub on its first request. GitHub's raw server is also slow from Taiwan (33–59 seconds for a song), and when that first fetch fails jsDelivr returned a cached 403 ("Package size exceeded the configured limit of 50 MB") for a while. All 224 media files were fetched and hash-checked through jsDelivr on 2026-10-12 to warm it; a purge cleared the stuck entries. A file in that state streams or downloads from Pages instead. One verifier run also saw a single slow jsDelivr period (103 seconds for level 1, 3 seconds on every other run). Music is not yet verified on a physical iPhone.
- The existing Google browser key remains public by design. Referrer rejection was observed; Google Cloud service restrictions, quota/billing configuration and account access were not inspected. Referrers are not a substitute for server authentication.
- GitHub Pages serves the static site with HTTPS enforced, but the responses checked do not provide HSTS, `nosniff`, or a configurable header-level frame policy on ordinary site pages. CSP metadata does not supply `frame-ancestors`. Adding those headers would require a hosting/proxy change.
- GitHub/Render/Google account MFA, recovery settings, organization policies and third-party media ownership were outside the accessible evidence. Repository protection is preserved; no bypass was used.

## Sources

- [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
- [Google API key guidance](https://support.google.com/googleapi/answer/6310037?hl=en)
- [OWASP authorization regression testing](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Regression_Testing_Cheat_Sheet.html)
- [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)

## Reproduction

From this checkout: `python3 scripts/fetch-published-moth.py`, then `MOTH_TYPESCRIPT_PATH=/path/to/typescript/lib/typescript.js node scripts/build-moth.mjs`. The builder asserts the selected published release ID and integrity of the snapshot.

Run `node scripts/verify-moth-package.mjs`, `node scripts/verify-moth.mjs http://127.0.0.1:5286/`, `node scripts/verify-backend-security.mjs`, `node --test world/server/server.test.mjs world/server/ecpay.test.mjs`, and `python3 scripts/check-live-security.py`. The browser verifier uses the existing bundled Playwright runtime. Serve `docs/` for local previews. After deployment, run the browser verifier against `https://myscheduleltd.com/` and compare public asset hashes before calling the integration live-verified.
