# Beauty Boy source, assets and storage

The game is built from the immutable release in `.qa/moth/published/`. Its
hashes are in `.qa/moth/published-snapshot.json`. These inputs are required for
rebuilding and are not browser downloads. Keep them and the authored drum
measurements; removing them does not improve gameplay performance.

## Source responsibilities

| Area | Source |
| --- | --- |
| Build, public/staff separation, SRI and CSP | `scripts/build-moth.mjs` |
| Snapshot integration and resource registry | `scripts/moth-runtime-patches.mjs` |
| Required chapter downloads/decodes and audio cache ownership | `scripts/moth-level-assets.mjs` |
| Measured charts, timings and score limits | `scripts/moth-chart-patches.mjs`, `moth-drum-charts.json`, `moth-river-groove.json`, `moth-river-cut.json` |
| Retired paths and layers | `scripts/moth-retired-highway.mjs`, `moth-retired-ui.mjs` |
| Removal lists and reachability checks | `scripts/moth-asset-trim.mjs`, `moth-code-trim.mjs`, `moth-reachability.mjs` |
| Retired configuration metadata | `scripts/moth-data-cleanup.mjs` |
| Exact generated package and stale-resource pruning | `scripts/moth-package-layout.mjs` |
| Owner additions and cleaned sprite sources | `moth-asset-additions/`, `moth-asset-patches/` and their manifests |
| Leaderboard service and isolated tests | `services/moth-scoreboard/` |

`docs/moth/` is generated. Edit the relevant source module and rebuild instead
of modifying generated JavaScript or JSON. Active source/output copies of an
asset are needed for reproducibility and publication; Git stores identical
blobs once. The builder prunes unregistered generated resources and rejects
unexpected code files for inspection.

## Loading and memory

Each chapter loads only its own artwork plus shared resources. Its loading
screen waits for full music copies, walking/dialogue BGM, required sound
effects, image decoding, and essential interface artwork. Level 4 includes its
chest and recording. A failed required asset keeps entry behind recovery.
The loading queue prevents a cancelled chapter from reopening later.

Outgoing chapter references and backdrop copies are released. Audio keeps two
idle copies in addition to current, playing and resumable owners. Replacing an
idle media element preserves iOS's played-element source rules; do not switch
the source of an actively owned player to free its cache entry.

## Assets and CDN size

The repository also contains other websites and applications. Its whole tree
is not the game's download size. Existing resources use immutable, hash-checked
jsDelivr pins. Added resources use their own manifest pins. The compact
six-asset source at `d847823e571f216d483c9ba024facc9e22ca61c7` is 4,353,386 bytes;
retain its `codex/moth-cdn-assets-20261106` branch, and never merge that
asset-only replacement tree into `main`.

Before publishing a new or changed large asset, publish its immutable asset
source, verify the real CDN response and SHA-256, then update its manifest pin
and rebuild. Do not assume a new file will be fetchable from a large website
commit merely because older files are cached. `verify-moth-cdn-assets.mjs`
checks every active media file, rather than sampling the first level.

Unused-resource removal must account for story scenes, both difficulties,
hidden songs, outfits, the playlist, app icons and staff previews. Full songs
remain necessary for the playlist even when fights use shorter cuts. Retired
gameplay entry points must be closed before removing their resources.

## Persistent data

Redis holds leaderboard records, not game assets. Legacy/current chart boards
retain their top ten entries per accepted difficulty. Tickets and rate-limit
records expire; valid leaderboard achievements intentionally persist.
Difficulty validation accepts only the own string enum values `chill` and
`shoot`, before any storage keys are constructed.

Browser storage holds progress, a kept fight and settings. There is no binary
asset database, IndexedDB, CacheStorage or service worker to clear. Deleting
player progress or leaderboard entries does not fix rendering or loading.

## Validation

Set `MOTH_TYPESCRIPT_PATH` to an installed `typescript/lib/typescript.js` when
running the build. Key checks include:

```sh
node scripts/verify-moth-package.mjs
node scripts/verify-moth-cleanup.mjs
node scripts/verify-moth-level-assets-unit.mjs
node scripts/verify-moth-level-preload.mjs http://127.0.0.1:5286/
node scripts/verify-moth-highway-cleanup.mjs http://127.0.0.1:5286/
node scripts/verify-moth-cdn-assets.mjs
node --test services/moth-scoreboard/moth-scoreboard.test.mjs
```

Browser tests use fresh profiles and a stub leaderboard. Package, local
browser, live deployment and physical-device checks are separate evidence.

`MOTH_TRIM_AUDIT=1` builds an instrumented version that keeps retired method
bodies and records unexpected calls. Verify that build with the same explicit
flag. Ordinary production verification rejects instrumented builds; rebuild
without the flag before preparing a release.
