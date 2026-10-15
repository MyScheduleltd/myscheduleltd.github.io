# Arcade fullscreen controls — 2026-10-15

Implemented and verified locally. Fullscreen sits beside Exit using the same recessed orange button style. The row is centered in the lower orange game band. Native fullscreen shows the enlarged live game with both controls centered in its orange footer.

The browser expands the existing screen wrapper. Its cross-origin live iframe stays in the same parent with the same URL and browsing context. Only the HUD moves into the fullscreen tree, then returns to the world shell on native exit and before disposal. Browser state drives labels/aria-pressed. Pending/rejected/late results do not strand controls. Game keyboard focus returns once per transition without interrupting later Tab navigation. Mobile and immersive VR retain their external-game route.

472/472 full tests and 20/20 targeted arcade tests passed. Strict TypeScript, production build and diff check passed. Actual App-method fixtures cover iframe identity, controls, native exit, pending/rejected requests, teardown races, Esc, WebKit and focus.

Native Chrome acceptance passed after Mac unlock: true fullscreen at2880x1800, both orange controls visible, Down/Down/O opened stage selection immediately. Esc returned to the physical cabinet with the same launch URL and stage-selection state; immediate Down advanced1/8 to2/8. Re-entering fullscreen retained the session. Clicking Exit Game while fullscreen closed the child/browser fullscreen and restored the world/E prompt. The Exit Fullscreen click returned to normal state, but the native tool also reported inactive context, so only the App lifecycle tests are counted as direct unambiguous button coverage. Native Esc and Exit Game paths are unambiguous browser passes. No native console capture or physical phone/headset checks.

Closed only the verified QA tab; the user's existing Epidemic Sound tab remained. An earlier interrupted Michael-profile QA tab may remain under user control and was not closed blindly. Earlier lock/interaction interruptions are superseded by the successful acceptance run.

No BETA build, stage, commit, push or publication performed. Previous live release remains PR35/fc60637. Earlier local level-camera correction remains included. No model, material, texture or gameplay code changed for fullscreen.

Evidence: `cabinet-controls.png`, `chrome-fullscreen.png`, `chrome-return.png`, `verification.json`; logs `.artifacts/arcade-fullscreen-20261015/{tests.log,build.log}`.
