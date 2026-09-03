# Codex handoff — 我的戲院 / MYSCHEDULE Virtual Festival

Last updated: 2026-09-03 · desktop VR exit control right edge published · branch `codex/fix-gate-entry-brand`

> `world/CLAUDE_HANDOFF.md` now begins with a current continuation note. Its long body
> below `Read this first` remains the older architectural record and still contains an
> obsolete no-publish rule and branch name. Use this file for the active process.

---

## 0. READ THIS FIRST — desktop VR exit control right edge

The owner's follow-up screenshot showed `離開 VR 預覽` a few pixels left of the
top-right `線上 / …` status box. The exit control now uses the same right inset
as the header at every layout that can show it: 16px on ordinary desktop, 14px
at the narrow breakpoint and 10px plus the safe-area inset in short landscape.
Its previously approved vertical alignment is unchanged.

This remains a CSS-only follow-up. It changes no WebXR, projector/video, camera,
avatar, or screen behavior. The local desktop-VR review entered successfully and
exposed both controls. All 43 server tests, TypeScript, the Vite production build
and `git diff --check` pass. The owner approved publication on 2026-09-03. The
beta payload references `index-BxOjzBwv.js`, `index-Djeoze8P.css` and the
unchanged `three-Bb7Az0mP.js` runtime bundle.

## 0a. Desktop VR exit control vertical alignment

The owner's desktop VR screenshot showed `離開 VR 預覽` sharing the header row
with, and covering, the top-right connection-status box. The control now stays
right-aligned but uses the same top coordinate as the left-side venue label:
65px in the ordinary desktop layout and 76px in the existing narrow/coarse
breakpoint. This aligns its top edge with `我的廣場` while leaving the connection
status unobstructed. Safe-area inset support remains in both values.

This is a CSS-only positioning follow-up. It does not change WebXR sessions,
camera height, projector/video behavior, screen or avatar geometry, or the
accepted exit-to-YouTube/resume-VR flow. All 43 server tests, TypeScript, the
Vite production build and `git diff --check` pass. The owner explicitly approved
publication on 2026-09-03. The beta payload references `index-Du5ZjJto.js`,
`index-BpMAefXC.css` and the unchanged `three-Bb7Az0mP.js` runtime bundle. The
custom domain was then opened with a cache-busting release query and confirmed
to serve those exact new JavaScript and CSS assets; the published desktop VR
flow exposed both `我的廣場` and `離開 VR 預覽` with the updated stylesheet.

## 0b. Desktop VR eye height and live YouTube published

The owner's desktop VR screenshots showed the preview camera below the avatar's
established first-person eye line and WebGL title posters in place of the live
public-screening videos. The local follow-up fixes both without changing screen
geometry, the avatar foreground compositor or the true Quest media compromise.

- Desktop VR now uses the same 2.90-world-unit height above the floor as the
  avatar's first-person POV. That value is derived from the 0.28 avatar rig
  origin plus its existing 2.62 eye offset, so the two views cannot drift apart.
- A simulated desktop VR session keeps the ordinary CSS3D YouTube projector
  mounted, visible and playing. It no longer releases the iframe, enables the
  five WebGL poster substitutes or hides the CSS projector layer.
- A real immersive Quest session still releases the iframe and uses the WebGL
  posters. Cross-origin YouTube embeds cannot be drawn into an immersive WebXR
  texture; seated Quest playback therefore retains the already accepted flow
  that exits the immersive session to YouTube and offers `RESUME VR` afterward.
  The owner explicitly chose to keep this exit/resume flow for now on
  2026-09-03; no direct-video or WebXR media-layer experiment was added.
- `?review=vr-screen` is a loopback-only deterministic fixture. It seats the
  visitor at the Shore, uses a verified embeddable catalogue item and reports
  the active projector mode, iframe/playback state and both eye heights through
  `data-vr-review`.
- Verified locally in the browser: desktop VR was active with one WebGL context,
  no WebGL posters, the Shore iframe mounted and `playing: true`; both the
  simulated eye height and avatar POV height reported 2.9. The rendered review
  frame showed the live music video on the in-world screen. All 43 server tests,
  TypeScript, the Vite production build and `git diff --check` pass.

The owner approved publication on 2026-09-03. The beta payload references
`index-7-GEqjQU.js`, `index-CfFYu65j.css` and the unchanged
`three-Bb7Az0mP.js` runtime bundle.

## 0c. Desktop VR access published

The owner asked to use the VR mode from a desktop so they can verify it without
a Quest. A fine-pointer, hover-capable browser now receives an enabled
`VR DESKTOP MODE` checkbox when immersive WebXR is unavailable. It enters the
same single-context VR presentation through the existing simulated path, with
keyboard/mouse navigation, WebGL projector posters and an explicit exit button.
A Quest browser with `immersive-vr` support still enters real WebXR. Touch-only
phones without WebXR stay disabled, preserving the mobile stability path.

The ordinary desktop flow and Quest-support fixture passed in-browser; the
desktop entered and exited its simulated presentation with one WebGL context,
two controller stand-ins and all five projector posters. All 43 server tests,
the TypeScript/Vite build and `git diff --check` passed. The owner approved
publication on 2026-09-03; the beta payload references `index-Dj_j6JGO.js`,
the unchanged `index-Dg2SpIlQ.css` and `three-Bb7Az0mP.js` bundles.

## 0d. VR option visible on every gate, published

The owner opened the published beta on a desktop browser and reasonably thought
VR was absent: the capability check hid the entire option when `immersive-vr`
was unavailable. The gate now always shows `QUEST VR MODE`. While WebXR support
is being checked, and on browsers without a connected headset, the checkbox is
disabled and its bilingual note explains that the page must be opened in Meta
Quest Browser. On a supported Quest browser it becomes the same active checkbox
as before. The local VR review fixture remains active and clearly labelled.

This follow-up changes no WebXR session, projector, avatar or screen geometry.
The owner approved publication on 2026-09-03. Its beta payload references
`index-CeN7ts66.js`, `index-Dg2SpIlQ.css` and the unchanged
`three-Bb7Az0mP.js` runtime bundle.

## 0e. Quest/WebXR beta published

The owner asked whether the festival could run on Meta Quest and chose YouTube
embeds as the only screening source. They accepted this product compromise:
the venue itself is immersive and walkable; selecting a screening ends the
immersive session and opens the untouched standard YouTube iframe, then a
`RESUME VR` action requests a new immersive session and returns to the same
world position and seat.

- The gate detects `immersive-vr` support with `navigator.xr.isSessionSupported`.
  It does not user-agent sniff. Supported browsers receive a bilingual
  `QUEST VR MODE` option; selecting it forces Lite graphics and stores only a
  per-tab preference. Entry into WebXR still has its own explicit button after
  the world loads because the browser requires a direct user gesture.
- The world uses Three's `WebGLRenderer.setAnimationLoop`, a `local-floor`
  reference space, 0.78 framebuffer scale and fixed foveation. Quest mode keeps
  one WebGL renderer/context and never constructs the desktop foreground
  renderer.
- Quest Touch controls: left stick moves, either grip runs, right stick snap
  turns 30 degrees, left stick click steps/teleports forward, X jumps, and the
  trigger uses the ordinary interaction. At a screening seat, the trigger sends
  the visitor to the standard YouTube player instead.
- CSS3D/iframe projectors are unavailable inside an immersive WebXR layer. Each
  venue therefore has a lightweight WebGL poster at the exact existing screen
  centre with the current title and the instruction to sit/press trigger. The
  normal DOM projector is released while VR is active, avoiding a competing
  video decoder. No screen geometry or approved avatar compositor changed.
- Local fixtures: `?review=vr-gate`, `?review=vr-entry`, `?review=vr-youtube`.
  On loopback only, `vr-gate` and `vr-entry` now launch a clearly labelled
  desktop simulation instead of making a doomed immersive-session request.
  Keyboard/mouse navigation, the WebGL screening posters and exit flow can
  therefore be reviewed without a headset; this simulation is never enabled
  by a production URL.
  `data-vr-review` reports support, the standard YouTube hostname, preserved
  seat, controller count, render-loop type and whether Quest mode retained one
  WebGL context.
- Locally verified: the gate option renders at 1024 x 768; checking it and
  entering muted reaches the VR-ready card; the desktop preview enters and
  exits with one WebGL context, two controller stand-ins and five WebGL
  screening posters; the YouTube fixture opens a
  maximized `www.youtube.com` iframe from `SHORE-1-1`; closing it reveals
  `RESUME VR`; the existing 390 x 844 mobile-stability fixture still reports
  `contexts: 1`, one live player and no console warnings/errors. All 43 server
  tests, TypeScript/Vite build and `git diff --check` pass.
- Not locally verifiable: actual Quest headset permission, stereoscopic frame
  timing, Touch-controller mappings and the end-session/resume gesture on Quest
  Browser. Treat these as device QA, not confirmed behavior.

The owner approved publication on 2026-09-03. The beta payload references
`index-D73Tb99w.js`, `index-BTLDz2Xy.css` and `three-Bb7Az0mP.js`. Real Quest
headset behavior still requires the device QA listed above.

## 0f. All-avatar foreground follow-up published

The owner's live iPhone screenshots showed both resident DJs hidden by the CSS3D
public-screening layer, the basement console hanging beyond its platform, and the
complete page becoming permanently enlarged after rapid taps. Commit `e8ba163`
published a first fix, but it solved the DJ overlap by raising both screens. The owner
clarified that their original height was correct. Commit `d93192e` then restored the
height but moved both screens left; the owner rejected that too. Published commit
`3d38a0b` restored the exact original centres and rendered each DJ over the video.
The owner confirmed the DJs are correct, then reported that ordinary NPCs and visitor
avatars still fell behind the CSS3D screen. This release extends the same foreground
composition to every avatar. It is verified locally and included in the
beta Pages payload.

- Rooftop is centred at x=40, y=13.6; Basement is centred over its booth at x=-68,
  y=-9. The physical backing meshes follow those exact positions.
- Phones still use one WebGL context. On that path, the CSS3D video sits below an
  alpha-enabled main canvas; a transparent screen-shaped plane opens the projector
  rectangle, then layer 2 redraws avatars over it with the existing renderer. Local
  visitors, their idle bodies during STAFF control, remote visitors, every resident
  NPC and MENTOR all belong to that layer. Before each pass, a conservative projected
  bounds test selects only bodies which overlap that screen and stand on its viewing
  side; the rest are temporarily culled. It does not restore the duplicate renderer,
  duplicate GPU resources, or a full-scene foreground pass. Desktop retains its
  established two-context compositor.
- The basement stage is 7.2 units deep and reaches z=33.7. The console reaches
  z=34.95, leaving 1.25 units of visible platform in front instead of hanging 0.65
  units over the old slab. XIEHGAN's prompt radius is 8 units so the deeper obstacle
  does not make the DJ action inaccessible.
- `enterWorld()` now locks the document viewport at scale 1 and cancels Safari
  gesture/double-click page scaling. The canvas still owns its in-world pointer
  camera gestures. A styled reset button remains for a Safari tab restored while it
  was already enlarged.
- Loopback fixtures: `?review=screen-rooftop`, `?review=screen-club`, and the existing
  `?review=club-dj`. The first two force the single-context path and stage a DJ,
  an ordinary resident and a visitor across the screen. `data-dj-venue-review`
  records every avatar layer, the selected ids, centre and context count;
  `data-club-review` records stage depth, front edge, console margin and prompt range.
- Direct browser validation at 390 × 650 showed DJ, ordinary NPC and visitor bodies
  visibly drawn over both centred screens. Basement selected LOUI, XIEHGAN and the
  review visitor; Rooftop selected the local visitor, MINYUN, DRBEAUTY and the review
  visitor. Both fixtures report all 12 NPC parent groups plus both local visitor forms
  on layer 2, `singleContextComposite: true`, and `contexts: 1`.
- The mobile-stability fixture remained at one iframe, one context, 11 textures,
  28 geometries, 17 programs and `lost: false` from 20 through 55 seconds. At The
  Shore only the intersecting local visitor was redrawn: 12 foreground calls total,
  including the aperture. Browser console reported no warnings or errors.
  All 43 server tests and the TypeScript/Vite build pass.

The owner explicitly rejected changing either screen height or horizontal centre.
Preserve both positions, every avatar type in the foreground layer, and the
one-context phone compositor.

## 0a. Concrete mobile stability fix, published; awaiting phone confirmation

The owner's Safari tab was repeatedly dying and returning to the sign-in page.
This pass found and fixed two concrete causes of mobile memory/GPU pressure. The
fix passes the local phone fixture and was published in commit `15c9354`, but it is
**not yet explicitly confirmed stable on the owner's actual phone**. Keep that
distinction explicit.

**The unbounded leak:** every ordinary multiplayer state packet calls
`setEntranceSign` and `setTempleSign`. Those methods rebuilt 1024 × 512 canvas
textures even when the text was unchanged. Worse, `createTextTexture` kept every
font-repaint closure forever, so disposing a replaced texture did not release
its canvas. An idle connected client therefore accumulated full-size canvases
without any visible change. The fix:

- deduplicates unchanged entrance, temple and venue lettering;
- keeps pending font repaints in a `Set`, removes the repaint when its texture
  is disposed, and clears the set after both brand fonts settle;
- exposes `repaints` / `pendingSignRepaints` in the loopback diagnostics.

**The phone GPU spike:** the CSS3D projector video had a second
`THREE.WebGLRenderer` above it to redraw occluding geometry. That meant two
WebGL contexts, duplicate scene uploads and a second full draw pass exactly
when the phone was also decoding video. Coarse, no-hover devices now retain the
video but use only the main WebGL context; desktop keeps the exact two-context
composition. The context-loss handler now tracks both desktop canvases and
waits for every lost context to restore before drawing again.

Related lifecycle leaks fixed in the same audit: departing remote avatars now
dispose their unique geometry, badge maps and materials, and the five-second
light-cull timer is cleared when the world stops.

**Local evidence, `?review=mobile-stability&era=ps2`, 390 × 650:**

- 250 alternating entrance/temple sign updates: `repaints 0`, `textures 12`,
  `programs 31`, `live 1`, `frames 1`, `ctx 1`, `lost false` before and after;
- the same 250-update test on the plain world held its finite pre-font repaint
  set at 11 before and after, with `textures 12`, `ctx 1` and `lost false`;
- the public screening remained alive through 86 seconds of idle playback;
  after renderer warm-up, geometry held at 354 for the final 40 seconds and
  textures held at 12;
- a desktop `?review=perf&era=ps2` run still reports `ctx 2` and
  `mobileGpuConservation false`, so the desktop compositor was not removed;
- `npm run verify` passes all 43 server tests and the TypeScript/Vite build.

The loopback fixture exposes `data-mobile-stability-review` (the 250-update
before/after report) and `data-mobile-stability-live` (refreshed every five
seconds) on `#app`. It also places the visitor at a live Shore screening and
forces the one-context phone path even from a desktop test browser.

**The black box remains important.** It writes one diagnostic line to
`localStorage` every second (`App.startBlackBox` →
`FestivalWorld.diagnosticSample`). If the real phone still crashes, ask the
owner to photograph the entire red `LAST SESSION ENDED AT` line on the next
load. The new fields are `ctx`, `fgdraws`, `fgprogs` and `repaints`; more than
one live iframe, a rising repaint count, or `lost true` would separate a
remaining player/context fault from this fixed leak.

Phone video autoplay was **not** changed. Tap-to-start remains a possible
fallback only if the owner's phone still fails after this build.

## 0b. What changed this session — 2026-08-24/25

Published baseline before the current DJ/screen follow-up:

- removed the procedural exterior corner conduit in `WornArchitecture.ts`;
  this was the thin bar/stick protruding through the building wall in the
  owner's 2026-08-25 phone screenshot. No other wall dressing was moved;
- implemented the mobile stability work documented in 0a, including the
  loopback-only `mobile-stability` fixture and expanded black-box counters.

Thirty-two commits, `cc3b484` … `535b809`, every one published to Pages. **Two
regressions were introduced and then fixed inside this session** — check these
first if something looks wrong:

- The styling pass cloned its own output on every re-run, abandoning 51
  materials (`WornStyle.applyWornStyle`, guarded by `userData.wornMasonry`;
  `orphanedStyleMaterials` in the worn snapshot exists to catch a recurrence).
- The lamp cull ran 600 ms after load, forcing a recompile of ~1900 materials
  after the first frames. It now runs in `FestivalWorld.start()`, before
  anything has compiled. **Any light made invisible after first paint costs a
  full scene shader rebuild — this is the trap to remember.**

Art direction (all behind `?worn` / `?era=ps2`, never on for visitors):

- `era=ps2` adds world-space **courses** on walls only, four kinds — block,
  concrete panel, corrugated, render — chosen per 16 m cell, and per *room* for
  interiors so a room agrees with itself. Doors, stalls and both staircases are
  excluded (`userData.wornNoMasonry`); the size test asks for ≥4 tall and ≥6
  wide, because 2.4 in both is a door.
- 24 buildings **massed** with a plinth and cornice, merged into each mesh's own
  geometry — draw calls are the budget here, triangles are not.
- A **kerbed footway** on the cross street only, laid by walking it and asking
  the world for room. The main approach is 29 wide and its carpet 28 — there is
  no pavement there to raise.
- The painted face was built, then reverted to the visor on the owner's
  preference. The reasoning is kept in the comment where the visor is built.
- The dither stays at the signed-off level under `era=ps2`. The argument for
  standing it down was correct about the console and lost anyway.

Mobile and connection work — all real, none of it the crash:

- Shader hash rewritten to drop 18 `sin()` per fragment; the two smooth octaves
  compile out on 精簡 (`WORN_CHEAP`). The owner confirmed screening lag improved.
- 精簡 keeps 3 street lamps instead of 6 and hides all but 6 other placed lamps;
  night ambient is lifted 0.85 to compensate (`DayNightCycle.setAmbientLift`).
- WebGL **context loss is now handled** (`FestivalWorld.watchForContextLoss`).
  Nothing listened before, and the default when nobody listens is that the
  context never comes back.
- Seating is measured rather than assumed: the pad is found by looking, the hip
  rise is read off the rig. Drive-In seats sit on the car, not the tarmac
  behind it. Seat reach is horizontal (`nearestSeat`) — the rooftop benches were
  unreachable by arithmetic before.
- Connection: join retries forever, streams carry a generation so a stale one
  cannot kill a live one, a 40 s silence watchdog, `wake()` on
  `visibilitychange`/`pageshow`, and `pagehide` is now **reversible** — it no
  longer says goodbye, tears out listeners, or wipes quest progress.
- Session id and token persist in `sessionStorage` so a discarded tab reclaims
  its own visitor instead of colliding with its own name.

## 0c. Owed to the owner

1. **`world/server/index.mjs` has an undeployed change.** A name is now only
   reserved while its holder has an open stream; a disconnected holder is stood
   down (`claimName`). Two tests cover both halves. **Render needs a manual
   deploy — the owner does this by hand, and pushing to `main` ships the client
   only.** Until then the client half works and the server half does not.
2. The art-direction board (`https://claude.ai/code/artifact/a2b69b4e-235a-4512-bbfd-9fcd58b46bcc`)
   is three drafts stale. It still claims `era=ps2` stands the banding down.
3. Closing a tab now leaves a ghost visitor for up to two minutes, which is the
   accepted cost of not saying goodbye on backgrounding. `beforeunload` would
   fix it if ghosts become a nuisance.

## 0d. Corrections to the rest of this file

- **There are 43 server tests now**, not 41. Two were added for the name rule.
- The publish rule below says to wait for the word `publish`. **That is not how
  this session ran** — the owner verifies on the live site and treats unpublished
  work as no work, so every turn ended in a publish. Confirm which they want
  rather than assuming either.
- New review fixtures: `?review=sit`, `sit-rooftop`, `sit-drive` (seating
  geometry, with `reachable` and `legInPad`), `?review=kerb` (the footway).
  New flags: `?era=ps2`, `&wornTexture=N`.

---

## 0. Where to work

`/Users/myscheduleai/Desktop/myschedule-pivot/gate-entry-fix`, on branch
`codex/fix-gate-entry-brand`. The owner confirmed this on 2026-08-21.

It is a **git worktree** of the same repository as
`/Users/myscheduleai/Desktop/myscheduleltd.github.io`, which holds `main`. Two
checkouts, one repo — so work done in the wrong one is invisible in the other
until somebody notices. Publishing pushes this branch to `main`
(`git push origin HEAD:main`, a fast-forward), and the `main` worktree should be
brought level afterwards with `git fetch && git merge --ff-only origin/main` so
the two never drift.

## 1. The one rule that matters

**Do not publish until the owner explicitly says `publish`.** Finish and verify the
working tree, report that it is ready, then wait. When approval arrives, publish the
whole accepted working tree together:

```bash
cd world && npm run build:beta          # tsc --noEmit && vite build && publish to docs/beta
cd .. && git status --short
# Stage only the confirmed source/handoff paths, docs/beta/index.html, and the
# new hashed assets named by that index. Never broad-stage the worktree.
git add -- <confirmed-paths>
git diff --cached --check && git diff --cached --name-status
git commit && git push origin main
```

`npm run verify` (`node --test server/server.test.mjs && tsc --noEmit && vite build`)
must pass first. There are **41 server tests**; they all pass with the current working tree.

Two related traps, both of which have cost hours:

- **GitHub Pages caches `index.html` for 600s.** After a push, a browser can hold the
  old `index.html` pointing at the previous hashed bundle. When the owner says "your
  fix didn't work", check the shipped bundle actually contains the change before
  touching code.
- **`docs/beta` keeps old asset files.** `ls docs/beta/assets/*.css | head -1` tells you
  nothing. Always resolve the bundle actually referenced by `docs/beta/index.html`.

---

## 2. Layout

| Path | What it is |
| --- | --- |
| `world/src/world/FestivalWorld.ts` | The whole three.js world. ~7k lines. Geometry, colliders, NPCs, camera, projectors, interaction prompts. |
| `world/src/ui/App.ts` | All DOM/UI. Gate, panels, chat, staff tools, jukebox player, touch controls. |
| `world/src/style.css` | All styling, including every mobile/landscape rule. |
| `world/server/index.mjs` | Zero-dependency Node service. SSE presence, chat, seats, punches, jukebox, programme clock, staff admin. |
| `world/server/server.test.mjs` | 43 tests. Run with `npm test`. |
| `world/scripts/publish-beta.mjs` | Copies the Vite build into `docs/beta`. |

Deployment: **Pages** serves `docs/`. **Render** runs `world/server/index.mjs`.

### Latest published foundation (`8f478de`)

- A cold Render instance no longer holds the visitor on an apparently inert
  Enter button. If the public configuration wake-up request has not answered,
  the local world opens immediately and its single pending admission request
  attaches multiplayer in the background. `FestivalClient.connect()` shares
  that promise, so it cannot create a duplicate attendee.
- The gate reports `正在開啟影展… / OPENING THE FESTIVAL…` and disables both
  submit buttons as soon as one is clicked. Scene construction is deferred by
  one short browser task so this acknowledgement can paint first.
- The built-in wordmark fallback now matches the established production STAFF
  values (`41px`, scale `0.65 × 1.35`, vertical offset `4px`), preventing the
  top-left lockup from shrinking while Render wakes.
- Verified with both `/api/config` and `/api/session` delayed by 15 seconds:
  the fallback wordmark was already correct, the world opened before the
  service response, and the same attendee later changed from CONNECTING to
  LIVE without a duplicate request. `npm run verify` passes 41/41 tests and the
  TypeScript/Vite production build.
- Fireworks no longer add and remove a PointLight per rocket and burst. One
  non-shadow-casting light is created with the world and follows the brightest
  burst, so real world illumination remains while Three.js keeps a fixed light
  count and does not recompile scene shaders as the show begins. Normal mode is
  capped at 2 rockets, 4 bursts and 40 particles per burst (160 total); Lite is
  capped at 1, 2 and 24. Burst integration now writes directly to its typed
  position array. Browser snapshot during the opening showed 1 rocket, 3 bursts,
  120 particles, 1 active light and 3 sea reflections.
- A compact live `任務 / OBJECTIVES` counter sits below the top-left status chips,
  opens the checklist, and is refreshed from the same `completedQuests` set as
  the pass. Desktop browser measurement: 64 × 25 px at `(16, 164)`; it updated
  from 0/25 to 2/25 during the fireworks fixture.
- `POST /api/mentor/feed` returns the caller's complete authoritative state.
  `FestivalClient.feedMentor()` applies it immediately, so the attendee feed
  badge and `mentorFollower` do not wait for the batched SSE broadcast. The
  service still broadcasts for everybody else. The server test asserts the
  immediate count and follower; the `mentor-follow` browser fixture closed an
  obstructed 11.88-unit separation to the natural 2.10-unit follow distance.
- The shared overlay now carries `data-menu-owner="dj"` or `"screening"`.
  Opening or hiding any theater menu clears stale DJ state, and queue broadcasts
  redraw only a visible DJ-owned menu. `?review=menu-ownership` deliberately
  opens a DJ request page and then a Shore seat; the final owner is `screening`
  and the title remains `已入座`.
- These fixes were published in `8f478de` and GitHub Pages served the new
  `index-C9FAbyXK.js` bundle after its deployment completed.

### Current mobile interaction behavior

- On a landscape phone, the compact `任務 / OBJECTIVES` counter sits under the
  42px square logo with aligned left edges. At 760 × 390 its box was `(12, 54,
  62.6, 25)`, leaving a 6.5px vertical gap and no overlap with the logo.
- The festival-pass menu owns a bounded `100dvh` scroller in every mobile
  orientation. Browser drags reached the last item at both 760 × 390 landscape
  (`356px` range) and 390 × 650 portrait (`114px` range).
- During screenings, the camera control keeps the bottom-left corner and any
  seated/order interaction prompt takes a smaller separate slot. Alerts use
  the following row. At the basement-bar fixture the order/drink prompt and
  camera did not intersect; ordering a drink placed the 34px prompt at y=52 and
  its 42.5px reminder at y=96 with no overlap.
- A loyal MENTOR no longer monopolizes E/tap whenever another attendee is in
  greeting range. Both the label and the action prioritize the greeting while
  the dog follows the locally controlled body; with nobody else nearby the
  feed/pick-up prompt is unchanged. `?review=mentor-follow-greeting` stages the
  collision and verified `gesture: "wave"`, `mentorEating: false` after a tap.
- Commit `5ae3d39` gives only the DJ track-request prompt the
  `interaction-toast--dj` layout hook. `App.updateSnapshot()` derives the hook
  from the raw `E / REQUEST A TRACK FROM ...` interaction before localization,
  so English and Traditional Chinese use the same rule without styling copy.
  The prompt retains its current size, stays horizontally centred, and shares
  the pass button's bottom baseline. Browser measurements were exact in both
  portrait 390 × 650 (`44px` prompt, `0px` centre and bottom deltas) and
  landscape 760 × 390 (`38px` prompt, `0px` centre and bottom deltas).
- The previous mobile/pass/MENTOR fixes are in `10dba12`; the focused alignment
  follow-up is `5ae3d39`. `npm run verify` passes all 41 server tests plus the
  TypeScript/Vite production build.

---

## 3. Verification: read this before you trust a measurement

The in-app browser runs the page in a **backgrounded tab**, which suspends the
rendering steps. Everything below silently does not happen there:

- `requestAnimationFrame` — the world does not advance, so **the avatar cannot be
  walked anywhere** and snapshots do not reach the DOM.
- **CSS transitions and animations** — `getComputedStyle().opacity` returns a frozen
  mid-transition value. This produced three wrong readings in one session.
- **`ResizeObserver`** — callbacks never fire, not even the initial one.
- **`resize` handling** — renderer buffers do not follow a window resize.

A `computer.screenshot` forces a single frame, which is often enough to sync the DOM.

**Corollaries.** Measure geometry and computed styles, not animated values. Prefer a
review fixture over driving the avatar. And when a UI element is invisible, check both
CSS `display` **and** the `hidden` attribute — a whole session was lost moving a prompt
around the stylesheet when one line of JavaScript was setting `hidden` on it.

### Review fixtures

`?review=<name>` on `127.0.0.1` only. Several expose `window.__festivalReview()`.

```
gate  gate-approach  temple  temple-altar  jukebox  perf
club  club-dj  club-lobby  club-bar
rooftop  rooftop-dj
mentor  mentor-carry  mentor-npc-carry  mentor-follow  mentor-follow-greeting  npc-control  npc-popcorn-seat
quests  quests-complete  fireworks  menu-ownership
```

`club-bar` seats an avatar on a bar stool and `__festivalReview()` reports the
interaction label, `nearClubBar`, `canInteract` and `promptAction`. **Write more of
these.** Reasoning about the bar seat was wrong three times in a row; the fixture
answered it in one call.

---

## 4. Systems worth knowing before you touch them

**Interaction prompts.** `interactionLabel()` in `FestivalWorld.ts` chooses the words
*and* records `promptAction` (`interact` / `shift` / `worship`), `promptActionable` and
`promptSecondary` in the same pass. `canInteract()` reads those fields — it used to be
a hand-copied duplicate of the same branches and had drifted, which disabled the
altar's prompt entirely. **Do not re-introduce a second source of truth here.**

On touch, `promptForTouch()` rewrites key names into tap/hold language. A prompt whose
only offer is `SHIFT+E` is performed by a *tap*; only the two-part MENTOR prompt speaks
of holding. Hold-to-trigger is `PROMPT_HOLD_MS = 450`.

**Mobile vs desktop.** Keyed to `(pointer: coarse) and (hover: none)`, plus a
`max-width: 780px` clause for narrow desktop windows. **Not** to width alone — a phone
asked for the desktop site, or reporting a tall viewport, was getting a mouse layout,
which was the root of several "landscape is broken" reports. A touchscreen laptop
hovers, so it keeps the desk site.

**iOS keyboard.** `--keyboard-inset` is measured from `visualViewport` and fed into
panel insets; `:root[data-keyboard='up']` folds away the panel header and chat channel
tabs to buy room. Without this the writing box sits behind the keys.

**iOS zoom.** Safari zooms the page when focusing a field under 16px and never zooms
back. Every field is 16px under `(pointer: coarse)`; the two camera captions are set at
16px and scaled back down with a transform so they keep their designed size without
triggering it. Double-tap zoom is disabled via `touch-action: manipulation` applied to
`*` — it is **not inherited**, so setting it on `body` alone does nothing.

**Projectors.** CSS3D iframes composited over WebGL, with a second scissored renderer
pass drawing geometry back over them to fake occlusion. That mask is computed from the
camera against the canvas size, so the canvas is watched with a `ResizeObserver`.
Playback is nudged on returning to view, on `visibilitychange`, and on any pointer-up
(throttled) — phones stop media and do not restart it. Venues staff have paused are
remembered and never woken.

**Flex scrolling.** `.panel__body` needs `min-height: 0` to scroll; a flex item will not
shrink below its content otherwise, so `overflow: auto` never engages. This was written
only inside the landscape rules once, which silently truncated every panel on any
device outside them.

---

## 5. Open items

| Item | State |
| --- | --- |
| **DJ "already playing" false positive** | Fixed in `server/index.mjs` — settles the schedule before answering and only refuses when a real track length is known. **Needs a Render redeploy to take effect.** Covered by two tests. |
| **Public screens clipping on entry (mobile)** | Canvas `ResizeObserver` shipped. **Reasoned, not observed** — the test browser cannot fire resize callbacks. Unconfirmed by the owner. Ask whether rotating the phone fixes it: if yes the diagnosis holds, if no the stale value is not the canvas size. |
| **Camera-mode CSS consolidation** | Offered repeatedly, never done. **Nine bugs** in that area have come from one rule out-arguing another — a dead `data-camera-idle` flag, an `!important` beating the buttons, a leftover override freezing a control unpressable, flag ordering, a missing `pointer-events`. Worth doing as its own change with behaviour verified identical either side. |
| **Collider height audit** | Offered, never done. The popcorn stand was one instance of furniture described as a full-height wall, which pulls the camera in. There are likely more. |
| **Jukebox audio on iOS** | A tap-for-sound button exists because a gesture in the parent page does not grant a cross-origin YouTube iframe permission to play. Unconfirmed whether it works on the owner's device. |

---

## 6. How the owner works

- Reports bugs from **screenshots of the live site**, usually mobile Safari, often
  landscape. The screenshots are good evidence — read them closely. One showed a panel
  at desktop width, which proved the phone rules were not running at all.
- Asks "please grill me with questions" most turns and **answers them**. Ask real ones:
  ambiguities you cannot settle from the code, and trade-offs that are their call.
- Wants the concern raised **and the work done anyway** — state the assumption, ship it,
  flag what you were unsure of.
- Will tell you plainly when something still does not work. If they report the same
  fault twice, **stop reasoning and build a fixture.**

Recent decisions worth not re-litigating: all twelve NPCs render on mobile (distant
ones stop being posed instead); the camera-mode controls hide behind one corner button,
not a timer; the staff entrance at the gate is only shown for `?staff`; the basement
ceiling stays bare, lit by invisible beat spotlights, with wall fittings on the sides
and the bar wall only.

---

## 7. Recent work (this session)

### 2026-08-21 · Guided objectives and local fireworks (implemented, not published)

- Added 25 bilingual visit-only objectives in `src/data/quests.ts`, grouped into
  basic navigation, world exploration and festival activities. Completion is wired
  to actual world/UI events rather than clicks on the checklist itself.
- Progress exists only in the running `App` and is cleared on `pagehide`, including a
  back/forward-cache departure. No quest key is written to local or session storage.
- Finishing all objectives starts a 125-second personal fireworks show over the sea.
  It never enters multiplayer state. Normal/Lite graphics cap active rockets, bursts
  and particles separately.
- Bursts use colored non-shadow-casting point lights so standard world materials
  react, plus matching additive planes just above the sea for water reflections.
- `REPLAY FIREWORKS` / `重播煙火` is hidden before completion and appears only in the
  festival-pass menu afterwards; it adds nothing to the camera view.
- Review fixtures: `?review=quests` (0/25), `?review=quests-complete` (25/25 + replay),
  and `?review=fireworks` (Shore horizon + live rocket/burst/light/reflection counts).
- Browser verified: real keyboard actions moved the pass counter to 3/25; leaving and
  re-entering restored 0/25; replay was absent at 0/25 and visible inside the pass at
  25/25; fireworks rendered over the sea with colored water response and no console
  errors. `npm run build` passed and all **41/41** server tests passed.

This work is intentionally still uncommitted/unpublished with the MENTOR feed-loyalty
work below. Preserve the unrelated `M prepros.config` change.

### 2026-08-21 · MENTOR feed loyalty (implemented, not published)

- Feeding MENTOR now records one server-authoritative count for the visible actor:
  ordinary attendees keep their own count; STAFF feeding while controlling an NPC
  credits that NPC; MENTOR cannot credit himself.
- The current positive leader stays leader on a tie. If that attendee leaves, the
  next highest active attendee takes over. With no positive score MENTOR resumes his
  free route.
- While STAFF controls MENTOR, the service publishes no follower and autonomous
  following stops. Releasing MENTOR restores the preserved highest-ranked target.
- The attendee panel shows `FEED ×N` / `餵食 ×N` for attendees and every NPC except
  MENTOR. Browser check: 13 rendered rows, no horizontal overflow, MENTOR row has no
  feed badge.
- MENTOR walks toward the shared leader, keeps a natural stopping distance, and uses
  a catch-up placement only when stacked floors or a long separation make an ordinary
  NPC route impossible.
- Verification: `npm run build` passed; **41/41** server tests passed, including ties,
  leader departure, zero-score freedom, NPC credit, MENTOR self-feed rejection, and
  STAFF control suspension/resumption.

The source changes are intentionally still uncommitted/unpublished. The owner has not
yet asked to publish this feature. Preserve the unrelated `M prepros.config` change.

### 2026-08-20

Prompts on phones were the theme. A prompt is the *only* way to reach an action on
touch, so anything that hid one removed the action entirely — while desktop kept
working, which is why several of these lived a long time.

- Seated prompts were removed outright while the seat panel was open, so ordering and
  drinking at the basement bar could not be done at all on a phone.
- Eating carried food had no prompt anywhere; plain `E` had always done it.
- The worship prompt's button was `disabled` by the drifted `canInteract()` duplicate.
- MENTOR pick-up moved to hold-on-prompt, since a phone has no shift key.
- Seated avatars never received their gesture, so drinking on a stool was never seen.
- Landscape: chat feed 99px → 212px, panels scroll, screening panel laid out side by
  side so the video keeps 16:9, pass and status aligned.
- Basement lighting: ceiling rig removed entirely at the owner's request (a light well
  is cut through that ceiling; anything over it hangs from nothing), wall fittings on
  both sides plus a centred run of five on the bar wall, none beside the screen.
