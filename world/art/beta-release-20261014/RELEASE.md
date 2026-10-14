# BETA / PS2 arcade, avatar and cleanup release — 2026-10-14

Owner explicitly requested publication after reviewing the local arcade and safe cleanup. The existing release PR #28 is updated with the final integrated changes. Publication requires its latest push to receive the repository's required human review; do not claim it is live before merge, Pages success and public verification.

## Behavior

- A polished orange M.O.T.H cabinet and the jukebox are centred beneath the sign. The cabinet rests on rendered ground with its back outside the wall.
- Desktop users play on the physical screen with a fixed camera and a single recessed 離開遊戲 button. Controls recover focus; the public adapter supports Esc exit. Mobile and immersive VR open the public game separately.
- Every entry fetches the current `https://myscheduleltd.com/moth/` page using a fresh launch URL. There is no checked-in-game fallback in the festival preview or package.
- Accepted male swim-short skin-mask, Breaking wrist/palm and wave torso/flank repairs are included. Female remains the original accepted asset.
- Tracked cleanup removes unused site images, duplicate font backups and superseded review media. Current assets, source inputs and cached release dependency chains remain. The larger 3.21 GB local working-file cleanup does not represent gameplay download savings.

## Main integration

Integrated main through `2f355a9a723251b14002d0a5164f98246f2e2243`, including the newer M.O.T.H menu/audio, charts and sprite changes. All current-main M.O.T.H assets/data/staff files are byte-identical. The public game differs only by the one embedded-desktop preference guard; its entry gets the input adapter, matching SRI and a fresh version. Standalone public play and staff separation remain.

## Verification

- **453/453 full tests**, strict TypeScript and Vite production build pass.
- **53 files per channel** match the build byte-for-byte; **20 model/image hashes per channel** match their integrity lists: 106 comparisons and 40 hashes total.
- Entry: `main-DvyUK1HM.js`. Production API: `https://myschedule-festival.onrender.com`; backend service code unchanged.
- M.O.T.H package check passes: 180 files, 135 preserved release assets, 62 retired files excluded, 33 cleaned sprites, 2 added assets, 46 audio files; integrity/debug separation pass, no credential patterns or diagnostic pages.
- Native local world/live-game review verifies rendering, menu input, focus recovery and button/keyboard exit and re-entry. A private prepared-game iframe check verifies the integrated current game, adapter ready handshake, native menu controls and Esc exit. Browser automation logged a MutationObserver exception when the simplified QA harness removed its iframe; neither runtime script uses MutationObserver, and native exit still completed. This is recorded as a tooling observation rather than a zero-error harness claim.
- Physical phone/headset measurements were not performed.

## Evidence

`package-verification.json`, `moth-package-verification.json`, current native screenshot `prepared-game-controls.png`; full test/build logs in `.artifacts/beta-release-20261014/`. Cabinet/live-game/cleanup evidence remains in the corresponding 20261014 review folders.

## Publication status

Prepared and verified for PR #28. Awaiting its required latest-push review. Main is protected even for admins, stale approvals are dismissed, and auto-merge is disabled. Merge normally after approval; verify GitHub Pages and live package hashes before declaring publication complete.
