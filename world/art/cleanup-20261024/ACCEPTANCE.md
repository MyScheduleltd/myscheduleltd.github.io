# First-video memory and active-site cleanup — 2026-10-24

Candidate entry: `main-CtjenACD.js`. Final independent review also added guarded tab-profile reads so blocked storage or malformed tab data cannot prevent the sign-in screen.

Base: merged PR #59, main45e5828, live entry main-BBsMXUP8.js. Pages39994226203 succeeded at2026-10-24 01:21:28 Taipei;39 live files match its package, including all18KTX tiles/3decoder files and retained previous entry. All18new data URLs were warmed on jsDelivr; one initial403 was purged and verified against origin. No production records were created or deleted.

## Repairs

- The phone's public-player layout is800×450 instead of1600×900, with reciprocal world scaling and proportional frame/shadow. Its content surface isonequarter the original area; this does not claim control over YouTube's selected encoded resolution. Allfive world screen footprints remain exact. One public iframe is reused across venues.
- The startup Basis worker retires after all fixed tile maps settle, before GPU warmup/first-video preparation. Mip arrays remain attached for context restoration.
- Permanent world.stop() unregisters imported avatars. The actual WebKit probe found13stopped-scene roots retained before, zero afterward. Shared source geometry/maps and another live scene stay valid.
- Personal/fullscreen playback removes the hidden public media document on phones, rather than retaining two YouTube pages. Public return mounts the current shared programme/offset.
- Normal-mode phones now also perform bounded muted first-video preparation under the entry animation. Diagnostics record actual playback/stop/timeouts and player viewport; a synchronous pre-decoder checkpoint prevents stale one-second samples from hiding a failed transition.
- Fixed audio batches wait for all requested loads to settle, including optional failures; accurate readiness includes all13sounds. Entry no longer leaves ongoing fixed-sound jobs behind after an8second race. Audio decoding has a30second deadline; native decoding itself cannot be cancelled, but late results are not retained.
- Declining Remember Me keeps a recovery profile only in this tab. Automatic reload recovery retains the visitor/session/outfit/mode without enabling device remembering. The two-attempt crash-loop guard remains.

## Cleanup

Twelve long-disabled team photographs were SHAverified and archived locally before removal from published docs:118,391,458B(112.91MiB). Only dead member metadata/rendering code was removed; all other site data and ABOUT/CONTACT behavior are tested unchanged. These images already made zero runtime requests, so this is published-storage savings, not an equivalent per-visit speed improvement. Archives and historical references remain in canonical art/retired-public-assets-20261024; do not stage those large copies.

The old prune tool would delete activeKTX/Basis resources. Its replacement is report-only bydefault, recursively checks exact references/integrity/runtime roots, requires successful deployment timestamps and full24h after supersession, and verifies hashes before any apply. Zero BETA assets are eligible now; all58older assets are retained. Verified deployment records and portrait archive manifests are beside this report.

Public data audit:1wish,10jukebox songs,12NPC profiles, no duplicate IDs or orphan video metadata. No confirmed test/orphan records were identified. Private Redis keyspace/payment records were not inspected; no DB deletions were justified. Persistent-state/server-restart risk is documented separately in DATABASE_AUDIT.md.

## Validation and limits

-889/889 complete tests pass; TypeScript/production build passes. All82media/integrity entries remain unchanged and verified. All104dist files byte-match docs/beta, with all162previous published files retained. Package hashes:package-check.json.
- ChromeMetal and WebKit phone profiles: fivepublicvenues in bothgraphicsmodes, private/public handoff onphone, fourcontextrestores withworkerdisposed and18ASTCmaps intact. No fixed-asset downloads afterentry during the measured routes. Real phone hardware is not represented by these profiles.
- Two additional fresh WebKit runs held shadercount82→82 acrossallfivevenues. One earlier73→74rooftop increase did not reproduce and has no captured key; do not claim all possible dynamic visitor/material shaders can be compiled before unknown visitors arrive.
- The latest phone-only rerun verifies first-play diagnostics, 13 ready audio buffers, zero late fixed-asset requests, private playback with one iframe, public return, and recovery without device Remember Me. One original unhandled `TypeError: Load failed` after intentional reload had no frame/stack and remains individually unclassified. Two complete instrumented repeats passed with zero page errors/unhandled rejections; a third stopped on proven YouTube advertising CORS errors. Fetch tracing reproduced matching errors only in canceled outgoing YouTube icon/tracking requests, with provider call stacks. This is consistent with provider teardown but does not establish the original event's exact origin. See ERROR_CLASSIFICATION.md; raw reports with disposable session credentials remain local.
- The final exact-build WebKit Lite run also passes all five venues, private/public handoff, graphics restoration and same-session reload recovery with Remember Me off; zero late fixed assets and zero unhandled rejections. Two warnings are traced to the external YouTube advertising iframe. Sanitized outcome: final-webkit-check.json.
- Repro and raw browser evidence remain canonical art/cleanup-20261024/. External YouTube/network access and the physical iPhone16Pro failure cannot be certified from local browser automation. The screenshot alone does not prove an OS memory termination; this patch addresses measured unnecessary memory and startup work.

## Publication

Main requires independent latest-push review. This client/asset-only change must retain `[skip render]` in the final merge commit message to avoid an unnecessary automatic API restart and its diskless-state risk. Render documents that commit skip phrase at https://render.com/docs/deploys#skipping-an-auto-deploy . Server behavior/catalogue data is unchanged (retired member data is not consumed by the server); no Render deploy is required. The owner clarified that server redeploys are performed manually and must remain with them. No dashboard, Blueprint, build-filter, server deployment or production-data setting was changed. The source Blueprint alone does not establish the live dashboard auto-deploy setting; `[skip render]` is a defensive commit marker for this client-only PR.

After review/merge verify Pages and live source/static hashes; verify the Render API stayed on its existing deployment and real records were preserved. Keep old BETA generations for their complete retention intervals after the new Pages deployment. Physical iPhone follow-up should repeat firstpublicautoplay inallvenues and private/public switches in bothmodes, capturing the new last-session checkpoint if it restarts.
