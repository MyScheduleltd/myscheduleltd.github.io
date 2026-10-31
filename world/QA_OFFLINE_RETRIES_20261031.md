# Offline notices and bounded reconnection — 2026-10-31

The owner requested one initial offline notice, a bounded number of automatic reconnection attempts, and one final message asking the visitor to refresh manually. Publication was approved on 2026-10-31.

The browser client now makes up to five automatic retries after the initial connection fails. Initial joins, event-stream reconnection, expired-session recovery, the heartbeat watchdog, and tab/phone wake-up share the same retry budget. Only received stream activity renews that budget; successful HTTP headers or session-recovery responses alone do not. Exhaustion stops automatic reconnect and presence requests for this page. Refresh creates a new client and recovers the stored visitor session through the existing admission path.

Both the initial offline alert and the final refresh alert appear once per visit and use the existing 2.2-second dismissal. English and Traditional Chinese are covered. A status emitted while the gate has no alert element does not consume the notice. The attendee panel stops claiming that reconnection is in progress after retries are exhausted. Other gameplay alerts and staff-ended-session handling remain available.

Validation on branch `codex/offline-retries-20261031`, based on main `a19c535f70fd91fe2e71a34477b257b6da4d681b`:

- Full Node suite: **1,096/1,096 passed**; TypeScript, production build and authored diff checks passed.
- Real Chromium desktop and phone-profile WebKit: both languages passed the initial alert, five retries, one final refresh alert, viewport bounds, ten simulated minutes without further retries, wake/resume events, and a manual refresh. This browser fixture bundles the production FestivalClient and extracted App alert methods with the shipped CSS; it does not certify a full-world playthrough or a physical phone.
- Production package: `main-C-lm10Qq.js`, `App-tPxLRq9j.js`, real Render endpoint, **111 exact build/package copies**, **89 verified fixed-asset hashes**, **103 reachable assets**, zero missing assets or loopback API markers. Fixed art/audio/decoder hashes are unchanged. All 229 cached package assets are retained; no pruning.
- No backend source, production data, payment, deployment-setting or unrelated website route changes. No Render redeploy is required for this browser-only release.

Evidence is local under `.qa/offline-retry-release-20261031/` (browser report, four captures, package manifest and report-only asset-retention audit). Test/build logs are in `/private/tmp/festival-offline-release-{tests,build}-20261031.log`. These intermediate files are excluded from the release commit.

Publication must use the protected PR flow. Current main protection requires one independent approval of the latest push, dismisses stale reviews and enforces these rules for administrators. No self-approval or protection bypass is authorized. A prepared package or open PR is not live; merge, successful Pages deployment and public entry/asset verification remain required.
