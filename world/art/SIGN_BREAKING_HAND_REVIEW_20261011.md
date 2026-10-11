# Hand, sign, dance and entry review — 2026-10-11

The female dressed hands now have four separate fingers and one proportional thumb. The generated palm shelf on the thumb side of the index root was removed, and the skin follows the existing three-joint finger rig. The wrist loft now matches the original forearm width on the thumb side and blends forearm/hand weights. A filled thenar pad and blended thumb-root weights keep the curled pose continuous below the thumb. The male palm/finger-root holes were closed without replacing its fingers. Outfit masks, cap morph, rig and swim skin remain in the exported assets. Repairs and export used live Blender MCP. SHA-256 hashes and sizes are in `SIGN_BREAKING_HAND_ASSETS_20261011.json`.

## Local visual evidence

- [Female right open, outfit 1](sign-breaking-hands-20261011/female-right-open.png)
- [Female left open, outfit 2](sign-breaking-hands-20261011/female-left-open.png)
- [Female left fist, outfit 3](sign-breaking-hands-20261011/female-left-fist.png)
- [Female left fist side, outfit 3](sign-breaking-hands-20261011/female-left-fist-side.png)
- [Female right fist, outfit 1](sign-breaking-hands-20261011/female-right-fist.png)
- [Male left open, outfit 3](sign-breaking-hands-20261011/male-left-open.png)
- [Male right fist, outfit 2](sign-breaking-hands-20261011/male-right-fist.png)
- [Clean matte sign back](sign-breaking-hands-20261011/sign-back.png)
- [Breaking sector and freeze icon](sign-breaking-hands-20261011/breaking-wheel.png)
- [Desktop full-body tracking enabled by default](sign-breaking-hands-20261011/desktop-tracking-default.png)
- [Real MediaPipe thumb-up detector](sign-breaking-hands-20261011/webcam-real-detector.png)
- [Real MediaPipe index-up detector](sign-breaking-hands-20261011/webcam-real-index.png)

## Verification and limits

405/405 tests passed with loopback access; the restricted runner initially rejected server listeners with EPERM. Production TypeScript/Vite build passed. Both Pages channel packages are copied from that build, retaining older hashed assets. There are no server changes and no new Render redeploy requirement for this PR.

Blender topology inspection found zero open boundary edges on both repaired dressed hand skins. Tests require all five distal digit surfaces and exported outfit masks for both models in outfits 1–3, and finite skinned positions in open and closed poses. Browser evidence uses the actual compressed exports and runtime materials. The real detector review uses Google MediaPipe public test images, not a webcam. Physical webcam movement and headset/controller validation remain untested.

Sound-on gate entry was exercised in the browser and the sound panel retained its unmuted state. The audio graph now starts in the gate gesture, is reused by the world, resumes on interaction, and shows an Enable sound button if browser playback is blocked. Discarded-tab rejoin restores the last session sound choice instead of always choosing mute; this discarded-tab branch is covered by source tests rather than an artificially discarded browser.

Desktop camera start requests body and fingers by default before opening the shared webcam. The visitor can opt out. Real detector thumb/index poses run through the existing desktop avatar tracking runtime. B opens the wheel; Enter starts Breaking, and Escape cancels the menu. The button fills the top wheel sector and its label and freeze icon fit inside it.

Publishing remains subject to the repository's required last-push review by macakinTT. A PR is not a live Pages deployment.
