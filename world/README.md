# myschedule Virtual Festival — Phase 4 + 5 Pre-Launch Build

This folder contains the isolated Three.js festival world, its authoritative live service, and its pre-launch production build. It does not build into or modify the existing production `../docs` website, and it has not been deployed.

## Local development

```bash
cd world
npm install
npm run dev
```

`npm run dev` starts both the Vite client and the local festival service. The default staff key is `myschedule-local-admin` in development only.

After entering the world, open **PASS → STAFF** to edit public programmes, the sign-in page's looped YouTube background, festival styling, pamphlet content, and NPCs. Every STAFF setting, plus chat history, is written to `server/festival-state.json` and is restored when the service starts again. Point `FESTIVAL_STATE_FILE` somewhere else to keep that file outside the repository, or set it to `off` for a throwaway instance that always boots from the built-in festival defaults.

If port `5173` is already occupied by another local project, Vite automatically uses the next available port (for example, `5174`). Open the exact `Local:` URL printed in the terminal; live festival features remain connected on fallback localhost ports.

The development server binds to `127.0.0.1`. Production-like output goes only to `world/dist`:

```bash
npm run build
npm run preview
```

For local lighting QA, append `?cycleMinute=52` to hold the shared cycle at full night. This override is accepted only on `localhost` and `127.0.0.1`.

## Verification

```bash
npm run verify
```

This runs the authoritative service tests, TypeScript validation, and the production client build. The test service uses an isolated temporary localhost port and never deploys anything.

## Phase 4 — live festival service

- Live visitor sessions with case-insensitive name collision protection
- Smooth in-world remote avatars using each attendee's chosen palette
- Explicit shared movement state plus continuous interpolation so remote walk cycles do not flicker to idle between presence updates
- Server-authoritative seat ownership across all 42 seats and viewing bays
- Server-authoritative, exclusive MENTOR carry ownership; a STAFF-controlled MENTOR follows the attendee carrying him until release
- Synchronized NEARBY, VENUE, and FESTIVAL chat
- Distance-aware NEARBY delivery and venue-aware VENUE delivery
- Plain-text normalization, 160-character messages, and chat rate limiting
- Reconnecting event stream with automatic offline-mode fallback
- Stale-session cleanup and automatic seat release
- Session-scoped staff console with visitor, seat, and chat monitoring
- Staff mute, end-session, and message-removal controls
- Staff-key enforcement and a production startup guard
- Health endpoint at `/health`

The local server is dependency-free and uses Node's HTTP and server-sent event primitives. Restarting the service clears who is connected right now: attendees, seat claims, and MENTOR's current carrier. STAFF settings and chat history are saved to the settings file and come back.

## Phase 5 — launch readiness

- Split application and Three.js bundles
- Normal/Lite graphics modes and automatic Normal Mode render-scale fallback
- Mobile touch movement controls and responsive festival panels
- Reduced-motion support, keyboard focus treatments, semantic controls, and live status regions
- Connection-state UI for online, reconnecting, offline, and staff-ended sessions
- Same-origin production client serving with immutable hashed-asset caching
- Security headers for content sniffing, referrer policy, permissions, and popup isolation
- Production metadata, favicon, and web app manifest
- Explicit environment template in `.env.example`
- Local build/test/health verification without any hosting or publishing command

## Approval-gated production run

Do not run this until the owner gives final deployment approval. A production service requires a unique staff key and the public origin:

```bash
npm run build
NODE_ENV=production \
FESTIVAL_ADMIN_KEY="replace-with-a-long-random-secret" \
FESTIVAL_ALLOWED_ORIGINS="https://festival.example.com" \
FESTIVAL_HOST="0.0.0.0" \
npm run server
```

Before deployment, choose the production host, TLS termination, persistent shared storage, observability provider, privacy/retention policy, and the final staff key. The current single-process service is suitable for one server instance; horizontal scaling requires a shared event and state store.

## Implemented festival world

- TypeScript, Three.js, and Vite application isolated under `world/`
- PS2-inspired low-poly festival city from Festival Gate through MY SQUARE to The Palace, Drive-In 88, and The Shore
- WASD and arrow-key third-person movement
- Follow and stable perspective camera modes (`T`)
- World boundaries and solid programme/screen collision
- Shared, deterministic 60-minute full day/night cycle with smooth lighting transitions
- Sun- and moon-aligned water reflection tracks with phase-aware color, position, and intensity
- Shadow-casting moonlight plus warm spotlight volumes from street, shoreline, Palace, and Drive-In fixtures
- Projector occlusion excludes floor and ocean surfaces, skips off-camera work, and never duplicates shadow maps
- English and Traditional Chinese gate selection
- Original black-on-white 我的檔期 company PNG in the gate and in-world header
- Case-sensitive visitor ID entry with NFKC safety checks and optional local profile memory
- Normal and Lite graphics modes
- Automatic Normal Mode render-scale fallback during sustained low frame rates
- Compact festival-pass menu
- Local ambient sound graph with master/environment/screening controls
- Legacy YouTube work catalogue normalized at build time and distributed by venue
- Responsive mobile gate and festival interface
- Correct Traditional Chinese visitor label: `觀影者名稱`
- Nine default NPC attendees (plus STAFF-created NPCs) with ambient movement and proximity-based name tags
- Live NEARBY, VENUE, and FESTIVAL chat with an offline local fallback
- Walkable branch promenade plus festival-pass fast travel for all three screening entrances
- Fifteen Palace cinema seats, six Drive-In viewing bays, and twenty-one Shore deck chairs with venue-aware screening cameras
- Three independent, simultaneous public streams rendered on their physical in-world projector surfaces
- Programme routing: The Palace plays COMMERCIAL, Drive-In 88 plays TELEVISION, and The Shore plays MUSIC VIDEO
- Venue-specific projector placement and clipping for depth-correct occlusion by nearer world geometry
- Seat-based public/private viewing choices using each venue's own catalogue
- Per-attendee fullscreen public screening overlay that never changes another attendee's view
- Public screenings on one service clock, so every attendee in a venue watches the same second of the same work
- Session-only private playback progress with resume after standing
- Custom swimwear palette, automatic shoreline outfit transition, and surface swimming
- Buoy boundary plus continuous surface swimming and nearby greetings
- Open, fence-free promenade access from the festival city to the beach
- POP! concession collectible with visible carrying and automatic water stowing/restoration
- All attendee bodies, including STAFF-controlled human NPCs, can visibly offer MENTOR a treat; MENTOR eats while controlled or autonomous
- MENTOR responds to greetings by wagging his tail instead of using a human wave pose
- `E` gives MENTOR a treat when nearby; `Shift+E` picks him up, and `E` puts him down
- STAFF-controlled NPCs share attendee movement, swimming, seating, greeting, MENTOR, and visible-popcorn behavior

Phase 4 and the non-deployment portion of Phase 5 are implemented locally. Publishing remains explicitly blocked pending the owner's final approval.
