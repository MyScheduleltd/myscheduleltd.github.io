# Current follow-up — island snow, seating and audio, 2026-10-26 (Asia/Taipei)

**OWNER-AUTHORIZED RELEASE; READY FOR PROTECTED PR.** Worktree: `/Users/myscheduleai/Desktop/myschedule-pivot/festival-weather-actions-20261024/world`, branch `codex/weather-coverage-20261025`, base/main `29b1ea191d2483496e667b534c160ace50f4363a` (PR62 merged). This entry supersedes historical LOCAL ONLY/additional-approval instructions for this follow-up. Main requires one independent approval of the latest push, with admin enforcement. Do not bypass or self-approve. The owner alone handles Render deployment and settings.

**Latest owner decision, 2026-10-26 17:12:** use the screenshot labelled “Small leg-angle change only.” Original `BeachRelaxation.ts` is byte-for-byte HEAD: cloth, stripes, frame, placement, anchors and collision geometry unchanged. The selected posture uses hip pitch −π/2−.3, knee maximum 1.3, native pad clearance .022. No forward avatar shift. The preview still has slight front-canvas intersection; the owner selected it with that limitation visible. Do not claim zero clipping. Tests cover 120 body/outfit/cap/chair cases, exact selected angles, supported pelvis and unchanged roots/furniture; residual canvas depth stays within the reviewed ~.079 world-unit ceiling and no frame/rail triangles intersect. Rejected chair-geometry and forward-offset prototypes stay local and must not ship.

Final Node suite **1,073/1,073**, TypeScript, local and production builds, and authored whitespace checks pass. Final built-world coverage **80/80**, strict actual-GL loading **556/556**, and eight visually inspected original-chair side/opposite captures pass across desktop Chrome and iPhone16Pro-profile WebKit, Normal/Lite. Earlier 42 beach-shadow captures remain valid for the unchanged shadow fix; those pairs toggle focus/bounds/casters diagnostically, not a complete historical build. Isolated UI checks: 12 action/STAFF plus 24 native seat/mat cases in ZH/EN, Noir and phone portrait/landscape.

No fixed downloads, compileShader/linkProgram calls, new/lost contexts or page/shader errors after admission. All 95 fixed roof/stair/dock sources and 46 caps prepare under the gate. The 192 browser first-chair checks and 120 fresh-native CPU cases reuse prepared seat-contact fits with zero seat-contact vertex reads. Existing bounded foot maintenance is separate. Weather resources remain identical through transitions/repeats. Complete live weather buffers: 4,521,888 B (<5 MiB). Clear/rain/snow CPU-work p95 (ms): Chrome Normal 5.9/6.2/6.8, Lite 4.9/5.5/6.2; WebKit Normal 6/6/6, Lite 5/5/6. No >100 ms gaps in measured samples. These are Mac/emulation results, not physical-iPhone, thermal, crowd or real-media certification.

Implemented: beach shadow focus follows the attendee using existing 1024 maps; major planting and Palace masses cast. Adaptive terrain snow plus exact authored extraction cover dorms, roofs, canopies, band roof, western block, Wish Wall, final visible box-office shell, dock and real stairs. Hidden retired shells, clerk and moving boat are excluded. Exact source clipping is bounded (256 pieces/face and independent input/output/spatial/CPU limits). Existing .12 snow cap, 10-minute buildup and 15-minute melt remain; one authored snow draw, no new weather map/light/context.

Wiped outdoor seats regrow from authoritative timestamps during active snowfall, stop rebuilding when snowfall ends and then melt only their rebuilt layer. Immediate retries remain silent and bounded; later snow permits a fresh wipe. Schema, auth, occupancy and rate limits remain. **The owner must manually deploy Render after/alongside merge for backend regrowth.** No production data or deployment settings were changed.

Indoor Palace/Club seats have neither caps nor brush prompts, including stale paths. Physical shelter survives roof cutaway. Palace ceiling ties retain the scoped overhead role through material replacement, worn preparation and batching; the active isometric lens removes them without moving geometry or lowering the screen cut. Carried MENTOR hides both nameplate and NPC ticket locally/remotely and restores them on release. Snow menus reuse the sitting ticket UI and have separate mat/lying-down wording in both languages. English ACTION fits, the ground-sit glyph matches the knees-up pose, hover fill follows selection, STAFF fields/buttons match and blank errors are hidden.

Snow footsteps are 6 dB quieter. Active snowfall crossfades ordinary day/night/surf to silence and plays winter ambience plus quieter supplied wind, on the existing 1.2-second audio glide, buses and mute/muffle controls. Melting alone restores ordinary ambience. Wind: 56,492 B transfer / 1,344,000 B decoded; all weather/action additions 8,235,344 B (<8 MiB at 48 kHz). All 20 fixed sounds preload under entry. Supplied WAVs unchanged. A real delayed-settings gate redraw race is also fixed: quickly typed names survive; the browser verifier holds the response until typing and asserts retention.

Production BETA package: `docs/beta/assets/main-BIhS5Klo.js`, real Render API. All 89 integrity hashes and 111 dist/package files match; 103 reachable assets, zero missing, no local API/review markers. All 201 published assets retained because deployment times are unverified. Only seven superseded, proven never-published candidate files were removed. M.O.T.H/retired PS2 untouched. Final scoped mirror covers 48 byte-equal paths (including original-chair restoration) plus matching handoff headers with distinct historical bodies preserved; unrelated canonical dirty work remains.

Evidence: `QA_WEATHER_COVERAGE_20261026.md` and local `art/weather-coverage-20261025/{loading-final,coverage-final-browser,chair-angle-browser}` plus full-test/build/package/mirror reports. Screenshots/logs/local wrappers/backups stay out of Git; only the small wind recipe is a new tracked art record. Find the release PR with `gh pr view codex/weather-coverage-20261025`; independent latest-push review/merge and Pages verification remain before live status can be claimed.

Disposable API8796 has state/seed/external storage disabled. Dev4194 remains the Mac playable wrapper against that API. Preview4196 is stopped; `dist` now contains the production API package and must not be served for local testing. Canonical mirror is `release-sfx-20261018/world`; preserve its unrelated changes and never publish its stale dist.

---

# Current release candidate — weather, resting contact and entry readiness, 2026-10-25 (Asia/Taipei)

**OWNER AUTHORIZED PUBLICATION:** “Please go ahead to publish when you are done.” This supersedes historical LOCAL ONLY / additional-approval notes below for this batch. Continue in `festival-weather-actions-20261024/world`, branch `codex/weather-actions-20261024`, based on `d3bd2c13f3f97745bf816ea04f49fccafdc0bc88`. Main still requires an independent approving review of the latest push (admin enforcement verified); do not bypass it. Owner alone handles Render deployments/settings.

**READY FOR PROTECTED PR / REVIEW; NOT LIVE UNTIL MERGE AND PAGES VERIFICATION.** Latest full suite **1,032/1,032**, TypeScript, local and fresh production build, and authored-source whitespace checks pass. Final actual GL audit **332/332**: Chrome desktop + iPhone16Pro-profile WebKit, each Normal/Lite, zero post-sign-in fixed downloads, shader compile/link calls, page/shader errors, new/lost contexts; stable weather buffers across transitions. Weather samples approximately 60 fps on this Mac, no >100ms stalls. CPU work p95 clear/rain/snow: Chrome Normal 5.4/5.8/6.3 ms, Lite 4.9/5.5/6.1; phone-profile WebKit Normal 5/6/6, Lite 5/5/6. These are emulation measurements, not physical-iPhone / thermal/media certification.

Latest fixes: reclining supports pelvis/back/heels independently of the oversized head, with nape-supported pillows; 80 real-triangle wardrobe/cap/mat cases and 16 visually inspected side/foot views pass with zero first-use vertex scans. Fixed fits, all wardrobe and carried-feature shaders, fireworks/audio and double-vision shader preparation finish under sign-in. Temporary warmup rigs/geometry release; bounded material owners preserve prepared programs. Ground contact blobs stay non-casting. Shadow owners separate actual geometry, texture/UV and side states, preventing first-appearance pipeline changes. A renderer-specific lease fixes stopped-world GPU callback/buffer retention while preserving shared art/other renderers, pruning normal disposals and handling restoration/retry without per-frame scene traversal.

The whole batch also includes reviewed popcorn shadows, directional avatar shade contrast, six beach chairs/four mats, circular CHOOSE A MOVE / ACTION menu and floor sitting (no ocean), six independent car passenger seats, shared STAFF rain/snow schedules in Taiwan time, stronger falling snow, right-aligned weather buttons, shared brush-or-sit choices and supplied weather/action SFX. Settled cap .12, 10-minute buildup/15-minute melt. Precipitation remains one preallocated draw, 960 desktop/ 420 phone flakes, 42,240 B arrays, no new maps/lights/contexts. Exact terrain query reuse 44,196→11,264 (74.5% fewer); rotation moves from fragment to vertex and shared snow state is cached. Six new audio files 455,096 B/~6.57MiB decoded. Live participants/programme changes/streamed media remain runtime data.

**Production candidate packaged:** `docs/beta/assets/main-DSqJt-PV.js`, API `https://myschedule-festival.onrender.com`. All 88 integrity hashes and 110 dist/package copies match; 102 reachable assets, zero missing. No local API/review markers. 187 published asset files retained, none deleted (successful deployment times unknown; prune report-only). M.O.T.H and retired PS2 route untouched. Find the branch's release PR with `gh pr view codex/weather-actions-20261024`; independent latest-push approval/merge and Pages verification remain required.

Production API was read-only checked and still lacks weather; **the owner must manually deploy Render after/alongside merge** for weather/new seat IDs. No agent Render deployment/settings change or production record mutation occurred. Weather persistence remains a separate optional `festival:weather:v1` KV key plus state/seed paths; ephemeral disk needs durable storage/retained seed for redeploy survival.

Evidence/reproduction: `QA_WEATHER_ACTIONS_20261025.md`, tracked `scripts/verify-loading-weather.mjs`, local `art/weather-actions-20261024/release-qa/`. Seventy scoped source/fixture paths byte-match canonical `release-sfx-20261018/world`, with backups/hash manifest; preserve canonical unrelated dirty work. Only two small audio recipe JSON files from art belong in the PR; screenshots/logs/backups stay local. Both handoffs and QA are current. The dev 4194 playable Mac wrapper remains local/disposable API 8796; built preview 4196 was stopped before production packaging. Current dist is now the production build, not the local preview.

---

# Current review — avatar contrast, thicker settled snow and playable Mac preview, 2026-10-25 (Asia/Taipei)

**LOCAL ONLY; owner wants to test on the Mac.** No publication/commit/push/PR/Render action. Continue in `/Users/myscheduleai/Desktop/myschedule-pivot/festival-weather-actions-20261024/world`, branch `codex/weather-actions-20261024`. Explicit publish approval is still required for the pending batch.

Latest owner revisions supersede the earlier snow cap: accumulated snow is now capped at **.12 world units**, previously .075. The same10-minute buildup /15-minute melt, ground masks, shared brushing, water/interior rejection and collision geometry remain. No geometry/buffer increase. `__festivalWeather().weather` reports current/max settled depth for loopback review. The snow top includes the preexisting offset: terrain+.15 or support+.145 at full accumulation.

Avatar shade bounce now follows the strongest existing sun/moon direction using view-space surface normals. A shared .40 contrast control gives72%–112% of the former diffuse floor, retaining face visibility and dark fabric while separating shaded planes; healthy key-lit planes remain unchanged. No added lights/maps/draws. Set the shared `avatarShadeContrast` uniform to0 for exact prior treatment in paired-frame review. Only `AvatarShadeLighting.ts`, `FestivalWeather.ts` and their focused tests changed in production source for this revision. Those four paths are mirrored to canonical `release-sfx-20261018/world` with before copies/hash verification; all56 batch source paths match. Preserve canonical unrelated dirty files and do not publish its old dist.

**1,009/1,009 tests + TS/local build/diff check pass.** Serial production-format browser checks passed16 contrast captures (8 before/after pairs across Chrome + phone-profile WebKit: sunset/night Normal, night Lite, outdoor sunset) and46 weather/action assertions, zero page/shader errors or late fixed assets. Visually inspected face/arms, thicker ground and unbrushed reclining-mat/chair/settled-ground contacts. The playable Mac wrapper passes21 real Chrome checks (normal sign-in, focus/movement, location/camera/lighting/weather controls), no page/shader errors, browser closed and disposable schedule cleared. Physical-phone and thermal/media validation are not claimed.

**[Playable Mac test](http://127.0.0.1:4194/art/weather-actions-20261024/play.html)**: normal sign-in, then toolbar Beach / Temple, Day / Sunset / Night, Clear / Full snow, Reset camera. WASD/arrows move; drag looks; E chair/mat; B actions. The wrapper fails closed unless its host and configured festival API are loopback:8796; it is in local art only, excluded from production builds. Clear empties the disposable schedule and skips remaining melt only in that iframe for comparison. Full snow restores its clock and schedules already-built snow. Backend production remains untouched.

[Gallery](http://127.0.0.1:4194/art/weather-actions-20261024/index.html) includes current before/after comparisons and a playable link. Evidence: `art/weather-actions-20261024/contrast-snow-review/` reports/screenshots/source-sync, `full-tests-depth-contrast.log`, `build-depth-contrast-local.log`. Preview4196 is freshly built against disposable8796; dev4194 has the playable wrapper. Neither is a release package. Owner alone handles Render deploys/settings; existing protected PR approval and explicit publication boundaries remain.

---

# Owner review revisions — circular actions, heavier snowfall and SFX, 2026-10-25 (Asia/Taipei)

**VERIFIED LOCALLY; NOT PUBLISHED.** Owner requested revisions to the pending weather/actions/car-seats batch, and confirmed stronger falling snow with the same thin settled cap. No commit, push, PR, beta publication or Render deployment. Explicit owner `publish` approval is still needed for this batch.

Continue in `/Users/myscheduleai/Desktop/myschedule-pivot/festival-weather-actions-20261024/world`, branch `codex/weather-actions-20261024`. Current source revisions are mirrored by an explicit scoped copy into canonical `release-sfx-20261018/world`; preserve its unrelated dirty work. Both existing dist folders remain local QA, not release packages; this checkout's build points to disposable API8796.

- Restored the original circular wheel: **CHOOSE A MOVE / 選擇動作**, center **ACTION** only. Breaking above, ground sit right; blank quarters are decorative. Touch wedge targets, upright labels, keyboard/controller/focus, water-disabled sitting and Get Up retained.
- STAFF Remove/Add Schedule/Save Weather buttons align right on phone and desktop.
- Falling snow has three depth bands, larger stepped/faceted/tumbling flakes, wind drift and weighted speeds: up to960 desktop /420 phone points in one preallocated draw; all precipitation arrays42,240B, no new maps/lights/contexts. Settled cap .075,10-minute buildup /15-minute melt and shared brushing unchanged.
- Supplied brush/punch recordings are normalized short mono cues on existing character/master/mute controls and entry preload. Brush plays only for an authoritative fresh successful clear; stale/rejected/already-clear/sit-anyway silent. Punch plays once at contact. Two assets89,916B transfer /179,520B decoded at48kHz;19 fixed sounds now preload. Masters unchanged; no action-time downloads/new audio context.

**1,006/1,006 full tests + TS/build/diff check pass.** Built-world browser tests:44 assertions total across desktop Chrome and iPhone16Pro-profile WebKit, zero errors or late fixed-asset/shader requests. Real STAFF form exact UTC+8 save/removal/right alignment pass on both. Circular layout separately passes six ZH/EN desktop/portrait/landscape cases including27 hit points per active wedge. Final in-world screenshots visually inspected. Physical iPhone Safari/in-app/thermal and real streamed-media checks remain unperformed. Independent read-only resource/disposal review found no additional issues.

[Current review gallery](http://127.0.0.1:4194/art/weather-actions-20261024/index.html), now with before/after snowfall, current wheel, right-aligned STAFF and audio previews. [Detailed QA](/Users/myscheduleai/Desktop/myschedule-pivot/festival-weather-actions-20261024/world/art/weather-actions-20261024/README.md). Evidence: `full-tests-revision-final.log`, `build-revision-final-local.log`, `weather-browser/report.json`, `staff-browser/report.json`, `action-wheel-revision/report.json`, `action-audio-build.json`, `source-sync-revision.json` in the same art folder.

After explicit publish approval, build afresh using the real production service URL, package the accepted batch, retain needed cached generations and open/attach a protected PR for macakinTT's latest-push approval. Owner alone handles Render deployment/settings. No production attendee, donation or weather data was mutated.

---

# Current continuation — weather, actions and two-person cars, 2026-10-24 (Asia/Taipei)

**READY FOR OWNER REVIEW; LOCAL ONLY.** The current request is fully implemented and verified. No commit, push, PR, `docs/beta` change, publication or Render deployment in this batch. The existing release rule requires explicit owner publish approval for this new batch; do not infer it from approvals of prior PRs.

**Continue in** `/Users/myscheduleai/Desktop/myschedule-pivot/festival-weather-actions-20261024/world`, branch `codex/weather-actions-20261024`, base approved main `d3bd2c13f3f97745bf816ea04f49fccafdc0bc88`. Source changes are also mirrored, with byte equality and collision checks, into `release-sfx-20261018/world`; preserve that checkout's other intentional dirty work. Its old dist and this new checkout's local-API dist are **not release packages**.

Owner confirmed: shared weather scheduled in Taiwan time; thin snow builds10minutes/melts15minutes; both Brush Off Snow & Sit and Sit Anyway; clearing shared. Latest addition: passenger seats in all six drive-in cars, two occupants watching together.

Implemented: popcorn real/contact shadows; restrained shared avatar shade fill; six chairs/four mats with native poses/clear exits; Actions menu (Breaking and floor sit, no ocean), labels/tips; six independent passenger seats preserving driver IDs; STAFF rain/snow windows, cloudy sky, bounded thin ground/outdoor-support snow and gradual melt; atomic shared snow brushing; supplied weather/footstep audio on existing controls and entry preload. Low mats mask the terrain snow below and have slope/pillow-following snow caps. Delayed seat request ordering and local/remote pose cleanup are covered by integration regressions.

**979/979 tests + strict TS/build/diff check pass.** Final production-format local browser checks:32weather assertions across Chrome + iPhone-profile WebKit, no new fixed-asset requests/programs after admission, zero page/shader errors; exact UTC+8 STAFF saves/removals on both. Visually inspected22beach/ground poses,12two-person-car placements and28lighting captures. Physical iPhone sustained/media/thermal checks are not done. One earlier concurrent-GPU Chrome admission timeout did not recur in serial checks; don't claim a code fix for that isolated timeout.

[Full implementation, reproduction, budgets and release notes](/Users/myscheduleai/Desktop/myschedule-pivot/festival-weather-actions-20261024/world/art/weather-actions-20261024/README.md). [Local visual gallery](http://127.0.0.1:4194/art/weather-actions-20261024/index.html). New local built preview4196; disposable API8796, state/seed/external KV off. Weather audio365,180B/~6.40MiB decoded; no new lighting sources/contexts. All source-sync hashes match; manifest in the same art folder.

Weather persistence uses JSON/seed capture and optional separate durable `festival:weather:v1` under existing Upstash/KV config. Owner alone handles Render deployments/settings. No production data mutations/deletions. After explicit publish approval, build with the real production service URL, package only the accepted source/assets, preserve needed cached generations, open/attach the protected PR and obtain macakinTT approval. Then verify Pages/live assets separately after merge and the backend after owner's manual deploy. Do not publish either existing dist.

---

# Release 2026-10-18 (evening) — owner: "please publish, including the work from the branches"

Branch `claude/drunk-and-mobile-20261018`, rebased on origin/main `4e4d59a` (PRs #47/#48 are M.O.T.H only: no `world/` or `docs/beta/` file). Commits:
1. Drunkenness → WASTED, iPhone freeze fixes, sign-in loading bar (the sections further down).
2. One shared YouTube player for every screen — cherry-picked from `claude/confident-goldberg-44a643` (`2a69688`).
3. The first film under the loading view in 精簡 — cherry-picked from `claude/determined-villani-cff2ef` (`940dbcf`). Both applied cleanly: `FestivalWorld.ts` here was byte-identical to their 15:41 snapshot base.
4. Owner's answer: while entering waits on the film player (up to 3 s + 2 s), the entering bar gets its own stretch (84–89%), labelled 正在準備放映… / PREPARING THE SCREENS…, and keeps edging forward (`prepareForPlay(onProgress(fraction, 'screens'))`).
5. The published bundle (`publish-beta.mjs --channel beta`, then `prune-published.mjs --apply`).

**After merge:** the owner deploys Render (the `passout` gesture is new in `server/index.mjs`; until then others see only the jump to the temple); purge jsDelivr for the new `docs/beta/assets/*` files; check the live page. Not measured on a real iPhone: the YouTube waits' real cost and the freeze fixes.

---

# Current Claude continuation — the first film under the loading view, 2026-10-18 (Asia/Taipei)

**LOCAL ONLY until the owner approves.** Committed on top of the one-player commit `2a69688` (section below). Nothing published, pushed or deployed.

**Problem.** With one shared player, every venue entry after the first was under 50 ms in the WebKit hitch probe, but the first venue still cost 47–102 ms, even when the player had answered during loading. That is WebKit starting the page's first film. Later swaps don't repeat it.

**Change** (`FestivalWorld.ts`, `playFirstFilm` / `stopFirstFilm` / `screenPlayerFirstFilm`): in 精簡, once the warm player has answered, it is played muted under the loading view and stopped as soon as it reports playing.
- **When.** Only after `prepareAssets`, when the fixed downloads are done (`firstFilmWindow`), so a cold phone isn't downloading film and world at once. Only while admitting and while no screen holds the player. If a visitor is admitted straight into a venue, that screen's film is the first film and is left alone.
- **Bounded.** It usually overlaps the warm-up. At the end, admission waits up to 2 s (`SCREEN_PLAYER_FIRST_FILM_WAIT_MS`) for it to play. Then it is stopped whether it started or not, and admission waits up to 0.4 s for the stop to land. The window then closes, so a player that answers late (after the 3 s answer cap) never starts a film at some moment in the festival. If admission fails, `stop()` tears the player down.
- **One decoder.** Nothing else decodes during loading. `stopVideo` unloads the media (state 5), the same as `releaseProjector`, so a phone holds one decoder briefly and none after.
- **No screen hears it.** No projector holds the iframe, so its duration, playhead and "ended" reports go nowhere: nothing reaches the shared duration table.
- **精簡 only** (`graphicsMode !== 'normal'`, which is what a phone gets: `App.looksLikeAPhone() ? 'lite'`). In 一般 it made no measurable difference (below) and cost the same admission time. Desktop Chrome runs YouTube in its own process anyway.

**Measured** (`tools/hitch-probe.mjs`, Playwright 1.62 WebKit, iPhone 15 Pro viewport, M2, own disposable API on 8796, production builds of `2a69688` vs this). Steps `settle,palace,shore,drive-in,club,rooftop`. 5 runs per side per mode, before and after interleaved, alternating which side went first. Each figure is the worst frame gap at that step, median of 5, ms; [frames >50 ms summed over the 5 runs]. Compile frames excluded (none occurred).

| | entry | Palace | Shore | Drive-In | Club | Rooftop | admission, median (range) |
|---|---|---|---|---|---|---|---|
| 精簡 before | 20 | 66 [6] | 40 [0] | 21 | 26 | 21 [0] | 7.5 s (6.3–8.8) |
| 精簡 after | 21 | **44 [2]** | 33 [1] | 19 | 35 | 20 [1] | 7.8 s (6.2–8.1) |
| 一般 before | 33 | 51 [4] | 38 [1] | 43 | 36 [1] | 32 | 7.4 s (6.0–9.0) |
| 一般 with it (not kept) | 32 | 54 [5] | 38 | 37 | 33 [2] | 32 | 8.1 s (6.6–10.6) |

- **精簡 Palace:** worst frame 79/103/52/52/66 → 44/41/42/53/58 ms. Jank at that step (time over 34 ms, summed) fell from a median of 46 ms to 12. Every other step is unchanged within noise.
- **一般 Palace:** the worst frames are the arrival itself, two 40–70 ms frames in both builds, like the ~35 ms pair at Shore and Drive-In. Jank 29 → 30. So the final build skips it in 一般, which then behaves exactly as before (one sanity run of the final build: no film under loading, Palace 47 ms, admission 6.0 s).
- **Admission.** In every run the player answered late in loading (4.8–8.7 s in), so it, not the warm-up, sets when the world opens. Before, the world opened 0.1–1.1 s after the answer; with the first film, 1.1–2.9 s after it. In 3 of 10 runs the film took 1.9–2.4 s to be stopped, which is at or near the 2 s cap. The Palace gain held in both of those that were 精簡 runs, so the cost seems to be paid when playback starts up, not at the first picture.
- **Download.** One streamed film request (YouTube's UMP POST to googlevideo.com) opens when it plays and is cancelled by the stop 0.6–0.7 s later, still under loading. Its size can't be read once cancelled. The player also fetches ~0.24 MB more of its own script, against ~48 MB for gate + loading.
- **Lab** (scratch, not kept): a bare page with a hidden, cued player. A muted `playVideo` reached playing about 1.4 s after the command, and the stop landed in about 60 ms.
- **Not measured on a phone.** Headless WebKit takes 5–13 s to start a YouTube embed. How long a real iPhone takes to answer and to play decides whether the 3 s and 2 s caps ever bite.
- `npm run verify`: 613/613 + build. New tests in `scripts/projector-occlusion.test.mjs`: played muted once it answers, stopped once it plays, no reports to screens, no repeat at the first doorway; waits for the fixed downloads, never starts after admission, leaves a screen's film alone, not in 一般; bounded wait that stops it even if it never started.
- `tools/hitch-probe.mjs`: the per-frame `player` field also shows the first film's stage (`ready playing` / `ready stopping` / `ready done`).

---

# Previous continuation — one YouTube player for every screen, 2026-10-18 (Asia/Taipei)

**LOCAL ONLY until the owner approves.** Built on the uncommitted iPhone-freeze work below (snapshot of `release-sfx-20261018` as of 15:41). Remedies the "Left:" line there: the freeze on walking into a screened venue.

**Cause.** Every venue built its own YouTube iframe as somebody walked in and destroyed it as they left. WebKit (Safari) runs a cross-origin frame on the page's own thread, so each player start-up was 40–160 ms frames for a second or two, outside the world's frame (frame JS stayed at 4–7 ms).

**Change** (`FestivalWorld.ts`, `ScreenPlayer` doc comment): one iframe in one CSS3D panel for the whole page.
- **Moving it.** Entering a venue re-aims the panel (position, `facing` turn, scale from `venueScreens`) and swaps the film with postMessage `loadVideoById`, or `cueVideoById` if STAFF paused it. The iframe never moves in the document; moving it would reload it.
- **Releasing a venue.** `releaseProjector` sends `stopVideo` and keeps the player. In WebKit, stopping unloads the media straight away (state 5, duration 0). A player that is never detached can't leave decoders behind, so phones still hold at most one, and the old "stop, blank, detach" teardown now only runs in `dispose()`.
- **Built during loading.** The first programme to arrive (App now syncs it straight after constructing the world) starts the player, cued and not playing. `prepareForPlay` then waits up to 3 s (`SCREEN_PLAYER_ADMISSION_WAIT_MS`) for it to answer. Not built for a headset (`xrPreferred`) or the gate preview.
- **Commands wait until the player answers** (`commandProjector`, `screenPlayerReady`). Before that, a newer film or stop replaces the waiting playback commands. 'listening' is re-sent every 500 ms until the first message arrives, as YouTube's own API does.
- **Stale reports.** One player serves every screen, so a duration, playhead or "ended" report still about the previous film is ignored until the player names the new one (`videoData.video_id` / `videoUrl`). Otherwise a wrong length would go into the shared duration table (see `App.syncPublicProjectors`). Errors are not filtered, so an unplayable film still moves the programme on.
- **Render loop.** Only the screen holding the player is composited, and the shared panel's visibility is set once per frame. `projectorScissor` uses the panel's rectangle only once it has been laid out on that screen. `publicScreenBoxes` uses `venueScreens`. A new setting: the volume slider now applies to the player whenever it moves to a screen (each new iframe used to start at full volume).
- Everything else is unchanged: programme clock offsets, muting, the 8 s doorway grace, STAFF pause, maximized and private screenings, foreground avatar compositing, and the phone rule of loading a screen only from inside the room.

**Measured** (`tools/hitch-probe.mjs`, Playwright 1.62 WebKit, iPhone 15 Pro viewport, warm shader cache, own disposable API on 8793). Steps `settle,palace,shore,drive-in,club,rooftop`; 3 runs per side, before and after interleaved. Each figure is the worst frame gap at that venue entry, median of the 3 runs, ms. Compile frames excluded (none occurred).

| | Palace | Shore | Drive-In | Club | Rooftop | frames >50 ms at venue entries (3 runs) |
|---|---|---|---|---|---|---|
| 一般 before | 133 | 72 | 61 | 90 | 37 | 29 |
| 一般 after | 88 | 39 | 40 | 26 | 29 | 9 |
| 精簡 before | 117 | 56 | 22 | 41 | 20 | 13 |
| 精簡 after | 68 | 40 | 19 | 19 | 19 | 4 |

- **Every venue after the first:** worst frame under 50 ms (one 102 ms rooftop frame in one run, while the player was still parked at the club, so not a switch).
- **The first venue still costs 47–102 ms** even when the player had answered during loading. That is WebKit starting the page's first film; later swaps don't repeat it. Possible follow-up: start and stop the player once under the loading view. Not done, because it downloads video during asset loading.
- **Admission time.** Before: 5.6–5.8 s. After: 5.6–9.3 s. The player answered before the world opened in 5 of 6 runs. In the sixth it didn't answer within the 3 s cap, so the rest of its start-up landed in the Palace step. Headless WebKit takes 5–13 s to start a YouTube embed (lab: `fresh` iframe 17–194 ms of jank vs `loadVideoById` after a stop 0 ms). A real iPhone should be faster, but this is **not measured on a phone**.
- **Checks.** One panel and the same iframe across all five venues, never reloaded, with the alignment readout (`__festivalProjectors`) identical to the old bundle in WebKit and Chrome. In desktop Chrome the films play in the moved panel (Palace/Shore/Drive-In). The local service's club and rooftop films refuse embedding in both old and new bundles. Headless WebKit screenshots never paint the CSS3D iframe, so screens look black there in both bundles.
- `npm run verify`: 610/610 + build. New tests in `scripts/projector-occlusion.test.mjs`: one player moved between screens, stale reports, error after a switch, built under loading and queued until it answers, paused venues cued, panel orientation, bounded admission wait. The doorway test now expects "stopped, kept".
- `tools/hitch-probe.mjs` records the shared player's state per frame (`player`: '' / starting / ready).

---

# Previous continuation — drunkenness, WASTED, iPhone freezes, 2026-10-18 (Asia/Taipei)

**LOCAL ONLY until the owner approves.** Worktree `release-sfx-20261018`, branch `claude/drunk-and-mobile-20261018` from origin/main `d157a6d` (PR #46 live). Uncommitted.

## Drinking (owner's answers 2026-10-18)
- Every drink deepens it: 1–2 tipsy (sway), 3–5 drunk (stronger sway, double vision, blur), 6–9 wasted (darkening edges, the walk weaves and sometimes stumbles, always steerable; not in a headset), 10 passes out. Drinks wear off 2 min after the last, one per 2 min (`drinkLevel()`, `SOBER_*`).
- Tenth drink: after the sip the body collapses (`passout` gesture, `passOutCoastalPose`, `restOnFloor`), movement/jumps blocked, WASTED screen (`showPassOut`, `.world-death[data-kind=wasted]`: 你喝掛了 / 喝了十杯 · 於寺廟醒來), wake at the temple (`respawnAtTemple`) with a 20 s hangover (4 drinks' worth, fading).
- Double vision = one frame copy + quad (`drawDoubleVision`; RGBA copy + raw ShaderMaterial — an sRGB FramebufferTexture is refused by copyTexSubImage2D); blur = CSS filter on the render layers and `--drunk-dark` vignette (`applyDrunkScreen`), cleared entirely when sober.
- Server: `passout` added to the presence gesture allow-list so others see the collapse — **needs a manual Render deploy** after merge; until then others only see the jump to the temple.
- Loopback QA: `__festivalDrinks(n)`. Tests in `coastal-pose.test.mjs` (wear-off, pass-out → temple + hangover, lying on the floor, weave) and `server.test.mjs`.

## iPhone lag/freezes — measured in WebKit (`tools/hitch-probe.mjs`, Playwright 1.62 WebKit, iPhone 15 Pro viewport, `COLD=1` clears its shader cache)
Cold-cache causes found and fixed:
1. Sun/moon `castShadow` toggled with brightness → the shadowed-light count (part of every lit shader key) changed on the first frame after warm-up and at every sunrise/sunset → every lit material recompiled (6.5 s first frame, later freezes). Now both always cast; only `shadow.autoUpdate` follows brightness (`castsShadowWhileLit`). LightLoop already skips a zero-colour directional light, shadow lookup included.
2. Warm-up only compiled visible objects and no shadow-pass programs → 60–460 ms freezes on first sight of each area. Now `warmByDrawing` (SceneWarmup.ts) draws one of each material/object kind, hidden ones included, lights unchanged, in batches under the loading view; `warmAvatarVariants` adds every sex × outfit for it.
3. Shared avatar print textures were flagged `needsUpdate` on every avatar build → re-upload per arrival. Now once per texture.
4. Remote bodies built at most every 150 ms (`REMOTE_ADMISSION_SPACING_MS`), not every frame.
Cold 一般 before → after: first world frame 6.5 s → no compile; temple 461 → 35 ms, rooftop 285 → 65, first crowd 851 → 127, in-world shader links 25+ → 1. 精簡 similar (rooftop 247 → 49, temple 247 → 42, walk 120 → 20).
Left: entering a screened venue still costs ~70–130 ms outside the frame (YouTube player start-up in the page; fixing means reusing one player across venues); each remote body is still a ~60 ms frame; the sign-in preview compiles 1.4 s cold. Note: probe runs queue for admission when crowd bots from a previous run still hold places on the local service (2-min grace).

## Sign-in loading bar (owner's answers 2026-10-18: one bar bottom right, percentage, her body first)
- Replaces the bottom-right 正在展開影展世界… line with words + percentage + a red track (`.gate-scene-status`; on phones it sits under the form, full width). `GateLoadMeter` (src/ui) turns the globe's steps (topology → code → first paint; eases toward the next step but never reaches it) and the character's real bytes into one monotonic percentage: globe 35% / character 65% on a wide screen, globe only on phones (no character there). Label switches to 正在下載角色… once the globe has painted. Holds at 100%, fades, hides; a language redraw doesn't replay it. A body chosen in 角色配色 that isn't downloaded yet brings the bar back for that body.
- Character bytes: `avatarLoadFraction(key)` in ImportedAvatar, from `watchAssetDownloads` and each file's size baked in at build (`__AVATAR_BYTES__`, vite.config.ts), so totals are known before downloads start.
- The character download now starts beside the globe's code (`fetchGateCharacter`), not after the globe is built, and `loadOwnAvatar` fetches the visitor's own body first; his (needed for the world) follows. `attachImportedAvatar` now needs any one body, not specifically his. Slow-link run (1.2 MB/s shared): male visitor bar done 12.9 s; female 7.1 s (was ~13 s, waiting for his 8 MB too). Entering still loads both before the world starts.
- Tests: `gate-load-meter.test.mjs`, `own-avatar-first.test.mjs`, new bar cases in `gate-ui.test.mjs`. Slow-link tools in scratch `gatebar/` (slow-serve.mjs, timeline.mjs, switch.mjs, phone.mjs).

`npm run verify`: 603/603 + build before the loading bar. Local review: Vite 4184 + API 8792 (launch configs `drunk-world-4184`, `drunk-api-8792`), production bundle on 4185 (`phone-probe-4185`, dist in scratch).

---

# Release 2026-10-18 — owner said "please publish"

Branch `claude/world-sfx-release-20261018`, cut from origin/main `5dc2fbc` (PR #45 M.O.T.H, which touches no `world/` or `docs/beta/` file) in a clean worktree `release-sfx-20261018`; only the release files were copied from `release-npc-20261006/world` (its old receipts, diagnostics and evidence art stay there, uncommitted). Contents: rotating sign-in/loading tips, world SFX (menus, day/night/ocean ambience, indoor muffle), avatar SFX + 角色音效 slider, same-resolution texture re-encode, review pages off the build, `/beta/ps2/` deleted (no redirect), stale hashed files pruned (`scripts/prune-published.mjs --apply`: docs/beta 676 → 82 MB), and the five island frame-cost cuts below. `npm run verify` 597/597 + build; entry `main-DFrI7-ap.js`; both the new and the previously live entry pages resolve every hashed file. No server change, so no Render deploy. After merge: purge jsDelivr for the new `docs/beta/assets/*` files and check the live page (memories `jsdelivr-asset-mirror`, `pages-cache-stale-bundle`).

The "LOCAL ONLY" lines in the sections below describe the state before this release.

# Current Claude continuation — island frame cost, 2026-10-18 (Asia/Taipei)

**LOCAL ONLY, same rules as below: nothing published, committed, pushed or deployed; docs/ untouched.** Same checkout and branch; these changes are uncommitted alongside the SFX/tips work.

## What changed (each one checked to leave the picture unchanged)

- **Lamps skip pixels they cannot reach** — `src/world/LightLoop.ts`, installed by `createWorldRenderer`. three.js ran the full lighting model for all 17 lit lamps on every pixel; the patched `lights_fragment_begin` wraps each light in `if ( directLight.visible )` (directional: colour ≠ 0), where its contribution is exactly zero. Light count unchanged, so no recompiles.
- **Popcorn stall and jukebox merged as static scenery** — named `Popcorn concession` / `Jukebox cabinet` in `FestivalWorld.ts`, added to `STATIC_PROP_NAMES`. The four display cartons were 116 shadow-casting pieces drawn one by one into the island-wide sun shadow map every frame, wherever you stood.
- **Skinned/morphing shadow casters get their own depth material** — `shareShadowDepthMaterials()` in `src/world/ShadowCasters.ts` (after batching, and in `castShadows`). three.js re-derived its one shared depth program each time the shadow pass switched between a body and a prop.
- **Shadow casters whose shadow cannot reach the view sit out that draw** — `ShadowCasterCulling` around `renderer.render` in `render()`. The ray from each caster along the sun/moon is tested against the camera frustum in the planet curve's bent space, down to floor −20 (the seabed bottoms out at −19.5). Anything within a lamp shadow's reach and the visitor's own body are always kept; headsets skip it; `castShadow` is restored right after the draw. Loopback readout: `__festivalPerf().shadowCastersSkipped`.
- **Off-screen DJs are not posed** — `poseRigDj` returns when `cullAvatars` marks the body culled/throttled (same rule as `animateRig`'s foot planting). Its hand reach re-derives the whole body six times per hand: 7.6–10% of a throttled phone frame with both booths out of sight.
- Not touched: textures, lights, shadow resolution, art. Transparent double-sided materials (shirt prints, windscreens, cloud banks) still take three.js's two passes, which re-derive programs every frame; a single pass could change blending, so it was left.

## Measured

`tools/frame-cost-probe.mjs` (new): headless Chrome on an M2, adaptive render scale pinned at 1, `cycleMinute=12`, fixed spots and cameras; phone = 390×844 @3×, touch, CPU ×4. "Before" is this session's changes switched off in the same tree, run minutes before "after" on a quiet machine. Visitors present (ghost probe sessions on the local API) were 0–2 per run; NPC positions vary.

**Desktop 一般 (1440×900)** — before → after

| Spot | fps | slow frames (p90 ms) | GPU ms | script ms | draws (main) | draws (shadow) |
|---|---|---|---|---|---|---|
| Gate | 60 → 60 | 16.7 → 16.7 | 14.5 → 10.7 | 6.8 → 5.8 | 549 → 385 | 407 → 240 |
| MY SQUARE | 60 → 60 | 16.7 → 16.7 | 12.3 → 11.6 | 5.3 → 4.2 | 191 → 166 | 327 → 137 |
| The Shore | 60 → 60 | 16.7 → 16.7 | 15.6 → 12.1 | 5.8 → 5.8 | 318 → 289 | 350 → 258 |
| Club room | 60 → 60 | 16.7 → 16.7 | 22.1 → 18.5 | 5.4 → 4.9 | 149 → 149 | 286 → 103 |
| Rooftop | 60 → 60 | 16.7 → 16.7 | 12.4 → 13.0 | 5.6 → 5.7 | 193 → 207 | 288 → 211 |

**Desktop 精簡** — before → after

| Spot | fps | slow frames (p90 ms) | GPU ms | script ms | draws (main) |
|---|---|---|---|---|---|
| Gate | 60 → 60 | 16.7 → 16.7 | 9.2 → 7.5 | 5.3 → 5.1 | 533 → 368 |
| MY SQUARE | 60 → 60 | 16.7 → 16.7 | 6.4 → 5.6 | 4.3 → 4.0 | 180 → 182 |
| The Shore | 60 → 60 | 16.7 → 16.7 | 8.3 → 7.7 | 5.0 → 5.1 | 317 → 296 |
| Club room | 60 → 60 | 16.7 → 16.7 | 10.9 → 8.4 | 4.9 → 4.6 | 172 → 163 |
| Rooftop | 60 → 60 | 16.7 → 16.7 | 7.5 → 7.3 | 4.8 → 5.0 | 196 → 208 |

**Phone 一般 (390×844 @3×, CPU ×4)** — before → after

| Spot | fps | slow frames (p90 ms) | GPU ms | script ms | draws (main) | draws (shadow) |
|---|---|---|---|---|---|---|
| Gate | 52 → 60 | 33.3 → 16.7 | 11.8 → 10.4 | 18.5 → 15.7 | 353 → 235 | 312 → 152 |
| MY SQUARE | 60 → 60 | 16.7 → 16.7 | 10.6 → 8.9 | 14.4 → 12.0 | 165 → 150 | 303 → 157 |
| The Shore | 45 → 59 | 33.4 → 16.7 | 13.6 → 9.1 | 21.4 → 16.2 | 220 → 191 | 346 → 218 |
| Club room | 54 → 60 | 33.3 → 16.7 | 19.7 → 15.4 | 17.5 → 14.6 | 96 → 97 | 301 → 90 |
| Rooftop | 51 → 58 | 33.3 → 16.8 | 13.0 → 12.3 | 18.7 → 16.5 | 155 → 155 | 319 → 174 |

**Phone 精簡 (CPU ×4)** — before → after

| Spot | fps | slow frames (p90 ms) | GPU ms | script ms | draws (main) |
|---|---|---|---|---|---|
| Gate | 60 → 60 | 16.7 → 16.7 | 3.8 → 3.7 | 14.7 → 10.9 | 372 → 249 |
| MY SQUARE | 60 → 60 | 16.7 → 16.7 | 3.1 → 2.7 | 10.6 → 7.1 | 173 → 141 |
| The Shore | 60 → 60 | 16.7 → 16.7 | 4.9 → 4.8 | 13.5 → 13.2 | 218 → 208 |
| Club room | 60 → 60 | 16.7 → 16.7 | 4.6 → 4.4 | 12.4 → 11.2 | 96 → 95 |
| Rooftop | 60 → 60 | 16.7 → 16.7 | 4.5 → 4.2 | 13.0 → 12.4 | 163 → 164 |

- three.js resets its draw counter after the shadow pass, so `__festivalPerf().drawCalls` never included shadow draws; the probe counts them separately.
- In-page A/B of the light patch alone (same page, alternating shader variants): desktop GPU −11 to −31% on 一般, −15 to −20% on 精簡.
- **The ~2,200 draw calls, and the 28 ms gate GPU figure from 2026-10-17, are not the baseline.** The 28 ms was measured while the machine was busy (other GPU work running), which inflated the timer queries. Use the paired numbers above.
- Pixel checks (frozen frame, byte comparison, `art/frame-cost-20261018/ab-checks.json`). Shared depth materials and shadow culling: 0 differing pixels (culling in 7 views by day and by night). Merging the two props: 0 px at 4 spots, 2 px at the gate. Light patch: 0 px at 3 spots, ≤10 px of float rounding at the gate and rooftop. Before/after screenshot pairs at the same cameras: `art/frame-cost-20261018/screens/`.
- `npm run test` 597/597 (new `scripts/frame-cost.test.mjs`, 7 tests); `npm run build` passes.

## Rerun

Vite 4183 + disposable API 8791 as below, then e.g. `PIN=1 MODE=normal node tools/frame-cost-probe.mjs "http://127.0.0.1:4183/?era=ps2&island&review=perf&cycleMinute=12" desk-normal` (phones: `PHONE=1 CPU=4 NOSHOT=1`; screenshots hang under CPU throttling). Not yet measured on a real phone.

---

# Previous continuation — world SFX, slimmer downloads, PS2 channel retired, 2026-10-17 (Asia/Taipei)

**LOCAL ONLY. The owner said not to publish anything until they approve. Do not run publish-beta.mjs or prune-published.mjs --apply, stage/commit/push, open a release PR, change docs/, deploy Pages or deploy Render for this work.** Same checkout, branch and HEAD as the tips continuation below; both sets of changes are uncommitted together.

## Owner request and decisions (asked and answered 2026-10-17)

- Click SFX on every menu/prompt/button click and hover SFX on every menu selection, the sign-in page included. Own slider **介面音效 / UI SOUNDS**. Hovers only after the first click/keypress (browser rule, owner accepted) and only on mouse devices.
- Ambience replaces the old filtered-noise hum: day = Seaside Promenade walla, night = Rural Quiet Evening, ocean = Beach Waves at Night. Night follows the light: fades in over sunset + blue hour (cycle minutes 25–35), full 35–60, fades out over dawn (0–5), equal-power crossfade. Waves fade in within ~36 units of water, full within 6, on the landing deck and while swimming.
- Indoors = The Basement (lobby 0.4, stair ramp, dance floor 0.1) and The Palace hall (0.2), with a low-pass muffle down to ~900 Hz. Rooftop garage stays outdoors.
- All SFX are fetched/decoded at the sign-in page and awaited before the world opens (max 8 s extra, then they fade in late).
- Clean-up: slim world downloads by re-encoding textures at the SAME resolution; keep review pages off the public build; prune stale published bundles keeping current + previous release; delete /beta/ps2/ with **no redirect**. Live server data is NOT to be touched.

## Files

- `src/world/AmbientAudio.ts` rewritten: beds via Web Audio (`loopStart/loopEnd` inside 0.5 s self-padding so decoder delay never clicks), mono beds on coarse-pointer phones, decode in an `OfflineAudioContext` so the sign-in page needs no gesture, `unlock()`, `playInterfaceSound()`, `setAmbientMix()`, `volumes()`, loopback `snapshot()`. URLs resolve lazily (node test bundles evaluate it from a data: URL).
- `src/ui/InterfaceSounds.ts`: one delegated capture listener (click/change/pointerover/focusin + unlock on gestures). Text fields and sliders are silent; disabled/inert controls silent; 30 ms click / 45 ms hover spacing.
- `src/world/FestivalWorld.ts`: `updateAmbience()` every 200 ms from `render()`; `oceanNearness`, `outdoorsAt`, `ambienceReviewAt`; `stop()` fades beds out. Constants `AMBIENCE_UPDATE_MS`, `OCEAN_FULL_WITHIN/SILENT_AT`, `INDOORS`. `DayNightCycle.nightAmountAt`, `CoastalTerrain.distanceToWater` are pure helpers.
- `src/ui/App.ts`: installs sounds in `mount()`, preloads beds behind the band, waits for them before `world.start()`, sound panel draws current values and persists master/ambient/ui in localStorage (`myschedule-volume-*-v1`). Loopback hooks `__festivalAudio()` and `__festivalAmbienceAt(x, z)`.
- `src/assets/audio/` (rebuild with `tools/build-sfx.py <outDir>`): 3 beds × stereo/mono MP3 (128k/64k, 2.4 MB desktop, 1.2 MB phone) + click/hover WAV. Built from the owner's masters in `/Users/myscheduleai/Desktop/Michael/MSSWEB/SFX/` (day 31–91 s, night 139–184 s, ocean 175–220 s, 5 s crossfade, −24 dBFS RMS). Seams verified after MP3 decode with 0/1105/2112-sample start shifts.
- Textures re-encoded inside GLBs with `tools/repack-glb-textures.mjs` (image bytes only; meshopt streams, skins, UVs byte-identical; validator warnings unchanged): male 13.9→7.9 MB (q97, lettering checked at 3× zoom), attendant 8.3→3.5, valet 4.3→1.5, box-office 4.1→1.3, temple-statue 2.0→0.4, female/guitarist/bass smaller. Provenance updated in `art/VENUE_ASSET_PROVENANCE_20261009.json`. Originals of the eight edited GLBs are in git (HEAD).
- `vite.config.ts`: only `index.html` is built; `dist/review` removed after build; mp3/wav added to `asset-integrity.json` so audio comes through jsDelivr. dist/assets 48 → 33 MB including the new audio.
- PS2 channel retired in code: `publish-beta.mjs` accepts only `--channel beta`; `/beta/ps2/` removed from `WorldTopology` and `artPreviewPolicy` (tests updated).
- `scripts/prune-published.mjs`: report-only by default. At release, after publishing, it removes docs/beta/ps2 (437 MB), the review pages + docs/beta/review, and 535 stale hashed files, keeping the on-disk and previously published entry pages' reachable set (45 files). Dry run today: 626 MB.
- Tests: new `scripts/ambient-audio.test.mjs` (6); `startup.test.mjs` audio test now bundles the module. `npm run test` 587/587, `npm run build` passes.

## Browser verification (local 4183/8791, loopback API)

Sign-in: cues + all beds decoded before any click; first real click starts the context; clicks and hovers counted. Entry with sound: in world after 9 s, spawned on the landing deck (ocean 1, dawn night→day crossfade in progress). Fast travel to the Basement forecourt: ocean 0; walking in, outdoors 1 → 0.4 (lobby) → ramp → 0.1 (dance floor), muffle 20 kHz → 916 Hz. Grid sampling: Palace hall 0.2, gate ocean 0.9, south beach 0.95. Phone emulation: beds decode mono. No console errors. The pane cannot play or hear audio and delivers hover events in bursts (merged by the 45 ms spacing); listening on real speakers/phones is still owed to the owner.

## Avatar SFX — done locally 2026-10-18 (owner request 2026-10-17)

Owner decisions: own avatar only (no remote/NPC sounds); eating sound for POPCORN only (hot dog/pizza/chicken stay silent — those item types remain in code, but no current vendor hands them out); footsteps vary ±3% pitch and up to 15% level; slider 角色音效 / AVATAR SOUNDS directly under 介面音效, default 0.6, persisted as `myschedule-volume-avatar-v1`.

- Files: `src/assets/audio/avatar-step-left|right.wav`, `avatar-eat-popcorn.wav`, `avatar-drink.wav` (trimmed to onset, 460–620 ms, matched at −20 dBFS active RMS), `avatar-skate.mp3` (5.4 s loop, 1.2 s crossfade, last 50 ms click dropped). Rebuild: `python3 tools/build-sfx.py <outDir> avatar`.
- `AmbientAudio`: avatar channel straight to master (never muffled), `playAvatarSound(kind, delay)`, `setSkating(on)` (0.08 s in / 0.18 s out), `setAvatarVolume`. `preloadAmbience`/`ambienceReady` renamed `preloadWorldSounds`/`worldSoundsReady` and now cover the avatar sounds, so they load at sign-in with the beds.
- `FestivalWorld`: `updateFootsteps()` uses `plantedFoot()` (new, `CoastalPose.ts`) on the player's gait phase — walking only, not riding (SHIFT on land = board), swimming, seated, dancing or airborne. `drinkInHand()` plays the sip at +0.45 s; the eat branch plays the crunch at +0.6 s for POPCORN. Calls are `this.audio?.` because pose tests build bare worlds.
- Tests: `ambient-audio.test.mjs` 8 (foot plant + avatar channel added); `coastal-pose.test.mjs` asserts the drink/popcorn timings and that other foods are silent. `npm run test` 591/591 + the new pose test; build passes.
- Browser (loopback): all 5 avatar sounds decoded on the sign-in page in ~1 s; walking 11 units gave 9 steps, none when stopped; SHIFT-riding raised the board to 0.75 with no steps and back to 0 when it stopped; panel shows the slider in the right place. Eat/drink timing proven in node tests, not heard. Not yet listened to by the owner.

## Release checklist (only after the owner approves)

Build → `publish-beta.mjs --channel beta` → `prune-published.mjs` (read the report) → `--apply` → protected PR. After merge, purge jsDelivr for each new `assets/*.mp3|wav|glb` (see memory `jsdelivr-asset-mirror`). Nothing server-side changed.

---

# Previous continuation — randomized tips, 2026-10-17 (Asia/Taipei)

**LOCAL ONLY. The owner explicitly said not to publish until further approval. Do not run build:beta, stage/commit/push, open a release PR, change docs/, deploy Pages or deploy Render for this work.** The historical instructions below that imply automatic publication are obsolete.

## Active checkout and baseline

- Work in `/Users/myscheduleai/Desktop/myschedule-pivot/release-npc-20261006/world`, repository root `/Users/myscheduleai/Desktop/myschedule-pivot/release-npc-20261006`.
- Branch `codex/water-prompts-release-20261017`, HEAD `ceeabfa4de7e545e03ff8db911e09cdcc78aee31` (published PR43 water prompts plus the separate PR44 M.O.T.H release). The tip changes below are uncommitted and unpublished.
- Preserve unrelated dirty historical receipts, source/review art, diagnostics and `art/payment-review-20261017/`. Do not reset/clean or broad-stage. No game/server/asset changes were needed for this tip request.

## Owner request and completed local behavior

Randomize the tips below the entry-loading progress bar on each admission, and replace the static controls sentence beneath Donate with rotating randomized tips on the sign-in page. Both areas rotate every5seconds through the existing7 bilingual/device-appropriate tips, with no repeats until the round finishes. Consecutive rounds do not repeat their boundary tip. Separate sign-in/loading histories keep every opening-round position different from the previous visit, including after long visits which cycle multiple times. The histories contain only7 numeric tip indices per stage.

Language redraws keep the current tip/order rather than starting over; desktop/mobile wording is resolved at paint time. A single active timer switches from sign-in to loading, stops on successful entry or missing UI, and resumes the sign-in sequence on failed/cancelled admission. Reserved note height prevents shifting/clipping as tips wrap. Existing topic text and gameplay behavior are unchanged; the old static gateNote translations are removed.

## Files and implementation

- `src/ui/EntryTips.ts`: existing localized tip content plus Fisher–Yates shuffle, fixed-position repair, `TipRotation`, and `createTipRotation`. Only opening orders persist in localStorage keys `myschedule:tips:sign-in:v1` and `myschedule:tips:loading:v1`; later cycles must not overwrite that visit's opening-order history. Storage/corrupt-history failures are caught, so tips still shuffle without blocking admission. Persistence-based cross-visit guarantees require accessible browser storage.
- `src/ui/App.ts`: `[data-gate-signin-tip]`, `startGateTips`, `showGateTip`, `stopGateTips`; `gateSignInTips` retained on gate redraw, loading order recreated per admission. One timer, no parallel hidden-menu timer.
- `src/style.css`: `.gate--live .gate-card__note` reserves3em; font/colors retained.
- `scripts/gate-ui.test.mjs`: production-method/fake-clock coverage for complete shuffled rounds, cross-visit positions, boundary repeats, long visits, language/device redraws, retry/teardown and unavailable history. Existing gate-preview tests also pass.
- This file and `CODEX_HANDOFF.md`: current local continuation. Historical architectural notes below are not current paths or release instructions.

## Verification and limits

- `node --test scripts/gate-ui.test.mjs scripts/gate-preview.test.mjs`: **43/43 passed** after final change. Log `/tmp/myschedule-random-tips-final-tests.log`.
- `npm run build`: strict TypeScript and standard Vite build passed after final change. Log `/tmp/myschedule-random-tips-build.log`. This only rebuilds ignored local `dist/`; no BETA packaging. Source diff check clean. Full server/gameplay suite was not rerun for this isolated UI change.
- Local browser: sign-in text visibly changed over time and on a fresh visit; Chinese/English switching retained the current tip. At390x700 the note sat12px below Donate and stayed within width. Loading showed a randomized, mobile-appropriate tip; admission completed normally and no console errors were captured. Loading finished before the second timed browser sample, so continued loading rotation/cleanup is established by the production-method fake-clock tests, not a second observed loading screenshot. Phone-sized Mac browser is not a physical iPhone test.
- Evidence `art/random-tips-20261017/`: `sign-in.png`, `phone-sign-in.png`, `phone-loading.png`, `browser-observations.json`. Temporary viewport override reset. Browser tab3 retained at desktop sign-in as review output.

## Resume locally

Open `http://127.0.0.1:4183/?era=ps2&island&localReview=random-tips-20261017`. Wait5seconds beneath Donate to see the next tip; reload to review a new opening order; enter silently to see the independent loading tip order. No additional requested feature remains unfinished; continue with owner feedback/local review.

Loopback-only services were started for this review and left running:

- Vite4183 (exec67568): `env VITE_FESTIVAL_SERVER_URL=http://127.0.0.1:8791 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4183 --strictPort`
- Disposable API8791 (exec59556): `env FESTIVAL_PORT=8791 FESTIVAL_HOST=127.0.0.1 FESTIVAL_STATE_FILE=off FESTIVAL_SEED_FILE=off FESTIVAL_YOUTUBE_TITLES=off node server/index.mjs`

Check listeners before restarting; do not stop unrelated services. Keep the explicit local API override and disabled persistence for QA; do not send simulated clients to the production multiplayer service. Publication requires a new explicit owner request and normal protected-main review, packaging and live verification.

---

# Claude handoff — myschedule Virtual Festival

Last updated: 2026-08-25 (Asia/Taipei)

> **Historical archive below.** The current continuation instructions are at the top of this file and in `CODEX_HANDOFF.md`. Do not treat the old branches, paths or automatic-publication statements below as current instructions.

Current continuation: the published `15c9354` baseline removed the clipping wall
conduit and fixed mobile sign-canvas retention plus the phone's duplicate WebGL
context. New live iPhone screenshots then showed both venue DJs hidden by the
CSS3D video, the basement console overhanging its stage, and unrecoverable Safari
page zoom after rapid taps. Published commit `e8ba163` incorrectly lifted the two
screens; the owner clarified that their height was already correct. The current
published commit `d93192e` restored those Y positions but incorrectly shifted the
screens left. The owner rejected that: both screens belong on their original centre
lines, with the DJs composited in front. Published commit `3d38a0b` does that using the
phone's existing WebGL renderer. The owner confirmed the DJs are correct but reported
that ordinary NPC and visitor bodies still fall behind the screen. The release
containing this handoff puts local/remote visitors, all residents and MENTOR on the same
avatar-only foreground layer, selecting only projected bodies which intersect the
screen before redrawing. Mobile remains at one WebGL context. The published stage
expansion, prompt radius and page-zoom lock remain. See `CODEX_HANDOFF.md` section 0
for exact geometry, fixtures, verification and epistemic status.

Commits `10dba12` and `5ae3d39` define the current mobile continuation point.
The festival-pass menu scrolls in portrait and landscape; screening/order
prompts, the camera control and reminder alerts use separate slots; and another
avatar can be greeted while a loyal MENTOR follows the local body. The loopback
fixture `mentor-follow-greeting` verifies that a tap waves without feeding
MENTOR.

The focused `5ae3d39` follow-up moves the landscape `任務 / OBJECTIVES` counter
under the 42px 我的檔期 logo instead of beside it. At 760 × 390 the button begins
6.5px below the logo, with aligned left edges and no overlap. It also tags only
`E / REQUEST A TRACK FROM ...` as `interaction-toast--dj`, preserving the prompt's
current dimensions while centring it and aligning its bottom with the 通行證
button. Direct browser measurements showed zero centre and bottom-baseline
deltas at 390 × 650 and 760 × 390. `npm run verify` passes all 41 server tests and
the TypeScript/Vite build. See `CODEX_HANDOFF.md` for the exact CSS, publication
process and review-fixture notes.

## Read this first

Continue only inside:

`/Users/myscheduleai/Desktop/myschedule-pivot/world`

This is an isolated pivot. Do not edit or publish the production site in `../docs`, and do not deploy this festival build until the owner gives explicit final approval.

`world/` is committed on the `codex/pivot-exploration` branch, together with the `.gitignore` entries for `world/dist` and the STAFF settings file. The owner has decided to keep `world/.img2threejs`, the 6.4 MB asset-pipeline scratch directory from an earlier session, in the commit. Nothing has been pushed or published, and nothing may be until the owner approves. Do not stage, clean, reset, or overwrite unrelated files without permission.

## Current result

The project is a Vite + TypeScript + Three.js virtual film festival with three simultaneous venues:

- The Palace — COMMERCIAL
- Drive-In 88 — TELEVISION
- The Shore — MUSIC VIDEO
- The Rooftop — DR.BEAUTY originals, an open-air deck over a street-food garage, east across the street from The Basement
- The Basement — DR.BEAUTY originals, a club building north-west of MY SQUARE with a basement dance floor

It includes the bilingual gate, low-poly world, day/night cycle, physical projector screens, public/private viewing, seating, swimming, NPC movement, live chat, shared sessions, STAFF tools, programme editing, custom YouTube videos, special screenings, pamphlet editing, NPC editing/addition, and STAFF control of an NPC body.

The 2026-08-14 feedback pass adds:

- a STAFF form for changing the sign-in page's muted, looped YouTube background;
- explicit shared `moving` state and continuous remote animation phases, preventing walk cycles from flashing to idle between presence packets;
- server-authoritative, exclusive MENTOR carry ownership;
- the ability to pick up a STAFF-controlled MENTOR, which locks that STAFF controller to the carrier until MENTOR is put down;
- treat-giving animation and a visible hand-held treat for attendee bodies, including STAFF-controlled human NPCs;
- MENTOR eating while autonomous, STAFF-controlled, or carried, plus dog-only tail-wag greetings with no human paw-wave pose;
- a per-browser fullscreen public-screening overlay that does not mutate the world programme or another attendee's view;
- dynamic sun/moon water-reflection tracks aligned to the current celestial position, color, elevation, and intensity.

The 2026-08-15 follow-up pass adds:

- durable STAFF settings: programmes, venue names, the sign-in background, wordmark styling, pamphlet content, the NPC roster, and custom videos are saved to a settings file and restored on the next start;
- durable chat history, including NEARBY messages, which are shown to everyone after a restart because the proximity they were scoped to no longer exists;
- SHIFT+E now outranks the seat and the concession stand, which is what previously swallowed MENTOR pickups (MENTOR's route passes within reach of the popcorn booth);
- seating while MENTOR rides on the attendee's head in all three venues, including the Drive-In 88 parking-lot seats, with the prompt reading `E TO SIT · <SEAT>`;
- a FULLSCREEN button that also leaves fullscreen, in both languages, and Escape as a second way out; the screening now fills the viewport through its own layout instead of the Fullscreen API, so the YouTube player's own fullscreen button is a plain single level and exits natively;
- a maximized screening that joins the in-world projector in progress instead of reloading the work from near its start, mutes the projector behind it so only one soundtrack plays, and follows the programme when it advances;
- genuinely synchronized public screenings: the service publishes a `startedAt` clock per venue, and every attendee seeks to the same second of the same work, which is what the SYNCHRONIZED label always claimed;
- MENTOR keeps eating and wagging while carried, including before the service confirms the shared carrier and while the carrier is seated;
- Traditional Chinese coverage for the treat, tail-wag, and sit prompts that previously fell through to English.

The previous controlled-avatar behavior remains: popcorn reparents safely, controlled NPCs can sit/swim, dog and human carried-prop anchors differ, water stows/restores popcorn, and remote clients render STAFF-controlled popcorn.

## Run locally

```bash
cd /Users/myscheduleai/Desktop/myschedule-pivot/world
npm install
npm run dev
```

Open the exact Vite `Local:` URL printed in the terminal, normally `http://127.0.0.1:5173/`. The live service normally uses `http://127.0.0.1:8787`.

Development-only STAFF key: `myschedule-local-admin`

If 5173 is occupied, Vite selects another port. The service accepts the existing loopback fallback origins. For LAN sharing, do not assume the current defaults are enough: both servers must bind to `0.0.0.0`, the browser must use the Mac's LAN IP, `VITE_FESTIVAL_SERVER_URL` must point to that LAN IP and port 8787, and `FESTIVAL_ALLOWED_ORIGINS` must include the exact LAN Vite origin.

## Verification

```bash
npm run test
npm run build
```

Current verification status on 2026-08-15:

- `npm run test`: 23/23 passing in a normal local shell, including three persistence contracts, two programme-clock contracts, and two club contracts;
- `npm run build`: passing (TypeScript and production Vite build);
- `node --check server/index.mjs`: passing;
- verified in a live browser at the Drive-In: SHIFT+E picks MENTOR up, the prompt then reads `E TO SIT · DRIVE-1-2`, and E seats the attendee with MENTOR still on their head;
- verified the maximized screening in a live browser with real clicks, in both public and private mode: the button fills the viewport and relabels, the same button and Escape both leave, public returns to the seated HUD, private keeps its panel, and `document.fullscreenElement` stays null throughout. The YouTube player's own fullscreen button still needs a look in Safari and Chrome, because neither the preview pane nor a connected Chrome was available to enter real fullscreen here;
- verified persistence end to end against the running dev service: a gate background and an NPC rename survived a service restart, and removing the settings file restored the defaults;
- chat persistence is covered by a test that restarts the service and reads the history back as a different attendee; it has not yet been walked through the real chat UI in two browsers;
- no deployment command was run.

The test suite no longer hard-codes ports. Each instance asks the operating system for a free one, so an unrelated local service cannot fail the run. Each instance also gets its own temporary settings file, so a previous run can never leak persisted STAFF state into the next.

Useful loopback-only visual fixtures:

- `/?review=rooftop` and `/?review=rooftop-dj` — the rooftop deck and its booth
- `/?review=club` and `/?review=club-dj` — the club from the entrance and at the decks
- `/?review=mentor`
- `/?review=mentor-carry`
- `/?review=mentor-npc-carry`
- `/?review=npc-control`
- `/?review=npc-popcorn-seat`

For `npc-popcorn-seat`, enter the world in muted mode. The fixture controls KENNY, seats him at The Shore, and gives him popcorn. The HTML attribute `data-npc-control-review` should report:

- `controlledNpcId: "KENNY"`
- `playerState: "seated"`
- `carriedItem: "POPCORN"`
- `carriedPropVisible: true`
- `carriedPropParentNpcId: "KENNY"`
- `playerNpcDistance: 0`

## Important files

- `src/ui/App.ts` — gate, festival HUD/pass, chat, programme/pamphlet/attendee/staff UI, network-to-world synchronization, review routes.
- `src/world/FestivalWorld.ts` — Three.js world, movement, cameras, collisions, seats, player/NPC state, carried props, screens, environmental interactions.
- `src/world/MentorDog.ts` — MENTOR's block-style four-foot dog rig and animation pivots.
- `src/world/DayNightCycle.ts` — sun/moon objects and lighting cycle.
- `src/network/FestivalClient.ts` — session recovery, SSE, presence, chat, STAFF API calls and shared config types.
- `server/index.mjs` — dependency-free Node HTTP/SSE service, in-memory authoritative state, STAFF endpoints and static production serving.
- `server/server.test.mjs` — live service integration tests.
- `server/festival-state.json` — saved STAFF settings; git-ignored, created on the first STAFF edit, safe to delete to return to festival defaults.
- `src/data/catalogue.ts` — normalized work catalogue and venue mapping.
- `src/style.css` — gate, HUD, pass, admin, responsive styling and film texture.
- `.env.example` — local client/service environment contract.
- `README.md` — phase overview and approval-gated production notes.

## Controlled-avatar implementation notes

`FestivalWorld.player` remains the logical movement and interaction body even while STAFF controls an NPC. The visible NPC copies that logical transform in `updateNpcs()`. `originalPlayerIdle` stays at the STAFF attendee's original position until `setControlledNpcId(undefined)` restores it.

Never parent held visuals permanently to `player`. Use `activeCarrierGroup()` and `syncCarriedPropAnchor()`:

- the shared local popcorn group is attached to the currently visible carrier;
- `positionPopcornProp()` resets its local transform after every carrier change;
- human and dog anchors differ;
- remote-controlled NPCs use their own `remoteCarriedProp` so another client can see their popcorn;
- ordinary remote attendees use the `RemoteAvatar.carriedProp` copy.

The local interaction state remains `playerState`, `carriedItem`, `stowedItem`, `activeSeat`, and `controlledNpcId`. Do not fork separate NPC-only interaction state unless the entire state machine and network protocol are deliberately redesigned.

Remote locomotion must use `NetworkPresence.moving`. Do not return to inferring movement only from a target change in `updateRemoteAvatars()`; that was the source of the glitchy walk/idle flashing. Remote avatars keep a continuous `animationPhase`, interpolate position every render frame, and rotate through the shortest angular path.

MENTOR carry ownership is now shared as `FestivalState.mentorCarrierId` and changed only through `/api/mentor/pick-up` and `/api/mentor/put-down`. `FestivalWorld.setSharedMentorCarrier()` reconciles the unique dog object on every client. When the local STAFF identity controls MENTOR and another attendee is the carrier, `isMentorControlLocked()` clears movement input, follows the remote carrier, and keeps MENTOR parented to that visible avatar.

`AvatarGesture` now includes `wave`, `feed`, and `tail-wag`. Human rigs expose a small treat mesh and `animateRig()` owns its visibility. `NpcAvatar.eatUntil` deliberately remains independent of STAFF control, so remote feed presence can trigger MENTOR's eating pose on the controller's client too. `animateMentorDog()` must keep greetings tail-only.

The maximized screening is a second YouTube player, so it must be reconciled with the projector it covers. `FestivalWorld` records `currentTime` from the player's own `infoDelivery` messages and exposes it as `publicScreenTime()`; `publicScreeningOffset()` uses it so the screening joins the theater in progress. `projectorMessage()` matches a player by `iframe.contentWindow === event.source`, so anything that wraps or proxies `contentWindow` silently breaks position tracking. The projector is muted whenever `screenMaximized` is true — both in `syncVenueScreen()` for the steady state and directly in `setScreenMaximized()` so the mute lands on the same frame as the screening.

Public screenings really are synchronized now, and the service owns the clock. Each venue carries `startedAt`, and `publicOffset(venue)` seeks to `serverNow - startedAt`, where `serverNow` corrects for the attendee's own clock using `serverTime` from every state payload. The service resets `startedAt` when a work advances, when STAFF selects a different current work, and when the work on screen is taken down; pausing a venue records `pausedAt` and resuming shifts `startedAt` forward by the paused duration, so a pause does not silently run the programme on behind a stopped picture. A restored programme restarts its current work rather than seeking days into it.

Two details keep this honest, and both were bugs during implementation. `syncPublicProjectors()` waits while the session is still connecting, because a projector built before the first state payload would load at zero. And the reload token carries `startedAt` alongside `updatedAt`, because a projector caches by signature and would otherwise keep a stale position forever.

## World layout constants

`GATE_Z` places the festival gate, and the promenade, carpet, road and lamp runs are all derived from it — moving the gate moves the approach with it. `CLUB_Z` offsets The Basement north of the red carpet the same way. Both exist so the map can be extended without hand-editing dozens of coordinates; keep new scenery expressed against them rather than as literals.

## NPC movement

Wandering NPCs pick a haunt from `NPC_HAUNTS`, wander its small loop for half a minute or so, then head somewhere else. `shuffleNpcHaunt()` swaps the route and aims for the nearest end of the new loop, so the walk across the festival looks deliberate.

Stationed NPCs never shuffle: the DJ, and the club's regulars on the dance floor. The club is deliberately absent from the haunt list, because it is underground and NPCs have no way down the stairs — `groundHeightAt()` is applied to the attendee only. If NPCs are ever wanted downstairs they need their own floor handling first.

## The Shore's water and planting

`StylizedWater.ts` holds a cel-shaded sea ported from the stylized-components reference. The look comes from an animated Voronoi field: nearest-cell distance minus a smooth minimum over all of them is near zero inside a cell and rises at its boundaries, so a hard step across that difference draws crisp foam lines instead of a gradient. Colour is a three-stop ramp keyed off the same step. It is a fragment shader on a flat plane with no vertex displacement and no render target, which is what makes it affordable.

It is drawn **only on 一般 graphics**; 精簡 keeps the cheaper textured water underneath, so the shader costs nothing on the low setting. `updateStylizedWater()` retints it from the day cycle and aims the glint band at whichever of the sun or moon is up.

Beach planting is hand-placed, not scattered, so the middle of the beach stays open and nothing blocks the Shore screen. Every position is tested against `staticCollides()` before it is built, so a plant can never land inside something already there. Blade counts drop on 精簡.

## The STAFF key

`FESTIVAL_ADMIN_KEY` is the key until STAFF change it. `/api/admin/key` rotates it, requiring the current key in the body as well as the header, so a browser session left open cannot rotate it on its own. Only a salted scrypt hash reaches the settings file — never the key. If the new key is lost, the only way back is deleting `adminKeyDigest` from the state file to fall back to the environment key.

## Performance

`?review=perf` exposes `performanceSnapshot()`: draw calls, triangles, lights, shadow casters, live players. Use it before and after any visual change, because this world's cost is not where a low-poly world's cost usually is.

Geometry is free here — about 3,900 triangles. The frame budget goes to three things:

- **Lamp lights are pooled.** Every post is a light source from the attendee's point of view, but the lights come from a fixed pool of six spotlights that `updateLampPool()` reassigns to the nearest posts a few times a second. Giving each post its own light puts the count straight back where it was costing frames. Distant posts glow from their emissive heads only.
- **Lights.** Every light is evaluated for every lit pixel in the world, so a lamp added for one room is charged everywhere. The count was 41, now 18. Prefer emissive materials, which cost nothing per light, over another lamp — that is how the club room is lit.
- **Shadow casters.** Each caster is drawn again into the sun's shadow map every frame. `mesh()` no longer opts anything in; `castShadows()` marks the few that earn it, currently avatars. The count was 521, now 179.
- **Live video.** A YouTube iframe decoding is the single most expensive object on the page. Only the venue the attendee is actually in keeps a player; `activeProjectorVenue()` decides, and `releaseProjector()` tears the rest down. Four were running at once, now at most one.

## The Rooftop

The fifth venue, east across the street from The Basement, spinning the same DR.BEAUTY box with DR.BEAUTY at the booth. Its plot was surveyed against every existing structure before anything was placed, after three rounds of discovering conflicts through screenshots — do the same before adding anything else large.

The one-floor-per-column rule shapes it: the deck covers only the **eastern** part of the shell, and the western bay is the open garage. Nothing sits above anything else that an attendee can walk on. The exterior stair climbs the road-facing side, outside the shell entirely.

Three vendors line the garage bay. `E` at one hands over a hot dog, pizza or fried chicken; `E` again eats it, and the same applies to popcorn and a drink. `EDIBLE_ITEMS` is the list; the carried prop reshapes itself to match what is in hand.

Both booths share one menu: `openDjRequest(name, venue)` and `/api/{club|rooftop}/request`, with `venueQueues` holding a queue per venue.

## The Basement

The club is the fourth venue and the only interior. It stands on a lot north-west of MY SQUARE, on ground the walkable rectangle never reached: the base ground plane already spans x ±66, so the district only needed the movement clamp opened, not new terrain. Attendees walk in through a door on the east face, cross a ground-floor lobby, and take a stair run west down into the room.

`clubBounds` holds four boxes and they must stay consistent with each other: the building shell, the lobby, the stair run, and the room. Only one floor height can exist per column, so the lobby deliberately does not overlap the room below it — the room starts west of the stair foot. A ground-level collider seals the lobby's west wall except at the stair opening, which is why the shell above the room is never walkable.

- The stair foot and the room's east edge share an x coordinate, so `onClubStairs()` is inclusive at the bottom. An exclusive bound leaves a one-step seam where the attendee pops back to street height.
- The room's east wall is split around the stair opening. Built solid it stands squarely across the bottom of the steps, which reads as an invisible barrier at the entrance to the basement.
- `clubReviewSnapshot().entryRoute` probes collision and floor height along the whole walk in, from the forecourt to the dance floor. Use it rather than trying to drive the avatar frame by frame; the preview pane only animates while its tab is fronted.
- Never adjust `camera.rotation` outside the frame that sets it. `lookAt()` writes a complete orientation whose roll is rarely zero, so decaying that roll tilts the whole view — the cause of an unexplained camera list that showed up all over the world. The drunken view adds roll on top and leaves it alone when sober.
- **A hole is only a hole if nothing else is lying across it.** The club's stair opening was reported sealed three times. The floor mesh had the gap and the collision ramped down correctly, but the world terrain, then the club forecourt, then the turning road were each paving over it a few centimetres below. Walkability probes all passed; the opening still looked solid. `clubReviewSnapshot().openingHits` now drops a ray down the opening and lists what it hits — a single stair tread means open, anything above it means covered. Use that, not a walk probe, for any opening.
- A hole in a floor mesh is not a hole in the world. `groundHeightAt()` decides where an attendee stands, so an opening needs a matching height region or they walk on air across it. The club's stair run now starts inside the lobby for exactly this reason: the opening in the floor *is* the top of the stairs.
- The room's ceiling must finish below grade. `CLUB_FLOOR_Y + CLUB_ROOM_HEIGHT` above zero pushes the roof up through the lobby floor, which is what an exposed, clipping ceiling means when it appears.
- Every collider for surface scenery needs an `aboveGround` band, without exception. Two separate bugs traced to the same omission: a lamp post, and the skyline block at the west map edge, which after the club moved sat directly over the dance floor and stopped attendees on open ground two storeys below. When someone reports an invisible wall indoors, look for a surface object above it before looking anywhere else.
- Colliders for surface scenery need an `aboveGround` band. A lamp post without one blocks at every height, including down in the basement, where it reads as an invisible wall on open floor. That single omission produced both lamps standing inside the building and attendees snagging in the room.
- `groundHeightAt()` is the only place the world floor is not flat. It ramps along the stair run and returns the room floor inside the room. `movePlayer()` tests collision at the height the attendee is about to stand at, not the one they are leaving.
- Colliders carry an optional `minY`/`maxY`. Street-level walls use `minY: -0.4` so they do not also wall off the room below; room walls use a below-ground band so they do not block the lot above. NPC collision is tested at the NPC's own height.
- `confineCameraToClub()` replaces the outdoor orbit indoors, picking its bounds from whichever box the attendee is standing in. Do not go back to clamping the outdoor camera into the room: it rises through the roof and frames the lot, and clamping its position collapses the shot to nothing against a wall. The interior camera cuts the view distance to what fits and lifts as it is squeezed.
- A sealed room gets nothing from the sky cycle, so the club carries its own house lighting and its surfaces are deliberately lighter than the rest of the world. Darkening them makes the room read as black.
- `venueScreens` entries carry `facing`. The club's screen is watched from the -z side, which flips both the visibility test and the CSS3D object's rotation.
- The foreground pass clips the scene to the half between the screen and the viewer, and which half that is depends on `facing`. Left at the default the club's screen is covered by its own back wall, which reads as the screen being blocked.
- A projector is a CSS3D element, drawn over the WebGL scene and impossible to occlude with walls. The club's screen is therefore gated on standing in the room and the outdoor screens on standing outside it. Without that gate the music video hangs in mid-air in front of the building, which reads as seeing through the wall.
- The shell is four walls and a roof, not one filled block. A solid box cannot hold a room: its faces are culled from the inside, so the lobby would look out onto the world.
- BOBBY has a `station` and `pose: 'dj'`; four regulars have `pose: 'dance'`. Stationed NPCs hold their post instead of walking a route. `nearestSocialTarget()` skips the DJ, and `nearbyDj()` plus the `dj` action open the club's personal catalogue.

Requests join a queue. `/api/club/request` appends to `clubQueue`, and `/api/programme/club/advance` takes its next track from the front of that queue before falling back to the standing order, so the room finishes what it is playing. The queue is live session state and is deliberately not persisted: the attendees who asked are gone after a restart. A departing attendee's requests leave with them, a 30-second per-attendee cooldown and a 12-slot cap stop one person stacking it, and the track already playing cannot be queued.

Private listening sits alongside the request in the same menu and reuses the theatres' `startPrivateScreening()`, which is why `privateScreenOpen()` had to stop assuming the attendee is seated.

Note for QA: the `?review=club` fixtures run offline by design, so the request buttons refuse with an offline notice and the queue panel renders empty. Exercise the queue against the service directly, or walk in from a normal session.

Asking the DJ for a track is not the theatres' private screening. `/api/club/request` changes what the whole club plays, because that is what asking a DJ means: it moves the venue's current track, restarts its clock, and credits the requester in `clubRequest` so every client can announce it. A 30-second per-attendee cooldown, plus refusals for unknown tracks and for the track already playing, stop one person holding the room hostage.

`animateRig()` must clear every axis the dance and DJ poses touch. Those poses set `leftArm.rotation.z` and torso rotations that the walk cycle never writes, so without clearing them the body freezes mid-move when the pose ends.

The club's bar sits along the room's south wall. Its stools are ordinary `Seat` entries carrying `kind: 'bar'`, which keeps the ordinary camera and faces the counter instead of switching to the screening camera and staring at a wall. `E` at the counter orders, `E` again drinks, and the third drink starts the drunken view.

Drunkenness rolls the horizon, drifts the aim and breathes the lens, decaying over its last stretch so sobering up is gradual. It deliberately does **not** touch movement: an attendee must always be able to walk out of the club. `applyDrunkenView()` eases the camera back to level when it expires, so nothing is left tilted.

Dancing is a held state, not a timed gesture. Space toggles it, moving cancels it, and it travels as the `dance` gesture so other attendees see it. `poseRigDance()` pivots limbs from the shoulders and hips only — the torso is a separate mesh, and shifting its position tears the body apart.

The lights cannot follow the audio: a YouTube embed is cross-origin and the page cannot read it. Each track instead carries a STAFF-set tempo in `trackTempos`, and both the light rig and every dancer phase off the venue's `startedAt`, so the room flashes and moves on the same beat for everyone. Real beat detection would mean self-hosting the audio.

`setSwimming()` owns popcorn stow/restore. `interact()` owns interaction priority, in this order: stand up, an explicit SHIFT+E MENTOR pickup, seat, put MENTOR down, concession, MENTOR treat, pamphlet, greeting, programme. Keep the explicit pickup first — MENTOR's route runs within 2.5 units of the concession booth, so any lower priority makes SHIFT+E unusable there. `interactionLabel()` must mirror this order or the prompt will advertise an action that E does not perform. `standUp()` restores the prior non-screening camera mode.

The screening panel does not call `requestFullscreen`. `setScreenMaximized()` toggles the `venue-screen--maximized` class, which fills the viewport with the panel's own layout, and `fullscreenLabel()` owns the button text. This is per-browser and never touches shared state.

Do not reintroduce an app-owned fullscreen here. Fullscreen nests: the YouTube player requests real fullscreen on its own iframe, which stacks on top of whatever the app already put on the fullscreen stack. With `#venue-screen` underneath, the player's exit button only popped back to a panel that still covered the display, so it read as a dead button, and an attempt to pop the rest of the stack from inside `fullscreenchange` did not fix it. With nothing of ours on the stack, the player's own fullscreen is a plain single level and its exit button behaves natively. The trade is that the app's own button gives a viewport-filling overlay rather than OS fullscreen; real fullscreen remains one click away inside the player. `renderScreen()` re-applies the class so a film change keeps the layout, `hideVenueScreen()` clears it, `syncVenueScreen()` must not push the seat HUD back over a maximized screening, and `globalShortcut` handles Escape because the browser no longer does.

## Network and persistence model

The service is single-process. Live session state is in-memory; STAFF settings are on disk:

- visitors, seat claims, and MENTOR's current carrier reset when the service restarts;
- schedule edits, sign-in background edits, site styling, NPC edits, pamphlet edits, custom videos, and the chat buffer are saved to `FESTIVAL_STATE_FILE` (default `server/festival-state.json`, git-ignored) and restored at startup;
- restored chat is tracked in `restoredMessageIds`, and `canSeeMessage()` shows it to every attendee. Without that, a restored NEARBY message would be invisible to everyone forever, because its author is gone and proximity can no longer be measured. The set is server-side, so nothing extra goes on the wire; STAFF deletion clears both the message and its id;
- saves are debounced by 200 ms and written through a temporary file plus a rename, so an interrupted save cannot leave a half-written state behind; a shutdown flushes only genuinely unsaved edits, so a clean run never recreates a file an operator deleted;
- everything restored from the file is re-validated with the same rules as the admin endpoints, so a hand-edited or stale file cannot inject an unapproved video id or an out-of-range style value;
- `FESTIVAL_STATE_FILE=off` disables persistence entirely for a throwaway instance;
- the browser stores the remembered attendee profile in `localStorage`;
- private viewing progress, staff unlock, and local fallback chat are in `sessionStorage`;
- disconnected sessions have a 120-second recovery grace period;
- SSE carries state updates, while presence posts are throttled client-side.

`NetworkPresence.carriedItem` is sanitized by the service to `POPCORN`, the authoritative MENTOR carrier, or undefined. Remote popcorn is rendered. MENTOR's unique-world-object ownership is server-authoritative within the current single-process service, but still resets when the service restarts.

## Controls

- WASD / arrow keys — camera-relative movement
- T — cycles follow, perspective and first-person cameras
- SPACE — start or stop dancing; moving cancels it
- click-drag mouse — rotate current camera
- T — follow/perspective camera toggle
- E — context interaction; at the club's bar and the rooftop vendors it orders; SHIFT+E drinks, so an attendee can sit and drink or stand and drink; stand, sit, take popcorn, give MENTOR a treat, put MENTOR down, open pamphlet/programme, wave, or tail-wag while controlling MENTOR
- Shift+E — pick up MENTOR when nearby; this outranks the seat and the concession stand
- Enter — open chat
- PASS — programme, chat, attendees, character, travel and STAFF tools

While seated, click-drag camera remains active and E stands up. While swimming, movement and nearby greetings stay active; popcorn is stowed. Carrying MENTOR does not block seating in any venue: near a free seat the prompt becomes `E TO SIT · <SEAT>` and MENTOR stays on the attendee's head.

## Known boundaries and next checks

- YouTube embedding depends on each video's owner allowing embeds; the project cannot override YouTube restrictions.
- The current service is not horizontally scalable and has no database. The settings file is a single-process store, not shared storage.
- MENTOR ownership is authoritative only inside the current single-process service; horizontal scaling still needs a shared state/event store.
- The settings file is written by whichever process owns it. Do not run two services against the same `FESTIVAL_STATE_FILE`.
- Re-test two real browsers for the complete STAFF-controlled MENTOR pickup/follow/release path and remote treat/eating timing.
- Re-test the public-screening overlay in Safari and Chrome: the button in, the same button out, Escape, and the YouTube player's own fullscreen button.
- Watch a venue roll from one work to the next with two browsers open, confirming both advance together and neither reloads twice.
- Re-test sun and moon reflection alignment at `?cycleMinute=25`, `30`, `42`, and `52`.
- Re-test the controlled NPC in all three venue seat layouts. MENTOR-on-head plus seating is confirmed at the Drive-In; The Palace and The Shore still want a look, as does a STAFF-controlled NPC sitting while carrying MENTOR.
- Re-test a second browser on the same service to confirm remote controlled-NPC popcorn is visible and is removed when the carrier swims or returns to self.
- If LAN sharing becomes a deliverable, add a safe `dev:lan` script and document the exact firewall/origin setup instead of changing the loopback defaults silently.
- Before any real launch: choose hosting, TLS, persistent storage, observability, privacy/retention policy, final STAFF key, and production origins.

## Owner preferences to preserve

- No deployment until final approval.
- Keep instructions short in the attendee-facing UI.
- Maintain full English and Traditional Chinese coverage.
- Preserve the low-poly, PS2/Roblox/Minecraft-like visual language.
- Prefer direct visual and functional validation; distinguish verified behavior from remaining risks.
- Avoid regressions that reset panel scroll position, flash live chat, create z-fighting, or make screens overdraw foreground objects.
