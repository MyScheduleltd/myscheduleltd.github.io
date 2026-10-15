# Arcade camera and fullscreen release — 2026-10-15

Owner requested publication after native local review. Prepared BETA and PS2 from the verified production build on current main `db8b2c093c9f6f0bbdf3b09e74881f5d2a8b9e5c`. Follow protected-main latest-push review and normal merge; this receipt does not mean the release is live.

The cabinet play camera stays level so the neighbouring jukebox remains upright. A single projective transform fits the live game onto the physical monitor and anchors the controls in its lower orange band. Matching Fullscreen and Exit buttons form one centered row. Fullscreen retains the existing iframe/session; Esc returns to the cabinet and Exit Game closes both fullscreen and the game. Gameplay focus recovers on transitions without disrupting later button navigation. Mobile/immersive launch remains external.

472/472 tests, strict TypeScript/Vite build and diff check pass after integrating current main. Both packages match all 54 build files exactly (108 comparisons), with 40 model/image integrity hashes. Entry `main-uUXgEu9A.js`. Native Chrome verified fullscreen at2880x1800, immediate keyboard stage navigation, Esc return with retained state/launch URL, and Exit Game while fullscreen. Normal1280x720/wide views were checked. Direct Exit Fullscreen click had a native tool-context ambiguity; its lifecycle is covered by App tests. No native console or physical phone/headset pass is claimed.

No models, materials, textures, backend, dependency/config or M.O.T.H game files change. Current main includes the newer M.O.T.H cleanup release and remains unchanged in this PR. Cached hashed assets remain for older entry pages.

Evidence: `package-verification.json`, `../arcade-camera-20261015/` and `../arcade-fullscreen-20261015/`; full logs `.artifacts/arcade-release-20261015/`. Live URL/file and Pages verification must follow merge.
