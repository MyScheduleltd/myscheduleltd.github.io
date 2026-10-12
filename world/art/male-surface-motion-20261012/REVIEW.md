# Male avatar surface and motion repair — 2026-10-12

Status: owner authorized BETA publication on 2026-10-12. Built and verified locally; production packages are prepared for PR #17, pending the required GitHub review. See `../beta-release-20261012/package-verification.json`. This is not live publication.

The reported shoe holes came from the old wardrobe extraction discarding pale sole texels as skin. Recovered both complete sneakers from the original Higgsfield generated clothed model (`character-prototype-20260920/art/generated/base-rigged.glb`) through live Blender MCP. Kept the original footwear shape, UVs and artwork, moved each rigidly to its ankle and closed the hidden collar and two tiny source punctures. Final welded footwear has 1,285 vertices, 2,487 faces, zero boundary edges and zero nonmanifold edges. The footwear material now keeps its original atlas independently of hair/skin/pants dyes.

The old cap morph compressed the hairstyle to fit a smaller crown. Neutralized that morph and fitted the cap and its separate logo around the original full hairstyle, centered over the hair crown. Scale 1.34 in the horizontal plane, height scale 1.05 and 35 mm lift. The geometry clearance audit sampled 3,314 actual crown hair points; runtime cap clearance and every sampled cap-on/off hair position pass. The cap's original adjustable rear opening remains visible.

The hair dye label now covers the actual generated hair surface from the crown to the lowest curls behind the neck: 79,300 labeled faces / 39,751 vertices. Added the `_hair` label to the exported body, updated its dye mask, and use the label in the runtime shader to keep baked highlights and lower curls in the hair color class. Browser orange-dye checks cover front, both side regions and the full rear; face skin stays in its original color in the fitting-room check.

The upper shirt panels were pulled up by neck/arm weights, and some elbow skin followed hips/legs. Adjusted 231 shared tee shoulder vertices/weights to a relaxed torso-to-deltoid transition. Corrected 2,600 arm vertices, including 1,141 with unrelated bone influence. The sleeve and collar topology, UV islands and cuff joins from the preceding repair remain intact. The generated body positions, normals, UVs, hands, feet, clothing coverage, and all 64 bind transforms are unchanged.

Preservation checks also retain the trousers, vest, seven separate prints and the other eleven original embedded image byte streams. The original body image and recovered shoe image retain all original 2048×2048 RGBA pixels; lossless WebP encoding reduces the package size without changing those pixels. Female GLB is unchanged. See `preservation.json` and `.artifacts/male-surface-motion-20261012/texture-lossless-report.json`.

Validation:

- 428/428 full tests passed. 13/13 focused wardrobe checks also passed after extending the elbow sampling to 33 phases across each complete punch/dance clip. The existing swimsuit/finger/outfit parity tests pass.
- The preceding preserved male model fails all four symptom guards: cap preserving hair volume, closed footwear, complete hair surface dye, and valid elbow ownership.
- TypeScript/Vite build passes; whitespace checks pass. Only the existing Vite large-chunk warning remains.
- Built browser captures cover shoes at the front and rear, cap fit from side/rear, recolor through the lowest curls, outfit 1 front / outfit 2 rear / outfit 3, five punch phases and nine dance phases. Contact sheets: `punch-contact.png`, `dance-contact.png`. The widest dance pose is framed at a wider zoom for complete visibility. Browser errors: none in the repaired build. Earlier malformed cap-color review URL warnings were corrected to use encoded # colors.
- Actual world: local API status is online, the saved avatar customization loads, B → Enter starts Breaking, movement stops it, and a mouse click plays the punch. Captures: `world-breaking.png`, `world-punch.png`, `local-world.png`.
- Contact-sheet review: no sampled elbow spike/tear, no shoe puncture, no texture transition pop, readable arm silhouettes and coherent movement. This is local desktop visual and runtime evidence; physical VR controllers/webcam hardware were not exercised for this follow-up.

Local world: http://127.0.0.1:4173/?era=ps2&island&local=20261012-surfaces
Fitting room: http://127.0.0.1:4173/avatar-review.html?sex=male&pose=stand&outfit=3&angle=0.6&cap=%23232a36&zoom=1.2&look=1.6

The Vite preview serves the built world at port 4173 and the local Node API runs at port 8787 with ephemeral state, stage payment configuration and invoices off. The final local build overrides `VITE_FESTIVAL_SERVER_URL=http://127.0.0.1:8787` for this build command only; `.env.production` retains the public deployment URL. The browser blocked direct app-server page loading, so the preview server was restored; server security headers were retained. No public deployment or server settings changed.

Installed male: 15130464 bytes / SHA256 `24c258bacd78bbf1b7d26689f828937c4ed5773fed626dde0c2db3ad0e8c61c9`.

Preserved inputs: `.artifacts/male-surface-motion-20261012/{male-before.glb,before.blend,dye-before.png,ImportedAvatar-before.ts}`. Final Blender snapshot: `surface-motion-fixed.blend`. Working source: `.artifacts/male-regeneration-20261012/male-regenerated.blend`. Replay the focused `classify-hair.py`, `repair-surfaces.py` and `recover-footwear.py` in order, use the explicit 15-part `export-candidate.py`, then the lossless `compress.mjs`. Do not rerun historical full anatomy/wardrobe reshaping scripts. Original source footwear object and mesh baselines are retained in the working Blender file.
