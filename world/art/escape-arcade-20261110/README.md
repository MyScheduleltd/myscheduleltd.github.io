# 逃脫我的美麗 · ESCAPE MY BEAUTY cabinet (2026-11-10)

The owner asked for a third machine beside M.O.T.H and the jukebox at 你媽俱樂部, playing https://myscheduleltd.com/lol/.

Their answers:
- Order, left to right from the road: M.O.T.H, 逃脫我的美麗, jukebox.
- The cabinet is themed on the game.
- It is playable straight away.
- It opens like M.O.T.H: on the cabinet's screen on computers, in a new tab on phones.
- Later: the machines stand 0.6 apart, and only this cabinet is smoothed.

- **Artwork:** Higgsfield GPT Image 2 (`artwork-prompts.txt`).
  - `marquee-raw.png` and `side-raw.png` are the originals.
  - The cabinet uses 96-colour palette PNGs: `escape-marquee.png` and `escape-side.png`.
  - `escape-attract.png` is the game's own title screen (`game-title-reference.png`) with its loading bar painted out.
- **Model:** `build-cabinet.py`, run through Blender MCP (Blender 5.2), with `escape-cabinet.blend` saved beside it.
  - The footprint is M.O.T.H's: 1.81 wide, 2.12 deep, 3.8 tall.
  - Edges are rounded by bevels with hardened normals, and the controls have 28 sides.
  - The screen is one flat quad carrying the `arcadeScreen` extra.
  - The export is `src/assets/venue-scenery/escape-arcade.glb`: about 0.86 MB, 7,558 triangles, nearest-filtered textures.
- **Play view (second and third rounds):** Exit and Fullscreen sit centred on the green control deck's visible strip below this cabinet's screen (`belowArcadeScreen` and `ESCAPE_DECK_BELOW_SCREEN` in FestivalWorld). The deck climbs to `DECK_BACK`, just under the cream bar, so that strip is 42–74 px tall at the sizes tried and holds the 36 px buttons; M.O.T.H keeps its Exit inside its screen (owner's choice). The joystick and buttons are where the owner placed and sized them in Blender (`CONTROLS_Y` -.8125, about 60% up the deck; shaft 0.101 long, ball 0.096 across; their edit is kept as `escape-cabinet-owner-edit-20261110.blend`). There they would show cut off at the play view's lower edge, so they hide only while this game is played (`MothArcadeCabinet.setControlsHidden`, owner's choice). `play-measure.mjs` measured four window sizes: Exit and Fullscreen always sit on the green strip inside the window.
- **Checks:**
  - The tests: moth-arcade, moth-arcade-placement, release-lock, locked-view and mobile-asset-budget.
  - `play-check.mjs`: E at the cabinet mounts the live /lol/ game on its screen, nothing closes it, and Exit returns to the world.
  - Captures are in `captures/`.
- **Release:** the new GLB is not on jsDelivr until main has it, so purge it after a release (Pages serves it meanwhile).
