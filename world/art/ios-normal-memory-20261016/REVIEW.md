# iPhone Safari normal-quality memory repair — LOCAL ONLY

The owner reports Safari on iPhone 16 Pro/current iOS repeatedly reloading during active play with normal graphics. PR39 resource cleanup is already live, but the new screenshots show the crash persists after geometry counts fell to about 500. Zero video mounts/iframes in those samples do not support blaming video activation in those sessions. These counters cannot establish an OS memory kill as the proven cause.

## Concrete finding and repair

The 13 current GLBs embed approximately 394.9 MiB of RGBA8 source image data, or 526.5 MiB including a conventional mip estimate. Several scenery characters each contain four 2048px maps. Simultaneous model parsing/image decoding compounds transient allocation pressure. Inventory is in texture-inventory.json; it is not measured live GPU residency.

MobileAssetBudget bounds decoded image edges to 1024 before GLTF caches/upload, preserves aspect/alpha/color-space and GLTF UV/sampler handling, and serializes mobile model preparation and image jobs through separate queues. Current PNG/JPEG/WebP dimensions are read before decoding; implementations ignoring resize options use a bounded fallback and immediately close the oversized bitmap. External avatar dye/vest maps use the same budget. Desktop paths and source assets remain intact. Normal graphics and its shadows remain selected.

The successful local browser normal-entry sample, including external maps, estimates 475 MiB original decoded RGBA versus 134 MiB budgeted (about 72% less); 59 images, max edge1024, peak model parses1. Active walking remained running, with one WebGL context and two shadow lights. These observations were obtained before the final browser review was blocked. local-observations.json records them without implying a fresh capture, native Safari coverage, or physical-device stability. Avatar/clothing appearance was inspected in the successful local screenshot; no screenshot file was saved.

## Validation and remaining acceptance

Seven focused tests cover actual embedded-image inventory, headers/aspect, bounded first decode, queue rejection recovery, fallback bitmap release, unchanged desktop parsing, and real GLTF geometry/skeleton/UV/material properties. Full suite/build result is recorded in CODEX_HANDOFF.md when complete. Source asset and docs diffs are empty.

Native Mac Safari could not run because the Mac is locked. The owner is away and will test on the phone manually. A final browser capture/readout was rejected because automatic approval review hit a usage limit; no alternate browser route was used to bypass it. Physical iPhone Safari crash resolution remains unverified.

No commit, push, BETA build, or publication performed. The published site still serves PR39. Publication approval is needed before the owner can test this new repair on the published phone URL. Acceptance: choose normal quality, actively walk for at least five minutes, approach venues, and check whether Safari reloads or shows its repeated-problem page. If it does, capture the new black-box values including quality/imgMb/imgMax. This short test cannot prove indefinite stability.
