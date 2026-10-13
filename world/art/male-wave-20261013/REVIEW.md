# Male wave shoulder repair — 2026-10-13

Raising the waving arm dragged the male chest and ribs toward the shoulder. Live Blender MCP inspection found side-chest vertices with 100% upper-arm ownership and inconsistent adjacent spinal assignments.

The native skin now uses a smooth blend along its connected surface. The chest stays attached to the spine, the shoulder transitions into the upper arm, and the lower arm keeps its authored elbow binding. The solver welds its graph across UV and normal splits; the export keeps the native mesh and all of those splits. Only the body JOINTS_0 and WEIGHTS_0 accessors changed. All positions, normals, UVs, indices, joint binds, wardrobe/shorts masks, transforms and embedded image bytes are identical to the preceding release candidate. The original female is unchanged.

Validation: 438/438 full tests, 21/21 focused avatar tests and the TypeScript/Vite production build pass. The torso regression fails the preserved preceding asset during the initial arm lift and passes the repair. Shoulder seam correspondence checks cover 25 wave frames and 33 samples each of the actual punch and Breaking clips. Previous 254-frame palm/finger directions and wrist-volume checks remain passing. These are exported-model/runtime checks, not physical webcam or headset measurements.

Built browser review covers front, side and rear wave views; five motion phases; all three outfits; a Breaking floor-support frame; a punch frame; and an enlarged underarm view. Contact sheets were visually reviewed for stable torso silhouette, coherent arm lift and return, sleeve/collar coverage, surface continuity and preserved shorts hems. The unmodified generated body retains its stylized proportions and faceting.

Both prepared BETA channels match the production build byte for byte (104 files, 38 combined integrity hashes). Entry: `assets/main-BreJUSmk.js`. Male SHA256: `cf03029d1cc972b8760329de22ec83009bc31ed5dd7d8e3588aff5c3d1a9965b`. API: `https://myschedule-festival.onrender.com`. GitHub PR #28 requires an approving review of the latest push before merge and Pages publication.

Evidence: `wave-motion-contact.png`, `after-contact.png`, `preservation.json`, `package-verification.json`. Live Blender reproduction: `scripts/repair-male-shoulder-weights.py` against the preserved `.artifacts/male-wave-20261013/production-before.blend`; transfer its weights with the local `apply-weights.mjs`. Preserved GLB: `male-before.glb`. Final scene: `wave-weights-fixed.blend`.

Local view: http://127.0.0.1:4173/avatar-review.html?sex=male&outfit=4&pose=wave&phase=0.5&angle=0.6&zoom=1.2&look=1.5&check=wave-final
