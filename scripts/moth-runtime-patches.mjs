import assert from 'node:assert/strict';

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
  // Named after one chapter but drawn in others (found by drawing every fight,
  // hidden level and story entry with a probe on refs): the GANGAN coach chip in
  // every fight, dialogue portraits, the hotbar/chest icons, the Daytona at the
  // level 6 arrival and the HP-bottle notes of the level 6 boss. About 16 MB.
  const SHARED = new Set(['level1OfficeGanganCoachSheet', 'level1OfficeDialoguePortraitsSheet', 'level2BathroomPortraitsSheet',
    'level2BundleSheet', 'bonitaDialogueProfileSheet', 'level5BossDaytonaSheet', 'level3RhythmHpBottleNoteSheet']);
  function group(key) {
    if (SHARED.has(key) || /^level3RhythmUi/.test(key)) return 'common';
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
    let value = assignment.right.getText(tree);
    if (variables.has(value)) value = `await ${variables.get(value)}`;
    jobs.push({key, group:group(key), run:`this.refs.${key} = ${value};`});
  }
  // Definitions precede closures, but the registry must exist for secret jobs.
  const registry = `  createSceneAssetJobs() {\n    this.sceneAssetJobs = [];\n    ${definitions.join('\n    ')}\n    this.sceneAssetJobs.push(\n${jobs.map(job => `      {key:${JSON.stringify(job.key)}, group:${JSON.stringify(job.group)}, run:async () => {${job.run}}, release:() => {delete this.refs.${job.key};}}`).join(',\n')}\n    );\n    this.loadedSceneGroups = new Set();\n  }\n`;
  source = source.slice(0, start) + '      this.createSceneAssetJobs();\n' + source.slice(end);
  once('  async loadLayeredMapConfig() {', registry + RUNTIME_METHODS + '\n  async loadLayeredMapConfig() {');
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
  // Sound effects gate every fight, so they share the images' mirror path.
  once('      const response = await fetch(src);\n      if (!response.ok) throw new Error(src);\n      this.sfxRaw[name] = await response.arrayBuffer();', '      this.sfxRaw[name] = (await fetchGameAsset(src)).data.buffer;');
  // Music: a verified jsDelivr copy replaces a track's source only before its
  // first play, inside the tap that primes it, so iPhone's playback grant
  // attaches to the copy. Otherwise the track streams from this site as before.
  once('    if (this.rhythmTrackPriming.has(track)) return this.rhythmTrackPriming.get(track);\n    track.volume = 0;', '    if (this.rhythmTrackPriming.has(track)) return this.rhythmTrackPriming.get(track);\n    const mirrored = track.paused && this.mirroredAudioUrl(track.getAttribute("src"));\n    if (mirrored) track.src = mirrored;\n    track.volume = 0;');
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
    this.prefetchChapterAudio(groups);
    // A loading screen draws no outgoing scene artwork. Release it before
    // decoding the next chapter so mobile Safari does not hold the whole game.
    for (const group of this.loadedSceneGroups) {
      if (groups.includes(group)) continue;
      for (const job of this.sceneAssetJobs.filter(job => job.group === group)) job.release();
      this.loadedSceneGroups.delete(group);
    }
    const jobs = this.sceneAssetJobs.filter(job => groups.includes(job.group) && !this.loadedSceneGroups.has(job.group));
    this.sceneLoadProgress = {done:0, total:jobs.length};
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
    groups.forEach(group => this.loadedSceneGroups.add(group));
    this.sceneLoadProgress = null;
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

  // A track's mirror copy has to be ready before the tap that first plays it,
  // so it is fetched ahead: the first fight's music on the home screen, the
  // highlighted song or stage after 300 ms, the next track, and each
  // chapter's fight music while the chapter loads.
  prefetchMirroredAudio(src) {
    if (!MIRROR_BASE || !src || src.startsWith('blob:')) return;
    this.audioMirror ||= new Map();
    if (this.audioMirror.has(src)) return;
    const entry = {url: null, used: 0};
    this.audioMirror.set(src, entry);
    mirrorObjectUrl(src).then(url => {
      Object.assign(entry, {url, used: performance.now()});
      this.trimAudioMirror();
    });
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

  prefetchChapterAudio(groups) {
    const themes = {office: ['office'], level2: ['bathroom'], level3: ['massage'], level4: ['arcade'], studio: ['studio'], level5: ['river'], level6: ['concert', 'level6']};
    for (const group of groups) {
      for (const theme of themes[group] || [this.getSecretLevel(group)?.theme]) {
        if (theme) this.prefetchMirroredAudio(this.getRhythmAudioFor(theme)?.getAttribute('src'));
      }
    }
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
export const MOTH_MIRROR_ORIGIN = 'https://cdn.jsdelivr.net';

const IMAGE_LOADER = `const imageRequests = new Map();
// Images and sound effects come from the mirror only on the live site, and
// only when their bytes match the SHA-256 this site publishes. Code and
// configuration always come from this site.
const MIRROR_BASE = ['myscheduleltd.com', 'www.myscheduleltd.com'].includes(location.hostname)
  ? '${MOTH_MIRROR_ORIGIN}/gh/MyScheduleltd/myscheduleltd.github.io@${MOTH_MIRROR_COMMIT}/docs/moth/' : '';
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
    const expected = (await assetIntegrity)[decodeURIComponent(url.pathname.slice(MIRROR_ROOT.length))];
    if (!expected) return null;
    // One quick retry: jsDelivr can fail a file's first, uncached request.
    const source = MIRROR_BASE + url.pathname.slice(MIRROR_ROOT.length);
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

export function cssArtworkLoader(assets) {
  return `
// Deck artwork from styles.css (rewriteCssArtwork in moth-runtime-patches.mjs).
for (const [index, src] of ${JSON.stringify(assets)}.entries()) {
  fetchGameAsset(src)
    .then(({data, type}) => URL.createObjectURL(new Blob([data], {type: type.startsWith('image/') ? type : 'image/webp'})))
    .catch(() => new URL(src, document.baseURI).href)
    .then(url => document.documentElement.style.setProperty('--moth-art-' + index, 'url("' + url + '")'));
}
`;
}
