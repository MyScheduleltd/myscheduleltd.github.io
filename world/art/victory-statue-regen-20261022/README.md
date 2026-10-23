# Square statue regenerated from the reference — 2026-10-22 (local only)

Owner: the face-refined statue "still looks nothing like the reference image";
regenerate with Higgsfield, make it web-game ready for three.js, refine in
Blender. Decisions asked and answered: **about 8,000 triangles**, **two
candidates, Claude picks** (62 credits).

## Generation

Reference: the owner-approved Nano Banana Pro image
(`../victory-statue-blocky-20261022/reference.png`, job `6440ad70…`). The
earlier statue came from a `multi_image_to_3d` job capped at **1,800
triangles**, which is what flattened the face and Crocs.

| Candidate | Job | Credits | Result |
| --- | --- | ---: | --- |
| Meshy 7 Ultra (`meshy_v7_image_to_3d`, 30k, textured, no PBR) | `f0b83dca…` | 44 | **Chosen.** 29,530 tris, one 2048 map. Calm closed eyes, round full face, goatee, V-arms, raised knee, cuffed shorts, Crocs with vent holes and straps: a close match. |
| Tripo H3.1 detailed (`tripo_h3_1_image_to_3d`) | `b1b642d7…` | 18 | Rejected: 2.0 M triangles, 58 MB, a harsher face with staring eyes. Not kept in the tree (hash in `provenance.json`). |

`jobs.json` records both requests; `inspection/` holds Blender renders of both
raw candidates and the refined result (`meshy-*`, `tripo-*`, `v5-*`,
`cmp-*` compares two weightings).

## Blender refinement (`refine_statue.py`, Blender 5.2.1 LTS, headless)

1. Weld duplicate vertices (31,544 → 14,709; 76 open edges, one island, no debris).
2. Collapse-decimate a copy to **8,000 triangles** with the head, hands and Crocs
   weighted to keep more detail (vertex weight 0.75 vs 1.0; 0 would freeze them,
   which Blender treats as never collapsing).
3. Meshy's UV layout is cut into so many charts that collapse refuses to cross
   them (it stalled at 16,626), so the copy drops its UVs, gets a fresh Smart UV
   unwrap, and the generated colour is **baked** onto it from the full 29.5k mesh
   (Cycles, diffuse colour only, 8 px margin).
4. Colour warmed by a per-channel gain to the square's established gold (the mean
   of the previously installed statue's map), so it sits with the temple statue.
5. One mesh, one material (base colour only, metallic 0, roughness 0.8), no
   normal/PBR/emissive maps, no rig or animation. Shared vertices (8,263): the
   runtime draws it flat-shaded, so facet normals need not be split.

`refined-blender.glb` is the Blender output; `refine-report.json` its numbers.

## Installed (image-only packing, `../environment-upgrade-20261019/optimize-glb.mjs`)

| Device | File | Map | Bytes |
| --- | --- | --- | ---: |
| Desktop | `src/assets/environment/victory-statue.glb` | 1024 WebP q92 | 550,516 |
| Phone | `src/assets/environment/victory-statue-mobile.glb` | 512 WebP q90 | 400,296 |

Geometry bytes are identical across the two. The 2048 map would make desktop
876 KB; 1024 keeps both inside the 0.4–0.6 MB quoted to the owner and the face
still reads. Hashes are in `provenance.json`; the previously installed (codex's
face-refined) files are kept as `prior-installed-*.glb`. Runtime fit, plinth,
collider and flat-shaded matte material are unchanged.

## Checks

- `scripts/victory-generated.test.mjs` rewritten for this asset (provenance,
  8,000 triangles, one mesh/material/map, identical geometry across devices,
  1024/512 WebP, byte budgets 640/448 KB, fit on the plinth, both hands up,
  raised knee forward on +Z, standing shoe). Full suite 812/812.
- `../festival-polish-20261022/check-package.mjs`: all 65 packaged asset hashes
  match the build (`main-mLuhKVxZ.js`, disposable API; never publish this dist).
- In-world: `../victory-statue-20261022/check-browser.mjs` now expects 8,000
  triangles and writes to `browser-desktop/` and `browser-phone-webkit/` here.

Not published, committed or deployed.
