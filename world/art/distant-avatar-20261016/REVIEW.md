# Distant avatar pose stability — local inspection

Status: local source repair only. No release packaging, push, or publication.

## Cause

`FestivalWorld.cullAvatars()` intentionally updates visible avatar skins every other frame beyond 35 m. Both residents and remote visitors share this path. `animateRig()` still resets the visual body's floor offset before preparing each frame. On the throttled frame the floor solve and imported skin synchronization were skipped, so the previously supported skin was rendered beneath a reset visual parent. On the next full frame its support returned. This alternation caused the rapid vertical shifting, disappearing at close range.

`ImportedAvatar.syncImportedAvatar()` now holds the committed body's local position, rotation, and scale with its bone pose on the skipped frame. Authoritative root translation continues every frame, so remote motion and resident walking stay current. The original distance animation budget and culling remain in place.

## Measured reproduction

The probe bundles the actual production `FestivalWorld.animateRig` and current accepted male/female GLBs. A diagnostic-only bundle reproduces the former early return without modifying source or assets. It advances each authoritative root by 0.04 m for 240 frames and alternates full/throttled poses, comparing the rendered skin to the previous full pose plus authoritative travel.

| Body | Former maximum alternate-frame vertical shift | Repaired shift |
| --- | ---: | ---: |
| Male | 0.194281 m | 0 m |
| Female | 0.140661 m | 0 m |

Remaining total position residual is below 4e-15 m. Raw metrics: `pose-probe.json`. Reproduction script and logs are in `.artifacts/distant-avatars-20261016/`.

## Regression coverage

- Actual GLB skin vertices hold the complete supported pose while network/collision roots continue moving.
- The real 35 m frustum/distance culling method alternates distant poses and immediately resumes full updates nearby, retaining floor contact.
- Male and female seated, skate and dance skins retain body transforms as well as native bones.
- Gate-preview disposal unregisters the avatar and frees private materials/bone textures exactly once. Other avatars continue to use their shared geometry safely.

The complete `coastal-pose.test.mjs` suite passed: 97/97 tests in 29.1 s. It covers the unchanged nearby rig and garment behavior. `git diff --check` passed for the changed avatar source and tests. Browser motion validation is a separate root-owned check; these geometry results do not claim a recorded browser or physical-device result.
