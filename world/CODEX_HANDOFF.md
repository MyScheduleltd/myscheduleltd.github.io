# Codex handoff — 我的戲院 / MYSCHEDULE Virtual Festival

Last updated: 2026-08-20 · HEAD `4e2b3a9` · branch `main`

> `world/CLAUDE_HANDOFF.md` is **stale** (2026-08-15). It says the build must never be
> published and names the branch `codex/pivot-exploration`. Both are long out of date —
> we publish to `docs/beta` on `main` every turn now. Read this file instead; keep that
> one only for the older architectural notes.

---

## 1. The one rule that matters

**Every change ships in the same turn it is made.** The owner verifies on the live
site, never in the repo. Work left in the working tree reads to them as no work done —
this has caused real friction before.

```bash
cd world && npm run build:beta          # tsc --noEmit && vite build && publish to docs/beta
cd .. && git add -A world docs/beta && git commit && git push origin main
```

`npm run verify` (`node --test server/server.test.mjs && tsc --noEmit && vite build`)
must pass first. There are **40 server tests**; they all pass at HEAD.

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
| `world/server/server.test.mjs` | 40 tests. Run with `npm test`. |
| `world/scripts/publish-beta.mjs` | Copies the Vite build into `docs/beta`. |

Deployment: **Pages** serves `docs/`. **Render** runs `world/server/index.mjs`.

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
mentor  mentor-carry  mentor-npc-carry  npc-control  npc-popcorn-seat
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
