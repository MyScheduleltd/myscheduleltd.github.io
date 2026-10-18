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
