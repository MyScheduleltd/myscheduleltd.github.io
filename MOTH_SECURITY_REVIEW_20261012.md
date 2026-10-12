# M.O.T.H integration and security review — 12 October 2026

Status: implementation and local checks complete; production publication requires an approving GitHub pull-request review. The existing public website and game have been inspected; the new `/moth/` routes have not yet been deployed or tested publicly.

## Requested experience

- `M.O.T.H` appears immediately after `BETA` in the side menu on all five main website pages and links to `/moth/` in the same tab.
- `/moth/` uses the currently published `mobile-deck-20261012a` game from `https://beauty-boy.vercel.app/`. The snapshot hashes every downloaded file and checks that the release entry did not move during the download. All 232 retained assets/configuration/styles match that snapshot.
- The public script removes 28 debug methods or replaces shared debug hooks with inert helpers. It does not construct a panel or toggle, accept debug/autostart URL launches, intercept P to open tools, load saved dialogue overrides, or expose the game instance/class to global browser JavaScript. Its script runs inside a closure. Gameplay dialogue definitions remain available.
- `/moth/staff/` retains debug tools and displays their toggle without requiring a query parameter. It is unlisted and marked `noindex, nofollow, noarchive`. **It is publicly accessible to anyone with the URL**, as expressly selected by the owner. It is not an authenticated administrative area.
- Public/staff progress and preferences have distinct storage namespaces. Debug changes operate in that browser; they do not publish content or modify the website's server.
- The package includes 238 files, with 18 required music files and 27 sound effects. Every audio path is referenced by game code/configuration. Diagnostic HTML pages, archives, original development projects and a downloadable deployment manifest are excluded.
- Browser playback still permits retrieving or recording the audio. The owner accepted this limitation. There is no claim of DRM or download prevention.

## Protections added

- Both game entries have Content Security Policy metadata limiting scripts, media and data requests to this website; inline JavaScript, external connections, plugins and form submissions are blocked. Required dynamic styles remain permitted. The manifest is explicitly allowed.
- Both game scripts have SHA-384 Subresource Integrity attributes checked against the packaged bytes.
- The five main pages and their Pug template now have a resource policy allowing the existing pinned jQuery, Bootstrap, Swiper and YouTube integrations. Existing third-party script/style integrity attributes are preserved.
- A development-only `source-map-js` advisory was found and patched from 1.2.1 to 1.2.2 in `world/package-lock.json`. No BETA/PS2 application bundles were rebuilt or changed. The published backend uses Node built-ins rather than this build dependency.

## Verification

Evidence is retained in the checkout's ignored `.qa/moth/` directory.

| Check | Result |
| --- | --- |
| Published snapshot / package integrity | 232 preserved files match; no recognized credential patterns in M.O.T.H; no diagnostic pages or unreferenced audio |
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
- New M.O.T.H production routes and anonymous live asset integrity still need verification after merge and GitHub Pages publication. Physical phones have not been tested.
- The staff URL is intentionally public, and robots metadata does not enforce access control. Staff debug actions change that visitor's game, not website administration.
- Songs and other public media can be downloaded or recorded. Removing download buttons or hiding URLs cannot solve that while browser playback is preserved.
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
