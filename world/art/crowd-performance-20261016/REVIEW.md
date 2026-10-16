# Twenty-visitor performance repair — LOCAL ONLY

Owner reports combined camera stutter, remote jumps and delayed interactions beginning immediately on joins, sometimes a complete entrance freeze. The physical iPhone16Pro Safari crash appears resolved by PR40; retain its mobile image budget.

## Concrete findings and changes

- The old full-room avatar preparation took about4.13s in a real-rig Node CPU probe. Repeated per-vertex world-matrix walks and identical skin/floor calibration caused long synchronous work. Cache bind-space transforms, reusable vertex measurements and independent barefoot/sole calibration data. No instance bones, uniforms or materials are shared. Twenty preparations now total0.61s (about85% less), and network callbacks queue new bodies for one admission per render frame. The first body still has a calibration cost; this does not promise no join-time frame drop on every device.
- Every movement broadcast resent biographies, playlists and all visitors. A negotiated per-connection delta stream reduces local20-connection aggregate SSE traffic6.90→1.26MB/s (about82% less). Each stream starts with complete state; additions/removals, palettes, seats, schedules and viewer-filtered messages remain authoritative. Legacy clients get full snapshots and new clients tolerate old servers. At1400posts/10s, local request latency p95 fell6.28→1.52ms; these are loopback measurements, not phone/internet latency.
- Bound slow-stream buffering; serialize outgoing presence requests rather than queuing stale overlapping movement posts.
- Identical visitor readings no longer restart interpolation or refresh clothing every time somebody else moves. Shared UI/roster work is skipped for pure movement snapshots; personal hits/deaths and attendance still update. Culled/throttled remote bodies skip full pose/foot work while their world transform continues moving. Lite retains all20 attendees rather than dropping peers after12.
- Departing imported bodies unregister listeners/roots and release instance materials/skeletons without evicting shared model geometry/maps. Existing held-MENTOR detachment is preserved. A regression exercises20body queue/churn and unchanged appearance/pose.
- The service's old z65 clamp placed ferry arrivals at the wrong location. It now covers the actual island north limit101, with a live server test preserving z93.5.

## Validation

564/564 tests pass, including existing hand/palm/wrist, barefoot/swim, gait, rig independence, held distant pose and preview resource tests. Strict TypeScript and Vite build pass after correcting a return-type annotation; diff check passes. Logs /tmp/myschedule-crowd-{verify,build,targeted}.log.

The real local UI joined19 simulated public-API visitors (20total), exercised both graphics modes, and used the actual mobile memory path for390x700 checks. Zero captured console errors. Each saved steady-state window contains240frames,19remotes and0pending bodies:

| Case | FPS | Frame-gap p95 | Largest gap |
| --- | ---: | ---: | ---: |
| Desktop normal | 34.6 | 31.6ms | 32.7ms |
| Desktop Lite | 60 | 18.8ms | 19.5ms |
| Phone-sized normal, mobile budget | 50 | 24.2ms | 30.4ms |
| Phone-sized Lite, mobile budget | 60 | 18.8ms | 20.7ms |

Normal performance varied with lighting/warm-up (another full-room normal sample was46.5FPS). These are host desktop GPU measurements, not iPhone hardware or Safari validation, and not a zero-lag guarantee. One-time shader recompilation when switching quality produced a temporary UI action timeout; steady windows exclude startup/mode-switch warm-up. No sustained entrance freeze was observed after settling. Do not claim all possible stalls eliminated. Phone normal retained59budgeted images/max1024/134MiB decoded RGBA estimate; assets remain shared across the crowd.

Evidence: verification.json, browser-verification.json, cpu-before/after.json, network-before/after.json and four screenshots. Repeatable probes live in tools/crowd-{cpu,network}-probe.mjs and crowd-presence-bots.mjs; bots strictly reject non-loopback destinations. The optional extra server RSS measurement was initially blocked by automatic approval-review usage limit; it was retried after the stated reset. After the review reset, the same20-connection check completed: end-of-run Node RSS100.34MiB (not a peak or production-host measurement); network-final.json.

## Release and cleanup

No BETA build, staging, commit, push or publication. docs/ and src/assets unchanged; PR40 remains the public release. The eventual release needs both website and multiplayer service deployment, with live service build/health and negotiated delta checks. Merely copying the client into Pages would leave bandwidth savings and ferry coordinate repair inactive on an old service. Physical iPhone16Pro Safari normal/Lite full-room acceptance remains for owner after approved release.

Closed only new QA tab23 and reset viewport; stopped only new QA bots/service8789/dev4181. Original4173/4180/8788 services and prior review tabs retained. Prior unrelated dirty receipts/art remain untouched.

## Final refinement audit

Additional fixed-lighting GPU-only fixtures tested shadow-count/cadence and avatar-lighting changes. They did not show a consistent frame-rate benefit on this host, so all those runtime experiments and their fixture route were removed. Final code retains original shadows, lighting, meshes and palette appearance. The4saved real-network browser cases above describe the retained implementation; no fake rendering fixture is claimed as a20-connection server test.

Final full suite564/564 and strictTS/Vite build pass (log /tmp/myschedule-crowd-final-verify.log), including the final invisible-peer floor-query assertion. The focused pose run also passes99/99 (/tmp/myschedule-crowd-final-poses.log). Its first attempt exposed a test-helper mistake: shared geometry must be captured before hiding the mesh, because the helper deliberately selects visible parts. Corrected the fixture without weakening the culling or disposal assertions. A sandbox-only listenEPERM was resolved by running the full suite with approved loopback access. A transient browser approval-review timeout succeeded on the one permitted retry. The temporary network QA tab and both GPU comparison tabs were closed; browser viewport reset. No unresolved review block remains.

For repeatable20-person QA, use a disposable local service (FESTIVAL_PORT=8789,FESTIVAL_STATE_FILE=off,FESTIVAL_SEED_FILE=off), a dev client explicitly pointed to it (VITE_FESTIVAL_SERVER_URL=http://127.0.0.1:8789), and tools/crowd-presence-bots.mjs with19clients. Use review=crowd-performance for desktop, review=mobile-memory for the mobile budget path. Standard production builds read the Render URL from .env.production; do not use that build for a simulated live-service load test.
