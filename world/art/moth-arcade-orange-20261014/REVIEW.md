# Orange M.O.T.H cabinet and ground contact

The original generated shell had smeared artwork, jagged panel detail and a green finish. The current cabinet uses clean closed panels fitted to that silhouette, a smooth ivory screen surround, orange enamel matching the game (#ff5c21), a charcoal lower front/rear, rebuilt joystick/buttons and crisp M.O.T.H lettering. Redrawn ivory/burgundy moth and guitarist artwork covers both sides, with moths on the marquee. The exact independent live-screen transform and vertex positions are preserved.

The previous arcade placement borrowed the jukebox's upward offset. It now seats on the actual rendered paving and terrain. A 5x5 footprint scan fits a shallow level rubber plinth into the lowest surface, with an overlapping body edge. First-person browser review shows the base touching the paving without an air gap.

The cabinet and jukebox retain their centered combined footprint beneath the sign. The Exit prompt remains centered at the bottom, clear of the game, including short and narrow desktop windows. Camera lock, native keyboard menu controls, Exit button, Esc and nearby E re-entry were checked in the local built site.

The GLB is 1,696,612 bytes, 23 meshes, 11,769 triangles and one shared 1024x1536 PNG. The screen is byte-equivalent to the previous screen. All 28 relevant tests passed, as did TypeScript/Vite and git diff --check. Tests cover the real sloped footprint and a narrow paving seam, normals/winding, material roles, asset budget, screen contract, controls and prompt layout. These desktop checks do not establish physical phone/headset behavior.

Browser evidence: local-whole-cabinet.png (final asset and ground), local-ground-contact.png (base close-up), local-game-close-up.png, local-short-desktop.png, local-narrow-short-desktop.png. Blender detail views: polished-front.png, polished-side.png, polished-back.png. The source Blend, recipe, artwork prompts, hashes and validation are recorded in provenance.json and validation.json. Previous scenes and GLBs are retained; avatar hashes are unchanged for this refinement.

Local review: http://127.0.0.1:4173/?era=ps2&island&review=arcade&cycleMinute=15

Publication: local only. No BETA build, Git staging/commit/push or deployment was performed for this refinement.
