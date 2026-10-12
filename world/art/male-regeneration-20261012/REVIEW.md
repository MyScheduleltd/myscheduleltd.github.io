# Male Higgsfield regeneration, 2026-10-12

Historical regeneration evidence. The later [outfits 1–3 follow-up](../male-outfits-20261012/REVIEW.md) supersedes this candidate's installed hash and garment-fit validation. Its body anatomy remains the same.

Local built candidate; owner visual acceptance and physical webcam/VR tracking remain pending. No deployment performed.

The replacement is the actual Higgsfield downloadable model (job 2cfdd22a-9ecb-4358-bd50-68d9b0d8cb11), retaining the generated face/hair style, black shorts with white side stripes, intact hand and foot surfaces and original 2048 PNG texture. The provider rig had 24 body joints; live Blender MCP added 40 finger joints. Skin weights, palm/thumbnail axes, shoe soles, garment fitting and outfit masks were validated against the runtime.

Original downloads, job records, preparation steps and the separate saved Blender scene are in `.artifacts/male-regeneration-20261012/`. Source files remain untouched. `male-regenerated.blend` is the current prepared source. Export it through live Blender MCP with `export-candidate.py`, which selects the exact rig/body/wardrobe objects every time. `compress.mjs` compresses floating point buffers without texture conversion or geometry quantization. Do not run the old male anatomy shaping functions in `prepare-higgsfield-avatars.py` or `repair-swim-body.py` over this generation.

415/415 full regression tests passed, then the final underarm visibility refinement passed all 8 hand/foot/body tests and a new build. Browser proof uses the actual built preview on port 4173. Physical camera/controller capture has not been measured. The former 4173 build now contains the replacement; port 4175 is the source/dev view. Female asset hash remains 20ba19cc771ac0a8a81e140aaf8072bed056c19c61aec7618b4bebd91ec2c5b3.

The new foot envelope deliberately follows the generated anatomy, rather than forcing the narrow proportions of the rejected procedural repair. A fixture sampled directly from the downloaded rigged mesh verifies that the installed model retains those hand and foot positions; separate pose tests guard against flattened toes, floating heels, excessive yaw and missing tracked digits.

Preview: http://127.0.0.1:4173/avatar-review.html?sex=male&swim&pose=stand&angle=0.6
Hand: http://127.0.0.1:4173/avatar-review.html?sex=male&swim&pose=stand&hand=right&grip=open&handview=palm
Feet: http://127.0.0.1:4173/avatar-review.html?sex=male&swim&pose=stand&feet=side
