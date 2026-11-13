# PS1 restyle and visit counters — local work, 2026-11-09

Branch `claude/ps1-restyle-20261109`, worktree `ps1-restyle-20261109/` from
origin/main `e2a4d3b` (world/ identical to the live PR #84 release
`5f91a27`). **Nothing committed, pushed or published.** The owner approves
every publish. `node_modules` is a symlink to the
festival-offline-retries checkout; remove it before committing.

## Review stack (launch configs in `myschedule-pivot/.claude/launch.json`)

- `ps1-api` → http://127.0.0.1:8797: this worktree's server, state off, Redis
  vars blanked, local STAFF key in the launch config (not a real key).
- `ps1-client` → http://localhost:4201/?era=ps2&island (Vite dev).
  Add `&look=film` for the old screen treatment. The review page is at
  http://localhost:4201/art/ps1-restyle-20261109/index.html
- `ps1-preview` → http://localhost:4202 serves `dist/`, built against 8797.
  **This dist is local-only and must never be published.**

## Done

1. Anonymous visit counters
   - `server/visit-stats.mjs`: Redis HINCRBY/PFADD per Taiwan day, 120-day
     expiry, memory fallback.
   - `POST /api/visit` (no session, 204) and `GET /api/admin/visits`.
   - `src/network/VisitStats.ts`: device, in-app browser and source
     classification, random token, sendBeacon.
   - Hooks in `App.ts`: open/crash, start, entered, leave.
   - `src/ui/VisitStaff.ts`: the STAFF section 訪客統計 / VISITS.
   - Tests: `server/visit-stats.test.mjs`,
     `scripts/visit-stats-client.test.mjs`, plus one server integration test.
   - Proof: `visits/` (Threads-iPhone flow, STAFF screenshots).
   - Live needs: client publish approval **and** the owner's manual Render
     deploy.
2. Phone loading baseline (`loading/report.json`): 41 MB before inside; 32 s
   after ENTER at 10 Mbps/80 ms. GLB 26.7 MB (male body 8.3 MB, band about
   7 MB); KTX2 7.8 MB.
3. Subtle PS1 screen layer
   - `src/world/ScreenLook.ts` (`ps1PixelRatio`: about 360 px on the short
     side, whole-device-pixel blocks).
   - `WorldFilmGrain.ts` swaps the film luma bands for a 15-bit 4×4 ordered
     dither; grain drops to .04.
   - Program cache key gains `:ps1`. CSS pixelated on
     `[data-screen-look=ps1]`.
   - Tests: `scripts/screen-look.test.mjs`, plus an updated
     `world-film-grain.test.mjs`.
   - Captures: `looks/`, `looks-evening/` (`capture-looks.mjs`).
4. Calligraphy sign samples (GPT Image 2, each character checked):
   皇宮戲院, 美麗本人, 我的廣場, 八八汽車戲院. Sources are in
   `ps1-restyle-concepts-20261109/signs/`; there are 128 px texture versions
   too.

5. Server waking on the loading page (owner, 2026-11-09: everything still
   loads there; explain Render's sleep and include it in the bar).
   - `src/network/ServiceWake.ts`: the waking clock (2.5 s silence = waking,
     30% of the bar, gives up holding after 120 s), plus `serviceCanSleep`
     (hosted servers only; loopback opts in with `?wake=1`).
   - `App.ts`: `wakeFestivalService` keeps asking `/api/config` (25 s per
     try, 5 min in all), the bar mixes the server in only once it is seen
     waking, the entrance flight follows the world's own progress only, a
     sleeping server is not asked for a place, and `connect` waits for it.
   - Tests: `scripts/service-wake.test.mjs`, three new gate tests.
   - Review: `sleepy-proxy.mjs` (a Render-like stand-in on 8798) and
     `wake-loading.mjs`; launch configs `ps1-sleepy`, `ps1-client-sleepy`
     (4203). Results in `wake/`.
6. Art pilot, first pass (PS1 look only; `?look=film` is unchanged)
   - Sky: **kept as it was** (the owner preferred the original palette).
   - `src/world/Ps1Surfaces.ts`: drawn 64 px tiles for the six surface
     families (no download; EnvironmentMaterials `drawnTile`, and
     `pixelSurface` at the older canvas brightness).
   - `EnvironmentArt.ts`: an aged `PS1_ISLAND_PALETTE`; `CoastalTerrain.ts`:
     dusty olive ground.
   - `src/world/Ps1Signs.ts` + `src/assets/ps1/signs/*.png`: brush boards for
     every venue (owner's names), sized to the art; STAFF renames still
     letter. Rooftop board is 2.8 tall so it reads at 360 lines.
   - `src/world/Ps1StreetProps.ts` + `src/assets/ps1/lightboxes/*.png`: AC
     units, windows, shutters, poles and wires, scooters, light-boxes on the
     rooftop building's east and south faces.
   - Captures: `pilot/`, `pilot-night/`, `pilot-phone/` (`capture-looks.mjs`
     views `south-face`, `east-street`, `plan`, `temple`, and night variants).

7. Second pass (owner's answers, 2026-11-09): waking text is just
   「伺服器準備中...」; PS1 temple is vermilion render with gold bands and a
   low emissive (`keepTint` on EnvironmentSurface keeps a chosen colour
   through the palette pass); 我的廣場 street arch over the arrival street at
   z 11.5 (`Ps1StreetProps.arch`). Captures in `pilot-2/`.

8. Third pass (owner, 2026-11-09): 一家之主 board dropped; MY SQUARE stays
   open; the dock dormitories (INLAND_HOUSES) dressed by
   `Ps1StreetProps` `dressDock`: windows and units on the street walls, a
   shop, light-boxes (旅社, 小吃, 照相館, 書報) and scooters on the two
   nearest, a west pole line, drops from the east `TOWN_POLES`. The
   dormitory sign drops its English line in the PS1 look. Captures in
   `dock/`, `dock-night/`.

9. Fourth pass (owner: "continue the art"): the 我的廣場 arch and its board
   were removed at the owner's request. `dressWestSide`: units and shutters
   on the club's square wall, the west pole line carried over the warehouse
   street, Palace marquee bulbs. Popcorn, pamphlet and wish-wall signs are
   Chinese only in the PS1 look. Captures in `west/`, `west-night/`.

10. Building the district concept, pass 1 (owner, 2026-11-09): grass back
    to its original green; Palace upper storeys, bulb front, giant poster,
    vertical sign, side billboard, roof clutter (`dressPalace`); temple red
    brick and lanterns. Posters are YouTube thumbnails of the owner's works
    (approved), sources in `ps1-restyle-concepts-20261109/posters/`.
    Captures in `concept/`.

11. Concept pass 2, temple roof: `src/world/Ps1TempleRoof.ts` makes the two
    pinned tiers a Taiwanese double-eave roof in the PS1 look (hip upper tier,
    ridge along Z, kicked corners; skirt lower tier rising 3.1 to the
    connector), drawn 筒瓦 tile texture, dark ridge cap with swallowtails, hip
    and skirt ridges, finial moved onto the ridge. Same snow sources and
    colliders. Captures in `concept/temple-*`.

12. Concept pass 3, club and shophouse: `dressClubFront` (tiled skin,
    windows, end returns, parapet, 地下室 and 舞廳 light-boxes) and
    `dressShophouse` (striped awnings, 你媽俱樂部 roof board). No arcade: the
    storey is 7 units and its face is full. Captures in `concept/`.

13. Concept pass 4, the beach: `ps1ScreenCrown` (FestivalWorld) puts each
    venue's own sign material over the drive-in and beach screens with a bulb
    row; `dressBeach` puts striped umbrellas beside every
    BEACH_RELAXATION_LAYOUT spot. Captures in `beach/`.

14. Clipping, ocean, loading (owner, 2026-11-09; ocean and loading later reverted, see 16): `clip-check.mjs` tests
    every recorded prop part (Ps1StreetProps `parts`), sign and PS1 mesh
    against every static mesh (run with `&nobatch`) and the town's pre-merge
    bounds; fixes listed on the review page. Ocean: `createPs1SeaPixels`
    (LiteSea, 128-texel mosaic) and `PS1_SEA` in StylizedWater. The loading
    flight (preview world) now includes the PS1 dressing.
    `loading-flight.mjs` captures it.

15. Loading flight route (owner: "new route"; reverted in 16): `routeGateEntryCamera` and
    `PS1_GATE_ROUTE` in GatePreviewLayout (Palace .34, temple .6, temple
    street .76, over the pier .9), used by FestivalWorld's preview in the PS1
    look; the planet centre follows the camera's target. Test:
    `scripts/gate-route.test.mjs`. Frames in `loading-route/`
    (`FRAMES=… loading-flight.mjs`).

16. Owner's round (2026-11-09): pixel ocean, new loading route and screen
    crowns all **reverted** (LiteSea, StylizedWater, GatePreviewLayout back to
    base; `ps1ScreenCrown` removed). Head clearance: `PS1_OVERHEAD_CLEARANCE`
    (4.4 above `surfaceAt`, the walked surface) for every overhanging piece,
    with overhead colliders; `overhead-check.mjs` measures them (lowest 4.35).

17. Subtle sea (owner: "try a subtle restyle"): same cells; PS1 day/night
    tints in FestivalWorld `updateStylizedWater`, `PS1_DITHER` in
    StylizedWater, PS1_LIGHT/PS1_DARK for the baked LiteSea. Before/after in
    `sea-before/`, `sea-after/`.

18. New sea (owner: "the ocean pattern is still the same, I want it to look
    different"): `Ps1Swell.ts` (shared swell, height .55); StylizedWater
    `PS1_SEA` displaces the sea mesh and shades facets with exaggerated
    slopes, ripple lines and crest foam; LiteSea flat-shades the same swell
    over `createWindStreakPixels`. Captures in `sea-swell/`.

19. Caustic sea (owner: "please take these ocean patterns as references";
    `sea-references/`): StylizedWater `PS1_SEA` draws two drifting nets from
    `voronoiPair` (F1 minus a smooth minimum; PS1 `uSmoothness` .38, so a
    plain border peaks at .063) as a thin core plus halo, cells darker in
    their middles, thin crest foam, `linearToOutputTexel`, and a 14-level
    dither for banding. Reference blues in `updateStylizedWater`, whose PS1
    night now starts at sunset (`sun.elevation <= 0`), not only when the moon
    is over the sea. LiteSea bakes `createCausticPixels` (seamless, k .55 so
    lines stay wider than a texel). Captures in `sea-caustic/`.
    **Owner approved it ("Yes, keep it"), as is.**

20. Night glow (owner: "glow more under the moon"): `uNetGlow` (tint
    `netGlow`, 1 at night) brightens the halos and adds a bloom round every
    line; PS1 night tint deep 0x0a1630, mid 0x1f3d66, highlight 0xbfe2ff.
    `seaIsNight()` (FestivalWorld) is shared with the phone sea, whose
    `userData.seaGlow` darkens the water between lines and adds emissive on
    them. Captures in `sea-moonglow/`.
    **Owner approved it ("Yes, keep it").**

21. Cables (owner, 2026-11-10: "the cable lines clip through objects, please
    inspect thoroughly"): `cable-check.mjs` tests all 38 wires (PS1 lines in
    'PS1 overhead wires', town and shore wires from CoastalScenery's
    `scene.userData.townWireRuns`) against every drawn triangle; 0 clashes.
    `Ps1StreetProps.pole(..., arm)` turns crossarms across the line;
    `drop()` hangs service drops from a shaft bracket; rooftop drops tie to
    the slab edge (maxX/maxZ + .63); dormitory drops moved past the
    light-boxes (dz -d/2+3.5 and +6.5).

22. 逃脫我的美麗 cabinet (owner, 2026-11-10; order M.O.T.H, new, jukebox;
    themed; playable now; opens like M.O.T.H; 0.6 apart; smoothed): see
    `../escape-arcade-20261110/` (build-cabinet.py, artwork prompts,
    play-check.mjs). `ArcadeRules` has `ArcadeGame`, `ESCAPE_GAME_URL`,
    `cabinetRowPositions`, `nearestArcade`; `MothArcadeCabinet(x, y, z,
    game)`; the world's `escapeCabinet` and `arcadeGame`; App
    `openArcadeGame(game)`. M.O.T.H's lock now closes only M.O.T.H.
    Release note: purge jsDelivr for `escape-arcade.glb`.

23. Signs as light-boxes (owner, 2026-11-10: brush boards "too ugly"; refs in
    `ps1-restyle-concepts-20261109/references/signs/`; all light-boxes,
    Chinese only, an emblem each): `../ps1-signs-20261110/` (signs.json,
    generate.py via Higgsfield GPT Image 2, reduce.py, captures).
    `Ps1LightBoxHousing.ts` (rounded housing, smooth face loader);
    `mountNeonFrame` houses PS1 board styles (`PS1_BOARD_STYLES`) and the
    Shore gets a housing group (`userData.lightBoxSign`); `Ps1StreetProps
    .lightBox` takes `aspect` (shops 1, Palace tower 9/16) and keeps the old
    reach from the wall; rooftop sign at minX-.76, club at x -18.78 y 7.98,
    Palace board at z -30.64. Old textures in `previous/`.

24. Loading bar centred under 你的角色: `.gate-scene-status` lives in
    `.gate__layout`, column 2, below `--gate-avatar-h`.

25. 精簡 sea in the PS1 look = the 一般 caustic shader (`drawsShaderSea`);
    `lite-sea-cost.mjs` measured +0.5 ms GPU per frame at 402×874. The
    sign-in globe still shows LiteSea's baked texture.

26. Signs second pass (owner: fonts ugly, reds too bright, Japanese
    aesthetic; chose quiet Showa retro, deep muted palette, entrance as a
    long light-box keeping its English): `../ps1-signs-20261110/`
    signs2.json, generate2.py (lettering-reference.png = the 樂聲牌 tower),
    reduce2.py (venues 512 wide, shops 256, tower 224×400 darkened,
    entrance 1160×200), fix-dancehall.py (舞廳 in Yuanti TC Bold over the
    generated face). First pass kept in `first-pass/`. `ps1EntranceFace`
    (Ps1Signs) for the arch; light-box faces glow at emissive 0x7a7a7a.

27. Sea randomised (owner: "too uniform"; globe and in-world): StylizedWater
    `seaNoise` value noise drives busy/calm stretches and a broad warp;
    LiteSea bakes broad (15), close (30) and faint (48) nets blended by a
    seamless busy field, plus calm patches, and its PS1 shader warps and
    calms with `SEA_NOISE_GLSL` (one texture sample still).

28. Sign-in globe (owner: pattern stretched; sun clipping the globe, chose
    "orbit just outside"): `drawsShaderSea()` is false in the preview world
    (the caustic shader smeared into streaks there); LiteSea's noise warp
    is .3 at .6 per tile. `keepClearOfGlobe` pushes the (unbent, keepSkyFlat)
    sun and moon radially out of the globe's on-screen outline, sliding round
    to open sky right of the form, eased back by the entry's worldLight.
    `gate-sky.mjs` captures seven times of day.

29. Owner's round (2026-11-10): the box office model (Meshy boxOffice)
    carried its own board: in the PS1 look its thin panel is hidden and the
    roof-mesh triangles above 4.76 at z > 1.5 (booth frame) are cut out after
    attach. Sign flicker far off: faces stand .03 proud (light-box faces,
    housings offset -.03, posters .09 vs frame front .06, roof board) with
    polygonOffset (faces -2/-4, housing +2/+4); `sign-gaps.mjs` (scratch)
    found no face closer than 2.5 cm. Globe sea: `createCausticPixels`
    redrawn from the 一般 recipe (28 and 48 cells, k .38, 一般 day colours),
    calm stretches only .25.

30. Loading flight (owner: "update the loading page as well"; picked the
    sea): renderGatePreview fades the caustic sea in over the baked one by
    `smoothstep(entry, .1, .55)`, opaque (uDeepOpacity 1) while the baked sea
    is under it, then hides the baked sea and restores .94 /
    `stylizedDeepOpacity`; uCamXZ follows the flight camera. **Approved**
    ("Yes, keep it", 2026-11-10).

31. Sunny Japanese street (owner 2026-11-11: town "too dark/dead"; picks:
    recolour + new façades, the sunny anime street leads, globe town and sea,
    camera holds distance). `EnvironmentArt.PS1_ISLAND_PALETTE` is now warm
    white / pale concrete / mint tile / blue-grey; architecture details get
    per-surface colours (`PS1_ARCHITECTURE`) instead of ink. `Ps1TownGrade.ts`
    lifts every lit town material once (after the palette pass, and in the
    sign-in preview before batching); it skips people, pictures, glow, unlit,
    vertex colours (ground/grass/props) and drive-in cars, and keeps saturated
    reds deep ("the red carpet should stay red"; the outdoor carpet has its own
    crimson, `ps1TownKeep`). `DayNightCycle` PS1: warm bounce, fill ×1.55, sun
    ×1.15, exposure ×1.16; the sky is toneMapped:false so it is unchanged.
    `Ps1Surfaces`: ceramic is square Showa mosaic, cleaner render, lighter means.
    Street props: `vendingMachine`, `cone`, `plantPot`, `vine`, placed last by
    `dressJapaneseStreet` so they give way to older props.
32. Camera holds its distance: `keepCameraOverGround` shortens only for the
    ground (min of floor and bare land), along the same line; walls never move
    it. The aim's lead is pulled back by the ground only. `CutawayLens.follow`
    is the third-person lens: inside a circle in view directions it discards
    what is nearer than the attendee, above their feet, outside a 0.72 keep
    radius round their body (dithered edge). Tests updated to the new contract.
33. Clipping sweep: `clip-tools/` (`probe.mjs` + `clip-sweep5.js` with
    `&nobatch` for names, `clip-shots.mjs` to photograph spots). The avatar is
    3.46 tall, hair to 3.9; body collider radius 0.6. Fixed: see section P.
    Temple colliders are built in the hall's own heights (buildOnGrade adds
    TEMPLE_GRADE). Remaining hits are grass, beach mats and stair treads ahead.
34. Pamphlet stand (PS1 look): `Ps1PamphletStand.ts`, faces from
    `../pamphlet-stand-20261111/build-faces.py` (Higgsfield covers, header in
    Yuanti TC Bold). Palace bulbs skip the fluted pilasters at x -45/-25.
35. Globe sea, redone (owner: "the globe's ocean pattern and texture still
    hasn't been updated"; an enlarged baked tile only blurred its lines). In the
    PS1 look the sign-in globe draws the caustic shader sea itself, opaque and
    unfaded, with `uNetScale` = `GLOBE_NET_SCALE` (6) so its cells read from
    orbit; during the flight it eases to 1 (`smoothstep(entry, .05, .7)`), and
    the baked sea returns under it only on landing, as in the world.

36. Round Q (2026-11-11): the PS1 preview never shows the baked sea (its own
    swell rose through the shader sea in dotted patches on landing); the net
    reaches world scale by `smoothstep(entry, .03, .4)`. Third person cuts
    nothing (owner: "nothing at all, players can rotate the camera"): the follow
    lens is removed; the camera still holds its distance. Jumps stop the head at
    the lowest collider underside overhead (`ceilingAbove`, AVATAR_HAIR_TOP
    3.62); tree crowns and the couple's canopy got overhead colliders. Ferry:
    `Ps1Ferry.ts` (+ hull stripe/strake/planked deck in IslandDock). Jukebox:
    `Ps1Jukebox.ts` (`ps1TownKeep`, walnut). Faces: `../ferry-jukebox-20261111/build-faces.py`
    (the marquee avoids a sun-and-rays motif: it reads as the Rising Sun flag).

37. Flight net size (owner: the net "would contract and become dense" in the
    loading animation): `uNetScale` = GLOBE_NET_SCALE × sqrt(camera height over
    the sea sphere ÷ the height where the flight began), clamped to [1, 6], set
    after the flight camera is placed; `uNetAnchor` = the planet centre (the
    point the flight heads for), so the net grows in place. On screen the cells
    only ever grow on the way down.

38. Flight net pinned (owner: "I don't want the ocean to rotate in the loading
    animation"): scaling one net about the moving planet centre made it flow.
    `ps1Net()` now draws it at power-of-two sizes, world-pinned, crossfading in
    the middle of each step; GLOBE_NET_SCALE is 8 so the idle globe shows one.
39. M.O.T.H coin door (owner: "the coin slot... looks like its tilting"): the
    recipe rotated the door by -atan(.076/.698) on a lower front that leans the
    other way. Fixed in Blender CLI on a copy (`.artifacts/moth-coin-fix-20261111/`:
    door +2α, slots/rims/returns/label +α about the door centre, custom normals
    turned with them), exported as before and compressed with the same meshopt
    QUANTIZE step; the door mesh's leftover object rotation is baked into its
    vertices. New sha256 8be47b4b…; purge jsDelivr for moth-arcade.glb after
    release. `MothArcade` now fits cabinets by exact geometry
    (`setFromObject(model, true)`): the turned box of a rotated mesh had padded
    the old fit by 1.2 cm at the back, which the wall clearance relied on.

40. One net (owner: the sea looks like "multiple layers overlapping"): the
    finer second net (p2, line2, `busy`) is gone from `ps1Net`; the warp and the
    calm patches keep it uneven. Checked against hiding the baked sea under it:
    that layer was not visible, so it stays as it was in the world.

41. Woodblock sea (owner: "more japanese aesthetic inspired", Great Wave print
    + 8-bit references; picks: woodblock as pixels, flowing lines + foam,
    woodblock colours all day, pattern only). `ps1Net(netPos, centre, lit)` in
    StylizedWater: rows of waves (`seaRow`, SEA_ROW 9) ringing `uSeaCentre`
    (the island's middle) and moving shoreward; per-row size noise; bands
    trough/slope/shoulder/foam (`seaBand`) with ragged claws; 1-texel ink
    outlines by comparing neighbour texels; engraved trough lines; spray; all on
    a 0.25 world-unit texel grid; detail fades by texel/row size on screen.
    Colours: day 1b3657/2f5f8a/efe6d0, night 0c1a2e/1d3b5e/ddd8c6. Phone cost
    +0.5 ms over the baked sea (lite-sea-cost.mjs), unchanged from the net.

42. 3D sea (owner: "too flat, please make it more 3D and has depth and volume,
    and the pattern should be more random"; picks: real waves + shading, waist
    height, scattered crossing, swimmers ride). `Ps1Waves.ts`: five crossing
    trains (one long lead swell), sharpened crests, slow group modulation, a
    bend; GLSL and CPU from the same table; PS1_WAVE_HEIGHT .8. Mesh:
    `seaAroundIslandWaves` (3-unit cells round the island, 15 beyond; ~90k
    triangles) with per-vertex `aSea` (wave amount, depth, openness).
    `ps1Net` now reads the waves: slope-lit bands, height contours, foam on
    crests, surf only where the seabed shelves (flat harbour floor flashed the
    whole mouth to foam: the "pale wedge" in the flight). Swimmers: `seaSurfaceAt`.
    Sign-in world: waves painted, not lifted (`uWaveLift` 0), GLOBE_NET_SCALE 2,
    no glare sheets, and the legacy `waveSurface` stays off on the island (it
    was re-shown every frame). Phone cost +0.9 ms over the baked sea.

43. Sea logic (owner: "messy, and lack of physical logic"; "weird dissolve";
    then "too dense, more white foam, the entry way looks weird"). Ps1Waves:
    a lead swell (64 units, travelling +z-ish), a second (41), chop (13-22)
    that fades by screen size; rollers keyed to depth (`ps1Rollers`, under
    four deep, only where the seabed shelves) lie parallel to every beach; the
    harbour (`open` 0 inside the walls, which end at z 106.4) is still, with
    curved ripples and wash round posts/ferry (`IslandDock.washSpots`,
    `uWashPosts`/`uWashBoat`). The cove's 4-deep channel takes the swell
    (`channel` term). Whitecaps h > .6. One size everywhere (uNetScale fixed
    1, no crossfade: the "dissolve"). Shoulder colour = mid + (mid - deep) * .9.

44. Clouds and stars (owner: "make the clouds 3D... real lighting reaction and
    shadings"; "stars more spread out randomly"). CoastalSky: `cloudPuffGeometry`
    (faceted icosahedron puffs, flat base, cooler vertex colour underneath),
    one MeshLambert material lit by the world's lights with an emissive from the
    sky's middle/horizon colour (night dims it, colour lerps to blue-grey). Ring
    of 16 (renderOrder -2, unbent, rides with the observer) + 7 overhead in world
    space (`overhead` group, dynamic, `planetNoSubdivide`), drifting and shrinking
    near the camera (`update(..., eye)`). Stars: seeded random on the upper sky,
    6 size/brightness sets, each twinkling. The old golden-angle spiral drew arcs.

45. Clouds, take two (owner: "I like the style and shape and alignments of the
    previous clouds better"; picks: old look made 3D, no overhead, keep stars).
    `cloudBlockGeometry(variant, width)`: the old 128x64 silhouette, read at
    4-texel blocks, extruded front/back with half-thickness from the block's
    distance to the outline (1-4 blocks), stepped sides only where thicker than
    the neighbour, front/back faces merged along rows. Old ring layout (4 x 5),
    one lit Lambert material with the sky-glow emissive. ~32k triangles.
    Owner approved 2026-11-12 ("Yes, keep them").

46. Pre-release clean-up and speed (2026-11-12; owner's picks in memory
    prerelease-cleanup-20261112):
    - Male avatar: `tools/lighten-glb.mjs` (meshoptimizer, index-only).
      121,710 -> 78,030 body triangles, 8.27 -> 7.19 MB. Hands, wrists, feet,
      neck, collar, swim-short hems and the tee are untouched (the tests pin
      their repairs).
    - Film look retired: `screenLook()` is gone, along with the PBR tiles,
      KTX2/basis, GpuTextureRuntime, the old pamphlet stand and jukebox, and
      the Voronoi water. EnvironmentMaterials now uses drawn tiles only.
    - Everything downloads on the sign-in page: `SignInDownloads` (bytes per
      preload) feeds `GateLoadMeter` (globe steps + bytes). An ENTER pressed
      before 100% is held. `AssetMirror.prefetchAsset` keeps the bytes and
      `fetchAsset` hands out copies. Pictures load through it too
      (`pictureTexture`).
    - The sign-in page is unchanged in look: the owner preferred the previous
      page.
    - In-world HUD restored as before (the owner, 2026-11-13). Kept: the chat
      stream moves like Twitch chat (slides in at the bottom, pushes up, the
      oldest slides off the top, three at a time) and each card fades ~12 s
      after it was written (`chat-stream-check.mjs`); the phone stick runs at its edge (no 跑 key
      or 移動 caption on phones). 動 takes 跑's slot beside 跳 and the keys
      sit snug round 拳 (~14px upright; sideways ~24px off 拳 and 10px
      between keys), with 聊天 just above. The desktop action grid keeps 跑.
    - Guest wish signatures refuse reserved names (client and service), and
      the service refuses them on /api/session and /api/session/recover.
    - Tools: `tools/upstash-key-report.mjs` (read-only database list) and
      `tools/pages-deployments.mjs` (records for `prune-published.mjs`).
    - Walkthrough: `walk-flows.mjs` passes 32/32 steps.
    - Second inspection (2026-11-13): `late-loads.mjs` records 0 asset
      downloads after ENTER on desktop and phone. Every Barlow Condensed and
      Inter weight is warmed at sign-in (`warmInterfaceFonts`, 10 s cap), and
      `releasePrefetchedAssets()` runs after `prepareAssets`. Removed the
      `?legacyDressing=1` path: WornArchitecture.ts, `warpWorldGeometry`,
      `massBuildings`, the kerbs and `?review=kerb`, the `wornWarp` flag, the
      brand-font loader, and `public/font/*` and `tools/subset-fonts.sh`.
      Signs letter in sans-serif as they always did in the normal game.
      Measured on a fresh 8797 (lingering test visitors cost phone frames):
      60 fps on both; heap after GC phone 183 MB, desktop 187 MB.
    - A busy world on phones (2026-11-13, `crowd-cost.mjs`: 0/5/10/19
      stand-ins in view, phone CPU x4): 60/44/35/27 -> 60/54/46/36 fps. Prints
      `forceSinglePass` (blended DoubleSide drew twice); `shareSkeletons` gives
      the male's seven pieces one Skeleton (the female's have different
      inverses and keep theirs); thigh bones cached in `supportImportedPose`;
      on phones `CROWD_FULL_RATE` = 6 nearest in view pose every frame and
      the rest every other frame (owner's pick). Desktop is 60 at 19.

47. Weather on everything, and in the whole isometric window (2026-11-13; the
    owner's picks: ferry snow that bobs, every cover keeps the ground dry,
    everything open to the sky, same density zoomed out):
    - Isometric snow and rain are laid across the camera's window
      (`FestivalWeather.isometricPrecipitation`): screen-placed, falling down
      the screen, wrapping off-screen; counts grow with the window up to
      1900/800 flakes and 1280/440 streaks (desktop/phone).
    - Snow registered on the restyle's pieces and older bare surfaces:
      `snowDetail()` (catches snow, `occludes: false`, no shelter), covers
      via `registerSnowSurface` (awnings, umbrellas, parasol, tiled blocks),
      street props through `Ps1PropHost.snowSurface` stand-ins, town nature
      through `CoastalScenery.snowOn`, and the ferry through
      `FestivalWeather.addMovingSurface` (child of the boat).
    - New builder options: `occludes` and `minimumArea` (dense GLBs keep
      faces over 0.03 m², `SNOW_DETAIL_FACE`).
    - Audit: `snow-audit.mjs` (open-to-sky tops with snow 47% -> 83%; the
      rest are under 6 m² each, or moving people and sea buoys). Captures:
      `weather-tour.mjs`; cost: `weather-cost.mjs` (no fps change).
    - Weather geometry after the planet pass 4.7 -> 8.4 MB live, one draw,
      shown only while snow lies. Fixture budgets raised to 2 MB / 6.5 MB.

48. Arcade snow out of the game picture (2026-11-13). The game is a web page
    laid over the 3D view, so snow on the control deck in front of the screen
    was cut through by it: about 2% of 逃脫我的美麗's screen height and 10% of
    M.O.T.H's (open as after its 11/16 release). Owner's pick: hide it while
    playing. Each cabinet's snow is now its own (`addMovingSurface`, the
    ferry's path, with the same options it had in the shared snow) and
    `setSurfaceHidden` puts it aside while that cabinet's game, or M.O.T.H's
    locked view (same camera), is open; the neighbour keeps its snow, and
    leaving brings it back. Check: `arcade-snow-check.mjs <label> [snow|clear]`
    (with the game page faded, counts snow-white rows inside the screen;
    `CONTROL=1` puts the snow back to show it catches it).

## Open

- Building reshapes (walls not moved yet).
- MY SQUARE stays open (no arch, no stalls).
- Concept: every building has a first pass. Gaps: the club's sawtooth sheds
  still show from high above; the shophouse has no arcade (7-unit storey).
- Gate sign: "MYSCHEDULE VIRTUAL FESTIVAL" is STAFF text in English; ask the
  owner whether the PS1 look should show a Chinese board, and its wording.
- Snow sources, colliders and seat fits are pinned by tests: re-run the
  weather/snow suites after any geometry change.
