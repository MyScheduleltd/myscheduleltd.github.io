# Mobile entry crash repair — 24 October 2026

Base: PR #60 / main `7e6e0ad`. Candidate entry: **main-CIVNmyJE.js**.

The owner reports that the previous first-film fix works. Another iPhone 16 Pro on current iOS reaches the browser’s repeated-problem page at the end of entry in both Lite/Normal and Safari/Threads. The screenshot is a browser failure page, not an application stack trace. The physical native failure was not reproduced on hardware here.

## Confirmed entry defects and repairs

The sign-in preview kept its own WebGL scene/context resident through complete gameplay model loading, GPU warmup and the final entrance flight. Instrumented PR60 entry peaked at **422.40 MiB Lite / 435.10 MiB Normal** of requested texture/buffer/renderbuffer payloads. Both contexts were live at the reported transition. Pausing a render loop did not release either allocation.

Touch/narrow-screen entry now finishes the same camera flight first, copies its freshly rendered final frame directly into a small 2D canvas, and releases the preview scene/context before constructing gameplay. It preserves the final camera position/FOV and the real loading bar; no fake load completion is introduced. The snapshot stays until the prepared gameplay frame can replace it, then its backing is released. Capture failure, hidden tab, disposal and timeout fall through safely. The coarse-pointer path also covers landscape phones wider than 900px. Wide desktop entry keeps its original live flight.

The old automatic recovery also treated a visit still loading as already inside. Its retry-reset timer began before world construction, so a slow entry could reset the retry budget without any gameplay. The new lifecycle records loading/ready/stable/interrupted, blocks automatic GPU creation after interrupted loading, and starts the guarded stability interval only after completed handoff. Manual retry preserves the visitor/session/name/outfit/dyes and declined Remember Me. Late VR-support results cannot reclassify an ongoing manual entry; public-copy/language redraws preserve the retry notice and preference. Settled visits keep bounded automatic rejoin.

## Validation

- **901/901 tests** and TypeScript/production build pass. Recovery tests include a 300-second unfinished entry, stale timers, blocked storage, late support checks and the actual App methods. Preview tests verify fresh-buffer copy ordering, camera completion, single disposal and hidden/error paths.
- Final exact build, WebKit phone profile, both portrait modes: one live WebGL context at gameplay creation; nonblank snapshot; camera position delta about 6e-14 with matching FOV; bar50% at capture, still advancing for real work afterward. All five public-player mounts, private/public return, context restoration and fixed-audio readiness pass; zero late fixed-asset requests, application errors or site failures. External YouTube acknowledgement can time out under its existing bounded policy; these checks do not certify encoded video playback/network availability.
- Final tracked peaks **304.88 MiB Lite / 321.39 MiB Normal**, approximately118/114 MiB below the baseline. Local peer populations can vary these totals. These are WebGL API storage payload estimates, excluding CPU bitmaps, JS/WASM, shaders, driver padding, canvas framebuffers and media. They are not process RAM or a universal device limit.
- Four final real-browser recovery cases (both modes, interrupted load and delayed VR support) pass. Reload during loading creates **zero** contexts and keeps the form usable. Explicit retry recovers the same session with no duplicate admission; Remember Me remains off. Only deliberately interrupted old requests were canceled; no JS/unhandled/HTTP failures.
- The prior production build with identical normal-entry serialization also passed portrait/956px coarse-landscape in both modes plus desktop Normal, including20 public-venue transitions/private switches/restorations. Those reports remain separate from the final build’s portrait/recovery checks.
- All104 built files match docs/beta. All82 media/decoder integrity entries are unchanged; all169 previously published BETA files remain. No models/textures, artwork, DB records or server settings change.

Small sanitized evidence is beside this report. Full baseline, intermediate/final traces and screenshots remain canonical `art/cleanup-20261024/cold-screening/entry-handoff-*`; raw recovery runs remain `art/mobile-entry-20261024/recovery/`. Raw reports are local QA evidence, not public release assets.

The measured overlap and retry defects are established; the owner’s particular native termination reason remains unproven without device diagnostics. For diagnostic context, WebKit engineers have described memory-pressure terminations with this browser page: https://bugs.webkit.org/show_bug.cgi?id=279637 . That report is not proof of this event’s cause.

## Release boundary

A PR still needs protected-main review/merge and successful Pages/live-hash verification. Keep `[skip render]` in the final merge message defensively. Render settings and server releases remain with the owner; no server deployment or production attendee/database write occurred. Do not deploy canonical dist, which is an older local QA build. Do not prune cached BETA generations early.

Physical follow-up: retry entry in Safari and Threads in both modes, including portrait/landscape and a fresh/reloaded tab. If the native failure recurs, preserve its last entry checkpoint. Browser profiles do not establish physical iPhone success.
