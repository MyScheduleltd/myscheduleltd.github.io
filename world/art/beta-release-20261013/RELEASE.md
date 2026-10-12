# BETA avatar follow-up — 2026-10-13

Repairs the male skating neckline, stray skin/face marks, DJ wrist twist and floating shirt graphics on outfits 1–3. The regenerated female was rejected; the original asset and its wardrobe/rig path are retained. Both channels use the same production build. Current main is integrated; unrelated M.O.T.H changes are preserved.

## Verification

- 432/432 full tests pass, plus TypeScript/Vite production build.
- Every current build file matches each release package: 52 files per channel and 19 verified integrity hashes per channel.
- Female asset is byte-identical to the original. Male body/cap/shoe/trouser/vest surfaces and embedded texture bytes are preserved; shirt and six graphic meshes intentionally change.
- Graphics follow cloth with matching skin weights and 0.2 mm authored clearance; posed clearance stays under 1.5 mm through skating, punching and dancing.
- Actual DJ wrist skin volume is checked through the working cycle. Local built close-ups visually reviewed the symptoms.
- Production API is the existing Render endpoint. No server change is added by this follow-up. Physical webcam/headset measurements were not performed.

## Local browser evidence

- [Skating neckline](../avatar-followup-20261012/skate-final.png)
- [Cleaned face](../avatar-followup-20261012/face-after-v2.png)
- [DJ wrist](../avatar-followup-20261012/dj-final.png)
- [Shirt graphic during skating](../avatar-followup-20261012/print-outfit2-skate.png)
- [Original female restored](../avatar-followup-20261012/female-original-restored.png)

## Publication status

Release branch pushed after the initial approval-review account-limit failure cleared. Awaiting protected-main review; not live. After approval, merge normally, wait for Pages, then verify public entries and hashes. Retain old hashed assets for cached entries. Rejected female generation and diagnostic Blender files stay offline.
