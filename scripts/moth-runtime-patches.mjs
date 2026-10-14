import assert from 'node:assert/strict';
import { patchScoreboard, SCOREBOARD_METHODS } from './moth-scoreboard-client.mjs';
import { patchFightResume, FIGHT_RESUME_METHODS } from './moth-fight-resume.mjs';
import { TRIMMED_JOBS } from './moth-asset-trim.mjs';
import { KEY_FRINGE_SPRITES } from './moth-sprite-fringe.mjs';
import { patchLyrics } from './moth-lyrics-patches.mjs';
import { patchMenuSfx, MENU_SFX_METHODS } from './moth-menu-sfx.mjs';
import { ADDED_ASSETS, MOTH_MIRROR_ADDITIONS_COMMIT } from './moth-asset-additions.mjs';

// Keep the selected published game as the input. Both audiences get identical
// loading/audio repairs before the public debug tools are stripped.
export function patchMothRuntime(source, ts) {
  const once = (before, after) => {
    assert.equal(source.split(before).length, 2, `Patch anchor: ${before.slice(0, 75)}`);
    source = source.replace(before, after);
  };
  const start = source.indexOf('      const bobbySpec = this.config.sprites.bobby;');
  const end = source.indexOf('      this.audio = new Audio(this.config.audioSrc);', start);
  assert(start > 0 && end > start);
  const block = source.slice(start, end);
  const tree = ts.createSourceFile('assets.js', `async function setup() {\n${block}\n}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const statements = tree.statements[0].body.statements;
  const definitions = [], jobs = [], variables = new Map();
  let trimmed = 0;
  // Named after one chapter but drawn in others (found by drawing every fight,
  // hidden level and story entry with a probe on refs): the GANGAN coach chip in
  // every fight, dialogue portraits, the hotbar/chest icons, the Daytona at the
  // level 6 arrival and the HP-bottle notes of the level 6 boss. About 16 MB.
  const SHARED = new Set(['level1OfficeGanganCoachSheet', 'level1OfficeDialoguePortraitsSheet', 'level2BathroomPortraitsSheet',
    'level2BundleSheet', 'bonitaDialogueProfileSheet']);
  function group(key) {
    if (SHARED.has(key)) return 'common';
    if (/^bobby/.test(key) || key === 'bobby') return 'player';
    if (/^level1Office/.test(key)) return 'office';
    if (/^(gangan|boss|levelMap|tutorialStage0Map|mapProps)/.test(key)) return 'road';
    if (/^(sewer|level2|mosquito)/.test(key)) return 'level2';
    if (/^level3/.test(key)) return 'level3';
    if (/^(level4|bonita)/.test(key)) return 'level4';
    if (/^level5Studio/.test(key)) return 'studio';
    if (/^level5/.test(key)) return 'level5';
    if (/^(level6|finale|endingAlbum)/.test(key)) return 'level6';
    if (/^homeMp3/.test(key)) return 'home';
    return 'common';
  }
  for (const statement of statements) {
    const text = statement.getText(tree);
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations[0];
      if (ts.isArrayBindingPattern(declaration.name)) {
        const calls = declaration.initializer.expression.arguments[0].elements;
        declaration.name.elements.forEach((element, index) => variables.set(element.name.getText(tree), calls[index].getText(tree)));
      } else definitions.push(text);
      continue;
    }
    if (text === 'this.loadHitSfx();') continue;
    if (text === 'this.refs.secretLevels = {};') continue;
    if (text.includes('(this.config.secretLevels || [])')) {
      // One job per image, so a hidden level's loading bar moves as each arrives.
      definitions.push(`this.refs.secretLevels = {};\nfor (const level of this.config.secretLevels || []) {\n  const entry = () => (this.refs.secretLevels[level.id] ||= {background: null, actors: []});\n  const release = () => {delete this.refs.secretLevels[level.id];};\n  this.sceneAssetJobs.push({key: 'secret:' + level.id, group: level.id, run: async () => {entry().background = await loadOptionalSheet(level.background.source);}, release});\n  level.actors.forEach((actor, index) => this.sceneAssetJobs.push({key: 'secret:' + level.id + ':' + index, group: level.id, run: async () => {entry().actors[index] = await loadOptionalSheet(actor.source);}, release}));\n}`);
      continue;
    }
    if (text.includes('["Bg", "DrBeauty", "Gangan", "Mic", "Console"]')) {
      for (const name of ['Bg','DrBeauty','Gangan','Mic','Console']) {
        const key = `level5Studio${name}Sheet`;
        jobs.push({key, group:'studio', run:`this.refs.${key} = await loadOptionalSheet(this.config?.sprites?.level5Studio${name}?.source);`});
      }
      continue;
    }
    assert(ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression), text);
    const assignment = statement.expression;
    const key = assignment.left.name?.text;
    assert(key, text);
    // Retired parts of the game are no longer loaded (moth-asset-trim.mjs).
    if (TRIMMED_JOBS.has(key)) { trimmed++; continue; }
    let value = assignment.right.getText(tree);
    if (variables.has(value)) value = `await ${variables.get(value)}`;
    jobs.push({key, group:group(key), run:`this.refs.${key} = ${value};`});
  }
  assert.equal(trimmed, TRIMMED_JOBS.size, 'Every retired job found');
  // Definitions precede closures, but the registry must exist for secret jobs.
  const registry = `  createSceneAssetJobs() {\n    this.sceneAssetJobs = [];\n    ${definitions.join('\n    ')}\n    this.sceneAssetJobs.push(\n${jobs.map(job => `      {key:${JSON.stringify(job.key)}, group:${JSON.stringify(job.group)}, run:async () => {${job.run}}, release:() => {delete this.refs.${job.key};}}`).join(',\n')}\n    );\n    this.loadedSceneGroups = new Set();\n  }\n`;
  source = source.slice(0, start) + '      this.createSceneAssetJobs();\n' + source.slice(end);
  once('  async loadLayeredMapConfig() {', registry + RUNTIME_METHODS + SCOREBOARD_METHODS + FIGHT_RESUME_METHODS + MENU_SFX_METHODS + '\n  async loadLayeredMapConfig() {');
  once('const response = await fetch("./data/level1.json", { cache: "no-store" });\n      this.config = await response.json();', 'this.config = await fetchGameJson("./data/level1.json");');
  once('const response = await fetch(source, { cache: "no-store" });\n    if (!response.ok) throw new Error(`Could not load layered map data: ${source}`);\n    const layeredMap = await response.json();', 'const layeredMap = await fetchGameJson(source);');
  once('this.loadError = error instanceof Error ? error.message : String(error);\n      this.state = "failure";', 'this.showLoadRecovery(error);');
  source = source.replace(/\.preload = "auto";/g, '.preload = "none";');
  once('    this.levelLoadingPresentation = { stageId, timer: 0, duration: 1.15, action, preparing: false };', '    const enterScene = action;\n    action = async () => { const loading = this.levelLoadingPresentation; await this.loadSceneAssets(stageId); if (this.levelLoadingPresentation === loading) return enterScene(); };\n    this.levelLoadingPresentation = { stageId, timer: 0, duration: 1.15, action, preparing: false };');
  source = source.replaceAll('finish(); this.reportLoopError(error);', 'if (this.levelLoadingPresentation !== loading) return; finish(); this.showLoadRecovery(error);');
  const guards = {
    startTutorialStage0:['level1-stage0','options'], startLevel:['level1-stage1','options'],
    enterSewerBossScene:['level2-stage2','options'], enterLevel3Stage1:['level3-stage1','options'],
    enterLevel4Stage1:['level4-stage1','options'], enterStudioDialogue:['studio-stage1','post'],
    enterLevel5Stage1:['level5-stage1',''], startLevel6Dream:['level6-stage1',''],
    startLevel6WakeUp:['finale-stage1',''], startFinaleEnding:['finale-stage1',''],
    enterLevel5BossFight:['level5-stage2','options'], enterLevel6Stage1:['level6-stage1','options'],
    enterFinaleStage:['finale-stage1','options'], enterLevel5Stage1Walk:['level5-stage1',''],
    startLevel2BathroomFight:['level2-stage2','options'], startLevel3MassageFight:['level3-stage2','options'],
    startLevel4ArcadeFight:['level4-stage1','options'], startStudioFight:['studio-stage1','options'],
    startLevel5RiverFight:['level5-stage2','options'], startLevel6ConcertFight:['level6-stage2','options']
  };
  const parsed = ts.createSourceFile('game.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const game = parsed.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'BobbyGame');
  const edits = [];
  for (const method of game.members) {
    const name = method.name?.getText(parsed);
    if (guards[name]) {
      const [id,args] = guards[name];
      edits.push({at:method.body.getStart(parsed)+1, text:`\n    if (this.deferSceneAssets(${JSON.stringify(id)}, () => this.${name}(${args}))) return;`});
    }
    if (name === 'startSecretRhythmFight') edits.push({at:method.body.getStart(parsed)+1,text:'\n    if (this.deferSceneAssets(stageId, () => this.startSecretRhythmFight(stageId, options))) return;'});
  }
  assert.equal(edits.length, Object.keys(guards).length + 1);
  for (const edit of edits.sort((a,b)=>b.at-a.at)) source = source.slice(0,edit.at)+edit.text+source.slice(edit.at);
  // Load-error confirmation is a refresh, never a jump into half-loaded play.
  once('    window.addEventListener("keydown", (event) => {\n      if (this.audioRecoveryVisible())', '    window.addEventListener("keydown", (event) => {\n      if (this.loadError) { if (["Enter", "Space", "KeyO"].includes(event.code) && !event.repeat) window.location.reload(); event.preventDefault(); return; }\n      if (this.audioRecoveryVisible())');
  once('  restart() {', '  restart() {\n    if (this.loadError) { window.location.reload(); return; }');
  once('  playHomePlaylistSong(songId) {', '  playHomePlaylistSong(songId) {\n    this.loadHomeWaveform(songId);');
  once('      await this.hitSfxReady;', '      await this.loadHitSfx();');
  once('  runSfxTest() {', '  runSfxTest() {\n    this.loadHitSfx();');
  once('this.musicAudioContext ||= new Context({ latencyHint: "interactive" });', 'this.musicAudioContext ||= this.ensureToneContext() || new Context({ latencyHint: "interactive" });');
  once('this.level1OfficeAudioContext ||= new AudioContextCtor({ latencyHint: "interactive" });', 'this.level1OfficeAudioContext ||= this.musicAudioContext || new AudioContextCtor({ latencyHint: "interactive" });\n      this.musicAudioContext ||= this.level1OfficeAudioContext;');
  once('    const old = this.level1OfficeAudioContext;\n    try {', '    const old = this.level1OfficeAudioContext;\n    if (old && old === this.musicAudioContext) this.rebuildMusicAudioContext();\n    try {');
  once('this.level1OfficeAudioContext = new AudioContextCtor({ latencyHint: "interactive" });', 'this.level1OfficeAudioContext = this.musicAudioContext || new AudioContextCtor({ latencyHint: "interactive" });\n    this.musicAudioContext ||= this.level1OfficeAudioContext;');
  const recoveryStart = source.indexOf('    if (reason !== "resume" || !this.audioInterruption?.fromHidden || document.hidden) {');
  const recoveryEnd = source.indexOf('    if (!this.audioRecoveryPrompt)', recoveryStart);
  assert(recoveryStart > 0 && recoveryEnd > recoveryStart);
  source = source.slice(0,recoveryStart) + '    if (document.hidden) return;\n    if (this.level1OfficeRhythm) this.level1OfficeRhythm.audioStartPending = true;\n' + source.slice(recoveryEnd);
  once('? this.tr("READY TO RESUME", "準備繼續遊戲") : this.tr("READY TO PLAY", "準備開始遊戲");', '? this.tr("READY TO RESUME", "準備繼續遊戲") : this.tr("ENABLE SOUND", "開啟音樂與音效");');
  once('root.querySelector("p").textContent = this.tr("Your progress and hearts are saved here.", "目前進度與生命已保留。");', 'root.querySelector("p").textContent = reason === "resume" ? this.tr("Your progress and hearts are saved here.", "目前進度與生命已保留。") : this.tr("Tap below to enable music and sound effects.", "點擊下方按鈕，開啟音樂與音效。");');
  once('? this.tr("TAP TO RESUME", "點一下，繼續遊戲") : this.tr("TAP TO START", "點一下，開始遊戲");', '? this.tr("TAP TO RESUME", "點一下，繼續遊戲") : this.tr("ENABLE SOUND", "開啟音效");');
  // Behind the refresh prompt the screen says only CONNECTION LOST; the
  // catch-all failure branch redrew the retired road chase and its HUD.
  once('  renderScene() {\n    this.renderFrame = (this.renderFrame || 0) + 1;\n', '  renderScene() {\n    this.renderFrame = (this.renderFrame || 0) + 1;\n    if (this.loadError) { this.renderConnectionLost(this.ctx, VIEW_W, VIEW_H); return; }\n');
  once('    target.fillStyle = "#08090d";\n    target.fillRect(0, 0, layout.width, layout.height);\n', '    target.fillStyle = "#08090d";\n    target.fillRect(0, 0, layout.width, layout.height);\n    if (this.loadError) { this.renderConnectionLost(target, layout.width, layout.height); return; }\n');
  once('    drawStageLoadingScreen(target, this.time, t,\n      `${this.tr("LOADING", "載入中")}', '    const progress = this.sceneLoadProgress;\n    const fraction = progress?.total ? progress.done / progress.total : t;\n    drawStageLoadingScreen(target, this.time, fraction,\n      `${this.tr("LOADING", "載入中")}');
  once('`${this.tr("LEVEL", "關卡")} ${level} · ${this.tr(...(places[level] || places[1]))}`, W, H);', '`${this.getSecretLevel(stageId) ? [this.tr("HIDDEN LEVEL", "隱藏關卡"), ...[{"secret-xiaosi": ["LOUNGE", "休息室"], "secret-getdown": ["GYM", "健身房"]}[stageId]].filter(Boolean).map(place => this.tr(...place))].join(" · ") : `${this.tr("LEVEL", "關卡")} ${level} · ${this.tr(...(places[level] || places[1]))}`}${progress?.total ? ` · ${progress.done}/${progress.total}` : ""}`, W, H);');
  // Sound effects gate every fight, so they share the images' mirror path
  // (prefetchHitSfx). The release fetched them once per visit: a sound that
  // failed to download stayed silent, and an engine rebuild before the first
  // fight (a minute idle, a locked phone) marked them loaded with none
  // fetched, so no fight had them (user, 2026-10-13). Now each call fetches
  // and decodes what is still missing.
  once(`  loadHitSfx() {
    if (this.hitSfxReady) return this.hitSfxReady;
    this.sfxBuffers = {};
    this.sfxRaw = {};
    const context = this.ensureToneContext();
    if (!context) return Promise.resolve();
    this.ensureFeedbackOutput(context);
    this.hitSfxReady = Promise.allSettled(Object.entries(HIT_SFX).map(async ([name, src]) => {
      const response = await fetch(src);
      if (!response.ok) throw new Error(src);
      this.sfxRaw[name] = await response.arrayBuffer();
      await this.decodeHitSfx(name, this.level1OfficeAudioContext);
    }));
    return this.hitSfxReady;
  }`, `  loadHitSfx() {
    this.sfxBuffers ||= {};
    if (Object.keys(HIT_SFX).every(name => this.sfxBuffers[name])) return Promise.resolve();
    if (this.hitSfxLoading) return this.hitSfxLoading;
    const context = this.ensureToneContext();
    if (!context) return Promise.resolve();
    this.ensureFeedbackOutput(context);
    const loading = this.hitSfxLoading = this.prefetchHitSfx()
      .then(() => Promise.allSettled(Object.keys(HIT_SFX).filter(name => !this.sfxBuffers[name])
        .map(name => this.decodeHitSfx(name, this.level1OfficeAudioContext))))
      .finally(() => { if (this.hitSfxLoading === loading) this.hitSfxLoading = null; });
    this.hitSfxReady = loading;
    return loading;
  }`);
  // A rebuilt engine decodes its own copies while the old ones keep playing
  // (an AudioBuffer is not tied to one engine), so taps are never silent.
  once('    this.sfxBuffers = {};\n    this.hitSfxReady = Promise.allSettled(Object.keys(this.sfxRaw || {}).map(name => this.decodeHitSfx(name, this.level1OfficeAudioContext)));', '    this.sfxBuffers ||= {};\n    this.hitSfxReady = Promise.allSettled(Object.keys(this.sfxRaw || {}).map(name => this.decodeHitSfx(name, this.level1OfficeAudioContext)));');
  // Between chapters the release shows its own LOADING card for a beat
  // (startSewerTransition); the chapter now downloads under that card, rather
  // than a second loading screen following it (user, 2026-10-13: level 4).
  once('    this.state = "sewerTransition";\n  }\n\n  updateSewerTransition(dt) {\n    this.sewerTransition.timer += dt;\n    if (this.sewerTransition.timer < this.sewerTransition.duration) return;', '    this.state = "sewerTransition";\n    this.loadTransitionScene(direction);\n  }\n\n  updateSewerTransition(dt) {\n    this.sewerTransition.timer += dt;\n    if (this.sewerTransition.timer < this.sewerTransition.duration || this.sewerTransition.loading) return;');
  once('    drawStageLoadingScreen(target, this.time, t,\n      direction === "level4"', '    const progress = transition.loading && this.sceneLoadProgress;\n    drawStageLoadingScreen(target, this.time, progress?.total ? Math.min(t, progress.done / progress.total) : t,\n      direction === "level4"');
  // A story fight follows its scene straight onto the arena, its count-in
  // card waiting there while the art decodes (as the bathroom already did),
  // instead of a loading screen after the talk (user, 2026-10-13: level 4).
  const preparing = '    const preparingRhythm = this.level1OfficeRhythm;\n    await this.primeRhythmSong(preparingRhythm, this.getActiveLevel1OfficeRhythmAudio());';
  assert.equal(source.split(preparing).length, 7, 'Six fights prepare the same way');
  source = source.replaceAll(preparing, '    const preparingRhythm = this.level1OfficeRhythm;\n    this.showFightWhilePreparing(preparingRhythm, options);\n    await this.primeRhythmSong(preparingRhythm, this.getActiveLevel1OfficeRhythmAudio());');
  once('    rhythm.skipAudio = Boolean(options.skipAudio);\n    await this.primeRhythmSong(rhythm, this.getActiveLevel1OfficeRhythmAudio());', '    rhythm.skipAudio = Boolean(options.skipAudio);\n    this.showFightWhilePreparing(rhythm, options);\n    await this.primeRhythmSong(rhythm, this.getActiveLevel1OfficeRhythmAudio());');
  once('  countInFightSong() {\n    const rhythm = this.level1OfficeRhythm;\n    if (!rhythm) return;', '  countInFightSong() {\n    const rhythm = this.level1OfficeRhythm;\n    if (!rhythm) return;\n    if (rhythm.countedInEarly) { rhythm.countedInEarly = false; return; }');
  // Music: a verified jsDelivr copy replaces a track's source only before its
  // first play, inside the tap that primes it, so iPhone's playback grant
  // attaches to the copy. A track already played takes its copy during a
  // loading screen instead (adoptSongCopy).
  once('    if (this.rhythmTrackPriming.has(track)) return this.rhythmTrackPriming.get(track);\n    track.volume = 0;', '    if (this.rhythmTrackPriming.has(track)) return this.rhythmTrackPriming.get(track);\n    const mirrored = track.paused && !this.musicAudioRoutes?.get(track) && this.mirroredAudioUrl(track.getAttribute("src"));\n    if (mirrored) track.src = mirrored;\n    track.volume = 0;');
  once('return window.localStorage?.getItem(LANGUAGE_KEY) === "zh-TW" ? "zh-TW" : "en";\n    } catch {\n      return "en";', 'return window.localStorage?.getItem(LANGUAGE_KEY) === "en" ? "en" : "zh-TW";\n    } catch {\n      return "zh-TW";');
  once('this.setLanguage(this.language || "en", { persist: false, announce: false });', 'this.setLanguage(this.language || "zh-TW", { persist: false, announce: false });');
  once('    let audio = this.homePlaylistAudioCache.get(song.id);\n    if (!audio || audio.getAttribute("src") !== song.audioSrc) {\n      audio = new Audio(song.audioSrc);', '    let audio = this.homePlaylistAudioCache.get(song.id);\n    const source = this.mirroredAudioUrl(song.audioSrc) || song.audioSrc;\n    if (!audio || audio.getAttribute("src") !== source) {\n      audio = new Audio(source);');
  once('  playHomePlaylistSong(songId) {\n    this.loadHomeWaveform(songId);', '  playHomePlaylistSong(songId) {\n    this.loadHomeWaveform(songId);\n    this.prefetchMirroredAudio(this.getHomePlaylistSongById(songId)?.audioSrc);');
  once('  renderTitle() {\n', '  renderTitle() {\n    this.prefetchTitleAudio();\n');
  // GANGAN's chip portrait: dressed for the level and kept inside the chip.
  once('    } else if (!zuxian && !bonita && sheet && spec) {\n      const frame = prompt.row * 2 + (Math.floor(motionTime * 7) % 2);\n      drawBundleFrame(target, sheet, spec, frame, chip.x + 31 * k, chip.y + chip.h - 2 * k, face, face, spec.anchor || { x: 0.5, y: 1 });\n    } else {', '    } else if (!zuxian && !bonita && this.drawCoachGanganFace(target, chip, k, prompt, motionTime)) {\n      // Drawn by drawCoachGanganFace.\n    } else {');
  // The pocket/forge shells and pocket icons are module-level Images that
  // fetched straight from Pages; they now take the verified mirror copy.
  const shells = source.match(/^(POCKET_SHELL_IMAGE|FORGE_SHELL_IMAGE|POCKET_ICON_IMAGE|POCKET_ICON_ACTIVE_IMAGE)\.src = ("[^"]+");$/gm) || [];
  assert.equal(shells.length, 4);
  source = source.replace(/^(POCKET_SHELL_IMAGE|FORGE_SHELL_IMAGE|POCKET_ICON_IMAGE|POCKET_ICON_ACTIVE_IMAGE)\.src = ("[^"]+");$/gm, 'mirrorImageSource($1, $2);');
  // The phone deck re-measures until two frames agree, then only when the
  // window size changes. iOS can settle the bottom safe area after a cold
  // launch without resizing, which left SPACE and the M O T H diamond where
  // the first frames put them. The inset is now part of the check, read from
  // a probe that stays in the page, and the first seconds re-validate.
  once('    const key = `${window.innerWidth}x${window.innerHeight}x${document.documentElement.style.getPropertyValue("--app-h")}`;\n    if (this.tallReserveKey === key || !this.mobileControls) return;\n    const probe = document.createElement("div");\n    probe.style.cssText = "position:fixed;left:0;width:1px;height:1px;top:var(--portrait-split);padding-bottom:env(safe-area-inset-bottom,0px)";\n    document.body.appendChild(probe);\n    const split = probe.getBoundingClientRect().top;\n    const safeBottom = probe.getBoundingClientRect().height - 1;\n    probe.remove();',
    '    if (!this.deckProbe?.isConnected) {\n      this.deckProbe = document.createElement("div");\n      this.deckProbe.setAttribute("aria-hidden", "true");\n      this.deckProbe.style.cssText = "position:fixed;left:0;width:1px;height:1px;top:var(--portrait-split);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none";\n      document.body.appendChild(this.deckProbe);\n    }\n    const probeBox = this.deckProbe.getBoundingClientRect();\n    const split = probeBox.top;\n    const safeBottom = probeBox.height - 1;\n    const now = performance.now();\n    this.deckFirstShown ||= this.mobileControls?.querySelector(\'[data-mobile-action="btn-o"]\')?.getBoundingClientRect().height > 0 ? now : 0;\n    const early = this.deckFirstShown && now - this.deckFirstShown < 8000 ? Math.floor((now - this.deckFirstShown) / 1000) : "";\n    const key = `${window.innerWidth}x${window.innerHeight}x${document.documentElement.style.getPropertyValue("--app-h")}x${Math.round(safeBottom)}x${early}`;\n    if (this.tallReserveKey === key || !this.mobileControls) return;');
  // Silent until reloaded after idling (owner, 2026-10-13; iPhone and desktop
  // Chrome; locked screen, other apps, a pause or a menu). The next tap or key
  // after such an idle rebuilds the audio engines, as a reload would.
  once('  primeAudioOnGesture() {\n    if (this.audioRecoveryVisible()) return;', '  primeAudioOnGesture() {\n    this.refreshStaleAudioEngine();\n    if (this.audioRecoveryVisible()) return;');
  once('  update(dt) {\n    if (document.hidden || this.audioInterruption || this.audioRecoveryVisible()) return;', '  update(dt) {\n    this.noteMusicActivity();\n    if (document.hidden || this.audioInterruption || this.audioRecoveryVisible()) return;');
  once('    window.addEventListener("pagehide", () => this.suspendGameAudio({ fromHidden: true }));', '    window.addEventListener("pagehide", () => this.suspendGameAudio({ fromHidden: true }));\n    const staleAudio = reason => () => { this.audioEngineStale ||= reason; };\n    document.addEventListener("visibilitychange", () => { if (document.hidden) staleAudio("hidden")(); });\n    window.addEventListener("pagehide", staleAudio("hidden"));\n    document.addEventListener("freeze", staleAudio("frozen"));\n    navigator.mediaDevices?.addEventListener?.("devicechange", staleAudio("device"));');
  // Windows Chrome flashed the whole page white/black (owner, 2026-10-13).
  // Both game canvases asked for a desynchronized (low-latency, compositor-
  // bypassing) context, which on Windows does not mix with the film-grain
  // layers blended on top. Windows draws through the compositor instead.
  once('const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });', 'const DESYNC_CANVAS = !/Windows/i.test(navigator.userAgentData?.platform || navigator.userAgent || "");\nconst ctx = canvas.getContext("2d", { alpha: false, desynchronized: DESYNC_CANVAS });');
  once('this.portraitCtx = element.getContext("2d", { alpha: false, desynchronized: true });', 'this.portraitCtx = element.getContext("2d", { alpha: false, desynchronized: DESYNC_CANVAS });');
  // Final scoreboard (scripts/moth-scoreboard-client.mjs).
  patchScoreboard(once);
  // Fights pick up where they stopped (scripts/moth-fight-resume.mjs).
  patchFightResume(once);
  // The owner's lyrics changes (scripts/moth-lyrics-patches.mjs).
  patchLyrics(once);
  // Menu sounds (scripts/moth-menu-sfx.mjs).
  patchMenuSfx(once);
  // A fight's song switches to its downloaded copy before it starts (useSongCopy),
  // waits under 載入中… if a stream runs dry, and judges nothing meanwhile.
  once('      track.pause();\n      this.audioFades = (this.audioFades || []).filter(fade => fade.audio !== track);\n      track.currentTime = this.getRhythmAudioStart();', '      track.pause();\n      this.useSongCopy(track);\n      this.audioFades = (this.audioFades || []).filter(fade => fade.audio !== track);\n      track.currentTime = this.getRhythmAudioStart();');
  once('      rhythm.audioPriming = null;\n      track.pause();\n      track.currentTime = this.getRhythmAudioStart();', '      rhythm.audioPriming = null;\n      track.pause();\n      this.useSongCopy(track);\n      track.currentTime = this.getRhythmAudioStart();');
  once('    this.renderLivesIndicator();\n    this.renderStageCountdown();\n', '    this.renderLivesIndicator();\n    this.renderStageCountdown();\n    this.renderSongStall();\n');
  once('this.playLevel1OfficeTone("hit", action, "stamp");\n    if (this.stageCountdown > 0) return true;\n', 'this.playLevel1OfficeTone("hit", action, "stamp");\n    if (this.stageCountdown > 0 || this.isFightSongStalled()) return true;\n');
  // Level 7's hype bar fills with every hit (owner, 2026-10-13): perfect 1,
  // good 0.6, a completed hold three times, as before, over the target share
  // (moth-chart-patches.mjs) of the whole song's total. It starts empty, is
  // full once the hits so far are enough for the win, which they then secure,
  // and a miss flashes its frame. At the song's end it decides exactly as
  // before: full when the weighted accuracy reached the target.
  once('    const progress = rhythm.songEnded ? 1 : clamp(this.getLevel1OfficeRenderTime() / this.getActiveRhythmDuration(), 0, 0.999);\n    const quality = clamp(performance.accuracy / performance.target, 0, 1);\n    rhythm.hype = clamp((crowd.start ?? 0.15) * (1 - progress) + quality * progress, 0, rhythm.songEnded ? 1 : 0.999);\n    const full = rhythm.hype >= 1 - 1e-9 && rhythm.songEnded;', '    rhythm.hype = clamp(performance.earned / Math.max(1e-9, performance.target * performance.total), 0, 1);\n    const full = rhythm.hype >= 1 - 1e-9;');
  once('    this.level1OfficeRhythm.hype = this.getActiveRhythmSpec().crowd?.start ?? 0.3;', '    this.level1OfficeRhythm.hype = 0;');
  once('    rhythm.hypePulse = kind === "miss" ? -1 : 1;', '    rhythm.hypePulse = kind === "miss" ? -1 : 1;\n    if (kind === "miss") rhythm.hypeMissAt = performance.now();');
  once('    target.strokeStyle = rhythm?.climax ? `rgba(255, 239, 99, ${0.6 + 0.4 * Math.sin(motionTime * 10)})` : "#f4f0dc";', '    const missFlash = performance.now() - (rhythm?.hypeMissAt ?? -1e9) < 320;\n    target.strokeStyle = missFlash ? "#ff4866" : rhythm?.climax ? `rgba(255, 239, 99, ${0.6 + 0.4 * Math.sin(motionTime * 10)})` : "#f4f0dc";');
  once('      : this.tr("FILL HYPE BY SONG END", "歌曲結束時熱度要滿");', '      : this.tr("FILL THE HYPE TO WIN", "熱度填滿就過關");');
  // The retired lane fight's music cut is no longer preloaded at start-up
  // (moth-asset-trim.mjs); its fight is not in the game.
  once('        ["concert", this.config.level6ConcertRhythm],\n        ["level6", this.config.level6?.stage2]\n', '        ["concert", this.config.level6ConcertRhythm]\n');
  // Level 3's sofa and level 7's stage were missing all fight on an iPhone
  // (owner, 2026-10-14). Phones draw a fight's backdrop once into a copy and
  // reuse it. Story fights show their arena under the count-in while the art
  // is still decoding, and a copy taken then can come out blank and stay blank
  // all fight; those two backdrops appear in no scene before their fight, so
  // they are first decoded there. Until the art is ready a backdrop is drawn
  // directly; a copy is kept only when it holds the picture
  // (backdropCopyHolds), and is taken again after the page comes back (iOS may
  // drop it while hidden).
  once('    let entry = this.rhythmBackdropCache.find(e => e.image === image && e.key === key);\n    if (!entry) {\n',
    '    if (!this.rhythmBackdropReset) {\n      this.rhythmBackdropReset = () => { if (!document.hidden) this.rhythmBackdropCache = []; };\n      document.addEventListener("visibilitychange", this.rhythmBackdropReset);\n    }\n    let entry = this.rhythmBackdropCache.find(e => e.image === image && e.key === key);\n    if (!entry) {\n      const rhythm = this.level1OfficeRhythm;\n      if ((rhythm?.graphicsLoading && !rhythm.graphicsWarming) || !(performance.now() >= (this.rhythmBackdropRetryAt || 0))) {\n        target.drawImage(image, ...args);\n        return;\n      }\n');
  once('      layer.drawImage(image, ...args);\n      entry = { image, key, slot, canvas: layer.canvas };\n',
    '      layer.drawImage(image, ...args);\n      if (!backdropCopyHolds(layer, args)) {\n        this.rhythmBackdropRetryAt = performance.now() + 250;\n        target.drawImage(image, ...args);\n        return;\n      }\n      entry = { image, key, slot, canvas: layer.canvas };\n');
  once('function makeLayer(width, height, painter) {', `// Five points of where a backdrop was drawn into its copy (the destination of
// a 4- or 8-number drawImage, inside the copy): its centre and towards each
// corner. Every fight backdrop is opaque, so a transparent point means the copy
// came out blank, or partly. A copy that cannot be read is trusted.
function backdropCopyHolds(layer, args) {
  const [x, y, w, h] = args.length >= 8 ? args.slice(4, 8) : args.slice(0, 4);
  const left = Math.max(0, x), top = Math.max(0, y);
  const right = Math.min(layer.canvas.width, x + w), bottom = Math.min(layer.canvas.height, y + h);
  if (right <= left || bottom <= top) return true;
  try {
    return [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].every(([fx, fy]) =>
      layer.getImageData(Math.floor(left + (right - left) * fx), Math.floor(top + (bottom - top) * fy), 1, 1).data[3] > 0);
  } catch {
    return true;
  }
}

function makeLayer(width, height, painter) {`);
  // An iPhone plays the start of a source changed after a track has played
  // past the game's volume control (adoptSongCopy). Any other such track (the
  // walking music changes song between chapters) starts its next play muted
  // for a quarter second, under the fade-in it starts with.
  once('    const fresh = audio.currentTime < 0.05 && audio.volume > 0 && !this.isBakedMusicTrack(audio);\n    const target = audio.volume;\n    if (fresh) audio.volume = 0;\n    const started = audio.play();\n',
    '    const fresh = audio.currentTime < 0.05 && audio.volume > 0 && !this.isBakedMusicTrack(audio);\n    const target = audio.volume;\n    if (fresh) audio.volume = 0;\n    const source = audio.getAttribute("src") || audio.src;\n    const newSource = Boolean(route?.playedSource) && route.playedSource !== source;\n    if (route) route.playedSource = source;\n    if (newSource) audio.muted = true;\n    const started = audio.play();\n    if (newSource) {\n      const unmute = () => { audio.muted = false; };\n      started?.then(() => setTimeout(unmute, 250), unmute) ?? unmute();\n    }\n');
  // iPhone Safari ignores a media element's volume and always reads it back
  // as 1. A level set before a track is first routed through its GainNode
  // (prepareMusicAudio) was lost there, so the silent priming play of a fight
  // song started at full volume until it paused: a burst of the song entering
  // level 4 (owner, 2026-10-14; its cut is the loudest at the start). Every
  // element now remembers the level it was given, as other browsers do.
  once('const STAGE_COUNTDOWN_SECONDS = 3.6;', `const STAGE_COUNTDOWN_SECONDS = 3.6;
{
  const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
  const asked = new WeakMap();
  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    configurable: true,
    enumerable: native.enumerable,
    get() { return asked.has(this) ? asked.get(this) : native.get.call(this); },
    set(value) { native.set.call(this, value); asked.set(this, Number(value)); }
  });
}`);
  // A fade sets a track's level once a frame, and each was a step of the gain.
  // When frames come slowly (a loading screen on an iPhone) the steps were
  // large enough to crackle (owner, 2026-10-14: entering level 4). A playing
  // track now glides to each level; a paused one takes it at once, so a
  // priming play still starts silent.
  once('          gain.gain.setValueAtTime(route.volume, context.currentTime);\n',
    '          const now = context.currentTime;\n          gain.gain.cancelScheduledValues(now);\n          if (audio.paused) gain.gain.setValueAtTime(route.volume, now);\n          else gain.gain.setTargetAtTime(route.volume, now, 0.015);\n');
  // Staff debug scene jumps (the staff build only; the public build drops the
  // debug panel). A jump enters its scene directly, so with the chapter loader
  // it drew placeholders where the scene's art was not loaded (user,
  // 2026-10-13: "L6 · After the river"); it now loads that chapter first.
  // "L4 After Win Talk" previews the talk without saving the win, so the door
  // stayed shut; that preview now counts Bonita as beaten until the next jump
  // or the title, so the room can be left into the next scene.
  once('  async debugJumpToStage(stageId) {\n', '  async debugJumpToStage(stageId) {\n    const scene = /^studio/.test(stageId) ? "studio-stage1" : stageId;\n    if (!this.sceneAssetsReady(scene)) {\n      this.startLevelLoading(scene, () => this.debugJumpToStage(stageId));\n      return;\n    }\n    this.debugLevel4Won = stageId === "level4-postboss-dialogue";\n');
  const won = 'this.progress?.flags?.level4BossDefeated';
  assert.equal(source.split(won).length, 3, 'Level 4 exit checks');
  source = source.replaceAll(won, '(this.progress?.flags?.level4BossDefeated || this.debugLevel4Won)');
  once('  returnToTitle() {\n    this.levelLoadingPresentation = null;\n', '  returnToTitle() {\n    this.levelLoadingPresentation = null;\n    this.debugLevel4Won = false;\n');
  const imageStart = source.indexOf('function loadImage(src) {');
  const imageEnd = source.indexOf('\nfunction loadOptionalSheet(src)', imageStart);
  assert(imageStart > 0 && imageEnd > imageStart);
  source = source.slice(0,imageStart) + IMAGE_LOADER + source.slice(imageEnd);
  return source;
}

const RUNTIME_METHODS = `
  sceneGroups(stageId) {
    if (this.getSecretLevel(stageId)) return ['common', 'player', stageId];
    if (stageId === 'level1-stage0') return ['common', 'player', 'road'];
    if (stageId === 'level1-stage1') return ['common', 'player', 'office'];
    if (stageId === 'studio-stage1') return ['common', 'player', 'studio'];
    if (/^level2/.test(stageId)) return ['common', 'player', 'level2'];
    if (/^level3/.test(stageId)) return ['common', 'player', 'level3'];
    if (/^level4/.test(stageId)) return ['common', 'player', 'level4'];
    if (/^level5/.test(stageId)) return ['common', 'player', 'level5'];
    return ['common', 'player', 'level6'];
  }

  sceneAssetsReady(stageId) {
    return this.sceneGroups(stageId).every(group => this.loadedSceneGroups?.has(group));
  }

  deferSceneAssets(stageId, action) {
    if (this.sceneAssetsReady(stageId)) return false;
    this.startLevelLoading(stageId, action);
    return true;
  }

  loadSceneAssets(stageId) {
    // Staff tools may change the target while a download is in flight. Finish
    // one batch before the next can write refs, and ignore cancelled entries.
    const ready = (this.sceneAssetQueue || Promise.resolve()).catch(() => {}).then(() => this.loadChapterAssets(stageId));
    this.sceneAssetQueue = ready;
    return ready;
  }

  async loadChapterAssets(stageId) {
    const groups = this.sceneGroups(stageId);
    // A loading screen draws no outgoing scene artwork. Release it before
    // decoding the next chapter so mobile Safari does not hold the whole game.
    for (const group of this.loadedSceneGroups) {
      if (groups.includes(group)) continue;
      for (const job of this.sceneAssetJobs.filter(job => job.group === group)) job.release();
      this.loadedSceneGroups.delete(group);
    }
    const jobs = this.sceneAssetJobs.filter(job => groups.includes(job.group) && !this.loadedSceneGroups.has(job.group));
    const songs = this.chapterSongs(groups).filter(src => !this.mirroredAudioUrl(src));
    this.sceneLoadProgress = {done:0, total:jobs.length + songs.length};
    const songsReady = Promise.all(songs.map(src => this.songCopy(src).then(() => { this.sceneLoadProgress && this.sceneLoadProgress.done++; })));
    let next = 0;
    let failure;
    await Promise.all(Array.from({length:Math.min(3, jobs.length)}, async () => {
      while (next < jobs.length) {
        if (failure) return;
        const job = jobs[next++];
        try { await job.run(); } catch (error) { failure = error; return; }
        this.sceneLoadProgress.done++;
      }
    }));
    if (failure) throw failure;
    await songsReady;
    await Promise.all(this.chapterTracks(groups).map(track => this.adoptSongCopy(track)));
    groups.forEach(group => this.loadedSceneGroups.add(group));
    this.sceneLoadProgress = null;
    this.prefetchHitSfx();
    // The next chapter's fight song, in the background.
    const following = {office: 'level2', level2: 'level3', level3: 'level4', level4: 'studio', studio: 'level5', level5: 'level6'};
    for (const group of groups) if (following[group]) this.chapterSongs([following[group]]).forEach(src => this.songCopy(src));
  }

  // The fight songs a chapter's fights play: their players, and their files.
  chapterTracks(groups) {
    const themes = {office: 'office', level2: 'bathroom', level3: 'massage', level4: 'arcade', studio: 'studio', level5: 'river', level6: 'concert'};
    return groups.map(group => themes[group] || this.getSecretLevel(group)?.theme).filter(Boolean)
      .map(theme => this.getRhythmAudioFor(theme)).filter(Boolean);
  }

  chapterSongs(groups) {
    return this.chapterTracks(groups).map(track => track.getAttribute('src')).filter(Boolean);
  }

  // The fights' sound files, fetched with the first chapter and again for any
  // that failed; loadHitSfx decodes them.
  prefetchHitSfx() {
    this.sfxRaw ||= {};
    if (this.hitSfxPrefetch) return this.hitSfxPrefetch;
    const missing = Object.keys(HIT_SFX).filter(name => !this.sfxRaw[name]);
    if (!missing.length) return Promise.resolve();
    const prefetch = this.hitSfxPrefetch = Promise.allSettled(missing.map(async name => {
      this.sfxRaw[name] ||= (await fetchGameAsset(HIT_SFX[name])).data.buffer;
    })).finally(() => { if (this.hitSfxPrefetch === prefetch) this.hitSfxPrefetch = null; });
    return prefetch;
  }

  // The chapter a LOADING card leads to (startSewerTransition) downloads
  // under it; the card holds until it has.
  loadTransitionScene(direction) {
    const stageId = { boss: 'level2-stage2', down: 'level2-stage2', level3: 'level3-stage1', level4: 'level4-stage1', level5: 'level5-stage1',
      level5Boss: 'level5-stage2', level6: 'level6-stage1', level6Boss: 'level6-stage2', finale: 'finale-stage1' }[direction];
    const transition = this.sewerTransition;
    if (!stageId || this.sceneAssetsReady(stageId)) return;
    transition.loading = true;
    this.loadSceneAssets(stageId).then(() => { transition.loading = false; }, error => {
      transition.loading = false;
      if (this.sewerTransition === transition && this.state === 'sewerTransition') this.showLoadRecovery(error);
    });
  }

  // Story fights reached from their scene (not free play, a rematch's loading
  // screen or a restored fight) show the arena under the count-in at once.
  // Level 1 is always entered through a loading screen, and may open with
  // its tutorial rather than a count.
  showFightWhilePreparing(rhythm, options = {}) {
    if (this.freePlay || options.deferSong || options.fromDialogue || this.levelLoadingPresentation || rhythm.countdownDuringGraphicsPreparation
      || rhythm.theme === 'office') return;
    rhythm.countdownDuringGraphicsPreparation = true;
    this.state = 'playing';
    this.updateMobileControls(true);
    this.countInFightSong();
    rhythm.countedInEarly = true;
  }

  showLoadRecovery(error) {
    console.warn('Scene resource loading failed:', error);
    this.loadError = String(error?.message || error);
    this.levelLoadingPresentation = null;
    this.state = 'failure';
    for (const track of this.getKnownBgmTracks?.() || []) track.pause();
    if (this.audioRecoveryPrompt) this.audioRecoveryPrompt.hidden = true;
    if (!this.loadRecoveryPrompt) {
      const root = document.createElement('div');
      root.className = 'audio-recovery load-recovery';
      root.setAttribute('role', 'alertdialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-labelledby', 'load-recovery-title');
      root.innerHTML = '<section><small>M.O.T.H · DR. BEAUTY</small><h2 id="load-recovery-title"></h2><p></p><button type="button"></button></section>';
      for (const type of ['pointerdown','pointerup','touchstart','touchend','click']) root.addEventListener(type, e => e.stopPropagation());
      root.querySelector('button').addEventListener('click', () => window.location.reload());
      document.body.append(root);
      this.loadRecoveryPrompt = root;
    }
    this.loadRecoveryPrompt.querySelector('h2').textContent = this.tr('CONNECTION LOST', '連線中斷');
    this.loadRecoveryPrompt.querySelector('p').textContent = this.tr('Please refresh this page to reload the game. Your saved progress is kept for this session.', '請重新整理網頁，重新載入遊戲。本次瀏覽的已儲存進度會保留。');
    this.loadRecoveryPrompt.querySelector('button').textContent = this.tr('REFRESH PAGE', '重新整理網頁');
    this.loadRecoveryPrompt.hidden = false;
    this.loadRecoveryPrompt.querySelector('button').focus();
  }

  // The loading screen's dark ground and scanlines, with the lose card's
  // outlined heading. The prompt covers the middle of the screen on desktop
  // and the lower half on a phone, so the words sit in the band above it.
  renderConnectionLost(target, W, H) {
    const tall = W < H;
    target.save();
    target.fillStyle = '#0d0f13';
    target.fillRect(0, 0, W, H);
    target.fillStyle = 'rgba(239, 227, 196, 0.022)';
    for (let y = 0; y < H; y += 7) target.fillRect(0, y, W, 1);
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    const title = fitCanvasText(target, this.tr('CONNECTION LOST', '連線中斷'), W - (tall ? 72 : 200), tall ? 60 : 72, 900, 28);
    drawOutlinedText(target, title.text, W / 2, Math.round(H * (tall ? 0.2 : 0.17)), {fill:'#f7f2de', shadow:'#05070d', outline:'#080b12', accent:'#ff4866', accentOffset:4});
    target.restore();
  }

  // A track's local copy (an object URL of the whole file) is fetched ahead:
  // the first fight's music on the home screen, the highlighted song or stage
  // after 300 ms, the next track, and the next chapter's fight music. Songs and
  // the home playlist take only the verified jsDelivr copy here.
  prefetchMirroredAudio(src) {
    if (MIRROR_BASE) this.songCopy(src, {mirrorOnly: true});
  }

  // A fight's song is downloaded whole before its fight (loadChapterAssets
  // waits for it): the mirror copy, or this site's file, so a weak connection
  // cannot stall the song mid-fight (user, 2026-10-13). Resolves to the copy's
  // URL, or null to stream.
  songCopy(src, {mirrorOnly = false} = {}) {
    if (!src || src.startsWith('blob:')) return Promise.resolve(null);
    this.audioMirror ||= new Map();
    const known = this.audioMirror.get(src);
    if (known?.url || (known && mirrorOnly)) return known.ready;
    // A whole-file request waits for a mirror-only fetch under way, then
    // falls back to this site's file if the mirror had no copy.
    if (known && !known.failed) return known.mirrorOnly ? known.ready.then(url => url || this.songCopy(src)) : known.ready;
    const entry = {url: null, used: 0, mirrorOnly};
    const copy = mirrorOnly ? mirrorObjectUrl(src)
      : fetchGameAsset(src).then(({data, type}) => URL.createObjectURL(new Blob([data], {type: type.startsWith('audio/') ? type : 'audio/mp4'})));
    entry.ready = copy.then(url => {
      Object.assign(entry, {url, used: performance.now(), failed: !url});
      this.trimAudioMirror();
      return url;
    }, () => { entry.failed = true; return null; });
    this.audioMirror.set(src, entry);
    return entry.ready;
  }

  // Before a song starts from the top (or resumes), a copy that arrived after
  // its first tap takes over from the stream, if the song has never played.
  // An iPhone plays the start of a changed source past the game's volume
  // control, so a song that has played keeps its source here: it took its
  // copy on the loading screen (adoptSongCopy) or streams.
  useSongCopy(track) {
    const src = track?.getAttribute('src');
    const copy = src && !src.startsWith('blob:') && this.mirroredAudioUrl(src);
    if (copy && track.paused && !this.musicAudioRoutes?.get(track)) track.src = copy;
  }

  // A fight song primed on its stream (the stage's own tap, before its copy
  // had downloaded) took the copy at its start after the count, and on an
  // iPhone that start burst out at full volume and cut off before the fade-in
  // (owner, 2026-10-14, every fight). It takes the copy here instead, while
  // the loading screen is up: the new source's first play happens now, muted
  // and at zero, and stops a moment later.
  async adoptSongCopy(track) {
    const src = track?.getAttribute('src');
    const copy = src && !src.startsWith('blob:') && this.mirroredAudioUrl(src);
    if (!copy || !track.paused) return;
    await this.rhythmTrackPriming?.get(track);
    const route = this.musicAudioRoutes?.get(track);
    if (!track.paused || track.getAttribute('src') !== src) return;
    if (!route) {
      track.src = copy;
      return;
    }
    const level = track.volume;
    track.volume = 0;
    track.muted = true;
    track.src = copy;
    try {
      await Promise.race([track.play(), new Promise((_, reject) => setTimeout(() => reject(new Error('Warm-up timed out')), 3000))]);
      await new Promise(resolve => setTimeout(resolve, 250));
    } catch {}
    track.pause();
    track.currentTime = 0;
    track.muted = false;
    track.volume = level;
    route.playedSource = copy;
  }

  // A stream that runs dry mid-song (no copy, weak connection): the fight's
  // clock follows the song, so it waits under 載入中… and goes on the moment
  // the song does. No note is judged meanwhile.
  isFightSongStalled() {
    const rhythm = this.level1OfficeRhythm;
    const track = this.getActiveLevel1OfficeRhythmAudio();
    const playing = this.state === 'playing' && rhythm && !rhythm.ending && !rhythm.skipAudio && rhythm.tutorial?.mode === 'done'
      && !(this.stageCountdown > 0) && track && !track.paused && !track.ended;
    if (!playing || track.readyState >= 3) { if (rhythm) rhythm.stalledSince = null; return false; }
    rhythm.stalledSince ??= performance.now();
    return true;
  }

  renderSongStall() {
    if (!this.isFightSongStalled() || performance.now() - this.level1OfficeRhythm.stalledSince < 300) return;
    const target = this.ctx;
    const centerX = VIEW_W / 2, centerY = PORTRAIT_FIGHT.scene.h / 2;
    const card = {x: centerX - 170, y: centerY - 62, w: 340, h: 124};
    target.save();
    target.fillStyle = 'rgba(4, 6, 12, 0.45)';
    target.fillRect(0, 0, VIEW_W, VIEW_H);
    target.fillStyle = 'rgba(2,6,14,0.65)';
    target.fillRect(card.x + 7, card.y + 8, card.w, card.h);
    target.fillStyle = '#efe3c4';
    target.fillRect(card.x, card.y, card.w, card.h);
    target.strokeStyle = '#292d28';
    target.lineWidth = 4;
    target.strokeRect(card.x + 2, card.y + 2, card.w - 4, card.h - 4);
    target.fillStyle = '#b64b36';
    target.fillRect(card.x + 18, card.y + 18, 5, 22);
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    target.fillStyle = '#292d28';
    const dots = '.'.repeat(1 + Math.floor(performance.now() / 400) % 3);
    drawFittedText(target, this.tr('LOADING', '載入中') + dots, centerX, centerY - 6, card.w - 60, 46, 900, 24);
    target.fillStyle = '#5d6a5f';
    drawFittedText(target, this.tr('The song is still downloading', '歌曲仍在下載'), centerX, centerY + 34, card.w - 60, 20, 700, 14);
    target.restore();
  }

  mirroredAudioUrl(src) {
    const entry = src && this.audioMirror?.get(src);
    if (!entry?.url) return null;
    entry.used = performance.now();
    return entry.url;
  }

  // An element still pointing at a copy keeps it alive; beyond eight idle
  // copies the oldest are released, and idle song players using one are
  // dropped so the next play rebuilds them.
  audioUsing(url) {
    const held = [...this.getKnownBgmTracks(), this.songPreview?.audio, this.pausedBgm?.audio, this.walkPause?.bgm,
      ...[this.audioInterruption, this.fullscreenGuideResume].flatMap(owner => (owner?.tracks || []).map(saved => saved.track))];
    const playing = [...(this.gameAudioRegistry || []), ...(this.homePlaylistAudioCache?.values() || [])].filter(track => !track.paused);
    return [...held, ...playing].some(track => track?.getAttribute('src') === url);
  }

  trimAudioMirror() {
    const idle = [...this.audioMirror].filter(([, entry]) => entry.url && !this.audioUsing(entry.url)).sort((a, b) => a[1].used - b[1].used);
    for (const [src, entry] of idle.slice(0, Math.max(0, idle.length - 8))) {
      for (const [id, track] of this.homePlaylistAudioCache || []) if (track.getAttribute('src') === entry.url) this.homePlaylistAudioCache.delete(id);
      for (const track of this.gameAudioRegistry || []) if (track.getAttribute('src') === entry.url) this.gameAudioRegistry.delete(track);
      URL.revokeObjectURL(entry.url);
      this.audioMirror.delete(src);
    }
  }

  stageTrackSource(stageId) {
    const theme = this.getSecretLevel(stageId)?.theme || {
      'level1-stage1': 'office', 'level2-stage2': 'bathroom', 'level3-stage2': 'massage',
      'level4-stage1': 'arcade', 'studio-stage1': 'studio', 'level5-stage2': 'river', 'level6-stage2': 'concert'
    }[stageId];
    return theme ? this.getRhythmAudioFor(theme)?.getAttribute('src') : null;
  }

  prefetchTitleAudio() {
    if (!MIRROR_BASE) return;
    const now = performance.now();
    this.titleAudioSince ||= now;
    if (now - this.titleAudioSince > 1500) this.prefetchMirroredAudio(this.stageTrackSource('level1-stage1'));
    const view = this.homeMenu?.view;
    let src = null;
    if (view === 'playlist' || view === 'stageSelect') {
      const item = this.getHomeMenuItems()[this.homeMenu.index || 0];
      if (item && !item.locked) src = view === 'playlist' ? item.audioSrc : this.stageTrackSource(item.id);
    } else if (view === 'playlistPlayer') {
      const list = this.getHomePlaylistSongDefs().filter(song => !song.locked);
      const at = list.findIndex(song => song.id === this.homeMenu.playerSongId);
      src = at < 0 ? null : list[(at + 1) % list.length]?.audioSrc;
    }
    if (src !== this.titleAudioFocus?.src) this.titleAudioFocus = {src, since: now};
    else if (src && now - this.titleAudioFocus.since > 300) this.prefetchMirroredAudio(src);
  }

  // GANGAN in the timing chip, as he looks in this level: the office chibi for
  // levels 1-2 (level 2's dialogue uses the office portraits), his beanie and
  // denim jacket by the river, his beanie and black tee at the concert decks.
  // Drawn 60 units tall in a 52-unit chip and unclipped, the chibi's cap stood
  // above the chip's border; every face now sits inside its portrait window.
  drawCoachGanganFace(target, chip, k, prompt, motionTime) {
    const sprites = this.config?.sprites || {};
    const office = this.refs.level1OfficeGanganCoachSheet, officeSpec = sprites.level1OfficeGanganCoach;
    const river = this.isRiverRhythm() && this.refs.level5DialoguePortraitsSheet && sprites.level5DialoguePortraits;
    const concert = this.isConcertRhythm() && this.refs.level6ConcertGanganSheet && sprites.level6ConcertGangan;
    if (!river && !concert && !(office && officeSpec)) return false;
    target.save();
    target.beginPath();
    target.rect(chip.x + 3 * k, chip.y + 3 * k, 56 * k, chip.h - 6 * k);
    target.clip();
    if (river) {
      const bob = Math.round(Math.sin(motionTime * 9) * k);
      drawBundleFrame(target, this.refs.level5DialoguePortraitsSheet, river, bundleFrameIndex(river, 'ganGan'), chip.x + 31 * k, chip.y + 2 * k + bob, 62 * k, 62 * k, {x: 0.5, y: 0});
    } else if (concert) {
      // His head and headphones from the DJ sprite: cheering, hyped or worried.
      const row = prompt.row === 2 ? 2 : prompt.row === 1 ? 1 : 3;
      const frame = row * concert.cols + (Math.floor(motionTime * 7) % 2);
      const sx = (frame % concert.cols) * concert.frameWidth + 62;
      const sy = Math.floor(frame / concert.cols) * concert.frameHeight + 34;
      target.imageSmoothingEnabled = false;
      target.drawImage(this.refs.level6ConcertGanganSheet, sx, sy, 110, 110, chip.x + 3 * k, chip.y + 3 * k, 56 * k, 56 * k);
    } else {
      const frame = prompt.row * 2 + (Math.floor(motionTime * 7) % 2);
      drawBundleFrame(target, office, officeSpec, frame, chip.x + 31 * k, chip.y + chip.h - 1 * k, 52 * k, 52 * k, officeSpec.anchor || {x: 0.5, y: 1});
    }
    target.restore();
    return true;
  }

  // The audio engine can come back from an idle "running" but silent, and
  // nothing rebuilt an engine in that state, so every later fight stayed
  // silent until a reload. After a hidden or frozen page, an output-device
  // change, or a minute without music, the next tap or key rebuilds both
  // engines (rebuildToneContext also rebuilds the shared music engine and
  // re-decodes the hit sounds) before anything plays. Music that is playing
  // goes through the existing recovery, which rebuilds and continues it from
  // its position inside this same gesture, as iPhone requires.
  refreshStaleAudioEngine() {
    const now = performance.now();
    const idle = Number.isFinite(this.lastMusicAt) && now - this.lastMusicAt > 60000;
    const reason = this.audioEngineStale || (idle ? 'idle' : null);
    if (!reason || !this.bootDone || document.hidden || this.audioRecovering || !this.level1OfficeAudioContext) return;
    this.audioEngineStale = null;
    this.lastMusicAt = now;
    // An interruption already rebuilds on this tap (primeAudioOnGesture).
    if (this.audioInterruption || this.audioRecoveryVisible()) return;
    this.audioEngineRefreshes = (this.audioEngineRefreshes || 0) + 1;
    this.lastAudioRefresh = reason;
    if (this.playingMusicTracks().length) {
      this.suspendGameAudio();
      this.recoverGameAudio();
    } else {
      this.rebuildToneContext();
    }
  }

  playingMusicTracks() {
    return [...new Set([...this.getKnownBgmTracks(), ...(this.gameAudioRegistry || []), this.songPreview?.audio].filter(Boolean))]
      .filter(track => !track.paused && !track.ended);
  }

  noteMusicActivity() {
    const now = performance.now();
    if (now - (this.musicActivityCheckedAt || 0) < 500) return;
    this.musicActivityCheckedAt = now;
    if (!Number.isFinite(this.lastMusicAt) || (!document.hidden && this.playingMusicTracks().length)) this.lastMusicAt = now;
  }

  loadHomeWaveform(songId) {
    const src = this.config?.sprites?.homeMp3Waveforms?.[songId]?.source;
    if (!src || this.refs.homeMp3WaveformSheets?.[songId]) return;
    loadOptionalSheet(src).then(image => {
      this.refs.homeMp3WaveformSheets ||= {};
      this.refs.homeMp3WaveformSheets[songId] = image;
      this.loadedSceneGroups.add('home');
    }).catch(() => {}); // The player's generated waveform remains available.
  }
`;

// GitHub Pages reaches Taiwan at about 50 KB/s per file, too slow for a 7 MB
// background; jsDelivr serves the same commit at about 2 MB/s. The pin is the
// merge that published these assets (PR #18): it never changes, so jsDelivr
// caches it forever and nothing needs purging. A later asset change simply
// fails its hash and falls back to Pages.
export const MOTH_MIRROR_COMMIT = '4a1cae2472c9fbece153cc1dbd0f0c1593dd9997';
// The sprites with their key fringe cleaned (moth-sprite-fringe.mjs) changed
// after that commit; jsDelivr serves them from the commit that published them,
// so every other file keeps its already-warm copy. Null: those load from Pages.
export const MOTH_MIRROR_PATCH_COMMIT = 'd04046c3aba8dcef69d486205a5267d53c998f31';
// Files jsDelivr serves from the commit that published them; everything else
// comes from MOTH_MIRROR_COMMIT. A group without its commit yet loads from
// this site.
export const MOTH_MIRROR_PINS = [
  { commit: MOTH_MIRROR_PATCH_COMMIT, files: KEY_FRINGE_SPRITES },
  { commit: MOTH_MIRROR_ADDITIONS_COMMIT, files: Object.keys(ADDED_ASSETS) }
];
export const mirrorPath = commit => `${MOTH_MIRROR_ORIGIN}/gh/MyScheduleltd/myscheduleltd.github.io@${commit}/docs/moth/`;
export const MOTH_MIRROR_ORIGIN = 'https://cdn.jsdelivr.net';

const IMAGE_LOADER = `const imageRequests = new Map();
// Images and sound effects come from the mirror only on the live site, and
// only when their bytes match the SHA-256 this site publishes. Code and
// configuration always come from this site.
const MIRROR_BASE = ['myscheduleltd.com', 'www.myscheduleltd.com'].includes(location.hostname)
  ? '${mirrorPath(MOTH_MIRROR_COMMIT)}' : '';
const MIRROR_PINNED = new Map(${JSON.stringify(MOTH_MIRROR_PINS.flatMap(pin => pin.files.map(file => [file, pin.commit ? mirrorPath(pin.commit) : ''])))});
const MIRROR_ROOT = '/moth/';
let assetIntegrity = null;

// A download is abandoned only when no bytes arrive for stallMs. A total time
// limit aborted large files that were still arriving on a slow connection.
async function fetchBytes(url, stallMs, init = {}) {
  const controller = new AbortController();
  let timer;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), stallMs); };
  arm();
  try {
    const response = await fetch(url, {...init, signal: controller.signal});
    if (!response.ok) throw new Error('Resource unavailable');
    const type = response.headers.get('content-type') || '';
    if (!response.body) return {data: new Uint8Array(await response.arrayBuffer()), type};
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    for (;;) {
      arm();
      const {done, value} = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    const data = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
    return {data, type};
  } catch (error) {
    throw controller.signal.aborted ? new Error('Download stalled') : error;
  } finally { clearTimeout(timer); }
}

async function retryFetch(url, stallMs, init) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const target = new URL(url, document.baseURI);
      if (attempt) target.searchParams.set('retry', String(Date.now()));
      return await fetchBytes(target.href, stallMs, init);
    } catch (error) { last = error; if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1))); }
  }
  throw last;
}

async function fetchGameJson(src) {
  const {data} = await retryFetch(src, 15000, {cache: 'no-store'});
  return JSON.parse(new TextDecoder().decode(data));
}

async function mirrorCopy(url) {
  if (!MIRROR_BASE || url.origin !== location.origin || !url.pathname.startsWith(MIRROR_ROOT)) return null;
  try {
    assetIntegrity ||= fetchGameJson('/moth/asset-integrity.json');
    const file = decodeURIComponent(url.pathname.slice(MIRROR_ROOT.length));
    const expected = (await assetIntegrity)[file];
    const base = MIRROR_BASE && (MIRROR_PINNED.has(file) ? MIRROR_PINNED.get(file) : MIRROR_BASE);
    if (!expected || !base) return null;
    // One quick retry: jsDelivr can fail a file's first, uncached request.
    const source = base + url.pathname.slice(MIRROR_ROOT.length);
    const asset = await fetchBytes(source, 10000).catch(() => new Promise(resolve => setTimeout(resolve, 400)).then(() => fetchBytes(source, 10000)));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', asset.data));
    const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    if (hex === expected) return asset;
    console.warn('Mirror copy rejected (hash mismatch):', url.pathname);
  } catch {} // Any mirror failure falls back to this site's copy.
  return null;
}

// Music: a verified mirror copy as a local object URL, or null to stream
// the file from this site.
async function mirrorObjectUrl(src) {
  const asset = await mirrorCopy(new URL(src, document.baseURI)).catch(() => null);
  return asset ? URL.createObjectURL(new Blob([asset.data], {type: asset.type.startsWith('audio/') ? asset.type : 'audio/mp4'})) : null;
}

async function fetchGameAsset(src) {
  const url = new URL(src, document.baseURI);
  return await mirrorCopy(url) || await retryFetch(url.href, 20000);
}

// An Image created at load time (device shells, pocket icons), given the
// verified mirror copy, or this site's file if both downloads fail.
function mirrorImageSource(image, src) {
  fetchGameAsset(src)
    .then(({data, type}) => URL.createObjectURL(new Blob([data], {type: type.startsWith('image/') ? type : 'image/webp'})))
    .catch(() => src)
    .then(url => { image.src = url; });
}

function loadImage(src) {
  if (imageRequests.has(src)) return imageRequests.get(src);
  BOOT_LOAD.started++;
  const promise = fetchGameAsset(src).then(({data, type}) => new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(new Blob([data], {type: type.startsWith('image/') ? type : 'image/webp'}));
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(blobUrl); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Image could not be decoded')); };
    image.src = blobUrl;
  })).finally(() => { BOOT_LOAD.settled++; imageRequests.delete(src); });
  imageRequests.set(src, promise);
  return promise;
}
`;

// styles.css draws the touch deck (D-pad, M/O/T/H, SPACE, FULLSCREEN), the
// grain and the start cap from images the browser fetched straight from GitHub
// Pages, at ~50 KB/s each from Taiwan: on 2026-10-13 the M/O/T/H buttons
// arrived after 17 s and the D-pad after 23 s. Each url() becomes a custom
// property that the game fills with the verified mirror copy.
export function rewriteCssArtwork(css) {
  const assets = [];
  const rewritten = css.replace(/url\("(assets\/[^"]+)"\)/g, (_, src) => {
    let index = assets.indexOf(src);
    if (index < 0) index = assets.push(src) - 1;
    return `var(--moth-art-${index})`;
  });
  return {css: rewritten, assets};
}

// The deck's M, T and H buttons take the colour of their notes on the track
// (MOTH_NOTE_COLOURS); O is already the track's grey. The sheet (columns M, O,
// T, H) has grey button faces, so only those mid-grey shades change, keeping
// their light and shade. The red base, the cream letter, the dark outline and
// the green glint are left alone. Approved by the owner on 2026-10-13.
export const TINT_MOTH_BUTTONS = `
async function tintMothButtons(blob) {
  const image = await createImageBitmap(blob);
  const canvas = Object.assign(document.createElement('canvas'), {width: image.width, height: image.height});
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(image, 0, 0);
  image.close?.();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data, width = canvas.width;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const targets = [rgb(MOTH_NOTE_COLOURS.M), null, rgb(MOTH_NOTE_COLOURS.T), rgb(MOTH_NOTE_COLOURS.H)];
  const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const face = luma(56, 61, 59);
  for (let i = 0; i < data.length; i += 4) {
    const target = targets[Math.floor((i / 4 % width) * 4 / width)];
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!target || data[i + 3] < 10 || Math.max(r, g, b) - Math.min(r, g, b) > 34) continue;
    const y = luma(r, g, b);
    if (y < 0.09 || y > 0.8) continue;
    const f = y / face, k = Math.min(1, (f - 1) * 0.55);
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(f <= 1 ? target[c] * f : target[c] + (255 - target[c]) * k);
  }
  context.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(out => out ? resolve(out) : reject(new Error('tint')), 'image/png'));
}
`;

export function cssArtworkLoader(assets) {
  return `
// Deck artwork from styles.css (rewriteCssArtwork in moth-runtime-patches.mjs).
${TINT_MOTH_BUTTONS}
for (const [index, src] of ${JSON.stringify(assets)}.entries()) {
  fetchGameAsset(src)
    .then(({data, type}) => new Blob([data], {type: type.startsWith('image/') ? type : 'image/webp'}))
    .then(blob => src.includes('/mobile_moth_buttons_') ? tintMothButtons(blob).catch(() => blob) : blob)
    .then(blob => URL.createObjectURL(blob))
    .catch(() => new URL(src, document.baseURI).href)
    .then(url => document.documentElement.style.setProperty('--moth-art-' + index, 'url("' + url + '")'));
}
`;
}
