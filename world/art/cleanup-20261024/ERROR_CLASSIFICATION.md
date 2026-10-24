# Reload warning audit — 24 October 2026

Local production preview `http://127.0.0.1:4206`, WebKit iPhone profile, Lite. Production API calls redirected to the disposable loopback API by the test fixture. This is browser-profile evidence, not physical-iPhone testing. No source changes were made for this error audit.

The original final verifier recorded one `Unhandled Promise Rejection: TypeError: Load failed` after its intentional page reload. It had no frame URL or stack; that individual event's origin cannot be established conclusively after the fact.

Three instrumented repetitions:

1. `viewport-report.json`: five public venues, private playback, public return and forced graphics restoration completed. Two page errors explicitly named Google DoubleClick tracking redirects blocked by CORS **inside YouTube's iframe**. The strict pre-reload assertion stopped on these provider errors. No own-site requests failed. These errors are classified as provider advertising requests, not application code.
2. `reload-probe/viewport-report.json`: the complete sequence and intentional reload/session recovery passed with **zero page errors or unhandled rejections**. The old event stream was canceled by deliberate navigation, then the session recovered with the same credentials. No late fixed assets loaded.
3. `fetch-trace/viewport-report.json`: the complete sequence and recovery again passed with **zero page errors or unhandled rejections**. Fetch instrumentation captured four rejected requests with the identical reason `TypeError: Load failed` at intentional reload. All four belonged to the outgoing **YouTube iframe**, with caller stacks in YouTube's `ytembeds` / `player_embed_es6` code. Requests were the provider's fullscreen icon, logo, `ptracking` and playback telemetry; all were reported as canceled. The main document's only failed request was its old event stream canceled by navigation. No late fixed assets loaded.

The captured matching failures demonstrate that provider document teardown can produce this exact error text. They are consistent with the original warning, but do not prove the original event came from the same source because its unhandled event did not reproduce. Preserve that distinction: do not claim the original report contained no errors, and do not label its single warning definitively without its missing origin/stack.

No application change is justified by this trace. The functional mobile/private/reload/restoration checks passed, and all observed traceable failures were provider CORS or intentional navigation cancellations.

Raw reports contain disposable session credentials and provider request metadata; keep them local as QA evidence rather than including them in the public package.
