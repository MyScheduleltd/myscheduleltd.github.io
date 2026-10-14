# Male swim shorts hem repair — 2026-10-13

The native black shorts were being repainted as skin below their middle. The skin-cleanup label classified upper-leg vertices as bare skin without excluding the shorts. Disabling saved swimwear dye alone did not repair that boundary.

Live Blender MCP inspected the actual mesh, atlas texels and leg hems. Native black cloth and neutral white-stripe texels identify 6,695 garment triangles; 2,200 Blender vertex labels are removed from skin cleanup, corresponding to 3,637 export vertices. The GLB's skin-mask accessor is the only changed accessor. All geometry, normals, UVs, topology, skinning weights, joint binds and original texture bytes are unchanged. Female remains original. Black cloth and white stripes retain the agreed fixed design regardless of old saved swimsuit colours.

436/436 tests and production TypeScript/Vite build pass. The new acceptance regression uses independent native cloth/stripe samples around both real hems and all sides, and guards skin below the fabric. It fails the preceding GLB. Local rendered front, rear and both sides were inspected with white skin and a saved magenta swimsuit colour. The complete garment remains black. The previous male Breaking palm/wrist fix is included; original animation samples are unchanged.

- [Normal-colour final front](final-front.png)
- [Front with contrasting skin](front-white-skin.png)
- [Rear](rear-white-skin.png)
- [Side](side-white-skin.png)
- [Opposite side](other-side-white-skin.png)
- [Exact asset preservation](preservation.json)
- [Release package verification](package-verification.json)

Owner authorized publication. Both BETA release packages are prepared and byte-verified: 104/104 current files and 38 integrity entries, entry `main-BE4fKoeL.js`. GitHub's required approving review is the remaining publication gate; this document is preparation evidence, not live-deployment proof.

Male SHA256: `b8cda2d2ddff137223a87af264116c9498e033a344d07c22b69a604d22d33e4c`.
Female SHA256: `20ba19cc771ac0a8a81e140aaf8072bed056c19c61aec7618b4bebd91ec2c5b3`.

Local view: `http://127.0.0.1:4173/avatar-review.html?sex=male&outfit=4&pose=idle&angle=0&zoom=1.2&look=1.5&swimwear=ff00ff&check=shorts-hem-final` .

Reproduction source and preserved input stay local under `.artifacts/male-shorts-hem-20261013/`: `repair-mask.py`, `mask-changes.json`, `apply-mask.mjs`, `male-before.glb`, and `shorts-mask-fixed.blend`. Reapply only the semantic mask; do not reshape anatomy or reproject UVs.
