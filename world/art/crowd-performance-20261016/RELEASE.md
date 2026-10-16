# Twenty-visitor performance release — prepared for review

Owner approved publication on 2026-10-16 to test from iPhone away from the Mac. This release updates both BETA/PS2 packages and the multiplayer service; physical iPhone validation remains pending.

Avoid synchronous full-room avatar preparation, repeated appearance work, interpolation resets caused by unrelated visitors, and retained departing-avatar resources. Queue one new body per frame, share only immutable bind measurements, preserve all attendees in Lite, and skip unseen pose/foot calculations. Negotiate per-connection state patches, retain full-state fallback/reconnect/privacy, serialize presence posts, and bound slow-stream buffers. Correct the service's ferry-arrival coordinate limit.

Validation: 564/564 tests, strict TypeScript, Vite build, and diff checks passed. Each channel matches all 55 current dist files; model/image integrity hashes pass. Standalone M.O.T.H entry files are unchanged, old cached hashed assets retained, and no public files outside BETA changed. See package-verification.json for exact hashes.

Measured local 20-visitor avatar preparation: 4.13s to 0.61s total (85% less CPU preparation, excluding GPU). Aggregate SSE traffic: 6.90 to 1.26MB/s (82% less); final loopback request p95 1.89ms. Browser checks used 19 public-API bots plus one real UI client, desktop and phone-size/mobile-budget Normal/Lite. Normal FPS varied; do not promise zero lag or claim physical iPhone testing.

Main requires one approving review of the latest push. After merge, verify Pages files against this receipt and Render /api/config build against the merge. Both deployments are required for the complete optimization. Do not run simulated load against the public service; physical phone acceptance is the owner's next step.
