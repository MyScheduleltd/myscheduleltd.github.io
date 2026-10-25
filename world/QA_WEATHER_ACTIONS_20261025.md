# Weather, resting actions and loading readiness — 2026-10-25

The owner authorized publication on October 25 after reporting an avatar floating above a beach mat. This batch includes the preceding locally reviewed weather/actions/car-seat changes. Render deployment remains manual with the owner; GitHub main still requires independent approval of the latest push.

## Resulting behaviour

- Reclining fits the visible pelvis, back and heels to the mat independently of the oversized head. A longer pillow supports the nape without changing the mat footprint. Male/female outfits, both swimsuit paths and caps use the same contact solver. Fixed mat fits are prepared behind sign-in and held in a bounded scalar cache.
- Six beach chairs and four mats face the ocean; the Action wheel provides Breaking and floor sitting, rejects ocean sitting, and restores movement on getting up. Each of the six drive-in cars has an independent passenger seat alongside its original driver seat.
- Popcorn stands cast Normal shadows and have a small Lite contact skirt. Avatar shade bounce follows the existing key light for readable faces with directional contrast; no added lights or shadow maps.
- Staff schedule shared rain/snow in Taiwan time. Clouds and sky respond, flakes use three depth bands, and settled snow builds over ten minutes to a .12-unit cap, then melts over fifteen minutes. Ground/interior/water masks, pillow-following mat caps and shared atomic brush-or-sit choices are retained. Weather buttons align right.
- Supplied rain/snow, snowy footsteps, brushing and punch recordings use existing audio controls. All nineteen fixed sounds prepare during entry. Action handlers do not download fireworks audio after admission.

## Loading and performance

Fixed assets finish placement, upload and GPU preparation behind the sign-in view. Native avatar programs retain material owners after temporary warmup rigs/skeletons are released. Shadow owners remain stable by geometry kind, texture/UV channels and shadow side, preparing the same valid pipeline used after an appearance change. Appearance changes also preserve non-casting ground-contact markers instead of turning the painted blob into another shadow caster. First-use features prepare their exact runtime variants; the double-vision effect draws once under the gate using a 1×1 placeholder before allocating its generated frame texture in play. Live participants, programme changes and streamed media remain runtime data.

A renderer-specific resource lease releases only the stopped world's geometry/texture registrations and GPU allocations. Shared CPU templates and another live renderer remain valid. Normal resource disposal prunes tracking immediately; context restoration refreshes ownership on the next draw. No per-frame scene traversal or forced-context-loss policy change is introduced.

Snow keeps one preallocated precipitation draw, at most 960 desktop / 420 phone flakes and 42,240 bytes of precipitation arrays. Flake rotation moved from each fragment to each vertex. Exact terrain sample-row reuse reduces construction queries from 44,196 to 11,264 (74.5%) without changing output geometry. Shared snow sampling/brush lookup no longer rebuilds from unrelated movement events. No additional weather lights, maps or WebGL contexts.

The six new runtime audio files total 455,096 bytes transferred, approximately 6.57 MiB decoded. Source WAV masters and local review art are excluded from the website package.

## Verification

**1,032/1,032 tests, strict TypeScript, final local and production builds, and authored-source whitespace checks pass.** The final actual-driver audit passes **332/332 assertions** across Chrome desktop and iPhone16Pro-profile WebKit, both Normal and Lite. Each run reports zero post-admission fixed-file requests, compile/link calls, page/shader errors, or new/lost contexts. Weather buffers/resources retain identity across transitions. All measured weather samples have zero frame stalls over 100 ms.

Per-frame CPU work p95 in milliseconds on this Mac (six-second samples; recent frame ring):

| Browser profile | Quality | Clear | Rain | Snow |
| --- | --- | ---: | ---: | ---: |
| chrome-desktop | normal | 5.4 | 5.8 | 6.3 |
| chrome-desktop | lite | 4.9 | 5.5 | 6.1 |
| webkit-iphone16pro | normal | 5 | 6 | 6 |
| webkit-iphone16pro | lite | 5 | 5 | 6 |

The measured runs stay approximately 60 fps. Clear includes the production snow-melt tail after stopping precipitation; the raw report records coverage/mixes. These are local browser/emulation measurements, not a physical-iPhone guarantee.

- Contact geometry: 80 real-triangle cases across two sexes, five wardrobe paths, two cap states and four mats. Back/heel/pelvis contact, nape support, below-surface and footprint checks pass. Equivalent prepared first use performs no vertex sweep.
- Visual review: sixteen final low-side/foot views across both sexes and all mats, with a controlled previous-build comparison. No page/shader errors or first-use contact scans in the production-format fixture.
- The tracked `scripts/verify-loading-weather.mjs` runs Chrome desktop and iPhone-profile WebKit, both Normal and Lite, serially. It instruments actual `compileShader`/`linkProgram` calls before navigation and rejects late fixed downloads, new programs, page/shader errors and new/lost contexts after admission. Traversal includes eight locations, three cameras, eight wardrobes, both swim bodies, fireworks and third-drink effects, then measured clear/rain/snow samples with stable resource identity checks.
- The verifier permits only loopback UI4196 and disposable API8796, blocks other network traffic, clears its weather fixture and closes browsers in `finally`. `--self-test` checks instrumentation/network guards without browser dependencies. Use project Playwright or `PLAYWRIGHT_PACKAGE_JSON=/absolute/path/to/playwright/package.json`; optional `CHROMIUM_EXECUTABLE=/absolute/path/to/chrome` selects the installed Chrome.
- Earlier integration checks cover action wedge hit areas, keyboard/controller/focus, mobile layouts, exact UTC+8 staff save/removal, shared brushing, occupancy contention, delayed request ordering, two-person car placement, weather persistence and gradual melt.

Browser phone emulation on a Mac is not a physical-iPhone performance, thermal or real-media certification. No production accounts, donations, messages, codes or weather records were mutated in QA.

## Package and deployment

Build afresh with `VITE_FESTIVAL_SERVER_URL=https://myschedule-festival.onrender.com npm run build`, then `node scripts/publish-beta.mjs --channel beta`. Do not copy the local-API QA build. Verify the package integrity manifest, reachable imports, production API/CSP and absence of local API endpoints or local review pages. Keep historical hashed generations unless successful deployment records establish the existing 24-hour retention rule; prune stays report-only.

Only `/docs/beta` is packaged. M.O.T.H, the retired PS2 duplicate and production records stay untouched. Weather uses the separate optional `festival:weather:v1` persistence key through existing KV configuration, plus local state/seed capture. Without durable storage or retained seed, ephemeral Render disk cannot guarantee redeploy survival.

Generated vendor GLSL retains upstream trailing whitespace; whitespace validation excludes generated JavaScript bundles. Authored source and documentation pass.

**Fresh production package:** `main-DSqJt-PV.js`; all 88 integrity hashes and 110 dist-to-package file copies match, 102 reachable assets have zero missing references, the production API/CSP is correct, and local API/review markers are absent. Report-only pruning retains 187 protected asset files and deletes none. Browser QA used the disposable local API; production packaging is checked separately.

After independent review/merge, verify Pages separately. The owner must deploy the backend manually for weather configuration and new passenger-seat IDs; no Render deploy or settings change is authorized for the agent.
