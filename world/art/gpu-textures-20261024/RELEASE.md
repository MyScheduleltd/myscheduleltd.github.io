# Environment texture release — 2026-10-24

The owner requested publication after being unable to open the private iPhone preview. The physical iPhone 16 Pro test is waived for this release, not passed. The earlier local-only texture boundary is superseded by that explicit request.

## Result

The 18 stone/plaster/brick/ceramic/asphalt/wood maps use same-resolution KTX2 compression by default on the public festival. The original WebP maps remain available for automatic recovery from failed downloads/decoding, and `?gpuTextures=raster` explicitly selects them. One shared pinned Three.js Basis worker is retained through overlapping world leases and disposed after pending work settles. No avatar, band, GLB, dye, streaming picture or gameplay geometry changes.

Actual ASTC tile mip payload: 42.00 → 10.50 MiB, saving 31.50 MiB. Whole phone scene texture estimate in Normal: 258.50 → 227.00 MiB. This is a GPU texture payload estimate, not total Safari RAM or proof that phone reloads are fixed. Tile transfer grows 3.00 → 7.82 MB, with decoder overhead additional.

## Verification

- Full suite 861/861, including 14 runtime/selection/recovery/worker tests; TypeScript and production Vite build pass.
- Exact production files under a plain static local server, with all browser API traffic redirected to disposable loopback API8794: Chrome desktop + WebKit phone profile, Normal + Lite, five venues each. All 20 samples have 18 ASTC textures and zero RGBA fallbacks. All four forced context restores pass; no uncaught application errors.
- Deliberately blocked worker: Chrome + WebKit, five venues each. All 18 original raster maps recover in all 10 samples, with no uncaught application errors.
- 82 media/decoder manifest hashes verified; all 61 original media entries unchanged. Every dist file matches docs/beta; all 126 previous published files retained. Pinned decoder licenses are included. Production service URL verified; no local preview tooling or review fixtures published.
- Browser evidence remains local in canonical `world/art/gpu-texture-release-20261024/{browser,fallback}`; package hashes are beside this document.

## Release steps

Protected main requires independent approval including the latest push. After approval/merge, verify the successful Pages deployment, live entry/decoder/tile hashes and public default activation. Warm the newly hashed KTX2 URLs on jsDelivr only after the files are on main; executable worker/WASM stay same-origin. No Render deployment or production database changes are needed. Do not prune retained asset generations in this release.

Existing lamp reflection colour shift on context restoration also occurs with the original raster build and remains a separate follow-up. Physical iPhone behavior and external YouTube playback remain unverified.
