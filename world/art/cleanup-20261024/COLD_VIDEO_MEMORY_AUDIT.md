# Cold video and lifecycle audit — 24 October 2026

Implementation tree: `festival-cleanup-20261024/world`. Local WebKit iPhone browser profile, not physical iPhone hardware. The probe used the disposable loopback API on port 8794 and blocked the production API. No production records were modified.

## Confirmed retained-world defect

`ImportedAvatar.importedAvatarRoots` is a module-wide strong `Set`; every imported body also installs an arrival listener. Before this fix `FestivalWorld.stop()` did not dispose the player, resident or remaining remote imported-avatar instances. Their parent links retained the entire old scene even after the App dropped its world reference.

Before: a local Lite scene had 15 avatar bindings; after `world.stop()` there were **13**, all belonging to the stopped scene. After adding `disposeImportedAvatars(this.scene)` to the permanent stop path, the same probe ended at **0 bindings / 0 roots in the stopped scene**. The existing preview-specific disposer handles the separately parented gate avatar. Per-instance materials and skeletons are released; shared template geometry and maps remain valid for another live world/preview.

The actual `FestivalWorld.stop()` regression executes three recreate/stop cycles with real imported male/female/hidden avatar instances, checks one-time material disposal, and preserves an unrelated live scene and its shared art. See `scripts/coastal-pose.test.mjs`.

This defect increases pressure after retries/re-entry; it does not establish the cause of an otherwise fresh first visit.

## Public first playback and fixed resources

The local probe already includes the separate 800×450 mobile projector fix. At admission the shared YouTube player answered and its first-film warm-up reached `done` / `warmFilm: stopped`. Palace activation retained that same document. Gate preview canvas count fell from one during the handoff to zero afterward. No application page errors occurred.

Unique source-image payloads and geometry buffers were unchanged from admission through Palace activation:

- 64 ImageBitmaps: **132,516,528 bytes** estimated RGBA pixel payload.
- 51 runtime canvases: **48,660,480 bytes** estimated RGBA pixel payload.
- 920 geometry objects with **62,020,940 bytes** of unique attribute/index ArrayBuffer capacity.

These are source-object payload estimates, not Safari process memory, retained heap after garbage collection, driver allocation or the external YouTube decoder's memory. Compressed texture `image` objects are not RGBA images; their width×height values must not be interpreted as actual compressed payload. The existing `imgMb` diagnostic is cumulative decode work, not retained RAM.

Band download promises remove their resolved ArrayBuffers after parse. Gate and gameplay use the same AmbientAudio instance. Active texture ImageBitmaps must remain usable for context restoration; indiscriminately closing them after upload would break restoration.

Raw before/after reports: `cold-video-memory-audit.json`, `cold-video-memory-audit-after.json`.

## Extra private/fullscreen media document

Previously `setExternalFilmPlayback(true)` stopped the public movie but retained its complete hidden YouTube document, then App created another iframe for the personal/fullscreen player. The fix stops/blanks/removes the hidden document, clears its ready/command/listen state and retains only the lightweight CSS world panel and latest programme. Closing the external panel recreates one public document at the latest programme offset when the attendee is still within a venue. Ordinary public venue-to-venue playback continues reusing one iframe.

`scripts/projector-occlusion.test.mjs` verifies hidden admission-player release, idempotence, stale old-document replies, replacement readiness, programme changes during private playback, and correct public resume. All 33 tests pass. This eliminates an actual redundant document; synchronous removal cannot prove precisely when iOS reclaims cross-process decoder state.

Physical iPhone confirmation remains outstanding. A Safari process termination or GPU-process failure cannot be proven from the last-sample screenshot alone.
