# Claude handoff — myschedule Virtual Festival

Last updated: 2026-08-25 (Asia/Taipei)

> **Superseded.** Read `CODEX_HANDOFF.md` first. The instructions below not to publish,
> and the reference to the `codex/pivot-exploration` branch, are both out of date: the
> build now ships to `docs/beta` on `main` every turn. What remains useful here is the
> older architectural description, not the process.

Current continuation: the published `15c9354` baseline removed the clipping wall
conduit and fixed mobile sign-canvas retention plus the phone's duplicate WebGL
context. New live iPhone screenshots then showed both venue DJs hidden by the
CSS3D video, the basement console overhanging its stage, and unrecoverable Safari
page zoom after rapid taps. Published commit `e8ba163` incorrectly lifted the two
screens; the owner clarified that their height was already correct. The current
published commit `d93192e` restored those Y positions but incorrectly shifted the
screens left. The owner rejected that: both screens belong on their original centre
lines, with the DJs composited in front. The release containing this handoff does
exactly that using the phone's existing WebGL renderer: an alpha aperture reveals
the CSS3D video beneath the main canvas and a dedicated layer redraws only the DJs over
it. Mobile remains at one WebGL context. The published stage expansion, prompt radius
and page-zoom lock remain. See `CODEX_HANDOFF.md` section 0 for exact geometry,
fixtures, verification and epistemic status.

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
