# Entry loading recovery — 2026-10-14, release prepared

Owner reports published `/beta/` stuck at the gate while audio plays in Chrome, without VR. Audio unlock happens synchronously before admission and avatar loading. Fresh live sound-on entry succeeded in native Chrome; the original failed request was not available, so its exact cause is unconfirmed.

Confirmed entry-loading defects were repaired: the mirror timer ended at headers rather than the body; manifest/site/admission requests could wait indefinitely. Admission now has a 15-second full-response bound. Integrity has 10 seconds; model downloads use 20-second mirror / 60-second primary **inactivity** limits that renew on arriving bytes, so a slow 14.6 MB male model is not cut off by its total transfer time. SHA verification and primary fallback remain intact. Gate reports downloaded size, stays visible until world code is ready, resists repeated entry/config redraw, mutes audio on failure and offers a working retry with preferences preserved.

461/461 tests and strict TypeScript/Vite production build pass. Regression tests exercise headers/body stalls, integrity failure, refusal/queue/deduplication, cancellation, retry, and a slow progressing transfer longer than the inactivity limit. Native private fault fixture sends successful model headers but no body; the request cancels after 60 seconds and the gate shows the retry message. After releasing the transfer, native sound-on retry enters the world. Only the expected deliberate timeout error was captured in that fixture; offline fixture state is not multiplayer verification.

Evidence: `verification.json`, `stalled-download-retry.png`, `retry-entered-world.png`; complete logs and private fixture source under `.artifacts/entry-recovery-20261014/`. No asset/model changes, BETA package preparation, staging, commit, push or publication. Previous publication receipts and unrelated untracked work are preserved. Native Chrome QA tab was closed; private fixture tabs/servers are disposable. Regular local preview on 4173 uses the rebuilt output.

## Publication requested

Owner explicitly requested publication after local verification. Prepared identical BETA and PS2 packages from the verified build. Entry: `main-Rrj72fTR.js`; 108 exact file comparisons and 40 asset hashes pass. No M.O.T.H or model/media data changed. Use the protected-main PR review/merge route; publication is not live until Pages and public checks pass.
