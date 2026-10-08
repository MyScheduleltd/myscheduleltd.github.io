# Codex handoff: current state, 2026-10-08 (read this first)

Written by Claude at the end of the 2026-10-07/08 sessions. **This section supersedes everything below it.** The older sections are history: they describe isolated worktrees, rejected builds and processes that no longer apply. Where they disagree with this section, this section is right.

## Wish-wall enlargement release — Codex, 2026-10-08

- Owner requested a larger in-world message board and authorized publication on 2026-10-08. Release branch: `codex/enlarge-wish-wall`, based on `origin/main` (`0df1d49`). Both channel bundles are prepared; publication awaits the protected PR's approval and merge.
- `FestivalWorld.ts`: scale the complete wish wall by 1.5 (board width 4.6 → 6.9), increase title/empty-state/plaque lettering, and scale the collision bounds and interaction span to match.
- Position is now `{ x: 67.6, z: -7.5 }`; moving south keeps the wider cap clear of the temple stairs while leaving the residents' x=65 route clear.
- Loopback preview: `http://127.0.0.1:5173/?era=ps2&island&review=coastal&view=wishWall`. This view is reapplied after session restoration to keep the camera stable.
- Verified the enlarged empty board visually in the local phone-width preview. Screenshot: `/private/tmp/wish-wall-enlarged-20261008.jpg`. Populated plaques and a physical phone have not been visually checked.
- `npm run build` passed (includes TypeScript); all 384 tests passed with localhost binding enabled; `git diff --check` passed. Both channel entry files reference `main-BWe7gUX3.js`. No server source changed, so this release needs no Render redeploy.

## How shipping works now

1. **`main` is protected** (since 2026-10-07).
   - Every change is a PR that needs 1 approving review. `enforce_admins` is on, the last push must be approved, and stale approvals are dismissed.
   - This machine pushes as **MyScheduleltd**, the owner's account, which cannot approve its own PRs. **macakinTT** approves; **brain00021** is also trusted.
   - The owner approves in **Files changed → Submit review → Approve**. The conversation page has no approve button.
   - Request the review with `gh pr edit N --add-reviewer macakinTT`.
   - Never disable or bypass the protection.
2. **Never stack PRs.** Merging the first PR moves the second one's merge base, GitHub dismisses its approval, and even a fresh approval counts as stale until the branch is merged with `main` and approved again. One PR at a time, or one PR with everything.
3. **The owner approves before anything ships.**
   - Show screenshots and test results locally first.
   - A PR is not live until it is merged. Say "awaiting macakinTT's review", never "shipped".
4. **Client = GitHub Pages**, two channels, both published from `docs/`:
   - `/beta/` → `docs/beta/`
   - `/beta/ps2/` → `docs/beta/ps2/`
   - `/beta/?era=ps2` is the `/beta/` bundle with the PS2 style on, not the ps2 channel.
   - Publish both every time so they match. Build first, because the publisher only copies `dist/`:
     ```bash
     cd world && npm run build
     node scripts/publish-beta.mjs --channel beta
     node scripts/publish-beta.mjs --channel ps2
     ```
   - `npm run build:beta` exits 1 on purpose.
   - Commit `docs/beta` in the same PR as the source.
   - Pages caches `index.html` for 600 s. "The fix didn't work" is often a stale page.
5. **Server = Render**, `https://myschedule-festival.onrender.com`, behind Cloudflare.
   - **Deploys are manual**: merging to `main` does not redeploy it. Tell the owner "Render needs a manual redeploy" whenever `world/server/**` changed.
   - `/api/config` returns `build` (the deployed commit).
   - **No disk.** Runtime state lives on the instance, and a redeploy boots from `world/server/festival-seed.json`.
   - To keep STAFF edits across deploys, capture them with `node world/scripts/capture-state.mjs` (reads the live admin state) and commit the seed.
   - Resident profiles in the seed are only honoured with a matching `djProfileSeed`. This is now captured and committed, so STAFF edits to introductions and credits survive.
6. **Source of truth is `origin/main`.** The "live bundle source not on main" problem (codex shipping `docs/` from non-git `band-repair-20261004`) was resolved on 2026-10-07: `main` now rebuilds exactly what is live.
   - Develop on a branch from `origin/main`. Do not ship from `band-repair-20261004`, `gate-entry-fix` or any other old worktree.
   - **Never ship codex's old server copy**: its `/api/config` leaked the STAFF receipt mailbox (`offeringReceipt`).
7. **Never `git add -A`** in shared worktrees. Stage the files you changed.
8. **Secrets:** never put ECPay HashKey/HashIV, the STAFF key or any token in code, commits, PR text or chat.
   - The owner has pasted ECPay key screenshots before; do not repeat them.
   - ECPay test-stage keys in `donations.mjs` are ECPay's public stage keys and are fine.
9. **Payments:** never write ECPay API code from memory. Read the spec on developers.ecpay.com.tw first; each function cites its page.
   - Do not send test requests to the live ECPay service.
   - Server tests stand ECPay up locally with `ECPAY_STAGE_INVOICE_BASE` (honoured on stage only).

## Live state on 2026-10-08

- **GitHub Pages:** `main` = `c3c6f86` (PR #13). Both channels serve `main-CBOHtRPn.js`.
- **Render:** still on `bf839ff` (PR #10). **PRs #11–#13 need a Render redeploy** before the wish wall, the corrected credits and the STAFF invoice check work. The owner has been told.

## What shipped (PRs #1–#13, all merged)

| PR | What |
|---|---|
| #1 | Removed the unused root Vue/Vite toolchain. |
| #2 | Invoice and checkout item name `網路服務費`, unit `次`; removed the festival's own receipt email (Resend). |
| #3 | Seeded every programme film's length (`trackDurations`, 49 films, all checked against YouTube). |
| #4 | `MIN_DONATION` 30 (below it ECPay hides store payments). Phone barcode invoice carrier (CarrierType 3). Guests can donate from the sign-in page (5 open per `CF-Connecting-IP`, 200 total). |
| #5 | `InvoiceNotify` after Issue (ECPay emails the invoice: InvoiceTag I, Notify E, Notified C). |
| #6 | Phone performance: static scenery merged into batches (`world/src/world/StaticBatch.ts`) with identical materials shared; off-screen residents not animated, distant ones every other frame. 精簡 is crisp pixels (pixel ratio 1 + `image-rendering: pixelated`, render-scale floor 1). The 通行證 button sits behind open menus. Phone-like test went from 17 to 32–35 fps (一般) and 21 to 42–51 fps (精簡). All 17 lamps stay lit (owner's rule). |
| #7 | STAFF → 供養收據: list of recent offerings with invoice number or ECPay's refusal, and a **重新開立發票** retry. `CarrierNum` is `''` for ECPay's carrier. |
| #8 | Band guitar and bass textures re-saved at JPEG q90 (`world/scripts/lighten-band-textures.py`); band 12.9 → 8.5 MB. |
| #9 | Load speed. No `male.glb` preload ahead of the sign-in page (the gate took 29 s on the owner's connection). Models and textures come from **jsDelivr** (`world/src/world/AssetMirror.ts`), each checked against a SHA-256 in `assets/asset-integrity.json` (vite plugin), falling back to Pages. The band prefetches at the gate. The STAFF offerings list refreshes itself, and Render logs every offering step (`Offering … opened/paid`, `Invoice … issued`, `Invoice not issued for …: <reason>`). |
| #10 | Jukebox records cut off at 3:35: the jukebox now uses `trackDurations`. Missing lengths are looked up on YouTube at start and when STAFF add videos. The jukebox lengths are seeded. |
| #11 | Temple **wish wall** (祈福牆), resident **music credits** (音樂製作), STAFF **檢查綠界發票設定**, scrolling jukebox list, NPC title under the name in the attendee list. |
| #12 | XIEH GAN's English credits per the owner: One Two Free; 執行製作 = producer; titles with no official English keep the original Chinese. |
| #13 | 音樂製作 only on XIEH GAN's card (`CREDIT_CARDS` in `App.ts`). |

## Open items, most important first

1. **No 電子發票 has ever been issued.**
   - Evidence: ECPay backend 字軌 FU (115年 9–10月, 67503600–67503949) shows nothing used. The owner gets ECPay's payment confirmation but no invoice.
   - Likeliest cause: Render's `ECPAY_INVOICE_HASH_KEY` / `ECPAY_INVOICE_HASH_IV` do not match the keys under ECPay 電子發票 → 系統開發管理 → 系統介接設定. The owner confirmed on 2026-10-08 that they don't match. `ECPAY_INVOICE_MERCHANT_ID` is 3515470.
   - Next steps:
     1. After the Render redeploy, the owner presses STAFF → 供養收據 → **檢查綠界發票設定**. It calls read-only `GetInvoiceWordSetting` with Render's keys and shows either "keys accepted" plus the 字軌, or ECPay's refusal. ECPay answers wrong keys with HTTP 500.
     2. Fix the keys in Render, redeploy, and recheck.
     3. Make an NT$30 test donation with 我要收據 ticked.
   - Render logs show each step; search `Offering` / `Invoice`.
   - Paid offerings from before a redeploy are not in the STAFF list (no disk). Those invoices must be issued by hand in ECPay's backend.
   - The owner should set ECPay's backend invoice notification option to 不要開啟, or donors get two emails.
2. **jsDelivr purge after model or texture changes.** `AssetMirror` reads `@main`, which jsDelivr re-resolves at most every 12 h. A release that adds or changes a GLB/PNG/JPG is served from Pages (slow) until then. After such a merge, purge each new file, for both channels:
   ```bash
   curl https://purge.jsdelivr.net/gh/MyScheduleltd/myscheduleltd.github.io@main/docs/beta/assets/<file>
   ```
3. **Flaky test.** "staff can rotate the key" fails about half the time even on untouched `main`. It predates this work and has not been fixed.
4. **Housekeeping:**
   - `.claude/launch.json` at the repo root has an `offerings-dev` entry pointing at the `release-npc-20261006` worktree.
   - `release-npc-20261006/world` and `invoice-notify-20261007/world` have `node_modules` symlinks.
   - Old dated worktrees (`ps2-publish-*`, `avatar-*`, etc.) are untracked clutter.
   - Ask before deleting any of it.

## Owner decisions to keep

- The offering is a **sale** (網路服務費), not a donation. A real 統一發票 is issued every time. Unticked 我要收據 sends it to the STAFF receipt mailbox (seeded `offeringReceipt`). Minimum NT$30. No paper invoices. The only carriers are ECPay's own and a phone barcode.
- **Wish wall:**
  - Notes are ≤ 60 characters, posted only after ECPay confirms payment.
  - Signed with the visitor's name, a sign-in-page guest's typed gate name, or 訪客.
  - **Memory only, never written to disk, newest 30.** The owner explicitly asked for this. A restart clears the wall.
  - The wall stands at `WISH_WALL {x 67.6, z -6.6}`, the foot of the temple stairs, facing the road. **x = 65 is the residents' path (hill1 → hill2)**; keep it clear.
  - Notes are cleaned by `wishText` (keeps full-width Chinese punctuation; `safeText`'s NFKC would fold it).
  - STAFF remove notes under 供養收據.
- **Credits:** XIEH GAN only. Official English names where they exist, otherwise the original Chinese. 執行製作 = producer. The Golden Melody footnote is confirmed. The defaults live in `world/server/index.mjs` (djProfiles), `world/src/data/djProfiles.ts` (build copy) and the seed.
- **Phones:** lamps stay at 17 (the owner rejected fewer lamps). Distant residents animating less is accepted. 精簡 = crisp pixels.
- **Band:** clean straight wrists. The guitarist's fretting fingers are display-only curl `(.7, 1.05, .6)`. The band plays only while the jukebox has a record. The NIMA ROOFTOP deck stays untouched.
- **The Google Drive browser key is an accepted risk.** Do not re-raise it. Direct card entry was dropped (PCI cost); do not re-propose it.

## How to test and review

- Run `npm test` (384 pass at `c3c6f86`, give or take the flaky one) and `npx tsc --noEmit`.
- Local dev: `npm run dev` (client on 5173 + service on 8787). The local STAFF key is the code default `myschedule-local-admin`.
- Local-only review shortcuts (`?era=ps2&island&review=…`): `dj-about`, `dj-credits`, `wish-wall`, `band-street-play`, `perf`, and others in `App.ts`.
- Headless performance and loading checks (CDP):
  ```bash
  DPR=3 CPU=4 node tools/perf-probe.mjs "http://127.0.0.1:5173/?era=ps2&review=perf&island" 390 844
  ```
  The browser pane suspends rAF, so don't measure in it.
- ECPay without ECPay: the server tests start a local stand-in for `/B2CInvoice/*` on the public stage keys (see "STAFF see an offering…" and "STAFF can ask ECPay whether the invoice keys work…" in `server/server.test.mjs`).

---

# Current local avatar rebuild — 2026-09-29

This is the isolated `avatar-rebuild-20260927/world` copy. Read `../art/BUILD_NOTES.md` for completed changes, source provenance, validation and the local review URL. The user has NOT approved publication. Historical deployment instructions below are background only and do not authorize publishing this build.

Preview: http://127.0.0.1:4337/rebuild-review.html

REJECTED by the user on 2026-09-28: bench penetration, overlapping routes, spinning wrists, flat faces, malformed fingers/shoes/trousers, crushed singer torso and misplaced stage equipment. The previous 325 passing tests and successful build did not establish visual correctness. Repair v2 is in progress; see ../art/QUALITY_REPAIR_V2.md. Do not publish to `/beta/` or `/beta/ps2/` without explicit approval.

## Active continuation for Claude — September 29

User requests supersede historical publishing commands below: **nothing may be published to either beta channel without approval**. Work only in this isolated copy. Baseline `character-native-20260924` is not the repair workspace.

Latest user additions: swollen male palms/wrists; remaining cap/hair intersections; replace yellow/red/green location channel badges with monochrome treatment matching the PS2 UI. Preserve designs, branding, colours and proportions. The user asked this handoff be kept current.

Implemented locally, still under visual verification: rounded faces, rebuilt articulated fingers and layered shoes; trouser clearance and female lower-leg flare; shared larger cap with crown morph; individual standing sole grounding and wider stance; band bone-tail repair (imported limb tails were 100x joint distance), continuous wrist quaternions, torso/skirt weights, measured seat contact, shoulder straps, larger centred drum riser, serialized routes with standing/seating transitions.

**Known remaining defects:** close-up confirms male wrist/palm swelling, including the forearm-owned area above the wrist. Both shoe minimum heights pass but shoes still tilt sideways: foot retargeting inherits the leg A-pose correction. Cap crown/band intersection must be rechecked after edits. Band v2h has been exported; hand-target reach is sub-centimetre for most performance poses (bassist right up to 1.08 cm) but sitting vocal/bass targets remain 4–6 cm unreachable. Full visual cycles and seated contact must be rechecked. Mid-route reversal now defers to completion of the reserved journey; regression verification pending.

### Claude, September 29 afternoon — male hands (awaiting the owner's review)

- Cause: the male generation's wrist is a 12.5 × 9 cm balloon (the female's is ~7 × 5). `refine_wrist_volume` clamped it about the wrist *bone*, which is 2.5 cm off the arm's centre, and it reached the whole palm, crumpling the palm and pinching the thumb into it. It was removed. `art/refit_caps.py` no longer calls it.
- Fix: `rebuild_palm` (male only) cuts the hand off 5 cm above the wrist bone, slims the forearm stub, and lofts a rounded-box wrist and palm (with a thumb pad) onto the existing finger tubes, ending at the knuckle line. The thumb is a `finger_mesh` tube on the existing Thumb1–4 bones, with its normals recalculated (one thumb came out inside-out and rendered as a brown patch). New faces are textured only from source faces that read as skin. The female hand is unchanged.
- The assets are now a clean full build (`Blender -b --factory-startup -P scripts/prepare-higgsfield-avatars.py`, about 90 s), not the incrementally patched blend. Head renders match; the female cap sits about 7.5 mm higher, clear of her eyes. `AVATAR_OUT` / `AVATAR_WORK` send a trial build elsewhere.
- DJ pose: the platter hand's target moved to (-.99, 1.27). The 40° wrist limit keeps its fingers raised; that asymmetry predates this change.
- `npm test` 326/326, `npm run build` OK. Evidence: `../art/validation/v2/male-hands-before-after.jpg`. The pre-change copy is in the session scratchpad snapshot.
- Still open: shoe tilt, cap/hair recheck, seated vocal/bass hand reach, full band cycles, mid-route reversal.

### Claude, September 29 evening — outfits, cap, grip (awaiting the owner's review)

The owner reported: the arm orientation is wrong when holding a drink or popcorn; the outfits look broken; the cap is too big on both.
- **Outfits.** `retarget` is bone-by-bone again, as in the approved Sep 27 build, with two changes. Each bone turns by the least rotation toward the joint it leads to, not its tail (the new male's Hips tail is 91° off the clothed model's, which twisted the tee's lower half). Only the bones in FOLLOW count (thigh weights on the tee's hem split it into teeth). The Sep 28 whole-body "spatial fit" shrank the tee and trousers and opened a dark gap at the waist; it is deleted. The tee and trousers now match the Sep 27 silhouettes.
- **Cap.** It is still one shared master, scaled by `CAP_SIZE = .85`. At .242 it was about 23% wider than her hair.
- **Grip.** `ImportedAvatar` now measures the hand frame from bones: fingers from the wrist to the knuckles, palm from the rest curl. Before, it guessed the palm as "inward", and the male's came out 48° off, so he held the cup palm-up. At rest the lowered hand is rolled so the palm faces the thigh, half of the roll in the forearm. Carrying closes the hand part way (`setImportedGrip`); `animateRig` releases it every frame via `releaseCoastalGrips`.
- DJ: platter target (-1.005, 1.27). The test's platter bound moved from -.9 to -.85, because the mixer only spans |x| < .41.
- **Known issue:** the avatar build is not deterministic. The female eye height, and so her cap band, varied 5 mm between identical runs (atlas packing). The installed assets are the exact build that was reviewed (the scratchpad `trial-fit3`); a rebuild may shift the cap slightly.
- `npm test` 326/326, build OK. Evidence: `../art/validation/v2/outfits-cap-grip-before-after.jpg`.

### Claude, September 29 night — cap clipping, neck, female head (awaiting review)

- **Cap.** `cap_hair_key` now eases hair out from under the rim over `CAP_SKIRT` (7 cm; Sep 28 used 3 cm, so curls bent out sharply at the rim). It keeps the fringe under the bill's underside and never moves face or ear skin; scalp above the band is tucked. The cap stores its `fit`, so the scratchpad `cap_clip.py` counts clipping hair. Hair clipping is now 0 on both; the male's remaining counts are forehead skin where the bill sits on the brow.
- **Neck.** `lower_collar` cuts the tee near the neck at the neck bone's base + 6 mm. The clothed models wear the crew neck like a turtleneck: 6 cm up his neck and 4 cm up hers, to the chin. The tee is also carried without head bones (falling back to `neck`).
- **Female head.** The owner called it broken. The Sep 28 regeneration is a box: flat-topped hair, a chinless square face, and an ear poking through the hair. `art/generated/female-base-rigged.glb` is now a symlink to the Sep 25 generation (the one on /beta/ps2/); the Sep 28 file is kept as `female-base-sep28-rigged.glb`. `AVATAR_SOURCE_<STEM>` overrides a source for comparisons.
- Next: outfits (tee, sleeves, trouser cuffs per the reference sheets, the waist join, prints and vest), shoes per the reference sneaker, and all animations; the owner flagged every group.

### Claude, September 30 — shoes, outfits, animations (awaiting review)

- **Shoes.** `clean_shoes` is rewritten after `art/generated/shoe-reference.png` as solid blocky panels coloured per face: a stepped ivory sole with an arch notch and a toe bumper, a black upper with an overlay toe cap, eyestays, an ankle strap and a heel counter, four flat laces, and a padded collar that dips to the tongue. His overlays are the reference's muted brick red on charcoal; hers are grey.
- **Tee.** `tidy_tee` repaints the bottom of the shirt: `plain_hem` gives every non-black face below the waist the UV of a plain patch of the shirt's front, because the generator painted the belt's grey and camouflage into the hem. It also trims the sleeves' teeth to a line square to the arm (openings that sit round an arm only) and extrudes a 1 cm rib at the neck. (A geometric hem cut failed: the textured band is the shirt's own rolled hem.)
- **Trousers.** `jogger_cuffs` (male) tapers each leg below the knee, never tighter than the sneaker collar (8.4 cm).
- **Animations.** Reviewed as filmstrips with the scratchpad `filmstrips.py` + `cdp-shoot.mjs` (headless Chrome over DevTools; it waits for `data-avatar-review` before capturing). Fixed: the punch guard (the elbow was bent only 72°, so both arms reached forward); the dance (it read as standing about: the knees now drop on each beat, the fists pump in turn, the chest twists, the head nods, and the feet stay planted per its test); the fall (arms thrown up in a V; its test caps knees < .5). Walk, hit, wave, sit, DJ, drink, eat and skate read correctly. The landing is shallow but capped by its test (knee ≤ .71).
- **Known:** with the arms raised high (fall, dance peak) the male armpit shows through: the sleeve pulls off the side and skin under clothing is not drawn.
- `npm test` 326/326.
- **Later, same day — fall wings.** In the fall his tee's sides dragged out into black wings down to the hem. The flank skin carries arm weight and `body_weights` copied it onto the side panels. `sleeves_only(arm)` is now a limit for the tee: past the shoulder cap an arm or hand bone keeps its weight only within `SLEEVE_REACH` (9.5 → 11.5 cm) of the upper arm's axis; every sleeve vertex is within 9 cm, the side panels start at 12. A vertex left with no weight borrows the nearest body vertex free of arm bones. The long faces are gone: the worst stretch in the arms-up pose fell from 52 cm to 20 cm, and that is armpit only. The installed assets are trial-flank2, which includes the muted-red shoe colours. The trial-jog1 assets are backed up in the scratchpad as `installed-jog1/`. Evidence: `../art/validation/v2/fall-tee-before-after.jpg`.

### Claude, September 30 — island prototype (exploration, owner has not reviewed)

The owner asked to explore the map as a small planet (like messenger.abeto.co): the festival as a tiny island ringed by sea, with a landing dock and a moored boat at the gate. It is loopback-only behind `?island`; without the flag nothing changes. `npm test` 326/326, `npm run build` clean.

- **`?island`** (`src/main.ts`): installs the planet before `App` imports anything. `?island=<radius>` sets the radius (default 320); `?island=flat` gives the island without the curve.
- **`PlanetCurve.ts`**: the Animal Crossing / Messenger trick. Gameplay, collision, NPCs and cameras stay flat; only drawing wraps the world round a sphere centred under the visitor.
  - `project_vertex`, `worldpos_vertex` (so shadows and fog follow the bend) and the sprite shader are patched.
  - Every program gets the `planetCentre` and `planetRadius` uniforms through an accessor on `Material.prototype.onBeforeCompile`, which keeps each material's own hook and cache key.
  - The sky (renderOrder ≤ -2) is `keepFlat`.
  - CSS3D screens are moved and tilted whole by `bendCss3d`.
  - The stylised water has its own `PLANET_ON` path.
- **Terrain** (`CoastalTerrain.ts`):
  - `ISLAND` is a rounded outline with coves and headlands (quiet due north). The land runs down a 16-unit beach into the sea, and the terrain grid is widened and trimmed round it.
  - `ISLAND_COVE` cuts a walled harbour basin from z = 71 northwards, x ±18, directly outside the gate.
- **`IslandDock.ts`**: quay walls with coping and a tide band, 16 stone steps down from the quay, a timber pier with a T-head, bollards and tyre fenders, and a lofted ferry. The ferry has a blue bottom, white topsides, a wheelhouse with a red roof, a mast lamp, rails and a life ring. It is moored with rope lines and rides a slow swell.
- **`FestivalWorld.surroundIsland`**: replaces the Shore's sea sheets with a 1500-unit, 150×150 plane round the island and adds a path from the gate to the quay.
- **Review helper** (loopback): `__festivalAerial([x,y,z],[x,y,z])` holds the camera, pushes the fog back and centres the planet on the look target. With no arguments it hands the camera back.
- **Arrival by boat** (the owner's decision): on the island every visitor starts on the pier head (`DOCK_ARRIVAL`) beside the ferry and its gangway, and walks up the pier, up the steps, across the quay and in through the gate.
  - `IslandDock.heightAt` is the walking floor: the steps are one even ramp, the pier and head are boards. `groundHeightAt` asks it first, and `isOverWater` does not swim a body standing on it.
  - `IslandDock.barriers` adds zero-padding colliders on the quay edge, the basin's side walls and every edge of the pier and head.
  - The north clamp is `northLimit()`: `GATE_Z - 2` normally, and the pier's end on the island.
  - Checked by holding keys in headless Chrome: pier head to z 25.8 inside the festival, and every edge holds.
- **Second pass (owner's screenshots).**
  - **Subdivision:** `subdivideSceneForPlanet` splits every large static mesh to 3-unit edges, keeping groups and every attribute. Walls, floors and roof slabs now bend with the ground instead of floating over it or being cut by it, which also fixes the rooftop band floating.
  - **Sea:** `seaAroundIsland` leaves out sea cells that stand wholly on dry land, so no water shows through the club's floor.
  - **Beach:** it only ever lowers ground, so the old seabed is no longer walled into a lagoon.
  - **Ferry:** it lies 0.6 further out, so it no longer clips the pier head.
- **Donate:** the staff-ui branch (179fe46 + fc56593) is patched in, giving the gate Donate button, title editing, scroll-keeping and the 曲名 width. This build's `/api/config` still returns `offeringReceipt`, which the unmerged fix-config-mailbox branch removes. Never ship this server.
- **Not yet done:**
  - Clicks on far objects are not bent.
  - The harbour has no lamps of its own at night.

### Claude, September 30 evening — band seats, faces, skin, toes, collars, walk

- **Band at the fire** (`prepare-band.py`, pose-only rebuild):
  - Measured in Blender, the calves and toes went 11–15 cm into the log rounds under the bench, and the hands sat on the knee joints themselves.
  - The feet are now planted forward on the floor, the hands rest on top of the knees (clear of the leg's thickness), and the seat clears 3.5 cm, not 8 mm: the browser's four-weight skinning sank the trousers into the log.
- **Avatar build** (`prepare-higgsfield-avatars.py`), the owner's choices, in build order:
  - **Toes:** `rebuild_toes` cuts each foot a little ahead of the ball, caps it and lofts five toes (big toe widest), textured from the foot's clean skin and weighted to ToeBase.
  - **Her face:** `flatten_face` replaces `round_face` for her. It fits a smooth surface over the front of her face (eye sockets included; only the fringe's strands in front are left out) and relaxes the edges in. `paint_face` then paints her sheet's face at her own proportions: tall eyes, dark inside and pale outside, a lid line, brows, a small mouth and blush. Her eye height is measured (0.435; `EYE_HEIGHT` updated).
  - **Neck:** `smooth_neck` relaxes the neck column and its join under the jaw.
  - **Skin:** `relax_skin` applies Taubin smoothing to body skin (not heads, hands, toes, shoulders or upper arms; relaxed under the sleeves it crept out through the tee). `clean_skin` paints one median skin tone.
  - **Collars:** `lower_collar` now trims out to 14 cm (the shoulder points). `clean_collar` removes tee scraps that were really the clothed model's neck and fills the rest with the shirt's own shade. `covered_faces` never hides the bare neck above the collar by the fan rule (that cut a hole in her throat), and counts skin with the tee directly over it within 5 cm as covered.
  - Env switches `AVATAR_COLLAR_RELAX` and `AVATAR_RELAX_SKIN` exist for bisecting.
- **Walk** (`scripts/prepare-walk.py` → `src/data/walk-cycle.json`):
  - It is taken from the owner's Mixamo reference (`../art/reference/walking-mixamo.fbx`, same bone names as ours): one 24-frame cycle from the right heel strike, read as rig joint angles (leg swing, splay and knee; arm swing, splay and elbow; chest and head).
  - `walkCoastalPose` plays it for everyone. Each stance foot is locked exactly where it struck, solved for the opened leg (`solveLeg`). The swing follows the reference, eased back onto its path.
  - The stride is 2.333, measured from the reference's travel. Running is untouched (it is the skate pose), and a carried item keeps its arm while the free arm swings.
- Installed: the avatar assets from the scratchpad's `trial-final1`, and the band assets from the pose-only rebuild. `npm test` 327/327.
- **Superseded the same night.** The owner judged the reshaped face and toes worse, and said the Higgsfield models themselves look fine: integrate them, don't remodel them.
  - **The actual cause:** the generated materials carry their base colour as emission (self-lit), which is how they look in the generator and on the reference sheets. `strip_emission` removes that so the world can light them, and the world's lighting then shows every small bump of the generated mesh: her nose and pout, the facet patchwork on his legs.
  - **Now:**
    - `AVATAR_RESHAPE` (comma list: `toes,face,neck,skin`) is empty by default, so no reshaping runs.
    - `smooth_skin` smooths every face, head included.
    - The runtime's `evenLight` (ImportedAvatar.ts, `AVATAR_EVEN = .72`) mixes each avatar's lighting toward an even amount taken from the scene's ambient, hemisphere and sun colours, so day and night still reach it but the facing of each triangle mostly doesn't. `setAvatarEvenness` tunes it.
  - The tee collar and cover fixes stay (those are integration). `relax_skin` stays off.
  - Evidence: `../art/validation/v3/generated-vs-game.jpg` and `avatars-in-world.jpg`. The installed avatar assets are `trial-asgen2`.
  - NPCs never go to the harbour.
  - At player height the curve hides the sea from parts of the Shore.
- Evidence: `../art/validation/island/`.

### 2026-10-01: modelled tee, her bob and face, cap, band fixes

- **Tee, both avatars** (`model_tee`): every cut through the generated tees left teeth, holes or a boat neck, so the tee is now built, not lifted.
  - It is made of rings round the torso and a tube down each upper arm. Each point sits just outside the outermost skin (a ray from outside in), and the tee gets looser toward the hem.
  - The shoulders get a shelf in to a round crew neck with a rib, and the hem and sleeve ends are exact with a turned lip.
  - Its winding faces out by construction. Never `recalc_face_normals` it: that turned her tee inside out, black with the prints inside.
  - Hem and sleeve length come from the generated tee. Weights come from `body_weights` plus `sleeves_only`.
  - Under the sleeves the arm skin is hidden only from 7 cm inside the sleeve end (`TEE_SLEEVES`), so the ragged hidden-skin edge never shows.
- **Her head** (the owner chose: remodel a block bob, repaint the face to the sheet, model a new cap, default black):
  - `build_bob` replaces the generated hair with a closed shell: a dome to a straight fringe at eye+.035, and a curtain falling straight to where her hair ended with a slight tuck.
    - The face window is ±45°. The edges turn in to the head (deep where no skin is left), and the underside closes to the neck.
    - The shell has its own pixel-block texture and a cream clip.
    - It joins the body before the atlas bake, so dye and CapHair treat it as hair.
    - The generated hair faces come off. Small holes left in the face are filled with UVs taken from the neighbouring skin.
  - `paint_sheet_face` paints the window one flat tone, with tall near-black eyes under the fringe (lid line, white glint, brown lower third), a tiny mouth and a faint blush. It paints every face in the window, whichever way it faces, because a gap showed the inside of the head.
  - Cap: the `CROWN` profile now leans in and rounds over (the old one was a pillbox), with `exp` 2.15, a longer bill pitched at 12° with more curve, and an opening over the strap at the back.
  - Runtime default cap colour is `DEFAULT_ACCESSORY_COLOURS.cap` (`#1d1f24`).
- **Dev switches:** `AVATAR_ONLY=female` builds one avatar; `AVATAR_STOP=dressed` saves `<key>-dressed.blend` in about 4 s.
- **Band** (`prepare-band.py`, pose-only rebuild with `BAND_REUSE=1`):
  - Benches are now `BENCH_SEAT` .34 (chibi knee height) and the seat marks sit `SEAT_FORWARD` .2 ahead of the log's middle. At .42 and centred, the shins went through the log's front.
  - The seated hands follow the forearm, found as the IK places the elbow.
  - `KIT_ACROSS` +.06 (was −.18): the bass drum is now in front of the drummer, and the riser centres on the throne.
  - The bass fretting hand is nearer the body (it was out of reach) and wraps under the neck. The plucking fingers hang across the strings instead of into the body.
  - Remaining: the singer's skirt back hangs about 10 cm into the log behind her (not visible from the front), and the drummer's right wrist is up to 5 cm short of the snare.
- Installed: the avatars from the scratchpad's `trial-all1`, and the band from the pose-only rebuild. `npm test` 327/327, `npm run build` OK.

Files: `scripts/prepare-higgsfield-avatars.py`, `scripts/prepare-band.py`, `src/world/ImportedAvatar.ts`, `CoastalPose.ts`, `RooftopBand.ts`; cached cap refit `../art/refit_caps.py`; validation `../art/validate_band.py`, `../art/render_band_review_v2.py`. Rejected v1 is `../art/rejected-v1/build-snapshot.tgz`. Current screenshots under `../art/validation/v2` include stale earlier frames; do not call them final without rerendering.

Build tools: official Blender `/Applications/Blender.app/Contents/MacOS/Blender`; pinned glTF CLI at `../.tools/node_modules/.bin/gltf-transform`. Blender sandbox segfaults; local execution with escalation has worked. Pose-only rebuild: `BAND_REUSE=1 /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/prepare-band.py`. Avatar cache: `.artifacts/higgsfield-avatars/avatars.blend`. Run `npm test` and `npm run build` locally; NEVER `build:beta`.

Validation so far: previous full suite had 324 pass / 1 DJ fingertip-height failure; DJ target adjusted and targeted checks pass. New both-sole/spacing check passes. Full suite/build after final assets is pending. Passing tests did not establish visual quality of the rejected v1. Read `../art/QUALITY_REPAIR_V2.md` for acceptance checks. Preview stays http://127.0.0.1:4337/rebuild-review.html.

---

# Codex handoff — 我的戲院 / MYSCHEDULE Virtual Festival

Last updated: 2026-09-27 · **PS2 preview (branch `character-native-20260924`): one Higgsfield body per sex, finger bones, Quest hands and webcam body tracking shown to everyone, a rooftop band — see Latest; `/beta/` still waits for the owner** · **§00 has two stale details, corrected in Latest** · **a fix that only moves *when* a symptom happens has not touched the cause** · **in a headset, `event.target` is not the focused field** · **iOS `vh` is taller than the screen — no emulator shows it** · **a fix that only moves a symptom is not one — measure both sides** · **walking must not move the camera — one avoidance owner, see Latest** · **curl is not a browser — test media hosts from a page, see Latest** · **the headset paints its own interface, and only a headset does — see Latest** · **two published channels — read §00 before publishing anything** · the temple offering through ECPay · venue renames and catalogue swap, the GANGAN statue, avatar accessories, the crowd, a measurement harness

> `world/CLAUDE_HANDOFF.md` now begins with a current continuation note. Its long body
> below `Read this first` remains the older architectural record and still contains an
> obsolete no-publish rule and branch name. Use this file for the active process.

---

# Latest: the PS2 preview's avatars, fingers, tracking and rooftop band — PS2 PREVIEW ONLY, `/beta/` untouched (2026-09-27)

Written by Claude for Codex. Everything below lives on branch
`character-native-20260924` (worktree `myschedule-pivot/character-native-20260924/`),
which is **not merged**. `main` carries only this branch's published
`docs/beta/ps2/` builds (cherry-picked, docs only) and one server commit.

## 1. What is live, and what is waiting

| | State |
| --- | --- |
| PS2 preview `https://myscheduleltd.com/beta/ps2/?era=ps2` | live, `index-BBp2PDhn.js` (2026-09-27) |
| Festival `https://myscheduleltd.com/beta/` | **unchanged**, `index-BeANdgLX.js`. The owner: "Not yet, please wait for further approval." Never publish `--channel beta` from this branch without it. |
| Service `myschedule-festival.onrender.com` | still build `b47d366`. `ed551b8` (limbs relay, below) is on `main` and **needs the owner's manual Render deploy**. Check `GET /api/config` → `build`. |

Publishing the preview, exactly as done every round:

```bash
cd character-native-20260924/world && npm run build && node scripts/publish-beta.mjs --channel ps2
cd .. && git add docs/beta/ps2 && git commit -m "Publish … to the PS2 preview only"
cd ../ps2-publish-20260924 && git fetch origin && git reset --hard origin/main && git cherry-pick <that sha>
git diff --name-only origin/main HEAD      # must list docs/beta/ps2/ only
git push origin HEAD:main                  # then poll the live index hash; Pages caches ~600s
```

Two corrections to §00, both verified 2026-09-24: **`/beta/?era=ps2` is not the
preview** (Pages ignores the query; it is the `/beta/` bundle with the worn PS2
style switched on; the preview is `/beta/ps2/`), and the `Coastal*.ts` tripwire in
`publish-beta.mjs` is gone (both channels approved 2026-09-14). `npm run build:beta`
now only publishes and exits 1 without `--channel`, by design.

## 2. Avatars: one Higgsfield body per sex

`scripts/prepare-higgsfield-avatars.py` builds `src/assets/avatars/{male,female}.glb`,
`*-dye.png`, `*-vest.jpg` and `avatars.json`. Sources are **untracked**, in
`character-prototype-20260920/art/generated/` (`male-base`, `female-base`, and the
clothed `base`, `female` `-rigged.glb`).

```bash
GLTF_TRANSFORM=<gltf-transform binary> /Applications/Blender.app/Contents/MacOS/Blender \
  -b --factory-startup -P scripts/prepare-higgsfield-avatars.py
```

- **One body under every outfit** (owner's request): the base generation in its
  swimsuit; tee, trousers and shoes lifted off the clothed generation, carried
  across the skeleton, pushed outside the skin, skinned like the skin beneath.
  Skin under a garment carries `_covered` and is discarded while dressed.
- **Fingers are rebuilt** (`rebuild_fingers`). Generated fingers were fused and
  randomly triangulated, so the four are cut at the knuckle line and remade as
  tubes with three loops per joint: bones `<Side>Hand<Finger>1..3` and an
  unweighted `4` at the tip, Z toward the palm (+X curls). The thumb is the piece
  above the knuckle line not joined to the fingertips, grown back by surface
  distance. Each new face takes its texture from the **one** nearest old face
  (per-corner lookups landed on different UV islands: noise).
- **Shoes are carried by translation only** (`level_shoes`). Rotated bone by bone,
  the two models' foot bones disagree and his toes stood up about 20°.
- **Tee over trousers**: the two came off the clothed model along one jagged colour
  boundary, so their edges interlock. `level_hem` pulls the hem's notches down to
  its teeth, `trousers_under` removes the trousers the tee covers, `over_trousers`
  pushes the tee outside what is left along rays from the spine. A shrinkwrap by
  the trousers' own normals did not work: they do not all face out.
- **Hair is rigid to `Head`** (`hair_rigid`); the bob's neck-weighted ends
  twisted away from the head on a skateboard.
- **Eyes**: his are the brown of his hair, at z .47–.505. The texture classifier
  loses them whenever the atlas repacks, so `EYE_HEIGHT` stands in, and the dye mask
  leaves the eyes out of the hair class **by position**. A fallback of .421 was
  wrong for two builds and put his cap's brim over his eyes.
- **Caps share proportions**: crown height `CAP_RISE` = 1.05 × the band's half
  width (sized to his curls it was 1.66 and swallowed his head).
- Unchanged traps: weld before Smart UV (unwelded meshes used 4% of the atlas),
  padded conservative texels, dye mask R skin / G hair / B garment.

## 3. Hands at run time, and tracking

- `HandPose.ts`: poses are joint angles. `ImportedAvatar` applies them as the
  difference from the modelled rest, measured the same way, so any hand fits any
  body. `setImportedFists(closed)` and `setImportedHandPose(right, pose | null)`.
  The Fist shape key is gone. **The rig's names are mirrored**: the visitor's
  left hand drives `rig.rightArm`, passes `right = true`, and moves the model's
  `Left` bones.
- **Quest bare hands**: the session asks for `hand-tracking`. The arm reaches for the
  tracked wrist (not the pointer ray), `turnWrist` follows the real hand every frame
  with no calibration, and `poseXrFingers` eases the 25 joints into finger angles.
- **Desktop webcam** (`HeadTracking.setBodyTracking`, a switch in the head-tracking
  panel): MediaPipe `pose_landmarker_full` and `hand_landmarker` on the face
  tracker's camera and runtime, fetched no-store and **SHA-256 pinned** in
  `INTEGRITY`. `updateTrackedBody` shows the body headless in the preview. It drives
  arms, wrists, fingers and chest, and drives legs only while standing still with
  all six leg landmarks visible.
- **Everyone sees it**: `TrackedLimbs.ts` is the wire format (arms as wrist over
  shoulder over reach, in the body's frame; hand directions; finger angles; chest;
  legs; head). The service's `safeLimbs` must agree on `LIMB_FIELDS`.
  `limbsForNetwork` sends and `applyLimbs` replays, played out between updates like
  positions.
- **None of this has run on a real Quest or webcam.** Tests drive synthetic joints
  only.

## 4. MENTOR on a head

`perchMentor` lays him down (front paws forward, hind legs folded, each on its own
side; the legs were rolled under the belly and crossed). He rests on a height field
of the hair or cap (`importedHeadSurface`), settled 2 cm in (`MENTOR_NESTLE`), not
on the crown's single highest vertex.

## 5. The rooftop band

The owner's rules:

- The stage is on the **empty roof over the pop-up shop** (x 22..58, z 8..19,
  y 7), behind the NIMA ROOFTOP screen, facing the beach.
- NIMA ROOFTOP (the deck, z > 19) stays untouched.
- They play only while the jukebox has a record on
  (`App.syncJukeboxPlayer` → `setJukeboxPlaying`). With no record they sit round a
  bonfire low in that roof's north-east corner.
- They are not attendees or residents.
- The shop roof is not the `rooftop` venue, so the jukebox is heard there and the
  deck keeps its DJ set.

How it's built and run:

- **Assets**: Higgsfield generations (job ids in
  `character-prototype-20260920/art/generated/band/jobs.json`, about 440 credits).
  The amp was rebuilt from a front and a back view after the owner found its back
  broken, so anything seen from behind needs a back view.
- **Build**: `scripts/prepare-band.py` (`BAND_REUSE=1` skips the texture bakes).
  Musicians go through the avatars' steps, then clips are authored with IK on the
  instruments and baked: `walk`, `sit`, and one `play` each.
- **Carried props** are meshes skinned 100% to a bone. Blender's bone parenting
  offsets by the bone tail, and the generated hand tails are far off, so parented
  sticks floated.
- **Seated hips** ride a thigh's thickness over the log (they sank into it).
  Seated hands point along their forearms (they twisted).
- **Runtime**: `RooftopBand.ts` places `stage.glb` and `bonfire.glb`. It walks the
  four between seats and marks along lanes: out past the amps, in front of the mic,
  and behind the riser for the drummer. Colliders are on the roof only.

## 6. How this was checked

- Fitting room `avatar-review.html` takes these parameters:
  `sex, outfit, zoom, look, angle, pose (stand|skate|dj|eat…), fist, cap, skin/hair/bottoms=<hex>, headless, mentor=carry`.
- `band-review.html` takes `roof, play, t=<s>, stop=<s>, still, zoom, look, from`.
- In-game on loopback:
  - review targets `review=band`, `band-play`, `band-street`, `band-street-play`
  - `window.__festivalFeet()` gives the sole height against the floor
  - `window.__festivalGround(x0,x1,z0,z1,step)` gives the walking surface against the drawn ground
- Screenshots came from headless Chrome over CDP. The script was scratch and is not
  in the repo; the Browser pane cannot capture while hidden.
- `npm test`: 325 pass on this branch (the service's own tests included). `main`'s service suite, with the relay, is 56.

## Still open — for Codex to improve

1. **Deploy and prove the limbs relay.** After the owner deploys Render, check
   `build` is `ed551b8` or later. Then run two browsers, one in the desktop preview
   with body tracking on, and watch it on the other.
2. **His shoe collars are ragged** (spiky pieces round the ankle opening). This is
   the same interlock as the hem, between shoes and trouser cuffs in
   `classify_garments`. A level-and-cover pass like `level_hem` should clear it.
3. A small sliver flap at the male thumb tip. The thumb weights are a heuristic
   (`rebuild_fingers`, thumb section).
4. Band:
   - Stick contacts are approximate (`KIT_PADS` read off the kit's up-facing faces;
     the kit is turned about the throne, which is stretched to 0.42 m).
   - Fixed 120 bpm (the owner does not want tempo sync). There is no lip-sync.
   - All four always animate (4 × about 30k-triangle skinned bodies). Consider
     skipping mixer updates when far or off screen.
5. Webcam tracking needs real-world tuning: gains, clamps, a stance calibration,
   and turning away from the lens.
6. While tracking, presence posts every 140–220 ms because the payload changes each
   frame. Consider a change threshold.
7. Promotion to `/beta/`, when approved: a file-level copy per §00. This branch's
   `world/src` diverges from `main`'s.
8. The owner reported an avatar "floating" on the street (2026-09-27). It was not
   reproducible after the shoe fix; if it returns, measure with the two probes above.
9. If a base body is regenerated, re-measure its eyes (non-skin faces on the front
   of the face between chin and fringe) before trusting `EYE_HEIGHT`.

**Worth keeping:**

- **Garments cut along one colour boundary interlock: fix the edges in geometry,
  not in the dye.**
- **A texture classifier's classes move when the atlas repacks: find features by
  where they are.**
- **Never bone-parent a prop in Blender for export: skin it.**

---

# Latest: the camera judder found at last, and the gate split from the world — BETA PUBLISHED (2026-09-19)

## The camera lunge: a limit cycle, not the geometry

Four attempts, and the first three were wrong because none of them was the
cause. The measurements that finally located it:

- the jump was **identical to four decimals** against a wall, a corridor and a
  thin lamp post — which looked like "not geometric", but is because the lens
  sits on x=0 in all three and the sight line crosses each the same way
- it arrived **every tenth frame**, ~0.33 inward, while outward motion was
  smooth (+0.014 at worst)
- `cameraClearReach` was **already continuous** after the bisection: sweeping in
  the avatar's own 0.06 steps it changes by 0.06–0.0675 with **no flat treads**
- `cameraReach` sat about **0.45 longer** than the true clear distance

That last number is the fault. `cameraReach` is measured towards the camera's
*target*, which sits at the full orbit radius and therefore points higher and
steeper than the lens actually does — and a steeper ray clears an obstruction
further out. So the eased distance believed it had room it had not, pushed
outward at the opening rate, went obstructed, and the clamp that guarantees you
cannot see through a wall hauled it back instantly. Ten frames, for ever.

`easeCameraToward()` now travels the **arc** — direction and distance eased
separately about the avatar — and clamps the distance **on the ray the lens is
actually on**, measured out to the radius it *wants* rather than the one it
*has*. That last distinction matters: measuring only as far as the current
position can never report room further out, so feeding it back is a ratchet with
no way up, and it walked the lens to 0.37 of a unit from the eye, inside the
avatar's head.

Measured after: **0.183 near a wall (was 0.337), 0.005 on stairs**, closest
approach 1.78, recovery to 4.06, zero frames seeing through a wall. The stairs
were the case reported as unusable. Pinned at 0.19 in `coastal-pose.test.mjs`.

**The lesson worth keeping: a fix that only moves *when* a symptom happens has
not touched the cause. Measure the period, not just the amplitude.**

## The gate no longer waits for the world

`App.ts` imported five *values* from `FestivalWorld` — the roster constants —
and a single value import drags the whole festival into the same chunk. So the
gate could not draw a field until 702KB had arrived and parsed.

The roster moved to `NpcRoster.ts`, a leaf module; `FestivalWorld` is now a
**type-only** import in `App.ts`, which is erased; and the world is fetched by a
dynamic `import()` that is *started while the gate is on screen*, beside the
avatar model that was already preloading there.

| | before | after |
|---|---|---|
| blocks the gate | 225 KB gzip | **99 KB gzip** |
| world, in parallel | — | 126 KB gzip |

`FestivalWorld` re-exports the roster, so nothing else needed changing.

## ABOUT, wrong both ways, now right

`100vh` on iOS is the viewport with the toolbars **collapsed** — taller than the
screen, so the block overflowed and its centred logo sat high. `100svh` is the
viewport with them **showing** — shorter than the screen once Safari hides them,
so the block stopped filling the screen and the next film bled in underneath
with a hard seam. Both were mine. `100dvh` is the viewport as it actually is.

**No emulator reproduces any of this.** Measured at 390x844, `vh`, `svh` and
`dvh` all report 844, which is why both wrong answers looked right when checked.

## Two more

**An introduction would not open while MENTOR followed you.** A branch at the
top of `interact()` turned *every* SHIFT+E into a pick-up whenever the dog was
nearby — and while it follows, it always is. So the prompt promised
`SHIFT+E / INTRODUCTION` and the key picked the dog up. A resident within reach
now outranks the dog, matching the order `interactionLabel()` already used, and
only when an introduction is actually on offer.

**MENTOR has its own introduction**, on a **double tap** of the prompt, because
its tap and hold are already a treat and a pick-up and it is deliberately not
somebody you can wave at. Counted from `pointerup`, not `dblclick`, which a
phone with `touch-action: manipulation` and a headset pointer do not report
dependably. Empty like the others until STAFF write it.

## Still open

- **Render needs a manual deploy** — introductions cannot be saved until then.
- Ten introductions to write, MENTOR's included.
- Immersive video still has no host.
- `docs/beta/assets` is 45MB of retained models; the owner declined clearing it.

---

# Latest: the headset keyboard stops opening chat, and five more — BETA PUBLISHED (2026-09-18)

## The Quest keyboard was opening the chat window on top of everything

The worst of the batch: in a headset, typing a donation amount summoned the chat
window and broke the session. Also happened in a seat.

`globalShortcut` opens chat on Enter and only stood down when **`event.target`**
was a field. The Quest's own keyboard is a **system overlay outside the page**,
so its Return arrives as a keydown on the document body even though the field
being typed into is focused — the guard let it through and Enter did what Enter
does at a desk. It now reads `document.activeElement` as well, and in a headset
it never opens chat at all: there is no keyboard in an immersive session except
the one the system puts up for a focused field, so every Return in there belongs
to whatever is being written.

**Anything keyed off `event.target` is wrong in a headset.** The system keyboard
is not in the document.

## ABOUT on a phone, and why the emulator lied

`.videos-wrapper` is `height: 100vh`. On iOS that is the viewport **with the
toolbars collapsed** — taller than what you can see — so the logo centred around
a midpoint below the visible middle and read as sitting high. `100svh` on mobile.

This is the second time this page has needed `svh` and it will not be the last.
**A desktop emulator cannot reproduce it**: there `innerHeight` and
`visualViewport.height` are the same number, which is why it was checked and
looked right. Measured on the live site at 375×812: both 812.

Also `.aboutVideos2 h2.mob` put "OFFICE TOUR" at 22px into a 50×50 box with a
16px line height, which overflowed into nothing readable — the heading was
reported missing on mobile. The ordinary centred heading shows at every width now.

Worth knowing: **`.aboutVideos1` is `display:none` under 920px** and always has
been. That is pre-existing, not a regression — it is why the middle block sits at
the top of the page on a phone.

## The cap logo: measured, and the texture is innocent

Third time on this. The numbers, so nobody has to take a third guess:

- texture 3554×3543, opaque content at x 123..3410, y 121..3408
- margins: **top 3.4%**, bottom 3.8%, left 3.5%, right 4.0%
- **nothing touches any image edge**
- the mesh's UVs span the full 0..1
- the embedded GLB texture is identical to `src/assets/cap-logo.png`

So neither the picture nor the mapping clips anything, and the `alphaTest = 0.5`
fix did stop the border drawing black. What remains is the foreshortening: the
patch leans 21° away at the top and curves with the crown, so 3.4% of margin up
there compresses to almost nothing. Fixed in the **texture transform** —
`ClampToEdgeWrapping` plus `repeat 1.10` and a `0.018` drop in v, so the picture
sits inside the patch with a real border and the top gets more of it. The proper
fix is redrawing the patch in `scripts/prepare-blender-avatar.py`, which needs
Blender and rebuilds the model.

## Camera, MENTOR

`DESKTOP_LOOK_GAIN = 2.5` — the desk was slow for the same reason the phone was:
0.0042 × a 0.2 default is 0.00084 rad/px, about 1,100px to turn a quarter circle.
Applied at the drag, not to the constant, so the sensitivity slider still means
what it says.

`MENTOR_SWIM_Y` raised from `SEA_Y - 0.86` to `SEA_Y - 0.42`; the head pivot is
1.25 above the root, so at the old height the dog read as going under.

And a dog put down in the sea swam ashore on its own, because `smallLoopAround()`
is a **land** idea — the nodes it is built from are on the sand, so it set off for
the nearest one. Given a route of one point it now paddles where it was put and
waits, which is what the owner asked for.

## Not done: splitting the bundle

The owner asked for it and it is not in this pass. The measurement stands —
`App-*.js` is **702KB raw, 225KB gzipped, 7.1s** on a live load, and the model
had not begun downloading at that point. `three` is **already** a separate chunk,
so this is not a `manualChunks` tweak: `App.ts` itself carries the gate, every
panel and all the world glue in one file, and separating the gate from the world
is a refactor of that file. Attempted hastily it is the same mistake as the three
speculative camera fixes earlier in this session, so it is left for its own pass.

Not this, either, by the owner's choice: `docs/beta/assets` is **45MB** holding
six copies of the avatar model from previous publishes. Harmless to visitors —
only the referenced one is fetched — but it bloats every clone.

## Still open

- Splitting the gate from the world.
- The camera's chord-vs-arc easing (previous entry).
- **Render needs a manual deploy** — the NPC introductions cannot be saved yet.
- Nine introductions to be written.
- Immersive video still has no host.

---

# Latest: introductions for every resident, and three real camera faults — BETA PUBLISHED (2026-09-18)

## Pass 3: hold the greeting to read somebody's introduction

The last item of the ten. Almost all of it was extending what was already
there rather than building anything.

**Nothing is seeded, deliberately.** The roster is the owner's real colleagues,
so no biography is written on their behalf — the owner chose "build it empty,
STAFF fills it in". A resident with no introduction still opens a card with
their name and job title on it; that is the intended state, not a fault.

- Server: `npcIntroductions`, in `publicNpcProfiles()`, persisted, restored, and
  written through the **existing** `/api/admin/npcs` endpoint rather than a new
  one, so a resident is edited in one place and one save. English only, at the
  owner's choice; `introductionZh` can go beside it without disturbing anything.
  No seed-edition guard, unlike `djProfiles`: the defaults are empty, so a stored
  value is always somebody's writing and always wins.
- World: `openNpcIntroduction()` off the **secondary** prompt, which already
  existed three ways — SHIFT+E, `PROMPT_HOLD_MS` on a phone, `XR_HOLD_MS` on a
  Quest. `socialLabel()` is now the single place that words a greeting, so the
  prompt and the action cannot drift apart. Only offered for residents: a live
  attendee has no profile, and a hold on one is a wave rather than nothing.
- Interface: rendered into `#seat-menu` with `menuOwner = 'npc'`, exactly as the
  DJ booth's introduction is. Three things fall out of that — the liquid glass is
  already right, **the headset already paints it** (`#seat-menu` is second in
  XrHud's source list), and the DJ panel's re-render guard checks for its own
  owner so it will not draw over this one.
- The two DJs are untouched. They are NPCs *and* DJs, `nearestSocialTarget()`
  already skips `pose === 'dj'`, and their own richer bilingual panel is one tap
  away at the booth. One introduction per person, edited in one place.
- STAFF panel gets the same field, because ten of these will be written in one
  sitting.

## Three camera faults, and one still open

**`event.touches` is every finger on the screen.** The pinch I added yesterday
used it, so a thumb resting on the movement stick plus a finger dragging the
world counted as two fingers and turned every camera drag into a zoom. That is
what was reported. `event.targetTouches` is only the fingers that landed on the
canvas, so the stick, the pads and the pass menus are outside the gesture by
construction — no zone to lay out, nothing to keep in sync with the layout.

**Turning was five swipes to the quarter-circle.** `0.0042 × lookSensitivity`
at a default of 0.2 is 0.00084 rad/px, so ninety degrees needed 1,870px of drag.
`TOUCH_LOOK_GAIN = 6` puts about sixty degrees in a half-screen swipe. The
"buggy" half was separate: deltas over 180px were **discarded**, and a quick
thumb flick genuinely covers more than that between two events, so the drag
stopped responding exactly when moved fastest. Clamped now, not dropped.

**`cameraClearReach` was a staircase.** It marched in 0.24 strides and returned
the stride it hit, so the clear distance could only ever be a multiple of 0.24 —
and the camera's distance is built on it. Five bisections between the last clear
sample and the blocked one now put the surface within 8mm.

**The swing is gone entirely**, by the owner's decision after trying it:
`CAMERA_MAY_STEER = false`. Walking moves the avatar and nothing else. What keeps
the lens out of masonry is the distance, eased both ways — it used to ease
outward and *assign* inward, which was its own lurch. The machinery is left in
place and tested rather than deleted, because that is a judgement about feel.

That also exposed a real bug: `Math.max(1.6, available)` in the club was safe
only while the view could swing aside, and with the swing gone that floor pushed
the camera through the room's wall and showed the void. The room's cap wins now.

**Still open, and pinned in `coastal-pose.test.mjs` at its measured size.** An
inward lunge of about a third of a unit every tenth frame remains, with the view
opening back out smoothly in between. Diagnosed, not guessed:
`camera.position.lerp(cameraTarget)` interpolates along the **chord**, so it cuts
the corner through masonry neither end is inside, and the hard clamp — which is
what guarantees you cannot see through a wall — has to haul it back instantly.
The fix is to ease along the **arc**, direction and distance separately about the
avatar. That touches every camera mode including the seated one, so it is the
owner's call.

Three speculative fixes were tried first and each moved *when* the jump happened
without changing its size: feeding the clamp back into the eased distance, then
capping continuously (which ratchets — it collapsed the view to 0.1 units inside
the avatar's head), then measuring along the lens line (no effect, and it crashed
the `Object.create` fakes, which is how the crash was found). All three are
removed. **Measure before and after; a fix that only moves a symptom is not one.**

## Still open

- The arc-easing decision above.
- **Render needs a manual deploy** for the NPC introductions to be writable.
- Nine introductions to be written by the owner or STAFF.
- Immersive video still has no host.
- None of the camera work is verified on the owner's iPhone.

---

# Latest: the camera stops fighting itself, and the phone gets its resolution ramp back — BETA PUBLISHED (2026-09-18)

## The stairs spun because two systems shared one field

`confineCameraToClub` and `pullCameraClearOfWalls` both steer the view round
obstructions, they both run every frame, and they **both wrote
`cameraAvoidanceSide`**. Each overwrote the other's committed side, so the
hysteresis meant to stop the view flip-flopping was what made it flip — every
frame. On the NIMA ROOFTOP stairs, where the geometry under the camera changes
step by step, that is a view that "rotates everywhere". It is also most of why
walking with the joystick appeared to turn the camera.

`pullCameraClearOfWalls` made it worse by assigning `cameraTarget` outright: a
swing arriving in a single frame, with no easing at all, unlike the club's.

`src/world/CameraAvoidance.ts` is now the one implementation, with **two
separate states** (`clubAvoidance`, `wallAvoidance`). 17 tests in
`scripts/camera-avoidance.test.mjs`.

The owner's rule, chosen explicitly: **walking must not move the camera.** Only
the drag turns the view. The swing exists solely so the lens does not end up
inside a wall, and `cameraSteeringAllowed()` switches even that off on stairs
and slopes — sampled as a ground gradient over 0.7 units, so it covers every
staircase in the world without naming any of them. There the view closes in
instead, which is steady even when the ground is not. An existing swing is
*unwound* on the way onto stairs rather than dropped.

Note the two ladders. The room ladder is coarse; a building's edge has to be
cleared exactly, and stepping past it in coarse jumps settles the view *beside*
the wall with a grazing sight line along its face. `AVOIDANCE_OFFSETS_FINE`.

The three wall tests in `coastal-pose.test.mjs` asserted the old snap and now
settle over frames. That is the behaviour change, not a regression.

## Pinch could not work on a phone, and the phone never got a resolution ramp

**`tuneRenderScale` began `if (this.graphicsMode !== 'normal') return;`.** A
phone defaults to `lite`, so the adaptive resolution ramp never ran on the only
device that needed it. It now runs in both modes, over `RENDER_SCALE_FLOOR`
(0.67 normal, 0.5 lite), and it can raise the scale again as well as drop it —
the old ramp was one-way, so one slow patch left the picture soft for the rest
of the visit. `src/world/RenderScale.ts`, 9 tests, including one that models a
genuinely marginal device and proves the ramp settles instead of hunting.

Pinch-to-zoom was wired through pointer events only. That is correct on a desk
and unreliable on iOS, which keeps two-finger gestures for its own page zoom —
`touch-action: none` is not enough. A native `touchmove` handler with
`passive: false` now drives the zoom and the pointer path stands down while it
is running, so the same two fingers are not counted twice. The arithmetic is in
`src/world/CameraInput.ts` with a dead zone, because two fingers resting on
glass are never still and following the tremor made the view breathe.

**Not verified on a phone** — this session has no iOS device and the browser
pane is not Safari. The mechanism is the standard one; the fix is reasoned, not
observed.

The haze in `lite` closes in at 78 rather than 92. The camera's far plane is
**deliberately left at 300**: the night sky's stars sit at radius 253 and
bringing the plane in would clip them.

## Two smaller ones

**The DJs were clipping through their booths.** The console's top overhung the
cabinet behind it — worktop to -0.65, platters to -0.70 — while the DJ stands
at -0.9 and leans in. The overhang went through their chest. The top is pulled
forward and trimmed to `DECK_TOP_BACK`; the front lip the room actually sees is
unchanged. Moving the DJ instead would not work: `reachCoastalHand` clamps at
0.925 and the left hand is *already* at full stretch, so the hands would have
come off the decks. Locked down in `coastal.test.mjs`.

**ABOUT's COMING SOON is gone.** The owner chose the looping-video treatment
over centring the text. The middle block is now a third film block built exactly
like the two around it — muted, looping, dimmed, with the centre logo opening it
on YouTube. The film is `aboutVideos[2]` in `docs/js/allData.js` and is
**defaulted to the showreel**, which duplicates the first block; the owner has
been asked which film belongs there. `pug/about.pug` is the source, `docs/`
the built copy — both edited, since prepros is not run here.

Careful in `allData.js`: `contactVideos` holds the same two URLs as
`aboutVideos`, so a naive search-and-replace edits the contact page too.

## Still open

- Which film goes in the ABOUT middle block.
- Immersive video still has no host; Drive is out (see below), R2 or a Drive API
  key is the decision.
- Nothing here is verified on the owner's iPhone or on the Quest.
- **Pass 3 — introductions for every NPC**, held on the wave button and
  staff-editable, is still untouched.
- Render still needs a manual deploy for the Walk Bell John Awards line.

---

# Latest: Drive will not serve a browser, and a screen stops hitching — BETA PUBLISHED (2026-09-18)

## Google Drive is out, and the test that said otherwise was wrong

The owner asked whether the Drive share link could be used directly, without a
Cloud project. Measured with curl, it looked like a clean yes:
`drive.usercontent.google.com/download?id=…&export=download&confirm=t` answers
`200 video/mp4`, `access-control-allow-origin: *`, `accept-ranges: bytes`,
correct `content-range` mid-file, passing `OPTIONS` preflight. I said so.

It fails in a browser. One header decides it:

| request | result |
|---|---|
| plain curl, or with Origin, or a Chrome/Quest UA, or `Sec-Fetch-Mode`/`Dest` | `206 video/mp4` |
| **`+ Sec-Fetch-Site: cross-site`** | **`403 text/html`** |

That is precisely the header a browser sends when this site requests a file from
Drive, and `Sec-Fetch-*` is a **forbidden header name** — no fetch option, no
service worker, no `<video>` attribute can unset or forge it. Confirmed live:
`MEDIA_ELEMENT_ERROR: Format error`, and a bare `fetch` throwing
`TypeError: Failed to fetch`. It is Google declining to be hotlinked.

**The rule this leaves behind: curl is not a browser.** Any candidate media host
must be tested from a page. `world/STREAMING.md` has a console snippet for it,
including the `getImageData` taint check, since a video that plays but taints
the canvas can never reach a texture.

The Drive **REST API** is still viable and is what the code is wired for, still
dormant behind an empty `driveApiKey`. Under the same `Sec-Fetch-Site:
cross-site`, `www.googleapis.com` answers `403 application/json` — "The request
is missing a valid API key" — with CORS set to this origin. An API asking to be
identified, not a host refusing to be embedded. The distinction is the whole
finding.

## The screens stop hitching, wherever the film ends up coming from

Host-independent, and the part of this pass that shipped working.

`src/world/VideoSync.ts` is new and pure — no three.js, no DOM — with 14 tests
in `scripts/video-sync.test.mjs` (188 total, up from 174).

The old code sat on up to four seconds of drift and then assigned
`currentTime`. A seek is the expensive correction: it drops the buffer, opens a
fresh Range request and sends the decoder hunting for a keyframe — in a headset,
on wifi, while the world holds 90fps, that is a visible hitch. Now:

- **Drift up to 5s is walked off** at up to ±5% playback rate, pulling harder
  the further behind a screen is. Browsers correct pitch, so nothing chipmunks.
  Because it runs continuously, drift rarely reaches the seek threshold at all.
  A 400-step simulation proves it converges without a single seek.
- **Joining inside the first 3s does not seek.** A seek before any buffer exists
  is a round trip the viewer waits out in full, bought to skip two seconds.
- **A loop point is not mistaken for drift.** Two seconds from the end of a
  204.6s film, told the screening is at 1s, is three seconds behind the short
  way round — not a whole film ahead. This would have seeked every loop.
- **A stalled screen is never told to hurry**, which only asks for more of what
  it has not got. `waiting`/`playing` are tracked rather than inferred.
- `preconnect` in `index.html` warms the media host. **Retarget it when the host
  changes** or it warms a connection nothing uses.
- `?review=vr-hud` now reports `directVideoBuffering`, `directVideoStalledMs`,
  `directVideoRate` and `directVideoBufferedAhead`, so a bad screening can be
  diagnosed as the network or the world rather than guessed at.

## The file matters more than any of this

The Skibidi clip is a **delivery master**: 854MB, 35Mbps, 2160-line, 3m25s.
Parsed from its own header. No client-side work survives that on a Quest. The
encode recipe is in `world/STREAMING.md` — 1080p, CRF 22, High/4.1, yuv420p,
`-g 120`, `+faststart` — which lands the same clip near 180MB.

## Still open

- The owner must choose: a Drive API browser key, or R2 (account already open).
- Nothing about immersive video is verified on hardware; there is still no host.
- **Pass 3 — introductions for every NPC**, held on the wave button and
  staff-editable, is untouched and is the last item of the ten.
- Render still needs a manual deploy for the Walk Bell John Awards line.

---

# Latest: the camera stops swinging, and two pages get centred — BETA PUBLISHED (2026-09-18)

First of three passes on a ten-item list. The owner asked for the quick visible
fixes first; the two DJ introductions and the all-NPC introduction feature
follow, and immersive video is waiting on a CORS-enabled media host.

### The dizziness was the camera committing to nothing

`confineCameraToClub()` re-chose its avoidance offset **from scratch every
frame**, and that offset depends on where the attendee is standing. So walking
through the club swung the view from one side of an obstruction to the other and
back as the numbers crossed, and the world appeared to rotate around somebody
who was only pressing forward.

`cameraAvoidanceSide` existed for exactly this, with the comment *"Keep the same
side of an obstruction until the intended orbit is clear"* — and was **never
referenced anywhere**. It is wired up now: the side already in use is tried
first and needs only a slim 0.05 margin to keep, while taking a *new* side needs
a clear 0.6; the side is released only once the orbit actually asked for is
clear again. `cameraAvoidanceOffset` eases towards the chosen swing over ~0.32s
instead of snapping.

> The function now takes `delta`. It tolerates being called without one and
> tolerates an instance built by `Object.create`, because that is how
> `coastal-pose.test.mjs` builds its worlds and field initialisers never run
> there. A new test walks 40 steps down the club and asserts the side never
> flips and no frame moves the camera more than 0.6.

### The pamphlet stand was timber inside timber

The sloped tray was rotated about its own centre at y 1.68, which drove its
whole front half **into** the top of the case: the underside crossed the case
top at z 0.235 and stayed below it to the case's front face — a 32cm band of
interpenetration. The cream stiles (top 1.585) and the upper rail (top 1.60)
also stood up through the tray, whose underside passes 1.562 over them.

The tray is shallower, 4cm higher and shifted forward, so the lowest part of its
underside meets the case top *exactly* at the front face and everything below
that line overhangs into air; a riser fills the wedge left under the back. Every
clearance was checked numerically rather than by eye — if this prop is touched
again, check `underside(z) >= 1.57` across z 0…0.56.

### The website

- **about.html** — `.member-container` is 1600px tall because that is the height
  of the grid of faces it is built for, and with only the COMING SOON
  placeholder inside, its flex centring put the text 800px down an empty page;
  on a phone it landed below the fold behind the browser toolbar. The container
  gives up that height when it holds the placeholder. `svh`, not `vh`.
- **portfolio.html** — `#portfolio-header` had `padding-left: 50%`, which left
  the four categories spread across the right-hand side. It is a centred flex
  now with the swiper capped at 820px: measured at 1600px the group centre is
  the page centre exactly. Below 1180px a guard keeps it clear of OUR WORK,
  which is a separate fixed element.

> Both pages are Prepros output: edit `pug/` and `scss/` **and** the committed
> `docs/*.html` and `docs/css/*.css`, because this repo has no build step for
> them. These two fixes are CSS only, so no HTML was touched.

### Two smaller ones

- `儲存中文介紹` and `回到點歌` were 44px tall at 12px next to 52px at 15px, in two
  different widths. One box now, at a fixed 176×46, because those labels are
  different lengths and content-sized boxes would still differ.
- The seated screening bar moved from across the middle to the right, above
  PASS, sharing its 16px right edge. 68px up and not the chat's 52px: PASS
  occupies 16–60px, so 52px would have cut into it, and the brief said not to
  overlap. Its width is bounded by what is left beside the chat column.

### The two DJ introductions, where a redeploy cannot lose them

XIEH GAN's biography and DR.BEAUTY's new title were written through the STAFF
editor. **Read back out of the live service verbatim** — `/api/config` →
`djProfiles` — rather than transcribed from the screenshots, so the numbers,
awards and names are the owner's own characters and not an OCR guess. Both are
now the seeded defaults in `server/index.mjs`. The English uses the owner's own
romanisations, supplied on 2026-09-18: NICKTHEREAL, E.SO, Naiwen, Cosmos People,
A-Mei, Crowd Lu, MJ116, Nine One One, The King of night market, My Schedule LTD,
The Rapper S2, 247 MUSIC FESTIVAL. **Use those spellings and no others** — do
not "correct" them to the names a search engine offers.

走鐘獎 is **"Walk Bell John Awards"**, also the owner's own form, supplied on
2026-09-18 — it is not a translation anybody would arrive at independently, so
leave it exactly as written. 金鐘獎 is the Golden Bell Awards, which is standard.

> **`safeText` normalises with NFKC**, so full-width punctuation in a stored
> profile comes back as ASCII: `，` is served as `,`. The seed keeps the
> full-width characters the website uses, and the overlay path flattens them.
> That matches what the owner typed in the first place, and NFKC is also what
> defeats homoglyph tricks — do not remove it to win the typography.

**This plan has no disk.** A deploy starts a new instance that reads the
committed `server/festival-seed.json`, so that file is the real seed and it was
carrying the old bios; it is updated from the same strings, extracted from the
code rather than retyped. Every field is inside the editor's limits — 1200 for
an introduction, 120 for a role — so STAFF can still re-save either language.

> **`DJ_PROFILE_SEED` is new, and it matters.** A stored profile overlays the
> seed field by field, which is right for an edit and wrong when the defaults
> themselves are corrected: XIEH GAN's Chinese was written through the editor
> while the English stayed a placeholder, so a stored copy of that placeholder
> would have overwritten this translation on every redeploy, for ever. Bumping
> the edition declares the seed authoritative once and drops the stored copies.
> Bump it **only** when the seeded text changes, never for an ordinary edit.

> **The server needs a manual deploy.** Pushing to `main` ships the client
> only; until Render is redeployed by hand, the live service keeps serving the
> old English role and introduction.

### Immersive video — the client is ready, the host is not

Nothing in the client needs changing when a URL arrives. `playImmersiveVideo()`
already creates a fresh `<video>`, sets `crossOrigin = 'anonymous'` **before**
`src` (which is the whole ballgame for a WebGL texture), sets `playsInline`,
`muted` and `autoplay` for the autoplay policy, accepts any http/https URL with
no domain allowlist, and remembers a failing URL in `xrFailedUrl` so it is not
retried in a loop. It is one line in `immersiveVideoSources`.

**JJ SKIBIDI is `jiawzYgfkuI`** — "Skibidi - JJ Lin Ft. Jackie Chen", first in
the DRIVE-IN 88 playlist.

The host needs: a real media response (not an HTML interstitial),
`access-control-allow-origin` for the site's origin, byte-range support so the
film can be seeked, and H.264/AAC MP4 with the moov atom at the front.

`immersiveVideoSources.ts` now carries two routes and drops any entry without a
usable URL, so a half-finished setup leaves the screens on their posters rather
than shipping a broken src:

- **`driveFiles`** — YouTube id → Drive file id, resolved through the Drive REST
  API. Tested: `GET /drive/v3/files/<id>?alt=media` answers with
  `access-control-allow-origin` reflecting the caller, so it **is** usable as a
  texture. The ordinary `drive.google.com/uc?export=download` endpoint is **not**
  and never was — `text/html`, the virus-scan interstitial, no CORS. They are
  not interchangeable, and the difference is the whole reason this works.
  Skibidi (`jiawzYgfkuI` → `1OwWa9w8…`) is already mapped and activates the
  moment `driveApiKey` is filled in.
- **`directUrls`** — a real CDN, which wins over Drive for the same film, so
  moving one across needs no other change.

> Drive is **not a CDN**: per-project quotas, and Google discourage serving
> media this way. It is a route for testing in a headset, not for an audience.
> The browser key ships in the public bundle and is public by design — the
> restrictions on it are the protection, not secrecy. Never put an OAuth client
> secret there.

> **Drive's own `/preview` player is embeddable** (no `X-Frame-Options`, no
> `frame-ancestors`) and would work on the flat screens through the existing
> CSS3D path — but not in a headset, for the same reason YouTube does not. The
> owner decided against adding it: the flat modes already work, and a second
> embed path would be two players to keep in step for no new capability.

### Immersive video — the Drive link cannot work

Tested: `drive.usercontent.google.com/download?id=…` answers
`content-type: text/html` (the virus-scan interstitial, not the file) and sends
**no `access-control-allow-origin` header at all**. A WebGL video texture needs
a real media response *and* CORS. The owner is setting up a proper media host;
when a URL arrives it is one line per film in `immersiveVideoSources`.

### What was and was not verified

**174/174 tests** and the build pass. The two pages were measured in a browser
at 375px, 1024px and 1600px. The stand's clearances were computed from the
geometry. The camera is covered by the new test.

> **Not tested on physical headset hardware.** Everything still open from the
> passes below stands.

---

# Latest: the Quest's own keyboard, and a screening nothing sits in front of — BETA PUBLISHED (2026-09-17)

### The painted keyboard is gone, and good

Two keyboards were appearing at once. Clicking the painted writing-box row ran
`el.click()` on the real `<input>`, which **focuses** it — and a focused field is
what brings up the Quest's *own* keyboard in an immersive session. So the
system keyboard sat on top of the painted one.

The owner's call, and the right one: keep the system keyboard and delete the
painted one. It has a Chinese IME, which a painted keyboard was never going to
have — `xrKeyRows`, `xrKeyCommands`, `xrPhrases`, `paintKeyboard`, `pressKey`
and the panel's keyboard height cap are all removed. A writing box is now
focused **on purpose** (`el.focus()` then `el.click()` for text-ish inputs), and
the typed text reaches the painted panel through `panelState()` as before.

> So a headset session *can* show the system keyboard over the immersive view.
> Worth remembering before building any other input by hand.

### The offering could not be launched because it was never painted

`#offering` is built and appended when the temple is asked for one, and it was
missing from the painted panel's source list — so in a headset the sheet
existed, took the focus and drew nothing. It is modal at z-index 60, so it now
comes first in that list, ahead of `#seat-menu`, `#panel` and `#festival-pass`.
**Any new modal has to be added there, or it will be invisible in VR.**

### Leaving VR when a window opens behind it

A shop link and the ECPay checkout open a browser window the visitor cannot
see: the session owns the display. `leaveHeadsetForNewWindow()` exits the
session and says which window opened. The window is opened **first** and this
runs after, because a popup has to be created inside the gesture that asked for
it — see the note at the ECPay call about why the tab is opened before the
await.

### A painted way out

There was no exit in a headset at all: the flat exit button belongs to the
desktop preview. `EXIT VR` is painted full-width under `任務` and `通行證` in the
top-right block, as a synthetic `exitVr` action rather than a DOM click. The
block is 470 canvas rows to make room.

### The screening is in front of the chat now

`.venue-screen` was `z-index: 4` — tied with `.chat-stream`, which won on
document order — and under `.interaction-toast` at 6. The stack is now
`controls-hint 3 < chat 4 < toast 6 < screening 7 < seat controls 8 < panel 9 <
PASS 30`: nothing casual in front of a film, while its own controls and any
deliberately opened menu still are. This is the flat interface, so it applies in
the desktop and phone VR modes and in ordinary desktop and phone use alike.

### What was and was not verified

**173/173 tests** and the build pass. Through `?review=vr-hud`: the painted
`EXIT VR` leaves the session, the offering sheet paints with all seven rows
clickable and reports `placedFor: "offering"`, the status block carries three
targets, and the computed z-index stack reads as listed above.

> **Not tested on physical headset hardware**, and two things especially need
> it: whether the system keyboard now comes up cleanly on its own with no second
> keyboard behind it, and whether the offering sheet can be completed end to end
> in the headset — the local service refuses offerings offline, so only the
> painting was exercised, with an injected sheet.

---

# Latest: the cap's logo had a black frame round it — BETA PUBLISHED (2026-09-17)

Reported as "the top part of the logo graphic on the hat got clipped", on every
avatar, because every avatar wears the same cap.

**`cap-logo` is a white block with a fully transparent border, and its glTF
material declares no `alphaMode`.** glTF's default is OPAQUE, so the alpha
channel was ignored and that border drew as **solid black** — a dark frame 3.4%
of the patch wide on every side. The patch also leans 21.2° back from vertical
(z 0.1698 at its bottom edge to 0.1364 at its top), so seen from above the frame
foreshortens, collapses against the dark cap and reads as the artwork having
been cut off. `material.alphaTest = 0.5` in `attachImportedAvatar` — a cutout
rather than `transparent`, which keeps depth writing and needs no sorting.

### Four things it was NOT, so nobody spends another pass on them

Measured directly from `src/assets/neighbour.glb` (scratch scripts parsed the
GLB container, accessors and embedded textures by hand):

- **Not occlusion.** A ray test of all 144 forward-facing `cap-logo` vertices
  against every triangle of the `cap` mesh — head on, and 25° and 45° from above
  — buries **zero** of them, at any offset. An earlier "fix" that pushed the
  patch forward was a no-op and was reverted. Comparing nearest *vertices*
  suggests the cap is 0.008 in front of the patch; that is misleading, because
  the crown has a window cut for the logo and those are its rim vertices.
- **Not the UVs.** The front patch maps u 0→1 across its width and v 1→0 down
  its height. The whole image is on the mesh.
- **Not the artwork.** 3554×3543, white block inset evenly — transparent to
  v 0.033, opaque white from v 0.034 to 0.962.
- **Not the shader.** `componentId` for this mesh is `cap-logo`, not `cap`, so
  `dyeFamily` is `none` and every dye branch compiles to `if(false)`. The
  `height` varying is declared and never used.

> The sampler declares no `wrapS`/`wrapT`, so glTF's REPEAT default applies.
> Anything that pushes these UVs outside 0..1 will wrap the artwork, not clamp
> it — do not offset them without setting the wrap mode first.

---

# Latest: the headset HUD holds still, and stops leaking into the previews — BETA PUBLISHED (2026-09-17)

Third pass, from the owner's Quest and phone testing. Several of these were
faults I had introduced in the two passes above.

### It was too twitchy to read

Bolting the head-locked layer to the camera meant every small movement of the
head — including sway nobody notices — swung the whole interface, and a panel
that never holds still cannot be read or pointed at. It now holds its heading
until the head turns past an **8° dead zone**, then eases after it, faster the
further behind it falls (`HUD_DEAD_ZONE`, `HUD_ROTATION_LAG`, `HUD_POSITION_LAG`
in `XrHud.ts`). Inside the dead zone it does not move at all. Pressing the left
stick recentres the view **and** snaps the layer back in front, which is the way
out if it ends up off to one side.

### Three faults of my own making

- **The VR prompt wording leaked into the desktop and phone previews.** It was
  gated on `vrActive`, which is true there too. `paintsHeadsetHud()` is the test
  for "the painted interface is the interface"; use it and not `vrActive`.
- **The pamphlet opened empty.** My chat-message branch matched *every*
  `<article>`, and the pamphlet's article holds an eyebrow, a heading and an
  introduction — all three vanished into one mangled card. It now requires a
  `<header>` naming an author.
- **Moving a slider changed nothing on screen.** The panel was signed on
  `textContent`, and neither a form value nor `<details open>` is text. Hover
  used to mask it by invalidating everything. `panelState()` signs the open
  sections, the control values and the pressed/hidden/disabled attributes.

### Performance, which is the one to watch

Hovering used to clear the panel's signature, redrawing a **1400x1200 canvas and
re-uploading 6.7MB of texture on every frame the pointer moved** — most of a
Quest's frame budget, and the likeliest cause of the reported lag. The hovered
row is marked by moving a `highlight` quad in the panel's own local space
instead, and the panel repaints only when its content actually changes. Hover
invalidation elsewhere is scoped to the one quad that owns the target. The
pointer path also allocated a `Quaternion` and a `clone()` per hand per frame —
a few hundred short-lived objects a second, which a headset pays for later as a
stutter. All reused now. **If it drags again, look here first.**

### Clicks that did not land

Every row was laid out with air above it and that air was not clickable, so
roughly a fifth of a menu's surface did nothing and a slightly unsteady hand
fell through to the world. `closeHitGaps()` gives each gap to the rows either
side of it, and a test walks down a column asserting every point hits something.
Cells side by side are left alone.

### Matching the flat interface

- The **chat panel is glass**: dark translucent with a sheen along the top edge
  and a bright hairline, as `.panel--chat` is on screen. `paintNodes` takes a
  `dark` flag and flips one palette rather than having two painters. **No blur
  pass** — reading the framebuffer back per frame is the cost a headset cannot
  spare, and the owner chose the faked look.
- **An open menu hides the visor behind it.** The glass is translucent, so the
  head-locked prompt and quick actions punched straight through the menu. Only
  the control hints stay, which is the shape of answer the flat panel has.
- **Sliders are painted as sliders** — a filled track and a knob, from the
  input's own min/max/value — because a bare percentage told nobody where the
  value sat. A click sets it.
- **Prompts wrap.** A two-part prompt (taking a drink offers a sip *and* putting
  it down) was longer than the panel and lost its second half off the end.

### The three VR buttons

One box for all of them, at the head-tracking button's size and a fixed width,
because a column in three heights and three widths reads as three unrelated
things. Narrower again on a phone, where they had taken a third of the width.

### Typing, in a session with no keyboard

An immersive session composites no DOM, so the headset's own keyboard never
appears — there is no focused field for it to attach to. There is a painted one
now, on its own quad under whichever menu holds a writing box
(`writingBox()` finds it; `xrKeyRows`/`xrKeyCommands` are the layout).

Keys are **synthetic targets**, not DOM. A press edits the real input and
dispatches a real `input` event, so the panel above repaints through the
ordinary signature and the form's own submit handler sees exactly what it would
see from a keyboard. ⇧ is a one-shot capital, like a phone's. ↵ clicks the
form's submit button.

**No Chinese IME.** Pinyin or zhuyin plus a candidate list is a different piece
of work, so the 中 key opens a short list of ready-made lines instead and the
panel says so in both languages. Do not describe this as Chinese input.

The panel is **capped to 820 canvas rows while a keyboard is up**, and the pair
is centred on the eye line, or the two of them ran from the top of the view to
well below the chin.

### What was and was not verified

**176/176 tests** and the build pass. Reviewed against the production bundle via
`?review=vr-hud`: the pamphlet's content, the sound meters moving 0.70 → 0.91 on
a click, the glass chat panel with its segmented channels and message cards, the
visor stepping out from behind an open menu, the corner layout, and the painted
keyboard typing `hi`, appending a ready-made 你好, and sending — the input
cleared and the line arrived in the feed under this visitor's own name.

> **Still not tested on physical headset hardware.** The dead zone's feel, the
> blur, the lag and the click reliability all need a Quest.

> **Still open:** the clipped cap logo is not diagnosed: the avatar is hidden in first person and in VR, so the cap in the
> report is another visitor's, and `cap-logo` is baked geometry in
> `neighbour.glb` (218 vertices) rather than a texture decal. Immersive video
> remains as described below — do not re-try DOM overlays.

---

# Latest: the headset's interface, sharpened and scoped — BETA PUBLISHED (2026-09-17)

Second pass on the painted HUD, after the owner tested it on a Quest.

### An iPhone could not open the festival at all

The HUD built **seven 2D canvases with the world, on every device** — including
the ones that would never draw it. iOS caps total canvas memory and refuses a
context rather than growing, and a refused context *threw inside the
FestivalWorld constructor*. So an iPhone reached the gate, pressed enter and got
a black screen, with nothing in the console because the throw happened before
there was anything to log to. **It is built on the first real immersive session
now and never before**, and a refused canvas costs the headset its HUD instead
of costing everybody the festival. A phone loads two canvases where it loaded
nine. If a painted panel is ever wanted on a phone, budget the canvases first.

### Only a headset gets it

The desktop and phone VR previews are ordinary browser compositions where the
flat interface works, and the owner asked for both to stay exactly as they were
— recentre and head tracking included. `?review=vr-hud` on loopback paints the
headset HUD at a desk so it can still be reviewed; `data-vr-painted` on the
shell is what fades the flat layers, and it is true only where the painted one
actually runs. Recentre and head tracking are hidden in that mode, because they
are desktop-preview controls and a headset composites no DOM at all.

### Why it looked blurred, which was not the canvases

**three.js ships `foveation = 1.0` — the maximum.** Fixed foveated rendering
deliberately throws away resolution away from the centre of each eye, and this
HUD lives in exactly that periphery by design, so every panel was being drawn
into the cheapest part of the frame. `setFoveation(0)` at session start, plus
`setFramebufferScaleFactor(1.25)`, and **no mipmaps** on the canvas textures:
the canvases are drawn at more than display resolution, and with mipmaps on,
three.js answered that oversampling by picking a smaller mip and handing the
compositor a pre-blurred copy of the text. If the frame ever needs the budget
back, foveation is the first dial — but not while text is the payload.

### Spread out, and sized by angle

The blocks are laid out by the angle each subtends from the eye, listed in a
comment beside their positions, because two panels that look separate on a
monitor will sit on top of each other in a headset. Corners: clock top left,
connection and the two buttons top right, chat lower left, quick actions right,
prompt and hints along the bottom, middle of the view empty. The pass panel is a
third wider than the first pass at the owner's request — body text near 1.3° of
view rather than 1.0° — with its height capped so a long panel scrolls instead
of running past a comfortable field of view.

### The menus look like the flat ones now

A generic painter reading real DOM had been printing the panels as undifferentiated
rows. It honours the classes the flat interface already carries: `.panel__header`
becomes the ink header bar with the title and a **✕ close square** (only the square
is clickable), `.festival-pass__title` the large title, a pass row's `<span>` its
red ordinal with the quest count kept at the end, `.segmented` a row of cells with
`aria-pressed` painted red, and `.chat-feed article` one message card — red author,
dim right-aligned time, words under, hairline between.

> **A node's own words were being lost.** `textWithoutControls` walked children
> and ignored the node's own text, so `<p>NOW PLAYING · ROTATES IN <span>4</span>S</p>`
> printed a bare "4" and the panel header lost its title. It is a subtraction
> from `textContent` now, not a walk. Watch for this whenever a panel reads as
> a stray fragment.

### Controls

`hideHud` is a **hold of the right stick press** — tap opens the pass, hold
clears the whole interface out of the view. Changing the camera is gone from the
quick actions: a headset is the camera. Two fixes to clicking, both of which
could have been the reported "cannot click the prompt boxes":

- **Either hand is tried.** A `select` event whose input source has not arrived
  reports no handedness and fell back to `'right'`, so pointing with the left
  controller asked the right hand what it was aiming at, got nothing, and hit
  the world instead.
- **The rays were tested against last frame's transforms.** `Raycaster` reads
  `matrixWorld` and never updates it, and the head-locked layer is pinned to the
  camera later in the frame — so on the first frame of a session the quads were
  still at the world origin, where nothing could be hit. `syncToCamera` now runs
  before the rays as well as before the draw.

### Video in an immersive session — still not solved, and not for want of code

The owner asked to try DOM overlays. **That path is already built and has been
all along**: `enterVr` passes `#venue-screen` as the `domOverlay` root,
`requestSession` asks for the module optionally, and `leaveVrForYoutube` keeps
the immersive session and shows YouTube's own iframe in the overlay *when the
browser grants it*. The Quest does not grant it — `dom-overlay` is specified for
handheld `immersive-ar`, not `immersive-vr` — so it falls through to exit, watch,
resume. That is why a film still opens outside the headset in a separate window.
It now **says so in the headset** when it leaves, instead of leaving silently.

`immersiveVideoSources` is still an **empty map**. The WebGL video path it feeds
works; it has no sources. A cross-origin YouTube iframe can never be read into a
WebGL texture, so the only route that keeps a film inside the session is a direct
MP4/HLS URL on a host that sends CORS headers, added there per film ID. That is a
hosting and rights decision, not a code one. **Do not report immersive video as
working, and do not claim a DOM overlay will fix it.**

### What was and was not verified

**171/171 tests** and the TypeScript/Vite build pass. Reviewed against the
production bundle through `?review=vr-hud`: the corner layout with nothing
overlapping, the enlarged pass panel with its ordinals and quest count, a
submenu's ink header and ✕, the chat panel's segmented channels and message
cards, and a phone entering the world with **two canvases and `hud: null`**.

> **Still not tested on physical headset hardware.** Whether foveation was in
> fact the blur, whether the panel is now the right size, whether the ray
> clicks, and how the hold reads all need a Quest. `dataset.vrReview` →
> `world.hud` carries live pointer, hover and panel state for review.

---

# Latest: the interface a headset can see — BETA PUBLISHED (2026-09-17)

A Quest never grants `dom-overlay` for an `immersive-vr` session. Every flat
panel — the clock, the chat, the prompts, the whole pass — therefore vanished
the moment anybody put the headset on, and the only controls that existed were
buttons nobody could see a list of. The interface is painted into the scene now.

### It reads the real DOM rather than reimplementing it

`src/world/XrHud.ts` walks the panels `App` already builds, paints them onto
canvas quads, and sends clicks back to the elements they came from. That is the
whole reason all thirteen pass panels, the seat menu and the prompt boxes work
in VR without a second implementation to keep in step: whatever `App` renders,
a headset can read, and a panel rewritten there needs no work here. Layout and
hit testing live in `XrHudLayout.ts`, free of three.js so tests can reach them.

**Two anchorings, and the reason matters.** The always-on strip — place, clock,
phase, connection, chips, objectives, chat, prompts, hints — rides with the head,
because a clock you have to go and find is not a clock. The pass is *placed* in
the world when it opens and left there. Dense text that follows every head twitch
is what makes people ill in VR; a menu you can lean into is a menu you can read.

- The flat layers are faded to `opacity: 0` during a session, never `display:
  none` — the painted HUD reads their boxes for its contents, and a hidden panel
  has no box. In a headset they were never composited anyway; this is what stops
  the desktop preview showing two interfaces.
- The panel is cut to its content, so a thirteen-row menu is not a slab of paper
  with a metre of nothing under it, and it draws above the visor layer because an
  open menu is the thing being read.
- Row controls share a line. Thirteen rebind rows of CHANGE and RESET stacked
  full-width made the controls panel four screens long for two words a side.
- The map's inline SVG is **not** painted; its numbered destination buttons are,
  which reads better at arm's length than a postage-stamp drawing.
- No dropdown ever appears in a headset, so a click on a `<select>` steps to the
  next option, and a slider is click-to-set rather than dragged.

### One table for the controls, because there were three

`src/world/XrControls.ts` is now the only source. `updateXrInput` reads it, the
controls panel prints it and the painted hint strip prints it. The hand-typed
list said "A / X — jump" and "B / Y — teleport forward", which is exactly how
both hands came to mean one thing between them while **four buttons did nothing
at all** and dance and photo mode had nowhere to live.

| | |
|---|---|
| Left stick | Move / swim |
| Right stick ←→ | Snap turn |
| Right stick ↑↓ | Scroll the pass being pointed at |
| Triggers | Point and click — the right one interacts with nothing under it |
| Grips | Run, held |
| Press left stick | Recentre |
| Press right stick | Open / close the pass |
| A | Jump |
| B | Interact, feed MENTOR — **hold** to pick MENTOR up |
| X | Dance |
| Y | Photo mode |

Offer, punch and camera are painted quick actions instead: the buttons ran out
before the actions did, and the new pointer makes reaching them natural. The
trigger stays on the session's `select` event rather than polling, so hand
tracking — which has no gamepad — still clicks; the polling loop skips button 0
to keep the press from firing twice.

**Prompts name buttons, not keys.** `promptForTouch` rewrote `E /` to `TAP /`
on a phone and left it as `E /` in a headset, where there is no keyboard. In VR
it is `B /`, `HOLD B /` for what SHIFT+E was, and the offering points at its
painted button.

**Controller rays hit-test now** instead of being decorative lines of fixed
length: they shorten to whatever they land on and carry a cursor dot. The
desktop preview casts the same ray from the camera through the mouse, so both
paths click through identical code and the thing can be reviewed from a desk.

### Cleared from the VR view, at the owner's instruction

Recentre and head tracking are gone from the corner; only the preview's own exit
remains, because without it there is no way back out of the preview. Recentring
is the left stick press and the painted strip says so. The webcam tracker's
toggle was its **only** door, so gating it on "not in VR" would have deleted the
feature rather than hiding it — the flag is inverted instead, and
`?headtrack=on` still reaches it.

### Published from an isolated checkout, and why

`gate-entry-fix` was **eight days behind `origin/main`** and its working tree
still carried the staff VR casting code that `82a0eb2` had removed that same
afternoon. Building there would have resurrected removed work and dropped the
live wall-camera fix. The VR work was ported onto a clean `origin/main` checkout
(`vr-hud-20260917`) and published from there; every untracked `Coastal*.ts` in
`gate-entry-fix` was confirmed byte-identical to `origin/main` first. **The
dirty tree is untouched** — codex's uncommitted casting work is still there and
is still nobody else's to commit.

### What was and was not verified

**167/167 tests** and the TypeScript/Vite build pass. The painted HUD was
exercised in the desktop preview against the production bundle in **both
languages**: strip, chat, prompts and quick actions paint; the pass opens,
scrolls and closes; a submenu opens; the controls panel prints the new rows;
fast travel from the painted map works; a quick action changed the camera; hover
highlights; the review snapshot reports 13 clickable pass rows. No console errors
beyond the production API's CORS refusal of a loopback origin.

> **Not tested on a physical headset.** Text size at a real IPD and field of
> view, comfort of the placed panel, ray ergonomics and the long-press timing all
> need a Quest and the owner's own hands. Do not report those as working.
> `document.documentElement.dataset.vrReview` carries a live `world.hud` block
> for review — it used to be written only on session change, which reported every
> panel empty because none had been painted yet.

---

## 00. READ THIS FIRST — there are two published worlds now

### What went wrong, so it does not happen twice

The coastal art redesign reached the live festival at `/beta/` on 2026-09-08. Nobody
published it. It was sitting uncommitted in the same working tree as an unrelated
change — the ECPay offering — and a `git add -A` swept it into commit `7ee113a`, whose
message talks only about payments. It built, it passed, it went out, and the owner
found a redesigned world where the festival used to be.

The lesson is not "be careful". It is that **a shared working tree is not a place to
leave unapproved work**, and that `git add -A` in a tree two agents touch will commit
whatever the other one was in the middle of. Stage by path, or read `git status` before
every commit and account for every line of it.

### The arrangement now

| URL | Directory | Source |
| --- | --- | --- |
| `https://myscheduleltd.com/beta/` | `docs/beta/` | this branch — the festival visitors get |
| `https://myscheduleltd.com/beta/?era=ps2` | `docs/beta/ps2/` | the art redesign branch |

`docs/beta/index.html` carries a small script in its `<head>` that sends `?era=ps2` to
`ps2/` before a line of the main bundle runs. Two whole builds, each with its own
`index.html` and its own hashed assets, so neither can invalidate the other's cache and
neither can appear on the other's URL.

Two builds rather than one bundle with a flag in it, because the redesign replaces the
ground itself — terrain, colliders, the nav graph. There is no runtime switch between
those two worlds that is not a second copy of the world.

On loopback the redirect is skipped: there is no published channel to reach from a dev
server, and `?era=ps2` keeps its older meaning there as the graphics flag documented in
`App.ts`.

### Publishing

```
npm run build:beta                                    # → /beta/   (the festival)
npm run build && node scripts/publish-beta.mjs --channel ps2   # → /beta/?era=ps2
```

`publish-beta.mjs` **refuses** to publish to `/beta/` from a tree containing
`src/world/Coastal*.ts`. That tripwire knows one name; rename the redesign's modules and
it silently stops protecting anything, so the rule matters more than the check: the
festival at `/beta/` is only ever published from a tree without the redesign in it.

### When the redesign is approved

Do not merge. The redesign branch and this one deliberately disagree about the contents
of `world/src/world/` — merging this branch into the redesign would delete the redesign.
Promotion is a file-level copy of the redesign's `world/src` and `world/index.html` onto
this branch, and then a normal publish.

---

## 0. READ THIS FIRST — the crowd, and how to measure anything at all

### Every crowd measurement taken through the browser before 2026-09-07 was of a world standing still

The in-app browser suspends `requestAnimationFrame` whenever the pane is not
being looked at, and the pane counts as hidden far more often than you expect —
including while it is nominally fronted. The world's render loop is
`renderer.setAnimationLoop`, so **the world does not advance**, residents do not
walk, and any snapshot you take comes back with a number in it. That number
looks exactly like a result. It is a photograph of a stopped clock.

This wasted most of three sessions and produced two confident "it is fixed"
reports that were not true. `§3` has said the pane suspends rAF for a long time;
what it did not say is that **a frozen reading is indistinguishable from a
working one**, which is what makes it dangerous.

**So: `?review=nav` now exposes a stepper.**

```js
window.__festivalStep(seconds)  // drives updateNpcs directly, returns per-resident rows
window.__festivalGaps()         // closest pair, and how many are touching
```

`stepResidentsForReview` runs `updateNpcs` at a fixed step with no rendering, so
eight simulated minutes take one call. Two things in it are load-bearing and
both were found the hard way:

- **It patches `performance.now()` forward.** The walk schedules its own pauses
  against real time. Stepped synchronously, no real time passes, the first pause
  anybody takes never ends and every resident stops for good — a frozen crowd
  that looks precisely like the bug you are hunting.
- **It rebases every deadline on the way out.** The deadlines set during a run
  are on a clock that is then thrown away; left alone they sit minutes in the
  future against real time and the festival stands still for the rest of the
  session. The fixture would cause the very thing it measures.

Read the report **inside** the patched window too. Reading `waitUntil - now`
after restoring compares a simulated deadline against the real clock and every
wait comes back looking like ninety seconds.

### What was actually wrong with the crowd

Three separate faults, found in this order. None of them was the avoidance logic
that `§0-prev` credits.

**1. Two numbers five centimetres apart.** `holdBodiesApart` pushed bodies to
**1.3** apart while `npcCollides` refused any step ending within **1.35**. The
separation pass tidied residents into exactly the band where every direction is
blocked, and nothing could step out of the knot it had just made. A queue formed
behind each one and stood there for good. Not a failure to avoid each other —
two rules that disagreed.

**2. Over-correcting it.** Raising separation to 1.62 cleared that band and
created a standing repulsion between bodies that were already properly spaced. In
a group of six each body takes five pushes a frame; applied one at a time they
added up to more than a walking step, so a resident walked forward and was put
back the same distance. **Legs going round, body still.** Now: `apart = 1.42`,
gathered per body into one vector and applied once, and clamped to `0.9 * delta`
so nothing is ever separated faster than it walks.

**3. A step round reset the stuck counter.** This one had been there all along
and is the one the owner kept seeing. A resident that could dodge but never
advance therefore never accumulated any stuck time — so it never reached the
point of barging through bodies (`stuckFor > 2.5`), never reached the point of
giving up on its route, and shuffled side to side on one square metre
indefinitely. A dodge now costs `delta * 0.5` rather than clearing the count.

Alongside those:

- `visitorInTheWay` was asking whether a body was anywhere in the forward
  **half-plane**, which in a crowd is everybody walking beside you. It is a
  sixty-degree cone now, and it returns *which* body so the dodge can use it.
- The step round no longer always goes right. Always-right is correct for two
  people meeting head-on and turns a group of six into a slow carousel. It steps
  away from whichever side the obstruction is on, and keeps the old answer for
  dead ahead, where there is no side and both going right is what makes them
  pass.
- **A last resort.** Held up for six seconds, a resident drops its route and lays
  a new one from where it is standing. Waiting, stepping round and barging are
  all ways past something for a second or two; none of them help against
  scenery. **Six was measured.** At three and a half they gave up on routes
  faster than they could walk them, re-planned into each other, and the whole
  crowd wound down to zero moving inside seven minutes.

**Where it stands.** Over eight simulated minutes the count of residents that
travel in a thirty-second window dips to five and recovers to seven, and nothing
is ever touching. Before, it fell to four and stayed. It is **not** perfect: two
or three are stationary in any window, some of that legitimate dwelling and some
of it still cycling through blocked-and-retrying. If the owner reports it again,
ask **where**, and point the stepper at that spot rather than tuning thresholds.

### Furniture on a walking line stops the festival

The popcorn booth was moved in front of THE PALACE and landed on the route. The
link from `southJunction (9, -12)` to `palace (-35, -26)` crosses `x = -25` at
`z = -22.8`, which was inside the stall's collider — everyone bound for the
palace walked into it and never got past. **Before placing anything on open
ground, check it against `NAV_POINTS` and the links in that table.** A collider
in a corridor is indistinguishable from a broken crowd.

---

## 0a. The statue, and the rule that finally made it work

`src/world/GanganStatue.ts` — GANGAN in gold on a rearing horse, where the
rotating timetable used to stand. The timetable itself is not gone; it lives in
the festival pass, which is where anybody reads it.

It took four passes and the owner called it "a mess" twice. What fixed it was a
construction rule, not better numbers:

> **Pivot at the joint that does not move, and solve the rest.**

- The body pitches about the **hip**. The hind legs hang off the *root*, not the
  body, so they stay standing. Two earlier versions tipped the whole animal —
  first about its body, then about its hind feet — and both tipped the legs over
  with it, which is two slabs leaning at thirty degrees and not a horse standing
  on anything.
- The hock angle is **computed** from the segment lengths so the hoof lands on
  `PLINTH_TOP`. It was written down as a number once, with a comment claiming it
  landed on the stone; it was 0.27 under, because the working forgot the hoof
  hangs further down the shank than the shank's own length.

Three separate sign errors are worth naming, because they are the same mistake
each time — **a rotation about X moves the far end of a limb towards −Z**:

| Symptom | Cause |
| --- | --- |
| Horse's head pulled back into the rider | Neck rotation negative, leaning the neck backwards over the withers |
| One front leg missing entirely | Lift positive, throwing both legs up and **back into the barrel** |
| Raised arm poking through his own head | `rotation.z = -2.1` swings an arm on the *right* shoulder up and across to the left |

Orientation and placement: the statue is turned a quarter clockwise
(`rotation.y = -Math.PI / 2`) so the horse stands **across** the road. That is
the arrangement the painting uses — animal in profile, rider's shoulders turned
back out of that line towards the viewer — and a horse only reads as a horse side
on. It sits at `z = -6.2`; the asphalt roadway starts at `z = 2` and the plinth
is six deep once turned, so anything nearer the gate puts stone on grey.

`GANGAN_STATUE_SIZE` is square in plan on purpose: the projector compositor is
given that box, and a box that had to swap its sides with the statue would be a
second thing to keep in step.

`?review=statue` stands off it at a fixed angle and distance so one pass can be
compared with the last. `__festivalLookAt(x, z, distance, yaw, pitch)` does the
same for any point. `__festivalIntrusions()` lists every mesh whose box overlaps
the statue's — that is how the pale square through the sculpture was identified
as **the temple deity's halo**, which had never been parented to her and had been
standing in the middle of the main road since the temple was built. It is deleted
now, at the owner's instruction, not reparented.

---

## 0b. Avatar accessories

`src/world/AvatarAccessories.ts`. Four things to wear — cap, chain, arm tattoos,
backpack — each with its own colour, toggled at the gate or from the character
panel without leaving the square.

**One field carries both answers.** `AvatarPalette` gains four *optional*
strings: a colour means worn, absent means not. An older client that has never
heard of them sends none and wears none, and there is no second flag to fall out
of step with the first. `safePalette` in `server/index.mjs` passes them through
only when set.

**Nothing is measured by hand.** Two rigs are built here — the plain box figure
and the styled one — and they are not the same size; a cap sized for one sits
like a bucket on the other. Each piece is cut from the bounding box of the part
it goes on, read off the rig that has just been built. The plain rig's chest is a
single *scaled mesh* rather than a group, and hanging anything on a mesh inherits
its scale, so that rig passes the avatar's root as the anchor and supplies
`torsoBounds` instead.

**Everything is built whether or not it is worn**, and shown from the palette.
Rebuilding a body to put a hat on it means replacing a rig mid-walk-cycle, on
every other visitor's screen as well as this one. Remote bodies compare a
`wearing` signature and re-apply only when it changes.

**The chain took four attempts.** Worth reading before touching it:

1. Two long strands to a pendant near the navel — a great yellow chevron; read as
   webbing somebody had been strapped into.
2. Eleven links on a curve, each with its own three rotations — gold confetti,
   half of it inside the shirt, and worse the moment the body moved.
3. A flat rectangle on the shoulders — "a hoop, not a chain". A chain has to
   **hang**.
4. Current: a necklace. The back stays up at the neck, the front drapes onto the
   chest, links are all one size and turned only to follow the curve.

The constraint that matters: **neither rig has a neck.** The head sits straight
on the chest. The back of the chain rides in the band at the very top of the
torso — head above, nothing either side — which is the only place on these bodies
that something can pass round a neck without passing through a shoulder. Sized to
the head's half width *plus* the bar, so no part of it starts inside the body and
no pose can push it in.

`?review=fit` reports where each piece ended up along the body's own forward
axis. Front and back are the whole question for a chain and a pack, and a
screenshot of a figure eight pixels wide cannot answer it.

---

## 0c. Venue renames and the catalogue swap — and why a rename needs a deploy

The three theatres traded catalogues and two venues were renamed:

| Venue | Now shows | Called |
| --- | --- | --- |
| palace | TELEVISION | THE PALACE |
| drive-in | MUSIC VIDEO | DRIVE-IN 88 |
| shore | COMMERCIAL | THE SHORE |
| club | ORIGINALS | **SLAP AND POP** |
| rooftop | ORIGINALS | **NIMA ROOFTOP** |

The shop is **MASTER OF THE HOUSE** and its sign carries the drawn logo
(`src/assets/master-of-the-house.png`) instead of two lines of type.

**Publishing the client renames nothing** — remember this the next time a venue
is renamed, because it will look like the change simply did not work. Names and
catalogues are STAFF's, and what STAFF own lives in the service's saved state,
which beats any default in the code. Two halves:

- The three theatres migrate themselves. Their saved running orders list films
  from the catalogue they used to hold, none of which is allowed in the one they
  hold now, so `restoreSchedule` drops those rows and they come back on fresh
  defaults.
- The club and the deck kept their record box, so their rows survived with the
  old names inside them. `migrateVenues` rewrites those on the next start —
  **only where the saved name is still the old default**, because a name STAFF
  actually chose is theirs. Keyed on the persisted `version`, now 2.

The mapping lives in **two** places and they have to agree:
`programmeCategoryForVenue` in `server/index.mjs` and `venueForCategory` /
`catalogueByVenue` in `src/data/catalogue.ts`. A venue holding one catalogue in
one and another in the other is a programme board that disagrees with the screen
underneath it.

Confirmed applied on the live service on 2026-09-05.

---

## 0d. Smaller things from these sessions

**The jukebox's silence between records** was a missing wake-up, not a delay. The
running order only ever moved inside a broadcast, and nothing asked for a
broadcast when a record ran out — so the next one waited for whatever came along
next, at worst the ten-second heartbeat. One timer, armed when the record changes
and re-armed when a client reports the real length. Ordering is quicker too: the
POST reply already carried the running order and the page was throwing it away to
wait for the same news to come round again.

**MENTOR came apart when somebody holding it dropped off.** A carried dog is
parented *inside* the carrier's body, and the sweep that tears down a departing
visitor walks the whole subtree disposing every material and geometry it finds.
It found the dog — all fifteen meshes. Which parts came back was down to what the
renderer happened to re-upload, which is why it read as "the body disappeared,
the feet were still there". What a leaving visitor is carrying is lifted out and
stood on the floor before the sweep runs. `?review=mentor-remote-drop` stages it;
`__festivalDispose(false)` runs the old teardown and names every mesh it
destroys.

While in there, the three ways of letting go were saying three different things —
one kept the carrier's whole world rotation, one planted the dog at a fixed
height rather than on the floor underneath it, none reset the carried pose. They
all call `standMentorOnGround` now.

**Sunset was darker than the middle of the night.** The trough sits between
minute 20 and 30 of the cycle: the sun falls from 2.2 to 1.1 while the fill was at
its own low of 0.86 and the lamps had not come up, so nothing held the scene
during the handover. Fill and lamps now rise as the sun drops. Minutes 0 and 60
are the same instant and had been given different fills, so the cycle stepped
every time it wrapped.

**The beach couple** (`src/world/BeachCouple.ts`) are an easter egg east of the
drive-in: not residents, not in the attendee list, not in STAFF, nothing reaching
the service. Two coplanar-face bugs were found in them, and both are the same
lesson — **a face sharing a plane with another face is what a depth buffer
flickers between**. The towel stripes sat exactly on the towel's top; the hair
block's front face was on 0.34, the same plane as the front of the head, to the
millimetre.

**Colour swatches are square again.** Safari draws `input[type=color]` as a
rounded pill however the element is sized; at 32×32 that read as a rounded square
and passed, but a wide swatch became an oval on the phone. Killing the native
appearance and squaring `::-webkit-color-swatch` settles it.

---

## 0-prev. Eye height, one worn look — and an NPC claim that was wrong

### The VR view really was shorter than everybody

`AVATAR_EYE_OFFSET` was **2.62**. Measured against the rig it should be **2.84**:
the head pivots at 2.47 and the two eye blocks sit 0.37 above that. A fifth of a
unit, and very visible — standing in a crowd the view came up at everyone else's
chin, which is exactly how the owner described it. **If the head or the face ever
moves, this moves with it.**

### Residents never saw each other coming

`visitorInTheWay()` checked the player and the remote avatars and **not the other
NPCs**. The dodge below it was written for two of them meeting head-on — each
goes round to its right, which for a pair is opposite ways — but nothing ever set
`givingWay` for another resident, so that path only opened once `npcCollides`
refused a step. By then they are already touching, the sidestep is often blocked
too, and both fall through to waiting. That is the knot.

They anticipate each other now. **Deliberately no tiebreak on who yields**: both
stepping right is what makes a head-on pass work, and letting only one give way
would leave the other still walking into it. The `stuckFor > 1.2` escape still
stops a crowd yielding itself to a standstill.

> **This section reported the crowd as fixed, and it was not.** Anticipation was
> necessary and nowhere near sufficient — two numbers five centimetres apart were
> holding the pile together underneath it, and the owner reported the same fault
> twice more afterwards. Section 0 has the whole account. Do not read the
> paragraph above as a finished story.

> Also stale: "always right" is no longer how the step round chooses its side.

## 0-prev. Game controllers reach the menus now

The section below says the pad is **world only** and that menus stay with the
pointer. That was the owner's decision at the time and they reversed it. START
opens and closes the pass, the D-pad and the left stick move a highlight, A
confirms and B steps back out — panel to pass, pass to world. It is real DOM
focus with a painted ring, because `:focus-visible` does not fire for a focus
nothing clicked.

### One worn look, not two

**The default is now exactly `?era=ps2`.** Stripping it back to "grain only" was
the wrong read, twice, and the reason is in the shader: the surface variation is
added and *then* quantised, so **the dither is what crunches a smooth speckle
into hard specks**. At `wornSteps: 64` there is nothing to crunch it and the same
grain value reads as a soft wash — the difference the owner could see and I kept
explaining away. The courses carry the rest: a wall visibly made of something at
the scale of a hand.

Defaults are `steps 10, grain 1, warp 1, texture 1.25`. Every dial is still a URL
parameter and `?worn=0` still turns it off.

### Controls panel

Folded into `<details>` sections the way `staffSection()` does it, with the open
set remembered — the panel re-renders on every rebind, and a section that closed
itself would take the row being edited with it. There is a reset to defaults,
disabled until something has actually been changed.

## 0-prev. Game controllers

`src/world/GamepadInput.ts` polls the browser's Gamepad API. **Left stick walks,
right stick looks**, and nine actions sit on buttons. Deliberately **world only**
— menus stay with the pointer, which is the owner's decision and is why there is
no focus model in here.

### How it reaches the world

The look stick is converted into the same delta a pointer drag produces and
pushed through `applyLookDelta`, which was split out of `cameraPointerMove` for
exactly this. That matters: the VR preview, the seated screening camera and the
two orbits all clamp differently, and a second copy of those branches would drift
out of step the first time one of them changed. The stick therefore obeys the
visitor's sensitivity setting for free. Multiplied by `delta`, so a slow frame
does not turn further than a fast one.

Buttons call the same `…FromTouch()` entry points the phone's ring uses. Photo
mode is the exception — it belongs to the interface, so the world emits a
`photoMode` action the way a seat emits `vrWatch`.

Skipped entirely during an immersive session: a headset has its own controllers
and `updateXrInput` already reads them.

### Details worth keeping

- **The indices are standard, the labels are not.** `buttonLabel()` prints Xbox
  and PlayStation names — a panel that says "button 2" to somebody holding a
  DualSense has told them nothing. Family is sniffed from `gamepad.id`.
- **A radial deadzone, squared.** Per-axis leaks diagonals at the corners, and
  without the curve the first movement past the threshold is a jump to eighteen
  per cent rather than a nudge.
- **A pad already held at page load never fires `gamepadconnected`**, so `pad()`
  falls back to whatever `getGamepads()` lists.
- **A browser will not list a pad until a button is pressed on it.** The panel
  says so rather than looking broken.
- Rebinding takes the *next* press instead of acting on it, and steals the
  button from whatever held it, so nothing can end up bound twice.

### The controls panel

Grouped by what you are holding: keyboard, mouse, touchscreen, game controller,
VR headset. Quest Touch is listed always, on the owner's instruction, even where
nobody can use it. The controller rows carry their own rebind button, disabled
until a pad is actually connected.

**Verified with a synthetic pad** — `navigator.getGamepads` stubbed: left stick
walked the avatar, right stick turned the camera 0.524 rad, the run trigger
visibly lengthened the stride, and the panel rendered five groups, 34 rows and
nine rebind buttons correctly disabled with no pad present. **Not verified with
real hardware**; deadzone feel, stick curve and which button lands where need
the owner's own pad.

## 0-prev. The grain moved into the shader

The owner asked for this texture a **third** time, pointing at `?era=ps2` and
calling the CSS overlay standing in for it faded and wrong. They were right
about the overlay, and the reason is worth keeping: **a full-screen noise layer
slides over the picture, while `WornStyle`'s grain is sampled at the world
position** — the speckle belongs to the wall and travels with it when you walk
past. That is the whole difference between grain and a dirty screen, and no
amount of tuning opacity, blend mode, octaves or tile size on an overlay was
ever going to close it. Two passes were spent finding that out.

**The surface grain is on by default now.** Grain only:

| dial | default | `?era=ps2` | why |
| --- | --- | --- | --- |
| `wornSteps` | **64** | 10 | no colour banding — the palette is untouched |
| `wornGrain` | **2** | 1 | the contrast the owner asked for |
| `wornWarp` | **0** | 1 | no corner rounded, **no collider moved** |
| `wornTexture` | **0** | 1.25 | no courses or paving painted on |

So the world's shape and palette are exactly what they were; it gains a tooth.
`?era=ps2` still brings the whole period look, banding and all, and every dial is
still a URL parameter — `?worn=0` turns it off.

**Normal graphics only.** It runs on every lit surface, and lite mode exists to
stop paying for passes like it. `setWornCheap()` already follows the graphics
mode for the octave count.

The CSS `.world-grain` overlay stays, at **opacity .1**, purely so the sky and
the screening panels — which have no geometry to grain — are not the one clean
thing in frame. It is no longer the effect.

## 0-prev. Grain that looks like film, and shorter presence lag

### Grain, second pass

Reported as too heavy and not film-like. Three things fixed it, and the *blend
mode is not one of them* — that was last pass:

- **`numOctaves='1'`.** The extra octaves add low-frequency components, and those
  are what clump noise into blotches. Real grain is uniform.
- **`baseFrequency='1.6'` against a 160px tile.** Particles land at about a
  pixel, which is where film grain sits.
- **`feColorMatrix type='saturate' values='0'`.** `feTurbulence` produces
  *coloured* noise, and coloured speckle is the single thing that most says
  "sensor" rather than "emulsion".

Opacity .22, and the shift runs at eight steps over .4s — twenty jumps a second
rather than five, because grain resolves anew every frame of film and anything
slower reads as a pulsing overlay. Eight offsets, not four: with four the eye
starts to recognise the cycle.

### Why other visitors looked behind

Three delays stacked, and the fix takes something off each:

| | was | now |
| --- | --- | --- |
| sender's presence throttle | 220ms flat | **140ms while moving**, 220 otherwise |
| server broadcast batch | 50ms | unchanged |
| receiver's playback buffer | one full measured interval, capped at 600ms | **0.8 of it**, capped at 400ms |

That last one is the subtle one. `updateRemoteAvatars` replays previous → target
across the whole expected interval, which buys perfectly smooth motion at the
price of always rendering a body one full interval behind where its owner said
it was. Finishing early arrives sooner and costs a short hold before the next
update, which is much harder to see than the delay was.

**What not to do instead:** ease toward the latest position. There is a comment
in the file about this and it is right — everyone sprints to their last known
spot and stops dead, nearly three units of stutter per step at a run.

Idle visitors cost nothing extra: the identical-payload rule already holds a
still body to one post every three seconds, so the faster rate only applies to
somebody actually walking.

**This is reasoned tuning, not a measurement.** Two browsers against the live
service is the only way to judge it, and that needs the owner.

## 0-prev. Grain that shows, and one honest number

### Soft-light grain over a dark world is invisible

The grain was shipped at `mix-blend-mode: soft-light` and reported as missing.
It was there, sized, painting, at full opacity — and doing **nothing**, because
soft-light leaves dark pixels almost exactly where it finds them and this world
is dark. `screen` at .5 instead: it adds light, so the noise lands as bright
specks over the shadows, the way grain does on a dark print. Obvious on screen
now.

**Two numbers to tune it**, not one: the element's `opacity`, and the `opacity`
on the `<rect>` inside the SVG noise. The blend mode decides whether either does
anything at all.

Still off in lite mode, and the shell's `data-world-quality` is what switches it.

### The sensitivity is one number with nothing behind it

`VR_COMFORT` is gone. A setting that reads 20% and behaves like 12% in the place
the visitor cares most about is not a setting anybody can reason with, and the
sentence explaining the discount went the same way at the owner's request. The
gentleness lives in the **default of 0.2** instead. Range is 0.1–2.

**This is a global default, and it is very slow on purpose.** At 20% a 160px
drag turns the flat world about 7.7° — a half-turn takes most of a screen width
of dragging. That is the owner's explicit choice, made after dizziness reports;
do not quietly raise it.

### `localhost` and `127.0.0.1` are different origins

Three separate measurements in this session were confounded by clearing
`localStorage` on one and loading the world from the other. `preview_start`
opens `localhost:5173`; the review fixtures are documented against `127.0.0.1`.
**Clear storage on the origin you are about to load**, or a stale slider value
will look like a bug in the code that reads it.

## 0-prev. The sensitivity reaches the head, the skew is gone

### Why the slider "still did nothing"

Because the visitor had **head tracking on**, and the head was what was moving
the camera — the one input the slider deliberately did not touch. The reasoning
for leaving it out was that head tracking maps a real movement of the body onto
the same movement of the view and scaling that makes the picture disagree with
the inner ear. **That reasoning was wrong here:** head tracking is not one to
one. It is amplified four times over, because a webcam only sees about
thirty-five degrees of turn, and that amplification is exactly what "camera
speed" means to somebody using it.

`HEAD_YAW_GAIN` and `HEAD_PITCH_GAIN` are scaled by `lookSensitivity` now.
Measured, for a 20° head turn: rig yaw 0.404 / 1.348 / 2.697 at 30% / 100% /
200% — linear, exact. The **phone gyroscope** is still left alone, and that one
really is one to one.

### The screening frames no longer drift

The off-axis frustum is **removed**. `applyHeadCoupledView()` now only moves the
eye; it no longer rebuilds the projection around it.

The screening panels are CSS3D, and `CSS3DRenderer` builds its transform from
the projection's vertical scale plus CSS `perspective()`, which is always
centred — an off-centre frustum cannot be expressed in it at all. So WebGL drew
the world skewed and the video unskewed, and the picture slid inside its own
frame whenever anybody leaned. Measured before: ∓0.126 of skew for a
ten-centimetre lean. Measured after: `frustumSkew [0, 0]` while leaning, with
the camera still moving (`camPos.x` 1.152 for the same lean), so the parallax —
the larger half of the effect — is untouched and CSS3D follows it exactly.

**If the pinned-window effect is ever wanted back**, it needs `perspective-origin`
on the CSS3D layer moved to the same principal point *and* the layer's content
shifted with it. Do not attempt it without `__festivalProjectors()` open.

### The world has never had film grain

`.world-vignette` shared the gate's grain rule and then overrode
`background-image` with its gradient one line later, so the noise was shadowed
from the world's very first commit. `.world-grain` is its own element now,
because the two want different blending — grain is soft-light over the picture,
the vignette is a plain darkening of the corners, and one element cannot be
both. Inset −60px so the stepped shift never exposes an edge, and off in lite
mode.

The shell carries `data-world-quality`, **not** `data-graphics`: the latter is
already the gate's own button selector and putting it on a `<section>` would
hand that element to the button wiring.

### Remembering the tracker

`Remember on this computer` — off by default, stored per browser, and the panel
states which of the two bargains it is in either way. On, the fetches use
`cache: 'default'` and a second visit is quick; off, they stay `no-store` and
every visit downloads about 7MB. The promise that nothing is written to a
visitor's machine is only worth making if it is also visibly withdrawn when they
choose otherwise.

## 0-prev. One sensitivity for every camera

### The slider was reported as doing nothing, and it was nearly true

It scaled the **VR drag only**. Every other path — the follow and perspective
orbits, the seated screening camera — had the rate hard-coded, so a visitor who
moved it and dragged saw no change at all. Worse in VR, where the settings panel
covers the canvas the drag would have to land on.

`lookSensitivity` now scales **every drag-to-look path**, and VR carries a
`VR_COMFORT = 0.6` factor of its own on top, so a headset stays gentler than the
flat world at the same setting. Verified outside VR: the same drag turns
−0.755 rad at 100% and −0.123 at 30%.

The stored key went to **v2** deliberately. v1 meant a VR-only multiplier that
defaulted to 0.6; carrying that number into a setting that now scales every
camera would have quietly slowed the whole world for anyone who had touched it.
Default is 1 — the rate the world was built around.

**A control named CAMERA SETTING has to move the camera wherever the visitor is
pointing at it.** That is the lesson, not the arithmetic.

### Settings panels are grouped now

`.setting-group` — a red rule-off heading, a rule between groups, real margins,
and prose capped at 62ch. The camera panel was a stack of controls butted
together in the top-left of a very large sheet. A panel with space to spend
reads worse for hoarding it.

### The download: parallel, early, and still dominated by one file

All four files are fetched **at once** rather than in sequence — the 3.5MB model
no longer waits on the 3MB runtime, which waited on a 44kB library. Opening the
panel starts the fetch, so reading time is not dead time.

Measured after: all four begin at the same instant, and the wasm alone still
takes 95s **in the review pane**, which throttles background tabs — so the total
is the biggest single file and nothing else. Parallelism is right and helps a
real connection; it cannot beat one 3MB download.

**The only thing that would truly make it fast is letting the browser keep it**,
which is exactly what the no-store guarantee forbids. That is the owner's call,
not a bug. Asked; unanswered.

## 0-prev. Head tracking "stuck", and what it really was

Reported as stuck on `正在載入追蹤模型…`. Measured here: the load **completes**,
in **71.7 seconds**, over the blob path, with no error anywhere. The three-
megabyte runtime is simply slow, and a minute of an unchanging label is
indistinguishable from broken.

So the fixes are about the wait, not about a crash:

- **The label says how long.** "LOADING THE TRACKER — THIS CAN TAKE A MINUTE",
  and the readout names which of the four steps it is on, so it visibly moves.
- **Nothing waits for ever.** Every fetch has a deadline and every build has one,
  so a load that truly hangs ends with a message naming the stage instead of a
  frozen panel. `start()` resets its own guard in a `finally`, so the button
  works again afterwards — before, one hung load bricked it for the visit.
- **`FETCH_TIMEOUT_MS` is 120s on purpose.** The first attempt at this was 40s,
  which would have killed the 71-second load above. **Do not tighten it**: the
  complaint is a load that never ends, not one that takes a while, and cutting
  off a slow connection punishes exactly the machines least able to spare it.
- **A fallback for a genuinely broken runtime path.** The loader script is handed
  over as a blob so nothing reaches the disk; Emscripten works out where to find
  its own files from where that script came, and a blob URL resolves to nothing
  useful — on some browsers it waits rather than failing. If the build times out,
  it retries once through `FilesetResolver.forVisionTasks` on real URLs. That
  lets the browser cache the runtime, which the panel promised it would not, so
  `runtimeCached` is recorded and shown. The model — the larger half — still goes
  in as a verified buffer either way.

**A byte-counting progress readout was built and taken out again.** Reading the
body chunk by chunk to measure it slowed the same 3MB download from ~20s to
**85s**, and the number was wrong regardless: the reader sees the decompressed
size (15.25MB) against a compressed total (~7MB). The stage costs nothing and
answers the same question. Do not re-add it.

## 0-prev. VR look sensitivity, and an unfinished drift hunt

### The camera panel

`panelLabels.graphics` is **CAMERA SETTING / 鏡頭設定** now. The gate's own
`fieldset` legend still says GRAPHICS / 畫質 and should: that one really is a
picture-quality choice, and it is a different copy key (`copy[lang].graphics`).

It carries a **VR look sensitivity** slider, 0.3–2, stored per browser, and the
default is **0.6** — visitors were feeling ill, so the shipped setting is gentler
than what they had rather than the same with a knob beside it. Verified exact:
the same drag turns 0.403 rad at 60% and 1.344 rad at 200%.

It scales the VR **drag** only. It is deliberately **not** applied to the phone's
gyroscope or to head tracking: those map a real movement of the body onto the
same movement of the view, and scaling that is what makes a picture disagree with
the inner ear rather than agree with it. If someone reports head tracking itself
as sickening, that is a different knob and it needs saying so.

### Screens shifting in VR — half diagnosed, not fixed

Reported twice. `projectorAlignmentSnapshot()` — `__festivalProjectors()` on any
loopback page — projects each screen's four corners into page pixels and sets
that box against the panel's own rectangle.

**Outside VR and in a simulated session it reports zero drift**, so the ordinary
path is sound. Note the probe's first version compared a projected *centre*
against a bounding *box*, which perspective makes disagree by ~80px with nothing
wrong; corners against corners.

**What is confirmed:** with head tracking on, leaning moves the projection
matrix's off-centre terms to ∓0.126. CSS3DRenderer builds its transform from the
vertical scale plus CSS `perspective()`, which is always centred — **it cannot
express an off-centre frustum**. So WebGL draws the world skewed and the video
panel unskewed, and the picture slides inside its frame exactly when a visitor
leans. That is ours, introduced with the window-parallax effect.

**What is not:** the owner sees it on **mobile too**, where there is no head
tracking and no skew. That half is unreproduced. Do not claim this fixed.

Options for the confirmed half, in the order worth trying: compensate with
`perspective-origin` on the CSS3D layer (the skew terms are exactly the shift, in
NDC); or drop the off-axis frustum and keep only the camera translation, which
loses the window pinning but keeps a strong parallax and makes the projection
symmetric again.

## 0-prev. The 2026-09-04 session

Everything below was confirmed working by the owner on 2026-09-04. Ten separate
passes are folded into one section here; what is kept is what a later session
would be sorry not to know.

### Phone VR follows the gyroscope one for one

The fused sensor pose was being rebased against the **whole** calibration
quaternion (`pose · reference⁻¹`). Pitch and roll come from gravity and are
absolute — there is nothing in them to rebase — so subtracting them meant the
phone's tilt never reached the picture (measured: pitch and roll read `0.00` at
every attitude) and **tipping the phone 30° toward the floor moved the view 28.9°
up**. Only the heading is rebased now, by one constant world yaw applied *before*
the device pose:

```
camera = Ryaw(entryHeading − calibrationHeading) · devicePose
```

`devicePose` is three.js's own `DeviceOrientationControls` composition,
unchanged. Because the correction is a pure world yaw applied before it, the
sensor's axes are never skewed: measured, `alpha ±30/90/180` moves the heading by
exactly that, with pitch and roll unchanged to the hundredth. The per-frame
`slerp` is gone — the OS has already fused these poses and a second easing layer
only made the picture trail the phone. `xrRig.rotation.y` is held at 0 while the
sensor drives, because the heading correction is already inside the target.

Turning the phone to landscape does **not** reset the reference. The
`screenAngle` term is that compensation; resetting on top of it threw the
heading away.

`CALIBRATE MOTION` / `RECENTER VIEW` re-reads the heading only, so pitch and roll
survive it. A phone's heading is the one part of its pose with no fixed meaning —
relative and drifting on iOS, magnetometer-corrected and jumpy on Android — so
this is the visitor's handle on that, and it cannot knock the horizon over.

### `camera.position` is not where the camera is, in VR

`xrRig.add(this.camera)` runs at construction, so the camera is **always** a
child of the rig. Outside VR the rig sits at the origin and the two agree. Inside
VR the rig carries the whole walk while the camera sits at the origin of it — so
every `this.camera.position` read measures from the middle of the map. That put
each screen's range, its facing-side test and the water's camera uniform in the
wrong place the moment VR was entered; The Rooftop's screen, at z = +19.9 and
watched from the south, could never pass `cameraOnViewingSide` at all. Those
reads use `camera.getWorldPosition(this.cameraWorldPosition)`. **Anything new
that measures from the eye must do the same.**

The same confusion caused the jump bug: the rig was placed at
`groundHeightAt(...)`, the floor **under** the visitor. Standing, that agrees with
`player.position.y`; in the air it does not, and the difference *is* the jump — so
the avatar rose and the view did not, on desk, phone and headset alike. It reads
`player.position.y - AVATAR_GROUND_Y` now, which also puts the eye on the
waterline while swimming. Measured: eye 2.90 → 3.80 → 2.90 across the arc, with
`eyeY - playerY` pinned at 2.62 throughout. **Whenever something in VR looks
pinned, check whether it is reading the ground instead of the body.**

### Leaving VR is never a one-way door

`vrResumePending` is what puts `RESUME VR` on screen and is the only route back
in — the VR checkbox lives at the sign-in gate, on the far side of a session the
visitor is in the middle of. Both exits set it: `EXIT VR PREVIEW` **and**
`STAY IN BROWSER`. Resuming re-opts into VR so the rest of the interface does not
go on believing they left. `RESUME VR` and `EXIT VR PREVIEW` are never on screen
together, so they share one corner rule at all three breakpoints.

### The square's record comes back after a screening

Every jukebox frame is built **muted** — the only way a phone lets one start —
and `DROP THE BEAT` exists to ask for the unmute with a real tap. That prompt was
latched shut by a flag set the first time it was pressed, and **the flag outlived
the player it was pressed for**: walking into a venue destroys the frame, walking
out builds a new one needing the same permission, and the only control that could
ask had been retired for the visit.

The prompt now follows the player's own report — `infoDelivery` carries `muted`
and `volume` on the same channel as the length the service already reads:

```
hidden = no record on || sound not wanted || the player says it is audible
```

It follows reality in both directions and never appears on a desk, where the
load-handler unmute is granted. **An empty queue is not this bug**: a record ends
on the service's clock, and with nothing waiting the square is genuinely quiet.
`data-jukeboxReview` reports `nowPlaying` first for that reason.

### Residents swim

Only a body the visitor was *steering* had ever floated; a resident on its own —
following or on its route — was pinned to `groundHeightAt()`. `SWIM_Z = -60` is
one constant shared with the visitor's own `shouldSwim`, so owner and dog start
swimming on the same step. `poseNpcSwimming()` runs **after** the walk cycle,
which writes every leg it overwrites, and its roll is cleared on land because
nothing else writes that axis.

`MENTOR_SWIM_Y = -0.72` is measured, not eyeballed: the sea's surface is at
**0.14** and the dog's body block runs 0.39–1.09 above its own root, so this puts
about 71% of the body under with the collar and the top of the back clear. The
human swims at 74% by the same measure. A first attempt sank it half a unit from
standing, which left the belly exactly on the surface — legs under, everything
else above, still walking.

**Anything that floats should be derived from 0.14.** The water is translucent
with `depthWrite: false`, so a submerged body still shows through it — do not
read "I can see its legs" as "it is not in the water".

### Webcam head tracking

Shipped, not behind a flag; `?headtrack=off` is the way out, because this reaches
for a camera and a ~7MB download and a browser that misbehaves at either should
be switchable off without a deploy.

A webcam loses a face around 35° of turn, so head angle cannot drive view angle
one for one — that would be a 60° cone and nothing beyond it. The head does two
jobs:

- **Position is the window.** Leaning moves the eye *and rebuilds the frustum
  around it*, so the screen's own rectangle stays pinned in the world. That
  second half is the whole effect: without it, leaning left swings the scene
  rather than revealing what was behind the left edge.
- **Rotation is amplified.** `HEAD_YAW_GAIN = 4`, `HEAD_PITCH_GAIN = 2.6`,
  `HEAD_PARALLAX_UNITS_PER_METRE = 12`. The owner confirmed these feel right.

Mouse drag still owns the gross turn. **Roll is deliberately dropped** — tilting
your head at a monitor does not tilt the room.

**Two of the four axes are mirrored, and that is not a bug.** The lens looks *at*
the face rather than out with it, so the axes along its line — pitch and depth —
arrive reversed, while the two across it do not. Both are corrected in
`applyMatrix()`, which is the only place any of these signs live.

Unlike a phone's gyroscope, this one **wants** smoothing: that was a fused,
filtered pose to be applied whole; this is a guess made from pixels thirty times
a second, and easing is the difference between a window and a shiver.

**Desk only**, gated on `(min-width: 781px) and (hover: hover) and (pointer:
fine)` — the exact breakpoint the interface switches on, so the touch controls
showing and head tracking being offered can never both be true. Re-checked from
the world's own tick, because a `matchMedia` listener did not fire under a
viewport change during review. The panel's title row folds it away entirely.

### The tracker never touches the disk

All four files are fetched with `cache: 'no-store'` and held only in the tab's
memory. Three things were needed to make that true rather than nearly true:

- the library is `import()`ed **from a blob URL** — an `import()` of a real URL is
  cached like any other script;
- the runtime is handed over as explicit `wasmLoaderPath` / `wasmBinaryPath` blob
  URLs, not through `FilesetResolver.forVisionTasks`, which fetches by URL itself;
- the model goes in as `modelAssetBuffer`, not `modelAssetPath`, which the runtime
  would fetch and cache the ordinary way.

Held for the life of the page rather than the session, so leaving VR and going
back in does not fetch it twice; `release()` drops it, and `FestivalWorld.stop()`
calls it.

**It is ~7MB over the wire, not 15.** 2.98MB of runtime and 3.58MB of model, both
compressed in transit; the 11.7MB figure is the *uncompressed* wasm. Measure
`transferSize`, or `curl --compressed`, not the file at the far end.

**Pin versions against the registry, not against memory.** The first published
attempt used `@mediapipe/tasks-vision@0.10.22`, which does not exist — the package
left the `0.10.x` line for `1.0.x` — and the owner's first press produced a 404.

### Security pass

**The code is weighed before it runs.** Head tracking executes third-party
JavaScript beside an open camera, and a pinned version is not protection: a
compromised CDN or hijacked package would be a webcam in a stranger's hands, on a
page whose own panel promises the video never leaves the machine. All four files
are checked against a recorded SHA-256 before anything is decoded or executed.
`<script integrity>` cannot reach any of this — none of it arrives through a
script tag — but the bytes are already fetched by hand for the no-store
guarantee, so they can be weighed on the way past. Verified in both directions,
including that a wrong digest refuses. Regenerate with:

```bash
curl -s --compressed -L <url> | openssl dgst -sha256 -binary | openssl base64 -A
```

A mismatch means the file changed. **Do not paper over it by updating the digest
without knowing why it moved.**

Also fixed: head tracking refuses to run inside a frame (a page that frames this
one can overlay the panel and steal the click that opens a camera), the service
sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`, `projectorMessage`
compares exact origins instead of `includes('youtube.com')` — true of
`youtube.com.example.net`, which anybody can register — `serveStatic`'s escape
check gained the separator it needed, and `Permissions-Policy` became
`camera=(self)` rather than `camera=()`, which would have broken head tracking on
the service-hosted copy and nowhere else.

**Checked and sound:** the staff key is compared with `timingSafeEqual`, sent as a
header, kept in `sessionStorage`, absent from the bundle, and **fails closed** when
unset in production. Chat escapes author and body. The store link is validated to
http/https on the service *and* again in the client. CORS is an allowlist that
refuses unknown origins, and every authenticated route needs a custom header, so a
cross-site post cannot reach one. Bodies are capped at 16kB, chat is rate-limited,
`MAX_VISITORS` bounds the rest.

This was a code review, not a penetration test of the running service.

### What the fixtures learned

- `?review=mentor-swim` puts the visitor and a loyal MENTOR past the beach. It
  **feeds** the dog rather than assigning the follower, because the service owns
  `mentorFollower` and reconciles an assigned one away within the second — which
  is why `?review=mentor-follow` had been reporting an empty object and measuring
  nothing. Both MENTOR fixtures stage against the visitor's **real** id, not the
  literal `'review-self'`.
- `?review=headtrack` exposes `__festivalHeadTrack([pose])` and
  `__festivalHeadTrackLoad()`. It settles the easing and applies the view
  **synchronously**, because a review browser runs the page in a hidden tab where
  **timers are clamped to about one a second** — waiting for convergence over real
  frames turns a nine-pose sweep into a minute of nothing. Copy this for any
  fixture that steps through states.
- `window.__festivalMentor()` and `document.documentElement.dataset.jukeboxReview`
  report from **every** loopback page, not just their own fixture. Reach for those
  before staging anything.
- **An author `display` outranks the browser's rule for the `hidden` attribute.**
  `.head-track label { display: grid }` kept an empty camera picker on screen with
  `hidden` set. Third time this trap has cost a session: when an element will not
  hide, check for an author `display` before anything else.

---

## 0a. Desktop VR exit control right edge

The owner's follow-up screenshot showed `離開 VR 預覽` a few pixels left of the
top-right `線上 / …` status box. The exit control now uses the same right inset
as the header at every layout that can show it: 16px on ordinary desktop, 14px
at the narrow breakpoint and 10px plus the safe-area inset in short landscape.
Its previously approved vertical alignment is unchanged.

This remains a CSS-only follow-up. It changes no WebXR, projector/video, camera,
avatar, or screen behavior. The local desktop-VR review entered successfully and
exposed both controls. All 43 server tests, TypeScript, the Vite production build
and `git diff --check` pass. The owner approved publication on 2026-09-03. The
beta payload references `index-BxOjzBwv.js`, `index-Djeoze8P.css` and the
unchanged `three-Bb7Az0mP.js` runtime bundle.

## 0b. Desktop VR exit control vertical alignment

The owner's desktop VR screenshot showed `離開 VR 預覽` sharing the header row
with, and covering, the top-right connection-status box. The control now stays
right-aligned but uses the same top coordinate as the left-side venue label:
65px in the ordinary desktop layout and 76px in the existing narrow/coarse
breakpoint. This aligns its top edge with `我的廣場` while leaving the connection
status unobstructed. Safe-area inset support remains in both values.

This is a CSS-only positioning follow-up. It does not change WebXR sessions,
camera height, projector/video behavior, screen or avatar geometry, or the
accepted exit-to-YouTube/resume-VR flow. All 43 server tests, TypeScript, the
Vite production build and `git diff --check` pass. The owner explicitly approved
publication on 2026-09-03. The beta payload references `index-Du5ZjJto.js`,
`index-BpMAefXC.css` and the unchanged `three-Bb7Az0mP.js` runtime bundle. The
custom domain was then opened with a cache-busting release query and confirmed
to serve those exact new JavaScript and CSS assets; the published desktop VR
flow exposed both `我的廣場` and `離開 VR 預覽` with the updated stylesheet.

## 0c. Desktop VR eye height and live YouTube published

The owner's desktop VR screenshots showed the preview camera below the avatar's
established first-person eye line and WebGL title posters in place of the live
public-screening videos. The local follow-up fixes both without changing screen
geometry, the avatar foreground compositor or the true Quest media compromise.

- Desktop VR now uses the same 2.90-world-unit height above the floor as the
  avatar's first-person POV. That value is derived from the 0.28 avatar rig
  origin plus its existing 2.62 eye offset, so the two views cannot drift apart.
- A simulated desktop VR session keeps the ordinary CSS3D YouTube projector
  mounted, visible and playing. It no longer releases the iframe, enables the
  five WebGL poster substitutes or hides the CSS projector layer.
- A real immersive Quest session still releases the iframe and uses the WebGL
  posters. Cross-origin YouTube embeds cannot be drawn into an immersive WebXR
  texture; seated Quest playback therefore retains the already accepted flow
  that exits the immersive session to YouTube and offers `RESUME VR` afterward.
  The owner explicitly chose to keep this exit/resume flow for now on
  2026-09-03; no direct-video or WebXR media-layer experiment was added.
- `?review=vr-screen` is a loopback-only deterministic fixture. It seats the
  visitor at the Shore, uses a verified embeddable catalogue item and reports
  the active projector mode, iframe/playback state and both eye heights through
  `data-vr-review`.
- Verified locally in the browser: desktop VR was active with one WebGL context,
  no WebGL posters, the Shore iframe mounted and `playing: true`; both the
  simulated eye height and avatar POV height reported 2.9. The rendered review
  frame showed the live music video on the in-world screen. All 43 server tests,
  TypeScript, the Vite production build and `git diff --check` pass.

The owner approved publication on 2026-09-03. The beta payload references
`index-7-GEqjQU.js`, `index-CfFYu65j.css` and the unchanged
`three-Bb7Az0mP.js` runtime bundle.

## 0d. Desktop VR access published

The owner asked to use the VR mode from a desktop so they can verify it without
a Quest. A fine-pointer, hover-capable browser now receives an enabled
`VR DESKTOP MODE` checkbox when immersive WebXR is unavailable. It enters the
same single-context VR presentation through the existing simulated path, with
keyboard/mouse navigation, WebGL projector posters and an explicit exit button.
A Quest browser with `immersive-vr` support still enters real WebXR. Touch-only
phones without WebXR stay disabled, preserving the mobile stability path.

The ordinary desktop flow and Quest-support fixture passed in-browser; the
desktop entered and exited its simulated presentation with one WebGL context,
two controller stand-ins and all five projector posters. All 43 server tests,
the TypeScript/Vite build and `git diff --check` passed. The owner approved
publication on 2026-09-03; the beta payload references `index-Dj_j6JGO.js`,
the unchanged `index-Dg2SpIlQ.css` and `three-Bb7Az0mP.js` bundles.

## 0e. VR option visible on every gate, published

The owner opened the published beta on a desktop browser and reasonably thought
VR was absent: the capability check hid the entire option when `immersive-vr`
was unavailable. The gate now always shows `QUEST VR MODE`. While WebXR support
is being checked, and on browsers without a connected headset, the checkbox is
disabled and its bilingual note explains that the page must be opened in Meta
Quest Browser. On a supported Quest browser it becomes the same active checkbox
as before. The local VR review fixture remains active and clearly labelled.

This follow-up changes no WebXR session, projector, avatar or screen geometry.
The owner approved publication on 2026-09-03. Its beta payload references
`index-CeN7ts66.js`, `index-Dg2SpIlQ.css` and the unchanged
`three-Bb7Az0mP.js` runtime bundle.

## 0f. Quest/WebXR beta published

The owner asked whether the festival could run on Meta Quest and chose YouTube
embeds as the only screening source. They accepted this product compromise:
the venue itself is immersive and walkable; selecting a screening ends the
immersive session and opens the untouched standard YouTube iframe, then a
`RESUME VR` action requests a new immersive session and returns to the same
world position and seat.

- The gate detects `immersive-vr` support with `navigator.xr.isSessionSupported`.
  It does not user-agent sniff. Supported browsers receive a bilingual
  `QUEST VR MODE` option; selecting it forces Lite graphics and stores only a
  per-tab preference. Entry into WebXR still has its own explicit button after
  the world loads because the browser requires a direct user gesture.
- The world uses Three's `WebGLRenderer.setAnimationLoop`, a `local-floor`
  reference space, 0.78 framebuffer scale and fixed foveation. Quest mode keeps
  one WebGL renderer/context and never constructs the desktop foreground
  renderer.
- Quest Touch controls: left stick moves, either grip runs, right stick snap
  turns 30 degrees, left stick click steps/teleports forward, X jumps, and the
  trigger uses the ordinary interaction. At a screening seat, the trigger sends
  the visitor to the standard YouTube player instead.
- CSS3D/iframe projectors are unavailable inside an immersive WebXR layer. Each
  venue therefore has a lightweight WebGL poster at the exact existing screen
  centre with the current title and the instruction to sit/press trigger. The
  normal DOM projector is released while VR is active, avoiding a competing
  video decoder. No screen geometry or approved avatar compositor changed.
- Local fixtures: `?review=vr-gate`, `?review=vr-entry`, `?review=vr-youtube`.
  On loopback only, `vr-gate` and `vr-entry` now launch a clearly labelled
  desktop simulation instead of making a doomed immersive-session request.
  Keyboard/mouse navigation, the WebGL screening posters and exit flow can
  therefore be reviewed without a headset; this simulation is never enabled
  by a production URL.
  `data-vr-review` reports support, the standard YouTube hostname, preserved
  seat, controller count, render-loop type and whether Quest mode retained one
  WebGL context.
- Locally verified: the gate option renders at 1024 x 768; checking it and
  entering muted reaches the VR-ready card; the desktop preview enters and
  exits with one WebGL context, two controller stand-ins and five WebGL
  screening posters; the YouTube fixture opens a
  maximized `www.youtube.com` iframe from `SHORE-1-1`; closing it reveals
  `RESUME VR`; the existing 390 x 844 mobile-stability fixture still reports
  `contexts: 1`, one live player and no console warnings/errors. All 43 server
  tests, TypeScript/Vite build and `git diff --check` pass.
- Not locally verifiable: actual Quest headset permission, stereoscopic frame
  timing, Touch-controller mappings and the end-session/resume gesture on Quest
  Browser. Treat these as device QA, not confirmed behavior.

The owner approved publication on 2026-09-03. The beta payload references
`index-D73Tb99w.js`, `index-BTLDz2Xy.css` and `three-Bb7Az0mP.js`. Real Quest
headset behavior still requires the device QA listed above.

## 0g. All-avatar foreground follow-up published

The owner's live iPhone screenshots showed both resident DJs hidden by the CSS3D
public-screening layer, the basement console hanging beyond its platform, and the
complete page becoming permanently enlarged after rapid taps. Commit `e8ba163`
published a first fix, but it solved the DJ overlap by raising both screens. The owner
clarified that their original height was correct. Commit `d93192e` then restored the
height but moved both screens left; the owner rejected that too. Published commit
`3d38a0b` restored the exact original centres and rendered each DJ over the video.
The owner confirmed the DJs are correct, then reported that ordinary NPCs and visitor
avatars still fell behind the CSS3D screen. This release extends the same foreground
composition to every avatar. It is verified locally and included in the
beta Pages payload.

- Rooftop is centred at x=40, y=13.6; Basement is centred over its booth at x=-68,
  y=-9. The physical backing meshes follow those exact positions.
- Phones still use one WebGL context. On that path, the CSS3D video sits below an
  alpha-enabled main canvas; a transparent screen-shaped plane opens the projector
  rectangle, then layer 2 redraws avatars over it with the existing renderer. Local
  visitors, their idle bodies during STAFF control, remote visitors, every resident
  NPC and MENTOR all belong to that layer. Before each pass, a conservative projected
  bounds test selects only bodies which overlap that screen and stand on its viewing
  side; the rest are temporarily culled. It does not restore the duplicate renderer,
  duplicate GPU resources, or a full-scene foreground pass. Desktop retains its
  established two-context compositor.
- The basement stage is 7.2 units deep and reaches z=33.7. The console reaches
  z=34.95, leaving 1.25 units of visible platform in front instead of hanging 0.65
  units over the old slab. XIEHGAN's prompt radius is 8 units so the deeper obstacle
  does not make the DJ action inaccessible.
- `enterWorld()` now locks the document viewport at scale 1 and cancels Safari
  gesture/double-click page scaling. The canvas still owns its in-world pointer
  camera gestures. A styled reset button remains for a Safari tab restored while it
  was already enlarged.
- Loopback fixtures: `?review=screen-rooftop`, `?review=screen-club`, and the existing
  `?review=club-dj`. The first two force the single-context path and stage a DJ,
  an ordinary resident and a visitor across the screen. `data-dj-venue-review`
  records every avatar layer, the selected ids, centre and context count;
  `data-club-review` records stage depth, front edge, console margin and prompt range.
- Direct browser validation at 390 × 650 showed DJ, ordinary NPC and visitor bodies
  visibly drawn over both centred screens. Basement selected LOUI, XIEHGAN and the
  review visitor; Rooftop selected the local visitor, MINYUN, DRBEAUTY and the review
  visitor. Both fixtures report all 12 NPC parent groups plus both local visitor forms
  on layer 2, `singleContextComposite: true`, and `contexts: 1`.
- The mobile-stability fixture remained at one iframe, one context, 11 textures,
  28 geometries, 17 programs and `lost: false` from 20 through 55 seconds. At The
  Shore only the intersecting local visitor was redrawn: 12 foreground calls total,
  including the aperture. Browser console reported no warnings or errors.
  All 43 server tests and the TypeScript/Vite build pass.

The owner explicitly rejected changing either screen height or horizontal centre.
Preserve both positions, every avatar type in the foreground layer, and the
one-context phone compositor.

## 0a. Concrete mobile stability fix, published; awaiting phone confirmation

The owner's Safari tab was repeatedly dying and returning to the sign-in page.
This pass found and fixed two concrete causes of mobile memory/GPU pressure. The
fix passes the local phone fixture and was published in commit `15c9354`, but it is
**not yet explicitly confirmed stable on the owner's actual phone**. Keep that
distinction explicit.

**The unbounded leak:** every ordinary multiplayer state packet calls
`setEntranceSign` and `setTempleSign`. Those methods rebuilt 1024 × 512 canvas
textures even when the text was unchanged. Worse, `createTextTexture` kept every
font-repaint closure forever, so disposing a replaced texture did not release
its canvas. An idle connected client therefore accumulated full-size canvases
without any visible change. The fix:

- deduplicates unchanged entrance, temple and venue lettering;
- keeps pending font repaints in a `Set`, removes the repaint when its texture
  is disposed, and clears the set after both brand fonts settle;
- exposes `repaints` / `pendingSignRepaints` in the loopback diagnostics.

**The phone GPU spike:** the CSS3D projector video had a second
`THREE.WebGLRenderer` above it to redraw occluding geometry. That meant two
WebGL contexts, duplicate scene uploads and a second full draw pass exactly
when the phone was also decoding video. Coarse, no-hover devices now retain the
video but use only the main WebGL context; desktop keeps the exact two-context
composition. The context-loss handler now tracks both desktop canvases and
waits for every lost context to restore before drawing again.

Related lifecycle leaks fixed in the same audit: departing remote avatars now
dispose their unique geometry, badge maps and materials, and the five-second
light-cull timer is cleared when the world stops.

**Local evidence, `?review=mobile-stability&era=ps2`, 390 × 650:**

- 250 alternating entrance/temple sign updates: `repaints 0`, `textures 12`,
  `programs 31`, `live 1`, `frames 1`, `ctx 1`, `lost false` before and after;
- the same 250-update test on the plain world held its finite pre-font repaint
  set at 11 before and after, with `textures 12`, `ctx 1` and `lost false`;
- the public screening remained alive through 86 seconds of idle playback;
  after renderer warm-up, geometry held at 354 for the final 40 seconds and
  textures held at 12;
- a desktop `?review=perf&era=ps2` run still reports `ctx 2` and
  `mobileGpuConservation false`, so the desktop compositor was not removed;
- `npm run verify` passes all 43 server tests and the TypeScript/Vite build.

The loopback fixture exposes `data-mobile-stability-review` (the 250-update
before/after report) and `data-mobile-stability-live` (refreshed every five
seconds) on `#app`. It also places the visitor at a live Shore screening and
forces the one-context phone path even from a desktop test browser.

**The black box remains important.** It writes one diagnostic line to
`localStorage` every second (`App.startBlackBox` →
`FestivalWorld.diagnosticSample`). If the real phone still crashes, ask the
owner to photograph the entire red `LAST SESSION ENDED AT` line on the next
load. The new fields are `ctx`, `fgdraws`, `fgprogs` and `repaints`; more than
one live iframe, a rising repaint count, or `lost true` would separate a
remaining player/context fault from this fixed leak.

Phone video autoplay was **not** changed. Tap-to-start remains a possible
fallback only if the owner's phone still fails after this build.

## 0b. What changed this session — 2026-08-24/25

Published baseline before the current DJ/screen follow-up:

- removed the procedural exterior corner conduit in `WornArchitecture.ts`;
  this was the thin bar/stick protruding through the building wall in the
  owner's 2026-08-25 phone screenshot. No other wall dressing was moved;
- implemented the mobile stability work documented in 0a, including the
  loopback-only `mobile-stability` fixture and expanded black-box counters.

Thirty-two commits, `cc3b484` … `535b809`, every one published to Pages. **Two
regressions were introduced and then fixed inside this session** — check these
first if something looks wrong:

- The styling pass cloned its own output on every re-run, abandoning 51
  materials (`WornStyle.applyWornStyle`, guarded by `userData.wornMasonry`;
  `orphanedStyleMaterials` in the worn snapshot exists to catch a recurrence).
- The lamp cull ran 600 ms after load, forcing a recompile of ~1900 materials
  after the first frames. It now runs in `FestivalWorld.start()`, before
  anything has compiled. **Any light made invisible after first paint costs a
  full scene shader rebuild — this is the trap to remember.**

Art direction (all behind `?worn` / `?era=ps2`, never on for visitors):

- `era=ps2` adds world-space **courses** on walls only, four kinds — block,
  concrete panel, corrugated, render — chosen per 16 m cell, and per *room* for
  interiors so a room agrees with itself. Doors, stalls and both staircases are
  excluded (`userData.wornNoMasonry`); the size test asks for ≥4 tall and ≥6
  wide, because 2.4 in both is a door.
- 24 buildings **massed** with a plinth and cornice, merged into each mesh's own
  geometry — draw calls are the budget here, triangles are not.
- A **kerbed footway** on the cross street only, laid by walking it and asking
  the world for room. The main approach is 29 wide and its carpet 28 — there is
  no pavement there to raise.
- The painted face was built, then reverted to the visor on the owner's
  preference. The reasoning is kept in the comment where the visor is built.
- The dither stays at the signed-off level under `era=ps2`. The argument for
  standing it down was correct about the console and lost anyway.

Mobile and connection work — all real, none of it the crash:

- Shader hash rewritten to drop 18 `sin()` per fragment; the two smooth octaves
  compile out on 精簡 (`WORN_CHEAP`). The owner confirmed screening lag improved.
- 精簡 keeps 3 street lamps instead of 6 and hides all but 6 other placed lamps;
  night ambient is lifted 0.85 to compensate (`DayNightCycle.setAmbientLift`).
- WebGL **context loss is now handled** (`FestivalWorld.watchForContextLoss`).
  Nothing listened before, and the default when nobody listens is that the
  context never comes back.
- Seating is measured rather than assumed: the pad is found by looking, the hip
  rise is read off the rig. Drive-In seats sit on the car, not the tarmac
  behind it. Seat reach is horizontal (`nearestSeat`) — the rooftop benches were
  unreachable by arithmetic before.
- Connection: join retries forever, streams carry a generation so a stale one
  cannot kill a live one, a 40 s silence watchdog, `wake()` on
  `visibilitychange`/`pageshow`, and `pagehide` is now **reversible** — it no
  longer says goodbye, tears out listeners, or wipes quest progress.
- Session id and token persist in `sessionStorage` so a discarded tab reclaims
  its own visitor instead of colliding with its own name.

## 0c. Owed to the owner

1. **`world/server/index.mjs` has an undeployed change.** A name is now only
   reserved while its holder has an open stream; a disconnected holder is stood
   down (`claimName`). Two tests cover both halves. **Render needs a manual
   deploy — the owner does this by hand, and pushing to `main` ships the client
   only.** Until then the client half works and the server half does not.
2. The art-direction board (`https://claude.ai/code/artifact/a2b69b4e-235a-4512-bbfd-9fcd58b46bcc`)
   is three drafts stale. It still claims `era=ps2` stands the banding down.
3. Closing a tab now leaves a ghost visitor for up to two minutes, which is the
   accepted cost of not saying goodbye on backgrounding. `beforeunload` would
   fix it if ghosts become a nuisance.

## 0d. Corrections to the rest of this file

- **There are 43 server tests now**, not 41. Two were added for the name rule.
- The publish rule below says to wait for the word `publish`. **That is not how
  this session ran** — the owner verifies on the live site and treats unpublished
  work as no work, so every turn ended in a publish. Confirm which they want
  rather than assuming either.
- New review fixtures: `?review=sit`, `sit-rooftop`, `sit-drive` (seating
  geometry, with `reachable` and `legInPad`), `?review=kerb` (the footway).
  New flags: `?era=ps2`, `&wornTexture=N`.

---

## 0. Where to work

`/Users/myscheduleai/Desktop/myschedule-pivot/gate-entry-fix`, on branch
`codex/fix-gate-entry-brand`. The owner confirmed this on 2026-08-21.

It is a **git worktree** of the same repository as
`/Users/myscheduleai/Desktop/myscheduleltd.github.io`, which holds `main`. Two
checkouts, one repo — so work done in the wrong one is invisible in the other
until somebody notices. Publishing pushes this branch to `main`
(`git push origin HEAD:main`, a fast-forward), and the `main` worktree should be
brought level afterwards with `git fetch && git merge --ff-only origin/main` so
the two never drift.

## 1. The one rule that matters

**Do not publish until the owner explicitly says `publish`.** Finish and verify the
working tree, report that it is ready, then wait. When approval arrives, publish the
whole accepted working tree together:

```bash
cd world && npm run build:beta          # tsc --noEmit && vite build && publish to docs/beta
cd .. && git status --short
# Stage only the confirmed source/handoff paths, docs/beta/index.html, and the
# new hashed assets named by that index. Never broad-stage the worktree.
git add -- <confirmed-paths>
git diff --cached --check && git diff --cached --name-status
git commit && git push origin main
```

`npm run verify` (`node --test server/server.test.mjs && tsc --noEmit && vite build`)
must pass first. There are **43 server tests**; they all pass with the current working tree.

`git diff --cached --check` will flag trailing whitespace inside a regenerated
`three-*.js` chunk. That is minified GLSL, not hand-written code — run the check
with `-- . ':(exclude)docs/beta/assets/three-*.js'` and read the rest of it. When
a rebuild produces a three chunk that differs only in whitespace under an
unchanged filename hash, leave the committed one alone rather than adding a
four-thousand-line no-op diff.

Three related traps, all of which have cost hours:

- **GitHub Pages caches `index.html` for 600s.** After a push, a browser can hold the
  old `index.html` pointing at the previous hashed bundle. When the owner says "your
  fix didn't work", check the shipped bundle actually contains the change before
  touching code.
- **`docs/beta` keeps old asset files.** `ls docs/beta/assets/*.css | head -1` tells you
  nothing. Always resolve the bundle actually referenced by `docs/beta/index.html`.
- **Confirm the publish landed, do not assume it.** Poll the live URL until it
  serves the new bundle, then grep the served asset for the change itself:

  ```bash
  until curl -s "https://myscheduleltd.com/beta/index.html?cb=$(date +%s%N)" \
    | grep -q '<new-bundle>.js'; do sleep 15; done
  curl -s "https://myscheduleltd.com/beta/assets/<new-bundle>.js" | grep -c '<the change>'
  ```

  Propagation runs from under a minute to several. The custom domain is
  **myscheduleltd.com** — `CNAME` says so; `myschedule.co` does not resolve.

---

## 2. Layout

| Path | What it is |
| --- | --- |
| `world/src/world/FestivalWorld.ts` | The whole three.js world. ~11k lines. Geometry, colliders, NPCs, camera, projectors, interaction prompts, VR sessions and the phone's motion camera. |
| `world/src/world/HeadTracking.ts` | Webcam head tracking for the desktop VR preview: the camera, the model, and the smoothed pose. `FestivalWorld` only consumes it. **Every axis sign and every integrity digest lives here.** |
| `world/src/ui/App.ts` | All DOM/UI. Gate, panels, chat, staff tools, jukebox player, touch controls. |
| `world/src/style.css` | All styling, including every mobile/landscape rule. |
| `world/server/index.mjs` | Zero-dependency Node service. SSE presence, chat, seats, punches, jukebox, programme clock, staff admin. |
| `world/server/server.test.mjs` | 43 tests. Run with `npm test`. |
| `world/scripts/publish-beta.mjs` | Copies the Vite build into `docs/beta`. |

Deployment: **Pages** serves `docs/` at **myscheduleltd.com** (see `CNAME`).
**Render** runs `world/server/index.mjs`, **by hand** — pushing to main ships the
static beta and nothing else, so any change under `world/server/` is live only
after the owner deploys it from the Render dashboard. Say so plainly when a
change is split across the two.

### Latest published foundation (`8f478de`)

- A cold Render instance no longer holds the visitor on an apparently inert
  Enter button. If the public configuration wake-up request has not answered,
  the local world opens immediately and its single pending admission request
  attaches multiplayer in the background. `FestivalClient.connect()` shares
  that promise, so it cannot create a duplicate attendee.
- The gate reports `正在開啟影展… / OPENING THE FESTIVAL…` and disables both
  submit buttons as soon as one is clicked. Scene construction is deferred by
  one short browser task so this acknowledgement can paint first.
- The built-in wordmark fallback now matches the established production STAFF
  values (`41px`, scale `0.65 × 1.35`, vertical offset `4px`), preventing the
  top-left lockup from shrinking while Render wakes.
- Verified with both `/api/config` and `/api/session` delayed by 15 seconds:
  the fallback wordmark was already correct, the world opened before the
  service response, and the same attendee later changed from CONNECTING to
  LIVE without a duplicate request. `npm run verify` passes 41/41 tests and the
  TypeScript/Vite production build.
- Fireworks no longer add and remove a PointLight per rocket and burst. One
  non-shadow-casting light is created with the world and follows the brightest
  burst, so real world illumination remains while Three.js keeps a fixed light
  count and does not recompile scene shaders as the show begins. Normal mode is
  capped at 2 rockets, 4 bursts and 40 particles per burst (160 total); Lite is
  capped at 1, 2 and 24. Burst integration now writes directly to its typed
  position array. Browser snapshot during the opening showed 1 rocket, 3 bursts,
  120 particles, 1 active light and 3 sea reflections.
- A compact live `任務 / OBJECTIVES` counter sits below the top-left status chips,
  opens the checklist, and is refreshed from the same `completedQuests` set as
  the pass. Desktop browser measurement: 64 × 25 px at `(16, 164)`; it updated
  from 0/25 to 2/25 during the fireworks fixture.
- `POST /api/mentor/feed` returns the caller's complete authoritative state.
  `FestivalClient.feedMentor()` applies it immediately, so the attendee feed
  badge and `mentorFollower` do not wait for the batched SSE broadcast. The
  service still broadcasts for everybody else. The server test asserts the
  immediate count and follower; the `mentor-follow` browser fixture closed an
  obstructed 11.88-unit separation to the natural 2.10-unit follow distance.
- The shared overlay now carries `data-menu-owner="dj"` or `"screening"`.
  Opening or hiding any theater menu clears stale DJ state, and queue broadcasts
  redraw only a visible DJ-owned menu. `?review=menu-ownership` deliberately
  opens a DJ request page and then a Shore seat; the final owner is `screening`
  and the title remains `已入座`.
- These fixes were published in `8f478de` and GitHub Pages served the new
  `index-C9FAbyXK.js` bundle after its deployment completed.

### Current mobile interaction behavior

- On a landscape phone, the compact `任務 / OBJECTIVES` counter sits under the
  42px square logo with aligned left edges. At 760 × 390 its box was `(12, 54,
  62.6, 25)`, leaving a 6.5px vertical gap and no overlap with the logo.
- The festival-pass menu owns a bounded `100dvh` scroller in every mobile
  orientation. Browser drags reached the last item at both 760 × 390 landscape
  (`356px` range) and 390 × 650 portrait (`114px` range).
- During screenings, the camera control keeps the bottom-left corner and any
  seated/order interaction prompt takes a smaller separate slot. Alerts use
  the following row. At the basement-bar fixture the order/drink prompt and
  camera did not intersect; ordering a drink placed the 34px prompt at y=52 and
  its 42.5px reminder at y=96 with no overlap.
- A loyal MENTOR no longer monopolizes E/tap whenever another attendee is in
  greeting range. Both the label and the action prioritize the greeting while
  the dog follows the locally controlled body; with nobody else nearby the
  feed/pick-up prompt is unchanged. `?review=mentor-follow-greeting` stages the
  collision and verified `gesture: "wave"`, `mentorEating: false` after a tap.
- Commit `5ae3d39` gives only the DJ track-request prompt the
  `interaction-toast--dj` layout hook. `App.updateSnapshot()` derives the hook
  from the raw `E / REQUEST A TRACK FROM ...` interaction before localization,
  so English and Traditional Chinese use the same rule without styling copy.
  The prompt retains its current size, stays horizontally centred, and shares
  the pass button's bottom baseline. Browser measurements were exact in both
  portrait 390 × 650 (`44px` prompt, `0px` centre and bottom deltas) and
  landscape 760 × 390 (`38px` prompt, `0px` centre and bottom deltas).
- The previous mobile/pass/MENTOR fixes are in `10dba12`; the focused alignment
  follow-up is `5ae3d39`. `npm run verify` passes all 41 server tests plus the
  TypeScript/Vite production build.

---

## 3. Verification: read this before you trust a measurement

The in-app browser runs the page in a **backgrounded tab**, which suspends the
rendering steps. Everything below silently does not happen there:

- `requestAnimationFrame` — the world does not advance, so **the avatar cannot be
  walked anywhere** and snapshots do not reach the DOM.
- **CSS transitions and animations** — `getComputedStyle().opacity` returns a frozen
  mid-transition value. This produced three wrong readings in one session.
- **`ResizeObserver`** — callbacks never fire, not even the initial one.
- **`resize` handling** — renderer buffers do not follow a window resize.

A `computer.screenshot` forces a single frame, which is often enough to sync the DOM.

**The part that costs whole sessions**: a reading taken from a frozen world comes
back as a plausible number, not as an error. Three separate crowd measurements
were reported as evidence before anyone noticed the world had not moved between
samples. If you are measuring anything that changes *over time*, either drive it
yourself from a fixture (see `__festivalStep` in §0) or check that time actually
passed — `requestAnimationFrame` tick count, or the world clock in the HUD.

**Corollaries.** Measure geometry and computed styles, not animated values. Prefer a
review fixture over driving the avatar. And when a UI element is invisible, check both
CSS `display` **and** the `hidden` attribute — a whole session was lost moving a prompt
around the stylesheet when one line of JavaScript was setting `hidden` on it.

### Review fixtures

`?review=<name>` on `127.0.0.1` only. Several expose `window.__festivalReview()`.

```
gate  gate-approach  temple  temple-altar  jukebox  jukebox-sound  perf
club  club-dj  club-lobby  club-bar
rooftop  rooftop-dj
mentor  mentor-carry  mentor-npc-carry  mentor-follow  mentor-follow-greeting  mentor-swim
mentor-drop  mentor-remote-drop
npc-control  npc-popcorn-seat  nav
quests  quests-complete  fireworks  menu-ownership  menu
statue  fit
vr-gate  vr-entry  vr-phone  vr-screen  vr-youtube  headtrack
```

The newer ones, and what each answers:

| Target | Hooks | Answers |
| --- | --- | --- |
| `nav` | `__festivalStep(seconds)`, `__festivalGaps()`, `__festivalResidents()`, `__festivalCrowding()` | Does the crowd walk, and does it pile up — **without needing the render loop**. Read §0 before trusting anything else about the crowd. |
| `statue` | `__festivalStatue(distance, yaw, pitch)`, `__festivalLookAt(x, z, …)`, `__festivalIntrusions()` | How the sculpture reads from a repeatable angle, and what is overlapping it. `__festivalLookAt` works for any point in the world. |
| `fit` | `__festivalFit()`, `__festivalWear(slot, colour?)` | Where each accessory sits along the body's own forward axis, on either rig. |
| `menu` | `__festivalMenuNav(nav)` | Controller menu navigation without a controller — the pad half is polled from the render loop, which a suspended page never runs. |
| `mentor-remote-drop` | `__festivalDrop(x, z, yaw)`, `__festivalDispose(rescue)` | A remote carrier holding the dog and then being torn down. `__festivalDispose(false)` runs the *old* teardown and names every mesh it destroys. |

**Note the name collision that nearly happened**: `mentor-drop` already existed.
The new one is `mentor-remote-drop`. The `?review=` chain is a run of `else if`,
so a duplicate silently shadows whichever comes later — **grep the chain before
adding a target.**

Two of these report from anywhere on loopback rather than from their own page:
`window.__festivalMentor()` (where MENTOR is, and whether it is swimming) and
`document.documentElement.dataset.jukeboxReview` (every input the record's fate
depends on). Reach for those before staging a fixture at all.

`club-bar` seats an avatar on a bar stool and `__festivalReview()` reports the
interaction label, `nearClubBar`, `canInteract` and `promptAction`. **Write more of
these.** Reasoning about the bar seat was wrong three times in a row; the fixture
answered it in one call.

---

## 4. Systems worth knowing before you touch them

**Interaction prompts.** `interactionLabel()` in `FestivalWorld.ts` chooses the words
*and* records `promptAction` (`interact` / `shift` / `worship`), `promptActionable` and
`promptSecondary` in the same pass. `canInteract()` reads those fields — it used to be
a hand-copied duplicate of the same branches and had drifted, which disabled the
altar's prompt entirely. **Do not re-introduce a second source of truth here.**

On touch, `promptForTouch()` rewrites key names into tap/hold language. A prompt whose
only offer is `SHIFT+E` is performed by a *tap*; only the two-part MENTOR prompt speaks
of holding. Hold-to-trigger is `PROMPT_HOLD_MS = 450`.

**Mobile vs desktop.** Keyed to `(pointer: coarse) and (hover: none)`, plus a
`max-width: 780px` clause for narrow desktop windows. **Not** to width alone — a phone
asked for the desktop site, or reporting a tall viewport, was getting a mouse layout,
which was the root of several "landscape is broken" reports. A touchscreen laptop
hovers, so it keeps the desk site.

**iOS keyboard.** `--keyboard-inset` is measured from `visualViewport` and fed into
panel insets; `:root[data-keyboard='up']` folds away the panel header and chat channel
tabs to buy room. Without this the writing box sits behind the keys.

**iOS zoom.** Safari zooms the page when focusing a field under 16px and never zooms
back. Every field is 16px under `(pointer: coarse)`; the two camera captions are set at
16px and scaled back down with a transform so they keep their designed size without
triggering it. Double-tap zoom is disabled via `touch-action: manipulation` applied to
`*` — it is **not inherited**, so setting it on `body` alone does nothing.

**Projectors.** CSS3D iframes composited over WebGL, with a second scissored renderer
pass drawing geometry back over them to fake occlusion. That mask is computed from the
camera against the canvas size, so the canvas is watched with a `ResizeObserver`.
Playback is nudged on returning to view, on `visibilitychange`, and on any pointer-up
(throttled) — phones stop media and do not restart it. Venues staff have paused are
remembered and never woken.

**Flex scrolling.** `.panel__body` needs `min-height: 0` to scroll; a flex item will not
shrink below its content otherwise, so `overflow: auto` never engages. This was written
only inside the landscape rules once, which silently truncated every panel on any
device outside them.

---

## 5. Open items

| Item | State |
| --- | --- |
| **DJ "already playing" false positive** | Fixed in `server/index.mjs` — settles the schedule before answering and only refuses when a real track length is known. **Needs a Render redeploy to take effect.** Covered by two tests. |
| **Public screens clipping on entry (mobile)** | Canvas `ResizeObserver` shipped. **Reasoned, not observed** — the test browser cannot fire resize callbacks. Unconfirmed by the owner. Ask whether rotating the phone fixes it: if yes the diagnosis holds, if no the stale value is not the canvas size. |
| **Camera-mode CSS consolidation** | Offered repeatedly, never done. **Nine bugs** in that area have come from one rule out-arguing another — a dead `data-camera-idle` flag, an `!important` beating the buttons, a leftover override freezing a control unpressable, flag ordering, a missing `pointer-events`. Worth doing as its own change with behaviour verified identical either side. |
| **Collider height audit** | Offered, never done. The popcorn stand was one instance of furniture described as a full-height wall, which pulls the camera in. There are likely more. |
| **Jukebox audio on iOS** | A tap-for-sound button exists because a gesture in the parent page does not grant a cross-origin YouTube iframe permission to play. It is now driven by what the player reports about itself rather than by a latch, so it returns whenever the square actually goes quiet. Still unconfirmed on the owner's own phone. |
| **Three security fixes await a Render deploy** | `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Permissions-Policy: camera=(self)` and the `serveStatic` separator fix are all in `server/index.mjs` and live nowhere. Pushing to main ships the static beta only. Nothing is worse than before; those three simply are not in force. |
| **`FESTIVAL_ADMIN_KEY` on Render** | Cannot be read from here. It **fails closed**, so "staff tools do not work" and "no key is set" look identical from outside. If the tools do work, a key is set and the open question is whether it is a strong one. Same for `FESTIVAL_ALLOWED_ORIGINS`. |
| **Jumping in a real headset** | The jump now moves the view, which is right on a desk and on a phone. In an immersive session, vertical camera motion with no matching inner-ear signal is a known way to make people queasy. Asked; not yet answered. Damping or suppressing it for `!xrSimulated` only would be a few lines. |
| **Live-service penetration testing** | The 2026-09-04 pass was a code review plus reasoning about browser behaviour. The running Render service was never probed. Get the owner's explicit go-ahead before testing it. |
| **The crowd is better, not right** | Over eight simulated minutes it dips to five walking and recovers to seven, and nothing touches. Two or three are stationary in any thirty-second window — some legitimate dwelling, some still cycling through blocked-and-retrying below the six-second escape. **If the owner reports it again, ask where** and point `__festivalStep` at that spot. Do not tune the thresholds blind: 3.5s was tried and collapsed the whole crowd to zero. |
| **Statue front legs** | Opened up considerably on the last pass — the near leg is high and nearly straight. Offered to pull it back; unanswered. Two numbers in `foreLeg`. |
| **Statue scale** | ~9.8 units tall, taller than the timetable board it replaced. Offered to bring the whole piece down; unanswered. One scale factor. |
| **Chain shape** | Fourth attempt. Asked whether a drape resting at the neck is what was wanted or whether it should lie flat on the chest; unanswered. Read the four-attempt list in §0 before changing it — three of the four failures are shapes, not sizes. |
| **Accessories on NPCs** | Every NPC builds all four accessory groups hidden, because the rig builder is shared. Twelve residents × four groups of hidden meshes. Cheap (three.js skips invisible subtrees early) but not free, and it would let a resident wear something later. |

---

## 6. How the owner works

- Reports bugs from **screenshots of the live site**, usually mobile Safari, often
  landscape. The screenshots are good evidence — read them closely. One showed a panel
  at desktop width, which proved the phone rules were not running at all.
- Asks "please grill me with questions" most turns and **answers them**. Ask real ones:
  ambiguities you cannot settle from the code, and trade-offs that are their call.
- Wants the concern raised **and the work done anyway** — state the assumption, ship it,
  flag what you were unsure of.
- Will tell you plainly when something still does not work. If they report the same
  fault twice, **stop reasoning and build a fixture.**

Recent decisions worth not re-litigating: all twelve NPCs render on mobile (distant
ones stop being posed instead); the camera-mode controls hide behind one corner button,
not a timer; the staff entrance at the gate is only shown for `?staff`; the basement
ceiling stays bare, lit by invisible beat spotlights, with wall fittings on the sides
and the bar wall only; the statue faces west with the horse in profile and GANGAN's
shoulders turned out towards arrivals; the gate folds all eleven appearance controls
behind one line while the character panel keeps them open; the temple deity has no
halo.

One more thing about how they read a fix. **They check the live site, and they are
right to.** Several of these sessions ended with a confident report built on a
measurement of a stopped world. If you cannot show the thing working — a number
from a fixture that actually advanced time, a named mesh, a before-and-after —
say so plainly instead. They take that better than a claim that turns out to be
worth nothing, and the fastest way to lose their patience is to report the same
bug fixed three times.

---

## 7. Recent work (this session)

### 2026-08-21 · Guided objectives and local fireworks (implemented, not published)

- Added 25 bilingual visit-only objectives in `src/data/quests.ts`, grouped into
  basic navigation, world exploration and festival activities. Completion is wired
  to actual world/UI events rather than clicks on the checklist itself.
- Progress exists only in the running `App` and is cleared on `pagehide`, including a
  back/forward-cache departure. No quest key is written to local or session storage.
- Finishing all objectives starts a 125-second personal fireworks show over the sea.
  It never enters multiplayer state. Normal/Lite graphics cap active rockets, bursts
  and particles separately.
- Bursts use colored non-shadow-casting point lights so standard world materials
  react, plus matching additive planes just above the sea for water reflections.
- `REPLAY FIREWORKS` / `重播煙火` is hidden before completion and appears only in the
  festival-pass menu afterwards; it adds nothing to the camera view.
- Review fixtures: `?review=quests` (0/25), `?review=quests-complete` (25/25 + replay),
  and `?review=fireworks` (Shore horizon + live rocket/burst/light/reflection counts).
- Browser verified: real keyboard actions moved the pass counter to 3/25; leaving and
  re-entering restored 0/25; replay was absent at 0/25 and visible inside the pass at
  25/25; fireworks rendered over the sea with colored water response and no console
  errors. `npm run build` passed and all **41/41** server tests passed.

This work is intentionally still uncommitted/unpublished with the MENTOR feed-loyalty
work below. Preserve the unrelated `M prepros.config` change.

### 2026-08-21 · MENTOR feed loyalty (implemented, not published)

- Feeding MENTOR now records one server-authoritative count for the visible actor:
  ordinary attendees keep their own count; STAFF feeding while controlling an NPC
  credits that NPC; MENTOR cannot credit himself.
- The current positive leader stays leader on a tie. If that attendee leaves, the
  next highest active attendee takes over. With no positive score MENTOR resumes his
  free route.
- While STAFF controls MENTOR, the service publishes no follower and autonomous
  following stops. Releasing MENTOR restores the preserved highest-ranked target.
- The attendee panel shows `FEED ×N` / `餵食 ×N` for attendees and every NPC except
  MENTOR. Browser check: 13 rendered rows, no horizontal overflow, MENTOR row has no
  feed badge.
- MENTOR walks toward the shared leader, keeps a natural stopping distance, and uses
  a catch-up placement only when stacked floors or a long separation make an ordinary
  NPC route impossible.
- Verification: `npm run build` passed; **41/41** server tests passed, including ties,
  leader departure, zero-score freedom, NPC credit, MENTOR self-feed rejection, and
  STAFF control suspension/resumption.

The source changes are intentionally still uncommitted/unpublished. The owner has not
yet asked to publish this feature. Preserve the unrelated `M prepros.config` change.

### 2026-08-20

Prompts on phones were the theme. A prompt is the *only* way to reach an action on
touch, so anything that hid one removed the action entirely — while desktop kept
working, which is why several of these lived a long time.

- Seated prompts were removed outright while the seat panel was open, so ordering and
  drinking at the basement bar could not be done at all on a phone.
- Eating carried food had no prompt anywhere; plain `E` had always done it.
- The worship prompt's button was `disabled` by the drifted `canInteract()` duplicate.
- MENTOR pick-up moved to hold-on-prompt, since a phone has no shift key.
- Seated avatars never received their gesture, so drinking on a stool was never seen.
- Landscape: chat feed 99px → 212px, panels scroll, screening panel laid out side by
  side so the video keeps 16:9, pass and status aligned.
- Basement lighting: ceiling rig removed entirely at the owner's request (a light well
  is cut through that ceiling; anything over it hangs from nothing), wall fittings on
  both sides plus a centred run of five on the bar wall, none beside the screen.
