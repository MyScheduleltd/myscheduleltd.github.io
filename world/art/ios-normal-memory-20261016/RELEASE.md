# Mobile texture memory release — 2026-10-16

Prepared at the owner's explicit publication request. Safari on iPhone16 Pro/current iOS still crashes during normal-quality active play after PR39. The new repair bounds mobile model and avatar finishing textures to1024px before caching/upload, and serializes model/image preparation to reduce allocation spikes. Normal graphics/shadows remain available; desktop paths and all source assets remain intact.

The observed local session estimates decoded RGBA source allocation falling from475MiB to134MiB (about72%); this is not total process/GPU memory or proof of an OS memory kill. Actual normal entry, avatar/clothing appearance and active walking passed local browser inspection. Physical iPhone stability remains for owner acceptance. Native Safari and final browser capture were unavailable; see REVIEW.md.

554/554 tests and strict TypeScript/Vite build pass. Both BETA/PS2 packages match dist byte for byte and pass20 asset integrity hashes each. Cached hashed assets and standalone M.O.T.H remain preserved. No backend changes required. Package hash receipt: package-verification.json. Publication awaits the normal protected-main approving review/merge; no protection bypass.
