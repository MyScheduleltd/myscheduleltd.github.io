# Swimsuit body and tracking review — 2026-10-11

Status: MALE VISUALLY REJECTED on 2026-10-12. Owner requested a new male Higgsfield generation after the later feet/hand close-up remained defective. The historical tests below establish code/asset regressions only, not visual acceptance. This continuation has not been committed, pushed or packaged for Pages. PR #17 retains its earlier release changes and still needs the required latest-push review.

The owner requested male/female swim bodies matching outfits 1–3, working desktop VR fingers and ordinary bare feet; confirmed keeping the black shorts and black one-piece swimsuit. All mesh edits and inspection used the connected live Blender MCP session. Original installed assets and the full scene were preserved in `.artifacts/swim-body-match-20261011/` before editing.

## Repair

- The visible swimsuit hands had no distal index/middle/ring/pinky skin weights, despite using the same 64-bone rig. Remove that rigid lower-arm/hand layer, use the repaired dressed arms and five-digit hands in every outfit, and stitch the retained upper arms to them. Wardrobe flags are shared (0/0) through the hands and sufficient upper-arm skin inside the shirt sleeves.
- MCP cross-section inspection located continuous native arm contours 30 mm beyond the elbow. Closed surface bridges join those contours to the retained swim upper arms, blending widths into the native forearms. All four joins have zero open/nonmanifold edges and zero opposed face-winding failures. An initial mask version left potential inner-cuff gaps; the final mask extends inside each sleeve. A geometry/ray regression rejected the initial version and passes the corrected export.
- Bare feet are narrower, shorter and less splayed. Standing skin toe-out now measures 3.2–4.8 degrees, with width/length ratios .327–.357. Original foot/toe bones, joint proportions and animation bindings remain unchanged.
- Keep the existing black swimwear, heads, torso/legs, maps, garment meshes and cap morph. Retained torso/leg UVs are exact; positions differ from the preserved installed assets only by export quantization (maximum .000075 model units). All 64 rest joint positions/orientations are unchanged. The dressed source has no complete bare torso beneath its clothes, so an exact hidden torso comparison is unavailable; this does not reconstruct an invented unclothed source.
- `scripts/repair-swim-body.py` reproduces the live edits from the preserved source, with matching vertex/visibility signatures on both sexes. It runs after final wardrobe mask classification in the existing build script. Do not run it twice on an already repaired asset.
- The hand close-up viewer now follows actual active outfit visibility, including shared hand vertices. No runtime camera input code was changed: the fault was the visible swimsuit skin layer.

## Validation

- Final `npm test`: **413/413 passed**, including six new actual-asset regressions for shared hands, all five weighted digits, desktop camera open/fist/independent-index skin deformation in outfits 1–4, compact separated feet, outfit/water joint proportions, and cuff overlap. Existing standing/sloping/walking sole-support, arm/hand tracking and wardrobe tests remain green.
- TypeScript/Vite production build passed; existing large-chunk warning remains. Local loopback test server required the runner's socket permission; the successful final run used that permission. Logs: `.artifacts/swim-body-match-20261011/tests-final.log` and `build-final.log`.
- Browser review covers both full swimsuit bodies, exposed arms, raised dressed sleeves, open/fist hands, and bare feet. Screenshots are in `art/swim-body-match-20261011/`. Final whole-body screenshots use the built 4173 review route; arm/sleeve detail also uses the dev route.
- Physical live webcam inference and VR-controller hardware were not exercised. The new finger tests feed landmarks through `HeadTracking`, `FestivalWorld.updateTrackedBody`, native finger pose hooks and actual visible skinned vertices; they do not substitute for device acceptance.

Built full world: http://127.0.0.1:4173/?era=ps2&island

Built body reviews: http://127.0.0.1:4173/avatar-review.html?sex=male&swim&pose=idle&zoom=1.1 and the same route with `sex=female`.

Installed source SHA256:

- Male: `4c035dbf75f0ccad46f4ab096a798ab0a8c77c725cf71ba4c037aed58467fc28`
- Female: `20ba19cc771ac0a8a81e140aaf8072bed056c19c61aec7618b4bebd91ec2c5b3`

Working Blender scene: `.artifacts/swim-body-match-20261011/swim-body-matched.blend`. The source backup is `before.blend`; `male-before.glb` and `female-before.glb` preserve the installed input. Hidden script-reproduction probe objects are review-only and excluded from exports.
