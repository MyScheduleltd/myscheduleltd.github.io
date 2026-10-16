# Local world performance and sign-in upgrade — 2026-10-16

**Local only. Do not publish until the owner approves.** Branch: `codex/gate-world-performance-20261016`. The previously published PR #37 remains untouched.

## Changes

- Distant NPC and remote-player skins retain their entire last committed local transform during the 35 m animation throttle. Authoritative translation continues each frame. Actual accepted male/female production-pose replays remove the alternating 19.4/14.1 cm floor jump; see `../distant-avatar-20261016/`.
- Desktop theater activation uses the same single-context aperture/avatar compositor as mobile, preserves opaque depth, reuses shadows, fixes clipping-plane variants from startup, and caches unchanged posters. The late rooftop bonfire light joins both lighting layers before becoming visible. See `../theater-activation-20261016/`.
- The sign-in background is a silent rendering of the actual curved world. Desktop has a transparent left form and a live accepted-model avatar on the right; drag/arrow rotation and appearance changes are immediate. The same canvas survives language redraws. Phone layouts omit avatar creation and keep secondary options folded. No network admission, media playback, crowds or audio runs in this preview.
- Removed BETA kicker/subtitle and obsolete looping-video staff controls, their retired API/schema/seed fields and persistence paths. Current title/name labels and wordmark controls remain editable. Old snapshots migrate safely without resurrecting retired fields.
- Entry slides the controls sideways and moves the camera to the actual dock avatar. Supplied download/readiness milestones drive monotonic camera progress; missing byte totals remain milestone based. Camera waits for a painted loading stage before synchronous scene construction, then matches the normal game's endpoint and yields to a painted world. Reduced motion, hidden tabs, retry and cleanup are covered. Input is blocked during handoff. The old preview covers construction, so two contexts coexist only briefly before its context is lost and renderer-specific listener identities are removed without evicting the active world's cached resources.
- Lite water uses a seeded 512px/784-cell atlas over 168m plus broad distortion, replacing the repeated 9-cell stamp every 14m. It keeps one water draw/sample, animated drift and world lighting. Normal-quality procedural water is unchanged.

## Validation

543/543 full tests, strict TypeScript, local Vite build and diff check pass. Logs are in `.artifacts/gate-world-performance-20261016/`.

Chromium in-app browser checked desktop 1280×720/1440×900 and phone viewports 390×844/375×667. Actual body/outfit/cap/color changes, drag/keyboard rotation, language preservation, no pre-entry iframe, mobile no-avatar/no overflow, successful entrance and complete overlay removal passed. Disposable local backend staff login confirmed exactly four retained sign-in text inputs, no old background editor, and successful settings save. It was stopped; the standard preview build was restored. No physical phone/headset verification.

Shore video actually played after normal map travel. Its first two seconds recorded max frame gap 34.4 ms, max world render 12.6 ms, mount CPU 1.3 ms and unchanged shader programs 130→130. These are one local desktop sample, not a universal performance guarantee. Rooftop/club fixtures showed correct opaque props and avatar layering; their selected upstream YouTube clips were unavailable. Cabinet input still reached the public game's stage menu.

The entrance was subsequently checked with concurrent actual screenshot capture and actual rendered-camera traces. The skipped lazy-import and DOMRect viewport paths are repaired; cached and early phone entry now retain a visible flight. See `../entry-motion-20261016/REVIEW.md` for the intermediate frames, final handoff, input checks and measured scene-setup loading hold. The arcade release lock is also implemented locally; see `../arcade-lock-20261016/REVIEW.md`.

## Review

Open `http://127.0.0.1:4173/?era=ps2&island&localReview=gate-20261016`. Desktop proof: `desktop-sign-in.png`; mobile: `mobile-sign-in.png`; staff: `staff-world-settings.png`; theater sample and caveats: `verification.json`.

No BETA build, staging, commit, push, PR or deployment was performed. Existing unrelated dirty receipts, source art and untracked files were preserved.
