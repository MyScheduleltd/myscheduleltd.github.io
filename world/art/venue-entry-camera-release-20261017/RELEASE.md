# Entry, venue and camera release — 2026-10-17

Status: prepared locally; protected-main review is required before publication.

Admission waits for both avatar bodies and outfit layers, fixed scenery placement, arcade cabinet, rooftop band and current fonts. Static subdivision/batching, shader compilation and fixed texture uploads finish behind the loading view. Device-specific tips rotate beneath the raised loading bar; the avatar preview loses its focus rectangle, and the globe shows more island.

Repeat venue transitions retain a single paused video decoder briefly instead of repeatedly destroying/recreating it. Unchanged programme updates do not resend play commands. Decorative point/spot/shadow light quotas remain fixed to avoid shader variants changing between rooms. Avatar arrivals coalesce into bounded per-frame work.

SLAP AND POP uses the shared building orbit instead of artificial lobby/ramp confinement. Its entry and exit retain user yaw, pitch and zoom, with real wall/floor clearance and a wall-safe follow aim. XR, first-person, arcade and screening placement remain on their existing paths.

Validation: 576/576 tests, strict TypeScript and production Vite build passed. Both channels contain55 current dist files with identical bytes and20 verified asset-integrity records each. Seven standalone M.O.T.H files remain unchanged. Older hashed files remain available for cached entry pages and dynamic imports. Receipt: package-verification.json.

Local browser verification covered sign-in, rotating loading tips, entry, club and outdoor venue transitions; the final camera repair was walked through club entry/room/exit and compared with the temple. Normal desktop and Lite390x700 checks ran on a Mac. Physical iPhone acceptance remains pending. Existing measurements include isolated desktop entrance stalls; this release does not establish universal zero-lag performance or preload future visitors/streamed media.

Client-only release: no multiplayer server or merchant-setting changes, and no Render deployment needed. No account/payment-review evidence or unrelated historical working files are included.
