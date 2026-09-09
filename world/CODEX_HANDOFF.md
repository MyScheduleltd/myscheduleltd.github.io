# Codex handoff — 我的戲院 / MYSCHEDULE Virtual Festival

Last updated: 2026-09-09 · **two published channels — read §00 before publishing anything** · the temple offering through ECPay · venue renames and catalogue swap, the GANGAN statue, avatar accessories, the crowd, a measurement harness

> `world/CLAUDE_HANDOFF.md` now begins with a current continuation note. Its long body
> below `Read this first` remains the older architectural record and still contains an
> obsolete no-publish rule and branch name. Use this file for the active process.

---

## 00. READ THIS FIRST — there are two published worlds now

### What went wrong, so it does not happen twice

The coastal art redesign reached the live festival at `/beta/` on 2026-09-08. Nobody
published it. It was sitting uncommitted in the same working tree as an unrelated
change — the ECPay offering — and a `git add -A` swept it into commit `7ee113a`, whose
message talks only about payments. It built, it passed, it went out, and the owner
found a redesigned world where the festival used to be.

The lesson is not "be careful". It is that **a shared working tree is not a place to
leave unapproved work**, and that `git add -A` in a tree two agents touch will commit
whatever the other one was in the middle of. Stage by path, or read `git status` before
every commit and account for every line of it.

### The arrangement now

| URL | Directory | Source |
| --- | --- | --- |
| `https://myscheduleltd.com/beta/` | `docs/beta/` | this branch — the festival visitors get |
| `https://myscheduleltd.com/beta/?era=ps2` | `docs/beta/ps2/` | the art redesign branch |

`docs/beta/index.html` carries a small script in its `<head>` that sends `?era=ps2` to
`ps2/` before a line of the main bundle runs. Two whole builds, each with its own
`index.html` and its own hashed assets, so neither can invalidate the other's cache and
neither can appear on the other's URL.

Two builds rather than one bundle with a flag in it, because the redesign replaces the
ground itself — terrain, colliders, the nav graph. There is no runtime switch between
those two worlds that is not a second copy of the world.

On loopback the redirect is skipped: there is no published channel to reach from a dev
server, and `?era=ps2` keeps its older meaning there as the graphics flag documented in
`App.ts`.

### Publishing

```
npm run build:beta                                    # → /beta/   (the festival)
npm run build && node scripts/publish-beta.mjs --channel ps2   # → /beta/?era=ps2
```

`publish-beta.mjs` **refuses** to publish to `/beta/` from a tree containing
`src/world/Coastal*.ts`. That tripwire knows one name; rename the redesign's modules and
it silently stops protecting anything, so the rule matters more than the check: the
festival at `/beta/` is only ever published from a tree without the redesign in it.

### When the redesign is approved

Do not merge. The redesign branch and this one deliberately disagree about the contents
of `world/src/world/` — merging this branch into the redesign would delete the redesign.
Promotion is a file-level copy of the redesign's `world/src` and `world/index.html` onto
this branch, and then a normal publish.

---

## 0. READ THIS FIRST — the crowd, and how to measure anything at all

### Every crowd measurement taken through the browser before 2026-09-07 was of a world standing still

The in-app browser suspends `requestAnimationFrame` whenever the pane is not
being looked at, and the pane counts as hidden far more often than you expect —
including while it is nominally fronted. The world's render loop is
`renderer.setAnimationLoop`, so **the world does not advance**, residents do not
walk, and any snapshot you take comes back with a number in it. That number
looks exactly like a result. It is a photograph of a stopped clock.

This wasted most of three sessions and produced two confident "it is fixed"
reports that were not true. `§3` has said the pane suspends rAF for a long time;
what it did not say is that **a frozen reading is indistinguishable from a
working one**, which is what makes it dangerous.

**So: `?review=nav` now exposes a stepper.**

```js
window.__festivalStep(seconds)  // drives updateNpcs directly, returns per-resident rows
window.__festivalGaps()         // closest pair, and how many are touching
```

`stepResidentsForReview` runs `updateNpcs` at a fixed step with no rendering, so
eight simulated minutes take one call. Two things in it are load-bearing and
both were found the hard way:

- **It patches `performance.now()` forward.** The walk schedules its own pauses
  against real time. Stepped synchronously, no real time passes, the first pause
  anybody takes never ends and every resident stops for good — a frozen crowd
  that looks precisely like the bug you are hunting.
- **It rebases every deadline on the way out.** The deadlines set during a run
  are on a clock that is then thrown away; left alone they sit minutes in the
  future against real time and the festival stands still for the rest of the
  session. The fixture would cause the very thing it measures.

Read the report **inside** the patched window too. Reading `waitUntil - now`
after restoring compares a simulated deadline against the real clock and every
wait comes back looking like ninety seconds.

### What was actually wrong with the crowd

Three separate faults, found in this order. None of them was the avoidance logic
that `§0-prev` credits.

**1. Two numbers five centimetres apart.** `holdBodiesApart` pushed bodies to
**1.3** apart while `npcCollides` refused any step ending within **1.35**. The
separation pass tidied residents into exactly the band where every direction is
blocked, and nothing could step out of the knot it had just made. A queue formed
behind each one and stood there for good. Not a failure to avoid each other —
two rules that disagreed.

**2. Over-correcting it.** Raising separation to 1.62 cleared that band and
created a standing repulsion between bodies that were already properly spaced. In
a group of six each body takes five pushes a frame; applied one at a time they
added up to more than a walking step, so a resident walked forward and was put
back the same distance. **Legs going round, body still.** Now: `apart = 1.42`,
gathered per body into one vector and applied once, and clamped to `0.9 * delta`
so nothing is ever separated faster than it walks.

**3. A step round reset the stuck counter.** This one had been there all along
and is the one the owner kept seeing. A resident that could dodge but never
advance therefore never accumulated any stuck time — so it never reached the
point of barging through bodies (`stuckFor > 2.5`), never reached the point of
giving up on its route, and shuffled side to side on one square metre
indefinitely. A dodge now costs `delta * 0.5` rather than clearing the count.

Alongside those:

- `visitorInTheWay` was asking whether a body was anywhere in the forward
  **half-plane**, which in a crowd is everybody walking beside you. It is a
  sixty-degree cone now, and it returns *which* body so the dodge can use it.
- The step round no longer always goes right. Always-right is correct for two
  people meeting head-on and turns a group of six into a slow carousel. It steps
  away from whichever side the obstruction is on, and keeps the old answer for
  dead ahead, where there is no side and both going right is what makes them
  pass.
- **A last resort.** Held up for six seconds, a resident drops its route and lays
  a new one from where it is standing. Waiting, stepping round and barging are
  all ways past something for a second or two; none of them help against
  scenery. **Six was measured.** At three and a half they gave up on routes
  faster than they could walk them, re-planned into each other, and the whole
  crowd wound down to zero moving inside seven minutes.

**Where it stands.** Over eight simulated minutes the count of residents that
travel in a thirty-second window dips to five and recovers to seven, and nothing
is ever touching. Before, it fell to four and stayed. It is **not** perfect: two
or three are stationary in any window, some of that legitimate dwelling and some
of it still cycling through blocked-and-retrying. If the owner reports it again,
ask **where**, and point the stepper at that spot rather than tuning thresholds.

### Furniture on a walking line stops the festival

The popcorn booth was moved in front of THE PALACE and landed on the route. The
link from `southJunction (9, -12)` to `palace (-35, -26)` crosses `x = -25` at
`z = -22.8`, which was inside the stall's collider — everyone bound for the
palace walked into it and never got past. **Before placing anything on open
ground, check it against `NAV_POINTS` and the links in that table.** A collider
in a corridor is indistinguishable from a broken crowd.

---

## 0a. The statue, and the rule that finally made it work

`src/world/GanganStatue.ts` — GANGAN in gold on a rearing horse, where the
rotating timetable used to stand. The timetable itself is not gone; it lives in
the festival pass, which is where anybody reads it.

It took four passes and the owner called it "a mess" twice. What fixed it was a
construction rule, not better numbers:

> **Pivot at the joint that does not move, and solve the rest.**

- The body pitches about the **hip**. The hind legs hang off the *root*, not the
  body, so they stay standing. Two earlier versions tipped the whole animal —
  first about its body, then about its hind feet — and both tipped the legs over
  with it, which is two slabs leaning at thirty degrees and not a horse standing
  on anything.
- The hock angle is **computed** from the segment lengths so the hoof lands on
  `PLINTH_TOP`. It was written down as a number once, with a comment claiming it
  landed on the stone; it was 0.27 under, because the working forgot the hoof
  hangs further down the shank than the shank's own length.

Three separate sign errors are worth naming, because they are the same mistake
each time — **a rotation about X moves the far end of a limb towards −Z**:

| Symptom | Cause |
| --- | --- |
| Horse's head pulled back into the rider | Neck rotation negative, leaning the neck backwards over the withers |
| One front leg missing entirely | Lift positive, throwing both legs up and **back into the barrel** |
| Raised arm poking through his own head | `rotation.z = -2.1` swings an arm on the *right* shoulder up and across to the left |

Orientation and placement: the statue is turned a quarter clockwise
(`rotation.y = -Math.PI / 2`) so the horse stands **across** the road. That is
the arrangement the painting uses — animal in profile, rider's shoulders turned
back out of that line towards the viewer — and a horse only reads as a horse side
on. It sits at `z = -6.2`; the asphalt roadway starts at `z = 2` and the plinth
is six deep once turned, so anything nearer the gate puts stone on grey.

`GANGAN_STATUE_SIZE` is square in plan on purpose: the projector compositor is
given that box, and a box that had to swap its sides with the statue would be a
second thing to keep in step.

`?review=statue` stands off it at a fixed angle and distance so one pass can be
compared with the last. `__festivalLookAt(x, z, distance, yaw, pitch)` does the
same for any point. `__festivalIntrusions()` lists every mesh whose box overlaps
the statue's — that is how the pale square through the sculpture was identified
as **the temple deity's halo**, which had never been parented to her and had been
standing in the middle of the main road since the temple was built. It is deleted
now, at the owner's instruction, not reparented.

---

## 0b. Avatar accessories

`src/world/AvatarAccessories.ts`. Four things to wear — cap, chain, arm tattoos,
backpack — each with its own colour, toggled at the gate or from the character
panel without leaving the square.

**One field carries both answers.** `AvatarPalette` gains four *optional*
strings: a colour means worn, absent means not. An older client that has never
heard of them sends none and wears none, and there is no second flag to fall out
of step with the first. `safePalette` in `server/index.mjs` passes them through
only when set.

**Nothing is measured by hand.** Two rigs are built here — the plain box figure
and the styled one — and they are not the same size; a cap sized for one sits
like a bucket on the other. Each piece is cut from the bounding box of the part
it goes on, read off the rig that has just been built. The plain rig's chest is a
single *scaled mesh* rather than a group, and hanging anything on a mesh inherits
its scale, so that rig passes the avatar's root as the anchor and supplies
`torsoBounds` instead.

**Everything is built whether or not it is worn**, and shown from the palette.
Rebuilding a body to put a hat on it means replacing a rig mid-walk-cycle, on
every other visitor's screen as well as this one. Remote bodies compare a
`wearing` signature and re-apply only when it changes.

**The chain took four attempts.** Worth reading before touching it:

1. Two long strands to a pendant near the navel — a great yellow chevron; read as
   webbing somebody had been strapped into.
2. Eleven links on a curve, each with its own three rotations — gold confetti,
   half of it inside the shirt, and worse the moment the body moved.
3. A flat rectangle on the shoulders — "a hoop, not a chain". A chain has to
   **hang**.
4. Current: a necklace. The back stays up at the neck, the front drapes onto the
   chest, links are all one size and turned only to follow the curve.

The constraint that matters: **neither rig has a neck.** The head sits straight
on the chest. The back of the chain rides in the band at the very top of the
torso — head above, nothing either side — which is the only place on these bodies
that something can pass round a neck without passing through a shoulder. Sized to
the head's half width *plus* the bar, so no part of it starts inside the body and
no pose can push it in.

`?review=fit` reports where each piece ended up along the body's own forward
axis. Front and back are the whole question for a chain and a pack, and a
screenshot of a figure eight pixels wide cannot answer it.

---

## 0c. Venue renames and the catalogue swap — and why a rename needs a deploy

The three theatres traded catalogues and two venues were renamed:

| Venue | Now shows | Called |
| --- | --- | --- |
| palace | TELEVISION | THE PALACE |
| drive-in | MUSIC VIDEO | DRIVE-IN 88 |
| shore | COMMERCIAL | THE SHORE |
| club | ORIGINALS | **SLAP AND POP** |
| rooftop | ORIGINALS | **NIMA ROOFTOP** |

The shop is **MASTER OF THE HOUSE** and its sign carries the drawn logo
(`src/assets/master-of-the-house.png`) instead of two lines of type.

**Publishing the client renames nothing** — remember this the next time a venue
is renamed, because it will look like the change simply did not work. Names and
catalogues are STAFF's, and what STAFF own lives in the service's saved state,
which beats any default in the code. Two halves:

- The three theatres migrate themselves. Their saved running orders list films
  from the catalogue they used to hold, none of which is allowed in the one they
  hold now, so `restoreSchedule` drops those rows and they come back on fresh
  defaults.
- The club and the deck kept their record box, so their rows survived with the
  old names inside them. `migrateVenues` rewrites those on the next start —
  **only where the saved name is still the old default**, because a name STAFF
  actually chose is theirs. Keyed on the persisted `version`, now 2.

The mapping lives in **two** places and they have to agree:
`programmeCategoryForVenue` in `server/index.mjs` and `venueForCategory` /
`catalogueByVenue` in `src/data/catalogue.ts`. A venue holding one catalogue in
one and another in the other is a programme board that disagrees with the screen
underneath it.

Confirmed applied on the live service on 2026-09-05.

---

## 0d. Smaller things from these sessions

**The jukebox's silence between records** was a missing wake-up, not a delay. The
running order only ever moved inside a broadcast, and nothing asked for a
broadcast when a record ran out — so the next one waited for whatever came along
next, at worst the ten-second heartbeat. One timer, armed when the record changes
and re-armed when a client reports the real length. Ordering is quicker too: the
POST reply already carried the running order and the page was throwing it away to
wait for the same news to come round again.

**MENTOR came apart when somebody holding it dropped off.** A carried dog is
parented *inside* the carrier's body, and the sweep that tears down a departing
visitor walks the whole subtree disposing every material and geometry it finds.
It found the dog — all fifteen meshes. Which parts came back was down to what the
renderer happened to re-upload, which is why it read as "the body disappeared,
the feet were still there". What a leaving visitor is carrying is lifted out and
stood on the floor before the sweep runs. `?review=mentor-remote-drop` stages it;
`__festivalDispose(false)` runs the old teardown and names every mesh it
destroys.

While in there, the three ways of letting go were saying three different things —
one kept the carrier's whole world rotation, one planted the dog at a fixed
height rather than on the floor underneath it, none reset the carried pose. They
all call `standMentorOnGround` now.

**Sunset was darker than the middle of the night.** The trough sits between
minute 20 and 30 of the cycle: the sun falls from 2.2 to 1.1 while the fill was at
its own low of 0.86 and the lamps had not come up, so nothing held the scene
during the handover. Fill and lamps now rise as the sun drops. Minutes 0 and 60
are the same instant and had been given different fills, so the cycle stepped
every time it wrapped.

**The beach couple** (`src/world/BeachCouple.ts`) are an easter egg east of the
drive-in: not residents, not in the attendee list, not in STAFF, nothing reaching
the service. Two coplanar-face bugs were found in them, and both are the same
lesson — **a face sharing a plane with another face is what a depth buffer
flickers between**. The towel stripes sat exactly on the towel's top; the hair
block's front face was on 0.34, the same plane as the front of the head, to the
millimetre.

**Colour swatches are square again.** Safari draws `input[type=color]` as a
rounded pill however the element is sized; at 32×32 that read as a rounded square
and passed, but a wide swatch became an oval on the phone. Killing the native
appearance and squaring `::-webkit-color-swatch` settles it.

---

## 0-prev. Eye height, one worn look — and an NPC claim that was wrong

### The VR view really was shorter than everybody

`AVATAR_EYE_OFFSET` was **2.62**. Measured against the rig it should be **2.84**:
the head pivots at 2.47 and the two eye blocks sit 0.37 above that. A fifth of a
unit, and very visible — standing in a crowd the view came up at everyone else's
chin, which is exactly how the owner described it. **If the head or the face ever
moves, this moves with it.**

### Residents never saw each other coming

`visitorInTheWay()` checked the player and the remote avatars and **not the other
NPCs**. The dodge below it was written for two of them meeting head-on — each
goes round to its right, which for a pair is opposite ways — but nothing ever set
`givingWay` for another resident, so that path only opened once `npcCollides`
refused a step. By then they are already touching, the sidestep is often blocked
too, and both fall through to waiting. That is the knot.

They anticipate each other now. **Deliberately no tiebreak on who yields**: both
stepping right is what makes a head-on pass work, and letting only one give way
would leave the other still walking into it. The `stuckFor > 1.2` escape still
stops a crowd yielding itself to a standstill.

> **This section reported the crowd as fixed, and it was not.** Anticipation was
> necessary and nowhere near sufficient — two numbers five centimetres apart were
> holding the pile together underneath it, and the owner reported the same fault
> twice more afterwards. Section 0 has the whole account. Do not read the
> paragraph above as a finished story.

> Also stale: "always right" is no longer how the step round chooses its side.

## 0-prev. Game controllers reach the menus now

The section below says the pad is **world only** and that menus stay with the
pointer. That was the owner's decision at the time and they reversed it. START
opens and closes the pass, the D-pad and the left stick move a highlight, A
confirms and B steps back out — panel to pass, pass to world. It is real DOM
focus with a painted ring, because `:focus-visible` does not fire for a focus
nothing clicked.

### One worn look, not two

**The default is now exactly `?era=ps2`.** Stripping it back to "grain only" was
the wrong read, twice, and the reason is in the shader: the surface variation is
added and *then* quantised, so **the dither is what crunches a smooth speckle
into hard specks**. At `wornSteps: 64` there is nothing to crunch it and the same
grain value reads as a soft wash — the difference the owner could see and I kept
explaining away. The courses carry the rest: a wall visibly made of something at
the scale of a hand.

Defaults are `steps 10, grain 1, warp 1, texture 1.25`. Every dial is still a URL
parameter and `?worn=0` still turns it off.

### Controls panel

Folded into `<details>` sections the way `staffSection()` does it, with the open
set remembered — the panel re-renders on every rebind, and a section that closed
itself would take the row being edited with it. There is a reset to defaults,
disabled until something has actually been changed.

## 0-prev. Game controllers

`src/world/GamepadInput.ts` polls the browser's Gamepad API. **Left stick walks,
right stick looks**, and nine actions sit on buttons. Deliberately **world only**
— menus stay with the pointer, which is the owner's decision and is why there is
no focus model in here.

### How it reaches the world

The look stick is converted into the same delta a pointer drag produces and
pushed through `applyLookDelta`, which was split out of `cameraPointerMove` for
exactly this. That matters: the VR preview, the seated screening camera and the
two orbits all clamp differently, and a second copy of those branches would drift
out of step the first time one of them changed. The stick therefore obeys the
visitor's sensitivity setting for free. Multiplied by `delta`, so a slow frame
does not turn further than a fast one.

Buttons call the same `…FromTouch()` entry points the phone's ring uses. Photo
mode is the exception — it belongs to the interface, so the world emits a
`photoMode` action the way a seat emits `vrWatch`.

Skipped entirely during an immersive session: a headset has its own controllers
and `updateXrInput` already reads them.

### Details worth keeping

- **The indices are standard, the labels are not.** `buttonLabel()` prints Xbox
  and PlayStation names — a panel that says "button 2" to somebody holding a
  DualSense has told them nothing. Family is sniffed from `gamepad.id`.
- **A radial deadzone, squared.** Per-axis leaks diagonals at the corners, and
  without the curve the first movement past the threshold is a jump to eighteen
  per cent rather than a nudge.
- **A pad already held at page load never fires `gamepadconnected`**, so `pad()`
  falls back to whatever `getGamepads()` lists.
- **A browser will not list a pad until a button is pressed on it.** The panel
  says so rather than looking broken.
- Rebinding takes the *next* press instead of acting on it, and steals the
  button from whatever held it, so nothing can end up bound twice.

### The controls panel

Grouped by what you are holding: keyboard, mouse, touchscreen, game controller,
VR headset. Quest Touch is listed always, on the owner's instruction, even where
nobody can use it. The controller rows carry their own rebind button, disabled
until a pad is actually connected.

**Verified with a synthetic pad** — `navigator.getGamepads` stubbed: left stick
walked the avatar, right stick turned the camera 0.524 rad, the run trigger
visibly lengthened the stride, and the panel rendered five groups, 34 rows and
nine rebind buttons correctly disabled with no pad present. **Not verified with
real hardware**; deadzone feel, stick curve and which button lands where need
the owner's own pad.

## 0-prev. The grain moved into the shader

The owner asked for this texture a **third** time, pointing at `?era=ps2` and
calling the CSS overlay standing in for it faded and wrong. They were right
about the overlay, and the reason is worth keeping: **a full-screen noise layer
slides over the picture, while `WornStyle`'s grain is sampled at the world
position** — the speckle belongs to the wall and travels with it when you walk
past. That is the whole difference between grain and a dirty screen, and no
amount of tuning opacity, blend mode, octaves or tile size on an overlay was
ever going to close it. Two passes were spent finding that out.

**The surface grain is on by default now.** Grain only:

| dial | default | `?era=ps2` | why |
| --- | --- | --- | --- |
| `wornSteps` | **64** | 10 | no colour banding — the palette is untouched |
| `wornGrain` | **2** | 1 | the contrast the owner asked for |
| `wornWarp` | **0** | 1 | no corner rounded, **no collider moved** |
| `wornTexture` | **0** | 1.25 | no courses or paving painted on |

So the world's shape and palette are exactly what they were; it gains a tooth.
`?era=ps2` still brings the whole period look, banding and all, and every dial is
still a URL parameter — `?worn=0` turns it off.

**Normal graphics only.** It runs on every lit surface, and lite mode exists to
stop paying for passes like it. `setWornCheap()` already follows the graphics
mode for the octave count.

The CSS `.world-grain` overlay stays, at **opacity .1**, purely so the sky and
the screening panels — which have no geometry to grain — are not the one clean
thing in frame. It is no longer the effect.

## 0-prev. Grain that looks like film, and shorter presence lag

### Grain, second pass

Reported as too heavy and not film-like. Three things fixed it, and the *blend
mode is not one of them* — that was last pass:

- **`numOctaves='1'`.** The extra octaves add low-frequency components, and those
  are what clump noise into blotches. Real grain is uniform.
- **`baseFrequency='1.6'` against a 160px tile.** Particles land at about a
  pixel, which is where film grain sits.
- **`feColorMatrix type='saturate' values='0'`.** `feTurbulence` produces
  *coloured* noise, and coloured speckle is the single thing that most says
  "sensor" rather than "emulsion".

Opacity .22, and the shift runs at eight steps over .4s — twenty jumps a second
rather than five, because grain resolves anew every frame of film and anything
slower reads as a pulsing overlay. Eight offsets, not four: with four the eye
starts to recognise the cycle.

### Why other visitors looked behind

Three delays stacked, and the fix takes something off each:

| | was | now |
| --- | --- | --- |
| sender's presence throttle | 220ms flat | **140ms while moving**, 220 otherwise |
| server broadcast batch | 50ms | unchanged |
| receiver's playback buffer | one full measured interval, capped at 600ms | **0.8 of it**, capped at 400ms |

That last one is the subtle one. `updateRemoteAvatars` replays previous → target
across the whole expected interval, which buys perfectly smooth motion at the
price of always rendering a body one full interval behind where its owner said
it was. Finishing early arrives sooner and costs a short hold before the next
update, which is much harder to see than the delay was.

**What not to do instead:** ease toward the latest position. There is a comment
in the file about this and it is right — everyone sprints to their last known
spot and stops dead, nearly three units of stutter per step at a run.

Idle visitors cost nothing extra: the identical-payload rule already holds a
still body to one post every three seconds, so the faster rate only applies to
somebody actually walking.

**This is reasoned tuning, not a measurement.** Two browsers against the live
service is the only way to judge it, and that needs the owner.

## 0-prev. Grain that shows, and one honest number

### Soft-light grain over a dark world is invisible

The grain was shipped at `mix-blend-mode: soft-light` and reported as missing.
It was there, sized, painting, at full opacity — and doing **nothing**, because
soft-light leaves dark pixels almost exactly where it finds them and this world
is dark. `screen` at .5 instead: it adds light, so the noise lands as bright
specks over the shadows, the way grain does on a dark print. Obvious on screen
now.

**Two numbers to tune it**, not one: the element's `opacity`, and the `opacity`
on the `<rect>` inside the SVG noise. The blend mode decides whether either does
anything at all.

Still off in lite mode, and the shell's `data-world-quality` is what switches it.

### The sensitivity is one number with nothing behind it

`VR_COMFORT` is gone. A setting that reads 20% and behaves like 12% in the place
the visitor cares most about is not a setting anybody can reason with, and the
sentence explaining the discount went the same way at the owner's request. The
gentleness lives in the **default of 0.2** instead. Range is 0.1–2.

**This is a global default, and it is very slow on purpose.** At 20% a 160px
drag turns the flat world about 7.7° — a half-turn takes most of a screen width
of dragging. That is the owner's explicit choice, made after dizziness reports;
do not quietly raise it.

### `localhost` and `127.0.0.1` are different origins

Three separate measurements in this session were confounded by clearing
`localStorage` on one and loading the world from the other. `preview_start`
opens `localhost:5173`; the review fixtures are documented against `127.0.0.1`.
**Clear storage on the origin you are about to load**, or a stale slider value
will look like a bug in the code that reads it.

## 0-prev. The sensitivity reaches the head, the skew is gone

### Why the slider "still did nothing"

Because the visitor had **head tracking on**, and the head was what was moving
the camera — the one input the slider deliberately did not touch. The reasoning
for leaving it out was that head tracking maps a real movement of the body onto
the same movement of the view and scaling that makes the picture disagree with
the inner ear. **That reasoning was wrong here:** head tracking is not one to
one. It is amplified four times over, because a webcam only sees about
thirty-five degrees of turn, and that amplification is exactly what "camera
speed" means to somebody using it.

`HEAD_YAW_GAIN` and `HEAD_PITCH_GAIN` are scaled by `lookSensitivity` now.
Measured, for a 20° head turn: rig yaw 0.404 / 1.348 / 2.697 at 30% / 100% /
200% — linear, exact. The **phone gyroscope** is still left alone, and that one
really is one to one.

### The screening frames no longer drift

The off-axis frustum is **removed**. `applyHeadCoupledView()` now only moves the
eye; it no longer rebuilds the projection around it.

The screening panels are CSS3D, and `CSS3DRenderer` builds its transform from
the projection's vertical scale plus CSS `perspective()`, which is always
centred — an off-centre frustum cannot be expressed in it at all. So WebGL drew
the world skewed and the video unskewed, and the picture slid inside its own
frame whenever anybody leaned. Measured before: ∓0.126 of skew for a
ten-centimetre lean. Measured after: `frustumSkew [0, 0]` while leaning, with
the camera still moving (`camPos.x` 1.152 for the same lean), so the parallax —
the larger half of the effect — is untouched and CSS3D follows it exactly.

**If the pinned-window effect is ever wanted back**, it needs `perspective-origin`
on the CSS3D layer moved to the same principal point *and* the layer's content
shifted with it. Do not attempt it without `__festivalProjectors()` open.

### The world has never had film grain

`.world-vignette` shared the gate's grain rule and then overrode
`background-image` with its gradient one line later, so the noise was shadowed
from the world's very first commit. `.world-grain` is its own element now,
because the two want different blending — grain is soft-light over the picture,
the vignette is a plain darkening of the corners, and one element cannot be
both. Inset −60px so the stepped shift never exposes an edge, and off in lite
mode.

The shell carries `data-world-quality`, **not** `data-graphics`: the latter is
already the gate's own button selector and putting it on a `<section>` would
hand that element to the button wiring.

### Remembering the tracker

`Remember on this computer` — off by default, stored per browser, and the panel
states which of the two bargains it is in either way. On, the fetches use
`cache: 'default'` and a second visit is quick; off, they stay `no-store` and
every visit downloads about 7MB. The promise that nothing is written to a
visitor's machine is only worth making if it is also visibly withdrawn when they
choose otherwise.

## 0-prev. One sensitivity for every camera

### The slider was reported as doing nothing, and it was nearly true

It scaled the **VR drag only**. Every other path — the follow and perspective
orbits, the seated screening camera — had the rate hard-coded, so a visitor who
moved it and dragged saw no change at all. Worse in VR, where the settings panel
covers the canvas the drag would have to land on.

`lookSensitivity` now scales **every drag-to-look path**, and VR carries a
`VR_COMFORT = 0.6` factor of its own on top, so a headset stays gentler than the
flat world at the same setting. Verified outside VR: the same drag turns
−0.755 rad at 100% and −0.123 at 30%.

The stored key went to **v2** deliberately. v1 meant a VR-only multiplier that
defaulted to 0.6; carrying that number into a setting that now scales every
camera would have quietly slowed the whole world for anyone who had touched it.
Default is 1 — the rate the world was built around.

**A control named CAMERA SETTING has to move the camera wherever the visitor is
pointing at it.** That is the lesson, not the arithmetic.

### Settings panels are grouped now

`.setting-group` — a red rule-off heading, a rule between groups, real margins,
and prose capped at 62ch. The camera panel was a stack of controls butted
together in the top-left of a very large sheet. A panel with space to spend
reads worse for hoarding it.

### The download: parallel, early, and still dominated by one file

All four files are fetched **at once** rather than in sequence — the 3.5MB model
no longer waits on the 3MB runtime, which waited on a 44kB library. Opening the
panel starts the fetch, so reading time is not dead time.

Measured after: all four begin at the same instant, and the wasm alone still
takes 95s **in the review pane**, which throttles background tabs — so the total
is the biggest single file and nothing else. Parallelism is right and helps a
real connection; it cannot beat one 3MB download.

**The only thing that would truly make it fast is letting the browser keep it**,
which is exactly what the no-store guarantee forbids. That is the owner's call,
not a bug. Asked; unanswered.

## 0-prev. Head tracking "stuck", and what it really was

Reported as stuck on `正在載入追蹤模型…`. Measured here: the load **completes**,
in **71.7 seconds**, over the blob path, with no error anywhere. The three-
megabyte runtime is simply slow, and a minute of an unchanging label is
indistinguishable from broken.

So the fixes are about the wait, not about a crash:

- **The label says how long.** "LOADING THE TRACKER — THIS CAN TAKE A MINUTE",
  and the readout names which of the four steps it is on, so it visibly moves.
- **Nothing waits for ever.** Every fetch has a deadline and every build has one,
  so a load that truly hangs ends with a message naming the stage instead of a
  frozen panel. `start()` resets its own guard in a `finally`, so the button
  works again afterwards — before, one hung load bricked it for the visit.
- **`FETCH_TIMEOUT_MS` is 120s on purpose.** The first attempt at this was 40s,
  which would have killed the 71-second load above. **Do not tighten it**: the
  complaint is a load that never ends, not one that takes a while, and cutting
  off a slow connection punishes exactly the machines least able to spare it.
- **A fallback for a genuinely broken runtime path.** The loader script is handed
  over as a blob so nothing reaches the disk; Emscripten works out where to find
  its own files from where that script came, and a blob URL resolves to nothing
  useful — on some browsers it waits rather than failing. If the build times out,
  it retries once through `FilesetResolver.forVisionTasks` on real URLs. That
  lets the browser cache the runtime, which the panel promised it would not, so
  `runtimeCached` is recorded and shown. The model — the larger half — still goes
  in as a verified buffer either way.

**A byte-counting progress readout was built and taken out again.** Reading the
body chunk by chunk to measure it slowed the same 3MB download from ~20s to
**85s**, and the number was wrong regardless: the reader sees the decompressed
size (15.25MB) against a compressed total (~7MB). The stage costs nothing and
answers the same question. Do not re-add it.

## 0-prev. VR look sensitivity, and an unfinished drift hunt

### The camera panel

`panelLabels.graphics` is **CAMERA SETTING / 鏡頭設定** now. The gate's own
`fieldset` legend still says GRAPHICS / 畫質 and should: that one really is a
picture-quality choice, and it is a different copy key (`copy[lang].graphics`).

It carries a **VR look sensitivity** slider, 0.3–2, stored per browser, and the
default is **0.6** — visitors were feeling ill, so the shipped setting is gentler
than what they had rather than the same with a knob beside it. Verified exact:
the same drag turns 0.403 rad at 60% and 1.344 rad at 200%.

It scales the VR **drag** only. It is deliberately **not** applied to the phone's
gyroscope or to head tracking: those map a real movement of the body onto the
same movement of the view, and scaling that is what makes a picture disagree with
the inner ear rather than agree with it. If someone reports head tracking itself
as sickening, that is a different knob and it needs saying so.

### Screens shifting in VR — half diagnosed, not fixed

Reported twice. `projectorAlignmentSnapshot()` — `__festivalProjectors()` on any
loopback page — projects each screen's four corners into page pixels and sets
that box against the panel's own rectangle.

**Outside VR and in a simulated session it reports zero drift**, so the ordinary
path is sound. Note the probe's first version compared a projected *centre*
against a bounding *box*, which perspective makes disagree by ~80px with nothing
wrong; corners against corners.

**What is confirmed:** with head tracking on, leaning moves the projection
matrix's off-centre terms to ∓0.126. CSS3DRenderer builds its transform from the
vertical scale plus CSS `perspective()`, which is always centred — **it cannot
express an off-centre frustum**. So WebGL draws the world skewed and the video
panel unskewed, and the picture slides inside its frame exactly when a visitor
leans. That is ours, introduced with the window-parallax effect.

**What is not:** the owner sees it on **mobile too**, where there is no head
tracking and no skew. That half is unreproduced. Do not claim this fixed.

Options for the confirmed half, in the order worth trying: compensate with
`perspective-origin` on the CSS3D layer (the skew terms are exactly the shift, in
NDC); or drop the off-axis frustum and keep only the camera translation, which
loses the window pinning but keeps a strong parallax and makes the projection
symmetric again.

## 0-prev. The 2026-09-04 session

Everything below was confirmed working by the owner on 2026-09-04. Ten separate
passes are folded into one section here; what is kept is what a later session
would be sorry not to know.

### Phone VR follows the gyroscope one for one

The fused sensor pose was being rebased against the **whole** calibration
quaternion (`pose · reference⁻¹`). Pitch and roll come from gravity and are
absolute — there is nothing in them to rebase — so subtracting them meant the
phone's tilt never reached the picture (measured: pitch and roll read `0.00` at
every attitude) and **tipping the phone 30° toward the floor moved the view 28.9°
up**. Only the heading is rebased now, by one constant world yaw applied *before*
the device pose:

```
camera = Ryaw(entryHeading − calibrationHeading) · devicePose
```

`devicePose` is three.js's own `DeviceOrientationControls` composition,
unchanged. Because the correction is a pure world yaw applied before it, the
sensor's axes are never skewed: measured, `alpha ±30/90/180` moves the heading by
exactly that, with pitch and roll unchanged to the hundredth. The per-frame
`slerp` is gone — the OS has already fused these poses and a second easing layer
only made the picture trail the phone. `xrRig.rotation.y` is held at 0 while the
sensor drives, because the heading correction is already inside the target.

Turning the phone to landscape does **not** reset the reference. The
`screenAngle` term is that compensation; resetting on top of it threw the
heading away.

`CALIBRATE MOTION` / `RECENTER VIEW` re-reads the heading only, so pitch and roll
survive it. A phone's heading is the one part of its pose with no fixed meaning —
relative and drifting on iOS, magnetometer-corrected and jumpy on Android — so
this is the visitor's handle on that, and it cannot knock the horizon over.

### `camera.position` is not where the camera is, in VR

`xrRig.add(this.camera)` runs at construction, so the camera is **always** a
child of the rig. Outside VR the rig sits at the origin and the two agree. Inside
VR the rig carries the whole walk while the camera sits at the origin of it — so
every `this.camera.position` read measures from the middle of the map. That put
each screen's range, its facing-side test and the water's camera uniform in the
wrong place the moment VR was entered; The Rooftop's screen, at z = +19.9 and
watched from the south, could never pass `cameraOnViewingSide` at all. Those
reads use `camera.getWorldPosition(this.cameraWorldPosition)`. **Anything new
that measures from the eye must do the same.**

The same confusion caused the jump bug: the rig was placed at
`groundHeightAt(...)`, the floor **under** the visitor. Standing, that agrees with
`player.position.y`; in the air it does not, and the difference *is* the jump — so
the avatar rose and the view did not, on desk, phone and headset alike. It reads
`player.position.y - AVATAR_GROUND_Y` now, which also puts the eye on the
waterline while swimming. Measured: eye 2.90 → 3.80 → 2.90 across the arc, with
`eyeY - playerY` pinned at 2.62 throughout. **Whenever something in VR looks
pinned, check whether it is reading the ground instead of the body.**

### Leaving VR is never a one-way door

`vrResumePending` is what puts `RESUME VR` on screen and is the only route back
in — the VR checkbox lives at the sign-in gate, on the far side of a session the
visitor is in the middle of. Both exits set it: `EXIT VR PREVIEW` **and**
`STAY IN BROWSER`. Resuming re-opts into VR so the rest of the interface does not
go on believing they left. `RESUME VR` and `EXIT VR PREVIEW` are never on screen
together, so they share one corner rule at all three breakpoints.

### The square's record comes back after a screening

Every jukebox frame is built **muted** — the only way a phone lets one start —
and `DROP THE BEAT` exists to ask for the unmute with a real tap. That prompt was
latched shut by a flag set the first time it was pressed, and **the flag outlived
the player it was pressed for**: walking into a venue destroys the frame, walking
out builds a new one needing the same permission, and the only control that could
ask had been retired for the visit.

The prompt now follows the player's own report — `infoDelivery` carries `muted`
and `volume` on the same channel as the length the service already reads:

```
hidden = no record on || sound not wanted || the player says it is audible
```

It follows reality in both directions and never appears on a desk, where the
load-handler unmute is granted. **An empty queue is not this bug**: a record ends
on the service's clock, and with nothing waiting the square is genuinely quiet.
`data-jukeboxReview` reports `nowPlaying` first for that reason.

### Residents swim

Only a body the visitor was *steering* had ever floated; a resident on its own —
following or on its route — was pinned to `groundHeightAt()`. `SWIM_Z = -60` is
one constant shared with the visitor's own `shouldSwim`, so owner and dog start
swimming on the same step. `poseNpcSwimming()` runs **after** the walk cycle,
which writes every leg it overwrites, and its roll is cleared on land because
nothing else writes that axis.

`MENTOR_SWIM_Y = -0.72` is measured, not eyeballed: the sea's surface is at
**0.14** and the dog's body block runs 0.39–1.09 above its own root, so this puts
about 71% of the body under with the collar and the top of the back clear. The
human swims at 74% by the same measure. A first attempt sank it half a unit from
standing, which left the belly exactly on the surface — legs under, everything
else above, still walking.

**Anything that floats should be derived from 0.14.** The water is translucent
with `depthWrite: false`, so a submerged body still shows through it — do not
read "I can see its legs" as "it is not in the water".

### Webcam head tracking

Shipped, not behind a flag; `?headtrack=off` is the way out, because this reaches
for a camera and a ~7MB download and a browser that misbehaves at either should
be switchable off without a deploy.

A webcam loses a face around 35° of turn, so head angle cannot drive view angle
one for one — that would be a 60° cone and nothing beyond it. The head does two
jobs:

- **Position is the window.** Leaning moves the eye *and rebuilds the frustum
  around it*, so the screen's own rectangle stays pinned in the world. That
  second half is the whole effect: without it, leaning left swings the scene
  rather than revealing what was behind the left edge.
- **Rotation is amplified.** `HEAD_YAW_GAIN = 4`, `HEAD_PITCH_GAIN = 2.6`,
  `HEAD_PARALLAX_UNITS_PER_METRE = 12`. The owner confirmed these feel right.

Mouse drag still owns the gross turn. **Roll is deliberately dropped** — tilting
your head at a monitor does not tilt the room.

**Two of the four axes are mirrored, and that is not a bug.** The lens looks *at*
the face rather than out with it, so the axes along its line — pitch and depth —
arrive reversed, while the two across it do not. Both are corrected in
`applyMatrix()`, which is the only place any of these signs live.

Unlike a phone's gyroscope, this one **wants** smoothing: that was a fused,
filtered pose to be applied whole; this is a guess made from pixels thirty times
a second, and easing is the difference between a window and a shiver.

**Desk only**, gated on `(min-width: 781px) and (hover: hover) and (pointer:
fine)` — the exact breakpoint the interface switches on, so the touch controls
showing and head tracking being offered can never both be true. Re-checked from
the world's own tick, because a `matchMedia` listener did not fire under a
viewport change during review. The panel's title row folds it away entirely.

### The tracker never touches the disk

All four files are fetched with `cache: 'no-store'` and held only in the tab's
memory. Three things were needed to make that true rather than nearly true:

- the library is `import()`ed **from a blob URL** — an `import()` of a real URL is
  cached like any other script;
- the runtime is handed over as explicit `wasmLoaderPath` / `wasmBinaryPath` blob
  URLs, not through `FilesetResolver.forVisionTasks`, which fetches by URL itself;
- the model goes in as `modelAssetBuffer`, not `modelAssetPath`, which the runtime
  would fetch and cache the ordinary way.

Held for the life of the page rather than the session, so leaving VR and going
back in does not fetch it twice; `release()` drops it, and `FestivalWorld.stop()`
calls it.

**It is ~7MB over the wire, not 15.** 2.98MB of runtime and 3.58MB of model, both
compressed in transit; the 11.7MB figure is the *uncompressed* wasm. Measure
`transferSize`, or `curl --compressed`, not the file at the far end.

**Pin versions against the registry, not against memory.** The first published
attempt used `@mediapipe/tasks-vision@0.10.22`, which does not exist — the package
left the `0.10.x` line for `1.0.x` — and the owner's first press produced a 404.

### Security pass

**The code is weighed before it runs.** Head tracking executes third-party
JavaScript beside an open camera, and a pinned version is not protection: a
compromised CDN or hijacked package would be a webcam in a stranger's hands, on a
page whose own panel promises the video never leaves the machine. All four files
are checked against a recorded SHA-256 before anything is decoded or executed.
`<script integrity>` cannot reach any of this — none of it arrives through a
script tag — but the bytes are already fetched by hand for the no-store
guarantee, so they can be weighed on the way past. Verified in both directions,
including that a wrong digest refuses. Regenerate with:

```bash
curl -s --compressed -L <url> | openssl dgst -sha256 -binary | openssl base64 -A
```

A mismatch means the file changed. **Do not paper over it by updating the digest
without knowing why it moved.**

Also fixed: head tracking refuses to run inside a frame (a page that frames this
one can overlay the panel and steal the click that opens a camera), the service
sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`, `projectorMessage`
compares exact origins instead of `includes('youtube.com')` — true of
`youtube.com.example.net`, which anybody can register — `serveStatic`'s escape
check gained the separator it needed, and `Permissions-Policy` became
`camera=(self)` rather than `camera=()`, which would have broken head tracking on
the service-hosted copy and nowhere else.

**Checked and sound:** the staff key is compared with `timingSafeEqual`, sent as a
header, kept in `sessionStorage`, absent from the bundle, and **fails closed** when
unset in production. Chat escapes author and body. The store link is validated to
http/https on the service *and* again in the client. CORS is an allowlist that
refuses unknown origins, and every authenticated route needs a custom header, so a
cross-site post cannot reach one. Bodies are capped at 16kB, chat is rate-limited,
`MAX_VISITORS` bounds the rest.

This was a code review, not a penetration test of the running service.

### What the fixtures learned

- `?review=mentor-swim` puts the visitor and a loyal MENTOR past the beach. It
  **feeds** the dog rather than assigning the follower, because the service owns
  `mentorFollower` and reconciles an assigned one away within the second — which
  is why `?review=mentor-follow` had been reporting an empty object and measuring
  nothing. Both MENTOR fixtures stage against the visitor's **real** id, not the
  literal `'review-self'`.
- `?review=headtrack` exposes `__festivalHeadTrack([pose])` and
  `__festivalHeadTrackLoad()`. It settles the easing and applies the view
  **synchronously**, because a review browser runs the page in a hidden tab where
  **timers are clamped to about one a second** — waiting for convergence over real
  frames turns a nine-pose sweep into a minute of nothing. Copy this for any
  fixture that steps through states.
- `window.__festivalMentor()` and `document.documentElement.dataset.jukeboxReview`
  report from **every** loopback page, not just their own fixture. Reach for those
  before staging anything.
- **An author `display` outranks the browser's rule for the `hidden` attribute.**
  `.head-track label { display: grid }` kept an empty camera picker on screen with
  `hidden` set. Third time this trap has cost a session: when an element will not
  hide, check for an author `display` before anything else.

---

## 0a. Desktop VR exit control right edge

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

## 0b. Desktop VR exit control vertical alignment

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

## 0c. Desktop VR eye height and live YouTube published

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

## 0d. Desktop VR access published

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

## 0e. VR option visible on every gate, published

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

## 0f. Quest/WebXR beta published

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

## 0g. All-avatar foreground follow-up published

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
must pass first. There are **43 server tests**; they all pass with the current working tree.

`git diff --cached --check` will flag trailing whitespace inside a regenerated
`three-*.js` chunk. That is minified GLSL, not hand-written code — run the check
with `-- . ':(exclude)docs/beta/assets/three-*.js'` and read the rest of it. When
a rebuild produces a three chunk that differs only in whitespace under an
unchanged filename hash, leave the committed one alone rather than adding a
four-thousand-line no-op diff.

Three related traps, all of which have cost hours:

- **GitHub Pages caches `index.html` for 600s.** After a push, a browser can hold the
  old `index.html` pointing at the previous hashed bundle. When the owner says "your
  fix didn't work", check the shipped bundle actually contains the change before
  touching code.
- **`docs/beta` keeps old asset files.** `ls docs/beta/assets/*.css | head -1` tells you
  nothing. Always resolve the bundle actually referenced by `docs/beta/index.html`.
- **Confirm the publish landed, do not assume it.** Poll the live URL until it
  serves the new bundle, then grep the served asset for the change itself:

  ```bash
  until curl -s "https://myscheduleltd.com/beta/index.html?cb=$(date +%s%N)" \
    | grep -q '<new-bundle>.js'; do sleep 15; done
  curl -s "https://myscheduleltd.com/beta/assets/<new-bundle>.js" | grep -c '<the change>'
  ```

  Propagation runs from under a minute to several. The custom domain is
  **myscheduleltd.com** — `CNAME` says so; `myschedule.co` does not resolve.

---

## 2. Layout

| Path | What it is |
| --- | --- |
| `world/src/world/FestivalWorld.ts` | The whole three.js world. ~11k lines. Geometry, colliders, NPCs, camera, projectors, interaction prompts, VR sessions and the phone's motion camera. |
| `world/src/world/HeadTracking.ts` | Webcam head tracking for the desktop VR preview: the camera, the model, and the smoothed pose. `FestivalWorld` only consumes it. **Every axis sign and every integrity digest lives here.** |
| `world/src/ui/App.ts` | All DOM/UI. Gate, panels, chat, staff tools, jukebox player, touch controls. |
| `world/src/style.css` | All styling, including every mobile/landscape rule. |
| `world/server/index.mjs` | Zero-dependency Node service. SSE presence, chat, seats, punches, jukebox, programme clock, staff admin. |
| `world/server/server.test.mjs` | 43 tests. Run with `npm test`. |
| `world/scripts/publish-beta.mjs` | Copies the Vite build into `docs/beta`. |

Deployment: **Pages** serves `docs/` at **myscheduleltd.com** (see `CNAME`).
**Render** runs `world/server/index.mjs`, **by hand** — pushing to main ships the
static beta and nothing else, so any change under `world/server/` is live only
after the owner deploys it from the Render dashboard. Say so plainly when a
change is split across the two.

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

**The part that costs whole sessions**: a reading taken from a frozen world comes
back as a plausible number, not as an error. Three separate crowd measurements
were reported as evidence before anyone noticed the world had not moved between
samples. If you are measuring anything that changes *over time*, either drive it
yourself from a fixture (see `__festivalStep` in §0) or check that time actually
passed — `requestAnimationFrame` tick count, or the world clock in the HUD.

**Corollaries.** Measure geometry and computed styles, not animated values. Prefer a
review fixture over driving the avatar. And when a UI element is invisible, check both
CSS `display` **and** the `hidden` attribute — a whole session was lost moving a prompt
around the stylesheet when one line of JavaScript was setting `hidden` on it.

### Review fixtures

`?review=<name>` on `127.0.0.1` only. Several expose `window.__festivalReview()`.

```
gate  gate-approach  temple  temple-altar  jukebox  jukebox-sound  perf
club  club-dj  club-lobby  club-bar
rooftop  rooftop-dj
mentor  mentor-carry  mentor-npc-carry  mentor-follow  mentor-follow-greeting  mentor-swim
mentor-drop  mentor-remote-drop
npc-control  npc-popcorn-seat  nav
quests  quests-complete  fireworks  menu-ownership  menu
statue  fit
vr-gate  vr-entry  vr-phone  vr-screen  vr-youtube  headtrack
```

The newer ones, and what each answers:

| Target | Hooks | Answers |
| --- | --- | --- |
| `nav` | `__festivalStep(seconds)`, `__festivalGaps()`, `__festivalResidents()`, `__festivalCrowding()` | Does the crowd walk, and does it pile up — **without needing the render loop**. Read §0 before trusting anything else about the crowd. |
| `statue` | `__festivalStatue(distance, yaw, pitch)`, `__festivalLookAt(x, z, …)`, `__festivalIntrusions()` | How the sculpture reads from a repeatable angle, and what is overlapping it. `__festivalLookAt` works for any point in the world. |
| `fit` | `__festivalFit()`, `__festivalWear(slot, colour?)` | Where each accessory sits along the body's own forward axis, on either rig. |
| `menu` | `__festivalMenuNav(nav)` | Controller menu navigation without a controller — the pad half is polled from the render loop, which a suspended page never runs. |
| `mentor-remote-drop` | `__festivalDrop(x, z, yaw)`, `__festivalDispose(rescue)` | A remote carrier holding the dog and then being torn down. `__festivalDispose(false)` runs the *old* teardown and names every mesh it destroys. |

**Note the name collision that nearly happened**: `mentor-drop` already existed.
The new one is `mentor-remote-drop`. The `?review=` chain is a run of `else if`,
so a duplicate silently shadows whichever comes later — **grep the chain before
adding a target.**

Two of these report from anywhere on loopback rather than from their own page:
`window.__festivalMentor()` (where MENTOR is, and whether it is swimming) and
`document.documentElement.dataset.jukeboxReview` (every input the record's fate
depends on). Reach for those before staging a fixture at all.

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
| **Jukebox audio on iOS** | A tap-for-sound button exists because a gesture in the parent page does not grant a cross-origin YouTube iframe permission to play. It is now driven by what the player reports about itself rather than by a latch, so it returns whenever the square actually goes quiet. Still unconfirmed on the owner's own phone. |
| **Three security fixes await a Render deploy** | `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Permissions-Policy: camera=(self)` and the `serveStatic` separator fix are all in `server/index.mjs` and live nowhere. Pushing to main ships the static beta only. Nothing is worse than before; those three simply are not in force. |
| **`FESTIVAL_ADMIN_KEY` on Render** | Cannot be read from here. It **fails closed**, so "staff tools do not work" and "no key is set" look identical from outside. If the tools do work, a key is set and the open question is whether it is a strong one. Same for `FESTIVAL_ALLOWED_ORIGINS`. |
| **Jumping in a real headset** | The jump now moves the view, which is right on a desk and on a phone. In an immersive session, vertical camera motion with no matching inner-ear signal is a known way to make people queasy. Asked; not yet answered. Damping or suppressing it for `!xrSimulated` only would be a few lines. |
| **Live-service penetration testing** | The 2026-09-04 pass was a code review plus reasoning about browser behaviour. The running Render service was never probed. Get the owner's explicit go-ahead before testing it. |
| **The crowd is better, not right** | Over eight simulated minutes it dips to five walking and recovers to seven, and nothing touches. Two or three are stationary in any thirty-second window — some legitimate dwelling, some still cycling through blocked-and-retrying below the six-second escape. **If the owner reports it again, ask where** and point `__festivalStep` at that spot. Do not tune the thresholds blind: 3.5s was tried and collapsed the whole crowd to zero. |
| **Statue front legs** | Opened up considerably on the last pass — the near leg is high and nearly straight. Offered to pull it back; unanswered. Two numbers in `foreLeg`. |
| **Statue scale** | ~9.8 units tall, taller than the timetable board it replaced. Offered to bring the whole piece down; unanswered. One scale factor. |
| **Chain shape** | Fourth attempt. Asked whether a drape resting at the neck is what was wanted or whether it should lie flat on the chest; unanswered. Read the four-attempt list in §0 before changing it — three of the four failures are shapes, not sizes. |
| **Accessories on NPCs** | Every NPC builds all four accessory groups hidden, because the rig builder is shared. Twelve residents × four groups of hidden meshes. Cheap (three.js skips invisible subtrees early) but not free, and it would let a resident wear something later. |

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
and the bar wall only; the statue faces west with the horse in profile and GANGAN's
shoulders turned out towards arrivals; the gate folds all eleven appearance controls
behind one line while the character panel keeps them open; the temple deity has no
halo.

One more thing about how they read a fix. **They check the live site, and they are
right to.** Several of these sessions ended with a confident report built on a
measurement of a stopped world. If you cannot show the thing working — a number
from a fixture that actually advanced time, a named mesh, a before-and-after —
say so plainly instead. They take that better than a claim that turns out to be
worth nothing, and the fastest way to lose their patience is to report the same
bug fixed three times.

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
