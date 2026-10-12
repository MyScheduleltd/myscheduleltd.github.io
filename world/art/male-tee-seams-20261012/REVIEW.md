# Male T-shirt collar and cuff repair — 2026-10-12

Local built review ready; owner acceptance pending. No publication or release package update.

The shared male tee in outfits 1–3 retained collar/arm weight contamination, rear-neck tears, an uneven left cuff and small overlapping triangles. Live Blender MCP inspected the real mesh and preserved the cap-fixed input before repair. The collar is now a continuous low crew-neck, weighted to the torso. Both open cuffs join the original sleeves through even section rings and folded fabric lips, weighted to the upper arms. Tiny duplicate slivers and accidental holes were removed. UVs on the repaired collar/patch faces stay inside a cloth island, avoiding a skin-coloured streak created by interpolation across atlas islands.

Only the tee geometry, normals, UVs and weights, plus clothing coverage around its newly fitted cuffs changed. The cuff mask changes 189 Blender vertices (245 unique exported position/UV entries); it leaves the exposed forearms continuous. The generated body positions, normals, UVs, weights and CapHair morph are preserved. Shoes, trousers, vest, cap, cap logo and all seven print components are preserved. All 12 embedded image byte hashes and 64 joint bind transforms match the input. Female is unchanged: `20ba19cc771ac0a8a81e140aaf8072bed056c19c61aec7618b4bebd91ec2c5b3`.

Installed male: 13,409,696 bytes; SHA256 `d7d8f2bbe124071d1f8369e19669bf01677dd62a60aba4293c79b1438c6efa1c`. Input SHA256 `ab3c969f23e2c28e2d6b38b409d3cc572afb47cd484da57bcf50efe6bfcb5278`. Full preservation evidence: `preservation.json`.

Validation:

- 425/425 complete tests passed after the final UV correction; `npm run build` and `git diff --check` passed.
- 10/10 focused wardrobe tests passed. Four regressions check the four intended shirt openings, collar stability when either arm rises, cuff shape through elbow/wrist tracking, and collar UV island continuity. The preserved preceding model fails the first three; its UV guard passes.
- Live Blender topology and the actual exported runtime mesh have exactly four continuous openings: neck, both cuffs, lower hem. No branching seams or nonmanifold overlapping faces.
- Built browser front and rear close-ups checked all outfits 1–3; raised-arm checks covered outfits 2 and 3. Final close-up proof: `front-1.png`, `back-1.png`, `front-2.png`, `back-2.png`, `front-3.png`, `back-3.png`, `wave-3.png`. `wave-2.png` predates the last collar UV mapping refinement.
- The initial sandbox test attempt could not bind loopback sockets. The complete suite was rerun with local networking enabled and passed; no assertion failures remain.

Local review: http://127.0.0.1:4173/avatar-review.html?sex=male&pose=idle&phase=0.5&angle=0.6&outfit=1&zoom=3.2&look=2.25

Recovery and reproduction:

- Preserved input: `.artifacts/male-tee-seams-20261012/male-before.glb` and `before.blend`.
- Final source snapshot: `.artifacts/male-tee-seams-20261012/tee-seams-fixed.blend`.
- Focused idempotent repair: `.artifacts/male-tee-seams-20261012/repair-seams.py`, executed through live Blender MCP. It reads the saved pre-seam tee and body mask; does not reshape anatomy.
- Working source remains `.artifacts/male-regeneration-20261012/male-regenerated.blend`. Export using the explicit 15-part `export-candidate.py` with CapHair value zero, then `compress.mjs` for lossless floating point meshopt and original PNG bytes. Do not rerun historical anatomy or full wardrobe transfer scripts over this model.

These are rendered and fixture checks; physical webcam/headset acceptance remains separate.
