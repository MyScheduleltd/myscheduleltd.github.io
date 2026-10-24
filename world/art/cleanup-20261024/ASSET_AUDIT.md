# Read-only published/source asset audit — 2026-10-24

Audited source/release: `/Users/myscheduleai/Desktop/myschedule-pivot/festival-textures-20261024`, PR #59 source `67be000`, merged `45e5828`. No backup worktree was traversed for deletion. No production mutation was made. Source/old art inputs and M.O.T.H stay protected.

## Measured storage and static reachability

Logical file bytes (not filesystem allocated block sizes):

| Set | Files | Bytes | MiB |
| --- | ---: | ---: | ---: |
| Published BETA assets | 154 | 60,999,192 | 58.17 |
| Current entry reachable assets, including Basis runtime files and integrity | 96 | 47,361,791 | 45.17 |
| Current plus PR #58 previous graph | 108 | 49,350,452 | 47.06 |
| Not used by current entry | 58 | 13,637,401 | 13.01 |
| Not used by current or immediate previous entry | 46 | 11,648,740 | 11.11 |
| Proven expired/deletable **at this audit time** | **0** | **0** | **0** |

All 154 files are accounted for by the recent ten entry graphs. Every obsolete file is still inside the owner's 24-hour retention window. Old files on disk are not automatically downloaded by the current site. They provide continuity to already-open/cached old entry pages.

The successful Pages deployment times were provided from the read-only GitHub Actions history. All 30 run commit pages resolved locally. Evidence: `verified-deployments.json`; planner result: `prune-plan-current.json`. Commit dates and filesystem mtimes were **not** used to infer expiry.

| Superseded entry | Earliest permitted expiry (Taipei) |
| --- | --- |
| `main-B4ExJkeK.js` | 2026-10-24 12:09:24 |
| `main-5wJel4-a.js` | 2026-10-24 15:14:42 |
| `main-DuutfnLG.js` | 2026-10-24 15:31:28 |
| `main-BSuuuACe.js` | 2026-10-24 16:52:40 |
| `main-BPYk7ocK.js` | 2026-10-24 20:01:19 |
| `main-C-ceVTVR.js` | 2026-10-25 01:21:28 |

A new release changes the retention graph. Recompute from verified successful deployments before any later prune.

## Cleanup-script defect and fix

The old `prune-published.mjs` excluded KTX2/WASM and treated the nested `assets/basis` directory as stale. Its old dry run proposed deleting 65 paths / 19.2 MiB, including active compressed art and the decoder. It must not be applied.

The repaired script is implemented in `festival-cleanup-20261024/world/scripts/prune-published.mjs`. It:

- Walks assets recursively and follows exact relative paths, KTX2 and WASM included.
- Explicitly protects the three runtime-composed Basis decoder paths and integrity manifest.
- Preserves every entry until 24 hours after its next verified successful deployment.
- Keeps unknown files and entries without deployment records.
- Only removes proven obsolete hashed regular files; never deletes directories, routes, licensing, historical source or M.O.T.H.
- Requires deployment records for `--apply` and checks **all** candidate content hashes before unlinking any file.
- Is report-only by default.

Twelve meaningful prune tests passed, including a real published graph check against every current integrity asset. The real graph reaches all 96 current files. No BETA files were deleted during this audit. The separately verified dormant portraits were subsequently archived and removed from the release candidate as described below.

## Dormant public team portraits: archive candidate

`docs/assets/member/` holds 12 files / **118,391,458 bytes (112.91 MiB)**. The current HTML/CSS does not reference these photos. Their only remaining client references are `memberData` in `docs/js/allData.js`, an unused destructure in `contact.js`, and an unreachable/commented loop in `about.js`.

- The member-rendering markup was already commented in `ff814f77` (2024-05-16).
- `70fdcf45` (2026-08-18) explicitly sets `i < 0` and documents the paused board.
- The visible current ABOUT page shows COMING SOON / a phone film instead (`about.html`, `about.js`); deleting the portraits does not change that UI.

Proposed safe cleanup: archive all 12 originals outside `docs` with exact SHA-256 values and the old member metadata/render block, verify the copied hashes, remove the published copies and dead client metadata/loop only. Preserve the archive for future art/reference use. This saves public deployment storage; **it does not remove 112.91 MiB of current runtime downloads**, because these images are already unrequested.

## Other candidates deliberately protected

- `world/src/assets/venue-scenery/attendant.glb` (3,687,768 bytes) is retired from runtime; its native replacements are the masked avatar rigs. It is still a historical regeneration/test fixture and is not emitted or fetched by the current build.
- The cap logo/outfit print PNGs absent as standalone build assets are used by avatar authoring/rebuild scripts and are embedded in accepted GLBs. They are not redundant source art.
- `avatars.json` and `band.json` are build/runtime metadata inlined into code.
- The two shared fonts are duplicated between `/font` and `/beta/font` (204,432 bytes total per copy), but old CSS paths and font cache continuity require careful publication/retention. This tiny duplication is not a runtime double-download per festival session.
- Current root-site KVN photo, portrait background, social-share images and full Chinese font have actual HTML/CSS metadata references and stay.
- M.O.T.H's 163 published files / 122,277,812 bytes belong to the separately routed game; no deletion is proposed.

Machine-readable inventory: `asset-audit.json`. The quick inventory used basename matching plus explicit runtime roots for diagnosis only; the repaired release planner and its real-graph test use exact paths before any deletion decision.

## Implemented portrait cleanup and validation

All 12 public portraits were copied byte-for-byte to `world/art/retired-public-assets-20261024/` in the canonical source checkout. Every destination SHA-256 was checked before removing any published original. Original member metadata and the pre-cleanup versions of allData/about/contact scripts are preserved alongside `manifest.json` and `member-data.json`. Large archival copies are local only and must not be added to the release commit.

The clean release candidate now removes only those 12 public JPGs, the unused `memberData` property, two unused destructured names and the unreachable ABOUT rendering loop. Its small committable `world/art/cleanup-20261024/retired-portraits-manifest.json` preserves the exact source paths, original hashes, sizes and archive location. Remaining live site data hashes identically to its pre-cleanup baseline after excluding only `memberData`.

Three integration tests verify the preserved data, all twelve deleted public paths, two desktop/three phone ABOUT iframes, preserved modal click registration, and the CONTACT background film. Combined with twelve pruning tests: **15/15 pass**. Both new test files were inserted into the package test command. Nothing was committed or deployed by this audit agent.
