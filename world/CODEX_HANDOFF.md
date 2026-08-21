# Codex handoff — 我的戲院 / MYSCHEDULE Virtual Festival

Last updated: 2026-08-21 · HEAD `8f478de` + unpublished mobile interaction fixes · branch `codex/fix-gate-entry-brand`

> `world/CLAUDE_HANDOFF.md` is **stale** (2026-08-15). It says the build must never be
> published and names the branch `codex/pivot-exploration`. Both are long out of date —
> we publish to `docs/beta` on `main` every turn now. Read this file instead; keep that
> one only for the older architectural notes.

---

## 1. The one rule that matters

**Do not publish until the owner explicitly says `publish`.** Finish and verify the
working tree, report that it is ready, then wait. When approval arrives, publish the
whole accepted working tree together:

```bash
cd world && npm run build:beta          # tsc --noEmit && vite build && publish to docs/beta
cd .. && git add -A world docs/beta && git commit && git push origin main
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
| `world/server/server.test.mjs` | 41 tests. Run with `npm test`. |
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

### Current unpublished mobile interaction fixes

- On a landscape phone, the compact `任務 / OBJECTIVES` counter now shares the
  header row with the 42px square logo. Its 25px height is vertically centred
  beside the logo, while the connection badge keeps the right side.
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
- `npm run build` passes and all 41 server tests pass. These changes are locally
  verified but **not published**; wait for an explicit `publish`.

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
